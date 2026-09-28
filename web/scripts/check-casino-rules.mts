// THE DEN PAYS WHAT THE GAME PROMISES (Steam prep, Phase B).
//
// Runs lib/casinoRules:
//   - the same seed pulls the same slots and deals the same blackjack;
//   - forced triples land as the admin rig promises, a natural three catfish
//     claims the community pot (an admin's does not), two hooks refund, the
//     wild completes lines but never a catfish line, a sardine pair is a miss;
//   - over many pulls the base game keeps a house edge (the jackpot feed is
//     paid on top of this, from the pot);
//   - a roulette slip cannot dodge the cap by splitting a zone;
//   - the buy-in rule and the session bust-out;
//   - blackjack: naturals settle on the deal, double doubles and ends the
//     hand, split aces stand, no re-split or double after split, a round's net
//     is what came back less what was wagered, and every hand ends settled.
//
//   npx tsx scripts/check-casino-rules.mts

import {
  rollSlots, evalBonusLine, pairSymbol, betSlipRefusal, buyInRefusal, afterRound,
  dealTable, standAll, answerInsurance, turnRefusal, hitTable, standTable, doubleRefusal, doubleTable,
  splitRefusal, splitTable, settleTable, nextStreaks, type ServerState,
} from '../lib/casinoRules'
import { SLOT_PAYOUTS, SLOT_BONUS_MULT, CASINO_BUY_IN_MIN, RL_MAX_STRAIGHT_BET } from '../app/(app)/tavern/constants'
import { handValue } from '../lib/blackjack'
import { withRng, mulberry32 } from '../lib/rng'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

// ── Slots ──
const a = withRng(mulberry32(111), () => JSON.stringify(Array.from({ length: 200 }, () => rollSlots(100))))
const b = withRng(mulberry32(111), () => JSON.stringify(Array.from({ length: 200 }, () => rollSlots(100))))
if (a !== b) fail('the same seed pulled different reels')

const forced = (sym: string, isAdmin = false) => withRng(mulberry32(113), () => rollSlots(100, { forced: sym, isAdmin }))
if (forced('catfish').jackpot !== 'main' || forced('catfish').payout !== 0) fail('a natural three catfish did not claim the pot')
if (forced('catfish', true).jackpot !== null || forced('catfish', true).payout !== 100 * SLOT_PAYOUTS.legendary) fail("an admin's catfish triple touched the pot")
if (forced('legendary').payout !== 100 * SLOT_PAYOUTS.legendary) fail('three whales did not pay the whale line')
if (forced('anchor').outcome !== 'bonus' || forced('anchor').payout < 100) fail('three hooks did not open the bonus round with the stake back')
if (forced('wild').isForced) fail('the wild could be forced')
if (evalBonusLine(['wild', 'wild', 'legendary'])?.mult !== SLOT_PAYOUTS.legendary) fail('two wilds and a whale did not pay the whale line')
if (evalBonusLine(['wild', 'wild', 'catfish'])?.kind === 'triple') fail('the wild completed a catfish line')
if (pairSymbol(['anchor', 'anchor', 'rare']) !== null) fail('two hooks counted as a pair')
if (pairSymbol(['rare', 'anchor', 'rare']) !== 'rare') fail('a split pair was missed')

withRng(mulberry32(115), () => {
  const N = 400_000
  let back = 0, pots = 0, refunds = 0
  for (let k = 0; k < N; k++) {
    const r = rollSlots(100)
    if (r.payout < 0) { fail('a pull paid a negative amount'); break }
    if (r.jackpot) pots++
    if (r.outcome === 'refund') { refunds++; if (r.payout !== 100) fail('a refund did not return the stake') }
    if (r.bonus && r.bonus.outcome !== 'jackpot' && r.payout !== 100 + r.bonus.payout) fail('a bonus round did not pay stake plus its line')
    if (r.bonus?.outcome === 'win' && r.bonus.matchedSymbol !== 'catfish'
        && r.bonus.payout !== Math.floor(100 * SLOT_PAYOUTS[r.bonus.matchedSymbol!] * SLOT_BONUS_MULT)) {
      fail('a bonus line was not boosted by SLOT_BONUS_MULT'); break
    }
    back += r.payout
  }
  const rtp = back / (N * 100)
  if (!(rtp > 0.7 && rtp < 1)) fail(`the base game returns ${(rtp * 100).toFixed(1)}%, outside a house edge`)
  if (pots === 0 || refunds === 0) fail('the pot or the refund never landed, so the check tests nothing')
  console.log(`  slots: base game returns ${(rtp * 100).toFixed(1)}% before the community pot; pot hit 1 in ${Math.round(N / Math.max(1, pots))}`)
})

// ── Roulette ──
const bet = (amount: number, target: number = 17) => ({ type: 'straight' as const, target, amount })
if (betSlipRefusal([]) === null) fail('an empty slip was taken')
if (betSlipRefusal(Array.from({ length: 51 }, () => bet(10))) === null) fail('a 51-bet slip was taken')
if (betSlipRefusal([bet(RL_MAX_STRAIGHT_BET)]) !== null) fail('a bet at the cap was refused')
if (betSlipRefusal([bet(RL_MAX_STRAIGHT_BET), bet(10)]) === null) fail('a zone split across two bets passed the cap')
if (betSlipRefusal([bet(RL_MAX_STRAIGHT_BET), bet(RL_MAX_STRAIGHT_BET, 18)]) !== null) fail('two zones at the cap were refused')

