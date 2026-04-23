'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface CrewMember {
  username: string
  fotdStreak: number
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
    .select('id, username, fotd_streak')
    .in('id', ids)

  const byId = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  return ids
    .map(id => byId[id])
    .filter(Boolean)
    .map(p => ({ username: p.username, fotdStreak: p.fotd_streak ?? 0 }))
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

  revalidatePath('/social')
  return {}
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

  revalidatePath('/social')
  return {}
}
