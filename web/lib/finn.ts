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

/**
 * HE DOES NOT AMBUSH CASTS ANY MORE. Zero, deliberately.
 *
 * Finn now stands out on the chart and you sail to him — lib/seaFinn.ts for
 * where, app/(app)/sea/finnActions.ts for what happens when you get there. Both
 * Finns read and write the same four columns (finn_encounters, finn_wins,
 * finn_seen_beats, finn_revealed), so leaving the old 2% roll live would mean
 * the story advancing in two places: sail three thousand pixels for the next
 * beat, and find the fishing screen had already spent it on a cast.
 *
 * The roll sites in FishingGame are left standing rather than cut out, because
 * that screen is being retired wholesale (its four catch-time moments still
 * need porting first) and gutting a file on its way out is how you break the
 * thing you were about to delete. `Math.random() < 0` is never true, so both
 * sites are already dead; they go when the page does.
 */
export const FINN_ENCOUNTER_RATE = 0

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

/**
 * ── WHERE YOU STAND WITH HIM ────────────────────────────────────────────────
 *
 * The regulars have rapport; he has STANDING, and the difference is the point.
 * You are not befriending Finn. You are earning his attention, which he gives
 * grudgingly and takes back the moment you stop turning up.
 *
 * DERIVED, NEVER STORED. `finn_encounters` and `finn_wins` have both been
 * written since long before the friendship system existed, and they are exactly
 * the two things the player does with him: turn up, and take his bets. A second
 * counter would be a second source of truth for a fact the database already
 * holds twice over.
 *
 * A win is worth two meetings. Taking a bet and landing it costs a hunt for the
 * streak on top of the sail out, and it is the only thing he actually respects.
 *
 * The tiers are named as a rivalry rather than a friendship, and the ladder is
 * his arc in five words: he starts by not knowing which angler you are and ends
 * one rung short of calling you his equal, which is the exact thing he says he
 * will never do.
 */
export const FINN_STANDING_NAME = [
  'Another angler',
  'Worth watching',
  'Worth betting against',
  'Worth teaching',
  'Nearly his equal',
] as const

export const FINN_STANDING_AT = [0, 3, 8, 16, 28] as const

/** Meetings, plus two for every bet you have taken off him. */
export function finnStanding(encounters: number, wins: number): number {
  return Math.max(0, encounters) + Math.max(0, wins) * 2
}

export function finnStandingTier(points: number): 0 | 1 | 2 | 3 | 4 {
  for (let t = 4; t >= 1; t--) if (points >= FINN_STANDING_AT[t]) return t as 1 | 2 | 3 | 4
  return 0
}

/** Points to the next rung, or null once there is no rung left. */
export function finnToNext(points: number): number | null {
  const t = finnStandingTier(points)
  return t === 4 ? null : FINN_STANDING_AT[t + 1] - points
}

export type FinnTrack = 'encounter' | 'win' | 'reveal'

/** One line of Finn dialogue with cinematic staging — shared by the encounter /
 *  win / reveal beats AND the ancient-catch cutscenes. A typed line, an optional
 *  silence held BEFORE it, and an optional frame effect for when the mask
 *  flickers. `*word*` is rendered in his accent colour. */
export interface FinnSceneLine {
  text: string
  /** Silence held BEFORE the line types — a beat, not a sentence. ms. */
  pause?: number
  /** 'flash' blows the frame out (the mask flickering); 'shake' rocks it. */
  fx?: 'flash' | 'shake'
}

export interface FinnBeat {
  /** Stable string ID — recorded in profile.finn_seen_beats so each beat fires
   *  exactly once per player. Don't rename existing IDs; players who've
   *  already seen them will re-see them. */
  id: string
  /** Threshold the player must reach for this beat to be eligible. */
  milestone: number
  track: FinnTrack
  /** Cinematic dialogue — one screen per entry, played with a typewriter,
   *  timed pauses, italic emphasis, and the occasional mask-flicker. */
  lines: FinnSceneLine[]
}

/** Encounter-track beats — fire when finn_encounters crosses milestone.
 *  Early beats are PURE rival. Later ones quietly circle the Ancient Deep
 *  and let the smallest cracks show. He never explains himself. */
