// ── WHAT A CAPTAIN CAN ACTUALLY WEAR ────────────────────────────────────────
//
// Plain module, NOT 'use server' — every export here is pure and that directive
// silently drops non-async ones.
//
// ── EARNED IS NOT THE SAME AS STORED ────────────────────────────────────────
//
// `unlocked_character_colors` and `unlocked_boats` hold what has been GRANTED.
// Some cosmetics are earned by crossing a level or an achievement total and are
// only written to those columns when you first equip one — so the stored list
// is always a subset of what you are entitled to, and any screen that reads the
// column alone hides things the player has already earned.
//
// The shipyard page carried this union inline, with a comment warning that
// "without this, crossing Nav 50 through raids leaves a skin you have earned
// invisible on whichever of the two screens forgot to do the union". The sea's
// loadout is now the second screen, so the warning became a prediction. One
// copy, here, called by both.

import { earnedLevelColors, earnedAchievementColors } from '@/lib/characters'
import { earnedAchievementBoats } from '@/lib/boats'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'

/** The columns this needs. A loose shape rather than the generated row type so
 *  both callers can hand over whatever they already fetched. */
export type UnlockSource = {
  fishing_xp?: number | null
  expedition_xp?: number | null
  prestige_levels?: Record<string, number> | null
  unlocked_character_colors?: string[] | null
  unlocked_boats?: string[] | null
  unlocked_hats?: string[] | null
  unlocked_pets?: string[] | null
}

export type Unlocked = {
  colors: string[]
  boats: string[]
  hats: string[]
  pets: string[]
}

export function unlockedCosmetics(p: UnlockSource | null, achievementPoints: number): Unlocked {
  const storedColors = p?.unlocked_character_colors ?? []
  const storedBoats = p?.unlocked_boats ?? []
  return {
    colors: [
      ...storedColors,
      ...earnedLevelColors({
        fishingLevel: getLevelFromXP(Number(p?.fishing_xp ?? 0)),
        navLevel: navLevelFromXP(Number(p?.expedition_xp ?? 0)),
        maxPrestige: Math.max(0, ...Object.values(p?.prestige_levels ?? {})),
      }, storedColors),
      ...earnedAchievementColors(achievementPoints, storedColors),
    ],
    boats: [...storedBoats, ...earnedAchievementBoats(achievementPoints, storedBoats)],
    // Hats and pets have no earned-but-ungranted path today: everything is
    // written on unlock. They come through here anyway so a caller asks one
    // question rather than four, and so the day one of them grows a ladder
    // there is an obvious place for it.
    hats: p?.unlocked_hats ?? [],
    pets: p?.unlocked_pets ?? [],
  }
}
