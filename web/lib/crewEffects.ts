// Crew effects (Darkest-Dungeon-style quirks) for the recruit system.
//
// Each effect has a SCOPE that says where it matters + what payload it carries:
//   - 'always'      : passive stat modifiers (flat and/or percent). Applied to
//                     the crew's displayed/effective stats right now.
//   - 'raid'        : only matters in raid combat (damage, crit, survivability,
//                     first strike). Defined + displayed now; applied once crew
//                     are wired into raids (Phase 2).
//   - 'voyage'      : only matters on voyages (score / doubloons / XP). Phase 2.
//   - 'conditional' : bearer-only, depends on the loadout/context (small crew,
//                     captain slot, same-zone allies). `cond` key drives it.
//   - 'aura'        : TEAM-WIDE. Its payload applies to every crew member aboard
//                     (incl. the bearer). Resolved in Phase 2.
//
// And a minRarity gate: basic passive-flat traits can land on any rarity, while
// the stronger effects (percent / raid / voyage / conditional / aura) only roll
// on Epic+ crew (rarity >= 3). Rare and below get the generic flat traits only.
//
// Effects are stored on a crew member as an array of ids, so retuning a value
// here updates every crew that carries it.

import { traitDefFor } from './crewTraits'
import { applyLevelBonuses } from './crewLevel'

export type StatKey = 'power' | 'dodge' | 'fortune'
export type CrewEffectKind = 'buff' | 'flaw'
export type CrewEffectScope = 'always' | 'raid' | 'voyage' | 'conditional' | 'aura'

export interface CrewEffect {
  id: string
  name: string
  /** One short line, shown in the detail modal. No em-dashes, pirate voice. */
  desc: string
  kind: CrewEffectKind
  scope: CrewEffectScope
  /** Minimum crew rarity (1-4) that can roll this. Basic flat = 1, stronger = 3. */
  minRarity: 1 | 2 | 3 | 4
  /** Flat stat mod. For 'always' it's applied to displayed stats; for aura/
   *  conditional it's the payload granted (to all / when the cond holds). */
  flat?: Partial<Record<StatKey, number>>
  /** Percent stat mod, e.g. { power: 25 } = +25% power. */
  pct?: Partial<Record<StatKey, number>>
  /** Raid combat modifiers (Phase 2). */
  raid?: { damagePct?: number; damageTakenPct?: number; critPct?: number; firstStrike?: boolean }
  /** Voyage modifiers (Phase 2). */
  voyage?: { scorePct?: number; doubloonPct?: number; xpPct?: number }
  /** Condition key for 'conditional' effects, interpreted by the Phase 2 resolver. */
  cond?: 'small_crew' | 'captain' | 'not_captain' | 'same_zone_ally'
}

