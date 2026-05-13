'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { CHARACTER_COLORS } from '@/lib/characters'
import { AVATAR_PALETTE } from '@/lib/avatarColors'

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
  revalidatePath('/collection')
  return {}
}

export async function checkUsername(username: string): Promise<{ available: boolean }> {
  const clean = username.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) return { available: false }
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').ilike('username', clean).single()
  return { available: !data }
}

export async function updateShowcase(variantIds: number[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const ids = variantIds.slice(0, 5)

  if (ids.length > 0) {
    const admin = createAdminClient()
    const { data: owned } = await admin
      .from('user_collection')
      .select('card_variant_id')
      .eq('user_id', user.id)
      .in('card_variant_id', ids)
    const ownedIds = new Set((owned ?? []).map((r: any) => r.card_variant_id))
    if (!ids.every(id => ownedIds.has(id))) return { error: 'You don\'t own one of those cards.' }

    const { error } = await admin.from('profiles').update({ showcase_variant_ids: ids }).eq('id', user.id)
    if (error) return { error: 'Something went wrong.' }
  } else {
    const admin = createAdminClient()
    const { error } = await admin.from('profiles').update({ showcase_variant_ids: null }).eq('id', user.id)
    if (error) return { error: 'Something went wrong.' }
  }

  revalidatePath('/collection')
  return {}
}

export async function updateCharacterColor(colorId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const color = CHARACTER_COLORS.find(c => c.id === colorId)
  if (!color) return { error: 'Invalid color' }

  const admin = createAdminClient()

  if (!color.free) {
    const { data: profile } = await admin.from('profiles').select('unlocked_character_colors').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_character_colors as string[] | null) ?? []
    if (!unlocked.includes(colorId)) return { error: 'Color not unlocked' }
  }

  await admin.from('profiles').update({ character_color: colorId }).eq('id', user.id)
  return {}
}

/** Save the player's avatar background + border color choices. Either field
 *  can be null (= use the default from lib/avatarColors). Hex values are
 *  validated against AVATAR_PALETTE so users can't store arbitrary CSS. */
export async function updateAvatarColors(input: {
  bgColor: string | null
  borderColor: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const validHexes = new Set(AVATAR_PALETTE.map(c => c.hex))
  const bg     = input.bgColor === null     ? null : (validHexes.has(input.bgColor)     ? input.bgColor     : null)
  const border = input.borderColor === null ? null : (validHexes.has(input.borderColor) ? input.borderColor : null)
  // If the user passed something we didn't recognize, drop to null (default)
  // rather than rejecting outright — keeps the picker forgiving.

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ avatar_bg_color: bg, avatar_border_color: border })
    .eq('id', user.id)
  if (error) return { error: 'Something went wrong. Please try again.' }
  return {}
}

export async function searchUsers(query: string): Promise<{ username: string; showcaseVariant: unknown }[]> {
  if (!query || query.length < 2) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('username, showcase_variant_ids')
    .ilike('username', `${query.toLowerCase()}%`)
    .limit(6)

  if (!data?.length) return []

  const results = await Promise.all(data.map(async (p) => {
    let variant = null
    const ids: number[] = p.showcase_variant_ids ?? []
    if (ids.length > 0) {
      const { data: cv } = await admin
        .from('card_variants')
        .select('variant_name, border_style, art_effect, drop_weight, cards(name, filename)')
        .eq('id', ids[0])
        .single()
      variant = cv
    }
    return { username: p.username, showcaseVariant: variant }
  }))

  return results
}
