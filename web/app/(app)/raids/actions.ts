'use server'

import { createClient } from '@/lib/supabase/server'
import { dialAimBonus, type DialAimBonus } from '@/lib/dialAim'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownedSpecialIds } from '@/lib/specialItems'
import { EXPEDITION_SHIP_STATS, raidRepairCost, raidItemSlotsForTier, raidDamageProfile, type RaidMods } from '@/lib/expeditions'
import { getLevelFromXP, navLevelBonuses } from '@/lib/expeditionLevel'
import { loadDeployedParty } from '@/lib/crewData'
import { resolveDeployedCrew } from '@/lib/crewResolve'
import { getActiveEffects, dedupeRaidItems, RAID_ITEMS } from '@/lib/raidItems'
import { finnItemLevel } from '@/lib/finnItems'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { getShipSkin } from '@/lib/shipSkins'
import { computeRaidMap } from '@/lib/raidMap'
import { buildClearedSet } from '@/lib/raidProgress'
import { getRaidConfigById, raidUniqueLootIds, rollRaidCurrency, ITEM_GRANTS, MAX_CRATE_BASE_DOUBLOONS } from '@/lib/raidRegistry'
import { bonusChargeSlots, gauntletRepairHealMult, donsRaidHpMult, donsLegendaryLootMult } from '@/lib/gauntletUpgrades'
import { getShipAugment, MANOWAR_TIER, type ShipAugment } from '@/lib/shipAugments'
import { settleUltimateBuild } from '@/lib/ultimateBuild'
import { flagAnomaly } from '@/lib/anomaly'
import { issueRunToken, markRunCleared } from '@/lib/runToken'
import { logBountyEvent } from '@/app/(app)/expeditions/bountyActions'
import { RAID_DAMAGE_MIN } from '@/lib/bounties'

const CARD_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/card-arts/'


export interface RaidCrewMember {
  /** user_crew row id. Drives the per-crew once-per-raid ability cooldown
   *  state in RaidGame and lets the Special chooser key its cards. */
  id: number
  /** Lower-cased species slug. RaidGame derives the crew's class via
   *  classForSlug(slug); null/empty = no class wired (older species not yet
   *  in the class map). */
  slug: string
  name: string
  imageUrl: string
  /** Cumulative XP — drives the crew's current class-ability tier via
   *  crewLevelFromXP() + currentMilestone(). */
  xp: number
  power: number
  dodge: number
  fortune: number
}

export interface RaidPlayerStats {
  playerHPMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  shipImageUrl: string
  shipName: string
  username: string | null
  characterColor: string | null
  equippedHat: string | null
  avatarBgColor: string | null
  avatarBorderColor: string | null
  crewCount: number
  crewMembers: RaidCrewMember[]
  equippedShipSkin: string | null
  shipSkins: string[]
  equippedRaidItems: string[]
  /** All raid items the player owns (equipped or not). Used to exclude
   *  already-owned items from the boss loot roll so duplicates re-roll
   *  into something new. */
  ownedRaidItems: string[]
  /** Fishing SPECIALS the player owns, which live one boolean column each
   *  rather than in raid_items. Finn's table drops one (The Primeval Eye), so
   *  without this the exclusion above cannot see it and he can hand out a
   *  second copy -- burning a 2.5% ancient roll on something that grants
   *  nothing. Same blind spot the grant path already had to be taught about. */
  ownedSpecialItems: string[]
  /** Aggregated ship-class effects from every chapter the player has
   *  picked one for. damageMult and doubloonMult are passed through to
   *  RaidGame to apply at hit time; hpMult + speedFlat are already
   *  baked into playerHPMax + shipSpeed below. */
  classDamageMult: number
  classDoubloonMult: number
  /** Kingpin's Cut (Don's Locker perk): legendary boss-drop weight multiplier
   *  for the raid loot roll (1 = none, 2 = 2x). */
  legendaryLootMult: number
  /** Raw chapter -> classId picks. Threaded to the in-fight stats popup
   *  so the player can see WHICH classes are modifying their ship,
   *  not just the aggregated multiplier. */
  shipClasses: Record<string, string>
  equippedRepairKit: string
  hasSeenRaidTutorial: boolean
  raidMods: RaidMods
  /** Extra player cannonball slots from claimed Locker Upgrades (Gauntlet). */
  bonusChargeSlots: number
  /** The Man-o-War volley augment, resolved + gated on actually being on the
   *  Man-o-War (tier 6). Null otherwise — the Mega only exists on that hull. */
  manowarAugment: ShipAugment | null
  /** Fishing gear widening the Finn dial's bands. Only the dial fight reads
   *  this; every bar fight ignores it, so no existing raid changes. */
  dialAim: DialAimBonus
}

