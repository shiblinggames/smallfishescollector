// ── THE CAPTAIN'S PROFILE, CORE (Steam prep, 2026-09-29) ──
//
// The captain's own name and looks, with nothing of the web in them: the
// username (once), the showcase crew, skins bought, worn and self-healed,
// earned skins and boats persisted, the avatar's background and border, the
// profile background, the animated specials, and the username search. Each
// takes the store (ProgressData) and the captain's id. On the web u/actions
// checks the session and hands these the Supabase store (and keeps its page
// revalidations); offline, the local save's, where there is nobody else, so a
// well-formed clean name is always free and a search finds nobody.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; table reads and guarded writes became store operations.

import { isClean, PROFANITY_MESSAGE } from '@/lib/profanity'
import { CHARACTER_COLORS, earnedLevelColors, earnedAchievementColors, ACHIEVEMENT_COLORS } from '@/lib/characters'
import { earnedAchievementBoats, ACHIEVEMENT_BOAT_IDS } from '@/lib/boats'
import { ALLOWED_BG_HEXES, ALLOWED_BORDER_HEXES, isPremiumBg, isPremiumBorder, getAvatarSpecial, AVATAR_SPECIALS } from '@/lib/avatarColors'
import { gateMet } from '@/lib/cosmeticGates'
import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { getProfileBackground } from '@/lib/profileBackgrounds'
import type { ProgressData } from '@/lib/data/progressData'
import { vigilFor } from '@/lib/ancientVigil'
import { ownedSpecialIds } from '@/lib/specialItems'
import { getShip } from '@/lib/ships'
import { earnedSpecials } from '@/lib/avatarColors'
import type { CareerStats, CareerAggregates } from '@/lib/careerStats'
import type { CrewMember } from '@/lib/core/crew'
import type { Row } from '@/lib/data/common'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/
const premium = (p: unknown) => isPremiumActive(p as Parameters<typeof isPremiumActive>[0])

/** Change the username, once. It is a name other people read (leaderboards,
 *  the badge wall, another captain's chart), so it is checked here, not only in
 *  the form. */
export async function updateUsername(db: ProgressData, uid: string, username: string): Promise<{ error?: string }> {
  const clean = username.trim().toLowerCase()
  if (!USERNAME_RE.test(clean)) return { error: 'Username must be 3–20 characters: letters, numbers, underscores only.' }
  if (!isClean(clean)) return { error: PROFANITY_MESSAGE }
  const profile = await db.profile(uid, 'username_changed')
  if (profile?.username_changed) return { error: 'Username can only be changed once.' }
  const r = await db.setUsername(uid, clean)
  if (r === 'taken') return { error: 'That username is already taken.' }
  if (r === 'error') return { error: 'Something went wrong. Please try again.' }
  return {}
}

/** The live checker. An unclean name reads as unavailable rather than blocked,
 *  so the checker cannot be used to search the word list a letter at a time. */
export async function checkUsername(db: ProgressData, username: string): Promise<{ available: boolean }> {
  const clean = username.trim().toLowerCase()
  if (!USERNAME_RE.test(clean) || !isClean(clean)) return { available: false }
  return { available: await db.usernameFree(clean) }
}

/** Up to five LIVE crew to feature on the profile (the fallen cannot be). */
export async function updateShowcaseCrew(db: ProgressData, uid: string, crewIds: number[]): Promise<{ error?: string }> {
  const ids = Array.from(new Set(crewIds)).slice(0, 5)
  let clean: number[] = []
  if (ids.length > 0) {
    const live = new Set((await db.livingCrew(uid, 'id')).map(r => Number(r.id)))
    clean = ids.filter(id => live.has(id))
  }
  await db.updateProfile(uid, { showcase_crew_ids: clean })
  return {}
}

/** Buy a skin, for doubloons or gems. Spend first, in place; a twin that already
 *  added it gets its charge back. */
export async function purchaseCharacterColor(db: ProgressData, uid: string, colorId: string): Promise<{ doubloons: number; gems: number; unlockedColors: string[] } | { error: string }> {
  const color = CHARACTER_COLORS.find(c => c.id === colorId)
  if (!color || (!color.price && !color.gemPrice)) return { error: 'Not for sale' }
  const useGems = !!color.gemPrice

  const profile = await db.profile(uid, 'doubloons, gems, unlocked_character_colors')
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_character_colors as string[] | null) ?? []
  if (unlocked.includes(colorId)) return { error: 'Already owned' }

  const cost = (useGems ? color.gemPrice : color.price)!
  const balance = Number(useGems ? (profile.gems ?? 0) : profile.doubloons)
  const glyph = useGems ? '◆' : '⟡'
  if (balance < cost) return { error: `Need ${cost.toLocaleString()} ${glyph}` }

  const col = useGems ? 'gems' : 'doubloons'
  const after = await db.spend(uid, col, cost)
  if (after === null) return { error: `Need ${cost.toLocaleString()} ${glyph}` }
  if (!(await db.addToList(uid, 'unlocked_character_colors', colorId))) {
    await db.grant(uid, col, cost)
    return { error: 'Already owned' }
  }
  await db.ledger(uid, -cost, `Bought ${color.name} skin`, useGems ? 'gems' : 'doubloons')
  return {
    doubloons: useGems ? Number(profile.doubloons) : after,
    gems: useGems ? after : Number(profile.gems ?? 0),
    unlockedColors: [...unlocked, colorId],
  }
}

