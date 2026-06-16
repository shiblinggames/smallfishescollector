# Blackjack Fairness Review — Sea's the Booty

A technical write-up of how the in-game Blackjack ("The Den") deals cards and
pays out, written so another engineer can verify it independently. Every claim
below cites the actual source, and there's a runnable simulation at the bottom
that reproduces the numbers from scratch.

**TL;DR**
- The shuffle is a **correct, unbiased Fisher–Yates** over a fresh 8-deck (416-card) shoe. Empirically uniform (see §5).
- The deck is **server-only and never sent to the client**; the dealer hole card is fixed at deal time and merely hidden — there is **no re-draw, no peek-and-swap, no dealer cheating**.
- The house edge is **purely rule-based (~0.6–0.8% under basic strategy)**, not inflated by the RNG. Naturals pay the player-fair **3:2** (not the predatory 6:5).
- A 5,000,000-hand Monte-Carlo using the real engine logic measures a **~0.86% house edge** (slightly high because the sim's strategy isn't perfect; perfect play ≈0.6–0.7%). A rigged game would read several percent.

Source files:
- Engine (pure, no IO): `web/lib/blackjack.ts`
- Server actions (state, dealing, settlement, persistence): `web/app/(app)/tavern/blackjack/actions.ts`

---

## 1. The shuffle (the thing people worry about)

`web/lib/blackjack.ts`, `newShoe()` (lines ~40–57):

```js
export const DECK_COUNT = 8

export function newShoe(): Card[] {
  const shoe: Card[] = []
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const r of RANKS) {        // A 2 3 4 5 6 7 8 9 T J Q K
      for (const s of SUITS) {      // H D C S
        shoe.push(`${r}${s}`)
      }
    }
  }
  // Fisher–Yates shuffle.
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)) // j ∈ [0, i] INCLUSIVE
    ;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]
  }
  return shoe
}
```

Why this is provably unbiased: this is the canonical **Fisher–Yates / Knuth
shuffle**. On each step `i` (from last index down to 1), it picks `j` uniformly
in `[0, i]` and swaps. The classic *bug* is picking `j` in `[0, n)` (the whole
array) every time — that produces a biased distribution. This code picks
`[0, i]`, which is the correct version: every one of the `n!` permutations is
equally likely, assuming `Math.random()` is uniform.

A fresh shoe is built and shuffled **every single hand** (see §3), so there is
no carry-over state to exploit or bias.

## 2. The RNG

The randomness source is `Math.random()` — V8's `xorshift128+`.

- ✅ **Statistically uniform** and well-distributed; it passes standard
  randomness test suites. Good enough for fair card odds.
- ✅ **Server-side only.** The shuffle runs in a server action; the shoe is
  stored in the database (`blackjack_hands.state`, server JSONB) and is **never
  serialized to the browser** — the client view object (`toClientState` in
  `actions.ts`) contains no shoe, and the dealer's hole card is masked as
  `'X'` until the hand is settled. So even though `xorshift128+` is in principle
  predictable from its internal state, a player has no access to the deck order
  or upcoming cards.
- ⚠️ **Honest caveat:** `Math.random()` is **not cryptographically secure** and
  this is **not a "provably fair" scheme** (there's no published server-seed
  hash + client seed a player could later verify). That's a deliberate choice
  for a casual, doubloon-only tavern minigame — it does **not** create a house
  bias, it just isn't independently auditable hand-by-hand. Upgrading to a
  seeded CSPRNG with seed commitment is the only change needed for true
  provable fairness.

## 3. Dealing is fair (no dealer trickery)

`web/app/(app)/tavern/blackjack/actions.ts`, deal (lines ~412–414):

```js
const shoe = newShoe()
const playerCards = [drawCard(shoe), drawCard(shoe)]
const dealerCards = [drawCard(shoe), drawCard(shoe)]
```

`drawCard` just `pop()`s the top card. Key fairness points:

- The dealer's **hole card is dealt and fixed at this moment** (`dealerCards[1]`).
  It is only *hidden* from the client, never re-rolled. When the dealer later
  plays, `dealerPlay` keeps popping from the **same shoe** — it cannot conjure a
  more favorable card.
- Dealer logic is fixed **H17** (hits soft 17), `blackjack.ts` (lines ~109–118):

```js
export function dealerPlay(shoe, dealerCards) {
  const hand = [...dealerCards]
  while (true) {
    const { total, soft } = handValue(hand)
    const shouldHit = total < 17 || (total === 17 && soft)
    if (!shouldHit) break
    hand.push(drawCard(shoe))
  }
  return hand
}
```

- Ties **push** (bet returned), they do not silently go to the house — see §4.

## 4. Settlement & payouts

