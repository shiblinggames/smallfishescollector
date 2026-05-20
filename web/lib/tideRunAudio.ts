// One-shot SFX for the Tide Run minigame. Same pattern as the fishing
// SFX path: short MP3s fetched once, decoded into AudioBuffers, played
// via a fresh BufferSource each fire. Routed direct to the destination.
//
// Pure Web Audio (no <audio> element) is fine here because Tide Run is
// SFX-only — there's no background music that would fall into iOS's
// silent ambient session. Brief one-shots through BufferSource output
// correctly on iOS PWA once the AudioContext has been resumed inside a
// user gesture (the global app-shell primer handles that).

let audioCtx: AudioContext | null = null
let catchBytes: ArrayBuffer | null = null
let crashBytes: ArrayBuffer | null = null
let splashBytes: ArrayBuffer | null = null
let catchBuffer: AudioBuffer | null = null
let crashBuffer: AudioBuffer | null = null
let splashBuffer: AudioBuffer | null = null
let catchFetching = false
let crashFetching = false
let splashFetching = false

function ensureContext(): boolean {
  if (audioCtx) return true
  if (typeof window === 'undefined') return false
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    audioCtx = new Ctx()
    return true
  } catch {
    return false
  }
}

function tryDecodeCatch() {
  if (catchBuffer || !catchBytes || !audioCtx) return
  audioCtx.decodeAudioData(catchBytes.slice(0))
    .then(buffer => { catchBuffer = buffer })
    .catch(() => {})
}

function tryDecodeCrash() {
  if (crashBuffer || !crashBytes || !audioCtx) return
  audioCtx.decodeAudioData(crashBytes.slice(0))
    .then(buffer => { crashBuffer = buffer })
    .catch(() => {})
}

function tryDecodeSplash() {
  if (splashBuffer || !splashBytes || !audioCtx) return
  audioCtx.decodeAudioData(splashBytes.slice(0))
    .then(buffer => { splashBuffer = buffer })
    .catch(() => {})
}

function fetchCatch() {
  if (catchBytes || catchFetching || typeof fetch === 'undefined') return
  catchFetching = true
  fetch('/tiderun_beaconcatch.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { catchBytes = b; tryDecodeCatch() })
    .catch(() => { catchFetching = false })
}

function fetchCrash() {
  if (crashBytes || crashFetching || typeof fetch === 'undefined') return
  crashFetching = true
  fetch('/tiderun_beaconcrash.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { crashBytes = b; tryDecodeCrash() })
    .catch(() => { crashFetching = false })
}

function fetchSplash() {
  if (splashBytes || splashFetching || typeof fetch === 'undefined') return
  splashFetching = true
  fetch('/tiderun_splash.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { splashBytes = b; tryDecodeSplash() })
    .catch(() => { splashFetching = false })
}

/** Called from TideRunGame mount — only kicks off the byte fetches.
 *  Doesn't create the AudioContext: iOS may permanently sandbox audio
 *  output from a context created outside a user-gesture call stack. The
 *  primer creates the context on the first gesture (light work — just
 *  `new AudioContext()` plus a resume), so playback is always sourced
 *  from a context that was born inside a gesture. */
export function prefetchTideRunAudio(): void {
  fetchCatch()
  fetchCrash()
  fetchSplash()
}

/** Called by the global GameAudioPrimer on every user gesture. iOS needs
 *  the AudioContext to be both created AND resumed inside a gesture
 *  call stack — so we create it here (lazily) if it doesn't exist yet.
 *  Idempotent: after the first gesture, subsequent calls just ensure
 *  the ctx is running. Tide-run's ctx work is tiny — only the fishing
 *  audio's heavy init (audio elements + 1.6 MB OGG fetch) is gated
 *  separately on a "wanted" path. */
export function unlockTideRunAudio(): void {
  if (!ensureContext()) return
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  tryDecodeCatch()
  tryDecodeCrash()
  tryDecodeSplash()
}

function play(buffer: AudioBuffer | null, gain: number = 1): void {
  if (!audioCtx || !buffer) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    if (gain !== 1) {
      const g = audioCtx.createGain()
      g.gain.value = gain
      source.connect(g).connect(audioCtx.destination)
    } else {
      source.connect(audioCtx.destination)
    }
    source.start(0)
  } catch {}
}

/** Beacon detected the airborne ship — beam fires up and catches the
 *  player. Plays at the moment detection starts (before the death). */
export function playBeaconCatchSfx(): void { play(catchBuffer) }

/** Boat ran through a grounded beacon and smashed it. Plays at the
 *  exact moment the beacon shatters. */
export function playBeaconCrashSfx(): void { play(crashBuffer) }

/** Boat touched down on the water after a jump.
 *  intensity: 0–1 scale — small hops are nearly silent, max jumps land
 *  with a soft plop. Tuned to be subtle ambient feedback, not a hit. */
export function playSplashSfx(intensity: number = 1): void {
  const t = Math.max(0, Math.min(1, intensity))
  // Very quiet floor + low ceiling so even max-height jumps stay
  // subtle next to the rest of the game's audio.
  const gain = 0.03 + t * 0.22
  play(splashBuffer, gain)
}
