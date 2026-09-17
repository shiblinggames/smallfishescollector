// ── THE REGULARS ────────────────────────────────────────────────────────────
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and everything here is pure data or a pure function.
//
// ── WHY THESE NINE AND NOBODY ELSE ──────────────────────────────────────────
//
// Rapport needs somebody you can go BACK to, and most of this sea deliberately
// cannot be gone back to. The wandering traders are hashed out of (cell, day)
// and re-rolled when the day turns (see docs/systems/sea-npcs.md), so the
// peddler you bought worms from on Tuesday has no address. Building a
// friendship on one would be building it on a ghost.
//
// What is permanent: the five zone buyers, Yoon, and the three regulars added
// with this system who keep no shop at all. Those nine are always in the same
// water, always the same person, and worth crossing water to see. Finn is
// deliberately NOT among them: he is the campaign's rival with his own track,
// and a friendship meter on him would work against what he turns out to be.
//
// ── THE SHAPE OF A FRIENDSHIP ───────────────────────────────────────────────
//
// Five tiers. Talking once a day moves you one point; a gift they like moves
// you two, one they love moves you three. Story only — no rate bumps, no
// unlocks, no items. What a tier buys is that they talk to you differently,
// which is the whole point of the system and is also why the dialogue below is
// the bulk of this file rather than an afterthought at the end of it.
//
// NOTHING DECAYS AND NOTHING IS LOST. The daily gate is a refill, not a
// demand: miss a week and you have missed seven points you were never holding.
// That is the difference between a living sea and a chore list, and it is the
// house law (evergreen, player-paced, never FOMO) applied to a mechanic that
// in other games is built to punish absence.

/** Ids are stable and stored in `sea_rapport.folk_id`. Never renumber. */
export type FolkId =
  | 'meg' | 'pell' | 'marlow' | 'fitch' | 'nance' | 'yoon'
  | 'brill' | 'turbot' | 'ream'

export type FolkTier = 0 | 1 | 2 | 3 | 4

/**
 * What each tier is called, in their words rather than a number of hearts.
 *
 * THE TOP RUNG IS ABOUT THE PAIR OF YOU. It read "One of their own", which puts
 * them and their people on one side and you on the other, being let in — and
 * that is a description of the tier BELOW this one. Read what they actually say
 * when you cross into it: "you are the one who comes back", "there are two of us
 * who know what is behind that door now", "I have you, and that is a thing I
 * will be sorting out in my own time". None of that is admission to a circle.
 * It is two people, and the name should be a word about both of them.
 */
/**
 * WHAT TO CALL SOMEBODY, once you actually know them.
 *
 * Every regular carries a `role` — "Someone to know", "The salter", and so on —
 * which is what they are TO A STRANGER. It is the right line on a nameplate you
 * are reading for the first time and the wrong one at the top of the ladder: a
 * captain who has spent weeks getting to Thick as thieves was still being told
 * this person is someone to know, as though they had never met.
 *
 * So the top rung takes the role's place wherever the role is printed. Only the
 * top rung: the middle tiers are progress toward something and the role is
 * still the more useful fact, whereas tier 4 IS the fact.
 */
export function folkRoleFor(role: string, tier: FolkTier): string {
  return tier === 4 ? TIER_NAME[4] : role
}

/** At the top of the ladder, and nowhere else. What every surface that draws a
 *  regular checks before it decides how to draw them. */
export function isMaxRapport(tier: FolkTier): boolean {
  return tier === 4
}

export const TIER_NAME: Record<FolkTier, string> = {
  0: 'A stranger',
  1: 'A known face',
  2: 'Good company',
  3: 'Trusted',
  4: 'Thick as thieves',
}

/**
 * Points to reach each tier, and the curve STEEPENS toward the top.
 *
 * It was 4 / 10 / 18 / 30, which put the last tier eight days away for anybody
 * bringing a fish they love every morning. Eight days is not a friendship, it
 * is an errand run twice, and the top tier holds the lines these people would
 * never say to the harbour.
 *
 * The early rungs are deliberately left where they were. Reaching the first
 * inside a day or two is what tells a captain the system pays at all, and
 * nobody stays on a ladder whose first rung is a week up. What stretched is the
 * far end: the top is now eighteen days at the theoretical maximum, which means
 * a chat AND a fish they love every single day to the same person, and closer
 * to two months at the pace anybody actually plays at.
 */
export const TIER_AT: Record<FolkTier, number> = { 0: 0, 1: 4, 2: 14, 3: 34, 4: 70 }

export function tierFor(points: number): FolkTier {
  if (points >= TIER_AT[4]) return 4
  if (points >= TIER_AT[3]) return 3
  if (points >= TIER_AT[2]) return 2
  if (points >= TIER_AT[1]) return 1
  return 0
}

/** Points to the next tier, or null at the top. */
export function toNextTier(points: number): number | null {
  const t = tierFor(points)
  if (t === 4) return null
  return TIER_AT[(t + 1) as FolkTier] - points
}

export const CHAT_POINTS = 1
/**
 * WHAT A DELIVERY IS WORTH.
 *
 * Three points against a chat's one, and unlike a chat it is NOT rationed by
 * the clock. It is rationed by the sea: a regular asks for one particular fish,
 * and the request is settled only by one you land AFTER they asked. So the pace
 * of a friendship is set by how much fishing you do, which is the thing this
 * game is, rather than by how many mornings have gone by since you started.
 *
 * THAT IS THE WHOLE REASON THE DAILY GATE CAME OFF. The top rung is seventy
 * points and there are nine people on this ladder; at one gift a day each, the
 * only road to the end of it was to turn up every morning for two months and
 * keep turning up. That is not a long friendship, it is an alarm clock. Now the
 * ceiling is how many of the right fish you can find, so a captain who wants to
 * spend a whole evening on one person can, and one who plays twice a week is
 * not permanently behind.
 *
 * THERE IS NO CONSOLATION GRADE. Handing over any old fish for a point used to
 * be the floor of this system and it is gone. It made the favourite a rounding
 * error, it meant the best play was to empty your hold into whoever was
 * nearest, and it turned a request into a transaction. One fish, asked for by
 * name, caught on purpose.
 */
export const GIFT_FAVOURITE_POINTS = 3

/**
 * ── ONE OF THE THREE FISH SOMEBODY IS AFTER ───────────────────────────
 *
 * A favourite is not a fact about a person any more, it is a REQUEST. You ask
 * what they want, they name one of these, and the job stays open until you land
 * one and carry it back. So each carries both halves of that exchange: the
 * asking and the handing over.
 *
 * `brought` is a POOL because a request repeats. A single string read back word
 * for word identical the second time a captain did the rarest thing on this
 * water, which was exactly the wrong way round.
 */
export type Favourite = {
  /** fish_species.id. */
  id: number
  /** Carried alongside the id so a panel can name it without a round trip to
   *  the species table. Rename a species and this needs the same edit. */
  name: string
  /** What they say when you ask what they are after. It NAMES THE FISH, every
   *  time, because this line is the only place the request is ever spelled out
   *  in their own words. */
  ask: string
  /** What they say when you put it in their hands. */
  brought: string[]
}

