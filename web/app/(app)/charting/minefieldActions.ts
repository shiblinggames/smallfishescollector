'use server'

// The Minefield: server-authoritative play. The mine layout lives only in the
// store; every reveal is judged and flood-filled in lib/core/chartRoom. Each
// action checks the session and hands the core the Supabase store.

import { getCurrentUser } from '@/lib/userData'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chartData } from '@/lib/data/chartData'
import * as core from '@/lib/core/chartRoom'
import type { MinefieldState, RevealResult } from './minefieldConstants'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getMinefieldState(): Promise<MinefieldState | { error: string }> {
  // ONE verification per request, shared. See lib/userData.
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }
  return core.getMinefieldState(chartData(createAdminClient()), user.id)
}

export async function revealCell(index: number): Promise<RevealResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.revealCell(chartData(createAdminClient()), uid, index)
}

export async function toggleFlag(index: number): Promise<{ flagged: number[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.toggleFlag(chartData(createAdminClient()), uid, index)
}
