// ── FISHING OVER A LOCAL SAVE (Steam prep, step 8 spike, 2026-09-28) ──
//
// FishingData implemented over a plain object: no network, no database. This is
// what the offline build hands lib/core/fishing instead of the Supabase store.
// The save's shape and the operations every system shares are in ./save; the
// file on disk is ./saveFile.
//
// Every one-shot contract in lib/data/fishingData holds here too, and the spike
// checks them: a cast is claimed once and only at its castAt, a reroll is
// settled once, a stack is taken only while it reads what was seen, a flag is
// turned on once, a guard that does not hold writes nothing.

import { clockNow } from '@/lib/clock'
import type { FishingData, CastCandidateRow, DailyRow } from '../fishingData'
import type { PendingCast } from '@/lib/fishingRules'
import { localCaptain, type LocalSave } from './save'

export type { LocalSave } from './save'

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** FishingData over one captain's local save. */
export function localFishingData(save: LocalSave): FishingData {
  const captain = localCaptain(save)
  const { me } = captain
  return {
    // ── The captain, the wallet, owned lists, badges (./save) ──
    ...captain,
    async challengeOverride(date) { return save.overrides[date] ?? null },

    // ── The cast ──
    async pendingCast(uid) { return (me(uid).pending_cast as PendingCast | null) ?? null },
    async claimCast(uid, castAt) {
      const prof = me(uid)
      if (!prof.pending_cast || String(prof.pending_cast.castAt) !== String(castAt)) return false
      prof.pending_cast = null; prof.catch_pending = false; return true
    },
    async claimCrateCast(uid, castAt) {
      const prof = me(uid)
      if (!prof.pending_cast || String(prof.pending_cast.castAt) !== String(castAt)) return false
      prof.pending_cast = null; return true
    },
    async claimPendingReroll(uid) {
      const prof = me(uid)
      if (prof.pending_reroll == null) return false
      prof.pending_reroll = null; return true
    },

    // ── Bait ──
    async baitCount(uid, bait) { me(uid); return bait in save.bait ? save.bait[bait] : null },
    async setBaitCount(uid, bait, qty, ifWas) {
      me(uid)
      if (!(bait in save.bait)) return
      if (ifWas !== undefined && save.bait[bait] !== ifWas) return
      save.bait[bait] = qty
    },

    // ── The water ──
    async candidates(habitat) {
      return save.species.filter(f => f.habitat === habitat)
        .map(f => ({ id: f.id, catch_difficulty: f.catch_difficulty, catch_score: f.catch_score, bite_rarity: f.bite_rarity, sell_value: f.sell_value })) as CastCandidateRow[]
    },
    async species(fishId) { return save.species.find(f => f.id === fishId) ?? null },
    async nonAncientSpeciesIds() { return save.species.filter(f => f.habitat !== 'ancient_deep').map(f => f.id) },
    async speciesIdsIn(habitat) { return save.species.filter(f => f.habitat === habitat).map(f => f.id) },

    // ── The hold ──
    async holdCount(uid) { me(uid); return Object.values(save.hold).reduce((n, q) => n + q, 0) },
    async holdQty(uid, fishId) { me(uid); return fishId in save.hold ? save.hold[fishId] : null },
    async addToHold(uid, fishId, qty, had) { me(uid); save.hold[fishId] = (had ?? 0) + qty },
    async takeFromHold(uid, fishId, qty) {
      me(uid); const have = save.hold[fishId]
      if (have == null || have < qty) return false
      if (have - qty === 0) delete save.hold[fishId]; else save.hold[fishId] = have - qty
      return true
    },
    async holdWithSpecies(uid) {
      me(uid)
      return Object.entries(save.hold).filter(([, q]) => q > 0)
        .map(([id, q]) => ({ fish_id: Number(id), quantity: q, fish_species: save.species.find(f => f.id === Number(id)) ?? null }))
    },

    // ── The log ──
    async collectionRow(uid, fishId) {
      me(uid); const r = save.collection[fishId]
      return r ? { catch_count: r.catch_count, is_golden: r.is_golden } : null
    },
    async logCatch(uid, fishId, had, at) {
      me(uid)
      if (!had) { save.collection[fishId] = { catch_count: 1, is_golden: null }; return }
      save.collection[fishId] = { ...save.collection[fishId], catch_count: had.catch_count + 1, last_caught_at: at }
    },
    async collectionIds(uid) { me(uid); return Object.keys(save.collection).map(Number) },
    async loggedCount(uid, ids) { me(uid); return ids.filter(id => id in save.collection).length },
    async goldenIds(uid, ids) { me(uid); return ids.filter(id => save.collection[id]?.is_golden === true) },
    async clearLog(uid, ids) { me(uid); for (const id of ids) delete save.collection[id] },
    async setGolden(uid, fishId) { me(uid); if (save.collection[fishId]) save.collection[fishId].is_golden = true },
    async bumpLifetime(uid, fishId, at) { me(uid); const r = save.lifetime[fishId]; save.lifetime[fishId] = { n: (r?.n ?? 0) + 1, last: at, first: r ? r.first : at } },
    async personalBest(uid, fishId) { me(uid); return save.bests[fishId]?.len ?? null },
    async setPersonalBest(uid, fishId, sizeIn, at) { me(uid); save.bests[fishId] = { len: sizeIn, at } },
    async addShiny(uid, fishId, sizeIn) {
      me(uid); const id = (save.shinies.at(-1)?.id ?? 0) + 1
      save.shinies.push({ id, fish_id: fishId, size_in: sizeIn, status: 'hold', caught_at: new Date().toISOString() }); return id
    },
    async oldestHeldShiny(uid) {
      me(uid); const s = save.shinies.filter(x => x.status === 'hold').sort((a, b) => a.caught_at.localeCompare(b.caught_at))[0]
      return s ? { id: s.id, fish_id: s.fish_id, size_in: s.size_in, name: save.species.find(f => f.id === s.fish_id)?.name ?? null } : null
    },
    async shiny(uid, shinyId) {
      me(uid); const s = save.shinies.find(x => x.id === shinyId)
      if (!s) return null
      const f = save.species.find(x => x.id === s.fish_id)
      return { id: s.id, status: s.status, fish_id: s.fish_id, fish_species: f ? { name: f.name, sell_value: f.sell_value } : null }
    },
    async resolveShiny(shinyId, patch) {
      const s = save.shinies.find(x => x.id === shinyId)
      if (!s || s.status !== 'hold') return { failed: false, claimed: false }
      Object.assign(s, patch); return { failed: false, claimed: true }
    },

    // ── The day ──
    async dailyProgress(uid, date) { me(uid); return save.daily[date] ?? null },
    async saveDailyProgress(uid, date, prog, snapshot) {
      me(uid); const prev = save.daily[date]
      save.daily[date] = {
        ...(prev ?? { claimed_1: null, claimed_2: null, claimed_3: null, claimed_4: null, p4: null }),
        p1: prog[0], p2: prog[1], p3: prog[2], ...(prog.length > 3 ? { p4: prog[3] } : {}),
        fishing_level_snapshot: snapshot,
      } as DailyRow
    },

    // ── The sea ──
    async folkWanting(uid, fishId) { me(uid); return save.rapport.filter(r => r.want_fish_id === fishId).map(r => r.folk_id) },
    async claimContest(contestId, uid) {
      me(uid)
      if (contestId in save.contests) return false
      save.contests[contestId] = uid
      save.contestsWonAt[contestId] = new Date(clockNow()).toISOString()
      return true
    },

    // ── The rest of the captain ──
    async flagOn(uid, col) {
      const prof = me(uid)
      if (prof[col] === true) return false
      prof[col] = true; return true
    },
    async moveLevelWatermark(uid, from, to) {
      const prof = me(uid)
      if (!same(prof.claimed_fishing_levels, from)) return false
      prof.claimed_fishing_levels = to; return true
    },
    async raiseHoldTier(uid, tier) { const prof = me(uid); if (prof.fish_hold_tier == null || prof.fish_hold_tier < tier) prof.fish_hold_tier = tier },
    async countAbove() { return 0 },           // single player: nobody else to rank against
    async rodTiers(uid) { me(uid); return [...save.rods] },
  }
}
