// ── CREW'S DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// Every read and write the Crew Hall makes: the recruit board, the roster and
// the graveyard, party seats on the two tracks, the locks that hold a hand in
// place (a voyage at sea, a trawl, a bunk), the hall's bunks and upgrades, and
// crew XP. The rules are lib/crewRules; this is only where crew live.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - stampFreeBoard moves the board's date only from the date read, so two
//     readers at the rollover refill the board once;
//   - claimRecruit claims a candidate only while unclaimed;
//   - takeOneShotLegendary clears the gift flag only if it is still set;
//   - stepUp moves a tier (hall, drill, stores) only from the tier read;
//   - claimBunk removes a bunk only at the `since` that was read, and XP is paid
//     only for bunks it removed;
//   - parkTrait never overwrites an open offer, answerTrait answers one once.
//
// Tracks are named ('voyage' | 'raid'), never columns, so a local store is free
// to lay seats out however it likes.

import { captainData, type CaptainData, type Db, type Row } from './common'
import type { CardRow } from '@/lib/crewRules'

export type Track = 'voyage' | 'raid'
const seatCol = (t: Track) => (t === 'voyage' ? 'voyage_slot' : 'raid_slot')

const BOARD_COLS = 'id, slot, source, card_id, rarity, power, dodge, fortune, effects, recruited, start_xp'
const ROSTER_COLS = 'id, card_id, rarity, power, dodge, fortune, effects, pending_trait, voyage_slot, raid_slot, xp, nickname'
const BUNK_COLS = 'id, crew_id, since, rate_per_hour, cap_hours, slot'

export type BunkDbRow = { id: number; crew_id: number; since: string; rate_per_hour: number | null; cap_hours: number | null; slot: number | null }
export type XpGrantRow = { id: number; old_xp: number | null; new_xp: number | null }

export interface CrewData extends CaptainData {
  // ── The catalogue ──
  /** Every crew species card. Static game data. */
  cardCatalog(): Promise<CardRow[]>
  /** A card's id by its species slug (case-insensitive), or null. */
  cardIdBySlug(slug: string): Promise<number | null>

  // ── The recruit board ──
  /** Today's board, by slot. */
  board(uid: string): Promise<Row[]>
  /** Move the free board's date from `prev` (as read) to `today`. True only
   *  for the reader who moved it; that reader refills the board. */
  stampFreeBoard(uid: string, prev: string | null, today: string): Promise<boolean>
  /** Throw the board away and lay down these rows. */
  replaceBoard(uid: string, rows: Row[]): Promise<void>
  /** Claim a candidate while it is still unclaimed; the row, or null. */
  claimRecruit(uid: string, recruitId: number): Promise<Row | null>
  /** Hand a claimed candidate back (the roster was full). */
  unclaimRecruit(uid: string, recruitId: number): Promise<void>
  recruitExists(uid: string, recruitId: number): Promise<boolean>
  /** Spend the one-shot guaranteed-legendary gift, only if still set. */
  takeOneShotLegendary(uid: string): Promise<boolean>

  // ── The roster ──
  /** The living roster, newest first. */
  roster(uid: string): Promise<Row[]>
  /** The fallen, most recent first, with the voyage route they fell on. */
  graveyard(uid: string): Promise<Row[]>
  /** Living hands, optionally of one species. */
  liveCount(uid: string, cardId?: number): Promise<number>
  /** Sign a hand. */
  addCrew(uid: string, fields: Row): Promise<void>
  /** One hand's columns; `liveOnly` skips the fallen. */
  crew(uid: string, crewId: number, cols: string, liveOnly?: boolean): Promise<Row | null>
  /** Several hands' columns, by id (any captain's; ids are the key). */
  crewByIds(ids: number[], cols: string): Promise<Row[]>
  /** Write fields on one hand. False on a write error. */
  updateCrew(uid: string, crewId: number, patch: Row): Promise<boolean>
  /** Let a living hand go. */
  dismiss(uid: string, crewId: number): Promise<void>

  // ── Seats ──
  /** Hands seated on a track, by seat, with their species card. */
  party(uid: string, track: Track): Promise<Row[]>
  /** Unseat whoever holds this seat on this track. */
  vacateSeat(uid: string, track: Track, seat: number): Promise<void>
  /** Unseat every other hand of this species on this track (one of each fish). */
  vacateSpecies(uid: string, track: Track, cardId: number, exceptId: number): Promise<void>
  /** Unseat everyone on a track. */
  clearTrack(uid: string, track: Track): Promise<void>
  /** Who holds the captain's seat (0) on a track, or null. */
  captainOf(uid: string, track: Track): Promise<number | null>

  // ── What holds a hand in place ──
  /** The crew of the voyage at sea, or null when none is. */
  voyageAtSea(uid: string): Promise<number[] | null>
  /** Hands out on a trawl. */
  trawling(uid: string): Promise<number[]>
  onTrawl(uid: string, crewId: number): Promise<boolean>