/** Wear a skin. A level- or achievement-gated skin the captain has EARNED but
 *  whose grant never fired is allowed and stored (self-heal); anything else
 *  locked is refused. */
export async function updateCharacterColor(db: ProgressData, uid: string, colorId: string): Promise<{ error?: string }> {
  const color = CHARACTER_COLORS.find(c => c.id === colorId)
  if (!color) return { error: 'Invalid color' }
  if (!color.free) {
    const profile = await db.profile(uid, 'unlocked_character_colors, fishing_xp, expedition_xp, prestige_levels')
    const unlocked = (profile?.unlocked_character_colors as string[] | null) ?? []
    if (!unlocked.includes(colorId)) {
      const prestige = (profile?.prestige_levels as Record<string, number> | null) ?? {}
      let earned = earnedLevelColors({
        fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
        navLevel: navLevelFromXP(Number(profile?.expedition_xp ?? 0)),
        maxPrestige: Math.max(0, ...Object.values(prestige)),
      }, unlocked).includes(colorId)
      if (!earned && ACHIEVEMENT_COLORS.some(a => a.id === colorId)) {
        earned = earnedAchievementColors(await db.achievementPoints(uid), unlocked).includes(colorId)
      }
      if (!earned) return { error: 'Color not unlocked' }
      await db.addToList(uid, 'unlocked_character_colors', colorId)
    }
  }
  await db.updateProfile(uid, { character_color: colorId })
  return {}
}

/** Store any earned-but-ungranted skins so they stop re-announcing. Each id is
 *  re-validated. Returns the ids genuinely granted. */
export async function persistEarnedSkins(db: ProgressData, uid: string, ids: string[]): Promise<{ granted: string[] }> {
  const candidates = Array.from(new Set((ids ?? []).filter(id => typeof id === 'string')))
  if (candidates.length === 0) return { granted: [] }
  const profile = await db.profile(uid, 'unlocked_character_colors, fishing_xp, expedition_xp, prestige_levels')
  const stored = (profile?.unlocked_character_colors as string[] | null) ?? []
  const prestige = (profile?.prestige_levels as Record<string, number> | null) ?? {}
  const earnedLevel = new Set(earnedLevelColors({
    fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
    navLevel: navLevelFromXP(Number(profile?.expedition_xp ?? 0)),
    maxPrestige: Math.max(0, ...Object.values(prestige)),
  }, stored))
  const needsAch = candidates.some(id => ACHIEVEMENT_COLORS.some(a => a.id === id))
  const earnedAch = needsAch ? new Set(earnedAchievementColors(await db.achievementPoints(uid), stored)) : new Set<string>()
  const granted = candidates.filter(id => !stored.includes(id) && (earnedLevel.has(id) || earnedAch.has(id)))
  for (const id of granted) await db.addToList(uid, 'unlocked_character_colors', id)
  return { granted }
}

/** The boat equivalent: the achievement-gated boats only. */
export async function persistEarnedBoats(db: ProgressData, uid: string, ids: string[]): Promise<{ granted: string[] }> {
  const candidates = Array.from(new Set((ids ?? []).filter(id => typeof id === 'string')))
  if (candidates.length === 0) return { granted: [] }
  const stored = ((await db.profile(uid, 'unlocked_boats'))?.unlocked_boats as string[] | null) ?? []
  const needsAch = candidates.some(id => ACHIEVEMENT_BOAT_IDS.has(id))
  const earned = needsAch ? new Set(earnedAchievementBoats(await db.achievementPoints(uid), stored)) : new Set<string>()
  const granted = candidates.filter(id => !stored.includes(id) && earned.has(id))
  for (const id of granted) await db.addToList(uid, 'unlocked_boats', id)
  return { granted }
}

/** The avatar's background and border. Unknown values fall back to the
 *  default; Captain swatches need a membership; animated specials must be
 *  owned (earned specials are checked against their gate and stored). */
