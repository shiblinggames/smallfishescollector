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
   *   'reach'   — waits until they have sailed into the ring the path draws.
   *   'moor'    — waits until they are actually tied up at `at`.
   *   'ashore'  — waits until the island's door chooser is open.
   *   'sold'    — waits until the hold has been emptied at the market. That
   *               happens on ANOTHER ROUTE, which is why the tour's step is a
   *               profile column rather than component state.
   */
  until: 'next' | 'cast' | 'catch' | 'look' | 'reach' | 'moor' | 'ashore' | 'sold'
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
  /**
   * HOLD THIS BEAT BACK, in milliseconds, after the one before it finishes.
   *
   * For the beats that comment on something the captain is still WATCHING. The
   * catch line fired on the frame the fish registered, which is while it is
   * still in the air on its way to the hold — so "watch it drop into the hold"
   * appeared over the top of the drop, and the tour talked across the moment it
   * was pointing at.
   *
   * Only ever a pause before a line that is otherwise ready. Nothing waits on
   * it and skipping ahead is unaffected.
   */
  afterMs?: number
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
      ? 'Welcome aboard, Captain. This is the whole sea. Hold *WASD* to steer her, or just click where you want to go.'
      : 'Welcome aboard, Captain. This is the whole sea. Drag anywhere to steer her.',
    until: 'next',
    target: 'helm',
  },
  {
    ...D,
    text: 'Head south, out to the *Shallows*. Follow the lights to the ring and I will show you the rest there.',
    until: 'reach',
    path: 'shallows',
  },
  // ── THE CATCH ─────────────────────────────────────────────────────────
  {
    ...D,
    text: 'Hold the helm to fish the Shallows. That drops you in and gets your line wet.',
    until: 'cast',
    holdCast: true,
    path: 'shallows',
  },
  {
    ...K,
    text: 'Now *Cast*, and watch the needle. Stopping it in the *gold* is a Perfect. String those together and the streak pays bonus XP, more of it the longer you keep it going. The *green* still catches.',
    until: 'catch',
    holdCast: true,
    target: 'cast',
  },
  {
    ...K,
    text: 'There’s your first. Watch it drop into the *hold*, where your catch sits until you sell it.',
    until: 'next',
    holdCast: true,
    afterMs: 900,
  },
  {
    ...K,
    // MERGED. The XP bar and what levels buy were two beats saying one thing:
    // keep fishing and the game opens up. One is enough, at the moment the bar
    // has just moved for the first time.
    text: 'Every fish pays *XP* too. Fill the bar along the top and you level up, and levels open better rods, reels and hooks.',
    until: 'next',
    holdCast: true,
    // THE BAR, not the disc. The sentence is about the thing that just moved;
    // the disc behind it gets its own cue the first time a rank is actually
    // gained. See sea/SeaCue.
    target: 'level',
  },
  // ── AND WHAT IT IS FOR ────────────────────────────────────────────────
  {
    ...D,
    text: 'A fish in the hold is worth nothing. Take her home to the *Mainland* and I will show you what it is worth.',
    until: 'moor',
    at: 'mainland',
    path: 'mainland',
    holdCast: true,
  },
  {
    ...D,
    text: 'Tie up and go ashore.',
    until: 'ashore',
    at: 'mainland',
    holdCast: true,
  },
  {
    ...D,
    text: 'The *Market*. That’s where the hold turns into coin.',
    until: 'sold',
    target: 'market',
    holdCast: true,
  },
  // ── AND WHERE "WHAT NOW" IS ANSWERED ──────────────────────────────────
  //
  // THE ONE DISC THAT IS WORTH A BEAT, on both halves of the game. Everything
  // else on that row is a place you go when you already know you want it; this
  // is the one you press when you do NOT know, and a captain who has not been
  // told where that lives has nothing to do but sail about.
  //
  // It was a cue for a day, fired the first time a job of Finn's was finished —
  // and that is the wrong trigger for exactly this one, because it can be hours
  // away and the question it answers arrives in the first ten minutes.
  //
  // ── AND IT NAMES NOBODY ─────────────────────────────────────────────────
  //
  // It used to say whose business the pennant was tracking, which hands a
  // captain the most important name on this water before they have met him.
  // Everyone out here is somebody you FIND: you sail up, you hail, and the
  // panel fills in behind you. A tour that reads the cast list out first takes
  // that away, and it is the one thing on this sea that cannot be given back.
  //
  // Describe what the disc HOLDS, never who is in it.
  {
    ...K,
    text: 'One thing before you go, Captain. The *pennant* up there is your story: everyone you have met out on this water, and whatever they want from you. When you are not sure what to do next, that is the disc to press.',
    until: 'next',
    target: 'hud-journey',
  },
  {
    ...D,
    // THE LAST WORD IS A DOOR, NOT A SUMMARY.
    //
    // This used to be beat ten of twenty-four, and the fourteen after it named
    // four islands the captain could not use and four discs they had no reason
    // to press. Every one of those is a cue now, fired where the thing is —
    // see sea/SeaCue and sea/SeaLandfallHint.
    text: 'That’s the whole trade, Captain. Catch, sell, buy better tackle, go further out. The rest you will find on your own, and I will be here when you do.',
    until: 'next',
  },
]
/**
 * ── THE SECOND ARRIVAL ──────────────────────────────────────────────────────
 *
 * The first voyage teaches the fishing sea and plays at signup. This plays the
 * first time a captain crosses the reef into the ANCHORAGE, which may be an
 * hour later or a week, and it teaches the other half of the game.
 *
 * ── WHY IT IS NOT MORE BEATS ON THE END OF THE FIRST ONE ────────────────────
 *
 * Because none of it can be done yet. On beat one a captain has no warship, no
 * crew, no voyage and no campaign, so a tour of the anchorage at signup is ten
 * screens about places they cannot use for things they cannot do — which is
 * precisely what the retired hub's onboarding card was, and precisely why it
 * was retired. A tour arrives when the thing it is about does.
 *
 * ── AND IT NAMES PLACES, NOT SCREENS ────────────────────────────────────────
 *
 * Every door on this half is an island or a disc, so every beat here either
 * flies the camera to a shore or points at a mark. There is nothing to teach
 * about menus because there are not any: that was the whole point of moving the
 * hub onto the water.
 *
 * IT ENDS POINTING NORTH. The campaign is the reason the anchorage exists, and
 * the last thing a captain should be looking at is the gate.
 */