  // ── The hall's bunks ──
  bunks(uid: string): Promise<BunkDbRow[]>
  bunkOf(uid: string, crewId: number): Promise<BunkDbRow | null>
  /** Put a hand in a bunk; false if the unique keys refused it. */
  addBunk(uid: string, row: { crew_id: number; slot: number; rate_per_hour: number; cap_hours: number }): Promise<boolean>
  /** Remove a bunk only at the `since` read. True if this call removed it. */
  claimBunk(bunkId: number, since: string): Promise<boolean>
  /** Park a trait offer, never over an open one. True if parked. */
  parkTrait(uid: string, crewId: number, parked: string): Promise<boolean>
  /** Answer an open offer once. True if this call answered it. */
  answerTrait(uid: string, crewId: number, patch: Row): Promise<boolean>
  /** Move a tier column (hall, drill, stores) from `from` to `to`, only if it
   *  still reads `from`. True for the request that moved it. */
  stepUp(uid: string, col: 'crew_hall_tier' | 'crew_drill_level' | 'crew_stores_level', from: number, to: number): Promise<boolean>

  // ── Crew XP (atomic in the store; the rows say who moved from what to what) ──
  grantXpToSeated(uid: string, xp: number): Promise<XpGrantRow[]>
  grantXpToIds(uid: string, ids: number[], xp: number): Promise<XpGrantRow[]>
  grantXpPairs(uid: string, pairs: { id: number; xp: number }[]): Promise<XpGrantRow[]>
}

