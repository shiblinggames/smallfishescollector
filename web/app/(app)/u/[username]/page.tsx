import { vigilFor } from '@/lib/ancientVigil'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownedSpecialIds } from '@/lib/specialItems'
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
      .select('id, username, showcase_crew_ids, is_premium, premium_expires_at, fishing_xp, expedition_xp, hook_tier, rod_tier, reel_tier, line_tier, ship_tier, ship_name, highest_perfect_streak, has_tide_turner, has_phantom_hook, has_perfected_sigil, has_auto_caster, has_auto_catcher, has_anglers_patience, equipped_special_2, equipped_ship_skin, raid_items, character_color, equipped_special, equipped_badges, equipped_boat, equipped_hat, equipped_pet, avatar_bg_color, avatar_border_color, profile_bg, fishing_casts, total_perfects, highest_raid_damage, equipped_crew_skins, prestige_levels, ancient_catches, ancient_vigil')
      .ilike('username', username)
      .single(),
  ])

  if (!profile) notFound()

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
    // THE RAID CREW, in seat order. This used to be a curated pick
    // (showcase_crew_ids) with a "best three by XP" fallback, which meant a
    // visitor saw whoever the player last chose to brag about rather than the
    // party they actually fight with. raid_slot is the live answer and needs
    // no configuring, so the section is never stale and never empty-by-neglect.
    // Public profile shows the LIVE roster only — fallen crew are
    // memorialized privately in the player's own Crew Hall, not on
    // their visit-by-anyone profile.
    admin.from('user_crew')
      .select('id, rarity, power, dodge, fortune, effects, xp, nickname, raid_slot, cards(name, filename, slug)')
      .eq('user_id', profile.id)
      .is('died_at', null)
      .not('raid_slot', 'is', null)
      .order('raid_slot', { ascending: true }),

    admin.from('fish_collection').select('fish_id', { count: 'exact', head: true }).eq('user_id', profile.id),

    // ALL caught fish — the per-zone Rarest Catches showcase groups + ranks
    // these client-side (top 3 per zone by rarity, then sell value).
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat, sell_value)')
      .eq('user_id', profile.id),

    user ? admin.from('profiles').select('packs_available, doubloons, gems, ancient_catches').eq('id', user.id).single() : Promise.resolve({ data: null }),

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

  // ── THE VAULT OF ANCIENTS, gated at BOTH ends ────────────────────────────
  // OWNER must hold all six, or there is no wall worth showing. VIEWER must
  // hold all six too: the giants are finale content, and a profile visit should
  // not be how somebody finds out what is down there. So this is a thing
  // finishers show to other finishers, which is the point of it.
  const ANCIENT_SPECIES_IDS = [143, 144, 145, 146, 147, 148]
  const ownerCaught = ((profile.ancient_catches as number[] | null) ?? [])
  const viewerCaught = (((navProfileData.data as { ancient_catches?: number[] } | null)?.ancient_catches) ?? [])
  const hasAllSix = (ids: number[]) => ANCIENT_SPECIES_IDS.every(id => ids.includes(id))
  const showVault = hasAllSix(ownerCaught) && hasAllSix(viewerCaught)
  const ancientVigil = showVault
    ? vigilFor(profile.ancient_vigil, ownerCaught)
    : undefined

  const goldenMounts = ((goldenRows ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean) as { id: number; name: string; bite_rarity: number; habitat?: string }[]

  // Already ordered by raid_slot ASC from the query — seat order is the order.
  const orderedCrew = (showcaseData.data ?? []) as any[]
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
          ancientsCaught={showVault ? ownerCaught : null}
          ancientVigil={ancientVigil}
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
          equippedShipSkin={(profile.equipped_ship_skin as string | null) ?? null}
          raidItemIds={(profile.raid_items as string[] | null) ?? []}
          isOwnProfile={!!user && user.id === profile.id}
          isInCrew={!!crewRowData.data}
          characterColor={profile?.character_color ?? 'default'}
          equippedSpecialId={(profile?.equipped_special as string | null) ?? null}
          ownedSpecialIds={ownedSpecialIds(profile as unknown as Record<string, unknown>)}
          equippedSpecial2Id={(profile.equipped_special_2 as string | null) ?? null}
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
