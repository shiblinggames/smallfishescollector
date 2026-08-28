// ── WHAT FINN ACTUALLY ASKS OF YOU ──────────────────────────────────────────
//
// Plain module, NOT 'use server': every export here is pure data or a pure
// function, and that directive silently drops both.
//
// ── FROM A BET TO A JOB ─────────────────────────────────────────────────────
//
// He used to offer WAGERS. You accepted, a hidden counter watched you, and at
// some point you were told whether you had won. It had two problems. The bet
// was never a thing you went and DID, it was a thing that happened to you while
// you fished normally; and it sat off to the side of the story, so a captain
// could take twenty bets and hear nothing new.
//
// They are jobs now, and they are the spine of the campaign. He tells you
// something, he asks you for something, and the next thing he has to say is
// behind it. Beat, job, beat, job. Nobody gets the next piece of the story
// without doing the work in between, and the work is always fishing, because
// the only thing he has ever cared about is whether your hands are any good.
//
// ── HOW A JOB IS MEASURED ───────────────────────────────────────────────────
//
// SNAPSHOT AT ACCEPT, COMPARE AT TURN-IN. Every counter these read is one the
// cast path already maintains for other reasons, so taking a job adds nothing
// to the hot loop and a job cannot be farmed by the client: the numbers are
// read off the profile and the species table on the server, both times.
//
// It also means a job cannot be completed retroactively. A captain sitting on
// a streak of nine who takes "three in a row" has not already finished it,
// because the delta since accept is what counts. That hole was closed once
// before on the old bets and it stays closed here.
//
// ── AND YOU HAVE TO BRING IT BACK ───────────────────────────────────────────
//
// Finishing a job pays nothing on its own. You sail back to him and hand it
// over, which is the whole reason he is moored somewhere reachable, and is what
// turns "a counter filled up" into "I went and told him".

export type FinnQuestType =
  | 'catch_any'
  | 'land_perfects'
  | 'perfect_streak'
  | 'catch_zone'
  | 'catch_rarity'
  | 'catch_ancient'

export type FinnQuest = {
  /** Stable. Stored on the profile and never renumbered. */
  id: string
  type: FinnQuestType
  target: number
  /** catch_zone only: the habitat a fish must have come from. */
  zone?: string
  /** catch_rarity only: the bite_rarity a fish must meet or beat. */
  minRarity?: number
  /** catch_ancient only: WHICH giant. The six are handed out one at a time, by
   *  name, in the order the water raises them (lib/ancientVigil ANCIENT_IDS),
   *  so a job can name the one that is actually coming next. */
  ancientId?: number
  /** Said plainly, because it is a task. No flourishes in the objective. */
  label: string
  /** Doubloons on turn-in. */
  reward: number
  /**
   * FISHING LEVEL BEFORE HE WILL EVEN ASK.
   *
   * Matches the level gate on the water the job is set in, so he can never
   * hand you something you are not allowed to work. The ladder used to
   * escalate through the bands without checking, which meant a captain at
   * level five could be told to land twelve in the Deep and simply be stuck:
   * the campaign would stop dead with no explanation and no way forward.
   *
   * It also paces the story properly. His jobs walk out through the zones as
   * you unlock them, so the arc arrives in the Ancient Deep at the same moment
   * you do, rather than talking about old water you have never seen.
   */
  minLevel: number
  /** The water this job belongs to, for grouping and for what he says when you
   *  are not there yet. */
  band: string
  /** What he says when the next job is above your level. Never a refusal: he
   *  is waiting for you to be ready, which is his whole character. */
  gated: string
  /** What he says handing it over. */
  give: string
  /** What he says when you come back with it done. */
  done: string
  /** What he says when you come back with it NOT done. Never scolding: he is
   *  a rival, not a foreman, and the job has no clock on it. */
  waiting: string
}

/**
 * THE LADDER, in the order he sets it.
 *
 * One job sits after each story beat, and the shape of it answers what he just
 * said: he mentions the old water, the next job sends you deeper; he admits
 * his own hands never worked down there, the next job asks for the thing his
 * never managed. The difficulty climbs with the story rather than beside it.
 *
 * NO TIMERS ANYWHERE. The old speed bet had a deadline, which meant closing the
 * tab could lose you a wager you had paid attention to. These wait as long as
 * you do. The house law is player-paced and a stopwatch on the campaign's only
 * delivery route is the least player-paced thing in the game.
 */
