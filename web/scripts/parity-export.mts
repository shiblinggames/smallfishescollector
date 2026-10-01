// THE GODOT PARITY CASES (Godot port, stage 0, 2026-09-30).
//
// The Steam game is being rebuilt in Godot (docs/systems/steam-port.md), and
// the rules here in lib/ are its SPEC. This script runs the real TypeScript
// against seeded dice and a scripted clock and writes what happened to
// godot/game/tests/parity/*.json; the Godot build replays every case
// (godot/game/tests/parity.gd) and must end in exactly the same place. A system is
// ported when its cases match.
//
//   dice.json     mulberry32 sequences and seedOf hashes (the dice every roll
//                 goes through; a roll out of step breaks everything after it)
//   save.json     save files the Godot build must read and write back unchanged
//   fishing_rest.json  scripted sessions for the rest of fishing and the loadout
//   fishing.json  whole fishing sessions: the save at the start, every call
//                 with its clock, arguments, result and how many rolls it used,
//                 and the save at the end
//
// Deterministic: running it twice writes the same files. Re-run it whenever a
// rule changes, and the Godot build learns what changed from its failures.
//
//   npx tsx scripts/parity-export.mts

import fs from 'fs'
import path from 'path'
import { castLine, reelIn, reelCrate, rerollWormhole, tideTurnerSkip, heldGolden, sellGoldenTrophy, mountGoldenTrophy, claimFishingLevelRewards, claimZoneReward, prestigeZone, releaseAncient } from '../lib/core/fishing'
import { setAutoFishing, setShowWaitTimer, buySpecialItem, equipSpecialItem, buyHat, equipHat, buyBoat, equipBoat, equipPet, setCompletionistEffects } from '../lib/core/loadout'
import { BADGES } from '../lib/badges'
import { updateCharacterColor } from '../lib/core/profile'
import { equipTackleRod, buyBait, purchaseRod, sellRod, buyReel, buyHook, upgradeFishHold, claimCompletionistRod } from '../lib/core/harbour'
import { marketSellFish, sellEntireHold, sellToResident } from '../lib/core/selling'
import { localSellData } from '../lib/data/local/sellLocal'
import { localHarbourData } from '../lib/data/local/harbourLocal'
import { buyShipyardTier, equipRod } from '../lib/core/ship'
import { localShipData } from '../lib/data/local/shipLocal'
import { FOLK } from '../lib/seaFolk'
import { ISLES } from '../lib/seaIsles'
import { localFishingData, type LocalSave } from '../lib/data/local/fishingLocal'
import { serializeSave } from '../lib/data/local/saveFile'
import { starterSave } from '../lib/data/local/starter'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32, seedOf, type Rng } from '../lib/rng'
import { installClock, clockNow } from '../lib/clock'
import { hotspotsAt } from '../lib/seaHotspots'
import { goAshore, digHere, openBottle, getDigState } from '../lib/core/sea'
import { saveSeaPosition } from '../lib/core/selling'
import { localSeaData } from '../lib/data/local/seaLocal'
import { bottlesAround, bottlePos } from '../lib/seaBottles'
import { fogReveal } from '../lib/seaExplore'
import { DIG_SITES } from '../lib/seaDigs'
import { XP_TABLE } from '../lib/fishingLevel'
import { getDailyChallenges } from '../lib/dailyChallenges'
import { CRATE_FISH_ID } from '../lib/fishingRules'

const OUT = path.join(process.cwd(), '..', 'godot', 'game', 'tests', 'parity')
fs.mkdirSync(OUT, { recursive: true })
const SPECIES = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
const START = Date.parse('2026-09-30T12:00:00.000Z')
const SAVED_AT = new Date(START).toISOString()
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + '\n')
  console.log(`  ${name}`)
}

// ── The dice ──
// Values as the 32-bit integers behind them (value x 2^32), exact on both sides.
const U = 4294967296
write('dice.json', {
  sequences: [0, 1, 2026, 4294967295, 123456789, seedOf('parity')].map(seed => {
    const r = mulberry32(seed)
    return { seed, values: Array.from({ length: 64 }, () => r() * U) }
  }),
  hashes: ['', 'a', 'local-captain', 'captain-78cda61878db:1759233600000', 'Ñandú', 'fish 🐟 hook', 'Davy Jones'.repeat(20)]
    .map(text => ({ text, seed: seedOf(text) })),
})

// ── The daily challenges ──
// Which challenges a day deals at a level: 400 days from the start, five levels
// (the pick walks past zones the level cannot reach, through a hash whose
// arithmetic is JavaScript's own).
write('daily.json', {
  days: Array.from({ length: 400 }, (_, i) => new Date(START + i * 86_400_000).toISOString().slice(0, 10)).map(date => ({
    date, picks: Object.fromEntries([1, 15, 30, 50, 80].map(level => [level, getDailyChallenges(date, level).map(c => c.label)])),
  })),
})

// ── A fishing session ──
type Op = { op: string; now: number; args: unknown[]; rolls: number; result: unknown }

/** The dice, counting how many rolls each call takes. */
function countingDice(seed: number): { rng: Rng; take(): number } {
  const r = mulberry32(seed)
  let n = 0
  return { rng: () => { n++; return r() }, take() { const k = n; n = 0; return k } }
}

