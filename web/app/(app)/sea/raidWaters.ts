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
// ── AND A BAY IS A ROUTE, NOT AN ARENA ──────────────────────────────────────
//
// Rock runs THROUGH a bay, not just around it: two long chains carve a lane out
// along one side, round the far end, and back down the other. Sailing a bay is
// following that lane past everything on it to the boss at the tip, rounding
// him, and coming home past the second.
//
// That is what makes a bay linear without making it a corridor. A corridor is
// linear because there is nowhere else to be; this is linear because somebody
// drew a road through open water, and the water either side of the road is
// still there and still sailable at the ends. See WALLS.
//
// A GATE IS A WALL WITH A NAME ON IT — one mechanism, not two. See Wall.

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

/** THE DEFAULT distance from the junction to a bay's middle. Each bay carries
 *  its own now — see `Bay.at` — and this is only the number they were all laid
 *  out at, kept because it is the sane starting point for a new one. */
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
  /**
   * AND HOW FAR OUT, which is per bay rather than one shared radius.
   *
   * They were all at 8,800, which put four bays on one arc and left the water
   * due east and due west of the harbour completely empty — a chart that is
   * mostly margin. A bearing and a distance can put a bay anywhere in the raid
   * water, and the strait re-fits itself to whatever gap is left.
   */
  at: number
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
    // DUE WEST, and huge. Nearly ten thousand across.
    bearing: D(169), at: 12158, r: 4941, half: 460,
    sea: ['#12242c', '#26454e', '#5c7f84'],
    rocks: 'reef',
  },
  {
    id: 'sunken_hand', chapter: 2, name: 'A Bigger Fish',
    // North-west. The Gullet is fought up here, and the coast is bone.
    bearing: D(-139), at: 10361, r: 4445, half: 440,
    sea: ['#0f1f2a', '#20404e', '#4e7480'],
    rocks: 'bones',
  },
  {
    id: 'the_coffers', chapter: 3, name: 'The Coffers',
    // North-east, and a fleet action has room to turn in it.
    bearing: D(-50), at: 9922, r: 4391, half: 480,
    sea: ['#0c1a26', '#1b3648', '#456b7c'],
    rocks: 'coffers',
  },
  {
    id: 'the_last_fathom', chapter: 4, name: 'The Last Fathom',
    // DUE EAST, and the biggest water on the chart at twelve thousand across.
    // The deepest there is, and the darkest.
    bearing: D(6), at: 12718, r: 5928, half: 440,
    sea: ['#08131d', '#152b3c', '#385a6e'],
    rocks: 'fathom',
  },
  {
    id: 'one_last_ride', chapter: 5, name: 'One Last Ride',
    /**
     * DUE NORTH, PAST EVERYTHING, AND SMALL.
     *
     * The coda is one fight. It does not want a chapter's worth of water and it
     * should not get one — a bay you sail into looking for isles and caches and
     * find nothing in but him is the right shape for this, and the longest
     * strait on the chart is the right way in.
     *
     * Its door opens on chapter IV's tail, which falls out of the array order
     * rather than being written down: see opensBay.
     */
    bearing: D(-94), at: 11210, r: 2245, half: 460,
    // Violet-black. Not one of the four, because it is not one of the four —
    // there is no chapter after this and the water should not look like there
    // is.
    sea: ['#120e18', '#241c2e', '#4a3f58'],
    // The Fathom's black glass, for now. This water wants its own rock and it
    // is the one thing here still borrowed.
    rocks: 'fathom',
  },
]

export const BAY_BY_ID: Record<string, Bay> =
  Object.fromEntries(BAYS.map(b => [b.id, b]))

/** The middle of a bay's water. */
export function bayCentre(b: Bay): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(b.bearing) * b.at,
    y: HUB.y + Math.sin(b.bearing) * b.at,
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
  return b.at - HUB_R - b.r + POKE
}

/** Where the strait meets the bay's rim: the point everything inside a bay is
 *  measured from, because it is where you always arrive. */
