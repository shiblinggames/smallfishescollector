'use client'

// ── CASTING OFF ─────────────────────────────────────────────────────────────
//
// The one loading screen in the game, shown ONCE per session, over the world
// routes. While it is up it fetches the things the next few screens are going
// to want: the renderer, the chart's paintings and ground, the regulars'
// faces, the effect sheet, and the code behind the doors the chart can push
// you through. On the sea it also waits for the chart itself to say it is
// ready, so the bar means what it says.
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
//
// ── AND NOT OVER THE NAME-ENTRY MODAL ───────────────────────────────────────
//
// A brand-new account lands on /sea, where the shell puts up the setup modal
// (name, colour, face) and then the welcome scene. This used to paint over the
// setup modal for up to seven seconds, latch the session, and then be ABSENT
// on the reload out of the welcome, which is the one load that actually builds
// the world. The shell passes `enabled` now: false until setup and the
// welcome are both done, so the first cover a captain sees is over the first
// real build of the chart.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { runWarm, warmImages, type WarmStep } from '@/lib/warm'

/** Longest the screen may hold, whatever is still in flight. */
const MAX_MS = 9000
/** Where the world is. Everywhere else in the shell is a page, and a page does
 *  not need a renderer, a chart or a fight warmed for it. */
const WORLD = ['/sea', '/raids']
const KEY = 'stb:cast-off'
/** How much of the bar the warm-up owns on the sea. The rest is the chart
 *  saying it is ready (see `sea:ready` in SeaMap), which is the wait a captain
 *  actually feels. Elsewhere the warm-up is the whole bar. */
const WARM_SHARE = 0.86

/**
 * THE DOORS THE CHART CAN PUSH YOU THROUGH.
 *
 * Prefetching a DYNAMIC route gets its JavaScript and its shell, not its data
 * (see lib/warm). That is still the half that is slow on a phone and the half
 * that stays cached, so it is worth asking for; the server round trip on the
 * press is the floor and this does not pretend otherwise.
 */
// THE LIST IS THE CHART'S, NOT THE NAV'S. It used to warm /badges, /leaderboard
// and /profile, which are tab-bar destinations the chart never pushes anybody
// through, and skipped the four places you reach by sailing to them: the
// Mainland, the Homestead, the Shipyard and the Trawl Docks. Those are the
// presses that feel slow on a phone, and the ones a prefetch can help.
const DOORS = [
  '/sea', '/tavern', '/home', '/shipyard', '/trawl-docks', '/tavern/market',
  '/raids/gauntlet', '/raids/dons-gauntlet',
]

declare global {
  interface Window { __seaReady?: boolean }
}

