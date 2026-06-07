// One-shot SFX for the Blackjack minigame.
//
// All sounds are synthesized inline via Web Audio (oscillators + filters
// + gain envelopes) — no MP3 sourcing required, no fetch latency, fires
// at zero ms. Lower fidelity than samples but enough character for a
// tavern minigame.
//
// Routes through the same iOS-PWA-safe pattern as tideRunAudio: a
// looping silent.ogg <audio> element keeps the "media playback" audio
// session lit on iOS standalone PWAs, MediaElementSource bridges it
// into the AudioContext so any synth output through the same context
// is audible. Without this scaffolding, iOS PWA mode silently drops
// pure-Web-Audio output into the "ambient" session and the player
// hears nothing.

let audioCtx: AudioContext | null = null
let sessionKeeper: HTMLAudioElement | null = null
let sessionKeeperStarted = false
let sessionKeeperRouted = false
let masterGain: GainNode | null = null

let muted: boolean = (() => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem('blackjackAudioMuted') === 'true'
})()

export function isBlackjackAudioMuted(): boolean { return muted }
export function setBlackjackAudioMuted(m: boolean): void {
  muted = m
  try { window.localStorage.setItem('blackjackAudioMuted', m ? 'true' : 'false') } catch { /* SSR */ }
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(m ? 0 : 1, audioCtx.currentTime)
  }
}

function ensureContext(): boolean {
  if (audioCtx) return true
  if (typeof window === 'undefined') return false
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    audioCtx = new Ctx()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = muted ? 0 : 1
    masterGain.connect(audioCtx.destination)
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
  // Unmuted on purpose — silent.ogg is literal zero samples, so it's
  // inaudible regardless. iOS classifies muted elements differently for
  // audio-session purposes; unmuted is what lights the right session.
  a.muted = false
  a.volume = 1
  a.setAttribute('playsinline', '')
  a.setAttribute('aria-hidden', 'true')
  a.style.display = 'none'
  document.body.appendChild(a)
  sessionKeeper = a
}

function startSessionKeeper(): void {
  if (sessionKeeperStarted || !sessionKeeper) return
  sessionKeeper.play().then(() => { sessionKeeperStarted = true }).catch(() => { /* gesture not yet granted */ })
}

function routeSessionKeeperIntoContext(): void {
  if (sessionKeeperRouted || !sessionKeeper || !audioCtx) return
  try {
    const src = audioCtx.createMediaElementSource(sessionKeeper)
    // Connect through a gain of 0 so the silent.ogg samples don't even
    // theoretically contribute to output, while still routing through
    // the context for the session-lighting trick.
    const muteGain = audioCtx.createGain()
    muteGain.gain.value = 0
    src.connect(muteGain).connect(audioCtx.destination)
    sessionKeeperRouted = true
  } catch {
    /* Already created a MediaElementSource — only allowed once per element. */
  }
}

/** Call from the FIRST user gesture (Deal button onPointerDown) to
 *  initialize the audio session. Idempotent after the first call. */
export function primeBlackjackAudio(): void {
  if (!ensureContext()) return
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  ensureSessionKeeper()
  startSessionKeeper()
  routeSessionKeeperIntoContext()
}

// ── Sound generators ───────────────────────────────────────────────────────

