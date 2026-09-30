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

import type { GameApi, FishingApi, SellingApi, CrewApi, VoyagesApi, GauntletApi, CasinoApi, RaidsApi, ShipApi, DailiesApi, ParlorApi, ChartRoomApi, SeaApi, HarbourApi } from '../../web/lib/gameApi/index'
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
import * as raidCore from '@/lib/core/raids'
import * as mapCore from '@/lib/core/raidMap'
import { localRaidData } from '@/lib/data/local/raidLocal'
import * as shipCore from '@/lib/core/ship'
import { localShipData } from '@/lib/data/local/shipLocal'
import * as bountyCore from '@/lib/core/bounties'
import * as dailyCore from '@/lib/core/dailies'
import { localDailyData } from '@/lib/data/local/dailyLocal'
import * as parlorCore from '@/lib/core/parlor'
import { localTriviaData } from '@/lib/data/local/triviaLocal'
import * as chartCore from '@/lib/core/chartRoom'
import { localChartData } from '@/lib/data/local/chartLocal'
import * as seaCore from '@/lib/core/sea'
import { localSeaData } from '@/lib/data/local/seaLocal'
import * as harbourCore from '@/lib/core/harbour'
import { localHarbourData } from '@/lib/data/local/harbourLocal'
import * as sheetsCore from '@/lib/core/seaSheets'
import { kingWeekStr } from '@/app/(app)/tavern/trivia/constants'
import { clockNow } from '@/lib/clock'
import { localFishingData, type LocalSave } from '@/lib/data/local/fishingLocal'
import { freshCasino, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, PARLOR_PROFILE_DEFAULTS, CHARTING_PROFILE_DEFAULTS, SEA_PROFILE_DEFAULTS } from '@/lib/data/local/save'
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
  RaidsApi, RaidClearTimes, RaidLootResult, RaidRecords, SpoilSide, ShipApi, DailiesApi, BountyBoard, BountyView, ParlorApi, ChartRoomApi, SeaApi, HarbourApi,
} from '../../web/lib/gameApi/index'

const SPECIES = speciesJson as unknown as SpeciesRow[]

/** The session: one captain, one save, one store, and the web tables the
 *  offline game does not model yet, carried untouched so no write loses them. */
let session: { save: LocalSave; storage: SaveStorage; carried: Record<string, Row[]> } | null = null

