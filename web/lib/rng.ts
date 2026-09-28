// ── THE DICE, IN ONE PLACE (Steam prep, Phase A step 2, 2026-09-28) ──────────
//
// Every roll in the game's rules modules goes through `rngNext()`. Normally it
// IS `Math.random()`: nothing about the odds or the behaviour changed when the
// modules were switched over. What it adds is a seam:
//
//   withRng(mulberry32(seed), () => rollSomething())
//
// runs a roll against a seeded generator, so the same seed gives the same
// result every time. That is what makes rules testable, a run replayable by
// the server (verified leaderboards), and the engine runnable offline.
//
// SYNCHRONOUS ONLY. The override is a module-level slot, swapped in and back
// out around `fn`. Never `await` inside withRng: on the server another request
// could run in the gap and roll against your seed. Every roll module is
// synchronous, which is why this is safe for them.
//
// NOT FOR VISUALS. Particles, sound, camera jitter and the like keep
// Math.random; they are not rules and nothing replays them.

/** A source of floats in [0, 1), like Math.random. */
export type Rng = () => number

// ON globalThis, NOT A MODULE VARIABLE. A runner that loads this file twice
// (tsx scripts load it once as ESM and once as CommonJS; hot reload can do it
// too) would otherwise give each copy its own slot, and a seed set through
// one copy would never reach rolls made through the other.
const SLOT = Symbol.for('seasthebooty.rng')
type Holder = { [SLOT]?: Rng }
const holder = globalThis as unknown as Holder

/** The next roll: a float in [0, 1). Use this, not Math.random, in rules code. */
export function rngNext(): number {
  const r = holder[SLOT]
  return r ? r() : Math.random()
}

/** Run `fn` with `rng` as the dice, then put the old dice back. Sync only. */
export function withRng<T>(rng: Rng, fn: () => T): T {
  const prev = holder[SLOT]
  holder[SLOT] = rng
  try { return fn() } finally { holder[SLOT] = prev }
}

/**
 * mulberry32: small, fast, well-distributed, seedable. The same algorithm the
 * gossip deck and the treasure-match boards already use, so their sequences
 * are unchanged if they are ever pointed here.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A 32-bit seed from any string (a run id, a date, a user id). FNV-1a. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * INSTALL a generator process-wide (null restores Math.random). For the
 * OFFLINE build and tools only: one player in one process, where the save's
 * own seeded generator should drive every roll, across awaits. NEVER on the web
 * server, whose one process serves many requests at once (withRng is the
 * scoped, sync-only form for that world).
 */
export function installRng(rng: Rng | null): void {
  holder[SLOT] = rng ?? undefined
}
