// Module-level audio singleton for the fishing soundtrack.
//
// Architecture:
//   - The track is fetched as bytes, decoded to a Web Audio AudioBuffer,
//     and played via BufferSource with loop=true. That's sample-accurate
//     and truly gapless on every browser — no <audio loop> boundary gap
//     and no dual-element handoff timing tricks.
//   - A single GainNode handles fades, mute toggle, and volume. iOS
//     respects GainNode.gain (unlike HTMLAudioElement.volume) so this
//     works everywhere.
//   - The AudioContext is shared with the perfect-catch SFX. iOS
//     suspends it on tab/route changes; the global FishingAudioPrimer
//     resumes it on every user gesture, so by the time playback is
//     wanted the context is already running.

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let audioBuffer: AudioBuffer | null = null
let bufferSource: AudioBufferSourceNode | null = null
let trackBytes: ArrayBuffer | null = null
let trackFetching = false
let trackPlaying = false
let lastGainValue = 1
let pendingPauseTimeout: ReturnType<typeof setTimeout> | null = null

// SFX cache — short one-shot sounds (perfect catch, etc.).
let perfectSfxBytes: ArrayBuffer | null = null
let perfectSfxBuffer: AudioBuffer | null = null
let perfectSfxPrefetching = false

const ENTRY_FADE_MS  = 3000
const EXIT_FADE_MS   = 3000
const TOGGLE_FADE_MS = 400
const TRACK_URL = '/fishingsoundtrack.ogg'

function ensureContext(): boolean {
  if (audioCtx && masterGain) return true
  if (typeof window === 'undefined') return false
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.gain.value = 1
    lastGainValue = 1
    gain.connect(ctx.destination)
    audioCtx = ctx
    masterGain = gain
    return true
  } catch {
    return false
  }
}

function prefetchTrack() {
  if (trackBytes || trackFetching) return
  if (typeof fetch === 'undefined') return
  trackFetching = true
  fetch(TRACK_URL)
    .then(r => r.arrayBuffer())
    .then(b => { trackBytes = b; tryDecodeTrack() })
    .catch(() => { trackFetching = false })
}

function tryDecodeTrack() {
  if (audioBuffer || !trackBytes || !audioCtx) return
  audioCtx.decodeAudioData(trackBytes.slice(0))
    .then(buffer => { audioBuffer = buffer })
    .catch(() => {})
}

