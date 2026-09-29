'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { zoneRewardDoubloons, PRESTIGE_MAX } from '@/lib/zoneRewards'
import { vigilFor, VIGIL_MAX_RANK, ANCIENT_IDS } from '@/lib/ancientVigil'
import { type FishSizeTier } from '@/lib/fishSize'
import { type CrateTier, type CrateLoot } from '@/lib/crateLoot'
import { grant, spend } from '@/lib/wallet'
import { prestigeStep } from '@/lib/fishingRules'
import { fishingData } from '@/lib/data/fishingData'
import * as core from '@/lib/core/fishing'
import * as loadout from '@/lib/core/loadout'
import { settleDeferredSpeciesCredit } from '@/lib/core/fishing'

export type FishSpecies = import('@/lib/core/fishing').FishSpecies

// The cast, the reel, the crate, the wormhole, the Tide Turner, the golden
// choice and the level rewards run in lib/core/fishing; the loadout (boats,
// bandanas, pets, specials, the forge, the preferences) in lib/core/loadout.
// These actions check the session and hand the core the Supabase store; the
// offline build hands it a local save instead.

// fishWaitMs, tierWeightedPick, rollCrateTier and the event reader live in
// lib/fishingRules now (Phase B, 2026-09-28), with the cast roll itself.

// CrateTier + CrateLoot + the loot roller now live in @/lib/crateLoot (imported
// above). Do NOT re-export them from here: this is a 'use server' file, and a
// non-async (type) export corrupts the server-action manifest for the whole
// module — which broke castLine / reelIn / the trawl actions. Anything needing
// these types imports them straight from @/lib/crateLoot.

// PendingCast (the server-rolled cast token) and CastShot (its client payload)
// are in lib/fishingRules.

/** One regular with an open request for the species just landed (lib/core/fishing). */
export type WaitingFolk = import('@/lib/core/fishing').WaitingFolk

export async function castLine(
  baitType: string,
  habitat: string,
  /**
   * WHERE THE LINE WENT IN, for hotspots. Optional: the fishing page has no
   * chart and passes nothing, which resolves to no hotspot.
   *
   * The position is taken on trust — the map is client-side and there is no
   * server-side notion of where the boat is — so the hotspot is RE-DERIVED
   * here from the clock rather than sent. A forged position can claim a patch
   * it is not in; it cannot invent a patch, choose which kind it is, or move
   * one. See lib/seaHotspots for why the numbers are sized to make lying about
   * it not worth the trouble.
   */
  at?: { x: number; y: number },
): Promise<
  | { fishId: number; catchDifficulty: number; biteRarity: number; waitMs: number; crateTier?: CrateTier; baitRemaining?: number; instantBite?: boolean; jackpotMult?: number; doubleCatch?: boolean; catchQty?: number; lockedStage?: number; vigilRank?: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.castLine(fishingData(createAdminClient()), user.id, baitType, habitat, at)
}

/** Settle a deferred credit from OUTSIDE the cast loop — specifically the
 *  fishing page load.
 *
 *  castLine settles on the player's next cast, which covers the common path but
 *  leaves a visible window: backing out of a zone calls router.refresh(), the
 *  page re-renders, and the Logbook re-seeds from fish_collection where the
 *  catch has not landed yet. The player sees the fish they just caught reading
 *  one lower, or missing entirely if it was a new species, until they cast
 *  again. Settling here closes that, and it is the right call semantically too:
 *  a page load has already destroyed the catch card, so the reroll is forfeit.
 *
 *  Takes NO arguments (it is an exported server action, so it must derive the
 *  user from auth rather than trust a caller) and reads the profile through the
 *  request-cached loader, so calling it from a page that already loaded the
 *  profile costs no extra query. */
export async function settlePendingCatchCredit(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const profile = await getCurrentProfile()
  if (!profile?.pending_reroll) return
  await settleDeferredSpeciesCredit(fishingData(createAdminClient()), user.id, profile)
}

