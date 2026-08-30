'use client'

// ONE LINE, THE FIRST TIME YOU TIE UP SOMEWHERE.
//
// The arrival tour teaches the five things you cannot sail without. This is the
// rest of it, delivered where it is usable: a captain moored at the Trawl Docks
// needs one sentence about trawls, and the same sentence at minute zero is
// about a building they have never seen, half a chart away.
//
// Fires on APPROACH rather than on entering the building, so it explains what
// the place is BEFORE the decision to go in — which is the question a new
// captain actually has when a strange island's name comes up on screen.
//
// Once each, latched on a profile column. Never repeats.

import { useEffect, useRef, useState, startTransition } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import { SEA_ACCENT } from '@/lib/seaOnboarding'
import { markSeaHintSeen } from './tourActions'

/** Keyed by the place id in chart.ts. Anywhere not listed simply has no hint,
 *  which is how the Mainland stays quiet — its buildings speak for themselves. */
const HINTS: Record<string, { portrait: string; speaker: string; text: string }> = {
  shipyard: {
    ...GUIDES.doby,
    text: 'The *Shipyard*. A better hull and a refit make her quicker and easier on the wheel, which is most of your day out here.',
  },
  trawl_docks: {
    ...GUIDES.kat,
    text: 'The *Trawl Docks*. Send crew out to fish a water on their own and collect the haul later. They work while you are away.',
  },
  home: {
    ...GUIDES.doby,
    text: 'Your *Homestead*. Build it up, furnish the inside, and put up a portal so you can come home from anywhere on the water.',
  },
}

export default function SeaLandfallHint({
  nearId, seen,
}: {
  /** The place currently within mooring range, or null. */
  nearId: string | null
  /** Port ids whose hint has already been shown. */
  seen: string[]
}) {
  const [showing, setShowing] = useState<string | null>(null)
  /** Grows as hints fire, so one does not repeat within a session before the
   *  server round-trip has landed. */
  const done = useRef(new Set(seen))

  useEffect(() => {
    if (!nearId) return
    if (!HINTS[nearId]) return
    if (done.current.has(nearId)) return
    done.current.add(nearId)
    setShowing(nearId)
    startTransition(() => { void markSeaHintSeen(nearId) })
  }, [nearId])

  // AND IT GOES WHEN YOU DO. Sailing off is an answer — the captain has decided
  // they are not interested — and a tip that outlives the thing it points at is
  // furniture.
  useEffect(() => {
    if (showing && nearId !== showing) setShowing(null)
  }, [nearId, showing])

  if (!showing) return null
  const hint = HINTS[showing]

  return (
    <GuideCoach
      show
      portrait={hint.portrait}
      speaker={hint.speaker}
      text={hint.text}
      accent={SEA_ACCENT}
      placement="top"
      // TOP, unlike the arrival tour. The bottom of this screen is where the
      // "Go ashore" button appears, and that button is the thing the hint is
      // asking you to consider.
      offset="calc(env(safe-area-inset-top, 0px) + 96px)"
      z={80}
      autoHideMs={9000}
      onClose={() => setShowing(null)}
    />
  )
}
