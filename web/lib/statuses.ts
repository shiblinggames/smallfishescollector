// ── Combat statuses — the shared timed buff/debuff pipeline ─────────────────
// Chapter 4's status system (see [[endgame-chapter4-plan]]), built to be used
// by BOTH sides: enemy specials inflict them on the player, player items/crew
// abilities inflict them on enemies, and Gauntlet 2 boons/curses draw on the
// same vocabulary. Locked roster + rules (2026-07-11):
//
//   Debuffs: weaken (−dmg dealt) · feeble (+dmg taken) · slowed (−Initiative:
//   turn order + fleeing) · silence (special abilities locked) ·
//   corrode (shield takes amplified damage).
//   Buffs:   fortify (−dmg taken) · enrage (+dmg dealt) · regen (heal/turn).
//
//   Rules: NO same-status stacking — reapplying refreshes duration and keeps
//   the strongest magnitude. Statuses tick down when the ROUND resolves (both
//   sides acted). Mender's cleanse clears every player debuff. burn/freeze/
//   snare keep their bespoke mechanics — they only share the badge UI.
//
// Magnitude semantics per id (kept numeric so one shape fits all):
//   weaken/feeble/fortify/enrage/corrode → fraction (0.25 = 25%)
//   slowed → flat speed points · silence → unused (locks all) ·
//   regen → flat HP per round.

export type StatusId =
  | 'weaken' | 'feeble' | 'marked' | 'slowed' | 'silence' | 'corrode'
  | 'fortify' | 'enrage' | 'regen'

export interface ActiveStatus {
  id: StatusId
  magnitude: number
  /** Rounds remaining. Decremented at round end; dropped at 0. */
  turnsLeft: number
}

export interface StatusDef {
  name: string
  tone: 'buff' | 'debuff'
  /** Badge glyph (single character — the badge row stays tiny). */
  glyph: string
  /** Badge/chip accent. Buffs stay green-family, debuffs red/purple-family. */
  color: string
  /** Player-facing one-liner for the log/detail, given the magnitude. */
  describe: (magnitude: number) => string
}

const pct = (m: number) => `${Math.round(m * 100)}%`

export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  weaken:  { name: 'Weakened',  tone: 'debuff', glyph: '↓', color: '#f0a05a', describe: m => `deals ${pct(m)} less damage` },
  feeble:  { name: 'Feeble',    tone: 'debuff', glyph: '✚', color: '#f47c7c', describe: m => `takes ${pct(m)} more damage` },
  marked:  { name: 'Marked',    tone: 'debuff', glyph: '◎', color: '#f43f5e', describe: m => `marked for death — takes ${pct(m)} more damage from all sources` },
  slowed:  { name: 'Slowed',    tone: 'debuff', glyph: '⌛', color: '#8fb4e0', describe: m => `${m} slower (turn order)` },
  silence: { name: 'Silenced',  tone: 'debuff', glyph: '✕', color: '#c084fc', describe: () => 'special abilities are locked' },
  corrode: { name: 'Corroded',  tone: 'debuff', glyph: '≋', color: '#a3e635', describe: m => `its shield takes ${pct(m)} more damage` },
  fortify: { name: 'Fortified', tone: 'buff',   glyph: '▲', color: '#5eead4', describe: m => `takes ${pct(m)} less damage` },
  enrage:  { name: 'Enraged',   tone: 'buff',   glyph: '⚔', color: '#fb923c', describe: m => `deals ${pct(m)} more damage` },
  regen:   { name: 'Mending',   tone: 'buff',   glyph: '❤', color: '#4ade80', describe: m => `heals ${m} each round` },
}

/** Apply (or refresh) a status: no stacking — same id refreshes to the LONGER
 *  duration and the STRONGER magnitude. Returns the new list. */
export function applyStatus(list: ActiveStatus[], id: StatusId, magnitude: number, turns: number): ActiveStatus[] {
  const existing = list.find(s => s.id === id)
  if (!existing) return [...list, { id, magnitude, turnsLeft: turns }]
  return list.map(s => s.id === id
    ? { id, magnitude: Math.max(s.magnitude, magnitude), turnsLeft: Math.max(s.turnsLeft, turns) }
    : s)
}

/** Round-end tick: decrement every status, dropping the expired. */
export function tickStatuses(list: ActiveStatus[]): { next: ActiveStatus[]; expired: ActiveStatus[] } {
  const next: ActiveStatus[] = []
  const expired: ActiveStatus[] = []
  for (const s of list) {
    if (s.turnsLeft <= 1) expired.push(s)
    else next.push({ ...s, turnsLeft: s.turnsLeft - 1 })
  }
  return { next, expired }
}

/** Cleanse (Mender): strip every DEBUFF, keep buffs. */
export function cleanseStatuses(list: ActiveStatus[]): { next: ActiveStatus[]; removed: ActiveStatus[] } {
  const next = list.filter(s => STATUS_DEFS[s.id].tone === 'buff')
  const removed = list.filter(s => STATUS_DEFS[s.id].tone === 'debuff')
  return { next, removed }
}

export interface StatusMods {
  /** Multiplier on damage THIS side deals (weaken ↓, enrage ↑). Floor 0.1. */
  dmgDealtMult: number
  /** Multiplier on damage THIS side takes (feeble ↑, fortify ↓). Floor 0.1. */
  dmgTakenMult: number
  /** Flat Initiative delta (slowed/hasted). Turn order + fleeing ONLY. Post-split
   *  it does not touch the aim bar or the dodge contest — dodging is Navigation
   *  vs the enemy's accuracy, with no speed term on either side. */
  speedDelta: number
  /** Special abilities locked this round. */
  silenced: boolean
  /** Extra multiplier on damage this side's SHIELD takes (corrode). */
  shieldDmgTakenMult: number
  /** Flat heal at round end (regen). */
  regenPerRound: number
}

/** Aggregate a side's active statuses into the numbers combat reads. */
export function statusMods(list: ActiveStatus[]): StatusMods {
  let dealt = 1, taken = 1, speed = 0, silenced = false, shieldTaken = 1, regen = 0
  for (const s of list) {
    switch (s.id) {
      case 'weaken':  dealt *= (1 - s.magnitude); break
      case 'enrage':  dealt *= (1 + s.magnitude); break
      case 'feeble':  taken *= (1 + s.magnitude); break
      case 'marked':  taken *= (1 + s.magnitude); break   // Mira's Requiem — same +dmg-taken math as feeble, its own badge
      case 'fortify': taken *= (1 - s.magnitude); break
      case 'slowed':  speed -= s.magnitude; break
      case 'silence': silenced = true; break
      case 'corrode': shieldTaken *= (1 + s.magnitude); break
      case 'regen':   regen += s.magnitude; break
    }
  }
  return {
    dmgDealtMult: Math.max(0.1, dealt),
    dmgTakenMult: Math.max(0.1, taken),
    speedDelta: speed,
    silenced,
    shieldDmgTakenMult: shieldTaken,
    regenPerRound: regen,
  }
}

export const NO_STATUS_MODS: StatusMods = {
  dmgDealtMult: 1, dmgTakenMult: 1, speedDelta: 0, silenced: false, shieldDmgTakenMult: 1, regenPerRound: 0,
}
