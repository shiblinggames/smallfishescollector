'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (localStorage.getItem('pwa-prompt-dismissed')) return

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    if (standalone) return

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    setIsIOS(ios)

    if (ios) {
      const timer = setTimeout(() => setShow(true), 4000)
      return () => clearTimeout(timer)
    }

    function handlePrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  function dismiss() {
    localStorage.setItem('pwa-prompt-dismissed', '1')
    setShow(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') localStorage.setItem('pwa-prompt-dismissed', '1')
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
        border: '1px solid rgba(240,192,64,0.2)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        padding: '0.875rem 1rem',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 1 }}>🐟</span>
          <div>
            <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f0ede8', marginBottom: '0.2rem' }}>
              Add to your home screen
            </p>
            {isIOS ? (
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764', lineHeight: 1.5 }}>
                Tap{' '}
                <span style={{ color: '#a0a09a' }}>
                  Share{' '}
                  <svg style={{ display: 'inline', verticalAlign: 'middle', marginTop: -2 }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                </span>
                {' '}then{' '}
                <span style={{ color: '#a0a09a' }}>Add to Home Screen</span>
              </p>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
                Play full-screen, no browser chrome
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isIOS && (
            <button
              onClick={install}
              className="font-karla font-600 uppercase tracking-[0.1em]"
              style={{ fontSize: '0.62rem', color: '#f0c040', background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.25)', borderRadius: 8, padding: '0.35rem 0.7rem', cursor: 'pointer' }}
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            style={{ background: 'none', border: 'none', color: '#4a4845', cursor: 'pointer', padding: '0.25rem', lineHeight: 1 }}
            aria-label="Dismiss"
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
