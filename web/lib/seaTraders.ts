// THE SALT ROAD — the traders you meet out on the ocean hub.
//
// Plain module, deliberately NOT 'use server': a file with that directive
// silently drops every non-async export, and almost everything here is a pure
// function. It is imported by BOTH the map and the server action, and that is
// the entire point of it existing.
//
// ── WHY THERE IS NO SPAWN TABLE ──────────────────────────────────────────────
//
// A trader is not a row. The sea is cut into cells, and whether a cell holds a
// trader today — and who they are, what they look like, what they are asking —
// is derived by hashing (cell, day). Nothing is stored, nothing is scheduled,
// and no job has to run at midnight.
//
// That is not just cheap, it is what makes the whole thing SAFE. The server
// re-derives the trader from the same two numbers the client did, so a price is
// never something the client tells the server. It is something both of them
// work out and have to agree on.
//
// ── WHY THEY COME BACK ───────────────────────────────────────────────────────
//
// The day is in the hash, so the sea is repopulated every day with different
// people in different places. Sailing past one costs you nothing, because there
// is another tomorrow and another one over the horizon right now. A wandering
// merchant is the kind of feature that turns into a daily chore the moment
// missing one is a loss, and this game does not do that to people.
//
// ── WHY THE DEEP IS STRANGER ─────────────────────────────────────────────────
//
// Density and generosity both climb with distance from the Mainland. Near the
// beach you meet someone shifting worms at a small discount. Ten thousand
// pixels out, where the water is black, you meet someone who should not be out
// there at all and is selling the good stuff cheap. The long sail the chart now
// asks for has to pay for itself in something, and this is it.

import { BAITS, getBait } from '@/lib/bait'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { CHARACTER_COLORS } from '@/lib/characters'
import { RODS, RUNNER_RODS } from '@/lib/rods'
import { HOOKS } from '@/lib/hooks'
import { seaClock } from '@/lib/seaClock'
import type { FolkId } from '@/lib/seaFolk'

/** The Mainland's mooring ring plus a boat length, so the nearest wanderer is
 *  always outside the water the harbour prompt owns. */
const MAINLAND_DOORSTEP =
  (PLACES.find(p => p.id === 'mainland')?.r ?? 250) + 420 + 120
import { NORTH_WALL, OUTER_EDGE, PLACES, YOON } from '@/app/(app)/sea/chart'
import { clearOfSolids, BOAT_CLEAR } from '@/lib/seaSolid'

/** The furthest a trader's patrol can carry them from their anchor. Must match
 *  the `driftR` roll in traderAt, and it is the margin the outer-edge guard
 *  keeps so a drifting trader never wanders out of reach. */
const MAX_DRIFT = 90 + 190

/** World pixels per cell. One trader at most per cell, so this also sets how
 *  close together two of them can ever be.
 *
 *  Widened from 900. At that size the sea was busy in a way an ocean should not
 *  be: cells that small put people within sight of each other constantly, and a
 *  wandering trader stops reading as a find when there is always another one
 *  over your shoulder. 1500 is nearly three times the area per cell, so meeting
 *  somebody out here is an event again. */
export const CELL = 1500

export type TraderKind = 'peddler' | 'salter' | 'tinker' | 'resident' | 'talker' | 'runner'

export type TraderLook = {
  /** A player character colour id, so an NPC captain is built exactly the way
   *  the player's own captain is: same sprite, same overlays, same house style,
   *  and any cosmetic that ships for players shows up out here for free. */
  characterColor: string
  boatId: string
  hatId: string | null
  /** A PLAIN rod, always. Glowing rods are things players earn and they carry
   *  a rarity signal with them — an ordinary trader out shifting worms with a
   *  Lightsaber on their knee reads as a bug, and it cheapens the rod. */
  rodSlug: string | null
  /** A hook on the end of it. A rod with nothing tied to it is a stick, and a
   *  boat full of captains holding sticks reads as unfinished art rather than
   *  as a stylistic choice. Plain hooks only, for the same reason as the rods:
   *  the glowing ones are things players earned. */
  hook: string | null
}

export type Trader = {
  /** Stable key for this trader on this day. Also the claim key. */
  key: string
  kind: TraderKind
  name: string
  /** Where they are floating, in world pixels. */
  x: number
  y: number
  look: TraderLook
  /** One line, said when you pull alongside. */
  line: string
  /** The slow patrol they keep around (x, y). See traderPos. */
  driftR: number
  driftRate: number
  driftPhase: number
  /**
   * ONE OF THE REGULARS, if this is one of them.
   *
   * Set on the five zone buyers, Yoon and the three who keep no shop. It is
   * what gives a hail a "have a word" alongside whatever business is on offer,
   * and it is the only handle the rapport system needs: everything else about
   * a friendship lives in lib/seaFolk and the sea_rapport row. Absent on every
   * wanderer, because a person who is re-rolled at midnight cannot be somebody
   * you are getting to know.
   */
  folkId?: FolkId
} & TraderOffer

