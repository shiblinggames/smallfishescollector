import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BADGE_MAP, badgeReward, badgeDetail } from '@/lib/badges'
import { getLevelFromXP as fishLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import AchievementsClient, { type JourneyGroup, type JourneyGoal } from '@/app/(app)/achievements/AchievementsClient'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { reconcileBadges } from '@/app/(app)/achievements/badgeActions'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { hasPrestigedAllZones } from '@/lib/collection'
import { crewLevelFromXP, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { CREW_HALL_MAX_TIER } from '@/lib/crewHall'
import { DRILL_MAX_LEVEL, STORES_MAX_LEVEL, tierNumeral } from '@/lib/crewBunks'
import { netTraitStats, traitLabel } from '@/lib/crewEffects'
import { DEEP_TRAIT_MAX } from '@/lib/crewGen'
import { GAUNTLET_UPGRADES } from '@/lib/gauntletUpgrades'
import { FORGE_RECIPES, isForgedRaidItem, isAbyssalForgedItem, GAUNTLET2_BASE_ITEM_IDS, RAID_ITEMS, baseItemId } from '@/lib/raidItems'
import { finnItemLevel, FINN_ITEM_MAX_LEVEL } from '@/lib/finnItems'
import { raidItemSlotsForTier } from '@/lib/expeditions'
import { LEGENDARY_SLUGS_ALL, BASE_LEGENDARY_SLUGS, CONFLUENCE_COUNT, CHASE_SKIN_IDS, LEGENDARY_SKIN_SETS, CHALLENGE_RAID_IDS_ALL, SUNKEN_HAND_HULLS } from '@/lib/badgeConditions'
import { BUYABLE_ROD_TIERS } from '@/lib/rods'
import { SHIP_SKINS } from '@/lib/shipSkins'

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
const CHALLENGE_RAID_IDS = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']
const LEGENDARY_SLUGS = new Set(['catfish', 'doby_mick', 'mako'])

export default async function BadgesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile via the request-scoped cached loader (lib/userData.ts).
  // reconcileBadges runs first-class so any newly-met condition is granted on
  // visit (and its return is the authoritative unlocked list).
  const [profile, collectionRes, speciesRes, voyageCountRes, unlocked, raidComplRes, crewRes, rodRes, rarityRes, goldenRes] = await Promise.all([
    getCurrentProfile(),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
    admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'revealed'),
    reconcileBadges(),
    admin.from('raid_completions').select('raid_id, elapsed_ms').eq('user_id', user.id),
    admin.from('user_crew').select('xp, died_at, effects, cards(slug)').eq('user_id', user.id),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    // Global badge rarity (Steam-style % of players who've unlocked each badge).
    admin.rpc('get_badge_rarity'),
    // Lifetime goldens caught (one row per golden) — powers the golden badges.
    admin.from('shiny_catches').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  // ── Derive everything from existing data — no new columns ────────────────
  const has = (id: string) => unlocked.includes(id)
  const badgeRarity = new Map<string, number>(
    ((rarityRes.data ?? []) as { badge_id: string; pct: number }[]).map(r => [r.badge_id, r.pct]),
  )

  const raids = (raidComplRes.data ?? []) as { raid_id: string; elapsed_ms: number | null }[]
  const raidIds = new Set<string>(raids.map(r => r.raid_id))
  const fastestCorsairs = Math.min(Infinity, ...raids.filter(r => r.raid_id === 'corsairs_reckoning').map(r => r.elapsed_ms ?? Infinity))
  const crew = (crewRes.data ?? []) as unknown as { xp: number | null; died_at: string | null; cards: { slug: string | null } | null }[]
  const maxCrewLevel = crew.reduce((mx, c) => Math.max(mx, crewLevelFromXP(c.xp ?? 0)), 0)
  // Crew Hall / trait milestones (batch 31). Living crew only, matching
  // badgeConditions — a Divine hand lost on a voyage must not hold the badge up
  // from the graveyard, and the two surfaces have to agree or the bar and the
  // earned state disagree.
  const livingCrew = crew.filter(c => c.died_at == null)
  const maxedCrewCount = livingCrew.filter(c => crewLevelFromXP(c.xp ?? 0) >= CREW_MAX_LEVEL).length
  const crewTraits = livingCrew.map(c => netTraitStats((c as { effects?: string[] | null }).effects ?? null))
  const divineCrew = crewTraits.filter(t => traitLabel(t) === 'Divine').length
  const deepCutCrew = crewTraits.filter(t =>
    t.power === DEEP_TRAIT_MAX || t.dodge === DEEP_TRAIT_MAX || t.fortune === DEEP_TRAIT_MAX).length
  const drillLevel = Number(profile?.crew_drill_level ?? 1)
  const storesLevel = Number(profile?.crew_stores_level ?? 1)
  const ladderSteps = Math.min(drillLevel, DRILL_MAX_LEVEL) + Math.min(storesLevel, STORES_MAX_LEVEL)
  // cards.slug is Title_Case; the LEGENDARY sets are lowercase — normalise.
  const ownedCrewSlugsLc = crew.map(c => c.cards?.slug?.toLowerCase()).filter((s): s is string => !!s)
  const hasLegendaryCrew = ownedCrewSlugsLc.some(s => LEGENDARY_SLUGS.has(s))
  const hasLostCrew = crew.some(c => c.died_at != null)
  const challengeCleared = CHALLENGE_RAID_IDS.filter(id => raidIds.has(id)).length
  const challengeClearedAll = CHALLENGE_RAID_IDS_ALL.filter(id => raidIds.has(id)).length
  // Collection badges count LIFETIME distinct species (prestige-proof), unioned
  // with the current collection as a floor so the backfill can never undercount.
  const lifetimeSpeciesIds = new Set<number>([
    ...(((profile?.lifetime_species as number[] | null) ?? [])),
    ...((collectionRes.data ?? []) as { fish_id: number }[]).map(r => r.fish_id),
  ])
  const collectionCount = Math.max((collectionRes.data ?? []).length, lifetimeSpeciesIds.size)

  const crewHallTier = Number(profile?.crew_hall_tier ?? 0)
  const recruits = Number(profile?.lifetime_recruits ?? 0)
  const gauntletDeepest = Number(profile?.gauntlet_deepest ?? 0)
  const gauntletFathoms = Number(profile?.gauntlet_fathoms ?? 0)
  // pvpWins retired 2026-07-23 with the Broadsides section (PvP parked).
  const puzzlePoints = Number(profile?.puzzle_points ?? 0)
  const chartedLandmarks = ((profile?.charting_landmarks_claimed as number[] | null) ?? []).length
  const highestRaidDmg = Number(profile?.highest_raid_damage ?? 0)
  const parlorBestStreak = Number(profile?.parlor_best_streak ?? 0)
  const parlorPoints = Number(profile?.parlor_points ?? 0)
  const totalPerfects = Number(profile?.total_perfects ?? 0)
  const doubleCatches = Number(profile?.fishing_double_catches ?? 0)
  const casts = Number(profile?.fishing_casts ?? 0)
  const cratesOpened = Number(profile?.fishing_crates_opened ?? 0)
  const dailySweeps  = Number(profile?.daily_challenge_sweeps ?? 0)
  const masterCleared = Number(profile?.daily_master_cleared ?? 0)
  const bootyHauls   = Number(profile?.voyage_booty_hauls ?? 0)
  const snags = Number(profile?.fishing_snags ?? 0)
  const jackpots = Number(profile?.fishing_jackpots ?? 0)
  const beacons = Number(profile?.tide_run_beacons_smashed ?? 0)
  const tideTotal = Number(profile?.tide_run_total_distance ?? 0)
  const isPremium = !!profile?.is_premium
  const petsOwned = ((profile?.unlocked_pets as string[] | null) ?? []).length
  const shipTier = Number(profile?.ship_tier ?? 0)
  const trawlsCollected = Number(profile?.trawls_collected ?? 0)
  const hasSixthBerth = profile?.has_sixth_berth === true
  const hasArmoryExpansion = profile?.has_armory_expansion === true
  const ownedRodTiers = new Set(((rodRes.data ?? []) as { rod_tier: number }[]).map(r => r.rod_tier))
  const buyableRodsOwned = BUYABLE_ROD_TIERS.filter(t => ownedRodTiers.has(t)).length

  // ── 2026-07 expansion: Gauntlet counters + endgame state ─────────────────
  const gauntletRuns = Number(profile?.gauntlet_runs_completed ?? 0)
  const gauntletFathomsEarned = Number(profile?.gauntlet_fathoms_earned ?? 0)
  const gauntletMaxHit = Number(profile?.gauntlet_max_hit ?? 0)
  const gauntletDeepestDied = Number(profile?.gauntlet_deepest_died ?? 0)
  const gauntletHcDeepest = Number(profile?.gauntlet_hc_deepest ?? 0)
  const gauntletHcDeepestDied = Number(profile?.gauntlet_hc_deepest_died ?? 0)
  const bloodGemsEarned = Number(profile?.blood_gems_earned ?? 0)
  const rodEffectsCount = ((profile?.completionist_effects as number[] | null) ?? []).length
  const gauntletUpgrades = (profile?.gauntlet_upgrades as string[] | null) ?? []
  const confluencesSeen = ((profile?.gauntlet_confluences_seen as string[] | null) ?? []).length
  const shipClasses = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const hasMarkIII = Object.values(shipClasses).some(v => typeof v === 'string' && v.endsWith('_iii'))
  const raidItems = (profile?.raid_items as string[] | null) ?? []
  const hasForgedItem = raidItems.some(id => isForgedRaidItem(id))
  // Abyssal Forge + Don's Gauntlet (dormant until Don's launches).
  const abyssalOwned = raidItems.filter(id => isAbyssalForgedItem(id)).length
  const abyssalTotal = FORGE_RECIPES.filter(r => r.tier === 3).length
  const donsGauntletDeepest = Number(profile?.dons_gauntlet_deepest ?? 0)
  const shipSkinsOwned = (profile?.ship_skins as string[] | null) ?? []
  const ownsAllDonsItems = GAUNTLET2_BASE_ITEM_IDS.every(id => raidItems.includes(id))
  const forgeRecipesLearned = ((profile?.forge_recipes_learned as string[] | null) ?? []).length
  const hasUltimate = !!profile?.manowar_augment
  const fastestAnyRaid = Math.min(Infinity, ...raids.map(r => r.elapsed_ms ?? Infinity))
  const legendsOwnedAll = new Set(ownedCrewSlugsLc.filter(s => LEGENDARY_SLUGS_ALL.has(s))).size
  const baseLegendsOwned = new Set(ownedCrewSlugsLc.filter(s => BASE_LEGENDARY_SLUGS.has(s))).size
  // Crew skins (batches 17–18).
  const ownedSkins = new Set((profile?.owned_crew_skins as string[] | null) ?? [])
  const hasChaseSkin = [...ownedSkins].some(id => CHASE_SKIN_IDS.has(id))
  const maxWardrobe = LEGENDARY_SKIN_SETS.reduce((mx, set) => Math.max(mx, set.filter(id => ownedSkins.has(id)).length), 0)
  const equippedSkinCount = Object.keys((profile?.equipped_crew_skins as Record<string, string> | null) ?? {}).length

  const fishLevel = fishLevelFromXP(Number(profile?.fishing_xp ?? 0))
  const navLevel = navLevelFromXP(Number(profile?.expedition_xp ?? 0))

  const prestige = (profile?.prestige_levels as Record<string, number> | null) ?? {}
  const prestigedZones = ZONES.filter(z => (prestige[z] ?? 0) >= 1).length
  const totalStars = ZONES.reduce((s, z) => s + Math.min(5, prestige[z] ?? 0), 0)
  const topZonePrestige = Math.min(5, Math.max(0, ...ZONES.map(z => prestige[z] ?? 0)))
  const goldenCount = goldenRes.count ?? 0
  const finnWins = Number(profile?.finn_wins ?? 0)
  const fishSold = Number(profile?.fish_sold_doubloons ?? 0)
  const boatSkinsOwned = ((profile?.ship_skins as string[] | null) ?? []).length

  // ── The Sunken Hand + its two Primeval spoils ────────────────────────────
  // Mirrors lib/badgeConditions exactly; this page only draws the progress
  // bars, the grant itself is reconcileBadges'. Charge tags ("borrowed_jaw#4")
  // are stripped before matching, same as there.
  const clearedNodes = ((profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared) ?? []
  const spoilFree = (profile?.finn_spoil_free as string | null) ?? null
  const spoilPaid = (profile?.finn_spoil_paid as string | null) ?? null
  const berthsOpen = (spoilFree ? 1 : 0) + (spoilPaid ? 1 : 0)
  const ownsEye = profile?.has_anglers_patience === true
  const ownsMaw = raidItems.some(id => baseItemId(id) === 'borrowed_jaw')
  const spoilsOwned = (ownsEye ? 1 : 0) + (ownsMaw ? 1 : 0)
  const spoilTier = Math.max(
    ownsEye ? finnItemLevel(Number(profile?.anglers_patience_xp ?? 0)) : 0,
    ownsMaw ? finnItemLevel(Number(profile?.borrowed_jaw_xp ?? 0)) : 0,
  )
  const equippedItemIds = ((profile?.equipped_raid_items as string[] | null) ?? []).map(baseItemId)
  const finaleItemIds = new Set(RAID_ITEMS.filter(i => i.finaleSlotOnly).map(i => i.id))
  const mountFilled = (spoilFree === 'nav' || spoilPaid === 'nav') && equippedItemIds.some(id => finaleItemIds.has(id))
  const hullSlotsFilled = equippedItemIds.filter(id => !finaleItemIds.has(id)).length
  const hullSlotCap = raidItemSlotsForTier(shipTier) + (hasArmoryExpansion ? 1 : 0)
  const mountsFilled = Math.min(hullSlotsFilled, hullSlotCap) + (mountFilled ? 1 : 0)
  const handHullsOwned = SUNKEN_HAND_HULLS.filter(id => shipSkinsOwned.includes(id)).length
  const ownsAllBoatSkins = SHIP_SKINS.every(s => ((profile?.ship_skins as string[] | null) ?? []).includes(s.id))

  const ancientsCaught = ((profile?.ancient_catches as number[] | null) ?? []).length
  const trophySizeCatches = Number(profile?.trophy_size_catches ?? 0)

  const nonAncientIds = new Set(
    ((speciesRes.data ?? []) as { id: number; habitat: string }[])
      .filter(s => s.habitat !== 'ancient_deep')
      .map(s => s.id),
  )
  const collected = [...nonAncientIds].filter(id => lifetimeSpeciesIds.has(id)).length
  const speciesTotal = nonAncientIds.size || 134

  // Full Collection is normally granted by a hook the moment you land the last
  // species (fishing reelIn). If the collection completed some other way — a
  // catch that slipped the hook, or backfilled data — the badge stays out of
  // unlocked_badges, so the page offers a claim that claim_badge_reward can
  // never persist (it only pays UNLOCKED badges) and it reappears every visit.
  // reconcileBadges deliberately doesn't derive it, so self-heal it right here.
  // Prestige ≥1 in all four zones proves the whole non-ancient set was landed,
  // so it unlocks Full Collection even if wipes emptied the live count.
  const prestigedAll = hasPrestigedAllZones(prestige)
  if ((collected >= speciesTotal || prestigedAll) && !unlocked.includes('full_collection')) {
    await grantBadgeDirect(user.id, 'full_collection')
    unlocked.push('full_collection')
  }

  const voyagesDone = voyageCountRes.count ?? 0
  const streakBest = profile?.highest_perfect_streak ?? 0
  const tideBest = profile?.tide_run_best_distance ?? 0
  const doubloons = profile?.doubloons ?? 0
  const claimed = new Set<string>((profile?.claimed_badge_rewards as string[] | null) ?? [])

  // ── Goal builders ───────────────────────────────────────────────────────
  // Badge-backed goal: shows live progress AND flips to "earned" once the
  // badge is unlocked (badge = the cosmetic payoff for the pursuit). Carries
  // its difficulty + claimable doubloon reward + whether it's been claimed.
  function badgeGoal(
    badgeId: string, label: string, desc: string,
    current: number, target: number, href: string,
    opts: { binary?: boolean; record?: boolean } = {},
  ): JourneyGoal {
    const earned = has(badgeId) || (!opts.binary && current >= target)
    return {
      id: badgeId, label, desc, href,
      current: Math.min(current, target), target,
      done: earned,
      badgeImage: BADGE_MAP[badgeId]?.imageUrl,
      binary: !!opts.binary,
      record: !!opts.record,
      difficulty: BADGE_MAP[badgeId]?.difficulty,
      reward: badgeReward(badgeId),
      claimed: claimed.has(badgeId),
      detail: badgeDetail(badgeId),
      rarityPct: badgeRarity.get(badgeId),
    }
  }

  const groups: JourneyGroup[] = [
    {
      title: 'Fishing Mastery',
      flavor: 'The dial, the streaks, and the long road to a hundred.',
      accent: '#4ade80',
      goals: [
        badgeGoal('prestige_i', 'Prestige I', 'Reach Prestige in any fishing zone', totalStars > 0 ? 1 : 0, 1, '/fishing', { binary: true }),
        badgeGoal('trophy_catch', 'Trophy Catch', 'Land a Trophy-tier fish', has('trophy_catch') ? 1 : 0, 1, '/fishing', { binary: true }),
        badgeGoal('wet_behind_ears', 'Wet Behind the Ears', 'Reach Fishing Level 25', fishLevel, 25, '/fishing'),
        badgeGoal('old_hand', 'Old Hand', 'Reach Fishing Level 50', fishLevel, 50, '/fishing'),
        badgeGoal('master_angler', 'Master Angler', 'Reach Fishing Level 100', fishLevel, 100, '/fishing'),
        badgeGoal('unbroken', 'Unbroken', 'Land 10 perfect catches in a row', streakBest, 10, '/fishing'),
        badgeGoal('relentless', 'Relentless', 'Land 15 perfect catches in a row', streakBest, 15, '/fishing'),
        badgeGoal('untouchable', 'Untouchable', 'Land 20 perfect catches in a row', streakBest, 20, '/fishing'),
        badgeGoal('in_the_flow', 'In the Flow', 'Land 30 perfect catches in a row', streakBest, 30, '/fishing'),
        badgeGoal('sure_shot', 'Sure Shot', 'Land 250 perfect catches all-time', totalPerfects, 250, '/fishing'),
        badgeGoal('dead_eye', 'Dead-Eye', 'Land 1,000 perfect catches all-time', totalPerfects, 1000, '/fishing'),
        badgeGoal('crack_shot', 'Crack Shot', 'Land 2,500 perfect catches all-time', totalPerfects, 2500, '/fishing'),
        badgeGoal('eagle_eyed', 'Eagle-Eyed', 'Land 5,000 perfect catches all-time', totalPerfects, 5000, '/fishing'),
        badgeGoal('full_tackle_box', 'Full Tackle Box', 'Own every rod money can buy', buyableRodsOwned, BUYABLE_ROD_TIERS.length, '/marketplace/tackle-shop'),
        badgeGoal('zone_legend', 'Zone Legend', 'Reach Prestige in all 4 zones', prestigedZones, 4, '/fishing'),
        badgeGoal('high_water_mark', 'High Water Mark', 'Reach Max Prestige in any fishing zone', topZonePrestige, 5, '/fishing'),
        badgeGoal('prestige_stars', 'Prestige Stars', 'Earn all 20 prestige stars (5 per zone)', totalStars, 20, '/fishing'),
        badgeGoal('completionist_rod', 'The Completionist', 'Claim the Completionist Rod', has('completionist_rod') ? 1 : 0, 1, '/marketplace/tackle-shop', { binary: true }),
        badgeGoal('fully_rigged', 'Fully Rigged', 'Forge all 3 effects into the Completionist Rod', rodEffectsCount, 3, '/fishing'),
        badgeGoal('reforged', 'Reforged', 'Pay to re-forge the rod into a fresh 3-effect loadout', has('reforged') ? 1 : 0, 1, '/fishing', { binary: true }),
      ],
    },
    {
      title: 'Fishing Feats',
      flavor: 'The strange and stubborn things that happen out on the water.',
      accent: '#34d399',
      goals: [
        // Goldens — the rarest catch (one row per golden in shiny_catches).
        badgeGoal('struck_gold', 'Struck Gold', 'Catch your first golden fish', goldenCount, 1, '/fishing', { binary: true }),
        badgeGoal('hoard_of_gold', 'Hoard of Gold', 'Catch 10 golden fish', goldenCount, 10, '/fishing'),
        badgeGoal('el_dorado', 'El Dorado', 'Catch 25 golden fish', goldenCount, 25, '/fishing'),
        // Finn — the roaming rival's perfect/speed challenges out on the water.
        badgeGoal('one_upped', 'One-Upped', 'Win a challenge against Finn', finnWins, 1, '/fishing', { binary: true }),
        badgeGoal('finns_rival', "Finn's Rival", 'Win 10 challenges against Finn', finnWins, 10, '/fishing'),
        badgeGoal('the_better_angler', 'The Better Angler', 'Win 25 challenges against Finn', finnWins, 25, '/fishing'),
        // Fish sold — lifetime doubloons hauled in at market.
        badgeGoal('fishmonger', 'Fishmonger', 'Sell 250,000 doubloons of fish', fishSold, 250_000, '/fishing'),
        badgeGoal('fish_baron', 'Fish Baron', 'Sell 1,000,000 doubloons of fish', fishSold, 1_000_000, '/fishing'),
        // Doubles + snags + pets + crates.
        badgeGoal('got_away', 'The One That Got Away', 'Lose 50 fish to snapped lines', snags, 50, '/fishing'),
        badgeGoal('two_for_the_pot', 'Two for the Pot', 'Reel in a double catch', doubleCatches, 1, '/fishing', { binary: true }),
        badgeGoal('two_fisted', 'Two-Fisted', 'Land 100 double catches', doubleCatches, 100, '/fishing'),
        badgeGoal('twice_the_haul', 'Twice the Haul', 'Land 500 double catches', doubleCatches, 500, '/fishing'),
        badgeGoal('saltlung', 'Saltlung', 'Cast your line 1,000 times', casts, 1000, '/fishing'),
        badgeGoal('salted_through', 'Salted Through', 'Cast your line 10,000 times', casts, 10_000, '/fishing'),
        badgeGoal('crate_digger', 'Crate Digger', 'Open 50 supply crates', cratesOpened, 50, '/fishing'),
        badgeGoal('beginners_luck', "Beginner's Luck", 'Open your first supply crate', cratesOpened, 1, '/fishing', { binary: true }),
        badgeGoal('crate_expectations', 'Crate Expectations', 'Open 250 supply crates', cratesOpened, 250, '/fishing'),
        badgeGoal('wreck_diver', 'Wreck Diver', 'Open 500 supply crates', cratesOpened, 500, '/fishing'),
        badgeGoal('salvage_rights', 'Salvage Rights', 'Open 1,000 supply crates', cratesOpened, 1000, '/fishing'),
        badgeGoal('three_for_three', 'Three for Three', 'Clear all three daily challenges, 7 times', dailySweeps, 7, '/fishing'),
        badgeGoal('standing_watch', 'Standing Watch', 'Clear all three daily challenges, 30 times', dailySweeps, 30, '/fishing'),
        badgeGoal('old_reliable', 'Old Reliable', 'Clear all three daily challenges, 100 times', dailySweeps, 100, '/fishing'),
        badgeGoal('the_fourth_task', 'The Fourth Task', 'Clear 25 Master daily challenges', masterCleared, 25, '/fishing'),
        badgeGoal('massive_booty', 'Massive Booty', 'Land a Massive Booty on a voyage', bootyHauls, 1, '/expeditions', { binary: true }),
        badgeGoal('reel_lucky', 'Reel Lucky', 'Hit a fishing jackpot', jackpots, 1, '/fishing', { binary: true }),
        badgeGoal('friend_at_sea', 'A Friend at Sea', 'Earn your first fishing pet', petsOwned, 1, '/fishing', { binary: true }),
        badgeGoal('full_stringer', 'Full Stringer', 'Keep 3 fishing pets at once', petsOwned, 3, '/fishing'),
        badgeGoal('menagerie', 'The Menagerie', 'Keep 5 fishing pets at once', petsOwned, 5, '/fishing'),
      ],
    },
    {
      title: 'The Collection',
      flavor: 'Every fin the sea keeps, catalogued in your logbook.',
      accent: '#60a5fa',
      goals: [
        badgeGoal('half_the_sea', 'Half the Sea', 'Catch 50 fish species', collectionCount, 50, '/fishing'),
        badgeGoal('hundred_fins', 'A Hundred Fins', 'Catch 100 fish species', collectionCount, 100, '/fishing'),
        badgeGoal('ancient_ones', 'Ancient Ones', 'Catch all 6 Ancient Deep giants', ancientsCaught, 6, '/fishing'),
        badgeGoal('a_real_keeper', 'A Real Keeper', 'Land 10 Trophy-size catches', trophySizeCatches, 10, '/fishing'),
        badgeGoal('trophy_hunter', 'Trophy Hunter', 'Land 25 Trophy-size catches', trophySizeCatches, 25, '/fishing'),
        badgeGoal('full_collection', 'Full Collection', `Catch every fish species (${prestigedAll ? speciesTotal : collected}/${speciesTotal})`, prestigedAll ? speciesTotal : collected, speciesTotal, '/fishing'),
      ],
    },
    {
      title: 'Crew',
      flavor: 'The souls who sail with you, and the colors they fly.',
      accent: '#5ec8e8',
      goals: [
        badgeGoal('growing_crew', 'Growing Crew', 'Recruit 25 crew', recruits, 25, '/crew'),
        badgeGoal('theres_a_grave', "There's a Grave?", 'Lose a crew member for the first time', hasLostCrew ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('legendary_recruit', 'Legendary Recruit', 'Recruit a legendary crew', hasLegendaryCrew ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('three_legends', 'The Three Legends', 'Own 3 legendary crew at once', legendsOwnedAll, 3, '/crew'),
        badgeGoal('six_legends', 'The Avengers', 'Own all 5 base legendary crew', baseLegendsOwned, BASE_LEGENDARY_SLUGS.size, '/crew'),
        // Target 5, not CREW_HALL_MAX_TIER. The condition has always been
        // tier 5 (the Hall of Legends, which the description names); when the
        // ladder grew a sixth tier for the bunks the BAR started targeting 6,
        // so everyone holding this badge saw it sitting at 5/6, earned but
        // apparently unfinished. Leviathan Hall below is the tier-6 badge.
        badgeGoal('crewmaster', 'Crewmaster', 'Reach the Hall of Legends', Math.min(crewHallTier, 5), 5, '/crew'),
        badgeGoal('leviathan_hall', 'Leviathan Hall', 'Build the hall to its final tier', crewHallTier, CREW_HALL_MAX_TIER, '/crew'),
        badgeGoal('fully_outfitted', 'Fully Outfitted', `Buy Drills ${tierNumeral(DRILL_MAX_LEVEL)} and Stores ${tierNumeral(STORES_MAX_LEVEL)}`, ladderSteps, DRILL_MAX_LEVEL + STORES_MAX_LEVEL, '/crew'),
        badgeGoal('full_muster', 'Full Muster', 'Recruit 100 crew', recruits, 100, '/crew'),
        badgeGoal('old_salt', 'Old Salt', 'Level a crew to 100', maxCrewLevel, CREW_MAX_LEVEL, '/crew'),
        badgeGoal('full_complement', 'Full Complement', 'Level 10 crew to 100', maxedCrewCount, 10, '/crew'),
        badgeGoal('deep_cut', 'Deep Cut', `Carry a trait with a stat at ${DEEP_TRAIT_MAX}`, deepCutCrew >= 1 ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('divine_hand', 'Divine Hand', 'Cut a crew a Divine trait', divineCrew >= 1 ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('six_divine', 'Choir of the Deep', 'Hold 6 Divine crew at once', divineCrew, 6, '/crew'),
        badgeGoal('colors_raised', 'Colors Raised', 'Own your first crew skin', ownedSkins.size >= 1 ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('the_chase', 'The Chase', 'Own a chase skin', hasChaseSkin ? 1 : 0, 1, '/crew', { binary: true }),
        badgeGoal('fashionista', 'Fashionista', 'Have a skin equipped on 5 crew at once', equippedSkinCount, 5, '/crew'),
        badgeGoal('full_wardrobe', 'Full Wardrobe', 'Own all 4 skins for one legendary crew', maxWardrobe, 4, '/crew'),
        badgeGoal('dressed_to_the_nines', 'Dressed to the Nines', 'Own 10 crew skins', ownedSkins.size, 10, '/crew'),
      ],
    },
    {
      title: 'Expeditions & Combat',
      flavor: 'Voyages logged, broadsides answered.',
      accent: '#c8704a',
      goals: [
        badgeGoal('navigator', 'Wayfinder', 'Reach Navigation Level 50', navLevel, 50, '/expeditions'),
        badgeGoal('maiden_voyage', 'Maiden Voyage', 'Complete your first voyage', voyagesDone, 1, '/expeditions', { binary: true }),
        badgeGoal('old_sea_dog', 'Old Sea Dog', 'Complete 50 voyages', voyagesDone, 50, '/expeditions'),
        badgeGoal('fleet_admiral', 'Fleet Admiral', 'Complete 100 voyages', voyagesDone, 100, '/expeditions'),
        badgeGoal('opening_salvo', 'Opening Salvo', 'Land a single raid hit for 50+', highestRaidDmg, 50, '/raids'),
        badgeGoal('hard_hitter', 'Hard Hitter', 'Land a single raid hit for 100+', highestRaidDmg, 100, '/raids'),
        badgeGoal('heavy_broadside', 'Heavy Broadside', 'Land a single raid hit for 250+', highestRaidDmg, 250, '/raids'),
        badgeGoal('overkill', 'Overkill', 'Land a single raid hit for 500+', highestRaidDmg, 500, '/raids'),
        badgeGoal('swift_reckoning', 'Swift Reckoning', "Clear Corsair's Reckoning in under 1:30", fastestCorsairs <= 90_000 ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('corsairs_bane', "Corsair's Bane", 'Defeat Barnacle Pete in challenge mode', raidIds.has('corsairs_reckoning_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('ghost_ship', "Krust's Crutch", 'Defeat Captain Krust in challenge mode', raidIds.has('captain_krust_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('cartographers_fall', "The Cartographer's Fall", 'Defeat the Cartographer in challenge mode', raidIds.has('cartographer_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('toll_paid', 'Toll Paid', 'Defeat Tollmaster Spet in challenge mode', raidIds.has('tollmasters_cut_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('master_navigator', 'Master Navigator', 'Reach Navigation Level 100', navLevel, 100, '/expeditions'),
        badgeGoal('finndicates_bane', "Finndicate's Bane", 'Clear all 4 raids in challenge mode', challengeCleared, 4, '/raids'),
        badgeGoal('ruse_undone', 'Ruse Undone', 'Defeat Admiral Ruse in challenge mode', raidIds.has('coffers_fleet_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('account_settled', 'Account Settled', 'Defeat the Quartermaster in challenge mode', raidIds.has('the_quartermaster_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('blockade_broken', 'Blockade Broken', 'Defeat Sal Brackwater in challenge mode', raidIds.has('the_blockade_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('don_drowned', 'The Don Is Drowned', 'Defeat Don Finleone in challenge mode', raidIds.has('the_throne_challenge') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('the_sunken_hand', 'The Sunken Hand', 'Clear all 8 raids in challenge mode', challengeClearedAll, 8, '/raids'),
        badgeGoal('quick_draw', 'Quick Draw', 'Clear any raid in under 1:00', fastestAnyRaid <= 60_000 ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('mark_of_mastery', 'Mark of Mastery', 'Reach a Mark III ship class', hasMarkIII ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('ship_of_the_line', 'Ship of the Line', 'Own the Man-o-War', shipTier, 6, '/shipyard', { binary: true }),
        badgeGoal('fresh_coat', 'Fresh Coat', 'Own a boat skin', boatSkinsOwned, 1, '/expeditions'),
        badgeGoal('full_drydock', 'Full Drydock', `Own every boat skin (${boatSkinsOwned}/${SHIP_SKINS.length})`, ownsAllBoatSkins ? SHIP_SKINS.length : boatSkinsOwned, SHIP_SKINS.length, '/expeditions'),
        badgeGoal('six_aboard', 'Six Aboard', 'Add the Sixth Berth to your ship', hasSixthBerth ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('expanded_armory', 'Expanded Armory', 'Bolt on the Expanded Armory mount', hasArmoryExpansion ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('weapon_of_legend', 'Weapon of Legend', 'Build your Man-o-War ultimate', hasUltimate ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('first_fusion', 'First Fusion', 'Forge your first item', hasForgedItem ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('grand_forgemaster', 'Grand Forgemaster', 'Learn every forge recipe', forgeRecipesLearned, FORGE_RECIPES.length, '/expeditions'),
        badgeGoal('complete_captain', 'The Complete Captain', 'Reach Navigation 100 and Fishing 100', (fishLevel >= 100 && navLevel >= 100) ? 1 : 0, 1, '/expeditions', { binary: true }),
        // Challenge-run feats — hook-granted at the moment they happen.
        badgeGoal('all_hands_legends', 'All Hands, All Legends', 'Raid in the Man-o-War with 5 Level 100 legendary crew', has('all_hands_legends') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('not_a_shot_fired', 'Not a Shot Fired', 'Sink a boss without a shot or crew ability', has('not_a_shot_fired') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('iron_ruse', 'Iron Ruse', 'Beat the Admiral Ruse raid taking no damage', has('iron_ruse') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('tight_quarters', 'Tight Quarters', 'Beat the Quartermaster raid using no crew abilities', has('tight_quarters') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('dead_reckoning', 'Dead Reckoning', 'Clear the Cartographer raid missing no critical hits', has('dead_reckoning') ? 1 : 0, 1, '/raids', { binary: true }),
      ],
    },
    {
      // SPOILER RULE: nothing in this group may name the captain behind the
      // Hand or suggest the Hand is a person. The Captain's Log is read long
      // before the raid is.
      title: 'The Sunken Hand',
      flavor: 'The last name on the board, and the wreck it left behind.',
      accent: '#e0455a',
      goals: [
        badgeGoal('one_last_ride', 'One Last Ride', 'Clear The Sunken Hand', raidIds.has('the_sunken_hand') ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('cut_off_at_the_wrist', 'Cut Off at the Wrist', 'Clear The Sunken Hand on Challenge', raidIds.has('the_sunken_hand_challenge') ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('the_long_quiet', 'The Long Quiet', 'See the Sunken Hand through to its end', clearedNodes.includes('the_long_quiet') ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('ancient_tackle', 'Ancient Tackle', 'Earn your first Ancient-rarity item', spoilsOwned >= 1 ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('salvors_claim', "Salvor's Claim", 'Open a berth from the wreck', berthsOpen, 1, '/expeditions'),
        badgeGoal('both_hands', 'Both Hands', 'Open both berths from the wreck', berthsOpen, 2, '/expeditions'),
      ],
    },
    {
      title: 'The Primeval Spoils',
      flavor: 'What the wreck gave up, and the long road to waking it.',
      accent: '#e0455a',
      goals: [
        badgeGoal('something_old', 'Something Old', 'Carry your first Primeval spoil', spoilsOwned, 1, '/expeditions'),
        badgeGoal('both_in_hand', 'Both in Hand', 'Own both Primeval spoils', spoilsOwned, 2, '/expeditions'),
        badgeGoal('waking_it', 'Waking It', 'Take a Primeval spoil to Tier III', spoilTier, 3, '/expeditions'),
        badgeGoal('fully_attuned', 'Fully Attuned', 'Take a Primeval spoil to Tier VI', spoilTier, FINN_ITEM_MAX_LEVEL, '/expeditions'),
        badgeGoal('the_sixth_mount', 'The Sixth Mount', 'Sail with all six item slots filled', mountsFilled, 6, '/expeditions'),
        badgeGoal('colours_of_the_hand', 'Colours of the Hand', 'Own all three hulls off The Sunken Hand', handHullsOwned, SUNKEN_HAND_HULLS.length, '/expeditions'),
      ],
    },
    {
      title: 'The Gauntlet',
      flavor: 'How deep you dared, and what you carried back up.',
      accent: '#a06ff2',
      goals: [
        badgeGoal('first_descent', 'First Descent', 'Cash out a Gauntlet run', gauntletDeepest >= 1 ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('into_the_deep', 'Into the Deep', 'Descend to depth 5 in the Gauntlet', gauntletDeepest, 5, '/raids/gauntlet'),
        badgeGoal('davy_jones', "Davy Jones' Locker", 'Descend to depth 10 in the Gauntlet', gauntletDeepest, 10, '/raids/gauntlet'),
        badgeGoal('abyssward', 'Abyssward', 'Descend to depth 20 in the Gauntlet', gauntletDeepest, 20, '/raids/gauntlet'),
        badgeGoal('forge_worthy', 'Forge-Worthy', 'Descend to depth 35 in the Gauntlet', gauntletDeepest, 35, '/raids/gauntlet'),
        badgeGoal('davys_doorstep', "Davy's Doorstep", 'Descend to depth 60 in the Gauntlet', gauntletDeepest, 60, '/raids/gauntlet'),
        badgeGoal('well_provisioned', 'Well-Provisioned', 'Claim your first Gauntlet upgrade', gauntletUpgrades.length, 1, '/raids/gauntlet'),
        badgeGoal('locker_raider', 'Locker Raider', 'Claim 6 Gauntlet upgrades', gauntletUpgrades.length, 6, '/raids/gauntlet'),
        badgeGoal('forge_awakened', 'The Forge Awakens', 'Unlock the Forge from the Gauntlet', gauntletUpgrades.includes('forge') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('master_of_the_locker', 'Master of the Locker', 'Own every Gauntlet upgrade', gauntletUpgrades.length, GAUNTLET_UPGRADES.length, '/raids/gauntlet'),
        badgeGoal('push_your_luck', 'Push Your Luck', 'Complete 10 Gauntlet runs', gauntletRuns, 10, '/raids/gauntlet'),
        badgeGoal('again_and_again', 'Again and Again', 'Complete 50 Gauntlet runs', gauntletRuns, 50, '/raids/gauntlet'),
        badgeGoal('fathomless', 'Fathomless', 'Bank 500 Fathoms all-time', gauntletFathoms, 500, '/raids/gauntlet'),
        badgeGoal('fathom_hoarder', 'Fathom Hoarder', 'Earn 1,000 Fathoms all-time', gauntletFathomsEarned, 1000, '/raids/gauntlet'),
        badgeGoal('one_shot', 'One Shot', 'Land a single Gauntlet hit for 2,000+', gauntletMaxHit, 2000, '/raids/gauntlet', { record: true }),
        badgeGoal('greeds_price', "Greed's Price", 'Die deeper than your best cash-out', gauntletDeepestDied > gauntletDeepest ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('storm_reader', 'Storm Reader', 'Discover your first confluence', confluencesSeen, 1, '/raids/gauntlet'),
        badgeGoal('deep_cartographer', 'Deep Cartographer', 'Discover every confluence', confluencesSeen, CONFLUENCE_COUNT, '/raids/gauntlet'),
      ],
    },
    {
      title: 'Hardcore Gauntlet',
      flavor: 'The Drowned Ledger keeps its own accounts. In ink you cannot buy back.',
      accent: '#e0555a',
      goals: [
        badgeGoal('drowned_ledger', 'The Drowned Ledger', 'Cash out a Hardcore Gauntlet run', gauntletHcDeepest >= 1 ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('the_unsinkable', 'The Unsinkable', 'Reach depth 15 in the Hardcore Gauntlet', gauntletHcDeepest, 15, '/raids/gauntlet'),
        badgeGoal('locker_bound', 'Locker-Bound', 'Reach depth 25 in the Hardcore Gauntlet', gauntletHcDeepest, 25, '/raids/gauntlet'),
        badgeGoal('the_deep_end', 'The Deep End', 'Reach depth 50 in the Hardcore Gauntlet', gauntletHcDeepest, 50, '/raids/gauntlet'),
        badgeGoal('ferrymans_toll', "The Ferryman's Toll", 'Lose a squad to the Locker in Hardcore', gauntletHcDeepestDied >= 1 ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('ink_and_salt', 'Ink and Salt', 'Cash out from depth 10 with 5+ Pressure', has('ink_and_salt') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('the_weight', 'The Weight', 'Cash out from depth 20 with 15+ Pressure', has('the_weight') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('crushing_depth', 'Crushing Depth', 'Cash out from depth 30 with 25+ Pressure', has('crushing_depth') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('not_a_drop', 'Not a Drop', 'Cash out from depth 20 under Iron Rations II', has('not_a_drop') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('paid_in_full', 'Paid in Full', 'Cash out from depth 35 with 40+ Pressure', has('paid_in_full') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('for_glory_alone', 'For Glory Alone', 'Cash out from depth 15 with every term signed', has('for_glory_alone') ? 1 : 0, 1, '/raids/gauntlet', { binary: true }),
        badgeGoal('blood_charged', 'Blood-Charged', 'Boost a recruit reroll with Blood Gems', has('blood_charged') ? 1 : 0, 1, '/crew?tab=recruits', { binary: true }),
        badgeGoal('blood_rich', 'Blood-Rich', 'Earn 500 Blood Gems all-time', bloodGemsEarned, 500, '/raids/gauntlet'),
        badgeGoal('bloodhoard', 'Bloodhoard', 'Earn 2,000 Blood Gems all-time', bloodGemsEarned, 2000, '/raids/gauntlet'),
        badgeGoal('crimson_fortune', 'Crimson Fortune', 'Win a crew skin from the blood gamble', has('crimson_fortune') ? 1 : 0, 1, '/crew?tab=wardrobe', { binary: true }),
      ],
    },
    {
      title: "Don's Gauntlet",
      flavor: 'The green takes it, past the last sounding on any chart.',
      accent: '#3fbf82',
      goals: [
        badgeGoal('dons_descent', 'The Green Beckons', "Cash out a Don's Gauntlet run", donsGauntletDeepest >= 1 ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('dons_doorstep', "The Don's Doorstep", "Descend to depth 50 in Don's Gauntlet", donsGauntletDeepest, 50, '/raids'),
        badgeGoal('dons_reckoning', "The Don's Reckoning", "Descend to depth 75 in Don's Gauntlet", donsGauntletDeepest, 75, '/raids'),
        badgeGoal('dons_ghost_hull_won', 'Ghost of the Court', "Earn the Don's Ghost Hull from Don's Gauntlet", shipSkinsOwned.includes('dons_ghost_hull') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('first_convergence', 'The Convergence', "Forge a convergence in Don's Gauntlet", has('first_convergence') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('one_true_shot', 'One True Shot', 'Land a single Gauntlet hit for 4,000+', gauntletMaxHit, 4000, '/raids/gauntlet', { record: true }),
      ],
    },
    {
      title: 'The Abyssal Forge',
      flavor: 'The deepest forge, and the feats that flatter the ghost fleet.',
      accent: '#9d7bff',
      goals: [
        badgeGoal('abyssal_smith', 'The Abyssal Forge', 'Forge your first tier-3 Abyssal item', has('abyssal_smith') || abyssalOwned >= 1 ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('abyssal_master', 'Abyssal Master', 'Forge every Abyssal item', abyssalOwned, abyssalTotal, '/expeditions'),
        badgeGoal('ghost_armory', 'The Ghost Armory', "Own all three Don's Gauntlet items", ownsAllDonsItems ? 1 : 0, 1, '/expeditions', { binary: true }),
        badgeGoal('ultimate_only', 'The Long Reload', "Reach depth 10 in Don's Gauntlet firing only your Mega", has('ultimate_only') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('weight_of_green', 'The Weight of the Green', "Bank from depth 30 carrying 5+ curses", has('weight_of_green') ? 1 : 0, 1, '/raids', { binary: true }),
        badgeGoal('untouched', 'Untouched', "Bank a Don's Gauntlet run from depth 5 without taking a hit", has('untouched') ? 1 : 0, 1, '/raids', { binary: true }),
      ],
    },
    // Broadsides (PvP) section PARKED 2026-07-23 — restore with the feature.
    // {
    //   title: 'Broadsides',
    //   flavor: 'Captain against captain, gun against gun.',
    //   accent: '#f87171',
    //   goals: [
    //     badgeGoal('first_blood', 'First Blood', 'Win a ship duel', pvpWins, 1, '/expeditions'),
    //     badgeGoal('brawler', 'Broadside Brawler', 'Win 10 ship duels', pvpWins, 10, '/expeditions'),
    //     badgeGoal('duelist', 'Duelist', 'Win 25 ship duels', pvpWins, 25, '/expeditions'),
    //   ],
    // },
    {
      title: 'The Chart Room',
      flavor: 'For the thinkers among the deckhands.',
      accent: '#c4a96a',
      goals: [
        badgeGoal('landfall', 'Landfall', 'Chart your first World Chart landmark', chartedLandmarks >= 1 ? 1 : 0, 1, '/charting/world-chart', { binary: true }),
        badgeGoal('quartermaster', 'Quartermaster', 'Bank 40 charting points', puzzlePoints, 40, '/tavern/chart-room'),
        badgeGoal('den_magnate', 'Chartwright', 'Bank 80 charting points', puzzlePoints, 80, '/tavern/chart-room'),
        badgeGoal('uncharted_no_more', 'Uncharted No More', 'Chart seven World Chart landmarks', chartedLandmarks, 7, '/charting/world-chart'),
        badgeGoal('fully_laden', 'Fully Laden', 'Solve a Man-o-War hold (the hardest sudoku)', has('fully_laden') ? 1 : 0, 1, '/tavern/chart-room/hold', { binary: true }),
        badgeGoal('the_long_watch', 'The Long Watch', 'Bank 500 charting points', puzzlePoints, 500, '/tavern/chart-room'),
        badgeGoal('clean_manifest', 'Clean Manifest', 'Stow all four holds in a single week', has('clean_manifest') ? 1 : 0, 1, '/tavern/chart-room/hold', { binary: true }),
        badgeGoal('master_cartographer', 'Master Cartographer', 'Chart the entire World Chart (all 13 landmarks)', chartedLandmarks, 13, '/charting/world-chart'),
      ],
    },
    {
      title: 'The Parlor',
      flavor: 'Wit, wagers, and a ladder to the Pirate King.',
      accent: '#d98ae0',
      goals: [
        badgeGoal('throne_in_sight', 'Throne in Sight', 'Reach rung 7 of the Pirate King ladder', has('throne_in_sight') ? 1 : 0, 1, '/tavern/trivia/king', { binary: true }),
        badgeGoal('crowned', 'Crowned', 'Make it all the way up the Pirate King ladder', has('crowned') ? 1 : 0, 1, '/tavern/trivia/king', { binary: true }),
        badgeGoal('clean_sweep', 'Clean Sweep', "Clear a Captain's Board, every answer correct", has('clean_sweep') ? 1 : 0, 1, '/tavern/trivia/board', { binary: true }),
        badgeGoal('parlor_hot_hand', 'Hot Hand', 'Answer 5 Parlor questions in a row', parlorBestStreak, 5, '/tavern/trivia'),
        badgeGoal('parlor_sharpshooter', 'Sharpshooter', 'Answer 10 Parlor questions in a row', parlorBestStreak, 10, '/tavern/trivia'),
        badgeGoal('parlor_flawless', 'Flawless', 'Answer 20 Parlor questions in a row', parlorBestStreak, 20, '/tavern/trivia'),
        badgeGoal('parlor_cardsharp', 'Cardsharp', 'Reach the Cardsharp rank (85 pts)', parlorPoints, 85, '/tavern/trivia'),
        badgeGoal('parlor_kingpin', 'Kingpin', 'Reach the Kingpin rank (520 pts)', parlorPoints, 520, '/tavern/trivia'),
        badgeGoal('parlor_legend', 'Parlor Legend', 'Reach the top Parlor rank (1,000 pts)', parlorPoints, 1000, '/tavern/trivia'),
      ],
    },
    {
      title: 'Trawling',
      flavor: 'Nets down, patience up.',
      accent: '#4fb8a0',
      goals: [
        badgeGoal('first_haul', 'First Haul', 'Collect your first trawl', trawlsCollected, 1, '/fishing', { binary: true }),
        badgeGoal('steady_nets', 'Steady Nets', 'Collect 25 trawls', trawlsCollected, 25, '/fishing'),
        badgeGoal('deep_trawler', 'Deep Trawler', 'Collect 100 trawls', trawlsCollected, 100, '/fishing'),
        badgeGoal('net_positive', 'Net Positive', 'Collect 500 trawls', trawlsCollected, 500, '/fishing'),
      ],
    },
    {
      title: 'The Den & Records',
      flavor: 'Luck, chips, and the tide at your back.',
      accent: '#f0c040',
      goals: [
        badgeGoal('catfish_jackpot', 'Catfish Jackpot', 'Win the slots Catfish Jackpot', has('catfish_jackpot') ? 1 : 0, 1, '/tavern', { binary: true }),
        badgeGoal('unstoppable', 'Unstoppable', 'Win 5 blackjack hands in a row', has('unstoppable') ? 1 : 0, 1, '/tavern/blackjack', { binary: true }),
        badgeGoal('stacked_deck', 'Stacked Deck', 'Dealer pulls blackjack two hands running', has('stacked_deck') ? 1 : 0, 1, '/tavern/blackjack', { binary: true }),
        badgeGoal('called_it', 'Called It', 'Win a straight-up single-number roulette bet', has('called_it') ? 1 : 0, 1, '/tavern/roulette', { binary: true }),
        badgeGoal('tide_runner', 'Tide Runner', 'Reach 300m in a single Tide Run', tideBest, 300, '/tavern/tide-run', { record: true }),
        badgeGoal('tide_champion', 'Tide Champion', 'Reach 500m in a single Tide Run', tideBest, 500, '/tavern/tide-run', { record: true }),
        badgeGoal('tide_master', 'Tide Master', 'Reach 750m in a single Tide Run', tideBest, 750, '/tavern/tide-run', { record: true }),
        badgeGoal('beacon_breaker', 'Beacon Breaker', 'Smash 500 beacons across all Tide Runs', beacons, 500, '/tavern/tide-run'),
        badgeGoal('wrecking_crew', 'Wrecking Crew', 'Smash 2,000 beacons across all Tide Runs', beacons, 2000, '/tavern/tide-run'),
        badgeGoal('long_haul', 'The Long Haul', 'Swim 100,000m total across Tide Runs', tideTotal, 100_000, '/tavern/tide-run'),
      ],
    },
    {
      title: 'Wealth',
      flavor: 'A hold heavy enough to make the ship sit low.',
      accent: '#a78bfa',
      goals: [
        badgeGoal('baby_steps', 'Baby Steps', 'Hold 100,000 doubloons at once', doubloons, 100_000, '/fishing'),
        badgeGoal('deep_pockets', 'Deep Pockets', 'Hold 1,000,000 doubloons at once', doubloons, 1_000_000, '/fishing'),
        badgeGoal('bilge_baron', 'Bilge Baron', 'Hold 2,500,000 doubloons at once', doubloons, 2_500_000, '/fishing'),
      ],
    },
    {
      title: 'Captain',
      flavor: 'For those who keep this whole ship afloat.',
      accent: '#e6b94a',
      goals: [
        badgeGoal('captains_colors', "Captain's Colors", 'Become a Captain', isPremium ? 1 : 0, 1, '/profile', { binary: true }),
      ],
    },
  ]

  const allGoals = groups.flatMap(g => g.goals)
  const doneCount = allGoals.filter(g => g.done).length

  return (
    <>
      <main className="min-h-screen pt-8" style={{ position: 'relative', zIndex: 1 }}>
        <div className="px-6 max-w-2xl mx-auto pb-16">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>Badges</h1>
            {/* Story moved out of here — a quiet link back to the Captain's Log. */}
            <Link href="/achievements" className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Captain&apos;s Log →
            </Link>
          </div>

          <AchievementsClient groups={groups} doneCount={doneCount} totalCount={allGoals.length} />
        </div>
      </main>
    </>
  )
}
