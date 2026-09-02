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
import { coastline, grassAt, outBy, GRASS, BUILDABLE, SHORE } from '../lib/islandShape'
import { HOUSE } from '../lib/homestead'

/* The coastline and the grass both come from lib/islandShape now — the same
   module PlaceIsland draws from, so this cannot drift from what is on screen
   the way it did before. */

type Item = { label: string; art: string; x: number; y: number; scale: number; toShore?: boolean }

/**
 * ── IT MEASURES THE FOOTPRINT, NOT THE BOUNDING BOX ─────────────────────────
 *
 * This checker used to test the sprite's full width: x - scale*50 and
 * x + scale*50, on the reasoning that those are the corners of its base. They
 * are not. They are the corners of its BOX, and the corners of a box are usually
 * transparent — the Estate's ground only spans 17% to 81% of its plate, and the
 * mainland town's 22% to 79%. So the two points the gate cared most about were
 * empty pixels hanging in the air beside the art, and it was failing placements
 * that were visibly correct on the island.
 *
 * A false failure is worse than no check: it teaches you to override the gate,
 * and then the gate is not there for the real one.
 *
 * So the base is READ OFF THE ART — the leftmost and rightmost opaque pixels in
 * the bottom band of the paint. `top`/`bot` scan past any transparent padding
 * first, so the band is a share of what is DRAWN rather than of the file.
 */
const BAND = 0.15
const ALPHA = 24

const feet = new Map<string, { l: number; r: number }>()

async function footprint(art: string): Promise<{ l: number; r: number }> {
  const hit = feet.get(art)
  if (hit) return hit
  // A plate that cannot be read falls back to the whole box, which is the old
  // behaviour and the cautious direction to be wrong in.
  let out = { l: 0, r: 1 }
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(`public${art}`).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true })
    const { width: w, height: h } = info
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
  } catch {
    console.log(`    (could not read public${art}, measuring its whole box)`)
  }
  feet.set(art, out)
  return out
}

/** How far outside its own band a point is. outBy measures against the green;
 *  the scrub and the shore are further out, so each is the same number scaled.
 *  `toShore` is the town allowance — see SHORE in lib/islandShape. */
const K = BUILDABLE / GRASS
const K_SHORE = SHORE / GRASS
const outByLand = (rs: number[], x: number, y: number, toShore = false) =>
  Math.hypot(x - 50, y - 50) - grassAt(rs, Math.atan2(y - 50, x - 50)) * (toShore ? K_SHORE : K)

async function check(id: string, name: string, items: Item[]) {
  const rs = coastline(id)
  const lo = Math.min(...rs) * BUILDABLE, hi = Math.max(...rs) * BUILDABLE
  console.log(`\n  ${name}  (buildable land reaches ${lo.toFixed(1)}%..${hi.toFixed(1)}% from centre)`)
  let bad = 0
  for (const it of items) {
    const w = it.scale * 100            // the sprite's width, in box-percent
    const f = await footprint(it.art)
    // WHERE THE ART ACTUALLY MEETS THE GROUND. The sprite is anchored at its
    // bottom CENTRE, so a fraction f across the plate sits (f - 0.5) of the
    // width from x. Rarely symmetric: the Estate's ground reaches further left
    // than right, and that asymmetry is most of the reason to read it at all.
    const pts: [string, number, number][] = [
      ['centre', it.x + ((f.l + f.r) / 2 - 0.5) * w, it.y],
      ['left', it.x + (f.l - 0.5) * w, it.y],
      ['right', it.x + (f.r - 0.5) * w, it.y],
    ]
    const worst = pts.reduce((w, [tag, px, py]) => {
      const d = outByLand(rs, px, py, it.toShore)
      return d > w.d ? { tag, d } : w
    }, { tag: '', d: -Infinity })
    const ok = worst.d < -1.5           // 1.5% of margin, so nothing sits on the surf
    if (!ok) bad++
    console.log(`    ${ok ? 'ok  ' : 'OFF '} ${it.label.padEnd(20)} at ${String(it.x).padStart(3)},${String(it.y).padStart(3)}`
      + ` w${w.toFixed(0).padStart(3)} foot${((f.r - f.l) * w).toFixed(0).padStart(3)}`
      + `   worst ${worst.tag.padEnd(6)} ${worst.d > 0 ? '+' : ''}${worst.d.toFixed(1)}%${it.toShore ? '   (to shore)' : ''}`)
  }
  return bad
}

let bad = 0
for (const p of PLACES) {
  if (p.inner !== undefined) continue
  if (p.id === 'home') {
    // ONE SPRITE PER RUNG, all at the same spot, so every rung is checked
    // rather than only the widest: they are the same painting growing, and
    // the Estate is not automatically the one that overhangs first.
    bad += await check(p.id, `${p.name} (every rung of the house)`, HOUSE.map(b => ({
      label: b.name, art: b.art,
      x: b.x, y: b.y,
      scale: b.scale,
    })))
  } else {
    bad += await check(p.id, p.name, (p.buildings ?? []).map(b => ({
      label: b.art.split('/').pop()!.replace('.png', ''), art: b.art,
      x: b.x, y: b.y, scale: b.scale, toShore: b.toShore,
    })))
  }
}
console.log(`\n  ${bad} building${bad === 1 ? '' : 's'} not standing wholly on the land.`)
if (bad) process.exitCode = 1

