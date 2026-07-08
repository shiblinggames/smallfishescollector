// Single source of truth for which badges a player has earned, derived purely
// from their profile columns + a few joined aggregates. Used by BOTH the
// per-user reconcile (achievements/badgeActions.ts, which persists to
// unlocked_badges) and the Achievement Points leaderboard (lib/achievementPoints.ts,
// which computes live for every player so the board never goes stale).
//
// Two badges can't be derived from stored state and are NOT covered here —
// Trophy Catch, Catfish Jackpot, and Full Collection keep dedicated unlock
// hooks at their moment. Callers that need a complete picture should union
// these derived ids with the player's already-stored unlocked_badges.

import { BADGE_MAP } from './badges'
import { getLevelFromXP as fishLevelFromXP } from './fishingLevel'
import { getLevelFromXP as navLevelFromXP } from './expeditionLevel'
import { crewLevelFromXP, CREW_MAX_LEVEL } from './crewLevel'
import { CREW_HALL_MAX_TIER } from './crewHall'
import { GAUNTLET_UPGRADES } from './gauntletUpgrades'
import { FORGE_RECIPES, isForgedRaidItem } from './raidItems'
import { CREW_SKINS } from './crewSkins'

// Chase-skin ids (the animated legendary skins) — for "The Chase".
export const CHASE_SKIN_IDS = new Set(CREW_SKINS.filter(s => s.chase).map(s => s.id))
// Per-legendary full skin sets (a "legendary" set is any slug that has a chase
// skin) — for "Full Wardrobe" (own all skins for one legendary crew).
export const LEGENDARY_SKIN_SETS: string[][] = (() => {
  const bySlug = new Map<string, { id: string; chase: boolean }[]>()
  for (const s of CREW_SKINS) {
    const arr = bySlug.get(s.slug) ?? []
    arr.push({ id: s.id, chase: !!s.chase })
    bySlug.set(s.slug, arr)
  }
  return [...bySlug.values()].filter(set => set.some(s => s.chase)).map(set => set.map(s => s.id))
})()

// Zones that prestige (Ancient Deep doesn't — see fishing/actions.ts).
export const PRESTIGE_ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
// All four raids' challenge-completion ids (Finndicate's Bane capstone).
export const CHALLENGE_RAID_IDS = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']
// The three ORIGINAL legendary crew species (Legendary Recruit).
export const LEGENDARY_SLUGS = new Set(['catfish', 'doby_mick', 'mako'])
// EVERY legendary crew species (Three Legends = own any 3 of these). Add each
// new legendary's slug here as it ships.
export const LEGENDARY_SLUGS_ALL = new Set(['catfish', 'doby_mick', 'mako', 'dole', 'coelacanth'])
// The FIVE BASE legendaries — FROZEN, never grows (for "The Avengers" = own all
// 5 base). New legendaries go in LEGENDARY_SLUGS_ALL, NOT here.
export const BASE_LEGENDARY_SLUGS = new Set(['catfish', 'doby_mick', 'mako', 'dole', 'coelacanth'])
// Number of confluences in the Gauntlet (lib/gauntlet.ts CONFLUENCES). Kept as a
// constant to avoid importing the heavy gauntlet module here — bump if more ship.
export const CONFLUENCE_COUNT = 7

export interface BadgeProfileFields {
  fishing_xp?: number | null
  expedition_xp?: number | null
  highest_perfect_streak?: number | null
  total_perfects?: number | null
  doubloons?: number | null
  crew_hall_tier?: number | null
  lifetime_recruits?: number | null
  highest_raid_damage?: number | null
  pvp_wins?: number | null
  puzzle_points?: number | null
  tide_run_best_distance?: number | string | null
  gauntlet_deepest?: number | null
  gauntlet_fathoms?: number | null
  ancient_catches?: number[] | null   // the ≤6 Ancient Deep giants (Megalodon etc.)
  trophy_size_catches?: number | null  // lifetime count of Trophy-SIZE catches
  prestige_levels?: Record<string, number> | null
  fishing_casts?: number | null
  fishing_double_catches?: number | null
  fishing_crates_opened?: number | null
  fishing_snags?: number | null
  fishing_jackpots?: number | null
  tide_run_beacons_smashed?: number | null
  tide_run_total_distance?: number | string | null
  is_premium?: boolean | null
  ship_tier?: number | null
  trawls_collected?: number | null
  unlocked_pets?: string[] | null
  // 2026-07 expansion — Gauntlet counters + endgame state.
  gauntlet_upgrades?: string[] | null
  gauntlet_confluences_seen?: string[] | null
  gauntlet_runs_completed?: number | null
  gauntlet_fathoms_earned?: number | null
  gauntlet_max_hit?: number | null
  gauntlet_deepest_died?: number | null
  gauntlet_hc_deepest?: number | null
  gauntlet_hc_deepest_died?: number | null
  blood_gems_earned?: number | null
  manowar_augment?: string | null
  ship_classes?: Record<string, string> | null
  forge_recipes_learned?: string[] | null
  raid_items?: string[] | null
  owned_crew_skins?: string[] | null
  equipped_crew_skins?: Record<string, string> | null
}

