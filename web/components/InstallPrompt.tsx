'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const SNOOZE_KEY = 'pwa-snooze-until'
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

function isSnoozed() {
  const until = localStorage.getItem(SNOOZE_KEY)
  return until ? Date.now() < parseInt(until, 10) : false
}

function snooze() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
}

function permanentlyDismiss() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + 365 * 24 * 60 * 60 * 1000))
}

const IOS_STEPS = [
  { src: '/PWA1.png', label: 'Tap the ··· menu in Safari' },
  { src: '/PWA2.png', label: 'Tap Share' },
  { src: '/PWA3.png', label: 'Tap View More' },
  { src: '/PWA4.png', label: 'Tap Add to Home Screen' },
  { src: '/PWA5.png', label: 'Tap Add' },
]

function IOSGuideModal({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0)
  const touchStartX = useRef<number | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) {
      if (diff > 0 && step < IOS_STEPS.length - 1) setStep(s => s + 1)
      if (diff < 0 && step > 0) setStep(s => s - 1)
    }
    touchStartX.current = null
  }

  const isLast = step === IOS_STEPS.length - 1

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem 0.75rem',
        flexShrink: 0,
      }}>
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.15em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: '0.2rem' }}>
            Add to Home Screen
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8' }}>
            {IOS_STEPS[step].label}
          </p>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0a09a" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Screenshot */}
      <div
        style={{ flex: 1, position: 'relative', overflow: 'hidden', userSelect: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {IOS_STEPS.map(({ src, label }, i) => (
          <div
            key={src}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 1.25rem',
              transition: 'opacity 0.2s, transform 0.2s',
              opacity: i === step ? 1 : 0,
              transform: i === step ? 'translateX(0)' : i < step ? 'translateX(-8%)' : 'translateX(8%)',
              pointerEvents: i === step ? 'auto' : 'none',
            }}
          >
            <Image
              src={src}
              alt={label}
              width={280}
              height={606}
              style={{
                maxHeight: '100%',
                width: 'auto',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                objectFit: 'contain',
              }}
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '1rem 1.25rem', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        {/* Dot indicators */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {IOS_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? '#f0c040' : 'rgba(255,255,255,0.2)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="font-karla font-600"
              style={{ flex: 1, padding: '0.75rem', borderRadius: 12, fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a09a', cursor: 'pointer' }}
            >
              ← Back
            </button>
          )}
          {isLast ? (
            <button
              onClick={onDismiss}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{ flex: 1, padding: '0.75rem', borderRadius: 12, fontSize: '0.72rem', background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.4)', color: '#f0c040', cursor: 'pointer' }}
            >
              Got it!
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{ flex: 1, padding: '0.75rem', borderRadius: 12, fontSize: '0.72rem', background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.4)', color: '#f0c040', cursor: 'pointer' }}
            >
              Next →
            </button>
          )}
        </div>

        <button
          onClick={onDismiss}
          className="font-karla font-300"
          style={{ fontSize: '0.62rem', color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    if (standalone) return

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    setIsIOS(ios)

    function tryShow() {
      if (!isSnoozed()) setShow(true)
    }

    function handleRequest() {
      setShow(true)
    }
    window.addEventListener('pwa-install-request', handleRequest)

    let cleanup: (() => void) | undefined
    if (ios) {
      const timer = setTimeout(tryShow, 4000)
      cleanup = () => clearTimeout(timer)
    } else {
      function handlePrompt(e: Event) {
        e.preventDefault()
        setDeferredPrompt(e as BeforeInstallPromptEvent)
        tryShow()
      }
      window.addEventListener('beforeinstallprompt', handlePrompt)
      cleanup = () => window.removeEventListener('beforeinstallprompt', handlePrompt)
    }

    return () => {
      cleanup?.()
      window.removeEventListener('pwa-install-request', handleRequest)
    }
  }, [])

  function dismiss() {
    snooze()
    setShow(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') permanentlyDismiss()
    setShow(false)
    setDeferredPrompt(null)
  }

  if (!show) return null

  if (isIOS) {
    return <IOSGuideModal onDismiss={dismiss} />
  }

  return (
    <div
      className="sm:hidden fixed left-3 right-3 z-40 rounded-2xl"
      style={{
        bottom: '76px',
        background: '#111110',
        border: '1px solid rgba(240,192,64,0.25)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
        padding: '1rem',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🐟</span>
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8', marginBottom: '0.25rem' }}>
              Add to your home screen
            </p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
              Play full-screen, no browser chrome
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={install}
            className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{ fontSize: '0.62rem', color: '#f0c040', background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 8, padding: '0.4rem 0.85rem', cursor: 'pointer' }}
          >
            Install
          </button>
          <button
            onClick={dismiss}
            style={{ background: 'none', border: 'none', color: '#4a4845', cursor: 'pointer', padding: '0.15rem', lineHeight: 1 }}
            aria-label="Not now"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
