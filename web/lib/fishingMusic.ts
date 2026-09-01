import type { SeaPhase } from './seaClock'

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

import { getLetOtherAudioPlay } from './audioSession'

let elA: HTMLAudioElement | null = null
let elB: HTMLAudioElement | null = null
let current: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null   // music volume (the <audio> elements)
let sfxGain: GainNode | null = null      // SFX volume (chime/cast/dial) — independent
let gainA: GainNode | null = null
let gainB: GainNode | null = null
// MediaElementSources kept on hand so we can disconnect them at teardown.
// Each source is permanently bound to the audio element passed to
// createMediaElementSource; once that element is destroyed we MUST drop
// the source too — otherwise on remount the Web Audio graph is still
// wired to the OLD (destroyed) elements while the NEW elements emit
// their audio directly to the system bus, bypassing all of our gains.
// That bypass is what produced the "delay/reverb on shallows" bug:
// during the loop pre-roll both new elements played the same track in
// parallel because the gainA→gainB swap had no effect on them.
let srcA: MediaElementAudioSourceNode | null = null
let srcB: MediaElementAudioSourceNode | null = null
let webAudioReady = false
let trackDuration = 0
let lastGainValue = 1
let pendingPauseTimeout: ReturnType<typeof setTimeout> | null = null
let sfxMuted: boolean = (() => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem('fishingSfxMuted') === 'true'
})()

// Loop handoff scheduling.
let handoffCoarseTimer: ReturnType<typeof setTimeout> | null = null
let handoffPreRollDone = false
let handoffResetTimer: ReturnType<typeof setTimeout> | null = null
const PRE_ROLL_LEAD_MS = 200
// The first track written, back when Shallows was the only fishing zone and
// this was the whole soundtrack. It is the bright one, so it is the day.
const DEFAULT_TRACK = '/fishingsoundtrack.ogg'

/**
 * ── THE SOUNDTRACK FOLLOWS THE LIGHT, NOT THE WATER ─────────────────────────
 *
 * These three were written as per-ZONE tracks and swapped on the band the boat
 * was in. That is the wrong axis for the chart, for a reason that only shows up
 * once the zones are somewhere you SAIL rather than somewhere you pick off a
 * list: bands are a few hundred pixels apart out here, so an ordinary run of
 * fishing crosses them constantly and the music was re-cueing every time. A
 * soundtrack that restarts whenever you drift over a line is not a soundtrack,
 * it is a stinger, and it made the sea feel chopped up rather than scored.
 *
 * The day/night cycle is the axis that was always right for this. It turns four
 * times in forty-eight minutes on a clock everybody shares, it is already what
 * the water, the light and the traders answer to, and a piece of music has room
 * to actually play before anything asks it to change.
 *
 * DUSK AND DAWN SHARE ONE. They are the same geometry running opposite ways —
 * seaClock says so where warmth is defined — and no listener is going to hear a
 * difference the light is already telling them.
 */
const PHASE_TRACKS: Record<SeaPhase, string> = {
  day:   DEFAULT_TRACK,
  dusk:  '/fishingsoundtrackopen.ogg',
  night: '/fishingsoundtrackdeep.ogg',
  dawn:  '/fishingsoundtrackopen.ogg',
}

/** Resolve the soundtrack URL for a phase of the sea's day. */
export function fishingTrackForPhase(phase: SeaPhase): string {
  return PHASE_TRACKS[phase] ?? DEFAULT_TRACK
}

// Which track the <audio> elements are currently bound to. makeAudio() reads
// this so the elements are created on the right track; setFishingTrack swaps it.
let currentTrackUrl = DEFAULT_TRACK

// SFX cache.
let perfectSfxBytes: ArrayBuffer | null = null
let perfectSfxBuffer: AudioBuffer | null = null
let perfectSfxPrefetching = false
let castSfxBytes: ArrayBuffer | null = null
let castSfxBuffer: AudioBuffer | null = null
let castSfxPrefetching = false
let cast2SfxBytes: ArrayBuffer | null = null
let cast2SfxBuffer: AudioBuffer | null = null
let cast2SfxPrefetching = false

// Dial loop cache.
let dialBytes: ArrayBuffer | null = null
let dialBuffer: AudioBuffer | null = null
let dialFetching = false
let dialSource: AudioBufferSourceNode | null = null
let dialPendingStart = false

