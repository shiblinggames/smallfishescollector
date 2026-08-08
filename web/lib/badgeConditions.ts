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
import { DRILL_MAX_LEVEL, STORES_MAX_LEVEL } from './crewBunks'
import { netTraitStats, traitLabel } from './crewEffects'
import { DEEP_TRAIT_MAX } from './crewGen'
import { GAUNTLET_UPGRADES } from './gauntletUpgrades'
import { FORGE_RECIPES, isForgedRaidItem, isAbyssalForgedItem, GAUNTLET2_BASE_ITEM_IDS, RAID_ITEMS, baseItemId } from './raidItems'
import { finnItemLevel, FINN_ITEM_MAX_LEVEL } from './finnItems'
import { raidItemSlotsForTier } from './expeditions'
import { CREW_SKINS } from './crewSkins'
import { BUYABLE_ROD_TIERS } from './rods'
import { SHIP_SKINS } from './shipSkins'

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
// Every raid's challenge id, chapters I-IV (The Sunken Hand capstone). Add each
// new raid's challenge id here as chapters ship.
export const CHALLENGE_RAID_IDS_ALL = [
  ...CHALLENGE_RAID_IDS,
  'coffers_fleet_challenge',      // Raid 5 — Admiral Ruse
  'the_quartermaster_challenge',  // Raid 6 — the Quartermaster
  'the_blockade_challenge',       // Raid 7 — Sal Brackwater
  'the_throne_challenge',         // Raid 8 — Don Finleone
]
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
// 19 Davy (untagged) + 11 Don's ('don'-tagged) = 30 as of 2026-07-23. Discovery is
// shared across both gauntlets, so "discover every confluence" spans both.
export const CONFLUENCE_COUNT = 30
// The three hulls The Sunken Hand can drop (ids are historical — two were
// renamed to Tundra Hull / Volcanic Hull when their art landed).
export const SUNKEN_HAND_HULLS = ['sunken_hand_hull', 'drowned_giant_hull', 'last_cast_hull']

export interface BadgeProfileFields {
  fishing_xp?: number | null
  expedition_xp?: number | null
  highest_perfect_streak?: number | null
  total_perfects?: number | null
  doubloons?: number | null
  crew_hall_tier?: number | null
  crew_drill_level?: number | null
  crew_stores_level?: number | null
  lifetime_recruits?: number | null
  highest_raid_damage?: number | null
  parlor_best_streak?: number | null
  parlor_points?: number | null
  pvp_wins?: number | null
  puzzle_points?: number | null
  charting_landmarks_claimed?: number[] | null
  tide_run_best_distance?: number | string | null
  gauntlet_deepest?: number | null
  gauntlet_fathoms?: number | null
  ancient_catches?: number[] | null   // the ≤6 Ancient Deep giants (Megalodon etc.)
  trophy_size_catches?: number | null  // lifetime count of Trophy-SIZE catches
  prestige_levels?: Record<string, number> | null
  finn_wins?: number | null
  fish_sold_doubloons?: number | null
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
  completionist_effects?: number[] | null
  manowar_augment?: string | null
  ship_classes?: Record<string, string> | null
  forge_recipes_learned?: string[] | null
  raid_items?: string[] | null
  ship_skins?: string[] | null
  owned_crew_skins?: string[] | null
  equipped_crew_skins?: Record<string, string> | null
  // Chapter IV ship refits.
  has_sixth_berth?: boolean | null
  has_armory_expansion?: boolean | null
  // ── The Sunken Hand finale + its two Primeval spoils ──
  raid_node_progress?: { cleared?: string[] } | null
  equipped_raid_items?: string[] | null
  finn_spoil_free?: string | null
  finn_spoil_paid?: string | null
  has_anglers_patience?: boolean | null
  anglers_patience_xp?: number | null
  borrowed_jaw_xp?: number | null
  daily_challenge_sweeps?: number | null
  voyage_booty_hauls?: number | null
  daily_master_cleared?: number | null
  // Don's Gauntlet (dormant until live).
  dons_gauntlet_deepest?: number | null
  // Lifetime distinct species ever caught — auto-maintained count, immune to
  // prestige wipes (see prestigeZone). Powers the collection badges so
  // prestiging never sets back Half the Sea / A Hundred Fins.
  lifetime_species_count?: number | null
  // ── Bounties ── the board is overwritten every morning, so its history only
  // exists in these. Bumped in claimBounty alongside the gem grant.
  bounties_claimed?: number | null
  bounty_gems_earned?: number | null
  bounty_boards_cleared?: number | null
  bounty_elites_claimed?: number | null
}