export type Folk = {
  id: FolkId
  /** Their whole name. Kept, but it is almost never what gets printed - see
   *  `short`. */
  name: string
  /**
   * WHAT YOU CALL THEM ONCE YOU KNOW THEM, and what nearly every surface
   * shows.
   *
   * A captain who has spent a month getting to know somebody does not call
   * them "Quiet Fitch", and a roster of full names reads like a crew manifest
   * rather than a list of friends. The buyers and the other captains out here
   * keep their full names on purpose: that is the difference between somebody
   * you deal with and somebody you know.
   *
   * NOT a `split(' ')[0]`, which is what the hail button used to do. Half of
   * this cast wear their epithet in front ("Quiet Fitch", "Old Marlow", "Grey
   * Nance"), so the first word is an adjective and splitting on it greets a
   * friend as "Old". Written down per person instead.
   */
  short: string
  /** The band they keep to. Drives where the panel files them and what a
   *  captain must have levelled into to reach them. */
  zoneId: string
  /**
   * ALWAYS FALSE, and kept as a field so the rule is visible rather than only
   * true by accident.
   *
   * NOBODY YOU CAN BUILD RAPPORT WITH SELLS YOU ANYTHING. The five zone buyers
   * used to be these same five people, which meant the friend you had spent a
   * month getting to know was also the counter you sold across, and a
   * conversation with a price on it is two systems wearing one coat. The trade
   * lives on five plain traders in chart.ts RESIDENTS with a name, a rate and
   * one line between them.
   *
   * Yoon is the single edge and he is deliberate: his rod is a one-off gate on
   * a relationship rather than a counter you come back to, which is the good
   * version of the thing this rule exists to prevent.
   */
  buys: boolean
  /** One line for the roster: who they are, in the third person. */
  blurb: string
  /**
   * WHAT THEY SAY WHEN YOU PULL ALONGSIDE, before you have asked anything.
   *
   * Its own line, and it has to be. The scene opened on `lines[tier][0]`
   * while the day's word handed back the first UNHEARD line, which on a
   * fresh tier is also index 0 — so the button promised something new and
   * then said the exact sentence already on screen. Reported as precisely
   * that.
   *
   * Short, repeatable, and carrying no information, because you hear it
   * every single visit. It is a hello, not a beat.
   */
  greeting: string
  /**
   * THEIR FACE.
   *
   * Written down rather than hashed off their id, which is what the buyers
   * used to get. A hash gives you A face; it does not give you a face that
   * suits the person, and these nine are the only people out here anybody is
   * meant to recognise on sight. Same shape Finn's portrait uses, so the
   * scene renderer treats the rival and the regulars identically.
   *
   * `role` is the eyebrow over the name in the scene: what they are to you,
   * in two words, where Finn's says Rival.
   */
  face: {
    characterColor: string
    hat: string | null
    bg: string
    ring: string
    /** Portraits face the player. Art is drawn looking left, so most mirror. */
    mirrored?: boolean
  }
  /**
   * WHAT KIND OF PERSON THIS IS, and it is the SAME LINE for all nine.
   *
   * It used to be a job apiece: "Shallows buyer", "Rodmaker", "Wreck diver",
   * "Carries word". Two things wrong with that. Five of them were describing a
   * job none of them has had since the trade moved to the plain traders - every
   * one of these nine is `buys: false` - so the card under a friend's name was
   * simply false. And read down the roster the nine looked like nine unrelated
   * kinds of stranger, when the one thing a captain needs to know at a glance
   * is that they are all the same kind: somebody you can get to know.
   *
   * So the line is the CLASS, exactly as the rival's card reads "Rival". Who
   * they actually are has not gone anywhere - that is `blurb`, which sits right
   * under this on the same card and is where a wreck diver gets to be a wreck
   * diver.
   */
  role: string
  /** The accent this character's scene is lit with. Warm for the sociable,
   *  cold for the ones who live in the dark. */
  accent: string
  /**
   * WHAT THEY SAY, BY TIER.
   *
   * Chosen by what has not been heard yet, so a run of daily visits finds
   * something new before it starts going round again. A stranger gets the
   * guarded version; by the top tier they are telling you things they would
   * not tell the harbour.
   *
   * NOT THE SAME NUMBER PER TIER, because the time spent in them is not the
   * same either. Tier zero lasts a day or two and keeps three lines; tiers two
   * and three are the long middle of the climb and tier four is terminal and
   * lasts forever, so those carry five apiece. The pools were flat at three
   * when the curve was short, and stretching the curve without deepening them
   * would have bought a longer climb at the price of hearing the same sentence
   * twenty times.
   */
  lines: [string[], string[], string[], string[], string[]]
  /**
   * WHAT THEY SAY ONCE THERE IS NO FURTHER TO GO.
   *
   * Reached only at the top tier, and only after that tier's own five are
   * spent. The doc's own note is that tier four "ends in a line and nothing
   * else, which is thin for a month of sailing"; this is the part of that a
   * pool can answer. It is deliberately NOT a reward — the house rule for
   * rapport is story only, no rates, no unlocks, no items — it is simply the
   * conversation not running out.
   *
   * A DIFFERENT REGISTER FROM TIER FOUR. Those lines are the threshold: the
   * confession, the thing they had never said. These are what comes after
   * being told it. Quieter, more ordinary, sometimes funnier, often circling
   * back to what they let slip. A friendship is mostly the days afterwards.
   *
   * AND IT IS THE DEEPEST POOL ANYBODY HAS, by a long way. Five was written
   * when this was a coda; it is not a coda, it is the REST OF THE GAME. Tier
   * four arrives somewhere in the middle of a captain's time out here and then
   * never ends, so five after-max lines on top of the tier's own five meant a
   * friend of two years had ten sentences and you had heard all of them. The
   * six who are written in this file carry twelve, which puts seventeen behind
   * a maxed regular and means the loop is long enough that a repeat reads as
   * somebody with a favourite thing to say rather than as a script.
   *
   * THE THREE WHO ARE REAL PEOPLE ARE NOT WRITTEN HERE. Matty, Dennis and Yoon
   * take their words from the one person entitled to give them, which is the
   * standing rule for those three everywhere in this file. Their pools grow
   * when he writes them and not before.
   */
  afterMax: string[]
  /** The moment the bond deepens. One per tier crossed into, so four. */
  tierUp: [string, string, string, string]
  /**
   * THE THREE FISH, AND THEY COME ROUND IN ORDER.
   *
   * It was one apiece, which made a whole friendship a single errand: work out
   * the fish, catch the fish, and every present after that was the same present
   * with the same sentence over it. Three means asking twice gets a different
   * answer, and it gives each of these nine three chances to say something
   * about themselves rather than one.
   *
   * THEY ARE STILL CHOSEN TO BE ABOUT THE PERSON, which is the only rule here
   * that matters. Marlow wants a marlin and a halibut that lies on the bottom
   * and lets the sea bring it whatever it is having. Fitch, who lives in the
   * dark, wants the three that carry their own light or look up through their
   * own skull. Nance wants the three oldest things in the water. Rue, who
   * carries everybody's news and is asked for nothing, wants a cod, a
   * lanternfish and a salmon that always knows the road home.
   *
   * WHICH ONE THEY ASK FOR is favourites[gifts_given % 3], derived rather than
   * stored, so the cycle advances on delivery and there is no third column to
   * fall out of step with the count it was supposed to follow.
   */
  favourites: [Favourite, Favourite, Favourite]
  /**
   * THE LAST THING THEY DO FOR YOU, and only two of them have one.
   *
   * At full rapport they offer to sell a rod no shop stocks. It is not a
   * reward for money and it is not a reward for level: you cannot buy your way
   * to it and you cannot grind a zone to it, you have to have actually spent
   * the days. Yoon has always worked this way; Fitch and Nance now do too, so
   * the two rods that used to turn up on a random runner in the dark belong to
   * somebody instead.
   *
   * Priced from the rod table, never from here, so the panel and the server
   * cannot disagree about what it costs.
   */
  rodTier?: number
  /**
   * ── WHERE THEIR REACTIONS WENT ────────────────────────────────────────────
   *
   * `onLoved` and `onPlain` were two pools on the folk: one for the favourite,
   * one for everything else. The second grade does not exist any more (see
   * GIFT_FAVOURITE_POINTS), and the first could not stay where it was, because
   * a pool hanging off the PERSON cannot name a FISH once a person has three of
   * them. Meg's old line opened "Largemouth. You went and found one on purpose"
   * and would have fired on a gar.
   *
   * So both moved down a level, into `Favourite.brought`, and nothing was
   * thrown away: every reaction that named its fish went to that fish, and the
   * ones that worked for anything are shared out across the three. The lines
   * the three real people wrote for themselves are all still here, in their own
   * words, where they have always been.
   */
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CAST
//
// Every one of these voices is grown from the single line they already had on
// the chart, which is why they do not sound like each other: Meg was always
// practical, Pell was always short with you (he is Matty now, and something
// else entirely), Marlow was always working an
// angle he was happy to admit to, Fitch never used a word he did not need,
// Nance was the only one who treated the deep with respect, and Yoon only ever
// cared whether you were any good.
//
// House voice rules apply to every line here: sea creatures rather than folk
// from ashore, pirate charm, no em-dashes, and nothing that sounds written by
// a machine. Mechanics are explained plainly where they come up at all.
// ─────────────────────────────────────────────────────────────────────────────

export const FOLK: Folk[] = [
  {
    id: 'meg', name: 'Meg Corrin', short: 'Meg', zoneId: 'shallows', buys: false,
    greeting: "Mind the rail. It is wet, and it is always wet.",
    face: { characterColor: 'sand', hat: 'brown', bg: '#1a1408', ring: '#c8a060', mirrored: true },
    role: 'Someone to know', accent: '#d8b070',
    blurb: 'Kept the Shallows scale for thirty years. Watches who turns into somebody.',
    lines: [
      [
        "Bring it here and I'll weigh it here. Ashore they'll give you more, and a long haul home to collect it.",
        "You'll want the scale where you can see it. Everyone does, first few times.",
        "Shallow water, honest work. Nothing out here is trying to trick you.",
      ],
      [
        "Back again. Good. The ones who come back are the ones who last.",
        "I know your boat now. I hear it before I see it, which is more than I can say for most.",
        "You've stopped looking at the scale. That took you no time at all.",
        "Bring me a largemouth bass one of these days. My mother weighed the first one I ever landed and told me it was small. It was not.",
      ],
      [
        "Sit a minute. The water is not going anywhere and neither is the price.",
        "I have weighed for captains who never learned my name. You asked in your third week.",
        "There is a way of holding a rod that says how long somebody has been at it. Yours has changed.",
        "You are here more than some of the boats that live here. I have started leaving the good scale out.",
      ],
      [
        "My mother weighed on this same water. Different scale. Same argument with every hand who brought her a thin catch.",
        "I could work the deep. Better rates down there, and everyone who takes them comes back quieter. I like being loud.",
        "You want to know why I stay shallow? Because everyone starts here. I get to see who they turn into.",
        "I have weighed for three captains who went past the shelf and did not come back. I know all their names and all their boats.",
        "The harbor thinks the Shallows are the easy water. The Shallows are the water that decides whether you carry on.",
      ],
      [
        "There are four captains I would trust with my scale. You are one, and two of the others are dead.",
        "When you first came out here you counted the coin twice. You have not counted it in front of me for a year.",
        "Whatever it is you are chasing out in the deep, come back and tell me about it. Somebody should be keeping the account.",
        "You could stop coming here. Your hold is worth more out deep and we both know it. You come anyway.",
        "I am going to be honest with you, which I am not, usually. I look forward to it. Do not make a thing of it.",
      ],
    ],
    afterMax: [
      "You are late. I am not asking why. I am noting it, because I note everything.",
      "Somebody asked me who my best captain was. I said I did not keep a list. I do keep a list.",
      "Sit a minute. The scale is not going anywhere and neither, apparently, are you.",
      "I have started weighing yours last. It is the only part of the day I am in no hurry for.",
      "We are past the part where I explain myself to you. That is restful. You have no idea.",
      "A hand came out last week and told me the Shallows were a waste of a morning. I weighed his catch and I did not correct him. You would have.",
      "I have a bad knee now. I am telling you because you would notice by the end of the season and I would rather say it first.",
      "Somebody new is working the east side. Green as anything. Go and be rude to them so they carry on.",
      "There is a mug on this boat that is yours. I did not decide that. It simply happened and now it is a rule.",
      "Thirty years and the water still comes over the rail in the same place. There is a great deal to be said for that.",
      "Do not bring me the big one. Bring me the ordinary one and tell me about the day. I get the big ones from everybody.",
      "I told my mother about you, which took some doing, as she has been dead eleven years. She would have weighed you and said you were small. She said that about everything.",
    ],
    tierUp: [
      "You keep turning up. All right. Meg. That is what I go by, and now you know it.",
      "Pull alongside properly next time. You are not a queue, you are a regular.",
      "I will tell you something I do not tell the harbor: I set my rate by the captain, not the catch. Yours has been the good one for a while.",
      "You are one of mine now. That is not a discount, it is better than one.",
    ],
    // Honest, solid, nothing clever, and then one she has seen exactly once in
    // thirty years. Meg is not a woman with a trophy, she is a woman with a
    // scale, so two of her three are supper.
    favourites: [
      {
        id: 8, name: 'Largemouth Bass',
        ask: "A largemouth bass. My mother weighed the first one I ever landed and told me it was small. It was not. Go and settle that for me.",
        brought: [
          "Now that is a fish. I will not weigh this one, I will keep it.",
          "Largemouth. You went and found one on purpose, did you. Thirty years and people still manage it.",
          "That is the one. I will not thank you twice, so hear it properly the once: thank you.",
        ],
      },
      {
        id: 3, name: 'Yellow Perch',
        ask: "Yellow perch. Do not pull that face. Every captain out here wants to hand me the big one and not one of them has ever brought me supper.",
        brought: [
          "Perch. Small, plain, and exactly what I asked for. You listen. That is rarer out here than the gar is.",
          "There. That is a proper fish and I will be hearing nothing else about it.",
          "Straight off the deck and still cold. That is the right way to hand somebody a fish.",
        ],
      },
      {
        id: 59, name: 'Alligator Gar',
        ask: "A gar. An alligator gar. I have weighed exactly one in thirty years and I never got a proper look at it, because the hand holding it would not stop talking. Bring me another and I will take my time.",
        brought: [
          "Look at the length of it. I am taking my time with this one, and you can sit there while I do.",
          "Two. In thirty years. And the second one is yours. I am writing the date down, and I do not write dates down.",
          "That is a very old shape of fish. Something about it makes the Shallows feel less settled than I like to pretend they are.",
        ],
      },
    ],
  },
  {
    // THE ID IS THE STORAGE KEY. He was Bent Pell until 2026-09, and every
    // captain's standing with him lives in sea_rapport under 'pell'. The name
    // changed; the friendship did not, so the key stays.
    id: 'pell', name: 'Matty', short: 'Matty', zoneId: 'open_waters', buys: false,
    greeting: "Yoooooo whaddup whaddup. Dude have you checked the fish earnings reports?",
    face: { characterColor: 'blue', hat: 'black', bg: '#0b1420', ring: '#4fc3f7', mirrored: true },
    role: 'Someone to know', accent: '#4fc3f7',
    blurb: 'Cashed out of tech, bought a boat, and has a position in everything, including you.',
    // HE TALKS LIKE HE TALKS.
    //
    // Matty is a real person, like Yoon, and this is really how he speaks. A
    // millennial who worked in data, invests in stocks, and gambles like it
    // is a personality. The second voice out here written in a different
    // register on purpose: contractions, "okay so", and the vocabulary of
    // three worlds he never left: standups and reorgs, positions and dips and
    // the Greeks, the Den and the Catfish Jackpot.
    //
    // EVERY MANNERISM HERE WAS GIVEN, NOT INVENTED. The list, and it is the
    // whole list:
    //   "dude" and "bruh"          the reaction that starts a thought
    //   "Yooooo"                   how he arrives
    //   "LOL"                      said out loud, as a word
    //   "this is rigged"           anything that goes against him
    //   "wow what a piece of crap" anything that breaks
    //   "ripperoni"                never "RIP"
    //   "the data God"             what he calls himself, unprompted
    //   earnings                   he will ask if you are playing the next one
    //   "nails on the stails"      his one real slip, uncorrected
    //   "bro", "whaddup", "ima"    the register the given lines are in
    // EVERY LINE BELOW IS VERBATIM FROM THE USER (2026-09-05 rewrite): the
    // greeting, all five pools, afterMax, the tier-ups, the gifts and every
    // ask. Do not paraphrase, tighten, or "improve" any of it. New lines
    // come from him.
    //
    // THE STOCK MARKET ASKS ARE REAL. Ask him about the Greeks and he gives
    // you genuinely good information, in his voice. That is the joke: the
    // degenerate is also the most careful teacher on the water. Keep the
    // finance in those answers correct if they are ever touched.
    //
    // The gap between how he talks and what he is actually saying IS the
    // character. Under the jokes he got laid off, told everyone it was a
    // sabbatical, and is out here deciding whether to go back.
    lines: [
      [
        "Bruh I'm not catching anything today. Ripperoni.",
        "Yooooo. Dude. You're the first boat I've seen all day.",
        "Bruh, I'm not making any money out here.",
        "Middle of the ocean and still can't catch anything. This rod is a piece of crap.",
        "Yooooo. Nice boat dude. I'm just chillin'.",
        "Bruh, the fish here are rigged. I've been at it for two hours. This is rigged.",
      ],
      [
        "Yooooo, you came back. Welcome back to the open waters dude. This is like the index fund of oceans. Boring, but it compounds.",
        "Okay so I used to work in data. They called me the data God. I swear I'm not being modest, that was my actual title. Now my portfolio is fish. LOL. I'm doing great.",
        "Watch the shipping lanes. Where the freight goes, the fish go, and where the fish go is basically insider information. Forreal.",
        "A bluefin. Bruh. One of those sold for three million at an auction once. Three million. For a fish. If you ever land one, bring it here and let me just look at it.",
        "Yooooo, are you playing the next earnings? Dude, I don't even know which fish index. Any of them. I just need to know if you're playing it.",
        "Ripperoni to my reel, by the way. Wow what a piece of crap. Bruh, it lasted a week.",
      ],
      [
        "Dude, don't tell anyone, but I've got it figured out at the Den. I'm the blackjack god now.",
        "I'm up, by the way. Technically. I'm mostly down, but like I'm up today.",
        "We gotta both make it out of this rat - I mean fish race. We can't be working our whole lives.",
        "Yooooo. Good seeing you again dude. Ready to make some money?",
      ],
      [
        "Okay. Real talk. I didn't quit. Bruh, I got laid off. The boat was the severance. I told everyone it was a sabbatical.",
        "I had this one stock, dude. I diamondhanded that baby. Shoulda sold. Ripperoni.",
        "I miss playing at the Den all the time. My wife always gets on me.",
        "Dude, my recommendation is to always YOLO. Until you have kids. But before that, always YOLO.",
        "Need some life advice? I got you bro. You just gotta win the lottery. Then you're set.",
      ],
      [
        "Dude. I set a stop-loss on myself. One more year out here, then I go back and get a real job. If I blow through it, you're allowed to say something. Please let me hit it big out here!",
        "I catch myself doing the math on the Catfish Jackpot at, like, three in the morning. Bruh. If you ever see my boat by the Den after dark, come get me. I'm serious. It's rigged but I'll still play it.",
        "Life is hard but at least I know I'm just one big trade away from retiring. Admittedly I've said this every year for 10 years.",
        "My mom thinks I'm an investing genius. Let's let her keep thinking that.",
        "I don't wanna go back to work. If I'm still working here 5 years from now please slap me.",
      ],
    ],
    afterMax: [
      "Feels good to be making some gains.",
      "Don't tell my wife but I went to the Den again last night. I didn't lose money. But I didn't win money either.",
      "Did you see the price of the Shallow fishes this week? I shoulda held.",
      "How much fish you catching these days? I see you out here all the time now. You might be the fishing god.",
      "Every time I see you I get the itch to play options again. I can't do it though. I got kids now.",
    ],
    tierUp: [
      "Yooooo. Whaddup big dawg.",
      "Yeah lemme add you to the group chat. We used to talk about cool things. But now we just talk about kids.",
      "Alright I'll give you some more advice on stocks. Buy low. Sell high.",
      "Bro. Seems like just a few days ago we met but now we're friends forever on the open waters. See you in Valhalla!",
    ],
    // MATTY'S LINES COME FROM MATTY. He is a real person and everything he
    // says out here is his, verbatim - punctuation, capitals and all. Nobody
    // else writes them and nobody tidies them.
    //
    // The three fish are a position, a growth stock and a bubble, because that
    // is the only way he has ever looked at anything.
    //
    // ── WHO WROTE THE NEW ONES, AND WHEN ──────────────────────────────
    //
    // The standing rule on this file is that the three real people do not get
    // words put in their mouths. It has not been broken. Going from one
    // favourite to three needed two more asks and two more sets of reactions
    // apiece, and the go-ahead for exactly that was given on 2026-09-15: "You
    // can build out the lines for them all. Just match the styles for my
    // friends."
    //
    // So: everything that was here before is still verbatim and untouched. The
    // lines added that day are written IN the voice rather than BY the voice,
    // they are his to overwrite the moment he wants to, and the rule stands
    // unchanged for anything after them. Ask first.
    favourites: [
      {
        id: 60, name: 'Atlantic Bluefin Tuna',
        ask: "Yooooo. Okay. A bluefin. One of those sold for three million at an auction once. Three million. For a fish. Bring me one and let me just look at it, dude.",
        brought: [
          "YOOOOO. Dude. What. That's a bluefin. That's crazy.",
          "dude. you didn't have to. appreciate it man",
          "this is almost as nice as hitting a 10 bagger",
          "I can't believe you got me one of these. you're the goat.",
        ],
      },
      {
        id: 133, name: 'Black Marlin',
        ask: "Bruh. Get me a black marlin. Fastest fish in the whole ocean. That's a growth stock. That's all upside and no theta. Go.",
        brought: [
          "Yooooo. That's the fastest fish in the ocean and you just had it in a bucket. LOL.",
          "dude. you didn't have to. appreciate it man",
          "Okay so if I could put money on you I already would have. Ima say that once and then never again.",
        ],
      },
      {
        id: 105, name: 'Pufferfish',
        ask: "Okay this is gonna sound dumb. Get me a pufferfish. Dude, it blows up and then it goes back down. That's a bubble. That's the entire market in one fish and I want one on my boat.",
        brought: [
          "LOL. Look at it. That's every position I've ever held, dude. That's perfect.",
          "Bruh. It's doing the thing. It's inflating. Greatest gift anyone has ever given me.",
          "Thanks dude.",
        ],
      },
    ],
  },
  {
    id: 'marlow', name: 'Old Marlow', short: 'Marlow', zoneId: 'deep', buys: false,
    greeting: "You found me. Everybody does, eventually.",
    face: { characterColor: 'gray', hat: 'black', bg: '#101418', ring: '#a8b4c0', mirrored: true },
    role: 'Someone to know', accent: '#b0bcc8',
    blurb: 'Sits still in deep water and lets everybody else do the sailing.',
    lines: [
      [
        "Long way back to the dock from here. I've made a living out of exactly that.",
        "I am not the best price on this sea. I am the best price you can reach without a two hour sail, which is a different thing and worth more.",
        "Everyone finds me eventually. Usually with a full hold and a tired arm.",
      ],
      [
        "You worked out the sums, then. Most do, around the fourth trip.",
        "I like a captain who knows they are being charged for convenience and pays anyway. That is not being fooled, that is arithmetic.",
        "The deep is not dangerous. It is just far. Far is what people are actually afraid of.",
        "A blue marlin, since you have not asked. Yes. I have heard the joke about my name. I have heard it several thousand times and it was never funny.",
      ],
      [
        "I will tell you my trick. There is no trick. I sit still and everybody else does the sailing.",
        "Three of the wrecks in this band still have holds in them. Two are picked clean. I will not tell you which two.",
        "You have started arriving here without checking your chart. That is the water letting you in.",
        "You never haggle. Do you know how unusual that is out here. I have thought about it more than you have.",
      ],
      [
        "I bought a hold off a captain forty years ago and paid her badly. She never came back. I have thought about it more than she did.",
        "The rate I give climbs the deeper you go, and I want you to know I did not set that out of kindness. It is what the sail is worth.",
        "There is a shelf south of here where the sound changes. Take a run out one day and just listen. That is all, just listen.",
        "I keep a list of the captains who have worked this band. It is long, and most of the names are on it only once.",
        "The thing about a fair price is that it has to be fair to somebody. Ask me sometime which one of us I have in mind.",
      ],
      [
        "You could go round me. Sail the whole way home and keep the difference. You do not, and we both know it is not the coin.",
        "I have no crew, no hall and no name ashore. I have the deep and I have the captains who come out to it. You are the best of them.",
        "When I stop being out here, and there will be a day, take the wreck at the eastern edge. I have left something in it that is yours.",
        "I have been out here so long the water is more of a home than the harbor was, and I was born in the harbor.",
        "You keep sailing out to an old buyer who charges you for the privilege. I stopped working out why and started being glad.",
      ],
    ],
    afterMax: [
      "You are early. The water is flat. There is no reason for either of us to hurry, so we will not.",
      "I told you about the wreck at the eastern edge. I have not moved what is in it. I want that understood.",
      "Some days I do not weigh anything at all. Those are not the bad days. I used to think they were.",
      "You have started sounding like somebody who lives out here. I am not sure that is a kindness.",
      "Forty years of this and the sea still does something new every month. Stay long enough and it will show you.",
      "I have started leaving the lamp lit past dark. Not for anybody in particular. It simply seems to be the thing to do now.",
      "Your name is on my list twice. Nobody is on it twice. I have not decided whether to fix it.",
      "A captain came out yesterday and haggled me down eight percent. I let her. She reminded me of you, years back.",
      "The joke about my name. Go on. Once. I will decide afterwards whether we are still friends.",
      "There is nothing new to tell you today, and I notice neither of us has left.",
      "I used to think sitting still was a trade. It was a decision. Thirty years to see the difference.",
      "If I am short with you one day it will be the weather in my hands and nothing you have done. I want that on the record before it happens.",
    ],
    tierUp: [
      "Marlow. Old Marlow if you like, everyone else does, and I stopped minding it a long time ago.",
      "You are one of my regulars now. There are six. Two of them are terrible.",
      "I do not usually talk while I weigh. With you I have noticed I do.",
      "You have my trust, which is worth nothing, and my company, which out here is worth a great deal more.",
    ],
    // A marlin, which he has never once acknowledged; a shark that was already
    // out there before the harbour was a beach; and a flat fish that lies on
    // the bottom and lets the sea bring it whatever the sea is having, which is
    // his entire trade described as an animal.
    favourites: [
      {
        id: 38, name: 'Blue Marlin',
        ask: "A blue marlin, since you have asked, and yes, I have heard the joke about my name. Several thousand times, and it was never funny. Bring me one anyway.",
        brought: [
          "Well now. I have not held one of these in years. I am not going to weigh it and you cannot make me.",
          "A marlin. On my deck. I have nothing prepared to say about that, and I am usually prepared.",
          "You will have heard I do not go after these any more. You will notice I never said I stopped wanting one.",
        ],
      },
      {
        id: 134, name: 'Greenland Shark',
        ask: "Find me a Greenland shark. They live four hundred years, which means there are some down there that were already old when this harbor was a beach. I would like to sit in the same room as one and think about that.",
        brought: [
          "Four hundred years. It has outlasted every argument I have ever had about a price. Set it down gently.",
          "I am going to sit with this a while. You do not have to stay. You never do have to, and you always do.",
          "Somewhere down there is one of these that will still be swimming when the pair of us are a story. That is a comfort and I could not tell you why.",
        ],
      },
      {
        id: 125, name: 'Atlantic Halibut',
        ask: "Halibut. Atlantic, if you can manage it. It lies flat on the bottom and lets the sea bring it whatever the sea is having. You will not find a fish out here that works more like I do.",
        brought: [
          "There it is. My whole trade, in a fish. I sit still and everybody else does the sailing.",
          "Set it down there. And sit down yourself, you have been standing since you tied up.",
          "Generous. I will eat well and think better of you than I already do.",
        ],
      },
    ],
  },
  {
    id: 'fitch', name: 'Quiet Fitch', short: 'Fitch', zoneId: 'abyss', buys: false,
    greeting: "Mm.",
    face: { characterColor: 'storm', hat: 'midnight', bg: '#080c14', ring: '#6878a0', mirrored: true },
    role: 'Someone to know', accent: '#8090b8',
    blurb: 'Lives in the dark water. Says very little about anything.',
    // The Galaxy Rod. He lives in the dark and his fish carries its own light;
    // the void down there and the one overhead are the same void, and he is the
    // one person out here who would say so.
    rodTier: 18,
    lines: [
      [
        "Not many bring me anything this deep. I pay for that, not for the fish.",
        "You came a long way. Sit.",
        "It is dark. That is the whole of it.",
      ],
      [
        "You again.",
        "Most stop coming after the first trip. You did not.",
        "Nothing has changed out here. I find that restful. You might not yet.",
        "Anglerfish. It carries its own light down here. I could not tell you why that gets me, and it does.",
      ],
      [
        "I have been counting how many times you have come. It is more than anyone.",
        "There is a sound down here at the turn of the night. I am not going to describe it. Wait for it.",
        "You do not fill the quiet. Do you know how rare that is.",
        "Two of us, not talking. It is the best part of my week and I know how that sounds.",
      ],
      [
        "I came out here to stop hearing things. It worked, mostly.",
        "One question a visit. Ask.",
        "Something followed my boat for two nights, three winters back. It kept a distance. I let it.",
        "I hear better down here. That is not a good thing.",
        "Sit. No, do not say anything. Just sit.",
      ],
      [
        "I will talk to you. I do not do that. Take it as it is meant.",
        "There is a light down there that is not a fish. Do not chase it, and do not tell the harbor I said so.",
        "If I am ever not here, do not look for me. Go up and stay up. That is the only favor I will ever ask.",
        "There was somebody before you. He talked constantly. I miss him and I would never have told him so.",
        "You are the only one who has never asked me why I am down here. I would tell you, if you did.",
      ],
    ],
    afterMax: [
      "You came back. That is the whole conversation, really. The rest is manners.",
      "I would tell you now. You still have not asked. I have decided that is the point.",
      "Nothing down there has changed. That is the most alarming thing I can tell you about it.",
      "I talked to somebody else last week. Briefly. I did not care for it.",
      "Go up. I know you know. I will say it every time regardless.",
      "Mm. Yes. That was the whole thought and I stand by it.",
      "The light was closer last month. It is further now. I am telling you, not asking you.",
      "I said one question a visit. That was years ago. The rule has quietly ended and I am not announcing it.",
      "You brought a lamp. You did not need a lamp. I noticed and I liked it.",
      "There is a word for what this is. I have never used it out loud and I am not starting now.",
      "Do not come down in the dark of the year. I will still be here in the spring. Probably.",
      "Sit. Yes. Like that.",
    ],
    tierUp: [
      "Fitch.",
      "You can stay a while. If you want.",
      "I have started expecting you. That is new for me.",
      "You are the one I would tell, if there were ever anything worth telling.",
    ],
    // All three are about light in a place that has none. Two carry their own
    // and the third looks up through the top of its own head. He lives down
    // there on purpose and he has never explained why to anybody.
    favourites: [
      {
        id: 41, name: 'Anglerfish',
        ask: "Anglerfish. It carries its own light down here. I could not tell you why that gets me. It does.",
        brought: [
          "Ah. You brought it up alive. Good.",
          "Its light still works. Most of them come up dark.",
          "Mm. That is the one. You knew that.",
        ],
      },
      {
        id: 56, name: 'Firefly Squid',
        ask: "Firefly squid. A whole hand of them goes up at once down there, and then it is dark again. Bring me one. I want to see it close.",
        brought: [
          "Mm. Still lit. Hold it a moment before I do.",
          "There. Small, and doing the whole thing on its own.",
          "Thank you. Truly.",
        ],
      },
      {
        id: 47, name: 'Barreleye',
        ask: "Barreleye. Its head is clear and its eyes point up through it. Down there, and it is looking up. I have thought about that more than is reasonable.",
        brought: [
          "Looking up. Still. Even now. Mm.",
          "I have wanted to hold one of these for eleven years and I never said so out loud until you asked.",
          "Mm. Good.",
        ],
      },
    ],
  },
  {
    id: 'nance', name: 'Grey Nance', short: 'Nance', zoneId: 'ancient_deep', buys: false,
    greeting: "You are a long way out.",
    face: { characterColor: 'ice', hat: 'offwhite', bg: '#0a1018', ring: '#9ec4d8', mirrored: true },
    role: 'Someone to know', accent: '#9ec4d8',
    blurb: 'Keeps the count of who goes down to the oldest water and comes back up.',
    // The Lightsaber Rod. She keeps the count of who goes down to the oldest
    // water and comes back up, and a blade of light is what you take down.
    rodTier: 19,
    lines: [
      [
        "You went down there and came back up. Whatever's in your hold, I'll take it and ask nothing.",
        "I do not ask what you saw. Nobody who has been down there wants the question.",
        "You are further out than most captains ever get. I hope somebody has told you that.",
      ],
      [
        "Twice now. The water down here does not usually get a second visit.",
        "You have the look already. It comes on quicker than people expect.",
        "I pay the best rate on this sea and I still think you are underpaid.",
        "A coelacanth, if you ever raise one. It should have been gone sixty million years and nobody told it. I find that steadying.",
      ],
      [
        "This water is older than the harbor, older than the reef, older than whatever put the reef there.",
        "There are things on my scale I have never named. I weigh them, I pay for them, I do not write them down.",
        "You keep coming back up. That is the part I am proud of, and I have no right to be proud of it.",
        "You came back up again. I keep a count of that for everyone. Yours is the number I check first.",
      ],
      [
        "I had a captain before you. Sailed this same band for eleven years. Then one week she did not come up.",
        "The ancients are not fish. I will not be arguing about it, I am only telling you what I have weighed.",
        "When you land one of the old ones, bring it to me before you tell anybody. Not for the coin. I want to see it.",
        "I have weighed things that were still warm from a place with no sun. I have never worked out how.",
        "Do not take a full hold and a tired arm down there together. That is how it gets you, and it is never the storm.",
      ],
      [
        "You have brought me things nobody has brought me. That is the whole of my life's work and you did it in a season.",
        "The deep does not take the careless. That is a comfortable lie and I have told it for years. It takes whoever it likes.",
        "Come up. Always come up. If I have taught you one thing out here let it be the one that is not about fish.",
        "I am old. Somebody has to keep weighing out here and it will not be me for much longer.",
        "I hope you are chasing it and it is not chasing you. I have seen it the other way round and I did not care for it.",
      ],
    ],
    afterMax: [
      "You still come up when I say it. Most stop humouring an old woman eventually.",
      "I have written some of it down. Not for the harbor. For whoever is out here after me.",
      "Bring me nothing today. Sit there. That is a thing you are allowed to do.",
      "I told you the deep takes whoever it likes. It has not taken you. I am not calling that luck out loud.",
      "You will be the old one out here one day. Start noticing what you would want to pass on.",
      "The count is at four hundred and nine. Yours is still the number I check first.",
      "I dreamt of the oldest water again. In the dream it was warm. I do not know what to do with that.",
      "There is a page in my book with your name at the top and nothing under it yet. Fill it slowly.",
      "You have started saying come up to other captains. It came back to me last week from somebody who has never met me.",
      "My hands are worse this year. The scale does not mind. I do.",
      "I have stopped asking the sea for anything. It seems to be going better.",
      "When they find my boat empty, the count goes to you. It is a book and a pencil and forty years. Do not lose the pencil.",
    ],
    tierUp: [
      "Nance. Grey Nance to the harbor, just Nance to whoever comes back twice.",
      "You are welcome at my boat, and out here that sentence means something.",
      "I trust you with this water. There is nobody else I would say that to.",
      "You are the one who comes back. Of everyone I have weighed for, you are the one who comes back.",
    ],
    // The three oldest things in the water. She keeps the count of who goes
    // down to the oldest water and comes back up, and every one of these asks
    // is really the same ask, which is that you come back up.
    favourites: [
      {
        id: 50, name: 'Coelacanth',
        ask: "A coelacanth, if you can raise one. It should have been gone sixty million years and nobody told it. I find that steadying.",
        brought: [
          "You brought this to me first. Ahead of the harbor, ahead of the coin. I will not forget it.",
          "Sixty-six million years it managed without any of us, and you carried it up here in a wet sack. For me.",
          "I keep a count of who goes down and comes back. I am going to need a second list.",
        ],
      },
      {
        id: 149, name: 'Chambered Nautilus',
        ask: "Bring me a nautilus. The chambered one. It has not changed its mind about anything in five hundred million years and I would like to ask it how.",
        brought: [
          "Every chamber is a year it decided to keep going. I keep a book that does the same job and mine is shorter.",
          "Look at the shape of it. Nothing arrives at a shape like that by hurrying.",
          "This goes on the ice and your name goes in the book. Both of them keep.",
        ],
      },
      {
        id: 150, name: 'Ghost Shark',
        ask: "A ghost shark. Not a shark, whatever the harbor calls it. That line was old before there were trees. Go carefully, and come up.",
        brought: [
          "Older than the trees. Older than the reef. You went down and got it and you came back up, which is the part I actually care about.",
          "I have weighed two of these in forty years and I wrote down neither. I am writing this one down.",
          "Thank you. It is a long way to carry a gift.",
        ],
      },
    ],
  },
  {
    id: 'yoon', name: 'Yoon', short: 'Yoon', zoneId: 'ancient_deep', buys: false,
    greeting: "Ayo. Sheeeeesh, look who it is.",
    face: { characterColor: 'golden', hat: 'black', bg: '#141008', ring: '#f0c040', mirrored: true },
    role: 'Someone to know', accent: '#f0c040',
    blurb: 'Carries one rod that no shop will stock, and an opinion on whether you deserve it.',
    // The Locked-In Rod. His own asks have promised this for as long as they
    // have existed - "Technically. Practically? Nah. Not yet." - and the code
    // never made it true: anybody who could sail to him and cover the price
    // could take it on the first meeting. Now the dialogue is the mechanic.
    rodTier: 20,
    // HE TALKS LIKE HE TALKS.
    //
    // Yoon is a real person and this is really how he speaks, which makes him
    // the one voice out here written in a different register on purpose. It is
    // not slang sprinkled over the house voice: everybody else on this sea says
    // "I do not" and "it is", and Yoon says "I don't" and "it's" and "aight"
    // and "lowkey", because a mannerism dropped into a formal sentence reads as
    // a costume and the entire point is that he is not wearing one.
    //
    // The gap between how he talks and what he is actually saying IS the
    // character. He is the best rodmaker on this chart and the only one who
    // sounds like he wandered in from somewhere else completely.
    //
    // GYATTT IS THE LOAD-BEARING ONE. It is his most frequent tic by a wide
    // margin and it lands in about half his lines, usually as the reaction
    // that opens one. The others are sheeeeesh, locked in, gucci and betty
    // johnson. The Locked-In Rod is named after the way he says it rather than
    // the other way round, so do not quietly formalise any of this later.
    lines: [
      [
        "You've got the streak for it or you don't. Rod won't teach you that. It just stops wasting it.",
        "I'm not out here to sell. I'm out here in case somebody turns up who should have it.",
        "Sheeeeesh. Another one this far out. Gyattt. Aight then.",
        "Bruhhh, you sailed all the way out here for a chat? Aight. Respect, lowkey.",
        "Don't touch the rod. Gyattt, I'm kidding. Kinda. Don't touch it.",
      ],
      [
        "Gyattt. You came back and you didn't even bring the coin. That's way more interesting.",
        "The rod's not the hard part. The hard part's the hand.",
        "Gyattt, you want it already? Betty johnson. Come back when the hand's ready.",
        "Oarfish. Twenty feet of ribbon out of the black. Bruhhh. Bring me one of those and I will actually stop working for the afternoon.",
        "Sheeeeesh, that hull's seen some things. Good. A clean boat is a boat that hasn't fished.",
        "Lowkey I count how many casts people waste before they settle. You're at, like, two. Gyattt.",
      ],
      [
        "I made it. Not the tier, the rod. The one on my boat. Made it, then I stopped making.",
        "A perfect cast isn't luck twenty times. It's one thing you learned, done twenty times. Gyattt, when you say it out loud.",
        "You were so locked in on that last run. I watched the whole thing. Gyattt. Don't let it get to your head.",
        "Bruhhh, that hold is heavy. You've been out here since the light came up, huh.",
      ],
      [
        "There were three of us making rods out here. Other two sell in the harbor now. They're good, no shade.",
        "Gyattt. I stayed out because a rod should go to the captain it fits, and you can't tell that through a shop window.",
        "Bring me a bad run some time. Lowkey I'd rather watch how you fish when it's going wrong.",
        "Locked in isn't trying harder. It's the part where you stop trying and it just goes.",
        "Bruhhh, you have way too much dip on your chip with that setup. Half of it is not doing anything for you. Strip it back.",
        "Bruhhh, that is a lot of line out. You're fishing way deeper than you were last season.",
      ],
      [
        "You've got the hand. I've thought so for a while and I'm not saying it to be nice.",
        "Gyattt. When you buy the rod, and you will, know it was never a test. I just had to be sure it'd get used.",
        "After this there's no better rod. There's only better fishing. That's the good news and nobody ever hears it that way.",
        "You're locked in more days than you're not now. Gyattt. That took what, a season?",
        "Everything's gucci out here when you're fishing like this. Gyattt. Don't tell the harbor I said gucci.",
      ],
    ],
    afterMax: [
      "You're locked in permanently at this point. Gyattt. It stopped being a streak and started being how you fish.",
      "The rod's just a rod now, isn't it. Told you. Nobody believes that part until after.",
      "Everything's gucci. Genuinely. I've got nothing left to teach you and I'm not even annoyed about it.",
      "Sheeeeesh. I watched you land one from here and I still don't know how you read that water.",
      "Come out here sometimes when you don't need anything. That's the whole ask. Betty Johnson.",
    ],
    tierUp: [
      "Yoon. Might as well have the name if you're gonna keep mooring here.",
      "You stopped asking for a discount. Gucci. There was never gonna be one.",
      "Gyattt. I'll talk about the making with you. Betty johnson. I don't do that with buyers.",
      "Rod's yours whenever you've got the coin, and it was yours the day you stopped asking the price. Sheeeeesh. Took you long enough.",
    ],
    // YOON'S LINES COME FROM YOON. Same rule as Matty and Dennis.
    //
    // All three of his asks are about THE HAND, because that is the only thing
    // he has ever cared about. Two are shapes that punish a heavy hand and the
    // third is a trip back to the easy water to be humbled in it.
    //
    // ── WHO WROTE THE NEW ONES, AND WHEN ──────────────────────────────
    //
    // The standing rule on this file is that the three real people do not get
    // words put in their mouths. It has not been broken. Going from one
    // favourite to three needed two more asks and two more sets of reactions
    // apiece, and the go-ahead for exactly that was given on 2026-09-15: "You
    // can build out the lines for them all. Just match the styles for my
    // friends."
    //
    // So: everything that was here before is still verbatim and untouched. The
    // lines added that day are written IN the voice rather than BY the voice,
    // they are his to overwrite the moment he wants to, and the rule stands
    // unchanged for anything after them. Ask first.
    favourites: [
      {
        id: 49, name: 'Oarfish',
        ask: "Oarfish. Twenty feet of ribbon out of the black. Bruhhh. Bring me one of those and I will actually stop working for the afternoon.",
        brought: [
          "Gyattt. You hauled this all the way out here for me? Sit down. I'm gonna tell you how it's caught properly.",
          "this way too much dip on my chip brotha. ty. ty.",
          "you are doing way too much, but i am thankful",
          "bet.",
        ],
      },
      {
        id: 152, name: 'Snipe Eel',
        ask: "Aight. Snipe eel. Gyattt, the thing is basically all mouth and a shoelace. I wanna see what a hand has to do to land one without snapping it.",
        brought: [
          "Gyattt. Not a mark on it. You know what that takes? I know what that takes.",
          "Sheeeeesh. That's a soft hand. That's the whole thing I've been telling you about, right there.",
          "bet.",
        ],
      },
      {
        id: 63, name: 'Giant Trevally',
        ask: "Go back to the shallows and get me a giant trevally. Yeah. The shallows. Gyattt, everybody skips that water the second they can, and a GT will still take the rod off you. Humbling. Go.",
        brought: [
          "Sheeeeesh. Went back to the easy water and it wasn't easy, huh. Locked in.",
          "Gyattt. Rod's in one piece too. Gucci.",
          "this way too much dip on my chip brotha. ty. ty.",
        ],
      },
    ],
  },

  // ── THE THREE WHO KEEP NO SHOP ─────────────────────────────────────────
  // Added with this system, and deliberately social only: nothing they do is
  // a transaction, so meeting them is never confused with doing business. One
  // apiece in the three waters a captain actually lives in, chosen to fill the
  // gaps in the cast's voice rather than the gaps on the map. The Shallows had
  // only Meg's flat practicality, Open Waters only Pell's impatience (Matty's
// chatter now), and the
  // Deep only Marlow working his angle.

  {
    // THE ID IS THE STORAGE KEY. He was Tam Brill until 2026-09, and every
    // captain's standing with him lives in sea_rapport under 'brill'. The
    // name changed; the friendship did not, so the key stays.
    id: 'brill', name: 'Dennis', short: 'Dennis', zoneId: 'shallows', buys: false,
    greeting: "Oh, hey! Hey. Hi. Sorry, I was mid-thought, I'm always mid-thought. Hi.",
    face: { characterColor: 'default', hat: 'olive', bg: '#0e140c', ring: '#a3c46a', mirrored: true },
    role: 'Someone to know', accent: '#a3c46a',
    blurb: 'Talks for a living, fishes for fun, and owns more than he lets on.',
    // HE TALKS LIKE HE TALKS.
    //
    // Dennis is a real person, like Yoon and Matty, and this is really how he
    // is: awkward, geeky, funny, a big gamer, six years on the expeditions and a
    // story from every one of them, and quietly very well off in a way he
    // never leads with. So he is the third voice on this water written in
    // its own register on purpose, and the register is VERBOSE. His lines
    // run long, take a tangent, apologise for the tangent, and finish the
    // tangent anyway. That is the character; do not tighten him.
    //
    // NO CATCHPHRASE. Yoon and Matty have tics because the real people do.
    // Dennis's mannerism is the shape of the sentence, not a word in it:
    // "long story, the short version doesn't make sense without the long
    // version", the "anyway", the "sorry, I get into it". Nothing invented.
    //
    // EVERY LINE BELOW WAS REVIEWED AND EDITED BY THE USER (2026-09-07) and is
    // verbatim from that pass. Do not paraphrase, tighten, or "improve" any
    // of it. New lines come from him.
    //
    // The gap between the jokes and what he is saying IS the character. Under
    // the stories is a guy who talks because quiet is where he goes back to
    // sitting in the dark waiting for nothing to happen, and who is spending
    // the money he never mentions on something for people who are where he
    // was two seasons ago.
    lines: [
      [
        "Okay so you're probably wondering why a guy with a boat like this is anchored in the nicest spot in the Shallows. Long story. The short version doesn't make sense without the long version. Hi, by the way.",
        "This is my third rod. The first two are fine. I just, you know, wanted to see the patch notes on this one. That's a joke. Nobody out here gets my jokes. You might. You've got the look.",
        "Back on the expeditions we'd sit in the dark for six hours waiting for nothing to happen, and I thought, I could do this for fun. Turns out I was right. That's fishing. That's the whole pitch.",
        "I named the boat after a save file. Long story. Actually it's a short story, the boat's called Slot Three, because the first two saves are, you know, gone. Anyway. Hi.",
        "You know what nobody tells you about fishing? The loading screens are gorgeous. That's a joke about the water. Sorry. I do a lot of those.",
      ],
      [
        "You came back! People don't, usually. I talk a lot. I know I talk a lot. I've been told by professionals. Anyway, sit, or don't, I'll talk either way.",
        "Muskellunge. The fish of ten thousand casts. Ten thousand. That's a drop rate, that's a grind, that's the kind of number I respect. I've done about nine hundred. I'm keeping a tally. Of course I'm keeping a tally.",
        "Back on the expeditions I had a bosun who said a plan is just a list of things that won't happen. I think about him every time I cast. Every single time. Sorry, I'm getting into it. I get into it.",
        "This water's basically the tutorial zone and I'm fine with that. Some of the best games I've played, I never left the first area. That's not sad. Okay, it's a little sad. It's also true though.",
        "Back on the expeditions I got very good at one thing, which was eating an entire meal in four minutes, and it has never once come up since. Until now. I'm telling you now.",
        "I have three rods, a spare reel, a spare spare reel and a first-aid kit that could restock a small clinic. People say over-prepared. I say I've read the patch notes on weather.",
      ],
      [
        "Okay, real question, and I've been building up to this for like a week: do you ever get to the deep water and just feel like you skipped a cutscene? Like the game thinks you know something you don't? Just me? Okay. It's just me.",
        "Back on the expeditions we did a night crossing with a chart that was, and I want to be precise here, upside down. For four hours. I was the one holding it. I've told that story maybe two hundred times and it has never once made me look good, which is why it's a good story.",
        "I don't need a bigger boat. I could get one. That's not a brag, that's just true, and I'd rather it not be a thing. Money's the boring stat. Nobody puts money on a character sheet.",
        "You fish like you're speedrunning. Efficient. No wasted casts. I fish like I'm doing every side quest, and honestly I'm having a great time. Both are valid. That's the nicest thing I'll say today.",
      ],
      [
        "Okay so the money. I don't hide it, I just don't lead with it, which people say is the same thing and it's not. I bought the harbor's tab once. Nobody knows it was me. Now you know. Please be cool.",
        "Back on the expeditions the thing nobody tells you is how much of it is waiting. Waiting, and then a very short amount of something, and then waiting about the something. Fishing's the same shape. Life's the same shape. I think about this a lot.",
        "I keep a spreadsheet of every fish I've caught. Weight, spot, weather, what I was thinking about. The last column's the important one. You're in it more than you'd expect. In a normal way. I'm being normal.",
        "You can tell me if I'm being a lot. Everybody else just sort of drifts away mid-sentence and I finish the sentence to the water. The water's a great listener. Terrible at follow-up questions.",
        "Somebody green pulled alongside me and asked how to reel, and I gave them a forty-minute answer, and they stayed for all of it. I've never been so happy in my life. Anyway, that's my week.",
      ],
      [
        "I'm going to say something and then never say it again, because that's the rule with things like this: you're the only person out here who's ever heard the whole story and not looked at their watch. I noticed. I always notice.",
        "Back on the expeditions I had a friend who'd sit through all my stories and then say and? and it drove me insane and it was the best thing anyone's ever done for me. You do the and? thing. You don't even know you're doing it.",
        "The money's going somewhere, by the way. It's not going in a bigger boat. It's going into something for people who are where I was two seasons ago. Don't ask me what yet. I'm still writing the design doc.",
        "Some day I'm going to get the muskellunge and I'm going to be so annoying about it. You'll be the first person I tell. You'll be the first person I tell most things, actually. That's just where we are now.",
        "I talk a lot because when I stop, it's quiet, and quiet is where I go back to being a guy in the dark waiting for nothing to happen. You make the quiet okay. That's the shortest thing I've ever said and I mean all of it.",
      ],
    ],
    afterMax: [
      "Still talking. Still noticing you don't look at your watch. Still not over it.",
      "Cast number four thousand and something on the muskellunge. The tally's in the log. It's under your name, for some reason.",
      "The thing for the new captains is happening. Slowly. Design docs are long. Mine's longer.",
      "Back on the expeditions I never once got a story to a satisfying ending. Out here I've got you, and endings are easier.",
      "The boat's still ugly. The engine's new. Nobody's noticed. You will. You notice things.",
    ],
    tierUp: [
      "Dennis! You asked. People usually just let me talk until I say it by accident.",
      "Okay, so we're friends now, and I want to be upfront that friends of mine get the long versions of things. All of them. You've been warned. This is the warning.",
      "I'm going to tell you stuff I don't tell the harbor. Not because it's secret. Because the harbor walks off. You don't walk off.",
      "You're on the short list. It's a short list. Honestly it's you and a bosun who doesn't know he's on it.",
    ],
    // DENNIS'S LINES COME FROM DENNIS. Same rule as Matty and Yoon.
    //
    // A drop rate, a boss fight and a lore drop, which is the only three
    // categories he has. The asks run long and take a tangent and apologise
    // for the tangent and then finish the tangent. That is him. Do not tighten.
    //
    // ── WHO WROTE THE NEW ONES, AND WHEN ──────────────────────────────
    //
    // The standing rule on this file is that the three real people do not get
    // words put in their mouths. It has not been broken. Going from one
    // favourite to three needed two more asks and two more sets of reactions
    // apiece, and the go-ahead for exactly that was given on 2026-09-15: "You
    // can build out the lines for them all. Just match the styles for my
    // friends."
    //
    // So: everything that was here before is still verbatim and untouched. The
    // lines added that day are written IN the voice rather than BY the voice,
    // they are his to overwrite the moment he wants to, and the rule stands
    // unchanged for anything after them. Ask first.
    favourites: [
      {
        id: 12, name: 'Muskellunge',
        ask: "Muskellunge. The fish of ten thousand casts. Ten thousand. That's a drop rate, that's a grind, that's the kind of number I respect. I'm at about nine hundred. I'm keeping a tally. Of course I'm keeping a tally. Anyway. No pressure. Enormous pressure.",
        brought: [
          "No. No way. You did not. Ten thousand casts and you just, you just brought one over? I need to sit down. I'm going to be talking about this for a year. Longer. You've made a huge mistake and I love you for it.",
          "wow. wow. you got another one for me? i haven't even had enough time to get over the last one!",
          "im honestly shocked at how quickly you're able to get these over to me. you must be one of the greatest fishers on the sea.",
          "how are you catching these?? i've spent years out on these seas and I can barely get any. but here you are just pulling these out of thin air. If I could invest in you I would!",
        ],
      },
      {
        id: 132, name: 'Goliath Tigerfish',
        ask: "Okay so. Goliath tigerfish. Go and look at what its teeth do and then come back and tell me that isn't a boss fight. It's a boss fight. It has a health bar. It has phases. I want one and I want to be very normal about it, which I won't be.",
        brought: [
          "It has the teeth. It actually has the teeth. I'm looking at the teeth. Sorry. Give me a minute. I'm looking at the teeth.",
          "You beat the boss and then you brought me the drop. Do you know what that is? That's a raid. We did a raid. I'm logging this under raid.",
          "Oh, that's a good one. That's a really good one. I'm going to log it and then I'm going to tell you a story about it, fair warning.",
        ],
      },
      {
        id: 90, name: 'Seahorse',
        ask: "Seahorse. And before you say anything, yes, it's tiny, and yes, I want one, because the males carry the eggs, which nobody ever leads with, and it is objectively the best fact in this entire ocean. That's the ask. That's the whole ask. Sorry. I get into it.",
        brought: [
          "Look at him. That's a dad. That's a working dad. I am going to be insufferable about this all week.",
          "It's so small. It's so small and I care about it so much. This is the correct emotional response and I will not be taking notes from anyone.",
          "For me? Thank you. Genuinely. Nobody brings me things, I'm usually the one bringing things. This is nice. This is a nice change.",
        ],
      },
    ],
  },
  {
    id: 'turbot', name: 'Cass Turbot', short: 'Cass', zoneId: 'open_waters', buys: false,
    greeting: "Mind where you drop that anchor.",
    face: { characterColor: 'forest', hat: 'olive', bg: '#0c1410', ring: '#88b09c', mirrored: true },
    role: 'Someone to know', accent: '#88b09c',
    blurb: 'Dives the wrecks and comes up with stories, some of them true.',
    lines: [
      [
        "Do not anchor here. I am working underneath you.",
        "Three wrecks in this band. I have been in all three and I only talk about two.",
        "Everything down there belonged to somebody. I try to remember that about twice a year.",
      ],
      [
        "You did not anchor. Good. You listen, which is more than the last four did.",
        "The middle wreck has a bell still hanging in it. I have never rung it and I am not going to.",
        "People think salvage is treasure. Salvage is mostly rope. Beautiful rope, sometimes.",
        "Cobia, if you are ever holding one. They hang about wreckage, so I see more of them than most, and I have never once got tired of it.",
      ],
      [
        "I will tell you about the second wreck. Not today. But I will.",
        "There is a rule down there. You take what has come loose. What is still fixed belongs to the boat.",
        "You get a feeling in a hold that went down fast. I cannot explain it better than that and I have tried for years.",
        "I have been down twice today. The water is being agreeable, which always worries me.",
      ],
      [
        "The second wreck has a door that was shut from the inside. I have looked at it eleven times.",
        "My sister dives the deep band. We have not spoken in six years and I still check her mooring is empty every morning.",
        "If I ever come up saying I saw nothing down there, get me to the harbor. That is not a joke.",
        "You learn to tell how fast a boat went down by the way the doors sit. I wish I did not know that.",
        "Never dive alone. I say it to everyone, and then I do it every single day.",
      ],
      [
        "I opened the door. Two summers ago. I am not going to tell you what was behind it, but I will tell you I closed it again.",
        "You are the only captain who has never asked me what I have found. That is exactly why I would tell you.",
        "Come down with me one day. You will hate it and then you will want to go again. Everyone does.",
        "My sister taught me the doors. It is the last useful thing she said to me and I use it every week.",
        "If you ever find my boat empty and my line still tied off, cut it. Do not follow it down. Promise me.",
      ],
    ],
    afterMax: [
      "The door is still shut. I go past it. I do not stop. That took two years to manage.",
      "You never did ask what I found. I have got so used to that I would be thrown if you did.",
      "My line is tied off the same way every time now. If you ever see it different, that is the signal.",
      "I went down with somebody last month. First time since my sister. It was fine. It was strange and it was fine.",
      "You are on the short list of people who would come looking. I have never had a short list before.",
      "I rang the bell. Once, in daylight, with the line tied off and a hand on it. Nothing happened and I have been better since.",
      "My sister's mooring was full on Tuesday. I sailed past it twice and did not stop. Ask me again in a year.",
      "I have a length of rope aboard off the middle wreck. It is the best rope I have ever handled. That is the whole story.",
      "You anchored properly again. I have not had to say it in a year and I still nearly say it.",
      "Everything down there belonged to somebody. I remember that more than twice a year now. I blame you.",
      "There is a fourth wreck. I found it in the spring. I have not been in and I am not ready to say why.",
      "If you do come down with me, wear the old gloves and not the good ones. It is the only advice I have that is worth anything.",
    ],
    tierUp: [
      "Cass. Turbot if you are being formal, and nobody out here is being formal.",
      "You can moor near me. Near, not over. I will show you where.",
      "I have started saving the good stories for you, which is a bad habit and I am not stopping.",
      "There are two of us who know what is behind that door now. Sleep well.",
    ],
    // All three live in her working day. She meets them in the dark, at depth,
    // on somebody else's boat, and what she wants is a proper look at one in
    // daylight without having to hold her breath.
    favourites: [
      {
        id: 21, name: 'Cobia',
        ask: "Cobia, if you are offering. They hang about wreckage, so I see more of them than most, and I have never once got tired of it.",
        brought: [
          "Out of the current, that one. You had to work for it. I can see you had to work for it.",
          "Cobia. They hang about the wrecks like they are paying rent down there. Did you have to shoo it off something of mine?",
          "I have come up empty from better water than that. Do not repeat that anywhere.",
        ],
      },
      {
        id: 24, name: 'Barracuda',
        ask: "A barracuda. One hung off my shoulder in the middle wreck for forty minutes once, just watching, and then it left. I have wanted a proper look at one ever since and I am not going back down after it.",
        brought: [
          "There you are. Forty minutes it watched me and I never once got to look back. I am looking now.",
          "Held the same way it hangs in the water. Still. All teeth and patience, this lot.",
          "Right. That is dinner, and I did not have to hold my breath for it.",
        ],
      },
      {
        id: 80, name: 'Stingray',
        ask: "Stingray. They settle into the silt in a hold that went down flat, and you do not see them until you have already put a hand down. Bring me one and let me be cross with it in daylight.",
        brought: [
          "In daylight. On a deck. Not under my hand in the dark. Much better.",
          "The silt sits on them like a blanket down there. Nothing in a wreck wants to be found, and that one is the worst of them.",
          "Fresh food out here is worth more than salvage. I am not exaggerating.",
        ],
      },
    ],
  },
  {
    id: 'ream', name: 'Rue Bream', short: 'Rue', zoneId: 'deep', buys: false,
    greeting: "News, or are you just passing?",
    face: { characterColor: 'lavender', hat: 'purple', bg: '#12101c', ring: '#b0a0d0', mirrored: true },
    role: 'Someone to know', accent: '#b0a0d0',
    blurb: 'Carries news between the regulars and remembers all of it.',
    lines: [
      [
        "I carry word between the boats out here. No, there is no charge. That surprises everyone.",
        "You are new to me. I will remember you now, that is how this works.",
        "Meg is well. You did not ask. I am telling you anyway.",
      ],
      [
        "Marlow asked after you. He would deny it, so do not bring it up.",
        "I know where everybody is. Not because it is my business. Because nobody else keeps track.",
        "Matty called you his best position. I do not know what it means. I have written the date down.",
        "A cod. Plain Atlantic cod. Everything else out here is somebody's trophy and a cod is just supper, which is the entire point of it.",
      ],
      [
        "You want to know who is out here and where. Sit down, this takes a while, and it is the only thing I am good at.",
        "Fitch has not spoken to anyone but me in four months. Now he has spoken to you. I noticed.",
        "There is a young one in the Shallows telling everybody he knows you. He is not lying, is he.",
        "Do you want the news or the true news. They are different lengths.",
      ],
      [
        "I carried word for a captain once and I carried it too slowly. She was gone by the time it reached her.",
        "That is why I do not charge. Somebody has to be quick about it and mean it.",
        "Nance is the only one out here I cannot read. Twenty years and I have got nothing.",
        "Dennis asks after you every time, and every time it takes forty minutes. I have started sailing off mid-sentence. He finishes them to the water.",
        "Nobody ever asks me to carry anything to Fitch. I go anyway, about once a month.",
      ],
      [
        "You have the whole road now. Every one of them talks to you and I am the only other one who can say that.",
        "Cass has a sister in the deep band. Neither of them has asked me to carry anything. Both of them have wanted to.",
        "When I am too old for the run, somebody has to keep the account of who is out here. I have been thinking it should be you.",
        "I have carried word for forty years and never once for myself. I would not know who to send it to.",
        "Yoon told me to tell you something once. Then he changed his mind. I have wondered ever since and so should you.",
      ],
    ],
    afterMax: [
      "No word for you today. That is rarer than you would think and I thought you should hear it from me.",
      "Cass asked after you. Did not ask me to say so. I am saying so.",
      "I have started telling people what you are like out here. I hope that is all right. It is all good.",
      "Forty years and I have finally worked out who I would send word to. Took a while.",
      "Yoon changed his mind again about that message. I have stopped waiting. You should too, probably.",
      "Meg has a mug on her boat with your name on it. She will deny it. She showed it to me.",
      "Nothing to carry today. I sailed out here anyway. Work that one out, because I have not.",
      "I am teaching a young one the run. She is quicker than me and worse at the listening. That is the hard half.",
      "Fitch spoke twice last month. Twice. I have written the dates down and I will not be taking questions.",
      "Marlow says he has no regulars. He has six and he can name them in order. I have heard him do it.",
      "You are the first in forty years to ask what the news costs me. A sail and a bad back, since you keep asking.",
      "I said somebody should keep the account when I am done. I have stopped saying should.",
    ],
    tierUp: [
      "Rue. Rue Bream. Now you are on my list, which is a real list and it is quite short.",
      "I will carry word for you. Anywhere on this sea, no charge, you only have to ask.",
      "You get the real news now, not the harbor version.",
      "You are the last name on the list and the only one who ever asked how I was.",
    ],
    // Three fish that do the job and are never thanked for it: supper, the most
    // numerous thing in the sea that nobody can name, and the one that carries
    // itself the whole way home and never gets the road wrong. She has carried
    // word for forty years and never once for herself.
    favourites: [
      {
        id: 27, name: 'Atlantic Cod',
        ask: "A cod. Plain Atlantic cod. Everything else out here is somebody's trophy and a cod is just supper, which is the entire point of it.",
        brought: [
          "You remembered. I mentioned this once, months ago, and you remembered.",
          "Cod. Plain as anything, and not one person has ever brought me one. That is rather the whole of me, is it not.",
          "I carry what everybody says and nobody asks what I would want. You asked, once. Here it is.",
        ],
      },
      {
        id: 51, name: 'Lanternfish',
        ask: "Lanternfish. There are more of them in this sea than anything else with a spine, and not one captain out here could name one. I have a certain sympathy. Bring me one.",
        brought: [
          "The most of anything in the whole sea, and nobody has ever handed one to a person on purpose before. Until now.",
          "It carries a light and nobody looks. I will not be drawing the comparison out loud. I have drawn it.",
          "Something for me, for once. I will not make a thing of it. I will mention it, but I will not make a thing of it.",
        ],
      },
      {
        id: 82, name: 'Atlantic Salmon',
        ask: "An Atlantic salmon. It goes out, it carries itself the whole way back, and it never once gets the road wrong. I have been doing that for forty years with worse navigation.",
        brought: [
          "All that way and it still knew the road. Forty years, and I still check my chart twice.",
          "There is nothing out here better at carrying something home. Present company included, and I am being generous to myself.",
          "A gift for the messenger. That does not happen. Thank you.",
        ],
      },
    ],
  },
]

/**
 * ── THINGS YOU CAN SAY BACK ─────────────────────────────────────────────────
 *
 * A meeting used to be them saying one sentence at you. That is a notice
 * board, not a conversation, and no amount of typewriter makes it one. So
 * every regular carries two things you can ask at every tier, and asking is
 * FREE and always available: the daily gate is on the point, never on the
 * talking. Somebody who has already had their word today can still pull
 * alongside and get a real exchange, which is the difference between a person
 * standing in the water and a vending machine that pays out once a day.
 *
 * They deepen with the tier, and they are the only place these nine ever
 * answer a direct question. A stranger tells you the rate. Somebody who
 * trusts you tells you what happened to the captain before you.
 */
export type Ask = {
  /** Your line. Written as something a captain would actually say out loud. */
  you: string
  /** Theirs back. */
  they: string
  /**
   * ONE BEAT AFTER. Offered on its own, right after `they`, instead of the
   * usual options, and only then. For the exchanges that are not finished
   * when they stop talking: a voice cracks, there is a silence, you say
   * nothing, and they move on slightly embarrassed. The silence is yours to
   * pick, which is what makes it a moment rather than a line.
   */
  then?: { you: string; they: string }
}

export const ASKS: Record<FolkId, [Ask[], Ask[], Ask[], Ask[], Ask[]]> = {
  meg: [
    [
      { you: 'What do you pay?', they: 'Less than ashore. More than the row home costs you. Work it out.' },
      { you: 'Busy today?', they: 'Three boats before you. Two of them tried to argue with the scale.' },
    ],
    [
      { you: 'Do you ever go out deep?', they: 'Never had a reason. Everything I need comes past me eventually.' },
      { you: 'How long have you been at this?', they: 'Long enough that the good scale is older than most of the captains using it.' },
    ],
    [
      { you: 'Who taught you the trade?', they: 'My mother. Same water, worse scale, twice the temper.' },
      { you: 'Any advice?', they: 'Come back with a full hold or come back empty. Just come back.' },
    ],
    [
      { you: 'Do you get lonely out here?', they: 'There is a difference between alone and lonely. I have only ever been the first one.' },
      { you: 'What happened to the ones who stopped coming?', they: 'Some got rich. Some got frightened. Two I do not talk about.' },
    ],
    [
      { you: 'Would you ever leave the Shallows?', they: 'And go where. This is the water. Everything after it is only further away.' },
      { you: 'What do you make of me?', they: 'You turned into somebody. I have watched it happen twice before and it never gets old.' },
    ],
  ],
  pell: [
    [
      { you: 'What are you doing out here?', they: 'Dude I\'m trying to retire. Once my fish stocks take off ima retire.' },
      { you: 'Do you fish?', they: 'LOL I own a rod bro. These waters are rigged tho.' },
      { you: 'You okay out here?', they: 'No wife, no kids. Can\'t complain.' },
      { you: 'What is with the phone?', they: 'Just checking for new boats bro. My wife made me sell my last one. It was a lot more sporty I swear. Now I have this family boat.' },
      { you: 'Do you ever sleep?', they: 'I\'m guessing you don\'t have kids.' },
    ],
    [
      { you: 'So you worked in fishing technology?', they: 'Data. I was the data God. Dude, that was my title, people called me that in meetings. I made the best dashboards.' },
      { you: 'Why are you in Open Waters?', they: 'I used to YOLO out in the abyss but I\'m a family man now.' },
      { you: 'Tell me about the fish stock market.', they: 'Okay. Yooooo. Okay. So a stock is a piece of a company, that part\'s boring. The fun part is options, and options are all about the Greeks. Ask me about the Greeks.' },
      { you: 'What are the Greeks?', they: 'Dude. Okay. Delta, gamma, theta, vega, rho. Delta is how much the option moves when the stock moves a dollar. Gamma is how fast delta changes. Theta is what you lose every day just for holding it. Vega is how much it cares about volatility. Rho is interest rates and nobody cares. Bruh, that\'s the whole religion.' },
      { you: 'Are you playing the next earnings?', they: 'Always dude. I don\'t even know which company yet. Are YOU playing it? That\'s the real question.' },
    ],
    [
      { you: 'Are you up or down?', they: 'Bro, I\'m always down. I\'m still the data God though.' },
      { you: 'Do you actually like it out here?', they: 'I like that nobody\'s pinging me all the time. And no crying babies all day long.' },
      { you: 'How are you really doing?', they: 'Dude, I\'m fine. I\'m totally *voice crack* ...',
        then: { you: '...', they: '... Okay. That didn\'t happen. Bruh. Anyway. Yooooo, earnings are next week, are you playing it? LOL. Moving on.' } },
      { you: 'Explain delta properly.', they: 'Okay so delta runs from zero to one on a call, negative one to zero on a put. A fifty delta call moves about fifty cents per dollar the stock moves, and it\'s roughly the market\'s guess at the odds it finishes in the money. Dude, deep in the money it acts like stock, way out of the money it\'s a lottery ticket. Bruh, that\'s delta.' },
      { you: 'What is theta?', they: 'Theta is the rent. Dude, every day you hold an option you pay a little, and it speeds up as expiry gets close, like the last week is brutal. Buyers pay theta, sellers collect it. Bruh, most people out here are buyers and they don\'t know they\'re the rent.' },
    ],
    [
      { you: 'What happened with the job?', they: 'Reorg? Lack of funds? Idk. Big ripperoni.' },
      { you: 'What was the stock?', they: 'I don\'t even remember. I own so much stock. But all of them are worthless.' },
      { you: 'What is the deal with earnings?', they: 'Okay so before earnings, implied volatility gets pumped, the options get expensive, everybody\'s pricing the move. Then the number drops and IV crushes, like collapses, and your call can be right on direction and still lose because you paid for the fear. Dude, the price of the straddle divided by the stock price is roughly the move the market expects. If you don\'t think it beats that, you don\'t play it. Bruh, I play it anyway.' },
    ],
    [
      { you: 'Are you going back?', they: 'Bro i have no clue. I don\'t want to. But it\'s not looking good for me.' },
      { you: 'What would you do differently?', they: 'I should\'ve invested in the Ancient Deep at a young, young age. Who knew that those fish prices would go insane...' },
      { you: 'Would you consider me a close friend?', they: 'Yeah, dude. You\'re, like, the best *voice crack* ...',
        then: { you: '...', they: '... Bruh. You heard that?' } },
      { you: 'What is gamma, really?', they: 'Gamma is how much delta moves when the stock moves a dollar, so it\'s the thing that makes a position feel alive. Highest at the money right before expiry, dude, that\'s where an option flips from nothing to everything on a small move. Sellers are short gamma and it\'s the thing that eats them. Bruh, the data God has been eaten. Ripperoni.' },
    ],
  ],
  marlow: [
    [
      { you: 'Why so far out?', they: 'Because you came anyway. That is the whole business model.' },
      { you: 'Is the rate fixed?', they: 'Fixed by the distance you just sailed. I only read it out.' },
    ],
    [
      { you: 'Do you ever go ashore?', they: 'Not in nine years. The harbor and I agreed to stop pretending.' },
      { you: 'What is out past here?', they: 'Darker water and better prices. Both get worse the further you go.' },
    ],
    [
      { you: 'You mentioned wrecks.', they: 'Three. Two picked clean. I said I would not tell you which two and I meant it.' },
      { you: 'Do you fish yourself?', they: 'I did. I was terrible. It is why I am very good at buying.' },
    ],
    [
      { you: 'Who was the captain you paid badly?', they: 'Her name was Tarn. She took it without a word, which was worse than shouting.' },
      { you: 'Do you regret it?', they: 'Every time somebody new pulls alongside. That is what a regret is for.' },
    ],
    [
      { you: 'What is in the eastern wreck?', they: 'Something I have been keeping for whoever came out here often enough to deserve it. Do not go looking yet.' },
      { you: 'Will you ever stop?', they: 'Out here you do not stop. You stop being out here one day and somebody notices a week later.' },
    ],
  ],
  fitch: [
    [
      { you: 'Cold down here.', they: 'Yes.' },
      { you: 'Do you talk much?', they: 'No.' },
    ],
    [
      { you: 'How deep does it go?', they: 'Further than the chart says. Do not.' },
      { you: 'Do you sleep out here?', they: 'When it is quiet. It is always quiet.' },
    ],
    [
      { you: 'What is the sound you mentioned?', they: 'You will know it. Everybody says the same thing afterwards and I will not spoil that.' },
      { you: 'Are you all right out here?', they: 'That is the first time anybody has asked me. Yes.' },
    ],
    [
      { you: 'Why the dark water?', they: 'Ask me again when you have earned it.' },
      { you: 'What followed your boat?', they: 'Something patient. That is all you are getting.' },
    ],
    [
      { you: 'So why the dark water?', they: 'Up there I could hear everybody at once. Down here it is one thing at a time.' },
      { you: 'Would you ever come up?', they: 'For the right reason. Nobody has had one yet.' },
      { you: 'Tell me about the rod.', they: 'It is wound from the same dark that is over your head right now. Land a fish on it and you may fold the water once and bring up a different one from these depths instead. Better or worse. It does not promise you better.' },
      { you: 'Why would I want to undo a catch?', they: 'You would not, most times. You will know the time. It comes once a trip and you will feel it before you decide.' },
    ],
  ],
  nance: [
    [
      { you: 'You buy anything?', they: 'Anything that comes up from down there. I stopped being surprised a long time ago.' },
      { you: 'Not many boats out here.', they: 'Three this month. You are the third.' },
    ],
    [
      { you: 'Strangest thing you have weighed?', they: 'I do not have a word for it. That is what makes it the strangest.' },
      { you: 'Is it safe?', they: 'No. Go carefully and come up often.' },
    ],
    [
      { you: 'How old is this water?', they: 'Older than everything you sailed past to get here. The reef included.' },
      { you: 'Do you ever go down?', they: 'I weigh. Other people go down. That division has kept me alive.' },
    ],
    [
      { you: 'Tell me about the captain before me.', they: 'Eleven years on this band. Never late, never careless. It did not matter in the end.' },
      { you: 'What do you think the ancients are?', they: 'Not fish. I have said so for twenty years and nobody has argued with me twice.' },
    ],
    [
      { you: 'Are you afraid of it?', they: 'Every day. That is why I am still here and the brave ones are not.' },
      { you: 'What should I do differently?', they: 'Nothing. Keep coming up. That is the whole of it and it is harder than it sounds.' },
      { you: 'Tell me about the rod.', they: 'It is a blade, and it is lit. Down here that is not decoration. The fish come to it, and they come fast - most casts take before your line has finished falling.' },
      { you: 'Why give it to me?', they: 'Because you keep coming back up. That is the entire test and almost nobody passes it.' },
    ],
  ],
  yoon: [
    [
      { you: 'Is the rod for sale?', they: 'Technically. Practically? Nah. Not yet.' },
      { you: 'What tier is it?', they: 'Twenty. Sheeeeesh, right? Doesn\'t matter though.' },
      { you: 'Why so far out?', they: 'Nobody sails this far for a rod they don\'t need. Gyattt, that\'s the filter.' },
      { you: 'What are you fishing for?', they: 'Nothing right now. Watching. Sheeeeesh, you can learn a lot watching.' },
      { you: 'Nice boat.', they: 'Bruhhh. It\'s a workbench with a sail. But thanks. Gucci.' },
    ],
    [
      { you: 'What makes it different?', they: 'It doesn\'t waste a streak. That\'s it. That\'s the whole thing.' },
      { you: 'How much?', they: 'You\'ll know when you stop asking. Gyattt, everybody asks.' },
      { you: 'Do you ever fish for fun?', they: 'Every day. Making rods is the work part. Gyattt, fishing\'s the reason.' },
      { you: 'What is the worst rod you have made?', they: 'The first one. Snapped on a bluegill. Betty johnson. I kept the pieces.' },
      { you: 'Do you get lonely out here?', they: 'Lowkey? Sometimes. Then somebody like you shows up and I remember why I\'m out here. Aight, don\'t make it weird.' },
    ],
    [
      { you: 'How did you learn to make them?', they: 'Badly. For like six years. Then it clicked and I still couldn\'t tell you what changed.' },
      { you: 'What does locked in mean to you?', they: 'When you stop counting and you\'re just doing it. Gyattt, it\'s hard to explain.' },
      { you: 'What do you make of my rig?', they: 'Bruhhh. Too much dip on your chip. Half that setup is doing nothing and you are carrying it anyway.' },
      { you: 'What do you listen to out here?', they: 'The water. Gyattt, I know how that sounds. Also the water.' },
    ],
    [
      { you: 'Why not sell in the harbor?', they: 'Because then anybody with coin gets it. That\'s not it. That was never it.' },
      { you: 'Do you miss making them?', they: 'Lowkey, yeah. But I said one rod and I meant one rod.' },
      { you: 'Am I overthinking this?', they: 'Bruhhh. Constantly. That is most of what is between you and the next one.' },
    ],
    [
      { you: 'What happens after I buy it?', they: 'You fish. That\'s it. Gyattt, everybody thinks there\'s a next thing.' },
      { you: 'Was I ever close to failing?', they: 'Nah. Not once. You were locked in way earlier than you think.' },
      { you: 'Tell me about the rod. Properly.', they: 'It reads your streak and it grows with it. Perfect after perfect and the thing keeps getting stronger in your hands. Sheeeeesh.' },
      { you: 'And when I miss?', they: 'It drops back to nothing. All of it, one miss. That is not a punishment, bruhhh, that is the rod being honest about what you were doing.' },
    ],
  ],
  brill: [
    [
      { you: 'What is with the boat?', they: 'Ugly, right? The engine\'s new. I\'d rather the boat looked like this than the other way round. Long story.' },
      { you: 'Were you really on the expeditions?', they: 'Six years. I have stories. I have SO many stories. Sit down or don\'t, they\'re coming either way. Oh we can only sit. They must\'ve run out of budget for animating anything else.' },
      { you: 'Do you come here often?', they: 'Every day. Same spot. I like to think of it as my spawn point. Sorry. Games. I\'ll try to keep it under control. I\'ll probably forget, but I\'ll try!' },
      { you: 'What are you reading?', they: 'A manual for a reel I don\'t own. It\'s fascinating. It\'s genuinely fascinating. Did you know that reels were invented 300-400 AD? That\'s old. I\'m not old though.' },
      { you: 'How is the fishing?', they: 'Slow, which is fine, slow is the point, if I wanted fast I\'d have stayed on the expeditions. That\'s a joke. It was mostly slow there too.' },
    ],
    [
      { you: 'What do you play?', they: 'Everything. Too much. I once played a fishing game for three hundred hours and then bought a boat, so, you know. Draw your own conclusions.' },
      { you: 'Why the Shallows?', they: 'It\'s the starting zone. All the best stories happen in the starting zone. At least that\'s what I tell myself.' },
      { you: 'Did you like the expeditions?', they: 'Parts. The people, the stories, the being useful. Not the getting up. I still can\'t get up. Fishing lets you sit down. That\'s ninety percent of why.' },
      { you: 'What was the three hundred hour game?', they: 'A fishing game. I know. I know. I\'m aware of the irony and I\'ve made peace with it and then I bought a boat.' },
      { you: 'Do you have family out here?', they: 'No. Just the boat and, I guess, whoever stops. So, you, currently. Sorry, that got heavy. It doesn\'t have to be heavy.' },
    ],
    [
      { you: 'What were the expeditions actually like?', they: 'Waiting. Ninety percent waiting. Then a very short amount of something. Then waiting about the something.' },
      { you: 'Do you ever stop talking?', they: 'Once. In a dentist\'s chair. It was the worst twenty minutes of my life.' },
      { you: 'Any tips for a beginner?', they: 'Oh, I have a forty-minute answer. Sit down. The short version is: cast where the water looks bored. The long version has diagrams.' },
    ],
    [
      { you: 'You seem to do all right for yourself.', they: 'Do I? Good. That\'s the plan. Doing all right without it being a thing. I\'ve spent more effort on that than on the fishing.' },
      { you: 'What is the spreadsheet for?', they: 'Patterns. And, honestly, so I have something to reread when it\'s quiet. The last column\'s the important one.' },
    ],
    [
      { you: 'What is the thing you are building?', they: 'A place for green captains to ask forty-minute questions and get forty-minute answers. It has a name. I\'m not ready to say the name.' },
      { you: 'Tell me a story.', they: 'Okay. Okay okay okay. Which decade? I\'m kidding. Sort of. Sit down.' },
    ],
  ],
  turbot: [
    [
      { you: 'What is down there?', they: 'Three boats that did not come back up. Mind where you put that anchor.' },
      { you: 'Does salvage pay?', they: 'It pays in rope. Occasionally it pays in better rope.' },
    ],
    [
      { you: 'How deep do you go?', they: 'Not deep. Long. There is a difference and the long ones are worse.' },
      { you: 'Ever find anything good?', they: 'Define good. I found a kettle last month and I have never been happier.' },
    ],
    [
      { you: 'Tell me about the bell.', they: 'Still hanging. I have never rung it. I am not going to and neither are you.' },
      { you: 'Do you get frightened down there?', they: 'Only on the way up. On the way down you are working.' },
    ],
    [
      { you: 'What is behind the door?', they: 'Ask me when you have earned it. I am not being coy, I am being careful.' },
      { you: 'You mentioned a sister.', they: 'She dives the deep band. Six years. Neither of us will be the one to send word first.' },
    ],
    [
      { you: 'Why did you close the door again?', they: 'Because it had been shut on purpose, and I am not the one who gets to undo that.' },
      { you: 'Send her word. I will carry it.', they: 'You would, as well. Give me a season. I am nearly there.' },
    ],
  ],
  ream: [
    [
      { you: 'You carry messages?', they: 'Anywhere on this sea. No charge. Yes, really.' },
      { you: 'Who is out here?', they: 'More than you would think. Fewer than there were.' },
    ],
    [
      { you: 'What is the news?', they: 'Meg is well, Matty is up if you use his numbers, Marlow is being Marlow. Nothing has changed in years.' },
      { you: 'Why free?', they: 'Ask me when we know each other better. It is not a happy answer.' },
    ],
    [
      { you: 'Does anybody send word to Fitch?', they: 'No. That is exactly why I go.' },
      { you: 'What do they say about me?', they: 'That you stop. Out here that is practically a reputation.' },
    ],
    [
      { you: 'So why free?', they: 'I carried word too slowly once. She was gone by the time it got there. That is the whole answer.' },
      { you: 'Who was she?', they: 'A captain. That is all I will say, and it is more than I have said to anybody.' },
    ],
    [
      { you: 'Who keeps the account when you stop?', they: 'I was rather hoping you had been listening when I brought that up.' },
      { you: 'What did Yoon nearly tell me?', they: 'He said, and I quote, tell them they are locked in. Then he said forget it. So there you are.' },
    ],
  ],
}

const BY_ID = new Map(FOLK.map(f => [f.id, f]))
export function folkById(id: string): Folk | null { return BY_ID.get(id as FolkId) ?? null }

/**
 * WHICH LINE THEY SAY.
 *
 * The first line of this tier they have not said to you yet, and once the tier
 * is exhausted it goes round again from the top rather than falling silent.
 * Silence would be the worst possible answer to a captain who sailed out to
 * talk to somebody.
 */
/**
 * EVERYTHING THEY CAN SAY AT A TIER.
 *
 * The tier's own pool, plus — at the top, where there is no next tier to
 * unlock — the after-max lines behind it. One function so that `nextLine` and
 * `knowsFavourite` walk the SAME list: the latter resolves a seen key back to
 * its text, and if it looked somewhere the former can hand out, a captain
 * could be told a favourite by a line the panel cannot find again.
 */
export function poolFor(folk: Folk, tier: FolkTier): string[] {
  return tier === 4 ? [...folk.lines[4], ...folk.afterMax] : folk.lines[tier]
}

export function nextLine(folk: Folk, tier: FolkTier, seen: readonly string[]): {
  line: string; key: string
} {
  const pool = poolFor(folk, tier)
  const seenSet = new Set(seen)
  const idx = pool.findIndex((_, i) => !seenSet.has(`${folk.id}:${tier}:${i}`))
  const at = idx >= 0 ? idx : Math.floor(Math.random() * pool.length)
  return { line: pool[at], key: `${folk.id}:${tier}:${at}` }
}

/**
 * WHICH OF THEIR THREE THEY WILL ASK FOR NEXT.
 *
 * Derived from the number of deliveries rather than stored, so the cycle cannot
 * drift out of step with the count it is supposed to follow. Modulo twice, so a
 * negative count from a bad row still lands inside the array instead of handing
 * back undefined.
 */
export function favouriteFor(folk: Folk, giftsGiven: number): Favourite {
  const n = folk.favourites.length
  return folk.favourites[(((giftsGiven % n) + n) % n)]
}

/** One of their three, by species id. Null for anything else in the sea, which
 *  is how the server refuses a delivery of the wrong fish. */
export function favouriteById(folk: Folk, fishId: number): Favourite | null {
  return folk.favourites.find(f => f.id === fishId) ?? null
}

/**
 * ── THE KEY AN ASK LEAVES BEHIND ────────────────────────────────────────────
 *
 * Asking somebody what they want is the main way a captain learns one of these
 * now, and `seen_lines` is the only record of what anybody has been told. So an
 * ask writes a key into it in the same array the tier lines use, in a shape
 * that cannot collide with them: tier keys are `id:0-4:index`, and this is
 * `id:want:speciesId`.
 *
 * No new column for it. The array was already there and already meant exactly
 * this: the things this person has said to you.
 */
export const wantKey = (folk: Folk, fishId: number) => `${folk.id}:want:${fishId}`

/**
 * WHICH OF THEIR THREE HAVE THEY ACTUALLY TOLD YOU ABOUT?
 *
 * Two ways to have been told, and both are read off what they have SAID rather
 * than off a tier. The panel used to reveal a favourite at tier 1 because that
 * was roughly when they would have got round to it, which is the game handing
 * over a fact instead of a captain learning one.
 *
 *   THEY MENTIONED IT IN PASSING. Several of the tier pools name a fish, so the
 *   check walks the seen keys, resolves each back to its text, and asks whether
 *   it contains the name. Derived by CONTENT rather than by a stored index, so
 *   reordering a pool cannot silently unlearn something told months ago.
 *
 *   OR YOU ASKED THEM OUTRIGHT. That leaves a `want` key, above.
 */
export function favouritesKnown(folk: Folk, seen: readonly string[]): Favourite[] {
  const known = new Set<number>()
  for (const key of seen) {
    const [id, t, i] = key.split(':')
    if (id !== folk.id) continue
    if (t === 'want') { known.add(Number(i)); continue }
    const line = poolFor(folk, Number(t) as FolkTier)?.[Number(i)]
    if (!line) continue
    const hay = line.toLowerCase()
    for (const f of folk.favourites) {
      if (hay.includes(f.name.toLowerCase())) known.add(f.id)
    }
  }
  return folk.favourites.filter(f => known.has(f.id))
}
