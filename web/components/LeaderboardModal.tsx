'use client'

// Reusable in-section leaderboard. Renders a small trigger button; on
// tap it opens a body-portaled modal that lazy-loads only the boards
// this section cares about, so the player never leaves the game.

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LeaderboardSection, BOARD_META, type BoardKey } from '@/app/(app)/leaderboard/boardUI'
import { getLeaderboardBoards, type LeaderboardBoardsResult } from '@/app/(app)/leaderboard/actions'

export default function LeaderboardModal({
  boards,
  label = 'Ranks',
  title = 'Leaderboard',
  triggerStyle,
}: {
  boards: BoardKey[]
  label?: string
  title?: string
  triggerStyle?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<LeaderboardBoardsResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<BoardKey>(boards[0])
  const [pending, startTransition] = useTransition()

  function openModal() {
    setOpen(true)
    if (data || pending) return
    setErr(null)
    startTransition(async () => {
      const res = await getLeaderboardBoards(boards)
      if ('error' in res) { setErr(res.error); return }
      setData(res)
    })
  }

  const meta = BOARD_META[activeTab]

  const sheet = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          maxHeight: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          background: 'linear-gradient(180deg, #0b1420 0%, #060c14 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '0.85rem 1rem calc(1.4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.7rem' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8' }}>{title}</p>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9a9690', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Board tabs (only when this section owns more than one) */}
        {boards.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${boards.length}, 1fr)`, gap: 6, marginBottom: '1rem' }}>
            {boards.map(key => {
              const b = BOARD_META[key]
              const isActive = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="font-karla font-700 active:scale-95 transition-transform duration-75"
                  style={{
                    padding: '0.5rem 0.5rem',
                    borderRadius: 9,
                    background: isActive ? `${b.accent}1f` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isActive ? `${b.accent}80` : 'rgba(255,255,255,0.1)'}`,
                    color: isActive ? '#f0ede8' : '#9a9690',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {b.label}
                </button>
              )
            })}
          </div>
        )}

        {err ? (
          <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f08a8a', textAlign: 'center', padding: '2rem 0' }}>{err}</p>
        ) : !data ? (
          <p className="font-karla font-300 uppercase tracking-[0.14em]" style={{ fontSize: '0.7rem', color: '#5a7a9a', textAlign: 'center', padding: '2.5rem 0' }}>Loading…</p>
        ) : (
          <LeaderboardSection
            accent={meta.accent}
            unit={meta.unit}
            subUnit={meta.subUnit}
            showZone={meta.showZone}
            valueColor={meta.valueColor}
            data={data.boards[activeTab] ?? []}
            myScore={data.myScores[activeTab] ?? null}
            currentUserId={data.currentUserId}
            avatars={data.avatars}
          />
        )}
      </motion.div>
    </motion.div>
  )

  return (
    <>
      <button
        onClick={openModal}
        className="font-karla font-700 uppercase tracking-[0.1em]"
        style={{
          // Subtle compact pill — same shape as the FishingGame HUD's
          // zone-tinted variant, but with a neutral gold tint so it's
          // the right baseline everywhere (Tide Run, ZoneLanding, etc.)
          // without each caller having to restyle. Callers that want a
          // tinted version (e.g. FishingGame in a zone) still override
          // via `triggerStyle`.
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '0.28rem 0.65rem',
          borderRadius: 20,
          background: 'rgba(4,10,18,0.72)',
          border: '1px solid rgba(240,192,64,0.4)',
          color: '#f0c040',
          fontSize: '0.5rem',
          boxShadow: 'none',
          cursor: 'pointer',
          touchAction: 'manipulation',
          ...triggerStyle,
        }}
      >
        <span aria-hidden style={{ fontSize: '0.82rem', lineHeight: 1 }}>🏆</span>
        {label}
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>{open && sheet}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}
