// ── THE SEA OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// SeaData over one captain's save, spreading the daily loop's. Every one-shot
// the web keeps is kept here: a regular's day is claimed once, a job settles
// only while it is still that fish, the last fish is taken once, a rod is owned
// once, a bearing and an isle are rows unique to the captain, a site is dug
// once, and the recall stamps only past its cycle. The catch counts Finn reads
// come from the save's own lifetime log and species list.

import type { SeaData, RapportRow } from '../seaData'
import { localDailyData } from './dailyLocal'
import { localCaptain, type LocalSave } from './save'

/** SeaData over one captain's local save. */
export function localSeaData(save: LocalSave): SeaData {
  const daily = localDailyData(save)
  const captain = localCaptain(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  const row = (folkId: string) => save.rapport.find(r => r.folk_id === folkId)
  /** Lifetime catches of these species (all, when none are named). */
  const caught = (ids?: Set<number>) =>
    Object.entries(save.lifetime).reduce((a, [id, r]) => a + (!ids || ids.has(Number(id)) ? (r?.n ?? 0) : 0), 0)

  return {
    ...daily,
    grantBadge: captain.grantBadge,
    async rodTiers(uid) { me(uid); return [...save.rods] },

    // ── The regulars ──
    async rapportRows(uid) { me(uid); return structuredClone(save.rapport) },
    async rapportRow(uid, folkId) { me(uid); const r = row(folkId); return r ? structuredClone(r) : null },
    async ensureRapport(uid, folkId) {
      me(uid)
      if (!row(folkId)) save.rapport.push({ folk_id: folkId, points: 0, seen_lines: [], last_chat_on: null, gifts_given: 0, want_fish_id: null, want_asked_at: null })
    },
    async claimChat(uid, folkId, day, patch) {
      me(uid)
      const r = row(folkId)
      if (!r || r.last_chat_on === day) return false
      Object.assign(r, structuredClone(patch), { last_chat_on: day })
      return true
    },
    async setWant(uid, folkId, patch) {
      me(uid)
      const r = row(folkId)
      if (!r) return false
      Object.assign(r, structuredClone(patch))
      return true
    },
    async settleWant(uid, folkId, fishId, patch) {
      me(uid)
      const r = row(folkId)
      if (!r || r.want_fish_id !== fishId) return false
      Object.assign(r, patch, { want_fish_id: null, want_asked_at: null })
      return true
    },
    async restoreRapport(uid, folkId, patch) {
      me(uid)
      const r = row(folkId)
      if (r) Object.assign(r, structuredClone(patch) as Partial<RapportRow>)
    },
    async heldQty(uid, fishIds) {
      me(uid)
      return new Map(fishIds.filter(id => save.hold[id] != null).map(id => [id, Number(save.hold[id])]))
    },
    async lastCaught(uid, fishIds) {
      me(uid)
      const out = new Map<number, string>()
      for (const id of fishIds) {
        const at = save.collection[id]?.last_caught_at
        if (at) out.set(id, at)
      }
      return out
    },
    async takeOneFish(uid, fishId) {
      me(uid)
      const have = Number(save.hold[fishId] ?? 0)
      if (have < 1) return false
      if (have === 1) delete save.hold[fishId]
      else save.hold[fishId] = have - 1
      return true
    },
    async addRod(uid, tier) {
      me(uid)
      if (save.rods.includes(tier)) return false
      save.rods.push(tier)
      return true
    },
    async removeRod(uid, tier) { me(uid); save.rods = save.rods.filter(t => t !== tier) },

    // ── Finn ──
    async lifetimeCatches(uid) { me(uid); return caught() },
    async catchesWhere(uid, opts) {
      me(uid)
      if (!opts.zone && !opts.minRarity) return 0
      const ids = new Set(save.species
        .filter(sp => (!opts.zone || sp.habitat === opts.zone) && (!opts.minRarity || Number((sp as { bite_rarity?: number }).bite_rarity ?? 0) >= opts.minRarity))
        .map(sp => sp.id))
      if (!ids.size) return 0
      return caught(ids)
    },

    // ── Bottles and digs ──
    async digRows(uid) { me(uid); return structuredClone(save.digs) },
    async addDigBearing(uid, siteId) {
      me(uid)
      if (save.digs.some(d => d.site_id === siteId)) return 'dup'
      save.digs.push({ site_id: siteId, dug_at: null })
      return 'ok'
    },
    async claimDig(uid, siteId, at) {
      me(uid)
      const d = save.digs.find(x => x.site_id === siteId)
      if (!d || d.dug_at) return false
      d.dug_at = at
      return true
    },

    // ── The isles ──
    async discoveries(uid) { me(uid); return [...save.discoveries] },
    async addDiscovery(uid, isleId) {
      me(uid)
      if (save.discoveries.includes(isleId)) return 'dup'
      save.discoveries.push(isleId)
      return 'ok'
    },
    async homesteadOwned(uid) {
      me(uid)
      return save.homestead ? [...((save.homestead.owned as string[] | null) ?? [])] : null
    },
    async setHomesteadOwned(uid, owned) {
      me(uid)
      save.homestead = { ...(save.homestead ?? {}), owned: [...owned] }
    },

    // ── The recall ──
    async stampRecall(uid, col, at, cutoff) {
      const prof = me(uid)
      const last = prof[col] as string | null | undefined
      if (last != null && !(last < cutoff)) return false
      prof[col] = at
      return true
    },
  }
}
