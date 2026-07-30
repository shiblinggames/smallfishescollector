'use client'

// ─── THE DIAL ────────────────────────────────────────────────────────────────
// The fishing dial, lifted verbatim out of FishingGame so the FINN FINALE can
// mount the exact same instrument over the raid battle screen. Nothing about it
// changed in the move: same 220 viewBox, same 300px cap, same needle-in-its-own
// -composited-layer trick (a WAAPI rotation on the compositor thread, so
// main-thread jank can never make the needle skip).
//
// It is purely presentational — it owns no RAF and no game state, it just draws
// the zones and the needle it is handed. That is what lets two completely
// different games drive it. Fishing feeds it zones from buildFishZones; the
// finale feeds it the raid's own hit/graze/crit bands. Same picture, same feel,
// different maths behind it.

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { ZoneDef } from '@/app/(app)/fishing/depths'

export const CX = 110, CY = 110
export const OUTER_R = 96, INNER_R = 66
const GAP = 1.0


export function polar(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

export function arcPath(startDeg: number, endDeg: number): string {
  const s0 = startDeg + GAP, e0 = endDeg - GAP
  const span = e0 - s0
  if (span <= 0) return ''
  const la = span > 180 ? 1 : 0
  const p1 = polar(OUTER_R, s0), p2 = polar(OUTER_R, e0)
  const p3 = polar(INNER_R, e0), p4 = polar(INNER_R, s0)
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${la} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${la} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}
// ─── DialSVG ─────────────────────────────────────────────────────────────────

export function DialSVG({
  zones, angle, rotation = 0, needleColor, zoneOpacityFn, fireLevel = 0, snapKey = 0, perfectBurstKey = 0, ancientBoss = false, needleRef, zonesGroupRef, needleStyle = 'hand', turnMark = false,
}: {
  zones: ZoneDef[]
  angle: number
  rotation?: number
  needleColor: string
  zoneOpacityFn: (z: ZoneDef) => number
  fireLevel?: 0 | 1 | 2
  snapKey?: number
  perfectBurstKey?: number
  /** When true this is one of the 6 Ancient trophy fights — the dial wears a
   *  breathing void/cyan aura so it reads as a boss the instant it appears. */
  ancientBoss?: boolean
  /** Ref on the needle OVERLAY DIV (not an SVG group). The needle lives
   *  outside the main dial SVG in its own tiny composited layer so the
   *  parent can spin it with a Web Animations API rotation that runs on
   *  the compositor thread — main-thread jank (first-mount raster, GC,
   *  entrance animations) can no longer make the needle skip. */
  needleRef?: React.Ref<HTMLDivElement>
  /** Ref on the SVG zones group, so the parent can imperatively
   *  rotate the arcs during the drift mechanic without forcing a
   *  React re-render every frame. */
  zonesGroupRef?: React.Ref<SVGGElement>
  /** 'hand' (default) is fishing's clock hand, drawn from the hub outward.
   *  'marker' is the RAID aim-bar's indicator: a short bar that rides inside
   *  the ring, crossing only the band it is judging against. The finale uses
   *  it so the instrument reads as raid combat, not as a reel. */
  needleStyle?: 'hand' | 'marker'
  /** Draw the TURNAROUND LINE at 12 o'clock. Raid combat sweeps its needle a
   *  full revolution and then reverses, exactly as the aim bar reverses at its
   *  ends, and on a circle both ends are the same point. Marking it makes the
   *  reversal something the player can read and time instead of a surprise.
   *  Fishing has no reversal, so it leaves this off. */
  turnMark?: boolean
}) {
  const needleTipY  = CY - (INNER_R - 8)
  // Memoized on zones identity — DialSVG re-renders on every needle
  // zone crossing (angle prop), and the arc paths are trig + string
  // building per zone. With catchingZones memoized in the parent,
  // zones identity is stable for the whole catch, so these compute
  // once per hooked fish instead of once per crossing.
  const perfectZone  = useMemo(() => zones.find(z => z.type === 'perfect'), [zones])
  const penaltyZones = useMemo(() => zones.filter(z => z.type === 'penalty'), [zones])
  const zonePaths    = useMemo(() => zones.map(z => arcPath(z.from, z.to)), [zones])

  // Perfect-hit flash on the needle — short gold burst with a thicker
  // stroke so the needle reads as the thing the player nailed. Tied to
  // perfectBurstKey so it fires at the exact same instant as the arc
  // flash + expanding ring.
  const [perfectFlash, setPerfectFlash] = useState(false)
  const prevBurstRef = useRef(perfectBurstKey)
  useEffect(() => {
    if (perfectBurstKey > 0 && perfectBurstKey !== prevBurstRef.current) {
      prevBurstRef.current = perfectBurstKey
      setPerfectFlash(true)
      const t = setTimeout(() => setPerfectFlash(false), 450)
      return () => clearTimeout(t)
    }
  }, [perfectBurstKey])
  const liveNeedleColor = perfectFlash ? '#fde68a' : needleColor
  const liveNeedleStroke = perfectFlash ? 3.6 : 2.5
  const liveTipRadius = perfectFlash ? 7 : 5

  // Snap/bounce + ripple on reel-in tap
  const [snapAnim, setSnapAnim] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)
  const prevSnapRef = useRef(snapKey)
  useEffect(() => {
    if (snapKey > 0 && snapKey !== prevSnapRef.current) {
      prevSnapRef.current = snapKey
      setSnapAnim(true)
      setRippleKey(k => k + 1)
      setTimeout(() => setSnapAnim(false), 350)
    }
  }, [snapKey])



  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto',
      // NO filter here — this wrapper contains the per-frame-transformed
      // needle, and a standing drop-shadow filter forced the browser to
      // re-rasterize the whole filtered subtree every frame during fire
      // streaks (worst on iOS PWA). The streak glow now lives on the two
      // sibling halo divs below, which fade via opacity and never touch
      // the needle's raster path.
    }}>
      {/* Fire glow halos — box-shadow on a transparent circle matched to
          the dial's outer ring (r = OUTER_R+6 → 92.7% of the viewBox,
          inset 3.6%). Shadow radii/colors mirror the old drop-shadow
          pair per fire level; two stacked divs crossfade on level change
          the way the old filter transition did. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '3.6%', borderRadius: '50%', pointerEvents: 'none',
        boxShadow: '0 0 12px rgba(251,146,60,0.6), 0 0 22px rgba(251,146,60,0.25)',
        opacity: fireLevel === 1 ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: '3.6%', borderRadius: '50%', pointerEvents: 'none',
        boxShadow: '0 0 14px rgba(251,146,60,0.7), 0 0 32px rgba(239,68,68,0.35)',
        opacity: fireLevel === 2 ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }} />
      <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id="innerGrad" cx="50%" cy="45%" r="50%">
            <stop offset="0%"   stopColor="#1e2d3e" stopOpacity="1" />
            <stop offset="55%"  stopColor="#0d1a26" stopOpacity="1" />
            <stop offset="100%" stopColor="#050c14" stopOpacity="1" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
<g ref={zonesGroupRef} transform={`rotate(${rotation}, ${CX}, ${CY})`}>
          {zones.map((zone, i) => (
            // data-zone-arc lets the parent's rAF tick repaint
            // fill-opacity imperatively on zone crossings (no re-render).
            <path key={i} data-zone-arc={i} d={zonePaths[i]} fill={zone.color}
              fillOpacity={zoneOpacityFn(zone)} style={{ transition: 'fill-opacity 0.08s' }} />
          ))}
          {perfectZone && (() => {
            const midDeg = (perfectZone.from + perfectZone.to) / 2
            const label = polar(OUTER_R + 14, midDeg)

            // Bracket tick marks at edges, pointing inward toward the needle
            const tickOuter = INNER_R - 2, tickInner = INNER_R - 10
            const tL0 = polar(tickOuter, perfectZone.from), tL1 = polar(tickInner, perfectZone.from)
            const tR0 = polar(tickOuter, perfectZone.to),   tR1 = polar(tickInner, perfectZone.to)

            return (
              <>
                {/* Bracket ticks */}
                <line x1={tL0.x.toFixed(2)} y1={tL0.y.toFixed(2)} x2={tL1.x.toFixed(2)} y2={tL1.y.toFixed(2)} stroke="#fde68a" strokeWidth="1.5" strokeOpacity="0.9" />
                <line x1={tR0.x.toFixed(2)} y1={tR0.y.toFixed(2)} x2={tR1.x.toFixed(2)} y2={tR1.y.toFixed(2)} stroke="#fde68a" strokeWidth="1.5" strokeOpacity="0.9" />
                {/* Outer label — matches style of penalty ✕ */}
                <text x={label.x.toFixed(2)} y={label.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill="#fde68a" fontSize="9" opacity="0.85">✦</text>
              </>
            )
          })()}
          {penaltyZones.map((pz, i) => {
            const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
            return <text key={i} x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.85">✕</text>
          })}
        </g>

        {/* THE TURNAROUND. Drawn OUTSIDE the rotating zones group so it stays
            fixed on the face while the band travels past it. Both the needle
            AND the band turn back here. */}
        {turnMark && (
          <g>
            <line x1={CX} y1={CY - OUTER_R - 7} x2={CX} y2={CY - INNER_R + 3}
              stroke="#f8fafc" strokeWidth="2" strokeOpacity="0.85" strokeLinecap="round" />
            <line x1={CX} y1={CY - OUTER_R - 7} x2={CX} y2={CY - INNER_R + 3}
              stroke="#f8fafc" strokeWidth="6" strokeOpacity="0.18" strokeLinecap="round" />
          </g>
        )}
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="url(#innerGrad)" />
        {/* Reel-in ripple */}
        {rippleKey > 0 && (
          <motion.circle key={rippleKey} cx={CX} cy={CY}
            fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1"
            initial={{ r: 8, strokeOpacity: 0.18 }}
            animate={{ r: INNER_R * 0.55, strokeOpacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
        {/* Perfect zone burst — arc flash + expanding ring on tap */}
        {perfectBurstKey > 0 && perfectZone && (
          <g key={perfectBurstKey} transform={`rotate(${rotation}, ${CX}, ${CY})`}>
            <motion.path
              d={arcPath(perfectZone.from, perfectZone.to)}
              fill="#fde68a"
              initial={{ fillOpacity: 0.85 }}
              animate={{ fillOpacity: 0 }}
              transition={{ duration: 0.38, ease: 'easeOut' }}
            />
          </g>
        )}
        {perfectBurstKey > 0 && (
          <motion.circle key={`pbr-${perfectBurstKey}`}
            cx={CX} cy={CY} r={OUTER_R + 4}
            fill="none" stroke="#fde68a" strokeWidth="5"
            initial={{ strokeOpacity: 0.8 }}
            animate={{ strokeOpacity: 0, r: OUTER_R + 22 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        )}

        {/* Fire effects — glowing rings only */}
        {fireLevel >= 1 && (
          <motion.circle cx={CX} cy={CY} r={OUTER_R + 4} fill="none" stroke="#fbbf24"
            strokeWidth={fireLevel === 2 ? 2.5 : 2}
            // opacity (not strokeOpacity): fill is none, so it looks identical but
            // composites on the GPU instead of repainting the ring every frame for
            // the whole duration of an on-fire streak.
            animate={{ opacity: fireLevel === 2 ? [0.3, 0.65, 0.3] : [0.25, 0.55, 0.25] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
          />
        )}
        {fireLevel === 2 && (
          <motion.circle cx={CX} cy={CY} r={OUTER_R + 9} fill="none" stroke="#f97316" strokeWidth="10"
            animate={{ opacity: [0.1, 0.28, 0.1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Ancient boss aura — a void-violet halo with a thin cyan rim so the 6
            giants' dial reads as a boss at a glance. STATIC on purpose: the old
            breathing version animated strokeOpacity on two thick rings every frame
            for the whole fight, which re-rastered the stroke ~60x/sec and was a big
            part of the "Ancient Deep is laggy" report. Drawn once, zero per-frame cost. */}
        {ancientBoss && (
          <>
            <circle cx={CX} cy={CY} r={OUTER_R + 11} fill="none" stroke="#7c3aed" strokeWidth="12" strokeOpacity={0.24} />
            <circle cx={CX} cy={CY} r={OUTER_R + 4} fill="none" stroke="#67e8f9" strokeWidth="1.5" strokeOpacity={0.6} />
          </>
        )}
      </svg>
      {/* Needle overlay — its own tiny composited layer ABOVE the dial SVG.
          The parent spins this div with a compositor-thread WAAPI rotation
          (see startNeedleSpin); React's inline `transform` here only matters
          when no animation is running (mount frame + frozen lock-in), since
          a running animation overrides inline style. The div spans the same
          box as the SVG, so rotating about its center === the old
          rotate(angle, CX, CY). `angle` is a live angleRef read, so any
          unrelated re-render paints the current position, not a stale one.
          With the needle out of the main SVG, the dial repaints NOTHING
          between zone crossings (it used to re-raster every frame). */}
      <div ref={needleRef} style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        willChange: 'transform',
        transform: `rotate(${angle}deg)`,
      }}>
        <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block', overflow: 'visible' }}>
          {needleStyle === 'marker' ? (
            // Raid indicator: a short bar spanning the band annulus, so it reads
            // exactly like the aim bar's needle sweeping across the target.
            // It is kept STRICTLY INSIDE the ring: inset a pixel at each end,
            // and butt caps rather than round, because a round cap adds half
            // the stroke width beyond the endpoint and that alone was enough to
            // push the fat glow layer out over both black borders.
            <g style={perfectFlash || snapAnim ? { filter: 'drop-shadow(0 0 7px ' + (perfectFlash ? '#fde68a' : liveNeedleColor) + ')' } : undefined}>
              <line x1={CX} y1={CY - OUTER_R + 1} x2={CX} y2={CY - INNER_R - 1} stroke={liveNeedleColor} strokeWidth={perfectFlash ? 11 : snapAnim ? 13 : 9} strokeOpacity={perfectFlash ? 0.3 : snapAnim ? 0.42 : 0.16} strokeLinecap="butt" style={{ transition: 'stroke-width 0.16s ease-out, stroke-opacity 0.16s ease-out' }} />
              <line x1={CX} y1={CY - OUTER_R + 1} x2={CX} y2={CY - INNER_R - 1} stroke={liveNeedleColor} strokeWidth={perfectFlash ? 3.8 : snapAnim ? 5.4 : 2.8} strokeLinecap="butt" style={{ transition: 'stroke-width 0.16s ease-out' }} />
            </g>
          ) : (
          <g style={perfectFlash ? { filter: 'drop-shadow(0 0 6px #fde68a)' } : undefined}>
            <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={liveNeedleColor} strokeWidth={perfectFlash ? 12 : 10} strokeOpacity={perfectFlash ? 0.28 : 0.12} strokeLinecap="round" />
            <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={liveNeedleColor} strokeWidth={liveNeedleStroke} strokeLinecap="round" />
            <circle cx={CX} cy={needleTipY} r={liveTipRadius} fill={liveNeedleColor} />
          </g>
          )}
        </svg>
      </div>
      {/* Hub overlay — above the needle overlay so the center joint stays
          covered (it sat after the needle in the old single-SVG paint order). */}
      {needleStyle !== 'marker' && (
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
          <motion.circle cx={CX} cy={CY} r="8"
            fill="rgba(10,10,10,0.9)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"
            animate={snapAnim ? { scale: [1, 1.8, 0.7, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          />
        </svg>
      </div>
      )}
    </div>
  )
}
