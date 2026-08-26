/**
 * FINN HAS TO HAVE SOMEWHERE TO STAND.
 *
 * His haunts are derived (lib/seaFinn.ts), which means nobody will ever open a
 * file and see a bad one. What will happen is somebody adds an island, and a
 * band quietly stops having room in it, and every haunt in that band falls
 * through to the overlap-anyway fallback — a Finn moored inside a landing
 * circle, where his hail button and the isle's "go ashore" button fight over
 * the one action slot and the story stops being reachable.
 *
 * That is not hypothetical. The first cut of seaFinn gave landmarks a keep-out
 * of `size + 600 + FINN_REACH`, and 35 of them at that radius sealed the
 * Shallows off completely: 0.0% of the band was standing room. It looked fine.
 *
 * So this asserts the three things the derivation promises:
 *
 *   1. Every band he can haunt has real standing room in it.
 *   2. He never overlaps anything that owns a button — a port, an isle, or a
 *      moored buyer. Tangency is allowed; overlap is not.
 *   3. Consecutive haunts are far enough apart to be a voyage rather than a
 *      turn of the wheel.
 *
 * Runs in `npm run check`.
 */
import { finnHaunt, FINN_REACH } from '../lib/seaFinn'
import { PLACES, LANDMARKS, RESIDENTS, YOON, NORTH_WALL, OUTER_EDGE } from '../app/(app)/sea/chart'
import { ISLES, ashoreRange } from '../lib/seaIsles'

/** Every level at which his pool of water changes, plus a fresh captain. */
const LEVELS = [1, 15, 30, 50, 75, 100]
/** Past the highest finn_encounters on the live table (141) with room to spare. */
const N = 300
/** Consecutive haunts must clear this. Below it the marker for the next haunt
 *  would already be on screen when you finish talking to him at this one. */
const MIN_HOP = 1800

let bad = 0
const say = (m: string) => { console.error('  ✗ ' + m); bad++ }

// ── 1. IS THERE ROOM IN EACH BAND AT ALL? ────────────────────────────────
// Sampled directly against the same obstacle set the derivation uses, rather
// than inferred from where haunts landed — a band can be 0.4% clear and still
// look fine from 300 samples.
const BUTTONS: { x: number; y: number; keep: number }[] = []
for (const p of PLACES) {
  if (p.inner !== undefined) continue
  BUTTONS.push({ x: p.x, y: p.y, keep: p.r + 420 + FINN_REACH })
}
for (const i of ISLES) BUTTONS.push({ x: i.x, y: i.y, keep: ashoreRange(i) + FINN_REACH })
for (const r of RESIDENTS) BUTTONS.push({ x: r.x, y: r.y, keep: 600 + FINN_REACH })
BUTTONS.push({ x: YOON.x, y: YOON.y, keep: 600 + FINN_REACH })

const bands = PLACES.filter(p => p.kind === 'water' && p.inner != null && p.outer != null)
console.log('Standing room by band:')
for (const b of bands) {
  let tot = 0, ok = 0
  for (let a = 0.10; a < Math.PI - 0.10; a += 0.01) {
    for (let rad = b.inner! + 420; rad <= b.outer! - 420; rad += 40) {
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad
      tot++
      if (y < 700) continue
      if (BUTTONS.some(v => Math.hypot(v.x - x, v.y - y) < v.keep)) continue
      if (LANDMARKS.some(l => Math.hypot(l.x - x, l.y - y) < l.size + 300)) continue
      ok++
    }
  }
  const pct = (ok / tot) * 100
  console.log(`  ${b.id.padEnd(14)} ${pct.toFixed(1).padStart(5)}% clear`)
  // The Shallows is deliberately excluded from his pool once anything else is
  // open (see bandsFor), so it is allowed to be cramped. Every other band has
  // to be somewhere he can actually be.
  if (b.id !== 'shallows' && pct < 8) say(`${b.id} has only ${pct.toFixed(1)}% standing room — Finn will fall back into obstacles there`)
}

// ── 2 & 3. WALK THE HAUNTS ───────────────────────────────────────────────
let minHop = Infinity, minHopAt = ''
let overlaps = 0
let firstOverlap = ''

for (const lvl of LEVELS) {
  let prev: { x: number; y: number } | null = null
  for (let n = 0; n < N; n++) {
    const h = finnHaunt(n, lvl)
    const r = Math.hypot(h.x, h.y)

    if (h.y < NORTH_WALL || r > OUTER_EDGE) say(`lvl${lvl} n${n} is off the chart at ${h.x},${h.y}`)

    const band = PLACES.find(p => p.id === h.bandId)!
    if (r < band.inner! || r > band.outer!) say(`lvl${lvl} n${n} claims ${h.bandId} but sits at r=${Math.round(r)}`)

    // OVERLAP, not tangency. Two circles that touch at a single point leave
    // neither prompt unreachable, and the derivation packs haunts right up
    // against their keep-outs in tight water — so a `<` here would fail on
    // geometry that is actually correct.
    for (const v of BUTTONS) {
      const d = Math.hypot(v.x - h.x, v.y - h.y)
      if (d < v.keep - 1) {
        overlaps++
        if (!firstOverlap) firstOverlap = `lvl${lvl} n${n} at ${h.x},${h.y} is ${Math.round(v.keep - d)}px inside a landing circle`
      }
    }

    if (prev) {
      const d = Math.hypot(prev.x - h.x, prev.y - h.y)
      if (d < minHop) { minHop = d; minHopAt = `lvl${lvl} n${n - 1}→${n}` }
    }
    prev = { x: h.x, y: h.y }
  }
}

console.log(`\nHaunts walked        ${LEVELS.length * N}`)
console.log(`Shortest hop         ${Math.round(minHop)}px  (${minHopAt})  — ${(minHop / (FINN_REACH * 2)).toFixed(1)}× the hail circle`)
console.log(`Inside a prompt      ${overlaps}`)

if (overlaps > 0) say(`${overlaps} haunt(s) overlap something with its own button. First: ${firstOverlap}`)
if (minHop < MIN_HOP) say(`shortest hop ${Math.round(minHop)}px is under ${MIN_HOP}px — he barely moves at ${minHopAt}`)

if (bad) {
  console.error(`\ncheck-finn: ${bad} problem(s).`)
  process.exit(1)
}
console.log('\ncheck-finn: Finn always has somewhere to stand, and always has to be sailed to.')