// Entry and exit are both linear and the same duration, so arriving and
// leaving the fishing page feel symmetric.
const ENTRY_FADE_MS  = 3000
const EXIT_FADE_MS   = 3000
const TOGGLE_FADE_MS = 400

// Music sits UNDER the SFX (which play at sfxGain = 1, perfect boosted 1.8×).
// The soundtrack at full 1.0 drowned the cast/dial/perfect cues, so the
// music's "on" level is held below the SFX bus. Tune here to rebalance.
const MUSIC_VOLUME = 0.5

function makeAudio(): HTMLAudioElement {
  const audio = document.createElement('audio')
  audio.src = currentTrackUrl
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
  //
  // AND IT MUST NOT FIRE WHEN THE SWAP IS ALREADY RUNNING. `current` is not
  // promoted to partner until the reset timer, 80ms AFTER the boundary — so at
  // the moment current actually ends, this still saw `current === just` and ran
  // a second, competing handoff. Its first act is `partner.currentTime = 0`,
  // and partner is by then already audible part-way into the track, so the
  // safety net yanked the music backwards at the exact moment it was supposed
  // to be seamless. A race that only ever fires on a correct loop.
  //
  // `handoffPreRollDone` is true from the pre-roll until the reset, which is
  // precisely the window where a scheduled swap is in flight and this must
  // stand down.
  const onEndedFactory = (just: HTMLAudioElement, partner: HTMLAudioElement) => () => {
    if (current !== just) return // already handed off
    if (handoffPreRollDone) return // a scheduled swap is mid-flight; leave it alone
    try { just.currentTime = 0 } catch {}
    try { partner.currentTime = 0 } catch {}
    partner.play().catch(() => {})
    current = partner
    instantGainSwap()
    scheduleHandoffChain()
  }
  elA.addEventListener('ended', onEndedFactory(elA, elB))
  elB.addEventListener('ended', onEndedFactory(elB, elA))

  // ── AND RE-ARM WHEN THE TAB COMES BACK ────────────────────────────────
  //
  // The handoff is a setTimeout up to two minutes long, and a BACKGROUND TAB
  // clamps timers hard — Chrome to a second, then to about one a minute once
  // the tab has been hidden a while. Which is desktop's problem specifically:
  // a phone with the screen on is looking at the page, and a laptop has the
  // game in a tab behind six others for half an hour.
  //
  // The audio keeps playing (browsers do not throttle media), so what actually
  // happens is the pre-roll never lands, the track runs to its end, and the
  // 'ended' net catches it with a hard cut instead of a crossfade. Recoverable,
  // audibly worse, and once a loop.
  //
  // Recomputing on the way back costs one comparison and puts the schedule back
  // on the real clock rather than on whatever the browser let us have.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    if (!current || current.paused) return
    scheduleHandoffChain()
  })
}

function setupWebAudio(): boolean {
  if (webAudioReady) return true
  if (!elA || !elB || typeof window === 'undefined') return false
  try {
    // Reuse the existing AudioContext across remounts when possible —
    // iOS in particular dislikes churning AudioContexts. Only the
    // per-element source / gain stack gets rebuilt to bind to the
    // freshly-created elA / elB.
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    const ctx = audioCtx ?? new Ctx()
    const newSrcA = ctx.createMediaElementSource(elA)
    const newSrcB = ctx.createMediaElementSource(elB)
    const ga = ctx.createGain()
    const gb = ctx.createGain()
    const master = ctx.createGain()
    const sfx = ctx.createGain()
    ga.gain.value = 1  // A starts as current
    gb.gain.value = 0
    master.gain.value = MUSIC_VOLUME
    sfx.gain.value = sfxMuted ? 0 : 1
    lastGainValue = MUSIC_VOLUME
    newSrcA.connect(ga).connect(master)
    newSrcB.connect(gb).connect(master)
    master.connect(ctx.destination)
    sfx.connect(ctx.destination)
    audioCtx = ctx
    srcA = newSrcA
    srcB = newSrcB
    gainA = ga
    gainB = gb
    masterGain = master
    sfxGain = sfx
    webAudioReady = true
    return true
  } catch {
    audioCtx = null
    srcA = srcB = null
    gainA = gainB = masterGain = sfxGain = null
    webAudioReady = false
    return false
  }
}

