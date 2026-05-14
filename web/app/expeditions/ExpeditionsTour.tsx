'use client'

import { useState, startTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markExpeditionsTourSeen } from './tourActions'

// First-time briefing for the Expeditions page. Mirrors the Skirmish tour
// pattern: positioned cards with an arrow pointing at the actual panel
// each step describes, lighter backdrop so the underlying UI is readable.

interface TourStep {
  title: string
  body: string
  cardStyle: React.CSSProperties
  arrowDir: 'up' | 'down' | 'none'
  arrowAlign: 'left' | 'center' | 'right'
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Expeditions',
    body: "The strategic side of the game. Send your crew on Voyages for steady daily rewards, or sail into Raids for turn-based ship combat against scripted bosses.",
    cardStyle: { top: '50%', left: '1rem', right: '1rem', transform: 'translateY(-50%)' },
    arrowDir: 'none', arrowAlign: 'center',
  },
  {
    title: 'Voyages: Daily Routes',
    body: "Each day brings a fresh route — text-event journeys with risk and reward. Pick a path, set sail, then claim doubloons, gems, and rare drops when your crew returns.",
    cardStyle: { top: '26%', left: '1rem', right: '1rem' },
    arrowDir: 'down', arrowAlign: 'center',
  },
  {
    title: 'Raids: Ship Combat',
    body: "Turn-based broadside battles. Start with the Skirmish to learn enemy patterns, then take on Barnacle Pete for exclusive loot like the Corsair Cannon and Black Corsair skin.",
    cardStyle: { top: '38%', left: '1rem', right: '1rem' },
    arrowDir: 'down', arrowAlign: 'center',
  },
  {
    title: 'Crew & Loadout',
    body: "Your loadout drives both scores. Open View Loadout to set your captain (first slot — always returns), assign supporting crew, and equip raid items. Recruit new crew with packs or upgrade your ship at the shipyard to push your scores higher.",
    cardStyle: { top: '54%', left: '1rem', right: '1rem' },
    arrowDir: 'up', arrowAlign: 'center',
  },
]

export default function ExpeditionsTour({ hasSeen }: { hasSeen: boolean }) {
  const [visible, setVisible] = useState(!hasSeen)
  const [step, setStep] = useState(0)

  function advance() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else dismiss()
  }

  function dismiss() {
    setVisible(false)
    setStep(0)
    startTransition(() => { void markExpeditionsTourSeen() })
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="exp-tour-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={advance}
            style={{
              position: 'fixed', inset: 0, zIndex: 100, cursor: 'pointer',
              background: 'rgba(0,0,0,0.55)',
            }}
          />
          <motion.div
            key={`exp-tour-${step}`}
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', zIndex: 101,
              maxWidth: 360, margin: '0 auto',
              background: '#0e1a2b',
              border: '1px solid rgba(96,165,250,0.36)',
              borderRadius: 14,
              padding: '0.95rem 1.05rem 0.85rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.55)',
              ...STEPS[step].cardStyle,
            }}
          >
            {(() => {
              const s = STEPS[step]
              if (s.arrowDir === 'none') return null
              const color = 'rgba(96,165,250,0.36)'
              const base: React.CSSProperties = {
                position: 'absolute', width: 12, height: 12, background: '#0e1a2b',
                transform: 'rotate(45deg)',
              }
              const align =
                s.arrowAlign === 'center' ? { left: '50%', marginLeft: -6 } :
                s.arrowAlign === 'right'  ? { right: 28 } :
                                            { left: 28 }
              const pos: React.CSSProperties = s.arrowDir === 'up'
                ? { top: -7, ...align }
                : { bottom: -7, ...align }
              const border: React.CSSProperties = s.arrowDir === 'up'
                ? { borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` }
                : { borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }
              return <div style={{ ...base, ...pos, ...border }} />
            })()}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#7a9bc4', letterSpacing: '0.16em' }}>
                Captain&rsquo;s Briefing
              </p>
              <div style={{ display: 'flex', gap: 4 }}>
                {STEPS.map((_, i) => (
                  <span key={i} style={{
                    width: i === step ? 18 : 6, height: 5, borderRadius: 999,
                    background: i === step ? '#60a5fa' : 'rgba(255,255,255,0.18)',
                    transition: 'width 0.22s ease',
                  }} />
                ))}
              </div>
            </div>

            <p className="font-cinzel font-700" style={{ fontSize: '1.02rem', color: '#f0ede8', marginBottom: '0.45rem', lineHeight: 1.2 }}>
              {STEPS[step].title}
            </p>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.78)', lineHeight: 1.55, marginBottom: '0.85rem' }}>
              {STEPS[step].body}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <button
                onClick={e => { e.stopPropagation(); dismiss() }}
                className="font-karla font-600 uppercase tracking-[0.08em]"
                style={{
                  fontSize: '0.68rem', cursor: 'pointer', touchAction: 'manipulation',
                  color: 'rgba(240,237,232,0.5)',
                  background: 'none', border: 'none', padding: '0.4rem 0.3rem',
                }}
              >
                Skip
              </button>
              <button
                onClick={e => { e.stopPropagation(); advance() }}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  fontSize: '0.78rem', cursor: 'pointer', touchAction: 'manipulation',
                  color: '#0a1422',
                  background: '#60a5fa',
                  border: 'none', borderRadius: 10, padding: '0.58rem 1.15rem',
                  boxShadow: '0 4px 14px rgba(96,165,250,0.35)',
                }}
              >
                {step === STEPS.length - 1 ? 'Got it' : 'Next'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
