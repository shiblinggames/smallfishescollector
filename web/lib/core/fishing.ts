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
import { getFishHold } from '@/lib/fishHold'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { fishingRenownEffects, type RenownAlloc } from '@/lib/renown'
import { fishingColorsToGrant } from '@/lib/characters'
import { getLineForSpeciesCount } from '@/lib/lines'
import { getTodayUTC, challengeIncrement } from '@/lib/dailyChallenges'
import { hasPrestigedAllZones } from '@/lib/collection'
import { vigilTotal, vigilComplete, VIGIL_PET_ID } from '@/lib/ancientVigil'
import { type FishSizeTier } from '@/lib/fishSize'
import { ZONE_MIN_LEVEL } from '@/app/(app)/fishing/zoneData'
import { rollCast, landFish, landAncient, reelTooEarly, activeEventOf as getActiveEvent, CRATE_FISH_ID, type PendingCast } from '@/lib/fishingRules'
import { dailyChallengesWithOverride } from '@/lib/dailyChallenges'
import type { FishingData } from '@/lib/data/fishingData'
import type { CrateTier } from '@/lib/crateLoot'

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
  const now = new Date().toISOString()
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
    if (isPB) await db.setPersonalBest(uid, fishId, sizeIn, new Date().toISOString())
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

