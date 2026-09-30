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
import { castLine, reelIn, reelCrate } from '../lib/core/fishing'
import { localFishingData, type LocalSave } from '../lib/data/local/fishingLocal'
import { serializeSave } from '../lib/data/local/saveFile'
import { starterSave } from '../lib/data/local/starter'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32, seedOf, type Rng } from '../lib/rng'
import { installClock } from '../lib/clock'
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

// ── Save files ──
write('save.json', {
  saves: [
    { name: 'a new captain', text: serializeSave(newCaptain(), {}, SAVED_AT) },
    ...sessions.map(s => ({ name: `after: ${s.name}`, text: s.end })),
  ],
})

const opCount = sessions.reduce((n, s) => n + s.ops.length, 0)
console.log(`  ${sessions.length} fishing sessions, ${opCount} calls`)
