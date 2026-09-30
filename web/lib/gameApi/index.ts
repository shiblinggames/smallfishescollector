// ── THE GAME API (Steam prep, step 7, 2026-09-28) ──
//
// The one object the client talks to the game through. Today it is the web:
// every call is a server action, exactly as before. A Steam build replaces the
// implementation (a module alias at build time) with one that runs the game
// core against the local save, and no component changes.
//
// Systems join as they are converted: fishing (the offline spike's target,
// docs/systems/steam-port.md step 8), then selling, the crew, voyages and
// trawls, the gauntlets, the Den, raids and the campaign map, the ship and the
// Shipyard, and the daily loop (bounties, challenges, the Daily Haul, mail,
// contests), the Parlor, the Chart Room and the sea's own (the regulars, Finn,
// digs, isles, the portal, the recall).

import { webFishingApi, type FishingApi } from './fishing'
import { webSellingApi, type SellingApi } from './selling'
import { webCrewApi, type CrewApi } from './crew'
import { webVoyagesApi, type VoyagesApi } from './voyages'
import { webGauntletApi, type GauntletApi } from './gauntlet'
import { webCasinoApi, type CasinoApi } from './casino'
import { webRaidsApi, type RaidsApi } from './raids'
import { webShipApi, type ShipApi } from './ship'
import { webDailiesApi, type DailiesApi } from './dailies'
import { webParlorApi, type ParlorApi } from './parlor'
import { webChartRoomApi, type ChartRoomApi } from './chartRoom'
import { webSeaApi, type SeaApi } from './sea'

export interface GameApi {
  fishing: FishingApi
  selling: SellingApi
  crew: CrewApi
  voyages: VoyagesApi
  gauntlet: GauntletApi
  casino: CasinoApi
  raids: RaidsApi
  ship: ShipApi
  dailies: DailiesApi
  parlor: ParlorApi
  chartRoom: ChartRoomApi
  sea: SeaApi
}

export const api: GameApi = {
  fishing: webFishingApi,
  selling: webSellingApi,
  crew: webCrewApi,
  voyages: webVoyagesApi,
  gauntlet: webGauntletApi,
  casino: webCasinoApi,
  raids: webRaidsApi,
  ship: webShipApi,
  dailies: webDailiesApi,
  parlor: webParlorApi,
  chartRoom: webChartRoomApi,
  sea: webSeaApi,
}

export type { FishingApi } from './fishing'
export type { FishSpecies, WaitingFolk } from './fishing'
export type { SellingApi, PendingSale, DealResult } from './selling'
export type { GauntletApi } from './gauntlet'
export type { ShipApi } from './ship'
export type { DailiesApi, BountyBoard, BountyView } from './dailies'
export type { ParlorApi } from './parlor'
export type { ChartRoomApi } from './chartRoom'
export type { SeaApi, Rapport, FolkTalk, FolkAsk, FolkGift, FinnSeaState, FinnTalk, FinnQuestView, BottleResult, DigResult, DigState, AshoreResult } from './sea'
export type { CasinoApi } from './casino'
export type { RaidsApi, RaidClearTimes, RaidLootResult, RaidRecords, SpoilSide } from './raids'
export type { VoyagesApi, DailyVoyage, VoyageBoard, CrewHubState, HubCrew } from './voyages'
export type { CrewApi, CrewState, CrewMember, BoardCandidate, CrewActionResult, FallenCrew, RecruitFace, BunkClaimResult } from './crew'
