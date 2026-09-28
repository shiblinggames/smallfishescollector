// ── THE CLOCK, IN ONE PLACE (Steam prep, Phase A step 2, 2026-09-28) ─────────
//
// The rules modules read the time through `clockNow()`. Normally it IS
// `Date.now()`, so nothing changed when they were switched over. The seam:
//
//   withClock(fixedMs, () => whatDayIsIt())
//
// pins the time for a test, a replay, or an offline engine whose device clock
// cannot be trusted. Same rules as lib/rng: synchronous only, never await
// inside, and not for visuals (animation timing keeps performance.now).

// On globalThis for the same reason as lib/rng: every loaded copy shares it.
const SLOT = Symbol.for('seasthebooty.clock')
type Holder = { [SLOT]?: () => number }
const holder = globalThis as unknown as Holder

/** Milliseconds since the epoch, like Date.now. Use this in rules code. */
export function clockNow(): number {
  const c = holder[SLOT]
  return c ? c() : Date.now()
}

/** Run `fn` with the clock pinned to `ms` (or driven by a function). Sync only. */
export function withClock<T>(ms: number | (() => number), fn: () => T): T {
  const prev = holder[SLOT]
  holder[SLOT] = typeof ms === 'number' ? () => ms : ms
  try { return fn() } finally { holder[SLOT] = prev }
}
