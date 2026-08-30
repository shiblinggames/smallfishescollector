// ── WHAT YOU OVERHEAR IN THE TAVERN ─────────────────────────────────────────
//
// Plain module, NOT 'use server' - every export here is data and that directive
// silently drops non-async exports.
//
// ── WHY GOSSIP AND NOT A TIP BOX ────────────────────────────────────────────
//
// The game has a lot of systems and almost no way to find out they exist. A
// forge, a bunkhouse, weekly puzzles, a man in the deepest water selling a rod
// no shop stocks: all of them are reachable and none of them announce
// themselves. The obvious fix is a hints panel, and a hints panel is a manual.
// Nobody reads a manual, and worse, it tells a player the game is a system
// rather than a place.
//
// What a TAVERN can do that a hints panel cannot is let you overhear. A half
// caught sentence at the next table is the same information wearing clothes:
// you learn the forge exists from somebody who is impressed by it, which is
// also the only honest reason to care.
//
// ── THE RULES THESE LINES FOLLOW ────────────────────────────────────────────
//
// 1. NOBODY IS TALKING TO YOU. No second person instructions, no "you should",
//    no "head to the". These are people talking to each other and you are
//    holding a drink nearby. The moment a line addresses the player it stops
//    being gossip and becomes a tooltip with a costume on.
//
// 2. EVERY FACTUAL LINE IS TRUE. A rumour that is wrong is worse than no
//    rumour: it costs somebody an evening and it teaches them not to listen.
//    Vague is allowed, wrong is not. Where a number would date badly ("one in
//    a hundred") the line says roughly instead.
//
// 3. NO NUMBERS THAT LIVE IN CODE. Prices, rates and level gates get retuned
//    and these lines would not move with them. "Costs a fortune" survives a
//    rebalance; "costs 100 gems" becomes a lie the next time somebody edits a
//    constant.
//
// 4. SOME OF IT IS JUST TALK. A room where every sentence is useful is a
//    briefing. Roughly a third of these carry nothing at all, because that is
//    what makes the other two thirds sound like they were not written for you.
//
// 5. THE NINE REGULARS ARE SUBJECTS, NEVER SPEAKERS. Meg, Pell, Marlow, Fitch,
//    Nance, Yoon, Tam, Cass and Rue keep to the water. Being talked about in
//    here while being findable out there is the point; putting them at the bar
//    would undo the whole reason they are worth sailing to.
//
// 6. NO EM DASHES. House rule, enforced by scripts/check-copy.

export type Overheard = {
  /** One fragment, or a snatch of back and forth. Two voices at most: three is
   *  a scene, and a scene is something you watch rather than overhear. */
  say: string[]
  /** Where in the room it drifts over from. Sets the voice without naming
   *  anybody, which keeps the cast of the tavern infinite and free. */
  from: string
}

