'use client'

// PLACE THE SHAPES, JUDGE THEM AGAINST A BOAT, COPY THE TABLE.
//
// Two shapes, because the art is mostly isometric and a circle is the wrong
// first shape for an isometric footprint:
//
//   · CIRCLE, for the round things — dragged by its body, resized by the gold
//     rim handle.
//   · CAPSULE, a segment with a radius — the stadium the frame loop can
//     resolve as cheaply as a circle. Lay it along a deck or a slab and it IS
//     the footprint. Dragged by either end; the gold handle on its waist sets
//     the thickness.
//
// WHAT THE LINES MEAN, because it was asked: the SOLID shape is where the
// planking is — the boat's own edge reaches it. The faint dashed halo is that
// shape plus the hull's half-beam (55 world px), which is where the boat's
// CENTRE is stopped by the game; her edge and your solid line meet exactly
// when her centre sits on the dash. On a small object the halo is honestly
// huge — a hull-width around a buoy is nearly the buoy again.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LANDMARKS, PLACES } from '../chart'
import { ISLES } from '@/lib/seaIsles'
import { coastline } from '@/lib/islandShape'
import { ART_COLLIDERS, PORT_COLLIDERS, type ColliderShape } from '../colliders'

const GROUND = 0.58   // kept in step with SeaMap by hand, like the other benches
const HULL = 55
const SHORE = 0.72
const BOAT_W = 210 * 0.55
const MAX_SHAPES = 4
const STAGE = 460

type Entry = { kind: 'art'; key: string; art: string; size: number }
  | { kind: 'port'; key: string; id: string; r: number }
  | { kind: 'isle'; key: string; id: string; r: number }

