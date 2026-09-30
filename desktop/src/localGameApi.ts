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

import type { GameApi, FishingApi, SellingApi, CrewApi, VoyagesApi, GauntletApi, CasinoApi, RaidsApi, ShipApi, DailiesApi, ParlorApi, ChartRoomApi, SeaApi, HarbourApi, ProgressApi, OnlineApi } from '../../web/lib/gameApi/index'
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
import * as progressCore from '@/lib/core/progress'
import * as homesteadCore from '@/lib/core/homestead'
import * as profileCore from '@/lib/core/profile'
import { localProgressData } from '@/lib/data/local/progressLocal'
import { isPremiumActive } from '@/lib/premium'
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
import { syncAchievements, setActivity } from './steam'
import { seaMapProps, raidSeatsFor, type SeaPageQuery } from '@/lib/core/seaPage'
import { marketPageProps as shapeMarket } from '@/lib/core/marketPage'
import { currentMarket } from '@/lib/data/local/sellLocal'
import { parlorLobbyProps as shapeParlorLobby } from '@/lib/core/lobbies'
import { fishArtPoolFrom } from '@/lib/blackjackFishArtPool'
import { gauntletPageProps as shapeGauntlet } from '@/lib/core/gauntletPage'
import { getRaidPlayerStatsVia } from '@/lib/raidLoadout'
import { badgesPage } from '@/lib/core/badgesPage'
import { localCaptain } from '@/lib/data/local/save'
import { buildClearedSetVia } from '@/lib/raidCleared'
import { loadDeployedPartyVia } from '@/lib/crewData'
import type { CachedSpecies } from '@/lib/fishSpecies'

// Every type the web's Game API exports, so a screen that imports one from
// `@/lib/gameApi` gets the same one here (this file's own `api` is the value).
export type * from '../../web/lib/gameApi/index'

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
  // Every autosave also tells Steam about any badge it has not heard of yet
  // (./steam); the first one catches up everything already earned.
  const watched: SaveStorage = { read: () => storage.read(), write: async (text) => { await storage.write(text); syncAchievements(save) } }
  session = { save, storage: watched, carried: loaded?.carried ?? {} }
  syncAchievements(save)
  setActivity('menu')
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
  castLine: (baitType, habitat, at) => (setActivity('fishing', habitat), run((db, uid) => core.castLine(db, uid, baitType, habitat, at))),
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
  claimZoneReward: (zone) => run((db, uid) => core.claimZoneReward(db, uid, zone)),
  prestigeZone: (zone) => run((db, uid) => core.prestigeZone(db, uid, zone)),
  releaseAncient: (fishId) => run((db, uid) => core.releaseAncient(db, uid, fishId)),
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
  startGauntletRun: (hardcore, terms, variant) => (setActivity('gauntlet'), runGauntlet((db, uid) => gauntletCore.startGauntletRun(db, uid, hardcore, terms, variant))),
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
  getCasinoState: () => (setActivity('den'), runDen((db, uid) => casinoCore.getCasinoState(db, uid))),
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
  startRaidRun: (raidId) => (setActivity('raid'), runRaid((db, uid) => raidCore.startRaidRun(db, uid, raidId))),
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

/** The same, over progression's store. */
async function runProgress<T>(fn: (db: ReturnType<typeof localProgressData>, uid: string) => Promise<T>): Promise<T> {
  const { save, storage, carried } = need()
  const r = await fn(localProgressData(save), save.uid)
  await writeSave(storage, save, carried)
  return r
}

