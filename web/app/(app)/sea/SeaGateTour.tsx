'use client'

// ── THE ARRIVAL IN THE ANCHORAGE ────────────────────────────────────────────
//
// Doby and Kat name the other half of the game, the first time a captain
// crosses the reef. The script and the reasoning about its order live in
// lib/seaOnboarding's GATE_TOUR — this is the thing that plays it.
//
// ── IT IS A SECOND TOUR, NOT A LONGER FIRST ONE ─────────────────────────────
//
// See GATE_TOUR's own note: none of this can be done at signup, so a captain
// who was told about it then would be reading ten screens about places they
// have no ship, no crew and no campaign for.
//
// ── WHY IT IS NOT SeaFirstVoyage WITH A PROP ────────────────────────────────
//
// That component is three hundred lines and most of them are the fishing
// instructions: it holds a beat until the rod is out, until a fish is in the
// hold, until the market says a sale happened on another route, and it can be
// deadlocked by an empty bait box, which it has to notice and say. None of that
// exists up here. This tour asks for nothing but a tap and a camera, so it is
// the small half of that component and none of the machinery.
//
// What the two DO share is the script type, the coach card and the camera
// contract, which are the parts that would actually be worth keeping in step.
//
// ── THE × HIDES A CARD, NOT THE TOUR ────────────────────────────────────────
//
// Same rule the first voyage learned the hard way: closing a card is "I have
// read this", and it must not cost a captain the rest of the help. The next
// beat brings the guide back.

import { useCallback, useEffect, useState } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { GATE_TOUR, SEA_ACCENT } from '@/lib/seaOnboarding'
import { PLACES } from './chart'
import { markGateTourSeen, setGateTourStep } from './tourActions'

export default function SeaGateTour({ hasSeen, startAt, inAnchorage, fighting, cam }: {
  hasSeen: boolean
  /** Where it got to. A captain can cross the reef, read three beats and shut
   *  the tab; the fourth is where they come back to. */
  startAt: number
  /** Whether the boat is actually in the anchorage. The whole tour is about
   *  this water, so it plays here and waits everywhere else. */
  inAnchorage: boolean
  /** The guns own the screen. A coach card over a broadside is the tour talking
   *  across the one thing that cannot be paused. */
  fighting: boolean
  /** Where the chart should be looking. Set on a `look` beat, given back the
   *  moment it is not — the same contract the first voyage uses, so a camera
   *  cannot outlive the instruction that moved it. */
  cam: React.MutableRefObject<{ x: number; y: number } | null>
}) {
  const [step, setStep] = useState(hasSeen ? GATE_TOUR.length : startAt)
  /** The one beat the × has hidden. Not the tour — see the note above. */
  const [hidden, setHidden] = useState(-1)
  const done = step >= GATE_TOUR.length
  const beat = done ? null : GATE_TOUR[step]

  const next = useCallback(() => {
    setStep(n => {
      const to = n + 1
      // Fire and forget on both. The worst a lost write costs is one beat
      // repeated; blocking a tap on a round trip costs every captain a stutter
      // to prevent it.
      if (to >= GATE_TOUR.length) void markGateTourSeen()
      else void setGateTourStep(to)
      return to
    })
  }, [])

  // ── THE CAMERA ────────────────────────────────────────────────────────────
  //
  // Given back on every exit — a different beat, a closed tour, an unmount —
  // so the chart returns to the hull on its own. A camera left pointed at an
  // island by a tour that is no longer running is a boat nobody can find.
  useEffect(() => {
    if (!beat || beat.until !== 'look' || !beat.at || !inAnchorage || fighting) {
      cam.current = null
      return
    }
    const place = PLACES.find(p => p.id === beat.at)
    cam.current = place ? { x: place.x, y: place.y } : null
    return () => { cam.current = null }
  }, [beat, inAnchorage, fighting, cam])

  // WAITS RATHER THAN PLAYS, anywhere but here. A captain who crosses the reef
  // and turns straight round should meet the same beat when they come back, not
  // find the tour has talked itself out over the fishing grounds.
  if (done || !beat || !inAnchorage || fighting || step === hidden) return null

  return (
    <GuideCoach
      show
      portrait={beat.portrait}
      speaker={beat.speaker}
      text={beat.text}
      accent={SEA_ACCENT}
      onClose={() => setHidden(step)}
      onNext={next}
      nextLabel={step === GATE_TOUR.length - 1 ? 'Aye' : undefined}
    />
  )
}
