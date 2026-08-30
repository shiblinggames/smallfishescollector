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
 * THE ONE FISH THEY ACTUALLY WANT.
 *
 * Three points against a chat's one, so hunting somebody's favourite is worth
 * three days of turning up. The fastest way to know one of these eight is still
 * to work out what they like and go and catch it, but the gap is a nudge rather
 * than a shortcut.
 *
 * THERE IS NO MIDDLE TIER. Anything that is not their favourite is worth one,
 * full stop. A fish from their own water used to be worth two, which meant the
 * picker had three grades to explain and a captain had to think about habitats
 * to give somebody a present. One special fish and everything else is the same
 * fact in a shape anybody can hold.
 *
 * At the ceiling this is a chat plus a favourite every single day, which is
 * eighteen days to the top tier — the same figure the curve was tuned to before
 * favourites existed.
 */
export const GIFT_FAVOURITE_POINTS = 3

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
   * this cast wear their epithet in front ("Bent Pell", "Old Marlow", "Grey
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
   */
  afterMax: string[]
  /** The moment the bond deepens. One per tier crossed into, so four. */
  tierUp: [string, string, string, string]
  /**
   * THE ONE FISH. Not a list: a single species, theirs, chosen to say
   * something about them. Marlow wants a marlin. Tam Brill, two seasons out
   * and proud of it, wants a bluegill. Nance, who reveres the oldest water,
   * wants the fish that should have been extinct.
   *
   * The name is carried alongside the id so a panel can say it without a
   * round trip to the species table. Rename a species and this needs the same
   * edit, which is the trade and it is worth it here.
   */
  favourite: { id: number; name: string }
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
   * Their reaction. TWO outcomes, because there are two grades of gift: the one
   * fish they want, and everything else.
   *
   * `onLiked` and `onPlain` are a POOL for that second case rather than two
   * grades of it. They were written when a fish from the regular's own water
   * scored higher than a stranger's, and when that middle tier was removed the
   * warmer line had nothing left to fire on. Keeping both as a pair costs
   * nothing, keeps nine good lines in the game, and means handing somebody an
   * ordinary fish twice does not read back the identical sentence.
   */
  onLoved: string
  onLiked: string
  onPlain: string
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CAST
//
// Every one of these voices is grown from the single line they already had on
// the chart, which is why they do not sound like each other: Meg was always
// practical, Pell was always short with you, Marlow was always working an
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
    // Honest, solid, nothing clever. Exactly her.
    favourite: { id: 8, name: 'Largemouth Bass' },
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
        "The harbour thinks the Shallows are the easy water. The Shallows are the water that decides whether you carry on.",
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
    ],
    tierUp: [
      "You keep turning up. All right. Meg. That is what I go by, and now you know it.",
      "Pull alongside properly next time. You are not a queue, you are a regular.",
      "I will tell you something I do not tell the harbour: I set my rate by the captain, not the catch. Yours has been the good one for a while.",
      "You are one of mine now. That is not a discount, it is better than one.",
    ],
    onLoved: "Now that is a fish. I will not weigh this one, I will keep it.",
    onLiked: "Kind of you. It will not go to waste, I promise you that.",
    onPlain: "For me? Go on then. I will find a use for it.",
  },
  {
    id: 'pell', name: 'Bent Pell', short: 'Pell', zoneId: 'open_waters', buys: false,
    greeting: "What.",
    face: { characterColor: 'blue', hat: 'gray', bg: '#0c1620', ring: '#7fa8c8', mirrored: true },
    role: 'Someone to know', accent: '#7fa8c8',
    blurb: 'Short with everybody, and it is genuinely nothing personal.',
    // The fastest thing in his water, for the one who cannot stand waiting.
    favourite: { id: 22, name: 'Wahoo' },
    lines: [
      [
        "Fish don't keep and neither does my patience. Coin now, or row it home yourself.",
        "You are drifting. Say what you came to say or let me get on.",
        "Everybody out here has a story. I am buying fish.",
      ],
      [
        "You again. Fine. You are quick, I will give you that.",
        "Most captains waste a minute of my day. You waste about forty seconds. That is nearly respect.",
        "Do not take the short way past the reef in a swell. That is free, and it is all you are getting.",
        "A wahoo. That is the one. Fastest thing in this water and I have never once been bored watching one come in. Do not read anything into that.",
      ],
      [
        "Sit if you are sitting. Do not hover. Hovering is worse than talking.",
        "I am not short with you because I dislike you. I am short with everyone. It saves an enormous amount of time.",
        "You have a good eye for weather. I have watched you turn back twice before it got bad, and both times it got bad.",
        "You have started saying less to me. I have noticed and I approve.",
      ],
      [
        "I talked slower once. Had a boat, a partner and half this water. Now I have the water.",
        "Everyone thinks the middle band is the boring one. The middle band is where the shipping went, and where shipping goes, coin follows.",
        "Ask me a thing. Quick, while I am in the mood, because I will not be in a minute.",
        "Everyone out here wants to tell me about the one that got away. You have never once done that.",
        "There is a bank two hours south that nobody works because it is two hours south. Think about that and then go.",
      ],
      [
        "I will say this once and then never again: I look for your sail. Do not make it a whole thing.",
        "That partner I mentioned. He went out past the shelf and did not come back, and I have bought fish in the same spot every day since in case he does.",
        "You are the only captain I do not hurry. Work out what that is worth and do not tell anyone.",
        "I was not always like this. I do not want to talk about it. I am saying it so you know it is not you.",
        "If you are ever out here and something has gone badly wrong, come to me first. I am quick. That is the whole of what I am good for.",
      ],
    ],
    afterMax: [
      "Still looking for your sail. Still not making a thing of it.",
      "I said I was quick. I have never told you what I am slow at. Ask me sometime and I might.",
      "You did not come yesterday. I noticed at about the hour you usually do. That is all I am saying.",
      "I have started leaving the good spot on the rail clear. It is not for you. It is for you.",
      "Nothing has gone badly wrong yet. I keep being ready anyway. Old habit, and a useful one.",
    ],
    tierUp: [
      "Right. You are not a stranger. You are a nuisance I recognise. Progress.",
      "You get the good rate and the short version. Both are compliments.",
      "Go on then, ask your questions. I have decided you are worth the minute.",
      "I do not have friends out here. I have you, and that is a thing I will be sorting out in my own time.",
    ],
    onLoved: "Now you are talking. That is a proper fish and you knew it when you brought it.",
    onLiked: "That will do. That will do nicely, actually. Do not make a fuss.",
    onPlain: "Right. Yes. Thank you. Now go and catch something.",
  },
  {
    id: 'marlow', name: 'Old Marlow', short: 'Marlow', zoneId: 'deep', buys: false,
    greeting: "You found me. Everybody does, eventually.",
    face: { characterColor: 'gray', hat: 'black', bg: '#101418', ring: '#a8b4c0', mirrored: true },
    role: 'Someone to know', accent: '#b0bcc8',
    blurb: 'Sits still in deep water and lets everybody else do the sailing.',
    // Old Marlow wants a marlin. He has never once acknowledged this.
    favourite: { id: 38, name: 'Blue Marlin' },
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
        "I have been out here so long the water is more of a home than the harbour was, and I was born in the harbour.",
        "You keep sailing out to an old buyer who charges you for the privilege. I stopped working out why and started being glad.",
      ],
    ],
    afterMax: [
      "You are early. The water is flat. There is no reason for either of us to hurry, so we will not.",
      "I told you about the wreck at the eastern edge. I have not moved what is in it. I want that understood.",
      "Some days I do not weigh anything at all. Those are not the bad days. I used to think they were.",
      "You have started sounding like somebody who lives out here. I am not sure that is a kindness.",
      "Forty years of this and the sea still does something new every month. Stay long enough and it will show you.",
    ],
    tierUp: [
      "Marlow. Old Marlow if you like, everyone else does, and I stopped minding it a long time ago.",
      "You are one of my regulars now. There are six. Two of them are terrible.",
      "I do not usually talk while I weigh. With you I have noticed I do.",
      "You have my trust, which is worth nothing, and my company, which out here is worth a great deal more.",
    ],
    onLoved: "Well now. I have not held one of these in years. I am not going to weigh it and you cannot make me.",
    onLiked: "Generous. I will eat well and think better of you than I already do.",
    onPlain: "You did not have to. I will remember that you did.",
  },
  {
    id: 'fitch', name: 'Quiet Fitch', short: 'Fitch', zoneId: 'abyss', buys: false,
    greeting: "Mm.",
    face: { characterColor: 'storm', hat: 'midnight', bg: '#080c14', ring: '#6878a0', mirrored: true },
    role: 'Someone to know', accent: '#8090b8',
    blurb: 'Lives in the dark water. Says very little about anything.',
    // The one that carries its own light down there, which he has a line about.
    favourite: { id: 41, name: 'Anglerfish' },
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
        "There is a light down there that is not a fish. Do not chase it, and do not tell the harbour I said so.",
        "If I am ever not here, do not look for me. Go up and stay up. That is the only favour I will ever ask.",
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
    ],
    tierUp: [
      "Fitch.",
      "You can stay a while. If you want.",
      "I have started expecting you. That is new for me.",
      "You are the one I would tell, if there were ever anything worth telling.",
    ],
    onLoved: "Ah. You brought it up alive. Good.",
    onLiked: "Thank you. Truly.",
    onPlain: "That was kind. I do not have much to say to kind.",
  },
  {
    id: 'nance', name: 'Grey Nance', short: 'Nance', zoneId: 'ancient_deep', buys: false,
    greeting: "You are a long way out.",
    face: { characterColor: 'ice', hat: 'offwhite', bg: '#0a1018', ring: '#9ec4d8', mirrored: true },
    role: 'Someone to know', accent: '#9ec4d8',
    blurb: 'Keeps the count of who goes down to the oldest water and comes back up.',
    // The fish that should have been extinct, for the one who reveres old water.
    favourite: { id: 50, name: 'Coelacanth' },
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
        "This water is older than the harbour, older than the reef, older than whatever put the reef there.",
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
      "I have written some of it down. Not for the harbour. For whoever is out here after me.",
      "Bring me nothing today. Sit there. That is a thing you are allowed to do.",
      "I told you the deep takes whoever it likes. It has not taken you. I am not calling that luck out loud.",
      "You will be the old one out here one day. Start noticing what you would want to pass on.",
    ],
    tierUp: [
      "Nance. Grey Nance to the harbour, just Nance to whoever comes back twice.",
      "You are welcome at my boat, and out here that sentence means something.",
      "I trust you with this water. There is nobody else I would say that to.",
      "You are the one who comes back. Of everyone I have weighed for, you are the one who comes back.",
    ],
    onLoved: "You brought this to me first. Ahead of the harbour, ahead of the coin. I will not forget it.",
    onLiked: "From the old water, and you gave it away. You are a strange captain and I like you for it.",
    onPlain: "Thank you. It is a long way to carry a gift.",
  },
  {
    id: 'yoon', name: 'Yoon', short: 'Yoon', zoneId: 'ancient_deep', buys: false,
    greeting: "Ayo. Sheeeeesh, look who it is.",
    face: { characterColor: 'golden', hat: 'black', bg: '#141008', ring: '#f0c040', mirrored: true },
    role: 'Someone to know', accent: '#f0c040',
    blurb: 'Carries one rod that no shop will stock, and an opinion on whether you deserve it.',
    // Twenty feet of ribbon out of the dark. Gyattt.
    favourite: { id: 49, name: 'Oarfish' },
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
      ],
      [
        "Gyattt. You came back and you didn't even bring the coin. That's way more interesting.",
        "The rod's not the hard part. The hard part's the hand.",
        "Gyattt, you want it already? Betty johnson. Come back when the hand's ready.",
        "Oarfish. Twenty feet of ribbon out of the black. Bruhhh. Bring me one of those and I will actually stop working for the afternoon.",
      ],
      [
        "I made it. Not the tier, the rod. The one on my boat. Made it, then I stopped making.",
        "A perfect cast isn't luck twenty times. It's one thing you learned, done twenty times. Gyattt, when you say it out loud.",
        "You were so locked in on that last run. I watched the whole thing. Gyattt. Don't let it get to your head.",
        "Bruhhh, that hold is heavy. You've been out here since the light came up, huh.",
      ],
      [
        "There were three of us making rods out here. Other two sell in the harbour now. They're good, no shade.",
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
        "Everything's gucci out here when you're fishing like this. Gyattt. Don't tell the harbour I said gucci.",
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
    onLoved: "Gyattt. You hauled this all the way out here for me? Sit down. I'm gonna tell you how it's caught properly.",
    onLiked: "Good fish, clean handling. Gucci.",
    onPlain: "Betty johnson. I'll take it. I don't eat much out here anyway.",
  },

  // ── THE THREE WHO KEEP NO SHOP ─────────────────────────────────────────
  // Added with this system, and deliberately social only: nothing they do is
  // a transaction, so meeting them is never confused with doing business. One
  // apiece in the three waters a captain actually lives in, chosen to fill the
  // gaps in the cast's voice rather than the gaps on the map. The Shallows had
  // only Meg's flat practicality, Open Waters only Pell's impatience, and the
  // Deep only Marlow working his angle.

  {
    id: 'brill', name: 'Tam Brill', short: 'Tam', zoneId: 'shallows', buys: false,
    greeting: "Oh! Hello. Hi.",
    face: { characterColor: 'default', hat: 'green', bg: '#0e1810', ring: '#8cc890', mirrored: true },
    role: 'Someone to know', accent: '#8cc890',
    blurb: 'Two seasons out and convinced everyone else is a legend.',
    // The first fish anybody catches, and he is not embarrassed about it.
    favourite: { id: 1, name: 'Bluegill' },
    lines: [
      [
        "You are a real captain. Sorry. That was out loud.",
        "I have been out here two seasons. Everyone says that is nothing. It does not feel like nothing.",
        "Do not let me hold you up. Unless you have a minute. Do you have a minute?",
      ],
      [
        "You stopped! Most do not stop.",
        "I watched you land one off the point yesterday. I tried the same spot. I caught weed.",
        "Is it true there is water so deep the fish make their own light? Somebody in the harbour told me and then laughed.",
        "My favourite is a bluegill. I know. Everyone laughs. It was the first thing I ever caught and I am not going to pretend otherwise.",
      ],
      [
        "I have a question saved up. I have had it saved up for a week. How do you know when to reel?",
        "My boat is called Second Try. The first one is on the bottom of the harbour and we do not talk about it.",
        "Everyone told me the Shallows are for beginners. You are here. You are not a beginner. So that is rubbish, is it not?",
        "I practised what I was going to say to you. Then you turned up and I said none of it.",
      ],
      [
        "I am going out past the shelf next month. Do not tell Meg, she will do the face.",
        "My father fished this water and never went past it. I do not want that. I want to see the dark one.",
        "When you talk about out there your voice changes. I am not being strange, I have noticed it, that is all.",
        "Do you ever get scared out there? You can say no. I would like it if you said yes.",
        "I have started keeping a log. Nothing happens in it yet. But I have got one.",
      ],
      [
        "You are the reason I did not pack it in after the first winter. I have wanted to say that for ages.",
        "I landed something proper last week. Nobody saw. I sat there grinning like a fool for an hour.",
        "One day I will pull alongside you out in the deep and you will not recognise me, and that will be the best day of my life.",
        "I nearly went home last winter. My boat was leaking, I could not fix it, and nobody was coming. Then you sailed past and waved.",
        "One day somebody green is going to pull alongside me and I will be the one who knows things. I think about that a lot.",
      ],
    ],
    afterMax: [
      "I fixed the leak myself. Took me four days and it is ugly and it holds.",
      "Somebody green pulled alongside me last week. I knew the answer. I have never felt taller.",
      "I do not grin like a fool any more when I land something. I do it on the inside now. Progress.",
      "You waved at me once when I was about to quit. I have never told you which day it was and I never will.",
      "I have started going a bit deeper. Not far. Further than last season, and that is the whole point.",
    ],
    tierUp: [
      "Tam! Tam Brill. You asked my name. Nobody asks my name.",
      "Are we friends? Do not answer that. I am going to assume.",
      "I tell people I know you. I hope that is all right. I will stop if it is not.",
      "You are the best thing about this water and I am going to keep saying it until you sail off.",
    ],
    onLoved: "For me? That is a proper one. I am not eating this, I am keeping it until it is a problem.",
    onLiked: "You gave me a fish. I am going to be insufferable about this all week.",
    onPlain: "Thank you! Genuinely. Nobody gives me anything out here.",
  },
  {
    id: 'turbot', name: 'Cass Turbot', short: 'Cass', zoneId: 'open_waters', buys: false,
    greeting: "Mind where you drop that anchor.",
    face: { characterColor: 'forest', hat: 'olive', bg: '#0c1410', ring: '#88b09c', mirrored: true },
    role: 'Someone to know', accent: '#88b09c',
    blurb: 'Dives the wrecks and comes up with stories, some of them true.',
    // Cobia hang around wreckage, which is where she spends her working day.
    favourite: { id: 21, name: 'Cobia' },
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
        "If I ever come up saying I saw nothing down there, get me to the harbour. That is not a joke.",
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
    ],
    tierUp: [
      "Cass. Turbot if you are being formal, and nobody out here is being formal.",
      "You can moor near me. Near, not over. I will show you where.",
      "I have started saving the good stories for you, which is a bad habit and I am not stopping.",
      "There are two of us who know what is behind that door now. Sleep well.",
    ],
    onLoved: "Out of the current, that one. You had to work for it. I can see you had to work for it.",
    onLiked: "Fresh food out here is worth more than salvage. I am not exaggerating.",
    onPlain: "That is decent of you. I eat what I find, mostly, and what I find is usually rope.",
  },
  {
    id: 'ream', name: 'Rue Bream', short: 'Rue', zoneId: 'deep', buys: false,
    greeting: "News, or are you just passing?",
    face: { characterColor: 'lavender', hat: 'purple', bg: '#12101c', ring: '#b0a0d0', mirrored: true },
    role: 'Someone to know', accent: '#b0a0d0',
    blurb: 'Carries news between the regulars and remembers all of it.',
    // Plain, dependable, everywhere. A messenger's fish.
    favourite: { id: 27, name: 'Atlantic Cod' },
    lines: [
      [
        "I carry word between the boats out here. No, there is no charge. That surprises everyone.",
        "You are new to me. I will remember you now, that is how this works.",
        "Meg is well. You did not ask. I am telling you anyway.",
      ],
      [
        "Marlow asked after you. He would deny it, so do not bring it up.",
        "I know where everybody is. Not because it is my business. Because nobody else keeps track.",
        "Pell said something almost warm about you. I have written the date down.",
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
        "Tam Brill asks after you every time. Every time. I have started making things up so he has something.",
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
    ],
    tierUp: [
      "Rue. Rue Bream. Now you are on my list, which is a real list and it is quite short.",
      "I will carry word for you. Anywhere on this sea, no charge, you only have to ask.",
      "You get the real news now, not the harbour version.",
      "You are the last name on the list and the only one who ever asked how I was.",
    ],
    onLoved: "You remembered. I mentioned this once, months ago, and you remembered.",
    onLiked: "Kind. I will eat it somewhere between here and the Abyss and think well of you.",
    onPlain: "A gift for the messenger. That does not happen. Thank you.",
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
      { you: 'Quick sale?', they: 'Fastest out here. That is not a boast, it is the only thing I sell.' },
      { you: 'Bad day?', they: 'Every day. Next question.' },
    ],
    [
      { you: 'Why so fast?', they: 'Because slow is how you end up holding a hold full of yesterday.' },
      { you: 'Anyone else about?', they: 'Three boats north, one of them lost. Not my problem, or yours.' },
    ],
    [
      { you: 'Do you ever stop?', they: 'When the light goes. Then I sit and I talk to nobody. Best hour of the day.' },
      { you: 'Worst catch you have ever bought?', they: 'A hold of weed and one boot. He was very proud of the boot.' },
    ],
    [
      { you: 'Who were you before this?', they: 'Somebody with a partner and half this water. Ask me the other half another time.' },
      { you: 'Do you even like the work?', they: 'I am good at it. Liking it was never part of the arrangement.' },
    ],
    [
      { you: 'Tell me about him.', they: 'Slowest hand I ever sailed with. Never once beat him to a fish.' },
      { you: 'Do you still wait?', they: 'Same spot, same hour, every day. Draw your own conclusion and do not say it out loud.' },
    ],
  ],
  marlow: [
    [
      { you: 'Why so far out?', they: 'Because you came anyway. That is the whole business model.' },
      { you: 'Is the rate fixed?', they: 'Fixed by the distance you just sailed. I only read it out.' },
    ],
    [
      { you: 'Do you ever go ashore?', they: 'Not in nine years. The harbour and I agreed to stop pretending.' },
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
    ],
    [
      { you: 'What makes it different?', they: 'It doesn\'t waste a streak. That\'s it. That\'s the whole thing.' },
      { you: 'How much?', they: 'You\'ll know when you stop asking. Gyattt, everybody asks.' },
    ],
    [
      { you: 'How did you learn to make them?', they: 'Badly. For like six years. Then it clicked and I still couldn\'t tell you what changed.' },
      { you: 'What does locked in mean to you?', they: 'When you stop counting and you\'re just doing it. Gyattt, it\'s hard to explain.' },
      { you: 'What do you make of my rig?', they: 'Bruhhh. Too much dip on your chip. Half that setup is doing nothing and you are carrying it anyway.' },
    ],
    [
      { you: 'Why not sell in the harbour?', they: 'Because then anybody with coin gets it. That\'s not it. That was never it.' },
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
      { you: 'How long have you been out?', they: 'Two seasons! Nearly. It is one and a bit if you are going to be strict about it.' },
      { you: 'Caught much?', they: 'Some! Not loads. Some.' },
    ],
    [
      { you: 'What are you fishing for?', they: 'Whatever bites. I have not earned a favourite yet.' },
      { you: 'Is that your boat?', they: 'Second Try. The name is a whole thing. I will tell you when I know you better.' },
    ],
    [
      { you: 'What happened to the first boat?', they: 'It is on the bottom of the harbour, I was fifteen, and that is all anybody needs.' },
      { you: 'Do you want to go deeper?', they: 'More than anything. Also I am terrified. Both at once, constantly.' },
    ],
    [
      { you: 'What does your family make of it?', they: 'My father fished here his whole life and never went past the shelf. He thinks I am mad.' },
      { you: 'What goes in the log?', they: 'Dates, mostly. And the day you first stopped to talk to me, which is a bit much, I know.' },
    ],
    [
      { you: 'You are ready, you know.', they: 'Do not say that. Say it again.' },
      { you: 'Come out with me some time.', they: 'Yes. Yes. Right now? No. I need a week. But yes.' },
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
      { you: 'What is the news?', they: 'Meg is well, Pell is furious, Marlow is being Marlow. Nothing has changed in years.' },
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
 * HAVE THEY ACTUALLY TOLD YOU WHAT THEY LIKE?
 *
 * Read off the lines they have SAID, not off a tier. The panel used to reveal
 * the favourite at tier 1 because that was roughly when they would have got
 * round to it, which is the game handing over a fact rather than the captain
 * learning one. Now the reveal and the telling are the same event: the check
 * walks the seen-line keys, resolves each back to its text, and asks whether
 * any of them names the fish.
 *
 * Derived by CONTENT rather than by a stored index, so reordering a pool
 * cannot silently unlearn something a captain was told months ago.
 */
export function knowsFavourite(folk: Folk, seen: readonly string[]): boolean {
  const needle = folk.favourite.name.toLowerCase()
  for (const key of seen) {
    const [id, t, i] = key.split(':')
    if (id !== folk.id) continue
    const line = poolFor(folk, Number(t) as FolkTier)?.[Number(i)]
    if (line && line.toLowerCase().includes(needle)) return true
  }
  return false
}

/** How well a gift lands. Nothing is ever refused: a captain who sailed all
 *  the way out with a fish should never be told they picked the wrong one, so
 *  the worst case is still a point and a warm line. */
export function giftWorth(folk: Folk, fishId: number): {
  points: number; how: 'loved' | 'plain'
} {
  if (fishId === folk.favourite.id) return { points: GIFT_FAVOURITE_POINTS, how: 'loved' }
  return { points: 1, how: 'plain' }
}
