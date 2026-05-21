import type { CSSProperties } from 'react'

// Cosmetic overlay for the Ancient Deep profile background: luminous lavender
// motes drifting up from the dark depths, plus a slow pulsing horizon glow.
// Rendered inside the fixed bg layer (above image + scrim, below content) only
// when profile_bg === 'ancient_deep'. All animation lives in globals.css
// (.profile-ancient-glow / .profile-ancient-mote) and is transform/opacity-only.

// Deterministic so server and client render identically (no hydration drift).
// [leftPct, sizePx, durationS, delayS, driftPx, opacity]
const MOTES: [number, number, number, number, number, number][] = [
  [4,  5, 19, -2,  18, 0.55],
  [11, 7, 24, -11, -22, 0.7],
  [18, 4, 16, -6,  10, 0.5],
  [25, 8, 27, -18, 26, 0.75],
  [32, 5, 21, -3, -14, 0.6],
  [39, 6, 23, -14, 20, 0.65],
  [46, 9, 29, -8, -28, 0.8],
  [53, 4, 17, -20, 12, 0.5],
  [60, 7, 25, -5, -18, 0.7],
  [67, 5, 20, -16, 24, 0.6],
  [74, 8, 28, -10, -12, 0.78],
  [81, 4, 18, -1,  16, 0.5],
  [88, 6, 22, -13, -24, 0.66],
  [94, 7, 26, -7,  22, 0.72],
  [15, 5, 23, -22, -16, 0.58],
  [70, 4, 19, -25, 14, 0.52],
]

export default function AncientBgEffect() {
  return (
    <>
      <div aria-hidden className="profile-ancient-glow" />
      {MOTES.map(([left, size, dur, delay, drift, opacity], i) => (
        <div
          key={i}
          aria-hidden
          className="profile-ancient-mote"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            animationDuration: `${dur}s`,
            animationDelay: `${delay}s`,
            '--mote-drift': `${drift}px`,
            '--mote-opacity': opacity,
          } as CSSProperties}
        />
      ))}
    </>
  )
}
