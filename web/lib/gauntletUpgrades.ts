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
  // ── Run Upgrades (scope 'gauntlet') — only touch Gauntlet runs ─────────────
  {
    id: 'navigators_log',
    name: "Navigator's Log",
    description: 'Earn 20% more Nav XP every time you cash out a Gauntlet run.',
    depthRequired: 6,
    cost: 40,
    scope: 'gauntlet',
  },
  {
    id: 'salvagers_eye',
    name: "Salvager's Eye",
    description: 'Bank 15% more doubloons every time you cash out a Gauntlet run.',
    depthRequired: 12,
    cost: 70,
    scope: 'gauntlet',
  },
  {
    id: 'lucky_locker',
    name: 'Lucky Locker',
    description: 'Earn 50% more Fathoms from every dive, win or lose.',
    depthRequired: 18,
    cost: 100,
    scope: 'gauntlet',
  },
  // ── Ship & Shore (scope 'account'/'world') — power for the wider game ───────
  {
    id: 'safe_voyages',
    name: 'Safe Passage',
    description: 'Your crew never dies on voyages. Sail any route risk-free.',
    depthRequired: 8,
    cost: 45,
    scope: 'world',
  },
  {
    id: 'cannonball_rack',
    name: 'Extra Cannonball Rack',
    description: 'Hold 4 cannonballs in raids instead of 3, so one stays loaded right after you fire a volley.',
    depthRequired: 10,
    cost: 60,
    scope: 'account',
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

/** Navigator's Log: Nav XP multiplier on a Gauntlet cash-out. */
export function gauntletXpMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('navigators_log') ? 1.2 : 1
}

/** Lucky Locker: multiplier on Fathoms earned per run (cash-out AND death). */
export function gauntletFathomsMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('lucky_locker') ? 1.5 : 1
}