export const FINN_ENCOUNTER_BEATS: FinnBeat[] = [
  {
    id: 'e1', milestone: 1, track: 'encounter',
    lines: [
      { text: "Easy, now. Reel it in slow.", pause: 350 },
      { text: "I've been watching that line of yours the better part of an hour. A line never lies about the hand on the far end of it." },
      { text: "Finn. There's not a current on this whole coast I haven't read, and I've watched a hundred anglers strut down this dock and wash back up it empty." },
      { text: "Yours sits different in the water. *Promise*, some would call it. Cheap word.", pause: 300 },
      { text: "Let's see what the deep makes of you." },
    ],
  },
  {
    id: 'e3', milestone: 3, track: 'encounter',
    lines: [
      { text: "Back already.", pause: 300 },
      { text: "Didn't take you for the stubborn kind. Good. The water eats the other kind alive." },
      { text: "Quick hands. I'll grant you that much, and not one word more." },
    ],
  },
  {
    id: 'e5', milestone: 5, track: 'encounter',
    lines: [
      { text: "There's water past the edge of every chart you own. *Old* water.", pause: 350 },
      { text: "The fish down there would take your finest trophy for a minnow and swim off still hungry." },
      { text: "Most anglers swear it isn't real. Easier than admitting it's simply out of their reach." },
      { text: "Take the bet. Let's find out if it's out of yours." },
    ],
  },
  {
    id: 'e8', milestone: 8, track: 'encounter',
    lines: [
      { text: "The Ancient Deep.", pause: 500 },
      { text: "Past your trench, past your abyss, where the water turns to ink and the seafloor forgets to stop falling." },
      { text: "Six things worth the pulling live down there. Six. Not five. Not seven.", pause: 300 },
      { text: "Funny, the numbers a captain finds himself counting in the dark." },
    ],
  },
  {
    id: 'e12', milestone: 12, track: 'encounter',
    lines: [
      { text: "I've stood at the lip of that deep more nights than I would ever admit to you.", pause: 300 },
      { text: "Dropped a line straight down into the black. Every time, nothing. Like the water just hands it back up, polite as you please." },
      { text: "Some doors only open for the right grip.", pause: 350 },
      { text: "Mine has never once been it." },
    ],
  },
  {
    id: 'e15', milestone: 15, track: 'encounter',
    lines: [
      { text: "A hundred anglers I've watched come down this dock. You're the hundred and first." },
      { text: "The rest were all noise. You're quieter. Steadier.", pause: 300 },
      { text: "The water doesn't seem to mind you. I've learned to pay mind when it doesn't." },
    ],
  },
  {
    id: 'e20', milestone: 20, track: 'encounter',
    lines: [
      { text: "Hooked something down there, once. Held it a full thirty seconds.", pause: 300 },
      { text: "Then the line went slack. Slow. Gentle. Like the deep was handing it back on *purpose*." },
      { text: "Like it knew whose hands were on the rod, and decided no.", pause: 400 },
    ],
  },
  {
    id: 'e25', milestone: 25, track: 'encounter',
    lines: [
      { text: "All six trophies. Landed by a single pair of hands.", pause: 300 },
      { text: "You've any notion what that's worth? What a thing like that would *open*?" },
      { text: "...course you don't. Keep fishing. You will." },
    ],
  },
  {
    id: 'e30', milestone: 30, track: 'encounter',
    lines: [
      { text: "Some waters take more than they ever give back." },
      { text: "The Ancient Deep takes *everything*. Everything but the worthy.", pause: 350 },
      { text: "So be worthy. And be quick about it. I've done enough waiting for one lifetime." },
    ],
  },
  {
    id: 'e32', milestone: 32, track: 'encounter',
    lines: [
      { text: "Long enough at this trade, you quit hooking. You start *listening*.", pause: 300 },
      { text: "The water tells you what's coming up the line. Tells you exactly what it is, if you shut your mouth and let it." },
    ],
  },
  {
    id: 'e35', milestone: 35, track: 'encounter',
    lines: [
      { text: "Have you touched the Ancient Deep yet? Truly touched it. Not paddled the shallows of it.", pause: 350 },
      { text: "...no. You haven't.", pause: 300 },
      { text: "I'd know. I always know. Take the bet, then. Off with you." },
    ],
  },
  {
    id: 'e37', milestone: 37, track: 'encounter',
    lines: [
      { text: "There's a steadiness in you, under all that mess. That's the rare part." },
      { text: "That's the part I've been looking f...", pause: 250, fx: 'flash' },
      { text: "...the part worth *beating*. Forget I said it. Cast." },
    ],
  },
  {
    id: 'e39', milestone: 39, track: 'encounter',
    lines: [
      { text: "You're the closest anyone has ever come. Closer than you would believe." },
      { text: "Pull up all six, and we'll both finally see what they're good for." },
      { text: "...*we*.", pause: 350, fx: 'flash' },
      { text: "Slip of an old tongue. Cast your line." },
    ],
  },
]

