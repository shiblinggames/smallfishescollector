// THE HOMESTEAD — the one island on this chart that is yours.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and all of this is data. Read by the chart (to draw your island as it
// currently stands), by the homestead page, and by the server actions that take
// the money, and all three have to agree, so there is exactly one table.
//
// ── ONE LADDER, AND THE ISLAND IS THE REWARD ────────────────────────────────
//
// The island used to be a set of HOTSPOTS: fixed positions, each with its own
// ladder, so a captain could put everything into the lighthouse and nothing into
// the gardens. The argument was that spots make the island a set of CHOICES
// rather than a progress bar wearing a hat.
//
// It did not survive contact with the art. Three ladders meant three sprites
// dropped at three coordinates, and three paintings near each other are not a
// place. What you got was a lighthouse whose light disagreed with the house's,
// standing on ground that did not meet the garden's, and no amount of moving
// them fixes a composition that was never composed.
//
// So: one ladder, and every rung repaints the WHOLE island. See HOUSE below.
//
// ── TWO BUDGETS ─────────────────────────────────────────────────────────────
//
// THE HOUSE is 3,660,000 all in and is meant to be FINISHED, eventually. It
// carries the plot and the lighthouse now, so it carries what those cost too:
// the fold was a simplification of the interface, not a sale.
//
// THE FURNITURE is the flex, and is priced to last: the best piece in each of
// the five slots runs to millions more. It exists to be seen by somebody who
// came to look, so its job is to be hard, and nothing is hard at house prices
// to a captain sitting on 2.4M.
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
 * ── ONE LADDER, AND ONE PICTURE ─────────────────────────────────────────────
 *
 * There were six spots on this island, then three, and now there is one.
 *
 * `dock` went first: a jetty that did nothing, on the shoreline where the berth
 * ring already is, so it was 360,000 doubloons of planks under a circle that
 * already told you where to tie up. `gallery` moved INSIDE, because a room where
 * things hang on walls is a room and not a building. `portal` went because it
 * was never the portal — there were two, and the real one is the ring on the
 * water that you sail into.
 *
 * ── AND NOW THE PLOT AND THE LIGHTHOUSE ─────────────────────────────────────
 *
 * Those two were separate ladders with separate art dropped at fixed points on
 * the island, and the result never looked like one place. A lighthouse sprite at
 * 64,32 and a walled garden sprite at 68,55 are two paintings that happen to be
 * near each other: their light does not agree, their ground does not meet, and
 * nothing about the composition says the same person built both. You cannot fix
 * that by nudging the coordinates, because the problem is that they were drawn
 * apart.
 *
 * So the island is ONE PAINTING PER RUNG now, the way the Mainland is one town
 * rather than a scatter of shops. Upgrading the house repaints the whole
 * homestead, and what arrives is not only a bigger house: the kitchen garden
 * comes with the cottage, the walled garden with the longhouse, a brazier with
 * the great hall, and the lighthouse with the Estate. Each picture contains
 * everything the one before it had, so the island only ever grows.
 *
 * The trade is real and worth naming: you no longer choose to be the captain
 * with a great lighthouse and no garden. That choice was the argument for spots
 * in the first place. It bought a differentiation nobody could see, because at
 * chart scale a homestead reads as a silhouette, and a coherent silhouette that
 * grows says more about a captain than a legible-in-theory permutation of three
 * ladders that never composed.
 *
 * ── AND IT COSTS WHAT THE THREE COST ────────────────────────────────────────
 *
 * 3.66M all in, against 3.7M across the ladders it replaces. The homestead is
 * this game's one real doubloon sink — the richest captain is holding 2.4M and
 * the whole progression ladder pays 200k — so folding three ladders into one is
 * a simplification of the INTERFACE and must not become a 46% discount.
 */
export type Build = {
  name: string
  cost: number
  /** The whole island at this rung, as one painting. Never null: even the first
   *  rung is a picture, because a homestead with nothing on it is still a place
   *  somebody lives. */
  art: string
  /**
   * WHERE IT STANDS AND HOW BIG, in the same units and the same shape as
   * PLACES.buildings: x and y are percentages of the island box and mark the
   * painting's BOTTOM CENTRE, scale is a share of the island's diameter.
   *
   * PER RUNG, not shared. A single HOUSE_AT for all five was the tidier data and
   * the wrong data: these are five separate paintings, and the point their
   * ground meets the island is in a slightly different place in each one. Sharing
   * the anchor meant the only way to line the settlement up was to compromise
   * every rung, which is how you get a lean-to that floats and an Estate whose
   * jetty is buried in the sand.
   */
  x: number
  y: number
  scale: number
  blurb: string
  /** What arrived with this rung besides the house itself, for the ladder card.
   *  Empty on the first, which is the point of the first. */
  adds: string
}

