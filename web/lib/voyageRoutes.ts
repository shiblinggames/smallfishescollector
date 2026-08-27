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
  /** The route's own painted seascape, shown as the header band on its node
   *  sheet. Painted to the same rule as the raid backdrops: horizon high, open
   *  water filling the frame, and near-black at the foot so the route name laid
   *  over it stays readable without needing a heavier scrim. */
  image: string
  riskLabel: string
  color: string
  payoutScale: number
  /** Flat per-voyage crew-loss probability for this route (BEFORE crew
   *  fortune mitigation). 0 means crew loss is impossible on this
   *  route. The deeper routes carry real permadeath risk; the early
   *  routes are safe. See effectiveCrewLossChance below — total weighted
   *  crew fortune can reduce this all the way to ZERO once it matches
   *  the route's minLevel. */
  baseCrewLossChance: number
  gemScale: number
  baseDoubloons: number
  /** Minimum ship tier required to set sail on this route. Coastal is open
   *  to anyone; deeper-water routes ask for tier 2, which every captain now
   *  has — the Sloop is the starting hull, so these gates are currently a
   *  floor rather than a lock. Left in place deliberately: they are what a
   *  future rung would be measured against
   *  since they have a crew-loss risk and we don't want to punish players
   *  who haven't upgraded their ship yet. */
  minShipTier: number
  /** Nav (expedition) level required to unlock the route on the map. This
   *  ALSO doubles as the total weighted crew fortune needed to fully zero
   *  out the route's crew-loss risk (see effectiveCrewLossChance) — one
   *  number, two gates, and new deeper routes automatically demand more
   *  fortune to sail safe. */
  minLevel: number
}

export const ROUTE_CONFIGS: Record<VoyageRoute, RouteConfig> = {
  coastal: {
    name: 'The Inner Sea',
    image: '/voyage_coastal.jpg',
    tagline: 'Familiar waters. Light risk, modest reward.',
    riskLabel: 'Safe',
    color: '#4ade80',
    payoutScale: 0.70,
    baseCrewLossChance: 0,
    gemScale: 0.5,
    baseDoubloons: 50,
    minShipTier: 0,
    minLevel: 1,
  },
  open: {
    name: 'The Crossing',
    image: '/voyage_open.jpg',
    tagline: 'Open water. Some risk, decent reward.',
    riskLabel: 'Low Risk',
    color: '#f0c040',
    // payoutScale tuned 2026-05-20: 1.0 → 0.55 (target avg ~500 ⟡/voyage).
    payoutScale: 0.55,
    baseCrewLossChance: 0,
    gemScale: 1.0,
    baseDoubloons: 120,
    minShipTier: 2,
    minLevel: 5,
  },
  deep: {
    name: 'The Howling Deep',
    image: '/voyage_deep.jpg',
    tagline: 'Hostile open water. Real risk, real reward.',
    riskLabel: 'Risky',
    color: '#c084fc',
    // payoutScale tuned 2026-05-20: 1.5 → 0.65 (target avg ~800 ⟡/voyage).
    payoutScale: 0.65,
    baseCrewLossChance: 0.10,
    gemScale: 1.5,
    baseDoubloons: 200,
    minShipTier: 2,
    minLevel: 15,
  },
  triangle: {
    name: 'The Bertuna Triangle',
    image: '/voyage_triangle.jpg',
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
    minLevel: 25,
  },
  // Endgame route — Nav Lv 40 gate (minLevel below).
  // Tuned roughly 1.4× the Triangle's economy
  // (payout + base + gems) and a touch riskier on crew loss, so
  // late-game players have a meaningful next rung after they outgrow
  // the Triangle. Color is a deep slate to read as "veiled / colder /
  // farther out" than the Triangle's crimson danger.
  shroud: {
    name: 'The Shrouded Reach',
    image: '/voyage_shroud.jpg',
    tagline: 'Beyond the maps. Half a crew gets back.',
    riskLabel: 'Treacherous',
    color: '#7c8aa8',
    payoutScale: 1.40,
    baseCrewLossChance: 0.20,
    gemScale: 3.0,
    baseDoubloons: 600,
    minShipTier: 2,
    minLevel: 40,
  },
}

// Fortune mitigation — retuned 2026-06-11. Fortune scales the route's base
// risk down linearly and can now remove it ENTIRELY: the threshold for a
// fully risk-free sail is the route's own Nav level requirement (minLevel).
// Deep zeroes at 15 weighted fortune, Triangle at 25, Shroud at 40 — and
// every future, deeper route automatically demands more fortune to sail
// safe just by carrying a higher Nav gate. This replaced the flat
// 75%-cap-at-50 scheme: with new voyages on the roadmap, a static cap
// would make every route share one fortune target, and "fully safe" is a
// cleaner chase than "75% safer".
export function effectiveCrewLossChance(route: VoyageRoute, fortune: number): number {
  const rc = ROUTE_CONFIGS[route]
  if (rc.baseCrewLossChance === 0) return 0
  return rc.baseCrewLossChance * Math.max(0, 1 - fortune / rc.minLevel)
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
  /** The 1-in-100 haul. Persisted on the event because the reveal reads the
   *  stored voyage row, not the roll that produced it. `jackpot` is the
   *  original field name, still read so any row written before the rename
   *  still pays off. */
  booty?: boolean
  jackpot?: boolean
}
