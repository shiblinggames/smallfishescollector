// THE SHIP AND THE SHIPYARD, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL ship paths (lib/core/ship) against a LOCAL save
// (lib/data/local/shipLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the raid loadout: only owned items, capped to the hull's mounts (the
//      Expanded Armory's extra one counted);
//   3. the Forge: locked without its unlock, a recipe learned once for its
//      Fathoms, a forge that eats its components and mints the result once;
//   4. the Abyssal Accelerator: locked without both unlocks, charged once for
//      its gems (the epic taken off the ship), not claimable early, claimed once;
//   5. the ultimate: every gate, the build paid once, re-picked for free, going
//      live on read after its clock, a retool, the Full Schematics finishing a
//      retool on the spot, then free switching;
//   6. the Sixth Berth and the Expanded Armory: gated on their raids, bought
//      once, a second buy refused with the purse untouched;
//   7. hull skins (owned and fitting only), the one-time guides, the Shipyard's
//      four ladders to their tops and the rods;
//   8. the save file: version 7 upgrades to 8 with the ship's defaults, and a
//      starter save can buy what a web profile can.
//
//   npx tsx scripts/check-offline-ship.mts

import fs from 'fs'
import path from 'path'
import * as ship from '../lib/core/ship'
import { localShipData } from '../lib/data/local/shipLocal'
import { freshCasino, SHIP_PROFILE_DEFAULTS, type LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { FORGE_RECIPES, EPIC_TO_LEGENDARY } from '../lib/raidItems'
import { raidItemSlotsForTier } from '../lib/expeditions'
import { ABYSSAL_ACCEL_GEM_COST, ABYSSAL_ACCEL_MS } from '../lib/abyssalAccelerator'
import { SHIP_AUGMENTS, AUGMENT_COST, RETOOL_COST, SCHEMATICS_COST, ULTIMATE_BUILD_MS } from '../lib/shipAugments'
import { SIXTH_BERTH_COST, ARMORY_EXPANSION_COST } from '../lib/shipBerth'
import { SHIP_SKINS, canEquipShipSkin } from '../lib/shipSkins'
import { MAX_HULL_TIER, MAX_HANDLING_TIER, MAX_ACCEL_TIER, MAX_LANTERN_TIER } from '../lib/shipyard'
import { RODS } from '../lib/rods'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()

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
for (const entry of ['lib/core/ship.ts', 'lib/data/local/shipLocal.ts']) {
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
      ...structuredClone(SHIP_PROFILE_DEFAULTS),
      username: 'Offline Captain', doubloons: 10_000_000, gems: 1_000, gauntlet_fathoms: 1_000, expedition_xp: NAV_XP[99], ship_tier: 6, ship_classes: null,
      is_admin: false, rod_tier: 0,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
  }
}
const isErr = (r: object) => 'error' in r || ('ok' in r && (r as { ok: boolean }).ok === false)

