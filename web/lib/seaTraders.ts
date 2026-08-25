// THE SALT ROAD — the traders you meet out on the ocean hub.
//
// Plain module, deliberately NOT 'use server': a file with that directive
// silently drops every non-async export, and almost everything here is a pure
// function. It is imported by BOTH the map and the server action, and that is
// the entire point of it existing.
//
// ── WHY THERE IS NO SPAWN TABLE ──────────────────────────────────────────────
//
// A trader is not a row. The sea is cut into cells, and whether a cell holds a
// trader today — and who they are, what they look like, what they are asking —
// is derived by hashing (cell, day). Nothing is stored, nothing is scheduled,
// and no job has to run at midnight.
//
// That is not just cheap, it is what makes the whole thing SAFE. The server
// re-derives the trader from the same two numbers the client did, so a price is
// never something the client tells the server. It is something both of them
// work out and have to agree on.
//
// ── WHY THEY COME BACK ───────────────────────────────────────────────────────
//
// The day is in the hash, so the sea is repopulated every day with different
// people in different places. Sailing past one costs you nothing, because there
// is another tomorrow and another one over the horizon right now. A wandering
// merchant is the kind of feature that turns into a daily chore the moment
// missing one is a loss, and this game does not do that to people.
//
// ── WHY THE DEEP IS STRANGER ─────────────────────────────────────────────────
//
// Density and generosity both climb with distance from the Mainland. Near the
// beach you meet someone shifting worms at a small discount. Ten thousand
// pixels out, where the water is black, you meet someone who should not be out
// there at all and is selling the good stuff cheap. The long sail the chart now
// asks for has to pay for itself in something, and this is it.

import { BAITS, getBait } from '@/lib/bait'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { CHARACTER_COLORS } from '@/lib/characters'
import { RODS } from '@/lib/rods'

/** World pixels per cell. One trader at most per cell, so this also sets how
 *  close together two of them can ever be.
 *
 *  Widened from 900. At that size the sea was busy in a way an ocean should not
 *  be: cells that small put people within sight of each other constantly, and a
 *  wandering trader stops reading as a find when there is always another one
 *  over your shoulder. 1500 is nearly three times the area per cell, so meeting
 *  somebody out here is an event again. */
export const CELL = 1500

export type TraderKind = 'peddler' | 'salter' | 'tinker' | 'resident'

export type TraderLook = {
  /** A player character colour id, so an NPC captain is built exactly the way
   *  the player's own captain is: same sprite, same overlays, same house style,
   *  and any cosmetic that ships for players shows up out here for free. */
  characterColor: string
  boatId: string
  hatId: string | null
  /** A PLAIN rod, always. Glowing rods are things players earn and they carry
   *  a rarity signal with them — an ordinary trader out shifting worms with a
   *  Lightsaber on their knee reads as a bug, and it cheapens the rod. */
  rodSlug: string | null
}

export type Trader = {
  /** Stable key for this trader on this day. Also the claim key. */
  key: string
  kind: TraderKind
  name: string
  /** Where they are floating, in world pixels. */
  x: number
  y: number
  look: TraderLook
  /** One line, said when you pull alongside. */
  line: string
  /** The slow patrol they keep around (x, y). See traderPos. */
  driftR: number
  driftRate: number
  driftPhase: number
} & TraderOffer

export type TraderOffer =
  /** A ZONE'S RESIDENT BUYER. Permanent, always in the same water, and not
   *  subject to the daily deal cap — see the `resident` note in chart.ts. */
  | { deal: 'resident'; zoneId: string; rate: number }
  /** Sells a bundle of one bait at a discount off the shop price. */
  | { deal: 'bait'; baitType: string; qty: number; cost: number; shopCost: number }
  /** Buys the whole hold, right now, at a better rate than a quick sell. */
  | { deal: 'buy'; rate: number }

// ── The hash ────────────────────────────────────────────────────────────────
// A small integer hash with good avalanche, so neighbouring cells on the same
// day look nothing like each other. Deterministic across client and server,
// which rules out Math.random anywhere in this file.

