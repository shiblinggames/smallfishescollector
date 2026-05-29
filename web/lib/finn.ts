// Finn — the fishing rival (and the game's hidden hand).
//
// All dialogue, line pools, tier definitions, and progression milestones
// live in this file. Edit text here freely — the encounter component and
// state machine read from these constants and don't care about the words.
//
// Backstory (canon, see memory finn-finndicate-twist): Finn presents as a
// cocky fishing rival and nothing more, and that is the surface the player
// must believe almost the whole way. In truth he is the head of the
// Finndicate (the Expeditions villain org), quietly steering the player
// toward the Ancient Deep to land the six trophies he has never been able
// to reach himself. Early beats are PURE rivalry, zero tells. Only the late
// beats and the first-trophy beat let the mask slip a little. The full
// reveal (he IS the Finndicate) is deferred to the end-game cross-game merge.

export const FINN_NAME = 'Finn'

// Visuals — uses the existing CharacterAvatar component so we don't need
// new art. Mirrored so he faces the player. Warm-amber avatar ring keeps
// the rival vibe friendly rather than menacing (was a red ring before).
export const FINN_AVATAR = {
  characterColor: 'ruby',
  equippedHat: null as string | null,
  bgColor: '#1a1408',
  borderColor: '#c8a060',
  mirrored: true,
} as const

// ─── Encounter mechanics ─────────────────────────────────────────────────────

/** 2% chance to fire on any Cast / Cast Again tap. Cast does not consume
 *  bait when an encounter triggers. */
export const FINN_ENCOUNTER_RATE = 0.02

/** Weighted tier pick: 60% T1, 30% T2, 10% T3. */
export const FINN_TIER_WEIGHTS = [0.6, 0.3, 0.1] as const

/** Rare lore-drop chance once the player has reached the post-reveal phase. */
export const FINN_EPILOGUE_LORE_CHANCE = 0.15

// ─── Challenge definitions ───────────────────────────────────────────────────

export type FinnChallengeType = 'perfect_streak' | 'speed_catch'

export interface FinnTier {
  tier: 1 | 2 | 3
  /** Reward multiplier — final payout = fishingLevel × multiplier doubloons. */
  multiplier: number
}

export interface PerfectTier extends FinnTier {
  /** Consecutive perfects required to win. */
  perfects: number
}

export interface SpeedTier extends FinnTier {
  /** Fish required to win. */
  fish: number
  /** Time window in milliseconds. */
  timeMs: number
}

export const FINN_PERFECT_TIERS: PerfectTier[] = [
  { tier: 1, perfects: 1, multiplier: 5  },
  { tier: 2, perfects: 2, multiplier: 10 },
  { tier: 3, perfects: 3, multiplier: 15 },
]

// Base times calibrated for Shallows. Higher zones multiply timeMs via
// FINN_SPEED_ZONE_MULT so the per-fish pace stays tight no matter where
// the player is fishing. Ancient Deep is excluded from speed challenges
// entirely — its boss-style multi-stage catches don't fit a speed format.
export const FINN_SPEED_TIERS: SpeedTier[] = [
  { tier: 1, fish: 3, timeMs: 30_000, multiplier: 5  },
  { tier: 2, fish: 5, timeMs: 42_000, multiplier: 10 },
  { tier: 3, fish: 7, timeMs: 54_000, multiplier: 15 },
]

/** Multiplier on the Shallows-baseline timeMs per zone. Tracks actual
 *  bite-wait scaling (deeper waters have longer waits) so the challenge
 *  stays achievable but never sloppy at any depth. */
export const FINN_SPEED_ZONE_MULT: Record<string, number> = {
  shallows:     1.0,
  open_waters:  1.4,
  deep:         1.9,
  abyss:        2.5,
  ancient_deep: 0,    // sentinel — speed challenges skipped entirely here
}

// ─── Story beats ─────────────────────────────────────────────────────────────

export type FinnTrack = 'encounter' | 'win' | 'reveal'

export interface FinnBeat {
  /** Stable string ID — recorded in profile.finn_seen_beats so each beat fires
   *  exactly once per player. Don't rename existing IDs; players who've
   *  already seen them will re-see them. */
  id: string
  /** Threshold the player must reach for this beat to be eligible. */
  milestone: number
  track: FinnTrack
  /** One screen of dialogue per array entry — player taps to advance. */
  lines: string[]
}

/** Encounter-track beats — fire when finn_encounters crosses milestone.
 *  Early beats are PURE rival. Later ones quietly circle the Ancient Deep
 *  and let the smallest cracks show. He never explains himself. */
