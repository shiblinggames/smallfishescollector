'use server'

import { inCaptainsWater } from '@/lib/captainWater'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidDamageProfile, fortuneLootMult } from '@/lib/expeditions'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { computeRaidMap } from '@/lib/raidMap'
import { buildClearedSet } from '@/lib/raidProgress'
import { getRaidConfigById, rollRaidCurrency, ITEM_GRANTS, MAX_CRATE_BASE_DOUBLOONS } from '@/lib/raidRegistry'
import { rollCrate, isChallengeRaid } from '@/lib/raidLoot'
import { flagAnomaly } from '@/lib/anomaly'
import { issueRunToken, markRunCleared, markRunLooted } from '@/lib/runToken'
import { logBountyEvent } from '@/lib/bountyEvents'
import { RAID_DAMAGE_MIN } from '@/lib/bounties'
import { getRaidPlayerStats } from '@/lib/raidPlayerStats'
import { grant, arrayAdd } from '@/lib/wallet'

// RaidCrewMember, RaidPlayerStats and getRaidPlayerStats live in
// lib/raidPlayerStats.ts. As an export of this 'use server' file the loader was
// a public endpoint that read any captain's loadout by user id.

// ── NO REPAIR BILL ──────────────────────────────────────────────────────────
//
// Sinking in a raid used to owe a tier-scaled doubloon fee, and until it was
// paid every raid route redirected you to /expeditions and every boss card
// refused. `reportRaidSink` and `repairShip` lived here; both are gone, and so
// is the `raid_repair_owed` column's last reader.
//
// THE WORLD IS THE PENALTY NOW. The campaign is not a menu of raids any more,
// it is water you sail: a boss is eight thousand pixels out through a strait,
// and going down puts you back at the Gunwharf with all of that to sail again.
// That costs the one thing a doubloon fee never did — the trip — and it does it
// without a paywall between a captain and the fight they just lost, which is
// the exact moment a game should be asking them to try again rather than to
// go and grind.

/** Clear-time summary returned by recordRaidClear for the victory screen. */
export interface RaidClearTimes {
  yourBestMs: number
  /** Fastest non-admin clear of this raid (null if none). */
  globalBestMs: number | null
  globalBestUsername: string
  isPersonalBest: boolean
  isGlobalBest: boolean
}

/** Record a raid clear the MOMENT the boss dies — independent of the
 *  loot-claim flow. Previously the raid_completions insert was bundled
 *  inside claimRaidLoot(); any failure (network blip, player closing
 *  the tab on the victory screen, etc.) silently dropped the clear and
 *  the next story node stayed locked. Fire-and-forget for the guarded
 *  fallback callers; the boss-death caller captures the returned times to
 *  show "this run vs your best vs global best" on the victory screen.
 *  Previous bests are read BEFORE the insert so a new record can be flagged. */
/** Mint a run token at raid START. Every reward call of the run (awardRaidKill,
 *  recordRaidClear, claimRaidLoot) REQUIRES it: kills pay once per round of the
 *  token's own raid, the clear banks once, and the crate opens once after the
 *  clear. The raidId is baked in here so nothing on the request path can swap
 *  the raid. Returns { token: null } on any problem; the client awaits this at
 *  its first reward call rather than racing it. */
export async function startRaidRun(raidId: string): Promise<{ token: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { token: null }
  const config = getRaidConfigById(raidId)
  if (!config) return { token: null }
  const admin = createAdminClient()
  const maxKills = config.sequence.length * 3 + 15
  const token = await issueRunToken(admin, user.id, 'raid', { raidId, maxKills })
  return { token }
}

/**
 * Record a clear. TOKEN-BOUND, which it was not.
 *
 * The doc on startRaidRun above says both reward calls "reference it so a run's
 * rewards are bounded to its real mob count and its clear can't be replayed".
 * awardRaidKill does. This one never took a token at all, so it inserted a
 * raid_completions row for whatever raidId and time it was handed, as many times
 * as it was called.
 *
 * That row is not cosmetic. It is the cleared set the raid map unlocks nodes
 * from, the meter every raid bounty counts, and the speed record. Forging it
 * meant unlocking the campaign, completing orders and taking the global record
 * without fighting anything. Reported by a tester who replayed exactly this
 * endpoint.
 *
 * The token is consumed here, so a run yields ONE clear. A replay finds it spent
 * and is refused. The raidId is checked against the token's own meta, so a token
 * minted for an easy raid cannot bank a clear of a hard one.
 *
 * REQUIRED now. The tolerant no-token path was the gap a forged clear walked
 * through; every client sends the token, so a call without one is refused and
 * flagged.
 */
