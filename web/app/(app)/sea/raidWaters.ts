// ── THE CAMPAIGN'S WATER ────────────────────────────────────────────────────
//
// Past the sortie the sea opens out, and four channels run north from it — one
// per chapter, each walled both sides, each with its fights strung along it in
// the order the chain gives them. You come back to the open water between them.
//
// ── WHY A HUB AND SPOKES, AND NOT THE TWO SHAPES BEFORE IT ──────────────────
//
// This is the third shape, and both the earlier ones were wrong about the same
// thing: what the geometry SAYS.
//
//   RINGS, like the fishing grounds. Concentric bands out from one origin say
//   "pick any heading and go as far as you dare" — direction-agnostic by
//   construction. Exactly right for fishing, exactly wrong for a campaign that
//   has an order.
//
//   A CHAIN of walled basins, each opening into the next. Linear, and honestly
//   so, but it hid the campaign from you: standing in chapter I you could see
//   chapter II's rock and nothing past it, and re-farming chapter I meant
//   sailing back through everything that came after.
//
// A HUB FIXES BOTH. From open water you see all four mouths at once, so the
// whole campaign is legible as a shape on your first trip out — three of them
// walled up, and what stands in the way is a thing you can look at. And every
// chapter is one turn off the same water, so going back for Pete is a short run
// rather than a tour of everything you have already beaten.
//
// The channels are strictly linear inside themselves, which is where linearity
// belongs: the ORDER OF A CHAPTER'S FIGHTS. Getting TO a chapter never wanted
// to be linear, and the first two shapes made it so by accident.
//
// ── AND THEY LOOK DIFFERENT ─────────────────────────────────────────────────
//
// Each channel carries its own water and, later, its own rock and props. Four
// identical corridors fanned from a point is a menu with a compass drawn on it;
// the difference between them has to be visible from the hub, before you have
// committed to sailing one.

import { SORTIE } from './chart'
import { RAID_CHAPTERS, RAID_MAP } from '@/lib/raidMap'
import { getRaidConfigById } from '@/lib/raidRegistry'

/**
 * WHERE THE OPEN WATER IS.
 *
 * A short run north of the sortie, so coming through the mouth puts you IN it
 * rather than leaving a crossing before the game starts. No wall of its own: it
 * is open water and should read as open, and the channels' own walls are what
 * give the junction a shape.
 */
export const HUB = { x: 0, y: -9200 }

/** How far the channel mouths sit from the hub's centre. Far enough that all
 *  four are separate places rather than one crowded junction, near enough that
 *  you can see the lot from the middle of it. */
export const MOUTH_AT = 2200

export type Channel = {
  /** Matches a RAID_CHAPTERS id, so the campaign and the water cannot drift. */
  id: string
  chapter: number
  name: string
  /** Which way it runs out of the hub. atan2 radians, so -PI/2 is due north. */
  bearing: number
  /** How far the water runs beyond the mouth. */
  length: number
  /** Half the channel's width. The boat is 210 long, so this is the difference
   *  between a strait you thread and a reach you can turn in. */
  half: number
  /** Three stops, deep to pale, like every water on this chart. */
  sea: [string, string, string]
}

const D = (deg: number) => (deg * Math.PI) / 180

/**
 * THE FOUR ROADS.
 *
 * Fanned across the north forty degrees apart, which at the mouths leaves about
 * four hundred pixels of open water between one channel's wall and the next.
 * Closer and the junction reads as one shape with slots cut in it; wider and
 * the outer two stop being visible from the middle.
 *
 * Chapter V is not here. One Last Ride is a single fight and does not want a
 * road of its own — where Finn waits is a decision for once the four are sailed.
 */
