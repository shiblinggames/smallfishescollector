// ── ONE CAPTAIN'S LOCAL SAVE, AND WHAT EVERY SYSTEM DOES WITH IT (Steam prep) ──
//
// The save's shape, and the operations every lib/data/<system>Data interface
// shares (CaptainData, plus the wallet and owned-list helpers), implemented
// once over the save. Each system's local store (fishingLocal, sellLocal, ...)
// spreads localCaptain(save) and adds its own.
//
// The one-shot contracts in lib/data/common hold here too: a guarded write
// that does not hold writes nothing, a spend that will not cover takes nothing.

import type { CaptainData, ProfileGuard, Row } from '../common'
import type { SpeciesRow, DailyRow } from '../fishingData'
import type { BountyRow } from '../dailyData'
import type { BoardAttemptRow, CapstanRuns, LadderAttemptRow } from '../triviaData'
import type { MatchAttemptRow, MinefieldAttemptRow, RiggingAttemptRow, HoldAttemptRow } from '../chartData'
import type { RapportRow } from '../seaData'
import type { MatchConfig, MinefieldLayout, SudokuSet, RiggingLayout } from '@/lib/chartBoards'
import type { ChallengeOverride } from '@/lib/dailyChallenges'
import { clockNow } from '@/lib/clock'
import type { MarketState } from '@/lib/marketRules'
import { badgePoints } from '@/lib/badges'
import { stampBadges } from '@/lib/badgeStamps'
import { localInventory } from './inventoryLocal'

export type LocalSave = {
  uid: string
  profile: Row
  species: SpeciesRow[]
  bait: Record<string, number>
  hold: Record<number, number>
  collection: Record<number, { catch_count: number; is_golden: boolean | null; last_caught_at?: string }>
  /** Lifetime catches per species; `first` (the Almanac's first-caught date)
   *  is kept from 2026-09-29, so older saves have none. */
  lifetime: Record<number, { n: number; last: string; first?: string }>
  bests: Record<number, { len: number; at: string }>
  shinies: { id: number; fish_id: number; size_in: number | null; status: string; caught_at: string; [k: string]: unknown }[]
  daily: Record<string, DailyRow>
  clears: string[]
  /** Rods held, by rod id, as copies (v13; the Bamboo is every captain's and
   *  is not listed). */
  rodItems: Record<string, number>
  ledger: { amount: number; reason: string; currency: 'doubloons' | 'gems' }[]
  anomalies: { kind: string; severity: number; detail: Record<string, unknown> }[]
  mail: LocalMail[]
  /** The regulars, one row each once spoken to (the full row since v12). */
  rapport: RapportRow[]
  contests: Record<string, string>
  overrides: Record<string, ChallengeOverride>
  // ── Save v2 (selling) ──
  /** Deals struck at sea: one per trader key, and the runner's one a night. */
  deals: { trader_key: string; sea_day: number; kind: string; detail: object }[]
  /** This captain's own market. On the web it is shared and a cron moves it;
   *  offline it is caught up by the hours that passed (lib/marketRules). Null
   *  until the market is first read. */
  market: MarketState | null
  // ── Save v3 (crew) ──
  /** Every hand ever signed, the fallen included (they are the graveyard). */
  crew: LocalCrewRow[]
  /** Today's recruit board. */
  recruits: LocalRecruitRow[]
  /** The Crew Hall's bunks, each on the terms it was taken on. */
  bunks: { id: number; crew_id: number; since: string; rate_per_hour: number | null; cap_hours: number | null; slot: number | null }[]
  /** The next id for a hand, a board row or a bunk (one counter for all). */
  nextId: number
  // ── Save v4 (voyages and trawls) ──
  /** Every daily voyage sent, newest last. The fallen point at theirs. */
  voyages: LocalVoyageRow[]
  /** The trawls out: one per zone, one per hand. */
  trawls: { id: number; zone: string; crew_id: number; ends_at: string }[]
  // ── Save v5 (the gauntlets) ──
  /** Fastest time to each depth, keyed `variant:hardcore(0|1):depth`. */
  depthBests: Record<string, { ms: number; at: string }>
  /** Finished runs, for pacing (the last few hundred). */
  gauntletRuns: { variant: string; hardcore: boolean; depth: number; duration_ms: number; outcome: string; at: string }[]
  /** Moments a bounty may count (a run's depth, a big hit), the last few hundred. */
  bountyEvents: { kind: string; value: number; at: string }[]
  // ── Save v6 (the Den) ──
  casino: LocalCasino
  // ── Save v7 (raids) ──
  /** Run tokens of the last week (what bounds a raid's rewards). */
  raidTokens: LocalRunToken[]
  /** Every raid clear with its time; `clears` stays the list of raids cleared. */
  raidClears: { raid_id: string; ms: number | null; at: string }[]
  // ── Save v9 (the daily loop) ──
  /** Today's bounty board as filed, or null before the first. */
  bounty: BountyRow | null
  /** The boards handed out before it, newest last (the last sixty). */
  bountyHistory: BountyRow[]
  /** When each contest this captain won was won. */
  contestsWonAt: Record<string, string>
  // ── Save v10 (the Parlor) ──
  /** Each game's attempt per week (the Monday), the last twelve weeks kept. */
  trivia: LocalTrivia
  // ── Save v11 (the Chart Room) ──
  /** The weekly boards this save built, and each puzzle's attempt per week
   *  (the Monday), the last twelve weeks kept. */
  charting: LocalCharting
  // ── Save v12 (the sea) ──
  /** Bearings held (a row per site) and when each was dug. */
  digs: { site_id: string; dug_at: string | null }[]
  /** Every isle been ashore at. */
  discoveries: string[]
  /** The homestead as the web keeps it (its owned furnishings among it), or null. */
  homestead: Row | null
}

