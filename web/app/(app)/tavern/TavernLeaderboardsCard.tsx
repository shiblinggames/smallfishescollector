import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import LeaderboardsRotatingHook, { type LeaderboardHighlight } from './LeaderboardsRotatingHook'

// Thin Leaderboards bar that sits at the very top of the Tavern.
// Single-line ticker rotating through the top entry across all 4
// boards — like a bar's bulletin board cycling through the latest
// gossip. No icon, no art — just the line, because we want this to
// be UNobtrusive at the top of the page, not another hero banner
// competing for attention with the cards below.
//
// IMPORTANT: fixed height + clipped overflow so the bar does NOT
// flex with the rotating content. Longer ticker entries get
// truncated with ellipsis rather than pushing the page layout.

type TopRow = { username: string; score: number } | null

async function fetchTop(view: string): Promise<TopRow> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from(view)
      .select('username, score')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (!data) return null
    const row = data as { username: string | null; score: number | null }
    if (!row.username || !row.score || row.score <= 0) return null
    return { username: row.username, score: row.score }
  } catch {
    return null
  }
}

async function loadHighlights(): Promise<LeaderboardHighlight[]> {
  // Six boards in parallel. Order in the returned array drives the
  // rotation order; Tide Run leads because it's the most-engaged
  // board today. The three Den boards are all lifetime net winnings,
  // so their labels read signed (+N ⟡); fetchTop's score <= 0 filter
  // means a board whose current top is net-down just sits out the
  // rotation rather than headlining a loser.
  const [tideRun, fishing, expedition, fishSlots, blackjack, roulette] = await Promise.all([
    fetchTop('leaderboard_tide_run'),
    fetchTop('leaderboard_fishing'),
    fetchTop('leaderboard_expedition'),
    fetchTop('leaderboard_fish_slots'),
    fetchTop('leaderboard_blackjack'),
    fetchTop('leaderboard_roulette'),
  ])
  const out: LeaderboardHighlight[] = []
  if (tideRun)    out.push({ board: 'Tide Run',  username: tideRun.username,    scoreLabel: `${tideRun.score.toLocaleString()}m` })
  if (fishing)    out.push({ board: 'Fishing',   username: fishing.username,    scoreLabel: `Lv ${getLevelFromXP(fishing.score)}` })
  if (expedition) out.push({ board: 'Navigator', username: expedition.username, scoreLabel: `Lv ${getExpeditionLevel(expedition.score)}` })
  if (fishSlots)  out.push({ board: 'Fish Slots', username: fishSlots.username, scoreLabel: `+${fishSlots.score.toLocaleString()} ⟡` })
  if (blackjack)  out.push({ board: 'Blackjack', username: blackjack.username, scoreLabel: `+${blackjack.score.toLocaleString()} ⟡` })
  if (roulette)   out.push({ board: 'Roulette',  username: roulette.username,  scoreLabel: `+${roulette.score.toLocaleString()} ⟡` })
  return out
}

export default async function TavernLeaderboardsCard() {
  const highlights = await loadHighlights()

  return (
    <Link
      href="/leaderboard"
      style={{
        display: 'flex', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(8,14,22,0.98) 0%, rgba(28,22,8,0.95) 100%)',
        border: '1px solid rgba(240,192,64,0.4)',
        borderTop: '1px solid rgba(240,192,64,0.7)',
        borderRadius: 14,
        // Fixed bar height — content is clipped, never flexes.
        height: 44,
        padding: '0 0.9rem',
        cursor: 'pointer',
        userSelect: 'none',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 0 24px rgba(240,192,64,0.1)',
      }}
    >
      {/* Single-line ticker, hard-clipped so longer entries
          ellipsis instead of pushing the bar taller. */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <LeaderboardsRotatingHook highlights={highlights} />
      </div>
      {/* Chevron — tiny "tap to go" cue at the right edge. */}
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="rgba(240,192,64,0.7)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, marginLeft: 8 }}
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