export type TraderOffer =
  /**
   * Says several things and wants nothing. See TALK.
   *
   * `lines` rather than one line, because a talker you meet twice should not
   * greet you with the same sentence twice — and because these carry the
   * game's mechanics now, so one stranger who knows one fact is a channel far
   * too narrow to put them through. Distinct, in a fixed order, derived from
   * the same stream as everything else about them: this person always knows
   * these things and always says them in this order.
   */
  | {
    deal: 'talk'
    /** What the RUN is mostly made of. Chat is the common case by a distance. */
    topic: 'chat' | 'hint' | 'story'
    /** The persona's own label, shown where the panel used to print a category.
     *  "Been out a while" tells you who you have stopped for; "Knows something
     *  useful" only told you what you were about to be handed. */
    mood: string
    lines: string[]
  }
  /**
   * THE RARE ONE, AND HE DOES NOT SELL. He deals.
   *
   * One rod, in the blackest water on the chart, at night, and he will not
   * name a price for it: he names a stake. You put up the stake, he cuts for
   * it, and one time in ten you walk away with the rod. The other nine you
   * walk away with nothing, and he will not deal again until tomorrow.
   *
   * That is the YOLO Rod's own mechanic pointed back at the person buying it.
   * A rod whose whole idea is a long-odds roll on every cast should not be
   * something you simply pay for, and ten stakes is exactly what the rod used
   * to cost — so the average captain pays the old price and the lucky one
   * pays a tenth of it. Which is the rod.
   *
   * Keyed on the NIGHT, so an offer cannot be redeemed a cycle after it has
   * gone; the once-a-day lock is separate and lives on the sea day.
   */
  | { deal: 'wager'; rodTier: number; stake: number; odds: number }
  /** A ZONE'S RESIDENT BUYER. Permanent, always in the same water, and not
   *  subject to the daily deal cap — see the `resident` note in chart.ts. */
  | { deal: 'resident'; zoneId: string; rate: number }
  /** Sells a bundle of one bait at a discount off the shop price. */
  | { deal: 'bait'; baitType: string; qty: number; cost: number; shopCost: number }
  /** Buys the whole hold, right now, at a better rate than a quick sell. */
  | { deal: 'buy'; rate: number }

// ── The hash ────────────────────────────────────────────────────────────────
// A small integer hash with good avalanche, so neighbouring cells on the same
// day look nothing like each other. Deterministic across client and server,
// which rules out Math.random anywhere in this file.

