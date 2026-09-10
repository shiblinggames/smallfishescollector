'use client'

// Contextual coach-mark: a small character bust + one clear instruction, shown
// OVER the live game at the moment it matters (first cast, first bite, ...). The
// wrapper is pointer-events:none so taps pass straight through to the game — the
// player keeps playing and the parent dismisses the tip when they do the thing.
// A × dismisses it manually; autoHideMs fades it after a while so it never
// lingers. Character-driven but plain: say exactly what to do in one line.
//
// ── EACH CARD OWNS WHERE IT SITS ────────────────────────────────────────────
//
// The first anchored version kept the position on the WRAPPER and swapped
// cards inside it. Three things went wrong with that at once, and a tester saw
// all three: a new card measured its target a quarter-second after it
// appeared, so it landed at the bottom and then jumped (a flash, then the card
// again); the target's own pulse -- the flash ring scales it -- moved the
// measurement a pixel or two, so the card crept while nobody touched anything;
// and when a card left, the wrapper had already moved to the NEXT card's spot,
// so the leaving card was dragged across the screen for its fade.
//
// So the position belongs to the card. Each one measures its own target
// before its first paint, keeps that spot for its whole life including the
// fade-out, and only moves for a real change -- a resize, or a target that has
// genuinely gone somewhere else, past a deadband the pulse cannot cross.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { renderEmphasis } from '@/components/cutscene'

const useIsoLayout = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Card width on screen. The old inline maxWidth, kept as a number because the
 *  anchor maths needs it. */
const CARD_W = 430
/** Gap between the card and the thing it points at. */
const GAP = 14
/** How far a target may drift before the card follows. Wider than the flash
 *  ring's pulse, so a breathing target does not walk the card. */
const DEADBAND = 8

type Spot = { x: number; y: number; below: boolean }

function findSpot(anchor: string): Spot | null {
  for (const n of anchor.split(' ').filter(Boolean)) {
    const el = document.querySelector(`[data-coach="${n}"]`)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    const below = r.top + r.height / 2 < window.innerHeight * 0.5
    return { x: r.left + r.width / 2, y: below ? r.bottom : r.top, below }
  }
  return null
}

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
   * screen and just above it if in the bottom half, centred on it and kept
   * inside the viewport, with a small caret pointing at it. Falls back to
   * `placement` when nothing is found.
   */
  anchor?: string
}) {
  // Auto-hide timer. onClose is read through a ref so an inline arrow from the
  // parent doesn't reset the timer every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!show || !autoHideMs) return
    const t = setTimeout(() => onCloseRef.current?.(), autoHideMs)
    return () => clearTimeout(t)
  }, [show, autoHideMs])

  // Keyed by its text, so a new line does not rewrite the old card in place:
  // it leaves, and the next one arrives. `wait` so the two never stack.
  return (
    <AnimatePresence mode="wait">
      {show && (
        <Card key={text}
          portrait={portrait} speaker={speaker} text={text} accent={accent}
          placement={placement} offset={offset} z={z} anchor={anchor}
          onClose={onClose} onNext={onNext} nextLabel={nextLabel} />
      )}
    </AnimatePresence>
  )
}

function Card({ portrait, speaker, text, accent, placement, offset, z, anchor, onClose, onNext, nextLabel }: {
  portrait: string; speaker: string; text: string; accent: string
  placement: 'top' | 'bottom'; offset?: string; z: number; anchor?: string
  onClose?: () => void; onNext?: () => void; nextLabel?: string
}) {
  const top = placement === 'top'
  const edge = offset ?? (top
    ? 'calc(env(safe-area-inset-top, 0px) + 96px)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 128px)')

  const cardRef = useRef<HTMLDivElement | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const [cardH, setCardH] = useState(92)

  // BEFORE THE FIRST PAINT, so the card is born where it belongs rather than
  // arriving at the bottom and hopping. Then a slow re-check for a target that
  // has really moved, and the window for a resize.
  useIsoLayout(() => {
    if (!anchor) { setSpot(null); return }
    const measure = (force: boolean) => {
      const next = findSpot(anchor)
      // A target that has gone -- a sheet closed, a chip unmounted -- keeps
      // the card where it was rather than dropping it to the bottom; the next
      // card will find its own place.
      if (!next) return
      setSpot(prev => (!force && prev
        && Math.abs(prev.x - next.x) < DEADBAND && Math.abs(prev.y - next.y) < DEADBAND
        && prev.below === next.below) ? prev : next)
    }
    measure(true)
    const id = window.setInterval(() => measure(false), 500)
    const onResize = () => measure(true)
    window.addEventListener('resize', onResize)
    return () => { window.clearInterval(id); window.removeEventListener('resize', onResize) }
  }, [anchor])

  // The card's own height, for sitting ABOVE a target. Measured after layout.
  useIsoLayout(() => {
    const h = cardRef.current?.getBoundingClientRect().height
    if (h && Math.abs(h - cardH) > 1) setCardH(h)
  })

  const vw = spot ? window.innerWidth : 0
  const cardW = spot ? Math.min(CARD_W, vw - 24) : 0
  const left = spot ? Math.max(12, Math.min(vw - cardW - 12, spot.x - cardW / 2)) : 0
  const rises = spot ? spot.below : top
  // `top` for both cases, so a card that changes its mind never has to swap
  // between two properties that cannot transition into each other.
  const y = spot ? (spot.below ? spot.y + GAP : spot.y - GAP - cardH) : 0

  return (
    <motion.div
      // OPACITY AND Y ONLY. A scaling card is rasterised at its first size and
      // the bust inside it comes out soft; the same move without the scale
      // reads the same and stays sharp.
      initial={{ opacity: 0, y: rises ? -10 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: rises ? -6 : 6, transition: { duration: 0.16, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={spot ? {
        position: 'fixed', zIndex: z, pointerEvents: 'none',
        left, top: y, width: cardW,
        transition: 'left 220ms ease, top 220ms ease',
        display: 'flex', justifyContent: 'center',
      } : {
        position: 'fixed', left: 0, right: 0, zIndex: z,
        [top ? 'top' : 'bottom']: edge,
        display: 'flex', justifyContent: 'center', padding: '0 0.9rem',
        pointerEvents: 'none',   // taps fall through to the game
      }}
    >
      <div ref={cardRef}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 11,
          width: '100%', maxWidth: CARD_W,
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
        {spot && (
          <span aria-hidden style={{
            position: 'absolute', width: 12, height: 12, transform: 'rotate(45deg)',
            left: Math.max(10, Math.min(cardW - 22, spot.x - left - 6)),
            ...(spot.below
              ? { top: -7, background: 'rgba(10,17,26,0.96)', borderLeft: `1px solid ${accent}55`, borderTop: `1px solid ${accent}55` }
              : { bottom: -7, background: 'rgba(7,12,19,0.97)', borderRight: `1px solid ${accent}55`, borderBottom: `1px solid ${accent}55` }),
          }} />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portrait} alt="" width={108} height={108} decoding="async"
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
      </div>
    </motion.div>
  )
}