export async function recordRaidClear(raidId: string, elapsedMs: number, token?: string | null): Promise<RaidClearTimes | null> {
  if (!raidId || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()

  // A clear cannot be faster than the shortest honest fight. Anything under this
  // is a forged time reaching for the global record, not a good run.
  const MIN_PLAUSIBLE_CLEAR_MS = 20_000
  if (elapsedMs < MIN_PLAUSIBLE_CLEAR_MS) {
    await flagAnomaly(admin, user.id, 'implausible:raidClearTime', 3, { raidId, elapsedMs })
    return null
  }

  if (!token) {
    await flagAnomaly(admin, user.id, 'run_token:recordRaidClear_missing', 3, { raidId, elapsedMs })
    return null
  }
  // The raid must match the token's BEFORE the clear is banked, or a token
  // minted for an easy raid could spend its one clear on a hard one.
  const { data: tok } = await admin.from('run_tokens').select('meta').eq('id', token).eq('user_id', user.id).eq('kind', 'raid').maybeSingle()
  const tokenRaid = (tok?.meta as { raidId?: string } | null)?.raidId
  if (!tokenRaid || tokenRaid !== raidId) {
    await flagAnomaly(admin, user.id, 'mismatch:recordRaidClear', 3, { raidId, tokenRaid: tokenRaid ?? null })
    return null
  }
  // markRunCleared, NOT consumeRunToken: the boss-kill award fires after this
  // and needs the token still open (claim_run_token_round requires
  // consumed_at IS NULL). Consuming here would take every honest player's
  // boss XP and gold along with the replay.
  const spent = await markRunCleared(admin, user.id, 'raid', token)
  if (!spent) {
    await flagAnomaly(admin, user.id, 'replay:recordRaidClear', 3, { raidId, elapsedMs })
    return null
  }

  const ms = Math.floor(elapsedMs)

  // Who am I (username + admin flag — admins don't count toward the global record).
  const { data: me } = await admin.from('profiles').select('username, is_admin').eq('id', user.id).single()
  const myName = (me?.username as string | null) ?? ''
  const iAmAdmin = me?.is_admin === true

  // Previous bests BEFORE inserting this run.
  const { data: myRows } = await admin
    .from('raid_completions').select('elapsed_ms')
    .eq('raid_id', raidId).eq('user_id', user.id)
    .order('elapsed_ms', { ascending: true }).limit(1)
  const prevMyBest = (myRows?.[0]?.elapsed_ms as number | undefined) ?? null

  // Global previous best = fastest NON-admin clear. Small table, so pull the
  // ordered rows + resolve usernames/admin in one extra query.
  const { data: allRows } = await admin
    .from('raid_completions').select('user_id, elapsed_ms')
    .eq('raid_id', raidId).order('elapsed_ms', { ascending: true })
  const uids = Array.from(new Set((allRows ?? []).map((r: { user_id: string }) => r.user_id)))
  const { data: profs } = uids.length
    ? await admin.from('profiles').select('id, username, is_admin').in('id', uids)
    : { data: [] as { id: string; username: string | null; is_admin: boolean | null }[] }
  const pMap = new Map((profs ?? []).map((p: { id: string; username: string | null; is_admin: boolean | null }) => [p.id, p]))
  let prevGlobalBest: number | null = null
  let prevGlobalUser = ''
  for (const r of (allRows ?? []) as { user_id: string; elapsed_ms: number }[]) {
    const p = pMap.get(r.user_id)
    if (p && !p.is_admin) { prevGlobalBest = r.elapsed_ms; prevGlobalUser = p.username ?? ''; break }
  }

  // Insert this run.
  await admin.from('raid_completions').insert({ user_id: user.id, elapsed_ms: ms, raid_id: raidId })

  const yourBestMs = prevMyBest == null ? ms : Math.min(prevMyBest, ms)
  const isPersonalBest = prevMyBest == null || ms < prevMyBest

  let globalBestMs = prevGlobalBest
  let globalBestUsername = prevGlobalUser
  let isGlobalBest = false
  if (!iAmAdmin) {
    if (prevGlobalBest == null || ms < prevGlobalBest) {
      globalBestMs = ms
      globalBestUsername = myName
      isGlobalBest = true
    }
  }

  return { yourBestMs, globalBestMs, globalBestUsername, isPersonalBest, isGlobalBest }
}

/**
 * Record the Reef Skirmish clear.
 *
 * The skirmish runs on the raid screen but is not a raid (see
 * BossRaidConfig.skirmish), and its clear must not go into raid_completions:
 * that table is the raid records board, the raid bounty meters and the "clear
 * any raid in under a minute" badge, and one common Reef Raider -- repeatable,
 * over in a handful of turns -- would walk through all three. It also sits
 * under a 20-second plausibility floor that an honest skirmish can duck under.
 *
 * has_completed_practice_raid is the flag buildClearedSet has always read the
 * 'skirmish' node off, so writing it opens the next campaign node exactly the
 * way every other node opens. Idempotent, grants nothing, and the same flag the
 * old practice raid set -- anyone who cleared that keeps their node.
 */
export async function recordSkirmishClear(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_completed_practice_raid: true }).eq('id', user.id)
}

