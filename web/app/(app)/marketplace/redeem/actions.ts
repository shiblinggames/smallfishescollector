'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

export async function redeemCode(code: string): Promise<{ success: boolean; message: string; gemsGranted?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Not logged in.' }
  if (!await checkRateLimit(`redeem:${user.id}`, 5, 300)) return { success: false, message: 'Too many attempts. Try again in a few minutes.' }

  const normalized = code.trim().toUpperCase()
  if (!normalized) return { success: false, message: 'Enter a code.' }

  const admin = createAdminClient()

  // Atomic claim: only succeeds if redeemed_by is still null
  const { data: row, error: fetchErr } = await admin
    .from('redemption_codes')
    .select('id, redeemed_by, packs_granted')
    .eq('code', normalized)
    .single()

  if (fetchErr || !row) return { success: false, message: 'Code not found. Double-check and try again.' }
  if (row.redeemed_by) return { success: false, message: 'This code has already been redeemed.' }

  // Update only if redeemed_by is still null — prevents race condition
  const { data: claimed, error: claimErr } = await admin
    .from('redemption_codes')
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('redeemed_by', null)
    .select('id')

  if (claimErr || !claimed || claimed.length === 0) return { success: false, message: 'This code has already been redeemed.' }

  // Packs are retired: a code's pack count pays out as gems (100 each).
  const gemsGranted = row.packs_granted * 100

  // Atomic increment — no read-modify-write race
  await admin.rpc('increment_gems', { user_id: user.id, amount: gemsGranted })

  return { success: true, message: `✦ ${gemsGranted.toLocaleString()} gems added to your account.`, gemsGranted }
}
