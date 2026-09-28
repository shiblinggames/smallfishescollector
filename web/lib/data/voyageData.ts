// ── VOYAGES' AND TRAWLS' DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// The daily voyage and the crew trawls: where a voyage is held while at sea,
// the one-at-sea launch, the reveal's flip, the captain's log; a trawl's row,
// its launch and its collect. The rules are lib/voyageRules and
// lib/trawlRules. Both extend CrewData, since both move crew.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - launchVoyage refuses a second voyage while one is at sea ('taken');
//   - markRevealed flips a voyage once, and only the flipper pays;
//   - claimTrawl removes a trawl once, and only the remover is paid.

import { crewData, type CrewData } from './crewData'
import type { Db, Row } from './common'

export interface VoyageData extends CrewData {
  /** The captain's most recent voyages, newest first. */
  recentVoyages(uid: string, limit: number): Promise<Row[]>
  /** Is a voyage at sea (or waiting to be revealed)? */
  voyageOut(uid: string): Promise<boolean>
  /** Is a raid in progress? */
  raidInProgress(uid: string): Promise<boolean>
  /** Put a voyage to sea. 'taken' when one already is. */
  launchVoyage(uid: string, row: Row): Promise<{ voyage: Row } | { taken: true } | { failed: true }>
  /** One of the captain's voyages, or null. */
  voyage(uid: string, voyageId: number): Promise<Row | null>
  /** Flip a voyage to revealed. True only for the request that flipped it. */
  markRevealed(uid: string, voyageId: number): Promise<boolean>
  /** Voyages ever revealed. */
  revealedCount(uid: string): Promise<number>
  /** The voyage's written log, or null. */
  captainsLog(uid: string, voyageId: number): Promise<string | null>
}

export interface TrawlData extends CrewData {
  /** Every trawl out. */
  trawlsOut(uid: string): Promise<{ id: number; zone: string; crew_id: number; ends_at: string }[]>
  /** The trawl in one zone, or null. */
  trawlIn(uid: string, zone: string): Promise<{ id: number; crew_id: number; ends_at: string } | null>
  /** Send a trawl; false if it could not be written. */
  sendTrawl(uid: string, zone: string, crewId: number, endsAt: string): Promise<boolean>
  /** Bring a trawl in. True only for the request that removed it. */
  claimTrawl(trawlId: number): Promise<boolean>
  /** Is this hand on the voyage at sea? */
  onVoyage(uid: string, crewId: number): Promise<boolean>
  /** Up to `limit` species names from a habitat, for the haul's reveal. */
  speciesNamesIn(habitat: string, limit: number): Promise<string[]>
}

/** VoyageData over Supabase. */
export function voyageData(admin: Db): VoyageData {
  return {
    ...crewData(admin),

    async recentVoyages(uid, limit) {
      const { data } = await admin.from('daily_voyages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(limit)
      return (data ?? []) as Row[]
    },
    async voyageOut(uid) {
      const { data } = await admin.from('daily_voyages').select('id').eq('user_id', uid).eq('status', 'pending').maybeSingle()
      return !!data
    },
    async raidInProgress(uid) {
      const { data } = await admin.from('expeditions').select('id').eq('user_id', uid).eq('status', 'active').maybeSingle()
      return !!data
    },
    async launchVoyage(uid, row) {
      const { data, error } = await admin.from('daily_voyages').insert({ user_id: uid, ...row }).select('*').single()
      // ONE SHIP AT SEA: the partial unique index daily_voyages_one_pending
      // refuses a second pending voyage.
      if (error?.code === '23505') return { taken: true }
      if (error || !data) return { failed: true }
      return { voyage: data as Row }
    },
    async voyage(uid, voyageId) {
      const { data } = await admin.from('daily_voyages').select('*').eq('id', voyageId).eq('user_id', uid).single()
      return (data as Row | null) ?? null
    },
    async markRevealed(uid, voyageId) {
      const { data } = await admin.from('daily_voyages').update({ status: 'revealed' })
        .eq('id', voyageId).eq('user_id', uid).neq('status', 'revealed').select('id')
      return !!data && data.length > 0
    },
    async revealedCount(uid) {
      const { count } = await admin.from('daily_voyages').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'revealed')
      return count ?? 0
    },
    async captainsLog(uid, voyageId) {
      const { data } = await admin.from('daily_voyages').select('captains_log').eq('id', voyageId).eq('user_id', uid).single()
      return (data?.captains_log as string | null) ?? null
    },
  }
}

/** TrawlData over Supabase. */
export function trawlData(admin: Db): TrawlData {
  return {
    ...crewData(admin),

    async trawlsOut(uid) {
      const { data } = await admin.from('trawls').select('id, zone, crew_id, ends_at').eq('user_id', uid)
      return (data ?? []) as { id: number; zone: string; crew_id: number; ends_at: string }[]
    },
    async trawlIn(uid, zone) {
      const { data } = await admin.from('trawls').select('id, crew_id, ends_at').eq('user_id', uid).eq('zone', zone).maybeSingle()
      return (data as { id: number; crew_id: number; ends_at: string } | null) ?? null
    },
    async sendTrawl(uid, zone, crewId, endsAt) {
      const { error } = await admin.from('trawls').insert({ user_id: uid, zone, crew_id: crewId, ends_at: endsAt })
      return !error
    },
    async claimTrawl(trawlId) {
      const { data } = await admin.from('trawls').delete().eq('id', trawlId).select('id')
      return !!data && data.length > 0
    },
    async onVoyage(uid, crewId) {
      const { data } = await admin.from('daily_voyages').select('id').eq('user_id', uid).eq('status', 'pending').contains('crew_variant_ids', [crewId]).maybeSingle()
      return !!data
    },
    async speciesNamesIn(habitat, limit) {
      const { data } = await admin.from('fish_species').select('name').eq('habitat', habitat).limit(limit)
      return ((data ?? []) as { name: string }[]).map(r => r.name)
    },
  }
}