/** Win-track beats — fire when finn_wins crosses milestone.
 *  His grudging respect grows, but his real interest stays fixed on whether
 *  you can reach the Deep he can't. */
export const FINN_WIN_BEATS: FinnBeat[] = [
  {
    id: 'w1', milestone: 1, track: 'win',
    lines: [
      { text: "Hmph. Beginner's luck.", pause: 250 },
      { text: "Don't go framing it." },
    ],
  },
  {
    id: 'w3', milestone: 3, track: 'win',
    lines: [
      { text: "Twice now. *Twice.*", pause: 350 },
      { text: "...all right. The water didn't hand you that. You took it. Try not to waste a thing you're willing to take." },
    ],
  },
  {
    id: 'w5', milestone: 5, track: 'win',
    lines: [
      { text: "Five times. Maybe you're not completely useless after all.", pause: 250 },
      { text: "Don't let it swell your head. There's a whole ocean left, and most of it's meaner than me." },
    ],
  },
  {
    id: 'w8', milestone: 8, track: 'win',
    lines: [
      { text: "You're getting faster. I've noticed.", pause: 250 },
      { text: "I notice everything. It's cost me more sleep than I'd care to say." },
      { text: "Most folk can't take me twice. You've done it eight." },
    ],
  },
  {
    id: 'w10', milestone: 10, track: 'win',
    lines: [
      { text: "Patience, and a steady hand. That's the whole trade, start to finish." },
      { text: "Took me half a lifetime to learn it.", pause: 300 },
      { text: "You're picking it up fast. Almost *unfairly* fast." },
    ],
  },
  {
    id: 'w12', milestone: 12, track: 'win',
    lines: [
      { text: "Where'd you learn to read water like that? You don't move like some inland kid who wandered down to the docks." },
      { text: "...no. Don't answer.", pause: 300 },
      { text: "I'd rather wonder." },
    ],
  },
  {
    id: 'w15', milestone: 15, track: 'win',
    lines: [
      { text: "Where do *I* come from? Ha." },
      { text: "Nowhere you'll find inked on any chart you own.", pause: 300 },
      { text: "And we'll be keeping it that way." },
    ],
  },
  {
    id: 'w18', milestone: 18, track: 'win',
    lines: [
      { text: "Two anglers walk into a tavern. One of them catches a fish. The other one's me." },
      { text: "...you laughed.", pause: 300 },
      { text: "Good. I was starting to worry about you." },
    ],
  },
  {
    id: 'w20', milestone: 20, track: 'win',
    lines: [
      { text: "Patient on the entry. *Mean* on the pull. That's how a body fishes the deep, if the deep allows it." },
      { text: "And I'm starting to think it just might allow *you*." },
    ],
  },
  {
    id: 'w22', milestone: 22, track: 'win',
    lines: [
      { text: "I gave that deep ten years. Ten years of cold mornings, a slack line, and silence.", pause: 350 },
      { text: "You might wring more out of it in a single season than I got from every one of them." },
    ],
  },
  {
    id: 'w25', milestone: 25, track: 'win',
    lines: [
      { text: "The deep has taken things off me I don't put into words.", pause: 350 },
      { text: "Leave it where it lies. Take the bet, or don't." },
    ],
  },
  {
    id: 'w28', milestone: 28, track: 'win',
    lines: [
      { text: "That look you get, locking onto a perfect. Like the water slows itself down just for you.", pause: 300 },
      { text: "I've only ever seen it on the kind of angler who can go where I can't." },
    ],
  },
  {
    id: 'w30', milestone: 30, track: 'win',
    lines: [
      { text: "Thirty wins. Most anglers don't last thirty *casts*.", pause: 300 },
      { text: "...I won't call you my equal. But I'll quit calling you 'kid.'", pause: 250 },
      { text: "Spend that sparingly. I don't hand it out twice." },
    ],
  },
  {
    id: 'w33', milestone: 33, track: 'win',
    lines: [
      { text: "Trick to the deep zones: don't pull at the bite. Pull at the *breath* right after it." },
      { text: "A fish has to recover. Hit it in the recovery and it can't run.", pause: 300 },
      { text: "...not that I told you anything." },
    ],
  },
  {
    id: 'w36', milestone: 36, track: 'win',
    lines: [
      { text: "All these years working this dock. Waiting for the right line to come walking up it.", pause: 350 },
      { text: "Didn't quite believe it ever truly would." },
    ],
  },
  {
    id: 'w40', milestone: 40, track: 'win',
    lines: [
      { text: "Forty. You've taken everything I can teach you from up here on the dock." },
      { text: "The rest, only the deep can teach. So go down and take it.", pause: 400 },
      { text: "...for the both of us." },
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
    { text: "...you did it.", pause: 700 },
    { text: "First trophy up out of the Ancient Deep. In one piece. You actually *did* it.", pause: 300 },
    { text: "Listen to me. Whatever you think you're holding, you're holding less than half of it." },
    { text: "There are five more down there. Five. And I need every last one of them landed." },
    { text: "...*need*.", pause: 450 },
    { text: "Poor word, for a rival. Let's call it *want* and leave it there." },
    { text: "I have spent more of my life on that black water than I will ever tell you. Not once did it open for me. Not once.", pause: 400 },
    { text: "It's opening for you.", pause: 400, fx: 'flash' },
    { text: "So here's the new bet. The only one that ever mattered. You and me. All six." },
    { text: "I didn't come to this dock to fish, if you must know. I came to find someone who *could*.", pause: 350 },
    { text: "Took longer than I'd have liked. Don't ask me why. Just fish." },
  ],
}

// ─── Ancient-catch cutscenes (one per giant) ─────────────────────────────────
// A cinematic Finn beat plays right after each of the 6 Ancient Deep trophies is
// landed (see FinnScene.tsx, built on the shared cutscene kit). The FIRST giant a
// player lands also stands in for the old encounter "reveal" — it flips
// finn_revealed so his banter shifts to the epilogue pool, and it retires the
// FINN_REVEAL_BEAT so the mask never slips twice.
//
// Tone rules (canon — do NOT break): these are keyed by SPECIES, not by ordinal,
// and the five non-Megalodon giants can be caught in ANY order, so none of them
// may count ("your fifth", "one to go") or assume what came before. Each is a
// per-giant reaction with a FAINT wrongness under the rivalry — he knows these
// creatures too well, he is too invested, small slips of "me / I" leak through.
// He never says he is using the player and never names the Finndicate. Megalodon
// (id 143) is ALWAYS last (server-gated behind the other five), so its beat is the
// one real crack: the rival act drops for a breath and something older shows,
// then he covers it. Full reveal stays for the end-game merge.
export interface FinnAncientBeat {
  /** Scene color temperature. Warm amber = the rival. Megalodon runs cold. */
  accent?: string
  /** Final button label. Defaults to "Back to the water". */
  ctaLabel?: string
  lines: FinnSceneLine[]
}

const FINN_AMBER = '#c8a060'

export const FINN_ANCIENT_BEATS: Record<number, FinnAncientBeat> = {
  // 144 — Plesiosaurus
  144: {
    accent: FINN_AMBER,
    lines: [
      { text: "The long-neck. *Plesiosaurus.* I have watched that thing take a rig and swim off like it felt nothing.", pause: 300 },
      { text: "It let you land it. Sat in your hands like it decided to." },
      { text: "The deep does not just decide. Not for most of us.", pause: 400 },
      { text: "Hm. Go on, then." },
    ],
  },
  // 145 — Dunkleosteus
  145: {
    accent: FINN_AMBER,
    lines: [
      { text: "*Dunkleosteus.* A jaw like a ship's prow, older than the first keel that ever cut this water.", pause: 300 },
      { text: "I hooked it once. It took my line and left me the story. That is all it has ever left anyone." },
      { text: "It handed you the whole fish. I would sit a while with why.", pause: 400 },
      { text: "...or do not. Just keep pulling them up." },
    ],
  },
  // 146 — Mosasaurus
  146: {
    accent: FINN_AMBER,
    lines: [
      { text: "*Mosasaurus.* The sea-dragon every old chart drew a hard border around.", pause: 250 },
      { text: "Turns out that border was the only honest ink on the page." },
      { text: "Every soul who chased these is a name cut in stone now. Every one but you.", pause: 400 },
      { text: "That was never luck. Luck drowned a long way back. You are something the water wants." },
    ],
  },
  // 147 — Basilosaurus
  147: {
    accent: FINN_AMBER,
    lines: [
      { text: "The *Basilosaurus.* It swam this water before there was a single soul alive to fear it.", pause: 300 },
      { text: "I have wanted to look one of these in the eye my whole life. Never once got the chance." },
      { text: "And here it lies on your deck, dripping like a market cod.", pause: 400 },
      { text: "Sits wrong, does it not. ...Good. It ought to." },
    ],
  },
  // 148 — Shastasaurus
  148: {
    accent: FINN_AMBER,
    lines: [
      { text: "*Shastasaurus.* The largest thing that ever drew breath in salt water, and it is on your hook.", pause: 300 },
      { text: "The others all swore these were stories. Easier than admitting they were out of reach." },
      { text: "They were never out of yours. The deep keeps handing you what it kept from me.", pause: 450 },
      { text: "...from everyone. So keep pulling, captain. I mean to see just how far those hands of yours can reach." },
    ],
  },
  // 143 — Megalodon (ALWAYS last — the crack)
  143: {
    accent: '#7d9aa8', // cold steel, wrong against his usual warmth
    ctaLabel: 'Back to the water',
    lines: [
      { text: "...*Megalodon.*", pause: 700 },
      { text: "The last one. The one all the others were only ever leading up to.", pause: 300 },
      { text: "All six. In a single pair of hands." },
      { text: "Do you have any notion what you have just finished building?", pause: 350 },
      { text: "Years I stood at that black water, and it would not open for me. Not one inch. And you...", pause: 500 },
      { text: "You were exactly what it was waiting for. Exactly what *I* was waiting for.", pause: 200, fx: 'flash' },
      { text: "...", pause: 700 },
      { text: "Never mind. Old rivals get sentimental.", pause: 300 },
      { text: "Go on. Enjoy your wall of monsters." },
    ],
  },
}

/** The Finn beat to play after landing this Ancient trophy, or null. */
export function finnAncientBeat(fishId: number): FinnAncientBeat | null {
  return FINN_ANCIENT_BEATS[fishId] ?? null
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

/**
 * The next unseen encounter-track beat, or null once he has said them all.
 *
 * ── ONE MEETING, ONE BEAT ──────────────────────────────────────────────
 *
 * `milestone` no longer gates this track, and `encounters` is no longer read.
 * It used to be both, because Finn arrived on a 2% roll per cast and the story
 * had to be rationed against a firehose — thirteen beats spread over thirty-nine
 * ambushes so he did not tell you his whole life in one session.
 *
 * On the chart he is somewhere you sail to (lib/seaFinn.ts). Finding him is now
 * the cost, and it is a real one, so rationing on top of it would mean crossing
 * the Abyss to be told "Same again?" — the trip earns the story, and the story
 * is what should be waiting at the end of it.
 *
 * ── AND IT WALKS FORWARD NOW ───────────────────────────────────────────
 *
 * The old version searched BACKWARD for the highest unlocked unseen beat, which
 * quietly meant a player who arrived at a milestone with earlier beats unseen
 * would skip them permanently. That never bit, because encounters only ever go
 * up by one and every beat was collected on the way past — verified against the
 * live table: all 28 players who have met him have exactly the beats their
 * high-water mark implies, no gaps. Walking forward is identical for them and
 * repairs the case rather than skipping it.
 */
export function findNextEncounterBeat(
  seenBeats: readonly string[],
): FinnBeat | null {
  const seen = new Set(seenBeats)
  return FINN_ENCOUNTER_BEATS.find(b => !seen.has(b.id)) ?? null
}

/** The next unseen win-track beat, or null. Fires when a challenge is won —
 *  his reaction is either this beat's lines or a generic win line.
 *
 *  Same change as the encounter track above: one WIN, one beat, rather than a
 *  milestone ladder up to 40. Winning a bet already costs a hunt for Finn plus
 *  the challenge itself, and gating story behind a second counter on top of
 *  that put the last win beat further away than any player has ever reached —
 *  the high-water mark on the live table is 61 wins against a 40 milestone, and
 *  two players out of 81 have ever reached the end of it. */
export function findNextWinBeat(
  seenBeats: readonly string[],
): FinnBeat | null {
  const seen = new Set(seenBeats)
  return FINN_WIN_BEATS.find(b => !seen.has(b.id)) ?? null
}
