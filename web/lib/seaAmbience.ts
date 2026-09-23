// ── THE SEA, HEARD ──────────────────────────────────────────────────────────
//
// Kong asked what would make sailing more satisfying, and the loudest gap was
// that the sea made no sound of its own: music on the day/night cycle and the
// fishing effects, and nothing at all for the thing you do most, which is
// sail. This is that layer.
//
// ── MADE, NOT RECORDED, WHERE THAT SOUNDS RIGHT ─────────────────────────────
//
// Water and wind are NOISE, shaped. Two looping seconds of noise feed
// three filters, and the boat's own numbers drive them:
//
//   THE HULL     band-passed noise whose loudness and brightness follow your
//                speed, with a slow swell in it so it rolls rather than hisses.
//                Standing still it is gone; at full sail it is the loudest
//                thing here.
//   THE SWELL    low noise, a slow breath, deeper and louder the further out
//                you are. The Shallows are nearly quiet; the Ancient Deep is not.
//   THE WIND     high, thin, a little of it always and more with way on.
//
// The harbour BELL is made too (three inharmonic partials and a long decay,
// which is what a small bell is).
//
// ── RECORDED, WHERE MADE SOUNDS FAKE ────────────────────────────────────────
//
// A creaking hull and a gull are not noise with a filter on, and a synthesised
// one is worse than none. So they are SLOTS: drop `creak.mp3` or `gull.mp3`
// (and `gull2.mp3`) into public/sea-audio and they start playing, a creak on a
// hard turn and a gull now and then near land. Missing files are simply
// skipped, the same way the landing page's art slots fill from filenames.
//
// ── ONE BUS, ONE MUTE ───────────────────────────────────────────────────────
//
// Everything routes into the fishing engine's SFX bus (`sfxBus`), so the SFX
// toggle in settings silences this with everything else and nothing here needs
// its own context or its own gesture unlock. Nothing starts until that context
// exists, which is after the first press on the chart.

import { sfxBus } from './fishingMusic'

type Bus = { ctx: AudioContext; out: GainNode }

let built: {
  bus: Bus
  master: GainNode
  hull: { gain: GainNode; band: BiquadFilterNode }
  swell: { gain: GainNode }
  wind: { gain: GainNode; band: BiquadFilterNode }
} | null = null

/** Recorded one-shots, by name. `null` means we asked and there is no file. */
const samples: Record<string, AudioBuffer | null | 'loading'> = {}
let lastCreak = 0
let lastGull = 0
let nextGullGap = 9000
let enabled = false

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  // Pink-ish rather than white: a running filter over white noise. White is a
  // hiss; this has body, which is what water has.
  let b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
  }
  return buf
}

function lfo(ctx: AudioContext, hz: number, depth: number, into: AudioParam) {
  const o = ctx.createOscillator()
  o.frequency.value = hz
  const g = ctx.createGain()
  g.gain.value = depth
  o.connect(g).connect(into)
  o.start()
}

function build(): boolean {
  if (built) return true
  const bus = sfxBus()
  if (!bus) return false
  const { ctx, out } = bus
  const noise = noiseBuffer(ctx)
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true

  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(out)

  // THE HULL
  const hullBand = ctx.createBiquadFilter()
  hullBand.type = 'bandpass'
  hullBand.frequency.value = 500
  hullBand.Q.value = 0.7
  const hullGain = ctx.createGain()
  hullGain.gain.value = 0
  const hullRoll = ctx.createGain()
  hullRoll.gain.value = 1
  lfo(ctx, 0.19, 0.28, hullRoll.gain)
  src.connect(hullBand).connect(hullRoll).connect(hullGain).connect(master)

  // THE SWELL
  const swellLow = ctx.createBiquadFilter()
  swellLow.type = 'lowpass'
  swellLow.frequency.value = 260
  const swellGain = ctx.createGain()
  swellGain.gain.value = 0
  const swellBreath = ctx.createGain()
  swellBreath.gain.value = 0.7
  lfo(ctx, 0.085, 0.3, swellBreath.gain)
  src.connect(swellLow).connect(swellBreath).connect(swellGain).connect(master)

  // THE WIND
  const windHigh = ctx.createBiquadFilter()
  windHigh.type = 'highpass'
  windHigh.frequency.value = 900
  const windBand = ctx.createBiquadFilter()
  windBand.type = 'bandpass'
  windBand.frequency.value = 1600
  windBand.Q.value = 1.4
  lfo(ctx, 0.07, 500, windBand.frequency)
  const windGain = ctx.createGain()
  windGain.gain.value = 0
  src.connect(windHigh).connect(windBand).connect(windGain).connect(master)

  src.start()
  built = { bus, master, hull: { gain: hullGain, band: hullBand }, swell: { gain: swellGain }, wind: { gain: windGain, band: windBand } }
  return true
}

