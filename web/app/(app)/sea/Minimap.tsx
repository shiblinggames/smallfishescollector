'use client'

// THE CHART, as far as you have sailed it.
//
// The map you play on shows about 800 world pixels of a chart that is 45,200
// across, so at any moment you can see roughly one three-thousandth of it. The
// compass says which way things are; it cannot say what SHAPE the sea is, or
// how much of it you have been to, or that there is a whole band out east you
// have never once crossed. That is what this is for.
//
// Drawn on a canvas rather than as elements. It is 2,275 cells, and 2,275 divs
// to render a picture that never changes while it is open is the wrong tool —
// one canvas pass on open, and again only when the fog actually changes.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PLACES, YOON, RESIDENTS, SOCIALS, NORTH_WALL, OUTER_EDGE, EXP_ORIGIN, EXP_EDGE, RAID_EDGE } from './chart'
import { ISLES } from '@/lib/seaIsles'
import { DIG_SITES } from '@/lib/seaDigs'
import {
  FOG_CELL, FOG_W, FOG_X0, FOG_Y0, FOG_CELLS,
  fogCentre, fogHas, fogProgress,
} from '@/lib/seaExplore'
import { vibrate } from '@/lib/haptics'

/** Padding inside the canvas, so the outermost band is not flush to the edge
 *  and the port pins have room for their labels. */
const PAD = 12

/**
 * THE SHAPE OF THE SEA, and therefore the shape of this canvas.
 *
 * The chart runs from the north wall down to the outer edge and the full width
 * of the outer edge either side: 45,200 by 24,100, which is very nearly two to
 * one. It used to be drawn into a SQUARE, scaled to fit — so about 47% of the
 * canvas was permanently blank, above and below a chart that could never reach
 * it. That is where the empty space came from; it was not the fog.
 */
/**
 * THE HALF OF THE WORLD THIS CHART IS OF.
 *
 * Two seas share a reef, and each is a half-disc with the reef as its flat
 * side: the fishing grounds centred on the Mainland and opening south, the
 * expedition sea centred 1,500 north of the reef and opening north. Everything
 * the canvas does — the scale, the origin, which fog cells are reachable, where
 * the survey stops — is that one shape, so it is described once here rather
 * than as constants scattered through the draw.
 *
 * `dir` is which way the disc opens: +1 south, -1 north. It is what turns the
 * arc and the chord round without a second copy of the drawing code.
 */
type Half = { cx: number; cy: number; r: number; flat: number; dir: 1 | -1 }
const HALVES: Record<'fishing' | 'expeditions' | 'sortie', Half> = {
  fishing:     { cx: 0, cy: 0,            r: OUTER_EDGE, flat: NORTH_WALL, dir: 1 },
  expeditions: { cx: EXP_ORIGIN.x, cy: EXP_ORIGIN.y, r: EXP_EDGE, flat: NORTH_WALL, dir: -1 },
  // Past the sortie it is the SAME disc drawn wider — same centre, same flat
  // side, bigger radius. A captain out there is off the anchorage chart
  // entirely, and a map that cannot show where its own boat is is not a map.
  sortie:      { cx: EXP_ORIGIN.x, cy: EXP_ORIGIN.y, r: RAID_EDGE, flat: NORTH_WALL, dir: -1 },
}
const worldW = (h: Half) => h.r * 2
const worldH = (h: Half) => h.dir === 1 ? (h.cy + h.r) - h.flat : h.flat - (h.cy - h.r)

/** Every colour the chart draws with, in one place, so the key cannot drift
 *  from the map it is a key to. */
/**
 * ── HOW THIS MAP IS READ ────────────────────────────────────────────────────
 *
 * SHAPE CARRIES THE MEANING; COLOUR ONLY REINFORCES IT. Everything on here was
 * a circle in one of two colours, so a harbour, an isle, a buyer, a friend and
 * a dig site were five dots in gold or green and the legend was ten rows of
 * almost the same picture. At four pixels across, hue is the weaker channel and
 * two greens are indistinguishable; a square is never mistaken for a triangle.
 *
 *   PLACES are gold and angular:   square = harbour, triangle = isle, X = dig.
 *   PEOPLE are round and coloured: circle = buyer, ringed = one of the
 *                                  regulars, diamond = the rival.
 *   YOU are white with a ring, and nothing else on the chart is white.
 *
 * The three golds can share a colour precisely because their shapes do not
 * collide, and the people are pulled apart by hue because they are all round.
 */