// ── SALVAGE: the two halves of one fact ──────────────────────────────────
// A furnishing names the isle that holds it, and lib/seaIsles names the
// furnishing each isle holds. Either can be edited without the other, and the
// failure is silent both ways: a piece nobody can find, or an isle that grants
// something that is not gated on it.
{
  const { FURNITURE } = await import('../lib/homestead')
  const { ISLES, ISLE_FURNISHING } = await import('../lib/seaIsles')
  const fromItems = new Map<string, string>()
  for (const g of FURNITURE) for (const o of g.options) if (o.found) fromItems.set(o.found.isle, o.id)

  let bad = 0
  for (const [isle, id] of fromItems) {
    if (!ISLES.some(i => i.id === isle)) { console.error(`  ✗ ${id} is found on '${isle}', which is not an isle`); bad++ }
    if (ISLE_FURNISHING[isle] !== id) { console.error(`  ✗ ${id} says it is on ${isle}, but that isle grants ${ISLE_FURNISHING[isle] ?? 'nothing'}`); bad++ }
  }
  for (const [isle, id] of Object.entries(ISLE_FURNISHING)) {
    if (fromItems.get(isle) !== id) { console.error(`  ✗ ${isle} grants ${id}, which is not marked as found there`); bad++ }
  }
  console.log(`\n  Salvage: ${fromItems.size} piece(s) findable, ${bad === 0 ? 'both tables agree' : `${bad} disagreement(s)`}.`)
  if (bad) process.exit(1)
}

// ── THE CAMPAIGN'S BASINS ────────────────────────────────────────────────
//
// Four things that can each be true on their own and wrong together, so each is
// measured rather than trusted:
//
//   1. RAID_EDGE has to hold the basins. It is a hand-set constant and the table
//      is hand-authored; nothing but this stops the last chapter being sailed
//      off the edge of its own water.
//   2. Consecutive basins must TOUCH, or the strait between them spans open
//      water and is not a strait.
//   3. NON-consecutive basins must NOT touch, or there is a way north that skips
//      a chapter — which is the one thing a linear campaign cannot have, and the
//      easiest thing to introduce by nudging a centre.
//   4. Every basin must name a chapter that exists, and every chapter a basin,
//      or a strait opens on a node id nothing will ever clear.
{
  const { BASINS, straitAfter, raidReach, opensStrait } = await import('../app/(app)/sea/raidWaters')
  const { RAID_EDGE, EXP_ORIGIN, SORTIE } = await import('../app/(app)/sea/chart')
  const { RAID_CHAPTERS } = await import('../lib/raidMap')

  let bad = 0
  const need = Math.round(raidReach(EXP_ORIGIN.y))
  console.log(`\n  Raid water  (sail limit ${RAID_EDGE}, basins reach ${need})`)
  if (need > RAID_EDGE) {
    console.error(`  ✗ RAID_EDGE is ${RAID_EDGE} but the basins need ${need}`)
    bad++
  }

  for (let i = 0; i < BASINS.length; i++) {
    const b = BASINS[i]
    const chapter = RAID_CHAPTERS.find(c => c.id === b.id)
    if (!chapter) { console.error(`  ✗ basin '${b.id}' is not a chapter`); bad++ }
    if (!opensStrait(b)) { console.error(`  ✗ basin '${b.id}' has no node to open on`); bad++ }

    const next = BASINS[i + 1]
    if (next) {
      const d = Math.hypot(next.x - b.x, next.y - b.y)
      const overlap = b.r + next.r - d
      const s = straitAfter(b)
      const ok = overlap > 0
      if (!ok) bad++
      console.log(`    ${ok ? 'ok  ' : 'GAP '} ${b.name.padEnd(18)} -> ${next.name.padEnd(18)}`
        + ` overlap ${overlap.toFixed(0).padStart(4)}   strait ${s!.x.toFixed(0)},${s!.y.toFixed(0)}`)
    }

    // The skip test. Anything two or more along the chain that reaches this one
    // is a shortcut past a boss.
    for (let j = i + 2; j < BASINS.length; j++) {
      const far = BASINS[j]
      if (Math.hypot(far.x - b.x, far.y - b.y) < b.r + far.r) {
        console.error(`  ✗ ${b.name} touches ${far.name} — that is a way north that skips a chapter`)
        bad++
      }
    }
  }

  for (const c of RAID_CHAPTERS) {
    if (!BASINS.some(b => b.id === c.id)) {
      console.error(`  ✗ chapter '${c.id}' has no basin`); bad++
    }
  }

  // The first basin's mouth is the sortie, so the sortie must be OUTSIDE it —
  // otherwise you arrive already through the wall and the strait means nothing.
  const first = BASINS[0]
  const fromSortie = Math.hypot(SORTIE.x - first.x, SORTIE.y - first.y)
  if (fromSortie < first.r) {
    console.error(`  ✗ the sortie is inside ${first.name}`); bad++
  } else {
    console.log(`    ok   sortie sits ${(fromSortie - first.r).toFixed(0)} px short of ${first.name}`)
  }

  console.log(`\n  Basins: ${BASINS.length} placed, ${bad === 0 ? 'chain intact' : `${bad} problem(s)`}.`)
  if (bad) process.exit(1)
}
