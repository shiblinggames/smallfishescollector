'use client'

// ── CASTING OFF ─────────────────────────────────────────────────────────────
//
// The one loading screen in the game, shown ONCE per session, over the world
// routes. While it is up it fetches the things the next few screens are going
// to want: the renderer, the chart's paintings, the effect sheet, and the code
// behind the doors the chart can push you through.
//
// ── WHY A LOADING SCREEN AT ALL, IN 2026 ────────────────────────────────────
//
// Because the alternative was paying for all of it in pieces, later, in the
// middle of things. The chart's paintings arrived as you sailed into them, the
// gauntlet's chunk arrived after you had already chosen to descend, and Pixi
// arrived on the frame the first canvas mounted. Every one of those is a hitch
// somewhere it matters. Moved to the front they are one wait, at the one moment
// a captain expects to be waiting, with something to look at.
//
// ── AND IT CANNOT HANG ──────────────────────────────────────────────────────
//
// Two guarantees, and neither is optional:
//
//   THE CAP. Past `MAX_MS` the screen goes whatever the bar says, and the rest
//   of the warm-up carries on behind it. A slow connection must never turn a
//   nicety into a wall; the worst this may ever cost is the delay it replaced.
//
//   NOTHING WAITS ON IT. The page underneath is mounting the whole time. This
//   covers it; it does not gate it. Lift the cover early and you are looking at
//   a live screen, not a blank one.
//
// ── ONCE PER SESSION, NOT PER NAVIGATION ────────────────────────────────────
//
// The point is to pay once. A bar between every screen would be the delay it
// replaced, wearing a costume.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { runWarm, warmImages, type WarmStep } from '@/lib/warm'

/** Longest the screen may hold, whatever is still in flight. */
const MAX_MS = 7000
/** Where the world is. Everywhere else in the shell is a page, and a page does
 *  not need a renderer, a chart or a fight warmed for it. */
const WORLD = ['/sea', '/raids']
const KEY = 'stb:cast-off'

/**
 * THE DOORS THE CHART CAN PUSH YOU THROUGH.
 *
 * Prefetching a DYNAMIC route gets its JavaScript and its shell, not its data
 * (see lib/warm). That is still the half that is slow on a phone and the half
 * that stays cached, so it is worth asking for; the server round trip on the
 * press is the floor and this does not pretend otherwise.
 */
const DOORS = ['/sea', '/raids/gauntlet', '/raids/dons-gauntlet', '/tavern/market', '/badges', '/leaderboard', '/profile']

