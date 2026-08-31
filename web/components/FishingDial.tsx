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

/**
 * ── THE DIAL IS THE REEL ────────────────────────────────────────────────────
 *
 * It was a black disc with flat coloured wedges on it and a two pixel line for
 * a needle, which read as a UI widget rather than as a thing in the captain's
 * hands. The renderer was never the problem: every surface in here was a flat
 * fill, and drawing the same flat shapes on a GPU would have looked identical.
 * What it had no trace of was MATERIAL.
 *
 * So it is the reel, seen face on, because that is literally what you are
 * doing. The side plate is the bezel, its gear teeth are the graduations, the
 * spool of wound line is the face, and the needle is the crank arm going round.
 * The art is `/deepseareel.png` and its eight siblings: cast metal with dark ink
 * linework, spoked plate, fine teeth on the rim, screws, a knurled grip.
 *
 * ── AND IT IS *YOUR* REEL ───────────────────────────────────────────────────
 *
 * The plate takes the equipped reel's own colour (lib/reels), so buying the
 * Tidecaller's Reel changes the instrument you spend the whole game looking at.
 * Nine reels, nine coloured plates, for one prop. The finale passes nothing and
 * gets the steel default, which is right: that is not your reel, it is a fight.
 *
 * DRAWN, NOT PAINTED. A plate would have to be nine plates, would blur at the
 * 300px cap on a desktop, and could not be tinted. The reel is a machined
 * object, so it is all circles, radial ticks and screws, which is exactly what
 * SVG is good at. Every one of these paths is memoised: they depend on nothing
 * that changes while a fish is on.
 */
const PLATE_R = 103          // outer edge of the side plate
const TEETH_R = 99           // the gear ring's root
const TEETH = 68             // fine, like the art
const SCREWS = 4
const SPOKES = 6

/** The gear ring, as one path. Trapezoid teeth so they read as cut metal at
 *  300px and as a milled edge at 120. */
function teethPath(): string {
  const out: string[] = []
  const tip = PLATE_R - 0.5, root = TEETH_R
  const step = 360 / TEETH
  for (let i = 0; i < TEETH; i++) {
    const c = i * step
    const a0 = polar(root, c - step * 0.34), a1 = polar(tip, c - step * 0.17)
    const a2 = polar(tip, c + step * 0.17), a3 = polar(root, c + step * 0.34)
    out.push(`M ${a0.x.toFixed(2)} ${a0.y.toFixed(2)} L ${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`
      + ` L ${a2.x.toFixed(2)} ${a2.y.toFixed(2)} L ${a3.x.toFixed(2)} ${a3.y.toFixed(2)} Z`)
  }
  return out.join(' ')
}

/** Wound line on the spool: concentric grooves, tightening inward the way a
 *  filled spool actually looks. Not evenly spaced, or it reads as a target. */
