import { createAdminClient } from '@/lib/supabase/admin'
import { matchWeekStr } from './constants'
import { buildMatchConfig, type MatchConfig } from '@/lib/chartBoards'

// Treasure Match weekly board generator — one seeded board a week,
// cached in treasure_match_boards. The seed makes the board + drop order
// deterministic, so the week is the same shared puzzle for everyone. No
// Claude. Same cache-fetch / generate-on-miss / fall-back-to-latest
// shape as the other Chart Room puzzles.

// Built by lib/chartBoards, which the offline store shares.
export type { MatchConfig } from '@/lib/chartBoards'

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
    const config: MatchConfig = buildMatchConfig()
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