const progressApi: ProgressApi = {
  getRenownState: (skill) => runProgress((db, uid) => progressCore.getRenownState(db, uid, skill)),
  markRenownIntroSeen: (skill) => runProgress((db, uid) => progressCore.markRenownIntroSeen(db, uid, skill)),
  allocateRenown: (skill, stat) => runProgress((db, uid) => progressCore.allocateRenown(db, uid, skill, stat)),
  commitRenown: (skill, delta) => runProgress((db, uid) => progressCore.commitRenown(db, uid, skill, delta)),
  respecRenown: (skill) => runProgress((db, uid) => progressCore.respecRenown(db, uid, skill)),
  buyRenownRespec: (skill) => runProgress((db, uid) => progressCore.buyRenownRespec(db, uid, skill)),
  reconcileBadges: () => runProgress((db, uid) => progressCore.reconcileBadges(db, uid)),
  claimBadgeReward: (id) => runProgress((db, uid) => progressCore.claimBadgeReward(db, uid, id)),
  claimAllBadgeRewards: () => runProgress((db, uid) => progressCore.claimAllBadgeRewards(db, uid)),
  getUnlockedBadges: () => runProgress((db, uid) => progressCore.getUnlockedBadges(db, uid)),
  unlockBadge: (id) => runProgress((db, uid) => progressCore.unlockBadge(db, uid, id)),
  equipBadge: (id, slot) => runProgress((db, uid) => progressCore.equipBadge(db, uid, id, slot)),
  unequipBadge: (slot) => runProgress((db, uid) => progressCore.unequipBadge(db, uid, slot)),
  checkUnlocks: () => runProgress((db, uid) => progressCore.checkUnlocks(db, uid)),
  markSetupSeen: () => runProgress((db, uid) => progressCore.markSetupSeen(db, uid)),
  claimWelcomePack: () => runProgress((db, uid) => progressCore.claimWelcomePack(db, uid)),
  getHomestead: () => runProgress((db, uid) => homesteadCore.getHomestead(db, uid)),
  build: () => runProgress((db, uid) => homesteadCore.build(db, uid)),
  renameHomestead: (name) => runProgress((db, uid) => homesteadCore.renameHomestead(db, uid, name)),
  furnish: (id) => runProgress((db, uid) => homesteadCore.furnish(db, uid, id)),
  pinBadges: (ids) => runProgress((db, uid) => homesteadCore.pinBadges(db, uid, ids)),
  updateUsername: (name) => runProgress((db, uid) => profileCore.updateUsername(db, uid, name)),
  checkUsername: (name) => runProgress((db) => profileCore.checkUsername(db, name)),
  updateShowcaseCrew: (ids) => runProgress((db, uid) => profileCore.updateShowcaseCrew(db, uid, ids)),
  purchaseCharacterColor: (id) => runProgress((db, uid) => profileCore.purchaseCharacterColor(db, uid, id)),
  updateCharacterColor: (id) => runProgress((db, uid) => profileCore.updateCharacterColor(db, uid, id)),
  persistEarnedSkins: (ids) => runProgress((db, uid) => profileCore.persistEarnedSkins(db, uid, ids)),
  persistEarnedBoats: (ids) => runProgress((db, uid) => profileCore.persistEarnedBoats(db, uid, ids)),
  updateAvatarColors: (input) => runProgress((db, uid) => profileCore.updateAvatarColors(db, uid, input)),
  updateProfileBg: (bg) => runProgress((db, uid) => profileCore.updateProfileBg(db, uid, bg)),
  purchaseAvatarSpecial: (id) => runProgress((db, uid) => profileCore.purchaseAvatarSpecial(db, uid, id)),
  searchUsers: (q) => runProgress((db) => profileCore.searchUsers(db, q)),
}

// ── THE ONLINE-ONLY CALLS, ANSWERED HONESTLY ──
// Nobody else sails this sea and there is no checkout in the game, so each of
// these says so (or reads the save) rather than failing.
const ONLINE_ONLY = 'That needs the internet: it is shared with every other captain.'
const ON_THE_WEBSITE = 'Memberships and gems are bought on seasthebooty.com.'
const onlineApi: OnlineApi = {
  getLeaderboardBoards: async () => ({ error: 'The leaderboards rank every captain, so they need the internet.' }),
  getCrew: async () => [],
  addCrewMember: async () => ({ error: ONLINE_ONLY }),
  getNewFollowers: async () => [],
  removeCrewMember: async () => ({ error: ONLINE_ONLY }),
  visitableHomesteads: async () => [],
  homesteadOf: async () => null,
  friendsAtSea: async () => [],
  getBoard: async () => ({ moodBias: 0, introSeen: true, open: false, closedReason: 'The Exchange trades with every captain, so it needs the internet.', doubloons: Number(need().save.profile.doubloons ?? 0), indexes: [], bets: [], unseen: 0 }),
  openBet: async () => ({ error: ONLINE_ONLY }),
  markBetsSeen: async () => {},
  sellBet: async () => ({ error: ONLINE_ONLY }),
  markIntroSeen: async () => {},
  createEmbeddedCheckout: async () => ({ error: ON_THE_WEBSITE }),
  createHostedCheckout: async () => ({ error: ON_THE_WEBSITE }),
  checkMembership: async () => ({ isMember: isPremiumActive(need().save.profile as Parameters<typeof isPremiumActive>[0]) }),
  createGemCheckout: async () => ({ error: ON_THE_WEBSITE }),
  createGemHostedCheckout: async () => ({ error: ON_THE_WEBSITE }),
  currentGems: async () => ({ gems: Number(need().save.profile.gems ?? 0) }),
  pingActivity: async () => {},
  claimFoundersChest: async () => ({ error: 'Nothing here.' }),
}

