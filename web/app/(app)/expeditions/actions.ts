'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RARITY_TIERS } from '@/lib/variants'
import { applyVariantBoosts, raidItemSlotsForTier } from '@/lib/expeditions'
import { getForgeRecipe, dedupeRaidItems, legendaryForEpic, RAID_ITEMS } from '@/lib/raidItems'
import { ABYSSAL_ACCEL_MS, ABYSSAL_ACCEL_GEM_COST, parseAbyssalConversion, isConversionReady, type AbyssalConversion } from '@/lib/abyssalAccelerator'
import { classSlotBonuses } from '@/lib/shipClasses'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { SIXTH_BERTH_COST, ARMORY_EXPANSION_COST } from '@/lib/shipBerth'
import { getShipAugment, AUGMENT_COST, RETOOL_COST, SCHEMATICS_COST, ULTIMATE_BUILD_MS, canBuildUltimate, parseAugmentBuild, isBuildComplete, type ShipAugmentBuild } from '@/lib/shipAugments'
import { getShipSkin, canEquipShipSkin } from '@/lib/shipSkins'
import { settleUltimateBuild } from '@/lib/ultimateBuild'
import { hasForge, hasAbyssalForge, hasAbyssalAccelerator, bonusChargeSlots } from '@/lib/gauntletUpgrades'

// ── Crew picker ───────────────────────────────────────────────────────────────

export async function getCollectionForCrew(): Promise<Array<{
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
}>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune))')
    .eq('user_id', user.id)

  if (!data) return []

  const seen = new Set<number>()
  type Row = {
    id: number; card_variant_id: number
    card_variants: { id: number; variant_name: string; border_style: string; art_effect: string; drop_weight: number; cards: { id: number; name: string; slug: string; filename: string; tier: number; power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number } }
  }

  const result = []
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

// ── Crew loadout persistence ──────────────────────────────────────────────────

