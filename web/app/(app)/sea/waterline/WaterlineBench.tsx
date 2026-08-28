'use client'

// DRAW THE WATERLINE, WATCH IT SUBMERGE, COPY THE TABLE.
//
// Five handles across the sprite are the line. Drag any of them; the preview
// is the real SubmergedSprite on the sea's own colour, squashed exactly as
// the world squashes it, so the ellipse you judge is the ellipse the chart
// will draw. A flat line is five handles in a row; the docks' V is the middle
// one pulled down; a listing wreck is whatever you draw.

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SubmergedSprite from '../SubmergedSprite'
import { SUBMERGE, SUBMERGE_ART, type Submerge } from '../submerge'

const GROUND = 0.58 // kept in step with SeaMap by hand, like the wake bench
const XS = [0, 25, 50, 75, 100] as const

/** The current table, resampled onto the bench's five fixed x-stops so every
 *  entry edits the same way whatever shape it was saved as. */
function toHandles(sub: Submerge): number[] {
  const at = (x: number): number => {
    const pts = sub.pts
    if (x <= pts[0][0]) return pts[0][1]
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]
        return y0 + ((x - x0) / Math.max(0.001, x1 - x0)) * (y1 - y0)
      }
    }
    return pts[pts.length - 1][1]
  }
  return XS.map(x => Math.round(at(x) * 10) / 10)
}

/** Handles back to points, dropping interior ones that sit on the straight
 *  line between their neighbours — a flat line saves as two points, a V as
 *  three, and only a genuinely drawn shape keeps all five. */
function toPts(h: number[]): [number, number][] {
  const pts: [number, number][] = XS.map((x, i) => [x, h[i]])
  const out: [number, number][] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = out[out.length - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1]
    const yOn = y0 + ((x1 - x0) / (x2 - x0)) * (y2 - y0)
    if (Math.abs(y1 - yOn) > 0.35) out.push(pts[i])
  }
  out.push(pts[pts.length - 1])
  return out
}

const KINDS = Object.keys(SUBMERGE)

