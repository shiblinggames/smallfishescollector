'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type TourPlacement =
  | 'center'
  | 'top' | 'top-left' | 'top-right'
  | 'bottom' | 'bottom-left' | 'bottom-right'

export interface TourStep {
  color: string
  title: string
  body: string
  placement?: TourPlacement
  // Optional primary action rendered as a prominent button inside the
  // card (e.g. the browser-install step). Tapping it does NOT advance
  // the tour — the footer Next/Got it still handles that.
  cta?: { label: string; onClick: () => void }
}

interface Props {
  steps: TourStep[]
  onDone: () => void
}

const NAV_OFFSET = '5rem'   // below the nav bar
const BOTTOM_OFFSET = '7rem' // above the mobile tab bar

function cardStyle(placement: TourPlacement): React.CSSProperties {
  switch (placement) {
    case 'top':         return { position: 'fixed', top: NAV_OFFSET, left: '1rem', right: '1rem' }
    case 'top-left':    return { position: 'fixed', top: NAV_OFFSET, left: '1rem', maxWidth: 320 }
    case 'top-right':   return { position: 'fixed', top: NAV_OFFSET, right: '1rem', maxWidth: 320 }
    case 'bottom':      return { position: 'fixed', bottom: BOTTOM_OFFSET, left: '1rem', right: '1rem' }
    case 'bottom-left': return { position: 'fixed', bottom: BOTTOM_OFFSET, left: '1rem', maxWidth: 320 }
    case 'bottom-right':return { position: 'fixed', bottom: BOTTOM_OFFSET, right: '1rem', maxWidth: 320 }
    default:            return { position: 'fixed', top: '50%', left: '1rem', right: '1rem', transform: 'translateY(-50%)', maxWidth: 400, margin: '0 auto' }
  }
}

function Arrow({ placement, color }: { placement: TourPlacement; color: string }) {
  const base: React.CSSProperties = {
    position: 'absolute', width: 10, height: 10,
    background: '#0a1828',
    transform: 'rotate(45deg)',
  }

  // For top-placed cards the arrow points UP (at content above)
  // For bottom-placed cards the arrow points DOWN (at content below)
  if (placement === 'top' || placement === 'top-left' || placement === 'top-right') {
    const h: React.CSSProperties = placement === 'top-right' ? { right: 22 } : { left: 22 }
    return <div style={{ ...base, top: -6, ...h, borderTop: `1px solid ${color}45`, borderLeft: `1px solid ${color}45` }} />
  }
  if (placement === 'bottom' || placement === 'bottom-left' || placement === 'bottom-right') {
    const h: React.CSSProperties = placement === 'bottom-right' ? { right: 22 } : { left: 22 }
    return <div style={{ ...base, bottom: -6, ...h, borderBottom: `1px solid ${color}45`, borderRight: `1px solid ${color}45` }} />
  }
  return null
}

export default function StepTourModal({ steps, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(true)
  const current = steps[step]
  const placement = current.placement ?? 'center'
  const isLast = step === steps.length - 1

  function advance() {
    if (isLast) {
      setVisible(false)
      onDone()
    } else {
      setStep(s => s + 1)
    }
  }

  if (!visible) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.62)' }}
      onClick={advance}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          style={{
            ...cardStyle(placement),
            zIndex: 51,
            background: '#0a1828',
            border: '1px solid rgba(255,255,255,0.1)',
            borderLeft: `3px solid ${current.color}`,
            borderRadius: 14,
            padding: '1.1rem 1.25rem',
          }}
          onClick={e => e.stopPropagation()}
        >
          <Arrow placement={placement} color={current.color} />

          <div className="flex items-center gap-2.5 mb-2">
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: current.color, flexShrink: 0 }} />
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: current.color }}>
              {current.title}
            </p>
          </div>
          <p className="font-karla font-400 mb-3" style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55 }}>
            {current.body}
          </p>
          {current.cta && (
            <button
              onClick={e => { e.stopPropagation(); current.cta!.onClick() }}
              className="font-karla font-700 uppercase tracking-[0.1em] w-full"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: '0.74rem', cursor: 'pointer', touchAction: 'manipulation',
                color: '#04141a', background: current.color, border: 'none',
                borderRadius: 9, padding: '0.65rem', marginBottom: '0.75rem',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M8 11l4 4 4-4" />
                <path d="M5 18v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />
              </svg>
              {current.cta.label}
            </button>
          )}
          <div className="flex items-center justify-between">
            <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#5a5856' }}>
              {step + 1} / {steps.length}
            </p>
            <button
              onClick={e => { e.stopPropagation(); advance() }}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{
                fontSize: '0.74rem', cursor: 'pointer', touchAction: 'manipulation',
                color: current.color,
                background: `${current.color}18`,
                border: `1px solid ${current.color}50`,
                borderRadius: 8, padding: '0.35rem 0.85rem',
              }}
            >
              {isLast ? 'Got it' : 'Next →'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
