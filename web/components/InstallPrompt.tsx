'use client'

import { useEffect, useState } from 'react'
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
  { src: '/PWA1.png', label: 'Tap ···' },
  { src: '/PWA2.png', label: 'Tap Share' },
  { src: '/PWA3.png', label: 'View More' },
  { src: '/PWA4.png', label: 'Add to Home' },
  { src: '/PWA5.png', label: 'Tap Add' },
]

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
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🐟</span>
          <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>
            Add to your home screen
          </p>
        </div>
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', color: '#4a4845', cursor: 'pointer', padding: '0.15rem', lineHeight: 1, flexShrink: 0 }}
          aria-label="Not now"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {isIOS ? (
        <>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {IOS_STEPS.map(({ src, label }, i) => (
              <div key={i} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', top: 4, left: 4, zIndex: 1,
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(240,192,64,0.95)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="font-karla font-700" style={{ fontSize: '0.48rem', color: '#000' }}>{i + 1}</span>
                  </span>
                  <Image
                    src={src}
                    alt={label}
                    width={55}
                    height={119}
                    style={{
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
                <p className="font-karla font-600" style={{ fontSize: '0.5rem', color: '#a0a09a', textAlign: 'center', maxWidth: 55, lineHeight: 1.2 }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={dismiss}
            className="font-karla font-400 mt-3"
            style={{ fontSize: '0.62rem', color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Not now
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={install}
            className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{ fontSize: '0.62rem', color: '#f0c040', background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 8, padding: '0.4rem 0.85rem', cursor: 'pointer' }}
          >
            Install
          </button>
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#6a6764' }}>
            Play full-screen, no browser chrome
          </p>
        </div>
      )}
    </div>
  )
}