function makeNoise(duration: number): AudioBuffer | null {
  if (!audioCtx) return null
  const sr = audioCtx.sampleRate
  const len = Math.max(1, Math.floor(sr * duration))
  const buf = audioCtx.createBuffer(1, len, sr)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function envelope(node: GainNode, t: number, attack: number, peak: number, decay: number) {
  const g = node.gain
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(peak, t + attack)
  g.exponentialRampToValueAtTime(0.001, t + attack + decay)
}

/** Brief papery slide — fires for every card deal/hit. Low volume so
 *  4-6 in quick succession during a multi-card deal don't fatigue. */
function playCardSlide() {
  if (!audioCtx || !masterGain) return
  const t = audioCtx.currentTime
  const buf = makeNoise(0.09)
  if (!buf) return
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const hp = audioCtx.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 1800
  const lp = audioCtx.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 5000
  const g = audioCtx.createGain()
  envelope(g, t, 0.005, 0.10, 0.085)
  src.connect(hp).connect(lp).connect(g).connect(masterGain)
  src.start(t)
}

/** Short metallic-ish ding for bet actions (Deal, Double, Split). Two
 *  sine partials make it less like a pure beep. */
function playChipClink() {
  if (!audioCtx || !masterGain) return
  const t = audioCtx.currentTime
  const o1 = audioCtx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 2200
  const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 3300
  const g = audioCtx.createGain()
  envelope(g, t, 0.002, 0.18, 0.18)
  o1.connect(g); o2.connect(g); g.connect(masterGain)
  o1.start(t); o2.start(t)
  o1.stop(t + 0.25); o2.stop(t + 0.25)
}

/** Whoosh that sweeps a filter upward — fires when the hole card flips.
 *  Same broad shape as a card slide but longer + more pronounced. */
function playHoleFlip() {
  if (!audioCtx || !masterGain) return
  const t = audioCtx.currentTime
  const buf = makeNoise(0.32)
  if (!buf) return
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const lp = audioCtx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(300, t)
  lp.frequency.exponentialRampToValueAtTime(2400, t + 0.28)
  const g = audioCtx.createGain()
  envelope(g, t, 0.02, 0.22, 0.3)
  src.connect(lp).connect(g).connect(masterGain)
  src.start(t)
}

/** Low-frequency thud — player bust. */
function playBust() {
  if (!audioCtx || !masterGain) return
  const t = audioCtx.currentTime
  const o = audioCtx.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(120, t)
  o.frequency.exponentialRampToValueAtTime(55, t + 0.2)
  const g = audioCtx.createGain()
  envelope(g, t, 0.002, 0.32, 0.24)
  o.connect(g).connect(masterGain)
  o.start(t); o.stop(t + 0.3)
}

/** Helper: schedule one sine-pluck note at time T. */
function pluck(freq: number, t: number, dur: number, vol: number) {
  if (!audioCtx || !masterGain) return
  const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = freq
  // Subtle detuned octave layer for warmth.
  const o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq / 2
  const g = audioCtx.createGain()
  envelope(g, t, 0.003, vol, dur)
  o.connect(g); o2.connect(g); g.connect(masterGain)
  o.start(t); o2.start(t)
  o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05)
}

/** Two-note ascending chime — regular win. */
function playWin() {
  if (!audioCtx) return
  const t = audioCtx.currentTime
  pluck(523.25, t,        0.22, 0.20)  // C5
  pluck(659.25, t + 0.10, 0.30, 0.20)  // E5
}

/** Four-note arpeggio + a sparkle — natural Blackjack. The rare
 *  payoff event; can be more dramatic. */
function playBlackjack() {
  if (!audioCtx) return
  const t = audioCtx.currentTime
  pluck(523.25, t,        0.18, 0.22)  // C5
  pluck(659.25, t + 0.08, 0.18, 0.22)  // E5
  pluck(783.99, t + 0.16, 0.22, 0.22)  // G5
  pluck(1046.5, t + 0.26, 0.45, 0.24)  // C6
  // Sparkle: brief high noise layer above the arpeggio.
  if (!masterGain) return
  const buf = makeNoise(0.45)
  if (!buf) return
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000
  const g = audioCtx.createGain()
  envelope(g, t + 0.1, 0.05, 0.06, 0.4)
  src.connect(hp).connect(g).connect(masterGain)
  src.start(t + 0.1)
}

/** Single soft tick — pushes. Optional; can stay silent if too noisy. */
function playPush() {
  if (!audioCtx || !masterGain) return
  const t = audioCtx.currentTime
  const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 880
  const g = audioCtx.createGain()
  envelope(g, t, 0.003, 0.12, 0.08)
  o.connect(g).connect(masterGain)
  o.start(t); o.stop(t + 0.12)
}

export type BjSfx = 'cardSlide' | 'chipClink' | 'holeFlip' | 'bust' | 'win' | 'blackjack' | 'push'

export function playBjSfx(event: BjSfx): void {
  if (muted) return
  if (!audioCtx) return
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  switch (event) {
    case 'cardSlide': playCardSlide(); break
    case 'chipClink': playChipClink(); break
    case 'holeFlip':  playHoleFlip(); break
    case 'bust':      playBust(); break
    case 'win':       playWin(); break
    case 'blackjack': playBlackjack(); break
    case 'push':      playPush(); break
  }
}
