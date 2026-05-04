'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function redeemCode(code: string): Promise<{ success: boolean; message: string; packsGranted?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Not logged in.' }

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
  const { count, error: claimErr } = await admin
    .from('redemption_codes')
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('redeemed_by', null)
    .select('id', { count: 'exact', head: true })

  if (claimErr || count === 0) return { success: false, message: 'This code has already been redeemed.' }

  // Atomic increment — no read-modify-write race
  await admin.rpc('increment_packs', { user_id: user.id, amount: row.packs_granted })

  return { success: true, message: `✦ ${row.packs_granted} pack${row.packs_granted > 1 ? 's' : ''} added to your account.`, packsGranted: row.packs_granted }
}
