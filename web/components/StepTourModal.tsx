'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface TourStep {
  color: string
  title: string
  body: string
}

interface Props {
  steps: TourStep[]
  onDone: () => void
}

export default function StepTourModal({ steps, onDone }: Props) {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  function advance() {
    if (isLast) onDone()
    else setStep(s => s + 1)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
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
            background: '#0a1828',
            border: '1px solid rgba(255,255,255,0.1)',
            borderLeft: `3px solid ${current.color}`,
            borderRadius: 14,
            padding: '1.1rem 1.25rem',
            maxWidth: 380,
            width: '100%',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: current.color, flexShrink: 0 }} />
            <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: current.color }}>
              {current.title}
            </p>
          </div>
          <p className="font-karla font-400 mb-3" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
            {current.body}
          </p>
          <div className="flex items-center justify-between">
            <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845' }}>
              {step + 1} / {steps.length}
            </p>
            <button
              onClick={e => { e.stopPropagation(); advance() }}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{
                fontSize: '0.68rem', cursor: 'pointer', touchAction: 'manipulation',
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
