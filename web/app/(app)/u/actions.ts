'use server'

// THE CAPTAIN'S NAME AND LOOKS. Each action checks the session and hands
// lib/core/profile the Supabase store; the rules (the profanity check, the
// gates, the spend-first purchases) live there. The pages that show a name or
// a skin are revalidated here.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { progressData } from '@/lib/data/progressData'
import * as core from '@/lib/core/profile'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => progressData(createAdminClient())

export async function updateUsername(username: string): Promise<{ error?: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.updateUsername(db(), uid, username)
  if (!res.error) revalidatePath('/u/' + username.trim().toLowerCase())
  return res
}

export async function checkUsername(username: string): Promise<{ available: boolean }> {
  return core.checkUsername(db(), username)
}

export async function updateShowcaseCrew(crewIds: number[]): Promise<{ error?: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.updateShowcaseCrew(db(), uid, crewIds)
  revalidatePath('/profile')
  return res
}

export async function purchaseCharacterColor(colorId: string): Promise<
  { doubloons: number; gems: number; unlockedColors: string[] } | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.purchaseCharacterColor(db(), uid, colorId)
}

export async function updateCharacterColor(colorId: string, opts?: { quiet?: boolean }): Promise<{ error?: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.updateCharacterColor(db(), uid, colorId)
  // The skin is the captain on the chart, so /sea's cached render is now wrong.
  // Quiet when the chart itself asked: the sprite has already changed on screen.
  if (!res.error && !opts?.quiet) revalidatePath('/sea')
  return res
}

/** Store earned-but-ungranted skins; returns the ids granted. */
export async function persistEarnedSkins(ids: string[]): Promise<{ granted: string[] }> {
  const uid = await me()
  if (!uid) return { granted: [] }
  return core.persistEarnedSkins(db(), uid, ids)
}

/** Store earned-but-ungranted achievement boats; returns the ids granted. */
export async function persistEarnedBoats(ids: string[]): Promise<{ granted: string[] }> {
  const uid = await me()
  if (!uid) return { granted: [] }
  return core.persistEarnedBoats(db(), uid, ids)
}

/** The avatar's background and border. */
export async function updateAvatarColors(input: {
  bgColor: string | null
  borderColor: string | null
}): Promise<{ error?: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.updateAvatarColors(db(), uid, input)
}

/** The profile-page background (null clears it). */
export async function updateProfileBg(bg: string | null): Promise<{ error?: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.updateProfileBg(db(), uid, bg)
}

/** Buy an animated avatar special with gems (Captains only). */
export async function purchaseAvatarSpecial(specialId: string): Promise<
  { gems: number; unlockedSpecials: string[] } | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.purchaseAvatarSpecial(db(), uid, specialId)
}

export async function searchUsers(query: string): Promise<{ username: string }[]> {
  return core.searchUsers(db(), query)
}
