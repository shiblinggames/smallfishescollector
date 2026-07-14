'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBait } from '@/lib/bait'
import { getRod, getEffectiveRod, COMPLETIONIST_TIER, COMPLETIONIST_MAX_EFFECTS, REFORGE_COST, rodHasUniqueEffect } from '@/lib/rods'
import { getFishHold, FISH_HOLD_TIERS } from '@/lib/fishHold'
import { rewardsOwed, type LevelReward } from '@/lib/levelRewards'
import { unlockBadge } from '@/app/(app)/achievements/badgeActions'
import { recordChallengeScore } from '@/app/(app)/social/challengeActions'
import { catchXP, getLevelFromXP } from '@/lib/fishingLevel'
import { fishingRenownEffects, type RenownAlloc } from '@/lib/renown'
import { fishingColorsToGrant } from '@/lib/characters'
import { getLineForSpeciesCount } from '@/lib/lines'
import { getSpecialItem } from '@/lib/specialItems'
import { getEffectiveDailyChallenges, getTodayUTC, challengeIncrement } from '@/lib/dailyChallenges'
import { zoneRewardDoubloons } from '@/lib/zoneRewards'
import { rollFishSize, type FishSizeTier } from '@/lib/fishSize'
import { rollShiny, SHINY_SELL_MULT } from '@/lib/shiny'
import { CRATE_PET_CHANCE, rollPet } from '@/lib/pets'

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

import { ZONE_RARITY_RATES, ZONE_MIN_LEVEL } from './zoneData'

