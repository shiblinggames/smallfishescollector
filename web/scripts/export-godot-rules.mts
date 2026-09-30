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
import { RODS, LOCKED_IN, ZONE_JACKPOT_CHANCE, COMPLETIONIST_TIER, COMPLETIONIST_MAX_EFFECTS } from '../lib/rods'
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
import { PETS, PET_SPECIES_WEIGHTS, CRATE_PET_CHANCE } from '../lib/pets'
import { FOLK } from '../lib/seaFolk'
import { REELS } from '../lib/reels'
import { FISH_DIFFICULTY_SPEED, ZONE_DIFFICULTY } from '../app/(app)/fishing/depths'
import { starterSave } from '../lib/data/local/starter'

const OUT = path.join(process.cwd(), '..', 'godot', 'game', 'content', 'rules.json')
const ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep']

const rules = {
  rods: RODS,
  lockedIn: LOCKED_IN,
  zoneJackpotChance: ZONE_JACKPOT_CHANCE,
  completionist: { tier: COMPLETIONIST_TIER, maxEffects: COMPLETIONIST_MAX_EFFECTS },
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
  pets: PETS.map(p => ({ id: p.id, species: p.species, name: p.name, weight: p.weight, restImageUrl: p.restImageUrl, accentColor: p.accentColor, earnedOnly: p.earnedOnly ?? false })),
  petSpeciesWeights: PET_SPECIES_WEIGHTS,
  // Who asks for which fish, for "who was waiting on this one".
  folk: Object.fromEntries(FOLK.map(f => [f.id, { short: f.short, favourites: f.favourites.map(x => ({ id: x.id, name: x.name })) }])),
  // The dial (app/(app)/fishing/depths): needle speed by difficulty, and each
  // water's catch-zone multiplier.
  reels: REELS.map(r => ({ tier: r.tier, name: r.name, needleSpeedMultiplier: r.needleSpeedMultiplier })),
  dial: { fishDifficultySpeed: FISH_DIFFICULTY_SPEED, zoneDifficulty: ZONE_DIFFICULTY },
  // A new captain's save (lib/data/local/starter) with the id, name and date
  // left for the game to fill in, and no species (content, attached on load).
  starter: (() => { const { species: _s, ...rest } = starterSave('__uid__', [], 0); return rest })(),
}

fs.writeFileSync(OUT, JSON.stringify(rules, null, 1) + '\n')
console.log(`  content/rules.json: ${RODS.length} rods, ${BAITS.length} baits, ${PETS.length} pets, ${FOLK.length} regulars`)
