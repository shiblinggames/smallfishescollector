'use client'

// ── THE EXPEDITION CHART BENCH ──────────────────────────────────────────────
//
// A plan view of every pixel of water past the reef, at true scale, where the
// bays and the junction can be dragged around and anything else can be marked
// with a pin or a wall.
//
// ── WHY A BENCH AND NOT MORE GUESSING ───────────────────────────────────────
//
// The raid water is a disc of 20,000 around the harbour — 40,000 across — and
// the campaign was laid out on one arc of it, which left the whole of the east
// and the west empty. That is not a thing you can see from the deck: on the
// chart you sail you can see about eight hundred pixels at a time, so the shape
// of the whole is invisible from inside it, and every layout decision so far has
// been made by writing numbers and finding out afterwards.
//
// So: the real constants, the real geometry, at true scale, and dragging.
//
// ── IT IS THE REAL MATHS, NOT A DRAWING OF IT ───────────────────────────────
//
// Every shape here is computed by the functions the water itself uses —
// `bayCentre`, `mouthOf`, `entryOf`, `straitLen` — from the same module. If this
// file ever disagrees with the sea, the bench is lying and the numbers it prints
// are worthless. There is no second copy of the geometry.
//
// Admin only, linked from nowhere, writes nothing to the database. Drag, then
// paste what it prints.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  NORTH_WALL, EXP_ORIGIN, EXP_EDGE, RAID_EDGE, SORTIE, PLACES,
} from '../../chart'
import {
  HUB, HUB_R, BAYS, bayCentre, mouthOf, entryOf, straitLen,
} from '../../raidWaters'

/** A bay as the bench holds it: the four numbers that place it, plus its name
 *  and colour so the plan reads like the water does. */
type BayPlan = {
  id: string
  name: string
  /** Degrees, because a bench is read by a person. Converted on the way out. */
  bearing: number
  at: number
  r: number
  half: number
  sea: string
}

/**
 * A PIN, AND WHAT KIND OF THING IT MARKS.
 *
 * A boss is not "a place where something goes". It is the thing a whole bay is
 * built around — everything else in that water is arranged relative to it, and
 * it is the one mark whose position decides where the gate goes, where the way
 * home opens and how long the run in has to be. So it is its own kind, its own
 * colour and its own shape, and the output lists them separately.
 */
type PinKind = 'spot' | 'boss'
type Pin = { id: number; kind: PinKind; x: number; y: number; label: string }
type Wall = { id: number; x1: number; y1: number; x2: number; y2: number; label: string }

const DEG = (rad: number) => (rad * 180) / Math.PI
const RAD = (deg: number) => (deg * Math.PI) / 180

/** The plan's world box: the whole sail limit, plus a margin so the rim is not
 *  flush to the edge. */
const PAD = 900
const X0 = -RAID_EDGE - PAD
const X1 = RAID_EDGE + PAD
const Y0 = EXP_ORIGIN.y - RAID_EDGE - PAD
const Y1 = NORTH_WALL + PAD

const STORE = 'sea-chart-bench-v1'

