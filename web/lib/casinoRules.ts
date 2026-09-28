// ── THE DEN'S RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// The three games at the Den (Blackjack, Fish Roulette, Fish Slots) and the
// one chip purse they share, as plain functions over plain inputs. The card
// maths (lib/blackjack) and the wheel (lib/roulette) were already pure; what
// moved here is what lived inline in the actions: the buy-in rule, the
// session bust-out, the slot machine's whole roll and pay table, the roulette
// bet slip, and the blackjack table's turns and settlement. Moved verbatim:
// no odds and no payout changed. The actions keep who is asking, the
// spend-first guards, the community jackpot (a shared pot is a database
// thing) and the writes. scripts/check-casino-rules.mts holds the rules.

import {
  SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PAIR_PAYOUTS, SLOT_BONUS_MULT, RL_MIN_BET, RL_MAX_STRAIGHT_BET, RL_MAX_OUTSIDE_BET,
  CASINO_BUY_IN_MIN, CASINO_BUY_IN_MAX, type SlotSymbolId,
} from '@/app/(app)/tavern/constants'
import { validateBet, type Bet } from '@/lib/roulette'
import {
  newShoe, drawCard, handValue, isBust, isNaturalBlackjack, canSplit,
  dealerPlay, settleHand, settleInsurance, cardRank,
  type Card, type SettledHand,
} from '@/lib/blackjack'
import { rngNext } from '@/lib/rng'
import { clockNow } from '@/lib/clock'

// ── The purse ───────────────────────────────────────────────────────────────

/** Where "today" starts for the daily buy-in cap: the UTC date. */
export const casinoDayStart = () => new Date(clockNow()).toISOString().split('T')[0]

/** A whole number of doubloons inside the table's buy-in range. */
export const buyInAmountOk = (amount: number) => Number.isInteger(amount) && amount >= CASINO_BUY_IN_MIN && amount <= CASINO_BUY_IN_MAX

/** Why a buy-in is refused, or null. The cap counts BUY-INS across all three
 *  games; chips on the table churn freely. */
export function buyInRefusal(amount: number, doubloons: number, dailyAlready: number, dailyCap: number): string | null {
  if (!buyInAmountOk(amount)) return 'Invalid amount'
  if (doubloons < amount) return 'Insufficient doubloons'
  if (dailyAlready + amount > dailyCap) return `Daily limit reached (${dailyCap.toLocaleString()} ⟡)`
  return null
}

/** After a round: the shared purse hitting 0 ends the casino session, which
 *  resets the shared buy-in tally and ALL per-game nets. */
export function afterRound(chipsAfter: number, prevNet: number, net: number, prevBuyIns: number): { busted: boolean; sessionNet: number; sessionBuyIns: number } {
  const busted = chipsAfter === 0
  return { busted, sessionNet: busted ? 0 : prevNet + net, sessionBuyIns: busted ? 0 : prevBuyIns }
}

// ── Fish Slots ──────────────────────────────────────────────────────────────

function slotWeightedRandom(): SlotSymbolId {
  const total = SLOT_SYMBOLS_LIST.reduce((s, sym) => s + sym.weight, 0)
  let r = rngNext() * total
  for (const sym of SLOT_SYMBOLS_LIST) {
    r -= sym.weight
    if (r <= 0) return sym.id
  }
  return SLOT_SYMBOLS_LIST[SLOT_SYMBOLS_LIST.length - 1].id
}

// The bonus round's own richer pool: base fish + the Jellyfish WILD, no hook.
function slotBonusWeightedRandom(): SlotSymbolId {
  const total = SLOT_SYMBOLS_LIST.reduce((s, sym) => s + sym.bonusWeight, 0)
  let r = rngNext() * total
  for (const sym of SLOT_SYMBOLS_LIST) {
    r -= sym.bonusWeight
    if (r <= 0) return sym.id
  }
  return SLOT_SYMBOLS_LIST[SLOT_SYMBOLS_LIST.length - 1].id
}

