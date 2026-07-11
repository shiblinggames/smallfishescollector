'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RARITY_TIERS } from '@/lib/variants'
import { applyVariantBoosts, raidItemSlotsForTier } from '@/lib/expeditions'
import { getForgeRecipe, dedupeRaidItems, unobtainableComponents } from '@/lib/raidItems'
import { classSlotBonuses } from '@/lib/shipClasses'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { getShipAugment, AUGMENT_COST, ULTIMATE_BUILD_MS, canBuildUltimate, parseAugmentBuild, isBuildComplete, type ShipAugmentBuild } from '@/lib/shipAugments'
import { getShipSkin, canEquipShipSkin } from '@/lib/shipSkins'
import { settleUltimateBuild } from '@/lib/ultimateBuild'
import { hasForge, bonusChargeSlots } from '@/lib/gauntletUpgrades'

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
  // raidItemSlotsForTier in lib/expeditions). A Rowboat captain gets 1
  // slot; a Man-o-War captain gets 4.
  const { data: profile } = await admin.from('profiles').select('raid_items, ship_tier, ship_classes').eq('id', user.id).single()
  const owned = (profile?.raid_items as string[] | null) ?? []
  // Hull cap + the Ch4 Expanded Armory augment's extra mount.
  const slots = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0)
    + classSlotBonuses(profile?.ship_classes as Record<string, string> | null).itemSlots
  // Owned + can-coexist (one-per-tier-family, and no fusion beside its own forge
  // ingredients) + capped to the hull's slots. dedupe runs before the slice so a
  // conflicting pair can't waste a slot apiece.
  const valid = dedupeRaidItems(itemIds.filter(id => owned.includes(id))).slice(0, slots)
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
    .select('raid_items, equipped_raid_items, gauntlet_upgrades, forge_recipes_learned')
    .eq('id', user.id)
    .single()
  // The Forge is a major Gauntlet (Fathom) unlock — server-enforce it.
  if (!hasForge((profile?.gauntlet_upgrades as string[] | null) ?? [])) {
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
    .select('gauntlet_upgrades, gauntlet_fathoms, forge_recipes_learned, raid_items')
    .eq('id', user.id)
    .single()
  if (!hasForge((profile?.gauntlet_upgrades as string[] | null) ?? [])) {
    return { error: 'The Forge is locked. Unlock it in the Davy Jones Gauntlet.' }
  }
  const learned = (profile?.forge_recipes_learned as string[] | null) ?? []
  if (learned.includes(resultId)) return { error: 'Already learned.' }
  // Block recipes the player can never complete — a component was an either/or
  // Cache choice and they took the other option (own the sibling). Don't let
  // them spend Fathoms on something unbuildable.
  const blocked = unobtainableComponents(recipe.components, (profile?.raid_items as string[] | null) ?? [])
  if (blocked.length > 0) return { error: 'You can no longer obtain a component for this recipe (a one-time Cache choice).' }
  const fathoms = (profile?.gauntlet_fathoms as number | null) ?? 0
  if (fathoms < recipe.fathomCost) return { error: `Not enough Fathoms — this recipe needs ${recipe.fathomCost}.` }

  const newFathoms = fathoms - recipe.fathomCost
  const newLearned = [...learned, resultId]
  await admin.from('profiles').update({ gauntlet_fathoms: newFathoms, forge_recipes_learned: newLearned }).eq('id', user.id)
  return { ok: true, fathoms: newFathoms, learned: newLearned }
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
export async function getUltimateState(): Promise<{ active: string | null; build: ShipAugmentBuild | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { active: null, build: null }
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('manowar_augment, manowar_augment_build').eq('id', user.id).single()
  return settleUltimateBuild(admin, user.id,
    (profile?.manowar_augment as string | null) ?? null,
    profile?.manowar_augment_build ?? null)
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
    .select('manowar_augment_build').eq('id', user.id).single()
  const existing = parseAugmentBuild(profile?.manowar_augment_build ?? null)
  if (!existing || isBuildComplete(existing, Date.now())) {
    return { ok: false, error: 'No build in progress.' }
  }
  if (existing.id === augment.id) return { ok: true }
  // Keep the same clock — you're re-tasking the shipwrights, not restarting.
  const build: ShipAugmentBuild = { id: augment.id, completesAt: existing.completesAt }
  await admin.from('profiles').update({ manowar_augment_build: build }).eq('id', user.id)
  return { ok: true }
}

/** Dismiss the one-time "ultimate plans discovered" celebration. */
export async function markUltimateUnlockSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ seen_ultimate_unlock: true }).eq('id', user.id)
}
