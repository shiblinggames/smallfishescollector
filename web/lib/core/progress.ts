// ── PROGRESSION, CORE (Steam prep, 2026-09-29) ──
//
// Renown (the post-100 boards: spend, commit, respec, buy a token), badges
// (derived from what the game already records, claimed, worn, and the few the
// client may unlock mid-fight), the cosmetic unlock banner, and the first-run
// welcome and member's daily pack, with nothing of the web in them. Each takes
// the store (ProgressData) and the captain's id. On the web the server actions
// check the session and hand these the Supabase store; offline, the local
// save's.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; table reads and guarded writes became store operations; and three
// balance writes that were computed from a stale read now move in place and
// are guarded (the welcome gems, the daily pack, a bought respec token), the
// house rule everywhere else in the game.

import { clockNow } from '@/lib/clock'
import { captainsWaterOpen, CAPTAIN_WATER_SAYS, type CaptainWaterRow } from '@/lib/captainWater'
import {
  type RenownSkill, type RenownAlloc,
  renownLevel, spentPoints, availablePoints, isRenownStat, RENOWN_RESPEC_GEM_COST,
} from '@/lib/renown'
import { stampBadges } from '@/lib/badgeStamps'
import { BADGES, BADGE_MAP, BADGE_REWARD, BADGE_GEM_REWARD, badgeReward, badgeGemReward, MAX_EQUIPPED_BADGES } from '@/lib/badges'
import { earnedBadgeIds, exchangeStatsFrom, seaStatsFrom, type BadgeProfileFields } from '@/lib/badgeConditions'
import { CHARACTER_COLORS } from '@/lib/characters'
import { BOATS } from '@/lib/boats'
import { AVATAR_SPECIALS } from '@/lib/avatarColors'
import { gateMet, gateReason, type CosmeticGate } from '@/lib/cosmeticGates'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { isPremiumActive } from '@/lib/premium'
import type { ProgressData } from '@/lib/data/progressData'

// ══ RENOWN ════════════════════════════════════════════════════════════════════
//
// The derived level (from XP) and the persisted allocations: spend a banked
// point, commit a draft, spend a respec token to clear one board, or buy one.
// The effects themselves apply at the reward paths.

export interface RenownState {
  skill: RenownSkill
  level: number
  spent: number
  available: number
  alloc: RenownAlloc
  /** Respec tokens in hand, shared across both boards. */
  respecs: number
  /** Gems in hand, so the panel can price the buy button without a second read. */
  gems: number
  /** CAPTAIN'S WATER (lib/captainWater). False means the board is read-only:
   *  points still bank, nothing can be spent. Points already spent keep it. */
  captain: boolean
}

const XP_COL = (skill: RenownSkill) => (skill === 'fishing' ? 'fishing_xp' : 'expedition_xp')
const ALLOC_COL = (skill: RenownSkill) => (skill === 'fishing' ? 'fishing_renown_alloc' : 'nav_renown_alloc')

async function readRenown(db: ProgressData, uid: string, skill: RenownSkill) {
  const row = (await db.profile(uid, `${XP_COL(skill)}, ${ALLOC_COL(skill)}, renown_respecs, gems, is_premium, premium_expires_at, is_admin`)) ?? {}
  const alloc = (row[ALLOC_COL(skill)] as RenownAlloc | null) ?? {}
  return {
    xp: Number(row[XP_COL(skill)] ?? 0),
    alloc,
    rawRespecs: row.renown_respecs,
    respecs: Math.max(0, Number(row.renown_respecs ?? 0)),
    gems: Math.max(0, Number(row.gems ?? 0)),
    // Grandfathered by points already on the board: see lib/captainWater.
    captain: captainsWaterOpen(row as CaptainWaterRow, spentPoints(skill, alloc) > 0),
  }
}

const writeAlloc = (db: ProgressData, uid: string, skill: RenownSkill, alloc: RenownAlloc) =>
  db.updateProfile(uid, { [ALLOC_COL(skill)]: alloc })

