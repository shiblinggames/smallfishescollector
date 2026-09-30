// ── THE SEA'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The regulars, Finn, bottles and digs, the isles, the portal, the recall and
// Kip as one object. On the web each call is the server action; on Steam the
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
}

/** The web implementation: each call is the server action. */
export const webSeaApi: SeaApi = {
  folkState, talkToFolk, askForFavourite, deliverToFolk, buyFolkRod,
  finnState, turnInFinnQuest, speakToFinn, markFinnRevealSeen,
  getDigState, openBottle, digHere, getDiscoveries, goAshore,
  buyPortalTier, spendRecall, smugglerStanding,
}
