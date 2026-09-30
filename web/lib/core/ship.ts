// ── THE SHIP, CORE (Steam prep, 2026-09-29) ──
//
// The ship screen and the Shipyard with nothing of the web in them: the raid
// loadout, the Forge and its recipes, the Abyssal Accelerator, the ultimate
// (build, re-pick, retool, the Full Schematics, the free switch), the Sixth
// Berth, the Expanded Armory, hull skins, the one-time guides, and the
// Shipyard's four refit ladders and the rod you fish with. Each takes the store
// (ShipData) and the captain's id. On the web the server actions
// (expeditions/actions, shipyard/actions) check the session and hand these the
// Supabase store; offline, the local save's.
//
// EVERY PURCHASE HERE: SPEND FIRST, THEN THE FLAG. The spend is the guard
// (taken in place or not at all), and the flag write that follows is still
// conditional on the thing not already being owned. If a concurrent twin got
// the flag first, this request hands its coin straight back.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; the wallet and owned lists became store operations; the Shipyard's
// fitted-tier write is conditional (updateProfileIf), which is how a store
// reports a write that did not land; the page revalidation stays in the web
// wrapper.

import { clockNow } from '@/lib/clock'
import { RARITY_TIERS } from '@/lib/variants'
import { applyVariantBoosts, raidItemSlotsForTier } from '@/lib/expeditions'
import { getForgeRecipe, dedupeRaidItems, legendaryForEpic, RAID_ITEMS } from '@/lib/raidItems'
import { ABYSSAL_ACCEL_MS, ABYSSAL_ACCEL_GEM_COST, parseAbyssalConversion, isConversionReady, type AbyssalConversion } from '@/lib/abyssalAccelerator'
import { classSlotBonuses } from '@/lib/shipClasses'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { SIXTH_BERTH_COST, ARMORY_EXPANSION_COST } from '@/lib/shipBerth'
import { getShipAugment, AUGMENT_COST, RETOOL_COST, SCHEMATICS_COST, ULTIMATE_BUILD_MS, canBuildUltimate, parseAugmentBuild, isBuildComplete, type ShipAugmentBuild } from '@/lib/shipAugments'
import { getShipSkin, canEquipShipSkin } from '@/lib/shipSkins'
import { settleUltimateBuildVia } from '@/lib/ultimateBuild'
import { hasForge, hasAbyssalForge, hasAbyssalAccelerator, bonusChargeSlots } from '@/lib/gauntletUpgrades'
import { RODS } from '@/lib/rods'
import {
  nextHullCost, MAX_HULL_TIER,
  nextHandlingCost, MAX_HANDLING_TIER,
  nextAccelCost, MAX_ACCEL_TIER,
  nextLanternCost, MAX_LANTERN_TIER,
} from '@/lib/shipyard'
import type { ShipData } from '@/lib/data/shipData'
import { distinctIds, idCounts } from '@/lib/listCounts'

// ── The legacy crew picker (the old card collection) ─────────────────────────

export type CollectionCrewCard = {
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  borderStyle: string
  artEffect: string
  variantName: string
  dropWeight: number
  rarity: string
  power: number
  dodge: number
  fortune: number
}

export async function getCollectionForCrew(db: ShipData, uid: string): Promise<CollectionCrewCard[]> {
  const data = await db.collection(uid, 'id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune))')

  if (!data) return []

  const seen = new Set<number>()
  type Row = {
    id: number; card_variant_id: number
    card_variants: { id: number; variant_name: string; border_style: string; art_effect: string; drop_weight: number; cards: { id: number; name: string; slug: string; filename: string; tier: number; power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number } }
  }

  const result: CollectionCrewCard[] = []
  for (const row of (data as unknown as Row[])) {
    if (seen.has(row.card_variant_id)) continue
    seen.add(row.card_variant_id)
    const v = row.card_variants
    const card = v.cards
    const rarity = RARITY_TIERS.find(t => t.variants.includes(v.variant_name))?.name ?? 'Common'
    const base = { power: card.power, dodge: card.dodge, fortune: card.fortune }
    const mythic = { power: card.mythic_power, dodge: card.mythic_dodge, fortune: card.mythic_fortune }
    const stats = applyVariantBoosts(base, v.variant_name, mythic)
    result.push({
      collectionId: row.id,
      cardId: card.id,
      variantId: v.id,
      name: card.name,
      slug: card.slug,
      filename: card.filename,
      borderStyle: v.border_style,
      artEffect: v.art_effect,
      variantName: v.variant_name,
      dropWeight: v.drop_weight,
      rarity,
      power: stats.power,
      dodge: stats.dodge,
      fortune: stats.fortune,
    })
  }

  result.sort((a, b) => (b.power + b.dodge + b.fortune) - (a.power + a.dodge + a.fortune))
  return result
}

