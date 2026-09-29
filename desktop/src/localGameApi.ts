// THE GAME API, OFFLINE (Steam prep, step 8 spike, stage 3).
//
// The website's lib/gameApi calls server actions. In the shell, Vite resolves
// `@/lib/gameApi` to THIS file instead, and the same calls are answered by the
// real fishing core (lib/core/fishing) running against the local save. The
// interface is the website's own FishingApi, so the two cannot drift.
//
// Every fishing call runs offline: the cast and the reel, the crate, the
// wormhole, the Tide Turner, the golden choice and the level rewards
// (lib/core/fishing), and the loadout (lib/core/loadout). Other systems are not
// on this API yet.

import type { GameApi, FishingApi } from '../../web/lib/gameApi/index'
import * as core from '@/lib/core/fishing'
import * as loadout from '@/lib/core/loadout'
import { localFishingData, type LocalSave } from '@/lib/data/local/fishingLocal'
import { loadSave, writeSave, type SaveStorage } from '@/lib/data/local/saveFile'
import { installRng, mulberry32, seedOf } from '@/lib/rng'
import type { SpeciesRow } from '@/lib/data/fishingData'
import speciesJson from '@/content/fish_species.json'
import { XP_TABLE } from '@/lib/fishingLevel'

export type { FishSpecies, WaitingFolk } from '../../web/lib/gameApi/index'

const SPECIES = speciesJson as unknown as SpeciesRow[]

/** The session: one captain, one save, one store. */
let session: { save: LocalSave; storage: SaveStorage } | null = null

function starterSave(): LocalSave {
  return {
    uid: 'local-captain',
    profile: {
      fishing_xp: XP_TABLE[4], doubloons: 500, gems: 0, rod_tier: 1, hook_tier: 0, line_tier: 0, fish_hold_tier: 1,
      ancient_catches: [], current_perfect_streak: 0, highest_perfect_streak: 0, total_perfects: 0, zone_perfects: {},
      lifetime_species: [], prestige_levels: {}, zone_golden_boost: {}, unlocked_pets: [], unlocked_character_colors: [],
      unlocked_badges: [], equipped_raid_items: [], catch_pending: false, pending_cast: null, pending_reroll: null,
    },
    species: SPECIES,
    bait: { worm: 60 }, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0, 1], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
  }
}

/** Open (or start) the captain's save. The save's own seed drives every roll. */
export async function openSave(storage: SaveStorage): Promise<LocalSave> {
  const loaded = await loadSave(storage, SPECIES)
  const save = loaded?.save ?? starterSave()
  session = { save, storage }
  installRng(mulberry32(seedOf(`${save.uid}:${Date.now()}`)))
  if (!loaded) await writeSave(storage, save)
  return save
}

export function currentSave(): LocalSave | null { return session?.save ?? null }

function need() {
  if (!session) throw new Error('no save open')
  return { db: localFishingData(session.save), save: session.save, storage: session.storage }
}
/** Run one call against the save, then autosave: anything may have changed the game. */
async function run<T>(fn: (db: ReturnType<typeof need>['db'], uid: string) => Promise<T>): Promise<T> {
  const { db, save, storage } = need()
  const r = await fn(db, save.uid)
  await writeSave(storage, save)
  return r
}

const fishing: FishingApi = {
  castLine: (baitType, habitat, at) => run((db, uid) => core.castLine(db, uid, baitType, habitat, at)),
  reelIn: (fishId, result, baitType, doubleCatch = false, streak = 0, jackpot = 1) =>
    run((db, uid) => core.reelIn(db, uid, fishId, result, baitType, doubleCatch, streak, jackpot)),
  reelCrate: (_zone, _tier, result = 'catch') => run((db, uid) => core.reelCrate(db, uid, result)),
  tideTurnerSkip: () => run((db, uid) => core.tideTurnerSkip(db, uid)),
  rerollWormhole: () => run((db, uid) => core.rerollWormhole(db, uid)),
  heldGolden: () => run((db, uid) => core.heldGolden(db, uid)),
  sellGoldenTrophy: (shinyId) => run((db, uid) => core.sellGoldenTrophy(db, uid, shinyId)),
  mountGoldenTrophy: (shinyId) => run((db, uid) => core.mountGoldenTrophy(db, uid, shinyId)),
  setAutoFishing: (value) => run((db, uid) => loadout.setAutoFishing(db, uid, value)),
  setShowWaitTimer: (value) => run((db, uid) => loadout.setShowWaitTimer(db, uid, value)),
  claimFishingLevelRewards: () => run((db, uid) => core.claimFishingLevelRewards(db, uid)),
  // The chart re-renders from the save itself here, so `quiet` has nothing to skip.
  equipBoat: (boatId) => run((db, uid) => loadout.equipBoat(db, uid, boatId)),
  buyBoat: (boatId) => run((db, uid) => loadout.buyBoat(db, uid, boatId)),
  equipHat: (hatId) => run((db, uid) => loadout.equipHat(db, uid, hatId)),
  buyHat: (hatId) => run((db, uid) => loadout.buyHat(db, uid, hatId)),
  equipPet: (petId, slot = 'stern') => run((db, uid) => loadout.equipPet(db, uid, petId, slot)),
  equipSpecialItem: (itemId) => run((db, uid) => loadout.equipSpecialItem(db, uid, itemId)),
  buySpecialItem: (itemId) => run((db, uid) => loadout.buySpecialItem(db, uid, itemId)),
  setCompletionistEffects: (tiers) => run((db, uid) => loadout.setCompletionistEffects(db, uid, tiers)),
}

export const api: GameApi = { fishing }
