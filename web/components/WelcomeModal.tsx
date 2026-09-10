'use client'

import { useEffect, useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import StepTourModal, { type TourStep } from '@/components/StepTourModal'
import GuideScene from '@/components/GuideScene'
import { GUIDES } from '@/lib/onboardingScenes'
import type { SceneLine } from '@/lib/raidMap'
import { claimWelcomePack } from '@/app/actions/firstRun'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// A short, warm welcome from the two guides — plain voice, no lore. Then (in a
// browser, not a PWA) the "add to home screen" step. Finishing grants the
// welcome pack + marks has_seen_welcome.
const WELCOME_SCENE: SceneLine[] = [
  { ...GUIDES.doby, text: "Welcome aboard Captain! The sea is yours to sail!" },
  { ...GUIDES.kat,  text: "Hold on Doby, let's get them catching some fish first." },
  { ...GUIDES.doby, text: "Let's get'er done. We'll walk...I mean sail you through it." },
]

export default function WelcomeModal() {
  const [, startTransition] = useTransition()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [env, setEnv] = useState<{ standalone: boolean; ios: boolean; chromeIOS: boolean; mobile: boolean } | null>(null)
  const [phase, setPhase] = useState<'scene' | 'install' | 'done'>('scene')
  /** Going dark on the way out. See grantAndClose. */
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    const chromeIOS = ios && /CriOS/.test(navigator.userAgent)
    // ── IS THERE A HOME SCREEN TO ADD IT TO ────────────────────────────
    //
    // This step was gated on "not already installed", which every desktop
    // browser in the world also satisfies -- so a captain on a monitor was
    // offered "Add to home screen · plays full-screen, feels like a real game"
    // for a home screen they do not have.
    //
    // Not gated on the install prompt either: desktop Chrome fires
    // `beforeinstallprompt` perfectly happily, so that would have kept showing
    // it on exactly the machines it makes no sense on. The question is whether
    // this is a PHONE, so that is the question asked.
    //
    // An iPad on iPadOS 13+ reports itself as a Mac and is caught by the touch
    // points, which no real Mac reports more than one of.
    const ipad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1
    const mobile = ios || ipad || /Android|Mobile/.test(navigator.userAgent)
    setEnv({ standalone, ios: ios || ipad, chromeIOS, mobile })
    if (standalone) return
    function handlePrompt(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  function grantAndClose() {
    // FADE TO BLACK, THEN GO. The reload that follows is a cut either way;
    // this makes it a cut on purpose, and the chart on the far side opens from
    // the same black, so the welcome and the sea join up as one shot. The
    // scene stays mounted under the fade rather than vanishing first.
    setLeaving(true)
    startTransition(async () => {
      await Promise.all([claimWelcomePack(), new Promise(r => setTimeout(r, 560))])
      // STRAIGHT TO THE WATER, AND A REAL LOAD OF IT. The sea page shows a dark
      // field rather than a chart while a captain is still being set up, so
      // the chart has to be built now, from a profile that now has a name, a
      // colour and an avatar on it. A soft navigation to the route we are
      // already on may reuse what it has; a full load cannot. Awaited so the
      // welcome pack is on the row before the page reads it, and safe to fire
      // blind because has_seen_welcome gates the whole modal -- it can never
      // redirect a returning captain who chose to land elsewhere.
      window.location.assign('/sea')
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
  const installStep: TourStep | null = env && env.mobile && !env.standalone ? {
    color: '#5ab4c8',
    title: 'Add to home screen',
    placement: 'center',
    body: `Plays full-screen, faster, feels like a real game.${iosLine}`,
    cta: deferred
      ? { label: 'Install App', onClick: () => { deferred.prompt(); deferred.userChoice.then(() => setDeferred(null)) } }
      : undefined,
  } : null

  const curtain = leaving ? (
    <motion.div aria-hidden
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: 'easeIn' }}
      style={{ position: 'fixed', inset: 0, background: '#04090f', zIndex: 1400, pointerEvents: 'none' }} />
  ) : null

  if (phase === 'done') return curtain

  if (phase === 'scene') {
    return (
      <>
        <GuideScene
          title="Welcome"
          lines={WELCOME_SCENE}
          ctaLabel="Let's Go →"
          accent="#60a5fa"
          onDone={() => { if (installStep) setPhase('install'); else grantAndClose() }}
        />
        {curtain}
      </>
    )
  }

  // phase === 'install'
  return (
    <>
      <StepTourModal steps={installStep ? [installStep] : []} onDone={grantAndClose} />
      {curtain}
    </>
  )
}