/** Best-paying bonus line with Jellyfish WILD substitution. The wild stands in
 *  for common/rare/shark/legendary (NEVER catfish). Enumerating every option
 *  and taking the max means 2 wilds + 1 fish pays the best line available.
 *  The caller applies the bonus boost (SLOT_BONUS_MULT). */
export function evalBonusLine(rs: SlotSymbolId[]): { symbol: SlotSymbolId; kind: 'triple' | 'pair'; mult: number } | null {
  const wilds = rs.filter(r => r === 'wild').length
  const nat = (s: SlotSymbolId) => rs.filter(r => r === s).length
  const opts: { symbol: SlotSymbolId; kind: 'triple' | 'pair'; mult: number }[] = []
  for (const s of ['common', 'rare', 'shark', 'legendary'] as const) {
    if (nat(s) + wilds === 3) opts.push({ symbol: s, kind: 'triple', mult: SLOT_PAYOUTS[s] })
  }
  if (nat('legendary') + wilds >= 2 && SLOT_PAIR_PAYOUTS.legendary) opts.push({ symbol: 'legendary', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.legendary })
  if (nat('shark') + wilds >= 2 && SLOT_PAIR_PAYOUTS.shark) opts.push({ symbol: 'shark', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.shark })
  if (nat('catfish') >= 2 && SLOT_PAIR_PAYOUTS.catfish) opts.push({ symbol: 'catfish', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.catfish })
  if (nat('rare') + wilds >= 2 && SLOT_PAIR_PAYOUTS.rare) opts.push({ symbol: 'rare', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.rare })
  if (opts.length === 0) return null
  return opts.reduce((best, o) => (o.mult > best.mult ? o : best))
}

/** An exactly-2 matching fish pair (the third reel can be anything, a single
 *  hook included), or null. */
export function pairSymbol(rs: SlotSymbolId[]): SlotSymbolId | null {
  const [x, y, z] = rs
  if (x === y && y === z) return null
  if (x === y && x !== 'anchor') return x
  if (x === z && x !== 'anchor') return x
  if (y === z && y !== 'anchor') return y
  return null
}

export type SlotOutcome = 'win' | 'jackpot' | 'lose' | 'bonus' | 'refund' | 'near_miss' | 'pair_win'
export type SlotBonus = { reels: SlotSymbolId[]; outcome: 'win' | 'jackpot' | 'pair' | 'lose'; payout: number; matchedSymbol?: SlotSymbolId }

/** Symbols an admin may force as the next spin's triple. */
export const SLOT_FORCEABLE: ReadonlySet<string> = new Set(['common', 'rare', 'legendary', 'catfish', 'anchor'])

/**
 * ONE PULL OF THE LEVER, minus the community pot.
 *
 * Three hooks is the charged bonus round: its own pool, the wild completes a
 * line, and every fish win pays SLOT_BONUS_MULT more on top of the refunded
 * stake. A natural three catfish (main reels or bonus) takes the community
 * jackpot, reported here as `jackpot` for the caller to claim, since the pot
 * is shared; an admin's catfish triple pays a normal big win instead and
 * leaves the pot alone. Two hooks refunds. A pair of marlin, whale or catfish
 * pays; a sardine pair is a near miss.
 */
