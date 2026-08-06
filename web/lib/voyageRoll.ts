// THE VOYAGE, as one thing that happens.
//
// A voyage used to be six independent events, each rolling its own outcome and
// its own payout, stitched into a list. That made the whole system hard to read
// in both directions: a player could not tell why one trip paid more than
// another, and we could not tell what a route was actually worth without
// summing six random variables. It also meant crew stats mattered six times in
// six different ways (power gated encounters, fortune gated discoveries, dodge
// gated dangers), which sounds deep and reads as noise.
//
// Now a voyage is ONE event with ONE outcome, and ONE loot roll at the end that
// keys off the crew you sent. Three inputs, and you can hold all of them in your
// head while you pick a crew:
//
//   POWER   decides how the event goes    (triumph / success / setback)
//   FORTUNE scales what you bring home    (and, elsewhere, cuts crew-loss risk)
//   ROUTE   sets the size of everything   (and the risk)
//
// Everything a voyage pays is `route base x outcome x fortune x a small roll`.

import { ROUTE_CONFIGS, type VoyageRoute } from './voyageRoutes'

export type VoyageOutcome = 'triumph' | 'success' | 'setback'

/** What the single event pays, relative to the route's base.
 *
 *  Tightened from 1.35/1.0/0.6 (2026-08-05). That was a 2.25x spread between
 *  the best and worst outcome, and because a reference crew lands on triumph
 *  42% of the time and setback 22%, roughly two thirds of voyages hit an
 *  extreme. The result was a coefficient of variation of 28% against a trawl
 *  haul's 8%, so the payout read as a lottery rather than as something the
 *  crew earned.
 *
 *  It was a defensible trade when a voyage took forty-five minutes and you
 *  could simply run another. It is not one now that Shroud takes seven hours:
 *  variance you can grind out is texture, variance on a seven-hour commitment
 *  is just punishment. Fewer, longer commitments should be MORE predictable,
 *  not less.
 *
 *  1.25/1.0/0.75 is a 1.67x spread, close to the trawl band, and it barely
 *  moves the mean (1.059 to 1.05 at the reference crew) so the per-route
 *  anchors in ROUTE_PAYOUTS still hold. Power still visibly matters: it is the
 *  only thing that shifts which outcome you land on. */
export const OUTCOME_MULT: Record<VoyageOutcome, number> = {
  triumph: 1.25,
  success: 1.0,
  setback: 0.75,
}

/** Per-route payout anchors, for a REFERENCE crew (see FORTUNE_REF).
 *
 *  NAV XP is anchored to the trawls, route by route, because they are the other
 *  idle loop and the only honest yardstick: an hour of Shroud should be worth
 *  about an hour of Abyss trawling, just in Navigation instead of Fishing. At
 *  full investment that puts Shroud at ~2,826 Nav XP/hr against the Abyss
 *  trawl's 2,826 Fishing XP/hr, with the shallower routes tracking their own
 *  zone equivalents.
 *
 *  CUT AGAIN by 25% on doubloons and Nav XP (2026-08-05, third pass). Even
 *  after the spread was tightened the midpoint read too rich, so the anchors
 *  came down rather than the variance alone. crewXp is deliberately untouched:
 *  it is a flat ~200/hr figure with its own job.
 *
 *  RATES WERE CUT ACROSS THE BOARD (2026-08-05, second pass). Voyages were
 *  paying too well per hour on every route once they had been lengthened and
 *  their payouts scaled to match. The ceiling is now set by hand: SHROUD tops
 *  out roughly where TRIANGLE used to, and everything beneath it scales down
 *  from there.
 *
 *  Coastal took the deepest cut, 67% off its Nav rate. It had drifted into
 *  paying almost exactly what Open did per hour (1,059 against 1,108) while
 *  being the zero-risk, no-gate, hour-long entry route, so there was no reason
 *  to ever leave it. An entry route should be a foothold, not a destination.
 *
 *  Per-hour targets, at full investment and no Swift Sails:
 *
 *    route      nav/hr   ⟡/hr    (was nav/hr)
 *    coastal       350    300         1,059
 *    open          650    500         1,108
 *    deep        1,150    750         1,700
 *    triangle    1,650    950         2,169
 *    shroud      2,150  1,110         2,828
 *
 *  Crew XP needs no entry here: it is a flat 25% of Nav XP, so it follows.
 *
 *  Rates are quoted WITHOUT Swift Sails on purpose. Treating the upgrade as
 *  the baseline would make the published numbers wrong for everyone who does
 *  not hold it; held to the unbuffed clock, Swift Sails is worth a real 18%
 *  on top of these.
 *
 *  GEMS were deliberately NOT scaled. Voyages are the largest gem faucet in the
 *  game and are due to lose gems entirely once a replacement source exists, so
 *  tripling them on the way out would be the wrong direction. Holding them flat
 *  while the clock triples cuts gems per hour to a third, which is a start.
 *
 *  This also fixed a curve that ran backwards. Because the duration ladder
 *  makes deep routes take proportionally longer, a flat XP ladder meant
 *  COASTAL had the best Nav XP per hour of any route. Depth now pays better by
 *  the hour as well as by the trip.
 *
 *  Retuned 2026-08-05 alongside the single-event rework. Two things were wrong
 *  with the old numbers, and both came out of the live data rather than taste:
 *
 *  1. THE ENTRY ROUTE WAS WORTHLESS. Coastal averaged 90 doubloons and 0.2 gems
 *     for a trip of three hours or more. A quarter of all voyages returned no
 *     gems at all, and almost all of those were the shallow routes, so a new
 *     player's first several voyages could each come back with nothing but
 *     coin. The spread from Coastal to Shroud was 25x on doubloons and 150x on
 *     gems; it is now 10x and 15x.
 *  2. RISK WAS NOT PAID FOR. Shroud returned about 1,110 doubloons an hour
 *     against four maxed trawls' ~1,200, so the route with a 20% permadeath
 *     roll paid LESS per hour than the one with none. Voyages are now the
 *     premium idle source, which is what the crew risk and the Nav gate are
 *     supposed to buy. */