let now = T0
installRng(mulberry32(9)); installClock(() => now)
try {
  // ── 2. The raid loadout ──
  {
    const recipe = FORGE_RECIPES[0]
    const s = freshSave({ ship_tier: 2, raid_items: [...recipe.components, 'not_owned_but_named'] }); const db = localShipData(s)
    const cap = raidItemSlotsForTier(2)
    await ship.saveEquippedRaidItems(db, UID, [...recipe.components, 'nobody_owns_this'])
    const eq = s.profile.equipped_raid_items as string[]
    if (eq.includes('nobody_owns_this') || eq.length > cap) fail(`the loadout kept an unowned item or passed the hull's ${cap} mounts`)
    s.profile.ship_tier = 6; s.profile.has_armory_expansion = true
    await ship.saveEquippedRaidItems(db, UID, recipe.components)
    if ((s.profile.equipped_raid_items as string[]).length !== Math.min(recipe.components.length, raidItemSlotsForTier(6) + 1)) fail('the loadout did not use the Armory\'s mounts')
    console.log(`  the loadout: owned items only, ${cap} mount${cap === 1 ? '' : 's'} on a tier 2 hull, the Armory's extra counted`)
  }

  // ── 3. The Forge ──
  {
    const recipe = FORGE_RECIPES.find(r => r.tier !== 3)!
    const s = freshSave({ raid_items: [...recipe.components], equipped_raid_items: [recipe.components[0]] }); const db = localShipData(s)
    if (!isErr(await ship.learnForgeRecipe(db, UID, recipe.result))) fail('a recipe was learned with the Forge locked')
    s.profile.gauntlet_upgrades = ['forge']
    if (!isErr(await ship.forgeRaidItem(db, UID, recipe.result))) fail('an unlearned recipe forged')
    const f0 = Number(s.profile.gauntlet_fathoms)
    const learn = await ship.learnForgeRecipe(db, UID, recipe.result)
    if (isErr(learn) || s.profile.gauntlet_fathoms !== f0 - recipe.fathomCost) fail('learning a recipe did not cost its Fathoms')
    if (!isErr(await ship.learnForgeRecipe(db, UID, recipe.result)) || s.profile.gauntlet_fathoms !== f0 - recipe.fathomCost) fail('a recipe was learned (and paid for) twice')
    const forged = await ship.forgeRaidItem(db, UID, recipe.result)
    const items = s.profile.raid_items as string[]
    if (isErr(forged) || !items.includes(recipe.result) || recipe.components.some(c => items.includes(c))) fail('the forge did not trade its components for the result')
    if ((s.profile.equipped_raid_items as string[]).some(c => recipe.components.includes(c))) fail('a consumed component stayed equipped')
    if (!isErr(await ship.forgeRaidItem(db, UID, recipe.result))) fail('an item forged twice')
    const abyssal = FORGE_RECIPES.find(r => r.tier === 3)
    if (abyssal) {
      s.profile.forge_recipes_learned = [...(s.profile.forge_recipes_learned as string[]), abyssal.result]
      s.profile.raid_items = [...abyssal.components]
      if (!isErr(await ship.forgeRaidItem(db, UID, abyssal.result))) fail('an Abyssal recipe forged without the Abyssal Forge')
    }
    if (!isErr(await ship.forgeRaidItem(db, UID, 'not_a_recipe'))) fail('a made-up recipe forged')
    console.log(`  the Forge: locked, learned once for ${recipe.fathomCost} Fathoms, ${recipe.result} forged once from its parts`)
  }

  // ── 4. The Abyssal Accelerator ──
  {
    const [epic, legendary] = Object.entries(EPIC_TO_LEGENDARY)[0]
    const s = freshSave({ raid_items: [epic], equipped_raid_items: [epic], gauntlet_upgrades: ['forge'] }); const db = localShipData(s)
    if (!isErr(await ship.startAbyssalConversion(db, UID, epic))) fail('the Accelerator ran while locked')
    s.profile.dons_gauntlet_upgrades = ['dg_abyssal_forge', 'dg_abyssal_accel']
    if (!isErr(await ship.startAbyssalConversion(db, UID, 'reinforced_hull'))) fail('an item with no legendary was charged')
    const g0 = Number(s.profile.gems)
    const start = await ship.startAbyssalConversion(db, UID, epic)
    if (isErr(start) || s.profile.gems !== g0 - ABYSSAL_ACCEL_GEM_COST || (s.profile.raid_items as string[]).includes(epic) || (s.profile.equipped_raid_items as string[]).includes(epic)) fail('charging did not take the gems and the epic')
    s.profile.raid_items = [epic]
    if (!isErr(await ship.startAbyssalConversion(db, UID, epic)) || s.profile.gems !== g0 - ABYSSAL_ACCEL_GEM_COST) fail('a second charge ran (or kept its gems) while one was running')
    s.profile.raid_items = []
    if (!isErr(await ship.claimAbyssalConversion(db, UID))) fail('a conversion was claimed before its time')
    now += ABYSSAL_ACCEL_MS + 1
    const claim = await ship.claimAbyssalConversion(db, UID)
    if (isErr(claim) || !(s.profile.raid_items as string[]).includes(legendary) || s.profile.abyssal_conversion != null) fail('the finished conversion did not hand over the legendary')
    if (!isErr(await ship.claimAbyssalConversion(db, UID))) fail('a conversion was claimed twice')
    console.log(`  the Accelerator: locked, ${epic} charged once for ${ABYSSAL_ACCEL_GEM_COST} gems, ${legendary} claimed once after 24h`)
  }

  // ── 5. The ultimate ──
  {
    const [a, b, c] = SHIP_AUGMENTS
    const s = freshSave({ gauntlet_upgrades: [] }); const db = localShipData(s)
    if (!isErr(await ship.startUltimateBuild(db, UID, a.id))) fail('an ultimate was built without the gates')
    s.clears = ['the_quartermaster']
    if (!isErr(await ship.startUltimateBuild(db, UID, a.id))) fail('an ultimate was built without the Cannonball Rack')
    s.profile.gauntlet_upgrades = ['cannonball_rack']
    const d0 = Number(s.profile.doubloons)
    const build = await ship.startUltimateBuild(db, UID, a.id)
    if (isErr(build) || s.profile.doubloons !== d0 - AUGMENT_COST) fail('the build did not cost its doubloons')
    if (!isErr(await ship.startUltimateBuild(db, UID, b.id)) || s.profile.doubloons !== d0 - AUGMENT_COST) fail('a second build ran (or kept its coin)')
    if (isErr(await ship.swapUltimateBuild(db, UID, b.id)) || s.profile.doubloons !== d0 - AUGMENT_COST) fail('the re-pick was not free')
    const mid = await ship.getUltimateState(db, UID)
    if (mid.active !== null || mid.build?.id !== b.id) fail('the re-pick did not change the build')
    now += ULTIMATE_BUILD_MS + 1
    const done = await ship.getUltimateState(db, UID)
    if (done.active !== b.id || done.build !== null || s.profile.manowar_augment !== b.id) fail('the finished build did not go live on read')
    if (!isErr(await ship.startUltimateBuild(db, UID, a.id))) fail('a second ultimate was built')
    if (!isErr(await ship.switchUltimate(db, UID, a.id))) fail('a switch went through without the Full Schematics')
    const d1 = Number(s.profile.doubloons)
    if (isErr(await ship.startUltimateRetool(db, UID, c.id)) || s.profile.doubloons !== d1 - RETOOL_COST) fail('the retool did not cost its doubloons')
    if ((await ship.getUltimateState(db, UID)).active !== b.id) fail('the old weapon did not stay armed during the retool')
    const schem = await ship.buyUltimateSchematics(db, UID)
    if (isErr(schem) || schem.active !== c.id || s.profile.manowar_augment !== c.id || s.profile.manowar_augment_build != null || s.profile.doubloons !== d1 - RETOOL_COST - SCHEMATICS_COST) fail('the Full Schematics did not finish the retool on the spot')
    if (!isErr(await ship.buyUltimateSchematics(db, UID))) fail('the Full Schematics were bought twice')
    const d2 = Number(s.profile.doubloons)
    if (isErr(await ship.switchUltimate(db, UID, a.id)) || s.profile.manowar_augment !== a.id || s.profile.doubloons !== d2) fail('a schematics switch was not free and instant')
    if (!isErr(await ship.startUltimateRetool(db, UID, b.id))) fail('a schematics owner was sold a retool')
    console.log('  the ultimate: gated, built once, re-picked free, live on read, retooled, the Schematics finish it, free switching')
  }

  // ── 6. The Sixth Berth and the Expanded Armory ──
  {
    const s = freshSave(); const db = localShipData(s)
    const d0 = Number(s.profile.doubloons)
    if (!isErr(await ship.buySixthBerth(db, UID)) || !isErr(await ship.buyArmoryExpansion(db, UID)) || s.profile.doubloons !== d0) fail('a berth or armory was sold before its raid')
    s.clears = ['the_blockade', 'the_throne']
    if (isErr(await ship.buySixthBerth(db, UID)) || s.profile.has_sixth_berth !== true) fail('the Sixth Berth did not sell')
    if (isErr(await ship.buyArmoryExpansion(db, UID)) || s.profile.has_armory_expansion !== true) fail('the Expanded Armory did not sell')
    if (s.profile.doubloons !== d0 - SIXTH_BERTH_COST - ARMORY_EXPANSION_COST) fail('the berth and armory did not cost their price')
    if (!isErr(await ship.buySixthBerth(db, UID)) || !isErr(await ship.buyArmoryExpansion(db, UID)) || s.profile.doubloons !== d0 - SIXTH_BERTH_COST - ARMORY_EXPANSION_COST) fail('a berth or armory sold twice')
    const poor = freshSave({ doubloons: 10 }); poor.clears = ['the_blockade']
    if (!isErr(await ship.buySixthBerth(localShipData(poor), UID)) || poor.profile.has_sixth_berth !== false) fail('the berth sold to an empty purse')
    console.log('  the Sixth Berth and the Expanded Armory: gated on their raids, bought once, never on credit')
  }

  // ── 7. Skins, guides, the Shipyard, rods ──
  {
    const s = freshSave({ ship_tier: 2 }); const db = localShipData(s)
    const gated = SHIP_SKINS.find(k => !canEquipShipSkin(k, 2))
    const open = SHIP_SKINS.find(k => canEquipShipSkin(k, 2))
    if (open) {
      await ship.equipShipSkin(db, UID, open.id)
      if (s.profile.equipped_ship_skin != null) fail('an unowned skin was worn')
      s.profile.ship_skins = [open.id]
      await ship.equipShipSkin(db, UID, open.id)
      if (s.profile.equipped_ship_skin !== open.id) fail('an owned skin was not worn')
    }
    if (gated) {
      s.profile.ship_skins = [...(s.profile.ship_skins as string[]), gated.id]
      await ship.equipShipSkin(db, UID, gated.id)
      if (s.profile.equipped_ship_skin === gated.id) fail('a skin was worn on a hull it does not fit')
    }
    await ship.equipShipSkin(db, UID, null)
    if (s.profile.equipped_ship_skin !== null) fail('the skin did not come off')
    await ship.markForgeIntroSeen(db, UID); await ship.markUltimateUnlockSeen(db, UID); await ship.markShipGuideSeen(db, UID)
    if (s.profile.has_seen_forge_intro !== true || s.profile.seen_ultimate_unlock !== true || s.profile.has_seen_ship_guide !== true) fail('a guide did not stay seen')

    const ladders: [ship.HullLadder, number][] = [['hull_speed_tier', MAX_HULL_TIER], ['hull_handling_tier', MAX_HANDLING_TIER], ['hull_accel_tier', MAX_ACCEL_TIER], ['lantern_tier', MAX_LANTERN_TIER]]
    for (const [col, max] of ladders) {
      for (let t = 0; t < max; t++) {
        const d = Number(s.profile.doubloons)
        const r = await ship.buyShipyardTier(db, UID, col)
        if ('error' in r || s.profile[col] !== t + 1 || r.doubloons !== s.profile.doubloons || Number(s.profile.doubloons) >= d) { fail(`${col} ${t + 1} did not fit for its price`); break }
      }
      const d = Number(s.profile.doubloons)
      if (!('error' in await ship.buyShipyardTier(db, UID, col)) || s.profile[col] !== max || s.profile.doubloons !== d) fail(`${col} went past its top rung`)
    }
    const broke = freshSave({ doubloons: 0 })
    if (!('error' in await ship.buyShipyardTier(localShipData(broke), UID, 'hull_speed_tier')) || broke.profile.hull_speed_tier !== 0) fail('a refit fitted on an empty purse')
    // A write that does not land hands the coin back.
    const stuck = freshSave(); const sdb = localShipData(stuck)
    const realIf = sdb.updateProfileIf; sdb.updateProfileIf = async () => false
    const d0 = Number(stuck.profile.doubloons)
    const r = await ship.buyShipyardTier(sdb, UID, 'hull_speed_tier')
    sdb.updateProfileIf = realIf
    if (!('error' in r) || stuck.profile.doubloons !== d0 || stuck.profile.hull_speed_tier !== 0) fail('a refit that could not be fitted kept the coin')

    const paid = RODS.find(x => x.cost !== 0 && !x.earnedOnly && !x.traderOnly)!
    if (!('error' in await ship.equipRod(db, UID, paid.tier))) fail('a rod not carried was equipped')
    s.rods = [0, paid.tier]
    if ('error' in await ship.equipRod(db, UID, paid.tier) || s.profile.rod_tier !== paid.tier) fail('a carried rod was not equipped')
    if (!('error' in await ship.equipRod(db, UID, 999))) fail('a made-up rod was equipped')
    console.log(`  skins (owned and fitting), guides, the Shipyard's four ladders to the top (a failed fit refunded), rods`)
  }
} finally {
  installRng(null); installClock(null)
}