export async function saveCrew(variantIds: number[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()

  // Resolve each variant to its card name so we can dedup by name. Two
  // variants of the same character (e.g. standard + foil) must never both
  // sit in the crew loadout — they're the same person.
  const unique = Array.from(new Set(variantIds))
  const { data: variants } = await admin
    .from('card_variants')
    .select('id, cards(name)')
    .in('id', unique)
  type VRow = { id: number; cards: { name: string } | null }
  const nameByVariant = new Map<number, string>()
  for (const row of ((variants ?? []) as unknown as VRow[])) {
    if (row.cards?.name) nameByVariant.set(row.id, row.cards.name)
  }

  const seenNames = new Set<string>()
  const cleaned: number[] = []
  for (const vid of variantIds) {
    const name = nameByVariant.get(vid)
    if (!name || seenNames.has(name)) continue
    seenNames.add(name)
    cleaned.push(vid)
  }

  await admin.from('profiles').update({ saved_crew: cleaned }).eq('id', user.id)
}

// ── Raid item / ship skin equip ───────────────────────────────────────────────

export async function saveEquippedRaidItems(itemIds: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  // Pull ship_tier so the slot cap scales with hull size (see
  // raidItemSlotsForTier in lib/expeditions). A Sloop captain gets 1
  // slot; a Man-o-War captain gets 4.
  const { data: profile } = await admin.from('profiles').select('raid_items, ship_tier, ship_classes, has_armory_expansion').eq('id', user.id).single()
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
  await admin.from('profiles').update({ equipped_raid_items: valid }).eq('id', user.id)
}

/** Forge a raid item from a recipe (FORGE_RECIPES) by sacrificing its
 *  components. Generic so any future forgeable item works without new code.
 *  Mirrors the completionist-rod forge; server-validated against the recipe so a
 *  tampered client can't forge without owning every component. */
export async function forgeRaidItem(resultId: string): Promise<{ ok: true; raidItems: string[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const recipe = getForgeRecipe(resultId)
  if (!recipe) return { error: 'Unknown recipe' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('raid_items, equipped_raid_items, gauntlet_upgrades, dons_gauntlet_upgrades, forge_recipes_learned')
    .eq('id', user.id)
    .single()
  // The Forge is a major Gauntlet (Fathom) unlock — server-enforce it. Tier-3
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
  if (!learned.includes(recipe.result)) return { error: 'You haven\'t learned this recipe yet.' }
  const owned = (profile?.raid_items as string[] | null) ?? []
  if (owned.includes(recipe.result)) return { error: 'Already forged.' }
  if (!recipe.components.every(id => owned.includes(id))) return { error: 'You don\'t own every component yet.' }

  // Sacrifice the components, mint the result, and drop the consumed components
  // from the equipped loadout (they no longer exist).
  const newOwned = [...owned.filter(id => !recipe.components.includes(id)), recipe.result]
  const equipped = ((profile?.equipped_raid_items as string[] | null) ?? []).filter(id => !recipe.components.includes(id))
  await admin.from('profiles').update({ raid_items: newOwned, equipped_raid_items: equipped }).eq('id', user.id)
  return { ok: true, raidItems: newOwned }
}

/** Learn a forge recipe by paying its Fathom cost (the repeatable meta sink).
 *  Permanent once learned; forging then only needs the components. Gated on the
 *  Forge being unlocked; server-validated so a tampered client can't learn free. */
export async function learnForgeRecipe(resultId: string): Promise<{ ok: true; fathoms: number; learned: string[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const recipe = getForgeRecipe(resultId)
  if (!recipe) return { error: 'Unknown recipe' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_upgrades, dons_gauntlet_upgrades, gauntlet_fathoms, forge_recipes_learned, raid_items')
    .eq('id', user.id)
    .single()
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
  const fathoms = (profile?.gauntlet_fathoms as number | null) ?? 0
  if (fathoms < recipe.fathomCost) return { error: `Not enough Fathoms — this recipe needs ${recipe.fathomCost}.` }

  const newFathoms = fathoms - recipe.fathomCost
  const newLearned = [...learned, resultId]
  await admin.from('profiles').update({ gauntlet_fathoms: newFathoms, forge_recipes_learned: newLearned }).eq('id', user.id)
  return { ok: true, fathoms: newFathoms, learned: newLearned }
}

/** Charge the Abyssal Accelerator: spend gems, consume an owned EPIC boss item,
 *  and start a 24h transmutation into its LEGENDARY chase counterpart. One slot
 *  — a conditional write on the still-null slot blocks a double-charge race.
 *  Requires Don's Abyssal Forge AND the Abyssal Accelerator (account-scope, so
 *  the checks read the union of both Lockers). */
export async function startAbyssalConversion(epicId: string): Promise<
  { ok: true; conversion: AbyssalConversion; gems: number; raidItems: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const legendaryId = legendaryForEpic(epicId)
  if (!legendaryId) return { error: 'That item can’t be transmuted.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('raid_items, equipped_raid_items, gauntlet_upgrades, dons_gauntlet_upgrades, gems, abyssal_conversion')
    .eq('id', user.id)
    .single()
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
  if (owned.includes(legendaryId)) return { error: 'You already own the legendary version.' }
  const gems = (profile.gems as number | null) ?? 0
  if (gems < ABYSSAL_ACCEL_GEM_COST) return { error: `Not enough gems — charging costs ${ABYSSAL_ACCEL_GEM_COST}.` }

  const conversion: AbyssalConversion = {
    epicId, legendaryId,
    completesAt: new Date(Date.now() + ABYSSAL_ACCEL_MS).toISOString(),
  }
  const newGems = gems - ABYSSAL_ACCEL_GEM_COST
  const newOwned = owned.filter(id => id !== epicId)
  const equipped = ((profile.equipped_raid_items as string[] | null) ?? []).filter(id => id !== epicId)

  // Guard the write on the slot STILL being null so a fast double-tap (or two
  // tabs) can't charge two conversions or double-spend the epic + gems.
  const { data: updated } = await admin
    .from('profiles')
    .update({ abyssal_conversion: conversion, gems: newGems, raid_items: newOwned, equipped_raid_items: equipped })
    .eq('id', user.id)
    .is('abyssal_conversion', null)
    .select('id')
    .maybeSingle()
  if (!updated) return { error: 'The Accelerator is already running. Claim it first.' }

  await admin.from('gem_transactions').insert({ user_id: user.id, amount: -ABYSSAL_ACCEL_GEM_COST, reason: 'Charged the Abyssal Accelerator' })
  return { ok: true, conversion, gems: newGems, raidItems: newOwned }
}

/** Claim a finished Abyssal Accelerator run: add the legendary to the hold and
 *  clear the slot. Player-triggered (a "Claim" tap, not settle-on-read), guarded
 *  against a double-claim. */
export async function claimAbyssalConversion(): Promise<
  { ok: true; legendaryId: string; raidItems: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('raid_items, abyssal_conversion')
    .eq('id', user.id)
    .single()
  const conversion = parseAbyssalConversion(profile?.abyssal_conversion)
  if (!conversion) return { error: 'Nothing to claim.' }
  if (!isConversionReady(conversion, Date.now())) return { error: 'It’s still transmuting.' }

  const owned = (profile?.raid_items as string[] | null) ?? []
  const newOwned = owned.includes(conversion.legendaryId) ? owned : [...owned, conversion.legendaryId]

  const { data: updated } = await admin
    .from('profiles')
    .update({ raid_items: newOwned, abyssal_conversion: null })
    .eq('id', user.id)
    .not('abyssal_conversion', 'is', null)
    .select('id')
    .maybeSingle()
  if (!updated) return { error: 'Already claimed.' }

  return { ok: true, legendaryId: conversion.legendaryId, raidItems: newOwned }
}

/** Mark the one-time "The Forge Awakens" celebration as seen (fires the first
 *  time the player opens the Forge after unlocking it). */
export async function markForgeIntroSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_forge_intro: true }).eq('id', user.id)
}

export async function equipShipSkin(skinId: string | null): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  if (skinId !== null) {
    const { data: profile } = await admin.from('profiles').select('ship_skins, ship_tier').eq('id', user.id).single()
    const owned = (profile?.ship_skins as string[] | null) ?? []
    if (!owned.includes(skinId)) return
    // Tier-gated skins (e.g. Man-o-War-only) can't be equipped on a smaller hull.
    const skin = getShipSkin(skinId)
    if (skin && !canEquipShipSkin(skin, (profile?.ship_tier as number | null) ?? 0)) return
  }
  await admin.from('profiles').update({ equipped_ship_skin: skinId }).eq('id', user.id)
}

/** Has the player cleared Chapter 3 (beaten the Quartermaster)? That's the raid
 *  that reveals the ultimate schematics and unlocks the whole build flow. */
async function hasClearedChapter3(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from('raid_completions')
    .select('id').eq('user_id', userId).eq('raid_id', 'the_quartermaster').limit(1).maybeSingle()
  return !!data
}

/** The live ultimate state, settling any matured build on read. Returns the
 *  ACTIVE (completed) augment id + the in-progress build, if any. Promoting a
 *  matured build here means the ultimate goes live the next time the player
 *  loads the ship screen — no cron needed (mirrors the pending-sales pattern). */
export async function getUltimateState(): Promise<{ active: string | null; build: ShipAugmentBuild | null; schematics: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { active: null, build: null, schematics: false }
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('manowar_augment, manowar_augment_build, manowar_schematics').eq('id', user.id).single()
  const settled = await settleUltimateBuild(admin, user.id,
    (profile?.manowar_augment as string | null) ?? null,
    profile?.manowar_augment_build ?? null)
  return { ...settled, schematics: profile?.manowar_schematics === true }
}

/** Begin building an ultimate. Charges AUGMENT_COST doubloons and stamps a 24h
 *  build clock. Requires all four gates. The choice is PERMANENT — once an ultimate
 *  is built (or building), you cannot build another; there is no rebuild/swap. */
export async function startUltimateBuild(id: string): Promise<{ ok: boolean; error?: string; doubloons?: number; completesAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('ship_tier, expedition_xp, doubloons, manowar_augment, manowar_augment_build, gauntlet_upgrades').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }

  // The ultimate is a once-and-for-all choice. If one is already forged, no rebuild.
  if (profile.manowar_augment) {
    return { ok: false, error: 'Your ship already carries its ultimate. The choice is permanent.' }
  }
  // A build already underway can't be double-started (re-pick it instead).
  const existing = parseAugmentBuild(profile.manowar_augment_build ?? null)
  if (existing && !isBuildComplete(existing, Date.now())) {
    return { ok: false, error: 'A weapon is already being built. Change your pick instead.' }
  }

  const navLevel = navLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  const chapter3Cleared = await hasClearedChapter3(admin, user.id)
  const gate = canBuildUltimate({
    chapter3Cleared,
    shipTier: (profile.ship_tier as number | null) ?? 0,
    navLevel,
    hasRack: bonusChargeSlots((profile.gauntlet_upgrades as string[] | null) ?? []) > 0,
  })
  if (!gate) return { ok: false, error: 'You do not meet every requirement yet.' }

  const doubloons = (profile.doubloons as number | null) ?? 0
  if (doubloons < AUGMENT_COST) return { ok: false, error: `You need ${AUGMENT_COST.toLocaleString()} doubloons.` }

  const completesAt = new Date(Date.now() + ULTIMATE_BUILD_MS).toISOString()
  const build: ShipAugmentBuild = { id: augment.id, completesAt }
  const newDoubloons = doubloons - AUGMENT_COST
  // Conditional write: only start if no build is in flight (guards a double-tap).
  const { data: updated } = await admin.from('profiles')
    .update({ manowar_augment_build: build, doubloons: newDoubloons })
    .eq('id', user.id)
    .is('manowar_augment_build', null)
    .select('manowar_augment_build')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'A weapon is already being built.' }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -AUGMENT_COST, reason: `Ultimate weapon build: ${augment.name}`,
  })
  return { ok: true, doubloons: newDoubloons, completesAt }
}

