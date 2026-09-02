// ── THE CAMPAIGN'S WATER ────────────────────────────────────────────────────
//
// Past the sortie the sea opens into a wide junction with no walls on it at all,
// and four short straits lead off it. Each strait opens into a BAY: a big
// stretch of open water with its own coast, its own isles, its own rock, and one
// chapter's worth of the campaign scattered through it.
//
// ── WHY BAYS, AND NOT THE THREE SHAPES BEFORE THEM ──────────────────────────
//
// This is the fourth shape. Each earlier one was wrong about something the
// geometry SAYS before anybody reads a word of it.
//
//   RINGS, like the fishing grounds. Concentric bands out from one origin say
//   "pick any heading and go as far as you dare" — direction-agnostic by
//   construction. Right for fishing, wrong for a campaign that has an order.
//
//   A CHAIN of walled basins, each opening into the next. Honestly linear, but
//   it hid the campaign from you, and re-farming chapter one meant sailing back
//   through everything that came after it.
//
//   A FAN OF LONG CHANNELS. The order was right and the junction was legible,
//   and it was claustrophobic: four two-hundred-metre corridors with the content
//   strung down the middle of each. A corridor is a queue. Nothing in it can be
//   FOUND, because there is only one place anything can be, and no reason to
//   steer except round the next thing in the line.
//
// A STRAIT INTO A BAY FIXES THAT. The strait is the gate — short, narrow,
// unmistakably a door, and shut with rock until the chapter before it falls. The
// bay behind it is somewhere to sail: wide enough to lose your bearings in, with
// isles you come across rather than pass, caches on them, and the boss's water
// at the far end. The campaign stays strictly ordered and stops being a queue.
//
// ── AND THE ORDER IS KEPT BY GATES, NOT BY WALLS ────────────────────────────
//
// Inside a bay the order comes from GATES: lines across the water you cannot
// cross until the thing that opens them is done. A puzzle is a gate — that is
// what a puzzle IS out here, an invisible chain across the bay — and so is the
// note that finally gives you the name of the man you are hunting. There is no
// rock on a gate. You sail into it, the water refuses you, and the helm tells
// you what is still owed.
//
// So a bay reads: come in, wander, find things, hit the gate, go and do the
// thing the gate wants, come back, and the boss's water is open.

import { SORTIE } from './chart'
import { RAID_CHAPTERS, RAID_MAP } from '@/lib/raidMap'
import { getRaidConfigById } from '@/lib/raidRegistry'

/**
 * THE JUNCTION.
 *
 * A short run north of the sortie so coming through the arch puts you in open
 * water rather than at a crossing before the game has started, and BIG — 7,600
 * across, twice the anchorage. It has no wall of its own on purpose. Every
 * boundary out here belongs to a bay; the middle is just sea, and it should
 * read as sea from any point on it.
 */
export const HUB = { x: 0, y: -9200 }

/** How far out the strait mouths sit from the middle of the junction. Also the
 *  junction's usable radius: this is where the sea stops being the hub and
 *  starts being a door. */
export const HUB_R = 3800

/** How far the bay centres sit from the middle of the junction. Set so the
 *  straits come out around 2,000 long — a passage you thread in a few seconds,
 *  not a road you sail down. */
export const BAY_AT = 8800

/** How far a strait pokes past a bay's rim, so the two shapes genuinely overlap
 *  and there is no seam at the join for a hull to catch on. */
const POKE = 400

export type Bay = {
  /** Matches a RAID_CHAPTERS id, so the campaign and the water cannot drift. */
  id: string
  chapter: number
  name: string
  /** Which way it lies from the junction. atan2 radians, -PI/2 is due north. */
  bearing: number
  /** The bay's radius. Its water is a disc; the strait enters at one point on
   *  the rim and everything else is coast. */
  r: number
  /** Half the strait's width. The boat is 210 long, so 460 is a passage two
   *  ships could pass in and no more. */
  half: number
  /** Three stops, deep to pale, like every water on this chart. */
  sea: [string, string, string]
  /** Which set of rock its coast is built from. The sets live with the rest of
   *  the chart's art in SeaMap; this only names one. */
  rocks: 'reef' | 'bones' | 'coffers' | 'fathom'
}