function hash(a: number, b: number, c: number): number {
  let h = (a | 0) * 0x27d4eb2d ^ (b | 0) * 0x165667b1 ^ (c | 0) * 0x9e3779b1
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** A 0..1 stream off one seed, so a trader's every choice comes from the same
 *  root and is reproducible from it. */
function stream(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Days since epoch, UTC. The whole sea turns over on the same tick for
 *  everyone, which is what stops "wait for midnight in my timezone" being a
 *  strategy. */
export function seaDay(now: number = Date.now()): number {
  return Math.floor(now / 86400000)
}

// ── Who is out there ────────────────────────────────────────────────────────

/** How far out this cell is, as a 0..1 ramp. The Mainland is the origin of the
 *  chart, so distance from it is distance from home. Flattens off past the
 *  Ancient Deep rather than climbing forever. */
function depthRamp(x: number, y: number): number {
  return Math.min(1, Math.hypot(x, y) / 7600)
}

/** Chance a given cell holds anyone at all.
 *
 *  A BELL, not a ramp, and the first version got this backwards. Straight
 *  "denser the further out" made the Ancient Deep the busiest water on the
 *  chart — eleven traders inside fourteen hundred pixels, in the one place that
 *  is supposed to be lonely enough to frighten you. Whatever is out there past
 *  the Abyss, it should not be a queue.
 *
 *  So the traffic peaks in the middle waters, which is where shipping actually
 *  would be, and thins out at both ends: quiet near the Mainland because there
 *  is a whole port right there, and quiet in the black because nobody sensible
 *  goes. What DOES change monotonically with depth is how good the deals are
 *  and whether a tinker is possible at all — so the deep stays worth the sail
 *  without being crowded. Rarer AND stranger, rather than more of the same. */
function occupancy(depth: number): number {
  return 0.07 + 0.28 * Math.sin(Math.PI * depth)
}

const NAMES_FIRST = [
  'Old', 'Salt', 'Bent', 'Wry', 'Quiet', 'Lucky', 'Patched', 'Barnacle',
  'Half', 'Crooked', 'Squint', 'Grey', 'Tallow', 'Hollow',
]
// NO SURNAME HERE MAY BE A REGULAR'S SHORT NAME. The nine you can befriend now
// go by one name each (see `short` in lib/seaFolk.ts), and six of those - Meg,
// Corrin, Pell, Marlow, Fitch, Nance - were drawn from this very list, because
// their full names were built out of it. Leaving them in meant a randomly
// rolled buyer could sail up calling herself Grey Nance while your friend Nance
// was moored two waters south. Replaced rather than deleted, so the pool keeps
// its size and its register.
const NAMES_LAST = [
  'Dunnage', 'Bilge', 'Ketch', 'Crayle', 'Murrow', 'Skerry', 'Fennick',
  'Sorrel', 'Rud', 'Hessel', 'Thole', 'Garrick', 'Wick', 'Drassel',
]

/** Kinds that are hashed into the sea by the daily grid. Residents live on the
 *  chart, and talkers and runners have their own tables below, so the shared
 *  LINES and STOCK maps only cover the three ordinary traders. */
type TradeKind = 'peddler' | 'salter' | 'tinker'
type WanderKind = Exclude<TraderKind, 'resident'>

const LINES: Record<TradeKind, string[]> = {
  peddler: [
    'Shop prices are a shore thing. Out here I set them.',
    'Bought too much, rowed too far. Your luck, not mine.',
    'It is all worms in the end. Some of it is better worms.',
    'I do not haggle and I do not wait. Yes or no.',
  ],
  salter: [
    'I have salt and barrels and no patience. What is in the hold?',
    'Sell to me and it is done. Sell ashore and it is done Thursday.',
    'Every fish you carry is a fish slowing you down.',
    'I pay better than the quick lads on the dock. Not by much. But better.',
  ],
  tinker: [
    'Nobody comes out this far to buy worms. Good. I do not sell worms.',
    'You are a long way from the beach. So am I. Let us both make it pay.',
    'The dark is good for trade. Nobody follows you into it.',
    'I have been out here longer than is sensible. I have the stock to show it.',
  ],
}

/**
 * WHAT THE TALKERS SAY.
 *
 * Two pools, mixed, because never knowing which you are getting is what makes
 * stopping worth it. A hint is something a stuck player can act on today; a
 * story line is a fragment of the arc that pays nothing and is the reason the
 * ocean feels inhabited.
 *
 * Deliberately no rewards attached to either. The moment a talker pays out,
 * everybody sails the row of them every night and it becomes a chore — which is
 * the exact failure mode this game refuses everywhere else.
 */
/**
 * WHAT THE WAIT USED TO TELL YOU.
 *
 * The fishing screen filled the seconds between cast and bite with tips, and it
 * was doing real work: nearly everything in this game is discoverable only by
 * being told, and that was where players were told. The map has no such gap —
 * you are steering — so the knowledge had to go somewhere, and a stranger who
 * fishes for a living is a better mouth for it than a caption.
 *
 * So these are those tips, rewritten as things a person would actually say.
 * Never "Tip:", never a number the player cannot check, and never a sentence
 * that reads like a caption with a name attached to it.
 *
 * VERIFY ANY FIGURE AGAINST THE SOURCE BEFORE ADDING ONE. A stale hint is worse
 * than no hint, and out here it is also a person lying to you.
 */
/**
 * WHO IS OUT HERE.
 *
 * ── PEOPLE, NOT A LINE POOL ─────────────────────────────────────────────────
 *
 * The talkers used to draw four lines straight from one shared list, which made
 * every one of them the same person wearing a different hat: four facts, no
 * character, and nothing that made stopping for THIS one different from
 * stopping for the last one.
 *
 * Each talker now has a PERSONA, and every line they say comes out of it. That
 * is the entire difference between a stranger and a dispenser — a boaster
 * boasts three times and you have met a boaster, where three unrelated tips
 * mean you have met a menu.
 *
 * ── WHAT THESE ARE ALLOWED TO BE ────────────────────────────────────────────
 *
 * Small. Mundane. Specific. Nobody out here is delivering exposition or
 * advertising a feature; they are passing the time with the first boat they
 * have seen in days. The good ones are the ones you would repeat to somebody,
 * and none of those are about mechanics.
 *
 * House rules apply: sea creatures, never "men" or land idioms, no em-dashes,
 * and nothing that leaks the campaign. See story-universe.md.
 */
export const PERSONAS: { mood: string; lines: string[] }[] = [
  {
    mood: 'In no hurry to be modest',
    lines: [
      'I have been further out than this. Much further. Ask anyone who was there.',
      'Landed one once that took three of us and most of an afternoon.',
      'Every mark on this hull has a story and a good number of them are true.',
      'I could sail this stretch with my eyes shut. I have not. But I could.',
      'You are looking at the second finest captain in these waters. The finest is modest about it.',
      'They say the far water is dangerous. It was dangerous. I have been.',
    ],
  },
  {
    mood: 'Watching the water',
    lines: [
      'It was flat like this the morning the Margate went down. Flat exactly like this.',
      'I check the hull twice before I leave and twice more when I am back.',
      'Did you hear that? No? Good. Neither did I. Probably.',
      'I keep a second rope. And a third. You can laugh, I have heard laughing before.',
      'Everyone says it is fine out here. Everyone said that last season as well.',
      'I do not go past the shelf. Nobody raised me brave, they raised me old.',
    ],
  },
  {
    mood: 'A long way from the dock',
    lines: [
      'Three weeks out. My youngest will have grown and I will not know the face.',
      'The tavern does a stew on the cold nights. I think about it more than is healthy.',
      'You get used to the quiet. That is the part nobody warns you about.',
      'I could turn for home. I say that at the start of every week.',
      'There is a bunk ashore with my name on it and a mattress that remembers the shape of me.',
      'Say something else. Anything. I am not fussy at this point.',
    ],
  },
  {
    mood: 'Full of opinions',
    lines: [
      'Boats these days. All paint and no timber.',
      'In my day you went and found the fish. Now you wait for them and complain about waiting.',
      'I have no complaints. I have observations. There are a great many of them.',
      'Everybody out here is in a hurry and not one of them is getting anywhere sooner.',
      'They have gone and changed the market again. They are always changing the market.',
      'Nothing wrong with the old way. Nothing wrong with it at all.',
    ],
  },
  {
    mood: 'Somewhere else entirely',
    lines: [
      'One day I am going to sail until the chart runs out and see what happens next.',
      'I like the hour the light goes. Everything looks like it might be something else.',
      'If I had a bigger boat I do not think I would fish at all. I would just go.',
      'There is water past the water. There has to be.',
      'I gave names to all the rocks on my usual run. None of the names took.',
      'Some nights the whole sea holds still and you can believe it is listening.',
    ],
  },
  {
    mood: 'Has heard things',
    lines: [
      'Two boats went out together last week and one came back. They are not saying which.',
      'You did not hear it from me, but somebody has been buying charts. All of them.',
      'The Harbourmaster has a new coat. Where does a Harbourmaster come by a coat like that.',
      'Everyone is very interested in the deep water lately. Everyone.',
      'I do not repeat things. I say them once, to everybody.',
      'There is a name going round that nobody says twice. I will not be the second one.',
    ],
  },
  {
    mood: 'Still learning the water',
    lines: [
      'Second week. I have stopped being sick, which they tell me was the hard part.',
      'I keep tying the knot wrong. It holds anyway. I have stopped asking why.',
      'Everybody out here seems to know everybody. I am working on it.',
      'I caught something yesterday and I do not know what it was. I put it back.',
      'They said I would love it or be gone inside a month. I am still deciding.',
      'How do you all know where you are? Everything looks the same to me out here.',
    ],
  },
  {
    mood: 'Been out a while',
    lines: [
      'I have not spoken to a soul in eleven days. You are doing very well so far.',
      'The gulls have names now. I gave them the names. None of them objected.',
      'What day is it. No. Do not tell me. I have come to like not knowing.',
      'I talk to the boat. The boat is a marvellous listener and has never once interrupted.',
      'You are the third real thing I have seen this week and the other two were weather.',
      'I sang the whole way out. There was nobody to stop me and I checked.',
    ],
  },
]

const HINTS = [
  "Chum's wasted in the shallows. Save it for water that's got something worth calling up.",
  "A perfect reel pays more than a good one, and the second perfect in a row pays more again. Nobody tells you that.",
  "Every stretch of water out here wants a different level off you. If it won't bite, you're early, not unlucky.",
  "Your reel decides how fast the dial runs. Cheap reel, fast needle, and a hard fish is a coin toss.",
  "The bigger your hold the longer you can stay out. That's the whole of it.",
  "Sell to a buyer out here and you take less. Sail it home and the market pays every coin of it, on the spot.",
  "A snag costs you bait on top of the fish. Some rods don't care. Worth knowing which.",
  "If you're chasing size, keep casting the same water. Every species has a monster in it somewhere.",

  // ── The dial, and the hands that work it ──
  "Every hook you buy widens the catch zone. Three degrees a tier. Doesn't sound like much until you've stacked five.",
  "Bail on a fish you've already hooked and the streak dies with it. Stow the rod between casts and it keeps.",
  "The Tide Turner lets you put a hooked fish back without the streak noticing. Comes off voyages, not out of a shop.",
  "There's a hook out there that saves your bait a quarter of the time. Voyage reward. Worth the trip.",
  "There's a rig that casts for you and opens what it finds. Ashore, in the tackle shop, for five thousand.",

  // ── Rods worth knowing about ──
  "The Twin-Strike lands two at once, one cast in four.",
  "There's a rod that lands two every single time. Costs what you'd expect.",
  "The YOLO. One cast in ten it comes up with a hundred fish on it. The other nine it's a stick.",
  "A telescoping rod pulls the rare ones up where you can reach them.",

  // ── Where the money is ──
  "Quick sell if you must. The market ashore pays every coin, and the only thing it costs you is the sail home.",
  "Finish every fish in a stretch of water and there's a purse waiting for it. Once only.",
  "Prestige a stretch and everything you land there earns better. Five times over, if you've the patience.",
  "Prestige the same water again and the completion purse grows with it.",

  // ── The rest of the world, from out here ──
  "Idle crew will trawl a zone for you while you're elsewhere. They come back with coin and knowledge both.",
  "On a trawl it's Savvy that brings back the learning and Fortune that brings back the coin. Pick to suit.",
  "You can have a trawl running in every water you've opened. All of them at once, all of them while you sleep.",
  "Crates come up wooden, metal, gold and diamond. Something older comes up in the Ancient Deep.",
  "The Ancient Deep's giants never see the inside of a hold. Straight to the wall.",
  "Every fish you land gets measured. Your biggest of each is kept whether you ask or not.",
  "Trivia in the Parlor of an evening pays in coin. Easiest gold on the island.",
  "Solve the chart room's puzzles and the world chart opens a piece at a time. Gems under every landmark.",
  "The Den takes chips at three tables and they all draw on the one purse.",
  "Three catfish on the slot and the whole jackpot's yours. I've seen it happen. Once.",
  "Past a hundred, everything you learn turns into Renown, and Renown buys things that stay bought.",
  "Raid gear can be fused into better raid gear. There's a forge for it.",
  "Daily challenges reset with the sun. Keep up with them and they add up to real money.",
  "Watch for a lad called Finn. He'll want to make it a contest.",
  "A bigger hold is more time on the water. That's the entire argument for it.",
]

const STORIES = [
  "There were six of them, they say. Big as ships and older than ships. Five accounted for.",
  "My father worked the Deep forty years and never went past it. Said the water changes temper out there.",
  "Ask about the Sunken Hand in a tavern and watch who leaves.",
  "Someone's been buying up charts. All of them. Paying stupid money and asking no questions.",
  "The carvings on those stones aren't writing. I've shown them to people who'd know.",
  "A man I knew went out past the Abyss on a bet. Came back. Wouldn't fish again.",
  "You'll hear it said the deep ones are dead. Landed isn't dead.",
  "Whatever counts to six down there, don't answer it.",
]

/** Bait a kind will carry, worst to best. The tinker deals only in the top of
 *  the shop's range, which is the reward for the sail rather than a new item
 *  nobody could get otherwise — nothing out here is exclusive. */
const STOCK: Record<TradeKind, string[]> = {
  peddler: ['worm', 'minnow', 'night_crawler'],
  salter: [],
  tinker: ['chum', 'anglers_formula'],
}

/** What each kind is worth crossing water for. The salter's rate sits ABOVE the
 *  65% quick sell and below the market lane on purpose: quick-sell convenience
 *  at a better number, without moving either of the two lanes the economy is
 *  actually built on. */
function offerFor(kind: TradeKind, depth: number, rnd: () => number): TraderOffer | null {
  if (kind === 'salter') {
    // 74% at the beach, 86% out in the black.
    return { deal: 'buy', rate: Math.round((0.74 + depth * 0.12) * 100) / 100 }
  }
  const stock = STOCK[kind]
  const pool = stock.filter(t => (getBait(t)?.shopCost ?? 0) > 0)
  if (!pool.length) return null
  const baitType = pool[Math.floor(rnd() * pool.length)]
  const bait = getBait(baitType)
  if (!bait || bait.shopCost <= 0) return null
  // Bundles get bigger and cheaper the further out you are.
  const qty = bait.bundleSize * (kind === 'tinker' ? 3 : 2)
  const shopCost = bait.shopCost * qty
  const discount = 0.18 + depth * 0.22 + rnd() * 0.08   // 18% .. 48%
  return {
    deal: 'bait',
    baitType,
    qty,
    cost: Math.max(1, Math.round((shopCost * (1 - discount)) / 5) * 5),
    shopCost,
  }
}

/**
 * THE ONE FUNCTION THAT MATTERS.
 *
 * Given a cell and a day, either there is a trader there or there is not, and
 * both the map and the server action get the identical answer. Every field —
 * the price especially — falls out of the seed, so nothing about a deal is ever
 * something the client gets to assert.
 */
export function traderAt(cx: number, cy: number, day: number): Trader | null {
  const seed = hash(cx, cy, day)
  const rnd = stream(seed)

  const x = cx * CELL + rnd() * CELL
  const y = cy * CELL + rnd() * CELL
  const depth = depthRamp(x, y)

  if (rnd() > occupancy(depth)) return null

  // ── NOBODY MOORS WHERE YOU CANNOT SAIL ───────────────────────────────
  //
  // The hull is clamped to a RADIUS of OUTER_EDGE from the origin, and this
  // grid is square, so its outer cells run off the end of the world. Measured
  // over a sweep of the whole chart: 22% of everyone generated was outside it —
  // one person in five that you could see on the compass and could never reach.
  // A captain reported exactly that, unable to get to a trader sitting past the
  // boundary.
  //
  // `tradersAround` already refused the cells north of the reef for the same
  // reason. It only ever guarded that one edge, because the north wall is a
  // straight line and easy to think about, and the outer edge is a circle.
  //
  // MAX_DRIFT because they do not sit still: they swing on an anchor of up to
  // 90 + 190 pixels, so the anchor has to be inside the ring by at least that
  // or the patrol carries them out of it.
  if (Math.hypot(x, y) > OUTER_EDGE - MAX_DRIFT) return null
  // And the reef, tested on the ANCHOR rather than the cell. tradersAround
  // already drops whole cells north of the wall, but a trader anchored just
  // south of it can still swing across on their patrol.
  if (y < NORTH_WALL + MAX_DRIFT) return null

  // Nobody sets up shop on the doorstep. The Mainland and the Harbour are
  // already places you can buy things.
  //
  // Derived, not a number. It was 620, tuned when the Mainland had a radius of
  // 250 and a mooring ring of 670; the island is 440 now and its ring reaches
  // 860, so the old constant left traders bobbing inside the harbour approach
  // where the go-ashore prompt is already up.
  if (Math.hypot(x, y) < MAINLAND_DOORSTEP) return null

  // ── AND NOT THROUGH THE MIDDLE OF IT EITHER ──────────────────────────
  //
  // The three guards above are all about the EDGES of the world: the outer
  // ring, the reef, the Mainland's doorstep. Nothing tested the things standing
  // in the middle of it, so traders were anchored inside islands and their
  // patrols carried them straight across ports — a captain watched one sail
  // through the Trawl Docks.
  //
  // MAX_DRIFT again, for the same reason the outer-edge guard uses it: an
  // anchor that clears a rock is worthless if the patrol swings the hull back
  // into it. Deliberately conservative — MAX_DRIFT is the widest patrol anyone
  // can roll, not this one's — because over-clearing costs a trader in a cell
  // that had a rock in it, and under-clearing costs a boat sailing through
  // stone. BOAT_CLEAR on top, because a hull is a sprite and not a point.
  //
  // A cell with nothing clear in it simply has nobody, which is how every other
  // guard here fails too: the population is probabilistic, so a refusal reads
  // as an empty stretch of water rather than a hole.
  if (!clearOfSolids(x, y, MAX_DRIFT + BOAT_CLEAR)) return null

  // TWO IN FIVE OF EVERYONE OUT HERE IS NOT SELLING ANYTHING.
  //
  // Raised from a fifth when the talkers took over a job the fishing screen
  // used to do. That screen filled the wait between cast and bite with tips,
  // and the map has no such gap to fill them into — so the knowledge moved out
  // onto the water, into the mouths of people who are standing in it. At a
  // fifth you could sail a whole band without meeting one, which is not a
  // channel you can put the game's mechanics through.
  //
  // Still not most of them. A sea where nobody trades is not a Salt Road.
  const isTalker = rnd() < 0.4

  // The deeper the water the likelier they are something other than a worm
  // salesman. The tinker only exists past the halfway mark.
  const roll = rnd()
  const kind: TradeKind =
    depth > 0.5 && roll < 0.34 ? 'tinker'
      : roll < 0.62 ? 'peddler'
        : 'salter'

  const offer: TraderOffer | null = isTalker ? talkerOffer(rnd) : offerFor(kind, depth, rnd)
  if (!offer) return null

  const look: TraderLook = {
    characterColor: pick(CHAR_COLORS, rnd),
    boatId: pick(BOAT_IDS, rnd),
    hatId: rnd() < 0.75 ? pick(HAT_IDS, rnd) : null,
    rodSlug: pick(ROD_SLUGS, rnd),
    hook: pick(HOOK_ART, rnd),
  }

  // A patrol well inside the cell: 90-280px across, one turn every 50-140
  // seconds, starting anywhere on it.
  const driftR = 90 + rnd() * 190
  const driftRate = (rnd() < 0.5 ? 1 : -1) * (Math.PI * 2) / (50 + rnd() * 90)
  const driftPhase = rnd() * Math.PI * 2

  return {
    key: `${day}:${cx}:${cy}`,
    kind: isTalker ? 'talker' : kind,
    name: `${pick(NAMES_FIRST, rnd)} ${pick(NAMES_LAST, rnd)}`,
    x, y, look,
    // A talker's opener is the first of their run; everyone else has the one
    // line they ever say.
    line: offer.deal === 'talk' ? offer.lines[0] : pick(LINES[kind], rnd),
    driftR, driftRate, driftPhase,
    ...offer,
  }
}

/**
 * WHAT A TALKER SAYS, and in what proportion.
 *
 * Three lines from ONE persona, so the person coheres, and then at most one
 * borrowed line spliced in among them.
 *
 * ── WHY THE MIX IS MOSTLY CHATTER ───────────────────────────────────────────
 *
 * These used to be four hints deep, because the talkers had inherited the job
 * the fishing screen's cast-wait tips used to do. That made every stranger on
 * the sea a tooltip with a hat on. The knowledge has somewhere better to live
 * now: the note isles carry the mechanics, plainly and permanently, and a
 * player can go back and re-read one.
 *
 * So a hint out here is a bonus rather than the point. Roughly two in five
 * talkers carry ONE, about one in seven carries a story line instead, and the
 * rest are purely somebody passing the time.
 *
 * The borrowed line is never FIRST. The opener is what makes you decide whether
 * this person is worth another tap, and it should be them, not a fact.
 */
function talkerOffer(rnd: () => number): TraderOffer {
  const persona = pick(PERSONAS, rnd)
  const chat = runOf(persona.lines, 3, rnd)
  const roll = rnd()
  if (roll < 0.40) {
    return { deal: 'talk', topic: 'hint', mood: persona.mood, lines: [chat[0], pick(HINTS, rnd), ...chat.slice(1)] }
  }
  if (roll < 0.55) {
    return { deal: 'talk', topic: 'story', mood: persona.mood, lines: [chat[0], pick(STORIES, rnd), ...chat.slice(1)] }
  }
  return { deal: 'talk', topic: 'chat', mood: persona.mood, lines: chat }
}

function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]
}

