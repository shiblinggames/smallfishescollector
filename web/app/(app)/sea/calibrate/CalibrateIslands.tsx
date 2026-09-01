'use client'

// ── THE ISLAND BENCH ────────────────────────────────────────────────────────
//
// Where the buildings standing on an island get their x, y and scale.
//
// ── IT IS THE REAL ISLAND, NOT A PICTURE OF ONE ─────────────────────────────
//
// This is the whole point and the reason a mock would have been worthless. An
// island is not an asset: its coastline is 160 seeded points, its terrain bands,
// crown, wood clumps and rim light are painted at bake time, and it is
// foreshortened by GROUND so it reads as a surface rather than a map. A drawing
// of a green circle would put every building in a plausible-looking place and
// half of them would be standing in the sea.
//
// So the bench calls `bakeIsland` — the same function the chart calls, from the
// same module, with the same `pad` the GPU layer computes — and stands the
// buildings on it with the same transform seaTown uses on the canvas and
// PlaceIsland uses in the DOM:
//
//     anchored at the FEET, width d * scale, counter-squashed scaleY(1 / GROUND)
//
// If those two ever disagree with this file, the bench is lying and the numbers
// it produces are wrong. There is no third copy of the maths here: the constants
// are imported.
//
// ── THE HOMESTEAD IS A LADDER, NOT A LIST ───────────────────────────────────
//
// Every other island's buildings are written down in chart.ts. The Homestead's
// is one painting per house rung, sharing one position, so it gets a rung picker
// and emits HOUSE_AT plus a scale per rung. Same bench, different table out.
//
// Admin only, linked from nowhere, writes nothing.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PLACES } from '../chart'
import { GROUND, bakeIsland, requestGround } from '../islandArt'
import { HOUSE, HOUSE_AT } from '@/lib/homestead'

type Item = { art: string; x: number; y: number; scale: number; toShore?: boolean }

/** Every island you could stand a building on. Waters have no land and the
 *  inner rings are bands rather than discs. */
const ISLANDS = PLACES.filter(p => p.kind !== 'water' && p.inner === undefined)

/** How wide the bench draws an island, in CSS pixels. Nothing depends on it —
 *  the island is baked at its real `d` and scaled to fit — but it wants to be
 *  big enough that a one percent nudge is visible. */
const VIEW = 620

