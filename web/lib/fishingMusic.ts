// Module-level audio singleton for the fishing soundtrack. Lives outside
// React's component tree so it survives navigation — leaving /fishing can
// fade the music out gracefully instead of being chopped by React unmount.
//
// HTML <audio> is used (not Web Audio API) because iOS WebKit + PWA mode
// route Web Audio through a session that often doesn't actually output;
// <audio> uses the reliable "media playback" session.
//
// Fade durations are intentionally generous — entering fishing eases the
// music in over 2s, leaving fades out over 2.5s. Speaker toggle has a
// quick ramp so manual mute/unmute still feels responsive.

let el: HTMLAudioElement | null = null
let fadeRaf: number | null = null

const ENTRY_FADE_MS = 2000
const EXIT_FADE_MS  = 2500
const TOGGLE_FADE_MS = 400

function pickSrc(): string {
  if (typeof document === 'undefined') return '/fishingsoundtrack.mp3'
  const probe = document.createElement('audio')
  if (probe.canPlayType('audio/ogg; codecs="vorbis"')) return '/fishingsoundtrack.ogg'
  return '/fishingsoundtrack.mp3'
}

function ensure(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (el) return el
  const audio = document.createElement('audio')
  audio.src = pickSrc()
  audio.loop = true
  audio.preload = 'auto'
  audio.muted = true
  audio.volume = 0
  audio.setAttribute('playsinline', '')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.display = 'none'
  document.body.appendChild(audio)
  audio.play().catch(() => {})
  el = audio
  return audio
}

function cancelFade() {
  if (fadeRaf !== null) {
    cancelAnimationFrame(fadeRaf)
    fadeRaf = null
  }
}

/** Ramp volume from current to target over ms. Pauses at the end if target
 *  is 0 and pauseAtEnd is true. */
function fadeTo(target: number, ms: number, pauseAtEnd = false) {
  if (!el) return
  const a = el
  cancelFade()
  const startVol = a.volume
  const delta = target - startVol
  if (Math.abs(delta) < 0.001 || ms <= 0) {
    a.volume = target
    if (pauseAtEnd && target === 0) {
      try { a.pause() } catch {}
    }
    return
  }
  const startedAt = performance.now()
  const step = () => {
    const t = Math.min(1, (performance.now() - startedAt) / ms)
    try { a.volume = Math.max(0, Math.min(1, startVol + delta * t)) } catch {}
    if (t >= 1) {
      if (pauseAtEnd && target === 0) {
        try { a.pause() } catch {}
      }
      fadeRaf = null
      return
    }
    fadeRaf = requestAnimationFrame(step)
  }
  fadeRaf = requestAnimationFrame(step)
}

/** Initialize the music on entering /fishing. If unmuted, eases in over
 *  ~2s; if muted, just primes the element so a later unmute is instant. */
export function startFishingMusic(muted: boolean): void {
  const a = ensure()
  if (!a) return
  cancelFade()
  a.muted = muted
  if (muted) {
    a.volume = 1
    return
  }
  // Start silent and ease in.
  a.volume = 0
  a.play().catch(() => {})
  fadeTo(1, ENTRY_FADE_MS)
}

/** Speaker icon toggle. Sets audio.muted synchronously inside the gesture
 *  for iOS, then ramps volume to mask the abrupt cut. */
export function setFishingMusicMuted(muted: boolean): void {
  const a = ensure()
  if (!a) return
  cancelFade()
  a.muted = muted
  if (muted) {
    // No need to ramp — audio.muted gates output regardless of volume.
    a.volume = 1
    return
  }
  a.volume = 0
  a.play().catch(() => {})
  fadeTo(1, TOGGLE_FADE_MS)
}

/** Long fade-out used when leaving the fishing screen. */
export function fadeOutFishingMusic(ms: number = EXIT_FADE_MS): void {
  if (!el) return
  const a = el
  if (a.paused || a.muted) {
    try { a.pause() } catch {}
    return
  }
  fadeTo(0, ms, /* pauseAtEnd */ true)
}
