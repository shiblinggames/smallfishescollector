// ── THE LOCAL SAVE FILE (Steam prep, step 8 spike, stage 2, 2026-09-28) ──
//
// One captain's game as one JSON document: the Stardew model. One file, small,
// easy to back up, and what Steam Cloud syncs.
//
// What is IN the file is the player's state only. The fish species are game
// content (content/fish_species.json) and are re-attached on load, so a content
// update reaches an old save without touching it.
//
// A save carries a format name and a version. Loading refuses a file that is not
// a save, and upgrades an older version step by step (MIGRATIONS), so a save
// written today still opens after the format grows.
//
// This module is pure: it turns saves into text and back. Where the text lives
// (a file on disk through Node, or the Electron shell's main process) is a SaveStorage, so the
// same code serves the spike's tests and the shell.
//
// fromWebExport turns a web account's export (scripts/player-save, the
// PlayerSave document) into a local save. Tables the offline core does not model
// yet are CARRIED in the file untouched, so converting a real account loses
// nothing and later stages can pick them up.

import type { BoardAttemptRow, CapstanRuns, LadderAttemptRow } from '../triviaData'
import type { HoldAttemptRow } from '../chartData'
import { freshCasino, freshTrivia, freshCharting, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, PARLOR_PROFILE_DEFAULTS, CHARTING_PROFILE_DEFAULTS, SEA_PROFILE_DEFAULTS, type LocalSave, type LocalMail } from './save'
import type { SpeciesRow, DailyRow } from '../fishingData'
import type { Row } from '../common'

export const LOCAL_SAVE_FORMAT = 'seasthebooty-local-save'
export const LOCAL_SAVE_VERSION = 12

export type SaveFile = {
  format: typeof LOCAL_SAVE_FORMAT
  version: number
  savedAt: string
  /** The player's state, without the species (content, re-attached on load). */
  save: Omit<LocalSave, 'species'>
  /** Web tables the offline core does not model yet, kept verbatim. */
  carried: Record<string, Row[]>
}

/** Where a save's text lives. Async because the shell's file system is. */
export interface SaveStorage {
  read(): Promise<string | null>
  /** Write the whole text, replacing the old save only once the new one is complete. */
  write(text: string): Promise<void>
}

