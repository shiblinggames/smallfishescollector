// Module-level audio singleton for the fishing soundtrack.
//
// Architecture:
//   - Two HTML <audio> elements (elA, elB) hold the soundtrack. The
//     elements being "playing" keeps iOS WebKit's media-playback audio
//     session active in PWA standalone mode — pure Web Audio output
//     falls into the silent "ambient" session on iOS, so we MUST have
//     an audio element rolling whenever we want audible playback.
//   - Each element is routed through Web Audio: <audio> →
//     MediaElementSource → per-element GainNode → masterGain → destination.
//     Per-element gain is the trick that gets a gapless loop on every
//     browser:
//       1. Element A plays through gainA=1, gainB=0 (B silent).
//       2. ~200ms before A ends, we play B (with gainB=0 still — silent).
//       3. At the EXACT end time (scheduled via setValueAtTime), gainA
//          ramps to 0 and gainB ramps to 1 simultaneously on the audio
//          thread. Sample-accurate, no perceptible gap.
//       4. A is then reset and paused; B is the new "current".
//     The <audio loop> attribute and the 'ended' event are both too
//     imprecise on mobile (especially iOS WebKit) — pre-rolling +
//     scheduled gain swap is the only reliable path to truly gapless.
//   - masterGain handles overall fade-in / fade-out and the speaker
//     toggle, on top of the per-element gain swap.
//   - SFX (perfect catch, dial loop) play via separate BufferSources
//     routed direct to destination. The presence of the always-playing
//     audio elements keeps the session active so the BufferSources
//     actually output on iOS PWA.

let elA: HTMLAudioElement | null = null
let elB: HTMLAudioElement | null = null
let current: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let gainA: GainNode | null = null
let gainB: GainNode | null = null
let webAudioReady = false
let trackDuration = 0
let lastGainValue = 1
let pendingPauseTimeout: ReturnType<typeof setTimeout> | null = null

// Loop handoff scheduling.
let handoffCoarseTimer: ReturnType<typeof setTimeout> | null = null
let handoffPreRollDone = false
let handoffResetTimer: ReturnType<typeof setTimeout> | null = null
const PRE_ROLL_LEAD_MS = 200
const TRACK_URL = '/fishingsoundtrack.ogg'

// SFX cache.
let perfectSfxBytes: ArrayBuffer | null = null
let perfectSfxBuffer: AudioBuffer | null = null
let perfectSfxPrefetching = false
let castSfxBytes: ArrayBuffer | null = null
let castSfxBuffer: AudioBuffer | null = null
let castSfxPrefetching = false

// Dial loop cache.
let dialBytes: ArrayBuffer | null = null
let dialBuffer: AudioBuffer | null = null
let dialFetching = false
let dialSource: AudioBufferSourceNode | null = null
let dialPendingStart = false

const ENTRY_FADE_MS  = 3000
const EXIT_FADE_MS   = 3000
const TOGGLE_FADE_MS = 400

function makeAudio(): HTMLAudioElement {
  const audio = document.createElement('audio')
  audio.src = TRACK_URL
  audio.preload = 'auto'
  audio.muted = false
  audio.volume = 1
  // No `loop` attribute — loop is driven by manual handoff.
  audio.setAttribute('playsinline', '')
  audio.setAttribute('aria-hidden', 'true')
  audio.style.display = 'none'
  return audio
}

function ensureElements(): void {
  if (typeof document === 'undefined') return
  if (elA && elB) return
  elA = makeAudio()
  elB = makeAudio()
  document.body.appendChild(elA)
  document.body.appendChild(elB)
  current = elA
  // Capture duration when metadata loads so we can schedule handoffs.
  const onMeta = () => {
    if (elA && isFinite(elA.duration) && elA.duration > 0) {
      trackDuration = elA.duration
      if (current && !current.paused) scheduleHandoffChain()
    }
  }
  elA.addEventListener('loadedmetadata', onMeta)
  elB.addEventListener('loadedmetadata', () => {
    if (elB && isFinite(elB.duration) && elB.duration > 0) trackDuration = elB.duration
  })
  // 'ended' as a final safety net in case our scheduled swap somehow misses.
  const onEndedFactory = (just: HTMLAudioElement, partner: HTMLAudioElement) => () => {
    if (current !== just) return // already handed off
    try { just.currentTime = 0 } catch {}
    try { partner.currentTime = 0 } catch {}
    partner.play().catch(() => {})
    current = partner
    instantGainSwap()
    scheduleHandoffChain()
  }
  elA.addEventListener('ended', onEndedFactory(elA, elB))
  elB.addEventListener('ended', onEndedFactory(elB, elA))
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
    const ga = ctx.createGain()
    const gb = ctx.createGain()
    const master = ctx.createGain()
    ga.gain.value = 1  // A starts as current
    gb.gain.value = 0
    master.gain.value = 1
    lastGainValue = 1
    srcA.connect(ga).connect(master)
    srcB.connect(gb).connect(master)
    master.connect(ctx.destination)
    audioCtx = ctx
    gainA = ga
    gainB = gb
    masterGain = master
    webAudioReady = true
    return true
  } catch {
    audioCtx = null
    gainA = gainB = masterGain = null
    webAudioReady = false
    return false
  }
}

