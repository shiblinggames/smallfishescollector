// ── THE FISHING CORE (Steam prep, step 8 spike, 2026-09-28) ──
//
// The cast and the reel, with nothing of the web in them. Each takes the store
// it reads and writes (FishingData) and the captain's id; nothing here knows
// about Supabase, Next, a session or a request. On the web the server actions
// (fishing/actions) check the session, build the Supabase store and call these;
// offline, a local store is passed instead and the same code runs.
//
// Moved verbatim out of fishing/actions. The only edits: the session read
// became the `uid` argument, and the shared helpers became store operations
// (db.grant, db.addToList, db.grantBadge, db.flagAnomaly, db.challengeOverride).
// scripts/check-offline-fishing.mts runs it with no network and proves its
// import tree holds nothing of the server.

import { inCaptainsWater, CAPTAIN_WATER_SAYS } from '@/lib/captainWater'
import { folkById } from '@/lib/seaFolk'
import { eyeFromProfile } from '@/lib/finnItems'
import { getBait } from '@/lib/bait'
import { hotspotAt, hotspotEffect } from '@/lib/seaHotspots'
import { getEffectiveRod, lockedInState } from '@/lib/rods'
import { getFishHold, FISH_HOLD_TIERS } from '@/lib/fishHold'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { fishingRenownEffects, type RenownAlloc } from '@/lib/renown'
import { fishingColorsToGrant } from '@/lib/characters'
import { getLineForSpeciesCount } from '@/lib/lines'
import { getTodayUTC, challengeIncrement } from '@/lib/dailyChallenges'
import { hasPrestigedAllZones } from '@/lib/collection'
import { vigilTotal, vigilComplete, VIGIL_PET_ID, vigilFor, VIGIL_MAX_RANK, ANCIENT_IDS } from '@/lib/ancientVigil'
import { zoneRewardDoubloons, PRESTIGE_MAX } from '@/lib/zoneRewards'
import { type FishSizeTier } from '@/lib/fishSize'
import { ZONE_MIN_LEVEL } from '@/app/(app)/fishing/zoneData'
import { rollCast, landFish, landAncient, reelTooEarly, crateStreak, wormholeExit, rollCatchSize, activeEventOf as getActiveEvent, CRATE_FISH_ID, prestigeStep, type PendingCast } from '@/lib/fishingRules'
import { dailyChallengesWithOverride } from '@/lib/dailyChallenges'
import type { FishingData } from '@/lib/data/fishingData'
import { grantCrateLootTo, type CrateTier, type CrateLoot } from '@/lib/crateLoot'
import { rewardsOwed, type LevelReward } from '@/lib/levelRewards'
import { SHINY_SELL_MULT } from '@/lib/shiny'
import { clockNow } from '@/lib/clock'

/** Now, on the game's clock (the real one on the web; the injected one offline). */
const nowIso = () => new Date(clockNow()).toISOString()

export type FishSpecies = {
  id: number
  name: string
  scientific_name: string
  description: string | null
  fun_fact: string
  habitat: string
  bite_rarity: number
  catch_difficulty: number
  catch_score: number
  sell_value: number
  length_min_in?: number | null
  length_max_in?: number | null
}

/** One regular with an open request for the species just landed. */
export type WaitingFolk = { folkId: string; short: string; fishName: string }

/**
 * ── WHO WAS WAITING ON THIS ONE ────────────────────────────────────────────
 *
 * A regular's request (sea_rapport.want_fish_id, see folkActions) is settled
 * by a fish landed after the ask, and the catch is the only moment the game
 * knows a request has just become deliverable. Read here, once, so the result
 * card can say so and the chart can light the Salt Road without a reopen.
 *
 * Best-effort and read-only: a failed read costs a line of text, never the
 * catch, which has already landed by the time this runs.
 */
async function folkWaitingOn(db: FishingData, userId: string, fishId: number): Promise<WaitingFolk[]> {
  try {
    const out: WaitingFolk[] = []
    for (const folkId of await db.folkWanting(userId, fishId)) {
      const f = folkById(folkId)
      const fav = f?.favourites.find(x => x.id === fishId)
      if (f && fav) out.push({ folkId: f.id, short: f.short, fishName: fav.name })
    }
    return out
  } catch { return [] }
}

