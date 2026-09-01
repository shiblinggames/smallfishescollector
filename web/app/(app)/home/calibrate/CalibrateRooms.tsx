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
  MENAGERIE_SPOTS, MENAGERIE_FALLBACK,
  type FurnitureSlot, type SlotSpot, type PetSpot,
} from '@/lib/homestead'
import { PETS } from '@/lib/pets'

/** Back to front, the same order the room paints in. */
const ORDER: FurnitureSlot[] = ['floor', 'hearth', 'mount', 'cornerL', 'cornerR']

const HOUSE_NAMES = ['Lean-to', 'Cottage', 'Longhouse', 'Great hall', 'Estate']

type Row = Record<FurnitureSlot, SlotSpot>

type Content = { x: number; y: number; w: number }

export default function CalibrateRooms({ initial, contentInitial }: {
  initial: Row[]
  /** The content box for each of the three rooms that are not furnished. */
  contentInitial: Record<string, Content>
}) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [content, setContent] = useState<Record<string, Content>>(contentInitial)
  /**
   * ── AND THE ANIMALS ─────────────────────────────────────────────────────
   *
   * The menagerie does not get a content box like the gallery and the trophy
   * room do. Those flow a grid of things inside a rectangle; this one places
   * TWENTY named animals individually, because a pet standing somewhere chosen
   * is the whole difference between a room and a shelf.
   *
   * All twenty are on the bench whether or not anybody owns them, since the
   * table has to work for the captain who owns the lot.
   */
  const [spots, setSpots] = useState<Record<string, PetSpot>>(
    () => Object.fromEntries(PETS.map(p => [p.id, MENAGERIE_SPOTS[p.id] ?? MENAGERIE_FALLBACK])))
  const [petId, setPetId] = useState<string>(PETS[0].id)
  /** Which room is on the bench. The main room also picks a shell below. */
  const [roomId, setRoomId] = useState<string>('main')
  const [tier, setTier] = useState(1)
  const [slot, setSlot] = useState<FurnitureSlot>('hearth')
  const [held, setHeld] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const row = rows[tier]
  const main = ROOM_BY_ID.main
  const room = ROOMS.find(r => r.id === roomId) ?? main
  const isMain = room.id === 'main'
  const isPets = room.id === 'menagerie'
  const box = content[room.id] ?? { x: 50, y: 50, w: 76 }
  const pet = spots[petId] ?? MENAGERIE_FALLBACK

  const setPet = (patch: Partial<PetSpot>) =>
    setSpots(prev => ({ ...prev, [petId]: { ...(prev[petId] ?? MENAGERIE_FALLBACK), ...patch } }))

  const movePet = (e: React.PointerEvent, id: string) => {
    const el = (e.currentTarget as HTMLElement).closest('[data-room]') as HTMLElement | null
    if (!el) return
    const r = el.getBoundingClientRect()
    setSpots(prev => ({ ...prev, [id]: {
      ...(prev[id] ?? MENAGERIE_FALLBACK),
      x: Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))),
    } }))
  }

  const nudgePet = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    setPet({ x: Math.max(0, Math.min(100, pet.x + m[0])), y: Math.max(0, Math.min(100, pet.y + m[1])) })
  }

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

  const setBox = (patch: Partial<Content>) =>
    setContent(prev => ({ ...prev, [room.id]: { ...box, ...patch } }))

  /** The content box drags from its CENTRE, because what is being placed is a
   *  region rather than something standing on a floor. */
  const moveBox = (e: React.PointerEvent) => {
    const el = (e.currentTarget as HTMLElement).closest('[data-room]') as HTMLElement | null
    if (!el) return
    const r = el.getBoundingClientRect()
    setBox({
      x: Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))),
    })
  }

  const nudgeBox = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    setBox({ x: Math.max(0, Math.min(100, box.x + m[0])), y: Math.max(0, Math.min(100, box.y + m[1])) })
  }

  /**
   * ── SEEDING ONE FROM ANOTHER ────────────────────────────────────────────
   *
   * The five shells are one house growing and the four rooms share a vanishing
   * point, so the numbers are always CLOSE and never equal: the estate's hearth
   * is the cottage's hearth a few percent lower and a little wider. Placing each
   * from scratch means finding the same answer five times and getting five
   * slightly different ones, which reads as furniture that drifts about as you
   * upgrade rather than a house that grew around it.
   *
   * So copy the neighbour and correct it. That is the difference between five
   * placements and one placement plus four adjustments.
   */
  const copyFromShell = (from: number) => {
    setRows(prev => prev.map((r, i) => i === tier ? { ...prev[from] } : r))
  }

  const copyFromRoom = (from: string) => {
    const src = content[from]
    if (!src) return
    setContent(prev => ({ ...prev, [room.id]: { ...src } }))
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
      + ` cornerL: { x: ${pad(r.cornerL.x, 2)}, y: ${pad(r.cornerL.y, 2)}, w: ${pad(r.cornerL.w, 2)} },\n`
      + `    cornerR: { x: ${pad(r.cornerR.x, 2)}, y: ${pad(r.cornerR.y, 2)}, w: ${pad(r.cornerR.w, 2)} } },`
    ).join('\n')
    + '\n]\n\n'
    // AND THE TWO CONTENT BOXES, as the line to paste into each RoomDef. The
    // menagerie has none any more: it places its animals one at a time, below.
    + ROOMS.filter(r => r.id !== 'main' && r.id !== 'menagerie').map(r => {
      const b = content[r.id] ?? { x: 50, y: 50, w: 76 }
      return `// ${r.name}\ncontent: { x: ${b.x}, y: ${b.y}, w: ${b.w} },`
    }).join('\n')
    + '\n\nexport const MENAGERIE_SPOTS: Record<string, PetSpot> = {\n'
    + PETS.map(p => {
      const sp = spots[p.id] ?? MENAGERIE_FALLBACK
      // Quoted and padded exactly as the file has it, so the paste is a paste.
      return `  '${p.id}':${' '.repeat(Math.max(1, 18 - p.id.length))}`
        + `{ x: ${pad(sp.x, 2)}, y: ${pad(sp.y, 2)}, w: ${pad(sp.w, 2)}`
        + `${sp.flip ? ', flip: true' : ''} },`
    }).join('\n')
    + '\n}\n'
  ), [rows, content, spots])

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

      {/* ── WHICH ROOM ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {ROOMS.map(r => (
          <button key={r.id} type="button" onClick={() => setRoomId(r.id)}
            className="font-karla font-700"
            style={{
              padding: '0.36rem 0.7rem', borderRadius: 999, fontSize: '0.76rem', cursor: 'pointer',
              color: roomId === r.id ? '#0d1520' : 'rgba(214,232,240,0.82)',
              background: roomId === r.id ? '#8fd0e8' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${roomId === r.id ? '#8fd0e8' : 'rgba(255,255,255,0.14)'}`,
            }}>{r.name}</button>
        ))}
      </div>

      {/* ── WHICH SHELL ── only the main room has five of them. */}
      {isMain && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
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
      </div>}

      {/* ── COPY FROM ── the same three numbers, one shell or one room over.
          Buttons rather than a dropdown: there are at most four of them, and a
          menu for four things is a click you did not need. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(190,212,228,0.45)' }}>
          Copy from
        </span>
        {isMain
          ? HOUSE_NAMES.map((n, i) => i === tier ? null : (
            <button key={n} type="button" onClick={() => copyFromShell(i)}
              className="font-karla font-700"
              style={{
                padding: '0.28rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', cursor: 'pointer',
                color: 'rgba(214,232,240,0.7)', background: 'rgba(255,255,255,0.04)',
                border: '1px dashed rgba(255,255,255,0.2)',
              }}>{n}</button>
          ))
          : ROOMS.filter(r => r.id !== 'main' && r.id !== room.id).map(r => (
            <button key={r.id} type="button" onClick={() => copyFromRoom(r.id)}
              className="font-karla font-700"
              style={{
                padding: '0.28rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', cursor: 'pointer',
                color: 'rgba(214,232,240,0.7)', background: 'rgba(255,255,255,0.04)',
                border: '1px dashed rgba(255,255,255,0.2)',
              }}>{r.name}</button>
          ))}
      </div>

      {/* ── THE ROOM ── */}
      <div data-room style={{
        position: 'relative', width: '100%', aspectRatio: '1008 / 666',
        borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(180,214,232,0.2)',
        touchAction: 'none',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={roomArt(room, tier)} alt="" draggable={false} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        }} />
        {isMain && ORDER.map(s => {
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
        {/* ── THE CONTENT BOX ── for the three rooms that are not furnished.
            Drawn as its actual rectangle rather than a dot, because what is
            being placed is the AREA a grid of things flows inside and its width
            is most of the decision. */}
        {!isMain && !isPets && (
          <div style={{
            position: 'absolute', left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`,
            transform: 'translate(-50%, -50%)',
            aspectRatio: '3 / 1',
            border: '2px dashed rgba(240,196,100,0.9)',
            background: 'rgba(240,196,100,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#f0c464' }}>
              {room.name}
            </span>
          </div>
        )}
        {!isMain && !isPets && (
          <button type="button" aria-label="Content box handle"
            onPointerDown={e => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              setHeld('box')
            }}
            onPointerMove={e => { if (held === 'box') moveBox(e) }}
            onPointerUp={() => setHeld(null)}
            onPointerCancel={() => setHeld(null)}
            onKeyDown={nudgeBox}
            style={{
              position: 'absolute', left: `${box.x}%`, top: `${box.y}%`,
              transform: 'translate(-50%, -50%)',
              width: 18, height: 18, borderRadius: '50%', padding: 0, cursor: 'grab',
              background: '#f0c464', border: '2px solid rgba(10,16,22,0.85)',
            }} />
        )}

        {/* ── THE ANIMALS ──────────────────────────────────────────────
            Drawn with the room's own transform, feet-anchored, sorted back to
            front by y. What you see here is what RoomView renders, minus the
            turning: a bench that previewed them mirrored at random would make
            placing them a game of chance. */}
        {isPets && [...PETS]
          .sort((a, b) => (spots[a.id] ?? MENAGERIE_FALLBACK).y - (spots[b.id] ?? MENAGERIE_FALLBACK).y)
          .map(p => {
            const sp = spots[p.id] ?? MENAGERIE_FALLBACK
            const on = petId === p.id
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.restImageUrl} alt="" draggable={false} style={{
                position: 'absolute',
                left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`,
                transform: `translate(-50%, -100%) scaleX(${sp.flip ? -1 : 1})`,
                transformOrigin: 'center bottom',
                filter: on
                  ? 'drop-shadow(0 0 6px rgba(240,196,100,0.95)) drop-shadow(0 3px 6px rgba(0,0,0,0.35))'
                  : 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
                opacity: on ? 1 : 0.85,
              }} />
            )
          })}
        {isPets && PETS.map(p => {
          const sp = spots[p.id] ?? MENAGERIE_FALLBACK
          const on = petId === p.id
          return (
            <button key={p.id} type="button" aria-label={`${p.name} handle`}
              onPointerDown={e => {
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                setPetId(p.id); setHeld(p.id)
              }}
              onPointerMove={e => { if (held === p.id) movePet(e, p.id) }}
              onPointerUp={() => setHeld(null)}
              onPointerCancel={() => setHeld(null)}
              onFocus={() => setPetId(p.id)}
              onKeyDown={nudgePet}
              style={{
                position: 'absolute', left: `${sp.x}%`, top: `${sp.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 13, height: 13, borderRadius: '50%', padding: 0, cursor: 'grab',
                background: on ? '#f0c464' : 'rgba(240,196,100,0.35)',
                border: '2px solid rgba(10,16,22,0.85)',
              }} />
          )
        })}

        {/* THE HANDLES, over the art rather than in it: a drag target the size
            of a rug is a drag target you cannot aim, and the piece under it has
            to stay visible while you move it. */}
        {isMain && ORDER.map(s => {
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

      {/* ── WHICH ANIMAL ── */}
      {isPets && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '12px 0 8px' }}>
        {PETS.map(p => (
          <button key={p.id} type="button" onClick={() => setPetId(p.id)}
            className="font-karla font-700"
            style={{
              padding: '0.28rem 0.56rem', borderRadius: 999, fontSize: '0.7rem', cursor: 'pointer',
              color: petId === p.id ? '#0d1520' : 'rgba(214,232,240,0.78)',
              background: petId === p.id ? '#8fd0e8' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${petId === p.id ? '#8fd0e8' : 'rgba(255,255,255,0.14)'}`,
            }}>{p.name}</button>
        ))}
      </div>}

      {/* ── THE PIECE ── */}
      {isMain && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 8px' }}>
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
      </div>}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0.7rem 0.8rem', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {/* ONE READOUT AND ONE SLIDER, pointed at whatever is selected — the
            furniture piece in the main room, the content box in the others. Two
            sets of controls for the same three numbers would be two places to
            look for the same answer. */}
        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0c464', minWidth: 92 }}>
          {isMain ? FURNITURE_BY_SLOT[slot].label
            : isPets ? (PETS.find(p => p.id === petId)?.name ?? petId)
              : room.name}
        </span>
        <span className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(190,212,228,0.7)', fontVariantNumeric: 'tabular-nums' }}>
          x {isMain ? cur.x : isPets ? pet.x : box.x}
          {' · '}y {isMain ? cur.y : isPets ? pet.y : box.y}
          {' · '}w {isMain ? cur.w : isPets ? pet.w : box.w}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          <span className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(190,212,228,0.55)' }}>Width</span>
          {/* A PET TOPS OUT AT 30. The slider running to 100 for an animal makes
              the useful range a third of its travel, and every pet in this room
              lives between 5 and 15. */}
          <input type="range" min={isPets ? 2 : 4} max={isPets ? 30 : 100}
            value={isMain ? cur.w : isPets ? pet.w : box.w} style={{ flex: 1 }}
            onChange={e => {
              const w = Number(e.target.value)
              if (isMain) set(slot, { w }); else if (isPets) setPet({ w }); else setBox({ w })
            }} />
        </label>
        {/* WHICH WAY IT LOOKS. A placement rather than a behaviour: the room
            never turns anything, so this is decided here, once, by eye.
            `|| undefined` rather than `false`, so an unflipped pet emits no
            flip key at all and the table stays readable. */}
        {isPets && (
          <button type="button"
            onClick={() => setPet({ flip: !pet.flip || undefined })}
            className="font-karla font-700"
            style={{
              padding: '0.3rem 0.66rem', borderRadius: 999, fontSize: '0.74rem', cursor: 'pointer',
              color: pet.flip ? '#0d1520' : 'rgba(214,232,240,0.8)',
              background: pet.flip ? '#f0c464' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${pet.flip ? '#f0c464' : 'rgba(255,255,255,0.14)'}`,
            }}>
            {pet.flip ? 'Facing left' : 'Facing right'}
          </button>
        )}
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
        The main room places FURNITURE, one piece at a time. The other three place a single BOX —
        the area their contents flow inside, since a badge wall holds however many badges you have
        earned and a menagerie however many pets. Drag its dot to move it, the slider to size it.
        {' '}Rooms open at house tier {ROOMS.filter(r => r.needsHouse > 0).map(r => `${r.needsHouse} for ${r.name.toLowerCase()}`).join(', ')}.
      </p>
    </div>
  )
}