// Phase 2 — process reel-in result
export async function reelIn(
  fishId: number,
  result: 'perfect' | 'catch' | 'miss' | 'penalty',
  baitType: string,
  doubleCatch = false,
  _streakBonus = 0, // deprecated: streak XP is now computed server-side (kept for call-site arity)
  jackpotMultiplier = 1,
): Promise<
  | {
      caught: true
      fish: FishSpecies
      baitSaved: boolean
      isNewSpecies: boolean
      xpGained: number
      newXP: number
      dailyProgress: number[]
      unlockedSkinId?: string
      perfectStreak?: number
      streakBonusXP?: number
      /**
       * THE THREE PARTS OF xpGained, AND THEY ADD UP TO IT. The card lists
       * them side by side, and side by side they read as things that sum, so
       * they have to: `xpCatch + perfectBonusXP + xpStreak === xpGained`,
       * every one after every multiplier. `streakBonusXP` above is the older,
       * pre-multiplier report of the streak and is kept for anything that
       * still reads it; the card does not.
       */
      xpCatch?: number
      /** What the perfect earned over the same fish landed clean. Absent on a
       *  plain catch. Reported, never banked on its own. */
      perfectBonusXP?: number
      /** What the streak earned, after the multipliers. */
      xpStreak?: number
      // ── Per-catch size variance (lib/fishSize) ──
      /** Rolled length in inches. Always present on caught:true. */
      sizeIn: number
      /** Species range — present for non-ancients (ancients have one canonical size). */
      sizeMin?: number
      sizeMax?: number
      /** Tier classification. Omitted for ancients (no variance, no chrome needed). */
      sizeTier?: FishSizeTier
      /** True if this catch set a new personal best for the species. Always
       *  false for ancients (caught once, no PB chase). */
      isPB: boolean
      /** Previous PB before this catch, in inches. null on first-catch. */
      previousBest: number | null
      /** Pokémon-style shiny variant. Server-rolled at 1/SHINY_ODDS but
       *  only if the catch was a Perfect AND the species isn't habitat-
       *  blocked (Ancient Deep). Persisted as a row in shiny_catches when
       *  true. */
      isShiny: boolean
      /** ID of the inserted shiny_catches row (null when not shiny).
       *  Passed to the forced Sell-or-Mount choice modal so it knows
       *  which trophy to act on. */
      shinyId?: number
      /** True when this species is ALREADY mounted in the player's
       *  Logbook — the Mount option in the choice modal is disabled
       *  in that case (each species can only be mounted once). */
      alreadyMounted?: boolean
      /** Perfected Sigil bonus (currently 10 ⟡) credited immediately
       *  when the sigil is equipped and this catch was a Perfect. 0
       *  otherwise. The new running doubloons total is in newDoubloons. */
      sigilBonus?: number
      newDoubloons?: number
      /** Galaxy Rod — true when this catch can be rerolled through the
       *  Wormhole (rod has the effect, catch is eligible: real fish, not
       *  shiny, not ancient). The client shows a one-shot reroll button. */
      wormhole?: boolean
      /** True if THIS catch claimed the global "first Ancient Deep catch"
       *  contest. Only the first player to land an ancient_deep fish
       *  ever sees this — everyone else gets undefined/false. Triggers
       *  the win celebration overlay client-side. */
      firstAncientCatch?: boolean
      /** Number of fish this catch actually banked (Locked-In triple / double /
       *  jackpot, clamped to hold space). 1 for a normal catch. */
      catchQty?: number
      /** Ancient Deep only: a RARE, subtle omen shown when a regular is landed
       *  on common bait while giants remain uncaught — a faint sense that
       *  something larger passed. Deliberately vague (never names the lure); a
       *  breadcrumb toward the trophies, pairing with the lures' own flavor. */
      deepStirs?: boolean
      /** THE LONG VIGIL. Set only when a RELEASED giant was landed on a perfect
       *  final phase: the rank it climbed from and to. Drives the rank-up
       *  celebration and the wall's new numeral. */
      vigilRankUp?: { from: number; to: number } | null
      /** Sum of the six ranks (6 at the floor, 30 at the capstone), present on
       *  any catch that wrote the vigil. */
      vigilTotal?: number
      /** All six giants at rank 5 — the ancient pet is owed. */
      vigilComplete?: boolean
      /** The baby plesiosaurus just landed in unlocked_pets (first time only). */
      vigilPetGranted?: boolean
      /** REGULARS WHO ASKED FOR THIS SPECIES and are still waiting on it. The
       *  moment the fish lands is the one moment both facts are in hand, so
       *  it is said here rather than left for the Salt Road to be opened. */
      waitingOn?: WaitingFolk[]
    }
  | { caught: false }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.reelIn(fishingData(createAdminClient()), user.id, fishId, result, baitType, doubleCatch, _streakBonus, jackpotMultiplier)
}

