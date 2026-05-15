// Finn — the fishing rival.
//
// All dialogue, line pools, tier definitions, and progression milestones
// live in this file. Edit text here freely — the encounter component and
// state machine read from these constants and don't care about the words.
//
// Backstory in short: Finn appears as a cocky young rival. He's actually
// an old man in disguise whose son Marl died chasing a fish in the
// Ancient Deep forty years ago. He's been wandering the docks since,
// looking for someone worthy of being trained. The reveal lands when the
// player catches their first Ancient Deep trophy.

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
 *  These reveal WHO Finn is (lore, backstory). */
export const FINN_ENCOUNTER_BEATS: FinnBeat[] = [
  {
    id: 'e1', milestone: 1, track: 'encounter',
    lines: [
      "Easy there. Been watching you reel them in for a while now.",
      "Name's Finn. Been fishing these waters longer than you'd think.",
      "You're decent. But decent's not the same as good. Want to find out which one you are?",
    ],
  },
  {
    id: 'e3', milestone: 3, track: 'encounter',
    lines: [
      "Back already? Good. Don't take that as a compliment.",
      "...fast reflexes. Haven't seen anyone move like that in a long time.",
    ],
  },
  {
    id: 'e5', milestone: 5, track: 'encounter',
    lines: [
      "There are fish out here that aren't in your collection. Ancient ones.",
      "Most fishermen pretend they don't exist. Easier than admitting some things are out of reach.",
      "Pick a side — take the challenge or move along.",
    ],
  },
  {
    id: 'e8', milestone: 8, track: 'encounter',
    lines: [
      "Ever heard of the Ancient Deep? Course not. Most fishermen pretend it doesn't exist.",
      "Below your trench. Below your abyss. Where the water turns the color of ink, and the bottom drops past where light bothers to follow.",
    ],
  },
  {
    id: 'e12', milestone: 12, track: 'encounter',
    lines: [
      "The creatures down there move slow. Patient. They've been swimming those depths longer than anything you'd recognize.",
      "I saw one once. Forty years ago.",
      "It hooked me more than I hooked it.",
    ],
  },
  {
    id: 'e15', milestone: 15, track: 'encounter',
    lines: [
      "I had a fishing partner who used to chase the depths. Better than I'll ever be.",
      "Knew the water like it was a language he was raised to speak.",
    ],
  },
  {
    id: 'e20', milestone: 20, track: 'encounter',
    lines: [
      "Hooked it for thirty seconds. Line snapped like it was nothing.",
      "I can still feel the weight.",
      "...the weight wasn't the fish.",
    ],
  },
  {
    id: 'e25', milestone: 25, track: 'encounter',
    lines: [
      "After the line broke, he went after it. Said it couldn't have gotten far.",
      "Cold morning. The kind where the water doesn't move.",
      "I haven't fished the Ancient Deep since.",
    ],
  },
  {
    id: 'e30', milestone: 30, track: 'encounter',
    lines: [
      "Tell yourself the deep's no different from anywhere else if you want. The deep knows otherwise.",
      "Some waters take more than they give. You learn which ones.",
    ],
  },
  {
    id: 'e32', milestone: 32, track: 'encounter',
    lines: [
      "When you've been at this as long as I have, you stop hooking. You start listening.",
      "Water tells you when a fish is coming. Tells you what it is.",
      "Don't waste your years on a slow lesson.",
    ],
  },
  {
    id: 'e35', milestone: 35, track: 'encounter',
    lines: [
      "Have you fished the Ancient Deep? I mean really, not the edges.",
      "...forget it. Take the bet or leave it.",
    ],
  },
  {
    id: 'e37', milestone: 37, track: 'encounter',
    lines: [
      "There's a steadiness in you. You're sloppy as hell, but there's a steadiness underneath.",
      "Reminds me of someone. Don't ask.",
    ],
  },
  {
    id: 'e39', milestone: 39, track: 'encounter',
    lines: [
      "He had a cast like yours. Patient on the entry. Mean on the pull.",
      "Last thing I remember — line going slack the wrong way. Wind picking up.",
      "I knew before I saw.",
    ],
  },
]

/** Win-track beats — fire when finn_wins crosses milestone.
 *  These reveal HOW Finn feels about the player (relationship arc). */
