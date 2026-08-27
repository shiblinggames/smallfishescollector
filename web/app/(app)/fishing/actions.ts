'use server'

import { eyeFromProfile } from '@/lib/finnItems'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBait } from '@/lib/bait'
import { hotspotAt, hotspotEffect } from '@/lib/seaHotspots'
import { getRod, getEffectiveRod, COMPLETIONIST_TIER, COMPLETIONIST_MAX_EFFECTS, REFORGE_COST, rodHasUniqueEffect, jackpotChanceForZone, rodWaitMult, lockedInState } from '@/lib/rods'
import { getFishHold, FISH_HOLD_TIERS } from '@/lib/fishHold'
import { rewardsOwed, type LevelReward } from '@/lib/levelRewards'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { catchXP, getLevelFromXP } from '@/lib/fishingLevel'
import { fishingRenownEffects, type RenownAlloc } from '@/lib/renown'
import { fishingColorsToGrant } from '@/lib/characters'
import { getLineForSpeciesCount } from '@/lib/lines'
import { getSpecialItem, SPECIAL_OWNED_COLUMN } from '@/lib/specialItems'
import { getPet, petSlot, PET_SLOT_COLUMN } from '@/lib/pets'
import { getEffectiveDailyChallenges, getTodayUTC, challengeIncrement } from '@/lib/dailyChallenges'
import { zoneRewardDoubloons, PRESTIGE_MAX, goldenBoostMult } from '@/lib/zoneRewards'
import { hasPrestigedAllZones } from '@/lib/collection'
import { vigilFor, isReleased, vigilTotal, vigilComplete, vigilHuntChance, ancientCatchXP, vigilPaidAfter, VIGIL_MAX_RANK, VIGIL_PET_ID, ANCIENT_IDS } from '@/lib/ancientVigil'
import { rollFishSize, type FishSizeTier } from '@/lib/fishSize'
import { rollShiny, SHINY_SELL_MULT } from '@/lib/shiny'
import { grantCrateLoot, type CrateTier, type CrateLoot } from '@/lib/crateLoot'

function today() {
  return new Date().toISOString().split('T')[0]
}

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

import { ZONE_RARITY_RATES, ZONE_MIN_LEVEL, ZONE_WAIT_BASE, ZONE_CRATE_TIERS, zoneCrateChance } from './zoneData'

// Wait time: zone sets the range, catch_score positions within it (higher score = longer wait)
function fishWaitMs(catchScore: number, habitat: string, baitType: string, fishingLevel: number, renownWaitMult = 1, rodMult = 1): number {
  const [zMin, zMax] = ZONE_WAIT_BASE[habitat] ?? [5000, 20000]
  const frac = Math.max(0, Math.min(1, (catchScore - 8) / 90))
  const base = zMin + frac * (zMax - zMin)
  const baitMult = getBait(baitType).waitMult
  const levelMult = 1 - ((fishingLevel - 1) / 99) * 0.33
  // No upper cap — zone band + catch_score + bait multiplier all need
  // to actually land where they land. The cap was a legacy sanity rail
  // from before Ancient Deep's 45-120s band; it was squashing every
  // worm-baited cast in that zone to a flat 60s and erasing the bait
  // choice the player just made. 3s floor stays as a sanity check
  // against negative-wait pathologies from stacked future buffs.
  return Math.max(3000, Math.round(base * baitMult * levelMult * renownWaitMult * rodMult))
}

// Two-stage fish selection:
//   Stage 1 — roll rarity tier using zone-specific fixed rates (commons always dominant)
//   Stage 2 — pick uniformly among fish of that tier in this zone
// Adding more fish of a rarity increases variety, not that rarity's probability.
// Tiers absent from a zone are excluded and the remaining rates normalise automatically.

function tierWeightedPick<T extends { bite_rarity: number }>(items: T[], habitat: string, rarityBonus: number): T {
  const baseRates = ZONE_RARITY_RATES[habitat] ?? ZONE_RARITY_RATES.shallows

  // Group fish by rarity tier
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const g = groups.get(item.bite_rarity) ?? []
    g.push(item)
    groups.set(item.bite_rarity, g)
  }

  // Apply rod rarity bias: higher tiers get boosted proportionally
  const tiers = [...groups.keys()]
  const adjustedRates: Record<number, number> = {}
  for (const r of tiers) {
    adjustedRates[r] = (baseRates[r] ?? 0) * (1 + rarityBonus * (r - 1))
  }

  const totalWeight = tiers.reduce((s, r) => s + adjustedRates[r], 0)
  if (totalWeight === 0) return items[Math.floor(Math.random() * items.length)]

  let rand = Math.random() * totalWeight
  let selectedTier = tiers[0]
  for (const r of tiers) {
    rand -= adjustedRates[r]
    if (rand <= 0) { selectedTier = r; break }
  }

  const pool = groups.get(selectedTier)!
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Server-side event validation ─────────────────────────────────────────────

const EVENT_DURATION_MS = 120_000
const EVENT_MIN_GAP_MS  = 600_000 // 10 minutes minimum between events

function getActiveEvent(raw: unknown): { type: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as { type?: string; started_at?: string }
  if (!e.type || !e.started_at) return null
  if (Date.now() - new Date(e.started_at).getTime() > EVENT_DURATION_MS) return null
  return { type: e.type }
}

