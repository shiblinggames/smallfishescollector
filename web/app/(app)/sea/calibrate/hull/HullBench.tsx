'use client'

// DRAW WHAT THE HULL IS, JUDGE IT AGAINST A ROCK, COPY THE TABLE.
//
// The boundary bench draws the things a hull hits. This draws the hull. Until
// it existed the boat was one 55px circle on her centre, for every class on
// the ladder: right-ish for the fishing boat, and wrong by a whole bow and a
// whole stern on a Man-o-War drawn three times that width. Whatever you put
// here is what the water knows about her out there, through the same
// conversion the chart runs for the cutwater.
//
// Same two shapes as the boundary bench and the same handles: a CIRCLE dragged
// by its body with the gold rim for size, a CAPSULE dragged by either end (hold
// one, swing the other, and it rotates), the blue waist to carry it, the gold
// waist handle for thickness. Up to four shapes. One capsule laid along the
// waterline is the right first answer for every hull here; a second, shorter
// one across the beam catches a wide stern.
//
// THE ART IS SHOWN AS DELIVERED, unmirrored, and the numbers are stored that
// way. The four middle hulls are painted bow-right and sail mirrored; the
// runtime mirrors the shapes alongside the pixels, in the same place it
// mirrors seaBow, so you draw on the painting you can see and never think
// about it.

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { SHIPS } from '@/lib/ships'
import FisherPose from '@/components/FisherPose'
import { HULL_COLLIDERS, type ColliderShape } from '../../colliders'

// ── KEPT IN STEP WITH SeaMap BY HAND, like the other benches ──────────────
const GROUND = 0.58
const HULL = 55
const SKIPPER_W = 210
const WARSHIP_W = 340
const MAX_SHAPES = 4
const STAGE = 460

type Boat = { key: string; label: string; box: number; art: string | null; keel: number }
const BOATS: Boat[] = [
  { key: 'fishing', label: 'Fishing boat', box: SKIPPER_W, art: null, keel: 0.66 },
  ...SHIPS.map(s => ({
    key: String(s.tier),
    label: s.name,
    box: WARSHIP_W,
    art: s.seaImageUrl ?? null,
    keel: s.seaKeel ?? 0.75,
  })),
]

const r3 = (n: number) => Math.round(n * 1000) / 1000

