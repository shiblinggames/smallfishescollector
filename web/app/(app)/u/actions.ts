'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isClean, PROFANITY_MESSAGE } from '@/lib/profanity'
import { CHARACTER_COLORS, earnedLevelColors, earnedAchievementColors, ACHIEVEMENT_COLORS } from '@/lib/characters'
import { earnedAchievementBoats, ACHIEVEMENT_BOAT_IDS } from '@/lib/boats'
import { getUserAchievementPoints } from '@/lib/achievementPoints'
import { ALLOWED_BG_HEXES, ALLOWED_BORDER_HEXES, isPremiumBg, isPremiumBorder, getAvatarSpecial, AVATAR_SPECIALS } from '@/lib/avatarColors'
import { gateMet } from '@/lib/cosmeticGates'
import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { getProfileBackground } from '@/lib/profileBackgrounds'
import { arrayAdd, grant, spend } from '@/lib/wallet'

export async function updateUsername(username: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const clean = username.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) return { error: 'Username must be 3–20 characters: letters, numbers, underscores only.' }
  // ── AND IT IS A NAME OTHER PEOPLE HAVE TO READ ────────────────────────
  // Leaderboards, the badge wall, the mail, and another captain's chart when
  // the two of you sail together. Checked HERE rather than in the form,
  // because the form is not the only caller and a client check is a
  // suggestion. See lib/profanity for why it is a list and how it avoids
  // taking `bass` down with it.
  if (!isClean(clean)) return { error: PROFANITY_MESSAGE }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('username_changed').eq('id', user.id).single()
  if (profile?.username_changed) return { error: 'Username can only be changed once.' }

  const { error } = await admin.from('profiles').update({ username: clean, username_changed: true }).eq('id', user.id)
  if (error) {
    if (error.code === '23505') return { error: 'That username is already taken.' }
    return { error: 'Something went wrong. Please try again.' }
  }

  revalidatePath('/u/' + clean)
  return {}
}

export async function checkUsername(username: string): Promise<{ available: boolean }> {
  const clean = username.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) return { available: false }
  // Reported as unavailable rather than as blocked. The live checker runs on
  // every keystroke, so a distinct answer here would be a way to binary-search
  // the word list a letter at a time; `updateUsername` gives the real message
  // once, on submit.
  if (!isClean(clean)) return { available: false }
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').ilike('username', clean).single()
  return { available: !data }
}

