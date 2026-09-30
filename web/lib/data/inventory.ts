// ── THE INVENTORY, ONE INTERFACE (the item system, stage 2, 2026-09-30) ──
//
// Every owned thing through four questions (how many, all of a kind, give,
// take), whatever table or column it lives in today (lib/inventoryStorage). It
// sits on CaptainData, so every system's store has it; this is the web's
// implementation over Supabase, and lib/data/local/inventoryLocal is the
// desktop's over the save.
//
// What each kind answers (lib/items):
//   stack    held = the count; give adds; take removes, only if there are enough
//   unlock   held = 1 or 0; give = false if already owned; take = false if not
//   upgrade  held = 1 when the level has reached the id; never given or taken
//            here (a level is bought through its own system)
// Crew and goldens are one-of-a-kind rows with systems of their own.
//
// Raid items keep today's rule until stage 3: owned once (the list is
// deduplicated), so held is 0 or 1 and give refuses a second copy.

import type { Db } from './common'
import { CATEGORIES, type ItemCategory } from '@/lib/items'
import { storageFor, STARTER_ROD_TIER } from '@/lib/inventoryStorage'
import { arrayAdd } from '@/lib/wallet'

export interface InventoryOps {
  /** How many of this the captain holds. */
  held(uid: string, category: ItemCategory, id: string): Promise<number>
  /** Everything of a category the captain holds, id to count. */
  heldAll(uid: string, category: ItemCategory): Promise<Map<string, number>>
  /** Give n (stacks) or the one (unlocks). False when nothing changed. */
  give(uid: string, category: ItemCategory, id: string, n?: number): Promise<boolean>
  /** Take n (stacks) or the one (unlocks), only if held. False when refused. */
  take(uid: string, category: ItemCategory, id: string, n?: number): Promise<boolean>
}

/** A stack's count to write: a positive whole number, or refused. */
export function wholeCount(n: number | undefined): number | null {
  const v = n ?? 1
  return Number.isInteger(v) && v > 0 ? v : null
}

export function refuseUpgradeOrInstance(category: ItemCategory): void {
  const kind = CATEGORIES[category].kind
  if (kind === 'upgrade') throw new Error(`${category} is an upgrade: it is bought through its own system, never given or taken`)
  if (kind === 'instance') throw new Error(`${category} is one of a kind: it has a system of its own`)
}

