// ── THE DAILY LOOP'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// Bounties, the daily challenges, the Daily Haul (gems, bait, the weekly
// crate), the mailbox and the contests. Built on the raid store: a bounty
// reads which raids are cleared, and a Master challenge or weekly crate pays
// through the crate loot table, which wants the purse and the owned lists.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - claimDailyFlag flips a challenge (or the sweep) only if it is not already
//     true;
//   - stampIfNew stamps a daily or weekly claim only if it is not already that
//     day's (or week's);
//   - claimBountySlot pays each order once, swapBounty spends the day's one
//     swap once, and the milestone rung moves through updateProfileIf;
//   - claimMail pays an attachment once.

import type { Db, Row } from './common'
import { raidData, type RaidData } from './raidData'
import type { ChallengeOverride } from '@/lib/dailyChallenges'
import type { MailMessage } from '@/lib/mailTypes'
import { CONTESTS, type ContestView, type ContestStanding } from '@/lib/contests'
import { getAchievementPointsBoard } from '@/lib/achievementPoints'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DailyClaimRow = {
  p1: number | null; p2: number | null; p3: number | null; p4: number | null
  claimed_1: boolean | null; claimed_2: boolean | null; claimed_3: boolean | null; claimed_4: boolean | null
  claimed_bonus: boolean | null; fishing_level_snapshot: number | null
}
export type DailyFlag = 'claimed_1' | 'claimed_2' | 'claimed_3' | 'claimed_4' | 'claimed_bonus'

/** One captain's bounty board as filed. */
export type BountyRow = {
  date: string
  bounty_ids: string[]
  baselines: Record<string, number>
  claimed: boolean[]
  assigned_at: string
  reroll_used: boolean
}

/** Everything the bounty meters read since the board was set. */
export type BountySignals = {
  raids: { raid_id: string; elapsed_ms: number | null }[]
  /** Rows, not a count: the haul and route meters need what each one brought back. */
  voyages: { total_doubloons: number | null; route: string | null }[]
  events: { kind: string; value: number }[]
}

/** What claiming a mail attachment came to, as the claim_mail RPC reports it. */
export type MailClaim = { ok?: boolean; error?: string; gems?: number; doubloons?: number }

export interface DailyData extends RaidData {
  // ── The daily challenges ──
  /** The admin override pinning a day's challenges, or null. */
  challengeOverride(date: string): Promise<ChallengeOverride | null>
  /** Today's progress and claims, or null before the first touch. */
  dailyRow(uid: string, date: string): Promise<DailyClaimRow | null>
  /** Pin the day's level snapshot (the row is made if it is not there). */
  pinDailySnapshot(uid: string, date: string, level: number): Promise<void>
  /** Flip one claim flag if it is not already true. True for exactly one caller. */
  claimDailyFlag(uid: string, date: string, flag: DailyFlag): Promise<boolean>

  // ── The Daily Haul ──
  /** Stamp `col` with `value` unless it already holds it. The captain's
   *  membership fields if this call stamped it, else null. */
  stampIfNew(uid: string, col: string, value: string): Promise<Row | null>

  // ── Bounties ──
  bountyBoard(uid: string): Promise<BountyRow | null>
  /** File a fresh board (replacing the old one). */
  setBountyBoard(uid: string, row: BountyRow): Promise<void>
  /** Keep the outgoing board in the history. Never blocks play. */
  archiveBountyBoard(uid: string, row: BountyRow): Promise<void>
  /** Flip one order's claimed slot on the day's board. True for exactly one caller. */
  claimBountySlot(uid: string, slot: number, date: string): Promise<boolean>
  /** Swap an order on the day's board if the day's swap is unused. True if it landed. */
  swapBounty(uid: string, date: string, patch: { bounty_ids: string[]; baselines: Record<string, number> }): Promise<boolean>
  bountySignals(uid: string, since: string): Promise<BountySignals>
  /** Raise the last rung announced; never lowers it. */
  raiseBountyRungSeen(uid: string, chapter: number): Promise<void>

  // ── Mail ──
  /** Every live message this captain can see, newest first, with its read and
   *  claim state. `joinedAt` is when the account was made (older broadcasts
   *  that are not evergreen stay out). */
  inbox(uid: string, joinedAt: string): Promise<MailMessage[]>
  /** Ids of the live messages this captain can see, and of those already read. */
  mailIds(uid: string, joinedAt: string): Promise<{ visible: string[]; read: string[] }>
  /** Mark these read (a message already read keeps its first read time). */
  markMailRead(uid: string, ids: string[]): Promise<void>
  /** Pay a message's attachment once. */
  claimMail(uid: string, messageId: string): Promise<MailClaim | null>

  // ── Contests ──
  /** Each contest's winner and live top three. */
  contestsView(uid: string): Promise<Record<string, ContestView>>
}