const D = (deg: number) => (deg * Math.PI) / 180

/**
 * THE FOUR BAYS.
 *
 * Fanned across the north 52 degrees apart, which at this radius leaves fifteen
 * hundred pixels of open sea between neighbouring coasts — enough that you can
 * sail between two bays without either claiming you, and close enough that from
 * the middle of the junction all four straits are in view at once.
 *
 * Sized to USE THE CHART. The raid water is a disc of 20,000 around the harbour
 * and the old fan reached 13,400 of it. These reach about 17,800, so the north
 * is a place with four distant coasts on it rather than a small yard with the
 * campaign parked in the middle.
 *
 * Chapter V is not here. One Last Ride is a single fight and does not want a bay
 * of its own; where Finn waits is a decision for once the four are sailed.
 */
export const BAYS: Bay[] = [
  {
    id: 'thread', chapter: 1, name: 'The Loose Thread',
    // West of the junction, and the shortest run to reach: the first water
    // anybody sails should be the one that is hardest to miss.
    bearing: D(195), r: 2900, half: 460,
    sea: ['#12242c', '#26454e', '#5c7f84'],
    rocks: 'reef',
  },
  {
    id: 'sunken_hand', chapter: 2, name: 'A Bigger Fish',
    // North-north-west and further out. The Gullet is fought up here, and the
    // coast is bone.
    bearing: D(247), r: 3100, half: 440,
    sea: ['#0f1f2a', '#20404e', '#4e7480'],
    rocks: 'bones',
  },
  {
    id: 'the_coffers', chapter: 3, name: 'The Coffers',
    // The widest water of the four. A fleet action needs room to turn in.
    bearing: D(299), r: 3100, half: 480,
    sea: ['#0c1a26', '#1b3648', '#456b7c'],
    rocks: 'coffers',
  },
  {
    id: 'the_last_fathom', chapter: 4, name: 'The Last Fathom',
    // East, and the darkest. The deepest water there is.
    bearing: D(351), r: 2900, half: 440,
    sea: ['#08131d', '#152b3c', '#385a6e'],
    rocks: 'fathom',
  },
]

export const BAY_BY_ID: Record<string, Bay> =
  Object.fromEntries(BAYS.map(b => [b.id, b]))

/** The middle of a bay's water. */
export function bayCentre(b: Bay): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(b.bearing) * BAY_AT,
    y: HUB.y + Math.sin(b.bearing) * BAY_AT,
  }
}

/** Where a strait leaves the junction. */
export function mouthOf(b: Bay): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(b.bearing) * HUB_R,
    y: HUB.y + Math.sin(b.bearing) * HUB_R,
  }
}

/**
 * HOW LONG THE STRAIT IS, derived rather than declared.
 *
 * From the junction's edge to the bay's, plus a little so the two shapes
 * overlap. Move a bay or change its size and its strait re-fits itself, which
 * is the whole reason the layout is three numbers and a bearing.
 */
export function straitLen(b: Bay): number {
  return BAY_AT - HUB_R - b.r + POKE
}

/** Where the strait meets the bay's rim: the point everything inside a bay is
 *  measured from, because it is where you always arrive. */
export function entryOf(b: Bay): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(b.bearing) * (BAY_AT - b.r),
    y: HUB.y + Math.sin(b.bearing) * (BAY_AT - b.r),
  }
}

/**
 * STRAIT SPACE: how far ALONG from the mouth, how far ACROSS from its middle.
 */
export function toStrait(b: Bay, x: number, y: number): { along: number; across: number } {
  const m = mouthOf(b)
  const dx = x - m.x, dy = y - m.y
  const ux = Math.cos(b.bearing), uy = Math.sin(b.bearing)
  return { along: dx * ux + dy * uy, across: dx * -uy + dy * ux }
}

export function fromStrait(b: Bay, along: number, across: number): { x: number; y: number } {
  const m = mouthOf(b)
  const ux = Math.cos(b.bearing), uy = Math.sin(b.bearing)
  return { x: m.x + ux * along - uy * across, y: m.y + uy * along + ux * across }
}

