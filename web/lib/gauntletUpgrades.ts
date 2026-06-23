// ──────────────────────────────────────────────────────────────────────────
// Locker Upgrades — permanent perks unlocked via the Davy Jones Gauntlet.
// ──────────────────────────────────────────────────────────────────────────
// Each upgrade is gated TWO ways: you must have reached a depth milestone in
// the Gauntlet, AND pay a one-time cost in Fathoms — the Gauntlet's own
// meta-currency, earned only by descending (see fathomsForDepth in lib/gauntlet
// and the cash-out / death paths in gauntlet/actions). Claimed ids live in
// profiles.gauntlet_upgrades; their effects are derived here so combat / stat /
// voyage code reads a number or a boolean, never a hardcoded id.
//
// This is the roguelite meta-progression loop: descend → earn Fathoms → buy
// permanent power → descend deeper. Add a new upgrade by appending to
// GAUNTLET_UPGRADES and wiring its effect into the matching helper below (and
// the path that reads it).

/** Where an upgrade's effect lands — drives a small label on the card. */
export type UpgradeScope =
  | 'account'  // applies in every raid
  | 'world'    // applies out in the wider game (voyages, fishing…)
  | 'gauntlet' // applies only to Gauntlet runs

export interface GauntletUpgrade {
  id: string
  name: string
  /** Plain-language effect, shown on the upgrade card. */
  description: string
  /** Deepest depth the player must have reached in the Gauntlet to claim. */
  depthRequired: number
  /** One-time cost in Fathoms. */
  cost: number
  scope: UpgradeScope
}

export const GAUNTLET_UPGRADES: GauntletUpgrade[] = [
  {
    id: 'safe_voyages',
    name: 'Safe Passage',
    description: 'Strike a bargain with the deep: your crew always comes home. Voyages on every route lose no crew, ever — sail the Shrouded Reach without burying a soul.',
    depthRequired: 8,
    cost: 45,
    scope: 'world',
  },
  {
    id: 'cannonball_rack',
    name: 'Extra Cannonball Rack',
    description: 'Bolt a fourth rack to the gun deck. Your ship stockpiles one more cannonball (4 instead of 3) in every raid. Volleys still fire at 3, so the extra is reserve — volley, and you keep a cannonball chambered.',
    depthRequired: 10,
    cost: 60,
    scope: 'account',
  },
  {
    id: 'salvagers_eye',
    name: "Salvager's Eye",
    description: 'You learn to read the wreckage. Every haul you cash out of the Gauntlet pays 15% more doubloons. Sink and you still lose it all — this only sweetens what you carry up.',
    depthRequired: 12,
    cost: 70,
    scope: 'gauntlet',
  },
]

export function getGauntletUpgrade(id: string): GauntletUpgrade | null {
  return GAUNTLET_UPGRADES.find(u => u.id === id) ?? null
}

/** Extra player cannonball capacity (max charges) granted by claimed upgrades.
 *  Volley cost is unchanged — these are reserve slots. */
export function bonusChargeSlots(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('cannonball_rack') ? 1 : 0
}

/** Safe Passage: when owned, voyages never roll a crew casualty. */
export function hasSafeVoyages(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('safe_voyages')
}

/** Salvager's Eye: doubloon multiplier applied to a Gauntlet cash-out haul. */
export function gauntletHaulMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('salvagers_eye') ? 1.15 : 1
}
