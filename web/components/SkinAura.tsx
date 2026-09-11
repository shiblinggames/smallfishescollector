'use client'

// ── WHAT THE HULL LOOKS LIKE ON THE WATER, IN A PREVIEW ─────────────────────
//
// A ship skin is not a recolour. On the chart the Pixi layer gives each one an
// AURA out of `auraSpecs`: a glow in its own colours and a stream of sparks
// coming off the outline (see `shipEffect`). The picker showed none of it -- a
// Galaxy Hull in the Look room was a grey ship with a violet filter, and the
// thing you were actually buying only existed once you were sailing it.
//
// This is that aura, quoted rather than reimplemented. It reads the same rows
// the canvas reads, so a skin retuned there is retuned here.
//
// ── AND IT IS CHEAP, BECAUSE IT HAS TO BE ───────────────────────────────────
//
// The canvas does this with additive blending and a particle pool. The DOM
// cannot, and the obvious translation -- an animated multi-layer
// `drop-shadow` per tile, twenty tiles at once -- is exactly what took the crew
// panel's renderer down on a phone. See [[mistakes-log]].
//
// So: the glow is a radial GRADIENT built from the spec's own layers (colour,
// radius and alpha, straight off the middle keyframe), which composites like
// any other background. The sparks are a handful of 3px dots moving on
// `transform` and `opacity` only, and they are drawn for ONE hull -- the big
// preview -- rather than for every tile in the grid.

import { shipEffect, effect } from '@/app/(app)/sea/auraSpecs'

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const rgba = (c: number, a: number) =>
  `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a.toFixed(3)})`

/**
 * ── THE GLOW ITSELF, FOR ONE HULL ───────────────────────────────────────────
 *
 * The halo below is a still frame of the pulse, which is the right trade for a
 * grid of twenty tiles. It is the wrong trade for the ONE hull the room is
 * about: that one should do what it does on the water.
 *
 * So this hands back the real timeline as CSS. Every keyframe of the effect
 * becomes a stack of `drop-shadow()`s -- the same radii, the same colours, the
 * same alphas, the same duration -- for framer-motion to run on a single
 * element. Which is exactly what the fishing side already does with its boat,
 * rod and hook glows: those are `drop-shadow` keyframes in globals.css, and
 * `auraSpecs` was ported FROM them. This is the same picture taking the same
 * road back.
 *
 * EVERY FRAME CARRIES THE SAME NUMBER OF SHADOWS, padded with transparent ones
 * where a keyframe uses fewer. A filter list that changes length between
 * keyframes cannot be interpolated and snaps instead.
 */
export function skinGlow(skinId: string | null | undefined, base?: string): {
  filter: string[]; times: number[]; dur: number; linear: boolean
} | null {
  const name = shipEffect(skinId)
  if (!name) return null
  const { glow } = effect(name)
  const width = Math.max(...glow.stops.map(s => s.layers.length))
  const head = base && base !== 'none' ? `${base} ` : ''
  // The depth shadow the preview already wore, kept in every frame so it does
  // not flicker in and out as the glow breathes.
  const tail = ' drop-shadow(0 8px 18px rgba(0,0,0,0.85))'
  const filter = glow.stops.map(s => {
    const layers = Array.from({ length: width }, (_, i) => {
      const l = s.layers[i]
      return l
        ? `drop-shadow(0 0 ${l.r}px ${rgba(l.c, l.a)})`
        : 'drop-shadow(0 0 0px rgba(0,0,0,0))'
    })
    return head + layers.join(' ') + tail
  })
  // Some of these run LINEAR in the stylesheet they came from (the electric
  // and prismatic families). Carried through, or a glow that was written to
  // step would breathe instead.
  return { filter, times: glow.stops.map(s => s.t), dur: glow.dur, linear: !!glow.linear }
}

