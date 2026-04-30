'use client'

import { usePathname } from 'next/navigation'

const SUPABASE_BG = 'https://pwvndjczpdcttmyvnsyq.supabase.co/storage/v1/object/public/card-arts/backgrounds'

type BgConfig = { src: string; overlay: string }

const ROUTE_BG: [string, BgConfig][] = [
  ['/tavern/crown-and-anchor', { src: '/gamesbackground.jpg',      overlay: 'rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern/slots',            { src: '/gamesbackground.jpg',      overlay: 'rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern/market',           { src: '/exchangebackground.jpeg',  overlay: 'rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern',                  { src: '/tavernbackground.jpg',     overlay: 'rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/marketplace/shipyard',    { src: `${SUPABASE_BG}/shipyardbackground.jpeg`,   overlay: 'rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/marketplace/tackle-shop', { src: `${SUPABASE_BG}/tackleshopbackground.jpg`, overlay: 'rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/marketplace',             { src: '/marketbackground.jpeg',                   overlay: 'rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.88) 100%' }],
]

export default function ClientBackground() {
  const pathname = usePathname()
  const match = ROUTE_BG.find(([route]) => pathname.startsWith(route))
  if (!match) return null

  const { src, overlay } = match[1]

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
      />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, ${overlay})` }} />
    </div>
  )
}