/** Upgrades from version N to N+1, applied in order on load. */
const MIGRATIONS: Record<number, (f: SaveFile) => SaveFile> = {
  // v2 (2026-09-29): selling. Deals struck at sea, and the captain's own market
  // (null until first read, then caught up from the clock).
  1: f => ({ ...f, version: 2, save: { ...f.save, deals: [], market: null } }),
  // v3 (2026-09-29): the crew. The hands (the fallen too), the recruit board,
  // the bunks and one id counter; the hall's tiers get the web's defaults.
  2: f => ({
    ...f, version: 3,
    save: {
      ...f.save, crew: [], recruits: [], bunks: [], nextId: 1,
      profile: { crew_hall_tier: 1, crew_drill_level: 1, crew_stores_level: 1, crew_next_roll_legendary: false, ...f.save.profile },
    },
  }),
  // v4 (2026-09-29): voyages and trawls.
  3: f => ({ ...f, version: 4, save: { ...f.save, voyages: [], trawls: [] } }),
  // v5 (2026-09-29): the gauntlets' per-depth times, run log and bounty moments.
  4: f => ({ ...f, version: 5, save: { ...f.save, depthBests: {}, gauntletRuns: [], bountyEvents: [] } }),
  // v6 (2026-09-29): the Den (buy-ins, the open hand, spins, the captain's pot).
  5: f => ({ ...f, version: 6, save: { ...f.save, casino: freshCasino() } }),
  // v7 (2026-09-29): raids. Run tokens, and clears with their times (the clears
  // already on record keep their raid, with no time).
  6: f => ({ ...f, version: 7, save: { ...f.save, raidTokens: [], raidClears: (f.save.clears ?? []).map(raid_id => ({ raid_id, ms: null, at: '' })) } }),
  // v8 (2026-09-29): the ship. No new tables; the ship's profile columns get
  // the web's defaults where a save never had them.
  7: f => ({ ...f, version: 8, save: { ...f.save, profile: { ...structuredClone(SHIP_PROFILE_DEFAULTS), ...f.save.profile } } }),
  // v9 (2026-09-29): the daily loop. The bounty board and its history, when
  // contests were won, the mail as full letters (read and claim state, an id),
  // and the loop's profile columns at the web's defaults.
  8: f => ({
    ...f, version: 9,
    save: {
      ...f.save, bounty: null, bountyHistory: [], contestsWonAt: {},
      mail: (f.save.mail as unknown as { subject: string; body: string; sender: string }[]).map((m, i): LocalMail => ({
        id: `local-mail-v8-${i}`, subject: m.subject, body: m.body, sender: m.sender, created_at: f.savedAt || new Date(0).toISOString(),
        attachment_doubloons: 0, attachment_gems: 0, read_at: null, claimed_at: null,
      })),
      profile: { ...structuredClone(DAILY_PROFILE_DEFAULTS), ...f.save.profile },
    },
  }),
  // v10 (2026-09-29): the Parlor. Each game's attempt per week, and the Parlor's
  // profile columns at the web's defaults.
  9: f => ({ ...f, version: 10, save: { ...f.save, trivia: freshTrivia(), profile: { ...structuredClone(PARLOR_PROFILE_DEFAULTS), ...f.save.profile } } }),
  // v11 (2026-09-29): the Chart Room. The boards the save builds itself, each
  // puzzle's attempt per week, and the room's profile columns at the web's defaults.
  10: f => ({ ...f, version: 11, save: { ...f.save, charting: freshCharting(), profile: { ...structuredClone(CHARTING_PROFILE_DEFAULTS), ...f.save.profile } } }),
  // v12 (2026-09-29): the sea. The regulars' full rows (a v11 save kept only who
  // wanted which fish; the rest starts from nothing), bearings and digs, the
  // isles been ashore at, the homestead, and the sea's profile columns at the
  // web's defaults.
  11: f => ({
    ...f, version: 12,
    save: {
      ...f.save,
      rapport: ((f.save.rapport ?? []) as { folk_id: string; want_fish_id: number | null }[]).map(r => ({
        folk_id: r.folk_id, points: 0, seen_lines: [], last_chat_on: null, gifts_given: 0,
        want_fish_id: r.want_fish_id, want_asked_at: r.want_fish_id == null ? null : (f.savedAt || new Date(0).toISOString()),
      })),
      digs: [], discoveries: [], homestead: null,
      profile: { ...structuredClone(SEA_PROFILE_DEFAULTS), ...f.save.profile },
    },
  }),
}

export function serializeSave(save: LocalSave, carried: Record<string, Row[]> = {}, savedAt = new Date().toISOString()): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { species, ...state } = save
  const file: SaveFile = { format: LOCAL_SAVE_FORMAT, version: LOCAL_SAVE_VERSION, savedAt, save: state, carried }
  return JSON.stringify(file)
}

export function deserializeSave(text: string, species: SpeciesRow[]): { save: LocalSave; carried: Record<string, Row[]>; savedAt: string } {
  let file = JSON.parse(text) as SaveFile
  if (file?.format !== LOCAL_SAVE_FORMAT) throw new Error('not a Seas the Booty save')
  if (file.version > LOCAL_SAVE_VERSION) throw new Error(`this save is from a newer version of the game (v${file.version})`)
  while (file.version < LOCAL_SAVE_VERSION) {
    const up = MIGRATIONS[file.version]
    if (!up) throw new Error(`no upgrade from save v${file.version}`)
    file = up(file)
  }
  return { save: { ...file.save, species }, carried: file.carried ?? {}, savedAt: file.savedAt }
}

/** Load a save through its storage, or null when there is none yet. */
export async function loadSave(storage: SaveStorage, species: SpeciesRow[]) {
  const text = await storage.read()
  return text == null ? null : deserializeSave(text, species)
}

export async function writeSave(storage: SaveStorage, save: LocalSave, carried: Record<string, Row[]> = {}) {
  await storage.write(serializeSave(save, carried))
}

// ── From the web ────────────────────────────────────────────────────────────

/** The web export's shape (scripts/player-save, lib/playerSave). */
export type WebExport = { format: string; version: number; userId: string; username: string | null; profile: Row; tables: Record<string, Row[]> }