export interface BadgeJoinData {
  raids: { raid_id: string; elapsed_ms: number | null }[]
  crew: { xp: number | null; died_at: string | null; slug: string | null; effects?: string[] | null }[]
  voyageCount: number       // revealed daily_voyages
  collectionCount: number   // lifetime distinct species (prestige-proof)
  rodTiers: number[]        // rod_inventory rod_tier values (owned rods)
  goldenCount: number       // shiny_catches rows (lifetime goldens caught)
  /** Aggregated exchange_bets. A durable log, so the Exchange badges need
   *  no counters of their own the way the bounty ones do. */
  exchange: {
    opened: number
    settled: number       // reached a terminal status, either way
    won: number           // paid back more than it cost
    closedEarly: number
    worthless: number     // expired paying nothing at all
    /** The most any single contract paid ABOVE its stake. Payout alone is not
     *  an achievement: 250,000 back on a 250,000 stake is your money returned. */
    bestProfit: number
    staked: number        // lifetime, settled contracts only
    returned: number      // lifetime, settled contracts only
  }
}

/** One row of exchange_bets, as the badges need it. */
export type ExchangePositionRow = { status: string; stake: number | null; payout: number | null }

/** A captain who has never touched the Exchange. */
export const NO_EXCHANGE: BadgeJoinData['exchange'] = {
  opened: 0, settled: 0, won: 0, closedEarly: 0, worthless: 0,
  bestProfit: 0, staked: 0, returned: 0,
}

/** Fold a captain's contracts into the six numbers the badges ask about.
 *
 *  Shared because three separate paths build BadgeJoinData (the achievement
 *  leaderboard, the cached per-user score, and the badges page), and six
 *  definitions of "won" living in three files is how they drift. */
export function exchangeStatsFrom(rows: ExchangePositionRow[]): BadgeJoinData['exchange'] {
  const out = { ...NO_EXCHANGE }
  for (const r of rows) {
    out.opened++
    if (r.status === 'open') continue
    out.settled++
    const payout = Number(r.payout ?? 0)
    const stake = Number(r.stake ?? 0)
    if (payout > stake) out.won++
    // BOTH WORDS, and it matters. The old board called an early exit
    // 'closed_early'; the rebuilt one calls it 'sold'. Reading only the old one
    // would have quietly retired "Out Before the Bell" the day the new board
    // shipped -- a badge nobody could earn and nobody would report.
    if (r.status === 'closed_early' || r.status === 'sold') out.closedEarly++
    // Worthless means it ran to expiry and paid NOTHING. A contract sold early
    // for less than it cost was a decision, not a wipeout.
    else if (payout <= 0) out.worthless++
    out.staked += stake
    out.returned += payout
    if (payout - stake > out.bestProfit) out.bestProfit = payout - stake
  }
  return out
}

