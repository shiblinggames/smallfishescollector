// ── NOTHING WAITS ON THE DATABASE FOREVER ───────────────────────────────────
//
// On 2026-08-28 three page loads hung for FIVE MINUTES and then died with a
// platform 504: two on /sea, one on /leaderboard. From the outside it looked
// like the site was down. It was not - it served nearly 3,000 other requests
// in the same window without an error - but for the captain sitting on it,
// "spins forever and then says the connection was lost" and "down" are the
// same thing.
//
// The mechanism was that neither Supabase client set a timeout. `fetch` with
// no signal waits as long as the other end keeps the socket open, so ONE slow
// or stuck call to the database pinned the whole serverless function until
// Vercel's own 300-second guillotine came down. Every layer was patiently
// waiting for the layer below it and nobody had said how long was too long.
//
// So every request through either client now carries a deadline.
//
// WHY 10 SECONDS. Every query this game makes is a handful of indexed reads or
// one RPC; the ones we have measured come back in tens of milliseconds. Ten
// seconds is not a performance budget, it is the line past which the answer
// has stopped being useful to somebody staring at a loading screen. A caller
// that genuinely needs longer - a cron doing bulk work - says so explicitly.
//
// This is deliberately the INNER of two limits. The route segments cap out at
// `maxDuration` seconds, comfortably above this, so a stuck query trips this
// timeout first and surfaces as a real error the page can render, rather than
// as a platform timeout with no application code left alive to explain it.

/** The default deadline for one Supabase HTTP request. */
export const SUPABASE_TIMEOUT_MS = 10_000

/**
 * A `fetch` that gives up after `ms`.
 *
 * Supabase passes its own `signal` for calls made through `.abortSignal()`, so
 * the caller's signal is honoured ALONGSIDE the deadline rather than replaced
 * by it - whichever fires first wins. `AbortSignal.any` does that in one line
 * on Node 20+; the fallback covers any runtime that lacks it, because silently
 * dropping a caller's cancellation would be a worse bug than the one this file
 * exists to fix.
 */
export function timedFetch(ms: number = SUPABASE_TIMEOUT_MS): typeof fetch {
  return (input, init) => {
    const deadline = AbortSignal.timeout(ms)
    const caller = init?.signal
    let signal: AbortSignal = deadline

    if (caller) {
      if (typeof AbortSignal.any === 'function') {
        signal = AbortSignal.any([caller, deadline])
      } else {
        const relay = new AbortController()
        const stop = () => relay.abort()
        if (caller.aborted || deadline.aborted) relay.abort()
        else {
          caller.addEventListener('abort', stop, { once: true })
          deadline.addEventListener('abort', stop, { once: true })
        }
        signal = relay.signal
      }
    }

    return fetch(input, { ...init, signal })
  }
}
