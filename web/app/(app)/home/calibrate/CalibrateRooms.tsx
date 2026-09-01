'use client'

// ── THE ROOM BENCH ──────────────────────────────────────────────────────────
//
// Where the furniture positions in lib/homestead actually come from.
//
// Placing them by reading numbers is hopeless and I tried it: the spots I wrote
// blind were guesses against eight freshly generated shells, and a hearth that
// is two percent low reads as a fireplace hovering off the floor. The only
// honest way is to drag the thing while looking at it, which is what this is.
//
// Same bench the shipyard's callouts already get (/shipyard/calibrate), for the
// same reason and with the same shape: drag, nudge with the arrow keys, then
// copy the table straight into the file it came from.
//
// ── EVERY SHELL, BECAUSE EVERY SHELL IS A DIFFERENT ROOM ────────────────────
//
// The five main shells were painted as one house growing, not one room
// redressed. They share a vanishing point and a horizon — that was locked in the
// prompt — but the floor line still climbs as the walls get taller and the
// panelling changes where a hearth can sit. So each carries its own row, and
// the picker steps through them without leaving the page.
//
// ── x, y IS THE BOTTOM CENTRE. w IS THE WIDTH. ──────────────────────────────
//
// The same three numbers the room renderer reads, in the same units: percent of
// the room box, with `y` the BOTTOM of the piece because everything in a room
// sits on something. A width handle rather than a height one for the same
// reason the art has no fixed height: the pieces are drawn to their own
// proportions and only their width is ours to choose.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ROOMS, ROOM_BY_ID, FURNITURE, FURNITURE_BY_SLOT, roomArt,
  type FurnitureSlot, type SlotSpot,
} from '@/lib/homestead'

/** Back to front, the same order the room paints in. */
const ORDER: FurnitureSlot[] = ['floor', 'hearth', 'mount', 'window', 'table', 'corner']

const HOUSE_NAMES = ['Lean-to', 'Cottage', 'Longhouse', 'Great hall', 'Estate']

type Row = Record<FurnitureSlot, SlotSpot>