export const GATE_TOUR: Beat[] = [
  {
    ...D,
    text: 'Past the reef, Captain. This is the *anchorage*, the quiet water where the fighting half of your outfit is run from.',
    until: 'next',
  },
  {
    ...D,
    // FIRST AND ALMOST ALONE, because nothing up here happens without her. The
    // other six islands introduce themselves when you tie up at them.
    text: 'The *Gunwharf*. Your warship sits there. Take her out before you go north, and your fishing boat waits at the quay till you are back.',
    until: 'look',
    at: 'gunwharf',
  },
  {
    ...D,
    text: 'Now look north. That ring of light is the *Sea Gate*, and it is the only way out of this harbour.',
    until: 'look',
    at: 'sea_gate',
  },
  {
    ...D,
    text: 'Past it is the campaign. Real water, not a list: you sail up to a fight and take it on where you find it. None of it is on your chart until you have sailed it, so go and look.',
    until: 'next',
  },
  {
    ...D,
    // SAID HERE RATHER THAN LEFT TO A CUE, and said with the same words the
    // fishing side used for the same disc. A captain has learned "the pennant
    // is where the story is"; this is that promise being kept on the other half
    // of the game, and out here it is the whole of the progression.
    text: 'Same *pennant*, different story. Out here it holds the campaign: every chapter, and the one stop it wants from you next. That is your answer to "what now" on this water.',
    until: 'next',
    target: 'hud-journey',
  },
  {
    ...K,
    text: 'The rest of this harbour introduces itself as you tie up at it. Take her out, Captain.',
    until: 'next',
  },
]

/** The beat that waits on a sale. The MARKET advances past this one — it is on
 *  a different route from the chart, and it is the only surface that knows a
 *  sale happened. Derived rather than written down, so inserting a beat above
 *  it cannot silently point the market at the wrong step. */
export const SELL_STEP = FIRST_VOYAGE.findIndex(b => b.until === 'sold')
