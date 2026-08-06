'use client'

// "New orders on the board."
//
// Bounties open at the end of Chapter I and grow a rung with every chapter
// after it. None of that is worth anything if a captain never learns it
// happened: the hub tile just quietly stops being locked, and a fourth order
// appearing weeks later reads as a bug rather than a reward.
//
// So every rung announces itself once, the first time you reach the hub after
// earning it. One overlay serves all four, because the only thing that differs
// is the number of orders and who you had to beat for them.
//
// Portaled to body: the hub sits inside PageTransition, and an ancestor
// transform makes position:fixed resolve against that ancestor instead of the
// viewport, which turns a full-screen overlay into a box halfway down the page.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { markBountyRungSeen } from './bountyActions'

const GEM = '◆'
const ACCENT = '#c084fc'

export default function BountyRungUnlock({ chapter, title, boss, orders, gems, first, onOpen }: {
  chapter: number
  title: string
  boss: string
  orders: number
  gems: number
  /** The very first rung reads as opening a door; the rest read as a raise. */
  first: boolean
  onOpen: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  useEffect(() => setMounted(true), [])

  // Marked seen on ARRIVAL, not on dismissal. A captain who closes the app on
  // this screen has still been told, and re-announcing it tomorrow would read
  // as the game losing track rather than as a courtesy.
  useEffect(() => { void markBountyRungSeen(chapter) }, [chapter])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!mounted) return null

  function dismiss(open: boolean) {
    setClosing(true)
    if (open) onOpen()
  }

  return createPortal(
    <AnimatePresence>
      {!closing && (
        <motion.div
          key="bounty-rung"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          role="dialog" aria-modal="true"
          aria-label={first ? 'The bounty board is open' : `Chapter ${chapter} bounty rung`}
          style={{
            position: 'fixed', inset: 0, zIndex: 130,
            background: 'rgba(4,6,10,0.9)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.25rem', overflowY: 'auto',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            style={{
              position: 'relative', width: '100%', maxWidth: 390, margin: 'auto',
              borderRadius: 18, overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(24,17,34,0.99) 0%, rgba(9,8,12,0.99) 100%)',
              border: `1px solid ${ACCENT}55`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 44px ${ACCENT}22`,
            }}
          >
            {/* A notice nailed to a board: three hairlines fanning behind the
                title. Transform-only, so it costs nothing. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0.5 }}>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ delay: 0.18 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: 'absolute', left: 0, right: 0, top: 62 + i * 9, height: 1,
                    transformOrigin: i % 2 ? 'right' : 'left',
                    background: `linear-gradient(90deg, transparent, ${ACCENT}55, transparent)`,
                  }}
                />
              ))}
            </div>

            <div style={{ position: 'relative', padding: '1.6rem 1.35rem 1.25rem', textAlign: 'center' }}>
              <motion.p
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="font-karla font-700 uppercase tracking-[0.22em]"
                style={{ fontSize: '0.58rem', color: ACCENT }}
              >
                {boss} is down
              </motion.p>

              <motion.h2
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.18, type: 'spring', stiffness: 200, damping: 16 }}
                className="font-cinzel font-800"
                style={{ fontSize: '1.6rem', lineHeight: 1.15, color: '#f4ecfb', margin: '0.5rem 0 0', textWrap: 'balance' }}
              >
                {first ? 'The bounty board is open' : 'New orders on the board'}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }}
                className="font-karla font-400"
                style={{ fontSize: '0.82rem', color: '#a99cb8', lineHeight: 1.6, marginTop: '0.7rem' }}
              >
                {first
                  ? 'The harbourmaster keeps a board of work for captains with a name. Yours is on it now. New orders every morning, paid in gems.'
                  : `Clearing ${title} bought you a harder order, and the board pays for it.`}
              </motion.p>

              {/* What you actually got. */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                  margin: '1rem 0 0', padding: '0.7rem 0.9rem', borderRadius: 12,
                  background: `${ACCENT}14`, border: `1px solid ${ACCENT}3a`,
                }}
              >
                <div>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#f4ecfb', lineHeight: 1 }}>{orders}</p>
                  <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#a99cb8', marginTop: 3 }}>
                    {orders === 1 ? 'order a day' : 'orders a day'}
                  </p>
                </div>
                <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: `${ACCENT}33` }} />
                <div>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: ACCENT, lineHeight: 1 }}>{gems} {GEM}</p>
                  <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#a99cb8', marginTop: 3 }}>
                    if you clear them
                  </p>
                </div>
              </motion.div>

              <motion.button
                type="button"
                onClick={() => dismiss(true)}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58 }}
                className="font-karla font-800"
                style={{
                  width: '100%', marginTop: '1.05rem', padding: '0.72rem',
                  borderRadius: 11, fontSize: '0.82rem', color: '#f0e2ff',
                  background: `${ACCENT}22`, border: `1px solid ${ACCENT}70`,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                Read the board
              </motion.button>
              <button
                type="button"
                onClick={() => dismiss(false)}
                className="font-karla font-600"
                style={{
                  width: '100%', marginTop: 6, padding: '0.45rem',
                  background: 'none', border: 'none', color: '#7c7488',
                  fontSize: '0.74rem', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                Later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
