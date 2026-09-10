'use client'

// Contextual coach-mark: a small character bust + one clear instruction, shown
// OVER the live game at the moment it matters (first cast, first bite, ...). The
// wrapper is pointer-events:none so taps pass straight through to the game — the
// player keeps playing and the parent dismisses the tip when they do the thing.
// A × dismisses it manually; autoHideMs fades it after a while so it never
// lingers. Character-driven but plain: say exactly what to do in one line.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { renderEmphasis } from '@/components/cutscene'

export default function GuideCoach({
  show, portrait, speaker, text, accent = '#5eb0e0', placement = 'bottom', offset, onClose, autoHideMs, onNext, nextLabel, z = 70,
  anchor,
}: {
  show: boolean
  portrait: string
  speaker: string
  /** One line. Wrap the key term in *asterisks* to hit it in the accent. */
  text: string
  accent?: string
  placement?: 'top' | 'bottom'
  /** z-index. Bump above a drawer/modal the tip needs to sit over (default 70). */
  z?: number
  /** Distance from the placement edge (raw CSS). Defaults clear the nav / the
   *  fishing action bar; override to tune per screen. */
  offset?: string
  /** Manual dismiss (the × button). Also fired by autoHideMs. */
  onClose?: () => void
  /** Auto-hide after this many ms while shown, so a tip never lingers. */
  autoHideMs?: number
  /** For a stepped walkthrough: shows a "Next →" button that advances. */
  onNext?: () => void
  nextLabel?: string
  /**
   * ── NEXT TO THE THING IT IS ABOUT ──────────────────────────────────────
   *
   * `data-coach` names, space separated; the first one on screen wins. The
   * card sits just below that element if it is in the top half of the
   * screen and just above it if it is in the bottom half, centred on it and
   * kept inside the viewport, with a small caret pointing at it. A line about
   * the Daily Haul disc used to read from the bottom of the screen while the
   * disc flashed in the top corner, and the eye had to go and find the thing
   * the words were about. Falls back to `placement` when nothing is found.
   */
  anchor?: string
}) {
  const top = placement === 'top'
  const edge = offset ?? (top
    ? 'calc(env(safe-area-inset-top, 0px) + 96px)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 128px)')

  // Where the anchored element is, measured on a short poll rather than once:
  // the elements these cards point at come and go with the game's own state
  // (a button inside a sheet, a chip inside the fishing overlay).
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null)
  useEffect(() => {
    if (!anchor || !show) { setAt(null); return }
    const names = anchor.split(' ').filter(Boolean)
    const measure = () => {
      for (const n of names) {
        const el = document.querySelector(`[data-coach="${n}"]`)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (!r.width && !r.height) continue
        const below = r.top + r.height / 2 < window.innerHeight * 0.5
        const next = { x: r.left + r.width / 2, y: below ? r.bottom : r.top, below }
        setAt(prev => (prev && Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1 && prev.below === next.below) ? prev : next)
        return
      }
      setAt(null)
    }
    measure()
    const id = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { window.clearInterval(id); window.removeEventListener('resize', measure) }
  }, [anchor, show])

  // The anchored geometry, worked out once per render. `window` is only read
  // once `at` exists, which is only ever on the client.
  const vw = at ? window.innerWidth : 0
  const cardW = at ? Math.min(430, vw - 24) : 0
  const left = at ? Math.max(12, Math.min(vw - cardW - 12, at.x - cardW / 2)) : 0
  const rises = at ? at.below : top

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
    // The slot is always there; the CARD is what comes and goes. Keyed by its
    // text, so a new line does not rewrite the old card in place -- it leaves,
    // and the next one arrives, which is what a tour that moves through beats
    // should look like. `wait` so the two never stack in one slot.
    <div
      style={at ? {
        position: 'fixed', zIndex: z, pointerEvents: 'none',
        left, width: cardW,
        ...(at.below ? { top: at.y + 14 } : { bottom: window.innerHeight - at.y + 14 }),
        display: 'flex', justifyContent: 'center',
      } : {
        position: 'fixed', left: 0, right: 0, zIndex: z,
        [top ? 'top' : 'bottom']: edge,
        display: 'flex', justifyContent: 'center', padding: '0 0.9rem',
        pointerEvents: 'none',   // taps fall through to the game
      }}
    >
      <AnimatePresence mode="wait">
        {show && (
          <motion.div
            key={text}
            initial={{ opacity: 0, y: rises ? -12 : 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: rises ? -8 : 8, transition: { duration: 0.18 } }}
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
            {/* THE CARET, when the card is pointing at something. Cut from the
                card's own colour so it reads as part of it, on the edge that
                faces the element, under the element's centre. */}
            {at && (
              <span aria-hidden style={{
                position: 'absolute', width: 12, height: 12, transform: 'rotate(45deg)',
                left: Math.max(10, Math.min(cardW - 22, at.x - left - 6)),
                ...(at.below
                  ? { top: -7, background: 'rgba(10,17,26,0.96)', borderLeft: `1px solid ${accent}55`, borderTop: `1px solid ${accent}55` }
                  : { bottom: -7, background: 'rgba(7,12,19,0.97)', borderRight: `1px solid ${accent}55`, borderBottom: `1px solid ${accent}55` }),
              }} />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portrait} alt="" loading="lazy" decoding="async"
              style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: `1px solid ${accent}66`, background: 'rgba(0,0,0,0.3)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.12em', color: accent, marginBottom: 2 }}>{speaker}</p>
              <p className="font-karla font-600" style={{ fontSize: '0.86rem', lineHeight: 1.3, color: '#eef2f7' }}>
                {renderEmphasis(text, accent)}
              </p>
            </div>
            {onNext && (
              <button
                onClick={onNext}
                className="font-karla font-700 uppercase"
                style={{ pointerEvents: 'auto', flexShrink: 0, alignSelf: 'center', padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.62rem', letterSpacing: '0.06em', background: `${accent}22`, border: `1px solid ${accent}77`, color: accent, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {nextLabel ?? 'Next →'}
              </button>
            )}
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
        )}
      </AnimatePresence>
    </div>
  )
}
