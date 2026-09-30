// THE INVENTORY OVER A LOCAL SAVE (the item system, stage 2, 2026-09-30).
//
// lib/data/inventory's four questions, answered from one captain's save, with
// the same storage map (lib/inventoryStorage) and the same rules: stacks
// count, unlocks are owned once, upgrades are read and never given or taken,
// the Bamboo is always held. Raid items stay owned-once until stage 3.

import type { LocalSave } from './save'
import type { InventoryOps } from '../inventory'
import { wholeCount, refuseUpgradeOrInstance } from '../inventory'
import { CATEGORIES } from '@/lib/items'
import { storageFor, STARTER_ROD_TIER } from '@/lib/inventoryStorage'

export function localInventory(save: LocalSave): InventoryOps {
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  const homeOwned = (): string[] => (save.homestead?.owned as string[] | null | undefined) ?? []

  return {
    async held(uid, category, id) {
      const prof = me(uid)
      const s = storageFor(category, id)
      switch (s.type) {
        case 'bait': return Number(save.bait[id] ?? 0)
        case 'hold': return Number(save.hold[Number(id)] ?? 0)
        case 'rods': return Number(id) === STARTER_ROD_TIER || save.rods.includes(Number(id)) ? 1 : 0
        case 'list': return ((prof[s.col] as string[] | null) ?? []).includes(id) ? 1 : 0
        case 'homestead': return homeOwned().includes(id) ? 1 : 0
        case 'flag': return prof[s.col] === true ? 1 : 0
        case 'tier': return Number(prof[s.col] ?? 0) >= Number(id) ? 1 : 0
      }
    },

    async heldAll(uid, category) {
      const prof = me(uid)
      const out = new Map<string, number>()
      if (category === 'special' || CATEGORIES[category].kind === 'upgrade' || CATEGORIES[category].kind === 'instance') {
        throw new Error(`heldAll(${category}): read ${category} through held(), or its own system`)
      }
      const s = storageFor(category, '')
      if (s.type === 'bait') for (const [k, q] of Object.entries(save.bait)) { if (q > 0) out.set(k, q) }
      else if (s.type === 'hold') for (const [k, q] of Object.entries(save.hold)) { if (q > 0) out.set(k, q) }
      else if (s.type === 'rods') { out.set(String(STARTER_ROD_TIER), 1); for (const t of save.rods) out.set(String(t), 1) }
      else if (s.type === 'list') for (const id of ((prof[s.col] as string[] | null) ?? [])) out.set(id, (out.get(id) ?? 0) + 1)
      else if (s.type === 'homestead') for (const id of homeOwned()) out.set(id, 1)
      return out
    },

    async give(uid, category, id, n) {
      const prof = me(uid)
      refuseUpgradeOrInstance(category)
      const s = storageFor(category, id)
      if (s.type === 'bait' || s.type === 'hold') {
        const count = wholeCount(n)
        if (count == null) return false
        if (s.type === 'bait') save.bait[id] = Number(save.bait[id] ?? 0) + count
        else save.hold[Number(id)] = Number(save.hold[Number(id)] ?? 0) + count
        return true
      }
      if (s.type === 'rods') {
        const t = Number(id)
        if (t === STARTER_ROD_TIER || save.rods.includes(t)) return false
        save.rods = [...save.rods, t]
        return true
      }
      if (s.type === 'list') {
        const list = (prof[s.col] as string[] | null) ?? []
        if (list.includes(id)) return false
        prof[s.col] = [...list, id]
        return true
      }
      if (s.type === 'flag') {
        if (prof[s.col] === true) return false
        prof[s.col] = true
        return true
      }
      if (s.type === 'homestead') {
        if (!save.homestead) return false
        if (homeOwned().includes(id)) return false
        save.homestead = { ...save.homestead, owned: [...homeOwned(), id] }
        return true
      }
      return false
    },

    async take(uid, category, id, n) {
      const prof = me(uid)
      refuseUpgradeOrInstance(category)
      const s = storageFor(category, id)
      if (s.type === 'bait' || s.type === 'hold') {
        const count = wholeCount(n)
        if (count == null) return false
        const had = s.type === 'bait' ? Number(save.bait[id] ?? 0) : Number(save.hold[Number(id)] ?? 0)
        if (had < count) return false
        if (s.type === 'bait') save.bait[id] = had - count
        else save.hold[Number(id)] = had - count
        return true
      }
      if (s.type === 'rods') {
        const t = Number(id)
        if (t === STARTER_ROD_TIER || !save.rods.includes(t)) return false
        save.rods = save.rods.filter(x => x !== t)
        return true
      }
      if (s.type === 'list') {
        const list = (prof[s.col] as string[] | null) ?? []
        const at = list.indexOf(id)
        if (at < 0) return false
        prof[s.col] = [...list.slice(0, at), ...list.slice(at + 1)]
        return true
      }
      if (s.type === 'flag') {
        if (prof[s.col] !== true) return false
        prof[s.col] = false
        return true
      }
      if (s.type === 'homestead') {
        if (!save.homestead || !homeOwned().includes(id)) return false
        save.homestead = { ...save.homestead, owned: homeOwned().filter(x => x !== id) }
        return true
      }
      return false
    },
  }
}
