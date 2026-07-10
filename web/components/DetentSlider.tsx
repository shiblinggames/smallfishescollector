'use client'

// Horizontal detent slider — a thumb-flick value picker for mobile. Drag (or
// tap) anywhere on the track and the thumb snaps between evenly-spaced detents
// (one per allowed value), ticking a haptic on every detent crossed — one
// motion to any preset instead of hunting a row of buttons.
//
// Detents are EVENLY spaced regardless of the values' magnitudes (10 → 500
// reads as six equal stops, not a log scale) — the point is discrete presets,
// not continuous input. Values the player can't afford are visually dimmed and
// skipped by the snap. Parent owns the value.

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { hapticTap } from '@/lib/haptics'

export default function DetentSlider({ values, value, onChange, accent = '#f0c040', disabledFrom, format }: {
  values: readonly number[]
  value: number
  onChange: (v: number) => void
  accent?: string
  /** Values >= this are unaffordable: dimmed + unselectable. */
  disabledFrom?: number
  format?: (v: number) => string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const n = values.length
  const idx = Math.max(0, values.indexOf(value))
  const fmt = format ?? ((v: number) => v.toLocaleString())
  const maxIdx = (() => {
    if (disabledFrom === undefined) return n - 1
    let m = -1
    for (let i = 0; i < n; i++) if (values[i] <= disabledFrom) m = i
    return m
  })()

  const pick = (clientX: number) => {
    const track = trackRef.current
    if (!track || maxIdx < 0) return
    const r = track.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const target = Math.min(maxIdx, Math.round(frac * (n - 1)))
    if (values[target] !== value) { hapticTap(); onChange(values[target]) }
  }

  return (
    <div style={{ padding: '0.15rem 0.35rem 0' }}>
      <div
        ref={trackRef}
        // Pointer-driven (not framer drag): tap anywhere to jump, or scrub —
        // both resolve to "nearest detent left of the finger", capped at the
        // last affordable value.
        onPointerDown={(e) => { draggingRef.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); pick(e.clientX) }}
        onPointerMove={(e) => { if (draggingRef.current) pick(e.clientX) }}
        onPointerUp={() => { draggingRef.current = false }}
        onPointerCancel={() => { draggingRef.current = false }}
        style={{ position: 'relative', height: 40, touchAction: 'none', cursor: 'pointer' }}
      >
        {/* Rail */}
        <div style={{ position: 'absolute', left: 10, right: 10, top: 18, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
        {/* Filled rail up to the thumb */}
        <div style={{ position: 'absolute', left: 10, top: 18, height: 4, borderRadius: 2, background: `${accent}88`, width: `calc((100% - 20px) * ${n > 1 ? idx / (n - 1) : 0})`, transition: 'width 0.16s ease-out' }} />
        {/* Detent dots */}
        {values.map((v, i) => (
          <div key={v} style={{
            position: 'absolute', top: 16.5,
            left: `calc(10px + (100% - 20px) * ${n > 1 ? i / (n - 1) : 0})`,
            width: 7, height: 7, marginLeft: -3.5, borderRadius: '50%',
            background: i <= idx ? accent : i > maxIdx ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.3)',
          }} />
        ))}
        {/* Thumb */}
        <motion.div
          animate={{ left: `calc(10px + (100% - 20px) * ${n > 1 ? idx / (n - 1) : 0})` }}
          transition={{ type: 'spring', stiffness: 700, damping: 40 }}
          style={{
            position: 'absolute', top: 8, width: 24, height: 24, marginLeft: -12, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, #fff3cf, ${accent} 60%)`,
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: `0 2px 8px rgba(0,0,0,0.5), 0 0 10px ${accent}66`,
            pointerEvents: 'none',
          }}
        />
      </div>
      {/* Value labels under first/last detents so the range reads at a glance */}
      <div className="font-karla font-600" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.56rem', color: 'rgba(255,255,255,0.4)', padding: '0 4px' }}>
        <span>{fmt(values[0])}</span>
        <span>{fmt(values[n - 1])}</span>
      </div>
    </div>
  )
}
