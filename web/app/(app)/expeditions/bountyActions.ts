'use server'

// THE BOUNTY BOARD's actions. Each checks the session and hands
// lib/core/bounties the Supabase store; the meters, the claim guards and the
// swap live there, so the desktop build runs the same code against its save.
//
// logBountyEvent lives in lib/bountyEvents.ts. As an export of this 'use
// server' file it was a public endpoint taking any user id.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dailyData } from '@/lib/data/dailyData'
import * as core from '@/lib/core/bounties'
import type { BountyBoard, ClaimResult, MilestoneResult, RerollResult } from '@/lib/core/bounties'

export type { BountyBoard, BountyView, ClaimResult, MilestoneResult, RerollResult } from '@/lib/core/bounties'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => dailyData(createAdminClient())

export async function getBountyBoard(): Promise<BountyBoard> {
  // A read of the caller's own board: the verified session is enough to name them.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  const uid = session?.user?.id
  if (!uid) return core.SHUT_BOARD
  return core.getBountyBoard(db(), uid)
}

export async function claimBounty(bountyId: string): Promise<ClaimResult> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimBounty(db(), uid, bountyId)
}

export async function claimBountyMilestone(): Promise<MilestoneResult> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimBountyMilestone(db(), uid)
}

export async function rerollBounty(bountyId: string): Promise<RerollResult> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.rerollBounty(db(), uid, bountyId)
}

export async function markBountyRungSeen(chapter: number): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markBountyRungSeen(db(), uid, chapter)
}
