import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import LeaderboardsRotatingHook, { type LeaderboardHighlight } from './LeaderboardsRotatingHook'

// Full-width hero card surfacing the Leaderboards in the Tavern.
// Same banner shape as Recruit / TavernTideRunCard.
//
// The hook line ROTATES across boards every few seconds — "USERNAME
// leads BOARD with SCORE" — like the bar's bulletin board cycling
// through the latest gossip. Surfaces breadth + drives the tap with
// social proof (a specific name + a specific number). Falls back to
// a static line if every board is cold.

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
  // Four boards in parallel. Order in the returned array drives the
  // rotation order; Tide Run leads because it's the most-engaged
  // board today.
  const [tideRun, fishing, expedition, fishSlots] = await Promise.all([
    fetchTop('leaderboard_tide_run'),
    fetchTop('leaderboard_fishing'),
    fetchTop('leaderboard_expedition'),
    fetchTop('leaderboard_fish_slots'),
  ])
  const out: LeaderboardHighlight[] = []
  if (tideRun)    out.push({ board: 'Tide Run',  username: tideRun.username,    scoreLabel: `${tideRun.score.toLocaleString()}m` })
  if (fishing)    out.push({ board: 'Fishing',   username: fishing.username,    scoreLabel: `Lv ${getLevelFromXP(fishing.score)}` })
  if (expedition) out.push({ board: 'Navigator', username: expedition.username, scoreLabel: `Lv ${getExpeditionLevel(expedition.score)}` })
  if (fishSlots)  out.push({ board: 'Fish Slots', username: fishSlots.username, scoreLabel: `${fishSlots.score.toLocaleString()} ⟡` })
  return out
}

export default async function TavernLeaderboardsCard() {
  const highlights = await loadHighlights()

  return (
    <Link
      href="/leaderboard"
      style={{
        display: 'flex', alignItems: 'stretch', gap: '1rem',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(8,14,22,0.98) 0%, rgba(28,22,8,0.95) 100%)',
        border: '1px solid rgba(240,192,64,0.5)',
        borderTop: '2px solid rgba(240,192,64,0.8)',
        borderRadius: 20,
        padding: '1.4rem 1.5rem 1.3rem',
        cursor: 'pointer',
        userSelect: 'none',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 0 40px rgba(240,192,64,0.14), inset 0 0 60px rgba(240,192,64,0.04)',
      }}
    >
      {/* Left: text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.18em]"
          style={{ fontSize: '0.56rem', color: 'rgba(240,192,64,0.75)', marginBottom: '0.45rem', letterSpacing: '0.2em' }}>
          Compete
        </p>
        <p className="font-cinzel font-700"
          style={{ fontSize: '1.25rem', color: '#f0ede8', lineHeight: 1.15, marginBottom: '0.45rem', letterSpacing: '0.02em' }}>
          Leaderboards
        </p>
        {/* The hook itself is a client component so the rotation
            interval can run on the client without forcing the whole
            page to re-render. Reserve a min-height so the banner
            doesn't grow / shrink as longer hook lines cycle in. */}
        <div style={{ minHeight: '1.6rem' }}>
          <LeaderboardsRotatingHook highlights={highlights} />
        </div>
      </div>

      {/* Right: trophy glyph (no dedicated art yet — use a large
          stroked trophy SVG that matches the hiscore visual). */}
      <div style={{
        flexShrink: 0, width: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="#ffd56b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 4px 18px rgba(240,192,64,0.55))', opacity: 0.95 }}>
          <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
          <path d="M8 6H5v2a3 3 0 0 0 3 3" />
          <path d="M16 6h3v2a3 3 0 0 1-3 3" />
          <path d="M10 14v3M14 14v3" />
          <path d="M8 19h8" />
        </svg>
      </div>
    </Link>
  )
}
