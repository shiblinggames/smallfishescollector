'use server'

// Player mailbox actions. Mail is broadcast plus targeted: every visible row in
// mail_messages, per-user state (read / claimed) in mail_reads. Admin compose
// is a service-role INSERT. Each action checks the session and hands
// lib/core/dailies the Supabase store with the account's join time.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dailyData } from '@/lib/data/dailyData'
import * as core from '@/lib/core/dailies'
import type { ClaimMailResult, InboxResult } from '@/lib/mailTypes'

/** The signed-in captain and when their account was made, normalized to a
 *  PostgREST-safe ISO string (Z, no +offset). Falls back to the epoch if
 *  somehow absent (sees all, the old behavior). */
async function me(): Promise<{ uid: string; joinedAt: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { uid: user.id, joinedAt: user.created_at ? new Date(user.created_at).toISOString() : new Date(0).toISOString() }
}
const db = () => dailyData(createAdminClient())

/** Every non-expired message + this user's read/claim state. Newest first. */
export async function getInbox(): Promise<InboxResult> {
  const who = await me()
  if (!who) return { messages: [], unreadCount: 0 }
  return core.getInbox(db(), who.uid, who.joinedAt)
}

/** Lightweight unread count for the Nav pip. */
export async function getMailUnreadCount(): Promise<number> {
  const who = await me()
  if (!who) return 0
  return core.getMailUnreadCount(db(), who.uid, who.joinedAt)
}

/** Mark a single message read. Idempotent; keeps any existing claim. */
export async function markMailRead(messageId: string): Promise<{ ok: boolean }> {
  const who = await me()
  if (!who) return { ok: false }
  return core.markMailRead(db(), who.uid, messageId)
}

/** Mark every visible message read ("Mark all read" in the inbox header). */
export async function markAllMailRead(): Promise<{ ok: boolean; count: number }> {
  const who = await me()
  if (!who) return { ok: false, count: 0 }
  return core.markAllMailRead(db(), who.uid, who.joinedAt)
}

/** Claim the attachment on a message, once (the claim_mail RPC settles a race
 *  to one ok and one already_claimed). */
export async function claimMailAttachment(messageId: string): Promise<ClaimMailResult> {
  const who = await me()
  if (!who) return { ok: false, error: 'not_signed_in' }
  return core.claimMailAttachment(db(), who.uid, messageId)
}