export const CREW_EFFECTS: Record<string, CrewEffect> = {
  // ── Passive · flat — the generic pool, any rarity (minRarity 1) ───────────
  dead_eye:     { id: 'dead_eye',     name: 'Dead Eye',     kind: 'buff', scope: 'always', minRarity: 1, flat: { power: 3 },                       desc: 'A gunner whose aim never wavers.' },
  cold_blood:   { id: 'cold_blood',   name: 'Cold Blood',   kind: 'buff', scope: 'always', minRarity: 1, flat: { dodge: 3 },                       desc: 'Nothing on the water can rattle them.' },
  born_lucky:   { id: 'born_lucky',   name: 'Born Lucky',   kind: 'buff', scope: 'always', minRarity: 1, flat: { fortune: 3 },                     desc: 'The tide always seems to break their way.' },
  iron_gut:     { id: 'iron_gut',     name: 'Iron Gut',     kind: 'buff', scope: 'always', minRarity: 1, flat: { dodge: 2 },                       desc: 'Takes a beating and asks for seconds.' },
  salt_veteran: { id: 'salt_veteran', name: 'Salt Veteran', kind: 'buff', scope: 'always', minRarity: 1, flat: { power: 1, dodge: 1, fortune: 1 }, desc: 'Years of brine worked into the bones.' },
  greenhorn:     { id: 'greenhorn',     name: 'Greenhorn',     kind: 'flaw', scope: 'always', minRarity: 1, flat: { power: -2 },              desc: 'Still finding their sea legs.' },
  yellow_streak: { id: 'yellow_streak', name: 'Yellow Streak', kind: 'flaw', scope: 'always', minRarity: 1, flat: { dodge: -2 },              desc: 'Flinches when the cannons roar.' },
  jonah:         { id: 'jonah',         name: 'Jonah',         kind: 'flaw', scope: 'always', minRarity: 1, flat: { fortune: -2 },            desc: 'Bad luck trails them like a gull.' },
  butterfingers: { id: 'butterfingers', name: 'Butterfingers', kind: 'flaw', scope: 'always', minRarity: 1, flat: { power: -1, fortune: -1 }, desc: 'Drops more than they ever hold.' },

  // ── Passive · percent — Epic+ ────────────────────────────────────────────
  sharpshooter: { id: 'sharpshooter', name: 'Sharpshooter', kind: 'buff', scope: 'always', minRarity: 3, pct: { power: 25 },   desc: 'A natural shot; their power runs a quarter hotter.' },
  quick_fins:   { id: 'quick_fins',   name: 'Quick Fins',   kind: 'buff', scope: 'always', minRarity: 3, pct: { dodge: 25 },   desc: 'Slips every net; Savvy up by a quarter.' },
  charmed:      { id: 'charmed',      name: 'Charmed',      kind: 'buff', scope: 'always', minRarity: 3, pct: { fortune: 25 }, desc: 'Fortune clings to them; luck up by a quarter.' },
  brittle:      { id: 'brittle',      name: 'Brittle',      kind: 'flaw', scope: 'always', minRarity: 3, pct: { dodge: -20 },  desc: 'Soft in a scrap; Savvy cut by a fifth.' },

  // ── Raid — Epic+ (Phase 2) ───────────────────────────────────────────────
  berserker:    { id: 'berserker',    name: 'Berserker',    kind: 'buff', scope: 'raid', minRarity: 3, raid: { damagePct: 20 },       desc: 'Fights like a cornered shark: 20% more raid damage.' },
  bulwark:      { id: 'bulwark',      name: 'Bulwark',      kind: 'buff', scope: 'raid', minRarity: 3, raid: { damageTakenPct: -20 }, desc: 'A wall of muscle; takes 20% less damage in raids.' },
  keen_cutlass: { id: 'keen_cutlass', name: 'Keen Cutlass', kind: 'buff', scope: 'raid', minRarity: 3, raid: { critPct: 15 },        desc: 'Finds the soft spots; +15% crit in raids.' },
  first_strike: { id: 'first_strike', name: 'First Strike', kind: 'buff', scope: 'raid', minRarity: 3, raid: { firstStrike: true },  desc: 'Always swings first when the boarding begins.' },
  landlocked:   { id: 'landlocked',   name: 'Landlocked',   kind: 'flaw', scope: 'raid', minRarity: 3, raid: { damagePct: -15 },      desc: 'No stomach for a brawl; 15% less raid damage.' },
  soft_shell:   { id: 'soft_shell',   name: 'Soft Shell',   kind: 'flaw', scope: 'raid', minRarity: 3, raid: { damageTakenPct: 15 },  desc: 'Bruises easy; takes 15% more damage in raids.' },

  // ── Voyage — Epic+ (Phase 2) ─────────────────────────────────────────────
  pathfinder: { id: 'pathfinder', name: 'Pathfinder', kind: 'buff', scope: 'voyage', minRarity: 3, voyage: { scorePct: 10 },    desc: 'Reads the currents like a map; +10% Voyage Score.' },
  pillager:   { id: 'pillager',   name: 'Pillager',   kind: 'buff', scope: 'voyage', minRarity: 3, voyage: { doubloonPct: 15 }, desc: 'Never leaves coin behind; +15% doubloons from voyages.' },
  scholar:    { id: 'scholar',    name: 'Scholar',    kind: 'buff', scope: 'voyage', minRarity: 3, voyage: { xpPct: 15 },       desc: 'Logs every lesson; +15% voyage XP.' },
  seasick:    { id: 'seasick',    name: 'Seasick',    kind: 'flaw', scope: 'voyage', minRarity: 3, voyage: { scorePct: -10 },   desc: 'Green at the rail; −10% Voyage Score.' },

  // ── Conditional / synergy — Epic+ (Phase 2) ──────────────────────────────
  lone_wolf:   { id: 'lone_wolf',   name: 'Lone Wolf',   kind: 'buff', scope: 'conditional', minRarity: 3, cond: 'small_crew',     flat: { power: 3, dodge: 3, fortune: 3 }, desc: 'Works best alone: +3 to all stats with a crew of two or fewer.' },
  pack_hunter: { id: 'pack_hunter', name: 'Pack Hunter', kind: 'buff', scope: 'conditional', minRarity: 3, cond: 'same_zone_ally', flat: { power: 2 },                      desc: 'Hunts in numbers: +2 Power for each crewmate from the same waters.' },
  flagship:    { id: 'flagship',    name: 'Flagship',    kind: 'buff', scope: 'conditional', minRarity: 3, cond: 'captain',        voyage: { scorePct: 10 },                desc: 'Born to lead: +10% Voyage Score while serving as captain.' },
  prima_donna: { id: 'prima_donna', name: 'Prima Donna', kind: 'flaw', scope: 'conditional', minRarity: 3, cond: 'not_captain',    flat: { power: -2, dodge: -2, fortune: -2 }, desc: 'Sulks below the top job: −2 to all stats unless captain.' },

  // ── Aura — TEAM-WIDE, Epic+ (Phase 2) ────────────────────────────────────
  quartermaster: { id: 'quartermaster', name: 'Quartermaster', kind: 'buff', scope: 'aura', minRarity: 3, flat: { power: 1 },         desc: 'Drills the deck daily: +1 Power to every hand aboard.' },
  helmsman:      { id: 'helmsman',      name: 'Helmsman',      kind: 'buff', scope: 'aura', minRarity: 3, flat: { dodge: 1 },         desc: 'Steers true through any swell: +1 Savvy to every hand aboard.' },
  mascot:        { id: 'mascot',        name: 'Mascot',        kind: 'buff', scope: 'aura', minRarity: 3, flat: { fortune: 1 },       desc: 'Lifts the whole deck: +1 Fortune to every hand aboard.' },
  war_drummer:   { id: 'war_drummer',   name: 'War Drummer',   kind: 'buff', scope: 'aura', minRarity: 3, raid: { damagePct: 10 },    desc: 'Beats the charge: the whole crew deals 10% more raid damage.' },
  shanty_singer: { id: 'shanty_singer', name: 'Shanty Singer', kind: 'buff', scope: 'aura', minRarity: 3, voyage: { scorePct: 5 },    desc: 'Keeps spirits high: +5% Voyage Score for the whole crew.' },
  albatross:     { id: 'albatross',     name: 'Albatross',     kind: 'flaw', scope: 'aura', minRarity: 3, flat: { fortune: -1 },      desc: 'A bad omen at the rail: −1 Fortune to every hand aboard.' },
}