// Wait time: zone sets the range, catch_score positions within it (higher score = longer wait)
const ZONE_WAIT_BASE: Record<string, [number, number]> = {
  shallows:    [3000,  12000],
  open_waters: [5000,  20000],
  deep:        [8000,  35000],
  abyss:       [12000, 45000],
  ancient_deep: [45000, 120000],
}
function fishWaitMs(catchScore: number, habitat: string, baitType: string, fishingLevel: number, renownWaitMult = 1): number {
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
  return Math.max(3000, Math.round(base * baitMult * levelMult * renownWaitMult))
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

export type CrateTier = 'wooden' | 'metal' | 'gold' | 'diamond'

const ZONE_CRATE_TIERS: Record<string, Record<CrateTier, number>> = {
  shallows:    { wooden: 80, metal: 10, gold: 7,  diamond: 3  },
  open_waters: { wooden: 60, metal: 20, gold: 12, diamond: 8  },
  deep:        { wooden: 35, metal: 30, gold: 20, diamond: 15 },
  abyss:       { wooden: 15, metal: 25, gold: 35, diamond: 25 },
}

function rollCrateTier(habitat: string): CrateTier {
  const dist = ZONE_CRATE_TIERS[habitat] ?? ZONE_CRATE_TIERS.shallows
  const total = dist.wooden + dist.metal + dist.gold + dist.diamond
  let r = Math.random() * total
  if ((r -= dist.wooden)  < 0) return 'wooden'
  if ((r -= dist.metal)   < 0) return 'metal'
  if ((r -= dist.gold)    < 0) return 'gold'
  return 'diamond'
}

export async function castLine(baitType: string, habitat: string): Promise<
  | { fishId: number; catchDifficulty: number; biteRarity: number; waitMs: number; crateTier?: CrateTier; baitRemaining?: number; instantBite?: boolean }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('rod_tier, completionist_effects, hook_tier, fishing_xp, fish_hold_tier, ancient_catches, active_event, catch_pending, fishing_renown_alloc')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const bait = getBait(baitType)
  const renownWaitMult = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null).biteWaitMult

  // Validate zone access by fishing level
  const fishingLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const minLevel = ZONE_MIN_LEVEL[habitat] ?? 1
  if (fishingLevel < minLevel) {
    return { error: `Reach Fishing Level ${minLevel} to fish here` }
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

  if (!noBait && (!baitRow || baitRow.quantity <= 0)) return { error: 'No bait remaining.' }

  if (!candidates || candidates.length === 0) return { error: 'No fish found in this zone' }

  // Ancient Deep pool filter:
  //   1. Already-caught trophies always filter out (one-and-done).
  //   2. With regular bait, ALL trophies filter out — the 12 regulars
  //      bite on worms etc., but the 6 prehistoric trophies will only
  //      surface for a Luminous or Golden Lure. Sell_value === 0 is
  //      the trophy discriminator (matches the trophy/inventory split
  //      in the catch handler below).
  let pool = candidates
  if (habitat === 'ancient_deep') {
    const caught = new Set<number>((profile.ancient_catches as number[] | null) ?? [])
    const isLure = baitType === 'luminous' || baitType === 'golden'
    pool = candidates.filter(f => {
      if (caught.has(f.id)) return false
      if (!isLure && (f.sell_value ?? 0) === 0) return false
      return true
    })
    if (pool.length === 0) return { error: 'You have caught every Ancient Deep species available with this bait!' }
  }

  const rod = getEffectiveRod(profile.rod_tier ?? 0, profile.completionist_effects as number[] | null)

  // Crate encounter: 2% chance (× rod.crateChanceMult — Treasure Rod = 2×).
  // Rolled up-front so the in-flight flag below can skip crates — they're
  // streak-neutral, so bailing on a crate cast never breaks a streak.
  const isCrate = habitat !== 'ancient_deep' && Math.random() < 0.02 * (rod.crateChanceMult ?? 1)

  // Remember this bait so the fishing UI auto-selects it on next open
  // (FishingGame.tsx seeds selectedBait from profile.last_used_bait). Also mark
  // a REAL-fish catch as in-flight: if one was ALREADY pending, the previous
  // cast was abandoned (player left mid-catch to dodge a hard fish), which
  // breaks the perfect streak just like a miss — no cheesing it by bailing on
  // fish you don't like. Fire-and-forget — the multi-second gap before reelIn
  // means it always commits first; a failure mustn't block the cast result.
  const castUpdate: Record<string, unknown> = { last_used_bait: baitType, catch_pending: !isCrate }
  if (profile.catch_pending) castUpdate.current_perfect_streak = 0
  void admin.from('profiles').update(castUpdate).eq('id', user.id).then(() => {}, () => {})

  // Lifetime "Lines Cast" career stat — bump once per committed cast (covers
  // both the crate and normal paths below). Fire-and-forget.
  void admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_casts', n: 1 }).then(() => {}, () => {})

  if (isCrate) {
    if (!noBait && baitRow) {
      await admin.from('bait_inventory').update({ quantity: baitRow.quantity - 1 }).eq('user_id', user.id).eq('bait_type', baitType)
    }
    const crateWait = { shallows: 4000, open_waters: 7000, deep: 11000, abyss: 16000 }[habitat] ?? 6000
    const crateTier = rollCrateTier(habitat)
    return { fishId: CRATE_FISH_ID, catchDifficulty: 1, biteRarity: 1, waitMs: crateWait, crateTier, baitRemaining: !noBait && baitRow ? baitRow.quantity - 1 : undefined }
  }

  if (!noBait && baitRow) {
    await admin
      .from('bait_inventory')
      .update({ quantity: baitRow.quantity - 1 })
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
  }

  // Fish selection. In Ancient Deep the TROPHY (tier-5) roll is an EXPLICIT flat
  // chance set by the lure — Luminous 15%, Golden 20% — so the two premium lures
  // are meaningfully different (they used to be identical, both a flat 10% via
  // the shared tier table). Rod + event rarity bonuses still amplify it, so
  // special rods keep helping. Non-lure casts never reach the trophy pool (it's
  // filtered out above), so baseTrophyChance is 0 for them and this is lure-only.
  let fish: (typeof pool)[number]
  if (habitat === 'ancient_deep') {
    const trophyPool  = pool.filter(f => (f.sell_value ?? 0) === 0)   // uncaught trophies (lure casts only)
    const regularPool = pool.filter(f => (f.sell_value ?? 0) > 0)
    const baseTrophyChance = baitType === 'golden' ? 0.20 : baitType === 'luminous' ? 0.15 : 0
    const trophyChance = Math.min(0.95, baseTrophyChance * (1 + (rod.rarityBonus + eventRarityBonus) * 4))
    if (trophyPool.length > 0 && Math.random() < trophyChance) {
      fish = trophyPool[Math.floor(Math.random() * trophyPool.length)]
    } else if (regularPool.length > 0) {
      fish = tierWeightedPick(regularPool, habitat, rod.rarityBonus + eventRarityBonus)
    } else {
      // Regulars somehow exhausted — hand back a trophy so the cast still lands.
      fish = trophyPool[Math.floor(Math.random() * trophyPool.length)]
    }
  } else {
    fish = tierWeightedPick(pool, habitat, rod.rarityBonus + eventRarityBonus)
  }
  let waitMs = fishWaitMs(fish.catch_score, habitat, baitType, fishingLevel, renownWaitMult)

  // Lightsaber Rod — "Lightspeed": a chance the bite is near-instant. This is
  // the only rod stat that actually changes the bite wait (biteIntervalMs is
  // display-only), so the fast-bite fantasy is real, not cosmetic. The flag
  // drives the red blade-flash cue client-side so the player feels it land.
  let instantBite = false
  if ((rod.instantBiteChance ?? 0) > 0 && Math.random() < rod.instantBiteChance!) {
    waitMs = Math.min(waitMs, 700)
    instantBite = true
  }

  return { fishId: fish.id, catchDifficulty: fish.catch_difficulty, biteRarity: fish.bite_rarity, waitMs, baitRemaining: !noBait && baitRow ? baitRow.quantity - 1 : undefined, instantBite }
}

