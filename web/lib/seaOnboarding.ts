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
   *   'fish'    — waits until the rod is actually out. The line says to enter
   *               fishing mode, and nothing advances until they do: a tour
   *               that walks itself past the one instruction it gave is a tour
   *               that taught nothing.
   *   'bite'    — waits until something is on the line. The cast line stays up
   *               through the cast and the wait, and the reel line arrives on
   *               the bite, which is the moment it is about.
   *   'catch'   — waits for a fish in the hold.
   *   'look'    — the camera flies somewhere and holds while they read.
   *   'reach'   — waits until they have sailed into the ring the path draws.
   *   'moor'    — waits until they are actually tied up at `at`.
   *   'ashore'  — waits until the island's door chooser is open.
   *   'sold'    — waits until the hold has been emptied at the market. That
   *               happens on ANOTHER ROUTE, which is why the tour's step is a
   *               profile column rather than component state.
   *   'almanac' — waits until the Almanac is open, OR Next. The line invites
   *               the captain to open the book; it does not insist, because
   *               the collection is theirs to look at when they want to.
   *   'bait'    — waits until there is bait on the hook. A new account has
   *               none, and the free worms are in the Daily Haul, so this is
   *               the beat that sends them there. Skipped outright for a
   *               captain who already has some.
   */
  until: 'next' | 'fish' | 'bite' | 'catch' | 'look' | 'reach' | 'moor' | 'ashore' | 'sold' | 'bait' | 'almanac'
    // The anchorage tour's own: the crew panel opened, its Recruit room
    // opened, a hand signed on, the Assign room opened, a captain seated,
    // the panel closed again.
    | 'crewOpen' | 'recruitBoard' | 'recruited' | 'assignBoard' | 'assigned' | 'crewClosed'
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
  /**
   * BRING THE ROD IN when this beat comes up.
   *
   * The catch used to stow the rod on the spot, and that was a beat too early:
   * the two lines after it point at the hold and the XP bar, both of which are
   * INSIDE the fishing overlay, so they were pointing at things that had just
   * been taken off the screen. The rod comes in on the beat that sends them
   * somewhere else instead.
   */
  stowRod?: true
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
  /**
   * ── SILENT UNTIL THEY ARE THERE ─────────────────────────────────────────
   *
   * The beat is CURRENT but draws nothing until this is true; then it shows
   * and behaves like any `next` beat -- it waits to be read and dismissed.
   *
   * For the half of a tour that is about PLACES. Flying the camera to a shore
   * and narrating it is a slideshow of somewhere you are not; a line that
   * arrives as you tie up is about the thing under you. And once it has
   * shown it STAYS, through sailing off again, until it is answered: a card
   * that vanishes because you moved is a card you have to go back for.
   *
   * A tour holds no locks past its first gated beat -- a captain cannot be
   * asked to sail somewhere with the helm's own offers dimmed. See
   * GATE_FORCED_THROUGH.
   *
   * NOTHING USES THIS TODAY. The anchorage's tour ends on the crew, and the
   * rest of that half is being written from a clean slate; this is the shape
   * the place beats will take when it is.
   */
  showWhen?: {
    /** Tied up at this chart id. */
    moor?: string
    /** Within hail of this landmark. Only 'sea_gate' today, which is a pair
     *  of constants rather than a place you can moor at. */
    near?: 'sea_gate'
    /** Out through the Sea Gate and on the campaign's water. */
    pastGate?: true
  }
  /**
   * DRAW THE WAY TO THE NEXT STOP.
   *
   * The guiding path the fishing side uses for the Shallows, pointed at
   * whatever the campaign wants next -- so a captain coming out of the gate
   * for the first time has a light on the water rather than a compass and a
   * guess. The chart owns which node that is; this only asks for the line.
   */
  route?: true
  /** Drawn above the crew panel. The panel is a PopupShell at 111 and these
   *  beats are about things inside it. */
  overPanel?: true
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
    // means a mouse and keys; anything else means the thumb box.
    text: typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
      ? 'Here it is...the open sea. Majestic isn’t it? You can move around by clicking, or with *WASD*.'
      : 'Here it is...the open sea. Majestic isn’t it? You can move around by dragging the *joystick*.',
    until: 'next',
    target: 'helm',
  },
  // ── THE BAIT ──────────────────────────────────────────────────────────
  // A new account has none, and casting is gated on having some. Waits for
  // the worms to actually land; a captain who already has bait never sees it.
  {
    ...D,
    text: 'Oof almost forgot. Ya need worms, kid. How you gonna catch anything without bait? Check the *Daily Haul*, the chest icon in the top right corner. You get freebies each day. Go and collect your worms.',
    until: 'bait',
    target: 'haul haul-bait',
  },
  {
    ...D,
    text: 'Fish nearby in the *Shallows* by sailing south of here. Follow the light.',
    until: 'reach',
    path: 'shallows',
  },
  // ── THE CATCH ─────────────────────────────────────────────────────────
  // NO holdCast HERE. It was on this beat, and startFishing refuses while it
  // is up, so the tour deadlocked on the one instruction it could not take
  // back: "fish", refused, silently, for ever. The rod is held down AFTER the
  // catch, which is the only thing that flag was ever for.
  {
    ...D,
    text: typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
      ? 'Click *Fish* to enter fishing mode.'
      : 'Hold the *helm* to enter fishing mode.',
    until: 'fish',
    target: 'fish helm',
    path: 'shallows',
  },
  {
    ...K,
    text: 'Cast your line!',
    until: 'bite',
    target: 'cast',
  },
  {
    ...K,
    text: 'You’ve caught something! Click *Reel In* to catch it. Hit the green to catch it. But hit the gold and get a perfect catch for bonus XP!',
    until: 'catch',
    target: 'reel',
  },
  {
    ...K,
    text: 'Every fish goes into your *hold*.',
    until: 'next',
    // Held back until the fish has actually got there. The flight to the hold
    // is HOLD_PERFECT_MS at most in FishingHere; this clears it with room.
    target: 'hold',
    holdCast: true,
    afterMs: 1600,
  },
  // ── AND INTO THE BOOK ────────────────────────────────────────────────
  // The Log button opens the Almanac. Said here, right after the hold, so the
  // two places a fish goes are named in the same breath; opening it advances
  // the beat, and so does Next, because looking is optional.
  {
    ...K,
    text: 'It is written into your *Almanac* as well, along with every fish you will ever land. Open the Log and start your collection.',
    until: 'almanac',
    target: 'log',
    holdCast: true,
  },
  // NO XP BEAT. There was one here -- "every fish gives XP, string perfects
  // for more" -- and it came up in the same breath as the level card, which
  // says the same thing with a picture. Two voices on one moment. The card
  // has it.
  // ── AND WHAT IT IS FOR ────────────────────────────────────────────────
  {
    ...D,
    text: 'Let’s go to the *Mainland* to sell this for some cold, hard...doubloons.',
    until: 'moor',
    at: 'mainland',
    path: 'mainland',
    holdCast: true,
    stowRod: true,
  },
  {
    ...D,
    text: 'Dock here and go ashore.',
    until: 'ashore',
    at: 'mainland',
    // The action itself: the desktop button, or the helm you hold on a phone.
    target: 'fish helm',
    holdCast: true,
  },
  {
    ...D,
    text: 'The *Market* is where it’s at.',
    until: 'sold',
    target: 'market',
    holdCast: true,
  },
  // ── THE SALE, SEEN TO LAND ───────────────────────────────────────────
  // The market advances the sold beat on another route; this is the first
  // card back on the chart, and it points at the purse, so the money the
  // captain just made is the next thing they look at.
  {
    ...D,
    text: 'That’s a *sale*, cap’n. The doubloons went straight to your purse, top right, where your balance shows.',
    until: 'next',
    target: 'purse',
  },
  {
    ...K,
    text: 'Not sure what to do next? I recommend finding *Finn*...I’ve heard he always has tasks. Make sure you go around the sea to talk to all the captains out there. There’s treasure all around!',
    until: 'next',
  },
  {
    ...K,
    text: 'You can always check your fishing *level* and milestones here as well.',
    until: 'next',
    target: 'hud-skill',
  },
  // DOBY HAS THE LAST WORD. He opened the voyage; he closes it.
  {
    ...D,
    text: 'You’re all set cap’n. Catch, sell, upgrade your gear and ship. Explore...there’s a lot more past the Expedition gate north of here too. Be sure to check the *map* to see where everything is.',
    until: 'next',
    target: 'chart',
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
  // ── THE BOAT CHANGED UNDER THEM, AND IT IS SAID FIRST ─────────────────
  {
    ...D,
    text: 'Can’t go battling it out on a fishing boat! This is your *expedition ship*. Don’t worry, crossing back through the gap brings back your fishing boat.',
    until: 'next',
  },
  {
    ...D,
    text: 'This is the *anchorage*...your home base for any expeditions. Be sure to get familiar with everything here if you want the most battle-tested ship out there.',
    until: 'next',
  },
  // ── THE HUD CHANGED SIDES ─────────────────────────────────────────────
  {
    ...D,
    text: 'You’ll notice up top that your *menu options* change based on whether you’re in the expedition zone or fishing zone.',
    until: 'next',
    target: 'hud-crew',
  },
  // ── AND THE FIRST THING IS HANDS ──────────────────────────────────────
  // Nothing up here sails empty. Before the Gunwharf, before the gate, a
  // captain signs on one hand, and the tour waits at each step for the thing
  // it asked for. These four are the forced half; see GATE_FORCED_THROUGH.
  {
    ...D,
    text: 'To get started...you’ll need a crew. Open the *Crew* menu.',
    until: 'crewOpen',
    target: 'hud-crew',
  },
  {
    ...D,
    text: 'Select *Recruit* to see who’s available. Recruits change out each day, but you can also pay gems to re-roll the draft. Who knows, you could hit it big!',
    until: 'recruitBoard',
    target: 'crew-recruits',
    overPanel: true,
  },
  {
    ...D,
    text: 'Pick one and *Recruit* them. Congrats on your first hand.',
    until: 'recruited',
    target: 'recruit',
    overPanel: true,
  },
  {
    ...K,
    text: 'That’s your crew. Crews have *stats and abilities*. Train them up and they get much, much stronger.',
    until: 'next',
    overPanel: true,
  },
  // ── AND SHE NEEDS SOMEBODY ON HER ─────────────────────────────────────
  // The Sea Gate refuses an empty ship (see the crossing in SeaMap), so this
  // is not a suggestion: it is the last thing standing between a new captain
  // and the campaign.
  {
    ...D,
    text: 'Now we need to assign your crew to your ship so you can go do some expeditions!',
    until: 'next',
    overPanel: true,
  },
  {
    ...D,
    text: 'Click *Assign*.',
    until: 'assignBoard',
    target: 'crew-assign',
    overPanel: true,
  },
  {
    ...D,
    text: 'Click on your just hired crew to assign to your ship.',
    until: 'assigned',
    target: 'captain-seat',
    overPanel: true,
  },
  {
    ...K,
    text: 'There you go! Now you’re ready for some adventure!',
    until: 'crewClosed',
    target: 'crew-close',
    overPanel: true,
  },
  // ── AND OUT THROUGH THE GATE ──────────────────────────────────────────
  // Silent until they are actually out on the campaign's water, then a line,
  // the pennant lit, and a lit path to whatever the campaign wants next --
  // which on a fresh captain is A Loose Thread.
  {
    ...D,
    text: 'Looks like we’ve got someone to deal with already. Let’s head over and see what’s happening.',
    until: 'reach',
    showWhen: { pastGate: true },
    target: 'hud-journey',
    route: true,
  },
]

/**
 * THE LAST BEAT THAT HOLDS THE WHEEL.
 *
 * Everything up to and including this one is forced: the captain does what it
 * asks and nothing else. Past it a tour is asking them to SAIL somewhere, and
 * a lock that dims the helm's own offers cannot coexist with that.
 *
 * Derived from the script rather than written down, so moving a beat cannot
 * silently leave the lock on for one it was never meant to cover. With no
 * gated beat in the script -- which is where the anchorage stands today, the
 * tour ending on the crew -- the whole of it is forced.
 */
export const GATE_FORCED_THROUGH = (() => {
  const i = GATE_TOUR.findIndex(b => b.showWhen)
  return i < 0 ? GATE_TOUR.length - 1 : i - 1
})()

/** The beat that waits on a sale. The MARKET advances past this one — it is on
 *  a different route from the chart, and it is the only surface that knows a
 *  sale happened. Derived rather than written down, so inserting a beat above
 *  it cannot silently point the market at the wrong step. */
export const SELL_STEP = FIRST_VOYAGE.findIndex(b => b.until === 'sold')
