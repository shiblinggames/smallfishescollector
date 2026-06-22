// ──────────────────────────────────────────────────────────────────────────
// Locker Upgrades — permanent account perks unlocked via the Davy Jones
// Gauntlet.
// ──────────────────────────────────────────────────────────────────────────
// Each upgrade is gated TWO ways: you must have reached a depth milestone in
// the Gauntlet, AND pay a one-time doubloon cost to claim it. Claimed ids live
// in profiles.gauntlet_upgrades; their effects are derived here so combat /
// stat code reads a number, never a hardcoded id.
//
// This is the endgame doubloon sink + a reason to push deep. Add a new upgrade
// by appending to GAUNTLET_UPGRADES and wiring its effect into the matching
// helper below (and the combat path that reads it).

export interface GauntletUpgrade {
  id: string
  name: string
  /** Plain-language effect, shown on the upgrade card. */
  description: string
  /** Deepest depth the player must have reached in the Gauntlet to claim. */
  depthRequired: number
  /** One-time doubloon cost. */
  cost: number
}

export const GAUNTLET_UPGRADES: GauntletUpgrade[] = [
  {
    id: 'cannonball_rack',
    name: 'Extra Cannonball Rack',
    description: 'Bolt a fourth rack to the gun deck. Your ship stockpiles one more cannonball (4 instead of 3) in every raid. Volleys still fire at 3, so the extra is reserve — volley, and you keep a cannonball chambered.',
    depthRequired: 10,
    cost: 150_000,
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
