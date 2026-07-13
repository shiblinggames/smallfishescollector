// ── DAVY'S TERMS ─────────────────────────────────────────────────────────────
// Hardcore-only, opt-in difficulty (the ToA-invocation / Hades-pact model).
// Before a hardcore dive you SIGN terms; each adds PRESSURE; Pressure multiplies
// your BLOOD GEMS on cash-out and NOTHING else. Doubloons, Nav XP and Fathoms
// all stay 1x, so the main economy never sees this.
//
// WHY THESE ARE NOT CURSES (deliberate, 2026-07-13):
//   Curses are the RANDOM layer — combat stat debuffs drawn mid-run. They keep
//   working exactly as they do today. Terms are the CHOSEN layer — structural
//   rules that reshape the RUN: who Davy sends at you, whether your crew comes
//   back, what the run offers you, what safety net you keep. Two systems, two
//   jobs, no overlap. (Loose Tongue is the one that touches curses, and even it
//   only changes their CADENCE, never their content.)
//
// THE BET: Blood Gems only drop on a CASH-OUT. Die and you get nothing. So
// Pressure is a wager, not a bonus, and the variance does most of the balancing
// for us — a greedy high-Pressure run that sinks pays zero and burns one of the
// three daily hardcore runs.
//
// THE DEPTH RAMP (the important one): the multiplier is worthless shallow and
// only reaches full value deep (see pressureGemMult). Without it, the optimal
// play is to sign every term and farm short depth-20 dives, because the 3-runs-
// per-day cap means only gems-per-RUN matter, not gems-per-hour. The ramp forces
// you to be BOTH deep AND heavy to get paid, which is the achievement worth
// rewarding in the first place.

export interface GauntletTermTier {
  /** One-line, plain: what changes. Reads on the card. */
  desc: string
  /** The full explanation for the details popup. No jargon — a newcomer must be
   *  able to read this and know exactly what they just signed up for. */
  detail: string
  /** Pressure this tier costs. Priced against how much it ACTUALLY hurts, not
   *  how scary it sounds — the cheap information terms are worth 1, because a
   *  good player barely notices them (the ToA min-max lesson). */
  pressure: number
}

export type TermGroup = 'opposition' | 'crew' | 'build' | 'safety'

export interface GauntletTerm {
  id: string
  name: string
  /** Davy's voice — one line, on the card. */
  flavor: string
  group: TermGroup
  tiers: GauntletTermTier[]
}

export const TERM_GROUP_META: Record<TermGroup, { label: string; blurb: string; accent: string }> = {
  opposition: { label: 'The Opposition', blurb: 'What Davy sends up at you.',            accent: '#e0555a' },
  crew:       { label: 'Your Crew',      blurb: 'The hands that answer his mechanics.',  accent: '#e0a44a' },
  build:      { label: 'Your Fortune',   blurb: 'What the descent offers you on the way down.', accent: '#8b7bf0' },
  safety:     { label: 'Your Safety Net', blurb: 'Everything that would have caught you.', accent: '#5eead4' },
}