function hash(a: number, b: number, c: number): number {
  let h = (a | 0) * 0x27d4eb2d ^ (b | 0) * 0x165667b1 ^ (c | 0) * 0x9e3779b1
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** A 0..1 stream off one seed, so a trader's every choice comes from the same
 *  root and is reproducible from it. */
function stream(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Days since epoch, UTC. The whole sea turns over on the same tick for
 *  everyone, which is what stops "wait for midnight in my timezone" being a
 *  strategy. */
export function seaDay(now: number = Date.now()): number {
  return Math.floor(now / 86400000)
}

// ── Who is out there ────────────────────────────────────────────────────────

/** How far out this cell is, as a 0..1 ramp. The Mainland is the origin of the
 *  chart, so distance from it is distance from home. Flattens off past the
 *  Ancient Deep rather than climbing forever. */
function depthRamp(x: number, y: number): number {
  return Math.min(1, Math.hypot(x, y) / 7600)
}

/** Chance a given cell holds anyone at all.
 *
 *  A BELL, not a ramp, and the first version got this backwards. Straight
 *  "denser the further out" made the Ancient Deep the busiest water on the
 *  chart — eleven traders inside fourteen hundred pixels, in the one place that
 *  is supposed to be lonely enough to frighten you. Whatever is out there past
 *  the Abyss, it should not be a queue.
 *
 *  So the traffic peaks in the middle waters, which is where shipping actually
 *  would be, and thins out at both ends: quiet near the Mainland because there
 *  is a whole port right there, and quiet in the black because nobody sensible
 *  goes. What DOES change monotonically with depth is how good the deals are
 *  and whether a tinker is possible at all — so the deep stays worth the sail
 *  without being crowded. Rarer AND stranger, rather than more of the same. */
function occupancy(depth: number): number {
  return 0.07 + 0.28 * Math.sin(Math.PI * depth)
}

const NAMES_FIRST = [
  'Old', 'Salt', 'Bent', 'Wry', 'Quiet', 'Lucky', 'Patched', 'Barnacle',
  'Half', 'Crooked', 'Squint', 'Grey', 'Tallow', 'Hollow',
]
const NAMES_LAST = [
  'Meg', 'Corrin', 'Dunnage', 'Pell', 'Marlow', 'Bilge', 'Fitch', 'Ketch',
  'Sorrel', 'Rud', 'Nance', 'Thole', 'Garrick', 'Wick',
]

type WanderKind = Exclude<TraderKind, 'resident'>

const LINES: Record<WanderKind, string[]> = {
  peddler: [
    'Shop prices are a shore thing. Out here I set them.',
    'Bought too much, rowed too far. Your luck, not mine.',
    'It is all worms in the end. Some of it is better worms.',
    'I do not haggle and I do not wait. Yes or no.',
  ],
  salter: [
    'I have salt and barrels and no patience. What is in the hold?',
    'Sell to me and it is done. Sell ashore and it is done Thursday.',
    'Every fish you carry is a fish slowing you down.',
    'I pay better than the quick lads on the dock. Not by much. But better.',
  ],
  tinker: [
    'Nobody comes out this far to buy worms. Good. I do not sell worms.',
    'You are a long way from the beach. So am I. Let us both make it pay.',
    'The dark is good for trade. Nobody follows you into it.',
    'I have been out here longer than is sensible. I have the stock to show it.',
  ],
}

/** Bait a kind will carry, worst to best. The tinker deals only in the top of
 *  the shop's range, which is the reward for the sail rather than a new item
 *  nobody could get otherwise — nothing out here is exclusive. */
const STOCK: Record<WanderKind, string[]> = {
  peddler: ['worm', 'minnow', 'night_crawler'],
  salter: [],
  tinker: ['chum', 'anglers_formula'],
}

/** What each kind is worth crossing water for. The salter's rate sits ABOVE the
 *  65% quick sell and below the market lane on purpose: quick-sell convenience
 *  at a better number, without moving either of the two lanes the economy is
 *  actually built on. */
function offerFor(kind: WanderKind, depth: number, rnd: () => number): TraderOffer | null {
  if (kind === 'salter') {
    // 74% at the beach, 86% out in the black.
    return { deal: 'buy', rate: Math.round((0.74 + depth * 0.12) * 100) / 100 }
  }
  const stock = STOCK[kind]
  const pool = stock.filter(t => (getBait(t)?.shopCost ?? 0) > 0)
  if (!pool.length) return null
  const baitType = pool[Math.floor(rnd() * pool.length)]
  const bait = getBait(baitType)
  if (!bait || bait.shopCost <= 0) return null
  // Bundles get bigger and cheaper the further out you are.
  const qty = bait.bundleSize * (kind === 'tinker' ? 3 : 2)
  const shopCost = bait.shopCost * qty
  const discount = 0.18 + depth * 0.22 + rnd() * 0.08   // 18% .. 48%
  return {
    deal: 'bait',
    baitType,
    qty,
    cost: Math.max(1, Math.round((shopCost * (1 - discount)) / 5) * 5),
    shopCost,
  }
}

/**
 * THE ONE FUNCTION THAT MATTERS.
 *
 * Given a cell and a day, either there is a trader there or there is not, and
 * both the map and the server action get the identical answer. Every field —
 * the price especially — falls out of the seed, so nothing about a deal is ever
 * something the client gets to assert.
 */
export function traderAt(cx: number, cy: number, day: number): Trader | null {
  const seed = hash(cx, cy, day)
  const rnd = stream(seed)

  const x = cx * CELL + rnd() * CELL
  const y = cy * CELL + rnd() * CELL
  const depth = depthRamp(x, y)

  if (rnd() > occupancy(depth)) return null

  // Nobody sets up shop on the doorstep. The Mainland and the Harbour are
  // already places you can buy things.
  if (Math.hypot(x, y) < 620) return null

  // The deeper the water the likelier they are something other than a worm
  // salesman. The tinker only exists past the halfway mark.
  const roll = rnd()
  const kind: WanderKind =
    depth > 0.5 && roll < 0.34 ? 'tinker'
      : roll < 0.62 ? 'peddler'
        : 'salter'

  const offer = offerFor(kind, depth, rnd)
  if (!offer) return null

  const look: TraderLook = {
    characterColor: pick(CHAR_COLORS, rnd),
    boatId: pick(BOAT_IDS, rnd),
    hatId: rnd() < 0.75 ? pick(HAT_IDS, rnd) : null,
    rodSlug: pick(ROD_SLUGS, rnd),
  }

  // A patrol well inside the cell: 90-280px across, one turn every 50-140
  // seconds, starting anywhere on it.
  const driftR = 90 + rnd() * 190
  const driftRate = (rnd() < 0.5 ? 1 : -1) * (Math.PI * 2) / (50 + rnd() * 90)
  const driftPhase = rnd() * Math.PI * 2

  return {
    key: `${day}:${cx}:${cy}`,
    kind,
    name: `${pick(NAMES_FIRST, rnd)} ${pick(NAMES_LAST, rnd)}`,
    x, y, look,
    line: pick(LINES[kind], rnd),
    driftR, driftRate, driftPhase,
    ...offer,
  }
}

function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]
}

