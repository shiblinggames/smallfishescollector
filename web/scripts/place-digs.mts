/**
 * Place the buried dig sites, then print them for lib/seaDigs.ts.
 *
 * Same rejection sample as the isles, plus the isles themselves as obstacles.
 * A dig site sitting on an island would be found by everyone who went ashore,
 * which is the one thing these are supposed not to be.
 *
 * They are also kept well clear of the shipping between ports so nobody stumbles
 * on one on their first crossing. Rare accidents are the good kind; a dig site
 * on the dock road is just a slower isle.
 */
import { PLACES, LANDMARKS, RESIDENTS, YOON } from '../app/(app)/sea/chart'
import { ISLES } from '../lib/seaIsles'

const BANDS = [
  { id: 'shallows', n: 1, gap: 2600 },
  { id: 'open_waters', n: 2, gap: 3000 },
  { id: 'deep', n: 3, gap: 3400 },
  { id: 'abyss', n: 3, gap: 3800 },
  { id: 'ancient_deep', n: 3, gap: 4200 },
]

const AVOID: { x: number; y: number; keep: number }[] = []
for (const p of PLACES) {
  if (p.inner !== undefined) continue
  AVOID.push({ x: p.x, y: p.y, keep: p.r + 1800 })     // wide: keep off the dock road
}
for (const l of LANDMARKS) AVOID.push({ x: l.x, y: l.y, keep: l.size + 500 })
for (const r of RESIDENTS) AVOID.push({ x: r.x, y: r.y, keep: 900 })
for (const i of ISLES) AVOID.push({ x: i.x, y: i.y, keep: i.r + 1400 })
AVOID.push({ x: YOON.x, y: YOON.y, keep: 1200 })

let seed = 0x51a2f39
const nx = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 0x100000000 }

const placed: { id: string; band: string; x: number; y: number; ang: number }[] = []
const gapOf = (id: string) => BANDS.find(b => b.id === id)!.gap

for (const b of BANDS) {
  const band = PLACES.find(p => p.id === b.id)!
  const inner = band.inner!, outer = band.outer!
  for (let i = 0; i < b.n; i++) {
    let ok = false
    for (let tries = 0; tries < 6000 && !ok; tries++) {
      const slice = Math.PI / b.n
      const ang = slice * (i + 0.12 + nx() * 0.76)
      const rad = inner + 700 + nx() * (outer - inner - 1400)
      const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad
      if (y < 700) continue
      const clash = AVOID.some(a => Math.hypot(a.x - x, a.y - y) < a.keep)
        || placed.some(p => Math.hypot(p.x - x, p.y - y) < Math.max(b.gap, gapOf(p.band)))
      if (clash) continue
      placed.push({ id: `${b.id}-dig-${i}`, band: b.id, x: Math.round(x), y: Math.round(y), ang })
      ok = true
    }
    if (!ok) console.error(`!! could not place ${b.id}-dig-${i}`)
  }
}

console.log(`placed ${placed.length} dig sites\n`)
let pair = Infinity, obst = Infinity, toIsle = Infinity
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    pair = Math.min(pair, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y))
  }
  for (const a of AVOID) obst = Math.min(obst, Math.hypot(a.x - placed[i].x, a.y - placed[i].y) - a.keep)
  for (const s of ISLES) toIsle = Math.min(toIsle, Math.hypot(s.x - placed[i].x, s.y - placed[i].y))
}
console.log(`closest two sites      ${pair.toFixed(0)}px`)
console.log(`tightest clearance     ${obst.toFixed(0)}px past every keep-out`)
console.log(`nearest isle to a site ${toIsle.toFixed(0)}px`)
for (const b of BANDS) {
  const inB = placed.filter(p => p.band === b.id)
  console.log(`  ${b.id.padEnd(13)} ${inB.length}  bearings ${inB.map(p => (p.ang * 180 / Math.PI).toFixed(0)).join(', ')}`)
}
console.log('\n// ── paste ──')
for (const p of placed) console.log(`  { id: '${p.id}', x: ${String(p.x).padStart(7)}, y: ${String(p.y).padStart(6)} },`)
