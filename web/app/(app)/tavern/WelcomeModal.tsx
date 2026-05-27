'use client'

import { useEffect, useState, useTransition } from 'react'
import StepTourModal, { type TourStep } from '@/components/StepTourModal'
import { claimWelcomePack } from './welcomeActions'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// One welcome step. Players figure out crew + voyages + dailies as they
// play; we don't need to pitch every system upfront. The install-as-app
// step is appended below ONLY when the platform supports it.
const BASE_STEPS: TourStep[] = [
  {
    color: '#60a5fa',
    title: 'Welcome aboard!',
    placement: 'center',
    body: "Cast a line, sell your catch, build a crew. Tap around to explore.",
  },
]

export default function WelcomeModal() {
  const [, startTransition] = useTransition()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean; chromeIOS: boolean } | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    const chromeIOS = ios && /CriOS/.test(navigator.userAgent)
    setEnv({ standalone, ios, chromeIOS })
    if (standalone) return
    function handlePrompt(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  function handleDone() {
    startTransition(async () => { await claimWelcomePack() })
  }

  const steps: TourStep[] = [...BASE_STEPS]
  // Browser-only: pitch installing as the final step. Never shown in a
  // PWA (env.standalone). Android/desktop Chrome get the real native
  // prompt via the captured beforeinstallprompt; iOS has no native
  // prompt, so the body carries the short Share → Add to Home Screen
  // instructions instead (the menu also keeps the full icon hint).
  if (env && !env.standalone) {
    const iosLine = env.chromeIOS
      ? ' Tap the Share icon, then Add to Home Screen.'
      : env.ios
        ? ' Tap Share in Safari, then Add to Home Screen.'
        : ' Find it in the menu under "Install the App".'
    steps.push({
      color: '#5ab4c8',
      title: 'Add to home screen',
      placement: 'center',
      body: `Plays full-screen, faster, feels like a real game.${iosLine}`,
      cta: deferred
        ? {
            label: 'Install App',
            onClick: () => {
              deferred.prompt()
              deferred.userChoice.then(() => setDeferred(null))
            },
          }
        : undefined,
    })
  }

  return <StepTourModal steps={steps} onDone={handleDone} />
}
