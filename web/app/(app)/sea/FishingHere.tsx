'use client'

// FISHING WHERE YOU ARE.
//
// The cast → bite → dial → reel loop, on the sea map, without leaving it.
//
// This is NOT a second fishing game. `FishingGame.tsx` is 12,037 lines and owns
// gear, the hold, the almanac, crates, Finn, prestige, tours and the ancient
// ceremonies. None of that moves here. What moves is the small loop in the
// middle of it, and it moves by CALLING THE SAME TWO SERVER ACTIONS rather than
// by being extracted:
//
//   castLine(bait, zone, at) → fishId, catchDifficulty, waitMs
//   `at` is where the line went in, so the server can re-derive whether this
//   cast is inside a hotspot. See lib/seaHotspots.
//   reelIn(fishId, result, bait, …) → the catch
//
// Both take primitives and no session state, so the server neither knows nor
// cares that the call came from a map. That is what makes this days of work
// instead of surgery on the biggest file in the app.
//
// THE DIAL MATH IS THE REAL ONE. `buildFishZones` is the same function the
// fishing screen calls, with the same modifiers threaded in: hook tier, line
// penalty, the zone's own catch multiplier, level bonus, bait and rod. Getting
// this wrong would mean easier or harder fish depending on which screen you
// happened to cast from, which is worse than not shipping it.
//
// What is deliberately absent: events, boss mechanics and the Ancient Deep's
// drift. Those are situational and belong to the full screen, and the map does
// not offer the Ancient Deep as a quick cast.

import { AUTO_RECAST_MS, AUTO_CRATE_TOTAL_MS } from '@/lib/autoFishing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DialSVG } from '@/components/FishingDial'
// EVERYTHING THE DIAL DOES THAT SVG CANNOT, on its own Pixi layer BEHIND it:
// the fire, the light it casts, its smoke, and the Ancient's breathing aura.
// Dynamic and never loaded until one of those is actually wanted, so a player
// who never chains two perfects and never hooks a giant pays nothing for it.
const DialFx = dynamic(() => import('@/components/DialFx'), { ssr: false })
import { ResultCard } from '@/components/CatchResultCard'
import { XPBarDisplay } from '@/components/FishingXPBar'
import CrateOpening, { type CrateTierId, type CrateLootView } from '@/components/CrateOpening'
import dynamic from 'next/dynamic'

/**
 * THE ANCIENT CEREMONY, loaded on demand.
 *
 * Four overlays that fire at most six times in an account's life and carry
 * their own art, so none of them belong in the cast bundle. They chain:
 *
 *   the giant goes down  ->  Finn reacts to THAT giant
 *   the wall ranks up    ->  and at 30/30, the capstone and the pet
 *
 * All four already had their data — reelIn returns vigilRankUp,
 * vigilPetGranted and the trophy flags, and this screen was receiving them and
 * dropping them on the floor.
 */
const AncientRelease = dynamic(() => import('../fishing/AncientRelease'), { ssr: false })
const AncientSlain = dynamic(() => import('../fishing/AncientSlainCinematic'), { ssr: false })
const FinnScene = dynamic(() => import('../fishing/FinnScene'), { ssr: false })
const AncientRankUp = dynamic(() => import('../fishing/AncientRankUp'), { ssr: false })
const VigilCapstone = dynamic(() => import('../fishing/VigilCapstone'), { ssr: false })
import { buildFishZones, ZONE_DIFFICULTY, FISH_DIFFICULTY_SPEED, type ZoneDef } from '../fishing/depths'
import { applyAncientPalette } from '@/lib/ancientDial'
import { renownLevel } from '@/lib/renown'
import RenownUpOverlay, { type RenownUpInfo } from '@/components/RenownUpOverlay'
import { castLine, reelIn, reelCrate, useTideTurnerSkip, rerollWormhole, sellGoldenTrophy, mountGoldenTrophy, type FishSpecies } from '../fishing/actions'
import { gauntletAutoCatchMaxRarity } from '@/lib/gauntletUpgrades'
import { levelCatchBonus } from '@/lib/fishingLevel'
import { vibrate } from '@/lib/haptics'
import { unlockFishingAudio, playCastSfx, playCast2Sfx, playPerfectSfx } from '@/lib/fishingMusic'
import { getSetting } from '@/lib/seaSettings'
import type { FishSizeTier } from '@/lib/fishSize'
import { getBait } from '@/lib/bait'
import { streakMult, STREAK_XP_CAP } from '@/lib/perfectStreak'
import { getHook } from '@/lib/hooks'
import { getReel } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { holdContents } from '../fishing/holdActions'
import { setAutoFishing } from '../fishing/actions'
import FishCollectionDrawer from '@/app/(app)/fishing/FishCollectionDrawer'
import { claimZoneReward, prestigeZone, releaseAncient } from '@/app/(app)/fishing/actions'
import { markFinnRevealSeen } from '@/app/(app)/fishing/finnActions'
import { finnAncientBeat, type FinnAncientBeat } from '@/lib/finn'
import { ANCIENT_IDS } from '@/lib/ancientVigil'

/** Always last — the server gates it behind the other five, so its cinematic
 *  is the one that runs cold. Same literal FishingGame uses. */
const MEGALODON_ID = 143
import type { FishSpeciesBasic } from '@/app/(app)/fishing/constants'
// TYPE ONLY from SeaMap — a value import from there is a cycle, because SeaMap
// imports this file. The numbers come from the leaf.
import type { SeaLog } from './SeaMap'
import { HELM_D, HELM_BOTTOM } from './helm'

/**
 * WHERE THE CAST BUTTON SITS, so that it lands exactly on the helm.
 *
 * The wheel's centre is HELM_BOTTOM + HELM_D/2 off the bottom of the chart. The
 * cast slot is the same control in its other role, so its centre has to be at
 * the same height — and it is NOT the bottom-most thing in its column: the
 * secondary band (the Tide Turner, the auto toggle) sits under it and pushes it
 * up by its own height plus its margin.
 *
 * COUNT EVERY BAND, and the first pass did not. It subtracted the secondary
 * band and stopped, missing the tackle bar under it, so the button sat exactly
 * 40px above the wheel — small enough to look like a rounding problem and large
 * enough that the thumb had to move. Both are listed separately below so that
 * adding a third band is an obvious edit rather than a silent 40px again.
 *
 * Each entry is that band's own height PLUS the margin it puts above itself,
 * because this column has no `gap` — every band owns its own spacing.
 */
const TACKLE_BAR = 6 + 40               // margin + fixed height (the four menus)
const BELOW_CAST_SLOT = TACKLE_BAR
const ACTION_PAD_BOTTOM = HELM_BOTTOM - BELOW_CAST_SLOT
import { PHASE_LABEL, type SeaPhase } from '@/lib/seaClock'

/**
 * HOW FAST THE NEEDLE SWEEPS, and this was WRONG in a way that mattered.
 *
 * It was a flat 210 degrees a second for every fish and every reel. The fishing
 * screen rolls it per bite from FISH_DIFFICULTY_SPEED — 120-185 for a common,
 * 490-650 for the hardest — scaled by the equipped reel's own multiplier.
 *
 * So the map was making easy fish slightly HARDER than they should be and hard
 * fish about three times EASIER, and your reel did nothing at all out here.
 * That is not a presentation difference, it is a different game with the same
 * arithmetic behind it, and it is the sort of gap somebody eventually notices
 * is the cheapest place to farm legendaries.
 *
 * Rolled once per bite and held for the whole spin, exactly as the fishing
 * screen does — a mid-spin change reads as a stutter.
 */
function rollSweep(catchDifficulty: number, reelMult: number): number {
  const d = FISH_DIFFICULTY_SPEED[Math.max(0, Math.min(4, catchDifficulty - 1))]
  return (d.speedMin + Math.random() * (d.speedMax - d.speedMin)) * reelMult
}

/** `reeling` is the beat that was missing. The dial used to vanish on the same
 *  tick as the tap, so the needle never visibly LANDED — you tapped and the
 *  instrument was simply gone, which is why hitting a perfect felt like hitting
 *  nothing. Now the dial stays up, frozen on the angle that resolved, long
 *  enough to show the snap and the gold burst, and the card comes after. */
/** The elapsed-wait readout. Isolated so its interval re-renders a single <p>
 *  and not the dial, the bait row or anything else on screen. */
/**
 * THE RUNNING COUNT WHILE YOU WAIT, and the one thing on this overlay a
 * captain can switch off.
 *
 * It is here because the wait is three to twelve seconds and it is NOT a fixed
 * number: bait, rod and level all move it, so a running count is the only way
 * anybody can tell that their tackle is doing something. That is a real
 * argument and it does not apply to everybody. Once you know your gear works,
 * a stopwatch on a fishing trip is a stopwatch on a fishing trip, and watching
 * a number climb is the opposite of waiting on a bite.
 *
 * Off means the dots and the words, which is the version somebody who is not
 * measuring anything wants. See the settings disc, top right of the chart.
 */
function WaitTimer() {
  const [ms, setMs] = useState(0)
  const [show, setShow] = useState(true)
  // Read on mount rather than at module load: this remounts on every cast, and
  // a captain who turned it off mid-session should see that on the next one.
  useEffect(() => { setShow(getSetting('biteTimer')) }, [])
  useEffect(() => {
    const startedAt = Date.now()
    const id = window.setInterval(() => setMs(Date.now() - startedAt), 100)
    return () => clearInterval(id)
  }, [])
  if (!show) return null
  return (
    <p className="font-karla font-700" style={{
      fontSize: '0.816rem', color: 'rgba(190,212,228,0.55)', marginTop: 2,
      fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 8px rgba(0,0,0,0.9)',
    }}>{(ms / 1000).toFixed(1)}s</p>
  )
}

type Phase = 'idle' | 'waiting' | 'hooked' | 'reeling' | 'result'

/** How long the frozen dial holds before the card. A perfect earns longer:
 *  the burst ring runs 450ms and cutting it off is the whole complaint. */
const HOLD_MS = 620
const HOLD_PERFECT_MS = 900

/** EVERYTHING THE CAST ROLLED, carried through to the result.
 *
 *  castLine returns the jackpot multiplier, the double catch, the Locked-In
 *  haul and the crate tier, and the map was dropping all of them on the floor.
 *  The server still applied them — it rebinds every one of these off its own
 *  pending_cast token and ignores whatever the client claims — so the player
 *  was being PAID correctly and simply never told. */
type Hooked = {
  fishId: number
  catchDifficulty: number
  biteRarity: number
  sweep: number
  crateTier?: string
  jackpotMult?: number
  doubleCatch?: boolean
  catchQty?: number
  lockedStage?: number
  /** The Vigil rank this giant is being fought at. castLine has always
   *  returned it; out here nothing read it, so the dial never knew it was
   *  looking at an ancient. */
  vigilRank?: number
}

/** Everything the shared ResultCard needs. `reelIn` already returns all of it —
 *  the map was throwing it away and printing a name and an XP number. */
type Caught =
  | { kind: 'fish'; card: React.ComponentProps<typeof ResultCard> }
  | { kind: 'crate'; tier: string; loot: CrateLootView }
  | { kind: 'miss'; result: 'miss' | 'penalty' }

export type FishingMods = {
  /** The equipped reel's needle-speed multiplier. Lower is slower is easier,
   *  and leaving it out meant every reel tier was identical on the map. */
  reelSpeedMult: number
  /** Second Wind and its kin: chance to re-spin the dial after a miss or a
   *  snag instead of losing the fish. Purely client-side on the fishing screen
   *  too — the server never hears about a retry — so the map has to implement
   *  it or the effect simply does not exist out here. */
  rodRetryOnMiss: number
  /** Snag-immune rods turn a penalty into an ordinary miss BEFORE the result
   *  is sent, which is how the extra bait stops being taken. The server has no
   *  snagImmune handling at all, so sending it the raw 'penalty' means a
   *  snag-immune rod still pays the snag. */
  rodSnagImmune: boolean
  /** Multiplied XP on a perfect. The XP itself is server-computed either way;
   *  this is what lets the result card explain where it came from. */
  rodPerfectXpMult: number
  hookTier: number
  linePenalty: number
  /** Carried so the Loadout sheet can NAME the reel and the line. The numbers
   *  above drive the dial; a captain reading their kit wants "Bronze Reel", not
   *  a needle multiplier of 0.92. */
  reelTier: number
  lineTier: number
  rodCatchBonus: number
  rodPerfectBonus: number
  fishingLevel: number
}

/**
 * THE SHEET the bottom menus open into.
 *
 * Three of the four now open a panel, and the backdrop, the card, the spring,
 * the close button and the title were about to exist in triplicate. One shell
 * means they cannot drift into three slightly different modals, which is what
 * always happens otherwise.
 *
 * It scrolls internally rather than growing: the Loadout can be a long read on
 * a full rack and the hold can hold thirty species, and a sheet taller than the
 * screen has no way out on a phone.
 */
function Sheet({ title, blurb, onClose, children }: {
  title: string
  blurb?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <motion.div data-no-steer
      onClick={e => { e.stopPropagation(); onClose() }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 34, pointerEvents: 'auto',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '1.25rem', background: 'rgba(2,8,14,0.62)', backdropFilter: 'blur(3px)',
      }}>
      <motion.div onClick={e => e.stopPropagation()}
        initial={{ y: 26 }} animate={{ y: 0 }} exit={{ y: 20 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        style={{
          position: 'relative', width: '100%', maxWidth: 380,
          maxHeight: '70vh', overflowY: 'auto', overscrollBehavior: 'contain',
          borderRadius: 18, padding: '1rem',
          background: 'rgba(10,16,22,0.98)',
          border: '1px solid rgba(180,214,232,0.28)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        {/* OUT. Tapping the backdrop closed it, which is invisible — a gesture
            nobody is told about is not a way out. */}
        <button type="button" onClick={e => { e.stopPropagation(); onClose() }}
          aria-label="Close" title="Close"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 28, height: 28, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
            color: '#cfcabf', cursor: 'pointer', zIndex: 1,
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f2ead8', paddingRight: 34 }}>{title}</p>
        {blurb && (
          <p className="font-karla" style={{ fontSize: '0.888rem', color: '#9fb4c2', marginTop: 3, lineHeight: 1.55 }}>{blurb}</p>
        )}
        {children}
      </motion.div>
    </motion.div>
  )
}

/** A section heading inside a sheet. */
function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase" style={{
      fontSize: '0.66rem', letterSpacing: '0.14em',
      color: 'rgba(190,212,228,0.5)', marginTop: 14,
    }}>{children}</p>
  )
}

/** One line of the kit readout: what it is on the left, what it does on the
 *  right. Right-aligned and tabular so the numbers form a column. */
