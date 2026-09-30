// SELLING, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL sell paths (lib/core/selling) against a LOCAL save
// (lib/data/local/sellLocal), with no network:
//   1. the import trees of the core, the local store and the market rules hold
//      nothing of the server;
//   2. the market's hourly tick (lib/marketRules, the cron's arithmetic ported
//      from update_fish_market) stays in its bounds, keeps its history, pulls
//      back toward par, rolls its moods at the SQL's odds, and catches up by
//      the hours that passed (capped);
//   3. every sell lane pays exactly what the rules say and its one-shot guard
//      holds: the market (whole hold and per species), the resident buyers,
//      the wandering traders (the claim, the daily cap, a stale key, a short
//      purse giving the claim back), the blockade runner (once a night, never
//      for a rod already owned), and the boat's place on the chart (fog OR'd,
//      the helm);
//   4. a version 1 save file upgrades to version 2.
//
//   npx tsx scripts/check-offline-selling.mts

import fs from 'fs'
import path from 'path'
import * as sell from '../lib/core/selling'
import { localSellData } from '../lib/data/local/sellLocal'
import type { LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { freshCasino } from '../lib/data/local/save'
import { installRng, mulberry32, withRng } from '../lib/rng'
import { installClock } from '../lib/clock'
import { tickMarket, freshMarket, catchUpMarket, rollMood, MAX_CATCH_UP_TICKS, type MarketState } from '../lib/marketRules'
import { marketPriceEach, holdAtRate } from '../lib/sellRules'
import { tradersAround, seaDay, DEALS_PER_DAY, RUNNER_STAKE } from '../lib/seaTraders'
import { seaClock } from '../lib/seaClock'
import { RESIDENTS } from '../app/(app)/sea/chart'
import { decodeFog } from '../lib/seaExplore'

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
for (const entry of ['lib/core/selling.ts', 'lib/data/local/sellLocal.ts', 'lib/marketRules.ts']) {
  const seen = new Set<string>(); const bad: string[] = []; const stack = [path.join(ROOT, entry)]
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (/^\s*['"]use server['"]/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(ROOT, f)} is a server action module`)
    for (const spec of importsOf(f)) {
      if (/supabase|^next(\/|$)|^server-only$/.test(spec)) { bad.push(`${path.relative(ROOT, f)} imports ${spec}`); continue }
      const r = resolve(f, spec)
      if (r) stack.push(r)
    }
  }
  if (bad.length) for (const b of bad) fail(`${entry} reaches the server: ${b}`)
  else console.log(`  ${entry}: ${seen.size} modules, none of them the server`)
}

const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
const T0 = Date.parse('2026-09-29T12:00:00.000Z')

// ── 2. The market's tick ──
{
  installRng(mulberry32(11))
  try {
    let m: MarketState = freshMarket(T0)
    const moods: Record<string, number> = {}
    let sum = 0, n = 0, outOfBounds = 0, notCents = 0, badHistory = 0, badPrev = 0
    for (let h = 1; h <= 5000; h++) {
      const before = m
      m = tickMarket(m, SPECIES, T0 + h * HOUR)
      if (m.moodExpiresAt !== before.moodExpiresAt) moods[m.mood] = (moods[m.mood] ?? 0) + 1
      for (const s of SPECIES) {
        const f = m.fish[s.id]
        if (f.m < 0.4 || f.m > 2.5) outOfBounds++
        if (Math.abs(f.m * 100 - Math.round(f.m * 100)) > 1e-9) notCents++
        if (f.history.length > 24 || (h > 1 && f.history.at(-1) !== before.fish[s.id].m)) badHistory++
        if (h > 1 && f.prev !== before.fish[s.id].m) badPrev++
        if (h > 200) { sum += f.m; n++ }
      }
    }
    if (outOfBounds) fail(`${outOfBounds} multipliers left 0.40..2.50`)
    if (notCents) fail(`${notCents} multipliers were not whole cents`)
    if (badHistory) fail(`${badHistory} histories were longer than 24 or did not end on the last multiplier`)
    if (badPrev) fail(`${badPrev} prev values were not the last multiplier`)
    const mean = sum / n
    if (Math.abs(mean - 1) > 0.05) fail(`the market does not pull back to par: long-run mean ${mean.toFixed(3)}`)
    // The mood odds: 5 / 5 / 6 / 12 / 12 / 20 / 40 per cent of rolls.
    const rolls = 20000
    const count: Record<string, number> = {}
    const durations = new Set<number>()
    for (let k = 0; k < rolls; k++) { const r = rollMood(0); count[r.mood] = (count[r.mood] ?? 0) + 1; durations.add(r.moodExpiresAt / HOUR) }
    const want: Record<string, number> = { kraken: 0.05, bounty_season: 0.05, cursed_waters: 0.06, tide_rising: 0.12, low_tide: 0.12, storm: 0.20, calm: 0.40 }
    for (const [mood, p] of Object.entries(want)) {
      const got = (count[mood] ?? 0) / rolls
      if (Math.abs(got - p) > 0.015) fail(`mood ${mood} came up ${(got * 100).toFixed(1)}%, the SQL rolls it ${p * 100}%`)
    }
    if ([...durations].sort().join() !== '2,3,4,5') fail(`moods last ${[...durations].sort().join(',')} hours, not 2 to 5`)
    console.log(`  market: 5,000 hourly ticks in bounds, whole cents, 24-deep history, long-run mean ${mean.toFixed(3)}; moods at the SQL's odds, 2 to 5 hours each`)

    // Catching up: three hours is three ticks; a year is capped.
    const start = freshMarket(T0)
    const three = catchUpMarket(start, SPECIES, T0 + 3 * HOUR + 59_000)
    if (three.lastTickAt !== start.lastTickAt + 3 * HOUR || three.fish[SPECIES[0].id].history.length !== 3) fail('three hours away did not tick three times')
    if (catchUpMarket(three, SPECIES, three.lastTickAt + 30 * 60_000) !== three) fail('half an hour ticked the market')
    const year = catchUpMarket(start, SPECIES, T0 + 365 * 24 * HOUR)
    if (year.lastTickAt !== start.lastTickAt + 365 * 24 * HOUR || year.fish[SPECIES[0].id].history.length !== 24) fail('a year away did not land on the current hour')
    const again = withRng(mulberry32(5), () => catchUpMarket(start, SPECIES, T0 + 10 * HOUR))
    const again2 = withRng(mulberry32(5), () => catchUpMarket(start, SPECIES, T0 + 10 * HOUR))
    if (JSON.stringify(again) !== JSON.stringify(again2)) fail('the same seed caught the market up differently')
    if (MAX_CATCH_UP_TICKS < 24) fail('the catch-up cap is shorter than the history it has to fill')
  } finally { installRng(null) }
}

// ── 3. Every lane, on a local save ──
const UID = 'local-captain'
function freshSave(): LocalSave {
  return {
    uid: UID,
    profile: { doubloons: 1000, gems: 0, sea_x: 0, sea_y: 0, sea_side: 'fishing', sea_explored: null, sea_explored_exp: null, sea_session: null, sea_seen_at: null },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {}, deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} },
  }
}
const cheap = SPECIES.filter(s => s.sell_value > 0 && s.habitat === 'shallows').slice(0, 3)
const fill = (s: LocalSave) => { s.hold = Object.fromEntries(cheap.map((f, i) => [f.id, 5 + i])) }
let now = T0
installRng(mulberry32(21)); installClock(() => now)
try {
  // The market, the whole hold.
  {
    const s = freshSave(); const db = localSellData(s); fill(s)
    const mult = await db.marketMultipliers()
    const want = cheap.reduce((n, f, i) => n + marketPriceEach(f.sell_value, mult.get(f.id)!) * (5 + i), 0)
    const r = await sell.sellEntireHold(db, UID)
    if ('error' in r || r.earned !== want || s.profile.doubloons !== 1000 + want || Object.keys(s.hold).length) fail(`the market hold sale paid ${'earned' in r ? r.earned : r.error}, the rules say ${want}`)
    if (!('error' in (await sell.sellEntireHold(db, UID)))) fail('an empty hold sold twice')
    if (s.profile.fish_sold_doubloons !== want) fail('the sale did not count toward fish_sold_doubloons')
    if (!s.market || s.market.lastTickAt !== Math.floor(T0 / HOUR) * HOUR) fail('the market was not started on the first read')
    // An hour later the prices have moved on their own.
    now += HOUR
    const later = await db.marketMultipliers()
    if (cheap.every(f => later.get(f.id) === mult.get(f.id))) fail('an hour passed and not one price moved')
  }
  // The market, per species.
  {
    const s = freshSave(); const db = localSellData(s); fill(s)
    const f = cheap[0]
    const each = marketPriceEach(f.sell_value, (await db.marketMultiplier(f.id))!)
    if (!('error' in (await sell.marketSellFish(db, UID, f.id, 0)))) fail('zero fish were sold')
    if (!('error' in (await sell.marketSellFish(db, UID, f.id, 99)))) fail('more fish were sold than the hold had')
    const r = await sell.marketSellFish(db, UID, f.id, 2)
    if ('error' in r || r.earned !== each * 2 || s.hold[f.id] !== 3) fail('a per-species sale did not take 2 and pay for 2')
    await sell.marketSellFish(db, UID, f.id, 3)
    if (f.id in s.hold) fail('selling the last of a stack left it in the hold')
  }
  // A resident buyer.
  {
    const s = freshSave(); const db = localSellData(s); fill(s)
    const res = RESIDENTS[0]
    const want = holdAtRate(cheap.map((f, i) => ({ sellValue: f.sell_value, quantity: 5 + i })), res.rate)
    const r = await sell.sellToResident(db, UID, res.zoneId)
    if ('error' in r || r.earned !== want || Object.keys(s.hold).length) fail(`the resident paid ${'earned' in r ? r.earned : r.error}, the rules say ${want}`)
    if (!('error' in (await sell.sellToResident(db, UID, res.zoneId)))) fail('an empty hold sold to a resident')
    if (!('error' in (await sell.sellToResident(db, UID, 'not_a_zone')))) fail('a made-up zone bought the hold')
  }
  // The wandering traders.
  {
    const day = seaDay(now)
    const everyone = tradersAround(0, 0, 60_000, day, now)
    const peddlers = everyone.filter(t => t.deal === 'bait')
    const salter = everyone.find(t => t.deal === 'buy')
    if (peddlers.length < DEALS_PER_DAY + 1 || !salter) fail(`only ${peddlers.length} peddlers and ${salter ? 1 : 0} salters near home, so the cap went untested`)
    else {
      const s = freshSave(); const db = localSellData(s)
      const p = peddlers[0] as Extract<typeof peddlers[0], { deal: 'bait' }>
      s.profile.doubloons = p.cost - 1
      if (!('error' in (await sell.strikeDeal(db, UID, p.key))) || s.deals.length) fail('a peddler sold on credit, or kept the claim')
      s.profile.doubloons = 1_000_000
      const r = await sell.strikeDeal(db, UID, p.key)
      if ('error' in r || s.bait[p.baitType] !== p.qty || s.profile.doubloons !== 1_000_000 - p.cost) fail('a peddler did not sell the bait at the price')
      if (!('error' in (await sell.strikeDeal(db, UID, p.key)))) fail('a peddler dealt twice')
      fill(s)
      const want = holdAtRate(cheap.map((f, i) => ({ sellValue: f.sell_value, quantity: 5 + i })), (salter as Extract<typeof salter, { deal: 'buy' }>).rate)
      const d0 = s.profile.doubloons
      const sr = await sell.strikeDeal(db, UID, salter.key)
      if ('error' in sr || sr.earned !== want || s.profile.doubloons !== d0 + want || Object.keys(s.hold).length) fail('a salter did not buy the hold at his rate')
      for (const q of peddlers.slice(1)) await sell.strikeDeal(db, UID, q.key)
      if (s.deals.filter(d => d.sea_day === day).length !== DEALS_PER_DAY) fail(`${s.deals.length} deals were struck in a day, the cap is ${DEALS_PER_DAY}`)
      if (!('error' in (await sell.strikeDeal(db, UID, 'not:a:key')))) fail('a made-up key found a trader')
      if ((await sell.dealtToday(db, UID)).length !== DEALS_PER_DAY) fail('dealtToday did not list the day\'s deals')
      // Tomorrow: yesterday's keys are stale, and the cap is fresh.
      now += 24 * HOUR
      if (!('error' in (await sell.strikeDeal(db, UID, peddlers[0].key)))) fail('yesterday\'s key still traded')
      if ((await sell.dealtToday(db, UID)).length !== 0) fail('the cap did not reset overnight')
      now -= 24 * HOUR
    }
  }
  // The blockade runner.
  {
    let night = now
    while (!seaClock(night).isNight) night += 15 * 60_000
    const runner = tradersAround(0, 0, 90_000, seaDay(night), night).find(t => t.deal === 'wager')
    if (!runner) fail('no blockade runner out tonight, so the wager went untested')
    else {
      const w = runner as Extract<typeof runner, { deal: 'wager' }>
      now = night
      const s = freshSave(); const db = localSellData(s)
      s.profile.doubloons = RUNNER_STAKE - 1
      if (!('error' in (await sell.wagerForRunnerRod(db, UID, w.key))) || s.deals.length) fail('the runner took a stake that was not there, or kept the night')
      s.profile.doubloons = RUNNER_STAKE * 3
      const r = await sell.wagerForRunnerRod(db, UID, w.key)
      if ('error' in r || s.profile.doubloons !== RUNNER_STAKE * 2 || (r.won !== s.rods.includes(w.rodTier))) fail('the runner\'s cut did not take the stake, or the rod did not follow the result')
      if (!('error' in (await sell.wagerForRunnerRod(db, UID, w.key))) || s.profile.doubloons !== RUNNER_STAKE * 2) fail('the runner dealt twice in a night')
      const t = freshSave(); t.rods.push(w.rodTier); t.profile.doubloons = RUNNER_STAKE
      if (!('error' in (await sell.wagerForRunnerRod(localSellData(t), UID, w.key))) || t.profile.doubloons !== RUNNER_STAKE) fail('the runner took a stake on a rod already owned')
      if (!(await sell.runnerRodOwned(localSellData(t), UID, w.rodTier))) fail('runnerRodOwned missed an owned rod')
      now = T0
    }
  }
  // The boat's place on the chart.
  {
    const s = freshSave(); const db = localSellData(s)
    await sell.saveSeaPosition(db, UID, 120, -340, [3, 9], [], 'anchorage', { session: 'a', claim: true })
    if (s.profile.sea_x !== 120 || s.profile.sea_y !== -340 || s.profile.sea_side !== 'anchorage' || s.profile.sea_session !== 'a') fail('the position did not stick')
    await sell.saveSeaPosition(db, UID, 0, 0, [4], [], 'fishing')
    const bits = decodeFog(s.profile.sea_explored as string)
    const has = (i: number) => (bits[i >> 3] >> (i & 7)) & 1
    if (!has(3) || !has(9) || !has(4)) fail('the fog did not OR the new cells onto the old')
    const other = await sell.saveSeaPosition(db, UID, 5, 5, [], [], 'fishing', { session: 'b', claim: false })
    if (other.helm !== 'elsewhere' || s.profile.sea_x !== 0) fail('a second chart wrote over a fresh helm')
    now += 60_000
    if ((await sell.saveSeaPosition(db, UID, 5, 5, [], [], 'fishing', { session: 'b', claim: false })).helm !== 'mine') fail('a stale helm was not taken over')
    await sell.saveSeaPosition(db, UID, 5, 5, [], [], 'nonsense' as 'fishing')
    if (s.profile.sea_side !== 'fishing') fail('a made-up side was stored')
    now = T0
  }
  console.log('  sell lanes on a local save: the market (hold and per species), residents, peddlers and salters, the daily cap, the runner, the chart: each paid what the rules say, once')
} finally {
  installRng(null); installClock(null)
}

// ── 4. A version 1 save opens as version 2 ──
{
  const s = freshSave()
  const v2 = JSON.parse(serializeSave(s))
  const { deals: _d, market: _m, ...v1save } = v2.save
  void _d; void _m
  const loaded = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 1, savedAt: '', save: v1save, carried: {} }), SPECIES)
  if (!Array.isArray(loaded.save.deals) || loaded.save.deals.length || loaded.save.market !== null) fail('a version 1 save did not upgrade to version 2')
  s.market = freshMarket(T0); s.deals.push({ trader_key: 'k', sea_day: 1, kind: 'peddler', detail: {} })
  const back = deserializeSave(serializeSave(s), SPECIES).save
  if (JSON.stringify(back.market) !== JSON.stringify(s.market) || back.deals.length !== 1) fail('the market and the deals did not survive the save file')
}

console.log(`\n  Offline selling: no server on the path, the market's tick, every sell lane and its guard, save v2 ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
