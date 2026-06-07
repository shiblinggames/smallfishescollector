// Blackjack game logic — pure functions, no IO. Imported by the server
// actions (which own state + persistence) and indirectly by the client
// (via shared types). Encoding chosen so cards round-trip through JSONB
// cleanly: a card is a 2-character string `${rank}${suit}` where rank is
// one of A 2 3 4 5 6 7 8 9 T J Q K and suit is one of H D C S.
//
// House rules (locked in 2026-06-06):
//   - Dealer hits soft 17 (H17 — slightly more house-favorable than
//     S17; the more common modern-casino rule)
//   - Natural blackjack pays 3:2
//   - Regular win pays 1:1
//   - Push on tie
//   - Split: any pair, ONE split per hand (no re-splitting), no
//     double-after-split. Split aces get exactly one more card each
//     and are immediately stood.
//   - Double down: only on the initial two cards, exactly one more
//     card dealt, wager doubled
//   - Insurance: offered only when dealer's up card is an Ace; costs
//     half the original wager; pays 2:1 if dealer has natural BJ.
//   - Eight-deck shoe, reshuffled every hand (no card counting carry).

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K'
export type Suit = 'H' | 'D' | 'C' | 'S'

/** Encoded 2-char card. First char rank, second char suit. */
export type Card = string

export const RANKS: readonly Rank[] = ['A','2','3','4','5','6','7','8','9','T','J','Q','K']
export const SUITS: readonly Suit[] = ['H','D','C','S']

/** Number of standard 52-card decks shuffled together for the shoe.
 *  Higher = closer to real-casino feel, slightly worse for the player
 *  (more 10-value cards). Eight decks is the casino standard. */
export const DECK_COUNT = 8

export function cardRank(card: Card): Rank { return card.charAt(0) as Rank }
export function cardSuit(card: Card): Suit { return card.charAt(1) as Suit }

/** Build a fresh 8-deck shoe (416 cards) and shuffle in place. */
export function newShoe(): Card[] {
  const shoe: Card[] = []
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const r of RANKS) {
      for (const s of SUITS) {
        shoe.push(`${r}${s}`)
      }
    }
  }
  // Fisher-Yates shuffle. Server-only — using Math.random is fine for a
  // tavern minigame (not anti-cheat-critical; daily cap is the real
  // economic guardrail).
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]
  }
  return shoe
}

/** Pop the top card off the shoe (caller mutates the array). Throws
 *  defensively if the shoe is empty — should never happen with an
 *  8-deck reset every hand, but a corrupted state bug would surface
 *  here rather than silently dealing `undefined`. */
export function drawCard(shoe: Card[]): Card {
  const c = shoe.pop()
  if (!c) throw new Error('Shoe exhausted')
  return c
}

/** Value of a hand. Aces count as 11 unless that busts; then 1. Returns
 *  both the chosen total AND whether it's "soft" (an ace is still
 *  counting as 11) — soft matters for dealer hit-on-soft-17 if we ever
 *  change the rule. With our current "stand on all 17" rule it's
 *  cosmetic but cheap to track. */
export function handValue(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const c of cards) {
    const r = cardRank(c)
    if (r === 'A') { aces++; total += 11 }
    else if (r === 'K' || r === 'Q' || r === 'J' || r === 'T') total += 10
    else total += Number(r)
  }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return { total, soft: aces > 0 }
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21
}

/** Natural blackjack = exactly two cards summing to 21 (Ace + 10/J/Q/K).
 *  A 21-after-hit is not a natural and doesn't pay 3:2.
 *  Also: a split hand that hits 21 is NOT a natural blackjack — naturals
 *  are pre-split-only. Caller is responsible for that distinction. */
export function isNaturalBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21
}

/** Two cards of the same RANK (regardless of suit). T/J/Q/K are all
 *  rank-distinct here — TT can split but TJ cannot, matching the
 *  strict house rule (some casinos allow TJ; we don't). */
export function canSplit(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardRank(cards[0]) === cardRank(cards[1])
}

/** Dealer auto-play (H17 — hit soft 17). Keep drawing while the hand
 *  is under 17, OR exactly 17 with an active ace counting as 11.
 *  Stands on hard 17+ and on any 18+. Returns the final hand. */
export function dealerPlay(shoe: Card[], dealerCards: Card[]): Card[] {
  const hand = [...dealerCards]
  while (true) {
    const { total, soft } = handValue(hand)
    const shouldHit = total < 17 || (total === 17 && soft)
    if (!shouldHit) break
    hand.push(drawCard(shoe))
  }
  return hand
}

// ── Settlement ──────────────────────────────────────────────────────────

export type HandOutcome =
  | 'blackjack'    // natural BJ, dealer didn't tie → 3:2 payout
  | 'win'          // won straight up → 1:1
  | 'push'         // tie → wager refunded
  | 'lose'         // lost or busted → wager forfeited
  | 'surrender'    // (reserved — not in MVP rules)

export interface SettledHand {
  cards: Card[]
  wager: number          // doubled if double-down was used
  doubled: boolean
  total: number
  outcome: HandOutcome
  payout: number         // total returned to player (wager + winnings, or 0 if lost)
  net: number            // payout - wager (+ for win, 0 for push, - for lose)
}

/** Settle ONE player hand against the dealer's final total.
 *
 *  Naturals beat any drawn 21. A player split-21 is a regular win, not
 *  a blackjack — caller passes `isNatural` based on whether the hand
 *  was the pre-split deal AND has 2 cards summing to 21. */
export function settleHand(
  hand: { cards: Card[]; wager: number; doubled: boolean; isNatural: boolean },
  dealer: { cards: Card[]; total: number; bust: boolean; natural: boolean },
): SettledHand {
  const total = handValue(hand.cards).total
  const playerBust = total > 21

  let outcome: HandOutcome
  if (playerBust) outcome = 'lose'
  else if (hand.isNatural && dealer.natural) outcome = 'push'
  else if (hand.isNatural) outcome = 'blackjack'
  else if (dealer.natural) outcome = 'lose'
  else if (dealer.bust) outcome = 'win'
  else if (total > dealer.total) outcome = 'win'
  else if (total < dealer.total) outcome = 'lose'
  else outcome = 'push'

  let payout = 0
  if (outcome === 'blackjack') payout = Math.floor(hand.wager * 2.5)  // wager + 1.5x winnings
  else if (outcome === 'win')  payout = hand.wager * 2                // wager + 1x winnings
  else if (outcome === 'push') payout = hand.wager                    // wager refunded
  // lose: payout 0

  return {
    cards: hand.cards,
    wager: hand.wager,
    doubled: hand.doubled,
    total,
    outcome,
    payout,
    net: payout - hand.wager,
  }
}

/** Resolve insurance side-bet. Pays 2:1 if dealer has natural BJ. */
export function settleInsurance(
  insuranceAmount: number,
  dealerNatural: boolean,
): { paid: number; net: number; win: boolean } {
  if (insuranceAmount <= 0) return { paid: 0, net: 0, win: false }
  if (dealerNatural) {
    const paid = insuranceAmount * 3   // bet + 2x winnings
    return { paid, net: paid - insuranceAmount, win: true }
  }
  return { paid: 0, net: -insuranceAmount, win: false }
}
