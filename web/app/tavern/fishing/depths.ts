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
  snagGapLeft: number
  catchEarns: number
  perfectEarns: number
  speedMin: number
  speedMax: number
  changeMin: number
  changeMax: number
  reverseChance: number
}

const CATCH_CENTER = 97.5
const CATCH_BONUS_PER_TIER = 3

export const DEPTHS: DepthDef[] = [
  { id: 0, name: 'Shallows',    color: '#60a5fa', catchDeg:  90, perfectDeg: 4, snagDeg: 40, snagGapRight: 30, snagGapLeft:  -1, catchEarns: 3, perfectEarns:  5, speedMin: 130, speedMax: 210, changeMin: 22, changeMax: 38, reverseChance: 0.00 },
  { id: 1, name: 'Open Waters', color: '#34d399', catchDeg:  68, perfectDeg: 4, snagDeg: 45, snagGapRight: 15, snagGapLeft:  -1, catchEarns: 4, perfectEarns:  6, speedMin: 210, speedMax: 320, changeMin: 16, changeMax: 28, reverseChance: 0.00 },
  { id: 2, name: 'Deep',        color: '#a78bfa', catchDeg:  50, perfectDeg: 4, snagDeg: 45, snagGapRight:  5, snagGapLeft:   5, catchEarns: 5, perfectEarns:  8, speedMin: 320, speedMax: 450, changeMin: 10, changeMax: 18, reverseChance: 0.12 },
  { id: 3, name: 'Abyss',       color: '#f87171', catchDeg:  28, perfectDeg: 4, snagDeg: 50, snagGapRight:  0, snagGapLeft:   0, catchEarns: 8, perfectEarns: 12, speedMin: 450, speedMax: 590, changeMin:  5, changeMax: 10, reverseChance: 0.30 },
]

function buildZonesFromParams(params: {
  catchDeg: number
  perfectDeg: number
  snagDeg: number
  snagGapRight: number
  snagGapLeft: number
}): ZoneDef[] {
  const { catchDeg, perfectDeg, snagDeg, snagGapRight, snagGapLeft } = params

  const catchStart = CATCH_CENTER - catchDeg / 2
  const catchEnd   = CATCH_CENTER + catchDeg / 2
  const perfStart  = CATCH_CENTER - perfectDeg / 2
  const perfEnd    = CATCH_CENTER + perfectDeg / 2

  const zones: ZoneDef[] = []

  if (snagGapLeft >= 0) {
    const leftSnagEnd   = catchStart - snagGapLeft
    const leftSnagStart = Math.max(0, leftSnagEnd - snagDeg)
    if (leftSnagStart > 0) zones.push({ from: 0, to: leftSnagStart, type: 'miss', label: 'Miss', color: '#64748b' })
    zones.push({ from: leftSnagStart, to: leftSnagEnd, type: 'penalty', label: 'Snag!', color: '#f87171' })
    zones.push({ from: leftSnagEnd,   to: catchStart,  type: 'miss',    label: 'Miss',  color: '#64748b' })
  } else {
    zones.push({ from: 0, to: catchStart, type: 'miss', label: 'Miss', color: '#64748b' })
  }

  zones.push({ from: catchStart, to: perfStart, type: 'catch',   label: 'Catch',    color: '#4ade80' })
  zones.push({ from: perfStart,  to: perfEnd,   type: 'perfect', label: 'Perfect!', color: '#fde68a' })
  zones.push({ from: perfEnd,    to: catchEnd,  type: 'catch',   label: 'Catch',    color: '#4ade80' })

  const rightSnagStart = catchEnd + snagGapRight
  const rightSnagEnd   = rightSnagStart + snagDeg
  zones.push({ from: catchEnd,       to: rightSnagStart, type: 'miss',    label: 'Miss',  color: '#64748b' })
  zones.push({ from: rightSnagStart, to: rightSnagEnd,   type: 'penalty', label: 'Snag!', color: '#f87171' })
  if (rightSnagEnd < 360) zones.push({ from: rightSnagEnd, to: 360, type: 'miss', label: 'Miss', color: '#64748b' })

  return zones
}

export function buildZones(d: DepthDef, hookTier = 0): ZoneDef[] {
  return buildZonesFromParams({
    catchDeg:     d.catchDeg + Math.max(0, Math.min(6, hookTier)) * CATCH_BONUS_PER_TIER,
    perfectDeg:   d.perfectDeg,
    snagDeg:      d.snagDeg,
    snagGapRight: d.snagGapRight,
    snagGapLeft:  d.snagGapLeft,
  })
}

// Zones for the new fish-based catch game
export function buildFishZones(
  catchDifficulty: number, // 1–5
  hookTier = 0,
  linePenaltyMultiplier = 1.0,
  zoneCatchMultiplier = 1.0,
): ZoneDef[] {
  const d = Math.max(1, Math.min(5, catchDifficulty)) - 1
  const baseCatch = [77, 62, 46, 32, 20][d]
  const baseSnag  = [ 18, 26, 36, 48, 58][d]
  const gapRight  = [ 28, 14,  5,  0,  0][d]
  const gapLeft   = [  0,  0,  5,  0,  0][d]
  const hasLeft   = d >= 2

  const catchDeg = Math.max(10, Math.round(
    (baseCatch + Math.max(0, Math.min(6, hookTier)) * CATCH_BONUS_PER_TIER) * zoneCatchMultiplier
  ))

  return buildZonesFromParams({
    catchDeg,
    perfectDeg:   5,
    snagDeg:      Math.round(baseSnag * linePenaltyMultiplier),
    snagGapRight: gapRight,
    snagGapLeft:  hasLeft ? gapLeft : -1,
  })
}

// Needle speed by catch_difficulty (fish trait — multiply by reel.needleSpeedMultiplier)
export const FISH_DIFFICULTY_SPEED = [
  { speedMin: 120, speedMax: 185 }, // 1
  { speedMin: 190, speedMax: 285 }, // 2
  { speedMin: 275, speedMax: 400 }, // 3
  { speedMin: 375, speedMax: 520 }, // 4
  { speedMin: 490, speedMax: 650 }, // 5
]

// Erraticism + catch window by zone (environment trait — currents, pressure, visibility)
export const ZONE_DIFFICULTY: Record<string, { reverseChance: number; changeMin: number; changeMax: number; catchMultiplier: number }> = {
  shallows:    { reverseChance: 0.00, changeMin: 28, changeMax: 48, catchMultiplier: 1.00 },
  open_waters: { reverseChance: 0.04, changeMin: 20, changeMax: 35, catchMultiplier: 0.90 },
  deep:        { reverseChance: 0.14, changeMin: 12, changeMax: 22, catchMultiplier: 0.78 },
  abyss:       { reverseChance: 0.28, changeMin:  6, changeMax: 12, catchMultiplier: 0.65 },
}
