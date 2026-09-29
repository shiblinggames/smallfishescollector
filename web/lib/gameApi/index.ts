// ── THE GAME API (Steam prep, step 7, 2026-09-28) ──
//
// The one object the client talks to the game through. Today it is the web:
// every call is a server action, exactly as before. A Steam build replaces the
// implementation (a module alias at build time) with one that runs the game
// core against the local save, and no component changes.
//
// Systems join as they are converted: fishing (the offline spike's target,
// docs/systems/steam-port.md step 8), then selling.

import { webFishingApi, type FishingApi } from './fishing'
import { webSellingApi, type SellingApi } from './selling'

export interface GameApi {
  fishing: FishingApi
  selling: SellingApi
}

export const api: GameApi = {
  fishing: webFishingApi,
  selling: webSellingApi,
}

export type { FishingApi } from './fishing'
export type { FishSpecies, WaitingFolk } from './fishing'
export type { SellingApi, PendingSale, DealResult } from './selling'