export async function activateEvent(type: string): Promise<{ ok: true } | { error: string }> {
  const VALID = new Set(['bloom', 'fullmoon', 'redtide', 'glassy'])
  if (!VALID.has(type)) return { error: 'Invalid event type' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('active_event, last_event_at')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const now = Date.now()

  if (getActiveEvent(profile.active_event)) return { error: 'Event already active' }

  if (profile.last_event_at) {
    const lastAt = new Date(profile.last_event_at as string).getTime()
    if (now - lastAt < EVENT_MIN_GAP_MS) return { error: 'Too soon' }
  }

  const started_at = new Date().toISOString()
  await admin
    .from('profiles')
    .update({ active_event: { type, started_at }, last_event_at: started_at })
    .eq('id', user.id)

  return { ok: true }
}

// CrateTier + CrateLoot + the loot roller now live in @/lib/crateLoot (imported
// above). Do NOT re-export them from here: this is a 'use server' file, and a
// non-async (type) export corrupts the server-action manifest for the whole
// module — which broke castLine / reelIn / the trawl actions. Anything needing
// these types imports them straight from @/lib/crateLoot.

// Server-rolled outcome of a cast, persisted to profiles.pending_cast and
// consumed one-shot by reelIn / reelCrate. The client can pass whatever it
// likes to those actions; the server binds to THESE values instead.
type PendingCast = {
  fishId: number          // the rolled species id (CRATE_FISH_ID === -1 for a crate)
  habitat: string
  baitType: string
  crateTier?: CrateTier    // present only for crate casts
  jackpotMult: number      // server-rolled YOLO jackpot (1 = none)
  doubleCatch: boolean     // server-rolled double catch
  catchQty?: number        // Locked-In Rod guaranteed haul (3 at streak 5+); overrides double
  castAt: number
  /** The EXACT payload this cast handed the client. Stored so an interrupted
   *  cast can be replayed byte-for-byte instead of re-derived from current gear
   *  (which would let a player swap rods mid-abandon to improve a live roll).
   *  Optional: tokens written before this shipped simply cannot be resumed. */
  shot?: CastShot
}

/** castLine's client payload, minus baitRemaining (which is read live). */
type CastShot = {
  fishId: number; catchDifficulty: number; biteRarity: number; waitMs: number
  crateTier?: CrateTier; instantBite?: boolean; jackpotMult?: number
  doubleCatch?: boolean; catchQty?: number; lockedStage?: number
  /** THE LONG VIGIL: the rank this hooked giant is being fought FOR (current
   *  rank + 1). Absent unless a released ancient is on the line. Drives the
   *  client's boss-fight scaling, and rides in the shot so a resumed cast
   *  replays the same difficulty. */
  vigilRank?: number
}

function rollCrateTier(habitat: string): CrateTier {
  const dist = ZONE_CRATE_TIERS[habitat] ?? ZONE_CRATE_TIERS.shallows
  // Walks whatever tiers the zone's table actually lists, rather than the four
  // it used to name inline. That is what lets the Ancient Deep hold exactly one
  // tier and everywhere else hold four, with no branch here.
  const entries = Object.entries(dist) as [CrateTier, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [tier, w] of entries) {
    r -= w
    if (r < 0) return tier
  }
  return entries[entries.length - 1]?.[0] ?? 'wooden'
}

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

  const admin = createAdminClient()

  // Which patch of water this is, if any. Derived, never trusted.
  const spot = at ? hotspotAt(at.x, at.y) : null
  const hs = hotspotEffect(spot?.kind, spot?.tier)

  const { data: profile } = await admin
    .from('profiles')
    .select('rod_tier, completionist_effects, hook_tier, fishing_xp, fish_hold_tier, ancient_catches, ancient_vigil, active_event, catch_pending, pending_cast, fishing_renown_alloc, has_ancient_deep_access, current_perfect_streak, equipped_special_2, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, equipped_raid_items, finn_spoil_free, finn_spoil_paid, pending_reroll, lifetime_species, line_tier, prestige_levels')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  // Casting again is how a player declines a live wormhole reroll, so this is
  // where a deferred species credit lands. Runs before the early returns below
  // (hold full, no bait) — the catch card is already gone either way, so the
  // reroll is forfeit and the fish they actually kept has to be logged.
  await settleDeferredSpeciesCredit(admin, user.id, profile)

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
    const { data: ch3 } = await admin.from('raid_completions')
      .select('id').eq('user_id', user.id).eq('raid_id', 'the_quartermaster').limit(1).maybeSingle()
    if (!ch3) {
      return { error: 'Clear Chapter 3 (defeat the Quartermaster) to reach the Ancient Deep.' }
    }
    await admin.from('profiles').update({ has_ancient_deep_access: true }).eq('id', user.id)
  }

  // Derive event effects server-side — never trust client flags
  const activeEvent = getActiveEvent(profile.active_event)
  const noBait = activeEvent?.type === 'bloom'
  const eventRarityBonus = activeEvent?.type === 'redtide' ? 0.25 : 0

  // Fetch hold, bait, and candidates in parallel
  const fishHold = getFishHold(profile.fish_hold_tier ?? 0)
  const [{ data: holdRows }, { data: baitRow }, { data: candidates }] = await Promise.all([
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
    admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', baitType).single(),
    admin.from('fish_species').select('id, catch_difficulty, catch_score, bite_rarity, sell_value').eq('habitat', habitat),
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
  const totalFish = (holdRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0)
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

  if (!noBait && (!baitRow || baitRow.quantity <= 0)) return { error: 'No bait remaining.' }

  if (resuming && live?.shot) {
    if (!noBait && baitRow) {
      await admin.from('bait_inventory').update({ quantity: baitRow.quantity - 1 }).eq('user_id', user.id).eq('bait_type', baitType)
      void admin.rpc('bump_profile_json_counter', { uid: user.id, col: 'bait_used', key: baitType, n: 1 }).then(() => {}, () => {})
    }
    // A re-cast is a cast for the career stat, even though the roll is the same.
    void admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_casts', n: 1 }).then(() => {}, () => {})
    // Walking away mid-catch still breaks the streak, exactly as before.
    if (((profile as { current_perfect_streak?: number }).current_perfect_streak ?? 0) > 0) {
      await admin.from('profiles').update({ current_perfect_streak: 0 }).eq('id', user.id)
    }
    return { ...live.shot, baitRemaining: !noBait && baitRow ? baitRow.quantity - 1 : undefined }
  }

  if (!candidates || candidates.length === 0) return { error: 'No fish found in this zone' }

  // Ancient Deep pool filter:
  //   1. Already-caught trophies always filter out (one-and-done).
  //   2. With regular bait, ALL trophies filter out — the 12 regulars
  //      bite on worms etc., but the 6 prehistoric trophies will only
  //      surface for a Luminous or Golden Lure. Sell_value === 0 is
  //      the trophy discriminator (matches the trophy/inventory split
  //      in the catch handler below).
  // TEST ACCOUNT hook: kingkong always hooks an uncaught Ancient trophy in the
  // Ancient Deep, on ANY bait, so the boss reels + Finn cutscenes can be exercised
  // without the RNG grind. Scoped to this one id so it can never touch a real
  // player. The Megalodon gate below still applies, so the giants come in order.
  const ALWAYS_ANCIENT_TROPHY = user.id === 'a67c8905-45a9-4a71-9720-f6396187fde6'
  // Set inside the ancient_deep branch below; read again when the shot is built.
  let vigilState: ReturnType<typeof vigilFor> = {}

  let pool = candidates
  if (habitat === 'ancient_deep') {
    const caught = new Set<number>((profile.ancient_catches as number[] | null) ?? [])
    // THE LONG VIGIL: a giant you have RELEASED is back in the water and can be
    // hooked again. ancient_catches still lists it (that array is append-only —
    // the finale gate and the ancient_ones badge read it), so "on the wall" is
    // caught AND not released.
    const vigil = vigilFor(profile.ancient_vigil, profile.ancient_catches as number[] | null)
    vigilState = vigil
    const isLure = baitType === 'luminous' || baitType === 'golden'
    // Megalodon (143) is the final-final boss of fishing: it never surfaces until
    // the other five giants (144-148) are all on the wall. Enforced HERE, server-
    // side, so it holds no matter what a client claims.
    const MEGALODON_ID = 143
    const MEGALODON_PREREQS = [144, 145, 146, 147, 148]
    const megalodonLocked = !MEGALODON_PREREQS.every(id => caught.has(id))
    pool = candidates.filter(f => {
      if (caught.has(f.id) && !isReleased(vigil, f.id)) return false
      if (!isLure && !ALWAYS_ANCIENT_TROPHY && (f.sell_value ?? 0) === 0) return false
      if (f.id === MEGALODON_ID && megalodonLocked) return false
      return true
    })
    if (pool.length === 0) return { error: 'You have caught every Ancient Deep species available with this bait!' }
  }

  const rod = getEffectiveRod(profile.rod_tier ?? 0, profile.completionist_effects as number[] | null)

  // A PERFECT STREAK IS NO LONGER BOUND TO A ZONE.
  //
  // It used to break the moment you cast in different water, so a streak could
  // not be farmed cheaply in the Shallows and cashed in a hard zone. That was a
  // fair worry when fishing meant picking one zone from a menu and staying in
  // it. It is the wrong rule for a sea you SAIL: the ocean hub lays the zones
  // out as one continuous shelf you cross, and a streak that dies for crossing
  // a boundary punishes the exact thing the chart is built to encourage.
  //
  // The streak is yours wherever you fish now. It still breaks on a miss, a
  // snag and an abandoned cast — the things that are actually about skill.
  const prevStreak = (profile as { current_perfect_streak?: number }).current_perfect_streak ?? 0

  // Locked-In Rod: this cast's power scales with the streak the player has BUILT.
  // If the previous cast was abandoned (catch_pending) OR the zone changed, the
  // streak is reset to 0 below — so this cast sees 0 too. Cheat-proof: the streak
  // is the server's own current_perfect_streak, never a client value.
  const castStreak = profile.catch_pending ? 0 : prevStreak
  const locked = lockedInState(rod, castStreak)
  // THE ANGLER'S PATIENCE. Its strength is its CHARGE, not a fixed bonus: it
  // levels on NAVIGATION xp while seated, so a fresh one barely helps and a
  // maxed one is transformative. Identity when it is not seated.
  const patience = eyeFromProfile(profile)
  const patienceWaitMult = patience.waitMult

  // Crate encounter: 2% chance (× rod.crateChanceMult — Treasure Rod = 2×).
  // Crates COUNT toward the perfect streak now. They always ran the same aim
  // minigame with the same perfect/miss judgement as a fish; they were simply
  // excluded from the streak on both sides, which made a crate a free pause in
  // an otherwise unforgiving run.
  //
  // The Ancient Deep used to be the one zone with no crates at all. It now has
  // its own rate (see ANCIENT_CRATE_CHANCE) because its bites take 45-120
  // seconds, so sharing the shallows' 2% would make a chest an hour-plus event.
  // The gear multipliers still apply, so a Treasure Rod is worth bringing down
  // here too.
  // Renown PROVIDENCE joins the rod and the Angler's Patience as a third
  // multiplier on the same roll. Server-side, like every other renown effect:
  // the client is never told the crate rate, so it cannot be talked up.
  // A stale token from a DIFFERENT zone cannot be replayed -- its species does
  // not live in these waters. So the species rerolls, but the crate decision is
  // INHERITED: otherwise abandoning and hopping zones would reroll the chest
  // check, which is the whole prize. Inheriting cuts both ways, so a chest you
  // walked away from is still a chest when you come back.
  const stale = (live?.shot && live.habitat !== habitat) ? live : null
  const isCrate = stale
    ? stale.fishId === CRATE_FISH_ID
    : Math.random() < zoneCrateChance(habitat) * (rod.crateChanceMult ?? 1) * patience.crateChanceMult * renownFishing.crateChanceMult * hs.crateChanceMult

  // Remember this bait so the fishing UI auto-selects it on next open
  // (FishingGame.tsx seeds selectedBait from profile.last_used_bait). Also mark
  // a REAL-fish catch as in-flight: if one was ALREADY pending, the previous
  // cast was abandoned (player left mid-catch to dodge a hard fish), which
  // breaks the perfect streak just like a miss — no cheesing it by bailing on
  // fish you don't like. Fire-and-forget — the multi-second gap before reelIn
  // means it always commits first; a failure mustn't block the cast result.
  // catch_pending covers crates too now. It is what punishes an ABANDONED cast,
  // and it is also what catches a crate MISS: a fumbled crate never calls back
  // to the server, so the flag stays set and the next cast zeroes the streak
  // through the same path an abandoned fish takes.
  const castUpdate: Record<string, unknown> = { last_used_bait: baitType, catch_pending: true }
  if (profile.catch_pending) castUpdate.current_perfect_streak = 0
  void admin.from('profiles').update(castUpdate).eq('id', user.id).then(() => {}, () => {})

  // Lifetime "Lines Cast" career stat — bump once per committed cast (covers
  // both the crate and normal paths below). Fire-and-forget.
  void admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_casts', n: 1 }).then(() => {}, () => {})

  if (isCrate) {
    if (!noBait && baitRow) {
      await admin.from('bait_inventory').update({ quantity: baitRow.quantity - 1 }).eq('user_id', user.id).eq('bait_type', baitType)
      void admin.rpc('bump_profile_json_counter', { uid: user.id, col: 'bait_used', key: baitType, n: 1 }).then(() => {}, () => {})
    }
    const crateWait = { shallows: 4000, open_waters: 7000, deep: 11000, abyss: 16000 }[habitat] ?? 6000
    const crateTier = rollCrateTier(habitat)
    // Persist the server-rolled crate token; reelCrate binds to THIS tier and
    // clears it one-shot, so the client can't name its own tier or open a crate
    // it never cast for. Awaited so it commits before the client can call back.
    const crateShot: CastShot = { fishId: CRATE_FISH_ID, catchDifficulty: 1, biteRarity: 1, waitMs: crateWait, crateTier }
    const crateToken: PendingCast = { fishId: CRATE_FISH_ID, habitat, baitType, crateTier, jackpotMult: 1, doubleCatch: false, castAt: Date.now(), shot: crateShot }
    await admin.from('profiles').update({ pending_cast: crateToken }).eq('id', user.id)
    return { ...crateShot, baitRemaining: !noBait && baitRow ? baitRow.quantity - 1 : undefined }
  }

  if (!noBait && baitRow) {
    await admin
      .from('bait_inventory')
      .update({ quantity: baitRow.quantity - 1 })
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
    void admin.rpc('bump_profile_json_counter', { uid: user.id, col: 'bait_used', key: baitType, n: 1 }).then(() => {}, () => {})
  }

  // Fish selection. In Ancient Deep the TROPHY (tier-5) roll is an EXPLICIT flat
  // chance set by the lure — Luminous 15%, Golden 20% — so the two premium lures
  // are meaningfully different (they used to be identical, both a flat 10% via
  // the shared tier table). Rod + event rarity bonuses still amplify it, so
  // special rods keep helping. Non-lure casts never reach the trophy pool (it's
  // filtered out above), so baseTrophyChance is 0 for them and this is lure-only.
  let fish: (typeof pool)[number]
  if (habitat === 'ancient_deep') {
    const trophyPool  = pool.filter(f => (f.sell_value ?? 0) === 0)
    const regularPool = pool.filter(f => (f.sell_value ?? 0) > 0)
    // TWO DIFFERENT HUNTS share this pool. A giant you have never landed is the
    // original story gate and keeps its shipped rate. One you RELEASED runs the
    // Vigil's own, much tighter roll (see vigilHuntChance). Post-finale the two
    // sets never overlap -- you cannot reach Finn without all six -- but they
    // are split explicitly rather than assumed.
    const everCaught = new Set<number>((profile.ancient_catches as number[] | null) ?? [])
    const firstHunt = trophyPool.filter(f => !everCaught.has(f.id))
    const released  = trophyPool.filter(f => everCaught.has(f.id))
    const rarityBonus = rod.rarityBonus + eventRarityBonus + locked.rarityBonus
    const baseTrophyChance = baitType === 'golden' ? 0.20 : baitType === 'luminous' ? 0.15 : 0
    const trophyChance = Math.min(0.95, baseTrophyChance * (1 + rarityBonus * 4))
    // Each released giant rolls on ITS OWN rank, so two out means two chances
    // (the water is genuinely busier) and the wariest stays hardest to raise.
    const onLure = baitType === 'luminous' || baitType === 'golden'
    const vigilHit = onLure
      ? released.find(f => Math.random() < vigilHuntChance(
          Math.min(VIGIL_MAX_RANK, (vigilState[String(f.id)]?.rank ?? 1) + 1),
          rarityBonus,
          baitType === 'golden' ? 'golden' : 'luminous',
        ))
      : undefined
    if (ALWAYS_ANCIENT_TROPHY && trophyPool.length > 0) {
      // Test account: always the lowest-id uncaught giant, so they surface in a
      // predictable order (144→148, then Megalodon once the gate opens).
      fish = [...trophyPool].sort((a, b) => a.id - b.id)[0]
    } else if (vigilHit) {
      fish = vigilHit
    } else if (firstHunt.length > 0 && Math.random() < trophyChance) {
      fish = firstHunt[Math.floor(Math.random() * firstHunt.length)]
    } else if (regularPool.length > 0) {
      fish = tierWeightedPick(regularPool, habitat, rod.rarityBonus + eventRarityBonus + locked.rarityBonus + hs.rarityBonus)
    } else {
      // Regulars somehow exhausted — hand back a trophy so the cast still lands.
      fish = trophyPool[Math.floor(Math.random() * trophyPool.length)]
    }
  } else {
    fish = tierWeightedPick(pool, habitat, rod.rarityBonus + eventRarityBonus + locked.rarityBonus + hs.rarityBonus)
  }
  // Locked-In quickens bites at streak 3+ (−20%) / 10+ (−35%); take the faster of
  // the rod's base speed and the streak stage.
  let waitMs = fishWaitMs(fish.catch_score, habitat, baitType, fishingLevel, renownWaitMult, Math.min(rodWaitMult(rod), locked.waitMult) * patienceWaitMult * hs.waitMult)

  // Lightsaber Rod — "Lightspeed": a chance the bite is near-instant. This is
  // the only rod stat that actually changes the bite wait (biteIntervalMs is
  // display-only), so the fast-bite fantasy is real, not cosmetic. The flag
  // drives the red blade-flash cue client-side so the player feels it land.
  let instantBite = false
  if ((rod.instantBiteChance ?? 0) > 0 && Math.random() < rod.instantBiteChance!) {
    waitMs = Math.min(waitMs, 700)
    instantBite = true
  }

  // Roll the haul multipliers SERVER-SIDE at cast time (mirrors what the client
  // used to roll at reel time), and lock them into the token. reelIn binds to
  // these — a client can no longer pass its own jackpot/double. Ancient trophies
  // (sell_value 0) never multiply; ancient regulars only double with an
  // always-double rod. Jackpot and double never stack (jackpot wins).
  const isAncientTrophyRoll = habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0
  const canDoubleHere = habitat !== 'ancient_deep' || (rod.doubleCatchChance ?? 0) >= 1
  const zoneJackpotChance = isAncientTrophyRoll ? 0 : jackpotChanceForZone(rod, habitat)
  const jackpotHit = zoneJackpotChance > 0 && Math.random() < zoneJackpotChance
  const rolledJackpotMult = jackpotHit ? (rod.jackpotMultiplier ?? 1) : 1
  const rolledDoubleCatch = !jackpotHit && !isAncientTrophyRoll && canDoubleHere
    && (rod.doubleCatchChance ?? 0) > 0 && Math.random() < (rod.doubleCatchChance ?? 0)

  const lockedQty = locked.catchQty > 1 ? locked.catchQty : undefined
  // A RELEASED giant fights for its next rank. vigilFor seeds rank 1 from
  // ancient_catches, so `+ 1` is the rank being attempted.
  const vigilAttempt = habitat === 'ancient_deep' && isReleased(vigilState, fish.id)
    ? Math.min(VIGIL_MAX_RANK, (vigilState[String(fish.id)]?.rank ?? 1) + 1)
    : undefined
  const shot: CastShot = { fishId: fish.id, catchDifficulty: fish.catch_difficulty, biteRarity: fish.bite_rarity, waitMs, instantBite, jackpotMult: rolledJackpotMult, doubleCatch: rolledDoubleCatch, catchQty: lockedQty, lockedStage: locked.stage, vigilRank: vigilAttempt }
  const token: PendingCast = { fishId: fish.id, habitat, baitType, jackpotMult: rolledJackpotMult, doubleCatch: rolledDoubleCatch, catchQty: lockedQty, castAt: Date.now(), shot }
  await admin.from('profiles').update({ pending_cast: token }).eq('id', user.id)

  return { ...shot, baitRemaining: !noBait && baitRow ? baitRow.quantity - 1 : undefined }
}

const CRATE_FISH_ID = -1

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
async function logCatchToBestiary(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  fishId: number,
): Promise<boolean> {
  const now = new Date().toISOString()
  void admin.rpc('bump_fish_lifetime', { uid: userId, fid: fishId, n: 1, at: now })
    .then(() => {}, () => {})

  const { data: existing } = await admin
    .from('fish_collection').select('catch_count')
    .eq('user_id', userId).eq('fish_id', fishId).maybeSingle()
  if (!existing) {
    await admin.from('fish_collection').insert({ user_id: userId, fish_id: fishId, catch_count: 1 })
    return true
  }
  await admin.from('fish_collection').update({
    catch_count: existing.catch_count + 1,
    last_caught_at: now,
  }).eq('user_id', userId).eq('fish_id', fishId)
  return false
}

/** Settle a species credit that reelIn deferred because a wormhole reroll was
 *  live. Called when the player declines the reroll — by casting again, which
 *  is the only way out of the catch card that does not go through
 *  rerollWormhole. Rerolling consumes the same token instead, so the original
 *  is never credited and the wormhole stops logging two species per cast.
 *
 *  Clears the token whatever happens, so a catch can only ever settle once. */
async function settleDeferredSpeciesCredit(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  profile: { pending_reroll?: unknown; lifetime_species?: unknown; line_tier?: number | null; prestige_levels?: unknown } | null,
) {
  const pending = (profile?.pending_reroll ?? null) as { fishId: number } | null
  if (!pending) return
  const { data: claimed } = await admin
    .from('profiles').update({ pending_reroll: null })
    .eq('id', userId).not('pending_reroll', 'is', null).select('id')
  if (!claimed || claimed.length === 0) return
  const wasNew = await logCatchToBestiary(admin, userId, pending.fishId)
  if (wasNew) await creditNewSpecies(admin, userId, pending.fishId, profile)
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
  await settleDeferredSpeciesCredit(createAdminClient(), user.id, profile)
}

/** Everything that has to happen the first time a species is landed, shared by
 *  reelIn and rerollWormhole. A species that arrives through the wormhole was
 *  still landed, so it has to count exactly the same — this used to live only
 *  in reelIn, which left a wormhole-only species short of a line-tier bump and
 *  the Full Collection badge. */
async function creditNewSpecies(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  newFishId: number,
  profile: { lifetime_species?: unknown; line_tier?: number | null; prestige_levels?: unknown } | null,
) {
  const [{ data: nonAncientSpecies }, { data: caughtRows }] = await Promise.all([
    admin.from('fish_species').select('id').neq('habitat', 'ancient_deep'),
    admin.from('fish_collection').select('fish_id').eq('user_id', userId),
  ])
  const caughtIds = new Set(((caughtRows ?? []) as { fish_id: number }[]).map(r => r.fish_id))
  // Lifetime species set — only ever grows, so a prestige wipe can't set the
  // collection badges back. Union the stored set with the current collection
  // (self-heals any drift) and this catch, and persist it if it grew.
  const storedLifetime = (profile?.lifetime_species as number[] | null) ?? []
  const lifetimeSet = new Set<number>([...storedLifetime, ...caughtIds, newFishId])
  if (lifetimeSet.size > storedLifetime.length) {
    await admin.from('profiles').update({ lifetime_species: [...lifetimeSet] }).eq('id', userId)
  }
  // Line tier progresses on TOTAL species caught (Ancient Deep included).
  const newLineTier = getLineForSpeciesCount(lifetimeSet.size).tier
  if (newLineTier > (profile?.line_tier ?? 0)) {
    await admin.from('profiles').update({ line_tier: newLineTier }).eq('id', userId)
  }
  // Full Collection = every NON-ancient species landed. The Ancient Deep
  // giants are a separate trophy hunt (their own badges), so they don't count
  // here — matches the badges-page rule. Judged off the lifetime set so a
  // prestige before the badge lands doesn't lock it out.
  const nonAncientIds = ((nonAncientSpecies ?? []) as { id: number }[]).map(s => s.id)
  const nonAncientCaught = nonAncientIds.filter(id => lifetimeSet.has(id)).length
  // Prestiging all four zones proves the whole non-ancient set too (see lib/collection).
  if ((nonAncientIds.length > 0 && nonAncientCaught >= nonAncientIds.length) || hasPrestigedAllZones(profile?.prestige_levels as Record<string, number> | null)) {
    await grantBadgeDirect(userId, 'full_collection')
  }
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
    }
  | { caught: false }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const isCatch = result === 'perfect' || result === 'catch'

  // Snag: consume one extra bait
  if (result === 'penalty') {
    const { data: baitRow } = await admin
      .from('bait_inventory')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
      .single()

    if (baitRow && baitRow.quantity > 0) {
      await admin
        .from('bait_inventory')
        .update({ quantity: baitRow.quantity - 1 })
        .eq('user_id', user.id)
        .eq('bait_type', baitType)
    }
    // Lifetime snag counter (line lost) — admin stat.
    await admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_snags', n: 1 })
  }

  if (!isCatch) {
    // A missed / snagged cast breaks the perfect streak — server-authoritative
    // (the client value is never trusted). Also clears the in-flight flag AND
    // the pending-cast token so it can't be reeled later.
    await admin.from('profiles').update({ current_perfect_streak: 0, catch_pending: false, pending_cast: null }).eq('id', user.id)
    return { caught: false }
  }

  const [{ data: profile }, { data: holdRows }] = await Promise.all([
    admin.from('profiles').select('doubloons, fishing_abyss_streak, fishing_xp, rod_tier, completionist_effects, fish_hold_tier, has_phantom_hook, has_perfected_sigil, equipped_special, equipped_special_2, has_anglers_patience, anglers_patience_xp, borrowed_jaw_xp, equipped_raid_items, finn_spoil_free, finn_spoil_paid, line_tier, prestige_levels, ancient_catches, ancient_vigil, unlocked_pets, unlocked_character_colors, total_perfects, current_perfect_streak, highest_perfect_streak, force_shiny_next_perfect, force_shiny_always, fishing_renown_alloc, pending_cast, zone_golden_boost, lifetime_species').eq('id', user.id).single(),
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
  ])

  if (!profile) return { error: 'Data not found' }

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
  const { data: claimed } = await admin
    .from('profiles')
    .update({ pending_cast: null, catch_pending: false })
    .eq('id', user.id)
    .not('pending_cast', 'is', null)
    .select('id')
    .maybeSingle()
  if (!token || !claimed || token.fishId === CRATE_FISH_ID) return { caught: false }
  fishId = token.fishId
  doubleCatch = token.doubleCatch
  jackpotMultiplier = token.jackpotMult
  const lockedCatchQty = token.catchQty ?? 1   // Locked-In Rod guaranteed haul (3 at streak 5+)

  const { data: fish } = await admin.from('fish_species').select('*').eq('id', fishId).single()
  if (!fish) return { error: 'Data not found' }

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
    const existing = ((profile.ancient_catches as number[] | null) ?? [])
    const isNewTrophy = !existing.includes(fishId)

    // ── THE LONG VIGIL ──────────────────────────────────────────────────────
    // Landing a giant you RELEASED. reelIn is only reached once the whole
    // multi-phase boss fight is cleared, so `result` here is the FINAL phase:
    // perfect lands the rank, an ordinary catch just puts it back on the wall.
    // (A miss never arrives here at all — it resets the fight and returns
    // above, paying nothing, which is why the ceiling is governed entirely by
    // what a non-perfect LANDING pays. See lib/ancientVigil.)
    //
    // The ladder is read BEFORE the XP because what this landing is worth
    // depends on whether it took a rank. ancient_catches is deliberately
    // untouched by any of this — it is the finale's gate and stays append-only.
    const vigil = vigilFor(profile.ancient_vigil, existing)
    const vigilKey = String(fishId)
    const wasReleased = vigil[vigilKey]?.released === true
    const fromRank = vigil[vigilKey]?.rank ?? 1
    const paidThrough = vigil[vigilKey]?.paid ?? 0

    const xpGained = Math.round(ancientCatchXP({
      firstCatch: isNewTrophy,
      wasReleased,
      fromRank,
      perfect: result === 'perfect',
      paidThrough,
    }) * renownXpMult)
    // THE BORROWED JAW charges on FISHING xp, and only while it is mounted.
    // The mirror of the reel: his raid item is fed by the fishing half of the
    // game, so wearing it is a standing reason to keep casting.
    const jawMounted = ((profile as { equipped_raid_items?: string[] } | null)?.equipped_raid_items ?? []).includes('borrowed_jaw')
      && (profile.finn_spoil_free === 'nav' || profile.finn_spoil_paid === 'nav')
    const jawCharge = jawMounted ? Number((profile as { borrowed_jaw_xp?: number } | null)?.borrowed_jaw_xp ?? 0) + xpGained : null
    const newXP = (profile.fishing_xp ?? 0) + xpGained
    // Perfect streak counts in ancient too (it grants no streak XP bonus here,
    // by design), tracked server-side so it can't be spoofed.
    const aStreak = result === 'perfect' ? (profile.current_perfect_streak ?? 0) + 1 : 0
    // THE BORROWED JAW charges on FISHING xp while it is mounted. Same
    // crossing in the other direction: the raid item is fed by fishing.
    // Computed here rather than in a helper so it rides the SAME update
    // as the xp that earned it and cannot drift out of sync.
    const updates: Record<string, unknown> = { fishing_xp: newXP, current_perfect_streak: aStreak, catch_pending: false, ...(jawCharge !== null ? { borrowed_jaw_xp: jawCharge } : {}) }
    if (result === 'perfect') updates.total_perfects = (profile.total_perfects ?? 0) + 1
    if (aStreak > (profile.highest_perfect_streak ?? 0)) {
      updates.highest_perfect_streak = aStreak
      updates.highest_streak_set_at = new Date().toISOString()
      updates.best_streak_zone = 'ancient_deep'
    }
    if (isNewTrophy) updates.ancient_catches = [...existing, fishId]

    let vigilRankUp: { from: number; to: number } | null = null
    let vigilPetGranted = false
    if (wasReleased) {
      const ranked = result === 'perfect' && fromRank < VIGIL_MAX_RANK
      const to = ranked ? fromRank + 1 : fromRank
      // `paid` records that this rung has spent its one consolation, so a
      // failed attempt can never pay twice. Written from the same inputs the
      // payout above read, via a helper that lives beside it.
      const paid = vigilPaidAfter({ wasReleased, fromRank, perfect: result === 'perfect', paidThrough })
      vigil[vigilKey] = paid > 0 ? { rank: to, released: false, paid } : { rank: to, released: false }
      updates.ancient_vigil = vigil
      if (ranked) vigilRankUp = { from: fromRank, to }

      // THE CAPSTONE — all six at rank 5 pays the baby plesiosaurus, the one
      // pet no crate can produce. Granted on STATE, not on the crossing (the
      // house pattern): re-checked on every landing, so it lands for anyone
      // already complete the moment the pet def exists, with no backfill.
      if (vigilComplete(vigil)) {
        const ownedPets = ((profile as { unlocked_pets?: string[] } | null)?.unlocked_pets ?? [])
        if (!ownedPets.includes(VIGIL_PET_ID)) {
          updates.unlocked_pets = [...ownedPets, VIGIL_PET_ID]
          vigilPetGranted = true
        }
      }
    }
    const newTrophies = isNewTrophy ? [...existing, fishId] : existing
    if (newTrophies.length >= 6) await grantBadgeDirect(user.id, 'ancient_ones')
    if (aStreak >= 10) await grantBadgeDirect(user.id, 'unbroken')
    // Perfected Sigil pays out on ancient perfects too — same gate
    // (equipped + perfect) as the regular catch path, same streak-scaling
    // formula (+10 ⟡ × min(streak, 3)). See sigilBonus below for the
    // rationale on equipped-vs-owned.
    const ancientSigilBonus = result === 'perfect'
      && profile.has_perfected_sigil
      && profile.equipped_special === 'perfected_sigil'
      ? Math.min(aStreak, 3) * 10
      : 0
    const ancientNewDoubloons = (profile.doubloons ?? 0) + ancientSigilBonus
    if (ancientSigilBonus > 0) updates.doubloons = ancientNewDoubloons
    await admin.from('profiles').update(updates).eq('id', user.id)

    // ── First-ever Ancient Deep catch contest ───────────────────────────
    // Atomic claim via the contests table's PK constraint: whichever
    // INSERT lands first wins; everyone else's INSERT silently no-ops
    // via ON CONFLICT DO NOTHING. Whoever pulled it off gets a targeted
    // mail with claim instructions for the custom-boat prize.
    let firstAncientCatch = false
    {
      const { data: claimed } = await admin
        .from('contests')
        .insert({ contest_id: 'first_ancient_catch', winner_user_id: user.id, prize_code: 'ANCIENT-FIRST' })
        .select('contest_id')
        .maybeSingle()
      if (claimed) {
        firstAncientCatch = true
        // Targeted mail — the prize details + claim instructions. Only
        // the winner sees it in their inbox (target_user_id filter).
        await admin.from('mail_messages').insert({
          subject: '🏆 First Ancient Deep Catch — Custom Boat Prize',
          body: "You did it. You're the first captain ever to land a fish in the Ancient Deep.\n\nAs promised, you've won a custom boat designed for you. Reply to this email to claim it:\n\nhello@shiblinggames.com\n\nInclude your prize code: ANCIENT-FIRST\n\nWe'll work with you on the design. Welcome to the deep.\n\n— Cap'n Shibling",
          sender_label: "Cap'n Shibling",
          target_user_id: user.id,
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
      isNewSpecies: isNewTrophy,
      xpGained,
      newXP,
      dailyProgress: [0, 0, 0],
      perfectStreak: aStreak,
      streakBonusXP: 0,
      sizeIn: ancientSize,
      isPB: false,
      previousBest: null,
      // Ancients can never roll shiny (habitat-blocked in lib/shiny rollShiny).
      isShiny: false,
      sigilBonus: ancientSigilBonus,
      newDoubloons: ancientSigilBonus > 0 ? ancientNewDoubloons : undefined,
      firstAncientCatch,
      // Set only when a RELEASED giant was landed on a perfect — drives the
      // rank-up celebration and the wall's new numeral.
      vigilRankUp,
      vigilTotal: updates.ancient_vigil ? vigilTotal(vigil) : undefined,
      vigilComplete: updates.ancient_vigil ? vigilComplete(vigil) : undefined,
      vigilPetGranted,
    }
  }

  // Perfect: 50% chance to return the bait used for this cast; Phantom Hook: additional 25% on any catch
  let baitSaved = result === 'perfect' && Math.random() < PERFECT_BAIT_SAVE_CHANCE
  if (!baitSaved && profile.has_phantom_hook) baitSaved = Math.random() < 0.25
  // THE PRIMEVAL EYE, tier 6: a perfect catch never costs bait. Absolute, so it
  // overrides both rolls above rather than adding another chance on top.
  if (!baitSaved && eye.perfectBaitSave && result === 'perfect') baitSaved = true

  // ── Shiny gate (computed early so the inventory + size logic can branch on it) ──
  // Shinies are gated on Perfect + a 1/SHINY_ODDS roll, with two admin
  // overrides (one-shot + persistent) for QA. Habitat-blocked on
  // ancient_deep but those short-circuited above, so this is safe.
  //
  // When shiny: the catch lives EXCLUSIVELY in shiny_catches (per-instance
  // trophy with size + caught_at metadata). It does NOT also push into
  // fish_inventory — inventory would stack it under fish_id alongside
  // regular bass, throwing away its identity. The Trophy Hold lane in the
  // market sells from shiny_catches directly at 10× value.
  const isPerfect = result === 'perfect'
  const forcedShinyOnce = !!profile.force_shiny_next_perfect && isPerfect
  const forcedShinyAlways = !!profile.force_shiny_always
  // Golden boost: extra golden odds earned by wiping this zone past Max Prestige.
  const goldenWipes = ((profile.zone_golden_boost as Record<string, number> | null) ?? {})[fish.habitat] ?? 0
  const isShiny = forcedShinyOnce || forcedShinyAlways || rollShiny({ isPerfect, habitat: fish.habitat, sellValue: fish.sell_value ?? 0, oddsMult: goldenBoostMult(goldenWipes) * eye.goldenOddsMult })

  // Check if new species for bestiary. The WRITE is deferred until we know
  // whether a wormhole reroll is live — see the credit block further down.
  const { data: existing } = await admin
    .from('fish_collection')
    .select('catch_count')
    .eq('user_id', user.id)
    .eq('fish_id', fishId)
    .maybeSingle()

  const isNewSpecies = !existing

  // Upsert sellable inventory — cap at hold capacity.
  // Shinies collapse the cast to a single catch (the trophy), so any
  // double-catch / jackpot multiplier on the same cast is consumed by
  // the rare moment. This keeps daily-challenge counters from crediting
  // ghost regular fish that never landed anywhere.
  // Ancient Deep balancing: Twin-Strike / Millionaire's double-catch STAYS
  // disabled here (the zone is built around single high-value catches). The
  // YOLO jackpot now pays its full ×100 in EVERY zone — its odds are scaled
  // per zone instead (ZONE_JACKPOT_CHANCE in lib/rods) so its ~150k/hr ceiling
  // holds everywhere, with no separate Ancient Deep haul cap. The clamp below
  // is just a sanity rail so a manipulated client can't claim more than the
  // rod's max. (Ancient trophies, sell_value 0, short-circuit far above — this
  // only ever touches sellable fish.)
  // Ancient Deep: only ALWAYS-double rods (Millionaire's, doubleCatchChance >= 1)
  // double here — Twin-Strike's partial double stays single-catch. Trophies
  // (sell_value 0) never multiply; they short-circuit far above.
  const reelRod = getEffectiveRod(profile.rod_tier ?? 0, profile.completionist_effects as number[] | null)
  const noDoubleCatch = fish.habitat === 'ancient_deep' && (reelRod.doubleCatchChance ?? 0) < 1
  const effectiveDoubleCatch = doubleCatch && !noDoubleCatch
  const effectiveJackpotMult = Math.min(jackpotMultiplier, 100)
  const holdCapacity = getFishHold(profile.fish_hold_tier ?? 0).capacity
  const currentHoldCount = (holdRows ?? []).reduce((s: number, r: { quantity: number }) => s + (r.quantity ?? 0), 0)
  // Jackpot takes priority over a double-catch (they never stack). Matters for a
  // forged Completionist Rod carrying BOTH YOLO + Millionaire's — else the
  // always-double would swallow the ×100 jackpot.
  // Locked-In triple ranks between jackpot and double: a jackpot rod still wins on
  // a forged Completionist, but the guaranteed triple beats a mere double.
  const desired = isShiny ? 1 : (effectiveJackpotMult > 1 ? effectiveJackpotMult : (lockedCatchQty > 1 ? lockedCatchQty : (effectiveDoubleCatch ? 2 : 1)))
  const catchQty = isShiny ? 1 : Math.min(desired, Math.max(0, holdCapacity - currentHoldCount))

  const { data: invRow } = await admin
    .from('fish_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('fish_id', fishId)
    .single()

  // Shinies skip the regular inventory — they live ONLY in shiny_catches
  // (per-instance trophy). Any double-catch / jackpot bonus on the same
  // cast is consumed by the rare moment; the shiny is the whole catch.
  if (catchQty > 0 && !isShiny) {
    if (invRow) {
      await admin.from('fish_inventory')
        .update({ quantity: invRow.quantity + catchQty })
        .eq('user_id', user.id).eq('fish_id', fishId)
    } else {
      await admin.from('fish_inventory').insert({ user_id: user.id, fish_id: fishId, quantity: catchQty })
    }
  }


  // Track abyss streak for achievements
  const isAbyssPerfect = result === 'perfect' && fish.habitat === 'abyss'
  const newAbyssStreak = isAbyssPerfect ? (profile.fishing_abyss_streak ?? 0) + 1 : 0
  const prestigeLevels = (profile.prestige_levels as Record<string, number> | null) ?? {}
  const zonePrestige = prestigeLevels[fish.habitat] ?? 0
  // +10% catch XP per prestige, capped at P5 (+50%) to match the zone reward cap.
  const prestigeXPMult = 1 + Math.min(zonePrestige, 5) * 0.10
  // Perfect Rod doubles XP on perfect catches (incl. the streak bonus, so
  // it scales with streaks). Non-perfect catches are unaffected.
  const perfectXpMult = result === 'perfect' ? (reelRod.perfectXpMult ?? 1) : 1
  // Perfect streak — server-authoritative. We compute the streak + its XP bonus
  // ourselves from the stored value; the client-supplied number is ignored, so
  // it can't be inflated to mint XP.
  const newPerfectStreak = result === 'perfect' ? (profile.current_perfect_streak ?? 0) + 1 : 0
  // Streak XP bonus is quadratic but CAPPED at streak 10 (10²×3 = 300 max) so a
  // long perfect streak can't fountain uncapped XP (esp. into post-100 Fishing
  // Renown). The streak ITSELF keeps climbing — badges (Untouchable=20) + the
  // display read newPerfectStreak; only its XP contribution flattens past 10.
  const STREAK_XP_CAP = 10
  const streakForXp = Math.min(newPerfectStreak, STREAK_XP_CAP)
  const serverStreakBonus = streakForXp * streakForXp * 3 // 1=+3, 2=+12, … 10=+300, then flat (0 when not perfect)
  const xpGained = Math.round((catchXP(fish.catch_difficulty, fish.habitat, result === 'perfect') + serverStreakBonus) * prestigeXPMult * perfectXpMult * renownXpMult * eye.fishingXpMult)
  // THE BORROWED JAW charges on FISHING xp, and only while it is mounted.
  // The mirror of the reel: his raid item is fed by the fishing half of the
  // game, so wearing it is a standing reason to keep casting.
  const jawMounted = ((profile as { equipped_raid_items?: string[] } | null)?.equipped_raid_items ?? []).includes('borrowed_jaw')
      && (profile.finn_spoil_free === 'nav' || profile.finn_spoil_paid === 'nav')
  const jawCharge = jawMounted ? Number((profile as { borrowed_jaw_xp?: number } | null)?.borrowed_jaw_xp ?? 0) + xpGained : null
  const newXP = (profile.fishing_xp ?? 0) + xpGained

  // Perfected Sigil — equipped Shrouded Reach drop pays a streak-scaling
  // bonus on every Perfect catch, credited immediately. +10 ⟡ × current
  // streak, capped at streak 3 (so streak 1 = +10, streak 2 = +20,
  // streak 3+ = +30 flat). The streak-3 ceiling keeps the ramp-up moment
  // (every streak feels like it's growing) but locks the bonus to a
  // predictable floor once they're in the groove, so it never runs away.
  // Gated on EQUIPPED (not just owned) so the player actively chooses
  // this perk over Tide Turner / Auto Caster.
  const sigilEquipped = profile.has_perfected_sigil
    && profile.equipped_special === 'perfected_sigil'
  const sigilBonus = result === 'perfect' && sigilEquipped
    ? Math.min(newPerfectStreak, 3) * 10
    : 0
  const newDoubloons = (profile.doubloons ?? 0) + sigilBonus

  // Galaxy Rod — "Wormhole": this catch is rerollable if the equipped rod has
  // the effect and the catch is a normal landable fish (ancient_deep already
  // short-circuited above; shinies live in shiny_catches, not the hold). We
  // stash the catch on profiles.pending_reroll; its presence is the single-use
  // guard. Non-wormhole catches clear any stale pending reroll.
  const rodDef = reelRod
  const wormholeAvail = !!rodDef.wormhole && !isShiny && catchQty > 0

  // ── BESTIARY CREDIT, DEFERRED WHEN A REROLL IS LIVE ────────────────────────
  // Crediting the species here unconditionally made the wormhole log TWO
  // species per cast: this fish, then the one it turned into. So when a reroll
  // is available the credit is held on pending_reroll and settled by whichever
  // comes first — rerollWormhole (which credits the NEW fish only) or the next
  // castLine (the player declined, so this fish is credited after all).
  if (!wormholeAvail) {
    await logCatchToBestiary(admin, user.id, fishId)
    if (isNewSpecies) await creditNewSpecies(admin, user.id, fish.id, profile)
  }

  // Fishing-level skin unlocks: Forest @ 50, Ice @ 75
  const profileUpdates: Record<string, unknown> = {
    // THE BORROWED JAW charges on FISHING xp while it is mounted. Same
    // crossing in the other direction: the raid item is fed by fishing.
    // Computed here rather than in a helper so it rides the SAME update
    // as the xp that earned it and cannot drift out of sync.
    fishing_abyss_streak: newAbyssStreak, fishing_xp: newXP, current_perfect_streak: newPerfectStreak, catch_pending: false,
    ...(jawCharge !== null ? { borrowed_jaw_xp: jawCharge } : {}),
    pending_reroll: wormholeAvail ? { fishId, qty: catchQty, habitat: fish.habitat } : null,
  }
  if (sigilBonus > 0) profileUpdates.doubloons = newDoubloons
  if (result === 'perfect') profileUpdates.total_perfects = (profile.total_perfects ?? 0) + 1
  if (newPerfectStreak > (profile.highest_perfect_streak ?? 0)) {
    profileUpdates.highest_perfect_streak = newPerfectStreak
    profileUpdates.highest_streak_set_at = new Date().toISOString()
    profileUpdates.best_streak_zone = fish.habitat
  }
  let reelInUnlockedSkin: string | undefined
  const oldFishingLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const newFishingLevel = getLevelFromXP(newXP)
  {
    // STATE-based, not transition-based: grant any fishing-level color the
    // player has earned but doesn't own yet. The old `oldFishingLevel < N`
    // guard silently missed anyone who crossed the threshold via a trawl (also
    // grants fishing XP) or before the color existed — they never re-crossed,
    // so it never fired. This self-heals on the next catch. See fishingColorsToGrant.
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    const toAdd = fishingColorsToGrant(newFishingLevel, currentUnlocked)
    if (toAdd.length > 0) {
      profileUpdates.unlocked_character_colors = [...currentUnlocked, ...toAdd]
      reelInUnlockedSkin = toAdd[toAdd.length - 1]
    }
  }
  if (oldFishingLevel < 100 && newFishingLevel >= 100) await grantBadgeDirect(user.id, 'master_angler')
  if (newPerfectStreak >= 10) await grantBadgeDirect(user.id, 'unbroken')

  const [, baitFetchResult] = await Promise.all([
    admin.from('profiles').update(profileUpdates).eq('id', user.id),
    baitSaved
      ? admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', baitType).single()
      : Promise.resolve({ data: null }),
  ])

  if (baitSaved && baitFetchResult.data) {
    await admin.from('bait_inventory')
      .update({ quantity: baitFetchResult.data.quantity + 1 })
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
  }

  // Lifetime event counters (admin stats) — only fire on the event.
  if (effectiveDoubleCatch)          await admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_double_catches', n: 1 })
  if (effectiveJackpotMult > 1)      await admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_jackpots', n: 1 })


  // ── Size variance + personal-best tracking (non-ancient catches) ──
  // Roll a length within the species's [length_min_in, length_max_in] range
  // and classify into a tier (tiny/small/avg/large/trophy). Then upsert the
  // PB row for this (user, species), only writing if the new length beats
  // the previous best. Skipped entirely for ancients (handled above) since
  // they're one-time catches with canonical sizes. Shinies skip the random
  // roll and lock to the species's max length (Trophy tier).
  const sizeMinIn = fish.length_min_in == null ? null : Number(fish.length_min_in)
  const sizeMaxIn = fish.length_max_in == null ? null : Number(fish.length_max_in)
  let sizeIn = 0
  let sizeTier: FishSizeTier | undefined
  let isPB = false
  let previousBest: number | null = null
  if (sizeMinIn != null && sizeMaxIn != null) {
    if (isShiny) {
      sizeIn = sizeMaxIn
      sizeTier = 'trophy'
    } else {
      const roll = rollFishSize(sizeMinIn, sizeMaxIn)
      sizeIn = roll.lengthIn
      sizeTier = roll.tier
    }

    // Trophy Catch badge — landing a top-size-tier fish (or a forced-shiny max).
    // Also tick the lifetime Trophy-SIZE counter (feeds the Trophy Hunter badge;
    // distinct from ancient_catches, which is the 6 Ancient Deep giants).
    if (sizeTier === 'trophy') {
      try { await grantBadgeDirect(user.id, 'trophy_catch') } catch { /* best-effort */ }
      void admin.rpc('bump_profile_stat', { uid: user.id, col: 'trophy_size_catches', n: 1 }).then(() => {}, () => {})
    }

    const { data: pbRow } = await admin
      .from('fish_personal_bests')
      .select('best_length_in')
      .eq('user_id', user.id)
      .eq('fish_id', fishId)
      .maybeSingle()
    previousBest = pbRow ? Number(pbRow.best_length_in) : null
    isPB = previousBest == null || sizeIn > previousBest
    if (isPB) {
      await admin.from('fish_personal_bests').upsert(
        { user_id: user.id, fish_id: fishId, best_length_in: sizeIn, caught_at: new Date().toISOString() },
        { onConflict: 'user_id,fish_id' },
      )
    }
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
    const { data: inserted } = await admin
      .from('shiny_catches')
      .insert({
        user_id: user.id,
        fish_id: fish.id,
        size_in: sizeIn > 0 ? sizeIn : null,
        status: 'hold',
      })
      .select('id')
      .single()
    shinyId = inserted?.id as number | undefined
    const { data: collectionRow } = await admin
      .from('fish_collection')
      .select('is_golden')
      .eq('user_id', user.id)
      .eq('fish_id', fish.id)
      .maybeSingle()
    alreadyMounted = !!collectionRow?.is_golden
  }
  // Consume the test flag on any Perfect — whether or not it triggered
  // the override (so a habitat-blocked Perfect doesn't strand the flag
  // forever). Non-perfects leave it alone so QA can keep waiting for
  // the right moment.
  if (profile.force_shiny_next_perfect && isPerfect) {
    await admin.from('profiles').update({ force_shiny_next_perfect: false }).eq('id', user.id)
  }

  const { data: dailyRow } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, p4, claimed_1, claimed_2, claimed_3, claimed_4, fishing_level_snapshot')
    .eq('user_id', user.id)
    .eq('date', dailyDate)
    .maybeSingle()

  // oldFishingLevel was computed above (line ~473) from the pre-catch
  // XP — that's the right level to lock in for today, even if THIS
  // catch is the one that pushes them across a zone boundary.
  const snapLevel = dailyRow?.fishing_level_snapshot ?? oldFishingLevel
  const dailyChallenges = await getEffectiveDailyChallenges(dailyDate, admin, snapLevel)

  // Three challenges, or FOUR once the player is past the Master gate. Driven
  // off the array length rather than a hardcoded three so the fourth slot can
  // never be silently dropped, and so nothing breaks for the ~87% of players
  // who do not have it.
  const priorP = [dailyRow?.p1 ?? 0, dailyRow?.p2 ?? 0, dailyRow?.p3 ?? 0, dailyRow?.p4 ?? 0]
  const newP = dailyChallenges.map((c, i) => Math.min(
    priorP[i] + challengeIncrement(c, fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
    c.target,
  ))

  await admin.from('daily_challenge_progress').upsert(
    {
      user_id: user.id,
      date: dailyDate,
      p1: newP[0], p2: newP[1], p3: newP[2],
      // Only written when the Master challenge is actually in play. Sending
      // undefined would blank an existing count on the upsert.
      ...(newP.length > 3 ? { p4: newP[3] } : {}),
      // Persist the snapshot on first touch (no-op on subsequent
      // upserts since the value won't change).
      fishing_level_snapshot: snapLevel,
    },
    { onConflict: 'user_id,date' },
  )

  // Ancient Deep breadcrumb (see `deepStirs` in the return type): on a regular
  // landed with common bait while giants remain uncaught, RARELY let a faint
  // omen through. Never on the lures (that player already knows), never once all
  // 6 giants are on the wall. Deliberately rare + vague so it reads as ambience,
  // not a tutorial.
  const deepStirs = fish.habitat === 'ancient_deep'
    && baitType !== 'luminous' && baitType !== 'golden'
    && (((profile.ancient_catches as number[] | null) ?? []).length < 6)
    && Math.random() < 0.14

  return {
    caught: true,
    fish: fish as FishSpecies,
    baitSaved,
    isNewSpecies,
    deepStirs,
    xpGained,
    newXP,
    dailyProgress: newP,
    unlockedSkinId: reelInUnlockedSkin,
    perfectStreak: newPerfectStreak,
    streakBonusXP: serverStreakBonus,
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
    newDoubloons: sigilBonus > 0 ? newDoubloons : undefined,
    wormhole: wormholeAvail,
    catchQty,
  }
}

/** Galaxy Rod — "Wormhole" reroll. Consumes the single-use pending_reroll set
 *  by reelIn and replaces the just-caught fish in the player's hold with a
 *  DIFFERENT random fish from the same zone (weighted by normal rarity odds via
 *  the Galaxy Rod's rarity bias — can be better OR worse). One-shot per catch:
 *  pending_reroll is cleared whether or not a better fish surfaces. */
export async function rerollWormhole(): Promise<
  | { ok: true; fish: FishSpecies; qty: number; isNewSpecies: boolean; sizeIn: number; sizeMin?: number; sizeMax?: number; sizeTier?: FishSizeTier; isPB: boolean; previousBest: number | null }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('rod_tier, completionist_effects, pending_reroll, lifetime_species, line_tier, prestige_levels').eq('id', user.id).single()
  const pending = (profile?.pending_reroll ?? null) as { fishId: number; qty: number; habitat: string } | null
  if (!pending) return { error: 'No catch to reroll.' }

  // Claim the token ATOMICALLY so this is strictly one-shot. A plain update
  // here let a double-tap through: both calls read the same `pending` and both
  // reached the grant below. The conditional update means exactly one caller
  // ever sees a row back.
  const { data: rerollClaimed } = await admin
    .from('profiles')
    .update({ pending_reroll: null })
    .eq('id', user.id)
    .not('pending_reroll', 'is', null)
    .select('id')
  if (!rerollClaimed || rerollClaimed.length === 0) return { error: 'No catch to reroll.' }

  const { fishId: origId, qty, habitat } = pending

  // reelIn deferred this catch's bestiary credit to whichever settles the
  // token, and that is now us. So every bail-out below has to log the fish the
  // player actually landed on the way out — otherwise a failed reroll would
  // quietly erase the catch from their log. Only the success path skips it,
  // because there the original stopped being what they landed.
  const abortWithCredit = async (error: string): Promise<{ error: string }> => {
    const wasNew = await logCatchToBestiary(admin, user.id, origId)
    if (wasNew) await creditNewSpecies(admin, user.id, origId, profile)
    return { error }
  }

  // Pick where the wormhole comes out FIRST. This is all read-only, so the
  // failure paths below bail before the player's hold has been touched.
  const { data: candidates } = await admin
    .from('fish_species')
    .select('id, catch_difficulty, catch_score, bite_rarity, sell_value')
    .eq('habitat', habitat)
  // A wormhole sends you somewhere ELSE — exclude the original so the reroll
  // always lands on a different fish. Trophies (sell_value 0) never apply here
  // since ancient_deep is ineligible for the wormhole.
  const pool = (candidates ?? []).filter(f => f.id !== origId)
  if (pool.length === 0) return abortWithCredit('The wormhole found nothing new.')

  const rod = getEffectiveRod(profile?.rod_tier ?? 0, profile?.completionist_effects as number[] | null)
  const picked = tierWeightedPick(pool, habitat, rod.rarityBonus)
  const { data: newFish } = await admin.from('fish_species').select('*').eq('id', picked.id).single()
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
  const { data: origRow } = await admin.from('fish_inventory')
    .select('quantity').eq('user_id', user.id).eq('fish_id', origId).maybeSingle()
  if (!origRow || origRow.quantity < qty) return HOLD_GONE()

  const left = origRow.quantity - qty
  const consume = left === 0
    ? admin.from('fish_inventory').delete()
        .eq('user_id', user.id).eq('fish_id', origId).eq('quantity', origRow.quantity).select('fish_id')
    : admin.from('fish_inventory').update({ quantity: left })
        .eq('user_id', user.id).eq('fish_id', origId).eq('quantity', origRow.quantity).select('fish_id')
  const { data: consumed } = await consume
  if (!consumed || consumed.length === 0) return HOLD_GONE()

  const { data: newRow } = await admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', newFish.id).maybeSingle()
  if (newRow) await admin.from('fish_inventory').update({ quantity: newRow.quantity + qty }).eq('user_id', user.id).eq('fish_id', newFish.id)
  else await admin.from('fish_inventory').insert({ user_id: user.id, fish_id: newFish.id, quantity: qty })

  // Bestiary — this fish is what the cast actually landed, so it takes the
  // credit reelIn deferred. Counts the CAST, not the fish, matching reelIn: a
  // rerolled ×100 haul is one catch of the species, not a hundred.
  const isNewSpecies = await logCatchToBestiary(admin, user.id, newFish.id)

  // A species landed through the wormhole counts exactly as one landed on the
  // line: lifetime set, line tier and the Full Collection badge all move.
  if (isNewSpecies) {
    await creditNewSpecies(admin, user.id, newFish.id, profile)
  }

  // Size + PB for the new fish (mirrors the catch path; ancients excluded).
  const sizeMinIn = newFish.length_min_in == null ? null : Number(newFish.length_min_in)
  const sizeMaxIn = newFish.length_max_in == null ? null : Number(newFish.length_max_in)
  let sizeIn = 0
  let sizeTier: FishSizeTier | undefined
  let isPB = false
  let previousBest: number | null = null
  if (sizeMinIn != null && sizeMaxIn != null) {
    const roll = rollFishSize(sizeMinIn, sizeMaxIn)
    sizeIn = roll.lengthIn
    sizeTier = roll.tier
    const { data: pbRow } = await admin.from('fish_personal_bests').select('best_length_in').eq('user_id', user.id).eq('fish_id', newFish.id).maybeSingle()
    previousBest = pbRow ? Number(pbRow.best_length_in) : null
    isPB = previousBest == null || sizeIn > previousBest
    if (isPB) await admin.from('fish_personal_bests').upsert({ user_id: user.id, fish_id: newFish.id, best_length_in: sizeIn, caught_at: new Date().toISOString() }, { onConflict: 'user_id,fish_id' })
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
export async function reelCrate(_zone: string, _tier: CrateTier = 'wooden', result: 'perfect' | 'catch' = 'catch'): Promise<(CrateLoot & { perfectStreak?: number }) | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles')
    .select('pending_cast, current_perfect_streak, highest_perfect_streak')
    .eq('id', user.id).single()

  // Bind to the server-rolled crate token (anti-forgery). castLine chose the
  // tier and stored it; claim it one-shot via the atomic null-ing. The client's
  // `tier` argument is IGNORED, and a call with no live crate cast opens nothing
  // — closing the "loop reelCrate('diamond') with no cast" doubloon faucet.
  const crateToken = profile?.pending_cast as PendingCast | null
  const { data: claimed } = await admin
    .from('profiles')
    .update({ pending_cast: null })
    .eq('id', user.id)
    .not('pending_cast', 'is', null)
    .select('id')
    .maybeSingle()
  if (!profile || !crateToken || !claimed || crateToken.fishId !== CRATE_FISH_ID || !crateToken.crateTier) {
    return { error: 'No crate to open.' }
  }

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
  const streak = result === 'perfect' ? (profile.current_perfect_streak ?? 0) + 1 : 0
  const streakUpdate: Record<string, unknown> = { current_perfect_streak: streak, catch_pending: false }
  if (streak > (profile.highest_perfect_streak ?? 0)) {
    streakUpdate.highest_perfect_streak = streak
    streakUpdate.highest_streak_set_at = new Date().toISOString()
    streakUpdate.best_streak_zone = crateToken.habitat
  }
  await admin.from('profiles').update(streakUpdate).eq('id', user.id)

  // Which tier, for the Almanac's crate tally. Fire-and-forget beside the
  // lifetime fishing_crates_opened total that grantCrateLoot already bumps.
  void admin.rpc('bump_profile_json_counter', {
    uid: user.id, col: 'crate_opens', key: crateToken.crateTier, n: 1,
  }).then(() => {}, () => {})

  // Token validated — hand off to the shared roller (grants + returns the loot).
  const loot = await grantCrateLoot(admin, user.id, crateToken.crateTier)
  return 'error' in loot ? loot : { ...loot, perfectStreak: streak }
}

const QUICK_BUY_WORMS_QTY  = 10
const QUICK_BUY_WORMS_COST = 200  // 2× the shop price of 100 doubloons per 10

export async function quickBuyWorms(): Promise<{ qty: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if ((profile.doubloons ?? 0) < QUICK_BUY_WORMS_COST) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - QUICK_BUY_WORMS_COST

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: 'worm', p_qty: QUICK_BUY_WORMS_QTY }),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -QUICK_BUY_WORMS_COST, reason: 'Quick-buy worms' }),
  ])

  return { qty: QUICK_BUY_WORMS_QTY, doubloons: newDoubloons }
}