export default function HullBench({ characterColor, equippedBoat, equippedHat }: {
  characterColor: string
  equippedBoat: string | null
  equippedHat: string | null
}) {
  const [key, setKey] = useState('6')
  const boat = BOATS.find(b => b.key === key) ?? BOATS[0]

  const [table, setTable] = useState<Record<string, ColliderShape[]>>(() => {
    const t: Record<string, ColliderShape[]> = {}
    for (const [k, v] of Object.entries(HULL_COLLIDERS)) t[k] = v.shapes.map(c => ({ ...c }))
    return t
  })
  const [grab, setGrab] = useState<{ i: number; part: 'a' | 'b' | 'r' | 'm' } | null>(null)
  const [squash, setSquash] = useState(false)
  const [mirror, setMirror] = useState(false)
  const [copied, setCopied] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)

  // EMPTY UNTIL DRAWN, same as the boundary bench: the grey dashed ring is
  // what the game does TODAY for this class with no entry, and red only
  // appears when you add a shape. Removing the last shape returns the class to
  // that fallback rather than storing an empty entry.
  const shapes: ColliderShape[] = table[key] ?? []
  const setShapes = (next: ColliderShape[]) => setTable(prev => {
    const t = { ...prev }
    if (next.length === 0) delete t[key]
    else t[key] = next
    return t
  })

  const scale = STAGE / boat.box
  const px = (ax: number, ay: number) => ({ x: ax * STAGE, y: ay * STAGE })
  const rpx = (ar: number) => ar * STAGE
  const fromPx = (x: number, y: number) => ({ ax: r3(x / STAGE), ay: r3(y / STAGE) })

  const onMove = (e: React.PointerEvent) => {
    if (!grab) return
    const r = stage.current?.getBoundingClientRect()
    if (!r) return
    // The stage may be mirrored or squashed for judging; the numbers are
    // always in the unmirrored, flat frame, so undo both before reading.
    let x = e.clientX - r.left
    if (mirror) x = STAGE - x
    const y = (e.clientY - r.top) / (squash ? GROUND : 1)
    const next = shapes.map(s => ({ ...s }))
    const s = next[grab.i]
    if (!s) return
    if (grab.part === 'r') {
      let cx: number, cy: number
      if (s.kind === 'capsule') {
        const a = px(s.ax, s.ay), b = px(s.bx, s.by)
        const vx = b.x - a.x, vy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / Math.max(1, vx * vx + vy * vy)))
        cx = a.x + vx * t; cy = a.y + vy * t
      } else {
        const c = px(s.ax, s.ay); cx = c.x; cy = c.y
      }
      s.ar = r3(Math.max(0.02, Math.hypot(x - cx, y - cy) / STAGE))
    } else if (grab.part === 'b' && s.kind === 'capsule') {
      const p = fromPx(x, y); s.bx = p.ax; s.by = p.ay
    } else if (grab.part === 'm' && s.kind === 'capsule') {
      const p = fromPx(x, y)
      const cx = (s.ax + s.bx) / 2, cy = (s.ay + s.by) / 2
      const dx = p.ax - cx, dy = p.ay - cy
      s.ax = r3(s.ax + dx); s.ay = r3(s.ay + dy)
      s.bx = r3(s.bx + dx); s.by = r3(s.by + dy)
    } else {
      const p = fromPx(x, y)
      s.ax = p.ax; s.ay = p.ay
    }
    setShapes(next)
  }

  const source = useMemo(() => {
    const fmt = (s: ColliderShape) => s.kind === 'circle'
      ? `{ kind: 'circle', ax: ${s.ax}, ay: ${s.ay}, ar: ${s.ar} }`
      : `{ kind: 'capsule', ax: ${s.ax}, ay: ${s.ay}, bx: ${s.bx}, by: ${s.by}, ar: ${s.ar} }`
    const rows: string[] = []
    for (const b of BOATS) {
      const cs = table[b.key]
      if (!cs || cs.length === 0) continue
      rows.push(`  '${b.key}': { shapes: [${cs.map(fmt).join(', ')}] },  // ${b.label}`)
    }
    return `export const HULL_COLLIDERS: Record<string, HullCollider> = {\n${rows.join('\n')}\n}\n`
  }, [table])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { /* selectable below */ }
  }

  /** One shape's stadium geometry in stage px. */
  const geo = (s: ColliderShape) => {
    const a = px(s.ax, s.ay)
    const b = s.kind === 'capsule' ? px(s.bx, s.by) : a
    return { a, b, r: rpx(s.ar) }
  }

  // The fallback the game uses for this class today: one circle, the fishing
  // boat's half-beam, on the sprite's centre. Drawn so you can see how far
  // from the truth it is before you draw anything.
  const fallbackR = HULL * scale
  // The world's own rock sizes at this scale, so a shape can be judged
  // against something. A small isle is ~175 world px across the radius.
  const rockR = 175 * scale

  const flip = mirror ? -1 : 1
  const wrapTransform = `${squash ? `scaleY(${GROUND})` : ''} scaleX(${flip})`.trim()

  return (
    <div className="page-col" style={{ paddingTop: '1rem', paddingBottom: '4rem', color: '#e6e2dc' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="font-pirata" style={{ fontSize: '1.9rem' }}>Hull bench</h1>
        <Link href="/sea" className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#8fb8cf' }}>
          To the sea
        </Link>
      </div>
      <p className="font-karla" style={{
        fontSize: '0.9rem', color: 'rgba(198,216,230,0.72)', lineHeight: 1.6, margin: '4px 0 14px',
      }}>
        <strong>Draw where the planking is.</strong> The grey dashed ring is what the
        water knows about this hull today: one circle on her centre, the same for
        every class. Put a capsule along her waterline from stem to stern and that
        is what stops on rock instead. The white dot is her position, which is what
        the chart moves. Add a second shape for a wide stern or a bowsprit if the
        first one cannot cover it. Copy into app/(app)/sea/colliders.ts.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {BOATS.map(b => (
          <button key={b.key} type="button" onClick={() => { setKey(b.key); setGrab(null) }}
            className="tap font-karla font-700" style={{
              padding: '0.35rem 0.6rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.72rem',
              background: key === b.key ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${key === b.key ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.14)'}`,
              color: key === b.key ? '#f6dfa0' : '#cfe0ec',
            }}>
            {b.label}{table[b.key]?.length ? ' ●' : ''}
          </button>
        ))}
      </div>

      <div style={{
        borderRadius: 16, overflow: 'hidden', padding: '2rem 0',
        background: 'linear-gradient(180deg, #0e2231 0%, #0b1a24 60%, #081420 100%)',
        border: '1px solid rgba(150,196,222,0.2)',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ transform: wrapTransform || 'none', transformOrigin: 'center top' }}>
          <div ref={stage}
            onPointerMove={onMove}
            onPointerUp={() => setGrab(null)}
            onPointerCancel={() => setGrab(null)}
            style={{ position: 'relative', width: STAGE, height: STAGE, touchAction: 'none' }}>

            {boat.art ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={boat.art} alt="" draggable={false}
                style={{ width: STAGE, height: STAGE, display: 'block', opacity: 0.95, pointerEvents: 'none' }} />
            ) : (
              // The fishing boat is a composite, so it is the real component,
              // carrying the same translate the sea gives it. The whole thing is
              // scaled up from its 210 box to the stage.
              <div style={{
                position: 'absolute', left: 0, top: 0, width: SKIPPER_W, height: SKIPPER_W,
                transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none',
              }}>
                <div style={{ transform: 'translate(-8%, -26%)' }}>
                  <FisherPose
                    characterColor={characterColor}
                    equippedHat={equippedHat} equippedBoat={equippedBoat}
                    equippedPet={null} rodTier={0} reelTier={0} hookTier={0} noGlow />
                </div>
              </div>
            )}

            <svg viewBox={`0 0 ${STAGE} ${STAGE}`} aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {/* Today's fallback circle, on the centre. */}
              <circle cx={STAGE / 2} cy={STAGE / 2} r={fallbackR}
                fill="none" stroke="rgba(190,200,210,0.4)" strokeWidth={1} strokeDasharray="5 4" />
              {/* A rock the size of a small isle, off the bow, for scale. */}
              <circle cx={STAGE * 0.04} cy={STAGE * boat.keel} r={rockR}
                fill="rgba(120,110,90,0.18)" stroke="rgba(160,150,130,0.45)" strokeWidth={1} />
              {/* Her position: the point the chart actually moves. */}
              <circle cx={STAGE / 2} cy={STAGE / 2} r={4} fill="#fff" />
              <line x1={STAGE / 2 - 14} y1={STAGE / 2} x2={STAGE / 2 + 14} y2={STAGE / 2}
                stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              <line x1={STAGE / 2} y1={STAGE / 2 - 14} x2={STAGE / 2} y2={STAGE / 2 + 14}
                stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              {shapes.map((s, i) => {
                const g = geo(s)
                return (
                  <g key={i}>
                    <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
                      stroke="rgba(240,120,90,0.85)" strokeWidth={g.r * 2}
                      strokeLinecap="round" fill="none" opacity={0.22} />
                    <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y}
                      stroke="rgba(240,120,90,0.9)" strokeWidth={2} strokeLinecap="round" />
                  </g>
                )
              })}
            </svg>

            {/* Handles (HTML, so pointer capture works per handle). When the
                stage is mirrored the handles ride inside the same flip, so a
                handle still sits on the shape it moves. */}
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
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <button type="button"
          onClick={() => shapes.length < MAX_SHAPES && setShapes([...shapes,
            { kind: 'circle', ax: 0.5, ay: boat.keel - 0.05, ar: 0.12 }])}
          disabled={shapes.length >= MAX_SHAPES}
          className="tap font-karla font-700" style={btn(shapes.length >= MAX_SHAPES)}>
          + circle
        </button>
        <button type="button"
          onClick={() => shapes.length < MAX_SHAPES && setShapes([...shapes,
            // Along the waterline, stem to stern, is the right first shape for
            // every hull here, so that is where a new capsule lands.
            { kind: 'capsule', ax: 0.2, ay: boat.keel - 0.06, bx: 0.8, by: boat.keel - 0.06, ar: 0.09 }])}
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
        <button type="button" onClick={() => setMirror(m => !m)} className="tap font-karla font-700"
          style={{
            ...btn(false),
            background: mirror ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${mirror ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.16)'}`,
            color: mirror ? '#f6dfa0' : '#d8e2ea',
          }}>
          {mirror ? 'Mirrored' : 'As painted'}
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
