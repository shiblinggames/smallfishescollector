// One-shot SFX for the Tide Run minigame.
//
// SFX themselves are plain Web Audio BufferSources (short MP3s decoded
// once, played via a fresh source each fire, routed direct to the
// destination).
//
// THE iOS PWA GOTCHA: pure-Web-Audio output drops into the silent
// "ambient" audio session on iOS PWA standalone mode. Beacons + splash
// would be completely silent there. Keeping an HTML <audio> element
// playing keeps the "media playback" session alive, and any Web Audio
// output through the same AudioContext then routes audibly.
//
// So we have a tiny silent.ogg (1s of literal zero samples) on loop,
// muted to avoid any chance of audible interference, started on the
// first user gesture inside the gesture call stack.

let audioCtx: AudioContext | null = null
let catchBytes: ArrayBuffer | null = null
let crashBytes: ArrayBuffer | null = null
let splashBytes: ArrayBuffer | null = null
let deathBytes: ArrayBuffer | null = null
let catchBuffer: AudioBuffer | null = null
let crashBuffer: AudioBuffer | null = null
let splashBuffer: AudioBuffer | null = null
let deathBuffer: AudioBuffer | null = null
let catchFetching = false
let crashFetching = false
let splashFetching = false
let deathFetching = false
let sessionKeeper: HTMLAudioElement | null = null
let sessionKeeperStarted = false
let sessionKeeperRouted = false
let muted: boolean = (() => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem('tideRunAudioMuted') === 'true'
})()

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

function ensureSessionKeeper(): void {
  if (sessionKeeper) return
  if (typeof document === 'undefined') return
  const a = document.createElement('audio')
  a.src = '/silent.ogg'
  a.loop = true
  a.preload = 'auto'
  // Intentionally UNMUTED: the asset is literal zero samples so it's
  // inaudible anyway, but iOS classifies muted elements differently for
  // audio-session purposes — keeping it unmuted is what gets the
  // "media playback" session lit for everything else in the context.
  a.muted = false
  a.volume = 1
  a.setAttribute('playsinline', '')
  a.setAttribute('aria-hidden', 'true')
  a.style.display = 'none'
  document.body.appendChild(a)
  sessionKeeper = a
}

function startSessionKeeper(): void {
  if (sessionKeeperStarted) return
  if (!sessionKeeper) return
  sessionKeeper.play().then(() => { sessionKeeperStarted = true }).catch(() => {})
}

/** Wire the silent keeper into the AudioContext via MediaElementSource so
 *  it lives on the same Web Audio graph as the SFX BufferSources. This
 *  mirrors what fishingMusic does for its soundtrack — the same pattern
 *  is what unlocks audible Web Audio output on iOS PWA. */
function routeSessionKeeper(): void {
  if (sessionKeeperRouted) return
  if (!audioCtx || !sessionKeeper) return
  try {
    const src = audioCtx.createMediaElementSource(sessionKeeper)
    src.connect(audioCtx.destination)
    sessionKeeperRouted = true
  } catch {
    // Most likely cause: createMediaElementSource called twice on the
    // same element. Either way, mark routed so we don't keep retrying.
    sessionKeeperRouted = true
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

function tryDecodeDeath() {
  if (deathBuffer || !deathBytes || !audioCtx) return
  audioCtx.decodeAudioData(deathBytes.slice(0))
    .then(buffer => { deathBuffer = buffer })
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

function fetchDeath() {
  if (deathBytes || deathFetching || typeof fetch === 'undefined') return
  deathFetching = true
  fetch('/tiderun_crash.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { deathBytes = b; tryDecodeDeath() })
    .catch(() => { deathFetching = false })
}

/** Called from TideRunGame mount — only kicks off the byte fetches.
 *  Doesn't create the AudioContext: iOS may permanently sandbox audio
 *  output from a context created outside a user-gesture call stack. The
 *  primer creates the context on the first gesture (light work — just
 *  `new AudioContext()` plus a resume), so playback is always sourced
 *  from a context that was born inside a gesture. */
export function prefetchTideRunAudio(): void {
  ensureSessionKeeper()
  fetchCatch()
  fetchCrash()
  fetchSplash()
  fetchDeath()
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
  // Start the silent loop inside the gesture so iOS allows it. Route it
  // through the AudioContext via MediaElementSource so the keeper lives
  // on the SAME Web Audio graph as the SFX — that's the pattern fishing
  // uses to get audible output on iOS PWA.
  ensureSessionKeeper()
  routeSessionKeeper()
  startSessionKeeper()
  tryDecodeCatch()
  tryDecodeCrash()
  tryDecodeSplash()
  tryDecodeDeath()
}

function play(buffer: AudioBuffer | null): void {
  if (muted) return
  if (!audioCtx || !buffer) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(audioCtx.destination)
    source.start(0)
  } catch {}
}

/** Returns whether tide-run SFX are currently muted. */
export function getTideRunMuted(): boolean { return muted }

/** Toggle tide-run SFX on/off. Persists to localStorage so the choice
 *  survives reloads. */
export function setTideRunMuted(next: boolean): void {
  muted = next
  try { window.localStorage.setItem('tideRunAudioMuted', String(next)) } catch {}
}

/** Beacon detected the airborne ship — beam fires up and catches the
 *  player. Plays at the moment detection starts (before the death). */
export function playBeaconCatchSfx(): void { play(catchBuffer) }

/** Boat ran through a grounded beacon and smashed it. Plays at the
 *  exact moment the beacon shatters. */
export function playBeaconCrashSfx(): void { play(crashBuffer) }

/** Boat touched down on the water after a jump. The volume is baked into
 *  the asset itself (-14 dB vs the originals), not applied via a Web Audio
 *  GainNode — on iOS PWA, routing playback through a very-low-gain node
 *  appeared to demote the whole AudioContext's session to silent ambient
 *  mode and killed all subsequent SFX. */
export function playSplashSfx(): void { play(splashBuffer) }

/** Boat crashed into a non-beacon obstacle (rock, shoal) and the player
 *  lost the run. */
export function playCrashSfx(): void { play(deathBuffer) }
