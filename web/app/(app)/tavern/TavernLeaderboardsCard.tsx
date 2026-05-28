import Link from 'next/link'
import { getTopTideRunHolder } from './tide-run/actions'

// Full-width hero card surfacing the Leaderboards in the Tavern.
// Modeled after RecruitCard (image right, text left) so the two
// hero cards at the top of the page share a visual rhythm.
//
// The hook line — "Top: USERNAME leads with N" — is the social
// proof that drives the tap. A bare "see leaderboards" link gets
// scrolled past; a name + score makes it personal. Today's source
// is the Tide Run board (cheapest single query); future revisions
// could rotate across boards or show the player's own rank.

export default async function TavernLeaderboardsCard() {
  const top = await getTopTideRunHolder()
  const hookLine = top && top.distance > 0
    ? `${top.username} leads Tide Run with ${top.distance.toLocaleString()}m`
    : 'Climb the boards across every game'

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
        <p className="font-karla font-400"
          style={{ fontSize: '0.74rem', lineHeight: 1.5, color: 'rgba(240,192,64,0.92)' }}>
          {top && top.distance > 0 ? (
            <>
              <span style={{ color: 'rgba(240,192,64,0.6)' }}>👑 </span>
              <span style={{ fontWeight: 700, color: '#f0ede8' }}>{top.username}</span>
              {' '}leads Tide Run with{' '}
              <span style={{ fontWeight: 700, color: '#ffd56b' }}>{top.distance.toLocaleString()}m</span>
            </>
          ) : (
            hookLine
          )}
        </p>
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
