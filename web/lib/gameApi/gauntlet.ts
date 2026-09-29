// ── THE GAUNTLETS' SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// Davy's and the Don's descents as one object: the lobby, the run, its
// checkpoints and finish, the Locker. On the web each call is the server
// action; on Steam the same interface runs lib/core/gauntlet against the local
// save. The signatures ARE the actions' (typeof), so the two cannot drift.

import {
  recordGauntletHit, getGauntletUpgradeState, claimDailyTribute, setGauntletUpgradeActive, claimGauntletUpgrade,
  wagerGauntletFathoms, buyMerchantItem, markConfluencesSeen, getGauntletLeaderboard, getGauntletDailyState,
  checkpointGauntletRun, pauseGauntletRun, resumeGauntletRun, startGauntletRun, rollDavyOffer,
  cashOutGauntlet, resolveGauntletDeath, buyBaitWithFathoms, markGauntletIntroSeen,
} from '@/app/(app)/raids/gauntlet/actions'

export interface GauntletApi {
  // ── The lobby ──
  getGauntletDailyState: typeof getGauntletDailyState
  getGauntletLeaderboard: typeof getGauntletLeaderboard
  markGauntletIntroSeen: typeof markGauntletIntroSeen
  // ── The run ──
  startGauntletRun: typeof startGauntletRun
  checkpointGauntletRun: typeof checkpointGauntletRun
  pauseGauntletRun: typeof pauseGauntletRun
  resumeGauntletRun: typeof resumeGauntletRun
  rollDavyOffer: typeof rollDavyOffer
  recordGauntletHit: typeof recordGauntletHit
  wagerGauntletFathoms: typeof wagerGauntletFathoms
  buyMerchantItem: typeof buyMerchantItem
  markConfluencesSeen: typeof markConfluencesSeen
  cashOutGauntlet: typeof cashOutGauntlet
  resolveGauntletDeath: typeof resolveGauntletDeath
  // ── The Locker ──
  getGauntletUpgradeState: typeof getGauntletUpgradeState
  claimGauntletUpgrade: typeof claimGauntletUpgrade
  setGauntletUpgradeActive: typeof setGauntletUpgradeActive
  claimDailyTribute: typeof claimDailyTribute
  buyBaitWithFathoms: typeof buyBaitWithFathoms
}

/** The web implementation: each call is the server action. */
export const webGauntletApi: GauntletApi = {
  getGauntletDailyState, getGauntletLeaderboard, markGauntletIntroSeen,
  startGauntletRun, checkpointGauntletRun, pauseGauntletRun, resumeGauntletRun, rollDavyOffer,
  recordGauntletHit, wagerGauntletFathoms, buyMerchantItem, markConfluencesSeen, cashOutGauntlet, resolveGauntletDeath,
  getGauntletUpgradeState, claimGauntletUpgrade, setGauntletUpgradeActive, claimDailyTribute, buyBaitWithFathoms,
}