export const BUFF_IDS: string[] = Object.values(CREW_EFFECTS).filter(e => e.kind === 'buff').map(e => e.id)
export const FLAW_IDS: string[] = Object.values(CREW_EFFECTS).filter(e => e.kind === 'flaw').map(e => e.id)

/** Effect ids a crew of the given rarity is allowed to roll (minRarity gate). */
export function effectPoolForRarity(rarity: number): string[] {
  return Object.values(CREW_EFFECTS).filter(e => e.minRarity <= rarity).map(e => e.id)
}

// Display metadata per scope (tag label + accent color).
export const SCOPE_META: Record<CrewEffectScope, { label: string; color: string }> = {
  always:      { label: 'Passive',     color: '#9aa0a6' },
  raid:        { label: 'Raid',        color: '#f0a36a' },
  voyage:      { label: 'Voyage',      color: '#6fb6c9' },
  conditional: { label: 'Situational', color: '#c0a0e6' },
  aura:        { label: 'Crew Aura',   color: '#7fd0a0' },
}

const LBL: Record<StatKey, string> = { power: 'PWR', dodge: 'SAV', fortune: 'FTN' }

export function getCrewEffect(id: string): CrewEffect | undefined {
  return CREW_EFFECTS[id]
}

/** Resolve a list of effect ids to their definitions, dropping unknown ids. */
export function resolveEffects(ids: string[] | null | undefined): CrewEffect[] {
  if (!ids) return []
  return ids.map(id => CREW_EFFECTS[id]).filter((e): e is CrewEffect => !!e)
}