export function rollSlots(wager: number, opts: { forced?: string | null; isAdmin?: boolean } = {}): {
  reels: SlotSymbolId[]
  isForced: boolean
  outcome: SlotOutcome
  /** Excludes any jackpot share, which the caller adds after claiming. */
  payout: number
  matchedSymbol?: SlotSymbolId
  bonus?: SlotBonus
  jackpot: 'main' | 'bonus' | null
} {
  const isAdmin = opts.isAdmin === true
  const forcedSym = opts.forced ?? null
  const isForced = forcedSym !== null && SLOT_FORCEABLE.has(forcedSym)
  const reels: SlotSymbolId[] = isForced
    ? [forcedSym as SlotSymbolId, forcedSym as SlotSymbolId, forcedSym as SlotSymbolId]
    : [slotWeightedRandom(), slotWeightedRandom(), slotWeightedRandom()]
  const [a, b, c] = reels
  const allSame = a === b && b === c
  const hookCount = reels.filter(r => r === 'anchor').length

  if (allSame && a === 'anchor') {
    const bonusReels = [slotBonusWeightedRandom(), slotBonusWeightedRandom(), slotBonusWeightedRandom()]
    const [ba, bb, bc] = bonusReels
    const bonusNaturalCatfish = ba === 'catfish' && bb === 'catfish' && bc === 'catfish'
    let bonus: SlotBonus
    if (bonusNaturalCatfish && !isAdmin) {
      return { reels, isForced, outcome: 'bonus', payout: wager, bonus: { reels: bonusReels, outcome: 'jackpot', payout: 0 }, jackpot: 'bonus' }
    } else if (bonusNaturalCatfish) {
      bonus = { reels: bonusReels, outcome: 'win', payout: Math.floor(wager * SLOT_PAYOUTS.legendary * SLOT_BONUS_MULT), matchedSymbol: 'catfish' }
    } else {
      const line = evalBonusLine(bonusReels)
      if (line && line.kind === 'triple') bonus = { reels: bonusReels, outcome: 'win', payout: Math.floor(wager * line.mult * SLOT_BONUS_MULT), matchedSymbol: line.symbol }
      else if (line && line.kind === 'pair') bonus = { reels: bonusReels, outcome: 'pair', payout: Math.floor(wager * line.mult * SLOT_BONUS_MULT), matchedSymbol: line.symbol }
      else bonus = { reels: bonusReels, outcome: 'lose', payout: 0 }
    }
    return { reels, isForced, outcome: 'bonus', payout: wager + bonus.payout, bonus, jackpot: null }
  }
  if (allSame && a === 'catfish' && !isAdmin) return { reels, isForced, outcome: 'jackpot', payout: 0, jackpot: 'main' }
  if (allSame && a === 'catfish') return { reels, isForced, outcome: 'win', payout: wager * SLOT_PAYOUTS.legendary, jackpot: null }
  if (allSame) return { reels, isForced, outcome: 'win', payout: wager * SLOT_PAYOUTS[a], jackpot: null }
  if (hookCount === 2) return { reels, isForced, outcome: 'refund', payout: wager, jackpot: null }
  const pair = pairSymbol(reels)
  if (pair && SLOT_PAIR_PAYOUTS[pair]) return { reels, isForced, outcome: 'pair_win', matchedSymbol: pair, payout: Math.floor(wager * SLOT_PAIR_PAYOUTS[pair]!), jackpot: null }
  if (pair === 'common') return { reels, isForced, outcome: 'near_miss', matchedSymbol: pair, payout: 0, jackpot: null }
  return { reels, isForced, outcome: 'lose', payout: 0, jackpot: null }
}

// ── Fish Roulette ───────────────────────────────────────────────────────────

const INSIDE: ReadonlySet<string> = new Set(['straight', 'split', 'street', 'corner', 'line'])

/** Why a bet slip is refused, or null. Inside bets share the straight cap,
 *  outside bets get the higher one, and the cap holds on each ZONE's total, so
 *  a crafted request cannot split one zone across duplicate bets. */
export function betSlipRefusal(bets: Bet[]): string | null {
  if (!Array.isArray(bets) || bets.length === 0) return 'Place at least one bet'
  if (bets.length > 50) return 'Too many bets'
  const zoneTotals = new Map<string, number>()
  for (const bet of bets) {
    const maxBet = INSIDE.has(bet.type) ? RL_MAX_STRAIGHT_BET : RL_MAX_OUTSIDE_BET
    const err = validateBet(bet, RL_MIN_BET, maxBet)
    if (err) return err
    const zone = `${bet.type}:${JSON.stringify(bet.target)}`
    const total = (zoneTotals.get(zone) ?? 0) + bet.amount
    if (total > maxBet) return `Each bet maxes out at ${maxBet.toLocaleString()} chips`
    zoneTotals.set(zone, total)
  }
  if (bets.reduce((sum, b) => sum + b.amount, 0) <= 0) return 'Invalid bet total'
  return null
}