/** Record a single hit the player landed, keeping profiles.highest_raid_damage
 *  as the all-time max. Fired per new run-best from RaidGame (win OR loss), so
 *  "Biggest Hit" reflects the largest blow ever dealt, not just on clears.
 *  Atomic via the bump_raid_damage() greatest() update — safe under races. */
export async function recordRaidHit(dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  const hit = Math.floor(dmg)

  // A DAMAGE BOUNTY is a "did you do it today" question, and highest_raid_damage
  // cannot answer it: it is a high-water mark, so a captain whose record already
  // stands at 700 would never register a 300 again. It gets its own event row.
  //
  // Logged from the same clamp the record uses, so a forged number cannot buy
  // gems. Below the smallest damage bounty this costs nothing at all, which is
  // every ordinary shot in the game (the median raid best is 36).
  if (hit >= RAID_DAMAGE_MIN) {
    const s = await getRaidPlayerStats(user.id)
    const { critMax } = raidDamageProfile(s.totalPower, s.shipMinDamage, s.raidMods?.damagePct ?? 0)
    let ceil = critMax * (s.classDamageMult || 1)
    if (s.manowarAugment) ceil *= s.manowarAugment.megaMult
    void logBountyEvent(user.id, 'raid_hit', Math.min(hit, Math.max(500, Math.ceil(ceil)) * 7))
  }

  // Cheap backstop first: only a NEW personal best does any work (bump_raid_damage
  // is a greatest() no-op otherwise), so legit hits never pay for the stats read.
  const { data: prof } = await admin.from('profiles').select('highest_raid_damage').eq('id', user.id).single()
  if (hit <= Number(prof?.highest_raid_damage ?? 0)) return

  // "Biggest Hit" is client-reported (combat is client-side), so cap it to what
  // THIS player's loadout could actually crit for. Recompute the real damage
  // profile server-side and allow generous headroom for barrage sub-hits, mid-raid
  // tide/affix damage buffs, and Fallout burn — a legit spike is never shaved, but
  // a forged 300k on a build that tops out in the low thousands gets clamped. Badge
  // gates top out at 500, well under any real raider's ceiling.
  const stats = await getRaidPlayerStats(user.id)
  const { critMax } = raidDamageProfile(stats.totalPower, stats.shipMinDamage, stats.raidMods?.damagePct ?? 0)
  let ceiling = critMax * (stats.classDamageMult || 1)
  if (stats.manowarAugment) ceiling *= stats.manowarAugment.megaMult
  const base = Math.max(500, Math.ceil(ceiling))

  // FLAG and CLAMP are decoupled so a legit stacked hit is never clipped. The
  // reported hit can carry transient in-run buffs the base profile can't see —
  // damage tides (~1.16-1.25 each) stacking with a mega crit and a frozen-brittle
  // double can plausibly reach ~5x base. So:
  //  - flag at 3x   → tells us about anything suspicious (sev 2, might be a real
  //                   big stack; sev 3 once it's past the clamp = can't be real);
  //  - clamp at 7x  → safely above the max legit stack, so a genuine peak is never
  //                   cut, while an absurd forgery is still bounded.
  // "Biggest Hit" is vanity (no economy/gating; badges cap at 500), so we err hard
  // toward never clipping a real brag and rely on the flag to catch cheats.
  const flagLine     = base * 3
  const clampCeiling = base * 7
  if (hit > flagLine) {
    await flagAnomaly(admin, user.id, 'cap_trip:recordRaidHit', hit > clampCeiling ? 3 : 2,
      { hit, flagLine, clampCeiling, totalPower: stats.totalPower, hasUltimate: !!stats.manowarAugment })
  }

  await admin.rpc('bump_raid_damage', { uid: user.id, dmg: Math.min(hit, clampCeiling) })
}