/** A letter in the captain's own mailbox. Offline the game is the only sender. */
export type LocalMail = {
  id: string; subject: string; body: string; sender: string; created_at: string
  attachment_doubloons: number; attachment_gems: number
  read_at: string | null; claimed_at: string | null
}

export type LocalRunToken = {
  id: string; kind: string; meta: Record<string, unknown> | null; kills: number
  issued_at: string; consumed_at: string | null; expires_at: string
  cleared_at: string | null; paid_rounds: number[]; looted_at: string | null
}

export type LocalCasino = {
  /** Buy-ins of the last couple of days (the daily cap counts today's). */
  buyIns: { amount: number; at: string }[]
  /** The open blackjack hand, if any. */
  hand: { id: number; state: unknown; initial_wager: number; total_wagered: number } | null
  /** The last twenty roulette spins. */
  rouletteSpins: Record<string, unknown>[]
  /** Slots, as running totals. */
  slots: { spins: number; net: number; biggest_win: number }
  /** The captain's own community pot. */
  pot: { pot: number; seed: number; last_winner_name: string | null; last_win_amount: number | null; last_won_at: string | null }
}

/** The ship's profile columns at the web's column defaults. A save that never
 *  had them (a new captain, or one from before v8) gets these, so a guarded
 *  purchase reads `false`, not a missing column. */
export const SHIP_PROFILE_DEFAULTS = {
  ship_tier: 2, raid_items: [], equipped_raid_items: [], ship_skins: [], equipped_ship_skin: null,
  forge_recipes_learned: [], abyssal_conversion: null, gauntlet_fathoms: 0,
  gauntlet_upgrades: [], dons_gauntlet_upgrades: [],
  manowar_augment: null, manowar_augment_build: null, manowar_schematics: false,
  has_sixth_berth: false, has_armory_expansion: false,
  hull_speed_tier: 0, hull_handling_tier: 0, hull_accel_tier: 0, lantern_tier: 0,
  has_seen_forge_intro: false, seen_ultimate_unlock: false, has_seen_ship_guide: false,
}

/** The daily loop's profile columns at the web's column defaults (v9). */
export const DAILY_PROFILE_DEFAULTS = {
  bounty_rung_seen: 0, bounty_points: 0, bounty_milestones_claimed: 0, bounties_claimed: 0,
  bounty_gems_earned: 0, bounty_boards_cleared: 0, bounty_elites_claimed: 0,
  daily_challenge_sweeps: 0, daily_master_cleared: 0, has_seen_contests: false,
  last_daily_claim: null, last_worm_claim: null, last_crate_claim_week: null,
  is_premium: false, premium_expires_at: null,
}

