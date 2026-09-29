// ── RAIDS, CORE (Steam prep, 2026-09-29) ──
//
// A raid run with nothing of the web in it: the run token minted at the start,
// each round's kill pay, the clear, the crate, the biggest-hit record, and the
// small raid purchases and tutorials. Each takes the store (RaidData) and the
// captain's id. On the web the server actions (raids/actions, raidXPActions,
// the tutorial actions, expeditions/repairKitActions) check the session and
// hand these the Supabase store; offline, the local save's.
//
// THE RUN TOKEN is what bounds a client-driven fight: every reward call names
// it, each round pays once, the clear banks once, the crate opens once and only
// after the clear, and all of it refuses a token past its six hours. Offline,
// with one player, it still earns its keep as the record of what a run was.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; the wallet, owned lists, anomaly flags and bounty events became store
// operations; the loadout reader and the cleared set take the store.

import { inCaptainsWater } from '@/lib/captainWater'
import { raidDamageProfile } from '@/lib/expeditions'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { computeRaidMap } from '@/lib/raidMap'
import { buildClearedSetVia } from '@/lib/raidCleared'
import { getRaidConfigById, ITEM_GRANTS, MAX_CRATE_BASE_DOUBLOONS } from '@/lib/raidRegistry'
import { RAID_DAMAGE_MIN } from '@/lib/bounties'
import { getRaidPlayerStatsVia } from '@/lib/raidLoadout'
import { rollRaidCrate, clearTimes, raidKillReward, MIN_PLAUSIBLE_CLEAR_MS } from '@/lib/raidRules'
import type { RenownAlloc } from '@/lib/renown'
import { grantXPToSeatedVia, type CrewXPGrant } from '@/lib/crewXPGrant'
import { eyeCharge } from '@/lib/finnItems'
import { nextRepairKit } from '@/lib/repairKits'
import type { RaidData } from '@/lib/data/raidData'

/** Clear-time summary returned by recordRaidClear for the victory screen. */
export interface RaidClearTimes {
  yourBestMs: number
  /** Fastest non-admin clear of this raid (null if none). */
  globalBestMs: number | null
  globalBestUsername: string
  isPersonalBest: boolean
  isGlobalBest: boolean
}

/** Mint a run token at raid START. Every reward call of the run (awardRaidKill,
 *  recordRaidClear, claimRaidLoot) REQUIRES it: kills pay once per round of the
 *  token's own raid, the clear banks once, and the crate opens once after the
 *  clear. The raidId is baked in here so nothing on the request path can swap
 *  the raid. Returns { token: null } on any problem; the client awaits this at
 *  its first reward call rather than racing it. */
export async function startRaidRun(db: RaidData, uid: string, raidId: string): Promise<{ token: string | null }> {
  const config = getRaidConfigById(raidId)
  if (!config) return { token: null }
  const maxKills = config.sequence.length * 3 + 15
  const token = await db.issueRunToken(uid, 'raid', { raidId, maxKills })
  return { token }
}

/**
 * Record a clear. TOKEN-BOUND.
 *
 * The raid_completions row is not cosmetic: it is the cleared set the raid map
 * unlocks nodes from, the meter every raid bounty counts, and the speed record.
 * Forging it meant unlocking the campaign, completing orders and taking the
 * global record without fighting anything (reported by a tester who replayed
 * exactly this endpoint).
 *
 * The token's clear is marked here, so a run yields ONE clear; a replay finds it
 * spent and is refused. The raidId is checked against the token's own meta, so a
 * token minted for an easy raid cannot bank a clear of a hard one. A call with no
 * token is refused and flagged.
 */