/** Galaxy Rod — the Wormhole reroll (lib/core/fishing). */
export async function rerollWormhole(): Promise<
  | { ok: true; fish: FishSpecies; qty: number; isNewSpecies: boolean; sizeIn: number; sizeMin?: number; sizeMax?: number; sizeTier?: FishSizeTier; isPB: boolean; previousBest: number | null }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.rerollWormhole(fishingData(createAdminClient()), user.id)
}

/** Opens the crate and moves the perfect streak (lib/core/fishing). The tier
 *  argument is ignored: the cast token decides it. */
export async function reelCrate(_zone: string, _tier: CrateTier = 'wooden', result: 'perfect' | 'catch' = 'catch'): Promise<(CrateLoot & { perfectStreak?: number }) | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.reelCrate(fishingData(createAdminClient()), user.id, result)
}

const QUICK_BUY_WORMS_QTY  = 10
const QUICK_BUY_WORMS_COST = 200  // 2× the shop price of 100 doubloons per 10

export async function quickBuyWorms(): Promise<{ qty: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  // Spend first, in place; the result is the guard, so two taps cannot both
  // buy with one balance.
  const newDoubloons = await spend(admin, user.id, 'doubloons', QUICK_BUY_WORMS_COST)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }

  const db = fishingData(admin)
  await Promise.all([
    db.addBait(user.id, 'worm', QUICK_BUY_WORMS_QTY),
    db.ledger(user.id, -QUICK_BUY_WORMS_COST, 'Quick-buy worms'),
  ])

  return { qty: QUICK_BUY_WORMS_QTY, doubloons: newDoubloons }
}

// ── QUICK-SELL IS GONE ──────────────────────────────────────────────────────
//
// `sellFish` (per species) and `quickSellAllFish` (the lot) both sold at 75%
// from wherever you happened to be floating, and both are deleted here. They
// were already dead: nothing had called either since /fishing was retired, and
// nothing could, because selling from anywhere is precisely the cost the ocean
// hub exists to charge. The hold panel was still describing the lane to people.
//
// Two lanes now, and neither lives in this file:
//   sea/traderActions.sellToResident  — 78 to 86%, sail to the buyer in your
//                                       water, deeper bands pay more
//   tavern/market/actions.sellEntireHold — 100% less the 3% non-Captain fee,
//                                       ashore at the Mainland
//
// Deleted rather than left for a future caller. A 75% sell-from-anywhere is an
// economy decision that was reversed, not a utility that lost its button, and
// leaving it exported is how it quietly comes back.


// Perfect streak is fully server-authoritative inside reelIn now (it tracks the
// live streak in current_perfect_streak, computes the XP bonus, and updates the
// highest_perfect_streak record + 'unbroken' badge). The old client-driven
// saveHighestPerfectStreak / saveCurrentPerfectStreak actions were removed —
// they trusted client numbers and could be used to spoof XP / the leaderboard.

