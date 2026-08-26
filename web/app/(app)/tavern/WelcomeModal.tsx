'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StepTourModal, { type TourStep } from '@/components/StepTourModal'
import GuideScene from '@/components/GuideScene'
import { GUIDES } from '@/lib/onboardingScenes'
import type { SceneLine } from '@/lib/raidMap'
import { claimWelcomePack } from './welcomeActions'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// A short, warm welcome from the two guides — plain voice, no lore. Then (in a
// browser, not a PWA) the "add to home screen" step. Finishing grants the
// welcome pack + marks has_seen_welcome.
const WELCOME_SCENE: SceneLine[] = [
  { ...GUIDES.doby, text: "Welcome aboard, Captain! This is the Tavern, your home base." },
  { ...GUIDES.kat,  text: "The plan is simple: catch fish, sell them for coin, and build up a crew." },
  { ...GUIDES.doby, text: "We'll guide you as you go. Let's get you out on the water." },
]

export default function WelcomeModal() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean; chromeIOS: boolean } | null>(null)
  const [phase, setPhase] = useState<'scene' | 'install' | 'done'>('scene')

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

  function grantAndClose() {
    setPhase('done')
    startTransition(async () => {
      await claimWelcomePack()
      // STRAIGHT TO THE WATER. The scene above tells a new captain the plan is
      // to catch fish and sell them, then this used to close onto the Tavern:
      // the densest page in the game, and the one place that plan cannot be
      // acted on. "Let's Go" now goes somewhere. Awaited so the welcome pack is
      // in the hold before /fishing reads the profile, and safe to fire blind
      // because has_seen_welcome gates the whole modal -- it can never redirect
      // a returning captain who chose to land here.
      router.push('/sea')
    })
  }

  // Browser-only "install as an app" step (never in a PWA). Android/desktop
  // Chrome get the real native prompt; iOS gets the Share → Add to Home Screen
  // instructions in the body.
  const iosLine = env?.chromeIOS
    ? ' Tap the Share icon, then Add to Home Screen.'
    : env?.ios
      ? ' Tap Share in Safari, then Add to Home Screen.'
      : ' Find it in the menu under "Install the App".'
  const installStep: TourStep | null = env && !env.standalone ? {
    color: '#5ab4c8',
    title: 'Add to home screen',
    placement: 'center',
    body: `Plays full-screen, faster, feels like a real game.${iosLine}`,
    cta: deferred
      ? { label: 'Install App', onClick: () => { deferred.prompt(); deferred.userChoice.then(() => setDeferred(null)) } }
      : undefined,
  } : null

  if (phase === 'done') return null

  if (phase === 'scene') {
    return (
      <GuideScene
        title="Welcome"
        lines={WELCOME_SCENE}
        ctaLabel="Let's Go →"
        accent="#60a5fa"
        onDone={() => { if (installStep) setPhase('install'); else grantAndClose() }}
      />
    )
  }

  // phase === 'install'
  return <StepTourModal steps={installStep ? [installStep] : []} onDone={grantAndClose} />
}