function stateFrom(skill: RenownSkill, xp: number, alloc: RenownAlloc, respecs = 0, gems = 0, captain = false): RenownState {
  return { skill, level: renownLevel(skill, xp), spent: spentPoints(skill, alloc), available: availablePoints(skill, xp, alloc), alloc, respecs, gems, captain }
}

export async function getRenownState(db: ProgressData, uid: string, skill: RenownSkill): Promise<RenownState | null> {
  const { xp, alloc, respecs, gems, captain } = await readRenown(db, uid, skill)
  return stateFrom(skill, xp, alloc, respecs, gems, captain)
}

/** Mark the one-time "meet Renown" intro seen for a skill, so it never replays. */
export async function markRenownIntroSeen(db: ProgressData, uid: string, skill: RenownSkill): Promise<void> {
  await db.updateProfile(uid, skill === 'fishing' ? { seen_fishing_renown_intro: true } : { seen_nav_renown_intro: true })
}

/** Spend one banked point on a stat. Can't over-spend or target an unknown stat. */
export async function allocateRenown(db: ProgressData, uid: string, skill: RenownSkill, statId: string): Promise<RenownState | { error: string }> {
  if (!isRenownStat(skill, statId)) return { error: 'Unknown stat.' }
  const { xp, alloc, respecs, gems, captain } = await readRenown(db, uid, skill)
  if (!captain) return { error: CAPTAIN_WATER_SAYS.renown }
  if (availablePoints(skill, xp, alloc) <= 0) return { error: 'No Renown points to spend.' }
  const next: RenownAlloc = { ...alloc, [statId]: Math.max(0, Math.floor(alloc[statId] ?? 0)) + 1 }
  await writeAlloc(db, uid, skill, next)
  return stateFrom(skill, xp, next, respecs, gems, captain)
}

/** Commit a whole draft of allocations at once. Known stats only, whole
 *  non-negative points, and never more than the points banked. */
export async function commitRenown(db: ProgressData, uid: string, skill: RenownSkill, delta: RenownAlloc): Promise<RenownState | { error: string }> {
  const clean: RenownAlloc = {}
  let total = 0
  for (const [id, n] of Object.entries(delta ?? {})) {
    if (!isRenownStat(skill, id)) continue
    const p = Math.max(0, Math.floor(Number(n) || 0))
    if (p > 0) { clean[id] = p; total += p }
  }
  const { xp, alloc, respecs, gems, captain } = await readRenown(db, uid, skill)
  if (!captain) return { error: CAPTAIN_WATER_SAYS.renown }
  if (total === 0) return stateFrom(skill, xp, alloc, respecs, gems, captain)
  if (total > availablePoints(skill, xp, alloc)) return { error: 'Not enough Renown points.' }
  const next: RenownAlloc = { ...alloc }
  for (const [id, p] of Object.entries(clean)) next[id] = Math.max(0, Math.floor(alloc[id] ?? 0)) + p
  await writeAlloc(db, uid, skill, next)
  return stateFrom(skill, xp, next, respecs, gems, captain)
}

/**
 * Spend one respec token to clear ONE board. The token is consumed FIRST, by a
 * write that lands only while the count is still what was read, so two taps
 * produce one respec and one refusal. The board is wiped after, because the
 * order that can strand a player is the one that clears it and then fails to
 * charge for it.
 */
export async function respecRenown(db: ProgressData, uid: string, skill: RenownSkill): Promise<RenownState | { error: string }> {
  const { xp, alloc, rawRespecs, respecs, gems, captain } = await readRenown(db, uid, skill)
  if (!captain) return { error: CAPTAIN_WATER_SAYS.renown }
  if (respecs <= 0) return { error: 'No respec tokens. You can buy one with gems.' }
  if (spentPoints(skill, alloc) === 0) return { error: 'Nothing to undo on this board yet.' }
  if (!(await db.updateProfileIf(uid, { renown_respecs: respecs - 1 }, [{ col: 'renown_respecs', eq: rawRespecs }]))) {
    return { error: 'No respec tokens. You can buy one with gems.' }
  }
  await writeAlloc(db, uid, skill, {})
  return stateFrom(skill, xp, {}, respecs - 1, gems, captain)
}

