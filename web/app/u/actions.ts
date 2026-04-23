'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateUsername(username: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const clean = username.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) return { error: 'Username must be 3–20 characters: letters, numbers, underscores only.' }

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
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').ilike('username', clean).single()
  return { available: !data }
}

export async function updateShowcase(variantId: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: owned } = await admin
    .from('user_collection')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_variant_id', variantId)
    .limit(1)
    .single()
  if (!owned) return { error: 'You don\'t own that card.' }

  const { error } = await admin.from('profiles').update({ showcase_variant_id: variantId }).eq('id', user.id)
  if (error) return { error: 'Something went wrong.' }

  return {}
}

export async function searchUsers(query: string): Promise<{ username: string; showcaseVariant: unknown }[]> {
  if (!query || query.length < 2) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('username, showcase_variant_id')
    .ilike('username', `${query.toLowerCase()}%`)
    .limit(6)

  if (!data?.length) return []

  const results = await Promise.all(data.map(async (p) => {
    let variant = null
    if (p.showcase_variant_id) {
      const { data: cv } = await admin
        .from('card_variants')
        .select('variant_name, border_style, art_effect, drop_weight, cards(name, filename)')
        .eq('id', p.showcase_variant_id)
        .single()
      variant = cv
    }
    return { username: p.username, showcaseVariant: variant }
  }))

  return results
}