export const api: GameApi = { fishing, selling: sellingApi, crew: crewApi, voyages: voyagesApi, gauntlet: gauntletApi, casino: casinoApi, raids: raidsApi, ship: shipApi, dailies: dailiesApi, parlor: parlorApi, chartRoom: chartRoomApi, sea: seaApi, harbour: harbourApi, progress: progressApi, online: onlineApi }


/**
 * THE SEA CHART'S PROPS, from the save (lib/core/seaPage). The web's /sea page
 * reads the same pieces from Supabase in one batch; here they come from the
 * local stores, and the same builder shapes them, so the chart is handed the
 * same thing on both. Reads only: nothing is written.
 */
export async function seaPageProps(q: SeaPageQuery = {}) {
  const { save } = need()
  const uid = save.uid
  const profile: Row = { ...save.profile, id: uid }
  const sea = localSeaData(save), progress = localProgressData(save)
  const [clearedNodes, party, dealt, discovered, digs, homestead, renown, renownNav, trawlState] = await Promise.all([
    buildClearedSetVia(localRaidData(save), uid, profile),
    loadDeployedPartyVia(localCrewData(save), uid, raidSeatsFor(profile), 'raid'),
    selling.dealtToday(localSellData(save), uid),
    seaCore.getDiscoveries(sea, uid),
    seaCore.getDigState(sea, uid),
    homesteadCore.getHomestead(progress, uid),
    progressCore.getRenownState(progress, uid, 'fishing'),
    progressCore.getRenownState(progress, uid, 'nav'),
    voyageCore.getTrawlState(localVoyageData(save), uid),
  ])
  // The web's species come from its cached catalogue, ordered by rarity.
  const species = save.species
    .map(f => ({
      id: f.id, name: f.name, scientific_name: f.scientific_name ?? null, fun_fact: f.fun_fact ?? null,
      habitat: f.habitat, bite_rarity: f.bite_rarity, sell_value: f.sell_value, catch_difficulty: f.catch_difficulty,
      length_min_in: f.length_min_in, length_max_in: f.length_max_in,
    }) as unknown as CachedSpecies)
    .sort((a, b) => Number(a.bite_rarity) - Number(b.bite_rarity))
  return seaMapProps({
    uid, profile, clearedNodes, species,
    collection: Object.entries(save.collection).map(([id, c]) => ({ fish_id: Number(id), is_golden: c.is_golden })),
    bests: Object.entries(save.bests).map(([id, b]) => ({ fish_id: Number(id), best_length_in: b.len })),
    party,
    bait: Object.entries(save.bait).map(([bait_type, quantity]) => ({ bait_type, quantity })),
    dealt, discovered, digs, homestead, renown, renownNav, trawlState,
    finaleCleared: save.clears.includes('the_sunken_hand'),
    holdCount: Object.values(save.hold).reduce((n, q) => n + q, 0),
    // Offline there is nobody else on the water.
    hasPact: false,
    rodTiers: [...save.rods],
  }, q)
}

/**
 * THE MARKET'S PROPS, from the save (lib/core/marketPage). Offline the market
 * is the captain's own, caught up by the hours that passed (lib/marketRules);
 * it ticks on the hour, so the next change is the hour after the last tick.
 * The Exchange is online only, so no contract is ever running here.
 */
export async function marketPageProps() {
  const { save } = need()
  const market = currentMarket(save)
  const byId = new Map(save.species.map(f => [f.id, f]))
  return shapeMarket({
    profile: save.profile,
    market: Object.entries(market.fish).map(([id, m]) => {
      const f = byId.get(Number(id))
      return {
        fish_id: Number(id), multiplier: m.m, prev_multiplier: m.prev, history: m.history,
        fish_species: f ? { id: f.id, name: f.name, habitat: f.habitat, bite_rarity: f.bite_rarity, sell_value: f.sell_value } : null,
      }
    }),
    inventory: Object.entries(save.hold).filter(([, q]) => q > 0).map(([id, quantity]) => ({ fish_id: Number(id), quantity })),
    state: { mood: market.mood, next_update_at: new Date(market.lastTickAt + 3_600_000).toISOString() },
    collectionIds: Object.keys(save.collection).map(Number),
    openContracts: 0,
  }, clockNow())
}

/** THE PARLOR'S LOBBY, from the save (lib/core/lobbies). This week's attempts
 *  come from the trivia store, keyed by the Pirate King's week as on the web.
 *  Nobody else is on the Parlor's standings offline. */
