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
  | 'foresight'     // Dole only — reveal the enemy's next move(s); refresh dodge

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
  dole:          'foresight',
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
  /** How many enemy turns the snare stays active. */
  disableDodgeTurns: number
  /** 0-1 chance to JAM each enemy dodge attempt while the snare is active. NOT
   *  a guaranteed lock (nerfed 2026-07-04 from always-100% rest-of-fight) — the
   *  enemy still slips through sometimes. */
  jamChance: number
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
  /** Executioner bonus: extra fraction of damage when the shell lands on a
   *  BOSS or ELITE (the leviathan hunts the biggest prey). 0.25 = +25%. */
  bossBonusPct?: number
  /** The flip side: the heavy shell is slightly WASTED on small fry — this
   *  fraction is shaved off vs a REGULAR hull (non-boss, non-elite). 0.15 =
   *  −15%. Together they make Leviathan the anti-big-target specialist. */
  mobPenaltyPct?: number
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
  /** Per-shot damage multiplier — each frenzy shot hits for this fraction of a
   *  normal cannon shot. Blitz's identity is MANY SMALL hits (vs Leviathan's
   *  one big one), so this stays below 1 while chainChance climbs. */
  shotDmgMult: number
  /** Lv 100: every shot in the chain lands as a guaranteed crit. */
  autoCrit?: boolean
  desc: string
}

export interface ForesightMilestone {
  unlockLevel: ClassMilestoneLevel
  /** How many of the enemy's UPCOMING moves are revealed (read straight off
   *  their attack pattern). 1 = just the next move. */
  revealMoves: number
  /** 0–1 chance to refresh the player's dodge — clears the one-turn dodge
   *  cooldown so a player who dodged last turn can dodge again right now. 0 at
   *  the early tiers (pure information), scaling up to a guaranteed refresh. */
  dodgeRefreshChance: number
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
//   - Sharpshot Lv 100: 4.5× crit zone for 3 shots — the gold zone reaches
//     ~90% of the hit width, so a clean hit almost always crits but never auto-
//     crits (aiming still matters). Retuned up then trimmed back 2026-06-17.
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
  blurb: 'Widens the gold crit zone on your next shots. By the top tiers, any clean hit crits.',
  color: '#fbbf24', emoji: '◎',
  // Base gold zone is thin (CRIT_W 0.012) vs the hit zone (HIT_W 0.06) — a 1:5
  // ratio. The old multipliers (0.5–3.0) left the buffed zone well under the
  // hit width at every tier, so the ability barely read as doing anything.
  // Retuned UP 2026-06-17 (players flagged it weak); then trimmed the top end
  // back the same day (Lv75 hitting the FULL hit width = "any clean hit crits"
  // was too strong). The zone now scales 2× → 4.5× the base, topping out at
  // ~90% of the hit width at Lv100 — a clean hit almost always crits, but it's
  // never a free auto-crit, so aiming still matters.
  milestones: [
    { unlockLevel: 10,  critZoneMultiplier: 1.0,  shotsBuffed: 1, desc: 'Next shot crit zone doubled.' },
    { unlockLevel: 25,  critZoneMultiplier: 1.75, shotsBuffed: 1, desc: 'Next shot crit zone nearly tripled.' },
    { unlockLevel: 40,  critZoneMultiplier: 2.5,  shotsBuffed: 2, desc: 'Next 2 shots crit zone 3.5× wider.' },
    { unlockLevel: 75,  critZoneMultiplier: 3.0,  shotsBuffed: 2, desc: 'Next 2 shots crit zone 4× wider.' },
    { unlockLevel: 100, critZoneMultiplier: 3.5,  shotsBuffed: 3, desc: 'Next 3 shots crit zone 4.5× wider — a clean hit almost always crits.' },
  ],
}