/**
 * WHERE A TRADER IS RIGHT NOW.
 *
 * They were pinned to the spot they were hashed into, which made them
 * furniture: an ocean where every other boat is nailed to the water reads as a
 * diorama. Each one keeps a slow circular patrol around its anchor point —
 * different radius, different period, different phase, all off the same seed —
 * so they are always drifting and never in step.
 *
 * The patrol radius is deliberately well inside a cell, so a trader never
 * wanders out of the cell that spawned them and starts flickering as the map
 * recomputes which cells are near.
 *
 * Position is NOT part of the deal. The server rebuilds a trader from the key
 * to price it and never asks where they are, so this can be as fluid as it
 * likes without anything needing to agree about it.
 */
export function traderPos(t: Trader, nowSec: number): { x: number; y: number; facing: 1 | -1 } {
  const a = t.driftPhase + nowSec * t.driftRate
  const x = t.x + Math.cos(a) * t.driftR
  const y = t.y + Math.sin(a) * t.driftR * 0.6
  // Facing comes from which way the patrol is carrying them, so a trader always
  // looks where they are going. The sprite is drawn facing LEFT.
  const vx = -Math.sin(a) * t.driftRate
  return { x, y, facing: vx < 0 ? 1 : -1 }
}

/** Every cell whose trader could be on screen, plus a ring of margin so one
 *  never pops into existence at the edge of the viewport. */