export const CHANNELS: Channel[] = [
  {
    id: 'thread', chapter: 1, name: 'The Loose Thread',
    // West-north-west and the widest: the first road anybody sails should be
    // the one that is hardest to get wrong.
    // LENGTH IS SET BY WHAT STANDS IN IT, not picked first. Seven stops at a
    // hull's clearance apart, and the last one wanting room to turn round in
    // front of, is 4300 of water. `npm run check` measures that.
    bearing: D(210), length: 4300, half: 620,
    sea: ['#12242c', '#26454e', '#5c7f84'],
  },
  {
    id: 'sunken_hand', chapter: 2, name: 'A Bigger Fish',
    // Tighter and longer. The Gullet is fought up here.
    bearing: D(250), length: 3800, half: 520,
    sea: ['#0f1f2a', '#20404e', '#4e7480'],
  },
  {
    id: 'the_coffers', chapter: 3, name: 'The Coffers',
    // Wide again: a fleet action needs room to turn in.
    bearing: D(290), length: 3600, half: 660,
    sea: ['#0c1a26', '#1b3648', '#456b7c'],
  },
  {
    id: 'the_last_fathom', chapter: 4, name: 'The Last Fathom',
    // The longest and the darkest. The deepest water there is.
    bearing: D(330), length: 4200, half: 560,
    sea: ['#08131d', '#152b3c', '#385a6e'],
  },
]

export const CHANNEL_BY_ID: Record<string, Channel> =
  Object.fromEntries(CHANNELS.map(c => [c.id, c]))

/** The mouth of a channel, in world coordinates. */
export function mouthOf(c: Channel): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(c.bearing) * MOUTH_AT,
    y: HUB.y + Math.sin(c.bearing) * MOUTH_AT,
  }
}

/** The far end, where the water stops. */
export function headOf(c: Channel): { x: number; y: number } {
  return {
    x: HUB.x + Math.cos(c.bearing) * (MOUTH_AT + c.length),
    y: HUB.y + Math.sin(c.bearing) * (MOUTH_AT + c.length),
  }
}

/**
 * A POINT IN CHANNEL SPACE: how far ALONG from the mouth, and how far ACROSS
 * from the centre line.
 *
 * Every question about a channel is easier in those two numbers than in world
 * coordinates — where the walls are, whether the boat is inside, where an
 * encounter sits — and it means a road can be re-aimed or lengthened without
 * touching anything standing in it.
 */
export function toChannel(c: Channel, x: number, y: number): { along: number; across: number } {
  const m = mouthOf(c)
  const dx = x - m.x, dy = y - m.y
  const ux = Math.cos(c.bearing), uy = Math.sin(c.bearing)
  return { along: dx * ux + dy * uy, across: dx * -uy + dy * ux }
}

/** And back again. */
export function fromChannel(c: Channel, along: number, across: number): { x: number; y: number } {
  const m = mouthOf(c)
  const ux = Math.cos(c.bearing), uy = Math.sin(c.bearing)
  return { x: m.x + ux * along - uy * across, y: m.y + uy * along + ux * across }
}

/** Is this point in a channel's water? */
export function inChannel(c: Channel, x: number, y: number): boolean {
  const p = toChannel(c, x, y)
  return p.along >= 0 && p.along <= c.length && Math.abs(p.across) <= c.half
}

/** Which channel this point is in, if any. */
export function channelAt(x: number, y: number): Channel | null {
  return CHANNELS.find(c => inChannel(c, x, y)) ?? null
}

/**
 * WHAT OPENS A CHANNEL'S MOUTH: the chapter BEFORE it.
 *
 * Chapter I's road is open from the first minute; every other one is walled
 * until the chapter before it is finished — the same fact `/expeditions` reads
 * to draw a chapter complete. One source, so a captain who finished a chapter on
 * the node map sails out and finds the road already open.
 */
export function opensChannel(c: Channel): string | null {
  const i = CHANNELS.indexOf(c)
  if (i <= 0) return null            // the first road is never shut
  const prev = CHANNELS[i - 1]
  return RAID_CHAPTERS.find(ch => ch.id === prev.id)?.lastNodeId ?? null
}

/** Is this channel's mouth open to this captain? */
export function channelOpen(c: Channel, cleared: Set<string> | string[]): boolean {
  const gate = opensChannel(c)
  if (!gate) return true
  return Array.isArray(cleared) ? cleared.includes(gate) : cleared.has(gate)
}