export async function saveCrew(db: ShipData, uid: string, variantIds: number[]): Promise<void> {
  // Resolve each variant to its card name so we can dedup by name. Two
  // variants of the same character (e.g. standard + foil) must never both
  // sit in the crew loadout: they're the same person.
  const unique = Array.from(new Set(variantIds))
  const nameByVariant = await db.variantNames(unique)

  const seenNames = new Set<string>()
  const cleaned: number[] = []
  for (const vid of variantIds) {
    const name = nameByVariant.get(vid)
    if (!name || seenNames.has(name)) continue
    seenNames.add(name)
    cleaned.push(vid)
  }

  await db.updateProfile(uid, { saved_crew: cleaned })
}

// ── Raid item / ship skin equip ───────────────────────────────────────────────

export async function saveEquippedRaidItems(db: ShipData, uid: string, itemIds: string[]): Promise<void> {
  // Pull ship_tier so the slot cap scales with hull size (see
  // raidItemSlotsForTier in lib/expeditions). A Sloop captain gets 1
  // slot; a Man-o-War captain gets 4.
  const profile = await db.profile(uid, 'raid_items, ship_tier, ship_classes, has_armory_expansion')
  const owned = (profile?.raid_items as string[] | null) ?? []
  // Hull cap + the Ch4 Expanded Armory refit's extra mount (the purchased flag),
  // plus any legacy class-pick itemSlots. MUST match the ShipHero UI + the
  // raids/actions combat cap, or a 5th equipped item gets sliced off on save.
  const slots = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0)
    + classSlotBonuses(profile?.ship_classes as Record<string, string> | null).itemSlots
    + ((profile as { has_armory_expansion?: boolean } | null)?.has_armory_expansion === true ? 1 : 0)
  // THE SUNKEN HAND MOUNT rides in the same array but is NOT a hull slot, so it
  // has to come out before the cap and go back after. Slicing it together with
  // the rest meant a mounted Primeval Maw silently ate a hull slot: with the
  // mount plus a full hull, the newly equipped item is last in the array and got
  // truncated straight back off, so equipping looked like it did nothing.
  // Mirrors the same split in getRaidPlayerStats.
  const ownedOnly = itemIds.filter(id => owned.includes(id))
  const finaleIds = new Set(RAID_ITEMS.filter(i => i.finaleSlotOnly).map(i => i.id))
  const mounted = ownedOnly.filter(id => finaleIds.has(id)).slice(0, 1)
  const normal  = ownedOnly.filter(id => !finaleIds.has(id))
  // Owned + can-coexist (one-per-tier-family, and no fusion beside its own forge
  // ingredients) + capped to the hull's slots. dedupe runs before the slice so a
  // conflicting pair can't waste a slot apiece.
  const valid = [...dedupeRaidItems(normal).slice(0, slots), ...mounted]
  await db.updateProfile(uid, { equipped_raid_items: valid })
}

/** Forge a raid item from a recipe (FORGE_RECIPES) by sacrificing its
 *  components. Generic so any future forgeable item works without new code.
 *  Mirrors the completionist-rod forge; server-validated against the recipe so a
 *  tampered client can't forge without owning every component. */
