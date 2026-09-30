// ── THE HARBOUR'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The tackle shop, the hook bench, the fish hold, the Shipyard's hulls and
// name, the Almanac, and the Shipyard's and ship screen's state as one object.
// On the web each call is the server action; on Steam the same interface runs
// lib/core/harbour against the local save. The signatures ARE the actions'
// (typeof), so the two cannot drift.
//
// The tackle shop's `equipRod` is `equipTackleRod` here: the Shipyard's own
// `equipRod` is api.ship.equipRod.

import {
  buyBait, purchaseRod, sellRod, claimCompletionistRod, equipRod as tackleEquipRod, buyReel,
} from '@/app/(app)/marketplace/tackle-shop/actions'
import { buyHook } from '@/app/(app)/hooks/actions'
import { upgradeFishHold, holdContents } from '@/app/(app)/fishing/holdActions'
import { getAlmanacData, markAlmanacViewed } from '@/app/(app)/fishing/almanacActions'
import { buyShip, renameShip } from '@/app/shipyard/actions'
import { shipyardState } from '@/app/(app)/shipyard/shipyardState'
import { getShipHeroProps } from '@/app/(app)/expeditions/shipHeroData'

export type { AlmanacEntry, GoldenCatch, AlmanacStats, AlmanacData, ShipyardState } from '@/lib/core/harbour'

export interface HarbourApi {
  // ── The tackle shop and the hook bench ──
  buyBait: typeof buyBait
  purchaseRod: typeof purchaseRod
  sellRod: typeof sellRod
  claimCompletionistRod: typeof claimCompletionistRod
  equipTackleRod: typeof tackleEquipRod
  buyReel: typeof buyReel
  buyHook: typeof buyHook
  // ── The fish hold ──
  upgradeFishHold: typeof upgradeFishHold
  holdContents: typeof holdContents
  // ── The Shipyard's hulls, and the two state reads ──
  buyShip: typeof buyShip
  renameShip: typeof renameShip
  shipyardState: typeof shipyardState
  getShipHeroProps: typeof getShipHeroProps
  // ── The Almanac ──
  getAlmanacData: typeof getAlmanacData
  markAlmanacViewed: typeof markAlmanacViewed
}

/** The web implementation: each call is the server action. */
export const webHarbourApi: HarbourApi = {
  buyBait, purchaseRod, sellRod, claimCompletionistRod, equipTackleRod: tackleEquipRod, buyReel, buyHook,
  upgradeFishHold, holdContents,
  buyShip, renameShip, shipyardState, getShipHeroProps,
  getAlmanacData, markAlmanacViewed,
}