// Disconnect every node we created for the current element pair, so the
// next setupWebAudio() can build a fresh graph bound to the NEW elements.
// Called from the page-leave teardown right when we null out elA/elB.
// Keeps audioCtx alive (iOS hates churn) — we just drop everything that's
// tied to the destroyed audio elements.
function teardownWebAudioGraph() {
  try { srcA?.disconnect() } catch {}
  try { srcB?.disconnect() } catch {}
  try { gainA?.disconnect() } catch {}
  try { gainB?.disconnect() } catch {}
  try { masterGain?.disconnect() } catch {}
  try { sfxGain?.disconnect() } catch {}
  srcA = srcB = null
  gainA = gainB = null
  masterGain = sfxGain = null
  webAudioReady = false
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
  // ── THE PRE-ROLL, AND WHY IT HAS TO BE A CROSSFADE ────────────────────
  //
  // Partner starts LEAD ms before current ends, silently, so there is no
  // play()-startup latency at the boundary. That part was right.
  //
  // What was wrong is what happened AT the boundary: two `setValueAtTime`
  // calls, a hard step from current to partner. By then partner has been
  // running for LEAD ms — so every loop after the first began 200ms into the
  // track. The first play started at 0 and sounded correct; every repeat lost
  // its opening. On a two minute track that is a wrong-sounding loop every two
  // minutes, which is exactly how it was reported.
  //
  // A ramp across the overlap is what the two-element design was reaching for
  // all along: current's tail fades out while partner's head fades in, both
  // playing, so nothing is cut off either end. 200ms is short enough to be
  // inaudible as a fade and long enough to cover the latency it exists for.
  try { partner.currentTime = 0 } catch {}
  partner.play().catch(() => {})
  const t0 = audioCtx.currentTime
  const swapTime = t0 + remainingMs / 1000
  curGain.gain.cancelScheduledValues(t0)
  partnerGain.gain.cancelScheduledValues(t0)
  curGain.gain.setValueAtTime(curGain.gain.value, t0)
  partnerGain.gain.setValueAtTime(0, t0)
  // linearRamp, not setValueAtTime. The step is the bug.
  curGain.gain.linearRampToValueAtTime(0, swapTime)
  partnerGain.gain.linearRampToValueAtTime(1, swapTime)
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

function rampMaster(fromValue: number, target: number, ms: number, pauseAtEnd = false, exponential = false) {
  clearPendingPause()
  if (!audioCtx || !masterGain) return
  const now = audioCtx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  if (exponential) {
    // exponentialRamp requires a strictly positive start (and end) value.
    // Use 0.0001 (~ -80 dB) as the floor — inaudible but legal.
    const safeFrom = Math.max(fromValue, 0.0001)
    const safeTo   = Math.max(target,   0.0001)
    masterGain.gain.value = safeFrom
    masterGain.gain.setValueAtTime(safeFrom, now)
    if (ms <= 0) {
      masterGain.gain.setValueAtTime(safeTo, now)
    } else {
      masterGain.gain.exponentialRampToValueAtTime(safeTo, now + ms / 1000)
    }
  } else {
    masterGain.gain.value = fromValue
    masterGain.gain.setValueAtTime(fromValue, now)
    if (ms <= 0) {
      masterGain.gain.setValueAtTime(target, now)
    } else {
      masterGain.gain.linearRampToValueAtTime(target, now + ms / 1000)
    }
  }
  lastGainValue = target
  if (pauseAtEnd && target === 0) {
    pendingPauseTimeout = setTimeout(() => {
      clearHandoff()
      try { elA?.pause() } catch {}
      try { elB?.pause() } catch {}
      // FULL teardown — not just pause. Paused <audio> elements with
      // their src still set keep iOS's Now Playing widget visible on
      // the lock screen / Control Center forever (until app close),
      // because iOS treats them as "media item still loaded, just
      // paused." Stripping the src + dropping the elements from the
      // DOM forces iOS to end the media session for these elements
      // and the widget goes away. ensureElements() rebuilds them
      // fresh on the player's next /fishing visit; the gesture
      // primer (primeBothElements via elementsPrimed=false) runs
      // again on first interaction, same as a cold start.
      try {
        if (elA) {
          elA.removeAttribute('src')
          try { elA.load() } catch {}
          try { elA.remove() } catch {}
        }
        if (elB) {
          elB.removeAttribute('src')
          try { elB.load() } catch {}
          try { elB.remove() } catch {}
        }
      } catch {}
      elA = null
      elB = null
      current = null
      elementsPrimed = false
      // CRITICAL: drop the Web Audio graph too. The srcA / srcB
      // MediaElementSources are permanently bound to the elements we
      // just destroyed — leaving them in the graph means
      // setupWebAudio() will short-circuit on the next remount and
      // the NEW elements will bypass our gain stack entirely,
      // emitting audio direct to system. During the loop pre-roll
      // both new elements then play the same track in parallel
      // (~200ms offset) which sounds like delay/reverb. Dropping the
      // graph here forces a clean rebuild on next unlock.
      teardownWebAudioGraph()
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

function prefetchCast2Sfx() {
  if (cast2SfxBytes || cast2SfxPrefetching) return
  if (typeof fetch === 'undefined') return
  cast2SfxPrefetching = true
  fetch('/fishingcast2.mp3')
    .then(r => r.arrayBuffer())
    .then(b => { cast2SfxBytes = b; tryDecodeCast2Sfx() })
    .catch(() => { cast2SfxPrefetching = false })
}

function tryDecodeCast2Sfx() {
  if (cast2SfxBuffer || !cast2SfxBytes || !audioCtx) return
  audioCtx.decodeAudioData(cast2SfxBytes.slice(0))
    .then(buffer => { cast2SfxBuffer = buffer })
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
 *  and SFX prefetches. Idempotent on second+ calls.
 *
 *  No-op when the player has opted to let other apps play music — the
 *  whole point of that flag is to NOT spin up the `<audio>`-element
 *  session keeper, which would steal iOS's audio session from Spotify. */
export function unlockFishingAudio(): void {
  if (typeof document === 'undefined') return
  if (getLetOtherAudioPlay()) return
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
  prefetchCast2Sfx()
  tryDecodeCast2Sfx()
  prefetchDial()
  tryDecodeDial()
}

export function startFishingMusic(muted: boolean): void {
  if (getLetOtherAudioPlay()) return
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
    // Linear ramp, matching the linear fade-out exactly.
    rampMaster(0, MUSIC_VOLUME, ENTRY_FADE_MS)
  }
}

/** Swap the soundtrack to a new file (e.g. a per-zone track): quick fade out,
 *  swap both elements' source, restart the gapless loop, fade back in if we
 *  were audible. No-op if already on this track. Before the audio elements
 *  exist (first mount) it just records the target so they're created on the
 *  right track. */
export function setFishingTrack(url: string): void {
  if (url === currentTrackUrl) return
  currentTrackUrl = url
  if (!elA || !elB || !audioCtx || !masterGain) return
  const wasAudible = lastGainValue > 0
  clearHandoff()
  handoffPreRollDone = false
  trackDuration = 0
  rampMaster(lastGainValue, 0, TOGGLE_FADE_MS)
  setTimeout(() => {
    if (!elA || !elB) return
    try { elA.pause(); elB.pause() } catch {}
    elA.src = url
    elB.src = url
    try { elA.load() } catch {}
    try { elB.load() } catch {}
    current = elA
    try { elA.currentTime = 0 } catch {}
    if (wasAudible) {
      current.play().catch(() => {})
      scheduleHandoffChain()
      rampMaster(0, MUSIC_VOLUME, TOGGLE_FADE_MS)
    }
  }, TOGGLE_FADE_MS + 40)
}

/** Bind the soundtrack to `url` WITHOUT a crossfade. Call this at mount,
 *  BEFORE startFishingMusic, so the 3s entry fade-in plays on the correct
 *  per-zone track instead of starting on the default and then doing a quick
 *  toggle (which blips the wrong song for ~400ms). On a true cold load the
 *  elements don't exist yet, so this just records the target and makeAudio()
 *  builds them on the right track. On a warm remount the elements already
 *  exist, so we rebind their src silently and let startFishingMusic fade the
 *  new track in. No-op if already on this track. */
export function primeFishingTrack(url: string): void {
  if (url === currentTrackUrl) return
  currentTrackUrl = url
  if (!elA || !elB) return // not built yet — makeAudio() will use the new url
  clearHandoff()
  handoffPreRollDone = false
  trackDuration = 0
  rampMaster(0, 0, 0) // silence now; startFishingMusic fades up from 0
  try { elA.pause(); elB.pause() } catch {}
  elA.src = url
  elB.src = url
  try { elA.load() } catch {}
  try { elB.load() } catch {}
  current = elA
  try { elA.currentTime = 0 } catch {}
}

export function setFishingMusicMuted(muted: boolean): void {
  if (getLetOtherAudioPlay()) return
  unlockFishingAudio()
  if (!elA || !elB || !audioCtx || !masterGain) return
  clearPendingPause()
  if (current && current.paused) current.play().catch(() => {})
  scheduleHandoffChain()
  if (muted) {
    rampMaster(lastGainValue, 0, 0)
  } else {
    rampMaster(0, MUSIC_VOLUME, TOGGLE_FADE_MS)
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

// All SFX route through sfxGain (independent of the music's masterGain)
// so they can be muted separately. Falls back to destination if the
// graph somehow isn't wired yet.
function sfxOut(): AudioNode | null {
  return sfxGain ?? audioCtx?.destination ?? null
}

const PERFECT_SFX_GAIN = 1.8
export function playPerfectSfx(): void {
  if (!audioCtx || !perfectSfxBuffer) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = perfectSfxBuffer
    const boost = audioCtx.createGain()
    boost.gain.value = PERFECT_SFX_GAIN
    source.connect(boost).connect(out)
    source.start(0)
  } catch {}
}

/** Cast / Cast Again tap SFX. Routed through sfxGain (mutable separately
 *  from music). */
export function playCastSfx(): void {
  if (!audioCtx || !castSfxBuffer) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = castSfxBuffer
    source.connect(out)
    source.start(0)
  } catch {}
}

/** Second cast SFX — fires when the cast animation completes and the
 *  fishing/waiting phase begins (line in water). */
export function playCast2Sfx(): void {
  if (!audioCtx || !cast2SfxBuffer) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const source = audioCtx.createBufferSource()
    source.buffer = cast2SfxBuffer
    source.connect(out)
    source.start(0)
  } catch {}
}

/** Forge SFX — a bright metallic shimmer for fusing a rod's effect into the
 *  Completionist Rod. Fully synthesized (no asset): a struck-bell triad with a
 *  short noise "spark" at the front. Pass descend=true for a softer, falling
 *  variant when un-forging. Routed through sfxOut so the SFX mute applies. */
export function playForgeSfx(descend = false): void {
  if (!audioCtx) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const ctx = audioCtx
    const t0 = ctx.currentTime
    const root = descend ? 523.25 : 659.25            // C5 (un-forge) vs E5 (forge)
    const partials = descend ? [1, 0.75, 0.5] : [1, 1.5, 2] // falling vs rising triad
    partials.forEach((mult, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = i === 0 ? 'triangle' : 'sine'
      osc.frequency.value = root * mult
      const peak = (descend ? 0.16 : 0.26) / (i + 1)
      const start = t0 + i * 0.045
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(peak, start + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
      osc.connect(g).connect(out)
      osc.start(start)
      osc.stop(start + 0.55)
    })
    // Front spark — short band-passed noise burst for the metallic "ting".
    const noise = ctx.createBufferSource()
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    noise.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = descend ? 2200 : 3600; bp.Q.value = 0.8
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(descend ? 0.07 : 0.13, t0)
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
    noise.connect(bp).connect(ng).connect(out)
    noise.start(t0); noise.stop(t0 + 0.1)
  } catch {}
}

/** The ABYSSAL forge strike — a deliberate step above playForgeSfx for tier-3
 *  fusions. Same metallic clang DNA, but bigger: a low sub-bass swell for weight,
 *  a fuller rising chord, a double-layer clang, and a crystalline shimmer tail
 *  that rings out as the Abyssal item is revealed. Fully synthesized, sfxOut. */
export function playAbyssalForgeSfx(): void {
  if (!audioCtx) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const ctx = audioCtx
    const t0 = ctx.currentTime

    // Sub-bass swell — the deep of the abyss taking the blow. Sweeps up, then
    // settles, giving the strike real body under the metallic clang.
    const sub = ctx.createOscillator()
    const subG = ctx.createGain()
    sub.type = 'sawtooth'
    sub.frequency.setValueAtTime(52, t0)
    sub.frequency.exponentialRampToValueAtTime(96, t0 + 0.18)
    sub.frequency.exponentialRampToValueAtTime(44, t0 + 0.9)
    const subLp = ctx.createBiquadFilter()
    subLp.type = 'lowpass'; subLp.frequency.value = 240
    subG.gain.setValueAtTime(0.0001, t0)
    subG.gain.exponentialRampToValueAtTime(0.3, t0 + 0.03)
    subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95)
    sub.connect(subLp).connect(subG).connect(out)
    sub.start(t0); sub.stop(t0 + 1.0)

    // Rising chord — fuller than the standard triad (adds the octave partial).
    const root = 659.25 // E5
    ;[1, 1.5, 2, 3].forEach((mult, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = i === 0 ? 'triangle' : 'sine'
      osc.frequency.value = root * mult
      const peak = 0.24 / (i + 1)
      const start = t0 + i * 0.05
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(peak, start + 0.014)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.7)
      osc.connect(g).connect(out)
      osc.start(start); osc.stop(start + 0.75)
    })

    // Double-layer clang — a low body thud + a bright ting, for a bigger strike.
    ;[{ f: 1500, q: 0.7, gain: 0.14, dur: 0.16 }, { f: 4200, q: 0.9, gain: 0.13, dur: 0.1 }].forEach(({ f, q, gain, dur }) => {
      const noise = ctx.createBufferSource()
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      noise.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(gain, t0)
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02)
      noise.connect(bp).connect(ng).connect(out)
      noise.start(t0); noise.stop(t0 + dur + 0.03)
    })

    // Shimmer tail — a crystalline arpeggio that rings out AFTER the strike, the
    // iridescent Abyssal sheen made audible.
    ;[1318.5, 1975.5, 2637].forEach((f, i) => {   // E6, B6, E7
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const start = t0 + 0.34 + i * 0.075
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.55)
      osc.connect(g).connect(out)
      osc.start(start); osc.stop(start + 0.6)
    })
  } catch {}
}