/**
 * How each cast in a session is played. Everything is optional; the defaults
 * are the original sessions' pattern (worms, shallows, perfect/catch/miss).
 *   before  profile columns or save fields to set BEFORE the cast, recorded as
 *           calls of their own so the Godot replay sets them too
 *   hop     cast once in `hop` first and walk away (a stale token elsewhere)
 *   resume  cast twice in the same water before reeling (the sticky roll)
 *   early   also try to open a crate before it surfaces
 *   gap     extra time before the next cast (a new day, an event running out)
 */
type Step = {
  bait?: string; zone?: string; how?: 'perfect' | 'catch' | 'miss' | 'penalty'
  before?: { profile?: Record<string, unknown> | ((now: number) => Record<string, unknown>); save?: Record<string, unknown> }
  hop?: string; resume?: boolean; early?: boolean; gap?: number
}
const defaultHow = (k: number) => (k % 4 === 3 ? 'miss' : k % 4 === 0 ? 'perfect' : 'catch') as Step['how']

async function session(name: string, seed: number, start: LocalSave, casts: number, plan: (k: number) => Step = () => ({})) {
  const save = start
  const startText = serializeSave(save, {}, SAVED_AT)
  const db = localFishingData(save)
  const uid = save.uid
  let now = START
  const dice = countingDice(seed)
  installRng(dice.rng)
  installClock(() => now)
  const ops: Op[] = []
  const call = async (op: string, args: unknown[], run: () => Promise<unknown>) => {
    dice.take()
    const result = JSON.parse(JSON.stringify((await run()) ?? null))
    ops.push({ op, now, args, rolls: dice.take(), result })
    return result
  }
  try {
    for (let k = 0; k < casts; k++) {
      const st = plan(k)
      const bait = st.bait ?? 'worm'
      const zone = st.zone ?? 'shallows'
      const how = st.how ?? defaultHow(k)
      if (st.before?.profile) {
        const p = st.before.profile
        const patch = typeof p === 'function' ? p(now) : p
        await call('patchProfile', [patch], async () => { Object.assign(save.profile, structuredClone(patch)) })
      }
      if (st.before?.save) {
        const patch = st.before.save
        await call('patchSave', [patch], async () => { Object.assign(save, structuredClone(patch)) })
      }
      if (st.hop) {
        const hop = st.hop
        await call('castLine', [bait, hop], () => castLine(db, uid, bait, hop))
        now += 2000
      }
      let shot = await call('castLine', [bait, zone], () => castLine(db, uid, bait, zone))
      if ('error' in shot) { now += 60_000; continue }
      if (st.resume) {
        now += 1000
        shot = await call('castLine', [bait, zone], () => castLine(db, uid, bait, zone))
        if ('error' in shot) { now += 60_000; continue }
      }
      // The guard: a reel before the bite is refused and keeps the cast.
      if (k === 0) await call('reelIn', [shot.fishId, 'catch', bait], () => reelIn(db, uid, shot.fishId, 'catch', bait))
      if (st.early && shot.fishId === CRATE_FISH_ID) await call('reelCrate', ['catch'], () => reelCrate(db, uid, 'catch'))
      now += shot.waitMs + 1500
      if (shot.fishId === CRATE_FISH_ID) {
        const c = k % 2 ? 'perfect' : 'catch'
        await call('reelCrate', [c], () => reelCrate(db, uid, c))
        now += 4000 + (st.gap ?? 0)
        continue
      }
      const r = await call('reelIn', [shot.fishId, how, bait], () => reelIn(db, uid, shot.fishId, how!, bait))
      // The guard: a spent cast pays nothing twice.
      if (k % 5 === 1 && r.caught) await call('reelIn', [shot.fishId, how, bait], () => reelIn(db, uid, shot.fishId, how!, bait))
      now += 4000 + (st.gap ?? 0)
    }
  } finally {
    installRng(null)
    installClock(null)
  }
  return { name, seed, start: startText, ops, end: serializeSave(save, {}, SAVED_AT) }
}