/** The Parlor's profile columns at the web's column defaults (v10). */
export const PARLOR_PROFILE_DEFAULTS = {
  parlor_points: 0, parlor_streak: 0, parlor_best_streak: 0, parlor_rank_gems_awarded: 0, has_seen_parlor_guide: false,
}

export type LocalTrivia = {
  board: Record<string, BoardAttemptRow>
  capstan: Record<string, { runs: CapstanRuns; doubloons_awarded: number }>
  ladder: Record<string, LadderAttemptRow>
}
export const freshTrivia = (): LocalTrivia => ({ board: {}, capstan: {}, ladder: {} })

/** The Chart Room's profile columns at the web's column defaults (v11). */
export const CHARTING_PROFILE_DEFAULTS = {
  puzzle_points: 0, charting_landmarks_claimed: [] as number[], has_seen_charting_guide: false,
}

export type LocalCharting = {
  boards: {
    match: Record<string, MatchConfig>
    minefield: Record<string, MinefieldLayout>
    sudoku: Record<string, SudokuSet>
    rigging: Record<string, RiggingLayout>
  }
  match: Record<string, MatchAttemptRow>
  minefield: Record<string, MinefieldAttemptRow>
  rigging: Record<string, RiggingAttemptRow>
  hold: Record<string, HoldAttemptRow>
}
export const freshCharting = (): LocalCharting => ({
  boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} },
  match: {}, minefield: {}, rigging: {}, hold: {},
})

/** The sea's profile columns at the web's column defaults (v12). */
export const SEA_PROFILE_DEFAULTS = {
  finn_encounters: 0, finn_seen_beats: [] as string[], finn_revealed: false, finn_quest: null, finn_quests_done: [] as string[],
  finn_last_outcome: null, portal_tier: 1, portal_components_spent: 0, last_recall_fish_at: null, last_recall_exp_at: null,
  sea_x: null, sea_y: null, current_perfect_streak: 0, total_perfects: 0, zone_perfects: {} as Record<string, number>,
}

/** A Den nobody has visited: no buy-ins, no hand, the pot at its seed. */
export function freshCasino(): LocalCasino {
  return {
    buyIns: [], hand: null, rouletteSpins: [], slots: { spins: 0, net: 0, biggest_win: 0 },
    pot: { pot: 15000, seed: 15000, last_winner_name: null, last_win_amount: null, last_won_at: null },
  }
}

export type LocalVoyageRow = {
  id: number; voyage_date: string; crew_variant_ids: number[]; ship_tier: number; route: string
  status: 'pending' | 'revealed'; events: unknown[]; total_doubloons: number; total_gems: number; crew_lost: number[]
  created_at: string; captains_log: string | null; log_generated_at: string | null; duration_ms: number | null
  xp_bonus_pct: number | null; tide_turner_drop: boolean; phantom_hook_drop: boolean; perfected_sigil_drop: boolean
}

export type LocalCrewRow = {
  id: number; card_id: number; rarity: number; power: number; dodge: number; fortune: number
  effects: string[]; pending_trait: string | null; voyage_slot: number | null; raid_slot: number | null
  xp: number; nickname: string | null; recruited_at: string
  died_at: string | null; died_on_voyage_id: number | null; died_hardcore_depth: number | null
}
export type LocalRecruitRow = {
  id: number; slot: number; source: 'free' | 'gem'; card_id: number; rarity: number
  power: number; dodge: number; fortune: number; effects: string[]; recruited: boolean; start_xp: number
}

const cols = (list: string) => list.split(',').map(c => c.trim()).filter(Boolean)

function guardHolds(profile: Row, g: ProfileGuard): boolean {
  const v = profile[g.col]
  if ('is' in g) return v == null
  if ('notNull' in g) return v != null
  if ('contains' in g) return Array.isArray(v) && g.contains.every(x => v.includes(x))
  // eq: a JSON string compared against a JSON value is compared as JSON.
  return typeof g.eq === 'string' && v != null && typeof v === 'object' ? JSON.stringify(v) === g.eq : v === g.eq
}

