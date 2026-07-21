// The World Chart — the Chart Room's evergreen meta-collectible. Your LIFETIME
// puzzle_points (the same points that raise the Den purse) progressively burn the
// fog off a painted sea map, landmark by landmark. Every discovery pays gems, the
// payouts escalate, and fully charting the sea (1000 points) totals 3000 gems and
// crowns you a Master Cartographer.
//
// Positions are NORMALIZED (0-1) over /chartingmap.webp so the overlay is
// resolution-independent. `r` is the fog blob radius as a fraction of the map
// WIDTH. Landmark id doubles as discovery order (thresholds ascend with id).

export interface Landmark {
  id: number
  name: string
  /** Lifetime puzzle_points needed to discover (burn the fog off) this landmark. */
  threshold: number
  /** Gems paid on claiming the discovery. */
  gems: number
  /** Normalized centre on the map (0-1). */
  x: number
  y: number
  /** Fog blob radius as a fraction of map width. */
  r: number
  /** One-line discovery flavor (pirate-cartographer voice). */
  lore: string
}

export const WORLD_CHART_FULL_POINTS = 1000
export const WORLD_CHART_TOTAL_GEMS = 3000

// The thirteen, in discovery order. Coordinates read off /chartingmap.webp.
export const LANDMARKS: Landmark[] = [
  { id: 1,  name: 'First Reef',       threshold: 15,   gems: 25,  x: 0.15, y: 0.79, r: 0.13, lore: 'The shallows where every chart begins. Bright water, brighter coral.' },
  { id: 2,  name: 'The Atoll',        threshold: 40,   gems: 50,  x: 0.42, y: 0.72, r: 0.16, lore: 'A ring of green around a still lagoon, calm as a held breath.' },
  { id: 3,  name: 'Mangrove Isles',   threshold: 75,   gems: 75,  x: 0.16, y: 0.32, r: 0.16, lore: 'Roots tangled like old rigging, wading out into the tide.' },
  { id: 4,  name: 'Lighthouse Rock',  threshold: 120,  gems: 100, x: 0.24, y: 0.51, r: 0.12, lore: 'One lonely spire, and a light that has outlived its keeper.' },
  { id: 5,  name: 'Volcanic Isle',    threshold: 175,  gems: 125, x: 0.36, y: 0.21, r: 0.15, lore: 'It smokes on the horizon like a pipe that never goes out.' },
  { id: 6,  name: 'Frozen Cape',      threshold: 240,  gems: 150, x: 0.12, y: 0.11, r: 0.14, lore: 'Where the sea turns to glass and the wind has teeth.' },
  { id: 7,  name: 'The Maelstrom',    threshold: 320,  gems: 200, x: 0.81, y: 0.66, r: 0.17, lore: 'A wound in the water that swallows what sails too close.' },
  { id: 8,  name: 'Pirate Haven',     threshold: 410,  gems: 250, x: 0.84, y: 0.44, r: 0.17, lore: 'Behind those walls every debt is collected. Ask no questions.' },
  { id: 9,  name: 'The Shipwreck',    threshold: 510,  gems: 300, x: 0.62, y: 0.58, r: 0.14, lore: 'She reached for the deep, and the deep reached back.' },
  { id: 10, name: 'Kelp Shoals',      threshold: 620,  gems: 350, x: 0.77, y: 0.22, r: 0.16, lore: 'Green murk to the keel. Something down there is patient.' },
  { id: 11, name: "Serpent's Reach",  threshold: 740,  gems: 400, x: 0.58, y: 0.34, r: 0.15, lore: 'The old charts warned of it. The old charts were right.' },
  { id: 12, name: "Kraken's Lair",    threshold: 870,  gems: 450, x: 0.83, y: 0.86, r: 0.17, lore: 'The last dark before the edge. Even the compass shivers.' },
  { id: 13, name: 'The Last Horizon', threshold: 1000, gems: 525, x: 0.47, y: 0.05, r: 0.18, lore: 'You have charted it all, captain. The sun rises on waters that are yours.' },
]

export interface LandmarkView extends Landmark {
  /** Points have reached this landmark's threshold. */
  revealed: boolean
  /** Its gems have already been collected. */
  claimed: boolean
  /** Revealed but not yet collected — a pending discovery to celebrate. */
  claimable: boolean
}

/** Fold lifetime points + the claimed-id set into per-landmark view state. */
export function landmarkViews(points: number, claimedIds: number[]): LandmarkView[] {
  const claimed = new Set(claimedIds)
  return LANDMARKS.map(l => {
    const revealed = points >= l.threshold
    const isClaimed = claimed.has(l.id)
    return { ...l, revealed, claimed: isClaimed, claimable: revealed && !isClaimed }
  })
}

/** Landmarks revealed but not yet claimed, in discovery order (the queue of
 *  celebrations owed to the player). */
export function pendingDiscoveries(points: number, claimedIds: number[]): LandmarkView[] {
  return landmarkViews(points, claimedIds).filter(v => v.claimable)
}

/** Gems already banked (sum of claimed landmark payouts). */
export function gemsClaimed(claimedIds: number[]): number {
  const claimed = new Set(claimedIds)
  return LANDMARKS.filter(l => claimed.has(l.id)).reduce((s, l) => s + l.gems, 0)
}

/** How much of the sea is charted, 0-1, by discovered landmark count. */
export function chartProgress(points: number): number {
  const found = LANDMARKS.filter(l => points >= l.threshold).length
  return found / LANDMARKS.length
}

/** The next landmark still fogged, or null when the whole sea is charted. */
export function nextLandmark(points: number): Landmark | null {
  return LANDMARKS.find(l => points < l.threshold) ?? null
}

export const CHART_FULLY_CHARTED = (points: number) => points >= WORLD_CHART_FULL_POINTS
