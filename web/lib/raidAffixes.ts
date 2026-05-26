// Elite affix pool for challenge-mode raids. Each non-boss enemy slot in a
// challenge run has a chance to roll "elite" — same enemy art and base
// pattern, but with 1.5× HP, 1.25× damage, and ONE random affix from this
// pool. Affixes are naval-themed combat modifiers — Diablo-flavor in
// turn-based ship combat.
//
// Affixes are PURELY client-side per-run rolls (combat is client-driven).
// They don't persist; each fresh challenge attempt rolls fresh elites.
//
// Most affixes have a PER-EVENT CHANCE so the elite doesn't dominate every
// single turn. The Frenzied 33%-double-fire was the model and the rest
// (Ironclad / Vampiric / Reflective / Resilient) were retuned to match.
// Marksman is "always-on" because it's already a soft modifier (crit
// chance multiplier on an already-low base), and Volatile fires once
// per encounter (on death), so neither needs a per-event roll.
//
// Trigger points (each affix attaches to one) — match these names to the
// hook calls in RaidCombat.tsx:
//   onPlayerDamageThisEnemy   → Ironclad, Reflective
//   onThisEnemyDamagedPlayer  → Vampiric
//   onThisEnemyTurnStart      → Resilient
//   onThisEnemyDeath          → Volatile
//   onSpeedRoll               → Fleet  (speed bonus, not a guarantee)
//   onThisEnemyFire           → Frenzied
//   onCritRoll                → Marksman

export type AffixId =
  | 'ironclad'
  | 'vampiric'
  | 'volatile'
  | 'fleet'
  | 'frenzied'
  | 'reflective'
  | 'resilient'
  | 'marksman'

export interface AffixDef {
  id: AffixId
  name: string
  /** One-line description shown on the enemy stats popup. Pirate voice,
   *  no em-dashes (project copy voice rule). */
  description: string

  // ── Ironclad — 50% chance to soak 30% off a player hit ──────────────
  damageTakenMult?:    number  // 0.7 = takes 30% less
  damageTakenChance?:  number  // 0.5 = 50% per hit

  // ── Vampiric — 50% chance to lifesteal 20% of dealt damage ──────────
  lifestealPct?:       number  // 0.20
  lifestealChance?:    number  // 0.5

  // ── Volatile — wreck dishes 10% of YOUR remaining HP on death ───────
  // Scales to the player's current HP, capped so it can never kill.
  deathBurnRemainingPct?: number  // 0.10

  // ── Fleet — flat speed roll bonus (not a guaranteed first) ──────────
  speedBonus?:         number  // +N added to enemy's d20 + shipSpeed roll

  // ── Frenzied — 33% chance to fire again after a fire/volley ─────────
  doubleFireChance?:   number  // 0.33

  // ── Reflective — 50% chance to reflect 15% of player damage ─────────
  reflectPct?:         number  // 0.15
  reflectChance?:      number  // 0.5

  // ── Resilient — 33% chance to regen at turn start, floored at the base
  //    heal value with the % scaling kicking in on bigger-hull enemies ─
  turnStartHealBase?:   number  // 5 — minimum HP healed when the affix fires
  turnStartHealMaxPct?: number  // 0.05 — heals up to this fraction of maxHP if it exceeds the base
  turnStartHealChance?: number  // 0.33

  // ── Marksman — always-on crit chance multiplier ─────────────────────
  critMult?:           number  // 2 = doubles base crit chance
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  ironclad: {
    id: 'ironclad', name: 'Ironclad',
    description: '50% chance to soak 30% off your shot.',
    damageTakenMult: 0.7,
    damageTakenChance: 0.5,
  },
  vampiric: {
    id: 'vampiric', name: 'Vampiric',
    description: '50% chance to repair 20% of the damage it deals you.',
    lifestealPct: 0.20,
    lifestealChance: 0.5,
  },
  volatile: {
    id: 'volatile', name: 'Volatile',
    description: 'Wreck explodes on sinking for 10% of your current HP.',
    deathBurnRemainingPct: 0.10,
  },
  fleet: {
    id: 'fleet', name: 'Fleet',
    description: 'Heavy speed bonus. Usually acts before you each turn.',
    speedBonus: 5,
  },
  frenzied: {
    id: 'frenzied', name: 'Frenzied',
    description: '33% chance to fire twice in one turn.',
    doubleFireChance: 0.33,
  },
  reflective: {
    id: 'reflective', name: 'Reflective',
    description: '50% chance to reflect 15% of your damage back.',
    reflectPct: 0.15,
    reflectChance: 0.5,
  },
  resilient: {
    id: 'resilient', name: 'Resilient',
    description: '33% chance to repair 5 HP at the start of its turn.',
    turnStartHealBase: 5,
    turnStartHealMaxPct: 0.05,
    turnStartHealChance: 0.33,
  },
  marksman: {
    id: 'marksman', name: 'Marksman',
    description: 'Doubles its crit chance against you.',
    critMult: 2,
  },
}

export const ALL_AFFIX_IDS: AffixId[] = Object.keys(AFFIXES) as AffixId[]

/** Elite multipliers on top of whatever the challenge-mode scaling already
 *  applied. The affix is the headline twist for an elite; these multipliers
 *  just nudge the bulk so the elite reads as harder, not as a brand-new
 *  enemy class. Combined non-boss ceiling in challenge mode: ~1.95× HP,
 *  ~1.44× dmg + the affix. */
export const ELITE_HP_MULT  = 1.5
export const ELITE_DMG_MULT = 1.25

/** Pick a random affix from the pool. */
export function rollAffix(): AffixId {
  return ALL_AFFIX_IDS[Math.floor(Math.random() * ALL_AFFIX_IDS.length)]
}

/** Decide which non-boss slots in a challenge gauntlet become elites.
 *  Phase 2 rule: exactly 2 random non-boss slots per run get elite
 *  treatment, each with one rolled affix. Cap at the slot count to
 *  handle short sequences cleanly. */
export function rollEliteSlots(sequenceLength: number, eliteCount = 2): number[] {
  const target = Math.min(eliteCount, sequenceLength)
  const pool = Array.from({ length: sequenceLength }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < target; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out.sort((a, b) => a - b)
}