export interface BadgeJoinData {
  raids: { raid_id: string; elapsed_ms: number | null }[]
  crew: { xp: number | null; died_at: string | null; slug: string | null }[]
  voyageCount: number       // revealed daily_voyages
  collectionCount: number   // fish_collection rows
}

/** Map of badge id → whether its derivable condition is met. */
export function badgeConditions(p: BadgeProfileFields, j: BadgeJoinData): Record<string, boolean> {
  const raidIds = new Set<string>(j.raids.map(r => r.raid_id))
  const fastestCorsairs = Math.min(Infinity, ...j.raids.filter(r => r.raid_id === 'corsairs_reckoning').map(r => r.elapsed_ms ?? Infinity))
  const fastestAnyRaid = Math.min(Infinity, ...j.raids.map(r => r.elapsed_ms ?? Infinity))
  const maxCrewLevel = j.crew.reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  // cards.slug is Title_Case ('Catfish', 'Doby_Mick'); the LEGENDARY sets are
  // lowercase — normalise before comparing or the legendary checks never match.
  const ownedSlugsLc = j.crew.map(c => c.slug?.toLowerCase()).filter((s): s is string => !!s)
  const hasLegendaryCrew = ownedSlugsLc.some(s => LEGENDARY_SLUGS.has(s))
  const ownedLegendaryAll = new Set(ownedSlugsLc.filter(s => LEGENDARY_SLUGS_ALL.has(s)))
  const ownedBaseLegendary = new Set(ownedSlugsLc.filter(s => BASE_LEGENDARY_SLUGS.has(s)))
  // Gauntlet + endgame state.
  const gauntletUpgrades = p.gauntlet_upgrades ?? []
  const gauntletDeepest = Number(p.gauntlet_deepest ?? 0)
  const confluencesSeen = (p.gauntlet_confluences_seen ?? []).length
  const shipClasses = p.ship_classes ?? {}
  const raidItems = p.raid_items ?? []
  const fishLvl = fishLevelFromXP(Number(p.fishing_xp ?? 0))
  const hasLostCrew = j.crew.some(c => c.died_at != null)
  const prestige = p.prestige_levels ?? {}
  const totalStars = PRESTIGE_ZONES.reduce((s, z) => s + Math.min(5, prestige[z] ?? 0), 0)
  const navLevel = navLevelFromXP(Number(p.expedition_xp ?? 0))
  const streak = Number(p.highest_perfect_streak ?? 0)
  const raidDmg = Number(p.highest_raid_damage ?? 0)
  const pvpWins = Number(p.pvp_wins ?? 0)
  const doubloons = Number(p.doubloons ?? 0)
  const tideBest = Number(p.tide_run_best_distance ?? 0)
  const puzzlePoints = Number(p.puzzle_points ?? 0)
  const recruits = Number(p.lifetime_recruits ?? 0)
  // Crew skins owned / equipped (for the skin badges).
  const ownedSkins = new Set(p.owned_crew_skins ?? [])
  const equippedSkinCount = Object.keys(p.equipped_crew_skins ?? {}).length
  const ancientsCaught = ((p.ancient_catches as number[] | null) ?? []).length

  return {
    master_angler:  fishLevelFromXP(Number(p.fishing_xp ?? 0)) >= 100,
    navigator:      navLevel >= 50,
    master_navigator: navLevel >= 100,
    unbroken:       streak >= 10,
    relentless:     streak >= 15,
    untouchable:    streak >= 20,
    dead_eye:       Number(p.total_perfects ?? 0) >= 1000,
    half_the_sea:   j.collectionCount >= 50,
    baby_steps:     doubloons >= 100_000,
    deep_pockets:   doubloons >= 1_000_000,
    bilge_baron:    doubloons >= 2_500_000,
    prestige_i:     PRESTIGE_ZONES.some(z => (prestige[z] ?? 0) >= 1),
    zone_legend:    PRESTIGE_ZONES.every(z => (prestige[z] ?? 0) >= 1),
    prestige_stars: totalStars >= 20,
    ancient_ones:   ancientsCaught >= 6,
    crewmaster:     Number(p.crew_hall_tier ?? 0) >= CREW_HALL_MAX_TIER,
    growing_crew:   recruits >= 25,
    full_muster:    recruits >= 100,
    legendary_recruit: hasLegendaryCrew,
    theres_a_grave: hasLostCrew,
    old_salt:       maxCrewLevel >= CREW_MAX_LEVEL,
    fleet_admiral:  j.voyageCount >= 100,
    opening_salvo:  raidDmg >= 50,
    hard_hitter:    raidDmg >= 100,
    heavy_broadside: raidDmg >= 250,
    swift_reckoning: fastestCorsairs <= 90_000,
    two_for_the_pot: Number(p.fishing_double_catches ?? 0) >= 1,
    saltlung:       Number(p.fishing_casts ?? 0) >= 1000,
    crate_digger:   Number(p.fishing_crates_opened ?? 0) >= 50,
    first_blood:    pvpWins >= 1,
    brawler:        pvpWins >= 10,
    duelist:        pvpWins >= 25,
    quartermaster:  puzzlePoints >= 40,
    den_magnate:    puzzlePoints >= 80,
    tide_runner:    tideBest >= 300,
    tide_champion:  tideBest >= 500,
    tide_master:    tideBest >= 750,
    into_the_deep:  Number(p.gauntlet_deepest ?? 0) >= 5,
    davy_jones:     Number(p.gauntlet_deepest ?? 0) >= 10,
    fathomless:     Number(p.gauntlet_fathoms ?? 0) >= 500,
    corsairs_bane:  raidIds.has('corsairs_reckoning_challenge'),
    ghost_ship:     raidIds.has('captain_krust_challenge'),
    cartographers_fall: raidIds.has('cartographer_challenge'),
    toll_paid:      raidIds.has('tollmasters_cut_challenge'),
    finndicates_bane: CHALLENGE_RAID_IDS.every(id => raidIds.has(id)),
    // ── 2026-06 expansion ──
    got_away:       Number(p.fishing_snags ?? 0) >= 50,
    maiden_voyage:  j.voyageCount >= 1,
    captains_colors: !!p.is_premium,
    two_fisted:     Number(p.fishing_double_catches ?? 0) >= 100,
    sure_shot:      Number(p.total_perfects ?? 0) >= 250,
    old_sea_dog:    j.voyageCount >= 50,
    beacon_breaker: Number(p.tide_run_beacons_smashed ?? 0) >= 500,
    reel_lucky:     Number(p.fishing_jackpots ?? 0) >= 1,
    hundred_fins:   j.collectionCount >= 100,
    long_haul:      Number(p.tide_run_total_distance ?? 0) >= 100_000,
    salted_through: Number(p.fishing_casts ?? 0) >= 10_000,
    three_legends:  ownedLegendaryAll.size >= 3,
    // ── 2026-06 expansion II (the 6 derivable ones; the other 6 are hooks) ──
    friend_at_sea:  (p.unlocked_pets ?? []).length >= 1,
    ship_of_the_line: Number(p.ship_tier ?? 0) >= 6,
    wrecking_crew:  Number(p.tide_run_beacons_smashed ?? 0) >= 2000,
    first_haul:     Number(p.trawls_collected ?? 0) >= 1,
    steady_nets:    Number(p.trawls_collected ?? 0) >= 25,
    deep_trawler:   Number(p.trawls_collected ?? 0) >= 100,
    // ── 2026-07 expansion (Gauntlet + endgame) ──
    // Descent (depth 5 = into_the_deep, depth 10 = davy_jones, already above).
    first_descent:  gauntletDeepest >= 1,
    abyssward:      gauntletDeepest >= 20,
    forge_worthy:   gauntletDeepest >= 35,
    davys_doorstep: gauntletDeepest >= 60,
    // The Locker.
    well_provisioned: gauntletUpgrades.length >= 1,
    locker_raider:  gauntletUpgrades.length >= 6,
    forge_awakened: gauntletUpgrades.includes('forge'),
    master_of_the_locker: gauntletUpgrades.length >= GAUNTLET_UPGRADES.length,
    // The deep.
    push_your_luck: Number(p.gauntlet_runs_completed ?? 0) >= 10,
    again_and_again: Number(p.gauntlet_runs_completed ?? 0) >= 50,
    fathom_hoarder: Number(p.gauntlet_fathoms_earned ?? 0) >= 1000,
    one_shot:       Number(p.gauntlet_max_hit ?? 0) >= 2000,
    greeds_price:   Number(p.gauntlet_deepest_died ?? 0) > gauntletDeepest,
    storm_reader:   confluencesSeen >= 1,
    deep_cartographer: confluencesSeen >= CONFLUENCE_COUNT,
    // Hardcore (the Drowned Ledger). gauntlet_hc_deepest = best hardcore cash-out.
    drowned_ledger: Number(p.gauntlet_hc_deepest ?? 0) >= 1,
    the_unsinkable: Number(p.gauntlet_hc_deepest ?? 0) >= 15,
    locker_bound:   Number(p.gauntlet_hc_deepest ?? 0) >= 25,
    the_deep_end:   Number(p.gauntlet_hc_deepest ?? 0) >= 50,
    ferrymans_toll: Number(p.gauntlet_hc_deepest_died ?? 0) >= 1,
    // Blood Gems earned lifetime (crimson_fortune is hook-granted at the gamble).
    blood_rich:     Number(p.blood_gems_earned ?? 0) >= 500,
    bloodhoard:     Number(p.blood_gems_earned ?? 0) >= 2000,
    // Endgame & challenge.
    weapon_of_legend: !!p.manowar_augment,
    first_fusion:   raidItems.some(id => isForgedRaidItem(id)),
    ruse_undone:    raidIds.has('coffers_fleet_challenge'),
    account_settled: raidIds.has('the_quartermaster_challenge'),
    grand_forgemaster: (p.forge_recipes_learned ?? []).length >= FORGE_RECIPES.length,
    mark_of_mastery: Object.values(shipClasses).some(v => typeof v === 'string' && v.endsWith('_iii')),
    quick_draw:     fastestAnyRaid <= 60_000,
    complete_captain: fishLvl >= 100 && navLevel >= 100,
    six_legends:    ownedBaseLegendary.size >= BASE_LEGENDARY_SLUGS.size,  // "The Avengers" — own all 5 base legendaries
    // ── Crew skins + feats (batches 17–18) — the 5 challenge-run badges
    //    (all_hands_legends / iron_ruse / not_a_shot_fired / tight_quarters /
    //    dead_reckoning) are moment-only and keep dedicated hooks, so they are
    //    NOT derived here. ──
    colors_raised:  ownedSkins.size >= 1,
    the_chase:      [...ownedSkins].some(id => CHASE_SKIN_IDS.has(id)),
    fashionista:    equippedSkinCount >= 5,
    full_wardrobe:  LEGENDARY_SKIN_SETS.some(set => set.every(id => ownedSkins.has(id))),
    dressed_to_the_nines: ownedSkins.size >= 10,
    trophy_hunter:  Number(p.trophy_size_catches ?? 0) >= 25,
    overkill:       raidDmg >= 500,
  }
}

