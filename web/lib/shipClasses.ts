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

export type ShipClassId =
  | 'master_gunner' | 'ironside' | 'helmsman' | 'buccaneer'              // Mark I (chapter-1 starters)
  | 'master_gunner_ii' | 'ironside_ii' | 'helmsman_ii' | 'buccaneer_ii'  // Mark II (deepen a line you already sail)
  | 'master_gunner_iii' | 'ironside_iii' | 'helmsman_iii' | 'buccaneer_iii' // Mark III (deepen again — chapter-3 capstone)
  | 'armory_expansion' | 'crew_quarters'  // Chapter-4 AUGMENTS (either/or capstone pick, not on the class ladder)

export interface ShipClassEffects {
  /** Multiplier on player outgoing raid damage. 1.15 = +15%, 0.90 = -10%. Default 1. */
  damageMult?: number
  /** Multiplier on player max HP at raid start. Default 1. */
  hpMult?: number
  /** Flat bonus added to ship speed during raid turn-order rolls. Default 0. */
  speedFlat?: number
  /** Multiplier on doubloons awarded from raid clears. Default 1. */
  doubloonMult?: number
  /** Flat EXTRA raid-item slots on top of the hull's cap (Ch4 augment). Default 0. */
  itemSlots?: number
  /** Flat EXTRA crew slots on top of the hull's cap — ship-wide, so voyages
   *  benefit too (Ch4 augment: your ship berths one more crew). Default 0. */
  crewSlots?: number
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
    emoji: '✦',
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
    emoji: '▣',
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
  buccaneer: {
    id: 'buccaneer',
    name: 'Buccaneer',
    tagline: 'No specialty. No weak spot.',
    description: 'A small lift across the board for the captain who wants their options open. The default pirate, just a little better at everything.',
    bullets: [
      { label: '+5% damage', positive: true },
      { label: '+5% HP',     positive: true },
    ],
    color: '#9aa6b8',
    emoji: '⊕',
    effects: { damageMult: 1.05, hpMult: 1.05 },
  },

  // ── Mark II — the "deepen" tier ──────────────────────────────────────────
  // Only offered on a class_pick when you ALREADY sail the Mark I of that line.
  // A moderate extra rung that STACKS on top of your Mark I (see
  // offeredShipClasses), so committing to one identity across chapters
  // compounds harder (and the tradeoff bites harder) than spreading wide.
  master_gunner_ii: {
    id: 'master_gunner_ii',
    name: 'Master Gunner II',
    tagline: 'Deeper into the bargain. Hotter still.',
    description: 'You lean further into the gunner\'s trade. Even more bite, even less plate. Stacks on your Master Gunner.',
    bullets: [
      { label: '+10% damage', positive: true  },
      { label: '−7% HP',      positive: false },
    ],
    color: '#f0743a',
    emoji: '✦',
    effects: { damageMult: 1.10, hpMult: 0.93 },
  },
  ironside_ii: {
    id: 'ironside_ii',
    name: 'Ironside II',
    tagline: 'Plate over plate. You will not sink.',
    description: 'Reinforce what was already reinforced. Your hull soaks more; your guns sit lighter still. Stacks on your Ironside.',
    bullets: [
      { label: '+10% HP',     positive: true  },
      { label: '−7% damage',  positive: false },
    ],
    color: '#7dd3fc',
    emoji: '▣',
    effects: { damageMult: 0.93, hpMult: 1.10 },
  },
  helmsman_ii: {
    id: 'helmsman_ii',
    name: 'Helmsman II',
    tagline: 'The hold runs deeper.',
    description: 'More of the prize, more of the drag. You sail heavier and richer. Stacks on your Helmsman.',
    bullets: [
      { label: '+15% doubloons', positive: true  },
      { label: '−5 speed',       positive: false },
    ],
    color: '#f0c040',
    emoji: '⟡',
    effects: { doubloonMult: 1.15, speedFlat: -5 },
  },
  buccaneer_ii: {
    id: 'buccaneer_ii',
    name: 'Buccaneer II',
    tagline: 'A little better at everything. Again.',
    description: 'Another small lift across the board for the captain who keeps their options open. Stacks on your Buccaneer.',
    bullets: [
      { label: '+5% damage', positive: true },
      { label: '+5% HP',     positive: true },
    ],
    color: '#9aa6b8',
    emoji: '⊕',
    effects: { damageMult: 1.05, hpMult: 1.05 },
  },

