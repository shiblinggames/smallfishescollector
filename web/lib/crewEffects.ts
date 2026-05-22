// Crew effects (Darkest-Dungeon-style quirks) for the recruit system.
//
// Each effect has a SCOPE that says where it matters and what payload it carries:
//   - 'always'      : passive stat modifiers (flat and/or percent). Applied to
//                     the crew's displayed/effective stats right now.
//   - 'raid'        : only matters in raid combat (damage, crit, survivability,
//                     first strike). Defined + displayed now; applied once crew
//                     are wired into raids (Phase 2).
//   - 'voyage'      : only matters on voyages (score / doubloons / XP). Phase 2.
//   - 'conditional' : depends on the loadout/context (small crew, captain slot,
//                     same-zone allies, team aura). The payload it grants lives
//                     in the normal fields; a `cond` key tells the Phase 2
//                     resolver when to apply it. Not applied to base stats here.
//
// Effects are stored on a crew member as an array of ids, so retuning a value
// here updates every crew that carries it.

export type StatKey = 'power' | 'dodge' | 'fortune'
export type CrewEffectKind = 'buff' | 'flaw'
export type CrewEffectScope = 'always' | 'raid' | 'voyage' | 'conditional'

export interface CrewEffect {
  id: string
  name: string
  /** One short line, shown in the detail modal. No em-dashes, pirate voice. */
  desc: string
  kind: CrewEffectKind
  scope: CrewEffectScope
  /** Passive flat stat mod (applied to displayed stats when scope === 'always';
   *  for conditional effects this is the payload granted when the cond holds). */
  flat?: Partial<Record<StatKey, number>>
  /** Passive percent stat mod, e.g. { power: 25 } = +25% power. */
  pct?: Partial<Record<StatKey, number>>
  /** Raid combat modifiers (Phase 2). */
  raid?: { damagePct?: number; damageTakenPct?: number; critPct?: number; firstStrike?: boolean }
  /** Voyage modifiers (Phase 2). */
  voyage?: { scorePct?: number; doubloonPct?: number; xpPct?: number }
  /** Condition key for conditional effects, interpreted by the Phase 2 resolver. */
  cond?: 'small_crew' | 'captain' | 'not_captain' | 'same_zone_ally' | 'aura'
}