export function tradersAround(x: number, y: number, radius: number, day: number): Trader[] {
  const out: Trader[] = []
  const c0x = Math.floor((x - radius) / CELL)
  const c1x = Math.floor((x + radius) / CELL)
  const c0y = Math.floor((y - radius) / CELL)
  const c1y = Math.floor((y + radius) / CELL)
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      const t = traderAt(cx, cy, day)
      if (t) out.push(t)
    }
  }
  return out
}

/** Parse a claim key back into the numbers that produced it, so the server can
 *  rebuild the trader from a key the client sent WITHOUT trusting anything else
 *  the client said about them. */
export function traderFromKey(key: string): Trader | null {
  const parts = key.split(':')
  if (parts.length !== 3) return null
  const [day, cx, cy] = parts.map(Number)
  if (!Number.isFinite(day) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null
  if (!Number.isInteger(day) || !Number.isInteger(cx) || !Number.isInteger(cy)) return null
  const t = traderAt(cx, cy, day)
  return t && t.key === key ? t : null
}

/** How many deals a captain can strike in a day.
 *
 *  This is the real bound on the whole feature, and it is here because the map
 *  is client-side: the server has no idea where your boat is, so it cannot
 *  check that you actually sailed to the trader you are dealing with. Rather
 *  than pretend otherwise, the cap makes it not matter. The worst anyone can do
 *  by skipping the sailing is take the best few deals of the day instead of the
 *  nearest few, and the deals are small enough that this is a rounding error
 *  against a day's fishing. */
export const DEALS_PER_DAY = 6

/** Names for the UI, kept next to the definitions rather than in a component,
 *  so a new kind cannot ship half-labelled. */
export const KIND_LABEL: Record<TraderKind, string> = {
  peddler: 'Bait peddler',
  salter: 'Salter',
  tinker: 'Deep tinker',
  resident: 'Buyer',
}

// ── WHAT AN NPC CAPTAIN IS MADE OF ──────────────────────────────────────────
//
// The same pieces the player's own captain is made of, taken straight from the
// cosmetic tables rather than written out here. That means a boat or a bandana
// that ships for players turns up on the Salt Road the same day, with nobody
// having to remember to add it, and a rename can never leave a trader
// invisible because their hull id no longer exists.
//
// The showy ones are held back on purpose. A wandering worm salesman in an
// Ethereal hull reads as a bug, and the glowing cosmetics are things players
// worked for — handing them to background characters cheapens both.
const BOAT_IDS = BOATS.filter(b => !b.glow && !b.crateOnly).map(b => b.id)
const HAT_IDS = HATS.filter(h => !h.crateOnly).map(h => h.id)
const CHAR_COLORS = CHARACTER_COLORS.filter(c => c.free).map(c => c.id)
/** Every rod with per-frame sprites and NO glow. Filtered off the real table
 *  rather than listed here, so a new plain rod joins the pool the day it ships
 *  and a rod that gains a glow leaves it. */
const ROD_SLUGS = RODS
  .filter(r => !r.glow && !r.glowType && r.slug && !r.imageUrl)
  .map(r => r.slug as string)

/** Every bait this module names, checked at module load. lib/bait keys on
 *  `type` rather than `id`, which is exactly the kind of detail that produces a
 *  trader silently selling nothing; this turns that into a loud startup error
 *  instead of a dead button in the middle of the ocean. */
for (const types of Object.values(STOCK)) {
  for (const t of types) {
    if (!BAITS.some(b => b.type === t)) {
      throw new Error(`seaTraders: unknown bait type "${t}"`)
    }
  }
}
if (!BOAT_IDS.length || !HAT_IDS.length || !CHAR_COLORS.length || !ROD_SLUGS.length) {
  throw new Error('seaTraders: a cosmetic pool came out empty')
}
