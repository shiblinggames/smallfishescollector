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

import type { TideEffect } from './tides'

export interface GauntletTermTier {
  /** One-line, plain: what changes. Reads on the card. */
  desc: string
  /** The full explanation for the details popup. No jargon — a newcomer must be
   *  able to read this and know exactly what they just signed up for. */
  detail: string
  /** Pressure this tier costs. Priced against how much it ACTUALLY hurts, not
   *  how scary it sounds (the ToA min-max lesson). */
  pressure: number
  /** COMBAT effects, folded into the same TideEffect pipeline as boons/curses.
   *  Most terms are structural (they reshape the run), but the SKILL terms are
   *  honest combat modifiers — the distinction that matters is that a curse is
   *  random and imposed, while a term is chosen. */
  effects?: TideEffect[]
}

export type TermGroup = 'opposition' | 'gunnery' | 'crew' | 'build' | 'safety'

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
  gunnery:    { label: 'Your Gunnery',   blurb: 'What your aim is worth. Shoot well, or do not shoot.', accent: '#f0c040' },
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
    flavor: 'He does not send more captains. He sends better ones.',
    tiers: [
      { desc: 'Bosses are tougher and hit harder',
        detail: 'Every boss you meet comes with noticeably more hull and heavier guns. Bosses appear no more often than usual, they are simply worse to meet.',
        pressure: 3 },
      { desc: 'Bosses are far tougher and hit far harder',
        detail: 'Every boss carries a great deal more hull and lands much heavier blows. A boss becomes the thing most likely to end your run.',
        pressure: 5 },
    ],
  },

  {
    id: 'crowned', name: 'Crowned', group: 'opposition',
    flavor: 'He sets his own mark on every captain he sends up.',
    tiers: [
      { desc: 'Every boss carries an elite affix',
        detail: 'Bosses have never carried affixes before. Now every one of them does: a random elite power (Warded, Vampiric, Frenzied, and the rest) stacked on top of everything a boss already is.',
        pressure: 4 },
      { desc: 'Every boss carries TWO elite affixes',
        detail: 'Every boss comes crowned with two random elite powers at once, merged into a single monstrous captain. Bosses are already the most likely thing to end your run.',
        pressure: 6 },
    ],
  },

  // ── Your gunnery (skill) ──────────────────────────────────────────────────
  {
    id: 'nothing_but_gold', name: 'Nothing but Gold', group: 'gunnery',
    flavor: 'A glancing blow is no blow at all. He only counts the clean ones.',
    tiers: [
      { desc: 'Anything that is not a CRIT deals 25% less damage',
        detail: 'Only critical hits land at full strength. Every ordinary hit and graze is cut by a quarter, so the gold crit band on the aim bar is the whole game. Pure skill: hit it and lose nothing, miss it and bleed damage all run.',
        pressure: 3,
        effects: [{ kind: 'noncritDmgMult', mult: 0.75 }] },
      { desc: 'Anything that is not a CRIT deals 50% less damage',
        detail: 'Every hit that is not a critical does HALF damage. If you cannot find the gold band consistently, you will not out-damage anything down there.',
        pressure: 6,
        effects: [{ kind: 'noncritDmgMult', mult: 0.50 }] },
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
  // ── Your safety net ───────────────────────────────────────────────────────
  {
    id: 'loose_tongue', name: 'Loose Tongue', group: 'safety',
    flavor: 'He will not stop talking, and every word costs you.',
    tiers: [
      { desc: 'Curses come more often',
        detail: 'The Locker curses you more frequently than usual. The curses themselves are unchanged, there are simply more of them.',
        pressure: 4 },
      { desc: 'Curses come more often, and start at their WORST tier',
        detail: 'Curses arrive more frequently AND every one lands at its second, nastier tier straight away instead of building up to it.',
        pressure: 6 },
    ],
  },
  {
    id: 'deep_draft', name: 'Deep Draft', group: 'safety',
    flavor: 'She rides low the whole way down, and she never rides high again.',
    tiers: [
      { desc: 'Your MAXIMUM hull is cut to 85%',
        detail: 'Your maximum hull is 15% smaller for the entire run. This is not damage you can patch. Every heal, every repair, tops you up to the smaller number.',
        pressure: 2 },
      { desc: 'Your MAXIMUM hull is cut to 70%',
        detail: 'Your maximum hull is 30% smaller for the entire run. Nothing restores it. You fight the whole descent on a permanently smaller ship.',
        pressure: 4 },
    ],
  },
  {
    id: 'no_mercy', name: 'No Mercy', group: 'safety',
    flavor: 'The anchor does not hold. Not this time.',
    tiers: [
      { desc: 'Lethal saves do not fire',
        detail: 'Any effect that would normally save you from a killing blow (an Anchor from your equipped items) does nothing. The first blow that would sink you, sinks you. If you carry no Anchor, this costs you nothing.',
        pressure: 2 },
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
    id: 'iron_rations', name: 'Iron Rations', group: 'safety',
    flavor: 'Salt beef and bilge water. Nothing down here mends a ship.',
    tiers: [
      { desc: 'Every heal you get is HALVED',
        detail: 'Everything that would put hull back on your ship gives you half as much: crew heals, repair kits, lifesteal, regeneration, the patch-up between fights, and the reprieves.',
        pressure: 3,
        effects: [{ kind: 'healMult', mult: 0.5 }] },
      { desc: 'NOTHING heals you. Not one point.',
        detail: 'No healing works at all for the whole run. Crew heals, repair kits, lifesteal, regen, between-fight repairs, reprieves: all of it does nothing. Every point of hull you lose is gone for good.',
        pressure: 6,
        effects: [{ kind: 'healMult', mult: 0 }] },
    ],
  },
  {
    id: 'full_measure', name: 'The Full Measure', group: 'safety',
    flavor: 'He does not take half of anything.',
    tiers: [
      { desc: 'The Blood Price drops you to 1 hull instead of costing half',
        detail: 'At a Drowned Shrine you can normally bleed HALF your hull onto the stone for an extra boon. Now that offering takes everything: it leaves you on 1 hull. The boon is still yours, if you can survive to use it.',
        pressure: 2 },
    ],
  },
  {
    id: 'no_second_thoughts', name: 'No Second Thoughts', group: 'safety',
    flavor: 'You do not leave his table between hands. You leave when a captain falls.',
    tiers: [
      { desc: 'You can ONLY cash out after beating a boss',
        detail: 'Normally you may bank your pot at any breather. Now Davy only lets you leave once you have just put a boss down. Frightened halfway between bosses? Too bad. You keep diving, or you sink with the pot.',
        pressure: 5 },
    ],
  },
  {
    id: 'blind_descent', name: 'Blind Descent', group: 'safety',
    flavor: 'Down you go, and you will meet it when you meet it.',
    tiers: [
      { desc: 'You cannot see what waits below',
        detail: 'The Sounding Line normally shows you what the next fight is (a boss, an elite, or open water) while you decide whether to dive on or cash out. It is gone. Every dive is blind, and so is every decision to keep going.',
        pressure: 2 },
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
/** Blood Gems gained per point of Pressure, at full depth.
 *  RETUNED with the board: the ceiling below must stay expensive. */
export const PRESSURE_GEM_RATE = 0.075
/** Pressure at which the multiplier tops out (still x4.0 — 1 + 40 * 0.075).
 *  Above this, extra Pressure is pure flex: it buys the Ledger and the skin,
 *  not more gems.
 *  KEEP THIS AT ROUGHLY HALF OF MAX_AVAILABLE_PRESSURE. The whole point (the ToA
 *  lesson) is that you cannot reach the ceiling on cheap terms alone — you have
 *  to eat Skeleton Crew II, Iron Rations II, No Communion II and the like. Every
 *  time a term is ADDED the board grows and this must grow with it, or the
 *  ceiling silently gets cheaper. */
export const PRESSURE_CAP = 40
/** Below this depth the Pressure bonus is worth NOTHING. */
export const PRESSURE_DEPTH_FLOOR = 20
/** At this depth (and deeper) the Pressure bonus pays in full.
 *  TUNED 30, not 40: a heavily-signed run realistically DIES around depth 25-30,
 *  so a full-value depth of 40 meant a max-Pressure run earned LESS than a clean
 *  one at the depths it could actually reach — nobody would ever sign anything.
 *  30 keeps shallow farming worthless (depth 20 still pays zero bonus) while
 *  making a heavy run that claws to 28-30 genuinely worth the risk. */
export const PRESSURE_DEPTH_FULL = 30
/** Cash out at or above this Pressure to earn the Terms-only skin. Scaled with
 *  the board (see PRESSURE_CAP). */
export const PRESSURE_SKIN_THRESHOLD = 25

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
  /** Extra multipliers on BOSS hull / damage. Davy's Court makes the bosses you
   *  meet meaner rather than more frequent — more of them would have partly paid
   *  you back (bosses feed 3x into the pot and refresh every crew ability). */
  bossHpMult: number
  bossDmgMult: number
  /** Crowned: how many random elite affixes a BOSS carries (0 = none, the way
   *  bosses have always fought). */
  bossAffixCount: number
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
  /** Multiplies how often curses are drawn. */
  curseFrequencyMult: number
  /** Curses land straight at tier 2. */
  curseStartsAtWorst: boolean
  /** Multiplies your MAXIMUM hull for the whole run. Not damage: the ceiling
   *  itself is lower, so heals only ever top you up to the smaller number. */
  maxHpPct: number
  /** Lethal saves (Anchor) are dead. */
  noLethalSaves: boolean
  /** Reprieves never appear. */
  noReprieves: boolean
  /** No peeking at the next fight. */
  noPeek: boolean
  /** The Full Measure: a shrine's Blood Price leaves you on 1 hull rather than
   *  taking half of what you have. */
  bloodPriceToOne: boolean
  /** No Second Thoughts: you may only bank the pot on a breather that follows a
   *  BOSS kill. The mode's core safety valve, taken away. */
  cashOutOnlyAfterBoss: boolean
  /** Iron Rations. The COMBAT heals ride the TideEffect of the same name (see
   *  termTideEffects), but the Gauntlet's own heals (Vigor after a kill, the
   *  reprieve patch-up) sit outside that pipeline, so they read this. Keep the
   *  two in step: both are driven by the one term. */
  healMult: number
}

export const NO_TERM_EFFECTS: TermEffects = {
  eliteChanceMult: 1,
  affixPairFromStart: false,
  tripleAffixChance: 0,
  eliteHpMult: 1,
  eliteDmgMult: 1,
  bossHpMult: 1,
  bossDmgMult: 1,
  bossAffixCount: 0,
  crewRefreshChance: 1,
  crewSlotsLost: 0,
  boonPicks: 3,
  boonFrequencyMult: 1,
  commonSkew: 0,
  confluenceOfferMult: 1,
  curseFrequencyMult: 1,
  curseStartsAtWorst: false,
  maxHpPct: 1,
  noLethalSaves: false,
  noReprieves: false,
  noPeek: false,
  bloodPriceToOne: false,
  cashOutOnlyAfterBoss: false,
  healMult: 1,
}

/** The COMBAT effects a signed board contributes (the skill terms). Folded into
 *  the run's TideEffect list alongside boons, curses and confluences. */
export function termTideEffects(signed: SignedTerms | null | undefined): TideEffect[] {
  if (!signed) return []
  const out: TideEffect[] = []
  for (const [id, tier] of Object.entries(signed)) {
    const t = getTerm(id)
    if (!t || tier < 1) continue
    const lvl = t.tiers[Math.min(tier, t.tiers.length) - 1]
    if (lvl?.effects) out.push(...lvl.effects)
  }
  return out
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
    e.bossHpMult  = court === 1 ? 1.25 : 1.5
    e.bossDmgMult = court === 1 ? 1.15 : 1.3
  }

  e.bossAffixCount = tierOf('crowned')

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

  const tongue = tierOf('loose_tongue')
  if (tongue) {
    e.curseFrequencyMult = tongue === 1 ? 1.5 : 1.9
    if (tongue >= 2) e.curseStartsAtWorst = true
  }

  const draft = tierOf('deep_draft')
  if (draft) e.maxHpPct = draft === 1 ? 0.85 : 0.70

  if (tierOf('full_measure'))  e.bloodPriceToOne = true
  if (tierOf('no_second_thoughts')) e.cashOutOnlyAfterBoss = true

  const rations = tierOf('iron_rations')
  if (rations) e.healMult = rations === 1 ? 0.5 : 0
  if (tierOf('no_mercy'))      e.noLethalSaves = true
  if (tierOf('no_quarter'))    e.noReprieves   = true
  if (tierOf('blind_descent')) e.noPeek        = true

  return e
}