/** The ids of every badge whose derivable condition is currently met. */
export function earnedBadgeIds(p: BadgeProfileFields, j: BadgeJoinData): string[] {
  return Object.entries(badgeConditions(p, j))
    .filter(([id, met]) => met && BADGE_MAP[id])
    .map(([id]) => id)
}

/** Columns a query must select to feed badgeConditions(). */
export const BADGE_PROFILE_COLUMNS =
  'fishing_xp, expedition_xp, highest_perfect_streak, total_perfects, doubloons, crew_hall_tier, lifetime_recruits, highest_raid_damage, pvp_wins, puzzle_points, tide_run_best_distance, gauntlet_deepest, gauntlet_fathoms, ancient_catches, trophy_size_catches, prestige_levels, fishing_casts, fishing_double_catches, fishing_crates_opened, fishing_snags, fishing_jackpots, tide_run_beacons_smashed, tide_run_total_distance, is_premium, ship_tier, trawls_collected, unlocked_pets, gauntlet_upgrades, gauntlet_confluences_seen, gauntlet_runs_completed, gauntlet_fathoms_earned, gauntlet_max_hit, gauntlet_deepest_died, gauntlet_hc_deepest, gauntlet_hc_deepest_died, blood_gems_earned, manowar_augment, ship_classes, forge_recipes_learned, raid_items, owned_crew_skins, equipped_crew_skins'
