// ── HOW OFTEN THE FIGHT RE-RENDERS ──────────────────────────────────────────
//
// RaidCombat is one component of about eight hundred elements built out of a
// hundred pieces of state, so every setState anywhere in it is a full pass over
// the whole tree. That is a known shape and a suspected cost, and "suspected"
// is the problem: the frame meter can say the main thread was busy, but not
// with what.
//
// One integer, bumped in the render body, read by the meter. A side effect in
// render, deliberately: it has to count the renders React actually performs,
// including the ones it throws away, and an effect would only see the committed
// ones. It costs an increment.
export const renderTally = { n: 0 }