/** What a crate paid, for the reveal. */
export interface RaidLootResult {
  newShipSkins: string[]; newDoubloonTotal: number; newRaidItems: string[]
  /** The currency row the SERVER drew, so the reveal can land the reel on the
   *  thing that was actually paid instead of a row the client picked alone. */
  currencyId: string | null
  gemsGranted: number
  crateDoubloons: number
  /** The unique ids the SERVER rolled into this crate. The reveal shows these,
   *  not the client's own preview roll. */
  itemIds: string[]
}

function noLoot(): RaidLootResult {
  return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [], currencyId: null, gemsGranted: 0, crateDoubloons: 0, itemIds: [] }
}

/**
 * Open the crate of a CLEARED raid run. One crate per real clear.
 *
 * ── WHAT CHANGED (2026-09-25 audit) ─────────────────────────────────────────
 * This took a raidId and a list of unique ids and paid them, as often as it
 * was called, from nothing more than a reachable map node. A forger could name
 * every unique in a raid's table and farm it without fighting.
 *
 * Now it takes the run TOKEN. The token must have been cleared by
 * recordRaidClear (the boss really died on this run, past the time floor) and
 * not yet looted; stamping looted_at is the one-shot. The raid comes off the
 * token, and the uniques are ROLLED HERE from that raid's table with the same
 * rollCrate, owned set, Fortune and Kingpin's Cut the client's preview uses, so
 * the odds are exactly the ones the combat sheet shows.
 *
 * The coin figure still arrives from the client (tides add to it mid-run where
 * the server cannot see) and is clamped to MAX_CRATE_BASE_DOUBLOONS, now once
 * per real clear rather than once per request.
 */
