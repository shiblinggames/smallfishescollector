// THE HOMESTEAD — the one island on this chart that is yours.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and all of this is data. Read by the chart (to draw your island as it
// currently stands), by the homestead page, and by the server actions that take
// the money, and all three have to agree, so there is exactly one table.
//
// ── BUILD SPOTS, NOT A TIER NUMBER ──────────────────────────────────────────
//
// The island is a set of HOTSPOTS: fixed positions with nothing on them until
// you build there, each with its own ladder. A first pass made the whole island
// one "house tier", which is a progress bar wearing a hat — every captain at
// tier 3 has the identical island and the only decision is whether to pay.
//
// Spots make the island a set of CHOICES instead. Somebody who put everything
// into the lighthouse and the gardens has a visibly different home from
// somebody who built the gallery out, at the same total spend, and both are
// legible from a boat sailing past. That is the whole reason to put a house on
// a map rather than on a page.
//
// ── TWO BUDGETS ─────────────────────────────────────────────────────────────
//
// THE HOUSE spot is 2,000,000 all in and is meant to be FINISHED. It holds the
// best art in the set, and art nobody reaches is art nobody drew for them.
//
// EVERYTHING ELSE is flex and is priced to last: the gallery, the lighthouse,
// the gardens and the furniture inside run to several million more. Those exist
// to be seen by somebody who came to look, so their job is to be hard, and
// nothing is hard at house prices to a captain sitting on 2.4M.
//
// The PORTAL is priced with the house rather than the flex. It is the one thing
// here that changes how the game plays, and pricing a mechanic like an ornament
// makes it the thing everybody grinds first and then resents.
//
// ── WHAT MONEY NEVER BUYS ───────────────────────────────────────────────────
//
// Gems, ever. This is a doubloon sink and the economy needs one badly: the
// richest captain holds 2.4M and the whole progression ladder pays 200k. A
// house you could buy with gems would be a house you bought, not one you built.
//
// And never access to your own things. The Almanac and a plain wall of badges
// are there from the first minute; what money buys is a better room to look at
// them in.

/**
 * ── THREE SPOTS ON THE ISLAND, DOWN FROM SIX ────────────────────────────────
 *
 * `dock` is gone: it was a jetty that did nothing, on the shoreline where the
 * berth ring already is, so it was 360,000 doubloons of planks under a circle
 * that already told you where to tie up.
 *
 * `gallery` moved INSIDE. It is a room where things hang on walls, which is a
 * room and not a building — and putting it indoors means the badges and the
 * Almanac are somewhere you stand rather than something the island implies.
 *
 * `portal` is gone from here because it was never the portal. There were TWO:
 * this one, with its own ladder and its own `stepThrough` teleport, and the ring
 * on the water off the island driven by `profiles.portal_tier`. Both worked;
 * both moved your boat. The one on the water is the real one — it is a place you
 * sail into — so the stones are removed and lib/seaPortal is the only portal.
 */
export type HotspotId = 'house' | 'garden' | 'beacon'

export type Build = {
  name: string
  cost: number
  /** The art that stands here, or null for a spot with nothing on it yet. */
  art: string | null
  /** Width as a share of the island box, matching PLACES.buildings. */
  scale: number
  blurb: string
}

export type Hotspot = {
  id: HotspotId
  label: string
  /** Where it stands, in percent of the island box — the same coordinate space
   *  the Mainland's buildings use, so PlaceIsland needs no new concepts. */
  x: number
  y: number
  /** What it does beyond looking like something. Most of them do nothing, and
   *  saying so plainly beats implying otherwise. */
  note: string
  builds: Build[]
}

/**
 * THE SPOTS, listed back to front.
 *
 * `homeBuildings` sorts by `y` before handing them over, because the island
 * paints in array order and a lighthouse behind the house has to be drawn
 * first. Anything added here only needs a sensible `y`.
 */
