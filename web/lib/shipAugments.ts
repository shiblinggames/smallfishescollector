// ──────────────────────────────────────────────────────────────────────────
// Man-o-War volley augmentations — the endgame "Mega" attack.
// ──────────────────────────────────────────────────────────────────────────
// Unlocked by owning the Man-o-War (ship tier 6) at Navigation level 70+, bought
// ONCE for a massive doubloon sum, and PERMANENT — you pick one and you're locked
// in, no swapping. Chosen from the Manage Ship loadout; applies in all raid
// combat (campaign + Gauntlet).
//
// The Mega is a THIRD attack tier above Fire (1 charge) and Volley (3): it spends
// a FULL magazine of 4 cannonballs and leaves you cold at 0, so it's a save-up
// burst, not a spammable default. Costing 4 means it also REQUIRES the Gauntlet's
// Extra Cannonball Rack (which raises max charges 3 -> 4) to ever fire — the
// Man-o-War's signature blow is gated behind going deep in the Locker too.
//
// Combat behaviour + the per-augment damage numbers live with the combat phase
// (Phase 2); this file is the catalogue, the unlock gate, and the economy.

export type ShipAugmentId = 'railgun' | 'barrage' | 'nuke'

export interface ShipAugment {
  id: ShipAugmentId
  name: string
  /** One-line effect summary for the picker card. */
  tagline: string
  /** Longer flavour line. */
  flavor: string
  /** Accent colour for the card + the in-combat FX. */
  color: string
  // ── Combat (Phase 2) — all tunable here. A Volley is ×2 a single shot for
  //    reference; the Mega scales off the same single-shot roll.
  /** Mega damage as a multiplier on a single shot. */
  megaMult: number
  /** Railgun: the Mega can't be dodged (the beam always lands). */
  pierce?: boolean
  /** Barrage: damage split per sub-hit (sums to 1). Each rolls your on-hit procs
   *  — the first at full chance, the rest at `procFalloff`. */
  hits?: number[]
  procFalloff?: number
  /** Nuke: the blast leaves a burn (Fallout) — `pct` of the hit per turn. */
  fallout?: { pct: number; turns: number }
}

export const SHIP_AUGMENTS: ShipAugment[] = [
  {
    id: 'railgun',
    name: 'Railgun',
    tagline: 'A piercing beam that always lands and shrugs off enemy armour.',
    flavor: 'A lance of light off the gun deck. Nothing the deep can do to slip it.',
    color: '#5fd0ff',
    megaMult: 2.6,
    pierce: true,
  },
  {
    id: 'barrage',
    name: 'Barrage',
    tagline: 'Four rapid hits, each a fresh chance to land your on-hit effects.',
    flavor: 'The whole broadside loosed in a heartbeat. Four hammer-blows where one fell before.',
    color: '#ffb454',
    megaMult: 2.8,
    hits: [0.40, 0.25, 0.18, 0.17],
    procFalloff: 0.3,
  },
  {
    id: 'nuke',
    name: 'Nuke',
    tagline: 'One devastating blast that leaves the wreck burning for turns.',
    flavor: 'You light the powder of a hundred ships at once. What it touches does not stay afloat.',
    color: '#ff5b5b',
    megaMult: 3.5,
    fallout: { pct: 0.08, turns: 3 },
  },
]

/** Man-o-War ship tier (top of the ladder). */
export const MANOWAR_TIER = 6
/** Navigation level required to choose an augment. */
export const AUGMENT_NAV_LEVEL = 70
/** One-time doubloon cost. Permanent + non-refundable. */
export const AUGMENT_COST = 750_000
/** The Mega spends a full magazine; this is also why it needs the Rack. */
export const MEGA_CHARGE_COST = 4

/** Picker stays admin-only until the Mega's combat + FX ship (Phases 2-3). Flip
 *  to true to take it live for everyone. */
export const AUGMENTS_LIVE = false

export function getShipAugment(id: string | null | undefined): ShipAugment | null {
  return SHIP_AUGMENTS.find(a => a.id === id) ?? null
}

/** Can this captain CHOOSE an augment? Owns the Man-o-War + Nav 70. (The Rack is
 *  only needed to FIRE the Mega — surfaced as a note on the card, not a buy gate,
 *  so a player can lock in their pick before they've farmed the Rack.) */
export function canChooseAugment(shipTier: number, navLevel: number): boolean {
  return shipTier >= MANOWAR_TIER && navLevel >= AUGMENT_NAV_LEVEL
}