export default function SkinAura({ skinId, motes = false, halo = true, inset = '-22%' }: {
  /** The skin being worn or previewed. Null is her own paint, which throws
   *  nothing on the water either. */
  skinId: string | null | undefined
  /** Draw the sparks as well as the glow. One hull at a time, please. */
  motes?: boolean
  /**
   * THE POOL OF LIGHT, WHICH IS AN OVAL AND NOT A SHIP.
   *
   * It is the right answer on a 38px tile, where a still gradient is all the
   * glow anybody is going to see. It is the wrong answer next to a hull that is
   * running its real timeline: `skinGlow` traces the SILHOUETTE -- masts, sheer
   * and all -- and an oval behind that only announces that something here is
   * not shaped like the ship. Off wherever the real glow is on.
   */
  halo?: boolean
  /** How far the glow spills past the picture. */
  inset?: string
}) {
  const name = shipEffect(skinId)
  if (!name) return null
  const fx = effect(name)

  // THE BRIGHTEST MOMENT OF THE PULSE, held still. The canvas runs the whole
  // timeline; a still frame of a glow reads as the glow, and an animated one
  // in a grid of twenty reads as a page that will not settle.
  const stops = fx.glow.stops
  const peak = stops.reduce((best, s) =>
    s.layers.reduce((m, l) => m + l.a, 0) > best.layers.reduce((m, l) => m + l.a, 0) ? s : best, stops[0])
  const layers = [...peak.layers].sort((a, b) => a.r - b.r)
  const rMax = layers[layers.length - 1]?.r || 1

  // Each layer becomes a ring in one gradient, placed at its own radius. The
  // alphas are cut down: a drop-shadow lights the SILHOUETTE and a gradient
  // lights the whole box, so the same numbers read far hotter here.
  const ramp = layers
    .map(l => `${rgba(l.c, l.a * 0.42)} ${Math.round((l.r / rMax) * 62)}%`)
    .join(', ')

  return (
    <>
      {halo && (
        <span aria-hidden style={{
          position: 'absolute', inset, pointerEvents: 'none', zIndex: 0,
          background: `radial-gradient(ellipse 58% 52% at 50% 52%, ${ramp}, ${rgba(layers[0]?.c ?? 0xffffff, 0)} 78%)`,
        }} />
      )}
      {motes && <Motes fx={fx} />}
    </>
  )
}

/**
 * THE SPARKS, AT A DOZENTH OF THE COUNT.
 *
 * The canvas emits from the hull's outline at ten a second. Six dots on a loop
 * is not that, and it is the same IDEA at a price a phone can pay: they come
 * off the deck, they drift the way the spec says (`gravity` is negative for
 * everything that rises), they are the spec's own colours, and a star-shaped
 * spec gets the star.
 */
function Motes({ fx }: { fx: ReturnType<typeof effect> }) {
  const spec = fx.spec
  if (!spec) return null
  const colors = spec.colors ?? [0xffffff]
  const [sMin, sMax] = spec.size ?? [2, 4]
  // Rises for anything the canvas lifts (negative gravity); sinks for the rest,
  // which is smoke settling rather than embers climbing.
  const up = (spec.gravity ?? 0) <= 0
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const c = colors[i % colors.length]
        const size = sMin + ((sMax - sMin) * ((i * 37) % 100)) / 100
        return (
          <span key={i} aria-hidden className="skin-mote" style={{
            position: 'absolute', zIndex: 2, pointerEvents: 'none',
            left: `${14 + ((i * 29) % 72)}%`,
            bottom: `${22 + ((i * 17) % 26)}%`,
            width: Math.max(2, size), height: Math.max(2, size),
            borderRadius: spec.star ? 1 : '50%',
            background: hex(c),
            boxShadow: `0 0 6px ${rgba(c, 0.85)}`,
            animationDuration: `${2.4 + (i % 3) * 0.7}s`,
            animationDelay: `${(i * 0.42).toFixed(2)}s`,
            ['--mote-rise' as string]: up ? '-26px' : '14px',
          }} />
        )
      })}
    </>
  )
}
