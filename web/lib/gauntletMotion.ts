// GAUNTLET MOTION — the whole vocabulary, in one place.
//
// The Gauntlet had accumulated 24 distinct spring configs and 14 distinct
// sub-second durations in a single file. None of them wrong on their own;
// together they meant no two screens moved alike, which reads as inconsistency
// rather than as character. A house style is a SMALL set of tokens used
// everywhere, so the exceptions mean something.
//
// Four rules these encode:
//
//  1. EXITS ARE FASTER THAN ENTRANCES. Always. A screen you are leaving has
//     already been read; making it linger is making the player wait on a
//     decision they have made. Roughly two thirds is the ratio that reads as
//     "responsive" rather than "clipped".
//
//  2. ENTER EASES OUT, EXIT EASES IN. Arriving decelerates into place; leaving
//     accelerates away. Using one curve for both is the single commonest reason
//     transitions feel rubbery.
//
//  3. HOW OFTEN YOU SEE IT DECIDES HOW LONG IT TAKES. This is a roguelike: the
//     boon draft and the breather are met at EVERY depth of a forty-depth run,
//     so they get ENTER. A beat that happens once a run and marks something
//     (the don falling, your ship going down, the chest) gets CEREMONY, where
//     the wait IS the point. Nothing repeated may use CEREMONY.
//
//  4. STAGGER IS SEASONING. Delays here ran as high as 1.3s, so some elements
//     finished arriving nearly two seconds in. A stagger exists to stop three
//     cards landing as one block, not to perform. 40ms does that; 150ms is a
//     queue.

import type { Transition } from 'framer-motion'

/** Content arriving. The default for anything the player meets more than once. */
export const ENTER: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

/** Content leaving. Faster than ENTER, and eased the other way. */
export const EXIT: Transition = { duration: 0.14, ease: [0.4, 0, 1, 1] }

/** Something that should feel physical when it lands: a claimed boon, a chest
 *  lid, a mark searing on. Use where weight is the message, not for layout. */
export const POP: Transition = { type: 'spring', stiffness: 300, damping: 24 }

/** Once-per-run beats only. Read rule 3 before reaching for this. */
export const CEREMONY: Transition = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

/** Seconds between siblings in a list. See rule 4. */
export const STAGGER = 0.04

/** Stagger for a CEREMONY beat, where a slower cascade is the point. */
export const STAGGER_SLOW = 0.09

/** Nth sibling's delay, so call sites stop hand-rolling `0.7 + i * 0.15`. */
export function stagger(i: number, step: number = STAGGER, from = 0): number {
  return from + i * step
}

/**
 * The phase cross-dissolve.
 *
 * OPACITY ONLY, and this is not laziness. A phase's subtree carries
 * position:fixed layers (the battle backdrop, portaled sheets), and a transform
 * on an ancestor makes that ancestor the containing block for every one of them
 * — the trap this repo has already fallen into more than once. Directional
 * travel would look better and is not worth re-opening that door.
 */
export const PHASE_ENTER = { opacity: 1, transition: ENTER } as const
export const PHASE_EXIT = { opacity: 0, transition: EXIT } as const
export const PHASE_INITIAL = { opacity: 0 } as const
