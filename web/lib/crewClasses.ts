// Crew classes — species-locked, level-scaled active abilities surfaced in
// raid combat through the existing Special chooser.
//
// One class per species (every cards.slug maps to exactly one class). Each
// class has five tiers gated by crew level: 10 / 25 / 40 / 75 / 100. The
// crew unlocks their base ability at Lv 10; subsequent milestones widen,
// strengthen, or extend it.
//
// In-fight rules (enforced by RaidGame, not here):
//   - Each crew's ability is once-per-RAID (not per fight).
//   - At the raid's halfway point a Rest Stop interstitial clears the used
//     flag, so a crew can fire their ability twice across a full raid.
//   - Only one ability fires per turn across the whole party (after any
//     ability lands, all other ability cards grey out until the next turn).
//   - Abilities do NOT consume the player's cannon turn — they're free
//     actions on top of reload/fire/dodge.
//
// Doubling up is allowed (two Menders, two Sharpshots, etc.). All five v1
// classes have one-shot effects, so there's no "stacking" failure mode —
// the once-per-raid + once-per-turn rules naturally cap burst.

export type CrewClass =
  | 'mender' | 'sharpshot' | 'snare' | 'navigator' | 'anchor'
  // ── Legendary signature classes ─────────────────────────────────────
  // One-species-only classes that replace the generic class for that
  // legendary crew. Each is a deliberately unique ability shape, not a
  // stronger version of an existing class — Catfish doesn't share the
  // Mender pool anymore, Doby doesn't share Anchor, Mako is new.
  | 'abyssal_tide'  // Catfish only — heal + shield combo
  | 'leviathan'     // Doby Mick only — flat damage scaling with crew Power
  | 'blitz'         // Mako only — extra cannon shots this turn

// ── Species → class map ────────────────────────────────────────────────────
// Keyed by lower-cased cards.slug so callers can do `CLASS_BY_SLUG[slug.toLowerCase()]`.
// Distribution: ~7 species per class for a balanced recruit pool. Identity
// pairings: Catfish = Mender (Cat the Mender), Swordfish = Sharpshot, Eel =
// Snare, Oarfish = Navigator, Doby Mick = Anchor.
export const CLASS_BY_SLUG: Record<string, CrewClass> = {
  // ── Mender (Healer) — gentle, supportive, restorative ──
  clownfish:     'mender',
  koi:           'mender',
  blobfish:      'mender',
  goldfish:      'mender',
  angelfish:     'mender',
  minnow:        'mender',

  // ── Sharpshot (Gunner) — speed + bite, the shooters of the sea ──
  swordfish:         'sharpshot',
  sailfish:          'sharpshot',
  blue_marlin:       'sharpshot',
  great_white_shark: 'sharpshot',
  tiger_shark:       'sharpshot',
  hammerhead_shark:  'sharpshot',
  goblin_shark:      'sharpshot',
  tuna:              'sharpshot',

  // ── Snare (Saboteur) — venom, electric, ambush, swarm ──
  eel:           'snare',
  anglerfish:    'snare',
  lionfish:      'snare',
  pufferfish:    'snare',
  piranha:       'snare',
  giant_squid:   'snare',
  krill:         'snare',
  flounder:      'snare',

  // ── Navigator (Tactician) — wise, planning, far-seeing ──
  oarfish:       'navigator',
  orca:          'navigator',
  sardine:       'navigator',
  salmon:        'navigator',
  beluga_whale:  'navigator',
  manta_ray:     'navigator',

  // ── Anchor (Bulwark) — mass + soak, the walls ──
  humpback_whale: 'anchor',
  blue_whale:     'anchor',
  whale_shark:    'anchor',
  nurse_shark:    'anchor',
  bass:           'anchor',
  red_snapper:    'anchor',

  // ── Legendary signature classes — species-locked, one-of-one ──
  // These three are the only tier-3 legendary species; each gets its own
  // unique ability (not a stronger version of a base class). They used
  // to share Mender / Anchor with non-legendaries; the move out of those
  // pools is the design intent — legendaries should feel singular.
  catfish:       'abyssal_tide',
  doby_mick:     'leviathan',
  mako:          'blitz',
}

