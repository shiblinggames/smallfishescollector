'use client'

// First-time Expeditions walkthrough. Contextual coach-marks (Doby + Kat) that
// FLASH the real element each step describes — Manage Crew, Manage Ship, the
// Campaign card, the Voyages card — rather than a blocking briefing modal. The
// targets live in sibling components (ShipHero, HubCards) and carry a
// data-coach="..." attribute; this tour highlights them by DOM lookup + scrolls
// them into view. Plain, one line per step.

import { useState, useEffect, startTransition } from 'react'
import { markExpeditionsTourSeen } from './tourActions'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'

const EXP_ACCENT = '#f0c040'
type Target = 'crew' | 'ship' | 'campaign' | 'voyages' | null

const STEPS: { portrait: string; speaker: string; text: string; target: Target }[] = [
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "This is Expeditions. Send your crew out to earn loot and fight for glory.", target: null },
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Recruit and manage your *crew* here. You need them for everything.", target: 'crew' },
  { portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Upgrade your *ship* and equip gear here.", target: 'ship' },
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Fight the story *Campaign* — turn-based raids for powerful loot.", target: 'campaign' },
  { portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Send crew on *Voyages* — they earn in the background while you're away.", target: 'voyages' },
]

function clearFlashes() {
  document.querySelectorAll('.coach-flash').forEach(el => el.classList.remove('coach-flash', 'coach-flash-gold'))
}

export default function ExpeditionsTour({ hasSeen }: { hasSeen: boolean }) {
  const [step, setStep] = useState<number | null>(hasSeen ? null : 0)

  // Flash + scroll to the current step's target (DOM lookup — the targets live
  // in sibling components). Re-runs each step; always cleans up.
  useEffect(() => {
    clearFlashes()
    if (step == null) return
    const target = STEPS[step].target
    if (!target) return
    const el = document.querySelector(`[data-coach="${target}"]`)
    if (el) {
      el.classList.add('coach-flash', 'coach-flash-gold')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return clearFlashes
  }, [step])

  if (step == null) return null

  const finish = () => {
    clearFlashes()
    setStep(null)
    startTransition(() => { void markExpeditionsTourSeen() })
  }
  const last = step >= STEPS.length - 1

  return (
    <GuideCoach
      show
      portrait={STEPS[step].portrait}
      speaker={STEPS[step].speaker}
      text={STEPS[step].text}
      accent={EXP_ACCENT}
      placement="bottom"
      offset="calc(env(safe-area-inset-bottom, 0px) + 90px)"
      onNext={() => { if (last) finish(); else setStep(s => (s ?? 0) + 1) }}
      nextLabel={last ? 'Got it' : 'Next →'}
      onClose={finish}
    />
  )
}
