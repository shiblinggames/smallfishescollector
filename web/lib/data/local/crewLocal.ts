// ── THE CREW HALL OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// CrewData over one captain's save: the recruit board, every hand signed (the
// fallen stay, they are the graveyard), party seats, bunks, the hall's tiers
// and crew XP. The one-shot contracts in lib/data/crewData hold here too: the
// free board is stamped once a day, a candidate is claimed once, the gifted
// legendary is spent once, a tier moves only from the tier read, a bunk is
// claimed only at its `since`, a trait offer is parked over nothing and
// answered once.
//
// The card catalogue is game content (content/cards.json), not save data.
//
// NOT MODELLED YET: voyages and trawls (their stage comes next). Until then no
// hand is ever at sea or out on a trawl offline, so those locks never hold.

import type { CrewData, Track, BunkDbRow, XpGrantRow } from '../crewData'
import type { CardRow } from '@/lib/crewRules'
import type { Row } from '../common'
import { localCaptain, type LocalSave, type LocalCrewRow } from './save'
import { clockNow } from '@/lib/clock'
import cardsJson from '@/content/cards.json'

const CARDS = (cardsJson as unknown as CardRow[]).map(c => ({
  id: c.id, name: c.name, filename: c.filename, slug: c.slug, power: c.power, dodge: c.dodge, fortune: c.fortune,
})) as CardRow[]

const seatCol = (t: Track) => (t === 'voyage' ? 'voyage_slot' : 'raid_slot') as 'voyage_slot' | 'raid_slot'
const nowIso = () => new Date(clockNow()).toISOString()

/** A hand as the web's selects return it: the row, and the species card when
 *  the columns ask for the `cards(...)` join. Extra columns are harmless. */
function shaped(c: LocalCrewRow, cols: string): Row {
  if (!cols.includes('cards(')) return { ...c }
  const card = CARDS.find(k => k.id === c.card_id)
  return { ...c, cards: card ? { name: card.name, slug: card.slug, filename: card.filename } : null }
}