export const FINN_QUESTS: FinnQuest[] = [
  // ── THE SHALLOWS (Fishing 1) ────────────────────────────────────────
  {
    id: 'q1', type: 'catch_any', target: 8, reward: 220, minLevel: 1, band: 'shallows',
    label: 'Land 8 fish, anywhere',
    give: "Nothing clever. Go and pull eight out of the water and come back to me. I want to watch how you hold the rod, not what you catch with it.",
    done: "Eight. And not one of them fought you the same way twice. I noticed.",
    waiting: "Eight. You are not at eight. Off you go.",
    gated: "Go and fish. Come back when you have done some of it.",
  },
  {
    id: 'q2', type: 'land_perfects', target: 4, reward: 320, minLevel: 1, band: 'shallows',
    label: 'Land 4 perfect catches',
    give: "Anybody can land a fish. Land four PERFECT and I will start paying attention properly.",
    done: "Four clean ones. Most anglers manage that by accident once a season.",
    waiting: "Four perfect. Not four fish. There is a difference and it is the entire difference.",
    gated: "Not yet. Get some water under you first.",
  },
  {
    id: 'q3', type: 'catch_zone', target: 15, zone: 'shallows', reward: 400, minLevel: 1, band: 'shallows',
    label: 'Land 15 fish in the Shallows',
    give: "Fifteen out of the shallow water. It is not hard and it is not meant to be. It is meant to be a habit.",
    done: "Fifteen. You have stopped thinking about the shallows, which means they are finished with you.",
    waiting: "The Shallows. Fifteen. You have been elsewhere, have you not.",
    gated: "Start where everybody starts.",
  },

  {
    id: 'q21', type: 'catch_rarity', target: 2, minRarity: 2, reward: 460, minLevel: 1, band: 'shallows',
    label: 'Land 2 uncommon or better fish',
    give: "Two that are not the usual. The shallow water has better in it than people think, they just stop looking.",
    done: "Two. You have started seeing what is actually down there rather than what you expected.",
    waiting: "Uncommon or better. Look properly.",
    gated: "Go and fish first.",
  },
  {
    id: 'q22', type: 'perfect_streak', target: 3, reward: 520, minLevel: 1, band: 'shallows',
    label: 'Land 3 perfect catches in a row',
    give: "Three without a miss. It is the smallest run worth calling a run, and you will be surprised how it goes wrong.",
    done: "Three straight. Do that ten more times and it stops being luck.",
    waiting: "In a row. One miss and it starts again.",
    gated: "Not yet.",
  },
  {
    id: 'q23', type: 'catch_any', target: 30, reward: 600, minLevel: 1, band: 'shallows',
    label: 'Land 30 fish',
    give: "Thirty. Any water, any fish. There is no trick to this one, I want the hours in your hands.",
    done: "Thirty. That is the part nobody puts in the stories and it is most of the work.",
    waiting: "Thirty. You are not close and that is fine.",
    gated: "Go and fish.",
  },
  // ── OPEN WATERS (Fishing 15) ────────────────────────────────────────
  {
    id: 'q4', type: 'catch_zone', target: 10, zone: 'open_waters', reward: 560, minLevel: 15, band: 'open_waters',
    label: 'Land 10 fish in Open Waters',
    give: "The Shallows have taught you everything they are going to. Take ten out of Open Waters and stop wading.",
    done: "Ten, out where the bottom stops being a suggestion. Good.",
    waiting: "Open Waters. Past the shelf. You have not been out there enough.",
    gated: "Open Waters is the next thing and you are not rated for it yet. Go and get levelled.",
  },
  {
    id: 'q5', type: 'perfect_streak', target: 5, reward: 700, minLevel: 15, band: 'open_waters',
    label: 'Land 5 perfect catches in a row',
    give: "Five in a row. Not five in a day, five without a single miss between them. That is a hand, not a habit.",
    done: "Five straight. I have watched a hundred anglers try that and I am not exaggerating the number.",
    waiting: "In a ROW. One miss and you start again. That is what makes it worth asking for.",
    gated: "Come back when you have grown into it.",
  },
  {
    id: 'q6', type: 'catch_rarity', target: 3, minRarity: 3, reward: 880, minLevel: 15, band: 'open_waters',
    label: 'Land 3 rare or better fish',
    give: "Three rare ones. The water decides who gets those, and I want to see whether it has decided about you.",
    done: "Three. The water is making up its mind about you, and I do not think it is going the way I expected.",
    waiting: "Rare, I said. Common fish are just weather.",
    gated: "Not at your level. The water does not hand those to beginners.",
  },

  {
    id: 'q24', type: 'land_perfects', target: 10, reward: 1000, minLevel: 15, band: 'open_waters',
    label: 'Land 10 perfect catches',
    give: "Ten clean. Not in a row, just ten. I want to see whether the good ones are becoming the normal ones.",
    done: "Ten. They are becoming the normal ones.",
    waiting: "Ten perfect. Take as long as you like.",
    gated: "Come back when you are rated for this water.",
  },
  {
    id: 'q25', type: 'catch_zone', target: 25, zone: 'open_waters', reward: 1150, minLevel: 15, band: 'open_waters',
    label: 'Land 25 fish in Open Waters',
    give: "Twenty five out of the middle water. Long job. Do it around everything else you are doing.",
    done: "Twenty five. You know that water now, which is different from having been there.",
    waiting: "Open Waters. Twenty five. It adds up faster than you think.",
    gated: "Not until you can work it.",
  },
  {
    id: 'q26', type: 'catch_any', target: 60, reward: 1300, minLevel: 15, band: 'open_waters',
    label: 'Land 60 fish',
    give: "Sixty, anywhere. I am not testing your nerve with this one, I am testing whether you keep going.",
    done: "Sixty. Most captains stop somewhere in the forties and never notice they stopped.",
    waiting: "Sixty. Keep at it.",
    gated: "Later.",
  },
  // ── THE DEEP (Fishing 30) ───────────────────────────────────────────
  {
    id: 'q7', type: 'catch_zone', target: 12, zone: 'deep', reward: 1200, minLevel: 30, band: 'deep',
    label: 'Land 12 fish in the Deep',
    give: "The Deep. Twelve of them. It is a long sail and that is deliberate, I want to see if you come back.",
    done: "Twelve, and you came back up. That second part is the one I was watching.",
    waiting: "The Deep. Past the abyss talk, before the black. Twelve.",
    gated: "The Deep is the next water and it is not open to you yet. Go and earn it.",
  },
  {
    id: 'q8', type: 'land_perfects', target: 20, reward: 1500, minLevel: 30, band: 'deep',
    label: 'Land 20 perfect catches',
    give: "Twenty perfect. Take your time. I am not going anywhere and neither, apparently, are you.",
    done: "Twenty. You have stopped counting them, have you not. That is when it starts working.",
    waiting: "Twenty clean. You are not there yet and there is no hurry.",
    gated: "Later. You are not deep enough into this.",
  },
  {
    id: 'q9', type: 'perfect_streak', target: 8, reward: 1900, minLevel: 30, band: 'deep',
    label: 'Land 8 perfect catches in a row',
    give: "Eight in a row. I could not do six on my best day and I have had a great many days.",
    done: "Eight straight. I want to be sour about that and I find I am not.",
    waiting: "Eight, unbroken. It is meant to be hard. That is the whole of the request.",
    gated: "Not yet. Ask me again when the deep water knows your name.",
  },

  {
    id: 'q27', type: 'catch_rarity', target: 4, minRarity: 3, reward: 2200, minLevel: 30, band: 'deep',
    label: 'Land 4 rare or better fish',
    give: "Four rare, out of deep water. They are down there in numbers the shallows never see.",
    done: "Four. The deep gives them up more readily to somebody it has decided about.",
    waiting: "Rare or better. Four of them.",
    gated: "The Deep first.",
  },
  {
    id: 'q28', type: 'catch_zone', target: 25, zone: 'deep', reward: 2500, minLevel: 30, band: 'deep',
    label: 'Land 25 fish in the Deep',
    give: "Twenty five out of the Deep. That is a lot of sailing and I am aware of it.",
    done: "Twenty five. You have spent more hours down there this month than I have this year.",
    waiting: "The Deep. Twenty five. It is a long one on purpose.",
    gated: "Not yet.",
  },
  {
    id: 'q29', type: 'catch_any', target: 100, reward: 2900, minLevel: 30, band: 'deep',
    label: 'Land 100 fish',
    give: "A hundred. Anywhere, anything. Nobody has ever asked you for a number like that and meant it kindly.",
    done: "A hundred. There is nothing clever about it and it is still the hardest thing I have asked you for.",
    waiting: "A hundred. Chip at it.",
    gated: "Later.",
  },
  // ── THE ABYSS (Fishing 50) ──────────────────────────────────────────
  {
    id: 'q10', type: 'catch_zone', target: 10, zone: 'abyss', reward: 2400, minLevel: 50, band: 'abyss',
    label: 'Land 10 fish in the Abyss',
    give: "The Abyss. Ten. Everything down there has teeth or lights or both, and none of it has ever been polite to me.",
    done: "Ten out of the black. You did that in the time it takes most captains to work up to looking at it.",
    waiting: "The Abyss. Where it stops being blue. Ten of them.",
    gated: "The black water. Not at your level, and I am not sending you down there to prove me wrong.",
  },
  {
    id: 'q11', type: 'catch_rarity', target: 5, minRarity: 4, reward: 3000, minLevel: 50, band: 'abyss',
    label: 'Land 5 epic or better fish',
    give: "Five of the real ones. Not rare. The ones the water only hands over when it has decided something about the hand on the rod.",
    done: "Five. It has decided, then.",
    waiting: "Epic or better. If you are not sure whether it counted, it did not.",
    gated: "Those do not come to captains at your level. Go on.",
  },
  {
    id: 'q12', type: 'perfect_streak', target: 12, reward: 3800, minLevel: 50, band: 'abyss',
    label: 'Land 12 perfect catches in a row',
    give: "Twelve without a miss. There is nothing left I can ask you for that is harder than this and still fair.",
    done: "Twelve. Straight. I have run out of things to test and I am not sure what I do now.",
    waiting: "Twelve in a row. Take a season over it if you need to. I have waited longer.",
    gated: "Not yet. That one is for somebody further along than you.",
  },

  {
    id: 'q30', type: 'land_perfects', target: 40, reward: 4300, minLevel: 50, band: 'abyss',
    label: 'Land 40 perfect catches',
    give: "Forty clean ones. At this point I am not testing anything. I just want to watch you do it forty times.",
    done: "Forty. I have stopped being able to tell when you are trying.",
    waiting: "Forty perfect. No hurry on this one at all.",
    gated: "Not at your level.",
  },
  {
    id: 'q31', type: 'catch_zone', target: 22, zone: 'abyss', reward: 4900, minLevel: 50, band: 'abyss',
    label: 'Land 22 fish in the Abyss',
    give: "Twenty two out of the black. Most captains never manage two. Take your lantern and your patience.",
    done: "Twenty two. You go down there the way other people go to the market.",
    waiting: "The Abyss. Twenty two of them.",
    gated: "The black water is not open to you.",
  },
  {
    id: 'q32', type: 'catch_rarity', target: 2, minRarity: 5, reward: 5600, minLevel: 50, band: 'abyss',
    label: 'Land 2 legendary fish',
    give: "Two legendaries, before we go anywhere near the old water. I need to know you can do it on demand.",
    done: "Two. On demand. That is the last thing I needed to know and I already knew it.",
    waiting: "Legendary. Two of them. The water decides, but it decides about you differently now.",
    gated: "Not yet.",
  },
  // ── THE ANCIENT DEEP (Fishing 75) ───────────────────────────────────
  //
  // WHERE THE WHOLE ARC HAS BEEN POINTING. Every beat about six things worth
  // the pulling, every admission that his own line comes back empty, lands
  // here. The last three jobs are the six giants, and `ancient_catches` is the
  // same column the One Last Ride gate reads on the expedition side
  // (`requiresAncients` in raidMap), so finishing his ladder IS the thing that
  // opens the finale. The two halves of the game meet at this rung.
  {
    id: 'q13', type: 'catch_zone', target: 8, zone: 'ancient_deep', reward: 4600, minLevel: 75, band: 'ancient_deep',
    label: 'Land 8 fish in the Ancient Deep',
    give: "The old water. Eight ordinary fish out of it, to start. I have told you what is down there and I have told you my line comes back empty. Yours will not.",
    done: "Eight out of the Ancient Deep. Do you understand that I have never held one of those? Not one.",
    waiting: "The oldest water on your chart. Eight. I would go with you if it would do any good.",
    gated: "The old water is not open to you yet. I have waited forty years. I can wait for you.",
  },
  {
    id: 'q14', type: 'catch_rarity', target: 3, minRarity: 5, reward: 6000, minLevel: 75, band: 'ancient_deep',
    label: 'Land 3 legendary fish',
    give: "Three legendaries. Not because I doubt you. Because I want to watch it happen and this is the only way I get to.",
    done: "Three. You make the impossible look like a Tuesday, and I have stopped pretending that does not sting.",
    waiting: "Legendary. The water gives those to almost nobody. It will give them to you.",
    gated: "Not yet. Those are the far end of it.",
  },
  // ── THE SIX, ONE AT A TIME ──────────────────────────────────────────
  //
  // The arc has been pointing here since his first line about six things worth
  // the pulling. They were three lumped jobs (one, then three, then all six),
  // which made the back half of the campaign a counter going up rather than six
  // separate hunts. Each giant is its own job now, named, described, and asked
  // for on its own.
  //
  // THE ORDER IS THE WATER'S OWN. ANCIENT_IDS raises them 144, 145, 146, 147,
  // 148 and Megalodon last, and castLine now follows that list exactly rather
  // than rolling at random, so the giant Finn names IS the one that rises. If
  // that list is ever reordered, this ladder has to move with it.
  //
  // Megalodon closes the game's fishing story and is independently gated in
  // castLine behind the other five, so it cannot arrive early even if a captain
  // somehow reached this rung out of turn.
  {
    id: 'q15', type: 'catch_ancient', target: 1, ancientId: 144,
    reward: 9000, minLevel: 75, band: 'ancient_deep',
    label: 'Raise the Plesiosaurus',
    give: "The first of the six. A long neck and a longer memory, and it comes up slow, like it is deciding about you. And you will not manage it on worms, so listen. They rise for a shine: a Golden Lure will raise one, a Luminous will do it slower, and nothing else on your boat will do it at all. Forty years I stood at the lip of that water with the wrong thing on my line.",
    done: "You are holding one. An actual one of the six. I am going to need a moment and I would rather you did not watch.",
    waiting: "The Plesiosaurus. Golden Lure, old water, and patience. It is down there.",
    gated: "Not until the old water opens to you.",
  },
  {
    id: 'q16', type: 'catch_ancient', target: 1, ancientId: 145,
    reward: 11000, minLevel: 75, band: 'ancient_deep',
    label: 'Raise the Dunkleosteus',
    give: "Second. This one is armour plate and a bite that never needed teeth. Same lure, same water. It will not come up politely.",
    done: "Two. You have landed two of them and I have landed none, and I find I am not as sour about that as I expected to be.",
    waiting: "The Dunkleosteus. Keep the shine on your line.",
    gated: "Not yet.",
  },
  {
    id: 'q17', type: 'catch_ancient', target: 1, ancientId: 146,
    reward: 13500, minLevel: 75, band: 'ancient_deep',
    label: 'Raise the Mosasaurus',
    give: "Third. The one that hunts the dark on purpose rather than living in it. Do not fight it early, it is stronger at the start than it is at the end.",
    done: "Three. Half the set. Nobody in the history of this harbour has been halfway.",
    waiting: "The Mosasaurus. It is out there and it is in no hurry.",
    gated: "Not yet.",
  },
  {
    id: 'q18', type: 'catch_ancient', target: 1, ancientId: 147,
    reward: 16500, minLevel: 75, band: 'ancient_deep',
    label: 'Raise the Basilosaurus',
    give: "Fourth. Longest thing in the old water and the quietest. You will feel it before the line does.",
    done: "Four. I have started telling people about you, which is not a thing I do.",
    waiting: "The Basilosaurus. Long, slow, and worth the wait.",
    gated: "Not yet.",
  },
  {
    id: 'q19', type: 'catch_ancient', target: 1, ancientId: 148,
    reward: 20000, minLevel: 75, band: 'ancient_deep',
    label: 'Raise the Shastasaurus',
    give: "Fifth. The biggest of them that is not the last one, and the one I got closest to. Thirty seconds I held it. Then the water handed it back.",
    done: "Five. Five of six. There is one left and we both know which, and I have not been able to say its name out loud in years.",
    waiting: "The Shastasaurus. The one I nearly had. Go and finish what I could not.",
    gated: "Not yet.",
  },
  {
    id: 'q20', type: 'catch_ancient', target: 1, ancientId: 143,
    reward: 30000, minLevel: 75, band: 'ancient_deep',
    label: 'Raise the Megalodon',
    give: "The last one. It does not surface for anybody holding fewer than five, which is why no living captain has ever seen it and why I never will. It is yours. Go.",
    done: "All six. By one pair of hands, in one lifetime, and I watched it happen. ...Sit down. I need to tell you something, and you are not going to like where it starts.",
    waiting: "The Megalodon. It is waiting on you now, not the other way round.",
    gated: "Not yet. But it is going to be you.",
  },
]

