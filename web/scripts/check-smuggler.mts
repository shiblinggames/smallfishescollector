/**
 * IS KIP REACHABLE, AND IS HE STANDING ON ANYBODY?
 *
 * Same question check-finn asks, and it matters for the same reason but harder.
 * Finn moored badly costs the fishing campaign; Kip moored badly costs a whole
 * game mode, because he is now the only door into Tide Run. If his hail lands
 * inside a port's go-ashore or another hail, the action bar shows one of them
 * and it will not be his — and the mode is simply unreachable for everybody at
 * once, with nothing on screen to say why.
 *
 * He is a fixed point, so this is comparisons rather than a simulation. Run in
 * `npm run check` alongside the others.
 */
import { PLACES, LANDMARKS, RESIDENTS, SOCIALS, YOON, HOME, HAIL_RANGE } from '../app/(app)/sea/chart'
import { KIP, KIP_REACH_MULT } from '../lib/seaSmuggler'
import { FINN_MOORING, FINN_REACH } from '../lib/seaFinn'
import { ISLES, ashoreRange } from '../lib/seaIsles'

const { x, y } = KIP
const REACH = Math.round(HAIL_RANGE * KIP_REACH_MULT)
const R = Math.hypot(x, y)
let bad = 0

function need(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${detail}`)
  if (!ok) bad++
}

// ── EAST OF THE MAINLAND, WHICH IS THE BRIEF ─────────────────────────────
// Stated as a test rather than as a comment, because "east" is the one thing
// about this person that was specified and a later nudge to his coordinates
// could quietly move him somewhere else.
const mainland = PLACES.find(p => p.id === 'mainland')!
need('east of the Mainland', x > mainland.x + mainland.r,
  `x=${x} against the island's edge at ${mainland.x + mainland.r}`)

// ── ON WATER YOU CAN REACH ───────────────────────────────────────────────
const shallows = PLACES.find(p => p.id === 'shallows')!
need('inside the Shallows', R >= (shallows.inner ?? 0) && R < (shallows.outer ?? 0),
  `R=${Math.round(R)} against ${shallows.inner}..${shallows.outer}`)

// A new captain has to be able to find him without a campaign behind them, so
// he lives under the same "short sail from home" rule Finn does.
const fromHome = Math.hypot(x - HOME.x, y - HOME.y)
need('a short sail from home', fromHome < 2600, `${Math.round(fromHome)}px from the start point`)

// ── NOT INSIDE ANYBODY ELSE'S PROMPT ─────────────────────────────────────
const others: { name: string; x: number; y: number; keep: number }[] = [
  ...RESIDENTS.map(r => ({ name: r.name, x: r.x, y: r.y, keep: 600 })),
  ...SOCIALS.map(r => ({ name: r.name, x: r.x, y: r.y, keep: 600 })),
  { name: YOON.name, x: YOON.x, y: YOON.y, keep: 600 },
  { name: 'Finn', x: FINN_MOORING.x, y: FINN_MOORING.y, keep: FINN_REACH },
]
let worst = { name: '', slack: Infinity }
for (const o of others) {
  const slack = Math.hypot(x - o.x, y - o.y) - (o.keep + REACH)
  if (slack < worst.slack) worst = { name: o.name, slack }
}
need('clear of every other hail', worst.slack > 0,
  `nearest is ${worst.name} with ${Math.round(worst.slack)}px of slack`)

// ── NOT ON LAND, NOT IN A ROCK ───────────────────────────────────────────
let land = { name: '', slack: Infinity }
for (const p of PLACES) {
  if (p.kind !== 'port') continue
  const slack = Math.hypot(x - p.x, y - p.y) - (p.r + REACH)
  if (slack < land.slack) land = { name: p.name, slack }
}
need('clear of every port', land.slack > 0,
  `nearest is ${land.name} with ${Math.round(land.slack)}px of slack`)

let rock = { name: '', slack: Infinity }
for (const m of LANDMARKS) {
  if (m.solid === false) continue
  const slack = Math.hypot(x - m.x, y - m.y) - (m.size * 0.5 + 120)
  if (slack < rock.slack) rock = { name: m.art.split('/').pop() ?? '', slack }
}
need('clear of every solid landmark', rock.slack > 0,
  `nearest is ${rock.name} with ${Math.round(rock.slack)}px of slack`)

let isle = { id: '', slack: Infinity }
for (const i of ISLES) {
  const slack = Math.hypot(x - i.x, y - i.y) - (ashoreRange(i) + REACH)
  if (slack < isle.slack) isle = { id: i.id, slack }
}
need('clear of every isle landing', isle.slack > 0,
  `nearest is ${isle.id} with ${Math.round(isle.slack)}px of slack`)

console.log(`\ncheck-smuggler: ${KIP.name} is at ${x},${y} and ${bad === 0 ? 'he can be hailed' : 'SOMETHING IS IN THE WAY'}.`)
if (bad) process.exit(1)
