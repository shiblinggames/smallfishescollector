'use client'

import { useState } from 'react'

interface TourStep {
  eyebrow: string
  title: string
  body: React.ReactNode
}

// Three steps. Cargo Run story flavor and the rock/shoal/current
// classification both folded into the actual rules players need:
// control (hold), hazards (with the non-obvious beacon trick), and
// once-a-day cashin. Rock shapes show themselves in play; the beacon
// rule is genuinely non-obvious and earns its own step.
const STEPS: TourStep[] = [
  {
    eyebrow: 'Controls',
    title: 'Hold to Jump',
    body: (
      <>
        <span style={{ color: '#bda05a', fontWeight: 700 }}>Tap and hold</span>
        {' '}anywhere to jump the rocks. Quick tap hops, long hold leaps.
      </>
    ),
  },
  {
    eyebrow: 'The Trick',
    title: 'Smash the Beacons',
    // "Smash them on the water" was the reported sticking point, and the fault
    // is position rather than vocabulary: the card BEFORE this one teaches
    // jumping, so a player arrives here primed to jump everything and reads
    // "smash" as something they do in the air.
    //
    // Three facts, one sentence each: which rocks are beacons, what you do to
    // them, what happens if you get it wrong. "Ram them head-on" is the whole
    // fix -- it says the boat stays down without needing a clause about the
    // water, and it cannot be read as anything you do mid-air.
    body: (
      <>
        Rocks with a blinking
        <span style={{ color: '#ffb84d', fontWeight: 700 }}> amber light </span>
        are beacons.{' '}
        <span style={{ color: '#9ae6b4', fontWeight: 700 }}>Ram them head-on.</span>
        {' '}Jumping one sets off the alarm and wrecks you.
      </>
    ),
  },
  {
    eyebrow: 'Rewards',
    title: 'Smash for Doubloons',
    body: (
      <>
        Every beacon pays{' '}
        <span style={{ color: '#bda05a', fontWeight: 700 }}>2 <span style={{ color: '#bda05a' }}>⟡</span></span>.
        Distance chases the leaderboard.
      </>
    ),
  },
]

interface Props {
  // Parent persists "seen" server-side (profiles.has_seen_tide_run_tour);
  // this just closes the modal.
  onClose: () => void
}

export default function TideRunTour({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  const finish = () => {
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