// ── Blackjack: the table ────────────────────────────────────────────────────
//
// The table's state (blackjack_hands.state) and every move on it. Each move
// mutates the state in place, exactly as the actions did; the chips for a
// double, split or insurance are spent by the caller BEFORE the move.

export interface ServerHand {
  cards: Card[]
  wager: number
  doubled: boolean
  stood: boolean
  busted: boolean
  isNatural: boolean    // pre-split natural BJ (split-21 doesn't qualify)
  isSplit: boolean      // hand was created via split (used to block double-after-split)
}

export type Phase = 'insuranceOffered' | 'playerTurn' | 'settled'

export interface ServerState {
  shoe: Card[]
  hands: ServerHand[]
  activeHandIdx: number
  dealerCards: Card[]           // both cards stored; hole hidden from client view until reveal
  insuranceTaken: boolean
  insuranceAmount: number
  insuranceResolved: boolean
  phase: Phase
}

/** Skip hands already busted or stood; once all are done the dealer plays and
 *  the table settles. */
export function advanceTurn(state: ServerState): void {
  while (state.activeHandIdx < state.hands.length) {
    const h = state.hands[state.activeHandIdx]
    if (!h.busted && !h.stood) return
    state.activeHandIdx++
  }
  state.dealerCards = dealerPlay(state.shoe, state.dealerCards)
  state.phase = 'settled'
}

/** Stand every hand and settle WITHOUT the dealer drawing (naturals). */
function closeOnNaturals(state: ServerState): void {
  state.hands.forEach(h => { h.stood = true })
  state.activeHandIdx = state.hands.length
  state.phase = 'settled'
}

/** A fresh shoe, two and two. An Ace up offers insurance first; otherwise a
 *  natural on either side settles at once. */
export function dealTable(wager: number): ServerState {
  const shoe = newShoe()
  const playerCards = [drawCard(shoe), drawCard(shoe)]
  const dealerCards = [drawCard(shoe), drawCard(shoe)]
  const playerNatural = isNaturalBlackjack(playerCards)
  const state: ServerState = {
    shoe,
    hands: [{ cards: playerCards, wager, doubled: false, stood: playerNatural, busted: false, isNatural: playerNatural, isSplit: false }],
    activeHandIdx: 0,
    dealerCards,
    insuranceTaken: false,
    insuranceAmount: 0,
    insuranceResolved: false,
    phase: cardRank(dealerCards[0]) === 'A' ? 'insuranceOffered' : 'playerTurn',
  }
  if (state.phase === 'playerTurn' && (playerNatural || isNaturalBlackjack(dealerCards))) closeOnNaturals(state)
  return state
}

/** The orphan rule: a hand left mid-play (tab closed) auto-stands every
 *  unfinished hand, the dealer plays, and it settles. */
export function standAll(state: ServerState): void {
  state.hands.forEach(h => { if (!h.busted && !h.stood) h.stood = true })
  state.activeHandIdx = state.hands.length
  state.dealerCards = dealerPlay(state.shoe, state.dealerCards)
  state.phase = 'settled'
}

/** Insurance costs half the opening wager. */
export const insuranceCost = (initialWager: number) => Math.floor(initialWager / 2)

/** Answer the insurance offer (taken: `amount` already spent). A natural on
 *  either side then settles; otherwise play begins. */
export function answerInsurance(state: ServerState, amount: number | null): void {
  if (amount != null) { state.insuranceTaken = true; state.insuranceAmount = amount }
  state.insuranceResolved = true
  if (isNaturalBlackjack(state.dealerCards) || state.hands[0].isNatural) closeOnNaturals(state)
  else state.phase = 'playerTurn'
}

/** Why the active hand cannot act, or null. */
export function turnRefusal(state: ServerState): string | null {
  if (state.phase !== 'playerTurn') return 'Not your turn'
  const active = state.hands[state.activeHandIdx]
  if (!active || active.stood || active.busted) return 'Hand already done'
  return null
}