// ── 8. The save file ──
{
  const s = freshSave()
  const v8 = JSON.parse(serializeSave(s))
  const bare = { ...v8.save.profile }
  for (const k of Object.keys(SHIP_PROFILE_DEFAULTS)) delete bare[k]
  bare.doubloons = 5_000_000
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 7, savedAt: '', save: { ...v8.save, profile: bare }, carried: {} }), SPECIES).save
  if (up.profile.has_sixth_berth !== false || up.profile.hull_speed_tier !== 0 || !Array.isArray(up.profile.raid_items)) fail('a version 7 save did not upgrade to 8 with the ship\'s defaults')
  up.clears = ['the_blockade']
  if (isErr(await ship.buySixthBerth(localShipData(up), UID)) || up.profile.has_sixth_berth !== true) fail('an upgraded save could not buy the berth')
  if ('error' in await ship.buyShipyardTier(localShipData(up), UID, 'hull_speed_tier')) fail('an upgraded save could not refit its hull')
  const kept = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 7, savedAt: '', save: { ...v8.save, profile: { ...bare, has_sixth_berth: true, hull_speed_tier: 3 } }, carried: {} }), SPECIES).save
  if (kept.profile.has_sixth_berth !== true || kept.profile.hull_speed_tier !== 3) fail('the upgrade overwrote what the save already had')
  const other = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 7, savedAt: '', save: { ...v8.save, profile: bare }, carried: {} }), SPECIES).save
  ;(up.profile.raid_items as string[]).push('shared?')
  if ((other.profile.raid_items as string[]).length) fail('two saves share one defaults array')
}

console.log(`\n  Offline ship: no server on the path, the loadout, the Forge, the Accelerator, the ultimate, berth and armory, the Shipyard, save v8 ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
