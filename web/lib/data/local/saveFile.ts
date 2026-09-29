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

import type { LocalSave } from './save'
import type { SpeciesRow, DailyRow } from '../fishingData'
import type { Row } from '../common'

export const LOCAL_SAVE_FORMAT = 'seasthebooty-local-save'
export const LOCAL_SAVE_VERSION = 4

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
const MODELLED = new Set(['bait_inventory', 'fish_inventory', 'fish_collection', 'fish_lifetime', 'fish_personal_bests',
  'shiny_catches', 'daily_challenge_progress', 'raid_completions', 'rod_inventory', 'sea_rapport', 'sea_trader_deals',
  'user_crew', 'daily_recruits', 'crew_hall_bunks', 'daily_voyages', 'trawls'])

export function fromWebExport(exp: WebExport, species: SpeciesRow[]): { save: LocalSave; carried: Record<string, Row[]> } {
  const t = (name: string) => exp.tables[name] ?? []
  const save: LocalSave = {
    uid: exp.userId,
    profile: { ...exp.profile },
    species,
    bait: Object.fromEntries(t('bait_inventory').map(r => [r.bait_type, Number(r.quantity)])),
    hold: Object.fromEntries(t('fish_inventory').filter(r => Number(r.quantity) > 0).map(r => [Number(r.fish_id), Number(r.quantity)])),
    collection: Object.fromEntries(t('fish_collection').map(r => [Number(r.fish_id), {
      catch_count: Number(r.catch_count), is_golden: (r.is_golden as boolean | null) ?? null,
      ...(r.last_caught_at ? { last_caught_at: String(r.last_caught_at) } : {}),
    }])),
    lifetime: Object.fromEntries(t('fish_lifetime').map(r => [Number(r.fish_id), { n: Number(r.catches), last: String(r.last_caught_at ?? '') }])),
    bests: Object.fromEntries(t('fish_personal_bests').map(r => [Number(r.fish_id), { len: Number(r.best_length_in), at: String(r.caught_at ?? '') }])),
    shinies: t('shiny_catches').map(r => ({ ...r, id: Number(r.id), fish_id: Number(r.fish_id), size_in: r.size_in == null ? null : Number(r.size_in), status: String(r.status), caught_at: String(r.caught_at) })),
    daily: Object.fromEntries(t('daily_challenge_progress').map(r => [String(r.date), r as unknown as DailyRow])),
    clears: t('raid_completions').map(r => String(r.raid_id)),
    rods: t('rod_inventory').map(r => Number(r.rod_tier)),
    ledger: [], anomalies: [], mail: [],
    rapport: t('sea_rapport').map(r => ({ folk_id: String(r.folk_id), want_fish_id: r.want_fish_id == null ? null : Number(r.want_fish_id) })),
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
    // Past every id the web handed out, so a new row can never collide with an old one.
    nextId: 1 + Math.max(0, ...['user_crew', 'daily_recruits', 'crew_hall_bunks', 'daily_voyages', 'trawls'].flatMap(n => t(n).map(r => Number(r.id) || 0))),
  }
  const carried = Object.fromEntries(Object.entries(exp.tables).filter(([name]) => !MODELLED.has(name)))
  return { save, carried }
}
