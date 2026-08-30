// ── A CAPTAIN'S FIRST HOUR, IN ORDER ────────────────────────────────────────
//
// The whole new-player experience, as a list of beats. Doby and Kat walk a
// fresh captain from the dock to their first fish and then show them what is
// out there.
//
// ── FISH FIRST, TOWN SECOND, AND THAT ORDER IS THE DESIGN ───────────────────
//
// The obvious tour is the town: here is the market, here is the tackle shop,
// here is where you sell things. It is also the wrong one, because at minute
// zero none of those words mean anything. A market you cannot sell to and a
// tackle shop you cannot afford are two buildings the captain nods at and
// forgets.
//
// One fish changes every one of them. THEN the market is where that fish is
// worth something, and the tackle shop is what the money is for, and the whole
// town stops being a list of doors and becomes a set of answers to a question
// they already have. It is also what the game is about: fishing is the loop,
// and the first five minutes should be spent doing it rather than being shown
// around the building it is paid for in.
//
// ── AND THE ISLANDS ARE SHOWN, NOT VISITED ──────────────────────────────────
//
// The tour flies the camera to each one and names it. Sailing to all six would
// be a genuinely long voyage — the Crew Hall alone is four thousand pixels
// north — and arriving somewhere is not what makes a place stick. Seeing it,
// being told what it is, and knowing it is out there is enough at this stage;
// SeaLandfallHint says the useful sentence again the first time they actually
// moor, which is when it becomes usable.
//
// ── VOICE ───────────────────────────────────────────────────────────────────
//
// PLAIN. Direct instructions for somebody who has been playing for ninety
// seconds. No pirate flavour, no mood, no cryptic — that voice belongs to the
// campaign and it belongs there because the campaign has earned the patience it
// asks for. Say the thing, in as few words as it takes. One *asterisked* term
// per line at most, and only on the word they have to remember.
//
// PLAIN IS NOT STIFF, which is what this file got wrong first time out.
// "That is your first" and "you will want hands aboard" are not how anybody
// speaks. Doby and Kat are two people talking to a captain, and people contract
// their words; uncontracted prose in every line is the clearest tell that
// nobody ever said it out loud.
//
// And NEVER explain the game against a version of itself the player has not
// seen. A line here read "the *Cast* button comes up. No menus." — which is a
// developer comparing this to the fishing screen it replaced. The captain has
// never seen a menu. There is nothing there for them to be relieved about, and
// the sentence only means anything to somebody who worked on it.

import { GUIDES } from './onboardingScenes'

/** The chart's own temperature. Colder than the fishing blue, which is a
 *  harbour colour; this is open water. */
export const SEA_ACCENT = '#7fd6c0'

export type Beat = {
  speaker: string
  portrait: string
  text: string
  /**
   * What has to happen before the beat is done.
   *
   *   'next'    — the captain reads it and taps Next.
   *   'cast'    — waits until the rod is actually out. The line before it says
   *               to sail out and cast, and nothing advances until they do:
   *               a tour that walks itself past the one instruction it gave is
   *               a tour that taught nothing.
   *   'catch'   — waits for a fish in the hold.
   *   'look'    — the camera flies somewhere and holds while they read.
   *   'moor'    — waits until they are actually tied up at `at`.
   *   'ashore'  — waits until the island's door chooser is open.
   *   'sold'    — waits until the hold has been emptied at the market. That
   *               happens on ANOTHER ROUTE, which is why the tour's step is a
   *               profile column rather than component state.
   */
  until: 'next' | 'cast' | 'catch' | 'look' | 'moor' | 'ashore' | 'sold'
  /** For `look`: the place the camera flies to, by chart id. */
  at?: string
  /** Flash the real control rather than describing it. Matches `data-coach`. */
  target?: string
  /**
   * THE ROD STAYS STOWED THROUGH THIS BEAT.
   *
   * Once the first fish is landed the tour has somewhere to be, and a captain
   * who casts again is a captain who fishes until the hold is full and never
   * finds out what any of it was for. Casting is refused for these few beats
   * and the reason is said out loud, which is the difference between a guided
   * step and a button that mysteriously stopped working.
   */
  holdCast?: true
  /** Draw the guiding path to this place. Naming somewhere says WHAT; on a
   *  chart this size a new captain also needs WHICH WAY, and an instruction
   *  they cannot follow is worse than none. */
  path?: string
}

