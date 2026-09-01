// ── KIP LEDGER, AND THE RUN HE NEEDS HELP WITH ──────────────────────────────
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and every export here is pure.
//
// ── TIDE RUN HAD NO REASON TO EXIST ─────────────────────────────────────────
//
// It was a card in the Tavern's "The day" group, under a heading about things
// that reset, next to a login bonus. You tapped it and you were suddenly a boat
// running from something, at speed, dodging rocks, with no idea who you were or
// what you were carrying or why the rocks mattered. A very good minigame with
// nothing in front of it.
//
// So it starts with a person now. He is east of the Mainland, he is carrying
// something he should not have, and he needs to get it as far from where he
// stole it as he can. You go as far as you can for him. That is the whole
// framing and it costs nothing mechanically: the run is the run.
//
// ── THE BEACONS WERE ALREADY THE STORY ──────────────────────────────────────
//
// This is the part worth writing down, because it was sitting in the code the
// whole time. From TideRunGame:
//
//   "Beacons — disguised detection devices that look like rocks. Smash through
//    grounded to disable the beacon and stay hidden; jumping over it lets the
//    signal go off and your ship is spotted."
//
// A signature mechanic that tricks the see-rock-jump reflex, built entirely
// around not being SEEN, in a game where nobody had ever said who was looking.
// Kip is who they are looking for. His warning is not flavour bolted onto a
// mechanic, it is the mechanic explained by the only person who would know —
// which is also the house rule about mechanics copy being plain and literal
// while the flavour stays charming.

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
  // the action bar offering her instead of him and Tide Run being unreachable
  // with nothing on screen to explain it. This spot has 293px of slack on the
  // nearest prompt and sits 1,486px from home — a real leg out, not a drift.
  x: 1700,
  y: 925,
  /** Drawn from the same cosmetic tables everyone out here is drawn from, so he
   *  looks like somebody who sails rather than like a quest marker. Dark hull
   *  and a midnight bandana: he is trying not to be seen. */
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
 * dozens and you will pass another, whereas Kip is the only door to a whole
 * game mode. Missing him by a boat length means sailing the leg again.
 *
 * Expressed as a multiple of the number it is a multiple OF — see the note on
 * FINN_REACH about ratios kept in prose drifting the moment either side moves.
 */
export const KIP_REACH_MULT = 1.5

/**
 * ── WHAT HE SAYS, THE FIRST TIME ────────────────────────────────────────────
 *
 * Told in the order a frightened person tells it: what is wrong, then what he
 * has, then what he wants, then the one thing that will kill you.
 *
 * The beacon line is deliberately the LAST thing and deliberately the plainest.
 * Everything above it can be charming because it is colour; that line is a
 * control instruction wearing a coat, and a player who mis-reads it loses a run
 * to the exact reflex the mechanic is built to punish.
 */
export const KIP_INTRO: string[] = [
  "Do not wave. Do not point. Just drift alongside like we are talking about the weather.",
  "I came out of the Brine Reach three nights ago with a hold I did not pay for. Crates of it. I am not going to tell you what is in them and you are not going to ask.",
  "They know it is gone. They do not yet know it is me. That gap is the only thing I own.",
  "I cannot outrun them forever, but I do not have to. I only have to get FAR. Far enough that the trail goes cold and the crates come ashore somewhere they have never heard of me.",
  "That is what I am asking. Take the wheel and run her out as far as she will go.",
]

/**
 * THE WARNING, kept apart from the story above.
 *
 * Its own step in the scene with its own weight on screen, because this is the
 * one thing on the card that changes how somebody plays rather than how they
 * feel. Plain and literal, per the copy rule: no metaphor, no cleverness, and
 * the instruction stated as an instruction.
 */
export const KIP_WARNING = {
  title: 'Watch for the beacons',
  body: [
    "They seeded the shallows with beacons. They are made to look like rocks and they are very good at it. Rust in the cracks, a little antenna, an amber light that pulses if you know to look.",
    "Your instinct when you see a rock is to jump it. Do that to a beacon and it sees you go over, and it tells them where you are, and that is the end of the run.",
    "So you do the thing that feels wrong. Stay down and go straight through it. Smash it while your hull is in the water and it never gets the signal out.",
  ],
  /** The rule as one line, for anyone who skipped the paragraphs. */
  rule: 'Rocks you jump. Beacons you smash. Never jump a beacon.',
} as const

/**
 * WHAT HE SAYS ON EVERY VISIT AFTER THE FIRST.
 *
 * Two lines and a question. He has told you the story and he is not telling it
 * again while people are watching — and by the third run you are not there for
 * the story, you are there to go. A speech you cannot skip is a speech you
 * resent by the fourth time, and the run is the point of coming back.
 *
 * It ends on the ASK, so the buttons under it are an answer rather than a
 * menu: another run, or not now.
 */
export const KIP_AGAIN: string[] = [
  "Still here. Still nervous.",
  "Another run? The further out you get her, the colder the trail.",
]

/** The last thing before the run starts. */
export const KIP_CAST_OFF = "Right. Head down, hands steady, and do not look back at me."
