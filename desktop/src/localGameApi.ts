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
// on this API yet. Selling runs offline too (lib/core/selling), with the
// captain's own market caught up from the clock.

import type { GameApi, FishingApi, SellingApi, CrewApi, VoyagesApi, GauntletApi, CasinoApi } from '../../web/lib/gameApi/index'
import * as core from '@/lib/core/fishing'
import * as loadout from '@/lib/core/loadout'
import * as selling from '@/lib/core/selling'
import { localSellData } from '@/lib/data/local/sellLocal'
import * as crewCore from '@/lib/core/crew'
import { localCrewData } from '@/lib/data/local/crewLocal'
import * as voyageCore from '@/lib/core/voyages'
import { localVoyageData } from '@/lib/data/local/voyageLocal'
import * as gauntletCore from '@/lib/core/gauntlet'
import { localGauntletData } from '@/lib/data/local/gauntletLocal'
import * as casinoCore from '@/lib/core/casino'
import { localCasinoData } from '@/lib/data/local/casinoLocal'
import { localFishingData, type LocalSave } from '@/lib/data/local/fishingLocal'
import { freshCasino } from '@/lib/data/local/save'
import { loadSave, writeSave, type SaveStorage } from '@/lib/data/local/saveFile'
import type { Row } from '@/lib/data/common'
import { installRng, mulberry32, seedOf } from '@/lib/rng'
import type { SpeciesRow } from '@/lib/data/fishingData'
import speciesJson from '@/content/fish_species.json'
import { XP_TABLE } from '@/lib/fishingLevel'

export type {
  FishSpecies, WaitingFolk, FishingApi, SellingApi, PendingSale, DealResult,
  CrewApi, CrewState, CrewMember, BoardCandidate, CrewActionResult, FallenCrew, RecruitFace, BunkClaimResult,
  VoyagesApi, DailyVoyage, VoyageBoard, CrewHubState, HubCrew, GauntletApi, CasinoApi,
} from '../../web/lib/gameApi/index'

const SPECIES = speciesJson as unknown as SpeciesRow[]

/** The session: one captain, one save, one store, and the web tables the
 *  offline game does not model yet, carried untouched so no write loses them. */
let session: { save: LocalSave; storage: SaveStorage; carried: Record<string, Row[]> } | null = null

function starterSave(): LocalSave {
  return {
    uid: 'local-captain',
    profile: {
      fishing_xp: XP_TABLE[4], doubloons: 500, gems: 0, rod_tier: 1, hook_tier: 0, line_tier: 0, fish_hold_tier: 1,
      ancient_catches: [], current_perfect_streak: 0, highest_perfect_streak: 0, total_perfects: 0, zone_perfects: {},
      lifetime_species: [], prestige_levels: {}, zone_golden_boost: {}, unlocked_pets: [], unlocked_character_colors: [],
      unlocked_badges: [], equipped_raid_items: [], catch_pending: false, pending_cast: null, pending_reroll: null,
      crew_hall_tier: 1, crew_drill_level: 1, crew_stores_level: 1, crew_next_roll_legendary: false,
    },
    species: SPECIES,
    bait: { worm: 60 }, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0, 1], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {}, deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(),
  }
}

/** Open (or start) the captain's save. The save's own seed drives every roll. */
export async function openSave(storage: SaveStorage): Promise<LocalSave> {
  const loaded = await loadSave(storage, SPECIES)
  const save = loaded?.save ?? starterSave()
  session = { save, storage, carried: loaded?.carried ?? {} }
  installRng(mulberry32(seedOf(`${save.uid}:${Date.now()}`)))
  if (!loaded) await writeSave(storage, save)
  return save
}

export function currentSave(): LocalSave | null { return session?.save ?? null }

