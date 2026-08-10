'use client'

import { useCallback, useEffect, useRef, useState, startTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getPlayerTideRunRank, type TopTideRunHolder, type PlayerTideRunRank } from './actions'
import { tideRunBoat, boatsUnlockedBetween, nextBoat, type TideRunBoat } from '@/lib/tideRunBoats'
import { tideRunSea, seasUnlockedBetween, type TideRunSea } from '@/lib/tideRunSeas'
import { serverAdapter } from './serverAdapter'
import type { TideRunAdapter } from './adapter'
import BoatLocker from './BoatLocker'
import BoatUnlockedOverlay from './BoatUnlockedOverlay'
import SeaUnlockedOverlay from './SeaUnlockedOverlay'
import TideRunTour from './TideRunTour'
import LeaderboardModal from '@/components/LeaderboardModal'
import PodiumToast, { type PodiumNotif } from '@/components/PodiumToast'
import { prefetchTideRunAudio, unlockTideRunAudio, teardownTideRunAudio, playBeaconCatchSfx, playBeaconCrashSfx, playSplashSfx, playCrashSfx, getTideRunMuted, setTideRunMuted } from '@/lib/tideRunAudio'
import { vibrate, hapticTap } from '@/lib/haptics'

// ── Tunable constants ────────────────────────────────────────────────────────
// A FIXED VIRTUAL WORLD. The whole simulation runs in these units, and the
// canvas scales to whatever physical size a device gives it. So the visible
// window is ALWAYS 400 units wide, whether that is a 390px phone or a 1400px
// monitor, and every player sees exactly the same distance of sea ahead of the
// bow. Before this, the world was in raw canvas px: the ship sits 13% from the
// left and hazards spawn at the right edge, so a wider screen showed more world
// and bought more reaction time. Capping the width helped but a 390 phone and a
// 430 phone still differed. This removes the difference entirely -- the leader-
// board is shared, so the game has to be too. Only the pixel zoom changes;
// vertical extent still follows the device's aspect, which is cosmetic (the sea
// surface sits at 60%, jumps are time-based, the ship is clamped below).
// 400 sits at the median phone width, so the typical player's difficulty is
// unchanged; small and large phones converge onto it rather than one easing.
const VIRTUAL_W = 400
const SHIP_X_RATIO    = 0.13   // boat sits ~13% from the left, giving ~87% lookahead
const SHIP_HEIGHT_PCT = 0.095  // small Canabalt-style sprite (~9.5% of world height)
// The ship is sized off world height, but a tall aspect ratio makes the virtual
// height large. Clamp it to a representative reference so the ship stays its
// tuned size rather than inflating on tall screens. In VIRTUAL_W units now.
const SHIP_SIZING_REF_H = 620
const SHIP_ASPECT     = 805 / 595    // trimmed boatrun.png (redesigned 2026-06-06)

// Ship physics — Canabalt feel. Boat rides the wave surface; press-and-hold
// to jump (longer hold → higher jump). No automatic launches off crests.
const GRAVITY                  = 2800  // px/s² full gravity (in-air, after hold release)
const JUMP_IMPULSE             = 590   // px/s upward kick when press starts a jump
const JUMP_HOLD_GRAVITY_MULT   = 0.30  // gravity multiplier while hold is active (sustained jump)
const JUMP_MAX_HOLD_SEC        = 0.40  // hold beyond this no longer extends the jump
const BASE_SPEED               = 290   // px/s horizontal scroll (Canabalt rolls)
const SPEED_RAMP               = 5     // px/s² — gentle climb (was 7; eased 2026-05-19, hiscore plateaued ~311m/42s for a month)
const MAX_SPEED                = 1500  // soft safety cap; reached only after ~3 min of perfect play

// Sea surface — gentle long-period swells so the boat "runs" along the wave.
// Sea baseline is pulled up so the action lives in the upper two-thirds of the
// canvas, leaving the lower third as comfortable thumb-tap space on phones.
const SEA_BASE_Y_PCT      = 0.60
const WAVE_PRIMARY_PERIOD = 560
const WAVE_PRIMARY_AMP    = 18
const WAVE_SECONDARY_PERIOD = 940
const WAVE_SECONDARY_AMP  = 7
const WAVE_AMP_RAMP_DISTANCE = 8000
const WAVE_AMP_RAMP_MAX   = 1.25

// Surface hazards — rocks/spikes poking out of the water. Boat clears them
// by being airborne when crossing. Size per spawn picks from three tiers
// with distance-based unlocks so early runs aren't punishingly hard.
const HAZARD_SPAWN_SPACING = 360   // base world px between hazard centers
const HAZARD_WARMUP        = 1200  // world px before the first hazard spawns
const TIER_SMALL_ONLY_M    = 25    // first ~25m: only small rocks (tap-clearable)
const TIER_NO_LARGE_M      = 90    // 25–90m: small + medium; no large rocks yet
const APPROACH_BUFFER_MED  = 80    // extra world px of approach before a medium rock
const APPROACH_BUFFER_LRG  = 240   // extra world px before a large rock (real reaction time)

// Time-based floors so high speeds don't outpace human reaction. Spacing and
// tier buffers scale with current speed once these times become more
// constraining than the world-px constants above.
const MIN_REACTION_TIME_SEC = 0.55  // floor on time between consecutive hazards
const MED_EXTRA_TIME_SEC    = 0.10  // extra reaction time for medium rocks
const LRG_EXTRA_TIME_SEC    = 0.30  // extra reaction time for large rocks

// Shoals — deadly horizontal zones on the wave. Boat dies if grounded
// inside one. Player must hold-jump long enough to clear the zone's width.
// Width auto-scales with current speed so the game can never spawn an
// un-clearable shoal.
const SHOAL_CHANCE             = 0.20  // probability a spawn slot becomes a shoal
const SHOAL_WARMUP_M           = 50    // no shoals in the first 50m (rocks first)
const SHOAL_MIN_WIDTH          = 80    // narrowest shoal, always tap-clearable
const SHOAL_CLEARANCE_FRACTION = 0.70  // % of full-hold distance used as max width
const SHOAL_AFTER_ROCK_TIME_SEC = 1.15 // min time from previous rock to shoal

// Shoal clusters — multiple shoals in sequence with narrow safe gaps between
// them. The safe gaps are the "rooftops" the player has to land on. This is
// the precision-jump mechanic: under-jump → die in shoal, over-jump → die in
// the next shoal, perfect hold → land on the safe strip.
const SHOAL_CLUSTER_CHANCE         = 0.35   // % of shoal spawns that become clusters (else single)
const SHOAL_CLUSTER_WARMUP_M       = 140    // clusters only appear past 140m
const SHOAL_CLUSTER_MIN_COUNT      = 2      // shoals in a cluster (inclusive)
const SHOAL_CLUSTER_MAX_COUNT      = 3      // capped at 3 (was 4) so chains stay readable
const SHOAL_CLUSTER_MEMBER_MIN_PX  = 80     // each cluster shoal's min width
const SHOAL_CLUSTER_MEMBER_MAX_PX  = 120    // each cluster shoal's max width
const SHOAL_CLUSTER_SAFE_GAP_MIN_PX = 165   // safe-landing strip between shoals — min width
const SHOAL_CLUSTER_SAFE_GAP_MAX_PX = 235   // safe-landing strip — max width

// Beacons — disguised detection devices that look like rocks. Smash through
// grounded to disable the beacon and stay hidden; jumping over it lets the
// signal go off and your ship is spotted. Subtle visual cues: faint rust on
// the cracks, a thin antenna, a pulsing amber signal light. Tricks the
// "see rock → jump" reflex. On airborne contact, the game pauses for
// BEACON_DETECT_FLASH_SEC while a beam of light fires upward, then wreck.
const BEACON_CHANCE              = 0.22  // probability a spawn becomes a beacon (signature mechanic)
const BEACON_WARMUP_M            = 66    // beacons only after 66m (player learns rocks first)
const BEACON_AFTER_ROCK_TIME_SEC = 1.05  // need to land from a previous jump before reaching one
const BEACON_DETECT_FLASH_SEC    = 0.55  // duration the detection beam plays before wrecked screen

// Wave surface modulation — long-period alternation between calm and rolling
// sections so the run doesn't feel monotonous.
const WAVE_FLATNESS_PERIOD = 2200  // world px per calm/rolling cycle

// Wake foam — emitted at the boat's bow and trails back as the world scrolls
const WAKE_EMIT_DISTANCE = 5      // emit one wake particle every N world-px of scroll (denser = more foam)
const WAKE_MAX_AGE_SEC   = 0.85   // particle lifetime (longer trail)
const WAKE_PARTICLE_DRIFT_VY = 10 // px/s downward drift as wake settles
const WAKE_BOW_OFFSET    = 0.80   // emit at this fraction of ship width (bow contact with water)

// Splash bursts on landing / hit events
const SPLASH_MAX_AGE_SEC = 0.55
const SPLASH_GRAVITY     = 900    // particle gravity (px/s²)

// Beacon-smash juice — chunky rock debris + an amber signal-pop ring.
const DEBRIS_MAX_AGE_SEC = 0.75
const DEBRIS_GRAVITY     = 1150   // px/s²
const SMASH_RING_DUR_SEC = 0.42
const SMASH_SHAKE_MS     = 200    // screen-shake window after a smash
const HITSTOP_MS         = 55     // micro-freeze on smash — subtle, sells the impact

// Day/night cycle — palette interpolates over CYCLE_DISTANCE_M of distance.
// Stops are: midday → dusk → night → dawn → loop. Long enough that typical
// runs only drift partway through one transition (visible but not distracting).
const CYCLE_DISTANCE_M = 2400

// Currents — slow-zones on the surface. Ride through to slow down (more
// reaction time); jump over to skip the slowdown. Spawned in the gap
// between hazards so they never overlap a rock.
const CURRENT_CHANCE       = 0.12  // probability of a current spawning after each hazard (rare, meaningful)
const CURRENT_WIDTH_MIN    = 0.18  // % of canvas width
const CURRENT_WIDTH_MAX    = 0.32  // % of canvas width
const CURRENT_SPEED_MULT   = 0.55  // effective scroll speed when grounded inside a current
const CURRENT_WARMUP_M     = 35    // currents don't appear until 35m into the run
const CURRENT_ENTER_RATE   = 5.0   // 1/s — how fast the boat slows entering a current
const CURRENT_EXIT_RATE    = 1.6   // 1/s — how slow the boat re-accelerates leaving one
const CURRENT_RECOVERY_SEC = 1.6   // ~time for speed to recover after a current; a shoal
                                   // within this window of one is forced narrow (fair)

// Hitbox inset on the trimmed sprite
const HITBOX_INSET = { top: 0.35, right: 0.12, bottom: 0.08, left: 0.08 }

const METERS_PER_PIXEL = 1 / 60

// 1-decimal formatter for distances on the wreck screen, HUD PB, and
// leaderboard story. Uses toLocaleString so the comma grouping is kept
// at higher scores (1,234.5). The live in-run score readout stays
// integer (calm ticker) — only "settled" numbers get the decimal.
function fmtDistance(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// ── Types ────────────────────────────────────────────────────────────────────
type GameState = 'ready' | 'playing' | 'dead'

interface Hazard {
  x: number          // world x (left edge of hazard)
  width: number
  height: number     // sticks up above the surface by this many px
  nm?: boolean       // near-miss FX already fired for this rock (one-shot)
}

interface Current {
  x: number          // world x (left edge of current zone)
  width: number      // width of slow-zone
}

interface Shoal {
  x: number          // world x (left edge of shoal)
  width: number      // width of deadly zone
}

interface Beacon {
  x: number          // world x (left edge)
  width: number
  height: number     // cosmetic rock height
  shatteredAt: number // performance.now() when smashed, 0 = intact
}

interface WakeParticle {
  worldX: number     // anchored in world; scrolls past with the wave
  y: number          // initial screen y at emission
  age: number        // seconds since emit
}

interface SplashParticle {
  worldX: number
  y: number
  vx: number         // world-space px/s
  vy: number         // screen px/s (negative = up)
  age: number
}

interface DebrisParticle {
  worldX: number
  y: number
  vx: number          // world-space px/s
  vy: number          // screen px/s (negative = up)
  age: number
  rot: number         // current rotation (rad)
  vr: number          // rotation velocity (rad/s)
  size: number
}

interface SparkleParticle {
  worldX: number     // anchored in world
  y: number
  age: number
  life: number       // total lifetime in seconds
}

// ── Day/night palette stops ──────────────────────────────────────────────────
// Each stop covers a quarter of the cycle. Lerps interpolate between adjacent
// stops based on the local fraction. Order: midday → dusk → night → dawn → loop.
// The palette stops now live per-SEA in lib/tideRunSeas.ts, so a whole new
// world is eight colours times four stops and no assets at all. This module
// keeps a mutable reference to the equipped sea's stops rather than threading
// them through every draw helper: currentPalette() is called once a frame from
// inside the render loop, and passing a palette down through a dozen drawing
// functions would have touched every one of them for no gain.
let PALETTE_STOPS: readonly SeaStopLike[] = tideRunSea('home').stops
type SeaStopLike = TideRunSea['stops'][number]
function useSeaStops(seaId: string) { PALETTE_STOPS = tideRunSea(seaId).stops }

// Hex (or rgb string) → number triple
function rgbOf(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  }
  // rgb(r,g,b) — used as fallback
  const m = c.match(/\d+/g)
  if (!m) return [0, 0, 0]
  return [parseInt(m[0], 10), parseInt(m[1], 10), parseInt(m[2], 10)]
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgbOf(a)
  const [br, bg, bb] = rgbOf(b)
  return `rgb(${Math.round(ar + (br - ar) * t)}, ${Math.round(ag + (bg - ag) * t)}, ${Math.round(ab + (bb - ab) * t)})`
}

// rgba string lerp — strings are "rgba(r,g,b,a)"
function lerpRGBA(a: string, b: string, t: number): string {
  const ma = a.match(/[\d.]+/g)!
  const mb = b.match(/[\d.]+/g)!
  const r = Math.round(+ma[0] + (+mb[0] - +ma[0]) * t)
  const g = Math.round(+ma[1] + (+mb[1] - +ma[1]) * t)
  const b1 = Math.round(+ma[2] + (+mb[2] - +ma[2]) * t)
  const al = +ma[3] + (+mb[3] - +ma[3]) * t
  return `rgba(${r}, ${g}, ${b1}, ${al})`
}

function currentPalette(distanceMeters: number) {
  const cycle = ((distanceMeters / CYCLE_DISTANCE_M) % 1 + 1) % 1   // 0..1
  const seg = cycle * PALETTE_STOPS.length                          // 0..N
  const i = Math.floor(seg) % PALETTE_STOPS.length
  const j = (i + 1) % PALETTE_STOPS.length
  const t = seg - Math.floor(seg)
  const A = PALETTE_STOPS[i]
  const B = PALETTE_STOPS[j]
  return {
    skyTop: lerpColor(A.skyTop, B.skyTop, t),
    skyBot: lerpColor(A.skyBot, B.skyBot, t),
    seaTop: lerpColor(A.seaTop, B.seaTop, t),
    seaMid: lerpColor(A.seaMid, B.seaMid, t),
    seaBot: lerpColor(A.seaBot, B.seaBot, t),
    island: lerpColor(A.island, B.island, t),
    cloud:  lerpRGBA (A.cloud,  B.cloud,  t),
    foam:   lerpRGBA (A.foam,   B.foam,   t),
  }
}

