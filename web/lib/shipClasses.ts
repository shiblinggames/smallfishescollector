// Ship classes. One-time chapter-end pick: when you clear a chapter's
// final boss raid, the chapter map gates open a Class node that lets
// you pick a permanent ship identity from a 4-class roster. Each class
// has clear tradeoffs (most have +X% on a stat in exchange for -Y% on
// another) so it reads as IDENTITY ("I am a glass cannon") rather than
// "free buff."
//
// Effects stack MULTIPLICATIVELY across chapters and with raid items —
// same math the existing items already use. Picking the same class
// twice doubles down on the identity (and the tradeoff); spreading
// picks across classes softens or cancels the tradeoffs.

export type ShipClassId = 'master_gunner' | 'ironside' | 'helmsman' | 'first_mate'

export interface ShipClassEffects {
  /** Multiplier on player outgoing raid damage. 1.15 = +15%, 0.90 = -10%. Default 1. */
  damageMult?: number
  /** Multiplier on player max HP at raid start. Default 1. */
  hpMult?: number
  /** Flat bonus added to ship speed during raid turn-order rolls. Default 0. */
  speedFlat?: number
  /** Multiplier on doubloons awarded from raid clears. Default 1. */
  doubloonMult?: number
}

export interface ShipClassDef {
  id: ShipClassId
  name: string
  /** One-line identity tag. Used in the picker + the loadout summary. */
  tagline: string
  /** Plain-language effect summary for the picker card. */
  description: string
  /** Bullet list of pros/cons rendered as stat chips on the picker. */
  bullets: { label: string; positive: boolean }[]
  /** Color accent for the picker card / loadout pill. */
  color: string
  /** Glyph + bg color used in the loadout summary. */
  emoji: string
  effects: ShipClassEffects
}

export const SHIP_CLASSES: Record<ShipClassId, ShipClassDef> = {
  master_gunner: {
    id: 'master_gunner',
    name: 'Master Gunner',
    tagline: 'Glass cannon. You hit hard. You also break.',
    description: 'Sacrifice hull integrity for raw firepower. Cannons run hotter, plating is thinner.',
    bullets: [
      { label: '+15% damage', positive: true  },
      { label: '−10% HP',     positive: false },
    ],
    color: '#f0743a',
    emoji: '💥',
    effects: { damageMult: 1.15, hpMult: 0.90 },
  },
  ironside: {
    id: 'ironside',
    name: 'Ironside',
    tagline: 'Plate and patience. You outlast everything.',
    description: 'Reinforced everywhere. Your hull soaks more, your guns sit a little lighter.',
    bullets: [
      { label: '+15% HP',     positive: true  },
      { label: '−10% damage', positive: false },
    ],
    color: '#7dd3fc',
    emoji: '🛡️',
    effects: { damageMult: 0.90, hpMult: 1.15 },
  },
  helmsman: {
    id: 'helmsman',
    name: 'Helmsman',
    tagline: 'Cargo first. Fights second.',
    description: 'You sail for the prize, not the glory. Heavier holds full of plunder cost you tempo.',
    bullets: [
      { label: '+25% doubloons', positive: true  },
      { label: '−10 speed',      positive: false },
    ],
    color: '#f0c040',
    emoji: '⟡',
    effects: { doubloonMult: 1.25, speedFlat: -10 },
  },
  first_mate: {
    id: 'first_mate',
    name: 'First Mate',
    tagline: 'Steady hand. No weak spot.',
    description: 'No specialty, no flaw. A small lift across the board for the captain who wants options open.',
    bullets: [
      { label: '+5% damage', positive: true },
      { label: '+5% HP',     positive: true },
    ],
    color: '#9aa6b8',
    emoji: '⚓',
    effects: { damageMult: 1.05, hpMult: 1.05 },
  },
}

export const SHIP_CLASS_LIST: ShipClassDef[] = [
  SHIP_CLASSES.master_gunner,
  SHIP_CLASSES.ironside,
  SHIP_CLASSES.helmsman,
  SHIP_CLASSES.first_mate,
]

export function getShipClass(id: string | null | undefined): ShipClassDef | undefined {
  if (!id) return undefined
  return SHIP_CLASSES[id as ShipClassId]
}

/** Aggregate the effects of every class the player has picked. Multipliers
 *  compound multiplicatively (1.15 × 1.15 = 1.3225); flat bonuses add.
 *  Empty / missing picks contribute the identity (no change). */
export interface AggregatedClassEffects {
  damageMult: number
  hpMult: number
  speedFlat: number
  doubloonMult: number
  /** Number of class picks aggregated (useful for UI display). */
  count: number
}

export function aggregateShipClasses(picks: Record<string, ShipClassId | string>): AggregatedClassEffects {
  const out: AggregatedClassEffects = {
    damageMult:   1,
    hpMult:       1,
    speedFlat:    0,
    doubloonMult: 1,
    count:        0,
  }
  for (const classId of Object.values(picks)) {
    const cls = getShipClass(classId)
    if (!cls) continue
    out.damageMult   *= cls.effects.damageMult   ?? 1
    out.hpMult       *= cls.effects.hpMult       ?? 1
    out.speedFlat    += cls.effects.speedFlat    ?? 0
    out.doubloonMult *= cls.effects.doubloonMult ?? 1
    out.count        += 1
  }
  return out
}
