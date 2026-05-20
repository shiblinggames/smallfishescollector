// Module-level audio singleton for the fishing soundtrack. Lives outside
// React's component tree so it survives navigation — leaving /fishing can
// fade the music out gracefully instead of being chopped by React unmount.
//
// Playback strategy:
//   - Two HTML <audio> elements alternate (a "ping-pong") to give a truly
//     gapless loop. <audio loop> on every browser inserts a small pause at
//     the boundary even with gapless-capable formats; manually handing off
//     to a primed second element on the `ended` event sidesteps that.
//   - Both elements are routed through Web Audio MediaElementSource +
//     shared GainNode so we can ramp the volume on the audio thread
//     (sample-accurate, off main thread, and iOS actually respects
//     GainNode.gain unlike HTMLAudioElement.volume).
//   - Both elements use the "media playback" session because they're
//     <audio> elements — that's what keeps audio output working in iOS PWA
//     standalone mode, where pure Web Audio playback often outputs nothing.
//   - Web Audio routing + both elements are primed lazily on the first
//     user gesture (speaker tap or unmute) since iOS requires the gesture
//     call stack for context resume / element unlocking.

let elA: HTMLAudioElement | null = null
let elB: HTMLAudioElement | null = null
let current: HTMLAudioElement | null = null
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

function makeAudio(src: string): HTMLAudioElement {
  const audio = document.createElement('audio')
  audio.src = src
  // No `loop` attribute — the swap handler manages looping manually.
  audio.preload = 'auto'
  audio.muted = true
  audio.volume = 1
  audio.setAttribute('playsinline', '')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.display = 'none'
  return audio
}

function ensure(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  if (elA && elB && current) return current
  const src = pickSrc()
  const a = makeAudio(src)
  const b = makeAudio(src)
  document.body.appendChild(a)
  document.body.appendChild(b)
  elA = a
  elB = b
  current = a
  // Hand off on natural end — primed by calling play() on the partner from
  // position 0. The browser-managed gap that bothers `<audio loop>` doesn't
  // happen here because we drive the loop manually.
  const handoff = (just: HTMLAudioElement, partner: HTMLAudioElement) => {
    just.addEventListener('ended', () => {
      // Reset the one that just finished so the next handoff is instant.
      try { just.currentTime = 0 } catch {}
      try { partner.currentTime = 0 } catch {}
      partner.play().catch(() => {})
      current = partner
    })
  }
  handoff(a, b)
  handoff(b, a)
  // Start the primary muted so autoplay is allowed.
  a.play().catch(() => {})
  return current
}

/** Lazy Web Audio routing. Must be invoked inside a user gesture so iOS
 *  permits ctx creation + resume. Both elements share one GainNode for
 *  fades. */
function setupWebAudio(): boolean {
  if (webAudioReady) return true
  if (!elA || !elB || typeof window === 'undefined') return false
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    const ctx = new Ctx()
    const srcA = ctx.createMediaElementSource(elA)
    const srcB = ctx.createMediaElementSource(elB)
    const gain = ctx.createGain()
    gain.gain.value = 1
    srcA.connect(gain)
    srcB.connect(gain)
    gain.connect(ctx.destination)
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

/** Unlock the partner element for iOS playback. iOS unlocks each <audio>
 *  element individually — the partner needs its own play()-during-gesture
 *  call before it can be used in the swap handoff. */
function primePartner(): void {
  if (!elA || !elB) return
  const partner = current === elA ? elB : elA
  // play() then immediately pause keeps the partner ready without
  // making any sound — it's already muted at this point.
  partner.play().then(() => {
    try { partner.pause(); partner.currentTime = 0 } catch {}
  }).catch(() => {})
}

function clearPendingPause() {
  if (pendingPauseTimeout !== null) {
    clearTimeout(pendingPauseTimeout)
    pendingPauseTimeout = null
  }
}

/** Ramp the audible level over ms. Uses GainNode scheduling when wired
 *  up (off-main-thread, iOS-safe). Falls back to a rAF audio.volume ramp
 *  before Web Audio is ready (no-op on iOS but works on desktop). */
function ramp(target: number, ms: number, pauseAtEnd = false) {
  if (!elA || !elB) return
  clearPendingPause()
  if (webAudioReady && audioCtx && gainNode) {
    const now = audioCtx.currentTime
    gainNode.gain.cancelScheduledValues(now)
    gainNode.gain.setValueAtTime(gainNode.gain.value, now)
    if (ms <= 0) gainNode.gain.setValueAtTime(target, now)
    else gainNode.gain.linearRampToValueAtTime(target, now + ms / 1000)
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    if (pauseAtEnd && target === 0) {
      pendingPauseTimeout = setTimeout(() => {
        try { elA?.pause() } catch {}
        try { elB?.pause() } catch {}
        pendingPauseTimeout = null
      }, ms + 80)
    }
    return
  }
  // rAF fallback before the user has tapped to unlock Web Audio.
  const a = current ?? elA
  const startVol = a.volume
  const delta = target - startVol
  if (ms <= 0 || Math.abs(delta) < 0.001) {
    try { elA.volume = target; elB.volume = target } catch {}
    if (pauseAtEnd && target === 0) {
      try { elA.pause(); elB.pause() } catch {}
    }
    return
  }
  const startedAt = performance.now()
  const step = () => {
    const t = Math.min(1, (performance.now() - startedAt) / ms)
    const v = Math.max(0, Math.min(1, startVol + delta * t))
    try { elA!.volume = v; elB!.volume = v } catch {}
    if (t >= 1) {
      if (pauseAtEnd && target === 0) {
        try { elA!.pause(); elB!.pause() } catch {}
      }
      return
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export function startFishingMusic(muted: boolean): void {
  const a = ensure()
  if (!a) return
  clearPendingPause()
  if (elA) elA.muted = muted
  if (elB) elB.muted = muted
  if (muted) {
    if (webAudioReady && gainNode && audioCtx) {
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime)
      gainNode.gain.setValueAtTime(1, audioCtx.currentTime)
    } else {
      if (elA) elA.volume = 1
      if (elB) elB.volume = 1
    }
    return
  }
  if (webAudioReady && gainNode && audioCtx) {
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime)
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
  } else {
    if (elA) elA.volume = 0
    if (elB) elB.volume = 0
  }
  a.play().catch(() => {})
  ramp(1, ENTRY_FADE_MS)
}

export function setFishingMusicMuted(muted: boolean): void {
  const a = ensure()
  if (!a) return
  clearPendingPause()
  setupWebAudio()
  primePartner()
  if (elA) elA.muted = muted
  if (elB) elB.muted = muted
  if (muted) return
  if (webAudioReady && gainNode && audioCtx) {
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime)
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
  } else {
    if (elA) elA.volume = 0
    if (elB) elB.volume = 0
  }
  a.play().catch(() => {})
  ramp(1, TOGGLE_FADE_MS)
}

export function fadeOutFishingMusic(ms: number = EXIT_FADE_MS): void {
  if (!elA || !elB) return
  const a = current ?? elA
  if (a.paused || a.muted) {
    try { elA.pause(); elB.pause() } catch {}
    return
  }
  ramp(0, ms, /* pauseAtEnd */ true)
}