export type LocalCaptain = CaptainData & {
  /** The profile, for this save's captain only (a different uid throws). */
  me(uid: string): Row
  grant(uid: string, col: string, n: number): Promise<number>
  spend(uid: string, col: string, n: number): Promise<number | null>
  addToList(uid: string, col: string, value: string): Promise<boolean>
  grantBadge(uid: string, badgeId: string): Promise<void>
  flagAnomaly(uid: string, kind: string, severity: number, detail: Record<string, unknown>): Promise<void>
  achievementPoints(uid: string): Promise<number>
}

/** CaptainData and the shared helpers over one captain's local save. */
export function localCaptain(save: LocalSave): LocalCaptain {
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  return {
    ...localInventory(save),
    me,
    async profile(uid, list) {
      const prof = me(uid)
      if (list.trim() === '*') return structuredClone(prof)
      return Object.fromEntries(cols(list).map(c => [c, prof[c] ?? null]))
    },
    async updateProfile(uid, patch) { Object.assign(me(uid), structuredClone(patch)) },
    async bumpStat(uid, col, n) { const prof = me(uid); prof[col] = Number(prof[col] ?? 0) + n },
    async bumpJsonCounter(uid, col, key, n) {
      const prof = me(uid); const o = { ...(prof[col] ?? {}) }; o[key] = Number(o[key] ?? 0) + n; prof[col] = o
    },
    async ledger(uid, amount, reason, currency = 'doubloons') { me(uid); save.ledger.push({ amount, reason, currency }) },
    async hasCleared(uid, raidId) { me(uid); return save.clears.includes(raidId) },
    async addBait(uid, bait, qty) { me(uid); save.bait[bait] = (save.bait[bait] ?? 0) + qty },
    async updateProfileIf(uid, patch, when) {
      const prof = me(uid)
      if (!when.every(g => guardHolds(prof, g))) return false
      Object.assign(prof, structuredClone(patch)); return true
    },
    async deductDoubloons(uid, amount) {
      const prof = me(uid); const have = Number(prof.doubloons ?? 0)
      if (have < amount) return null
      prof.doubloons = have - amount; return prof.doubloons as number
    },
    async mailTo(uid, m) {
      me(uid)
      save.mail.push({
        id: `local-mail-${save.nextId++}`, subject: m.subject, body: m.body, sender: m.sender,
        created_at: new Date(clockNow()).toISOString(), attachment_doubloons: 0, attachment_gems: 0, read_at: null, claimed_at: null,
      })
    },

    async grant(uid, col, n) {
      const prof = me(uid); prof[col] = Number(prof[col] ?? 0) + Math.max(0, Math.trunc(Number(n) || 0)); return prof[col] as number
    },
    async spend(uid, col, n) {
      const prof = me(uid); const have = Number(prof[col] ?? 0)
      if (!Number.isInteger(n) || n < 0 || have < n) return null
      prof[col] = have - n; return prof[col] as number
    },
    async addToList(uid, col, value) {
      const prof = me(uid); const list: string[] = prof[col] ?? []
      if (list.includes(value)) return false
      prof[col] = [...list, value]; return true
    },
    async grantBadge(uid, badgeId) {
      const prof = me(uid); const list: string[] = prof.unlocked_badges ?? []
      if (list.includes(badgeId)) return
      // Stamped like the web's grantBadgeDirect, so the Logbook can date it.
      prof.unlocked_badges = [...list, badgeId]
      prof.badge_unlocked_at = stampBadges(prof.badge_unlocked_at, [badgeId])
    },
    async flagAnomaly(uid, kind, severity, detail) { me(uid); save.anomalies.push({ kind, severity, detail }) },
    async achievementPoints(uid) {
      // Offline, the badges the captain holds are the whole record.
      return ((me(uid).unlocked_badges ?? []) as string[]).reduce((n, id) => n + badgePoints(id), 0)
    },
  }
}