/** Hit: a card; bust, or auto-stand on 21 (the hand cannot improve). */
export function hitTable(state: ServerState): void {
  const active = state.hands[state.activeHandIdx]
  active.cards.push(drawCard(state.shoe))
  if (isBust(active.cards)) active.busted = true
  else if (handValue(active.cards).total === 21) active.stood = true
  advanceTurn(state)
}

export function standTable(state: ServerState): void {
  state.hands[state.activeHandIdx].stood = true
  advanceTurn(state)
}

/** Why the active hand cannot double, or null. House rule: no double after a split. */
export function doubleRefusal(state: ServerState): string | null {
  const t = turnRefusal(state)
  if (t) return t
  const active = state.hands[state.activeHandIdx]
  if (active.cards.length !== 2) return 'Can only double on initial two cards'
  if (active.isSplit) return 'No double after split (house rule)'
  return null
}

/** Double (the extra wager already spent): one card, and the hand ends. */
export function doubleTable(state: ServerState): void {
  const active = state.hands[state.activeHandIdx]
  active.wager *= 2
  active.doubled = true
  active.cards.push(drawCard(state.shoe))
  if (isBust(active.cards)) active.busted = true
  active.stood = true
  advanceTurn(state)
}

/** Why the table cannot split, or null. House rule: no re-splitting. */
export function splitRefusal(state: ServerState): string | null {
  if (state.phase !== 'playerTurn') return 'Not your turn'
  if (state.hands.length !== 1) return 'No re-splitting (house rule)'
  const active = state.hands[0]
  if (!active || active.cards.length !== 2 || !canSplit(active.cards)) return 'Cannot split'
  return null
}

/** Split (the second wager already spent): each hand takes one card and a
 *  fresh draw; split aces take one card and stand; a split 21 is no natural. */
export function splitTable(state: ServerState, initialWager: number): void {
  const active = state.hands[0]
  const [c1, c2] = active.cards
  const isAceSplit = cardRank(c1) === 'A'
  state.hands = [
    { cards: [c1, drawCard(state.shoe)], wager: active.wager, doubled: false, stood: isAceSplit, busted: false, isNatural: false, isSplit: true },
    { cards: [c2, drawCard(state.shoe)], wager: initialWager, doubled: false, stood: isAceSplit, busted: false, isNatural: false, isSplit: true },
  ]
  state.activeHandIdx = 0
  advanceTurn(state)
}

/** Every hand against the dealer's final cards, and insurance. Wagers were
 *  taken as they were placed, so the round's net is what comes back less the
 *  total wagered. */
export function settleTable(state: ServerState, totalWagered: number) {
  const dealerFinal = state.dealerCards
  const dealerTotal = handValue(dealerFinal).total
  const dealerBust = dealerTotal > 21
  const dealerNatural = isNaturalBlackjack(dealerFinal)
  const settled: SettledHand[] = state.hands.map(h => settleHand(
    { cards: h.cards, wager: h.wager, doubled: h.doubled, isNatural: h.isNatural },
    { cards: dealerFinal, total: dealerTotal, bust: dealerBust, natural: dealerNatural },
  ))
  const insurance = settleInsurance(state.insuranceAmount, dealerNatural)
  const totalReturned = settled.reduce((sum, h) => sum + h.payout, 0) + insurance.paid
  return { settled, dealerFinal, dealerTotal, dealerBust, dealerNatural, insurance, totalReturned, netDelta: totalReturned - totalWagered }
}

/** The badge streaks: a winning round extends the win streak (a loss resets
 *  it, a push leaves it); the dealer's natural extends its own run. */
export function nextStreaks(netDelta: number, dealerNatural: boolean, prevWin: number, prevDealerBj: number): { win: number; dealerBj: number } {
  return { win: netDelta > 0 ? prevWin + 1 : netDelta < 0 ? 0 : prevWin, dealerBj: dealerNatural ? prevDealerBj + 1 : 0 }
}
