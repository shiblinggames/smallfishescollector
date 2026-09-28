// THE OFFLINE SPIKE, STAGE 1 (Steam prep, step 8, 2026-09-28).
//
// Runs the REAL cast and reel (lib/core/fishing) against a LOCAL save
// (lib/data/local/fishingLocal) with the network nowhere in the picture:
//   1. the import trees of the core and the local store are walked, and the
//      spike fails if either reaches Supabase, Next, or a 'use server' file;
//   2. a captain fishes 80 casts under a seeded generator and a scripted clock,
//      and after every one the bait, hold, log and XP must have moved exactly as
//      the result says, a spent cast must pay nothing a second time, and a reel
//      before the bite must be refused without spending the cast;
//   3. the whole session is replayed from the same seed and must end in the
//      same save.
//
//   npx tsx scripts/check-offline-fishing.mts

import fs from 'fs'
import path from 'path'
import { castLine, reelIn } from '../lib/core/fishing'
import { localFishingData, type LocalSave } from '../lib/data/local/fishingLocal'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE, getLevelFromXP } from '../lib/fishingLevel'
import { CRATE_FISH_ID } from '../lib/fishingRules'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()

// ── 1. Nothing of the server on the offline path ──
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue                                   // type-only: erased at build, never loaded
    out.push(m[3])
  }
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1])
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
function walk(entry: string) {
  const seen = new Set<string>(); const bad: string[] = []; const stack = [entry]
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
  return { files: seen.size, bad }
}
for (const entry of ['lib/core/fishing.ts', 'lib/data/local/fishingLocal.ts']) {
  const { files, bad } = walk(path.join(ROOT, entry))
  if (bad.length) for (const b of bad) fail(`${entry} reaches the server: ${b}`)
  else console.log(`  ${entry}: ${files} modules, none of them the server`)
}

// ── 2. A captain fishing a local save ──
const SPECIES = (JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[])
const UID = 'local-captain'
function freshSave(): LocalSave {
  return {
    uid: UID,
    profile: {
      fishing_xp: XP_TABLE[20], doubloons: 5000, gems: 0, rod_tier: 3, hook_tier: 2, line_tier: 1, fish_hold_tier: 4,
      completionist_effects: null, ancient_catches: [], ancient_vigil: null, active_event: null, catch_pending: false,
      pending_cast: null, pending_reroll: null, fishing_renown_alloc: null, has_ancient_deep_access: false,
      current_perfect_streak: 0, highest_perfect_streak: 0, total_perfects: 0, zone_perfects: {}, lifetime_species: [],
      prestige_levels: {}, zone_golden_boost: {}, unlocked_pets: [], unlocked_character_colors: [], unlocked_badges: [],
      equipped_special: null, equipped_special_2: null, has_phantom_hook: false, has_perfected_sigil: false,
      has_anglers_patience: false, anglers_patience_xp: 0, borrowed_jaw_xp: 0, equipped_raid_items: [],
      finn_spoil_free: null, finn_spoil_paid: null, fishing_abyss_streak: 0, force_shiny_next_perfect: false,
      force_shiny_always: false, is_premium: false, premium_expires_at: null, is_admin: false, fishing_casts: 0,
    },
    species: SPECIES,
    bait: { worm: 200 }, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0, 1, 2, 3], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
  }
}

