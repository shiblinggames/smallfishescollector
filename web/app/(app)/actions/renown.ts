'use server'

// Server-authoritative Renown: the derived level, the persisted allocations,
// spending and committing points, a respec, and buying a respec token. Each
// action checks the session and hands lib/core/progress the Supabase store.
// The effects themselves apply at the fishing / raid / gauntlet reward paths.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { progressData } from '@/lib/data/progressData'
import * as core from '@/lib/core/progress'
import type { RenownState } from '@/lib/core/progress'
import type { RenownSkill, RenownAlloc } from '@/lib/renown'

export type { RenownState } from '@/lib/core/progress'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => progressData(createAdminClient())

export async function getRenownState(skill: RenownSkill): Promise<RenownState | null> {
  const uid = await me()
  if (!uid) return null
  return core.getRenownState(db(), uid, skill)
}

/** Mark the one-time "meet Renown" intro seen for a skill. */
export async function markRenownIntroSeen(skill: RenownSkill): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markRenownIntroSeen(db(), uid, skill)
}

/** Spend one banked Renown point on a stat. */
export async function allocateRenown(skill: RenownSkill, statId: string): Promise<RenownState | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in.' }
  return core.allocateRenown(db(), uid, skill, statId)
}

/** Commit a whole draft of allocations at once. */
export async function commitRenown(skill: RenownSkill, delta: RenownAlloc): Promise<RenownState | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in.' }
  return core.commitRenown(db(), uid, skill, delta)
}

/** Spend one respec token to clear one board. */
export async function respecRenown(skill: RenownSkill): Promise<RenownState | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in.' }
  return core.respecRenown(db(), uid, skill)
}

/** Buy one respec token for gems. */
export async function buyRenownRespec(skill: RenownSkill): Promise<RenownState | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in.' }
  return core.buyRenownRespec(db(), uid, skill)
}
