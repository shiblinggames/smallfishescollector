// ── THE DAILY LOOP'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// Bounties, the daily challenges, the Daily Haul, the mailbox and the contests
// as one object. On the web each call is the server action; on Steam the same
// interface runs lib/core/bounties and lib/core/dailies against the local save.
// The signatures ARE the actions' (typeof), so the two cannot drift.

import { getBountyBoard, claimBounty, claimBountyMilestone, rerollBounty, markBountyRungSeen } from '@/app/(app)/expeditions/bountyActions'
import { getDailyChallenge, claimDailyReward, claimDailySweep } from '@/app/(app)/fishing/dailyChallengeActions'
import { claimDailyBonus, claimDailyBait, claimWeeklyCrate, bonusState } from '@/app/actions/dailyBonus'
import { getInbox, getMailUnreadCount, markMailRead, markAllMailRead, claimMailAttachment } from '@/app/actions/mail'
import { markContestsSeen, getContestsView } from '@/app/(app)/tavern/contests/actions'

export type { BountyBoard, BountyView } from '@/lib/core/bounties'

export interface DailiesApi {
  // ── Bounties ──
  getBountyBoard: typeof getBountyBoard
  claimBounty: typeof claimBounty
  claimBountyMilestone: typeof claimBountyMilestone
  rerollBounty: typeof rerollBounty
  markBountyRungSeen: typeof markBountyRungSeen
  // ── The daily challenges ──
  getDailyChallenge: typeof getDailyChallenge
  claimDailyReward: typeof claimDailyReward
  claimDailySweep: typeof claimDailySweep
  // ── The Daily Haul ──
  claimDailyBonus: typeof claimDailyBonus
  claimDailyBait: typeof claimDailyBait
  claimWeeklyCrate: typeof claimWeeklyCrate
  bonusState: typeof bonusState
  // ── Mail ──
  getInbox: typeof getInbox
  getMailUnreadCount: typeof getMailUnreadCount
  markMailRead: typeof markMailRead
  markAllMailRead: typeof markAllMailRead
  claimMailAttachment: typeof claimMailAttachment
  // ── Contests ──
  markContestsSeen: typeof markContestsSeen
  getContestsView: typeof getContestsView
}

/** The web implementation: each call is the server action. */
export const webDailiesApi: DailiesApi = {
  getBountyBoard, claimBounty, claimBountyMilestone, rerollBounty, markBountyRungSeen,
  getDailyChallenge, claimDailyReward, claimDailySweep,
  claimDailyBonus, claimDailyBait, claimWeeklyCrate, bonusState,
  getInbox, getMailUnreadCount, markMailRead, markAllMailRead, claimMailAttachment,
  markContestsSeen, getContestsView,
}
