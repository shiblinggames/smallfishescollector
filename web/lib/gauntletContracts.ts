// Don's Gauntlet — CONTRACTS. Opt-in "jobs" the Don offers between fights
// (Don's variant only). Chance-based, ~1 every 7-8 depths, and always an ADDED
// step in the between-fights chain — never replacing a boon/curse/market beat.
//
// Take a job and a condition rides the NEXT hull: clear it for a reward, blow it
// for a penalty. This mirrors Finn's fishing challenges (a rival sizing you up),
// but with teeth — the downside is on the table the moment you accept, and you
// CANNOT walk once you're in.
//
// This module is pure domain logic: the job catalog, the offer roll, the
// reward/penalty tables, and the fight-end checker. Combat fills a
// ContractFightFacts bundle and calls checkContract(); the gauntlet flow rolls
// offers and applies the reward/penalty through the same effect paths boons and
// curses already use.

export type ContractStake = 1 | 2 | 3   // small job / real work / the big score

export type ContractKind =
  | 'fast'          // sink it in <= N turns
  | 'deadeye'       // every shot must land critical (no missed crits)
  | 'no_crew'       // no crew abilities
  | 'fire_only'     // only single fire shots
  | 'volley_only'   // only volleys
  | 'ultimate_only' // only the Mega
  | 'no_dodge'      // never take the Dodge action
  | 'untouched'     // no damage from a NON-special enemy attack

/** The per-fight facts a contract is judged against. Combat accumulates these
 *  over the contracted fight and hands them to checkContract() at fight end. */
export interface ContractFightFacts {
  /** Sank the hull? Every contract also requires the win. */
  won: boolean
  /** Rounds elapsed. */
  turns: number
  /** Damaging player shots fired (fire + volley locks); Mega counted in `megas`. */
  shots: number
  /** Of `shots`, how many landed critical. */
  crits: number
  /** Single fire shots. */
  fires: number
  /** Volley shots. */
  volleys: number
  /** Mega / ultimate shots. */
  megas: number
  /** Crew abilities used. */
  crewAbilities: number
  /** Times the Dodge action was taken. */
  dodges: number
  /** Times a NON-special enemy attack (fire/volley/mega) dealt damage to you.
   *  Special / mechanic-check hits are excluded. */
  nonSpecialHitsTaken: number
}

export interface ContractDef {
  kind: ContractKind
  /** Short display name, e.g. "Fast Work". */
  name: string
  /** The Don's framing line on the offer card. */
  job: string
  /** The goal text (offer card + live HUD), given the resolved param. */
  goal: (param: number) => string
  /** Judge the fight. `param` is 0 for the binary jobs. */
  check: (f: ContractFightFacts, param: number) => boolean
  /** Target/turn scaling for the scalable jobs; binary jobs return 0. */
  param: (stake: ContractStake, depth: number) => number
}

export const CONTRACTS: Record<ContractKind, ContractDef> = {
  fast: {
    kind: 'fast', name: 'Fast Work',
    job: "Make it quick, captain. I don't pay for dawdling.",
    goal: n => `Sink it in ${n} turn${n === 1 ? '' : 's'} or fewer.`,
    check: (f, n) => f.won && f.turns <= n,
    // Tighter caps at higher stakes; a little more room the deeper you are.
    param: (stake, depth) => Math.max(2, (6 - stake) + Math.floor(depth / 25)),
  },
  deadeye: {
    kind: 'deadeye', name: 'Dead-Eye',
    job: "Every shot counts down here. Miss the mark once and the deal's off.",
    goal: () => 'Land ONLY critical hits — no miss, graze, or plain hit.',
    check: f => f.won && f.shots > 0 && f.crits === f.shots,
    param: () => 0,
  },
  no_crew: {
    kind: 'no_crew', name: 'Tight Quarters',
    job: 'Handle this one yourself. Leave the crew out of it.',
    goal: () => 'Win without firing a single crew ability.',
    check: f => f.won && f.crewAbilities === 0,
    param: () => 0,
  },
  fire_only: {
    kind: 'fire_only', name: 'Single Shots',
    job: 'Just the guns. No broadsides, no fireworks.',
    goal: () => 'Win using only single fire shots — no volley or Mega.',
    check: f => f.won && f.volleys === 0 && f.megas === 0,
    param: () => 0,
  },
  volley_only: {
    kind: 'volley_only', name: 'Broadsides Only',
    job: 'The full broadside, every time. Nothing less.',
    goal: () => 'Win using only volleys — no single shot or Mega.',
    check: f => f.won && f.fires === 0 && f.megas === 0,
    param: () => 0,
  },
  ultimate_only: {
    kind: 'ultimate_only', name: 'The Big Gun',
    job: 'Show me the big gun, captain. Only the big gun.',
    goal: () => 'Win using only your Mega — no fire or volley.',
    check: f => f.won && f.fires === 0 && f.volleys === 0 && f.megas > 0,
    param: () => 0,
  },
  no_dodge: {
    kind: 'no_dodge', name: 'Stand Your Ground',
    job: "No weaving. Stand there and take it like it's nothing.",
    goal: () => 'Win without ever taking the Dodge action.',
    check: f => f.won && f.dodges === 0,
    param: () => 0,
  },
  untouched: {
    kind: 'untouched', name: 'Not a Scratch',
    job: "Come back clean. A regular shot lands on you and we're done.",
    goal: () => 'Take no damage from a normal attack (specials excepted).',
    check: f => f.won && f.nonSpecialHitsTaken === 0,
    param: () => 0,
  },
}