export const GOSSIP: Overheard[] = [
  // ── THE FORGE, THE BENCH, THE SHIP ────────────────────────────────────
  {
    say: ["I heard there's a forge out there that melts two bits of raid loot into one better one.",
          "Melts. So you lose both?", "You lose both."],
    from: 'two tables over',
  },
  {
    say: ["There's a bench somewhere that takes a good item and makes it a great one. Takes a day and it isn't cheap."],
    from: 'the long table',
  },
  {
    say: ["Whole gunwharf up past the reef now. That's where they keep the ship.",
          "Keep it? I thought you just sailed it."],
    from: 'by the fire',
  },
  {
    say: ["Fishing boat won't go past the sortie. Won't and can't. They tell you at the gate."],
    from: 'somewhere behind you',
  },
  {
    say: ["Man came in last week with a hull that does near double the speed of mine. Would not say what he paid."],
    from: 'the bar',
  },
  {
    say: ["Every raid item you own has to be mounted before you sail or it may as well be in a drawer."],
    from: 'a table of deckhands',
  },

  // ── FISHING ───────────────────────────────────────────────────────────
  {
    say: ["Gold band on the dial. Not the green. The gold.",
          "And if you miss it?", "Then you caught a fish like everybody else."],
    from: 'the next booth',
  },
  {
    say: ["Bait's not decoration. Right worm and they're on the hook before you've settled."],
    from: 'over the top of a tankard',
  },
  {
    say: ["Sell to the buyer out in the zone and he takes his cut. Sail it home to the market and you get the lot.",
          "Sailing home takes an hour.", "Then that's what your hour is worth."],
    from: 'two tables over',
  },
  {
    say: ["Water goes different colours the further out you get. That's not the light. That's how deep you are."],
    from: 'under the window',
  },
  {
    say: ["Patches of water where they're practically jumping in. Moves about. Never in the same place twice."],
    from: 'the corner nobody sits in',
  },
  {
    say: ["He measured it. Wrote the length down and everything.",
          "Was it big?", "It was the biggest one he'd caught. That's all a record is."],
    from: 'the long table',
  },
  {
    say: ["Hook does the holding, reel does the hauling, rod does the rest. People buy them in the wrong order."],
    from: 'the bar',
  },
  {
    say: ["Chain enough perfect casts together and something changes. I've never managed more than four."],
    from: 'somewhere behind you',
  },

  // ── CREW ──────────────────────────────────────────────────────────────
  {
    say: ["Crew sat on a bench earn nothing. Crew sat in a bunk at the hall come out better than they went in."],
    from: 'the long table',
  },
  {
    say: ["Send them out on a trawl and they fish while you're not even here.",
          "And they just hand it over when they're back?", "They hand it over."],
    from: 'two tables over',
  },
  {
    say: ["Lost two on the deep route last month.",
          "Lost?", "Lost. They don't come back from that one."],
    from: 'by the fire',
  },
  {
    say: ["Fortune's the one that keeps them alive. Enough of it and the route stops being able to take anybody."],
    from: 'the next booth',
  },
  {
    say: ["Everyone talks about power. Power decides how it went. Fortune decides what you brought home."],
    from: 'a table of deckhands',
  },
  {
    say: ["Skipper I know runs the same four hands every voyage and won't hear a word about swapping."],
    from: 'the stairs',
  },

  // ── EXPEDITIONS ───────────────────────────────────────────────────────
  {
    say: ["One voyage in a hundred comes back loaded. Properly loaded. I've seen it once."],
    from: 'over the top of a tankard',
  },
  {
    say: ["Board up at the charterhouse posts where they're going. Read it before you sign anything."],
    from: 'the bar',
  },
  {
    say: ["Gauntlet's one run a day and it does not care how good you think you are.",
          "You go again after?", "You go again tomorrow."],
    from: 'the corner nobody sits in',
  },
  {
    say: ["There's a harder version of it where the dead stay dead.",
          "Why would anybody.", "Pays in something you can't get anywhere else."],
    from: 'by the fire',
  },
  {
    say: ["Raid turns halfway through and the sea itself starts interfering. Nobody warns you the first time."],
    from: 'the next booth',
  },
  {
    say: ["Board of bounties opens once you've put a chapter behind you. Pays every single day after that."],
    from: 'somewhere behind you',
  },
  {
    say: ["End of a chapter they make you choose what kind of ship she is. You don't get to change your mind."],
    from: 'the long table',
  },

  // ── THE ISLANDS AND WHAT IS ON THEM ───────────────────────────────────
  {
    say: ["Rocks out there you can actually land on. Half of them have something buried."],
    from: 'a table of deckhands',
  },
  {
    say: ["You need the bearing first. No bearing, no dig, doesn't matter how long you stand there with a shovel."],
    from: 'two tables over',
  },
  {
    say: ["Bottles wash up with bits of writing in them. I've got four and they're clearly one story."],
    from: 'under the window',
  },
  {
    say: ["Chart room does a new set of puzzles every week. Solving them fills the map in.",
          "Fills it in with what?", "Places. And they pay for the ones you find."],
    from: 'the bar',
  },
  {
    say: ["Homestead's yours to build on. Mine's still mostly weeds."],
    from: 'the stairs',
  },
  {
    say: ["Tally house posts the day's orders. Three of them, and they reset overnight."],
    from: 'the next booth',
  },

  // ── THE PEOPLE ON THE WATER ───────────────────────────────────────────
  {
    say: ["Have you talked to Finn before?", "Once.", "Full of himself, isn't he."],
    from: 'two tables over',
  },
  {
    say: ["Finn'll give you work. He'll also make sure you know he's doing you a favour."],
    from: 'the corner nobody sits in',
  },
  {
    say: ["Meg's been on that scale thirty years. She knows exactly who you are and she won't say."],
    from: 'by the fire',
  },
  {
    say: ["Bent Pell was short with me.",
          "Pell's short with everybody. It genuinely isn't personal."],
    from: 'the long table',
  },
  {
    say: ["Old Marlow hasn't moved in years. Sits out in the deep and lets the sea come past him."],
    from: 'under the window',
  },
  {
    say: ["Quiet Fitch said three words to me and I've thought about all three since."],
    from: 'somewhere behind you',
  },
  {
    say: ["Grey Nance keeps the count of who goes down to the oldest water and comes back up.",
          "And the ones who don't?", "She keeps that count too."],
    from: 'the next booth',
  },
  {
    say: ["Yoon's got a rod no shop will ever stock. Getting him to part with it is the hard bit."],
    from: 'the bar',
  },
  {
    say: ["Tam Brill's two seasons out and thinks the rest of us are legends. Nobody's had the heart to tell him."],
    from: 'a table of deckhands',
  },
  {
    say: ["Cass Turbot dives the wrecks and comes back with stories.",
          "Are they true?", "Some of them."],
    from: 'the stairs',
  },
  {
    say: ["Rue Bream knows everything about everybody out there and remembers all of it. Be nice to Rue."],
    from: 'two tables over',
  },
  {
    say: ["Turn up to the same person day after day and they start talking to you differently. Takes months."],
    from: 'by the fire',
  },
  {
    say: ["They've each got a fish they love. Bring them that one and it's worth a week of turning up."],
    from: 'the long table',
  },
  {
    say: ["Doby and Kat walked me through my first cast. Still don't know which of them was in charge."],
    from: 'the next booth',
  },

  // ── THE ROOM ITSELF, AND THE DEN ──────────────────────────────────────
  {
    say: ["Den's through the town. Chips only, and there's a limit on what you can buy in a day.",
          "Probably for the best."],
    from: 'the bar',
  },
  {
    say: ["Slots have a pot that just keeps growing until somebody hits it. Been growing a while."],
    from: 'the corner nobody sits in',
  },
  {
    say: ["Parlour runs the questions of a night. Whoever answers most goes up on the board."],
    from: 'somewhere behind you',
  },
  {
    say: ["First one past the post takes it. Doesn't matter how close second was."],
    from: 'a table of deckhands',
  },
  {
    say: ["Come in every day and they give you something. Not much. But every day."],
    from: 'the stairs',
  },

  // ── PROGRESSION, GENTLY ───────────────────────────────────────────────
  {
    say: ["Start over once you've topped out and everything pays double after.",
          "Start over.", "Start over. Some people have done it more than once."],
    from: 'the long table',
  },
  {
    say: ["Past the hundred it stops being levels and starts being something you spend."],
    from: 'under the window',
  },
  {
    say: ["He's got a rod he built himself, piece by piece. Took him the better part of a year."],
    from: 'two tables over',
  },
  {
    say: ["Badges for near enough everything. I've got one for a thing I did by accident."],
    from: 'the next booth',
  },

  // ── PURE TALK. No information, on purpose. ────────────────────────────
  {
    say: ["This is the third time this week they've watered it.",
          "You keep drinking it.", "I keep drinking it."],
    from: 'the bar',
  },
  {
    say: ["Weather's turning. You can smell it off the harbour."],
    from: 'by the fire',
  },
  {
    say: ["He named the boat after his mother.",
          "That's sweet.", "It is not. You should hear what he calls it in a squall."],
    from: 'the long table',
  },
  {
    say: ["Biggest thing I ever hooked snapped the line and I've been thinking about it for two years."],
    from: 'the corner nobody sits in',
  },
  {
    say: ["Price of worms. That's all I'm going to say about it. The price of worms."],
    from: 'somewhere behind you',
  },
  {
    say: ["She came in soaked, put a fish on the bar, and left. Nobody's touched it."],
    from: 'the stairs',
  },
  {
    say: ["I sailed four hours out and four hours back and caught two sardines.",
          "Good day then."],
    from: 'the next booth',
  },
  {
    say: ["There's a lad who moors at the same spot every morning and just sits there."],
    from: 'under the window',
  },
  {
    say: ["Never trust a captain whose boots are dry."],
    from: 'a table of deckhands',
  },
  {
    say: ["My hands haven't been warm since Tuesday."],
    from: 'the bar',
  },
  {
    say: ["He says he's seen the bottom.",
          "Nobody's seen the bottom.", "He says he's seen the bottom."],
    from: 'two tables over',
  },
  {
    say: ["If it's got teeth and it's bigger than the boat, cut the line. That's the whole of it."],
    from: 'by the fire',
  },
  {
    say: ["Whoever's been sleeping in the back room, we know. We all know."],
    from: 'the stairs',
  },
  {
    say: ["I've been out there a year and the sea has still not run out of places I haven't been."],
    from: 'the long table',
  },
  {
    say: ["Same story every time he tells it, except the fish gets longer."],
    from: 'the corner nobody sits in',
  },
  {
    say: ["Do not let him buy the next round. Trust me on this."],
    from: 'somewhere behind you',
  },
  {
    say: ["The quiet ones out on the water are the ones worth stopping for."],
    from: 'the next booth',
  },
  {
    say: ["Tide's wrong tonight. Don't ask me how I know."],
    from: 'under the window',
  },
  {
    say: ["Two of them came in arguing about a fish neither of them caught."],
    from: 'a table of deckhands',
  },
  {
    say: ["Every captain in here thinks they're one good haul from being comfortable."],
    from: 'the bar',
  },
  {
    say: ["He put his whole purse on the wheel.",
          "And?", "And he's behind you. Don't turn round."],
    from: 'by the fire',
  },
  {
    say: ["I like it out there at night. Everything's further away."],
    from: 'the stairs',
  },
  {
    say: ["You can hear the deep water before you're in it. Different sound off the hull."],
    from: 'two tables over',
  },
  {
    say: ["Nobody's beaten her time on that run. Nobody's come close."],
    from: 'the long table',
  },
  {
    say: ["Bought the hat. Regret nothing."],
    from: 'the next booth',
  },
]

