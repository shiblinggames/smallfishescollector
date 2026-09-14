'use client'

// ── THE FRAME METER ─────────────────────────────────────────────────────────
//
// An instrument, not a feature. "It feels laggy" is a real report and a useless
// bug: it cannot tell you whether the main thread is busy, the GPU is saturated,
// or a compositor animation has been quietly demoted. Five rounds of reading
// code found five real defects and still did not answer the question, so this
// answers it instead.
//
// ── WHAT IT MEASURES, AND WHAT EACH NUMBER MEANS ────────────────────────────
//
//   FPS      frames actually presented over the last second.
//   FRAME    the median gap between frames, in ms. 16.7 is a clean 60.
//   WORST    the longest gap in the last second. This is the number that
//            "feels laggy" usually IS: a 60fps average with one 90ms stall a
//            second reads as broken, and an average cannot see it.
//   LONG     how many frames in the last second took over 24ms — a dropped
//            frame at 60Hz. The shape of the problem: many small overruns is
//            steady overload, a handful of big ones is something firing.
//   TASK     the worst long-task the browser reported, from PerformanceObserver.
//            THIS IS THE DIAGNOSIS. A long task is MAIN-THREAD work: a render,
//            a layout, a parse. If WORST is high and TASK is not, the main
//            thread was idle and the time went somewhere else — which on this
//            screen means the GPU, and points at fill rate rather than at any
//            amount of React.
//
// It costs one rAF that does arithmetic and one style write a second. It is not
// in the tree at all unless an admin turned it on.

import { useEffect, useRef, useState } from 'react'

/** Survives a remount and a reload, so a session of testing is one toggle. */
const KEY = 'gauntletFrameMeter'

export function frameMeterOn(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setFrameMeterOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode */ }
}

export default function FrameMeter({ onClose }: { onClose: () => void }) {
  const lineRef = useRef<HTMLPreElement | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    // Fixed-size ring: a testing instrument must not be the thing allocating.
    const gaps = new Float32Array(240)
    let n = 0
    let windowStart = last
    let worstTask = 0

    // Long tasks are the browser's own account of main-thread blocking, which
    // is the one thing a frame counter cannot infer for itself. Not every
    // engine reports them (Safari does not, at time of writing) — hence the
    // dash rather than a zero, so a missing number is never read as a good one.
    let obs: PerformanceObserver | null = null
    let taskSupported = false
    try {
      obs = new PerformanceObserver(list => {
        for (const e of list.getEntries()) worstTask = Math.max(worstTask, e.duration)
      })
      obs.observe({ entryTypes: ['longtask'] })
      taskSupported = true
    } catch { obs = null }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const gap = now - last
      last = now
      if (n < gaps.length) gaps[n++] = gap

      if (now - windowStart < 1000) return
      // ── ONE STYLE WRITE A SECOND ──────────────────────────────────────
      const slice = Array.from(gaps.subarray(0, n)).sort((a, b) => a - b)
      const median = slice[Math.floor(slice.length / 2)] ?? 0
      const worst = slice[slice.length - 1] ?? 0
      const long = slice.filter(g => g > 24).length
      const fps = Math.round((n * 1000) / (now - windowStart))
      const el = lineRef.current
      if (el) {
        el.textContent =
          `FPS   ${String(fps).padStart(4)}\n` +
          `FRAME ${median.toFixed(1).padStart(6)} ms\n` +
          `WORST ${worst.toFixed(1).padStart(6)} ms\n` +
          `LONG  ${String(long).padStart(4)}  (>24ms)\n` +
          `TASK  ${taskSupported ? `${worstTask.toFixed(0).padStart(4)}  ms` : '   —  n/a'}`
        // Red when a frame was missed badly, amber when it was missed at all.
        el.style.color = worst > 50 ? '#ff8a8a' : worst > 24 ? '#f0c040' : '#9ff0c0'
      }
      n = 0
      worstTask = 0
      windowStart = now
    }
    raf = requestAnimationFrame(tick)
    force(1)
    return () => { cancelAnimationFrame(raf); obs?.disconnect() }
  }, [])

  return (
    <div
      style={{
        position: 'fixed', left: 8, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
        zIndex: 2000, pointerEvents: 'auto',
        padding: '6px 9px 7px', borderRadius: 9,
        background: 'rgba(3,7,13,0.86)', border: '1px solid rgba(140,170,200,0.35)',
        font: '10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre', letterSpacing: '0.02em',
      }}>
      <pre ref={lineRef} style={{ margin: 0, color: '#9ff0c0' }}>measuring…</pre>
      <button type="button"
        onClick={() => { setFrameMeterOn(false); onClose() }}
        style={{
          marginTop: 5, width: '100%', padding: '2px 0', borderRadius: 5, cursor: 'pointer',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(140,170,200,0.3)',
          color: '#b9c6c9', font: 'inherit', letterSpacing: '0.1em',
        }}>
        HIDE
      </button>
    </div>
  )
}
