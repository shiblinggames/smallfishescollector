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
    id: 'beacon', label: 'The point', x: 76, y: 28,
    note: 'Visible a long way off. That is the whole of it.',
    builds: [
      { name: 'Bare rock', cost: 0, art: null, scale: 0, blurb: 'Somewhere to stand and look out.' },
      { name: 'A brazier', cost: 220_000, art: '/sea/home-brazier.png', scale: 0.13, blurb: 'A fire that somebody has to keep lit.' },
      { name: 'A lighthouse', cost: 950_000, art: '/sea/home-lighthouse.png', scale: 0.30, blurb: 'They can see you coming from the Abyss.' },
    ],
  },
  {
    id: 'gallery', label: 'The gallery', x: 24, y: 40,
    note: 'Where the badges hang. A bare wall shows every one of them already.',
    builds: [
      { name: 'A bare wall', cost: 0, art: null, scale: 0, blurb: 'They are up, at least.' },
      { name: 'A strongroom', cost: 90_000, art: '/sea/home-strongroom.png', scale: 0.17, blurb: 'Under glass, lit from below, and dusted.' },
      { name: 'A gallery hall', cost: 420_000, art: '/sea/home-gallery.png', scale: 0.25, blurb: 'Room to hang your best six large.' },
      { name: "The Captain's Wing", cost: 1_400_000, art: '/sea/home-wing.png', scale: 0.32, blurb: 'A whole wing of it, and a bench for whoever came to look.' },
    ],
  },
  {
    id: 'house', label: 'The house', x: 50, y: 52,
    note: 'How much room the inside has. Every step opens another furniture slot.',
    builds: [
      { name: 'A lean-to', cost: 0, art: '/sea/home-leanto.png', scale: 0.20, blurb: 'Salvage, canvas and stubbornness.' },
      { name: 'A cottage', cost: 40_000, art: '/sea/home-cottage.png', scale: 0.26, blurb: 'One room, one chimney, and a door that shuts.' },
      { name: 'A longhouse', cost: 160_000, art: '/sea/home-longhouse.png', scale: 0.32, blurb: 'Long enough to hang the nets indoors.' },
      { name: 'A great hall', cost: 500_000, art: '/sea/home-hall.png', scale: 0.38, blurb: 'Two storeys, and a fire that never quite goes out.' },
      { name: 'The Estate', cost: 1_300_000, art: '/sea/home-estate.png', scale: 0.44, blurb: 'A tower with a light on it. Nobody mistakes it for anywhere else.' },
    ],
  },
  {
    id: 'garden', label: 'The plot', x: 74, y: 60,
    note: 'Nothing grows fast enough out here to be worth eating. It is for looking at.',
    builds: [
      { name: 'Scrub', cost: 0, art: null, scale: 0, blurb: 'Whatever got here on its own.' },
      { name: 'A kitchen garden', cost: 80_000, art: '/sea/home-kitchen.png', scale: 0.16, blurb: 'Four beds and a losing argument with the salt.' },
      { name: 'A walled garden', cost: 450_000, art: '/sea/home-walled.png', scale: 0.26, blurb: 'Trees, at this latitude. People will ask.' },
    ],
  },
  {
    id: 'portal', label: 'The stones', x: 30, y: 70,
    note: 'THE ONE THING HERE THAT DOES SOMETHING. See PORTAL_REACH.',
    builds: [
      { name: 'Fallen stones', cost: 0, art: null, scale: 0, blurb: 'Somebody stood these up once.' },
      { name: 'The Way Home', cost: 150_000, art: '/sea/home-portal.png', scale: 0.20, blurb: 'Come home from anywhere on the water, as often as you like.' },
      { name: 'The Wider Ways', cost: 175_000, art: '/sea/home-portal.png', scale: 0.23, blurb: 'And go back out to any port you have made.' },
      { name: 'The Deep Ways', cost: 275_000, art: '/sea/home-portal.png', scale: 0.26, blurb: 'And out to any water your licence covers, however far.' },
    ],
  },
  {
    id: 'dock', label: 'The landing', x: 54, y: 82,
    note: 'Where you tie up. It does not make you faster.',
    builds: [
      { name: 'A shingle beach', cost: 0, art: null, scale: 0, blurb: 'Run her up and hope.' },
      { name: 'A jetty', cost: 60_000, art: '/sea/home-jetty.png', scale: 0.20, blurb: 'Planks, posts, and dry feet.' },
      { name: 'A stone pier', cost: 300_000, art: '/sea/home-pier.png', scale: 0.28, blurb: 'Cut stone and a crane. Built to outlast you.' },
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

export type Furnishing = { id: string; name: string; cost: number }

export const FURNITURE: { slot: FurnitureSlot; label: string; options: Furnishing[] }[] = [
  {
    slot: 'hearth', label: 'The fire',
    options: [
      { id: 'hearth-stone', name: 'Stone hearth', cost: 0 },
      { id: 'hearth-iron', name: 'Iron brazier', cost: 15_000 },
      { id: 'hearth-copper', name: 'Copper hood', cost: 60_000 },
      { id: 'hearth-whale', name: 'Whalebone mantel', cost: 250_000 },
      { id: 'hearth-firestone', name: 'An abyssal firestone', cost: 900_000 },
    ],
  },
  {
    slot: 'floor', label: 'Underfoot',
    options: [
      { id: 'floor-board', name: 'Bare boards', cost: 0 },
      { id: 'floor-kelp', name: 'Kelp weave', cost: 12_000 },
      { id: 'floor-sail', name: 'Old sailcloth', cost: 45_000 },
      { id: 'floor-deep', name: 'Deepwater rug', cost: 200_000 },
      { id: 'floor-abyssal', name: 'An abyssal weave', cost: 700_000 },
    ],
  },
  {
    slot: 'mount', label: 'Over the fire',
    options: [
      { id: 'mount-none', name: 'Nothing yet', cost: 0 },
      { id: 'mount-oar', name: 'Crossed oars', cost: 10_000 },
      { id: 'mount-catch', name: 'Your biggest catch', cost: 70_000 },
      { id: 'mount-golden', name: 'A golden, cased', cost: 300_000 },
      { id: 'mount-giant', name: 'An Ancient Deep giant', cost: 1_100_000 },
    ],
  },
  {
    slot: 'table', label: 'The table',
    options: [
      { id: 'table-plank', name: 'Plank and trestle', cost: 0 },
      { id: 'table-chart', name: 'Chart table', cost: 18_000 },
      { id: 'table-captain', name: "Captain's desk", cost: 80_000 },
      { id: 'table-starglass', name: 'A star-glass table', cost: 350_000 },
    ],
  },
  {
    slot: 'window', label: 'The window',
    options: [
      { id: 'window-shutter', name: 'Plain shutters', cost: 0 },
      { id: 'window-lead', name: 'Leaded glass', cost: 16_000 },
      { id: 'window-stained', name: 'Stained glass', cost: 90_000 },
      { id: 'window-seaglass', name: 'A wall of sea-glass', cost: 400_000 },
    ],
  },
  {
    slot: 'corner', label: 'The corner',
    options: [
      { id: 'corner-none', name: 'Empty', cost: 0 },
      { id: 'corner-net', name: 'Nets and floats', cost: 8_000 },
      { id: 'corner-figure', name: "A ship's figurehead", cost: 75_000 },
      { id: 'corner-lamp', name: 'A drowned lamp, still lit', cost: 320_000 },
      { id: 'corner-orrery', name: 'A tide orrery', cost: 1_000_000 },
    ],
  },
]

export const FURNITURE_BY_SLOT =
  Object.fromEntries(FURNITURE.map(f => [f.slot, f])) as Record<FurnitureSlot, typeof FURNITURE[number]>

/** Every furnishing by id, for pricing a purchase server-side. */
export const FURNISHING_BY_ID: Record<string, { slot: FurnitureSlot; item: Furnishing }> =
  Object.fromEntries(FURNITURE.flatMap(f => f.options.map(o => [o.id, { slot: f.slot, item: o }])))

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
}

export const EMPTY_HOMESTEAD: Homestead = {
  spots: { house: 0, portal: 0, gallery: 0, dock: 0, garden: 0, beacon: 0 },
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
    .sort((a, b) => a.spot.y - b.spot.y)
    .map(({ spot, build }) => ({ art: build.art as string, x: spot.x, y: spot.y, scale: build.scale }))
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