export const GAUNTLET_TERMS: GauntletTerm[] = [
  // ── The opposition ────────────────────────────────────────────────────────
  {
    id: 'press_ganged', name: 'Press-Ganged', group: 'opposition',
    flavor: 'He empties the wrecks and crews them against you.',
    tiers: [
      { desc: 'Elites are much more common',
        detail: 'Elite ships (the purple ones, tougher and carrying a special affix) show up far more often at every depth.',
        pressure: 2 },
      { desc: 'Elites are everywhere',
        detail: 'Elite ships appear at roughly double the normal rate, so a stretch of open water without one becomes rare.',
        pressure: 4 },
    ],
  },
  {
    id: 'marked_hulls', name: 'Marked Hulls', group: 'opposition',
    flavor: 'Every hull he raises comes up already cursed.',
    tiers: [
      { desc: 'Elites carry TWO affixes, from the very first one',
        detail: 'Normally an elite only starts pairing affixes past depth 30. Now every elite carries two from depth 1, so each one is a combined threat.',
        pressure: 3 },
      { desc: 'Elites carry two affixes, and some carry three',
        detail: 'Every elite carries two affixes from the start, and roughly one in three carries a third stacked on top.',
        pressure: 5 },
    ],
  },
  {
    id: 'ironbacked', name: 'Ironbacked', group: 'opposition',
    flavor: 'Plate over plate, and guns to match.',
    tiers: [
      { desc: 'Elites are tougher and hit harder',
        detail: 'Elite ships get noticeably more hull and more damage on top of the affix they already carry.',
        pressure: 2 },
      { desc: 'Elites are far tougher and hit far harder',
        detail: 'Elite ships come with a great deal more hull and damage. An elite becomes a genuine boss-weight fight.',
        pressure: 4 },
    ],
  },
  {
    id: 'davys_court', name: "Davy's Court", group: 'opposition',
    flavor: 'He calls his captains up to meet you. All of them.',
    tiers: [
      { desc: 'Bosses come more often',
        detail: 'Boss fights appear more frequently. Worth knowing: bosses pay TRIPLE into the pot, so this raises your reward as well as your risk.',
        pressure: 2 },
      { desc: 'Bosses come constantly',
        detail: 'Boss fights appear far more frequently and you can never go long without one. They pay triple into the pot, so this is the one term that pays you back in coin as well as gems.',
        pressure: 4 },
    ],
  },

  // ── Your crew ─────────────────────────────────────────────────────────────
  {
    id: 'skeleton_crew', name: 'Skeleton Crew', group: 'crew',
    flavor: 'Some of them stay at the rail, and some of them do not come back.',
    tiers: [
      { desc: 'Crew abilities only have a 60% chance to come back after a boss',
        detail: 'Normally beating a boss restores EVERY crew ability. Now each boss kill only has a 60% chance to restore them, so you can be caught with an empty crew for a long stretch.',
        pressure: 3 },
      { desc: 'Crew abilities only have a 30% chance to come back after a boss',
        detail: 'Beating a boss only has a 30% chance to restore your crew abilities. Expect to fight most of the run with nothing left to call on.',
        pressure: 6 },
    ],
  },
  {
    id: 'short_handed', name: 'Short-Handed', group: 'crew',
    flavor: 'One berth stays empty. He decides which.',
    tiers: [
      { desc: 'Sail with one fewer crew for the whole run',
        detail: 'Your last crew slot is left empty for the entire dive. One fewer ability, one fewer set of stats, all the way down.',
        pressure: 4 },
    ],
  },

  // ── Your fortune ──────────────────────────────────────────────────────────
  {
    id: 'no_communion', name: 'No Communion', group: 'build',
    flavor: 'He keeps the powers apart so they never meet.',
    tiers: [
      { desc: 'Synergies are offered half as often',
        detail: 'When you hold both halves of a synergy, it is offered to you far less often, so a build you commit to may never actually come online.',
        pressure: 3 },
      { desc: 'Synergies are NEVER offered',
        detail: 'Confluences are switched off completely for this run. You can hold both halves and it will never be offered. Any build that leans on a synergy is dead.',
        pressure: 6 },
    ],
  },
  {
    id: 'scarce_powder', name: 'Scarce Powder', group: 'build',
    flavor: 'Take what you are given. There is no second crate.',
    tiers: [
      { desc: 'Boon drafts show 2 cards instead of 3',
        detail: 'Every time you are offered a boon you get one fewer option to choose from, so you far more often have to take something that does not fit your build.',
        pressure: 2 },
      { desc: 'Boon drafts show 2 cards, and come less often',
        detail: 'Boon drafts offer only two cards AND arrive less frequently, so you end the run with a thinner, worse-fitting build.',
        pressure: 4 },
    ],
  },
  {
    id: 'barren_tides', name: 'Barren Tides', group: 'build',
    flavor: 'The good powder went down with better ships than yours.',
    tiers: [
      { desc: 'Rare and Legendary boons are much scarcer',
        detail: 'The boon draft skews heavily toward Common cards, so the run-defining Rare and Legendary boons show up far less often.',
        pressure: 2 },
      { desc: 'Rare and Legendary boons are almost gone',
        detail: 'Nearly everything you are offered is Common. Expect to build a run out of small numbers.',
        pressure: 3 },
    ],
  },
  {
    id: 'empty_lockers', name: 'Empty Lockers', group: 'build',
    flavor: 'He gets to the chests before you do.',
    tiers: [
      { desc: 'Cash-out chests drop one tier lower',
        detail: 'The chest you open when you cash out is a full tier worse than the depth you reached has earned, which lowers your pot multiplier and your drop chances.',
        pressure: 1 },
      { desc: 'Cash-out chests drop two tiers lower',
        detail: 'Your cash-out chest is two tiers worse than earned. A deep run gets a shallow run’s chest.',
        pressure: 2 },
    ],
  },

  // ── Your safety net ───────────────────────────────────────────────────────
  {
    id: 'loose_tongue', name: 'Loose Tongue', group: 'safety',
    flavor: 'He will not stop talking, and every word costs you.',
    tiers: [
      { desc: 'Curses come more often',
        detail: 'The Locker curses you more frequently than usual. The curses themselves are unchanged, there are simply more of them.',
        pressure: 3 },
      { desc: 'Curses come more often, and start at their WORST tier',
        detail: 'Curses arrive more frequently AND every one lands at its second, nastier tier straight away instead of building up to it.',
        pressure: 5 },
    ],
  },
  {
    id: 'deep_draft', name: 'Deep Draft', group: 'safety',
    flavor: 'You go down heavy, and you go down holed.',
    tiers: [
      { desc: 'Begin the dive at 85% hull',
        detail: 'You start the run already damaged, at 85% of your maximum hull, and you never get that opening buffer back.',
        pressure: 2 },
      { desc: 'Begin the dive at 70% hull',
        detail: 'You start the run at 70% of your maximum hull. The first few fights are dangerous immediately.',
        pressure: 4 },
    ],
  },
  {
    id: 'no_mercy', name: 'No Mercy', group: 'safety',
    flavor: 'The anchor does not hold. Not this time.',
    tiers: [
      { desc: 'Lethal saves do not fire',
        detail: 'Any effect that would normally save you from a killing blow (an Anchor from your equipped items) does nothing. The first blow that would sink you, sinks you.',
        pressure: 3 },
    ],
  },
  {
    id: 'no_quarter', name: 'No Quarter', group: 'safety',
    flavor: 'He offers nothing, and he means it.',
    tiers: [
      { desc: 'Reprieves never appear',
        detail: 'The relief offers that normally show up between fights (a heal, a curse shed, a second wind) never appear at all.',
        pressure: 2 },
    ],
  },
  {
    id: 'blind_descent', name: 'Blind Descent', group: 'safety',
    flavor: 'Down you go, and you will meet it when you meet it.',
    tiers: [
      { desc: 'You cannot see what waits below',
        detail: 'The peek that normally tells you whether a boss or an elite is next is gone. Every dive is blind.',
        pressure: 1 },
    ],
  },
]

