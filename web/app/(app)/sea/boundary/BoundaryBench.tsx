'use client'

// PLACE THE CIRCLES, JUDGE THEM AGAINST A BOAT, COPY THE TABLE.
//
// Up to four circles per object, because that is what the frame loop resolves:
// a hull is pushed out of a circle along its normal and keeps its sliding
// component, and four circles trace a jetty or a headland closer than anyone
// can tell from a deck. Each circle is dragged by its centre and resized by
// its rim handle.
//
// Two families, two coordinate systems, both the chart's own:
//   · SeaMark art (landmarks, docks) — circles in fractions of the sprite,
//     converted through its aspect and the ground squash exactly as
//     SeaMap.artCircles does.
//   · Ports — circles in fractions of the port's radius, drawn over the same
//     seeded coastline polygon the island itself is clipped to.
//
// The dashed grey circle is TODAY'S default for that object; the dashed outer
// rim on each drawn circle is the HULL padding the runtime adds. The boat
// ghost is the fishing hull at true relative scale, because "would she fit
// through there" is the whole question.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { LANDMARKS, PLACES } from '../chart'
import { coastline } from '@/lib/islandShape'
import { ART_COLLIDERS, PORT_COLLIDERS } from '../colliders'

const GROUND = 0.58   // kept in step with SeaMap by hand, like the other benches
const HULL = 55
const SHORE = 0.72
const BOAT_W = 210 * 0.55  // the fishing hull's painted beam
const MAX_C = 4

type Circle = { ax: number; ay: number; ar: number }
type Entry = { kind: 'art'; key: string; art: string; size: number }
  | { kind: 'port'; key: string; id: string; r: number }