export default function CalibrateRooms({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [tier, setTier] = useState(1)
  const [slot, setSlot] = useState<FurnitureSlot>('hearth')
  const [held, setHeld] = useState<FurnitureSlot | null>(null)
  const [copied, setCopied] = useState(false)

  const row = rows[tier]
  const main = ROOM_BY_ID.main

  /** Which art to show for a slot. The first option with a picture, so the
   *  bench is placing a REAL piece rather than an outline: a hearth is a
   *  different shape from a rug and the difference is the whole job. */
  const artFor = (s: FurnitureSlot): string | null =>
    FURNITURE_BY_SLOT[s].options.find(o => o.art)?.art ?? null

  const set = (s: FurnitureSlot, patch: Partial<SlotSpot>) => {
    setRows(prev => prev.map((r, i) => i === tier ? { ...r, [s]: { ...r[s], ...patch } } : r))
  }

  /** Pointer to percent, clamped and rounded to whole percent — the table is
   *  read by a human and 34 is a number, 33.8271 is noise. */
  const move = (e: React.PointerEvent, s: FurnitureSlot) => {
    const box = (e.currentTarget as HTMLElement).closest('[data-room]') as HTMLElement | null
    if (!box) return
    const r = box.getBoundingClientRect()
    set(s, {
      x: Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))),
    })
  }

  const nudge = (e: React.KeyboardEvent, s: FurnitureSlot) => {
    const step = e.shiftKey ? 5 : 1
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    const cur = rows[tier][s]
    set(s, {
      x: Math.max(0, Math.min(100, cur.x + m[0])),
      y: Math.max(0, Math.min(100, cur.y + m[1])),
    })
  }

  const pad = (n: number, w: number) => String(n).padStart(w)

  const source = useMemo(() => (
    'const MAIN_SPOTS: Record<FurnitureSlot, SlotSpot>[] = [\n'
    + rows.map((r, i) =>
      `  // ${HOUSE_NAMES[i]}\n`
      + `  { floor: { x: ${pad(r.floor.x, 2)}, y: ${pad(r.floor.y, 2)}, w: ${pad(r.floor.w, 2)} },`
      + ` hearth: { x: ${pad(r.hearth.x, 2)}, y: ${pad(r.hearth.y, 2)}, w: ${pad(r.hearth.w, 2)} },\n`
      + `    mount: { x: ${pad(r.mount.x, 2)}, y: ${pad(r.mount.y, 2)}, w: ${pad(r.mount.w, 2)} },`
      + ` table: { x: ${pad(r.table.x, 2)}, y: ${pad(r.table.y, 2)}, w: ${pad(r.table.w, 2)} },\n`
      + `    window: { x: ${pad(r.window.x, 2)}, y: ${pad(r.window.y, 2)}, w: ${pad(r.window.w, 2)} },`
      + ` corner: { x: ${pad(r.corner.x, 2)}, y: ${pad(r.corner.y, 2)}, w: ${pad(r.corner.w, 2)} } },`
    ).join('\n')
    + '\n]\n'
  ), [rows])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* the block below is selectable either way */ }
  }

  const cur = row[slot]

  return (
    <div style={{ padding: '1rem 1rem 4rem', maxWidth: '52rem', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#e6e2dc' }}>
          Room bench
        </h1>
        <Link href="/home" className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#8fb8cf' }}>
          To the homestead
        </Link>
      </div>
      <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(190,212,228,0.6)', margin: '4px 0 14px', lineHeight: 1.5 }}>
        Drag a piece to move it, arrow keys to nudge (shift for 5), and the slider sets its width.
        The dot you are dragging is the piece&rsquo;s BOTTOM CENTRE, because everything in a room stands on something.
        When it looks right, copy the table into <code>lib/homestead.ts</code>.
      </p>

      {/* ── WHICH SHELL ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {HOUSE_NAMES.map((n, i) => (
          <button key={n} type="button" onClick={() => setTier(i)}
            className="font-karla font-700"
            style={{
              padding: '0.36rem 0.7rem', borderRadius: 999, fontSize: '0.76rem', cursor: 'pointer',
              color: tier === i ? '#0d1520' : 'rgba(214,232,240,0.82)',
              background: tier === i ? '#f0c464' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${tier === i ? '#f0c464' : 'rgba(255,255,255,0.14)'}`,
            }}>{n}</button>
        ))}
      </div>

      {/* ── THE ROOM ── */}
      <div data-room style={{
        position: 'relative', width: '100%', aspectRatio: '1008 / 666',
        borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(180,214,232,0.2)',
        touchAction: 'none',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={roomArt(main, tier)} alt="" draggable={false} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        }} />
        {ORDER.map(s => {
          const art = artFor(s)
          const spot = row[s]
          const on = slot === s
          return (
            <div key={s} style={{
              position: 'absolute',
              left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`,
              transform: 'translate(-50%, -100%)',
              outline: on ? '2px dashed rgba(240,196,100,0.9)' : 'none',
              outlineOffset: 2,
            }}>
              {art
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={art} alt="" draggable={false} style={{ width: '100%', display: 'block', opacity: on ? 1 : 0.75 }} />
                : <div style={{ height: 24, background: 'rgba(240,196,100,0.25)' }} />}
            </div>
          )
        })}
        {/* THE HANDLES, over the art rather than in it: a drag target the size
            of a rug is a drag target you cannot aim, and the piece under it has
            to stay visible while you move it. */}
        {ORDER.map(s => {
          const spot = row[s]
          const on = slot === s
          return (
            <button key={s} type="button"
              aria-label={`${FURNITURE_BY_SLOT[s].label} handle`}
              onPointerDown={e => {
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                setSlot(s); setHeld(s)
              }}
              onPointerMove={e => { if (held === s) move(e, s) }}
              onPointerUp={() => setHeld(null)}
              onPointerCancel={() => setHeld(null)}
              onFocus={() => setSlot(s)}
              onKeyDown={e => nudge(e, s)}
              style={{
                position: 'absolute', left: `${spot.x}%`, top: `${spot.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 16, height: 16, borderRadius: '50%', padding: 0, cursor: 'grab',
                background: on ? '#f0c464' : 'rgba(240,196,100,0.4)',
                border: '2px solid rgba(10,16,22,0.85)',
              }} />
          )
        })}
      </div>

      {/* ── THE PIECE ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 8px' }}>
        {ORDER.map(s => (
          <button key={s} type="button" onClick={() => setSlot(s)}
            className="font-karla font-700"
            style={{
              padding: '0.34rem 0.66rem', borderRadius: 999, fontSize: '0.74rem', cursor: 'pointer',
              color: slot === s ? '#0d1520' : 'rgba(214,232,240,0.8)',
              background: slot === s ? '#8fd0e8' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${slot === s ? '#8fd0e8' : 'rgba(255,255,255,0.14)'}`,
            }}>{FURNITURE_BY_SLOT[s].label}</button>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0.7rem 0.8rem', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0c464', minWidth: 92 }}>
          {FURNITURE_BY_SLOT[slot].label}
        </span>
        <span className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(190,212,228,0.7)', fontVariantNumeric: 'tabular-nums' }}>
          x {cur.x} · y {cur.y} · w {cur.w}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          <span className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(190,212,228,0.55)' }}>Width</span>
          <input type="range" min={4} max={70} value={cur.w} style={{ flex: 1 }}
            onChange={e => set(slot, { w: Number(e.target.value) })} />
        </label>
      </div>

      {/* ── THE TABLE ── */}
      <button type="button" onClick={copy}
        className="font-karla font-700"
        style={{
          marginTop: 14, padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer',
          fontSize: '0.8rem', color: '#0d1520', background: '#f0c464', border: 'none',
        }}>
        {copied ? 'Copied' : 'Copy the table'}
      </button>

      <pre style={{
        marginTop: 10, padding: '0.8rem', borderRadius: 10, overflowX: 'auto',
        background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
        fontSize: '0.68rem', lineHeight: 1.5, color: '#cfe0ea',
      }}>{source}</pre>

      <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(190,212,228,0.45)', marginTop: 10, lineHeight: 1.5 }}>
        Only the main room is furnished. The gallery, the menagerie and the trophy room are filled
        by what you have done rather than what you bought, so they have nothing to place.
        {' '}Rooms open at house tier {ROOMS.filter(r => r.needsHouse > 0).map(r => `${r.needsHouse} ${r.name}`).join(', ')}.
      </p>
    </div>
  )
}
