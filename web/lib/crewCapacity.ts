// Roster capacity for the new crew system: how many crew you can hold at once.
// Tied to Navigation (expedition) level: 10 at Nav 1, +1 every 10 levels.
//
// Bumped from 5 → 10 base (2026-06-08) now that voyage and raid run
// independent parties. Players need enough bench depth to comfortably staff
// BOTH tracks plus keep a few backups for class diversity (Mender for
// healing, Sharpshot for damage, Snare for control, etc.). A Nav-50 player
// now holds 15 crew vs the old 10, and a maxed Nav-100 captain holds 20 vs
// the old 15 — meaningful breathing room without making recruit decisions
// trivial.

import { getLevelFromXP } from './expeditionLevel'

const BASE_CAPACITY = 10
const PER_LEVELS = 10

export function crewCapacity(navLevel: number): number {
  return BASE_CAPACITY + Math.floor(navLevel / PER_LEVELS)
}

export function crewCapacityForXP(expeditionXp: number): number {
  return crewCapacity(getLevelFromXP(expeditionXp))
}