/**
 * BAY SPACE: ALONG runs from the entry, up the bay's axis and out the far side,
 * so `along` is 0 at the door and `2r` at the back wall. ACROSS is the offset
 * from that axis.
 *
 * Everything inside a bay is placed in these two numbers rather than in world
 * coordinates. Re-aim a bay, resize it, move the whole fan, and every isle,
 * cache, gate and ship in it moves with it, in order and in the same relation to
 * the door. Absolute coordinates would mean re-placing the lot by hand every
 * time the water moved, which is the trap the homestead's furniture fell into
 * before it got a bench.
 */
export function toBay(b: Bay, x: number, y: number): { along: number; across: number } {
  const e = entryOf(b)
  const dx = x - e.x, dy = y - e.y
  const ux = Math.cos(b.bearing), uy = Math.sin(b.bearing)
  return { along: dx * ux + dy * uy, across: dx * -uy + dy * ux }
}

export function fromBay(b: Bay, along: number, across: number): { x: number; y: number } {
  const e = entryOf(b)
  const ux = Math.cos(b.bearing), uy = Math.sin(b.bearing)
  return { x: e.x + ux * along - uy * across, y: e.y + uy * along + ux * across }
}

export function inStrait(b: Bay, x: number, y: number): boolean {
  const p = toStrait(b, x, y)
  return p.along >= 0 && p.along <= straitLen(b) && Math.abs(p.across) <= b.half
}

export function inBay(b: Bay, x: number, y: number): boolean {
  const c = bayCentre(b)
  return Math.hypot(x - c.x, y - c.y) <= b.r
}

/** A chapter's water is the strait AND the bay, as one shape. Which matters at
 *  the join: a boat crossing from one into the other never leaves the region, so
 *  no wall rule fires there and there is nothing to catch on. */
export function inChapterWater(b: Bay, x: number, y: number): boolean {
  return inBay(b, x, y) || inStrait(b, x, y)
}

/** Which chapter's water this point is in, if any. */
export function bayAt(x: number, y: number): Bay | null {
  return BAYS.find(b => inChapterWater(b, x, y)) ?? null
}

/**
 * WHAT OPENS A STRAIT: the chapter BEFORE it.
 *
 * Chapter I's door is open from the first minute; every other one is rocked shut
 * until the chapter before it is finished — the same fact `/expeditions` reads to
 * draw a chapter complete. One source, so a captain who finished a chapter on the
 * node map sails out and finds the door already open.
 */
export function opensBay(b: Bay): string | null {
  const i = BAYS.indexOf(b)
  if (i <= 0) return null            // the first door is never shut
  const prev = BAYS[i - 1]
  return RAID_CHAPTERS.find(ch => ch.id === prev.id)?.lastNodeId ?? null
}

export function bayOpen(b: Bay, cleared: Set<string> | string[]): boolean {
  const gate = opensBay(b)
  if (!gate) return true
  return Array.isArray(cleared) ? cleared.includes(gate) : cleared.has(gate)
}

/**
 * ── THE GATES INSIDE A BAY ──────────────────────────────────────────────────
 *
 * A line straight across the water at `at` pixels up the bay, which you cannot
 * cross until `node` is done. NO ROCK ON IT. That is the point: rock says "there
 * is no way through here" and a gate says "not yet", and those are different
 * sentences. You sail into it, the water pushes back, and the helm names what is
 * owed.
 *
 * A PUZZLE IS A GATE. That is what the chart room's boards are doing out here —
 * a chain across the bay that comes down when the board is solved. So is a note
 * that finally gives you a name: you cannot go looking for Krust in the back of
 * his own water before you have learned he exists.
 *
 * Placed with a good margin either side of anything else, so the refusal is
 * never confused with bumping into something.
 */
export type Gate = {
  bay: string
  /** The node that opens it. */
  node: string
  /** How far up the bay it lies. */
  at: number
  /** What the helm says while it is shut. Short: it is read at speed. */
  shut: string
}

export const GATES: Gate[] = [
  {
    bay: 'thread', node: 'krust_reveal', at: 4200,
    shut: 'The water past here is nobody you know yet',
  },
]

/** The first shut gate between the boat and the back of the bay, if any. */
export function gateShut(b: Bay, along: number, cleared: Set<string> | string[]): Gate | null {
  const has = (id: string) => Array.isArray(cleared) ? cleared.includes(id) : cleared.has(id)
  return GATES
    .filter(g => g.bay === b.id && g.at >= along && !has(g.node))
    .sort((p, q) => p.at - q.at)[0] ?? null
}

