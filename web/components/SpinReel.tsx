'use client'

// Reusable "slot reel" spinner — the same feel as Fish Slots: a strip of items
// scrolls past with motion blur at near-constant speed, then eases hard onto the
// target with a snappy ease-out and micro-settle (instead of a single slow glide
// or an in-place flip). Works horizontally (crate strips) or vertically.
//
// The caller renders each item via `renderItem` and is told when the reel
// settles via `onSettle`. The window shows exactly one tile.

import { useEffect, useRef, useState, type ReactNode } from 'react'

const COPIES = 5
const LAND_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export default function SpinReel<T>({
  items,
  landedIndex,
  renderItem,
  tileMain,
  tileCross,
  orientation = 'horizontal',
  spinMs = 1800,
  landMs = 720,
  blurPx = 3,
  onSettle,
}: {
  items: T[]
  landedIndex: number
  renderItem: (item: T, landed: boolean) => ReactNode
  /** Tile size (px) along the scroll axis. */
  tileMain: number
  /** Tile size (px) across the scroll axis. */
  tileCross: number
  orientation?: 'horizontal' | 'vertical'
  spinMs?: number
  landMs?: number
  blurPx?: number
  onSettle?: () => void
}) {
  const horizontal = orientation === 'horizontal'
  const stripRef = useRef<HTMLDivElement | null>(null)
  const posRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const landTimerRef = useRef<number | null>(null)
  const [settled, setSettled] = useState(false)
  const [landedTile, setLandedTile] = useState(-1)

  const LEN = items.length
  const axis = (px: number) => horizontal ? `translateX(${-px}px)` : `translateY(${-px}px)`

  useEffect(() => {
    const el = stripRef.current
    if (!el || LEN === 0) return
    setSettled(false)
    setLandedTile(-1)
    el.style.transition = 'none'
    el.style.filter = `blur(${blurPx}px)`
    posRef.current = 0
    el.style.transform = axis(0)

    // Phase 1 — constant-speed blurred scroll.
    const speed = tileMain * 13 // ~13 tiles/sec
    let last = performance.now()
    const startedAt = last
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      posRef.current = (posRef.current + speed * dt) % (LEN * tileMain)
      el.style.transform = axis(posRef.current)
      if (t - startedAt >= spinMs) { land(); return }
      rafRef.current = requestAnimationFrame(loop)
    }

    // Phase 2 — ease hard onto the target (≥1 full rotation ahead).
    const land = () => {
      const p0 = posRef.current
      // first whole tile ahead, then one rotation, then walk to landedIndex
      let m = Math.ceil(p0 / tileMain) + LEN
      while (((m % LEN) + LEN) % LEN !== landedIndex) m++
      const finalPos = m * tileMain
      el.style.transition = 'none'
      el.style.transform = axis(p0)
      requestAnimationFrame(() => {
        if (!stripRef.current) return
        el.style.transition = `transform ${landMs}ms ${LAND_EASE}, filter ${landMs}ms ease-out`
        el.style.filter = 'blur(0px)'
        el.style.transform = axis(finalPos)
      })
      landTimerRef.current = window.setTimeout(() => {
        setLandedTile(m)
        setSettled(true)
        onSettle?.()
      }, landMs)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (landTimerRef.current) clearTimeout(landTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const strip = Array.from({ length: COPIES * LEN }, (_, k) => k)

  return (
    <div style={{ width: horizontal ? tileMain : tileCross, height: horizontal ? tileCross : tileMain, overflow: 'hidden', position: 'relative' }}>
      <div
        ref={stripRef}
        style={{
          display: 'flex',
          flexDirection: horizontal ? 'row' : 'column',
          width: horizontal ? COPIES * LEN * tileMain : tileCross,
          height: horizontal ? tileCross : COPIES * LEN * tileMain,
          willChange: 'transform',
        }}
      >
        {strip.map((k) => (
          <div key={k} style={{ width: horizontal ? tileMain : tileCross, height: horizontal ? tileCross : tileMain, flexShrink: 0 }}>
            {renderItem(items[k % LEN], settled && k === landedTile)}
          </div>
        ))}
      </div>
    </div>
  )
}