// A brand-new captain in the shallows until the worms run low, and a
// level-20 captain with a better rod and plenty of worms for a long session.
const newCaptain = () => starterSave('captain-00parity0001', SPECIES, START)
const seasoned = () => {
  const s = starterSave('captain-00parity0002', SPECIES, START)
  Object.assign(s.profile, { fishing_xp: XP_TABLE[20], doubloons: 5000, rod_tier: 3, hook_tier: 2, line_tier: 1, fish_hold_tier: 4, has_seen_setup: true, has_seen_welcome: true })
  s.rodItems = { driftwood: 1, fiberglass: 1, reefguard: 1 }
  s.bait = { worm: 400 }
  return s
}
/** A captain at a fishing level holding one rod, with room and bait to fish long. */
const captainWith = (n: number, level: number, rodTier: number, extra: Record<string, unknown> = {}, bait: Record<string, number> = { worm: 600 }) => {
  const s = starterSave(`captain-00parity${String(n).padStart(4, '0')}`, SPECIES, START)
  Object.assign(s.profile, { fishing_xp: XP_TABLE[level - 1], doubloons: 20000, rod_tier: rodTier, fish_hold_tier: 8, has_seen_setup: true, has_seen_welcome: true, ...extra })
  s.bait = bait
  return s
}
const EMPTY_HOLD = { save: { hold: {} } }
const everyTen = (k: number) => (k % 10 === 9 ? EMPTY_HOLD : undefined)
const sessions = [
  await session('new captain, shallows', 2026, newCaptain(), 20),
  await session('seasoned captain, shallows', 7, seasoned(), 90),
  await session('seasoned captain, another seed', 424242, seasoned(), 90),
  // The YOLO jackpot (x100 hauls), the Perfected Sigil, renown on fishing,
  // prestige XP, golden boosts, two baits, and a hold emptied every ten casts.
  await session('YOLO rod, open waters, Sigil and renown', 11, captainWith(3, 80, 15, {
    has_perfected_sigil: true, equipped_special: 'perfected_sigil', prestige_levels: { open_waters: 2, shallows: 5 },
    zone_golden_boost: { open_waters: 3 }, fishing_renown_alloc: { wisdom: 5, patience: 10, providence: 4, bounty: 2 },
  }, { worm: 500, minnow: 150 }), 120, k => ({ zone: 'open_waters', bait: k % 3 ? 'worm' : 'minnow', how: k % 3 === 2 ? 'catch' : 'perfect', before: everyTen(k) })),
  // The Locked-In Rod on long perfect streaks (speed, the triple haul, the
  // frenzy), the Phantom Hook, the Deep, and a Master's fourth challenge.
  await session('Locked-In rod, the Deep, Phantom Hook', 12, captainWith(4, 76, 20, { has_phantom_hook: true, equipped_special: 'phantom_hook' }),
    120, k => ({ zone: 'deep', how: k % 23 === 22 ? 'miss' : k % 13 === 12 ? 'catch' : 'perfect', before: everyTen(k) })),
  // The Galaxy Rod's wormhole: every catch holds its credit until the next cast settles it.
  await session('Galaxy rod, the Abyss', 13, captainWith(5, 80, 18), 70, k => ({ zone: 'abyss', before: everyTen(k) })),
  // The Completionist carrying Twin Strike, Treasure and Lightsaber effects.
  await session('Completionist rod, three effects', 14, captainWith(6, 85, 14, { completionist_effects: [11, 16, 19] }),
    90, k => ({ zone: k % 2 ? 'open_waters' : 'deep', before: everyTen(k) })),
  // The Ancient Deep: lures and worms, two giants on the wall (one released
  // for the Vigil), the first-catch contest and its letter.
  await session('the Ancient Deep', 15, captainWith(7, 90, 10, {
    has_ancient_deep_access: true, ancient_catches: [144, 145], ancient_vigil: { '144': { rank: 2, released: true }, '145': { rank: 1, released: false } },
  }, { worm: 300, luminous: 200, golden: 120 }), 90, k => ({ zone: 'ancient_deep', bait: ['luminous', 'golden', 'worm'][k % 3], how: k % 5 === 4 ? 'catch' : 'perfect', before: everyTen(k) })),
  // The rest: snags, resumed casts, zone hops, forced goldens, the Primeval
  // Eye seated, the Borrowed Jaw charging, bloom and red-tide events, a zone
  // above the captain's level, early crate opens, and several days.
  await session('snags, resumes, events, goldens, the Eye', 16, captainWith(8, 45, 16, {
    equipped_special_2: 'anglers_patience', has_anglers_patience: true, anglers_patience_xp: 900_000, finn_spoil_free: 'fishing',
    equipped_raid_items: ['borrowed_jaw'], finn_spoil_paid: 'nav', borrowed_jaw_xp: 1000,
  }, { worm: 400, chum: 60 }), 110, k => ({
    zone: k === 40 ? 'abyss' : k % 3 ? 'shallows' : 'open_waters',
    bait: k % 4 === 0 ? 'chum' : 'worm',
    how: k % 5 === 2 ? 'penalty' : k % 4 === 3 ? 'miss' : 'perfect',
    hop: k % 13 === 5 ? 'deep' : undefined,
    resume: k % 7 === 3,
    early: true,
    gap: k % 25 === 24 ? 86_400_000 : 0,
    before: k === 20 ? { profile: { force_shiny_always: true } }
      : k === 26 ? { profile: { force_shiny_always: false, force_shiny_next_perfect: true } }
      : k === 50 ? { profile: (t: number) => ({ active_event: { type: 'bloom', started_at: new Date(t).toISOString() } }) }
      : k === 70 ? { profile: (t: number) => ({ active_event: { type: 'redtide', started_at: new Date(t).toISOString() } }) }
      : everyTen(k),
  })),
  // A small hold that fills: the refusal, then a sale-sized clearing.
  await session('a hold that fills', 17, captainWith(9, 20, 11, { fish_hold_tier: 0 }), 40, k => ({ how: 'perfect', before: k === 30 ? EMPTY_HOLD : undefined })),
]
write('fishing.json', { sessions })

// ── The rest of fishing and the loadout ──
//
// Scripted sessions: each walks one family of calls through every branch the
// TS has, refusals included, with casts in between where they matter. Written
// to fishing_rest.json in the same shape as fishing.json.

type Script = {
  db: ReturnType<typeof localFishingData>; uid: string; save: LocalSave
  call(op: string, args: unknown[], run: () => Promise<unknown>): Promise<any>
  patchProfile(p: Record<string, unknown>): Promise<void>
  patchSave(p: Record<string, unknown>): Promise<void>
  /** Cast, wait out the bite, reel with `how`; crates open. The reel's result. */
  fish(bait: string, zone: string, how: 'perfect' | 'catch' | 'miss'): Promise<any>
  /** Cast and wait out the bite, and stop there (the line is out). */
  castOnly(bait: string, zone: string): Promise<any>
  advance(ms: number): void
}

