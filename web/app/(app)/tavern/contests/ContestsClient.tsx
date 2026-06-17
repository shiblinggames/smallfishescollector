'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import {
  CONTESTS, formatContestScore,
  type ContestDef, type ContestView, type ContestStanding,
} from '@/lib/contests'

const MEDAL_COLORS = ['#f0c040', '#c8c8c8', '#cd8c4a']
const MEDALS = ['🥇', '🥈', '🥉']
const LIVE = '#34d399'
const GOLD = '#f0c040'

/** A contest is "decided" once it's flagged completed OR someone has won it. */
function isDecided(def: ContestDef, view: ContestView | undefined): boolean {
  return def.status === 'completed' || !!view?.winner
}

export default function ContestsClient({ views }: { views: Record<string, ContestView> }) {
  const active = CONTESTS.filter(c => !isDecided(c, views[c.id]))
  const completed = CONTESTS.filter(c => isDecided(c, views[c.id]))

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Link href="/tavern" className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#9a948a', display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          Tavern
        </Link>
        <h1 className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#f0ece4' }}>Contests</h1>
        <span style={{ width: 56 }} />
      </div>
      <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: '#9a948a', marginBottom: 14, lineHeight: 1.5 }}>
        Community races for one-of-a-kind rewards. Be the first to the mark and the prize is yours alone.
      </p>

      {/* Carry-over assurance — these prizes are permanent, beta or not. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24,
        background: `linear-gradient(90deg, ${GOLD}1a 0%, ${GOLD}08 100%)`,
        border: `1px solid ${GOLD}44`, borderRadius: 12, padding: '0.7rem 0.85rem',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#e8dfc8', lineHeight: 1.45 }}>
          <span className="font-700" style={{ color: GOLD }}>Every reward here is permanent.</span> It stays on your captain and carries into the full game after beta. Nothing won is ever wiped.
        </p>
      </div>

      {/* Active */}
      {active.length > 0 && (
        <section style={{ marginBottom: completed.length > 0 ? 28 : 0 }}>
          <SectionHeader kind="active" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {active.map(c => <ContestCard key={c.id} def={c} view={views[c.id]} decided={false} />)}
          </div>
        </section>
      )}

      {/* Hall of Champions (completed / won) */}
      {completed.length > 0 && (
        <section>
          <SectionHeader kind="completed" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {completed.map(c => <ContestCard key={c.id} def={c} view={views[c.id]} decided />)}
          </div>
        </section>
      )}
    </div>
  )
}

function SectionHeader({ kind }: { kind: 'active' | 'completed' }) {
  const isActive = kind === 'active'
  const color = isActive ? LIVE : GOLD
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
      {isActive ? (
        <motion.span
          animate={{ opacity: [1, 0.35, 1], scale: [1, 0.82, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 8, height: 8, borderRadius: '50%', background: LIVE, boxShadow: `0 0 9px ${LIVE}`, flexShrink: 0 }}
        />
      ) : (
        <span style={{ fontSize: '0.95rem', lineHeight: 1, flexShrink: 0 }}>🏆</span>
      )}
      <h2 className="font-cinzel font-800 uppercase tracking-[0.1em]" style={{ fontSize: '0.82rem', color }}>
        {isActive ? 'Active Now' : 'Hall of Champions'}
      </h2>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${color}40, transparent)` }} />
    </div>
  )
}

function ContestCard({ def, view, decided }: { def: ContestDef; view: ContestView | undefined; decided: boolean }) {
  const winner = view?.winner ?? null
  const standings = view?.standings ?? []
  const accent = decided ? GOLD : (def.accent ?? GOLD)
  const statusLabel = def.status === 'completed' ? 'Completed' : decided ? 'Won' : 'Live'

  return (
    <div style={{
      background: decided
        ? 'linear-gradient(180deg, rgba(26,22,14,0.92) 0%, rgba(12,10,7,0.96) 100%)'
        : 'linear-gradient(180deg, rgba(18,26,30,0.92) 0%, rgba(9,14,18,0.96) 100%)',
      border: `1px solid ${decided ? `${GOLD}3a` : `${accent}55`}`,
      borderRadius: 18,
      overflow: 'hidden',
      // Active contests get a soft live glow; decided ones sit calm.
      boxShadow: decided ? 'none' : `0 0 22px ${accent}14`,
    }}>
      {/* Header strip */}
      <div style={{ padding: '0.95rem 1.05rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <h3 className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#f5f1e9' }}>{def.name}</h3>
          <span className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.52rem', padding: '0.24rem 0.6rem', borderRadius: 999,
              color: decided ? GOLD : LIVE,
              background: decided ? `${GOLD}18` : `${LIVE}1a`,
              border: `1px solid ${decided ? `${GOLD}50` : `${LIVE}55`}`,
            }}>
            {!decided && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 6, height: 6, borderRadius: '50%', background: LIVE, boxShadow: `0 0 6px ${LIVE}` }}
              />
            )}
            {statusLabel}
          </span>
        </div>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: accent, marginBottom: 6 }}>{def.goalLabel}</p>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a948a', lineHeight: 1.5 }}>{def.tagline}</p>
      </div>

      {/* Body */}
      <div style={{ padding: '0.9rem 1.05rem 1.05rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <span style={{ fontSize: '0.95rem' }}>🎁</span>
          <span className="font-karla" style={{ fontSize: '0.74rem', color: '#c9c3b8' }}>
            <span className="font-700" style={{ color: '#e8dfc8' }}>Prize:</span> {def.prize}
          </span>
        </div>

        {decided && winner ? (
          <WinnerBanner winner={winner} />
        ) : standings.length > 0 ? (
          <>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#7a756c', marginBottom: 9 }}>Leading the chase</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {standings.map(s => (
                <StandingRow key={s.rank} s={s} accent={accent} def={def} />
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

function WinnerBanner({ winner }: { winner: NonNullable<ContestView['winner']> }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: `linear-gradient(90deg, ${GOLD}22 0%, ${GOLD}0a 100%)`,
      border: `1px solid ${GOLD}66`,
      borderRadius: 14, padding: '0.75rem 0.85rem',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <CharacterAvatar characterColor={winner.characterColor} equippedHat={winner.equippedHat} size={50}
          ringColor={winner.avatarBorder ?? undefined} bgColor={winner.avatarBg ?? undefined} />
        <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '1.05rem', lineHeight: 1 }}>🏆</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: GOLD, marginBottom: 2 }}>Champion</p>
        <p className="font-cinzel font-800 truncate" style={{ fontSize: '1.05rem', color: '#f5f1e9', lineHeight: 1.15 }}>{winner.username}</p>
        <p className="font-karla" style={{ fontSize: '0.64rem', color: '#9a948a', marginTop: 1 }}>Claimed the prize. Untouchable.</p>
      </div>
    </div>
  )
}

function StandingRow({ s, accent, def }: { s: ContestStanding; accent: string; def: ContestDef }) {
  const goal = def.board?.goal ?? 0
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