export const HOTSPOTS: Hotspot[] = [
  {
    id: 'beacon', label: 'The lighthouse', x: 64, y: 32,
    note: 'Visible a long way off. That is the whole of it.',
    builds: [
      { name: 'Bare rock', cost: 0, art: null, scale: 0, blurb: 'Somewhere to stand and look out.' },
      { name: 'A brazier', cost: 220_000, art: '/sea/home-brazier.png', scale: 0.052, blurb: 'A fire that somebody has to keep lit.' },
      { name: 'A lighthouse', cost: 950_000, art: '/sea/home-lighthouse.png', scale: 0.074, blurb: 'They can see you coming from the Abyss.' },
    ],
  },
  {
    id: 'house', label: 'The house', x: 50, y: 64,
    note: 'How much room the inside has. Every step opens another furniture slot.',
    builds: [
      { name: 'A lean-to', cost: 0, art: '/sea/home-leanto.png', scale: 0.099, blurb: 'Salvage, canvas and stubbornness.' },
      { name: 'A cottage', cost: 40_000, art: '/sea/home-cottage.png', scale: 0.11, blurb: 'One room, one chimney, and a door that shuts.' },
      { name: 'A longhouse', cost: 160_000, art: '/sea/home-longhouse.png', scale: 0.21, blurb: 'Long enough to hang the nets indoors.' },
      { name: 'A great hall', cost: 500_000, art: '/sea/home-hall.png', scale: 0.189, blurb: 'Two storeys, and a fire that never quite goes out.' },
      { name: 'The Estate', cost: 1_300_000, art: '/sea/home-estate.png', scale: 0.241, blurb: 'A tower with a light on it. Nobody mistakes it for anywhere else.' },
    ],
  },
  {
    id: 'garden', label: 'The plot', x: 68, y: 55,
    note: 'Nothing grows fast enough out here to be worth eating. It is for looking at.',
    builds: [
      { name: 'Scrub', cost: 0, art: null, scale: 0, blurb: 'Whatever got here on its own.' },
      { name: 'A kitchen garden', cost: 80_000, art: '/sea/home-kitchen.png', scale: 0.138, blurb: 'Four beds and a losing argument with the salt.' },
      { name: 'A walled garden', cost: 450_000, art: '/sea/home-walled.png', scale: 0.14, blurb: 'Trees, at this latitude. People will ask.' },
    ],
  },
]

export const HOTSPOT_BY_ID: Record<HotspotId, Hotspot> =
  Object.fromEntries(HOTSPOTS.map(h => [h.id, h])) as Record<HotspotId, Hotspot>

// PORTAL_REACH LIVED HERE and went with the stones. The portal is
// lib/seaPortal, it is the ring on the water, and it has always been the only
// one that anybody sails to.

/**
 * How many furniture slots the house opens, by house tier.
 *
 * One per rung now that the window is the room's rather than yours: five slots,
 * five steps, and the top of the ladder opens the last one. It used to run to
 * six against six slots, which was the same shape — the shape is what matters,
 * because a house rung that opens nothing is a house rung nobody buys.
 *
 * A lean-to with only a fire is right. It is a lean-to.
 */
export const HOUSE_SLOTS = [1, 2, 3, 4, 5] as const

/**
 * FURNITURE — the inside, and the deepest part of the flex.
 *
 * Six slots, each with a handful of options, all purely visual and permanent
 * once bought. Costs climb hard toward the top of a slot on purpose: the cheap
 * pieces make the room yours early, and the last one in a slot is six figures
 * and is for a captain who has run out of other things to want. Nothing here
 * does anything, which is exactly why it can cost this much.
 *
 * `id` values are stored in a row and must never change. The label can.
 */
/**
 * FIVE SLOTS. `window` is gone.
 *
 * A window is a HOLE IN A WALL, and the wall is painted. Every other furnishing
 * sits in front of the picture and only has to stand in about the right place;
 * a window has to line up with an opening that already exists, at that room's
 * exact perspective, in all five shells. Nothing else in here is asked to match
 * geometry it did not draw, and it is the one slot where being two percent out
 * reads as a mistake rather than as a choice.
 *
 * So the window belongs to the ROOM now: each shell was painted with its own,
 * and a bigger house simply has a better one. Nothing to buy, nothing to place,
 * and no way for it to be wrong.
 */
export type FurnitureSlot = 'hearth' | 'floor' | 'mount' | 'table' | 'corner'