export default function WaterlineBench() {
  const [kind, setKind] = useState(KINDS[0])
  const [table, setTable] = useState<Record<string, { keep: number; handles: number[] }>>(
    () => Object.fromEntries(KINDS.map(k => [k, { keep: SUBMERGE[k].keep, handles: toHandles(SUBMERGE[k]) }])))
  const [grab, setGrab] = useState<number | null>(null)
  const [squash, setSquash] = useState(true)
  const [copied, setCopied] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)

  const cur = table[kind]
  const sub: Submerge = useMemo(() => ({ keep: cur.keep, pts: toPts(cur.handles) }), [cur])

  const drag = useCallback((e: React.PointerEvent, i: number) => {
    const r = stage.current?.getBoundingClientRect()
    if (!r || !r.height) return
    // The stage may be squashed for preview; the handle's % is of the SPRITE,
    // so the squash divides back out of the pointer's y.
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))
    setTable(prev => ({
      ...prev,
      [kind]: { ...prev[kind], handles: prev[kind].handles.map((h, k) => (k === i ? Math.round(y * 10) / 10 : h)) },
    }))
  }, [kind])

  const source = useMemo(() => {
    const lines = KINDS.map(k => {
      const t = table[k]
      const pts = toPts(t.handles).map(([x, y]) => `[${x}, ${y}]`).join(', ')
      return `  '${k}': { keep: ${t.keep}, pts: [${pts}] },`
    }).join('\n')
    return `export const SUBMERGE: Record<string, Submerge> = {\n${lines}\n}\n`
  }, [table])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { /* selectable below */ }
  }

  return (
    <div className="page-col" style={{ paddingTop: '1rem', paddingBottom: '4rem', color: '#e6e2dc' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="font-pirata" style={{ fontSize: '1.9rem' }}>Waterline bench</h1>
        <Link href="/sea" className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#8fb8cf' }}>
          To the sea
        </Link>
      </div>
      <p className="font-karla" style={{
        fontSize: '0.9rem', color: 'rgba(198,216,230,0.72)', lineHeight: 1.6, margin: '4px 0 14px',
      }}>
        Drag the five handles to draw where the water crosses each object. The preview is
        the chart&apos;s own renderer on the sea&apos;s own colour. Copy the table into
        app/(app)/sea/submerge.ts.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {KINDS.map(k => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className="tap font-karla font-700" style={{
              padding: '0.35rem 0.6rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.74rem',
              background: kind === k ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${kind === k ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.14)'}`,
              color: kind === k ? '#f6dfa0' : '#cfe0ec',
            }}>
            {k}
          </button>
        ))}
      </div>

      {/* THE WATER. The preview squashes like the world does, because a line
          drawn against the unsquashed sprite lands somewhere else once the
          plane forshortens it — toggle it off only to reach fine detail. */}
      <div style={{
        borderRadius: 16, overflow: 'hidden', padding: '3rem 0 2rem',
        background: 'linear-gradient(180deg, #0e2231 0%, #0b1a24 60%, #081420 100%)',
        border: '1px solid rgba(150,196,222,0.2)',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ transform: squash ? `scaleY(${GROUND})` : 'none', transformOrigin: 'center' }}>
          <div ref={stage} style={{ position: 'relative', width: 340, touchAction: 'none' }}>
            <SubmergedSprite art={SUBMERGE_ART[kind]} width={340} sub={sub} />

            {/* The line itself, drawn between the handles. */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <polyline
                points={cur.handles.map((h, i) => `${XS[i]},${h}`).join(' ')}
                fill="none" stroke="rgba(120,220,255,0.85)" strokeWidth={1}
                vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />
            </svg>

            {cur.handles.map((h, i) => (
              <button key={i} type="button" aria-label={`waterline point ${i + 1}`}
                onPointerDown={e => {
                  e.preventDefault()
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  setGrab(i)
                }}
                onPointerMove={e => { if (grab === i) drag(e, i) }}
                onPointerUp={() => setGrab(null)}
                onPointerCancel={() => setGrab(null)}
                style={{
                  position: 'absolute', left: `${XS[i]}%`, top: `${h}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 20, height: 20, borderRadius: '50%', padding: 0,
                  background: 'rgba(6,14,22,0.5)',
                  border: `2px solid ${grab === i ? '#f0c040' : 'rgba(120,220,255,0.9)'}`,
                  cursor: 'ns-resize', touchAction: 'none',
                }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
        <label className="font-karla font-700" style={{ fontSize: '0.78rem', color: 'rgba(190,212,228,0.7)' }}>
          Seen through
        </label>
        <input type="range" min={0.05} max={0.5} step={0.01} value={cur.keep}
          onChange={e => setTable(prev => ({ ...prev, [kind]: { ...prev[kind], keep: Number(e.target.value) } }))}
          style={{ flex: 1 }} />
        <span className="font-karla font-700" style={{
          fontSize: '0.78rem', color: '#cfe0ec', width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}>{cur.keep.toFixed(2)}</span>
        <button type="button" onClick={() => setSquash(q => !q)} className="tap font-karla font-700"
          style={{
            padding: '0.4rem 0.7rem', borderRadius: 10, fontSize: '0.78rem', cursor: 'pointer',
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
        <button type="button"
          onClick={() => setTable(Object.fromEntries(KINDS.map(k => [k, { keep: SUBMERGE[k].keep, handles: toHandles(SUBMERGE[k]) }])))}
          className="tap font-karla font-700"
          style={{
            padding: '0.65rem 0.9rem', borderRadius: 12, fontSize: '0.88rem', cursor: 'pointer',
            background: 'rgba(6,14,22,0.6)', border: '1px solid rgba(180,214,232,0.26)', color: '#cfe0ec',
          }}>
          Back to shipped
        </button>
      </div>

      <pre className="font-karla" style={{
        fontSize: '0.76rem', lineHeight: 1.7, color: '#cfe0ec', margin: 0,
        padding: '0.75rem', borderRadius: 12, overflowX: 'auto',
        background: 'rgba(4,10,16,0.7)', border: '1px solid rgba(180,214,232,0.18)',
      }}>{source}</pre>
    </div>
  )
}
