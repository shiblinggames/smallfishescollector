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
   * EACH BAND IS WIDER THAN THE ONE INSIDE IT, by about 29% — 2,400 pixels
   * across the Shallows and 6,600 across the Ancient Deep. Concentric rings
   * make that nearly free to reason about and it does two things at once: the
   * deep water is a longer haul to cross, which is what makes it feel deep, and
   * the outer rings have the circumference to hold more without crowding.
   *
   * Sized so the crossing is a voyage rather than a hop. It matters less than
   * it would have that the outermost is far out: the boat now starts where you
   * left it, so a long haul is paid once for a destination rather than once per
   * session, and the hull refit exists to shorten it.
   *
   * The north belongs to expeditions. The reef divides the two.
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
    // BIGGEST ON THE CHART, ON PURPOSE — but not by so much that it stops
    // being an island. It holds the tavern, the market and the tackle shop, and
    // it is the origin every fishing band is measured from.
    //
    // 430. It was 340, landed on when the desktop camera sat at zoom 1.0 and
    // 440 "filled the screen off the dock". The camera pulls back to 0.82 now,
    // which bought back more than the difference — so the island can be the
    // size it always wanted to be, and at 4.6x a single-purpose port it is
    // unmistakably the capital rather than the largest of four stops.
    //
    // The buildings did NOT grow with it. Their `scale` is a share of the
    // island box, so leaving them alone would have made them 26% bigger along
    // with everything else; they are scaled down by exactly that factor and
    // pushed further apart instead, which is what turns a cluster into a town.
    //
    // Everything scales off this one number: the island art, the buildings
    // (percentages of the island box), the shore the hull stops at
    // (r * SHORE + HULL) and the mooring ring (r + MOOR).
    href: '/tavern', x: 0, y: 0, r: 500, art: '/page-tavern.jpg',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/tackle.png', x: 31, y: 43, scale: 0.153 },
      { art: '/sea/market.png', x: 63, y: 47, scale: 0.172 },
      { art: '/sea/tavern.png', x: 50, y: 62, scale: 0.224 },
    ],
  },
  {
    /**
     * YOURS.
     *
     * East of the Mainland, in among the other ports rather than off on its own
     * somewhere: a home you have to make an expedition to visit is a home
     * nobody visits. Second biggest on the chart at 380, ahead of the
     * single-purpose ports and behind the Mainland's 430.
     *
     * IT WAS 260, AND SIX BUILDINGS DID NOT FIT ON IT. Half of them hung out
     * over the water. Note that growing the island ALONE fixes nothing: `scale`
     * and the x,y percentages are both shares of the island box, so the land
     * and the buildings grow together and the geometry is identical. The land
     * only gains on the buildings if the scales come down by the same factor —
     * 260/380, applied to every build on every spot, which leaves each building
     * the size it always was in world pixels and gives it more ground to stand
     * on. Spread went from 53-111px off centre to 115-204px.
     *
     * `buildings` is EMPTY here and filled in at render time from the captain's
     * own homestead row. It is the one island on this chart that is different
     * for everybody, which is the entire point of it.
     */
    id: 'home', name: 'The Homestead', blurb: 'Yours. Such as it is.',
    href: '/home', x: 1900, y: -250, r: 460, art: '/sea/home-cottage.png',
    kind: 'port', minLevel: 0,
    buildings: [],
  },
  {
    // THE TRAWL DOCKS. West of the Mainland and north of the coast, so it is
    // out of fishable water without being out of the way.
    //
    // It exists because sending a crew out used to be a menu you could open
    // from anywhere, which is a strange thing for a voyage to be. Now it is
    // somewhere you go. Collecting is still available wherever you are — see
    // the note on `canDeploy` in TrawlIndicator; making a player sail back for
    // a haul they have already earned would be a toll, not a decision.
    // WAS 'The Trawl Docks', and it no longer sends anybody anywhere: sending a
    // crew out happens at the fleet moored off the Mainland, which is a thing
    // you sail up to rather than a page you open. What is left here is the
    // day's work, counted and paid, which is what a tally house is for.
    id: 'trawl_docks', name: 'The Tally House', blurb: 'The day’s orders, and what they pay',
    href: '/trawl-docks', x: -1500, y: -850, r: 265, art: '/page-tavern.jpg',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/harbour.png', x: 48, y: 55, scale: 0.333 },
    ],
  },
  {
    // ── THE TRAWL HARBOUR ────────────────────────────────────────────────
    //
    // Where a crew is sent out and brought back in. It was three boats rafted
    // together on open water, which read as scenery you happened to be able to
    // use; an island reads as somewhere to go, and the chart already knows how
    // to draw a place, label it, moor you at it and say when something is
    // waiting there.
    //
    // POSITION IS TWO CONSTRAINTS AT ONCE, and they pull against each other.
    //
    // RINGS. Every port's go-ashore prompt reaches r + MOOR, so two islands
    // need r1 + r2 + 840 between their centres or both prompts come up and one
    // of them loses. Against the Tally House that is 1,315 minimum — there is
    // no radius at all that lets this sit closer.
    //
    // FINN. His haunts are derived by rejecting everything inside a keep-out,
    // and a new island adds one of 1,410. Dropped in the wrong water it eats
    // the Shallows' standing room and his consecutive haunts collapse onto each
    // other; scripts/check-finn caught exactly that at four of the positions
    // tried here, including the one that read best on the rings alone.
    //
    // Due west of the Tally House satisfies both: 1,500 from it with 185 of
    // ring clearance, 1,609 from the nearest isle, 3,118 from the origin so it
    // is still Shallows water, and check-finn green.
    //
    // `href` is never followed — the chart intercepts this island by id and
    // opens the trawl panel where you float. It is present because a Place has
    // one, and /sea is the honest answer to "where does this go".
    id: 'trawl_fleet', name: 'The Trawl Harbour', blurb: 'Send a crew, bring them in',
    // THE SHED IS THE BUILDING; THE BOATS ARE NOT. A harbour drawn as one
    // picture put its own jetty and its own boats up on the grass, which is
    // a dock going nowhere and hulls sitting in a field. The island already
    // draws a jetty running out from its shore — every place here does — so
    // what belongs ON the land is the shore end of the work: the shed, the
    // drying rack, the crates. The boats are moored off the beach as a
    // landmark, in the water, submerging like everything else that floats.
    href: '/sea', x: -3000, y: -850, r: 210, art: '/sea/trawl-shed.png',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/trawl-shed.png', x: 46, y: 52, scale: 0.34 },
    ],
  },
  {
    // On the way OUT rather than a detour, so you pass it heading for water.
    id: 'shipyard', name: 'The Shipyard', blurb: 'Loadout, rack and upgrades',
    href: '/shipyard', x: 900, y: -900, r: 265, art: '/sea/shipyard.png',
    kind: 'port', minLevel: 0,
    buildings: [
      { art: '/sea/shipyard.png', x: 50, y: 57, scale: 0.294 },
    ],
  },
  {
    id: 'shallows', name: 'The Shallows', blurb: 'Calm water, common fish',
    href: '/fishing?zone=shallows',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 2600, r: 1200,
    inner: 1400, outer: 3800,
    art: '/shallows.jpg',
    sea: ['#123038', '#2b5a5e', '#6f9a95'] as [string, string, string],
    kind: 'water', minLevel: 1,
  },
  {
    id: 'open_waters', name: 'Open Waters', blurb: 'Further out, better catches',
    href: '/fishing?zone=open_waters',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 5350, r: 1550,
    inner: 3800, outer: 6900,
    art: '/openwaters.jpg',
    sea: ['#0e2836', '#234c60', '#5a8298'] as [string, string, string],
    kind: 'water', minLevel: 15,
  },
  {
    id: 'deep', name: 'The Deep', blurb: 'Long waits, real weight',
    href: '/fishing?zone=deep',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 8900, r: 2000,
    inner: 6900, outer: 10900,
    art: '/deep.jpg',
    sea: ['#0a1d2c', '#173a52', '#3f6480'] as [string, string, string],
    kind: 'water', minLevel: 30,
  },
  {
    id: 'abyss', name: 'The Abyss', blurb: 'Where the dark begins',
    href: '/fishing?zone=abyss',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 13450, r: 2550,
    inner: 10900, outer: 16000,
    art: '/abyss.jpg',
    sea: ['#060f1a', '#0f2438', '#274257'] as [string, string, string],
    kind: 'water', minLevel: 50,
  },
  {
    id: 'ancient_deep', name: 'The Ancient Deep', blurb: 'Giants, and worse',
    href: '/fishing?zone=ancient_deep',
    // x/y is the band's midpoint straight south — used only as a
    // representative point for the compass. The band itself is inner..outer.
    x: 0, y: 19300, r: 3300,
    inner: 16000, outer: 22600,
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
  // ── THE BOATS AT THE TRAWL HARBOUR ───────────────────────────────────
  // Moored off the island's south beach, just beyond the jetty that every
  // place draws at 78% down its own box. In the water, so they submerge and
  // bob; on the land they were three hulls standing in a field.
  { art: '/sea/trawl-fleet.png', x: -3000, y: -560, size: 210, sway: 'bob' },
  { art: '/sea/buoy.png', x:   2472, y:   1249, size: 130, sway: 'bob' },
  { art: '/sea/islet.png', x:   1003, y:   2620, size: 210, solid: true },
  { art: '/sea/buoy.png', x:    397, y:   2082, size: 120, sway: 'bob' },
  { art: '/sea/islet.png', x:   -625, y:   1793, size: 190, solid: true },
  { art: '/sea/buoy.png', x:  -2466, y:   2056, size: 130, sway: 'bob' },
  { art: '/sea/islet.png', x:   4282, y:   1354, size: 190, solid: true },
  { art: '/sea/buoy.png', x:   4002, y:   3221, size: 130, sway: 'bob' },
  { art: '/sea/wreck.png', x:   1553, y:   4276, size: 280, solid: true, sway: 'rock' },
  { art: '/sea/buoy.png', x:  -2183, y:   5235, size: 120, sway: 'bob' },
  { art: '/sea/islet.png', x:  -3850, y:   3714, size: 200, solid: true },
  { art: '/sea/wreck.png', x:  -4955, y:   3446, size: 300, solid: true, sway: 'rock' },
  { art: '/sea/wreck.png', x:   6724, y:   3748, size: 330, solid: true, sway: 'rock' },
  { art: '/sea/buoy.png', x:   5913, y:   7457, size: 120, sway: 'bob' },
  { art: '/sea/rig.png', x:   2884, y:   7715, size: 300, solid: true },
  { art: '/sea/wreck.png', x:  -1816, y:   9425, size: 300, solid: true, sway: 'rock' },
  { art: '/sea/buoy.png', x:  -3984, y:   7299, size: 130, sway: 'bob' },
  { art: '/sea/rig.png', x:  -7216, y:   7113, size: 320, solid: true },
  { art: '/sea/wreck.png', x:  -7509, y:   3960, size: 290, solid: true, sway: 'rock' },
  { art: '/sea/rig.png', x:  12336, y:   5038, size: 350, solid: true },
  { art: '/sea/bones.png', x:   9759, y:  10682, size: 360, solid: true },
  { art: '/sea/wreck.png', x:   4725, y:  12320, size: 300, solid: true, sway: 'rock' },
  { art: '/sea/rig.png', x:   1010, y:  12521, size: 320, solid: true },
  { art: '/sea/bones.png', x:  -3642, y:  12420, size: 340, solid: true },
  { art: '/sea/wreck.png', x:  -7585, y:   9424, size: 310, solid: true, sway: 'rock' },
  { art: '/sea/rig.png', x:  -9967, y:   9418, size: 330, solid: true },
  { art: '/sea/bones.png', x: -11330, y:   3934, size: 350, solid: true },
  { art: '/sea/monolith.png', x:  19543, y:   4937, size: 320, solid: true },
  { art: '/sea/bones.png', x:  14517, y:  10809, size: 400, solid: true },
  { art: '/sea/monolith.png', x:   9890, y:  16479, size: 280, solid: true },
  { art: '/sea/bones.png', x:   9004, y:  18786, size: 360, solid: true },
  { art: '/sea/monolith.png', x:    164, y:  18391, size: 300, solid: true },
  { art: '/sea/bones.png', x:  -7802, y:  19179, size: 380, solid: true },
  { art: '/sea/monolith.png', x:  -9475, y:  17115, size: 340, solid: true },
  { art: '/sea/bones.png', x: -15852, y:  10811, size: 370, solid: true },
  { art: '/sea/monolith.png', x: -17571, y:   8736, size: 310, solid: true },
]

