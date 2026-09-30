// @/lib/navState, for the desktop shell: the Nav's purse, look, waiting badges
// and voyages at sea, read from the save rather than the database. The Nav
// re-reads on every screen change and whenever a badge changes, so this keeps
// it true to the save without any live feed.

import { currentSave } from '../localGameApi'
import type { NavState, NavProfile } from '../../../web/lib/navState'

export type { NavState, NavProfile }

export async function readNavState(): Promise<NavState | null> {
  const save = currentSave()
  if (!save) return null
  const p = save.profile
  return {
    profile: {
      character_color: (p.character_color as string | null) ?? null,
      equipped_hat: (p.equipped_hat as string | null) ?? null,
      avatar_bg_color: (p.avatar_bg_color as string | null) ?? null,
      avatar_border_color: (p.avatar_border_color as string | null) ?? null,
      is_admin: (p.is_admin as boolean | null) ?? null,
      doubloons: Number(p.doubloons ?? 0),
      gems: Number(p.gems ?? 0),
      unlocked_badges: (p.unlocked_badges as string[] | null) ?? [],
      claimed_badge_rewards: (p.claimed_badge_rewards as string[] | null) ?? [],
    },
    pendingVoyages: save.voyages
      .filter(v => v.status === 'pending')
      .map(v => ({ created_at: v.created_at, duration_ms: v.duration_ms ?? null })),
  }
}
