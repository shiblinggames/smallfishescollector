// THE CHART — every place on the ocean hub, in world pixels.
//
// The ocean is the hub. Not a menu with a picture behind it: a place you are on,
// with your boat on it, and everywhere else is somewhere you sail to. The tavern
// is one stop among several rather than the front door.
//
// Two kinds of thing, and they are not the same kind:
//
//   PORTS are land you pull alongside. The Mainland carries the tavern, the
//   market and the shops as ONE place, because you do not sail between the
//   tavern and the shop. Expeditions is its own port, well clear of it.
//
//   WATERS are regions you sail INTO. A fishing zone is not a dot you tap, it is
//   a stretch of sea with a boundary. That is what lets a level gate be
//   something you SEE — the water is right there and you cannot work it yet —
//   rather than a line of text telling you no.
//
// ART IS REUSED, NOT COMMISSIONED. Every plate here is already in /public and
// already hand-painted, which is the whole reason this direction beats building
// a renderer: the house style arrives for free instead of being approximated.
// Swap `art` for a purpose-painted plate whenever one exists.

export type Place = {
  id: string
  name: string
  /** What it is under the name. Short — this sits on a chart, not a page. */
  blurb: string
  /** Where the route goes when you enter. */
  href: string
  /** World-pixel centre. */
  x: number
  y: number
  /** How far the place reaches. For a PORT this is the shore you moor off.
   *  Waters use it only as a nominal half-width — see `inner`/`outer`. */
  r: number
  /**
   * A WATER IS A BAND, NOT A DISC.
   *
   * The fishing grounds are concentric semicircles fanning SOUTH from the
   * Mainland: the Shallows are the ring closest to shore and every ring beyond
   * is deeper water. `inner` and `outer` are radii measured from the origin,
   * which is the Mainland, and a band exists only where y > 0.
   *
   * This replaced five discs scattered across the chart. With discs, "deeper"
   * was a direction you had to learn; with rings it is simply how far out you
   * have sailed, from anywhere along the coast. It also makes the whole south
   * fishable rather than only the corridor the discs happened to lie along.
   *
   * The north belongs to expeditions. The Harbour divides the two.
   */
  inner?: number
  outer?: number
  /** Painted plate. Ports use it as the island's surface. Waters do not use it
   *  at all any more — see `sea`. */
  art: string
  /**
   * WHAT IS BUILT ON IT.
   *
   * A port used to be a coastline with a page screenshot cropped inside it,
   * which is why the Mainland read as a brown smear: the plate was a photo of
   * the tavern's INTERIOR, seen from above, at island scale. A place you go
   * ashore at should look like somewhere people live.
   *
   * So ports carry buildings, painted in the same idiom as the Crew Hall's, and
   * they STAND UP off the plane rather than lying on it. Coordinates are
   * percentages of the island box so a building keeps its spot whatever radius
   * the port is given, and `scale` is a fraction of the island's diameter.
   */
  buildings?: { art: string; x: number; y: number; scale: number }[]
  /** Landmarks and resident buyers used to live per-place. They are module
   *  level lists now (LANDMARKS, RESIDENTS) in absolute world coordinates,
   *  because a band is a ring and a ring has no box for an offset to be
   *  relative to. */
  /**
   * WHAT THIS WATER LOOKS LIKE.
   *
   * A water does not get a shape, it gets a COLOUR, and the sea blends toward
   * it as you approach. Drawing regions as discs gave every zone a visible
   * circular edge you crossed like a doorway, which is the opposite of sailing
   * from one stretch of sea into another. Now the Shallows are pale green-blue,
   * the Abyss is near-black, and somewhere between them is genuinely between
   * them.
   *
   * Three stops, deep to pale, matching how the game's own water art is built.
   */
  sea?: [string, string, string]
  /** Ports are land, waters are sea. Drives how it draws and what the prompt
   *  says: you dock at a port, you fish a water. */
  kind: 'port' | 'water'
  /** Fishing level needed. 0 for always open. Mirrors ZONE_MIN_LEVEL. */
  minLevel: number
}

/** DISTANCE IS PROGRESSION, and the fishing grounds are ONE SEA.
 *
 *  The zones used to be five smallish discs scattered across the chart, which
 *  made the ocean read as a menu with the items spread out. They are one
 *  continuous fishing region now: a shelf running out from the Mainland that
 *  gets deeper the further you go, each zone overlapping its neighbours so the
 *  colour blend has room to actually blend and there is no gap of nothing in
 *  between.
 *
 *  And they are BIG. The Shallows alone are wider than the whole old chain was
 *  tall. A zone you can cross in two seconds is a dot; a zone you sail across
 *  is a place, and it is the thing that makes "go out deeper" mean something
 *  you do rather than something you read.
 *
 *  The Abyss and the Ancient Deep sit right out at the edge — roughly eleven
 *  and fifteen seconds of open water from home at full sail. That is a voyage,
 *  which is the point: the dark should be somewhere you go, not somewhere you
 *  drift into.
 */