export async function recordRaidClear(db: RaidData, uid: string, raidId: string, elapsedMs: number, token?: string | null): Promise<RaidClearTimes | null> {
  if (!raidId || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return null

  // A clear cannot be faster than the shortest honest fight. Anything under this
  // is a forged time reaching for the global record, not a good run.
  if (elapsedMs < MIN_PLAUSIBLE_CLEAR_MS) {
    await db.flagAnomaly(uid, 'implausible:raidClearTime', 3, { raidId, elapsedMs })
    return null
  }

  if (!token) {
    await db.flagAnomaly(uid, 'run_token:recordRaidClear_missing', 3, { raidId, elapsedMs })
    return null
  }
  // The raid must match the token's BEFORE the clear is banked, or a token
  // minted for an easy raid could spend its one clear on a hard one.
  const tokenRaid = ((await db.runTokenMeta(uid, 'raid', token)) as { raidId?: string } | null)?.raidId
  if (!tokenRaid || tokenRaid !== raidId) {
    await db.flagAnomaly(uid, 'mismatch:recordRaidClear', 3, { raidId, tokenRaid: tokenRaid ?? null })
    return null
  }
  // markRunCleared, NOT consumeRunToken: the boss-kill award fires after this
  // and needs the token still open (claim_run_token_round requires
  // consumed_at IS NULL). Consuming here would take every honest player's
  // boss XP and gold along with the replay.
  const spent = await db.markRunCleared(uid, 'raid', token)
  if (!spent) {
    await db.flagAnomaly(uid, 'replay:recordRaidClear', 3, { raidId, elapsedMs })
    return null
  }

  const ms = Math.floor(elapsedMs)

  // Who am I (username + admin flag — admins don't count toward the global record).
  const me = await db.profile(uid, 'username, is_admin')
  const myName = (me?.username as string | null) ?? ''
  const iAmAdmin = me?.is_admin === true

  // Previous bests BEFORE inserting this run. The global one is the fastest
  // NON-admin clear.
  const [prevMyBest, prevGlobal] = await Promise.all([db.myBestClear(uid, raidId), db.fastestClear(raidId)])

  // Insert this run.
  await db.addClear(uid, raidId, ms)

  // The records (an admin's clear never takes the global one): lib/raidRules clearTimes.
  return clearTimes(ms, prevMyBest, prevGlobal, { username: myName, isAdmin: iAmAdmin })
}

/**
 * Record the Reef Skirmish clear.
 *
 * The skirmish runs on the raid screen but is not a raid (see
 * BossRaidConfig.skirmish), and its clear must not go into raid_completions:
 * that table is the raid records board, the raid bounty meters and the "clear
 * any raid in under a minute" badge, and one common Reef Raider would walk
 * through all three. has_completed_practice_raid is the flag buildClearedSet has
 * always read the 'skirmish' node off, so writing it opens the next campaign node
 * exactly the way every other node opens. Idempotent, grants nothing.
 */
export async function recordSkirmishClear(db: RaidData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_completed_practice_raid: true })
}

/** Record a single hit the player landed, keeping profiles.highest_raid_damage
 *  as the all-time max. Fired per new run-best from RaidGame (win OR loss), so
 *  "Biggest Hit" reflects the largest blow ever dealt, not just on clears. */
export async function recordRaidHit(db: RaidData, uid: string, dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const hit = Math.floor(dmg)

  // A DAMAGE BOUNTY is a "did you do it today" question, and highest_raid_damage
  // cannot answer it: it is a high-water mark, so a captain whose record already
  // stands at 700 would never register a 300 again. It gets its own event row,
  // logged from the same clamp the record uses, so a forged number cannot buy
  // gems. Below the smallest damage bounty this costs nothing at all.
  if (hit >= RAID_DAMAGE_MIN) {
    const s = await getRaidPlayerStatsVia(db, uid)
    const { critMax } = raidDamageProfile(s.totalPower, s.shipMinDamage, s.raidMods?.damagePct ?? 0)
    let ceil = critMax * (s.classDamageMult || 1)
    if (s.manowarAugment) ceil *= s.manowarAugment.megaMult
    void db.logBountyEvent(uid, 'raid_hit', Math.min(hit, Math.max(500, Math.ceil(ceil)) * 7))
  }

  // Cheap backstop first: only a NEW personal best does any work, so legit hits
  // never pay for the stats read.
  const prof = await db.profile(uid, 'highest_raid_damage')
  if (hit <= Number(prof?.highest_raid_damage ?? 0)) return

  // "Biggest Hit" is client-reported (combat is client-side), so cap it to what
  // THIS player's loadout could actually crit for, with generous headroom for
  // barrage sub-hits, mid-raid tide/affix damage buffs, and Fallout burn — a
  // legit spike is never shaved, but a forged 300k gets clamped.
  const stats = await getRaidPlayerStatsVia(db, uid)
  const { critMax } = raidDamageProfile(stats.totalPower, stats.shipMinDamage, stats.raidMods?.damagePct ?? 0)
  let ceiling = critMax * (stats.classDamageMult || 1)
  if (stats.manowarAugment) ceiling *= stats.manowarAugment.megaMult
  const base = Math.max(500, Math.ceil(ceiling))

  // FLAG and CLAMP are decoupled so a legit stacked hit is never clipped:
  // flag at 3x (anything suspicious), clamp at 7x (safely above the max legit
  // stack). "Biggest Hit" is vanity, so err hard toward never clipping a real
  // brag and rely on the flag to catch cheats.
  const flagLine     = base * 3
  const clampCeiling = base * 7
  if (hit > flagLine) {
    await db.flagAnomaly(uid, 'cap_trip:recordRaidHit', hit > clampCeiling ? 3 : 2,
      { hit, flagLine, clampCeiling, totalPower: stats.totalPower, hasUltimate: !!stats.manowarAugment })
  }

  await db.recordRaidHit(uid, Math.min(hit, clampCeiling))
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

export function noLoot(): RaidLootResult {
  return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [], currencyId: null, gemsGranted: 0, crateDoubloons: 0, itemIds: [] }
}