  // ── Mark III — the chapter-3 capstone tier. Only offered on a line you've
  //    already taken to Mark II, so committing to ONE identity across all three
  //    chapters compounds the hardest (I × II × III), tradeoff and all.
  master_gunner_iii: {
    id: 'master_gunner_iii',
    // Damage TAPERS at the capstone (2026-07-04): late-game damage already
    // compounds across class + items + crew + boons multiplicatively, so a third
    // full-size +10% would runaway-scale. Smaller final bite (and a lighter HP
    // cost to match). The defensive/economy lines keep their full Mark III.
    name: 'Master Gunner III',
    tagline: 'The last of the powder.',
    description: 'The gunner\'s trade as far as it goes. A smaller final gain than before, but the plate keeps thinning. Stacks on your Master Gunner II.',
    bullets: [
      { label: '+6% damage', positive: true  },
      { label: '−4% HP',     positive: false },
    ],
    color: '#f0743a',
    emoji: '✦',
    effects: { damageMult: 1.06, hpMult: 0.96 },
  },
  ironside_iii: {
    id: 'ironside_iii',
    name: 'Ironside III',
    tagline: 'An anvil the sea cannot crack.',
    description: 'Plate on plate on plate. All but unsinkable, and slow to answer. Stacks on your Ironside II.',
    bullets: [
      { label: '+10% HP',    positive: true  },
      { label: '−7% damage', positive: false },
    ],
    color: '#7dd3fc',
    emoji: '▣',
    effects: { damageMult: 0.93, hpMult: 1.10 },
  },
  helmsman_iii: {
    id: 'helmsman_iii',
    name: 'Helmsman III',
    tagline: 'The richest hold on the water.',
    description: 'Every coin the sea offers, and the drag that comes with it. Stacks on your Helmsman II.',
    bullets: [
      { label: '+15% doubloons', positive: true  },
      { label: '−5 speed',       positive: false },
    ],
    color: '#f0c040',
    emoji: '⟡',
    effects: { doubloonMult: 1.15, speedFlat: -5 },
  },
  buccaneer_iii: {
    id: 'buccaneer_iii',
    // Damage TAPERS at the capstone (2026-07-04), same as Master Gunner III —
    // Buccaneer touches damage, so its final step shrinks too. Kept symmetric
    // (both halves) so it stays the balanced class.
    name: 'Buccaneer III',
    tagline: 'Better at everything. One last time.',
    description: 'A final, lighter lift across the board for the captain who never specialised. Stacks on your Buccaneer II.',
    bullets: [
      { label: '+3% damage', positive: true },
      { label: '+3% HP',     positive: true },
    ],
    color: '#9aa6b8',
    emoji: '⊕',
    effects: { damageMult: 1.03, hpMult: 1.03 },
  },