export async function markFishingTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await fishingData(createAdminClient()).updateProfile(user.id, { has_seen_fishing_tour: true })
}

export async function markFishingCatchTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await fishingData(createAdminClient()).updateProfile(user.id, { has_seen_fishing_catch_tour: true })
}

/** One-shot: fired when the player dismisses the first-catch celebration
 *  overlay. Server-side flag so the moment doesn't replay across devices
 *  or after a session reset. */
export async function markFirstCatchCelebrationSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await fishingData(createAdminClient()).updateProfile(user.id, { has_seen_first_catch_celebration: true })
}

/** Remember whether the Auto Caster is running (lib/core/loadout). */
export async function setAutoFishing(value: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await loadout.setAutoFishing(fishingData(createAdminClient()), user.id, value)
}

/** Toggle for the cast→bite count-up shown in the waiting pill. Stored on the
 *  profile so it syncs across devices. */
export async function setShowWaitTimer(value: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await loadout.setShowWaitTimer(fishingData(createAdminClient()), user.id, value)
}

export async function checkLeaderboardPosition(
  category: 'fishingLevel' | 'perfectStreak',
): Promise<{ position: number } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = fishingData(createAdminClient())
  const field = category === 'fishingLevel' ? 'fishing_xp' : 'highest_perfect_streak'

  const me = await db.profile(user.id, field)
  if (!me) return null

  const myValue = (me as Record<string, number>)[field] ?? 0
  const count = await db.countAbove(field, myValue)

  if (count !== null && count < 3) return { position: count + 1 }
  return null
}

const ZONE_REWARD_COL: Record<string, string> = {
  shallows:    'zone_shallows_rewarded',
  open_waters: 'zone_open_waters_rewarded',
  deep:        'zone_deep_rewarded',
  abyss:       'zone_abyss_rewarded',
}

export async function claimZoneReward(zone: string): Promise<{ doubloons: number; earned: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rewardCol = ZONE_REWARD_COL[zone]
  if (!rewardCol) return { error: 'Invalid zone' }

  const admin = createAdminClient()

  const db = fishingData(admin)
  const zoneIds = await db.speciesIdsIn(zone)
  const [profile, caughtCount] = await Promise.all([
    db.profile(user.id, 'doubloons, prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded'),
    db.loggedCount(user.id, zoneIds),
  ])

  if (!profile) return { error: 'Profile not found' }
  const alreadyClaimed = {
    shallows:    profile.zone_shallows_rewarded,
    open_waters: profile.zone_open_waters_rewarded,
    deep:        profile.zone_deep_rewarded,
    abyss:       profile.zone_abyss_rewarded,
  }
  if (alreadyClaimed[zone as keyof typeof alreadyClaimed]) return { error: 'Already claimed' }

  const totalInZone = zoneIds.length
  if (caughtCount < totalInZone || totalInZone === 0) return { error: 'Zone not complete' }

  const prestigeLevel = ((profile.prestige_levels as Record<string, number> | null) ?? {})[zone] ?? 0
  const earned = zoneRewardDoubloons(zone, prestigeLevel)
  if (!earned) return { error: 'Invalid zone' }

  // Flip the claim flag FIRST, only where it is still unclaimed, and pay only
  // if this request is the one that flipped it.
  if (!(await db.flagOn(user.id, rewardCol))) return { error: 'Already claimed' }

  const [newDoubloons] = await Promise.all([
    grant(admin, user.id, 'doubloons', earned),
    db.ledger(user.id, earned, `Zone completion: ${zone}`),
  ])

  return { doubloons: newDoubloons, earned }
}

