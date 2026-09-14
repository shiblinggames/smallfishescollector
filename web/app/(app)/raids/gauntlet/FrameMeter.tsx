'use client'

// ── THE FRAME METER ─────────────────────────────────────────────────────────
//
// An instrument, not a feature. "It feels laggy" is a real report and a useless
// bug: it cannot tell you whether the main thread is busy, the GPU is saturated,
// or a compositor animation has been quietly demoted. Rounds of reading code
// found real defects and still did not answer the question, so this answers it.
//
// ── THE ONE QUESTION IT EXISTS TO SETTLE ────────────────────────────────────
//
// When a frame takes too long, WHO took the time?
//
//   DELAY   how late our own callback ran inside the frame. The browser calls
//           rAF callbacks at the start of a frame and hands each one the
//           frame's timestamp; the gap between that timestamp and the clock
//           when we actually get control is time the MAIN THREAD spent on
//           something else first — a React render, a layout, a parse.
//
//           This is the signal that works everywhere. `longtask` does not
//           exist in Safari, which is most of this game's players, so a meter
//           that relied on it would go blind on the device that matters.
//
//   WORST   the longest gap between frames.
//
// Put together they separate the two causes, and the separation is the whole
// point of the tool:
//
//   WORST high, DELAY high  → the MAIN THREAD. Renders, layout, script.
//   WORST high, DELAY low   → everything else: fill rate, compositing, paint.
//                             No amount of React work will touch it.
//
// ── AND IT HOLDS THE PEAK ───────────────────────────────────────────────────
//
// A one-second window is unreadable during a fight: the bad frame is over
// before you have looked down. So every number is kept twice — the live second,
// and the worst seen since RESET. Lock a shot, land a crit, then read it off at
// your leisure.
//
// It costs one rAF doing arithmetic and one style write a second. It is not in
// the tree at all unless an admin turned it on.

import { useEffect, useRef } from 'react'
import { renderTally } from '../renderTally'

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
  const resetRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    // Fixed-size ring: a testing instrument must not be the thing allocating.
    const gaps = new Float32Array(240)
    let n = 0
    let windowStart = last
    let taskNow = 0

    // Held since RESET.
    let peakFrame = 0
    let peakDelay = 0
    let peakTask = 0
    let peakLong = 0
    let peakRender = 0
    let lastTally = renderTally.n

    // Long tasks where they exist. Kept because when it IS reported it names
    // the duration outright, which DELAY can only imply.
    let obs: PerformanceObserver | null = null
    let taskSupported = false
    try {
      obs = new PerformanceObserver(list => {
        for (const e of list.getEntries()) taskNow = Math.max(taskNow, e.duration)
      })
      obs.observe({ entryTypes: ['longtask'] })
      taskSupported = true
    } catch { obs = null }

    let delayNow = 0

    const tick = (stamp: number) => {
      raf = requestAnimationFrame(tick)
      // HOW LATE WE ARE INSIDE THIS FRAME. See the note at the top: this is the
      // main-thread signal, and unlike `longtask` it works in Safari.
      delayNow = Math.max(delayNow, performance.now() - stamp)

      const gap = stamp - last
      last = stamp
      if (n < gaps.length) gaps[n++] = gap

      if (stamp - windowStart < 1000) return

      const slice = Array.from(gaps.subarray(0, n)).sort((a, b) => a - b)
      const median = slice[Math.floor(slice.length / 2)] ?? 0
      const worst = slice[slice.length - 1] ?? 0
      const long = slice.filter(g => g > 24).length
      const fps = Math.round((n * 1000) / (stamp - windowStart))

      peakFrame = Math.max(peakFrame, worst)
      peakDelay = Math.max(peakDelay, delayNow)
      peakTask = Math.max(peakTask, taskNow)
      peakLong = Math.max(peakLong, long)
      // RENDERS OF THE FIGHT in this second. If the main thread is busy and
      // this number is large at the same moment, the answer is not a mystery.
      const renders = renderTally.n - lastTally
      lastTally = renderTally.n
      peakRender = Math.max(peakRender, renders)

      const el = lineRef.current
      if (el) {
        const task = taskSupported ? `${peakTask.toFixed(0)}ms` : 'n/a'
        // The verdict, spelled out, so the number does not have to be
        // interpreted in the middle of a fight.
        const blame = peakFrame < 24 ? '—'
          : peakDelay > peakFrame * 0.5 ? 'MAIN'
          : 'GPU/PAINT'
        el.textContent =
          `      now    peak\n` +
          `FPS   ${String(fps).padStart(4)}\n` +
          `FRAME ${median.toFixed(1).padStart(5)}  ${peakFrame.toFixed(0).padStart(5)}ms\n` +
          `DELAY ${delayNow.toFixed(1).padStart(5)}  ${peakDelay.toFixed(0).padStart(5)}ms\n` +
          `LONG  ${String(long).padStart(5)}  ${String(peakLong).padStart(5)}\n` +
          `RNDR  ${String(renders).padStart(5)}  ${String(peakRender).padStart(5)}\n` +
          `TASK  ${task.padStart(12)}\n` +
          `BLAME ${blame.padStart(12)}`
        el.style.color = peakFrame > 50 ? '#ff8a8a' : peakFrame > 24 ? '#f0c040' : '#9ff0c0'
      }
      n = 0
      taskNow = 0
      delayNow = 0
      windowStart = stamp
    }
    raf = requestAnimationFrame(tick)

    resetRef.current = () => { peakFrame = 0; peakDelay = 0; peakTask = 0; peakLong = 0; peakRender = 0 }
    return () => { cancelAnimationFrame(raf); obs?.disconnect(); resetRef.current = null }
  }, [])

  const btn: React.CSSProperties = {
    flex: 1, padding: '3px 0', borderRadius: 5, cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(140,170,200,0.3)',
    color: '#b9c6c9', font: 'inherit', letterSpacing: '0.1em',
  }

  return (
    <div
      style={{
        position: 'fixed', left: 8, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
        zIndex: 2000, pointerEvents: 'auto',
        padding: '6px 9px 7px', borderRadius: 9,
        background: 'rgba(3,7,13,0.88)', border: '1px solid rgba(140,170,200,0.35)',
        font: '10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        whiteSpace: 'pre', letterSpacing: '0.02em',
      }}>
      <pre ref={lineRef} style={{ margin: 0, color: '#9ff0c0' }}>measuring…</pre>
      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
        <button type="button" onClick={() => resetRef.current?.()} style={btn}>RESET</button>
        <button type="button" onClick={() => { setFrameMeterOn(false); onClose() }} style={btn}>HIDE</button>
      </div>
    </div>
  )
}