function prefetchPerfectSfx() {
  if (perfectSfxBytes || perfectSfxPrefetching) return
  if (typeof fetch === 'undefined') return
  perfectSfxPrefetching = true
  fetch('/fishingperfect.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { perfectSfxBytes = b; tryDecodePerfectSfx() })
    .catch(() => { perfectSfxPrefetching = false })
}

function tryDecodePerfectSfx() {
  if (perfectSfxBuffer || !perfectSfxBytes || !audioCtx) return
  audioCtx.decodeAudioData(perfectSfxBytes.slice(0))
    .then(buffer => { perfectSfxBuffer = buffer })
    .catch(() => {})
}

function startSource() {
  if (!audioCtx || !masterGain || !audioBuffer) return
  if (bufferSource) return // already playing
  const source = audioCtx.createBufferSource()
  source.buffer = audioBuffer
  source.loop = true
  source.connect(masterGain)
  try {
    source.start(0)
    bufferSource = source
    trackPlaying = true
  } catch {
    // start() can throw if called more than once on the same source —
    // shouldn't happen with our flow but be defensive.
  }
}

function stopSource() {
  if (!bufferSource) return
  try { bufferSource.stop() } catch {}
  try { bufferSource.disconnect() } catch {}
  bufferSource = null
  trackPlaying = false
}

function clearPendingPause() {
  if (pendingPauseTimeout !== null) {
    clearTimeout(pendingPauseTimeout)
    pendingPauseTimeout = null
  }
}

/** Set gain to fromValue, then ramp to target over ms. Uses both the
 *  direct .value setter and setValueAtTime to defeat Safari's stale
 *  gain.value read-back. */
function rampGain(fromValue: number, target: number, ms: number, pauseAtEnd = false) {
  clearPendingPause()
  if (!audioCtx || !masterGain) return
  const now = audioCtx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.value = fromValue
  masterGain.gain.setValueAtTime(fromValue, now)
  if (ms <= 0) {
    masterGain.gain.setValueAtTime(target, now)
  } else {
    masterGain.gain.linearRampToValueAtTime(target, now + ms / 1000)
  }
  lastGainValue = target
  if (pauseAtEnd && target === 0) {
    pendingPauseTimeout = setTimeout(() => {
      stopSource()
      pendingPauseTimeout = null
    }, ms + 80)
  }
}

/** Public: called from a global gesture listener at the app shell on every
 *  pointerdown / touchstart. Lazily builds the audio graph, kicks off the
 *  track + SFX prefetch, and resumes the AudioContext while we still have
 *  the gesture's user-activation. Idempotent and cheap to call repeatedly. */
export function unlockFishingAudio(): void {
  if (typeof document === 'undefined') return
  if (!ensureContext()) return
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  prefetchTrack()
  tryDecodeTrack()
  prefetchPerfectSfx()
  tryDecodePerfectSfx()
}

/** Called when /fishing mounts. Always fades in (when not muted), waiting
 *  for the AudioBuffer to be ready if needed. */
export function startFishingMusic(muted: boolean): void {
  unlockFishingAudio()
  if (!audioCtx || !masterGain) return
  clearPendingPause()
  // Ensure source is playing so the fade applies as soon as decode finishes.
  const fade = () => {
    startSource()
    if (muted) rampGain(0, 0, 0)
    else rampGain(0, 1, ENTRY_FADE_MS)
  }
  if (audioBuffer) {
    fade()
  } else {
    // Buffer not ready — pin gain to 0 and start once decode resolves. We
    // poll instead of using a one-shot promise listener because decode may
    // already be in flight from a prior unlockFishingAudio call.
    rampGain(0, 0, 0)
    const wait = () => {
      if (audioBuffer) { fade(); return }
      setTimeout(wait, 50)
    }
    wait()
  }
}

/** Speaker icon toggle. */
export function setFishingMusicMuted(muted: boolean): void {
  unlockFishingAudio()
  if (!audioCtx || !masterGain) return
  clearPendingPause()
  if (!trackPlaying && audioBuffer) startSource()
  if (muted) {
    rampGain(lastGainValue, 0, 0)
  } else {
    if (!trackPlaying) {
      // Buffer not yet decoded — schedule the fade for when it is.
      rampGain(0, 0, 0)
      const wait = () => {
        if (audioBuffer) {
          startSource()
          rampGain(0, 1, TOGGLE_FADE_MS)
          return
        }
        setTimeout(wait, 50)
      }
      wait()
      return
    }
    rampGain(0, 1, TOGGLE_FADE_MS)
  }
}

/** Called when /fishing unmounts. Rolls the gain down then stops the
 *  BufferSource. Already-silent state stops immediately. */
export function fadeOutFishingMusic(ms: number = EXIT_FADE_MS): void {
  if (!audioCtx || !masterGain) return
  if (!trackPlaying) {
    stopSource()
    return
  }
  rampGain(lastGainValue, 0, ms, /* pauseAtEnd */ true)
}

/** Fire-and-forget one-shot: perfect-catch SFX. */
const PERFECT_SFX_GAIN = 1.8
export function playPerfectSfx(): void {
  if (!audioCtx || !perfectSfxBuffer) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = perfectSfxBuffer
    const boost = audioCtx.createGain()
    boost.gain.value = PERFECT_SFX_GAIN
    source.connect(boost).connect(audioCtx.destination)
    source.start(0)
  } catch {}
}
