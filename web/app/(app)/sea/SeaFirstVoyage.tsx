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
// ── THE × DISMISSES A CARD, NOT THE VOYAGE ──────────────────────────────────
//
// It used to end the whole thing and write the flag, which is an enormous and
// irreversible consequence for a button that looks like "hide this tip". The
// captain who reported it had read Kat's line about heading south, closed the
// card, and watched the lights on the water go out with it — the one piece of
// help they still needed, taken away by the gesture that means "I have read
// this".
//
// So it hides the card for the beat it was on and nothing else. The guiding
// path stays, the camera stays, and the next beat brings Doby back. What it
// DOES release is the cast hold: being blocked from fishing by a tour you have
// just dismissed is the one combination with no way out of it.
//
// Nothing here is a cage. The tour blocks exactly one thing, for three beats,
// and says why — so there is no need for an escape hatch that costs a captain
// the help they were reading.

import { useCallback, useEffect, useRef, useState } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { FIRST_VOYAGE, SEA_ACCENT } from '@/lib/seaOnboarding'
import { PLACES, TOUR_SPOT, berthOf } from './chart'
import { getSeaTourStep, markSeaTourSeen, setSeaTourStep } from './tourActions'

/**
 * WHERE A BEAT IS POINTING.
 *
 * Two of these are deliberately NOT the place's own coordinates:
 *
 *   THE SHALLOWS is a ring 1400 to 3800 out, and its x/y is the midpoint of
 *   that ring — a number the compass uses, not a place. Pointing a new captain
 *   at it is two thousand pixels of open water to arrive at nothing. TOUR_SPOT
 *   is somewhere, just inside the band and due south of where they start.
 *
 *   AN ISLAND'S x/y IS ITS MIDDLE, which is land. You cannot sail to the
 *   middle of the Mainland; the path has to end at the BERTH, which is the
 *   only part of it a boat can occupy, and is where the ashore prompt comes up.
 */
function destination(id: string): { x: number; y: number; r: number } | null {
  if (id === 'shallows') return TOUR_SPOT
  const place = PLACES.find(p => p.id === id)
  if (!place) return null
  if (place.kind === 'port') {
    const b = berthOf(place)
    return { x: b.x, y: b.y, r: b.r }
  }
  return { x: place.x, y: place.y, r: place.r }
}

