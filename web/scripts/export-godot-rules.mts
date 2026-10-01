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
import { FINN_ANCIENT_BEATS, FINN_AVATAR } from '../lib/finn'
import { VIGIL_DIAL } from '../lib/ancientVigil'
import { fishingGearLevelReq } from '../lib/gearGating'
import { isCaptainRod, ROD_SELL_RATE } from '../lib/rods'
import { RESIDENTS, PLACES, berthOf } from '../app/(app)/sea/chart'
import { PLATES } from '../lib/islandPlates'
import { ISLE_FURNISHING } from '../lib/seaIsles'
import { DIG_SITES, bearingText } from '../lib/seaDigs'
import { PORTAL_TIERS } from '../lib/seaPortal'
import { FRAGMENTS } from '../lib/seaBottles'
import { FURNISHING_BY_ID } from '../lib/homestead'
import { plainRodFor, plainHookFor } from '../lib/seaTraders'
import { MOOD_CONFIG } from '../lib/marketMood'
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
  finn: { thresholds: FINN_ITEM_THRESHOLDS, anglersPatience: FINN_ITEMS.anglers_patience.milestones },
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
  marketMoods: Object.fromEntries(Object.entries(MOOD_CONFIG).map(([k, v]) => [k, { label: v.label, color: v.color, desc: v.desc }])),
  completionistNeeds: { level: COMPLETIONIST_LEVEL, folk: FOLK.map(f => f.id), maxRapport: TIER_AT[4], isles: ISLES.map(i => i.id) },
  starter: (() => { const { species: _s, ...rest } = starterSave('__uid__', [], 0); return rest })(),
}

fs.writeFileSync(OUT, JSON.stringify(rules, null, 1) + '\n')
console.log(`  content/rules.json: ${RODS.length} rods, ${BAITS.length} baits, ${PETS.length} pets, ${FOLK.length} regulars`)
