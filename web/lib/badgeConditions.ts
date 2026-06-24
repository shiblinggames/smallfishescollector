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

// Zones that prestige (Ancient Deep doesn't — see fishing/actions.ts).
export const PRESTIGE_ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
// All four raids' challenge-completion ids (Finndicate's Bane capstone).
export const CHALLENGE_RAID_IDS = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']
// The three legendary crew species (Legendary Recruit badge).
export const LEGENDARY_SLUGS = new Set(['catfish', 'doby_mick', 'mako'])

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
  trophy_catches?: number[] | null
  prestige_levels?: Record<string, number> | null
  fishing_casts?: number | null
  fishing_double_catches?: number | null
  fishing_crates_opened?: number | null
  fishing_snags?: number | null
  fishing_jackpots?: number | null
  tide_run_beacons_smashed?: number | null
  tide_run_total_distance?: number | string | null
  is_premium?: boolean | null
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
  const maxCrewLevel = j.crew.reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  const hasLegendaryCrew = j.crew.some(c => !!c.slug && LEGENDARY_SLUGS.has(c.slug))
  const ownedLegendary = new Set(j.crew.map(c => c.slug).filter((s): s is string => !!s && LEGENDARY_SLUGS.has(s)))
  const hasAllThreeLegends = [...LEGENDARY_SLUGS].every(s => ownedLegendary.has(s))
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
    ancient_ones:   ((p.trophy_catches as number[] | null) ?? []).length >= 6,
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
    three_legends:  hasAllThreeLegends,
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
  'fishing_xp, expedition_xp, highest_perfect_streak, total_perfects, doubloons, crew_hall_tier, lifetime_recruits, highest_raid_damage, pvp_wins, puzzle_points, tide_run_best_distance, gauntlet_deepest, gauntlet_fathoms, trophy_catches, prestige_levels, fishing_casts, fishing_double_catches, fishing_crates_opened, fishing_snags, fishing_jackpots, tide_run_beacons_smashed, tide_run_total_distance, is_premium'
