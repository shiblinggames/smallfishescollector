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
let catchBuffer: AudioBuffer | null = null
let crashBuffer: AudioBuffer | null = null
let catchFetching = false
let crashFetching = false

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

/** Called from TideRunGame mount — kicks off byte prefetch + decode. */
export function prefetchTideRunAudio(): void {
  ensureContext()
  fetchCatch()
  fetchCrash()
  tryDecodeCatch()
  tryDecodeCrash()
}

/** Called by the global GameAudioPrimer on every user gesture. iOS only
 *  honors AudioContext.resume() inside a gesture call stack. Idempotent. */
export function unlockTideRunAudio(): void {
  if (!ensureContext()) return
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  // Re-attempt any deferred decodes now that the context is running.
  tryDecodeCatch()
  tryDecodeCrash()
}

function play(buffer: AudioBuffer | null): void {
  if (!audioCtx || !buffer) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(audioCtx.destination)
    source.start(0)
  } catch {}
}

/** Beacon detected the airborne ship — beam fires up and catches the
 *  player. Plays at the moment detection starts (before the death). */
export function playBeaconCatchSfx(): void { play(catchBuffer) }

/** Boat ran through a grounded beacon and smashed it. Plays at the
 *  exact moment the beacon shatters. */
export function playBeaconCrashSfx(): void { play(crashBuffer) }