/**
 * YOON, who is not generated.
 *
 * Everyone else on this sea comes out of a hash — a name, a boat and an offer
 * derived from a cell and a day, which is the right way to fill an ocean and
 * exactly the wrong way to make one person matter. Yoon is written down.
 *
 * He is moored in the Ancient Deep because that is the water his rod is for:
 * tier 20 asks Fishing 75, and so does the band he sits in. Finding him is the
 * whole errand — the chart is 22,600 pixels deep and he is one boat at the far
 * end of it.
 *
 * PERMANENT, like the zone buyers and unlike the wanderers. A one-of-a-kind rod
 * behind a trader who might not be there today is not a destination, it is a
 * slot machine.
 */
export const YOON = {
  key: 'yoon',
  name: 'Yoon',
  /** Far out in the Ancient Deep, off the eastern arc — away from the buyer
   *  and away from the band's landmarks. Asserted, not eyeballed. */
  x: 13820, y: 9880,
  zoneId: 'ancient_deep',
  /** The rod he carries, and what he wants for it. Both re-derived server-side
   *  from the rod table; the number here is only for the panel. */
  rodTier: 20,
  line: "You've the streak for it, or you haven't. Rod won't teach you that. It just stops wasting it.",
} as const

/** The zone buyers, one per band, in absolute world coordinates. */
export const RESIDENTS: {
  zoneId: string; name: string; line: string; x: number; y: number; rate: number
}[] = [
  { zoneId: 'shallows', name: 'Meg Corrin',
    line: "Bring it here and I'll weigh it here. Ashore they'll give you more, and a long haul home to collect it.",
    x: 1416, y: 2181, rate: 0.78 },
  { zoneId: 'open_waters', name: 'Bent Pell',
    line: "Fish don't keep and neither does my patience. Coin now, or row it home yourself.",
    x: 559, y: 5321, rate: 0.8 },
  { zoneId: 'deep', name: 'Old Marlow',
    line: "Long way back to the dock from here. I've made a living out of exactly that.",
    x: -1545, y: 8765, rate: 0.82 },
  { zoneId: 'abyss', name: 'Quiet Fitch',
    line: "Not many bring me anything this deep. I pay for that, not for the fish.",
    x: -5896, y: 12089, rate: 0.84 },
  { zoneId: 'ancient_deep', name: 'Grey Nance',
    line: "You went down there and came back up. Whatever's in your hold, I'll take it and ask nothing.",
    x: -14343, y: 12914, rate: 0.86 },
]