/**
 * HOW FAR THE CAMPAIGN'S WATER REACHES, derived rather than declared.
 *
 * `RAID_EDGE` is a hand-set constant in chart.ts and this table is hand
 * authored; nothing else stops a bay being pushed past the sail limit and its
 * boss becoming unreachable. `npm run check` asserts they agree.
 */
export function raidReach(originY: number): number {
  return Math.max(...BAYS.map(b => {
    const c = bayCentre(b)
    return Math.hypot(c.x, c.y - originY) + b.r
  })) + 900
}

/**
 * ── WHAT IS IN THE WATER ────────────────────────────────────────────────────
 *
 * Everything below is a campaign node standing somewhere in a bay. That is all
 * any of them is: the node already knows its own art, its route, its label, its
 * flavour and, for a fight, its raidId, so nothing about the campaign is
 * re-authored out here. `lib/raidMap.ts` stays the source of truth and this is a
 * place to meet it.
 */

/** A SHIP: a raid or a skirmish, floating where you sail up to it. */
export type Encounter = {
  node: string
  bay: string
  along: number
  across: number
}

/**
 * A CACHE: a story beat, or one of the campaign's own caches, in a chest or a
 * bottle. A beat is something you FIND out here rather than something you are
 * handed — which is what the bays are for, and why the beats sit on the isles
 * and in the corners rather than in a line down the middle.
 */
export type Cache = {
  node: string
  bay: string
  along: number
  across: number
  /** A chest sits on an isle; a bottle floats. Bottles carry the small beats
   *  and chests carry the ones with something in them. */
  kind: 'chest' | 'bottle'
}

/**
 * AN ISLE: land, exactly as the fishing sea's isles are land — same generator,
 * same rock, same reason. Something to come across, sail round, and find a chest
 * against. They carry no reward of their own; what is worth having on one is a
 * cache, and the cache is a campaign node.
 */
export type RaidIsle = {
  id: string
  bay: string
  name: string
  along: number
  across: number
  r: number
}

/**
 * CHAPTER I, IN ITS OWN BAY.
 *
 * The chain's order survives as distance up the water, but nothing is on the
 * axis: the skirmish is off to one side, Pete is round the other, the
 * quartermaster's cache is in a corner you have to go looking in. You can sail
 * straight up the middle and miss half of it, which is the difference between a
 * bay and a corridor.
 *
 * The gate is `krust_reveal` — the wax with his name on it. Everything before it
 * is the front half of the water; Krust and the closing beat are behind it.
 *
 * NOT PLACED: `bilge_milestone`, `quartermaster`'s counter and
 * `chapter_1_class`. Management belongs at a mooring, which is what the
 * Anchorage is for — chart.ts calls it "things you moor at, not things you
 * fight" and that is still the right line. Challenge variants are not placed
 * either: raidMap keeps them off the map spine because the boss's own
 * Normal/Challenge switch is meant to be the single door, and standing a second
 * Pete a few hundred pixels from the first would undo that by drawing it.
 */
export const ENCOUNTERS: Encounter[] = [
  { node: 'skirmish', bay: 'thread', along: 1500, across: 400 },
  { node: 'pete', bay: 'thread', along: 2600, across: -600 },
  { node: 'krust', bay: 'thread', along: 4900, across: 0 },
]

export const CACHES: Cache[] = [
  { node: 'intro', bay: 'thread', along: 900, across: -800, kind: 'bottle' },
  { node: 'quartermaster', bay: 'thread', along: 2300, across: -1600, kind: 'chest' },
  { node: 'syndicate', bay: 'thread', along: 3000, across: 1200, kind: 'chest' },
  { node: 'krust_reveal', bay: 'thread', along: 3600, across: -1300, kind: 'bottle' },
  { node: 'chapter_1_close', bay: 'thread', along: 5350, across: 640, kind: 'bottle' },
]