export type Furnishing = {
  id: string
  name: string
  /** Doubloons. Zero on the free default AND on anything `found` — see below. */
  cost: number
  /** What it looks like. Null only for the "nothing here" options, which are
   *  genuinely nothing rather than a picture of nothing. */
  art: string | null
  /**
   * SALVAGE. The isle you have to go ashore at to own this, and the only way to
   * get it — no price, no alternative.
   *
   * ── WHY THE BEST THING IN EACH ROOM CANNOT BE BOUGHT ──────────────────
   *
   * The top rung of every one of these ladders used to be the most expensive
   * rung, which made the finest room in the game a readout of how many
   * doubloons its owner had. That is the shape of thing this game says it will
   * not be. A captain who has stood on Worldsend Rock has something a richer
   * captain cannot order, and the only way to catch up is to sail there too.
   *
   * It also gives the isles a reason to exist past the first visit. They paid
   * gems and coin, which are the same gems and coin as everywhere else; now
   * six of them pay the only copy of something.
   */
  found?: { isle: string }
}

export const FURNITURE: { slot: FurnitureSlot; label: string; options: Furnishing[] }[] = [
  {
    slot: 'hearth', label: 'The fire',
    options: [
      { id: 'hearth-stone', name: 'Stone hearth', cost: 0 , art: '/sea/hearth-stone.png' },
      { id: 'hearth-iron', name: 'Iron brazier', cost: 15_000 , art: '/sea/hearth-iron.png' },
      { id: 'hearth-copper', name: 'Copper hood', cost: 60_000 , art: '/sea/hearth-copper.png' },
      { id: 'hearth-whale', name: 'Whalebone mantel', cost: 250_000 , art: '/sea/hearth-whale.png' },
      { id: 'hearth-firestone', name: 'An abyssal firestone', cost: 0 , art: '/sea/hearth-firestone.png', found: { isle: 'ancient_deep-0' } },
    ],
  },
  {
    slot: 'floor', label: 'Underfoot',
    options: [
      { id: 'floor-board', name: 'Bare boards', cost: 0 , art: null },
      { id: 'floor-kelp', name: 'Kelp weave', cost: 12_000 , art: '/sea/floor-kelp.png' },
      { id: 'floor-sail', name: 'Old sailcloth', cost: 45_000 , art: '/sea/floor-sail.png' },
      { id: 'floor-deep', name: 'Deepwater rug', cost: 200_000 , art: '/sea/floor-deep.png' },
      { id: 'floor-abyssal', name: 'An abyssal weave', cost: 0 , art: '/sea/floor-abyssal.png', found: { isle: 'abyss-2' } },
    ],
  },
  {
    slot: 'mount', label: 'Over the fire',
    options: [
      { id: 'mount-none', name: 'Nothing yet', cost: 0 , art: null },
      { id: 'mount-oar', name: 'Crossed oars', cost: 10_000 , art: '/sea/mount-oar.png' },
      { id: 'mount-catch', name: 'Your biggest catch', cost: 70_000 , art: '/sea/mount-catch.png' },
      { id: 'mount-golden', name: 'A golden, cased', cost: 300_000 , art: '/sea/mount-golden.png' },
      { id: 'mount-giant', name: 'An Ancient Deep giant', cost: 0 , art: '/sea/mount-giant.png', found: { isle: 'ancient_deep-2' } },
    ],
  },
  {
    slot: 'table', label: 'The table',
    options: [
      { id: 'table-plank', name: 'Plank and trestle', cost: 0 , art: '/sea/table-plank.png' },
      { id: 'table-chart', name: 'Chart table', cost: 18_000 , art: '/sea/table-chart.png' },
      { id: 'table-captain', name: "Captain's desk", cost: 80_000 , art: '/sea/table-captain.png' },
      { id: 'table-starglass', name: 'A star-glass table', cost: 0 , art: '/sea/table-starglass.png', found: { isle: 'ancient_deep-3' } },
    ],
  },
  {
    slot: 'corner', label: 'The corner',
    options: [
      { id: 'corner-none', name: 'Empty', cost: 0 , art: null },
      { id: 'corner-net', name: 'Nets and floats', cost: 8_000 , art: '/sea/corner-net.png' },
      { id: 'corner-figure', name: "A ship's figurehead", cost: 75_000 , art: '/sea/corner-figure.png' },
      { id: 'corner-lamp', name: 'A drowned lamp, still lit', cost: 320_000 , art: '/sea/corner-lamp.png' },
      { id: 'corner-orrery', name: 'A tide orrery', cost: 0 , art: '/sea/corner-orrery.png', found: { isle: 'ancient_deep-4' } },
    ],
  },
]

