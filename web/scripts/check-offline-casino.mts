// THE DEN, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL casino paths (lib/core/casino) against a LOCAL save
// (lib/data/local/casinoLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the purse: a buy-in in range, covered and inside the day's shared cap,
//      the cap back the next day; the cash-out moves every chip once and ends
//      the session; not while a hand is on the felt;
//   3. slots: every chip accounted for over many spins (chips move by exactly
//      each spin's net), the pot fed by each spin, the running stats, a forced
//      catfish triple taking a wager-sized share of the pot (never below the
//      seed) and the Catfish Jackpot badge;
//   4. roulette: the slip refused when bad, chips moving by each spin's net,
//      the last twenty spins kept, Called It on a straight win;
//   5. blackjack: hundreds of hands played every which way, and the chips
//      always equal where they started plus every hand's net; a hand settles
//      once; an orphan hand is stood and settled by the next deal; insurance
//      charged at half the wager;
//   6. a purse that hits zero ends the session;
//   7. the save file: version 5 upgrades to 6, and a web export's Den
//      converts (an open hand kept, slots as running totals).
//
//   npx tsx scripts/check-offline-casino.mts

import fs from 'fs'
import path from 'path'
import * as den from '../lib/core/casino'
import { localCasinoData } from '../lib/data/local/casinoLocal'
import { freshCasino, type LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32, rngNext } from '../lib/rng'
import { installClock } from '../lib/clock'
import { SLOTS_MAX_BET, SLOTS_JACKPOT_FEED_PCT, DEN_CAP_BASE } from '../app/(app)/tavern/constants'
import type { Bet } from '../lib/roulette'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()
const HOUR = 3_600_000

