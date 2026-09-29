// ── THE DAILY LOOP OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// DailyData over one captain's save, spreading the raid store's. Every one-shot
// the web keeps is kept here: a challenge flag or the sweep flips once, a daily
// or weekly stamp lands once, a bounty slot pays once and only on the day's
// board, the day's swap is spent once, and a mail attachment is paid once.
//
// What is shared on the web is the captain's own offline. The mailbox holds the
// letters the game itself sends (there is no one else to write); the contests
// show this captain as the winner of any they won, and their own score as the
// standings.

import type { DailyData, DailyClaimRow, BountyRow } from '../dailyData'
import { localRaidData } from './raidLocal'
import { localCaptain, type LocalSave } from './save'
import { clockNow } from '@/lib/clock'
import { CONTESTS, type ContestView, type ContestStanding } from '@/lib/contests'

/** Boards kept in the history. */
const KEEP_BOARDS = 60

/** DailyData over one captain's local save. */
export function localDailyData(save: LocalSave): DailyData {
  const raid = localRaidData(save)
  const captain = localCaptain(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  const iso = () => new Date(clockNow()).toISOString()
  const dayRow = (date: string) => save.daily[date] as unknown as Partial<DailyClaimRow> | undefined
  // The game's own letters never expire.
  const liveMail = () => save.mail

  return {
    ...raid,

    // ── The daily challenges ──
    async challengeOverride(date) { return save.overrides[date] ?? null },
    async dailyRow(uid, date) {
      me(uid)
      const r = dayRow(date)
      return r ? { p1: null, p2: null, p3: null, p4: null, claimed_1: null, claimed_2: null, claimed_3: null, claimed_4: null, claimed_bonus: null, fishing_level_snapshot: null, ...r } : null
    },
    async pinDailySnapshot(uid, date, level) {
      me(uid)
      const r = dayRow(date)
      save.daily[date] = { ...(r ?? { p1: null, p2: null, p3: null, p4: null, claimed_1: null, claimed_2: null, claimed_3: null, claimed_4: null }), fishing_level_snapshot: level } as never
    },
    async claimDailyFlag(uid, date, flag) {
      me(uid)
      const r = dayRow(date)
      if (!r || r[flag] === true) return false
      save.daily[date] = { ...r, [flag]: true } as never
      return true
    },

    // ── The Daily Haul ──
    async stampIfNew(uid, col, value) {
      const prof = me(uid)
      if (prof[col] === value) return null
      prof[col] = value
      return { is_premium: prof.is_premium ?? null, premium_expires_at: prof.premium_expires_at ?? null }
    },

    // ── Bounties ──
    async bountyBoard(uid) { me(uid); return save.bounty ? structuredClone(save.bounty) : null },
    async setBountyBoard(uid, row) { me(uid); save.bounty = structuredClone(row) },
    async archiveBountyBoard(uid, row) {
      me(uid)
      const keep = save.bountyHistory.filter(b => b.date !== row.date)
      save.bountyHistory = [...keep, structuredClone(row) as BountyRow].slice(-KEEP_BOARDS)
    },
    async claimBountySlot(uid, slot, date) {
      me(uid)
      const b = save.bounty
      if (!b || b.date !== date || slot < 0 || slot >= b.bounty_ids.length || b.claimed[slot] === true) return false
      b.claimed = b.bounty_ids.map((_, i) => i === slot ? true : b.claimed[i] === true)
      return true
    },
    async swapBounty(uid, date, patch) {
      me(uid)
      const b = save.bounty
      if (!b || b.date !== date || b.reroll_used) return false
      save.bounty = { ...b, ...structuredClone(patch), reroll_used: true }
      return true
    },
    async bountySignals(uid, since) {
      me(uid)
      const after = (at: string) => at !== '' && at >= since
      return {
        raids: save.raidClears.filter(c => after(c.at)).map(c => ({ raid_id: c.raid_id, elapsed_ms: c.ms })),
        voyages: save.voyages.filter(v => v.status === 'revealed' && after(v.created_at)).map(v => ({ total_doubloons: v.total_doubloons, route: v.route })),
        events: save.bountyEvents.filter(e => after(e.at)).map(e => ({ kind: e.kind, value: e.value })),
      }
    },
    async raiseBountyRungSeen(uid, chapter) {
      const prof = me(uid)
      if (Number(prof.bounty_rung_seen ?? 0) < chapter) prof.bounty_rung_seen = chapter
    },

    // ── Mail: the captain's own, every letter theirs ──
    async inbox(uid) {
      me(uid)
      return liveMail().slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map(m => ({
        id: m.id, subject: m.subject, body: m.body, senderLabel: m.sender, imageUrl: null,
        attachmentDoubloons: m.attachment_doubloons, attachmentGems: m.attachment_gems,
        createdAt: m.created_at, readAt: m.read_at, claimedAt: m.claimed_at,
      }))
    },
    async mailIds(uid) {
      me(uid)
      const live = liveMail()
      return { visible: live.map(m => m.id), read: save.mail.filter(m => m.read_at).map(m => m.id) }
    },
    async markMailRead(uid, ids) {
      me(uid)
      const at = iso()
      for (const m of save.mail) if (ids.includes(m.id) && !m.read_at) m.read_at = at
    },
    async claimMail(uid, messageId) {
      me(uid)
      const m = liveMail().find(x => x.id === messageId)
      if (!m) return { error: 'not_found' }
      if (m.attachment_gems === 0 && m.attachment_doubloons === 0) return { error: 'no_attachment' }
      if (m.claimed_at) return { error: 'already_claimed' }
      const at = iso()
      m.claimed_at = at
      if (!m.read_at) m.read_at = at
      if (m.attachment_gems) await captain.grant(uid, 'gems', m.attachment_gems)
      if (m.attachment_doubloons) await captain.grant(uid, 'doubloons', m.attachment_doubloons)
      return { ok: true, gems: m.attachment_gems, doubloons: m.attachment_doubloons }
    },

    // ── Contests: this captain against the goal ──
    async contestsView(uid) {
      const prof = me(uid)
      const out: Record<string, ContestView> = {}
      const face = {
        username: (prof.username as string | null) ?? 'A captain',
        characterColor: (prof.character_color as string | null) ?? null,
        equippedHat: (prof.equipped_hat as string | null) ?? null,
        avatarBg: (prof.avatar_bg_color as string | null) ?? null,
        avatarBorder: (prof.avatar_border_color as string | null) ?? null,
      }
      for (const c of CONTESTS) {
        const won = save.contests[c.id] === save.uid
        const winner: ContestView['winner'] = won ? { ...face, wonAt: save.contestsWonAt[c.id] ?? '' } : null
        let score = 0
        if (c.board?.computed === 'achievement_points') score = await captain.achievementPoints(uid)
        else if (c.board?.statColumn) score = Number(prof[c.board.statColumn] ?? 0)
        const standings: ContestStanding[] = c.board && score > 0 ? [{ ...face, score, rank: 1 }] : []
        out[c.id] = { winner, standings }
      }
      return out
    },
  }
}