export const FURNITURE_BY_SLOT =
  Object.fromEntries(FURNITURE.map(f => [f.slot, f])) as Record<FurnitureSlot, typeof FURNITURE[number]>

/** Every furnishing by id, for pricing a purchase server-side. */
export const FURNISHING_BY_ID: Record<string, { slot: FurnitureSlot; item: Furnishing }> =
  Object.fromEntries(FURNITURE.flatMap(f => f.options.map(o => [o.id, { slot: f.slot, item: o }])))

/**
 * WHERE A THING STANDS IN A ROOM.
 *
 * Percentages of the room image. `y` is the BOTTOM of the piece, not its
 * middle, because everything in here sits on something: a table stands on the
 * floor, a hearth sits in its recess, a trophy hangs off the chimney breast. An
 * anchor at the middle would make every piece float when its art changed height.
 */
export type SlotSpot = { x: number; y: number; w: number }

/**
 * ── THE ROOMS ───────────────────────────────────────────────────────────────
 *
 * The house used to be ONE room that changed shell as it grew. It is a set of
 * rooms now, stepped through with arrows, and the house tier decides how many
 * you have — which is what makes a bigger house feel bigger from the inside
 * rather than just better decorated.
 *
 * THE MAIN ROOM still swaps shell with the tier: a lean-to becomes a cottage
 * becomes an estate, and that is the same progression as before. What is new is
 * that the tier ALSO opens doors:
 *
 *   tier 0-1  the main room, and nothing else
 *   tier 2    the gallery
 *   tier 3    the menagerie
 *   tier 4    the trophy room
 *
 * ── AND EVERY SHELL IS EMPTY NOW ────────────────────────────────────────────
 *
 * The old art had its fixtures painted in — a stone fireplace in the cottage, a
 * carved marble mantel in the estate — so the hearth ladder was drawn on top of
 * a fireplace that was part of the wall. Every shell was regenerated bare, which
 * is why all the spot coordinates below are new: they are placed against rooms
 * with nothing in them, on a shared perspective grid.
 *
 * THE GRID IS THE POINT. All eight were painted to one vanishing point with the
 * back wall parallel to the picture plane, so the same broad positions work in
 * every room: the fire sits left of centre on the back wall, the mount hangs
 * above it, the table stands right of centre on the floor, the corner piece goes
 * bottom right. Per-room numbers still exist because the floor line and the
 * ceiling height differ, but they are variations on one layout rather than six
 * unrelated ones.
 */
export type RoomId = 'main' | 'gallery' | 'menagerie' | 'trophy'

export type RoomDef = {
  id: RoomId
  name: string
  /** What it is for, in one line, shown under the name. */
  blurb: string
  /** House tier that opens the door. The main room is always open. */
  needsHouse: number
  /** The shell. The main room takes one per house tier; the rest have one. */
  art: string | string[]
  /**
   * Where furniture stands. Only the main room is furnished — the other three
   * are filled by what you have DONE rather than what you have bought, which is
   * the whole difference between them.
   */
  spots?: Record<FurnitureSlot, SlotSpot>[]
  /**
   * WHERE THE ROOM'S OWN CONTENTS SIT.
   *
   * The gallery, the menagerie and the trophy room are not furnished, but what
   * fills them still has to land somewhere: a badge wall too low is badges on
   * the skirting board, and pets floating a third of the way up the glass is
   * worse. One box per room, dragged on the bench like everything else.
   *
   * `x` and `y` are the box's CENTRE and `w` its width, all percent of the room.
   * A box rather than a point because these hold a grid of things whose count
   * changes — eighteen badges or one pet — and what has to be placed is the
   * area they flow inside.
   */
  content?: { x: number; y: number; w: number }
}

