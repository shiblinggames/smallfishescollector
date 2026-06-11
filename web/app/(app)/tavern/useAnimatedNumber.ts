'use client'

// Shared tavern counter animation — extracted from Blackjack.tsx so
// Fish Roulette's chips / session tally can tick the same way.

import { useEffect, useRef, useState } from 'react'

/** Animates a number from its PREVIOUS rendered value to its new
 *  value over `duration` ms. Unlike a count-up-from-zero (which reads
 *  as the old digits ghosting back in), this is meant for live
 *  counters — chips, session tally — where the start point is
 *  whatever was on screen before the change. Cubic ease-out so big
 *  swings feel weighty. Returns the raw number so the consumer can
 *  format / colorize / sign it. */
export function useAnimatedNumber(value: number, duration = 900): number {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  useEffect(() => {
    const start = prevRef.current
    if (start === value) { setDisplay(value); return }
    const delta = value - start
    let raf = 0
    let startTime: number | null = null
    const tick = (t: number) => {
      if (startTime === null) startTime = t
      const p = Math.min(1, (t - startTime) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(start + delta * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else { prevRef.current = value; setDisplay(value) }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); prevRef.current = value }
  }, [value, duration])
  return display
}