export const FINN_ENCOUNTER_BEATS: FinnBeat[] = [
  {
    id: 'e1', milestone: 1, track: 'encounter',
    lines: [
      "Easy there. I've been watching you work that line a while now.",
      "Name's Finn. Nobody reads this water like I do, and I've seen a lot of anglers come and go.",
      "You've got a little promise. Promise is cheap. Let's see what yours is worth.",
    ],
  },
  {
    id: 'e3', milestone: 3, track: 'encounter',
    lines: [
      "Back already. Didn't take you for the stubborn sort.",
      "Quick hands. I'll give you that much and not a word more.",
    ],
  },
  {
    id: 'e5', milestone: 5, track: 'encounter',
    lines: [
      "There's water past the edge of your charts. Old water. The fish in it would swallow your best trophy whole.",
      "Most anglers swear it isn't real. Easier than admitting it's out of their reach.",
      "Take the bet. Let's see whether it's out of yours.",
    ],
  },
  {
    id: 'e8', milestone: 8, track: 'encounter',
    lines: [
      "The Ancient Deep. Past your trench, past your abyss, where the water turns to ink and the floor forgets to stop.",
      "Six things worth pulling up live down there. Six. Not five, not seven.",
      "Funny, the things a captain ends up counting.",
    ],
  },
  {
    id: 'e12', milestone: 12, track: 'encounter',
    lines: [
      "I've stood at the lip of that deep more nights than I'd ever admit to you.",
      "Dropped a line straight down into the black. Every time, nothing. Like the water just hands it back.",
      "Some doors only open for the right grip. Mine's never been it.",
    ],
  },
  {
    id: 'e15', milestone: 15, track: 'encounter',
    lines: [
      "I've watched a hundred anglers strut down this dock. You're the hundred and first.",
      "Most of them are noise. You're quieter. Steadier. The water doesn't seem to mind you.",
    ],
  },
  {
    id: 'e20', milestone: 20, track: 'encounter',
    lines: [
      "Hooked something down there once. Held it thirty seconds.",
      "Then the line went slack, slow and gentle, like the deep was handing it back on purpose.",
      "Like it knew whose hands were on the rod and decided no.",
    ],
  },
  {
    id: 'e25', milestone: 25, track: 'encounter',
    lines: [
      "All six trophies, landed by one angler. You have any notion what that's worth? What it would open?",
      "...course you don't. Keep fishing. You will.",
    ],
  },
  {
    id: 'e30', milestone: 30, track: 'encounter',
    lines: [
      "Some waters take more than they give. The deep takes everything except the worthy.",
      "So be worthy, and be quick about it. I've done enough waiting for one lifetime.",
    ],
  },
  {
    id: 'e32', milestone: 32, track: 'encounter',
    lines: [
      "Long enough at this and you quit hooking. You start listening.",
      "The water tells you what's coming up the line. Tells you what it is, if you shut up and let it.",
    ],
  },
  {
    id: 'e35', milestone: 35, track: 'encounter',
    lines: [
      "Have you touched the Ancient Deep yet? Truly. Not the shallows of it.",
      "...no. You haven't. I'd know. Take the bet, then. Off you go.",
    ],
  },
  {
    id: 'e37', milestone: 37, track: 'encounter',
    lines: [
      "There's a steadiness in you under all that mess. That's the rare part. That's the part I've been looking f—",
      "...the part worth beating. Forget it. Cast.",
    ],
  },
  {
    id: 'e39', milestone: 39, track: 'encounter',
    lines: [
      "You're the closest anyone's come. Closer than you'd believe.",
      "Pull up all six and we'll both see what they're good for.",
      "...we. Listen to me. Slip of an old tongue. Cast your line.",
    ],
  },
]

/** Win-track beats — fire when finn_wins crosses milestone.
 *  His grudging respect grows, but his real interest stays fixed on whether
 *  you can reach the Deep he can't. */