export const CREW_EFFECTS: Record<string, CrewEffect> = {
  // ── Passive · flat (buffs) ───────────────────────────────────────────────
  dead_eye:     { id: 'dead_eye',     name: 'Dead Eye',     kind: 'buff', scope: 'always', flat: { power: 3 },                 desc: 'A gunner whose aim never wavers.' },
  cold_blood:   { id: 'cold_blood',   name: 'Cold Blood',   kind: 'buff', scope: 'always', flat: { dodge: 3 },                 desc: 'Nothing on the water can rattle them.' },
  born_lucky:   { id: 'born_lucky',   name: 'Born Lucky',   kind: 'buff', scope: 'always', flat: { fortune: 3 },               desc: 'The tide always seems to break their way.' },
  iron_gut:     { id: 'iron_gut',     name: 'Iron Gut',     kind: 'buff', scope: 'always', flat: { dodge: 2 },                 desc: 'Takes a beating and asks for seconds.' },
  salt_veteran: { id: 'salt_veteran', name: 'Salt Veteran', kind: 'buff', scope: 'always', flat: { power: 1, dodge: 1, fortune: 1 }, desc: 'Years of brine worked into the bones.' },

  // ── Passive · flat (flaws) ───────────────────────────────────────────────
  greenhorn:     { id: 'greenhorn',     name: 'Greenhorn',     kind: 'flaw', scope: 'always', flat: { power: -2 },             desc: 'Still finding their sea legs.' },
  yellow_streak: { id: 'yellow_streak', name: 'Yellow Streak', kind: 'flaw', scope: 'always', flat: { dodge: -2 },             desc: 'Flinches when the cannons roar.' },
  jonah:         { id: 'jonah',         name: 'Jonah',         kind: 'flaw', scope: 'always', flat: { fortune: -2 },           desc: 'Bad luck trails them like a gull.' },
  butterfingers: { id: 'butterfingers', name: 'Butterfingers', kind: 'flaw', scope: 'always', flat: { power: -1, fortune: -1 }, desc: 'Drops more than they ever hold.' },

  // ── Passive · percent ────────────────────────────────────────────────────
  sharpshooter: { id: 'sharpshooter', name: 'Sharpshooter', kind: 'buff', scope: 'always', pct: { power: 25 },   desc: 'A natural shot; their power runs a quarter hotter.' },
  quick_fins:   { id: 'quick_fins',   name: 'Quick Fins',   kind: 'buff', scope: 'always', pct: { dodge: 25 },   desc: 'Slips every net; dodge up by a quarter.' },
  charmed:      { id: 'charmed',      name: 'Charmed',      kind: 'buff', scope: 'always', pct: { fortune: 25 }, desc: 'Fortune clings to them; luck up by a quarter.' },
  brittle:      { id: 'brittle',      name: 'Brittle',      kind: 'flaw', scope: 'always', pct: { dodge: -20 },  desc: 'Soft in a scrap; dodge cut by a fifth.' },

  // ── Raid (Phase 2) ───────────────────────────────────────────────────────
  berserker:    { id: 'berserker',    name: 'Berserker',    kind: 'buff', scope: 'raid', raid: { damagePct: 20 },       desc: 'Fights like a cornered shark: 20% more raid damage.' },
  bulwark:      { id: 'bulwark',      name: 'Bulwark',      kind: 'buff', scope: 'raid', raid: { damageTakenPct: -20 }, desc: 'A wall of muscle; takes 20% less damage in raids.' },
  keen_cutlass: { id: 'keen_cutlass', name: 'Keen Cutlass', kind: 'buff', scope: 'raid', raid: { critPct: 15 },        desc: 'Finds the soft spots; +15% crit in raids.' },
  first_strike: { id: 'first_strike', name: 'First Strike', kind: 'buff', scope: 'raid', raid: { firstStrike: true },  desc: 'Always swings first when the boarding begins.' },
  landlocked:   { id: 'landlocked',   name: 'Landlocked',   kind: 'flaw', scope: 'raid', raid: { damagePct: -15 },      desc: 'No stomach for a brawl; 15% less raid damage.' },
  soft_shell:   { id: 'soft_shell',   name: 'Soft Shell',   kind: 'flaw', scope: 'raid', raid: { damageTakenPct: 15 },  desc: 'Bruises easy; takes 15% more damage in raids.' },

  // ── Voyage (Phase 2) ─────────────────────────────────────────────────────
  pathfinder: { id: 'pathfinder', name: 'Pathfinder', kind: 'buff', scope: 'voyage', voyage: { scorePct: 10 },    desc: 'Reads the currents like a map; +10% Voyage Score.' },
  pillager:   { id: 'pillager',   name: 'Pillager',   kind: 'buff', scope: 'voyage', voyage: { doubloonPct: 15 }, desc: 'Never leaves coin behind; +15% doubloons from voyages.' },
  scholar:    { id: 'scholar',    name: 'Scholar',    kind: 'buff', scope: 'voyage', voyage: { xpPct: 15 },       desc: 'Logs every lesson; +15% voyage XP.' },
  seasick:    { id: 'seasick',    name: 'Seasick',    kind: 'flaw', scope: 'voyage', voyage: { scorePct: -10 },   desc: 'Green at the rail; −10% Voyage Score.' },

  // ── Conditional / synergy (Phase 2) ──────────────────────────────────────
  lone_wolf:   { id: 'lone_wolf',   name: 'Lone Wolf',   kind: 'buff', scope: 'conditional', cond: 'small_crew',     flat: { power: 3, dodge: 3, fortune: 3 }, desc: 'Works best alone: +3 to all stats with a crew of two or fewer.' },
  pack_hunter: { id: 'pack_hunter', name: 'Pack Hunter', kind: 'buff', scope: 'conditional', cond: 'same_zone_ally', flat: { power: 2 },                      desc: 'Hunts in numbers: +2 Power for each crewmate from the same waters.' },
  flagship:    { id: 'flagship',    name: 'Flagship',    kind: 'buff', scope: 'conditional', cond: 'captain',        voyage: { scorePct: 10 },                desc: 'Born to lead: +10% Voyage Score while serving as captain.' },
  mascot:      { id: 'mascot',      name: 'Mascot',      kind: 'buff', scope: 'conditional', cond: 'aura',           flat: { fortune: 1 },                    desc: 'Lifts the whole deck: +1 Fortune to every hand aboard.' },
  prima_donna: { id: 'prima_donna', name: 'Prima Donna', kind: 'flaw', scope: 'conditional', cond: 'not_captain',    flat: { power: -2, dodge: -2, fortune: -2 }, desc: 'Sulks below the top job: −2 to all stats unless captain.' },
}

export const BUFF_IDS: string[] = Object.values(CREW_EFFECTS).filter(e => e.kind === 'buff').map(e => e.id)
export const FLAW_IDS: string[] = Object.values(CREW_EFFECTS).filter(e => e.kind === 'flaw').map(e => e.id)

// Display metadata per scope (tag label + accent colour).
export const SCOPE_META: Record<CrewEffectScope, { label: string; color: string }> = {
  always:      { label: 'Passive',     color: '#9aa0a6' },
  raid:        { label: 'Raid',        color: '#f0a36a' },
  voyage:      { label: 'Voyage',      color: '#6fb6c9' },
  conditional: { label: 'Situational', color: '#c0a0e6' },
}

const LBL: Record<StatKey, string> = { power: 'PWR', dodge: 'DGE', fortune: 'FTN' }

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

/** Base stats plus the net of all PASSIVE (always-on) effects: flat first, then
 *  percent, each stat clamped to >= 1. Raid/voyage/conditional effects do NOT
 *  touch the base stat line (they apply in their own context). */
export function applyCrewEffects(
  base: { power: number; dodge: number; fortune: number },
  ids: string[] | null | undefined,
): { power: number; dodge: number; fortune: number } {
  const flat = { power: 0, dodge: 0, fortune: 0 }
  const pct = { power: 0, dodge: 0, fortune: 0 }
  for (const e of resolveEffects(ids)) {
    if (e.scope !== 'always') continue
    if (e.flat) { flat.power += e.flat.power ?? 0; flat.dodge += e.flat.dodge ?? 0; flat.fortune += e.flat.fortune ?? 0 }
    if (e.pct) { pct.power += e.pct.power ?? 0; pct.dodge += e.pct.dodge ?? 0; pct.fortune += e.pct.fortune ?? 0 }
  }
  return {
    power: Math.max(1, Math.round((base.power + flat.power) * (1 + pct.power / 100))),
    dodge: Math.max(1, Math.round((base.dodge + flat.dodge) * (1 + pct.dodge / 100))),
    fortune: Math.max(1, Math.round((base.fortune + flat.fortune) * (1 + pct.fortune / 100))),
  }
}
