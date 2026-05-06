import { createClient } from '@/lib/supabase/server'
import { getShip } from '@/lib/ships'
import ShipRunGame from './ShipRunGame'

export default async function ShipRunPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let shipTier = 0
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('ship_tier')
      .eq('id', user.id)
      .single()
    shipTier = data?.ship_tier ?? 0
  }

  const ship = getShip(shipTier)

  return (
    <main style={{ minHeight: '100dvh', background: '#0b1d30', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px 24px' }}>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'sans-serif', marginBottom: 16 }}>
        {ship.name}
      </p>
      <ShipRunGame shipImageUrl={ship.imageUrl ?? '/models/rowboat.png'} shipName={ship.name} />
      <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 14, fontFamily: 'sans-serif' }}>
        Tap left half to dodge up · right half to dodge down
      </p>
    </main>
  )
}