/** Placed against the empty shells. `y` is the BOTTOM of the piece. */
const MAIN_SPOTS: Record<FurnitureSlot, SlotSpot>[] = [
  // The lean-to: low roof, dirt floor high in the frame, everything small.
  { floor: { x: 50, y: 99, w: 46 }, hearth: { x: 33, y: 86, w: 20 },
    mount: { x: 33, y: 62, w: 15 }, table: { x: 66, y: 88, w: 24 }, corner: { x: 90, y: 92, w: 15 } },
  // The cottage: taller walls, a proper board floor, window right.
  { floor: { x: 50, y: 99, w: 48 }, hearth: { x: 34, y: 84, w: 21 },
    mount: { x: 34, y: 58, w: 16 }, table: { x: 66, y: 87, w: 25 }, corner: { x: 90, y: 91, w: 15 } },
  // The longhouse: wide and dark, more floor showing.
  { floor: { x: 50, y: 99, w: 52 }, hearth: { x: 33, y: 83, w: 22 },
    mount: { x: 33, y: 56, w: 17 }, table: { x: 67, y: 87, w: 26 }, corner: { x: 91, y: 91, w: 16 } },
  // The great hall: high stone, the floor line drops away.
  { floor: { x: 50, y: 99, w: 54 }, hearth: { x: 33, y: 82, w: 23 },
    mount: { x: 33, y: 53, w: 18 }, table: { x: 67, y: 86, w: 27 }, corner: { x: 91, y: 90, w: 16 } },
  // The estate: panelled, flagged, and the tallest of them.
  { floor: { x: 50, y: 99, w: 56 }, hearth: { x: 34, y: 81, w: 23 },
    mount: { x: 34, y: 52, w: 18 }, table: { x: 67, y: 86, w: 27 }, corner: { x: 91, y: 90, w: 16 } },
]

export const ROOMS: RoomDef[] = [
  {
    id: 'main', name: 'The house', blurb: 'The room you actually live in.',
    needsHouse: 0,
    art: [
      '/sea/room-leanto.jpg', '/sea/room-cottage.jpg', '/sea/room-longhouse.jpg',
      '/sea/room-hall.jpg', '/sea/room-estate.jpg',
    ],
    spots: MAIN_SPOTS,
  },
  {
    id: 'gallery', name: 'The gallery', blurb: 'Your badges, and every fish you have logged.',
    needsHouse: 2, art: '/sea/room-gallery.jpg',
    content: { x: 50, y: 48, w: 72 },
  },
  {
    id: 'menagerie', name: 'The menagerie', blurb: 'Every pet you have ever taken in.',
    needsHouse: 3, art: '/sea/room-menagerie.jpg',
    content: { x: 50, y: 82, w: 80 },
  },
  {
    id: 'trophy', name: 'The trophy room', blurb: 'The giants, and what they cost you.',
    needsHouse: 4, art: '/sea/room-trophy.jpg',
    content: { x: 50, y: 44, w: 74 },
  },
]

export const ROOM_BY_ID: Record<RoomId, RoomDef> =
  Object.fromEntries(ROOMS.map(r => [r.id, r])) as Record<RoomId, RoomDef>

/** The rooms this house is big enough to have, in order. Always at least one. */
export function openRooms(h: Homestead): RoomDef[] {
  const tier = h.spots.house ?? 0
  return ROOMS.filter(r => tier >= r.needsHouse)
}

/** The shell for a room at this house tier. */
export function roomArt(room: RoomDef, houseTier: number): string {
  if (typeof room.art === 'string') return room.art
  return room.art[Math.max(0, Math.min(room.art.length - 1, houseTier))]
}

/** Where furniture stands in the main room at this house tier. */
export function roomSpots(room: RoomDef, houseTier: number): Record<FurnitureSlot, SlotSpot> | null {
  if (!room.spots) return null
  return room.spots[Math.max(0, Math.min(room.spots.length - 1, houseTier))]
}

/** What a captain's homestead currently is. Mirrors the `homesteads` row. */
export type Homestead = {
  /** hotspot id -> how far up its ladder they have built. */
  spots: Record<HotspotId, number>
  /** slot -> furnishing id. Absent means the free default for that slot. */
  furniture: Partial<Record<FurnitureSlot, string>>
  /**
   * Every furnishing ever paid for, whether it is out or not.
   *
   * Furniture is permanent, so putting back a piece you owned before costs
   * nothing. Without this a captain picks one piece per slot and never touches
   * it again, because changing their mind means paying twice for the same
   * object — which is the opposite of a room you decorate.
   */
  owned: string[]
  /** Badge ids hung large. Only read once the gallery is a hall or better. */
  pinned: string[]
  // `layout` LIVED HERE. Arranging the island by dragging buildings around is
  // gone: with three spots rather than six there is nothing to arrange, and a
  // homestead that reads as designed from a passing boat is worth more than one
  // every captain has nudged two percent to the left.
}