export async function castLine(
  db: FishingData,
  uid: string,
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


  // Which patch of water this is, if any. Derived, never trusted.
  const spot = at ? hotspotAt(at.x, at.y) : null
  const hs = hotspotEffect(spot?.kind, spot?.tier)

  const profile = await db.profile(uid, 'rod_tier, completionist_effects, hook_tier, fishing_xp, fish_hold_tier, ancient_catches, ancient_vigil, active_event, catch_pending, pending_cast, fishing_renown_alloc, has_ancient_deep_access, current_perfect_streak, equipped_special_2, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, equipped_raid_items, finn_spoil_free, finn_spoil_paid, pending_reroll, lifetime_species, line_tier, prestige_levels, is_premium, premium_expires_at, is_admin')

  if (!profile) return { error: 'Profile not found' }

  // Casting again is how a player declines a live wormhole reroll, so this is
  // where a deferred species credit lands. Runs before the early returns below
  // (hold full, no bait) — the catch card is already gone either way, so the
  // reroll is forfeit and the fish they actually kept has to be logged.
  await settleDeferredSpeciesCredit(db, uid, profile)

  const bait = getBait(baitType)
  const renownFishing = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null)
  const renownWaitMult = renownFishing.biteWaitMult

  // Validate zone access by fishing level
  const fishingLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const minLevel = ZONE_MIN_LEVEL[habitat] ?? 1
  if (fishingLevel < minLevel) {
    return { error: `Reach Fishing Level ${minLevel} to fish here` }
  }

  // Ancient Deep also gates on campaign progress: you cannot fish the deep the
  // story hasn't taken you to yet. Fishing 75 (above) AND clearing Chapter 3
  // (defeating the Quartermaster). `has_ancient_deep_access` grandfathers anyone
  // who already had access + sticky-caches the unlock so this only queries once.
  if (habitat === 'ancient_deep' && (profile as { has_ancient_deep_access?: boolean }).has_ancient_deep_access !== true) {
    if (!(await db.hasCleared(uid, 'the_quartermaster'))) {
      return { error: 'Clear Chapter 3 (defeat the Quartermaster) to reach the Ancient Deep.' }
    }
    // ── AND IT IS CAPTAIN'S WATER ─────────────────────────────────────────
    // Checked here, inside the "not yet through" branch, so the flag itself
    // is the grandfather: anybody who had already cast in this water keeps
    // it. See lib/captainWater.
    if (!inCaptainsWater(profile)) return { error: CAPTAIN_WATER_SAYS.ancient }
    await db.updateProfile(uid, { has_ancient_deep_access: true })
  }

  // Derive event effects server-side — never trust client flags
  const activeEvent = getActiveEvent(profile.active_event)
  const noBait = activeEvent?.type === 'bloom'
  const eventRarityBonus = activeEvent?.type === 'redtide' ? 0.25 : 0

  // Fetch hold, bait, and candidates in parallel
  const fishHold = getFishHold(profile.fish_hold_tier ?? 0)
  const [totalFish, baitHeld, candidates] = await Promise.all([
    db.holdCount(uid),
    db.baitCount(uid, baitType),
    db.candidates(habitat),
  ])

  // Hold check applies to every zone now. Used to bypass for ancient_deep
  // back when the only catches there were the Ancients (which skip inventory
  // entirely, going to ancient_catches instead). The 12 sellable regulars
  // added 2026-06-09 flow through fish_inventory like every other zone,
  // so a full hold + ancient_deep cast was silently dropping the catch
  // (catchQty clamped to 0 because no slots free). Restore the gate so
  // the player gets a clean 'Hold full' error before burning a cast.
  // Trophy-bias note: yes, this also blocks a lure-only cast that might
  // have landed a trophy. Acceptable — the player can dump a single fish
  // to make room and try again. Worth it to fix the silent-drop bug.
  if (totalFish >= fishHold.capacity) {
    return { error: `Fish hold full (${fishHold.capacity}/${fishHold.capacity}). Sell some fish to make room.` }
  }

  // ── RESUME AN INTERRUPTED CAST ───────────────────────────────────────────
  // A cast that is never reeled leaves its token behind: refreshing the browser
  // calls no server action at all. castLine used to not even SELECT that token,
  // so it rolled fresh and silently overwrote it -- which meant the response
  // (fishId, and CRATE_FISH_ID === -1 for a chest) could be read off the network
  // tab and any roll you did not like thrown back for the price of one worm.
  //
  // The token was already authoritative for what a cast PAYS (reelIn rebinds the
  // client's fishId to it). It is now authoritative for what a cast OWES too:
  // the same roll is handed back until it is resolved, so there is nothing to
  // reroll and no reason to refresh.
  //
  // Bait is still charged PER CAST, including a resume. The sticky roll is what
  // kills the exploit; this is the separate, deliberate rule that walking away
  // mid-cast should sting, alongside the broken streak. It means an interruption
  // you did not choose (locked phone, backgrounded PWA, dropped signal) also
  // costs a bait -- accepted, and unchanged from how it has always behaved.
  const live = (profile as { pending_cast?: PendingCast | null }).pending_cast ?? null
  const resuming = !!live?.shot && live.habitat === habitat

  if (!noBait && (baitHeld == null || baitHeld <= 0)) return { error: 'No bait remaining.' }

  if (resuming && live?.shot) {
    if (!noBait && baitHeld != null) {
      await db.setBaitCount(uid, baitType, baitHeld - 1)
      void db.bumpJsonCounter(uid, 'bait_used', baitType, 1).catch(() => {})
    }
    // A re-cast is a cast for the career stat, even though the roll is the same.
    void db.bumpStat(uid, 'fishing_casts', 1).catch(() => {})
    // Walking away mid-catch still breaks the streak, exactly as before.
    if (((profile as { current_perfect_streak?: number }).current_perfect_streak ?? 0) > 0) {
      await db.updateProfile(uid, { current_perfect_streak: 0 })
    }
    return { ...live.shot, baitRemaining: !noBait && baitHeld != null ? baitHeld - 1 : undefined }
  }

  // TEST ACCOUNT hook: kingkong always hooks an uncaught Ancient trophy in the
  // Ancient Deep, on ANY bait, so the boss reels + Finn cutscenes can be exercised
  // without the RNG grind. Scoped to this one id so it can never touch a real
  // player. The Megalodon gate still applies, so the giants come in order.
  const ALWAYS_ANCIENT_TROPHY = uid === 'a67c8905-45a9-4a71-9720-f6396187fde6'

  const rod = getEffectiveRod(profile.rod_tier ?? 0, profile.completionist_effects as number[] | null)

  // A PERFECT STREAK IS NO LONGER BOUND TO A ZONE: it is yours wherever you
  // fish, and still breaks on a miss, a snag and an abandoned cast.
  const prevStreak = (profile as { current_perfect_streak?: number }).current_perfect_streak ?? 0
  // Locked-In Rod: this cast's power scales with the streak the player has BUILT.
  // An abandoned previous cast (catch_pending) resets the streak below, so this
  // cast sees 0 too. The streak is the server's own, never a client value.
  const castStreak = profile.catch_pending ? 0 : prevStreak

  // ── THE ROLL ─────────────────────────────────────────────────────────────
  // Everything about what this cast IS lives in lib/fishingRules (rollCast):
  // the Ancient Deep pool, crate or fish, which fish, the wait, Lightspeed,
  // jackpot or double, the Locked-In haul and the Vigil rank. It is pure, so
  // it runs before any write: a cast refused there (every giant caught on this
  // bait) costs nothing.
  const roll = rollCast({
    habitat, baitType,
    candidates,
    fishingLevel,
    // THE FIRST ONE IS ALWAYS A FISH, and the commonest one: a captain with no
    // fishing XP is on the tour's first catch.
    firstEver: (profile.fishing_xp ?? 0) === 0,
    ancientCatches: (profile.ancient_catches as number[] | null) ?? [],
    ancientVigil: profile.ancient_vigil,
    rod,
    locked: lockedInState(rod, castStreak),
    // THE ANGLER'S PATIENCE: its strength is its CHARGE (levels on navigation
    // xp while seated). Identity when it is not seated.
    patience: eyeFromProfile(profile),
    renown: renownFishing,
    hotspot: hs,
    eventRarityBonus,
    // A stale token from a DIFFERENT zone cannot be replayed (its species does
    // not live here), but its crate decision is inherited.
    stale: (live?.shot && live.habitat !== habitat) ? live : null,
    alwaysAncientTrophy: ALWAYS_ANCIENT_TROPHY,
  })
  if ('error' in roll) return { error: roll.error }

  // Remember this bait so the fishing UI auto-selects it on next open, and mark
  // the cast in flight. If one was ALREADY pending, the previous cast was
  // abandoned, which breaks the perfect streak just like a miss. catch_pending
  // also catches a crate MISS: a fumbled crate never calls back, so the flag
  // stays set and the next cast zeroes the streak through the same path.
  const castUpdate: Record<string, unknown> = { last_used_bait: baitType, catch_pending: true }
  if (profile.catch_pending) castUpdate.current_perfect_streak = 0
  void db.updateProfile(uid, castUpdate).catch(() => {})

  // Lifetime "Lines Cast" career stat — bump once per committed cast.
  void db.bumpStat(uid, 'fishing_casts', 1).catch(() => {})

  if (!noBait && baitHeld != null) {
    await db.setBaitCount(uid, baitType, baitHeld - 1)
    void db.bumpJsonCounter(uid, 'bait_used', baitType, 1).catch(() => {})
  }

  // Persist the server-rolled token: reelIn / reelCrate bind to THIS (the fish,
  // the crate tier, the haul) and clear it one-shot, so the client can never
  // name its own. Awaited so it commits before the client can call back.
  await db.updateProfile(uid, { pending_cast: roll.token })

  return { ...roll.shot, baitRemaining: !noBait && baitHeld != null ? baitHeld - 1 : undefined }
}

const PERFECT_BAIT_SAVE_CHANCE = 0.5

/** Log one catch of `fishId`. Counts CASTS, not fish: a ×100 jackpot haul is a
 *  single catch of that species, so the count moves by 1 however many fish came
 *  aboard. Returns whether this was a first sighting THIS CYCLE.
 *
 *  Writes to two places, and the difference matters:
 *
 *  fish_collection is the PRESTIGE-CYCLE log. Prestiging a zone deletes its
 *  non-golden rows on purpose, because re-collecting the zone is the loop and
 *  the selector's "24 of 31 logged" has to mean this cycle.
 *
 *  fish_lifetime is the career, and nothing ever deletes it. The Almanac reads
 *  that one, so a prestige no longer shortens your record: counts, first and
 *  last sighting, and every aggregate built on them survive. Fire-and-forget,
 *  since a lost lifetime tick must never cost the player the catch itself. */
export async function logCatchToBestiary(
  db: FishingData,
  userId: string,
  fishId: number,
): Promise<boolean> {
  const now = nowIso()
  void db.bumpLifetime(userId, fishId, now).catch(() => {})
  const existing = await db.collectionRow(userId, fishId)
  await db.logCatch(userId, fishId, existing, now)
  return !existing
}

/** Settle a species credit that reelIn deferred because a wormhole reroll was
 *  live. Called when the player declines the reroll — by casting again, which
 *  is the only way out of the catch card that does not go through
 *  rerollWormhole. Rerolling consumes the same token instead, so the original
 *  is never credited and the wormhole stops logging two species per cast.
 *
 *  Clears the token whatever happens, so a catch can only ever settle once. */
export async function settleDeferredSpeciesCredit(
  db: FishingData,
  userId: string,
  profile: { pending_reroll?: unknown; lifetime_species?: unknown; line_tier?: number | null; prestige_levels?: unknown } | null,
) {
  const pending = (profile?.pending_reroll ?? null) as { fishId: number } | null
  if (!pending) return
  if (!(await db.claimPendingReroll(userId))) return
  const wasNew = await logCatchToBestiary(db, userId, pending.fishId)
  if (wasNew) await creditNewSpecies(db, userId, pending.fishId, profile)
}

