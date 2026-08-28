/**
 * IS FINN REACHABLE, AND IS HE STANDING ON ANYBODY?
 *
 * This script used to walk 1,800 haunts and assert two things about a rival who
 * moved after every conversation: that consecutive positions were far apart,
 * and that none of them landed inside somebody else's prompt. He is moored now
 * (see lib/seaFinn), so the first question is gone and the second is a single
 * comparison rather than a simulation.
 *
 * What is left still matters, and matters MORE than it did. He is the fishing
 * campaign's only delivery route, so a mooring that overlapped a port's go
 * ashore prompt or a buyer's hail would make the story unreachable for
 * everybody at once rather than for one unlucky captain on one hop.
 */
import { PLACES, LANDMARKS, RESIDENTS, SOCIALS, YOON, HOME } from '../app/(app)/sea/chart'
import { FINN_MOORING, FINN_REACH } from '../lib/seaFinn'
import { ISLES, ashoreRange } from '../lib/seaIsles'

const { x, y } = FINN_MOORING
const R = Math.hypot(x, y)
let bad = 0

function need(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} ${detail}`)
  if (!ok) bad++
}

// ── IN FISHABLE WATER ────────────────────────────────────────────────────
const shallows = PLACES.find(p => p.id === 'shallows')!
need('inside the Shallows', R >= (shallows.inner ?? 0) && R < (shallows.outer ?? 0),
  `R=${Math.round(R)} against ${shallows.inner}..${shallows.outer}`)

// ── A SHORT SAIL FROM HOME ───────────────────────────────────────────────
// The whole reason he was moored: the campaign should be somewhere you drop in
// on. Anything past a couple of thousand pixels stops being "near home".
const fromHome = Math.hypot(x - HOME.x, y - HOME.y)
need('a short sail from home', fromHome < 2400, `${Math.round(fromHome)}px from the start point`)

// ── NOT INSIDE ANYBODY ELSE'S PROMPT ─────────────────────────────────────
// His hail reaches FINN_REACH; a port's go-ashore is its berth, and every other
// permanent person hails at 600. Two prompts on one patch of water means one of
// them never comes up.
const others: { name: string; x: number; y: number; keep: number }[] = [
  ...RESIDENTS.map(r => ({ name: r.name, x: r.x, y: r.y, keep: 600 })),
  ...SOCIALS.map(r => ({ name: r.name, x: r.x, y: r.y, keep: 600 })),
  { name: YOON.name, x: YOON.x, y: YOON.y, keep: 600 },
]
let worst = { name: '', slack: Infinity }
for (const o of others) {
  const slack = Math.hypot(x - o.x, y - o.y) - (o.keep + FINN_REACH)
  if (slack < worst.slack) worst = { name: o.name, slack }
}
need('clear of every other hail', worst.slack > 0,
  `nearest is ${worst.name} with ${Math.round(worst.slack)}px of slack`)

// ── NOT ON LAND, NOT IN A ROCK ───────────────────────────────────────────
let land = { name: '', slack: Infinity }
for (const p of PLACES) {
  if (p.kind !== 'port') continue
  const slack = Math.hypot(x - p.x, y - p.y) - (p.r + FINN_REACH)
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
  const slack = Math.hypot(x - i.x, y - i.y) - (ashoreRange(i) + FINN_REACH)
  if (slack < isle.slack) isle = { id: i.id, slack }
}
need('clear of every isle landing', isle.slack > 0,
  `nearest is ${isle.id} with ${Math.round(isle.slack)}px of slack`)

console.log(`\ncheck-finn: he is moored at ${x},${y} and ${bad === 0 ? 'everybody can reach him' : 'SOMETHING IS IN THE WAY'}.`)
if (bad) process.exit(1)