async function scripted(name: string, seed: number, start: LocalSave, play: (x: Script) => Promise<void>) {
  const save = start
  const startText = serializeSave(save, {}, SAVED_AT)
  const db = localFishingData(save)
  const uid = save.uid
  let now = START
  const dice = countingDice(seed)
  installRng(dice.rng)
  installClock(() => now)
  const ops: Op[] = []
  const call = async (op: string, args: unknown[], run: () => Promise<unknown>) => {
    dice.take()
    const result = JSON.parse(JSON.stringify((await run()) ?? null))
    ops.push({ op, now, args, rolls: dice.take(), result })
    return result
  }
  const castOnly = async (bait: string, zone: string) => {
    const shot = await call('castLine', [bait, zone], () => castLine(db, uid, bait, zone))
    if (!('error' in shot)) now += shot.waitMs + 1500
    return shot
  }
  const x: Script = {
    db, uid, save, call,
    async patchProfile(p) { await call('patchProfile', [p], async () => { Object.assign(save.profile, structuredClone(p)) }) },
    async patchSave(p) { await call('patchSave', [p], async () => { Object.assign(save, structuredClone(p)) }) },
    castOnly,
    async fish(bait, zone, how) {
      const shot = await castOnly(bait, zone)
      if ('error' in shot) { now += 60_000; return shot }
      const r = shot.fishId === CRATE_FISH_ID
        ? await call('reelCrate', [how === 'miss' ? 'catch' : how], () => reelCrate(db, uid, how === 'miss' ? 'catch' : how))
        : await call('reelIn', [shot.fishId, how, bait], () => reelIn(db, uid, shot.fishId, how, bait))
      now += 4000
      return r
    },
    advance(ms) { now += ms },
  }
  try { await play(x) } finally { installRng(null); installClock(null) }
  return { name, seed, start: startText, ops, end: serializeSave(save, {}, SAVED_AT) }
}

const DAY = 86_400_000
const idsIn = (zone: string) => SPECIES.filter(s => s.habitat === zone).map(s => s.id)
const loggedAll = (zone: string, extra: Record<number, unknown> = {}) =>
  Object.fromEntries(idsIn(zone).map(id => [id, { catch_count: 1, is_golden: null, ...(extra[id] ?? {}) }]))