export async function forgeRaidItem(db: ShipData, uid: string, resultId: string): Promise<{ ok: true; raidItems: string[] } | { error: string }> {
  const recipe = getForgeRecipe(resultId)
  if (!recipe) return { error: 'Unknown recipe' }

  const profile = await db.profile(uid, 'raid_items, equipped_raid_items, gauntlet_upgrades, dons_gauntlet_upgrades, forge_recipes_learned')
  // The Forge is a major Gauntlet (Fathom) unlock: server-enforce it. Tier-3
  // (Abyssal) recipes ride Don's separate unlock instead; account-scope perks
  // apply from EITHER Locker, so both checks read the union.
  const forgeUpgrades = [
    ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  if (recipe.tier === 3) {
    if (!hasAbyssalForge(forgeUpgrades)) return { error: 'The Abyssal Forge is locked. Unlock it in Don’s Gauntlet.' }
  } else if (!hasForge(forgeUpgrades)) {
    return { error: 'The Forge is locked. Unlock it in the Davy Jones Gauntlet.' }
  }
  // Recipe must be learned first (learnForgeRecipe spends the Fathoms).
  const learned = (profile?.forge_recipes_learned as string[] | null) ?? []
  if (!learned.includes(recipe.result)) return { error: "You haven't learned this recipe yet." }
  // Copies are allowed (Kong, 2026-09-30): forging the same thing twice is fine,
  // and it uses up ONE copy of each component.
  const need = idCounts(recipe.components)
  const have = idCounts((profile?.raid_items as string[] | null) ?? [])
  if (!Object.entries(need).every(([id, n]) => (have[id] ?? 0) >= n)) return { error: "You don't own every component yet." }

  // Take the components first, each guarded (the take is the claim); if any is
  // refused, the ones already taken go back and nothing is forged.
  const taken: string[] = []
  for (const id of recipe.components) {
    if (!(await db.take(uid, 'raid_item', id))) {
      for (const back of taken) await db.give(uid, 'raid_item', back)
      return { error: "You don't own every component yet." }
    }
    taken.push(id)
  }
  await db.give(uid, 'raid_item', recipe.result)

  // A component no longer held at all comes off the loadout; one still held (a
  // spare copy) stays mounted.
  const after = await db.profile(uid, 'raid_items, equipped_raid_items')
  const held = new Set((after?.raid_items as string[] | null) ?? [])
  const equipped = ((after?.equipped_raid_items as string[] | null) ?? []).filter(id => held.has(id))
  await db.updateProfile(uid, { equipped_raid_items: equipped })
  return { ok: true, raidItems: distinctIds((after?.raid_items as string[] | null) ?? []) }
}

/** Learn a forge recipe by paying its Fathom cost (the repeatable meta sink).
 *  Permanent once learned; forging then only needs the components. Gated on the
 *  Forge being unlocked; server-validated so a tampered client can't learn free. */
export async function learnForgeRecipe(db: ShipData, uid: string, resultId: string): Promise<{ ok: true; fathoms: number; learned: string[] } | { error: string }> {
  const recipe = getForgeRecipe(resultId)
  if (!recipe) return { error: 'Unknown recipe' }

  const profile = await db.profile(uid, 'gauntlet_upgrades, dons_gauntlet_upgrades, forge_recipes_learned, raid_items')
  const learnUpgrades = [
    ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  if (recipe.tier === 3) {
    if (!hasAbyssalForge(learnUpgrades)) return { error: 'The Abyssal Forge is locked. Unlock it in Don’s Gauntlet.' }
  } else if (!hasForge(learnUpgrades)) {
    return { error: 'The Forge is locked. Unlock it in the Davy Jones Gauntlet.' }
  }
  const learned = (profile?.forge_recipes_learned as string[] | null) ?? []
  if (learned.includes(resultId)) return { error: 'Already learned.' }
  const newFathoms = await db.spend(uid, 'gauntlet_fathoms', recipe.fathomCost)
  if (newFathoms == null) return { error: `Not enough Fathoms. This recipe needs ${recipe.fathomCost}.` }
  if (!(await db.addToList(uid, 'forge_recipes_learned', resultId))) {
    await db.grant(uid, 'gauntlet_fathoms', recipe.fathomCost)
    return { error: 'Already learned.' }
  }
  return { ok: true, fathoms: newFathoms, learned: [...learned, resultId] }
}

/** Charge the Abyssal Accelerator: spend gems, consume an owned EPIC boss item,
 *  and start a 24h transmutation into its LEGENDARY chase counterpart. One slot:
 *  a conditional write on the still-null slot blocks a double-charge race.
 *  Requires Don's Abyssal Forge AND the Abyssal Accelerator (account-scope, so
 *  the checks read the union of both Lockers). */
export async function startAbyssalConversion(db: ShipData, uid: string, epicId: string): Promise<
  { ok: true; conversion: AbyssalConversion; gems: number; raidItems: string[] } | { error: string }
> {
  const legendaryId = legendaryForEpic(epicId)
  if (!legendaryId) return { error: 'That item can’t be transmuted.' }

  const profile = await db.profile(uid, 'raid_items, equipped_raid_items, gauntlet_upgrades, dons_gauntlet_upgrades, abyssal_conversion')
  if (!profile) return { error: 'Profile not found.' }

  const upgrades = [
    ...((profile.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  if (!hasAbyssalForge(upgrades) || !hasAbyssalAccelerator(upgrades)) {
    return { error: 'The Abyssal Accelerator is locked. Unlock it in Don’s Gauntlet.' }
  }
  if (parseAbyssalConversion(profile.abyssal_conversion)) {
    return { error: 'The Accelerator is already running. Claim it first.' }
  }
  const owned = (profile.raid_items as string[] | null) ?? []
  if (!owned.includes(epicId)) return { error: 'You don’t own that item.' }
  // Copies are allowed (Kong, 2026-09-30), so holding the legendary already is no
  // reason to refuse another.
  const conversion: AbyssalConversion = {
    epicId, legendaryId,
    completesAt: new Date(clockNow() + ABYSSAL_ACCEL_MS).toISOString(),
  }

  // The gems first: the spend is the guard.
  const newGems = await db.spend(uid, 'gems', ABYSSAL_ACCEL_GEM_COST)
  if (newGems == null) return { error: `Not enough gems. Charging costs ${ABYSSAL_ACCEL_GEM_COST}.` }

  // Guard the slot on STILL being empty, so a double-tap (or two tabs) cannot
  // charge two conversions; the loser gets its gems back.
  if (!(await db.updateProfileIf(uid, { abyssal_conversion: conversion }, [{ col: 'abyssal_conversion', is: null }]))) {
    await db.grant(uid, 'gems', ABYSSAL_ACCEL_GEM_COST)
    return { error: 'The Accelerator is already running. Claim it first.' }
  }
  // Then take ONE copy of the epic (it used to take every copy). Refused (it went
  // elsewhere meanwhile): the slot empties and the gems go back.
  if (!(await db.take(uid, 'raid_item', epicId))) {
    await db.updateProfile(uid, { abyssal_conversion: null })
    await db.grant(uid, 'gems', ABYSSAL_ACCEL_GEM_COST)
    return { error: 'You don’t own that item.' }
  }
  // The epic comes off the loadout only if no copy is left.
  const after = await db.profile(uid, 'raid_items, equipped_raid_items')
  const held = new Set((after?.raid_items as string[] | null) ?? [])
  const newOwned = distinctIds((after?.raid_items as string[] | null) ?? [])
  await db.updateProfile(uid, { equipped_raid_items: ((after?.equipped_raid_items as string[] | null) ?? []).filter(id => held.has(id)) })

  await db.ledger(uid, -ABYSSAL_ACCEL_GEM_COST, 'Charged the Abyssal Accelerator', 'gems')
  return { ok: true, conversion, gems: newGems, raidItems: newOwned }
}

/** Claim a finished Abyssal Accelerator run: add the legendary to the hold and
 *  clear the slot. Player-triggered (a "Claim" tap, not settle-on-read), guarded
 *  against a double-claim. */
export async function claimAbyssalConversion(db: ShipData, uid: string): Promise<
  { ok: true; legendaryId: string; raidItems: string[] } | { error: string }
> {
  const profile = await db.profile(uid, 'raid_items, abyssal_conversion')
  const conversion = parseAbyssalConversion(profile?.abyssal_conversion)
  if (!conversion) return { error: 'Nothing to claim.' }
  if (!isConversionReady(conversion, clockNow())) return { error: 'It’s still transmuting.' }

  const newOwned = distinctIds([...((profile?.raid_items as string[] | null) ?? []), conversion.legendaryId])

  // Clear the slot first (conditional, so a double-claim finds it empty), then
  // add the legendary in place rather than writing back a stale copy of the hold.
  const updated = await db.updateProfileIf(uid, { abyssal_conversion: null }, [{ col: 'abyssal_conversion', notNull: true }])
  if (!updated) return { error: 'Already claimed.' }
  await db.give(uid, 'raid_item', conversion.legendaryId)

  return { ok: true, legendaryId: conversion.legendaryId, raidItems: newOwned }
}

/** Mark the one-time "The Forge Awakens" celebration as seen (fires the first
 *  time the player opens the Forge after unlocking it). */
export async function markForgeIntroSeen(db: ShipData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_forge_intro: true })
}

export async function equipShipSkin(db: ShipData, uid: string, skinId: string | null): Promise<void> {
  if (skinId !== null) {
    const profile = await db.profile(uid, 'ship_skins, ship_tier')
    const owned = (profile?.ship_skins as string[] | null) ?? []
    if (!owned.includes(skinId)) return
    // Tier-gated skins (e.g. Man-o-War-only) can't be equipped on a smaller hull.
    const skin = getShipSkin(skinId)
    if (skin && !canEquipShipSkin(skin, (profile?.ship_tier as number | null) ?? 0)) return
  }
  await db.updateProfile(uid, { equipped_ship_skin: skinId })
}

// ── The ultimate ──────────────────────────────────────────────────────────────

/** The live ultimate state, settling any matured build on read. Returns the
 *  ACTIVE (completed) augment id + the in-progress build, if any. Promoting a
 *  matured build here means the ultimate goes live the next time the player
 *  loads the ship screen: no cron needed (mirrors the pending-sales pattern). */
export async function getUltimateState(db: ShipData, uid: string): Promise<{ active: string | null; build: ShipAugmentBuild | null; schematics: boolean }> {
  const profile = await db.profile(uid, 'manowar_augment, manowar_augment_build, manowar_schematics')
  const settled = await settleUltimateBuildVia(db, uid,
    (profile?.manowar_augment as string | null) ?? null,
    profile?.manowar_augment_build ?? null)
  return { ...settled, schematics: profile?.manowar_schematics === true }
}

/** Begin building an ultimate. Charges AUGMENT_COST doubloons and stamps a 24h
 *  build clock. Requires all four gates. The choice is PERMANENT: once an ultimate
 *  is built (or building), you cannot build another; there is no rebuild/swap. */
export async function startUltimateBuild(db: ShipData, uid: string, id: string): Promise<{ ok: boolean; error?: string; doubloons?: number; completesAt?: string }> {
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const profile = await db.profile(uid, 'ship_tier, expedition_xp, manowar_augment, manowar_augment_build, gauntlet_upgrades')
  if (!profile) return { ok: false, error: 'No profile.' }

  // The ultimate is a once-and-for-all choice. If one is already forged, no rebuild.
  if (profile.manowar_augment) {
    return { ok: false, error: 'Your ship already carries its ultimate. The choice is permanent.' }
  }
  // A build already underway can't be double-started (re-pick it instead).
  const existing = parseAugmentBuild(profile.manowar_augment_build ?? null)
  if (existing && !isBuildComplete(existing, clockNow())) {
    return { ok: false, error: 'A weapon is already being built. Change your pick instead.' }
  }

  const navLevel = navLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  // Chapter 3 cleared (the Quartermaster beaten) reveals the schematics.
  const chapter3Cleared = await db.hasCleared(uid, 'the_quartermaster')
  const gate = canBuildUltimate({
    chapter3Cleared,
    shipTier: (profile.ship_tier as number | null) ?? 0,
    navLevel,
    hasRack: bonusChargeSlots((profile.gauntlet_upgrades as string[] | null) ?? []) > 0,
  })
  if (!gate) return { ok: false, error: 'You do not meet every requirement yet.' }

  const newDoubloons = await db.spend(uid, 'doubloons', AUGMENT_COST)
  if (newDoubloons == null) return { ok: false, error: `You need ${AUGMENT_COST.toLocaleString()} doubloons.` }

  const completesAt = new Date(clockNow() + ULTIMATE_BUILD_MS).toISOString()
  const build: ShipAugmentBuild = { id: augment.id, completesAt }
  // Conditional write: only start if no build is in flight (guards a double-tap).
  const updated = await db.updateProfileIf(uid, { manowar_augment_build: build }, [{ col: 'manowar_augment_build', is: null }, { col: 'manowar_augment', is: null }])
  if (!updated) {
    await db.grant(uid, 'doubloons', AUGMENT_COST)
    return { ok: false, error: 'A weapon is already being built.' }
  }

  await db.ledger(uid, -AUGMENT_COST, `Ultimate weapon build: ${augment.name}`)
  return { ok: true, doubloons: newDoubloons, completesAt }
}

/** Re-pick which ultimate is being built. Free, only while a build is in flight:
 *  the clock keeps running, only the target weapon changes. */
export async function swapUltimateBuild(db: ShipData, uid: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const profile = await db.profile(uid, 'manowar_augment, manowar_augment_build')
  const existing = parseAugmentBuild(profile?.manowar_augment_build ?? null)
  if (!existing || isBuildComplete(existing, clockNow())) {
    return { ok: false, error: 'No build in progress.' }
  }
  if (existing.id === augment.id) return { ok: true }
  // A retool can't target the weapon already on the mounts.
  if (existing.retool && profile?.manowar_augment === augment.id) {
    return { ok: false, error: 'That weapon is already mounted.' }
  }
  // Keep the same clock: you're re-tasking the shipwrights, not restarting.
  const build: ShipAugmentBuild = { id: augment.id, completesAt: existing.completesAt, ...(existing.retool ? { retool: true } : {}) }
  await db.updateProfile(uid, { manowar_augment_build: build })
  return { ok: true }
}

/** RETOOL a forged ultimate into a different weapon. Charges RETOOL_COST and
 *  stamps the same 24h shipwright clock; the CURRENT weapon stays armed until
 *  the work completes (settleUltimateBuild promotes it on read, as with the
 *  first build). Schematics owners never pay this: they switch instantly. */
export async function startUltimateRetool(db: ShipData, uid: string, id: string): Promise<{ ok: boolean; error?: string; doubloons?: number; completesAt?: string }> {
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const profile = await db.profile(uid, 'manowar_augment, manowar_augment_build, manowar_schematics')
  if (!profile) return { ok: false, error: 'No profile.' }

  if (!profile.manowar_augment) return { ok: false, error: 'Forge your first ultimate before retooling.' }
  if (profile.manowar_augment === augment.id) return { ok: false, error: 'That weapon is already mounted.' }
  if (profile.manowar_schematics === true) return { ok: false, error: 'You own the Full Schematics. Switch freely instead.' }
  const existing = parseAugmentBuild(profile.manowar_augment_build ?? null)
  if (existing && !isBuildComplete(existing, clockNow())) {
    return { ok: false, error: 'The shipwrights are already at work. Change their pick instead.' }
  }

  const newDoubloons = await db.spend(uid, 'doubloons', RETOOL_COST)
  if (newDoubloons == null) return { ok: false, error: `You need ${RETOOL_COST.toLocaleString()} doubloons.` }

  const completesAt = new Date(clockNow() + ULTIMATE_BUILD_MS).toISOString()
  const build: ShipAugmentBuild = { id: augment.id, completesAt, retool: true }
  // Conditional write guards a double-tap, same as the first build.
  const updated = await db.updateProfileIf(uid, { manowar_augment_build: build }, [{ col: 'manowar_augment_build', is: null }])
  if (!updated) {
    await db.grant(uid, 'doubloons', RETOOL_COST)
    return { ok: false, error: 'The shipwrights are already at work.' }
  }

  await db.ledger(uid, -RETOOL_COST, `Ultimate retool: ${augment.name}`)
  return { ok: true, doubloons: newDoubloons, completesAt }
}

/** Buy the Full Schematics: one purchase, then free instant switching between
 *  all three ultimates forever. If a paid retool is mid-clock, it completes on
 *  the spot: you own every plan now; nobody waits on a torn page. */
export async function buyUltimateSchematics(db: ShipData, uid: string): Promise<{ ok: boolean; error?: string; doubloons?: number; active?: string | null }> {
  const profile = await db.profile(uid, 'manowar_augment, manowar_augment_build, manowar_schematics')
  if (!profile) return { ok: false, error: 'No profile.' }

  if (!profile.manowar_augment) return { ok: false, error: 'Forge your first ultimate before buying the Full Schematics.' }
  if (profile.manowar_schematics === true) return { ok: false, error: 'You already own the Full Schematics.' }

  const newDoubloons = await db.spend(uid, 'doubloons', SCHEMATICS_COST)
  if (newDoubloons == null) return { ok: false, error: `You need ${SCHEMATICS_COST.toLocaleString()} doubloons.` }

  // A retool mid-clock finishes instantly with the purchase.
  const pending = parseAugmentBuild(profile.manowar_augment_build ?? null)
  const active = pending?.retool ? pending.id : (profile.manowar_augment as string)
  // Conditional write (schematics still false) guards a double-tap.
  const updated = await db.updateProfileIf(uid, {
      manowar_schematics: true,
      manowar_augment: active,
      ...(pending?.retool ? { manowar_augment_build: null } : {}),
    }, [{ col: 'manowar_schematics', eq: false }])
  if (!updated) {
    await db.grant(uid, 'doubloons', SCHEMATICS_COST)
    return { ok: false, error: 'You already own the Full Schematics.' }
  }

  await db.ledger(uid, -SCHEMATICS_COST, 'Ultimate weapon: the Full Schematics')
  return { ok: true, doubloons: newDoubloons, active }
}

/** Free instant ultimate switch: Full Schematics owners only. */
export async function switchUltimate(db: ShipData, uid: string, id: string): Promise<{ ok: boolean; error?: string; active?: string }> {
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const profile = await db.profile(uid, 'manowar_augment, manowar_schematics')
  if (!profile) return { ok: false, error: 'No profile.' }
  if (!profile.manowar_augment) return { ok: false, error: 'Forge your first ultimate before switching.' }
  if (profile.manowar_schematics !== true) return { ok: false, error: 'Switching freely takes the Full Schematics.' }
  if (profile.manowar_augment === augment.id) return { ok: true, active: augment.id }

  // Any stale build is moot for a schematics owner: clear it as we switch.
  await db.updateProfile(uid, { manowar_augment: augment.id, manowar_augment_build: null })
  return { ok: true, active: augment.id }
}

// ── The berth and the armory ──────────────────────────────────────────────────

/** Buy the Sixth Berth: a permanent Man-o-War crew slot (5 → 6). Gated on
 *  clearing Raid 7 (the Blockade); a heavy doubloon sink, once. Opens the
 *  full six-crew bench Don Finleone's six phases demand. */
export async function buySixthBerth(db: ShipData, uid: string): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const profile = await db.profile(uid, 'has_sixth_berth')
  if (!profile) return { ok: false, error: 'No profile.' }
  if (profile.has_sixth_berth === true) return { ok: false, error: 'Your ship already has its sixth crew slot.' }

  // Gate: the berth reveals only once Sal Brackwater (Raid 7) is beaten.
  const cleared = await db.hasCleared(uid, 'the_blockade')
  if (!cleared) return { ok: false, error: 'Beat Sal Brackwater before you can add a crew slot.' }

  const newDoubloons = await db.spend(uid, 'doubloons', SIXTH_BERTH_COST)
  if (newDoubloons == null) return { ok: false, error: `You need ${SIXTH_BERTH_COST.toLocaleString()} doubloons.` }
  // Conditional write (still false) guards a double-tap.
  const updated = await db.updateProfileIf(uid, { has_sixth_berth: true }, [{ col: 'has_sixth_berth', eq: false }])
  if (!updated) {
    await db.grant(uid, 'doubloons', SIXTH_BERTH_COST)
    return { ok: false, error: 'Your ship already carries the sixth berth.' }
  }

  await db.ledger(uid, -SIXTH_BERTH_COST, 'The Sixth Berth (Man-o-War crew slot)')
  return { ok: true, doubloons: newDoubloons }
}

/** Buy the Expanded Armory: a permanent extra raid-item mount from Don
 *  Finleone's shipwright. Gated on clearing Raid 8 (the Throne); a heavy
 *  doubloon sink, once. One more piece of gear working every fight. */
export async function buyArmoryExpansion(db: ShipData, uid: string): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const profile = await db.profile(uid, 'has_armory_expansion')
  if (!profile) return { ok: false, error: 'No profile.' }
  if (profile.has_armory_expansion === true) return { ok: false, error: 'Your deck already carries the extra mount.' }

  // Gate: the refit reveals only once Don Finleone (Raid 8) is beaten.
  const cleared = await db.hasCleared(uid, 'the_throne')
  if (!cleared) return { ok: false, error: 'Take the throne before the shipwright will cut you a new mount.' }

  const newDoubloons = await db.spend(uid, 'doubloons', ARMORY_EXPANSION_COST)
  if (newDoubloons == null) return { ok: false, error: `You need ${ARMORY_EXPANSION_COST.toLocaleString()} doubloons.` }
  // Conditional write (still false) guards a double-tap.
  const updated = await db.updateProfileIf(uid, { has_armory_expansion: true }, [{ col: 'has_armory_expansion', eq: false }])
  if (!updated) {
    await db.grant(uid, 'doubloons', ARMORY_EXPANSION_COST)
    return { ok: false, error: 'Your deck already carries the extra mount.' }
  }

  await db.ledger(uid, -ARMORY_EXPANSION_COST, 'The Expanded Armory (extra raid-item mount)')
  return { ok: true, doubloons: newDoubloons }
}

/** Dismiss the one-time "ultimate plans discovered" celebration. */
export async function markUltimateUnlockSeen(db: ShipData, uid: string): Promise<void> {
  await db.updateProfile(uid, { seen_ultimate_unlock: true })
}

/** Mark the first-time Manage Ship (loadout drawer) guide as seen. */
export async function markShipGuideSeen(db: ShipData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_ship_guide: true })
}