/**
 * N DISTINCT ITEMS, in a stable order, from one stream.
 *
 * Not `n` calls to pick(): that repeats, and a talker who says the same hint
 * twice in one conversation is worse than a talker with one hint. Walks the
 * pool from a stream-chosen offset by a stream-chosen stride that is coprime
 * with the length, which visits every index before repeating any.
 */
function runOf(pool: readonly string[], n: number, rnd: () => number): string[] {
  const len = pool.length
  if (len === 0) return []
  const take = Math.min(n, len)
  let stride = 1 + Math.floor(rnd() * (len - 1))
  while (gcd(stride, len) !== 1) stride = (stride % (len - 1)) + 1
  const start = Math.floor(rnd() * len)
  const out: string[] = []
  for (let i = 0; i < take; i++) out.push(pool[(start + i * stride) % len])
  return out
}

function gcd(a: number, b: number): number {
  while (b) { const t = a % b; a = b; b = t }
  return a
}

/**
 * WHERE A TRADER IS RIGHT NOW.
 *
 * They were pinned to the spot they were hashed into, which made them
 * furniture: an ocean where every other boat is nailed to the water reads as a
 * diorama. Each one keeps a slow circular patrol around its anchor point —
 * different radius, different period, different phase, all off the same seed —
 * so they are always drifting and never in step.
 *
 * The patrol radius is deliberately well inside a cell, so a trader never
 * wanders out of the cell that spawned them and starts flickering as the map
 * recomputes which cells are near.
 *
 * Position is NOT part of the deal. The server rebuilds a trader from the key
 * to price it and never asks where they are, so this can be as fluid as it
 * likes without anything needing to agree about it.
 */
