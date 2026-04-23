import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import ProfileClient from './ProfileClient'
import { notFound } from 'next/navigation'
import { ACHIEVEMENT_MAP } from '@/lib/achievements'

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const [{ data: { user } }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('profiles').select('id, username, showcase_variant_ids, is_premium, premium_expires_at, fotd_streak').ilike('username', username).single(),
  ])

  if (!profile) notFound()

  const showcaseIds: number[] = (profile.showcase_variant_ids as number[] | null) ?? []

  // Fetch showcase cards — use saved IDs or fall back to top 5 rarest pulls
  let showcaseVariants: unknown[] = []
  if (showcaseIds.length > 0) {
    const { data } = await admin
      .from('card_variants')
      .select('id, variant_name, border_style, art_effect, drop_weight, cards(name, filename)')
      .in('id', showcaseIds)
    const byId = Object.fromEntries((data ?? []).map((v: any) => [v.id, v]))
    showcaseVariants = showcaseIds.map(id => byId[id]).filter(Boolean)
  } else {
    const { data } = await admin
      .from('user_collection')
      .select('card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', profile.id)
      .order('card_variants(drop_weight)', { ascending: true })
      .limit(20)
    const seen = new Set()
    for (const row of data ?? []) {
      const cv = (row as any).card_variants
      if (cv && !seen.has(cv.id)) {
        seen.add(cv.id)
        showcaseVariants.push(cv)
        if (showcaseVariants.length >= 5) break
      }
    }
  }

  // Stats + achievements
  const [{ count: packsOpened }, { count: totalVariants }, { data: ownedRows }, { data: achievementRows }] = await Promise.all([
    admin.from('pack_history').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
    admin.from('card_variants').select('*', { count: 'exact', head: true }),
    admin.from('user_collection')
      .select('card_variant_id, card_variants(card_id, drop_weight, variant_name, cards(name))')
      .eq('user_id', profile.id),
    admin.from('user_achievements').select('achievement_key, unlocked_at').eq('user_id', profile.id).order('unlocked_at'),
  ])

  const seenVariants = new Set<number>()
  const seenCards = new Set<number>()
  let rarestPull: { variantName: string; cardName: string; dropWeight: number } | null = null

  for (const row of ownedRows ?? []) {
    const cv = (row as any).card_variants
    if (!cv) continue
    seenVariants.add(row.card_variant_id)
    seenCards.add(cv.card_id)
    if (!rarestPull || cv.drop_weight < rarestPull.dropWeight) {
      rarestPull = { variantName: cv.variant_name, cardName: cv.cards?.name ?? '', dropWeight: cv.drop_weight }
    }
  }

  const ownedVariants = seenVariants.size
  const fishDiscovered = seenCards.size
  const completionPct = totalVariants ? Math.round((ownedVariants / totalVariants) * 100) : 0

  const achievements = (achievementRows ?? [])
    .map(r => ACHIEVEMENT_MAP[r.achievement_key])
    .filter(Boolean)

  // Nav data
  const { data: navProfile } = user ? await admin.from('profiles').select('packs_available').eq('id', user.id).single() : { data: null }

  return (
    <>
      <Nav packsAvailable={navProfile?.packs_available ?? undefined} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-10">
        <ProfileClient
          username={profile.username}
          showcaseVariants={showcaseVariants}
          isPremium={
            !!profile.is_premium &&
            !!profile.premium_expires_at &&
            new Date(profile.premium_expires_at) > new Date()
          }
          stats={{
            packsOpened: packsOpened ?? 0,
            completionPct,
            fishDiscovered,
            uniqueVariants: ownedVariants,
            fotdStreak: profile.fotd_streak ?? 0,
            rarestPull,
          }}
          achievements={achievements}
        />
      </main>
    </>
  )
}
