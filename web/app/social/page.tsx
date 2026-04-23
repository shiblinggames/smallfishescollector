import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import SocialClient from './SocialClient'
import { getCrew } from './actions'
import type { PickerCard } from './ProfileSection'
import type { BorderStyle, ArtEffect } from '@/lib/types'

export default async function SocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, crew, { data: ownedRows }] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, username, username_changed, showcase_variant_ids').eq('id', user.id).single(),
    getCrew(),
    admin.from('user_collection')
      .select('card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', user.id),
  ])

  // Build deduplicated picker cards sorted rarest first
  const seen = new Set<number>()
  const pickerCards: PickerCard[] = []
  for (const row of (ownedRows ?? []).sort((a: any, b: any) => {
    const aw = (a.card_variants as any)?.drop_weight ?? 999
    const bw = (b.card_variants as any)?.drop_weight ?? 999
    return aw - bw
  })) {
    const cv = (row as any).card_variants as any
    if (!cv || seen.has(cv.id)) continue
    seen.add(cv.id)
    pickerCards.push({
      variantId:   cv.id,
      variantName: cv.variant_name,
      borderStyle: cv.border_style as BorderStyle,
      artEffect:   cv.art_effect as ArtEffect,
      dropWeight:  cv.drop_weight,
      name:        cv.cards?.name ?? '',
      filename:    cv.cards?.filename ?? '',
    })
  }

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pt-8">
        <div className="px-6 max-w-sm mx-auto mb-6">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Social</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>Your Crew</h1>
        </div>
        <SocialClient
          initialCrew={crew}
          username={profile?.username ?? ''}
          usernameChanged={profile?.username_changed ?? false}
          showcaseVariantIds={(profile?.showcase_variant_ids as number[] | null) ?? []}
          pickerCards={pickerCards}
        />
      </main>
    </>
  )
}
