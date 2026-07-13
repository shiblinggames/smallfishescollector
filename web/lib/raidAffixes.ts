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
//   onThisEnemyDamagedPlayer  → Vampiric, Scorching (burn), Glacial (freeze)
//   onThisEnemyDodgesPlayer   → Riposte (reflect % of the shot you would've landed)
//
// Scorching / Glacial mirror the player's Incendiary / Frozen cannonballs onto
// the elite: a per-hit chance to set the PLAYER ablaze (DoT, same BURN_TURNS /
// BURN_TICK_PCT as the player's burn) or freeze them solid (lose their next
// turn). Handled in RaidCombat via playerBurnRef / playerFrozenRef.

export type AffixId =
  | 'ledger'
  | 'ironclad'
  | 'vampiric'
  | 'volatile'
  | 'fleet'
  | 'frenzied'
  | 'reflective'
  | 'resilient'
  | 'marksman'
  | 'scorching'
  | 'glacial'
  | 'riposte'
  | 'warded'
  | 'yawing'

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

  // ── Scorching — chance, each hit on the player, to set them ablaze ───
  // Mirrors the player's Incendiary Cannonball (DoT scaled to the hit).
  burnChance?:         number  // 0.20

  // ── Glacial — chance, each hit on the player, to freeze them ─────────
  // Mirrors the player's Frozen Cannonball (player loses their next turn).
  freezeChance?:       number  // 0.20

  // ── Riposte — when it dodges your shot, reflect this fraction of the
  //    damage you WOULD have dealt back onto you. Scales with the player's
  //    hit, so it punishes heavy hitters specifically. ──────────────────
  riposteReflectPct?:  number  // 0.50

  // ── Warded — starts each fight behind a barrier worth this fraction of its
  //    max HP that soaks your direct hits (not burn/DoT) before its hull. The
  //    Railgun's piercing Mega ignores it. ──────────────────────────────
  shieldPctMaxHp?:     number  // 0.30

  // ── Yawing — the TARGET band slides across the aim bar faster (never the
  //    needle). Multiplies the enemy's own zone drift, so an already-evasive
  //    hull becomes genuinely slippery. This is the aim-pressure affix: it
  //    attacks your read of WHERE to shoot, not your reaction speed, which is
  //    why it can be strong without becoming a coin flip the way a faster
  //    needle does (see the Racing Tide retune). ────────────────────────
  zoneSpeedMult?:      number  // 1.7
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  // ── THE LEDGER — the Quartermaster's Ghost, and his alone ────────────────
  // He is a dead quartermaster who never stopped holding what you left in the
  // Caches and what you melted down in the forge. So he FIGHTS WITH IT. Every
  // number below is one of the six Cache items he drops, turned around on you:
  //
  //   Incendiary Cannonball   -> burnChance     (he sets you alight)
  //   Frozen Cannonball       -> freezeChance   (he freezes you out of a turn)
  //   Gunner's Sight          -> critMult       (his crits double up)
  //   Reinforced Hull         -> shieldPctMaxHp (he comes in behind a barrier)
  //   Navigator's Compass     -> speedBonus     (he takes the first turn)
  //
  // The sixth, the Quartermaster's Anchor, is not an affix: it is his phase.
  // He takes a killing blow and refuses to sink, exactly like the item does for
  // you (see THE_QUARTERMASTERS_GHOST.phases in lib/bossRaids).
  //
  // The burn and freeze rates are the ITEMS' rates (15%), not the Scorching and
  // Glacial affixes' louder 20% — he is carrying your gear, not a monster's.
  //
  // NOT in ALL_AFFIX_IDS: this is authored onto one boss and must never turn up
  // on a random elite. See BESPOKE_AFFIX_IDS below.
  ledger: {
    id: 'ledger', name: 'The Ledger',
    description: 'He fights with everything he is still holding: your fire, your ice, your sights, your plating, your bearings. Take them back and he cannot use them on you again.',
    burnChance:      0.15,   // Incendiary Cannonball
    freezeChance:    0.15,   // Frozen Cannonball
    critMult:        2,      // Gunner's Sight
    shieldPctMaxHp:  0.15,   // Reinforced Hull
    speedBonus:      5,      // Navigator's Compass
  },
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
  scorching: {
    id: 'scorching', name: 'Scorching',
    description: '20% chance its shot sets you ablaze, burning for 2 turns.',
    burnChance: 0.20,
  },
  glacial: {
    id: 'glacial', name: 'Glacial',
    description: '20% chance its shot freezes you solid, costing your next turn.',
    freezeChance: 0.20,
  },
  riposte: {
    id: 'riposte', name: 'Riposte',
    description: 'When it dodges your shot, it turns 50% of that blow back on you.',
    riposteReflectPct: 0.50,
  },
  yawing: {
    id: 'yawing', name: 'Yawing',
    description: 'Never holds a line. Your target band slides across the aim bar far faster.',
    zoneSpeedMult: 1.7,
  },
  warded: {
    id: 'warded', name: 'Warded',
    description: 'Behind a barrier worth 30% of its hull that soaks your shots before its health. Break it first. (Burn bleeds through; the Railgun pierces it.)',
    shieldPctMaxHp: 0.30,
  },
}

/** Affixes authored onto ONE specific enemy as its signature. They live in AFFIXES
 *  so combat and the UI can resolve them like any other, but they are held out of
 *  the random pool: rolling "The Ledger" onto some anonymous elite would be
 *  nonsense, and would quietly hand it five effects at once. */
const BESPOKE_AFFIX_IDS = new Set<AffixId>(['ledger'])

export const ALL_AFFIX_IDS: AffixId[] =
  (Object.keys(AFFIXES) as AffixId[]).filter(id => !BESPOKE_AFFIX_IDS.has(id))

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

/** Roll an affix DISTINCT from `first` (for double-affix elites). */
export function rollSecondAffix(first: AffixId): AffixId {
  let id = rollAffix()
  for (let guard = 0; id === first && guard < 8; guard++) id = rollAffix()
  return id
}

/** Combine two distinct affixes into one. Each affix sets its OWN effect fields,
 *  so a shallow union carries both effects; only id/name/description overlap, and
 *  those are set explicitly (name/description concatenated). RaidCombat reads
 *  affix effects by field, so it needs no changes to handle a merged affix. */
export function mergeAffixes(a: AffixDef, b: AffixDef): AffixDef {
  return {
    ...a,
    ...b,
    id: a.id,
    name: `${a.name} + ${b.name}`,
    description: `${a.description} ${b.description}`,
  }
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
