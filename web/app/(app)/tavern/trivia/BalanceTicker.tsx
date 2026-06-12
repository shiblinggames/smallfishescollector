'use client'

// Small wallet readout for the Parlor game headers. When the balance
// rises it counts up to the new total with a brief glow, so a payout
// reads as coin actually landing in the purse. Localized and subtle
// per the juice rules: just this span moves, nothing screen-wide.

import { useEffect, useRef, useState } from 'react'

export default function BalanceTicker({ value, glyph, color }: {
  value: number
  glyph: string
  /** Glyph + count-up color (gold for ⟡, purple for ◆). */
  color: string
}) {
  const [shown, setShown] = useState(value)
  const [glowing, setGlowing] = useState(false)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    fromRef.current = value
    // Downward jumps (midnight resync, etc.) snap without ceremony.
    if (value < from) { setShown(value); return }
    setGlowing(true)
    const start = performance.now()
    const dur = 900
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const glow = setTimeout(() => setGlowing(false), dur + 300)
    return () => { cancelAnimationFrame(raf); clearTimeout(glow) }
  }, [value])

  return (
    <span
      className="font-karla font-700"
      style={{
        fontSize: '0.62rem',
        color: glowing ? color : '#7a7672',
        transform: glowing ? 'scale(1.12)' : 'scale(1)',
        transformOrigin: 'right center',
        transition: 'color 0.3s, transform 0.3s',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {shown.toLocaleString()} <span style={{ color: glowing ? color : `${color}99` }}>{glyph}</span>
    </span>
  )
}
