'use client'

// ONE LINE, THE FIRST TIME YOU TIE UP SOMEWHERE.
//
// The arrival tour teaches the things you cannot sail without. This is the rest
// of it, delivered where it is usable: a captain moored at the Trawl Docks
// needs one sentence about trawls, and the same sentence at minute zero is
// about a building they have never seen, half a chart away.
//
// ── AND THE TOURS CAME BACK TO THIS ─────────────────────────────────────────
//
// The rule above is the oldest one here and both tours had drifted a long way
// off it: the first voyage grew to twenty-four beats, ten of which named four
// islands and four HUD discs that a captain on their first minute has no reason
// to press, and the anchorage tour opened at sixteen doing the same thing for
// seven more islands. They are ten and five now, and every island cut out of
// them is a row in this table instead. See lib/seaOnboarding.
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
  // ── THE ANCHORAGE'S SEVEN ─────────────────────────────────────────────
  //
  // All of these were `look` beats in the gate tour, flown past in a row before
  // the captain had a warship to use any of them with. A captain who has just
  // tied up at the Crew Hall has exactly one question, and this is the answer
  // to it.
  //
  // The Gunwharf is NOT here: it is the one island the gate tour still names,
  // because nothing else up there works until the warship is out.
  crew_hall: {
    ...GUIDES.kat,
    text: 'The *Crew Hall*. Sign hands on, drill them, and bunk them to train. Nothing out here sails empty.',
  },
  charterhouse: {
    ...GUIDES.kat,
    text: 'The *Charterhouse* posts voyages. Your crew sail those without you and come back paid, whether you are aboard or ashore.',
  },
  posting_house: {
    ...GUIDES.kat,
    text: 'The *Posting House*. The day’s hunts, posted every morning and paid in gems.',
  },
  forge_isle: {
    ...GUIDES.doby,
    text: 'The *Forge*. Two relics in, one out, carrying both sets of effects. It opens once you have won it out of the Locker.',
  },
  trawl_fleet: {
    ...GUIDES.kat,
    text: 'The *Trawl Harbour*. Send a crew out to fish a water on their own, and come back for them when the haul is in.',
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