/** Everything that has to happen the first time a species is landed, shared by
 *  reelIn and rerollWormhole. A species that arrives through the wormhole was
 *  still landed, so it has to count exactly the same — this used to live only
 *  in reelIn, which left a wormhole-only species short of a line-tier bump and
 *  the Full Collection badge. */
export async function creditNewSpecies(
  db: FishingData,
  userId: string,
  newFishId: number,
  profile: { lifetime_species?: unknown; line_tier?: number | null; prestige_levels?: unknown } | null,
) {
  const [nonAncientIds, caught] = await Promise.all([
    db.nonAncientSpeciesIds(),
    db.collectionIds(userId),
  ])
  const caughtIds = new Set(caught)
  // Lifetime species set — only ever grows, so a prestige wipe can't set the
  // collection badges back. Union the stored set with the current collection
  // (self-heals any drift) and this catch, and persist it if it grew.
  const storedLifetime = (profile?.lifetime_species as number[] | null) ?? []
  const lifetimeSet = new Set<number>([...storedLifetime, ...caughtIds, newFishId])
  if (lifetimeSet.size > storedLifetime.length) {
    await db.updateProfile(userId, { lifetime_species: [...lifetimeSet] })
  }
  // Line tier progresses on TOTAL species caught (Ancient Deep included).
  const newLineTier = getLineForSpeciesCount(lifetimeSet.size).tier
  if (newLineTier > (profile?.line_tier ?? 0)) {
    await db.updateProfile(userId, { line_tier: newLineTier })
  }
  // Full Collection = every NON-ancient species landed. The Ancient Deep
  // giants are a separate trophy hunt (their own badges), so they don't count
  // here — matches the badges-page rule. Judged off the lifetime set so a
  // prestige before the badge lands doesn't lock it out.
  const nonAncientCaught = nonAncientIds.filter(id => lifetimeSet.has(id)).length
  // Prestiging all four zones proves the whole non-ancient set too (see lib/collection).
  if ((nonAncientIds.length > 0 && nonAncientCaught >= nonAncientIds.length) || hasPrestigedAllZones(profile?.prestige_levels as Record<string, number> | null)) {
    await db.grantBadge(userId, 'full_collection')
  }
}