// ── The Shipyard ──────────────────────────────────────────────────────────────
//
// Every refit prices itself from lib/shipyard and never from the request.

export type ShipyardResult = { ok: true; doubloons: number } | { error: string }
export type HullLadder = 'hull_speed_tier' | 'hull_handling_tier' | 'hull_accel_tier' | 'lantern_tier'

const LADDERS: Record<HullLadder, { max: number; cost: (t: number) => number | null; label: string; full: string }> = {
  hull_speed_tier:    { max: MAX_HULL_TIER,     cost: nextHullCost,     label: 'hull tier', full: 'Your hull is as fine as it gets.' },
  hull_handling_tier: { max: MAX_HANDLING_TIER, cost: nextHandlingCost, label: 'rudder',    full: 'Her rudder is as fine as it gets.' },
  lantern_tier:       { max: MAX_LANTERN_TIER,  cost: nextLanternCost,  label: 'lantern',   full: 'Your lantern is as bright as they come.' },
  hull_accel_tier:    { max: MAX_ACCEL_TIER,    cost: nextAccelCost,    label: 'rig',       full: 'Her rig is as fine as it gets.' },
}

/**
 * One rung of a Shipyard ladder (the hull, rudder, lantern and rig are one
 * shape, deliberately: three near-identical ladders is exactly where a fix gets
 * applied to two of them).
 *
 * Re-reads the tier after the spend: two taps landing together would both have
 * read the same tier and both have paid; re-reading means the second lands on
 * the tier the first produced instead of overwriting it.
 */