// Sell fish from inventory
export async function sellFish(
  fishId: number,
  quantity: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  if (quantity <= 0) return { error: 'Invalid quantity' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [{ data: invRow }, { data: fish }, { data: profile }] = await Promise.all([
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', fishId).single(),
    admin.from('fish_species').select('sell_value').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons, active_event, fishing_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid').eq('id', user.id).single(),
  ])

  if (!invRow || !fish || !profile) return { error: 'Data not found' }
  if (invRow.quantity < quantity) return { error: 'Not enough fish' }

  const fullPrice = getActiveEvent(profile.active_event)?.type === 'fullmoon'
  const renownSellMult = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null).sellMult * eyeFromProfile(profile).sellMult
  // Quick-sell at 75% (was 65%) — gives new players a softer floor so one bad
  // early sell doesn't lock them out of their next rod tier.
  //
  // THIS LANE IS THE ONE THAT NEVER MOVES. The ladder is priced on DISTANCE
  // now: 75% wherever you happen to be floating, 78-86% from a zone buyer you
  // sail over to, 100% at the market ashore. The delayed 87% lane in between
  // is gone — it was charging an hour to stand in for a journey the chart did
  // not used to make you take, and now does. See sellEntireHold.
  const earned = Math.floor(fish.sell_value * (fullPrice ? 1.0 : 0.75) * renownSellMult) * quantity
  const newDoubloons = (profile.doubloons ?? 0) + earned

  await Promise.all([
    admin.from('fish_inventory')
      .update({ quantity: invRow.quantity - quantity })
      .eq('user_id', user.id).eq('fish_id', fishId),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: earned, reason: 'Sold fish (quick-sell)',
    }),
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_doubloons', n: earned }),
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_count', n: quantity }),
    admin.rpc('bump_profile_max', { uid: user.id, col: 'biggest_fish_sale', v: earned }),
    ...(newDoubloons >= 1_000_000 ? [grantBadgeDirect(user.id, 'deep_pockets')] : []),
  ])

  return { earned, doubloons: newDoubloons }
}

