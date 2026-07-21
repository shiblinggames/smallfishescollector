// Don's Gauntlet — MARKS. The reward for putting Don Finleone down at a milestone
// rise: you tear a piece off him and wear it. Each fall he offers TWO Marks and
// you choose one — Mark of the Shark (a sweeping bundle of OFFENSE) or Mark of the
// Whale (a bundle of DEFENSE). Each Mark rolls 3 random sub-buffs at +5-10%, and
// they STACK across the run (four rises = four Marks).
//
// Marks are their own category, distinct from boons: they emit TideEffect[] that
// fold into the run's effect list (runEffects), lighting up the same combat hooks
// boons use. Note fire/ice ride the burn/freeze affinity channels which the engine
// MAX-combines (capped procs), so those two cap rather than add on repeat rolls;
// every other category compounds.

import type { TideEffect } from './tides'

export type MarkType = 'shark' | 'whale'

export type MarkCategory =
  // Mark of the Shark — offense
  | 'gunnery' | 'broadside' | 'bombards' | 'marksman' | 'keen_eye' | 'wildfire' | 'hoarfrost'
  // Mark of the Whale — defense
  | 'ironhull' | 'bulwark' | 'mending' | 'aegis' | 'bloodward'

interface MarkCatDef {
  type: MarkType
  /** Short display name, e.g. "Volley Damage". */
  label: string
  /** The combat effect(s) a rolled percentage grants. */
  toEffects: (pct: number) => TideEffect[]
}

// pct is a whole number 5-10. Multiplicative buffs → 1 + pct/100; mitigation →
// 1 - pct/100; chance/pct buffs → pct/100.
export const MARK_CATEGORIES: Record<MarkCategory, MarkCatDef> = {
  // ── Shark (offense) ─────────────────────────────────────────────────────────
  gunnery:   { type: 'shark', label: 'Cannon Damage',   toEffects: p => [{ kind: 'damageMult',     mult: 1 + p / 100 }] },
  broadside: { type: 'shark', label: 'Volley Damage',   toEffects: p => [{ kind: 'volleyDmgMult',  mult: 1 + p / 100 }] },
  bombards:  { type: 'shark', label: 'Ultimate Damage', toEffects: p => [{ kind: 'megaDmgMult',    mult: 1 + p / 100 }] },
  marksman:  { type: 'shark', label: 'Critical Damage', toEffects: p => [{ kind: 'critDmgMult',    mult: 1 + p / 100 }] },
  keen_eye:  { type: 'shark', label: 'Critical Chance', toEffects: p => [{ kind: 'critChanceBonus', chance: p / 100 }] },
  // Fire/ice ride the affinity channels (MAX-combined → cap rather than stack).
  wildfire:  { type: 'shark', label: 'Fire',            toEffects: p => [{ kind: 'fireAffinity', burnChance: p / 100, burnTurnsBonus: 0, burnTickMult: 1 + p / 100 }] },
  hoarfrost: { type: 'shark', label: 'Ice',             toEffects: p => [{ kind: 'iceAffinity',  freezeChance: p / 100, frozenDmgMult: 1 + p / 100 }] },
  // ── Whale (defense) ─────────────────────────────────────────────────────────
  ironhull:  { type: 'whale', label: 'Max Hull',    toEffects: p => [{ kind: 'maxHpMult',      mult: 1 + p / 100 }] },
  bulwark:   { type: 'whale', label: 'Shield',      toEffects: p => [{ kind: 'fightShield',    pctMax: p / 100 }] },
  mending:   { type: 'whale', label: 'Healing',     toEffects: p => [{ kind: 'healMult',       mult: 1 + p / 100 }] },
  aegis:     { type: 'whale', label: 'Damage Taken', toEffects: p => [{ kind: 'incomingDmgMult', mult: 1 - p / 100, scope: 'allRemaining' }] },
  bloodward: { type: 'whale', label: 'Lifesteal',   toEffects: p => [{ kind: 'lifestealPct',   pct: p / 100 }] },
}

export const SHARK_CATS: MarkCategory[] = ['gunnery', 'broadside', 'bombards', 'marksman', 'keen_eye', 'wildfire', 'hoarfrost']
export const WHALE_CATS: MarkCategory[] = ['ironhull', 'bulwark', 'mending', 'aegis', 'bloodward']

export interface MarkBuff { cat: MarkCategory; pct: number }
/** A Mark the player took: its type + the 3 buffs riding it. */
export interface ChosenMark { type: MarkType; buffs: MarkBuff[] }

export const MARK_ROLL_MIN = 5
export const MARK_ROLL_MAX = 10
export const MARK_BUFFS_PER = 3

/** Roll N distinct categories from a pool, each at a random +5-10%. */
function rollBuffs(cats: MarkCategory[], rng: () => number): MarkBuff[] {
  const pool = [...cats]
  const out: MarkBuff[] = []
  const n = Math.min(MARK_BUFFS_PER, pool.length)
  for (let i = 0; i < n; i++) {
    const cat = pool.splice(Math.floor(rng() * pool.length), 1)[0]
    const pct = MARK_ROLL_MIN + Math.floor(rng() * (MARK_ROLL_MAX - MARK_ROLL_MIN + 1))
    out.push({ cat, pct })
  }
  return out
}

/** The two Marks the Don offers on a fall — pick one. Built once so preview = commit. */
export function rollMarkOffer(rng: () => number = Math.random): { shark: MarkBuff[]; whale: MarkBuff[] } {
  return { shark: rollBuffs(SHARK_CATS, rng), whale: rollBuffs(WHALE_CATS, rng) }
}

/** Every taken Mark's buffs, flattened to the combat effects they grant. Fold this
 *  into the run's effect list; the tide pipeline + hpBoonMult do the rest. */
export function markEffects(marks: ChosenMark[]): TideEffect[] {
  return marks.flatMap(m => m.buffs.flatMap(b => MARK_CATEGORIES[b.cat].toEffects(b.pct)))
}

/** Display a rolled buff, e.g. "+8% Volley Damage" (mitigation reads as -N%). */
export function describeBuff(b: MarkBuff): string {
  const sign = b.cat === 'aegis' ? '-' : '+'
  return `${sign}${b.pct}% ${MARK_CATEGORIES[b.cat].label}`
}

export const MARK_META: Record<MarkType, { name: string; tagline: string }> = {
  shark: { name: 'Mark of the Shark', tagline: 'Teeth. You hit harder now.' },
  whale: { name: 'Mark of the Whale', tagline: 'Hide. You break harder now.' },
}
