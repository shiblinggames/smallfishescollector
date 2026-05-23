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
  /** Minimum ship tier required to set sail on this route. Coastal is open
   *  to anyone (rowboat OK); deeper-water routes require a Sloop or better
   *  since they have a crew-loss risk and we don't want to punish players
   *  who haven't upgraded their ship yet. */
  minShipTier: number
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
    minShipTier: 0,
  },
  open: {
    name: 'The Crossing',
    tagline: 'Open water. Some risk, decent reward.',
    riskLabel: 'Low Risk',
    color: '#f0c040',
    // payoutScale tuned 2026-05-20: 1.0 → 0.55 (target avg ~500 ⟡/voyage).
    payoutScale: 0.55,
    // crew-loss softened 2026-05-23 (0.25 → 0.10): these 4 routes are the
    // early/mid band; real permadeath risk lives on future high-nav routes.
    crewLossScale: 0.10,
    gemScale: 1.0,
    baseDoubloons: 120,
    minShipTier: 2,
  },
  deep: {
    name: 'The Howling Deep',
    tagline: 'Hostile open water. Real risk, real reward.',
    riskLabel: 'Risky',
    color: '#c084fc',
    // payoutScale tuned 2026-05-20: 1.5 → 0.65 (target avg ~800 ⟡/voyage).
    payoutScale: 0.65,
    crewLossScale: 0.20, // softened 2026-05-23 (0.5 → 0.20)
    gemScale: 1.5,
    baseDoubloons: 200,
    minShipTier: 2,
  },
  triangle: {
    name: 'The Bertuna Triangle',
    tagline: 'Ships go missing here. Few come back the same.',
    riskLabel: 'Dangerous',
    color: '#f43f5e',
    // payoutScale tuned 2026-05-20: 2.2 → 1.0 (target avg ~1500 ⟡/voyage).
    // Real-data anchor showed ~2985 avg at the old 2.2× scale.
    payoutScale: 1.0,
    crewLossScale: 0.40, // softened 2026-05-23 (1.0 → 0.40)
    gemScale: 2.2,
    baseDoubloons: 380,
    minShipTier: 2,
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
