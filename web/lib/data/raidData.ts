// ── RAIDS' DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// A raid run's token (the one thing that bounds what a client-driven fight can
// be paid), the clears board, and the few writes a raid makes on the profile.
// The reward rules are lib/raidRules; combat is the client's.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - a run token pays each ROUND once (claimRaidRound), clears once
//     (markRunCleared), opens its crate once and only after the clear
//     (markRunLooted), and is consumed once (consumeRunToken); every one of them
//     refuses an expired token;
//   - wearFirstSkin only dresses a hull that is wearing nothing.
//
// In a single-player offline build the token still earns its keep: it is the
// record of what a run was, and a replayed request is still a replayed request.

import { captainData, type CaptainData, type Db, type Row } from './common'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RaidData extends CaptainData {
  // ── The run token ──
  /** Mint a token for a run of `kind`; its id, or null. */
  issueRunToken(uid: string, kind: string, meta?: Record<string, unknown>): Promise<string | null>
  /** The token's meta (e.g. which raid it was minted for), or null. */
  runTokenMeta(uid: string, kind: string, tokenId: string): Promise<Record<string, any> | null>
  /** Spend a live token once. Its meta and kill count, or null. */
  consumeRunToken(uid: string, kind: string, tokenId: string): Promise<{ meta: any; kills: number } | null>
  /** Count a kill against a raid token (bounded by its meta). */
  countRaidKill(uid: string, tokenId: string): Promise<boolean>
  /** Mark a live token's run cleared, once. */
  markRunCleared(uid: string, kind: string, tokenId: string): Promise<{ meta: any } | null>
  /** Pay one round of a raid token, once. */
  claimRaidRound(uid: string, tokenId: string, round: number): Promise<boolean>
  /** Open a cleared token's crate, once. */
  markRunLooted(uid: string, kind: string, tokenId: string): Promise<{ meta: any } | null>

  // ── Clears ──
  /** This captain's fastest clear of a raid, or null. */
  myBestClear(uid: string, raidId: string): Promise<number | null>
  /** The fastest clear of a raid by a non-admin, with their name, or null. */
  fastestClear(raidId: string): Promise<{ ms: number; username: string } | null>
  addClear(uid: string, raidId: string, ms: number): Promise<void>
  /** Every raid this captain has cleared. */
  clearedRaidIds(uid: string): Promise<string[]>

  // ── Small writes ──
  /** Record a hit for the damage board (keeps the all-time best). */
  recordRaidHit(uid: string, dmg: number): Promise<void>
  /** Wear this hull skin only if nothing is worn. */
  wearFirstSkin(uid: string, skin: string): Promise<void>
}

/** RaidData over Supabase. */
export function raidData(admin: Db): RaidData {
  const nowIso = () => new Date().toISOString()
  return {
    ...captainData(admin),

    async issueRunToken(uid, kind, meta = {}) {
      try {
        const { data } = await admin.from('run_tokens').insert({ user_id: uid, kind, meta }).select('id').single()
        return (data?.id as string | undefined) ?? null
      } catch { return null }
    },
    async runTokenMeta(uid, kind, tokenId) {
      const { data } = await admin.from('run_tokens').select('meta').eq('id', tokenId).eq('user_id', uid).eq('kind', kind).maybeSingle()
      return (data?.meta as Record<string, any> | null) ?? null
    },
    async consumeRunToken(uid, kind, tokenId) {
      try {
        const { data } = await admin.from('run_tokens').update({ consumed_at: nowIso() })
          .eq('id', tokenId).eq('user_id', uid).eq('kind', kind).is('consumed_at', null).gt('expires_at', nowIso())
          .select('meta, kills').single()
        return data ? { meta: data.meta, kills: data.kills } : null
      } catch { return null }
    },
    async countRaidKill(uid, tokenId) {
      try {
        const { data } = await admin.rpc('bump_run_token_kill', { p_id: tokenId, p_uid: uid })
        return data === true
      } catch { return false }
    },
    async markRunCleared(uid, kind, tokenId) {
      try {
        const { data } = await admin.from('run_tokens').update({ cleared_at: nowIso() })
          .eq('id', tokenId).eq('user_id', uid).eq('kind', kind).is('cleared_at', null).gt('expires_at', nowIso())
          .select('meta').single()
        return data ? { meta: data.meta } : null
      } catch { return null }
    },
    async claimRaidRound(uid, tokenId, round) {
      try {
        const { data, error } = await admin.rpc('claim_run_token_round', { p_id: tokenId, p_uid: uid, p_round: round })
        return !error && data != null
      } catch { return false }
    },
    async markRunLooted(uid, kind, tokenId) {
      try {
        const { data } = await admin.from('run_tokens').update({ looted_at: nowIso() })
          .eq('id', tokenId).eq('user_id', uid).eq('kind', kind)
          .not('cleared_at', 'is', null).is('looted_at', null).gt('expires_at', nowIso())
          .select('meta').maybeSingle()
        return data ? { meta: data.meta } : null
      } catch { return null }
    },

    async myBestClear(uid, raidId) {
      const { data } = await admin.from('raid_completions').select('elapsed_ms').eq('raid_id', raidId).eq('user_id', uid)
        .order('elapsed_ms', { ascending: true }).limit(1)
      return (data?.[0]?.elapsed_ms as number | undefined) ?? null
    },
    async fastestClear(raidId) {
      // Small table: the ordered rows, then who they belong to, first non-admin wins.
      const { data: allRows } = await admin.from('raid_completions').select('user_id, elapsed_ms').eq('raid_id', raidId).order('elapsed_ms', { ascending: true })
      const rows = (allRows ?? []) as { user_id: string; elapsed_ms: number }[]
      const uids = Array.from(new Set(rows.map(r => r.user_id)))
      if (!uids.length) return null
      const { data: profs } = await admin.from('profiles').select('id, username, is_admin').in('id', uids)
      const pMap = new Map(((profs ?? []) as { id: string; username: string | null; is_admin: boolean | null }[]).map(p => [p.id, p]))
      for (const r of rows) {
        const p = pMap.get(r.user_id)
        if (p && !p.is_admin) return { ms: r.elapsed_ms, username: p.username ?? '' }
      }
      return null
    },
    async addClear(uid, raidId, ms) {
      await admin.from('raid_completions').insert({ user_id: uid, elapsed_ms: ms, raid_id: raidId })
    },
    async clearedRaidIds(uid) {
      const { data } = await admin.from('raid_completions').select('raid_id').eq('user_id', uid)
      return ((data ?? []) as { raid_id: string }[]).map(r => r.raid_id)
    },

    async recordRaidHit(uid, dmg) {
      await admin.rpc('bump_raid_damage', { uid, dmg })
    },
    async wearFirstSkin(uid, skin) {
      await admin.from('profiles').update({ equipped_ship_skin: skin }).eq('id', uid).is('equipped_ship_skin', null)
    },
  }
}

export type { Row }
