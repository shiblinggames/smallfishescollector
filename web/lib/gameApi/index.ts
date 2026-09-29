// ── THE GAME API (Steam prep, step 7, 2026-09-28) ──
//
// The one object the client talks to the game through. Today it is the web:
// every call is a server action, exactly as before. A Steam build replaces the
// implementation (a module alias at build time) with one that runs the game
// core against the local save, and no component changes.
//
// Systems join as they are converted: fishing (the offline spike's target,
// docs/systems/steam-port.md step 8), then selling, the crew, voyages and
// trawls, the gauntlets.

import { webFishingApi, type FishingApi } from './fishing'
import { webSellingApi, type SellingApi } from './selling'
import { webCrewApi, type CrewApi } from './crew'
import { webVoyagesApi, type VoyagesApi } from './voyages'
import { webGauntletApi, type GauntletApi } from './gauntlet'

export interface GameApi {
  fishing: FishingApi
  selling: SellingApi
  crew: CrewApi
  voyages: VoyagesApi
  gauntlet: GauntletApi
}

export const api: GameApi = {
  fishing: webFishingApi,
  selling: webSellingApi,
  crew: webCrewApi,
  voyages: webVoyagesApi,
  gauntlet: webGauntletApi,
}

export type { FishingApi } from './fishing'
export type { FishSpecies, WaitingFolk } from './fishing'
export type { SellingApi, PendingSale, DealResult } from './selling'
export type { GauntletApi } from './gauntlet'
export type { VoyagesApi, DailyVoyage, VoyageBoard, CrewHubState, HubCrew } from './voyages'
export type { CrewApi, CrewState, CrewMember, BoardCandidate, CrewActionResult, FallenCrew, RecruitFace, BunkClaimResult } from './crew'