/** Quick-sell the player's ENTIRE hold in one shot — same 75% rate (100% on a
 *  full moon) and per-species floor as sellFish, just batched so the UI gets a
 *  single lump sum instead of selling stack-by-stack. One doubloon update + one
 *  transaction row for the whole sweep. */
export async function quickSellAllFish(): Promise<
  { earned: number; fishSold: number; doubloons: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [inventoryRes, { data: profile }] = await Promise.all([
    admin.from('fish_inventory')
      .select('fish_id, quantity, fish_species(sell_value)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('profiles').select('doubloons, active_event, fishing_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid').eq('id', user.id).single(),
  ])

  if (!profile) return { error: 'Profile not found' }

  type InvRow = { fish_id: number; quantity: number; fish_species: { sell_value: number } | null }
  const inventory = (inventoryRes.data ?? []) as unknown as InvRow[]
  if (inventory.length === 0) return { error: 'Nothing to sell' }

  const fullPrice = getActiveEvent(profile.active_event)?.type === 'fullmoon'
  const renownSellMult = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null).sellMult * eyeFromProfile(profile).sellMult
  const rate = (fullPrice ? 1.0 : 0.75) * renownSellMult

  let totalEarned = 0
  let totalFishSold = 0
  for (const item of inventory) {
    const sellValue = item.fish_species?.sell_value ?? 0
    // Per-species floor mirrors sellFish exactly so the total is identical to
    // looping it — this is purely a batching change, no economy change.
    totalEarned += Math.floor(sellValue * rate) * item.quantity
    totalFishSold += item.quantity
  }

  if (totalEarned <= 0) return { error: 'Nothing to sell' }

  const newDoubloons = (profile.doubloons ?? 0) + totalEarned

  await Promise.all([
    ...inventory.map(item =>
      admin.from('fish_inventory')
        .update({ quantity: 0 })
        .eq('user_id', user.id)
        .eq('fish_id', item.fish_id)
    ),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: totalEarned, reason: `Sold ${totalFishSold} fish (quick-sell)`,
    }),
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_doubloons', n: totalEarned }),
    admin.rpc('bump_profile_stat', { uid: user.id, col: 'fish_sold_count', n: totalFishSold }),
    admin.rpc('bump_profile_max', { uid: user.id, col: 'biggest_fish_sale', v: totalEarned }),
    ...(newDoubloons >= 1_000_000 ? [grantBadgeDirect(user.id, 'deep_pockets')] : []),
  ])

  return { earned: totalEarned, fishSold: totalFishSold, doubloons: newDoubloons }
}