/** Resolve a species slug to its class. Slugs in cards.slug are Title_Case;
 *  this normalises before lookup. Returns null if unmapped (newly-added
 *  species, or a non-crew card). */
export function classForSlug(slug: string | null | undefined): CrewClass | null {
  if (!slug) return null
  return CLASS_BY_SLUG[slug.toLowerCase()] ?? null
}

// ── Milestone schedule ──────────────────────────────────────────────────────
export const CLASS_MILESTONE_LEVELS = [10, 25, 40, 75, 100] as const
export type ClassMilestoneLevel = typeof CLASS_MILESTONE_LEVELS[number]

// ── Per-class typed milestones ─────────────────────────────────────────────
// Each class has 5 tiers in unlock-order. The discriminated union lets the
// combat handler dispatch on `def.id` then read its own shape with full
// type safety — no `any`-typed effect bag.

export interface MenderMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Fraction of max HP healed, 0–1. */
  pctMaxHp: number
  /** Lv 100: also strips one enemy-applied debuff currently on the player. */
  cleanseDebuff?: boolean
  desc: string
}

export interface SharpshotMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Multiply the crit zone half-width by `1 + critZoneMultiplier`. So 0.5
   *  = 50% wider, 3.0 = 4× wider. Player still has to land the shot. */
  critZoneMultiplier: number
  /** How many of the player's NEXT shots get the wider zone before the buff
   *  is consumed. 1 = the first manually-fired shot. */
  shotsBuffed: number
  desc: string
}

export interface SnareMilestone {
  unlockLevel: ClassMilestoneLevel
  /** How many enemy turns enemy dodge is disabled. 'rest_of_fight' caps it
   *  at the end of the current encounter. Always 100% success. */
  disableDodgeTurns: number | 'rest_of_fight'
  desc: string
}

export interface AnchorMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Fraction of the next incoming hit's damage that's absorbed, 0–1. */
  pctReduction: number
  /** Lv 100: applies the reduction even if the incoming hit is a crit (crits
   *  normally bypass some defensive systems). */
  absorbsCrits?: boolean
  desc: string
}

export interface NavigatorMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Probability of granting +1 charge, 0–1. */
  oneChargeChance: number
  /** Probability of granting +2 charges instead of +1 (rolled separately).
   *  If both rolls succeed, the +2 wins. */
  twoChargeChance: number
  desc: string
}

// ── Legendary milestone shapes ──────────────────────────────────────────────

export interface AbyssalTideMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Fraction of max HP healed, 0–1. */
  pctMaxHp: number
  /** Damage-absorbing shield granted to the ship, expressed as fraction of
   *  max HP. The shield buffer takes hits before HP does and persists
   *  until consumed or the encounter ends. */
  shieldPctMaxHp: number
  /** Lv 100: also strips one enemy-applied debuff currently on the player. */
  cleanseDebuff?: boolean
  desc: string
}

export interface LeviathanMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Damage multiplier on the single extra cannon shot, relative to a
   *  normal hit's damage profile. 0.5 = half damage; 2.0 = double. */
  dmgMult: number
  /** Lv 100: the extra shot lands as a guaranteed crit. */
  autoCrit?: boolean
  desc: string
}

export interface BlitzMilestone {
  unlockLevel: ClassMilestoneLevel
  /** Probability (0–1) that each landed shot will chain into another.
   *  First shot is guaranteed; the chain ends on the first failed roll
   *  (or a 10-shot hard cap, to keep pathological streaks bounded). */
  chainChance: number
  /** Lv 100: every shot in the chain lands as a guaranteed crit. */
  autoCrit?: boolean
  desc: string
}

export interface ClassDef<M> {
  id: CrewClass
  name: string                 // "Mender"
  shortLabel: string           // "Heal" — used as the Special chooser card title
  blurb: string                // one-line identity, for the detail modal
  color: string                // accent / icon tint
  emoji: string                // chooser card emoji
  milestones: [M, M, M, M, M]
}