function StatRow({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'warn' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      padding: '0.36rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.816rem', color: 'rgba(190,212,228,0.72)' }}>{k}</span>
      <span className="font-karla font-700" style={{
        fontSize: '0.864rem', fontVariantNumeric: 'tabular-nums',
        color: tone === 'good' ? '#7fd6a0' : tone === 'warn' ? '#e8c98a' : '#f2ead8',
      }}>{v}</span>
    </div>
  )
}

/** One of the four menus along the bottom. Equal quarters on purpose: they are
 *  peers, and a row where one is wider reads as one being more important. */
const MENU_BTN: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 'var(--fh-menu-h)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 1, padding: '0 0.35rem', borderRadius: 10,
  background: 'rgba(6,14,22,0.86)',
  border: '1px solid rgba(255,255,255,0.16)',
  cursor: 'pointer', position: 'relative',
}
const MENU_KEY: React.CSSProperties = {
  fontSize: 'var(--fh-menu-key)', letterSpacing: '0.12em',
  color: 'rgba(190,212,228,0.5)', lineHeight: 1,
}
const MENU_VAL: React.CSSProperties = {
  fontSize: 'var(--fh-menu-val)', color: '#dfeaf2', lineHeight: 1.15,
  maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

export default function FishingHere({
  zone, bait, baitBonus, baitLeft, mods, fishingXP, auto, tideTurner, at,
  seaPhase, baitBag, onBaitChange, rack, activeRod, onRodChange, hold, log, renownPoints, onOpenRenown, onCaught,
  onReel,
  onBaitSpent, onPose, onBusy, onCanLeave, onLanded,
  spritesReady, onClose,
}: {
  zone: string
  bait: string
  baitBonus: number
  baitLeft: number
  mods: FishingMods
  onBaitSpent: (left: number | undefined) => void
  /** Which pose the captain should be in. The game already draws three — rod
   *  up, mid-cast, line in the water — so the map plays those rather than
   *  inventing a fourth. */
  /** For the level bar along the top. The map casts into the same XP pool, so
   *  it shows the same bar. */
  fishingXP: number
  /**
   * THE EQUIPPED KIT THAT THE CLIENT HAS TO DRIVE.
   *
   * Most specials need nothing here because the SERVER owns them: the Phantom
   * Hook's bait save, the Perfected Sigil's payout and the Primeval Eye's tiers
   * are all read off the profile inside castLine and reelIn, so they have been
   * working out here since the first cast whether or not anything said so.
   *
   * These three are different. They are not effects, they are BEHAVIOUR — a
   * loop that casts for you, a hand that reels for you, a button that throws a
   * fish back. Behaviour lives on the client, which is exactly why the map did
   * not have it.
   */
  auto: {
    /** 0 none, 1 Auto Caster, 2 Auto Catcher. */
    tier: 0 | 1 | 2
    /** Highest bite rarity the Catcher will reel unaided. Gauntlet upgrades
     *  push this from uncommons up to epics; legendaries always need a hand. */
    maxRarity: number
    /** Switched on, as the captain last left it. Persisted on the profile —
     *  see setAutoFishing. Not a default: a machine fishing for you should be
     *  running because you said so, and it should still be running the next
     *  time you pick the rod up. */
    on: boolean
  }
  tideTurner: { has: boolean; left: number }
  /** The sea's light, shown on the bar's row rather than in its own corner.
   *  Named seaPhase, not phase: this component already has a `phase` and it
   *  means something completely different. */
  seaPhase: SeaPhase
  /** Everything aboard, so the bait row is a real inventory rather than a
   *  readout of the one type the page happened to pick. */
  baitBag: { type: string; quantity: number }[]
  onBaitChange: (type: string) => void
  /** What is aboard and what it can take. The hold is the reason a session
   *  ends, so it belongs on screen while you are filling it. */
  hold: { count: number; capacity: number }
  /** Where the boat is, in world pixels — read fresh at every cast so a
   *  hotspot is judged on where the line ACTUALLY went in rather than on
   *  where you were when the rod came out. */
  at: React.RefObject<{ x: number; y: number }>
  /** Banked renown points, past Fishing 100. Undefined below the cap,
   *  which is what makes the bar's MAX chip inert rather than tappable. */
  renownPoints?: number
  onOpenRenown?: () => void
  /** Everything the collection log reads. */
  log: SeaLog
  /** THE RACK — the rods you brought. Swapping is limited to these, which is
   *  the entire mechanic: your loadout is a decision made ashore. */
  rack: { tier: number; name: string; slug: string | null; image: string | null; catchZoneBonus: number }[]
  activeRod: number
  onRodChange: (tier: number) => void
  /** How many fish this catch actually banked, so the hold ticks up as you
   *  fill it rather than sitting at whatever it was when the page loaded. */
  onCaught: (qty: number) => void
  /**
   * EVERY REEL, WON OR LOST, with the server's own numbers.
   *
   * Finn's bets are settled server-side against `current_perfect_streak` and
   * the lifetime catch table, both of which reelIn already maintains — so this
   * is not the source of truth for anything, it is the nudge that tells the
   * chart it is worth ASKING. Without it a finished bet would sit unsettled
   * until the player happened to close the rod.
   *
   * `caught` is fish that actually went into the hold, which is the same number
   * the server's lifetime table gets, so the two cannot drift.
   */
  onReel?: (r: { perfectStreak: number; caught: number }) => void
  onPose: (pose: 'rest' | 'wait' | 'cast') => void
  /**
   * SOMETHING CAME UP. Fired the instant the needle is judged a catch, not
   * when the card lands: the map puts a fish through the surface out on the
   * water and it has to be back down by the time the card arrives. See
   * seaSplash for the timing, and the hold below for the window it sits in.
   */
  onLanded: (perfect: boolean) => void
  /** Told when the dial is up, so the map can stop moving entirely behind it.
   *  See the note on the freeze in SeaMap. */
  onBusy: (busy: boolean) => void
  /** Whether the rod can simply be stowed right now. The map uses it to let a
   *  tap on open water end the session — which it has to do rather than this
   *  component, because this component cannot receive that tap. */
  onCanLeave: (can: boolean) => void
  /** False until every frame of the loadout has been fetched AND decoded. The
   *  cast waits on it, because the pose swaps four images at once and an
   *  undecoded one paints a frame or two late — which is the base sprite
   *  changing pose while the boat is still in the old one. See SeaMap. */
  spritesReady: boolean
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState('')
  const [hooked, setHooked] = useState<Hooked | null>(null)
  const [caught, setCaught] = useState<Caught | null>(null)
  const [angle, setAngle] = useState(0)
  // THE TACTILE HIT, and it was here the whole time. DialSVG already draws the
  // snap-and-ripple on reel and the gold burst on a perfect — it just needs to
  // be TOLD, via these two counters. The map was rendering the dial without
  // them, so the instrument was correct and completely mute.
  const [snapKey, setSnapKey] = useState(0)
  /**
   * WHERE THE ZONE LAYOUT SITS, rolled fresh for every attempt.
   *
   * The original fishing screen rotates the whole wheel by a random amount on
   * every hook (`Math.floor(Math.random() * 360)` in FishingGame), and the port
   * dropped it — so out here the perfect wedge sat at the same clock position
   * on every cast, forever. A fixed layout is learnable by SCREEN POSITION:
   * stop reading the dial, start timing "2 o'clock", and perfects stop being
   * earned — which matters, because perfects drive the streak and Finn's bets.
   *
   * Ref + state pair for the same reason angle has one: the resolution reads
   * the ref in the tap's own tick, the SVG renders the state.
   */
  const zoneRotRef = useRef(0)
  const [zoneRot, setZoneRot] = useState(0)
  const [burstKey, setBurstKey] = useState(0)

  const angleRef = useRef(0)
  /** The speed rolled for THIS bite. In a ref so the rAF reads it without the
   *  sweep effect being rebuilt when it changes. */
  const sweepRef = useRef(210)
  const runningRef = useRef(false)
  /** The Lightsaber's Lightspeed cue. The rod flashed the fish onto the line
   *  and the map was saying nothing about it. */
  const [instantBite, setInstantBite] = useState(false)
  // THREE overlapping timers, three refs. The cast splash, the pose flip and
  // the bite all run at once, and sharing a handle means the second assignment
  // orphans the first — which is how unmounting mid-cast could still fire a
  // pose change at a component that no longer exists, and how the pose flip
  // would silently vanish whenever the server answered inside 650ms.
  const poseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sfxRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * IS THIS ONE OF THE SIX GIANTS?
   *
   * The same test the fishing screen uses: an ancient_deep fish with no sell
   * value, which is what a trophy is. Out here nothing asked, so a Megalodon
   * came up on the ordinary blue-and-gold dial — the same fight, dressed as a
   * mackerel, depending on which door you came through.
   */
  const ancientFight = useMemo(() => {
    if (!hooked) return false
    const f = log.allFishSpecies.find(x => x.id === hooked.fishId)
    return f?.habitat === 'ancient_deep' && (f.sell_value ?? 0) === 0
  }, [hooked, log.allFishSpecies])

  const zones: ZoneDef[] = useMemo(() => {
    if (!hooked) return []
    const zd = ZONE_DIFFICULTY[zone] ?? ZONE_DIFFICULTY.shallows
    const base = buildFishZones(
      hooked.catchDifficulty,
      mods.hookTier,
      mods.linePenalty,
      zd.catchMultiplier,
      levelCatchBonus(mods.fishingLevel) + baitBonus + mods.rodCatchBonus,
      mods.rodPerfectBonus + 1,
    )
    // The eldritch palette, at the rank being fought. Shared with the fishing
    // screen rather than copied — see lib/ancientDial.
    return ancientFight ? applyAncientPalette(base, hooked.vigilRank) : base
  }, [hooked, zone, mods, baitBonus, ancientFight, log.allFishSpecies])

  // THE DIAL IS THE ONLY THING THAT MATTERS while it is up. Announced to the
  // map so it can stop its whole loop rather than competing for frames with the
  // one instrument the player is actually reading.
  useEffect(() => {
    const busy = phase === 'hooked' || phase === 'reeling'
    onBusy(busy)
    return () => onBusy(false)
  }, [phase, onBusy])

  useEffect(() => {
    // Settled means idle or result. NOT during the wait — a cast is already
    // paid for and in the water by then, and walking away from it costs the
    // bait and the streak.
    onCanLeave(phase === 'idle' || phase === 'result')
    return () => onCanLeave(false)
  }, [phase, onCanLeave])

  /** THE PERFECT. The fishing screen throws a gold wash, two expanding rings
   *  and the word across the screen. The map fired the sound and the haptic and
   *  then said nothing at all, which makes the best outcome in the game look
   *  identical to an ordinary one. */
  const [perfectFlash, setPerfectFlash] = useState(false)
  /** The running streak, straight off the server's own count, for the bar. */
  const [streak, setStreak] = useState(0)
  /** XP floated off the boat, where the boat is. */
  const [xpPop, setXpPop] = useState<{ id: number; value: number } | null>(null)

  /**
   * THE BAR HAS TO MOVE.
   *
   * `fishingXP` is a prop: what the server knew when the CHART loaded. It never
   * changes again while you fish, so the bar at the top sat perfectly still for
   * a whole session and only jumped once you stowed the rod and the page
   * refetched. The floating "+140 XP" was the only sign anything had happened,
   * and a number that flies away is not a progress bar.
   *
   * Live locally, seeded from the prop, and every reel adds what the SERVER
   * said it granted. Never a number computed here: reelIn applies prestige,
   * renown, the rod's perfect multiplier and the streak, and a client that
   * guessed at that would drift within a dozen casts.
   *
   * The resync matters as much as the seed. A server prop copied into state
   * once goes stale the moment anything else moves the same value — a trawl
   * paying out, a level reward landing — so it re-seeds whenever the prop
   * actually changes.
   */
  const [xp, setXp] = useState(fishingXP)
  useEffect(() => { setXp(fishingXP) }, [fishingXP])

  /**
   * RENOWN, PAST 100. One banked point per level crossed, and the overlay that
   * says so was mounted on the fishing screen only — so a captain at the cap
   * earned renown out here and nothing ever told them.
   *
   * Derived from XP exactly as the fishing screen derives it, which is only
   * possible now that the XP above is live rather than a load-time snapshot.
   */
  const [renownUp, setRenownUp] = useState<RenownUpInfo | null>(null)

  /** Does the result card actually need to scroll? Measured, and only after it
   *  has finished arriving — see the note on the container. */
  const cardScrollRef = useRef<HTMLDivElement | null>(null)
  /** The flexible area the card lives in, measured so the cap is a real number
   *  of pixels. `maxHeight: 100%` was never doing anything: the percentage
   *  resolves against a parent whose own height is auto, which makes it
   *  indefinite, which makes max-height compute to `none`. */
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [cardCap, setCardCap] = useState<number | null>(null)
  const [cardScrolls, setCardScrolls] = useState(false)
  useEffect(() => {
    if (phase !== 'result') { setCardScrolls(false); return }
    let raf = 0
    const measure = () => {
      const el = cardScrollRef.current
      const area = contentRef.current
      if (!el || !area) return
      const avail = area.clientHeight
      setCardCap(avail)
      // A pixel of slack: sub-pixel layout rounding should not be a scrollbar.
      setCardScrolls(el.scrollHeight > avail + 1)
    }
    // Settled is a real flag, not the timer id — the observer fires during the
    // entrance too, and gating on a truthy timeout id would have let every one
    // of those measurements through, which is the flash all over again.
    let settled = false
    const t = window.setTimeout(() => {
      settled = true
      raf = requestAnimationFrame(measure)
    }, 420)
    // Re-measured if anything inside changes size AFTER that — a late image, a
    // wormhole reroll, the shiny choice resolving into a smaller card.
    const el = cardScrollRef.current
    const ro = el ? new ResizeObserver(() => { if (settled) measure() }) : null
    if (el && ro) ro.observe(el)
    return () => { window.clearTimeout(t); cancelAnimationFrame(raf); ro?.disconnect() }
  }, [phase, caught])

  /** THE CAST IS A BEAT, and the wait does not start until it is over.
   *
   *  The rod comes over, the line goes out, and only THEN are you waiting on a
   *  fish. Showing the dots, the words and a running clock from the instant the
   *  button is pressed narrates a wait that has not begun — and starts the
   *  timer while the rod is still in the air, which makes it wrong as well as
   *  early. 1500ms, matching the fishing screen's own castAnimDone.
   *
   *  An instant bite lands before this and the wait UI never appears at all,
   *  which is correct: there was no wait. */
  const [castAnimDone, setCastAnimDone] = useState(false)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [tackleOpen, setTackleOpen] = useState(false)
  const [loadoutOpen, setLoadoutOpen] = useState(false)
  /** The hold's CONTENTS, fetched when the sheet opens rather than held live.
   *  What is aboard changes once per catch and is read about once a session, so
   *  polling it would be paying constantly for a number nobody is looking at. */
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdRows, setHoldRows] = useState<{ fishId: number; qty: number }[] | null>(null)

  // ── THE COLLECTION LOG ─────────────────────────────────────────────────
  // The drawer is the fishing page's own, extracted. Everything it mutates is
  // held here, seeded from the server read, so a claim or a prestige lands on
  // the screen without a round trip through the page.
  const [logOpen, setLogOpen] = useState(false)
  const [caughtIds, setCaughtIds] = useState(() => new Set(log.caughtFishIds))
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [uncheckedNew, setUncheckedNew] = useState<Set<number>>(new Set())

  /**
   * OPENING THE LOG COUNTS AS SEEING IT.
   *
   * The drawer only ever cleared an id when the captain tapped that individual
   * fish's card, which nobody intuits — so the zone's "3 NEW" pill and the
   * green dot on the Log button stayed lit forever, through opening the drawer,
   * reading the zone, and closing it again. A notification that will not go out
   * stops being a notification and becomes decoration.
   *
   * Cleared on the open -> CLOSED transition rather than on open, so the pills
   * are still there to guide you while you are actually looking at the list —
   * they are how you know which zone to expand. The fishing screen resolved
   * this the same way and this port simply never carried the effect over.
   */
  const wasLogOpen = useRef(false)
  useEffect(() => {
    if (wasLogOpen.current && !logOpen) setUncheckedNew(new Set())
    wasLogOpen.current = logOpen
  }, [logOpen])
  const [claimedZones, setClaimedZones] = useState(log.zoneRewardsClaimed)
  const [claimingZone, setClaimingZone] = useState<string | null>(null)
  const mountedSet = useMemo(() => new Set(log.mountedFishIds), [log.mountedFishIds])
  const ancientSet = useMemo(() => new Set(log.ancientCatches), [log.ancientCatches])
  /**
   * THE TROPHY WALL'S RANKS, held locally so a release lands immediately.
   *
   * Seeded from the server's copy, the same shape every other log slice on this
   * screen uses — the prop is a snapshot from page load and cannot hear about a
   * release that happens after it.
   */
  const [vigil, setVigil] = useState(log.ancientVigil)
  /** The giant being let go, if any. */
  const [releasing, setReleasing] = useState<FishSpeciesBasic | null>(null)
  /** The landing ceremony, in the order it plays. */
  const [slain, setSlain] = useState<{
    fish: FishSpecies; count: number; total: number; isMegalodon: boolean
    finnBeat: FinnAncientBeat | null
  } | null>(null)
  const [finnBeat, setFinnBeat] = useState<FinnAncientBeat | null>(null)
  const [rankUp, setRankUp] = useState<{ name: string; from: number; to: number; petGranted: boolean } | null>(null)
  const [capstone, setCapstone] = useState(false)
  /** Trophies landed, local so the "N of 6" count is right on the sixth. */
  const [trophies, setTrophies] = useState<Set<number>>(() => new Set(log.ancientCatches))
  const [prestigeLevels, setPrestigeLevels] = useState(log.prestigeLevels)
  const [goldenBoosts, setGoldenBoosts] = useState(log.goldenBoosts)
  const [prestigingZone, setPrestigingZone] = useState<string | null>(null)
  const [confirmPrestigeZone, setConfirmPrestigeZone] = useState<string | null>(null)

  /** A fish you have just landed is a fish you have logged. Without this the
   *  drawer disagrees with the result card you are still looking at. */
  const logCatch = useCallback((fishId: number) => {
    setCaughtIds(prev => (prev.has(fishId) ? prev : new Set(prev).add(fishId)))
    setUncheckedNew(prev => (prev.has(fishId) ? prev : new Set(prev).add(fishId)))
  }, [])

  async function claimZone(zone: string) {
    if (claimingZone) return
    setClaimingZone(zone)
    const res = await claimZoneReward(zone).catch(() => null)
    if (res && !('error' in res)) {
      setClaimedZones(prev => ({ ...prev, [zone]: true }))
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    }
    setClaimingZone(null)
  }

  async function doPrestige(zone: string) {
    if (prestigingZone) return
    setPrestigingZone(zone); setConfirmPrestigeZone(null)
    const res = await prestigeZone(zone).catch(() => null)
    if (res && !('error' in res)) {
      setPrestigeLevels(prev => ({ ...prev, [zone]: res.prestigeLevel }))
      if (res.goldenBoost != null) setGoldenBoosts(prev => ({ ...prev, [zone]: res.goldenBoost as number }))
      // A prestige WIPES the zone's collection, so the drawer has to forget it
      // or every species in that zone still reads as logged.
      const wiped = new Set(caughtIds)
      for (const f of log.allFishSpecies) if (f.habitat === zone) wiped.delete(f.id)
      setCaughtIds(wiped)
      setClaimedZones(prev => ({ ...prev, [zone]: false }))
    }
    setPrestigingZone(null)
  }

  const activeBaitDef = getBait(bait)
  /** Bait cannot change with a line already in the water: the fish has been
   *  rolled, and swapping would move the odds of something already decided. */
  const canSwapBait = phase === 'idle' || phase === 'result'
  const holdFull = hold.count >= hold.capacity
  const outOfBait = baitLeft <= 0
  /** A CAST THAT CANNOT BANK ANYTHING IS NOT A CAST. reelIn clamps catchQty to
   *  the space actually left, so with a full hold you would play the whole loop
   *  — bait spent, dial spun, fish landed — and bank nothing, with nothing on
   *  screen saying why. The fishing screen refuses the cast outright and so does
   *  this. */
  const canCast = spritesReady && !holdFull && !outOfBait
  const [retryFlash, setRetryFlash] = useState(false)
  const [sigilPaid, setSigilPaid] = useState(0)
  /** A SHINY MUST BE RESOLVABLE WHERE IT WAS CAUGHT — sellGoldenTrophy and
   *  mountGoldenTrophy exist only on the fishing screen, so a golden fish
   *  landed out here would otherwise sit in shiny_catches with no surface
   *  anywhere in the app to sell or mount it. */
  const [shiny, setShiny] = useState<{ id: number; alreadyMounted: boolean } | null>(null)
  /** The Galaxy Rod's one-shot reroll, offered by the server on eligible
   *  catches and simply never surfaced out here. */
  const [wormhole, setWormhole] = useState(false)
  const [busyChoice, setBusyChoice] = useState(false)
  const [choiceNote, setChoiceNote] = useState('')

  // ── THE SWEEP, ON THE COMPOSITOR ─────────────────────────────────────────
  //
  // This used to be a rAF that called setAngle sixty times a second, which
  // re-rendered this component and the whole dial on every single frame — the
  // reconciler running flat out for the entire time the needle was up, which is
  // most of why the dial phase dropped frames.
  //
  // The fishing screen does not do that and never did. It hands the rotation to
  // the Web Animations API on the needle's own composited layer, so the needle
  // spins on the compositor thread and main-thread work cannot make it skip.
  // The angle is then DERIVED from the animation's own clock whenever anybody
  // asks, rather than stored. Zero renders per frame.
  /**
   * A CALLBACK REF, not a plain one, and this is what fixes the needle sitting
   * still after a cast.
   *
   * The spin used to start in an effect keyed on `phase`. That worked until the
   * content area became one AnimatePresence with mode="wait" — which is the
   * whole point of mode="wait": the previous child finishes leaving BEFORE the
   * next one mounts. So when the phase turned to 'hooked', the effect ran while
   * the waiting-dots were still exiting and the dial did not exist yet.
   * needleRef.current was null, startSpin bailed out, and nothing ever started
   * it again.
   *
   * Hooking the node itself means the spin begins the moment the needle is
   * actually in the document, whenever that turns out to be.
   */
  const needleEl = useRef<HTMLDivElement | null>(null)
  /** The zones group inside the dial, for the crossing paint's arc weights. */
  const zonesGroupEl = useRef<SVGGElement | null>(null)
  /** The wedge the needle was last seen in, by its `from` edge. -1 forces the
   *  first frame of every spin to paint. */
  const lastZoneFromRef = useRef(-1)
  const needleRef = useCallback((el: HTMLDivElement | null) => {
    needleEl.current = el
    if (el && phaseRef.current === 'hooked') startSpinRef.current?.(angleRef.current)
  }, [])
  /** Both mirrored, because the callback ref above is created once. */
  const phaseRef = useRef<Phase>('idle')
  const startSpinRef = useRef<((from: number) => void) | null>(null)
  const spinRef = useRef<Animation | null>(null)
  const spinStart = useRef<number | null>(null)
  const spinFrom = useRef(0)
  /**
   * MEASURED FRAME DURATION, an EMA of real rAF deltas.
   *
   * Needed for the forward-predictive freeze below, and it has to be MEASURED
   * rather than assumed: a 120Hz phone projects ~8ms and a struggling one ~33ms,
   * and using the wrong number is the difference between the freeze landing
   * where you tapped and landing a zone away.
   *
   * This is the only rAF in this component, and it carries exactly two jobs:
   * timing frames, and the ZONE-CROSSING PAINT below — the needle recolouring
   * to the wedge it is sweeping and that wedge's arc brightening, the tell the
   * original dial has and the port dropped ("the needle used to change colours
   * and now it just stays yellow"). The paint is imperative for the reason
   * FishingGame's is: it fires mid-spin, and a setState per crossing is 6-10
   * full re-renders per revolution on the exact frames that must not hitch.
   * React never hears about it; a stray parent re-render can reset the
   * attributes and the next crossing repaints them within ~150ms.
   */
  const frameDur = useRef(16.7)
  useEffect(() => {
    if (phase !== 'hooked') return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (last) {
        const d = t - last
        // Ignore degenerate deltas: first frame, tab refocus, GC stalls.
        if (d >= 4 && d <= 40) frameDur.current = frameDur.current * 0.8 + d * 0.2
      }
      last = t

      // ── THE CROSSING PAINT ──────────────────────────────────────────
      // Same weights as FishingGame's: the wedge under the needle at full
      // strength, perfects half-lit so they stay findable, everything else
      // dimmed. Only writes on an actual crossing.
      const zs = zonesRef.current
      if (zs.length > 0) {
        const rel = (((resolveAngle() - zoneRotRef.current) % 360) + 360) % 360
        const zNow = zs.find(z => rel >= z.from && rel < z.to) ?? zs[0]
        if (zNow.from !== lastZoneFromRef.current) {
          lastZoneFromRef.current = zNow.from
          const ng = needleEl.current
          if (ng) {
            ng.querySelectorAll('line').forEach(l => l.setAttribute('stroke', zNow.color))
            ng.querySelector('circle')?.setAttribute('fill', zNow.color)
          }
          const zg = zonesGroupEl.current
          if (zg) {
            zg.querySelectorAll<SVGPathElement>('path[data-zone-arc]').forEach((pth, i) => {
              const z = zs[i]
              if (!z) return
              const op = z.from === zNow.from ? 1.0 : z.type === 'perfect' ? 0.50 : z.type === 'penalty' ? 0.45 : 0.28
              pth.setAttribute('fill-opacity', String(op))
            })
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  /** Where the needle is RIGHT NOW, off the same clock the animation runs on,
   *  so what resolves is exactly what is on the glass. */
  const angleNow = useCallback(() => {
    if (spinRef.current && spinStart.current !== null) {
      const tl = document.timeline?.currentTime
      const t = typeof tl === 'number' ? tl : performance.now()
      const a = spinFrom.current + sweepRef.current * (t - spinStart.current) / 1000
      return ((a % 360) + 360) % 360
    }
    return angleRef.current
  }, [])

  /**
   * THE ANGLE THAT DECIDES, and the only one anything is allowed to ask for.
   *
   * The needle runs on the compositor and the main thread reads
   * document.timeline a commit or two behind the glass, so the freeze resolves
   * one measured frame AHEAD — forward-only, because a prediction error in the
   * direction of travel is invisible at spin speed and a back-step is not.
   * That protocol is right and stays.
   *
   * What was wrong is that only the SCORE used it. The crossing paint — the
   * thing that turns the needle gold — read the live angle instead, so the two
   * disagreed by exactly one frame of travel:
   *
   *     difficulty 5, 650 deg/s, one frame at 60Hz  =  10.8 degrees
   *     a perfect band                              =   6 degrees
   *
   * The needle could be painted gold while the tap resolved most of TWO bands
   * further on. That is not a feel problem to be tuned, it is two clocks, and
   * no amount of tuning makes two clocks agree.
   *
   * Now there is one. Gold means "tap on this frame and it is a perfect",
   * because the paint and the score are the same number.
   */
  const resolveAngle = useCallback(() => {
    // Capped so a stalled frame cannot balloon the prediction and overshoot a
    // tight perfect.
    const lookaheadMs = Math.min(frameDur.current, 20)
    const a = angleNow() + sweepRef.current * lookaheadMs / 1000
    return ((a % 360) + 360) % 360
  }, [angleNow])

  const startSpin = useCallback((from: number) => {
    // A fresh spin paints from its first frame — see lastZoneFromRef.
    lastZoneFromRef.current = -1
    const el = needleEl.current
    spinRef.current?.cancel()
    spinRef.current = null
    spinStart.current = null
    spinFrom.current = from
    if (!el || typeof el.animate !== 'function' || sweepRef.current <= 0) return
    try {
      const anim = el.animate(
        [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${from + 360}deg)` }],
        { duration: 360_000 / sweepRef.current, iterations: Infinity },
      )
      // Pin the start time synchronously, or the animation begins "when ready"
      // — up to a frame later — and the maths and the picture disagree by
      // however long that took.
      const t0 = document.timeline?.currentTime
      if (typeof t0 === 'number') anim.startTime = t0
      spinRef.current = anim
      spinStart.current = typeof t0 === 'number' ? t0 : performance.now()
    } catch {
      spinRef.current = null
      spinStart.current = null
    }
  }, [])

  phaseRef.current = phase
  startSpinRef.current = startSpin
  useEffect(() => {
    if (phase !== 'hooked') {
      if (phase !== 'reeling') { spinRef.current?.cancel(); spinRef.current = null; spinStart.current = null }
      return
    }
    // Covers the case where the node is ALREADY mounted when the phase turns —
    // a retry re-spins without the dial ever leaving. The callback ref covers
    // the other case, where the node arrives after.
    if (needleEl.current) startSpin(angleRef.current)
    return () => { spinRef.current?.cancel(); spinRef.current = null; spinStart.current = null }
  }, [phase, startSpin])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (poseRef.current) clearTimeout(poseRef.current)
    if (sfxRef.current) clearTimeout(sfxRef.current)
    if (animRef.current) clearTimeout(animRef.current)
  }, [])

  /**
   * PUT THE LINE IN.
   *
   * `fromResult` is how you cast straight out of a result card without an idle
   * beat in between. It exists because the phase guard below was silently
   * eating every automatic cast: the auto loop fires at phase 'result' and
   * called this, which returned immediately because the phase was not 'idle'.
   * Auto-casting never worked out here, for either tier of the item.
   *
   * It replaces a queueMicrotask dance that set phase to 'idle' and then hoped
   * the re-render had committed before the microtask ran. That is a race with
   * React's scheduler, and it was the same race whether a human or the loop
   * pressed the button. Casting does not need to pass through idle: this sets
   * the phase to 'waiting' itself, three lines down.
   */
  const cast = useCallback((fromResult = false) => {
    if ((!fromResult && phase !== 'idle') || !canCast) return
    setErr('')
    setCaught(null)
    // THE DIAL FLASHING AFTER REEL IN. `hooked` used to be cleared the instant
    // the server answered, which emptied `zones` while the dial was still
    // playing its 140ms exit — so every arc vanished a frame before the dial
    // did and the whole instrument appeared to blink. It is cleared HERE
    // instead, at the start of the next cast, by which point nothing is
    // looking at it.
    setHooked(null)
    setCastAnimDone(false)
    if (animRef.current) clearTimeout(animRef.current)
    animRef.current = setTimeout(() => setCastAnimDone(true), 1500)
    setShiny(null)
    setWormhole(false)
    setChoiceNote('')
    setPhase('waiting')
    vibrate(12)
    // The first Cast is the user gesture the AudioContext needs, so the unlock
    // rides on it. This wires the graph and decodes the SFX buffers WITHOUT
    // starting the soundtrack — the map is not the fishing screen and should
    // not seize the music. Every call after the first is a no-op.
    unlockFishingAudio()
    playCastSfx()
    // THE CAST IS A BEAT, not a state change. Rod comes over, and only once it
    // has does the line settle into the water. Skipping it was most of why
    // pressing Cast looked like nothing had happened: the pose never changed
    // and the only feedback was six small words for the several seconds the
    // server makes you wait for a bite.
    onPose('cast')
    // 600 then 650, lifted from FishingGame rather than picked. The gap is
    // deliberate there: Web Audio's BufferSource.start has ~30-60ms of startup
    // latency on iOS, so the splash is fired 50ms AHEAD of the pose flip to
    // land with it. I had both at 460, which was both the wrong tempo and the
    // sound arriving after the line.
    sfxRef.current = setTimeout(() => playCast2Sfx(), 600)
    poseRef.current = setTimeout(() => onPose('wait'), 650)
    castLine(bait, zone, at.current ? { x: at.current.x, y: at.current.y } : undefined).then(res => {
      if ('error' in res) { setErr(res.error); setPhase('idle'); onPose('rest'); return }
      onBaitSpent(res.baitRemaining)
      // The server decides how long the fish takes to come. Honoured rather
      // than hurried: the wait is the tension.
      // Floored above the 650ms cast animation: an instant bite that landed
      // mid-cast would put the dial up while the rod was still coming over.
      const wait = Math.max(760, res.instantBite ? 820 : res.waitMs)
      timerRef.current = setTimeout(() => {
        angleRef.current = 0
        setAngle(0)
        // The wheel lands somewhere new every hook — see zoneRotRef.
        zoneRotRef.current = Math.floor(Math.random() * 360)
        setZoneRot(zoneRotRef.current)
        sweepRef.current = rollSweep(res.catchDifficulty, mods.reelSpeedMult)
        setHooked({
          fishId: res.fishId,
          catchDifficulty: res.catchDifficulty,
          biteRarity: res.biteRarity,
          sweep: sweepRef.current,
          crateTier: res.crateTier,
          jackpotMult: res.jackpotMult,
          doubleCatch: res.doubleCatch,
          catchQty: res.catchQty,
          vigilRank: res.vigilRank,
          lockedStage: res.lockedStage,
        })
        setPhase('hooked')
        vibrate([0, 26, 40, 18])
      }, wait)
      // Lightsaber Lightspeed cue, fired at the CAST rather than the bite —
      // the whole point of it is that the wait did not happen.
      if (res.instantBite) {
        setInstantBite(true)
        setTimeout(() => setInstantBite(false), 1100)
      }
    }).catch((e: unknown) => {
      // NO CATCH HERE MEANT NOTHING EVER HAPPENED. A server action that rejects
      // rather than returning { error } skipped the whole .then, so the line
      // stayed out, the pose stayed in the water, and the dial never came —
      // silently, forever. Anything that can leave the loop stuck has to say so.
      setErr(e instanceof Error ? e.message : 'The line came back empty. Try again.')
      setPhase('idle')
      onPose('rest')
    })
  }, [phase, canCast, bait, zone, mods.reelSpeedMult, onBaitSpent, onPose])

  const strike = useCallback(() => {
    if (phase !== 'hooked' || !hooked) return
    // FREEZE FIRST. The angle that resolves is the angle that was on screen when
    // the thumb landed — read once, then stop the sweep. Reading it after the
    // stop would judge a needle that had moved on.
    // FREEZE FIRST, and freeze at the angle the ANIMATION is showing rather
    // than a number React last heard about. They are the same thing by
    // construction now: angleNow derives from the compositor animation's own
    // clock, so what resolves is exactly what is on the glass.
    // ── THE FORWARD-PREDICTIVE FREEZE ───────────────────────────────────
    //
    // Freezing at angleNow() is what made the needle snap BACKWARDS on a phone,
    // and no amount of ordering fixes it, because the problem is not ordering.
    // The needle runs on the COMPOSITOR. The main thread samples
    // document.timeline, which is one to two commits behind what is actually on
    // the glass — so the angle we can read is genuinely behind the angle you
    // can see, and freezing at it moves the needle back to where it was a frame
    // or two ago.
    //
    // So the freeze resolves at where the needle WILL be, one measured frame
    // ahead. Forward-only, by construction: any prediction error is a tiny skip
    // in the direction the needle was already travelling, which is invisible at
    // spin speed, and never a back-step, which is not.
    //
    // This is the protocol the fishing screen settled on after a rejected
    // alternative (an eased settle back to the tap angle read as "it moves back
    // into position", and was worse). REEL_LOOKAHEAD there is 1 frame — 2 read
    // aggressive. Capped at 20ms so a stalled frame cannot balloon the
    // prediction and overshoot a tight perfect.
    const at = resolveAngle()
    angleRef.current = at

    // WRITE THE RESTING ANGLE BEFORE CANCELLING, and that order is the whole
    // fix for the needle jumping backwards.
    //
    // A WAAPI animation outranks inline style, so while it is running this
    // assignment is invisible. Cancel it and the element falls back to whatever
    // style says — and `setAngle` is a React update that has not committed yet,
    // so for a frame or two "whatever style says" was the angle from the LAST
    // render, which is where the needle was when the fish bit. That is the
    // bounce: not a wobble, a snap back to the start and then forward again.
    //
    // Putting the frozen angle into inline style first means there is no gap:
    // the instant the animation lets go, the correct transform is already
    // sitting underneath it.
    const nEl = needleEl.current
    if (nEl) nEl.style.transform = `rotate(${at}deg)`
    setAngle(at)
    spinRef.current?.cancel()
    spinRef.current = null
    spinStart.current = null
    // Resolved against the ROTATED layout, exactly as drawn — the same
    // subtraction FishingGame's getZone does, so the wedge under the frozen
    // needle and the wedge that pays are the same wedge by construction.
    const rotAt = (((at - zoneRotRef.current) % 360) + 360) % 360
    const hit = zones.find(z => rotAt >= z.from && rotAt < z.to)
    const raw = (hit?.type ?? 'miss') as 'perfect' | 'catch' | 'miss' | 'penalty'
    // SNAG IMMUNITY IS CLIENT-SIDE, on both screens. The server has no notion
    // of it — the fishing screen turns a penalty into a plain miss before it
    // sends the result, and that is the only reason the extra bait is not
    // taken. Sending the raw penalty from here meant a snag-immune rod still
    // paid the snag every time.
    const result = (raw === 'penalty' && mods.rodSnagImmune) ? 'miss' : raw
    const perfect = result === 'perfect'
    const isCatch = result === 'perfect' || result === 'catch'

    // SECOND WIND. Another effect the server never hears about: on a miss or a
    // snag the rod may simply hand the dial back, with the zones rotated and
    // the needle re-seated so it is a fresh attempt rather than the same one.
    // No reelIn call at all, which is what leaves the cast token alive for the
    // retry to resolve against.
    if (!isCatch && mods.rodRetryOnMiss > 0 && Math.random() < mods.rodRetryOnMiss) {
      setRetryFlash(true)
      setTimeout(() => setRetryFlash(false), 1200)
      angleRef.current = Math.random() * 360
      setAngle(angleRef.current)
      // A second wind is a fresh attempt, so it gets a fresh layout too —
      // same as the fishing screen's retry.
      zoneRotRef.current = Math.floor(Math.random() * 360)
      setZoneRot(zoneRotRef.current)
      startSpin(angleRef.current)
      setSnapKey(k => k + 1)
      vibrate([0, 20, 50, 20])
      return
    }

    // THE HIT, in the tap's own JS tick — same order the fishing screen uses.
    // Sound and haptic go first because they are the ones you FEEL as
    // simultaneous; the dial's snap and burst paint on the commit that follows.
    // The haptic patterns are lifted from FishingGame rather than invented: a
    // perfect is a distinct three-pulse buzz and everything else is a single
    // short tick that only says "registered". Two different signals is the
    // whole point, and the map had been giving three vague ones.
    if (perfect) {
      playPerfectSfx(); vibrate([40, 60, 80]); setBurstKey(k => k + 1)
      setPerfectFlash(true)
      setTimeout(() => setPerfectFlash(false), 1400)
    }
    else vibrate(6)
    // ── AND OUT ON THE WATER ──────────────────────────────────────────
    // On the tap's own tick, alongside the sound and the haptic, because those
    // three are the ones a player reads as simultaneous. The arc runs for 520ms
    // (700 on a perfect) inside a hold of 620 (900), so the fish is back under
    // as the card comes up rather than fighting it for attention.
    //
    // A MISS AND A PENALTY GET NOTHING, which is the point: the splash has to
    // mean you landed it, or it is just weather.
    if (result === 'perfect' || result === 'catch') onLanded(perfect)
    setSnapKey(k => k + 1)
    setPhase('reeling')
    onPose('rest')

    // The dial holds, frozen, while the server resolves. Both have to finish
    // before the card: landing on the answer before the needle has visibly
    // stopped is exactly the "no response" the reel had.
    const held = new Promise<void>(r => setTimeout(r, perfect ? HOLD_PERFECT_MS : HOLD_MS))

    // ── A CRATE IS NOT A FISH, and the map was destroying them ──────────
    //
    // castLine can hand back a CRATE instead of a fish, and a crate has to be
    // reeled with reelCrate. Passing one to reelIn does not fail loudly: reelIn
    // sees CRATE_FISH_ID on its own pending_cast token, returns { caught:
    // false } — and the token is ALREADY consumed by the atomic claim above
    // that line. So the crate was spent, nothing was granted, and the player
    // was shown "it got away". Every crate anyone pulled up on this map was
    // quietly thrown overboard.
    if (hooked.crateTier) {
      const tier = hooked.crateTier as CrateTierId
      const isCatch = result === 'perfect' || result === 'catch'
      if (!isCatch) {
        held.then(() => { setCaught({ kind: 'miss', result: result === 'penalty' ? 'penalty' : 'miss' }); setPhase('result') })
        return
      }
      reelCrate(zone, tier, result as 'perfect' | 'catch').then(async loot => {
        await held
        if ('error' in loot) { setErr(loot.error); setPhase('idle'); return }
        setCaught({ kind: 'crate', tier, loot })
        setPhase('result')
      }).catch(() => {
        setErr('The crate slipped the line.')
        setPhase('idle')
      })
      return
    }

    reelIn(hooked.fishId, result, bait).then(async res => {
      await held
      if ('error' in res) { setErr(res.error); setPhase('idle'); setHooked(null); return }
      if ('caught' in res && res.caught) {
        // Straight through to the shared card. Everything here comes off the
        // same payload the fishing screen reads, so a personal best or a shiny
        // landed from the map gets the identical moment.
        // THE PERFECTED SIGIL pays the moment you reel it in, server-side, and
        // the map was banking the coin without ever mentioning it.
        if ((res.sigilBonus ?? 0) > 0) {
          setSigilPaid(res.sigilBonus ?? 0)
          setTimeout(() => setSigilPaid(0), 2600)
        }
        if (res.isShiny && res.shinyId != null) {
          setShiny({ id: res.shinyId, alreadyMounted: res.alreadyMounted === true })
        }
        setWormhole(res.wormhole === true && !res.isShiny)
        // Displaying what the server said, never counting it here — the streak
        // is server authoritative and reelIn owns it.
        setStreak(res.perfectStreak ?? 0)
        setXpPop({ id: Date.now(), value: res.xpGained })
        // The bar climbs by exactly what the popup says, so the two can never
        // tell different stories about the same catch.
        setXp(v => {
          const next = v + (res.xpGained ?? 0)
          const was = renownLevel('fishing', v)
          const now = renownLevel('fishing', next)
          if (now > was) setRenownUp({ skill: 'fishing', toLevel: now, points: now - was })
          return next
        })
        // The server clamps catchQty to the space actually left, so this is the
        // number that went in rather than the number that was rolled.
        onCaught(res.catchQty ?? 1)
        onReel?.({ perfectStreak: res.perfectStreak ?? 0, caught: res.catchQty ?? 1 })
        // Into the log immediately. Without this the drawer disagrees with the
        // result card still on screen: the card says NEW SPECIES and the log
        // has never heard of it.
        if (res.fish?.id != null) logCatch(Number(res.fish.id))
        setCaught({
          kind: 'fish',
          card: {
            fish: res.fish as FishSpecies,
            baitSaved: res.baitSaved,
            isNewSpecies: res.isNewSpecies,
            isPerfect: perfect,
            xpGained: res.xpGained,
            // FROM THE CAST, not invented. All three were hard-coded to
            // nothing, so a jackpot or a double catch paid out silently and
            // the card said you had landed one ordinary fish.
            doubleCatch: hooked.doubleCatch ?? false,
            jackpotMultiplier: hooked.jackpotMult,
            lockedStage: hooked.lockedStage ?? 0,
            perfectXpMult: perfect ? mods.rodPerfectXpMult : 1,
            perfectStreak: res.perfectStreak ?? 1,
            streakBonusXP: res.streakBonusXP ?? 0,
            catchQty: res.catchQty ?? 1,
            sizeIn: res.sizeIn,
            sizeMin: res.sizeMin,
            sizeMax: res.sizeMax,
            sizeTier: res.sizeTier as FishSizeTier | undefined,
            isPB: res.isPB,
            previousBest: res.previousBest,
            isShiny: res.isShiny,
            vigilRankUp: res.vigilRankUp ?? null,
          },
        })

        // ── THE GIANT GOES DOWN ───────────────────────────────────────
        //
        // Trophies only: an ancient_deep fish with a sell value of zero. The 12
        // sellable regulars down there stack in the hold like anything else and
        // must not count toward the six, which is the same test the server's
        // ancient_catches column uses.
        //
        // `trophies` has not flushed this tick, so the one just landed is
        // counted by hand.
        const fishNow = res.fish as FishSpecies | undefined
        if (fishNow && res.isNewSpecies
            && fishNow.habitat === 'ancient_deep' && (fishNow.sell_value ?? 0) === 0) {
          const total = log.allFishSpecies
            .filter(f => f.habitat === 'ancient_deep' && (f.sell_value ?? 0) === 0).length || 6
          const countAfter = new Set([...trophies, fishNow.id]).size
          setTrophies(prev => new Set([...prev, fishNow.id]))
          // Finn's reaction to THIS giant, played once the cinematic clears.
          // The first trophy also stands in for his old reveal — flipping
          // finn_revealed here is what stops the chart's FINN_REVEAL_BEAT
          // firing later as though the mask had not already slipped.
          if (countAfter === 1) void markFinnRevealSeen()
          setSlain({
            fish: fishNow, count: countAfter, total,
            isMegalodon: fishNow.id === MEGALODON_ID,
            finnBeat: finnAncientBeat(fishNow.id),
          })
        }

        // ── THE WALL RANKS UP ─────────────────────────────────────────
        // Held back so the catch card reads first, the same 1.5s the fishing
        // screen uses. A granted pet with no rank-up opens the capstone on its
        // own: the pet is granted on STATE, not on the crossing, so a captain
        // already at 30/30 collects it on a landing that ranks nothing.
        const ru = res.vigilRankUp ?? null
        const petGranted = (res as { vigilPetGranted?: boolean }).vigilPetGranted === true
        if (ru && fishNow) {
          setVigil(prev => ({ ...prev, [String(fishNow.id)]: { rank: ru.to, released: false } }))
          setTimeout(() => setRankUp({ name: fishNow.name, from: ru.from, to: ru.to, petGranted }), 1500)
        } else if (petGranted) {
          setTimeout(() => setCapstone(true), 1500)
        }
      } else {
        setCaught({ kind: 'miss', result: result === 'penalty' ? 'penalty' : 'miss' })
        setStreak(0)
        // A MISS IS NEWS TOO. It breaks a perfect run, which is how a
        // perfect-streak bet is lost, and the chart needs to hear about that
        // rather than only hearing about successes.
        onReel?.({ perfectStreak: 0, caught: 0 })
      }
      setPhase('result')
    }).catch(async (e: unknown) => {
      await held
      setErr(e instanceof Error ? e.message : 'Lost the fish on the way in.')
      setPhase('idle')
    })
  }, [phase, hooked, zones, bait, zone, mods, onPose, angleNow])

  // ── AUTO CASTER ─────────────────────────────────────────────────────────
  // Casts again a beat after each result, and stops the moment it has no
  // business continuing. The stop conditions matter more than the loop: it
  // must never keep spending bait you did not mean to spend, and out here
  // there is one the fishing screen does not have — SAILING AWAY. Pull the rod
  // out of the water and the loop is done, or a boat left drifting would fish
  // a zone the captain has already left.
  // SEEDED FROM THE PROFILE, not from `true`. The old default meant the item
  // switched itself back on at the start of every session.
  const [autoOn, setAutoOn] = useState(auto.on)
  useEffect(() => {
    if (auto.tier === 0 || !autoOn) return
    if (phase !== 'result') return
    if (baitLeft <= 0) return
    // A FULL HOLD STOPS THE LOOP. Only bait was checked, so an unattended boat
    // kept casting into a hold that could not take another fish — the one
    // failure a hold exists to warn you about, automated.
    if (holdFull) return
    // A SHINY IS A DECISION. Sell it or mount it, and the loop casting over the
    // top of that card takes the choice away from you while you are looking at
    // it. The fishing screen has always refused to auto-cast past one.
    if (shiny) return
    // The tempo lives in lib/autoFishing, shared with the fishing screen —
    // the same item must not run at two rhythms depending on the surface.
    const t = setTimeout(() => { castRef.current?.(true) },
      caught?.kind === 'crate' ? AUTO_CRATE_TOTAL_MS : AUTO_RECAST_MS)
    return () => clearTimeout(t)
  }, [phase, auto.tier, autoOn, baitLeft, holdFull, shiny, caught?.kind])

  // ── AUTO CATCHER ────────────────────────────────────────────────────────
  // Watches the needle and taps the instant it is about to enter a green catch
  // band — the same thing a player does, done on time. It deliberately never
  // takes the gold: a Perfect is the skill, and a machine that farmed perfect
  // streaks would hollow out the one number this game asks you to earn.
  //
  // Only up to the rarity the Gauntlet upgrades allow. Anything rarer is left
  // on the dial for your own hand, which is the whole bargain of the item.
  useEffect(() => {
    if (auto.tier !== 2 || !autoOn) return
    if (phase !== 'hooked' || !hooked) return
    if (hooked.crateTier) return
    if ((hooked.biteRarity ?? 1) > auto.maxRarity) return
    let raf = 0
    let done = false
    const startAt = performance.now()
    const tick = () => {
      if (done) return
      // A grace beat so the dial visibly spins before the first auto-tap.
      // Without it the reel fires so fast it reads as a bug rather than a tool.
      if (performance.now() - startAt >= 420) {
        // The same angle the paint and the strike use. On the live angle it
        // was aiming a frame behind the dial it was reading.
        const at = ((resolveAngle() - zoneRotRef.current) % 360 + 360) % 360
        const z = zonesRef.current.find(zz => at >= zz.from && at < zz.to)
        if (z?.type === 'catch') { done = true; strikeRef.current?.(); return }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { done = true; cancelAnimationFrame(raf) }
  }, [phase, hooked, auto.tier, auto.maxRarity, autoOn, angleNow])

  // ── TIDE TURNER ─────────────────────────────────────────────────────────
  const [skipsLeft, setSkipsLeft] = useState(tideTurner.left)
  const [skipping, setSkipping] = useState(false)
  const skip = useCallback(async () => {
    if (skipping || phase !== 'hooked' || skipsLeft <= 0) return
    setSkipping(true)
    spinRef.current?.cancel()
    const res = await useTideTurnerSkip().catch(() => ({ error: 'The tide would not turn.' }))
    setSkipping(false)
    if ('error' in res) { setErr(res.error); return }
    // Throwing one back does NOT break the streak — that is the entire item.
    setSkipsLeft(n => Math.max(0, n - 1))
    onPose('rest')
    setPhase('idle')
    vibrate(10)
  }, [skipping, phase, skipsLeft, onPose])

  /** `castAgain` needs the current `cast`, but `cast` is declared above it and
   *  is rebuilt whenever phase changes. Mirroring it to a ref keeps them in
   *  step without either depending on the other. */
  const castRef = useRef<((fromResult?: boolean) => void) | null>(null)
  castRef.current = cast
  const strikeRef = useRef<(() => void) | null>(null)
  strikeRef.current = strike
  const zonesRef = useRef<ZoneDef[]>([])
  zonesRef.current = zones

  /** Cast straight out of the result, exactly as the fishing screen does: the
   *  card stays in the content area and the action slot goes back to Cast, so
   *  there is never a separate dismiss step to hunt for. */
  const castAgain = useCallback(() => { castRef.current?.(true) }, [])

  /**
   * SPACE AND E WORK THE ROD, the way they work the helm outside it. The chart
   * hands the keys over when the rod comes out (its handler checks fishingIn
   * and stands down), so one key means the one control the thumbless hand is
   * on: Cast when idle, Cast Again off a result, Reel In on a bite. Nothing on
   * 'waiting' or 'reeling' — the button shows an ellipsis there and a key
   * should not do what the button will not.
   *
   * Through the same refs the auto-caster presses the buttons through, so a
   * key press and a finger press are indistinguishable to the phase machine —
   * and cast() carries its own canCast guard, so a key cannot cast on an empty
   * bait tin any more than the button can.
   */
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
        || (el as HTMLElement).isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key.toLowerCase() !== 'e') return
      if (typing() || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      e.preventDefault()
      const ph = phaseRef.current
      if (ph === 'hooked') strikeRef.current?.()
      else if (ph === 'idle') castRef.current?.()
      else if (ph === 'result') castRef.current?.(true)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return (
    <div className="sea-fishing"
      
      /* THE ROD IS NOT A RUDDER. Cast and Reel In stop `pointerdown`, but the
         map steers on `click` — and stopping pointerdown does nothing to the
         click that follows it, so every cast was also plotting a course to
         wherever the button happened to be. Caught at the root.

         Dismissing by tapping away is NOT handled here, and cannot be: this
         element is pointer-events:none, so a tap on the open water around the
         card never reaches it — it falls straight through to the map. The map
         owns that, and is told when it is safe to do it. */
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', inset: 0, zIndex: 20,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', pointerEvents: 'none',
      }}>


      {/* THE PERFECT. Lifted from the fishing screen: a gold wash across the
          whole frame, two rings expanding out of the middle, and the word.
          Landing one out here fired the sound and the haptic and then looked
          exactly like landing an ordinary fish. */}
      <AnimatePresence>
        {perfectFlash && (
          <motion.div key="perfect-flash"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse 90% 60% at 50% 50%, rgba(245,158,11,0.32) 0%, transparent 70%)',
            }}>
            <motion.div
              initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{
                position: 'absolute', width: 140, height: 140, borderRadius: '50%',
                border: '2px solid rgba(245,158,11,0.7)',
                left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              }} />
            <motion.div
              initial={{ scale: 0.2, opacity: 0.6 }} animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}
              style={{
                position: 'absolute', width: 140, height: 140, borderRadius: '50%',
                border: '1px solid rgba(253,230,138,0.5)',
                left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              }} />
            <motion.p className="font-cinzel font-700 uppercase"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              style={{
                fontSize: '1.92rem', letterSpacing: '0.1em', color: '#fde68a',
                textShadow: '0 0 24px rgba(245,158,11,0.9), 0 2px 12px rgba(0,0,0,0.8)',
              }}>Perfect</motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* XP, off the captain rather than off a corner. The boat is pinned to
          the centre of the screen, so that is where the number comes from. */}
      <AnimatePresence>
        {xpPop && (
          <motion.p key={xpPop.id}
            initial={{ opacity: 0, y: 0, x: '-50%' }}
            animate={{ opacity: [0, 1, 1, 0], y: -46, x: '-50%' }}
            transition={{ duration: 2.0, times: [0, 0.1, 0.6, 1], ease: 'easeOut' }}
            onAnimationComplete={() => setXpPop(null)}
            className="font-karla font-700"
            style={{
              position: 'absolute', left: '50%', top: '46%', zIndex: 31, pointerEvents: 'none',
              fontSize: '1.2rem', color: '#4ade80',
              textShadow: '0 0 10px rgba(74,222,128,0.7), 0 2px 8px rgba(0,0,0,0.9)',
            }}>
            +{xpPop.value} XP
          </motion.p>
        )}
      </AnimatePresence>

      {/* PAST THE CAP. Every level beyond 100 banks a renown point, and this
          is the only thing that says so. */}
      <RenownUpOverlay info={renownUp} onDismiss={() => setRenownUp(null)} />



      {/* ── THE BAR, along the top ────────────────────────────────────────
          The fishing screen's own component, not a copy of it. Casting on the
          map without it meant the XP went somewhere invisible, and the map's
          fishing stopped reading as the same activity as the fishing screen's. */}
      <div style={{
        pointerEvents: 'auto', width: '100%', flexShrink: 0,
        // THE FISHING SCREEN'S OWN NUMBERS. It centres a max-w-md column and
        // pads it 1rem, and its XP bar carries 0.6rem beneath. I had 0.5rem of
        // top padding and no column, so the bar sat hard against the nav with
        // half the breathing room it has on the page it came from.
        maxWidth: 448, margin: '0 auto',
        padding: '1rem 1rem 0.6rem',
      }}>
        {/* data-no-steer, because the bar is TAPPABLE at max level and the map
            steers on any click that reaches it. Without this the renown chip
            opened the panel and put the helm over at the same time — and below
            max level, where the chip does nothing, a tap on the bar was simply
            a course change nobody asked for. The map's tap handler bails on
            `closest('button, [data-no-steer]')`. */}
        {/* THE BAR RUNS THE WHOLE WIDTH. The light used to sit on this row as
            a pill and take a bite out of it, which cost the bar its space to
            say anything — and on a desktop, where the corner disc had room to
            stay exactly where it was, moving it here was a swap nobody asked
            for. Everything that was beside the bar is under it now. */}
        <div data-no-steer style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* bestStreak was never passed, which is why the flame and the
                count the fishing screen shows have been missing out here. */}
            {/* The chip only becomes tappable when both of these are set —
                see XPBarDisplay. They were never passed, so a captain at 100
                had a Renown readout they could not open. */}
            <XPBarDisplay xp={xp} bestStreak={streak}
              renownAvailable={renownPoints} onOpenRenown={onOpenRenown} />
          </div>
        </div>

        {/* ── THE ROW UNDER THE BAR ────────────────────────────────────
            What time it is, and anything you can switch on or off.

            The auto toggle used to live in a band between the cast button and
            the four menus, which is the busiest corner of the screen and the
            one place a thumb is already committed. Up here it is beside the
            other thing that describes the state of the world, out of the way of
            everything you are actually doing, and still one tap away — which
            matters, because a machine fishing for you is a thing you want to be
            able to stop without hunting. */}
        <div data-no-steer style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
          minHeight: 26,
        }}>
          {/* THE LIGHT, on a phone. On a wide screen the chart keeps its own
              disc in the corner — there is room for it there and moving it was
              never the point — so this hides above the same 900px breakpoint
              the chart uses to decide it has space. */}
          <div aria-hidden className="fh-narrow-only" style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
            padding: '0.28rem 0.5rem', borderRadius: 999,
            background: 'rgba(4,10,18,0.72)',
            border: '1px solid rgba(180,214,232,0.22)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: seaPhase === 'night' || seaPhase === 'dusk' ? '#9fb6ff' : '#ffd986',
              boxShadow: `0 0 7px ${seaPhase === 'night' || seaPhase === 'dusk' ? 'rgba(159,182,255,0.7)' : 'rgba(255,217,134,0.7)'}`,
            }} />
            <span className="font-karla font-700 uppercase" style={{
              fontSize: '0.66rem', letterSpacing: '0.12em', color: 'rgba(214,232,240,0.75)', whiteSpace: 'nowrap',
            }}>{PHASE_LABEL[seaPhase]}</span>
          </div>

          {/* The auto toggle. Shown only when the item is actually equipped,
              and a toggle rather than always-on because handing your rod to a
              machine should stay a choice you can take back mid-session. */}
          {auto.tier > 0 && (
            <button onClick={e => {
                e.stopPropagation()
                setAutoOn(v => {
                  const next = !v
                  // Remembered for next time. Nothing waits on it: a failed
                  // write costs one tap next session and nothing else.
                  void setAutoFishing(next).catch(() => {})
                  return next
                })
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0.28rem 0.66rem', borderRadius: 999, fontSize: '0.696rem',
                color: autoOn ? '#f0ede8' : '#9a9488',
                background: autoOn ? 'rgba(70,224,192,0.13)' : 'rgba(4,10,18,0.72)',
                border: `1px solid ${autoOn ? 'rgba(70,224,192,0.5)' : 'rgba(255,255,255,0.16)'}`,
                cursor: 'pointer',
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/autocaster.png" alt="" style={{
                width: 15, height: 15, objectFit: 'contain',
                opacity: autoOn ? 1 : 0.45,
                filter: autoOn ? 'drop-shadow(0 0 4px rgba(70,224,192,0.5))' : 'grayscale(1)',
              }} />
              {auto.tier === 2 ? 'Auto Catcher' : 'Auto Caster'} · {autoOn ? 'On' : 'Off'}
            </button>
          )}
        </div>
      </div>

      {/* ── THE EFFECT PILLS' SLOT ──────────────────────────────────────
          Second Wind, Instant Bite and the Sigil's payout used to float at
          absolute tops measured from the overlay — numbers that were guesses
          at the header's height, and wrong ones: they landed exactly on the
          day/night chip and the auto toggle. A zero-height slot AFTER the
          header costs no layout and moves with whatever the header becomes,
          so the pills are always just below the chrome and never on it. */}
      <div aria-hidden style={{ position: 'relative', width: '100%', height: 0, zIndex: 30, pointerEvents: 'none' }}>
      {/* THE PERFECTED SIGIL's payout. Paid by the server on every perfect; the
          only thing missing out here was anybody saying so. */}
      <AnimatePresence>
        {sigilPaid > 0 && (
          <motion.p key="sigil"
            initial={{ opacity: 0, y: 0, x: '-50%' }}
            animate={{ opacity: [0, 1, 1, 0], y: -26, x: '-50%' }}
            transition={{ duration: 2.4, times: [0, 0.12, 0.66, 1], ease: 'easeOut' }}
            className="font-cinzel font-700"
            style={{
              position: 'absolute', top: 46, left: '50%', zIndex: 30, pointerEvents: 'none',
              fontSize: '1.08rem', color: '#f0c040', textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            }}>
            +{sigilPaid} ⟡
          </motion.p>
        )}
      </AnimatePresence>
      {/* SECOND WIND. The rod handed the dial back. Without a cue this reads as
          the reel button simply not working. */}
      <AnimatePresence>
        {retryFlash && (
          <motion.div key="retry"
            initial={{ opacity: 0, scale: 0.7, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
              position: 'absolute', top: 8, left: '50%', zIndex: 30, pointerEvents: 'none',
              padding: '0.32rem 0.72rem', borderRadius: 999,
              background: 'rgba(56,189,178,0.22)',
              border: '1px solid rgba(94,234,212,0.7)',
              boxShadow: '0 0 18px rgba(45,212,191,0.4)',
            }}>
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.672rem', color: '#ccfbf1' }}>Second Wind</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* LIGHTSPEED. The Lightsaber and its kin roll an instant bite, and the
          whole experience of that effect is the wait NOT happening — which is
          invisible unless something says so. Lifted from the fishing screen,
          same red bolt, same 1100ms. */}
      <AnimatePresence>
        {instantBite && (
          <motion.div key="instant-bite"
            initial={{ opacity: 0, scale: 0.7, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
              position: 'absolute', top: 8, left: '50%', zIndex: 30, pointerEvents: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.32rem 0.72rem', borderRadius: 999,
              background: 'linear-gradient(180deg, rgba(255,59,71,0.32) 0%, rgba(224,0,34,0.18) 100%)',
              border: '1px solid rgba(255,90,100,0.7)',
              boxShadow: '0 0 18px rgba(255,40,60,0.5), inset 0 0 8px rgba(255,255,255,0.22)',
            }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden style={{ filter: 'drop-shadow(0 0 4px #ff3344)' }}>
              <path d="M13 2L3 14h7l-1 8 11-13h-7z" />
            </svg>
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.672rem', color: '#fff', textShadow: '0 0 8px rgba(255,60,70,0.85)' }}>Instant Bite</span>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* ── CONTENT ───────────────────────────────────────────────────────
          Dial, result card or the wait, all in one flexible area that grows and
          shrinks around whatever is in it. The action row below is a fixed slot
          and never moves, which is the entire point of splitting them. */}
      <div ref={contentRef} style={{
        flex: 1, minHeight: 0, width: '100%',
        display: 'flex', flexDirection: 'column',
        // CENTRED, not crammed against the bottom. flex-end made sense when
        // this was a phone overlay with a fixed action row under it; on a
        // desktop it pushed the dial and a tall result card into the last
        // couple of hundred pixels of a very large screen and then asked you to
        // scroll a container that had a screenful of empty space above it.
        alignItems: 'center', justifyContent: 'center',
        maxWidth: 448, margin: '0 auto',
        padding: '0 1rem', gap: 10,
        // THE FRAME THE ACTION ROW PINS TO. Nothing else in here is positioned;
        // this exists only so the row below can leave the flow entirely.
        position: 'relative',
      }}>
        {/* ONE AnimatePresence, mode="wait", around all three.
            They were separate: the dial had its own AnimatePresence and the
            result card was a plain sibling below it. In a column justified to
            its BOTTOM edge, that means the card mounts underneath a dial that is
            still playing its 140ms exit and shoves it upward — which is exactly
            the dial appearing to flash in above where it was and then vanish.
            mode="wait" holds the card back until the dial has finished leaving,
            so nothing is ever in this area twice. Safe here in a way it is not
            on the action row: this area is allowed to be empty for a beat. */}
        <AnimatePresence mode="wait">
          {(phase === 'hooked' || phase === 'reeling') ? (
            <motion.div key="dial"
              initial={{ opacity: 0, y: 30, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              /* SAME SIZE AS THE FISHING SCREEN. DialSVG is width:100% capped
                 at 300 and has to be given the room to reach that cap — I had
                 it in a 260px box, which quietly made the map's dial a
                 different instrument to the one every player has learned. */
              style={{ pointerEvents: 'none', width: '100%', maxWidth: 300, position: 'relative' }}>
              {/* BEHIND THE INSTRUMENT. The fire grows with the streak rather
                  than stepping between two states, it lights the dial rather
                  than being drawn near it, it smokes once it is big enough to,
                  and an Ancient's aura finally breathes. The dial's own SVG
                  rings stay: those are the RIM glowing, and this is everything
                  coming off it. See components/DialFx. */}
              <DialFx streak={streak} burstKey={burstKey} ancientBoss={ancientFight} />
              {/* needleRef hands the needle's own composited layer to the
                  WAAPI rotation above. `angle` is only the RESTING position
                  now — it changes at a bite, at a retry and at the freeze, and
                  never once per frame. */}
              <DialSVG zones={zones} angle={angle} rotation={zoneRot}
                // THE DIAL CATCHES FIRE ON A STREAK, the same two steps the
                // fishing screen has always had. Out here it never lit, so the
                // one visible reward for holding a streak was missing from the
                // screen the streak is earned on.
                fireLevel={streak >= 3 ? 2 : streak === 2 ? 1 : 0}
                ancientBoss={ancientFight}
                // NEUTRAL, not yellow: the crossing paint owns the colour from
                // the first frame of the spin, exactly like the original.
                needleColor="rgba(255,255,255,0.35)" zoneOpacityFn={() => 1}
                zonesGroupRef={zonesGroupEl}
                needleRef={needleRef}
                snapKey={snapKey} perfectBurstKey={burstKey} />
            </motion.div>
          ) : phase === 'result' && caught ? (
          <motion.div key="result"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: 'auto', width: '100%', maxWidth: 380, minHeight: 0 }}>
            <div data-no-steer ref={cardScrollRef} style={{
              // SCROLLING IS OFF UNTIL THE CARD HAS SETTLED, then on only if it
              // is genuinely needed.
              //
              // `overflow: auto` shows a scrollbar the instant content
              // overflows, including transiently — and this card overflows
              // transiently on almost every catch. It springs in, its rows
              // stagger, and the fish image arrives from the network and
              // changes the height when it does. So for a couple of hundred
              // milliseconds the content is taller than the box, a scrollbar
              // flashes, the content settles and it vanishes again.
              //
              // Measured after the entrance instead. Nothing scrolls during the
              // animation, and afterwards it scrolls only if it actually has to.
              // AND `overflow`, NOT `overflowY`. Setting one axis to anything
              // other than `visible` forces the OTHER axis to compute to
              // `auto` — that is the spec, not a quirk — so `overflowY: hidden`
              // was quietly turning on horizontal scrolling and putting a bar
              // along the bottom of a card that is exactly as wide as its box.
              // The shorthand keeps both axes agreeing.
              width: '100%',
              maxHeight: cardCap != null ? cardCap : undefined,
              overflow: cardScrolls ? 'auto' : 'visible',
              overscrollBehavior: 'contain',
              // The map sets touch-action: none so a drag steers instead of
              // scrolling the page. This card is the one thing inside it that
              // genuinely wants a vertical drag, so it takes that back.
              touchAction: 'pan-y',
            }}>
              {caught.kind === 'crate' ? (
                /* THE crate moment, the shared one. components/CrateOpening is
                   deliberately the only implementation of this in the app and
                   the map is not going to become the second. It opens itself
                   here rather than borrowing the action slot, because out on
                   the water that slot has a boat to steer back to. */
                <div style={{
                  borderRadius: 20, padding: '1.15rem 1.25rem 1.05rem', textAlign: 'center',
                  background: 'rgba(6,14,22,0.96)', border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <CrateOpening
                    tier={caught.tier as CrateTierId}
                    loot={caught.loot}
                    headline="You reeled up a"
                    autoOpenMs={700}
                  />
                </div>
              ) : caught.kind === 'fish' ? (
                /* THE SAME CARD. Not a summary of it — the component the
                   fishing screen renders, handed the same payload. See
                   components/CatchResultCard for why it left FishingGame. */
                <ResultCard {...caught.card} />
              ) : (
                <div style={{
                  width: '100%', borderRadius: 16, padding: '1rem 1.15rem', textAlign: 'center',
                  background: 'rgba(8,16,24,0.94)',
                  border: '1px solid rgba(180,214,232,0.28)',
                }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#d9b7b7' }}>
                    {caught.result === 'penalty' ? 'Snagged' : 'It got away'}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.96rem', color: '#9fb4c2', marginTop: 6 }}>
                    {caught.result === 'penalty'
                      ? 'The line fouled and took a bait with it.'
                      : 'The line went slack. Cast again.'}
                  </p>
                </div>
              )}
            </div>

            {/* ── DECISIONS THE CATCH CAN HAND YOU ──────────────────────
                Both of these are server-offered and were being dropped. A
                shiny in particular MUST be resolvable here: it is already
                written into shiny_catches by the time you see it, and the
                sell/mount actions exist nowhere else in the app. */}
            {shiny && (
              <div style={{
                marginTop: 10, padding: '0.8rem', borderRadius: 12, textAlign: 'center',
                background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.4)',
              }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.032rem', color: '#f0c040' }}>
                  A golden one
                </p>
                <p className="font-karla" style={{ fontSize: '0.864rem', color: '#c8b590', marginTop: 4, lineHeight: 1.5 }}>
                  {shiny.alreadyMounted
                    ? 'You have one of these on the wall already. This one can only be sold.'
                    : 'Sell it, or mount it in your Logbook. One of each species only.'}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={busyChoice}
                    onClick={async e => {
                      e.stopPropagation(); setBusyChoice(true)
                      const r = await sellGoldenTrophy(shiny.id).catch(() => ({ error: 'It slipped away.' }))
                      setBusyChoice(false)
                      if ('error' in r) { setChoiceNote(r.error); return }
                      // Same as the traders: the coin is already banked, but
                      // the header reads its balance once at render and never
                      // asks again unless it is told.
                      if (typeof r.doubloons === 'number') {
                        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.doubloons }))
                      }
                      setChoiceNote(`Sold for ${r.earned.toLocaleString()} ⟡`)
                      setShiny(null)
                    }}
                    className="font-cinzel font-700"
                    style={{
                      flex: 1, padding: '0.6rem', borderRadius: 10, fontSize: '0.96rem',
                      color: '#f2ead8', background: 'rgba(240,192,64,0.18)',
                      border: '1px solid rgba(240,192,64,0.5)', cursor: 'pointer',
                    }}>Sell</button>
                  {!shiny.alreadyMounted && (
                    <button disabled={busyChoice}
                      onClick={async e => {
                        e.stopPropagation(); setBusyChoice(true)
                        const r = await mountGoldenTrophy(shiny.id).catch(() => ({ error: 'It slipped away.' }))
                        setBusyChoice(false)
                        if ('error' in r) { setChoiceNote(r.error); return }
                        setChoiceNote('Mounted in your Logbook')
                        setShiny(null)
                      }}
                      className="font-karla font-700"
                      style={{
                        flex: 1, padding: '0.6rem', borderRadius: 10, fontSize: '0.96rem',
                        color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer',
                      }}>Mount</button>
                  )}
                </div>
              </div>
            )}

          </motion.div>
          ) : phase === 'waiting' && castAnimDone ? (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {/* Three dots breathing out of phase. The wait is three to twelve
                seconds and the only feedback used to be six small words, which
                is indistinguishable from a hang. Something has to be moving. */}
            <div style={{ display: 'flex', gap: 7 }}>
              {[0, 1, 2].map(i => (
                <motion.span key={i}
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(214,232,240,0.9)' }} />
              ))}
            </div>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.84rem', letterSpacing: '0.18em', color: 'rgba(200,220,232,0.8)',
              textShadow: '0 1px 10px rgba(0,0,0,0.9)',
            }}>
              Waiting on a bite
            </p>
            {/* THE TIMER, as the fishing screen has it. The wait is three to
                twelve seconds and it is not a fixed number — bait, rod and
                level all move it — so a running count is the only way anybody
                can tell that their tackle is doing something. Its own component
                so a 100ms tick re-renders this one line rather than the whole
                overlay. */}
            <WaitTimer />
          </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── THE UNDERSTACK ───────────────────────────────────────────────
            EVERYTHING THAT COMES AND GOES, and none of it in the flow.

            This area is a centred column, so any child that appears re-centres
            it and drags whatever is in it — the dial, or the result card — by
            half its own height. Nothing was animating them; the column was
            doing exactly what a centred column does. A skip offer arriving, a
            hold filling up, a reroll resolving into a note: each one shoved the
            instrument you were aiming with, or the card you were reading.

            So the dial and the card are the ONLY things left in the column, and
            every transient sits in this stack instead, pinned to the bottom of
            the frame at zero layout cost. Nothing in here can move them. The
            stack is the same place every time, which also beats sitting a fixed
            distance under the dial — the dial and the card are different
            heights, so "just below" would be two different spots.

            pointer-events:none, with the pills opting back in. Otherwise an
            invisible full-width band sits over the water and every tap near the
            bottom of the dial stops steering the boat — the trap the log drawer
            already hit once. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          pointerEvents: 'none',
        }}>
          {err && (
            <p className="font-karla font-600" style={{
              fontSize: '0.936rem', color: '#e6a0a0', textShadow: '0 1px 8px rgba(0,0,0,0.9)',
            }}>{err}</p>
          )}
          {(holdFull || outOfBait) && (phase === 'idle' || phase === 'result') && (
            // Not just "you cannot" — where the fix is. A zone buyer is sitting in
            // this water and will take the lot, which is the whole reason they
            // exist, and nobody is going to guess that from a greyed-out button.
            <p className="font-karla font-600" style={{
              fontSize: '0.888rem', color: holdFull ? '#f8a2a2' : '#e8c98a',
              textAlign: 'center', lineHeight: 1.5,
              textShadow: '0 1px 8px rgba(0,0,0,0.9)',
            }}>
              {holdFull
                ? 'Your hold is full. Sell it to the buyer in this water, or sail it home to the market.'
                : 'Out of bait. There are peddlers out here, and the shop ashore.'}
            </p>
          )}

          {choiceNote && (
            <p className="font-karla font-700" style={{
              fontSize: '0.912rem', color: '#7fd6a0', textAlign: 'center',
              textShadow: '0 1px 8px rgba(0,0,0,0.9)',
            }}>{choiceNote}</p>
          )}

          {/* ── THE UNDER-DIAL ACTION ROW ────────────────────────────────────
              Actions ON THE ENCOUNTER live here, directly beneath the dial (or
              beneath the card it turns into), because that is the thing they act
              upon. The Tide Turner used to sit in the band below the CAST button,
              which put a decision about the fish on your hook down among the
              rig controls, a whole screen away from the fish.

              ONE row, deliberately outside the phase branches above, so the two
              occupants cannot drift apart: the Tide Turner is a `hooked` action
              and the wormhole is a `result` one, so today only one is ever up —
              but if that ever changes they sit side by side, each taking half,
              rather than one of them re-inventing a row somewhere else.

              OUT OF THE FLOW, and that is the whole point. This area is a
              centred column, so ANY child that appears re-centres the column and
              drags the dial (or the card) with it — which is the reel visibly
              jumping the moment a skip becomes available and jumping back when it
              is used. Pinned to the bottom of the frame, the row costs zero
              layout space, so what it does or does not contain cannot move the
              instrument you are aiming with.

              Compact on purpose too. These are offers, not the task: the dial is
              the thing being looked at, and a pair of full-width slabs under it
              competed with it for attention. */}
          {((tideTurner.has && phase === 'hooked' && skipsLeft > 0) || (wormhole && phase === 'result')) && (
            <div data-no-steer style={{
              display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
            }}>
              {/* THE LABEL SAYS SKIP, NOT "throw it back". Both screens offer
                  this at the same moment — the dial is up and the fish is not
                  landed yet (this screen's `hooked` is the fishing screen's
                  `catching`) — but the port renamed it, and "throw it back"
                  describes putting a fish you have caught into the water.
                  Nothing has been caught. What the button does is drop the
                  encounter before it resolves. */}
              {tideTurner.has && phase === 'hooked' && skipsLeft > 0 && (
                <button onClick={e => { e.stopPropagation(); void skip() }} disabled={skipping}
                  className="font-cinzel font-700"
                  style={{
                    pointerEvents: 'auto',
                    padding: '0.4rem 0.85rem', borderRadius: 999, fontSize: '0.816rem',
                    color: '#cdbdf8', whiteSpace: 'nowrap',
                    // AN OPAQUE FLOOR, like its neighbour. A translucent wash
                    // over open water lets the sea read straight through the
                    // label — the house rule for anything drawn on the world.
                    background: 'linear-gradient(180deg, rgba(104,88,178,0.5) 0%, rgba(46,38,84,0.62) 100%), rgba(10,8,18,0.96)',
                    border: '1px solid rgba(167,139,250,0.6)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                    cursor: skipping ? 'default' : 'pointer', opacity: skipping ? 0.6 : 1,
                  }}>
                  {skipping ? '…' : <>Tide Turner · Skip <span style={{ opacity: 0.7 }}>· {skipsLeft} left</span></>}
                </button>
              )}
              {wormhole && phase === 'result' && (
                <button disabled={busyChoice}
                  onClick={async e => {
                    e.stopPropagation(); setBusyChoice(true)
                    const r = await rerollWormhole().catch(() => ({ error: 'The wormhole closed.' }))
                    setBusyChoice(false)
                    setWormhole(false)
                    if ('error' in r) { setChoiceNote(r.error); return }
                    setChoiceNote(`Rerolled into ${r.fish.name}`)
                  }}
                  className="font-cinzel font-700"
                  style={{
                    pointerEvents: 'auto',
                    padding: '0.4rem 0.85rem', borderRadius: 999,
                    fontSize: '0.816rem', color: '#f0ddff', whiteSpace: 'nowrap',
                    background: 'linear-gradient(180deg, rgba(120,70,170,0.5) 0%, rgba(60,32,92,0.62) 100%), rgba(10,8,18,0.96)',
                    border: '1px solid rgba(192,132,252,0.6)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                    cursor: 'pointer',
                  }}>
                  Wormhole · Reroll
                </button>
              )}
            </div>
          )}

        </div>

      </div>

      {/* THE TACKLE BOX. Opens over the rod, closes when you have picked, and
          is not on screen the rest of the time. */}
      <AnimatePresence>
        {logOpen && (
          <FishCollectionDrawer
            allFishSpecies={log.allFishSpecies}
            fishingXP={fishingXP}
            caughtFishIds={caughtIds}
            mountedFishIds={mountedSet}
            personalBests={log.personalBests}
            ancientCatches={ancientSet}
            ancientVigil={vigil}
            vigilUnlocked={log.vigilUnlocked}
            prestigeLevels={prestigeLevels}
            goldenBoosts={goldenBoosts}
            claimedZones={claimedZones}
            claimingZone={claimingZone}
            prestigingZone={prestigingZone}
            expandedZone={expandedZone}
            setExpandedZone={setExpandedZone}
            setTappedFishId={() => {}}
            uncheckedNewFishIds={uncheckedNew}
            setUncheckedNewFishIds={setUncheckedNew}
            confirmPrestigeZone={confirmPrestigeZone}
            setConfirmPrestigeZone={setConfirmPrestigeZone}
            handleClaimZoneReward={z => void claimZone(z)}
            handlePrestige={z => void doPrestige(z)}
            // ── THIS WAS A DEAD BUTTON ────────────────────────────────
            // It used to be `() => {}`, with a comment saying releasing an
            // ancient belonged ashore on the fishing page. But the drawer
            // renders "Release for Rank N" UNCONDITIONALLY — so out here the
            // control was fully drawn, styled, focusable and tappable, and did
            // nothing at all. Not a feature living elsewhere: a button that
            // lies. The wall is here, so the act belongs here.
            setReleasingAncient={setReleasing}
            onClose={() => setLogOpen(false)}
          />
        )}

        {/* ── BAIT ────────────────────────────────────────────────────
            The rack used to live in here too, under a "Tackle box" title, which
            made one sheet the answer to two different questions. Rods moved to
            the Loadout, where the rest of the kit is. */}
        {tackleOpen && (
          <Sheet key="tackle" title="Bait"
            blurb="A wider catch zone is an easier reel. Nothing else changes."
            onClose={() => setTackleOpen(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {baitBag.filter(b => b.quantity > 0).map(b => {
                const def = getBait(b.type)
                const on = b.type === bait
                return (
                  <button key={b.type}
                    onClick={e => {
                      e.stopPropagation()
                      if (!on) { vibrate(10); onBaitChange(b.type) }
                      setTackleOpen(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '0.55rem 0.7rem', borderRadius: 12, width: '100%',
                      background: on ? 'rgba(103,212,232,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${on ? 'rgba(103,212,232,0.55)' : 'rgba(255,255,255,0.1)'}`,
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {def?.imageUrl && <img src={def.imageUrl} alt="" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="font-cinzel font-700 block truncate" style={{ fontSize: '1.008rem', color: '#f2ead8' }}>
                        {def?.name ?? b.type}
                      </span>
                      <span className="font-karla font-600 block" style={{ fontSize: '0.744rem', color: 'rgba(190,212,228,0.6)' }}>
                        {(def?.catchZoneBonus ?? 0) > 0 ? `+${def!.catchZoneBonus}° catch zone` : 'No catch bonus'}
                      </span>
                    </span>
                    <span className="font-karla font-700" style={{ fontSize: '0.96rem', color: '#f0c040', flexShrink: 0 }}>
                      {b.quantity}
                    </span>
                  </button>
                )
              })}
            </div>
          </Sheet>
        )}

        {/* ── LOADOUT ─────────────────────────────────────────────────
            READ-ONLY, apart from the rack. Equipping happens at the Shipyard
            now, so a locker out here would be a screenful of controls that all
            say no. What is useful mid-session is knowing what you are actually
            fishing with — and the one change you CAN make, which is reaching
            for a different rod off your own deck. */}
        {loadoutOpen && (() => {
          const rod = rack.find(r => r.tier === activeRod) ?? null
          const locked = phase !== 'idle' && phase !== 'result'
          return (
            <Sheet key="loadout" title="Loadout"
              blurb="What you sailed with, and what it is doing to the dial."
              onClose={() => setLoadoutOpen(false)}>

              <SheetLabel>{rack.length > 1 ? 'Rods on deck' : 'Your rod'}</SheetLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {rack.map(r => {
                  const on = r.tier === activeRod
                  return (
                    <button key={r.tier}
                      onClick={e => {
                        e.stopPropagation()
                        if (!locked && !on) { vibrate(10); onRodChange(r.tier); setLoadoutOpen(false) }
                      }}
                      disabled={locked || on}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.5rem 0.7rem', borderRadius: 12, width: '100%',
                        background: on ? 'rgba(240,192,64,0.14)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${on ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        cursor: locked || on ? 'default' : 'pointer', textAlign: 'left',
                        opacity: locked && !on ? 0.45 : 1,
                      }}>
                      {r.slug && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/${r.slug}_thumb.png`} alt="" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
                      )}
                      <span className="font-cinzel font-700 truncate" style={{ flex: 1, fontSize: '0.96rem', color: '#f2ead8' }}>
                        {r.name}
                      </span>
                      {on ? (
                        <span className="font-karla font-700 uppercase" style={{
                          fontSize: '0.63rem', letterSpacing: '0.1em', color: '#f0c040', flexShrink: 0,
                        }}>In hand</span>
                      ) : r.catchZoneBonus > 0 ? (
                        <span className="font-karla font-700" style={{ fontSize: '0.696rem', color: '#7fd6a0', flexShrink: 0 }}>
                          +{r.catchZoneBonus}°
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              {locked && rack.length > 1 && (
                <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: 'rgba(232,201,138,0.85)', marginTop: 6 }}>
                  Rods stay put while a line is in the water.
                </p>
              )}

              <SheetLabel>The rest of your kit</SheetLabel>
              <div style={{ marginTop: 4 }}>
                <StatRow k="Reel" v={getReel(mods.reelTier).name} />
                <StatRow k="Line" v={getLine(mods.lineTier).name} />
                <StatRow k="Hook" v={getHook(mods.hookTier).name} />
              </div>

              <SheetLabel>On the dial</SheetLabel>
              <div style={{ marginTop: 4 }}>
                <StatRow k="Catch zone from the rod" v={`+${rod?.catchZoneBonus ?? mods.rodCatchBonus}°`} tone="good" />
                <StatRow k="Catch zone from the bait" v={baitBonus > 0 ? `+${baitBonus}°` : 'None'} tone={baitBonus > 0 ? 'good' : undefined} />
                <StatRow k="Perfect zone" v={mods.rodPerfectBonus > 0 ? `+${mods.rodPerfectBonus}°` : 'Standard'} tone={mods.rodPerfectBonus > 0 ? 'good' : undefined} />
                {/* Lower is slower is easier, which is the opposite of what a
                    bare multiplier reads as — so it says which way is good. */}
                <StatRow k="Needle speed" v={`×${mods.reelSpeedMult.toFixed(2)}${mods.reelSpeedMult < 1 ? ' (slower)' : ''}`}
                  tone={mods.reelSpeedMult < 1 ? 'good' : undefined} />
                {mods.linePenalty !== 1 && (
                  <StatRow k="Miss penalty" v={`×${mods.linePenalty.toFixed(2)}`} tone={mods.linePenalty < 1 ? 'good' : 'warn'} />
                )}
                {mods.rodRetryOnMiss > 0 && (
                  <StatRow k="Second chance on a miss" v={`${Math.round(mods.rodRetryOnMiss * 100)}%`} tone="good" />
                )}
                {mods.rodSnagImmune && <StatRow k="Snags" v="Immune" tone="good" />}
                {mods.rodPerfectXpMult !== 1 && (
                  <StatRow k="XP on a perfect" v={`×${mods.rodPerfectXpMult}`} tone="good" />
                )}
              </div>

              {/* ── THE STREAK ─────────────────────────────────────────
                  Nothing told a captain this. The result card shows what a
                  streak paid AFTER the catch, which is the wrong moment: the
                  decision a streak drives is whether the next cast is worth
                  being careful about.

                  Both numbers come from lib/perfectStreak.ts, the same module
                  reelIn banks the XP with, so this cannot quietly disagree with
                  what actually lands. */}
              <SheetLabel>Your perfect streak</SheetLabel>
              <div style={{ marginTop: 4 }}>
                <StatRow k={streak > 0 ? `Running now, ${streak} perfect${streak === 1 ? '' : 's'}` : 'Running now'}
                  v={streak > 0 ? `×${streakMult(streak, mods.fishingLevel).toFixed(2)} XP` : 'None'}
                  tone={streak > 0 ? 'good' : undefined} />
                <StatRow k={`Held at ${STREAK_XP_CAP}, the most it pays`}
                  v={`×${streakMult(STREAK_XP_CAP, mods.fishingLevel).toFixed(2)} XP`} tone="good" />
              </div>
              <p className="font-karla font-600" style={{
                fontSize: '0.75rem', color: 'rgba(190,212,228,0.5)', marginTop: 6, lineHeight: 1.6,
              }}>
                It multiplies the fish you land, so it is worth the same in any
                water. One miss resets it. The ceiling grows as you level, up to
                ×{streakMult(STREAK_XP_CAP, 100).toFixed(2)} at Fishing 100.
              </p>

              <p className="font-karla font-600" style={{
                fontSize: '0.792rem', color: 'rgba(190,212,228,0.55)', marginTop: 14, lineHeight: 1.6,
              }}>
                {rack.length > 1
                  ? 'Rods can be swapped out here because you brought them. Everything else, reels and lines and hooks and the rods that go in the rack, is equipped at the Shipyard before you sail.'
                  : 'You sailed with one rod. Reels, lines, hooks and the rack you carry are all set at the Shipyard before you leave.'}
              </p>
            </Sheet>
          )
        })()}

        {/* ── THE HOLD ────────────────────────────────────────────────
            A hold that fills is the reason a session ends, and "12/40" says
            when but not what — so the decision it forces (sell to whom, or sail
            home) was being made blind. */}
        {holdOpen && (() => {
          const byId = new Map(log.allFishSpecies.map(f => [f.id, f]))
          const rows = (holdRows ?? [])
            .map(r => ({ ...r, sp: byId.get(r.fishId) }))
            .filter(r => r.sp)
            .sort((a, b) => (b.sp!.sell_value * b.qty) - (a.sp!.sell_value * a.qty))
          const total = rows.reduce((n, r) => n + r.sp!.sell_value * r.qty, 0)
          return (
            <Sheet key="hold" title="The hold"
              blurb={`${hold.count} of ${hold.capacity} aboard.`}
              onClose={() => setHoldOpen(false)}>
              {holdRows === null ? (
                <p className="font-karla font-600" style={{ fontSize: '0.816rem', color: 'rgba(190,212,228,0.5)', marginTop: 16 }}>
                  Counting the barrels…
                </p>
              ) : rows.length === 0 ? (
                <p className="font-karla font-600" style={{ fontSize: '0.816rem', color: 'rgba(190,212,228,0.55)', marginTop: 16, lineHeight: 1.6 }}>
                  Empty. Everything you land goes in here until you sell it.
                </p>
              ) : (
                <>
                  <div style={{ marginTop: 10 }}>
                    {rows.map(r => (
                      <div key={r.fishId} style={{
                        display: 'flex', alignItems: 'baseline', gap: 8,
                        padding: '0.38rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        <span className="font-karla font-700" style={{
                          flexShrink: 0, fontSize: '0.792rem', color: 'rgba(190,212,228,0.6)',
                          fontVariantNumeric: 'tabular-nums', minWidth: 26,
                        }}>×{r.qty}</span>
                        <span className="font-karla font-600 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#f2ead8' }}>
                          {r.sp!.name}
                        </span>
                        <span className="font-karla font-700" style={{
                          flexShrink: 0, fontSize: '0.816rem', color: '#f0c040', fontVariantNumeric: 'tabular-nums',
                        }}>⟡ {(r.sp!.sell_value * r.qty).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  {/* MARKET value, and it says so. What the hold actually fetches
                      depends on who buys it, so a single "worth" number would be
                      wrong everywhere except one counter. */}
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10,
                    paddingTop: 10, borderTop: '1px solid rgba(240,192,64,0.28)',
                  }}>
                    <span className="font-cinzel font-700" style={{ flex: 1, fontSize: '0.96rem', color: '#f2ead8' }}>
                      At full market
                    </span>
                    <span className="font-cinzel font-700" style={{
                      fontSize: '1.08rem', color: '#f0c040', fontVariantNumeric: 'tabular-nums',
                    }}>⟡ {total.toLocaleString()}</span>
                  </div>

                  <SheetLabel>Where to sell it</SheetLabel>
                  <p className="font-karla font-600" style={{
                    fontSize: '0.792rem', color: 'rgba(190,212,228,0.62)', marginTop: 6, lineHeight: 1.65,
                  }}>
                    Three ways to sell, and they pay by how far you carry it.
                    A quick sell from wherever you float gives you 75%. A buyer
                    you sail over to pays 74% to 86%, and the deeper the water
                    the better the rate. The Market ashore pays the full amount
                    above, but you have to bring the catch home yourself.
                  </p>
                </>
              )}
            </Sheet>
          )
        })()}

      </AnimatePresence>

      {/* THE CEREMONY, in the order it plays. Each hands off to the next on
          close, so a Megalodon landing runs cinematic -> Finn -> rank -> pet
          without any of them overlapping. */}
      {slain && (
        <AncientSlain
          fish={slain.fish}
          count={slain.count}
          total={slain.total}
          isMegalodon={slain.isMegalodon}
          onDone={() => {
            const beat = slain.finnBeat
            setSlain(null)
            if (beat) setFinnBeat(beat)
          }}
        />
      )}

      {finnBeat && <FinnScene beat={finnBeat} onComplete={() => setFinnBeat(null)} />}

      {rankUp && (
        <AncientRankUp
          name={rankUp.name}
          from={rankUp.from}
          to={rankUp.to}
          onClose={() => {
            const finished = rankUp.petGranted
            setRankUp(null)
            // The capstone is chained off the rank-up rather than announced
            // inside it, so the pet gets its own reveal instead of a paragraph
            // in a Rank II-shaped card. AncientRankUp's own comment asks for
            // exactly this.
            if (finished) setCapstone(true)
          }}
        />
      )}

      {capstone && (
        <VigilCapstone
          names={ANCIENT_IDS
            .map(id => log.allFishSpecies.find(f => f.id === id)?.name)
            .filter((n): n is string => !!n)}
          onClose={() => setCapstone(false)}
        />
      )}

      {/* LETTING ONE GO. Its own scene, mounted here beside the drawer that
          offers it — the wall is at sea, so the act is too. */}
      {releasing && (
        <AncientRelease
          name={releasing.name}
          fishId={releasing.id}
          rank={vigil[String(releasing.id)]?.rank ?? 1}
          onConfirm={async () => {
            const res = await releaseAncient(releasing.id)
            if ('ok' in res) setVigil(res.vigil)
          }}
          onClose={() => setReleasing(null)}
        />
      )}

      {/* ── THE ACTION SLOT — the same position in every phase ─────────────
          88px square, always, whatever is in it. The fishing screen holds this
          rule and states why: the button must not move between phases or your
          thumb goes looking for it mid-reel. No AnimatePresence around it
          either, for the reason FishingGame dropped one — a mode="wait" that
          gets stuck leaves the slot EMPTY, which is the recurring "there is no
          cast button" report. Plain conditionals always render something. */}
      <div style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        // NO `gap`, and every band below has a FIXED height, so this row is
        // exactly as tall in one phase as in every other. That is what keeps
        // the dial still: the content area above is flex:1 justified to its
        // bottom edge, so anything that changes the height of THIS row moves
        // the dial. The 88px slot was already fixed — what shifted was the
        // Tide Turner disappearing when the phase left 'hooked', which took 34
        // pixels out of the row and slid the dial down with it.
        // ── SITTING WHERE THE HELM SAT ──────────────────────────────
        // HELM_BOTTOM, not 22. The wheel is 92px off the bottom of the chart
        // (it has to clear the action pill, which owns 22), and this slot is
        // the same control in its other role — so it has to land on the same
        // spot or the thumb moves the instant the rod comes out, which is the
        // one thing a control that changes role must never do.
        //
        // This row's height is load-bearing: the content above is flex:1
        // justified to its bottom edge, so raising the row raises the dial with
        // it by the same 70px. That is deliberate and the reason it is stated
        // here — a future change to either number moves the dial.
        // ACTION_PAD_BOTTOM lands the cast button exactly on the helm, which
        // is the whole point of it on touch. --fh-lift is 0 there and adds
        // real space on a desktop, where there is no helm to line up with and
        // the button was simply sitting at the bottom of a tall window.
        paddingTop: 8, paddingBottom: `calc(${ACTION_PAD_BOTTOM}px + var(--fh-lift))`,
        pointerEvents: 'auto',
      }}>
        {/* THE HELM'S OWN SIZE. This slot is the joystick's other half — the
            wheel is a 112px circle at bottom 92 on the chart, and when the rod
            comes out it becomes this. Matching the diameter is what turns a
            swap of two controls into ONE control changing role: the thumb never
            moves and nothing resizes underneath it. HELM_D is exported from the
            chart so the two cannot drift apart. */}
        <div style={{ width: HELM_D, height: HELM_D, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {(phase === 'idle' || phase === 'result') && (
            <motion.button key="cast"
              onPointerDown={e => { e.preventDefault(); if (phase === 'result') castAgain(); else cast() }}
              className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
              style={{
                width: HELM_D, height: HELM_D, borderRadius: '50%',
                // A FLOOR UNDER THE TINT. This was a teal wash over whatever
                // happened to be behind it, so on pale water or a lit sprite
                // the sea read straight through the one control you need to
                // find without looking. The colour is still a translucent
                // gradient; what changed is that it now sits on something.
                background: 'radial-gradient(ellipse at 40% 35%, rgba(18,138,168,0.6), rgba(12,84,104,0.42)), rgba(5,13,20,0.97)',
                border: '1px solid rgba(52,190,220,0.62)', cursor: 'pointer',
                fontSize: '0.864rem', touchAction: 'manipulation', lineHeight: 1.15,
                color: canCast ? '#67d4e8' : 'rgba(103,212,232,0.4)',
                boxShadow: '0 6px 0 rgba(0,0,0,0.7), 0 0 28px rgba(14,116,144,0.35), inset 0 1px 0 rgba(255,255,255,0.14)',
              }}
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              whileTap={canCast ? { scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.6)' } : undefined}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
              {/* "Rigging" is only ever seen on a cold load: the frames are
                  fetched the moment the map mounts, and you have to sail to a
                  zone before this button exists at all. */}
              {!spritesReady ? 'Rigging'
                : holdFull ? <>Hold<br />Full</>
                  : outOfBait ? <>No<br />Bait</>
                    : phase === 'result' ? <>Cast<br />Again</> : 'Cast'}
            </motion.button>
          )}
          {phase === 'hooked' && (
            <motion.button key="reel"
              onPointerDown={e => { e.preventDefault(); strike() }}
              className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
              style={{
                width: HELM_D, height: HELM_D, borderRadius: '50%',
                background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.34), rgba(150,112,24,0.2)), rgba(9,10,14,0.97)',
                border: '1px solid rgba(240,192,64,0.58)', cursor: 'pointer',
                fontSize: '0.864rem', color: '#f0c040', touchAction: 'manipulation',
                boxShadow: '0 6px 0 rgba(0,0,0,0.7), 0 0 22px rgba(240,192,64,0.26), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
              Reel In
            </motion.button>
          )}
          {(phase === 'waiting' || phase === 'reeling') && (
            // The slot holds itself open rather than collapsing — the same
            // ellipsis the fishing screen shows while a reel resolves.
            <p className="font-karla font-600" style={{ fontSize: '0.744rem', color: 'rgba(190,212,228,0.5)' }}>…</p>
          )}
        </div>

      {/* THE SECONDARY BAND IS GONE. It reserved 26px between the cast
          button and the menus so the row never changed height, and the only
          thing it ever held was the auto toggle — which is under the level bar
          now, where it is out of the way of the thumb and impossible to miss.
          An empty band holding space for nothing is the clutter it was there
          to prevent. */}
      {/* ── THE FOUR MENUS ─────────────────────────────────────────────
          Loadout, Bait, Log, Hold. Equal quarters, two lines each: what the
          menu is, and the one live number from behind it worth glancing at.

          Three of the four are worth opening mid-session and the fourth, the
          Log, is the one you open least — but it is on the bar for the same
          reason it is on the fishing screen: a species you have never landed is
          the reason to care about a catch, and finding that out otherwise means
          leaving the water. */}
      <div data-no-steer style={{
        height: 'var(--fh-menu-h)', marginTop: 6, width: '100%', maxWidth: 448,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--fh-menu-gap)',
        padding: '0 0.75rem',
      }}>
        {/* LOADOUT. Not a locker any more — gear is equipped at the Shipyard,
            so out here this reads your kit and swaps between the rods you
            actually brought. */}
        <button
          onClick={e => { e.stopPropagation(); vibrate(8); setLoadoutOpen(true) }}
          style={MENU_BTN}>
          <span className="font-karla font-700 uppercase" style={MENU_KEY}>Loadout</span>
          <span className="font-karla font-700" style={MENU_VAL}>
            {rack.find(r => r.tier === activeRod)?.name ?? 'Your kit'}
          </span>
        </button>

        <button
          onClick={e => { e.stopPropagation(); if (canSwapBait) { vibrate(8); setTackleOpen(true) } }}
          disabled={!canSwapBait}
          style={{ ...MENU_BTN, cursor: canSwapBait ? 'pointer' : 'default', opacity: canSwapBait ? 1 : 0.55 }}>
          <span className="font-karla font-700 uppercase" style={MENU_KEY}>Bait</span>
          <span className="font-karla font-700" style={MENU_VAL}>
            {activeBaitDef?.name ?? 'None'} <span style={{ color: '#f0c040' }}>{baitLeft}</span>
          </span>
        </button>

        <button
          onClick={e => { e.stopPropagation(); vibrate(8); setLogOpen(true) }}
          style={MENU_BTN}>
          <span className="font-karla font-700 uppercase" style={MENU_KEY}>Log</span>
          <span className="font-karla font-700" style={{
            ...MENU_VAL, color: uncheckedNew.size > 0 ? '#4ade80' : '#dfeaf2',
          }}>{uncheckedNew.size > 0 ? `${uncheckedNew.size} new` : 'Catches'}</span>
        </button>

        {/* THE HOLD, and it goes red before it bites rather than after. It
            opens now: "12/40" tells you to stop fishing but not what you are
            carrying or what it is worth, which is the decision actually being
            made when a hold fills. */}
        <button
          onClick={e => {
            e.stopPropagation(); vibrate(8)
            setHoldRows(null); setHoldOpen(true)
            void holdContents().then(r => { if ('ok' in r) setHoldRows(r.rows); else setHoldRows([]) }).catch(() => setHoldRows([]))
          }}
          style={{
            ...MENU_BTN,
            border: `1px solid ${holdFull ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.16)'}`,
          }}>
          <span className="font-karla font-700 uppercase" style={MENU_KEY}>Hold</span>
          <span className="font-karla font-700" style={{
            ...MENU_VAL, fontVariantNumeric: 'tabular-nums',
            color: holdFull ? '#f87171' : '#dfeaf2',
          }}>{hold.count}/{hold.capacity}</span>
        </button>
      </div>

      {/* THE "STOW ROD" LINE IS GONE. Tapping the water stows the rod and
          always did, the water's name is already on the banner at the top, and
          a third row under the button was pushing the whole action column — and
          therefore the dial — up the screen for a job nothing needed doing. */}
      </div>
    </div>
  )
}