// Perfect streak is fully server-authoritative inside reelIn now (it tracks the
// live streak in current_perfect_streak, computes the XP bonus, and updates the
// highest_perfect_streak record + 'unbroken' badge). The old client-driven
// saveHighestPerfectStreak / saveCurrentPerfectStreak actions were removed —
// they trusted client numbers and could be used to spoof XP / the leaderboard.

export async function markFishingTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_fishing_tour: true }).eq('id', user.id)
}

export async function markFishingCatchTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_fishing_catch_tour: true }).eq('id', user.id)
}

/** One-shot: fired when the player dismisses the first-catch celebration
 *  overlay. Server-side flag so the moment doesn't replay across devices
 *  or after a session reset. */
export async function markFirstCatchCelebrationSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_first_catch_celebration: true }).eq('id', user.id)
}

/** Toggle for the cast→bite count-up shown in the waiting pill.
 *  Stored on profiles so it syncs across devices. Toggled from the
 *  Preferences row in the Gear modal. */
export async function setShowWaitTimer(value: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ show_wait_timer: value }).eq('id', user.id)
}

export async function checkLeaderboardPosition(
  category: 'fishingLevel' | 'perfectStreak',
): Promise<{ position: number } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const field = category === 'fishingLevel' ? 'fishing_xp' : 'highest_perfect_streak'

  const { data: me } = await admin.from('profiles').select(field).eq('id', user.id).single()
  if (!me) return null

  const myValue = (me as Record<string, number>)[field] ?? 0
  const { count } = await admin.from('profiles')
    .select('*', { count: 'exact', head: true })
    .gt(field, myValue)

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

  const [{ data: profile }, { data: zoneSpecies }, { count: caughtCount }] = await Promise.all([
    admin.from('profiles').select('doubloons, prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded').eq('id', user.id).single(),
    admin.from('fish_species').select('id').eq('habitat', zone),
    admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
      .in('fish_id', (await admin.from('fish_species').select('id').eq('habitat', zone)).data?.map((f: { id: number }) => f.id) ?? []),
  ])

  if (!profile) return { error: 'Profile not found' }
  const alreadyClaimed = {
    shallows:    profile.zone_shallows_rewarded,
    open_waters: profile.zone_open_waters_rewarded,
    deep:        profile.zone_deep_rewarded,
    abyss:       profile.zone_abyss_rewarded,
  }
  if (alreadyClaimed[zone as keyof typeof alreadyClaimed]) return { error: 'Already claimed' }

  const totalInZone = (zoneSpecies ?? []).length
  if ((caughtCount ?? 0) < totalInZone || totalInZone === 0) return { error: 'Zone not complete' }

  const prestigeLevel = ((profile.prestige_levels as Record<string, number> | null) ?? {})[zone] ?? 0
  const earned = zoneRewardDoubloons(zone, prestigeLevel)
  if (!earned) return { error: 'Invalid zone' }

  const newDoubloons = (profile.doubloons ?? 0) + earned
  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons, [rewardCol]: true }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: earned, reason: `Zone completion: ${zone}` }),
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

  const { data: zoneSpeciesRows } = await admin.from('fish_species').select('id').eq('habitat', zone)
  const zoneIds = (zoneSpeciesRows ?? []).map((f: { id: number }) => f.id)
  if (zoneIds.length === 0) return { error: 'Invalid zone' }

  const { data: profile } = await admin
    .from('profiles')
    .select('prestige_levels, zone_golden_boost, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, unlocked_character_colors')
    .eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const rewardClaimed: Record<string, boolean | null> = {
    shallows:    profile.zone_shallows_rewarded,
    open_waters: profile.zone_open_waters_rewarded,
    deep:        profile.zone_deep_rewarded,
    abyss:       profile.zone_abyss_rewarded,
  }
  if (!rewardClaimed[zone]) return { error: 'Claim completion reward first' }

  const { count: caughtCount } = await admin
    .from('fish_collection').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).in('fish_id', zoneIds)
  if ((caughtCount ?? 0) < zoneIds.length) return { error: 'Zone not complete' }

  const currentLevels = (profile.prestige_levels as Record<string, number> | null) ?? {}
  const curLevel = currentLevels[zone] ?? 0
  // Prestige caps at 5 ("Max Prestige"). At the cap a wipe no longer raises the
  // level — instead it grants a permanent GOLDEN BOOST to this zone (higher
  // golden/shiny odds here). Below the cap it's a normal level-up. Either way
  // the catch log resets (goldens preserved) and the completion reward re-opens.
  const atMax = curLevel >= PRESTIGE_MAX
  const newLevel = atMax ? PRESTIGE_MAX : curLevel + 1
  const newLevels = { ...currentLevels, [zone]: newLevel }
  const goldenBoosts = (profile.zone_golden_boost as Record<string, number> | null) ?? {}
  const newGoldenBoost = (goldenBoosts[zone] ?? 0) + (atMax ? 1 : 0)
  const newGoldenBoosts = atMax ? { ...goldenBoosts, [zone]: newGoldenBoost } : goldenBoosts

  // Sand skin: unlock when any zone reaches prestige 3
  let prestigeUnlockedSkin: string | undefined
  const profileUpdate: Record<string, unknown> = { prestige_levels: newLevels, [rewardCol]: false }
  if (atMax) profileUpdate.zone_golden_boost = newGoldenBoosts
  const maxPrestige = Math.max(...Object.values(newLevels))
  if (maxPrestige >= 3) {
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    if (!currentUnlocked.includes('sand')) {
      profileUpdate.unlocked_character_colors = [...currentUnlocked, 'sand']
      prestigeUnlockedSkin = 'sand'
    }
  }

  const allZones = ['shallows', 'open_waters', 'deep', 'abyss']
  const allZonesPrestiged = allZones.every(z => (newLevels[z] ?? 0) >= 1)

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
  const { data: goldenRows } = await admin
    .from('fish_collection')
    .select('fish_id')
    .eq('user_id', user.id)
    .in('fish_id', zoneIds)
    .eq('is_golden', true)
  const goldenIds = new Set((goldenRows ?? []).map((r: { fish_id: number }) => r.fish_id))
  const idsToClear = zoneIds.filter(id => !goldenIds.has(id))

  await Promise.all([
    idsToClear.length > 0
      ? admin.from('fish_collection').delete().eq('user_id', user.id).in('fish_id', idsToClear)
      : Promise.resolve(),
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
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

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_tide_turner, equipped_special, tide_turner_used, tide_turner_date')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (!profile.has_tide_turner) return { error: 'No Tide Turner' }
  // AND IT HAS TO BE IN THE SLOT. This checked ownership only, so the server
  // would honour a skip from an unequipped Tide Turner — the fishing screen
  // simply never offered the button, which made a UI rule look like a guard.
  // The sea offered it, and that is how the gap surfaced.
  if (profile.equipped_special !== 'tide_turner') return { error: 'Your Tide Turner is not equipped' }

  const todayStr = today()
  const usedToday = profile.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  if (usedToday >= 3) return { error: 'No skips remaining today' }

  const newUsed = usedToday + 1
  // RELEASE the hooked fish as a SANCTIONED skip: clear the pending catch so the
  // next cast doesn't trip castLine's anti-bail reset (a lingering catch_pending
  // zeroes current_perfect_streak on the following cast). Crucially we do NOT
  // touch current_perfect_streak here — skipping a fish WITHOUT breaking the
  // streak is the Tide Turner's entire purpose.
  await admin.from('profiles')
    .update({ tide_turner_used: newUsed, tide_turner_date: todayStr, catch_pending: false, pending_cast: null })
    .eq('id', user.id)
  return { ok: true, skipsLeft: 3 - newUsed }
}

export async function buySpecialItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const columnMap: Record<string, string> = {
    auto_caster: 'has_auto_caster',
    auto_catcher: 'has_auto_catcher',
  }
  const column = columnMap[itemId]
  if (!column) return { error: 'Unknown item' }

  const def = getSpecialItem(itemId)
  // For sale if it has a price in either currency.
  const usesFathoms = typeof def?.costFathoms === 'number'
  if (!def || (!def.shopCost && !usesFathoms)) return { error: 'Not for sale' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, gauntlet_fathoms, has_auto_caster, has_auto_catcher, gauntlet_deepest')
    .eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const owned: Record<string, boolean> = {
    has_auto_caster: !!profile.has_auto_caster,
    has_auto_catcher: !!profile.has_auto_catcher,
  }
  if (owned[column]) return { error: 'Already owned' }
  // Prerequisite item (e.g. Auto Catcher needs the Auto Caster first).
  if (def.requiresItem && !owned[columnMap[def.requiresItem]]) {
    return { error: 'Requires the Auto Caster first' }
  }
  // Gauntlet-depth unlock gate.
  if (def.requiresGauntletDepth && ((profile.gauntlet_deepest as number | null) ?? 0) < def.requiresGauntletDepth) {
    return { error: `Reach depth ${def.requiresGauntletDepth} in Davy Jones' Gauntlet first` }
  }

  if (usesFathoms) {
    const fathoms = (profile.gauntlet_fathoms as number | null) ?? 0
    if (fathoms < def.costFathoms!) return { error: 'Not enough Fathoms' }
    await admin.from('profiles').update({ gauntlet_fathoms: fathoms - def.costFathoms!, [column]: true }).eq('id', user.id)
  } else {
    if ((profile.doubloons ?? 0) < def.shopCost!) return { error: 'Not enough doubloons' }
    await admin.from('profiles').update({ doubloons: (profile.doubloons ?? 0) - def.shopCost!, [column]: true }).eq('id', user.id)
  }
  return { ok: true }
}

export async function equipSpecialItem(itemId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  // This wrote whatever it was handed. No ownership check, no slot check: the
  // only thing standing between a crafted request and The Primeval Eye seated
  // in slot one was that the button did not exist. Hiding the row fixes the
  // spoiler; it does not fix the hole behind it.
  if (itemId !== null) {
    const def = getSpecialItem(itemId)
    if (!def) return { error: 'No such item' }
    // The Sunken Hand's spoils fit the SECOND slot and nothing else. Seating one
    // here would hand a finale reward to anyone who never sailed the coda.
    if (def.finaleSlotOnly) return { error: 'That one does not fit this slot' }
    const { data: profile } = await admin
      .from('profiles').select(SPECIAL_OWNED_COLUMN[def.id]).eq('id', user.id).single()
    if ((profile as Record<string, unknown> | null)?.[SPECIAL_OWNED_COLUMN[def.id]] !== true) {
      return { error: 'You do not own that' }
    }
  }

  await admin.from('profiles').update({ equipped_special: itemId }).eq('id', user.id)
  return { ok: true }
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
  const { data: profile } = await admin
    .from('profiles').select('ancient_catches, ancient_vigil').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  const { data: finale } = await admin.from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_sunken_hand').limit(1).maybeSingle()
  if (!finale) return { error: 'The deep does not answer to you yet.' }

  const vigil = vigilFor(profile.ancient_vigil, profile.ancient_catches as number[] | null)
  const key = String(fishId)
  const entry = vigil[key]
  if (!entry) return { error: 'You have never landed that one' }
  if (entry.released) return { error: 'That one is already out there' }
  if (entry.rank >= VIGIL_MAX_RANK) return { error: 'That one is already mastered' }

  vigil[key] = { rank: entry.rank, released: true }
  await admin.from('profiles').update({ ancient_vigil: vigil }).eq('id', user.id)
  // Hooked rather than derived: once you land it again the released flag
  // clears, so "has ever given one back" is not recoverable from state.
  try { await grantBadgeDirect(user.id, 'back_to_the_dark') } catch { /* best-effort */ }
  return { ok: true, vigil }
}

export async function equipBoat(boatId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  if (boatId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_boats').eq('id', user.id).single()
    let unlocked = (profile?.unlocked_boats as string[] | null) ?? []
    if (!unlocked.includes(boatId)) {
      // Self-heal an achievement-earned boat the player hasn't stored yet
      // (mirrors updateCharacterColor). Anything else is genuinely locked.
      const { BOAT_MAP } = await import('@/lib/boats')
      const def = BOAT_MAP[boatId]
      if (def && typeof def.achievementPoints === 'number') {
        const { getUserAchievementPoints } = await import('@/lib/achievementPoints')
        if (await getUserAchievementPoints(user.id) >= def.achievementPoints) {
          await admin.from('profiles').update({ unlocked_boats: [...unlocked, boatId] }).eq('id', user.id)
          unlocked = [...unlocked, boatId]
        }
      }
      if (!unlocked.includes(boatId)) return { error: 'Boat not unlocked' }
    }
  }
  await admin.from('profiles').update({ equipped_boat: boatId }).eq('id', user.id)
  return { ok: true }
}

export async function buyBoat(boatId: string): Promise<{ ok: true; doubloons?: number; gems?: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { BOAT_MAP } = await import('@/lib/boats')
  const def = BOAT_MAP[boatId]
  if (!def) return { error: 'Unknown boat' }
  if (def.crateOnly) return { error: 'This boat is only found in crates' }
  if (typeof def.achievementPoints === 'number') return { error: 'This boat is earned, not bought' }

  const admin = createAdminClient()
  const useGems = typeof def.gemPrice === 'number' && def.gemPrice > 0
  const price = useGems ? def.gemPrice! : def.cost
  const { data: profile } = await admin.from('profiles').select('doubloons, gems, unlocked_boats').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_boats as string[] | null) ?? []
  if (unlocked.includes(boatId)) return { error: 'Already owned' }
  const balance = useGems ? (profile.gems ?? 0) : (profile.doubloons ?? 0)
  if (balance < price) return { error: useGems ? 'Not enough gems' : 'Not enough doubloons' }
  const newBalance = balance - price

  const update: Record<string, unknown> = { unlocked_boats: [...unlocked, boatId], equipped_boat: boatId }
  if (useGems) update.gems = newBalance
  else update.doubloons = newBalance
  await admin.from('profiles').update(update).eq('id', user.id)
  await admin.from(useGems ? 'gem_transactions' : 'doubloon_transactions').insert({
    user_id: user.id,
    amount: -price,
    reason: `Bought ${def.name} boat`,
  })
  return useGems ? { ok: true, gems: newBalance } : { ok: true, doubloons: newBalance }
}

