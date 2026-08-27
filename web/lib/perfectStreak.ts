// WHAT A PERFECT STREAK IS WORTH — the only copy of the maths.
//
// The server is still the authority: reelIn tracks the live streak in
// current_perfect_streak and computes the XP that is actually banked. Nothing
// here is trusted for a value. What this file exists for is that the Loadout
// sheet has to TELL a captain what their streak is worth, and a second copy of
// the formula on the client would be one edit away from lying about it.
//
// The shape, and why it is this shape: the bonus used to be a flat
// `min(streak,10)² × 3` XP added to the catch, which is backwards in a game
// whose per-catch XP spans 37.5× between the Shallows (zone mult 0.40) and the
// Ancient Deep (15.0). A streak-10 perfect came to 12.5× the fish in the
// starting water and 1.3× in the endgame, so the streak was decisive exactly
// where the fish are worth least. As a percentage it is worth the same
// proportion wherever you fish.

/** Past this, a longer streak pays no more. */
export const STREAK_XP_CAP = 10

/** How much each perfect in the streak adds, before the level scale. */
const PER_STEP = 0.08

/**
 * What a level-1 captain gets of the full ramp.
 *
 * NOT ZERO, and that is deliberate. Scaling from nothing would make a streak
 * worth 1.01× at level 1 — worthless at precisely the moment the mechanic has
 * to teach itself, which is the old mistake pointed the other way.
 */
const LEVEL_FLOOR = 0.4

/** How much of the ramp this captain has earned. 0.40 at Lv1 to 1.00 at Lv100. */
export function streakLevelScale(fishingLevel: number): number {
  return LEVEL_FLOOR + (1 - LEVEL_FLOOR) * (Math.min(Math.max(fishingLevel, 1), 100) / 100)
}

/**
 * The multiplier applied to a catch's XP.
 *
 * Returns exactly 1 at streak 0, which is what a missed perfect leaves behind —
 * the streak resets rather than decaying, so there is no partial credit.
 */
export function streakMult(streak: number, fishingLevel: number): number {
  return 1 + Math.min(Math.max(streak, 0), STREAK_XP_CAP) * PER_STEP * streakLevelScale(fishingLevel)
}

/**
 * THE HIGHEST STREAK THE RECORD BOOKS WILL BELIEVE.
 *
 * The dial is client physics and reelIn takes the 'perfect' attestation from
 * the client, so the streak COUNTER cannot be forged but its INPUTS can — an
 * account was found at 69 with no boosters, against an all-time honest best of
 * 33 set by a 22,615-cast veteran running the game's top sustained rate (33%).
 * At that rate the chance of 40 straight is about 5e-20; a whole career of
 * twenty thousand casts expects zero of them. 45 is comfortably past anything
 * skill has ever produced and astronomically short of what forgery produces.
 *
 * Same shape as Tide Run's plausibility split: the record write is refused and
 * the claim is flagged for review; the LIVE streak keeps counting, because
 * gameplay is not the target — the leaderboard and the badge ladder are. The
 * ladder tops out at 30 (in_the_flow), well under the ceiling, so no honest
 * badge is reachable only by crossing it.
 *
 * If a legitimate player ever gets near this, the flags will show a clean
 * climb through the 30s first — raise it then, with the evidence in hand.
 */
export const STREAK_RECORD_CEILING = 45