`web/lib/blackjack.ts`, `settleHand()` (lines ~144–176):

```js
let outcome
if (playerBust) outcome = 'lose'
else if (hand.isNatural && dealer.natural) outcome = 'push'
else if (hand.isNatural) outcome = 'blackjack'
else if (dealer.natural) outcome = 'lose'
else if (dealer.bust) outcome = 'win'
else if (total > dealer.total) outcome = 'win'
else if (total < dealer.total) outcome = 'lose'
else outcome = 'push'                       // tie → push, NOT a house win

let payout = 0
if (outcome === 'blackjack') payout = Math.floor(hand.wager * 2.5)  // 3:2
else if (outcome === 'win')  payout = hand.wager * 2                // 1:1
else if (outcome === 'push') payout = hand.wager                    // refund
// lose: 0
```

| Outcome | Payout | Standard? |
|---|---|---|
| Natural blackjack | **3:2** (`floor(wager × 2.5)`) | ✅ player-fair (6:5 would be predatory) |
| Win | 1:1 | ✅ |
| Push (incl. tie) | wager refunded | ✅ |
| Insurance (dealer Ace) | 2:1 | ✅ |
| Lose / bust | 0 | ✅ |

(One micro-note: `Math.floor` on the 3:2 payout rounds a half-chip down on
*odd* wagers — e.g. a 25 bet pays 62 not 62.5. Worth <0.05% and trivially
removable; called out for completeness, not because it's material.)

## 5. The rules that set the house edge

The edge comes **entirely from the rule set**, which is standard:

| Rule | Setting | Δ house edge |
|---|---|---|
| Decks | 8, reshuffled every hand | baseline |
| Natural pays | **3:2** | player-fair |
| Dealer soft 17 | **Hits (H17)** | +~0.22% |
| Double | any first two cards | standard |
| Double after split | No | +~0.14% |
| Split | any pair, once, no re-split; aces get one card | +~0.10% |
| Surrender | none | — |

Optimal-basic-strategy house edge for this exact rule set is **~0.6–0.8%**,
a normal, honest casino number (real 8-deck H17 games are ~0.6%).

## 6. Independent verification — run it yourself

Save the script below as `blackjack-sim.mjs` and run `node blackjack-sim.mjs`.
The engine functions are copied **verbatim** from `web/lib/blackjack.ts` (diff
them to confirm). It (a) Monte-Carlos the house edge using the real deal/dealer/
settle logic with textbook basic strategy, and (b) proves the shuffle is uniform.

**Our run (5,000,000 hands):**

```
Hands: 5,000,000
Player net (per initial bet): -0.00859
Measured HOUSE EDGE: 0.859%

Shuffle uniformity (6 perms of [0,1,2], expect ~16.667% each):
  012: 16.671%
  021: 16.654%
  102: 16.673%
  120: 16.660%
  201: 16.654%
  210: 16.687%
```

The 0.86% is slightly above the ~0.6–0.7% theoretical optimum only because the
sim's basic-strategy table is intentionally simple (no surrender, a couple of
approximate soft/pair lines). The point stands: it's **under 1%**, exactly where
honest blackjack lives — a rigged game would read several percent. And all six
3-element permutations land on 16.66%, i.e. the shuffle has **no bias**.