export async function buyShipyardTier(db: ShipData, uid: string, col: HullLadder): Promise<ShipyardResult> {
  const { max: maxTier, cost, label, full } = LADDERS[col]
  const p = await db.profile(uid, col)
  const tier = Number(p?.[col] ?? 0)
  if (tier >= maxTier) return { error: full }

  const price = cost(tier)
  if (price == null) return { error: full }

  // The RESULT is the guard: deductDoubloons returns null rather than raising
  // when the purse will not cover it.
  const bal = await db.deductDoubloons(uid, price)
  if (bal == null) return { error: `That refit costs ${price.toLocaleString()} and you have not got it.` }
  await db.ledger(uid, -price, `Shipyard: ${label} ${tier + 1}`)

  const after = await db.profile(uid, col)
  const seen = Number(after?.[col] ?? tier)
  // ── THE WRITE IS CHECKED, AND A FAILURE GIVES THE MONEY BACK ──────────
  //
  // This used to be an unread write. A stale CHECK constraint (the hull's old
  // four rungs) rejected every refit past tier 3 AFTER the coin was taken, in
  // total silence: two captains paid sixteen times between them for refits that
  // never landed. An upgrade that cannot be written must not be an upgrade that
  // was paid for, so the write is conditional (on the tier just read) and a
  // write that does not land hands the coin straight back.
  const fitted = await db.updateProfileIf(uid, { [col]: Math.min(maxTier, seen + 1) }, [{ col, eq: after?.[col] ?? 0 }])
  if (!fitted) {
    await db.grant(uid, 'doubloons', price)
    await db.ledger(uid, price, `Refunded: ${label} ${tier + 1} could not be fitted`)
    return { error: 'The yard could not fit that. Your coin is back in your purse.' }
  }
  return { ok: true, doubloons: bal }
}

/** Equip a rod. The Shipyard is where this happens now; see docs/systems. */
export async function equipRod(db: ShipData, uid: string, tier: number): Promise<{ ok: true } | { error: string }> {
  const rod = RODS.find(r => r.tier === tier)
  if (!rod) return { error: 'No such rod.' }

  if (rod.cost !== 0 || rod.earnedOnly || rod.traderOnly) {
    if (!(await db.rodTiers(uid)).includes(tier)) return { error: 'You do not carry that rod.' }
  }

  await db.updateProfile(uid, { rod_tier: tier })
  return { ok: true }
}