/** A short headline of what an effect does, for the trait row. */
export function effectSummary(e: CrewEffect): string {
  const parts: string[] = []
  const stats: StatKey[] = ['power', 'dodge', 'fortune']
  if (e.flat) for (const k of stats) if (e.flat[k]) parts.push(`${e.flat[k]! > 0 ? '+' : ''}${e.flat[k]} ${LBL[k]}`)
  if (e.pct) for (const k of stats) if (e.pct[k]) parts.push(`${e.pct[k]! > 0 ? '+' : ''}${e.pct[k]}% ${LBL[k]}`)
  if (e.raid) {
    if (e.raid.damagePct) parts.push(`${e.raid.damagePct > 0 ? '+' : ''}${e.raid.damagePct}% dmg`)
    if (e.raid.damageTakenPct) parts.push(`${e.raid.damageTakenPct > 0 ? '+' : ''}${e.raid.damageTakenPct}% dmg taken`)
    if (e.raid.critPct) parts.push(`${e.raid.critPct > 0 ? '+' : ''}${e.raid.critPct}% crit`)
    if (e.raid.firstStrike) parts.push('first strike')
  }
  if (e.voyage) {
    if (e.voyage.scorePct) parts.push(`${e.voyage.scorePct > 0 ? '+' : ''}${e.voyage.scorePct}% score`)
    if (e.voyage.doubloonPct) parts.push(`${e.voyage.doubloonPct > 0 ? '+' : ''}${e.voyage.doubloonPct}% gold`)
    if (e.voyage.xpPct) parts.push(`${e.voyage.xpPct > 0 ? '+' : ''}${e.voyage.xpPct}% XP`)
  }
  return parts.join(' · ')
}

// ── Simplified trait system (2026-06-08) ────────────────────────────────────
// Traits are stat triples now ({power, dodge, fortune} each in [-3,+3], net
// -9..+9) — no auras, no percentages, no raid/voyage/conditional effects.
// New recruits roll a single 's:P,D,F' encoded trait via lib/crewGen
// rollTrait/encodeTraitId. Legacy crew with old named ids (dead_eye etc.)
// get migrated *implicitly*: decodeTraitStats below honors their `flat`
// field only if they had NO non-flat behavior. If they had any pct / raid
// / voyage / conditional / aura effect the trait is treated as lost
// (returns null) — per the design call, old crew don't keep half-broken
// special traits, only the strictly flat-stat ones survive.

export interface TraitStats {
  power:   number
  dodge:   number
  fortune: number
}

/** Decode a trait id to its stat triple. Returns null if the id is unknown
 *  or refers to a legacy trait whose flat-only filter strips it (e.g. an
 *  aura with no flat field, or a percent-only buff). */
export function decodeTraitStats(id: string): TraitStats | null {
  if (id.startsWith('s:')) {
    const parts = id.slice(2).split(',').map(Number)
    // Range is -4..4, NOT -3..3. Recruits still cap at 3, but the Leviathan
    // bunk rolls to 4, and a decode that rejected those would not fail loudly:
    // it returns null, the trait reads as absent, and the best roll in the game
    // silently evaporates on the next read.
    if (parts.length === 3 && parts.every(n => Number.isInteger(n) && n >= -4 && n <= 4)) {
      return { power: parts[0], dodge: parts[1], fortune: parts[2] }
    }
    return null
  }
  // Legacy id — honor the flat field if and only if the trait had NO
  // non-flat behavior. Otherwise the trait is lost.
  const old = CREW_EFFECTS[id]
  if (!old) return null
  const hasNonFlat = !!(old.pct || old.raid || old.voyage || old.cond || old.scope === 'aura' || old.scope === 'conditional' || old.scope === 'raid' || old.scope === 'voyage')
  if (hasNonFlat) return null
  if (!old.flat) return null
  return {
    power:   old.flat.power   ?? 0,
    dodge:   old.flat.dodge   ?? 0,
    fortune: old.flat.fortune ?? 0,
  }
}

/** Aggregate every readable trait on a crew into one stat triple. Old
 *  crew with multiple legacy effects sum them all. */