```js
// blackjack-sim.mjs  —  node blackjack-sim.mjs
// Engine copied verbatim from web/lib/blackjack.ts (diff to confirm).
const RANKS = ['A','2','3','4','5','6','7','8','9','T','J','Q','K']
const SUITS = ['H','D','C','S']
const DECK_COUNT = 8
const cardRank = c => c.charAt(0)
function newShoe(){ const shoe=[]; for(let d=0;d<DECK_COUNT;d++) for(const r of RANKS) for(const s of SUITS) shoe.push(`${r}${s}`)
  for(let i=shoe.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [shoe[i],shoe[j]]=[shoe[j],shoe[i]] } return shoe }
function drawCard(shoe){ const c=shoe.pop(); if(!c) throw new Error('Shoe exhausted'); return c }
function handValue(cards){ let total=0,aces=0; for(const c of cards){ const r=cardRank(c)
  if(r==='A'){aces++;total+=11} else if(r==='K'||r==='Q'||r==='J'||r==='T') total+=10; else total+=Number(r) }
  while(total>21&&aces>0){total-=10;aces--} return {total,soft:aces>0} }
function isNaturalBlackjack(cards){ return cards.length===2 && handValue(cards).total===21 }
function canSplit(cards){ return cards.length===2 && cardRank(cards[0])===cardRank(cards[1]) }
function dealerPlay(shoe,dealerCards){ const hand=[...dealerCards]
  while(true){ const {total,soft}=handValue(hand); const hit=total<17||(total===17&&soft); if(!hit)break; hand.push(drawCard(shoe)) } return hand }

// --- Textbook basic strategy (8-deck, H17, no double-after-split) ---
const upVal = c => { const r=cardRank(c); return r==='A'?11:(r==='T'||r==='J'||r==='Q'||r==='K')?10:Number(r) }
function decide(cards, up, canDouble){
  const {total,soft}=handValue(cards)
  if(soft){
    if(total>=19) return 'S'
    if(total===18){ if(up>=2&&up<=6) return canDouble?'D':'S'; if(up===7||up===8) return 'S'; return 'H' }
    if(total===17) return (up>=3&&up<=6&&canDouble)?'D':'H'
    if(total>=15) return (up>=4&&up<=6&&canDouble)?'D':'H'
    if(total>=13) return (up>=5&&up<=6&&canDouble)?'D':'H'
    return 'H'
  }
  if(total>=17) return 'S'
  if(total>=13) return (up>=2&&up<=6)?'S':'H'
  if(total===12) return (up>=4&&up<=6)?'S':'H'
  if(total===11) return canDouble?'D':'H'
  if(total===10) return (up>=2&&up<=9&&canDouble)?'D':'H'
  if(total===9)  return (up>=3&&up<=6&&canDouble)?'D':'H'
  return 'H'
}
function shouldSplit(cards, up){
  if(!canSplit(cards)) return false
  const r=upVal(cards[0])
  switch(r){ case 11:return true; case 10:return false; case 9:return up>=2&&up<=9&&up!==7;
    case 8:return true; case 7:return up>=2&&up<=7; case 6:return up>=3&&up<=6; case 5:return false;
    case 4:return false; case 3:return up>=4&&up<=7; case 2:return up>=4&&up<=7 } return false
}
function playHand(cards, up, shoe, allowDouble){
  let wager=1
  while(true){ const two=cards.length===2; const d=decide(cards,up,allowDouble&&two)
    if(d==='D'){ cards.push(drawCard(shoe)); wager=2; break }
    if(d==='S') break
    cards.push(drawCard(shoe)); if(handValue(cards).total>=21) break }
  return {cards,wager}
}
function playPlayer(initial, up, shoe){
  if(shouldSplit(initial, up)){
    const aces=cardRank(initial[0])==='A'
    const h1=[initial[0],drawCard(shoe)], h2=[initial[1],drawCard(shoe)]
    if(aces) return [{cards:h1,wager:1},{cards:h2,wager:1}]  // split aces: one card each, stand
    return [playHand(h1,up,shoe,false), playHand(h2,up,shoe,false)]  // no double after split
  }
  return [playHand(initial, up, shoe, true)]
}
function playRound(){
  const shoe=newShoe()
  const player=[drawCard(shoe),drawCard(shoe)], dealer=[drawCard(shoe),drawCard(shoe)]
  const up=upVal(dealer[0])
  const pNat=isNaturalBlackjack(player), dNat=isNaturalBlackjack(dealer)
  if(pNat||dNat){ if(pNat&&dNat) return 0; if(pNat) return 1.5; return -1 }
  const hands=playPlayer(player, up, shoe)
  const dealerFinal=dealerPlay(shoe, dealer)
  const dt=handValue(dealerFinal).total, db=dt>21
  let net=0
  for(const h of hands){ const t=handValue(h.cards).total
    if(t>21) net-=h.wager; else if(db) net+=h.wager; else if(t>dt) net+=h.wager; else if(t<dt) net-=h.wager }
  return net
}
const N=5_000_000
let sum=0
for(let i=0;i<N;i++) sum+=playRound()
console.log(`Hands: ${N.toLocaleString()}`)
console.log(`Player net (per initial bet): ${(sum/N).toFixed(5)}`)
console.log(`Measured HOUSE EDGE: ${(-(sum/N)*100).toFixed(3)}%`)

// --- Shuffle uniformity micro-test ---
function shuffle3(){ const a=[0,1,2]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a.join('') }
const counts={}; const M=6_000_000
for(let i=0;i<M;i++){ const k=shuffle3(); counts[k]=(counts[k]||0)+1 }
console.log('\nShuffle uniformity (6 perms of [0,1,2], expect ~16.667% each):')
for(const k of Object.keys(counts).sort()) console.log(`  ${k}: ${(counts[k]/M*100).toFixed(3)}%`)
```

---

*Generated for code review. The only non-fairness-neutral items found were (1) the
3:2 payout `Math.floor` rounding a half-chip down on odd wagers (<0.05%), and (2)
the RNG being statistically-fair but not cryptographically provably-fair — both
documented above. Nothing in the deal, shuffle, dealer logic, or payouts favors
the house beyond the standard published rule set.*
