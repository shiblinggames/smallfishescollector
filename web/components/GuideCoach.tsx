'use client'

// Contextual coach-mark: a small character bust + one clear instruction, shown
// OVER the live game at the moment it matters (first cast, first bite, ...). The
// wrapper is pointer-events:none so taps pass straight through to the game — the
// player keeps playing and the parent dismisses the tip when they do the thing.
// A × dismisses it manually; autoHideMs fades it after a while so it never
// lingers. Character-driven but plain: say exactly what to do in one line.

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { renderEmphasis } from '@/components/cutscene'

export default function GuideCoach({
  show, portrait, speaker, text, accent = '#5eb0e0', placement = 'bottom', offset, onClose, autoHideMs,
}: {
  show: boolean
  portrait: string
  speaker: string
  /** One line. Wrap the key term in *asterisks* to hit it in the accent. */
  text: string
  accent?: string
  placement?: 'top' | 'bottom'
  /** Distance from the placement edge (raw CSS). Defaults clear the nav / the
   *  fishing action bar; override to tune per screen. */
  offset?: string
  /** Manual dismiss (the × button). Also fired by autoHideMs. */
  onClose?: () => void
  /** Auto-hide after this many ms while shown, so a tip never lingers. */
  autoHideMs?: number
}) {
  const top = placement === 'top'
  const edge = offset ?? (top
    ? 'calc(env(safe-area-inset-top, 0px) + 96px)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 128px)')

  // Auto-hide timer. onClose is read through a ref so an inline arrow from the
  // parent doesn't reset the timer every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!show || !autoHideMs) return
    const t = setTimeout(() => onCloseRef.current?.(), autoHideMs)
    return () => clearTimeout(t)
  }, [show, autoHideMs])

  return (
    <AnimatePresence>
      {show && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, zIndex: 70,
            [top ? 'top' : 'bottom']: edge,
            display: 'flex', justifyContent: 'center', padding: '0 0.9rem',
            pointerEvents: 'none',   // taps fall through to the game
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: top ? -12 : 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: top ? -8 : 8, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 11,
              width: '100%', maxWidth: 430,
              background: 'linear-gradient(180deg, rgba(10,17,26,0.96) 0%, rgba(7,12,19,0.97) 100%)',
              border: `1px solid ${accent}55`,
              borderRadius: 16,
              padding: '0.7rem 0.85rem',
              paddingRight: onClose ? '1.7rem' : '0.85rem',
              boxShadow: `0 12px 34px rgba(0,0,0,0.55), 0 0 20px ${accent}18`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portrait} alt="" loading="lazy" decoding="async"
              style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: `1px solid ${accent}66`, background: 'rgba(0,0,0,0.3)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.12em', color: accent, marginBottom: 2 }}>{speaker}</p>
              <p className="font-karla font-600" style={{ fontSize: '0.86rem', lineHeight: 1.3, color: '#eef2f7' }}>
                {renderEmphasis(text, accent)}
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Dismiss tip"
                style={{ pointerEvents: 'auto', position: 'absolute', top: 5, right: 6, width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', lineHeight: 1, cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