/** Buy one respec token for gems. The gems are taken in place (the spend is the
 *  guard) and the token added in place, so neither can overwrite a balance that
 *  moved in between. */
export async function buyRenownRespec(db: ProgressData, uid: string, skill: RenownSkill): Promise<RenownState | { error: string }> {
  const { xp, alloc, captain } = await readRenown(db, uid, skill)
  if (!captain) return { error: CAPTAIN_WATER_SAYS.renown }
  const newGems = await db.spend(uid, 'gems', RENOWN_RESPEC_GEM_COST)
  if (newGems == null) return { error: `You need ${RENOWN_RESPEC_GEM_COST.toLocaleString()} gems.` }
  await db.bumpStat(uid, 'renown_respecs', 1)
  const after = await db.profile(uid, 'renown_respecs')
  return stateFrom(skill, xp, alloc, Math.max(0, Number(after?.renown_respecs ?? 0)), newGems, captain)
}

// ══ BADGES ════════════════════════════════════════════════════════════════════

/** Grant every badge whose condition is met but not yet recorded. Derived from
 *  what the game already stores, so it self-heals; shares its conditions with
 *  the Achievement Points board (lib/badgeConditions) so the two cannot drift. */
export async function reconcileBadges(db: ProgressData, uid: string): Promise<string[]> {
  const s = await db.badgeSignals(uid)
  if (!s.profile) return []
  const have = new Set<string>((s.profile.unlocked_badges as string[] | null) ?? [])
  const derived = earnedBadgeIds(s.profile as BadgeProfileFields, {
    raids: s.raids,
    crew: s.crew,
    voyageCount: s.voyageCount,
    // Lifetime species (prestige-proof), with the live count as a floor.
    collectionCount: Math.max(s.collectionCount, Number((s.profile as BadgeProfileFields).lifetime_species_count ?? 0)),
    rodTiers: s.rodTiers,
    goldenCount: s.goldenCount,
    exchange: exchangeStatsFrom(s.exchange),
    sea: seaStatsFrom({ rapport: s.rapport, homestead: s.homestead, isles: s.isles, digs: s.digs }),
  })
  const toGrant = derived.filter(id => !have.has(id))
  if (toGrant.length === 0) return [...have]
  const next = [...have, ...toGrant]
  await db.updateProfile(uid, {
    unlocked_badges: next,
    badge_unlocked_at: stampBadges(s.profile.badge_unlocked_at, toGrant),
  })
  return next
}

/** Claim one earned badge's reward: only if unlocked and not yet claimed, both
 *  currencies moved with the mark. */
export async function claimBadgeReward(db: ProgressData, uid: string, badgeId: string): Promise<{ newDoubloons: number; newGems: number; claimed: string[]; amount: number; gems: number } | { error: string }> {
  const amount = badgeReward(badgeId)
  const gems = badgeGemReward(badgeId)
  if (!BADGE_MAP[badgeId] || amount <= 0) return { error: 'No reward for that badge' }
  const row = await db.claimBadgeReward(uid, badgeId, amount, gems)
  if (!row) return { error: 'Could not claim reward' }
  // Not granted and not already claimed means the badge was never unlocked.
  if (!row.granted && !(row.claimed ?? []).includes(badgeId)) return { error: 'That badge is not unlocked yet' }
  return {
    newDoubloons: Number(row.new_doubloons ?? 0),
    newGems: Number(row.new_gems ?? 0),
    claimed: row.claimed ?? [],
    amount: row.granted ? amount : 0,
    gems: row.granted ? gems : 0,
  }
}