const INK = {
  /** Places. One gold, three shapes. */
  port: '#f0c040',
  isle: '#f0c040',
  isleDone: 'rgba(150,182,164,0.75)',
  dig: '#f0c040',
  digDone: 'rgba(150,182,164,0.5)',
  /** People. One shape family, four hues, none of them each other's. */
  trader: '#6fd39a',
  regular: '#e8b464',
  /** Other captains. Moved off green: it was the buyers' colour and a circle
   *  in almost the same green was the single worst confusion on this map. */
  friend: '#62c8f0',
  /** THE RIVAL. Ruby, which is his own character colour, and the only red on
   *  the whole chart. Nothing else can be mistaken for him and he cannot be
   *  mistaken for anything else, which is the entire requirement for the one
   *  mark that means "the campaign is here". */
  finn: '#e8564a',
  you: '#ffffff',
  fog: 'rgb(26,32,41)',
} as const

/** Canvas shape helpers, so the map and its legend cannot draw the same thing
 *  two different ways. */
function sq(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2)
}
function tri(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8)
  ctx.closePath()
}
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y)
  ctx.closePath()
}

export default function Minimap({
  open, onClose, fog, at, seaAt, found, bearings, dug, friends, finn, side = 'fishing',
}: {
  /** The rival, if he is on this half of the world. `ready` doubles his mark:
   *  a job of his is finished and he is holding your pay. */
  finn?: { x: number; y: number; ready: boolean } | null
  open: boolean
  onClose: () => void
  /** Which half of the world to draw. See HALVES. */
  side?: 'fishing' | 'expeditions' | 'sortie'
  /** The live bitfield. Read, never written — the map owns it. */
  fog: Uint8Array
  /** The boat, read at draw time. */
  at: React.RefObject<{ x: number; y: number }>
  /** The same blend the chart itself uses, so a stretch of water is the colour
   *  here that it is out there. Passed in rather than imported, because it
   *  lives in SeaMap alongside the palettes it reads. */
  seaAt: (p: { x: number; y: number }) => string
  /** Isle ids already gone ashore at, so a cleared rock reads as cleared. */
  found: Set<string>
  /** Dig sites whose bearing you hold. The ONLY way one ever appears here. */
  bearings: Set<string>
  /** Of those, the ones already up. */
  dug: Set<string>
  /** Mutual crew currently sailing. Never fogged: they are people, not
   *  discoveries, and hiding a friend until you have swept their water would
   *  defeat the only thing this mark is for. */
  friends: { username: string; x: number; y: number }[]
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [w, setW] = useState(0)
  /** Enough width to stand the key beside the chart rather than under it. */
  const [wide, setWide] = useState(false)
  const KEY_W = 268
  const h = Math.round(w / (worldW(HALVES[side]) / worldH(HALVES[side])))
  const prog = fogProgress(fog)

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv || !w) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const H = Math.round(w / (worldW(HALVES[side]) / worldH(HALVES[side])))

    // ── THE BACKING STORE IS BOUNDED, NOT THE MAP ────────────────────
    //
    // This canvas is now allowed to be most of a desktop window, and a backing
    // store is width TIMES height: doubling the map quadruples the memory. At
    // 1500 across and full retina that is a 3000 by 2400 surface, near thirty
    // megabytes, allocated the moment somebody opens the chart.
    //
    // So the density gives way as the size grows. It is a schematic — dots,
    // rules and a coastline — and the crispness that matters is at the SMALL
    // sizes where a 2px mark is two pixels. A big one already has the room to
    // say what it means.
    const dpr = Math.min(window.devicePixelRatio || 1, w > 1000 ? 1.5 : 2)
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, H)

    // World -> canvas. One scale for both axes: squashing it to fill the box
    // would make the bands ovals and lie about the shape of the sea.
    const hf = HALVES[side]
    const WW = worldW(hf), WH = worldH(hf)
    const s = Math.min((w - PAD * 2) / WW, (H - PAD * 2) / WH)
    const ox = (w - WW * s) / 2 + (hf.r - hf.cx) * s
    // The top of the drawn box: the reef for the fishing half, the far rim for
    // the expedition one.
    const top = hf.dir === 1 ? hf.flat : hf.cy - hf.r
    const oy = (H - WH * s) / 2 - top * s
    const tx = (x: number) => ox + x * s
    const ty = (y: number) => oy + y * s

    // ── THE SEA, cell by cell ────────────────────────────────────────────
    // +1 on the cell size, so neighbouring cells overlap by a pixel. Without
    // it the rounding between them leaves hairlines and the chart reads as
    // graph paper.
    const cs = FOG_CELL * s + 1
    for (let i = 0; i < FOG_CELLS; i++) {
      const c = fogCentre(i)
      // OFF THE CHART ENTIRELY. The fog grid is a RECTANGLE and the sea is a
      // half-disc inside it, so some of these cells are corners no boat can
      // reach. Painting them as fog advertises water that is not there, and
      // somebody would spend a long evening trying to sail into it.
      if (Math.hypot(c.x - hf.cx, c.y - hf.cy) > hf.r) continue
      // And the reef is the flat side: cells on the far side of it belong to
      // the OTHER sea and are not this chart's to draw.
      if (hf.dir === 1 ? c.y < hf.flat : c.y > hf.flat) continue
      const x = tx(c.x - FOG_CELL / 2)
      const y = ty(c.y - FOG_CELL / 2)
      if (fogHas(fog, i)) {
        ctx.fillStyle = seaAt(c)
        ctx.fillRect(x, y, cs, cs)
      } else {
        // FOG. Not black — a chart you have not filled in is blank paper, not a
        // hole. Slightly varied per cell so a wall of it has some tooth and
        // does not read as one flat rectangle.
        const n = ((i * 2654435761) % 17) / 17
        ctx.fillStyle = `rgb(${22 + n * 7}, ${28 + n * 8}, ${36 + n * 9})`
        ctx.fillRect(x, y, cs, cs)
      }
    }

    // ── WHERE THE SURVEY STOPS ───────────────────────────────────────────
    // Both edges in the same dashes, because they are the same kind of thing:
    // not walls, just the end of what anyone drew.
    ctx.strokeStyle = 'rgba(180,214,232,0.26)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    // The north wall, clipped to the chord the disc actually reaches at that
    // latitude rather than run the full width of a box the sea does not fill.
    const dy = hf.flat - hf.cy
    const half = Math.sqrt(Math.max(0, hf.r * hf.r - dy * dy))
    ctx.beginPath()
    ctx.moveTo(tx(hf.cx - half), ty(hf.flat))
    ctx.lineTo(tx(hf.cx + half), ty(hf.flat))
    ctx.stroke()
    ctx.beginPath()
    const lift = Math.asin(Math.min(1, Math.abs(dy) / hf.r))
    // The arc runs the long way round the side the sea is actually on.
    if (hf.dir === 1) ctx.arc(tx(hf.cx), ty(hf.cy), hf.r * s, -lift, Math.PI + lift)
    else ctx.arc(tx(hf.cx), ty(hf.cy), hf.r * s, Math.PI - lift, lift)
    ctx.stroke()
    ctx.setLineDash([])

    // ── THE PORTS, always ────────────────────────────────────────────────
    // Never fogged. A chart whose own harbours are hidden until you have been
    // to them is not a chart, it is a puzzle — and you cannot get lost looking
    // for somewhere you already know the way to.
    for (const p of PLACES) {
      if (p.kind !== 'port') continue
      const x = tx(p.x), y = ty(p.y)
      ctx.fillStyle = INK.port
      sq(ctx, x, y, 4); ctx.fill()
      ctx.strokeStyle = 'rgba(6,12,18,0.9)'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = 'rgba(244,236,216,0.92)'
      ctx.font = '600 9px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(p.name.replace(/^The /, ''), x, y - 8)
    }

    // ── PEOPLE YOU HAVE FOUND ────────────────────────────────────────────
    // Only in water you have uncovered — finding them is the point, and a pin
    // on a foggy cell would hand you the discovery for free.
    ctx.textAlign = 'center'
    // BUYERS: a plain green pip. Somewhere to sell, nothing more.
    for (const r of RESIDENTS) {
      const i = Math.floor((r.y - FOG_Y0) / FOG_CELL) * FOG_W + Math.floor((r.x - FOG_X0) / FOG_CELL)
      if (!fogHas(fog, i)) continue
      ctx.fillStyle = INK.trader
      ctx.beginPath(); ctx.arc(tx(r.x), ty(r.y), 2.6, 0, Math.PI * 2); ctx.fill()
    }
    // THE REGULARS: warm, and RINGED, so they are told apart by shape as well
    // as colour. They were not drawn here at all, which meant the nine people
    // the friendship system is built on were the only permanent thing on this
    // sea the chart would not show you.
    // YOON IS ONE OF THEM. He had his own purple pip with his name printed
    // beside it, from back when he was a one-off vendor sitting on a rod. He is
    // one of the nine you can build rapport with, so a mark of his own said he
    // was a different kind of thing, and it put a fourth people-colour on a map
    // that had just been cut back to being readable.
    for (const r of [...SOCIALS, { x: YOON.x, y: YOON.y }]) {
      const i = Math.floor((r.y - FOG_Y0) / FOG_CELL) * FOG_W + Math.floor((r.x - FOG_X0) / FOG_CELL)
      if (!fogHas(fog, i)) continue
      const x = tx(r.x), y = ty(r.y)
      ctx.fillStyle = INK.regular
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = INK.regular
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, Math.PI * 2); ctx.stroke()
    }

    // ── THE ISLES ────────────────────────────────────────────────────────
    //
    // Fogged like the people, and for the same reason: pinning a rock you have
    // never sailed past would turn 27 discoveries into 27 waypoints, and the
    // finding is the feature. Once the water round it is uncovered the pin
    // stays, because remembering which rock you still owe a visit to across a
    // 45,000 pixel chart is not the interesting part.
    for (const isle of ISLES) {
      const i = Math.floor((isle.y - FOG_Y0) / FOG_CELL) * FOG_W + Math.floor((isle.x - FOG_X0) / FOG_CELL)
      if (!fogHas(fog, i)) continue
      const done = found.has(isle.id)
      const x = tx(isle.x), y = ty(isle.y)
      ctx.fillStyle = done ? INK.isleDone : INK.isle
      tri(ctx, x, y, done ? 3 : 4.2); ctx.fill()
      if (!done) {
        // A ring, so an unclaimed isle reads at a glance on a busy chart.
        ctx.strokeStyle = 'rgba(255,206,138,0.55)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.stroke()
      }
    }

    // ── X MARKS THE SPOT ─────────────────────────────────────────────────
    //
    // NOT fogged, and not conditional on having sailed there — that is the
    // whole point of a bearing. You were told where it is, so the chart knows
    // where it is, whether or not you have ever been in that water.
    //
    // And nothing appears here without a bearing. A dig site you have not been
    // told about is drawn nowhere, ever: it is the one thing on this sea that
    // sweeping the fog will not hand you.
    for (const d of DIG_SITES) {
      if (!bearings.has(d.id)) continue
      const x = tx(d.x), y = ty(d.y)
      const done = dug.has(d.id)
      ctx.strokeStyle = done ? INK.digDone : INK.dig
      ctx.lineWidth = done ? 1.4 : 2
      const a = done ? 3 : 4.5
      ctx.beginPath()
      ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a)
      ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a)
      ctx.stroke()
    }

    // ── THE RIVAL ────────────────────────────────────────────────────────
    //
    // He used to be deliberately absent, and the note here said a man you can
    // look up is not a man you find. That was correct for a rival who moved
    // 4,200px after every conversation and whose whole role was to be hunted.
    //
    // IT IS WRONG NOW. He is moored (lib/seaFinn), and the reason he was moored
    // is that the campaign should be somewhere you can go on purpose. A fixed
    // character the chart refuses to show is not mysterious, it is just missing.
    //
    // A ruby diamond, the only red and the only diamond on this map, and when
    // he is holding a finished job it doubles into a ringed one. That second
    // state is the whole point: the chart should be able to tell you the
    // campaign is waiting on you from one glance at the map.
    if (finn) {
      const x = tx(finn.x), y = ty(finn.y)
      if (finn.ready) {
        ctx.strokeStyle = INK.finn
        ctx.lineWidth = 1.6
        diamond(ctx, x, y, 9); ctx.stroke()
      }
      ctx.fillStyle = INK.finn
      diamond(ctx, x, y, 5.2); ctx.fill()
      ctx.strokeStyle = 'rgba(6,12,18,0.9)'; ctx.lineWidth = 1.4; ctx.stroke()
      ctx.fillStyle = 'rgba(250,214,208,0.95)'
      ctx.font = '700 8px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(finn.ready ? 'Finn — waiting' : 'Finn', x, y - 11)
    }

    // ── YOUR CREW ────────────────────────────────────────────────────────
    // Drawn last but one, so a friend is never buried under an isle pin, and
    // named, because the entire point of this mark is knowing WHICH friend.
    ctx.textAlign = 'center'
    for (const f of friends) {
      const x = tx(f.x), y = ty(f.y)
      ctx.fillStyle = INK.friend
      ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(6,12,18,0.9)'; ctx.lineWidth = 1.4; ctx.stroke()
      ctx.fillStyle = 'rgba(214,244,226,0.92)'
      ctx.font = '600 8px ui-sans-serif, system-ui'
      ctx.fillText(f.username, x, y - 7)
    }

    // ── YOU ──────────────────────────────────────────────────────────────
    const b = at.current
    if (b) {
      const x = tx(b.x), y = ty(b.y)
      ctx.strokeStyle = 'rgba(240,250,255,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = INK.you
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill()
    }
  }, [fog, w, at, seaAt, found, bearings, dug, friends, finn])

  useEffect(() => { if (open) draw() }, [open, draw])

  useEffect(() => {
    if (!open) return
    // ── HOW BIG THE CHART GETS ───────────────────────────────────────────
    //
    // Width first, height derived, and capped against the viewport HEIGHT too
    // or on a short screen the chart runs off the bottom of its own panel.
    //
    // THE 620 CAP WAS A PHONE NUMBER. It made sense when every surface in this
    // game was a column; on a wide screen it left a postcard of a chart in the
    // middle of an acre of backdrop, and the map of the world you are sailing
    // is the one thing that most deserves the room.
    //
    // Two things change on a wide screen and they compound. The cap goes up,
    // and THE KEY MOVES BESIDE THE CHART instead of under it — so the height
    // budget stops paying for ten rows of legend and the chart can have nearly
    // the whole window. Narrow screens keep the stacked layout exactly as it
    // was, because there the key under the map is the only place it fits.
    const KEY_W = 268
    const aspect = worldW(HALVES[side]) / worldH(HALVES[side])
    const fit = () => {
      const roomy = window.innerWidth >= 1024
      setWide(roomy)
      // Header and padding. When the key is beside the chart it costs the
      // height budget nothing, which is most of where the extra size comes
      // from on a laptop.
      const chrome = roomy ? 104 : 210
      const across = window.innerWidth - 40 - (roomy ? KEY_W + 18 : 0)
      setW(Math.round(Math.min(
        across,
        roomy ? 1500 : 620,
        Math.max(220, (window.innerHeight - chrome) * aspect),
      )))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open, side])

  const islesFound = ISLES.filter(i => found.has(i.id)).length
  const digsDone = DIG_SITES.filter(d => dug.has(d.id)).length
  const digsKnown = DIG_SITES.filter(d => bearings.has(d.id)).length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          // The chart under this steers on pointerdown and CAPTURES the pointer
          // for the rest of the gesture, so an overlay without this both sails
          // the boat and never receives its own click. See PopupShell.
          data-no-steer
          style={{
            position: 'fixed', inset: 0, zIndex: 9200,
            background: 'rgba(3,8,14,0.86)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}>
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(8,14,22,0.98)',
              border: '1px solid rgba(180,214,232,0.28)',
              borderRadius: 18, padding: '0.95rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}>
            {/* ── THE TALLY ──────────────────────────────────────────────
                Three numbers, because "41% sailed" on its own says how much
                water you have crossed and nothing about whether crossing it got
                you anything. The dig count deliberately shows how many bearings
                you HOLD rather than how many exist: the total is not something
                the chart is willing to tell you. */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              gap: 12, marginBottom: 9,
              // Spans the chart AND the key when they sit side by side, so the
              // close button stays in the panel's top corner rather than in
              // the middle of it.
              width: wide ? w + KEY_W + 18 : w,
            }}>
              <div style={{ display: 'flex', gap: 20, minWidth: 0 }}>
                <Stat label="Sailed" value={`${Math.round(prog.pct * 100)}%`} />
                <Stat label="Isles" value={`${islesFound}/${ISLES.length}`} />
                <Stat label="Dug" value={digsKnown ? `${digsDone}/${digsKnown}` : '0'} />
              </div>
              <button type="button" onClick={() => { vibrate(8); onClose() }} aria-label="Close"
                style={{
                  width: 30, height: 30, borderRadius: '50%', padding: 0, flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div style={{ display: 'flex', gap: wide ? 18 : 0, alignItems: 'flex-start' }}>
            <canvas ref={canvasRef}
              style={{
                width: w, height: h, display: 'block', borderRadius: 12,
                background: '#080d14', border: '1px solid rgba(180,214,232,0.12)',
              }} />

            {/* ── THE KEY ────────────────────────────────────────────────
                GROUPED, because ten flat rows of almost-identical dots is a
                puzzle about the chart rather than a key to it. Places first
                (gold, angular), then faces (round, and each its own colour),
                then you. Every mark is drawn at the canvas's own radii through
                the same shape helpers, so the swatch cannot drift from the
                thing it is a swatch for. */}
            <div style={{
              width: wide ? KEY_W : w,
              marginTop: wide ? 0 : 10,
              // Beside a tall chart the key can run past the bottom of it.
              // Scrolling the key is right and scrolling the chart is not.
              ...(wide ? { maxHeight: h, overflowY: 'auto' as const } : null),
            }}>
              <KeyGroup title="Places">
                <Key mark={<Square c={INK.port} />} label="Harbour" />
                <Key mark={<Tri c={INK.isle} ring="rgba(255,206,138,0.55)" />} label="Isle, not landed" />
                <Key mark={<Tri c={INK.isleDone} />} label="Been ashore" />
                <Key mark={<Cross c={INK.dig} />} label="Buried, marked" />
                <Key mark={<Cross c={INK.digDone} thin />} label="Already dug" />
              </KeyGroup>

              {/* NOT "People". Nothing on this sea is one, and the key is no
                  place to be loose about it. */}
              <KeyGroup title="Faces">
                <Key mark={<Diamond c={INK.finn} ring={INK.finn} />} label="Finn" />
                <Key mark={<Dot c={INK.regular} r={2.2} ring={INK.regular} ringR={4.4} />} label="Someone you know" />
                <Key mark={<Dot c={INK.trader} r={2.8} />} label="Buyer" />
                <Key mark={<Dot c={INK.friend} r={3.6} ring="rgba(6,12,18,0.9)" />} label="Another captain" />
              </KeyGroup>

              <KeyGroup title="The chart">
                <Key mark={<Dot c={INK.you} r={4} ring="rgba(240,250,255,0.55)" />} label="You" />
                <Key mark={<Swatch c={INK.fog} />} label="Not sailed" />
              </KeyGroup>
            </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.56rem', letterSpacing: '0.16em', color: 'rgba(180,214,232,0.6)', margin: 0,
      }}>{label}</p>
      <p className="font-cinzel font-700" style={{
        fontSize: '1.12rem', color: '#f2ead8', margin: 0, lineHeight: 1.15,
      }}>{value}</p>
    </div>
  )
}