/**
 * THE HOUSE LADDER — five rungs, and the only thing on this island you buy.
 *
 * Each rung's `art` is the entire homestead at that stage, so `homeBuildings`
 * hands PlaceIsland exactly one sprite and the composition is whatever the
 * painter composed rather than whatever the coordinates happened to allow.
 *
 * `scale` climbs because the settlement spreads, and it is bounded by the land:
 * scripts/check-islands measures the widest rung against the seeded coastline
 * and fails if the Estate's outbuildings would stand in the surf.
 */
export const HOUSE: Build[] = [
  {
    name: 'A lean-to', cost: 0, art: '/sea/home-isle-1.png', x: 53, y: 56, scale: 0.28,
    blurb: 'Salvage, canvas and stubbornness.',
    adds: '',
  },
  {
    name: 'A cottage', cost: 60_000, art: '/sea/home-isle-2.png', x: 53, y: 59, scale: 0.36,
    blurb: 'One room, one chimney, and a door that shuts.',
    adds: 'A kitchen garden, and a path worn between the two.',
  },
  {
    name: 'A longhouse', cost: 300_000, art: '/sea/home-isle-3.png', x: 54, y: 61, scale: 0.41,
    blurb: 'Long enough to hang the nets indoors.',
    adds: 'A walled garden, a drying rack and a woodpile.',
  },
  {
    name: 'A great hall', cost: 900_000, art: '/sea/home-isle-4.png', x: 54, y: 63, scale: 0.45,
    blurb: 'Two storeys, and a fire that never quite goes out.',
    adds: 'A brazier up on the headland, and a boathouse below it.',
  },
  {
    name: 'The Estate', cost: 2_400_000, art: '/sea/home-isle-5.png', x: 54, y: 66, scale: 0.50,
    blurb: 'Nobody mistakes it for anywhere else.',
    adds: 'A working lighthouse. They can see you coming from the Abyss.',
  },
]

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
 * Five slots, each with a handful of options, all purely visual and permanent
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
/**
 * ── THE TABLE WENT AND A SECOND CORNER TOOK ITS PLACE ───────────────────────
 *
 * A table stands in the MIDDLE of a room, which on a one-point-perspective shell
 * means directly between the camera and the back wall — so the better the table
 * got, the more of the fireplace it hid. The hearth is the most expensive ladder
 * in the room and the one thing every shell is built around; a slot whose upper
 * rungs obscure it is a slot fighting the room.
 *
 * Corners do not have that problem. They are at the edges by definition, they
 * frame the fire rather than blocking it, and two of them give the room a left
 * and a right to balance — which is also the only symmetry a straight-on room
 * can offer.
 */
