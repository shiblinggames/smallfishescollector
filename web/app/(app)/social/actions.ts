'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface CrewMember {
  username: string
  fishingXP: number
  expeditionXP: number
  highestPerfectStreak: number
  species: number
  characterColor: string | null
  equippedHat: string | null
  avatarBg: string | null
  avatarBorder: string | null
}

const AVATAR_FIELDS = 'id, username, fishing_xp, expedition_xp, highest_perfect_streak, character_color, equipped_hat, avatar_bg_color, avatar_border_color'

type ProfileRow = {
  id: string
  username: string
  fishing_xp: number | null
  expedition_xp: number | null
  highest_perfect_streak: number | null
  character_color: string | null
  equipped_hat: string | null
  avatar_bg_color: string | null
  avatar_border_color: string | null
}

function toCrewMember(p: ProfileRow): CrewMember {
  return {
    username:             p.username,
    fishingXP:            p.fishing_xp ?? 0,
    expeditionXP:         p.expedition_xp ?? 0,
    highestPerfectStreak: p.highest_perfect_streak ?? 0,
    species:             0,
    characterColor:      p.character_color,
    equippedHat:         p.equipped_hat,
    avatarBg:            p.avatar_bg_color,
    avatarBorder:        p.avatar_border_color,
  }
}

/** Unique-species counts (one fish_collection row per species) for a set of
 *  user ids, in a single query. */
async function speciesCounts(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {}
  const { data } = await admin.from('fish_collection').select('user_id').in('user_id', ids)
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { user_id: string }[]) counts[r.user_id] = (counts[r.user_id] ?? 0) + 1
  return counts
}

export async function getCrew(): Promise<CrewMember[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()

  const { data: crewRows } = await admin
    .from('crew')
    .select('following_id')
    .eq('follower_id', user.id)
    .order('created_at', { ascending: false })

  const ids = (crewRows ?? []).map(r => r.following_id)
  if (!ids.length) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select(AVATAR_FIELDS)
    .in('id', ids)

  const byId = Object.fromEntries(((profiles ?? []) as ProfileRow[]).map(p => [p.id, p]))
  const species = await speciesCounts(admin, ids)
  return ids
    .map(id => byId[id])
    .filter(Boolean)
    .map(p => ({ ...toCrewMember(p), species: species[p.id] ?? 0 }))
}

export async function addCrewMember(targetUsername: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', targetUsername)
    .single()

  if (!target) return { error: 'User not found' }
  if (target.id === user.id) return { error: 'Cannot add yourself' }

  const { error } = await admin
    .from('crew')
    .insert({ follower_id: user.id, following_id: target.id })

  if (error && error.code !== '23505') return { error: 'Something went wrong' }

  revalidatePath('/tavern')
  return {}
}

export async function getNewFollowers(): Promise<CrewMember[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()

  // People who follow me
  const { data: followers } = await admin
    .from('crew')
    .select('follower_id')
    .eq('following_id', user.id)

  const followerIds = (followers ?? []).map(r => r.follower_id)
  if (!followerIds.length) return []

  // People I already follow back
  const { data: following } = await admin
    .from('crew')
    .select('following_id')
    .eq('follower_id', user.id)
    .in('following_id', followerIds)

  const alreadyFollowingIds = new Set((following ?? []).map(r => r.following_id))
  const notAddedBack = followerIds.filter(id => !alreadyFollowingIds.has(id))
  if (!notAddedBack.length) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select(AVATAR_FIELDS)
    .in('id', notAddedBack)

  return ((profiles ?? []) as ProfileRow[]).map(toCrewMember)
}

export async function removeCrewMember(targetUsername: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', targetUsername)
    .single()

  if (!target) return { error: 'User not found' }

  await admin
    .from('crew')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', target.id)

  revalidatePath('/tavern')
  return {}
}
