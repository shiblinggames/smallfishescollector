export type VoyageEventType = 'discovery' | 'encounter' | 'danger' | 'weather' | 'peaceful'
export type VoyageEventOutcome = 'success' | 'failure' | 'neutral'
export type VoyageRoute = 'coastal' | 'open' | 'deep'

export interface RouteConfig {
  name: string
  tagline: string
  riskLabel: string
  color: string
  payoutScale: number
  crewLossScale: number
  gemScale: number
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
  },
  open: {
    name: 'The Crossing',
    tagline: 'Standard voyage. Balanced risk and reward.',
    riskLabel: 'Balanced',
    color: '#f0c040',
    payoutScale: 1.0,
    crewLossScale: 1.0,
    gemScale: 1.0,
  },
  deep: {
    name: 'The Howling Deep',
    tagline: 'Hostile open water. High risk, high reward.',
    riskLabel: 'Dangerous',
    color: '#c084fc',
    payoutScale: 1.5,
    crewLossScale: 1.6,
    gemScale: 1.5,
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
  ringSkinDrop: string | null
  baitDrop: string | null
}