// Phase 2 — process reel-in result
export async function reelIn(
  db: FishingData,
  uid: string,
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

  const isCatch = result === 'perfect' || result === 'catch'

  // Snag: consume one extra bait. The bait is the one the CAST used, off the
  // server's token, never the caller's argument.
  if (result === 'penalty') {
    const snagBait = (await db.pendingCast(uid))?.baitType
    const baitHeld = snagBait ? await db.baitCount(uid, snagBait) : null

    // Only if the count still reads what we saw: a snag racing a cast must
    // not charge twice.
    if (snagBait && baitHeld != null && baitHeld > 0) {
      await db.setBaitCount(uid, snagBait, baitHeld - 1, baitHeld)
    }
    // Lifetime snag counter (line lost) — admin stat.
    await db.bumpStat(uid, 'fishing_snags', 1)
  }

  if (!isCatch) {
    // A missed / snagged cast breaks the perfect streak — server-authoritative
    // (the client value is never trusted). Also clears the in-flight flag AND
    // the pending-cast token so it can't be reeled later.
    await db.updateProfile(uid, { current_perfect_streak: 0, catch_pending: false, pending_cast: null })
    return { caught: false }
  }

  const [profile, holdCount] = await Promise.all([
    db.profile(uid, 'doubloons, fishing_abyss_streak, fishing_xp, rod_tier, completionist_effects, fish_hold_tier, has_phantom_hook, has_perfected_sigil, equipped_special, equipped_special_2, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, equipped_raid_items, finn_spoil_free, finn_spoil_paid, line_tier, prestige_levels, ancient_catches, ancient_vigil, unlocked_pets, unlocked_character_colors, total_perfects, zone_perfects, current_perfect_streak, highest_perfect_streak, force_shiny_next_perfect, force_shiny_always, fishing_renown_alloc, pending_cast, zone_golden_boost, lifetime_species'),
    db.holdCount(uid),
  ])

  if (!profile) {
    // NOT "Data not found". That string was going to the player, painted over
    // the sea, and it says nothing to anyone who does not have this file open.
    // The cast is NOT consumed here — the token is claimed further down — so
    // the honest thing to say is "try again", because trying again works.
    console.error('[reelIn] profile read failed', { userId: uid })
    return { error: 'The line went slack. Reel in again.' }
  }

  // THE PRIMEVAL EYE. Resolved HERE, at the top of the grant, because its
  // tiers touch three different things further down (the golden roll, the XP,
  // and nothing below may read it before it exists). Identity when the slot is
  // shut or the eye is elsewhere.
  const eye = eyeFromProfile(profile)

  // ── Bind to the server-rolled cast token (anti-forgery) ──────────────────
  // castLine wrote pending_cast with the TRUE fish id + haul multipliers. Claim
  // it one-shot: the atomic null-ing gates on `pending_cast is not null`, so of
  // any concurrent reelIn calls exactly one wins, and each legitimate cast
  // yields at most one catch. If there's no live cast, nothing is minted. The
  // client's fishId / doubleCatch / jackpotMultiplier arguments are IGNORED —
  // we rebind them to the token, so a caller can't pick a legendary, force a
  // ×100 jackpot, or reel without casting.
  const token = profile.pending_cast as PendingCast | null
  if (!token || token.fishId === CRATE_FISH_ID) return { caught: false }

  // ── AND IT CANNOT HAVE BITTEN YET ─────────────────────────────────────────
  //
  // The token pins WHAT was on the line; this pins WHEN. castLine stamps the
  // cast with the server's clock and hands the client the wait it rolled, and
  // the client will not show a bite before max(760ms, that wait) has passed
  // (FishingHere), let alone the dial after it. So a reel that arrives sooner
  // than the bite could have happened did not come from the dial. It came from
  // a script replaying castLine and reelIn back to back, which is the one
  // forgery the token alone does not stop: the fish is real, the timing is not.
  //
  // Every clock here is the server's. castAt was written by this file, and
  // the response then had to travel to a phone and the timer start there, so
  // an honest reel is always LATER than this floor, never at it. Nothing is
  // added for the dial itself, because its minimum is not pinned down and a
  // floor that is too low costs nothing while one that is too high costs a
  // real catch.
  //
  // REFUSED WITHOUT SPENDING THE CAST. The claim is further down; this returns
  // before it, so the line is still out and reeling again is the answer. A
  // scripted caller gets a refusal, and a real player can never be here.
  const early = reelTooEarly(token)
  if (early.early) {
    console.warn('[reelIn] reel before the bite', { userId: uid, elapsed: early.elapsed, biteFloorMs: early.floor })
    return { error: 'Nothing has bitten yet. The line is still out.' }
  }

  /**
   * ── THE SPECIES IS READ BEFORE THE TOKEN IS SPENT ─────────────────────────
   *
   * This read used to sit AFTER the claim, and the claim is what consumes the
   * cast. So any failure here — a dropped connection, a species row that is
   * somehow not there — burned the cast and granted nothing: the player reeled
   * in, watched the fish land, and got an error where the catch should have
   * been. One lost fish per failure, and no way to tell afterwards that it had
   * happened.
   *
   * Reading first costs nothing (it mutates nothing, and a forged `fishId`
   * cannot reach it — the id comes off the server's own token, never the
   * caller's argument) and it means a failure leaves the cast exactly where it
   * was. Reel again and the same fish is still on the hook.
   */
  const fish = await db.species(token.fishId)
  if (!fish) {
    console.error('[reelIn] species read failed', { userId: uid, fishId: token.fishId })
    return { error: 'The line went slack. Reel in again.' }
  }

  // AND NOW IT IS SPENT. Atomic and one-shot: the null-ing gates on
  // `pending_cast is not null`, so of any concurrent reelIn calls exactly one
  // wins, and each legitimate cast yields at most one catch. The client's
  // fishId / doubleCatch / jackpotMultiplier arguments are IGNORED — they are
  // rebound to the token, so a caller cannot pick a legendary, force a x100
  // jackpot, or reel without casting.
  //
  // The claim matches THIS token's castAt, not just "some token is there": a
  // reel that read one cast must not be able to spend a newer cast that landed
  // in between and be paid for the old one.
  if (!(await db.claimCast(uid, token.castAt))) return { caught: false }
  fishId = token.fishId
  doubleCatch = token.doubleCatch
  jackpotMultiplier = token.jackpotMult
  // The bait is the token's too. The argument was used for the bait-save refund
  // below, so a worm cast could be refunded as a Golden Lure.
  baitType = token.baitType
  const lockedCatchQty = token.catchQty ?? 1   // Locked-In Rod guaranteed haul (3 at streak 5+)

  // Fishing Renown (post-100): a tiny XP multiplier on every catch (Wisdom).
  const renownXpMult = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null).xpMult

  // Ancients path: ancient_deep fish WITH sell_value 0 are the original 6
  // prehistoric giants (the Ancients) — they go straight to ancient_catches,
  // skip hold/collection/bounty. Sellable ancient_deep fish (sell_value > 0)
  // are the new 6 regulars added 2026-06-10; they fall through to the
  // normal catch path below so they stack in fish_inventory like every
  // other zone's catches. The multi-phase boss reel UI on the client
  // applies to ALL ancient_deep fish regardless — that's a client-only
  // catch-mechanic concern, not a server routing one.
  if (fish.habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0) {
    // ONE OF THE SIX GIANTS. What it pays (XP, the streak, the Vigil ladder,
    // the capstone pet, the Sigil) is lib/fishingRules landAncient; this writes
    // it. ancient_catches stays append-only: it is the finale's gate.
    const land = landAncient(profile, fishId, result, renownXpMult)
    if (land.anomaly) await db.flagAnomaly(uid, 'implausible:perfectStreak', 3, { claimed: land.perfectStreak })
    // THE CAPSTONE PET, added in place so a crate pet landing meanwhile is not
    // written over.
    const vigilPetGranted = land.grantVigilPet ? await db.addToList(uid, 'unlocked_pets', VIGIL_PET_ID) : false
    for (const b of land.badges) await db.grantBadge(uid, b)
    await db.updateProfile(uid, land.updates)
    // Paid in place rather than riding the update above as an absolute
    // balance, which would write over a sale that landed during the reel.
    const ancientNewDoubloons = land.sigilBonus > 0
      ? await db.grant(uid, 'doubloons', land.sigilBonus)
      : undefined

    // ── First-ever Ancient Deep catch contest ───────────────────────────
    // Atomic claim via the contests table's PK constraint: whichever
    // INSERT lands first wins; everyone else's INSERT silently no-ops
    // via ON CONFLICT DO NOTHING. Whoever pulled it off gets a targeted
    // mail with claim instructions for the custom-boat prize.
    let firstAncientCatch = false
    {
      if (await db.claimContest('first_ancient_catch', uid, 'ANCIENT-FIRST')) {
        firstAncientCatch = true
        // Targeted mail — the prize details + claim instructions. Only
        // the winner sees it in their inbox (target_user_id filter).
        await db.mailTo(uid, {
          subject: '🏆 First Ancient Deep Catch: Custom Boat Prize',
          body: "You did it. You're the first captain ever to land a fish in the Ancient Deep.\n\nAs promised, you've won a custom boat designed for you. Reply to this email to claim it:\n\nhello@shiblinggames.com\n\nInclude your prize code: ANCIENT-FIRST\n\nWe'll work with you on the design. Welcome to the deep.\n\n— Cap'n Shibling",
          sender: "Cap'n Shibling",
        })
      }
    }
    // Ancients have one canonical size each (length_min_in === length_max_in
    // per the migration). No PB chase since each ancient is a one-time catch
    // stored in ancient_catches. Display the size for flavor; skip tier chrome
    // + range bar (no comparison to make).
    const ancientSize = Number(fish.length_min_in ?? 0)
    return {
      caught: true,
      fish: fish as FishSpecies,
      baitSaved: false,
      isNewSpecies: land.isNewTrophy,
      xpGained: land.xpGained,
      newXP: land.newXP,
      dailyProgress: [0, 0, 0],
      perfectStreak: land.perfectStreak,
      streakBonusXP: 0,
      sizeIn: ancientSize,
      isPB: false,
      previousBest: null,
      // Ancients can never roll shiny (habitat-blocked in lib/shiny rollShiny).
      isShiny: false,
      sigilBonus: land.sigilBonus,
      newDoubloons: ancientNewDoubloons,
      firstAncientCatch,
      // Set only when a RELEASED giant was landed on a perfect — drives the
      // rank-up celebration and the wall's new numeral.
      vigilRankUp: land.vigilRankUp,
      vigilTotal: land.vigilWritten ? vigilTotal(land.vigil) : undefined,
      vigilComplete: land.vigilWritten ? vigilComplete(land.vigil) : undefined,
      vigilPetGranted,
    }
  }

  // ── THE LANDING ────────────────────────────────────────────────────────
  // What this fish pays is lib/fishingRules landFish: the bait save, the shiny,
  // the haul clamped to the hold, the XP and its three reported parts, the
  // streak, the Sigil, the Wormhole, the size and the Ancient Deep's omen. This
  // action writes it.
  const reelRod = getEffectiveRod(profile.rod_tier ?? 0, profile.completionist_effects as number[] | null)
  const land = landFish({
    profile, fish, result, baitType, rod: reelRod, eye, renownXpMult,
    doubleCatch, jackpotMult: jackpotMultiplier, lockedCatchQty,
    holdCount,
    holdCapacity: getFishHold(profile.fish_hold_tier ?? 0).capacity,
  })
  const { baitSaved, isShiny, catchQty, xpGained, newXP, xpCatch, perfectBonusXP, xpStreak, sigilBonus } = land
  const isPerfect = result === 'perfect'
  const newPerfectStreak = land.perfectStreak
  const serverStreakBonus = land.streakBonusXP
  const wormholeAvail = land.wormhole
  const oldFishingLevel = land.levels.from
  const newFishingLevel = land.levels.to
  const { sizeIn, sizeTier, sizeMin: sizeMinIn, sizeMax: sizeMaxIn } = land.size

  // Check if new species for bestiary. The WRITE is deferred until we know
  // whether a wormhole reroll is live — see the credit block below.
  const isNewSpecies = !(await db.collectionRow(uid, fishId))

  // Shinies skip the regular inventory — they live ONLY in shiny_catches
  // (per-instance trophy). Any double-catch / jackpot bonus on the same
  // cast is consumed by the rare moment; the shiny is the whole catch.
  const had = await db.holdQty(uid, fishId)
  if (catchQty > 0 && !isShiny) await db.addToHold(uid, fishId, catchQty, had)

  // ── BESTIARY CREDIT, DEFERRED WHEN A REROLL IS LIVE ────────────────────────
  // Crediting unconditionally made the wormhole log TWO species per cast. When
  // a reroll is available the credit is held on pending_reroll and settled by
  // whichever comes first: rerollWormhole (credits the NEW fish only) or the
  // next castLine (the player declined, so this fish is credited after all).
  if (!wormholeAvail) {
    await logCatchToBestiary(db, uid, fishId)
    if (isNewSpecies) await creditNewSpecies(db, uid, fish.id, profile)
  }

  const profileUpdates: Record<string, unknown> = {
    ...land.updates,
    pending_reroll: wormholeAvail ? { fishId, qty: catchQty, habitat: fish.habitat } : null,
  }
  // Ceiling-guarded like the other two record sites; see STREAK_RECORD_CEILING.
  if (land.anomaly) await db.flagAnomaly(uid, 'implausible:perfectStreak', 3, { claimed: newPerfectStreak })
  let reelInUnlockedSkin: string | undefined
  {
    // STATE-based, not transition-based: grant any fishing-level color the
    // player has earned but doesn't own yet (self-heals on the next catch).
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    const toAdd = fishingColorsToGrant(newFishingLevel, currentUnlocked)
    if (toAdd.length > 0) {
      // Added in place, so a skin bought during the reel is not written over.
      for (const id of toAdd) await db.addToList(uid, 'unlocked_character_colors', id)
      reelInUnlockedSkin = toAdd[toAdd.length - 1]
    }
  }
  for (const b of land.badges) await db.grantBadge(uid, b)

  // The Sigil pays in place and the saved bait goes back in place, so neither
  // writes over a sale or a cast that landed while this reel was running.
  const [, newDoubloons] = await Promise.all([
    db.updateProfile(uid, profileUpdates),
    sigilBonus > 0 ? db.grant(uid, 'doubloons', sigilBonus) : Promise.resolve(undefined),
    baitSaved ? db.addBait(uid, baitType, 1) : Promise.resolve(null),
  ])

  // Lifetime event counters (admin stats) — only fire on the event.
  if (land.effectiveDoubleCatch)     await db.bumpStat(uid, 'fishing_double_catches', 1)
  if (land.effectiveJackpotMult > 1) await db.bumpStat(uid, 'fishing_jackpots', 1)

  // ── Size + personal best (non-ancient catches) ──
  // The size was rolled in landFish; the badge, the counter and the PB row
  // are written here.
  let isPB = false
  let previousBest: number | null = null
  if (sizeMinIn != null && sizeMaxIn != null) {
    // Trophy Catch badge + the lifetime Trophy-SIZE counter (Trophy Hunter).
    if (sizeTier === 'trophy') {
      try { await db.grantBadge(uid, 'trophy_catch') } catch { /* best-effort */ }
      void db.bumpStat(uid, 'trophy_size_catches', 1).catch(() => {})
    }
    previousBest = await db.personalBest(uid, fishId)
    isPB = previousBest == null || sizeIn > previousBest
    if (isPB) await db.setPersonalBest(uid, fishId, sizeIn, nowIso())
  }

  // Update daily challenge progress.
  //
  // The challenges shown to the player depend on their fishing level
  // (so they don't get e.g. an Abyss challenge when Abyss is still
  // locked). To keep the set stable within a day even when they level
  // up across a zone boundary, we snapshot the level into
  // daily_challenge_progress.fishing_level_snapshot on first touch and
  // reuse it for the rest of the day.
  const dailyDate = getTodayUTC()

  // ── Shiny persistence + admin-flag consume ───────────────────────
  // The roll itself happened above (so the size logic could lock to
  // species max on shinies — see the size block). Here we persist the
  // row, capture its id for the forced-choice modal, and check whether
  // the species is already mounted (which disables the Mount option).
  let shinyId: number | undefined
  let alreadyMounted = false
  if (isShiny) {
    shinyId = await db.addShiny(uid, fish.id, sizeIn > 0 ? sizeIn : null)
    alreadyMounted = !!(await db.collectionRow(uid, fish.id))?.is_golden
  }
  // Consume the test flag on any Perfect — whether or not it triggered
  // the override (so a habitat-blocked Perfect doesn't strand the flag
  // forever). Non-perfects leave it alone so QA can keep waiting for
  // the right moment.
  if (profile.force_shiny_next_perfect && isPerfect) {
    await db.updateProfile(uid, { force_shiny_next_perfect: false })
  }

  const dailyRow = await db.dailyProgress(uid, dailyDate)

  // oldFishingLevel was computed above (line ~473) from the pre-catch
  // XP — that's the right level to lock in for today, even if THIS
  // catch is the one that pushes them across a zone boundary.
  const snapLevel = dailyRow?.fishing_level_snapshot ?? oldFishingLevel
  const dailyChallenges = dailyChallengesWithOverride(dailyDate, await db.challengeOverride(dailyDate), snapLevel)

  // Three challenges, or FOUR once the player is past the Master gate. Driven
  // off the array length rather than a hardcoded three so the fourth slot can
  // never be silently dropped, and so nothing breaks for the ~87% of players
  // who do not have it.
  const priorP = [dailyRow?.p1 ?? 0, dailyRow?.p2 ?? 0, dailyRow?.p3 ?? 0, dailyRow?.p4 ?? 0]
  const newP = dailyChallenges.map((c, i) => Math.min(
    priorP[i] + challengeIncrement(c, fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
    c.target,
  ))

  // Persist the snapshot on first touch (no-op after, since it does not change).
  await db.saveDailyProgress(uid, dailyDate, newP, snapLevel)

  // Ancient Deep breadcrumb (see `deepStirs` in the return type): on a regular
  // landed with common bait while giants remain uncaught, RARELY let a faint
  // omen through. Never on the lures (that player already knows), never once all
  // 6 giants are on the wall. Deliberately rare + vague so it reads as ambience,
  // not a tutorial.
  const deepStirs = land.deepStirs

  // Who asked for this. After the inventory write, so "in your hold" is true
  // by the time anybody reads it.
  const waitingOn = await folkWaitingOn(db, uid, fishId)

  return {
    caught: true,
    fish: fish as FishSpecies,
    baitSaved,
    isNewSpecies,
    waitingOn: waitingOn.length ? waitingOn : undefined,
    deepStirs,
    xpGained,
    newXP,
    dailyProgress: newP,
    unlockedSkinId: reelInUnlockedSkin,
    perfectStreak: newPerfectStreak,
    streakBonusXP: serverStreakBonus,
    xpCatch,
    perfectBonusXP,
    xpStreak,
    sizeIn,
    sizeMin: sizeMinIn ?? undefined,
    sizeMax: sizeMaxIn ?? undefined,
    sizeTier,
    isPB,
    previousBest,
    isShiny,
    shinyId,
    alreadyMounted,
    sigilBonus,
    newDoubloons,
    wormhole: wormholeAvail,
    catchQty,
  }
}

