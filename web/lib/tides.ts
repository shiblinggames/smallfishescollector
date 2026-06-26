// ──────────────────────────────────────────────────────────────────────────
// Tides — mid-raid roguelike event interrupts.
// ──────────────────────────────────────────────────────────────────────────
// A raid declares a couple of slots (between-fight encounter indices) +
// a max tier. At raid start, N tides are drawn at random from TIDE_POOL
// filtered to tier <= maxTier (no repeats within a run). After fight N
// where slots includes N, the modal fires; the player picks a choice;
// its effects are added to the run's active effects array. Effects are
// run-scoped (cleared on raid end / retry / leave).
//
// The Cartographer's raid is the first to use Tides; future longer raids declare
// higher maxTier to pull in stronger effects. Numbers scale per tier
// (philosophy A: same effect kinds throughout, just bigger numbers).
//
// IMPORTANT: every effect kind here must also be applied somewhere in
// the combat path (RaidCombat / RaidGame). Adding a new kind is two
// things: (1) extend the TideEffect union, (2) wire it into the matching
// roll / HP / charge path.
//
// COPY CONVENTIONS (audited 2026-06-06):
//   - Choice descriptions are plain English: benefit first, then cost
//     in a second sentence. Numbers always explicit, no jargon.
//   - "cannonballs" everywhere (not "charges" or "shots").
//   - Scopes: "next fight" / "boss fight" / "all run". Never "for one
//     upcoming fight" or "on the next fight" (inconsistent).
//   - HP changes phrased "+N HP" / "-N HP" / "starts with N less HP",
//     never "at -N HP" (ambiguous — looks like a total).
//   - Effect chips (describeEffect) mirror the description's vocab.

/** Discrete effect kinds. Each carries the data needed to apply it.
 *  Some are run-scoped, some are one-fight, some are one-shot tokens.
 *  Scope is baked into the kind name or noted in a `scope` field.   */
