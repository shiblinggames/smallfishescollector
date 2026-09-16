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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { GATE_TOUR, GATE_FORCED_THROUGH, SEA_ACCENT } from '@/lib/seaOnboarding'
import { NORTH_WALL, PLACES, SEA_GATE, SEA_GATE_HALF } from './chart'

/** Where the anchorage tour may begin: eleven hundred pixels north of the reef
 *  line, seven hundred clear of its northernmost rock, and still eighteen
 *  hundred short of the island row, so the first card lands on open water. */
const GATE_TOUR_Y = NORTH_WALL - 1100

/** How close counts as "at the Sea Gate" for the beat that names it. Wide,
 *  because it is a ring of light a captain sails TOWARDS: the line should
 *  arrive while it is filling the screen, not at the moment of crossing. */
const GATE_HAIL = 1100
import { markGateTourSeen, setGateTourStep } from './tourActions'

export default function SeaGateTour({
  hasSeen, startAt, inAnchorage, fighting, cam, goal, crewOpen, crewSection, recruits,
  hasCaptain, hands, pastGate, campaignOpen, nextAt, nearId, at, onBeat, onDone,
}: {
  hasSeen: boolean
  /** The crew panel: open or not, and which of its rooms is showing. The
   *  crew beats wait on these. */
  crewOpen: boolean
  crewSection: string | null
  /** Rises by one every time a hand is signed on, and never falls. */
  recruits: number
  /** How many hands are on the roster right now. The recruit beat takes this
   *  as an answer too — see the note there. */
  hands: number
  /** Where she is tied up, if anywhere. Reveals a `showWhen.moor` beat. */
  nearId: string | null
  /** Where she is, live. Reveals a `showWhen.near` beat, and answers `reach`. */
  at: { current: { x: number; y: number } }
  /** Somebody is seated in the raid party. Advances the `assigned` beat, and
   *  is what the Sea Gate itself checks. */
  hasCaptain: boolean
  /** Out through the Sea Gate, on the campaign's water. */
  pastGate: boolean
  /** The campaign sheet is open. The last beat ends on it — see `campaign`. */
  campaignOpen: boolean
  /** What the campaign wants next, and where. Drives the `route` line and the
   *  `reach` wait. Null when there is nothing open. */
  nextAt: { x: number; y: number; r: number } | null
  /** The chart's guiding path. Written while a `route` beat is up and given
   *  back the moment it is not -- the same contract the camera takes. */
  goal: React.MutableRefObject<{ x: number; y: number; r: number } | null>
  /** Which beat is up, and when it is over -- for the lock. Same contract as
   *  the first voyage. */
  onBeat?: (b: { until: string; at?: string; target?: string; lock: boolean; route?: boolean; pointing?: boolean } | null) => void
  onDone?: () => void
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
  /**
   * WHETHER THE CONTROL THIS BEAT NAMES IS IN THE DOCUMENT. Written by the
   * flashing effect further down, read by the beat published outward (a lock
   * that switches every control off while pointing at one that is not there is
   * a captain with nothing to press) and by the waypoint at the bottom.
   */
  const [found, setFound] = useState(true)
  /** What is lit RIGHT NOW. The beat's own target normally; the way back when
   *  that target has gone (see `waypoint`). Held in a ref because the flashing
   *  effect is keyed on the beat and must not tear down and rebuild its poll
   *  every time the answer flickers. */
  const litRef = useRef<string | undefined>(undefined)
  const done = step >= GATE_TOUR.length
  const beat = done ? null : GATE_TOUR[step]

  /**
   * ── THE WAY BACK ────────────────────────────────────────────────────────
   *
   * Every beat of the crew half is about a control INSIDE the crew panel, and
   * a captain can leave that panel at any moment: the × on it, the back
   * gesture, a tap on the scrim. Leave it and the instruction on screen names
   * something that is not on screen, which is the point at which a guided
   * sequence stops guiding — and with the wheel held, the control that would
   * let them back in is switched off with everything else.
   *
   * So when the beat's own target is missing, the card says the one thing that
   * gets them back to it and points at a control that is always there in that
   * state. Two states, two answers:
   *
   *   the panel is shut       -> the crew disc on the HUD
   *   the panel is in a room  -> the back button at the top of it
   *
   * At the four doors with a door missing there is no third answer, so the
   * card keeps its own words and the lock is dropped instead (see `pointing`
   * below), which hands the screen back rather than leaving them holding a
   * dead one.
   *
   * NOT FOR THE LAST BEAT. `crewClosed` is waiting for the panel to GO, so its
   * target disappearing is the thing it wants rather than a captain adrift.
   */
  const waypoint = beat && beat.overPanel && !found && beat.until !== 'crewClosed'
    ? (!crewOpen
        ? { target: 'hud-crew', text: 'Open the *Crew* menu to carry on.' }
        : crewSection !== null
          ? { target: 'crew-back', text: 'Head back to the crew menu.' }
          : null)
    : null
  /** Is there anything on screen for the captain to press? The beat's own
   *  control, or the way back to it. When there is not, the chart lets go of
   *  the wheel rather than leaving every control dimmed around a card that
   *  names one of them. */
  const pointing = found || !!waypoint
  // The flashing effect reads this, so the ring lands on whatever the card is
  // actually anchored to — the way back, when the target has gone.
  litRef.current = waypoint?.target ?? beat?.target

  // Told outward, for the lock. Only while the tour is actually running here:
  // south of the reef it waits, and a waiting tour holds nothing. And only
  // through the forced half -- past that it is asking the captain to sail
  // somewhere, which a lock would make impossible. See GATE_FORCED_THROUGH.
  // ── NOT IN THE DOORWAY ───────────────────────────────────────────────
  // `inAnchorage` flips the moment the hull is 250px past the reef line,
  // still between the headland stacks with the whole harbour ahead. Starting
  // there put the first card, and the road it draws, over the boulders beside
  // the mouth. The tour waits until the boat is well clear of the reef and
  // stays started from then on, so sailing back to the mouth does not restart
  // it (the inAnchorage test below still pauses it south of the reef).
  const [deep, setDeep] = useState(false)
  useEffect(() => {
    if (deep || done) return
    const check = () => { if (inAnchorage && at.current.y < GATE_TOUR_Y) setDeep(true) }
    check()
    const id = window.setInterval(check, 300)
    return () => window.clearInterval(id)
  }, [deep, done, inAnchorage, at])
  const live = !done && !!beat && inAnchorage && deep && !fighting
  useEffect(() => {
    onBeat?.(live && beat
      // `route` goes out too: the chart draws the chevrons for it, the same
      // run it lays down when a clear opens something new. See NextHeading.
      //
      // AND `pointing`, which is the chart's cue to let go of the wheel: a
      // lock that switches off every control while naming one that is not
      // there is a captain with nothing to press. See the note above.
      ? { until: beat.until, at: beat.at, target: beat.target, lock: step <= GATE_FORCED_THROUGH, route: beat.route, pointing }
      : null)
  }, [live, beat, step, onBeat, pointing])

  /**
   * ── THE BEATS THAT WAIT TO BE ARRIVED AT ─────────────────────────────────
   *
   * A `showWhen` beat is current but silent until the captain is at the thing
   * it is about. `shown` is the highest step that has been revealed, and it
   * only ever climbs: once a card is up it STAYS up through sailing off
   * again, because a card that vanishes because you moved is a card you have
   * to go back for. Answered with Next, like any other.
   */
  const [shown, setShown] = useState(-1)
  const gated = !!beat?.showWhen && step > shown
  useEffect(() => {
    if (!gated || !beat?.showWhen) return
    const w = beat.showWhen
    const check = () => {
      if (w.moor && nearId === w.moor) { setShown(step); return }
      if (w.near === 'sea_gate') {
        const d = Math.hypot(at.current.x - SEA_GATE.x, at.current.y - SEA_GATE.y)
        if (d < GATE_HAIL) setShown(step)
      }
      if (w.pastGate && pastGate) setShown(step)
    }
    check()
    // The position is a ref the frame loop writes; arriving somewhere is not a
    // sixty-times-a-second question, so it is asked on the same slow tick the
    // rest of the proximity UI uses.
    const id = window.setInterval(check, 300)
    return () => window.clearInterval(id)
  }, [gated, beat, step, nearId, at, pastGate])

  // ── THE WAY THERE ─────────────────────────────────────────────────────
  //
  // Set while a `route` beat is showing, given back the moment it is not, so a
  // path never outlives the instruction that drew it. THE CLEANUP IS WHAT GIVES
  // IT BACK, and that is the whole of why this returns early instead of writing
  // null on the way past.
  //
  // `tourGoal` is SHARED with the first voyage, and this component is mounted
  // the entire time that one is running -- both live under `arrived`, because
  // neither may speak over the chart's arrival. A `goal.current = null` in the
  // "not my turn" branch therefore reached across and put out the light the
  // fishing tour had just lit: the road south to the Shallows, and the ring
  // around the water it asks you to cast in. It did not even need a race to do
  // it, because `nextAt` is rebuilt every render up in SeaMap, so this effect
  // re-ran and re-nulled on every single one.
  //
  // React's own cleanup already does this correctly: the previous run's
  // teardown fires before the next body, so the frame this stops being a
  // routing beat is the frame the path goes out. Nothing has to be nulled by
  // hand, and nothing that belongs to the other tour gets touched.
  //
  // TWO KINDS OF BEAT LIGHT ONE: `route` points at whatever the campaign wants
  // next, and `path` points at a named place — today only the Sea Gate, which
  // is a pair of constants rather than a row in PLACES.
  //
  // MEMOISED, and that is not a saved multiply. A fresh object here is a new
  // dependency on every render of this component, so the effect below would
  // tear down and re-write a SHARED ref sixty times a second. See the note on
  // gateNextAt in SeaMap, which is the same trap one level up.
  // ── AND NOT UNTIL THEY ARE THROUGH THE GATE ──────────────────────────
  // The routing beat comes up within HAIL of the gate, which is eleven hundred
  // pixels short of it and still inside the harbour. Lighting the road from
  // there drew a line over the anchorage pointing through its own wall at water
  // the captain had not reached. The chart's chevrons wait on the same
  // crossing; see the note in SeaMap.
  const routing = !!beat?.route && !gated && pastGate
  // And only from the harbour side: cross back through the arch and this
  // road would run from the fishing grounds through the reef.
  const pathing = beat?.path === 'sea_gate' && !gated && inAnchorage
  const lit = useMemo(
    () => (pathing ? { x: SEA_GATE.x, y: SEA_GATE.y, r: SEA_GATE_HALF } : routing ? nextAt : null),
    [pathing, routing, nextAt],
  )
  useEffect(() => {
    if (!lit) return
    goal.current = lit
    return () => { goal.current = null }
  }, [lit, goal])
  useEffect(() => { if (done) onDone?.() }, [done, onDone])

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
    // NOT OURS, NOT OURS TO CLEAR. `tourCam` is shared with the first voyage
    // exactly as `tourGoal` is -- see the note there. The cleanup below is what
    // returns the camera to the hull.
    if (!beat || beat.until !== 'look' || !beat.at || !inAnchorage || fighting) return
    // THE GATE IS NOT A PLACE. It is a pair of constants in chart.ts — no
    // island, no berth, no row in PLACES — and it is the one thing on this half
    // a captain most needs pointed at. Named here rather than given a fake
    // entry in PLACES, which would put a landable port on the water.
    if (beat.at === 'sea_gate') { cam.current = { ...SEA_GATE }; return () => { cam.current = null } }
    const place = PLACES.find(p => p.id === beat.at)
    cam.current = place ? { x: place.x, y: place.y } : null
    return () => { cam.current = null }
  }, [beat, inAnchorage, fighting, cam])

  // ── AND THE THING ITSELF, LIT UP ──────────────────────────────────────────
  //
  // Found by DOM lookup, because every one of these is in a sibling component.
  // Polled for the life of the beat, the way the first voyage does: two of the
  // targets are inside the crew panel and appear whenever the captain opens
  // it, which is not within any number of retries of the beat coming up.
  /**
   * ── AND WHETHER THE THING IT IS POINTING AT IS ACTUALLY THERE ───────────
   *
   * This is the whole of how the crew half used to strand a captain, so it is
   * worth writing down in full.
   *
   * While the tour holds the wheel the chart dims and DISABLES every
   * `[data-coach]` control that is not the one being flashed (`.sea-tour-lock`
   * in globals.css). That is right when the tour is pointing at something on
   * screen and catastrophic when it is not: shut the crew panel on the beat
   * that says "Select Recruit" and the target is gone, nothing is flashed, and
   * the crew disc that would let you back in is one of the controls the lock
   * just switched off. Same on the way out of a room: step into the Roster and
   * the beat's door is gone, and so is the back button, because it wears a
   * `data-coach` too. No card to press, no control to press, nothing to do.
   *
   * So the tour says whether its target is in the document. If it is not, the
   * card re-points at the way back (see `waypoint` below) and the chart drops
   * the lock (see `found` in the beat it publishes), so at worst a captain who
   * has wandered off gets a live screen and a line telling them where to go.
   */
  useEffect(() => {
    const want = beat?.target
    // THE GUARD COMES FIRST. `clear()` is a document-wide sweep of every
    // `.coach-flash` on the page, and the first voyage's marks are on the same
    // page -- so clearing before checking whether this tour has anything to say
    // put out the other tour's highlight on every render. Same fault as the
    // goal above, in a third place.
    if (!want || !inAnchorage || fighting) { setFound(true); return }
    const clear = () => document.querySelectorAll('.coach-flash')
      .forEach(el => el.classList.remove('coach-flash', 'coach-flash-gold'))
    clear()
    const find = () => {
      clear()
      // WHETHER THE BEAT'S OWN TARGET IS THERE is the question `found`
      // answers, and it is asked first and separately: the waypoint exists
      // BECAUSE the answer is no, so counting the waypoint's own control would
      // make the answer yes and put the card straight back to an instruction
      // nobody can follow.
      let n = 0
      for (const name of want.split(' ')) {
        n += document.querySelectorAll(`[data-coach="${name}"]`).length
      }
      setFound(n > 0)
      // And then light whatever the card is actually pointing at, which is the
      // way back when the target has gone.
      const lit = n > 0 ? want : (litRef.current ?? want)
      for (const name of lit.split(' ')) {
        document.querySelectorAll(`[data-coach="${name}"]`)
          .forEach(el => el.classList.add('coach-flash', 'coach-flash-gold'))
      }
    }
    find()
    const id = window.setInterval(find, 250)
    return () => { window.clearInterval(id); clear() }
  }, [beat, inAnchorage, fighting])

  // ── THE BEATS THAT WAIT ON THE CREW PANEL ────────────────────────────────
  const want = beat?.until
  useEffect(() => { if (live && want === 'crewOpen' && crewOpen) next() }, [live, want, crewOpen, next])
  /**
   * ── AND THE ONE THAT DOES NOT, BUT IS BURIED BY IT ──────────────────────
   *
   * A `next` beat that is NOT raised over the crew panel sits underneath it.
   * The beat before "Open the Crew menu" is one of those: it says the menu
   * changes up here and it LIGHTS THE CREW DISC to show you which one, so the
   * obvious thing to do is press the lit control — and pressing it opens the
   * panel over the card, taking its Next with it. Nothing on screen advances
   * the tour, and the crew disc, having been pressed, is no longer the thing
   * to press. That is the "you can still get stuck if you don't click Next".
   *
   * Opening the panel is a better answer to that beat than Next was.
   */
  useEffect(() => {
    if (live && want === 'next' && !beat?.overPanel && crewOpen) next()
  }, [live, want, beat, crewOpen, next])
  useEffect(() => { if (live && want === 'recruitBoard' && crewOpen && crewSection === 'recruits') next() }, [live, want, crewOpen, crewSection, next])
  useEffect(() => { if (live && want === 'assignBoard' && crewOpen && crewSection === 'assign') next() }, [live, want, crewOpen, crewSection, next])
  useEffect(() => { if (live && want === 'assigned' && hasCaptain) next() }, [live, want, hasCaptain, next])
  useEffect(() => { if (live && want === 'crewClosed' && !crewOpen) next() }, [live, want, crewOpen, next])
  // The pennant, opened. The last beat, and the end of the tour.
  useEffect(() => { if (live && want === 'campaign' && campaignOpen) next() }, [live, want, campaignOpen, next])

  // ── THROUGH THE GATE, NOT WITHIN HAIL OF IT ──────────────────────────
  //
  // This waited on GATE_HAIL, eleven hundred pixels out, which is still well
  // inside the harbour: the beat handed over while the captain was in open
  // anchorage water with the two boulders still ahead of them, so the line
  // about what is out there arrived before they had seen any of it. The
  // crossing itself is the moment, and the chart already knows it.
  const wantGate = beat?.until === 'gate'
  useEffect(() => { if (live && wantGate && pastGate) next() }, [live, wantGate, pastGate, next])

  // Sailed into the ring the path drew.
  const wantReach = beat?.until === 'reach'
  useEffect(() => {
    if (!live || !wantReach || gated || !nextAt) return
    const id = window.setInterval(() => {
      if (Math.hypot(at.current.x - nextAt.x, at.current.y - nextAt.y) < nextAt.r) next()
    }, 250)
    return () => window.clearInterval(id)
  }, [live, wantReach, gated, nextAt, at, next])
  // Latched against the count as it was when the beat came up, so a hand
  // signed on before the tour got here does not skip the beat that asks.
  const recruitMark = useRef(recruits)
  useEffect(() => { if (want !== 'recruited') recruitMark.current = recruits }, [want, recruits])
  useEffect(() => {
    // ── OR THEY ALREADY HAVE ONE ──────────────────────────────────────
    //
    // The board holds three a day and they can all be gone: signed on before
    // the tour reached this beat, or taken on another device. Waiting for a
    // recruit that cannot be made is a tour that stops until tomorrow, on the
    // beat before the one that opens the campaign. What this beat is FOR is
    // having a hand aboard, so having one satisfies it.
    if (live && want === 'recruited' && (recruits > recruitMark.current || hands > 0)) next()
  }, [live, want, recruits, hands, next])

  // WAITS RATHER THAN PLAYS, anywhere but here. A captain who crosses the reef
  // and turns straight round should meet the same beat when they come back, not
  // find the tour has talked itself out over the fishing grounds.
  // Kept mounted so the last card can fade rather than cut. See the first voyage.
  //
  // AND A HIDDEN CARD COMES BACK when the captain is adrift: the × means "I
  // have read this", which is not the same as "I no longer need to be told how
  // to get back to the thing you were pointing at".
  const visible = !(done || !beat || !inAnchorage || !deep || fighting || (step === hidden && !waypoint) || gated)
  const b = beat ?? GATE_TOUR[GATE_TOUR.length - 1]
  // Anything the captain has to DO has no button: the button is the thing
  // they were asked to do. A waypoint is one of those: it is asking for a tap
  // on a real control, so it does not get a Next either.
  const waiting = (b.until !== 'next' && b.until !== 'look') || !!waypoint
  // Above the crew panel while the instruction is about something inside it.
  const inPanel = b.overPanel === true

  return (
    <GuideCoach
      show={visible}
      portrait={b.portrait}
      speaker={b.speaker}
      text={waypoint?.text ?? b.text}
      accent={SEA_ACCENT}
      onClose={() => setHidden(step)}
      anchor={waypoint?.target ?? b.target}
      onNext={waiting ? undefined : next}
      nextLabel={step === GATE_TOUR.length - 1 ? 'Aye' : undefined}
      z={inPanel ? 120 : undefined}
    />
  )
}
