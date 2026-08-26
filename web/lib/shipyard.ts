// THE SHIPYARD — what your boat can carry and how fast it gets there.
//
// Plain module, NOT 'use server': a file with that directive silently drops
// every non-async export, and all of this is pure. Read by the shipyard screen,
// by the sea map, and by the server actions that take the money — which is the
// point, because a price the client can name and the server cannot verify is
// not a price.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// On the fishing page your whole collection was always to hand: every rod you
// had ever bought, one tap away, mid-session. That is fine for a menu you open.
// It is wrong for a sea you sail, where the interesting question is what you
// decided to bring — and there is no decision at all if the answer is always
// "everything".
//
// So the loadout is committed ashore, and only what is ON the boat can be
// swapped at sea. By default that is one rod: the one you are holding.

/** Rods you can carry, by rack tier. Tier 0 is the rod in your hands. */
export const RACK_SLOTS = [1, 2, 3, 4] as const

/**
 * FOUR IS THE CAP, on purpose.
 *
 * Enough to carry a workhorse, something for jackpots and one specialist, which
 * is a real loadout with real trade-offs. Past four you are carrying most of
 * your collection again and the decision quietly stops existing, which is the
 * exact thing this mechanic is here to create.
 *
 * The curve is steep — each berth is roughly three times the last — so the
 * fourth is a genuine late-game purchase rather than something you drift into.
 */
export const RACK_COSTS = [0, 40_000, 140_000, 450_000] as const

export const MAX_RACK_TIER = RACK_COSTS.length - 1

export function rackSlots(tier: number): number {
  return RACK_SLOTS[Math.max(0, Math.min(MAX_RACK_TIER, tier))]
}

/** Cost of the NEXT berth, or null when the rack is full. */
export function nextRackCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_RACK_TIER ? null : RACK_COSTS[t]
}

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
 * SIX TIERS, TOPPING OUT AT DOUBLE. Four was sized for a chart half this width.
 * The bands are now 22,600 pixels deep rather than 14,400, so the ceiling moved
 * with them: the Greyhound crosses the whole chart in about the time the old
 * Clipper took to reach the Abyss.
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
export const HULL_SPEED = [1, 1.15, 1.32, 1.52, 1.75, 2] as const

export const MAX_HULL_TIER = HULL_COSTS.length - 1

export function hullSpeed(tier: number): number {
  return HULL_SPEED[Math.max(0, Math.min(MAX_HULL_TIER, tier))]
}

export function nextHullCost(tier: number): number | null {
  const t = tier + 1
  return t > MAX_HULL_TIER ? null : HULL_COSTS[t]
}

/**
 * WHAT IS ACTUALLY ABOARD.
 *
 * `rods_aboard` is stored as the rod TIERS loaded into the rack. The equipped
 * rod is always aboard whether or not it is in the list — it is in your hands,
 * not in the rack — so this normalises that rather than making every caller
 * remember it.
 */
export function rodsAboard(equippedTier: number, aboard: number[] | null, rackTier: number): number[] {
  const slots = rackSlots(rackTier)
  const rest = (aboard ?? []).filter(t => t !== equippedTier)
  // The equipped rod first, then the rack, clamped to what the rack can hold.
  // Clamped on READ as well as on write: a rack that shrinks (it cannot today,
  // but nothing stops a future refund) must not leave rods aboard that there is
  // no longer room for.
  return [equippedTier, ...rest].slice(0, slots)
}