// PostgREST visibility filter (service-role bypasses RLS, so it's explicit).
// A row is visible if it's targeted to this user, OR it's a broadcast that is
// either evergreen (onboarding mail shown to everyone) or was sent on/after the
// player joined. The join cutoff is what stops a brand-new player from seeing,
// and claiming, every historical broadcast. Mirrored in claim_mail.
function mailVisibilityFilter(userId: string, joinIso: string): string {
  return `target_user_id.eq.${userId},and(target_user_id.is.null,or(evergreen.is.true,created_at.gte.${joinIso}))`
}

type AvatarRow = {
  username: string | null
  character_color: string | null
  equipped_hat: string | null
  avatar_bg_color: string | null
  avatar_border_color: string | null
  [k: string]: unknown
}

/** DailyData over Supabase. */
export function dailyData(admin: Db): DailyData {
  const nowIso = () => new Date().toISOString()
  return {
    ...raidData(admin),

    async challengeOverride(date) {
      const { data } = await admin.from('challenge_overrides').select('tier1, tier2, tier3').eq('date', date).maybeSingle()
      return (data as ChallengeOverride | null) ?? null
    },
    async dailyRow(uid, date) {
      const { data } = await admin.from('daily_challenge_progress')
        .select('p1, p2, p3, p4, claimed_1, claimed_2, claimed_3, claimed_4, claimed_bonus, fishing_level_snapshot')
        .eq('user_id', uid).eq('date', date).maybeSingle()
      return (data as DailyClaimRow | null) ?? null
    },
    async pinDailySnapshot(uid, date, level) {
      await admin.from('daily_challenge_progress')
        .upsert({ user_id: uid, date, fishing_level_snapshot: level }, { onConflict: 'user_id,date' })
    },
    async claimDailyFlag(uid, date, flag) {
      // Matching not-yet-true (false OR null): only the winner of a concurrent
      // double-fire gets a row back.
      const { data } = await admin.from('daily_challenge_progress')
        .update({ [flag]: true })
        .eq('user_id', uid).eq('date', date).not(flag, 'is', true)
        .select('user_id').maybeSingle()
      return !!data
    },

    async stampIfNew(uid, col, value) {
      const { data } = await admin.from('profiles').update({ [col]: value })
        .eq('id', uid)
        .or(`${col}.is.null,${col}.neq.${value}`)
        .select('is_premium, premium_expires_at')
      return (data?.[0] as Row | undefined) ?? null
    },

    async bountyBoard(uid) {
      const { data } = await admin.from('bounty_progress').select('*').eq('user_id', uid).maybeSingle()
      return (data as BountyRow | null) ?? null
    },
    async setBountyBoard(uid, row) {
      await admin.from('bounty_progress').upsert({ user_id: uid, ...row, updated_at: row.assigned_at }, { onConflict: 'user_id' })
    },
    async archiveBountyBoard(uid, row) {
      void admin.from('bounty_board_history').upsert({
        user_id: uid,
        date: row.date,
        bounty_ids: row.bounty_ids,
        claimed: row.claimed ?? [],
        slots: (row.bounty_ids ?? []).length,
        reroll_used: row.reroll_used === true,
      }, { onConflict: 'user_id,date' })
    },
    async claimBountySlot(uid, slot, date) {
      // Test and flip are the SAME statement inside claim_bounty_slot.
      const { data } = await admin.rpc('claim_bounty_slot', { uid, slot, today: date })
      return data === true
    },
    async swapBounty(uid, date, patch) {
      const { data, error } = await admin.from('bounty_progress')
        .update({ ...patch, reroll_used: true, updated_at: nowIso() })
        .eq('user_id', uid).eq('date', date).eq('reroll_used', false)
        .select('user_id')
      return !error && !!data && data.length > 0
    },
    async bountySignals(uid, since) {
      const [raidsRes, voyRes, evRes] = await Promise.all([
        admin.from('raid_completions').select('raid_id, elapsed_ms').eq('user_id', uid).gte('completed_at', since),
        admin.from('daily_voyages').select('total_doubloons, route').eq('user_id', uid).eq('status', 'revealed').gte('created_at', since),
        admin.from('bounty_events').select('kind, value').eq('user_id', uid).gte('created_at', since),
      ])
      return {
        raids: (raidsRes.data ?? []) as BountySignals['raids'],
        voyages: (voyRes.data ?? []) as BountySignals['voyages'],
        events: (evRes.data ?? []) as BountySignals['events'],
      }
    },
    async raiseBountyRungSeen(uid, chapter) {
      await admin.from('profiles').update({ bounty_rung_seen: chapter }).eq('id', uid).lt('bounty_rung_seen', chapter)
    },

    async inbox(uid, joinedAt) {
      const [{ data: msgRows }, { data: readRows }] = await Promise.all([
        admin.from('mail_messages')
          .select('id, subject, body, sender_label, image_url, attachment_doubloons, attachment_gems, created_at, expires_at')
          .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
          .or(mailVisibilityFilter(uid, joinedAt))
          .order('created_at', { ascending: false })
          .limit(100),
        admin.from('mail_reads').select('message_id, read_at, claimed_at').eq('user_id', uid),
      ])
      const readMap = new Map<string, { readAt: string; claimedAt: string | null }>()
      for (const r of ((readRows ?? []) as any[])) readMap.set(r.message_id, { readAt: r.read_at, claimedAt: r.claimed_at })
      return ((msgRows ?? []) as any[]).map(m => {
        const r = readMap.get(m.id)
        return {
          id: m.id,
          subject: m.subject,
          body: m.body,
          senderLabel: m.sender_label,
          imageUrl: m.image_url ?? null,
          attachmentDoubloons: m.attachment_doubloons ?? 0,
          attachmentGems: m.attachment_gems ?? 0,
          createdAt: m.created_at,
          readAt: r?.readAt ?? null,
          claimedAt: r?.claimedAt ?? null,
        }
      })
    },
    async mailIds(uid, joinedAt) {
      const [{ data: msgs }, { data: reads }] = await Promise.all([
        admin.from('mail_messages').select('id')
          .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
          .or(mailVisibilityFilter(uid, joinedAt)),
        admin.from('mail_reads').select('message_id').eq('user_id', uid),
      ])
      return {
        visible: ((msgs ?? []) as any[]).map(m => m.id as string),
        read: ((reads ?? []) as any[]).map(r => r.message_id as string),
      }
    },
    async markMailRead(uid, ids) {
      if (!ids.length) return
      // INSERT ... ON CONFLICT DO NOTHING: read_at only sets the first time, and
      // a non-null claimed_at is never touched.
      const at = nowIso()
      await admin.from('mail_reads').upsert(
        ids.map(id => ({ user_id: uid, message_id: id, read_at: at })),
        { onConflict: 'user_id,message_id', ignoreDuplicates: true },
      )
    },
    async claimMail(uid, messageId) {
      const { data, error } = await admin.rpc('claim_mail', { uid, mid: messageId })
      if (error || !data) return null
      return data as MailClaim
    },

    async contestsView() {
      const out: Record<string, ContestView> = {}
      for (const c of CONTESTS) {
        // Winner: the single atomic row in `contests`.
        const { data: winRow } = await admin.from('contests').select('winner_user_id, won_at').eq('contest_id', c.id).maybeSingle()
        let winner: ContestView['winner'] = null
        if (winRow) {
          const { data: wp } = await admin.from('profiles')
            .select('username, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
            .eq('id', (winRow as { winner_user_id: string }).winner_user_id).single()
          const p = wp as AvatarRow | null
          if (p) {
            winner = {
              username: p.username ?? 'A captain',
              characterColor: p.character_color,
              equippedHat: p.equipped_hat,
              avatarBg: p.avatar_bg_color,
              avatarBorder: p.avatar_border_color,
              wonAt: (winRow as { won_at: string }).won_at,
            }
          }
        }

        // Live standings: top 3 chasing the goal (board-backed contests only).
        let standings: ContestStanding[] = []
        if (c.board?.computed === 'achievement_points') {
          // Live-computed board (not a profiles column): the population-wide
          // achievement-points ranking, then avatar fields for the top 3.
          const board = await getAchievementPointsBoard('')
          const top3 = board.top.slice(0, 3)
          if (top3.length > 0) {
            const { data: av } = await admin.from('profiles')
              .select('id, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
              .in('id', top3.map(r => r.user_id))
            const byId = new Map(((av ?? []) as Array<AvatarRow & { id: string }>).map(a => [a.id, a]))
            standings = top3.map((r, i) => {
              const a = byId.get(r.user_id)
              return {
                username: a?.username ?? r.username ?? 'A captain',
                characterColor: a?.character_color ?? null,
                equippedHat: a?.equipped_hat ?? null,
                avatarBg: a?.avatar_bg_color ?? null,
                avatarBorder: a?.avatar_border_color ?? null,
                score: r.score,
                rank: i + 1,
              }
            })
          }
        } else if (c.board?.statColumn && c.board.tiebreakColumn) {
          const stat = c.board.statColumn
          const tiebreak = c.board.tiebreakColumn
          const { data: rows } = await admin.from('profiles')
            .select(`username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, ${stat}`)
            .gt(stat, 0)
            .not('username', 'is', null)
            .eq('is_admin', false)
            .order(stat, { ascending: false })
            .order(tiebreak, { ascending: true, nullsFirst: false })
            .limit(3)
          standings = ((rows ?? []) as unknown as AvatarRow[]).map((r, i) => ({
            username: r.username ?? 'A captain',
            characterColor: r.character_color,
            equippedHat: r.equipped_hat,
            avatarBg: r.avatar_bg_color,
            avatarBorder: r.avatar_border_color,
            score: Number(r[stat] ?? 0),
            rank: i + 1,
          }))
        }
        out[c.id] = { winner, standings }
      }
      return out
    },
  }
}
