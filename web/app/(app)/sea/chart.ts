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
  /** How far the place reaches. For a port this is the shore you moor off; for
   *  a water it is the region itself. */
  r: number
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
  /**
   * WHAT BREAKS THE SURFACE OUT HERE.
   *
   * Waters had nothing in them but drift, so a five-thousand-pixel sail was
   * five thousand pixels of empty colour with a banner at the top telling you
   * the name of it. Landmarks give the crossing something to aim at, and they
   * say what kind of water this is faster than any label: buoys and rocks in
   * the Shallows, wrecks in the Deep, a dead rig in the Abyss, and something
   * carved and lit in the Ancient Deep.
   *
   * Unlike buildings these are placed in WORLD offsets from the zone centre and
   * sized in world pixels, because a zone is thousands of pixels across and a
   * percentage would make the same wreck twice the size in the Abyss as in the
   * Deep. The boat is 210 world pixels wide, for scale.
   */
  landmarks?: { art: string; x: number; y: number; size: number }[]
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
    href: '/tavern', x: 0, y: 0, r: 250, art: '/page-tavern.jpg',
    kind: 'port', minLevel: 0,
    // A little settlement rather than one hall: the Mainland IS the tavern, the
    // market and the shops, and it should look like all three from the water.
    // Ordered back to front so the ones lower on the island overlap correctly.
    buildings: [
      // Positions are the BOTTOM CENTRE of each building and the land is only
      // a 46% disc inside the island box, so these are tighter than they look:
      // the first pass put the tackle shop and the market up to 50px out into
      // open water. Checked by laying the island out and measuring each
      // building's base corners against the coastline.
      { art: '/sea/tackle.png', x: 31, y: 46, scale: 0.24 },
      { art: '/sea/market.png', x: 69, y: 49, scale: 0.25 },
      { art: '/sea/tavern.png', x: 50, y: 65, scale: 0.32 },
    ],
  },
  {
    id: 'expeditions', name: 'The Harbour', blurb: 'Voyages and raids',
    href: '/expeditions', x: -780, y: -380, r: 210, art: '/raid-harbor-fleet.jpg',
    kind: 'port', minLevel: 0,
    // The lighthouse sits high and back, which is what makes the Harbour
    // readable from a long way off — it is the tallest thing on the chart.
    buildings: [
      { art: '/sea/lighthouse.png', x: 62, y: 32, scale: 0.34 },
      { art: '/sea/harbour.png', x: 44, y: 58, scale: 0.40 },
    ],
  },
  {
    // Comes right up to the Mainland shore, so you step off the beach into it.
    id: 'shallows', name: 'The Shallows', blurb: 'Calm water, common fish',
    href: '/fishing?zone=shallows', x: 900, y: 300, r: 700, art: '/shallows.jpg',
    sea: ['#123038', '#2b5a5e', '#6f9a95'] as [string, string, string],
    landmarks: [
      { art: '/sea/buoy.png',  x: -260, y: -180, size: 130 },
      { art: '/sea/islet.png', x:  300, y:  120, size: 210 },
      { art: '/sea/buoy.png',  x:  110, y:  420, size: 120 },
    ],
    kind: 'water', minLevel: 1,
  },
  {
    id: 'open_waters', name: 'Open Waters', blurb: 'Further out, better catches',
    href: '/fishing?zone=open_waters', x: 2150, y: 620, r: 820, art: '/openwaters.jpg',
    sea: ['#0e2836', '#234c60', '#5a8298'] as [string, string, string],
    landmarks: [
      { art: '/sea/islet.png', x: -380, y:  260, size: 190 },
      { art: '/sea/buoy.png',  x:  340, y: -240, size: 130 },
      { art: '/sea/wreck.png', x:  120, y:  480, size: 280 },
    ],
    kind: 'water', minLevel: 15,
  },
  {
    id: 'deep', name: 'The Deep', blurb: 'Long waits, real weight',
    href: '/fishing?zone=deep', x: 3600, y: 340, r: 950, art: '/deep.jpg',
    sea: ['#0a1d2c', '#173a52', '#3f6480'] as [string, string, string],
    landmarks: [
      { art: '/sea/wreck.png', x: -420, y: -200, size: 330 },
      { art: '/sea/buoy.png',  x:  380, y:  300, size: 120 },
      { art: '/sea/rig.png',   x:  180, y: -520, size: 300 },
    ],
    kind: 'water', minLevel: 30,
  },
  {
    id: 'abyss', name: 'The Abyss', blurb: 'Where the dark begins',
    href: '/fishing?zone=abyss', x: 5300, y: 900, r: 1050, art: '/abyss.jpg',
    sea: ['#060f1a', '#0f2438', '#274257'] as [string, string, string],
    landmarks: [
      { art: '/sea/rig.png',   x: -300, y:  240, size: 350 },
      { art: '/sea/bones.png', x:  420, y: -260, size: 360 },
      { art: '/sea/wreck.png', x: -560, y: -480, size: 300 },
    ],
    kind: 'water', minLevel: 50,
  },
  {
    id: 'ancient_deep', name: 'The Ancient Deep', blurb: 'Giants, and worse',
    href: '/fishing?zone=ancient_deep', x: 7200, y: 400, r: 1150, art: '/ancient.jpg',
    sea: ['#07101a', '#16202f', '#31363f'] as [string, string, string],
    landmarks: [
      { art: '/sea/monolith.png', x: -240, y: -260, size: 320 },
      { art: '/sea/bones.png',    x:  400, y:  300, size: 400 },
      { art: '/sea/monolith.png', x:  560, y: -420, size: 280 },
    ],
    kind: 'water', minLevel: 75,
  },
]

/** The open sea, away from any named water. What everything blends back toward,
 *  and the only invented palette on the chart. */
export const OPEN_SEA: [string, string, string] = ['#0b1a24', '#1c3a48', '#4a6f7d']

/** Where the boat starts, and where it returns to. Just off the Mainland shore,
 *  so the first thing you ever see is home on your left and open water ahead.
 *  Deliberately just OUTSIDE the Shallows: sailing into your first zone should
 *  be something you did, not the state you woke up in. */
export const HOME = { x: 250, y: -60 }
