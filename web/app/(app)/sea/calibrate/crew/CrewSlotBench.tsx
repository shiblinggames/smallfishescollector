'use client'

// ── THE CREW-SLOT BENCH ─────────────────────────────────────────────────────
//
// Where the crew portraits standing on each ship get their numbers, against the
// actual hull rather than a guess at one.
//
// The same shape as the island bench next door: admin only, linked from
// nowhere, and it writes nothing anywhere. Drag the slots onto the deck, flip
// her, drag again if she reads wrong the other way, then paste the table it
// prints into `SHIP_CREW_SLOTS` in lib/ships.ts.
//
// ── WHY THE NUMBERS ARE FRACTIONS OF THE HULL ───────────────────────────────
//
// A ship is drawn at a different size everywhere she appears — 340 world px on
// the chart, a few hundred CSS px in a fight, whatever the bench feels like —
// so a slot measured in pixels is a slot that only fits on the screen it was
// measured on. Fractions of the hull's own width travel: 0.5 is always
// amidships, whatever the hull is scaled to.
//
// Origin is the CENTRE of the hull box, x to starboard and y DOWN, both as a
// share of the box's width — so the numbers read like the ship rather than
// like a CSS rule, and a negative y is above the waterline.
//
// ── AND WHY MIRRORING IS A BUTTON ───────────────────────────────────────────
//
// The chart flips the whole hull on the tack, so every slot mirrors with her.
// A crew laid out to look right sailing east can land in the rigging sailing
// west, and there is no way to know without looking. The flip shows exactly
// what the chart will draw; the numbers never change, only the view.

import { useCallback, useEffect, useRef, useState } from 'react'
import { SHIPS, MIN_SHIP_TIER, MAX_SHIP_TIER, getShip, SHIP_CREW_FACE } from '@/lib/ships'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'

/** How wide the hull is drawn on the bench. Big enough to place a face on a
 *  deck; the numbers are fractions, so this is a viewing choice and nothing
 *  more. */
const HULL_W = 560
/** The portrait's own size, as a share of the hull — the chart's own figure,
 *  so what you place here is the size that will be drawn. */
const FACE = SHIP_CREW_FACE

type Slot = { x: number; y: number }

/** A sensible place to start: a row along the deck, so the first drag is an
 *  adjustment rather than a hunt for the ship. */
function defaultSlots(n: number): Slot[] {
  return Array.from({ length: n }, (_, i) => ({
    x: -0.18 + (n === 1 ? 0.18 : (i / (n - 1)) * 0.36),
    y: -0.02,
  }))
}

