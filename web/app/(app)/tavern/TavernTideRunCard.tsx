import Link from 'next/link'

// Full-width hero card for Tide Run. Tide Run is one of the most-played
// games in the Tavern, so it earns top-of-fold hero treatment alongside
// Recruit + Leaderboards instead of being buried in the Arcade grid.
// Same banner shape as the other two heroes (text left, art right) so
// the three pulls at the top of the page read as a consistent stack.
//
// Hook line is personal when possible — the player's own PB drives
// engagement way harder than a generic tagline ("Outrun pursuit").
// Falls back to the tagline only when the player has never run.

export default function TavernTideRunCard({ personalBest = 0 }: { personalBest?: number }) {
  const hasPB = personalBest > 0
  return (
    <Link
      href="/tavern/tide-run"
      style={{
        display: 'flex', alignItems: 'stretch', gap: '1rem',
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(8,14,22,0.98) 0%, rgba(10,28,46,0.95) 100%)',
        border: '1px solid rgba(93,167,212,0.5)',
        borderTop: '2px solid rgba(93,167,212,0.85)',
        borderRadius: 20,
        padding: '1.4rem 1.5rem 1.3rem',
        cursor: 'pointer',
        userSelect: 'none',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 0 40px rgba(93,167,212,0.16), inset 0 0 60px rgba(93,167,212,0.04)',
      }}
    >
      {/* Left: text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.18em]"
          style={{ fontSize: '0.56rem', color: 'rgba(93,167,212,0.78)', marginBottom: '0.45rem', letterSpacing: '0.2em' }}>
          Arcade
        </p>
        <p className="font-cinzel font-700"
          style={{ fontSize: '1.25rem', color: '#f0ede8', lineHeight: 1.15, marginBottom: '0.45rem', letterSpacing: '0.02em' }}>
          Tide Run
        </p>
        <p className="font-karla font-400"
          style={{ fontSize: '0.74rem', lineHeight: 1.5, color: 'rgba(180,210,236,0.9)' }}>
          {hasPB ? (
            <>
              <span style={{ color: 'rgba(180,210,236,0.6)' }}>Your best: </span>
              <span style={{ fontWeight: 700, color: '#cfe5fa' }}>{personalBest.toLocaleString()}m</span>
              <span style={{ color: 'rgba(180,210,236,0.6)' }}> · beat it</span>
            </>
          ) : (
            'Outrun pursuit. Smash beacons for doubloons'
          )}
        </p>
      </div>

      {/* Right: boat art (reuses the existing /boatrun.png asset
          from the game itself). Larger than the compact-grid version
          so it reads as a featured banner image, not a tiny avatar. */}
      <div style={{
        flexShrink: 0, width: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/boatrun.png"
          alt=""
          style={{
            width: '100%',
            height: 110,
            objectFit: 'contain',
            opacity: 0.95,
            filter: 'drop-shadow(0 4px 18px rgba(93,167,212,0.5))',
          }}
        />
      </div>
    </Link>
  )
}