export const PLACES: Place[] = [
  {
    id: 'mainland', name: 'The Mainland', blurb: 'Tavern, market and shops',
    // BIGGEST ON THE CHART, ON PURPOSE. It holds the tavern, the market and
    // the tackle shop, and it is the origin every fishing band is measured
    // from. At 250 it was the same size as the two single-purpose ports and
    // read as one stop of three; at 440 it is four and a half times their area
    // and reads as the place the rest of the chart is arranged around.
    //
    // Everything scales off this one number: the island art, the buildings
    // (percentages of the island box), the shore the hull stops at
    // (r * SHORE + HULL) and the mooring ring (r + MOOR).
    href: '/tavern', x: 0, y: 0, r: 440, art: '/page-tavern.jpg',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/tackle.png', x: 31, y: 46, scale: 0.24 },
      { art: '/sea/market.png', x: 69, y: 49, scale: 0.25 },
      { art: '/sea/tavern.png', x: 50, y: 65, scale: 0.32 },
    ],
  },
  {
    // THE HARBOUR DIVIDES THE MAP. North of it is expeditions; everything south
    // of the Mainland is fishing. It sits well north so it is unmistakably on
    // the other side of the line from the fishing grounds.
    id: 'expeditions', name: 'The Harbour', blurb: 'Voyages and raids',
    href: '/expeditions', x: -900, y: -1500, r: 210, art: '/raid-harbor-fleet.jpg',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/lighthouse.png', x: 62, y: 32, scale: 0.34 },
      { art: '/sea/harbour.png', x: 44, y: 58, scale: 0.40 },
    ],
  },
  {
    // On the way OUT rather than a detour, so you pass it heading for water.
    id: 'shipyard', name: 'The Shipyard', blurb: 'Loadout, rack and upgrades',
    href: '/shipyard', x: 900, y: -900, r: 200, art: '/sea/shipyard.png',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/shipyard.png', x: 50, y: 62, scale: 0.40 },
    ],
  },
  {
    id: 'shallows', name: 'The Shallows', blurb: 'Calm water, common fish',
    href: '/fishing?zone=shallows',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 2400, r: 1000,
    inner: 1400, outer: 3400,
    art: '/shallows.jpg',
    sea: ['#123038', '#2b5a5e', '#6f9a95'] as [string, string, string],
    kind: 'water', minLevel: 1,
  },
  {
    id: 'open_waters', name: 'Open Waters', blurb: 'Further out, better catches',
    href: '/fishing?zone=open_waters',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 4600, r: 1200,
    inner: 3400, outer: 5800,
    art: '/openwaters.jpg',
    sea: ['#0e2836', '#234c60', '#5a8298'] as [string, string, string],
    kind: 'water', minLevel: 15,
  },
  {
    id: 'deep', name: 'The Deep', blurb: 'Long waits, real weight',
    href: '/fishing?zone=deep',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 7100, r: 1300,
    inner: 5800, outer: 8400,
    art: '/deep.jpg',
    sea: ['#0a1d2c', '#173a52', '#3f6480'] as [string, string, string],
    kind: 'water', minLevel: 30,
  },
  {
    id: 'abyss', name: 'The Abyss', blurb: 'Where the dark begins',
    href: '/fishing?zone=abyss',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 9800, r: 1400,
    inner: 8400, outer: 11200,
    art: '/abyss.jpg',
    sea: ['#060f1a', '#0f2438', '#274257'] as [string, string, string],
    kind: 'water', minLevel: 50,
  },
  {
    id: 'ancient_deep', name: 'The Ancient Deep', blurb: 'Giants, and worse',
    href: '/fishing?zone=ancient_deep',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 12800, r: 1600,
    inner: 11200, outer: 14400,
    art: '/ancient.jpg',
    sea: ['#07101a', '#16202f', '#31363f'] as [string, string, string],
    kind: 'water', minLevel: 75,
  },
]

/**
 * WHAT BREAKS THE SURFACE, in absolute world coordinates.
 *
 * Moved out of the zone definitions when the waters became bands: a band has no
 * box for an offset to be relative to, and one flat list is simpler to place, to
 * verify and to render than five nested ones.
 */