/** Re-pick which ultimate is being built. Free, only while a build is in flight —
 *  the clock keeps running, only the target weapon changes. */
export async function swapUltimateBuild(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('manowar_augment, manowar_augment_build').eq('id', user.id).single()
  const existing = parseAugmentBuild(profile?.manowar_augment_build ?? null)
  if (!existing || isBuildComplete(existing, Date.now())) {
    return { ok: false, error: 'No build in progress.' }
  }
  if (existing.id === augment.id) return { ok: true }
  // A retool can't target the weapon already on the mounts.
  if (existing.retool && profile?.manowar_augment === augment.id) {
    return { ok: false, error: 'That weapon is already mounted.' }
  }
  // Keep the same clock — you're re-tasking the shipwrights, not restarting.
  const build: ShipAugmentBuild = { id: augment.id, completesAt: existing.completesAt, ...(existing.retool ? { retool: true } : {}) }
  await admin.from('profiles').update({ manowar_augment_build: build }).eq('id', user.id)
  return { ok: true }
}

/** RETOOL a forged ultimate into a different weapon. Charges RETOOL_COST and
 *  stamps the same 24h shipwright clock; the CURRENT weapon stays armed until
 *  the work completes (settleUltimateBuild promotes it on read, as with the
 *  first build). Schematics owners never pay this — they switch instantly. */