export async function getRaidPlayerStats(userId: string): Promise<RaidPlayerStats> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, saved_crew, ship_name, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, equipped_ship_skin, ship_skins, raid_items, equipped_raid_items, equipped_repair_kit, has_seen_raid_tutorial, expedition_xp, nav_renown_alloc, ship_classes, gauntlet_upgrades, dons_gauntlet_upgrades, manowar_augment, manowar_augment_build, has_sixth_berth, has_armory_expansion, finn_spoil_free, finn_spoil_paid, borrowed_jaw_xp, has_tide_turner, has_phantom_hook, has_auto_caster, has_auto_catcher, has_perfected_sigil, has_anglers_patience, rod_tier, hook_tier, reel_tier, completionist_effects')
    .eq('id', userId)
    .single()

  // Promote a finished ultimate build into the active slot before combat reads
  // it, so a weapon that completed while the player was away fires this raid.
  const { active: activeAugmentId } = await settleUltimateBuild(
    admin, userId, (profile?.manowar_augment as string | null) ?? null, profile?.manowar_augment_build ?? null)

  const shipTier = profile?.ship_tier ?? 0
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

  // Ship classes: chapter-end identity picks (Master Gunner, Ironside,
  // Helmsman, Buccaneer) + the Ch4 augments. Parsed EARLY because the
  // Expanded Quarters augment widens the crew party and Expanded Armory
  // widens the item cap, both read below.
  const shipClassPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const classEffects = aggregateShipClasses(shipClassPicks)

  // New crew system: deployed party from user_crew (raid track), resolved
  // with effects. Voyage and raid each have an independent assignment slot
  // now — see migrate_split_crew_assignment.
  // The Sixth Berth (bought after Raid 7) widens the raid party to six.
  const berthSlots = (profile as { has_sixth_berth?: boolean } | null)?.has_sixth_berth === true ? 1 : 0
  const party = await loadDeployedParty(admin, userId, ship.crewSlots + classEffects.crewSlots + berthSlots, 'raid')
  const resolved = resolveDeployedCrew(party)
  const totalPower = resolved.totals.power
  const totalDodge = resolved.totals.dodge
  const totalFortune = resolved.totals.fortune
  const crewMembers: RaidCrewMember[] = resolved.perCrew.map(pc => {
    const row = party.find(p => p.id === pc.id)
    const mult = pc.slot === 0 ? 1 : 0.8
    return {
      id:       pc.id,
      slug:     row?.slug ?? '',
      name:     row?.name ?? 'Crew',
      imageUrl: CARD_IMG_BASE + (row?.filename ?? ''),
      xp:       (row?.xp as number | undefined) ?? 0,
      power:    Math.floor(pc.power   * mult),
      dodge:    Math.floor(pc.dodge   * mult),
      fortune:  Math.floor(pc.fortune * mult),
    }
  })

  // Apply Nav-level captain bonuses on top of crew + ship totals.
  const navLevel = getLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  const navBonus = navLevelBonuses(navLevel)

  // Navigation Renown (post-100): tiny captain boosts. Hull adds flat HP into
  // the pool below (before item/class mults); damage folds into the mult sent
  // to the client. Identity (1× / +0) when unallocated.
  const navRenown = navRenownEffects(profile?.nav_renown_alloc as RenownAlloc | null)

  // Reinforced Hull etc. — raid items can scale max HP at raid start.
  // Multiplies after the ship + nav HP are summed so it applies to the
  // full pool. Multiple max_hp_mult items stack multiplicatively.
  //
  // Truncate equipped_raid_items to the ship-tier slot cap before reading
  // effects — a player who downgrades ships (or had stale rows from when
  // the cap was a flat 3) shouldn't get free effects past their hull's
  // capacity. The UI also caps at the same number when the loadout
  // drawer opens, so the next save will write the truncated list back.
  const rawEquipped = (profile?.equipped_raid_items as string[] | null) ?? []
  // Hull cap + the Ch4 Expanded Armory refit's extra mount (purchased flag),
  // plus any legacy class-pick itemSlots (none in production).
  const armorySlot  = (profile as { has_armory_expansion?: boolean } | null)?.has_armory_expansion === true ? 1 : 0
  const slotCap     = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0) + classEffects.itemSlots + armorySlot
  // Drop items that can't coexist (tier-family grades + a fusion beside its own
  // forge ingredients) so a legacy/stale loadout can't double-apply a stat that
  // was never meant to stack, then cap to the hull's slots.
  // THE SUNKEN HAND MOUNT. Not a general slot: it exists only while you hold
  // the nav spoil, and it accepts only the item that spoil is for. So rather
  // than widening slotCap for everyone, his item is pulled OUT of the normal
  // loadout, checked against the unlock, and re-attached beside it. That way
  // it never competes for a hull slot and it can never be worn without the
  // unlock, however the array got saved.
  const spoilFree = (profile as { finn_spoil_free?: string | null } | null)?.finn_spoil_free ?? null
  const spoilPaid = (profile as { finn_spoil_paid?: string | null } | null)?.finn_spoil_paid ?? null
  const hasMount  = spoilFree === 'nav' || spoilPaid === 'nav'
  const finaleIds = new Set(RAID_ITEMS.filter(i => i.finaleSlotOnly).map(i => i.id))
  const mounted   = hasMount ? rawEquipped.filter(id => finaleIds.has(id)).slice(0, 1) : []
  const normal    = rawEquipped.filter(id => !finaleIds.has(id))
  const equippedItems = [...dedupeRaidItems(normal).slice(0, slotCap), ...mounted]
  // THE BORROWED JAW pays out by CHARGE. Tag its id with the level it has
  // reached so combat resolves the right milestone (see baseItemId). Only the
  // copy handed to the client is tagged; the database keeps the plain id.
  const jawLevel = finnItemLevel(Number((profile as { borrowed_jaw_xp?: number } | null)?.borrowed_jaw_xp ?? 0))
  const chargedItems = equippedItems.map(id => (id === 'borrowed_jaw' ? `borrowed_jaw#${jawLevel}` : id))
  const hpMaxMult = getActiveEffects(equippedItems)
    .filter(e => e.type === 'max_hp_mult')
    .reduce((a, e) => a * e.value, 1)

  const gauntletUpgrades = (profile?.gauntlet_upgrades as string[] | null) ?? []
  // Account-scope Locker perks apply from EITHER gauntlet, so the Don's Ship &
  // Shore perks (Deep-Sea Plating / Ghost Ordnance) read the union of both.
  const accountUpgrades = [...gauntletUpgrades, ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? [])]

  // The convergence: the finale is aimed on a dial, and the player's ROD and
  // HOOK widen its bands by the same degrees they widen the fishing dial.
  const dialAim = dialAimBonus(
    (profile as { rod_tier?: number } | null)?.rod_tier ?? 0,
    (profile as { hook_tier?: number } | null)?.hook_tier ?? 0,
    (profile as { completionist_effects?: number[] } | null)?.completionist_effects ?? null,
    (profile as { reel_tier?: number } | null)?.reel_tier ?? 0,
  )

  return {
    playerHPMax:      Math.round((ship.durability + navBonus.hp + navRenown.hullFlat) * hpMaxMult * classEffects.hpMult * donsRaidHpMult(accountUpgrades)),
    shipMinDamage:    ship.minDamage,
    shipSpeed:        Math.max(0, ship.speed + classEffects.speedFlat),
    totalPower:       totalPower   + navBonus.power,
    totalDodge:       totalDodge   + navBonus.navigation,
    totalFortune:     totalFortune + navBonus.fortune,
    // Skin can swap the ship sprite outright via imageByTier (Finndicate
    // Hull → enemychapter1[tier]); falls back to the default ship art.
    // Any skin's CSS filter is resolved client-side on the rendered <img>.
    shipImageUrl:     getShipSkin((profile?.equipped_ship_skin as string | null) ?? '')?.imageByTier?.[shipTier] ?? ship.image,
    shipName:         (profile?.ship_name as string | null) ?? ship.name,
    username:         (profile?.username as string | null) ?? null,
    characterColor:   (profile?.character_color as string | null) ?? null,
    equippedHat:      (profile?.equipped_hat as string | null) ?? null,
    avatarBgColor:    (profile?.avatar_bg_color as string | null) ?? null,
    avatarBorderColor:(profile?.avatar_border_color as string | null) ?? null,
    crewCount:        party.length,
    crewMembers,
    equippedShipSkin:     (profile?.equipped_ship_skin as string | null) ?? null,
    shipSkins:            (profile?.ship_skins as string[] | null) ?? [],
    equippedRaidItems:    chargedItems,
    ownedRaidItems:       (profile?.raid_items as string[] | null) ?? [],
    ownedSpecialItems:    ownedSpecialIds(profile as unknown as Record<string, unknown>),
    classDamageMult:      classEffects.damageMult * navRenown.damageMult,
    legendaryLootMult:    donsLegendaryLootMult(accountUpgrades),
    classDoubloonMult:    classEffects.doubloonMult,
    shipClasses:          shipClassPicks,
    equippedRepairKit:    (profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit',
    hasSeenRaidTutorial:  (profile?.has_seen_raid_tutorial as boolean | null) ?? false,
    raidMods:             { ...resolved.raid, repairHealMult: gauntletRepairHealMult(gauntletUpgrades) },
    bonusChargeSlots:     bonusChargeSlots((profile?.gauntlet_upgrades as string[] | null) ?? []),
    manowarAugment:       shipTier === MANOWAR_TIER ? getShipAugment(activeAugmentId) : null,
    dialAim,
  }
}