export default function ChartBench() {
  const [bays, setBays] = useState<BayPlan[]>(() => BAYS.map(b => ({
    id: b.id, name: b.name, bearing: Math.round(DEG(b.bearing)),
    at: b.at, r: b.r, half: b.half, sea: b.sea[1],
  })))
  const [hub, setHub] = useState({ x: HUB.x, y: HUB.y, r: HUB_R })
  const [pins, setPins] = useState<Pin[]>([])
  const [walls, setWalls] = useState<Wall[]>([])
  const [tool, setTool] = useState<'move' | 'pin' | 'boss' | 'wall'>('move')
  /** The first click of a wall, waiting for its second. */
  const [wallFrom, setWallFrom] = useState<{ x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const drag = useRef<
    | { kind: 'bay'; id: string }
    | { kind: 'bayR'; id: string }
    | { kind: 'hub' }
    | { kind: 'hubR' }
    | { kind: 'pin'; id: number }
    | { kind: 'wallEnd'; id: number; end: 1 | 2 }
    | null
  >(null)

  // ── WHAT THE BENCH REMEMBERS ──────────────────────────────────────────
  // localStorage, because losing twenty minutes of placement to a stray reload
  // is the one thing that would stop this being used. It is a per-browser
  // convenience and nothing more: the output box is the real artefact.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE)
      if (!raw) return
      const v = JSON.parse(raw)
      if (v.bays) setBays(v.bays)
      if (v.hub) setHub(v.hub)
      if (v.pins) setPins(v.pins)
      if (v.walls) setWalls(v.walls)
    } catch { /* a bench that cannot restore just starts fresh */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ bays, hub, pins, walls })) } catch { /* full or blocked */ }
  }, [bays, hub, pins, walls])

  /** Screen → world. The SVG carries a world viewBox, so this is the browser's
   *  own inverse transform rather than arithmetic that could drift from it. */
  const toWorld = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = pt.matrixTransform(m.inverse())
    return { x: Math.round(p.x), y: Math.round(p.y) }
  }, [])

  /** Where each bay sits right now, run through the water's OWN geometry. */
  const laid = useMemo(() => bays.map(b => {
    const spec = { ...b, bearing: RAD(b.bearing), chapter: 0, sea: ['', '', ''] as [string, string, string], rocks: 'reef' as const }
    return { b, c: bayCentre(spec), m: mouthOf(spec), e: entryOf(spec), len: straitLen(spec) }
  }), [bays])

  /**
   * ── WHICH BAY A POINT FELL IN, AND WHERE IT SITS INSIDE IT ────────────────
   *
   * A wall drawn across a bay and a pin dropped on its boss are not world
   * coordinates, they are facts ABOUT that bay: move the bay and they have to
   * move with it, exactly as every isle, ship and gate in the real water does.
   * So anything inside a bay is reported in that bay's own along/across, which
   * is what the tables out there are actually written in, and only the loose
   * ones in open sea stay as raw x/y.
   *
   * `along` runs from the point the strait enters, up the bay's axis, so a
   * number here means the same thing it means in raidWaters.
   */
  const inBay = useCallback((x: number, y: number) => {
    for (const l of laid) {
      if (Math.hypot(x - l.c.x, y - l.c.y) > l.b.r) continue
      const th = RAD(l.b.bearing)
      const ux = Math.cos(th), uy = Math.sin(th)
      const dx = x - l.e.x, dy = y - l.e.y
      return {
        bay: l.b,
        along: Math.round(dx * ux + dy * uy),
        across: Math.round(dx * -uy + dy * ux),
      }
    }
    return null
  }, [laid])

  /** Everything the layout can be wrong about, measured live. The gate refuses
   *  these at build time; finding out here costs a glance instead of a run. */
  const faults = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < laid.length; i++) {
      const a = laid[i]
      if (a.len < 400) out.push(`${a.b.name}: the bay has eaten its strait (${a.len.toFixed(0)} long)`)
      const reach = Math.hypot(a.c.x - EXP_ORIGIN.x, a.c.y - EXP_ORIGIN.y) + a.b.r
      if (reach > RAID_EDGE) out.push(`${a.b.name}: reaches ${reach.toFixed(0)}, past the sail limit of ${RAID_EDGE}`)
      if (a.c.y > NORTH_WALL - a.b.r) out.push(`${a.b.name}: hangs over the reef`)
      for (let j = i + 1; j < laid.length; j++) {
        const z = laid[j]
        const d = Math.hypot(z.c.x - a.c.x, z.c.y - a.c.y) - a.b.r - z.b.r
        if (d < 0) out.push(`${a.b.name} and ${z.b.name} share water (${(-d).toFixed(0)} of overlap)`)
        else if (d < 500) out.push(`${a.b.name} and ${z.b.name} are only ${d.toFixed(0)} apart`)
      }
      const fromHub = Math.hypot(a.c.x - hub.x, a.c.y - hub.y)
      if (fromHub - a.b.r < hub.r) out.push(`${a.b.name} overlaps the junction`)
    }
    return out
  }, [laid, hub])

  // ── DRAGGING ──────────────────────────────────────────────────────────
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const w = toWorld(e)
      setCursor(w)
      const d = drag.current
      if (!d) return
      if (d.kind === 'hub') setHub(h => ({ ...h, x: w.x, y: w.y }))
      else if (d.kind === 'hubR') setHub(h => ({ ...h, r: Math.max(600, Math.round(Math.hypot(w.x - h.x, w.y - h.y))) }))
      else if (d.kind === 'pin') setPins(ps => ps.map(p => p.id === d.id ? { ...p, x: w.x, y: w.y } : p))
      else if (d.kind === 'wallEnd') {
        setWalls(ws => ws.map(x => x.id !== d.id ? x
          : d.end === 1 ? { ...x, x1: w.x, y1: w.y } : { ...x, x2: w.x, y2: w.y }))
      } else if (d.kind === 'bay') {
        // A BAY IS A BEARING AND A DISTANCE FROM THE JUNCTION, not a point, so
        // dragging one is really turning it and pushing it out. Doing it in
        // those two numbers is what keeps the strait attached: a free x/y would
        // let a bay drift off the end of its own road.
        setBays(bs => bs.map(b => b.id !== d.id ? b : {
          ...b,
          bearing: Math.round(DEG(Math.atan2(w.y - hub.y, w.x - hub.x))),
          at: Math.max(hub.r + b.r + 500, Math.round(Math.hypot(w.x - hub.x, w.y - hub.y))),
        }))
      } else if (d.kind === 'bayR') {
        setBays(bs => bs.map(b => {
          if (b.id !== d.id) return b
          const c = laid.find(l => l.b.id === b.id)!.c
          return { ...b, r: Math.max(900, Math.round(Math.hypot(w.x - c.x, w.y - c.y))) }
        }))
      }
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [toWorld, hub, laid])

  /**
   * A NEW BAY, at the cursor.
   *
   * The bench started as a way to nudge the four that exist, which is only half
   * a bench: the thing actually being decided is how many stretches of water
   * this sea has and where they are, and a tool that cannot add one can only
   * ever rearrange the answer it was given.
   *
   * It drops where you last had the pointer, so a bay lands in the empty water
   * you were looking at rather than at some default the maths picked.
   */
  function addBay() {
    const w = cursor ?? { x: hub.x + 9000, y: hub.y }
    const at = Math.max(hub.r + 3800, Math.round(Math.hypot(w.x - hub.x, w.y - hub.y)))
    const n = bays.length + 1
    setBays(bs => [...bs, {
      id: `new_${n}`, name: `New water ${n}`,
      bearing: Math.round(DEG(Math.atan2(w.y - hub.y, w.x - hub.x))),
      at, r: 3000, half: 460, sea: '#26454e',
    }])
  }

  function onCanvas(e: React.PointerEvent) {
    if (tool === 'move') return
    const w = toWorld(e)
    if (tool === 'pin' || tool === 'boss') {
      const kind: PinKind = tool === 'boss' ? 'boss' : 'spot'
      const here = inBay(w.x, w.y)
      setPins(ps => [...ps, {
        id: Date.now(), kind, x: w.x, y: w.y,
        label: kind === 'boss'
          ? (here ? `${here.bay.name} boss` : `Boss ${ps.filter(q => q.kind === 'boss').length + 1}`)
          : `Pin ${ps.filter(q => q.kind === 'spot').length + 1}`,
      }])
      return
    }
    if (!wallFrom) { setWallFrom(w); return }
    setWalls(ws => [...ws, {
      id: Date.now(), x1: wallFrom.x, y1: wallFrom.y, x2: w.x, y2: w.y,
      label: `Wall ${ws.length + 1}`,
    }])
    setWallFrom(null)
  }

  const out = useMemo(() => {
    const lines: string[] = []
    lines.push(`HUB = { x: ${hub.x}, y: ${hub.y} }   HUB_R = ${hub.r}`)
    lines.push('')
    lines.push('BAYS:')
    for (const l of laid) {
      lines.push(`  ${l.b.id.padEnd(16)} bearing: D(${l.b.bearing}), at: ${l.b.at}, r: ${l.b.r}, half: ${l.b.half}`
        + `      // centre ${l.c.x.toFixed(0)},${l.c.y.toFixed(0)}  strait ${l.len.toFixed(0)} long`)
    }
    // ANYTHING INSIDE A BAY IS REPORTED IN THAT BAY'S OWN SPACE, because that
    // is what every table out in the water is written in — a world coordinate
    // for something standing in a bay is a number that stops being true the
    // moment the bay moves.
    const where = (x: number, y: number) => {
      const h = inBay(x, y)
      return h ? `${h.bay.id}: along ${h.along}, across ${h.across}` : `open sea: ${x}, ${y}`
    }

    const bosses = pins.filter(p => p.kind === 'boss')
    const spots = pins.filter(p => p.kind === 'spot')
    if (bosses.length) {
      lines.push('')
      lines.push('BOSSES:')
      for (const p of bosses) lines.push(`  ${p.label.padEnd(22)} ${where(p.x, p.y)}`)
    }
    if (spots.length) {
      lines.push('')
      lines.push('PINS:')
      for (const p of spots) lines.push(`  ${p.label.padEnd(22)} ${where(p.x, p.y)}`)
    }
    if (walls.length) {
      lines.push('')
      lines.push('WALLS:')
      for (const wl of walls) {
        const a = inBay(wl.x1, wl.y1), b = inBay(wl.x2, wl.y2)
        const len = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1).toFixed(0)
        // A WALL WITH BOTH ENDS IN ONE BAY IS A GATE. That is the shape the
        // water already has for "you may not pass here yet" — a line across a
        // bay at a distance up it — so it is reported as one, which is a thing
        // that can be typed straight into GATES.
        if (a && b && a.bay.id === b.bay.id) {
          const acrossBay = Math.abs(a.across - b.across) > Math.abs(a.along - b.along)
          lines.push(`  ${wl.label.padEnd(22)} ${a.bay.id}: ${acrossBay ? 'GATE at along ' + Math.round((a.along + b.along) / 2) : 'wall'}`
            + `  (${a.along},${a.across} -> ${b.along},${b.across})   // ${len} long`)
        } else {
          lines.push(`  ${wl.label.padEnd(22)} open sea: ${wl.x1},${wl.y1} -> ${wl.x2},${wl.y2}   // ${len} long`)
        }
      }
    }
    return lines.join('\n')
  }, [hub, laid, pins, walls, inBay])

  const H = 640
  return (
    <div style={{ padding: '1rem', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
        <h1 className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f4ecd8', margin: 0 }}>
          The expedition chart bench
        </h1>
        <Link href="/sea/calibrate" className="font-karla" style={{ fontSize: '0.8rem', color: '#7fc8de' }}>
          ← the island bench
        </Link>
      </div>

      <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(190,212,228,0.7)', margin: '0 0 0.9rem', lineHeight: 1.55 }}>
        Every pixel of water past the reef, at true scale. Drag a bay to turn it and push it out;
        drag the small handle on its rim to resize it. Drop pins where you want things and draw
        walls where you want the water divided, then send me what the box at the bottom prints.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {(['move', 'pin', 'boss', 'wall'] as const).map(t => (
          <button key={t} type="button" onClick={() => { setTool(t); setWallFrom(null) }}
            className="font-karla font-700" style={{
              padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.78rem',
              background: tool === t ? 'rgba(240,192,64,0.18)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${tool === t ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.12)'}`,
              color: tool === t ? '#f6dfa0' : 'rgba(200,216,228,0.7)', cursor: 'pointer',
            }}>
            {t === 'move' ? 'Move things'
              : t === 'pin' ? 'Drop pins'
              : t === 'boss' ? 'Mark a boss'
              : 'Draw walls'}
          </button>
        ))}
        <button type="button" onClick={addBay}
          className="font-karla font-700" style={{
            padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.78rem',
            background: 'rgba(120,200,150,0.14)', border: '1px solid rgba(120,200,150,0.4)',
            color: '#9fe0b6', cursor: 'pointer',
          }}>Add a bay here</button>
        <button type="button" onClick={() => { setPins([]); setWalls([]); setWallFrom(null) }}
          className="font-karla" style={{
            padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.78rem',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(200,216,228,0.7)', cursor: 'pointer',
          }}>Clear pins and walls</button>
        <button type="button" onClick={() => {
          setBays(BAYS.map(b => ({
            id: b.id, name: b.name, bearing: Math.round(DEG(b.bearing)),
            at: b.at, r: b.r, half: b.half, sea: b.sea[1],
          })))
          setHub({ x: HUB.x, y: HUB.y, r: HUB_R })
        }} className="font-karla" style={{
          padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.78rem',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(200,216,228,0.7)', cursor: 'pointer',
        }}>Back to what is live</button>
        <span className="font-karla" style={{
          alignSelf: 'center', fontSize: '0.76rem', color: 'rgba(190,212,228,0.55)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {cursor ? `${cursor.x}, ${cursor.y}` : '—'}
          {tool === 'wall' && wallFrom ? '   (click the far end)' : ''}
        </span>
      </div>

      <svg ref={svgRef}
        viewBox={`${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}`}
        onPointerDown={onCanvas}
        style={{
          width: '100%', height: H, display: 'block', borderRadius: 14,
          background: '#0a1017', border: '1px solid rgba(180,214,232,0.2)',
          cursor: tool === 'move' ? 'default' : 'crosshair', touchAction: 'none',
        }}>

        {/* THE SAIL LIMIT. Everything has to fit inside this and nothing says so
            until you are pressed against it out on the water. */}
        <circle cx={EXP_ORIGIN.x} cy={EXP_ORIGIN.y} r={RAID_EDGE}
          fill="rgba(30,60,84,0.22)" stroke="rgba(180,214,232,0.35)" strokeWidth={60} strokeDasharray="300 240" />

        {/* THE REEF, which is the south wall of this whole sea. */}
        <line x1={X0} y1={NORTH_WALL} x2={X1} y2={NORTH_WALL}
          stroke="rgba(226,138,120,0.5)" strokeWidth={70} />
        <text x={X0 + 400} y={NORTH_WALL - 260} fill="rgba(226,138,120,0.75)" fontSize={440}>the reef</text>

        {/* THE ANCHORAGE and its ports. */}
        <circle cx={EXP_ORIGIN.x} cy={EXP_ORIGIN.y} r={EXP_EDGE}
          fill="rgba(60,96,120,0.35)" stroke="rgba(196,169,106,0.5)" strokeWidth={50} />
        {PLACES.filter(p => p.kind === 'port' && p.y < NORTH_WALL).map(p => (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y} r={p.r} fill="rgba(240,192,64,0.5)" />
            <text x={p.x} y={p.y - p.r - 160} fill="rgba(244,236,216,0.8)" fontSize={330} textAnchor="middle">
              {p.name}
            </text>
          </g>
        ))}
        <circle cx={SORTIE.x} cy={SORTIE.y} r={220} fill="#f0c040" />
        <text x={SORTIE.x} y={SORTIE.y - 420} fill="#f6dfa0" fontSize={380} textAnchor="middle">the sortie</text>

        {/* THE JUNCTION. */}
        <circle cx={hub.x} cy={hub.y} r={hub.r}
          fill="rgba(120,170,196,0.16)" stroke="rgba(120,170,196,0.5)" strokeWidth={50} strokeDasharray="240 200" />
        <circle cx={hub.x} cy={hub.y} r={300} fill="rgba(150,208,244,0.9)"
          style={{ cursor: 'grab', pointerEvents: tool === 'move' ? undefined : 'none' }}
          onPointerDown={e => { e.stopPropagation(); drag.current = { kind: 'hub' } }} />
        <circle cx={hub.x + hub.r} cy={hub.y} r={220} fill="rgba(150,208,244,0.6)"
          style={{ cursor: 'ew-resize', pointerEvents: tool === 'move' ? undefined : 'none' }}
          onPointerDown={e => { e.stopPropagation(); drag.current = { kind: 'hubR' } }} />
        <text x={hub.x} y={hub.y - hub.r - 260} fill="rgba(190,232,255,0.85)" fontSize={400} textAnchor="middle">
          the junction
        </text>

        {/* THE BAYS AND THEIR STRAITS. */}
        {laid.map(({ b, c, m, e, len }) => {
          const ux = Math.cos(RAD(b.bearing)), uy = Math.sin(RAD(b.bearing))
          const px = -uy, py = ux
          return (
            // ── A BAY DOES NOT TAKE THE POINTER UNLESS YOU ARE MOVING ONE ──
            //
            // The bays cover most of the water, so with a pin or a wall in hand
            // every click that mattered landed on a bay and selected it instead
            // — the two tools were unusable anywhere you would actually want to
            // use them, which is inside a bay.
            //
            // Turning the whole group off is the fix rather than guarding each
            // handler: a shape with pointer-events none is not merely ignored,
            // it is not hit-tested at all, so the click reaches the canvas
            // underneath and lands exactly where the cursor says it will.
            <g key={b.id} style={{ pointerEvents: tool === 'move' ? undefined : 'none' }}>
              {/* The strait, as its real box. */}
              <polygon
                points={[
                  [m.x + px * b.half, m.y + py * b.half],
                  [m.x + ux * len + px * b.half, m.y + uy * len + py * b.half],
                  [m.x + ux * len - px * b.half, m.y + uy * len - py * b.half],
                  [m.x - px * b.half, m.y - py * b.half],
                ].map(q => q.map(n => n.toFixed(0)).join(',')).join(' ')}
                fill="rgba(180,214,232,0.16)" stroke="rgba(180,214,232,0.35)" strokeWidth={40} />
              <circle cx={c.x} cy={c.y} r={b.r}
                fill={`${b.sea}bb`}
                stroke={sel === b.id ? 'rgba(240,192,64,0.95)' : 'rgba(196,169,106,0.55)'}
                strokeWidth={sel === b.id ? 90 : 55}
                style={{ cursor: 'grab' }}
                onPointerDown={ev => {
                  ev.stopPropagation()
                  setSel(b.id)
                  drag.current = { kind: 'bay', id: b.id }
                }} />
              {/* The radius handle, on the rim away from the strait so it is
                  never under the shape it resizes. */}
              <circle cx={c.x + ux * b.r} cy={c.y + uy * b.r} r={240}
                fill="rgba(240,192,64,0.85)" style={{ cursor: 'nwse-resize' }}
                onPointerDown={ev => { ev.stopPropagation(); drag.current = { kind: 'bayR', id: b.id } }} />
              <text x={c.x} y={c.y} fill="rgba(244,236,216,0.96)" fontSize={430} textAnchor="middle">
                {b.name}
              </text>
              <text x={c.x} y={c.y + 480} fill="rgba(196,169,106,0.8)" fontSize={330} textAnchor="middle">
                {b.bearing}° · {b.at} out · r {b.r}
              </text>
              {/* Where the entry actually is, which is the thing that is easiest
                  to get wrong by eye. */}
              <circle cx={e.x} cy={e.y} r={130} fill="rgba(255,255,255,0.55)" />
            </g>
          )
        })}

        {/* WALLS YOU HAVE DRAWN. */}
        {walls.map(wl => (
          <g key={wl.id} style={{ pointerEvents: tool === 'move' ? undefined : 'none' }}>
            <line x1={wl.x1} y1={wl.y1} x2={wl.x2} y2={wl.y2}
              stroke="rgba(226,138,120,0.9)" strokeWidth={120} strokeLinecap="round" />
            <circle cx={wl.x1} cy={wl.y1} r={220} fill="rgba(226,138,120,0.9)" style={{ cursor: 'grab' }}
              onPointerDown={ev => { ev.stopPropagation(); drag.current = { kind: 'wallEnd', id: wl.id, end: 1 } }} />
            <circle cx={wl.x2} cy={wl.y2} r={220} fill="rgba(226,138,120,0.9)" style={{ cursor: 'grab' }}
              onPointerDown={ev => { ev.stopPropagation(); drag.current = { kind: 'wallEnd', id: wl.id, end: 2 } }} />
            <text x={(wl.x1 + wl.x2) / 2} y={(wl.y1 + wl.y2) / 2 - 240}
              fill="rgba(250,200,190,0.9)" fontSize={330} textAnchor="middle">{wl.label}</text>
          </g>
        ))}
        {wallFrom && (
          <circle cx={wallFrom.x} cy={wallFrom.y} r={220} fill="rgba(226,138,120,0.6)" />
        )}

        {/* PINS YOU HAVE DROPPED. */}
        {pins.map(p => {
          const boss = p.kind === 'boss'
          const c = boss ? 'rgba(232,86,74,0.95)' : 'rgba(150,232,180,0.9)'
          const R = boss ? 420 : 260
          return (
            <g key={p.id} style={{ pointerEvents: tool === 'move' ? undefined : 'none' }}>
              {/* A BOSS IS A DIAMOND AND EVERYTHING ELSE IS A ROUND DOT, on the
                  chart's own rule: shape carries the meaning and colour only
                  reinforces it, because at a glance two colours of the same
                  circle are one circle. */}
              {boss ? (
                <polygon
                  points={`${p.x},${p.y - R} ${p.x + R},${p.y} ${p.x},${p.y + R} ${p.x - R},${p.y}`}
                  fill={c} style={{ cursor: 'grab' }}
                  onPointerDown={ev => { ev.stopPropagation(); drag.current = { kind: 'pin', id: p.id } }} />
              ) : (
                <circle cx={p.x} cy={p.y} r={R} fill={c} style={{ cursor: 'grab' }}
                  onPointerDown={ev => { ev.stopPropagation(); drag.current = { kind: 'pin', id: p.id } }} />
              )}
              <text x={p.x} y={p.y - R - 180} fill={boss ? 'rgba(250,190,182,0.95)' : 'rgba(190,244,210,0.95)'}
                fontSize={boss ? 400 : 360} textAnchor="middle">{p.label}</text>
            </g>
          )
        })}
      </svg>

      {/* ── WHAT IS WRONG WITH IT RIGHT NOW ──────────────────────────────
          The build gate refuses all of this; finding out here costs a glance
          instead of a run, which is the difference between a bench and a form. */}
      <div style={{ marginTop: '0.8rem', minHeight: 26 }}>
        {faults.length === 0 ? (
          <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#8fdc9a', margin: 0 }}>
            Nothing overlaps, nothing is past the sail limit, every strait still has water in it.
          </p>
        ) : faults.map((f, i) => (
          <p key={i} className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#e6a0a0', margin: '0 0 2px' }}>{f}</p>
        ))}
      </div>

      {/* ── THE BAYS, NAMEABLE AND REMOVABLE ─────────────────────────────
          A bench that can add a stretch of water and not take one away can only
          grow the answer. The four that are live keep their ids; a new one gets
          a placeholder you should rename, because the id is what every table in
          raidWaters keys off and `new_2` is not a chapter. */}
      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.4rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {laid.map(({ b, len }) => (
          <Row key={b.id} colour={b.sea} value={b.name}
            onChange={v => setBays(bs => bs.map(q => q.id === b.id ? { ...q, name: v } : q))}
            onDelete={() => setBays(bs => bs.filter(q => q.id !== b.id))}
            note={`${b.bearing}° · ${b.at} · r${b.r} · strait ${len.toFixed(0)}`} />
        ))}
      </div>

      {/* ── THE LIST, editable, because a pin nobody named is a pin nobody can
          act on. */}
      {(pins.length > 0 || walls.length > 0) && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.4rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {pins.map(p => {
            const h = inBay(p.x, p.y)
            return (
              <Row key={p.id} colour={p.kind === 'boss' ? 'rgba(232,86,74,0.95)' : 'rgba(150,232,180,0.9)'}
                value={p.label}
                onChange={v => setPins(ps => ps.map(q => q.id === p.id ? { ...q, label: v } : q))}
                onDelete={() => setPins(ps => ps.filter(q => q.id !== p.id))}
                note={h ? `${h.bay.id} ${h.along},${h.across}` : `${p.x}, ${p.y}`} />
            )
          })}
          {walls.map(wl => (
            <Row key={wl.id} colour="rgba(226,138,120,0.9)" value={wl.label}
              onChange={v => setWalls(ws => ws.map(q => q.id === wl.id ? { ...q, label: v } : q))}
              onDelete={() => setWalls(ws => ws.filter(q => q.id !== wl.id))}
              note={`${wl.x1},${wl.y1} → ${wl.x2},${wl.y2}`} />
          ))}
        </div>
      )}

      <p className="font-karla font-700 uppercase" style={{
        margin: '1.2rem 0 0.4rem', fontSize: '0.56rem', letterSpacing: '0.18em',
        color: 'rgba(196,169,106,0.75)',
      }}>Send me this</p>
      <textarea readOnly value={out} rows={Math.min(24, out.split('\n').length + 1)}
        onFocus={e => e.currentTarget.select()}
        className="font-karla" style={{
          width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.76rem',
          lineHeight: 1.6, padding: '0.7rem 0.8rem', borderRadius: 10,
          background: 'rgba(8,12,18,0.9)', border: '1px solid rgba(196,169,106,0.3)',
          color: '#dfe6ea', resize: 'vertical',
        }} />
    </div>
  )
}

function Row({ colour, value, note, onChange, onDelete }: {
  colour: string
  value: string
  note: string
  onChange: (v: string) => void
  onDelete: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.35rem 0.5rem', borderRadius: 9,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: colour, flexShrink: 0 }} />
      <input value={value} onChange={e => onChange(e.target.value)}
        className="font-karla" style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
          color: '#f0ede8', fontSize: '0.82rem',
        }} />
      <span className="font-karla" style={{
        fontSize: '0.7rem', color: 'rgba(190,212,228,0.5)', whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}>{note}</span>
      <button type="button" onClick={onDelete} aria-label="Remove" style={{
        width: 22, height: 22, borderRadius: '50%', padding: 0, flexShrink: 0, lineHeight: 1,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
        color: 'rgba(230,240,246,0.7)', cursor: 'pointer', fontSize: '0.8rem',
      }}>×</button>
    </div>
  )
}
