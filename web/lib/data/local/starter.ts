// A NEW CAPTAIN'S SAVE, in one place (Steam prep, 2026-09-30).
//
// Exactly what a new web account is (the profiles row at its column defaults,
// content/profile_defaults.json, which check-profile-defaults holds to the
// schema; set_default_username's name; the sign-up trigger's 25 worms), with
// one difference decided for Steam (2026-09-30): buying the game makes you a
// Captain. The desktop shell starts captains from it, and the Godot parity
// cases (scripts/parity-export) start from it, so both begin from the same save.

import type { LocalSave } from './fishingLocal'
import { freshCasino } from './save'
import type { Row } from '../common'
import type { SpeciesRow } from '../fishingData'
import profileDefaultsJson from '@/content/profile_defaults.json'

const PROFILE_DEFAULTS = profileDefaultsJson as Row

export function starterSave(uid: string, species: SpeciesRow[], nowMs: number): LocalSave {
  return {
    uid,
    profile: {
      ...structuredClone(PROFILE_DEFAULTS),
      id: uid,
      username: 'crew_' + uid.replace(/-/g, '').slice(-5),
      created_at: new Date(nowMs).toISOString(),
      is_premium: true,
      premium_expires_at: null,
    },
    species,
    bait: { worm: 25 }, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rodItems: {}, ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {}, deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
  }
}