export type TideEffect =
  // ── Broad outgoing damage ────────────────────────────────────────
  /** Multiplier on EVERY outgoing damage roll (fire AND volley). */
  | { kind: 'damageMult'; mult: number }
  // ── Per-action damage (more flavorful than broad damageMult) ────
  /** Fire damage only — does NOT affect volleys. Encourages reload-fire-reload. */
  | { kind: 'fireDmgMult'; mult: number }
  /** Volley damage only — does NOT affect base fire. Rewards volley-saving. */
  | { kind: 'volleyDmgMult'; mult: number }
  // ── Crit-specific ───────────────────────────────────────────────
  /** Flat % bonus to player crit chance. Aim bar UNAFFECTED visually;
   *  the bonus is rolled into the post-lock outcome math. */
  | { kind: 'critChanceBonus'; chance: number }
  /** Widens the gold critical zone on the aim bar (visual + math). */
  | { kind: 'critZoneScale'; mult: number }
  /** Critical hits deal mult× more damage (stacks with the Gunner's Sight item). */
  | { kind: 'critDmgMult'; mult: number }
  // ── Aim-bar disruptors (visual + feel) — Gauntlet curses lean on these.
  /** Drifting fog band over the aim bar (0-1 density), like the Mist Veil. */
  | { kind: 'aimFog'; density: number }
  /** Multiplier on the aim NEEDLE sweep speed (>1 = faster, harder to time). */
  | { kind: 'aimSpeedMult'; mult: number }
  /** Multiplier on the target-ZONE drift speed (>1 = the band lurches more). */
  | { kind: 'zoneSpeedMult'; mult: number }
  // ── Incoming damage / mitigation ────────────────────────────────
  /** Multiplier on incoming damage rolls. <1 = mitigation. */
  | { kind: 'incomingDmgMult'; mult: number; scope: 'nextFight' | 'allRemaining' }
  /** Reduces enemy crit-chance against the player. */
  | { kind: 'incomingCritReduction'; chance: number }
  // ── HP — instant + per-fight ────────────────────────────────────
  /** Apply RIGHT NOW (modal-time): heal +N HP (clamped to max). */
  | { kind: 'instantHeal'; n: number }
  /** Apply right now: full HP restore to max. */
  | { kind: 'fullHeal' }
  /** Delta applied at the START of the next fight (negative = wound). */
  | { kind: 'startHpDelta'; n: number; scope: 'nextFight' | 'boss' }
  /** Passive heal at the START of each REMAINING fight. */
  | { kind: 'startOfFightHeal'; n: number }
  // ── Charges (cannonballs) ───────────────────────────────────────
  /** Extra charges at the START of fights. scope=allRemaining for run,
   *  oneFight for a single upcoming encounter.
   *  Sentinel: n <= -10 means "set to 0 for that fight" (clamped on
   *  apply). describeEffect renders this as "Start with 0 cannonballs". */
  | { kind: 'startCharges'; n: number; scope: 'nextFight' | 'allRemaining' }
  /** % chance per reload to gain +bonus extra cannonballs (procs feel cool). */
  | { kind: 'reloadProc'; chance: number; bonusCharges: number }
  // ── Dodge / speed ───────────────────────────────────────────────
  /** +X% to player dodge rolls. */
  | { kind: 'dodgeBonus'; chance: number; scope: 'nextFight' | 'allRemaining' }
  /** Bonus successful dodges (no roll needed) usable on upcoming turns. */
  | { kind: 'guaranteedDodge'; n: number }
  /** +/- player ship speed for turn order + aim-bar speed.
   *  `_fights` is a runtime countdown for the next2Fights scope (set by
   *  expireAfterFight); leave it unset in the pool. */
  | { kind: 'speedDelta'; n: number; scope: 'next2Fights' | 'allRemaining'; _fights?: number }
  // ── Boss-specific ───────────────────────────────────────────────
  /** Player damage multiplier vs the boss only. */
  | { kind: 'bossDamageMult'; mult: number }
  /** Volley damage multiplier vs the boss only. */
  | { kind: 'bossVolleyDmgMult'; mult: number }
  // ── Enemy-side effects (next fight) ─────────────────────────────
  /** Scales next enemy's max HP. <1 = weakened. Applied once. */
  | { kind: 'enemyHpScale'; mult: number; scope: 'nextFight' }
  /** Next enemy starts with N fewer cannonballs (clamped to 0). */
  | { kind: 'enemyStartChargesDelta'; n: number; scope: 'nextFight' }
  // ── Legendary one-of-a-kind effects (Gauntlet boons) ────────────
  /** Instantly sink an enemy the moment its HP drops to <= pct of its max. */
  | { kind: 'executeThreshold'; pct: number }
  /** Heal the player for pct of the damage they deal. */
  | { kind: 'lifestealPct'; pct: number }
  /** Reflect pct of the damage an enemy lands on you back into it (thorns). */
  | { kind: 'retaliatePct'; pct: number }
  /** Bonus damage that scales with MISSING HP. `maxBonus` is the damage bonus
   *  at 0 HP (e.g. 0.45 = up to +45%); it tapers linearly to 0 at full HP. */
  | { kind: 'lowHpDamage'; maxBonus: number }
  /** Carry unfired cannonballs into the next fight, up to `cap` (99 = carry
   *  all, still capped at magazine size). Gauntlet host plumbing. */
  | { kind: 'chargeCarryover'; cap: number }
  /** Start every fight with a damage-absorbing shield worth `pctMax` of max HP;
   *  it soaks incoming hits before the hull does and reforms each fight. */
  | { kind: 'fightShield'; pctMax: number }
  // ── Meta (post-raid only) ───────────────────────────────────────
  /** Doubloons granted / deducted at raid end. */
  | { kind: 'doubloonsAtRaidEnd'; n: number }

// Drop the one-shot ("next enemy" / next-fight) tide effects once a fight
// resolves. Boss-scope and allRemaining effects survive (they expire at the
// boss fight / raid end). EVERY tide host must run this after each fight, or
// a "next enemy" effect (e.g. enemyHpScale, the half-health tide) silently
// persists for the rest of the run. Centralized so RaidGame and GauntletGame
// can't drift on which effects are one-shot.
export function expireAfterFight(effects: TideEffect[]): TideEffect[] {
  return effects.flatMap<TideEffect>(e => {
    if (e.kind === 'enemyHpScale')                                return []
    if (e.kind === 'enemyStartChargesDelta')                      return []
    if (e.kind === 'guaranteedDodge')                             return []
    if (e.kind === 'startCharges'    && e.scope === 'nextFight')  return []
    if (e.kind === 'startHpDelta'    && e.scope === 'nextFight')  return []
    if (e.kind === 'incomingDmgMult' && e.scope === 'nextFight')  return []
    if (e.kind === 'dodgeBonus'      && e.scope === 'nextFight')  return []
    // speedDelta "next 2 fights" is a real 2-fight window: tick a countdown
    // (defaults to 2) and only drop it once both fights have passed.
    if (e.kind === 'speedDelta'      && e.scope === 'next2Fights') {
      const left = (e._fights ?? 2) - 1
      return left > 0 ? [{ ...e, _fights: left }] : []
    }
    return [e]
  })
}