/**
 * ── THE FISHING CAMPAIGN, IN CHAPTERS ───────────────────────────────────────
 *
 * Same idea as the expedition side (RAID_CHAPTERS in lib/raidMap), and the same
 * job: turning a long ladder of tasks into a story with acts, so a captain can
 * say where they are in it rather than counting jobs.
 *
 * THE CHAPTER BREAK IS THE WATER. Each act is one band of the sea, and you move
 * into the next one when Finn sets you a job out there. That is not a rule laid
 * on top of the ladder, it IS the ladder: his jobs walk outward, so the act
 * changes exactly when the water does.
 *
 * IT ALSO EXPLAINS THE WALL. Every chapter after the first opens on water with
 * a level gate, so the campaign genuinely stops until you are rated for the
 * next band. Presented as a numbered chapter that has not started yet, that
 * reads as a story waiting for you; presented as a job you cannot do, it reads
 * as a bug. Same fact, and the framing is the whole difference.
 *
 * THE LAST CHAPTER IS THE SIX. Every giant, one at a time, ending on the
 * Megalodon, and finishing it fills `ancient_catches`, which is what opens One
 * Last Ride on the raid map. The two halves of the game meet there.
 */
export type FinnChapter = {
  id: string
  number: number
  romanNumeral: string
  title: string
  /** One line under the title, in the house's evocative register. */
  subtitle: string
  /** The band this act is fished in. */
  band: string
  /** Fishing level the band opens at, and therefore the chapter. */
  minLevel: number
}