export async function updateAvatarColors(db: ProgressData, uid: string, input: { bgColor: string | null; borderColor: string | null }): Promise<{ error?: string }> {
  const bgAllowed = new Set(ALLOWED_BG_HEXES)
  const borderAllowed = new Set(ALLOWED_BORDER_HEXES)
  const bg = input.bgColor === null ? null : (bgAllowed.has(input.bgColor) ? input.bgColor : null)
  const border = input.borderColor === null ? null : (borderAllowed.has(input.borderColor) ? input.borderColor : null)

  const bgSpecial = bg ? getAvatarSpecial(bg) : undefined
  const borderSpecial = border ? getAvatarSpecial(border) : undefined
  const needsPremiumCheck = (bg && isPremiumBg(bg)) || (border && isPremiumBorder(border))
  const needsOwnedCheck = !!bgSpecial || !!borderSpecial

  if (needsPremiumCheck || needsOwnedCheck) {
    const profile = await db.profile(uid, 'is_premium, premium_expires_at, unlocked_avatar_specials, fishing_xp, expedition_xp')
    if (needsPremiumCheck && !premium(profile)) return { error: 'That color is Captain-only.' }
    if (needsOwnedCheck) {
      const owned = (profile?.unlocked_avatar_specials as string[] | null) ?? []
      const earned = async (sp: NonNullable<typeof bgSpecial>) => {
        if (owned.includes(sp.id)) return true
        if (!sp.gate) return false
        const ap = sp.gate.kind === 'ap' ? await db.achievementPoints(uid) : null
        const ok = gateMet(sp.gate, {
          fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
          navLevel: navLevelFromXP(Number(profile?.expedition_xp ?? 0)),
          ap,
        })
        if (ok) { owned.push(sp.id); await db.addToList(uid, 'unlocked_avatar_specials', sp.id) }
        return ok
      }
      if (bgSpecial && !(await earned(bgSpecial))) return { error: `${bgSpecial.label} not unlocked` }
      if (borderSpecial && !(await earned(borderSpecial))) return { error: `${borderSpecial.label} not unlocked` }
    }
  }
  await db.updateProfile(uid, { avatar_bg_color: bg, avatar_border_color: border })
  return {}
}

/** The profile-page background; a zone background needs its fishing level. */
export async function updateProfileBg(db: ProgressData, uid: string, bg: string | null): Promise<{ error?: string }> {
  if (bg === null) { await db.updateProfile(uid, { profile_bg: null }); return {} }
  const def = getProfileBackground(bg)
  if (!def) return { error: 'Unknown background' }
  const level = getLevelFromXP(Number((await db.profile(uid, 'fishing_xp'))?.fishing_xp ?? 0))
  if (level < def.minLevel) return { error: `Unlocks at Level ${def.minLevel}` }
  await db.updateProfile(uid, { profile_bg: bg })
  return {}
}

/** Buy an animated avatar special with gems: Captains only. */
export async function purchaseAvatarSpecial(db: ProgressData, uid: string, specialId: string): Promise<{ gems: number; unlockedSpecials: string[] } | { error: string }> {
  const special = AVATAR_SPECIALS.find(s => s.id === specialId)
  if (!special || special.gate || !special.gemPrice) return { error: 'Not for sale' }
  const gemPrice = special.gemPrice
  const profile = await db.profile(uid, 'gems, unlocked_avatar_specials, is_premium, premium_expires_at')
  if (!profile) return { error: 'Profile not found' }
  if (!premium(profile)) return { error: 'Captain only. Become a Captain first' }
  const owned = (profile.unlocked_avatar_specials as string[] | null) ?? []
  if (owned.includes(specialId)) return { error: 'Already owned' }
  if (Number(profile.gems ?? 0) < gemPrice) return { error: `Need ${gemPrice.toLocaleString()} ◆` }
  const newGems = await db.spend(uid, 'gems', gemPrice)
  if (newGems === null) return { error: `Need ${gemPrice.toLocaleString()} ◆` }
  if (!(await db.addToList(uid, 'unlocked_avatar_specials', specialId))) {
    await db.grant(uid, 'gems', gemPrice)
    return { error: 'Already owned' }
  }
  await db.ledger(uid, -gemPrice, `Bought ${special.label} ${special.kind === 'border' ? 'border' : 'background'}`, 'gems')
  return { gems: newGems, unlockedSpecials: [...owned, specialId] }
}

/** Usernames starting with the query, for the crew search. */
export async function searchUsers(db: ProgressData, query: string): Promise<{ username: string }[]> {
  if (!query || query.length < 2) return []
  return (await db.searchUsernames(query.toLowerCase())).map(username => ({ username }))
}

// ── THE PROFILE PAGE (2026-09-30) ──
// What /profile hands ProfileClient, from pieces like the sea chart: the web
// page reads them from Supabase (the career aggregates from career_stats), the
// desktop from the save. Moved out of the page.

type SpeciesFacts = { id: number; name: string; bite_rarity: number; habitat?: string; sell_value?: number }

