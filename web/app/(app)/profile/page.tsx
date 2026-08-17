import { vigilFor } from '@/lib/ancientVigil'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownedSpecialIds } from '@/lib/specialItems'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'
import { getCrewRoster } from '@/app/(app)/crew/actions'
import { getShip } from '@/lib/ships'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import { CHARACTER_COLORS, earnedLevelColors, earnedAchievementColors } from '@/lib/characters'
import { getUserAchievementPoints } from '@/lib/achievementPoints'
import { isPremiumActive } from '@/lib/premium'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import type { CareerStats, CareerAggregates } from '@/lib/careerStats'

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile via the request-scoped cached loader (lib/userData.ts).
  const [
    profile,
    crewRoster,
    { data: rarestFishRows },
    { data: allFishSpecies },
    { data: careerAgg },
    { data: goldenRows },
  ] = await Promise.all([
    getCurrentProfile(),
    getCrewRoster(),
    // ALL caught fish — the per-zone Rarest Catches showcase groups + ranks
    // these client-side (top 3 per zone by rarity, then sell value).
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat, sell_value)')
      .eq('user_id', user.id),
    // fish_species has ~140 rows — pulling id+name for the whole table is
    // cheaper than a second round-trip just to map trophy names by id.
    admin.from('fish_species').select('id, name'),
    // Career aggregates (fish sold, voyage loot, raids, fastest raid) in one
    // SQL round-trip via the career_stats() function.
    admin.rpc('career_stats', { uid: user.id }),
    // Mounted golden catches — the gilded trophy wall. Source of truth is
    // fish_collection.is_golden (exactly what the collection log shows golden),
    // rarest first.
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat)')
      .eq('user_id', user.id)
      .eq('is_golden', true)
      .order('fish_species(bite_rarity)', { ascending: false }),
  ])

  const rarestFish = ((rarestFishRows ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean) as { id: number; name: string; bite_rarity: number; habitat?: string; sell_value?: number }[]

  const goldenMounts = ((goldenRows ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean) as { id: number; name: string; bite_rarity: number; habitat?: string }[]

  const ancientIds = ((profile?.ancient_catches as number[] | null) ?? [])
  const ancientIdSet = new Set(ancientIds)
  const ancientTrophies = ((allFishSpecies ?? []) as { id: number; name: string }[])
    .filter(f => ancientIdSet.has(f.id))

  const agg = (careerAgg ?? {}) as Partial<CareerAggregates>
  const career: CareerStats = {
    fishingCasts: profile?.fishing_casts ?? 0,
    perfects: profile?.total_perfects ?? 0,
    fishSold: agg.fishSold ?? 0,
    raidsCompleted: agg.raidsCompleted ?? 0,
    voyageLoot: agg.voyageLoot ?? 0,
    highestRaidDamage: profile?.highest_raid_damage ?? 0,
    prestigeTotal: Object.values((profile?.prestige_levels as Record<string, number> | null) ?? {}).reduce((a, b) => a + (Number(b) || 0), 0),
  }

  const ship = getShip(profile?.ship_tier ?? 0)
  const level = getLevelFromXP(profile?.fishing_xp ?? 0)
  const expeditionLevel = getExpeditionLevel(profile?.expedition_xp ?? 0)
  const storedColors = (profile?.unlocked_character_colors as string[] | null) ?? []
  const prestigeLevels = (profile?.prestige_levels as Record<string, number> | null) ?? {}
  // Union in any level-gated or achievement-gated color the player has EARNED
  // but whose grant never persisted, so the picker shows it unlocked; equipping
  // it persists the unlock server-side (see updateCharacterColor).
  const achievementPoints = await getUserAchievementPoints(user.id)
  const unlockedColors = [
    ...CHARACTER_COLORS.filter(c => c.free).map(c => c.id),
    ...storedColors,
    ...earnedLevelColors({ fishingLevel: level, navLevel: expeditionLevel, maxPrestige: Math.max(0, ...Object.values(prestigeLevels)) }, storedColors),
    ...earnedAchievementColors(achievementPoints, storedColors),
  ]
  const isPremium = isPremiumActive(profile)

  return (
    <>
      <main className="min-h-screen pt-8">
        <ProfileClient
          email={user.email ?? ''}
          username={profile?.username ?? ''}
          usernameChanged={profile?.username_changed ?? false}
          crewRoster={crewRoster}
          isPremium={isPremium}
          level={level}
          expeditionLevel={expeditionLevel}
          career={career}
          shipTier={profile?.ship_tier ?? 0}
          shipName={ship.name}
          shipColor={ship.color}
          customShipName={(profile?.ship_name as string | null) ?? null}
          equippedShipSkin={(profile?.equipped_ship_skin as string | null) ?? null}
          rodTier={profile?.rod_tier ?? 0}
          reelTier={profile?.reel_tier ?? 0}
          hookTier={profile?.hook_tier ?? 0}
          equippedSpecialId={(profile?.equipped_special as string | null) ?? null}
          ownedSpecialIds={ownedSpecialIds(profile as Record<string, unknown> | null)}
          equippedSpecial2Id={(profile?.equipped_special_2 as string | null) ?? null}
          rarestFish={rarestFish}
          prestigeLevels={(profile?.prestige_levels as Record<string, number> | null) ?? {}}
          goldenMounts={goldenMounts}
          raidItemIds={(profile?.raid_items as string[] | null) ?? []}
          ancientTrophies={ancientTrophies}
          ancientVigil={vigilFor(profile?.ancient_vigil, (profile?.ancient_catches as number[] | null) ?? null)}
          characterColor={profile?.character_color ?? 'default'}
          unlockedColors={unlockedColors}
          doubloons={profile?.doubloons ?? 0}
          gems={profile?.gems ?? 0}
          equippedBadges={(profile?.equipped_badges as string[] | null) ?? []}
          equippedBoat={(profile?.equipped_boat as string | null) ?? null}
          equippedHat={(profile?.equipped_hat as string | null) ?? null}
          equippedPet={(profile?.equipped_pet as string | null) ?? null}
          unlockedBadges={(profile?.unlocked_badges as string[] | null) ?? []}
          avatarBgColor={(profile?.avatar_bg_color as string | null) ?? null}
          avatarBorderColor={(profile?.avatar_border_color as string | null) ?? null}
          unlockedAvatarSpecials={(profile?.unlocked_avatar_specials as string[] | null) ?? []}
          initialProfileBg={(profile?.profile_bg as string | null) ?? null}
        />
      </main>
    </>
  )
}