export async function equipHat(hatId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  if (hatId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_hats').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_hats as string[] | null) ?? []
    if (!unlocked.includes(hatId)) return { error: 'Hat not unlocked' }
  }
  await admin.from('profiles').update({ equipped_hat: hatId }).eq('id', user.id)
  return { ok: true }
}

/** Equip / unequip a pet. Ownership is checked against unlocked_pets, so a
 *  crafted id cannot seat a pet you never found.
 *
 *  TWO SLOTS, routed by the PET, not by the caller. Stern pets (everything
 *  that faces the back of the boat) go in equipped_pet; front-facing pets go
 *  in equipped_pet_bow. The client never names a slot — it passes an id and
 *  the pet's own `bow` flag decides — so the two can never end up holding
 *  each other's kind, and a future front-facing pet needs no changes here.
 *
 *  Unequip (null) needs a slot, since there is nothing to read a flag off:
 *  `slot` defaults to stern, which is every pet that existed before the bow. */
export async function equipPet(petId: string | null, slot: 'stern' | 'bow' = 'stern'): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  let column: string = PET_SLOT_COLUMN[slot]
  if (petId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_pets').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_pets as string[] | null) ?? []
    if (!unlocked.includes(petId)) return { error: 'Pet not unlocked' }
    const def = getPet(petId)
    if (!def) return { error: 'No such pet' }
    // The pet picks its own slot. A bow pet seated in the stern column would
    // draw two pets back to back in the same spot.
    const own = petSlot(def)
    if (!own) return { error: 'No such pet' }
    column = PET_SLOT_COLUMN[own]
  }
  await admin.from('profiles').update({ [column]: petId }).eq('id', user.id)
  return { ok: true }
}

