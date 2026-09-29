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
//      same save;
//   4. (stage 2) the save is written to a JSON file mid-session, loaded into a
//      brand-new store and fishing continues: it must end exactly where an
//      unbroken session does. A write interrupted mid-way leaves the old save
//      whole; a file that is not a save, or is from a newer game, is refused;
//      a web export converts into a local save (catman's real one too, when
//      saves/catman-for-offline.json is present) and can be fished offline;
//   5. the rest of fishing offline: crates (opened in the sessions above too),
//      the wormhole, the Tide Turner, the golden choice, the level rewards and
//      the loadout shops, each checked for what it moved and for its one-shot
//      guard.
//
//   npx tsx scripts/check-offline-fishing.mts

import fs from 'fs'
import path from 'path'
import { castLine, reelIn, reelCrate, rerollWormhole, tideTurnerSkip, heldGolden, sellGoldenTrophy, mountGoldenTrophy, claimFishingLevelRewards } from '../lib/core/fishing'
import { buyHat, buyBoat, equipHat, equipBoat, equipPet, equipSpecialItem, buySpecialItem, setAutoFishing, setShowWaitTimer, setCompletionistEffects } from '../lib/core/loadout'
import { HATS } from '../lib/hats'
import { BOATS } from '../lib/boats'
import { PETS, petSlot, PET_SLOT_COLUMN } from '../lib/pets'
import { SPECIAL_ITEMS } from '../lib/specialItems'
import { RODS, COMPLETIONIST_TIER, REFORGE_COST, rodHasUniqueEffect } from '../lib/rods'
import { localFishingData, type LocalSave } from '../lib/data/local/fishingLocal'
import { serializeSave, deserializeSave, loadSave, writeSave, fromWebExport, LOCAL_SAVE_FORMAT, type WebExport } from '../lib/data/local/saveFile'
import { nodeSaveStorage } from '../lib/data/local/nodeSaveStorage'
import os from 'os'
import type { SpeciesRow } from '../lib/data/fishingData'
import { freshCasino } from '../lib/data/local/save'
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
for (const entry of ['lib/core/fishing.ts', 'lib/core/loadout.ts', 'lib/data/local/fishingLocal.ts', 'lib/data/local/saveFile.ts']) {
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
    clears: [], rods: [0, 1, 2, 3], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {}, deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(),
  }
}

async function session(seed: number, casts: number, checks: boolean, restart?: { at: number; file: string }) {
  let save = freshSave()
  let db = localFishingData(save)
  let now = Date.parse('2026-09-28T12:00:00.000Z')
  installRng(mulberry32(seed))
  installClock(() => now)
  let landed = 0, missed = 0, crates = 0
  try {
    for (let k = 0; k < casts; k++) {
      if (restart && k === restart.at) {
        // Quit and come back: to disk, then into a brand-new store.
        const storage = nodeSaveStorage(restart.file)
        await writeSave(storage, save)
        const loaded = await loadSave(storage, SPECIES)
        if (!loaded) { fail('the save file was not there to load'); break }
        save = loaded.save
        db = localFishingData(save)
      }
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
        const loot = await reelCrate(db, UID, k % 2 ? 'perfect' : 'catch')
        if ('error' in loot) fail(`crate on cast ${k} would not open: ${loot.error}`)
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
// Compared as data, not as text: key order is not state (a reloaded save
// attaches the species last), so keys are sorted at every level first.
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, (x as Record<string, unknown>)[k]])) : x)
const strip = (s: LocalSave) => canonical({ ...s, species: null, lifetime: Object.fromEntries(Object.entries(s.lifetime).map(([k, v]) => [k, v.n])), bests: Object.fromEntries(Object.entries(s.bests).map(([k, v]) => [k, v.len])), collection: Object.fromEntries(Object.entries(s.collection).map(([k, v]) => [k, v.catch_count])), shinies: s.shinies.map(x => x.fish_id) })
const b = await session(2026, 80, false)
const c = await session(2026, 80, true)
if (strip(b.save) !== strip(c.save)) fail('the same seed ended in a different save (did something read the real dice or clock?)')
const d = await session(2027, 80, false)
if (strip(d.save) === strip(b.save)) fail('a different seed ended in the same save, so the dice are not reaching the core')