export const FINN_WIN_BEATS: FinnBeat[] = [
  {
    id: 'w1', milestone: 1, track: 'win',
    lines: ["Hmph. Beginner's luck. Don't go framing it."],
  },
  {
    id: 'w3', milestone: 3, track: 'win',
    lines: [
      "Twice now. Twice.",
      "...fine. You've got something. Try not to waste it.",
    ],
  },
  {
    id: 'w5', milestone: 5, track: 'win',
    lines: [
      "Five times. Maybe you're not completely useless after all.",
      "Don't let it swell your head. Plenty of water left in this ocean.",
    ],
  },
  {
    id: 'w8', milestone: 8, track: 'win',
    lines: [
      "You're getting faster. I've noticed. I notice everything.",
      "Most folk can't take me twice. You've done it eight.",
    ],
  },
  {
    id: 'w10', milestone: 10, track: 'win',
    lines: [
      "Patience and a steady hand. That's the whole trade, start to finish.",
      "Took me half a lifetime to learn it. You're picking it up fast. Almost unfairly fast.",
    ],
  },
  {
    id: 'w12', milestone: 12, track: 'win',
    lines: [
      "Where'd you learn to read water like that? You don't move like an inland kid.",
      "...don't answer. I'd rather wonder.",
    ],
  },
  {
    id: 'w15', milestone: 15, track: 'win',
    lines: [
      "Where do I come from? Ha. Nowhere you'll find on any chart you own.",
      "And we'll be keeping it that way.",
    ],
  },
  {
    id: 'w18', milestone: 18, track: 'win',
    lines: [
      "Two anglers walk into a tavern. One catches a fish. The other's me.",
      "...you laughed. Good. I was starting to worry about you.",
    ],
  },
  {
    id: 'w20', milestone: 20, track: 'win',
    lines: [
      "Patient on the entry, mean on the pull. That's how a body fishes the deep, if the deep allows it.",
      "And I'm starting to think it just might allow you.",
    ],
  },
  {
    id: 'w22', milestone: 22, track: 'win',
    lines: [
      "I gave that deep ten years. Ten years of cold mornings and a slack line and silence.",
      "You might wring more out of it in one season than I got from all of them.",
    ],
  },
  {
    id: 'w25', milestone: 25, track: 'win',
    lines: [
      "The deep's taken things off me I don't put into words. Leave it where it lies.",
      "Take the bet or don't.",
    ],
  },
  {
    id: 'w28', milestone: 28, track: 'win',
    lines: [
      "That look you get locking onto a perfect, like the water slows down just for you.",
      "I've only ever seen it on the kind of angler who can go where I can't.",
    ],
  },
  {
    id: 'w30', milestone: 30, track: 'win',
    lines: [
      "Thirty wins. Most people don't last thirty casts.",
      "...I won't call you my equal. But I'll quit calling you 'kid.'",
      "Spend that sparingly.",
    ],
  },
  {
    id: 'w33', milestone: 33, track: 'win',
    lines: [
      "Trick to the deep zones: don't pull at the bite. Pull at the breath right after.",
      "A fish has to recover. Hit it in the recovery and it can't run.",
      "...not that I told you anything.",
    ],
  },
  {
    id: 'w36', milestone: 36, track: 'win',
    lines: [
      "All these years working this dock. Waiting for the right line to come walking up it.",
      "Didn't quite believe it ever would.",
    ],
  },
  {
    id: 'w40', milestone: 40, track: 'win',
    lines: [
      "Forty. You've taken everything I can teach from up here on the dock.",
      "The rest, only the deep can teach you. So go and get it. ...for the both of us.",
    ],
  },
]

/** The reveal — fires on the next Finn encounter after the player catches
 *  their FIRST Ancient Deep trophy. The mask slips: not the full truth (that
 *  he is the Finndicate — that waits for the end-game merge), but his hunger
 *  and his need for all six show through for the first time. */
export const FINN_REVEAL_BEAT: FinnBeat = {
  id: 'reveal', milestone: 0, track: 'reveal',
  lines: [
    "...you did it.",
    "First trophy up out of the Ancient Deep. In one piece. You actually did it.",
    "Listen to me. Whatever you think you're holding, you're holding less than half of it.",
    "There are five more down there. Five. And I need every one of them landed.",
    "...need. Strong word, for a captain who's meant to be your rival. Let's call it want.",
    "I have spent more of my life on that black water than I will ever tell you, and not once did it open for me. Not once.",
    "It's opening for you.",
    "So here's the new bet, the only one that ever mattered. You and me. All six.",
    "Don't ask me why. Just fish.",
  ],
}

// ─── Generic line pools (pre-reveal) ─────────────────────────────────────────

/** Shown when an encounter fires but no story beat is due. Single-line. */
export const FINN_OFFER_LINES: string[] = [
  "Same again?",
  "Bored yet?",
  "Try this on for size.",
  "Reckon you can handle this?",
  "Loosen up. It's just doubloons.",
  "Your line. Your call.",
]

/** Shown when player wins a challenge but no win-beat milestone is hitting. */
export const FINN_WIN_LINES: string[] = [
  "Hmph.",
  "Lucky.",
  "Don't say it.",
  "Fine. You earned that one.",
  "...next one's mine.",
]

/** Shown when player loses a challenge. */
export const FINN_LOSS_LINES: string[] = [
  "Told you.",
  "Try the bait next time.",
  "Better luck next decade.",
  "Stick to the shallows, kid.",
  "That'll teach you to bet against me.",
]

// ─── Epilogue pools (post-reveal) ────────────────────────────────────────────

/** Replaces FINN_OFFER_LINES once player has seen the reveal. He's openly
 *  fixed on the remaining trophies now, and only just keeping the lid on it. */