/** Renown point spend — a short crystalline two-note "ting" for allocating a
 *  banked Renown point. Deliberately light + quick so rapid clicks feel tactile
 *  rather than fatiguing. Fully synthesized. Routed through sfxOut. */
export function playRenownPointSfx(): void {
  if (!audioCtx) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const ctx = audioCtx
    const t0 = ctx.currentTime
    // Rising two-note blip: G5 → C6, bright and glassy.
    ;[783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const start = t0 + i * 0.05
      const peak = 0.2 - i * 0.03
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(peak, start + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      osc.connect(g).connect(out)
      osc.start(start); osc.stop(start + 0.26)
    })
  } catch {}
}

/** Renown level earned — a fuller ascending swell (past level 100, a real
 *  moment). Warmer + longer than the point-spend ting. Fully synthesized. */
export function playRenownUpSfx(): void {
  if (!audioCtx) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const ctx = audioCtx
    const t0 = ctx.currentTime
    // Ascending perfect-fifth stack: C5 G5 C6 E6 — regal, gold.
    const notes = [523.25, 783.99, 1046.5, 1318.5]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = i === notes.length - 1 ? 'triangle' : 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.08
      const peak = 0.26 - i * 0.02
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(Math.max(0.06, peak), start + 0.016)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.7)
      osc.connect(g).connect(out)
      osc.start(start); osc.stop(start + 0.75)
    })
    // High shimmer riding the top.
    const noise = ctx.createBufferSource()
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    noise.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 0.7
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.12, t0 + 0.18)
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34)
    noise.connect(bp).connect(ng).connect(out)
    noise.start(t0 + 0.18); noise.stop(t0 + 0.35)
  } catch {}
}

