'use server'

// ── WHAT THE BOSS CARD NEEDS, FOR A CAPTAIN WHO SAILED UP TO ONE ────────────
//
// The card is BossFightModal, the same component /expeditions uses, so it takes
// the same inputs from the node map's own read. The read lives in
// lib/core/seaSheets.

import { getCurrentUser } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import { bossCardState as cardCore, type BossCardState } from '@/lib/core/seaSheets'

export type { BossCardState } from '@/lib/core/seaSheets'

export async function bossCardState(): Promise<BossCardState | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }
  return cardCore(seaData(createAdminClient()), user.id)
}