// ── THE REST OF THE CAST (step 8, 2026-09-28) ─────────────────────────────────
//
// The crate, the wormhole, the Tide Turner, the golden choice and the level
// rewards, moved out of fishing/actions like the cast and the reel: the session
// read became `uid`, and the shared helpers became store operations.

/** Galaxy Rod — "Wormhole" reroll. Consumes the single-use pending_reroll set
 *  by reelIn and replaces the just-caught fish in the player's hold with a
 *  DIFFERENT random fish from the same zone (weighted by normal rarity odds via
 *  the Galaxy Rod's rarity bias — can be better OR worse). One-shot per catch:
 *  pending_reroll is cleared whether or not a better fish surfaces. */
export async function rerollWormhole(db: FishingData, uid: string): Promise<
  | { ok: true; fish: FishSpecies; qty: number; isNewSpecies: boolean; sizeIn: number; sizeMin?: number; sizeMax?: number; sizeTier?: FishSizeTier; isPB: boolean; previousBest: number | null }
  | { error: string }
> {
  const profile = await db.profile(uid, 'rod_tier, completionist_effects, pending_reroll, lifetime_species, line_tier, prestige_levels')
  const pending = (profile?.pending_reroll ?? null) as { fishId: number; qty: number; habitat: string } | null
  if (!pending) return { error: 'No catch to reroll.' }

  // Claim the token ATOMICALLY so this is strictly one-shot. A plain update
  // here let a double-tap through: both calls read the same `pending` and both
  // reached the grant below. The conditional update means exactly one caller
  // ever sees a row back.
  if (!(await db.claimPendingReroll(uid))) return { error: 'No catch to reroll.' }

  const { fishId: origId, qty, habitat } = pending

  // reelIn deferred this catch's bestiary credit to whichever settles the
  // token, and that is now us. So every bail-out below has to log the fish the
  // player actually landed on the way out — otherwise a failed reroll would
  // quietly erase the catch from their log. Only the success path skips it,
  // because there the original stopped being what they landed.
  const abortWithCredit = async (error: string): Promise<{ error: string }> => {
    const wasNew = await logCatchToBestiary(db, uid, origId)
    if (wasNew) await creditNewSpecies(db, uid, origId, profile)
    return { error }
  }

  // Pick where the wormhole comes out FIRST. This is all read-only, so the
  // failure paths below bail before the player's hold has been touched.
  const candidates = await db.candidates(habitat)
  // A wormhole sends you somewhere ELSE — exclude the original so the reroll
  // always lands on a different fish. Trophies (sell_value 0) never apply here
  // since ancient_deep is ineligible for the wormhole.
  const rod = getEffectiveRod(profile?.rod_tier ?? 0, profile?.completionist_effects as number[] | null)
  const picked = wormholeExit(candidates, origId, habitat, rod)
  if (!picked) return abortWithCredit('The wormhole found nothing new.')
  const newFish = await db.species(picked.id)
  if (!newFish) return abortWithCredit('The wormhole collapsed.')

  // ── CONSUME THE ORIGINAL, THEN GRANT ───────────────────────────────────────
  // A wormhole swaps one stack for another; it does not conjure a second one.
  // Selling the catch and THEN opening the wormhole used to skip the removal
  // (missing row, or Math.max clamping at 0) while the grant still ran — a
  // clean duplication faucet, worst on a ×100 jackpot haul. So the removal
  // happens BEFORE the grant, and it doubles as the guard: the write carries
  // the quantity it read, so a sale landing in between matches zero rows and
  // the reroll refuses instead of minting fish.
  const HOLD_GONE = () => abortWithCredit('That catch is already out of your hold. The wormhole needs something to send.')
  if (!(await db.takeFromHold(uid, origId, qty))) return HOLD_GONE()
  await db.addToHold(uid, newFish.id, qty, await db.holdQty(uid, newFish.id))

  // Bestiary — this fish is what the cast actually landed, so it takes the
  // credit reelIn deferred. Counts the CAST, not the fish, matching reelIn: a
  // rerolled ×100 haul is one catch of the species, not a hundred.
  const isNewSpecies = await logCatchToBestiary(db, uid, newFish.id)

  // A species landed through the wormhole counts exactly as one landed on the
  // line: lifetime set, line tier and the Full Collection badge all move.
  if (isNewSpecies) {
    await creditNewSpecies(db, uid, newFish.id, profile)
  }

  // Size + PB for the new fish (mirrors the catch path; ancients excluded).
  const { sizeIn, sizeTier, sizeMin: sizeMinIn, sizeMax: sizeMaxIn } = rollCatchSize(newFish)
  let isPB = false
  let previousBest: number | null = null
  if (sizeMinIn != null && sizeMaxIn != null) {
    previousBest = await db.personalBest(uid, newFish.id)
    isPB = previousBest == null || sizeIn > previousBest
    if (isPB) await db.setPersonalBest(uid, newFish.id, sizeIn, nowIso())
  }

  return {
    ok: true,
    fish: newFish as FishSpecies,
    qty,
    isNewSpecies,
    sizeIn,
    sizeMin: sizeMinIn ?? undefined,
    sizeMax: sizeMaxIn ?? undefined,
    sizeTier,
    isPB,
    previousBest,
  }
}