const rest = [
  // Level rewards: claimed after every cast while a new captain climbs, then a
  // jump of many levels at once (with no watermark yet), a repeat that pays
  // nothing, and a jump past the last paying level.
  await scripted('level rewards', 21, captainWith(21, 1, 0, {}, { worm: 60 }), async x => {
    for (let k = 0; k < 30; k++) {
      await x.fish('worm', 'shallows', k % 3 === 2 ? 'catch' : 'perfect')
      await x.call('claimFishingLevelRewards', [], () => claimFishingLevelRewards(x.db, x.uid))
    }
    await x.patchProfile({ fishing_xp: XP_TABLE[48], claimed_fishing_levels: null })
    await x.call('claimFishingLevelRewards', [], () => claimFishingLevelRewards(x.db, x.uid))
    await x.call('claimFishingLevelRewards', [], () => claimFishingLevelRewards(x.db, x.uid))
    await x.patchProfile({ fishing_xp: XP_TABLE[64], fish_hold_tier: 0 })
    await x.call('claimFishingLevelRewards', [], () => claimFishingLevelRewards(x.db, x.uid))
    await x.patchProfile({ fishing_xp: XP_TABLE[99] })
    await x.call('claimFishingLevelRewards', [], () => claimFishingLevelRewards(x.db, x.uid))
  }),
  // Goldens and the Tide Turner: every perfect is a golden, sold or mounted
  // in turn (mounting the same species twice refused, resolving twice
  // refused); three skips a day, a fourth refused, a new day, and the
  // refusals for an unequipped or missing Tide Turner.
  await scripted('goldens and the Tide Turner', 22, captainWith(22, 30, 3, {
    force_shiny_always: true, has_tide_turner: true, equipped_special: 'tide_turner', fishing_renown_alloc: { bounty: 6 },
  }), async x => {
    await x.call('heldGolden', [], () => heldGolden(x.db, x.uid))
    for (let k = 0; k < 24; k++) {
      if (k % 4 === 0) {
        const shot = await x.castOnly('worm', 'shallows')
        if (!('error' in shot)) await x.call('tideTurnerSkip', [], () => tideTurnerSkip(x.db, x.uid))
        continue
      }
      const r = await x.fish('worm', 'open_waters', 'perfect')
      if (!r.caught || !r.isShiny) continue
      const held = await x.call('heldGolden', [], () => heldGolden(x.db, x.uid))
      if (!held) continue
      if (k % 3 === 0) {
        await x.call('mountGoldenTrophy', [held.id], () => mountGoldenTrophy(x.db, x.uid, held.id))
        await x.call('mountGoldenTrophy', [held.id], () => mountGoldenTrophy(x.db, x.uid, held.id))
      } else {
        await x.call('sellGoldenTrophy', [held.id], () => sellGoldenTrophy(x.db, x.uid, held.id))
        await x.call('sellGoldenTrophy', [held.id], () => sellGoldenTrophy(x.db, x.uid, held.id))
      }
      if (k === 9) x.advance(DAY)
    }
    // A golden left on hold, found again, then one mounted where the species
    // is already on the wall.
    const a = await x.fish('worm', 'open_waters', 'perfect')
    const b = await x.fish('worm', 'open_waters', 'perfect')
    let held = await x.call('heldGolden', [], () => heldGolden(x.db, x.uid))
    if (held) await x.call('mountGoldenTrophy', [held.id], () => mountGoldenTrophy(x.db, x.uid, held.id))
    held = await x.call('heldGolden', [], () => heldGolden(x.db, x.uid))
    if (held) await x.call('mountGoldenTrophy', [held.id], () => mountGoldenTrophy(x.db, x.uid, held.id))
    void a; void b
    await x.call('sellGoldenTrophy', [9999], () => sellGoldenTrophy(x.db, x.uid, 9999))
    await x.call('mountGoldenTrophy', [9999], () => mountGoldenTrophy(x.db, x.uid, 9999))
    for (let k = 0; k < 4; k++) {
      const shot = await x.castOnly('worm', 'shallows')
      if (!('error' in shot)) await x.call('tideTurnerSkip', [], () => tideTurnerSkip(x.db, x.uid))
    }
    await x.patchProfile({ equipped_special: null })
    await x.call('tideTurnerSkip', [], () => tideTurnerSkip(x.db, x.uid))
    await x.patchProfile({ has_tide_turner: false })
    await x.call('tideTurnerSkip', [], () => tideTurnerSkip(x.db, x.uid))
  }),
  // The wormhole: rerolled, declined by casting again (the credit settles),
  // and rerolled after the catch has left the hold (refused, still credited).
  await scripted('the wormhole', 23, captainWith(23, 80, 18), async x => {
    await x.call('rerollWormhole', [], () => rerollWormhole(x.db, x.uid))
    for (let k = 0; k < 45; k++) {
      const r = await x.fish('worm', k % 2 ? 'open_waters' : 'deep', k % 4 === 3 ? 'miss' : 'catch')
      if (!r.wormhole) continue
      if (k % 3 === 0) await x.call('rerollWormhole', [], () => rerollWormhole(x.db, x.uid))
      else if (k % 3 === 2) {
        await x.patchSave({ hold: {} })
        await x.call('rerollWormhole', [], () => rerollWormhole(x.db, x.uid))
      }
      if (k % 10 === 9) await x.patchSave({ hold: {} })
    }
  }),
  // The Almanac: a zone logged whole, claimed, claimed again, prestiged,
  // prestiged without a claim, claimed before it is whole again, and on up
  // past the cap to golden boosts; goldens survive a wipe; all four waters
  // prestiged; the Ancient Deep and nonsense refused.
  await scripted('the Almanac', 24, captainWith(24, 60, 10), async x => {
    await x.call('claimZoneReward', ['shallows'], () => claimZoneReward(x.db, x.uid, 'shallows'))
    const golden = idsIn('shallows')[0]
    for (let round = 0; round < 7; round++) {
      await x.patchSave({ collection: loggedAll('shallows', { [golden]: { is_golden: true } }) })
      await x.call('prestigeZone', ['shallows'], () => prestigeZone(x.db, x.uid, 'shallows'))
      await x.call('claimZoneReward', ['shallows'], () => claimZoneReward(x.db, x.uid, 'shallows'))
      await x.call('claimZoneReward', ['shallows'], () => claimZoneReward(x.db, x.uid, 'shallows'))
      await x.call('prestigeZone', ['shallows'], () => prestigeZone(x.db, x.uid, 'shallows'))
      await x.call('claimZoneReward', ['shallows'], () => claimZoneReward(x.db, x.uid, 'shallows'))
    }
    for (const zone of ['open_waters', 'deep', 'abyss']) {
      await x.patchSave({ collection: { ...x.save.collection, ...loggedAll(zone) } })
      await x.call('claimZoneReward', [zone], () => claimZoneReward(x.db, x.uid, zone))
      await x.call('prestigeZone', [zone], () => prestigeZone(x.db, x.uid, zone))
    }
    await x.call('prestigeZone', ['ancient_deep'], () => prestigeZone(x.db, x.uid, 'ancient_deep'))
    await x.call('claimZoneReward', ['ancient_deep'], () => claimZoneReward(x.db, x.uid, 'ancient_deep'))
    await x.call('prestigeZone', ['the_moon'], () => prestigeZone(x.db, x.uid, 'the_moon'))
    for (let k = 0; k < 10; k++) await x.fish('worm', 'shallows', 'perfect')
  }),
  // The Long Vigil's release: before the finale is cleared, then after; a
  // giant released twice, one never landed, one mastered, and a fish that is
  // not a giant; then the released one hunted on a lure.
  await scripted('the Vigil release', 25, captainWith(25, 95, 10, {
    has_ancient_deep_access: true, ancient_catches: [144, 145, 146, 147], ancient_vigil: { '146': { rank: 5, released: false } },
  }, { luminous: 120, golden: 80 }), async x => {
    await x.call('releaseAncient', [144], () => releaseAncient(x.db, x.uid, 144))
    await x.patchSave({ clears: ['the_sunken_hand'] })
    await x.call('releaseAncient', [144], () => releaseAncient(x.db, x.uid, 144))
    await x.call('releaseAncient', [144], () => releaseAncient(x.db, x.uid, 144))
    await x.call('releaseAncient', [148], () => releaseAncient(x.db, x.uid, 148))
    await x.call('releaseAncient', [146], () => releaseAncient(x.db, x.uid, 146))
    await x.call('releaseAncient', [12], () => releaseAncient(x.db, x.uid, 12))
    await x.call('releaseAncient', [145], () => releaseAncient(x.db, x.uid, 145))
    for (let k = 0; k < 40; k++) await x.fish(k % 2 ? 'golden' : 'luminous', 'ancient_deep', 'perfect')
  }),
  // The loadout: the Auto Caster switches; the specials bought (the Catcher
  // before the Caster, short of coin and Fathoms, then both) and equipped
  // (owned, not owned, the finale's own slot, nothing); hats and boats bought
  // (crate-only, earned, gem-priced, short, twice) and worn, including boats
  // earned by level and by achievement points; pets in both slots; and the
  // Completionist forged free, re-forged for coin, short, and refused rods.
  await scripted('the loadout', 26, captainWith(26, 80, 0, { doubloons: 6000, gems: 800, gauntlet_fathoms: 10, gauntlet_deepest: 3 }), async x => {
    const L = { setAutoFishing, setShowWaitTimer, buySpecialItem, equipSpecialItem, buyHat, equipHat, buyBoat, equipBoat, equipPet, setCompletionistEffects }
    const c = (op: keyof typeof L, ...args: unknown[]) =>
      x.call(op, args, () => (L[op] as (...a: unknown[]) => Promise<unknown>)(x.db, x.uid, ...args))
    await c('setAutoFishing', true); await c('setAutoFishing', false); await c('setShowWaitTimer', false)
    await c('buySpecialItem', 'auto_catcher'); await c('buySpecialItem', 'nonsense'); await c('buySpecialItem', 'tide_turner')
    await c('buySpecialItem', 'auto_caster'); await c('buySpecialItem', 'auto_caster')
    await c('buySpecialItem', 'auto_catcher')
    await x.patchProfile({ gauntlet_deepest: 9 }); await c('buySpecialItem', 'auto_catcher')
    await x.patchProfile({ gauntlet_fathoms: 40 }); await c('buySpecialItem', 'auto_catcher'); await c('buySpecialItem', 'auto_catcher')
    await c('equipSpecialItem', 'auto_caster'); await c('equipSpecialItem', 'phantom_hook'); await c('equipSpecialItem', 'anglers_patience')
    await c('equipSpecialItem', 'nonsense'); await c('equipSpecialItem', null)
    await x.patchProfile({ doubloons: 30000 })
    await c('buyHat', 'blue'); await c('buyHat', 'blue'); await c('buyHat', 'golden'); await c('buyHat', 'nonsense'); await c('buyHat', 'midnight')
    await c('equipHat', 'blue'); await c('equipHat', 'sky'); await c('equipHat', null)
    await c('buyBoat', 'oak'); await c('buyBoat', 'oak'); await c('buyBoat', 'charcoal'); await c('buyBoat', 'ice'); await c('buyBoat', 'nonsense')
    await c('buyBoat', 'fire'); await c('buyBoat', 'jetblack'); await c('buyBoat', 'golden')
    await c('equipBoat', 'oak'); await c('equipBoat', 'cherry'); await c('equipBoat', 'ice'); await c('equipBoat', 'celestial')
    await x.patchProfile({ unlocked_badges: BADGES.map(b => b.id).slice(0, 180) })
    await c('equipBoat', 'abyssal'); await c('equipBoat', 'celestial'); await c('equipBoat', null)
    await x.patchProfile({ unlocked_pets: ['parrot_red', 'plesiosaur_baby'] })
    await c('equipPet', 'parrot_red'); await c('equipPet', 'plesiosaur_baby'); await c('equipPet', 'seal_gold')
    await c('equipPet', null, 'bow'); await c('equipPet', null)
    await c('setCompletionistEffects', [11])
    await x.patchSave({ rodItems: { completionist: 1, twinstrike: 1, treasure: 1, lightsaber: 1, yolo: 1, reefguard: 1 } })
    await c('setCompletionistEffects', [11, 11, 16]); await c('setCompletionistEffects', [11, 16])
    await c('setCompletionistEffects', [3]); await c('setCompletionistEffects', [10])
    await c('setCompletionistEffects', [11, 16, 19, 15]); await c('setCompletionistEffects', [16, 19, 15])
    await x.patchProfile({ doubloons: 100 }); await c('setCompletionistEffects', [11])
    await c('setCompletionistEffects', [14, 1.5]); await c('setCompletionistEffects', [])
    // A color: free, not owned, earned by level (Fishing 25 for sand at 80), by
    // nav level (not reached), by achievement points, and nonsense.
    const cc = (id: string) => x.call('updateCharacterColor', [id], () => updateCharacterColor(x.db as never, x.uid, id))
    await cc('gray'); await cc('mint'); await cc('sand'); await cc('sky'); await cc('abyssal'); await cc('nonsense')
    await x.patchProfile({ unlocked_character_colors: ['mint'] }); await cc('mint')
    // A rod in hand: the Bamboo always, one held, one not, nonsense.
    const rod = (t: number) => x.call('equipTackleRod', [t], () => equipTackleRod(x.db as never, x.uid, t))
    await rod(0); await rod(15); await rod(18); await rod(99)
  }),
]
write('fishing_rest.json', { sessions: rest })
console.log(`  ${rest.length} scripted sessions, ${rest.reduce((n, s) => n + s.ops.length, 0)} calls`)