/** Treasure-chest open fanfare — fully synthesized (no asset). A low lid
 *  "thunk", a bright ascending major arpeggio (the payoff), and a couple of
 *  high coin-shimmer sparkles. Routed through sfxOut so the SFX mute applies.
 *  Pass `grand` for a fuller, slightly longer flourish on rarer drops. */
export function playChestSfx(grand = false): void {
  if (!audioCtx) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const ctx = audioCtx
    const t0 = ctx.currentTime

    // Lid thunk — a quick low pitch-drop for the crate cracking open.
    const thunk = ctx.createOscillator()
    const tg = ctx.createGain()
    thunk.type = 'triangle'
    thunk.frequency.setValueAtTime(240, t0)
    thunk.frequency.exponentialRampToValueAtTime(80, t0 + 0.13)
    tg.gain.setValueAtTime(0.0001, t0)
    tg.gain.exponentialRampToValueAtTime(0.3, t0 + 0.012)
    tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
    thunk.connect(tg).connect(out)
    thunk.start(t0); thunk.stop(t0 + 0.22)

    // Ascending major arpeggio — C5 E5 G5 C6 (+ E6 on grand), the reward sting.
    const notes = grand ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5]
    const lead = t0 + 0.06   // a beat after the thunk
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = i === notes.length - 1 ? 'triangle' : 'sine'
      osc.frequency.value = freq
      const start = lead + i * 0.075
      const peak = 0.24 - i * 0.018
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(Math.max(0.05, peak), start + 0.014)
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.55)
      osc.connect(g).connect(out)
      osc.start(start); osc.stop(start + 0.6)
    })

    // Coin shimmer — two short high band-passed noise bursts riding the top.
    ;[0.12, 0.26].forEach((off, k) => {
      const noise = ctx.createBufferSource()
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.09), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      noise.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = 5200 + k * 1400; bp.Q.value = 0.7
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(0.1, t0 + off)
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.13)
      noise.connect(bp).connect(ng).connect(out)
      noise.start(t0 + off); noise.stop(t0 + off + 0.14)
    })
  } catch {}
}

