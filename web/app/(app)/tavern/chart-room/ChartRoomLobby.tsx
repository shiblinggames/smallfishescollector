'use client'

// The Chart Room — the front door for the grid / navigation "thinker"
// games. Same lobby skeleton as the Den and the Parlor. The
// Quartermaster's Hold (daily sudoku) is live; Charting lives here too
// now (moved off the tavern home 2026-06-13).

import HoldCard from './HoldCard'
import TreasureMatchCard from './TreasureMatchCard'
import MinefieldCard from './MinefieldCard'
import RiggingCard from './RiggingCard'
import { DEN_PURSE_TIERS, DEN_CAP_NONMEMBER } from '../constants'
import BecomeCaptainButton from '@/components/BecomeCaptainButton'
import BackButton from '@/components/BackButton'

const GOLD = '#f0c040'

export default function ChartRoomLobby({ doubloons, holdStatus, holdDoubloonsToday, matchStatus, matchReward, minefieldStatus, minefieldReward, riggingStatus, riggingReward, puzzlePoints, isMember }: {
  doubloons: number
  holdStatus: 'open' | 'locked' | 'done'
  holdDoubloonsToday: number
  matchStatus: 'active' | 'cleared'
  matchReward: number
  minefieldStatus: 'active' | 'cleared'
  minefieldReward: number
  riggingStatus: 'active' | 'cleared'
  riggingReward: number
  puzzlePoints: number
  isMember: boolean
}) {
  // Index of the highest tier the player's points reach. For members this IS
  // their active cap; for non-members it's the cap they'd unlock the instant
  // they join (their points are banked but don't apply until then).
  const currentIdx = DEN_PURSE_TIERS.reduce((acc, t, i) => (puzzlePoints >= t.points ? i : acc), 0)
  const nextTier = DEN_PURSE_TIERS[currentIdx + 1] ?? null
  const memberUnlockCap = DEN_PURSE_TIERS[currentIdx].cap

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header — side rails get equal flex so the title sits centered. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BackButton href="/tavern" label="Tavern" />
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          Charting
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
      </div>

      <p className="font-karla" style={{ fontSize: '0.8rem', color: '#c2b9a4', lineHeight: 1.55, textAlign: 'center' }}>
        A quiet corner for steady minds. Four puzzles, fresh every week.
      </p>

      {/* Den-purse progress — compact. Points (from the puzzles) raise
          your daily casino buy-in cap; the chips show the ladder. */}
      <div style={{
        padding: '0.7rem 0.85rem 0.75rem', borderRadius: 14,
        background: ['radial-gradient(ellipse 80% 70% at 50% 0%, rgba(196,169,106,0.12) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(44,34,16,0.55) 0%, rgba(26,19,9,0.65) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f4ecd8' }}>Den Purse</span>
            {!isMember && (
              <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.46rem', color: GOLD, background: `${GOLD}16`, border: `1px solid ${GOLD}44`, borderRadius: 999, padding: '0.14rem 0.4rem' }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.8" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                Captain perk
              </span>
            )}
          </div>
          <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#cfc6b0' }}>
            <span className="font-cinzel" style={{ color: GOLD, fontSize: '1rem' }}>{puzzlePoints}</span> pts
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DEN_PURSE_TIERS.map((t, i) => {
            const reached = puzzlePoints >= t.points
            // The points-reached tier is "Now" for members, the membership
            // unlock target for non-members.
            const peak = i === currentIdx
            const lit = isMember ? peak : false   // non-members aren't actually AT any ladder tier
            return (
              <div key={t.points} style={{
                flex: 1, padding: '0.5rem 0.2rem', borderRadius: 9, textAlign: 'center',
                background: peak ? `${GOLD}26` : reached ? 'rgba(196,169,106,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${peak ? GOLD : reached ? 'rgba(196,169,106,0.32)' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: peak ? `0 0 10px ${GOLD}33` : 'none',
                opacity: isMember || peak || reached ? 1 : 0.72,
              }}>
                <div className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: peak ? GOLD : reached ? '#f4ecd8' : '#8f8676' }}>
                  {t.cap / 1000}k
                </div>
                <div className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.06em', marginTop: 2, color: peak ? GOLD : reached ? '#7bbf7b' : '#8f8676' }}>
                  {lit ? 'Now' : peak ? (isMember ? 'Now' : 'Captain') : reached ? '✓' : `${t.points} pt`}
                </div>
              </div>
            )
          })}
        </div>
        {isMember ? (
          <p className="font-karla" style={{ fontSize: '0.64rem', color: '#a89e86', textAlign: 'center', marginTop: 8, lineHeight: 1.4 }}>
            Solve the puzzles for charting points → bigger daily casino purse (⟡/day).{nextTier ? ` ${nextTier.points - puzzlePoints} to ${nextTier.cap / 1000}k.` : ' Top purse reached.'}
          </p>
        ) : (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#a89e86', textAlign: 'center', lineHeight: 1.45 }}>
              You sit at a flat <span className="font-700" style={{ color: '#d8cfb6' }}>{DEN_CAP_NONMEMBER.toLocaleString()} ⟡</span>/day. Your {puzzlePoints} points are banked — become a Captain and your purse jumps to <span className="font-700" style={{ color: GOLD }}>{memberUnlockCap / 1000}k</span> instantly.
            </p>
            <BecomeCaptainButton style={{ padding: '0.55rem 1.1rem', fontSize: '0.82rem' }} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <HoldCard status={holdStatus} doubloonsToday={holdDoubloonsToday} />
        <TreasureMatchCard status={matchStatus} reward={matchReward} />
        <MinefieldCard status={minefieldStatus} reward={minefieldReward} />
        <RiggingCard status={riggingStatus} reward={riggingReward} isMember={isMember} />
      </div>

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        Fresh puzzles every Monday. Stow the hold clean for a bonus.
      </p>
    </div>
  )
}