/** CrewData over one captain's local save. */
export function localCrewData(save: LocalSave): CrewData {
  const captain = localCaptain(save)
  const { me } = captain
  const live = () => save.crew.filter(c => c.died_at == null)
  const nextId = () => save.nextId++
  const xpRows = (list: { c: LocalCrewRow; xp: number }[]): XpGrantRow[] =>
    list.map(({ c, xp }) => { c.xp += xp; return { id: c.id, old_xp: c.xp - xp, new_xp: c.xp } })

  return {
    ...captain,
    grant: (uid, col, n) => captain.grant(uid, col, n),
    spend: (uid, col, n) => captain.spend(uid, col, n),

    // ── The catalogue ──
    async cardCatalog() { return CARDS.map(c => ({ ...c })) },
    async cardIdBySlug(slug) { return CARDS.find(c => c.slug.toLowerCase() === slug.toLowerCase())?.id ?? null },

    // ── The recruit board ──
    async board(uid) { me(uid); return [...save.recruits].sort((a, b) => a.slot - b.slot).map(r => ({ ...r })) },
    async stampFreeBoard(uid, prev, today) {
      const prof = me(uid)
      if ((prof.last_free_recruit_date ?? null) !== prev) return false
      prof.last_free_recruit_date = today; return true
    },
    async replaceBoard(uid, rows) {
      me(uid)
      save.recruits = rows.map(r => ({
        id: nextId(), slot: Number(r.slot), source: r.source, card_id: Number(r.card_id), rarity: Number(r.rarity),
        power: Number(r.power), dodge: Number(r.dodge), fortune: Number(r.fortune), effects: [...(r.effects ?? [])],
        recruited: false, start_xp: Number(r.start_xp ?? 0),
      }))
    },
    async claimRecruit(uid, recruitId) {
      me(uid)
      const r = save.recruits.find(x => x.id === recruitId)
      if (!r || r.recruited) return null
      r.recruited = true; return { ...r }
    },
    async unclaimRecruit(uid, recruitId) { me(uid); const r = save.recruits.find(x => x.id === recruitId); if (r) r.recruited = false },
    async recruitExists(uid, recruitId) { me(uid); return save.recruits.some(x => x.id === recruitId) },
    async takeOneShotLegendary(uid) {
      const prof = me(uid)
      if (prof.crew_next_roll_legendary !== true) return false
      prof.crew_next_roll_legendary = false; prof.crew_next_roll_legendary_slug = null; return true
    },

    // ── The roster ──
    async roster(uid) {
      me(uid)
      return live().sort((a, b) => b.recruited_at.localeCompare(a.recruited_at) || b.id - a.id).map(c => ({ ...c }))
    },
    async graveyard(uid) {
      me(uid)
      // The voyage a hand fell on is not modelled offline yet, so its route is unknown.
      return save.crew.filter(c => c.died_at != null).sort((a, b) => b.died_at!.localeCompare(a.died_at!)).map(c => ({ ...c, voyage: null }))
    },
    async liveCount(uid, cardId) { me(uid); return live().filter(c => cardId === undefined || c.card_id === cardId).length },
    async addCrew(uid, f) {
      me(uid)
      save.crew.push({
        id: nextId(), card_id: Number(f.card_id), rarity: Number(f.rarity), power: Number(f.power), dodge: Number(f.dodge),
        fortune: Number(f.fortune), effects: [...(f.effects ?? [])], pending_trait: null,
        voyage_slot: f.voyage_slot ?? null, raid_slot: f.raid_slot ?? null, xp: Number(f.xp ?? 0), nickname: null,
        recruited_at: nowIso(), died_at: null, died_on_voyage_id: null, died_hardcore_depth: null,
      })
    },
    async crew(uid, crewId, cols, liveOnly = true) {
      me(uid)
      const c = save.crew.find(x => x.id === crewId && (!liveOnly || x.died_at == null))
      return c ? shaped(c, cols) : null
    },
    async crewByIds(ids, cols, uid) {
      if (uid !== undefined) me(uid)
      return save.crew.filter(c => ids.includes(c.id)).map(c => shaped(c, cols))
    },
    async livingCrew(uid, cols) { me(uid); return live().map(c => shaped(c, cols)) },
    async markFallen(uid, ids, voyageId, at) {
      me(uid)
      for (const c of save.crew) if (ids.includes(c.id)) Object.assign(c, { died_at: at, died_on_voyage_id: voyageId, voyage_slot: null, raid_slot: null })
    },
    async updateCrew(uid, crewId, patch) {
      me(uid)
      const c = save.crew.find(x => x.id === crewId)
      if (c) Object.assign(c, structuredClone(patch))
      return true
    },
    async dismiss(uid, crewId) { me(uid); save.crew = save.crew.filter(c => !(c.id === crewId && c.died_at == null)) },

    // ── Seats ──
    async party(uid, track) {
      me(uid)
      const col = seatCol(track)
      return live().filter(c => c[col] != null).sort((a, b) => (a[col] as number) - (b[col] as number))
        .map(c => ({ ...shaped(c, 'cards('), seat: c[col] as number }))
    },
    async vacateSeat(uid, track, seat) { me(uid); const col = seatCol(track); for (const c of save.crew) if (c[col] === seat) c[col] = null },
    async vacateSpecies(uid, track, cardId, exceptId) {
      me(uid); const col = seatCol(track)
      for (const c of save.crew) if (c.card_id === cardId && c.id !== exceptId) c[col] = null
    },
    async clearTrack(uid, track) { me(uid); const col = seatCol(track); for (const c of save.crew) c[col] = null },
    async captainOf(uid, track) { me(uid); const col = seatCol(track); return live().find(c => c[col] === 0)?.id ?? null },

    // ── What holds a hand in place: voyages and trawls are the next stage ──
    async voyageAtSea(uid) { me(uid); return null },
    async trawling(uid) { me(uid); return [] },
    async onTrawl(uid) { me(uid); return false },

    // ── The hall's bunks ──
    async bunks(uid) { me(uid); return save.bunks.map(b => ({ ...b })) as BunkDbRow[] },
    async bunkOf(uid, crewId) { me(uid); const b = save.bunks.find(x => x.crew_id === crewId); return b ? { ...b } : null },
    async addBunk(uid, row) {
      me(uid)
      // The unique keys the web table has: one bunk per hand, one hand per bunk.
      if (save.bunks.some(b => b.crew_id === row.crew_id || b.slot === row.slot)) return false
      save.bunks.push({ id: nextId(), since: nowIso(), ...row }); return true
    },
    async claimBunk(bunkId, since) {
      const i = save.bunks.findIndex(b => b.id === bunkId && b.since === since)
      if (i < 0) return false
      save.bunks.splice(i, 1); return true
    },
    async parkTrait(uid, crewId, parked) {
      me(uid)
      const c = save.crew.find(x => x.id === crewId)
      if (!c || c.pending_trait != null) return false
      c.pending_trait = parked; return true
    },
    async answerTrait(uid, crewId, patch) {
      me(uid)
      const c = save.crew.find(x => x.id === crewId)
      if (!c || c.pending_trait == null) return false
      Object.assign(c, structuredClone(patch)); return true
    },
    async stepUp(uid, col, from, to) {
      const prof = me(uid)
      if (prof[col] !== from) return false
      prof[col] = to; return true
    },

    // ── Crew XP: the grant_crew_xp_* functions, as plain arithmetic ──
    async grantXpToSeated(uid, xp) { me(uid); return xpRows(live().filter(c => c.raid_slot != null).map(c => ({ c, xp }))) },
    async grantXpToIds(uid, ids, xp) { me(uid); return xpRows(live().filter(c => ids.includes(c.id)).map(c => ({ c, xp }))) },
    async grantXpPairs(uid, pairs) {
      me(uid)
      return xpRows(pairs.filter(p => p.xp > 0).flatMap(p => {
        const c = live().find(x => x.id === p.id)
        return c ? [{ c, xp: p.xp }] : []
      }))
    },
  }
}
