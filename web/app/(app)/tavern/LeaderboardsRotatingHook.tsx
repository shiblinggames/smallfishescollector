'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface LeaderboardHighlight {
  board: string
  username: string
  scoreLabel: string
}

// Rotating hook line for the Tavern Leaderboards hero card.
//
// Cycles through the top entry across 4 boards every 4.5 seconds with
// a small crossfade — like a bar's bulletin board ticking through the
// latest gossip. Each line follows the template "👑 USERNAME leads
// BOARD with SCORE", which is consistent across every board so the
// rotation reads as continuity, not noise.
//
// Empty / single-entry / cold-leaderboard cases:
//   - 0 highlights → static fallback line
//   - 1 highlight  → no rotation, just renders the one entry
//   - 2+           → rotates every 4.5s
//
// Reduced-motion: skip the rotation entirely if the user has the
// system reduce-motion preference set — sit on the first highlight
// instead of cycling. Respects accessibility without losing the
// social-proof hook.

export default function LeaderboardsRotatingHook({ highlights }: { highlights: LeaderboardHighlight[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Honor prefers-reduced-motion: don't cycle, just sit on the first
  // entry. Listener so the user can toggle the OS setting mid-session.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mql) return
    const apply = () => setPaused(mql.matches)
    apply()
    mql.addEventListener?.('change', apply)
    return () => mql.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    if (paused) return
    if (highlights.length <= 1) return
    const t = setInterval(() => setIndex(i => (i + 1) % highlights.length), 4500)
    return () => clearInterval(t)
  }, [paused, highlights.length])

  // Shared text styles — used by the empty-state line AND the rotating
  // entries. Margin reset + nowrap + ellipsis matter inside the fixed
  // 44px thin-bar parent so the line never flexes the layout.
  const textStyle: React.CSSProperties = {
    fontSize: '0.74rem',
    lineHeight: 1.4,
    color: 'rgba(240,192,64,0.92)',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  if (highlights.length === 0) {
    return (
      <p className="font-karla font-400" style={textStyle}>
        Climb the boards across every game
      </p>
    )
  }

  const current = highlights[index] ?? highlights[0]

  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={index}
        className="font-karla font-400"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        style={textStyle}
      >
        <span style={{ color: 'rgba(240,192,64,0.6)' }}>👑 </span>
        <span style={{ fontWeight: 700, color: '#f0ede8' }}>{current.username}</span>
        {' leads '}
        <span style={{ fontWeight: 700, color: 'rgba(240,192,64,0.95)' }}>{current.board}</span>
        {' with '}
        <span style={{ fontWeight: 700, color: '#ffd56b' }}>{current.scoreLabel}</span>
      </motion.p>
    </AnimatePresence>
  )
}
