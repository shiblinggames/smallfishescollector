'use client'

// A SPRITE STANDING IN WATER, drawn in two copies.
//
// The UNDER copy is the whole image at `keep` opacity, fading with depth — what
// you can still make out through the surface. The DRY copy is clipped to
// everything above the waterline, which is a POLYLINE (see submerge.ts), so a
// hull can dip at the bow and a jetty can sit low at its near corner.
//
// Its own component because two screens draw it: the chart, and the
// /sea/waterline bench that tunes the lines. If the bench rendered its own
// approximation, every line tuned there would be wrong on the sea in a way
// that reads as a bad eye rather than a bad renderer — the same rule the
// shipyard's callout bench and the wake bench already follow.

import { memo } from 'react'
import type { Submerge } from './submerge'

/** The clip polygon for the dry part: across the top, down the right edge to
 *  the line's end, then back along the drawn waterline right-to-left. */
export function dryClip(pts: [number, number][]): string {
  const back = [...pts].reverse().map(([x, y]) => `${x}% ${y}%`).join(', ')
  return `polygon(0 0, 100% 0, ${back})`
}

const SubmergedSprite = memo(function SubmergedSprite({ art, width, sub, swayClass, delay }: {
  art: string
  width: number | string
  sub: Submerge | undefined
  swayClass?: string
  delay?: string
}) {
  // The fade anchor is the line's SHALLOWEST point: above it everything is
  // covered by the dry copy anyway, and starting the depth fade any lower
  // would brighten water that the line says is already under.
  const top = sub ? Math.min(...sub.pts.map(p => p[1])) : 100

  const base = {
    width: '100%', maxWidth: 'none', display: 'block',
    animationDelay: delay,
  } as const

  return (
    <div style={{ position: 'relative', width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img decoding="async" src={art} alt="" draggable={false} loading="lazy"
        className={swayClass}
        style={{
          ...base,
          ...(sub ? {
            maskImage:
              `linear-gradient(to bottom, rgba(0,0,0,${sub.keep}) 0%, ` +
              `rgba(0,0,0,${sub.keep}) ${top + 3}%, ` +
              `rgba(0,0,0,${sub.keep * 0.55}) ${(top + 100) / 2}%, transparent 100%)`,
            WebkitMaskImage:
              `linear-gradient(to bottom, rgba(0,0,0,${sub.keep}) 0%, ` +
              `rgba(0,0,0,${sub.keep}) ${top + 3}%, ` +
              `rgba(0,0,0,${sub.keep * 0.55}) ${(top + 100) / 2}%, transparent 100%)`,
          } : {}),
        }} />
      {sub && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img decoding="async" src={art} alt="" draggable={false} loading="lazy"
          className={swayClass}
          style={{
            ...base,
            position: 'absolute', left: 0, top: 0,
            clipPath: dryClip(sub.pts),
          }} />
      )}
    </div>
  )
})

export default SubmergedSprite