export default function CastingOff() {
  const pathname = usePathname()
  const router = useRouter()
  // UNDECIDED ON THE FIRST RENDER. sessionStorage does not exist on the server
  // and a cover that renders there and not here is a hydration mismatch, so the
  // question is asked in the effect below and nothing is drawn until it is
  // answered. One frame; the screen under it has not painted either.
  const [show, setShow] = useState<boolean | null>(null)
  const [pct, setPct] = useState(0)
  const [label, setLabel] = useState('Casting off')
  const [going, setGoing] = useState(false)
  const started = useRef(false)

  const world = WORLD.some(p => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (started.current || !world) return
    started.current = true
    let booted = false
    try { booted = sessionStorage.getItem(KEY) === '1' } catch { /* private window */ }
    if (booted) { setShow(false); return }
    setShow(true)
    try { sessionStorage.setItem(KEY, '1') } catch { /* nothing to remember it with */ }

    let live = true
    /** The cover comes off on the cap OR on the last step, whichever is first,
     *  and only ever once. */
    const finish = () => {
      if (!live) return
      live = false
      setPct(1)
      setGoing(true)
      window.setTimeout(() => setShow(false), 420)
    }
    const cap = window.setTimeout(finish, MAX_MS)

    const steps: WarmStep[] = [
      {
        // The renderer, which is the biggest single chunk in the app and the
        // one every world screen waits on.
        label: 'Rigging her out',
        weight: 3,
        run: () => import('pixi.js'),
      },
      {
        // THE CHART ITSELF. Its module first, which is a chunk, then every
        // painting on it: the ports, the buildings on them, the landmarks, and
        // the rocks. Twenty-odd paintings between the lot of them, because the
        // chart is the same wreck and the same rock at forty sizes.
        //
        // THE ROCKS COME FROM `SUBMERGE_ART`, not from the reef and the
        // harbour wall, which are generated in SeaMap and would drag the
        // biggest component in the app into this chunk to be counted. That
        // table is keyed on every mark the chart knows how to draw a waterline
        // for, which is the same set, and it is one small module.
        label: 'Unrolling the chart',
        weight: 6,
        run: async onP => {
          const [chart, sub] = await Promise.all([
            import('@/app/(app)/sea/chart'),
            import('@/app/(app)/sea/submerge'),
          ])
          const urls: string[] = []
          for (const p of chart.PLACES) {
            urls.push(p.art)
            for (const b of p.buildings ?? []) urls.push(b.art)
          }
          for (const m of chart.LANDMARKS) urls.push(m.art)
          urls.push(...Object.values(sub.SUBMERGE_ART))
          await warmImages(urls, onP)
        },
      },
      {
        // The painted effect sheet, which is one file and every burn, freeze,
        // ward, splash, muzzle flash and fireball in the game. See fxSheet.
        label: 'Loading the guns',
        weight: 1,
        run: async onP => {
          const { FX_SHEET } = await import('@/app/(app)/sea/fxSheet')
          await warmImages([FX_SHEET], onP)
        },
      },
      {
        label: 'Reading the log',
        weight: 2,
        run: async onP => {
          for (let i = 0; i < DOORS.length; i++) {
            // Fire and forget, one at a time. `prefetch` returns void, so this
            // is a cadence rather than a wait: six requests on one frame would
            // land on top of the page's own.
            try { router.prefetch(DOORS[i]) } catch { /* a door that is not there */ }
            onP((i + 1) / DOORS.length)
            await new Promise(r => window.setTimeout(r, 60))
          }
        },
      },
    ]

    void runWarm(steps, (f, l) => {
      if (!live) return
      // NEVER BACKWARDS. The cap can land mid-step and a bar that then jumps
      // back to 80% says the thing it was measuring was a lie.
      setPct(p => Math.max(p, f))
      setLabel(l)
    }).then(finish)

    return () => { live = false; window.clearTimeout(cap) }
  }, [world, router])

  if (!show) return null

  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      // The same deep water /sea/loading.tsx paints, so a route fallback and
      // this are one colour rather than two shades of nearly black.
      background: '#0b1a24',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 18, padding: '0 2rem',
      opacity: going ? 0 : 1,
      transition: 'opacity 400ms ease',
      pointerEvents: going ? 'none' : 'auto',
    }}>
      <p className="font-cinzel font-700" style={{
        margin: 0, fontSize: '0.95rem', letterSpacing: '0.34em', textTransform: 'uppercase',
        color: 'rgba(214,232,240,0.72)',
      }}>
        Casting off
      </p>

      {/* THE BAR. A hairline trough with a lit run in it, in the sea's own
          teal — the colour every other "this is working" mark in the game
          uses. Scaled rather than widened: a width transition is a layout on
          every frame of it, and this runs while the heaviest screen in the
          app is mounting underneath. */}
      <div style={{
        width: 'min(320px, 72vw)', height: 3, borderRadius: 999,
        background: 'rgba(180,214,232,0.14)', overflow: 'hidden',
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 999,
          background: 'linear-gradient(90deg, rgba(143,214,216,0.55), #8fd6d8)',
          transform: `scaleX(${Math.max(0.02, pct)})`,
          transformOrigin: 'left center',
          transition: 'transform 260ms ease-out',
        }} />
      </div>

      <p className="font-karla" style={{
        margin: 0, minHeight: '1em', fontSize: '0.72rem',
        color: 'rgba(190,212,228,0.4)',
      }}>
        {label}
      </p>
    </div>
  )
}