function need() {
  if (!session) throw new Error('no save open')
  return { db: localFishingData(session.save), save: session.save, storage: session.storage, carried: session.carried }
}
/** Run one call against the save, then autosave: anything may have changed the game. */
async function run<T>(fn: (db: ReturnType<typeof need>['db'], uid: string) => Promise<T>): Promise<T> {
  const { db, save, storage, carried } = need()
  const r = await fn(db, save.uid)
  await writeSave(storage, save, carried)
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

/** The same, over the selling store. */
async function runSell<T>(fn: (db: ReturnType<typeof localSellData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localSellData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const sellingApi: SellingApi = {
  // Nothing is ever owed from the web's retired delayed lane offline.
  getPendingSales: () => runSell(async (db, uid) => ({ ...(await selling.pendingSales(db, uid)), justSettled: 0 })),
  sellEntireHold: () => runSell((db, uid) => selling.sellEntireHold(db, uid)),
  marketSellFish: (fishId, quantity) => runSell((db, uid) => selling.marketSellFish(db, uid, fishId, quantity)),
  dealtToday: () => runSell((db, uid) => selling.dealtToday(db, uid)),
  strikeDeal: (key) => runSell((db, uid) => selling.strikeDeal(db, uid, key)),
  sellToResident: (zoneId) => runSell((db, uid) => selling.sellToResident(db, uid, zoneId)),
  wagerForRunnerRod: (key) => runSell((db, uid) => selling.wagerForRunnerRod(db, uid, key)),
  runnerRodOwned: (tier) => runSell((db, uid) => selling.runnerRodOwned(db, uid, tier)),
  saveSeaPosition: (x, y, seen, seenExp, side, helm) => runSell((db, uid) => selling.saveSeaPosition(db, uid, x, y, seen, seenExp, side, helm)),
}

/** The same, over the crew store. */
async function runCrew<T>(fn: (db: ReturnType<typeof localCrewData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localCrewData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const crewApi: CrewApi = {
  getCrewState: () => runCrew((db, uid) => crewCore.getCrewState(db, uid)),
  getCrewRoster: () => runCrew((db, uid) => crewCore.getCrewRoster(db, uid)),
  getCrewGraveyard: () => runCrew((db, uid) => crewCore.getCrewGraveyard(db, uid)),
  todaysRecruits: () => runCrew((db, uid) => crewCore.todaysRecruits(db, uid)),
  rerollBoard: (tier) => runCrew((db, uid) => crewCore.rerollBoard(db, uid, tier)),
  recruitCrew: (id) => runCrew((db, uid) => crewCore.recruitCrew(db, uid, id)),
  gambleBloodSkin: () => runCrew((db, uid) => crewCore.gambleBloodSkin(db, uid)),
  dismissCrew: (id) => runCrew((db, uid) => crewCore.dismissCrew(db, uid, id)),
  assignToVoyage: (id, slot) => runCrew((db, uid) => crewCore.assignToVoyage(db, uid, id, slot)),
  assignToRaid: (id, slot) => runCrew((db, uid) => crewCore.assignToRaid(db, uid, id, slot)),
  clearParty: (track) => runCrew((db, uid) => crewCore.clearParty(db, uid, track)),
  benchCrew: (id) => runCrew((db, uid) => crewCore.benchCrew(db, uid, id)),
  renameCrew: (id, name) => runCrew((db, uid) => crewCore.renameCrew(db, uid, id, name)),
  promoteToCaptain: (id) => runCrew((db, uid) => crewCore.promoteToCaptain(db, uid, id)),
  crewTheDeck: (pull) => runCrew((db, uid) => crewCore.crewTheDeck(db, uid, pull)),
  upgradeCrewHall: () => runCrew((db, uid) => crewCore.upgradeCrewHall(db, uid)),
  bunkCrew: (id, slot, hours) => runCrew((db, uid) => crewCore.bunkCrew(db, uid, id, slot, hours)),
  collectBunk: (id) => runCrew((db, uid) => crewCore.collectBunk(db, uid, id)),
  resolveTraitOffer: (id, accept) => runCrew((db, uid) => crewCore.resolveTraitOffer(db, uid, id, accept)),
  buyDrill: () => runCrew((db, uid) => crewCore.buyHallUpgrade(db, uid, 'drill')),
  buyStores: () => runCrew((db, uid) => crewCore.buyHallUpgrade(db, uid, 'stores')),
  buyCrewSkin: (id) => runCrew((db, uid) => crewCore.buyCrewSkin(db, uid, id)),
  equipCrewSkin: (slug, id) => runCrew((db, uid) => crewCore.equipCrewSkin(db, uid, slug, id)),
  markCrewGuideSeen: () => runCrew((db, uid) => crewCore.markCrewGuideSeen(db, uid)),
}

/** The same, over the voyage-and-trawl store. */
async function runSea<T>(fn: (db: ReturnType<typeof localVoyageData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localVoyageData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const voyagesApi: VoyagesApi = {
  getDailyVoyageState: () => runSea((db, uid) => voyageCore.getDailyVoyageState(db, uid)),
  getTrawlingCrewIds: () => runSea((db, uid) => voyageCore.getTrawlingCrewIds(db, uid)),
  sendDailyVoyage: (route) => runSea((db, uid) => voyageCore.sendDailyVoyage(db, uid, route)),
  // Offline there is no Captain's Log to write, so only the result comes back.
  revealVoyageResults: (id) => runSea(async (db, uid) => (await voyageCore.revealVoyageResults(db, uid, id)).result),
  fetchVoyageCaptainsLog: (id) => runSea((db, uid) => voyageCore.fetchVoyageCaptainsLog(db, uid, id)),
  voyageBoard: () => runSea((db, uid) => voyageCore.voyageBoard(db, uid)),
  getTrawlState: () => runSea((db, uid) => voyageCore.getTrawlState(db, uid)),
  deployTrawl: (zone, crewId) => runSea((db, uid) => voyageCore.deployTrawl(db, uid, zone, crewId)),
  collectTrawl: (zone) => runSea((db, uid) => voyageCore.collectTrawl(db, uid, zone)),
  crewHub: () => runSea((db, uid) => voyageCore.crewHub(db, uid)),
}

/** The same, over the gauntlet store. */
async function runGauntlet<T>(fn: (db: ReturnType<typeof localGauntletData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localGauntletData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const gauntletApi: GauntletApi = {
  getGauntletDailyState: (variant) => runGauntlet((db, uid) => gauntletCore.getGauntletDailyState(db, uid, variant)),
  getGauntletLeaderboard: (variant) => runGauntlet((db, uid) => gauntletCore.getGauntletLeaderboard(db, uid, variant)),
  markGauntletIntroSeen: (variant) => runGauntlet((db, uid) => gauntletCore.markGauntletIntroSeen(db, uid, variant)),
  startGauntletRun: (hardcore, terms, variant) => runGauntlet((db, uid) => gauntletCore.startGauntletRun(db, uid, hardcore, terms, variant)),
  checkpointGauntletRun: (state) => runGauntlet((db, uid) => gauntletCore.checkpointGauntletRun(db, uid, state)),
  pauseGauntletRun: (state) => runGauntlet((db, uid) => gauntletCore.pauseGauntletRun(db, uid, state)),
  resumeGauntletRun: () => runGauntlet((db, uid) => gauntletCore.resumeGauntletRun(db, uid)),
  rollDavyOffer: (hpPct) => runGauntlet((db, uid) => gauntletCore.rollDavyOffer(db, uid, hpPct)),
  recordGauntletHit: (dmg) => runGauntlet((db, uid) => gauntletCore.recordGauntletHit(db, uid, dmg)),
  wagerGauntletFathoms: (stake) => runGauntlet((db, uid) => gauntletCore.wagerGauntletFathoms(db, uid, stake)),
  buyMerchantItem: (id) => runGauntlet((db, uid) => gauntletCore.buyMerchantItem(db, uid, id)),
  markConfluencesSeen: (ids) => runGauntlet((db, uid) => gauntletCore.markConfluencesSeen(db, uid, ids)),
  cashOutGauntlet: (rd, cd, pot, snap, take) => runGauntlet((db, uid) => gauntletCore.cashOutGauntlet(db, uid, rd, cd, pot, snap, take)),
  resolveGauntletDeath: (rd, cd, snap) => runGauntlet((db, uid) => gauntletCore.resolveGauntletDeath(db, uid, rd, cd, snap)),
  getGauntletUpgradeState: (variant) => runGauntlet((db, uid) => gauntletCore.getGauntletUpgradeState(db, uid, variant)),
  claimGauntletUpgrade: (id, variant) => runGauntlet((db, uid) => gauntletCore.claimGauntletUpgrade(db, uid, id, variant)),
  setGauntletUpgradeActive: (id, active, variant) => runGauntlet((db, uid) => gauntletCore.setGauntletUpgradeActive(db, uid, id, active, variant)),
  claimDailyTribute: () => runGauntlet((db, uid) => gauntletCore.claimDailyTribute(db, uid)),
  buyBaitWithFathoms: (type) => runGauntlet((db, uid) => gauntletCore.buyBaitWithFathoms(db, uid, type)),
}

/** The same, over the Den's store. */
async function runDen<T>(fn: (db: ReturnType<typeof localCasinoData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localCasinoData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const casinoApi: CasinoApi = {
  getCasinoState: () => runDen((db, uid) => casinoCore.getCasinoState(db, uid)),
  buyInCasino: (amount) => runDen((db, uid) => casinoCore.buyInCasino(db, uid, amount)),
  cashOutCasino: () => runDen((db, uid) => casinoCore.cashOutCasino(db, uid)),
  markDenGuideSeen: () => runDen((db, uid) => casinoCore.markDenGuideSeen(db, uid)),
  getSlotsJackpot: () => runDen((db) => casinoCore.getSlotsJackpot(db)),
  getSlotStats: () => runDen((db, uid) => casinoCore.getSlotStats(db, uid)),
  spinSlots: (wager) => runDen((db, uid) => casinoCore.spinSlots(db, uid, wager)),
  getRouletteState: () => runDen((db, uid) => casinoCore.getRouletteState(db, uid)),
  placeBetsAndSpin: (bets) => runDen((db, uid) => casinoCore.placeBetsAndSpin(db, uid, bets)),
  getDailyWagered: () => runDen((db, uid) => casinoCore.getDailyWagered(db, uid)),
  dealBlackjack: (wager) => runDen((db, uid) => casinoCore.dealBlackjack(db, uid, wager)),
  acceptInsurance: () => runDen((db, uid) => casinoCore.acceptInsurance(db, uid)),
  declineInsurance: () => runDen((db, uid) => casinoCore.declineInsurance(db, uid)),
  hit: () => runDen((db, uid) => casinoCore.hit(db, uid)),
  stand: () => runDen((db, uid) => casinoCore.stand(db, uid)),
  doubleDown: () => runDen((db, uid) => casinoCore.doubleDown(db, uid)),
  split: () => runDen((db, uid) => casinoCore.split(db, uid)),
  resumeHand: () => runDen((db, uid) => casinoCore.resumeHand(db, uid)),
}

export const api: GameApi = { fishing, selling: sellingApi, crew: crewApi, voyages: voyagesApi, gauntlet: gauntletApi, casino: casinoApi }