export const FINN_EPILOGUE_OFFER_LINES: string[] = [
  "Back at it. How many of the six now?",
  "Another bet, same rules. Though we both know what I really want out of you.",
  "...you've been down to the deep again. I can see it on you.",
  "Sit a minute. The deep's waited this long. It can wait for a round of dice.",
  "How's the black water treating you?",
  "Don't let the rest of this ocean distract you. Six. That's the only number that counts.",
]

/** Replaces FINN_WIN_LINES post-reveal. */
export const FINN_EPILOGUE_WIN_LINES: string[] = [
  "Good. Now go pull up the next one.",
  "You make it look like nothing. It was never nothing. Not for me.",
  "Closer. Every win, you're a step closer to all six.",
  "I waited a long time to watch someone do this. Don't you dare stop now.",
  "Easy as breathing for you. I used to resent that. Now I'm grateful for it.",
]

/** Replaces FINN_LOSS_LINES post-reveal. */
export const FINN_EPILOGUE_LOSS_LINES: string[] = [
  "Hmph. The deep won't care about your bad day. Neither will I.",
  "Shake it off. There's trophies down there with your name not yet on them.",
  "Even off your game you're better on that water than I ever was.",
  "The deep is patient. I am running short of it. Get back out there.",
]

// ─── Return-acknowledgement pools ────────────────────────────────────────────
// Fires as the FIRST line on Finn's NEXT encounter after a resolved (or
// declined) challenge — so he remembers the last outcome instead of acting
// like every encounter is the first. Cleared on the server after each
// encounter so it only fires once per outcome.

export const FINN_RETURN_AFTER_PASS: string[] = [
  "Last time you walked away. Not biting today either?",
  "You passed on me last time. Cold feet, or just smart?",
  "Back so soon. Still afraid to commit?",
  "I half-thought you'd dodge me again.",
  "You ducked my last bet. Don't make a habit of it.",
]

export const FINN_RETURN_AFTER_LOSS: string[] = [
  "Lost the last one. Ready to lose another?",
  "Last bet went my way. Got a stomach for round two?",
  "Don't tell me you forgot the last one. Try again.",
  "I'll take your doubloons twice if you'll let me.",
  "You owed me one. Time to settle.",
]

export const FINN_RETURN_AFTER_WIN: string[] = [
  "You got me last time. Won't happen twice.",
  "Beat me once. That's a coincidence. Twice is a pattern.",
  "Don't get smug about the last one. I was warming up.",
  "Lucky last time. Skill this time?",
  "Hope you didn't spend it all already.",
]

/** Rare lore drops — fires occasionally instead of a normal offer line.
 *  Post-reveal only. The boldest tells live here: his agenda, never the
 *  whole truth. */
export const FINN_EPILOGUE_LORE_LINES: string[] = [
  "I've burned more rigs on that deep than you've owned in your life. Never kept a single bite.",
  "The deep knows who it'll allow down. I'm not on its list. You might be.",
  "Six trophies in one hand. You've no notion what that unlocks. You will.",
  "I didn't come to this dock to fish, if you must know. I came to find someone who could. Took longer than I'd have liked.",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

export function pickFinnTier(): 1 | 2 | 3 {
  return pickWeighted([1, 2, 3] as const, FINN_TIER_WEIGHTS)
}

export function pickChallengeType(): FinnChallengeType {
  return Math.random() < 0.5 ? 'perfect_streak' : 'speed_catch'
}

export function pickRandomLine(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? ''
}

/** Returns the highest-milestone unseen encounter-track beat the player has
 *  unlocked, or null. Fires when an encounter triggers and we're picking what
 *  Finn says before the offer. */
export function findNextEncounterBeat(
  encounters: number,
  seenBeats: readonly string[],
): FinnBeat | null {
  const seen = new Set(seenBeats)
  for (let i = FINN_ENCOUNTER_BEATS.length - 1; i >= 0; i--) {
    const b = FINN_ENCOUNTER_BEATS[i]
    if (encounters >= b.milestone && !seen.has(b.id)) return b
  }
  return null
}

/** Returns the highest-milestone unseen win-track beat the player has
 *  unlocked, or null. Fires after the player wins a challenge — Finn's
 *  reaction is either this beat's lines, or a generic win line if no beat
 *  is due. */
export function findNextWinBeat(
  wins: number,
  seenBeats: readonly string[],
): FinnBeat | null {
  const seen = new Set(seenBeats)
  for (let i = FINN_WIN_BEATS.length - 1; i >= 0; i--) {
    const b = FINN_WIN_BEATS[i]
    if (wins >= b.milestone && !seen.has(b.id)) return b
  }
  return null
}
