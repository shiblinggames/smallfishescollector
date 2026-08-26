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

export type HotspotId = 'house' | 'portal' | 'gallery' | 'dock' | 'garden' | 'beacon'

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
    id: 'beacon', label: 'The point', x: 64, y: 32,
    note: 'Visible a long way off. That is the whole of it.',
    builds: [
      { name: 'Bare rock', cost: 0, art: null, scale: 0, blurb: 'Somewhere to stand and look out.' },
      { name: 'A brazier', cost: 220_000, art: '/sea/home-brazier.png', scale: 0.048, blurb: 'A fire that somebody has to keep lit.' },
      { name: 'A lighthouse', cost: 950_000, art: '/sea/home-lighthouse.png', scale: 0.066, blurb: 'They can see you coming from the Abyss.' },
    ],
  },
  {
    id: 'gallery', label: 'The gallery', x: 41, y: 45,
    note: 'Where the badges hang. A bare wall shows every one of them already.',
    builds: [
      { name: 'A bare wall', cost: 0, art: null, scale: 0, blurb: 'They are up, at least.' },
      { name: 'A strongroom', cost: 90_000, art: '/sea/home-strongroom.png', scale: 0.071, blurb: 'Under glass, lit from below, and dusted.' },
      { name: 'A gallery hall', cost: 420_000, art: '/sea/home-gallery.png', scale: 0.107, blurb: 'Room to hang your best six large.' },
      { name: "The Captain's Wing", cost: 1_400_000, art: '/sea/home-wing.png', scale: 0.176, blurb: 'A whole wing of it, and a bench for whoever came to look.' },
    ],
  },
  {
    id: 'house', label: 'The house', x: 50, y: 64,
    note: 'How much room the inside has. Every step opens another furniture slot.',
    builds: [
      { name: 'A lean-to', cost: 0, art: '/sea/home-leanto.png', scale: 0.108, blurb: 'Salvage, canvas and stubbornness.' },
      { name: 'A cottage', cost: 40_000, art: '/sea/home-cottage.png', scale: 0.103, blurb: 'One room, one chimney, and a door that shuts.' },
      { name: 'A longhouse', cost: 160_000, art: '/sea/home-longhouse.png', scale: 0.17, blurb: 'Long enough to hang the nets indoors.' },
      { name: 'A great hall', cost: 500_000, art: '/sea/home-hall.png', scale: 0.144, blurb: 'Two storeys, and a fire that never quite goes out.' },
      { name: 'The Estate', cost: 1_300_000, art: '/sea/home-estate.png', scale: 0.17, blurb: 'A tower with a light on it. Nobody mistakes it for anywhere else.' },
    ],
  },
  {
    id: 'garden', label: 'The plot', x: 68, y: 55,
    note: 'Nothing grows fast enough out here to be worth eating. It is for looking at.',
    builds: [
      { name: 'Scrub', cost: 0, art: null, scale: 0, blurb: 'Whatever got here on its own.' },
      { name: 'A kitchen garden', cost: 80_000, art: '/sea/home-kitchen.png', scale: 0.12, blurb: 'Four beds and a losing argument with the salt.' },
      { name: 'A walled garden', cost: 450_000, art: '/sea/home-walled.png', scale: 0.11, blurb: 'Trees, at this latitude. People will ask.' },
    ],
  },
  {
    id: 'portal', label: 'The stones', x: 38, y: 53,
    note: 'THE ONE THING HERE THAT DOES SOMETHING. See PORTAL_REACH.',
    builds: [
      // FOUR PICTURES, NOT ONE AT THREE SIZES. The first pass pointed all three
      // paid tiers at the same arch and grew it 15% and 30%, which is 450,000 ⟡
      // of upgrades you cannot see — and this is the one spot on the island
      // where the upgrade actually does something, so it is the worst place to
      // have nothing to show for it. The stones go up, then get flanked, then
      // get a whole ring, and the light in the gate deepens each time.
      { name: 'Fallen stones', cost: 0, art: '/sea/portal-fallen.png', scale: 0.169, blurb: 'Somebody stood these up once.' },
      { name: 'The Way Home', cost: 150_000, art: '/sea/portal-way.png', scale: 0.064, blurb: 'Come home from anywhere on the water, as often as you like.' },
      { name: 'The Wider Ways', cost: 175_000, art: '/sea/portal-wider.png', scale: 0.131, blurb: 'And go back out to any port you have made.' },
      { name: 'The Deep Ways', cost: 275_000, art: '/sea/portal-deep.png', scale: 0.17, blurb: 'And out to any water your licence covers, however far.' },
    ],
  },
  {
    id: 'dock', label: 'The landing', x: 55, y: 72,
    note: 'Where you tie up. It does not make you faster.',
    builds: [
      { name: 'A shingle beach', cost: 0, art: null, scale: 0, blurb: 'Run her up and hope.' },
      { name: 'A jetty', cost: 60_000, art: '/sea/home-jetty.png', scale: 0.094, blurb: 'Planks, posts, and dry feet.' },
      { name: 'A stone pier', cost: 300_000, art: '/sea/home-pier.png', scale: 0.09, blurb: 'Cut stone and a crane. Built to outlast you.' },
    ],
  },
]