/** Wind-up "creak" for the beat BEFORE a chest pops — a low wooden groan that
 *  bends upward as the lid strains, with a few hinge ticks. Builds anticipation
 *  so the burst (playChestSfx) lands as a payoff, not a jump-cut. */
export function playChestCreakSfx(): void {
  if (!audioCtx) return
  const out = sfxOut(); if (!out) return
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
    const ctx = audioCtx
    const t0 = ctx.currentTime

    // Wooden groan — a low sawtooth bending slowly upward under a lowpass, like
    // old timbers taking strain.
    const groan = ctx.createOscillator()
    const gg = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 900
    groan.type = 'sawtooth'
    groan.frequency.setValueAtTime(68, t0)
    groan.frequency.exponentialRampToValueAtTime(132, t0 + 0.6)
    gg.gain.setValueAtTime(0.0001, t0)
    gg.gain.exponentialRampToValueAtTime(0.1, t0 + 0.12)
    gg.gain.exponentialRampToValueAtTime(0.16, t0 + 0.52)
    gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.68)
    groan.connect(lp).connect(gg).connect(out)
    groan.start(t0); groan.stop(t0 + 0.7)

    // Hinge ticks — short band-passed noise blips, like strained iron giving.
    ;[0.08, 0.27, 0.46].forEach((off, k) => {
      const noise = ctx.createBufferSource()
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
      noise.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = 2200 + k * 650; bp.Q.value = 1.3
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(0.055, t0 + off)
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.07)
      noise.connect(bp).connect(ng).connect(out)
      noise.start(t0 + off); noise.stop(t0 + off + 0.08)
    })
  } catch {}
}

/** Mute/unmute SFX independently of the music. Persisted to localStorage. */
export function getFishingSfxMuted(): boolean { return sfxMuted }
export function setFishingSfxMuted(muted: boolean): void {
  sfxMuted = muted
  if (sfxGain && audioCtx) {
    sfxGain.gain.setValueAtTime(muted ? 0 : 1, audioCtx.currentTime)
  }
  try { window.localStorage.setItem('fishingSfxMuted', String(muted)) } catch {}
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
  const out = sfxOut(); if (!out) return
  try {
    const source = audioCtx.createBufferSource()
    source.buffer = dialBuffer
    source.loop = true
    source.playbackRate.value = rate
    source.connect(out)
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