// Is an effect a boon, a cost, or neutral? Drives the buff/cost coloring on
// the tide picker chips so a trade reads at a glance. Lives here (next to
// describeEffect) so any surface that lists effects can color them the same.
export function effectTone(e: TideEffect): 'good' | 'bad' | 'neutral' {
  switch (e.kind) {
    case 'damageMult': case 'fireDmgMult': case 'volleyDmgMult':
    case 'bossDamageMult': case 'bossVolleyDmgMult': case 'critZoneScale':
    case 'critDmgMult':
      return e.mult > 1 ? 'good' : e.mult < 1 ? 'bad' : 'neutral'
    case 'executeThreshold': case 'lifestealPct': case 'retaliatePct':
      return e.pct > 0 ? 'good' : 'neutral'
    case 'lowHpDamage':  return e.maxBonus > 0 ? 'good' : 'neutral'
    case 'fightShield':  return e.pctMax > 0 ? 'good' : 'neutral'
    case 'chargeCarryover': return 'good'
    case 'incomingDmgMult':
    case 'enemyHpScale':
      return e.mult < 1 ? 'good' : e.mult > 1 ? 'bad' : 'neutral'
    case 'critChanceBonus': case 'incomingCritReduction': case 'dodgeBonus':
      return e.chance > 0 ? 'good' : e.chance < 0 ? 'bad' : 'neutral'
    case 'instantHeal': case 'startOfFightHeal':
    case 'startHpDelta': case 'speedDelta': case 'doubloonsAtRaidEnd':
      return e.n > 0 ? 'good' : e.n < 0 ? 'bad' : 'neutral'
    case 'fullHeal': case 'guaranteedDodge': case 'reloadProc':
      return 'good'
    case 'startCharges':
      return e.n > 0 ? 'good' : 'bad' // n <= 0 (incl. the NO_CHARGES sentinel) is a downside
    case 'enemyStartChargesDelta':
      return e.n < 0 ? 'good' : e.n > 0 ? 'bad' : 'neutral'
    case 'aimFog':       return e.density > 0 ? 'bad' : 'neutral'
    case 'aimSpeedMult': return e.mult > 1 ? 'bad' : e.mult < 1 ? 'good' : 'neutral'
    case 'zoneSpeedMult':return e.mult > 1 ? 'bad' : e.mult < 1 ? 'good' : 'neutral'
    default:
      return 'neutral'
  }
}

export interface TideChoice {
  /** Stable id for analytics / Ledger ordering. */
  id: string
  label: string
  /** Short, plain-English card body: benefit first, then cost. Numbers
   *  explicit. Effect chips render below the description with the
   *  precise mechanic; description sets the trade in plain words so a
   *  player who doesn't scan chips still understands. */
  description: string
  /** Effects fired in order on pick. Can be empty (the safe opt-out). */
  effects: TideEffect[]
}

export interface TideEvent {
  id: string
  /** Tier ladder — see TIER_PHILOSOPHY comment below. */
  tier: 1 | 2 | 3 | 4
  title: string
  /** Italic flavor line shown above the choices. */
  flavor: string
  choices: TideChoice[]
}

// TIER_PHILOSOPHY: same effect kinds at every tier, just bigger numbers.
// Tier 1 ≈ baseline. Tier 2 ≈ 2× the tier 1 magnitudes. Tier 3 ≈ 3–5×.
// Tier 4 = endgame / mythic. New effect kinds CAN be introduced later
// as new raids ship; the union above is append-only friendly.

// Sentinel: pass n: NO_CHARGES (-99) to startCharges to mean "start
// that fight with zero cannonballs." The apply path clamps to 0; the
// describeEffect helper renders it as "Start the fight with 0 cannonballs"
// instead of the meaningless "-99 starting cannonballs."
const NO_CHARGES = -99