/** Opens the crate AND moves the perfect streak, which is why it needs the reel
 *  result. Returns the server's streak so the client syncs to it rather than
 *  guessing: the streak is server-authoritative everywhere else and a crate is
 *  no different. */
export async function reelCrate(db: FishingData, uid: string, result: 'perfect' | 'catch' = 'catch'): Promise<(CrateLoot & { perfectStreak?: number }) | { error: string }> {
  const profile = await db.profile(uid, 'pending_cast, current_perfect_streak, highest_perfect_streak')

  // Bind to the server-rolled crate token (anti-forgery). castLine chose the
  // tier and stored it; claim it one-shot via the atomic null-ing. The client's
  // `tier` argument is IGNORED, and a call with no live crate cast opens nothing
  // — closing the "loop reelCrate('diamond') with no cast" doubloon faucet.
  const crateToken = profile?.pending_cast as PendingCast | null
  if (!profile || !crateToken || crateToken.fishId !== CRATE_FISH_ID || !crateToken.crateTier) {
    return { error: 'No crate to open.' }
  }

  // THE SAME BITE FLOOR reelIn applies, for the same reason: a crate opened
  // sooner than it could have surfaced came from a script, not the dial.
  // Refused before the claim, so an honest line is never spent by it.
  const early = reelTooEarly(crateToken)
  if (early.early) {
    console.warn('[reelCrate] reel before the bite', { userId: uid, elapsed: early.elapsed, biteFloorMs: early.floor })
    return { error: 'Nothing has bitten yet. The line is still out.' }
  }

  // One-shot, and matched to THIS token's castAt so a newer cast landing in
  // between cannot be spent in its place.
  if (!(await db.claimCrateCast(uid, crateToken.castAt))) return { error: 'No crate to open.' }

  // ── The streak ────────────────────────────────────────────────────────────
  // Same rule a fish gets: a perfect reel adds one, anything less resets to
  // zero. Server-authoritative, off the server's own current_perfect_streak,
  // never a client value. catch_pending clears here because the cast resolved;
  // a MISSED crate never reaches this function, so its flag stays set and the
  // next cast zeroes the streak exactly as an abandoned fish does.
  //
  // Deliberately NOT bumped here: total_perfects, the shiny rolls and the Finn
  // perfect challenge. Those are about landing FISH well, and a crate is not a
  // fish. This moves the streak and nothing else.
  // The rule is lib/fishingRules crateStreak; ceiling-guarded like the fish paths.
  const { streak, updates: streakUpdate, anomaly } = crateStreak(profile, result, crateToken.habitat)
  if (anomaly) await db.flagAnomaly(uid, 'implausible:perfectStreak', 3, { claimed: streak })
  await db.updateProfile(uid, streakUpdate)

  // ── THE CRATE THE BADGES COUNT ──────────────────────────────────────────
  //
  // Both tallies are bumped HERE rather than inside the shared roller, and
  // that is the whole point: this is the one path where a crate came up on
  // the line. The weekly free crate and the Master challenge's payout roll
  // through the same loot table and must not feed the crate badges, which are
  // about fishing one up. See the note in crateLoot.
  //
  // The lifetime total the badges read, then the per-tier tally the Almanac
  // shows. Fire-and-forget: a lost counter is a counter, and a crate opening
  // must not stall behind one.
  void db.bumpStat(uid, 'fishing_crates_opened', 1).catch(() => {})
  void db.bumpJsonCounter(uid, 'crate_opens', crateToken.crateTier, 1).catch(() => {})

  // Token validated — hand off to the shared roller (grants + returns the loot).
  const loot = await grantCrateLootTo(db, uid, crateToken.crateTier)
  return 'error' in loot ? loot : { ...loot, perfectStreak: streak }
}

/** The Tide Turner: skip the fish on the line without breaking the streak. */
export async function tideTurnerSkip(db: FishingData, uid: string): Promise<{ ok: true; skipsLeft: number } | { error: string }> {
  const profile = await db.profile(uid, 'has_tide_turner, equipped_special, tide_turner_used, tide_turner_date')

  if (!profile) return { error: 'Profile not found' }
  if (!profile.has_tide_turner) return { error: 'No Tide Turner' }
  // AND IT HAS TO BE IN THE SLOT. This checked ownership only, so the server
  // would honour a skip from an unequipped Tide Turner — the fishing screen
  // simply never offered the button, which made a UI rule look like a guard.
  // The sea offered it, and that is how the gap surfaced.
  if (profile.equipped_special !== 'tide_turner') return { error: 'Your Tide Turner is not equipped' }

  const todayStr = nowIso().split('T')[0]
  const usedToday = profile.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  if (usedToday >= 3) return { error: 'No skips remaining today' }

  const newUsed = usedToday + 1
  // RELEASE the hooked fish as a SANCTIONED skip: clear the pending catch so the
  // next cast doesn't trip castLine's anti-bail reset (a lingering catch_pending
  // zeroes current_perfect_streak on the following cast). Crucially we do NOT
  // touch current_perfect_streak here — skipping a fish WITHOUT breaking the
  // streak is the Tide Turner's entire purpose.
  await db.updateProfile(uid, { tide_turner_used: newUsed, tide_turner_date: todayStr, catch_pending: false, pending_cast: null })
  return { ok: true, skipsLeft: 3 - newUsed }
}

// ── Golden trophy: on-the-spot Sell or Mount choice ─────────────────
// A shiny catch lands as a row in shiny_catches with status='hold'.
// The forced-choice modal in the catch result calls one of these to
// resolve it — both transition the row to a terminal status (sold or
// mounted) so the trophy can never be re-resolved. The choice is
// final per-trophy by design: the moment is meant to land with
// weight, not be deferred into a hold list.