export function traderPos(t: Trader, nowSec: number): {
  x: number; y: number; facing: 1 | -1
  /** Heading in SCREEN degrees, for the wake to lie along. */
  headingDeg: number
} {
  const a = t.driftPhase + nowSec * t.driftRate
  const x = t.x + Math.cos(a) * t.driftR
  const y = t.y + Math.sin(a) * t.driftR * 0.6
  // The tangent of the patrol circle — which way they are actually travelling.
  const vx = -Math.sin(a) * t.driftRate
  const vy = Math.cos(a) * t.driftRate * 0.6
  return {
    x, y,
    // Facing comes from the heading, so a trader always looks where they are
    // going. The sprite is drawn facing LEFT.
    facing: vx < 0 ? 1 : -1,
    headingDeg: Math.atan2(vy, vx) * 180 / Math.PI,
  }
}

/**
 * THE BLOCKADE RUNNERS — the rare ones, and the only place three rods change
 * hands.
 *
 * Night only, deep water only, and one at most per cell. They are keyed on the
 * NIGHT rather than the day, so an offer cannot be redeemed a cycle after it
 * has gone and the sea has a genuinely different population after dark.
 *
 * Findable on purpose. The rods they carry are Completionist donors, so making
 * these a once-a-week event would turn a build into a lottery. Night comes
 * round about three times an hour and there are several of them out there each
 * time — the difficulty is the SAILING, not the waiting.
 */
