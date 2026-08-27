'use client'

// FIRST TIME ON THE WATER.
//
// ── WHY IT IS FIVE LINES AND NOT TWELVE ─────────────────────────────────────
//
// The chart replaces a whole screen, so there is a lot that is genuinely new:
// steering, casting without a zone menu, the fog chart, isles and bottles and
// buried things, the Shipyard, the Trawl Docks, the Homestead. Every one of
// those is worth a sentence. Twelve sentences at minute zero is not a tour, it
// is a manual, and the captain skips it and learns none of them.
//
// So it is split by WHEN the knowledge is usable:
//
//   HERE, on arrival — the five things you cannot use the chart at all without.
//   Steer, cast, the chart button, what is out there, and the fact that those
//   islands are places.
//
//   AT THE DOOR — the Shipyard, the Trawl Docks and the Homestead each get one
//   line the first time you MOOR there (see SeaLandfallHint). A captain reading
//   about the Trawl Docks while tied up at the Trawl Docks needs one sentence;
//   the same sentence at minute zero is about a building they have never seen,
//   half a chart away, and it does not survive the trip.
//
// Same kit as the fishing hub's tour: GuideCoach, one line per card, and the
// real thing flashed rather than described. Targets carry `data-coach`.

import { useState, useEffect, startTransition } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import { markSeaTourSeen } from './tourActions'

/** The chart's own temperature — colder than the fishing blue, which is a
 *  harbour colour. This is open water. */
export const SEA_ACCENT = '#7fd6c0'

type Target = 'chart' | 'crew' | null

const STEPS: { portrait: string; speaker: string; text: string; target: Target }[] = [
  {
    ...GUIDES.doby,
    // The steering line teaches the input the player actually has: a fine
    // pointer means a mouse, and a mouse usually means keys under the other
    // hand. Checked at module level once — nobody hot-swaps their pointer
    // mid-tour, and a hook for it would be ceremony.
    ...(typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
      ? { text: 'This is the whole sea, Captain. Drag to steer, or hold *WASD*, and she keeps going where you point her.' }
      : { text: 'This is the whole sea, Captain. Drag anywhere to steer, and she keeps going where you point her.' }),
    target: null,
  },
  {
    ...GUIDES.doby,
    text: 'Sail out into open water and the *Cast* button comes up. No menus. The fish are where you are.',
    target: null,
  },
  {
    ...GUIDES.kat,
    text: 'The *chart* remembers everywhere you have been and everything you have found.',
    target: 'chart',
  },
  {
    ...GUIDES.kat,
    text: 'There are isles with chests on them, bottles adrift, and things buried out there. Go and look.',
    target: null,
  },
  {
    ...GUIDES.doby,
    text: 'The islands round about are places you can moor: a shipyard, a dock for your crew, and your own. Pull up to one and see.',
    target: null,
  },
]

function clearFlashes() {
  document.querySelectorAll('.coach-flash').forEach(el => el.classList.remove('coach-flash'))
}

export default function SeaTour({ hasSeen }: { hasSeen: boolean }) {
  const [step, setStep] = useState<number | null>(hasSeen ? null : 0)

  useEffect(() => {
    clearFlashes()
    if (step == null) return
    const target = STEPS[step].target
    if (!target) return
    const el = document.querySelector(`[data-coach="${target}"]`)
    // No scrollIntoView, unlike the hub's tour: this page does not scroll, and
    // asking it to would fight the chart's own transform.
    if (el) el.classList.add('coach-flash')
    return clearFlashes
  }, [step])

  if (step == null) return null

  const finish = () => {
    clearFlashes()
    setStep(null)
    startTransition(() => { void markSeaTourSeen() })
  }
  const last = step >= STEPS.length - 1

  return (
    <GuideCoach
      show
      portrait={STEPS[step].portrait}
      speaker={STEPS[step].speaker}
      text={STEPS[step].text}
      accent={SEA_ACCENT}
      placement="bottom"
      // Clear of the helm on a phone, which sits at bottom 92 and is 2*HELM_R
      // tall. A tip under the thumb is a tip that gets dismissed by accident.
      offset="calc(env(safe-area-inset-bottom, 0px) + 210px)"
      z={80}
      onNext={() => { if (last) finish(); else setStep(s => (s ?? 0) + 1) }}
      nextLabel={last ? 'Take her out' : 'Next →'}
      onClose={finish}
    />
  )
}
