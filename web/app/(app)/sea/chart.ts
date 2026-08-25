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

/** DISTANCE IS PROGRESSION. The zones run outward from the Mainland in the order
 *  they unlock, so sailing further and fishing deeper mean the same thing. */
export const PLACES: Place[] = [
  {
    id: 'mainland', name: 'The Mainland', blurb: 'Tavern, market and shops',
    href: '/tavern', x: 0, y: 0, r: 250, art: '/page-tavern.jpg',
    kind: 'port', minLevel: 0,
  },
  {
    id: 'expeditions', name: 'The Harbour', blurb: 'Voyages and raids',
    href: '/expeditions', x: -700, y: -470, r: 190, art: '/raid-harbor-fleet.jpg',
    kind: 'port', minLevel: 0,
  },
  {
    id: 'shallows', name: 'The Shallows', blurb: 'Calm water, common fish',
    href: '/fishing?zone=shallows', x: 640, y: 430, r: 260, art: '/shallows.jpg',
    sea: ['#123038', '#2b5a5e', '#6f9a95'] as [string, string, string],
    kind: 'water', minLevel: 1,
  },
  {
    id: 'open_waters', name: 'Open Waters', blurb: 'Further out, better catches',
    href: '/fishing?zone=open_waters', x: 1420, y: 800, r: 280, art: '/openwaters.jpg',
    sea: ['#0e2836', '#234c60', '#5a8298'] as [string, string, string],
    kind: 'water', minLevel: 15,
  },
  {
    id: 'deep', name: 'The Deep', blurb: 'Long waits, real weight',
    href: '/fishing?zone=deep', x: 2180, y: 380, r: 300, art: '/deep.jpg',
    sea: ['#0a1d2c', '#173a52', '#3f6480'] as [string, string, string],
    kind: 'water', minLevel: 30,
  },
  {
    id: 'abyss', name: 'The Abyss', blurb: 'Where the dark begins',
    href: '/fishing?zone=abyss', x: 2760, y: 1180, r: 320, art: '/abyss.jpg',
    sea: ['#060f1a', '#0f2438', '#274257'] as [string, string, string],
    kind: 'water', minLevel: 50,
  },
  {
    id: 'ancient_deep', name: 'The Ancient Deep', blurb: 'Giants, and worse',
    href: '/fishing?zone=ancient_deep', x: 3520, y: 620, r: 340, art: '/ancient.jpg',
    sea: ['#07101a', '#16202f', '#31363f'] as [string, string, string],
    kind: 'water', minLevel: 75,
  },
]

/** The open sea, away from any named water. What everything blends back toward,
 *  and the only invented palette on the chart. */
export const OPEN_SEA: [string, string, string] = ['#0b1a24', '#1c3a48', '#4a6f7d']

/** Where the boat starts, and where it returns to. Just off the Mainland shore,
 *  so the first thing you ever see is home on your left and open water ahead. */
export const HOME = { x: 330, y: 120 }
