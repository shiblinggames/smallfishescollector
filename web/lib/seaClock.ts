// THE SEA'S OWN CLOCK.
//
// Plain module, not 'use server' — a file with that directive silently drops
// every non-async export and all of this is pure. It is read by the map, by the
// trader table, and by the server action that prices a rare trader, and all
// three have to agree to the millisecond.
//
// ── WHY THE GAME KEEPS ITS OWN TIME ─────────────────────────────────────────
//
// Terraria gates its rarest merchants on night, and that is a good instrument:
// it makes the world have a rhythm you learn, and it gives "come back later" a
// meaning that is not a countdown timer. But gating on the PLAYER'S clock would
// mean somebody in the wrong timezone, or somebody who plays on their lunch
// break, simply never sees half the content. This game does not do that.
//
// So the sea runs its own day. A full cycle is 24 minutes for everybody, on the
// same tick worldwide, which means night comes round about three times an hour
// no matter who or where you are. Nothing is ever missed for good and nothing
// has to be waited out overnight.
//
// ── WHY IT IS DERIVED, NOT STORED ───────────────────────────────────────────
//
// The phase is a pure function of the wall clock, so the client and the server
// compute it independently and cannot disagree. No row, no job, nothing to
// migrate, and a rare trader cannot be conjured by a client claiming it is dark.

/** One full turn of the sea's day, in milliseconds. */
export const CYCLE_MS = 24 * 60 * 1000

/** How much of the cycle is night. A third — long enough to sail out and find
 *  somebody, short enough that missing one is never a wait worth resenting. */
const NIGHT_FRACTION = 1 / 3

export type SeaPhase = 'dawn' | 'day' | 'dusk' | 'night'

export type SeaClock = {
  /** 0 at the start of the cycle, approaching 1 at the end. */
  t: number
  phase: SeaPhase
  /** True through dusk and night — the window rare traders keep. */
  isNight: boolean
  /** 0 in full day, 1 at the deepest point of night. Drives every colour on
   *  the map, so the change is continuous rather than a switch being thrown. */
  darkness: number
  /** Which night this is. Part of a rare trader's key, so one cannot be
   *  redeemed a cycle after it has gone. */
  nightIndex: number
}

export function seaClock(now: number = Date.now()): SeaClock {
  const t = (now % CYCLE_MS) / CYCLE_MS

  // Laid out so night sits in the middle of the cycle rather than across the
  // wrap, which keeps nightIndex from changing halfway through a night and
  // stranding somebody mid-conversation with a trader who no longer exists.
  const nightStart = 0.5 - NIGHT_FRACTION / 2
  const nightEnd = 0.5 + NIGHT_FRACTION / 2
  const FADE = 0.09

  let darkness: number
  let phase: SeaPhase
  if (t < nightStart - FADE) { darkness = 0; phase = 'day' }
  else if (t < nightStart) { darkness = (t - (nightStart - FADE)) / FADE; phase = 'dusk' }
  else if (t < nightEnd) { darkness = 1; phase = 'night' }
  else if (t < nightEnd + FADE) { darkness = 1 - (t - nightEnd) / FADE; phase = 'dawn' }
  else { darkness = 0; phase = 'day' }

  return {
    t,
    phase,
    // Dusk counts. Somebody who arrives as the light is going should not be
    // told to come back in ninety seconds.
    isNight: phase === 'night' || phase === 'dusk',
    darkness,
    nightIndex: Math.floor(now / CYCLE_MS),
  }
}

/** What the banner says. Short — this sits on a chart, not a page. */
export const PHASE_LABEL: Record<SeaPhase, string> = {
  dawn: 'First light',
  day: 'Daylight',
  dusk: 'The light is going',
  night: 'Dark water',
}

/** Milliseconds until the next night begins. Used to tell a player when to come
 *  back rather than leaving them to work it out. */
export function msToNight(now: number = Date.now()): number {
  const nightStart = 0.5 - NIGHT_FRACTION / 2
  const t = (now % CYCLE_MS) / CYCLE_MS
  const delta = t < nightStart ? nightStart - t : 1 - t + nightStart
  return Math.round(delta * CYCLE_MS)
}