export const SNARE: ClassDef<SnareMilestone> = {
  id: 'snare', name: 'Snare', shortLabel: 'Jam Dodge',
  blurb: 'Disables the enemy\'s dodge for several turns. Always lands.',
  color: '#c084fc', emoji: '⚡',
  milestones: [
    { unlockLevel: 10,  jamChance: 0.30, disableDodgeTurns: 2, desc: '30% chance to jam enemy dodge for 2 turns.' },
    { unlockLevel: 25,  jamChance: 0.40, disableDodgeTurns: 2, desc: '40% chance to jam enemy dodge for 2 turns.' },
    { unlockLevel: 40,  jamChance: 0.48, disableDodgeTurns: 3, desc: '48% chance to jam enemy dodge for 3 turns.' },
    { unlockLevel: 75,  jamChance: 0.54, disableDodgeTurns: 4, desc: '54% chance to jam enemy dodge for 4 turns.' },
    { unlockLevel: 100, jamChance: 0.60, disableDodgeTurns: 5, desc: '60% chance to jam enemy dodge for 5 turns.' },
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
  id: 'abyssal_tide', name: 'Tidecaller', shortLabel: 'Tide',
  blurb: 'Heals the ship and grants a temporary damage shield. Heal now, brace for what\'s coming.',
  color: '#5eead4', emoji: '🌊',
  milestones: [
    { unlockLevel: 10,  pctMaxHp: 0.20, shieldPctMaxHp: 0.08, desc: 'Heal 20% max HP and grant an 8% max HP shield.' },
    { unlockLevel: 25,  pctMaxHp: 0.30, shieldPctMaxHp: 0.11, desc: 'Heal 30% max HP and grant an 11% max HP shield.' },
    { unlockLevel: 40,  pctMaxHp: 0.40, shieldPctMaxHp: 0.14, desc: 'Heal 40% max HP and grant a 14% max HP shield.' },
    { unlockLevel: 75,  pctMaxHp: 0.50, shieldPctMaxHp: 0.17, desc: 'Heal 50% max HP and grant a 17% max HP shield.' },
    { unlockLevel: 100, pctMaxHp: 0.60, shieldPctMaxHp: 0.20, cleanseDebuff: true, desc: 'Heal 60% max HP, grant a 20% max HP shield, and cleanse one enemy debuff.' },
  ],
}

export const LEVIATHAN: ClassDef<LeviathanMilestone> = {
  id: 'leviathan', name: 'Leviathan', shortLabel: 'Salvo',
  blurb: 'Fires one massive extra cannon shot — a single, ship-shaking knock. Made for big prey: slightly weaker against regular hulls, but it hits far harder against bosses and elites (and crits at the cap).',
  color: '#a3b1c6', emoji: '🐋',
  // The apex hunter of BIG prey: ONE reliable heavy shell, a bonus vs
  // bosses/elites and a small penalty vs regular hulls. The anti-big-target
  // counterpoint to Blitz's many-small-shots frenzy.
  milestones: [
    { unlockLevel: 10,  dmgMult: 0.85, mobPenaltyPct: 0.15, bossBonusPct: 0.15, desc: 'Fire 1 heavy shot at 85% damage. −15% vs regular hulls, +15% vs bosses and elites.' },
    { unlockLevel: 25,  dmgMult: 1.10, mobPenaltyPct: 0.15, bossBonusPct: 0.20, desc: 'Fire 1 heavy shot at 110% damage. −15% vs regular hulls, +20% vs bosses and elites.' },
    { unlockLevel: 40,  dmgMult: 1.40, mobPenaltyPct: 0.15, bossBonusPct: 0.25, desc: 'Fire 1 heavy shot at 140% damage. −15% vs regular hulls, +25% vs bosses and elites.' },
    { unlockLevel: 75,  dmgMult: 1.90, mobPenaltyPct: 0.15, bossBonusPct: 0.30, desc: 'Fire 1 heavy shot at 190% damage. −15% vs regular hulls, +30% vs bosses and elites.' },
    { unlockLevel: 100, dmgMult: 2.50, mobPenaltyPct: 0.15, bossBonusPct: 0.40, autoCrit: true, desc: 'Fire 1 heavy shot at 250% damage; guaranteed crit. −15% vs regular hulls, +40% vs bosses and elites.' },
  ],
}

export const BLITZ: ClassDef<BlitzMilestone> = {
  id: 'blitz', name: 'Apex', shortLabel: 'Frenzy',
  blurb: 'Unloads a rapid-fire frenzy — a burst of light shots that keeps chaining until a roll fails. Each shot is small, but a hot streak buries the enemy under a storm of them.',
  color: '#f87171', emoji: '⚡',
  // MANY SMALL hits — the opposite of Leviathan's one big knock. Higher chain
  // chance + a sub-1 per-shot mult, tuned so the expected total lands slightly
  // under Leviathan (Lv 100 ≈ 47 across ~3 shots vs one ~50 shell). Expected
  // shots = 1/(1-chainChance).
  milestones: [
    { unlockLevel: 10,  chainChance: 0.40, shotDmgMult: 0.65, desc: 'Fire a light shot at 65% damage. 40% chance to chain into another (repeats).' },
    { unlockLevel: 25,  chainChance: 0.48, shotDmgMult: 0.62, desc: 'Fire a light shot at 62% damage. 48% chance to chain into another (repeats).' },
    { unlockLevel: 40,  chainChance: 0.54, shotDmgMult: 0.60, desc: 'Fire a light shot at 60% damage. 54% chance to chain into another (repeats).' },
    { unlockLevel: 75,  chainChance: 0.62, shotDmgMult: 0.58, desc: 'Fire a light shot at 58% damage. 62% chance to chain into another (repeats).' },
    { unlockLevel: 100, chainChance: 0.70, shotDmgMult: 0.56, autoCrit: true, desc: 'Fire a light shot at 56% damage. 70% chance to chain into another (repeats). Every shot crits.' },
  ],
}

// Oracle (Dole only). Pure tactical utility: reveals the enemy's upcoming
// move(s) so the player can plan the perfect answer, and — at higher ranks —
// refreshes the dodge cooldown, so you can read an incoming shot and slip it
// even if you already dodged last turn. Information first, evasion on top.
export const FORESIGHT: ClassDef<ForesightMilestone> = {
  id: 'foresight', name: 'Oracle', shortLabel: 'Foresee',
  blurb: "Reveals the enemy's next moves. At higher ranks, refreshes your dodge so you can slip a shot you already spent your dodge on.",
  color: '#8b7bf0', emoji: '👁️',
  milestones: [
    { unlockLevel: 10,  revealMoves: 1, dodgeRefreshChance: 0,    desc: "See the enemy's next move." },
    { unlockLevel: 25,  revealMoves: 2, dodgeRefreshChance: 0,    desc: "See the enemy's next 2 moves." },
    { unlockLevel: 40,  revealMoves: 2, dodgeRefreshChance: 0.30, desc: "See the next 2 moves; 30% chance to refresh your dodge." },
    { unlockLevel: 75,  revealMoves: 3, dodgeRefreshChance: 0.50, desc: "See the next 3 moves; 50% chance to refresh your dodge." },
    { unlockLevel: 100, revealMoves: 3, dodgeRefreshChance: 1.00, desc: "See the next 3 moves and always refresh your dodge." },
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
  | (ClassDef<ForesightMilestone>   & { id: 'foresight' })

export const CLASSES: Record<CrewClass, AnyClassDef> = {
  mender:       MENDER       as AnyClassDef,
  sharpshot:    SHARPSHOT    as AnyClassDef,
  snare:        SNARE        as AnyClassDef,
  anchor:       ANCHOR       as AnyClassDef,
  navigator:    NAVIGATOR    as AnyClassDef,
  abyssal_tide: ABYSSAL_TIDE as AnyClassDef,
  leviathan:    LEVIATHAN    as AnyClassDef,
  blitz:        BLITZ        as AnyClassDef,
  foresight:    FORESIGHT    as AnyClassDef,
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