// ── Class registry ──────────────────────────────────────────────────────────
//
// Tuning targets (910 XP/Krust raid, 2 ability uses per raid post rest-stop):
//   - Mender Lv 100: 60% HP heal × 2 uses = 120% HP. Enough to fully restore
//     between rest stops; deliberately caps below "immortal heal".
//   - Sharpshot Lv 100: 4× crit zone for 3 shots. Doesn't guarantee crits
//     (player still has to aim), but enormously rewards careful shooting.
//   - Snare Lv 100: full-fight dodge lock. Removes the boss's defensive
//     option for a single encounter — earned victory.
//   - Anchor Lv 100: 95% damage reduction on next hit. Practically full
//     block, but slightly imperfect by design.
//   - Navigator Lv 100: 100% chance of +2 charges. Reliable burst setup.

export const MENDER: ClassDef<MenderMilestone> = {
  id: 'mender', name: 'Mender', shortLabel: 'Heal',
  blurb: 'Restores ship HP. Pure sustain.',
  color: '#4ade80', emoji: '✚',
  milestones: [
    { unlockLevel: 10,  pctMaxHp: 0.15, desc: 'Heal 15% max HP.' },
    { unlockLevel: 25,  pctMaxHp: 0.25, desc: 'Heal 25% max HP.' },
    { unlockLevel: 40,  pctMaxHp: 0.35, desc: 'Heal 35% max HP.' },
    { unlockLevel: 75,  pctMaxHp: 0.50, desc: 'Heal 50% max HP.' },
    { unlockLevel: 100, pctMaxHp: 0.60, cleanseDebuff: true, desc: 'Heal 60% max HP and cleanse one enemy debuff.' },
  ],
}

export const SHARPSHOT: ClassDef<SharpshotMilestone> = {
  id: 'sharpshot', name: 'Sharpshot', shortLabel: 'Steady Aim',
  blurb: 'Widens the crit zone of your next manually-landed shot. You still have to aim.',
  color: '#fbbf24', emoji: '◎',
  milestones: [
    { unlockLevel: 10,  critZoneMultiplier: 0.5, shotsBuffed: 1, desc: 'Next shot crit zone +50% wider.' },
    { unlockLevel: 25,  critZoneMultiplier: 1.0, shotsBuffed: 1, desc: 'Next shot crit zone doubled.' },
    { unlockLevel: 40,  critZoneMultiplier: 1.5, shotsBuffed: 1, desc: 'Next shot crit zone 2.5× wider.' },
    { unlockLevel: 75,  critZoneMultiplier: 2.0, shotsBuffed: 2, desc: 'Next 2 shots crit zone 3× wider.' },
    { unlockLevel: 100, critZoneMultiplier: 3.0, shotsBuffed: 3, desc: 'Next 3 shots crit zone 4× wider.' },
  ],
}

export const SNARE: ClassDef<SnareMilestone> = {
  id: 'snare', name: 'Snare', shortLabel: 'Jam Dodge',
  blurb: 'Disables the enemy\'s dodge for several turns. Always lands.',
  color: '#c084fc', emoji: '⚡',
  milestones: [
    { unlockLevel: 10,  disableDodgeTurns: 1,                desc: 'Disable enemy dodge for 1 turn.' },
    { unlockLevel: 25,  disableDodgeTurns: 2,                desc: 'Disable enemy dodge for 2 turns.' },
    { unlockLevel: 40,  disableDodgeTurns: 3,                desc: 'Disable enemy dodge for 3 turns.' },
    { unlockLevel: 75,  disableDodgeTurns: 4,                desc: 'Disable enemy dodge for 4 turns.' },
    { unlockLevel: 100, disableDodgeTurns: 'rest_of_fight',  desc: 'Disable enemy dodge for the rest of this fight.' },
  ],
}

export const ANCHOR: ClassDef<AnchorMilestone> = {
  id: 'anchor', name: 'Anchor', shortLabel: 'Brace',
  blurb: 'Absorbs a portion of the next incoming hit. Dependable wall, not a coin flip.',
  color: '#38bdf8', emoji: '⛨',
  milestones: [
    { unlockLevel: 10,  pctReduction: 0.30, desc: 'Reduce next incoming hit by 30%.' },
    { unlockLevel: 25,  pctReduction: 0.45, desc: 'Reduce next incoming hit by 45%.' },
    { unlockLevel: 40,  pctReduction: 0.60, desc: 'Reduce next incoming hit by 60%.' },
    { unlockLevel: 75,  pctReduction: 0.80, desc: 'Reduce next incoming hit by 80%.' },
    { unlockLevel: 100, pctReduction: 0.95, absorbsCrits: true, desc: 'Reduce next incoming hit by 95% (even crits).' },
  ],
}