export async function updateShowcaseCrew(crewIds: number[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const ids = Array.from(new Set(crewIds)).slice(0, 5)

  if (ids.length > 0) {
    // Showcase only LIVE crew — fallen crew can't be set as a
    // featured profile pick.
    const { data: owned } = await admin
      .from('user_crew')
      .select('id')
      .eq('user_id', user.id)
      .is('died_at', null)
      .in('id', ids)
    const ownedIds = new Set((owned ?? []).map((r: any) => r.id))
    const clean = ids.filter(id => ownedIds.has(id))
    const { error } = await admin.from('profiles').update({ showcase_crew_ids: clean }).eq('id', user.id)
    if (error) return { error: 'Something went wrong.' }
  } else {
    const { error } = await admin.from('profiles').update({ showcase_crew_ids: [] }).eq('id', user.id)
    if (error) return { error: 'Something went wrong.' }
  }

  revalidatePath('/profile')
  return {}
}

export async function purchaseCharacterColor(colorId: string): Promise<
  { doubloons: number; gems: number; unlockedColors: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const color = CHARACTER_COLORS.find(c => c.id === colorId)
  if (!color || (!color.price && !color.gemPrice)) return { error: 'Not for sale' }
  const useGems = !!color.gemPrice

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, unlocked_character_colors')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const unlocked = (profile.unlocked_character_colors as string[] | null) ?? []
  if (unlocked.includes(colorId)) return { error: 'Already owned' }

  const cost = (useGems ? color.gemPrice : color.price)!
  const balance = useGems ? (profile.gems ?? 0) : profile.doubloons
  if (balance < cost) {
    return { error: `Need ${cost.toLocaleString()} ${useGems ? '◆' : '⟡'}` }
  }

  // Spend first, in place: the result is the guard, so two taps fired
  // together cannot both buy with the same balance.
  const col = useGems ? 'gems' : 'doubloons'
  const after = await spend(admin, user.id, col, cost)
  if (after === null) return { error: `Need ${cost.toLocaleString()} ${useGems ? '◆' : '⟡'}` }
  // A concurrent twin already added it: give this charge back.
  if (!(await arrayAdd(admin, user.id, 'unlocked_character_colors', colorId))) {
    await grant(admin, user.id, col, cost)
    return { error: 'Already owned' }
  }

  const newDoubloons = useGems ? profile.doubloons : after
  const newGems = useGems ? after : (profile.gems ?? 0)
  const newUnlocked = [...unlocked, colorId]

  await Promise.all([
    admin.from(useGems ? 'gem_transactions' : 'doubloon_transactions').insert({
      user_id: user.id,
      amount: -cost,
      reason: `Bought ${color.name} skin`,
    }),
  ])

  return { doubloons: newDoubloons, gems: newGems, unlockedColors: newUnlocked }
}

export async function updateCharacterColor(colorId: string, opts?: { quiet?: boolean }): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const color = CHARACTER_COLORS.find(c => c.id === colorId)
  if (!color) return { error: 'Invalid color' }

  const admin = createAdminClient()

  if (!color.free) {
    const { data: profile } = await admin.from('profiles')
      .select('unlocked_character_colors, fishing_xp, expedition_xp, prestige_levels').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_character_colors as string[] | null) ?? []
    if (!unlocked.includes(colorId)) {
      // Self-heal: a level-gated color the player has EARNED but whose grant
      // hook never fired (e.g. crossed Nav 50 via raids, not voyages) is still
      // valid — allow it and persist the unlock so it sticks. Anything else is
      // genuinely locked.
      const prestige = (profile?.prestige_levels as Record<string, number> | null) ?? {}
      let earned = earnedLevelColors({
        fishingLevel: getLevelFromXP((profile?.fishing_xp as number | null) ?? 0),
        navLevel:     navLevelFromXP((profile?.expedition_xp as number | null) ?? 0),
        maxPrestige:  Math.max(0, ...Object.values(prestige)),
      }, unlocked).includes(colorId)
      // Achievement-gated colors (e.g. Galaxy at 300 pts) — the score is derived
      // from badges, so compute it live only when the requested color needs it.
      if (!earned && ACHIEVEMENT_COLORS.some(a => a.id === colorId)) {
        const pts = await getUserAchievementPoints(user.id)
        earned = earnedAchievementColors(pts, unlocked).includes(colorId)
      }
      if (!earned) return { error: 'Color not unlocked' }
      await arrayAdd(admin, user.id, 'unlocked_character_colors', colorId)
    }
  }

  // The skin is the captain on the chart, so /sea's cached render is now wrong.
  // See the note in fishing/actions equipBoat.
  // Quiet when the chart itself asked: see the note on equipBoat in
  // fishing/actions. The sprite has already changed on screen.
  if (!opts?.quiet) revalidatePath('/sea')
  await admin.from('profiles').update({ character_color: colorId }).eq('id', user.id)
  return {}
}

/** Persist any earned-but-ungranted colors (level/combo/achievement) so they
 *  stop re-announcing. Server re-validates each id authoritatively before
 *  storing it. Cheap in the common case (no candidates → single query, no
 *  achievement-points compute unless an achievement color is actually pending).
 *  Returns the ids it genuinely granted, for the client to celebrate. */
