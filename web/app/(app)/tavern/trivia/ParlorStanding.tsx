'use client'

// The Parlor Standing card — your mastery rank across both games. The point total
// fills an XP-style bar so you SEE how far to the next rank; tapping the card opens
// the full rank ladder (every rank, its point gate, its gem reward, and whether
// you've reached/collected it). Portal-to-body so a transformed ancestor can't break
// the fixed overlay (see feedback_transform_breaks_fixed_positioning).

import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import { GEM_GLYPH } from '@/lib/uiTokens'
import { PARLOR_RANKS, parlorRank } from './constants'

const GOLD = '#f0c040'
const GEM = '#c084fc'

export default function ParlorStanding({ points, streak, claimedGems }: { points: number; streak: number; claimedGems: number }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { rank, next } = parlorRank(points)
  const span = next ? next.at - rank.at : 1
  const into = next ? points - rank.at : 1
  const pct = next ? Math.max(0, Math.min(1, into / span)) : 1
  const toNext = next ? Math.max(0, next.at - points) : 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-karla"
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '0.8rem 0.95rem', borderRadius: 14,
          background: 'linear-gradient(180deg, #201a12 0%, #120d08 100%)',
          border: '1px solid rgba(201,162,74,0.4)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* eyebrow + "view ranks" affordance */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#a8a090' }}>Parlor Standing</span>
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: rank.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            All ranks
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={rank.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
        </div>

        {/* rank title + streak */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 3 }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: rank.color, lineHeight: 1.05, textShadow: `0 0 12px ${rank.color}66` }}>{rank.title}</span>
          {streak > 0 && (
            <span style={{ flexShrink: 0, textAlign: 'right' }}>
              <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: GOLD, textShadow: `0 0 12px ${GOLD}66` }}>{streak}</span>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: '#a8a090', marginLeft: 4 }}>on a roll</span>
            </span>
          )}
        </div>

        {/* XP bar — points fill toward the next rank */}
        <div style={{ marginTop: 9, position: 'relative', height: 10, borderRadius: 999, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22, delay: 0.1 }}
            style={{
              height: '100%', borderRadius: 999,
              background: `linear-gradient(90deg, ${rank.color}, ${next?.color ?? rank.color})`,
              boxShadow: `0 0 10px ${(next?.color ?? rank.color)}88`,
            }}
          />
          {/* soft moving sheen so a filling bar feels alive */}
          <motion.div
            aria-hidden
            animate={{ x: ['-40%', '140%'] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)' }}
          />
        </div>

        {/* caption: current pts (left), what's left to next (right) */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 5 }}>
          <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#e7dcc4' }}>{points.toLocaleString()} pts</span>
          {next ? (
            <span className="font-karla" style={{ fontSize: '0.62rem', color: '#c2b9a4' }}>
              {toNext.toLocaleString()} to <span style={{ color: next.color }}>{next.title}</span> · <span style={{ color: GEM }}>+{next.gems} {GEM_GLYPH}</span>
            </span>
          ) : (
            <span className="font-karla" style={{ fontSize: '0.62rem', color: GEM }}>Top rank — every rank attained</span>
          )}
        </div>
      </button>

      {mounted && open && createPortal(
        <AnimatePresence>
          <ParlorLadderModal points={points} claimedGems={claimedGems} onClose={() => setOpen(false)} />
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function ParlorLadderModal({ points, claimedGems, onClose }: { points: number; claimedGems: number; onClose: () => void }) {
  const { rank: current } = parlorRank(points)
  // Highest rank at the TOP so the peak reads first; you climb toward it.
  const rows = [...PARLOR_RANKS].filter(r => r.gems > 0).reverse()

  // Running cumulative gems, to tell claimed vs ready vs locked per rank.
  const cumById = new Map<number, number>()
  let cum = 0
  for (const r of PARLOR_RANKS) { cum += r.gems; cumById.set(r.at, cum) }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'radial-gradient(ellipse 90% 70% at 50% 35%, rgba(30,20,10,0.72), rgba(6,4,12,0.92))',
        backdropFilter: 'blur(3px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 380, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          borderRadius: 20, background: 'linear-gradient(180deg, #241a12 0%, #130d08 100%)',
          border: '1px solid rgba(201,162,74,0.4)', boxShadow: '0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* header */}
        <div style={{ padding: '1rem 1.1rem 0.7rem', borderBottom: '1px solid rgba(201,162,74,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0e8d0' }}>Parlor Ranks</p>
            <button onClick={onClose} aria-label="Close" style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 4, lineHeight: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a8a090" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <p className="font-karla" style={{ fontSize: '0.64rem', color: '#a8a090', marginTop: 2 }}>
            Earn points in both games to climb. Each rank pays its gems once — collect them in the lobby.
          </p>
        </div>

        {/* ladder — highest at top */}
        <div style={{ overflowY: 'auto', padding: '0.6rem 0.7rem 0.9rem' }}>
          {rows.map(r => {
            const reached = points >= r.at
            const cumHere = cumById.get(r.at) ?? 0
            const collected = reached && cumHere <= claimedGems
            const ready = reached && !collected
            const isCurrent = r.at === current.at
            const gap = Math.max(0, r.at - points)
            const status = collected ? 'Collected' : ready ? 'Ready to collect' : `${gap.toLocaleString()} pts to go`
            const statusColor = collected ? '#7fd49a' : ready ? GEM : '#8a8478'
            return (
              <div
                key={r.at}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '0.6rem 0.65rem', borderRadius: 12, marginBottom: 5,
                  background: isCurrent ? `linear-gradient(90deg, ${r.color}22, transparent)` : 'transparent',
                  border: isCurrent ? `1px solid ${r.color}88` : '1px solid transparent',
                  opacity: reached ? 1 : 0.62,
                }}
              >
                {/* medallion pip in the rank colour */}
                <span aria-hidden style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: `radial-gradient(circle at 50% 35%, ${r.color}, #1a120a 92%)`, border: `1.5px solid ${r.color}`, boxShadow: reached ? `0 0 10px ${r.color}66` : 'none' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: reached ? r.color : '#c2b9a4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                    <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: GEM, flexShrink: 0 }}>+{r.gems} {GEM_GLYPH}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                    <span className="font-karla" style={{ fontSize: '0.56rem', color: '#8a8478' }}>{r.at.toLocaleString()} pts{isCurrent ? ' · you are here' : ''}</span>
                    <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: statusColor, flexShrink: 0 }}>{status}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}
