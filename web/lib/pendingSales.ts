// Settles the old delayed-sale lane. Lives outside the 'use server' market
// actions on purpose: every export of a 'use server' file is a public
// endpoint, and this one takes a user id straight from its caller.
//
// Server only: uses the admin client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { grant } from '@/lib/wallet'

// Settles all matured pending sales for a user. Returns total newly credited.
// Safe to call from any profile-reading path (server components, server actions).
export async function settlePendingSales(
  userId: string,
  admin?: SupabaseClient,
): Promise<number> {
  const db = admin ?? createAdminClient()
  const nowIso = new Date().toISOString()

  // Delete first and pay from the rows that actually came back, so two
  // settles racing each other cannot both pay the same row.
  const { data: matured } = await db
    .from('pending_sales')
    .delete()
    .eq('user_id', userId)
    .lte('settles_at', nowIso)
    .select('id, amount')

  if (!matured || matured.length === 0) return 0

  const totalCredit = matured.reduce((s, r) => s + (r.amount ?? 0), 0)
  if (totalCredit <= 0) return 0

  await Promise.all([
    grant(db, userId, 'doubloons', totalCredit),
    db.from('doubloon_transactions').insert({
      user_id: userId,
      amount: totalCredit,
      reason: `Pending sale${matured.length === 1 ? '' : 's'} settled`,
    }),
    db.rpc('bump_profile_stat', { uid: userId, col: 'fish_sold_doubloons', n: totalCredit }),
  ])

  return totalCredit
}