/** One band of the key. The heading is what turns ten similar marks into
 *  three short lists somebody can actually scan. */
function KeyGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.52rem', letterSpacing: '0.18em',
        color: 'rgba(180,214,232,0.4)', margin: '0 0 4px',
      }}>{title}</p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
        gap: '5px 14px',
      }}>{children}</div>
    </div>
  )
}

function Key({ mark, label }: { mark: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span style={{ width: 16, height: 16, flexShrink: 0, display: 'block' }}>{mark}</span>
      <span className="font-karla" style={{
        fontSize: '0.68rem', color: 'rgba(196,214,228,0.72)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
    </div>
  )
}

/** The key's marks are SVG at the canvas's own radii, so the swatch and the
 *  thing it stands for are genuinely the same size. */
function Dot({ c, r, ring, ringR }: { c: string; r: number; ring?: string; ringR?: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {ring && <circle cx="8" cy="8" r={ringR ?? r + 1.2} fill="none" stroke={ring} strokeWidth="1.2" />}
      <circle cx="8" cy="8" r={r} fill={c} />
    </svg>
  )
}

function Square({ c }: { c: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="4" y="4" width="8" height="8" fill={c} stroke="rgba(6,12,18,0.9)" strokeWidth="1.4" />
    </svg>
  )
}

function Tri({ c, ring }: { c: string; ring?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {ring && <circle cx="8" cy="8" r="6.5" fill="none" stroke={ring} strokeWidth="1" />}
      <path d="M8 3.4 L12.2 11.4 L3.8 11.4 Z" fill={c} />
    </svg>
  )
}

function Diamond({ c, ring }: { c: string; ring?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      {ring && <path d="M8 0.6 L15.4 8 L8 15.4 L0.6 8 Z" fill="none" stroke={ring} strokeWidth="1.3" />}
      <path d="M8 3.2 L12.8 8 L8 12.8 L3.2 8 Z" fill={c} stroke="rgba(6,12,18,0.9)" strokeWidth="1.2" />
    </svg>
  )
}

function Cross({ c, thin }: { c: string; thin?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke={c} strokeWidth={thin ? 1.4 : 2} strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Swatch({ c }: { c: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" fill={c} stroke="rgba(180,214,232,0.2)" strokeWidth="1" />
    </svg>
  )
}
