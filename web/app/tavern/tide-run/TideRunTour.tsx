'use client'

import { useState } from 'react'

interface TourStep {
  eyebrow: string
  title: string
  body: React.ReactNode
}

const STEPS: TourStep[] = [
  {
    eyebrow: 'The Story',
    title: 'The Cargo Run',
    body: (
      <>
        You&apos;ve stolen a boat full of gold and there&apos;s trouble on your
        tail. Stay ahead as long as you can — the further you get, the bigger
        the payout.
      </>
    ),
  },
  {
    eyebrow: 'Controls',
    title: 'Hold to Jump',
    body: (
      <>
        <span style={{ color: '#bda05a', fontWeight: 700 }}>Tap and hold
        anywhere</span> to jump. Quick tap = small hop. Long hold = big leap.
      </>
    ),
  },
  {
    eyebrow: 'Hazards',
    title: 'Read the Water',
    body: (
      <>
        <span style={{ color: '#e0e8ef', fontWeight: 700 }}>Rocks</span> — jump
        over them.
        <br />
        <span style={{ color: '#a0c8e0', fontWeight: 700 }}>Shoals</span>
        {' '}(dark water) — jump or you wreck.
        <br />
        <span style={{ color: '#dfeaef', fontWeight: 700 }}>Currents</span>
        {' '}(white foam) — ride through to slow down, or jump to keep speed.
      </>
    ),
  },
  {
    eyebrow: 'The Trick',
    title: 'Smash the Beacons',
    body: (
      <>
        Some rocks have a blinking amber light — those are
        <span style={{ color: '#ffb84d', fontWeight: 700 }}> beacons</span>.
        <br />
        <br />
        <span style={{ color: '#9ae6b4', fontWeight: 700 }}>Smash through them
        on the water</span> to take them out.{' '}
        <span style={{ color: '#fda4a4', fontWeight: 700 }}>Jump over one</span>
        {' '}and the alarm wrecks you.
      </>
    ),
  },
  {
    eyebrow: 'Rewards',
    title: 'Pick Your Run',
    body: (
      <>
        Play as much as you want — every run counts toward your best score.
        <br />
        <br />
        Once a day you can <span style={{ color: '#bda05a', fontWeight: 700 }}>cash
        in</span> one run for <span style={{ color: '#bda05a' }}>⟡</span> based
        on how far you got.
        <span style={{ color: '#bda05a', fontWeight: 700 }}> Resets at midnight.</span>
      </>
    ),
  },
]

const TOUR_COMPLETED_KEY = 'tide-run-tour-completed'

export function hasCompletedTideRunTour(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(TOUR_COMPLETED_KEY) === '1'
}

export function markTideRunTourCompleted() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOUR_COMPLETED_KEY, '1')
}

interface Props {
  onClose: () => void
}

export default function TideRunTour({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  const finish = () => {
    markTideRunTourCompleted()
    onClose()
  }

  return (
    <div
      onClick={finish}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(2, 6, 14, 0.78)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'linear-gradient(180deg, rgba(14, 28, 48, 0.96), rgba(6, 16, 32, 0.96))',
          border: '1px solid rgba(189,160,90,0.55)',
          borderRadius: 16,
          padding: '22px 22px 18px',
          color: '#f0ede8',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header: skip + progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === step ? '#bda05a' : 'rgba(255,255,255,0.18)',
                  transition: 'width 0.2s',
                }}
              />
            ))}
          </div>
          <button
            onClick={finish}
            className="font-karla font-700 uppercase tracking-[0.14em]"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.45)',
              fontSize: '0.62rem',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            Skip
          </button>
        </div>

        {/* Eyebrow */}
        <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#bda05a', marginBottom: 6 }}>
          {s.eyebrow}
        </p>

        {/* Title */}
        <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#ffffff', marginBottom: 10, lineHeight: 1.15 }}>
          {s.title}
        </p>

        {/* Body */}
        <p className="font-karla font-300" style={{ fontSize: '0.92rem', color: 'rgba(240,237,232,0.9)', lineHeight: 1.55, minHeight: 92 }}>
          {s.body}
        </p>

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="font-karla font-700"
            style={{
              background: 'none',
              border: 'none',
              color: step === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)',
              fontSize: '0.78rem',
              cursor: step === 0 ? 'default' : 'pointer',
              padding: '8px 10px',
            }}
          >
            ← Back
          </button>
          <button
            onClick={() => isLast ? finish() : setStep(s => Math.min(STEPS.length - 1, s + 1))}
            className="font-cinzel font-700"
            style={{
              padding: '10px 18px',
              borderRadius: 999,
              background: 'linear-gradient(180deg, rgba(189,160,90,0.95), rgba(150,120,55,0.95))',
              border: '1px solid rgba(220,190,120,0.85)',
              color: '#1a0f02',
              fontSize: '0.82rem',
              letterSpacing: '0.04em',
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(189,160,90,0.35)',
            }}
          >
            {isLast ? 'Set Sail' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