/** Map of badge id → whether its derivable condition is met. */
export function badgeConditions(p: BadgeProfileFields, j: BadgeJoinData): Record<string, boolean> {
  const raidIds = new Set<string>(j.raids.map(r => r.raid_id))
  const fastestCorsairs = Math.min(Infinity, ...j.raids.filter(r => r.raid_id === 'corsairs_reckoning').map(r => r.elapsed_ms ?? Infinity))
  const fastestAnyRaid = Math.min(Infinity, ...j.raids.map(r => r.elapsed_ms ?? Infinity))
  const maxCrewLevel = j.crew.reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  const livingCrew = j.crew.filter(c => c.died_at == null)
  const maxedCrew = livingCrew.filter(c => crewLevelFromXP(c.xp ?? 0) >= CREW_MAX_LEVEL).length
  // Trait milestones. Living crew only: a Divine hand lost on a voyage should
  // not keep propping up a badge from the graveyard.
  const crewTraits = livingCrew.map(c => netTraitStats(c.effects ?? null))
  const divineCrew = crewTraits.filter(t => traitLabel(t) === 'Divine').length
  const deepCutCrew = crewTraits.filter(t =>
    t.power === DEEP_TRAIT_MAX || t.dodge === DEEP_TRAIT_MAX || t.fortune === DEEP_TRAIT_MAX).length
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
  // ── The Sunken Hand's two Primeval spoils ──────────────────────────────────
  // The Eye is a FISHING special (its own boolean); the Maw is a raid item, so
  // it lives in raid_items. Charged ids carry their tier as "borrowed_jaw#4",
  // so strip the tag before matching or an upgraded Maw stops being recognised.
  const ownsEye = p.has_anglers_patience === true
  const ownsMaw = raidItems.some(id => baseItemId(id) === 'borrowed_jaw')
  // Highest tier reached on a spoil the player ACTUALLY holds — a leftover xp
  // value from an item since lost is not a tier they can show off.
  const spoilTier = Math.max(
    ownsEye ? finnItemLevel(Number(p.anglers_patience_xp ?? 0)) : 0,
    ownsMaw ? finnItemLevel(Number(p.borrowed_jaw_xp ?? 0)) : 0,
  )
  // The wreck's mount sits BESIDE the hull slots rather than inside them, so
  // "all six filled" is every hull slot plus the mount. Mirrors the split in
  // getRaidPlayerStats; class item-slots are none in production, so hull tier
  // plus the Expanded Armory refit is the whole cap.
  const equippedIds = (p.equipped_raid_items ?? []).map(baseItemId)
  const finaleIds = new Set(RAID_ITEMS.filter(i => i.finaleSlotOnly).map(i => i.id))
  const hasMountBerth = p.finn_spoil_free === 'nav' || p.finn_spoil_paid === 'nav'
  const mountFilled = hasMountBerth && equippedIds.some(id => finaleIds.has(id))
  const normalEquipped = equippedIds.filter(id => !finaleIds.has(id)).length
  const hullSlots = raidItemSlotsForTier(Number(p.ship_tier ?? 0)) + (p.has_armory_expansion === true ? 1 : 0)
  const fishLvl = fishLevelFromXP(Number(p.fishing_xp ?? 0))
  const hasLostCrew = j.crew.some(c => c.died_at != null)
  const prestige = p.prestige_levels ?? {}
  const totalStars = PRESTIGE_ZONES.reduce((s, z) => s + Math.min(5, prestige[z] ?? 0), 0)
  const navLevel = navLevelFromXP(Number(p.expedition_xp ?? 0))
  const streak = Number(p.highest_perfect_streak ?? 0)
  const raidDmg = Number(p.highest_raid_damage ?? 0)
  const parlorStreak = Number(p.parlor_best_streak ?? 0)   // best consecutive-correct run
  const parlorPoints = Number(p.parlor_points ?? 0)         // accumulated Parlor rank points
  // pvpWins retired 2026-07-23 with the Broadsides badges (PvP parked).
  const doubloons = Number(p.doubloons ?? 0)
  const tideBest = Number(p.tide_run_best_distance ?? 0)
  const puzzlePoints = Number(p.puzzle_points ?? 0)
  const chartedLandmarks = ((p.charting_landmarks_claimed as number[] | null) ?? []).length
  const recruits = Number(p.lifetime_recruits ?? 0)
  // Crew skins owned / equipped (for the skin badges).
  const ownedSkins = new Set(p.owned_crew_skins ?? [])
  const equippedSkinCount = Object.keys(p.equipped_crew_skins ?? {}).length
  const ancientsCaught = ((p.ancient_catches as number[] | null) ?? []).length
  const ownedRodTiers = new Set(j.rodTiers)

  return {
    master_angler:  fishLevelFromXP(Number(p.fishing_xp ?? 0)) >= 100,
    navigator:      navLevel >= 50,
    master_navigator: navLevel >= 100,
    unbroken:       streak >= 10,
    relentless:     streak >= 15,
    untouchable:    streak >= 20,
    // The Parlor (trivia) — hard streaks + rank milestones. Thresholds mirror
    // PARLOR_RANKS point gates (Cardsharp 85, Kingpin 520, Parlor Legend 1000);
    // hardcoded to avoid importing the heavy trivia constants here.
    parlor_hot_hand:     parlorStreak >= 5,
    parlor_sharpshooter: parlorStreak >= 10,
    parlor_flawless:     parlorStreak >= 20,
    parlor_cardsharp:    parlorPoints >= 85,
    parlor_kingpin:      parlorPoints >= 520,
    parlor_legend:       parlorPoints >= 1000,
    dead_eye:       Number(p.total_perfects ?? 0) >= 1000,
    half_the_sea:   j.collectionCount >= 50,
    baby_steps:     doubloons >= 100_000,
    deep_pockets:   doubloons >= 1_000_000,
    bilge_baron:    doubloons >= 2_500_000,
    prestige_i:     PRESTIGE_ZONES.some(z => (prestige[z] ?? 0) >= 1),
    zone_legend:    PRESTIGE_ZONES.every(z => (prestige[z] ?? 0) >= 1),
    prestige_stars: totalStars >= 20,
    // Completionist Rod: the claim + a paid re-forge are hook-granted; Fully
    // Rigged derives off the forged loadout (only non-empty once you own it).
    fully_rigged:   ((p.completionist_effects as number[] | null)?.length ?? 0) >= 3,
    ancient_ones:   ancientsCaught >= 6,
    // Pinned to 5, NOT CREW_HALL_MAX_TIER. The ladder grew to 6 for the
    // hall's bunks, and following the max would have silently un-earned this for
    // everyone already holding it. Its own description names the Hall of
    // Legends, which is tier 5, so 5 is what it has always meant.
    crewmaster:     Number(p.crew_hall_tier ?? 0) >= 5,
    // The hall grew a sixth tier for the bunks, so reaching the TOP is its own
    // badge rather than a silent redefinition of Crewmaster (see the note
    // above: following the max would have un-earned that one for everybody).
    leviathan_hall: Number(p.crew_hall_tier ?? 0) >= CREW_HALL_MAX_TIER,
    fully_outfitted: Number(p.crew_drill_level ?? 1) >= DRILL_MAX_LEVEL
                  && Number(p.crew_stores_level ?? 1) >= STORES_MAX_LEVEL,
    // A 4 in any stat can only come from the Leviathan bunk: the recruit table
    // stops at 3, so carrying one is proof of the top hall rather than luck.
    deep_cut:       deepCutCrew >= 1,
    divine_hand:    divineCrew >= 1,
    six_divine:     divineCrew >= 6,
    full_complement: maxedCrew >= 10,
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
    // Broadsides (PvP) PARKED 2026-07-23 — reconcile no longer grants these, so
    // they can't come back after the SQL wipe. Restore with the feature (pvp_wins
    // data is preserved, so re-enabling will re-grant past winners).
    // first_blood:    pvpWins >= 1,
    // brawler:        pvpWins >= 10,
    // duelist:        pvpWins >= 25,
    quartermaster:  puzzlePoints >= 40,
    den_magnate:    puzzlePoints >= 80,   // "Chartwright" (display name); condition unchanged
    the_long_watch: puzzlePoints >= 500,
    landfall:          chartedLandmarks >= 1,
    uncharted_no_more: chartedLandmarks >= 7,
    master_cartographer: chartedLandmarks >= 13,
    tide_runner:    tideBest >= 300,
    tide_champion:  tideBest >= 450,
    tide_master:    tideBest >= 600,
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
    // ── 2026-07 fishing expansion (24 badges) ──
    // Rookie
    wet_behind_ears: fishLvl >= 25,
    beginners_luck: Number(p.fishing_crates_opened ?? 0) >= 1,
    struck_gold:    j.goldenCount >= 1,
    // Seasoned
    old_hand:       fishLvl >= 50,
    crate_expectations: Number(p.fishing_crates_opened ?? 0) >= 250,
    a_real_keeper:  Number(p.trophy_size_catches ?? 0) >= 10,
    full_stringer:  (p.unlocked_pets ?? []).length >= 3,
    one_upped:      Number(p.finn_wins ?? 0) >= 1,
    fresh_coat:     (p.ship_skins ?? []).length >= 1,
    // Veteran
    twice_the_haul: Number(p.fishing_double_catches ?? 0) >= 500,
    menagerie:      (p.unlocked_pets ?? []).length >= 5,
    fishmonger:     Number(p.fish_sold_doubloons ?? 0) >= 250_000,
    net_positive:   Number(p.trawls_collected ?? 0) >= 500,
    // Master
    crack_shot:     Number(p.total_perfects ?? 0) >= 2500,
    wreck_diver:    Number(p.fishing_crates_opened ?? 0) >= 500,
    // Days on which all three daily challenges were claimed. Counter is bumped
    // by the sweep grant in fishing/dailyChallengeActions.ts.
    three_for_three: Number(p.daily_challenge_sweeps ?? 0) >= 7,
    standing_watch:  Number(p.daily_challenge_sweeps ?? 0) >= 30,
    old_reliable:    Number(p.daily_challenge_sweeps ?? 0) >= 100,
    // The 1-in-100 voyage haul, and the optional Lv-75 daily challenge.
    massive_booty:   Number(p.voyage_booty_hauls ?? 0) >= 1,
    the_fourth_task: Number(p.daily_master_cleared ?? 0) >= 25,
    salvage_rights: Number(p.fishing_crates_opened ?? 0) >= 1000,
    high_water_mark: PRESTIGE_ZONES.some(z => (prestige[z] ?? 0) >= 5),
    fish_baron:     Number(p.fish_sold_doubloons ?? 0) >= 1_000_000,
    hoard_of_gold:  j.goldenCount >= 10,
    finns_rival:    Number(p.finn_wins ?? 0) >= 10,
    // Grandmaster
    in_the_flow:    streak >= 30,
    eagle_eyed:     Number(p.total_perfects ?? 0) >= 5000,
    el_dorado:      j.goldenCount >= 25,
    the_better_angler: Number(p.finn_wins ?? 0) >= 25,
    full_drydock:   SHIP_SKINS.every(s => (p.ship_skins ?? []).includes(s.id)),
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
    // ── Chapter IV: the Sunken Hand (challenge clears + ship refits) ──
    blockade_broken: raidIds.has('the_blockade_challenge'),
    don_drowned:     raidIds.has('the_throne_challenge'),
    the_sunken_hand: CHALLENGE_RAID_IDS_ALL.every(id => raidIds.has(id)),
    six_aboard:      p.has_sixth_berth === true,
    expanded_armory: p.has_armory_expansion === true,
    // Own every purchasable rod (Bamboo starter + earned-only Completionist excluded).
    full_tackle_box: BUYABLE_ROD_TIERS.every(t => ownedRodTiers.has(t)),
    // ── The Abyssal Forge + Don's Gauntlet (added ahead of Don's go-live, so
    //    these sit dormant until that content is reachable). ──
    abyssal_smith:   raidItems.some(id => isAbyssalForgedItem(id)),
    abyssal_master:  raidItems.filter(id => isAbyssalForgedItem(id)).length >= FORGE_RECIPES.filter(r => r.tier === 3).length,
    ghost_armory:    GAUNTLET2_BASE_ITEM_IDS.every(id => raidItems.includes(id)),
    one_true_shot:   Number(p.gauntlet_max_hit ?? 0) >= 4000,
    dons_descent:    Number(p.dons_gauntlet_deepest ?? 0) >= 1,
    dons_doorstep:   Number(p.dons_gauntlet_deepest ?? 0) >= 50,
    dons_reckoning:  Number(p.dons_gauntlet_deepest ?? 0) >= 75,
    dons_ghost_hull_won: (p.ship_skins ?? []).includes('dons_ghost_hull'),
    // ── The Sunken Hand finale ──
    // The raid ids are the CONFIG ids (the_sunken_hand / _challenge), not the
    // raid-map node ids (one_last_ride) the story uses. raid_completions stores
    // the former; keying off the node id here would silently never fire.
    one_last_ride:        raidIds.has('the_sunken_hand'),
    cut_off_at_the_wrist: raidIds.has('the_sunken_hand_challenge'),
    the_long_quiet:       (p.raid_node_progress?.cleared ?? []).includes('the_long_quiet'),
    // A berth is a spoils SLOT opened at the wreck; the item that fills it is a
    // separate drop. finn_spoil_free is the one you pick, _paid the one you buy.
    salvors_claim:        !!p.finn_spoil_free || !!p.finn_spoil_paid,
    both_hands:           !!p.finn_spoil_free && !!p.finn_spoil_paid,
    // ── The Primeval Spoils ──
    // Ancient rarity is exactly these two today, so ancient_tackle and
    // something_old currently fire together. Kept separate deliberately:
    // ancient_tackle is written against the RARITY so it keeps meaning if more
    // Ancient items ever ship.
    ancient_tackle:       ownsEye || ownsMaw,
    something_old:        ownsEye || ownsMaw,
    both_in_hand:         ownsEye && ownsMaw,

    // ── The Exchange ──
    first_contract:       j.exchange.opened >= 1,
    first_settle:         j.exchange.won >= 1,
    cut_losses:           j.exchange.closedEarly >= 1,
    // Deliberately earned by LOSING. A contract that ends at nothing is the
    // thing the whole board is built around, and pretending otherwise would be
    // the one dishonest badge in the set.
    worthless:            j.exchange.worthless >= 1,
    // PROFIT, not payout. 250,000 back on a 250,000 stake is your own money.
    big_score:            j.exchange.bestProfit >= 200_000,
    // WINS, not contracts. Counting settlements made this a rich badge rather
    // than a hard one: the smallest contract is 500, so a captain sitting on
    // millions could settle a hundred for pocket change. A win has to clear the
    // break-even move, which lands on roughly a third of contracts, so a
    // hundred of them is nearer three hundred opened and every one of those had
    // real doubloons on it.
    market_maker:         j.exchange.won >= 100,

    // ── Bounties ──
    first_bounty:         Number(p.bounties_claimed ?? 0) >= 1,
    full_board:           Number(p.bounty_boards_cleared ?? 0) >= 1,
    elite_order:          Number(p.bounty_elites_claimed ?? 0) >= 1,
    fifty_orders:         Number(p.bounties_claimed ?? 0) >= 50,
    seven_boards:         Number(p.bounty_boards_cleared ?? 0) >= 7,
    bounty_hoard:         Number(p.bounty_gems_earned ?? 0) >= 5_000,
    // Tier is charge XP against FINN_ITEM_THRESHOLDS, and only counts on a
    // spoil actually owned — an orphan xp value from a since-lost item is not a
    // tier. Either spoil qualifies; the badge asks for one taken far, not both.
    waking_it:            spoilTier >= 3,
    fully_attuned:        spoilTier >= FINN_ITEM_MAX_LEVEL,
    // Every hull slot full AND the wreck's mount filled beside them. The mount
    // is not a general slot (see getRaidPlayerStats): it exists only with the
    // nav berth and only takes that berth's item, so it is counted separately.
    the_sixth_mount:      mountFilled && normalEquipped >= hullSlots && normalEquipped + 1 >= 6,
    colours_of_the_hand:  SUNKEN_HAND_HULLS.every(id => (p.ship_skins ?? []).includes(id)),
    // first_convergence / ultimate_only / weight_of_green / untouched are HOOKS
    // (GauntletGame draft + cashOutGauntlet) — not derivable, so not listed here.
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
  'fishing_xp, expedition_xp, highest_perfect_streak, total_perfects, doubloons, crew_hall_tier, crew_drill_level, crew_stores_level, lifetime_recruits, highest_raid_damage, pvp_wins, puzzle_points, charting_landmarks_claimed, tide_run_best_distance, gauntlet_deepest, gauntlet_fathoms, ancient_catches, trophy_size_catches, prestige_levels, finn_wins, fish_sold_doubloons, fishing_casts, fishing_double_catches, fishing_crates_opened, fishing_snags, fishing_jackpots, tide_run_beacons_smashed, tide_run_total_distance, is_premium, ship_tier, trawls_collected, unlocked_pets, gauntlet_upgrades, gauntlet_confluences_seen, gauntlet_runs_completed, gauntlet_fathoms_earned, gauntlet_max_hit, gauntlet_deepest_died, gauntlet_hc_deepest, gauntlet_hc_deepest_died, blood_gems_earned, completionist_effects, manowar_augment, ship_classes, forge_recipes_learned, raid_items, ship_skins, owned_crew_skins, equipped_crew_skins, has_sixth_berth, has_armory_expansion, dons_gauntlet_deepest, parlor_best_streak, parlor_points, lifetime_species_count, raid_node_progress, equipped_raid_items, finn_spoil_free, finn_spoil_paid, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, daily_challenge_sweeps, voyage_booty_hauls, daily_master_cleared, bounties_claimed, bounty_boards_cleared, bounty_elites_claimed, bounty_gems_earned'

// EVERY FIELD A CONDITION READS MUST BE LISTED ABOVE. A missing column does not
// error: the field comes back undefined, `?? 0` turns it into zero, and the
// badge simply never unlocks for anyone, forever, in silence. The six bounty
// badges shipped that way. If you add a condition that reads a new profile
// column, add the column here in the same commit.