export function getTerm(id: string): GauntletTerm | undefined {
  return GAUNTLET_TERMS.find(t => t.id === id)
}

/** Signed terms: term id → tier (1-based). Absent / 0 = not signed. */
export type SignedTerms = Record<string, number>

/** Total Pressure from the signed terms. */
export function termPressure(signed: SignedTerms | null | undefined): number {
  if (!signed) return 0
  let p = 0
  for (const [id, tier] of Object.entries(signed)) {
    const t = getTerm(id)
    if (!t || tier < 1) continue
    p += t.tiers[Math.min(tier, t.tiers.length) - 1]?.pressure ?? 0
  }
  return p
}

/** Every point of Pressure available if you signed the whole board at max tier.
 *  Used by the UI to show how far along the board you are. */
export const MAX_AVAILABLE_PRESSURE = GAUNTLET_TERMS
  .reduce((a, t) => a + (t.tiers[t.tiers.length - 1]?.pressure ?? 0), 0)

// ── The payout curve ─────────────────────────────────────────────────────────
/** Blood Gems gained per point of Pressure, at full depth. */
export const PRESSURE_GEM_RATE = 0.10
/** Pressure at which the multiplier tops out (x4.0). Above this, extra Pressure
 *  is pure flex — it buys you the Ledger and the skin, not more gems. */
export const PRESSURE_CAP = 30
/** Below this depth the Pressure bonus is worth NOTHING. */
export const PRESSURE_DEPTH_FLOOR = 20
/** At this depth (and deeper) the Pressure bonus pays in full. */
export const PRESSURE_DEPTH_FULL = 40
/** Cash out at or above this Pressure to earn the Terms-only skin. */
export const PRESSURE_SKIN_THRESHOLD = 20

/** How much of the Pressure bonus a run at `depth` actually earns: nothing at
 *  PRESSURE_DEPTH_FLOOR, all of it at PRESSURE_DEPTH_FULL. This is what stops
 *  the obvious exploit — sign every term, farm short shallow dives, cash out fat.
 *  You have to be deep AND heavy. */
export function pressureDepthFactor(depth: number): number {
  const span = PRESSURE_DEPTH_FULL - PRESSURE_DEPTH_FLOOR
  return Math.max(0, Math.min(1, (depth - PRESSURE_DEPTH_FLOOR) / span))
}

/** The Blood Gem multiplier a run earns for its Pressure at the depth it reached.
 *  1.0 when unsigned, when shallow, or on a normal (non-hardcore) run. */
export function pressureGemMult(pressure: number, depth: number): number {
  if (pressure <= 0) return 1
  const p = Math.min(pressure, PRESSURE_CAP)
  return 1 + p * PRESSURE_GEM_RATE * pressureDepthFactor(depth)
}

