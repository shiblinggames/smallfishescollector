// THE RULES' TABLES, FOR THE GODOT PORT (stage 1, 2026-09-30).
//
// The Godot build ports the rules' LOGIC by hand and reads their TABLES from
// here (godot/game/content/rules.json), so a rod, a bait, a zone rate or a
// crate weight lives in one place: the TypeScript. Where a rule is a pure
// function over a small domain (which colors a fishing level earns, a catch's
// XP by zone and difficulty) its answers are exported as a lookup instead of
// porting the logic. Small scalar constants are ported inline in the GDScript,
// each naming its source.
//
// Deterministic. tools/parity.mjs runs this before every parity check.
//
//   npx tsx scripts/export-godot-rules.mts

import fs from 'fs'
import path from 'path'
import { RODS, LOCKED_IN, ZONE_JACKPOT_CHANCE, COMPLETIONIST_TIER, COMPLETIONIST_MAX_EFFECTS, REFORGE_COST } from '../lib/rods'
import { BAITS } from '../lib/bait'
import { ZONE_RARITY_RATES, ZONE_MIN_LEVEL, ZONE_WAIT_BASE, ZONE_CRATE_TIERS, BASE_CRATE_CHANCE, ANCIENT_CRATE_CHANCE } from '../app/(app)/fishing/zoneData'
import { FISH_HOLD_TIERS } from '../lib/fishHold'
import { LINES } from '../lib/lines'
import { FINN_ITEM_THRESHOLDS, FINN_ITEMS } from '../lib/finnItems'
import { renownStats } from '../lib/renown'
import { fishingColorsToGrant } from '../lib/characters'
import { XP_TABLE, catchXP } from '../lib/fishingLevel'
import { DAILY_TIERS, MASTER_MIN_LEVEL } from '../lib/dailyChallenges'
import { CRATE_TABLES } from '../lib/crateLoot'
import { PETS, PET_SPECIES_WEIGHTS, CRATE_PET_CHANCE, PET_OVERLAYS } from '../lib/pets'
import { HOOKS } from '../lib/hooks'
import { CHARACTER_COLORS } from '../lib/characters'
import { FOLK } from '../lib/seaFolk'
import { REELS } from '../lib/reels'
import { FISH_DIFFICULTY_SPEED, ZONE_DIFFICULTY } from '../app/(app)/fishing/depths'
import { starterSave } from '../lib/data/local/starter'
import { FINN_ANCIENT_BEATS, FINN_AVATAR, FINN_BEATS, FINN_REVEAL_BEAT, FINN_IDLE_LINES, FINN_EPILOGUE_IDLE_LINES, FINN_EPILOGUE_LORE_LINES, FINN_EPILOGUE_LORE_CHANCE, FINN_ASKS, FINN_STANDING_NAME, FINN_STANDING_AT } from '../lib/finn'
import { FINN_QUESTS, FINN_CHAPTERS } from '../lib/finnQuests'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PAIR_PAYOUTS, SLOT_BONUS_MULT, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_JACKPOT_FEED_PCT, CASINO_BUY_IN_MIN, CASINO_BUY_IN_MAX, DEN_CAP_BASE, DEN_CAP_MAX, DEN_CAP_MAX_LEVEL, BJ_MIN_BET, BJ_MAX_BET, RL_MIN_BET, RL_MAX_STRAIGHT_BET, RL_MAX_OUTSIDE_BET, CASINO_BUY_IN_PRESETS, BJ_BET_PRESETS, RL_BET_PRESETS } from '../app/(app)/tavern/constants'
import { PAYOUT_MULT, POCKETS } from '../lib/roulette'
import { CREW_SKINS } from '../lib/crewSkins'
import { LANDMARKS, WORLD_CHART_COMPLETION_BONUS } from '../lib/worldChart'
import { MATCH_COLS, MATCH_ROWS, MATCH_TYPES, MATCH_MOVES, MATCH_TARGET, MATCH_MAX_POINTS, MATCH_TIERS, WILD_DROP_CHANCE } from '../app/(app)/charting/constants'
import { MINEFIELD_COLS, MINEFIELD_ROWS, MINEFIELD_MINES, MINEFIELD_POINTS } from '../app/(app)/charting/minefieldConstants'
import { HOLD_META, CLEAN_BONUS_FRACTION } from '../app/(app)/tavern/chart-room/hold/constants'
import { RIGGING_COLS, RIGGING_ROWS, RIGGING_COLORS, RIGGING_POINTS, RIGGING_PALETTE } from '../app/(app)/tavern/chart-room/rigging/constants'
import { TRIVIA_CATEGORIES, TRIVIA_TIER_VALUES, TRIVIA_ANSWER_SECONDS, TRIVIA_TIMER_GRACE_MS, PARLOR_RANKS, KING_RUNG_POINTS, KING_CROWN_POINTS, PIRATE_KING_PRIZES, PIRATE_KING_HAVENS, CAPSTAN_WHEEL, CAPSTAN_MAX_STRIKES, CAPSTAN_VOWEL_COST, CAPSTAN_MAX_HAZARD_RUN, CAPSTAN_SOLVE_POINTS, CAPSTAN_CLEAN_BONUS, CAPSTAN_PUZZLES_PER_WEEK } from '../app/(app)/tavern/trivia/constants'
import { DECK_COUNT, RANKS, SUITS } from '../lib/blackjack'
import { LOCAL_POT_SEED } from '../lib/data/local/casinoLocal'
import { FINN_MOORING, FINN_ROAM, FINN_REACH, FINN_LOOK } from '../lib/seaFinn'
import { VIGIL_DIAL } from '../lib/ancientVigil'
import { fishingGearLevelReq } from '../lib/gearGating'
import { isCaptainRod, ROD_SELL_RATE } from '../lib/rods'
import { RESIDENTS, PLACES, berthOf, SOCIALS, YOON } from '../app/(app)/sea/chart'
import { ASKS } from '../lib/seaFolk'
import { PLATES } from '../lib/islandPlates'
import { ISLE_FURNISHING } from '../lib/seaIsles'
import { DIG_SITES, bearingText } from '../lib/seaDigs'
import { PORTAL_TIERS } from '../lib/seaPortal'
import { FRAGMENTS } from '../lib/seaBottles'
import { FURNISHING_BY_ID } from '../lib/homestead'
import { plainRodFor, plainHookFor, yoonTrader, CELL, MAINLAND_DOORSTEP, MAX_DRIFT, NAMES_FIRST, NAMES_LAST, LINES as TRADER_LINES, PERSONAS, HINTS, STORIES, STOCK, RUNNER_LINES, BOAT_IDS, HAT_IDS, CHAR_COLORS, HOOK_ART, ROD_SLUGS, RUNNER_STAKE, RUNNER_ODDS, DEALS_PER_DAY, KIND_LABEL } from '../lib/seaTraders'
import { SOLIDS, BOAT_CLEAR } from '../lib/seaSolid'
import { RUNNER_RODS } from '../lib/rods'
import { NORTH_WALL, OUTER_EDGE } from '../app/(app)/sea/chart'
import { MOOD_CONFIG } from '../lib/marketMood'
import { CURRENTS, KELP, CURRENT_PUSH, KELP_KEEP } from '../lib/seaFlow'
import { HULL_COSTS, HULL_SPEED, HANDLING_SPEED, HANDLING_COSTS, ACCEL_RATE, ACCEL_COSTS, LANTERN_GLOW, LANTERN_COSTS, BASE_SPEED_PX, BASE_TURN_RAD, BASE_ACCEL } from '../lib/shipyard'
import { TIER_AT } from '../lib/seaFolk'
import { ISLES } from '../lib/seaIsles'
import { COMPLETIONIST_LEVEL } from '../lib/completionist'
import { rewardForLevel, LEVEL_REWARD_MAX } from '../lib/levelRewards'
import { SPECIAL_ITEMS, SPECIAL_OWNED_COLUMN } from '../lib/specialItems'
import { BOATS } from '../lib/boats'
import { HATS } from '../lib/hats'
import { BADGES, badgePoints } from '../lib/badges'
import { AP_POOL } from '../lib/cosmeticGates'
import { XP_TABLE as NAV_XP_TABLE } from '../lib/expeditionLevel'
import { SHINY_SELL_MULT, SHINY_MESSAGES } from '../lib/shiny'
import { SHIPS } from '../lib/ships'
import { CREW_NAMES, STAT_BUDGET, MAG_WEIGHTS, FREE_WEIGHTS, GEM_WEIGHTS, DAILY_RECRUITS } from '../lib/crewGen'
import { XP_TABLE as CREW_XP_TABLE, CREW_MAX_LEVEL } from '../lib/crewLevel'
import { FISH_GROUPS } from '../lib/fishGroups'
import { CLASS_BY_SLUG, CLASSES, CLASS_MILESTONE_LEVELS } from '../lib/crewClasses'
import { CREW_HALL_TIERS } from '../lib/crewHall'
import { bunkRatePerHour, storesCapHours, nextDrillCost, nextStoresCost, LEVIATHAN_SLOT, DRILL_MAX_LEVEL, STORES_MAX_LEVEL } from '../lib/crewBunks'
import { CREW_TRAITS } from '../lib/crewTraits'

