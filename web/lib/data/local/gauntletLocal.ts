// ── THE GAUNTLETS OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// GauntletData over one captain's save, spreading the crew's. The one-shot
// contracts in lib/data/gauntletData hold here too: an open run closes once,
// the tribute is stamped once a UTC day, the best hit only rises, a squad
// drowns only its living hands.
//
// Two web functions become arithmetic here: bump_gauntlet_hit (the all-time
// biggest hit and when) and record_gauntlet_depth_best (a time per depth,
// "a record" only when an earlier time is beaten). The web's LEADERBOARDS are
// everybody's; offline the ledger is this captain's own best cashed-out run.

import type { GauntletData } from '../gauntletData'
import { localCrewData } from './crewLocal'
import { localCaptain, type LocalSave } from './save'
import { HC_COLUMNS } from '@/lib/gauntlet'
import { clockNow } from '@/lib/clock'

/** Which of this captain's columns each ledger reads (offline, a ledger of one). */
const LEDGER_COLUMN: Record<string, string> = {
  leaderboard_gauntlet: 'gauntlet_best_depth',
  leaderboard_dons_gauntlet: 'dons_gauntlet_best_depth',
  [HC_COLUMNS.davy.ledger]: HC_COLUMNS.davy.bestDepth,
  [HC_COLUMNS.don.ledger]: HC_COLUMNS.don.bestDepth,
}

/** How much history the save keeps. Old rows never change a decision. */
const KEEP_RUNS = 200
const KEEP_BOUNTY_EVENTS = 500

/** GauntletData over one captain's local save. */
export function localGauntletData(save: LocalSave): GauntletData {
  const crew = localCrewData(save)
  const captain = localCaptain(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  const nowIso = () => new Date(clockNow()).toISOString()

  return {
    ...crew,
    // Badges (dated like the web's) and anomaly flags: the shared helpers (./save).
    grantBadge: captain.grantBadge,
    flagAnomaly: captain.flagAnomaly,

    async closeRun(uid, patch) {
      const prof = me(uid)
      if (prof.gauntlet_run_open !== true) return false
      Object.assign(prof, structuredClone(patch)); return true
    },
    async claimTribute(uid, now, midnightIso) {
      const prof = me(uid)
      const last = prof.dons_stipend_claimed_at as string | null
      if (last != null && Date.parse(last) >= Date.parse(midnightIso)) return false
      prof.dons_stipend_claimed_at = now; return true
    },
    async raiseMaxHit(uid, hit) {
      const prof = me(uid)
      if (prof.gauntlet_max_hit == null || prof.gauntlet_max_hit < hit) prof.gauntlet_max_hit = hit
    },
    async recordHit(uid, hit) {
      // bump_gauntlet_hit: keep the greatest, and stamp when it was set.
      const prof = me(uid)
      if (hit > Number(prof.gauntlet_big_hit ?? 0)) { prof.gauntlet_big_hit = hit; prof.gauntlet_big_hit_at = nowIso() }
    },
    async recordDepthBest(uid, variant, hardcore, depth, ms) {
      // record_gauntlet_depth_best: out of range answers nothing; a first time
      // at a depth is not a record (nothing was beaten); a faster one is.
      me(uid)
      if (depth < 1 || depth > 100 || ms < 0) return { prevMs: null, isRecord: false }
      const key = `${variant}:${hardcore ? 1 : 0}:${depth}`
      const old = save.depthBests[key]
      if (!old) { save.depthBests[key] = { ms, at: nowIso() }; return { prevMs: null, isRecord: false } }
      if (ms < old.ms) { save.depthBests[key] = { ms, at: nowIso() }; return { prevMs: old.ms, isRecord: true } }
      return { prevMs: old.ms, isRecord: false }
    },
    async ledgerTop(ledger) {
      const col = LEDGER_COLUMN[ledger]
      const score = col ? Number(save.profile[col] ?? 0) : 0
      return score > 0 ? { username: (save.profile.username as string | null) ?? null, score } : null
    },
    async drownSquad(uid, ids, depth, at) {
      me(uid)
      let n = 0
      for (const c of save.crew) {
        if (ids.includes(c.id) && c.died_at == null) {
          Object.assign(c, { died_at: at, died_hardcore_depth: depth, raid_slot: null, voyage_slot: null }); n++
        }
      }
      return n
    },
    async logRun(uid, run) {
      me(uid)
      save.gauntletRuns = [...save.gauntletRuns, { ...run, at: nowIso() }].slice(-KEEP_RUNS)
    },
    async logBountyEvent(uid, kind, value) {
      me(uid)
      save.bountyEvents = [...save.bountyEvents, { kind, value, at: nowIso() }].slice(-KEEP_BOUNTY_EVENTS)
    },
  }
}
