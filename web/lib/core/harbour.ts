// ── THE HARBOUR, CORE (Steam prep, 2026-09-29) ──
//
// The shops ashore and the reads that describe a captain's gear, with nothing
// of the web in them: the tackle shop (bait, rods bought and sold, reels, the
// Completionist, the rod in hand), the hook bench, the fish hold (its upgrade
// and what is in it), the Shipyard's hulls and name, the Angler's Almanac, and
// the Shipyard's and ship screen's state. Each takes the store (HarbourData)
// and the captain's id. On the web the server actions check the session and
// hand these the Supabase store (and keep their page revalidations); offline,
// the local save's.
//
// EVERY PURCHASE SPENDS FIRST. The debit is the guard (taken in place or not
// at all), and a tier then rises only from the tier read, so two taps cannot
// buy one rung twice; the loser gets its coin back.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; table reads and guarded writes became store operations; the clock is
// the game's.

import { clockNow } from '@/lib/clock'
import { BAITS } from '@/lib/bait'
import { RODS, isCaptainRod, ROD_SELL_RATE } from '@/lib/rods'
import { REELS } from '@/lib/reels'
import { HOOKS } from '@/lib/hooks'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'
import { nextShip, MIN_SHIP_TIER } from '@/lib/ships'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { fishingGearLevelReq, navLevelReqForShip } from '@/lib/gearGating'
import { completionistProgress, completionistBlocker } from '@/lib/completionist'
import { isPremiumActive } from '@/lib/premium'
import { canSail } from '@/lib/seaAccess'
import { unlockedCosmetics } from '@/lib/cosmeticUnlocks'
import { vigilFor, type VigilState } from '@/lib/ancientVigil'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { settleUltimateBuildVia } from '@/lib/ultimateBuild'
import { parseAbyssalConversion } from '@/lib/abyssalAccelerator'
import { getCrewRoster, type CrewMember } from '@/lib/core/crew'
import { stintDone, storesCapHours } from '@/lib/crewBunks'
import type { HarbourData } from '@/lib/data/harbourData'
import { distinctIds } from '@/lib/listCounts'

const nowIso = () => new Date(clockNow()).toISOString()

/** Raise a tier column by one, only from the value read (null read as null). */
function tierGuard(col: string, read: unknown) {
  return [read == null ? { col, is: null as null } : { col, eq: read }]
}

// ══ THE TACKLE SHOP ═══════════════════════════════════════════════════════════

export async function buyBait(db: HarbourData, uid: string, baitType: string, qty: number): Promise<{ doubloons: number; newQty: number } | { error: string }> {
  // AN EXACT MATCH, not getBait: getBait falls back to worms for a type it does
  // not know, so a made-up name was sold at the worm price and stocked under
  // that made-up name. (None were ever bought; checked 2026-09-29.)
  const bait = BAITS.find(b => b.type === baitType)
  if (!bait || bait.shopCost <= 0) return { error: 'Not for sale' }
  if (!Number.isInteger(qty) || qty <= 0) return { error: 'Invalid quantity' }

  const profile = await db.profile(uid, 'doubloons')
  if (!profile) return { error: 'Profile not found' }

  const totalCost = bait.shopCost * qty
  if (Number(profile.doubloons) < totalCost) return { error: `Need ${totalCost.toLocaleString()} ⟡` }

  // Atomic debit first (balance-guarded) so parallel buys of two bait types
  // can't both settle against one balance.
  const newDoubloons = await db.deductDoubloons(uid, totalCost)
  if (newDoubloons == null) return { error: `Need ${totalCost.toLocaleString()} ⟡` }

  // Added in place, so a cast spending this bait meanwhile is not undone.
  await db.addBait(uid, baitType, qty)
  const newQty = (await db.baitRows(uid)).find(r => r.bait_type === baitType)?.quantity ?? qty
  await db.ledger(uid, -totalCost, `Bought ${qty}× ${bait.name}`)
  return { doubloons: newDoubloons, newQty }
}

