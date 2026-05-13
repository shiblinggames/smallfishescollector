'use client'

import { motion, AnimatePresence } from 'framer-motion'

// Subtle full-screen tap gate used at the end of a raid kill beat. The combat
// scene stays visible underneath (transparent backdrop); a small pulsing
// "Tap to continue" hint sits near the bottom so the player knows to advance
// when they're ready instead of being auto-pushed into the next fight.

interface Props {
  visible: boolean
  onTap: () => void
}

export default function TapToContinueGate({ visible, onTap }: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="tap-to-continue"
          type="button"
          onClick={onTap}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          aria-label="Tap to continue"
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            // Hint sits near the bottom so it doesn't cover the action log
            // or the player nameplate. Pure tap-anywhere catcher.
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0.55, 1, 0.55], y: 0 }}
            transition={{
              opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
              y:       { duration: 0.25, ease: 'easeOut' },
            }}
            className="font-karla font-700 uppercase"
            style={{
              fontSize: '0.7rem', letterSpacing: '0.16em',
              color: 'rgba(240,237,232,0.85)',
              background: 'rgba(6,12,20,0.78)',
              border: '1px solid rgba(240,237,232,0.18)',
              borderRadius: 999,
              padding: '0.5rem 1.1rem',
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          >
            Tap to continue
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
