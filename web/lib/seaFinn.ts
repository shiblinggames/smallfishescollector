// WHERE FINN IS.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and every export here is pure.
//
// ── HE STOPPED AMBUSHING YOU ────────────────────────────────────────────────
//
// On the fishing screen Finn was a 2% roll on every cast. He arrived on top of
// you, said his piece and left, and the player did nothing to earn any of it.
// That worked on a screen where there was nowhere to go. On the chart there is
// everywhere to go, so he is a man standing on the water instead: you find him,
// you pull alongside, he talks, and when you have talked he is gone. The next
// beat of the story is somewhere else on the sea and you have to go and get it.
//
// ── NOBODY IS A ROW, INCLUDING HIM ──────────────────────────────────────────
//
// Same law as the traders (see docs/systems/sea-npcs.md): his position is
// DERIVED, never stored. The only thing in the database is how many times you
// have spoken to him — `profiles.finn_encounters`, which already existed — and
// his haunt is a pure function of that number and your reach. So "he disappears
// after you talk to him" needs no column and no cleanup: the count goes up, the
// function returns somewhere else, and the old spot is empty water.
//
// It also means every captain has their own Finn, which is correct. He is the
// story's, not the world's, and two players standing on the same wave are at
// different points in it.
//
// ── THE TWO PROPERTIES THAT MATTER ──────────────────────────────────────────
//
// 1. HE IS NEVER STANDING ON ANYTHING. A Finn moored inside an isle's landing
//    circle puts his hail button and the island's "go ashore" button on the
//    same spot, and the action bar only shows one thing at a time.
//
// 2. CONSECUTIVE HAUNTS ARE FAR APART. If he reappeared half a screen from
//    where you just left him, "finding him" would be a formality and this whole
//    change would be for nothing.
//
// The first attempt at this used low-discrepancy strides and trusted them to
// give both for free. Measured, they gave neither: 513 haunts in 2,400 sat on
// top of something, and the closest consecutive pair was 790px — narrower than
// the hail circle, so he would have reappeared close enough to talk to without
// moving the boat.
//
// So both are now ENFORCED rather than hoped for. The strides still generate
// the candidates (they fill an arc far more evenly than a hash does), but each
// one is tested, and the walk from haunt to haunt is explicit. See `finnHaunt`.
//
// As measured now, over 1,800 haunts: nothing overlaps anything that owns a
// button, and the shortest hop between consecutive haunts is 2,485px — 1.6x the
// hail circle, so finishing a conversation never leaves you already inside the
// next one. `scripts/check-finn.mts` asserts both on every build.

import { PLACES, LANDMARKS, RESIDENTS, SOCIALS, YOON } from '@/app/(app)/sea/chart'
import { ISLES, ashoreRange } from '@/lib/seaIsles'

/** How close you have to be to hail him. Wider than a trader's HAIL_RANGE
 *  (600): a trader is one of dozens and you will pass another, whereas missing
 *  Finn by a boat length means sailing the whole leg again. */
export const FINN_REACH = 780

/**
 * How far he must move between haunts, when the water allows it.
 *
 * A soft target, not a hard floor — the Shallows is a 2,400px-wide ring and its
 * whole arc is not much more than this, so a hard floor would be unsatisfiable
 * there and the function would have to fail. Instead the best available
 * candidate wins, which degrades gracefully in tight water and is exact
 * everywhere else.
 */
const MIN_MOVE = 4200

/** Golden ratio conjugate — the angle stride. */
const PHI = 0.618033988749895
/** Plastic number conjugate — the radius stride. Deliberately a DIFFERENT
 *  irrational to the angle's, or the two would advance in lockstep and every
 *  haunt would sit on one spiral arm. */
const PSI = 0.754877666246693
/** A third, for which band he picks. */
const RHO = 0.543689012692076

const frac = (n: number) => n - Math.floor(n)

/** The southern fan runs 0 (due east) through π (due west) — the same arc the
 *  isles are placed on. Held off both ends so he is never tucked under the
 *  reef at the extremes. */
const ANG_MIN = 0.10
const ANG_MAX = Math.PI - 0.10
/** Off the north coast. The bands are rings, but the chart is bounded above by
 *  the reef and the inner rings' east and west ends run up under it. */
const MIN_Y = 700

/**
 * Everything he must not be standing inside, as {x, y, keep}.
 *
 * Built once at module load. Bands are skipped — a band is not an obstacle, it
 * is the water itself, and `p.inner !== undefined` is the same test
 * `scripts/place-isles.mts` uses to tell one from the other.
 */