export async function prestigeZone(zone: string): Promise<{ prestigeLevel: number; goldenBoost?: number; unlockedSkinId?: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Ancient Deep doesn't prestige. The 6 trophies are one-and-done so
  // 'complete the collection again for another reward' doesn't apply;
  // the 12 regulars + trophies together aren't the same kind of
  // collection-clear arc the other zones are. Reject the call so a
  // manipulated client can't trigger it past the hidden UI button.
  if (zone === 'ancient_deep') return { error: 'Ancient Deep does not prestige' }

  const rewardCol = ZONE_REWARD_COL[zone]
  if (!rewardCol) return { error: 'Invalid zone' }

  const admin = createAdminClient()

  const db = fishingData(admin)
  const zoneIds = await db.speciesIdsIn(zone)
  if (zoneIds.length === 0) return { error: 'Invalid zone' }

  const profile = await db.profile(user.id, 'prestige_levels, zone_golden_boost, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, unlocked_character_colors')
  if (!profile) return { error: 'Profile not found' }
  const rewardClaimed: Record<string, boolean | null> = {
    shallows:    profile.zone_shallows_rewarded,
    open_waters: profile.zone_open_waters_rewarded,
    deep:        profile.zone_deep_rewarded,
    abyss:       profile.zone_abyss_rewarded,
  }
  if (!rewardClaimed[zone]) return { error: 'Claim completion reward first' }

  if ((await db.loggedCount(user.id, zoneIds)) < zoneIds.length) return { error: 'Zone not complete' }

  // Prestige caps at 5 ("Max Prestige"); at the cap a wipe grants a permanent
  // GOLDEN BOOST instead. The rule is lib/fishingRules prestigeStep.
  const { atMax, newLevel, newLevels, newGoldenBoost, newGoldenBoosts, allZonesPrestiged } = prestigeStep(
    (profile.prestige_levels as Record<string, number> | null) ?? {},
    (profile.zone_golden_boost as Record<string, number> | null) ?? {},
    zone, PRESTIGE_MAX)

  // Sand used to unlock here at Prestige 3. Since the 2026-09-25 standard it is
  // a Fishing 25 reward (lib/characters), granted on the catch path.
  const prestigeUnlockedSkin: string | undefined = undefined
  const profileUpdate: Record<string, unknown> = { prestige_levels: newLevels, [rewardCol]: false }
  if (atMax) profileUpdate.zone_golden_boost = newGoldenBoosts


  // NOTE: this only clears the CYCLE log. fish_lifetime is untouched, so the
  // Almanac's career numbers survive every prestige. Do not "tidy" this by
  // deleting there too.
  //
  // Preserve GOLDEN mounts: a prestige resets the catch log so you re-collect
  // the regular species, but golden fish are permanent trophies (the is_golden
  // flag drives the whole golden display, and the shiny_catches row it pairs
  // with isn't surfaced anywhere else). Deleting those rows silently wiped the
  // trophy. So delete only the NON-golden rows; golden species stay caught +
  // golden across every prestige cycle. Fetch golden ids explicitly so it works
  // regardless of whether non-golden rows store is_golden as false or null.
  const goldenIds = new Set(await db.goldenIds(user.id, zoneIds))
  const idsToClear = zoneIds.filter(id => !goldenIds.has(id))

  await Promise.all([
    db.clearLog(user.id, idsToClear),
    db.updateProfile(user.id, profileUpdate),
    grantBadgeDirect(user.id, 'prestige_i'),
    // All four zones prestiged = every non-ancient species was landed to get here,
    // so Full Collection is earned even if prior wipes emptied the live log.
    ...(allZonesPrestiged ? [grantBadgeDirect(user.id, 'zone_legend'), grantBadgeDirect(user.id, 'full_collection')] : []),
  ])

  return atMax
    ? { prestigeLevel: PRESTIGE_MAX, goldenBoost: newGoldenBoost }
    : { prestigeLevel: newLevel, unlockedSkinId: prestigeUnlockedSkin }
}

export async function useTideTurnerSkip(): Promise<{ ok: true; skipsLeft: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.tideTurnerSkip(fishingData(createAdminClient()), user.id)
}

export async function buySpecialItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return loadout.buySpecialItem(fishingData(createAdminClient()), user.id, itemId)
}

