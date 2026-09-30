'use server'

// ── THE FREE RECALL HOME (Kong, 2026-09-27: players asked for one) ──────────
//
// Once per sea day/night cycle (48 minutes), per side: the fishing side takes
// you to your Homestead, the expedition side to the Gunwharf. The cooldown is
// the server's, one conditional write in lib/core/sea. The action checks the
// session and hands the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { spendRecall as spendCore } from '@/lib/core/sea'
import type { RecallSide } from '@/lib/seaRecall'

export async function spendRecall(side: RecallSide): Promise<{ ok: true; at: string } | { ok: false; readyAt: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, readyAt: null }
  return spendCore(seaData(createAdminClient()), user.id, side)
}