/** What he wants staked for one cut. Ten of these is the rod's old shelf
 *  price, so the odds and the money agree with each other. */
export const RUNNER_STAKE = 100_000
/** And what a cut is worth. Read by the panel to print the odds and by the
 *  server to roll them, so the number a captain is shown is the number. */
export const RUNNER_ODDS = 0.1

/** The band he works, read off the chart rather than written here again: the
 *  Ancient Deep's own inner and outer radii, so moving the band moves him. */
const ANCIENT = PLACES.find(p => p.id === 'ancient_deep')
const ANCIENT_INNER = ANCIENT?.inner ?? 16000
const ANCIENT_OUTER = ANCIENT?.outer ?? OUTER_EDGE

const RUNNER_LINES = [
  "I have got one rod and no price on it. I have got a stake, and I have got a deck.",
  "Shops ashore won't touch what I carry. That's rather the point of me.",
  "Nine captains out of ten row home lighter. I tell them all that and they all sit down anyway.",
  "You came this far out into the black for a rod that gambles. Do not act surprised.",
  "No paperwork, no chandler, no questions. Put your money on the table.",
]

function runnerAt(cx: number, cy: number, nightIndex: number): Trader | null {
  const seed = hash(cx, cy, nightIndex * 7919 + 3)
  const rnd = stream(seed)

  const x = cx * CELL + rnd() * CELL
  const y = cy * CELL + rnd() * CELL

  // SAME EDGE, SAME REASON. Runners are placed by their own roll rather than
  // through traderAt, so the outer-edge guard there does not cover them — and
  // because they are deep-water only, EVERY one of them is generated near the
  // rim where it matters. They were the whole of the remainder when traderAt
  // was fixed: eleven of the twelve people still out of reach.
  if (Math.hypot(x, y) > OUTER_EDGE - MAX_DRIFT) return null
  // And the reef, tested on the ANCHOR rather than the cell. tradersAround
  // already drops whole cells north of the wall, but a trader anchored just
  // south of it can still swing across on their patrol.
  if (y < NORTH_WALL + MAX_DRIFT) return null

  // THE ANCIENT DEEP AND NOWHERE ELSE.
  //
  // He used to appear anywhere past the halfway mark of the chart, which meant
  // the rarest rod in the game could be bought in water a captain reaches at
  // Fishing 30. The band is the gate: you cannot sail here until 75, so there
  // is no separate level check on the deal and there does not need to be.
  //
  // It also makes him properly rare. One cell in nine was a lot of cells when
  // it was half the chart; inside one band, at night, it is a night's sailing.
  if (!clearOfSolids(x, y, MAX_DRIFT + BOAT_CLEAR)) return null
  const r = Math.hypot(x, y)
  if (r < ANCIENT_INNER + MAX_DRIFT || r > ANCIENT_OUTER - MAX_DRIFT) return null
  // Uncommon even there: about one cell in nine.
  if (rnd() > 0.11) return null
  if (!RUNNER_RODS.length) return null

  const rod = RUNNER_RODS[Math.floor(rnd() * RUNNER_RODS.length)]
  return {
    key: `night:${nightIndex}:${cx}:${cy}`,
    kind: 'runner',
    name: `${pick(NAMES_FIRST, rnd)} ${pick(NAMES_LAST, rnd)}`,
    x, y,
    // BLACK, AND WRITTEN DOWN RATHER THAN ROLLED. Everyone else out here is
    // dressed out of the same pools, which is right for a sea full of people
    // and wrong for the one you only see once. The darkest hull and hat in the
    // game, no hook to catch the light, and the rod he is dealing for openly
    // in his hands - so the thing you sailed into the black to find is
    // recognisable from further away than his name is.
    look: {
      characterColor: 'gray',
      boatId: 'charcoal',
      hatId: 'black',
      rodSlug: rod.slug ?? null,
      hook: null,
    },
    line: pick(RUNNER_LINES, rnd),
    driftR: 70 + rnd() * 120,
    driftRate: (rnd() < 0.5 ? 1 : -1) * (Math.PI * 2) / (60 + rnd() * 70),
    driftPhase: rnd() * Math.PI * 2,
    deal: 'wager',
    rodTier: rod.tier,
    stake: RUNNER_STAKE,
    odds: RUNNER_ODDS,
  }
}

