import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import ProfileClient from './ProfileClient'
import { notFound } from 'next/navigation'
import { getLevelFromXP as getExpeditionLevel, getNavigatorTitle } from '@/lib/expeditionLevel'

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
      .select('id, username, showcase_variant_ids, is_premium, premium_expires_at, fishing_xp, expedition_xp, hook_tier, rod_tier, reel_tier, line_tier, ship_tier, ship_name, highest_perfect_streak')
      .ilike('username', username)
      .single(),
  ])

  if (!profile) notFound()

  const showcaseIds: number[] = (profile.showcase_variant_ids as number[] | null) ?? []

  const [
    showcaseData,
    { count: packCount },
    { count: uniqueSpecies },
    rarestFishData,
    navProfileData,
    crewRowData,
    voyagesData,
  ] = await Promise.all([
    showcaseIds.length > 0
      ? admin.from('card_variants')
          .select('id, variant_name, border_style, art_effect, drop_weight, cards(name, filename)')
          .in('id', showcaseIds)
      : admin.from('user_collection')
          .select('card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
          .eq('user_id', profile.id)
          .order('card_variants(drop_weight)', { ascending: true })
          .limit(20),

    admin.from('pack_history').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),

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
  ])

  // Build showcase variants
  let showcaseVariants: unknown[] = []
  if (showcaseIds.length > 0) {
    const byId = Object.fromEntries(((showcaseData.data ?? []) as any[]).map((v: any) => [v.id, v]))
    showcaseVariants = showcaseIds.map(id => byId[id]).filter(Boolean)
  } else {
    const seen = new Set()
    for (const row of (showcaseData.data ?? []) as any[]) {
      const cv = row.card_variants
      if (cv && !seen.has(cv.id)) {
        seen.add(cv.id)
        showcaseVariants.push(cv)
        if (showcaseVariants.length >= 5) break
      }
    }
  }

  const rarestFish = ((rarestFishData.data ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean)
    .slice(0, 3) as { id: number; name: string; bite_rarity: number; habitat?: string }[]

  const navProfile = navProfileData.data

  return (
    <>
      <Nav
        packsAvailable={navProfile?.packs_available ?? undefined}
        doubloons={navProfile?.doubloons ?? undefined}
        gems={navProfile?.gems ?? undefined}
      />
      <main className="min-h-screen pb-24 sm:pb-0 pt-10">
        <ProfileClient
          username={profile.username}
          showcaseVariants={showcaseVariants}
          voyages={(voyagesData.data ?? []) as import('./ProfileClient').VoyageEntry[]}
          isPremium={
            !!profile.is_premium &&
            !!profile.premium_expires_at &&
            new Date(profile.premium_expires_at) > new Date()
          }
          stats={{
            packsOpened: packCount ?? 0,
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
          isOwnProfile={!!user && user.id === profile.id}
          isInCrew={!!crewRowData.data}
        />
      </main>
    </>
  )
}
