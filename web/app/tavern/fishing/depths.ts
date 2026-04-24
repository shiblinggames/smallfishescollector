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
  catchQuality: number
  perfectQuality: number
  speedMin: number      // deg/sec
  speedMax: number
  changeMin: number     // ticks between speed changes (lower = more chaotic)
  changeMax: number
  reverseChance: number // 0–1 probability of direction flip per speed change
}

const CATCH_CENTER = 97.5
const SNAG_CENTER  = 262.5

export const DEPTHS: DepthDef[] = [
  { id: 0, name: 'Shallows',    color: '#60a5fa', catchDeg: 120, perfectDeg: 24, snagDeg:  35, catchQuality:  4, perfectQuality:  8, speedMin:  45, speedMax:  85, changeMin: 25, changeMax: 45, reverseChance: 0.00 },
  { id: 1, name: 'Open Waters', color: '#34d399', catchDeg:  80, perfectDeg: 18, snagDeg:  50, catchQuality:  8, perfectQuality: 14, speedMin:  90, speedMax: 145, changeMin: 18, changeMax: 32, reverseChance: 0.00 },
  { id: 2, name: 'Deep',        color: '#a78bfa', catchDeg:  50, perfectDeg: 12, snagDeg:  65, catchQuality: 12, perfectQuality: 18, speedMin: 170, speedMax: 270, changeMin: 10, changeMax: 18, reverseChance: 0.10 },
  { id: 3, name: 'Abyss',       color: '#f87171', catchDeg:  28, perfectDeg:  6, snagDeg:  80, catchQuality: 16, perfectQuality: 20, speedMin: 300, speedMax: 420, changeMin:  6, changeMax: 12, reverseChance: 0.25 },
]

export function buildZones(d: DepthDef): ZoneDef[] {
  const catchStart = CATCH_CENTER - d.catchDeg / 2
  const catchEnd   = CATCH_CENTER + d.catchDeg / 2
  const perfStart  = CATCH_CENTER - d.perfectDeg / 2
  const perfEnd    = CATCH_CENTER + d.perfectDeg / 2
  const snagStart  = SNAG_CENTER  - d.snagDeg / 2
  const snagEnd    = SNAG_CENTER  + d.snagDeg / 2
  return [
    { from: 0,          to: catchStart, type: 'miss',    label: 'Miss',     color: '#64748b' },
    { from: catchStart, to: perfStart,  type: 'catch',   label: 'Catch',    color: '#4ade80' },
    { from: perfStart,  to: perfEnd,    type: 'perfect', label: 'Perfect!', color: '#fde68a' },
    { from: perfEnd,    to: catchEnd,   type: 'catch',   label: 'Catch',    color: '#4ade80' },
    { from: catchEnd,   to: snagStart,  type: 'miss',    label: 'Miss',     color: '#64748b' },
    { from: snagStart,  to: snagEnd,    type: 'penalty', label: 'Snag!',    color: '#f87171' },
    { from: snagEnd,    to: 360,        type: 'miss',    label: 'Miss',     color: '#64748b' },
  ]
}