// ── 1. Nothing of the server on the offline path ──
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue
    out.push(m[3])
  }
  return out
}
function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec)
  else return null
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext
  return null
}
for (const entry of ['lib/core/casino.ts', 'lib/data/local/casinoLocal.ts']) {
  const seen = new Set<string>(); const bad: string[] = []; const stack = [path.join(ROOT, entry)]
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (f.endsWith('.json')) continue
    if (/^\s*['"]use server['"]/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(ROOT, f)} is a server action module`)
    for (const spec of importsOf(f)) {
      if (/supabase|^next(\/|$)|^server-only$|anthropic/.test(spec)) { bad.push(`${path.relative(ROOT, f)} imports ${spec}`); continue }
      const r = resolve(f, spec)
      if (r) stack.push(r)
    }
  }
  if (bad.length) for (const b of bad) fail(`${entry} reaches the server: ${b}`)
  else console.log(`  ${entry}: ${seen.size} modules, none of them the server`)
}

const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
const UID = 'local-captain'
const T0 = Date.parse('2026-09-29T09:00:00.000Z')
function freshSave(over: Record<string, unknown> = {}): LocalSave {
  return {
    uid: UID,
    profile: {
      username: 'Offline Captain', doubloons: 10_000, casino_chips: 0, casino_session_buy_ins: 0, fishing_xp: 0, expedition_xp: 0,
      is_premium: false, premium_expires_at: null, is_admin: false, blackjack_session_net: 0, roulette_session_net: 0, slots_session_net: 0,
      blackjack_win_streak: 0, blackjack_dealer_bj_streak: 0, unlocked_badges: [], slots_force_next: null,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
  }
}
const chips = (s: LocalSave) => Number(s.profile.casino_chips)

let now = T0
installRng(mulberry32(3)); installClock(() => now)
try {
  // ── 2. The purse ──
  {
    const s = freshSave(); const db = localCasinoData(s)
    if (!('error' in (await den.buyInCasino(db, UID, 5)))) fail('a buy-in under the minimum went through')
    if (!('error' in (await den.buyInCasino(db, UID, 1.5)))) fail('a fractional buy-in went through')
    const b = await den.buyInCasino(db, UID, 1500)
    if ('error' in b || chips(s) !== 1500 || s.profile.doubloons !== 8500 || b.dailyRemaining !== DEN_CAP_BASE - 1500) fail('a buy-in did not move doubloons to chips against the cap')
    if (!('error' in (await den.buyInCasino(db, UID, DEN_CAP_BASE)))) fail('a buy-in over the day\'s cap went through')
    const w = await den.getCasinoState(db, UID)
    if (w.dailyBoughtIn !== 1500 || w.sessionBuyIns !== 1500) fail('the wallet misread the day')
    now += 24 * HOUR
    if ((await den.getCasinoState(db, UID)).dailyRemaining !== DEN_CAP_BASE) fail('the cap did not come back the next day')
    const out = await den.cashOutCasino(db, UID)
    if ('error' in out || out.cashedOut !== 1500 || chips(s) !== 0 || s.profile.doubloons !== 10_000 || s.profile.casino_session_buy_ins !== 0) fail('the cash-out did not move every chip back and end the session')
    if (!('error' in (await den.cashOutCasino(db, UID)))) fail('an empty purse cashed out')
    now = T0
  }

  // ── 3. Slots ──
  {
    const s = freshSave({ casino_chips: 100_000 }); const db = localCasinoData(s)
    if (!('error' in (await den.spinSlots(db, UID, 7)))) fail('a spin under the minimum went through')
    let drift = 0, fedWrong = 0, netSum = 0
    for (let k = 0; k < 400; k++) {
      const wager = [10, 50, 200, 500][k % 4]
      const before = chips(s), pot0 = s.casino.pot.pot
      const r = await den.spinSlots(db, UID, wager)
      if ('error' in r) { fail(`spin ${k}: ${r.error}`); break }
      if (chips(s) !== before + r.net || r.newChips !== chips(s)) drift++
      netSum += r.net
      if (!r.jackpotWin && s.casino.pot.pot !== pot0 + Math.ceil(wager * SLOTS_JACKPOT_FEED_PCT)) fedWrong++
    }
    if (drift) fail(`${drift} spins moved the chips by something other than their net`)
    if (fedWrong) fail(`${fedWrong} spins did not feed the pot by their share`)
    const stats = await den.getSlotStats(db, UID)
    if (stats.spins !== 400 || stats.net !== netSum) fail('the slot stats do not match the spins')
    // A forced catfish triple takes pot × wager / max bet.
    s.profile.slots_force_next = 'catfish'
    const pot0 = s.casino.pot.pot + Math.ceil(SLOTS_MAX_BET * SLOTS_JACKPOT_FEED_PCT)
    const jp = await den.spinSlots(db, UID, SLOTS_MAX_BET)
    if ('error' in jp || jp.outcome !== 'jackpot' || jp.jackpotWin !== pot0 || s.casino.pot.pot !== Math.max(s.casino.pot.seed, 0)) fail('a max-bet catfish did not take the whole pot down to its seed')
    if (s.profile.slots_force_next !== null || !(s.profile.unlocked_badges as string[]).includes('catfish_jackpot')) fail('the forced spin was not spent, or the badge not granted')
    s.profile.slots_force_next = 'catfish'
    const half = Math.floor((s.casino.pot.pot + Math.ceil(250 * SLOTS_JACKPOT_FEED_PCT)) * 250 / SLOTS_MAX_BET)
    const jp2 = await den.spinSlots(db, UID, 250)
    if ('error' in jp2 || jp2.jackpotWin !== half) fail('a half-max catfish did not take half the pot')
    console.log(`  slots: 400 spins, every chip accounted for, net ${netSum}; two catfish jackpots paid their share of the pot`)
  }

  // ── 4. Roulette ──
  {
    const s = freshSave({ casino_chips: 200_000 }); const db = localCasinoData(s)
    if (!('error' in (await den.placeBetsAndSpin(db, UID, [])))) fail('an empty slip was spun')
    if (!('error' in (await den.placeBetsAndSpin(db, UID, [{ type: 'straight', target: 7, amount: -5 }])))) fail('a negative bet was spun')
    let drift = 0, calledIt = false
    for (let k = 0; k < 300; k++) {
      const n = Math.floor(rngNext() * 37)
      const bets: Bet[] = [{ type: 'straight', target: n, amount: 10 }, { type: 'color', target: 'red', amount: 20 }]
      const before = chips(s)
      const r = await den.placeBetsAndSpin(db, UID, bets)
      if ('error' in r) { fail(`roulette ${k}: ${r.error}`); break }
      if (chips(s) !== before + r.net || r.chipsAfter !== chips(s)) drift++
      if (r.perBet.some(p => p.won && p.bet.type === 'straight')) calledIt = true
    }
    if (drift) fail(`${drift} roulette spins moved the chips by something other than their net`)
    const st = await den.getRouletteState(db, UID)
    if (st.recentSpins.length !== 20) fail('the last twenty spins were not kept')
    if (calledIt && !(s.profile.unlocked_badges as string[]).includes('called_it')) fail('a straight win did not grant Called It')
  }

  // ── 5. Blackjack ──
  {
    const s = freshSave({ casino_chips: 500_000 }); const db = localCasinoData(s)
    const start = chips(s)
    let net = 0, hands = 0, insured = 0
    for (let k = 0; k < 500; k++) {
      let r = await den.dealBlackjack(db, UID, [10, 25, 100, 500][k % 4])
      let guard = 0
      while (!('error' in r) && r.kind === 'active' && guard++ < 20) {
        const st = r.state
        if (st.insuranceOffered) {
          const before = chips(s)
          r = k % 2 ? await den.acceptInsurance(db, UID) : await den.declineInsurance(db, UID)
          if (k % 2 && !('error' in r) && r.kind === 'active' && chips(s) !== before - Math.floor(st.hands[0].wager / 2)) fail('insurance was not charged at half the wager')
          if (k % 2) insured++
          continue
        }
        const pick = rngNext()
        r = st.canSplit && pick < 0.3 ? await den.split(db, UID)
          : st.canDouble && pick < 0.5 ? await den.doubleDown(db, UID)
          : pick < 0.75 ? await den.hit(db, UID)
          : await den.stand(db, UID)
      }
      if ('error' in r) { fail(`hand ${k}: ${r.error}`); break }
      if (r.kind === 'settled') { net += r.result.netDelta; hands++; if (r.result.newChips !== chips(s)) fail(`hand ${k} reported ${r.result.newChips} chips, the purse holds ${chips(s)}`) }
    }
    if (chips(s) !== start + net) fail(`after ${hands} hands the purse holds ${chips(s)}, not ${start} + ${net}`)
    if (s.casino.hand !== null) fail('a hand was left on the felt')
    if (!('error' in (await den.stand(db, UID)))) fail('a settled hand was played again')
    // An orphan: a hand left open is stood and settled by the next deal.
    let open = await den.dealBlackjack(db, UID, 100)
    while (!('error' in open) && open.kind === 'settled') open = await den.dealBlackjack(db, UID, 100)
    if (!('error' in open) && open.kind === 'active') {
      if (!('error' in (await den.cashOutCasino(db, UID)))) fail('the purse cashed out with a hand on the felt')
      const orphanId = open.state.handId
      const next = await den.dealBlackjack(db, UID, 100)
      if ('error' in next || s.casino.hand?.id === orphanId) fail('an orphan hand was not settled by the next deal')
      if (!('error' in next) && next.kind === 'active') await den.stand(db, UID)
    }
    console.log(`  blackjack: ${hands} hands played every which way (${insured} insured), the purse always where the nets say`)
  }

  // ── 6. Bust-out ──
  {
    const s = freshSave({ casino_chips: 10, casino_session_buy_ins: 500, slots_session_net: -490 }); const db = localCasinoData(s)
    let r = await den.spinSlots(db, UID, 10)
    while (!('error' in r) && chips(s) > 0 && chips(s) >= 10) r = await den.spinSlots(db, UID, 10)
    if (chips(s) === 0 && (s.profile.casino_session_buy_ins !== 0)) fail('an empty purse did not end the session')
  }
  console.log('  the purse: buy-ins against the day\'s cap, one cash-out, never mid-hand; an empty purse ends the session')
} finally {
  installRng(null); installClock(null)
}

// ── 7. The save file ──
{
  const s = freshSave()
  const v6 = JSON.parse(serializeSave(s))
  const { casino: _c, ...v5save } = v6.save
  void _c
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 5, savedAt: '', save: v5save, carried: {} }), SPECIES).save
  if (up.casino?.pot.pot !== 15000 || up.casino.hand !== null) fail('a version 5 save did not upgrade to version 6')
  const { save, carried } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: {},
    tables: {
      casino_buy_ins: [{ amount: 400, created_at: '2026-09-29T08:00:00Z' }],
      blackjack_hands: [{ id: 900, status: 'settled', state: null }, { id: 901, status: 'active', state: { phase: 'playerTurn' }, initial_wager: 50, total_wagered: 50 }],
      slot_spins: [{ wager: 10, payout: 0 }, { wager: 10, payout: 60 }],
      roulette_spins: [{ id: 5, winning_number: 3, net_chips: -10, total_wagered: 10, created_at: '2026-09-28T00:00:00Z' }],
    },
  }, SPECIES)
  if (save.casino.hand?.id !== 901 || save.casino.slots.spins !== 2 || save.casino.slots.net !== 40 || save.casino.slots.biggest_win !== 50
      || save.casino.buyIns[0]?.amount !== 400 || save.casino.rouletteSpins.length !== 1 || 'slot_spins' in carried || save.nextId !== 902) fail('a web export\'s Den did not convert')
}

console.log(`\n  Offline Den: no server on the path, the purse, slots and the pot, roulette, blackjack, save v6 ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