export function entryOf(b: Bay): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(b.bearing) * (b.at - b.r),
    y: HUB.y + Math.sin(b.bearing) * (b.at - b.r),
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
 * ── THE WALLS INSIDE A BAY ──────────────────────────────────────────────────
 *
 * A bay is not an arena with the campaign scattered in it. It is a ROAD folded
 * up inside a circle: rock runs through the water in two long chains that carve
 * a lane out and a lane back, and sailing the bay is following that lane past
 * everything on it until you reach the boss at the far end, round the tip, and
 * come back down the other side to the second.
 *
 * That is what makes a bay linear WITHOUT being a corridor, which the fan of
 * channels never managed. A corridor is linear because there is nowhere else to
 * be. This is linear because somebody drew a route through open water — and the
 * water either side of the route is still there, still sailable at the ends,
 * still a place rather than a queue.
 *
 * ── A GATE IS A WALL WITH A NAME ON IT ──────────────────────────────────────
 *
 * There were two mechanisms here: walls, which are rock, and gates, which were
 * a line clean across the bay at a distance up it. The second was too crude the
 * moment the water had a shape — "across the bay at along 4400" means nothing
 * in a lane that doubles back, and it would have cut the return leg as well as
 * the outbound one.
 *
 * So there is one thing. A wall is a segment you cannot cross; a wall carrying
 * a `node` is a wall that is only there until that node is done. Same list,
 * same collision, same drawing, and the difference is one field.
 *
 * ── IN BAY SPACE, BOTH ENDS ─────────────────────────────────────────────────
 *
 * `[along, across]` from the bay's entry, like everything else out here, so the
 * whole route moves and turns with the bay it belongs to.
 */
export type Wall = {
  bay: string
  a: [number, number]
  b: [number, number]
  /** Set on a gate: the node that takes it down. */
  node?: string
  /** What the helm says while it is up. Short: it is read at speed. */
  shut?: string
}

/**
 * ── THE LOOSE THREAD'S ROUTE ────────────────────────────────────────────────
 *
 * Two chains. The OUTER one is the coast of the whole route, running from the
 * entry out along the western side, round the far end and back along the
 * eastern. The INNER one is a finger that reaches out from beside the entry to
 * the far end and folds back on itself, which is what splits the route into a
 * leg out and a leg home.
 *
 * The gap between the finger's tip and the outer wall is the TURN, and it is
 * where the chapter's first boss stops being optional.
 */
export const WALLS: Wall[] = [
  // ── THE OUTER COAST OF THE ROUTE ──
  { bay: 'thread', a: [160, -925], b: [1676, -3143] },
  { bay: 'thread', a: [1736, -3131], b: [4518, -4514] },
  { bay: 'thread', a: [4702, -4664], b: [7598, -3760] },
  { bay: 'thread', a: [7735, -3671], b: [9192, -1589] },
  { bay: 'thread', a: [9139, -1475], b: [9137, 448] },
  { bay: 'thread', a: [9144, 573], b: [8241, 2507] },
  { bay: 'thread', a: [8026, 2496], b: [6057, 4005] },
  { bay: 'thread', a: [6081, 4042], b: [2922, 4016] },

  // ── THE FINGER, out ──
  { bay: 'thread', a: [526, 386], b: [2701, -276] },
  { bay: 'thread', a: [2737, -300], b: [3867, -1011] },
  { bay: 'thread', a: [3933, -1029], b: [4854, -1936] },
  { bay: 'thread', a: [4955, -1979], b: [6397, -1574] },
  { bay: 'thread', a: [6481, -1526], b: [7222, -390] },
  // ── and back ──
  { bay: 'thread', a: [7084, -323], b: [5703, -561] },
  { bay: 'thread', a: [5728, -526], b: [3248, 265] },
  { bay: 'thread', a: [3271, 300], b: [1186, 1135] },

  /**
   * THE TURN, SHUT UNTIL PETE IS DOWN.
   *
   * Across the gap between the finger's tip and the outer wall, which is the
   * one place the route narrows to a door. Everything before it is the leg out
   * and Pete at the end of it; everything after is the way home past Krust.
   *
   * One gate, not four. The chain already refuses to let you READ or FIGHT
   * anything out of order — this is only here so the second half of the bay is
   * not water you can go and look at before you have earned it.
   */
  {
    bay: 'thread', a: [7222, -390], b: [9138, -300],
    node: 'pete',
    shut: 'Pete is still afloat, and this is still his water',
  },
]