// ── Selling and the tackle shop ──
//
// Scripted like the rest: the market's stacks and whole holds across days of
// moods (and a long absence past the 48-hour catch-up), the buyers out in
// each water, and everything the tackle shop sells, refusals included.
const shop = [
  await scripted('the market', 31, captainWith(31, 60, 3, { doubloons: 500 }), async x => {
    const sell = localSellData(x.save)
    const hold = (h: Record<number, number>) => x.patchSave({ hold: h })
    const one = (id: number, q: number) => x.call('marketSellFish', [id, q], () => marketSellFish(sell, x.uid, id, q))
    const all = () => x.call('sellEntireHold', [], () => sellEntireHold(sell, x.uid))
    await all()
    await hold({ 1: 5, 2: 3, 7: 12, 60: 2 })
    await one(1, 2); await one(1, 3); await one(1, 1); await one(2, 0); await one(2, 1.5); await one(999, 1); await one(3, 1)
    for (let h = 0; h < 30; h++) {
      x.advance(3_600_000 * (h % 3 === 0 ? 1 : 2))
      await hold({ 1: 2 + h, 7: 1 + (h % 4), 12: 3, 30: 1 })
      if (h % 2) await one(7, 1)
      await all()
    }
    x.advance(3_600_000 * 100)
    await hold({ 1: 4, 9: 9 })
    await all()
    await all()
  }),
  await scripted('the buyers out in each water', 32, captainWith(32, 90, 3, { has_ancient_deep_access: true }), async x => {
    const sell = localSellData(x.save)
    const res = (z: string) => x.call('sellToResident', [z], () => sellToResident(sell, x.uid, z))
    await res('shallows')
    for (const z of ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep', 'the_moon']) {
      await x.patchSave({ hold: { 1: 4, 20: 3, 45: 7, 70: 2, 100: 5 } })
      await res(z)
    }
    await x.patchSave({ hold: { 143: 1 } })
    await res('ancient_deep')
    for (let k = 0; k < 12; k++) await x.fish('worm', 'shallows', 'catch')
    await res('shallows')
  }),
  await scripted('the tackle shop', 33, captainWith(33, 14, 0, { doubloons: 9000, is_premium: false }), async x => {
    const harb = localHarbourData(x.save)
    const c = (op: string, args: unknown[], run: () => Promise<unknown>) => x.call(op, args, run)
    const bait = (t: string, q: number) => c('buyBait', [t, q], () => buyBait(harb, x.uid, t, q))
    const buy = (t: number) => c('purchaseRod', [t], () => purchaseRod(harb, x.uid, t))
    const sellR = (t: number) => c('sellRod', [t], () => sellRod(harb, x.uid, t))
    const reel = () => c('buyReel', [], () => buyReel(harb, x.uid))
    const hook = () => c('buyHook', [], () => buyHook(harb, x.uid))
    const holdUp = () => c('upgradeFishHold', [], () => upgradeFishHold(harb, x.uid))
    const comp = () => c('claimCompletionistRod', [], () => claimCompletionistRod(harb, x.uid))
    const equip = (t: number) => c('equipTackleRod', [t], () => equipTackleRod(harb, x.uid, t))
    await bait('worm', 10); await bait('minnow', 5); await bait('luminous', 1); await bait('nonsense', 1); await bait('worm', 0); await bait('worm', 2.5); await bait('chum', 1000)
    await buy(1); await buy(1); await buy(3); await buy(4); await buy(0); await buy(14); await buy(99); await buy(19)
    await equip(1); await sellR(1); await sellR(1); await sellR(1); await sellR(0); await sellR(99)
    await equip(3); await sellR(3)
    for (let k = 0; k < 6; k++) { await reel(); await hook() }
    for (let k = 0; k < 5; k++) await holdUp()
    await x.patchProfile({ doubloons: 3_000_000, fishing_xp: XP_TABLE[98], fish_hold_tier: 7 })
    await buy(15); await x.patchProfile({ is_premium: true }); await buy(15); await buy(18)
    for (let k = 0; k < 9; k++) { await reel(); await hook() }
    await holdUp(); await holdUp()
    await comp()
    await x.patchSave({ collection: Object.fromEntries(SPECIES.map(s => [s.id, { catch_count: 1, is_golden: null }])) })
    await comp()
    await x.patchSave({ rapport: FOLK.map(f => ({ folk_id: f.id, points: 99999, seen_lines: [], last_chat_on: null, gifts_given: 0, want_fish_id: null, want_asked_at: null })), discoveries: ISLES.map(i => i.id) })
    await comp(); await comp()
  }),
]
shop.push(await scripted('the shipyard', 34, captainWith(34, 40, 1, { doubloons: 30000 }), async x => {
  const ship = localShipData(x.save)
  const tier = (col: string) => x.call('buyShipyardTier', [col], () => buyShipyardTier(ship, x.uid, col as never))
  const equip = (t: number) => x.call('equipRod', [t], () => equipRod(ship, x.uid, t))
  // Short of coin first, then every ladder to the top and past it.
  await tier('hull_speed_tier'); await tier('hull_speed_tier'); await tier('hull_speed_tier'); await tier('hull_speed_tier')
  await x.patchProfile({ doubloons: 900000 })
  for (const col of ['hull_speed_tier', 'hull_handling_tier', 'lantern_tier', 'hull_accel_tier']) {
    for (let k = 0; k < 7; k++) await tier(col)
  }
  await equip(0); await equip(1); await equip(99); await equip(14); await equip(15)
  await x.patchSave({ rodItems: { driftwood: 1 } })
  await equip(1)
}))
// Hotspots: casts inside each standing patch (one of each kind, through many
// ten-minute windows), so their effect on the wait, the rarity and the crate
// odds is checked against the TS; and casts just outside.
shop.push(await scripted('casting in hotspots', 35, captainWith(35, 99, 5, { has_ancient_deep_access: true, fish_hold_tier: 8 }, { worm: 400, golden: 60 }), async x => {
  for (let w = 0; w < 24; w++) {
    for (const h of hotspotsAt(clockNow())) {
      for (const at of [{ x: h.x, y: h.y }, { x: h.x + h.r + 5, y: h.y }]) {
        const bait = h.zoneId === 'ancient_deep' ? 'golden' : 'worm'
        const shot = await x.call('castLine', [bait, h.zoneId, at], () => castLine(x.db, x.uid, bait, h.zoneId, at))
        if (shot && !('error' in shot)) {
          x.advance(shot.waitMs + 1500)
          if (shot.fishId === CRATE_FISH_ID) await x.call('reelCrate', ['catch'], () => reelCrate(x.db, x.uid, 'catch'))
          else await x.call('reelIn', [shot.fishId, 'catch', bait], () => reelIn(x.db, x.uid, shot.fishId, 'catch', bait))
        }
        x.advance(4000)
      }
    }
    await x.patchSave({ hold: {} })
    x.advance(600_000)
  }
}))
// Exploring: sailing to every isle and dig site (the position saved, the fog
// revealed), landing, digging and fishing bottles out, with every refusal: too
// far, too low a level, twice, a stale bottle.
shop.push(await scripted('exploring', 36, captainWith(36, 40, 2, {}), async x => {
  const sea = localSeaData(x.save)
  const sell = localSellData(x.save)
  const pos = (px: number, py: number) => x.call('saveSeaPosition', [px, py, fogReveal(px, py)], () => saveSeaPosition(sell, x.uid, px, py, fogReveal(px, py)))
  const land = (id: string) => x.call('goAshore', [id], () => goAshore(sea, x.uid, id))
  const dig = (id: string) => x.call('digHere', [id], () => digHere(sea, x.uid, id))
  const bottle = (k: string) => x.call('openBottle', [k], () => openBottle(sea, x.uid, k))
  await land('nowhere'); await dig('nowhere'); await bottle('1:2:3'); await bottle('nonsense')
  for (const i of ISLES) {
    await pos(i.x + i.r + 100, i.y)
    await land(i.id); await land(i.id)
    x.advance(30_000)
  }
  await pos(0, 0); await land('shallows-1')
  for (const d of DIG_SITES) {
    await pos(d.x + 60, d.y)
    await dig(d.id); await dig(d.id)
    x.advance(30_000)
  }
  await x.patchProfile({ fishing_xp: XP_TABLE[98] })
  for (const i of ISLES) { await pos(i.x, i.y); await land(i.id) }
  for (const d of DIG_SITES.slice(0, 6)) { await pos(d.x, d.y); await dig(d.id) }
  await x.patchSave({ digs: [] })
  for (let k = 0; k < 40; k++) {
    const site = DIG_SITES[k % DIG_SITES.length]
    const near = bottlesAround(site.x, site.y, 5200, clockNow())
    for (const b of near.slice(0, 3)) {
      const at = bottlePos(b, clockNow() / 1000)
      await pos(at.x, at.y)
      await bottle(b.key)
      await pos(at.x + 2000, at.y)
      await bottle(b.key)
    }
    x.advance(700_000)
  }
  await x.call('getDigState', [], () => getDigState(sea, x.uid))
}))
write('shop.json', { sessions: shop })
{
  const cases: { now: number; x: number; y: number; bottles: unknown[] }[] = []
  for (let k = 0; k < 400; k++) {
    const now = START + k * 1_337_000
    const x = -20000 + (k * 7919) % 40000, y = (k * 104729) % 22000
    cases.push({ now, x, y, bottles: bottlesAround(x, y, 5200, now).map(b => ({ ...b, pos: bottlePos(b, now / 1000) })) })
  }
  write('bottles.json', { cases })
  console.log('  400 bottle moments')
}
// The patches themselves, at 2,000 moments across a few weeks.
{
  const at: number[] = []
  for (let k = 0; k < 2000; k++) at.push(START + k * 977_000)
  write('hotspots.json', { cases: at.map(t => ({ now: t, spots: hotspotsAt(t) })) })
  console.log('  2000 hotspot moments')
}
console.log(`  ${shop.length} shop sessions, ${shop.reduce((n, s) => n + s.ops.length, 0)} calls`)

// ── Save files ──
write('save.json', {
  saves: [
    { name: 'a new captain', text: serializeSave(newCaptain(), {}, SAVED_AT) },
    ...sessions.map(s => ({ name: `after: ${s.name}`, text: s.end })),
  ],
})

const opCount = sessions.reduce((n, s) => n + s.ops.length, 0)
console.log(`  ${sessions.length} fishing sessions, ${opCount} calls`)
