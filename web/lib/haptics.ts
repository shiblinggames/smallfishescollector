// Single source for touch / haptic feedback across the game.
//
// Today this is the web Vibration API (navigator.vibrate). That works on
// Android web but is a NO-OP on iOS Safari / PWA, which doesn't implement the
// Vibration API — so on iOS every haptic call below currently does nothing.
//
// On the eventual Capacitor iOS port, swap the body of `vibrate()` to call
// `@capacitor/haptics` (with this web path as the fallback) and EVERY call site
// in the app starts producing real haptics on iOS with no other changes. This
// file is the one swap point — keep all haptic calls routed through here rather
// than calling navigator.vibrate directly.

/** Fire a vibration pattern: a single duration in ms, or an [on, off, on, …]
 *  pattern. Guarded + try/caught, so it's safe to call anywhere (SSR, browsers
 *  without the API, or when the browser refuses outside a user gesture). */
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}