export async function purchaseRod(db: HarbourData, uid: string, rodTier: number): Promise<{ doubloons: number; ownedRods: number[] } | { error: string }> {
  const rod = RODS.find(r => r.tier === rodTier)
  if (!rod) return { error: 'Invalid rod' }
  if (rod.cost === 0 || rod.earnedOnly) return { error: 'This rod cannot be purchased' }
  // NOT SOLD ASHORE. Enforced here as well as hidden from the list, because a
  // hidden row is a UI decision and this is a rule.
  if (rod.traderOnly) return { error: 'No chandler ashore carries that. You will have to find one who does.' }

  const [profile, rods] = await Promise.all([db.profile(uid, 'doubloons, fishing_xp, is_premium, premium_expires_at'), db.rodTiers(uid)])
  if (!profile) return { error: 'Profile not found' }
  if (rods.includes(rodTier)) return { error: 'Already owned' }
  if (isCaptainRod(rod) && !isPremiumActive(profile as Parameters<typeof isPremiumActive>[0])) return { error: `The ${rod.name} is a Captain's rod. Become a Captain to wield it.` }
  const levelReq = fishingGearLevelReq(rod)
  if (getLevelFromXP(Number(profile.fishing_xp ?? 0)) < levelReq) return { error: `Reach Fishing Lv ${levelReq} to buy the ${rod.name}` }
  if (Number(profile.doubloons) < rod.cost) return { error: `Need ${rod.cost.toLocaleString()} ⟡` }

  // Atomic debit FIRST, guarded on the live balance.
  const newDoubloons = await db.deductDoubloons(uid, rod.cost)
  if (newDoubloons == null) return { error: `Need ${rod.cost.toLocaleString()} ⟡` }

  // A concurrent twin can land the same rod first; this call's charge then
  // goes back rather than paying twice.
  if (!(await db.addRod(uid, rodTier))) {
    await db.grant(uid, 'doubloons', rod.cost)
    return { error: 'Already owned' }
  }
  await db.ledger(uid, -rod.cost, `Bought ${rod.name}`)
  return { doubloons: newDoubloons, ownedRods: await db.rodTiers(uid) }
}

/** Sell a rod back for ROD_SELL_RATE of its price. Selling the rod in hand
 *  puts the free Bamboo back in hand, so nobody is left without one. */
export async function sellRod(db: HarbourData, uid: string, rodTier: number): Promise<{ doubloons: number; ownedRods: number[]; refund: number; rodTier: number } | { error: string }> {
  const rod = RODS.find(r => r.tier === rodTier)
  if (!rod) return { error: 'Invalid rod' }
  // Free and earned rods cost nothing to obtain, so there is nothing to refund.
  if (rod.cost === 0 || rod.earnedOnly) return { error: 'This rod cannot be sold' }

  const [profile, rods] = await Promise.all([db.profile(uid, 'doubloons, rod_tier'), db.rodTiers(uid)])
  if (!profile) return { error: 'Profile not found' }
  if (!rods.includes(rodTier)) return { error: "You don't own this rod" }

  const wasEquipped = profile.rod_tier === rodTier
  const newRodTier = wasEquipped ? 0 : Number(profile.rod_tier)
  const refund = Math.floor(rod.cost * ROD_SELL_RATE)

  // REMOVE THE ROD FIRST, and pay only if this call removed it.
  if (!(await db.takeRod(uid, rodTier))) return { error: "You don't own this rod" }

  const [newDoubloons] = await Promise.all([
    db.grant(uid, 'doubloons', refund),
    // Back to the Bamboo only if the sold rod is still the one in hand.
    wasEquipped ? db.updateProfileIf(uid, { rod_tier: 0 }, [{ col: 'rod_tier', eq: rodTier }]) : null,
    db.ledger(uid, refund, `Sold ${rod.name}`),
  ])
  return { doubloons: newDoubloons, ownedRods: await db.rodTiers(uid), refund, rodTier: newRodTier }
}

/** The Completionist: the fishing half's capstone rod, claimed once the whole
 *  of it is done (the log, the people and the map). lib/completionist is both
 *  the gate and the shop's bars, so the two cannot disagree. */
export async function claimCompletionistRod(db: HarbourData, uid: string): Promise<{ ownedRods: number[] } | { error: string }> {
  const COMPLETIONIST_TIER = 14
  const [profile, rods, liveIds, species, rapport, isles] = await Promise.all([
    db.profile(uid, 'fishing_xp, ancient_catches, lifetime_species, prestige_levels'),
    db.rodTiers(uid),
    db.collectionIds(uid),
    db.speciesList(),
    db.rapportRows(uid),
    db.discoveries(uid),
  ])
  if (!profile) return { error: 'Profile not found' }
  if (rods.includes(COMPLETIONIST_TIER)) return { error: 'Already owned' }

  const progress = completionistProgress({
    level: getLevelFromXP(Number(profile.fishing_xp ?? 0)),
    allSpecies: species.map(s => ({ id: s.id as number, habitat: s.habitat as string })),
    lifetime: profile.lifetime_species as number[] | null,
    liveIds,
    ancientCatches: profile.ancient_catches as number[] | null,
    prestige: profile.prestige_levels as Record<string, number> | null,
    rapport: rapport.map(r => ({ folk_id: r.folk_id, points: r.points })),
    isles: isles.map(isle_id => ({ isle_id })),
  })
  if (!progress.eligible) return { error: completionistBlocker(progress) ?? 'Not yet' }

  await db.addRod(uid, COMPLETIONIST_TIER)
  // The Completionist badge, granted at the moment of claim (rod ownership is
  // not a profile column, so it cannot be derived).
  await db.grantBadge(uid, 'completionist_rod')
  return { ownedRods: await db.rodTiers(uid) }
}

