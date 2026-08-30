'use client'

// ── THE FIRST VOYAGE ────────────────────────────────────────────────────────
//
// Doby and Kat take a brand-new captain from the dock to their first fish, and
// then fly the camera round the chart to name every island on it. The script,
// and the reasoning about its order, live in lib/seaOnboarding — this is the
// thing that plays it.
//
// ── IT WAITS FOR THE CAPTAIN, NOT A TIMER ───────────────────────────────────
//
// The beats that give an instruction do not advance until the instruction has
// been followed: `cast` holds until the rod is out, `catch` holds until a fish
// is in the hold. A tour that walks itself past the one thing it asked for is a
// tour that taught nothing, and the captain arrives at the end having read
// everything and learned none of it.
//
// There is no Next button on those two. A Next on "go and cast" is an invitation
// to skip the game.
//
// ── AND IT CAN BE LEFT ──────────────────────────────────────────────────────
//
// The × closes the whole thing for good. Somebody replaying, or somebody who
// simply does not want to be walked around, should not have to sit through it,
// and the flag is written the moment they say so rather than at the end — a
// tour you can escape but which comes back tomorrow is worse than one you
// cannot escape at all.

import { useCallback, useEffect, useRef, useState } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { FIRST_VOYAGE, SEA_ACCENT } from '@/lib/seaOnboarding'
import { PLACES } from './chart'
import { markSeaTourSeen } from './tourActions'

export default function SeaFirstVoyage({
  hasSeen, fishing, caught, cam,
}: {
  hasSeen: boolean
  /** Whether the rod is currently out. Advances the `cast` beat. */
  fishing: boolean
  /** Rises when anything is landed. Advances the `catch` beat. */
  caught: number
  /** The chart's camera override. Written while showing an island, cleared
   *  when the tour is done with it. */
  cam: { current: { x: number; y: number } | null }
}) {
  const [step, setStep] = useState(hasSeen ? FIRST_VOYAGE.length : 0)
  const beat = FIRST_VOYAGE[step]
  const done = step >= FIRST_VOYAGE.length

  // Written once, the moment the tour ends by ANY route — finished, skipped or
  // unmounted mid-way. A guard rather than a check, because the action is a
  // round trip and the component can end more than one way.
  const wrote = useRef(false)
  const finish = useCallback(() => {
    setStep(FIRST_VOYAGE.length)
    if (wrote.current) return
    wrote.current = true
    void markSeaTourSeen()
  }, [])

  const next = useCallback(() => {
    setStep(n => {
      const to = n + 1
      if (to >= FIRST_VOYAGE.length) {
        if (!wrote.current) { wrote.current = true; void markSeaTourSeen() }
      }
      return to
    })
  }, [])

  // ── THE CAMERA ────────────────────────────────────────────────────────────
  //
  // Set while a `look` beat is up and given back the moment it is not, so the
  // chart returns to the hull on its own if the captain closes the tour, tabs
  // away, or the component goes for any other reason. A camera left pointed at
  // an island by a tour that is no longer running is a boat nobody can find.
  useEffect(() => {
    if (!beat || beat.until !== 'look' || !beat.at) { cam.current = null; return }
    const place = PLACES.find(p => p.id === beat.at)
    cam.current = place ? { x: place.x, y: place.y } : null
    return () => { cam.current = null }
  }, [beat, cam])

  // ── THE TWO BEATS THAT WAIT ───────────────────────────────────────────────
  const wantCast = beat?.until === 'cast'
  useEffect(() => {
    if (wantCast && fishing) next()
  }, [wantCast, fishing, next])

  // Latched against the count as it was when the beat came up, so a fish landed
  // before the tour got here does not skip the beat that explains the dial.
  const mark = useRef(caught)
  const wantCatch = beat?.until === 'catch'
  useEffect(() => { if (!wantCatch) mark.current = caught }, [wantCatch, caught])
  useEffect(() => {
    if (wantCatch && caught > mark.current) next()
  }, [wantCatch, caught, next])

  if (done || !beat) return null

  // A `look` beat holds while the camera flies and the captain reads; the two
  // waiting beats have no button at all, because the button IS the thing they
  // were asked to do.
  const waiting = beat.until === 'cast' || beat.until === 'catch'

  return (
    <GuideCoach
      show
      portrait={beat.portrait}
      speaker={beat.speaker}
      text={beat.text}
      accent={SEA_ACCENT}
      onClose={finish}
      onNext={waiting ? undefined : next}
      nextLabel={step === FIRST_VOYAGE.length - 1 ? 'Aye' : undefined}
    />
  )
}
