'use client'

/**
 * ── WHEN THE FIRST-RUN MODALS ARE FINALLY OFF THE SCREEN ────────────────────
 *
 * `SetupModal` and `WelcomeModal` hang off the app shell (see the (app) layout)
 * because they belong to the account rather than to a page. The sea took the
 * startup slot, so a brand new captain is dropped on /sea and the chart mounts
 * UNDERNEATH them — which is why Doby's first line was appearing along the
 * bottom of the screen while the captain was still being asked their name.
 *
 * The page cannot simply read `has_seen_setup`, because setup finishes on the
 * client and nothing revalidates: `markSetupSeen` writes the column and the
 * modal hides itself with local state, so the server's copy of the profile
 * stays stale for the rest of the session. A captain gated on the server flag
 * would never see the tour start at all.
 *
 * So the end of onboarding is announced. One event, on the window, in the same
 * shape the membership popup already uses to cross the tree.
 */
export const FIRST_RUN_DONE = 'firstrun-done'

/** Fired by whichever modal is genuinely last: `WelcomeModal` when there is a
 *  welcome to show, `SetupModal` when there is not. */
export function announceFirstRunDone() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(FIRST_RUN_DONE))
}

/** Subscribe. Returns the unsubscribe, so it drops straight into an effect. */
export function onFirstRunDone(fn: () => void) {
  window.addEventListener(FIRST_RUN_DONE, fn)
  return () => window.removeEventListener(FIRST_RUN_DONE, fn)
}