function starterSave(): LocalSave {
  return {
    uid: 'local-captain',
    profile: {
      ...structuredClone(SHIP_PROFILE_DEFAULTS),
      ...structuredClone(DAILY_PROFILE_DEFAULTS),
      ...structuredClone(PARLOR_PROFILE_DEFAULTS),
      ...structuredClone(CHARTING_PROFILE_DEFAULTS),
      ...structuredClone(SEA_PROFILE_DEFAULTS),
      fishing_xp: XP_TABLE[4], doubloons: 500, gems: 0, rod_tier: 1, hook_tier: 0, line_tier: 0, fish_hold_tier: 1,
      ancient_catches: [], current_perfect_streak: 0, highest_perfect_streak: 0, total_perfects: 0, zone_perfects: {},
      lifetime_species: [], prestige_levels: {}, zone_golden_boost: {}, unlocked_pets: [], unlocked_character_colors: [],
      unlocked_badges: [], equipped_raid_items: [], catch_pending: false, pending_cast: null, pending_reroll: null,
      crew_hall_tier: 1, crew_drill_level: 1, crew_stores_level: 1, crew_next_roll_legendary: false,
    },
    species: SPECIES,
    bait: { worm: 60 }, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0, 1], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {}, deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
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

/** The same, over the raid store. */
async function runRaid<T>(fn: (db: ReturnType<typeof localRaidData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localRaidData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const raidsApi: RaidsApi = {
  startRaidRun: (raidId) => runRaid((db, uid) => raidCore.startRaidRun(db, uid, raidId)),
  awardRaidKill: (round, token) => runRaid((db, uid) => raidCore.awardRaidKill(db, uid, round, token)),
  recordRaidClear: (raidId, ms, token) => runRaid((db, uid) => raidCore.recordRaidClear(db, uid, raidId, ms, token)),
  recordSkirmishClear: () => runRaid((db, uid) => raidCore.recordSkirmishClear(db, uid)),
  recordRaidHit: (dmg) => runRaid((db, uid) => raidCore.recordRaidHit(db, uid, dmg)),
  claimRaidLoot: (base, token) => runRaid((db, uid) => raidCore.claimRaidLoot(db, uid, base, token)),
  getRaidMapView: () => runRaid((db, uid) => mapCore.getRaidMapView(db, uid)),
  markChapterUnlockSeen: (id) => runRaid((db, uid) => mapCore.markChapterUnlockSeen(db, uid, id)),
  claimMilestoneNode: (id) => runRaid((db, uid) => mapCore.claimMilestoneNode(db, uid, id)),
  markStoryNodeRead: (id) => runRaid((db, uid) => mapCore.markStoryNodeRead(db, uid, id)),
  solvePuzzleNode: (id) => runRaid((db, uid) => mapCore.solvePuzzleNode(db, uid, id)),
  claimQuartermasterChoice: (id, item) => runRaid((db, uid) => mapCore.claimQuartermasterChoice(db, uid, id, item)),
  standForMuster: (id) => runRaid((db, uid) => mapCore.standForMuster(db, uid, id)),
  pickRaidEventChoice: (id, choice) => runRaid((db, uid) => mapCore.pickRaidEventChoice(db, uid, id, choice)),
  pickForkRoute: (id, route) => runRaid((db, uid) => mapCore.pickForkRoute(db, uid, id, route)),
  rollDiceNode: (id, option) => runRaid((db, uid) => mapCore.rollDiceNode(db, uid, id, option)),
  getDpsCheckPreview: (id) => runRaid((db, uid) => mapCore.getDpsCheckPreview(db, uid, id)),
  resolveDpsCheck: (id, action) => runRaid((db, uid) => mapCore.resolveDpsCheck(db, uid, id, action)),
  claimScoutDebt: (id) => runRaid((db, uid) => mapCore.claimScoutDebt(db, uid, id)),
  pickShipClass: (id, cls) => runRaid((db, uid) => mapCore.pickShipClass(db, uid, id, cls)),
  refitShipClasses: (next) => runRaid((db, uid) => mapCore.refitShipClasses(db, uid, next)),
  chooseSpoil: (side) => runRaid((db, uid) => mapCore.chooseSpoil(db, uid, side)),
  buySpoil: (side) => runRaid((db, uid) => mapCore.buySpoil(db, uid, side)),
  equipSecondSpecial: (item) => runRaid((db, uid) => mapCore.equipSecondSpecial(db, uid, item)),
  buyRepairKit: () => runRaid((db, uid) => raidCore.buyRepairKit(db, uid)),
  getCheckTutorialSeen: () => runRaid((db, uid) => raidCore.getCheckTutorialSeen(db, uid)),
  markCheckTutorialSeen: () => runRaid((db, uid) => raidCore.markCheckTutorialSeen(db, uid)),
  getSkirmishTourSeen: () => runRaid((db, uid) => raidCore.getSkirmishTourSeen(db, uid)),
  markSkirmishTourSeen: () => runRaid((db, uid) => raidCore.markSkirmishTourSeen(db, uid)),
  markRaidTutorialSeen: () => runRaid((db, uid) => raidCore.markRaidTutorialSeen(db, uid)),
}

/** The same, over the ship's store. */
async function runShip<T>(fn: (db: ReturnType<typeof localShipData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localShipData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const shipApi: ShipApi = {
  saveEquippedRaidItems: (ids) => runShip((db, uid) => shipCore.saveEquippedRaidItems(db, uid, ids)),
  forgeRaidItem: (id) => runShip((db, uid) => shipCore.forgeRaidItem(db, uid, id)),
  learnForgeRecipe: (id) => runShip((db, uid) => shipCore.learnForgeRecipe(db, uid, id)),
  startAbyssalConversion: (id) => runShip((db, uid) => shipCore.startAbyssalConversion(db, uid, id)),
  claimAbyssalConversion: () => runShip((db, uid) => shipCore.claimAbyssalConversion(db, uid)),
  markForgeIntroSeen: () => runShip((db, uid) => shipCore.markForgeIntroSeen(db, uid)),
  equipShipSkin: (id) => runShip((db, uid) => shipCore.equipShipSkin(db, uid, id)),
  getUltimateState: () => runShip((db, uid) => shipCore.getUltimateState(db, uid)),
  startUltimateBuild: (id) => runShip((db, uid) => shipCore.startUltimateBuild(db, uid, id)),
  swapUltimateBuild: (id) => runShip((db, uid) => shipCore.swapUltimateBuild(db, uid, id)),
  startUltimateRetool: (id) => runShip((db, uid) => shipCore.startUltimateRetool(db, uid, id)),
  buyUltimateSchematics: () => runShip((db, uid) => shipCore.buyUltimateSchematics(db, uid)),
  switchUltimate: (id) => runShip((db, uid) => shipCore.switchUltimate(db, uid, id)),
  buySixthBerth: () => runShip((db, uid) => shipCore.buySixthBerth(db, uid)),
  buyArmoryExpansion: () => runShip((db, uid) => shipCore.buyArmoryExpansion(db, uid)),
  markUltimateUnlockSeen: () => runShip((db, uid) => shipCore.markUltimateUnlockSeen(db, uid)),
  markShipGuideSeen: () => runShip((db, uid) => shipCore.markShipGuideSeen(db, uid)),
  buyHullTier: () => runShip((db, uid) => shipCore.buyShipyardTier(db, uid, 'hull_speed_tier')),
  buyHandlingTier: () => runShip((db, uid) => shipCore.buyShipyardTier(db, uid, 'hull_handling_tier')),
  buyLanternTier: () => runShip((db, uid) => shipCore.buyShipyardTier(db, uid, 'lantern_tier')),
  buyAccelTier: () => runShip((db, uid) => shipCore.buyShipyardTier(db, uid, 'hull_accel_tier')),
  equipRod: (tier) => runShip((db, uid) => shipCore.equipRod(db, uid, tier)),
}

/** The same, over the daily loop's store. Offline every letter is the
 *  captain's own, so the account's join time is not needed. */
async function runDaily<T>(fn: (db: ReturnType<typeof localDailyData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localDailyData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}
const NO_JOIN = new Date(0).toISOString()

const dailiesApi: DailiesApi = {
  getBountyBoard: () => runDaily((db, uid) => bountyCore.getBountyBoard(db, uid)),
  claimBounty: (id) => runDaily((db, uid) => bountyCore.claimBounty(db, uid, id)),
  claimBountyMilestone: () => runDaily((db, uid) => bountyCore.claimBountyMilestone(db, uid)),
  rerollBounty: (id) => runDaily((db, uid) => bountyCore.rerollBounty(db, uid, id)),
  markBountyRungSeen: (chapter) => runDaily((db, uid) => bountyCore.markBountyRungSeen(db, uid, chapter)),
  getDailyChallenge: () => runDaily((db, uid) => dailyCore.getDailyChallenge(db, uid)),
  claimDailyReward: (index) => runDaily((db, uid) => dailyCore.claimDailyReward(db, uid, index)),
  claimDailySweep: () => runDaily((db, uid) => dailyCore.claimDailySweep(db, uid)),
  claimDailyBonus: () => runDaily((db, uid) => dailyCore.claimDailyBonus(db, uid)),
  claimDailyBait: () => runDaily((db, uid) => dailyCore.claimDailyBait(db, uid)),
  claimWeeklyCrate: () => runDaily((db, uid) => dailyCore.claimWeeklyCrate(db, uid)),
  bonusState: () => runDaily((db, uid) => dailyCore.bonusState(db, uid)),
  getInbox: () => runDaily((db, uid) => dailyCore.getInbox(db, uid, NO_JOIN)),
  getMailUnreadCount: () => runDaily((db, uid) => dailyCore.getMailUnreadCount(db, uid, NO_JOIN)),
  markMailRead: (id) => runDaily((db, uid) => dailyCore.markMailRead(db, uid, id)),
  markAllMailRead: () => runDaily((db, uid) => dailyCore.markAllMailRead(db, uid, NO_JOIN)),
  claimMailAttachment: (id) => runDaily((db, uid) => dailyCore.claimMailAttachment(db, uid, id)),
  markContestsSeen: () => runDaily((db, uid) => dailyCore.markContestsSeen(db, uid)),
  getContestsView: () => runDaily((db, uid) => dailyCore.getContestsView(db, uid)),
}

/** The same, over the Parlor's store (the week's questions from the bank). */
async function runParlor<T>(fn: (db: ReturnType<typeof localTriviaData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localTriviaData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const parlorApi: ParlorApi = {
  claimParlorRank: () => runParlor((db, uid) => parlorCore.claimParlorRank(db, uid)),
  markParlorGuideSeen: () => runParlor((db, uid) => parlorCore.markParlorGuideSeen(db, uid)),
  getCaptainsBoardState: () => runParlor((db, uid) => parlorCore.getCaptainsBoardState(db, uid)),
  playCaptainsCard: (key) => runParlor((db, uid) => parlorCore.playCaptainsCard(db, uid, key)),
  answerCaptainsTile: (key, i) => runParlor((db, uid) => parlorCore.answerCaptainsTile(db, uid, key, i)),
  getCapstanState: () => runParlor((db, uid) => parlorCore.getCapstanState(db, uid)),
  spinCapstan: (i) => runParlor((db, uid) => parlorCore.spinCapstan(db, uid, i)),
  callConsonant: (i, l) => runParlor((db, uid) => parlorCore.callConsonant(db, uid, i, l)),
  buyVowel: (i, l) => runParlor((db, uid) => parlorCore.buyVowel(db, uid, i, l)),
  solveCapstan: (i, g) => runParlor((db, uid) => parlorCore.solveCapstan(db, uid, i, g)),
  getPirateKingState: () => runParlor((db, uid) => parlorCore.getPirateKingState(db, uid)),
  startKingRung: () => runParlor((db, uid) => parlorCore.startKingRung(db, uid)),
  answerKingRung: (rung, i) => runParlor((db, uid) => parlorCore.answerKingRung(db, uid, rung, i)),
  spendKingFiftyFifty: () => runParlor((db, uid) => parlorCore.spendKingFiftyFifty(db, uid)),
  walkKingAway: () => runParlor((db, uid) => parlorCore.walkKingAway(db, uid)),
}

/** The same, over the Chart Room's store (the week's boards are the save's own). */
async function runChart<T>(fn: (db: ReturnType<typeof localChartData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localChartData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const chartRoomApi: ChartRoomApi = {
  markChartingGuideSeen: () => runChart((db, uid) => chartCore.markChartingGuideSeen(db, uid)),
  getMatchState: () => runChart((db, uid) => chartCore.getMatchState(db, uid)),
  submitMatch: (moves) => runChart((db, uid) => chartCore.submitMatch(db, uid, moves)),
  getMinefieldState: () => runChart((db, uid) => chartCore.getMinefieldState(db, uid)),
  revealCell: (i) => runChart((db, uid) => chartCore.revealCell(db, uid, i)),
  toggleFlag: (i) => runChart((db, uid) => chartCore.toggleFlag(db, uid, i)),
  getHoldState: () => runChart((db, uid) => chartCore.getHoldState(db, uid)),
  saveHoldProgress: (d, e, n) => runChart((db, uid) => chartCore.saveHoldProgress(db, uid, d, e, n)),
  tallyHold: (d, e) => runChart((db, uid) => chartCore.tallyHold(db, uid, d, e)),
  submitHold: (d, e) => runChart((db, uid) => chartCore.submitHold(db, uid, d, e)),
  getRiggingState: () => runChart((db, uid) => chartCore.getRiggingState(db, uid)),
  saveRiggingPaths: (p) => runChart((db, uid) => chartCore.saveRiggingPaths(db, uid, p)),
  submitRigging: (p) => runChart((db, uid) => chartCore.submitRigging(db, uid, p)),
  getWorldChartState: () => runChart((db, uid) => chartCore.getWorldChartState(db, uid)),
  claimLandmark: (id) => runChart((db, uid) => chartCore.claimLandmark(db, uid, id)),
}

/** The same, over the sea's store. */
async function runSeaOwn<T>(fn: (db: ReturnType<typeof localSeaData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localSeaData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const seaApi: SeaApi = {
  folkState: () => runSeaOwn((db, uid) => seaCore.folkState(db, uid)),
  talkToFolk: (id) => runSeaOwn((db, uid) => seaCore.talkToFolk(db, uid, id)),
  askForFavourite: (id) => runSeaOwn((db, uid) => seaCore.askForFavourite(db, uid, id)),
  deliverToFolk: (id) => runSeaOwn((db, uid) => seaCore.deliverToFolk(db, uid, id)),
  buyFolkRod: (id) => runSeaOwn((db, uid) => seaCore.buyFolkRod(db, uid, id)),
  finnState: () => runSeaOwn((db, uid) => seaCore.finnState(db, uid)),
  turnInFinnQuest: () => runSeaOwn((db, uid) => seaCore.turnInFinnQuest(db, uid)),
  speakToFinn: (at) => runSeaOwn((db, uid) => seaCore.speakToFinn(db, uid, at)),
  markFinnRevealSeen: () => runSeaOwn((db, uid) => seaCore.markFinnRevealSeen(db, uid)),
  getDigState: () => runSeaOwn((db, uid) => seaCore.getDigState(db, uid)),
  openBottle: (key) => runSeaOwn((db, uid) => seaCore.openBottle(db, uid, key)),
  digHere: (id) => runSeaOwn((db, uid) => seaCore.digHere(db, uid, id)),
  getDiscoveries: () => runSeaOwn((db, uid) => seaCore.getDiscoveries(db, uid)),
  goAshore: (id) => runSeaOwn((db, uid) => seaCore.goAshore(db, uid, id)),
  buyPortalTier: () => runSeaOwn((db, uid) => seaCore.buyPortalTier(db, uid)),
  spendRecall: (side) => runSeaOwn((db, uid) => seaCore.spendRecall(db, uid, side)),
  smugglerStanding: () => runSeaOwn((db, uid) => seaCore.smugglerStanding(db, uid)),
  // ── The tours ──
  skipTutorials: () => runSeaOwn((db, uid) => sheetsCore.skipTutorials(db, uid)),
  markSeaTourSeen: () => runSeaOwn((db, uid) => sheetsCore.markSeaTourSeen(db, uid)),
  setSeaTourStep: async (step) => { await runSeaOwn((db, uid) => sheetsCore.setSeaTourStep(db, uid, step)) },
  getSeaTourStep: () => runSeaOwn((db, uid) => sheetsCore.getSeaTourStep(db, uid)),
  markSeaHintSeen: (port) => runSeaOwn((db, uid) => sheetsCore.markSeaHintSeen(db, uid, port)),
  markGateTourSeen: () => runSeaOwn((db, uid) => sheetsCore.markGateTourSeen(db, uid)),
  setGateTourStep: (step) => runSeaOwn((db, uid) => sheetsCore.setGateTourStep(db, uid, step)),
  // ── The sheets and the boards ──
  loadoutGear: () => runSeaOwn((db, uid) => sheetsCore.loadoutGear(db, uid)),
  raidSheetState: () => runSeaOwn((db, uid) => sheetsCore.raidSheetState(db, uid)),
  nodeSheet: () => runSeaOwn((db, uid) => sheetsCore.nodeSheet(db, uid)),
  bossCardState: () => runSeaOwn((db, uid) => sheetsCore.bossCardState(db, uid)),
  // The Day board reads each system through this same API, as the web's reads
  // each system through its own action.
  dayState: () => runSeaOwn((db, uid) => {
    const save = need().save
    const week = kingWeekStr(new Date(clockNow()))
    return sheetsCore.dayState(db, uid, {
      profile: async () => structuredClone(save.profile),
      orders: () => dailiesApi.getDailyChallenge(),
      voyage: () => voyagesApi.getDailyVoyageState() as never,
      trawls: () => voyagesApi.getTrawlState() as never,
      bounties: () => dailiesApi.getBountyBoard(),
      hold: () => chartRoomApi.getHoldState(),
      match: () => chartRoomApi.getMatchState(),
      minefield: () => chartRoomApi.getMinefieldState(),
      rigging: () => chartRoomApi.getRiggingState(),
      parlorWeek: async () => ({ answers: save.trivia.board[week]?.answers ?? {}, ladderStatus: save.trivia.ladder[week]?.status }),
      haul: () => dailiesApi.bonusState(),
      recruits: () => crewApi.todaysRecruits(),
    })
  }),
  // The arrival read: the same readers the web's seaBoot runs at once. Nobody
  // else is on this sea, so no pacts and no one's homestead to visit.
  seaBoot: async () => {
    const safe = async <T,>(f: () => Promise<T>): Promise<T | null> => { try { return await f() } catch { return null } }
    const [golden, finn, folk, orders, day] = await Promise.all([
      safe(() => fishing.heldGolden()), safe(() => seaApi.finnState()), safe(() => seaApi.folkState()),
      safe(() => dailiesApi.getDailyChallenge()), safe(() => seaApi.dayState()),
    ])
    return { golden, finn, folk, orders, pacts: 0, guests: [], day }
  },
  // ── Pacts: between players, so offline there is nobody to sail with ──
  pactState: async () => ({ youCanSail: false, sailing: [], asking: [], asked: [], couldAsk: [] }),
  requestPact: async () => ({ ok: false, error: 'Nobody else sails this sea.' }),
  acceptPact: async () => ({ ok: false, error: 'Nobody else sails this sea.' }),
  endPact: async () => ({ ok: false }),
  endPactWith: async () => ({ ok: false }),
  hasAcceptedPact: async () => false,
  pendingPacts: async () => 0,
}

/** The same, over the harbour's store. */
async function runHarbour<T>(fn: (db: ReturnType<typeof localHarbourData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localHarbourData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const harbourApi: HarbourApi = {
  buyBait: (type, qty) => runHarbour((db, uid) => harbourCore.buyBait(db, uid, type, qty)),
  purchaseRod: (tier) => runHarbour((db, uid) => harbourCore.purchaseRod(db, uid, tier)),
  sellRod: (tier) => runHarbour((db, uid) => harbourCore.sellRod(db, uid, tier)),
  claimCompletionistRod: () => runHarbour((db, uid) => harbourCore.claimCompletionistRod(db, uid)),
  equipTackleRod: (tier) => runHarbour((db, uid) => harbourCore.equipTackleRod(db, uid, tier)),
  buyReel: () => runHarbour((db, uid) => harbourCore.buyReel(db, uid)),
  buyHook: () => runHarbour((db, uid) => harbourCore.buyHook(db, uid)),
  upgradeFishHold: () => runHarbour((db, uid) => harbourCore.upgradeFishHold(db, uid)),
  holdContents: () => runHarbour((db, uid) => harbourCore.holdContents(db, uid)),
  buyShip: () => runHarbour((db, uid) => harbourCore.buyShip(db, uid)),
  renameShip: (name) => runHarbour((db, uid) => harbourCore.renameShip(db, uid, name)),
  shipyardState: () => runHarbour((db, uid) => harbourCore.shipyardState(db, uid)),
  getShipHeroProps: () => runHarbour(async (db, uid) => harbourCore.shipHeroProps(db, await harbourCore.shipHeroPieces(db, uid))),
  getAlmanacData: () => runHarbour((db, uid) => harbourCore.getAlmanacData(db, uid)),
  markAlmanacViewed: () => runHarbour((db, uid) => harbourCore.markAlmanacViewed(db, uid)),
}

export const api: GameApi = { fishing, selling: sellingApi, crew: crewApi, voyages: voyagesApi, gauntlet: gauntletApi, casino: casinoApi, raids: raidsApi, ship: shipApi, dailies: dailiesApi, parlor: parlorApi, chartRoom: chartRoomApi, sea: seaApi, harbour: harbourApi }
