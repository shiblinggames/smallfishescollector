'use client'

// Swipe-to-act wrapper for list/card rows — THE shared mobile gesture pattern
// (born on the crew cards; use this everywhere a row has one quick action).
//
// The child follows the finger 1:1 (a single bound motion value — no state
// churn during the drag, so it stays smooth) and snaps open/closed on release.
// The card slides over to reveal a floating CIRCLE button in the uncovered
// strip (scales + fades in with the swipe, so it can't persist once closed).
// Tapping it fires onAction (swipe reveals, tap confirms — two deliberate
// gestures, no accidental fire). A plain tap passes through to the child; a
// tap on an OPEN card just closes it.
//   side 'left'  → swipe LEFT, circle revealed on the right (e.g. Dismiss/Sell)
//   side 'right' → swipe RIGHT, circle revealed on the left
// `enabled` false renders the child bare (no swipe at all) — use for locked
// rows rather than wrapping conditionally, so hooks stay stable.
// `hintPeek` (once per mount, parent-flagged): the card slides itself open a
// beat then springs back — demonstrates the gesture with no text.

import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useTransform, animate, useAnimationControls } from 'framer-motion'
import { vibrate, hapticReward } from '@/lib/haptics'

const SWIPE_SPRING = { type: 'spring' as const, stiffness: 700, damping: 46, restDelta: 0.4 }
const CIRCLE_SHADOW = '0 4px 12px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.24)'

export default function SwipeAction({ enabled, side, label, icon, gradient, textColor, glow, hintPeek, onPeeked, onAction, children }: {
  enabled: boolean; side: 'left' | 'right'; label: string; icon: ReactNode
  gradient: string; textColor: string; glow: string
  hintPeek?: boolean; onPeeked?: () => void; onAction: () => void; children: ReactNode
}) {
  const x = useMotionValue(0)
  const REVEAL = 84
  const right = side === 'right'
  const openX = right ? REVEAL : -REVEAL
  // How far open, 0→1, regardless of side. Drives the circle's pop-in.
  const prog = useTransform(x, right ? [0, REVEAL] : [-REVEAL, 0], right ? [0, 1] : [1, 0])
  const circleOpacity = useTransform(prog, [0, 0.3, 1], [0, 1, 1])
  const circleScale = useTransform(prog, [0, 1], [0.4, 1])
  const draggedRef = useRef(false)
  const openRef = useRef(false)
  const press = useAnimationControls()
  // One-time teaser: slide the card open a bit to reveal the circle, then spring
  // back — demonstrates the swipe without any text. Runs once per mount when the
  // parent flags this as the hint card.
  const peekedRef = useRef(false)
  useEffect(() => {
    if (!enabled || !hintPeek || peekedRef.current) return
    peekedRef.current = true
    onPeeked?.()
    const t = setTimeout(() => {
      animate(x, side === 'right' ? [0, 52, 0] : [0, -52, 0], { duration: 1.15, times: [0, 0.42, 1], ease: [0.4, 0, 0.2, 1] })
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!enabled) return <>{children}</>
  const snapTo = (target: number) => { openRef.current = target !== 0; animate(x, target, SWIPE_SPRING) }
  const pressDown = () => { vibrate(13); press.start({ scale: 0.82, transition: { type: 'spring', stiffness: 800, damping: 26 } }) }
  const pressUp = () => { press.start({ scale: 1, transition: { type: 'spring', stiffness: 480, damping: 12 } }) }
  const confirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (openRef.current === false) return
    openRef.current = false
    hapticReward()
    // A deliberate, fixed-duration squish → overshoot pop + a glow burst that
    // plays out fully (the card holds open ~300ms so you actually see it).
    press.start({
      scale: [0.62, 1.26, 1],
      boxShadow: [CIRCLE_SHADOW, `0 0 26px ${glow}, ${CIRCLE_SHADOW}`, CIRCLE_SHADOW],
      transition: { duration: 0.42, times: [0, 0.5, 1], ease: [0.3, 1.5, 0.5, 1] },
    })
    setTimeout(onAction, 300)
  }
  return (
    <div style={{ position: 'relative', borderRadius: 7, overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.55)' }}>
      {/* Circle action button, centered in the strip the card uncovers. The
          reveal (opacity/scale from the swipe) lives on the outer wrapper; the
          inner button owns the press-down squish + confirm pop so the two don't
          fight over `scale`. */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, [right ? 'left' : 'right']: 0, width: REVEAL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div style={{ opacity: circleOpacity, scale: circleScale }}>
          <motion.button type="button" aria-label={label}
            animate={press}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onPointerDown={pressDown}
            onPointerUp={pressUp}
            onPointerLeave={pressUp}
            onClick={confirm}
            style={{
              width: 48, height: 48, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: gradient, color: textColor, cursor: 'pointer',
              boxShadow: CIRCLE_SHADOW,
            }}>
            {icon}
          </motion.button>
        </motion.div>
      </div>
      {/* The draggable card — bound to `x` so drag + snap share one value. */}
      <motion.div
        drag="x"
        dragConstraints={right ? { left: 0, right: REVEAL } : { left: -REVEAL, right: 0 }}
        dragElastic={0.04}
        dragDirectionLock
        onDragStart={() => { draggedRef.current = false }}
        onDrag={(_, info) => { if (Math.abs(info.offset.x) > 5) draggedRef.current = true }}
        onDragEnd={(_, info) => {
          const opened = right
            ? (info.offset.x > REVEAL * 0.42 || info.velocity.x > 350)
            : (info.offset.x < -REVEAL * 0.42 || info.velocity.x < -350)
          snapTo(opened ? openX : 0)
        }}
        onClickCapture={(e) => {
          if (draggedRef.current) { e.stopPropagation(); draggedRef.current = false; return }
          if (openRef.current) { e.stopPropagation(); snapTo(0) }
        }}
        style={{ x, position: 'relative', zIndex: 1, touchAction: 'pan-y', borderRadius: 7, willChange: 'transform' }}
      >
        {children}
      </motion.div>
    </div>
  )
}