export function netTraitStats(ids: string[] | null | undefined): TraitStats {
  const out: TraitStats = { power: 0, dodge: 0, fortune: 0 }
  if (!ids) return out
  for (const id of ids) {
    const s = decodeTraitStats(id)
    if (!s) continue
    out.power   += s.power
    out.dodge   += s.dodge
    out.fortune += s.fortune
  }
  return out
}

// ── Generated trait labels ──────────────────────────────────────────────────
// Maps a stat triple to an evocative name. The label is pure cosmetic —
// players see the exact stat deltas next to it on the detail modal — so the
// pool is small enough to memorize but big enough to feel fresh.

// Four tiers now, the last reachable only from the Leviathan bunk, so a
// single-stat 4 reads as its own thing rather than sharing a name with a 3.
const SINGLE_LABELS: Record<'power'|'dodge'|'fortune', { pos: [string, string, string, string]; neg: [string, string, string, string] }> = {
  power:   { pos: ['Brawler', 'Strong',    'Titan',   'Colossus'   ], neg: ['Soft',     'Weak',      'Feeble',   'Broken'  ] },
  dodge:   { pos: ['Quick',   'Nimble',    'Phantom', 'Untouchable'], neg: ['Sluggish', 'Lumbering', 'Anchored', 'Leaden'  ] },
  fortune: { pos: ['Lucky',   'Fortunate', 'Charmed', 'Blessed'    ], neg: ['Unlucky',  'Hexed',     'Doomed',   'Accursed'] },
}

// Two-stat names, four tiers deep like the single-stat ones. Tiered on the
// COMBINED magnitude (2 through 8), so only a (+4,+4) lands the top word and
// it stays the trophy it should be.
//
// Keyed by the sorted stat pair. The middle entry of each row is the name that
// pair carried before tiers existed, kept in place so the most common results
// still read the way players already know them.
const PAIR_POS: Record<string, [string, string, string, string]> = {
  'dodge+power':   ['Scrapper', 'Warrior',  'Warlord',   'Warmaster'  ],
  'fortune+power': ['Hunter',   'Raider',   'Marauder',  'Scourge'    ],
  'dodge+fortune': ['Scout',    'Ranger',   'Outrider',  'Windrunner' ],
}
const PAIR_NEG: Record<string, [string, string, string, string]> = {
  'dodge+power':   ['Bruised',  'Battered', 'Mauled',    'Ruined'     ],
  'fortune+power': ['Hapless',  'Forsaken', 'Wretched',  'Damnable'   ],
  'dodge+fortune': ['Idle',     'Listless', 'Adrift',    'Becalmed'   ],
}
const PAIR_MIXED: Record<string, [string, string, string, string]> = {
  'dodge+power':   ['Uneven',   'Glass Cannon', 'Powder Keg', 'Shipbreaker'],
  'fortune+power': ['Rash',     'Reckless',     'Headlong',   'Hellbent'   ],
  'dodge+fortune': ['Shifty',   'Slippery',     'Quicksilver','Wisp'       ],
}

/** Combined magnitude (2..8) to a 0..3 tier. Only a double 4 reaches the top. */
function pairTier(total: number): 0 | 1 | 2 | 3 {
  if (total >= 8) return 3
  if (total >= 6) return 2
  if (total >= 4) return 1
  return 0
}

/** Generate an evocative label for a trait. Empty string when the trait is
 *  fully neutral (caller renders no row). */