/** Every cell whose trader could be on screen, plus a ring of margin so one
 *  never pops into existence at the edge of the viewport. */
export function tradersAround(x: number, y: number, radius: number, day: number, now: number = Date.now()): Trader[] {
  const out: Trader[] = []
  const clock = seaClock(now)
  const c0x = Math.floor((x - radius) / CELL)
  const c1x = Math.floor((x + radius) / CELL)
  const c0y = Math.floor((y - radius) / CELL)
  const c1y = Math.floor((y + radius) / CELL)
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      // NOBODY IS OUT HERE NORTH OF THE HARBOUR. That water belongs to
      // expeditions and the hull cannot reach it anyway, so a trader spawned up
      // there is a name on the compass pointing at somewhere you cannot go.
      // Tested on the cell's SOUTH edge: a cell straddling the line still has
      // fishable water in it.
      if ((cy + 1) * CELL <= NORTH_WALL) continue
      const t = traderAt(cx, cy, day)
      if (t) out.push(t)
      // AND THE NIGHT'S OWN. A runner shares the cell with whoever is there by
      // day rather than displacing them, so after dark the sea has more in it
      // rather than different things in it.
      if (clock.isNight) {
        const r = runnerAt(cx, cy, clock.nightIndex)
        if (r) out.push(r)
      }
    }
  }
  return out
}

/** Parse a claim key back into the numbers that produced it, so the server can
 *  rebuild the trader from a key the client sent WITHOUT trusting anything else
 *  the client said about them. */
/**
 * YOON, built the same way everywhere.
 *
 * One function, called by the map to draw him and by the server to price him,
 * so there is no way for the two to disagree about what he is selling or what
 * he wants for it. His look is written down rather than rolled: he is a person,
 * not a slot in a table.
 */
