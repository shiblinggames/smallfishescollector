// Crew effects (Darkest-Dungeon-style quirks) for the new recruit system.
// Each crew member rolls a small set of these. For Phase 1 every effect is a
// flat modifier to the three combat stats (power / dodge / fortune) so it
// plugs straight into the existing scoring formulas and is easy to feel in
// testing. Richer effect kinds (raid-only, conditional, etc.) slot in later
// by extending CrewEffect — the id-on-the-instance model means retuning an
// effect here updates every crew member that carries it.

export type CrewEffectKind = 'buff' | 'flaw'

export interface CrewEffect {
  id: string
  name: string
  /** One short line, shown under the portrait. No em-dashes, pirate voice. */
  desc: string
  kind: CrewEffectKind
  mods: { power?: number; dodge?: number; fortune?: number }
}

export const CREW_EFFECTS: Record<string, CrewEffect> = {
  // ── Buffs ────────────────────────────────────────────────────────────
  dead_eye: {
    id: 'dead_eye', name: 'Dead Eye', kind: 'buff',
    desc: 'A gunner whose aim never wavers.',
    mods: { power: 3 },
  },
  cold_blood: {
    id: 'cold_blood', name: 'Cold Blood', kind: 'buff',
    desc: 'Nothing on the water can rattle them.',
    mods: { dodge: 3 },
  },
  born_lucky: {
    id: 'born_lucky', name: 'Born Lucky', kind: 'buff',
    desc: 'The tide always seems to break their way.',
    mods: { fortune: 3 },
  },
  iron_gut: {
    id: 'iron_gut', name: 'Iron Gut', kind: 'buff',
    desc: 'Takes a beating and asks for seconds.',
    mods: { dodge: 2 },
  },
  salt_veteran: {
    id: 'salt_veteran', name: 'Salt Veteran', kind: 'buff',
    desc: 'Years of brine worked into the bones.',
    mods: { power: 1, dodge: 1, fortune: 1 },
  },

  // ── Flaws ────────────────────────────────────────────────────────────
  greenhorn: {
    id: 'greenhorn', name: 'Greenhorn', kind: 'flaw',
    desc: 'Still finding their sea legs.',
    mods: { power: -2 },
  },
  yellow_streak: {
    id: 'yellow_streak', name: 'Yellow Streak', kind: 'flaw',
    desc: 'Flinches when the cannons roar.',
    mods: { dodge: -2 },
  },
  jonah: {
    id: 'jonah', name: 'Jonah', kind: 'flaw',
    desc: 'Bad luck trails them like a gull.',
    mods: { fortune: -2 },
  },
  butterfingers: {
    id: 'butterfingers', name: 'Butterfingers', kind: 'flaw',
    desc: 'Drops more than they ever hold.',
    mods: { power: -1, fortune: -1 },
  },
}

export const BUFF_IDS: string[] = Object.values(CREW_EFFECTS).filter(e => e.kind === 'buff').map(e => e.id)
export const FLAW_IDS: string[] = Object.values(CREW_EFFECTS).filter(e => e.kind === 'flaw').map(e => e.id)

export function getCrewEffect(id: string): CrewEffect | undefined {
  return CREW_EFFECTS[id]
}

/** Resolve a list of effect ids to their definitions, dropping unknown ids. */
export function resolveEffects(ids: string[] | null | undefined): CrewEffect[] {
  if (!ids) return []
  return ids.map(id => CREW_EFFECTS[id]).filter((e): e is CrewEffect => !!e)
}

/** Base stats plus the net of all carried effects, each clamped to >= 1. */
export function applyCrewEffects(
  base: { power: number; dodge: number; fortune: number },
  ids: string[] | null | undefined,
): { power: number; dodge: number; fortune: number } {
  const out = { ...base }
  for (const e of resolveEffects(ids)) {
    out.power   += e.mods.power   ?? 0
    out.dodge   += e.mods.dodge   ?? 0
    out.fortune += e.mods.fortune ?? 0
  }
  out.power   = Math.max(1, out.power)
  out.dodge   = Math.max(1, out.dodge)
  out.fortune = Math.max(1, out.fortune)
  return out
}