export async function persistEarnedSkins(ids: string[]): Promise<{ granted: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { granted: [] }
  const candidates = Array.from(new Set((ids ?? []).filter(id => typeof id === 'string')))
  if (candidates.length === 0) return { granted: [] }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('unlocked_character_colors, fishing_xp, expedition_xp, prestige_levels').eq('id', user.id).single()
  const stored = (profile?.unlocked_character_colors as string[] | null) ?? []
  const prestige = (profile?.prestige_levels as Record<string, number> | null) ?? {}

  // earnedLevelColors already excludes anything in `stored`, so its output is
  // exactly the level/combo colors this player has earned but not yet stored.
  const earnedLevel = new Set(earnedLevelColors({
    fishingLevel: getLevelFromXP((profile?.fishing_xp as number | null) ?? 0),
    navLevel:     navLevelFromXP((profile?.expedition_xp as number | null) ?? 0),
    maxPrestige:  Math.max(0, ...Object.values(prestige)),
  }, stored))
  const needsAch = candidates.some(id => ACHIEVEMENT_COLORS.some(a => a.id === id))
  const earnedAch = needsAch
    ? new Set(earnedAchievementColors(await getUserAchievementPoints(user.id), stored))
    : new Set<string>()

  const granted = candidates.filter(id => !stored.includes(id) && (earnedLevel.has(id) || earnedAch.has(id)))
  if (granted.length === 0) return { granted: [] }
  // Added in place one at a time, so a skin bought meanwhile is not written over.
  for (const id of granted) await arrayAdd(admin, user.id, 'unlocked_character_colors', id)
  return { granted }
}

/** Boat equivalent of {@link persistEarnedSkins} — persists achievement-earned
 *  boats (Celestial/Abyssal) so they stop re-announcing. Re-validates the AP
 *  threshold server-side. Returns the ids it genuinely granted. */
export async function persistEarnedBoats(ids: string[]): Promise<{ granted: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { granted: [] }
  const candidates = Array.from(new Set((ids ?? []).filter(id => typeof id === 'string')))
  if (candidates.length === 0) return { granted: [] }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('unlocked_boats').eq('id', user.id).single()
  const stored = (profile?.unlocked_boats as string[] | null) ?? []
  // Only the achievement-gated boats (Celestial/Abyssal) are grantable here, so
  // skip the 7-query achievement-points lookup entirely when no candidate is one
  // (the common case — crate/purchased boats never reach this branch). Mirrors
  // the needsAch gate in persistEarnedSkins.
  const needsAch = candidates.some(id => ACHIEVEMENT_BOAT_IDS.has(id))
  const earned = needsAch
    ? new Set(earnedAchievementBoats(await getUserAchievementPoints(user.id), stored))
    : new Set<string>()
  const granted = candidates.filter(id => !stored.includes(id) && earned.has(id))
  if (granted.length === 0) return { granted: [] }
  for (const id of granted) await arrayAdd(admin, user.id, 'unlocked_boats', id)
  return { granted }
}

/** Save the player's avatar background + border color choices.
 *  - Either field can be null (= unset; resolves to the shared defaults).
 *  - The special value 'none' means transparent.
 *  - Premium-only borders (e.g. gold) are rejected unless the user has
 *    an active premium membership. */