function load(name: string) {
  if (name in samples) return
  const bus = sfxBus()
  if (!bus) return
  samples[name] = 'loading'
  fetch(`/sea-audio/${name}.mp3`)
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing'))))
    .then(b => bus.ctx.decodeAudioData(b))
    .then(buf => { samples[name] = buf })
    .catch(() => { samples[name] = null })
}

function playSample(name: string, gain: number, rate = 1) {
  const buf = samples[name]
  if (!built || !buf || buf === 'loading') return
  const { ctx } = built.bus
  const s = ctx.createBufferSource()
  s.buffer = buf
  s.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.value = gain
  s.connect(g).connect(built.master)
  s.start()
}

/** Turn the layer on or off (the flag). Fades rather than cuts. Returns
 *  whether it is actually sounding, which is false until the audio context
 *  exists (after the first press), so the caller knows to ask again. */
export function setSeaAmbience(on: boolean): boolean {
  enabled = on
  if (!on) {
    if (built) built.master.gain.setTargetAtTime(0, built.bus.ctx.currentTime, 0.4)
    return false
  }
  if (!build() || !built) return false
  built.master.gain.setTargetAtTime(1, built.bus.ctx.currentTime, 0.8)
  for (const n of ['creak', 'gull', 'gull2']) load(n)
  return true
}

/**
 * Fed a few times a second from the chart's proximity tick.
 *
 *   speed    0..1, how hard she is driving
 *   turn     0..1, how hard she is turning right now
 *   depth    0..1, how far out: the Shallows near 0, the Ancient Deep 1
 *   land     0..1, how close the nearest island or port is
 *   hushed   the rod is out or a panel is up: everything drops back
 */
export function updateSeaAmbience(p: { speed: number; turn: number; depth: number; land: number; hushed: boolean }) {
  if (!enabled) return
  if (!built && !build()) return
  if (!built) return
  const t = built.bus.ctx.currentTime
  const hush = p.hushed ? 0.45 : 1
  const s = Math.max(0, Math.min(1, p.speed))
  built.hull.gain.gain.setTargetAtTime((0.02 + s * s * 0.34) * hush, t, 0.35)
  built.hull.band.frequency.setTargetAtTime(380 + s * 700, t, 0.4)
  built.swell.gain.gain.setTargetAtTime((0.05 + p.depth * 0.16) * hush, t, 1.2)
  built.wind.gain.gain.setTargetAtTime((0.012 + s * 0.05 + p.depth * 0.02) * hush, t, 0.8)

  const now = performance.now()
  // A CREAK on a hard turn with way on, and not twice in four seconds.
  if (p.turn > 0.55 && s > 0.35 && now - lastCreak > 4000) {
    lastCreak = now
    playSample('creak', 0.35 * hush, 0.9 + Math.random() * 0.2)
  }
  // A GULL now and then near land, never on a clock you could hear.
  if (p.land > 0.35 && !p.hushed && now - lastGull > nextGullGap) {
    lastGull = now
    nextGullGap = 8000 + Math.random() * 14000
    playSample(Math.random() < 0.5 ? 'gull' : 'gull2', 0.22 * p.land, 0.92 + Math.random() * 0.16)
  }
}

/** The harbour bell, when you tie up. Made, not recorded. */
export function playHarbourBell() {
  if (!enabled || (!built && !build()) || !built) return
  const { ctx } = built.bus
  const t = ctx.currentTime
  const f = 660
  for (const [ratio, amp, decay] of [[1, 0.16, 2.6], [2.76, 0.07, 1.6], [5.4, 0.035, 0.9]] as const) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f * ratio
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    o.connect(g).connect(built.master)
    o.start(t)
    o.stop(t + decay + 0.05)
  }
}
