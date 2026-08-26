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
import { coastline, grassAt, outBy, GRASS } from '../lib/islandShape'
import { HOTSPOTS } from '../lib/homestead'

/* The coastline and the grass both come from lib/islandShape now — the same
   module PlaceIsland draws from, so this cannot drift from what is on screen
   the way it did before. */

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
