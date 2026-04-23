import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/Nav'
import ProfileClient from './ProfileClient'
import { notFound } from 'next/navigation'

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const [{ data: { user } }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    admin.from('profiles').select('id, username, showcase_variant_ids').ilike('username', username).single(),
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
    // Preserve saved order
    const byId = Object.fromEntries((data ?? []).map((v: any) => [v.id, v]))
    showcaseVariants = showcaseIds.map(id => byId[id]).filter(Boolean)
  } else {
    const { data } = await admin
      .from('user_collection')
      .select('card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', profile.id)
      .order('card_variants(drop_weight)', { ascending: true })
      .limit(20)
    // Deduplicate by variant id, take top 5
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

  // Stats
  const [{ count: packsOpened }, { count: totalVariants }, { data: ownedRows }] = await Promise.all([
    admin.from('pack_history').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
    admin.from('card_variants').select('*', { count: 'exact', head: true }),
    admin.from('user_collection').select('card_variant_id').eq('user_id', profile.id),
  ])
  const ownedVariants = new Set(ownedRows?.map((r: any) => r.card_variant_id)).size
  const completionPct = totalVariants ? Math.round((ownedVariants / totalVariants) * 100) : 0

  // Nav data
  const { data: navProfile } = user ? await admin.from('profiles').select('packs_available').eq('id', user.id).single() : { data: null }

  return (
    <>
      <Nav packsAvailable={navProfile?.packs_available ?? undefined} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-10">
        <ProfileClient
          username={profile.username}
          showcaseVariants={showcaseVariants}
          stats={{ packsOpened: packsOpened ?? 0, completionPct }}
        />
      </main>
    </>
  )
}
