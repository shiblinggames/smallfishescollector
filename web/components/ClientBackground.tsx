'use client'

import { usePathname } from 'next/navigation'

type BgConfig = { src: string; overlay: string }

const ROUTE_BG: [string, BgConfig][] = [
  ['/raids',                   { src: '/raid1background.jpg',        overlay: 'rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.50) 50%, rgba(0,0,0,0.75) 100%' }],
  ['/leaderboard',             { src: '/leaderboardbackground.jpeg', overlay: 'rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/packs',                   { src: '/crewopeningbackground.jpg', overlay: 'rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern/crown-and-anchor', { src: '/gamesbackground.jpg',      overlay: 'rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern/slots',            { src: '/gamesbackground.jpg',      overlay: 'rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern/market',           { src: '/exchangebackground.jpeg',  overlay: 'rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  ['/tavern',                  { src: '/tavernbackground.jpg',     overlay: 'rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%' }],
  // Both marketplace pages deliberately have NO image background. They read as clean,
  // dark catalogues (a solid page set on the <main>), so their translucent cards lift
  // off a flat dark surface the way the Forge's do. A busy photo behind translucent
  // tiles was exactly what made them look muddy.
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
