// ── PROGRESSION'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// Renown, badges, the unlock banner, the first run, the homestead and the
// captain's own name and looks as one object. On the web each call is the
// server action (the unlock banner's is the /api/unlocks route, so it never
// queues behind a press); on Steam the same interface runs lib/core/progress,
// lib/core/homestead and lib/core/profile against the local save. The
// signatures ARE the actions' (typeof), so the two cannot drift.

import { getRenownState, markRenownIntroSeen, allocateRenown, commitRenown, respecRenown, buyRenownRespec } from '@/app/(app)/actions/renown'
import { reconcileBadges, claimBadgeReward, claimAllBadgeRewards, getUnlockedBadges, unlockBadge, equipBadge, unequipBadge } from '@/app/(app)/achievements/badgeActions'
import type { checkUnlocks } from '@/app/(app)/unlockActions'
import { markSetupSeen, claimWelcomePack } from '@/app/actions/firstRun'
import { getHomestead, build, renameHomestead, furnish, pinBadges } from '@/app/(app)/home/actions'
import {
  updateUsername, checkUsername, updateShowcaseCrew, purchaseCharacterColor, updateCharacterColor,
  persistEarnedSkins, persistEarnedBoats, updateAvatarColors, updateProfileBg, purchaseAvatarSpecial, searchUsers,
} from '@/app/(app)/u/actions'

export type { RenownState, UnlockNews } from '@/lib/core/progress'
export type { BuildResult } from '@/lib/core/homestead'

export interface ProgressApi {
  // ── Renown ──
  getRenownState: typeof getRenownState
  markRenownIntroSeen: typeof markRenownIntroSeen
  allocateRenown: typeof allocateRenown
  commitRenown: typeof commitRenown
  respecRenown: typeof respecRenown
  buyRenownRespec: typeof buyRenownRespec
  // ── Badges and the unlock banner ──
  reconcileBadges: typeof reconcileBadges
  claimBadgeReward: typeof claimBadgeReward
  claimAllBadgeRewards: typeof claimAllBadgeRewards
  getUnlockedBadges: typeof getUnlockedBadges
  unlockBadge: typeof unlockBadge
  equipBadge: typeof equipBadge
  unequipBadge: typeof unequipBadge
  checkUnlocks: typeof checkUnlocks
  // ── The first run ──
  markSetupSeen: typeof markSetupSeen
  claimWelcomePack: typeof claimWelcomePack
  // ── The homestead ──
  getHomestead: typeof getHomestead
  build: typeof build
  renameHomestead: typeof renameHomestead
  furnish: typeof furnish
  pinBadges: typeof pinBadges
  // ── The captain's name and looks ──
  updateUsername: typeof updateUsername
  checkUsername: typeof checkUsername
  updateShowcaseCrew: typeof updateShowcaseCrew
  purchaseCharacterColor: typeof purchaseCharacterColor
  updateCharacterColor: typeof updateCharacterColor
  persistEarnedSkins: typeof persistEarnedSkins
  persistEarnedBoats: typeof persistEarnedBoats
  updateAvatarColors: typeof updateAvatarColors
  updateProfileBg: typeof updateProfileBg
  purchaseAvatarSpecial: typeof purchaseAvatarSpecial
  searchUsers: typeof searchUsers
}

/** The web implementation: each call is the server action, except the unlock
 *  check, which is the /api/unlocks route. */
export const webProgressApi: ProgressApi = {
  getRenownState, markRenownIntroSeen, allocateRenown, commitRenown, respecRenown, buyRenownRespec,
  reconcileBadges, claimBadgeReward, claimAllBadgeRewards, getUnlockedBadges, unlockBadge, equipBadge, unequipBadge,
  async checkUnlocks() {
    // A route, not a server action: see app/api/unlocks.
    const res = await fetch('/api/unlocks', { method: 'POST' })
    return res.ok ? await res.json() : []
  },
  markSetupSeen, claimWelcomePack,
  getHomestead, build, renameHomestead, furnish, pinBadges,
  updateUsername, checkUsername, updateShowcaseCrew, purchaseCharacterColor, updateCharacterColor,
  persistEarnedSkins, persistEarnedBoats, updateAvatarColors, updateProfileBg, purchaseAvatarSpecial, searchUsers,
}