async function session(seed: number, casts: number, checks: boolean) {
  const save = freshSave()
  const db = localFishingData(save)
  let now = Date.parse('2026-09-28T12:00:00.000Z')
  installRng(mulberry32(seed))
  installClock(() => now)
  let landed = 0, missed = 0, crates = 0
  try {
    for (let k = 0; k < casts; k++) {
      const baitBefore = save.bait.worm
      const shot = await castLine(db, UID, 'worm', 'shallows')
      if ('error' in shot) { fail(`cast ${k} refused: ${shot.error}`); break }
      if (checks && save.bait.worm !== baitBefore - 1) fail(`cast ${k} took ${baitBefore - save.bait.worm} worms, not 1`)

      if (checks && k === 0) {
        // Reeling before the bite is refused, and the cast is still out.
        const early = await reelIn(db, UID, shot.fishId, 'catch', 'worm')
        if (!('error' in early) || !save.profile.pending_cast) fail('a reel before the bite was paid or spent the cast')
      }
      now += shot.waitMs + 1500

      if (shot.fishId === CRATE_FISH_ID) {
        crates++
        await reelIn(db, UID, shot.fishId, 'miss', 'worm')   // a crate is opened by reelCrate; here it is let go
        continue
      }
      const result = k % 4 === 3 ? 'miss' : k % 4 === 0 ? 'perfect' : 'catch'
      const xpBefore = Number(save.profile.fishing_xp)
      const holdBefore = Object.values(save.hold).reduce((n, q) => n + q, 0)
      const loggedBefore = save.collection[shot.fishId]?.catch_count ?? 0
      const r = await reelIn(db, UID, shot.fishId, result, 'worm')
      if ('error' in r) { fail(`reel ${k} errored: ${r.error}`); break }
      if (!r.caught) {
        missed++
        if (checks && save.profile.current_perfect_streak !== 0) fail(`a miss on cast ${k} left the streak at ${save.profile.current_perfect_streak}`)
        continue
      }
      landed++
      const holdAfter = Object.values(save.hold).reduce((n, q) => n + q, 0)
      if (checks) {
        if (Number(save.profile.fishing_xp) !== xpBefore + r.xpGained) fail(`cast ${k}: XP moved ${Number(save.profile.fishing_xp) - xpBefore}, the card said ${r.xpGained}`)
        if (!r.isShiny && holdAfter !== holdBefore + (r.catchQty ?? 1)) fail(`cast ${k}: the hold grew ${holdAfter - holdBefore}, the card said ${r.catchQty}`)
        if (!r.wormhole && (save.collection[shot.fishId]?.catch_count ?? 0) !== loggedBefore + 1) fail(`cast ${k}: the log did not count the catch once`)
        if (r.xpCatch != null && (r.xpCatch + (r.perfectBonusXP ?? 0) + (r.xpStreak ?? 0)) !== r.xpGained) fail(`cast ${k}: the XP parts do not add up`)
        // A spent cast pays nothing a second time.
        const again = await reelIn(db, UID, shot.fishId, result, 'worm')
        if (!('caught' in again) || again.caught) fail(`cast ${k} paid twice`)
      }
      // Keep the hold from filling: an offline captain sells too, and this spike is about fishing.
      if (holdAfter > 150) save.hold = {}
    }
  } finally {
    installRng(null)
    installClock(null)
  }
  return { save, landed, missed, crates }
}

const a = await session(2026, 80, true)
console.log(`  80 casts on a local save: ${a.landed} landed, ${a.missed} missed, ${a.crates} crates; level ${getLevelFromXP(XP_TABLE[20])} -> ${getLevelFromXP(Number(a.save.profile.fishing_xp))}, ${Object.keys(a.save.collection).length} species logged, ${a.save.bait.worm} worms left`)
if (a.landed === 0) fail('nothing was landed, so the checks tested nothing')

// ── 3. The same seed is the same session ──
const strip = (s: LocalSave) => JSON.stringify({ ...s, species: null, lifetime: Object.fromEntries(Object.entries(s.lifetime).map(([k, v]) => [k, v.n])), bests: Object.fromEntries(Object.entries(s.bests).map(([k, v]) => [k, v.len])), collection: Object.fromEntries(Object.entries(s.collection).map(([k, v]) => [k, v.catch_count])), shinies: s.shinies.map(x => x.fish_id) })
const b = await session(2026, 80, false)
const c = await session(2026, 80, true)
if (strip(b.save) !== strip(c.save)) fail('the same seed ended in a different save (did something read the real dice or clock?)')
const d = await session(2027, 80, false)
if (strip(d.save) === strip(b.save)) fail('a different seed ended in the same save, so the dice are not reaching the core')

console.log(`\n  Offline fishing spike: no server on the path, casts and reels on a local save, one-shot claims, determinism ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
