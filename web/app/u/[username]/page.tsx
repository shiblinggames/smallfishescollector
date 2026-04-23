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
    admin.from('profiles').select('id, username, username_changed, showcase_variant_id').ilike('username', username).single(),
  ])

  if (!profile) notFound()

  const isOwnProfile = user?.id === profile.id

  // Fetch showcase card (explicit or rarest pull fallback)
  let showcaseVariant: unknown = null
  if (profile.showcase_variant_id) {
    const { data } = await admin
      .from('card_variants')
      .select('id, variant_name, border_style, art_effect, drop_weight, cards(name, filename)')
      .eq('id', profile.showcase_variant_id)
      .single()
    showcaseVariant = data
  } else {
    const { data } = await admin
      .from('user_collection')
      .select('card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', profile.id)
      .order('card_variants(drop_weight)', { ascending: true })
      .limit(1)
      .single()
    showcaseVariant = (data as any)?.card_variants ?? null
  }

  // Stats
  const [{ count: packsOpened }, { count: totalVariants }, { data: ownedRows }] = await Promise.all([
    admin.from('pack_history').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
    admin.from('card_variants').select('*', { count: 'exact', head: true }),
    admin.from('user_collection').select('card_variant_id').eq('user_id', profile.id),
  ])
  const ownedVariants = new Set(ownedRows?.map((r: any) => r.card_variant_id)).size
  const completionPct = totalVariants ? Math.round((ownedVariants / totalVariants) * 100) : 0

  // Own profile: fetch owned cards for showcase picker (deduplicated, rarest first)
  let ownedCards: unknown[] = []
  if (isOwnProfile) {
    const { data } = await admin
      .from('user_collection')
      .select('card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', profile.id)
      .order('card_variants(drop_weight)', { ascending: true })
    const seen = new Set()
    ownedCards = (data ?? []).reduce((acc: unknown[], row: any) => {
      const cv = row.card_variants
      if (cv && !seen.has(cv.id)) { seen.add(cv.id); acc.push(cv) }
      return acc
    }, [])
  }

  // Nav data
  const { data: navProfile } = user ? await admin.from('profiles').select('packs_available').eq('id', user.id).single() : { data: null }

  return (
    <>
      <Nav packsAvailable={navProfile?.packs_available ?? undefined} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-10">
        <ProfileClient
          profile={{ id: profile.id, username: profile.username, username_changed: profile.username_changed ?? false }}
          showcaseVariant={showcaseVariant}
          isOwnProfile={isOwnProfile}
          ownedCards={ownedCards}
          stats={{ packsOpened: packsOpened ?? 0, completionPct }}
        />
      </main>
    </>
  )
}