export default function CrewSlotBench() {
  const [tier, setTier] = useState(6)
  const [mirror, setMirror] = useState(false)
  const [grid, setGrid] = useState(true)
  const [slots, setSlots] = useState<Record<number, Slot[]>>(() =>
    Object.fromEntries(SHIPS.map(s => [s.tier, defaultSlots(EXPEDITION_SHIP_STATS[s.tier]?.crewSlots ?? 1)])))

  const ship = getShip(tier)
  const seats = EXPEDITION_SHIP_STATS[tier]?.crewSlots ?? 1
  const here = slots[tier] ?? defaultSlots(seats)

  const boxRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef<number | null>(null)

  // ── THE DRAG ────────────────────────────────────────────────────────────
  // On the WINDOW, not the slot: a pointer that leaves a 40px circle mid-drag
  // would otherwise drop it, which is most of a drag's life on a small target.
  const move = useCallback((e: PointerEvent) => {
    const i = dragging.current
    const box = boxRef.current
    if (i == null || !box) return
    const r = box.getBoundingClientRect()
    // Back out of the mirror, so dragging goes the way the pointer does even
    // while the view is flipped. The STORED number is always unmirrored.
    const raw = (e.clientX - (r.left + r.width / 2)) / r.width
    setSlots(prev => ({
      ...prev,
      [tier]: (prev[tier] ?? []).map((s, k) => k === i ? {
        x: Math.round((mirror ? -raw : raw) * 1000) / 1000,
        y: Math.round(((e.clientY - (r.top + r.height / 2)) / r.width) * 1000) / 1000,
      } : s),
    }))
  }, [tier, mirror])

  useEffect(() => {
    const up = () => { dragging.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [move])

  const table = SHIPS.map(s => {
    const rows = (slots[s.tier] ?? []).map(p => `{ x: ${p.x}, y: ${p.y} }`).join(', ')
    return `  ${s.tier}: [${rows}], // ${s.name}`
  }).join('\n')
  const out = `export const SHIP_CREW_SLOTS: Record<number, { x: number; y: number }[]> = {\n${table}\n}`

  return (
    <main style={{ minHeight: '100vh', background: '#070d14', color: '#e6eef5', padding: '1.2rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <h1 className="font-cinzel font-800" style={{ fontSize: '1.3rem', marginBottom: 4 }}>Crew slot bench</h1>
        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#8fa3b5', marginBottom: 14, lineHeight: 1.5 }}>
          Drag a face onto the deck. Numbers are fractions of the hull&apos;s width from its centre,
          y positive downward. Flip her to check the other tack — the view mirrors, the numbers do not.
        </p>

        {/* ── THE SHIP, AND HOW SHE IS BEING LOOKED AT ─────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          {SHIPS.filter(s => s.tier >= MIN_SHIP_TIER && s.tier <= MAX_SHIP_TIER).map(s => (
            <button key={s.tier} type="button" onClick={() => setTier(s.tier)}
              className="font-karla font-700"
              style={{
                padding: '0.4rem 0.75rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.74rem',
                background: tier === s.tier ? 'rgba(240,192,64,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${tier === s.tier ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.12)'}`,
                color: tier === s.tier ? '#f0c040' : '#b8c6d2',
              }}>
              {s.name} · {EXPEDITION_SHIP_STATS[s.tier]?.crewSlots ?? 1}
            </button>
          ))}
          <span style={{ width: 12 }} />
          <button type="button" onClick={() => setMirror(m => !m)} className="font-karla font-700"
            style={{
              padding: '0.4rem 0.75rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.74rem',
              background: mirror ? 'rgba(126,214,196,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${mirror ? 'rgba(126,214,196,0.6)' : 'rgba(255,255,255,0.12)'}`,
              color: mirror ? '#7ed6c4' : '#b8c6d2',
            }}>
            {mirror ? 'Facing ◀' : 'Facing ▶'}
          </button>
          <button type="button" onClick={() => setGrid(g => !g)} className="font-karla font-700"
            style={{
              padding: '0.4rem 0.75rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.74rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#b8c6d2',
            }}>
            Grid {grid ? 'on' : 'off'}
          </button>
          <button type="button" onClick={() => setSlots(p => ({ ...p, [tier]: defaultSlots(seats) }))}
            className="font-karla font-700"
            style={{
              padding: '0.4rem 0.75rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.74rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#b8c6d2',
            }}>
            Reset this ship
          </button>
        </div>

        {/* ── THE DECK ─────────────────────────────────────────────────────
            The hull is mirrored as a whole, exactly as the chart mirrors it,
            and the slots ride inside that mirror — which is the entire point
            of the flip: it shows where the faces actually land on the other
            tack rather than where you meant them to. */}
        <div ref={boxRef} style={{
          position: 'relative', width: HULL_W, height: HULL_W, margin: '0 auto',
          background: 'radial-gradient(ellipse 70% 50% at 50% 62%, #14384a 0%, #0a1c28 60%, #070d14 100%)',
          borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden',
          touchAction: 'none', userSelect: 'none',
        }}>
          {grid && (
            <>
              <div aria-hidden style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.18)' }} />
              <div aria-hidden style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.18)' }} />
              {[-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4].map(f => (
                <div key={`v${f}`} aria-hidden style={{ position: 'absolute', left: `${50 + f * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.06)' }} />
              ))}
              {[-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4].map(f => (
                <div key={`h${f}`} aria-hidden style={{ position: 'absolute', top: `${50 + f * 100}%`, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </>
          )}

          <div style={{
            position: 'absolute', inset: 0,
            transform: mirror ? 'scaleX(-1)' : 'none',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ship.seaImageUrl ?? ''} alt="" draggable={false} style={{
              position: 'absolute', left: '50%', top: '50%', width: HULL_W, maxWidth: 'none',
              transform: `translate(-50%, -50%)${ship.seaFlip ? ' scaleX(-1)' : ''}`,
              pointerEvents: 'none',
            }} />

            {here.map((s, i) => (
              <div key={i}
                onPointerDown={e => { e.preventDefault(); dragging.current = i }}
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: HULL_W * FACE, height: HULL_W * FACE,
                  marginLeft: s.x * HULL_W - (HULL_W * FACE) / 2,
                  marginTop: s.y * HULL_W - (HULL_W * FACE) / 2,
                  borderRadius: '50%', cursor: 'grab',
                  // Counter the deck's mirror so the FACE never reads
                  // backwards — exactly what the chart does with `--facing`.
                  transform: mirror ? 'scaleX(-1)' : 'none',
                  background: 'rgba(6,10,16,0.9)',
                  border: '1.5px solid rgba(126,214,196,0.85)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.75)',
                  display: 'grid', placeItems: 'center',
                  color: '#7ed6c4', fontSize: '0.9rem', fontWeight: 800,
                }}>
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* ── WHAT TO PASTE ─────────────────────────────────────────────── */}
        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: '#f0c040', margin: '16px 0 6px' }}>
          Seat 1 is the captain
        </p>
        <pre style={{
          background: '#040a10', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
          padding: '0.8rem', fontSize: '0.72rem', lineHeight: 1.6, overflowX: 'auto', color: '#cfe0ec',
        }}>{out}</pre>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(out) }}
          className="font-karla font-700"
          style={{
            marginTop: 8, padding: '0.5rem 0.9rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.74rem',
            background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f0c040',
          }}>
          Copy the table
        </button>
      </div>
    </main>
  )
}