/**
 * THE NORTHERN EDGE OF THE FISHING GROUNDS.
 *
 * Expeditions to the north, fishing to the south. That used to be a statement
 * about layout with nothing enforcing it, so you could sail north forever into
 * blank water belonging to a system this screen does not implement — an empty
 * grey nothing with no zones, no traders and no reason to be there, which reads
 * as a bug rather than as a border.
 *
 * Now it is a reef. The hull stops at this latitude and no fishing NPC spawns
 * beyond it, except in the one gap — see GATE_X.
 *
 * There used to be a Harbour island moored on this line whose only job was to
 * be the thing labelled "expeditions". Nobody sailed to it, because the way to
 * expeditions was never the island: it was the gap. The island is gone and the
 * gap carries the sign.
 */
/**
 * THE EDGE OF THE CHART, as a radius from the Mainland.
 *
 * The north is walled by rock because that edge is a SHORE — shallow enough for
 * a reef, and with the way through to expeditions in it. Everywhere else the
 * boundary is not a physical thing and should not pretend to be one: a reef in
 * the middle of the deepest water would be geology nobody can explain. This is
 * simply where the surveyed chart stops, which is the honest reason a boat with
 * no map turns back.
 *
 * It is the outer radius of the outermost band, so the last water you can reach
 * is the last water anyone drew. One radius covers south, east and west at once,
 * because the bands are concentric: past the Ancient Deep in ANY direction is
 * past the Ancient Deep.
 */
