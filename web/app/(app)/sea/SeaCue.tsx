'use client'

// ── ONE LINE, THE FIRST TIME IT MATTERS ─────────────────────────────────────
//
// The other half of SeaLandfallHint. That one fires when you tie up somewhere;
// this one fires on anything else the chart can notice — a level gained, a
// stranger within hail, an island flying a mark, the Wargate coming into range.
//
// ── WHY THESE ARE NOT IN THE TOUR ───────────────────────────────────────────
//
// They were. The first voyage ran to twenty-four beats and the anchorage tour
// to sixteen, and between them they named eleven islands and eight HUD discs
// before the captain had touched any of it. That is a manual, and a manual read
// at minute zero is a manual nobody remembers at minute forty.
//
// A cue costs nothing until the moment it is about, and at that moment it is
// the only sentence on screen. The captain has already noticed the thing — the
// bar moved, the boat is there, the island lit up — and this names it.
//
// ── EXCEPT THE PENNANT, WHICH IS IN BOTH TOURS ──────────────────────────────
//
// It was a cue here for a day and that was wrong. Every other disc is a place
// you go when you already know you want it; the pennant is the one you press
// when you do NOT know what to do, and its cue fired on Finn finishing a job,
// which can be hours after the question first comes up. A signpost that arrives
// after you are lost is not a signpost. See lib/seaOnboarding.
//
// ── ONE AT A TIME, AND NEVER WHILE A TOUR IS SPEAKING ───────────────────────
//
// Crossing into the anchorage makes three of these true at once, and three
// cards in a row is the wall of text this exists to avoid. They queue: one
// shows, and the next waits for it to go and for a breath after it.
//
// Latched in `sea_hints_seen`, the same column the landfall hints use, under a
// `cue:` prefix. No migration, and the two can never collide with a port id.

import { useEffect, useRef, useState, startTransition } from 'react'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import { SEA_ACCENT } from '@/lib/seaOnboarding'
import { markSeaHintSeen } from './tourActions'

/** Every cue, in the order they are offered when more than one is true. The
 *  order IS a priority: the first true one wins the slot. */
const CUES: {
  id: string
  portrait: string
  speaker: string
  text: string
  /** The disc to light under the card, if it has one. Matches `data-coach`. */
  target?: string
}[] = [
  // ── THE HUD, ONE DISC AT A TIME ───────────────────────────────────────
  //
  // Each of these was a beat in a run of four. A row of discs explained in one
  // sitting is four things to remember; a disc explained the first time it has
  // something to say is one thing to do.
  {
    id: 'level',
    ...GUIDES.kat,
    text: 'That is a *level*, Captain. The disc up there is your fishing spine: what each rank bought you, and where your renown goes when you have some.',
    target: 'hud-skill',
  },
  {
    id: 'almanac',
    ...GUIDES.kat,
    text: 'You have a few in the book now. The *almanac* holds every fish in these waters, with the ones you have landed filled in and the rest left blank.',
    target: 'hud-almanac',
  },
  {
    id: 'chart',
    ...GUIDES.doby,
    text: 'You are a fair way out. The *chart* is the whole sea at a glance, and it fills in as you sail it.',
    target: 'chart',
  },
  {
    id: 'hail',
    ...GUIDES.doby,
    text: 'You are not the only one out here. *Hail* anyone you pass. Some buy your catch on the spot, some just like the company, and they all warm to you the more you stop.',
  },
  // ── AND THE EXPEDITION SIDE'S OWN ─────────────────────────────────────
  {
    id: 'crew',
    ...GUIDES.kat,
    text: 'The *crew* disc: who is aboard, who is out on a voyage, and who is asleep in the hall. Seat your raid party there before you go north.',
    target: 'hud-crew',
  },
  {
    id: 'loadout',
    ...GUIDES.kat,
    text: 'And the *slots* are your battle loadout. Six mounts on that hull, and what you bolt into them is half of any fight.',
    target: 'hud-loadout',
  },
  {
    id: 'nav',
    ...GUIDES.doby,
    text: 'Same slot, different spine. Out here that disc is your *Navigation* level, and it has its own renown to spend.',
    target: 'hud-skill',
  },
  {
    id: 'call',
    ...GUIDES.kat,
    text: 'That island is flying a *gold mark*. It does that when something on it is finished and waiting on you, and it is the whole of the notice you get.',
  },
  {
    id: 'wargate',
    ...GUIDES.doby,
    text: 'The *Wargate*. Anything you have put down out here, it remembers — step through and it puts you back on that boss’s water whenever you want another go.',
  },
]

