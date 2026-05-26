import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import ProfileClient from './ProfileClient'
import { notFound } from 'next/navigation'
import { getLevelFromXP as getExpeditionLevel, getNavigatorTitle } from '@/lib/expeditionLevel'
import { isPremiumActive } from '@/lib/premium'
import { crewDisplayName } from '@/lib/crewGen'
import type { ShowcaseCrew } from '@/components/CrewShowcase'
import type { CareerStats, CareerAggregates } from '@/lib/careerStats'

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  return {
    title: `${username} — Small Fishes`,
    alternates: { canonical: `/u/${username}` },
  }
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const [{ data: { user } }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('profiles')
      .select('id, username, showcase_crew_ids, is_premium, premium_expires_at, fishing_xp, expedition_xp, hook_tier, rod_tier, reel_tier, line_tier, ship_tier, ship_name, highest_perfect_streak, has_tide_turner, has_phantom_hook, equipped_ship_skin, raid_items, character_color, equipped_special, equipped_badges, equipped_boat, equipped_hat, avatar_bg_color, avatar_border_color, profile_bg, fishing_casts, total_perfects, highest_raid_damage')
      .ilike('username', username)
      .single(),
  ])

  if (!profile) notFound()

  const showcaseCrewIds: number[] = (profile.showcase_crew_ids as number[] | null) ?? []

  const [
    showcaseData,
    { count: uniqueSpecies },
    rarestFishData,
    navProfileData,
    crewRowData,
    voyagesData,
    { data: careerAgg },
  ] = await Promise.all([
    showcaseCrewIds.length > 0
      ? admin.from('user_crew')
          .select('id, rarity, power, dodge, fortune, effects, cards(name, filename, slug)')
          .eq('user_id', profile.id)
          .in('id', showcaseCrewIds)
      : Promise.resolve({ data: [] as any[] }),

    admin.from('fish_collection').select('fish_id', { count: 'exact', head: true }).eq('user_id', profile.id),

    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat)')
      .eq('user_id', profile.id)
      .order('fish_species(bite_rarity)', { ascending: false })
      .limit(3),

    user ? admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single() : Promise.resolve({ data: null }),

    user && user.id !== profile.id
      ? admin.from('crew').select('follower_id').eq('follower_id', user.id).eq('following_id', profile.id).single()
      : Promise.resolve({ data: null }),

    admin.from('daily_voyages')
      .select('id, route, status, total_doubloons, total_gems, crew_lost, created_at, captains_log')
      .eq('user_id', profile.id)
      .eq('status', 'revealed')
      .order('created_at', { ascending: false })
      .limit(10),

    admin.rpc('career_stats', { uid: profile.id }),
  ])

  // Build the player-picked crew showcase, preserving the saved order.
  const crewById = new Map(((showcaseData.data ?? []) as any[]).map(r => [r.id, r]))
  const showcaseCrew: ShowcaseCrew[] = showcaseCrewIds
    .map(id => crewById.get(id))
    .filter(Boolean)
    .map((r: any) => ({
      id: r.id,
      name: crewDisplayName(r.cards?.slug ?? '', r.cards?.name ?? 'Crew'),
      filename: r.cards?.filename ?? '',
      rarity: r.rarity,
      power: r.power,
      dodge: r.dodge,
      fortune: r.fortune,
      effects: (r.effects ?? []) as string[],
    }))

  const rarestFish = ((rarestFishData.data ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean)
    .slice(0, 3) as { id: number; name: string; bite_rarity: number; habitat?: string }[]

  const agg = (careerAgg ?? {}) as Partial<CareerAggregates>
  const career: CareerStats = {
    fishingCasts: (profile.fishing_casts as number | null) ?? 0,
    perfects: (profile.total_perfects as number | null) ?? 0,
    fishSold: agg.fishSold ?? 0,
    raidsCompleted: agg.raidsCompleted ?? 0,
    voyageLoot: agg.voyageLoot ?? 0,
    highestRaidDamage: (profile.highest_raid_damage as number | null) ?? 0,
  }

  const navProfile = navProfileData.data

  return (
    <>
      <main className="min-h-screen pb-24 sm:pb-0 pt-10">
        <ProfileClient
          username={profile.username}
          showcaseCrew={showcaseCrew}
          voyages={(voyagesData.data ?? []) as import('./ProfileClient').VoyageEntry[]}
          isPremium={isPremiumActive(profile)}
          stats={{
            uniqueSpecies: uniqueSpecies ?? 0,
            fishingXP: profile.fishing_xp ?? 0,
            expeditionXP: profile.expedition_xp ?? 0,
            highestPerfectStreak: profile.highest_perfect_streak ?? 0,
          }}
          gear={{
            hookTier: profile.hook_tier ?? 0,
            rodTier: profile.rod_tier ?? 0,
            reelTier: profile.reel_tier ?? 0,
            lineTier: profile.line_tier ?? 0,
            shipTier: profile.ship_tier ?? 0,
            shipName: profile.ship_name ?? null,
          }}
          rarestFish={rarestFish}
          ownedSpecialIds={[
            ...(profile.has_tide_turner ? ['tide_turner'] : []),
            ...(profile.has_phantom_hook ? ['phantom_hook'] : []),
          ]}
          equippedShipSkin={(profile.equipped_ship_skin as string | null) ?? null}
          raidItemIds={(profile.raid_items as string[] | null) ?? []}
          isOwnProfile={!!user && user.id === profile.id}
          isInCrew={!!crewRowData.data}
          characterColor={profile?.character_color ?? 'default'}
          equippedSpecialId={(profile?.equipped_special as string | null) ?? null}
          equippedBadges={(profile?.equipped_badges as string[] | null) ?? []}
          equippedBoat={(profile?.equipped_boat as string | null) ?? null}
          equippedHat={(profile?.equipped_hat as string | null) ?? null}
          avatarBg={(profile?.avatar_bg_color as string | null) ?? null}
          avatarBorder={(profile?.avatar_border_color as string | null) ?? null}
          profileBg={(profile?.profile_bg as string | null) ?? null}
          career={career}
        />
      </main>
    </>
  )
}
