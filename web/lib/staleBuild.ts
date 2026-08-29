// THE TAB IS RUNNING A BUILD THAT NO LONGER EXISTS.
//
// ── WHAT HAPPENS ────────────────────────────────────────────────────────────
//
// A page is served with a reference to hashed JS chunks: /_next/static/…-a1b2.js.
// Those names change every build. So a tab left open across a deploy is holding
// a list of filenames that the CDN has stopped serving, and the moment it needs
// one it has not already downloaded — a route change, a lazily-loaded component
// — the request 404s.
//
// Next.js surfaces that as a render error. With no error boundary the tree
// unmounts and the page goes white, the browser retries, it fails the same way,
// and iOS Safari eventually gives up with "A problem repeatedly occurred". It
// looks like a crash in whatever was pushed. It is not: it is the OLD build
// failing, which is why it always cleared itself as soon as the page was
// properly reloaded, and why it happened after every deploy regardless of what
// was in it.
//
// ── WHY THIS IS A LIST OF STRINGS ───────────────────────────────────────────
//
// Every engine words it differently and none of them use a shared error type.
// Chrome throws ChunkLoadError with "Loading chunk 42 failed". Safari says
// "Importing a module script failed", which is the one that matters here since
// this is where the report came from. Firefox says "error loading dynamically
// imported module". There is no structured field to test, so the message is
// what there is.
//
// Matching too broadly is the danger: reloading on a real bug would hide it
// behind an infinite refresh. Every phrase below is specific to fetching a
// script, and the reload is capped besides.

const STALE_SIGNS = [
  'chunkloaderror',
  'loading chunk',
  'loading css chunk',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
  'unexpected token \'<\'',
]

/** Does this error look like a build that has been deployed out from under us? */
export function isStaleBuild(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`.toLowerCase()
  return STALE_SIGNS.some(s => text.includes(s))
}

/** At most one automatic reload per minute, remembered across the reload. */
const KEY = 'stb:stale-reload'
const COOLDOWN = 60_000
/** The throwaway parameter that makes the recovery navigation a new address. */
const BUST = 'stb'

/**
 * Reload onto the current build, once.
 *
 * The guard is the whole safety of this. An error that survives the reload —
 * a genuine bug that happens to mention a module — would otherwise refresh the
 * page forever, which is a far worse failure than the one being fixed. Held in
 * sessionStorage so it survives the reload it is guarding against, and scoped
 * to the tab so one bad tab cannot lock out the others.
 *
 * Returns whether it is reloading, so the caller knows whether to bother
 * drawing anything.
 */
export function reloadOntoCurrentBuild(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < COOLDOWN) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Private mode, or storage disabled. One reload attempt is still better
    // than a white screen, and without storage there is nothing to loop on
    // except the user's own patience.
  }
  // replace(), not reload(): reload can re-run from the back/forward cache with
  // the same stale document, which is exactly what we are trying to leave.
  //
  // AND TO A DIFFERENT URL, for the same reason one step further on. Replacing
  // with the identical href can still be answered from a cache — the bfcache on
  // an installed PWA especially — and coming back to the same document is not a
  // recovery, it is the same failure with the cooldown now spent. One throwaway
  // parameter makes the address new, so the navigation has to be satisfied from
  // the network. The guard strips it again on arrival.
  try {
    const u = new URL(window.location.href)
    u.searchParams.set(BUST, String(Date.now()))
    window.location.replace(u.toString())
  } catch {
    window.location.replace(window.location.href)
  }
  return true
}

/** Did this page load come from the guard's own reload a moment ago? Read by
 *  the toast that names the flash. The window is generous because iOS can take
 *  a few seconds to actually complete the navigation it was asked for. */
export function justReloadedForBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    return last > 0 && Date.now() - last < 8000
  } catch {
    return false
  }
}

/**
 * Take the recovery parameter back out of the address bar.
 *
 * It exists only to make one navigation uncacheable; leaving it behind would
 * put it in every share, every bookmark and every subsequent history entry.
 * `replaceState`, so it does not add a step to the back button.
 */
export function clearBuildBust(): void {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    if (!u.searchParams.has(BUST)) return
    u.searchParams.delete(BUST)
    window.history.replaceState(null, '', u.pathname + u.search + u.hash)
  } catch {
    // An address we cannot parse is one we should not be rewriting.
  }
}