/**
 * ── WHAT THIS TAB HAS ALREADY SAID, ACROSS MOUNTS ───────────────────────────
 *
 * MODULE SCOPE, and it has to be. This component is rendered as
 * `{!hudOff && <... />}`, and `hudOff` is `!!fishingIn || fightOn` — so
 * dropping a line or taking a fight UNMOUNTS it, and coming back mounts a
 * fresh one.
 *
 * The latch used to be `useRef(new Set(seen))`, which rebuilds on every one of
 * those mounts out of `seen` — a SERVER prop, read once when the page rendered
 * and never updated while you sail. So everything latched this session was
 * forgotten the moment you went fishing, and said itself again on the way back.
 * Three times over, for anyone who fishes twice.
 *
 * The row in the database was right the whole time; it was the copy in memory
 * that kept resetting. A latch has to outlive the thing it is latching.
 *
 * Seeded from `seen` on every mount and never cleared, so a real page load
 * starts from the database and everything after that accumulates. A different
 * captain in the same tab would inherit this set, which is fine: signing in is
 * a full navigation, and this module goes with it.
 */
const shown = new Set<string>()

/** How long the screen stays quiet after a cue before the next may speak. */
const BREATH_MS = 2600

export default function SeaCue({ seen, live, quiet }: {
  /** Everything already shown, port hints and cues together. */
  seen: string[]
  /**
   * WHICH CUES ARE TRUE RIGHT NOW, by id. The chart owns every one of these
   * conditions already — this component knows nothing about levels, fish or
   * bosses, only that something the captain can see has become true.
   */
  live: Record<string, boolean>
  /** A tour is speaking. Nothing here may talk over it. */
  quiet: boolean
}) {
  const [showing, setShowing] = useState<string | null>(null)
  /** When the last one went, so the next waits a breath. */
  const lastAt = useRef(0)

  useEffect(() => {
    // The database first, every time: this mount may be the first of the
    // session or the fourth, and either way what the server knows goes in.
    for (const s of seen) shown.add(s)
    if (quiet || showing) return
    if (Date.now() - lastAt.current < BREATH_MS) return
    const next = CUES.find(c => live[c.id] && !shown.has(`cue:${c.id}`))
    if (!next) return
    shown.add(`cue:${next.id}`)
    setShowing(next.id)
    startTransition(() => { void markSeaHintSeen(`cue:${next.id}`) })
  }, [live, quiet, showing, seen])

  // A tour starting mid-cue takes the screen back. The cue is spent either way
  // — it has been latched — and two cards at once is the thing this avoids.
  useEffect(() => { if (quiet && showing) setShowing(null) }, [quiet, showing])

  if (!showing) return null
  const cue = CUES.find(c => c.id === showing)
  if (!cue) return null

  return (
    <GuideCoach
      show
      portrait={cue.portrait}
      speaker={cue.speaker}
      text={cue.text}
      accent={SEA_ACCENT}
      placement="top"
      // TOP, with the landfall hints. The bottom of the screen is the helm's,
      // and a cue is never the thing you are about to press.
      offset="calc(env(safe-area-inset-top, 0px) + 96px)"
      z={80}
      autoHideMs={9000}
      onClose={() => { lastAt.current = Date.now(); setShowing(null) }}
    />
  )
}