function buildEntries(): Entry[] {
  const byArt = new Map<string, number>()
  for (const m of LANDMARKS) {
    if (m.solid === false) continue
    const k = m.art.slice(m.art.lastIndexOf('/') + 1).replace('.png', '')
    byArt.set(k, Math.max(byArt.get(k) ?? 0, m.size))
  }
  const out: Entry[] = [...byArt.entries()].map(([k, size]) => ({
    kind: 'art', key: k, art: `/sea/${k}.png`, size,
  }))
  // The gate stacks: paint today, solid the moment shapes are drawn for them.
  // See allObstacles in SeaMap — no entry means no obstacle, not a fallback.
  out.push({ kind: 'art', key: 'rock-gate-w', art: '/sea/rock-gate-w.png', size: 760 })
  out.push({ kind: 'art', key: 'rock-gate-e', art: '/sea/rock-gate-e.png', size: 760 })
  for (const p of PLACES) {
    if (p.kind !== 'port') continue
    out.push({ kind: 'port', key: `port:${p.id}`, id: p.id, r: p.r })
  }
  for (const i of ISLES) {
    out.push({ kind: 'isle', key: `isle:${i.id}`, id: i.id, r: i.r })
  }
  return out
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

export default function BoundaryBench() {
  const entries = useMemo(buildEntries, [])
  const [key, setKey] = useState(entries[0].key)
  const entry = entries.find(e => e.key === key) ?? entries[0]

  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [table, setTable] = useState<Record<string, ColliderShape[]>>(() => {
    const t: Record<string, ColliderShape[]> = {}
    for (const [k, v] of Object.entries(ART_COLLIDERS)) t[k] = v.shapes.map(c => ({ ...c }))
    for (const [k, v] of Object.entries(PORT_COLLIDERS)) t[`port:${k}`] = v.shapes.map(c => ({ ...c }))
    return t
  })
  const [grab, setGrab] = useState<{ i: number; part: 'a' | 'b' | 'r' | 'm' } | null>(null)
  const [squash, setSquash] = useState(false)
  /** The centre-stop prediction, off by default: it kept reading as a second
   *  boundary to tune when it is only a consequence of the one you draw. */
  const [showHalo, setShowHalo] = useState(false)
  const [copied, setCopied] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)

  // EMPTY UNTIL DRAWN. The bench used to open with the runtime's fallback
  // circle as an editable red shape, which read as "someone already placed
  // this" — the opposite of an invitation to draw. The faint grey dashed ring
  // stays as reference (what the game does TODAY with no entry); red appears
  // only when you add a shape. Removing the last shape returns the object to
  // the default rather than storing an empty entry.
  const shapes: ColliderShape[] = table[key] ?? []
  const setShapes = (next: ColliderShape[]) => setTable(prev => {
    const t = { ...prev }
    if (next.length === 0) delete t[key]
    else t[key] = next
    return t
  })

  const worldW = entry.kind === 'art' ? entry.size : entry.r * 2
  const scale = STAGE / worldW
  const aspect = entry.kind === 'art' ? (aspects[entry.key] ?? 1) : 1
  const stageH = entry.kind === 'art' ? STAGE * aspect : STAGE

  useEffect(() => {
    if (entry.kind !== 'art' || aspects[entry.key]) return
    const img = new Image()
    img.onload = () => setAspects(prev => ({ ...prev, [entry.key]: img.naturalHeight / img.naturalWidth }))
    img.src = entry.art
  }, [entry, aspects])

  const px = (ax: number, ay: number) => entry.kind === 'art'
    ? { x: ax * STAGE, y: ay * stageH }
    : { x: (ax + 1) * (STAGE / 2), y: (ay + 1) * (STAGE / 2) }
  const rpx = (ar: number) => ar * (entry.kind === 'art' ? STAGE : STAGE / 2)
  const fromPx = (x: number, y: number) => entry.kind === 'art'
    ? { ax: r3(x / STAGE), ay: r3(y / stageH) }
    : { ax: r3(x / (STAGE / 2) - 1), ay: r3(y / (STAGE / 2) - 1) }

  const onMove = (e: React.PointerEvent) => {
    if (!grab) return
    const r = stage.current?.getBoundingClientRect()
    if (!r) return
    const x = e.clientX - r.left
    const y = (e.clientY - r.top) / (squash ? GROUND : 1)
    const next = shapes.map(s => ({ ...s }))
    const s = next[grab.i]
    if (!s) return
    if (grab.part === 'r') {
      // Radius = distance from the segment (or the centre, for a circle).
      let cx: number, cy: number
      if (s.kind === 'capsule') {
        const a = px(s.ax, s.ay), b = px(s.bx, s.by)
        const vx = b.x - a.x, vy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / Math.max(1, vx * vx + vy * vy)))
        cx = a.x + vx * t; cy = a.y + vy * t
      } else {
        const c = px(s.ax, s.ay); cx = c.x; cy = c.y
      }
      s.ar = r3(Math.max(0.02, Math.hypot(x - cx, y - cy) / (entry.kind === 'art' ? STAGE : STAGE / 2)))
    } else if (grab.part === 'b' && s.kind === 'capsule') {
      const p = fromPx(x, y); s.bx = p.ax; s.by = p.ay
    } else if (grab.part === 'm' && s.kind === 'capsule') {
      // The blue centre handle carries the whole capsule.
      const p = fromPx(x, y)
      const cx = (s.ax + s.bx) / 2, cy = (s.ay + s.by) / 2
      const dx = p.ax - cx, dy = p.ay - cy
      s.ax = r3(s.ax + dx); s.ay = r3(s.ay + dy)
      s.bx = r3(s.bx + dx); s.by = r3(s.by + dy)
    } else {
      // An END handle moves ONLY its end — which is exactly how a capsule
      // rotates: hold one end, swing the other. It used to carry the far end
      // with it, which made rotation impossible and was reported as such.
      const p = fromPx(x, y)
      s.ax = p.ax; s.ay = p.ay
    }
    setShapes(next)
  }

  const coastPts = useMemo(() => {
    if (entry.kind === 'art') return null
    const rs = coastline(entry.id)
    return rs.map((rr, i) => {
      const a = (Math.PI * 2 * i) / rs.length
      return `${230 + Math.cos(a) * rr * 230},${230 + Math.sin(a) * rr * 230}`
    }).join(' ')
  }, [entry])

  const source = useMemo(() => {
    const fmt = (s: ColliderShape) => s.kind === 'circle'
      ? `{ kind: 'circle', ax: ${s.ax}, ay: ${s.ay}, ar: ${s.ar} }`
      : `{ kind: 'capsule', ax: ${s.ax}, ay: ${s.ay}, bx: ${s.bx}, by: ${s.by}, ar: ${s.ar} }`
    const arts: string[] = [], ports: string[] = [], isles: string[] = []
    for (const e of entries) {
      const cs = table[e.key]
      if (!cs || cs.length === 0) continue
      const list = cs.map(fmt).join(', ')
      if (e.kind === 'art') arts.push(`  '${e.key}': { aspect: ${r3(aspects[e.key] ?? 1)}, shapes: [${list}] },`)
      else if (e.kind === 'port') ports.push(`  '${e.id}': { shapes: [${list}] },`)
      else isles.push(`  '${e.id}': { shapes: [${list}] },`)
    }
    return `export const ART_COLLIDERS: Record<string, ArtCollider> = {\n${arts.join('\n')}\n}\n\n`
      + `export const PORT_COLLIDERS: Record<string, PortCollider> = {\n${ports.join('\n')}\n}\n\n`
      + `export const ISLE_COLLIDERS: Record<string, PortCollider> = {\n${isles.join('\n')}\n}\n`
  }, [table, entries, aspects])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { /* selectable below */ }
  }

  const pad = HULL * scale
  const defC = entry.kind === 'art'
    ? { x: STAGE / 2, y: stageH, r: 0.42 * STAGE }
    : entry.kind === 'port'
      ? { x: STAGE / 2, y: STAGE / 2, r: SHORE * (STAGE / 2) }
      // An isle's default is its whole radius.
      : { x: STAGE / 2, y: STAGE / 2, r: STAGE / 2 }

  /** One shape's stadium geometry in stage px, shared by fill and halo. */
  const geo = (s: ColliderShape) => {
    const a = px(s.ax, s.ay)
    const b = s.kind === 'capsule' ? px(s.bx, s.by) : a
    return { a, b, r: rpx(s.ar) }
  }

  return (
    <div className="page-col" style={{ paddingTop: '1rem', paddingBottom: '4rem', color: '#e6e2dc' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="font-pirata" style={{ fontSize: '1.9rem' }}>Boundary bench</h1>
        <Link href="/sea" className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#8fb8cf' }}>
          To the sea
        </Link>
      </div>
      <p className="font-karla" style={{
        fontSize: '0.9rem', color: 'rgba(198,216,230,0.72)', lineHeight: 1.6, margin: '4px 0 14px',
      }}>
        <strong>There is one boundary: the shape you draw.</strong> Put it on the
        object&apos;s edge — the boat&apos;s planking stops exactly there. The optional
        &ldquo;centre-stop&rdquo; overlay is a PREDICTION, not a second boundary: the
        game tracks the boat by her centre point, and that point is held half a boat
        back from your line — which is what makes her planking stop on it. Turn the
        overlay on only to judge whether a gap between two objects admits her.
        Capsules fit isometric footprints; drag an end to reshape, the waist handle
        for thickness, the body to move. Copy into app/(app)/sea/colliders.ts.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {entries.map(e => (
          <button key={e.key} type="button" onClick={() => { setKey(e.key); setGrab(null) }}
            className="tap font-karla font-700" style={{
              padding: '0.35rem 0.6rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.72rem',
              background: key === e.key ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${key === e.key ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.14)'}`,
              color: key === e.key ? '#f6dfa0' : '#cfe0ec',
            }}>
            {e.key}{table[e.key]?.length ? ' ●' : ''}
          </button>
        ))}
      </div>

      <div style={{
        borderRadius: 16, overflow: 'hidden', padding: '2rem 0',
        background: 'linear-gradient(180deg, #0e2231 0%, #0b1a24 60%, #081420 100%)',
        border: '1px solid rgba(150,196,222,0.2)',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ transform: squash ? `scaleY(${GROUND})` : 'none', transformOrigin: 'center top' }}>
          <div ref={stage}
            onPointerMove={onMove}
            onPointerUp={() => setGrab(null)}
            onPointerCancel={() => setGrab(null)}
            style={{ position: 'relative', width: STAGE, height: stageH, touchAction: 'none' }}>

            {entry.kind === 'art' ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={entry.art} alt="" draggable={false}
                style={{ width: STAGE, height: 'auto', display: 'block', opacity: 0.95, pointerEvents: 'none' }} />
            ) : (
              <>
                <svg viewBox="0 0 460 460" style={{ width: STAGE, height: STAGE, display: 'block' }} aria-hidden>
                  <polygon points={coastPts ?? ''} fill="rgba(126,146,110,0.5)"
                    stroke="rgba(196,204,176,0.7)" strokeWidth={2} />
                </svg>
                {/* THE BUILDINGS, exactly as PlaceIsland stands them up: same
                    percentages of the island box, same width share, same
                    counter-squash — without them the bench showed a bare green
                    blob and every port looked like every other port. The
                    Homestead's list is empty by design (it is per-captain),
                    so it stays a blob; its coastline is still the true one. */}
                {entry.kind === 'port' && PLACES.find(pp => pp.id === entry.id)?.buildings?.map((b, bi) => (
                  <div key={bi} aria-hidden style={{
                    position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
                    width: STAGE * b.scale,
                    transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
                    transformOrigin: 'bottom center', pointerEvents: 'none',
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img decoding="async" src={b.art} alt="" draggable={false}
                      style={{ width: '100%', display: 'block' }} />
                  </div>
                ))}
              </>
            )}

            {/* Shapes: one SVG so stadiums and halos are cheap round-capped
                strokes rather than div gymnastics. */}
            <svg viewBox={`0 0 ${STAGE} ${stageH}`} aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <circle cx={defC.x} cy={defC.y} r={defC.r}
                fill="none" stroke="rgba(190,200,210,0.35)" strokeWidth={1} strokeDasharray="5 4" />
              {shapes.map((s, i) => {
                const g = geo(s)
                return (
                  <g key={i}>
                    <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
                      stroke="rgba(240,120,90,0.2)" strokeWidth={g.r * 2} strokeLinecap="round" />
                    <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
                      stroke="rgba(240,120,90,0.9)" strokeWidth={2} strokeLinecap="round"
                      strokeDasharray={s.kind === 'capsule' ? undefined : undefined} />
                    {/* the solid outline of the stadium */}
                    <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
                      stroke="rgba(240,120,90,0.85)" strokeWidth={g.r * 2}
                      strokeLinecap="round" fill="none" opacity={0.18} />
                    {showHalo && (
                      <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
                        stroke="rgba(240,180,120,0.22)" strokeWidth={(g.r + pad) * 2}
                        strokeLinecap="round" strokeDasharray="2 6" fill="none" />
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Handles (HTML, so pointer capture works per handle). */}
            {shapes.map((s, i) => {
              const g = geo(s)
              const mid = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }
              const len = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) || 1
              const nx = -(g.b.y - g.a.y) / len, ny = (g.b.x - g.a.x) / len
              const rHandle = s.kind === 'capsule'
                ? { x: mid.x + nx * g.r, y: mid.y + ny * g.r }
                : { x: g.a.x + g.r, y: g.a.y }
              const H = (part: 'a' | 'b' | 'r' | 'm', at: { x: number; y: number }, cursor: string, color?: string) => (
                <div key={part}
                  onPointerDown={e => {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    setGrab({ i, part })
                  }}
                  style={{
                    position: 'absolute', left: at.x - 8, top: at.y - 8,
                    width: 16, height: 16, borderRadius: '50%',
                    background: color ?? (part === 'r' ? '#f0c040' : 'rgba(240,120,90,0.95)'),
                    border: '2px solid rgba(6,14,22,0.85)',
                    cursor, touchAction: 'none',
                  }} />
              )
              return (
                <div key={i}>
                  {H('a', g.a, s.kind === 'capsule' ? 'crosshair' : 'move')}
                  {s.kind === 'capsule' && H('b', g.b, 'crosshair')}
                  {s.kind === 'capsule' && H('m', mid, 'move', 'rgba(120,180,240,0.95)')}
                  {H('r', rHandle, 'ew-resize')}
                </div>
              )
            })}

            {/* The boat ghost, true world scale. */}
            <div aria-hidden style={{
              position: 'absolute', right: 8, bottom: 8,
              width: BOAT_W * scale, height: BOAT_W * scale * 0.42,
              borderRadius: '50%', border: '1px solid rgba(150,200,230,0.55)',
              background: 'rgba(150,200,230,0.12)', pointerEvents: 'none',
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button type="button"
          onClick={() => shapes.length < MAX_SHAPES && setShapes([...shapes,
            { kind: 'circle', ax: entry.kind === 'art' ? 0.5 : 0, ay: entry.kind === 'art' ? 0.8 : 0, ar: entry.kind === 'art' ? 0.18 : 0.3 }])}
          disabled={shapes.length >= MAX_SHAPES}
          className="tap font-karla font-700" style={btn(shapes.length >= MAX_SHAPES)}>
          + circle
        </button>
        <button type="button"
          onClick={() => shapes.length < MAX_SHAPES && setShapes([...shapes,
            entry.kind === 'art'
              ? { kind: 'capsule', ax: 0.25, ay: 0.85, bx: 0.75, by: 0.85, ar: 0.1 }
              : { kind: 'capsule', ax: -0.4, ay: 0, bx: 0.4, by: 0, ar: 0.25 }])}
          disabled={shapes.length >= MAX_SHAPES}
          className="tap font-karla font-700" style={btn(shapes.length >= MAX_SHAPES)}>
          + capsule
        </button>
        <button type="button" onClick={() => shapes.length > 0 && setShapes(shapes.slice(0, -1))}
          disabled={shapes.length === 0}
          className="tap font-karla font-700" style={btn(shapes.length === 0)}>
          − shape
        </button>
        <button type="button" onClick={() => setTable(prev => { const n = { ...prev }; delete n[key]; return n })}
          className="tap font-karla font-700" style={btn(false)}>
          Use default
        </button>
        <button type="button" onClick={() => setShowHalo(v => !v)} className="tap font-karla font-700"
          style={{
            ...btn(false),
            background: showHalo ? 'rgba(240,180,120,0.16)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${showHalo ? 'rgba(240,180,120,0.5)' : 'rgba(255,255,255,0.16)'}`,
            color: showHalo ? '#f6d8b0' : '#d8e2ea',
          }}>
          {showHalo ? 'Centre-stop: shown' : 'Centre-stop: hidden'}
        </button>
        <button type="button" onClick={() => setSquash(q => !q)} className="tap font-karla font-700"
          style={{
            ...btn(false),
            background: squash ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${squash ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.16)'}`,
            color: squash ? '#f6dfa0' : '#d8e2ea',
          }}>
          {squash ? 'World squash' : 'Flat'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={copy} className="tap font-karla font-700"
          style={{
            flex: 1, padding: '0.65rem', borderRadius: 12, fontSize: '0.88rem', cursor: 'pointer',
            background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f6dfa0',
          }}>
          {copied ? 'Copied' : 'Copy the table'}
        </button>
      </div>

      <pre className="font-karla" style={{
        fontSize: '0.72rem', lineHeight: 1.7, color: '#cfe0ec', margin: 0,
        padding: '0.75rem', borderRadius: 12, overflowX: 'auto',
        background: 'rgba(4,10,16,0.7)', border: '1px solid rgba(180,214,232,0.18)',
      }}>{source}</pre>
    </div>
  )
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    padding: '0.35rem 0.6rem', borderRadius: 9, fontSize: '0.74rem', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e2ea',
    opacity: disabled ? 0.4 : 1,
  }
}