export type ProfilePagePieces = {
  email: string
  profile: Row | null
  crewRoster: CrewMember[]
  /** Every species logged, with whether it is mounted golden. */
  collection: { is_golden: boolean | null; species: SpeciesFacts | null }[]
  species: { id: number; name: string }[]
  career: Partial<CareerAggregates>
  achievementPoints: number
}

export function profilePageProps(p: ProfilePagePieces) {
  const profile = p.profile
  const rarestFish = p.collection.map(r => r.species).filter((f): f is SpeciesFacts => !!f)
  const goldenMounts = p.collection
    .filter(r => r.is_golden === true && r.species)
    .map(r => r.species as SpeciesFacts)
    .sort((a, b) => (b.bite_rarity ?? 0) - (a.bite_rarity ?? 0))
  const ancientIdSet = new Set((profile?.ancient_catches as number[] | null) ?? [])
  const ancientTrophies = p.species.filter(f => ancientIdSet.has(f.id))
  const career: CareerStats = {
    fishingCasts: Number(profile?.fishing_casts ?? 0),
    perfects: Number(profile?.total_perfects ?? 0),
    fishSold: p.career.fishSold ?? 0,
    raidsCompleted: p.career.raidsCompleted ?? 0,
    voyageLoot: p.career.voyageLoot ?? 0,
    highestRaidDamage: Number(profile?.highest_raid_damage ?? 0),
    prestigeTotal: Object.values((profile?.prestige_levels as Record<string, number> | null) ?? {}).reduce((a, b) => a + (Number(b) || 0), 0),
  }
  const ship = getShip(Number(profile?.ship_tier ?? 0))
  const level = getLevelFromXP(Number(profile?.fishing_xp ?? 0))
  const expeditionLevel = navLevelFromXP(Number(profile?.expedition_xp ?? 0))
  const storedColors = (profile?.unlocked_character_colors as string[] | null) ?? []
  const prestigeLevels = (profile?.prestige_levels as Record<string, number> | null) ?? {}
  const unlockedColors = [
    ...CHARACTER_COLORS.filter(c => c.free).map(c => c.id),
    ...storedColors,
    ...earnedLevelColors({ fishingLevel: level, navLevel: expeditionLevel, maxPrestige: Math.max(0, ...Object.values(prestigeLevels)) }, storedColors),
    ...earnedAchievementColors(p.achievementPoints, storedColors),
  ]
  const storedSpecials = (profile?.unlocked_avatar_specials as string[] | null) ?? []
  return {
    email: p.email,
    username: (profile?.username as string | null) ?? '',
    usernameChanged: (profile?.username_changed as boolean | null) ?? false,
    crewRoster: p.crewRoster,
    isPremium: isPremiumActive(profile),
    level,
    expeditionLevel,
    career,
    shipTier: Number(profile?.ship_tier ?? 0),
    shipName: ship.name,
    shipColor: ship.color,
    customShipName: (profile?.ship_name as string | null) ?? null,
    equippedShipSkin: (profile?.equipped_ship_skin as string | null) ?? null,
    rodTier: Number(profile?.rod_tier ?? 0),
    reelTier: Number(profile?.reel_tier ?? 0),
    hookTier: Number(profile?.hook_tier ?? 0),
    equippedSpecialId: (profile?.equipped_special as string | null) ?? null,
    ownedSpecialIds: ownedSpecialIds(profile as Record<string, unknown> | null),
    equippedSpecial2Id: (profile?.equipped_special_2 as string | null) ?? null,
    rarestFish,
    prestigeLevels,
    goldenMounts,
    raidItemIds: (profile?.raid_items as string[] | null) ?? [],
    ancientTrophies,
    ancientVigil: vigilFor(profile?.ancient_vigil, (profile?.ancient_catches as number[] | null) ?? null),
    characterColor: (profile?.character_color as string | null) ?? 'default',
    unlockedColors,
    doubloons: Number(profile?.doubloons ?? 0),
    gems: Number(profile?.gems ?? 0),
    equippedBadges: (profile?.equipped_badges as string[] | null) ?? [],
    equippedBoat: (profile?.equipped_boat as string | null) ?? null,
    equippedHat: (profile?.equipped_hat as string | null) ?? null,
    equippedPet: (profile?.equipped_pet as string | null) ?? null,
    unlockedBadges: (profile?.unlocked_badges as string[] | null) ?? [],
    avatarBgColor: (profile?.avatar_bg_color as string | null) ?? null,
    avatarBorderColor: (profile?.avatar_border_color as string | null) ?? null,
    unlockedAvatarSpecials: [...storedSpecials, ...earnedSpecials({ fishingLevel: level, navLevel: expeditionLevel, ap: p.achievementPoints }, storedSpecials)],
    initialProfileBg: (profile?.profile_bg as string | null) ?? null,
  }
}
