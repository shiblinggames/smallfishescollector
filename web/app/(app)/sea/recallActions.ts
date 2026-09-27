'use server'

// ── THE FREE RECALL HOME (Kong, 2026-09-27: players asked for one) ──────────
//
// Once per sea day/night cycle (48 minutes), per side: the fishing side takes
// you to your Homestead, the expedition side to the Gunwharf where the ship is
// kept. Kong chose to let it land beside the full-price market (option 1): the
// cooldown is the limit, and selling on the water still matters the rest of
// the time.
//
// The cooldown is the server's. The stamp is written by ONE conditional update
// that only matches when the last use is older than the cycle, so two presses
// cannot both go through and a reloaded tab cannot reset it.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RECALL_MS, type RecallSide } from '@/lib/seaRecall'

const COL: Record<RecallSide, 'last_recall_fish_at' | 'last_recall_exp_at'> = {
  fishing: 'last_recall_fish_at',
  expedition: 'last_recall_exp_at',
}

export async function spendRecall(side: RecallSide): Promise<{ ok: true; at: string } | { ok: false; readyAt: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, readyAt: null }
  const col = COL[side]
  if (!col) return { ok: false, readyAt: null }

  const now = new Date()
  const cutoff = new Date(now.getTime() - RECALL_MS).toISOString()
  const admin = createAdminClient()
  const { data } = await admin.from('profiles')
    .update({ [col]: now.toISOString() })
    .eq('id', user.id)
    .or(`${col}.is.null,${col}.lt.${cutoff}`)
    .select('id')
  if (data && data.length > 0) return { ok: true, at: now.toISOString() }

  const { data: prof } = await admin.from('profiles').select(col).eq('id', user.id).single()
  const last = (prof as Record<string, string | null> | null)?.[col] ?? null
  return { ok: false, readyAt: last ? new Date(new Date(last).getTime() + RECALL_MS).toISOString() : null }
}