// ── The purse ──
if (buyInRefusal(CASINO_BUY_IN_MIN - 1, 1e9, 0, 1e9) !== 'Invalid amount') fail('a buy-in under the minimum was taken')
if (buyInRefusal(100.5, 1e9, 0, 1e9) !== 'Invalid amount') fail('a fractional buy-in was taken')
if (buyInRefusal(100, 99, 0, 1e9) !== 'Insufficient doubloons') fail('a buy-in beyond the purse was taken')
if (!buyInRefusal(100, 1e9, 1950, 2000)?.startsWith('Daily limit')) fail('the daily cap did not hold')
if (buyInRefusal(50, 1e9, 1950, 2000) !== null) fail('a buy-in exactly to the cap was refused')
const bust = afterRound(0, 300, -500, 1000)
if (!bust.busted || bust.sessionNet !== 0 || bust.sessionBuyIns !== 0) fail('an empty purse did not end the session')
if (afterRound(10, 300, -50, 1000).sessionNet !== 250) fail('a round did not add to the session net')

// ── Blackjack ──
const dealA = withRng(mulberry32(117), () => JSON.stringify(Array.from({ length: 50 }, () => dealTable(100))))
const dealB = withRng(mulberry32(117), () => JSON.stringify(Array.from({ length: 50 }, () => dealTable(100))))
if (dealA !== dealB) fail('the same seed dealt a different table')
if (nextStreaks(10, false, 3, 1).win !== 4 || nextStreaks(-10, false, 3, 1).win !== 0 || nextStreaks(0, false, 3, 1).win !== 3) fail('the win streak moved wrongly')
if (nextStreaks(0, true, 0, 1).dealerBj !== 2 || nextStreaks(0, false, 0, 1).dealerBj !== 0) fail("the dealer's natural streak moved wrongly")

const fixed = (player: string[], dealer: string[], shoe: string[] = []): ServerState => ({
  shoe: [...shoe].reverse(), hands: [{ cards: player, wager: 100, doubled: false, stood: false, busted: false, isNatural: false, isSplit: false }],
  activeHandIdx: 0, dealerCards: dealer, insuranceTaken: false, insuranceAmount: 0, insuranceResolved: false, phase: 'playerTurn',
})
{
  const s = fixed(['AH', 'AD'], ['9C', '7C'], ['KH', '5S', 'TD', 'TC'])
  if (splitRefusal(s) !== null) fail('a pair of aces could not split')
  splitTable(s, 100)
  if (!s.hands.every(h => h.stood && h.isSplit && h.cards.length === 2 && !h.isNatural)) fail('split aces did not take one card and stand')
  if (s.phase !== 'settled') fail('a split of aces did not go straight to the dealer')
  const t = fixed(['8H', '8D'], ['9C', '7C'], ['2H', '3S', 'TD', 'TC', 'TS'])
  splitTable(t, 100)
  if (splitRefusal(t) !== 'No re-splitting (house rule)') fail('a split hand could split again')
  if (doubleRefusal(t) !== 'No double after split (house rule)') fail('a split hand could double')
  const d = fixed(['5H', '6D'], ['9C', '7C'], ['TH', 'TD', 'TC'])
  doubleTable(d)
  if (d.hands[0].wager !== 200 || !d.hands[0].doubled || !d.hands[0].stood || d.hands[0].cards.length !== 3) fail('a double did not double the wager, take one card and end the hand')
  const st = settleTable(d, 200)
  if (st.netDelta !== st.totalReturned - 200) fail("a round's net was not what came back less what was wagered")
  const h = fixed(['TH', '6D'], ['9C', '7C'], ['5S', 'TD'])
  hitTable(h)
  if (!h.hands[0].stood || h.phase !== 'settled') fail('a hit to 21 did not auto-stand')
  if (turnRefusal(h) === null) fail('a settled table still took a move')
  const ins = fixed(['9H', '7D'], ['AC', 'KC'])
  ins.phase = 'insuranceOffered'
  answerInsurance(ins, 50)
  const insSettle = settleTable(ins, 150)
  if ((ins.phase as string) !== 'settled' || !ins.insuranceTaken || !insSettle.insurance.win) fail('insurance against a dealer natural did not settle and pay')
}
withRng(mulberry32(119), () => {
  for (let k = 0; k < 20_000; k++) {
    const s = dealTable(100)
    if (s.phase === 'insuranceOffered') answerInsurance(s, null)
    let guard = 0
    while (s.phase === 'playerTurn' && guard++ < 20) {
      const h = s.hands[s.activeHandIdx]
      if (splitRefusal(s) === null && k % 3 === 0) splitTable(s, 100)
      else if (doubleRefusal(s) === null && k % 5 === 0) doubleTable(s)
      else if (handValue(h.cards).total < 17) hitTable(s)
      else standTable(s)
    }
    if (k % 7 === 0 && s.phase !== 'settled') standAll(s)
    if (s.phase !== 'settled') { fail('a hand never settled'); break }
    const wagered = s.hands.reduce((x, h) => x + h.wager, 0)
    const r = settleTable(s, wagered)
    if (r.totalReturned < 0 || r.netDelta !== r.totalReturned - wagered) { fail('a settlement came out wrong'); break }
    if (s.hands.some(h => h.busted && handValue(h.cards).total <= 21)) { fail('a hand under 21 was marked bust'); break }
  }
})

console.log(`\n  Casino rules: slots, the pot, roulette's slip, the purse and the blackjack table ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
