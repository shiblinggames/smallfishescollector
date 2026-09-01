// THE SHIPYARD — what your boat can carry and how fast it gets there.
//
// Plain module, NOT 'use server': a file with that directive silently drops
// every non-async export, and all of this is pure. Read by the shipyard screen,
// by the sea map, and by the server actions that take the money — which is the
// point, because a price the client can name and the server cannot verify is
// not a price.
//
// ── THE ROD RACK IS GONE ────────────────────────────────────────────────────
//
// It was a four-rung ladder — 40k, 140k, 450k — that bought SLOTS, and only the
// rods in those slots could be swapped at sea. The argument for it was written
// here and it was a real one: "the interesting question is what you decided to
// bring, and there is no decision at all if the answer is always everything."
//
// Two things were wrong with it in practice.
//
// It taxed a CONVENIENCE rather than gating a power. Every rod in the rack is a
// rod already bought and already owned; the rack sold you access to your own
// inventory, and the only thing it could produce was the moment you are out in
// the Ancient Deep holding the wrong rod with no way to fix it but sailing home.
// That is not a decision, it is a trip.
//
// And nobody bought it. Two players in the whole game ever raised a rung, and
// one of those is the developer. A mechanic that 79 of 81 captains never touched
// was not creating the tension it was written to create; it was just a wall
// nobody walked into because nobody found the door.
//
// So you carry everything you own and swap freely from the loadout screen. What
// remains at the Shipyard is what the Shipyard should have been about all along:
// the boat, the hull, the rudder and the hold.

/**
 * THE HULL — sailing speed, and nothing else.
 *
 * Deliberately not tied to anything in the fishing loop. Bite speed is already
 * moved by the rod, the bait and your level, and a fourth multiplier on it
 * would make that maths impossible to reason about. This upgrade solves the
 * problem it looks like it solves: the Ancient Deep is a long haul, and a long
 * haul is a long time to hold a helm.
 *
 * It stacks with the BOAT's own trim and grade (lib/boats) — the hull tier is
 * the ladder everyone climbs, the boat is which one you climb it in.
 */
export const HULL_COSTS = [0, 2_000, 8_000, 20_000, 50_000, 100_000] as const
/**
 * A MULTIPLIER ON THE BASE, and the base is a whole boat.
 *
 * This spent a while inverted — `SPEED` as the top speed and a stock hull at
 * 62% of it — on the reasoning that the chart was tuned for a refitted boat and
 * everyone else should be slower than that tuning. That was the wrong way round
 * for one plain reason: a player opening the game for the first time should not
 * be told their boat is at 62%. A stock hull is not a broken hull. It is 100%,
 * and everything above it is a refit.
 *
 * SIX TIERS, 100% TO 175%. Four tiers were sized for a chart half this width;
 * the bands are 22,600 pixels deep now rather than 14,400, so the ladder grew
 * with them.
 *
 * The top is pinned to a SPEED, not to a round multiplier: 300 base x 1.75 is
 * 525 px/s, which is the number the chart was tuned against. It ran to x2 for a
 * while, which is a tidier figure and forty pixels a second too much.
 *
 * Roughly 12% a step, evenly geometric, so every refit is worth the same
 * fraction as the last rather than the early ones being the only ones you feel.
 *
 * THE PRICES ARE THE FISH HOLD'S, LIFTED WHOLE — tiers 2 through 6 of
 * FISH_HOLD_TIERS: 2,000 / 8,000 / 20,000 / 50,000 / 100,000. The two upgrades
 * sit side by side on the same screen and are bought by the same player out of
 * the same purse, so a captain who can afford the next hold should be able to
 * afford the next hull. They were on their own curve before and it ran to
 * 2,875,000 for five refits, against 1,030,500 for the hold's entire nine
 * tiers — nearly three times the money for half the ladder.
 *
 * Same shape as the hold's, too: roughly 2.5x a step, shallow enough at the
 * bottom that the first refit lands in the first session and steep enough at
 * the top that the last one is a real decision.
 */
export const HULL_SPEED = [1, 1.12, 1.25, 1.4, 1.56, 1.75] as const

