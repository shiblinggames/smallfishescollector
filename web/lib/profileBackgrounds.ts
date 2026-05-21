// Page-background options for /profile. Each maps to a fishing zone painting
// and unlocks when the player has reached that zone's minimum fishing level
// (mirrors ZONE_MIN_LEVEL). The chosen id is stored in profiles.profile_bg;
// null = no background (plain page). Validated server-side in updateProfileBg.

import { ZONE_MIN_LEVEL } from '@/app/fishing/zoneData'

export interface ProfileBackground {
  /** Zone id — also the value stored in profiles.profile_bg. */
  id: string
  label: string
  /** Full-scene painting in /public. */
  src: string
  /** Darkening overlay for legibility. Dark zones use a lighter scrim so the
   *  art's texture/colour isn't crushed into the black page bg. */
  scrim: string
  /** Fishing level required to unlock (from ZONE_MIN_LEVEL). */
  minLevel: number
}

export const DEFAULT_PROFILE_SCRIM =
  'linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.74) 100%)'

export const PROFILE_BACKGROUNDS: ProfileBackground[] = [
  { id: 'shallows',    label: 'Shallows',    src: '/shallows.jpg',  scrim: DEFAULT_PROFILE_SCRIM, minLevel: ZONE_MIN_LEVEL.shallows },
  { id: 'open_waters', label: 'Open Waters', src: '/openwaters.jpg', scrim: DEFAULT_PROFILE_SCRIM, minLevel: ZONE_MIN_LEVEL.open_waters },
  { id: 'deep',        label: 'Deep',        src: '/deep.jpg',      scrim: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.48) 50%, rgba(0,0,0,0.72) 100%)', minLevel: ZONE_MIN_LEVEL.deep },
  { id: 'abyss',       label: 'Abyss',       src: '/abyss.jpg',     scrim: 'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.24) 50%, rgba(0,0,0,0.46) 100%)', minLevel: ZONE_MIN_LEVEL.abyss },
  { id: 'ancient_deep', label: 'Ancient Deep', src: '/ancient.jpg', scrim: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0.52) 100%)', minLevel: ZONE_MIN_LEVEL.ancient_deep },
]

export function getProfileBackground(id: string | null | undefined): ProfileBackground | undefined {
  if (!id) return undefined
  return PROFILE_BACKGROUNDS.find(b => b.id === id)
}
