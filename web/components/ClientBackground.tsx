'use client'

import { usePathname } from 'next/navigation'

type BgConfig = { src: string; overlay: string }

// Tavern pages share a lighter overlay than the rest of the app: their backdrops
// are simple, warm, cozy "places" (the cards carry the detail), so we let the
// warmth show through instead of crushing it to near-black.
const TAV = 'rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.64) 100%'

const ROUTE_BG: [string, BgConfig][] = [
  // Gauntlet routes render their own painted abyss inside GauntletGame's
  // AbyssBackdrop (which sits over this layer), so they're intentionally NOT here.
  ['/raids',                   { src: '/raid1background.jpg',        overlay: 'rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.50) 50%, rgba(0,0,0,0.75) 100%' }],
  ['/leaderboard',             { src: '/leaderboard-bg.jpg',         overlay: 'rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.66) 50%, rgba(0,0,0,0.9) 100%' }],
  ['/badges',                  { src: '/badges-bg.jpg',             overlay: 'rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.66) 50%, rgba(0,0,0,0.9) 100%' }],
  ['/packs',                   { src: '/crewopeningbackground.jpg', overlay: 'rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.88) 100%' }],
  // Tavern — one warm, hand-painted "place" per section. Ordered specific →
  // general: startsWith takes the FIRST match, so every sub-route must sit
  // above the catch-all '/tavern' at the bottom. The casino games share the
  // den; chart-room / trivia sub-pages inherit their lobby via startsWith.
  ['/tavern/casino',           { src: '/page-casino.jpg',     overlay: TAV }],
  ['/tavern/blackjack',        { src: '/page-casino.jpg',     overlay: TAV }],
  ['/tavern/roulette',         { src: '/page-casino.jpg',     overlay: TAV }],
  ['/tavern/slots',            { src: '/page-casino.jpg',     overlay: TAV }],
  ['/tavern/crown-and-anchor', { src: '/page-casino.jpg',     overlay: TAV }],
  ['/tavern/chart-room',       { src: '/page-chartroom.jpg',  overlay: TAV }],
  ['/tavern/trivia',           { src: '/page-parlor.jpg',     overlay: TAV }],
  ['/tavern/contests',         { src: '/page-contests.jpg',   overlay: TAV }],
  ['/tavern/daily-bonus',      { src: '/page-dailybonus.jpg', overlay: TAV }],
  ['/tavern/tide-run',         { src: '/page-tiderun.jpg',    overlay: TAV }],
  ['/tavern/market',           { src: '/page-market.jpg',     overlay: TAV }],
  ['/tavern/bounties',         { src: '/page-bounties.jpg',   overlay: TAV }],
  ['/tavern',                  { src: '/page-tavern.jpg',     overlay: TAV }],
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