export default function SeaFirstVoyage({
  hasSeen, startAt, fishing, caught, nearId, ashore, blocked, cam, goal,
  holdCast, fishOnly, stowRod, at,
}: {
  hasSeen: boolean
  /** Where the tour got to. It leaves the chart to sell a fish at the market,
   *  so it has to be able to come back to the beat it was on. */
  startAt: number
  /** Whether the rod is currently out. Advances the `cast` beat. */
  fishing: boolean
  /**
   * WHY SHE CANNOT CAST, if she cannot.
   *
   * The cast beat has no Next on purpose — the button IS the thing they were
   * asked to do — which means it deadlocks outright if the button is disabled.
   * That is not hypothetical: a new account had no bait at all until the signup
   * grant, and casting is gated on having some. A tour that can be stopped by
   * an empty bait box has to be able to SAY so, rather than sitting there
   * repeating an instruction the game will not accept.
   */
  blocked: 'bait' | 'hold' | null
  /** Rises by one every time a fish is landed, and never falls. Deliberately
   *  NOT the hold count: that is clamped to the hold's capacity, so a full hold
   *  catches a fish without the number moving, and it drops when you sell. */
  caught: number
  /** Where she is tied up, if anywhere. Advances the `moor` beat. */
  nearId: string | null
  /** Whether the island's door chooser is open. Advances the `ashore` beat. */
  ashore: boolean
  /** The chart's camera override. Written while showing an island, cleared
   *  when the tour is done with it. */
  cam: { current: { x: number; y: number } | null }
  /** And where it is sending her, for the guiding path on the water. The
   *  radius draws a ring there: somewhere to sail INTO, rather than a heading
   *  to hold and no way of knowing when you have held it long enough. */
  goal: { current: { x: number; y: number; r: number } | null }
  /** Raised while the only thing the helm should offer is the water. A trader
   *  drifting past during the cast beat otherwise turns the one button the
   *  captain has been told to press into a conversation. */
  fishOnly: { current: boolean }
  /** Raised while the tour wants the rod stowed. The chart refuses to cast
   *  while it is up, and says why rather than going quiet. */
  holdCast: { current: boolean }
  /** Where she is, live. Read to tell when a `reach` beat has been answered. */
  at: { current: { x: number; y: number } }
  /** Bring the rod in. Called once when the first fish is landed: the tour has
   *  somewhere to be, and leaving the captain in the fishing overlay is leaving
   *  them where the next instruction is not. */
  stowRod: () => void
}) {
  const [step, setStep] = useState(hasSeen ? FIRST_VOYAGE.length : startAt)
  const beat = FIRST_VOYAGE[step]
  const done = step >= FIRST_VOYAGE.length

  // ── AND NEVER BACKWARDS ───────────────────────────────────────────────────
  //
  // `startAt` comes from the server render, which can be a CACHED payload: the
  // market advances the step and the captain returns with Back, onto a copy of
  // the chart made before any of that happened. The symptom is a tour that
  // rewinds — sell the catch, sail out, and be asked to go and fish again.
  //
  // revalidatePath on every write is the fix; this is the belt to its braces,
  // because a resume point that can travel backwards will strand somebody in a
  // loop and they will not know it is a loop. Asked for once, and only while a
  // voyage is actually running.
  useEffect(() => {
    if (hasSeen) return
    let dead = false
    void getSeaTourStep().then(live => {
      if (dead) return
      setStep(now => (live > now ? live : now))
    }).catch(() => {})
    return () => { dead = true }
  }, [hasSeen])

  /** The beat whose card has been waved away. Cleared by moving on, so the
   *  next one arrives normally. */
  const [hidden, setHidden] = useState(-1)

  // Written once, when the voyage is actually FINISHED. A guard rather than a
  // check, because the action is a round trip and completion can be reached
  // from more than one beat.
  const wrote = useRef(false)

  const next = useCallback(() => {
    setStep(n => {
      const to = n + 1
      if (to >= FIRST_VOYAGE.length) {
        if (!wrote.current) { wrote.current = true; void markSeaTourSeen() }
      } else {
        // Written on every advance, because the very next beat may be the one
        // that sends them off the chart. Fire and forget: the worst a lost
        // write costs is one beat repeated, and blocking the tour on a round
        // trip would cost every captain a stutter to prevent it.
        void setSeaTourStep(to)
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

  // ── AND THE THING ITSELF, LIT UP ──────────────────────────────────────────
  //
  // Found by DOM lookup, because the target is in a sibling component — the
  // Market card lives in the ashore chooser and this has no reference to it.
  // Retried for a moment: a beat that highlights the Market card comes up in
  // the same breath as the chooser it is inside, and the first query can easily
  // run before the modal has mounted.
  useEffect(() => {
    const want = beat?.target
    const clear = () => document.querySelectorAll('.coach-flash')
      .forEach(el => el.classList.remove('coach-flash', 'coach-flash-gold'))
    clear()
    if (!want) return
    let tries = 0
    const find = () => {
      const el = document.querySelector(`[data-coach="${want}"]`)
      if (el) { el.classList.add('coach-flash', 'coach-flash-gold'); return }
      if (++tries < 20) window.setTimeout(find, 120)
    }
    find()
    return clear
  }, [beat])

  // ── THE WAY THERE ─────────────────────────────────────────────────────────
  //
  // Same shape as the camera: set while a beat wants it, given back the moment
  // it does not, so a path never outlives the instruction that drew it.
  useEffect(() => {
    if (!beat?.path) { goal.current = null; return }
    goal.current = destination(beat.path)
    return () => { goal.current = null }
  }, [beat, goal])

  // Sailed into the ring, for a beat that asked them to.
  const wantReach = beat?.until === 'reach'
  useEffect(() => {
    if (!wantReach || !beat?.path) return
    const to = destination(beat.path)
    if (!to) return
    // Checked on the same tick the proximity UI runs on rather than per frame:
    // arriving somewhere is not a sixty-times-a-second question.
    const id = window.setInterval(() => {
      if (Math.hypot(at.current.x - to.x, at.current.y - to.y) < to.r) next()
    }, 200)
    return () => window.clearInterval(id)
  }, [wantReach, beat, next, at])

  // ── THE BEATS THAT WAIT ───────────────────────────────────────────────────
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
    if (!wantCatch || caught <= mark.current) return
    // IN COMES THE ROD. She has what she was sent for, and the next thing to do
    // is somewhere else — a captain left staring at the water will cast again,
    // and the card telling them where to go is behind the fishing overlay.
    stowRod()
    next()
  }, [wantCatch, caught, next, stowRod])

  // The chart reads this every time somebody reaches for Cast.
  useEffect(() => {
    // Released when the card is waved away: blocked from fishing BY a tour you
    // have just dismissed, with nothing on screen saying so, is the one state
    // there is no way out of.
    holdCast.current = !!beat?.holdCast && step !== hidden
    return () => { holdCast.current = false }
  }, [beat, step, hidden, holdCast])

  // Only while the cast is actually being ASKED for. It ends the moment the
  // rod is out, so the sea is a normal sea again for the whole of the catch.
  useEffect(() => {
    fishOnly.current = beat?.until === 'cast' && step !== hidden
    return () => { fishOnly.current = false }
  }, [beat, step, hidden, fishOnly])

  // Tied up where the beat asked.
  const wantMoor = beat?.until === 'moor'
  useEffect(() => {
    if (wantMoor && beat?.at && nearId === beat.at) next()
  }, [wantMoor, beat, nearId, next])

  // And through the door.
  const wantAshore = beat?.until === 'ashore'
  useEffect(() => {
    if (wantAshore && ashore) next()
  }, [wantAshore, ashore, next])

  if (done || !beat || step === hidden) return null

  // A `look` beat holds while the camera flies and the captain reads; the two
  // waiting beats have no button at all, because the button IS the thing they
  // were asked to do.
  // Anything the captain has to DO has no button: the button is the thing they
  // were asked to do. `sold` is the extreme case — the market advances it from
  // another route entirely, and this card is what they carry through the door.
  const waiting = beat.until !== 'next' && beat.until !== 'look'

  // Said INSTEAD of the instruction, not after it: an instruction the game will
  // refuse is worse than no instruction, because the captain tries it and
  // concludes the game is broken rather than that they are missing something.
  const stuck = beat.until === 'cast' && blocked
  const text = stuck === 'bait'
    ? 'You are out of *bait*, Captain. Claim your free worms from the Daily Bonus in the Tavern, on the Mainland.'
    : stuck === 'hold'
      ? 'Your *hold* is full. Nothing else fits until you sell what is in it — the market on the Mainland pays best.'
      : beat.text

  return (
    <GuideCoach
      show
      portrait={beat.portrait}
      speaker={beat.speaker}
      text={text}
      accent={SEA_ACCENT}
      onClose={() => setHidden(step)}
      onNext={waiting ? undefined : next}
      nextLabel={step === FIRST_VOYAGE.length - 1 ? 'Aye' : undefined}
    />
  )
}