/**
 * ── THE FACES ───────────────────────────────────────────────────────────────
 *
 * PEOPLE, drawn the way every other person in this game is drawn: the character
 * sprite in a disc with a hat on, which is what the crew list, the Salt Road
 * roster, the sea traders and your own profile all use. The first cut put FISH
 * in these discs and that was a category error. A fish is a thing you catch. The
 * tavern is full of the people who catch them.
 *
 * TWO SHORT PALETTES rather than the full wardrobe. The flashy unlocks (galaxy,
 * ethereal, gilded, lava) and the loud hats are left out on purpose: those are
 * things a captain EARNED, and putting them on an anonymous extra at the next
 * table cheapens them and makes the room look like a costume party. What is in
 * here is what ordinary people out on this sea wear.
 *
 * Thirteen colours against twelve hats is 156 patrons, which is more than
 * enough that the room never repeats a face inside a sitting.
 */
const PATRON_COLOURS = [
  'default', 'gray', 'blue', 'pink', 'sand', 'forest', 'autumn',
  'ruby', 'ice', 'storm', 'mint', 'lavender', 'sky',
] as const

/** `null` is bare headed, and it is in here as an option because a room where
 *  everybody owns a hat is a room where nobody does. */
const PATRON_HATS = [
  null, 'brown', 'gray', 'black', 'olive', 'offwhite',
  'green', 'blue', 'midnight', 'yellow', 'sky', 'purple',
] as const

