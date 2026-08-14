'use client'

import { motion, AnimatePresence } from 'framer-motion'

// Full-screen tap gate used at the end of a raid kill beat. The combat
// scene stays visible underneath (transparent backdrop); a bold pulsing
// "Tap to continue" banner sits over the action-log area (where the
// player's eyes already are reading the kill narration) so it's
// impossible to miss, then they advance when ready.

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
          data-any-key
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
            // Float the banner up over the action-log area (above the
            // action buttons, where the kill narration just streamed) so
            // it lands where the player is already looking. Tap anywhere.
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 168px)',
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: [1, 1.045, 1] }}
            transition={{
              scale:   { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: 0.22, ease: 'easeOut' },
              y:       { duration: 0.25, ease: 'easeOut' },
            }}
            className="font-cinzel font-700 uppercase"
            style={{
              fontSize: '0.95rem', letterSpacing: '0.12em',
              color: '#eceae5',
              background: 'rgba(12,18,26,0.82)',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 999,
              padding: '0.7rem 1.6rem',
              boxShadow: '0 0 20px rgba(200,220,255,0.16), 0 6px 18px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Tap to continue →
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