/** The tables the local fishing save models; everything else is carried. */
const MODELLED = new Set(['sea_digs', 'sea_discoveries', 'homesteads', 'treasure_match_attempts', 'minefield_attempts', 'rigging_attempts', 'sudoku_attempts', 'trivia_board_attempts', 'trivia_capstan_attempts', 'trivia_ladder_attempts', 'bounty_progress', 'bounty_board_history', 'bait_inventory', 'fish_inventory', 'fish_collection', 'fish_lifetime', 'fish_personal_bests',
  'shiny_catches', 'daily_challenge_progress', 'raid_completions', 'rod_inventory', 'sea_rapport', 'sea_trader_deals',
  'user_crew', 'daily_recruits', 'crew_hall_bunks', 'daily_voyages', 'trawls',
  'gauntlet_depth_bests', 'gauntlet_runs', 'bounty_events', 'casino_buy_ins', 'blackjack_hands', 'roulette_spins', 'slot_spins',
  'run_tokens'])

export function fromWebExport(exp: WebExport, species: SpeciesRow[]): { save: LocalSave; carried: Record<string, Row[]> } {
  const t = (name: string) => exp.tables[name] ?? []
  const save: LocalSave = {
    uid: exp.userId,
    profile: { ...structuredClone(SHIP_PROFILE_DEFAULTS), ...structuredClone(DAILY_PROFILE_DEFAULTS), ...structuredClone(PARLOR_PROFILE_DEFAULTS), ...structuredClone(CHARTING_PROFILE_DEFAULTS), ...structuredClone(SEA_PROFILE_DEFAULTS), ...exp.profile },
    species,
    bait: Object.fromEntries(t('bait_inventory').map(r => [r.bait_type, Number(r.quantity)])),
    hold: Object.fromEntries(t('fish_inventory').filter(r => Number(r.quantity) > 0).map(r => [Number(r.fish_id), Number(r.quantity)])),
    collection: Object.fromEntries(t('fish_collection').map(r => [Number(r.fish_id), {
      catch_count: Number(r.catch_count), is_golden: (r.is_golden as boolean | null) ?? null,
      ...(r.last_caught_at ? { last_caught_at: String(r.last_caught_at) } : {}),
    }])),
    lifetime: Object.fromEntries(t('fish_lifetime').map(r => [Number(r.fish_id), { n: Number(r.catches), last: String(r.last_caught_at ?? ''), ...(r.first_caught_at ? { first: String(r.first_caught_at) } : {}) }])),
    bests: Object.fromEntries(t('fish_personal_bests').map(r => [Number(r.fish_id), { len: Number(r.best_length_in), at: String(r.caught_at ?? '') }])),
    shinies: t('shiny_catches').map(r => ({ ...r, id: Number(r.id), fish_id: Number(r.fish_id), size_in: r.size_in == null ? null : Number(r.size_in), status: String(r.status), caught_at: String(r.caught_at) })),
    daily: Object.fromEntries(t('daily_challenge_progress').map(r => [String(r.date), r as unknown as DailyRow])),
    clears: [...new Set(t('raid_completions').map(r => String(r.raid_id)))],
    raidClears: t('raid_completions').map(r => ({ raid_id: String(r.raid_id), ms: r.elapsed_ms == null ? null : Number(r.elapsed_ms), at: String(r.completed_at ?? '') })),
    // Tokens are a run's short-lived receipt: a converted save starts with none.
    raidTokens: [],
    bounty: (() => {
      const b = t('bounty_progress')[0]
      return b ? {
        date: String(b.date), bounty_ids: (b.bounty_ids ?? []) as string[], baselines: (b.baselines ?? {}) as Record<string, number>,
        claimed: (b.claimed ?? []) as boolean[], assigned_at: String(b.assigned_at ?? ''), reroll_used: b.reroll_used === true,
      } : null
    })(),
    bountyHistory: t('bounty_board_history').map(b => ({
      date: String(b.date), bounty_ids: (b.bounty_ids ?? []) as string[], baselines: {},
      claimed: (b.claimed ?? []) as boolean[], assigned_at: '', reroll_used: b.reroll_used === true,
    })).sort((a, b) => a.date.localeCompare(b.date)).slice(-60),
    contestsWonAt: {},
    // THE CHART ROOM'S BOARDS ARE THE SAVE'S OWN offline (it builds its own each
    // week), so an attempt imported from the web's board keeps only what was
    // banked or solved: a half-done grid would point at cells of a board this
    // save never had. A cleared or banked week stays banked, so it is never paid twice.
    charting: {
      ...freshCharting(),
      match: Object.fromEntries(t('treasure_match_attempts').map(r => [String(r.week), {
        status: r.status === 'cleared' ? 'cleared' as const : 'active' as const, best_score: Number(r.best_score ?? 0), points_awarded: Number(r.points_awarded ?? 0),
      }])),
      minefield: Object.fromEntries(t('minefield_attempts').filter(r => Number(r.points_awarded ?? 0) > 0).map(r => [String(r.week), {
        revealed: [], flagged: [], status: 'cleared' as const, points_awarded: Number(r.points_awarded), busts: Number(r.busts ?? 0),
      }])),
      rigging: Object.fromEntries(t('rigging_attempts').filter(r => Number(r.points_awarded ?? 0) > 0 || r.status === 'cleared').map(r => [String(r.week), {
        paths: {}, status: 'cleared' as const, points_awarded: Number(r.points_awarded ?? 0),
      }])),
      hold: Object.fromEntries(t('sudoku_attempts').map(r => [String(r.date), {
        progress: {}, solved: (r.solved ?? {}) as HoldAttemptRow['solved'], doubloons_awarded: Number(r.doubloons_awarded ?? 0), updated_at: 'imported',
      }])),
    },
    trivia: {
      board: Object.fromEntries(t('trivia_board_attempts').map(r => [String(r.date), {
        answers: (r.answers ?? {}) as BoardAttemptRow['answers'], doubloons_awarded: Number(r.doubloons_awarded ?? 0), gems_awarded: Number(r.gems_awarded ?? 0),
      }])),
      capstan: Object.fromEntries(t('trivia_capstan_attempts').map(r => [String(r.date), {
        runs: (r.runs ?? {}) as CapstanRuns, doubloons_awarded: Number(r.doubloons_awarded ?? 0),
      }])),
      ladder: Object.fromEntries(t('trivia_ladder_attempts').map(r => [String(r.date), {
        rung: Number(r.rung ?? 0), status: r.status as LadderAttemptRow['status'], fifty: (r.fifty ?? null) as LadderAttemptRow['fifty'],
        doubloons_awarded: Number(r.doubloons_awarded ?? 0), current_started_at: (r.current_started_at as string | null) ?? null,
      }])),
    },
    rods: t('rod_inventory').map(r => Number(r.rod_tier)),
    ledger: [], anomalies: [], mail: [],
    rapport: t('sea_rapport').map(r => ({
      folk_id: String(r.folk_id), points: Number(r.points ?? 0), seen_lines: (r.seen_lines ?? []) as string[],
      last_chat_on: (r.last_chat_on as string | null) ?? null, gifts_given: Number(r.gifts_given ?? 0),
      want_fish_id: r.want_fish_id == null ? null : Number(r.want_fish_id), want_asked_at: (r.want_asked_at as string | null) ?? null,
    })),
    digs: t('sea_digs').map(r => ({ site_id: String(r.site_id), dug_at: (r.dug_at as string | null) ?? null })),
    discoveries: t('sea_discoveries').map(r => String(r.isle_id)),
    homestead: (() => { const h = t('homesteads')[0]; if (!h) return null; const { user_id: _u, ...rest } = h; void _u; return rest })(),
    contests: {}, overrides: {},
    deals: t('sea_trader_deals').map(r => ({ trader_key: String(r.trader_key), sea_day: Number(r.sea_day), kind: String(r.kind), detail: (r.detail ?? {}) as object })),
    // The web's market is shared by everybody; a converted save starts its own.
    market: null,
    crew: t('user_crew').map(r => ({
      id: Number(r.id), card_id: Number(r.card_id), rarity: Number(r.rarity), power: Number(r.power), dodge: Number(r.dodge),
      fortune: Number(r.fortune), effects: (r.effects ?? []) as string[], pending_trait: (r.pending_trait as string | null) ?? null,
      voyage_slot: r.voyage_slot == null ? null : Number(r.voyage_slot), raid_slot: r.raid_slot == null ? null : Number(r.raid_slot),
      xp: Number(r.xp ?? 0), nickname: (r.nickname as string | null) ?? null, recruited_at: String(r.recruited_at ?? ''),
      died_at: (r.died_at as string | null) ?? null, died_on_voyage_id: r.died_on_voyage_id == null ? null : Number(r.died_on_voyage_id),
      died_hardcore_depth: r.died_hardcore_depth == null ? null : Number(r.died_hardcore_depth),
    })),
    recruits: t('daily_recruits').map(r => ({
      id: Number(r.id), slot: Number(r.slot), source: r.source === 'gem' ? 'gem' as const : 'free' as const, card_id: Number(r.card_id),
      rarity: Number(r.rarity), power: Number(r.power), dodge: Number(r.dodge), fortune: Number(r.fortune),
      effects: (r.effects ?? []) as string[], recruited: r.recruited === true, start_xp: Number(r.start_xp ?? 0),
    })),
    bunks: t('crew_hall_bunks').map(r => ({
      id: Number(r.id), crew_id: Number(r.crew_id), since: String(r.since),
      rate_per_hour: r.rate_per_hour == null ? null : Number(r.rate_per_hour),
      cap_hours: r.cap_hours == null ? null : Number(r.cap_hours), slot: r.slot == null ? null : Number(r.slot),
    })),
    voyages: t('daily_voyages').map(r => ({
      id: Number(r.id), voyage_date: String(r.voyage_date ?? ''), crew_variant_ids: ((r.crew_variant_ids ?? []) as unknown[]).map(Number),
      ship_tier: Number(r.ship_tier ?? 0), route: String(r.route), status: r.status === 'revealed' ? 'revealed' as const : 'pending' as const,
      events: (r.events ?? []) as unknown[], total_doubloons: Number(r.total_doubloons ?? 0), total_gems: Number(r.total_gems ?? 0),
      crew_lost: ((r.crew_lost ?? []) as unknown[]).map(Number), created_at: String(r.created_at),
      captains_log: (r.captains_log as string | null) ?? null, log_generated_at: (r.log_generated_at as string | null) ?? null,
      duration_ms: r.duration_ms == null ? null : Number(r.duration_ms), xp_bonus_pct: r.xp_bonus_pct == null ? null : Number(r.xp_bonus_pct),
      tide_turner_drop: r.tide_turner_drop === true, phantom_hook_drop: r.phantom_hook_drop === true, perfected_sigil_drop: r.perfected_sigil_drop === true,
    })).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    trawls: t('trawls').map(r => ({ id: Number(r.id), zone: String(r.zone), crew_id: Number(r.crew_id), ends_at: String(r.ends_at) })),
    depthBests: Object.fromEntries(t('gauntlet_depth_bests').map(r => [
      `${String(r.variant)}:${r.hardcore === true ? 1 : 0}:${Number(r.depth)}`, { ms: Number(r.best_ms), at: String(r.achieved_at ?? '') },
    ])),
    gauntletRuns: t('gauntlet_runs').map(r => ({
      variant: String(r.variant), hardcore: r.hardcore === true, depth: Number(r.depth), duration_ms: Number(r.duration_ms ?? 0),
      outcome: String(r.outcome), at: String(r.created_at ?? ''),
    })).sort((a, b) => a.at.localeCompare(b.at)).slice(-200),
    bountyEvents: t('bounty_events').map(r => ({ kind: String(r.kind), value: Number(r.value), at: String(r.created_at ?? '') }))
      .sort((a, b) => a.at.localeCompare(b.at)).slice(-500),
    casino: {
      ...freshCasino(),
      buyIns: t('casino_buy_ins').map(r => ({ amount: Number(r.amount), at: String(r.created_at ?? '') })),
      hand: (() => {
        const h = t('blackjack_hands').find(r => r.status === 'active' && r.state)
        return h ? { id: Number(h.id), state: h.state, initial_wager: Number(h.initial_wager), total_wagered: Number(h.total_wagered) } : null
      })(),
      rouletteSpins: t('roulette_spins').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(-20).map(r => ({ ...r })),
      slots: t('slot_spins').reduce<{ spins: number; net: number; biggest_win: number }>((acc, r) => {
        const net = Number(r.payout ?? 0) - Number(r.wager ?? 0)
        return { spins: acc.spins + 1, net: acc.net + net, biggest_win: Math.max(acc.biggest_win, net) }
      }, { spins: 0, net: 0, biggest_win: 0 }),
    },
    // Past every id the web handed out, so a new row can never collide with an old one.
    nextId: 1 + Math.max(0, ...['user_crew', 'daily_recruits', 'crew_hall_bunks', 'daily_voyages', 'trawls', 'blackjack_hands', 'roulette_spins'].flatMap(n => t(n).map(r => Number(r.id) || 0))),
  }
  const carried = Object.fromEntries(Object.entries(exp.tables).filter(([name]) => !MODELLED.has(name)))
  return { save, carried }
}