/** Claim every earned-but-unclaimed badge reward at once. */
export async function claimAllBadgeRewards(db: ProgressData, uid: string): Promise<{ newDoubloons: number; newGems: number; claimed: string[]; totalGranted: number; totalGems: number; count: number } | { error: string }> {
  const profile = await db.profile(uid, 'doubloons, gems, unlocked_badges, claimed_badge_rewards')
  if (!profile) return { error: 'Profile not found' }
  const unlocked = new Set<string>((profile.unlocked_badges as string[] | null) ?? [])
  const already = new Set<string>((profile.claimed_badge_rewards as string[] | null) ?? [])
  const claimable = BADGES.filter(b => unlocked.has(b.id) && !already.has(b.id))
  let newDoubloons = Number(profile.doubloons ?? 0)
  let newGems = Number(profile.gems ?? 0)
  let claimed: string[] = [...already]
  let totalGranted = 0
  let totalGems = 0
  // Sequential, so each claim's balances are read after the last one landed.
  for (const b of claimable) {
    const amount = BADGE_REWARD[b.difficulty]
    const gems = BADGE_GEM_REWARD[b.difficulty]
    const row = await db.claimBadgeReward(uid, b.id, amount, gems)
    if (row?.granted) { totalGranted += amount; totalGems += gems }
    newDoubloons = Number(row?.new_doubloons ?? newDoubloons)
    newGems = Number(row?.new_gems ?? newGems)
    claimed = row?.claimed ?? claimed
  }
  return { newDoubloons, newGems, claimed, totalGranted, totalGems, count: claimable.length }
}

export async function getUnlockedBadges(db: ProgressData, uid: string): Promise<string[]> {
  return ((await db.profile(uid, 'unlocked_badges'))?.unlocked_badges as string[] | null) ?? []
}

/** Badges the CLIENT may unlock directly: raid combat feats earned mid-fight
 *  (client-side combat, so they cannot be re-derived). Every other badge is
 *  granted only by a trusted hook, so a crafted call cannot forge a valuable
 *  badge and then claim its reward. Keep in sync with RaidGame's calls. */
export const CLIENT_GRANTABLE_BADGES = new Set<string>([
  'corsairs_bane', 'ghost_ship',          // challenge-mode boss clears
  'all_hands_legends', 'iron_ruse', 'tight_quarters', 'dead_reckoning', // raid feats
  'not_a_shot_fired',
])

export async function unlockBadge(db: ProgressData, uid: string, badgeId: string): Promise<{ ok: true } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }
  if (!CLIENT_GRANTABLE_BADGES.has(badgeId)) return { error: 'Not eligible' }
  const profile = await db.profile(uid, 'unlocked_badges, badge_unlocked_at')
  if (!profile) return { error: 'Profile not found' }
  const current = (profile.unlocked_badges as string[] | null) ?? []
  if (current.includes(badgeId)) return { ok: true }
  await db.updateProfile(uid, { unlocked_badges: [...current, badgeId], badge_unlocked_at: stampBadges(profile.badge_unlocked_at, [badgeId]) })
  return { ok: true }
}

export async function equipBadge(db: ProgressData, uid: string, badgeId: string, slot: 0 | 1 | 2): Promise<{ equipped: string[] } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }
  // The slot comes from the client: anything but a real slot index would write
  // past the end of the array (or onto a named key).
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_EQUIPPED_BADGES) return { error: 'Invalid slot' }
  const profile = await db.profile(uid, 'unlocked_badges, equipped_badges')
  if (!profile) return { error: 'Profile not found' }
  if (!((profile.unlocked_badges as string[] | null) ?? []).includes(badgeId)) return { error: 'Badge not unlocked' }
  const equipped = [...((profile.equipped_badges as string[] | null) ?? [])]
  while (equipped.length < MAX_EQUIPPED_BADGES) equipped.push('')
  // Off any other slot it is already in.
  for (let i = 0; i < MAX_EQUIPPED_BADGES; i++) if (equipped[i] === badgeId && i !== slot) equipped[i] = ''
  equipped[slot] = badgeId
  await db.updateProfile(uid, { equipped_badges: equipped })
  return { equipped }
}

