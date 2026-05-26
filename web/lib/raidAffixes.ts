// Elite affix pool for challenge-mode raids. Each non-boss enemy slot in a
// challenge run has a chance to roll "elite" — same enemy art and base
// pattern, but with 2× HP, 1.5× damage, and ONE random affix from this
// pool. Affixes are naval-themed combat modifiers — Diablo-flavor in
// turn-based ship combat.
//
// Affixes are PURELY client-side per-run rolls (combat is client-driven).
// They don't persist; each fresh challenge attempt rolls fresh elites.
//
// Trigger points (each affix attaches to one) — match these names to the
// hook calls in RaidCombat.tsx:
//   onPlayerDamageThisEnemy   → Ironclad, Reflective
//   onThisEnemyDamagedPlayer  → Vampiric
//   onThisEnemyTurnStart      → Resilient
//   onThisEnemyDeath          → Volatile
//   onSpeedRoll               → Fleet
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
  /** Numeric payload the combat engine reads. Each affix attaches the
   *  right key; the others are absent. */
  damageTakenMult?: number    // ironclad   (0.7 = takes 30% less)
  lifestealPct?:    number    // vampiric   (0.20 = heals 20% of dmg dealt)
  deathBurnPct?:    number    // volatile   (0.15 = 15% of maxHP back to player on death)
  alwaysFastest?:   boolean   // fleet
  doubleFireChance?:number    // frenzied   (0.33 = 33% chance to fire twice)
  reflectPct?:      number    // reflective (0.15 = reflects 15% of dmg taken)
  turnStartHeal?:   number    // resilient  (4 HP per turn)
  critMult?:        number    // marksman   (2 = double crit chance)
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  ironclad: {
    id: 'ironclad', name: 'Ironclad',
    description: 'Plated hull soaks 30% off every shot you land.',
    damageTakenMult: 0.7,
  },
  vampiric: {
    id: 'vampiric', name: 'Vampiric',
    description: 'Heals for a fifth of every hit it lands on you.',
    lifestealPct: 0.20,
  },
  volatile: {
    id: 'volatile', name: 'Volatile',
    description: 'Goes up like a powder magazine on death, splashing you for 15% of its hull.',
    deathBurnPct: 0.15,
  },
  fleet: {
    id: 'fleet', name: 'Fleet',
    description: 'Always wins the wind. Acts before you on every turn.',
    alwaysFastest: true,
  },
  frenzied: {
    id: 'frenzied', name: 'Frenzied',
    description: 'When it pulls the trigger, one in three turns it fires again on the same breath.',
    doubleFireChance: 0.33,
  },
  reflective: {
    id: 'reflective', name: 'Reflective',
    description: 'Polished plating bounces 15% of your damage right back into your hull.',
    reflectPct: 0.15,
  },
  resilient: {
    id: 'resilient', name: 'Resilient',
    description: 'Patches 4 HP at the top of every one of its turns.',
    turnStartHeal: 4,
  },
  marksman: {
    id: 'marksman', name: 'Marksman',
    description: 'Doubles its odds of landing a crit on you.',
    critMult: 2,
  },
}

export const ALL_AFFIX_IDS: AffixId[] = Object.keys(AFFIXES) as AffixId[]

/** Elite multipliers on top of whatever the challenge-mode scaling already
 *  applied. So a Reef Raider in challenge mode has 1.3 × base HP; an
 *  ELITE Reef Raider has 1.3 × base × 1.5 HP. Damage multiplies the same
 *  way. The affix is the headline twist for an elite; these multipliers
 *  just nudge the bulk so the elite reads as harder, not as a brand-new
 *  enemy class. Dialed back from 2.0 / 1.5 → 1.5 / 1.25 on 2026-05-26
 *  after the stack on top of challenge-mode scaling was punishing
 *  (Reef Raider was hitting ~66 HP / 3-9 dmg, before the affix even
 *  fired). New combined ceiling for non-bosses in challenge: ~1.95× HP,
 *  ~1.44× dmg + affix. */
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
