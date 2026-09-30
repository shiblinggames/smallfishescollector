// ── THE ONLINE-ONLY SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The things that are between players or go through a payment provider: the
// leaderboards, following other captains, visiting their homesteads and
// seeing them at sea, the Exchange board, membership and gem checkout, the
// activity ping and the honeypot. On the web each call is the server action.
// On Steam there is nobody else and no checkout, so the desktop answers each
// one honestly (nobody to follow, the Exchange closed, checkout on the website,
// membership and gems read from the save) rather than failing. The signatures
// ARE the actions' (typeof), so the two cannot drift.

import { getLeaderboardBoards } from '@/app/(app)/leaderboard/actions'
import { getCrew, addCrewMember, getNewFollowers, removeCrewMember } from '@/app/(app)/social/actions'
import { visitableHomesteads, homesteadOf, friendsAtSea } from '@/app/(app)/home/visitActions'
import { getBoard, openBet, markBetsSeen, sellBet, markIntroSeen } from '@/app/(app)/tavern/market/boardActions'
import { createEmbeddedCheckout, createHostedCheckout, checkMembership } from '@/app/actions/membership'
import { createGemCheckout, createGemHostedCheckout, currentGems } from '@/app/actions/gems'
import { pingActivity } from '@/app/actions/activity'
import { claimFoundersChest } from '@/app/actions/honeypot'

export type { LeaderboardBoardsResult } from '@/app/(app)/leaderboard/actions'
export type { CrewMember as SocialCrewMember } from '@/app/(app)/social/actions'
export type { Visitable, Visit, FriendAtSea } from '@/app/(app)/home/visitActions'
export type { Board, BoardIndex, BoardBet, OpenResult, SellResult } from '@/app/(app)/tavern/market/boardActions'

export interface OnlineApi {
  getLeaderboardBoards: typeof getLeaderboardBoards
  // ── Following and visiting ──
  getCrew: typeof getCrew
  addCrewMember: typeof addCrewMember
  getNewFollowers: typeof getNewFollowers
  removeCrewMember: typeof removeCrewMember
  visitableHomesteads: typeof visitableHomesteads
  homesteadOf: typeof homesteadOf
  friendsAtSea: typeof friendsAtSea
  // ── The Exchange board ──
  getBoard: typeof getBoard
  openBet: typeof openBet
  markBetsSeen: typeof markBetsSeen
  sellBet: typeof sellBet
  markIntroSeen: typeof markIntroSeen
  // ── Membership and gems ──
  createEmbeddedCheckout: typeof createEmbeddedCheckout
  createHostedCheckout: typeof createHostedCheckout
  checkMembership: typeof checkMembership
  createGemCheckout: typeof createGemCheckout
  createGemHostedCheckout: typeof createGemHostedCheckout
  currentGems: typeof currentGems
  // ── Housekeeping ──
  pingActivity: typeof pingActivity
  claimFoundersChest: typeof claimFoundersChest
}

/** The web implementation: each call is the server action. */
export const webOnlineApi: OnlineApi = {
  getLeaderboardBoards,
  getCrew, addCrewMember, getNewFollowers, removeCrewMember, visitableHomesteads, homesteadOf, friendsAtSea,
  getBoard, openBet, markBetsSeen, sellBet, markIntroSeen,
  createEmbeddedCheckout, createHostedCheckout, checkMembership, createGemCheckout, createGemHostedCheckout, currentGems,
  pingActivity, claimFoundersChest,
}
