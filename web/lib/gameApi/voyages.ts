// ── THE VOYAGES-AND-TRAWLS SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The daily voyage, the voyage board, the trawl docks and the crew's roll call
// as one object. On the web each call is the server action; on Steam the same
// interface runs lib/core/voyages against the local save. The signatures ARE
// the actions' (typeof), so the two cannot drift.

import { getDailyVoyageState, getTrawlingCrewIds, sendDailyVoyage, revealVoyageResults, fetchVoyageCaptainsLog } from '@/app/(app)/expeditions/voyageActions'
import { getTrawlState, deployTrawl, collectTrawl } from '@/app/(app)/fishing/trawls/actions'
import { voyageBoard } from '@/app/(app)/sea/voyageBoardActions'
import { crewHub } from '@/app/(app)/sea/crewHubActions'

export type { DailyVoyage } from '@/app/(app)/expeditions/voyageActions'
export type { VoyageBoard } from '@/app/(app)/sea/voyageBoardActions'
export type { CrewHubState, HubCrew } from '@/app/(app)/sea/crewHubActions'

export interface VoyagesApi {
  // ── The daily voyage ──
  getDailyVoyageState: typeof getDailyVoyageState
  getTrawlingCrewIds: typeof getTrawlingCrewIds
  sendDailyVoyage: typeof sendDailyVoyage
  revealVoyageResults: typeof revealVoyageResults
  fetchVoyageCaptainsLog: typeof fetchVoyageCaptainsLog
  voyageBoard: typeof voyageBoard
  // ── Trawls ──
  getTrawlState: typeof getTrawlState
  deployTrawl: typeof deployTrawl
  collectTrawl: typeof collectTrawl
  // ── Where everybody is ──
  crewHub: typeof crewHub
}

/** The web implementation: each call is the server action. */
export const webVoyagesApi: VoyagesApi = {
  getDailyVoyageState, getTrawlingCrewIds, sendDailyVoyage, revealVoyageResults, fetchVoyageCaptainsLog, voyageBoard,
  getTrawlState, deployTrawl, collectTrawl,
  crewHub,
}