export const HOTSPOT_BY_ID: Record<HotspotId, Hotspot> =
  Object.fromEntries(HOTSPOTS.map(h => [h.id, h])) as Record<HotspotId, Hotspot>

/**
 * WHERE THE PORTAL WILL PUT YOU, by tier.
 *
 * ── WHAT IT DELIBERATELY NEVER REACHES ──────────────────────────────────────
 *
 * Dig sites, and isles you have not already been ashore at. Sailing to those IS
 * the discovery, and a portal that skipped it would be selling the answer to
 * the game's own question. Everything it does reach is somewhere you have
 * already been and already proved you can get to: it removes the repetition,
 * never the first time.
 */
export const PORTAL_REACH = [
  'Nowhere. The stones are down.',
  'Home, from anywhere on the water.',
  'Home, and out to any port.',
  'Home, any port, and the edge of any water you are licensed for.',
] as const

/** How many furniture slots the house opens, by house tier. */
export const HOUSE_SLOTS = [2, 3, 4, 5, 6] as const

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
export type FurnitureSlot = 'hearth' | 'floor' | 'mount' | 'table' | 'window' | 'corner'

export type Furnishing = {
  id: string
  name: string
  cost: number
  /** What it looks like. Null only for the "nothing here" options, which are
   *  genuinely nothing rather than a picture of nothing. */
  art: string | null
}

