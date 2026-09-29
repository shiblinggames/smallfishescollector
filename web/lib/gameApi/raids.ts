// ── THE RAIDS' SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// A raid run, the campaign map's nodes, the Sunken Hand's spoils, repair kits
// and the raid tutorials as one object. On the web each call is the server
// action; on Steam the same interface runs lib/core/raids and lib/core/raidMap
// against the local save. The signatures ARE the actions' (typeof), so the two
// cannot drift.

import { startRaidRun, recordRaidClear, recordSkirmishClear, recordRaidHit, claimRaidLoot } from '@/app/(app)/raids/actions'
import { awardRaidKill } from '@/app/(app)/raids/raidXPActions'
import { getCheckTutorialSeen, markCheckTutorialSeen } from '@/app/(app)/raids/checkTutorialActions'
import { getSkirmishTourSeen, markSkirmishTourSeen } from '@/app/(app)/raids/skirmishTourActions'
import { markRaidTutorialSeen } from '@/app/(app)/raids/tutorialActions'
import { buyRepairKit } from '@/app/(app)/expeditions/repairKitActions'
import { chooseSpoil, buySpoil, equipSecondSpecial } from '@/app/(app)/expeditions/spoilsActions'
import {
  getRaidMapView, markChapterUnlockSeen, claimMilestoneNode, markStoryNodeRead, solvePuzzleNode,
  claimQuartermasterChoice, standForMuster, pickRaidEventChoice, pickForkRoute, rollDiceNode,
  getDpsCheckPreview, resolveDpsCheck, claimScoutDebt, pickShipClass, refitShipClasses,
} from '@/app/(app)/expeditions/raidMapActions'

export type { RaidClearTimes, RaidLootResult } from '@/app/(app)/raids/actions'
export type { RaidRecords } from '@/app/(app)/expeditions/raidMapActions'
export type { SpoilSide } from '@/app/(app)/expeditions/spoilsActions'

export interface RaidsApi {
  // ── A raid run ──
  startRaidRun: typeof startRaidRun
  awardRaidKill: typeof awardRaidKill
  recordRaidClear: typeof recordRaidClear
  recordSkirmishClear: typeof recordSkirmishClear
  recordRaidHit: typeof recordRaidHit
  claimRaidLoot: typeof claimRaidLoot
  // ── The campaign map ──
  getRaidMapView: typeof getRaidMapView
  markChapterUnlockSeen: typeof markChapterUnlockSeen
  claimMilestoneNode: typeof claimMilestoneNode
  markStoryNodeRead: typeof markStoryNodeRead
  solvePuzzleNode: typeof solvePuzzleNode
  claimQuartermasterChoice: typeof claimQuartermasterChoice
  standForMuster: typeof standForMuster
  pickRaidEventChoice: typeof pickRaidEventChoice
  pickForkRoute: typeof pickForkRoute
  rollDiceNode: typeof rollDiceNode
  getDpsCheckPreview: typeof getDpsCheckPreview
  resolveDpsCheck: typeof resolveDpsCheck
  claimScoutDebt: typeof claimScoutDebt
  pickShipClass: typeof pickShipClass
  refitShipClasses: typeof refitShipClasses
  // ── The Sunken Hand's spoils ──
  chooseSpoil: typeof chooseSpoil
  buySpoil: typeof buySpoil
  equipSecondSpecial: typeof equipSecondSpecial
  // ── Kits and tutorials ──
  buyRepairKit: typeof buyRepairKit
  getCheckTutorialSeen: typeof getCheckTutorialSeen
  markCheckTutorialSeen: typeof markCheckTutorialSeen
  getSkirmishTourSeen: typeof getSkirmishTourSeen
  markSkirmishTourSeen: typeof markSkirmishTourSeen
  markRaidTutorialSeen: typeof markRaidTutorialSeen
}

/** The web implementation: each call is the server action. */
export const webRaidsApi: RaidsApi = {
  startRaidRun, awardRaidKill, recordRaidClear, recordSkirmishClear, recordRaidHit, claimRaidLoot,
  getRaidMapView, markChapterUnlockSeen, claimMilestoneNode, markStoryNodeRead, solvePuzzleNode,
  claimQuartermasterChoice, standForMuster, pickRaidEventChoice, pickForkRoute, rollDiceNode,
  getDpsCheckPreview, resolveDpsCheck, claimScoutDebt, pickShipClass, refitShipClasses,
  chooseSpoil, buySpoil, equipSecondSpecial,
  buyRepairKit, getCheckTutorialSeen, markCheckTutorialSeen, getSkirmishTourSeen, markSkirmishTourSeen, markRaidTutorialSeen,
}
