/**
 * DOES EVERY BUILDING STAND ON THE GRASS?
 *
 * Buildings are placed by percentage of the island BOX, but the grass is a
 * seeded 160-point coastline inside that box — so "x: 76" is not a position on
 * the land, it is a position on a square that the land only partly fills. The
 * two were never checked against each other, and several buildings sit out over
 * the water.
 *
 * This reproduces both exactly: the coastline generator from PlaceIsland, and
 * the grass layer's own 15% inset. A building passes only if the whole BASE it
 * stands on is inside the grass, corners included.
 */
import { PLACES } from '../app/(app)/sea/chart'
import { HOTSPOTS } from '../lib/homestead'

/** The coastline from PlaceIsland, character for character. */
function coastline(id: string): number[] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const rnd = (n: number) => (((h >>> (n * 3)) % 1000) / 1000)
  const rug = 0.70 + rnd(1) * 0.35
  const N = 160
  const out: number[] = []
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 * i) / N
    const wobble =
      0.095 * Math.sin(a * (1 + Math.floor(rnd(2) * 2)) + rnd(3) * 6.28) +
      0.055 * Math.sin(a * 3 + rnd(4) * 6.28) +
      0.028 * Math.cos(a * 5 - rnd(5) * 6.28) +
      0.012 * Math.sin(a * 9 + rnd(6) * 6.28) +
      0.004 * Math.cos(a * 17 + rnd(7) * 6.28)
    out.push(46 + wobble * rug * 100)
  }
  return out
}

/**
 * The grass radius at an angle, as a percentage of the island box from centre.
 *
 * ── THIS NUMBER WAS WRONG AND THE CHECK PASSED ANYWAY ──────────────────
 *
 * It used to be 0.7, reasoned as "the grass layer is `inset: 15%`, so its box
 * is 70% of the island's". The first half is right and the conclusion is not:
 * the grass div is not a child of the ISLAND, it is a child of the TOP FACE,
 * which is itself `inset: 13%`. The insets compound.
 *
 *     top face box   = 100% - 2*13%  = 74% of the island box
 *     grass box      = 74% * (100% - 2*15%) = 74% * 70% = 51.8%
 *
 * So the real grass reaches 0.518 of a coastline radius, not 0.7 — the check
 * was handing every building 35% more land than exists. It reported "0
 * buildings not standing wholly on the grass" while buildings were visibly
 * hanging over the water, which is the worst way for a checker to fail: it
 * does not just miss the bug, it certifies it.
 */
const GRASS = 0.7 * 0.74

function grassAt(rs: number[], angle: number): number {
  const N = rs.length
  let a = angle
  while (a < 0) a += Math.PI * 2
  while (a >= Math.PI * 2) a -= Math.PI * 2
  const t = (a / (Math.PI * 2)) * N
  const i = Math.floor(t) % N
  const j = (i + 1) % N
  const f = t - Math.floor(t)
  return (rs[i] * (1 - f) + rs[j] * f) * GRASS
}

/** How far outside the grass a point is, in box-percent. Negative is inside. */
function outBy(rs: number[], x: number, y: number): number {
  const dx = x - 50, dy = y - 50
  return Math.hypot(dx, dy) - grassAt(rs, Math.atan2(dy, dx))
}

type Item = { label: string; x: number; y: number; scale: number }

function check(id: string, name: string, items: Item[]) {
  const rs = coastline(id)
  const lo = Math.min(...rs) * GRASS, hi = Math.max(...rs) * GRASS
  console.log(`\n  ${name}  (grass reaches ${lo.toFixed(1)}%..${hi.toFixed(1)}% from centre)`)
  let bad = 0
  for (const it of items) {
    const hw = it.scale * 50            // half the sprite's width, in box-percent
    // The base it stands on: centre and both bottom corners.
    const pts: [string, number, number][] = [
      ['centre', it.x, it.y],
      ['left', it.x - hw, it.y],
      ['right', it.x + hw, it.y],
    ]
    const worst = pts.reduce((w, [tag, px, py]) => {
      const d = outBy(rs, px, py)
      return d > w.d ? { tag, d } : w
    }, { tag: '', d: -Infinity })
    const ok = worst.d < -1.5           // 1.5% of margin, so nothing sits on the surf
    if (!ok) bad++
    console.log(`    ${ok ? 'ok  ' : 'OFF '} ${it.label.padEnd(20)} at ${String(it.x).padStart(3)},${String(it.y).padStart(3)} w${(hw * 2).toFixed(0).padStart(3)}` +
      `   worst ${worst.tag.padEnd(6)} ${worst.d > 0 ? '+' : ''}${worst.d.toFixed(1)}%`)
  }
  return bad
}

let bad = 0
for (const p of PLACES) {
  if (p.inner !== undefined) continue
  if (p.id === 'home') {
    // Worst case per spot: the biggest thing that can ever stand there.
    bad += check(p.id, `${p.name} (largest build on each spot)`, HOTSPOTS.map(h => ({
      label: h.label,
      x: h.x, y: h.y,
      scale: Math.max(...h.builds.map(b => b.scale)),
    })))
  } else {
    bad += check(p.id, p.name, (p.buildings ?? []).map(b => ({
      label: b.art.split('/').pop()!.replace('.png', ''),
      x: b.x, y: b.y, scale: b.scale,
    })))
  }
}
console.log(`\n  ${bad} building${bad === 1 ? '' : 's'} not standing wholly on the grass.`)
if (bad) process.exitCode = 1
