// Module-level audio singleton for the fishing soundtrack.
//
// Architecture (overview):
//   - Two HTML <audio> elements are appended to <body> outside React's
//     tree. They alternate via the `ended` event for a gapless loop, since
//     <audio loop> on every browser inserts a tiny pause at the boundary.
//   - Both elements route through Web Audio MediaElementSource + a shared
//     GainNode so we can ramp the level on the audio thread. iOS treats
//     HTMLAudioElement.volume as read-only, so GainNode is the only path
//     to real fade control there.
//   - The hard problem: iOS suspends the AudioContext when the page is
//     hidden or backgrounded, and ctx.resume() outside a user-gesture
//     call stack is silently rejected. To keep playback responsive, a
//     global pointerdown/touchstart listener at the app shell calls
//     unlockFishingAudio() on every interaction — that resumes the ctx
//     synchronously inside the gesture, so by the time FishingGame mounts
//     and asks for a fade-in, the ctx is already running.

let elA: HTMLAudioElement | null = null
let elB: HTMLAudioElement | null = null
let current: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let gainNode: GainNode | null = null
let webAudioReady = false
let pendingPauseTimeout: ReturnType<typeof setTimeout> | null = null
let lastGainValue = 1

// SFX cache — short one-shot sounds (perfect catch, etc.). Bytes are
// fetched on first interaction so the buffer is decoded and ready well
// before the player triggers the gameplay event that uses them.
let perfectSfxBytes: ArrayBuffer | null = null
let perfectSfxBuffer: AudioBuffer | null = null
let perfectSfxPrefetching = false

const ENTRY_FADE_MS  = 3000
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
  audio.preload = 'auto'
  audio.muted = true
  audio.volume = 1
  audio.setAttribute('playsinline', '')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.display = 'none'
  return audio
}

function attachHandoff(just: HTMLAudioElement, partner: HTMLAudioElement) {
  just.addEventListener('ended', () => {
    try { just.currentTime = 0 } catch {}
    try { partner.currentTime = 0 } catch {}
    partner.play().catch(() => {})
    current = partner
  })
}

function ensureElements(): void {
  if (typeof document === 'undefined') return
  if (elA && elB) return
  const src = pickSrc()
  const a = makeAudio(src)
  const b = makeAudio(src)
  document.body.appendChild(a)
  document.body.appendChild(b)
  elA = a
  elB = b
  current = a
  attachHandoff(a, b)
  attachHandoff(b, a)
  // Muted autoplay so the element is "live" before any unmute. Safe on
  // all browsers since muted autoplay is allowed.
  a.play().catch(() => {})
}

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
    lastGainValue = 1
    srcA.connect(gain)
    srcB.connect(gain)
    gain.connect(ctx.destination)
    audioCtx = ctx
    gainNode = gain
    webAudioReady = true
    return true
  } catch {
    audioCtx = null
    gainNode = null
    webAudioReady = false
    return false
  }
}

/** iOS unlocks each <audio> element individually — the partner needs its
 *  own play()-during-gesture call before it can take over in a handoff. */
