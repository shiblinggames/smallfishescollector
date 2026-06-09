// Shared types for the mailbox. Kept out of `web/app/actions/mail.ts`
// because 'use server' files strip non-async exports at build (sync helpers
// AND interfaces both disappear silently — local tsc doesn't catch it).

export interface MailMessage {
  id: string
  subject: string
  body: string
  senderLabel: string
  attachmentDoubloons: number
  attachmentGems: number
  createdAt: string
  /** When this user first opened the message. null = unread. */
  readAt: string | null
  /** When this user claimed the attachment. null = unclaimed (or no
   *  attachment). */
  claimedAt: string | null
}

export interface InboxResult {
  messages: MailMessage[]
  unreadCount: number
}

export type ClaimMailErrorCode =
  | 'not_found'
  | 'no_attachment'
  | 'already_claimed'
  | 'not_signed_in'

export type ClaimMailResult =
  | { ok: true; gems: number; doubloons: number; newGems: number; newDoubloons: number }
  | { ok: false; error: ClaimMailErrorCode }
