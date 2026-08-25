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
 * problem it looks like it solves: the Ancient Deep is twenty-seven seconds
 * from home at base speed, and that is a long time to hold a helm.
 */
export const HULL_NAMES = ['Stock Hull', 'Trimmed Hull', 'Raked Hull', 'Clipper Hull'] as const
export const HULL_COSTS = [0, 25_000, 90_000, 260_000] as const
/** Multiplier on SPEED. Tops out at +60%, which turns that twenty-seven second
 *  haul into about seventeen. */
export const HULL_SPEED = [1, 1.18, 1.36, 1.6] as const

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
