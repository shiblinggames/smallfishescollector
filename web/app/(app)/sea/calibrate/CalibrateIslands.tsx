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
 * And it measures the FOOTPRINT, not the bounding box. Taking the sprite's full
 * width as its base was the gate's old mistake and it was a bad one: the corners
 * of a plate are transparent, so the two points it cared most about were empty
 * pixels hanging in the air beside the art. The Estate's ground spans 17% to 81%
 * of its plate. The bench reads the alpha of the bottom band the same way
 * scripts/check-islands does, and the drawn outline of the base shows what it
 * found.
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

/** Where a plate's paint actually meets the ground, as fractions across it.
 *  Measured once per art path and kept: it never changes. */
const FEET = new Map<string, { l: number; r: number }>()
const BAND = 0.15
const ALPHA = 24

function measureFoot(art: string): Promise<{ l: number; r: number }> {
  const hit = FEET.get(art)
  if (hit) return Promise.resolve(hit)
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      let out = { l: 0, r: 1 }
      try {
        const cv = document.createElement('canvas')
        // Read at a modest width. The footprint is a fraction of the plate, so
        // it is scale invariant, and 400 columns is finer than a percent.
        const w = 400, h = Math.max(1, Math.round((img.height / img.width) * w))
        cv.width = w; cv.height = h
        const g = cv.getContext('2d', { willReadFrequently: true })!
        g.drawImage(img, 0, 0, w, h)
        const { data } = g.getImageData(0, 0, w, h)
        const rowInk = (y: number) => {
          for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > ALPHA) return true
          return false
        }
        let top = 0, bot = h - 1
        while (top < h && !rowInk(top)) top++
        while (bot > top && !rowInk(bot)) bot--
        const band = Math.max(1, Math.round((bot - top) * BAND))
        let L = w, R = 0
        for (let y = bot - band; y <= bot; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > ALPHA) { if (x < L) L = x; if (x > R) R = x }
          }
        }
        if (R > L) out = { l: L / w, r: (R + 1) / w }
      } catch { /* a plate that will not read falls back to its whole box */ }
      FEET.set(art, out)
      resolve(out)
    }
    // An image that never loads measures as its whole box, which is the
    // cautious direction to be wrong in.
    img.onerror = () => { FEET.set(art, { l: 0, r: 1 }); resolve({ l: 0, r: 1 }) }
    img.src = art
  })
}

/** The three points the gate checks, in island-box percent: the centre of the
 *  base and both of its ends. The sprite is anchored bottom CENTRE, so a
 *  fraction f across the plate sits (f - 0.5) of the width from x. */
function basePoints(b: Item, f: { l: number; r: number }) {
  const w = b.scale * 100
  return [
    b.x + ((f.l + f.r) / 2 - 0.5) * w,
    b.x + (f.l - 0.5) * w,
    b.x + (f.r - 0.5) * w,
  ]
}

function worstOut(rs: number[], b: Item, f: { l: number; r: number }) {
  return Math.max(...basePoints(b, f).map(px => outByLand(rs, px, b.y, !!b.toShore)))
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

  /** Bumped as each plate finishes measuring, so the verdict appears as soon as
   *  the art is decoded rather than a drag later. */
  const [measured, setMeasured] = useState(0)

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

  // MEASURE WHATEVER IS ON THE BENCH. Cheap and cached, and it has to happen
  // before the verdict means anything: an unmeasured plate reads as solid to its
  // corners, which is exactly the wrong answer the gate used to give.
  useEffect(() => {
    let dead = false
    for (const b of items) {
      if (FEET.has(b.art)) continue
      void measureFoot(b.art).then(() => { if (!dead) setMeasured(n => n + 1) })
    }
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(b => b.art).join(',')])

  const foot = (art: string) => FEET.get(art) ?? { l: 0, r: 1 }
  void measured

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
        <span style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
          {/* The other bench. This one places buildings ON an island; that one
              places the whole shape of the expedition water. */}
          <Link href="/sea/calibrate/chart" className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#8fb8cf' }}>
            Chart bench
          </Link>
          <Link href="/sea" className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#8fb8cf' }}>
            To the chart
          </Link>
        </span>
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

            {/* ── THE BASE THE GATE ACTUALLY MEASURES ───────────────────
                The bar under the selected building is the span of its paint
                where it meets the ground, read off the plate's alpha. Drawn
                because the difference between it and the sprite's width is the
                entire reason the old check was failing correct placements, and
                a number in a readout does not make that visible the way a line
                sitting well inside the art does. */}
            {cur && (() => {
              const [c, l, r] = basePoints(cur, foot(cur.art))
              const bad = worstOut(rs, cur, foot(cur.art)) >= -1.5
              const ink = bad ? 'rgba(255,140,120,0.95)' : 'rgba(120,240,170,0.95)'
              return (
                <g>
                  <line x1={l} y1={cur.y} x2={r} y2={cur.y}
                    stroke={ink} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                  {[l, c, r].map((px, i) => (
                    <circle key={i} cx={px} cy={cur.y} r={i === 1 ? 0.7 : 1}
                      fill={i === 1 ? ink : 'none'} stroke={ink}
                      strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              )
            })()}
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
            const out = worstOut(rs, cur, foot(cur.art))
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
                {' · '}foot {((foot(cur.art).r - foot(cur.art).l) * cur.scale * 100).toFixed(0)}%
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
