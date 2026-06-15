import { createAdminClient } from '@/lib/supabase/admin'
import {
  MATCH_COLS, MATCH_ROWS, MATCH_TYPES, MATCH_TARGET, MATCH_MOVES, matchWeekStr,
} from './constants'

// Treasure Match weekly board generator — one seeded board a week,
// cached in treasure_match_boards. The seed makes the board + drop order
// deterministic, so the week is the same shared puzzle for everyone. No
// Claude. Same cache-fetch / generate-on-miss / fall-back-to-latest
// shape as the other Chart Room puzzles.

export interface MatchConfig {
  seed: number
  cols: number
  rows: number
  types: number
  target: number
  moves: number
}

export async function getThisWeeksMatch(): Promise<MatchConfig | null> {
  const admin = createAdminClient()
  const week = matchWeekStr()

  const { data: cached } = await admin
    .from('treasure_match_boards')
    .select('config')
    .eq('week', week)
    .single()

  if (cached) return cached.config as MatchConfig

  try {
    const config: MatchConfig = {
      seed: Math.floor(Math.random() * 0x7fffffff),
      cols: MATCH_COLS,
      rows: MATCH_ROWS,
      types: MATCH_TYPES,
      target: MATCH_TARGET,
      moves: MATCH_MOVES,
    }
    await admin.from('treasure_match_boards').insert({ week, config })
    return config
  } catch (err) {
    console.error('[treasure-match] generation failed:', err)
    const { data: fallback } = await admin
      .from('treasure_match_boards')
      .select('config')
      .lt('week', week)
      .order('week', { ascending: false })
      .limit(1)
      .single()
    return (fallback?.config as MatchConfig | undefined) ?? null
  }
}