export const FURNITURE: { slot: FurnitureSlot; label: string; options: Furnishing[] }[] = [
  {
    slot: 'hearth', label: 'The fire',
    options: [
      { id: 'hearth-stone', name: 'Stone hearth', cost: 0 , art: '/sea/hearth-stone.png' },
      { id: 'hearth-iron', name: 'Iron brazier', cost: 15_000 , art: '/sea/hearth-iron.png' },
      { id: 'hearth-copper', name: 'Copper hood', cost: 60_000 , art: '/sea/hearth-copper.png' },
      { id: 'hearth-whale', name: 'Whalebone mantel', cost: 250_000 , art: '/sea/hearth-whale.png' },
      { id: 'hearth-firestone', name: 'An abyssal firestone', cost: 900_000 , art: '/sea/hearth-firestone.png' },
    ],
  },
  {
    slot: 'floor', label: 'Underfoot',
    options: [
      { id: 'floor-board', name: 'Bare boards', cost: 0 , art: null },
      { id: 'floor-kelp', name: 'Kelp weave', cost: 12_000 , art: '/sea/floor-kelp.png' },
      { id: 'floor-sail', name: 'Old sailcloth', cost: 45_000 , art: '/sea/floor-sail.png' },
      { id: 'floor-deep', name: 'Deepwater rug', cost: 200_000 , art: '/sea/floor-deep.png' },
      { id: 'floor-abyssal', name: 'An abyssal weave', cost: 700_000 , art: '/sea/floor-abyssal.png' },
    ],
  },
  {
    slot: 'mount', label: 'Over the fire',
    options: [
      { id: 'mount-none', name: 'Nothing yet', cost: 0 , art: null },
      { id: 'mount-oar', name: 'Crossed oars', cost: 10_000 , art: '/sea/mount-oar.png' },
      { id: 'mount-catch', name: 'Your biggest catch', cost: 70_000 , art: '/sea/mount-catch.png' },
      { id: 'mount-golden', name: 'A golden, cased', cost: 300_000 , art: '/sea/mount-golden.png' },
      { id: 'mount-giant', name: 'An Ancient Deep giant', cost: 1_100_000 , art: '/sea/mount-giant.png' },
    ],
  },
  {
    slot: 'table', label: 'The table',
    options: [
      { id: 'table-plank', name: 'Plank and trestle', cost: 0 , art: '/sea/table-plank.png' },
      { id: 'table-chart', name: 'Chart table', cost: 18_000 , art: '/sea/table-chart.png' },
      { id: 'table-captain', name: "Captain's desk", cost: 80_000 , art: '/sea/table-captain.png' },
      { id: 'table-starglass', name: 'A star-glass table', cost: 350_000 , art: '/sea/table-starglass.png' },
    ],
  },
  {
    slot: 'window', label: 'The window',
    options: [
      { id: 'window-shutter', name: 'Plain shutters', cost: 0 , art: '/sea/window-shutter.png' },
      { id: 'window-lead', name: 'Leaded glass', cost: 16_000 , art: '/sea/window-lead.png' },
      { id: 'window-stained', name: 'Stained glass', cost: 90_000 , art: '/sea/window-stained.png' },
      { id: 'window-seaglass', name: 'A wall of sea-glass', cost: 400_000 , art: '/sea/window-seaglass.png' },
    ],
  },
  {
    slot: 'corner', label: 'The corner',
    options: [
      { id: 'corner-none', name: 'Empty', cost: 0 , art: null },
      { id: 'corner-net', name: 'Nets and floats', cost: 8_000 , art: '/sea/corner-net.png' },
      { id: 'corner-figure', name: "A ship's figurehead", cost: 75_000 , art: '/sea/corner-figure.png' },
      { id: 'corner-lamp', name: 'A drowned lamp, still lit', cost: 320_000 , art: '/sea/corner-lamp.png' },
      { id: 'corner-orrery', name: 'A tide orrery', cost: 1_000_000 , art: '/sea/corner-orrery.png' },
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
 * THE INSIDE, one shell per house tier.
 *
 * ── WHY THE COORDINATES ARE PER ROOM ────────────────────────────────────────
 *
 * The five shells were painted as one home growing, not as one room redressed,
 * so the fireplace is far left in the lean-to, centre-right in the cottage and
 * centre in the hall, and the floor line climbs as the rooms get taller. One
 * shared set of slot positions would have put the fire on a wall in some of them
 * and the table through the floor in others.
 *
 * So each shell carries its own. It is more numbers, and it is the only way the
 * house tier can pay off INSIDE as well as out — which is the whole reason the
 * shell changes with the house rather than staying one room forever.
 */
export const ROOMS: { art: string; spots: Record<FurnitureSlot, SlotSpot> }[] = [
  {
    // The lean-to. Fire crammed in the left corner, dirt floor, one window.
    art: '/sea/room-leanto.jpg',
    spots: {
      floor: { x: 50, y: 99, w: 40 },
      hearth: { x: 21, y: 88, w: 24 },
      mount: { x: 21, y: 58, w: 16 },
      table: { x: 62, y: 94, w: 26 },
      window: { x: 88, y: 40, w: 15 },
      corner: { x: 90, y: 94, w: 14 },
    },
  },
  {
    // The cottage. Fire centre-right, proper boards underfoot.
    art: '/sea/room-cottage.jpg',
    spots: {
      floor: { x: 50, y: 99, w: 40 },
      hearth: { x: 57, y: 77, w: 20 },
      mount: { x: 57, y: 52, w: 15 },
      table: { x: 26, y: 95, w: 28 },
      window: { x: 87, y: 42, w: 15 },
      corner: { x: 11, y: 95, w: 14 },
    },
  },
  {
    // The longhouse. Panelled, fire dead centre, room either side of it.
    art: '/sea/room-longhouse.jpg',
    spots: {
      floor: { x: 50, y: 99, w: 42 },
      hearth: { x: 48, y: 82, w: 22 },
      mount: { x: 48, y: 52, w: 17 },
      table: { x: 78, y: 95, w: 26 },
      window: { x: 85, y: 45, w: 15 },
      corner: { x: 13, y: 95, w: 14 },
    },
  },
  {
    // The great hall. Two storeys, so the chimney breast runs up past the
    // gallery rail and the trophy hangs high.
    art: '/sea/room-hall.jpg',
    spots: {
      floor: { x: 50, y: 99, w: 40 },
      hearth: { x: 52, y: 88, w: 20 },
      mount: { x: 52, y: 58, w: 15 },
      table: { x: 22, y: 96, w: 26 },
      window: { x: 88, y: 52, w: 12 },
      corner: { x: 80, y: 96, w: 13 },
    },
  },
  {
    // The Estate. Carved panelling, stone floor, and a proper mantel to hang
    // the best thing you own over.
    art: '/sea/room-estate.jpg',
    spots: {
      floor: { x: 50, y: 99, w: 42 },
      hearth: { x: 53, y: 90, w: 20 },
      mount: { x: 53, y: 62, w: 15 },
      table: { x: 76, y: 96, w: 26 },
      window: { x: 86, y: 58, w: 12 },
      corner: { x: 16, y: 96, w: 14 },
    },
  },
]

/** The room a captain is currently standing in. */
export function roomFor(h: Homestead) {
  return ROOMS[Math.max(0, Math.min(ROOMS.length - 1, h.spots.house ?? 0))]
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
  /**
   * WHERE THE CAPTAIN PUT THINGS, overriding the designed positions.
   *
   * Partial on purpose: a spot with no entry uses the default from HOTSPOTS, so
   * an untouched homestead reads exactly as designed and adding a seventh
   * hotspot later does not need every existing row migrating.
   */
  layout: Partial<Record<HotspotId, { x: number; y: number }>>
}

export const EMPTY_HOMESTEAD: Homestead = {
  spots: { house: 0, portal: 0, gallery: 0, dock: 0, garden: 0, beacon: 0 },
  furniture: {},
  owned: [],
  pinned: [],
  layout: {},
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
    // Back to front by where the building ACTUALLY is. Sorting on the designed
    // y would paint a dragged building in its old place in the stack, so a
    // house moved to the front of the island would still be drawn behind the
    // beacon it now stands in front of.
    .sort((a, b) => ((h.layout?.[a.spot.id]?.y ?? a.spot.y) - (h.layout?.[b.spot.id]?.y ?? b.spot.y)))
    .map(({ spot, build }) => {
      const at = h.layout?.[spot.id]
      return {
        art: build.art as string,
        x: at?.x ?? spot.x,
        y: at?.y ?? spot.y,
        scale: build.scale,
      }
    })
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

export const HOMESTEAD_HOUSE = spotCost('house') + spotCost('portal')

export const HOMESTEAD_FLEX =
  sum((['gallery', 'dock', 'garden', 'beacon'] as HotspotId[]).map(spotCost))
  + sum(FURNITURE.map(f => Math.max(...f.options.map(o => o.cost))))

export const HOMESTEAD_FINISHED = HOMESTEAD_HOUSE + HOMESTEAD_FLEX

export const HOMESTEAD_EVERY_PIECE =
  sum(HOTSPOTS.map(h => sum(h.builds.map(b => b.cost))))
  + sum(FURNITURE.map(f => sum(f.options.map(o => o.cost))))
