// ── RAIDS OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// RaidData over one captain's save, spreading the crew's. The run token keeps
// every one-shot the web's run_tokens row has: a round pays once
// (claim_run_token_round), a kill counts only under the run's cap
// (bump_run_token_kill), the clear banks once, the crate opens once and only
// after the clear, the token is spent once, and none of it works on a token
// past its six hours or one that is not this captain's.
//
// The web's records are everybody's (raid_records, the fastest clear); offline
// they are this captain's own. The legacy card collection (the old crew
// picker) is not modelled: it is empty offline.

import type { RaidData } from '../raidData'
import { localCrewData } from './crewLocal'
import { localCaptain, type LocalSave, type LocalRunToken } from './save'
import { clockNow } from '@/lib/clock'
import cardsJson from '@/content/cards.json'

/** How long a run token lives, as the web's column default has it. */
export const RUN_TOKEN_TTL_MS = 6 * 3_600_000
/** Spent and expired tokens older than this are dropped from the save. */
const KEEP_TOKENS_MS = 7 * 86_400_000

/** RaidData over one captain's local save. */
export function localRaidData(save: LocalSave): RaidData {
  const crew = localCrewData(save)
  const captain = localCaptain(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  const now = () => clockNow()
  const iso = (ms: number) => new Date(ms).toISOString()
  /** A live token of this captain's and this kind: not expired (and, unless
   *  `allowConsumed`, not spent). */
  const live = (uid: string, kind: string, id: string, allowConsumed = false): LocalRunToken | null => {
    me(uid)
    const t = save.raidTokens.find(x => x.id === id && x.kind === kind)
    if (!t || Date.parse(t.expires_at) <= now()) return null
    if (!allowConsumed && t.consumed_at) return null
    return t
  }
  const name = () => (save.profile.username as string | null) ?? ''
  const bestOf = (raidId: string) => {
    const times = save.raidClears.filter(c => c.raid_id === raidId && c.ms != null).map(c => c.ms as number)
    return times.length ? Math.min(...times) : null
  }

  return {
    ...crew,
    flagAnomaly: captain.flagAnomaly,
    async logBountyEvent(uid, kind, value) {
      me(uid)
      save.bountyEvents = [...save.bountyEvents, { kind, value, at: iso(now()) }].slice(-500)
    },

    // ── The run token ──
    async issueRunToken(uid, kind, meta = {}) {
      me(uid)
      const t = now()
      const id = `local-${save.nextId++}`
      save.raidTokens = [
        ...save.raidTokens.filter(x => Date.parse(x.issued_at) > t - KEEP_TOKENS_MS),
        { id, kind, meta: structuredClone(meta), kills: 0, issued_at: iso(t), consumed_at: null, expires_at: iso(t + RUN_TOKEN_TTL_MS), cleared_at: null, paid_rounds: [], looted_at: null },
      ]
      return id
    },
    async runTokenMeta(uid, kind, tokenId) {
      me(uid)
      const t = save.raidTokens.find(x => x.id === tokenId && x.kind === kind)
      return t ? structuredClone(t.meta) : null
    },
    async consumeRunToken(uid, kind, tokenId) {
      const t = live(uid, kind, tokenId)
      if (!t) return null
      t.consumed_at = iso(now())
      return { meta: structuredClone(t.meta), kills: t.kills }
    },
    async countRaidKill(uid, tokenId) {
      const t = live(uid, 'raid', tokenId)
      if (!t) return false
      const cap = Number((t.meta as { maxKills?: number } | null)?.maxKills ?? 999999)
      if (t.kills >= cap) return false
      t.kills++; return true
    },
    async markRunCleared(uid, kind, tokenId) {
      const t = live(uid, kind, tokenId)
      if (!t || t.cleared_at) return null
      t.cleared_at = iso(now())
      return { meta: structuredClone(t.meta) }
    },
    async claimRaidRound(uid, tokenId, round) {
      const t = live(uid, 'raid', tokenId)
      if (!t || round < 0 || t.paid_rounds.includes(round)) return false
      t.paid_rounds.push(round); t.kills++
      return true
    },
    async markRunLooted(uid, kind, tokenId) {
      // The web's update does not ask about consumed_at here, only the clear.
      const t = live(uid, kind, tokenId, true)
      if (!t || !t.cleared_at || t.looted_at) return null
      t.looted_at = iso(now())
      return { meta: structuredClone(t.meta) }
    },

    // ── Clears ──
    async myBestClear(uid, raidId) { me(uid); return bestOf(raidId) },
    async fastestClear(raidId) {
      // A ledger of one: this captain's best, unless they are an admin.
      if (save.profile.is_admin === true) return null
      const ms = bestOf(raidId)
      return ms == null ? null : { ms, username: name() }
    },
    async addClear(uid, raidId, ms) {
      me(uid)
      save.raidClears.push({ raid_id: raidId, ms, at: iso(now()) })
      if (!save.clears.includes(raidId)) save.clears.push(raidId)
    },
    async clearedRaidIds(uid) { me(uid); return [...new Set([...save.clears, ...save.raidClears.map(c => c.raid_id)])] },

    // ── Small writes ──
    async recordRaidHit(uid, dmg) {
      const prof = me(uid)
      prof.highest_raid_damage = Math.max(Number(prof.highest_raid_damage ?? 0), dmg)
    },
    async wearFirstSkin(uid, skin) {
      const prof = me(uid)
      if (prof.equipped_ship_skin == null) prof.equipped_ship_skin = skin
    },

    // ── The campaign map ──
    async raidRecords(uid) {
      me(uid)
      const admin = save.profile.is_admin === true
      return [...new Set(save.raidClears.map(c => c.raid_id))].map(raidId => {
        const best = bestOf(raidId)
        return {
          raid_id: raidId,
          fastest_username: admin || best == null ? null : name(),
          fastest_ms: admin ? null : best,
          total_clearers: admin ? 0 : 1,
          your_best_ms: best,
        }
      })
    },
    async cardByKey(key) {
      const c = (cardsJson as { slug: string; name: string; filename: string }[]).find(x => x.slug === key)
      return c ? { name: c.name, filename: c.filename } : null
    },

    // ── The legacy card collection: not modelled offline ──
    async collection(uid) { me(uid); return [] },
    async variantNames() { return new Map() },
  }
}