// ── 4. The save file ──
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stb-save-'))
try {
  const file = path.join(tmpDir, 'captain.json')
  const unbroken = await session(2026, 80, false)
  const restarted = await session(2026, 80, false, { at: 40, file })
  if (strip(restarted.save) !== strip(unbroken.save)) fail('quitting and reloading mid-session changed how the session ended')
  const text = fs.readFileSync(file, 'utf8')
  if (text.includes('"scientific_name"')) fail('the save file carries the species table (it is content, not state)')
  console.log(`  quit at cast 40, reloaded from a ${text.length.toLocaleString()}-byte file, fished on: same end as an unbroken session`)

  // An interrupted write leaves the old save whole.
  const storage = nodeSaveStorage(file)
  const before = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file + '.tmp', before.slice(0, 200))          // a crash after the temp write began
  if ((await storage.read()) !== before) fail('a half-written save replaced the old one')
  await writeSave(storage, unbroken.save)                          // the next save still lands
  if (!fs.existsSync(file) || fs.existsSync(file + '.tmp')) fail('a save after an interrupted one did not land cleanly')

  // Not a save, or from the future: refused, not half-loaded.
  const refuses = (t: string) => { try { deserializeSave(t, SPECIES); return false } catch { return true } }
  if (!refuses('{"hello":1}')) fail('a file that is not a save was loaded')
  if (!refuses(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 999, save: {}, carried: {} }))) fail('a save from a newer game was loaded')
  if (!refuses(before.slice(0, 200))) fail('a truncated save was loaded')
  const again = deserializeSave(serializeSave(unbroken.save, { user_crew: [{ id: 1 }] }), SPECIES)
  if (strip(again.save) !== strip(unbroken.save) || again.carried.user_crew?.length !== 1) fail('a save did not survive a round trip through text')
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

// ── From the web ──
{
  const exp: WebExport = {
    format: 'x', version: 1, userId: 'web-captain', username: 'web', profile: { ...freshSave().profile, doubloons: 77 },
    tables: {
      bait_inventory: [{ bait_type: 'worm', quantity: 12 }], fish_inventory: [{ fish_id: 1, quantity: 3 }, { fish_id: 2, quantity: 0 }],
      fish_collection: [{ fish_id: 1, catch_count: 9, is_golden: true, last_caught_at: '2026-09-01T00:00:00Z' }],
      fish_lifetime: [{ fish_id: 1, catches: 9, last_caught_at: '2026-09-01T00:00:00Z' }],
      fish_personal_bests: [{ fish_id: 1, best_length_in: 7.5, caught_at: '2026-09-01T00:00:00Z' }],
      raid_completions: [{ raid_id: 'the_throne' }], rod_inventory: [{ rod_tier: 0 }, { rod_tier: 4 }],
      user_crew: [{ id: 5 }, { id: 6 }], expeditions: [{ id: 9 }],
    },
  }
  const { save, carried } = fromWebExport(exp, SPECIES)
  if (save.bait.worm !== 12 || save.hold[1] !== 3 || 2 in save.hold || save.collection[1]?.is_golden !== true || save.bests[1]?.len !== 7.5
      || !save.clears.includes('the_throne') || save.rods.join() !== '0,4' || save.profile.doubloons !== 77) fail('a web export did not convert faithfully')
  if (save.crew.length !== 2 || 'user_crew' in carried || carried.expeditions?.length !== 1 || 'bait_inventory' in carried) fail('tables the offline core does not model were not carried (or modelled ones were)')
}
const realExport = path.join(ROOT, 'saves', 'catman-for-offline.json')
if (fs.existsSync(realExport)) {
  const exp = JSON.parse(fs.readFileSync(realExport, 'utf8')) as WebExport
  const { save, carried } = fromWebExport(exp, SPECIES)
  const db = localFishingData(save)
  const xp0 = Number(save.profile.fishing_xp)
  let now = Date.parse('2026-09-28T12:00:00.000Z')
  save.profile.pending_cast = null; save.profile.catch_pending = false
  installRng(mulberry32(99)); installClock(() => now)
  let landed = 0
  try {
    for (let k = 0; k < 20; k++) {
      if (Object.values(save.hold).reduce((n, q) => n + q, 0) > 150) save.hold = {}
      const shot = await castLine(db, save.uid, 'worm', 'shallows')
      if ('error' in shot) { fail(`catman's offline cast ${k} refused: ${shot.error}`); break }
      now += shot.waitMs + 1500
      const r = await reelIn(db, save.uid, shot.fishId, shot.fishId === CRATE_FISH_ID ? 'miss' : 'catch', 'worm')
      if ('caught' in r && r.caught) landed++
    }
  } finally { installRng(null); installClock(null) }
  console.log(`  catman's real export, converted: ${Object.keys(save.collection).length} species logged, ${save.rods.length} rods, ${Object.keys(carried).length} tables carried; 20 offline casts landed ${landed}, fishing XP ${xp0.toLocaleString()} -> ${Number(save.profile.fishing_xp).toLocaleString()}`)
  if (landed === 0) fail("catman's converted save landed nothing offline")
} else {
  console.log('  (saves/catman-for-offline.json not present: the real-export check is skipped)')
}

