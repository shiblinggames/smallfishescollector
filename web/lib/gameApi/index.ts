// ── THE GAME API (Steam prep, step 7, 2026-09-28) ──
//
// The one object the client talks to the game through. Today it is the web:
// every call is a server action, exactly as before. A Steam build replaces the
// implementation (a module alias at build time) with one that runs the game
// core against the local save, and no component changes.
//
// Systems join as they are converted. Fishing first, because it is the offline
// spike's target (docs/systems/steam-port.md, step 8).

import { webFishingApi, type FishingApi } from './fishing'

export interface GameApi {
  fishing: FishingApi
}

export const api: GameApi = {
  fishing: webFishingApi,
}

export type { FishingApi } from './fishing'
export type { FishSpecies, WaitingFolk } from './fishing'
