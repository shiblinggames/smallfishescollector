import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import ShipyardClient from './ShipyardClient'

export default async function ShipyardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('ship_tier, doubloons, packs_available, gems, ship_name, expedition_xp')
    .eq('id', user.id)
    .single()

  return (
    <>
      {/* Flat dark page, matching the Tackle Shop — a solid surface for translucent
          cards, not a photo behind them. */}
      <main className="min-h-screen pb-24 sm:pb-0 pt-6" style={{ background: '#0b0f18' }}>
        <ShipyardClient
          shipTier={profile?.ship_tier ?? 0}
          doubloons={profile?.doubloons ?? 0}
          navLevel={getLevelFromXP(profile?.expedition_xp ?? 0)}
          shipName={profile?.ship_name ?? null} />
      </main>
    </>
  )
}
