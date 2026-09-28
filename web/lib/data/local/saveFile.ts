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
// (a file on disk through Node, or Tauri's file system) is a SaveStorage, so the
// same code serves the spike's tests and the shell.
//
// fromWebExport turns a web account's export (scripts/player-save, the
// PlayerSave document) into a local save. Tables the offline core does not model
// yet are CARRIED in the file untouched, so converting a real account loses
// nothing and later stages can pick them up.

import type { LocalSave } from './fishingLocal'
import type { SpeciesRow, DailyRow } from '../fishingData'
import type { Row } from '../common'

export const LOCAL_SAVE_FORMAT = 'seasthebooty-local-save'
export const LOCAL_SAVE_VERSION = 1

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

/** Upgrades from version N to N+1, applied in order on load. Empty at v1. */
const MIGRATIONS: Record<number, (f: SaveFile) => SaveFile> = {}

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
  'shiny_catches', 'daily_challenge_progress', 'raid_completions', 'rod_inventory', 'sea_rapport'])

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
  }
  const carried = Object.fromEntries(Object.entries(exp.tables).filter(([name]) => !MODELLED.has(name)))
  return { save, carried }
}