function clearHandoff() {
  if (handoffCoarseTimer !== null) { clearTimeout(handoffCoarseTimer); handoffCoarseTimer = null }
  if (handoffResetTimer !== null) { clearTimeout(handoffResetTimer); handoffResetTimer = null }
  handoffPreRollDone = false
}

function instantGainSwap() {
  if (!audioCtx || !gainA || !gainB) return
  const now = audioCtx.currentTime
  const curGain = current === elA ? gainA : gainB
  const otherGain = current === elA ? gainB : gainA
  curGain.gain.cancelScheduledValues(now)
  otherGain.gain.cancelScheduledValues(now)
  curGain.gain.setValueAtTime(1, now)
  otherGain.gain.setValueAtTime(0, now)
}

/** Schedule the next handoff. Computes the precise moment `current` will
 *  end, pre-rolls the partner ~200ms before that, and schedules the gain
 *  swap for the exact moment via setValueAtTime (audio-thread accurate). */
function scheduleHandoffChain() {
  clearHandoff()
  if (!current || !elA || !elB || !audioCtx || !gainA || !gainB) return
  if (current.paused) return
  const dur = current.duration
  if (!isFinite(dur) || dur <= 0) {
    handoffCoarseTimer = setTimeout(scheduleHandoffChain, 100)
    return
  }
  const remainingMs = Math.max(0, (dur - current.currentTime) * 1000)
  if (remainingMs <= PRE_ROLL_LEAD_MS) {
    doPreRollAndSwap(remainingMs)
  } else {
    handoffCoarseTimer = setTimeout(() => {
      handoffCoarseTimer = null
      const remNow = Math.max(0, (dur - current!.currentTime) * 1000)
      doPreRollAndSwap(remNow)
    }, remainingMs - PRE_ROLL_LEAD_MS)
  }
}

function doPreRollAndSwap(remainingMs: number) {
  if (!current || !elA || !elB || !audioCtx || !gainA || !gainB) return
  if (handoffPreRollDone) return
  handoffPreRollDone = true
  const partner = current === elA ? elB : elA
  const curGain = current === elA ? gainA : gainB
  const partnerGain = current === elA ? gainB : gainA
  // Pre-roll partner: start playing while its gain is 0 (silent). When the
  // gain swap fires below, partner is already running so there's no
  // play()-startup latency at the boundary.
  try { partner.currentTime = 0 } catch {}
  partner.play().catch(() => {})
  // Schedule the gain swap exactly at the moment current ends.
  const swapTime = audioCtx.currentTime + remainingMs / 1000
  curGain.gain.cancelScheduledValues(audioCtx.currentTime)
  partnerGain.gain.cancelScheduledValues(audioCtx.currentTime)
  curGain.gain.setValueAtTime(curGain.gain.value, audioCtx.currentTime)
  partnerGain.gain.setValueAtTime(0, audioCtx.currentTime)
  curGain.gain.setValueAtTime(0, swapTime)
  partnerGain.gain.setValueAtTime(1, swapTime)
  // After the swap, promote partner to current and reset the old one.
  const old = current
  handoffResetTimer = setTimeout(() => {
    handoffResetTimer = null
    current = partner
    try { old.pause(); old.currentTime = 0 } catch {}
    handoffPreRollDone = false
    scheduleHandoffChain()
  }, remainingMs + 80)
}

/** iOS unlocks each <audio> element individually — both need their own
 *  play()-during-gesture call to be unlocked. Only runs once per session
 *  so repeated primer gestures don't kick a play()+pause() cycle on the
 *  partner (which churns the audio session). */
let elementsPrimed = false
function primeBothElements(): void {
  if (elementsPrimed) return
  if (!elA || !elB) return
  elementsPrimed = true
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

function rampMaster(fromValue: number, target: number, ms: number, pauseAtEnd = false) {
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
      clearHandoff()
      try { elA?.pause() } catch {}
      try { elB?.pause() } catch {}
      pendingPauseTimeout = null
    }, ms + 80)
  }
}

// ─── SFX prefetch ───────────────────────────────────────────────────────

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