export const NAVIGATOR: ClassDef<NavigatorMilestone> = {
  id: 'navigator', name: 'Navigator', shortLabel: 'Reload',
  blurb: 'Chance to grant the player a charge instantly. Better odds at higher levels.',
  color: '#a8b8d0', emoji: '◈',
  milestones: [
    { unlockLevel: 10,  oneChargeChance: 0.40, twoChargeChance: 0,    desc: '40% chance to gain +1 charge.' },
    { unlockLevel: 25,  oneChargeChance: 0.60, twoChargeChance: 0,    desc: '60% chance to gain +1 charge.' },
    { unlockLevel: 40,  oneChargeChance: 0.80, twoChargeChance: 0,    desc: '80% chance to gain +1 charge.' },
    { unlockLevel: 75,  oneChargeChance: 1.00, twoChargeChance: 0.30, desc: 'Always gain +1 charge. 30% chance for +2.' },
    { unlockLevel: 100, oneChargeChance: 1.00, twoChargeChance: 1.00, desc: 'Always gain +2 charges.' },
  ],
}

// ── Legendary signature classes ─────────────────────────────────────────────
// Tuning context: legendary classes do NOT obsolete the base 5. They're
// flavored alternates with bigger numbers in their slot — Abyssal Tide
// = Mender that also shields, Leviathan = a brand-new offensive burst
// shaped around crew Power, Blitz = brand-new multi-shot.

export const ABYSSAL_TIDE: ClassDef<AbyssalTideMilestone> = {
  id: 'abyssal_tide', name: 'Abyssal Tide', shortLabel: 'Tide',
  blurb: 'Heals the ship and grants a temporary damage shield. Heal now, brace for what\'s coming.',
  color: '#5eead4', emoji: '🌊',
  milestones: [
    { unlockLevel: 10,  pctMaxHp: 0.20, shieldPctMaxHp: 0.10, desc: 'Heal 20% max HP and grant a 10% max HP shield.' },
    { unlockLevel: 25,  pctMaxHp: 0.30, shieldPctMaxHp: 0.15, desc: 'Heal 30% max HP and grant a 15% max HP shield.' },
    { unlockLevel: 40,  pctMaxHp: 0.40, shieldPctMaxHp: 0.20, desc: 'Heal 40% max HP and grant a 20% max HP shield.' },
    { unlockLevel: 75,  pctMaxHp: 0.50, shieldPctMaxHp: 0.25, desc: 'Heal 50% max HP and grant a 25% max HP shield.' },
    { unlockLevel: 100, pctMaxHp: 0.60, shieldPctMaxHp: 0.30, cleanseDebuff: true, desc: 'Heal 60% max HP, grant a 30% max HP shield, and cleanse one enemy debuff.' },
  ],
}

export const LEVIATHAN: ClassDef<LeviathanMilestone> = {
  id: 'leviathan', name: 'Heavy Salvo', shortLabel: 'Salvo',
  blurb: 'Fires one massive extra cannon shot. Damage scales hard with rank — at the capstone, a single shell hits twice as hard as a normal one.',
  color: '#a3b1c6', emoji: '🐋',
  milestones: [
    { unlockLevel: 10,  dmgMult: 0.50, desc: 'Fire 1 extra cannon shot at 50% damage.' },
    { unlockLevel: 25,  dmgMult: 0.75, desc: 'Fire 1 extra cannon shot at 75% damage.' },
    { unlockLevel: 40,  dmgMult: 1.00, desc: 'Fire 1 extra cannon shot at full damage.' },
    { unlockLevel: 75,  dmgMult: 1.50, desc: 'Fire 1 extra cannon shot at 150% damage.' },
    { unlockLevel: 100, dmgMult: 2.00, autoCrit: true, desc: 'Fire 1 extra cannon shot at 200% damage; guaranteed crit.' },
  ],
}