/** CrewData over Supabase. */
export function crewData(admin: Db): CrewData {
  return {
    ...captainData(admin),

    async cardCatalog() {
      const { data } = await admin.from('cards').select('id, name, filename, slug, power, dodge, fortune')
      return (data ?? []) as CardRow[]
    },
    async cardIdBySlug(slug) {
      const { data } = await admin.from('cards').select('id').ilike('slug', slug).single()
      return data ? (data.id as number) : null
    },

    async board(uid) {
      const { data } = await admin.from('daily_recruits').select(BOARD_COLS).eq('user_id', uid).order('slot')
      return (data ?? []) as Row[]
    },
    async stampFreeBoard(uid, prev, today) {
      let q = admin.from('profiles').update({ last_free_recruit_date: today }).eq('id', uid)
      q = prev === null ? q.is('last_free_recruit_date', null) : q.eq('last_free_recruit_date', prev)
      const { data } = await q.select('id')
      return !!data && data.length > 0
    },
    async replaceBoard(uid, rows) {
      await admin.from('daily_recruits').delete().eq('user_id', uid)
      if (rows.length) await admin.from('daily_recruits').insert(rows)
    },
    async claimRecruit(uid, recruitId) {
      const { data } = await admin.from('daily_recruits').update({ recruited: true })
        .eq('id', recruitId).eq('user_id', uid).eq('recruited', false).select(BOARD_COLS)
      return (data?.[0] as Row | undefined) ?? null
    },
    async unclaimRecruit(uid, recruitId) {
      await admin.from('daily_recruits').update({ recruited: false }).eq('id', recruitId).eq('user_id', uid)
    },
    async recruitExists(uid, recruitId) {
      const { data } = await admin.from('daily_recruits').select('id').eq('id', recruitId).eq('user_id', uid).maybeSingle()
      return !!data
    },
    async takeOneShotLegendary(uid) {
      const { data } = await admin.from('profiles')
        .update({ crew_next_roll_legendary: false, crew_next_roll_legendary_slug: null })
        .eq('id', uid).eq('crew_next_roll_legendary', true).select('id')
      return !!data && data.length > 0
    },

    async roster(uid) {
      const { data } = await admin.from('user_crew').select(ROSTER_COLS).eq('user_id', uid).is('died_at', null).order('recruited_at', { ascending: false })
      return (data ?? []) as Row[]
    },
    async graveyard(uid) {
      const { data } = await admin.from('user_crew')
        .select('id, card_id, rarity, power, dodge, fortune, effects, xp, nickname, died_at, died_on_voyage_id, died_hardcore_depth, voyage:daily_voyages!died_on_voyage_id(route)')
        .eq('user_id', uid).not('died_at', 'is', null).order('died_at', { ascending: false })
      return (data ?? []) as Row[]
    },
    async liveCount(uid, cardId) {
      let q = admin.from('user_crew').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      if (cardId !== undefined) q = q.eq('card_id', cardId)
      const { count } = await q.is('died_at', null)
      return count ?? 0
    },
    async addCrew(uid, fields) {
      await admin.from('user_crew').insert({ user_id: uid, ...fields })
    },
    async crew(uid, crewId, cols, liveOnly = true) {
      let q = admin.from('user_crew').select(cols).eq('id', crewId).eq('user_id', uid)
      if (liveOnly) q = q.is('died_at', null)
      const { data } = await q.maybeSingle()
      return (data as Row | null) ?? null
    },
    async crewByIds(ids, cols) {
      if (!ids.length) return []
      const { data } = await admin.from('user_crew').select(cols).in('id', ids)
      return (data ?? []) as Row[]
    },
    async updateCrew(uid, crewId, patch) {
      const { error } = await admin.from('user_crew').update(patch).eq('id', crewId).eq('user_id', uid)
      return !error
    },
    async dismiss(uid, crewId) {
      await admin.from('user_crew').delete().eq('id', crewId).eq('user_id', uid).is('died_at', null)
    },

    async party(uid, track) {
      const col = seatCol(track)
      const { data } = await admin.from('user_crew')
        .select(`id, ${col}, rarity, power, dodge, fortune, effects, xp, nickname, cards(name, filename, slug)`)
        .eq('user_id', uid).is('died_at', null).not(col, 'is', null).order(col)
      return ((data ?? []) as Row[]).map(r => ({ ...r, seat: r[col] as number }))
    },
    async vacateSeat(uid, track, seat) {
      const col = seatCol(track)
      await admin.from('user_crew').update({ [col]: null }).eq('user_id', uid).eq(col, seat)
    },
    async vacateSpecies(uid, track, cardId, exceptId) {
      const col = seatCol(track)
      await admin.from('user_crew').update({ [col]: null }).eq('user_id', uid).eq('card_id', cardId).neq('id', exceptId)
    },
    async clearTrack(uid, track) {
      const col = seatCol(track)
      await admin.from('user_crew').update({ [col]: null }).eq('user_id', uid).not(col, 'is', null)
    },
    async captainOf(uid, track) {
      const { data } = await admin.from('user_crew').select('id').eq('user_id', uid).is('died_at', null).eq(seatCol(track), 0).maybeSingle()
      return data ? (data.id as number) : null
    },

    async voyageAtSea(uid) {
      const { data } = await admin.from('daily_voyages').select('crew_variant_ids').eq('user_id', uid).eq('status', 'pending').maybeSingle()
      if (!data) return null
      return Array.isArray(data.crew_variant_ids) ? (data.crew_variant_ids as number[]) : []
    },
    async trawling(uid) {
      const { data } = await admin.from('trawls').select('crew_id').eq('user_id', uid)
      return ((data ?? []) as { crew_id: number | null }[]).map(t => t.crew_id).filter((v): v is number => v != null)
    },
    async onTrawl(uid, crewId) {
      const { data } = await admin.from('trawls').select('id').eq('user_id', uid).eq('crew_id', crewId).maybeSingle()
      return !!data
    },

    async bunks(uid) {
      const { data } = await admin.from('crew_hall_bunks').select(BUNK_COLS).eq('user_id', uid)
      return (data ?? []) as BunkDbRow[]
    },
    async bunkOf(uid, crewId) {
      const { data } = await admin.from('crew_hall_bunks').select(BUNK_COLS).eq('user_id', uid).eq('crew_id', crewId).maybeSingle()
      return (data as BunkDbRow | null) ?? null
    },
    async addBunk(uid, row) {
      const { error } = await admin.from('crew_hall_bunks').insert({ user_id: uid, ...row })
      return !error
    },
    async claimBunk(bunkId, since) {
      const { data } = await admin.from('crew_hall_bunks').delete().eq('id', bunkId).eq('since', since).select('id')
      return (data ?? []).length > 0
    },
    async parkTrait(uid, crewId, parked) {
      const { data } = await admin.from('user_crew').update({ pending_trait: parked })
        .eq('id', crewId).eq('user_id', uid).is('pending_trait', null).select('id')
      return (data ?? []).length > 0
    },
    async answerTrait(uid, crewId, patch) {
      const { data } = await admin.from('user_crew').update(patch)
        .eq('id', crewId).eq('user_id', uid).not('pending_trait', 'is', null).select('id')
      return (data ?? []).length > 0
    },
    async stepUp(uid, col, from, to) {
      const { data } = await admin.from('profiles').update({ [col]: to }).eq('id', uid).eq(col, from).select('id')
      return (data ?? []).length > 0
    },

    async grantXpToSeated(uid, xp) {
      const { data } = await admin.rpc('grant_crew_xp_to_assigned', { uid, grant_xp: xp })
      return (data ?? []) as XpGrantRow[]
    },
    async grantXpToIds(uid, ids, xp) {
      const { data } = await admin.rpc('grant_crew_xp_to_ids', { uid, crew_ids: ids, grant_xp: xp })
      return (data ?? []) as XpGrantRow[]
    },
    async grantXpPairs(uid, pairs) {
      const { data } = await admin.rpc('grant_crew_xp_pairs', { uid, pairs })
      return (data ?? []) as XpGrantRow[]
    },
  }
}