const AVOID: { x: number; y: number; keep: number }[] = (() => {
  const out: { x: number; y: number; keep: number }[] = []
  // ANYTHING WITH ITS OWN BUTTON keeps a full hail circle clear, because the
  // action bar shows one thing at a time and two overlapping prompts means one
  // of them is unreachable. That is ports (MOOR is 420), isles (ashoreRange)
  // and the moored buyers (HAIL_RANGE is 600).
  for (const p of PLACES) {
    if (p.inner !== undefined) continue
    out.push({ x: p.x, y: p.y, keep: p.r + 420 + FINN_REACH })
  }
  for (const i of ISLES) out.push({ x: i.x, y: i.y, keep: ashoreRange(i) + FINN_REACH })
  for (const r of RESIDENTS) out.push({ x: r.x, y: r.y, keep: 600 + FINN_REACH })
  // The three who keep no shop hail exactly like the buyers do, so they own
  // exactly the same circle of water and Finn must not stand in it.
  for (const r of SOCIALS) out.push({ x: r.x, y: r.y, keep: 600 + FINN_REACH })
  out.push({ x: YOON.x, y: YOON.y, keep: 600 + FINN_REACH })
  // LANDMARKS ARE SCENERY. A monolith has no prompt to compete with, so all
  // that matters is that Finn's boat is not drawn inside it — visual clearance,
  // not a hail circle. The first cut gave these `size + 600 + FINN_REACH` and
  // 35 of them at that radius sealed the Shallows off completely: measured, the
  // band came out 0.0% clear and every haunt in it fell through to the
  // overlap-anyway fallback. Hence the checker.
  for (const l of LANDMARKS) out.push({ x: l.x, y: l.y, keep: l.size + 300 })
  return out
})()

const clear = (x: number, y: number) =>
  y >= MIN_Y && !AVOID.some(a => Math.hypot(a.x - x, a.y - y) < a.keep)

export type FinnHaunt = {
  x: number
  y: number
  /** The band he is sitting in, for the line that names the water. */
  bandId: string
  bandName: string
  /** Sent to the server when you hail him. See the note on verification in
   *  app/(app)/sea/finnActions.ts — this is an agreement check, not a secret. */
  key: string
}

/** The five waters, inner-to-outer, with the level each opens at. */
function bandsFor(fishingLevel: number) {
  const all = PLACES.filter(p => p.kind === 'water' && p.inner != null && p.outer != null)
  const open = all.filter(b => fishingLevel >= b.minLevel)
  // A captain below the first band's level still gets the Shallows: there is
  // nowhere else to put him, and an empty sea with no story in it is worse than
  // a slightly early one.
  if (open.length === 0) return all.slice(0, 1)
  // ONCE THERE IS REAL WATER, HE IS NOT ON THE DOORSTEP. The Shallows is the
  // narrowest band on the chart and it also holds all four ports and five
  // landmarks, which leaves 3.7% of it standing room — so haunts there mostly
  // fail and fall back. It is also just the wrong place for him: the Shallows
  // is where you keep your house, and a rival who is always loitering off the
  // end of your own dock is not a man you have to go and find.
  return open.length > 1 ? open.slice(1) : open
}

/**
 * One candidate spot for haunt `n`, attempt `k`.
 *
 * `k` walks a second, much coarser stride so retries scatter across the whole
 * arc instead of creeping along it — a creeping retry inside a dense patch of
 * isles just tests the same blocked neighbourhood forty times.
 */
function candidate(n: number, k: number, inner: number, outer: number) {
  const t = n + k * 0.6180339887
  let ang = ANG_MIN + frac(0.13 + t * PHI) * (ANG_MAX - ANG_MIN)
  const pad = 420
  const span = Math.max(1, outer - inner - pad * 2)
  const rad = inner + pad + frac(0.41 + t * PSI) * span
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad }
}

/** Which water he is in for haunt `n`.
 *
 *  BIASED DEEP (the 0.62 exponent). He is a man drifting toward the black water
 *  and the story says so long before he does; having him turn up in the
 *  Shallows as often as the Abyss would flatten that. But it is a bias and not
 *  a rule, because the deepest band is also the longest sail and every haunt
 *  being the far edge of the chart is a chore rather than a voyage. */
function bandFor(n: number, pool: ReturnType<typeof bandsFor>) {
  const i = Math.min(pool.length - 1, Math.floor(Math.pow(frac(0.31 + n * RHO), 0.62) * pool.length))
  return pool[i]
}

