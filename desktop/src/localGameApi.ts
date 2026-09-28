// THE GAME API, OFFLINE (Steam prep, step 8 spike, stage 3).
//
// The website's lib/gameApi calls server actions. In the shell, Vite resolves
// `@/lib/gameApi` to THIS file instead, and the same calls are answered by the
// real fishing core (lib/core/fishing) running against the local save. The
// interface is the website's own FishingApi, so the two cannot drift.
//
// Only the cast and the reel run offline so far (the spike's scope); everything
// else answers "not offline yet" rather than pretending.

import type { GameApi, FishingApi } from '../../web/lib/gameApi/index'
import { castLine, reelIn } from '@/lib/core/fishing'
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
// Autosave after anything that changed the game.
async function persist() { if (session) await writeSave(session.storage, session.save) }

const notYet = (async () => ({ error: 'Not available offline yet.' })) as never

const fishing: FishingApi = {
  castLine: (async (baitType: string, habitat: string, at?: { x: number; y: number }) => {
    const { db, save } = need()
    const r = await castLine(db, save.uid, baitType, habitat, at)
    await persist()
    return r
  }) as FishingApi['castLine'],
  reelIn: (async (fishId: number, result: 'perfect' | 'catch' | 'miss' | 'penalty', baitType: string, doubleCatch = false, streak = 0, jackpot = 1) => {
    const { db, save } = need()
    const r = await reelIn(db, save.uid, fishId, result, baitType, doubleCatch, streak, jackpot)
    await persist()
    return r
  }) as FishingApi['reelIn'],
  reelCrate: notYet, tideTurnerSkip: notYet, rerollWormhole: notYet,
  heldGolden: (async () => null) as FishingApi['heldGolden'],
  sellGoldenTrophy: notYet, mountGoldenTrophy: notYet,
  setAutoFishing: (async () => {}) as FishingApi['setAutoFishing'],
  setShowWaitTimer: (async () => {}) as FishingApi['setShowWaitTimer'],
  claimFishingLevelRewards: notYet,
  equipBoat: notYet, buyBoat: notYet, equipHat: notYet, buyHat: notYet, equipPet: notYet,
  equipSpecialItem: notYet, buySpecialItem: notYet, setCompletionistEffects: notYet,
}

export const api: GameApi = { fishing }
