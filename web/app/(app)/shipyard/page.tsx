// THE SHIPYARD — where the loadout is committed before you sail.
//
// Reached from its own island on the ocean hub, and the successor to the
// fishing page's Gear & Shop drawer: everything that drawer's Loadout and Stats
// tabs did happens here, on a page, with the boat itself above it.
//
// It loads what GearScreen needs and nothing else. The fishing page loads all
// of this too, plus the market, the almanac and the zone data, because it is
// also a game screen — this is just the locker.
//
// See docs/systems/ocean-hub.md for why the loadout moved off the fishing page.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { isPremiumActive } from '@/lib/premium'
import { RODS } from '@/lib/rods'
import { getFishHold } from '@/lib/fishHold'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { earnedLevelColors, earnedAchievementColors } from '@/lib/characters'
import { earnedAchievementBoats } from '@/lib/boats'
import { getUserAchievementPoints } from '@/lib/achievementPoints'
import ShipyardClient from './ShipyardClient'

export const metadata = { title: 'The Shipyard' }

export default async function ShipyardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess: this used to be a
  // copy of `is_admin !== true` in each of them, which is four chances to
  // open three and forget the fourth.
  if (!canSail(profile)) redirect('/tavern')

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

  const fishingLevel = getLevelFromXP(Number(profile?.fishing_xp ?? 0))
  const holdTier = Number(profile?.fish_hold_tier ?? 0)

  // Earned-but-ungranted skins and boats are unioned into the pickers, exactly
  // as the fishing page does it — equipping one is what persists the unlock.
  // Without this, crossing Nav 50 through raids leaves a skin you have earned
  // invisible on whichever of the two screens forgot to do the union.
  const storedColors = (profile?.unlocked_character_colors as string[] | null) ?? []
  const unlockedCharacterColors = [...storedColors, ...earnedLevelColors({
    fishingLevel,
    navLevel: navLevelFromXP(profile?.expedition_xp ?? 0),
    maxPrestige: Math.max(0, ...Object.values((profile?.prestige_levels as Record<string, number> | null) ?? {})),
  }, storedColors), ...earnedAchievementColors(achievementPoints, storedColors)]

  const storedBoats = (profile?.unlocked_boats as string[] | null) ?? []
  const unlockedBoats = [...storedBoats, ...earnedAchievementBoats(achievementPoints, storedBoats)]

  const todayStr = new Date().toISOString().split('T')[0]
  const hasTideTurner = profile?.has_tide_turner === true
  const usedToday = hasTideTurner && profile?.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0

  return (
    <ShipyardClient
      doubloons={Number(profile?.doubloons ?? 0)}
      gems={Number(profile?.gems ?? 0)}
      fishingLevel={fishingLevel}
      isPremium={isPremiumActive(profile)}

      equippedRod={Number(profile?.rod_tier ?? 0)}
      ownedRods={[...owned].sort((a, b) => a - b)}
      reelTier={Number(profile?.reel_tier ?? 0)}
      hookTier={Number(profile?.hook_tier ?? 0)}
      lineTier={Number(profile?.line_tier ?? 0)}
      completionistEffects={(profile?.completionist_effects as number[] | null) ?? null}
      hasForgedBefore={profile?.has_seen_forge_flourish === true}
      hullTier={Number(profile?.hull_speed_tier ?? 0)}
      handlingTier={Number(profile?.hull_handling_tier ?? 0)}
      accelTier={Number(profile?.hull_accel_tier ?? 0)}
      holdTier={holdTier}
      holdCapacity={getFishHold(holdTier).capacity}

      baitInventory={(baitRows ?? []) as { bait_type: string; quantity: number }[]}
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      unlockedCharacterColors={unlockedCharacterColors}
      equippedBadges={(profile?.equipped_badges as string[] | null) ?? []}
      unlockedBadges={(profile?.unlocked_badges as string[] | null) ?? []}
      equippedBoat={(profile?.equipped_boat as string | null) ?? null}
      unlockedBoats={unlockedBoats}
      equippedHat={(profile?.equipped_hat as string | null) ?? null}
      unlockedHats={(profile?.unlocked_hats as string[] | null) ?? []}
      equippedPet={(profile?.equipped_pet as string | null) ?? null}
      equippedPetBow={(profile?.equipped_pet_bow as string | null) ?? null}
      unlockedPets={(profile?.unlocked_pets as string[] | null) ?? []}

      equippedSpecial={(profile?.equipped_special as string | null) ?? null}
      equippedSpecial2={(profile?.equipped_special_2 as string | null) ?? null}
      hasDeepReel={profile?.finn_spoil_free === 'fishing' || profile?.finn_spoil_paid === 'fishing'}
      hasAnglersPatience={profile?.has_anglers_patience === true}
      anglersPatienceXp={Number(profile?.anglers_patience_xp ?? 0)}
      hasTideTurner={hasTideTurner}
      tideTurnerSkipsLeft={hasTideTurner ? Math.max(0, 3 - usedToday) : 0}
      hasPhantomHook={profile?.has_phantom_hook === true}
      hasAutoCaster={profile?.has_auto_caster === true}
      hasAutoCatcher={profile?.has_auto_catcher === true}
      hasPerfectedSigil={profile?.has_perfected_sigil === true}
      gauntletDeepest={Number(profile?.gauntlet_deepest ?? 0)}
      showWaitTimer={profile?.show_wait_timer !== false}
    />
  )
}
