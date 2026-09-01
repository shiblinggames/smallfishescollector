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
// is one painting per house rung, each with its OWN x, y and scale — they are
// five separate paintings and the point where their ground meets the island
// falls in a slightly different place in each. So it gets a rung picker, one
// rung is on the bench at a time, and it emits the whole ladder.
//
// Admin only, linked from nowhere, writes nothing.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PLACES } from '../chart'
import { GROUND, bakeIsland, requestGround } from '../islandArt'
import { HOUSE } from '@/lib/homestead'
import { coastline, grassAt, GRASS, BUILDABLE, SHORE } from '@/lib/islandShape'

type Item = { art: string; x: number; y: number; scale: number; toShore?: boolean }

/** Every island you could stand a building on. Waters have no land and the
 *  inner rings are bands rather than discs. */
const ISLANDS = PLACES.filter(p => p.kind !== 'water' && p.inner === undefined)

/**
 * ── AND IT SHOWS YOU WHERE THE LAND STOPS ───────────────────────────────────
 *
 * `npm run check` measures every building against the buildable band and fails
 * anything standing in the surf, which is a good gate and a terrible way to
 * place things: you drag, you paste, you run the check, and you learn you were
 * eight percent out. So the same maths runs HERE, live, and the boundary is
 * drawn on the island.
 *
 * The band a building is measured against depends on the building. One cottage
 * gets the cautious scrub line; a TOWN gets the shore, because a town's outer
 * houses are supposed to stand on the sand. Both are drawn, and the one that
 * applies is the solid one.
 *
 * It is a BASE test, not a silhouette test: it takes the sprite's full width as
 * if it were solid along its footing, which for a town of irregular houses with
 * transparent margins is pessimistic. Read a small overhang as a warning rather
 * than a verdict, and a large one as the verdict it is.
 */
const K = BUILDABLE / GRASS
const K_SHORE = SHORE / GRASS

/** How far outside its own band a point is, as a percent of the island box.
 *  Negative is clear land. Lifted from scripts/check-islands so the bench and
 *  the gate cannot disagree about what "on the land" means. */
function outByLand(rs: number[], x: number, y: number, toShore: boolean) {
  return Math.hypot(x - 50, y - 50)
    - grassAt(rs, Math.atan2(y - 50, x - 50)) * (toShore ? K_SHORE : K)
}

/** The worst of the three points the gate checks: the centre of the base and
 *  both of its corners. */
function worstOut(rs: number[], b: Item) {
  const hw = b.scale * 50
  return Math.max(
    outByLand(rs, b.x, b.y, !!b.toShore),
    outByLand(rs, b.x - hw, b.y, !!b.toShore),
    outByLand(rs, b.x + hw, b.y, !!b.toShore),
  )
}