export async function unequipBadge(db: ProgressData, uid: string, slot: 0 | 1 | 2): Promise<{ equipped: string[] } | { error: string }> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_EQUIPPED_BADGES) return { error: 'Invalid slot' }
  const profile = await db.profile(uid, 'equipped_badges')
  if (!profile) return { error: 'Profile not found' }
  const equipped = [...((profile.equipped_badges as string[] | null) ?? [])]
  while (equipped.length < MAX_EQUIPPED_BADGES) equipped.push('')
  equipped[slot] = ''
  await db.updateProfile(uid, { equipped_badges: equipped })
  return { equipped }
}

// ══ THE UNLOCK BANNER ═════════════════════════════════════════════════════════
//
// "Has this captain EARNED a cosmetic I have not told them about?" Earned means
// a gate (lib/cosmeticGates): a level step or a share of the achievement pool.
// `seen_unlocks` holds what has been announced; it starts NULL, and the first
// check seeds it with what the captain already had under the rules before the
// 2026-09-25 standard, so an old account is told only what the new rules gave.
// It also stores each earned id into its owned column.

export type UnlockNews = {
  key: string
  cat: 'skin' | 'boat' | 'border'
  id: string
  name: string
  /** A picture for a boat; a skin or border is drawn as an avatar. */
  image?: string
  ring?: string
  reason: string
}

type Earnable = { key: string; cat: UnlockNews['cat']; id: string; name: string; gate: CosmeticGate; image?: string; ring?: string }

const EARNABLE: Earnable[] = [
  ...CHARACTER_COLORS.filter(c => c.gate).map(c => ({ key: `skin:${c.id}`, cat: 'skin' as const, id: c.id, name: `${c.name} skin`, gate: c.gate! })),
  ...BOATS.filter(b => b.gate).map(b => ({ key: `boat:${b.id}`, cat: 'boat' as const, id: b.id, name: `${b.name} boat`, gate: b.gate!, image: b.restImageUrl })),
  ...AVATAR_SPECIALS.filter(s => s.gate).map(s => ({ key: `border:${s.id}`, cat: 'border' as const, id: s.id, name: `${s.label} border`, gate: s.gate!, ring: s.hex })),
]

/** Everything the OLD rules could give by state: seen AND stored on the first check. */
const LEGACY_KEYS = ['skin:forest', 'skin:ice', 'skin:sky', 'skin:sand', 'skin:crystal', 'skin:galaxy', 'skin:ethereal', 'boat:abyssal', 'boat:celestial']

function hadUnderOldRules(key: string, s: { fishing: number; nav: number; prestige: number; ap: number | null }): boolean {
  const ap = s.ap ?? 0
  switch (key) {
    case 'skin:forest': return s.fishing >= 50
    case 'skin:ice': return s.fishing >= 75
    case 'skin:sky': return s.nav >= 50
    case 'skin:sand': return s.prestige >= 3
    case 'skin:crystal': return s.fishing >= 100 && s.nav >= 100
    case 'skin:galaxy': return ap >= 390
    case 'skin:ethereal': return ap >= 450
    case 'boat:abyssal': return ap >= 350
    case 'boat:celestial': return ap >= 420
    default: return false
  }
}

