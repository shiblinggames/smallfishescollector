'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BADGE_MAP, MAX_EQUIPPED_BADGES } from '@/lib/badges'

export async function unlockBadge(badgeId: string): Promise<{ ok: true } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const current = (profile.unlocked_badges as string[]) ?? []
  if (current.includes(badgeId)) return { ok: true }

  await admin
    .from('profiles')
    .update({ unlocked_badges: [...current, badgeId] })
    .eq('id', user.id)

  return { ok: true }
}

export async function equipBadge(
  badgeId: string,
  slot: 0 | 1 | 2,
): Promise<{ equipped: string[] } | { error: string }> {
  if (!BADGE_MAP[badgeId]) return { error: 'Unknown badge' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_badges, equipped_badges')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const unlocked = (profile.unlocked_badges as string[]) ?? []
  if (!unlocked.includes(badgeId)) return { error: 'Badge not unlocked' }

  const equipped = [...((profile.equipped_badges as string[]) ?? [])]
  while (equipped.length < MAX_EQUIPPED_BADGES) equipped.push('')

  // Remove the badge from any other slot it's already in
  for (let i = 0; i < MAX_EQUIPPED_BADGES; i++) {
    if (equipped[i] === badgeId && i !== slot) equipped[i] = ''
  }
  equipped[slot] = badgeId

  await admin.from('profiles').update({ equipped_badges: equipped }).eq('id', user.id)
  return { equipped }
}

export async function unequipBadge(
  slot: 0 | 1 | 2,
): Promise<{ equipped: string[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('equipped_badges')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const equipped = [...((profile.equipped_badges as string[]) ?? [])]
  while (equipped.length < MAX_EQUIPPED_BADGES) equipped.push('')
  equipped[slot] = ''

  await admin.from('profiles').update({ equipped_badges: equipped }).eq('id', user.id)
  return { equipped }
}