export const TIDE_POOL: TideEvent[] = [
  // ── 1 ─────────────────────────────────────────────────────────────
  {
    id: 'drifting_wreck',
    tier: 1,
    title: 'A Drifting Wreck',
    flavor: 'Half a hull no flag claims, dredged from somewhere deeper than these waters should reach.',
    choices: [
      {
        id: 'strip',
        label: 'Strip the hold',
        description: "+10% crit chance all run. Enemies hit you 10% harder all run.",
        effects: [
          { kind: 'critChanceBonus', chance: 0.10 },
          { kind: 'incomingDmgMult', mult: 1.10, scope: 'allRemaining' },
        ],
      },
      {
        id: 'medical',
        label: 'Take the medical chest',
        description: '+25 HP now. Costs you 50 ⟡ at raid end.',
        effects: [
          { kind: 'instantHeal', n: 25 },
          { kind: 'doubloonsAtRaidEnd', n: -50 },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail past',
        description: 'Nothing happens. Clean wake.',
        effects: [],
      },
    ],
  },
  // ── 2 ─────────────────────────────────────────────────────────────
  {
    id: 'sounding_bell',
    tier: 1,
    title: 'A Sounding Bell',
    flavor: "A bell tolls through the fog. Either an open invitation, or a trap meant to herd you onto someone's guns.",
    choices: [
      {
        id: 'follow',
        label: 'Follow the bell',
        description: 'It leads to a half-sunk cache: +150 ⟡ at raid end. But the chase leaves you ragged — you enter the boss fight with 10 less HP.',
        effects: [
          { kind: 'doubloonsAtRaidEnd', n: 150 },
          { kind: 'startHpDelta', n: -10, scope: 'boss' },
        ],
      },
      {
        id: 'hold',
        label: 'Hold your course',
        description: 'Nothing happens. The safe heading.',
        effects: [],
      },
      {
        id: 'sail_wide',
        label: 'Sail wide of the bell',
        description: '+15% Volley damage in the boss fight. Next fight starts with 0 cannonballs.',
        effects: [
          { kind: 'bossVolleyDmgMult', mult: 1.15 },
          { kind: 'startCharges', n: NO_CHARGES, scope: 'nextFight' },
        ],
      },
    ],
  },
  // ── 3 ─────────────────────────────────────────────────────────────
  {
    id: 'empty_powder_keg',
    tier: 1,
    title: 'Empty Powder Keg',
    flavor: 'A black-powder cask bobs alongside, lid half-off. Useful to the right captain. Dangerous to the careless one.',
    // Pure boon-pick — no opt-out. Each option is a real trade.
    choices: [
      {
        id: 'refill',
        label: 'Refill stores',
        description: 'Every reload has a 10% chance to load +1 cannonball, all run. -10 HP next fight.',
        effects: [
          { kind: 'reloadProc', chance: 0.10, bonusCharges: 1 },
          { kind: 'startHpDelta', n: -10, scope: 'nextFight' },
        ],
      },
      {
        id: 'rig',
        label: 'Rig it as a one-shot',
        description: 'Next enemy starts at half HP. That fight starts with 0 cannonballs.',
        effects: [
          { kind: 'enemyHpScale', mult: 0.5, scope: 'nextFight' },
          { kind: 'startCharges', n: NO_CHARGES, scope: 'nextFight' },
        ],
      },
      {
        id: 'heave',
        label: 'Heave it overboard',
        description: '1 guaranteed dodge next fight (no roll needed). Heaving it took the crew off the guns — that fight starts with 1 fewer cannonball.',
        effects: [
          { kind: 'guaranteedDodge', n: 1 },
          { kind: 'startCharges', n: -1, scope: 'nextFight' },
        ],
      },
    ],
  },
  // ── 4 ─────────────────────────────────────────────────────────────
  {
    id: 'bottle_in_surf',
    tier: 1,
    title: 'A Bottle in the Surf',
    flavor: "A captain's log fragment, water-stained, readable. From someone who didn't make the next port.",
    choices: [
      {
        id: 'read',
        label: 'Read it',
        description: 'Gold crit zone is 5% wider all run. -10 HP next fight (wheel went unattended).',
        effects: [
          { kind: 'critZoneScale', mult: 1.05 },
          { kind: 'startHpDelta', n: -10, scope: 'nextFight' },
        ],
      },
      {
        id: 'pocket',
        label: 'Pocket the bottle',
        description: '+150 ⟡ at raid end. Next fight starts with 1 fewer cannonball.',
        effects: [
          { kind: 'doubloonsAtRaidEnd', n: 150 },
          { kind: 'startCharges', n: -1, scope: 'nextFight' },
        ],
      },
      {
        id: 'toss',
        label: 'Toss it back',
        description: 'Nothing happens. The bottle drifts on.',
        effects: [],
      },
    ],
  },
  // ── 5 ─────────────────────────────────────────────────────────────
  {
    id: 'wounded_whale',
    tier: 1,
    title: 'A Wounded Whale',
    flavor: 'Entangled in Finndicate netting, dragging the lines deeper.',
    // Boon-pick: every option has a small cost or scope limit.
    choices: [
      {
        id: 'cut_loose',
        label: 'Cut it loose',
        description: '+10% Volley damage all run. The freed whale thrashes through your lines — -2 ship speed for the next 2 fights.',
        effects: [
          { kind: 'volleyDmgMult', mult: 1.10 },
          { kind: 'speedDelta', n: -2, scope: 'next2Fights' },
        ],
      },
      {
        id: 'harvest',
        label: 'Harvest it',
        description: '+10% Fire damage all run. -10% dodge next fight (cries draw attention).',
        effects: [
          { kind: 'fireDmgMult', mult: 1.10 },
          { kind: 'dodgeBonus', chance: -0.10, scope: 'nextFight' },
        ],
      },
      {
        id: 'netting',
        label: 'Take only the netting',
        description: '+2 cannonballs at the start of the next fight. Hauling it aboard leaves the rail exposed — -5 HP entering that fight.',
        effects: [
          { kind: 'startCharges', n: 2, scope: 'nextFight' },
          { kind: 'startHpDelta', n: -5, scope: 'nextFight' },
        ],
      },
    ],
  },
  // ── 6 ─────────────────────────────────────────────────────────────
  {
    id: 'foggy_crosswind',
    tier: 1,
    title: 'A Foggy Crosswind',
    flavor: 'The wind shifts hard against the current. The fog bows but does not lift.',
    choices: [
      {
        id: 'trim',
        label: 'Trim sails for speed',
        description: '+15% Fire damage all run. -2 ship speed for the next 2 fights.',
        effects: [
          { kind: 'fireDmgMult', mult: 1.15 },
          { kind: 'speedDelta', n: -2, scope: 'next2Fights' },
        ],
      },
      {
        id: 'stay',
        label: 'Stay the course',
        description: 'Nothing happens. No trade either way.',
        effects: [],
      },
      {
        id: 'anchor',
        label: 'Drop the sea anchor',
        description: 'Take 15% less damage next fight. That fight starts with 0 cannonballs.',
        effects: [
          { kind: 'incomingDmgMult', mult: 0.85, scope: 'nextFight' },
          { kind: 'startCharges', n: NO_CHARGES, scope: 'nextFight' },
        ],
      },
    ],
  },
  // ── 7 ─────────────────────────────────────────────────────────────
  {
    id: 'sheltered_cove',
    tier: 1,
    title: 'A Sheltered Cove',
    flavor: 'A driftwood inlet behind a rock-spit. Calm water, no enemy sails in sight. A captain could put in here.',
    choices: [
      {
        id: 'beach',
        label: 'Beach the ship and patch the hull',
        description: 'Full HP restored. But the long stop leaves your gun crews rusty — -12% damage all run.',
        effects: [
          { kind: 'fullHeal' },
          { kind: 'damageMult', mult: 0.88 },
        ],
      },
      {
        id: 'quick_patch',
        label: 'Quick patch in the bow',
        description: '+25 HP now. You enter the boss fight with 12 less HP.',
        effects: [
          { kind: 'instantHeal', n: 25 },
          { kind: 'startHpDelta', n: -12, scope: 'boss' },
        ],
      },
      {
        id: 'sail_on',
        label: 'Sail on',
        description: 'Nothing happens. Save your hull for whatever is ahead.',
        effects: [],
      },
    ],
  },
  // ── 8 ─────────────────────────────────────────────────────────────
  {
    id: 'damage_control_drill',
    tier: 1,
    title: 'A Damage-Control Drill',
    flavor: 'The bo`sun wants a half-hour for the crew. The water around you is empty enough that he might be right.',
    choices: [
      {
        id: 'live_fire',
        label: 'Live-fire drill',
        description: '+5% crit chance all run. Next fight starts with 1 fewer cannonball.',
        effects: [
          { kind: 'critChanceBonus', chance: 0.05 },
          { kind: 'startCharges', n: -1, scope: 'nextFight' },
        ],
      },
      {
        id: 'damage_control',
        label: 'Damage-control rehearsal',
        description: '+5 HP at the start of every remaining fight. The crew drills patches, not gunnery — -10% Fire damage all run.',
        effects: [
          { kind: 'startOfFightHeal', n: 5 },
          { kind: 'fireDmgMult', mult: 0.90 },
        ],
      },
      {
        id: 'skip',
        label: 'Skip the drill',
        description: 'Nothing happens. Save the time.',
        effects: [],
      },
    ],
  },

  // ── TIER 2 ────────────────────────────────────────────────────────────
  // Same effect kinds as tier 1, ~2x the magnitudes (and steeper costs).
  // Only drawn when a raid sets maxTier >= 2 (Chapter 3+). Authored 2026-06-24.
  // ── 9 ─────────────────────────────────────────────────────────────
  {
    id: 'maelstrom_pull',
    tier: 2,
    title: "A Maelstrom's Pull",
    flavor: 'The sea opens a slow grey throat off the bow. Ride its edge and it will hurl you forward, or swallow you whole.',
    choices: [
      {
        id: 'ride',
        label: 'Ride the current',
        description: '+25% damage all run. Enemies hit you 20% harder all run.',
        effects: [
          { kind: 'damageMult', mult: 1.25 },
          { kind: 'incomingDmgMult', mult: 1.20, scope: 'allRemaining' },
        ],
      },
      {
        id: 'bail',
        label: 'Brace and bail',
        description: '+50 HP now. Costs you 100 ⟡ at raid end.',
        effects: [
          { kind: 'instantHeal', n: 50 },
          { kind: 'doubloonsAtRaidEnd', n: -100 },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail wide',
        description: 'Nothing happens. Clean wake.',
        effects: [],
      },
    ],
  },
  // ── 10 ────────────────────────────────────────────────────────────
  {
    id: 'drowned_armory',
    tier: 2,
    title: 'The Drowned Armory',
    flavor: "A sunken man-o-war's gun deck, still stocked, the powder somehow dry. Take what the sea was keeping.",
    // Pure boon-pick — no opt-out. Each is a real trade.
    choices: [
      {
        id: 'heavy_shot',
        label: 'Load the heavy shot',
        description: '+30% Fire damage all run. Your aim needle runs faster all run.',
        effects: [
          { kind: 'fireDmgMult', mult: 1.30 },
          { kind: 'aimSpeedMult', mult: 1.15 },
        ],
      },
      {
        id: 'powder',
        label: 'Haul the powder aboard',
        description: 'Every reload has a 20% chance to load +1 cannonball, all run. The extra powder weighs the hull down — -1 ship speed all run.',
        effects: [
          { kind: 'reloadProc', chance: 0.20, bonusCharges: 1 },
          { kind: 'speedDelta', n: -1, scope: 'allRemaining' },
        ],
      },
      {
        id: 'plate',
        label: 'Bolt on the hull plate',
        description: 'Take 30% less damage all run. The added weight slows your guns — -10% damage all run.',
        effects: [
          { kind: 'incomingDmgMult', mult: 0.70, scope: 'allRemaining' },
          { kind: 'damageMult', mult: 0.90 },
        ],
      },
    ],
  },
  // ── 11 ────────────────────────────────────────────────────────────
  {
    id: 'sirens_bargain',
    tier: 2,
    title: "A Siren's Bargain",
    flavor: 'A voice in the swell offers a trade, sweet and certain. Bargains struck on open water are always paid in full.',
    choices: [
      {
        id: 'sing_back',
        label: 'Sing back',
        description: '+20% crit chance all run. Enemies hit you 15% harder all run.',
        effects: [
          { kind: 'critChanceBonus', chance: 0.20 },
          { kind: 'incomingDmgMult', mult: 1.15, scope: 'allRemaining' },
        ],
      },
      {
        id: 'ears',
        label: 'Take the song',
        description: 'Full HP restored. But the bargain is paid in full — you take 15% more damage all run.',
        effects: [
          { kind: 'fullHeal' },
          { kind: 'incomingDmgMult', mult: 1.15, scope: 'allRemaining' },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail past',
        description: 'Nothing happens. Hold the line.',
        effects: [],
      },
    ],
  },
  // ── 12 ────────────────────────────────────────────────────────────
  {
    id: 'king_tide',
    tier: 2,
    title: 'The King Tide',
    flavor: 'The whole sea heaves at once, a wave with no weather behind it. Time it right and it carries you onto the boss like a battering ram.',
    choices: [
      {
        id: 'crest',
        label: 'Crest the wave',
        description: '+40% damage in the boss fight. Next fight starts with 0 cannonballs.',
        effects: [
          { kind: 'bossDamageMult', mult: 1.40 },
          { kind: 'startCharges', n: NO_CHARGES, scope: 'nextFight' },
        ],
      },
      {
        id: 'trough',
        label: 'Heal in the trough',
        description: '+15 HP at the start of every remaining fight. -20% Volley damage all run.',
        effects: [
          { kind: 'startOfFightHeal', n: 15 },
          { kind: 'volleyDmgMult', mult: 0.80 },
        ],
      },
      {
        id: 'ride_out',
        label: 'Ride it out',
        description: '+2 ship speed all run (turn order and aim). The hard heel into the swell strains the seams — take 12% more damage all run.',
        effects: [
          { kind: 'speedDelta', n: 2, scope: 'allRemaining' },
          { kind: 'incomingDmgMult', mult: 1.12, scope: 'allRemaining' },
        ],
      },
    ],
  },
  // ── 13 ────────────────────────────────────────────────────────────
  {
    id: 'ghost_convoy',
    tier: 2,
    title: 'A Ghost Convoy',
    flavor: 'A line of ships rides the horizon, lanterns lit, no crew at the rails. They hold formation as if still waiting on orders.',
    choices: [
      {
        id: 'board',
        label: 'Board the lead ship',
        description: 'The next enemy starts at half HP. You take 15% more damage that fight.',
        effects: [
          { kind: 'enemyHpScale', mult: 0.50, scope: 'nextFight' },
          { kind: 'incomingDmgMult', mult: 1.15, scope: 'nextFight' },
        ],
      },
      {
        id: 'flank',
        label: 'Fall in behind them',
        description: '+2 guaranteed dodges next fight (no roll needed). Drifting in their cold wake saps the crew — -10 HP entering that fight.',
        effects: [
          { kind: 'guaranteedDodge', n: 2 },
          { kind: 'startHpDelta', n: -10, scope: 'nextFight' },
        ],
      },
      {
        id: 'sail_past',
        label: 'Let them sail on',
        description: 'Nothing happens. Some things are best left to the fog.',
        effects: [],
      },
    ],
  },
]

// ──────────────────────────────────────────────────────────────────────
// Draw helper
// ──────────────────────────────────────────────────────────────────────

/** Pick `n` distinct tides at random from the pool where tier <= maxTier.
 *  Returns fewer than `n` if the pool runs out (defensive — should not
 *  happen with the tier-1 pool of 8). */
export function drawTides(n: number, maxTier: number): TideEvent[] {
  const eligible = TIDE_POOL.filter(t => t.tier <= maxTier)
  // In-place Fisher-Yates on a copy. Caller controls randomness source
  // (we just use Math.random — tides are pure run state, not anti-cheat).
  const pool = [...eligible]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(n, pool.length))
}

// ──────────────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────────────

/** Friendly one-line description of an effect for the Captain's Ledger
 *  "Active Tides" section AND the chip row on the TideModal choice
 *  cards. Mirrors the wording of the choice descriptions (cannonballs,
 *  next fight / boss fight / all run) so a player who scans either
 *  surface reads the same thing.
 *
 *  Returns '' for marker effects that shouldn't surface (e.g. a
 *  startHpDelta n=0 placeholder); both consumers filter empty strings. */
export function describeEffect(e: TideEffect): string {
  switch (e.kind) {
    case 'damageMult':            return `${pct(e.mult - 1)} damage all run`
    case 'fireDmgMult':           return `${pct(e.mult - 1)} Fire damage`
    case 'volleyDmgMult':         return `${pct(e.mult - 1)} Volley damage`
    case 'critChanceBonus':       return `${pct(e.chance)} crit chance`
    case 'critZoneScale':         return `Crit zone ${pct(e.mult - 1)} wider`
    case 'critDmgMult':           return `${pct(e.mult - 1)} critical damage`
    case 'executeThreshold':      return `Sink enemies below ${Math.round(e.pct * 100)}% HP`
    case 'lifestealPct':          return `Heal ${pct(e.pct)} of damage dealt`
    case 'retaliatePct':          return `Reflect ${Math.round(e.pct * 100)}% of damage taken`
    case 'lowHpDamage':           return `Up to ${pct(e.maxBonus)} damage as your HP drops`
    case 'chargeCarryover':       return e.cap >= 99 ? 'Carry all unfired cannonballs to the next fight' : `Carry up to ${e.cap} cannonball${e.cap === 1 ? '' : 's'} to the next fight`
    case 'fightShield':           return `Shield each fight worth ${Math.round(e.pctMax * 100)}% of max HP`
    case 'incomingDmgMult': {
      const scope = e.scope === 'nextFight' ? 'next fight' : 'all run'
      if (e.mult > 1) return `Take ${pct(e.mult - 1)} more damage, ${scope}`
      return `Take ${pct(1 - e.mult)} less damage, ${scope}`
    }
    case 'incomingCritReduction': return `Enemies crit ${pct(e.chance)} less often`
    case 'instantHeal':           return `+${e.n} HP now`
    case 'fullHeal':              return 'Full HP restored'
    case 'startHpDelta': {
      if (e.n === 0) return ''   // marker only
      const sign = e.n >= 0 ? '+' : ''
      const scope = e.scope === 'boss' ? 'boss fight' : 'next fight'
      return `${sign}${e.n} HP entering ${scope}`
    }
    case 'startOfFightHeal':      return `+${e.n} HP at every fight start`
    case 'startCharges': {
      const scope = e.scope === 'nextFight' ? 'next fight' : 'every fight'
      if (e.n <= -10) return `0 cannonballs ${scope}`
      if (e.n < 0)    return `${e.n} starting cannonball${Math.abs(e.n) === 1 ? '' : 's'} ${scope}`
      return `+${e.n} starting cannonball${e.n === 1 ? '' : 's'} ${scope}`
    }
    case 'reloadProc':            return `${pct(e.chance)} chance per reload for +${e.bonusCharges} cannonball${e.bonusCharges === 1 ? '' : 's'}`
    case 'dodgeBonus': {
      const scope = e.scope === 'nextFight' ? 'next fight' : 'all run'
      return `${pct(e.chance)} dodge, ${scope}`
    }
    case 'guaranteedDodge':       return `${e.n} guaranteed dodge${e.n === 1 ? '' : 's'}`
    case 'speedDelta': {
      const scope = e.scope === 'allRemaining' ? 'all run' : 'next 2 fights'
      return `${e.n >= 0 ? '+' : ''}${e.n} ship speed, ${scope}`
    }
    case 'bossDamageMult':        return `${pct(e.mult - 1)} damage to boss`
    case 'bossVolleyDmgMult':     return `${pct(e.mult - 1)} Volley damage to boss`
    case 'enemyHpScale':          return `Next enemy ${pct(1 - e.mult)} weaker`
    case 'enemyStartChargesDelta':return `Next enemy starts with ${Math.abs(e.n)} fewer cannonball${Math.abs(e.n) === 1 ? '' : 's'}`
    case 'doubloonsAtRaidEnd':    return `${e.n >= 0 ? '+' : ''}${e.n} ⟡ at raid end`
    case 'aimFog':                return 'Fog drifts over your aim bar'
    case 'aimSpeedMult':          return e.mult > 1 ? `Aim needle ${pct(e.mult - 1)} faster` : `Aim needle ${pct(1 - e.mult)} slower`
    case 'zoneSpeedMult':         return e.mult > 1 ? `Target band lurches ${pct(e.mult - 1)} faster` : `Target band ${pct(1 - e.mult)} steadier`
  }
}

function pct(x: number): string {
  const sign = x >= 0 ? '+' : ''
  return `${sign}${Math.round(x * 100)}%`
}