export async function checkUnlocks(db: ProgressData, uid: string): Promise<UnlockNews[]> {
  const p = await db.profile(uid, 'fishing_xp, expedition_xp, prestige_levels, unlocked_character_colors, unlocked_boats, unlocked_avatar_specials, seen_unlocks')
  if (!p) return []

  const seenCol = p.seen_unlocks as string[] | null
  const seen = new Set(seenCol ?? [])
  const fishing = getLevelFromXP(Number(p.fishing_xp ?? 0))
  const nav = navLevelFromXP(Number(p.expedition_xp ?? 0))
  const prestige = Math.max(0, ...Object.values((p.prestige_levels as Record<string, number> | null) ?? {}))

  // The score costs reads, so only when an unseen achievement gate is left, or
  // when seeding (the old rules need it too).
  const needAp = seenCol == null || EARNABLE.some(e => e.gate.kind === 'ap' && !seen.has(e.key))
  const ap = needAp ? await db.achievementPoints(uid) : null

  const earned = EARNABLE.filter(e => gateMet(e.gate, { fishingLevel: fishing, navLevel: nav, ap }))
  const stored = {
    skin: (p.unlocked_character_colors as string[] | null) ?? [],
    boat: (p.unlocked_boats as string[] | null) ?? [],
    border: (p.unlocked_avatar_specials as string[] | null) ?? [],
  }
  const owned = { skin: new Set(stored.skin), boat: new Set(stored.boat), border: new Set(stored.border) }
  const had = { skin: owned.skin.size, boat: owned.boat.size, border: owned.border.size }

  if (seenCol == null) {
    for (const key of LEGACY_KEYS) {
      if (!hadUnderOldRules(key, { fishing, nav, prestige, ap })) continue
      const [cat, id] = key.split(':') as ['skin' | 'boat', string]
      seen.add(key)
      owned[cat].add(id)
    }
    for (const e of earned) if (owned[e.cat].has(e.id)) seen.add(e.key)
  }
  const news = earned.filter(e => !seen.has(e.key))

  for (const e of earned) owned[e.cat].add(e.id)
  const update: Record<string, unknown> = {}
  if (owned.skin.size > had.skin) update.unlocked_character_colors = [...owned.skin]
  if (owned.boat.size > had.boat) update.unlocked_boats = [...owned.boat]
  if (owned.border.size > had.border) update.unlocked_avatar_specials = [...owned.border]
  if (news.length || seenCol == null) update.seen_unlocks = [...seen, ...news.map(e => e.key)]
  if (Object.keys(update).length) await db.updateProfile(uid, update)

  return news.map(e => ({ key: e.key, cat: e.cat, id: e.id, name: e.name, image: e.image, ring: e.ring, reason: gateReason(e.gate) }))
}

// ══ FIRST RUN, AND THE MEMBER'S DAILY PACK ════════════════════════════════════

export async function markSetupSeen(db: ProgressData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_setup: true })
}

/** The welcome gift: 100 gems, once. The flag flips first, guarded, and the gems
 *  are added in place, so a double tap pays once. */
export async function claimWelcomePack(db: ProgressData, uid: string): Promise<{ ok: boolean }> {
  const profile = await db.profile(uid, 'has_seen_welcome')
  if (!profile || profile.has_seen_welcome) return { ok: false }
  if (!(await db.updateProfileIf(uid, { has_seen_welcome: true }, [profile.has_seen_welcome == null ? { col: 'has_seen_welcome', is: null } : { col: 'has_seen_welcome', eq: profile.has_seen_welcome }]))) return { ok: false }
  await db.grant(uid, 'gems', 100)
  return { ok: true }
}

const DAILY_MEMBER_GEMS = 100

/** A member's daily gems. The day is stamped first, guarded, and the gems added
 *  in place, so a double tap pays once. */
export async function claimDailyPack(db: ProgressData, uid: string): Promise<{ claimed: boolean; gems?: number }> {
  const profile = await db.profile(uid, 'is_premium, premium_expires_at')
  if (!profile || !isPremiumActive(profile as Parameters<typeof isPremiumActive>[0])) return { claimed: false }
  const today = new Date(clockNow()).toISOString().split('T')[0]
  if (!(await db.stampIfNew(uid, 'last_pack_claim', today))) return { claimed: false }
  return { claimed: true, gems: await db.grant(uid, 'gems', DAILY_MEMBER_GEMS) }
}
