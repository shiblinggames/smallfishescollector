'use client'

import { useState, useEffect } from 'react'

const TOUR_KEY = 'expeditions-tour-seen-v1'

const STEPS = [
  {
    icon: '⚓',
    title: 'Assign Your Crew',
    body: 'Tap any slot on your ship to add a card from your collection. The first slot is your captain — they always return. The rest can be permanently lost at sea on risky routes.',
  },
  {
    icon: '🗺️',
    title: 'Pick a Route',
    body: 'Tap a location on the voyage map and hit Set Sail. Riskier routes pay more — but cost crew. A higher crew score improves your odds. Harder routes unlock as your expedition level grows.',
  },
  {
    icon: '⏳',
    title: 'Wait & Claim',
    body: 'Your crew sails for up to 6 hours (less with higher Nav and expedition level). Events appear as they happen. When they return, claim your doubloons, gems, and any rare drops.',
  },
]

export default function ExpeditionsTour() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) setVisible(true)
  }, [])

  function dismiss() {
    localStorage.setItem(TOUR_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const isLast = step === STEPS.length - 1
  const s = STEPS[step]

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(160deg, rgba(18,14,8,0.98) 0%, rgba(10,8,4,0.99) 100%)',
          border: '1px solid rgba(200,170,100,0.22)',
          borderRadius: 20, padding: '1.75rem 1.5rem 1.4rem',
          width: '100%', maxWidth: 360,
        }}
      >
        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: '1.5rem' }}>
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 20 : 6, height: 6,
                borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer',
                background: i === step ? '#c8a840' : 'rgba(255,255,255,0.15)',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>{s.icon}</span>
        </div>

        {/* Title */}
        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', textAlign: 'center', marginBottom: '0.75rem' }}>
          {s.title}
        </p>

        {/* Body */}
        <p className="font-karla" style={{ fontSize: '0.82rem', color: '#8a7a60', lineHeight: 1.7, textAlign: 'center', marginBottom: '1.5rem' }}>
          {s.body}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="font-karla font-600"
              style={{
                flex: 1, padding: '0.65rem', borderRadius: 10,
                fontSize: '0.78rem', color: '#6a5a40',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={isLast ? dismiss : () => setStep(s => s + 1)}
            className="font-cinzel font-700 uppercase tracking-[0.1em]"
            style={{
              flex: 1, padding: '0.65rem', borderRadius: 10,
              fontSize: '0.72rem',
              background: isLast ? 'rgba(200,168,64,0.18)' : 'rgba(200,168,64,0.12)',
              border: `1px solid rgba(200,168,64,${isLast ? '0.5' : '0.25'})`,
              color: '#c8a840', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isLast ? 'Got it' : 'Next →'}
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button
            onClick={dismiss}
            className="font-karla"
            style={{ display: 'block', margin: '0.75rem auto 0', fontSize: '0.62rem', color: '#3a3228', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