// ── Sea surface helper ───────────────────────────────────────────────────────
// Multi-sine wave is multiplied by a long-period "flatness" modulator so the
// sea alternates between calm stretches and rolling stretches.
function seaSurfaceY(worldX: number, ch: number, distanceScrolled: number): number {
  const ramp = 1 + Math.min(distanceScrolled / WAVE_AMP_RAMP_DISTANCE, 1) * (WAVE_AMP_RAMP_MAX - 1)
  const TAU = Math.PI * 2
  const w1 = Math.sin(worldX / WAVE_PRIMARY_PERIOD * TAU) * WAVE_PRIMARY_AMP
  const w2 = Math.sin(worldX / WAVE_SECONDARY_PERIOD * TAU + 1.1) * WAVE_SECONDARY_AMP
  // 0 = perfectly flat sea, 1 = full wave amplitude. Slow cosine modulation.
  const flatness = (Math.cos(worldX / WAVE_FLATNESS_PERIOD * TAU) + 1) / 2
  return ch * SEA_BASE_Y_PCT - (w1 + w2) * ramp * flatness
}

// ── Game ─────────────────────────────────────────────────────────────────────
interface TideRunGameProps {
  initialBestDistance?: number
  /** Equipped boat id, from the profile. */
  initialBoatId?: string
  /** Equipped sea id, from the profile. */
  initialSeaId?: string
  /** Where the game reads and writes. Defaults to the Small Fishes host; a
   *  standalone build passes localAdapter and needs no server at all. */
  adapter?: TideRunAdapter
  hasSeenTour?: boolean
  /** Current #1 leaderboard holder. Shown on the wreck screen as the
   *  global target to chase. Null on a cold leaderboard (no one has
   *  scored anything yet). */
  topHolder?: TopTideRunHolder | null
  /** Player's own rank + gap to the rank above on page load. The wreck
   *  screen re-fetches this after each death so PB-driven rank shifts
   *  land live. */
  initialRank?: PlayerTideRunRank | null
}