/** One band's outline as an SVG polygon, in the island box's own percent. */
function bandPoints(rs: number[], k: number) {
  return rs.map((r, i) => {
    const a = (Math.PI * 2 * i) / rs.length
    return `${(50 + Math.cos(a) * r * k).toFixed(2)},${(50 + Math.sin(a) * r * k).toFixed(2)}`
  }).join(' ')
}

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

  /** One row per rung, each carrying its own three numbers. */
  const [house, setHouse] = useState(() => HOUSE.map(b => ({ x: b.x, y: b.y, scale: b.scale })))
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

  const rs = useMemo(() => coastline(place.id), [place.id])

  const island = useMemo(() => {
    if (typeof window === 'undefined') return null
    try { return bakeIsland(place.id, d, false, pad).toDataURL() } catch { return null }
  }, [place.id, d, pad, painted])

  const items: Item[] = isHome
    ? [{ art: HOUSE[rung].art, ...house[rung] }]
    : (rows[place.id] ?? [])
  const cur = items[Math.min(pick, Math.max(0, items.length - 1))]

  const setItem = (i: number, patch: Partial<Item>) => {
    if (isHome) {
      setHouse(prev => prev.map((r, j) => (j === rung ? { ...r, ...patch } : r)))
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
      // One line per rung, in the order HOUSE lists them, ready to drop onto
      // each entry. NOT the whole HOUSE array: the costs and the copy live there
      // too, and a bench should never be able to overwrite those.
      return HOUSE.map((b, i) =>
        `// ${b.name}\nx: ${house[i].x}, y: ${house[i].y}, scale: ${house[i].scale.toFixed(2)},`)
        .join('\n') + '\n'
    }
    return 'buildings: [\n'
      + (rows[place.id] ?? []).map(b =>
        `  { art: '${b.art}', x: ${b.x}, y: ${b.y}, scale: ${b.scale.toFixed(2)}`
        + `${b.toShore ? ', toShore: true' : ''} },`).join('\n')
      + '\n],\n'
  }, [isHome, house, rows, place.id])

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
        The dashed square is the island&rsquo;s BOX, which is what the percentages are of, and the
        green outline is how far out you may build. A single building is measured against the
        cautious scrub line; a TOWN gets the shore, because a town&rsquo;s outer houses are meant to
        stand on the sand.
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

      {/* ── COPY FROM ── the five rungs are one homestead growing, so their
          numbers are always close and never equal. Start from the neighbour. */}
      {isHome && <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(190,212,228,0.45)' }}>
          Copy from
        </span>
        {HOUSE.map((b, i) => i === rung ? null : (
          <button key={b.name} type="button"
            onClick={() => setHouse(prev => prev.map((r, j) => (j === rung ? { ...prev[i] } : r)))}
            className="font-karla font-700"
            style={{
              padding: '0.28rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', cursor: 'pointer',
              color: 'rgba(214,232,240,0.7)', background: 'rgba(255,255,255,0.04)',
              border: '1px dashed rgba(255,255,255,0.2)',
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
          {/* ── WHERE THE LAND STOPS ────────────────────────────────
              Under the buildings, so it never hides one. The band that
              actually applies to the selected building is drawn solid; the
              other is a hint. */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
          }}>
            <polygon points={bandPoints(rs, K)} fill="none"
              stroke={cur?.toShore ? 'rgba(255,255,255,0.2)' : 'rgba(120,240,170,0.75)'}
              strokeWidth={cur?.toShore ? 0.25 : 0.4}
              strokeDasharray={cur?.toShore ? '1 1.4' : undefined}
              vectorEffect="non-scaling-stroke" />
            <polygon points={bandPoints(rs, K_SHORE)} fill="none"
              stroke={cur?.toShore ? 'rgba(120,240,170,0.75)' : 'rgba(255,255,255,0.2)'}
              strokeWidth={cur?.toShore ? 0.4 : 0.25}
              strokeDasharray={cur?.toShore ? undefined : '1 1.4'}
              vectorEffect="non-scaling-stroke" />
          </svg>

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
          {/* THE SAME VERDICT `npm run check` WILL GIVE, before you paste rather
              than after. The gate wants 1.5% of margin so nothing sits on the
              surf, so that is the number quoted. */}
          {(() => {
            const out = worstOut(rs, cur)
            const ok = out < -1.5
            return (
              <span className="font-karla font-700" style={{
                fontSize: '0.74rem', padding: '0.16rem 0.5rem', borderRadius: 999,
                fontVariantNumeric: 'tabular-nums',
                color: ok ? '#8fe8b4' : '#ffb4a8',
                background: ok ? 'rgba(120,240,170,0.12)' : 'rgba(255,120,100,0.14)',
                border: `1px solid ${ok ? 'rgba(120,240,170,0.4)' : 'rgba(255,120,100,0.45)'}`,
              }}>
                {ok ? `on the land, ${(-out).toFixed(1)}% clear` : `OFF the land by ${(out + 1.5).toFixed(1)}%`}
              </span>
            )
          })()}
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
        The Homestead goes into <code>lib/homestead.ts</code>, one line onto each rung of{' '}
        <code>HOUSE</code>. Every other island goes into its own entry in{' '}
        <code>app/(app)/sea/chart.ts</code>. Then run <code>npm run check</code>, which measures
        every building against the same coastline this bench drew and fails on anything standing
        in the surf.
      </p>
    </div>
  )
}
