// ── SQUALLS ─────────────────────────────────────────────────────────────────
//
// Weather you SAIL INTO, not weather that happens to you.
//
// That distinction is the whole design and it is the house rule made concrete.
// A storm that arrives on a timer is an event you either caught or missed, and
// this game does not do that to people: nothing here decays, nothing is lost by
// being away, and a captain who logs in on Tuesday has missed nothing that
// happened on Monday. A squall that is a PLACE has none of that problem. It is
// somewhere on the chart, it is moving, and it is yours to steer into or around
// exactly like a hotspot or an island.
//
// ── DERIVED, NEVER STORED ───────────────────────────────────────────────────
//
// Same trick as the traders, the bottles and the hotspots: a hash of (window,
// slot) decides everything, so the client draws them and anything server-side
// re-derives the identical set. No table, no cron, no rows to clean up, and a
// player who reloads finds the same weather in the same place with the same
// time left on it.
//
// ── AND THE WINDOW IS ITS OWN NUMBER ────────────────────────────────────────
//
// Fourteen minutes, which is deliberately not the hotspots' ten and not the
// bottles' eleven. Two systems refreshing on the same beat make the whole sea
// blink at once, and the chart should never feel like it ticks.
//
// ── WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────
//
// It changes the WEATHER and nothing else: darker water, rain, a heavier sea,
// a harder heel on the hull. It does not touch a payout, a bite rate, a rarity
// roll or a crate chance.
//
// That is a decision rather than an omission. The hotspots already own "this
// patch of water pays differently", they are sized against a server that takes
// the player's position on trust, and bolting a second multiplier onto weather
// would both double that exposure and make a squall something you have to
// chase. Somewhere worth sailing into for how it LOOKS is a fair thing for a
// sea to have. If weather ever should pay, that is its own decision with its
// own numbers, and it belongs next to hotspotEffect where the rest of that
// argument already lives.

import { OUTER_EDGE, EXP_ORIGIN, EXP_EDGE, RAID_EDGE } from '@/app/(app)/sea/chart'

/** How long a set of squalls stands before the weather turns. */
export const SQUALL_WINDOW_MS = 14 * 60_000

/** How many are on the whole chart at once. Two: one is a curiosity you may
 *  never meet on a 45,000 pixel sea, and four turns an ocean into a weather
 *  map. */
export const SQUALL_COUNT = 2

export type Squall = {
  /** Stable for as long as this one stands. */
  key: string
  /** Where it started this window. It has moved since — see `squallPos`. */
  x: number
  y: number
  /** World-pixel radius. Big enough that being inside one is a stretch of
   *  sailing rather than a spot you cross in a second. */
  r: number
  /** How hard it is blowing. 0.55 to 1 for a squall; a TEMPEST goes past 1,
   *  which is what makes the expedition side worse weather than the fishing
   *  side rather than the same weather in a different place. Drives the rain,
   *  the dark and the heel, so one number is the whole severity of it. */
  power: number
  /**
   * A TEMPEST: the big weather, out past the sea gate.
   *
   * Only these get lightning. It is a flag rather than a power threshold
   * because "is this the kind of storm that has lightning in it" is a fact
   * about the storm, and reading it off a number means the day somebody tunes
   * `power` they silently change the weather's behaviour too.
   */
  big?: boolean
  /** World px per second it travels, as a vector. Weather moves. */
  vx: number
  vy: number
  /** Epoch ms when this set is replaced. */
  endsAt: number
}

function hash(a: number, b: number): number {
  let h = (a * 0x27d4eb2d) ^ (b * 0x165667b1) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}
const unit = (h: number) => (h % 100000) / 100000

/**
 * Which window we are in.
 *
 * ── `now` IS EPOCH MILLISECONDS ─────────────────────────────────────────────
 *
 * The guard is not decoration and it is not theoretical. The chart's frame loop
 * is `step(now)` off requestAnimationFrame, where `now` is milliseconds since
 * the PAGE LOADED, and handing that to a window function is exactly how every
 * bottle in the game came to answer "the tide took it" for a whole release.
 * Both numbers are plausible milliseconds, so nothing catches it downstream.
 * Epoch has been past 1e12 since 2001 and no page has been open for thirty
 * years, which is the one thing that tells them apart.
 */
export function squallWindow(now: number = Date.now()): number {
  if (process.env.NODE_ENV !== 'production' && now < 1e12) {
    throw new Error(
      `squallWindow needs epoch ms, got ${now}. This is almost certainly a `
      + 'requestAnimationFrame timestamp, which is milliseconds since page load.')
  }
  return Math.floor(now / SQUALL_WINDOW_MS)
}