export const FINN_CHAPTERS: FinnChapter[] = [
  {
    id: 'the_hand', number: 1, romanNumeral: 'I',
    title: 'The Hand on the Rod',
    subtitle: 'Somebody has started watching how you fish, and will not say why.',
    band: 'shallows', minLevel: 1,
  },
  {
    id: 'past_the_shelf', number: 2, romanNumeral: 'II',
    title: 'Past the Shelf',
    subtitle: 'The shallow water is finished with you. He says that like it is a compliment.',
    band: 'open_waters', minLevel: 15,
  },
  {
    id: 'the_long_sail', number: 3, romanNumeral: 'III',
    title: 'The Long Sail',
    subtitle: 'Deep water, and the first thing he asks for that he could never do himself.',
    band: 'deep', minLevel: 30,
  },
  {
    id: 'where_it_stops_being_blue', number: 4, romanNumeral: 'IV',
    title: 'Where It Stops Being Blue',
    subtitle: 'Everything down here has teeth or lights or both, and none of it has been polite to him.',
    band: 'abyss', minLevel: 50,
  },
  {
    id: 'the_six', number: 5, romanNumeral: 'V',
    title: 'The Six',
    subtitle: 'Six things worth the pulling, one at a time, and a name he has not said aloud in years.',
    band: 'ancient_deep', minLevel: 75,
  },
]