export const MAX_HULL_TIER = HULL_COSTS.length - 1

export function hullSpeed(tier: number): number {
  return HULL_SPEED[Math.max(0, Math.min(MAX_HULL_TIER, tier))]
}

export function nextHullCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_HULL_TIER ? null : HULL_COSTS[t]
}

/**
 * EVERY ROD YOU OWN, with the one in your hands first.
 *
 * Used to take a rack tier and clamp to it. It takes the inventory now and
 * clamps to nothing: the whole collection sails with you.
 *
 * The equipped rod stays at the head of the list because it is the one you are
 * holding rather than one of the ones you have, and the sea picks `[0]` as the
 * rod in hand on load.
 */
export function rodsAboard(equippedTier: number, owned: number[]): number[] {
  const rest = [...new Set(owned)].filter(t => t !== equippedTier).sort((a, b) => b - a)
  return [equippedTier, ...rest]
}


// ── HANDLING AND ACCELERATION ───────────────────────────────────────────────
//
// Until now the only thing you could BUY for movement was top speed. There was
// an acceleration number, but it came off the boat cosmetic's trim as a
// sidegrade — so a captain who wanted a quicker boat could only get one by
// giving up speed, and no amount of money made the hull any more responsive.
//
// Two more ladders, both shorter than the hull's six rungs on purpose: the hull
// is the headline upgrade and these are the ones that make it pleasant. Four
// rungs each, priced off the fish hold like everything else on that screen.
//
// They multiply ON TOP of the boat's trim, which still trades speed against
// nimbleness. The ladder is what you buy; the trim is what you choose.

/** Multiplier on how fast the bow comes round. */
export const HANDLING_SPEED = [1, 1.16, 1.34, 1.55] as const
export const HANDLING_COSTS = [0, 8_000, 20_000, 50_000] as const
export const MAX_HANDLING_TIER = HANDLING_COSTS.length - 1

export function handlingRate(tier: number): number {
  return HANDLING_SPEED[Math.max(0, Math.min(MAX_HANDLING_TIER, tier))]
}
export function nextHandlingCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_HANDLING_TIER ? null : HANDLING_COSTS[t]
}

/** Multiplier on how hard she picks up from a standstill. */
export const ACCEL_RATE = [1, 1.18, 1.4, 1.65] as const
export const ACCEL_COSTS = [0, 8_000, 20_000, 50_000] as const
export const MAX_ACCEL_TIER = ACCEL_COSTS.length - 1

export function accelRate(tier: number): number {
  return ACCEL_RATE[Math.max(0, Math.min(MAX_ACCEL_TIER, tier))]
}
export function nextAccelCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_ACCEL_TIER ? null : ACCEL_COSTS[t]
}


// ── WHAT THE BOAT ACTUALLY DOES, IN UNITS PEOPLE READ ───────────────────────
//
// The Shipyard used to sell these as multipliers against a name: "Clipper Hull,
// 140% sailing speed". Both halves fail the same way.
//
// A PERCENTAGE OF WHAT. 140% is only a number if you know what 100% was, and
// nobody does — it is a figure this file made up. "10 m/s" is a speed; "140%"
// is homework.
//
// AND THE NAME WAS DOING NOTHING. A Greyhound Hull, a Spade Rudder and a Tall
// Rig are lovely words that tell a player nothing about what they are buying,
// on a screen whose entire job is to answer exactly that. Worse, they were the
// biggest text on each tile, so the thing that meant least was the thing that
// read first. The names are deleted rather than demoted: an upgrade path does
// not need a name, it needs a number and a delta.
//
// ── THE BASE CONSTANTS LIVE HERE NOW ────────────────────────────────────────
//
// SPEED, TURN and ACCEL were local constants inside SeaMap, and this file
// multiplied a tier against numbers it could not see. That is the exact shape of
// the bug that has bitten twice this week — a ratio kept in one place and the
// thing it is a ratio OF kept in another — and here it would be silent: the
// Shipyard would advertise a speed the sea does not sail at, and nothing would
// ever disagree out loud. The sea imports them from here.