export default function TideRunGame({ initialBestDistance = 0, initialBoatId = 'original', initialSeaId = 'home', adapter = serverAdapter, hasSeenTour = false, topHolder = null, initialRank = null }: TideRunGameProps) {
  // ── Boats ────────────────────────────────────────────────────────────────
  const [boatId, setBoatId] = useState(initialBoatId)
  const [seaId, setSeaId] = useState(initialSeaId)
  // Point the renderer at the equipped sea's stops. Runs before paint so the
  // very first frame is already the right water, never a flash of Home Waters.
  useSeaStops(seaId)
  const [lockerOpen, setLockerOpen] = useState(false)
  // Boats this run just earned. Held until the player taps them away, never on
  // a timer — the moment exists to be looked at.
  const [justUnlocked, setJustUnlocked] = useState<TideRunBoat[]>([])
  const [justUnlockedSeas, setJustUnlockedSeas] = useState<TideRunSea[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const shipImgRef = useRef<HTMLImageElement | null>(null)

  // Kick off the beacon SFX prefetch on mount so the buffers are ready by
  // the time the player encounters their first beacon. On UNMOUNT (player
  // leaves /tide-run), fully tear down the silent session-keeper audio
  // element so iOS doesn't keep showing the lock-screen Now Playing
  // widget after the player has navigated away.
  useEffect(() => {
    prefetchTideRunAudio()
    return () => { teardownTideRunAudio() }
  }, [])

  // Speaker toggle state — mirrors the persisted preference in the audio
  // singleton. UI in render below.
  const [audioMuted, setAudioMutedState] = useState<boolean>(() => getTideRunMuted())

  // All mutable game state lives in a single ref. React state is only for UI.
  const gRef = useRef({
    state: 'ready' as GameState,
    cw: 0,
    ch: 0,
    shipH: 0,
    shipW: 0,
    shipY: 0,
    shipVy: 0,
    airborne: false,
    scrollX: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    hazards: [] as Hazard[],
    currents: [] as Current[],
    shoals: [] as Shoal[],
    beacons: [] as Beacon[],
    lastSpawnType: null as 'rock' | 'shoal' | 'beacon' | null,
    detectingUntil: 0,        // performance.now() timestamp; while > now() the detection beam is playing
    detectingBeaconX: 0,      // world x center of the beacon that triggered detection
    pitch: 0,                 // smoothed ship pitch (radians); eases toward target each frame
    wake: [] as WakeParticle[],
    wakeNextEmitX: 0,         // world x of next wake emit
    splashes: [] as SplashParticle[],
    debris: [] as DebrisParticle[],          // beacon-smash rock chunks
    smashRings: [] as { worldX: number; y: number; age: number }[],
    hitstopUntil: 0,          // performance.now() ts; sim frozen while > now (smash hitstop)
    shakeUntil: 0,            // performance.now() ts; canvas shakes while > now
    shakeMag: 0,              // px shake amplitude at the start of the window
    shakeDur: 0,              // ms duration of the current shake (decay basis)
    sparkles: [] as SparkleParticle[],
    sparkleNextEmit: 0,       // performance.now() of next sparkle emit
    nextSpawnAt: 0,
    distance: 0,
    pbMeters: initialBestDistance,   // PB to chase this run (drives the in-water marker)
    pbCrossedAt: 0,                  // performance.now() when the player passed their PB this run (0 = not yet); drives the crossing flash + post-crossing fade-out
    deathFlashUntil: 0,
    lastScoreUpdate: 0,
    holding: false,         // is the player currently holding to extend a jump?
    jumpHoldStart: 0,       // performance.now() of current jump's start
    lastHazardTier: null as 'small' | 'medium' | 'large' | null,
    speedMult: 1,           // smoothed effective scroll multiplier (current slowdown eases in/out)
    beaconsSmashed: 0,      // grounded beacons smashed this run (lifetime stat)
  })

  const [uiState, setUiState] = useState<GameState>('ready')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(initialBestDistance)
  // Stamped to performance.now() the frame the player crosses their PB.
  // Drives the brief "New Best" pulse near the score readout — the
  // in-world pennant was removed because it competed with the obstacle
  // lane (players reported it was distracting). Auto-clears after 1.2s.
  const [newBestStamp, setNewBestStamp] = useState(0)
  // Player's current rank + gap to the next position. Initialised from
  // the server-rendered prop and refreshed after every wreck so a new
  // PB that lifts the player past someone is reflected on the very
  // next wreck modal, not a page refresh later.
  const [rank, setRank] = useState<PlayerTideRunRank | null>(initialRank)
  // Tide Champion contest win — the server returns wonTideChampion on the
  // first run to cross 500m. Fires the shared podium celebration toast
  // (same one the fishing milestones use); a targeted mail with the prize
  // details lands server-side at the same moment.
  const [podiumNotif, setPodiumNotif] = useState<PodiumNotif | null>(null)
  const [deadCount, setDeadCount] = useState(0)   // wreck-screen count-up
  // Per-run beacon doubloon reward. Set optimistically the moment
  // the wreck modal appears (beacons * 2 client-side) so the modal
  // doesn't resize when the server reply lands a few hundred ms later.
  const [beaconReward, setBeaconReward] = useState<{ doubloons: number } | null>(null)
  // Floating "+N coin" animation that visualizes the doubloons
  // traveling up toward the Nav balance. Fires on a short delay
  // after the wreck modal appears, synchronized with the Nav
  // counter tick (doubloons-changed dispatch — see pendingNavTotalRef).
  const [flyingPayout, setFlyingPayout] = useState<{ key: number; amount: number } | null>(null)
  // Server-confirmed total held until the float fires, so the Nav
  // tick lands at the exact moment the phantom +N starts its
  // journey (instead of the dispatch firing whenever the server
  // happens to reply).
  const pendingNavTotalRef = useRef<number | null>(null)
  const [showTour, setShowTour] = useState(false)

  // First-time tour: show modal on mount if the player hasn't seen it.
  // Persistence is server-side (profiles.has_seen_tide_run_tour) so it's
  // per-account, not per-device — see closeTour below.
  useEffect(() => {
    if (!hasSeenTour) setShowTour(true)
  }, [hasSeenTour])

  // Kill iOS double-tap-to-zoom + text selection page-wide WHILE Tide Run is
  // mounted. The viewport's user-scalable=no is ignored by iOS Safari, and the
  // game surface's touch-action only covers taps that land on it — fast taps
  // that miss (edges / overlays) fall through to the page and zoom/select.
  // touch-action:manipulation on <html> disables the double-tap-zoom gesture
  // everywhere (keeps pan/scroll, so overscroll bounce is untouched); the
  // selection props stop the highlight. Reverted on unmount.
  useEffect(() => {
    const root = document.documentElement
    const prevTouch = root.style.touchAction
    const prevSelect = root.style.userSelect
    const prevWebkit = root.style.getPropertyValue('-webkit-user-select')
    root.style.touchAction = 'manipulation'
    root.style.userSelect = 'none'
    root.style.setProperty('-webkit-user-select', 'none')
    return () => {
      root.style.touchAction = prevTouch
      root.style.userSelect = prevSelect
      root.style.setProperty('-webkit-user-select', prevWebkit)
    }
  }, [])

  function closeTour() {
    setShowTour(false)
    startTransition(() => { void adapter.markTourSeen() })
  }

  // "New Best" pulse — show for 1.2s after the player crosses their PB,
  // then clear so AnimatePresence can fade it out.
  useEffect(() => {
    if (newBestStamp === 0) return
    const t = setTimeout(() => setNewBestStamp(0), 1200)
    return () => clearTimeout(t)
  }, [newBestStamp])

  // Keep the in-water PB marker driven off a ref (render() is []-memoized,
  // so reading highScore state directly would go stale across retries).
  useEffect(() => { gRef.current.pbMeters = highScore }, [highScore])

  // Wreck-screen distance count-up (0 → score, ~620ms ease-out). Lands
  // on a 1-decimal final value so the count-up actually shows the
  // fractional meters as it ticks ("0.0 → 324.4") rather than rounding
  // the eased samples to an integer mid-animation and then jumping
  // ".4" at the very end.
  useEffect(() => {
    if (uiState !== 'dead' || score <= 0) { setDeadCount(0); return }
    let raf = 0
    const start = performance.now()
    const DUR = 620
    const tick = (t: number) => {
      const f = Math.min(1, (t - start) / DUR)
      const eased = 1 - Math.pow(1 - f, 3)
      setDeadCount(Math.round(score * eased * 10) / 10)
      if (f < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [uiState, score])

  // Reset reward feedback when a new run starts so the wreck screen
  // doesn't show last run's payout on this run's first frame.
  useEffect(() => {
    if (uiState === 'playing') {
      setBeaconReward(null)
    }
  }, [uiState])

  // Auto-award beacon doubloons on every wreck. Two beats:
  //   1. Set the reward state OPTIMISTICALLY the moment the wreck
  //      screen appears (beacons × 2, the same math the server runs).
  //      This means the modal renders at its final size on the first
  //      frame — no late pop-in that would resize the modal when the
  //      server reply lands a few hundred ms later.
  //   2. In the background, fire the server action to actually credit
  //      the doubloons. If it succeeds, dispatch doubloons-changed so
  //      the Nav balance ticks up in sync with the floating reward
  //      animation. If it errors, the player has already seen the
  //      number — the audit row + the credit didn't land, but they'll
  //      get more on the next run.
  // THE RUN'S TOKEN. Minted server-side when a run opens and spent by its
  // payout, so one run pays once — replaying the reward call finds it consumed.
  // A ref, not state: nothing renders from it and a re-render mid-run must not
  // disturb it. Cleared on spend so a stale token can never ride a second run.
  const runTokenRef = useRef<string | null>(null)
  const openRunToken = useCallback(() => {
    runTokenRef.current = null
    // Fire and forget — the run starts on the tap, never waiting on the network.
    // If it never arrives the payout falls back to the capped path rather than
    // costing the player their run.
    void adapter.startRun().then(t => { runTokenRef.current = t }).catch(() => {})
  }, [adapter])

  const beaconsThisRun = gRef.current.beaconsSmashed
  useEffect(() => {
    if (uiState !== 'dead') return
    if (beaconReward !== null) return
    const optimistic = adapter.hasEconomy ? beaconsThisRun * 2 : 0
    setBeaconReward({ doubloons: optimistic })
    // NO EARLY RETURN ON ZERO BEACONS any more. This used to be the beacon
    // payout and could skip a beaconless run; it is the whole run's SETTLE now
    // and carries the distance, so skipping it would drop the personal best of
    // every run that never met a beacon.
    let cancelled = false
    void (async () => {
      try {
        const spentToken = runTokenRef.current
        runTokenRef.current = null
        // ONE call: stats, beacon payout and personal best, validated together
        // against one token. Three separate calls could not guard the distance,
        // because a run mints one token and only one caller can spend it.
        const result = await adapter.settleRun({
          distance: Math.round(gRef.current.distance * 10) / 10,
          beacons: beaconsThisRun,
          token: spentToken,
        })
        if (result) {
          if (result.wonTideChampion) setPodiumNotif({ category: 'Tide Champion', position: 1 })
          void getPlayerTideRunRank().then(r => { if (r) setRank(r) }).catch(() => {})
          // Stash + dispatch happen unconditionally even if `cancelled`
          // is true. The cleanup that sets cancelled=true fires as soon
          // as beaconReward changes (which the effect itself triggers
          // via setBeaconReward above) — so cancelled is true within a
          // frame of this async call starting, long before the server
          // responds. The original `if (cancelled) return` here meant
          // the dispatch was effectively never reached. Both ops below
          // are safe outside the React tree (ref + window event), so
          // dropping the guard fixes the "Nav doesn't update" bug
          // without risking a state-update-on-unmount warning.
          if (result.doubloons > 0) {
            pendingNavTotalRef.current = result.newDoubloonTotal
            if (typeof window !== 'undefined') {
              try { window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloonTotal })) } catch {}
            }
          }
        }
      } catch {
        /* best-effort */
      }
    })()
    return () => { cancelled = true }
  }, [uiState, beaconsThisRun, beaconReward, adapter])

  // Fire the floating "+N coin" animation ~350ms after the wreck
  // modal appears (so the player reads the static block first), and
  // dispatch doubloons-changed at the same beat so the Nav counter
  // starts ticking exactly when the phantom begins its rise. Reset
  // on new run.
  useEffect(() => {
    if (uiState !== 'dead') { setFlyingPayout(null); return }
    if (!beaconReward || beaconReward.doubloons <= 0) return
    const t = setTimeout(() => {
      setFlyingPayout({ key: Date.now(), amount: beaconReward.doubloons })
      if (pendingNavTotalRef.current != null && typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: pendingNavTotalRef.current })) } catch {}
        pendingNavTotalRef.current = null
      }
    }, 350)
    return () => clearTimeout(t)
  }, [uiState, beaconReward])

  // ── Load sprite ────────────────────────────────────────────────────────────
  // The high score is server-authoritative — passed in as initialBestDistance.
  // We no longer backfill from localStorage on mount (it would undo admin resets).
  useEffect(() => {
    const img = new Image()
    // The equipped boat. Every boat shares the original's proportions, so the
    // sprite swaps without touching SHIP_ASPECT or the hitbox it feeds.
    img.src = tideRunBoat(boatId).image ?? '/boatrun.png'
    img.onload = () => { shipImgRef.current = img }
  }, [boatId])   // reload when the captain equips a different boat

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapperRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    // WORLD-UNITS PER PHYSICAL PIXEL. Fold the virtual scale into the transform
    // alongside dpr, so everything drawn in world units lands at the right pixel
    // and the visible width is exactly VIRTUAL_W on every device.
    const k = rect.width / VIRTUAL_W
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0)
      // High-quality image scaling for the boat sprite on sub-pixel positions
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
    }
    const g = gRef.current
    // Width is pinned; height follows the device aspect, in the same world units
    // (so a taller phone sees more sky/sea below, never more world AHEAD).
    g.cw = VIRTUAL_W
    g.ch = rect.height / k
    g.shipH = Math.min(g.ch, SHIP_SIZING_REF_H) * SHIP_HEIGHT_PCT
    g.shipW = g.shipH * SHIP_ASPECT
    if (g.state === 'ready') {
      // Park the ship sitting on the sea surface at its screen x
      const cx = g.cw * SHIP_X_RATIO + g.shipW / 2
      const wy = seaSurfaceY(cx + g.scrollX, g.ch, 0)
      g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
      g.airborne = false
    }
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    // VISUAL VIEWPORT TOO. The wrapper is sized in CSS off 100dvh, but the
    // canvas's pixel size only changes when resize() runs. Opening a
    // full-screen scrollable sheet collapses the mobile URL bar, which moves
    // dvh and reflows the wrapper — and iOS frequently reports that on
    // visualViewport WITHOUT firing a window resize. Listening to only the
    // window left the canvas at its old size inside a shorter box: the whole
    // scene shifted up and the page behind showed through underneath it.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    vv?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      vv?.removeEventListener('resize', resize)
    }
  }, [resize])

  // Belt and braces: re-measure whenever a full-screen sheet closes. The
  // viewport can settle a frame or two AFTER the overlay unmounts, so the
  // listener above can miss the final step — and a stale canvas is the one
  // thing a player definitely notices, because the sea stops meeting the sky.
  useEffect(() => {
    if (lockerOpen || justUnlocked.length || justUnlockedSeas.length) return
    const id = requestAnimationFrame(() => resize())
    return () => cancelAnimationFrame(id)
  }, [lockerOpen, justUnlocked.length, justUnlockedSeas.length, resize])

  // ── Reset game ─────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const g = gRef.current
    g.scrollX = 0
    g.speed = BASE_SPEED
    g.elapsed = 0
    g.hazards = []
    g.currents = []
    g.shoals = []
    g.beacons = []
    g.lastSpawnType = null
    g.detectingUntil = 0
    g.detectingBeaconX = 0
    g.pitch = 0
    g.wake = []
    g.wakeNextEmitX = 0
    g.splashes = []
    g.debris = []
    g.smashRings = []
    g.hitstopUntil = 0
    g.shakeUntil = 0
    g.shakeMag = 0
    g.shakeDur = 0
    g.sparkles = []
    g.sparkleNextEmit = 0
    g.nextSpawnAt = HAZARD_WARMUP
    g.distance = 0
    g.beaconsSmashed = 0
    g.pbCrossedAt = 0
    setNewBestStamp(0)
    g.deathFlashUntil = 0
    g.lastScoreUpdate = 0
    g.shipVy = 0
    g.airborne = false
    g.holding = false
    g.jumpHoldStart = 0
    g.lastHazardTier = null
    g.speedMult = 1
    // Land ship on the sea at its screen x
    const cx = g.cw * SHIP_X_RATIO + g.shipW / 2
    const wy = seaSurfaceY(cx + g.scrollX, g.ch, 0)
    g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
  }, [])

  // ── Press / release handlers ───────────────────────────────────────────────
  const onPress = useCallback(() => {
    const g = gRef.current
    if (g.state === 'ready') {
      // Heavy audio init runs HERE (inside the user gesture) so iOS
      // allows the AudioContext + the silent session keeper to start.
      // The global primer only does a light context-resume now;
      // anchoring the keeper to "player just tapped to start tide
      // run" means iOS's Now Playing widget is only armed while the
      // player is actually inside this game.
      unlockTideRunAudio()
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
      openRunToken()
      return
    }
    if (g.state === 'dead') {
      if (performance.now() < g.deathFlashUntil + 350) return
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
      openRunToken()
      return
    }
    if (g.state === 'playing' && !g.airborne) {
      // Start a jump — initial impulse + open the hold window
      g.shipVy = -JUMP_IMPULSE
      g.airborne = true
      g.holding = true
      g.jumpHoldStart = performance.now()
      // Takeoff splash: ~4 droplets erupt from the boat's foot on the
      // very next frame so the player sees something move *before* the
      // boat's Y has visibly integrated the impulse. Without this, the
      // first frame after a tap is nearly indistinguishable from the
      // last frame before it (impulse is in shipVy but the dt * vy
      // distance is only ~10 px) and the jump reads as 50ms late.
      const shipScreenX = g.cw * SHIP_X_RATIO
      const surfaceY = seaSurfaceY(shipScreenX + g.shipW / 2 + g.scrollX, g.ch, g.scrollX)
      for (let i = 0; i < 4; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2
        const speed = 40 + Math.random() * 60
        g.splashes.push({
          worldX: shipScreenX + g.shipW / 2 + g.scrollX + (Math.random() - 0.5) * g.shipW * 0.45,
          y: surfaceY,
          vx: Math.cos(angle) * speed * 0.7,
          vy: Math.sin(angle) * speed * 0.7,
          age: 0,
        })
      }
    }
  }, [reset])

  const onRelease = useCallback(() => {
    const g = gRef.current
    g.holding = false
  }, [])

  // ── Spawn one surface hazard ──────────────────────────────────────────────
  // Each spawn slot picks either a rock (with tier) or a shoal. Tier is
  // gated by distance so early game is forgiving. Shoal widths auto-scale
  // with current speed so the game can never spawn an unclearable one.
  const spawnHazard = useCallback(() => {
    const g = gRef.current
    const distance = g.distance

    // Base spacing scaled by speed (time-based floor for fairness)
    const baseSpacing = Math.max(HAZARD_SPAWN_SPACING, g.speed * MIN_REACTION_TIME_SEC)
    // Per-spawn jitter: 0–60 world px (= 0–1 meter) added on top of
    // baseSpacing wherever we ADVANCE nextSpawnAt. Without it, hazards
    // land on exact 360 px / 6 m intervals and every crash happens at
    // the same fractional offset (so wreck scores cluster on the same
    // 0.X decimal). The reaction-time floors in baseSpacing + the
    // mid/large rock buffers (medBuffer / lrgBuffer) still apply — this
    // only ever WIDENS the gap, never shortens it.
    const spawnAdvance = baseSpacing + Math.random() * 60

    // ── Maybe spawn a beacon (looks like a rock, kills you if you jump) ──
    const canBeacon = distance > BEACON_WARMUP_M && g.lastSpawnType !== 'beacon'
    if (canBeacon && Math.random() < BEACON_CHANCE) {
      // Small or medium size only (large ones would be too obvious as traps)
      const isSmall = Math.random() < 0.55
      const height = isSmall ? g.ch * 0.035 : g.ch * 0.075
      const width = isSmall ? g.cw * 0.06 : g.cw * 0.085
      // After-rock buffer — player must be able to land before reaching it
      if (g.lastSpawnType === 'rock') {
        const minBuffer = g.speed * BEACON_AFTER_ROCK_TIME_SEC
        if (baseSpacing < minBuffer) g.nextSpawnAt += (minBuffer - baseSpacing)
      }
      g.beacons.push({ x: g.nextSpawnAt, width, height, shatteredAt: 0 })
      g.nextSpawnAt += spawnAdvance
      g.lastSpawnType = 'beacon'
      return
    }

    // ── Maybe spawn a shoal (or cluster of shoals) instead of a rock ──
    const canShoal = distance > SHOAL_WARMUP_M && g.lastSpawnType !== 'shoal'
    if (canShoal && Math.random() < SHOAL_CHANCE) {
      // Full-hold airtime ≈ 0.85s; shoal width is a fraction of that distance.
      const fullHoldDistance = g.speed * 0.85
      const maxClearableWidth = Math.min(fullHoldDistance * SHOAL_CLEARANCE_FRACTION, g.cw * 0.55)
      if (maxClearableWidth > SHOAL_MIN_WIDTH) {
        // After a rock, the player needs time to land + react before they can
        // jump again to clear the shoal.
        if (g.lastSpawnType === 'rock') {
          const minBuffer = g.speed * SHOAL_AFTER_ROCK_TIME_SEC
          if (baseSpacing < minBuffer) g.nextSpawnAt += (minBuffer - baseSpacing)
        }

        // Sweep out any currents placed by the previous rock-spawn that
        // sit too close to where this shoal will land. The boat exits a
        // current still recovering speed (over ~1s); a wide shoal right
        // after that would be unclearable.
        //
        // IMPORTANT: only sweep currents that haven't entered the
        // viewport yet. The spawner runs ahead of the boat (lookahead
        // ≈ one canvas-width — see the spawnHazard while-loop below).
        // A current placed for an earlier hazard can be on-screen by
        // the time a later iteration of that loop picks "shoal" — if
        // we delete it then, the foam patch the player is steering
        // around vanishes mid-frame. Visible currents stay; the
        // currentBeforeShoal narrow-shoal fallback (just below) keeps
        // the encounter fair.
        const shoalStartX = g.nextSpawnAt
        const minCurrentGap = g.cw * 0.32
        const viewportRight = g.scrollX + g.cw
        g.currents = g.currents.filter(c => {
          if (c.x < viewportRight) return true                     // already visible — never yank
          return (c.x + c.width + minCurrentGap) < shoalStartX     // off-screen — safe to drop
        })

        // A current that survived the overlap-sweep can still sit close
        // enough that the boat reaches the shoal before its speed has
        // recovered from the slowdown (~CURRENT_RECOVERY_SEC of travel).
        // A long or cluster shoal there is unclearable while still slowed,
        // so when one is in that window force a single, narrow, always
        // tap-clearable shoal.
        const recoveryDist = g.speed * CURRENT_RECOVERY_SEC
        const currentBeforeShoal = g.currents.some(
          c => c.x + c.width > shoalStartX - recoveryDist && c.x + c.width <= shoalStartX,
        )

        // Cluster vs single: clusters introduce the "narrow rooftop" precision
        // mechanic — multiple shoals with safe-landing strips between them.
        const wantCluster = !currentBeforeShoal && distance > SHOAL_CLUSTER_WARMUP_M && Math.random() < SHOAL_CLUSTER_CHANCE
        if (wantCluster) {
          const count = SHOAL_CLUSTER_MIN_COUNT +
            Math.floor(Math.random() * (SHOAL_CLUSTER_MAX_COUNT - SHOAL_CLUSTER_MIN_COUNT + 1))
          // Cap member width to leave headroom for the safe-gap landings
          const memberMax = Math.min(SHOAL_CLUSTER_MEMBER_MAX_PX, maxClearableWidth * 0.6)
          let curX = shoalStartX
          for (let i = 0; i < count; i++) {
            const w = SHOAL_CLUSTER_MEMBER_MIN_PX +
              Math.random() * Math.max(0, memberMax - SHOAL_CLUSTER_MEMBER_MIN_PX)
            g.shoals.push({ x: curX, width: w })
            curX += w
            if (i < count - 1) {
              const gap = SHOAL_CLUSTER_SAFE_GAP_MIN_PX +
                Math.random() * (SHOAL_CLUSTER_SAFE_GAP_MAX_PX - SHOAL_CLUSTER_SAFE_GAP_MIN_PX)
              curX += gap
            }
          }
          g.nextSpawnAt = curX + spawnAdvance
        } else {
          // Single shoal — kept narrow if it follows a current still
          // slowing the boat, else random up to the clearable max.
          const wpWidth = currentBeforeShoal
            ? SHOAL_MIN_WIDTH
            : SHOAL_MIN_WIDTH + Math.random() * (maxClearableWidth - SHOAL_MIN_WIDTH)
          g.shoals.push({ x: shoalStartX, width: wpWidth })
          g.nextSpawnAt += wpWidth + spawnAdvance
        }

        g.lastSpawnType = 'shoal'
        return
      }
      // else: too slow to clear even the min — fall through and spawn a rock
    }

    const r = Math.random()

    let tier: 'small' | 'medium' | 'large'
    if (distance < TIER_SMALL_ONLY_M) {
      tier = 'small'
    } else if (distance < TIER_NO_LARGE_M) {
      tier = r < 0.55 ? 'small' : 'medium'
    } else {
      if (r < 0.40) tier = 'small'
      else if (r < 0.75) tier = 'medium'
      else tier = 'large'
    }

    // Never spawn two large rocks in a row — the gap can be unclearable at
    // mid speeds (boat lands a hair before the second rock arrives but can't
    // reach 80px of clearance in time). Demote to medium when this would happen.
    if (tier === 'large' && g.lastHazardTier === 'large') {
      tier = 'medium'
    }

    // Large rocks on a wave crest are unfair: the boat launches from a lower
    // surface point and has to clear (waveDiff + rockHeight), eating most of
    // the jump margin. Only allow large rocks where the local wave is at or
    // below sea level (troughs and down-slopes). Crest-side spawns → medium.
    if (tier === 'large') {
      const probableX = g.nextSpawnAt + APPROACH_BUFFER_LRG + g.cw * 0.105 / 2
      const surfaceAtRock = seaSurfaceY(probableX, g.ch, g.scrollX)
      const baseY = g.ch * SEA_BASE_Y_PCT
      if (surfaceAtRock < baseY - g.ch * 0.015) {
        tier = 'medium'
      }
    }
    g.lastHazardTier = tier

    let height: number, width: number
    if (tier === 'small') {
      height = g.ch * 0.035
      width = g.cw * 0.06
    } else if (tier === 'medium') {
      height = g.ch * 0.075
      width = g.cw * 0.085
    } else {
      height = g.ch * 0.115
      width = g.cw * 0.105
    }

    // Spacing scales with current speed past a threshold so the time between
    // hazards never drops below MIN_REACTION_TIME_SEC.
    const medBuffer = Math.max(APPROACH_BUFFER_MED, g.speed * MED_EXTRA_TIME_SEC)
    const lrgBuffer = Math.max(APPROACH_BUFFER_LRG, g.speed * LRG_EXTRA_TIME_SEC)

    // Push this hazard further out if it's a hard one — gives reaction time
    if (tier === 'medium') g.nextSpawnAt += medBuffer
    else if (tier === 'large') g.nextSpawnAt += lrgBuffer

    const hazardX = g.nextSpawnAt
    g.hazards.push({ x: hazardX, width, height })
    g.nextSpawnAt += spawnAdvance
    g.lastSpawnType = 'rock'

    // Maybe drop a current in the gap before the NEXT hazard.
    // Place it well clear of both this hazard and the next so it never overlaps.
    if (distance > CURRENT_WARMUP_M && Math.random() < CURRENT_CHANCE) {
      const cw = g.cw * (CURRENT_WIDTH_MIN + Math.random() * (CURRENT_WIDTH_MAX - CURRENT_WIDTH_MIN))
      const gapStart = hazardX + width + g.cw * 0.05         // 5% of cw past this hazard
      const gapEnd = g.nextSpawnAt - g.cw * 0.05              // 5% of cw before next hazard
      if (gapEnd - gapStart > cw) {
        const cx = gapStart + Math.random() * (gapEnd - gapStart - cw)
        g.currents.push({ x: cx, width: cw })
      }
    }
  }, [])

  // ── Surface hazard collision ──────────────────────────────────────────────
  // The drawn rock has a wider base (the anchor flare) and a much narrower
  // spike above the surface. Use only the visible spike's x-range for
  // collision so grazing past the visual edges doesn't trigger a death.
  const ROCK_COLLISION_LEFT_PCT  = 0.22  // % of width before collision starts
  const ROCK_COLLISION_RIGHT_PCT = 0.18  // % of width past which no collision

  const collidesWithHazard = useCallback((shipScreenX: number) => {
    const g = gRef.current
    const hx = shipScreenX + g.shipW * HITBOX_INSET.left
    const hy = g.shipY + g.shipH * HITBOX_INSET.top
    const hw = g.shipW * (1 - HITBOX_INSET.left - HITBOX_INSET.right)
    const hbot = hy + g.shipH * (1 - HITBOX_INSET.bottom - HITBOX_INSET.top)

    for (const obs of g.hazards) {
      const colLeft = obs.x + obs.width * ROCK_COLLISION_LEFT_PCT
      const colRight = obs.x + obs.width * (1 - ROCK_COLLISION_RIGHT_PCT)
      const ox = colLeft - g.scrollX
      const cw = colRight - colLeft
      if (ox + cw < hx) continue
      if (ox > hx + hw) break
      const hazardSurfaceY = seaSurfaceY(obs.x + obs.width / 2, g.ch, g.scrollX)
      const hazardTop = hazardSurfaceY - obs.height
      // Collide if boat's hitbox bottom is below hazard's top
      if (hbot > hazardTop) return true
    }
    return false
  }, [])

  // ── Step ──────────────────────────────────────────────────────────────────
  const step = useCallback((dt: number) => {
    const g = gRef.current

    // Detection flash in progress: freeze gameplay, wait it out, then wreck.
    if (g.detectingUntil > 0) {
      if (performance.now() >= g.detectingUntil) {
        g.detectingUntil = 0
        g.state = 'dead'
        g.deathFlashUntil = performance.now() + 250
        setUiState('dead')
        // 1-decimal precision: wreck score (.toFixed(1) on display) +
        // server PB. Cumulative lifetime stat stays integer (see floor below).
        const finalMeters = Math.round(g.distance * 10) / 10
        // setScore with the precise final value so the wreck-screen
        // count-up animates to the right decimal. Without this, the
        // earlier setScore(Math.floor(g.distance)) at detection time
        // (in the rock-collision branch below) would leave `score`
        // stuck at an integer and every beacon death would display .0.
        setScore(finalMeters)
        // Stats, payout and personal best are all settled ONCE, from the
        // death effect, against this run's token. Firing them here as well
        // would be a second unguarded path to the same writes.
        if (finalMeters > highScore) {
          // BOATS EARNED BY THIS RUN, worked out from the distance the PB
          // crossed rather than from a server round trip — the wreck screen
          // should be showing the prize before the network has finished
          // agreeing. A single run can cross several thresholds, so this is a
          // list. Equipping is what the overlay does on dismiss.
          const earned = boatsUnlockedBetween(highScore, finalMeters)
          if (earned.length) setJustUnlocked(earned)
          const earnedSeas = seasUnlockedBetween(highScore, finalMeters)
          if (earnedSeas.length) setJustUnlockedSeas(earnedSeas)
          setHighScore(finalMeters)
        }
      }
      return
    }

    if (g.state !== 'playing') return

    g.elapsed += dt
    g.speed = Math.min(BASE_SPEED + SPEED_RAMP * g.elapsed, MAX_SPEED)

    const shipScreenX = g.cw * SHIP_X_RATIO
    const cx = shipScreenX + g.shipW / 2

    // Effective scroll speed eases in/out of currents — asymmetric so the boat
    // gets grabbed fast but re-accelerates gradually (water resistance).
    let targetMult = 1
    if (!g.airborne) {
      const boatWorldX = shipScreenX + g.scrollX
      for (const c of g.currents) {
        if (boatWorldX >= c.x && boatWorldX <= c.x + c.width) {
          targetMult = CURRENT_SPEED_MULT
          break
        }
      }
    }
    const rate = targetMult < g.speedMult ? CURRENT_ENTER_RATE : CURRENT_EXIT_RATE
    const k = 1 - Math.exp(-rate * dt)
    g.speedMult += (targetMult - g.speedMult) * k
    g.scrollX += g.speed * g.speedMult * dt
    g.distance = g.scrollX * METERS_PER_PIXEL

    const surfaceY = seaSurfaceY(cx + g.scrollX, g.ch, g.scrollX)

    if (g.airborne) {
      // Variable-height jump: reduced gravity while the player is holding,
      // up to JUMP_MAX_HOLD_SEC and only while still rising.
      let gravityNow = GRAVITY
      if (g.holding && g.shipVy < 0) {
        const heldFor = (performance.now() - g.jumpHoldStart) / 1000
        if (heldFor < JUMP_MAX_HOLD_SEC) {
          gravityNow = GRAVITY * JUMP_HOLD_GRAVITY_MULT
        } else {
          g.holding = false
        }
      }
      g.shipVy += gravityNow * dt
      g.shipY += g.shipVy * dt

      // Land when falling onto surface
      if (g.shipVy >= 0) {
        const hitboxBottom = g.shipY + g.shipH * (1 - HITBOX_INSET.bottom)
        if (hitboxBottom >= surfaceY) {
          // Landing splash — burst of droplets from the landing point
          const landingVy = g.shipVy
          const splashCount = Math.max(4, Math.min(10, Math.round(landingVy / 110)))
          for (let i = 0; i < splashCount; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
            const speed = 70 + Math.random() * 100
            g.splashes.push({
              worldX: shipScreenX + g.shipW / 2 + g.scrollX + (Math.random() - 0.5) * g.shipW * 0.3,
              y: surfaceY,
              vx: Math.cos(angle) * speed * 0.5,
              vy: Math.sin(angle) * speed,
              age: 0,
            })
          }
          g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
          g.shipVy = 0
          g.airborne = false
          // Splash SFX — fires the instant the boat touches back down,
          // in sync with the spray particles. Volume is baked into the
          // asset; per-jump intensity scaling via Web Audio gain caused
          // iOS PWA to mute ALL tide-run SFX (best guess: a very-low
          // gain node demoted the session to ambient).
          playSplashSfx()
          // Holding through a landing doesn't auto-jump; require a release+press
          g.holding = false
        }
      }
    } else {
      // Grounded — locked to wave surface (Canabalt-style auto-run)
      g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
      g.shipVy = 0

      // Emit wake foam at the bow — particles are anchored in world, so as
      // the boat moves forward (world scrolls), each particle drifts back
      // relative to the boat: bright spray right at the bow, then trailing
      // foam under and behind the stern.
      while (g.scrollX >= g.wakeNextEmitX) {
        const bowWorldX = g.wakeNextEmitX + shipScreenX + g.shipW * WAKE_BOW_OFFSET
        g.wake.push({
          worldX: bowWorldX,
          y: surfaceY + 1,
          age: 0,
        })
        // Second particle slightly off the centerline for a fanned look
        g.wake.push({
          worldX: bowWorldX - 4,
          y: surfaceY + 2.5,
          age: 0,
        })
        g.wakeNextEmitX += WAKE_EMIT_DISTANCE
      }
    }

    // Age + prune particles
    for (const p of g.wake) p.age += dt
    if (g.wake.length > 0 && g.wake[0].age > WAKE_MAX_AGE_SEC) {
      g.wake = g.wake.filter(p => p.age < WAKE_MAX_AGE_SEC)
    }
    for (const p of g.splashes) {
      p.age += dt
      p.worldX += p.vx * dt
      p.y += p.vy * dt
      p.vy += SPLASH_GRAVITY * dt
    }
    if (g.splashes.length > 0 && g.splashes[0].age > SPLASH_MAX_AGE_SEC) {
      g.splashes = g.splashes.filter(p => p.age < SPLASH_MAX_AGE_SEC)
    }
    for (const d of g.debris) {
      d.age += dt
      d.worldX += d.vx * dt
      d.y += d.vy * dt
      d.vy += DEBRIS_GRAVITY * dt
      d.rot += d.vr * dt
    }
    if (g.debris.length > 0 && g.debris[0].age > DEBRIS_MAX_AGE_SEC) {
      g.debris = g.debris.filter(d => d.age < DEBRIS_MAX_AGE_SEC)
    }
    for (const r of g.smashRings) r.age += dt
    if (g.smashRings.length > 0) {
      g.smashRings = g.smashRings.filter(r => r.age < SMASH_RING_DUR_SEC)
    }
    // Sparkles: age + prune; ambient specular highlights drifting on the sea
    for (const p of g.sparkles) p.age += dt
    if (g.sparkles.length > 0) {
      g.sparkles = g.sparkles.filter(s => s.age < s.life)
    }
    // Emit a new sparkle every 180-360ms at a random surface position
    const nowMs = performance.now()
    if (nowMs > g.sparkleNextEmit && g.cw > 0) {
      const screenX = 40 + Math.random() * (g.cw - 80)
      const surfY = seaSurfaceY(screenX + g.scrollX, g.ch, g.scrollX)
      g.sparkles.push({
        worldX: screenX + g.scrollX,
        y: surfY,
        age: 0,
        life: 0.45 + Math.random() * 0.35,
      })
      g.sparkleNextEmit = nowMs + 180 + Math.random() * 180
    }

    // Hazard spawn + prune
    while (g.nextSpawnAt < g.scrollX + g.cw * 1.05) spawnHazard()
    while (g.hazards.length > 0 && g.hazards[0].x + g.hazards[0].width < g.scrollX) {
      g.hazards.shift()
    }
    while (g.currents.length > 0 && g.currents[0].x + g.currents[0].width < g.scrollX) {
      g.currents.shift()
    }
    while (g.shoals.length > 0 && g.shoals[0].x + g.shoals[0].width < g.scrollX) {
      g.shoals.shift()
    }
    while (g.beacons.length > 0 && g.beacons[0].x + g.beacons[0].width < g.scrollX) {
      g.beacons.shift()
    }

    // Death checks
    let dead = false
    const boatWorldX = shipScreenX + g.scrollX

    if (collidesWithHazard(shipScreenX)) {
      dead = true
    } else if (!g.airborne) {
      // Grounded inside a shoal = die. Uses the boat's CENTER point
      // ("where is the boat standing") rather than the sprite's left
      // edge — left-edge was offset by ~one boat width and didn't
      // match what the player visually expected to be "on the shoal".
      const boatCenterWorldX = shipScreenX + g.shipW / 2 + g.scrollX
      for (const wp of g.shoals) {
        if (boatCenterWorldX >= wp.x && boatCenterWorldX <= wp.x + wp.width) {
          dead = true
          break
        }
      }
    }

    // Beacons: airborne over an intact beacon = detected → die (after the
    // detection beam plays). Grounded = smash through, mark shatteredAt for
    // the satisfying break-apart animation.
    if (!dead) {
      // Fire on first bow contact with the beacon's footprint — not when the
      // ship's *left edge* finally enters its span (that let the whole hull
      // pass through before it cracked). Mirrors the rock hitbox test.
      const shipHitL = shipScreenX + g.shipW * HITBOX_INSET.left
      const shipHitR = shipScreenX + g.shipW * (1 - HITBOX_INSET.right)
      for (const cr of g.beacons) {
        if (cr.shatteredAt > 0) continue
        const bL = cr.x - g.scrollX
        const bR = cr.x + cr.width - g.scrollX
        if (bR < shipHitL || bL > shipHitR) continue
        if (g.airborne) {
          // Detection waits until the ship's *center* is over the beacon so
          // the alarm beam (drawn at the beacon) reads as mid-ship, not at
          // the bow. Until then leave it intact and re-check next frame.
          const shipCenterWorldX = shipScreenX + g.shipW / 2 + g.scrollX
          const beaconCenterWorldX = cr.x + cr.width / 2
          if (shipCenterWorldX < beaconCenterWorldX) continue
          // Start detection flash — gameplay freezes, beam plays, then death
          g.detectingUntil = performance.now() + BEACON_DETECT_FLASH_SEC * 1000
          g.detectingBeaconX = beaconCenterWorldX
          // Lock in the final score now (distance is frozen during the
          // flash). Pass the float — the live HUD does its own
          // Math.floor for the calm integer ticker, and the wreck-screen
          // deadCount animation needs the precise value so the result
          // doesn't always round down to .0 after a beacon catch.
          setScore(g.distance)
          // Alarm SFX — fires the instant the beacon catches the airborne
          // ship, before the death overlay.
          playBeaconCatchSfx()
          break
        } else {
          const nowMs = performance.now()
          cr.shatteredAt = nowMs
          g.beaconsSmashed++
          // Crash SFX — fires the instant the boat smashes through the
          // grounded beacon, in sync with the debris + ring + shake.
          playBeaconCrashSfx()
          const cx = cr.x + cr.width / 2
          const beaconSurface = seaSurfaceY(cx, g.ch, g.scrollX)
          // Bigger water spray
          for (let i = 0; i < 16; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.0
            const speed = 150 + Math.random() * 140
            g.splashes.push({
              worldX: cx + (Math.random() - 0.5) * cr.width * 0.7,
              y: beaconSurface,
              vx: Math.cos(angle) * speed * 0.7,
              vy: Math.sin(angle) * speed,
              age: 0,
            })
          }
          // Chunky rock debris — this is the part that actually reads as
          // "I just smashed through that". Biased forward by boat momentum.
          for (let i = 0; i < 12; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.7
            const speed = 180 + Math.random() * 220
            g.debris.push({
              worldX: cx + (Math.random() - 0.5) * cr.width * 0.5,
              y: beaconSurface - cr.height * (0.2 + Math.random() * 0.6),
              vx: Math.cos(angle) * speed + 70,
              vy: Math.sin(angle) * speed,
              age: 0,
              rot: Math.random() * Math.PI,
              vr: (Math.random() - 0.5) * 14,
              size: 3 + Math.random() * 5,
            })
          }
          // Amber signal-light pop + brief screen shake + haptic thud.
          g.smashRings.push({ worldX: cx, y: beaconSurface - cr.height * 0.5, age: 0 })
          g.shakeUntil = nowMs + SMASH_SHAKE_MS
          g.shakeMag = 7
          g.shakeDur = SMASH_SHAKE_MS
          // Micro-freeze: the world stops dead for a beat, then the debris
          // erupts as motion resumes — that snap is what sells the hit.
          g.hitstopUntil = nowMs + HITSTOP_MS
          vibrate(40)
        }
      }
    }

    if (dead) {
      // Crash SFX — fires on rock/shoal deaths. Beacon catch deaths go
      // through the detectingUntil → 'dead' path above (which has its
      // own beacon-catch alarm), so they don't double-play.
      playCrashSfx()
      g.state = 'dead'
      g.deathFlashUntil = performance.now() + 250
      // 1-decimal precision on the saved/displayed score; cumulative
      // lifetime stat stays integer.
      const finalMeters = Math.round(g.distance * 10) / 10
      setScore(finalMeters)
      setUiState('dead')
      // Settled once from the death effect — see the note at the other death
      // site. The unlock detection and the local PB stay here because the
      // wreck screen should show them before the network has agreed.
      if (finalMeters > highScore) {
        const earned = boatsUnlockedBetween(highScore, finalMeters)
        if (earned.length) setJustUnlocked(earned)
        const earnedSeas = seasUnlockedBetween(highScore, finalMeters)
        if (earnedSeas.length) setJustUnlockedSeas(earnedSeas)
        setHighScore(finalMeters)
      }
    } else {
      const now = performance.now()
      if (now - g.lastScoreUpdate > 180) {
        g.lastScoreUpdate = now
        setScore(Math.floor(g.distance))
      }
      // PB crossing — fire the "New Best" pulse once per run. Stamped on
      // gRef so the React setter only fires the one frame, not every loop.
      if (g.pbMeters > 0 && g.pbCrossedAt === 0 && g.distance >= g.pbMeters) {
        g.pbCrossedAt = now
        setNewBestStamp(now)
      }
    }

    // ── Near-miss: airborne and *just* skimmed over a rock. One-shot per
    //    rock (obs.nm). A small sensory payoff — sparkles + a faint flash
    //    + a feather shake + soft haptic. No slow-mo (twitch game).
    if (!dead && g.airborne) {
      const hitL = shipScreenX + g.shipW * HITBOX_INSET.left + g.scrollX
      const hitR = shipScreenX + g.shipW * (1 - HITBOX_INSET.right) + g.scrollX
      const hitboxBottom = g.shipY + g.shipH * (1 - HITBOX_INSET.bottom)
      for (const obs of g.hazards) {
        if (obs.nm) continue
        if (obs.x + obs.width < hitL || obs.x > hitR) continue
        const rockTop = seaSurfaceY(obs.x + obs.width / 2, g.ch, g.scrollX) - obs.height
        const clearance = rockTop - hitboxBottom
        if (clearance > 0 && clearance < 16) {
          obs.nm = true
          // Tiny localized sparkle only — no flash / shake / haptic (those
          // read as distracting on a thing that happens constantly).
          const boatCx = shipScreenX + g.shipW / 2 + g.scrollX
          for (let i = 0; i < 3; i++) {
            g.sparkles.push({
              worldX: boatCx + (Math.random() - 0.5) * g.shipW * 0.6,
              y: hitboxBottom - 6 - Math.random() * 10,
              age: 0,
              life: 0.30 + Math.random() * 0.18,
            })
          }
        }
      }
    }

    // Smooth the ship pitch toward its instantaneous target so jumps don't
    // snap-tilt — gives the boat a sense of mass.
    let targetPitch = 0
    if (g.airborne) {
      const raw = g.shipVy * 0.00055
      targetPitch = Math.max(-0.40, Math.min(0.28, raw))
    } else {
      const cxp = shipScreenX + g.shipW / 2 + g.scrollX
      const dxp = 10
      const dyp = seaSurfaceY(cxp + dxp, g.ch, g.scrollX) - seaSurfaceY(cxp - dxp, g.ch, g.scrollX)
      targetPitch = Math.atan2(dyp, dxp * 2)
    }
    const PITCH_LERP_RATE = 12
    const pk = 1 - Math.exp(-PITCH_LERP_RATE * dt)
    g.pitch += (targetPitch - g.pitch) * pk
  }, [spawnHazard, collidesWithHazard, highScore])

  // ── Render ─────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = gRef.current
    const { cw, ch } = g
    if (cw === 0 || ch === 0) return

    // ── Screen shake (beacon smash) — shift only the canvas inside the
    //    clipped wrapper so the chrome stays put. Decays over the window. ──
    const shakeNow = performance.now()
    if (shakeNow < g.shakeUntil) {
      const remain = (g.shakeUntil - shakeNow) / (g.shakeDur || SMASH_SHAKE_MS)
      const amp = g.shakeMag * remain * remain
      const sx = (Math.random() - 0.5) * 2 * amp
      const sy = (Math.random() - 0.5) * 2 * amp
      canvas.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`
    } else if (canvas.style.transform) {
      canvas.style.transform = ''
    }

    // ── Cycle palette (day → dusk → night → dawn) ──
    const pal = currentPalette(g.distance)

    // ── Sky (full canvas — sea path will overpaint below the surface) ──
    // The sky used to hold skyBot flat all the way to the bottom of the canvas.
    // Only the part BELOW the wave line is overpainted by the sea, so the strip
    // between the horizon and the waves stayed pale sky blue against a dark
    // seaTop — which read as a second, lighter ocean sitting behind the real
    // one. The sky now lands on skyBot at the horizon and then runs into seaTop
    // by the wave line, so the water the boat sails on is the only water there
    // is. Below the wave line this gradient is invisible anyway.
    const sky = ctx.createLinearGradient(0, 0, 0, ch)
    sky.addColorStop(0, pal.skyTop)
    sky.addColorStop(0.47, pal.skyBot)
    sky.addColorStop(SEA_BASE_Y_PCT, pal.seaTop)
    sky.addColorStop(1, pal.seaTop)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cw, ch)

    // ── Parallax bands, far to near. Slower = more distant. ──
    drawClouds(ctx, cw, ch, g.scrollX * 0.40, pal.cloud)
    drawFarRidge(ctx, cw, ch, g.scrollX * 0.08, pal.island)       // mountains, slowest
    drawDistantIslands(ctx, cw, ch, g.scrollX * 0.15, pal.island) // isles + lighthouse
    drawSeaStacks(ctx, cw, ch, g.scrollX * 0.28, pal.island)      // rocks near the bow

    // ── Dynamic sea surface ──
    ctx.beginPath()
    ctx.moveTo(0, ch)
    for (let x = 0; x <= cw; x += 4) {
      ctx.lineTo(x, seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }
    ctx.lineTo(cw, ch)
    ctx.closePath()
    const sea = ctx.createLinearGradient(0, ch * SEA_BASE_Y_PCT - 30, 0, ch)
    sea.addColorStop(0, pal.seaTop)
    sea.addColorStop(0.5, pal.seaMid)
    sea.addColorStop(1, pal.seaBot)
    ctx.fillStyle = sea
    ctx.fill()

    // ── Underwater caustics — wavy bright lines drifting independently of
    // scroll, suggests sunlight refracting through the surface. Two layers
    // at different depths and phase rates so they don't look mechanical.
    {
      const t = performance.now() / 1000
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 2; i++) {
        const yOffset = 16 + i * 22
        const phase = t * (0.6 + i * 0.35) + i * 1.7
        const ampX = 0.045 - i * 0.012
        const ampY = 4 - i * 1.5
        ctx.strokeStyle = `rgba(150, 200, 230, ${0.18 - i * 0.05})`
        ctx.lineWidth = 1.2 + i * 0.3
        ctx.beginPath()
        for (let x = 0; x <= cw; x += 6) {
          const surfY = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
          const y = surfY + yOffset + Math.sin(x * ampX + phase) * ampY
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.restore()
    }

    // ── Sub-surface shimmer — a thin lighter band right below the foam line
    // suggests water translucency / shallow depth.
    {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = 'rgba(140, 195, 225, 0.18)'
      ctx.beginPath()
      for (let x = 0; x <= cw; x += 4) {
        const y = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
        if (x === 0) ctx.moveTo(x, y + 1)
        else ctx.lineTo(x, y + 1)
      }
      for (let x = cw; x >= 0; x -= 4) {
        const y = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
        ctx.lineTo(x, y + 6)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // ── Foam crest ──
    // Deliberately faint. At full palette alpha and 2px this was a uniform bright
    // rule from edge to edge, and a line of constant weight across a moving
    // surface reads as drawn rather than as water — the eye takes it for the
    // horizon. The foam CAPS below already mark where foam actually forms, on
    // the peaks, so the continuous line only has to imply a surface and can sit
    // well under them. Scaled with globalAlpha rather than by editing pal.foam,
    // because the caps and the splash particles share that colour and should
    // keep their strength. One stroke, not one per segment: this runs every
    // frame inside the game loop.
    ctx.save()
    ctx.globalAlpha = 0.42
    ctx.strokeStyle = pal.foam
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let x = 0; x <= cw; x += 4) {
      const y = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()

    // ── Foam caps at wave peaks (detects local maxima) ──
    ctx.fillStyle = pal.foam
    for (let x = 12; x <= cw - 12; x += 12) {
      const yL = seaSurfaceY(x - 12 + g.scrollX, ch, g.scrollX)
      const yC = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
      const yR = seaSurfaceY(x + 12 + g.scrollX, ch, g.scrollX)
      // Smaller y = higher on screen = peak
      if (yC < yL - 0.4 && yC < yR - 0.4) {
        ctx.beginPath()
        ctx.ellipse(x, yC + 0.5, 7, 1.8, 0, 0, Math.PI * 2)
        ctx.fill()
        // Small highlight on top of the cap
        ctx.beginPath()
        ctx.ellipse(x - 1, yC - 0.5, 3, 0.9, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ── Ambient surface sparkles ──
    for (const s of g.sparkles) {
      const sx = s.worldX - g.scrollX
      if (sx < -8 || sx > cw + 8) continue
      const t = s.age / s.life
      const alpha = Math.sin(t * Math.PI) * 0.85   // 0 → peak → 0
      const size = 1.0 + Math.sin(t * Math.PI) * 1.4
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(sx, s.y, size, 0, Math.PI * 2)
      ctx.fill()
      // Tiny cross-shaped flash
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.6
      ctx.globalAlpha = alpha * 0.7
      ctx.beginPath()
      ctx.moveTo(sx - size * 2.3, s.y)
      ctx.lineTo(sx + size * 2.3, s.y)
      ctx.moveTo(sx, s.y - size * 2.3)
      ctx.lineTo(sx, s.y + size * 2.3)
      ctx.stroke()
      ctx.restore()
    }

    // ── Wake foam (smooth ribbon: emitted at bow, fades out toward stern) ──
    // Particles are anchored in world; the array is ordered oldest → newest
    // by emission order. Drawing them as a single tapered path produces a
    // continuous foam trail instead of a chain of dots.
    if (g.wake.length >= 2) {
      const oldest = g.wake[0]
      const newest = g.wake[g.wake.length - 1]
      const oldestSx = oldest.worldX - g.scrollX
      const newestSx = newest.worldX - g.scrollX
      const grad = ctx.createLinearGradient(oldestSx, 0, newestSx, 0)
      grad.addColorStop(0, 'rgba(245, 252, 255, 0)')
      grad.addColorStop(0.25, 'rgba(245, 252, 255, 0.35)')
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.85)')
      ctx.fillStyle = grad
      ctx.beginPath()
      // Top edge: oldest (left) → newest (right)
      for (let i = 0; i < g.wake.length; i++) {
        const p = g.wake[i]
        const sx = p.worldX - g.scrollX
        const lifeFrac = p.age / WAKE_MAX_AGE_SEC
        const half = (1.2 + lifeFrac * 3.6) * 0.45     // half-thickness
        const py = p.y + p.age * WAKE_PARTICLE_DRIFT_VY
        if (i === 0) ctx.moveTo(sx, py - half)
        else ctx.lineTo(sx, py - half)
      }
      // Bottom edge: newest (right) → oldest (left)
      for (let i = g.wake.length - 1; i >= 0; i--) {
        const p = g.wake[i]
        const sx = p.worldX - g.scrollX
        const lifeFrac = p.age / WAKE_MAX_AGE_SEC
        const half = (1.2 + lifeFrac * 3.6) * 0.45
        const py = p.y + p.age * WAKE_PARTICLE_DRIFT_VY
        ctx.lineTo(sx, py + half)
      }
      ctx.closePath()
      ctx.fill()
    }

    // ── Persistent bow spray (foam at the boat's cutting point) ──
    if (!g.airborne) {
      const bowScreenX = cw * SHIP_X_RATIO + g.shipW * WAKE_BOW_OFFSET
      const bowSurfY = seaSurfaceY(bowScreenX + g.scrollX, ch, g.scrollX)
      const sprayPulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.012)
      // Main waterline foam
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * sprayPulse})`
      ctx.beginPath()
      ctx.ellipse(bowScreenX, bowSurfY + 1, 6, 1.7, 0, 0, Math.PI * 2)
      ctx.fill()
      // Small upward spray hint
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * sprayPulse})`
      ctx.beginPath()
      ctx.ellipse(bowScreenX - 1, bowSurfY - 2, 3.5, 1.2, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Current zones (foam patches on the surface) ──
    for (const c of g.currents) {
      const ox = c.x - g.scrollX
      if (ox + c.width < 0 || ox > cw) continue
      drawCurrent(ctx, ox, c.width, g.scrollX, (x) => seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }

    // ── Shoals (deadly shallow water — dark patch with submerged rocks) ──
    for (const wp of g.shoals) {
      const ox = wp.x - g.scrollX
      if (ox + wp.width < 0 || ox > cw) continue
      drawShoal(ctx, ox, wp.width, g.scrollX, (x) => seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }

    // ── Surface hazards (rocks bobbing on the wave) ──
    for (const obs of g.hazards) {
      const ox = obs.x - g.scrollX
      if (ox + obs.width < 0 || ox > cw) continue
      const surfaceAtHazard = seaSurfaceY(obs.x + obs.width / 2, ch, g.scrollX)
      drawHazard(ctx, ox, surfaceAtHazard, obs.width, obs.height)
    }

    // ── Beacons (look like rocks, but you must run through them) ──
    for (const cr of g.beacons) {
      const ox = cr.x - g.scrollX
      if (ox + cr.width < 0 || ox > cw) continue
      const surfaceAtCr = seaSurfaceY(cr.x + cr.width / 2, ch, g.scrollX)
      drawBeacon(ctx, ox, surfaceAtCr, cr.width, cr.height, cr.shatteredAt, g.scrollX)
    }

    // ── PB marker removed (in-water pennant was distracting in the
    //    obstacle lane). Crossing detection now lives in the score-update
    //    block above and drives a brief "New Best" pulse near the HUD
    //    score readout — see newBestStamp + the JSX overlay below. ──

    // ── Detection beam (active while beacon detection flash plays) ──
    if (g.detectingUntil > 0) {
      const remaining = g.detectingUntil - performance.now()
      if (remaining > 0) {
        const totalMs = BEACON_DETECT_FLASH_SEC * 1000
        const t = 1 - remaining / totalMs            // 0 → 1 over flash duration
        // Beam rises from the beacon itself (the alarm source). Detection
        // only fires once the ship is centered over it, so it also reads
        // as mid-ship without detaching the beam from the beacon.
        const beamX = g.detectingBeaconX - g.scrollX
        const surfaceAtBeam = seaSurfaceY(g.detectingBeaconX, ch, g.scrollX)

        // A few flicker pulses across the duration for "Whoop! Whoop!" detection feel
        const flick = 0.7 + 0.3 * Math.sin(t * Math.PI * 6)
        const beamW = 38 * flick

        ctx.save()
        // Wide soft halo
        const halo = ctx.createLinearGradient(beamX, 0, beamX, surfaceAtBeam)
        halo.addColorStop(0, 'rgba(255, 220, 130, 0)')
        halo.addColorStop(0.4, `rgba(255, 220, 130, ${0.55 * flick})`)
        halo.addColorStop(1, `rgba(255, 200, 90, ${0.85 * flick})`)
        ctx.fillStyle = halo
        ctx.fillRect(beamX - beamW / 2, 0, beamW, surfaceAtBeam + 4)

        // Sharp white core
        ctx.strokeStyle = `rgba(255, 252, 230, ${0.95 * flick})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(beamX, 0)
        ctx.lineTo(beamX, surfaceAtBeam + 4)
        ctx.stroke()
        ctx.restore()
      }
    }

    // ── Ship ──
    const img = shipImgRef.current
    if (img && img.complete) {
      const shipX = cw * SHIP_X_RATIO
      ctx.save()
      ctx.translate(shipX + g.shipW / 2, g.shipY + g.shipH / 2)
      ctx.rotate(g.pitch)
      ctx.drawImage(img, -g.shipW / 2, -g.shipH / 2, g.shipW, g.shipH)
      ctx.restore()
    }

    // ── Splash droplets (drawn over the ship for visibility) ──
    for (const p of g.splashes) {
      const screenX = p.worldX - g.scrollX
      if (screenX < -10 || screenX > cw + 10) continue
      const lifeFrac = p.age / SPLASH_MAX_AGE_SEC
      const alpha = (1 - lifeFrac) * 0.85
      const r = 2 + (1 - lifeFrac) * 2
      ctx.fillStyle = `rgba(220, 240, 255, ${alpha})`
      ctx.beginPath()
      ctx.arc(screenX, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Beacon-smash debris ──
    for (const d of g.debris) {
      const sx = d.worldX - g.scrollX
      if (sx < -20 || sx > cw + 20) continue
      const lf = d.age / DEBRIS_MAX_AGE_SEC
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - lf)
      ctx.translate(sx, d.y)
      ctx.rotate(d.rot)
      ctx.fillStyle = '#3b3b42'
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.82)
      ctx.restore()
    }
    ctx.globalAlpha = 1

    // ── Beacon-smash signal pop (amber ring + hot core) ──
    for (const ring of g.smashRings) {
      const sx = ring.worldX - g.scrollX
      if (sx < -60 || sx > cw + 60) continue
      const t = ring.age / SMASH_RING_DUR_SEC          // 0 → 1
      ctx.save()
      ctx.globalAlpha = (1 - t) * 0.9
      ctx.strokeStyle = '#ffc34d'
      ctx.lineWidth = 3 * (1 - t) + 1
      ctx.beginPath()
      ctx.arc(sx, ring.y, 6 + t * 46, 0, Math.PI * 2)
      ctx.stroke()
      if (t < 0.35) {
        const c = 1 - t / 0.35
        ctx.globalAlpha = c * 0.85
        ctx.fillStyle = '#fff4d6'
        ctx.beginPath()
        ctx.arc(sx, ring.y, 8 * c + 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1

    // ── Speed escalation cues — felt, not seen. Ramp in over the first
    //    ~70s of climbing speed, then saturate. Pure canvas fills (cheap). ──
    const speedFrac = Math.max(0, Math.min(1, (g.speed - BASE_SPEED) / 500))
    if (speedFrac > 0.02) {
      const tnow = performance.now()
      // Fast horizontal streak lines sweeping right→left
      ctx.save()
      ctx.strokeStyle = `rgba(255,255,255,${(0.10 * speedFrac).toFixed(3)})`
      ctx.lineWidth = 1
      for (let i = 0; i < 7; i++) {
        const yFrac = 0.30 + ((i * 0.107) % 0.62)
        const sy = ch * yFrac
        const period = cw + 160
        const sx = period - ((tnow * (0.55 + speedFrac) * (0.9 + i * 0.13)) % period)
        const len = 26 + i * 6 + speedFrac * 40
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - len, sy)
        ctx.stroke()
      }
      ctx.restore()
      // Tunnel-ish edge vignette that tightens with speed
      const vig = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.32, cw / 2, ch / 2, ch * 0.78)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, `rgba(4,10,18,${(0.20 * speedFrac).toFixed(3)})`)
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, cw, ch)
    }

    // ── Collision flash ──
    if (g.state === 'dead' && performance.now() < g.deathFlashUntil) {
      ctx.fillStyle = 'rgba(255, 240, 220, 0.6)'
      ctx.fillRect(0, 0, cw, ch)
    }
  }, [])

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (ts: number) => {
      const last = lastTsRef.current
      const dt = last === 0 ? 0 : Math.min((ts - last) / 1000, 0.05)
      lastTsRef.current = ts
      // Hitstop: skip the sim for the freeze window but keep rendering, so
      // the shake plays and the debris hangs mid-air, then snaps into motion
      // when it resumes. (dt is clamped above, so no post-freeze time jump.)
      if (performance.now() >= gRef.current.hitstopUntil) step(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [step, render])

  // ── Pause on tab hide ──────────────────────────────────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) lastTsRef.current = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ── Render UI ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {showTour && <TideRunTour onClose={closeTour} />}
      <PodiumToast notif={podiumNotif} onDone={() => setPodiumNotif(null)} />

      <div
        ref={wrapperRef}
        onPointerDown={(e) => { e.preventDefault(); onPress() }}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        onPointerLeave={onRelease}
        onContextMenu={(e) => e.preventDefault()}
        className="relative w-full overflow-hidden h-[min(900px,max(480px,calc(100dvh-44px)))] sm:h-[min(900px,max(480px,calc(100dvh-64px)))]"
        style={{
          // FULL BLEED. The canvas paints its own sea and sky, so a border and
          // a rounded corner around it framed the game as a card sitting on the
          // page rather than as the page. Both are gone and the column with
          // them; what is left is the drawn scene, edge to edge.
          //
          // HEIGHT FILLS TO THE VIEWPORT FLOOR, subtracting only the top nav
          // (44 on mobile, 64 on desktop — the responsive classes above). On
          // mobile the sea runs down BEHIND the tab bar, which is opaque and
          // fixed on top, so it hides the overlapping strip. The old fixed -120
          // guessed a tab-bar height that has no safe-area padding and varies by
          // device, and the guess came up short: a band of page background
          // showed below the sea. Running the sea past the bar removes the guess
          // and the gap with it, and only cosmetic deep water is ever covered.
          //
          // WIDTH IS CAPPED TO A PHONE, not 720. Scroll speed is absolute px/s,
          // so a wider canvas shows more of the world ahead and buys more
          // reaction time -- the game got measurably easier full-screened on
          // desktop, on a leaderboard shared with phones. A phone is ~390-430
          // wide; 440 leaves those untouched (width:100% still applies below it)
          // and brings desktop DOWN to the same window rather than a wider one.
          maxWidth: 440,
          margin: '0 auto',
          background: '#062840',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <canvas ref={canvasRef} style={{
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',           // wrapper catches all input
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }} />

        {/* Help — moved into the canvas (top-left) so the page header could
            be removed and the game extended upward. stopPropagation keeps a
            tap on it from also starting the run / triggering a jump. */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowTour(true) }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="How to play"
          // THE TWO EDGES ARE NOT SYMMETRIC, which is what made the first
          // attempt at this so wrong. The canvas runs BEHIND the bottom tab
          // bar, so the sound button needs a big offset to clear it. The canvas
          // STARTS BELOW the top nav, which has already consumed the safe-area
          // inset — so copying the bottom's expression up here double-counted
          // it and pushed these buttons about 135px down on a notched phone.
          // A plain margin is all the top needs; 22px is the breathing room the
          // old flat 10 was missing.
          className="font-karla font-700"
          style={{
            position: 'absolute', top: 22, left: 10, zIndex: 5,
            width: 30, height: 30, borderRadius: '50%',
            border: '1px solid rgba(189,160,90,0.5)',
            background: 'rgba(6,18,34,0.7)',
            color: '#e8c87a',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          ?
        </button>

        {/* Speaker toggle — bottom-left, parallel placement to the fishing
            game's mute button. stopPropagation so tapping it doesn't also
            trigger a jump. */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            const next = !audioMuted
            setTideRunMuted(next)
            setAudioMutedState(next)
          }}
          aria-label={audioMuted ? 'Unmute sounds' : 'Mute sounds'}
          // Lifted clear of the mobile tab bar, which the sea now runs behind.
          // Desktop has no bar, so it drops back to the corner.
          className="bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] sm:bottom-[10px]"
          style={{
            position: 'absolute', left: 10, zIndex: 5,
            width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(8,18,28,0.6)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '50%',
            color: 'rgba(240,237,232,0.85)',
            cursor: 'pointer',
            padding: 0,
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          {audioMuted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>

        {/* Leaderboard — top-right, only off the run. stopPropagation so
            opening it doesn't also start the run / trigger a jump. */}
        {uiState !== 'playing' && (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            // Same 22px as How to Play — see the note there on why the top
            // does not reuse the bottom's expression.
            style={{ position: 'absolute', top: 22, right: 10, zIndex: 5 }}
          >
            <LeaderboardModal boards={['tideRun']} title="Tide Run Leaderboard" />
          </div>
        )}

        {uiState === 'playing' && (
          <>
            <div className="absolute top-3 left-0 right-0 flex flex-col items-center pointer-events-none">
              <p className="font-cinzel font-700" style={{
                fontSize: '2.2rem',
                color: '#ffffff',
                textShadow: '0 2px 8px rgba(0,0,0,0.55)',
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}>
                {Math.floor(score)}<span style={{ fontSize: '1rem', marginLeft: 4, opacity: 0.75 }}>m</span>
              </p>
              <AnimatePresence>
                {newBestStamp > 0 && (
                  <motion.p
                    key={newBestStamp}
                    initial={{ opacity: 0, y: -4, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.3 } }}
                    transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                    className="font-karla font-700 uppercase"
                    style={{
                      marginTop: 4,
                      fontSize: '0.62rem',
                      letterSpacing: '0.22em',
                      color: '#ffd56b',
                      textShadow: '0 1px 4px rgba(0,0,0,0.65), 0 0 14px rgba(255,213,107,0.55)',
                    }}
                  >
                    ★ New Best
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {highScore > 0 && (
              <div className="absolute top-3 right-3 pointer-events-none text-right">
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{
                  fontSize: '0.55rem',
                  color: 'rgba(255,255,255,0.65)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  lineHeight: 1,
                }}>
                  Best
                </p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '0.95rem',
                  color: score > highScore ? '#ffd56b' : 'rgba(255,255,255,0.85)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  lineHeight: 1.1,
                  marginTop: 2,
                }}>
                  {fmtDistance(Math.max(score, highScore))}<span style={{ fontSize: '0.6rem', marginLeft: 2, opacity: 0.7 }}>m</span>
                </p>
              </div>
            )}
          </>
        )}

        {uiState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none pb-[calc(env(safe-area-inset-bottom,0px)+32px)] sm:pb-0">
            {/* Matched to the wreck modal: same width, padding and corner. The
                two alternate on the same screen — start, run, wreck, start —
                so any difference between them reads as the panel jumping
                rather than as two designs. width:100% as well as maxWidth,
                because without it the box sizes to its content and the start
                screen, which holds less text, came out narrower again. */}
            <div style={{
              width: '100%',
              maxWidth: 360,
              padding: '18px 20px 16px',
              borderRadius: 18,
              background: 'rgba(6, 18, 34, 0.84)',
              border: '1px solid rgba(189,160,90,0.5)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.75rem', color: '#ffffff', lineHeight: 1.1, marginBottom: 20 }}>
                Tide Run
              </p>
              <div className="font-karla font-700 uppercase tracking-[0.18em]" style={{
                display: 'inline-block',
                fontSize: '0.82rem',
                color: '#f0d28a',
                padding: '11px 22px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.45)',
                border: '1px solid rgba(189,160,90,0.6)',
              }}>
                Tap to start
              </div>
              {highScore > 0 && (
                <p className="font-karla font-700" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.82)', marginTop: 18 }}>
                  Best: {fmtDistance(highScore)}m
                </p>
              )}

              {/* THE BOATHOUSE, from the start screen too. Picking your boat and
                  your water is something you want to do BEFORE a run, not only
                  in the half-second after dying — and the wreck screen was the
                  only door to it. Shows what you are currently sailing, so the
                  button is a status line as well as a way in.

                  stopPropagation on both pointerdown and click: the whole screen
                  is the "tap to start" target, so without it opening the locker
                  also launches a run underneath it. */}
              {/* Shaped like a row you TAP, not a panel you read: your boat on
                  the left, the label and what you are sailing in the middle, a
                  chevron on the right. The thumbnail does most of the work — an
                  image beside text reads as a control, where centred text in a
                  box reads as a notice. active:scale gives it the press. */}
              <button
                type="button"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); hapticTap(); setLockerOpen(true) }}
                className="pointer-events-auto tap font-karla active:scale-[0.97]"
                style={{
                  width: '100%', marginTop: 14, padding: '0.5rem 0.6rem', borderRadius: 12,
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  background: 'linear-gradient(180deg, rgba(127,208,232,0.16), rgba(127,208,232,0.07))',
                  border: '1px solid rgba(127,208,232,0.45)',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.09)',
                  cursor: 'pointer', touchAction: 'manipulation', transition: 'transform 0.08s',
                }}
              >
                <span style={{
                  flexShrink: 0, width: 46, height: 34, borderRadius: 8,
                  background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tideRunBoat(boatId).image ?? '/boatrun.png'} alt="" decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-700" style={{ display: 'block', fontSize: '0.76rem', color: '#eaf6fb' }}>
                    Unlocks
                  </span>
                  <span style={{ display: 'block', fontSize: '0.62rem', color: '#8fa6b8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tideRunBoat(boatId).name} · {tideRunSea(seaId).name}
                  </span>
                </span>
                <span aria-hidden style={{ flexShrink: 0, color: '#7fd0e8', display: 'flex' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Centred on the VISIBLE area, not the canvas box. The wrapper is
            100dvh-44px while the tab bar is taller than that, so its bottom
            strip sits behind the bar — centring on inset-0 alone put the modal
            about 16px low, which reads as "not quite centred" without being
            obviously broken. The pad is that hidden strip. */}
        {uiState === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none pb-[calc(env(safe-area-inset-bottom,0px)+32px)] sm:pb-0">
            {/* Trimmed from 420 to 360 with tighter padding and a smaller
                headline. The recap is read in a second between runs, so it
                needs to be legible rather than large — at 420 it dominated a
                screen whose actual job is to get you back into a run. */}
            <div style={{
              width: '100%',
              maxWidth: 360,
              padding: '18px 20px 16px',
              borderRadius: 18,
              background: 'rgba(6, 18, 34, 0.88)',
              border: '1px solid rgba(189,160,90,0.5)',
              backdropFilter: 'blur(6px)',
            }}>
              {(() => {
                const isNewBest = score > 0 && score === highScore
                return (
                  <>
                    <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.68rem', color: '#bda05a', marginBottom: 6 }}>
                      Wrecked
                    </p>
                    <p className="font-cinzel font-700" style={{
                      fontSize: '2.6rem', lineHeight: 1,
                      color: isNewBest ? '#ffd56b' : '#ffffff',
                      textShadow: isNewBest ? '0 0 22px rgba(255,213,107,0.6)' : 'none',
                    }}>
                      {fmtDistance(deadCount)}<span style={{ fontSize: '1.05rem', marginLeft: 5, opacity: 0.75 }}>m</span>
                    </p>
                    {isNewBest ? (
                      <p className="tr-newbest font-cinzel font-700 mt-3" style={{
                        fontSize: '1.1rem', color: '#ffd56b', letterSpacing: '0.12em',
                        textShadow: '0 0 14px rgba(255,213,107,0.6)',
                      }}>
                        ★ NEW BEST ★
                      </p>
                    ) : (
                      // Personal Best line. Drops the "N meters short"
                      // tail — that math is dispiriting after a wreck,
                      // the PB number alone is enough context.
                      <p className="font-karla font-700 mt-3" style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.78)' }}>
                        Personal Best: <span style={{ color: '#ffffff' }}>{fmtDistance(highScore)}m</span>
                      </p>
                    )}
                  </>
                )
              })()}

              {/* ── Leaderboard story (Global Hiscore + your rank + gap) ──
                  This panel is the wreck modal's MAIN motivator now. It
                  unifies "where the bar sits" with "where you stand and
                  what catching the next person costs you" — the
                  gap-to-next-rank number is the strongest pull. The
                  rank/gap line is hidden in cold-start states (no rank
                  yet, or no one above you) so the panel never shows
                  empty rows. */}
              {topHolder && topHolder.distance > 0 && (
                <div style={{
                  marginTop: 16,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'linear-gradient(180deg, rgba(255,213,107,0.09) 0%, rgba(189,160,90,0.05) 100%)',
                  border: '1px solid rgba(255,213,107,0.4)',
                  boxShadow: '0 0 28px rgba(255,213,107,0.08)',
                }}>
                  <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.65rem', color: 'rgba(255,213,107,0.85)', marginBottom: 6 }}>
                    Global Hiscore
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.75rem', color: '#ffd56b', lineHeight: 1.1, textShadow: '0 0 18px rgba(255,213,107,0.45)' }}>
                    <span style={{ marginRight: 8 }}>👑</span>
                    {fmtDistance(topHolder.distance)}m
                  </p>
                  <p className="font-karla font-700 mt-1" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.72)' }}>
                    held by <span style={{ color: '#f0ede8', fontWeight: 700 }}>{topHolder.username}</span>
                  </p>

                  {/* Your rank + gap-to-next. Split states:
                       1. Rank null → "Get on the board" hint (cold start
                          — no run > 0 yet, the global hiscore above is
                          the only carrot).
                       2. Rank 1 → "👑 You hold this run" (no one above).
                       3. Rank N + nextRank present → "300m to catch
                          mikel (#N-1)" — THE motivator. */}
                  {rank && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid rgba(255,213,107,0.18)',
                    }}>
                      {rank.rank === null ? (
                        <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.7)', lineHeight: 1.45 }}>
                          One run past the start gets you on the board.
                        </p>
                      ) : rank.rank === 1 ? (
                        <>
                          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: '#4ade80', marginBottom: 4 }}>
                            You&apos;re #1
                          </p>
                          <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.45 }}>
                            Nobody&apos;s caught you yet. Push it further.
                          </p>
                        </>
                      ) : rank.nextRankDistance != null && rank.nextRankUsername ? (
                        <>
                          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: 'rgba(255,213,107,0.78)', marginBottom: 4 }}>
                            You&apos;re #{rank.rank}
                          </p>
                          <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#f5f2ec', lineHeight: 1.35 }}>
                            <span style={{ color: '#ffd56b' }}>{fmtDistance(rank.nextRankDistance - rank.yourDistance)}m</span>
                            {' '}to catch{' '}
                            <span style={{ color: '#f5f2ec', fontWeight: 700 }}>{rank.nextRankUsername}</span>
                            <span style={{ color: 'rgba(240,237,232,0.55)' }}> · #{rank.rank - 1}</span>
                          </p>
                        </>
                      ) : (
                        <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: 'rgba(255,213,107,0.78)' }}>
                          You&apos;re #{rank.rank} of {rank.totalPlayers}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Beacon doubloon payout ──
                  Demoted to a single quiet line beneath the leaderboard
                  panel. Doubloons-per-beacon is a passive trickle, not
                  the reason a player kept running — the rank chase is.
                  Set optimistically the moment the wreck screen
                  appears so the modal doesn't resize when the server
                  reply lands a few hundred ms later. */}
              {beaconReward && beaconReward.doubloons > 0 && (
                <p className="font-karla mt-3" style={{ fontSize: '0.72rem', color: 'rgba(255,213,107,0.78)', textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#ffd56b' }}>+{beaconReward.doubloons} ⟡</span>
                  <span style={{ color: 'rgba(240,237,232,0.55)' }}> · {beaconsThisRun} beacons smashed</span>
                </p>
              )}

              {/* THE NEXT BOAT, on the screen where you decide whether to run
                  again. A distance you are chasing is a far better reason to
                  tap than "you died", and the locker is one tap from here
                  rather than somewhere you have to go looking for. */}
              {(() => {
                const next = nextBoat(highScore)
                if (!next) return null
                const away = Math.max(1, Math.ceil(next.unlockAt - highScore))
                return (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); hapticTap(); setLockerOpen(true) }}
                    onPointerDown={e => e.stopPropagation()}
                    className="pointer-events-auto tap font-karla active:scale-[0.97]"
                    style={{
                      width: '100%', marginTop: 14, padding: '0.5rem 0.6rem', borderRadius: 12,
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      fontSize: '0.76rem', color: '#dff1f8',
                      background: 'linear-gradient(180deg, rgba(127,208,232,0.16), rgba(127,208,232,0.07))',
                      border: '1px solid rgba(127,208,232,0.45)',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.09)',
                      cursor: 'pointer', touchAction: 'manipulation', transition: 'transform 0.08s',
                    }}
                  >
                    {/* The prize itself, silhouetted because it is not yours
                        yet. Seeing the shape of the thing you are 51m from is
                        worth more than the sentence describing it. */}
                    <span style={{
                      flexShrink: 0, width: 46, height: 34, borderRadius: 8,
                      background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={next.image ?? '/boatrun.png'} alt="" decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) opacity(0.45)' }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="font-700" style={{ display: 'block' }}>
                      <span style={{ color: '#7fd0e8' }}>{away}m</span> further unlocks the{' '}
                      <span style={{ color: '#7fd0e8' }}>{next.name}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: '0.6rem', color: '#8fa6b8', marginTop: 2 }}>
                      Tap to see your unlocks
                    </span>
                    </span>
                    <span aria-hidden style={{ flexShrink: 0, color: '#7fd0e8', display: 'flex' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </span>
                  </button>
                )
              })()}

              <p className="font-karla font-700 uppercase tracking-[0.18em] mt-4" style={{ fontSize: '0.82rem', color: '#bda05a' }}>
                Tap to try again
              </p>
            </div>

            {/* Floating "+N coin" payload — phantom number that rises
                from the modal toward the top of the screen (where the
                Nav doubloons counter lives). Fires ~350ms after the
                wreck modal appears in sync with the Nav counter tick.
                Purely decorative; the actual credit happens server-
                side and is already reflected in pendingNavTotalRef. */}
            <AnimatePresence>
              {flyingPayout && (
                <motion.div
                  key={flyingPayout.key}
                  initial={{ opacity: 0, y: 0, scale: 0.7 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    y: [0, -80, -180, -260],
                    scale: [0.7, 1.25, 1.1, 0.95],
                  }}
                  transition={{ duration: 1.45, times: [0, 0.18, 0.65, 1], ease: 'easeOut' }}
                  onAnimationComplete={() => setFlyingPayout(null)}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#ffd56b',
                    fontWeight: 700,
                    fontSize: '1.7rem',
                    letterSpacing: '0.02em',
                    textShadow: '0 0 18px rgba(255,213,107,0.9), 0 0 38px rgba(255,213,107,0.5)',
                    pointerEvents: 'none',
                    zIndex: 30,
                    fontFamily: 'var(--font-cinzel), serif',
                  }}
                >
                  +{flyingPayout.amount} ⟡
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* THE PRIZE, before the numbers. A new boat is the best thing that
          happened in a run and should not queue behind a score. Dismiss equips
          it, because a reward you have to go and apply is an errand. */}
      {justUnlocked.length > 0 && (
        <BoatUnlockedOverlay
          boats={justUnlocked}
          onDismiss={() => {
            const last = justUnlocked[justUnlocked.length - 1]
            setJustUnlocked([])
            setBoatId(last.id)
            void adapter.setBoat(last.id).catch(() => {})
          }}
        />
      )}

      {/* Seas queue BEHIND boats rather than fighting them for the screen: a
          run that earns both shows the boat, then the water. Two overlays in a
          row reads as two rewards; two at once reads as a mess. */}
      {justUnlocked.length === 0 && justUnlockedSeas.length > 0 && (
        <SeaUnlockedOverlay
          seas={justUnlockedSeas}
          onDismiss={() => {
            const last = justUnlockedSeas[justUnlockedSeas.length - 1]
            setJustUnlockedSeas([])
            setSeaId(last.id)
            void adapter.setSea(last.id).catch(() => {})
          }}
        />
      )}

      {lockerOpen && (
        <BoatLocker
          bestDistance={highScore}
          equippedId={boatId}
          equippedSeaId={seaId}
          adapter={adapter}
          onEquip={setBoatId}
          onEquipSea={setSeaId}
          onClose={() => setLockerOpen(false)}
        />
      )}
    </div>
  )
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
// Hazard: jagged rock sticking up out of the water surface.
// `surfaceY` is the water line at the hazard's x; `h` is how far above the water.
function drawHazard(ctx: CanvasRenderingContext2D, x: number, surfaceY: number, w: number, h: number) {
  const top = surfaceY - h
  const g = ctx.createLinearGradient(x, top, x, surfaceY)
  g.addColorStop(0, '#54453a')
  g.addColorStop(0.55, '#33271f')
  g.addColorStop(1, '#1a1410')
  ctx.fillStyle = g
  ctx.beginPath()
  // Anchor below the surface so the rock looks rooted in the water
  ctx.moveTo(x, surfaceY + h * 0.3)
  ctx.lineTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.lineTo(x + w * 0.74, top + h * 0.05)
  ctx.lineTo(x + w * 0.9,  top + h * 0.30)
  ctx.lineTo(x + w,        surfaceY + h * 0.3)
  ctx.closePath()
  ctx.fill()
  // Edge highlight on the lit side
  ctx.strokeStyle = 'rgba(255, 235, 200, 0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.stroke()
  // Tiny foam ring where rock meets water
  ctx.strokeStyle = 'rgba(230, 245, 255, 0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - w * 0.05, surfaceY)
  ctx.bezierCurveTo(x + w * 0.3, surfaceY - 1.5, x + w * 0.7, surfaceY - 1.5, x + w * 1.05, surfaceY)
  ctx.stroke()
}

