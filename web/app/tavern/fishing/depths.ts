export type ZoneType = 'miss' | 'catch' | 'perfect' | 'penalty'

export interface ZoneDef {
  from: number
  to: number
  type: ZoneType
  label: string
  color: string
}

export interface DepthDef {
  id: number
  name: string
  color: string
  catchDeg: number
  perfectDeg: number
  snagDeg: number
  snagGapRight: number
  snagGapLeft: number    // -1 = no left snag
  catchEarns: number     // fixed doubloons for a catch hit
  perfectEarns: number   // fixed doubloons for a perfect hit
  speedMin: number
  speedMax: number
  changeMin: number
  changeMax: number
  reverseChance: number
}

const CATCH_CENTER = 97.5

// Each hook tier widens the catch and perfect zones slightly
const CATCH_BONUS_PER_TIER   = 3    // degrees
const PERFECT_BONUS_PER_TIER = 0.5  // degrees (rounded)

export const DEPTHS: DepthDef[] = [
  { id: 0, name: 'Shallows',    color: '#60a5fa', catchDeg: 120, perfectDeg: 24, snagDeg: 35, snagGapRight: 80, snagGapLeft:  -1, catchEarns:  3, perfectEarns:  8, speedMin:  45, speedMax:  85, changeMin: 25, changeMax: 45, reverseChance: 0.00 },
  { id: 1, name: 'Open Waters', color: '#34d399', catchDeg:  80, perfectDeg: 18, snagDeg: 50, snagGapRight: 45, snagGapLeft:  -1, catchEarns:  8, perfectEarns: 20, speedMin:  90, speedMax: 145, changeMin: 18, changeMax: 32, reverseChance: 0.00 },
  { id: 2, name: 'Deep',        color: '#a78bfa', catchDeg:  50, perfectDeg: 12, snagDeg: 45, snagGapRight:  5, snagGapLeft:   5, catchEarns: 18, perfectEarns: 45, speedMin: 170, speedMax: 270, changeMin: 10, changeMax: 18, reverseChance: 0.10 },
  { id: 3, name: 'Abyss',       color: '#f87171', catchDeg:  28, perfectDeg:  6, snagDeg: 50, snagGapRight:  0, snagGapLeft:   0, catchEarns: 35, perfectEarns: 90, speedMin: 300, speedMax: 420, changeMin:  6, changeMax: 12, reverseChance: 0.25 },
]

export function buildZones(d: DepthDef, hookTier = 0): ZoneDef[] {
  const tier      = Math.max(0, Math.min(6, hookTier))
  const catchDeg  = d.catchDeg   + tier * CATCH_BONUS_PER_TIER
  const perfDeg   = d.perfectDeg + Math.round(tier * PERFECT_BONUS_PER_TIER)

  const catchStart = CATCH_CENTER - catchDeg / 2
  const catchEnd   = CATCH_CENTER + catchDeg / 2
  const perfStart  = CATCH_CENTER - perfDeg / 2
  const perfEnd    = CATCH_CENTER + perfDeg / 2

  const zones: ZoneDef[] = []

  if (d.snagGapLeft >= 0) {
    const leftSnagEnd   = catchStart - d.snagGapLeft
    const leftSnagStart = Math.max(0, leftSnagEnd - d.snagDeg)
    if (leftSnagStart > 0) zones.push({ from: 0, to: leftSnagStart, type: 'miss',    label: 'Miss',  color: '#64748b' })
    zones.push({ from: leftSnagStart, to: leftSnagEnd, type: 'penalty', label: 'Snag!', color: '#f87171' })
    zones.push({ from: leftSnagEnd,   to: catchStart,  type: 'miss',    label: 'Miss',  color: '#64748b' })
  } else {
    zones.push({ from: 0, to: catchStart, type: 'miss', label: 'Miss', color: '#64748b' })
  }

  zones.push({ from: catchStart, to: perfStart, type: 'catch',   label: 'Catch',    color: '#4ade80' })
  zones.push({ from: perfStart,  to: perfEnd,   type: 'perfect', label: 'Perfect!', color: '#fde68a' })
  zones.push({ from: perfEnd,    to: catchEnd,  type: 'catch',   label: 'Catch',    color: '#4ade80' })

  const rightSnagStart = catchEnd + d.snagGapRight
  const rightSnagEnd   = rightSnagStart + d.snagDeg
  zones.push({ from: catchEnd,       to: rightSnagStart, type: 'miss',    label: 'Miss',  color: '#64748b' })
  zones.push({ from: rightSnagStart, to: rightSnagEnd,   type: 'penalty', label: 'Snag!', color: '#f87171' })
  if (rightSnagEnd < 360) zones.push({ from: rightSnagEnd, to: 360, type: 'miss', label: 'Miss', color: '#64748b' })

  return zones
}