function spoolGrooves(): { r: number; o: number }[] {
  const out: { r: number; o: number }[] = []
  for (let r = INNER_R - 5; r > 12; r -= 3.1 + (r / INNER_R) * 1.6) {
    out.push({ r, o: 0.05 + (r / INNER_R) * 0.07 })
  }
  return out
}


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
  zones, angle, rotation = 0, needleColor, zoneOpacityFn, fireLevel = 0, snapKey = 0, perfectBurstKey = 0, ancientBoss = false, needleRef, zonesGroupRef, needleStyle = 'hand', turnMark = false, plateTint = '#8fa0a8',
}: {
  zones: ZoneDef[]
  angle: number
  rotation?: number
  needleColor: string
  zoneOpacityFn: (z: ZoneDef) => number
  fireLevel?: 0 | 1 | 2
  snapKey?: number
  perfectBurstKey?: number
  /**
   * THE METAL THE PLATE IS CAST IN. Pass the equipped reel's `color` and the
   * instrument becomes that reel. The default is a plain steel, which is what
   * the raid finale should have: that dial is not your tackle.
   */
  plateTint?: string
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
  // The plate. None of it depends on anything that moves, so it is built once
  // for the life of the component rather than once per zone crossing.
  const teeth   = useMemo(teethPath, [])
  const grooves = useMemo(spoolGrooves, [])
  const screws  = useMemo(() => Array.from({ length: SCREWS }, (_, i) =>
    polar(PLATE_R - 8.5, 45 + i * (360 / SCREWS))), [])
  const spokes  = useMemo(() => Array.from({ length: SPOKES }, (_, i) => i * (360 / SPOKES)), [])

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
          {/* THE LIGHT COMES FROM THE UPPER LEFT, on everything, the way it
              does in every painted plate in this game. One light source is
              most of what separates an object from a diagram. */}
          <radialGradient id="plateGrad" cx="34%" cy="26%" r="78%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="46%"  stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
          </radialGradient>
          {/* The channel the zones are lit in is CUT INTO the plate, so it is
              darker than the metal around it and shades at its own rim. */}
          <radialGradient id="channelGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#000000" stopOpacity="0.55" />
            <stop offset="86%"  stopColor="#000000" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
          </radialGradient>
        </defs>

        {/* ── THE SIDE PLATE ────────────────────────────────────────────
            Cast metal in the reel's own colour, with the gear ring cut round
            its edge and four screws holding it on. This is the whole of the
            "it looks like a UI widget" fix: a rim with teeth and screws in it
            is an OBJECT, and a black circle is a shape. */}
        <g>
          <path d={teeth} fill={plateTint} fillOpacity={0.62} />
          <path d={teeth} fill="none" stroke="#0b1116" strokeWidth="0.7" strokeOpacity={0.55} />
          <circle cx={CX} cy={CY} r={TEETH_R} fill={plateTint} fillOpacity={0.5} />
          <circle cx={CX} cy={CY} r={TEETH_R} fill="url(#plateGrad)" />
          {/* Ink line, the house style's own edge. Every painted thing in this
              game is outlined and the dial was the one that was not. */}
          <circle cx={CX} cy={CY} r={TEETH_R} fill="none" stroke="#0b1116" strokeWidth="1.4" strokeOpacity={0.7} />
          {/* A raised inner lip where the plate steps down into the channel. */}
          <circle cx={CX} cy={CY} r={OUTER_R + 2.5} fill="none" stroke="#0b1116" strokeWidth="1.2" strokeOpacity={0.55} />
          <circle cx={CX} cy={CY} r={OUTER_R + 3.6} fill="none" stroke="#ffffff" strokeWidth="0.8" strokeOpacity={0.16} />
          {screws.map((sc, i) => (
            <g key={i}>
              <circle cx={sc.x} cy={sc.y} r="3.1" fill={plateTint} fillOpacity={0.85} stroke="#0b1116" strokeWidth="0.9" strokeOpacity={0.7} />
              {/* The slot. It is two pixels of line and it is the difference
                  between a screw and a dot. */}
              <line x1={sc.x - 1.9} y1={sc.y - 1.9} x2={sc.x + 1.9} y2={sc.y + 1.9}
                stroke="#0b1116" strokeWidth="0.9" strokeOpacity={0.75} strokeLinecap="round" />
            </g>
          ))}
        </g>

        {/* ── THE CHANNEL ── the recess the zones are lit in. */}
        <circle cx={CX} cy={CY} r={OUTER_R + 1} fill="#05090e" />
        <circle cx={CX} cy={CY} r={OUTER_R + 1} fill="url(#channelGrad)" />
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
        {/* ── THE SPOOL ──────────────────────────────────────────────────
            Wound line, seen through the plate's open spokes. The grooves
            tighten inward the way a full spool actually does; even spacing
            reads as a target, which is the last thing this should look like. */}
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="url(#innerGrad)" />
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="none" stroke="#0b1116" strokeWidth="1.2" strokeOpacity={0.8} />
        <g aria-hidden>
          {grooves.map((g, i) => (
            <circle key={i} cx={CX} cy={CY} r={g.r} fill="none"
              stroke="#cfe0ec" strokeWidth="0.7" strokeOpacity={g.o} />
          ))}
          {/* THE SPOKES OF THE PLATE, crossing in front of the wound line.
              Drawn as light bars rather than cut-outs because the plate is
              nearer the eye than the spool, and it is what makes the face read
              as two parts at different depths instead of one flat disc. */}
          {spokes.map(a => {
            const o = polar(INNER_R - 3, a), i2 = polar(15, a)
            return (
              <g key={a}>
                <line x1={o.x} y1={o.y} x2={i2.x} y2={i2.y}
                  stroke={plateTint} strokeWidth="5.5" strokeOpacity={0.16} strokeLinecap="round" />
                <line x1={o.x} y1={o.y} x2={i2.x} y2={i2.y}
                  stroke="#0b1116" strokeWidth="6.6" strokeOpacity={0.2} strokeLinecap="round" />
              </g>
            )
          })}
        </g>
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
          // ── THE CRANK ARM ──────────────────────────────────────────────
          //
          // A hand on a gauge is a hand on a gauge. This is the handle you are
          // turning: a tapered arm off the hub, a counterweight on the short
          // side the way a real crank is balanced, and a knurled grip at the
          // tip. It is the same line at the same angle doing the same job, and
          // it now looks like the reason the spool turns.
          //
          // EVERYTHING HERE IS CHEAP ON PURPOSE. This subtree lives inside the
          // needle's own composited layer, which the parent spins with a
          // compositor-thread WAAPI rotation so main-thread jank cannot make it
          // skip. Nothing here animates per frame, nothing carries a standing
          // filter, and the only filter at all is the perfect flash, which
          // lasts 450ms. See the note on needleRef.
          <g style={perfectFlash ? { filter: 'drop-shadow(0 0 6px #fde68a)' } : undefined}>
            {/* The soft trail, kept from the old needle: it is what stops a
                fast sweep strobing into separate positions. */}
            <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={liveNeedleColor}
              strokeWidth={perfectFlash ? 12 : 10} strokeOpacity={perfectFlash ? 0.28 : 0.12} strokeLinecap="round" />
            {/* THE COUNTERWEIGHT, on the far side of the hub. Three pixels of
                metal, and the whole reason the arm reads as balanced hardware
                rather than as a pointer. */}
            <line x1={CX} y1={CY + 15} x2={CX} y2={CY - 2} stroke="#0b1116"
              strokeWidth="7.4" strokeOpacity={0.55} strokeLinecap="round" />
            <line x1={CX} y1={CY + 14} x2={CX} y2={CY - 2} stroke={liveNeedleColor}
              strokeWidth="5.4" strokeOpacity={0.72} strokeLinecap="round" />
            {/* The arm. Ink line under, metal over, the way every painted
                object in this game is built. */}
            <line x1={CX} y1={CY} x2={CX} y2={needleTipY + 4} stroke="#0b1116"
              strokeWidth={liveNeedleStroke + 2.6} strokeOpacity={0.6} strokeLinecap="round" />
            <line x1={CX} y1={CY} x2={CX} y2={needleTipY + 4} stroke={liveNeedleColor}
              strokeWidth={liveNeedleStroke} strokeLinecap="round" />
            {/* THE GRIP. A knurled barrel rather than a dot: two stacked
                strokes, the outer one the ink line, and one highlight down the
                lit side. It sits ON the zone band, which is what you are
                actually aiming with. */}
            <g>
              <line x1={CX} y1={needleTipY - 5} x2={CX} y2={needleTipY + 6}
                stroke="#0b1116" strokeWidth={liveTipRadius * 2 + 2.2} strokeOpacity={0.62} strokeLinecap="round" />
              <line x1={CX} y1={needleTipY - 5} x2={CX} y2={needleTipY + 6}
                stroke={liveNeedleColor} strokeWidth={liveTipRadius * 2} strokeLinecap="round" />
              <line x1={CX - 1.6} y1={needleTipY - 3.4} x2={CX - 1.6} y2={needleTipY + 4}
                stroke="#ffffff" strokeWidth="1.1" strokeOpacity={0.4} strokeLinecap="round" />
            </g>
          </g>
          )}
        </svg>
      </div>
      {/* Hub overlay — above the needle overlay so the center joint stays
          covered (it sat after the needle in the old single-SVG paint order). */}
      {needleStyle !== 'marker' && (
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
          {/* Its own copy: gradients do not cross an <svg> boundary, and this
              overlay is a separate root so the nut sits above the crank. */}
          <defs>
            <radialGradient id="hubGrad" cx="34%" cy="26%" r="78%">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.34" />
              <stop offset="46%"  stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
            </radialGradient>
          </defs>
          {/* THE SPINDLE NUT the crank turns on. It was a black dot with a
              grey ring, which is what a joint looks like when nobody decided
              what it was. Now it is a machined boss with a nut on it: the
              plate's own metal, an ink line, and a lit rim. It keeps the snap
              bounce it always had, which is the whole tactile hit of a reel in
              and is not something to get clever with. */}
          <motion.g
            animate={snapAnim ? { scale: [1, 1.8, 0.7, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          >
            <circle cx={CX} cy={CY} r="9.4" fill={plateTint} fillOpacity={0.7} stroke="#0b1116" strokeWidth="1.3" strokeOpacity={0.75} />
            <circle cx={CX} cy={CY} r="9.4" fill="url(#hubGrad)" />
            <circle cx={CX} cy={CY} r="5.2" fill="#0d141b" stroke="#0b1116" strokeWidth="1" strokeOpacity={0.8} />
            <circle cx={CX} cy={CY} r="5.2" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeOpacity={0.2} />
          </motion.g>
        </svg>
      </div>
      )}
    </div>
  )
}
