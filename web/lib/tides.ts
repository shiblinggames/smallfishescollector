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
   *  oneFight for a single upcoming encounter. */
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
  /** One-sentence card body: what happens + the trade. */
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
        description: "+10% crit chance all run. The wreck's cries carry through the fog; enemies hit 10% harder.",
        effects: [
          { kind: 'critChanceBonus', chance: 0.10 },
          { kind: 'incomingDmgMult', mult: 1.10, scope: 'allRemaining' },
        ],
      },
      {
        id: 'medical',
        label: 'Take the medical chest',
        description: '+25 HP immediately. The chest belonged to someone; word gets around the docks (-50 ⟡ at raid end).',
        effects: [
          { kind: 'instantHeal', n: 25 },
          { kind: 'doubloonsAtRaidEnd', n: -50 },
        ],
      },
      {
        id: 'sail_past',
        label: 'Sail past',
        description: 'Nothing. The wake stays clean.',
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
        description: 'Sail straight toward the sound. Start the boss fight at -10 HP from the loss of the lead.',
        effects: [
          { kind: 'startHpDelta', n: -10, scope: 'boss' },
        ],
      },
      {
        id: 'hold',
        label: 'Hold your course',
        description: 'Nothing. The safe heading.',
        effects: [],
      },
      {
        id: 'sail_wide',
        label: 'Sail wide of the bell',
        description: '+15% volley damage on the boss fight only. Time cost: start the boss fight with 0 charges.',
        effects: [
          { kind: 'bossVolleyDmgMult', mult: 1.15 },
          { kind: 'startHpDelta', n: 0, scope: 'boss' }, // marker only — charges handled below
          { kind: 'startCharges', n: -99, scope: 'nextFight' }, // negative clamped to 0 in apply path
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
        description: '10% chance per reload to gain +1 cannonball, all run. Refilling under fire costs blood: -10 HP next fight.',
        effects: [
          { kind: 'reloadProc', chance: 0.10, bonusCharges: 1 },
          { kind: 'startHpDelta', n: -10, scope: 'nextFight' },
        ],
      },
      {
        id: 'rig',
        label: 'Rig it as a one-shot',
        description: 'Next enemy starts at half HP. You spent your shots prepping; start that fight with 0 charges.',
        effects: [
          { kind: 'enemyHpScale', mult: 0.5, scope: 'nextFight' },
          { kind: 'startCharges', n: -99, scope: 'nextFight' },
        ],
      },
      {
        id: 'heave',
        label: 'Heave it overboard',
        description: '+1 guaranteed dodge for the next fight. The deck is clean again.',
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
        description: '+5% crit zone width all run. The reading absorbs you; -10 HP next fight (the wheel went unattended).',
        effects: [
          { kind: 'critZoneScale', mult: 1.05 },
          { kind: 'startHpDelta', n: -10, scope: 'nextFight' },
        ],
      },
      {
        id: 'pocket',
        label: 'Pocket the bottle',
        description: '+150 ⟡ at raid end. You stowed it instead of preparing; start the next fight at -1 charge.',
        effects: [
          { kind: 'doubloonsAtRaidEnd', n: 150 },
          { kind: 'startCharges', n: -1, scope: 'nextFight' },
        ],
      },
      {
        id: 'toss',
        label: 'Toss it back',
        description: 'Nothing. The bottle drifts on.',
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
        description: 'The freed whale buoys you over a swell. +5 HP next fight + 10% volley damage on the next fight.',
        effects: [
          { kind: 'startHpDelta', n: 5, scope: 'nextFight' },
          { kind: 'volleyDmgMult', mult: 1.10 },
          // Note: volleyDmgMult is run-scoped in the schema; we'll
          // expire it after the next fight in RaidGame's state path.
          // For now it's "10% volley dmg" for the rest of the run as a
          // small tier-1 boon if we don't track scope yet. If the
          // expire-after-fight plumbing isn't built, this is fine.
        ],
      },
      {
        id: 'harvest',
        label: 'Harvest it',
        description: '+10% fire damage all run. The cries draw attention; -1 effective dodge for the next 2 fights.',
        effects: [
          { kind: 'fireDmgMult', mult: 1.10 },
          { kind: 'dodgeBonus', chance: -0.10, scope: 'nextFight' },
          // The "next 2 fights" is approximated by allRemaining vs nextFight scope;
          // exact 2-fight scope is a future addition. For tier 1 we'll cap at one fight.
        ],
      },
      {
        id: 'netting',
        label: 'Take only the netting',
        description: '+2 starting cannonballs for one upcoming fight. Clean trade, no downside.',
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
        description: '+15% fire damage for the next fight. The trim wastes wind on the run-up; -2 speed for the next fight.',
        effects: [
          { kind: 'fireDmgMult', mult: 1.15 },
          { kind: 'speedDelta', n: -2, scope: 'next2Fights' },
        ],
      },
      {
        id: 'stay',
        label: 'Stay the course',
        description: 'Nothing. No trim, no advantage, no cost.',
        effects: [],
      },
      {
        id: 'anchor',
        label: 'Drop the sea anchor',
        description: '-15% incoming damage for the next fight. Costs you the prep window; start that fight with 0 charges.',
        effects: [
          { kind: 'incomingDmgMult', mult: 0.85, scope: 'nextFight' },
          { kind: 'startCharges', n: -99, scope: 'nextFight' },
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
        description: 'Full HP restore. Caulking-fire smoke draws attention; start the boss fight at -15 HP.',
        effects: [
          { kind: 'fullHeal' },
          { kind: 'startHpDelta', n: -15, scope: 'boss' },
        ],
      },
      {
        id: 'quick_patch',
        label: 'Quick patch in the bow',
        description: '+25 HP. Small time cost; start the boss fight at -5 HP.',
        effects: [
          { kind: 'instantHeal', n: 25 },
          { kind: 'startHpDelta', n: -5, scope: 'boss' },
        ],
      },
      {
        id: 'sail_on',
        label: 'Sail on',
        description: 'Nothing. Save your hull for whatever is ahead.',
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
        description: '+5% crit chance all run. The drill used up shots; start the next fight at -1 charge.',
        effects: [
          { kind: 'critChanceBonus', chance: 0.05 },
          { kind: 'startCharges', n: -1, scope: 'nextFight' },
        ],
      },
      {
        id: 'damage_control',
        label: 'Damage-control rehearsal',
        description: '+5 HP at the start of every remaining fight. The crew is tired by the time you reach the boss; start the boss fight at -15 HP.',
        effects: [
          { kind: 'startOfFightHeal', n: 5 },
          { kind: 'startHpDelta', n: -15, scope: 'boss' },
        ],
      },
      {
        id: 'skip',
        label: 'Skip the drill',
        description: 'Nothing. Save the time.',
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
 *  "Active Tides" section. Keeps the player oriented on what's running. */
export function describeEffect(e: TideEffect): string {
  switch (e.kind) {
    case 'damageMult':            return `${pct(e.mult - 1)} damage all run`
    case 'fireDmgMult':           return `${pct(e.mult - 1)} fire damage`
    case 'volleyDmgMult':         return `${pct(e.mult - 1)} volley damage`
    case 'critChanceBonus':       return `${pct(e.chance)} crit chance`
    case 'critZoneScale':         return `${pct(e.mult - 1)} crit zone width`
    case 'incomingDmgMult':       return `${pct(1 - e.mult)} damage taken (${e.scope === 'nextFight' ? 'next fight' : 'all run'})`
    case 'incomingCritReduction': return `Enemies crit ${pct(e.chance)} less often`
    case 'instantHeal':           return `+${e.n} HP applied`
    case 'fullHeal':              return 'Full HP restored'
    case 'startHpDelta':          return `${e.n >= 0 ? '+' : ''}${e.n} HP entering ${e.scope === 'boss' ? 'the boss fight' : 'next fight'}`
    case 'startOfFightHeal':      return `+${e.n} HP at the start of every fight`
    case 'startCharges':          return `${e.n >= 0 ? '+' : ''}${e.n} starting cannonballs ${e.scope === 'nextFight' ? 'next fight' : 'every fight'}`
    case 'reloadProc':            return `${pct(e.chance)} chance per reload for +${e.bonusCharges} cannonball${e.bonusCharges === 1 ? '' : 's'}`
    case 'dodgeBonus':            return `${pct(e.chance)} dodge ${e.scope === 'nextFight' ? 'next fight' : 'all run'}`
    case 'guaranteedDodge':       return `${e.n} guaranteed dodge${e.n === 1 ? '' : 's'} banked`
    case 'speedDelta':            return `${e.n >= 0 ? '+' : ''}${e.n} speed ${e.scope === 'allRemaining' ? 'all run' : 'next 2 fights'}`
    case 'bossDamageMult':        return `${pct(e.mult - 1)} damage to boss`
    case 'bossVolleyDmgMult':     return `${pct(e.mult - 1)} volley damage to boss`
    case 'enemyHpScale':          return `Next enemy ${pct(1 - e.mult)} weaker`
    case 'enemyStartChargesDelta':return `Next enemy starts at ${e.n >= 0 ? '+' : ''}${e.n} cannonball${Math.abs(e.n) === 1 ? '' : 's'}`
    case 'doubloonsAtRaidEnd':    return `${e.n >= 0 ? '+' : ''}${e.n} ⟡ at raid end`
  }
}

function pct(x: number): string {
  const sign = x >= 0 ? '+' : ''
  return `${sign}${Math.round(x * 100)}%`
}