/** The jobs belonging to one act, in ladder order. */
export function chapterQuests(chapterId: string): FinnQuest[] {
  const ch = FINN_CHAPTERS.find(c => c.id === chapterId)
  return ch ? FINN_QUESTS.filter(q => q.band === ch.band) : []
}

export type FinnChapterView = {
  chapter: FinnChapter
  /** Jobs handed back in this act. */
  done: number
  total: number
  /** Every job in it is finished. */
  complete: boolean
  /** The act has begun: it is reachable and not finished. */
  current: boolean
  /** Reachable at all, by fishing level. */
  open: boolean
}

/**
 * WHERE THE CAPTAIN IS IN THE STORY.
 *
 * Every act, with its state, so the panel can show the whole shape at once the
 * way the raid map does. `current` is the first act that is open and unfinished
 * — which is also, deliberately, the act whose jobs Finn is handing out.
 */
/**
 * THE ACT YOU ARE WAITING ON, if you are waiting on one.
 *
 * There is a state that is not "in a chapter" and is not "finished": every act
 * you can reach is done and the next one wants a fishing level you have not
 * got. It reads identically to having completed the campaign unless something
 * says otherwise, which would tell a level-14 captain who has finished the
 * Shallows that the fishing story is over after three jobs.
 */
export function finnWaitingOn(
  doneIds: readonly string[], fishingLevel: number,
): FinnChapter | null {
  const views = finnChapters(doneIds, fishingLevel)
  if (views.some(v => v.current)) return null
  return views.find(v => !v.complete && !v.open)?.chapter ?? null
}

