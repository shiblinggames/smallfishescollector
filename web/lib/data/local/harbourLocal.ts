// ── THE HARBOUR OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// HarbourData over one captain's save, spreading the sea's. A rod is removed
// once (a sale pays only for the removal that landed), and every tier rises
// through the shared updateProfileIf. The Almanac reads the save's own logs:
// the catch log, the lifetime log, the personal bests and the goldens, and the
// species list shipped with the game.

import type { HarbourData } from '../harbourData'
import type { Row } from '../common'
import { localSeaData } from './seaLocal'
import type { LocalSave } from './save'

/** HarbourData over one captain's local save. */
export function localHarbourData(save: LocalSave): HarbourData {
  const sea = localSeaData(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
  }
  return {
    ...sea,
    async baitRows(uid) {
      me(uid)
      return Object.entries(save.bait).map(([bait_type, quantity]) => ({ bait_type, quantity: Number(quantity) }))
    },
    async takeRod(uid, tier) {
      me(uid)
      if (!save.rods.includes(tier)) return false
      save.rods = save.rods.filter(t => t !== tier)
      return true
    },
    async holdRows(uid) {
      me(uid)
      return Object.entries(save.hold).map(([id, q]) => ({ fish_id: Number(id), quantity: Number(q) }))
    },
    async speciesList() {
      return [...save.species].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)) as Row[]
    },
    async collectionIds(uid) { me(uid); return Object.keys(save.collection).map(Number) },
    async almanacLogs(uid) {
      me(uid)
      return {
        collection: Object.entries(save.collection).map(([id, c]) => ({
          fish_id: Number(id), catch_count: c.catch_count, first_caught_at: null, last_caught_at: c.last_caught_at ?? null, is_golden: c.is_golden,
        })),
        lifetime: Object.entries(save.lifetime).map(([id, l]) => ({
          fish_id: Number(id), catches: l.n, first_caught_at: l.first ?? null, last_caught_at: l.last || null,
        })),
        bests: Object.entries(save.bests).map(([id, b]) => ({ fish_id: Number(id), best_length_in: b.len, caught_at: b.at || null })),
        goldens: [...save.shinies]
          .sort((a, b) => String(b.caught_at).localeCompare(String(a.caught_at)))
          .map(g => ({ id: g.id, fish_id: g.fish_id, size_in: g.size_in, caught_at: g.caught_at, status: g.status, sold_for: (g.sold_for as number | null | undefined) ?? null })),
      }
    },
  }
}
