// ── THE GAUNTLET'S DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// Where a descent lives while it is open (the run columns on the profile), the
// records it leaves, the ledgers, and the hardcore squad. The settlement rules
// are lib/gauntletRules; the run itself is lib/gauntlet.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - closeRun closes an OPEN run once; only the request that closed it pays,
//     drowns a squad or logs the run;
//   - claimTribute moves the tribute stamp only if it is from before today's
//     midnight, so a day's tribute is paid once;
//   - raiseMaxHit only ever raises the best hit, so racing hits never write the
//     smaller one last;
//   - drownSquad only drowns hands still alive, and reports how many it drowned.

import { crewData, type CrewData } from './crewData'
import type { Db, Row } from './common'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { flagAnomaly } from '@/lib/anomaly'
import { logBountyEvent } from '@/lib/bountyEvents'
import type { GauntletVariant } from '@/lib/gauntlet'

export interface GauntletData extends CrewData {
  /** Close the open run with these fields. True only for the request that closed it. */
  closeRun(uid: string, patch: Row): Promise<boolean>
  /** Stamp today's tribute unless already stamped since `midnightIso`. True if stamped. */
  claimTribute(uid: string, nowIso: string, midnightIso: string): Promise<boolean>
  /** Raise the lifetime best hit to `hit`, only if it is higher. */
  raiseMaxHit(uid: string, hit: number): Promise<void>
  /** Record one hit for the damage board (keeps the all-time best). */
  recordHit(uid: string, hit: number): Promise<void>
  /** Record the time to reach a depth; the previous best and whether this beat it. */
  recordDepthBest(uid: string, variant: GauntletVariant, hardcore: boolean, depth: number, ms: number): Promise<{ prevMs: number | null; isRecord: boolean } | null>
  /** The top finish on a ledger (cashed-out runs only, no admins). */
  ledgerTop(ledger: string): Promise<{ username: string | null; score: number | string } | null>
  /** Drown these hands at a depth (only those still alive). How many drowned. */
  drownSquad(uid: string, ids: number[], depth: number, at: string): Promise<number>
  /** One finished run, for pacing. */
  logRun(uid: string, run: { variant: GauntletVariant; hardcore: boolean; depth: number; duration_ms: number; outcome: 'cashed' | 'died' }): Promise<void>
  /** One moment a bounty may count (a run's depth, a big hit). Never blocks play. */
  logBountyEvent(uid: string, kind: string, value: number): Promise<void>
  /** Award a badge (no-op if already held). */
  grantBadge(uid: string, badgeId: string): Promise<void>
  /** Note something implausible for review. Never blocks play. */
  flagAnomaly(uid: string, kind: string, severity: number, detail: Record<string, unknown>): Promise<void>
}

/** GauntletData over Supabase. */
export function gauntletData(admin: Db): GauntletData {
  return {
    ...crewData(admin),

    async closeRun(uid, patch) {
      const { data } = await admin.from('profiles').update(patch).eq('id', uid).eq('gauntlet_run_open', true).select('id')
      return !!data && data.length > 0
    },
    async claimTribute(uid, nowIso, midnightIso) {
      const { data } = await admin.from('profiles').update({ dons_stipend_claimed_at: nowIso }).eq('id', uid)
        .or(`dons_stipend_claimed_at.is.null,dons_stipend_claimed_at.lt."${midnightIso}"`).select('id')
      return !!data && data.length > 0
    },
    async raiseMaxHit(uid, hit) {
      await admin.from('profiles').update({ gauntlet_max_hit: hit }).eq('id', uid).or(`gauntlet_max_hit.is.null,gauntlet_max_hit.lt.${hit}`)
    },
    async recordHit(uid, hit) {
      await admin.rpc('bump_gauntlet_hit', { uid, dmg: hit })
    },
    async recordDepthBest(uid, variant, hardcore, depth, ms) {
      const { data } = await admin.rpc('record_gauntlet_depth_best', { uid, v: variant, hc: hardcore, d: depth, ms })
      const row = Array.isArray(data) ? data[0] : data
      if (!row) return null
      return { prevMs: row.prev_ms == null ? null : Number(row.prev_ms), isRecord: row.is_record === true }
    },
    async ledgerTop(ledger) {
      // Same depth -> FIRST-TO-DEPTH -> fastest, as the board orders it.
      const { data } = await admin.from(ledger).select('username, score')
        .order('score', { ascending: false }).order('created_at', { ascending: true }).order('time_ms', { ascending: true })
        .limit(1).maybeSingle()
      return (data as { username: string | null; score: number | string } | null) ?? null
    },
    async drownSquad(uid, ids, depth, at) {
      if (!ids.length) return 0
      const { data } = await admin.from('user_crew')
        .update({ died_at: at, died_hardcore_depth: depth, raid_slot: null, voyage_slot: null })
        .eq('user_id', uid).in('id', ids).is('died_at', null).select('id')
      return (data ?? []).length
    },
    async logRun(uid, run) {
      await admin.from('gauntlet_runs').insert({ user_id: uid, ...run })
    },
    async logBountyEvent(uid, kind, value) {
      await logBountyEvent(uid, kind, value)
    },
    async grantBadge(uid, badgeId) {
      await grantBadgeDirect(uid, badgeId)
    },
    async flagAnomaly(uid, kind, severity, detail) {
      await flagAnomaly(admin as never, uid, kind, severity, detail)
    },
  }
}