export const LANDMARKS: {
  art: string; x: number; y: number; size: number
  solid?: boolean; sway?: 'bob' | 'rock'
}[] = [
  { art: '/sea/buoy.png', x:   2498, y:    631, size: 130, sway: 'bob' },
  { art: '/sea/islet.png', x:   1440, y:   1652, size: 210, solid: true },
  { art: '/sea/buoy.png', x:     73, y:   1856, size: 120, sway: 'bob' },
  { art: '/sea/islet.png', x:  -1352, y:   1309, size: 190, solid: true },
  { art: '/sea/buoy.png', x:  -2516, y:   1596, size: 130, sway: 'bob' },
  { art: '/sea/islet.png', x:   4764, y:   1534, size: 190, solid: true },
  { art: '/sea/buoy.png', x:   3135, y:   2829, size: 130, sway: 'bob' },
  { art: '/sea/wreck.png', x:     74, y:   4824, size: 280, solid: true, sway: 'rock' },
  { art: '/sea/buoy.png', x:  -1942, y:   4073, size: 120, sway: 'bob' },
  { art: '/sea/islet.png', x:  -2710, y:   3353, size: 200, solid: true },
  { art: '/sea/wreck.png', x:  -3918, y:   1888, size: 300, solid: true, sway: 'rock' },
  { art: '/sea/wreck.png', x:   6823, y:   3865, size: 330, solid: true, sway: 'rock' },
  { art: '/sea/buoy.png', x:   3438, y:   6354, size: 120, sway: 'bob' },
  { art: '/sea/rig.png', x:    625, y:   6273, size: 300, solid: true },
  { art: '/sea/wreck.png', x:  -2960, y:   6562, size: 300, solid: true, sway: 'rock' },
  { art: '/sea/buoy.png', x:  -4181, y:   6440, size: 130, sway: 'bob' },
  { art: '/sea/rig.png', x:  -6956, y:   2281, size: 320, solid: true },
  { art: '/sea/rig.png', x:   9492, y:   3708, size: 350, solid: true },
  { art: '/sea/bones.png', x:   6523, y:   6993, size: 360, solid: true },
  { art: '/sea/wreck.png', x:   2266, y:   8971, size: 300, solid: true, sway: 'rock' },
  { art: '/sea/rig.png', x:  -2321, y:   9440, size: 320, solid: true },
  { art: '/sea/bones.png', x:  -7481, y:   6930, size: 340, solid: true },
  { art: '/sea/wreck.png', x:  -9779, y:   2197, size: 310, solid: true, sway: 'rock' },
  { art: '/sea/monolith.png', x:  12242, y:   5129, size: 320, solid: true },
  { art: '/sea/bones.png', x:   9170, y:   9966, size: 400, solid: true },
  { art: '/sea/monolith.png', x:   4010, y:  11935, size: 280, solid: true },
  { art: '/sea/bones.png', x:  -3385, y:  12507, size: 360, solid: true },
  { art: '/sea/monolith.png', x:  -9617, y:   8242, size: 300, solid: true },
  { art: '/sea/bones.png', x: -12171, y:   3707, size: 380, solid: true },
]

/** The zone buyers, one per band, in absolute world coordinates. */
export const RESIDENTS: {
  zoneId: string; name: string; line: string; x: number; y: number; rate: number
}[] = [
  { zoneId: 'shallows', name: 'Meg Corrin',
    line: "Bring it here and I'll weigh it here. Ashore they'll give you more, and a week to wait for it.",
    x: 1127, y: 2119, rate: 0.78 },
  { zoneId: 'open_waters', name: 'Bent Pell',
    line: "Fish don't keep and neither does my patience. Coin now, or row it home yourself.",
    x: 640, y: 4555, rate: 0.8 },
  { zoneId: 'deep', name: 'Old Marlow',
    line: "Long way back to the dock from here. I've made a living out of exactly that.",
    x: -1233, y: 6992, rate: 0.82 },
  { zoneId: 'abyss', name: 'Quiet Fitch',
    line: "Not many bring me anything this deep. I pay for that, not for the fish.",
    x: -4296, y: 8808, rate: 0.84 },
  { zoneId: 'ancient_deep', name: 'Grey Nance',
    line: "You went down there and came back up. Whatever's in your hold, I'll take it and ask nothing.",
    x: -9208, y: 8892, rate: 0.86 },
]

/**
 * THE LATITUDE OF THE HARBOUR, and the edge of the world.
 *
 * The Harbour divides the chart: expeditions to the north, fishing to the
 * south. That was a statement about layout and nothing enforced it, so you
 * could sail north forever into blank water that belongs to a system this
 * screen does not implement — an empty grey nothing with no zones, no traders
 * and no reason to be there, which reads as a bug rather than as a border.
 *
 * Now it is a wall. The hull stops here and no fishing NPC spawns beyond it.
 * You can still moor at the Harbour: it sits ON the line, and its approach ring
 * opens to the south.
 */
export const NORTH_WALL = -1500

/** The open sea, away from any named water. What everything blends back toward,
 *  and the only invented palette on the chart. */
export const OPEN_SEA: [string, string, string] = ['#0b1a24', '#1c3a48', '#4a6f7d']

/** Where the boat starts: in the harbour approach, close enough to the Mainland
 *  to go ashore from a standing start, and a short sail short of the Shallows.
 *  So the first thing you ever see is home on your left and open water ahead. */
export const HOME = { x: 260, y: 560 }
