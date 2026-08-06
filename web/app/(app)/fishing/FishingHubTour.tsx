'use client'

// First-time Fishing hub walkthrough. Same shape as ExpeditionsTour: Doby and
// Kat, one line per card, flashing the real tile each step describes rather
// than a blocking briefing modal. Targets carry data-coach and are found by DOM
// lookup, which is why HubTile takes a coachId.
//
// This runs BEFORE the existing fishing intro (FISHING_INTRO_SCENE, gated on
// has_seen_fishing_tour). That one teaches the dial and only makes sense once
// you are on the water; this one is the map of the building you are standing
// in. Landing on the hub first, then the zone, then the dial, they arrive in
// the order a player meets them.

import { useState, useEffect, startTransition } from 'react'
import { markFishingHubTourSeen } from './hubTourActions'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES, FISHING_ACCENT } from '@/lib/onboardingScenes'

type Target = 'fishing' | 'market' | 'tackle' | 'almanac' | null

const STEPS: { portrait: string; speaker: string; text: string; target: Target }[] = [
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "This is the harbour. Everything you need for fishing is on this page.", target: null },
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "*Fishing* is the water itself. Pick a spot and cast. Deeper water pays better and fights harder.", target: 'fishing' },
  { portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Your hold fills fast. Sell the catch at the *Market*, and watch the prices, they move.", target: 'market' },
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Rods, reels, line and bait come from the *Tackle Shop*. Better kit, better bites.", target: 'tackle' },
  { portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "The *Almanac* keeps every fish you have ever landed. Goldens, giants and pets too.", target: 'almanac' },
]

function clearFlashes() {
  document.querySelectorAll('.coach-flash').forEach(el => el.classList.remove('coach-flash'))
}

export default function FishingHubTour({ hasSeen }: { hasSeen: boolean }) {
  const [step, setStep] = useState<number | null>(hasSeen ? null : 0)

  useEffect(() => {
    clearFlashes()
    if (step == null) return
    const target = STEPS[step].target
    if (!target) return
    const el = document.querySelector(`[data-coach="${target}"]`)
    if (el) {
      // No -gold variant: .coach-flash defaults to fishing blue already.
      el.classList.add('coach-flash')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return clearFlashes
  }, [step])

  if (step == null) return null

  const finish = () => {
    clearFlashes()
    setStep(null)
    startTransition(() => { void markFishingHubTourSeen() })
  }
  const last = step >= STEPS.length - 1

  return (
    <GuideCoach
      show
      portrait={STEPS[step].portrait}
      speaker={STEPS[step].speaker}
      text={STEPS[step].text}
      accent={FISHING_ACCENT}
      placement="bottom"
      offset="calc(env(safe-area-inset-bottom, 0px) + 90px)"
      onNext={() => { if (last) finish(); else setStep(s => (s ?? 0) + 1) }}
      nextLabel={last ? 'Got it' : 'Next →'}
      onClose={finish}
    />
  )
}
