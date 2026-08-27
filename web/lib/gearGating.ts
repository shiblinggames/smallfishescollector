// Level gates on BUYING gear — stops casino / voyage gold from skipping
// progression. Fishing gear (rod / reel / hook) gates on Fishing Level; ships
// gate on Nav (expedition) Level. Bracketed on price so it scales automatically
// and the whole curve tunes in ONE place. Only purchases are gated — already-
// owned or equipped gear is never affected, and free starter gear is open.

/** Fishing Level required to BUY a specific fishing-gear item. Prefers an
 *  explicit per-item `minLevel` (set on each rod / reel / hook so unlock pacing
 *  can be hand-tuned one item at a time) and falls back to the price bracket
 *  below for anything left unset. Every fishing-gear purchase gate + the
 *  level-up "now available" feed should call THIS, not the raw bracket. */
export function fishingGearLevelReq(item: { minLevel?: number; cost: number }): number {
  return item.minLevel ?? fishingLevelReqForCost(item.cost)
}

/** Fishing Level required to buy a rod / reel / hook of the given price. The
 *  fallback when an item has no explicit `minLevel`. */
export function fishingLevelReqForCost(cost: number): number {
  if (cost <= 0) return 1
  if (cost < 2_500) return 5
  if (cost < 8_000) return 12
  if (cost < 20_000) return 20
  if (cost < 45_000) return 30
  if (cost < 90_000) return 42
  if (cost < 200_000) return 55
  if (cost < 500_000) return 70
  return 85
}

/** Nav (expedition) Level required to buy a ship hull of the given price. */
export function navLevelReqForShip(cost: number): number {
  if (cost < 3_000) return 1      // Sloop (0) — the free starting hull
  if (cost < 12_000) return 10    // Schooner (5,000)
  if (cost < 50_000) return 18    // Brigantine (22,000)
  if (cost < 150_000) return 30   // Galleon (80,000)
  return 45                        // Man-o-War (200,000)
}