export function yoonTrader(): Trader {
  const rod = RODS.find(r => r.tier === YOON.rodTier)
  return {
    key: YOON.key,
    kind: 'talker',
    folkId: 'yoon',
    name: YOON.name,
    x: YOON.x, y: YOON.y,
    line: YOON.line,
    // Barely moves. Everyone else out here is passing through; he is not.
    driftR: 26, driftRate: (Math.PI * 2) / 96, driftPhase: 1.7,
    look: {
      characterColor: 'default',
      boatId: 'charcoal',
      hatId: 'midnight',
      rodSlug: rod?.slug ?? null,
      hook: null,
    },
    // A TALKER, like every other regular. He used to be `deal: 'rod'`, which
    // turned his panel into a shop counter and let anybody who could reach the
    // Ancient Deep and cover the price walk off with the rod on the first
    // meeting - while his own dialogue had been saying "technically, yeah.
    // Practically? Nah. Not yet." the whole time. The rod is behind full
    // rapport now, in the same block Fitch's and Nance's live in, and this is
    // just the man.
    deal: 'talk',
    topic: 'chat',
    mood: 'One of the regulars',
    lines: [YOON.line],
  }
}

export function traderFromKey(key: string, now: number = Date.now()): Trader | null {
  // HIM FIRST, and without a clock. A runner's key carries the night it belongs
  // to and expires with it; Yoon is always there, so his key never goes stale.
  if (key === YOON.key) return yoonTrader()

  // A RUNNER'S KEY carries the night it belongs to. Rebuilt only while that
  // night is still running, so a key kept from an earlier cycle buys nothing.
  if (key.startsWith('night:')) {
    const [, ni, cx, cy] = key.split(':').map(Number)
    if (![ni, cx, cy].every(n => Number.isInteger(n))) return null
    const clock = seaClock(now)
    if (!clock.isNight || clock.nightIndex !== ni) return null
    const r = runnerAt(cx, cy, ni)
    return r && r.key === key ? r : null
  }
  const parts = key.split(':')
  if (parts.length !== 3) return null
  const [day, cx, cy] = parts.map(Number)
  if (!Number.isFinite(day) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null
  if (!Number.isInteger(day) || !Number.isInteger(cx) || !Number.isInteger(cy)) return null
  const t = traderAt(cx, cy, day)
  return t && t.key === key ? t : null
}

/** How many deals a captain can strike in a day.
 *
 *  This is the real bound on the whole feature, and it is here because the map
 *  is client-side: the server has no idea where your boat is, so it cannot
 *  check that you actually sailed to the trader you are dealing with. Rather
 *  than pretend otherwise, the cap makes it not matter. The worst anyone can do
 *  by skipping the sailing is take the best few deals of the day instead of the
 *  nearest few, and the deals are small enough that this is a rounding error
 *  against a day's fishing. */
export const DEALS_PER_DAY = 6

/** Names for the UI, kept next to the definitions rather than in a component,
 *  so a new kind cannot ship half-labelled. */
/** The plain-rod pool, exposed so the chart's resident buyers can draw from the
 *  same one rather than keeping a list of their own. */
export function plainRodFor(seed: number): string {
  return ROD_SLUGS[Math.abs(seed) % ROD_SLUGS.length]
}

/** The matching plain hook, so a chart-defined resident is kitted out the same
 *  way a hashed wanderer is. */
export function plainHookFor(seed: number): string {
  return HOOK_ART[Math.abs(seed) % HOOK_ART.length]
}

export const KIND_LABEL: Record<TraderKind, string> = {
  peddler: 'Bait peddler',
  salter: 'Salter',
  tinker: 'Deep tinker',
  resident: 'Buyer',
  talker: 'An old hand',
  runner: 'Blockade runner',
}

// ── WHAT AN NPC CAPTAIN IS MADE OF ──────────────────────────────────────────
//
// The same pieces the player's own captain is made of, taken straight from the
// cosmetic tables rather than written out here. That means a boat or a bandana
// that ships for players turns up on the Salt Road the same day, with nobody
// having to remember to add it, and a rename can never leave a trader
// invisible because their hull id no longer exists.
//
// The showy ones are held back on purpose. A wandering worm salesman in an
// Ethereal hull reads as a bug, and the glowing cosmetics are things players
// worked for — handing them to background characters cheapens both.
const BOAT_IDS = BOATS.filter(b => !b.glow && !b.crateOnly).map(b => b.id)
const HAT_IDS = HATS.filter(h => !h.crateOnly).map(h => h.id)
const CHAR_COLORS = CHARACTER_COLORS.filter(c => c.free).map(c => c.id)
/** Every hook with art and NO glow, filtered off the real table so a new plain
 *  hook joins the pool the day it ships and one that gains a glow leaves. */
const HOOK_ART = HOOKS.filter(h => !h.glow && !h.glowType && h.imageUrl).map(h => h.imageUrl as string)
/** Every rod with per-frame sprites and NO glow. Filtered off the real table
 *  rather than listed here, so a new plain rod joins the pool the day it ships
 *  and a rod that gains a glow leaves it. */
const ROD_SLUGS = RODS
  .filter(r => !r.glow && !r.glowType && r.slug && !r.imageUrl)
  .map(r => r.slug as string)

/** Every bait this module names, checked at module load. lib/bait keys on
 *  `type` rather than `id`, which is exactly the kind of detail that produces a
 *  trader silently selling nothing; this turns that into a loud startup error
 *  instead of a dead button in the middle of the ocean. */
for (const types of Object.values(STOCK)) {
  for (const t of types) {
    if (!BAITS.some(b => b.type === t)) {
      throw new Error(`seaTraders: unknown bait type "${t}"`)
    }
  }
}
if (!BOAT_IDS.length || !HAT_IDS.length || !CHAR_COLORS.length || !ROD_SLUGS.length || !HOOK_ART.length) {
  throw new Error('seaTraders: a cosmetic pool came out empty')
}