/**
 * HOW FAR THE CAMPAIGN'S WATER REACHES, derived rather than declared.
 *
 * `RAID_EDGE` is a hand-set constant in chart.ts and this table is hand
 * authored; nothing else stops a channel being lengthened past the sail limit
 * and its head becoming unreachable. `npm run check` asserts they agree.
 */
export function raidReach(originY: number): number {
  return Math.max(...CHANNELS.map(c => {
    const h = headOf(c)
    return Math.hypot(h.x, h.y - originY) + c.half
  })) + 900
}

/**
 * ── WHAT IS IN THE WATER ────────────────────────────────────────────────────
 *
 * A node from the campaign, standing in a channel. That is all an encounter is:
 * the node already knows its own art, its route, its label, its flavour and —
 * for a fight — its raidId, so nothing about the campaign is re-authored out
 * here. `lib/raidMap.ts` stays the source of truth and this is a place to meet
 * it.
 *
 * PLACED IN CHANNEL SPACE: `along` from the mouth, `across` from the centre
 * line. Re-aim or lengthen a road and everything in it moves with it, in order.
 * Absolute coordinates would mean re-placing the lot by hand every time a road
 * moved — the trap the homestead's furniture fell into before it got a bench.
 *
 * CHALLENGE VARIANTS ARE NOT PLACED. raidMap keeps them off the map spine
 * because "the boss's own Normal/Challenge switch is meant to be the single
 * door", and standing a second Pete a few hundred pixels from the first would
 * undo that decision by drawing it.
 */
export type Encounter = {
  /** A RaidNode id. Everything else about it comes from the node. */
  node: string
  /** Which channel it stands in. */
  channel: string
  /** Distance from the mouth, up the channel. */
  along: number
  /** Offset from the centre line. Kept well inside the walls: something pinned
   *  against rock reads as wreckage rather than as what you came for. */
  across: number
}

/**
 * CHAPTER I, UP ITS OWN ROAD.
 *
 * In chain order, so sailing up the channel IS doing the chapter. The story
 * beats sit between the fights rather than beside them, so the thing that
 * explains why you are about to fight somebody is on the way to them — and the
 * closing beat is at the head, where you turn round and come back.
 */
export const ENCOUNTERS: Encounter[] = [
  { node: 'intro', channel: 'thread', along: 520, across: 0 },
  { node: 'skirmish', channel: 'thread', along: 1150, across: -200 },
  { node: 'pete', channel: 'thread', along: 1850, across: 150 },
  { node: 'syndicate', channel: 'thread', along: 2450, across: -160 },
  { node: 'krust_reveal', channel: 'thread', along: 3000, across: 130 },
  { node: 'krust', channel: 'thread', along: 3450, across: -110 },
  { node: 'chapter_1_close', channel: 'thread', along: 3950, across: 0 },
]

/** An encounter's place on the chart. */
export function encounterAt(e: Encounter): { x: number; y: number } | null {
  const c = CHANNEL_BY_ID[e.channel]
  return c ? fromChannel(c, e.along, e.across) : null
}

/** Everything standing in one channel. */
export function encountersIn(channelId: string): Encounter[] {
  return ENCOUNTERS.filter(e => e.channel === channelId)
}

/**
 * HOW CLOSE YOU HAVE TO BE TO TAKE SOMETHING ON.
 *
 * Wider than a trader's hail and narrower than a berth. You come alongside a
 * ship rather than arriving at a shore, and this is what "alongside" means for
 * a hull 210 long.
 */
export const ENCOUNTER_REACH = 420

/** The encounter within reach, if any. Nearest wins, so two that are close
 *  together cannot flicker between them as the swell moves the boat. */
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
 * it flies the FIRST ship in the next raid's sequence up the same road — which
 * is literally what a skirmish puts in front of you, derived rather than picked.
 *
 * A STORY BEAT gets nothing here on purpose. It is not a fight and must not look
 * like one; the water marks it another way.
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
      .filter(x => x.channel === e.channel && x.along > e.along)
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