export default function CalibrateIslands() {
  const [placeId, setPlaceId] = useState(ISLANDS[0].id)
  const [rung, setRung] = useState(HOUSE.length - 1)
  const [held, setHeld] = useState<number | null>(null)
  const [pick, setPick] = useState(0)
  const [copied, setCopied] = useState(false)
  /** Bumped when the turf and rock textures land. The bake is synchronous and
   *  the images are not, so the first one goes without them; `requestGround`
   *  drops the island cache when they arrive and this re-runs the memo. */
  const [painted, setPainted] = useState(0)

  const place = ISLANDS.find(p => p.id === placeId) ?? ISLANDS[0]
  const isHome = place.id === 'home'

  /** THE HOMESTEAD'S POSITION IS SHARED ACROSS RUNGS and only the scale differs,
   *  which is exactly what the data says, so the bench holds it the same way. */
  const [homeAt, setHomeAt] = useState({ x: HOUSE_AT.x, y: HOUSE_AT.y })
  const [homeScales, setHomeScales] = useState<number[]>(HOUSE.map(b => b.scale))
  const [rows, setRows] = useState<Record<string, Item[]>>(
    () => Object.fromEntries(ISLANDS.map(p => [p.id, (p.buildings ?? []).map(b => ({ ...b }))])))

  // The paint arrives after the first bake and drops the island cache, so
  // anything already drawn was drawn without turf on it. Repaint when it lands.
  useEffect(() => { requestGround(() => setPainted(n => n + 1)) }, [])

  const d = place.r * 2
  // THE CHART'S OWN PADDING, copied from SeaIslandsGPU: the widest shoal wash
  // plus the blur's spill. The baked canvas is (d + pad*2) square with the
  // island's own box centred inside it.
  const pad = Math.round(d * 0.08) + 24
  const full = d + pad * 2
  /** Everything on screen is the island scaled to fit the bench. */
  const k = VIEW / full

  const island = useMemo(() => {
    if (typeof window === 'undefined') return null
    try { return bakeIsland(place.id, d, false, pad).toDataURL() } catch { return null }
  }, [place.id, d, pad, painted])

  const items: Item[] = isHome
    ? [{ art: HOUSE[rung].art, x: homeAt.x, y: homeAt.y, scale: homeScales[rung] }]
    : (rows[place.id] ?? [])
  const cur = items[Math.min(pick, Math.max(0, items.length - 1))]

  const setItem = (i: number, patch: Partial<Item>) => {
    if (isHome) {
      if (patch.x !== undefined || patch.y !== undefined) {
        setHomeAt(a => ({ x: patch.x ?? a.x, y: patch.y ?? a.y }))
      }
      if (patch.scale !== undefined) {
        setHomeScales(s => s.map((v, j) => (j === rung ? patch.scale! : v)))
      }
      return
    }
    setRows(prev => ({
      ...prev,
      [place.id]: (prev[place.id] ?? []).map((b, j) => (j === i ? { ...b, ...patch } : b)),
    }))
  }

  /** Pointer to percent of the island BOX — not of the padded canvas, which is
   *  the trap here: the percentages the chart stores are of `d`, and the thing
   *  on screen is `d + pad * 2` wide. */
  const move = (e: React.PointerEvent, i: number) => {
    const el = (e.currentTarget as HTMLElement).closest('[data-box]') as HTMLElement | null
    if (!el) return
    const r = el.getBoundingClientRect()
    setItem(i, {
      x: Math.round(Math.max(-20, Math.min(120, ((e.clientX - r.left) / r.width) * 100))),
      y: Math.round(Math.max(-20, Math.min(120, ((e.clientY - r.top) / r.height) * 100))),
    })
  }

  const nudge = (e: React.KeyboardEvent, i: number) => {
    const step = e.shiftKey ? 5 : 1
    const dxy: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    }
    const m = dxy[e.key]
    if (!m || !cur) return
    e.preventDefault()
    setItem(i, { x: cur.x + m[0], y: cur.y + m[1] })
  }

  const source = useMemo(() => {
    if (isHome) {
      return `export const HOUSE_AT = { x: ${homeAt.x}, y: ${homeAt.y} }\n\n`
        + HOUSE.map((b, i) => `// ${b.name}\nscale: ${homeScales[i].toFixed(2)},`).join('\n')
        + '\n'
    }
    return 'buildings: [\n'
      + (rows[place.id] ?? []).map(b =>
        `  { art: '${b.art}', x: ${b.x}, y: ${b.y}, scale: ${b.scale.toFixed(2)}`
        + `${b.toShore ? ', toShore: true' : ''} },`).join('\n')
      + '\n],\n'
  }, [isHome, homeAt, homeScales, rows, place.id])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* the block below is selectable either way */ }
  }

  return (
    <div style={{ padding: '1rem 1rem 4rem', maxWidth: '48rem', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#e6e2dc' }}>
          Island bench
        </h1>
        <Link href="/sea" className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#8fb8cf' }}>
          To the chart
        </Link>
      </div>
      <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(190,212,228,0.6)', margin: '4px 0 14px', lineHeight: 1.5 }}>
        This is the real island, baked by the same function the chart bakes it with, and the
        buildings carry the same transform they carry out there: anchored at the FEET, counter
        squashed so they stand up off the plane. What you see is what the sea shows.
        The dashed square is the island&rsquo;s BOX, which is what the percentages are of.
      </p>

      {/* ── WHICH ISLAND ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {ISLANDS.map(p => (
          <button key={p.id} type="button" onClick={() => { setPlaceId(p.id); setPick(0) }}
            className="font-karla font-700"
            style={{
              padding: '0.36rem 0.7rem', borderRadius: 999, fontSize: '0.76rem', cursor: 'pointer',
              color: placeId === p.id ? '#0d1520' : 'rgba(214,232,240,0.82)',
              background: placeId === p.id ? '#8fd0e8' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${placeId === p.id ? '#8fd0e8' : 'rgba(255,255,255,0.14)'}`,
            }}>{p.name}</button>
        ))}
      </div>

      {/* ── WHICH RUNG ── the Homestead only. */}
      {isHome && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {HOUSE.map((b, i) => (
          <button key={b.name} type="button" onClick={() => setRung(i)}
            className="font-karla font-700"
            style={{
              padding: '0.36rem 0.7rem', borderRadius: 999, fontSize: '0.76rem', cursor: 'pointer',
              color: rung === i ? '#0d1520' : 'rgba(214,232,240,0.82)',
              background: rung === i ? '#f0c464' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${rung === i ? '#f0c464' : 'rgba(255,255,255,0.14)'}`,
            }}>{b.name}</button>
        ))}
      </div>}

      {/* ── THE ISLAND ─────────────────────────────────────────────────
          On a sea-coloured ground, because an island judged against a page
          background is an island judged against the wrong thing: how far the
          shore reaches is most of what you are looking at. */}
      <div style={{
        position: 'relative', width: VIEW, height: VIEW, maxWidth: '100%',
        margin: '0 auto', borderRadius: 12, overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 50%, #2f6f8f 0%, #235a78 62%, #16405c 100%)',
        touchAction: 'none',
      }}>
        {island && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={island} alt="" draggable={false} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
          }} />
        )}

        {/* THE ISLAND'S BOX, inset by the padding. Everything below is placed in
            percentages OF THIS, which is why it is drawn: a building at x 50 is
            at the middle of this square and not of the picture. */}
        <div data-box style={{
          position: 'absolute',
          left: pad * k, top: pad * k, width: d * k, height: d * k,
          outline: '1px dashed rgba(255,255,255,0.22)',
        }}>
          {items.map((b, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
              width: d * b.scale * k,
              // THE CHART'S TRANSFORM, not an approximation of it. seaTown does
              // scale(k, k / GROUND) on a sprite anchored (0.5, 1); this is the
              // same thing said in CSS, and PlaceIsland's DOM path says it this
              // way already.
              transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
              transformOrigin: 'bottom center',
              outline: pick === i ? '1px dashed rgba(240,196,100,0.8)' : 'none',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.art} alt="" draggable={false}
                style={{ width: '100%', display: 'block', opacity: pick === i ? 1 : 0.82 }} />
            </div>
          ))}

          {items.map((b, i) => (
            <button key={i} type="button" aria-label={`${b.art} handle`}
              onPointerDown={e => {
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                setPick(i); setHeld(i)
              }}
              onPointerMove={e => { if (held === i) move(e, i) }}
              onPointerUp={() => setHeld(null)}
              onPointerCancel={() => setHeld(null)}
              onFocus={() => setPick(i)}
              onKeyDown={e => nudge(e, i)}
              style={{
                position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 15, height: 15, borderRadius: '50%', padding: 0, cursor: 'grab',
                background: pick === i ? '#f0c464' : 'rgba(240,196,100,0.4)',
                border: '2px solid rgba(10,16,22,0.85)',
              }} />
          ))}
        </div>
      </div>

      {/* ── WHICH BUILDING ── */}
      {!isHome && items.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 8px' }}>
          {items.map((b, i) => (
            <button key={i} type="button" onClick={() => setPick(i)}
              className="font-karla font-700"
              style={{
                padding: '0.3rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', cursor: 'pointer',
                color: pick === i ? '#0d1520' : 'rgba(214,232,240,0.8)',
                background: pick === i ? '#8fd0e8' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${pick === i ? '#8fd0e8' : 'rgba(255,255,255,0.14)'}`,
              }}>{b.art.split('/').pop()?.replace('.png', '')}</button>
          ))}
        </div>
      )}

      {cur && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12,
          padding: '0.7rem 0.8rem', borderRadius: 12,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0c464', minWidth: 92 }}>
            {isHome ? HOUSE[rung].name : cur.art.split('/').pop()?.replace('.png', '')}
          </span>
          <span className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(190,212,228,0.7)', fontVariantNumeric: 'tabular-nums' }}>
            x {cur.x} · y {cur.y} · scale {cur.scale.toFixed(2)} ({Math.round(d * cur.scale)}px)
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
            <span className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(190,212,228,0.55)' }}>Scale</span>
            <input type="range" min={2} max={100} value={Math.round(cur.scale * 100)} style={{ flex: 1 }}
              onChange={e => setItem(pick, { scale: Number(e.target.value) / 100 })} />
          </label>
        </div>
      )}

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
        The Homestead goes into <code>lib/homestead.ts</code>: one HOUSE_AT for every rung, and a
        scale per rung. Every other island goes into its own entry in{' '}
        <code>app/(app)/sea/chart.ts</code>. Then run <code>npm run check</code>, which measures
        every building against the same coastline this bench drew and fails on anything standing
        in the surf.
      </p>
    </div>
  )
}