export async function equipSpecialItem(itemId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const r = await loadout.equipSpecialItem(fishingData(createAdminClient()), user.id, itemId)
  // THE CHART IS A CACHED PAGE, and this changed what stands on it (see equipBoat).
  if ('ok' in r) revalidatePath('/sea')
  return r
}

/** THE LONG VIGIL — release a mounted giant back into the Ancient Deep.
 *
 *  Gated on clearing the finale, and that gate is self-enforcing: One Last Ride
 *  carries `requiresAncients: 6`, so anyone who has beaten Finn necessarily had
 *  all six on the wall. There is no path to a partial wall with a release.
 *
 *  Deliberately does NOT touch ancient_catches. That array gates the finale,
 *  feeds the ancient_ones badge and drives the almanac's everCaught — releasing
 *  a giant must never un-gate a captain's own endgame. "On the wall" is
 *  ancient_catches AND not released; the vigil column owns the second half.
 */
export async function releaseAncient(fishId: number): Promise<
  { ok: true; vigil: Record<string, { rank: number; released: boolean }> } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  if (!ANCIENT_IDS.includes(fishId as (typeof ANCIENT_IDS)[number])) return { error: 'That is not an Ancient' }

  const admin = createAdminClient()
  const db = fishingData(admin)
  const profile = await db.profile(user.id, 'ancient_catches, ancient_vigil')
  if (!profile) return { error: 'Profile not found' }

  if (!(await db.hasCleared(user.id, 'the_sunken_hand'))) return { error: 'The deep does not answer to you yet.' }

  const vigil = vigilFor(profile.ancient_vigil, profile.ancient_catches as number[] | null)
  const key = String(fishId)
  const entry = vigil[key]
  if (!entry) return { error: 'You have never landed that one' }
  if (entry.released) return { error: 'That one is already out there' }
  if (entry.rank >= VIGIL_MAX_RANK) return { error: 'That one is already mastered' }

  vigil[key] = { rank: entry.rank, released: true }
  await db.updateProfile(user.id, { ancient_vigil: vigil })
  // Hooked rather than derived: once you land it again the released flag
  // clears, so "has ever given one back" is not recoverable from state.
  try { await grantBadgeDirect(user.id, 'back_to_the_dark') } catch { /* best-effort */ }
  return { ok: true, vigil }
}

/**
 * ── AND `quiet` IS FOR THE CHART ──────────────────────────────────────────
 *
 * `revalidatePath('/sea')` exists for a real reason (see the note at the call):
 * the Shipyard returns to the chart with `router.back()`, which restores the
 * CACHED entry, so without it a captain could equip a boat and sail away in the
 * old one.
 *
 * It is exactly wrong when the caller IS the chart. The sea's own loadout
 * applies the change optimistically to the sprite that is on screen, so the
 * revalidate re-runs the biggest server batch in the game to tell a page a
 * thing it has already done — and does it while a WebGL renderer, a frame loop
 * and an hour of session state are mounted on top of the result. One slow read
 * in that batch and the route throws, which a player reads as the game
 * crashing because they changed a hat.
 *
 * So the chart says `quiet`. Everywhere else keeps the invalidation.
 */
export async function equipBoat(boatId: string | null, opts?: { quiet?: boolean }): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const r = await loadout.equipBoat(fishingData(createAdminClient()), user.id, boatId)
  // THE CHART IS A CACHED PAGE, and this changed what stands on it.
  //
  // /sea renders on the server from the profile, and the shipyard returns to it
  // with router.back() — which restores the CACHED entry rather than asking for
  // a fresh one. Nothing invalidated it, so a captain could equip a boat, sail
  // away and still be in the old one. It did not read as a stale render; it read
  // as the equip having silently failed.
  if ('ok' in r && !opts?.quiet) revalidatePath('/sea')
  return r
}

