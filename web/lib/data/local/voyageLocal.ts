// ── VOYAGES AND TRAWLS OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// VoyageData and TrawlData over one captain's save, as one store (they both
// extend the crew's, and the roll call reads both). The one-shot contracts in
// lib/data/voyageData hold here too: one voyage at sea at a time (a second
// launch is 'taken'), a voyage flips to revealed once, a trawl is claimed once.
//
// Raids are not modelled offline yet, so no raid is ever in progress here.

import type { SeaCrewData } from '../voyageData'
import { localCrewData } from './crewLocal'
import { localCaptain, type LocalSave, type LocalVoyageRow } from './save'
import { clockNow } from '@/lib/clock'

/** Voyages and trawls (and the crew under them) over one captain's local save. */
export function localVoyageData(save: LocalSave): SeaCrewData {
  const crew = localCrewData(save)
  const me = (uid: string) => { if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`) }
  const newest = () => [...save.voyages].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)

  return {
    ...crew,

    // ── The daily voyage ──
    async recentVoyages(uid, limit) { me(uid); return newest().slice(0, limit).map(v => structuredClone(v)) },
    async voyageOut(uid) { me(uid); return save.voyages.some(v => v.status === 'pending') },
    async raidInProgress(uid) { me(uid); return false },
    async launchVoyage(uid, row) {
      me(uid)
      // ONE SHIP AT SEA, as the web's partial unique index has it.
      if (save.voyages.some(v => v.status === 'pending')) return { taken: true }
      const v: LocalVoyageRow = {
        id: save.nextId++, created_at: new Date(clockNow()).toISOString(), captains_log: null, log_generated_at: null,
        ...(structuredClone(row) as Omit<LocalVoyageRow, 'id' | 'created_at' | 'captains_log' | 'log_generated_at'>),
      }
      save.voyages.push(v)
      return { voyage: structuredClone(v) }
    },
    async voyage(uid, voyageId) { me(uid); const v = save.voyages.find(x => x.id === voyageId); return v ? structuredClone(v) : null },
    async markRevealed(uid, voyageId) {
      me(uid)
      const v = save.voyages.find(x => x.id === voyageId)
      if (!v || v.status === 'revealed') return false
      v.status = 'revealed'; return true
    },
    async revealedCount(uid) { me(uid); return save.voyages.filter(v => v.status === 'revealed').length },
    async captainsLog(uid, voyageId) { me(uid); return save.voyages.find(v => v.id === voyageId)?.captains_log ?? null },
    async revealedVoyages(uid, limit) {
      me(uid)
      return newest().filter(v => v.status === 'revealed').slice(0, limit).map(v => ({
        id: v.id, route: v.route, total_doubloons: v.total_doubloons, total_gems: v.total_gems, crew_lost: [...v.crew_lost],
        created_at: v.created_at, captains_log: v.captains_log, events: structuredClone(v.events),
        tide_turner_drop: v.tide_turner_drop, phantom_hook_drop: v.phantom_hook_drop,
      }))
    },
    // Stamped like the web's grantBadgeDirect (lib/data/local/save).
    grantBadge: (uid, badgeId) => localCaptain(save).grantBadge(uid, badgeId),

    // ── Trawls ──
    async trawlsOut(uid) { me(uid); return save.trawls.map(t => ({ ...t })) },
    async trawlIn(uid, zone) { me(uid); const t = save.trawls.find(x => x.zone === zone); return t ? { id: t.id, crew_id: t.crew_id, ends_at: t.ends_at } : null },
    async sendTrawl(uid, zone, crewId, endsAt) {
      me(uid)
      // One trawl per zone and one per hand, as the web table's keys have it.
      if (save.trawls.some(t => t.zone === zone || t.crew_id === crewId)) return false
      save.trawls.push({ id: save.nextId++, zone, crew_id: crewId, ends_at: endsAt }); return true
    },
    async claimTrawl(trawlId) {
      const i = save.trawls.findIndex(t => t.id === trawlId)
      if (i < 0) return false
      save.trawls.splice(i, 1); return true
    },
    async onVoyage(uid, crewId) { me(uid); return save.voyages.some(v => v.status === 'pending' && v.crew_variant_ids.includes(crewId)) },
    async speciesNamesIn(habitat, limit) { return save.species.filter(f => f.habitat === habitat).slice(0, limit).map(f => f.name) },
  }
}
