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
  /** +/- player ship speed for turn order + aim-bar speed. */
  | { kind: 'speedDelta'; n: number; scope: 'next2Fights' | 'allRemaining' }
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
  // ── Meta (post-raid only) ───────────────────────────────────────
  /** Doubloons granted / deducted at raid end. */
  | { kind: 'doubloonsAtRaidEnd'; n: number }

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
        description: 'The bell was a lure. Boss fight starts with 10 less HP. No upside.',
        effects: [
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
        description: '+15% volley damage in the boss fight. Next fight starts with 0 cannonballs.',
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
        description: '1 guaranteed dodge next fight (no roll needed).',
        effects: [
          { kind: 'guaranteedDodge', n: 1 },
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
        description: '+5 HP next fight. +10% volley damage all run.',
        effects: [
          { kind: 'startHpDelta', n: 5, scope: 'nextFight' },
          { kind: 'volleyDmgMult', mult: 1.10 },
        ],
      },
      {
        id: 'harvest',
        label: 'Harvest it',
        description: '+10% fire damage all run. -10% dodge next fight (cries draw attention).',
        effects: [
          { kind: 'fireDmgMult', mult: 1.10 },
          { kind: 'dodgeBonus', chance: -0.10, scope: 'nextFight' },
        ],
      },
      {
        id: 'netting',
        label: 'Take only the netting',
        description: '+2 cannonballs at the start of the next fight. No downside.',
        effects: [
          { kind: 'startCharges', n: 2, scope: 'nextFight' },
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
        description: '+15% fire damage next fight. -2 ship speed for the next 2 fights.',
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
        description: 'Full HP restore. Boss fight starts with 15 less HP (your smoke draws attention).',
        effects: [
          { kind: 'fullHeal' },
          { kind: 'startHpDelta', n: -15, scope: 'boss' },
        ],
      },
      {
        id: 'quick_patch',
        label: 'Quick patch in the bow',
        description: '+25 HP now. Boss fight starts with 5 less HP.',
        effects: [
          { kind: 'instantHeal', n: 25 },
          { kind: 'startHpDelta', n: -5, scope: 'boss' },
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
        description: '+5 HP at the start of every remaining fight. Boss fight starts with 15 less HP (crew is tired).',
        effects: [
          { kind: 'startOfFightHeal', n: 5 },
          { kind: 'startHpDelta', n: -15, scope: 'boss' },
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
    case 'fireDmgMult':           return `${pct(e.mult - 1)} fire damage`
    case 'volleyDmgMult':         return `${pct(e.mult - 1)} volley damage`
    case 'critChanceBonus':       return `${pct(e.chance)} crit chance`
    case 'critZoneScale':         return `Crit zone ${pct(e.mult - 1)} wider`
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
    case 'bossVolleyDmgMult':     return `${pct(e.mult - 1)} volley damage to boss`
    case 'enemyHpScale':          return `Next enemy ${pct(1 - e.mult)} weaker`
    case 'enemyStartChargesDelta':return `Next enemy starts with ${Math.abs(e.n)} fewer cannonball${Math.abs(e.n) === 1 ? '' : 's'}`
    case 'doubloonsAtRaidEnd':    return `${e.n >= 0 ? '+' : ''}${e.n} ⟡ at raid end`
  }
}

function pct(x: number): string {
  const sign = x >= 0 ? '+' : ''
  return `${sign}${Math.round(x * 100)}%`
}