/** One haunt, given where the previous one was. Exported only for the checker. */
export function haunt(n: number, fishingLevel: number, prev: { x: number; y: number } | null): FinnHaunt {
  const band = bandFor(n, bandsFor(fishingLevel))
  const inner = band.inner!, outer = band.outer!

  // Walk the candidates, keeping the best. "Best" is the one furthest from
  // where he was, and the search stops the moment one clears MIN_MOVE — so in
  // open water this costs a couple of iterations, and only in tight water does
  // it run the full sweep to find the roomiest compromise available.
  let best: { x: number; y: number } | null = null
  let bestD = -1
  for (let k = 0; k < 240; k++) {
    const c = candidate(n, k, inner, outer)
    if (!clear(c.x, c.y)) continue
    const d = prev ? Math.hypot(c.x - prev.x, c.y - prev.y) : Infinity
    if (d > bestD) { best = c; bestD = d }
    if (d >= MIN_MOVE) break
  }

  // Nothing clear at all in 240 tries. Cannot happen with the current chart (the
  // checker proves it), but a future island could make it happen, and a Finn
  // who is nowhere is a story that cannot continue. Take the first candidate
  // and let him overlap something rather than vanish.
  if (!best) best = candidate(n, 0, inner, outer)

  const x = Math.round(best.x)
  const y = Math.round(best.y)
  return { x, y, bandId: band.id, bandName: band.name, key: `finn:${n}:${x}:${y}` }
}

/**
 * Where Finn is for a captain who has spoken to him `encounters` times and can
 * fish to `fishingLevel`.
 *
 * THE BAND IS CAPPED BY YOUR REACH. Sending a level-4 captain to the Ancient
 * Deep for the next line of the story is sending them nowhere — the water is
 * open to sail but it is a very long way through nothing, and the beat they are
 * being asked to cross it for is the one where Finn is still pretending to be a
 * man who likes fishing.
 *
 * WHY THIS WALKS FROM ZERO. Each haunt is defined partly by the one before it
 * (he has to move a long way), so the sequence is genuinely ordered rather than
 * indexable. Walking it costs one cheap loop per haunt and the highest count on
 * the live table is 141, so the worst real call is 141 iterations of arithmetic
 * — cheaper than the render it feeds. The result is memoised anyway, because it
 * is asked for on every frame that draws the marker.
 */
let memo: { n: number; lvl: number; h: FinnHaunt } | null = null

export function finnHaunt(encounters: number, fishingLevel: number): FinnHaunt {
  const n = Math.max(0, Math.min(100_000, Math.floor(encounters)))
  if (memo && memo.n === n && memo.lvl === fishingLevel) return memo.h

  let prev: { x: number; y: number } | null = null
  let h = haunt(0, fishingLevel, null)
  for (let i = 1; i <= n; i++) {
    prev = { x: h.x, y: h.y }
    h = haunt(i, fishingLevel, prev)
  }
  memo = { n, lvl: fishingLevel, h }
  return h
}

/** Whether a boat at (x, y) is close enough to hail him. */
export function finnNear(h: FinnHaunt, x: number, y: number): boolean {
  return Math.hypot(h.x - x, h.y - y) < FINN_REACH
}

/**
 * WHAT HE LOOKS LIKE ON THE WATER.
 *
 * Built from the same cosmetic tables the player's own captain is, like every
 * other person out here — an NPC assembled from real parts is house-style by
 * construction rather than by anyone remembering to match it.
 *
 * `ruby` is his canon colour (FINN_AVATAR in lib/finn.ts) and it carries over
 * so the man on the deck is recognisably the man in the portrait that opens
 * when you hail him.
 *
 * Mahogany and a plain brown hat: WARM and well-kept, not black and not gold.
 * Pre-reveal he has to read as a rival who does well for himself, and the note
 * on FINN_AVATAR is explicit that the menacing version was tried and rejected.
 * Nothing here should tell you what he is before the story does.
 */
export const FINN_LOOK = {
  characterColor: 'ruby',
  boatId: 'mahogany',
  hatId: 'brown',
  /**
   * HE CARRIES A ROD NOW. He was the only angler on this chart holding
   * nothing, which on a sea where every trader and every regular is drawn with
   * their kit made the rival look like scenery rather than a fisher.
   *
   * TWIN-STRIKE, and the choice is not idle. It is plain rather than glowing,
   * because a glowing rod is a thing a player earns and putting one in his
   * hands pre-reveal would flag him as more than he is claiming to be. It is
   * tier 11, which reads simply as somebody genuinely good. And the NAME is
   * the sort of foreshadowing the arc is built on: innocent on the way past,
   * and obvious in hindsight once you know what he is. See
   * docs/systems/story-universe.md on never leaking the twist early.
   */
  rodSlug: 'rod_twinstrike',
  hook: '/hook_bronze.png',
} as const
