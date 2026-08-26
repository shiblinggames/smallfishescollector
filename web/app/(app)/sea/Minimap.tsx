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
import { PLACES, YOON, RESIDENTS, NORTH_WALL } from './chart'
import {
  FOG_CELL, FOG_W, FOG_H, FOG_X0, FOG_Y0, FOG_CELLS,
  fogCentre, fogHas, fogProgress,
} from '@/lib/seaExplore'
import { vibrate } from '@/lib/haptics'

/** Padding inside the canvas, in px, so the outermost band is not flush to the
 *  edge and the port pins have room for their labels. */
const PAD = 10

export default function Minimap({
  open, onClose, fog, at, seaAt,
}: {
  open: boolean
  onClose: () => void
  /** The live bitfield. Read, never written — the map owns it. */
  fog: Uint8Array
  /** The boat, read at draw time. */
  at: React.RefObject<{ x: number; y: number }>
  /** The same blend the chart itself uses, so a stretch of water is the colour
   *  here that it is out there. Passed in rather than imported, because it
   *  lives in SeaMap alongside the palettes it reads. */
  seaAt: (p: { x: number; y: number }) => string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState(0)
  const prog = fogProgress(fog)

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv || !size) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = size * dpr
    cv.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    // World -> canvas. The grid is wider than it is tall, so one scale for both
    // axes and the whole thing centred — squashing it to fill a square would
    // make the bands ovals and lie about the shape of the sea.
    const worldW = FOG_W * FOG_CELL
    const worldH = FOG_H * FOG_CELL
    const s = Math.min((size - PAD * 2) / worldW, (size - PAD * 2) / worldH)
    const ox = (size - worldW * s) / 2 - FOG_X0 * s
    const oy = (size - worldH * s) / 2 - FOG_Y0 * s
    const tx = (x: number) => ox + x * s
    const ty = (y: number) => oy + y * s

    // ── THE SEA, cell by cell ────────────────────────────────────────────
    // +1 on the cell size, so neighbouring cells overlap by a pixel. Without
    // it the rounding between them leaves hairlines and the chart reads as
    // graph paper.
    const cs = FOG_CELL * s + 1
    for (let i = 0; i < FOG_CELLS; i++) {
      const c = fogCentre(i)
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

    // The north wall, where the chart stops being ours.
    ctx.strokeStyle = 'rgba(180,214,232,0.22)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(tx(FOG_X0), ty(NORTH_WALL))
    ctx.lineTo(tx(FOG_X0 + worldW), ty(NORTH_WALL))
    ctx.stroke()
    ctx.setLineDash([])

    // ── THE PORTS, always ────────────────────────────────────────────────
    // Never fogged. A chart whose own harbours are hidden until you have been
    // to them is not a chart, it is a puzzle — and you cannot get lost looking
    // for somewhere you already know the way to.
    for (const p of PLACES) {
      if (p.kind !== 'port') continue
      const x = tx(p.x), y = ty(p.y)
      ctx.fillStyle = '#f0c040'
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill()
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
    for (const r of RESIDENTS) {
      const i = Math.floor((r.y - FOG_Y0) / FOG_CELL) * FOG_W + Math.floor((r.x - FOG_X0) / FOG_CELL)
      if (!fogHas(fog, i)) continue
      ctx.fillStyle = '#7fd6a0'
      ctx.beginPath(); ctx.arc(tx(r.x), ty(r.y), 2.6, 0, Math.PI * 2); ctx.fill()
    }
    {
      const i = Math.floor((YOON.y - FOG_Y0) / FOG_CELL) * FOG_W + Math.floor((YOON.x - FOG_X0) / FOG_CELL)
      if (fogHas(fog, i)) {
        ctx.fillStyle = '#c084fc'
        ctx.beginPath(); ctx.arc(tx(YOON.x), ty(YOON.y), 3.2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(226,214,250,0.9)'
        ctx.font = '600 8px ui-sans-serif, system-ui'
        ctx.fillText('Yoon', tx(YOON.x), ty(YOON.y) - 6)
      }
    }

    // ── YOU ──────────────────────────────────────────────────────────────
    const b = at.current
    if (b) {
      const x = tx(b.x), y = ty(b.y)
      ctx.strokeStyle = 'rgba(240,250,255,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill()
    }
  }, [fog, size, at, seaAt])

  useEffect(() => { if (open) draw() }, [open, draw])

  useEffect(() => {
    if (!open) return
    const fit = () => setSize(Math.min(window.innerWidth - 48, window.innerHeight - 240, 420))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.62rem', letterSpacing: '0.16em', color: 'rgba(180,214,232,0.7)',
                }}>The chart</p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f2ead8' }}>
                  {Math.round(prog.pct * 100)}% sailed
                </p>
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

            <canvas ref={canvasRef}
              style={{ width: size, height: size, display: 'block', borderRadius: 12, background: '#0a1018' }} />

            <p className="font-karla font-600" style={{
              fontSize: '0.7rem', color: 'rgba(190,212,228,0.5)', marginTop: 8, lineHeight: 1.5, maxWidth: size,
            }}>
              Fog is water you have not sailed. Harbours are always marked; the
              people out there are only marked once you have found them.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