/** World pixels per second at hull tier 0, before the boat's own trim. */
export const BASE_SPEED_PX = 300
/** Radians per second the bow comes round at rudder tier 0. */
export const BASE_TURN_RAD = 2.4
/** How hard she picks up, as the rate of an exponential approach to top speed. */
export const BASE_ACCEL = 2.6

/**
 * HOW MANY WORLD PIXELS MAKE A METRE.
 *
 * Chosen so the ladder reads as a boat: 10.0 m/s at the bottom and 17.5 at the
 * top, which is a fast launch rather than a jet. There is no physical truth to
 * recover here — the chart is 45,000 pixels of painted sea — so the honest thing
 * is to pick the scale that makes the HUD legible and say so. This is the only
 * place it is used, and nothing in the simulation reads it.
 */
const PX_PER_METRE = 30

/** Top speed in metres per second, for the label. */
export function hullMetresPerSec(tier: number): number {
  return (BASE_SPEED_PX * hullSpeed(tier)) / PX_PER_METRE
}

/** How fast the bow comes round, in degrees per second. A player can watch a
 *  boat turn and check this; nobody can check a radian. */
export function turnDegreesPerSec(tier: number): number {
  return BASE_TURN_RAD * handlingRate(tier) * (180 / Math.PI)
}

/**
 * SECONDS TO TOP SPEED, which is what acceleration MEANS to somebody holding a
 * helm — not a multiplier, and not a made-up unit.
 *
 * The sea approaches top speed exponentially (`1 - exp(-k*dt)`), so there is no
 * moment it technically arrives. Three time constants is 95% of the way there,
 * which is the point it stops feeling like it is still gathering.
 */
export function secondsToTopSpeed(tier: number): number {
  return 3 / (BASE_ACCEL * accelRate(tier))
}


// ── THE LANTERN ─────────────────────────────────────────────────────────────
//
// Night on the chart is not a filter, it is a few things that start EMITTING
// while everything else stops (see sea/seaLights). Yours is the pool under the
// hull, and it was a constant: every captain sailed the dark with exactly the
// same circle of light around them from their first hour.
//
// That is the one thing on this screen that upgrades into a different EXPERIENCE
// rather than a better number. A hull that is 40% faster is the same sail in
// less time; a lantern that reaches twice as far is a night you can navigate
// rather than one you creep through. So the ladder starts genuinely dim — a
// candle in a jar, enough to see the water you are already in — and the top of
// it is what the sea has been handing out for free.
//
// FIVE RUNGS, and the numbers are a fraction of the light seaLights already
// draws, so tier 4 is exactly today's night and nothing about the existing
// scene needs re-tuning. Anyone playing now is topped out by definition, which
// is the honest way to add a ladder under a thing people already have: nobody
// wakes up worse off.
export const LANTERN_GLOW = [0.34, 0.5, 0.68, 0.84, 1] as const

/** Priced off the rudder's ladder rather than the hull's — it is a comfort
 *  upgrade with four rungs, not the six-rung headline. */
export const LANTERN_COSTS = [0, 6_000, 18_000, 45_000, 110_000] as const
export const MAX_LANTERN_TIER = LANTERN_COSTS.length - 1

/** How much of the full lantern this tier lights, 0.34 to 1. Read by
 *  sea/seaLights for both the radius and the brightness, so a dim lantern is
 *  genuinely a smaller pool rather than the same pool faded out. */
export function lanternGlow(tier: number): number {
  return LANTERN_GLOW[Math.max(0, Math.min(MAX_LANTERN_TIER, tier))]
}

export function nextLanternCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_LANTERN_TIER ? null : LANTERN_COSTS[t]
}

/**
 * HOW FAR THE LANTERN REACHES, in metres, for the shop label.
 *
 * The same 30px-to-the-metre scale the speeds are printed with. seaLights draws
 * the pool at 132 + 46 world px of radius at full dark; this is that radius at
 * a given tier, as a diameter, because "lights 12 m of water" is a thing you
 * can picture and a radius is a thing you have to double.
 */
export function lanternMetres(tier: number): number {
  return ((132 + 46) * lanternGlow(tier) * 2) / 30
}