export async function buyHat(hatId: string): Promise<{ ok: true; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { HAT_MAP } = await import('@/lib/hats')
  const def = HAT_MAP[hatId]
  if (!def) return { error: 'Unknown hat' }
  if (def.crateOnly) return { error: 'This hat is only found in crates' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, unlocked_hats').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_hats as string[] | null) ?? []
  if (unlocked.includes(hatId)) return { error: 'Already owned' }
  if ((profile.doubloons ?? 0) < def.cost) return { error: 'Not enough doubloons' }

  const newDoubloons = (profile.doubloons ?? 0) - def.cost
  await admin.from('profiles').update({
    doubloons: newDoubloons,
    unlocked_hats: [...unlocked, hatId],
    equipped_hat: hatId,
  }).eq('id', user.id)
  await admin.from('doubloon_transactions').insert({
    user_id: user.id,
    amount: -def.cost,
    reason: `Bought ${def.name} bandana`,
  })
  return { ok: true, doubloons: newDoubloons }
}

// ── Golden trophy: on-the-spot Sell or Mount choice ─────────────────
// A shiny catch lands as a row in shiny_catches with status='hold'.
// The forced-choice modal in the catch result calls one of these to
// resolve it — both transition the row to a terminal status (sold or
// mounted) so the trophy can never be re-resolved. The choice is
// final per-trophy by design: the moment is meant to land with
// weight, not be deferred into a hold list.

export async function sellGoldenTrophy(
  shinyId: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('shiny_catches')
    .select('id, status, fish_id, fish_species(name, sell_value)')
    .eq('id', shinyId)
    .eq('user_id', user.id)
    .single()
  type Row = {
    id: number; status: string; fish_id: number
    fish_species: { name: string; sell_value: number } | null
  }
  const trophy = row as unknown as Row | null
  if (!trophy) return { error: 'Trophy not found' }
  if (trophy.status !== 'hold') return { error: 'Trophy already resolved' }
  if (!trophy.fish_species) return { error: 'Species not found' }

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, fishing_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()
  const renownSellMult = fishingRenownEffects(profile?.fishing_renown_alloc as RenownAlloc | null).sellMult * eyeFromProfile(profile).sellMult
  const earned = Math.floor((trophy.fish_species.sell_value ?? 0) * SHINY_SELL_MULT * renownSellMult)
  if (earned <= 0) return { error: 'Trophy has no value' }

  const newDoubloons = (profile?.doubloons ?? 0) + earned

  await Promise.all([
    admin.from('shiny_catches')
      .update({ status: 'sold', sold_at: new Date().toISOString(), sold_for: earned })
      .eq('id', shinyId),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: earned,
      reason: `Sold golden ${trophy.fish_species.name}`,
    }),
  ])
  return { earned, doubloons: newDoubloons }
}

