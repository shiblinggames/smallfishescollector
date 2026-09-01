'use client'

import { usePathname } from 'next/navigation'

type BgConfig = { src: string; overlay: string } | { surface: true }

// Tavern pages share a lighter overlay than the rest of the app: their backdrops
// are simple, warm, cozy "places" (the cards carry the detail), so we let the
// warmth show through instead of crushing it to near-black.
const TAV = 'rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.64) 100%'

const ROUTE_BG: [string, BgConfig][] = [
  // Gauntlet routes render their own painted abyss inside GauntletGame's
  // AbyssBackdrop (which sits over this layer), so they're intentionally NOT here.
  ['/raids',                   { src: '/raid1background.jpg',        overlay: 'rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.50) 50%, rgba(0,0,0,0.75) 100%' }],
  ['/leaderboard',             { src: '/leaderboard-bg.jpg',         overlay: 'rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.66) 50%, rgba(0,0,0,0.9) 100%' }],
  // Warmer, simpler wash now (not the dark medal-wall), so it needs a heavier
  // overlay than most pages to keep the badge list + text readable over it.
  ['/badges',                  { src: '/badges-bg.jpg',             overlay: 'rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.94) 100%' }],
  ['/crew',                    { src: '/crew-bg.jpg',               overlay: 'rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.84) 50%, rgba(0,0,0,0.95) 100%' }],
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
  ['/tavern/tide-run',         { src: '/page-tiderun.jpg',    overlay: TAV }],
  // THE MARKET IS NOT A PLACE, it is a board. Every other tavern route is a
  // painted room you walk into; this one is a trading screen, and a blurred
  // stall behind it fought the price rows and washed out the header at the top
  // where TAV's overlay is lightest. A flat instrument surface instead.
  ['/tavern/market',           { surface: true }],
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

  const cfg = match[1]

  // No photograph: a dark instrument surface with a faint ruled grid, the way
  // a trading screen is a grid before it is anything else. Cheap (two CSS
  // gradients, no image request) and it never competes with a number.
  if ('surface' in cfg) {
    return (
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: '#080a0f' }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.5,
          backgroundImage:
            'linear-gradient(rgba(120,160,200,0.055) 1px, transparent 1px),'
            + 'linear-gradient(90deg, rgba(120,160,200,0.055) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }} />
        {/* A cool glow up top so the header has something to sit against, and
            the grid falls away into black by the bottom of a long list. */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(120% 55% at 50% -8%, rgba(56,189,248,0.10) 0%, transparent 62%),'
            + ' linear-gradient(to bottom, rgba(8,10,15,0.2) 0%, rgba(8,10,15,0.75) 55%, #05070b 100%)',
        }} />
      </div>
    )
  }

  const { src, overlay } = cfg

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
