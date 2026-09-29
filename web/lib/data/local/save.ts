// ── ONE CAPTAIN'S LOCAL SAVE, AND WHAT EVERY SYSTEM DOES WITH IT (Steam prep) ──
//
// The save's shape, and the operations every lib/data/<system>Data interface
// shares (CaptainData, plus the wallet and owned-list helpers), implemented
// once over the save. Each system's local store (fishingLocal, sellLocal, ...)
// spreads localCaptain(save) and adds its own.
//
// The one-shot contracts in lib/data/common hold here too: a guarded write
// that does not hold writes nothing, a spend that will not cover takes nothing.

import type { CaptainData, ProfileGuard, Row } from '../common'
import type { SpeciesRow, DailyRow } from '../fishingData'
import type { ChallengeOverride } from '@/lib/dailyChallenges'
import type { MarketState } from '@/lib/marketRules'
import { badgePoints } from '@/lib/badges'

export type LocalSave = {
  uid: string
  profile: Row
  species: SpeciesRow[]
  bait: Record<string, number>
  hold: Record<number, number>
  collection: Record<number, { catch_count: number; is_golden: boolean | null; last_caught_at?: string }>
  lifetime: Record<number, { n: number; last: string }>
  bests: Record<number, { len: number; at: string }>
  shinies: { id: number; fish_id: number; size_in: number | null; status: string; caught_at: string; [k: string]: unknown }[]
  daily: Record<string, DailyRow>
  clears: string[]
  rods: number[]
  ledger: { amount: number; reason: string; currency: 'doubloons' | 'gems' }[]
  anomalies: { kind: string; severity: number; detail: Record<string, unknown> }[]
  mail: { subject: string; body: string; sender: string }[]
  rapport: { folk_id: string; want_fish_id: number | null }[]
  contests: Record<string, string>
  overrides: Record<string, ChallengeOverride>
  // ── Save v2 (selling) ──
  /** Deals struck at sea: one per trader key, and the runner's one a night. */
  deals: { trader_key: string; sea_day: number; kind: string; detail: object }[]
  /** This captain's own market. On the web it is shared and a cron moves it;
   *  offline it is caught up by the hours that passed (lib/marketRules). Null
   *  until the market is first read. */
  market: MarketState | null
}

const cols = (list: string) => list.split(',').map(c => c.trim()).filter(Boolean)

function guardHolds(profile: Row, g: ProfileGuard): boolean {
  const v = profile[g.col]
  if ('is' in g) return v == null
  if ('notNull' in g) return v != null
  if ('contains' in g) return Array.isArray(v) && g.contains.every(x => v.includes(x))
  // eq: a JSON string compared against a JSON value is compared as JSON.
  return typeof g.eq === 'string' && v != null && typeof v === 'object' ? JSON.stringify(v) === g.eq : v === g.eq
}

export type LocalCaptain = CaptainData & {
  /** The profile, for this save's captain only (a different uid throws). */
  me(uid: string): Row
  grant(uid: string, col: string, n: number): Promise<number>
  spend(uid: string, col: string, n: number): Promise<number | null>
  addToList(uid: string, col: string, value: string): Promise<boolean>
  grantBadge(uid: string, badgeId: string): Promise<void>
  flagAnomaly(uid: string, kind: string, severity: number, detail: Record<string, unknown>): Promise<void>
  achievementPoints(uid: string): Promise<number>
}

/** CaptainData and the shared helpers over one captain's local save. */
export function localCaptain(save: LocalSave): LocalCaptain {
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  return {
    me,
    async profile(uid, list) {
      const prof = me(uid)
      return Object.fromEntries(cols(list).map(c => [c, prof[c] ?? null]))
    },
    async updateProfile(uid, patch) { Object.assign(me(uid), structuredClone(patch)) },
    async bumpStat(uid, col, n) { const prof = me(uid); prof[col] = Number(prof[col] ?? 0) + n },
    async bumpJsonCounter(uid, col, key, n) {
      const prof = me(uid); const o = { ...(prof[col] ?? {}) }; o[key] = Number(o[key] ?? 0) + n; prof[col] = o
    },
    async ledger(uid, amount, reason, currency = 'doubloons') { me(uid); save.ledger.push({ amount, reason, currency }) },
    async hasCleared(uid, raidId) { me(uid); return save.clears.includes(raidId) },
    async addBait(uid, bait, qty) { me(uid); save.bait[bait] = (save.bait[bait] ?? 0) + qty },
    async updateProfileIf(uid, patch, when) {
      const prof = me(uid)
      if (!when.every(g => guardHolds(prof, g))) return false
      Object.assign(prof, structuredClone(patch)); return true
    },
    async deductDoubloons(uid, amount) {
      const prof = me(uid); const have = Number(prof.doubloons ?? 0)
      if (have < amount) return null
      prof.doubloons = have - amount; return prof.doubloons as number
    },
    async mailTo(uid, m) { me(uid); save.mail.push(m) },

    async grant(uid, col, n) {
      const prof = me(uid); prof[col] = Number(prof[col] ?? 0) + Math.max(0, Math.trunc(Number(n) || 0)); return prof[col] as number
    },
    async spend(uid, col, n) {
      const prof = me(uid); const have = Number(prof[col] ?? 0)
      if (!Number.isInteger(n) || n < 0 || have < n) return null
      prof[col] = have - n; return prof[col] as number
    },
    async addToList(uid, col, value) {
      const prof = me(uid); const list: string[] = prof[col] ?? []
      if (list.includes(value)) return false
      prof[col] = [...list, value]; return true
    },
    async grantBadge(uid, badgeId) {
      const prof = me(uid); const list: string[] = prof.unlocked_badges ?? []
      if (!list.includes(badgeId)) prof.unlocked_badges = [...list, badgeId]
    },
    async flagAnomaly(uid, kind, severity, detail) { me(uid); save.anomalies.push({ kind, severity, detail }) },
    async achievementPoints(uid) {
      // Offline, the badges the captain holds are the whole record.
      return ((me(uid).unlocked_badges ?? []) as string[]).reduce((n, id) => n + badgePoints(id), 0)
    },
  }
}