export function traitLabel(s: TraitStats): string {
  const stats = (['power','dodge','fortune'] as const)
  const nonZero = stats.filter(k => s[k] !== 0)

  if (nonZero.length === 0) return ''

  // Single-stat trait → use the dedicated name + magnitude tier.
  if (nonZero.length === 1) {
    const k = nonZero[0]
    const v = s[k]
    const tier = Math.min(4, Math.abs(v)) - 1     // 0..3
    return v > 0 ? SINGLE_LABELS[k].pos[tier] : SINGLE_LABELS[k].neg[tier]
  }

  // Two-stat trait → named by WHICH pair moved, their dominant sign, and how
  // far. The magnitude tier is the part that used to be missing: every pair had
  // exactly one name, so a (+4,+4,0) — one of the best rolls in the game —
  // read as plain "Warrior", the same word as a (+1,+1,0). Single-stat traits
  // had four tiers each while the pairs, which are what you actually end up
  // comparing, had none.
  if (nonZero.length === 2) {
    const positive = nonZero.filter(k => s[k] > 0)
    const negative = nonZero.filter(k => s[k] < 0)
    const pair = nonZero.map(k => k).sort().join('+')
    const tier = pairTier(nonZero.reduce((n, k) => n + Math.abs(s[k]), 0))
    const table = positive.length === 2 ? PAIR_POS : negative.length === 2 ? PAIR_NEG : PAIR_MIXED
    return (table[pair] ?? table['dodge+power'])[tier]
  }

  // THE TABLE'S OWN NAME WINS. Deep re-cuts draw from a written list where
  // every entry is named (lib/crewTraits), so "Reckless" reads as a thing
  // somebody wrote rather than as "+4/-2/0". The band labels below are kept as
  // the FALLBACK, and that is load-bearing: every crew rolled before the table
  // existed, and every recruit-board trait, still comes from the old weighted
  // roll. Without the fallback they would all lose their labels at once.
  const def = traitDefFor(s)
  if (def) return def.name

  // Three-stat trait → broad labels by net direction.
  const net = s.power + s.dodge + s.fortune
  const allPos = stats.every(k => s[k] > 0)
  const allNeg = stats.every(k => s[k] < 0)
  if (allPos) {
    // Divine is the perfect roll and NOTHING else: +4 in all three, the hard
    // ceiling of the deep roll and unreachable from a recruit board. Demigod
    // used to cover the top two nets together, which meant the best trait in
    // the game shared a name with a near-miss and the only way to tell them
    // apart was to read the numbers. A trophy needs its own word.
    //
    // EXALTED and ASCENDANT split the run-up for the same reason. A normal
    // stat tops out at 3, so nets 10 and 11 are not "a bit more Demigod" —
    // they are exactly ONE deep 4 and exactly TWO of them, the only visible
    // proof of how far along the Leviathan chase a hand is. Left merged, the
    // longest grind in the game showed no progress at all: a crew sat on
    // "Demigod" from its first 3/3/3 until the moment it turned Divine.
    //
    // Every band below is UNCHANGED, deliberately, and these two carve out
    // nets that were impossible before the deep roll existed — so not one
    // crew already out there gets silently relabelled by any of this.
    if (net === 12) return 'Divine'
    if (net === 11) return 'Ascendant'
    if (net === 10) return 'Exalted'
    if (net >= 8) return 'Demigod'
    if (net >= 5) return 'Champion'
    return 'Versatile'
  }
  if (allNeg) {
    if (net === -12) return 'Blighted'
    if (net <= -8) return 'Damned'
    if (net <= -5) return 'Plagued'
    return 'Burdened'
  }
  // Mixed signs across all three.
  return net >= 0 ? 'Mercurial' : 'Errant'
}

/** THE top trait: +4 in all three, the ceiling of the deep roll.
 *
 *  Compared by LABEL rather than by summing to 12, so this and traitLabel can
 *  never disagree about what earns the sheen. Lives here because three surfaces
 *  need it (roster card, detail modal, bunk picker) and a local copy in each is
 *  how the drop-rate maths drifted. */
export function isDivineTrait(t: TraitStats): boolean {
  return traitLabel(t) === 'Divine'
}

/** Whether a trait is a net buff, flaw, or neutral — drives the color
 *  treatment in the detail modal. */
export function traitKind(s: TraitStats): 'buff' | 'flaw' | 'neutral' {
  const net = s.power + s.dodge + s.fortune
  if (net > 0) return 'buff'
  if (net < 0) return 'flaw'
  return 'neutral'
}

/** Base stats plus the net of every readable trait on the crew. Simplified
 *  from the old percentage/raid/voyage/aura math — traits are stat-only
 *  now. Level bonuses fold in first so the trait sums onto a level-scaled
 *  base. */
export function applyCrewEffects(
  base: { power: number; dodge: number; fortune: number },
  ids: string[] | null | undefined,
  xp = 0,
): { power: number; dodge: number; fortune: number } {
  const leveled = xp > 0 ? applyLevelBonuses(base, xp) : base
  const t = netTraitStats(ids)
  return {
    power:   Math.max(1, leveled.power   + t.power),
    dodge:   Math.max(1, leveled.dodge   + t.dodge),
    fortune: Math.max(1, leveled.fortune + t.fortune),
  }
}
