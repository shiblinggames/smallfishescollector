// ──────────────────────────────────────────────────────────────────────────
// Man-o-War volley augmentations — the endgame "Mega" attack.
// ──────────────────────────────────────────────────────────────────────────
// The end-of-Chapter-3 payoff. Beating the Quartermaster reveals his stolen weapon
// schematics; from then on you can BUILD an ultimate — but only with all four gates
// met (Chapter 3 cleared, the Man-o-War hull, Navigation 70, and the Gauntlet's Extra
// Cannonball Rack). It costs a massive doubloon sum and takes 24 hours to build, during
// which you may freely re-pick which of the three you want. On completion it locks in;
// rebuilding costs the sum and the wait again. Applies in all raid combat (campaign +
// Gauntlet).
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
/** Navigation level required to build an ultimate. */
export const AUGMENT_NAV_LEVEL = 70
/** One-time doubloon cost per build. A huge sink — an ultimate is a real undertaking. */
export const AUGMENT_COST = 750_000
/** The Mega spends a full magazine; this is also why it needs the Rack. */
export const MEGA_CHARGE_COST = 4
/** How long the ultimate takes to build from the Quartermaster's schematics. */
export const ULTIMATE_BUILD_MS = 24 * 60 * 60 * 1000

/** Picker stays admin-only until the Mega's combat + FX ship (Phases 2-3). Flip
 *  to true to take it live for everyone. */
export const AUGMENTS_LIVE = false

// ── The story frame ─────────────────────────────────────────────────────────
// The Man-o-War ultimate is the end-of-Chapter-3 payoff. Beating the Quartermaster
// reveals that his Coffers held more than gold: stolen schematics, half-finished
// plans for a weapon no ship was ever meant to carry. You seize the plans — and
// building the thing is the costly, slow undertaking that follows. Copy lives here
// so the announcement, the build screen, and the wait all speak with one voice.
export const ULTIMATE_STORY = {
  /** The unlock-announcement eyebrow + title + blurb. */
  unlockKicker: "The Quartermaster's Plans",
  unlockTitle: 'A Weapon Out of Legend',
  unlockBlurb:
    "The Coffers held more than doubloons. Buried in the Quartermaster's cache were schematics no honest shipwright would draw: plans for a weapon meant to end a fight in a single breath. The plans are yours now. Building one will cost a fortune and the better part of a day, but the ship that carries it answers to no one.",
  /** Header shown on the build screen itself. */
  buildKicker: 'Ultimate Weapon',
  buildBlurb:
    "Raise one signature Mega blow into your hull, forged from the Quartermaster's stolen plans. It fires above your Volley for a full magazine of {charges} cannonballs, then leaves you cold.",
  /** Shown while the build clock runs. */
  buildingLine:
    "Your shipwrights work the plans day and night. You can still change which weapon they raise until the work is done.",
} as const

export interface ShipAugmentBuild {
  id: ShipAugmentId
  /** ISO timestamp the build finishes and the ultimate goes live. */
  completesAt: string
}

/** Narrow-and-validate a raw jsonb build column into a typed build (or null). */
export function parseAugmentBuild(raw: unknown): ShipAugmentBuild | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { id?: unknown; completesAt?: unknown }
  if (typeof r.id !== 'string' || typeof r.completesAt !== 'string') return null
  if (!getShipAugment(r.id)) return null
  return { id: r.id as ShipAugmentId, completesAt: r.completesAt }
}

export function isBuildComplete(build: ShipAugmentBuild | null, nowMs: number): boolean {
  return !!build && new Date(build.completesAt).getTime() <= nowMs
}

export function getShipAugment(id: string | null | undefined): ShipAugment | null {
  return SHIP_AUGMENTS.find(a => a.id === id) ?? null
}

// ── The four build gates ─────────────────────────────────────────────────────
// Chapter 3 clear UNLOCKS the ability to purchase, but building still requires all
// four: the chapter cleared, the Man-o-War hull, Navigation 70, and the Gauntlet's
// Extra Cannonball Rack (a 4-slot magazine to actually FIRE the Mega). We surface
// every one of these plainly on the build screen so the requirement is never a
// mystery.
export interface UltimateGates {
  chapter3: boolean
  manowar: boolean
  navLevel: boolean
  rack: boolean
}

export function ultimateGateStatus(input: {
  chapter3Cleared: boolean
  shipTier: number
  navLevel: number
  hasRack: boolean
}): UltimateGates {
  return {
    chapter3: input.chapter3Cleared,
    manowar: input.shipTier >= MANOWAR_TIER,
    navLevel: input.navLevel >= AUGMENT_NAV_LEVEL,
    rack: input.hasRack,
  }
}

export function allUltimateGatesMet(g: UltimateGates): boolean {
  return g.chapter3 && g.manowar && g.navLevel && g.rack
}

/** Server-side gate check (mirrors ultimateGateStatus, collapsed to a bool). */
export function canBuildUltimate(input: {
  chapter3Cleared: boolean
  shipTier: number
  navLevel: number
  hasRack: boolean
}): boolean {
  return allUltimateGatesMet(ultimateGateStatus(input))
}
