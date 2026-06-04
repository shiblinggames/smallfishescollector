// Shared audio-session policy: lets the player opt out of the game grabbing
// iOS's playback session, so Spotify / Apple Music / Podcasts can keep
// playing while Small Fishes is open.
//
// The cost: the game's `<audio>`-element session keeper (see fishingMusic.ts
// and tideRunAudio.ts) is what keeps SFX audible on iOS PWA. Releasing the
// session means SFX won't sound on iOS standalone PWA — same trade Apple
// forces every web app to make. Non-iOS browsers + non-standalone Safari
// still play normally; this setting just keeps us from claiming the session
// when we don't have to.
//
// Both fishingMusic.ts and tideRunAudio.ts import getLetOtherAudioPlay() and
// early-return from their unlock / start / play entry points when it's true.
// setLetOtherAudioPlay(true) also actively tears down any in-flight session
// keepers so existing music stops the moment the player flips the switch.

const KEY = 'letOtherAudioPlay'

let cached: boolean | null = null

export function getLetOtherAudioPlay(): boolean {
  if (cached != null) return cached
  if (typeof window === 'undefined') return false
  try {
    cached = window.localStorage.getItem(KEY) === 'true'
  } catch {
    cached = false
  }
  return cached
}

/** Set the policy. When set to true, callers should ALSO release any
 *  existing audio sessions (fadeOutFishingMusic + teardownTideRunAudio).
 *  We don't import those here to avoid a circular dep — see
 *  FishingGame's toggle handler for the live release sequence. */
export function setLetOtherAudioPlay(allow: boolean): void {
  cached = allow
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KEY, String(allow)) } catch {}
}