export async function startUltimateRetool(id: string): Promise<{ ok: boolean; error?: string; doubloons?: number; completesAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, manowar_augment, manowar_augment_build, manowar_schematics').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }

  if (!profile.manowar_augment) return { ok: false, error: 'Forge your first ultimate before retooling.' }
  if (profile.manowar_augment === augment.id) return { ok: false, error: 'That weapon is already mounted.' }
  if (profile.manowar_schematics === true) return { ok: false, error: 'You own the Full Schematics. Switch freely instead.' }
  const existing = parseAugmentBuild(profile.manowar_augment_build ?? null)
  if (existing && !isBuildComplete(existing, Date.now())) {
    return { ok: false, error: 'The shipwrights are already at work. Change their pick instead.' }
  }

  const doubloons = (profile.doubloons as number | null) ?? 0
  if (doubloons < RETOOL_COST) return { ok: false, error: `You need ${RETOOL_COST.toLocaleString()} doubloons.` }

  const completesAt = new Date(Date.now() + ULTIMATE_BUILD_MS).toISOString()
  const build: ShipAugmentBuild = { id: augment.id, completesAt, retool: true }
  const newDoubloons = doubloons - RETOOL_COST
  // Conditional write guards a double-tap, same as the first build.
  const { data: updated } = await admin.from('profiles')
    .update({ manowar_augment_build: build, doubloons: newDoubloons })
    .eq('id', user.id)
    .is('manowar_augment_build', null)
    .select('manowar_augment_build')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'The shipwrights are already at work.' }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -RETOOL_COST, reason: `Ultimate retool: ${augment.name}`,
  })
  return { ok: true, doubloons: newDoubloons, completesAt }
}

/** Buy the Full Schematics: one purchase, then free instant switching between
 *  all three ultimates forever. If a paid retool is mid-clock, it completes on
 *  the spot — you own every plan now; nobody waits on a torn page. */
export async function buyUltimateSchematics(): Promise<{ ok: boolean; error?: string; doubloons?: number; active?: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, manowar_augment, manowar_augment_build, manowar_schematics').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }

  if (!profile.manowar_augment) return { ok: false, error: 'Forge your first ultimate before buying the Full Schematics.' }
  if (profile.manowar_schematics === true) return { ok: false, error: 'You already own the Full Schematics.' }

  const doubloons = (profile.doubloons as number | null) ?? 0
  if (doubloons < SCHEMATICS_COST) return { ok: false, error: `You need ${SCHEMATICS_COST.toLocaleString()} doubloons.` }

  // A retool mid-clock finishes instantly with the purchase.
  const pending = parseAugmentBuild(profile.manowar_augment_build ?? null)
  const newDoubloons = doubloons - SCHEMATICS_COST
  const active = pending?.retool ? pending.id : (profile.manowar_augment as string)
  // Conditional write (schematics still false) guards a double-tap.
  const { data: updated } = await admin.from('profiles')
    .update({
      manowar_schematics: true,
      doubloons: newDoubloons,
      manowar_augment: active,
      ...(pending?.retool ? { manowar_augment_build: null } : {}),
    })
    .eq('id', user.id)
    .eq('manowar_schematics', false)
    .select('manowar_schematics')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'You already own the Full Schematics.' }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -SCHEMATICS_COST, reason: 'Ultimate weapon: the Full Schematics',
  })
  return { ok: true, doubloons: newDoubloons, active }
}