export const ROUTE_PAYOUTS: Record<VoyageRoute, {
  doubloons: number
  gems: number
  /** NAVIGATION xp for the captain. */
  xp: number
  /** CREW xp, per surviving hand.
   *
   *  Its own number, NOT a share of the Nav figure. It was 25% of Nav XP, which
   *  meant it inherited Nav's whole shape: Nav per hour climbs sixfold from
   *  Coastal to Shroud, so crew XP per hour did too, and picking a deep route
   *  became a crew-training decision as well as a loot one.
   *
   *  These are tuned so the RATE is FLAT at ~200 an hour on every route. A
   *  longer voyage still returns more crew XP in total, because it took longer;
   *  it just does not pay a better rate for going deeper. Where you sail is a
   *  loot and Nav decision. Where you TRAIN is the Crew Hall, which starts at
   *  250 an hour per bunk at Drills I and reaches 4,100 at Drills VI, so the
   *  hall out-trains a voyage at every tier including the first. */
  crewXp: number
  /** Total crew Power for an even shot at `success`. Scales with the route. */
  difficulty: number
}> = {
  coastal:  { doubloons: 260,  gems: 2,  xp: 300, crewXp: 230,  difficulty: 8  },
  open:     { doubloons: 850,  gems: 5,  xp: 1100, crewXp: 450,  difficulty: 16 },
  deep:     { doubloons: 1910, gems: 10, xp: 2930, crewXp: 680,  difficulty: 28 },
  triangle: { doubloons: 3500, gems: 17, xp: 6080, crewXp: 980, difficulty: 42 },
  shroud:   { doubloons: 5660, gems: 30, xp: 10960, crewXp: 1360, difficulty: 60 },
}

/** Total crew Fortune the ROUTE_PAYOUTS numbers assume. Above this you earn
 *  more than the anchor, below it less. Deliberately reachable mid-game so the
 *  published numbers are not a fantasy only a maxed roster ever sees. */
export const FORTUNE_REF = 25

/** Fortune's pull on the haul. Kept gentle and BOUNDED: at zero fortune you
 *  still bring back 70% of the anchor, and a maxed roster brings back 150%.
 *  The old scale was unbounded (1 + fortune/55), so stacking fortune was the
 *  only crew decision that mattered. */
export function fortuneScale(fortune: number): number {
  const t = Math.max(0, Math.min(2, fortune / FORTUNE_REF))
  // Lands on exactly 1.0 at the reference, so the ROUTE_PAYOUTS anchors are the
  // numbers a reference crew actually averages rather than a figure everything
  // else multiplies away from. 0.7 at no fortune, 1.3 at double the reference.
  return 0.7 + 0.3 * t
}

/** Power decides the single event. Never a certainty in either direction: even
 *  a hopelessly outgunned crew has a shot at pulling it off, and no amount of
 *  Power guarantees a triumph. */
export function outcomeChances(power: number, route: VoyageRoute): { triumph: number; setback: number } {
  const d = ROUTE_PAYOUTS[route].difficulty
  const ratio = d > 0 ? power / d : 2
  // ratio 0 -> mostly setbacks; ratio 1 -> even; ratio 2+ -> mostly triumphs.
  const triumph = Math.max(0.05, Math.min(0.65, 0.1 + 0.32 * ratio))
  const setback = Math.max(0.08, Math.min(0.6, 0.5 - 0.28 * ratio))
  return { triumph, setback }
}

