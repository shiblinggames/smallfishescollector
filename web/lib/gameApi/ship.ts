// ── THE SHIP'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The ship screen (the raid loadout, the Forge, the Abyssal Accelerator, the
// ultimate, the Sixth Berth, the Expanded Armory, hull skins, the one-time
// guides) and the Shipyard's refits as one object. On the web each call is the
// server action; on Steam the same interface runs lib/core/ship against the
// local save. The signatures ARE the actions' (typeof), so the two cannot drift.
//
// The legacy card-collection crew picker (getCollectionForCrew, saveCrew) is
// not here: no screen calls it.

import {
  saveEquippedRaidItems, forgeRaidItem, learnForgeRecipe, startAbyssalConversion, claimAbyssalConversion,
  markForgeIntroSeen, equipShipSkin, getUltimateState, startUltimateBuild, swapUltimateBuild,
  startUltimateRetool, buyUltimateSchematics, switchUltimate, buySixthBerth, buyArmoryExpansion,
  markUltimateUnlockSeen, markShipGuideSeen,
} from '@/app/(app)/expeditions/actions'
import { buyHullTier, buyHandlingTier, buyLanternTier, buyAccelTier, equipRod } from '@/app/(app)/shipyard/actions'

export interface ShipApi {
  // ── The loadout, the Forge, the Accelerator, skins ──
  saveEquippedRaidItems: typeof saveEquippedRaidItems
  forgeRaidItem: typeof forgeRaidItem
  learnForgeRecipe: typeof learnForgeRecipe
  startAbyssalConversion: typeof startAbyssalConversion
  claimAbyssalConversion: typeof claimAbyssalConversion
  markForgeIntroSeen: typeof markForgeIntroSeen
  equipShipSkin: typeof equipShipSkin
  // ── The ultimate ──
  getUltimateState: typeof getUltimateState
  startUltimateBuild: typeof startUltimateBuild
  swapUltimateBuild: typeof swapUltimateBuild
  startUltimateRetool: typeof startUltimateRetool
  buyUltimateSchematics: typeof buyUltimateSchematics
  switchUltimate: typeof switchUltimate
  // ── The berth, the armory, the guides ──
  buySixthBerth: typeof buySixthBerth
  buyArmoryExpansion: typeof buyArmoryExpansion
  markUltimateUnlockSeen: typeof markUltimateUnlockSeen
  markShipGuideSeen: typeof markShipGuideSeen
  // ── The Shipyard ──
  buyHullTier: typeof buyHullTier
  buyHandlingTier: typeof buyHandlingTier
  buyLanternTier: typeof buyLanternTier
  buyAccelTier: typeof buyAccelTier
  equipRod: typeof equipRod
}

/** The web implementation: each call is the server action. */
export const webShipApi: ShipApi = {
  saveEquippedRaidItems, forgeRaidItem, learnForgeRecipe, startAbyssalConversion, claimAbyssalConversion,
  markForgeIntroSeen, equipShipSkin, getUltimateState, startUltimateBuild, swapUltimateBuild,
  startUltimateRetool, buyUltimateSchematics, switchUltimate, buySixthBerth, buyArmoryExpansion,
  markUltimateUnlockSeen, markShipGuideSeen,
  buyHullTier, buyHandlingTier, buyLanternTier, buyAccelTier, equipRod,
}
