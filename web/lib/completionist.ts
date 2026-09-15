// ── WHAT THE COMPLETIONIST ROD ASKS FOR ─────────────────────────────────────
//
// One place, because the gate has been wrong twice and both times for the same
// reason: the CHECK and the DISPLAY were written out separately, in the action
// and on the page, and they drifted. A shop that says you qualify and a server
// that says you do not is worse than either answer on its own.
//
// So the rule lives here and both callers ask it the same question. The action
// refuses on `eligible`; the shop draws a row per requirement off the same
// object. Neither of them knows the rule, they only report it.
//
// ── THE FOUR ────────────────────────────────────────────────────────────────
//
// Level 100, every species, every regular at the top of their ladder, and every
// isle landed on. Between them they are the four things the fishing half of the
// game is made of: the grind, the collection, the people and the map. A capstone
// that only counted fish said the sea was a list of fish.

import { FOLK, TIER_AT } from './seaFolk'
import { ISLES } from './seaIsles'
import { provenCaughtSpecies } from './collection'

/** The level the rod opens at. */
export const COMPLETIONIST_LEVEL = 100
/** Every regular rapport can attach to. Buyers and wanderers are other people
 *  and keep no rapport; see lib/seaFolk. */
export const COMPLETIONIST_FRIENDS = FOLK.length
/** Every isle on the fishing chart. They are all on it: the bands are the five
 *  fishing zones, and the campaign's water has none. */
export const COMPLETIONIST_ISLES = ISLES.length
/** Points for the top rung, "Thick as thieves". */
const MAX_RAPPORT = TIER_AT[4]

/** One requirement, as the shop draws it: a bar and a tick. */
export type Requirement = { label: string; have: number; need: number; done: boolean }

export type CompletionistProgress = {
  level: Requirement
  species: Requirement
  friends: Requirement
  isles: Requirement
  /** In the order the shop lists them. */
  all: Requirement[]
  eligible: boolean
}

const req = (label: string, have: number, need: number): Requirement =>
  ({ label, have: Math.min(have, need), need, done: need > 0 && have >= need })

export function completionistProgress(input: {
  level: number
  /** Every species row, so the count is against the real table rather than a
   *  number written down somewhere that goes stale when a fish is added. */
  allSpecies: { id: number; habitat: string }[]
  lifetime?: number[] | null
  liveIds?: number[] | null
  ancientCatches?: number[] | null
  prestige?: Record<string, number> | null
  /** Rapport points, one per regular the captain has ever spoken to. */
  rapport?: { folk_id?: string | null; points?: number | null }[] | null
  /** Isle ids from sea_discoveries. */
  isles?: { isle_id?: string | null }[] | null
}): CompletionistProgress {
  const caught = provenCaughtSpecies(input.allSpecies, input)
  const species = input.allSpecies.filter(s => caught.has(s.id)).length

  // ── THE PEOPLE ──────────────────────────────────────────────────────────
  // Counted against the ROSTER, not against the rows: a row for somebody who
  // has since left the table would otherwise pay for a friendship that no
  // longer exists, and a duplicate row would pay twice.
  const known = new Set<string>(FOLK.map(f => f.id))
  const maxed = new Set(
    (input.rapport ?? [])
      .filter(r => r.folk_id && known.has(r.folk_id) && Number(r.points ?? 0) >= MAX_RAPPORT)
      .map(r => r.folk_id as string),
  )

  // ── AND THE MAP ─────────────────────────────────────────────────────────
  // Same rule. An isle id is the primary key of a discovery row and renaming
  // one un-finds it for everybody, so a stored id that is no longer on the
  // chart is a row about a rock that is gone; it does not count toward a rock
  // that is there.
  const onChart = new Set(ISLES.map(i => i.id))
  const found = new Set(
    (input.isles ?? [])
      .filter(d => d.isle_id && onChart.has(d.isle_id))
      .map(d => d.isle_id as string),
  )

  const level = req('Fishing Level', input.level, COMPLETIONIST_LEVEL)
  const speciesReq = req('Species Discovered', species, input.allSpecies.length)
  const friends = req('Regulars, Thick as Thieves', maxed.size, COMPLETIONIST_FRIENDS)
  const isles = req('Isles Landed On', found.size, COMPLETIONIST_ISLES)
  const all = [level, speciesReq, friends, isles]

  return {
    level, species: speciesReq, friends, isles, all,
    eligible: all.every(r => r.done),
  }
}

/** What to say when a claim is refused. The first thing still missing, named,
 *  because "you do not qualify" is not an answer to anything. */
export function completionistBlocker(p: CompletionistProgress): string | null {
  const miss = p.all.find(r => !r.done)
  if (!miss) return null
  if (miss === p.level) return `Need level ${COMPLETIONIST_LEVEL} (you're level ${p.level.have})`
  if (miss === p.species) return `Catch all ${p.species.need} species first (${p.species.have} so far)`
  if (miss === p.friends) return `Get all ${p.friends.need} regulars to Thick as Thieves first (${p.friends.have} so far)`
  return `Land on all ${p.isles.need} isles first (${p.isles.have} so far)`
}