/**
 * ── A GOLDEN STILL WAITING TO BE ANSWERED ───────────────────────────────────
 *
 * A shiny is written into `shiny_catches` at status 'hold' the moment it is
 * caught, and it stays there until you sell it or mount it. The choice lived
 * INSIDE the catch card, so dismissing the card — a tap anywhere, a refresh, a
 * navigation, closing the tab — left the row on hold with nothing anywhere in
 * the app able to reach it again. The fish was never lost; it was stranded, and
 * from the deck the two are the same thing.
 *
 * It was not a rare accident either. When this was written there were FORTY
 * held rows against seventeen ever resolved, across nine captains, the oldest
 * from June: seventy percent of every golden ever caught. Not one had ever been
 * mounted, by anybody.
 *
 * So the choice is now recoverable rather than a moment you have to catch. This
 * returns whatever is still on hold, the chart asks on load, and the modal
 * cannot be dismissed without answering it. A stranded golden comes back the
 * next time its captain opens the sea.
 */
export async function heldGolden(db: FishingData, uid: string): Promise<{ id: number; name: string; fishId: number; sizeIn: number; alreadyMounted: boolean } | null> {
  const held = await db.oldestHeldShiny(uid)
  if (!held) return null

  // Whether this species is already on the wall, which is what decides if
  // Mount is even offered. Read here rather than trusted from the catch, since
  // a held row can be days old and the wall may have changed since.
  const existing = await db.collectionRow(uid, held.fish_id)

  return {
    id: held.id,
    name: held.name ?? 'A golden fish',
    fishId: held.fish_id,
    sizeIn: Number(held.size_in ?? 0),
    alreadyMounted: existing?.is_golden === true,
  }
}

