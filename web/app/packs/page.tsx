import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PackOpener from './PackOpener'
import type { CardVariant } from '@/lib/types'

export default async function PacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: variants }] = await Promise.all([
    supabase.from('profiles').select('packs_available').eq('id', user.id).single(),
    supabase.from('card_variants').select('id, card_id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier)'),
  ])

  const packsAvailable = profile?.packs_available ?? 0

  return (
    <>
      <Nav packsAvailable={packsAvailable} />
      <main className="min-h-screen px-6 py-14">
        <p className="sg-eyebrow text-center mb-3">Booster Packs</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-12"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          Open Pack.
        </h1>
        <PackOpener
          packsAvailable={packsAvailable}
          variants={(variants ?? []) as unknown as CardVariant[]}
        />
      </main>
    </>
  )
}
