'use client'

// ── THE PRESENCE READOUT ────────────────────────────────────────────────────
//
// Numbers on the glass, because the console was not reachable where it
// mattered. The device doing the sailing is a phone in a standalone PWA with no
// address bar and no devtools, and the account watching from the desktop is not
// an admin, so neither the query param nor the Settings switch reached both
// ends of the one test that needed running.
//
// Four rounds of fixes went out on guesses about what the socket was doing.
// This is what should have been built first: it says, at a glance and on both
// devices at once, whether beats are LEAVING, whether they are ARRIVING, and
// what the renderer is doing with them once they have.
//
// Mounted only when the debug flag is on. Reads the counters in seaPresence and
// the live friend state on its own timer rather than through React, because the
// values it is watching change sixty times a second and re-rendering the chart
// to show them would change the thing being measured.

import { useEffect, useRef } from 'react'
import { presenceStats, BEAT_MS } from '@/lib/seaPresence'

/**
 * WHICH BUILD IS ACTUALLY RUNNING.
 *
 * Vercel exposes the commit on every deploy and Next inlines it at build time,
 * so this is the SHA of the code in the browser rather than the SHA of the code
 * in the repository. Those have not always been the same thing during this,
 * and telling them apart by squinting at behaviour has cost more than one round
 * of fixes aimed at a version that was never being tested.
 *
 * Shown next to the two numbers that identify the ALGORITHM as well, because a
 * SHA only helps if you know what to expect from it: the beat interval, and how
 * far in the past another captain is drawn. Zero lag means the build is
 * extrapolating; a quarter of a second means it is interpolating.
 */
const BUILD = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)

export type DebugFriend = {
  name: string
  /** Where the last beat put them, and where they are actually drawn. */
  target: { x: number; y: number }
  shown: { x: number; y: number }
  /** Wall clock of the last beat, and the gap between the last two. */
  live: number
  span: number
  /** Extrapolated speed in world px per second, as the loop computed it. */
  speed: number
  /** THE DRAWN MOTION, frame to frame, over the last second: the smallest and
   *  largest step the sprite took and how many frames that covers.
   *
   *  This is the row that settles where jitter lives. Even steps and a frame
   *  count near 60 mean the maths is smooth and the loop is running — anything
   *  still juddering is below this. Wildly uneven steps mean the position
   *  itself is jumping. A low frame count means the loop is not running at all,
   *  and nothing above it matters. */
  stepMin: number
  stepMax: number
  frames: number
}

export default function SeaDebugPanel({ read, lag }: {
  /** Called on the panel's own timer. Returns the live friend rows plus your
   *  own position, straight off the refs the frame loop uses. */
  read: () => {
    me: { x: number; y: number }
    friends: DebugFriend[]
    /** The composed zoom and its factors. See the fit in SeaMap. */
    zoom?: { z: number; w: number; fit: number; wheel: number; fish: number; arrive: number }
  }
  /** How far back another captain is drawn, so the readout says which
   *  algorithm is live rather than leaving it to be inferred. */
  lag: number
}) {
  const box = useRef<HTMLPreElement | null>(null)

  useEffect(() => {
    let alive = true
    let last = { out: 0, in: 0, at: Date.now() }
    const tick = () => {
      if (!alive) return
      const el = box.current
      if (el) {
        const now = Date.now()
        const dt = Math.max(0.001, (now - last.at) / 1000)
        const outRate = ((presenceStats.out - last.out) / dt).toFixed(1)
        const inRate = ((presenceStats.in - last.in) / dt).toFixed(1)
        last = { out: presenceStats.out, in: presenceStats.in, at: now }

        const { me, friends, zoom } = read()
        const lines: string[] = []
        lines.push(`build ${BUILD}   beat ${BEAT_MS}ms   draw lag ${lag}ms`)
        if (zoom) {
          lines.push(
            `zoom ${zoom.z.toFixed(3)} = fit ${zoom.fit.toFixed(2)} (w ${Math.round(zoom.w)})`
            + ` x wheel ${zoom.wheel.toFixed(2)} x fish ${zoom.fish.toFixed(2)} x arrive ${zoom.arrive.toFixed(2)}`,
          )
        }
        lines.push(`SEND  ${presenceStats.own}${presenceStats.blocked ? `  BLOCKED: ${presenceStats.blocked}` : ''}`)
        lines.push(`out ${outRate}/s (${presenceStats.out})   in ${inRate}/s (${presenceStats.in})`)
        lines.push(`me ${Math.round(me.x)},${Math.round(me.y)}`)
        const ls = Object.entries(presenceStats.listens)
        if (!ls.length) lines.push('LISTEN  (nobody)')
        for (const [id, st] of ls) {
          const age = presenceStats.lastIn[id] ? `${((Date.now() - presenceStats.lastIn[id]) / 1000).toFixed(1)}s ago` : 'never'
          lines.push(`LISTEN ${id.slice(0, 8)} ${st}  last ${age}`)
        }
        for (const f of friends) {
          const age = f.live ? ((Date.now() - f.live) / 1000).toFixed(1) + 's' : '-'
          const off = Math.round(Math.hypot(f.target.x - f.shown.x, f.target.y - f.shown.y))
          const away = Math.round(Math.hypot(f.target.x - me.x, f.target.y - me.y))
          lines.push(
            `${f.name}: beat ${age}  span ${Math.round(f.span)}ms  ${Math.round(f.speed)}px/s`
            + `  drawn ${off}px off  ${away}px from me`,
          )
          // The motion itself. Steps should sit near speed/fps and be even.
          lines.push(
            `  step ${f.stepMin.toFixed(1)}..${f.stepMax.toFixed(1)}px over ${f.frames}fr`
            + `  (even = smooth maths)`,
          )
        }
        el.textContent = lines.join('\n')
      }
      window.setTimeout(tick, 400)
    }
    tick()
    return () => { alive = false }
  }, [read, lag])

  return (
    <pre ref={box} aria-hidden style={{
      position: 'fixed', left: 6, bottom: 6, zIndex: 100000,
      margin: 0, padding: '6px 8px', maxWidth: 'calc(100vw - 12px)',
      font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#9fe8c4', background: 'rgba(4,10,14,0.86)',
      border: '1px solid rgba(159,232,196,0.35)', borderRadius: 6,
      whiteSpace: 'pre-wrap', pointerEvents: 'none',
    }} />
  )
}