export function finnChapters(doneIds: readonly string[], fishingLevel: number): FinnChapterView[] {
  const done = new Set(doneIds)
  let foundCurrent = false
  return FINN_CHAPTERS.map(chapter => {
    const qs = FINN_QUESTS.filter(q => q.band === chapter.band)
    const d = qs.filter(q => done.has(q.id)).length
    const complete = qs.length > 0 && d === qs.length
    const open = fishingLevel >= chapter.minLevel
    const current = !foundCurrent && open && !complete
    if (current) foundCurrent = true
    return { chapter, done: d, total: qs.length, complete, current, open }
  })
}

const BY_ID = new Map(FINN_QUESTS.map(q => [q.id, q]))
export function finnQuestById(id: string | null | undefined): FinnQuest | null {
  return id ? BY_ID.get(id) ?? null : null
}

/**
 * The next job he has not set you yet.
 *
 * Keyed off the list of jobs already TURNED IN, the same way his beats key off
 * the beats already heard, so the two ladders advance in lockstep without
 * either needing to know about the other.
 */
export function nextFinnQuest(
  doneIds: readonly string[], fishingLevel: number,
): FinnQuest | null {
  const done = new Set(doneIds)
  const next = FINN_QUESTS.find(q => !done.has(q.id))
  if (!next) return null
  return next.minLevel <= fishingLevel ? next : null
}

/** The next job WHATEVER the level, so he can say what he is waiting for
 *  rather than going quiet and looking like the story has ended. */
export function pendingFinnQuest(doneIds: readonly string[]): FinnQuest | null {
  const done = new Set(doneIds)
  return FINN_QUESTS.find(q => !done.has(q.id)) ?? null
}

/** Plain progress wording, for the panel. Mechanics copy stays literal. */
export function questProgressLabel(q: FinnQuest, have: number): string {
  if (q.type === 'perfect_streak') {
    return `Best run since he asked: ${Math.min(have, q.target)} of ${q.target}`
  }
  if (q.type === 'catch_ancient') {
    return have >= 1 ? 'Landed' : 'Not yet raised'
  }
  return `${Math.min(have, q.target)} of ${q.target}`
}