/** Probability-weighted mean outcome multiplier for a crew on a route.
 *
 *  Exported because the send-screen estimate, the claim-time XP grant and the
 *  reveal all need it, and all three had hand-copied 1.35 / 0.6 literals. The
 *  spread has now been retuned once; without this they would each have needed
 *  finding and editing, and the one that was missed would have been silently
 *  wrong. */
export function meanOutcomeMult(power: number, route: VoyageRoute): number {
  const c = outcomeChances(power, route)
  const success = Math.max(0, 1 - c.triumph - c.setback)
  return c.triumph * OUTCOME_MULT.triumph + success * OUTCOME_MULT.success + c.setback * OUTCOME_MULT.setback
}

export function rollOutcome(power: number, route: VoyageRoute, rng: () => number = Math.random): VoyageOutcome {
  const { triumph, setback } = outcomeChances(power, route)
  const r = rng()
  if (r < triumph) return 'triumph'
  if (r > 1 - setback) return 'setback'
  return 'success'
}

export interface VoyageLoot {
  outcome: VoyageOutcome
  doubloons: number
  gems: number
  xp: number
  /** The raw luck multiplier, kept so the reveal can flavour a big haul. */
  luck: number
  /** The 1-in-100 hit. Multiplies coin and gems by BOOTY_MULT. */
  booty: boolean
}

/** MASSIVE BOOTY. One voyage in a hundred comes back loaded.
 *
 *  Not a "jackpot", for two reasons. The game already spends that word three
 *  times over: the slots' global Catfish Jackpot (with its own badge), the
 *  trawl bumper tier, and the rod jackpot stat, so a fourth meaning would blur
 *  all of them. And casino language sits badly on an expedition when the game
 *  is called Seas the Booty and has a perfectly good word of its own.
 *
 *  The ODDS are flat across every route; the HAUL is not, because ten times a
 *  Shroud haul is worth twenty-two times ten times a Coastal one. That keeps
 *  the deep routes the better place to chase it without needing a second
 *  difficulty curve: its expected value works out at about 27 doubloons an
 *  hour on Coastal against 100 on Shroud.
 *
 *  Nav and crew XP are deliberately NOT multiplied. It should be a story
 *  about treasure, not a shortcut through levelling, and 10x Nav XP would be
 *  worth more than the coin to anyone still climbing. */
export const BOOTY_CHANCE = 0.01
export const BOOTY_MULT = 10

/** THE loot roll. One call, at the end, off the crew you sent.
 *
 *  `luck` is a tight band on purpose. The swing a player feels should come from
 *  the outcome (which their crew choice earns) and not from a dice roll they
 *  cannot influence, which is the opposite of how six independent event rolls
 *  behaved. */
export function rollVoyageLoot(
  route: VoyageRoute,
  power: number,
  fortune: number,
  rng: () => number = Math.random,
): VoyageLoot {
  const base = ROUTE_PAYOUTS[route]
  const outcome = rollOutcome(power, route, rng)
  const om = OUTCOME_MULT[outcome]
  const fs = fortuneScale(fortune)
  // Triangular, so most hauls sit near the anchor and the edges are rare.
  const luck = 0.88 + ((rng() + rng()) / 2) * 0.24

  const booty = rng() < BOOTY_CHANCE
  const scale = om * fs * luck * (booty ? BOOTY_MULT : 1)
  return {
    outcome,
    booty,
    doubloons: Math.max(1, Math.round(base.doubloons * scale)),
    // Every route pays at least one gem now. A voyage coming back with nothing
    // to show was the single worst outcome in the old system, and it happened
    // on 26% of trips.
    gems: Math.max(1, Math.round(base.gems * scale)),
    // XP tracks the outcome but not the luck roll: what you learn from a trip
    // is about how it went, not how full the hold was.
    // NOT multiplied: see BOOTY_MULT.
    xp: Math.max(1, Math.round(base.xp * om * (0.9 + 0.2 * (fortune / (FORTUNE_REF * 2))))),
    luck,
  }
}

/** Expected haul for the panel's pre-sail estimate. No rng, no outcome roll:
 *  the probability-weighted average, so the number the player is shown before
 *  they commit is the number they actually average. */
export function expectedVoyageLoot(route: VoyageRoute, power: number, fortune: number): { doubloons: number; gems: number; xp: number } {
  const base = ROUTE_PAYOUTS[route]
  const { triumph, setback } = outcomeChances(power, route)
  const success = Math.max(0, 1 - triumph - setback)
  const meanOm = triumph * OUTCOME_MULT.triumph + success * OUTCOME_MULT.success + setback * OUTCOME_MULT.setback
  const scale = meanOm * fortuneScale(fortune)
  return {
    doubloons: Math.round(base.doubloons * scale),
    gems: Math.max(1, Math.round(base.gems * scale)),
    xp: Math.round(base.xp * meanOm),
  }
}

/** Route name, for copy. */
export function routeName(route: VoyageRoute): string {
  return ROUTE_CONFIGS[route].name
}