function prefetchCastSfx() {
  if (castSfxBytes || castSfxPrefetching) return
  if (typeof fetch === 'undefined') return
  castSfxPrefetching = true
  fetch('/fishingcast.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { castSfxBytes = b; tryDecodeCastSfx() })
    .catch(() => { castSfxPrefetching = false })
}

function tryDecodeCastSfx() {
  if (castSfxBuffer || !castSfxBytes || !audioCtx) return
  audioCtx.decodeAudioData(castSfxBytes.slice(0))
    .then(buffer => { castSfxBuffer = buffer })
    .catch(() => {})
}

function prefetchDial() {
  if (dialBytes || dialFetching) return
  if (typeof fetch === 'undefined') return
  dialFetching = true
  fetch('/fishingdial.ogg')
    .then(r => r.arrayBuffer())
    .then(b => { dialBytes = b; tryDecodeDial() })
    .catch(() => { dialFetching = false })
}

function tryDecodeDial() {
  if (dialBuffer || !dialBytes || !audioCtx) return
  audioCtx.decodeAudioData(dialBytes.slice(0))
    .then(buffer => {
      dialBuffer = buffer
      if (dialPendingStart) { dialPendingStart = false; startDialLoop(dialPendingRate) }
    })
    .catch(() => {})
}

// ─── Public API ─────────────────────────────────────────────────────────

/** LIGHT path — called by the global gesture primer on every
 *  pointerdown / touchstart. Resumes an EXISTING AudioContext if one is
 *  suspended, and primes audio elements once on the first gesture. Does
 *  NOT trigger any fetches or context creation — so players who never
 *  visit /fishing don't pay the cost of 1.6 MB of OGG download + audio
 *  element setup on every tap in other minigames. */
export function resumeFishingAudioIfReady(): void {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  primeBothElements()
}

/** HEAVY path — called by FishingGame's startFishingMusic /
 *  setFishingMusicMuted when the player actually arrives at /fishing.
 *  Builds the audio elements + Web Audio graph + kicks off the soundtrack
 *  and SFX prefetches. Idempotent on second+ calls. */
export function unlockFishingAudio(): void {
  if (typeof document === 'undefined') return
  ensureElements()
  setupWebAudio()
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  primeBothElements()
  prefetchPerfectSfx()
  tryDecodePerfectSfx()
  prefetchCastSfx()
  tryDecodeCastSfx()
  prefetchDial()
  tryDecodeDial()
}

export function startFishingMusic(muted: boolean): void {
  unlockFishingAudio()
  if (!elA || !elB || !audioCtx || !masterGain) return
  clearPendingPause()
  if (!current) current = elA
  // Make sure current is actively playing; partner stays paused/primed.
  if (current.paused) current.play().catch(() => {})
  scheduleHandoffChain()
  if (muted) {
    rampMaster(0, 0, 0)
  } else {
    rampMaster(0, 1, ENTRY_FADE_MS)
  }
}

export function setFishingMusicMuted(muted: boolean): void {
  unlockFishingAudio()
  if (!elA || !elB || !audioCtx || !masterGain) return
  clearPendingPause()
  if (current && current.paused) current.play().catch(() => {})
  scheduleHandoffChain()
  if (muted) {
    rampMaster(lastGainValue, 0, 0)
  } else {
    rampMaster(0, 1, TOGGLE_FADE_MS)
  }
}

export function fadeOutFishingMusic(ms: number = EXIT_FADE_MS): void {
  if (!elA || !elB || !audioCtx || !masterGain) return
  if (lastGainValue === 0) {
    clearHandoff()
    try { elA.pause(); elB.pause() } catch {}
    return
  }
  rampMaster(lastGainValue, 0, ms, /* pauseAtEnd */ true)
}

// ─── SFX ────────────────────────────────────────────────────────────────

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

/** Cast / Cast Again tap SFX. Direct unity-gain routing through the
 *  ctx.destination — same path as the perfect SFX (without boost). */
export function playCastSfx(): void {
  if (!audioCtx || !castSfxBuffer) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = castSfxBuffer
    source.connect(audioCtx.destination)
    source.start(0)
  } catch {}
}

// Track the most-recently-requested playback rate so the queued-start
// path (when the buffer hasn't decoded yet) uses the right speed.
let dialPendingRate = 1
export function startDialLoop(rate: number = 1): void {
  dialPendingRate = rate
  if (!audioCtx) return
  // If already playing, just adjust the rate live.
  if (dialSource) {
    try { dialSource.playbackRate.setValueAtTime(rate, audioCtx.currentTime) } catch {}
    return
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  if (!dialBuffer) { dialPendingStart = true; return }
  try {
    const source = audioCtx.createBufferSource()
    source.buffer = dialBuffer
    source.loop = true
    source.playbackRate.value = rate
    source.connect(audioCtx.destination)
    source.start(0)
    dialSource = source
  } catch {}
}

export function stopDialLoop(): void {
  dialPendingStart = false
  if (!dialSource) return
  try { dialSource.stop() } catch {}
  try { dialSource.disconnect() } catch {}
  dialSource = null
}