/** Free instant ultimate switch — Full Schematics owners only. */
export async function switchUltimate(id: string): Promise<{ ok: boolean; error?: string; active?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const augment = getShipAugment(id)
  if (!augment) return { ok: false, error: 'Unknown weapon.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('manowar_augment, manowar_schematics').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }
  if (!profile.manowar_augment) return { ok: false, error: 'Forge your first ultimate before switching.' }
  if (profile.manowar_schematics !== true) return { ok: false, error: 'Switching freely takes the Full Schematics.' }
  if (profile.manowar_augment === augment.id) return { ok: true, active: augment.id }

  // Any stale build is moot for a schematics owner — clear it as we switch.
  await admin.from('profiles')
    .update({ manowar_augment: augment.id, manowar_augment_build: null })
    .eq('id', user.id)
  return { ok: true, active: augment.id }
}

/** Buy the Sixth Berth — a permanent Man-o-War crew slot (5 → 6). Gated on
 *  clearing Raid 7 (the Blockade); a heavy doubloon sink, once. Opens the
 *  full six-crew bench Don Finleone's six phases demand. */
export async function buySixthBerth(): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, has_sixth_berth').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }
  if (profile.has_sixth_berth === true) return { ok: false, error: 'Your ship already has its sixth crew slot.' }

  // Gate: the berth reveals only once Sal Brackwater (Raid 7) is beaten.
  const { data: cleared } = await admin.from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_blockade').limit(1).maybeSingle()
  if (!cleared) return { ok: false, error: 'Beat Sal Brackwater before you can add a crew slot.' }

  const doubloons = (profile.doubloons as number | null) ?? 0
  if (doubloons < SIXTH_BERTH_COST) return { ok: false, error: `You need ${SIXTH_BERTH_COST.toLocaleString()} doubloons.` }

  const newDoubloons = doubloons - SIXTH_BERTH_COST
  // Conditional write (still false) guards a double-tap.
  const { data: updated } = await admin.from('profiles')
    .update({ has_sixth_berth: true, doubloons: newDoubloons })
    .eq('id', user.id)
    .eq('has_sixth_berth', false)
    .select('has_sixth_berth')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'Your ship already carries the sixth berth.' }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -SIXTH_BERTH_COST, reason: 'The Sixth Berth (Man-o-War crew slot)',
  })
  return { ok: true, doubloons: newDoubloons }
}

/** Buy the Expanded Armory — a permanent extra raid-item mount from Don
 *  Finleone's shipwright. Gated on clearing Raid 8 (the Throne); a heavy
 *  doubloon sink, once. One more piece of gear working every fight. */
export async function buyArmoryExpansion(): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, has_armory_expansion').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }
  if (profile.has_armory_expansion === true) return { ok: false, error: 'Your deck already carries the extra mount.' }

  // Gate: the refit reveals only once Don Finleone (Raid 8) is beaten.
  const { data: cleared } = await admin.from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_throne').limit(1).maybeSingle()
  if (!cleared) return { ok: false, error: 'Take the throne before the shipwright will cut you a new mount.' }

  const doubloons = (profile.doubloons as number | null) ?? 0
  if (doubloons < ARMORY_EXPANSION_COST) return { ok: false, error: `You need ${ARMORY_EXPANSION_COST.toLocaleString()} doubloons.` }

  const newDoubloons = doubloons - ARMORY_EXPANSION_COST
  // Conditional write (still false) guards a double-tap.
  const { data: updated } = await admin.from('profiles')
    .update({ has_armory_expansion: true, doubloons: newDoubloons })
    .eq('id', user.id)
    .eq('has_armory_expansion', false)
    .select('has_armory_expansion')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'Your deck already carries the extra mount.' }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -ARMORY_EXPANSION_COST, reason: 'The Expanded Armory (extra raid-item mount)',
  })
  return { ok: true, doubloons: newDoubloons }
}

/** Dismiss the one-time "ultimate plans discovered" celebration. */
export async function markUltimateUnlockSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ seen_ultimate_unlock: true }).eq('id', user.id)
}

/** Mark the first-time Manage Ship (loadout drawer) guide as seen. */
export async function markShipGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_ship_guide: true }).eq('id', user.id)
}
