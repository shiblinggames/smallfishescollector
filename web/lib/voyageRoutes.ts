export type VoyageEventType = 'discovery' | 'encounter' | 'danger' | 'weather' | 'peaceful'
export type VoyageEventOutcome = 'success' | 'failure' | 'neutral'
export type VoyageRoute = 'coastal' | 'open' | 'deep' | 'triangle' | 'shroud'

// Routes that are designed but not yet finished (no exclusive loot, balance
// still WIP, etc). They render on the map as locked with a "Coming soon"
// label and can't be launched. Drop the entry once the route ships.
export const COMING_SOON_ROUTES: Set<VoyageRoute> = new Set()

export interface RouteConfig {
  name: string
  tagline: string
  riskLabel: string
  color: string
  payoutScale: number
  /** Flat per-voyage crew-loss probability for this route (BEFORE crew
   *  fortune mitigation). 0 means crew loss is impossible on this
   *  route. The deeper routes carry real permadeath risk; the early
   *  routes are safe. Fortune mitigation lives in voyageEvents.ts —
   *  stats can reduce but never fully remove crew loss. */
  baseCrewLossChance: number
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
    baseCrewLossChance: 0,
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
    baseCrewLossChance: 0,
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
    baseCrewLossChance: 0.10,
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
    baseCrewLossChance: 0.15,
    gemScale: 2.2,
    baseDoubloons: 380,
    minShipTier: 2,
  },
  // Endgame route — Nav Lv 40 gate (see ROUTE_MIN_LEVELS in
  // DailyVoyagePanel). Tuned roughly 1.4× the Triangle's economy
  // (payout + base + gems) and a touch riskier on crew loss, so
  // late-game players have a meaningful next rung after they outgrow
  // the Triangle. Color is a deep slate to read as "veiled / colder /
  // farther out" than the Triangle's crimson danger.
  shroud: {
    name: 'The Shrouded Reach',
    tagline: 'Beyond the maps. Half a crew gets back.',
    riskLabel: 'Treacherous',
    color: '#7c8aa8',
    payoutScale: 1.40,
    baseCrewLossChance: 0.20,
    gemScale: 3.0,
    baseDoubloons: 600,
    minShipTier: 2,
  },
}

// Fortune mitigation: each point of total crew fortune reduces the
// per-voyage crew-loss chance by 0.1 percentage points (0.001), with a
// hard floor at 50% of the route's base. So a fortune-25 crew on a
// Howling Deep voyage (10% base) faces 7.5%; a fortune-60 crew faces
// the 5% floor. "Stats can mitigate but never fully remove crew loss."
export const CREW_LOSS_FORTUNE_SLOPE = 0.001
export const CREW_LOSS_FLOOR_FRACTION = 0.5

export function effectiveCrewLossChance(base: number, fortune: number): number {
  if (base === 0) return 0
  return Math.max(base * CREW_LOSS_FLOOR_FRACTION, base - fortune * CREW_LOSS_FORTUNE_SLOPE)
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