/**
 * The squalls standing this window.
 *
 * SOUTH OF THE COAST ONLY. The anchorage is an enclosed harbour behind a reef
 * and the approaches are where everybody moors; rain over either is weather in
 * a car park. This is for the open sea, which is also the only part of the
 * chart big enough for a storm to be somewhere you go.
 */
export function squallsAt(now: number = Date.now()): Squall[] {
  return [...fishingSqualls(now), ...tempestsAt(now)]
}

function fishingSqualls(now: number): Squall[] {
  const win = squallWindow(now)
  const out: Squall[] = []
  for (let i = 0; i < SQUALL_COUNT; i++) {
    const h = hash(win, i * 0x9e37 + 0x51ed)
    // NOT EVERY WINDOW HAS EVERY SLOT. Weather that is always there is
    // climate, and a sea that is permanently half stormy has no weather at
    // all — it just looks like that.
    if (unit(h) > 0.62) continue
    const h2 = hash(h, 0x2f1b)
    const h3 = hash(h2, 0x77a3)
    const h4 = hash(h3, 0x1b9d)
    const h5 = hash(h4, 0x5c31)

    // Somewhere in the fishable half-disc, biased outward: the deep water is
    // where weather belongs and the shallows are where people learn.
    const ang = unit(h2) * Math.PI                    // south half only
    const rad = (0.32 + unit(h3) * 0.62) * OUTER_EDGE
    const x = Math.cos(ang) * rad
    const y = Math.abs(Math.sin(ang)) * rad
    if (y < 900) continue

    const power = 0.55 + unit(h4) * 0.45
    // ── SLOW, AND SLOWER THAN IT LOOKS ────────────────────────────────
    //
    // This was 8 to 22 px/s, which over a fourteen minute window is six to
    // eighteen THOUSAND pixels of travel: a squall would cross most of a
    // 45,000px chart, sail north over the harbour and out past the surveyed
    // edge inside one window. Caught by the placement sweep rather than on
    // screen, which is the only reason it is not a bug report about rain over
    // the Mainland.
    //
    // 1.5 to 4.5 carries it 1,200 to 3,800 in a window: comfortably more than
    // its own radius, so it is genuinely somewhere else next time you look,
    // and nowhere near enough to sweep the sea or to chase anybody.
    const speed = 1.5 + unit(h5) * 3
    const dir = unit(hash(h5, 0x33af)) * Math.PI * 2
    out.push({
      key: `${win}:${i}`,
      x, y,
      r: 2200 + unit(hash(h5, 0x77c1)) * 1900,
      power,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      endsAt: (win + 1) * SQUALL_WINDOW_MS,
    })
  }
  return out
}

/**
 * ── AND THE BIG WEATHER, NORTH OF THE SEA_GATE ────────────────────────────────
 *
 * The expedition side is where you take a warship out to fight somebody, and
 * it should not have the same weather as the water people learn to fish in. A
 * tempest is nearly twice the radius of a squall, blows past full power, moves
 * more slowly because a thing that size does not dart about, and is the only
 * weather on this chart with lightning in it.
 *
 * Derived exactly as the squalls are — a hash of (window, slot), no rows, no
 * cron, same set for everybody, and it re-derives identically on a server that
 * ever needs to know. It shares their window on purpose: they are one system
 * and one weather, and the whole sea turning at once is only a problem when
 * two DIFFERENT systems do it.
 *
 * IT PAYS NOTHING, exactly as a squall pays nothing. See the note at the top:
 * weather is somewhere to sail, not a multiplier to chase. That rule matters
 * more out here, not less, because the expedition side already has bosses with
 * loot tables and a captain should never feel they have to wait for a storm.
 */
export const TEMPEST_COUNT = 2

