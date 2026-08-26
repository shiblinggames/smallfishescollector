/**
 * Place the discoverable isles, then print them as a table to paste into
 * lib/seaIsles.ts. Run once; the OUTPUT is the source of truth, not this.
 *
 * Placement is a rejection sample against everything already on the chart, so
 * an isle can never land on a port, inside a landmark, on a moored trader, or
 * so close to another isle that finding one hands you the next.
 */
import { PLACES, LANDMARKS, RESIDENTS, YOON } from '../app/(app)/sea/chart'

// `gap` is per band on purpose. The Shallows are 2,400px wide and ringed by
// the Mainland's keep-out; at the Ancient Deep's spacing only three isles fit
// on the arc at all. Inner water is tighter, so the isles sit closer together.
// `r` floors at 130 for a reason: the boat is 210 pixels across, and the first
// pass put isles as small as r 87 — a 174px island, NARROWER THAN THE BOAT
// moored at it. That does not read as somewhere you go ashore, it reads as a
// stone you would run over. The smallest isle is now wider than the boat and
// the largest matches a port's footprint, which is the range that says
// "landfall, not a town".
const BANDS = [
  { id: 'shallows', n: 3, caches: 1, rMin: 130, rMax: 155, gap: 1900 },
  { id: 'open_waters', n: 6, caches: 4, rMin: 140, rMax: 170, gap: 2300 },
  { id: 'deep', n: 6, caches: 4, rMin: 150, rMax: 185, gap: 2600 },
  { id: 'abyss', n: 6, caches: 4, rMin: 160, rMax: 195, gap: 3000 },
  { id: 'ancient_deep', n: 6, caches: 5, rMin: 170, rMax: 210, gap: 3200 },
]

// Everything an isle must keep clear of, as {x, y, keep}.
const AVOID: { x: number; y: number; keep: number }[] = []
for (const p of PLACES) {
  if (p.inner !== undefined) continue          // bands are not obstacles
  AVOID.push({ x: p.x, y: p.y, keep: p.r + 1200 })
}
for (const l of LANDMARKS) AVOID.push({ x: l.x, y: l.y, keep: l.size + 700 })
for (const r of RESIDENTS) AVOID.push({ x: r.x, y: r.y, keep: 1100 })
AVOID.push({ x: YOON.x, y: YOON.y, keep: 1400 })

const gapOf = (id: string) => BANDS.find(b => b.id === id)!.gap

let seed = 0x2f6e2b1
const nx = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 0x100000000 }

const placed: { id: string; band: string; x: number; y: number; r: number; kind: string; ang: number }[] = []

for (const b of BANDS) {
  const band = PLACES.find(p => p.id === b.id)!
  const inner = band.inner!, outer = band.outer!
  // Spread by ANGLE across the semicircle, one isle per slice, jittered inside
  // it. Pure rejection sampling clumps; slices guarantee they ring the band.
  for (let i = 0; i < b.n; i++) {
    const r = b.rMin + nx() * (b.rMax - b.rMin)
    let ok = false
    for (let tries = 0; tries < 4000 && !ok; tries++) {
      const slice = Math.PI / b.n
      const ang = slice * (i + 0.15 + nx() * 0.7)          // 0..PI, south half
      const rad = inner + r + 320 + nx() * (outer - inner - r * 2 - 640)
      const x = Math.cos(ang) * rad
      const y = Math.sin(ang) * rad
      if (y < 420) continue                                 // stay off the coast
      const clash = AVOID.some(a => Math.hypot(a.x - x, a.y - y) < a.keep + r)
        || placed.some(p => Math.hypot(p.x - x, p.y - y) < Math.max(b.gap, gapOf(p.band)))
      if (clash) continue
      placed.push({
        id: `${b.id}-${i}`, band: b.id,
        x: Math.round(x), y: Math.round(y), r: Math.round(r),
        kind: i < b.caches ? 'cache' : 'note', ang,
      })
      ok = true
    }
    if (!ok) console.error(`!! could not place ${b.id}-${i}`)
  }
}

// ── report ────────────────────────────────────────────────────────────────
console.log(`placed ${placed.length} isles\n`)
let worstPair = Infinity, worstAvoid = Infinity
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    worstPair = Math.min(worstPair, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y))
  }
  for (const a of AVOID) {
    worstAvoid = Math.min(worstAvoid, Math.hypot(a.x - placed[i].x, a.y - placed[i].y) - a.keep - placed[i].r)
  }
}
console.log(`closest two isles      : ${worstPair.toFixed(0)}px  (floors ${BANDS.map(b => b.gap).join('/')})`)
console.log(`tightest clearance     : ${worstAvoid.toFixed(0)}px past the keep-out`)
for (const b of BANDS) {
  const inB = placed.filter(p => p.band === b.id)
  const rads = inB.map(p => Math.hypot(p.x, p.y))
  const band = PLACES.find(p => p.id === b.id)!
  const angs = inB.map(p => (p.ang * 180 / Math.PI).toFixed(0)).join(', ')
  console.log(`${b.id.padEnd(13)} ${inB.length} isles  radius ${Math.min(...rads).toFixed(0)}..${Math.max(...rads).toFixed(0)}` +
    ` (band ${band.inner}..${band.outer})  bearings ${angs}`)
}
console.log('\n// ── paste ──')
for (const p of placed) {
  console.log(`  { id: '${p.id}', x: ${String(p.x).padStart(7)}, y: ${String(p.y).padStart(6)}, r: ${p.r}, kind: '${p.kind}' },`)
}
