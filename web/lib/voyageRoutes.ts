export type VoyageEventType = 'discovery' | 'encounter' | 'danger' | 'weather' | 'peaceful'
export type VoyageEventOutcome = 'success' | 'failure' | 'neutral'
export type VoyageRoute = 'coastal' | 'open' | 'deep' | 'triangle'

export interface RouteConfig {
  name: string
  tagline: string
  riskLabel: string
  color: string
  payoutScale: number
  crewLossScale: number
  gemScale: number
  baseDoubloons: number
}

export const ROUTE_CONFIGS: Record<VoyageRoute, RouteConfig> = {
  coastal: {
    name: 'The Inner Sea',
    tagline: 'Familiar waters. Light risk, modest reward.',
    riskLabel: 'Safe',
    color: '#4ade80',
    payoutScale: 0.70,
    crewLossScale: 0,
    gemScale: 0.5,
    baseDoubloons: 50,
  },
  open: {
    name: 'The Crossing',
    tagline: 'Open water. Some risk, decent reward.',
    riskLabel: 'Low Risk',
    color: '#f0c040',
    payoutScale: 1.0,
    crewLossScale: 0.25,
    gemScale: 1.0,
    baseDoubloons: 120,
  },
  deep: {
    name: 'The Howling Deep',
    tagline: 'Hostile open water. Real risk, real reward.',
    riskLabel: 'Dangerous',
    color: '#c084fc',
    payoutScale: 1.5,
    crewLossScale: 0.5,
    gemScale: 1.5,
    baseDoubloons: 200,
  },
  triangle: {
    name: 'The Bertuna Triangle',
    tagline: 'Ships go missing here. Few come back the same.',
    riskLabel: 'Extreme',
    color: '#f43f5e',
    payoutScale: 2.2,
    crewLossScale: 1.0,
    gemScale: 2.2,
    baseDoubloons: 380,
  },
}

export interface VoyageEvent {
  type: VoyageEventType
  title: string
  narrative: string
  outcome: VoyageEventOutcome
  doubloonDelta: number
  gemDelta: number
  crewVariantLost: number | null
  baitDrop: string | null
}
