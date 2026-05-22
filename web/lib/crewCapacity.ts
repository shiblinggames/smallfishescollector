// Roster capacity for the new crew system: how many crew you can hold at once.
// Tied to Navigation (expedition) level: 5 at Nav 1, +1 every 10 levels.

import { getLevelFromXP } from './expeditionLevel'

const BASE_CAPACITY = 5
const PER_LEVELS = 10

export function crewCapacity(navLevel: number): number {
  return BASE_CAPACITY + Math.floor(navLevel / PER_LEVELS)
}

export function crewCapacityForXP(expeditionXp: number): number {
  return crewCapacity(getLevelFromXP(expeditionXp))
}