export async function sellGoldenTrophy(db: FishingData, uid: string, shinyId: number): Promise<{ earned: number; doubloons: number } | { error: string }> {
  const trophy = await db.shiny(uid, shinyId)
  if (!trophy) return { error: 'Trophy not found' }
  if (trophy.status !== 'hold') return { error: 'Trophy already resolved' }
  if (!trophy.fish_species) return { error: 'Species not found' }

  const profile = await db.profile(uid, 'doubloons, fishing_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
  const renownSellMult = fishingRenownEffects(profile?.fishing_renown_alloc as RenownAlloc | null).sellMult * eyeFromProfile(profile).sellMult
  const earned = Math.floor((trophy.fish_species.sell_value ?? 0) * SHINY_SELL_MULT * renownSellMult)
  if (earned <= 0) return { error: 'Trophy has no value' }

  // ── CLAIM THE ROW BEFORE PAYING FOR IT ────────────────────────────────────
  //
  // The status check above is a read, and a read is not a claim: two taps that
  // both read 'hold' before either writes would both pay out for one fish. The
  // window is small and the modal's busy flag usually covers it, which is
  // exactly the kind of "usually" that produces one baffling ledger entry a
  // year.
  //
  // The resolve matches the row only while it is still on 'hold', so it can
  // only be matched once, and it reports whether this call was the one that
  // got it. Not claimed means somebody else resolved it first, so this caller
  // pays nothing.
  //
  // And it runs BEFORE the doubloons rather than alongside them, for the same
  // reason mounting does: a write whose failure is not allowed to matter is a
  // write nobody checks, and this file has already paid for that lesson once.
  const sold = await db.resolveShiny(shinyId, { status: 'sold', sold_at: nowIso(), sold_for: earned })
  if (sold.failed) return { error: 'Could not sell that one. Try again.' }
  if (!sold.claimed) return { error: 'Trophy already resolved' }

  // Paid in place, so a sale elsewhere landing meanwhile is not written over.
  const [newDoubloons] = await Promise.all([
    db.grant(uid, 'doubloons', earned),
    db.ledger(uid, earned, `Sold golden ${trophy.fish_species.name}`),
  ])
  return { earned, doubloons: newDoubloons }
}

export async function mountGoldenTrophy(db: FishingData, uid: string, shinyId: number): Promise<{ ok: true; fishId: number } | { error: string }> {
  const row = await db.shiny(uid, shinyId)
  if (!row) return { error: 'Trophy not found' }
  if (row.status !== 'hold') return { error: 'Trophy already resolved' }

  // Block remount: each species can only be golden once. Front-end already
  // disables the Mount button when alreadyMounted is true; this is the
  // server-side safety net.
  const existing = await db.collectionRow(uid, row.fish_id)
  if (existing?.is_golden) return { error: 'Already mounted' }

  // ── THE STATUS FIRST, AND ITS ERROR CHECKED ───────────────────────────────
  //
  // These two used to run together in a Promise.all with neither result read.
  // supabase-js hands errors back in the result object instead of throwing, so
  // a rejected write is indistinguishable from a successful one unless someone
  // looks — and for three months nobody did. `status: 'mounted'` violated the
  // table's CHECK on every single mount ever made, while the is_golden write
  // beside it succeeded. The fish went on the wall, the plate appeared, and the
  // row sat on 'hold' as though the choice had never been made.
  //
  // So: sequential, status first, and it is the gate. The status is what marks
  // this trophy resolved, which is what stops it being offered up and sold a
  // second time. If it cannot be written, nothing else should happen either —
  // an unmarked row with is_golden set is precisely the state that took a
  // migration to clean up.
  const mounted = await db.resolveShiny(shinyId, { status: 'mounted', sold_at: nowIso() })
  if (mounted.failed) return { error: 'Could not mount that one. Try again.' }

  // fish_collection row always exists by this point (the catch action upserts
  // it before reaching the shiny resolve), so we update rather than upsert.
  await db.setGolden(uid, row.fish_id)
  return { ok: true, fishId: row.fish_id }
}

// ── FISHING LEVEL REWARDS ────────────────────────────────────────────────────
// Pay out every level the captain has earned but not yet been paid for.
//
// STATE-BASED, deliberately. The obvious implementation is "grant on the level-up",
// but fishing XP arrives from TRAWLS too, which resolve while the player is nowhere
// near the fishing screen. A crossing-based grant would silently drop those levels on
// the floor. So this reconciles the level they ARE against the level they have been
// PAID for, which makes it idempotent: call it twice and the second call pays nothing.
export type LevelRewardsClaim = {
  granted: { level: number; reward: LevelReward }[]
  /** The levels this call covered: everything in (from, to]. `to > from` is a
   *  level earned whether or not it paid anything, and the chart shows the
   *  card on that, not on `granted` -- most levels pay nothing and every one
   *  of them is still a level. */
  from: number
  to: number
  newDoubloons: number
  newGems: number
  newHoldTier: number
}
export const NO_LEVEL_REWARDS: LevelRewardsClaim = { granted: [], from: 0, to: 0, newDoubloons: 0, newGems: 0, newHoldTier: 0 }

export async function claimFishingLevelRewards(db: FishingData, uid: string): Promise<LevelRewardsClaim> {
  const empty = NO_LEVEL_REWARDS
  const profile = await db.profile(uid, 'fishing_xp, claimed_fishing_levels, doubloons, gems, fish_hold_tier')
  if (!profile) return empty

  const level   = getLevelFromXP((profile.fishing_xp as number | null) ?? 0)
  const claimed = (profile.claimed_fishing_levels as number | null) ?? 1
  const owed    = rewardsOwed(claimed, level)
  if (owed.length === 0) {
    // NOTHING TO PAY, BUT PERHAPS SOMETHING TO SAY. Only fifteen levels carry
    // coin, and this used to return here without moving the watermark, so a
    // level that paid nothing was never a level the chart heard about: no
    // card, no notice, the number on the disc simply different next time you
    // looked. The watermark moves regardless now, and the chart is told the
    // span, so every level gets its moment and no level gets it twice.
    if (level > claimed) {
      await db.updateProfile(uid, { claimed_fishing_levels: level })
    }
    return {
      granted: [],
      from: claimed,
      to: Math.max(claimed, level),
      newDoubloons: profile.doubloons ?? 0,
      newGems: profile.gems ?? 0,
      newHoldTier: (profile.fish_hold_tier as number | null) ?? 0,
    }
  }

  let doubloonsOwed = 0
  let gemsOwed      = 0
  let holdTier  = (profile.fish_hold_tier as number | null) ?? 0
  const bait: Record<string, number> = {}

  for (const { reward } of owed) {
    doubloonsOwed += reward.doubloons ?? 0
    gemsOwed      += reward.gems ?? 0
    // A FLOOR, never a bump: a captain who already bought a better hold keeps it and
    // the reward is simply already satisfied. See LevelReward.holdFloor.
    if (reward.holdFloor != null) holdTier = Math.max(holdTier, reward.holdFloor)
    for (const [type, qty] of Object.entries(reward.bait ?? {})) {
      // Never hand over a bait type that does not exist — a typo in the table would
      // otherwise write a junk row the shop cannot render.
      if (getBait(type)) bait[type] = (bait[type] ?? 0) + qty
    }
  }
  holdTier = Math.min(holdTier, FISH_HOLD_TIERS.length - 1)

  // MOVE THE WATERMARK FIRST, and only from the value read above. That update
  // is the claim: two calls fired together both read the same watermark, and
  // only one of them gets the row back, so the levels are paid once.
  // Paid up to here; a re-call grants nothing.
  if (!(await db.moveLevelWatermark(uid, profile.claimed_fishing_levels == null ? null : claimed, level))) {
    return { ...empty, from: claimed, to: claimed }
  }

  // Paid in place. The hold is a floor, so it only ever raises a lower tier
  // and never writes over one bought meanwhile.
  const [doubloons, gems] = await Promise.all([
    db.grant(uid, 'doubloons', doubloonsOwed),
    db.grant(uid, 'gems', gemsOwed),
    db.raiseHoldTier(uid, holdTier),
    Promise.all(Object.entries(bait).map(([type, qty]) => db.addBait(uid, type, qty))),
    db.ledger(uid, owed.reduce((a, o) => a + (o.reward.doubloons ?? 0), 0),
      `Fishing level reward (Lv ${owed[0].level}${owed.length > 1 ? `-${level}` : ''})`),
  ])

  return { granted: owed, from: claimed, to: level, newDoubloons: doubloons, newGems: gems, newHoldTier: holdTier }
}

// ── THE ALMANAC'S ZONES AND THE LONG VIGIL ──
// Moved verbatim out of fishing/actions (2026-09-29). The only edits: the
// session read became `uid`; grant and the badges became store operations.

const ZONE_REWARD_COL: Record<string, string> = {
  shallows:    'zone_shallows_rewarded',
  open_waters: 'zone_open_waters_rewarded',
  deep:        'zone_deep_rewarded',
  abyss:       'zone_abyss_rewarded',
}

/** The one-time payout for logging every species in a zone. */
export async function claimZoneReward(db: FishingData, uid: string, zone: string): Promise<{ doubloons: number; earned: number } | { error: string }> {
  const rewardCol = ZONE_REWARD_COL[zone]
  if (!rewardCol) return { error: 'Invalid zone' }

  const zoneIds = await db.speciesIdsIn(zone)
  const [profile, caughtCount] = await Promise.all([
    db.profile(uid, 'doubloons, prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded'),
    db.loggedCount(uid, zoneIds),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (profile[rewardCol]) return { error: 'Already claimed' }

  const totalInZone = zoneIds.length
  if (caughtCount < totalInZone || totalInZone === 0) return { error: 'Zone not complete' }

  const prestigeLevel = ((profile.prestige_levels as Record<string, number> | null) ?? {})[zone] ?? 0
  const earned = zoneRewardDoubloons(zone, prestigeLevel)
  if (!earned) return { error: 'Invalid zone' }

  // Flip the claim flag FIRST, only where it is still unclaimed, and pay only
  // if this request is the one that flipped it.
  if (!(await db.flagOn(uid, rewardCol))) return { error: 'Already claimed' }

  const [newDoubloons] = await Promise.all([
    db.grant(uid, 'doubloons', earned),
    db.ledger(uid, earned, `Zone completion: ${zone}`),
  ])

  return { doubloons: newDoubloons, earned }
}

/** Wipe a completed zone's cycle log for the next prestige level (or, at the
 *  cap, a permanent golden boost). */
export async function prestigeZone(db: FishingData, uid: string, zone: string): Promise<{ prestigeLevel: number; goldenBoost?: number; unlockedSkinId?: string } | { error: string }> {
  // Ancient Deep doesn't prestige. The 6 trophies are one-and-done so
  // 'complete the collection again for another reward' doesn't apply. Reject
  // the call so a manipulated client can't trigger it past the hidden button.
  if (zone === 'ancient_deep') return { error: 'Ancient Deep does not prestige' }

  const rewardCol = ZONE_REWARD_COL[zone]
  if (!rewardCol) return { error: 'Invalid zone' }

  const zoneIds = await db.speciesIdsIn(zone)
  if (zoneIds.length === 0) return { error: 'Invalid zone' }

  const profile = await db.profile(uid, 'prestige_levels, zone_golden_boost, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, unlocked_character_colors')
  if (!profile) return { error: 'Profile not found' }
  if (!profile[rewardCol]) return { error: 'Claim completion reward first' }

  if ((await db.loggedCount(uid, zoneIds)) < zoneIds.length) return { error: 'Zone not complete' }

  // Prestige caps at 5 ("Max Prestige"); at the cap a wipe grants a permanent
  // GOLDEN BOOST instead. The rule is lib/fishingRules prestigeStep.
  const { atMax, newLevel, newLevels, newGoldenBoost, newGoldenBoosts, allZonesPrestiged } = prestigeStep(
    (profile.prestige_levels as Record<string, number> | null) ?? {},
    (profile.zone_golden_boost as Record<string, number> | null) ?? {},
    zone, PRESTIGE_MAX)

  // GUARDED ON THE LEVELS WE READ: two taps both pass the checks above, only
  // one clears the log and counts. The claim flag goes back to false with it.
  const patch: Record<string, unknown> = { prestige_levels: newLevels, [rewardCol]: false }
  if (atMax) patch.zone_golden_boost = newGoldenBoosts
  if (!(await db.updateProfileIf(uid, patch, [{ col: rewardCol, eq: true }]))) return { error: 'Claim completion reward first' }

  // NOTE: this only clears the CYCLE log. fish_lifetime is untouched, so the
  // Almanac's career numbers survive every prestige. GOLDEN mounts survive too:
  // golden fish are permanent trophies, so only the non-golden rows go.
  const goldenIds = new Set(await db.goldenIds(uid, zoneIds))
  await db.clearLog(uid, zoneIds.filter(id => !goldenIds.has(id)))

  await db.grantBadge(uid, 'prestige_i')
  // All four zones prestiged = every non-ancient species was landed to get here,
  // so Full Collection is earned even if prior wipes emptied the live log.
  if (allZonesPrestiged) { await db.grantBadge(uid, 'zone_legend'); await db.grantBadge(uid, 'full_collection') }

  return atMax ? { prestigeLevel: PRESTIGE_MAX, goldenBoost: newGoldenBoost } : { prestigeLevel: newLevel }
}

/** THE LONG VIGIL: release a mounted giant back into the Ancient Deep.
 *
 *  Gated on clearing the finale (One Last Ride needs all six on the wall, so
 *  there is no path to a partial wall with a release). Deliberately does NOT
 *  touch ancient_catches: that gates the finale, feeds the ancient_ones badge
 *  and drives the almanac's everCaught. The vigil column owns "released". */
export async function releaseAncient(db: FishingData, uid: string, fishId: number): Promise<
  { ok: true; vigil: Record<string, { rank: number; released: boolean }> } | { error: string }
> {
  if (!ANCIENT_IDS.includes(fishId as (typeof ANCIENT_IDS)[number])) return { error: 'That is not an Ancient' }

  const profile = await db.profile(uid, 'ancient_catches, ancient_vigil')
  if (!profile) return { error: 'Profile not found' }

  if (!(await db.hasCleared(uid, 'the_sunken_hand'))) return { error: 'The deep does not answer to you yet.' }

  const vigil = vigilFor(profile.ancient_vigil, profile.ancient_catches as number[] | null)
  const key = String(fishId)
  const entry = vigil[key]
  if (!entry) return { error: 'You have never landed that one' }
  if (entry.released) return { error: 'That one is already out there' }
  if (entry.rank >= VIGIL_MAX_RANK) return { error: 'That one is already mastered' }

  vigil[key] = { rank: entry.rank, released: true }
  await db.updateProfile(uid, { ancient_vigil: vigil })
  // Hooked rather than derived: once you land it again the released flag
  // clears, so "has ever given one back" is not recoverable from state.
  try { await db.grantBadge(uid, 'back_to_the_dark') } catch { /* best-effort */ }
  return { ok: true, vigil }
}