function primePartner(): void {
  if (!elA || !elB) return
  const partner = current === elA ? elB : elA
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

/** Ramp gain from a known start to target. Tracks the last applied value
 *  via lastGainValue so we never rely on the gain.value read-back (Safari
 *  returns stale values right after setValueAtTime). Returns true if the
 *  ramp was scheduled on the Web Audio graph. */
function rampGain(fromValue: number, target: number, ms: number, pauseAtEnd = false): boolean {
  clearPendingPause()
  if (!webAudioReady || !audioCtx || !gainNode) return false
  const now = audioCtx.currentTime
  gainNode.gain.cancelScheduledValues(now)
  // Set via both direct property AND setValueAtTime to defeat the Safari
  // read-back quirk and to give the ramp a deterministic starting point.
  gainNode.gain.value = fromValue
  gainNode.gain.setValueAtTime(fromValue, now)
  if (ms <= 0) {
    gainNode.gain.setValueAtTime(target, now)
  } else {
    gainNode.gain.linearRampToValueAtTime(target, now + ms / 1000)
  }
  lastGainValue = target
  if (pauseAtEnd && target === 0) {
    pendingPauseTimeout = setTimeout(() => {
      try { elA?.pause() } catch {}
      try { elB?.pause() } catch {}
      pendingPauseTimeout = null
    }, ms + 80)
  }
  return true
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
  // slice(0) — decodeAudioData detaches the ArrayBuffer on success; copy
  // so we can re-decode if a future context replaces this one.
  audioCtx.decodeAudioData(perfectSfxBytes.slice(0))
    .then(buffer => { perfectSfxBuffer = buffer })
    .catch(() => {})
}

/** Public: called from a global gesture listener at the app shell on every
 *  pointerdown / touchstart. Lazily builds the audio graph on the first
 *  call and (crucially) resumes the AudioContext while we still have the
 *  gesture's user-activation, so iOS lets it advance. Idempotent and very
 *  cheap to call repeatedly. */
export function unlockFishingAudio(): void {
  if (typeof document === 'undefined') return
  ensureElements()
  setupWebAudio()
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  primePartner()
  prefetchPerfectSfx()
  tryDecodePerfectSfx()
}

/** Fire-and-forget one-shot: perfect-catch SFX. Plays as close to "now"
 *  as the audio thread allows — Web Audio BufferSource.start(0) is
 *  sample-accurate, so latency from this call to first sample is well
 *  under one frame. Silent no-op if the buffer hasn't loaded yet.
 *  Boosted ~1.8x via a dedicated GainNode so the chime cuts through the
 *  soundtrack without needing to re-encode the asset. */
const PERFECT_SFX_GAIN = 1.8
export function playPerfectSfx(): void {
  if (!audioCtx || !perfectSfxBuffer) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = perfectSfxBuffer
    const boost = audioCtx.createGain()
    boost.gain.value = PERFECT_SFX_GAIN
    // Route through its own GainNode straight to destination — independent
    // of the music's GainNode so muting/fading the soundtrack doesn't
    // affect the chime.
    source.connect(boost).connect(audioCtx.destination)
    source.start(0)
  } catch {
    // BufferSource.start can throw if called on a stale source; ignore.
  }
}

/** Called when /fishing mounts. Always fades in from 0 to 1 (when not
 *  muted) so returning to fishing eases the music back regardless of
 *  whether it's the first visit or a re-visit. */
export function startFishingMusic(muted: boolean): void {
  unlockFishingAudio()
  if (!elA || !elB) return
  clearPendingPause()
  elA.muted = muted
  elB.muted = muted
  const a = current ?? elA
  a.play().catch(() => {})
  if (muted) {
    rampGain(1, 1, 0)
    return
  }
  rampGain(0, 1, ENTRY_FADE_MS)
}

/** Speaker icon toggle. Called inside the React onClick so the gesture
 *  call stack is fresh — unlockFishingAudio also runs the ctx.resume. */
export function setFishingMusicMuted(muted: boolean): void {
  unlockFishingAudio()
  if (!elA || !elB) return
  clearPendingPause()
  elA.muted = muted
  elB.muted = muted
  if (muted) return
  const a = current ?? elA
  a.play().catch(() => {})
  rampGain(0, 1, TOGGLE_FADE_MS)
}

/** Called when /fishing unmounts. Rolls the gain down then pauses both
 *  elements. Already-paused/silent state is a no-op. */
export function fadeOutFishingMusic(ms: number = EXIT_FADE_MS): void {
  if (!elA || !elB) return
  const a = current ?? elA
  if (a.paused) return
  if (a.muted) {
    try { elA.pause(); elB.pause() } catch {}
    return
  }
  // Start from the last applied gain value we know about (avoids the
  // Safari read-back quirk). If Web Audio isn't ready, just pause —
  // there's nothing to fade reliably.
  if (!rampGain(lastGainValue, 0, ms, true)) {
    try { elA.pause(); elB.pause() } catch {}
  }
}
