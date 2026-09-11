// ── KIP LEDGER, AND THE ONE THING HE STILL DEALS IN ─────────────────────────
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and every export here is pure.
//
// ── HE USED TO BE THE DOOR TO TIDE RUN ──────────────────────────────────────
//
// Tide Run has left this game. It is its own thing now, on its own store, and
// everything that served it went with it: the run, the boats, the seas, the
// board, six badges and a contest.
//
// Kip did not go with it, and that is deliberate. He is a good character in a
// good spot -- a real leg east of the Mainland, close enough that a new captain
// finds him -- and deleting a person to delete a minigame is throwing out the
// half that was working. What he needed was something to be about.
//
// ── SO HE TRADES IN WHAT HE KNOWS ───────────────────────────────────────────
//
// He is done moving crates. What he has left is the thing a fixer always has
// left, which is knowing how the harbour actually works, and the piece of that
// worth telling a captain is what the harbour gives its Captains.
//
// THE PITCH IS HONEST, AND THAT IS A RULE RATHER THAN A PREFERENCE. Real money
// is at the end of this conversation. Kip can keep his voice down and his
// charm, but every line about what the thing IS -- what you get, what it
// costs, how long it lasts -- is plain, literal and true, the same way a
// mechanic is explained anywhere else in this game. The perks themselves are
// not written here at all: they are read from the membership modal, so the man
// on the water and the card that takes the money can never end up describing
// two different offers.

/** WHERE HE IS. East of the Mainland, which sits at the origin with r=500.
 *
 *  Far enough out that he is not in the harbour's furniture and you have to
 *  actually sail to him; close enough that a new captain finds him. Just south
 *  of the Mainland's latitude so he is on open water rather than up in the
 *  anchorage approaches.
 *
 *  ASSERTED, NOT EYEBALLED. `scripts/check-smuggler.mts` runs the same solid
 *  model the traders and Finn are checked against — every port, isle and
 *  landmark — because a person moored inside an island puts his hail button and
 *  the island's "go ashore" button on the same spot, and the action bar only
 *  ever shows one of them. */
export const KIP = {
  key: 'smuggler:kip',
  name: 'Kip Ledger',
  //
  // 1700, 925. Solved rather than picked: 2150,900 was the eyeballed guess and
  // the check caught it 89px INSIDE Sandy Sole's hail, which would have meant
  // the action bar offering her instead of him. This spot has 293px of slack on
  // the nearest prompt and sits 1,486px from home — a real leg out, not a
  // drift.
  x: 1700,
  y: 925,
  /** Drawn from the same cosmetic tables everyone out here is drawn from, so he
   *  looks like somebody who sails rather than like a quest marker. Dark hull
   *  and a midnight bandana: old habits. */
  look: {
    characterColor: 'gray',
    boatId: 'charcoal',
    hatId: 'midnight',
    /** Plain and unglowing. A glowing rod is something a player earned, and the
     *  sea's own NPC pool excludes them for exactly that reason. */
    rodSlug: 'rod_driftwood',
  },
  /** What floats over him on the water, before you have said a word. */
  line: 'Keep your voice down.',
} as const

/**
 * HOW CLOSE YOU HAVE TO BE TO HAIL HIM.
 *
 * Finn's reach, not a trader's, and for Finn's reason: a trader is one of
 * dozens and you will pass another, whereas Kip is the only person out here who
 * will tell you this. Missing him by a boat length means sailing the leg again.
 *
 * Expressed as a multiple of the number it is a multiple OF — see the note on
 * FINN_REACH about ratios kept in prose drifting the moment either side moves.
 */
export const KIP_REACH_MULT = 1.5

/**
 * ── WHAT HE SAYS, THE FIRST TIME ────────────────────────────────────────────
 *
 * Told in the order a fixer tells it: why he is whispering, what he used to do,
 * what he does instead, and then the thing he is actually here to say.
 *
 * The last line hands over to the list, and the list is the membership's own.
 */
export const KIP_INTRO: string[] = [
  "Do not wave. Do not point. Just drift alongside like we are talking about the weather.",
  "I used to move crates I did not pay for. That is finished. I got old and the Brine Reach got patient.",
  "What I deal in now is what I know, and I have spent twenty years learning exactly how this harbour works.",
  "So here is the one piece worth your time. The harbour keeps a register, and the names on it are called Captains. It is not a rank you earn off anybody. You put your name down and the harbour starts treating you differently the same day.",
]

/**
 * WHAT IT IS, PLAINLY, and this is the part that is not charming on purpose.
 *
 * Money is at the end of this conversation, so the terms are stated the way a
 * mechanic is stated: flat, literal, and no cleverness standing between the
 * player and the facts. The perk LIST is not here — it comes from the
 * membership modal, so there is exactly one description of the offer in the
 * codebase and Kip cannot drift from the till.
 */
export const KIP_TERMS = {
  title: 'What the register gets you',
  /** Said under the list. One payment, kept for good: see MembershipModal. */
  terms: 'One payment of $9.99. It is not a subscription and it does not lapse. Buy it once and it is yours for good.',
  /** The nudge under the button, in his voice rather than the shop's. */
  aside: 'I take nothing out of this. I just know which captains get the better end of the harbour, and I would rather it was you.',
} as const

/**
 * WHAT HE SAYS TO SOMEBODY WHO ALREADY HAS IT.
 *
 * A pitch aimed at a Captain is the clearest way to tell a paying player that
 * nothing in the game is reading what they bought. He notices, he says so, and
 * he gets out of the way.
 */
export const KIP_ALREADY: string[] = [
  "Ah. You are on the register already.",
  "Then you know what it is worth and I am wasting good whispering. Take care of yourself out here.",
]

/**
 * WHAT HE SAYS ON EVERY VISIT AFTER THE FIRST.
 *
 * Two lines. He has made his case and he is not making it again word for word
 * while people are watching, but the offer stands and the button under him is
 * the same one.
 */
export const KIP_AGAIN: string[] = [
  "Still here. Still nervous.",
  "The register is still open, if you have thought about it.",
]