export const EMPTY_HOMESTEAD: Homestead = {
  spots: { house: 0, garden: 0, beacon: 0 },
  furniture: {},
  owned: [],
  pinned: [],
}

/** How many badges the gallery lets you hang large. */
export const PINNED_MAX = 6

/** What stands on a spot right now. Clamped, so a row from a future version of
 *  this table cannot index off the end of a ladder that has since been cut. */
export function builtAt(h: Homestead, id: HotspotId): Build {
  const spot = HOTSPOT_BY_ID[id]
  return spot.builds[Math.max(0, Math.min(spot.builds.length - 1, h.spots[id] ?? 0))]
}

/** The next build on a spot, or null when it is finished. */
export function nextBuild(h: Homestead, id: HotspotId): Build | null {
  const spot = HOTSPOT_BY_ID[id]
  const t = (h.spots[id] ?? 0) + 1
  return t < spot.builds.length ? spot.builds[t] : null
}

/**
 * WHAT THE ISLAND LOOKS LIKE, in PlaceIsland's own `buildings` shape.
 *
 * Sorted back to front. Empty spots contribute nothing at all rather than an
 * invisible element, so a fresh homestead is genuinely a bare rock with one
 * lean-to on it.
 */
export function homeBuildings(h: Homestead): { art: string; x: number; y: number; scale: number }[] {
  return HOTSPOTS
    .map(spot => ({ spot, build: builtAt(h, spot.id) }))
    .filter(({ build }) => build.art !== null)
    // Back to front, so a lighthouse behind the house is painted first. The
    // designed y IS the position now that nothing can be dragged.
    .sort((a, b) => a.spot.y - b.spot.y)
    .map(({ spot, build }) => ({
      art: build.art as string,
      x: spot.x,
      y: spot.y,
      scale: build.scale,
    }))
}

/** Slots the house is currently big enough to hold, in order. */
export function openSlots(h: Homestead): FurnitureSlot[] {
  const n = HOUSE_SLOTS[Math.max(0, Math.min(HOUSE_SLOTS.length - 1, h.spots.house ?? 0))]
  return FURNITURE.slice(0, n).map(f => f.slot)
}

/** The furnishing showing in a slot, falling back to that slot's free default. */
export function furnishingIn(h: Homestead, slot: FurnitureSlot): Furnishing {
  const chosen = h.furniture[slot]
  const opts = FURNITURE_BY_SLOT[slot].options
  return opts.find(o => o.id === chosen) ?? opts[0]
}

/**
 * WHAT IT COSTS, split the way the budget is.
 *
 * Quoting one number here misprices the feature, and a first pass did exactly
 * that: it summed every furnishing in every slot, called that the total, and
 * came out 50% over a budget it was actually under.
 *
 *   HOUSE   the house spot and the portal. Meant to be finished.
 *   FLEX    every other spot, plus the best piece in each of the six slots.
 *           Meant not to be, quickly.
 *   EVERY   also the pieces you passed over on the way up. Changes nothing
 *           visible at the end; completionism, not the goal.
 */
const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0)
const spotCost = (id: HotspotId) => sum(HOTSPOT_BY_ID[id].builds.map(b => b.cost))

// THE HOUSE IS THE HOUSE, and the portal is no longer part of this budget: it
// is bought on the water now, out of lib/seaPortal's own ladder.
export const HOMESTEAD_HOUSE = spotCost('house')

export const HOMESTEAD_FLEX =
  sum((['garden', 'beacon'] as HotspotId[]).map(spotCost))
  + sum(FURNITURE.map(f => Math.max(...f.options.map(o => o.cost))))

export const HOMESTEAD_FINISHED = HOMESTEAD_HOUSE + HOMESTEAD_FLEX

export const HOMESTEAD_EVERY_PIECE =
  sum(HOTSPOTS.map(h => sum(h.builds.map(b => b.cost))))
  + sum(FURNITURE.map(f => sum(f.options.map(o => o.cost))))