export const BLITZ: ClassDef<BlitzMilestone> = {
  id: 'blitz', name: 'Frenzy', shortLabel: 'Frenzy',
  blurb: 'Fires a cannon shot, then rolls to chain into another, and another. Stops when the roll fails.',
  color: '#f87171', emoji: '⚡',
  // Tuned to land slightly under Doby's Heavy Salvo at the relevant
  // tiers — at Lv 100, expected damage ≈ 46 vs Doby's flat ~50, with the
  // 1-shot floor meaning Mako still beats Doby's Lv 10/25 from the
  // guaranteed first hit alone. Damage estimates: expected shots =
  // 1/(1-chainChance), × ~12 hit damage (or × ~25 at the auto-crit
  // capstone). See class-balance discussion in commit history.
  milestones: [
    { unlockLevel: 10,  chainChance: 0.15, desc: 'Fire a cannon shot. 15% chance to chain into another (repeats).' },
    { unlockLevel: 25,  chainChance: 0.25, desc: 'Fire a cannon shot. 25% chance to chain into another (repeats).' },
    { unlockLevel: 40,  chainChance: 0.30, desc: 'Fire a cannon shot. 30% chance to chain into another (repeats).' },
    { unlockLevel: 75,  chainChance: 0.40, desc: 'Fire a cannon shot. 40% chance to chain into another (repeats).' },
    { unlockLevel: 100, chainChance: 0.45, autoCrit: true, desc: 'Fire a cannon shot. 45% chance to chain into another (repeats). Every shot crits.' },
  ],
}

// ── Registry lookup ─────────────────────────────────────────────────────────
// Union the class defs through a discriminated wrapper so callers can switch
// on `.id` and TypeScript narrows the milestones to the right shape.

export type AnyClassDef =
  | (ClassDef<MenderMilestone>     & { id: 'mender' })
  | (ClassDef<SharpshotMilestone>  & { id: 'sharpshot' })
  | (ClassDef<SnareMilestone>      & { id: 'snare' })
  | (ClassDef<AnchorMilestone>     & { id: 'anchor' })
  | (ClassDef<NavigatorMilestone>  & { id: 'navigator' })
  | (ClassDef<AbyssalTideMilestone> & { id: 'abyssal_tide' })
  | (ClassDef<LeviathanMilestone>   & { id: 'leviathan' })
  | (ClassDef<BlitzMilestone>       & { id: 'blitz' })

export const CLASSES: Record<CrewClass, AnyClassDef> = {
  mender:       MENDER       as AnyClassDef,
  sharpshot:    SHARPSHOT    as AnyClassDef,
  snare:        SNARE        as AnyClassDef,
  anchor:       ANCHOR       as AnyClassDef,
  navigator:    NAVIGATOR    as AnyClassDef,
  abyssal_tide: ABYSSAL_TIDE as AnyClassDef,
  leviathan:    LEVIATHAN    as AnyClassDef,
  blitz:        BLITZ        as AnyClassDef,
}

/** Highest-tier milestone unlocked by a crew at this level. Returns null if
 *  the crew is below Lv 10 (no ability yet — chooser card reads "Unlocks at
 *  Lv 10" and is disabled). */
export function currentMilestone<T extends AnyClassDef>(def: T, level: number): T['milestones'][number] | null {
  let active: T['milestones'][number] | null = null
  for (const m of def.milestones) {
    if (level >= m.unlockLevel) active = m
    else break
  }
  return active
}

/** Next milestone the crew is working toward, for the detail modal's
 *  "Next: Lv 25 — Heal 25%" preview line. Returns null if the crew is at the
 *  Lv 100 capstone. */
export function nextMilestone<T extends AnyClassDef>(def: T, level: number): T['milestones'][number] | null {
  for (const m of def.milestones) {
    if (level < m.unlockLevel) return m
  }
  return null
}

/** Level at which the crew first gets an ability — currently always 10, but
 *  exposed so the UI can read it from one place instead of hardcoding. */
export const CLASS_UNLOCK_LEVEL = 10
