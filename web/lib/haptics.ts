// Single source for touch / haptic feedback across the game.
//
// TWO BACKENDS, picked at call time:
//
//   • Inside the Capacitor iOS shell — the real Taptic Engine, via the Haptics
//     plugin. iOS Safari does not implement the Vibration API at all, so before
//     this every haptic call in the game did nothing whatsoever on an iPhone.
//   • Everywhere else — navigator.vibrate, which works on Android web.
//
// The native path goes through Capacitor's GLOBAL BRIDGE rather than importing
// @capacitor/haptics. That is deliberate: an import would pull the package into
// the website's bundle for every visitor who will never run the native shell,
// and would make the web build depend on a native-only package. Capacitor
// injects `window.Capacitor` before the page runs, so inside the shell the
// plugin is simply there, and outside it these checks fail and we fall back.
// Zero dependencies, zero bundle cost, website unaffected.
//
// Keep every haptic call in the app routed through this file rather than
// calling navigator.vibrate directly — this is the one swap point.

type CapHaptics = {
  impact?: (o: { style: string }) => Promise<void>
  notification?: (o: { type: string }) => Promise<void>
}
type CapBridge = {
  isNativePlatform?: () => boolean
  Plugins?: { Haptics?: CapHaptics }
}

/** The Capacitor Haptics plugin, or null when we are not in the native shell. */
function nativeHaptics(): CapHaptics | null {
  if (typeof window === 'undefined') return null
  const cap = (window as unknown as { Capacitor?: CapBridge }).Capacitor
  if (!cap?.isNativePlatform?.()) return null
  return cap.Plugins?.Haptics ?? null
}

/** Fire and forget. The plugin returns a promise nobody awaits, and a rejection
 *  (plugin missing, haptics disabled in system settings) must never surface as
 *  an unhandled rejection in the middle of a combat loop. */
function fire(p: Promise<void> | undefined): void {
  try { p?.catch(() => {}) } catch { /* no-op */ }
}

/** Fire a vibration pattern: a single duration in ms, or an [on, off, on, …]
 *  pattern. Guarded + try/caught, so it's safe to call anywhere (SSR, browsers
 *  without the API, or when the browser refuses outside a user gesture). */
export function vibrate(pattern: number | number[]): void {
  const h = nativeHaptics()
  if (h) {
    // iOS has no arbitrary buzz patterns, only three impact weights. Total
    // ON-time is what a player perceives as "how big was that", so sum that and
    // map it onto a weight.
    //
    // navigator.vibrate alternates ON, OFF, ON, … starting with ON, so the ON
    // times are the EVEN indices. Worth stating because it is easy to get
    // backwards, and backwards is silently wrong rather than broken: the
    // perfect-reel buzz [40, 60, 80] is 120ms of vibration, not 60.
    const ms = Array.isArray(pattern)
      ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
      : pattern
    // Thresholds are set against real ON-times in the game: a normal reel or
    // button tap is 6, a fired shot is ~18-26, the perfect reel is 120.
    fire(h.impact?.({ style: ms >= 60 ? 'HEAVY' : ms >= 20 ? 'MEDIUM' : 'LIGHT' }))
    return
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* some browsers throw if called outside a user gesture — ignore */
  }
}

// ── Haptic tiers ─────────────────────────────────────────────────────────────
// Use these instead of ad-hoc vibrate() numbers so the whole game speaks one
// tactile language. Pick by MEANING, not by surface:
//   hapticTap    — "input registered": button press-down, toggle, tab switch,
//                  card select. Light and instant; safe to fire often.
//   hapticCommit — "action locked in": firing a shot, confirming a swipe
//                  action, submitting, spending. One deliberate bump.
//   hapticReward — "you got something": currency landing, claim, level-up,
//                  loot. The celebratory double-buzz (matches the coin-fly
//                  pattern in AchievementsClient).
//
// Each maps to the closest NATIVE feel rather than to its millisecond count.
// The reward tier becomes a success NOTIFICATION, which on iOS is a distinct
// two-part tap that reads as celebratory in a way a plain buzz cannot.
export function hapticTap(): void {
  const h = nativeHaptics()
  if (h) { fire(h.impact?.({ style: 'LIGHT' })); return }
  vibrate(6)
}
export function hapticCommit(): void {
  const h = nativeHaptics()
  if (h) { fire(h.impact?.({ style: 'MEDIUM' })); return }
  vibrate(15)
}
export function hapticReward(): void {
  const h = nativeHaptics()
  if (h) { fire(h.notification?.({ type: 'SUCCESS' })); return }
  vibrate([0, 18, 40, 22])
}