export function webInventory(admin: Db): InventoryOps {
  const listOf = async (uid: string, col: string): Promise<string[]> => {
    const { data } = await admin.from('profiles').select(col).eq('id', uid).single()
    return ((data as Record<string, unknown> | null)?.[col] as string[] | null) ?? []
  }
  const homeOwned = async (uid: string): Promise<string[]> => {
    const { data } = await admin.from('homesteads').select('owned').eq('user_id', uid).maybeSingle()
    return ((data as { owned: string[] | null } | null)?.owned) ?? []
  }

  const ops: InventoryOps = {
    async held(uid, category, id) {
      const s = storageFor(category, id)
      switch (s.type) {
        case 'bait': {
          const { data } = await admin.from('bait_inventory').select('quantity').eq('user_id', uid).eq('bait_type', id).maybeSingle()
          return Number((data as { quantity: number } | null)?.quantity ?? 0)
        }
        case 'hold': {
          const { data } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid).eq('fish_id', Number(id)).maybeSingle()
          return Number((data as { quantity: number } | null)?.quantity ?? 0)
        }
        case 'rods': {
          if (Number(id) === STARTER_ROD_TIER) return 1
          const { data } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', uid).eq('rod_tier', Number(id)).limit(1)
          return (data ?? []).length > 0 ? 1 : 0
        }
        case 'list': return (await listOf(uid, s.col)).includes(id) ? 1 : 0
        case 'homestead': return (await homeOwned(uid)).includes(id) ? 1 : 0
        case 'flag': {
          const { data } = await admin.from('profiles').select(s.col).eq('id', uid).single()
          return (data as Record<string, unknown> | null)?.[s.col] === true ? 1 : 0
        }
        case 'tier': {
          const { data } = await admin.from('profiles').select(s.col).eq('id', uid).single()
          return Number((data as Record<string, unknown> | null)?.[s.col] ?? 0) >= Number(id) ? 1 : 0
        }
      }
    },

    async heldAll(uid, category) {
      const out = new Map<string, number>()
      if (category === 'special' || CATEGORIES[category].kind === 'upgrade' || CATEGORIES[category].kind === 'instance') {
        throw new Error(`heldAll(${category}): read ${category} through held(), or its own system`)
      }
      const s = storageFor(category, '')
      if (s.type === 'bait') {
        const { data } = await admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', uid)
        for (const r of (data ?? []) as { bait_type: string; quantity: number }[]) if (r.quantity > 0) out.set(r.bait_type, r.quantity)
      } else if (s.type === 'hold') {
        const { data } = await admin.from('fish_inventory').select('fish_id, quantity').eq('user_id', uid)
        for (const r of (data ?? []) as { fish_id: number; quantity: number }[]) if (r.quantity > 0) out.set(String(r.fish_id), r.quantity)
      } else if (s.type === 'rods') {
        out.set(String(STARTER_ROD_TIER), 1)
        const { data } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', uid)
        for (const r of (data ?? []) as { rod_tier: number }[]) out.set(String(r.rod_tier), 1)
      } else if (s.type === 'list') {
        for (const id of await listOf(uid, s.col)) out.set(id, (out.get(id) ?? 0) + 1)
      } else if (s.type === 'homestead') {
        for (const id of await homeOwned(uid)) out.set(id, 1)
      }
      return out
    },

    async give(uid, category, id, n) {
      refuseUpgradeOrInstance(category)
      const s = storageFor(category, id)
      if (s.type === 'bait' || s.type === 'hold') {
        const count = wholeCount(n)
        if (count == null) return false
        if (s.type === 'bait') {
          await admin.rpc('upsert_bait', { p_user_id: uid, p_bait_type: id, p_qty: count })
          return true
        }
        // No hold-space check here: the hold's capacity is the caller's rule
        // (the catch path and the chest each apply their own).
        const fishId = Number(id)
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid).eq('fish_id', fishId).maybeSingle()
          if (data) {
            const had = Number((data as { quantity: number }).quantity ?? 0)
            const { data: done } = await admin.from('fish_inventory').update({ quantity: had + count })
              .eq('user_id', uid).eq('fish_id', fishId).eq('quantity', had).select('user_id')
            if ((done ?? []).length > 0) return true
          } else {
            // Keyed on (user_id, fish_id): a twin insert fails and goes round again.
            const { error } = await admin.from('fish_inventory').insert({ user_id: uid, fish_id: fishId, quantity: count })
            if (!error) return true
          }
        }
        return false
      }
      if (s.type === 'rods') {
        if (Number(id) === STARTER_ROD_TIER) return false
        // Keyed on (user_id, rod_tier): the insert IS the lock.
        const { error } = await admin.from('rod_inventory').insert({ user_id: uid, rod_tier: Number(id) })
        return !error
      }
      if (s.type === 'list') return arrayAdd(admin, uid, s.col, id)
      if (s.type === 'flag') {
        const { data } = await admin.from('profiles').update({ [s.col]: true }).eq('id', uid).or(`${s.col}.is.null,${s.col}.eq.false`).select('id')
        return (data ?? []).length > 0
      }
      if (s.type === 'homestead') {
        const owned = await homeOwned(uid)
        if (owned.includes(id)) return false
        const { data } = await admin.from('homesteads').update({ owned: [...owned, id] }).eq('user_id', uid).select('user_id')
        return (data ?? []).length > 0
      }
      return false
    },

    async take(uid, category, id, n) {
      refuseUpgradeOrInstance(category)
      const s = storageFor(category, id)
      if (s.type === 'bait' || s.type === 'hold') {
        const count = wholeCount(n)
        if (count == null) return false
        const table = s.type === 'bait' ? 'bait_inventory' : 'fish_inventory'
        const key = s.type === 'bait' ? 'bait_type' : 'fish_id'
        const keyVal = s.type === 'bait' ? id : Number(id)
        // Read, then write only if the count is still what was read: two takes
        // racing each see the same count and only one lands.
        const { data } = await admin.from(table).select('quantity').eq('user_id', uid).eq(key, keyVal).maybeSingle()
        const had = Number((data as { quantity: number } | null)?.quantity ?? 0)
        if (had < count) return false
        const { data: done } = await admin.from(table).update({ quantity: had - count })
          .eq('user_id', uid).eq(key, keyVal).eq('quantity', had).select('user_id')
        return (done ?? []).length > 0
      }
      if (s.type === 'rods') {
        if (Number(id) === STARTER_ROD_TIER) return false
        const { data } = await admin.from('rod_inventory').delete().eq('user_id', uid).eq('rod_tier', Number(id)).select('rod_tier')
        return (data ?? []).length > 0
      }
      if (s.type === 'list') {
        const list = await listOf(uid, s.col)
        const at = list.indexOf(id)
        if (at < 0) return false
        const next = [...list.slice(0, at), ...list.slice(at + 1)]
        // Guarded on still holding it. (A concurrent add to the same list between
        // the read and this write would be lost, as it is for the forge today;
        // stage 3 gives lists atomic add and remove in the database.)
        const { data } = await admin.from('profiles').update({ [s.col]: next }).eq('id', uid).contains(s.col, [id]).select('id')
        return (data ?? []).length > 0
      }
      if (s.type === 'flag') {
        const { data } = await admin.from('profiles').update({ [s.col]: false }).eq('id', uid).eq(s.col, true).select('id')
        return (data ?? []).length > 0
      }
      if (s.type === 'homestead') {
        const owned = await homeOwned(uid)
        if (!owned.includes(id)) return false
        const { data } = await admin.from('homesteads').update({ owned: owned.filter(x => x !== id) }).eq('user_id', uid).contains('owned', [id]).select('user_id')
        return (data ?? []).length > 0
      }
      return false
    },
  }
  return ops
}