export const RAID_ISLES: RaidIsle[] = [
  { id: 'thread-tangle', bay: 'thread', name: 'The Tangle', along: 1050, across: -1150, r: 210 },
  { id: 'thread-purse', bay: 'thread', name: 'Cutpurse Rock', along: 2350, across: -1950, r: 175 },
  { id: 'thread-ledger', bay: 'thread', name: "The Ledger's Rest", along: 3150, across: 1550, r: 195 },
  // Kept well short of the gate line at 4200. An isle ON a gate is a rock you
  // can see, cannot reach, and cannot be told why — the check catches it.
  { id: 'thread-wax', bay: 'thread', name: 'Wax Shoal', along: 3650, across: -1650, r: 160 },
  { id: 'thread-watch', bay: 'thread', name: 'Between Watches', along: 5100, across: 700, r: 170 },
]

/** Where a thing in bay space actually is. */
function placeIn(bayId: string, along: number, across: number): { x: number; y: number } | null {
  const b = BAY_BY_ID[bayId]
  return b ? fromBay(b, along, across) : null
}

export function encounterAt(e: Encounter) { return placeIn(e.bay, e.along, e.across) }
export function cacheAt(c: Cache) { return placeIn(c.bay, c.along, c.across) }
export function isleAt(i: RaidIsle) { return placeIn(i.bay, i.along, i.across) }

/**
 * HOW CLOSE YOU HAVE TO BE TO TAKE SOMETHING ON.
 *
 * Wider than a trader's hail and narrower than a berth. You come alongside a
 * ship rather than arriving at a shore, and this is what "alongside" means for a
 * hull 210 long.
 */
export const ENCOUNTER_REACH = 420

/** And how close to reach into a cache. Tighter: a chest on a rock is a thing
 *  you pull up beside, and a reach as wide as a ship's would let you claim one
 *  from clean across a channel. */
export const CACHE_REACH = 300

/** The encounter within reach, if any. Nearest wins, so two close together
 *  cannot flicker as the swell moves the boat. */
export function encounterNear(x: number, y: number): Encounter | null {
  let best: Encounter | null = null
  let bestD = ENCOUNTER_REACH
  for (const e of ENCOUNTERS) {
    const p = encounterAt(e)
    if (!p) continue
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

/** The cache within reach, if any. */
export function cacheNear(x: number, y: number): Cache | null {
  let best: Cache | null = null
  let bestD = CACHE_REACH
  for (const c of CACHES) {
    const p = cacheAt(c)
    if (!p) continue
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

/**
 * ── WHAT AN ENCOUNTER LOOKS LIKE FROM THE HELM: A SHIP ──────────────────────
 *
 * You sail up to a BOAT, not to a portrait of somebody. A face on a plate is a
 * card standing in the water — it belongs to the node map, which is the surface
 * this one exists to stop being. What is out here is a hull, floating, that you
 * come alongside and then fight.
 *
 * AND IT IS THE HULL YOU ACTUALLY FIGHT. Every enemy in `bossRaids` already
 * carries a ship — `enemychapter1brigantine_v2.png` and the rest — so the boss's
 * own flagship is already drawn, already in the right house style, and already
 * the picture that fills the screen ten seconds later when the guns open. No new
 * art, and no chance of the water promising a ship the raid does not deliver.
 *
 * A SKIRMISH has no raid of its own: it is a chapter's mobs, over and over. So
 * it flies the FIRST ship in the next raid's sequence up the same water — which
 * is literally what a skirmish puts in front of you, derived rather than picked.
 */
export function hullFor(e: Encounter): string | null {
  const node = RAID_MAP.find(n => n.id === e.node)
  if (!node) return null

  if (node.raidId) {
    const cfg = getRaidConfigById(node.raidId)
    return cfg?.enemies[cfg.bossId]?.image ?? null
  }

  if (node.type === 'skirmish') {
    const ahead = ENCOUNTERS
      .filter(x => x.bay === e.bay && x.along > e.along)
      .sort((a, b) => a.along - b.along)
    for (const x of ahead) {
      const n = RAID_MAP.find(m => m.id === x.node)
      const cfg = n?.raidId ? getRaidConfigById(n.raidId) : null
      if (cfg) return cfg.enemies[cfg.sequence[0]]?.image ?? null
    }
  }

  return null
}

/** Kept so callers do not have to know the sortie owns the way in. */
export function hubEntry(): { x: number; y: number } {
  return { x: SORTIE.x, y: SORTIE.y }
}
