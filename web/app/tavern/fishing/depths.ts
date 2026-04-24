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
  catchDeg: number    // total catch arc (includes Perfect inside)
  perfectDeg: number  // Perfect bonus arc (nested in center of catch)
  snagDeg: number
  catchQuality: number
  perfectQuality: number
}

// Catch zone centered at 97.5°, Snag centered at 262.5°
const CATCH_CENTER = 97.5
const SNAG_CENTER  = 262.5

export const DEPTHS: DepthDef[] = [
  { id: 0, name: 'Shallows',    color: '#60a5fa', catchDeg: 120, perfectDeg: 24, snagDeg:  35, catchQuality:  4, perfectQuality:  8 },
  { id: 1, name: 'Open Waters', color: '#34d399', catchDeg:  80, perfectDeg: 18, snagDeg:  50, catchQuality:  8, perfectQuality: 14 },
  { id: 2, name: 'Deep',        color: '#a78bfa', catchDeg:  50, perfectDeg: 12, snagDeg:  65, catchQuality: 12, perfectQuality: 18 },
  { id: 3, name: 'Abyss',       color: '#f87171', catchDeg:  28, perfectDeg:  6, snagDeg:  80, catchQuality: 16, perfectQuality: 20 },
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