/** Both ends of a wall, in world coordinates. */
export function wallEnds(w: Wall): { ax: number; ay: number; bx: number; by: number } | null {
  const b = BAY_BY_ID[w.bay]
  if (!b) return null
  const p = fromBay(b, w.a[0], w.a[1])
  const q = fromBay(b, w.b[0], w.b[1])
  return { ax: p.x, ay: p.y, bx: q.x, by: q.y }
}

/** Is this wall standing, for this captain? A plain wall always is; a gate is
 *  only there until the thing that opens it is done. */
export function wallUp(w: Wall, cleared: Set<string> | string[]): boolean {
  if (!w.node) return true
  return !(Array.isArray(cleared) ? cleared.includes(w.node) : cleared.has(w.node))
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
 * A CACHE: one of the campaign's own caches, in a chest, ON AN ISLE.
 *
 * Always on an isle, never floating. A chest bobbing in open water is a thing
 * with nothing under it — it reads as a bug, and it was one. A cache is
 * somewhere somebody LEFT something, which means land.
 *
 * Only the campaign's actual caches are here now. Story beats used to be chests
 * and bottles too, and they should never have been: see BEATS.
 */
export type Cache = {
  node: string
  bay: string
  /** The isle it sits on. Its position comes from there, so moving the rock
   *  moves the chest and the two can never drift apart. */
  isle: string
}

/**
 * ── A STORY BEAT: A POST ON A ROCK, WITH SOMETHING TO READ ON IT ────────────
 *
 * A beat opens a cutscene, and it was briefly a BOTTLE you pressed — which was
 * wrong, because a bottle promises loot and delivers a conversation. It was then
 * briefly an invisible TRIGGER that fired as you sailed into it, which was wrong
 * the other way: a marker that says "there is something here" and then plays
 * itself without being touched is not a marker, and you cannot go back to a
 * scene you never chose to start.
 *
 * So it is a NOTE POST, standing on an isle, that you sail up to and read. The
 * chart already speaks this language — the fishing sea's note isles are a post
 * on a rock and every captain has learned what one means — and it splits cleanly
 * from the chests beside it: a chest is something to take, a post is something
 * to read.
 *
 * UNREAD IT IS LIT AND IT PULSES. Read, it stays exactly where it was, dimmed,
 * and you can pull alongside and read it again — the story is not consumable and
 * a beat that vanished when it was done would leave the bay emptier every time
 * you sailed it.
 *
 * LOCKED IT IS STILL DRAWN, and refused by name. The chain is what makes the
 * campaign a campaign: you cannot read the wax that names Krust before you have
 * been up the line to find out there is a name. That order is `requiresNode` in
 * raidMap and it is resolved by `computeRaidMap`, so the water and the node map
 * cannot disagree about what is open.
 */
export type Beat = {
  node: string
  bay: string
  /** The isle it stands on. Its position comes from there, so moving the rock
   *  moves the post and the two can never drift apart. */
  isle: string
}

/**
 * AN ISLE: land, exactly as the fishing sea's isles are land — same generator,
 * same rock, same reason. Something to come across, sail round, and find a chest
 * against. They carry no reward of their own; what is worth having on one is a
 * cache or a beat, and both of those are campaign nodes.
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
 * CHAPTER I, STRUNG ALONG ITS OWN ROAD.
 *
 * The chain's order IS the route's order now, which is the whole point of
 * walling a bay: you meet the campaign in the order it was written because
 * that is the order the water lets you reach it in, and not because anything
 * refused you.
 *
 *   out along the western leg   intro · the skirmish · PETE
 *   round the finger's tip      the syndicate · the Bilge Eels
 *   home down the eastern leg   the quartermaster · the wax · KRUST
 *   and back toward the door    Between Watches · the Captain's Choice
 *
 * TWO BOSSES, one at each end of the fold. Pete stands at the far tip with the
 * gate behind him; Krust stands on the way home, which is the right shape for
 * a man whose whole arc is that you did not know he existed on the way out.
 *
 * Challenge variants are not placed: raidMap keeps them off the map spine
 * because the boss's own Normal/Challenge switch is meant to be the single
 * door, and standing a second Pete a few hundred pixels from the first would
 * undo that by drawing it.
 */
export const ENCOUNTERS: Encounter[] = [
  { node: 'skirmish', bay: 'thread', along: 4775, across: -3285 },
  { node: 'pete', bay: 'thread', along: 6803, across: -2705 },
  { node: 'krust', bay: 'thread', along: 2801, across: 2721 },
]

export const CACHES: Cache[] = [
  { node: 'quartermaster', bay: 'thread', isle: 'thread-purse' },
]

export const BEATS: Beat[] = [
  { node: 'intro', bay: 'thread', isle: 'thread-tangle' },
  { node: 'syndicate', bay: 'thread', isle: 'thread-ledger' },
  { node: 'bilge_milestone', bay: 'thread', isle: 'thread-bilge' },
  { node: 'krust_reveal', bay: 'thread', isle: 'thread-wax' },
  { node: 'chapter_1_close', bay: 'thread', isle: 'thread-watch' },
  { node: 'chapter_1_class', bay: 'thread', isle: 'thread-choice' },
]

/**
 * ONE ROCK PER STOP, laid on the route in the order you sail it.
 *
 * Everything here is ON the road rather than beside it. The two after Krust sit
 * on the last stretch back toward the door, so the chapter finishes where it
 * started — which is what a loop is for, and what stops the way home being the
 * only reason the end of a bay exists.
 */
export const RAID_ISLES: RaidIsle[] = [
  { id: 'thread-tangle', bay: 'thread', name: 'The Tangle', along: 3009, across: -2016, r: 200 },
  { id: 'thread-ledger', bay: 'thread', name: "The Ledger's Rest", along: 7464, across: -1801, r: 195 },
  { id: 'thread-bilge', bay: 'thread', name: 'Bilge Bank', along: 8105, across: 651, r: 180 },
  { id: 'thread-purse', bay: 'thread', name: 'Cutpurse Rock', along: 6458, across: 1943, r: 175 },
  { id: 'thread-wax', bay: 'thread', name: 'Wax Shoal', along: 4238, across: 2194, r: 160 },
  { id: 'thread-watch', bay: 'thread', name: 'Between Watches', along: 1750, across: 2500, r: 170 },
  { id: 'thread-choice', bay: 'thread', name: "The Captain's Rest", along: 900, across: 1750, r: 150 },
]

export const ISLE_BY_ID: Record<string, RaidIsle> =
  Object.fromEntries(RAID_ISLES.map(i => [i.id, i]))

/**
 * ── THE WAY HOME, ONCE THE BOSS IS DOWN ─────────────────────────────────────
 *
 * A bay is a long way out. The furthest of them is eighteen thousand pixels
 * from the harbour, down a strait, across a junction and through the sortie —
 * which is the right shape for SAILING OUT to a chapter, and the wrong shape
 * entirely for coming back from one you have already finished. The trip home
 * has no decisions in it: you have beaten the thing you came for, and every
 * rock between you and the wharf is scenery you have already read.
 *
 * So beating a bay's boss opens a way back at the far end of its own water. It
 * appears where you beat him, which is the point — the reward for the fight is
 * standing right there, and it is the shortest possible answer to "now what".
 *
 * IT ONLY EVER GOES ONE WAY. Out is still sailed, every time, including on a
 * re-farm: the voyage out is the part with the water in it. This is the road
 * back, and a road back is not a shortcut to anywhere.
 *
 * WHAT OPENS IT is derived, not declared: the last raid up that bay. Name the
 * boss twice and the two names drift, and the one that is wrong is the one
 * nobody looks at.
 */
export type ReturnPortal = {
  bay: string
  along: number
  across: number
}

export const RETURN_PORTALS: ReturnPortal[] = [
  // At the END OF THE LOOP, on the last stretch back toward the door. You have
  // sailed the whole road by the time you reach it, which is the only moment a
  // way home is a reward rather than a shortcut.
  { bay: 'thread', along: 1200, across: 2200 },
]

/**
 * THE FIGHT THAT OPENS A BAY'S WAY HOME: the LAST raid in the chain.
 *
 * It used to be the furthest one up the bay, which was true only while a bay
 * was a straight run. On a route that folds back, the second boss is NEARER the
 * door than the first — Krust stands at along 2,801 and Pete at 6,803 — so
 * "furthest up" picked the wrong man and would have opened the way home before
 * the chapter was finished.
 *
 * Chain order cannot be wrong about this. RAID_MAP is the campaign, in order,
 * and the last of a bay's raids to appear in it is the one that ends the bay.
 */
export function portalOpensOn(bayId: string): string | null {
  let best: string | null = null
  let bestAt = -1
  for (const e of ENCOUNTERS) {
    if (e.bay !== bayId) continue
    const i = RAID_MAP.findIndex(n => n.id === e.node)
    if (i < 0 || RAID_MAP[i].type !== 'raid') continue
    if (i > bestAt) { bestAt = i; best = e.node }
  }
  return best
}

export function portalOpen(pt: ReturnPortal, cleared: Set<string> | string[]): boolean {
  const gate = portalOpensOn(pt.bay)
  if (!gate) return false
  return Array.isArray(cleared) ? cleared.includes(gate) : cleared.has(gate)
}

/**
 * WHERE IT PUTS YOU DOWN: a short pull off the Gunwharf.
 *
 * The wharf is where an expedition begins — it is where the warship is, and it
 * is what "the base" means to anybody who has sailed one. Not ON it, because
 * arriving inside a berth ring would open the wharf's own panel the instant you
 * landed, and being handed a screen you did not ask for is not an arrival.
 */
export const PORTAL_HOME = { x: -500, y: -5150 }

/** How close you have to be to use one. A portal is a place you sail INTO, so
 *  it is wider than a chest and narrower than a ship's hail. */
export const PORTAL_REACH = 340

export function portalAt(pt: ReturnPortal) { return placeIn(pt.bay, pt.along, pt.across) }

export function portalNear(x: number, y: number): ReturnPortal | null {
  let best: ReturnPortal | null = null
  let bestD = PORTAL_REACH
  for (const pt of RETURN_PORTALS) {
    const p = portalAt(pt)
    if (!p) continue
    const d = Math.hypot(x - p.x, y - p.y)
    if (d < bestD) { bestD = d; best = pt }
  }
  return best
}

/** Where a thing in bay space actually is. */
function placeIn(bayId: string, along: number, across: number): { x: number; y: number } | null {
  const b = BAY_BY_ID[bayId]
  return b ? fromBay(b, along, across) : null
}

export function encounterAt(e: Encounter) { return placeIn(e.bay, e.along, e.across) }
export function isleAt(i: RaidIsle) { return placeIn(i.bay, i.along, i.across) }

/** A cache is wherever its isle is, so the rock and the chest cannot drift. */
export function cacheAt(c: Cache) {
  const i = ISLE_BY_ID[c.isle]
  return i ? isleAt(i) : null
}

/** And how big the isle under it is, which is what the chest is drawn against —
 *  a fixed-size box on a small rock looks like a shipping container. */
export function cacheIsle(c: Cache): RaidIsle | null {
  return ISLE_BY_ID[c.isle] ?? null
}

/** A beat is wherever its isle is, so the rock and the post cannot drift. */
export function beatAt(b: Beat) {
  const i = ISLE_BY_ID[b.isle]
  return i ? isleAt(i) : null
}

export function beatIsle(b: Beat): RaidIsle | null {
  return ISLE_BY_ID[b.isle] ?? null
}

/** The beat within reach, measured off its rock's edge for the same reason a
 *  cache is: you pull up beside a post, you do not hail it from open water. */
export function beatNear(x: number, y: number): Beat | null {
  let best: Beat | null = null
  let bestD = Infinity
  for (const b of BEATS) {
    const p = beatAt(b)
    const i = beatIsle(b)
    if (!p || !i) continue
    const d = Math.hypot(x - p.x, y - p.y) - i.r
    if (d < CACHE_REACH && d < bestD) { bestD = d; best = b }
  }
  return best
}

/**
 * HOW CLOSE YOU HAVE TO BE TO TAKE SOMETHING ON.
 *
 * Wider than a trader's hail and narrower than a berth. You come alongside a
 * ship rather than arriving at a shore, and this is what "alongside" means for a
 * hull 210 long.
 */
export const ENCOUNTER_REACH = 420

/** And how close to reach into a cache. Measured from the ISLE'S EDGE rather
 *  than from its middle, because the chest stands on a rock you cannot sail
 *  over: a flat radius from the centre of a big isle would be unreachable, and
 *  from a small one would be claimable out of open water. */
export const CACHE_REACH = 240

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
  let bestD = Infinity
  for (const c of CACHES) {
    const p = cacheAt(c)
    const i = cacheIsle(c)
    if (!p || !i) continue
    const d = Math.hypot(x - p.x, y - p.y) - i.r
    if (d < CACHE_REACH && d < bestD) { bestD = d; best = c }
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

/**
 * ── THE WATER A FIGHT HAPPENS ON ────────────────────────────────────────────
 *
 * A raid used to paint a FISHING ZONE PHOTO behind itself, picked by chapter:
 * chapter one fought on a picture of the Shallows. That was a reasonable answer
 * while a raid was a card you opened from a menu and the fight happened
 * nowhere in particular.
 *
 * It happens somewhere now. You sail up to a hull in the Loose Thread and the
 * guns open, and the sea does not become a different sea on the way into the
 * fight — so the backdrop is the water you are floating on, painted from the
 * same three stops the chart paints it from.
 *
 * Falls back to null for anything with no bay: the practice skirmish, the
 * gauntlets, and any raid reached from the node map rather than from the water.
 * Those keep the backdrop they always had.
 */
export function bayOfRaid(raidId: string): Bay | null {
  for (const e of ENCOUNTERS) {
    const n = RAID_MAP.find(m => m.id === e.node)
    if (n?.raidId === raidId) return BAY_BY_ID[e.bay] ?? null
  }
  return null
}

/**
 * A BAY'S WATER AS ONE CSS GRADIENT.
 *
 * The same ellipse, the same stops and the same percentages `seaAt` writes and
 * the water shader reproduces at swell zero — so a fight in the Loose Thread is
 * on the Loose Thread's water, not on an approximation of it. If the chart's
 * gradient is ever re-cut, this is the second place that has to know, and this
 * comment is the note saying so.
 */
export function bayWaterCss(b: Bay): string {
  const dim = (hex: string, k: number) => {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.round(((n >> 16) & 255) * k)
    const g = Math.round(((n >> 8) & 255) * k)
    const bl = Math.round((n & 255) * k)
    return `rgb(${r}, ${g}, ${bl})`
  }
  return `radial-gradient(ellipse 130% 104% at 50% -10%, `
    + `${b.sea[2]} 0%, ${b.sea[1]} 24%, ${b.sea[0]} 60%, ${dim(b.sea[0], 0.62)} 100%)`
}

/** Kept so callers do not have to know the sortie owns the way in. */
export function hubEntry(): { x: number; y: number } {
  return { x: SORTIE.x, y: SORTIE.y }
}