export async function mountGoldenTrophy(
  shinyId: number,
): Promise<{ ok: true; fishId: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('shiny_catches')
    .select('id, status, fish_id')
    .eq('id', shinyId)
    .eq('user_id', user.id)
    .single()
  if (!row) return { error: 'Trophy not found' }
  if (row.status !== 'hold') return { error: 'Trophy already resolved' }

  // Block remount: each species can only be golden once. Front-end already
  // disables the Mount button when alreadyMounted is true; this is the
  // server-side safety net.
  const { data: existing } = await admin
    .from('fish_collection')
    .select('is_golden')
    .eq('user_id', user.id)
    .eq('fish_id', row.fish_id)
    .maybeSingle()
  if (existing?.is_golden) return { error: 'Already mounted' }

  await Promise.all([
    admin.from('shiny_catches')
      .update({ status: 'mounted', sold_at: new Date().toISOString() })
      .eq('id', shinyId),
    // fish_collection row always exists by this point (the catch action
    // upserts it before reaching the shiny resolve), so we update rather
    // than upsert.
    admin.from('fish_collection')
      .update({ is_golden: true })
      .eq('user_id', user.id)
      .eq('fish_id', row.fish_id),
  ])
  return { ok: true, fishId: row.fish_id }
}

// ── Completionist Rod forge ───────────────────────────────────────────────────
// Set which (up to 3) owned rods' unique effects are folded into the
// Completionist. Reconfigurable, non-destructive — the donor rods stay in the
// inventory. Server-validated so a tampered client can't inject effects from
// rods it doesn't own or that have no unique effect. The resolved stats are
// derived from this on every cast/reel via getEffectiveRod, so this is the
// single source the gameplay paths trust.
export async function setCompletionistEffects(
  tiers: number[],
): Promise<{ completionistEffects: number[]; firstForge: boolean; charged: boolean; newDoubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const [{ data: ownedRows }, { data: prof }] = await Promise.all([
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    admin.from('profiles').select('has_seen_forge_flourish, completionist_effects, doubloons, unlocked_badges').eq('id', user.id).single(),
  ])
  const owned = new Set((ownedRows ?? []).map(r => r.rod_tier as number))
  if (!owned.has(COMPLETIONIST_TIER)) return { error: "You haven't earned the Completionist Rod yet." }

  // Dedupe, drop the Completionist itself, validate ownership + that each rod
  // actually has an effect, then cap at the slot limit.
  const clean: number[] = []
  for (const t of Array.from(new Set((tiers ?? []).filter(t => Number.isInteger(t))))) {
    if (clean.length >= COMPLETIONIST_MAX_EFFECTS) break
    if (t === COMPLETIONIST_TIER) continue
    if (!owned.has(t)) return { error: 'You can only forge in rods you own.' }
    if (!rodHasUniqueEffect(getRod(t))) return { error: 'That rod has no unique effect to forge.' }
    clean.push(t)
  }

  const doubloons = prof?.doubloons ?? 0
  const current = (prof?.completionist_effects as number[] | null) ?? []
  const currentSet = new Set(current)
  const changed = clean.length !== current.length || clean.some(t => !currentSet.has(t))
  // First-forge flourish fires the first time an actual effect lands (not on an
  // empty loadout / clear). One-time via the has_seen_forge_flourish flag.
  const firstForge = clean.length > 0 && !prof?.has_seen_forge_flourish
  // Charge for a re-forge: a real change to a non-empty loadout AFTER the free
  // first forge. Using the flag (not "is current empty") stops a clear-then-
  // rebuild from dodging the fee.
  const mustPay = changed && clean.length > 0 && !!prof?.has_seen_forge_flourish
  if (mustPay && doubloons < REFORGE_COST) return { error: `Re-forging costs ${REFORGE_COST.toLocaleString()} doubloons.` }

  const newDoubloons = mustPay ? doubloons - REFORGE_COST : doubloons
  const update: Record<string, unknown> = { completionist_effects: clean }
  if (firstForge) update.has_seen_forge_flourish = true
  if (mustPay) update.doubloons = newDoubloons

  // "Reforged" badge — pay the re-forge fee to swap into a fresh FULL loadout.
  // Hook-granted (a paid re-forge isn't recoverable from the final state, which
  // just reads as 3 effects — same as a free first forge).
  const badges = (prof?.unlocked_badges as string[] | null) ?? []
  if (mustPay && clean.length >= COMPLETIONIST_MAX_EFFECTS && !badges.includes('reforged')) {
    update.unlocked_badges = [...badges, 'reforged']
  }

  await admin.from('profiles').update(update).eq('id', user.id)
  return { completionistEffects: clean, firstForge, charged: mustPay, newDoubloons }
}


// ── FISHING LEVEL REWARDS ────────────────────────────────────────────────────
// Pay out every level the captain has earned but not yet been paid for.
//
// STATE-BASED, deliberately. The obvious implementation is "grant on the level-up",
// but fishing XP arrives from TRAWLS too, which resolve while the player is nowhere
// near the fishing screen. A crossing-based grant would silently drop those levels on
// the floor. So this reconciles the level they ARE against the level they have been
// PAID for, which makes it idempotent: call it twice and the second call pays nothing.
export async function claimFishingLevelRewards(): Promise<{
  granted: { level: number; reward: LevelReward }[]
  newDoubloons: number
  newGems: number
  newHoldTier: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const empty = { granted: [], newDoubloons: 0, newGems: 0, newHoldTier: 0 }
  if (!user) return empty

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('fishing_xp, claimed_fishing_levels, doubloons, gems, fish_hold_tier')
    .eq('id', user.id)
    .single()
  if (!profile) return empty

  const level   = getLevelFromXP((profile.fishing_xp as number | null) ?? 0)
  const claimed = (profile.claimed_fishing_levels as number | null) ?? 1
  const owed    = rewardsOwed(claimed, level)
  if (owed.length === 0) {
    return {
      granted: [],
      newDoubloons: profile.doubloons ?? 0,
      newGems: profile.gems ?? 0,
      newHoldTier: (profile.fish_hold_tier as number | null) ?? 0,
    }
  }

  let doubloons = profile.doubloons ?? 0
  let gems      = profile.gems ?? 0
  let holdTier  = (profile.fish_hold_tier as number | null) ?? 0
  const bait: Record<string, number> = {}

  for (const { reward } of owed) {
    doubloons += reward.doubloons ?? 0
    gems      += reward.gems ?? 0
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

  await Promise.all([
    admin.from('profiles').update({
      doubloons,
      gems,
      fish_hold_tier: holdTier,
      claimed_fishing_levels: level,   // paid up to here; a re-call grants nothing
    }).eq('id', user.id),
    ...Object.entries(bait).map(([type, qty]) =>
      admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: type, p_qty: qty })),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: owed.reduce((a, o) => a + (o.reward.doubloons ?? 0), 0),
      reason: `Fishing level reward (Lv ${owed[0].level}${owed.length > 1 ? `-${level}` : ''})`,
    }),
  ])

  return { granted: owed, newDoubloons: doubloons, newGems: gems, newHoldTier: holdTier }
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
  const admin = createAdminClient()
  const { data } = await admin
    .from('fish_inventory')
    .select('fish_id, quantity, fish_species(*)')
    .eq('user_id', user.id)
    .gt('quantity', 0)
  return (data ?? []) as unknown as { fish_id: number; quantity: number; fish_species: {
  id: number; name: string; scientific_name: string
  description: string | null; fun_fact: string; habitat: string
  bite_rarity: number; catch_difficulty: number; catch_score: number; sell_value: number
} }[]
}
