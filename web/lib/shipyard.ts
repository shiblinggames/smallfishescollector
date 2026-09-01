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
export const HULL_NAMES = [
  'Stock Hull', 'Trimmed Hull', 'Raked Hull',
  'Clipper Hull', 'Blackwall Hull', 'Greyhound Hull',
] as const
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
export const HANDLING_NAMES = ['Fixed Rudder', 'Balanced Rudder', 'Deep Rudder', 'Spade Rudder'] as const
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
export const ACCEL_NAMES = ['Stock Rig', 'Trimmed Rig', 'Tall Rig', 'Racing Rig'] as const
export const ACCEL_COSTS = [0, 8_000, 20_000, 50_000] as const
export const MAX_ACCEL_TIER = ACCEL_COSTS.length - 1

export function accelRate(tier: number): number {
  return ACCEL_RATE[Math.max(0, Math.min(MAX_ACCEL_TIER, tier))]
}
export function nextAccelCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_ACCEL_TIER ? null : ACCEL_COSTS[t]
}