/** Everything with a boundary worth drawing, deduped by art. Sizes are the
 *  chart's own — the largest instance of each art, so the ghost compares
 *  against the biggest thing you will meet. */
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
  out.push({ kind: 'art', key: 'dock-raids', art: '/sea/dock-raids.png', size: 624 })
  out.push({ kind: 'art', key: 'dock-voyages', art: '/sea/dock-voyages.png', size: 624 })
  for (const p of PLACES) {
    if (p.kind !== 'port') continue
    out.push({ kind: 'port', key: `port:${p.id}`, id: p.id, r: p.r })
  }
  return out
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export default function BoundaryBench() {
  const entries = useMemo(buildEntries, [])
  const [key, setKey] = useState(entries[0].key)
  const entry = entries.find(e => e.key === key) ?? entries[0]

  /** aspect per art, measured from the loaded image — the one fact the
   *  runtime cannot derive, so the bench emits it into the table. */
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const [table, setTable] = useState<Record<string, Circle[]>>(() => {
    const t: Record<string, Circle[]> = {}
    for (const [k, v] of Object.entries(ART_COLLIDERS)) t[k] = v.circles.map(c => ({ ...c }))
    for (const [k, v] of Object.entries(PORT_COLLIDERS)) t[`port:${k}`] = v.circles.map(c => ({ ...c }))
    return t
  })
  const [grab, setGrab] = useState<{ i: number; mode: 'move' | 'size' } | null>(null)
  const [squash, setSquash] = useState(false)
  const [copied, setCopied] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)

  const circles: Circle[] = table[key]
    ?? (entry.kind === 'art' ? [{ ax: 0.5, ay: 1, ar: 0.42 }] : [{ ax: 0, ay: 0, ar: SHORE }])

  const setCircles = (next: Circle[]) => setTable(prev => ({ ...prev, [key]: next }))

  // ── stage geometry ──────────────────────────────────────────────────────
  // One world px = one stage px at width 460, so the ghost and the padding
  // are true. Art stages are the sprite's box; port stages are the 2r box.
  const worldW = entry.kind === 'art' ? entry.size : entry.r * 2
  const scale = 460 / worldW
  const aspect = entry.kind === 'art' ? (aspects[entry.key] ?? 1) : 1
  const stageH = entry.kind === 'art' ? 460 * aspect : 460

  useEffect(() => {
    if (entry.kind !== 'art' || aspects[entry.key]) return
    const img = new Image()
    img.onload = () => setAspects(prev => ({ ...prev, [entry.key]: img.naturalHeight / img.naturalWidth }))
    img.src = entry.art
  }, [entry, aspects])

  /** Circle → stage px. Art: fractions of sprite box. Port: centre-origin r
   *  fractions. */
  const toPx = (c: Circle) => entry.kind === 'art'
    ? { x: c.ax * 460, y: c.ay * stageH, r: c.ar * 460 }
    : { x: (c.ax + 1) * 230, y: (c.ay + 1) * 230, r: c.ar * 230 }

  const fromPx = (x: number, y: number): { ax: number; ay: number } => entry.kind === 'art'
    ? { ax: round3(x / 460), ay: round3(y / stageH) }
    : { ax: round3(x / 230 - 1), ay: round3(y / 230 - 1) }

  const onMove = (e: React.PointerEvent) => {
    if (!grab) return
    const r = stage.current?.getBoundingClientRect()
    if (!r) return
    const x = e.clientX - r.left
    const y = (e.clientY - r.top) / (squash ? GROUND : 1)
    const next = circles.map(c => ({ ...c }))
    const c = next[grab.i]
    if (!c) return
    if (grab.mode === 'move') {
      const p = fromPx(x, y)
      c.ax = p.ax; c.ay = p.ay
    } else {
      const at = toPx(c)
      const d = Math.hypot(x - at.x, y - at.y)
      c.ar = round3(Math.max(0.03, d / (entry.kind === 'art' ? 460 : 230)))
    }
    setCircles(next)
  }

  const coastPts = useMemo(() => {
    if (entry.kind !== 'port') return null
    const rs = coastline(entry.id)
    const n = rs.length
    return rs.map((rr, i) => {
      const a = (Math.PI * 2 * i) / n
      return `${230 + Math.cos(a) * rr * 230},${230 + Math.sin(a) * rr * 230}`
    }).join(' ')
  }, [entry])

  const source = useMemo(() => {
    const arts: string[] = [], ports: string[] = []
    for (const e of entries) {
      const cs = table[e.key]
      if (!cs || cs.length === 0) continue
      const list = cs.map(c => `{ ax: ${c.ax}, ay: ${c.ay}, ar: ${c.ar} }`).join(', ')
      if (e.kind === 'art') {
        arts.push(`  '${e.key}': { aspect: ${round3(aspects[e.key] ?? 1)}, circles: [${list}] },`)
      } else {
        ports.push(`  '${e.id}': { circles: [${list}] },`)
      }
    }
    return `export const ART_COLLIDERS: Record<string, ArtCollider> = {\n${arts.join('\n')}\n}\n\n`
      + `export const PORT_COLLIDERS: Record<string, PortCollider> = {\n${ports.join('\n')}\n}\n`
  }, [table, entries, aspects])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { /* selectable below */ }
  }

  const defaultCircle = entry.kind === 'art'
    ? { x: 230, y: stageH, r: 0.42 * 460 }
    : { x: 230, y: 230, r: SHORE * 230 }

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
        Drag a circle to move it, drag its small rim handle to resize, up to four per
        object. The dashed grey ring is today&apos;s default; the dashed halo on each
        circle is the hull padding the game adds; the pale boat is the fishing hull at
        true scale. Copy the table into app/(app)/sea/colliders.ts.
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
            style={{ position: 'relative', width: 460, height: stageH, touchAction: 'none' }}>

            {entry.kind === 'art' ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={entry.art} alt="" draggable={false}
                style={{ width: 460, height: 'auto', display: 'block', opacity: 0.95, pointerEvents: 'none' }} />
            ) : (
              <svg viewBox="0 0 460 460" style={{ width: 460, height: 460, display: 'block' }} aria-hidden>
                <polygon points={coastPts ?? ''} fill="rgba(126,146,110,0.5)"
                  stroke="rgba(196,204,176,0.7)" strokeWidth={2} />
              </svg>
            )}

            {/* Today's default, for reference. */}
            <div aria-hidden style={{
              position: 'absolute',
              left: defaultCircle.x - defaultCircle.r, top: defaultCircle.y - defaultCircle.r,
              width: defaultCircle.r * 2, height: defaultCircle.r * 2, borderRadius: '50%',
              border: '1px dashed rgba(190,200,210,0.4)', pointerEvents: 'none',
            }} />

            {/* The boat ghost, at true world scale against this object. */}
            <div aria-hidden style={{
              position: 'absolute', right: 8, bottom: 8,
              width: BOAT_W * scale, height: BOAT_W * scale * 0.42,
              borderRadius: '50%', border: '1px solid rgba(150,200,230,0.55)',
              background: 'rgba(150,200,230,0.12)', pointerEvents: 'none',
            }} />

            {circles.map((c, i) => {
              const at = toPx(c)
              const pad = HULL * scale
              return (
                <div key={i}>
                  <div
                    onPointerDown={e => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      setGrab({ i, mode: 'move' })
                    }}
                    style={{
                      position: 'absolute', left: at.x - at.r, top: at.y - at.r,
                      width: at.r * 2, height: at.r * 2, borderRadius: '50%',
                      background: 'rgba(240,120,90,0.14)',
                      border: '2px solid rgba(240,120,90,0.85)',
                      cursor: 'move', touchAction: 'none',
                    }} />
                  {/* The hull padding the runtime adds — what the BOAT hits. */}
                  <div aria-hidden style={{
                    position: 'absolute', left: at.x - at.r - pad, top: at.y - at.r - pad,
                    width: (at.r + pad) * 2, height: (at.r + pad) * 2, borderRadius: '50%',
                    border: '1px dashed rgba(240,120,90,0.35)', pointerEvents: 'none',
                  }} />
                  <div
                    onPointerDown={e => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      setGrab({ i, mode: 'size' })
                    }}
                    style={{
                      position: 'absolute', left: at.x + at.r - 7, top: at.y - 7,
                      width: 14, height: 14, borderRadius: '50%',
                      background: '#f0c040', border: '2px solid rgba(6,14,22,0.8)',
                      cursor: 'ew-resize', touchAction: 'none',
                    }} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button type="button"
          onClick={() => circles.length < MAX_C && setCircles([...circles,
            entry.kind === 'art' ? { ax: 0.5, ay: 0.8, ar: 0.18 } : { ax: 0, ay: 0, ar: 0.3 }])}
          disabled={circles.length >= MAX_C}
          className="tap font-karla font-700" style={{
            padding: '0.35rem 0.6rem', borderRadius: 9, fontSize: '0.74rem', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e2ea',
            opacity: circles.length >= MAX_C ? 0.4 : 1,
          }}>
          + circle
        </button>
        <button type="button"
          onClick={() => circles.length > 1 && setCircles(circles.slice(0, -1))}
          disabled={circles.length <= 1}
          className="tap font-karla font-700" style={{
            padding: '0.35rem 0.6rem', borderRadius: 9, fontSize: '0.74rem', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e2ea',
            opacity: circles.length <= 1 ? 0.4 : 1,
          }}>
          − circle
        </button>
        <button type="button" onClick={() => {
          setTable(prev => { const n = { ...prev }; delete n[key]; return n })
        }} className="tap font-karla font-700" style={{
          padding: '0.35rem 0.6rem', borderRadius: 9, fontSize: '0.74rem', cursor: 'pointer',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e2ea',
        }}>
          Use default
        </button>
        <button type="button" onClick={() => setSquash(q => !q)} className="tap font-karla font-700"
          style={{
            padding: '0.35rem 0.6rem', borderRadius: 9, fontSize: '0.74rem', cursor: 'pointer',
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
        fontSize: '0.74rem', lineHeight: 1.7, color: '#cfe0ec', margin: 0,
        padding: '0.75rem', borderRadius: 12, overflowX: 'auto',
        background: 'rgba(4,10,16,0.7)', border: '1px solid rgba(180,214,232,0.18)',
      }}>{source}</pre>
    </div>
  )
}