/**
 * Open the crate of a CLEARED raid run. One crate per real clear.
 *
 * It takes the run TOKEN. The token must have been cleared by recordRaidClear
 * (the boss really died on this run, past the time floor) and not yet looted;
 * stamping looted_at is the one-shot. The raid comes off the token, and the
 * uniques are ROLLED HERE from that raid's table with the same rollCrate, owned
 * set, Fortune and Kingpin's Cut the client's preview uses, so the odds are
 * exactly the ones the combat sheet shows.
 *
 * The coin figure still arrives from the client (tides add to it mid-run where
 * the server cannot see) and is clamped to MAX_CRATE_BASE_DOUBLOONS, once per
 * real clear.
 */
export async function claimRaidLoot(db: RaidData, uid: string, baseDoubloons: number, token: string | null | undefined): Promise<RaidLootResult> {
  if (!token) {
    await db.flagAnomaly(uid, 'run_token:claimRaidLoot_missing', 3, {})
    return noLoot()
  }
  const raidId = ((await db.runTokenMeta(uid, 'raid', token)) as { raidId?: string } | null)?.raidId ?? ''
  const config = getRaidConfigById(raidId)
  // A skirmish has no crate (BossRaidConfig.skirmish), so it has nothing to open.
  if (!config || config.skirmish) return noLoot()

  const profile = await db.profile(uid, 'doubloons, equipped_ship_skin, ship_classes, has_completed_practice_raid, raid_node_progress, is_admin, expedition_xp, ancient_catches, is_premium, premium_expires_at')
  if (!profile) return noLoot()

  // REACHABLE? You may only open a crate from a raid whose map node is actually
  // open to you. This is the check that protects the Quartermaster's Ghost: his
  // six Cache items gate forge recipes. The ancients count rides along so a
  // requiresAncients node (One Last Ride) is unreachable here too.
  const cleared = await buildClearedSetVia(db, uid, profile)
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  const ancientsCaught = ((profile.ancient_catches as number[] | null) ?? []).length
  const nodeView = computeRaidMap(cleared, profile.doubloons ?? 0, navLevel, profile.is_admin === true, ancientsCaught, { captain: inCaptainsWater(profile) })
    .find(v => v.node.raidId === raidId)
  if (!nodeView || nodeView.status === 'locked') return noLoot()

  // ONE CRATE PER CLEAR. Stamped before anything is rolled or paid; a replay,
  // a concurrent twin, or a token whose boss never died gets nothing.
  if (!(await db.markRunLooted(uid, 'raid', token))) {
    await db.flagAnomaly(uid, 'replay:claimRaidLoot', 3, { raidId })
    return noLoot()
  }

  // THE CRATE, rolled here with the inputs the combat sheet's preview uses
  // (owned uniques drop out, Fortune and Kingpin's Cut lift the odds), the coin
  // clamped to MAX_CRATE_BASE_DOUBLOONS and class-scaled, and the currency row
  // drawn: a gem row pays gems INSTEAD of the coin. lib/raidRules rollRaidCrate.
  const crate = rollRaidCrate({
    raidId, config, stats: await getRaidPlayerStatsVia(db, uid), baseDoubloons,
    shipClasses: (profile?.ship_classes as Record<string, string> | null) ?? {},
  })
  const { itemIds, currencyId, currencyGems, crateDoubloons } = crate
  if (crate.capTripped) {
    await db.flagAnomaly(uid, 'cap_trip:claimRaidLoot_doubloons',
      crate.claimedBase > MAX_CRATE_BASE_DOUBLOONS * 5 ? 3 : 2,
      { raidId, claimed: crate.claimedBase, ceiling: MAX_CRATE_BASE_DOUBLOONS })
  }

  const doubloons = crateDoubloons + crate.itemDoubloons
  const gems      = currencyGems + crate.itemGems
  const newShipSkins: string[] = []
  const newRaidItems: string[] = []
  let grantedSpecial: string | null = null   // a has_* column to flip, if a special item dropped
  let equippedSpecial2: string | null = null // Finn's fishing spoil seats itself on drop
  let seatJaw = false

  for (const id of itemIds) {
    const g = ITEM_GRANTS[id]
    if (!g) continue
    // Owned things are added once, in place: a concurrent forge or purchase
    // writing the same array is never overwritten by a stale copy.
    if (g.shipSkin && await db.addToList(uid, 'ship_skins', g.shipSkin)) newShipSkins.push(g.shipSkin)
    if (g.raidItem && await db.addToList(uid, 'raid_items', g.raidItem)) {
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
  // dies. Keeping the clear independent of the loot grant means a failed loot
  // persist doesn't strand the player on a still-locked next node.
  const [newDoubloonTotal] = await Promise.all([
    db.grant(uid, 'doubloons', doubloons),
    gems > 0 ? db.grant(uid, 'gems', gems) : null,
    seatJaw ? db.addToList(uid, 'equipped_raid_items', 'borrowed_jaw') : null,
    grantedSpecial ? db.updateProfile(uid, { [grantedSpecial]: true, ...(equippedSpecial2 ? { equipped_special_2: equippedSpecial2 } : {}) }) : null,
    // A first skin wears itself, only if nothing is worn (conditional, so a
    // skin equipped meanwhile is never replaced).
    newShipSkins.length > 0 && !profile.equipped_ship_skin ? db.wearFirstSkin(uid, newShipSkins[0]) : null,
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

export type RaidKillPay = { newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }
export const NO_KILL_PAY: RaidKillPay = { newExpeditionXP: 0, newDoubloonTotal: 0, crewXP: [] }

/**
 * Pay one raid kill. THE SERVER NAMES THE PRICE.
 *
 * The client says only WHICH round fell (0-based; the round equal to the
 * sequence length is the boss). The reward is read from the token's own raid
 * config, the same killRewards line the client shows, and the boss round adds
 * the full-clear bonus exactly as the client did. Each round of a run pays
 * once, so a run pays what its mobs are worth and not a coin more. No token, no
 * pay.
 */
export async function awardRaidKill(db: RaidData, uid: string, round: number, token?: string | null): Promise<RaidKillPay> {
  const r = Number(round)
  if (!token || !Number.isInteger(r) || r < 0) {
    await db.flagAnomaly(uid, 'run_token:awardRaidKill_missing', 2, { round, hasToken: !!token })
    return NO_KILL_PAY
  }

  // Resolve the round against the token's raid BEFORE marking it paid, so a
  // round past the end of the raid is refused without burning anything.
  const raidId = ((await db.runTokenMeta(uid, 'raid', token)) as { raidId?: string } | null)?.raidId
  const config = raidId ? getRaidConfigById(raidId) : undefined
  if (!config || r > config.sequence.length) {
    await db.flagAnomaly(uid, 'run_token:awardRaidKill_badRound', 3, { round: r, raidId: raidId ?? null })
    return NO_KILL_PAY
  }

  // One pay per round per run. A replay, a concurrent twin or a spent token
  // gets nothing.
  if (!(await db.claimRaidRound(uid, token, r))) {
    await db.flagAnomaly(uid, 'run_token:awardRaidKill_reject', 2, { token, round: r })
    return NO_KILL_PAY
  }

  const profile = await db.profile(uid, 'expedition_xp, ship_classes, nav_renown_alloc, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')

  // What the round pays is lib/raidRules raidKillReward: the config's own
  // killRewards line (plus the full-clear bonus on the boss), gold scaled by
  // ship classes and Nav Renown (Plunder), crew XP by Renown (Command).
  const pay = raidKillReward(config, r, profile?.ship_classes as Record<string, string> | null, profile?.nav_renown_alloc as RenownAlloc | null)!
  const xp = pay.xp

  const newExpeditionXP  = (profile?.expedition_xp ?? 0) + xp
  // Raid kills are Navigation XP, so they charge The Primeval Eye.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], xp)

  // Gold and Nav XP move in place; every alive, assigned crew gets the kill's
  // crew XP and their level-up deltas come back for the overlay.
  const [newDoubloonTotal, , crewXP] = await Promise.all([
    db.grant(uid, 'doubloons', pay.doubloons),
    Promise.all([
      xp > 0 ? db.bumpStat(uid, 'expedition_xp', xp) : null,
      reelCharge !== null ? db.updateProfile(uid, { anglers_patience_xp: reelCharge }) : null,
    ]),
    grantXPToSeatedVia(db, uid, pay.crewXp),
  ])

  return { newExpeditionXP, newDoubloonTotal, crewXP }
}

// ── Repair kits: doubloon-bought, Nav-gated, bought in tier order ─────────────

export interface KitResult {
  ok: true
  equippedRepairKit: string
  ownedRepairKits: string[]
  doubloons: number
}

export async function buyRepairKit(db: RaidData, uid: string): Promise<KitResult | { error: string }> {
  const profile = await db.profile(uid, 'doubloons, owned_repair_kits, expedition_xp')
  if (!profile) return { error: 'Profile not found' }

  const owned = (profile.owned_repair_kits as string[] | null) ?? ['basic_repair_kit']
  const next = nextRepairKit(owned)
  if (!next) return { error: 'Every repair kit is already yours.' }

  const navLevel = getLevelFromXP(profile.expedition_xp ?? 0)
  if (navLevel < next.navLevelReq) return { error: `Reach Nav Lv ${next.navLevelReq} to buy the ${next.name}.` }

  // The spend is the guard: taken in place, before the kit is handed over.
  const newDoubloons = await db.spend(uid, 'doubloons', next.cost)
  if (newDoubloons == null) return { error: 'Not enough doubloons.' }
  const newOwned = [...owned, next.id]

  // Added once. A twin that bought the same rung first gets its coin back.
  let added = false
  try {
    added = await db.addToList(uid, 'owned_repair_kits', next.id)
  } catch { /* treated as not added: refunded below */ }
  if (!added) {
    await db.grant(uid, 'doubloons', next.cost)
    return { error: 'Could not complete the purchase.' }
  }
  await Promise.all([
    db.updateProfile(uid, { equipped_repair_kit: next.id }),
    db.ledger(uid, -next.cost, `Bought ${next.name}`),
  ])

  return { ok: true, equippedRepairKit: next.id, ownedRepairKits: newOwned, doubloons: newDoubloons }
}

// ── One-shot tutorials (tour convention: a has_seen_* profile column) ─────────
// A failed read (or no row) says "seen", so a tour never traps anyone.

/** Has the player already seen the mechanic-check tutorial? */
export async function getCheckTutorialSeen(db: RaidData, uid: string): Promise<boolean> {
  const data = await db.profile(uid, 'has_seen_check_tutorial')
  if (!data) return true
  return data?.has_seen_check_tutorial === true
}

export async function markCheckTutorialSeen(db: RaidData, uid: string): Promise<{ ok: boolean }> {
  await db.updateProfile(uid, { has_seen_check_tutorial: true })
  return { ok: true }
}

/** Has the player already seen the Reef Skirmish's guided intro? */
export async function getSkirmishTourSeen(db: RaidData, uid: string): Promise<boolean> {
  const data = await db.profile(uid, 'has_seen_skirmish_tour')
  if (!data) return true
  return data?.has_seen_skirmish_tour === true
}

export async function markSkirmishTourSeen(db: RaidData, uid: string): Promise<{ ok: boolean }> {
  await db.updateProfile(uid, { has_seen_skirmish_tour: true })
  return { ok: true }
}

export async function markRaidTutorialSeen(db: RaidData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_raid_tutorial: true })
}