// ── 5. The rest of fishing, offline ──
// The crate, the wormhole, the Tide Turner, the golden choice, the level
// rewards and the loadout, each on a fresh local save, each checked for what it
// moved AND for its one-shot guard: the second call pays nothing.
{
  const fresh = () => { const s = freshSave(); return { s, db: localFishingData(s), p: s.profile } }
  let now = Date.parse('2026-09-28T12:00:00.000Z')
  installRng(mulberry32(7)); installClock(() => now)
  try {
    // The crate: cast until one surfaces, open it once.
    {
      const { s, db, p } = fresh()
      let opened = 0
      for (let k = 0; k < 400 && opened < 3; k++) {
        const shot = await castLine(db, UID, 'worm', 'shallows')
        if ('error' in shot) { fail(`crate hunt cast refused: ${shot.error}`); break }
        now += shot.waitMs + 1500
        if (shot.fishId !== CRATE_FISH_ID) { await reelIn(db, UID, shot.fishId, 'miss', 'worm'); continue }
        const before = JSON.stringify({ d: p.doubloons, b: s.bait, c: p.unlocked_character_colors, bo: p.unlocked_boats, h: p.unlocked_hats, pe: p.unlocked_pets })
        const streak0 = Number(p.current_perfect_streak ?? 0)
        const loot = await reelCrate(db, UID, 'perfect')
        if ('error' in loot) { fail(`a live crate would not open: ${loot.error}`); break }
        opened++
        const after = JSON.stringify({ d: p.doubloons, b: s.bait, c: p.unlocked_character_colors, bo: p.unlocked_boats, h: p.unlocked_hats, pe: p.unlocked_pets })
        if (after === before && !loot.dupePet) fail(`a ${loot.type} crate paid nothing`)
        if (loot.perfectStreak !== streak0 + 1 || p.current_perfect_streak !== streak0 + 1) fail('a perfect crate did not move the streak by one')
        if (!('error' in (await reelCrate(db, UID, 'perfect')))) fail('a crate opened twice')
      }
      if (opened === 0) fail('no crate surfaced in 400 casts, so the crate went untested')
      if (Number(p.fishing_crates_opened ?? 0) !== opened) fail(`crates opened ${opened}, the counter says ${p.fishing_crates_opened}`)
      if (!('error' in (await reelCrate(db, UID, 'catch')))) fail('a crate opened with no cast out')
      console.log(`  crates: ${opened} opened offline, each paid once and moved the streak`)
    }

    // The wormhole: a live reroll swaps the stack; a spent or sold one refuses.
    {
      const { s, db, p } = fresh()
      p.rod_tier = 3
      s.hold = { 1: 4 }
      p.pending_reroll = { fishId: 1, qty: 4, habitat: 'shallows' }
      const r = await rerollWormhole(db, UID)
      if ('error' in r) fail(`a live wormhole refused: ${r.error}`)
      else {
        if (s.hold[1] !== undefined || s.hold[r.fish.id] !== 4) fail('the wormhole did not swap the stack one for one')
        if (!(r.fish.id in s.collection)) fail('the wormhole fish was not logged')
      }
      if (!('error' in (await rerollWormhole(db, UID)))) fail('a wormhole rerolled twice')
      // Sold before the reroll: refused, and the original still gets its log credit.
      const t = fresh()
      t.s.hold = {}
      t.p.pending_reroll = { fishId: 2, qty: 1, habitat: 'shallows' }
      const gone = await rerollWormhole(t.db, UID)
      if (!('error' in gone) || Object.keys(t.s.hold).length !== 0) fail('a wormhole minted fish for a catch already sold')
      if (!(2 in t.s.collection)) fail('a refused wormhole erased the catch from the log')
    }

    // The Tide Turner: equipped only, three a day, a new day resets.
    {
      const { db, p } = fresh()
      p.has_tide_turner = true
      if (!('error' in (await tideTurnerSkip(db, UID)))) fail('an unequipped Tide Turner skipped')
      p.equipped_special = 'tide_turner'
      p.current_perfect_streak = 5
      const left = []
      for (let k = 0; k < 3; k++) { const r = await tideTurnerSkip(db, UID); left.push('error' in r ? -1 : r.skipsLeft) }
      if (left.join() !== '2,1,0') fail(`skips left read ${left.join()}, not 2,1,0`)
      if (!('error' in (await tideTurnerSkip(db, UID)))) fail('a fourth skip in a day was allowed')
      if (p.current_perfect_streak !== 5) fail('a Tide Turner skip broke the streak')
      now += 24 * 3600_000
      if ('error' in (await tideTurnerSkip(db, UID))) fail('the skips did not come back the next day')
    }

    // The golden choice: held until answered, sold once, mounted once per species.
    {
      const { s, db, p } = fresh()
      s.collection[1] = { catch_count: 1, is_golden: null }
      const a = (await db.addShiny(UID, 1, 5.5))!
      const b = (await db.addShiny(UID, 1, 6.1))!
      const held = await heldGolden(db, UID)
      if (held?.id !== a || held.alreadyMounted) fail('the oldest golden was not the one offered')
      const d0 = Number(p.doubloons)
      const sold = await sellGoldenTrophy(db, UID, a)
      if ('error' in sold || Number(p.doubloons) !== d0 + sold.earned || sold.earned <= 0) fail('a golden sale did not pay what it said')
      if (!('error' in (await sellGoldenTrophy(db, UID, a)))) fail('a golden sold twice')
      if ((await heldGolden(db, UID))?.id !== b) fail('the next golden did not come up after the first was answered')
      if ('error' in (await mountGoldenTrophy(db, UID, b)) || s.collection[1].is_golden !== true) fail('a golden did not mount')
      const c = (await db.addShiny(UID, 1, 7))!
      if (!('error' in (await mountGoldenTrophy(db, UID, c)))) fail('a species was mounted golden twice')
      if ((await heldGolden(db, UID))?.alreadyMounted !== true) fail('a held golden of a mounted species offered the mount')
    }

    // The level rewards: paid once, the watermark is the claim.
    {
      const { s, db, p } = fresh()
      p.claimed_fishing_levels = 1; p.fish_hold_tier = 0
      const d0 = Number(p.doubloons), g0 = Number(p.gems), w0 = s.bait.worm
      const r = await claimFishingLevelRewards(db, UID)
      const paidD = r.granted.reduce((n, x) => n + (x.reward.doubloons ?? 0), 0)
      const paidG = r.granted.reduce((n, x) => n + (x.reward.gems ?? 0), 0)
      const lv = getLevelFromXP(Number(p.fishing_xp))
      if (r.from !== 1 || r.to !== lv || p.claimed_fishing_levels !== lv) fail(`the level claim covered ${r.from}..${r.to}, not 1..${lv}`)
      if (Number(p.doubloons) !== d0 + paidD || Number(p.gems) !== g0 + paidG) fail('the level rewards paid something other than what they listed')
      if (paidD + paidG === 0 && s.bait.worm === w0) fail('twenty-odd levels paid nothing, so the payout went untested')
      const again = await claimFishingLevelRewards(db, UID)
      if (again.granted.length !== 0 || Number(p.doubloons) !== d0 + paidD) fail('the level rewards paid twice')
    }

    // The shops: the spend is the guard, owned things are not sold twice.
    {
      const { s, db, p } = fresh()
      const hat = HATS.find(h => !h.crateOnly && h.cost > 0)!
      const boat = BOATS.find(b => !b.crateOnly && !b.gate && !(b.gemPrice && b.gemPrice > 0) && b.cost > 0)!
      p.doubloons = hat.cost - 1
      if (!('error' in (await buyHat(db, UID, hat.id))) || p.doubloons !== hat.cost - 1 || (p.unlocked_hats ?? []).length) fail('a hat was sold on credit')
      p.doubloons = hat.cost + boat.cost
      if ('error' in (await buyHat(db, UID, hat.id)) || p.equipped_hat !== hat.id || p.doubloons !== boat.cost) fail('a hat was not bought and worn at its price')
      if (!('error' in (await buyHat(db, UID, hat.id))) || p.doubloons !== boat.cost) fail('an owned hat was sold again')
      if ('error' in (await buyBoat(db, UID, boat.id)) || p.equipped_boat !== boat.id || p.doubloons !== 0) fail('a boat was not bought and sailed at its price')
      if (s.ledger.filter(l => l.amount < 0).length !== 2) fail('the purchases were not both on the ledger')
      if (!('error' in (await equipHat(db, UID, 'not_a_hat')))) fail('an unowned hat was worn')
      if ('error' in (await equipHat(db, UID, null)) || p.equipped_hat !== null) fail('a hat would not come off')

      // An earned boat heals itself into the fleet once its gate is met.
      const earned = BOATS.find(b => b.gate?.kind === 'fishing' && b.gate.level <= 20)
      if (earned) {
        if ('error' in (await equipBoat(db, UID, earned.id)) || !(p.unlocked_boats as string[]).includes(earned.id)) fail('an earned boat did not heal into the fleet')
      }
      const locked = BOATS.find(b => b.gate?.kind === 'fishing' && b.gate.level > 20)
      if (locked && !('error' in (await equipBoat(db, UID, locked.id)))) fail('a boat above the captain\'s level was sailed')

      // Pets: owned only, and the pet picks its own slot.
      const pet = PETS[0]
      if (!('error' in (await equipPet(db, UID, pet.id)))) fail('an unowned pet was seated')
      p.unlocked_pets = [pet.id]
      if ('error' in (await equipPet(db, UID, pet.id, 'bow')) || p[PET_SLOT_COLUMN[petSlot(pet)!]] !== pet.id) fail('a pet did not take its own slot')

      // The special slot: owned only; the Auto Caster costs what it says, once.
      if (!('error' in (await equipSpecialItem(db, UID, 'tide_turner')))) fail('an unowned special was equipped')
      const caster = SPECIAL_ITEMS.find(i => i.id === 'auto_caster')!
      const col = typeof caster.costFathoms === 'number' ? 'gauntlet_fathoms' : 'doubloons'
      const cost = typeof caster.costFathoms === 'number' ? caster.costFathoms : caster.shopCost!
      p.gauntlet_deepest = 999
      p[col] = cost
      if ('error' in (await buySpecialItem(db, UID, 'auto_caster')) || p.has_auto_caster !== true || p[col] !== 0) fail('the Auto Caster was not bought at its price')
      p[col] = cost
      if (!('error' in (await buySpecialItem(db, UID, 'auto_caster'))) || p[col] !== cost) fail('the Auto Caster was sold twice')
      await setAutoFishing(db, UID, false); await setShowWaitTimer(db, UID, true)
      if (p.auto_fishing_on !== false || p.show_wait_timer !== true) fail('the fishing preferences did not stick')
    }

    // The Completionist forge: first forge free, a re-forge charged, never on credit.
    {
      const { s, db, p } = fresh()
      const effectRods = RODS.filter(r => r.tier !== COMPLETIONIST_TIER && rodHasUniqueEffect(r)).slice(0, 4).map(r => r.tier)
      s.rods = [COMPLETIONIST_TIER, ...effectRods]
      p.doubloons = 0
      const first = await setCompletionistEffects(db, UID, effectRods.slice(0, 3))
      if ('error' in first || !first.firstForge || first.charged) fail('the first forge was not free')
      if (!('error' in (await setCompletionistEffects(db, UID, effectRods.slice(1, 4))))) fail('a re-forge went through on credit')
      p.doubloons = REFORGE_COST
      const re = await setCompletionistEffects(db, UID, effectRods.slice(1, 4))
      if ('error' in re || !re.charged || p.doubloons !== 0) fail('a re-forge was not charged its cost')
      if (!(p.unlocked_badges as string[]).includes('reforged')) fail('a full paid re-forge did not earn Reforged')
      if (!('error' in (await setCompletionistEffects(db, UID, [99])))) fail('an unowned rod was forged in')
    }
    console.log('  the rest of fishing: wormhole, Tide Turner, golden sell and mount, level rewards, hats, boats, pets, specials, the forge: each paid once, guards held')
  } finally {
    installRng(null); installClock(null)
  }
}

console.log(`\n  Offline fishing spike: no server on the path, casts and reels on a local save, one-shot claims, determinism, the save file, the web export and the rest of fishing ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