const D = GUIDES.doby
const K = GUIDES.kat

/**
 * THE FIRST VOYAGE.
 *
 * Steer, catch, sell, and only then the rest of the world. It is a long list
 * and almost none of it is reading: two beats arrive before the captain is
 * doing something, and everything after that is spread across a real catch, a
 * real sail home, a real sale, and a flight over the chart. A tour of a place
 * rather than a wall of text about one.
 */
export const FIRST_VOYAGE: Beat[] = [
  // ── THE BOAT ──────────────────────────────────────────────────────────
  {
    ...D,
    // The steering line teaches the input they actually have. A fine pointer
    // means a mouse, and a mouse usually means keys under the other hand.
    text: typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
      ? 'Welcome aboard, Captain. This is the whole sea. Hold *WASD* to steer her.'
      : 'Welcome aboard, Captain. This is the whole sea. Drag anywhere to steer her.',
    until: 'next',
  },
  {
    ...K,
    // NOT "past the shallows". A new captain starts in the Mainland's berth at
    // radius 617 and the Shallows do not begin until 1400, so they are sailing
    // OUT TO them — telling somebody to go past the first water they will
    // reach sends them through it and out the other side.
    text: 'Head south, out to the *Shallows*. Follow the lights.',
    until: 'next',
    path: 'shallows',
  },

  // ── THE FIRST CAST ────────────────────────────────────────────────────
  {
    ...K,
    text: 'Once you’re over open water the *Cast* button comes up. Fish are wherever you drop a line.',
    until: 'cast',
    target: 'cast',
    path: 'shallows',
  },
  {
    ...K,
    // The dial explanation used to live in the retired fishing hub's intro
    // scene. It belongs here now, at the moment the dial is on screen.
    text: 'Stop the needle in the *green* to land it. The *gold* is a Perfect, and it pays better.',
    until: 'catch',
  },
  {
    ...D,
    text: 'There’s your first. It sits in the *hold* until you sell it.',
    until: 'next',
    holdCast: true,
  },

  // ── AND WHAT IT IS WORTH ──────────────────────────────────────────────
  //
  // The whole loop, closed, before anything else is mentioned. A captain who
  // has caught a fish and sold it has done the thing the game is; every other
  // building on the chart is a variation on it, and none of them can be
  // explained to somebody who has not.
  {
    ...D,
    text: 'A fish in the hold is worth nothing. Take her home to the *Mainland*, where the market pays full price.',
    until: 'moor',
    at: 'mainland',
    path: 'mainland',
    holdCast: true,
  },
  {
    ...K,
    text: 'Tie up and go *ashore*.',
    until: 'ashore',
    at: 'mainland',
    holdCast: true,
  },
  {
    ...K,
    text: 'The *Market*. That’s where the hold turns into coin.',
    until: 'sold',
    target: 'market',
  },
  {
    ...D,
    text: 'That’s the whole trade, Captain. Catch, sell, buy better tackle, catch more.',
    until: 'next',
  },

  // ── AND WHAT ELSE IS OUT THERE ────────────────────────────────────────
  {
    ...D,
    text: 'Now have a look around. Every island out here is somewhere you can tie up.',
    until: 'next',
  },
  {
    ...K,
    text: 'The *Homestead* is yours. It isn’t much yet. It gets better.',
    until: 'look',
    at: 'home',
  },
  {
    ...D,
    text: 'The *Shipyard*. Your rack, your loadout, and every upgrade you’ll ever buy her.',
    until: 'look',
    at: 'shipyard',
  },
  {
    ...K,
    text: 'The *Tally House* posts the day’s orders. Fish somebody wants, and what they’ll pay.',
    until: 'look',
    at: 'trawl_docks',
  },
  {
    ...K,
    text: 'And the *Crew Hall*, up north. You’ll want hands aboard before long.',
    until: 'look',
    at: 'crew_hall',
  },
  {
    ...D,
    text: 'That’s the sea, Captain. She’s yours to sail.',
    until: 'next',
  },
]

/** The beat that waits on a sale. The MARKET advances past this one — it is on
 *  a different route from the chart, and it is the only surface that knows a
 *  sale happened. Derived rather than written down, so inserting a beat above
 *  it cannot silently point the market at the wrong step. */
export const SELL_STEP = FIRST_VOYAGE.findIndex(b => b.until === 'sold')