export async function updateAvatarColors(input: {
  bgColor: string | null
  borderColor: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const bgAllowed     = new Set(ALLOWED_BG_HEXES)
  const borderAllowed = new Set(ALLOWED_BORDER_HEXES)
  // Drop unknown values to null (= default) so the picker is forgiving;
  // explicit-null also means "unset, use default".
  const bg     = input.bgColor === null     ? null : (bgAllowed.has(input.bgColor)         ? input.bgColor     : null)
  const border = input.borderColor === null ? null : (borderAllowed.has(input.borderColor) ? input.borderColor : null)

  // Gating — premium swatches need active membership; animated specials need
  // to be in unlocked_avatar_specials (purchased with gems).
  const bgSpecial     = bg     ? getAvatarSpecial(bg)     : undefined
  const borderSpecial = border ? getAvatarSpecial(border) : undefined
  const needsPremiumCheck = (bg && isPremiumBg(bg)) || (border && isPremiumBorder(border))
  const needsOwnedCheck   = !!bgSpecial || !!borderSpecial

  if (needsPremiumCheck || needsOwnedCheck) {
    const admin0 = createAdminClient()
    const { data: profile } = await admin0
      .from('profiles')
      .select('is_premium, premium_expires_at, unlocked_avatar_specials, fishing_xp, expedition_xp')
      .eq('id', user.id)
      .single()

    if (needsPremiumCheck && !isPremiumActive(profile)) {
      return { error: 'That color is Captain-only.' }
    }
    if (needsOwnedCheck) {
      const owned = (profile?.unlocked_avatar_specials as string[] | null) ?? []
      // EARNED specials (Laurel, Hemp, Tidemark) are checked against their gate
      // rather than the bought list, and stored once they pass so they stick.
      const earned = async (sp: NonNullable<typeof bgSpecial>) => {
        if (owned.includes(sp.id)) return true
        if (!sp.gate) return false
        const ap = sp.gate.kind === 'ap' ? await getUserAchievementPoints(user.id) : null
        const ok = gateMet(sp.gate, {
          fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
          navLevel: navLevelFromXP(Number(profile?.expedition_xp ?? 0)),
          ap,
        })
        if (ok) {
          owned.push(sp.id)
          await arrayAdd(createAdminClient(), user.id, 'unlocked_avatar_specials', sp.id)
        }
        return ok
      }
      if (bgSpecial && !(await earned(bgSpecial)))         return { error: `${bgSpecial.label} not unlocked` }
      if (borderSpecial && !(await earned(borderSpecial))) return { error: `${borderSpecial.label} not unlocked` }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ avatar_bg_color: bg, avatar_border_color: border })
    .eq('id', user.id)
  if (error) return { error: 'Something went wrong. Please try again.' }
  return {}
}

/** Set the player's profile-page background. `null` clears it. A zone
 *  background requires the player's fishing level to meet that zone's
 *  minimum (validated server-side against fishing_xp). */
export async function updateProfileBg(bg: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  if (bg === null) {
    const { error } = await admin.from('profiles').update({ profile_bg: null }).eq('id', user.id)
    if (error) return { error: 'Something went wrong. Please try again.' }
    return {}
  }

  const def = getProfileBackground(bg)
  if (!def) return { error: 'Unknown background' }

  const { data: profile } = await admin.from('profiles').select('fishing_xp').eq('id', user.id).single()
  const level = getLevelFromXP(profile?.fishing_xp ?? 0)
  if (level < def.minLevel) return { error: `Unlocks at Level ${def.minLevel}` }

  const { error } = await admin.from('profiles').update({ profile_bg: bg }).eq('id', user.id)
  if (error) return { error: 'Something went wrong. Please try again.' }
  return {}
}

/** Purchase an animated avatar special (border or bg) with gems.
 *  Requires an active Premium membership AND enough gems. */
export async function purchaseAvatarSpecial(specialId: string): Promise<
  { gems: number; unlockedSpecials: string[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const special = AVATAR_SPECIALS.find(s => s.id === specialId)
  if (!special || special.gate || !special.gemPrice) return { error: 'Not for sale' }
  const gemPrice = special.gemPrice

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gems, unlocked_avatar_specials, is_premium, premium_expires_at')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  if (!isPremiumActive(profile)) return { error: 'Captain only. Become a Captain first' }

  const owned = (profile.unlocked_avatar_specials as string[] | null) ?? []
  if (owned.includes(specialId)) return { error: 'Already owned' }
  const balance = profile.gems ?? 0
  if (balance < gemPrice) return { error: `Need ${gemPrice.toLocaleString()} ◆` }

  // Spend first, in place, and let the result be the guard.
  const newGems = await spend(admin, user.id, 'gems', gemPrice)
  if (newGems === null) return { error: `Need ${gemPrice.toLocaleString()} ◆` }
  // A concurrent twin already added it: give this charge back.
  if (!(await arrayAdd(admin, user.id, 'unlocked_avatar_specials', specialId))) {
    await grant(admin, user.id, 'gems', gemPrice)
    return { error: 'Already owned' }
  }
  const newOwned = [...owned, specialId]
  await Promise.all([
    admin.from('gem_transactions').insert({
      user_id: user.id,
      amount: -gemPrice,
      reason: `Bought ${special.label} ${special.kind === 'border' ? 'border' : 'background'}`,
    }),
  ])

  return { gems: newGems, unlockedSpecials: newOwned }
}

export async function searchUsers(query: string): Promise<{ username: string }[]> {
  if (!query || query.length < 2) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('username')
    .ilike('username', `${query.toLowerCase()}%`)
    .limit(6)

  return (data ?? []).map(p => ({ username: p.username }))
}
