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

export type FinnQuest = {
  /** Stable. Stored on the profile and never renumbered. */
  id: string
  type: FinnQuestType
  target: number
  /** catch_zone only: the habitat a fish must have come from. */
  zone?: string
  /** catch_rarity only: the bite_rarity a fish must meet or beat. */
  minRarity?: number
  /** Said plainly, because it is a task. No flourishes in the objective. */
  label: string
  /** Doubloons on turn-in. */
  reward: number
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
  {
    id: 'q1', type: 'catch_any', target: 8, reward: 220,
    label: 'Land 8 fish, anywhere',
    give: "Nothing clever. Go and pull eight out of the water and come back to me. I want to watch how you hold the rod, not what you catch with it.",
    done: "Eight. And not one of them fought you the same way twice. I noticed.",
    waiting: "Eight. You are not at eight. Off you go.",
  },
  {
    id: 'q2', type: 'land_perfects', target: 4, reward: 320,
    label: 'Land 4 perfect catches',
    give: "Anybody can land a fish. Land four PERFECT and I will start paying attention properly.",
    done: "Four clean ones. Most anglers manage that by accident once a season.",
    waiting: "Four perfect. Not four fish. There is a difference and it is the entire difference.",
  },
  {
    id: 'q3', type: 'catch_zone', target: 10, zone: 'open_waters', reward: 420,
    label: 'Land 10 fish in Open Waters',
    give: "The Shallows have taught you everything they are going to. Take ten out of Open Waters and stop wading.",
    done: "Ten, out where the bottom stops being a suggestion. Good.",
    waiting: "Open Waters. Past the shelf. You have not been out there enough.",
  },
  {
    id: 'q4', type: 'perfect_streak', target: 5, reward: 560,
    label: 'Land 5 perfect catches in a row',
    give: "Five in a row. Not five in a day, five without a single miss between them. That is a hand, not a habit.",
    done: "Five straight. I have watched a hundred anglers try that and I am not exaggerating the number.",
    waiting: "In a ROW. One miss and you start again. That is what makes it worth asking for.",
  },
  {
    id: 'q5', type: 'catch_rarity', target: 3, minRarity: 3, reward: 700,
    label: 'Land 3 rare or better fish',
    give: "Three rare ones. The water decides who gets those, and I want to see whether it has decided about you.",
    done: "Three. The water is making up its mind about you, and I do not think it is going the way I expected.",
    waiting: "Rare, I said. Common fish are just weather.",
  },
  {
    id: 'q6', type: 'catch_zone', target: 12, zone: 'deep', reward: 880,
    label: 'Land 12 fish in the Deep',
    give: "The Deep. Twelve of them. It is a long sail and that is deliberate, I want to see if you come back.",
    done: "Twelve, and you came back up. That second part is the one I was watching.",
    waiting: "The Deep. Past the abyss talk, before the black. Twelve.",
  },
  {
    id: 'q7', type: 'land_perfects', target: 15, reward: 1100,
    label: 'Land 15 perfect catches',
    give: "Fifteen perfect. Take your time. I am not going anywhere and neither, apparently, are you.",
    done: "Fifteen. You have stopped counting them, have you not. That is when it starts working.",
    waiting: "Fifteen clean. You are not there yet and there is no hurry.",
  },
  {
    id: 'q8', type: 'catch_zone', target: 10, zone: 'abyss', reward: 1450,
    label: 'Land 10 fish in the Abyss',
    give: "The Abyss. Ten. Everything down there has teeth or lights or both, and none of it has ever been polite to me.",
    done: "Ten out of the black. You did that in the time it takes most captains to work up to looking at it.",
    waiting: "The Abyss. Where it stops being blue. Ten of them.",
  },
  {
    id: 'q9', type: 'perfect_streak', target: 8, reward: 1900,
    label: 'Land 8 perfect catches in a row',
    give: "Eight in a row. I could not do six on my best day and I have had a great many days.",
    done: "Eight straight. I want to be sour about that and I find I am not.",
    waiting: "Eight, unbroken. It is meant to be hard. That is the whole of the request.",
  },
  {
    id: 'q10', type: 'catch_rarity', target: 5, minRarity: 4, reward: 2400,
    label: 'Land 5 epic or better fish',
    give: "Five of the real ones. Not rare. The ones the water only hands over when it has decided something about the hand on the rod.",
    done: "Five. It has decided, then.",
    waiting: "Epic or better. If you are not sure whether it counted, it did not.",
  },
  {
    id: 'q11', type: 'catch_zone', target: 8, zone: 'ancient_deep', reward: 3200,
    label: 'Land 8 fish in the Ancient Deep',
    give: "The old water. Eight. I have told you what is down there and I have told you my line comes back empty. Yours will not.",
    done: "Eight out of the Ancient Deep. Do you understand that I have never held one of those? Not one.",
    waiting: "The oldest water on your chart. Eight. I would go with you if it would do any good.",
  },
  {
    id: 'q12', type: 'perfect_streak', target: 12, reward: 4200,
    label: 'Land 12 perfect catches in a row',
    give: "Twelve without a miss. There is nothing left I can ask you for that is harder than this and still fair.",
    done: "Twelve. Straight. I have run out of things to test and I am not sure what I do now.",
    waiting: "Twelve in a row. Take a season over it if you need to. I have waited longer.",
  },
  {
    id: 'q13', type: 'catch_rarity', target: 3, minRarity: 5, reward: 6000,
    label: 'Land 3 legendary fish',
    give: "Three legendaries. Not because I doubt you. Because I want to watch it happen and this is the only way I get to.",
    done: "Three. You make the impossible look like a Tuesday, and I have stopped pretending that does not sting.",
    waiting: "Legendary. The water gives those to almost nobody. It will give them to you.",
  },
]

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
export function nextFinnQuest(doneIds: readonly string[]): FinnQuest | null {
  const done = new Set(doneIds)
  return FINN_QUESTS.find(q => !done.has(q.id)) ?? null
}

/** Plain progress wording, for the panel. Mechanics copy stays literal. */
export function questProgressLabel(q: FinnQuest, have: number): string {
  if (q.type === 'perfect_streak') {
    return `Best run since he asked: ${Math.min(have, q.target)} of ${q.target}`
  }
  return `${Math.min(have, q.target)} of ${q.target}`
}
