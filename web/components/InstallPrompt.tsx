'use client'

import { useEffect, useState } from 'react'

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
      <div className="flex items-start gap-3">
        <span style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 2, flexShrink: 0 }}>🐟</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8', marginBottom: '0.5rem' }}>
            Add to your home screen
          </p>
          {isIOS ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: '#f0c040' }}>1</span>
                </span>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#a0a09a', lineHeight: 1.45 }}>
                  Tap the{' '}
                  <span style={{ color: '#f0c040', fontWeight: 600 }}>Share</span>{' '}
                  <svg style={{ display: 'inline', verticalAlign: 'middle', marginBottom: 1 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>{' '}
                  button at the bottom of Safari
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: '#f0c040' }}>2</span>
                </span>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#a0a09a', lineHeight: 1.45 }}>
                  Tap <span style={{ color: '#f0c040', fontWeight: 600 }}>Add to Home Screen</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="font-karla" style={{ fontSize: '0.7rem', color: '#6a6764', lineHeight: 1.5 }}>
              Play full-screen, no browser chrome
            </p>
          )}

          <div className="flex items-center gap-2 mt-3">
            {!isIOS && (
              <button
                onClick={install}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{ fontSize: '0.62rem', color: '#f0c040', background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 8, padding: '0.4rem 0.85rem', cursor: 'pointer' }}
              >
                Install
              </button>
            )}
            <button
              onClick={dismiss}
              className="font-karla font-400"
              style={{ fontSize: '0.62rem', color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem 0.5rem' }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
