'use client'

import { useEffect, useRef, useState } from 'react'

// Counts the displayed number from its current value to a new one (easeOut) so
// currency changes tick rather than snap. Self-contained so only this node
// re-renders per frame, not its parent. Re-tweens smoothly if the value
// changes mid-flight.
export default function TickingNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  shownRef.current = shown
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = shownRef.current
    const to = value
    if (from === to) return
    const start = performance.now()
    const dur = 500
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setShown(Math.round(from + (to - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value])

  return <>{shown.toLocaleString()}</>
}