export const FINN_WIN_BEATS: FinnBeat[] = [
  {
    id: 'w1', milestone: 1, track: 'win',
    lines: ["Hmph. Beginner's luck. Don't get used to it."],
  },
  {
    id: 'w3', milestone: 3, track: 'win',
    lines: [
      "Twice now. Twice.",
      "...alright. You've got something. Don't blow it.",
    ],
  },
  {
    id: 'w5', milestone: 5, track: 'win',
    lines: [
      "Five times. Fine — maybe you're not completely useless.",
      "Don't let it go to your head. Plenty of water still in this ocean.",
    ],
  },
  {
    id: 'w8', milestone: 8, track: 'win',
    lines: [
      "You're getting faster. I've noticed.",
      "Most folks can't beat me twice. You've done it eight.",
    ],
  },
  {
    id: 'w10', milestone: 10, track: 'win',
    lines: [
      "Someone taught me to fish when I was small. He'd say 'the fish don't owe you a thing, Finn. Patience and a steady hand.'",
      "Took me half a lifetime to understand what he meant.",
      "...you're already halfway there.",
    ],
  },
  {
    id: 'w12', milestone: 12, track: 'win',
    lines: [
      "Where'd you learn to read the water like that? You don't move like an inland kid.",
      "...don't answer. I like the mystery.",
    ],
  },
  {
    id: 'w15', milestone: 15, track: 'win',
    lines: [
      "My father was a clerk. Boring as a flat sea.",
      "I took to the water to get away from his desk. Never looked back.",
    ],
  },
  {
    id: 'w18', milestone: 18, track: 'win',
    lines: [
      "Two anglers walk into a tavern. One catches a fish. The other's me.",
      "...you laughed. I was worried about you.",
    ],
  },
  {
    id: 'w20', milestone: 20, track: 'win',
    lines: [
      "Had a fishing partner once. Better than me. Way better.",
      "Patient on the entry. Mean on the pull. Just like you, oddly enough.",
    ],
  },
  {
    id: 'w22', milestone: 22, track: 'win',
    lines: [
      "We fished together for ten years. The same routes. The same silences.",
      "When you spend ten years in silence with someone, words stop being the point.",
    ],
  },
  {
    id: 'w25', milestone: 25, track: 'win',
    lines: [
      "He's gone. Went down in the Ancient Deep forty years back.",
      "...this one's harder to talk about. Take the bet or don't.",
    ],
  },
  {
    id: 'w28', milestone: 28, track: 'win',
    lines: [
      "You remind me of him. Same look when you lock in on a perfect — like the water just slowed down for you.",
      "Used to drive me crazy. Now I find I miss it.",
    ],
  },
  {
    id: 'w30', milestone: 30, track: 'win',
    lines: [
      "Thirty wins. Most people don't last thirty casts.",
      "...I'm not gonna call you my equal. But I'll stop calling you 'kid.'",
      "Use it sparingly.",
    ],
  },
  {
    id: 'w33', milestone: 33, track: 'win',
    lines: [
      "Trick about the deep zones: don't pull at the bite. Pull at the breath right after.",
      "Fish have to recover. Hit them in the recovery and they can't run.",
      "...not that I'm telling you.",
    ],
  },
  {
    id: 'w36', milestone: 36, track: 'win',
    lines: [
      "All this time on the water. Alone.",
      "I always told myself the quiet was the best part.",
      "Lately I'm not so sure.",
    ],
  },
  {
    id: 'w40', milestone: 40, track: 'win',
    lines: [
      "Forty wins. You actually managed to learn something from me without me admitting I was teaching.",
      "Don't get cocky. I might've been letting some slide.",
    ],
  },
]

/** The reveal — fires on the next Finn encounter after the player catches
 *  their first Ancient Deep trophy. Supersedes any pending normal beats. */
export const FINN_REVEAL_BEAT: FinnBeat = {
  id: 'reveal', milestone: 0, track: 'reveal',
  lines: [
    "...you did it.",
    "First trophy out of the Ancient Deep. You actually did it.",
    "I should tell you something. Sit down.",
    "The face you've been arguing with — it's a costume. Has been since the first day I saw you on the dock.",
    "Easier to taunt a stranger than to train one for what lives down there.",
    "My fishing partner. The one I told you about.",
    "He wasn't my partner. He was my son. His name was Marl.",
    "He was twenty-three when the deep took him. Forty years ago this winter.",
    "I've spent every year since looking for someone who fishes the way he did. Who reads the water the way he did.",
    "It's not you. You're not him.",
    "But you're the closest I've ever found.",
    "Keep fishing the deep. Bring something back from it. For both of us.",
    "And if you ever feel the line snap wrong — you walk away. Promise me that.",
    "...I'll be around. Just not in the costume.",
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
  "That'll teach you to listen to old men.",
]

// ─── Epilogue pools (post-reveal) ────────────────────────────────────────────

/** Replaces FINN_OFFER_LINES once player has seen the reveal. */
export const FINN_EPILOGUE_OFFER_LINES: string[] = [
  "Back at it. Good.",
  "Got another bet for you. Same rules. Pick it up or leave it.",
  "...you've been to the deep again, haven't you? I can see it on you.",
  "Sit. Take the bet. Or don't. Old men have time.",
  "How's the deep treating you?",
  "Bait's on me today. Metaphorically.",
]

/** Replaces FINN_WIN_LINES post-reveal. */
export const FINN_EPILOGUE_WIN_LINES: string[] = [
  "Well done. You're getting good at this.",
  "Marl would've liked you.",
  "...don't let it go to your head. There's still water you haven't fished.",
  "Forty years I've waited for someone to say 'I got one' and mean it. You said it.",
  "Easy as breathing for you now, isn't it?",
]

/** Replaces FINN_LOSS_LINES post-reveal. */
export const FINN_EPILOGUE_LOSS_LINES: string[] = [
  "Hmph. Not your day.",
  "Tomorrow's tomorrow.",
  "Even Marl missed his share. Don't take it personal.",
  "The deep's patient. So am I.",
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

/** Rare lore drops — fires occasionally instead of a normal offer line. */
export const FINN_EPILOGUE_LORE_LINES: string[] = [
  "Marl used to chase a sturgeon for three summers running. Never landed it. Grinned like an idiot every time it broke the line.",
  "I burned his nets when he didn't come back. Stupid thing to do.",
  "Sometimes I think the deep knows my name. Hopes I'll stop showing up. Sorry, deep — not yet.",
  "You ever wonder if the fish remember? I do.",
  "Forty winters. Forty. And here I am still trying to talk a stranger into another bet.",
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