export async function buyBoat(boatId: string): Promise<{ ok: true; doubloons?: number; gems?: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return loadout.buyBoat(fishingData(createAdminClient()), user.id, boatId)
}

export async function equipHat(hatId: string | null, opts?: { quiet?: boolean }): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const r = await loadout.equipHat(fishingData(createAdminClient()), user.id, hatId)
  if ('ok' in r && !opts?.quiet) revalidatePath('/sea')   // see equipBoat
  return r
}

/** Equip / unequip a pet; the pet picks its own slot (lib/core/loadout). */
export async function equipPet(petId: string | null, slot: 'stern' | 'bow' = 'stern', opts?: { quiet?: boolean }): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const r = await loadout.equipPet(fishingData(createAdminClient()), user.id, petId, slot)
  // Same reason as the boat: the pet rides on the chart's sprite.
  if ('ok' in r && !opts?.quiet) revalidatePath('/sea')   // see equipBoat
  return r
}

export async function buyHat(hatId: string): Promise<{ ok: true; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return loadout.buyHat(fishingData(createAdminClient()), user.id, hatId)
}

// ── Golden trophy: the Sell or Mount choice (lib/core/fishing) ──────────────

/** The oldest golden still waiting on a sell-or-mount answer, so a stranded
 *  one comes back the next time its captain opens the sea. */
export async function heldGolden(): Promise<{ id: number; name: string; fishId: number; sizeIn: number; alreadyMounted: boolean } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return core.heldGolden(fishingData(createAdminClient()), user.id)
}

export async function sellGoldenTrophy(
  shinyId: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.sellGoldenTrophy(fishingData(createAdminClient()), user.id, shinyId)
}

export async function mountGoldenTrophy(
  shinyId: number,
): Promise<{ ok: true; fishId: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.mountGoldenTrophy(fishingData(createAdminClient()), user.id, shinyId)
}

/** The Completionist forge: which owned rods' effects it carries (lib/core/loadout). */
export async function setCompletionistEffects(
  tiers: number[],
): Promise<{ completionistEffects: number[]; firstForge: boolean; charged: boolean; newDoubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return loadout.setCompletionistEffects(fishingData(createAdminClient()), user.id, tiers)
}


/** Pay every fishing level earned but not yet paid for; idempotent (lib/core/fishing). */
export async function claimFishingLevelRewards(): Promise<core.LevelRewardsClaim> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return core.NO_LEVEL_REWARDS
  return core.claimFishingLevelRewards(fishingData(createAdminClient()), user.id)
}

/**
 * The hold, re-read from the database.
 *
 * FishingGame seeds `inventory` from a server-rendered prop and then only ever
 * mutates it locally, so the moment the browser serves the fishing route from
 * its back/forward cache the count on screen freezes at whatever it was when
 * that snapshot was taken. A player reported the pill reading 38/40 while the
 * cast refused with "hold full", and reading a DIFFERENT stale number each time
 * he came back to the tab, which is exactly what a restored page looks like.
 *
 * Back/forward caching is deliberate on Next's side (it protects scroll position
 * and stops layout shift) and is not something to defeat. Re-reading when the
 * screen becomes visible again is the honest fix: the server stays the authority
 * and the display catches up to it.
 *
 * Same query the fishing page builds the prop from, so the two cannot disagree.
 */
export async function syncFishHold(): Promise<{ fish_id: number; quantity: number; fish_species: {
  id: number; name: string; scientific_name: string
  description: string | null; fun_fact: string; habitat: string
  bite_rarity: number; catch_difficulty: number; catch_score: number; sell_value: number
} }[] | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const data = await fishingData(createAdminClient()).holdWithSpecies(user.id)
  return data as unknown as { fish_id: number; quantity: number; fish_species: {
  id: number; name: string; scientific_name: string
  description: string | null; fun_fact: string; habitat: string
  bite_rarity: number; catch_difficulty: number; catch_score: number; sell_value: number
} }[]
}
