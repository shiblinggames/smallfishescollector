// Module-level audio singleton for the fishing soundtrack. Lives outside
// React's component tree so it survives navigation — leaving /fishing can
// fade the music out gracefully instead of being chopped by React unmount.
//
// Playback strategy:
//   - HTML <audio loop> is the source so iOS WebKit + PWA standalone mode
//     route playback through the reliable "media playback" session. Pure
//     Web Audio playback often outputs nothing in PWAs on iOS.
//   - For volume control we route the element through a Web Audio
//     MediaElementSource + GainNode. iOS ignores JS writes to
//     audio.volume entirely (it always reports 1), but GainNode.gain is
//     sample-accurate everywhere and scheduled on the audio thread, so
//     fades survive heavy main-thread work like route transitions.
//   - The Web Audio setup is deferred to the first user gesture (speaker
//     tap or unmute) because creating + resuming an AudioContext on iOS
//     requires the gesture's call stack. If for any reason the setup
//     fails, we fall back to plain <audio>.muted toggling with no fade.

let el: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let gainNode: GainNode | null = null
let webAudioReady = false
let pendingPauseTimeout: ReturnType<typeof setTimeout> | null = null

const ENTRY_FADE_MS  = 2000
const EXIT_FADE_MS   = 3000
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
  audio.volume = 1
  audio.setAttribute('playsinline', '')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.display = 'none'
  document.body.appendChild(audio)
  audio.play().catch(() => {})
  el = audio
  return audio
}

/** Lazy-setup Web Audio routing. Must be called inside a user gesture so
 *  iOS lets us create + resume the context. Returns true if the GainNode
 *  is wired up and usable for fades. */
function setupWebAudio(): boolean {
  if (webAudioReady) return true
  if (!el || typeof window === 'undefined') return false
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    const ctx = new Ctx()
    const source = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    gain.gain.value = 1
    source.connect(gain).connect(ctx.destination)
    audioCtx = ctx
    gainNode = gain
    webAudioReady = true
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return true
  } catch {
    audioCtx = null
    gainNode = null
    webAudioReady = false
    return false
  }
}

function clearPendingPause() {
  if (pendingPauseTimeout !== null) {
    clearTimeout(pendingPauseTimeout)
    pendingPauseTimeout = null
  }
}

/** Ramp the audible level from current to target over ms. Uses GainNode
 *  scheduling when available (sample-accurate, off main thread). */
function ramp(target: number, ms: number, pauseAtEnd = false) {
  if (!el) return
  const a = el
  clearPendingPause()
  if (webAudioReady && audioCtx && gainNode) {
    const now = audioCtx.currentTime
    const current = gainNode.gain.value
    gainNode.gain.cancelScheduledValues(now)
    gainNode.gain.setValueAtTime(current, now)
    if (ms <= 0) {
      gainNode.gain.setValueAtTime(target, now)
    } else {
      gainNode.gain.linearRampToValueAtTime(target, now + ms / 1000)
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    if (pauseAtEnd && target === 0) {
      pendingPauseTimeout = setTimeout(() => {
        try { a.pause() } catch {}
        pendingPauseTimeout = null
      }, ms + 80)
    }
    return
  }
  // Fallback: rAF-driven audio.volume ramp. Works on desktop without Web
  // Audio set up. No-op on iOS pre-Web-Audio because audio.volume is read
  // only there, so the audio will play at full level until pauseAtEnd
  // pauses it.
  const startVol = a.volume
  const delta = target - startVol
  if (ms <= 0 || Math.abs(delta) < 0.001) {
    try { a.volume = target } catch {}
    if (pauseAtEnd && target === 0) try { a.pause() } catch {}
    return
  }
  const startedAt = performance.now()
  const step = () => {
    const t = Math.min(1, (performance.now() - startedAt) / ms)
    try { a.volume = Math.max(0, Math.min(1, startVol + delta * t)) } catch {}
    if (t >= 1) {
      if (pauseAtEnd && target === 0) try { a.pause() } catch {}
      return
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Initialize the music on entering /fishing. If unmuted, eases in over
 *  ~2s; if muted, just primes the element. */
export function startFishingMusic(muted: boolean): void {
  const a = ensure()
  if (!a) return
  clearPendingPause()
  a.muted = muted
  if (muted) {
    if (webAudioReady && gainNode && audioCtx) {
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime)
      gainNode.gain.setValueAtTime(1, audioCtx.currentTime)
    } else {
      a.volume = 1
    }
    return
  }
  // Begin silent and ramp up.
  if (webAudioReady && gainNode && audioCtx) {
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime)
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
  } else {
    a.volume = 0
  }
  a.play().catch(() => {})
  ramp(1, ENTRY_FADE_MS)
}

/** Speaker icon toggle. Sets audio.muted synchronously inside the gesture
 *  (for iOS) and uses this same call to lazily wire up Web Audio routing
 *  so future fades can ramp the GainNode. */
export function setFishingMusicMuted(muted: boolean): void {
  const a = ensure()
  if (!a) return
  clearPendingPause()
  // Try to wire Web Audio while we have the gesture context. Safe no-op if
  // already set up or unsupported.
  setupWebAudio()
  a.muted = muted
  if (muted) {
    return
  }
  // Ramp from 0 to 1 — quick ramp so manual unmute still feels responsive.
  if (webAudioReady && gainNode && audioCtx) {
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime)
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
  } else {
    a.volume = 0
  }
  a.play().catch(() => {})
  ramp(1, TOGGLE_FADE_MS)
}

/** Long fade-out used when leaving the fishing screen. */
export function fadeOutFishingMusic(ms: number = EXIT_FADE_MS): void {
  if (!el) return
  const a = el
  if (a.paused || a.muted) {
    try { a.pause() } catch {}
    return
  }
  ramp(0, ms, /* pauseAtEnd */ true)
}