import { BASE_CAPACITY, PER_LEVELS, ROSTER_PER_HALL_TIER } from '../lib/crewCapacity'
import { ALWAYS_UNLOCKED_LEGENDARIES, LEGENDARY_GATE } from '../lib/legendaryUnlocks'
import { traitLabel } from '../lib/crewEffects'
import { SHIP_SKINS } from '../lib/shipSkins'
import { ZONE_REWARD_BASE, PRESTIGE_MAX } from '../lib/zoneRewards'

const OUT = path.join(process.cwd(), '..', 'godot', 'game', 'content', 'rules.json')
const ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep']

const rules = {
  rods: RODS,
  lockedIn: LOCKED_IN,
  zoneJackpotChance: ZONE_JACKPOT_CHANCE,
  completionist: { tier: COMPLETIONIST_TIER, maxEffects: COMPLETIONIST_MAX_EFFECTS, reforgeCost: REFORGE_COST },
  baits: BAITS,
  zones: {
    rarityRates: ZONE_RARITY_RATES, minLevel: ZONE_MIN_LEVEL, waitBase: ZONE_WAIT_BASE,
    crateTiers: ZONE_CRATE_TIERS, baseCrateChance: BASE_CRATE_CHANCE, ancientCrateChance: ANCIENT_CRATE_CHANCE,
  },
  fishHoldTiers: FISH_HOLD_TIERS,
  lines: LINES,
  renownFishingPerPoint: Object.fromEntries(renownStats('fishing').map(s => [s.id, s.perPoint])),
  // fishingColorsToGrant(level, []) for every level: the colors a fishing level earns, in order.
  fishingColorsByLevel: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i + 1, fishingColorsToGrant(i + 1, [])])),
  xpTable: XP_TABLE,
  // catchXP(difficulty, zone, perfect) for every zone and difficulty 1-5.
  catchXp: Object.fromEntries(ZONES.map(z => [z, [1, 2, 3, 4, 5].map(d => [catchXP(d, z, false), catchXP(d, z, true)])])),
  daily: { tiers: DAILY_TIERS, masterMinLevel: MASTER_MIN_LEVEL },
  crate: { ...CRATE_TABLES, petChance: CRATE_PET_CHANCE },
  pets: PETS.map(p => ({ id: p.id, species: p.species, name: p.name, weight: p.weight, restImageUrl: p.restImageUrl, accentColor: p.accentColor, earnedOnly: p.earnedOnly ?? false, bow: p.bow ?? false })),
  petSpeciesWeights: PET_SPECIES_WEIGHTS,
  // Who asks for which fish, for "who was waiting on this one".
  folk: Object.fromEntries(FOLK.map(f => [f.id, { short: f.short, favourites: f.favourites.map(x => ({ id: x.id, name: x.name })) }])),
  // The dial (app/(app)/fishing/depths): needle speed by difficulty, and each
  // water's catch-zone multiplier.
  reels: REELS.map(r => ({ tier: r.tier, name: r.name, needleSpeedMultiplier: r.needleSpeedMultiplier, imageUrl: r.imageUrl ?? null, cost: r.cost, levelReq: fishingGearLevelReq(r), description: r.description ?? '' })),
  dial: { fishDifficultySpeed: FISH_DIFFICULTY_SPEED, zoneDifficulty: ZONE_DIFFICULTY },
  // A new captain's save (lib/data/local/starter) with the id, name and date
  // left for the game to fill in, and no species (content, attached on load).
  // The rest of fishing and the loadout (lib/core/fishing, lib/core/loadout).
  levelRewards: Object.fromEntries(Array.from({ length: LEVEL_REWARD_MAX }, (_, i) => [i + 1, rewardForLevel(i + 1)]).filter(([, r]) => r)),
  levelRewardMax: LEVEL_REWARD_MAX,
  specialItems: SPECIAL_ITEMS.map(d => ({ id: d.id, name: d.name, shopCost: d.shopCost ?? null, costFathoms: d.costFathoms ?? null, requiresItem: d.requiresItem ?? null, requiresGauntletDepth: d.requiresGauntletDepth ?? null, finaleSlotOnly: d.finaleSlotOnly ?? false })),
  specialOwnedColumn: SPECIAL_OWNED_COLUMN,
  boats: BOATS.map(b => ({ id: b.id, name: b.name, cost: b.cost, gemPrice: b.gemPrice ?? null, crateOnly: b.crateOnly ?? false, gate: b.gate ?? null, restImageUrl: b.restImageUrl, castImageUrl: b.castImageUrl, positions: b.positions, grade: b.grade ?? 1, trim: b.trim ?? 0 })),
  hats: HATS.map(h => ({ id: h.id, name: h.name, cost: h.cost, crateOnly: h.crateOnly ?? false, restImageUrl: h.restImageUrl, castImageUrl: h.castImageUrl, positions: h.positions })),
  // The look on the boat (app/(app)/sea/seaCaptain.ts and skiffArt.ts draw it).
  hooks: HOOKS.map(h => ({ tier: h.tier, name: h.name, imageUrl: h.imageUrl ?? null, cost: h.cost, levelReq: fishingGearLevelReq(h), description: h.description ?? '' })),
  characterColors: CHARACTER_COLORS.map(c => ({ id: c.id, name: c.name, free: c.free ?? false, gate: c.gate ?? null })),
  petOverlays: PET_OVERLAYS,
  badgePoints: Object.fromEntries(BADGES.map(b => [b.id, badgePoints(b.id)])),
  // The expedition ships as the chart draws them north of the reef (SeaMap's
  // Warship: the hull's sea art, its facing, beam and keel), and the ship skins'
  // hulls by tier.
  ships: SHIPS.map(d => ({ tier: d.tier, name: d.name, seaImageUrl: d.seaImageUrl ?? null, seaFlip: d.seaFlip ?? false, seaBeam: d.seaBeam ?? 0.6, seaKeel: d.seaKeel ?? 0.75 })),
  shipSkins: SHIP_SKINS.map(k => ({ id: k.id, name: k.name, imageByTier: k.imageByTier ?? null })),
  // The Crew Hall (lib/crewGen, crewLevel, fishGroups, crewClasses, crewHall,
  // crewCapacity, legendaryUnlocks): the recruit board's odds and budgets, the
  // level curve, which group and class each species is, the hall's ladder,
  // and every trait's label (traitLabel over the whole -4..4 cube).
  crew: {
    names: CREW_NAMES, statBudget: STAT_BUDGET, magWeights: MAG_WEIGHTS,
    freeWeights: FREE_WEIGHTS, gemWeights: GEM_WEIGHTS, dailyRecruits: DAILY_RECRUITS,
    xpTable: CREW_XP_TABLE, maxLevel: CREW_MAX_LEVEL,
    groups: FISH_GROUPS.map(g => [...g]),
    classBySlug: CLASS_BY_SLUG,
    classes: Object.fromEntries(Object.values(CLASSES).map(c => [c.id, { name: c.name, shortLabel: c.shortLabel, blurb: c.blurb, color: c.color, milestones: c.milestones.map(m => ({ unlockLevel: m.unlockLevel, desc: m.desc })) }])),
    hallTiers: Object.values(CREW_HALL_TIERS),
    capacity: { base: BASE_CAPACITY, perLevels: PER_LEVELS, perHallTier: ROSTER_PER_HALL_TIER },
    alwaysUnlocked: [...ALWAYS_UNLOCKED_LEGENDARIES], legendaryGate: LEGENDARY_GATE,
    // The hall's bunks (lib/crewBunks): XP an hour by Drills tier, a stint's
    // hours by Stores tier, each ladder's next price, the Leviathan bunk, the
    // deep trait table (lib/crewTraits) and the promotion levels.
    bunks: {
      ratePerHour: Array.from({ length: DRILL_MAX_LEVEL }, (_, i) => bunkRatePerHour(i + 1)),
      capHours: Array.from({ length: STORES_MAX_LEVEL }, (_, i) => storesCapHours(i + 1)),
      drillCost: Array.from({ length: DRILL_MAX_LEVEL }, (_, i) => nextDrillCost(i + 1)),
      storesCost: Array.from({ length: STORES_MAX_LEVEL }, (_, i) => nextStoresCost(i + 1)),
      leviathanSlot: LEVIATHAN_SLOT,
      deepTraits: CREW_TRAITS,
      milestoneLevels: [...CLASS_MILESTONE_LEVELS],
    },
    traitLabels: Object.fromEntries([-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap(p => [-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap(d => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(f => [`${p},${d},${f}`, traitLabel({ power: p, dodge: d, fortune: f })])))),
  },
  // Every badge as the Achievements page lists it (the port shows the ones its systems can earn).
  badges: BADGES.map(b => ({ id: b.id, name: b.name, description: b.description, imageUrl: b.imageUrl, difficulty: b.difficulty })),
  apPool: AP_POOL,
  navXpTable: NAV_XP_TABLE,
  shinySellMult: SHINY_SELL_MULT,
  shinyMessages: SHINY_MESSAGES,
  zoneRewardBase: ZONE_REWARD_BASE,
  prestigeMax: PRESTIGE_MAX,
  // The Ancient Deep: the giants' dial colors by Vigil rank, and Finn's words
  // when each giant first comes up (lib/finn FINN_ANCIENT_BEATS).
  vigilDial: VIGIL_DIAL,
  finnAncientBeats: FINN_ANCIENT_BEATS,
  finnAvatar: FINN_AVATAR,
  // Crew skins (lib/crewSkins): every skin, with its crew's rarity tier
  // (lib/fishGroups: 1 rare, 2 epic, 3 legendary).
  // The Chart Room (lib/core/chartRoom and its engines' constants) and the
  // World Chart's landmarks (lib/worldChart).
  chartRoom: {
    match: { cols: MATCH_COLS, rows: MATCH_ROWS, types: MATCH_TYPES, moves: MATCH_MOVES, target: MATCH_TARGET, maxPoints: MATCH_MAX_POINTS, wildDropChance: WILD_DROP_CHANCE },
    matchTiers: MATCH_TIERS,
    minefield: { cols: MINEFIELD_COLS, rows: MINEFIELD_ROWS, mines: MINEFIELD_MINES, points: MINEFIELD_POINTS },
    hold: { ...HOLD_META, cleanFraction: CLEAN_BONUS_FRACTION },
    rigging: { cols: RIGGING_COLS, rows: RIGGING_ROWS, colors: RIGGING_COLORS, points: RIGGING_POINTS, palette: [...RIGGING_PALETTE] },
    landmarks: LANDMARKS,
    completionBonus: WORLD_CHART_COMPLETION_BONUS,
  },
  crewSkins: CREW_SKINS.map(k => ({ ...k, crewTier: FISH_GROUPS.findIndex(g => g.has(k.slug)) })),
  // The Parlor (lib/core/parlor, tavern/trivia/constants): payouts, the
  // answer clock, the ranks, the King's ladder and the capstan's wheel.
  parlor: {
    categories: TRIVIA_CATEGORIES, tierValues: TRIVIA_TIER_VALUES, answerSeconds: TRIVIA_ANSWER_SECONDS, graceMs: TRIVIA_TIMER_GRACE_MS,
    ranks: PARLOR_RANKS, kingRungPoints: KING_RUNG_POINTS, kingCrownPoints: KING_CROWN_POINTS, kingPrizes: PIRATE_KING_PRIZES, kingHavens: PIRATE_KING_HAVENS,
    capstanWheel: CAPSTAN_WHEEL, capstanMaxStrikes: CAPSTAN_MAX_STRIKES, capstanVowelCost: CAPSTAN_VOWEL_COST, capstanMaxHazardRun: CAPSTAN_MAX_HAZARD_RUN,
    capstanSolvePoints: CAPSTAN_SOLVE_POINTS, capstanCleanBonus: CAPSTAN_CLEAN_BONUS, capstanPerWeek: CAPSTAN_PUZZLES_PER_WEEK,
  },
  // The Den (lib/core/casino, lib/casinoRules, lib/roulette, lib/blackjack,
  // tavern/constants): the purse, Fish Slots, roulette and blackjack.
  casino: {
    symbols: SLOT_SYMBOLS_LIST, payouts: SLOT_PAYOUTS, pairPayouts: SLOT_PAIR_PAYOUTS, bonusMult: SLOT_BONUS_MULT,
    slotsMin: SLOTS_MIN_BET, slotsMax: SLOTS_MAX_BET, feedPct: SLOTS_JACKPOT_FEED_PCT, potSeed: LOCAL_POT_SEED,
    buyInMin: CASINO_BUY_IN_MIN, buyInMax: CASINO_BUY_IN_MAX, buyInPresets: CASINO_BUY_IN_PRESETS,
    capBase: DEN_CAP_BASE, capMax: DEN_CAP_MAX, capMaxLevel: DEN_CAP_MAX_LEVEL,
    bjMin: BJ_MIN_BET, bjMax: BJ_MAX_BET, bjPresets: BJ_BET_PRESETS, deckCount: DECK_COUNT, ranks: RANKS, suits: SUITS,
    rlMin: RL_MIN_BET, rlMaxStraight: RL_MAX_STRAIGHT_BET, rlMaxOutside: RL_MAX_OUTSIDE_BET, rlPresets: RL_BET_PRESETS,
    payoutMult: PAYOUT_MULT, pockets: POCKETS, keepRoulette: 20,
  },
  // Finn's campaign (lib/finn, lib/finnQuests, lib/seaFinn): his beats, his
  // jobs and chapters, where he is moored and how far he circles.
  finn: {
    thresholds: FINN_ITEM_THRESHOLDS, anglersPatience: FINN_ITEMS.anglers_patience.milestones,
    beats: FINN_BEATS, reveal: FINN_REVEAL_BEAT, idle: FINN_IDLE_LINES,
    epilogueIdle: FINN_EPILOGUE_IDLE_LINES, epilogueLore: FINN_EPILOGUE_LORE_LINES, loreChance: FINN_EPILOGUE_LORE_CHANCE,
    asks: FINN_ASKS, standingName: FINN_STANDING_NAME, standingAt: FINN_STANDING_AT,
    quests: FINN_QUESTS, chapters: FINN_CHAPTERS,
    mooring: FINN_MOORING, roam: FINN_ROAM, lap: 96, reach: FINN_REACH, look: FINN_LOOK,
    bandName: PLACES.find(p => p.id === 'shallows')?.name ?? 'The Shallows',
  },
  // The tackle shop and selling (lib/core/harbour, lib/core/selling).
  rodShop: Object.fromEntries(RODS.map(r => [r.tier, { levelReq: fishingGearLevelReq(r), captainRod: isCaptainRod(r) }])),
  rodSellRate: ROD_SELL_RATE,
  // Each water's buyer, with the look and the drift SeaMap gives them (hashed
  // off the water's id, so the same person every time).
  residents: RESIDENTS.map(r => {
    const seed = r.zoneId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    return {
      ...r,
      driftRate: (Math.PI * 2) / (64 + (seed % 40)),
      driftPhase: (seed % 100) / 16,
      look: {
        color: ['default', 'gray', 'blue', 'pink'][seed % 4],
        boat: ['oak', 'mahogany', 'taupe', 'desert', 'charcoal'][seed % 5],
        hat: ['brown', 'olive', 'midnight', 'offwhite'][seed % 4],
        rodSlug: plainRodFor(seed),
        hook: plainHookFor(seed),
      },
    }
  }),
  // The Shipyard's four ladders (lib/shipyard): what each rung costs and does.
  shipyard: {
    hull_speed_tier: { costs: HULL_COSTS, effect: HULL_SPEED, label: 'hull tier', full: 'Your hull is as fine as it gets.' },
    hull_handling_tier: { costs: HANDLING_COSTS, effect: HANDLING_SPEED, label: 'rudder', full: 'Her rudder is as fine as it gets.' },
    lantern_tier: { costs: LANTERN_COSTS, effect: LANTERN_GLOW, label: 'lantern', full: 'Your lantern is as bright as they come.' },
    hull_accel_tier: { costs: ACCEL_COSTS, effect: ACCEL_RATE, label: 'rig', full: 'Her rig is as fine as it gets.' },
    base: { speedPx: BASE_SPEED_PX, turnRad: BASE_TURN_RAD, accel: BASE_ACCEL },
  },
  // The ports on the chart (chart.ts PLACES), each with its painted plate, what
  // stands on it, its berth, and the label the dock prompt uses.
  ports: PLACES.filter(p => p.kind === 'port').map(p => ({
    id: p.id, name: p.name, blurb: p.blurb ?? '', x: p.x, y: p.y, r: p.r,
    plate: PLATES[p.id] ?? null,
    buildings: (p.buildings ?? []).filter(b => b.art).map(b => ({ art: b.art, x: b.x, y: b.y, scale: b.scale ?? 1 })),
    berth: berthOf(p),
  })),
  // Exploration (lib/seaIsles, seaDigs, seaPortal, seaBottles): the isles with
  // what they pay, the furnishings in five of their chests, the dig sites with
  // their bearings, the portal's tiers (for the stones), the bottles' notes.
  isles: ISLES.map(i => ({ ...i, plate: PLATES[i.id] ?? null })),
  isleFurnishing: Object.fromEntries(Object.entries(ISLE_FURNISHING).map(([isle, fid]) => [isle, { id: fid, name: FURNISHING_BY_ID[fid]?.item.name ?? null }])),
  digSites: DIG_SITES.map(d => ({ ...d, bearing: bearingText(d) })),
  portalTiers: PORTAL_TIERS,
  bottleFragments: FRAGMENTS,
  // THE REGULARS (lib/seaFolk FOLK and ASKS; chart.ts SOCIALS and YOON): who
  // they are and everything they say, and where each moors, with the look and
  // drift SeaMap gives them (hashed off their id; Yoon's is fixed).
  regulars: {
    folk: FOLK,
    asks: ASKS,
    moorings: [
      ...SOCIALS.map(r => {
        const seed = r.folkId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11)
        const f = FOLK.find(x => x.id === r.folkId)
        const rod = f?.rodTier ? RODS.find(x => x.tier === f.rodTier)?.slug ?? null : null
        return {
          folkId: r.folkId, zoneId: r.zoneId, name: r.name, line: r.line, x: r.x, y: r.y,
          driftRate: (Math.PI * 2) / (58 + (seed % 46)), driftPhase: (seed % 100) / 15, roam: true,
          look: {
            color: ['blue', 'pink', 'gray', 'default'][seed % 4],
            boat: ['taupe', 'oak', 'desert', 'mahogany', 'charcoal'][seed % 5],
            hat: ['olive', 'offwhite', 'brown', 'midnight'][seed % 4],
            rodSlug: rod ?? plainRodFor(seed), hook: plainHookFor(seed),
          },
        }
      }),
      (() => {
        const y = yoonTrader()
        return {
          folkId: 'yoon', zoneId: YOON.zoneId, name: YOON.name, line: YOON.line, x: YOON.x, y: YOON.y,
          driftR: y.driftR, driftRate: y.driftRate, driftPhase: y.driftPhase, roam: false,
          look: { color: y.look.characterColor, boat: y.look.boatId, hat: y.look.hatId, rodSlug: y.look.rodSlug, hook: y.look.hook },
        }
      })(),
    ],
  },
  // THE WANDERING TRADERS (lib/seaTraders): the tables their generation draws
  // from, and the solids they keep clear of (lib/seaSolid).
  traders: {
    cell: CELL, doorstep: MAINLAND_DOORSTEP, maxDrift: MAX_DRIFT, northWall: NORTH_WALL, outerEdge: OUTER_EDGE,
    boatClear: BOAT_CLEAR, solids: SOLIDS.map(s => [s.x, s.y, s.r]),
    namesFirst: NAMES_FIRST, namesLast: NAMES_LAST, lines: TRADER_LINES, personas: PERSONAS, hints: HINTS, stories: STORIES,
    stock: STOCK, runnerLines: RUNNER_LINES, boats: BOAT_IDS, hats: HAT_IDS, colors: CHAR_COLORS, hooks: HOOK_ART,
    rods: ROD_SLUGS, runnerRods: RUNNER_RODS.map(r => ({ tier: r.tier, slug: r.slug ?? null })),
    runnerStake: RUNNER_STAKE, runnerOdds: RUNNER_ODDS, dealsPerDay: DEALS_PER_DAY, kindLabel: KIND_LABEL,
  },
  // THE CURRENTS AND THE KELP (lib/seaFlow): the lanes' points as the TS
  // builds them, the beds as it places them; the port reads, never re-derives.
  flow: {
    currents: CURRENTS.map(l => ({ id: l.id, half: l.half, pts: l.pts.map(p => [p.x, p.y]) })),
    kelp: KELP, push: CURRENT_PUSH, keep: KELP_KEEP,
  },
  marketMoods: Object.fromEntries(Object.entries(MOOD_CONFIG).map(([k, v]) => [k, { label: v.label, color: v.color, desc: v.desc }])),
  completionistNeeds: { level: COMPLETIONIST_LEVEL, folk: FOLK.map(f => f.id), maxRapport: TIER_AT[4], isles: ISLES.map(i => i.id) },
  starter: (() => { const { species: _s, ...rest } = starterSave('__uid__', [], 0); return rest })(),
}

fs.writeFileSync(OUT, JSON.stringify(rules, null, 1) + '\n')
console.log(`  content/rules.json: ${RODS.length} rods, ${BAITS.length} baits, ${PETS.length} pets, ${FOLK.length} regulars`)
