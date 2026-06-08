// Roster capacity for the new crew system: how many crew you can hold at once.
// Tied to Navigation (expedition) level: 10 at Nav 1, +1 every 5 levels.
//
// Bumped 2026-06-08 — base 5 → 10 + cadence 10 levels → 5 levels — now that
// voyage and raid run independent parties. Players need bench depth to staff
// BOTH tracks plus keep backups for class diversity (Mender for heal,
// Sharpshot for damage, Snare for control, etc.). New curve: 10 at Nav 1,
// 20 at Nav 50, 30 at Nav 100 — meaningful breathing room while keeping the
// recruit decision sharp enough to matter.

import { getLevelFromXP } from './expeditionLevel'

const BASE_CAPACITY = 10
const PER_LEVELS = 5

export function crewCapacity(navLevel: number): number {
  return BASE_CAPACITY + Math.floor(navLevel / PER_LEVELS)
}

export function crewCapacityForXP(expeditionXp: number): number {
  return crewCapacity(getLevelFromXP(expeditionXp))
}
