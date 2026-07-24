import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import ProfileClient from './ProfileClient'
import { notFound } from 'next/navigation'
// (nav-level helpers no longer needed here — ProfileClient derives the level itself)
import { isPremiumActive } from '@/lib/premium'
import { crewDisplayName } from '@/lib/crewGen'
import { resolveCrewFilename, type EquippedCrewSkins } from '@/lib/crewSkins'
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
      .select('id, username, showcase_crew_ids, is_premium, premium_expires_at, fishing_xp, expedition_xp, hook_tier, rod_tier, reel_tier, line_tier, ship_tier, ship_name, highest_perfect_streak, has_tide_turner, has_phantom_hook, has_perfected_sigil, equipped_ship_skin, raid_items, character_color, equipped_special, equipped_badges, equipped_boat, equipped_hat, equipped_pet, avatar_bg_color, avatar_border_color, profile_bg, fishing_casts, total_perfects, highest_raid_damage, equipped_crew_skins, prestige_levels')
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
    { data: goldenRows },
  ] = await Promise.all([
    // Featured crew first; if the player hasn't picked anyone, fall
    // back to whoever's currently on the ship so the section is
    // informative by default instead of just hiding.
    // Public profile shows the LIVE roster only — fallen crew are
    // memorialized privately in the player's own Crew Hall, not on
    // their visit-by-anyone profile.
    showcaseCrewIds.length > 0
      ? admin.from('user_crew')
          .select('id, rarity, power, dodge, fortune, effects, xp, nickname, cards(name, filename, slug)')
          .eq('user_id', profile.id)
          .is('died_at', null)
          .in('id', showcaseCrewIds)
      : admin.from('user_crew')
          .select('id, rarity, power, dodge, fortune, effects, xp, nickname, cards(name, filename, slug)')
          .eq('user_id', profile.id)
          .is('died_at', null)
          // Public showcase fallback when the player hasn't picked one:
          // top 3 live crew sorted by XP (≈ level) desc, then rarity
          // desc as tiebreaker. Reads as "their best three" — a far
          // better bragging surface than whoever happens to be on the
          // voyage track right now.
          .order('xp', { ascending: false })
          .order('rarity', { ascending: false })
          .limit(3),

    admin.from('fish_collection').select('fish_id', { count: 'exact', head: true }).eq('user_id', profile.id),

    // ALL caught fish — the per-zone Rarest Catches showcase groups + ranks
    // these client-side (top 3 per zone by rarity, then sell value).
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat, sell_value)')
      .eq('user_id', profile.id),

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

    // Mounted golden catches — the gilded trophy wall. Source of truth is
    // fish_collection.is_golden (exactly what the collection log shows golden),
    // rarest first.
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat)')
      .eq('user_id', profile.id)
      .eq('is_golden', true)
      .order('fish_species(bite_rarity)', { ascending: false }),
  ])

  const goldenMounts = ((goldenRows ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean) as { id: number; name: string; bite_rarity: number; habitat?: string }[]

  // Build the crew showcase. Player's explicit pick preserves their
  // saved order; the fallback (assigned crew) is already ordered by
  // voyage_slot ASC from the query.
  const rawCrew = (showcaseData.data ?? []) as any[]
  const orderedCrew = showcaseCrewIds.length > 0
    ? showcaseCrewIds.map(id => rawCrew.find(r => r.id === id)).filter(Boolean)
    : rawCrew
  const viewedEquippedSkins = (profile.equipped_crew_skins as EquippedCrewSkins | null) ?? {}
  const showcaseCrew: ShowcaseCrew[] = orderedCrew.map((r: any) => ({
    id: r.id,
    name: (r.nickname as string | null) ?? crewDisplayName(r.cards?.slug ?? '', r.cards?.name ?? 'Crew'),
    filename: resolveCrewFilename((r.cards?.slug as string | undefined)?.toLowerCase() ?? '', r.cards?.filename ?? '', viewedEquippedSkins),
    slug: (r.cards?.slug as string | undefined)?.toLowerCase() ?? '',
    rarity: r.rarity,
    power: r.power,
    dodge: r.dodge,
    fortune: r.fortune,
    effects: (r.effects ?? []) as string[],
    xp: (r.xp as number | null) ?? 0,
  }))

  const rarestFish = ((rarestFishData.data ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean) as { id: number; name: string; bite_rarity: number; habitat?: string; sell_value?: number }[]

  const agg = (careerAgg ?? {}) as Partial<CareerAggregates>
  const career: CareerStats = {
    fishingCasts: (profile.fishing_casts as number | null) ?? 0,
    perfects: (profile.total_perfects as number | null) ?? 0,
    fishSold: agg.fishSold ?? 0,
    raidsCompleted: agg.raidsCompleted ?? 0,
    voyageLoot: agg.voyageLoot ?? 0,
    highestRaidDamage: (profile.highest_raid_damage as number | null) ?? 0,
    prestigeTotal: Object.values((profile.prestige_levels as Record<string, number> | null) ?? {}).reduce((a, b) => a + (Number(b) || 0), 0),
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
          prestigeLevels={(profile.prestige_levels as Record<string, number> | null) ?? {}}
          goldenMounts={goldenMounts}
          ownedSpecialIds={[
            ...(profile.has_tide_turner ? ['tide_turner'] : []),
            ...(profile.has_phantom_hook ? ['phantom_hook'] : []),
            ...(profile.has_perfected_sigil ? ['perfected_sigil'] : []),
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
          equippedPet={(profile?.equipped_pet as string | null) ?? null}
          avatarBg={(profile?.avatar_bg_color as string | null) ?? null}
          avatarBorder={(profile?.avatar_border_color as string | null) ?? null}
          profileBg={(profile?.profile_bg as string | null) ?? null}
          career={career}
        />
      </main>
    </>
  )
}