// ── Resolved structural knobs ────────────────────────────────────────────────
// Terms never touch combat stats (that's what curses are for) — they reshape the
// RUN. This is the one object the run generator + the game screen read.
export interface TermEffects {
  /** Multiplies the elite spawn chance (and its cap). */
  eliteChanceMult: number
  /** Elites pair affixes from depth 1 (normally only past depth 30). */
  affixPairFromStart: boolean
  /** Chance an elite carries a THIRD affix (0 = never, on top of pairing). */
  tripleAffixChance: number
  /** Extra multipliers on elite hull / damage, ON TOP of the usual elite bump. */
  eliteHpMult: number
  eliteDmgMult: number
  /** Multiplies the boss spawn chance (and its cap). */
  bossChanceMult: number
  /** Lowers the bossless-rounds pity ceiling (forces bosses sooner). */
  bossPityDelta: number
  /** Chance a boss kill restores crew abilities (1 = always, today's behavior). */
  crewRefreshChance: number
  /** Crew slots removed for the run. */
  crewSlotsLost: number
  /** Cards shown in a boon draft (normally 3). */
  boonPicks: number
  /** Multiplies how often boon drafts occur (1 = normal). */
  boonFrequencyMult: number
  /** Skews boon rarity toward Common (0 = normal, 1 = hard skew). */
  commonSkew: number
  /** Multiplies the chance a qualifying confluence is offered (0 = never). */
  confluenceOfferMult: number
  /** Cash-out chest tiers dropped. */
  chestTierDrop: number
  /** Multiplies how often curses are drawn. */
  curseFrequencyMult: number
  /** Curses land straight at tier 2. */
  curseStartsAtWorst: boolean
  /** Fraction of max hull you begin the run with. */
  startHpPct: number
  /** Lethal saves (Anchor) are dead. */
  noLethalSaves: boolean
  /** Reprieves never appear. */
  noReprieves: boolean
  /** No peeking at the next fight. */
  noPeek: boolean
}

export const NO_TERM_EFFECTS: TermEffects = {
  eliteChanceMult: 1,
  affixPairFromStart: false,
  tripleAffixChance: 0,
  eliteHpMult: 1,
  eliteDmgMult: 1,
  bossChanceMult: 1,
  bossPityDelta: 0,
  crewRefreshChance: 1,
  crewSlotsLost: 0,
  boonPicks: 3,
  boonFrequencyMult: 1,
  commonSkew: 0,
  confluenceOfferMult: 1,
  chestTierDrop: 0,
  curseFrequencyMult: 1,
  curseStartsAtWorst: false,
  startHpPct: 1,
  noLethalSaves: false,
  noReprieves: false,
  noPeek: false,
}

/** Fold the signed terms into the one knob-set the run reads. */
export function resolveTerms(signed: SignedTerms | null | undefined): TermEffects {
  const e: TermEffects = { ...NO_TERM_EFFECTS }
  if (!signed) return e
  const tierOf = (id: string) => {
    const t = signed[id] ?? 0
    const term = getTerm(id)
    return term ? Math.min(t, term.tiers.length) : 0
  }

  const press = tierOf('press_ganged')
  if (press) e.eliteChanceMult = press === 1 ? 1.8 : 2.6

  const marked = tierOf('marked_hulls')
  if (marked) {
    e.affixPairFromStart = true
    if (marked >= 2) e.tripleAffixChance = 0.33
  }

  const iron = tierOf('ironbacked')
  if (iron) {
    e.eliteHpMult  = iron === 1 ? 1.2 : 1.45
    e.eliteDmgMult = iron === 1 ? 1.12 : 1.28
  }

  const court = tierOf('davys_court')
  if (court) {
    e.bossChanceMult = court === 1 ? 1.7 : 2.4
    e.bossPityDelta  = court === 1 ? 3 : 5
  }

  const skel = tierOf('skeleton_crew')
  if (skel) e.crewRefreshChance = skel === 1 ? 0.6 : 0.3

  if (tierOf('short_handed')) e.crewSlotsLost = 1

  const comm = tierOf('no_communion')
  if (comm) e.confluenceOfferMult = comm === 1 ? 0.5 : 0

  const powder = tierOf('scarce_powder')
  if (powder) {
    e.boonPicks = 2
    if (powder >= 2) e.boonFrequencyMult = 0.65
  }

  const barren = tierOf('barren_tides')
  if (barren) e.commonSkew = barren === 1 ? 0.6 : 0.85

  const lockers = tierOf('empty_lockers')
  if (lockers) e.chestTierDrop = lockers

  const tongue = tierOf('loose_tongue')
  if (tongue) {
    e.curseFrequencyMult = tongue === 1 ? 1.5 : 1.9
    if (tongue >= 2) e.curseStartsAtWorst = true
  }

  const draft = tierOf('deep_draft')
  if (draft) e.startHpPct = draft === 1 ? 0.85 : 0.70

  if (tierOf('no_mercy'))      e.noLethalSaves = true
  if (tierOf('no_quarter'))    e.noReprieves   = true
  if (tierOf('blind_descent')) e.noPeek        = true

  return e
}