const CRATE_FISH_ID = -1

const PERFECT_BAIT_SAVE_CHANCE = 0.5

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
      dailyProgress: [number, number, number]
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
    // (the client value is never trusted). Also clears the in-flight flag.
    await admin.from('profiles').update({ current_perfect_streak: 0, catch_pending: false }).eq('id', user.id)
    return { caught: false }
  }

  const [{ data: fish }, { data: profile }, { data: holdRows }] = await Promise.all([
    admin.from('fish_species').select('*').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons, fishing_abyss_streak, fishing_xp, rod_tier, completionist_effects, fish_hold_tier, has_phantom_hook, has_perfected_sigil, equipped_special, line_tier, prestige_levels, ancient_catches, unlocked_character_colors, total_perfects, current_perfect_streak, highest_perfect_streak, force_shiny_next_perfect, force_shiny_always, fishing_renown_alloc').eq('id', user.id).single(),
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
  ])

  if (!fish || !profile) return { error: 'Data not found' }

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
    const xpGained = Math.round(catchXP(fish.catch_difficulty, fish.habitat, result === 'perfect') * 3 * renownXpMult)
    const newXP = (profile.fishing_xp ?? 0) + xpGained
    // Perfect streak counts in ancient too (it grants no streak XP bonus here,
    // by design), tracked server-side so it can't be spoofed.
    const aStreak = result === 'perfect' ? (profile.current_perfect_streak ?? 0) + 1 : 0
    const updates: Record<string, unknown> = { fishing_xp: newXP, current_perfect_streak: aStreak, catch_pending: false }
    if (result === 'perfect') updates.total_perfects = (profile.total_perfects ?? 0) + 1
    if (aStreak > (profile.highest_perfect_streak ?? 0)) {
      updates.highest_perfect_streak = aStreak
      updates.highest_streak_set_at = new Date().toISOString()
      updates.best_streak_zone = 'ancient_deep'
    }
    if (isNewTrophy) updates.ancient_catches = [...existing, fishId]
    const newTrophies = isNewTrophy ? [...existing, fishId] : existing
    if (newTrophies.length >= 6) await unlockBadge('ancient_ones')
    if (aStreak >= 10) await unlockBadge('unbroken')
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
    }
  }

  // Perfect: 50% chance to return the bait used for this cast; Phantom Hook: additional 25% on any catch
  let baitSaved = result === 'perfect' && Math.random() < PERFECT_BAIT_SAVE_CHANCE
  if (!baitSaved && profile.has_phantom_hook) baitSaved = Math.random() < 0.25

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
  const isShiny = forcedShinyOnce || forcedShinyAlways || rollShiny({ isPerfect, habitat: fish.habitat, sellValue: fish.sell_value ?? 0 })

  // Check if new species for bestiary
  const { data: existing } = await admin
    .from('fish_collection')
    .select('catch_count')
    .eq('user_id', user.id)
    .eq('fish_id', fishId)
    .single()

  const isNewSpecies = !existing

  // Upsert bestiary log
  if (isNewSpecies) {
    await admin.from('fish_collection').insert({ user_id: user.id, fish_id: fishId, catch_count: 1 })
  } else {
    await admin.from('fish_collection').update({
      catch_count: existing.catch_count + 1,
      last_caught_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('fish_id', fishId)
  }

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
  const desired = isShiny ? 1 : (effectiveJackpotMult > 1 ? effectiveJackpotMult : (effectiveDoubleCatch ? 2 : 1))
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

  // Auto-upgrade line tier on new species unlock
  if (isNewSpecies) {
    const [{ count: uniqueCount }, { count: totalCount }] = await Promise.all([
      admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('fish_species').select('*', { count: 'exact', head: true }).neq('habitat', 'ancient_deep'),
    ])
    const unique = uniqueCount ?? 0
    const newLineTier = getLineForSpeciesCount(unique).tier
    if (newLineTier > (profile?.line_tier ?? 0)) {
      await admin.from('profiles').update({ line_tier: newLineTier }).eq('id', user.id)
    }
    if (unique >= (totalCount ?? Infinity)) await unlockBadge('full_collection')
  }

  // Track abyss streak for achievements
  const isAbyssPerfect = result === 'perfect' && fish.habitat === 'abyss'
  const newAbyssStreak = isAbyssPerfect ? (profile.fishing_abyss_streak ?? 0) + 1 : 0
  const prestigeLevels = (profile.prestige_levels as Record<string, number> | null) ?? {}
  const zonePrestige = prestigeLevels[fish.habitat] ?? 0
  const prestigeXPMult = 1 + zonePrestige * 0.10
  // Perfect Rod doubles XP on perfect catches (incl. the streak bonus, so
  // it scales with streaks). Non-perfect catches are unaffected.
  const perfectXpMult = result === 'perfect' ? (reelRod.perfectXpMult ?? 1) : 1
  // Perfect streak — server-authoritative. We compute the streak + its XP bonus
  // ourselves from the stored value; the client-supplied number is ignored, so
  // it can't be inflated to mint XP.
  const newPerfectStreak = result === 'perfect' ? (profile.current_perfect_streak ?? 0) + 1 : 0
  const serverStreakBonus = newPerfectStreak * newPerfectStreak * 3 // streak 1=+3, 2=+12, 3=+27, … (0 when not perfect)
  const xpGained = Math.round((catchXP(fish.catch_difficulty, fish.habitat, result === 'perfect') + serverStreakBonus) * prestigeXPMult * perfectXpMult * renownXpMult)
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

  // Fishing-level skin unlocks: Forest @ 50, Ice @ 75
  const profileUpdates: Record<string, unknown> = {
    fishing_abyss_streak: newAbyssStreak, fishing_xp: newXP, current_perfect_streak: newPerfectStreak, catch_pending: false,
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
  if (oldFishingLevel < 100 && newFishingLevel >= 100) await unlockBadge('master_angler')
  if (newPerfectStreak >= 10) await unlockBadge('unbroken')

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

  // Record challenge score (fire and forget)
  recordChallengeScore(user.id, fish.sell_value * catchQty, result === 'perfect').catch(() => {})

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
      try { await unlockBadge('trophy_catch') } catch { /* best-effort */ }
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
    .select('p1, p2, p3, claimed_1, claimed_2, claimed_3, fishing_level_snapshot')
    .eq('user_id', user.id)
    .eq('date', dailyDate)
    .maybeSingle()

  // oldFishingLevel was computed above (line ~473) from the pre-catch
  // XP — that's the right level to lock in for today, even if THIS
  // catch is the one that pushes them across a zone boundary.
  const snapLevel = dailyRow?.fishing_level_snapshot ?? oldFishingLevel
  const dailyChallenges = await getEffectiveDailyChallenges(dailyDate, admin, snapLevel)

  const newP = [
    Math.min(
      (dailyRow?.p1 ?? 0) + challengeIncrement(dailyChallenges[0], fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
      dailyChallenges[0].target,
    ),
    Math.min(
      (dailyRow?.p2 ?? 0) + challengeIncrement(dailyChallenges[1], fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
      dailyChallenges[1].target,
    ),
    Math.min(
      (dailyRow?.p3 ?? 0) + challengeIncrement(dailyChallenges[2], fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
      dailyChallenges[2].target,
    ),
  ] as [number, number, number]

  await admin.from('daily_challenge_progress').upsert(
    {
      user_id: user.id,
      date: dailyDate,
      p1: newP[0], p2: newP[1], p3: newP[2],
      // Persist the snapshot on first touch (no-op on subsequent
      // upserts since the value won't change).
      fishing_level_snapshot: snapLevel,
    },
    { onConflict: 'user_id,date' },
  )

  return {
    caught: true,
    fish: fish as FishSpecies,
    baitSaved,
    isNewSpecies,
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

  const { data: profile } = await admin.from('profiles').select('rod_tier, completionist_effects, pending_reroll').eq('id', user.id).single()
  const pending = (profile?.pending_reroll ?? null) as { fishId: number; qty: number; habitat: string } | null
  if (!pending) return { error: 'No catch to reroll.' }

  // Clear the token immediately so this is strictly one-shot even if the player
  // double-taps — the swap below is keyed off the captured `pending` values.
  await admin.from('profiles').update({ pending_reroll: null }).eq('id', user.id)

  const { fishId: origId, qty, habitat } = pending
  const { data: candidates } = await admin
    .from('fish_species')
    .select('id, catch_difficulty, catch_score, bite_rarity, sell_value')
    .eq('habitat', habitat)
  // A wormhole sends you somewhere ELSE — exclude the original so the reroll
  // always lands on a different fish. Trophies (sell_value 0) never apply here
  // since ancient_deep is ineligible for the wormhole.
  const pool = (candidates ?? []).filter(f => f.id !== origId)
  if (pool.length === 0) return { error: 'The wormhole found nothing new.' }

  const rod = getEffectiveRod(profile?.rod_tier ?? 0, profile?.completionist_effects as number[] | null)
  const picked = tierWeightedPick(pool, habitat, rod.rarityBonus)
  const { data: newFish } = await admin.from('fish_species').select('*').eq('id', picked.id).single()
  if (!newFish) return { error: 'The wormhole collapsed.' }

  // Hold swap — remove the original stack, add the new one (qty-neutral).
  const { data: origRow } = await admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', origId).single()
  if (origRow) {
    const left = Math.max(0, origRow.quantity - qty)
    if (left === 0) await admin.from('fish_inventory').delete().eq('user_id', user.id).eq('fish_id', origId)
    else await admin.from('fish_inventory').update({ quantity: left }).eq('user_id', user.id).eq('fish_id', origId)
  }
  const { data: newRow } = await admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', newFish.id).single()
  if (newRow) await admin.from('fish_inventory').update({ quantity: newRow.quantity + qty }).eq('user_id', user.id).eq('fish_id', newFish.id)
  else await admin.from('fish_inventory').insert({ user_id: user.id, fish_id: newFish.id, quantity: qty })

  // Bestiary — the new fish counts as discovered/caught (you did pull it in).
  const { data: collRow } = await admin.from('fish_collection').select('catch_count').eq('user_id', user.id).eq('fish_id', newFish.id).maybeSingle()
  const isNewSpecies = !collRow
  if (isNewSpecies) await admin.from('fish_collection').insert({ user_id: user.id, fish_id: newFish.id, catch_count: qty })
  else await admin.from('fish_collection').update({ catch_count: collRow.catch_count + qty, last_caught_at: new Date().toISOString() }).eq('user_id', user.id).eq('fish_id', newFish.id)

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

// Crate loot tables — doubloons and bait pool depend on crate tier, not zone.
const CRATE_DOUBLOON_RANGE: Record<CrateTier, [number, number]> = {
  wooden:  [100,  400 ],
  metal:   [250,  1000],
  gold:    [500,  2000],
  diamond: [1000, 4000],
}

const CRATE_BAIT_POOLS: Record<CrateTier, { type: string; weight: number }[]> = {
  wooden:  [
    { type: 'worm',            weight: 50 },
    { type: 'minnow',          weight: 30 },
    { type: 'night_crawler',   weight: 20 },
  ],
  metal:   [
    { type: 'chum',            weight: 40 },
    { type: 'anglers_formula', weight: 30 },
    { type: 'night_crawler',   weight: 20 },
    { type: 'minnow',          weight: 10 },
  ],
  gold:    [
    { type: 'chum',            weight: 50 },
    { type: 'anglers_formula', weight: 35 },
    { type: 'night_crawler',   weight: 15 },
  ],
  diamond: [
    { type: 'chum',            weight: 60 },
    { type: 'anglers_formula', weight: 40 },
  ],
}

const CRATE_BAIT_QTY: Record<CrateTier, number> = {
  wooden:  5,
  metal:   10,
  gold:    15,
  diamond: 20,
}

// Per-tier outcome weights. Wooden/metal have no cosmetic outcome.
const CRATE_OUTCOME_WEIGHTS: Record<CrateTier, { doubloons: number; bait: number; cosmetic: number }> = {
  wooden:  { doubloons: 50, bait: 50, cosmetic: 0  },
  metal:   { doubloons: 50, bait: 50, cosmetic: 0  },
  gold:    { doubloons: 55, bait: 35, cosmetic: 10 },
  diamond: { doubloons: 25, bait: 60, cosmetic: 15 },
}

// Crate-exclusive cosmetics that can drop from gold/diamond crates.
// Keep ids in sync with lib/boats.ts, lib/hats.ts, lib/characters.ts.
const CRATE_COSMETIC_POOL = [
  { kind: 'skin' as const, id: 'mint',      name: 'Mint'                   },
  { kind: 'skin' as const, id: 'lavender',  name: 'Lavender'               },
  { kind: 'skin' as const, id: 'storm',     name: 'Storm'                  },
  { kind: 'boat' as const, id: 'charcoal',  name: 'Charcoal',  imageUrl: '/boat_charcoal_rest.png' },
  { kind: 'boat' as const, id: 'offwhite',  name: 'Offwhite',  imageUrl: '/boat_offwhite_rest.png' },
  { kind: 'hat'  as const, id: 'black',     name: 'Black',     imageUrl: '/hat_black_rest.png'     },
  { kind: 'hat'  as const, id: 'gray',      name: 'Gray',      imageUrl: '/hat_gray_rest.png'      },
]

export type CrateLoot =
  | { type: 'doubloons'; amount: number }
  | { type: 'bait';      baitType: string; baitName: string; quantity: number }
  | { type: 'skin';      skinId: string;   skinName: string }
  | { type: 'hat';       hatId: string;    hatName: string;  hatImageUrl: string  }
  | { type: 'boat';      boatId: string;   boatName: string; boatImageUrl: string }
  | { type: 'pet';       petId: string;    petName: string;  petImageUrl: string; petAccent: string; isDuplicate: boolean }

export async function reelCrate(_zone: string, tier: CrateTier = 'wooden'): Promise<CrateLoot | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  // Lifetime crates-opened counter (admin stat).
  await admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_crates_opened', n: 1 })

  const { data: profile } = await admin.from('profiles')
    .select('doubloons, unlocked_character_colors, unlocked_boats, unlocked_hats, unlocked_pets, equipped_pet')
    .eq('id', user.id).single()

  const unlockedSkins = (profile?.unlocked_character_colors as string[] | null) ?? []
  const unlockedBoats = (profile?.unlocked_boats as string[] | null) ?? []
  const unlockedHats  = (profile?.unlocked_hats  as string[] | null) ?? []
  const unlockedPets  = (profile?.unlocked_pets  as string[] | null) ?? []

  // ── Pet roll — OVERRIDE the normal outcome on hit ─────────────────
  // Rolled FIRST and exclusively, so the rare moment owns the screen
  // instead of fighting with a doubloons/bait/cosmetic result. Rates
  // are tunable in lib/pets.CRATE_PET_CHANCE. Duplicate parrots (same
  // id) auto-equip the new variant but don't add a second entry to
  // unlocked_pets — the player still sees the celebration, just with
  // a "Duplicate" badge in the UI.
  if (Math.random() < CRATE_PET_CHANCE[tier]) {
    const pet = rollPet()
    const isDuplicate = unlockedPets.includes(pet.id)
    if (!isDuplicate) {
      await admin.from('profiles').update({
        unlocked_pets: [...unlockedPets, pet.id],
        // Auto-equip the first pet so the player sees it land in their
        // Appearance loadout without an extra tap. Subsequent unlocks
        // don't auto-equip — the player chooses which to wear.
        equipped_pet: (profile?.equipped_pet as string | null) ?? pet.id,
      }).eq('id', user.id)
    }
    return {
      type: 'pet',
      petId: pet.id, petName: pet.name,
      petImageUrl: pet.restImageUrl,
      petAccent: pet.accentColor,
      isDuplicate,
    }
  }

  const isOwned = (entry: typeof CRATE_COSMETIC_POOL[number]) => {
    if (entry.kind === 'skin') return unlockedSkins.includes(entry.id)
    if (entry.kind === 'boat') return unlockedBoats.includes(entry.id)
    return unlockedHats.includes(entry.id)
  }

  const weights = CRATE_OUTCOME_WEIGHTS[tier]
  const unownedCosmetics = CRATE_COSMETIC_POOL.filter(c => !isOwned(c))
  // If cosmetic outcome can't actually pay out (everything owned), fold its weight into doubloons.
  const cosmeticWeight = unownedCosmetics.length > 0 ? weights.cosmetic : 0
  const doubloonWeight = weights.doubloons + (unownedCosmetics.length > 0 ? 0 : weights.cosmetic)

  type Outcome = 'doubloons' | 'bait' | 'cosmetic'
  const pool: { outcome: Outcome; weight: number }[] = [
    { outcome: 'doubloons', weight: doubloonWeight },
    { outcome: 'bait',      weight: weights.bait   },
    { outcome: 'cosmetic',  weight: cosmeticWeight },
  ]
  const total = pool.reduce((s, o) => s + o.weight, 0)
  let rand = Math.random() * total
  let outcome: Outcome = 'doubloons'
  for (const o of pool) { rand -= o.weight; if (rand <= 0) { outcome = o.outcome; break } }

  if (outcome === 'cosmetic') {
    const picked = unownedCosmetics[Math.floor(Math.random() * unownedCosmetics.length)]
    if (picked.kind === 'skin') {
      await admin.from('profiles').update({ unlocked_character_colors: [...unlockedSkins, picked.id] }).eq('id', user.id)
      return { type: 'skin', skinId: picked.id, skinName: picked.name }
    }
    if (picked.kind === 'boat') {
      await admin.from('profiles').update({ unlocked_boats: [...unlockedBoats, picked.id] }).eq('id', user.id)
      return { type: 'boat', boatId: picked.id, boatName: picked.name, boatImageUrl: picked.imageUrl }
    }
    await admin.from('profiles').update({ unlocked_hats: [...unlockedHats, picked.id] }).eq('id', user.id)
    return { type: 'hat', hatId: picked.id, hatName: picked.name, hatImageUrl: picked.imageUrl }
  }

  if (outcome === 'doubloons') {
    const [min, max] = CRATE_DOUBLOON_RANGE[tier]
    const amount = Math.floor(min + Math.random() * (max - min + 1))
    await admin.from('profiles').update({ doubloons: (profile?.doubloons ?? 0) + amount }).eq('id', user.id)
    return { type: 'doubloons', amount }
  }

  // Bait — weighted random pick from this tier's pool
  const baitPool = CRATE_BAIT_POOLS[tier]
  const totalBaitWeight = baitPool.reduce((s, b) => s + b.weight, 0)
  let baitRand = Math.random() * totalBaitWeight
  let picked = baitPool[0]
  for (const b of baitPool) { baitRand -= b.weight; if (baitRand <= 0) { picked = b; break } }
  const qty = CRATE_BAIT_QTY[tier]
  const { data: existing } = await admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', picked.type).single()
  if (existing) {
    await admin.from('bait_inventory').update({ quantity: existing.quantity + qty }).eq('user_id', user.id).eq('bait_type', picked.type)
  } else {
    await admin.from('bait_inventory').insert({ user_id: user.id, bait_type: picked.type, quantity: qty })
  }
  const baitName = getBait(picked.type).name
  return { type: 'bait', baitType: picked.type, baitName, quantity: qty }
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
    admin.from('profiles').select('doubloons, active_event, fishing_renown_alloc').eq('id', user.id).single(),
  ])

  if (!invRow || !fish || !profile) return { error: 'Data not found' }
  if (invRow.quantity < quantity) return { error: 'Not enough fish' }

  const fullPrice = getActiveEvent(profile.active_event)?.type === 'fullmoon'
  const renownSellMult = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null).sellMult
  // Quick-sell at 75% (was 65%) — gives new players a softer floor so
  // one bad early sell doesn't lock them out of their next rod tier.
  // The two-lane design is unchanged: market still pays full price,
  // delayed liquidate still pays 87% after fees, this just narrows
  // the gap between "convenient" and "punishing." See review notes
  // on economy: quick-sell was the largest self-inflicted-wound state.
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
    ...(newDoubloons >= 1_000_000 ? [unlockBadge('deep_pockets')] : []),
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
    admin.from('profiles').select('doubloons, active_event, fishing_renown_alloc').eq('id', user.id).single(),
  ])

  if (!profile) return { error: 'Profile not found' }

  type InvRow = { fish_id: number; quantity: number; fish_species: { sell_value: number } | null }
  const inventory = (inventoryRes.data ?? []) as unknown as InvRow[]
  if (inventory.length === 0) return { error: 'Nothing to sell' }

  const fullPrice = getActiveEvent(profile.active_event)?.type === 'fullmoon'
  const renownSellMult = fishingRenownEffects(profile.fishing_renown_alloc as RenownAlloc | null).sellMult
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
    ...(newDoubloons >= 1_000_000 ? [unlockBadge('deep_pockets')] : []),
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

export async function prestigeZone(zone: string): Promise<{ prestigeLevel: number; unlockedSkinId?: string } | { error: string }> {
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
    .select('prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, unlocked_character_colors')
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
  const newLevel = (currentLevels[zone] ?? 0) + 1
  const newLevels = { ...currentLevels, [zone]: newLevel }

  // Sand skin: unlock when any zone reaches prestige 3
  let prestigeUnlockedSkin: string | undefined
  const profileUpdate: Record<string, unknown> = { prestige_levels: newLevels, [rewardCol]: false }
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

  await Promise.all([
    admin.from('fish_collection').delete().eq('user_id', user.id).in('fish_id', zoneIds),
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
    unlockBadge('prestige_i'),
    ...(allZonesPrestiged ? [unlockBadge('zone_legend')] : []),
  ])

  return { prestigeLevel: newLevel, unlockedSkinId: prestigeUnlockedSkin }
}

export async function useTideTurnerSkip(): Promise<{ ok: true; skipsLeft: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_tide_turner, tide_turner_used, tide_turner_date')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (!profile.has_tide_turner) return { error: 'No Tide Turner' }

  const todayStr = today()
  const usedToday = profile.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  if (usedToday >= 3) return { error: 'No skips remaining today' }

  const newUsed = usedToday + 1
  await admin.from('profiles').update({ tide_turner_used: newUsed, tide_turner_date: todayStr }).eq('id', user.id)
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
  await admin.from('profiles').update({ equipped_special: itemId }).eq('id', user.id)
  return { ok: true }
}

export async function equipBoat(boatId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  if (boatId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_boats').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_boats as string[] | null) ?? []
    if (!unlocked.includes(boatId)) return { error: 'Boat not unlocked' }
  }
  await admin.from('profiles').update({ equipped_boat: boatId }).eq('id', user.id)
  return { ok: true }
}

export async function buyBoat(boatId: string): Promise<{ ok: true; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { BOAT_MAP } = await import('@/lib/boats')
  const def = BOAT_MAP[boatId]
  if (!def) return { error: 'Unknown boat' }
  if (def.crateOnly) return { error: 'This boat is only found in crates' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, unlocked_boats').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_boats as string[] | null) ?? []
  if (unlocked.includes(boatId)) return { error: 'Already owned' }
  if ((profile.doubloons ?? 0) < def.cost) return { error: 'Not enough doubloons' }

  const newDoubloons = (profile.doubloons ?? 0) - def.cost
  await admin.from('profiles').update({
    doubloons: newDoubloons,
    unlocked_boats: [...unlocked, boatId],
    equipped_boat: boatId,
  }).eq('id', user.id)
  await admin.from('doubloon_transactions').insert({
    user_id: user.id,
    amount: -def.cost,
    reason: `Bought ${def.name} boat`,
  })
  return { ok: true, doubloons: newDoubloons }
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

/** Equip / unequip a pet. Pets are crate-only today (no shop), so the
 *  ownership check rejects any id not in unlocked_pets. Pass null to
 *  unequip. */
export async function equipPet(petId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  if (petId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_pets').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_pets as string[] | null) ?? []
    if (!unlocked.includes(petId)) return { error: 'Pet not unlocked' }
  }
  await admin.from('profiles').update({ equipped_pet: petId }).eq('id', user.id)
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
    .select('doubloons, fishing_renown_alloc')
    .eq('id', user.id)
    .single()
  const renownSellMult = fishingRenownEffects(profile?.fishing_renown_alloc as RenownAlloc | null).sellMult
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