export default function CastingOff({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  // UNDECIDED ON THE FIRST RENDER. sessionStorage does not exist on the server
  // and a cover that renders there and not here is a hydration mismatch, so the
  // question is asked in the effect below and nothing is drawn until it is
  // answered. One frame; the screen under it has not painted either.
  const [show, setShow] = useState<boolean | null>(null)
  const [label, setLabel] = useState('Casting off')
  const [going, setGoing] = useState(false)
  const started = useRef(false)

  // ── THE NUMBER IS EASED, AND DRAWN WITHOUT REACT ─────────────────────────
  // The warm-up reports in jumps (a chunk lands, a step ends) and a bar that
  // jumps 0 to 25 says the thing it measures is a lie. The drawn value chases
  // the reported one on animation frames, written straight to the DOM, so
  // the heaviest screen in the app can mount underneath without this
  // re-rendering sixty times a second on top of it.
  const target = useRef(0)
  const drawn = useRef(0)
  const barRef = useRef<HTMLDivElement>(null)
  const numRef = useRef<HTMLSpanElement>(null)

  const world = WORLD.some(p => pathname === p || pathname.startsWith(p + '/'))
  const onSea = pathname === '/sea' || pathname.startsWith('/sea/')

  useEffect(() => {
    if (started.current || !world || !enabled) return
    started.current = true
    let booted = false
    try { booted = sessionStorage.getItem(KEY) === '1' } catch { /* private window */ }
    if (booted) { setShow(false); return }
    setShow(true)
    try { sessionStorage.setItem(KEY, '1') } catch { /* nothing to remember it with */ }

    let live = true
    let raf = 0
    /** Chase the target. Stops itself when it has arrived. */
    const draw = () => {
      raf = 0
      const d = target.current - drawn.current
      drawn.current = Math.abs(d) < 0.0015 ? target.current : drawn.current + d * 0.16
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(0.015, drawn.current)})`
      if (numRef.current) numRef.current.textContent = String(Math.round(drawn.current * 100))
      if (drawn.current !== target.current) raf = requestAnimationFrame(draw)
    }
    const aim = (f: number) => {
      // NEVER BACKWARDS. The cap can land mid-step and a bar that then jumps
      // back to 80% says the thing it was measuring was a lie.
      target.current = Math.max(target.current, Math.min(1, f))
      if (!raf) raf = requestAnimationFrame(draw)
    }
    /** The cover comes off on the cap OR when everything is in, whichever is
     *  first, and only ever once. */
    const finish = () => {
      if (!live) return
      live = false
      aim(1)
      setGoing(true)
      window.setTimeout(() => setShow(false), 460)
    }
    const cap = window.setTimeout(finish, MAX_MS)

    // ── ON THE SEA, THE CHART HAS THE LAST WORD ──────────────────────────
    // The warm-up is bytes. The wait a captain feels is the chart decoding
    // its sprites and standing up its renderer, which SeaMap announces with
    // `sea:ready`. Both have to be in before the cover lifts. The flag on
    // window covers the chart getting there before this listener existed.
    let warmDone = false
    let seaReady = !onSea || window.__seaReady === true
    const maybe = () => { if (warmDone && seaReady) finish() }
    const onReady = () => { seaReady = true; maybe() }
    window.addEventListener('sea:ready', onReady)

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
        // painting on it: the ports, the buildings on them, the landmarks, the
        // rocks, and the two ground textures every island is painted with.
        // Those two used to arrive after the world mounted and repaint every
        // island a second in, which was a visible change of material.
        label: 'Unrolling the chart',
        weight: 6,
        run: async onP => {
          const [chart, sub] = await Promise.all([
            import('@/app/(app)/sea/chart'),
            import('@/app/(app)/sea/submerge'),
          ])
          const urls: string[] = ['/sea/ground-turf.png', '/sea/ground-rock.png']
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
        // The nine regulars' faces and hats, which the Salt Road otherwise
        // fetched on its first open.
        label: 'Calling the regulars',
        weight: 1,
        run: async onP => {
          const { folkFaceUrls } = await import('@/app/(app)/sea/folkFaces')
          await warmImages(folkFaceUrls(), onP)
        },
      },
      {
        // The painted effect sheet, which is one file and every burn, freeze,
        // ward, splash, muzzle flash and fireball in the game. See fxSheet.
        // And the two faces that front every card of both tours.
        label: 'Loading the guns',
        weight: 1,
        run: async onP => {
          const [{ FX_SHEET }, { GUIDES }] = await Promise.all([
            import('@/app/(app)/sea/fxSheet'),
            import('@/lib/onboardingScenes'),
          ])
          await warmImages([FX_SHEET, GUIDES.doby.portrait, GUIDES.kat.portrait], onP)
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

    const share = onSea ? WARM_SHARE : 1
    void runWarm(steps, (f, l) => {
      if (!live) return
      aim(f * share)
      setLabel(l)
    }).then(() => {
      warmDone = true
      if (!seaReady) { setLabel('Raising the sails'); aim(WARM_SHARE + 0.06) }
      maybe()
    })

    return () => {
      live = false
      window.clearTimeout(cap)
      window.removeEventListener('sea:ready', onReady)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [world, onSea, router, enabled])

  if (!show) return null

  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      // The same deep water /sea/loading.tsx paints, so a route fallback and
      // this are one colour rather than two shades of nearly black.
      background: '#0b1a24',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: '0 2rem', overflow: 'hidden',
      opacity: going ? 0 : 1,
      transition: 'opacity 440ms ease',
      pointerEvents: going ? 'none' : 'auto',
    }}>
      {/* A slow breath of light under the number. Opacity only, so it costs
          the compositor and nothing else while the world builds underneath. */}
      <div className="castoff-glow" />

      <p className="font-cinzel font-700" style={{
        margin: 0, fontSize: '0.8rem', letterSpacing: '0.34em', textTransform: 'uppercase',
        color: 'rgba(214,232,240,0.62)', position: 'relative',
      }}>
        Casting off
      </p>

      {/* THE NUMBER. Written by the frame loop above, not by React. */}
      <p className="font-cinzel font-800" style={{
        margin: 0, lineHeight: 1, position: 'relative',
        fontSize: 'clamp(3.2rem, 9vw, 4.6rem)', color: '#eaf4f8',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
        textShadow: '0 0 40px rgba(143,214,216,0.35)',
      }}>
        <span ref={numRef}>0</span>
        <span style={{ fontSize: '0.42em', color: 'rgba(143,214,216,0.85)', marginLeft: 2, verticalAlign: 'baseline' }}>%</span>
      </p>

      {/* THE BAR. A trough with a lit run in it, in the sea's own teal, and a
          sheen that keeps moving so a bar parked at a chunk boundary still
          reads as working. Scaled rather than widened: a width transition is
          a layout on every frame of it. */}
      <div style={{
        width: 'min(340px, 74vw)', height: 4, borderRadius: 999, position: 'relative',
        background: 'rgba(180,214,232,0.14)', overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
      }}>
        <div ref={barRef} style={{
          width: '100%', height: '100%', borderRadius: 999, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(90deg, rgba(143,214,216,0.55), #8fd6d8)',
          transform: 'scaleX(0.015)',
          transformOrigin: 'left center',
          boxShadow: '0 0 12px rgba(143,214,216,0.55)',
        }}>
          <div className="castoff-sheen" />
        </div>
      </div>

      <p className="font-karla" style={{
        margin: 0, minHeight: '1em', fontSize: '0.74rem', letterSpacing: '0.06em',
        color: 'rgba(190,212,228,0.5)', position: 'relative',
      }}>
        {label}
      </p>
    </div>
  )
}