/** Put a rod in hand from the tackle shop. The Bamboo (tier 0) is always yours. */
export async function equipTackleRod(db: HarbourData, uid: string, rodTier: number): Promise<{ rodTier: number } | { error: string }> {
  const rod = RODS[rodTier]
  if (!rod) return { error: 'Invalid rod' }
  if (rodTier !== 0 && !(await db.rodTiers(uid)).includes(rodTier)) return { error: 'Rod not owned' }
  await db.updateProfile(uid, { rod_tier: rodTier })
  return { rodTier }
}

export async function buyReel(db: HarbourData, uid: string): Promise<{ reelTier: number; doubloons: number } | { error: string }> {
  const profile = await db.profile(uid, 'reel_tier, doubloons, fishing_xp')
  if (!profile) return { error: 'Profile not found' }

  const currentTier = Number(profile.reel_tier ?? 0)
  const nextTier = currentTier + 1
  if (nextTier >= REELS.length) return { error: 'Already at max tier' }

  const cost = REELS[nextTier].cost
  const reelReq = fishingGearLevelReq(REELS[nextTier])
  if (getLevelFromXP(Number(profile.fishing_xp ?? 0)) < reelReq) return { error: `Reach Fishing Lv ${reelReq} to buy the ${REELS[nextTier].name}` }
  const newDoubloons = await db.spend(uid, 'doubloons', cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  if (!(await db.updateProfileIf(uid, { reel_tier: nextTier }, tierGuard('reel_tier', profile.reel_tier)))) {
    await db.grant(uid, 'doubloons', cost)
    return { error: 'Your tackle just changed. Try again.' }
  }
  await db.ledger(uid, -cost, `Bought ${REELS[nextTier].name}`)
  return { reelTier: nextTier, doubloons: newDoubloons }
}

// ══ THE HOOK BENCH, THE FISH HOLD ═════════════════════════════════════════════

export async function buyHook(db: HarbourData, uid: string): Promise<{ hookTier: number; doubloons: number } | { error: string }> {
  const profile = await db.profile(uid, 'hook_tier, doubloons, fishing_xp')
  if (!profile) return { error: 'Profile not found' }

  const currentTier = Number(profile.hook_tier ?? 0)
  const nextTier = currentTier + 1
  if (nextTier >= HOOKS.length) return { error: 'Already at max tier' }

  const cost = HOOKS[nextTier].cost
  const hookReq = fishingGearLevelReq(HOOKS[nextTier])
  if (getLevelFromXP(Number(profile.fishing_xp ?? 0)) < hookReq) return { error: `Reach Fishing Lv ${hookReq} to buy the ${HOOKS[nextTier].name}` }
  const newDoubloons = await db.spend(uid, 'doubloons', cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  if (!(await db.updateProfileIf(uid, { hook_tier: nextTier }, tierGuard('hook_tier', profile.hook_tier)))) {
    await db.grant(uid, 'doubloons', cost)
    return { error: 'Your tackle just changed. Try again.' }
  }
  await db.ledger(uid, -cost, `Bought ${HOOKS[nextTier].name}`)
  return { hookTier: nextTier, doubloons: newDoubloons }
}

export async function upgradeFishHold(db: HarbourData, uid: string): Promise<{ ok: true; newTier: number; doubloons: number } | { error: string }> {
  const profile = await db.profile(uid, 'doubloons, fish_hold_tier')
  if (!profile) return { error: 'Profile not found' }

  const currentTier = Number(profile.fish_hold_tier ?? 0)
  if (currentTier >= FISH_HOLD_TIERS.length - 1) return { error: 'Fish hold is already at max tier' }

  const next = getFishHold(currentTier + 1)
  const newTier = currentTier + 1
  const newDoubloons = await db.spend(uid, 'doubloons', next.cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  if (!(await db.updateProfileIf(uid, { fish_hold_tier: newTier }, tierGuard('fish_hold_tier', profile.fish_hold_tier)))) {
    await db.grant(uid, 'doubloons', next.cost)
    return { error: 'Your hold just changed. Try again.' }
  }
  await db.ledger(uid, -next.cost, `Upgraded fish hold to ${next.name}`)
  return { ok: true, newTier, doubloons: newDoubloons }
}

/** What is actually in the hold: the quantities only. The names, art and sell
 *  values are already on the client, and the VALUE depends on who is buying. */
export async function holdContents(db: HarbourData, uid: string): Promise<{ ok: true; rows: { fishId: number; qty: number }[] } | { error: string }> {
  const rows = (await db.holdRows(uid)).filter(r => r.quantity > 0).map(r => ({ fishId: r.fish_id, qty: r.quantity }))
  return { ok: true, rows }
}

// ══ THE SHIPYARD'S HULLS ══════════════════════════════════════════════════════

export async function buyShip(db: HarbourData, uid: string): Promise<{ shipTier: number; doubloons: number } | { error: string }> {
  const profile = await db.profile(uid, 'ship_tier, doubloons, expedition_xp')
  if (!profile) return { error: 'Profile not found' }

  // FLOORED AT THE SLOOP: the Rowboat and Dinghy came off the ladder.
  const currentTier = Math.max(MIN_SHIP_TIER, Number(profile.ship_tier ?? MIN_SHIP_TIER))
  const nextTier = currentTier + 1
  // Against the top tier, never SHIPS.length.
  const next = nextShip(currentTier)
  if (!next) return { error: 'Already at max tier' }

  const cost = next.cost
  const navReq = navLevelReqForShip(cost)
  if (navLevelFromXP(Number(profile.expedition_xp ?? 0)) < navReq) return { error: `Reach Nav Lv ${navReq} to buy the ${next.name}` }
  const newDoubloons = await db.spend(uid, 'doubloons', cost)
  if (newDoubloons == null) return { error: 'Not enough doubloons' }
  if (!(await db.updateProfileIf(uid, { ship_tier: nextTier }, tierGuard('ship_tier', profile.ship_tier)))) {
    await db.grant(uid, 'doubloons', cost)
    return { error: 'That ship is already yours. Reload and try again.' }
  }
  await db.ledger(uid, -cost, `Bought ${next.name}`)
  return { shipTier: nextTier, doubloons: newDoubloons }
}

export async function renameShip(db: HarbourData, uid: string, name: string): Promise<{ ok: true } | { error: string }> {
  const trimmed = name.trim().slice(0, 32)
  if (!trimmed) return { error: 'Name cannot be empty' }
  await db.updateProfile(uid, { ship_name: trimmed })
  return { ok: true }
}

// ══ THE ANGLER'S ALMANAC ══════════════════════════════════════════════════════
//
// Loaded ON OPEN, not with the fishing page: five tables and a dozen columns
// that almost nobody opens on a given visit.

export type AlmanacEntry = {
  id: number
  name: string
  scientificName: string | null
  description: string | null
  funFact: string | null
  habitat: string
  /** bite_rarity, 1 (common) to 5 (legendary). */
  rarity: number
  difficulty: number
  sellValue: number
  lengthMin: number | null
  lengthMax: number | null
  sizeCategory: string | null
  dietType: string | null
  waterType: string | null
  region: string | null
  /** All LIFETIME: the Almanac is the career book and must not shorten because
   *  you prestiged a zone. */
  count: number
  firstCaughtAt: string | null
  lastCaughtAt: string | null
  /** Catches in the CURRENT prestige cycle. */
  cycleCount: number
  /** Have you EVER landed this, by any evidence we have (a prestige above zero
   *  is proof every species in the zone was caught). */
  everCaught: boolean
  /** Has a golden of this species EVER been landed. */
  everGolden: boolean
  /** First landed since the book was last opened. */
  isNew: boolean
  pbLength: number | null
  pbAt: string | null
}

/** One golden, as its own object: a specific fish on a specific day. */
export type GoldenCatch = {
  id: number
  fishId: number
  name: string
  habitat: string
  rarity: number
  sizeIn: number | null
  caughtAt: string
  /** 'hold' | 'sold'. Older rows may be null, which reads as held. */
  status: string | null
  soldFor: number | null
}

export type AlmanacStats = {
  casts: number
  perfects: number
  bestPerfectStreak: number
  trophySizeCatches: number
  cratesOpened: number
  doubleCatches: number
  jackpots: number
  snags: number
  doubloonsFromFish: number
  fishingXP: number
  /** Counted since the Almanac shipped, not for all time. */
  crateOpens: Record<string, number>
  baitUsed: Record<string, number>
  biggestSale: number
  fishSoldCount: number
}

export type AlmanacData = {
  entries: AlmanacEntry[]
  goldens: GoldenCatch[]
  unlockedPets: string[]
  ancientCatches: number[]
  /** THE LONG VIGIL: per-giant rank + released state, once the finale is cleared. */
  vigil: VigilState
  vigilUnlocked: boolean
  prestige: Record<string, number>
  /** Wipes past Max Prestige, per zone: each is +10% to that water's golden odds. */
  goldenBoosts: Record<string, number>
  /** Whether this cycle's completion reward has been taken, per zone. */
  zoneRewardsClaimed: Record<string, boolean>
  /** How many species are newly logged since the book was last opened. */
  newCount: number
  stats: AlmanacStats
}

export async function getAlmanacData(db: HarbourData, uid: string): Promise<AlmanacData | { error: string }> {
  let species: Awaited<ReturnType<HarbourData['speciesList']>>
  try { species = await db.speciesList() } catch { return { error: 'Could not read the species list' } }
  const [logs, p, finale] = await Promise.all([
    db.almanacLogs(uid),
    db.profile(uid, 'fishing_casts, total_perfects, highest_perfect_streak, trophy_size_catches, fishing_crates_opened, fishing_double_catches, fishing_jackpots, fishing_snags, fish_sold_doubloons, fishing_xp, unlocked_pets, ancient_catches, ancient_vigil, prestige_levels, crate_opens, bait_used, biggest_fish_sale, fish_sold_count, zone_golden_boost, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, almanac_viewed_at'),
    // The Vigil's gate: One Last Ride carries requiresAncients: 6, so clearing
    // it means the wall was full.
    db.hasCleared(uid, 'the_sunken_hand'),
  ])
  const vigilUnlocked = finale

  // THE SIX ANCIENT DEEP TROPHIES ARE NOT IN THE CATCH LOG: they are ids on
  // ancient_catches and nowhere else, so both lists are unioned before counting.
  const ancientIds = new Set(((p?.ancient_catches as number[] | null) ?? []))
  // A prestiged zone was, by definition, fully collected at least once.
  const prestige = (p?.prestige_levels as Record<string, number> | null) ?? {}
  // When the book was last opened; null means everything is new.
  const viewedAt = p?.almanac_viewed_at ? Date.parse(p.almanac_viewed_at as string) : null

  const col = new Map(logs.collection.map(r => [r.fish_id as number, r]))
  const life = new Map(logs.lifetime.map(r => [r.fish_id as number, r]))
  const pb = new Map(logs.bests.map(r => [r.fish_id as number, r]))

  const entries: AlmanacEntry[] = species.map(s => {
    const c = col.get(s.id as number)
    const l = life.get(s.id as number)
    const b = pb.get(s.id as number)
    const first = (l?.first_caught_at as string | null) ?? (c?.first_caught_at as string | null) ?? null
    return {
      id: s.id as number,
      name: s.name as string,
      scientificName: (s.scientific_name as string | null) ?? null,
      description: (s.description as string | null) ?? null,
      funFact: (s.fun_fact as string | null) ?? null,
      habitat: s.habitat as string,
      rarity: (s.bite_rarity as number | null) ?? 1,
      difficulty: (s.catch_difficulty as number | null) ?? 1,
      sellValue: (s.sell_value as number | null) ?? 0,
      lengthMin: (s.length_min_in as number | null) ?? null,
      lengthMax: (s.length_max_in as number | null) ?? null,
      sizeCategory: (s.size_category as string | null) ?? null,
      dietType: (s.diet_type as string | null) ?? null,
      waterType: (s.water_type as string | null) ?? null,
      region: (s.region as string | null) ?? null,
      // Lifetime first, the cycle log as a fallback, floored at 1 for anything on
      // the ancient ledger (Math.max, not a ?? chain: a row with 0 would swallow it).
      count: Math.max(
        (l?.catches as number | null) ?? (c?.catch_count as number | null) ?? 0,
        ancientIds.has(s.id as number) ? 1 : 0,
      ),
      firstCaughtAt: first,
      isNew: !!first && (viewedAt == null || Date.parse(first) > viewedAt),
      lastCaughtAt: (l?.last_caught_at as string | null) ?? (c?.last_caught_at as string | null) ?? null,
      cycleCount: (c?.catch_count as number | null) ?? 0,
      everCaught: ((l?.catches as number | null) ?? (c?.catch_count as number | null) ?? 0) > 0
        || ancientIds.has(s.id as number)
        || (prestige[s.habitat as string] ?? 0) > 0,
      everGolden: c?.is_golden === true,
      pbLength: (b?.best_length_in as number | null) ?? null,
      pbAt: (b?.caught_at as string | null) ?? null,
    }
  })

  const byId = new Map(entries.map(e => [e.id, e]))
  const goldens: GoldenCatch[] = logs.goldens.map(g => {
    const e = byId.get(g.fish_id as number)
    return {
      id: g.id as number,
      fishId: g.fish_id as number,
      name: e?.name ?? 'Unknown',
      habitat: e?.habitat ?? 'shallows',
      rarity: e?.rarity ?? 1,
      sizeIn: (g.size_in as number | null) ?? null,
      caughtAt: g.caught_at as string,
      status: (g.status as string | null) ?? null,
      soldFor: (g.sold_for as number | null) ?? null,
    }
  })

  return {
    entries,
    goldens,
    unlockedPets: (p?.unlocked_pets as string[] | null) ?? [],
    ancientCatches: (p?.ancient_catches as number[] | null) ?? [],
    vigil: vigilUnlocked ? vigilFor(p?.ancient_vigil, (p?.ancient_catches as number[] | null)) : {},
    vigilUnlocked,
    prestige,
    goldenBoosts: (p?.zone_golden_boost as Record<string, number> | null) ?? {},
    newCount: entries.filter(e => e.isNew).length,
    zoneRewardsClaimed: {
      shallows: p?.zone_shallows_rewarded === true,
      open_waters: p?.zone_open_waters_rewarded === true,
      deep: p?.zone_deep_rewarded === true,
      abyss: p?.zone_abyss_rewarded === true,
    },
    stats: {
      casts: Number(p?.fishing_casts ?? 0),
      perfects: Number(p?.total_perfects ?? 0),
      bestPerfectStreak: Number(p?.highest_perfect_streak ?? 0),
      trophySizeCatches: Number(p?.trophy_size_catches ?? 0),
      cratesOpened: Number(p?.fishing_crates_opened ?? 0),
      doubleCatches: Number(p?.fishing_double_catches ?? 0),
      jackpots: Number(p?.fishing_jackpots ?? 0),
      snags: Number(p?.fishing_snags ?? 0),
      doubloonsFromFish: Number(p?.fish_sold_doubloons ?? 0),
      fishingXP: Number(p?.fishing_xp ?? 0),
      crateOpens: (p?.crate_opens as Record<string, number> | null) ?? {},
      baitUsed: (p?.bait_used as Record<string, number> | null) ?? {},
      biggestSale: Number(p?.biggest_fish_sale ?? 0),
      fishSoldCount: Number(p?.fish_sold_count ?? 0),
    },
  }
}

/** The book has been read. Stamped when it closes, so the NEW marks stay up for
 *  the whole of the visit they are there to guide. */
export async function markAlmanacViewed(db: HarbourData, uid: string): Promise<void> {
  await db.updateProfile(uid, { almanac_viewed_at: nowIso() })
}

// ══ THE SHIPYARD'S STATE ══════════════════════════════════════════════════════
//
// Everything the Shipyard needs, in one read, for both its page and its sheet
// over the chart: a second copy would drift, and the drift reads as an item lost.

export type ShipyardState = {
  doubloons: number
  gems: number
  fishingLevel: number
  isPremium: boolean
  equippedRod: number
  ownedRods: number[]
  reelTier: number
  hookTier: number
  lineTier: number
  completionistEffects: number[] | null
  hasForgedBefore: boolean
  hullTier: number
  handlingTier: number
  accelTier: number
  lanternTier: number
  holdTier: number
  holdCapacity: number
  baitInventory: { bait_type: string; quantity: number }[]
  characterColor: string
  unlockedCharacterColors: string[]
  equippedBadges: string[]
  unlockedBadges: string[]
  equippedBoat: string | null
  unlockedBoats: string[]
  equippedHat: string | null
  unlockedHats: string[]
  equippedPet: string | null
  equippedPetBow: string | null
  unlockedPets: string[]
  equippedSpecial: string | null
  equippedSpecial2: string | null
  hasDeepReel: boolean
  hasAnglersPatience: boolean
  anglersPatienceXp: number
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasAutoCatcher: boolean
  hasPerfectedSigil: boolean
  gauntletDeepest: number
  showWaitTimer: boolean
}

export async function shipyardState(db: HarbourData, uid: string): Promise<ShipyardState | { error: string }> {
  const profile = await db.profile(uid, '*')
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess.
  if (!canSail(profile as Parameters<typeof canSail>[0])) return { error: 'Not yet.' }

  const [rodRows, baitRows, achievementPoints] = await Promise.all([db.rodTiers(uid), db.baitRows(uid), db.achievementPoints(uid)])

  // Free rods never appear in the rod store: everybody has them. Add them back
  // or a new captain sees an empty rack and no way to fill it.
  const owned = new Set(rodRows.map(Number))
  for (const r of RODS) if (r.cost === 0 && !r.earnedOnly && !r.traderOnly) owned.add(r.tier)

  const holdTier = Number(profile?.fish_hold_tier ?? 0)
  // Earned-but-ungranted skins and boats are unioned into the pickers.
  const unlocked = unlockedCosmetics(profile as never, achievementPoints)

  const todayStr = nowIso().split('T')[0]
  const hasTideTurner = profile?.has_tide_turner === true
  const usedToday = hasTideTurner && profile?.tide_turner_date === todayStr ? Number(profile?.tide_turner_used ?? 0) : 0

  return {
    doubloons: Number(profile?.doubloons ?? 0),
    gems: Number(profile?.gems ?? 0),
    fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
    isPremium: isPremiumActive(profile as Parameters<typeof isPremiumActive>[0]),
    equippedRod: Number(profile?.rod_tier ?? 0),
    ownedRods: [...owned].sort((a, b) => a - b),
    reelTier: Number(profile?.reel_tier ?? 0),
    hookTier: Number(profile?.hook_tier ?? 0),
    lineTier: Number(profile?.line_tier ?? 0),
    completionistEffects: (profile?.completionist_effects as number[] | null) ?? null,
    hasForgedBefore: profile?.has_seen_forge_flourish === true,
    hullTier: Number(profile?.hull_speed_tier ?? 0),
    handlingTier: Number(profile?.hull_handling_tier ?? 0),
    accelTier: Number(profile?.hull_accel_tier ?? 0),
    lanternTier: Number(profile?.lantern_tier ?? 0),
    holdTier,
    holdCapacity: getFishHold(holdTier).capacity,
    baitInventory: baitRows,
    characterColor: (profile?.character_color as string | null) ?? 'default',
    unlockedCharacterColors: unlocked.colors,
    equippedBadges: (profile?.equipped_badges as string[] | null) ?? [],
    unlockedBadges: (profile?.unlocked_badges as string[] | null) ?? [],
    equippedBoat: (profile?.equipped_boat as string | null) ?? null,
    unlockedBoats: unlocked.boats,
    equippedHat: (profile?.equipped_hat as string | null) ?? null,
    unlockedHats: (profile?.unlocked_hats as string[] | null) ?? [],
    equippedPet: (profile?.equipped_pet as string | null) ?? null,
    equippedPetBow: (profile?.equipped_pet_bow as string | null) ?? null,
    unlockedPets: (profile?.unlocked_pets as string[] | null) ?? [],
    equippedSpecial: (profile?.equipped_special as string | null) ?? null,
    equippedSpecial2: (profile?.equipped_special_2 as string | null) ?? null,
    hasDeepReel: profile?.finn_spoil_free === 'fishing' || profile?.finn_spoil_paid === 'fishing',
    hasAnglersPatience: profile?.has_anglers_patience === true,
    anglersPatienceXp: Number(profile?.anglers_patience_xp ?? 0),
    hasTideTurner,
    tideTurnerSkipsLeft: hasTideTurner ? Math.max(0, 3 - usedToday) : 0,
    hasPhantomHook: profile?.has_phantom_hook === true,
    hasAutoCaster: profile?.has_auto_caster === true,
    hasAutoCatcher: profile?.has_auto_catcher === true,
    hasPerfectedSigil: profile?.has_perfected_sigil === true,
    gauntletDeepest: Number(profile?.gauntlet_deepest ?? 0),
    showWaitTimer: profile?.show_wait_timer !== false,
  }
}

// ══ THE SHIP SCREEN'S DATA ════════════════════════════════════════════════════
//
// One shaping for both ways in (the routes and the sheet over the chart). The
// pieces are fetched by the caller, because on the web they are request caches
// the hub page shares with the ship screen (expeditions/hubData); the desktop
// reads them from its stores. See shipHeroPieces below for the store-only read.

export type ShipHeroPieces = {
  profile: Record<string, unknown> | null
  roster: CrewMember[]
  trawlingCrewIds: number[]
  bunkLockedCrewIds: number[]
  readyBunks: number
  chapter3Cleared: boolean
  blockadeCleared: boolean
  throneCleared: boolean
}

export async function shipHeroProps(db: HarbourData, pieces: ShipHeroPieces) {
  const { profile, roster, trawlingCrewIds, bunkLockedCrewIds, readyBunks, chapter3Cleared, blockadeCleared, throneCleared } = pieces
  const shipTier = Number(profile?.ship_tier ?? 0)
  const baseShip = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  // The Sixth Berth widens the crew grid to six.
  const hasSixthBerth = profile?.has_sixth_berth === true
  const shipStats = hasSixthBerth ? { ...baseShip, crewSlots: baseShip.crewSlots + 1 } : baseShip
  // Promote a matured ultimate build into the active slot on load.
  const { active: activeAugment, build: manowarBuild } = profile
    ? await settleUltimateBuildVia(db, profile.id as string,
        (profile.manowar_augment as string | null) ?? null, profile.manowar_augment_build ?? null)
    : { active: null, build: null }
  return {
    shipStats,
    shipName: (profile?.ship_name as string | null) ?? null,
    expeditionXP: Number(profile?.expedition_xp ?? 0),
    equippedShipSkin: (profile?.equipped_ship_skin as string | null) ?? null,
    shipSkins: (profile?.ship_skins as string[] | null) ?? [],
    roster,
    trawlingCrewIds,
    bunkLockedCrewIds,
    readyBunks,
    ownedRaidItems: distinctIds((profile?.raid_items as string[] | null) ?? []),
    borrowedJawXp: Number(profile?.borrowed_jaw_xp ?? 0),
    equippedRaidItems: (profile?.equipped_raid_items as string[] | null) ?? [],
    equippedRepairKit: (profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit',
    ownedRepairKits: (profile?.owned_repair_kits as string[] | null) ?? ['basic_repair_kit'],
    doubloons: Number(profile?.doubloons ?? 0),
    shipClasses: (profile?.ship_classes as Record<string, string> | null) ?? {},
    gauntletUpgrades: [
      ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
      ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
    ],
    gauntletFathoms: (profile?.gauntlet_fathoms as number | null) ?? 0,
    gems: (profile?.gems as number | null) ?? 0,
    abyssalConversion: parseAbyssalConversion(profile?.abyssal_conversion),
    forgeRecipesLearned: (profile?.forge_recipes_learned as string[] | null) ?? [],
    hasSeenForgeIntro: profile?.has_seen_forge_intro === true,
    hasSeenShipGuide: profile?.has_seen_ship_guide === true,
    manowarAugment: activeAugment,
    manowarBuild,
    manowarSchematics: profile?.manowar_schematics === true,
    chapter3Cleared,
    blockadeCleared,
    hasSixthBerth,
    throneCleared,
    shipRefitsUsed: Number(profile?.ship_refits_used ?? 0),
    hasArmoryExpansion: profile?.has_armory_expansion === true,
    hasSixthMount: profile?.finn_spoil_free === 'nav' || profile?.finn_spoil_paid === 'nav',
    isAdmin: profile?.is_admin === true,
    navRenownAlloc: (profile?.nav_renown_alloc as Record<string, number> | null) ?? null,
    seenNavRenownIntro: profile?.seen_nav_renown_intro === true,
  }
}

/** The ship screen's pieces straight from the store (the desktop's way in; the
 *  web reads the same pieces through its per-request caches). */
export async function shipHeroPieces(db: HarbourData, uid: string): Promise<ShipHeroPieces> {
  const [profile, roster, trawlingCrewIds, bunks, cleared] = await Promise.all([
    db.profile(uid, '*'), getCrewRoster(db, uid), db.trawling(uid), db.bunks(uid), db.clearedRaidIds(uid),
  ])
  const liveCap = storesCapHours(Number(profile?.crew_stores_level ?? 1))
  const now = clockNow()
  const done = (b: { since: string; cap_hours: number | null }) => stintDone(b.since, now, b.cap_hours ?? liveCap)
  const clear = new Set(cleared)
  return {
    profile: profile ? { ...profile, id: uid } : null,
    roster,
    trawlingCrewIds,
    bunkLockedCrewIds: bunks.filter(b => !done(b)).map(b => b.crew_id),
    readyBunks: bunks.filter(done).length,
    chapter3Cleared: clear.has('the_quartermaster'),
    blockadeCleared: clear.has('the_blockade'),
    throneCleared: clear.has('the_throne'),
  }
}

// ── THE TACKLE SHOP'S PAGE (2026-09-30) ──
// What /marketplace/tackle-shop hands TackleShopClient, read through the store
// so the web page and the desktop build are the same function. Moved out of the
// page; the reads are the ones it made directly.

export async function tackleShopProps(db: HarbourData, uid: string) {
  const [profile, bait, rods, liveIds, species, rapport, isles] = await Promise.all([
    db.profile(uid, '*'), db.baitRows(uid), db.rodTiers(uid), db.collectionIds(uid),
    db.speciesList(), db.rapportRows(uid), db.discoveries(uid),
  ])
  const completionist = completionistProgress({
    level: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
    allSpecies: species.map(s => ({ id: s.id as number, habitat: s.habitat as string })),
    lifetime: profile?.lifetime_species as number[] | null,
    liveIds,
    ancientCatches: profile?.ancient_catches as number[] | null,
    prestige: profile?.prestige_levels as Record<string, number> | null,
    rapport: rapport.map(r => ({ folk_id: r.folk_id, points: r.points })),
    isles: isles.map(isle_id => ({ isle_id })),
  })
  return {
    hookTier: Number(profile?.hook_tier ?? 0),
    equippedRod: Number(profile?.rod_tier ?? 0),
    ownedRods: rods.length > 0 ? rods : [0],
    reelTier: Number(profile?.reel_tier ?? 0),
    lineTier: Number(profile?.line_tier ?? 0),
    doubloons: Number(profile?.doubloons ?? 0),
    baitInventory: bait,
    fishingXP: Number(profile?.fishing_xp ?? 0),
    isPremium: isPremiumActive(profile),
    completionist,
  }
}