  // ── Chapter-4 AUGMENTS — the Last Fathom's either/or capstone. NOT part of
  //    SHIP_CLASS_LINES (never offered on a normal class pick); the
  //    chapter_4_augment node offers exactly these two via classPick.options.
  //    Pure gains, no tradeoff — the tradeoff IS the road not taken.
  armory_expansion: {
    id: 'armory_expansion',
    name: 'Expanded Armory',
    tagline: 'One more answer bolted to the deck.',
    description: 'Refit the hold for one more raid-item mount. Every fight, one more piece of gear working for you.',
    bullets: [
      { label: '+1 raid item slot', positive: true },
    ],
    color: '#a78bfa',
    // Text glyph, NOT ⚒ — U+2692 takes emoji presentation on iOS and the
    // class glyphs must stay monochrome typographic marks like ✦▣⟡⊕.
    emoji: '‡',
    effects: { itemSlots: 1 },
  },
  crew_quarters: {
    id: 'crew_quarters',
    name: 'Expanded Quarters',
    tagline: 'One more hammock below decks.',
    description: 'Your ship berths one more crew — raids AND voyages sail a body heavier.',
    bullets: [
      { label: '+1 crew slot', positive: true },
    ],
    color: '#7adf9a',
    // Text glyph, NOT ⚓ — U+2693 takes emoji presentation on iOS.
    emoji: '⌂',
    effects: { crewSlots: 1 },
  },
}

// Tier ladders, lowest → highest. A class_pick offers the LOWEST tier in each
// line the player doesn't already own — so an untouched line offers Mark I
// ("branch out") while a line you already sail offers its Mark II ("deepen").
// Add Mark III etc. here as later chapters extend each ladder.
export const SHIP_CLASS_LINES: ShipClassId[][] = [
  ['master_gunner', 'master_gunner_ii', 'master_gunner_iii'],
  ['ironside',      'ironside_ii',      'ironside_iii'],
  ['helmsman',      'helmsman_ii',      'helmsman_iii'],
  ['buccaneer',     'buccaneer_ii',     'buccaneer_iii'],
]

/** Which class each line offers next, given the player's existing picks. The
 *  tall-vs-wide engine: owned Mark I → its card becomes Mark II (deepen);
 *  untouched line → Mark I (branch). A fully-owned line drops off the menu. */
export function offeredShipClasses(picks: Record<string, string>): ShipClassDef[] {
  const owned = new Set(Object.values(picks))
  const out: ShipClassDef[] = []
  for (const line of SHIP_CLASS_LINES) {
    const next = line.find(id => !owned.has(id))
    if (next) out.push(SHIP_CLASSES[next])
  }
  return out
}

export function offeredShipClassIds(picks: Record<string, string>): ShipClassId[] {
  return offeredShipClasses(picks).map(c => c.id)
}

// ── THE REFIT ────────────────────────────────────────────────────────────────
// One lifetime re-choice of every class pick, earned by putting the don under.
// The picks are IDENTITY and they stay permanent by default; this is the single
// concession to the fact that the tradeoffs cannot be read until you have fought
// with them, and there is no other way to learn them.
//
// ALL OR NOTHING, and always in chapter order. A per-chapter reset would let a
// captain drop the Mark I out from under a Mark II they keep, which is a
// loadout offeredShipClasses would never hand out -- so a refit re-walks the
// whole ladder from the first chapter, exactly as it was walked the first time.

/** The chapters that carry a class pick, in the order they are played. Must
 *  match the classPick nodes in lib/raidMap.ts. */
export const SHIP_CLASS_CHAPTER_ORDER = ['thread', 'sunken_hand', 'the_coffers'] as const

/**
 * Price of a refit, given how many have already been taken. The first is free;
 * every one after it costs SHIP_REFIT_COST.
 *
 * It was one free refit and no more, which left a hole: mark_of_mastery wants a
 * Mark III, a Mark III wants all three picks in one line, and a captain who
 * spread their picks on the original AND on the refit could never reach one
 * again. That is not a missed badge, it is a permanently capped Achievement
 * Point total, and those gate cosmetics.
 *
 * So the door stays open and the price shuts it to anyone browsing. Flat rather
 * than escalating on purpose: a refit re-walks all three chapters at once, so
 * swapping between fights was never a strategy anyone could run even for free,
 * and escalation would only tax whoever experiments most.
 *
 * DOUBLOONS, never gems. The renown respec takes gems and that is precedent, but
 * a paid re-tune of your COMBAT build is pay-to-win by our own pillar.
 */
