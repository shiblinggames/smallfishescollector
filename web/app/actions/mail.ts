'use server'

// Player mailbox actions. Mail is broadcast-only for v1 — every active row
// in mail_messages is visible to every authenticated player, and per-user
// state (read / claimed) lives in mail_reads. Admin compose is done by
// service-role INSERT (you tell Claude to send a row); a future admin UI
// would call the same insert with the service-role client.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ClaimMailErrorCode,
  ClaimMailResult,
  InboxResult,
  MailMessage,
} from '@/lib/mailTypes'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Fetch every non-expired mail message + this user's read/claim state for
 *  each one. Newest first. Caller renders the inbox sheet from this. */
export async function getInbox(): Promise<InboxResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { messages: [], unreadCount: 0 }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [{ data: msgRows }, { data: readRows }] = await Promise.all([
    admin.from('mail_messages')
      .select('id, subject, body, sender_label, attachment_doubloons, attachment_gems, created_at, expires_at')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      // Broadcasts have target_user_id IS NULL; targeted mail only
      // shows to its recipient. Service-role bypasses RLS so the filter
      // has to be explicit here.
      .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('mail_reads')
      .select('message_id, read_at, claimed_at')
      .eq('user_id', user.id),
  ])

  const readMap = new Map<string, { readAt: string; claimedAt: string | null }>()
  for (const r of ((readRows ?? []) as any[])) {
    readMap.set(r.message_id, { readAt: r.read_at, claimedAt: r.claimed_at })
  }

  const messages: MailMessage[] = ((msgRows ?? []) as any[]).map(m => {
    const r = readMap.get(m.id)
    return {
      id: m.id,
      subject: m.subject,
      body: m.body,
      senderLabel: m.sender_label,
      attachmentDoubloons: m.attachment_doubloons ?? 0,
      attachmentGems: m.attachment_gems ?? 0,
      createdAt: m.created_at,
      readAt: r?.readAt ?? null,
      claimedAt: r?.claimedAt ?? null,
    }
  })

  const unreadCount = messages.reduce((n, m) => n + (m.readAt ? 0 : 1), 0)
  return { messages, unreadCount }
}

/** Lightweight unread-count query for the Nav pip. Avoids pulling bodies
 *  on every page navigation. */
export async function getMailUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [{ data: msgs }, { data: reads }] = await Promise.all([
    admin.from('mail_messages')
      .select('id')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .or(`target_user_id.is.null,target_user_id.eq.${user.id}`),
    admin.from('mail_reads')
      .select('message_id')
      .eq('user_id', user.id),
  ])

  const readSet = new Set(((reads ?? []) as any[]).map(r => r.message_id as string))
  return ((msgs ?? []) as any[]).reduce((n: number, m: any) => n + (readSet.has(m.id) ? 0 : 1), 0)
}

/** Mark a single message read. Idempotent — upserts on (user_id, message_id)
 *  so calling this twice is a no-op. Preserves any existing claimed_at. */
export async function markMailRead(messageId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  // INSERT ... ON CONFLICT DO NOTHING — read_at only sets the first time;
  // subsequent calls just confirm the row exists without touching it (and
  // without nuking a non-null claimed_at).
  await admin.from('mail_reads')
    .upsert(
      { user_id: user.id, message_id: messageId, read_at: new Date().toISOString() },
      { onConflict: 'user_id,message_id', ignoreDuplicates: true },
    )
  return { ok: true }
}

/** Mark every visible message read. Used by the "Mark all read" action in
 *  the inbox header. */
export async function markAllMailRead(): Promise<{ ok: boolean; count: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, count: 0 }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [{ data: msgs }, { data: reads }] = await Promise.all([
    admin.from('mail_messages')
      .select('id')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .or(`target_user_id.is.null,target_user_id.eq.${user.id}`),
    admin.from('mail_reads')
      .select('message_id')
      .eq('user_id', user.id),
  ])

  const readSet = new Set(((reads ?? []) as any[]).map(r => r.message_id as string))
  const toMark = ((msgs ?? []) as any[])
    .map(m => m.id as string)
    .filter(id => !readSet.has(id))

  if (toMark.length === 0) return { ok: true, count: 0 }

  await admin.from('mail_reads')
    .upsert(
      toMark.map(id => ({ user_id: user.id, message_id: id, read_at: nowIso })),
      { onConflict: 'user_id,message_id', ignoreDuplicates: true },
    )
  return { ok: true, count: toMark.length }
}

/** Atomically claim the attachment on a mail message. Race-safe via the
 *  claim_mail RPC, which uses INSERT ... ON CONFLICT DO UPDATE WHERE
 *  claimed_at IS NULL so concurrent calls cleanly settle to one ok + one
 *  already_claimed. Returns the granted amounts AND the player's new
 *  totals so the client can patch the Nav currency widgets without a
 *  round-trip. */
export async function claimMailAttachment(messageId: string): Promise<ClaimMailResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_signed_in' }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_mail', { uid: user.id, mid: messageId })
  if (error || !data) return { ok: false, error: 'not_found' }

  const result = data as { ok?: boolean; error?: string; gems?: number; doubloons?: number }
  if (result.error) {
    const code: ClaimMailErrorCode =
      result.error === 'not_found' || result.error === 'no_attachment' || result.error === 'already_claimed'
        ? result.error
        : 'not_found'
    return { ok: false, error: code }
  }
  if (!result.ok) return { ok: false, error: 'not_found' }

  const gems = result.gems ?? 0
  const doubloons = result.doubloons ?? 0

  // Pull post-grant totals so the Nav widgets can patch instantly.
  const { data: profile } = await admin
    .from('profiles').select('gems, doubloons').eq('id', user.id).single()

  return {
    ok: true,
    gems,
    doubloons,
    newGems: (profile?.gems as number | null) ?? 0,
    newDoubloons: (profile?.doubloons as number | null) ?? 0,
  }
}
