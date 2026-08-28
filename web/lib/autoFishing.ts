// THE AUTO FAMILY'S TEMPO, in one place for both screens.
//
// These were four literals across two files — 900 and 2200 on the sea, 1400,
// 1200 and 900 on the fishing screen — which meant the same item ran at a
// different rhythm depending on which surface you fished from, and tuning it
// meant finding all of them. One report ("it needs to wait a split second
// longer, and a crate doesn't give enough time to process what you rolled")
// is what surfaced the drift.
//
// The tempo is deliberately slower than a keen player. Auto fishing is an
// unattended convenience, not a speedrun: the beat after a result exists so a
// glance at the screen tells you what has been happening, and the crate
// linger exists because a reward you never saw is a reward that did not
// happen.

/** Result shown → next cast, for an ordinary fish. */
export const AUTO_RECAST_MS = 1700

/** Crate reward revealed → auto-claim, on the fishing screen. This is the
 *  whole window a player has to see WHAT they rolled. */
export const AUTO_CRATE_LINGER_MS = 2600

/** Claimed crate → next cast (the fishing screen parks at idle after a
 *  claim, so this is its own beat). */
export const AUTO_RESUME_MS = 1200

/** The sea runs the crate as one delay from result to recast — its reveal is
 *  inline, not a separate phase — so its number is the fishing screen's
 *  open (700) + linger, kept equal by construction. */
export const AUTO_CRATE_TOTAL_MS = 700 + AUTO_CRATE_LINGER_MS