export const OUTER_EDGE = 22600

export const NORTH_WALL = -1500

/**
 * THE GATE.
 *
 * The wall is a reef, and there is exactly one gap in it. Sailing through the
 * gap is how you leave the fishing grounds for expeditions — there is no port
 * to dock at and no button to press, only a hole in the rock and a sign over it.
 *
 * It was not always this. There were cliffs here, then cliffs again in the
 * islands' own palette, then a natural arch with a Harbour island moored at its
 * foot. All of that is gone: the rock is rock the chart already draws
 * everywhere else, and the island existed only to be the thing the label was
 * attached to, which the gap can do by itself.
 */
export const GATE_X = -900
/** Half the arch's opening, in world pixels. Wide enough to sail into without
 *  lining up, narrow enough to read as a gap in something rather than a missing
 *  section of it. The boat is 210 across. */
export const GATE_HALF = 430

/** Is this point in the arch's mouth? */
export function inGate(x: number): boolean {
  return Math.abs(x - GATE_X) < GATE_HALF
}

/** How far north the arch lets you go before the confirm stops you. A short
 *  throat, so you are plainly INSIDE the arch when it asks. */
export const GATE_DEPTH = 300

/** The open sea, away from any named water. What everything blends back toward,
 *  and the only invented palette on the chart. */
export const OPEN_SEA: [string, string, string] = ['#0b1a24', '#1c3a48', '#4a6f7d']

/** Where the boat starts: in the harbour approach, close enough to the Mainland
 *  to go ashore from a standing start, and a short sail short of the Shallows.
 *  So the first thing you ever see is home on your left and open water ahead. */
export const HOME = { x: 260, y: 560 }
