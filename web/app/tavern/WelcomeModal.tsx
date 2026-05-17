'use client'

import { useEffect, useState, useTransition } from 'react'
import StepTourModal, { type TourStep } from '@/components/StepTourModal'
import { claimWelcomePack } from './welcomeActions'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const BASE_STEPS: TourStep[] = [
  {
    color: '#60a5fa',
    title: 'Welcome to Small Fishes',
    placement: 'center',
    body: "Start by heading to the fishing dock. Cast your line, catch fish, sell them for doubloons. That's the core loop — everything else opens up from there.",
  },
  {
    color: '#c8a870',
    title: 'Recruit Crew & Set Sail',
    placement: 'top',
    body: "Spend Crew Notices (the scroll icon) to recruit fish cards. Once you have a crew and a Sloop, you can send them on voyages — they run in the background and come back with doubloons, rare gear, and more.",
  },
  {
    color: '#f0c040',
    title: 'Come Back Daily',
    placement: 'center',
    body: "Claim free doubloons and bait from the Daily Bonus. New bounty fish appear every week — catch them for extra rewards. Now go fish.",
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
      ? ' On iPhone, tap the Share icon (top right), then View More → Add to Home Screen.'
      : env.ios
        ? ' On iPhone, tap the Share icon in Safari, then Add to Home Screen.'
        : ' Find it any time in the menu under “Install the App”.'
    steps.push({
      color: '#5ab4c8',
      title: 'Play It Like a Real App',
      placement: 'center',
      body: `Add Small Fishes to your home screen for full-screen, faster play — no browser bar in the way, and it launches like a real game.${iosLine}`,
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