export const SHIP_REFIT_COST = 1_000_000
export function shipRefitCost(refitsUsed: number): number {
  return Math.max(0, Math.floor(refitsUsed)) === 0 ? 0 : SHIP_REFIT_COST
}

/**
 * Is this a loadout the picker itself could have produced?
 *
 * Walks the chapters in play order and asks the SAME question the class node
 * asks: is this id on the menu, given everything chosen before it. So a Mark II
 * still needs its Mark I, a line cannot be picked twice at the same tier, and a
 * chapter cannot be filled in that was never picked to begin with.
 *
 * `allowed` is the set of chapters the captain has actually reached. Anything
 * outside it is rejected rather than ignored, since this validates a payload
 * that arrived over the wire.
 */
export function validateClassPicks(
  next: Record<string, string>,
  allowed: string[],
): { ok: true } | { ok: false; error: string } {
  const allow = new Set(allowed)
  const keys = Object.keys(next)
  if (keys.length !== allow.size || keys.some(k => !allow.has(k))) {
    return { ok: false, error: 'That is not the set of chapters you have sailed.' }
  }
  const soFar: Record<string, string> = {}
  for (const chapter of SHIP_CLASS_CHAPTER_ORDER) {
    if (!allow.has(chapter)) continue
    const id = next[chapter]
    if (!(id in SHIP_CLASSES)) return { ok: false, error: 'Unknown class.' }
    if (!offeredShipClassIds(soFar).includes(id as ShipClassId)) {
      return { ok: false, error: `${SHIP_CLASSES[id as ShipClassId].name} is not on the menu at that point.` }
    }
    soFar[chapter] = id
  }
  return { ok: true }
}

export const SHIP_CLASS_LIST: ShipClassDef[] = [
  SHIP_CLASSES.master_gunner,
  SHIP_CLASSES.ironside,
  SHIP_CLASSES.helmsman,
  SHIP_CLASSES.buccaneer,
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
  /** Flat extra raid-item slots (Ch4 Expanded Armory augment). */
  itemSlots: number
  /** Flat extra crew slots, ship-wide (Ch4 Expanded Quarters augment). */
  crewSlots: number
  /** Number of class picks aggregated (useful for UI display). */
  count: number
}

export function aggregateShipClasses(picks: Record<string, ShipClassId | string>): AggregatedClassEffects {
  const out: AggregatedClassEffects = {
    damageMult:   1,
    hpMult:       1,
    speedFlat:    0,
    doubloonMult: 1,
    itemSlots:    0,
    crewSlots:    0,
    count:        0,
  }
  for (const classId of Object.values(picks)) {
    const cls = getShipClass(classId)
    if (!cls) continue
    out.damageMult   *= cls.effects.damageMult   ?? 1
    out.hpMult       *= cls.effects.hpMult       ?? 1
    out.speedFlat    += cls.effects.speedFlat    ?? 0
    out.doubloonMult *= cls.effects.doubloonMult ?? 1
    out.itemSlots    += cls.effects.itemSlots    ?? 0
    out.crewSlots    += cls.effects.crewSlots    ?? 0
    out.count        += 1
  }
  return out
}

/** Just the flat slot bonuses from the player's class picks (the Ch4
 *  augments). Null-tolerant so server actions can pass the raw jsonb column
 *  straight in without the full aggregate. */
export function classSlotBonuses(picks: Record<string, string> | null | undefined): { itemSlots: number; crewSlots: number } {
  if (!picks) return { itemSlots: 0, crewSlots: 0 }
  let itemSlots = 0, crewSlots = 0
  for (const classId of Object.values(picks)) {
    const cls = getShipClass(classId)
    itemSlots += cls?.effects.itemSlots ?? 0
    crewSlots += cls?.effects.crewSlots ?? 0
  }
  return { itemSlots, crewSlots }
}