export type FurnitureSlot = 'hearth' | 'floor' | 'mount' | 'cornerL' | 'cornerR'

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
    slot: 'cornerL', label: 'The left corner',
    options: [
      { id: 'cornerl-none', name: 'Empty', cost: 0 , art: null },
      { id: 'cornerl-chest', name: 'A sea chest', cost: 9_000 , art: '/sea/cornerl-chest.png' },
      { id: 'cornerl-rods', name: 'A rod rack', cost: 70_000 , art: '/sea/cornerl-rods.png' },
      { id: 'cornerl-glass', name: 'A standing glass', cost: 300_000 , art: '/sea/cornerl-glass.png' },
      { id: 'cornerl-anchor', name: 'An anchor off something older', cost: 0 , art: '/sea/cornerl-anchor.png', found: { isle: 'abyss-1' } },
    ],
  },
  {
    slot: 'cornerR', label: 'The right corner',
    options: [
      { id: 'cornerr-none', name: 'Empty', cost: 0 , art: null },
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
 * every room: the fire sits DEAD CENTRE on the back wall, the mount hangs
 * directly above it, and a corner piece stands either side of the pair. Per-room
 * numbers still exist because the floor line and the ceiling height differ, but
 * they are variations on one layout rather than six unrelated ones.
 *
 * THE MIDDLE OF THE FLOOR IS DELIBERATELY EMPTY. On a one-point grid the centre
 * of the room is the line between the camera and the back wall, which is where
 * the hearth is — so anything standing there hides the most expensive thing in
 * the room. That is what the table did and why it is gone.
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
/*
 * PLACED ON THE BENCH, not written from the art. Every number below came off
 * /home/calibrate with the shell on screen, which is the only way any of it was
 * ever going to be right — see the bench's own header for why.
 *
 * Read the table sideways and the house is legible: the hearth sits DEAD CENTRE
 * in all five and shrinks as the room grows (23 down to 15), because the walls
 * get further away rather than the fire getting smaller. The corners close in
 * from x 28/73 to x 32/70 for the same reason. The floor line climbs from y 100
 * to y 95 and back to y 100 as the shells change what you are standing on.
 *
 * The corners are inboard rather than at the frame edge, which the blind pass
 * had wrong. At x 10 a piece stands in the wall: the room's floor does not reach
 * the edge of the picture, so the corners of the ROOM are nowhere near the
 * corners of the IMAGE.
 */
const MAIN_SPOTS: Record<FurnitureSlot, SlotSpot>[] = [
  // Lean-to
  { floor: { x: 50, y: 100, w: 46 }, hearth: { x: 50, y: 79, w: 23 },
    mount: { x: 50, y: 49, w: 15 }, cornerL: { x: 28, y: 79, w: 12 },
    cornerR: { x: 73, y: 79, w: 14 } },
  // Cottage
  { floor: { x: 50, y: 99, w: 48 }, hearth: { x: 50, y: 79, w: 22 },
    mount: { x: 50, y: 47, w: 14 }, cornerL: { x: 28, y: 79, w: 10 },
    cornerR: { x: 73, y: 79, w: 12 } },
  // Longhouse
  { floor: { x: 50, y: 95, w: 50 }, hearth: { x: 50, y: 70, w: 17 },
    mount: { x: 50, y: 48, w: 11 }, cornerL: { x: 32, y: 70, w:  8 },
    cornerR: { x: 69, y: 70, w: 10 } },
  // Great hall
  { floor: { x: 50, y: 97, w: 52 }, hearth: { x: 50, y: 70, w: 16 },
    mount: { x: 50, y: 47, w: 11 }, cornerL: { x: 32, y: 70, w:  8 },
    cornerR: { x: 70, y: 70, w: 10 } },
  // Estate
  { floor: { x: 50, y: 100, w: 43 }, hearth: { x: 50, y: 76, w: 15 },
    mount: { x: 50, y: 53, w: 10 }, cornerL: { x: 32, y: 77, w:  7 },
    cornerR: { x: 70, y: 77, w:  9 } },
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
    content: { x: 50, y: 45, w: 88 },
  },
  {
    id: 'menagerie', name: 'The menagerie', blurb: 'Every pet you have ever taken in.',
    needsHouse: 3, art: '/sea/room-menagerie.jpg',
    content: { x: 46, y: 79, w: 80 },
  },
  {
    id: 'trophy', name: 'The trophy room', blurb: 'The giants, and what they cost you.',
    needsHouse: 4, art: '/sea/room-trophy.jpg',
    content: { x: 50, y: 40, w: 88 },
  },
]

/**
 * ── WHERE EACH ANIMAL STANDS ────────────────────────────────────────────────
 *
 * The menagerie's pets were wandering, and it looked wrong: an animal gliding
 * across a floor at a constant speed with its feet not moving is a chess piece
 * being slid, not a creature walking. Sprites that have no walk cycle should not
 * be asked to walk. What they CAN do honestly is stand somewhere and turn round,
 * so that is all they do now.
 *
 * Which means every pet needs a place of its own, and a placed room beats a
 * generated one anyway: you can put the crabs down by the front, the parrots up
 * on the shelf side, and the plesiosaur where there is room for it. Placed on
 * /home/calibrate with the menagerie room selected.
 *
 * `x`, `y` is the pet's FEET and `w` is its width, both as a percent of the room
 * box — the same three numbers, in the same units, as every other thing placed
 * in a room. Nearer the bottom should mean bigger, because nearer the bottom
 * means nearer the camera; nothing enforces that, the eye does.
 *
 * ── AND `flip` IS A PLACEMENT, NOT A BEHAVIOUR ──────────────────────────────
 *
 * A pass had them turning round on a timer. It went the same way the wandering
 * did and for a related reason: a room where the animals turn to face nothing,
 * on no cue, is a room of things twitching. Every pet is painted facing right,
 * so which way one should face is a fact about WHERE IT STANDS — an animal on
 * the right of the room looking back into it, one by the door looking out — and
 * a fact about where something stands belongs in the table beside its position,
 * decided once by eye on the bench.
 *
 * So it is a flag, it never changes at runtime, and the room is completely
 * still. Absent means facing right, as drawn.
 *
 * A pet with no entry falls back to the middle of the floor, so adding a species
 * never puts a broken room in front of anybody. It does put two animals in the
 * same spot, which is what the bench is for.
 */
export type PetSpot = SlotSpot & { flip?: boolean }

export const MENAGERIE_SPOTS: Record<string, PetSpot> = {
  'parrot_red': { x: 12, y: 64, w: 7 },
  'parrot_blue': { x: 29, y: 64, w: 7 },
  'parrot_green': { x: 46, y: 64, w: 7 },
  'parrot_charcoal': { x: 63, y: 64, w: 7 },
  'parrot_sand': { x: 80, y: 64, w: 7 },
  'parrot_gold': { x: 19, y: 75, w: 8 },
  'monkey_brown': { x: 36, y: 75, w: 8 },
  'monkey_golden': { x: 53, y: 75, w: 8 },
  'seal_brown': { x: 70, y: 75, w: 8 },
  'seal_gray': { x: 87, y: 75, w: 8 },
  'seal_gold': { x: 12, y: 86, w: 9 },
  'lizard_green': { x: 29, y: 86, w: 9 },
  'lizard_indigo': { x: 46, y: 86, w: 9 },
  'lizard_white': { x: 63, y: 86, w: 9 },
  'raccoon_beige': { x: 80, y: 86, w: 9 },
  'raccoon_black': { x: 19, y: 97, w: 10 },
  'crab_orange': { x: 36, y: 97, w: 10 },
  'crab_blue': { x: 53, y: 97, w: 10 },
  'crab_gold': { x: 70, y: 97, w: 10 },
  'plesiosaur_baby': { x: 87, y: 97, w: 10 },
}

export const MENAGERIE_FALLBACK: PetSpot = { x: 50, y: 88, w: 9 }

export const ROOM_BY_ID: Record<RoomId, RoomDef> =
  Object.fromEntries(ROOMS.map(r => [r.id, r])) as Record<RoomId, RoomDef>

/** The rooms this house is big enough to have, in order. Always at least one. */
export function openRooms(h: Homestead): RoomDef[] {
  const tier = houseTier(h)
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
  /**
   * How far up the house ladder they have built, 0..4.
   *
   * WAS `spots: Record<HotspotId, number>`. A record of one key is a shape that
   * says a second key is coming, and the `homesteads` row still carries the
   * `garden` and `beacon` columns it used to fill. Those are dead now and are
   * deliberately not read: the columns stay because dropping columns is the one
   * migration that cannot be undone, and nothing costs anything to ignore them.
   */
  house: number
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
  house: 0,
  furniture: {},
  owned: [],
  pinned: [],
}

/** How many badges the gallery lets you hang large. */
export const PINNED_MAX = 6

/** Which rung the house is on. Clamped, so a row from a future version of this
 *  table cannot index off the end of a ladder that has since been cut. */
export const houseTier = (h: Homestead) =>
  Math.max(0, Math.min(HOUSE.length - 1, h.house ?? 0))

/** What stands on the island right now. */
export function builtAt(h: Homestead): Build {
  return HOUSE[houseTier(h)]
}

/** The next rung, or null once the Estate is up. */
export function nextBuild(h: Homestead): Build | null {
  const t = houseTier(h) + 1
  return t < HOUSE.length ? HOUSE[t] : null
}

/**
 * WHAT THE ISLAND LOOKS LIKE, in PlaceIsland's own `buildings` shape.
 *
 * ONE SPRITE. It used to be up to three, sorted back to front so a lighthouse
 * behind the house painted first — sorting that only ever mattered because the
 * pieces were drawn separately and had to be stacked into something resembling a
 * scene. A single painting has its own depth already.
 *
 * Still a `buildings` array rather than a new concept, because PlaceIsland and
 * the GPU baker both already know how to stand a sprite up out of the plane and
 * light it at night. A homestead is a town with one building in it.
 */
export function homeBuildings(h: Homestead): { art: string; x: number; y: number; scale: number }[] {
  const b = builtAt(h)
  return [{ art: b.art, x: b.x, y: b.y, scale: b.scale }]
}

/** Slots the house is currently big enough to hold, in order. */
export function openSlots(h: Homestead): FurnitureSlot[] {
  const n = HOUSE_SLOTS[Math.max(0, Math.min(HOUSE_SLOTS.length - 1, h.house ?? 0))]
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
 *   HOUSE   the ladder itself. Meant to be finished.
 *   FLEX    the best piece in each of the five furniture slots. Meant not to
 *           be, quickly.
 *   EVERY   also the pieces you passed over on the way up. Changes nothing
 *           visible at the end; completionism, not the goal.
 *
 * The plot and the lighthouse used to be FLEX and are now inside HOUSE, which
 * is a real change of character: what used to be optional and endless is now on
 * the one ladder everybody finishes. The furniture is what carries the flex
 * budget on its own, and it is deep enough to.
 */
const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0)

// THE HOUSE IS THE ISLAND now, and the portal is no longer part of this budget:
// it is bought on the water, out of lib/seaPortal's own ladder.
export const HOMESTEAD_HOUSE = sum(HOUSE.map(b => b.cost))

export const HOMESTEAD_FLEX =
  sum(FURNITURE.map(f => Math.max(...f.options.map(o => o.cost))))

export const HOMESTEAD_FINISHED = HOMESTEAD_HOUSE + HOMESTEAD_FLEX

export const HOMESTEAD_EVERY_PIECE =
  HOMESTEAD_HOUSE + sum(FURNITURE.map(f => sum(f.options.map(o => o.cost))))
