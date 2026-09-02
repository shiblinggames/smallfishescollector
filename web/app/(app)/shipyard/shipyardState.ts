'use server'

// ── EVERYTHING THE SHIPYARD NEEDS, IN ONE READ ──────────────────────────────
//
// The Shipyard is opened two ways now: as a page at /shipyard, and as a sheet
// over the chart when you moor at its island. Both want exactly the same
// thirty-odd facts about a captain, and neither should be the one that knows
// how to gather them.
//
// So the gathering lives here and both call it. A second copy would drift the
// first time a column was added — and the failure mode of that drift is a
// picker that shows an item on one route and not the other, which reads as the
// item being lost rather than as a screen being out of date.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { isPremiumActive } from '@/lib/premium'
import { RODS } from '@/lib/rods'
import { getFishHold } from '@/lib/fishHold'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { unlockedCosmetics } from '@/lib/cosmeticUnlocks'
import { getUserAchievementPoints } from '@/lib/achievementPoints'

export type ShipyardState = {
  doubloons: number
  gems: number
  fishingLevel: number
  isPremium: boolean
  equippedRod: number
  ownedRods: number[]
  reelTier: number
  hookTier: number
  lineTier: number
  completionistEffects: number[] | null
  hasForgedBefore: boolean
  hullTier: number
  handlingTier: number
  accelTier: number
  lanternTier: number
  holdTier: number
  holdCapacity: number
  baitInventory: { bait_type: string; quantity: number }[]
  characterColor: string
  unlockedCharacterColors: string[]
  equippedBadges: string[]
  unlockedBadges: string[]
  equippedBoat: string | null
  unlockedBoats: string[]
  equippedHat: string | null
  unlockedHats: string[]
  equippedPet: string | null
  equippedPetBow: string | null
  unlockedPets: string[]
  equippedSpecial: string | null
  equippedSpecial2: string | null
  hasDeepReel: boolean
  hasAnglersPatience: boolean
  anglersPatienceXp: number
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasAutoCatcher: boolean
  hasPerfectedSigil: boolean
  gauntletDeepest: number
  showWaitTimer: boolean
}

export async function shipyardState(): Promise<ShipyardState | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess.
  if (!canSail(profile)) return { error: 'Not yet.' }

  const admin = createAdminClient()
  const [{ data: rodRows }, { data: baitRows }, achievementPoints] = await Promise.all([
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id),
    getUserAchievementPoints(user.id),
  ])

  // Free rods never appear in rod_inventory — everybody has them, so there is
  // nothing to record. The shipyard has to add them back or a new captain sees
  // an empty rack and no way to fill it.
  const owned = new Set((rodRows ?? []).map(r => Number(r.rod_tier)))
  for (const r of RODS) if (r.cost === 0 && !r.earnedOnly && !r.traderOnly) owned.add(r.tier)

  const holdTier = Number(profile?.fish_hold_tier ?? 0)

  // Earned-but-ungranted skins and boats are unioned into the pickers —
  // equipping one is what persists the unlock, so the stored column is always a
  // subset of what the player is entitled to. See lib/cosmeticUnlocks.
  const unlocked = unlockedCosmetics(profile as never, achievementPoints)

  const todayStr = new Date().toISOString().split('T')[0]
  const hasTideTurner = profile?.has_tide_turner === true
  const usedToday = hasTideTurner && profile?.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0

  return {
    doubloons: Number(profile?.doubloons ?? 0),
    gems: Number(profile?.gems ?? 0),
    fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
    isPremium: isPremiumActive(profile),

    equippedRod: Number(profile?.rod_tier ?? 0),
    ownedRods: [...owned].sort((a, b) => a - b),
    reelTier: Number(profile?.reel_tier ?? 0),
    hookTier: Number(profile?.hook_tier ?? 0),
    lineTier: Number(profile?.line_tier ?? 0),
    completionistEffects: (profile?.completionist_effects as number[] | null) ?? null,
    hasForgedBefore: profile?.has_seen_forge_flourish === true,

    hullTier: Number(profile?.hull_speed_tier ?? 0),
    handlingTier: Number(profile?.hull_handling_tier ?? 0),
    accelTier: Number(profile?.hull_accel_tier ?? 0),
    lanternTier: Number(profile?.lantern_tier ?? 0),
    holdTier,
    holdCapacity: getFishHold(holdTier).capacity,

    baitInventory: (baitRows ?? []) as { bait_type: string; quantity: number }[],
    characterColor: (profile?.character_color as string | null) ?? 'default',
    unlockedCharacterColors: unlocked.colors,
    equippedBadges: (profile?.equipped_badges as string[] | null) ?? [],
    unlockedBadges: (profile?.unlocked_badges as string[] | null) ?? [],
    equippedBoat: (profile?.equipped_boat as string | null) ?? null,
    unlockedBoats: unlocked.boats,
    equippedHat: (profile?.equipped_hat as string | null) ?? null,
    unlockedHats: (profile?.unlocked_hats as string[] | null) ?? [],
    equippedPet: (profile?.equipped_pet as string | null) ?? null,
    equippedPetBow: (profile?.equipped_pet_bow as string | null) ?? null,
    unlockedPets: (profile?.unlocked_pets as string[] | null) ?? [],

    equippedSpecial: (profile?.equipped_special as string | null) ?? null,
    equippedSpecial2: (profile?.equipped_special_2 as string | null) ?? null,
    hasDeepReel: profile?.finn_spoil_free === 'fishing' || profile?.finn_spoil_paid === 'fishing',
    hasAnglersPatience: profile?.has_anglers_patience === true,
    anglersPatienceXp: Number(profile?.anglers_patience_xp ?? 0),
    hasTideTurner,
    tideTurnerSkipsLeft: hasTideTurner ? Math.max(0, 3 - usedToday) : 0,
    hasPhantomHook: profile?.has_phantom_hook === true,
    hasAutoCaster: profile?.has_auto_caster === true,
    hasAutoCatcher: profile?.has_auto_catcher === true,
    hasPerfectedSigil: profile?.has_perfected_sigil === true,
    gauntletDeepest: Number(profile?.gauntlet_deepest ?? 0),
    showWaitTimer: profile?.show_wait_timer !== false,
  }
}