function tempestsAt(now: number): Squall[] {
  const win = squallWindow(now)
  const out: Squall[] = []
  for (let i = 0; i < TEMPEST_COUNT; i++) {
    const h = hash(win, i * 0x7f4a + 0x2c9e)
    // Rarer than a squall. Big weather that is always there is just a climate,
    // and the point of it is the crossing where you see it coming.
    if (unit(h) > 0.5) continue
    const h2 = hash(h, 0x51b7)
    const h3 = hash(h2, 0x1d3f)
    const h4 = hash(h3, 0x6ab1)
    const h5 = hash(h4, 0x3e07)

    // Anywhere in the raid water, which is a disc round the harbour's origin.
    // Kept off the anchorage: that is an enclosed harbour full of moorings and
    // rain over it is weather in a car park, the same reason the squalls stay
    // south of the coast.
    // NORTH HALF BY CONSTRUCTION. The disc reaches south past the reef into
    // the fishing sea, and a tempest there would be the big weather in the
    // wrong ocean — but rejecting those threw away half of every window's
    // roll, so two slots at even odds were really producing one storm every
    // other window. Sines below the axis are the northern half.
    const ang = Math.PI + unit(h2) * Math.PI
    const rad = EXP_EDGE + 1800 + unit(h3) * (RAID_EDGE - EXP_EDGE - 4200)
    const x = EXP_ORIGIN.x + Math.cos(ang) * rad
    const y = EXP_ORIGIN.y + Math.sin(ang) * rad

    // PAST FULL. A squall tops out at 1; this starts near there and goes half
    // again beyond it, and every consumer scales off the same number.
    const power = 0.95 + unit(h4) * 0.55
    // Slower than a squall, and it has further to go. Something eight thousand
    // pixels across does not scud.
    const speed = 1.2 + unit(h5) * 2
    const dir = unit(hash(h5, 0x44bd)) * Math.PI * 2
    out.push({
      key: `T${win}:${i}`,
      x, y,
      // Four to seven thousand across the middle, against a squall's two to
      // four. Sailing through one is a passage, not a patch of rain.
      r: 4200 + unit(hash(h5, 0x18f3)) * 2800,
      power,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      endsAt: (win + 1) * SQUALL_WINDOW_MS,
      big: true,
    })
  }
  return out
}

/**
 * Where a squall actually is at this instant. It has been drifting since the
 * window opened, so its position is a function of how far through we are.
 *
 * ── AND IT IS PENNED IN ─────────────────────────────────────────────────────
 *
 * The spawn is checked against the coast and the chart's edge; the DRIFT was
 * not, so a squall placed correctly could still walk off the surveyed sea or
 * north into the harbour approaches before its window was out. Slowing it fixed
 * most of that and a clamp fixes the rest, which is the right way round: the
 * speed is what makes it behave and this is what makes it impossible.
 *
 * A cloud stopped against an invisible line is not something anyone can see —
 * it has no edge of its own to check the wall against, and it is drifting at
 * three pixels a second.
 */
export function squallPos(s: Squall, now: number = Date.now()): { x: number; y: number } {
  const into = (now - (s.endsAt - SQUALL_WINDOW_MS)) / 1000
  let x = s.x + s.vx * into
  let y = s.y + s.vy * into
  // A TEMPEST IS PENNED IN ITS OWN OCEAN, and it is a different shape of pen:
  // the raid water is a disc round the harbour rather than a half-disc round
  // the Mainland, and the wall it must not drift through is the reef at the
  // bottom rather than the coast at the top. Same two clamps, same order, and
  // the same reason for the order — see below.
  if (s.big) {
    const keep = RAID_EDGE - s.r * 0.5
    const dx = x - EXP_ORIGIN.x, dy = y - EXP_ORIGIN.y
    const rr = Math.hypot(dx, dy)
    if (rr > keep) {
      x = EXP_ORIGIN.x + (dx / rr) * keep
      y = EXP_ORIGIN.y + (dy / rr) * keep
    }
    y = Math.min(EXP_ORIGIN.y - 900, y)
    return { x, y }
  }
  // ── THE RADIUS FIRST, THEN THE COAST, AND THE ORDER IS THE WHOLE FIX ──
  //
  // Flooring y and THEN scaling the vector toward the origin pulls y back down
  // with it, so a squall clamped off the rim could land north of the coast
  // after all. Two out of four hundred windows, which is exactly the kind of
  // thing that ships and turns up as one screenshot of rain over the harbour.
  //
  // Inside the surveyed sea, measured to the CENTRE with room for the body of
  // it: weather half off the chart is weather you cannot sail into.
  const keep = OUTER_EDGE - s.r * 0.5
  const r = Math.hypot(x, y)
  if (r > keep) { x = (x / r) * keep; y = (y / r) * keep }
  // And the coast last, so nothing can undo it.
  y = Math.max(1200, y)
  return { x, y }
}

/**
 * How deep in the weather a point is, 0 outside and 1 at the heart of it.
 *
 * Smooth rather than a boundary: sailing into a squall should be the rain
 * thickening around you over a few seconds, and a hard edge would be a wall of
 * water with a doorway in it.
 */
export function squallAt(x: number, y: number, now: number = Date.now()): { squall: Squall; deep: number } | null {
  let best: { squall: Squall; deep: number } | null = null
  for (const s of squallsAt(now)) {
    const at = squallPos(s, now)
    const d = Math.hypot(x - at.x, y - at.y)
    if (d > s.r) continue
    // Flat through the middle and falling away at the rim, so most of a squall
    // is properly inside it rather than being one point you pass through.
    const k = 1 - Math.max(0, (d - s.r * 0.35) / (s.r * 0.65))
    const deep = Math.max(0, Math.min(1, k)) * s.power
    if (!best || deep > best.deep) best = { squall: s, deep }
  }
  return best
}
