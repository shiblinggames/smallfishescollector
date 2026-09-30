// ── THE SEA'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The regulars, Finn, bottles and digs, the isles, the portal, the recall, Kip,
// the tours, the chart's sheets, the Day board, the arrival read and pacts as
// one object. On the web each call is the server action; on Steam the
// same interface runs lib/core/sea against the local save. The signatures ARE
// the actions' (typeof), so the two cannot drift.

import { folkState, talkToFolk, askForFavourite, deliverToFolk, buyFolkRod } from '@/app/(app)/sea/folkActions'
import { finnState, turnInFinnQuest, speakToFinn } from '@/app/(app)/sea/finnActions'
import { markFinnRevealSeen } from '@/app/(app)/fishing/finnActions'
import { getDigState, openBottle, digHere } from '@/app/(app)/sea/digActions'
import { getDiscoveries, goAshore } from '@/app/(app)/sea/isleActions'
import { buyPortalTier } from '@/app/(app)/sea/portalActions'
import { spendRecall } from '@/app/(app)/sea/recallActions'
import { smugglerStanding } from '@/app/(app)/sea/smugglerActions'
import { skipTutorials, markSeaTourSeen, setSeaTourStep, getSeaTourStep, markSeaHintSeen, markGateTourSeen, setGateTourStep } from '@/app/(app)/sea/tourActions'
import { loadoutGear } from '@/app/(app)/sea/loadoutActions'
import { raidSheetState } from '@/app/(app)/sea/raidSheetActions'
import { nodeSheet } from '@/app/(app)/sea/nodeSheetActions'
import { bossCardState } from '@/app/(app)/sea/bossCardActions'
import { dayState } from '@/app/(app)/sea/dayActions'
import { seaBoot } from '@/app/(app)/sea/bootActions'
import { pactState, requestPact, acceptPact, endPact, endPactWith, hasAcceptedPact, pendingPacts } from '@/app/(app)/sea/pactActions'

export type { LoadoutGear, RaidSheetState, NodeSheetState, BossCardState, DayState } from '@/lib/core/seaSheets'
export type { SeaBoot } from '@/app/(app)/sea/bootActions'
export type { PactState, PactPerson } from '@/app/(app)/sea/pactActions'
export type { Rapport, FolkTalk, FolkAsk, FolkGift, FinnSeaState, FinnTalk, FinnQuestView, BottleResult, DigResult, DigState, AshoreResult } from '@/lib/core/sea'

export interface SeaApi {
  // ── The regulars ──
  folkState: typeof folkState
  talkToFolk: typeof talkToFolk
  askForFavourite: typeof askForFavourite
  deliverToFolk: typeof deliverToFolk
  buyFolkRod: typeof buyFolkRod
  // ── Finn ──
  finnState: typeof finnState
  turnInFinnQuest: typeof turnInFinnQuest
  speakToFinn: typeof speakToFinn
  markFinnRevealSeen: typeof markFinnRevealSeen
  // ── Bottles, digs, isles ──
  getDigState: typeof getDigState
  openBottle: typeof openBottle
  digHere: typeof digHere
  getDiscoveries: typeof getDiscoveries
  goAshore: typeof goAshore
  // ── The portal, the recall, Kip ──
  buyPortalTier: typeof buyPortalTier
  spendRecall: typeof spendRecall
  smugglerStanding: typeof smugglerStanding
  // ── The tours ──
  skipTutorials: typeof skipTutorials
  markSeaTourSeen: typeof markSeaTourSeen
  setSeaTourStep: typeof setSeaTourStep
  getSeaTourStep: typeof getSeaTourStep
  markSeaHintSeen: typeof markSeaHintSeen
  markGateTourSeen: typeof markGateTourSeen
  setGateTourStep: typeof setGateTourStep
  // ── The sheets and the boards ──
  loadoutGear: typeof loadoutGear
  raidSheetState: typeof raidSheetState
  nodeSheet: typeof nodeSheet
  bossCardState: typeof bossCardState
  dayState: typeof dayState
  seaBoot: typeof seaBoot
  // ── Pacts (between players: online only; offline there is nobody to ask) ──
  pactState: typeof pactState
  requestPact: typeof requestPact
  acceptPact: typeof acceptPact
  endPact: typeof endPact
  endPactWith: typeof endPactWith
  hasAcceptedPact: typeof hasAcceptedPact
  pendingPacts: typeof pendingPacts
}

/** The web implementation: each call is the server action. */
export const webSeaApi: SeaApi = {
  folkState, talkToFolk, askForFavourite, deliverToFolk, buyFolkRod,
  finnState, turnInFinnQuest, speakToFinn, markFinnRevealSeen,
  getDigState, openBottle, digHere, getDiscoveries, goAshore,
  buyPortalTier, spendRecall, smugglerStanding,
  skipTutorials, markSeaTourSeen, setSeaTourStep, getSeaTourStep, markSeaHintSeen, markGateTourSeen, setGateTourStep,
  loadoutGear, raidSheetState, nodeSheet, bossCardState, dayState, seaBoot,
  pactState, requestPact, acceptPact, endPact, endPactWith, hasAcceptedPact, pendingPacts,
}
