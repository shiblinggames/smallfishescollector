'use client'

import Link from 'next/link'
import CharacterAvatar from '@/components/CharacterAvatar'
import {
  CONTESTS, formatContestScore,
  type ContestDef, type ContestView, type ContestStanding,
} from '@/lib/contests'

const MEDAL_COLORS = ['#f0c040', '#c8c8c8', '#cd8c4a']
const MEDALS = ['🥇', '🥈', '🥉']

export default function ContestsClient({ views }: { views: Record<string, ContestView> }) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <Link href="/tavern" className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#9a948a', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          Tavern
        </Link>
        <h1 className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#f0ece4' }}>Contests</h1>
        <span style={{ width: 56 }} />
      </div>
      <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: '#9a948a', marginBottom: 22, lineHeight: 1.5 }}>
        Community races for one-of-a-kind rewards. Be the first to the mark and the prize is yours alone.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CONTESTS.map(c => (
          <ContestCard key={c.id} def={c} view={views[c.id]} />
        ))}
      </div>
    </div>
  )
}

function ContestCard({ def, view }: { def: ContestDef; view: ContestView | undefined }) {
  const winner = view?.winner ?? null
  const standings = view?.standings ?? []
  const decided = !!winner
  const accent = def.accent ?? '#f0c040'
  // A completed contest, or an active one someone has already won, shows the
  // winner banner. An active, still-open contest shows the live chase.
  const showWinner = decided

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(20,24,32,0.9) 0%, rgba(10,13,20,0.96) 100%)',
      border: `1px solid ${accent}33`,
      borderRadius: 18,
      overflow: 'hidden',
    }}>
      {/* Header strip */}
      <div style={{ padding: '0.95rem 1.05rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <h2 className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#f5f1e9' }}>{def.name}</h2>
          <span className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{
              fontSize: '0.52rem', padding: '0.22rem 0.55rem', borderRadius: 999,
              color: decided ? '#4ade80' : accent,
              background: decided ? 'rgba(74,222,128,0.12)' : `${accent}1a`,
              border: `1px solid ${decided ? 'rgba(74,222,128,0.3)' : `${accent}44`}`,
            }}>
            {def.status === 'completed' ? 'Completed' : decided ? 'Won' : 'Live'}
          </span>
        </div>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: accent, marginBottom: 6 }}>{def.goalLabel}</p>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a948a', lineHeight: 1.5 }}>{def.tagline}</p>
      </div>

      {/* Body */}
      <div style={{ padding: '0.9rem 1.05rem 1.05rem' }}>
        {/* Prize line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <span style={{ fontSize: '0.95rem' }}>🎁</span>
          <span className="font-karla" style={{ fontSize: '0.74rem', color: '#c9c3b8' }}>
            <span className="font-700" style={{ color: '#e8dfc8' }}>Prize:</span> {def.prize}
          </span>
        </div>

        {showWinner ? (
          <WinnerBanner accent={accent} winner={winner!} />
        ) : standings.length > 0 ? (
          <>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#7a756c', marginBottom: 9 }}>Leading the chase</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {standings.map(s => (
                <StandingRow key={s.rank} s={s} goal={def.board?.goal ?? 0} unit={def.board?.unit ?? ''} accent={accent} def={def} />
              ))}
            </div>
            <p className="font-karla" style={{ fontSize: '0.7rem', color: '#7a756c', marginTop: 11, textAlign: 'center' }}>
              No champion yet. First to {def.board ? formatContestScore(def.board, def.board.goal) : 'the mark'} takes the prize.
            </p>
          </>
        ) : (
          <p className="font-karla" style={{ fontSize: '0.74rem', color: '#7a756c', textAlign: 'center', padding: '0.6rem 0' }}>
            No runs on the board yet. Be the first to set the pace.
          </p>
        )}
      </div>
    </div>
  )
}

function WinnerBanner({ winner, accent }: { winner: NonNullable<ContestView['winner']>; accent: string }) {
  const gold = '#f0c040'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: `linear-gradient(90deg, ${gold}1c 0%, ${gold}08 100%)`,
      border: `1px solid ${gold}55`,
      borderRadius: 14, padding: '0.75rem 0.85rem',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <CharacterAvatar characterColor={winner.characterColor} equippedHat={winner.equippedHat} size={50}
          ringColor={winner.avatarBorder ?? undefined} bgColor={winner.avatarBg ?? undefined} />
        <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '1.05rem', lineHeight: 1 }}>🏆</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: gold, marginBottom: 2 }}>Champion</p>
        <p className="font-cinzel font-800 truncate" style={{ fontSize: '1.05rem', color: '#f5f1e9', lineHeight: 1.15 }}>{winner.username}</p>
        <p className="font-karla" style={{ fontSize: '0.64rem', color: '#9a948a', marginTop: 1 }}>Claimed the prize. Untouchable.</p>
      </div>
    </div>
  )
}

function StandingRow({ s, goal, unit, accent, def }: { s: ContestStanding; goal: number; unit: string; accent: string; def: ContestDef }) {
  const medalColor = MEDAL_COLORS[s.rank - 1] ?? '#9a948a'
  const pct = goal > 0 ? Math.min(100, (s.score / goal) * 100) : 0
  const scoreLabel = def.board ? formatContestScore(def.board, s.score) : `${s.score}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: '1.05rem', width: 22, textAlign: 'center', flexShrink: 0 }}>{MEDALS[s.rank - 1] ?? `${s.rank}`}</span>
      <CharacterAvatar characterColor={s.characterColor} equippedHat={s.equippedHat} size={32}
        ringColor={s.avatarBorder ?? undefined} bgColor={s.avatarBg ?? undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
          <span className="font-karla font-700 truncate" style={{ fontSize: '0.78rem', color: '#e8dfc8' }}>{s.username}</span>
          <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: medalColor, flexShrink: 0 }}>{scoreLabel}</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: `linear-gradient(90deg, ${accent}99, ${accent})` }} />
        </div>
      </div>
    </div>
  )
}