export const ALL_CONTRACT_KINDS = Object.keys(CONTRACTS) as ContractKind[]

// ── Offer roll ────────────────────────────────────────────────────────────
// Chance-based so a job feels like an EVENT, not a menu. ~1 in 7.5 depths.
export const CONTRACT_OFFER_CHANCE = 1 / 7.5
// Don't pester the first few floors of a fresh dive.
export const CONTRACT_MIN_DEPTH = 4

/** Roll whether the Don offers a job at this depth, and which. Returns null for
 *  no offer. RNG injectable for determinism where a caller needs it. */
export function rollContractOffer(depth: number, rng: () => number = Math.random): ContractKind | null {
  if (depth < CONTRACT_MIN_DEPTH) return null
  if (rng() >= CONTRACT_OFFER_CHANCE) return null
  return ALL_CONTRACT_KINDS[Math.floor(rng() * ALL_CONTRACT_KINDS.length)]
}

// ── Reward / penalty ──────────────────────────────────────────────────────
// Descriptors the application layer maps to real effects (the same Fathoms
// grant, boon draft, curse and status paths already in the gauntlet).
export type ContractReward =
  | { kind: 'fathoms'; n: number }
  | { kind: 'boonDraft' }
  | { kind: 'fullHeal' }

export type ContractPenalty =
  | { kind: 'fathomsLose'; n: number }
  | { kind: 'curse' }
  | { kind: 'hpLossPct'; pct: number }

/** A concrete offer: the job, the stake the player took, the resolved goal
 *  param, and the reward/penalty riding on it. Stored on the run state until
 *  the contracted fight resolves. */
export interface ContractOffer {
  kind: ContractKind
  stake: ContractStake
  param: number
  reward: ContractReward
  penalty: ContractPenalty
}

// Fathoms in play scale with stake and depth.
function fathomsReward(stake: ContractStake, depth: number): number {
  return Math.round((30 + depth * 4) * stake)
}
function fathomsPenalty(stake: ContractStake, depth: number): number {
  return Math.round(fathomsReward(stake, depth) * 0.7)
}

/** Build the offer for a chosen job + stake at the current depth. */
export function buildContractOffer(kind: ContractKind, stake: ContractStake, depth: number, rng: () => number = Math.random): ContractOffer {
  const param = CONTRACTS[kind].param(stake, depth)
  // Reward — mostly Fathoms; the big score can hand you a free boon, and a
  // clean job sometimes patches you up.
  const reward: ContractReward =
    stake === 3 && rng() < 0.5 ? { kind: 'boonDraft' }
    : rng() < 0.18 ? { kind: 'fullHeal' }
    : { kind: 'fathoms', n: fathomsReward(stake, depth) }
  // Penalty — docked pay, a wound, or (at the big score) a curse for the run.
  const penalty: ContractPenalty =
    stake === 3 && rng() < 0.5 ? { kind: 'curse' }
    : rng() < 0.4 ? { kind: 'hpLossPct', pct: Math.min(0.4, 0.1 + 0.06 * stake) }
    : { kind: 'fathomsLose', n: fathomsPenalty(stake, depth) }
  return { kind, stake, param, reward, penalty }
}

/** Was the contract satisfied? */
export function checkContract(offer: ContractOffer, facts: ContractFightFacts): boolean {
  return CONTRACTS[offer.kind].check(facts, offer.param)
}

// ── Copy helpers (offer card + resolution) ───────────────────────────────
export const STAKE_LABEL: Record<ContractStake, string> = {
  1: 'Small job', 2: 'Real work', 3: 'The big score',
}

export function describeReward(r: ContractReward): string {
  switch (r.kind) {
    case 'fathoms':   return `+${r.n} Fathoms`
    case 'boonDraft': return 'A free power draft'
    case 'fullHeal':  return 'Patched to full hull'
  }
}

export function describePenalty(p: ContractPenalty): string {
  switch (p.kind) {
    case 'fathomsLose': return `Lose ${p.n} Fathoms`
    case 'curse':       return 'A curse for the rest of the run'
    case 'hpLossPct':   return `Lose ${Math.round(p.pct * 100)}% of your hull`
  }
}