// ── Raid sink penalty ─────────────────────────────────────────────────────────

// Called when the player's ship sinks in a real raid (NOT the practice
// skirmish). Snapshots the tier-scaled repair fee onto the profile. Only
// sets it if nothing is owed yet, so dying again before repairing can't
// stack (you can't raid while owing anyway).
export async function reportRaidSink(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, raid_repair_owed')
    .eq('id', user.id)
    .single()
  if (!profile) return
  if ((profile.raid_repair_owed ?? 0) > 0) return

  const fee = raidRepairCost(profile.ship_tier ?? 0)
  await admin.from('profiles').update({ raid_repair_owed: fee }).eq('id', user.id)
}

// Pay the outstanding repair fee. Returns the new doubloon total, or an
// error if the player can't cover it.
export async function repairShip(): Promise<
  { newDoubloonTotal: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, raid_repair_owed')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const owed = profile.raid_repair_owed ?? 0
  if (owed <= 0) return { newDoubloonTotal: profile.doubloons ?? 0 }

  const doubloons = profile.doubloons ?? 0
  if (doubloons < owed) return { error: 'Not enough doubloons' }

  const newTotal = doubloons - owed
  await admin
    .from('profiles')
    .update({ doubloons: newTotal, raid_repair_owed: 0 })
    .eq('id', user.id)

  return { newDoubloonTotal: newTotal }
}


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
/** Mint a run token at raid START. The reward calls (awardRaidKill / recordRaidClear)
 *  reference it so a run's rewards are bounded to its real mob count and its clear
 *  can't be replayed. maxKills is baked in server-side from the raid's own sequence
 *  (generous headroom for boss phases + tide-spawned enemies) so nothing on the
 *  request path can inflate it. Returns { token: null } on any problem — the reward
 *  calls then fall back to their capped path, so a token hiccup never blocks play. */
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
 * Tolerant when no token is supplied: a run started before this shipped, or a
 * client not yet updated, still records. That gap is watched rather than closed
 * -- the flag below is where adoption gets checked before it is made mandatory.
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

  if (token) {
    // markRunCleared, NOT consumeRunToken: the boss-kill award fires after this
    // and needs the token still open (bump_run_token_kill requires
    // consumed_at IS NULL). Consuming here would take every honest player's
    // boss XP and gold along with the replay.
    const spent = await markRunCleared(admin, user.id, 'raid', token)
    if (!spent) {
      await flagAnomaly(admin, user.id, 'replay:recordRaidClear', 3, { raidId, elapsedMs })
      return null
    }
    const tokenRaid = (spent.meta as { raidId?: string } | null)?.raidId
    if (tokenRaid && tokenRaid !== raidId) {
      await flagAnomaly(admin, user.id, 'mismatch:recordRaidClear', 3, { raidId, tokenRaid })
      return null
    }
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

export async function claimRaidLoot(
  baseDoubloons: number,
  rolledItemIds: string[],
  elapsedMs: number,
  damageTaken: number,
  raidId: string = 'corsairs_reckoning',
): Promise<{
  newShipSkins: string[]; newDoubloonTotal: number; newRaidItems: string[]
  /** The currency row the SERVER drew, so the reveal can land the reel on the
   *  thing that was actually paid instead of a row the client picked alone. */
  currencyId: string | null
  gemsGranted: number
  crateDoubloons: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [], currencyId: null, gemsGranted: 0, crateDoubloons: 0 }

  // ── WHAT THIS FUNCTION CAN AND CANNOT DO ───────────────────────────────────
  // Raid combat runs entirely on the client, so the server can never PROVE a win
  // happened. What it can do is make a forged claim worth no more than a real one.
  // This is a server action, i.e. an HTTP endpoint any logged-in user can POST to,
  // so every argument below is hostile input until checked.
  //
  // The three things it now refuses to take on faith:
  //   1. the raid itself  — must be a real config, and one this player can REACH
  //   2. the item rolled  — must be in THAT raid's own loot table, and only one
  //   3. the doubloons    — clamped to what a crate can honestly be worth
  //
  // Net effect: the worst a crafted request can do is hand you a drop from a raid
  // you were already allowed to farm. That is a shortcut past a fight, not a way to
  // mint currency or pull items out of raids you have never even unlocked.
  const config = getRaidConfigById(raidId)
  if (!config) return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [], currencyId: null, gemsGranted: 0, crateDoubloons: 0 }
  // Challenge-mode boss-clear badge unlocks live in RaidGame's
  // handleEnemyDefeated (the moment the boss sinks) so the celebration
  // pops as part of the kill beat, not after the loot crate is claimed.
  // elapsedMs + damageTaken are still passed through for cumulative
  // stats tracking elsewhere.

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, ship_skins, equipped_ship_skin, raid_items, equipped_raid_items, ship_classes, has_completed_practice_raid, raid_node_progress, is_admin, expedition_xp, ancient_catches')
    .eq('id', user.id)
    .single()
  if (!profile) return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [], currencyId: null, gemsGranted: 0, crateDoubloons: 0 }

  // 1. REACHABLE? You may only claim a crate from a raid whose map node is actually
  //    open to you. This is the check that protects the Quartermaster's Ghost: his
  //    six Cache items gate forge recipes, and without this anyone could POST for
  //    them without ever beating the Quartermaster, or the game.
  const cleared = await buildClearedSet(admin, user.id, profile)
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  // The ancients count rides along so a requiresAncients node (One Last Ride)
  // is unreachable here too — otherwise the finale's crate could be claimed by
  // a captain who never went down for the giants.
  const ancientsCaught = ((profile.ancient_catches as number[] | null) ?? []).length
  const nodeView = computeRaidMap(cleared, profile.doubloons ?? 0, navLevel, profile.is_admin === true, ancientsCaught)
    .find(v => v.node.raidId === raidId)
  if (!nodeView || nodeView.status === 'locked') {
    return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [], currencyId: null, gemsGranted: 0, crateDoubloons: 0 }
  }

  // 2. FROM THIS RAID? The ids used to be looked up in the global ITEM_GRANTS map,
  //    so any raid could claim any item in the game. A crate can only contain what
  //    that raid's own table lists.
  //
  //    The cap used to be ONE, because the client rolled a single index. Uniques
  //    roll independently now (lib/raidLoot), so two landing in one crate is a
  //    real outcome and slicing to one would silently eat the second. The bound
  //    is instead the number of DISTINCT ids that raid could ever drop, which is
  //    the true maximum an honest roll can produce. Deduped, because the same id
  //    repeated is the one shape a real roll cannot make.
  //    Validated against the raid's UNIQUE ids, never the full table: crate
  //    currency arrives as a clamped doubloon amount, so an id naming a coin or
  //    gem row is a forgery attempt, and bounding by the full table size would
  //    have let one request claim every currency row at once.
  const table = raidUniqueLootIds(raidId)
  const safeItemIds = [...new Set(rolledItemIds.filter(id => table.has(id)))].slice(0, table.size)

  // BOTH CLAMPS BELOW USED TO TRIP SILENTLY, on the largest reward path in the
  // game. A legit client can only roll ids from its own raid's table and can
  // only earn a crate inside the bound, so either trip is a near-certain forged
  // call -- exactly the signal lib/anomaly exists to record. Dropping them
  // quietly meant the request was refused and then forgotten, which protects
  // the economy but tells you nothing about who is probing it.
  const foreignIds = rolledItemIds.filter(id => !table.has(id))
  if (foreignIds.length > 0) {
    await flagAnomaly(admin, user.id, 'cap_trip:claimRaidLoot_foreignItem', 3,
      { raidId, claimed: foreignIds.slice(0, 8), tableSize: table.size })
  }

  // 3. WORTH THAT MUCH? The exact figure can't be recomputed (tides are rolled
  //    mid-run on the client), but it can be bounded. See MAX_CRATE_BASE_DOUBLOONS.
  const claimedBase = Number.isFinite(baseDoubloons) ? Math.floor(baseDoubloons) : 0
  const safeBaseDoubloons = Math.max(0, Math.min(claimedBase, MAX_CRATE_BASE_DOUBLOONS))
  if (claimedBase > MAX_CRATE_BASE_DOUBLOONS) {
    await flagAnomaly(admin, user.id, 'cap_trip:claimRaidLoot_doubloons',
      claimedBase > MAX_CRATE_BASE_DOUBLOONS * 5 ? 3 : 2,
      { raidId, claimed: claimedBase, ceiling: MAX_CRATE_BASE_DOUBLOONS })
  }

  // Helmsman + future doubloon-mult class picks scale the crate
  // doubloons too, in addition to the per-kill gold (which scales via
  // awardRaidKill). Same multiplier read from the same place.
  const classPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const classDoubloonMult = aggregateShipClasses(classPicks).doubloonMult
  const scaledBaseDoubloons = Math.round(safeBaseDoubloons * classDoubloonMult)

  // ── THE CURRENCY ROW, drawn HERE ───────────────────────────────────────────
  // The crate's currency half is rolled server-side and paid out as whatever it
  // lands on, which is what the reel has always claimed to be doing.
  //
  // It used to work that way: before the drop-table rework the client sent the
  // one row it drew and the server honoured it, gems included. The rework split
  // the crate into currency plus independent uniques, the client started sending
  // only the uniques, and the currency row stopped being claimed by anybody
  // while the reveal went on printing its label. "50 Gems" paid coins for eleven
  // days and nothing failed loudly, because a label and a grant with no wire
  // between them cannot disagree in a way anything can detect.
  //
  // Drawing it here rather than accepting an id is also strictly safer than the
  // old shape: a forged claim cannot name a currency row at all.
  const currencyId = rollRaidCurrency(raidId)
  const currencyGrant = currencyId ? ITEM_GRANTS[currencyId] : undefined
  // A gem row pays gems INSTEAD of the coin roll, not on top. The reel shows one
  // reward and one is what you get; paying both would make every gem row a
  // strictly better doubloon row.
  const currencyGems = currencyGrant?.gems ?? 0
  const crateDoubloons = currencyGems > 0 ? 0 : scaledBaseDoubloons

  let doubloons       = (profile?.doubloons ?? 0) + crateDoubloons
  let gems            = (profile?.gems ?? 0) + currencyGems
  const ownedSkins    = (profile?.ship_skins as string[] | null) ?? []
  let equippedSkin    = (profile?.equipped_ship_skin as string | null) ?? null
  let grantedSpecial: string | null = null   // a has_* column to flip, if a special item dropped
  let equippedSpecial2: string | null = null // Finn's fishing spoil seats itself on drop
  const newEquippedItems = [...((profile?.equipped_raid_items as string[] | null) ?? [])]
  const newSkins      = [...ownedSkins]
  const ownedRaidItems = (profile?.raid_items as string[] | null) ?? []
  const newRaidItems   = [...ownedRaidItems]

  for (const id of safeItemIds) {
    const grant = ITEM_GRANTS[id]
    if (!grant) continue
    if (grant.doubloons) doubloons += grant.doubloons
    if (grant.gems)      gems      += grant.gems
    if (grant.shipSkin && !newSkins.includes(grant.shipSkin)) {
      newSkins.push(grant.shipSkin)
      if (!equippedSkin) equippedSkin = grant.shipSkin
    }
    if (grant.raidItem && !newRaidItems.includes(grant.raidItem)) {
      newRaidItems.push(grant.raidItem)
      // Finn's spoils SEAT THEMSELVES. They only charge while equipped, and
      // they fit nowhere but their own dedicated slot, so leaving one in the
      // hold does nothing for anybody. Straight onto the ship.
      if (grant.raidItem === 'borrowed_jaw' && !newEquippedItems.includes('borrowed_jaw')) {
        newEquippedItems.push('borrowed_jaw')
      }
    }
    // Special (fishing) items are stored one boolean column per item, the same
    // convention as has_tide_turner. Without this branch The Primeval Eye
    // would roll, be reported as looted, and grant absolutely nothing.
    if (grant.specialItem === 'anglers_patience') {
      grantedSpecial = 'has_anglers_patience'
      equippedSpecial2 = 'anglers_patience'
    }
  }

  // raid_completions row is inserted by recordRaidClear() the moment
  // the boss dies (see RaidGame handleEnemyDefeated). Keeping the
  // clear independent of the loot grant means a failed loot persist
  // doesn't strand the player on a still-locked next node.
  await admin
    .from('profiles')
    .update({ doubloons, gems, ship_skins: newSkins, equipped_ship_skin: equippedSkin, raid_items: newRaidItems, ...(grantedSpecial ? { [grantedSpecial]: true } : {}), ...(equippedSpecial2 ? { equipped_special_2: equippedSpecial2 } : {}), ...(newEquippedItems.includes('borrowed_jaw') ? { equipped_raid_items: newEquippedItems } : {}) })
    .eq('id', user.id)

  return {
    newShipSkins: newSkins.filter(s => !ownedSkins.includes(s)),
    newDoubloonTotal: doubloons,
    newRaidItems: newRaidItems.filter(i => !ownedRaidItems.includes(i)),
    currencyId,
    gemsGranted: currencyGems,
    crateDoubloons,
  }
}
