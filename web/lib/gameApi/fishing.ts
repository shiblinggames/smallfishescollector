// ── THE FISHING SIDE OF THE GAME API (Steam prep, step 7, 2026-09-28) ──
//
// What the fishing screens ask the game for, as one object. Components call
// `api.fishing.castLine(...)` instead of importing the server action, so the
// thing that answers can change without any component knowing:
//   - on the web (this file), every call is the existing server action, which
//     checks the session, runs lib/fishingRules and writes through
//     lib/data/fishingData: nothing about the web changes;
//   - on Steam, the same interface is implemented by running the game core
//     against the local save, with no network at all.
//
// The signatures ARE the server actions' signatures (typeof), so the two
// implementations cannot drift apart without the compiler saying so.

import {
  castLine, reelIn, reelCrate, useTideTurnerSkip, rerollWormhole,
  sellGoldenTrophy, mountGoldenTrophy, heldGolden,
  setAutoFishing, setShowWaitTimer, claimFishingLevelRewards,
  equipBoat, buyBoat, equipHat, buyHat, equipPet,
  equipSpecialItem, buySpecialItem, setCompletionistEffects,
} from '@/app/(app)/fishing/actions'

export type { FishSpecies, WaitingFolk } from '@/app/(app)/fishing/actions'

export interface FishingApi {
  // ── The cast ──
  castLine: typeof castLine
  reelIn: typeof reelIn
  reelCrate: typeof reelCrate
  /** Skip the fish on the line without breaking the streak (the Tide Turner). */
  tideTurnerSkip: typeof useTideTurnerSkip
  rerollWormhole: typeof rerollWormhole
  // ── Golden fish ──
  heldGolden: typeof heldGolden
  sellGoldenTrophy: typeof sellGoldenTrophy
  mountGoldenTrophy: typeof mountGoldenTrophy
  // ── Settings and rewards ──
  setAutoFishing: typeof setAutoFishing
  setShowWaitTimer: typeof setShowWaitTimer
  claimFishingLevelRewards: typeof claimFishingLevelRewards
  // ── The boat, the captain, the pets, the specials ──
  equipBoat: typeof equipBoat
  buyBoat: typeof buyBoat
  equipHat: typeof equipHat
  buyHat: typeof buyHat
  equipPet: typeof equipPet
  equipSpecialItem: typeof equipSpecialItem
  buySpecialItem: typeof buySpecialItem
  setCompletionistEffects: typeof setCompletionistEffects
}

/** The web implementation: each call is the server action. */
export const webFishingApi: FishingApi = {
  castLine, reelIn, reelCrate, tideTurnerSkip: useTideTurnerSkip, rerollWormhole,
  heldGolden, sellGoldenTrophy, mountGoldenTrophy,
  setAutoFishing, setShowWaitTimer, claimFishingLevelRewards,
  equipBoat, buyBoat, equipHat, buyHat, equipPet,
  equipSpecialItem, buySpecialItem, setCompletionistEffects,
}