export async function parlorLobbyProps() {
  const { save } = need()
  const db = localTriviaData(save)
  const now = new Date(clockNow())
  const week = kingWeekStr(now)
  const [board, king, capstan] = await Promise.all([
    db.boardAttempt(save.uid, week), db.ladderAttempt(save.uid, week), db.capstanAttempt(save.uid, week),
  ])
  return shapeParlorLobby({
    profile: save.profile,
    board: board ? { answers: board.answers, doubloons_awarded: Number(board.doubloons_awarded ?? 0) } : null,
    king: king ? { rung: king.rung, status: king.status, doubloons_awarded: Number(king.doubloons_awarded ?? 0) } : null,
    capstan: capstan ? { runs: capstan.runs } : null,
    topParlor: [],
    today: now.toISOString().slice(0, 10),
  })
}

/** Blackjack's card art, from the save's own species (lib/blackjackFishArtPool). */
export function fishArtPool() {
  const { save } = need()
  return fishArtPoolFrom(save.species.map(f => ({ name: f.name, bite_rarity: f.bite_rarity, habitat: f.habitat })))
}

/** THE TACKLE SHOP'S PROPS (lib/core/harbour tackleShopProps, the same
 *  function the web page runs), from the save. */
export async function tackleShopProps() {
  const { save } = need()
  return harbourCore.tackleShopProps(localHarbourData(save), save.uid)
}

/** THE HOMESTEAD'S PROPS (lib/core/homestead homePageProps), from the save.
 *  Offline there is nobody to visit, so it is always the captain's own. */
export async function homePageProps() {
  const { save } = need()
  const p = save.profile
  return homesteadCore.homePageProps({
    homestead: await homesteadCore.getHomestead(localProgressData(save), save.uid),
    own: {
      doubloons: Number(p.doubloons ?? 0),
      unlocked_badges: (p.unlocked_badges as string[] | null) ?? [],
      badge_unlocked_at: (p.badge_unlocked_at as Record<string, string | null> | null) ?? {},
    },
    owner: {
      pets: (p.unlocked_pets as string[] | null) ?? [],
      logged: Object.keys(save.collection).map(Number),
      ancients: ((p.ancient_catches as number[] | null) ?? []).map(Number),
    },
    species: save.species.map(f => ({ id: f.id, name: f.name, habitat: f.habitat, sell_value: f.sell_value })),
    visit: null,
  })
}

/** A GAUNTLET'S PROPS (lib/core/gauntletPage), from the save, or where its
 *  shut door sends the captain. */
export async function gauntletPageProps(variant: 'davy' | 'don') {
  const { save } = need()
  const [stats, daily, leaderboard] = await Promise.all([
    getRaidPlayerStatsVia(localCrewData(save), save.uid),
    gauntletApi.getGauntletDailyState(variant),
    gauntletApi.getGauntletLeaderboard(variant),
  ])
  return shapeGauntlet({ variant, profile: save.profile, stats, daily, leaderboard, throneCleared: save.clears.includes('the_throne') })
}

/** THE BADGES PAGE (lib/core/badgesPage, the same function the web page runs),
 *  from the save. It may grant badges on the way (the reconcile and the
 *  page's self-healing), so it saves after. Global rarity is about other
 *  captains, so offline there is none. */
export async function badgesPageModel() {
  const { save, storage, carried } = need()
  const r = await badgesPage(localProgressData(save), save.uid, [])
  await writeSave(storage, save, carried)
  return r
}

/** THE PROFILE'S PROPS (lib/core/profile profilePageProps), from the save.
 *  The career aggregates are career_stats' three sums, taken from the save's
 *  own records; there is no account, so no email. */
export async function profilePageProps() {
  const { save } = need()
  const byId = new Map(save.species.map(f => [f.id, f]))
  const [crewRoster, achievementPoints] = await Promise.all([
    crewApi.getCrewRoster(), localCaptain(save).achievementPoints(save.uid),
  ])
  return profileCore.profilePageProps({
    email: '',
    profile: save.profile,
    crewRoster,
    collection: Object.entries(save.collection).map(([id, c]) => {
      const f = byId.get(Number(id))
      return { is_golden: c.is_golden, species: f ? { id: f.id, name: f.name, bite_rarity: f.bite_rarity, habitat: f.habitat, sell_value: f.sell_value } : null }
    }),
    species: save.species.map(f => ({ id: f.id, name: f.name })),
    career: {
      fishSold: Number(save.profile.fish_sold_doubloons ?? 0),
      voyageLoot: save.voyages.filter(v => v.status === 'revealed').reduce((n, v) => n + Number(v.total_doubloons ?? 0), 0),
      raidsCompleted: save.raidClears.length,
    },
    achievementPoints,
  })
}
