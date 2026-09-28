// ── ONE PLAYER, ONE FILE (Steam prep, Phase A step 4, 2026-09-28) ────────────
//
// Everything a captain OWNS, in one JSON document: the profile row plus every
// table whose rows belong to them. Used now for account backups, restoring
// after a mistake, and admin fixes (scripts/player-save.mts); later it is the
// shape of a cloud save and of the one-time claim onto a Steam account.
//
// WHAT IS IN A SAVE, AND WHAT IS NOT
//   SAVE_TABLES   the game state: fish, crew, gear, collection, progress, the
//                 homestead, the sea's discoveries, voyages, trawls, raids and
//                 gauntlet records, bounties, open Exchange bets, claimed mail.
//   HISTORY_TABLES the ledgers and logs (every doubloon, every hand of cards,
//                 every puzzle attempt). Exported on request, never restored:
//                 a log is a record of what happened, not something you own.
//   neither       shared and social rows (follows, pacts, battles, contests,
//                 the jackpot), anti-cheat run tokens, admin flags. They belong
//                 to more than one person or to nobody.
//
// ORDER MATTERS in SAVE_TABLES: parents before children (a voyage before the
// crew who died on it, crew before the bunks and trawls they are in). The
// restore deletes in reverse and inserts in this order.
//
// A NEW TABLE THAT HOLDS A PLAYER'S STUFF GOES IN SAVE_TABLES, or it will not
// survive a restore.

export type SaveTable = { table: string; col: string }

export const SAVE_TABLES: SaveTable[] = [
  // parents first
  { table: 'daily_voyages', col: 'user_id' },
  { table: 'user_crew', col: 'user_id' },
  { table: 'crew_hall_bunks', col: 'user_id' },
  { table: 'trawls', col: 'user_id' },
  // fishing
  { table: 'bait_inventory', col: 'user_id' },
  { table: 'fish_inventory', col: 'user_id' },
  { table: 'fish_collection', col: 'user_id' },
  { table: 'fish_lifetime', col: 'user_id' },
  { table: 'fish_personal_bests', col: 'user_id' },
  { table: 'shiny_catches', col: 'user_id' },
  { table: 'rod_inventory', col: 'user_id' },
  { table: 'pending_sales', col: 'user_id' },
  // crew and cards
  { table: 'daily_recruits', col: 'user_id' },
  { table: 'user_collection', col: 'user_id' },
  // expeditions
  { table: 'expeditions', col: 'user_id' },
  { table: 'expedition_items', col: 'user_id' },
  { table: 'raid_completions', col: 'user_id' },
  { table: 'gauntlet_runs', col: 'user_id' },
  { table: 'gauntlet_depth_bests', col: 'user_id' },
  // the sea and home
  { table: 'homesteads', col: 'user_id' },
  { table: 'sea_digs', col: 'user_id' },
  { table: 'sea_discoveries', col: 'user_id' },
  { table: 'sea_rapport', col: 'user_id' },
  { table: 'sea_trader_deals', col: 'user_id' },
  // the day's boards
  { table: 'bounty_progress', col: 'user_id' },
  { table: 'weekly_bounty_progress', col: 'user_id' },
  { table: 'daily_challenge_progress', col: 'user_id' },
  { table: 'chart_progress', col: 'user_id' },
  // the rest of what they own
  { table: 'user_achievements', col: 'user_id' },
  { table: 'exchange_bets', col: 'user_id' },
  { table: 'mail_reads', col: 'user_id' },
  { table: 'prize_claims', col: 'user_id' },
]

export const HISTORY_TABLES: SaveTable[] = [
  { table: 'doubloon_transactions', col: 'user_id' },
  { table: 'gem_transactions', col: 'user_id' },
  { table: 'bounty_events', col: 'user_id' },
  { table: 'bounty_board_history', col: 'user_id' },
  { table: 'pack_history', col: 'user_id' },
  { table: 'dice_rolls', col: 'user_id' },
  { table: 'casino_buy_ins', col: 'user_id' },
  { table: 'blackjack_buy_ins', col: 'user_id' },
  { table: 'blackjack_hands', col: 'user_id' },
  { table: 'roulette_buy_ins', col: 'user_id' },
  { table: 'roulette_spins', col: 'user_id' },
  { table: 'slot_spins', col: 'user_id' },
  { table: 'daily_fish_attempts', col: 'user_id' },
  { table: 'quiz_answers', col: 'user_id' },
  { table: 'chart_guesses', col: 'user_id' },
  { table: 'minefield_attempts', col: 'user_id' },
  { table: 'sudoku_attempts', col: 'user_id' },
  { table: 'rigging_attempts', col: 'user_id' },
  { table: 'treasure_match_attempts', col: 'user_id' },
  { table: 'trivia_board_attempts', col: 'user_id' },
  { table: 'trivia_capstan_attempts', col: 'user_id' },
  { table: 'trivia_ladder_attempts', col: 'user_id' },
]

export const SAVE_FORMAT = 'seasthebooty-save'
export const SAVE_VERSION = 1

export type PlayerSave = {
  format: typeof SAVE_FORMAT
  version: number
  exportedAt: string
  userId: string
  username: string | null
  profile: Record<string, unknown>
  /** SAVE_TABLES, by table name. */
  tables: Record<string, Record<string, unknown>[]>
  /** HISTORY_TABLES, only when asked for. Never restored. */
  history?: Record<string, Record<string, unknown>[]>
}

/** Is this a save this code can read? */
export function isPlayerSave(x: unknown): x is PlayerSave {
  const s = x as PlayerSave
  return !!s && s.format === SAVE_FORMAT && typeof s.version === 'number' && s.version <= SAVE_VERSION
    && typeof s.userId === 'string' && !!s.profile && typeof s.tables === 'object'
}

/** Rows per table, for a summary or a before/after comparison. */
export function saveCounts(s: PlayerSave): Record<string, number> {
  return Object.fromEntries(SAVE_TABLES.map(t => [t.table, (s.tables[t.table] ?? []).length]))
}