export async function claimRaidLoot(
  baseDoubloons: number,
  token: string | null | undefined,
): Promise<RaidLootResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return noLoot()
  const admin = createAdminClient()

  if (!token) {
    await flagAnomaly(admin, user.id, 'run_token:claimRaidLoot_missing', 3, {})
    return noLoot()
  }
  const { data: tok } = await admin.from('run_tokens').select('meta').eq('id', token).eq('user_id', user.id).eq('kind', 'raid').maybeSingle()
  const raidId = (tok?.meta as { raidId?: string } | null)?.raidId ?? ''
  const config = getRaidConfigById(raidId)
  // A skirmish has no crate (BossRaidConfig.skirmish), so it has nothing to open.
  if (!config || config.skirmish) return noLoot()

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, equipped_ship_skin, ship_classes, has_completed_practice_raid, raid_node_progress, is_admin, expedition_xp, ancient_catches, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()
  if (!profile) return noLoot()

  // REACHABLE? You may only open a crate from a raid whose map node is actually
  // open to you. This is the check that protects the Quartermaster's Ghost: his
  // six Cache items gate forge recipes. The ancients count rides along so a
  // requiresAncients node (One Last Ride) is unreachable here too.
  const cleared = await buildClearedSet(admin, user.id, profile)
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  const ancientsCaught = ((profile.ancient_catches as number[] | null) ?? []).length
  const nodeView = computeRaidMap(cleared, profile.doubloons ?? 0, navLevel, profile.is_admin === true, ancientsCaught, { captain: inCaptainsWater(profile) })
    .find(v => v.node.raidId === raidId)
  if (!nodeView || nodeView.status === 'locked') return noLoot()

  // ONE CRATE PER CLEAR. Stamped before anything is rolled or paid; a replay,
  // a concurrent twin, or a token whose boss never died gets nothing.
  if (!(await markRunLooted(admin, user.id, 'raid', token))) {
    await flagAnomaly(admin, user.id, 'replay:claimRaidLoot', 3, { raidId })
    return noLoot()
  }

  // THE UNIQUES, rolled here. Same inputs the client's preview roll uses: the
  // uniques already owned drop out, crew Fortune lifts item odds (capped 2x),
  // Kingpin's Cut lifts legendaries.
  const stats = await getRaidPlayerStats(user.id)
  const owned = new Set<string>([...stats.shipSkins, ...stats.ownedRaidItems, ...stats.ownedSpecialItems])
  const crate = rollCrate(config.loot, owned, config.uniqueShare, stats.legendaryLootMult, fortuneLootMult(stats.totalFortune), isChallengeRaid(raidId))
  const itemIds = crate.itemIdxs.map(i => config.loot[i].id)

  // WORTH THAT MUCH? The exact figure can't be recomputed (tides are rolled
  // mid-run on the client), but it can be bounded. See MAX_CRATE_BASE_DOUBLOONS.
  const claimedBase = Number.isFinite(baseDoubloons) ? Math.floor(baseDoubloons) : 0
  const safeBaseDoubloons = Math.max(0, Math.min(claimedBase, MAX_CRATE_BASE_DOUBLOONS))
  if (claimedBase > MAX_CRATE_BASE_DOUBLOONS) {
    await flagAnomaly(admin, user.id, 'cap_trip:claimRaidLoot_doubloons',
      claimedBase > MAX_CRATE_BASE_DOUBLOONS * 5 ? 3 : 2,
      { raidId, claimed: claimedBase, ceiling: MAX_CRATE_BASE_DOUBLOONS })
  }

  // Helmsman + future doubloon-mult class picks scale the crate doubloons too,
  // in addition to the per-kill gold (which scales via awardRaidKill).
  const classPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const classDoubloonMult = aggregateShipClasses(classPicks).doubloonMult
  const scaledBaseDoubloons = Math.round(safeBaseDoubloons * classDoubloonMult)

  // ── THE CURRENCY ROW, drawn HERE ───────────────────────────────────────────
  // The crate's currency half is rolled server-side and paid out as whatever it
  // lands on, which is what the reel has always claimed to be doing. A gem row
  // pays gems INSTEAD of the coin roll, not on top: the reel shows one reward
  // and one is what you get.
  const currencyId = rollRaidCurrency(raidId)
  const currencyGrant = currencyId ? ITEM_GRANTS[currencyId] : undefined
  const currencyGems = currencyGrant?.gems ?? 0
  const crateDoubloons = currencyGems > 0 ? 0 : scaledBaseDoubloons

  let doubloons = crateDoubloons
  let gems      = currencyGems
  const newShipSkins: string[] = []
  const newRaidItems: string[] = []
  let grantedSpecial: string | null = null   // a has_* column to flip, if a special item dropped
  let equippedSpecial2: string | null = null // Finn's fishing spoil seats itself on drop
  let seatJaw = false

  for (const id of itemIds) {
    const g = ITEM_GRANTS[id]
    if (!g) continue
    if (g.doubloons) doubloons += g.doubloons
    if (g.gems)      gems      += g.gems
    // Owned things are added once, in place: a concurrent forge or purchase
    // writing the same array is never overwritten by a stale copy.
    if (g.shipSkin && await arrayAdd(admin, user.id, 'ship_skins', g.shipSkin)) newShipSkins.push(g.shipSkin)
    if (g.raidItem && await arrayAdd(admin, user.id, 'raid_items', g.raidItem)) {
      newRaidItems.push(g.raidItem)
      // Finn's spoils SEAT THEMSELVES. They only charge while equipped, and
      // they fit nowhere but their own dedicated slot, so leaving one in the
      // hold does nothing for anybody. Straight onto the ship.
      if (g.raidItem === 'borrowed_jaw') seatJaw = true
    }
    // Special (fishing) items are stored one boolean column per item, the same
    // convention as has_tide_turner. Without this branch The Primeval Eye
    // would roll, be reported as looted, and grant absolutely nothing.
    if (g.specialItem === 'anglers_patience') {
      grantedSpecial = 'has_anglers_patience'
      equippedSpecial2 = 'anglers_patience'
    }
  }

  // raid_completions row is inserted by recordRaidClear() the moment the boss
  // dies (see RaidGame handleEnemyDefeated). Keeping the clear independent of
  // the loot grant means a failed loot persist doesn't strand the player on a
  // still-locked next node.
  const [newDoubloonTotal] = await Promise.all([
    grant(admin, user.id, 'doubloons', doubloons),
    gems > 0 ? grant(admin, user.id, 'gems', gems) : null,
    seatJaw ? arrayAdd(admin, user.id, 'equipped_raid_items', 'borrowed_jaw') : null,
    grantedSpecial ? admin.from('profiles').update({ [grantedSpecial]: true, ...(equippedSpecial2 ? { equipped_special_2: equippedSpecial2 } : {}) }).eq('id', user.id) : null,
    // A first skin wears itself, only if nothing is worn (conditional, so a
    // skin equipped meanwhile is never replaced).
    newShipSkins.length > 0 && !profile.equipped_ship_skin
      ? admin.from('profiles').update({ equipped_ship_skin: newShipSkins[0] }).eq('id', user.id).is('equipped_ship_skin', null)
      : null,
  ])

  return {
    newShipSkins,
    newDoubloonTotal,
    newRaidItems,
    currencyId,
    gemsGranted: currencyGems,
    crateDoubloons,
    itemIds,
  }
}