// Beacon: a detection device disguised as a rock. The rock body matches
// real rocks (cracks, pebbles, same silhouette) so reflexive jumpers eat
// it. Subtle cues: a thin antenna emerging from the top, a pulsing amber
// signal light, faint rust hue on the cracks. Smash through grounded to
// disable it; jumping triggers detection (handled by the calling render).
function drawBeacon(
  ctx: CanvasRenderingContext2D,
  x: number, surfaceY: number,
  w: number, h: number,
  shatteredAt: number,
  scrollX: number,
) {
  // Smashed: fragments fly outward with gravity + expanding shockwave ring.
  // Makes the "boat smashes a beacon" moment feel like an impact.
  if (shatteredAt > 0) {
    const elapsed = (performance.now() - shatteredAt) / 1000
    if (elapsed > 0.9) return                          // fully faded
    const fadeT = Math.max(0, 1 - elapsed / 0.9)
    const cx = x + w / 2

    ctx.save()

    // Shockwave ring — pops in the first 0.25s
    if (elapsed < 0.28) {
      const ringT = elapsed / 0.28
      const ringR = 8 + ringT * 60
      ctx.globalAlpha = (1 - ringT) * 0.75
      ctx.strokeStyle = '#ffeaa8'
      ctx.lineWidth = 2.4 * (1 - ringT * 0.6)
      ctx.beginPath()
      ctx.ellipse(cx, surfaceY - 4, ringR, ringR * 0.45, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Flying fragments (8 stones) with outward velocity + gravity
    ctx.fillStyle = '#2a2018'
    for (let i = 0; i < 8; i++) {
      const seed = ((i * 211 + Math.floor(x * 11)) % 1000) / 1000
      // Upward-biased outward angle
      const angle = (i / 8) * Math.PI - Math.PI / 2 + (seed - 0.5) * 0.6
      const speed = 110 + seed * 70
      const dx = Math.cos(angle) * speed * elapsed
      const dy = Math.sin(angle) * speed * elapsed + 0.5 * 600 * elapsed * elapsed
      const px = cx + dx
      const py = (surfaceY - 6) + dy
      ctx.globalAlpha = fadeT
      ctx.beginPath()
      ctx.arc(px, py, 2 + seed * 1.4, 0, Math.PI * 2)
      ctx.fill()
    }

    // A small fading amber spark at the original light position — the beacon
    // going dark.
    ctx.globalAlpha = Math.max(0, 1 - elapsed / 0.35) * 0.9
    ctx.fillStyle = '#ffd070'
    ctx.beginPath()
    ctx.arc(cx, surfaceY - h - 12, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
    return
  }

  const top = surfaceY - h

  // Same rock body geometry as drawHazard
  const grad = ctx.createLinearGradient(x, top, x, surfaceY)
  grad.addColorStop(0, '#54453a')
  grad.addColorStop(0.55, '#33271f')
  grad.addColorStop(1, '#1a1410')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(x, surfaceY + h * 0.3)
  ctx.lineTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.lineTo(x + w * 0.74, top + h * 0.05)
  ctx.lineTo(x + w * 0.9,  top + h * 0.30)
  ctx.lineTo(x + w,        surfaceY + h * 0.3)
  ctx.closePath()
  ctx.fill()

  // Cracks / weathered seams — subtle "this isn't natural rock" cue.
  // Tinted slightly warm (rust-like) for the beacon-disguised-as-rock feel.
  ctx.strokeStyle = 'rgba(210, 165, 110, 0.50)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(x + w * 0.20, top + h * 0.30)
  ctx.lineTo(x + w * 0.45, top + h * 0.55)
  ctx.lineTo(x + w * 0.60, top + h * 0.40)
  ctx.moveTo(x + w * 0.55, top + h * 0.15)
  ctx.lineTo(x + w * 0.78, top + h * 0.50)
  ctx.moveTo(x + w * 0.30, top + h * 0.65)
  ctx.lineTo(x + w * 0.70, top + h * 0.85)
  ctx.stroke()

  // A few loose pebbles at the base (already crumbling)
  ctx.fillStyle = '#2a2018'
  for (let i = 0; i < 4; i++) {
    const seed = ((i * 137 + Math.floor(x * 13)) % 1000) / 1000
    const px = x + w * (0.08 + 0.22 * i) + (seed - 0.5) * 3
    const py = surfaceY + 2 + (i % 2)
    ctx.beginPath()
    ctx.arc(px, py, 1.4 + seed * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }

  // Tall metal antenna emerging from the rock — main visual identifier.
  // Made noticeably bigger and added a base flange so it reads as built,
  // not natural.
  const cx = x + w / 2
  const antennaH = 22
  const glintY = top - antennaH
  ctx.strokeStyle = '#15110d'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(cx, top + 1)
  ctx.lineTo(cx, glintY + 2)
  ctx.stroke()
  // Small support flange where the antenna meets the rock
  ctx.fillStyle = '#3a2820'
  ctx.fillRect(cx - 3, top - 1, 6, 3)

  // Animated radar ring expanding outward from the light — distinct from
  // anything else in the game. Time-based so it pulses at a steady rate
  // regardless of scroll speed.
  const ringPhase = ((performance.now() / 1000) % 1.4) / 1.4   // 0..1
  const ringR = 5 + ringPhase * 22
  const ringAlpha = (1 - ringPhase) * 0.7
  ctx.save()
  ctx.globalAlpha = ringAlpha
  ctx.strokeStyle = '#ffb84d'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, glintY, ringR, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // Pulsing amber signal light at the antenna tip — bigger + brighter
  const pulse = 0.5 + 0.5 * Math.sin(scrollX * 0.06 + cx * 0.03)
  const glintAlpha = 0.65 + pulse * 0.35
  ctx.save()
  ctx.globalAlpha = glintAlpha
  // Outer glow halo
  const glow = ctx.createRadialGradient(cx, glintY, 0, cx, glintY, 14)
  glow.addColorStop(0, 'rgba(255, 200, 110, 0.85)')
  glow.addColorStop(0.4, 'rgba(255, 170, 70, 0.45)')
  glow.addColorStop(1, 'rgba(255, 150, 60, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, glintY, 14, 0, Math.PI * 2)
  ctx.fill()
  // Bright core star — bigger 4-point shape
  ctx.fillStyle = '#fff0c0'
  ctx.beginPath()
  ctx.moveTo(cx,       glintY - 6)
  ctx.lineTo(cx + 1.5, glintY - 1.5)
  ctx.lineTo(cx + 6,   glintY)
  ctx.lineTo(cx + 1.5, glintY + 1.5)
  ctx.lineTo(cx,       glintY + 6)
  ctx.lineTo(cx - 1.5, glintY + 1.5)
  ctx.lineTo(cx - 6,   glintY)
  ctx.lineTo(cx - 1.5, glintY - 1.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Current: a flat patch of foamy/churning water on the surface. Boat slows
// down while grounded inside it; jump over to skip.
function drawCurrent(
  ctx: CanvasRenderingContext2D,
  x: number, width: number,
  scrollX: number,
  surfaceAt: (screenX: number) => number,
) {
  // Lighter water tint to read as a distinct zone
  ctx.save()
  ctx.fillStyle = 'rgba(180, 220, 240, 0.20)'
  ctx.beginPath()
  for (let dx = 0; dx <= width; dx += 4) {
    const sx = x + dx
    const sy = surfaceAt(sx)
    if (dx === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  for (let dx = width; dx >= 0; dx -= 4) {
    const sx = x + dx
    ctx.lineTo(sx, surfaceAt(sx) + 9)
  }
  ctx.closePath()
  ctx.fill()

  // Animated foam streaks (use scrollX as phase so foam appears to swirl)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
  ctx.lineWidth = 1.4
  const streakCount = Math.max(3, Math.floor(width / 26))
  for (let i = 0; i < streakCount; i++) {
    const baseX = x + (i + 0.5) * (width / streakCount)
    const phase = (scrollX * 0.6 + i * 80) * 0.025
    const yOff = Math.sin(phase) * 2.5
    const sy = surfaceAt(baseX)
    ctx.beginPath()
    ctx.moveTo(baseX - 6, sy + yOff + 1)
    ctx.quadraticCurveTo(baseX, sy + yOff - 2, baseX + 6, sy + yOff + 1)
    ctx.stroke()
  }

  // Edge chevrons signalling the slow-zone direction
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1.2
  const drawChevron = (cx: number) => {
    const sy = surfaceAt(cx) - 4
    ctx.beginPath()
    ctx.moveTo(cx - 4, sy)
    ctx.lineTo(cx, sy + 4)
    ctx.lineTo(cx + 4, sy)
    ctx.stroke()
  }
  drawChevron(x + 8)
  drawChevron(x + width - 8)
  ctx.restore()
}

// Distant islands silhouetted at the horizon, parallax-scrolled slow.
// PARALLAX DEPTH. Three silhouette bands at different scroll speeds turn a flat
// horizon into a place: a far mountain ridge, the island cluster with a landmark
// lighthouse, and near sea-stacks breaking the waterline. All procedural
// placeholders (real art can replace the shapes without touching the layering),
// all painted in the palette's island colour so they read at every time of day.
//
// Cheap by construction: a few dozen line segments per band per frame, no
// shadowBlur and no filters (both murder mobile framerates), and the profiles
// are FIXED arrays -- never Math.random per frame, which would make the ridge
// crawl and shimmer. First value equals last so each period tiles seamlessly.
const FAR_RIDGE = [0.30, 0.62, 0.42, 0.78, 0.50, 0.88, 0.55, 0.70, 0.38, 0.58, 0.34, 0.48, 0.30]
const SEA_STACKS = [{ f: 0.18, h: 0.60, w: 0.028 }, { f: 0.52, h: 0.95, w: 0.044 }, { f: 0.71, h: 0.45, w: 0.022 }]

// Far mountains on the skyline — slowest layer, faintest, sits behind the isles.
function drawFarRidge(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number, color: string) {
  ctx.fillStyle = color
  ctx.globalAlpha = 0.20
  const horizon = ch * 0.47
  const amp = ch * 0.11
  const period = cw * 2.2
  const offset = ((scrollOffset % period) + period) % period
  const n = FAR_RIDGE.length - 1
  for (let i = -1; i <= 2; i++) {
    const bx = i * period - offset
    ctx.beginPath()
    ctx.moveTo(bx, horizon + amp)
    for (let s = 0; s <= n; s++) ctx.lineTo(bx + (s / n) * period, horizon - FAR_RIDGE[s] * amp)
    ctx.lineTo(bx + period, horizon + amp)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// Rock stacks just off the bow — nearest silhouette, faster and more solid, its
// foot hidden by the sea gradient so it reads as standing IN the water.
function drawSeaStacks(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number, color: string) {
  ctx.fillStyle = color
  ctx.globalAlpha = 0.5
  const base = ch * 0.575
  const amp = ch * 0.10
  const period = cw * 1.7
  const offset = ((scrollOffset % period) + period) % period
  for (let i = -1; i <= 2; i++) {
    const bx = i * period - offset
    for (const s of SEA_STACKS) {
      const x = bx + s.f * period
      const w = s.w * cw
      const top = base - s.h * amp
      ctx.beginPath()
      ctx.moveTo(x - w, base)
      ctx.lineTo(x - w * 0.3, top)
      ctx.lineTo(x + w * 0.45, top + amp * 0.10)
      ctx.lineTo(x + w, base)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawDistantIslands(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number, color: string) {
  // Apply a constant alpha overlay regardless of base palette color
  ctx.fillStyle = color
  ctx.globalAlpha = 0.4
  const period = cw * 1.4
  const offset = ((scrollOffset % period) + period) % period
  // Horizon stays ~12% of canvas height above the sea baseline so the islands
  // visually anchor on the water line.
  const horizon = ch * 0.48
  for (let i = -1; i <= 2; i++) {
    const ix = i * period - offset
    // Two soft hills per period
    ctx.beginPath()
    ctx.moveTo(ix, horizon + 4)
    ctx.bezierCurveTo(ix + period * 0.15, horizon - 18, ix + period * 0.35, horizon - 22, ix + period * 0.5, horizon + 4)
    ctx.lineTo(ix + period * 0.5, horizon + 4)
    ctx.bezierCurveTo(ix + period * 0.6, horizon - 10, ix + period * 0.85, horizon - 14, ix + period, horizon + 4)
    ctx.closePath()
    ctx.fill()
    // A LANDMARK, once per island cluster: a lighthouse on the first crest, so
    // the horizon has something you recognise instead of anonymous hills.
    const lx = ix + period * 0.30
    // STAND IT ON THE HILL, don't guess. The base used to be pinned at
    // horizon-20 as if the hill reached its control points, but a cubic bezier
    // never touches P1/P2 — the crest under the lighthouse is only 13.6px up,
    // so it hung 6.4px clear of the ground and read as floating in the sky.
    // Evaluating the same curve keeps it planted if the hills are ever
    // reshaped, and the +1 buries the foot rather than balancing it on the line.
    const t = 0.6                       // x = 0.30 of a period, over a hill spanning 0 -> 0.5
    const u = 1 - t
    const hillY = horizon + (u * u * u * 4) + (3 * u * u * t * -18) + (3 * u * t * t * -22) + (t * t * t * 4)
    const ly = hillY + 1
    // A LANDMARK, not a rival to the skyline. At ch*0.05 it stood 52% as tall as
    // the far mountains while sitting on a nearer, smaller layer, which flattened
    // the depth the three bands exist to create.
    const th = ch * 0.024
    const tw = ch * 0.006
    ctx.beginPath()
    ctx.moveTo(lx - tw, ly)
    ctx.lineTo(lx - tw * 0.55, ly - th)
    ctx.lineTo(lx + tw * 0.55, ly - th)
    ctx.lineTo(lx + tw, ly)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(lx - tw * 0.85, ly - th - tw * 1.3, tw * 1.7, tw * 1.3)  // lamp housing
  }
  ctx.globalAlpha = 1
}

// Wispy clouds drifting at mid speed.
function drawClouds(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number, color: string) {
  ctx.fillStyle = color
  const period = cw * 1.1
  const offset = ((scrollOffset % period) + period) % period
  const cloudYs = [ch * 0.10, ch * 0.18, ch * 0.28]
  const cloudXs = [0.15, 0.45, 0.78]
  for (let i = -1; i <= 2; i++) {
    const ix = i * period - offset
    for (let j = 0; j < cloudXs.length; j++) {
      const cx = ix + cloudXs[j] * period
      const cy = cloudYs[j]
      const r = (j === 1 ? 14 : 11)
      ctx.beginPath()
      ctx.ellipse(cx,       cy,       r * 1.6, r * 0.55, 0, 0, Math.PI * 2)
      ctx.ellipse(cx - r,   cy + 2,   r * 1.1, r * 0.45, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + r,   cy + 2,   r * 1.0, r * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// Shoal: deadly shallow water — a dark patch with submerged rocklets just
// breaking the surface. Static (no animation). Reads as "hull-tearing
// shallows". Visually distinct from currents (pale foam) and rocks (jagged
// shapes above water).
function drawShoal(
  ctx: CanvasRenderingContext2D,
  x: number, width: number,
  _scrollX: number,
  surfaceAt: (screenX: number) => number,
) {
  ctx.save()

  // Dark water patch following the wave curve
  ctx.fillStyle = 'rgba(2, 8, 18, 0.55)'
  ctx.beginPath()
  for (let dx = 0; dx <= width; dx += 4) {
    const sx = x + dx
    const sy = surfaceAt(sx)
    if (dx === 0) ctx.moveTo(sx, sy - 1)
    else ctx.lineTo(sx, sy - 1)
  }
  for (let dx = width; dx >= 0; dx -= 4) {
    const sx = x + dx
    ctx.lineTo(sx, surfaceAt(sx) + 16)
  }
  ctx.closePath()
  ctx.fill()

  // Submerged rocklets — deterministic positions (no jitter frame-to-frame)
  const rocklets = Math.max(3, Math.floor(width / 34))
  for (let i = 0; i < rocklets; i++) {
    // Deterministic pseudo-random from index + width (stable per shoal)
    const seed = ((i * 311 + Math.floor(width * 7)) % 1000) / 1000
    const t = (i + 0.5) / rocklets
    const rx = x + width * (0.08 + t * 0.84) + (seed - 0.5) * 4
    const sy = surfaceAt(rx)
    const w = 5 + seed * 3
    const h = 3 + seed * 1.5

    // Foam ripple around the rocklet (drawn first, behind stone)
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(rx, sy + 0.5, w * 1.45, h * 1.1, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Stone body — sits with top just at/below the surface
    ctx.fillStyle = '#2a2018'
    ctx.beginPath()
    ctx.ellipse(rx, sy + 1, w, h, 0, 0, Math.PI * 2)
    ctx.fill()

    // Tiny highlight on the lit side of the stone
    ctx.fillStyle = 'rgba(120, 90, 70, 0.55)'
    ctx.beginPath()
    ctx.ellipse(rx - 1.2, sy - 0.5, w * 0.45, h * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
