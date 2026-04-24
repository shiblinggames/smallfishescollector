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
  { id: 0, name: 'Shallows',    color: '#60a5fa', catchDeg:  90, perfectDeg: 20, snagDeg: 40, snagGapRight: 30, snagGapLeft:  -1, catchEarns: 3, perfectEarns:  5, speedMin: 130, speedMax: 210, changeMin: 22, changeMax: 38, reverseChance: 0.00 },
  { id: 1, name: 'Open Waters', color: '#34d399', catchDeg:  68, perfectDeg: 16, snagDeg: 45, snagGapRight: 15, snagGapLeft:  -1, catchEarns: 4, perfectEarns:  6, speedMin: 210, speedMax: 320, changeMin: 16, changeMax: 28, reverseChance: 0.00 },
  { id: 2, name: 'Deep',        color: '#a78bfa', catchDeg:  50, perfectDeg: 12, snagDeg: 45, snagGapRight:  5, snagGapLeft:   5, catchEarns: 5, perfectEarns:  8, speedMin: 320, speedMax: 450, changeMin: 10, changeMax: 18, reverseChance: 0.12 },
  { id: 3, name: 'Abyss',       color: '#f87171', catchDeg:  28, perfectDeg:  6, snagDeg: 50, snagGapRight:  0, snagGapLeft:   0, catchEarns: 8, perfectEarns: 12, speedMin: 450, speedMax: 590, changeMin:  5, changeMax: 10, reverseChance: 0.30 },
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