/**
 * ONE FRAME FOR EVERY PATRON. The disc and the ring are the same warm lamplight
 * on all of them, so the variation reads as different PEOPLE rather than as
 * different badges: the regulars and your crew each carry their own colours
 * because they are somebody, and these are the room.
 */
export const PATRON_BG = '#171009'
export const PATRON_RING = '#8a6f42'

export type Face = { characterColor: string; hat: string | null }

export type Heard = Overheard & {
  /** The two speakers. Lines alternate between them, so a three line exchange
   *  is A, B, A. */
  faces: [Face, Face]
}

/** FNV-1a. Small, stable, and the same answer on the server and the client,
 *  which a hash built out of Math.random or Date.now would not be. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32, seeded. Deterministic, so the same captain in the same hour is
 *  handed the same room. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * ── WHAT THIS CAPTAIN HEARS, AND WHEN IT CHANGES ────────────────────────────
 *
 * NOT A TIMER, AND NOT RANDOM PER VISIT. The first version cycled a line every
 * few seconds, which meant a room that never sat still and eighty one lines
 * burned through in half an hour. Random-per-visit is the same problem wearing
 * a different hat: open the tavern four times in a session and you have heard
 * a dozen, and the twelfth lands with no more weight than the first.
 *
 * So the room is a function of WHO you are and WHAT HOUR IT IS. Come back
 * twice in ten minutes and the same three people are still talking about the
 * same things, which is what a room does. Come back after lunch and the
 * conversation has moved on.
 *
 * The deck is shuffled per captain, so two people in the tavern at the same
 * moment are not overhearing an identical script, and the window advances by
 * exactly `count` an hour: with eighty one lines that is twenty seven hours
 * before anybody hears a repeat, and every line gets said once first.
 */
export function overheardFor(seed: string, now: number = Date.now(), count = 3): Heard[] {
  const deck = [...GOSSIP]
  const r = rng(hash(seed))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  const hour = Math.floor(now / 3_600_000)
  const start = ((hour * count) % deck.length + deck.length) % deck.length

  const out: Heard[] = []
  for (let k = 0; k < count; k++) {
    const o = deck[(start + k) % deck.length]
    // FACES COME FROM THE LINE, NOT FROM THE CAPTAIN OR THE HOUR. The same
    // sentence is always said by the same person, so something you heard last
    // week is recognisably them saying it again.
    out.push({ ...o, faces: [face(o.say[0], 'a'), face(o.say[0], 'b')] })
  }
  return out
}

/** One patron, derived from what they said. Colour and hat are hashed
 *  separately so two speakers on the same line rarely collide on both. */
function face(line: string, which: 'a' | 'b'): Face {
  const h = hash(line + '::' + which)
  return {
    characterColor: PATRON_COLOURS[h % PATRON_COLOURS.length],
    hat: PATRON_HATS[(h >>> 8) % PATRON_HATS.length],
  }
}
