// Reverse lookup for the level gates (lib/gearGating): given a level-up range,
// which gear just became BUYABLE. Drives the "Gear Unlocked" thumbnails on the
// fishing + nav level-up celebrations. Pure data — safe on client and server.

import { RODS } from './rods'
import { REELS } from './reels'
import { HOOKS } from './hooks'
import { SHIPS } from './ships'
import { fishingGearLevelReq, navLevelReqForShip } from './gearGating'

export interface UnlockedGear {
  name: string
  /** Thumbnail path ('' if the item has no art). */
  image: string
}

const toThumb = (imageUrl?: string | null): string => (imageUrl ? imageUrl.replace(/\.png$/, '_thumb.png') : '')

/** Fishing gear (rod / reel / hook) whose Fishing-Level gate lands in (from, to]. */
export function fishingGearUnlockedBetween(from: number, to: number): UnlockedGear[] {
  if (to <= from) return []
  const out: UnlockedGear[] = []
  for (const r of RODS) {
    if (r.earnedOnly || r.cost <= 0) continue
    const req = fishingGearLevelReq(r)
    if (req > from && req <= to) out.push({ name: r.name, image: r.slug ? `/${r.slug}_thumb.png` : toThumb(r.imageUrl) })
  }
  for (const reel of REELS) {
    if (reel.cost <= 0) continue
    const req = fishingGearLevelReq(reel)
    if (req > from && req <= to) out.push({ name: reel.name, image: toThumb(reel.imageUrl) })
  }
  for (const h of HOOKS) {
    if (h.cost <= 0) continue
    const req = fishingGearLevelReq(h)
    if (req > from && req <= to) out.push({ name: h.name, image: toThumb(h.imageUrl) })
  }
  return out
}

/** Ship hulls whose Nav-Level gate lands in (from, to]. */
export function shipsUnlockedBetween(from: number, to: number): UnlockedGear[] {
  if (to <= from) return []
  return SHIPS
    .filter(s => s.cost > 0 && navLevelReqForShip(s.cost) > from && navLevelReqForShip(s.cost) <= to)
    .map(s => ({ name: s.name, image: s.imageUrl ?? '' }))
}
