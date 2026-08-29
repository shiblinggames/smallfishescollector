'use client'

// THE OCEAN HUB.
//
// Painted 2D, in the app, using art that already exists — not a renderer.
//
// The short history is worth keeping, because it is the reason this is shaped
// the way it is. This started as a Godot 3D scene (still in godot/sea, parked).
// The structure that came out of it was right: ports you dock at, waters you
// sail into, distance standing in for progression. The technology was wrong.
// The game's art is hand-painted, and an afternoon went into writing shaders to
// make a 3D renderer LOOK hand-painted, which is backwards when every plate in
// /public already is. Here the house style arrives for free.
//
// Everything moves in WORLD pixels; the viewport translates to follow the boat.
// One rAF loop owns the boat and the camera so they share a clock — nothing here
// animates on its own timer, because that is how a scene ends up feeling like
// several things happening near each other.

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import RenownPanel from '@/components/RenownPanel'
import Minimap from './Minimap'
import { decodeFog, encodeFog, fogHas, fogReveal, fogSet } from '@/lib/seaExplore'
import type { RenownState } from '@/app/(app)/actions/renown'
import type { FishSpeciesBasic } from '@/app/(app)/fishing/constants'
import type { VigilState } from '@/lib/ancientVigil'
import { saveSeaPosition as persistSeaPosition } from './traderActions'
import { PLACES, LANDMARKS, RESIDENTS, SOCIALS, HOME, OPEN_SEA, NORTH_WALL, OUTER_EDGE, GATE_X, GATE_HALF, GATE_DEPTH, inGate, EXP_ORIGIN, EXP_EDGE, SORTIE, SORTIE_HALF, inSortie, anchorageArc, RAID_EDGE, RAID_DOCK, VOYAGE_DOCK, DOCK_MOOR, DOCK_R, berthOf, inBerth, type Place } from './chart'
import { getShip } from '@/lib/ships'
import { ISLES, isleNear, chestArt, bandName, ashoreRange, type Isle } from '@/lib/seaIsles'
import { goAshore, type AshoreResult } from './isleActions'
import { crewTheDeck } from '../crew/actions'
import { SUBMERGE } from './submerge'
import { ART_COLLIDERS, PORT_COLLIDERS, ISLE_COLLIDERS } from './colliders'
import SubmergedSprite from './SubmergedSprite'
import { PORTAL, PORTAL_TIERS, inPortal, inPortalEye, warpPoint, CACHE_ISLE_IDS } from '@/lib/seaPortal'
import { buyPortalTier } from './portalActions'
import { bottlesAround, bottlePos, bottleWindow, BOTTLE_CELL, BOTTLE_REACH, type Bottle } from '@/lib/seaBottles'
import { digAt, digHintAt, DIG_SITES, DIG_HINT_RANGE, type DigSite } from '@/lib/seaDigs'
import { SURFACES, surfaceAt, inkStrength, type Surface } from '@/lib/seaSurface'
import { homeBuildings, builtAt, type Homestead } from '@/lib/homestead'
import { friendsAtSea, visitableHomesteads, homesteadOf, type FriendAtSea, type Visitable } from '../home/visitActions'
import { openBottle, digHere, type BottleResult, type DigResult, type DigState } from './digActions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getCharacterSprites } from '@/lib/characters'
import { BOATS, boatSpeed, boatAgility } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { PET_OVERLAYS, type PetSpecies } from '@/lib/pets'
import { getBait } from '@/lib/bait'
import { handlingRate, accelRate } from '@/lib/shipyard'
import { rodGlowClass } from '@/lib/rods'
import { vibrate } from '@/lib/haptics'
import FishingHere, { type FishingMods } from './FishingHere'
import TrawlIndicator from '../fishing/TrawlIndicator'
import DailyOrders from '../trawl-docks/DailyOrders'
import { getDailyChallenge } from '../fishing/dailyChallengeActions'
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import LevelRewardsGrant, { type Granted } from './LevelRewardsGrant'
import { claimFishingLevelRewards } from '../fishing/actions'
// A LEAF, not SeaMap's own exports. The cast button is this same control in its
// other role and needs these numbers — and FishingHere importing back from here
// is a cycle that killed the page on load. See app/(app)/sea/helm.ts.
import { HELM_R, HELM_D, HELM_BOTTOM, HELM_DEADZONE, HELM_HOLD_MS } from './helm'
import { seaClock, PHASE_LABEL, PHASE_GLYPH, type SeaPhase } from '@/lib/seaClock'
import { hotspotsAt, HOTSPOT_DEFS, TIER_GLOW, type Hotspot } from '@/lib/seaHotspots'
import { tradersAround, traderPos, yoonTrader, seaDay, plainRodFor, plainHookFor, KIND_LABEL, DEALS_PER_DAY, CELL, type Trader, type TraderLook } from '@/lib/seaTraders'
import TraderPanel from './TraderPanel'
import CrewPanel from './CrewPanel'
import { folkById, type FolkId } from '@/lib/seaFolk'
import { RODS } from '@/lib/rods'

/** The sprite for the rod a regular sells, when they sell one. One place, so
 *  the man on the water and the offer in his panel cannot show different
 *  tackle. */
function folkRodSlug(folkId: string): string | null {
  const tier = folkById(folkId as FolkId)?.rodTier
  if (!tier) return null
  return RODS.find(r => r.tier === tier)?.slug ?? null
}
import FolkPanel from './FolkPanel'
import SeaTour from './SeaTour'
import SeaLandfallHint from './SeaLandfallHint'
import { pendingPacts } from './pactActions'
import { coastClip, coastline } from '@/lib/islandShape'
import { openSeaPresence, BEAT_MS, type SeaPresence } from '@/lib/seaPresence'
import { finnHaunt, FINN_REACH, FINN_LOOK } from '@/lib/seaFinn'
import { finnState, speakToFinn, acceptFinnChallenge, declineFinnChallenge, claimFinnChallenge, turnInFinnQuest, type FinnSeaState, type FinnOffer, type FinnChallenge } from './finnActions'
import { FINN_NAME, findNextEncounterBeat, type FinnSceneLine } from '@/lib/finn'

// THE SEA'S OWN. `fishing/FinnEncounter` is still mounted by the retired
// fishing screen; this is the chart's version and it follows the chart's
// conversation convention. See FinnTalk for why they are separate.
const FinnTalk = dynamic(() => import('./FinnTalk'), { ssr: false })

/** Metres-per-second in world pixels. Sets how big the chart may be: the longest
 *  crossing anyone tolerates is about ten seconds, and the far zone is ~3,600px
 *  out. */
/**
 * BASE sailing speed, in world pixels per second: what a stock hull does with a
 * plain boat under it. Every refit and every hull multiplies up from here, to
 * double at the top of the ladder.
 *
 * 300, and the number has moved around enough to be worth writing down. It was
 * 470 as a BASE when the Shipyard shipped; then 470 as the CEILING with stock
 * at 62% of it (291); then 470 as a base again when stock went back to reading
 * 100%, which quietly handed every player a 1.61x speed-up nobody asked for —
 * a stock hull was suddenly doing what a fully refitted Clipper used to.
 *
 * 300 is close to the 291 that actually got played, so the feel is the one that
 * was tuned rather than the one that fell out of a label change, and the whole
 * six-tier ladder still multiplies cleanly off it.
 */
const SPEED = 300
/** Low is heavy. A boat should take a moment to get going. */
const ACCEL = 2.6

/**
 * HOW FAST THE BOW COMES ROUND, in radians per second, before the rudder tier
 * and the boat's own trim multiply it.
 *
 * 2.4 is about 137 degrees a second: a full reversal takes a beat and a quarter
 * turn is near enough instant. Slower than that and holding a heading with a
 * thumb feels like arguing with the boat.
 */
const TURN = 2.4

/**
 * HOW FAST SIDEWAYS VELOCITY BLEEDS OFF — the grip of the hull in the water,
 * and the one number that decides whether there is drift at all.
 *
 * The whole model used to be a single lerp of the velocity VECTOR toward the
 * target vector, which does two jobs at once: reaching top speed and changing
 * direction. That is why there was no handling stat to tune and no way for the
 * boat to slide — velocity had no memory of where the bow was pointing, so
 * there was no such thing as sideways.
 *
 * Split into forward and lateral, handling becomes a real number and drift
 * becomes the ABSENCE of full grip rather than a new system.
 *
 * 6 is deliberately high — lateral speed falls to a tenth of itself in 0.38s.
 * Measured on a hard 90-degree turn at 300 px/s: the stern steps out to about
 * 31% of forward speed and the boat is straight again inside 1.1s, most of
 * which is the turn itself. Enough that she has mass; not enough that anyone
 * has to learn to drive her.
 *
 * A LIVELIER RUDDER SLIDES MORE, which falls out of the maths rather than being
 * designed in and is worth keeping: turning faster generates more lateral
 * velocity, so the Spade Rudder peaks at 126 px/s of slide against the stock
 * rudder's 94. The best rudder is sharper AND looser, which is what a good
 * rudder actually feels like.
 *
 * Lower this number to make drift a mechanic. Nothing else has to change.
 */
const GRIP = 6
/** Starts easing off here. The gap to ARRIVE is the whole feeling of coasting
 *  into a berth rather than stopping dead like a cursor. */
const SLOW = 240
const ARRIVE = 26

/**
 * THE GROUND PLANE.
 *
 * A horizon at the top of the screen says the camera is tilted. Nothing else on
 * the chart was saying it: the world was a pure top-down translate, so the sky
 * was making a promise the water never kept, and every island read as a sticker
 * lying flat on a wall of blue.
 *
 * This is the promise kept. The whole world layer is squashed vertically, which
 * is what a flat plane does when you look across it instead of down at it —
 * every zone becomes an ellipse, every distance north-south foreshortens, and
 * sailing "up" the chart covers less screen than sailing sideways, exactly as
 * it should.
 *
 * It is an orthographic tilt, not true perspective: the squash is uniform
 * rather than tightening toward the horizon, so nothing gets smaller with
 * distance. That is deliberate. Real perspective on a scrolling top-down chart
 * means the scale under the boat changes as you sail, which breaks every
 * hit-test, and buys very little on a chart you read from directly above.
 */
/**
 * WHAT THE COLLECTION LOG NEEDS.
 *
 * One object rather than a dozen loose props, because it is one feature and
 * every field in it comes from the same read. The map does not look inside it;
 * it hands the whole thing to the drawer.
 */
export type SeaLog = {
  allFishSpecies: FishSpeciesBasic[]
  caughtFishIds: number[]
  mountedFishIds: number[]
  personalBests: Record<number, number>
  prestigeLevels: Record<string, number>
  goldenBoosts: Record<string, number>
  ancientCatches: number[]
  ancientVigil: VigilState
  vigilUnlocked: boolean
  zoneRewardsClaimed: Record<string, boolean>
}

/**
 * THE STACK, in one place.
 *
 * These were scattered inline and three of the screen-space overlays had no
 * z-index at all — which does not mean "on top", it means `auto`, and a
 * positioned element with `auto` paints BELOW one with any positive value. The
 * world layer is 1, so the action button, the water banner and the compass were
 * all painting underneath it: fine over open water, and hidden the moment an
 * island or a landmark happened to be in the same part of the screen.
 *
 * Anything the player can READ or PRESS belongs above the world. The world is
 * scenery; the button that gets you into it is not.
 */
const Z = {
  /** The water's colour, and the two moving surface layers over it. */
  backdrop: 0,
  /** Islands, landmarks, other boats. Everything in world coordinates. */
  world: 1,
  /** Off-screen direction markers. Above the world so an arrow is never behind
   *  an island, below the boat so it never crosses the captain. */
  compass: 3,
  /** The at-anchor ripples, and the player's boat. */
  ripples: 4,
  boat: 5,
  /** Scenery standing between the camera and the hull. The world is drawn in
   *  two passes and this is the near one — see OCCLUDERS. */
  front: 6,
  /** The full-screen "Entering the Abyss" flourish. */
  crossing: 7,
  /** Readouts: where you are, what time it is. */
  hud: 12,
  /** The action button — go ashore, fish here, hail. NOTHING covers this. */
  action: 13,
  /** The thumb helm, which sits under the action button and must stay on top
   *  of everything else so a drag is never intercepted. */
  helm: 14,
} as const

const GROUND = 0.58

/**
 * HOW FAR CLEAR OF THE REEF A REFUSED HULL IS PUT.
 *
 * The wall test is strict — `y < NORTH_WALL` — so a hull placed exactly on the
 * line reads as SOUTH of it. Anything that pushes a boat back has to push it
 * properly onto a side, or the side it belongs to and the side it is measured
 * as disagree, and every frame after that re-asserts the disagreement.
 *
 * A boat's width, near enough. Big enough that a frame of way cannot cross it,
 * small enough that being turned back does not look like being thrown back.
 */
const REEF_MARGIN = 40

/**
 * HOW FAR OUT THE CAMERA SITS, by screen width.
 *
 * The chart was drawn at desktop scale and then shown unchanged on a phone,
 * where a 390px-wide viewport sees 390 world pixels across. The zones are 1400
 * to 2300 across. So a portrait phone was showing about a sixth of one zone at
 * a time, with a 210px boat sitting in the middle of it taking up half the
 * width — which is why it felt cramped and why steering felt like nudging a
 * large object around a small box.
 *
 * Pulling back to ~0.5 on a phone doubles the water on screen in each direction
 * — four times the area — and takes the boat from over half the screen width
 * down to about a quarter of it. Capped at 1 so a desktop is unchanged, and
 * floored at 0.45 so the boat never becomes a speck.
 *
 * Everything that converts between screen and world has to know about this:
 * the tap handler divides it back out, the wake and the ripples are screen
 * measurements and scale with it, and the wash translates at the scaled rate or
 * the water parallaxes against the islands.
 */
function zoomFor(width: number): number {
  // CAPPED AT 0.82, NOT 1.0.
  //
  // At 1.0 a desktop saw about 800 world pixels across, which is under two
  // island widths and just enough of the sea to steer by. Pulling the cap back
  // shows a bit under a thousand, which is the difference between sailing and
  // sailing somewhere: you can see the next thing before you have left the last.
  //
  // The floor and the divisor are untouched, so phones are exactly where they
  // were — a 390px screen was already at 0.5 and never reached the cap.
  return Math.max(0.45, Math.min(0.82, width / 780))
}

/**
 * WHERE THE LAND STARTS, as a fraction of a port's radius.
 *
 * A port's `r` covers the shoals and the shore ring as well as the island, and
 * the painted land inside it works out at about 0.68r. So the shoreline a hull
 * can actually reach is a shade outside that — close enough to moor alongside,
 * far enough that the bow is not in somebody's tavern.
 *
 * The coastline is a wobbly polygon rather than a circle, so this is an average
 * of it. A per-vertex collision against the clip path would be exact and would
 * also let the boat wedge into a cove, which is a worse problem than the one it
 * solves.
 */
const SHORE = 0.72

/**
 * TWO GESTURES, AND THEY MEAN DIFFERENT THINGS.
 *
 *   A TAP is a short hop toward where you touched. Not the exact point — out
 *   here the visible sea is a few hundred world pixels on a phone and the zones
 *   are thousands, so "sail exactly there and stop" made crossing anything a
 *   rally of taps. And not an endless heading either: a tap is a nudge, it
 *   should feel like a flick of the tiller and then you are done.
 *
 *   A HOLD is a heading you keep. Press and stay pressed and the boat runs the
 *   bearing under your thumb for as long as you hold it, re-aimed every frame,
 *   so crossing the chart is one continuous gesture. Let go and it runs out
 *   gently rather than stopping dead.
 *
 * Two things ignore both and go exactly where they say, because for them the
 * arrival IS the point: a port, which you pull alongside, and a trader, who you
 * are meeting.
 */
/** How far a single tap moves you. Capped, not scaled — a tap near the hull
 *  goes where you tapped, a tap at the edge of the screen goes this far in that
 *  direction and no further. */
const TAP_HOP = 460

/**
 * WHERE LETTING GO COASTS TO.
 *
 * Releasing the helm must not stop the hull dead - that reads as hitting
 * something - so a release aims a short way further on and the boat eases off.
 * The question is: further on in WHICH direction.
 *
 * It used to be the direction the boat was already MOVING, and that is wrong
 * for the one case anybody notices. On a light tap the hull has not turned yet:
 * the heading takes time to come around, so a sixteenth of a second after you
 * press left, the velocity is still pointing wherever you were going before.
 * Releasing then re-aimed the run-out along the OLD heading and quietly threw
 * the tap away, which is why a quick nudge sometimes sailed the boat back the
 * way it came, or the way it went last time. The longer you held a direction
 * the more it worked, which is exactly the shape of a bug that reads as "the
 * steering feels off" rather than as a fault.
 *
 * So it coasts along what you last ASKED for, and falls back to velocity only
 * when nothing was asked - a blur mid-glide, say. After a long hold the two
 * agree anyway, so this only changes the case that was broken.
 */
/**
 * The bearing a set of held keys means, in world units. W+D is a true diagonal
 * and the y is divided by GROUND because a key means "down the SCREEN" and the
 * plane is squashed. Shared by the key press and the frame loop so the bearing
 * recorded at the instant of the press and the one steered by cannot differ.
 */
function keysToDir(k: Set<string>): Vec | null {
  const kx = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)
  const ky = (k.has('s') ? 1 : 0) - (k.has('w') ? 1 : 0)
  if (kx === 0 && ky === 0) return null
  const m = Math.hypot(kx, ky)
  return { x: kx / m, y: ky / m / GROUND }
}

function runOutTarget(pos: Vec, vel: Vec, cmd: Vec | null, scale: number): Vec {
  let dx = 0
  let dy = 0
  if (cmd) {
    const m = Math.hypot(cmd.x, cmd.y)
    if (m > 1e-4) { dx = cmd.x / m; dy = cmd.y / m }
  }
  if (dx === 0 && dy === 0) {
    const sp = Math.hypot(vel.x, vel.y)
    // Below this the hull is drifting, not running, and a "run-out" would be
    // the boat setting off rather than settling.
    if (sp > 1) { dx = vel.x / sp; dy = vel.y / sp }
  }
  if (dx === 0 && dy === 0) return { ...pos }
  return { x: pos.x + dx * TAP_HOP * scale, y: pos.y + dy * TAP_HOP * scale }
}

/** Held bearings are thrown far enough to be a direction rather than a place.
 *  Re-set every frame while the thumb is down, so the distance only has to be
 *  further than the boat can travel in one frame. */
const THROW = 9000
/** Press-and-hold this long without moving and it becomes a heading. Below it,
 *  the gesture is still a tap. */
const HOLD_MS = 220
/** Tap within this of the hull to drop anchor. */
const STOP_RADIUS = 190
/** How far a press has to travel before it counts as a drag. Generous enough
 *  that a thumb resting on glass does not become a course change. */
const DRAG_SLOP = 12

/** A short hop toward a point: the direction you asked for, the distance capped
 *  so one tap is one nudge. */
function hopToward(from: Vec, toward: Vec): Vec {
  const dx = toward.x - from.x, dy = toward.y - from.y
  const d = Math.hypot(dx, dy)
  if (d < 0.001) return { ...from }
  const reach = Math.min(d, TAP_HOP)
  return clearOfLand({ x: from.x + (dx / d) * reach, y: from.y + (dy / d) * reach })
}

function headingFrom(from: Vec, toward: Vec): Vec {
  const dx = toward.x - from.x, dy = toward.y - from.y
  const d = Math.hypot(dx, dy)
  if (d < 0.001) return { ...from }
  // Deliberately NOT cleared of land: this is a bearing, and bending it around
  // an island nine thousand pixels away would quietly turn the boat. The hull
  // collision is what stops you actually reaching the rock.
  return { x: from.x + (dx / d) * THROW, y: from.y + (dy / d) * THROW }
}

/** Half the beam of the boat, near enough. Baked into every obstacle radius so
 *  the hull stops when it TOUCHES a thing rather than when its centre reaches
 *  it, which is the difference between mooring alongside and parking inside. */
const HULL = 55

/**
 * EVERYTHING THAT TURNS THE HULL, as circles, worked out once.
 *
 * Islands, and any landmark marked solid. A wreck the size of your ship that
 * you glide straight through undoes the solidity the islands have; a buoy is a
 * float on a chain and bumping past one is fine, so buoys are not in here.
 *
 * The collision radius of a landmark is a fraction of its drawn width, because
 * the art is mostly superstructure — a rig is legs and a shed, and its
 * FOOTPRINT in the water is much narrower than the picture.
 */
/**
 * HOW CLOSE IS CLOSE ENOUGH TO GO ASHORE: inside the port's BERTH.
 *
 * The test has been through three eras. The island's own radius left fifteen
 * pixels of usable water on one heading. The generous ring (r + 420, any
 * bearing) fixed that and created two new problems: the prompt changed under
 * your thumb anywhere NEAR an island, and two islands needed 840px between
 * their rings or the prompts fought — which is what spread the harbour
 * cluster apart. Now the prompt lives in a drawn, visible circle of water off
 * each port's jetty — berthOf/inBerth in chart.ts, PortBerth below for the
 * paint. Deliberate on both sides: you dock by sailing INTO the berth, and
 * islands pack as close as the water allows.
 */

/**
 * A drawn collider expanded into world circles, or the default single circle
 * when nothing has been drawn for this art. See colliders.ts for the units;
 * the vertical conversion divides by GROUND because a sprite's painted height
 * maps onto MORE world-y than screen-y — the same arithmetic every standing
 * label on this chart already does in the other direction.
 */
/** An obstacle is a circle, or a capsule when x2/y2 are present. The loop
 *  tests against the closest point of the segment; a circle is the degenerate
 *  capsule whose segment is a point. */
type Obstacle = { x: number; y: number; r: number; x2?: number; y2?: number }

function artShapes(art: string, x: number, y: number, size: number, fallbackR: number): Obstacle[] {
  const c = ART_COLLIDERS[markKind(art)]
  if (!c || c.shapes.length === 0) return [{ x, y, r: fallbackR + HULL }]
  const px = (ax: number) => x + (ax - 0.5) * size
  const py = (ay: number) => y - (1 - ay) * c.aspect * size / GROUND
  return c.shapes.map(k => k.kind === 'circle'
    ? { x: px(k.ax), y: py(k.ay), r: k.ar * size + HULL }
    : { x: px(k.ax), y: py(k.ay), x2: px(k.bx), y2: py(k.by), r: k.ar * size + HULL })
}

/**
 * THE GATE STACKS, solid only once drawn.
 *
 * The four headlands are paint by the one-barrier rule — the band's face line
 * is the reef's collider — but they are the one rock a hull can actually
 * REACH: their paint climbs well past the face on the northern side of both
 * mouths, so you could sail onto them. A drawn entry for 'rock-gate-w'/'-e'
 * makes them solid; NO entry means no obstacle at all rather than a fallback
 * circle, because a fallback here would re-fight the face line, and that
 * fight is the bug the one-barrier rule exists to prevent.
 *
 * Lazy, because REEF and ANCHORAGE_WALL are generated further down the module
 * than this constant evaluates.
 */
let obstaclesAll: Obstacle[] | null = null
function allObstacles(): Obstacle[] {
  if (obstaclesAll) return obstaclesAll
  const stacks = [...REEF, ...ANCHORAGE_WALL]
    .filter(m => m.art.includes('rock-gate'))
    .flatMap(m => {
      const c = ART_COLLIDERS[markKind(m.art)]
      if (!c || c.shapes.length === 0) return []
      return artShapes(m.art, m.x, m.y, m.size, 0)
    })
  obstaclesAll = [...OBSTACLES, ...stacks]
  return obstaclesAll
}

const OBSTACLES: Obstacle[] = [
  ...PLACES.filter(p => p.kind === 'port').flatMap((p): Obstacle[] => {
    const c = PORT_COLLIDERS[p.id]
    if (!c || c.shapes.length === 0) return [{ x: p.x, y: p.y, r: p.r * SHORE + HULL }]
    return c.shapes.map(k => k.kind === 'circle'
      ? { x: p.x + k.ax * p.r, y: p.y + k.ay * p.r, r: k.ar * p.r + HULL }
      : { x: p.x + k.ax * p.r, y: p.y + k.ay * p.r, x2: p.x + k.bx * p.r, y2: p.y + k.by * p.r, r: k.ar * p.r + HULL })
  }),
  // EVERY landmark, not just the ones that remembered to say so. See the note
  // on `solid` in chart.ts: it is an opt-OUT now, because a rock you can sail
  // through is a bug nobody reports as one — they just stop believing the map.
  //
  // 0.42 OF THE WIDTH, not 0.3. `size` is what SeaMark draws the sprite at, so
  // its painted half-width is 0.5 of it — and a circle at 0.3 let the hull nose
  // a fifth of the way into every rock on the chart before anything stopped it.
  // On the big stacks that is over a hundred pixels of boat inside stone. A
  // shade under the paint is right, because these are irregular silhouettes and
  // the circle is the largest thing that fits in one, but a THIRD under is not.
  ...LANDMARKS.filter(m => m.solid !== false).flatMap(m => artShapes(m.art, m.x, m.y, m.size, m.size * 0.42)),
  // THE DISCOVERABLE ISLES. They were never here at all — twenty-seven rocks
  // with chests on them that a hull went straight through. `r` is their painted
  // radius (IsleRock draws at r * 2), so this stops the boat a hull clear of
  // the stone, well inside the r + 260 you can go ashore from.
  ...ISLES.flatMap((i): Obstacle[] => {
    const c = ISLE_COLLIDERS[i.id]
    if (!c || c.shapes.length === 0) return [{ x: i.x, y: i.y, r: i.r + HULL }]
    return c.shapes.map(k => k.kind === 'circle'
      ? { x: i.x + k.ax * i.r, y: i.y + k.ay * i.r, r: k.ar * i.r + HULL }
      : { x: i.x + k.ax * i.r, y: i.y + k.ay * i.r, x2: i.x + k.bx * i.r, y2: i.y + k.by * i.r, r: k.ar * i.r + HULL })
  }),
  // The two berths. You moor ALONGSIDE a dock; sailing through the middle of
  // one is the same bug as sailing through an island, and it is the structure
  // the whole swap happens at.
  ...artShapes('/sea/dock-raids.png', RAID_DOCK.x, RAID_DOCK.y, DOCK_R * 2.6, RAID_DOCK.r),
  ...artShapes('/sea/dock-voyages.png', VOYAGE_DOCK.x, VOYAGE_DOCK.y, DOCK_R * 2.6, VOYAGE_DOCK.r),
]

/**
 * THE REEF AND THE HARBOUR WALL ARE LINES, NOT CIRCLES.
 *
 * These rocks were briefly given collision of their own, to stop a hull being
 * drawn sitting on top of one. It worked and it was wrong: the reef ALREADY has
 * a barrier — the wall — and the rocks straddle it, so the two fought. The
 * clamp put a boat on the line, a rock pushed it off, the clamp put it back,
 * sixty times a second. A hull shaking itself apart on the border.
 *
 * Two barriers over one piece of water is the bug. There is one now: the line,
 * moved south to the band's own FACE, so you stop at the rocks' feet instead of
 * among them. See REEF_FACE. The rock goes back to being paint, which is all it
 * ever needed to be — nothing can reach it to sail through it.
 *
 * The same applies to the harbour wall and its rim. Both bands are pierced in
 * exactly one place, and both gaps are cut clear of rock by construction.
 */

/**
 * HOW FAR THE PAINTED BAND REACHES from the line it is drawn along.
 *
 * The boulders sit at 110 either side and jitter 75, and each is drawn with its
 * base at that point, so the southernmost paint is about 185 out. 200 stops a
 * hull just short of the nearest foot — close enough to read as pulling up at
 * the rocks, far enough that nothing overlaps.
 */
const REEF_FACE = 200

/** Nudge a point out to clear water if it has been asked for inside something
 *  solid. The helm should not be able to ORDER a course into rock, which is
 *  half the fix; the other half is that momentum cannot carry you in either. */
/** The closest point of an obstacle to p — the centre for a circle, the
 *  nearest point of the segment for a capsule. Everything else about the
 *  resolve is identical for both, which is the whole reason capsules were the
 *  shape to add. */
function obstacleNearest(o: Obstacle, px: number, py: number): { x: number; y: number } {
  if (o.x2 === undefined || o.y2 === undefined) return { x: o.x, y: o.y }
  const vx = o.x2 - o.x, vy = o.y2 - o.y
  const t = Math.max(0, Math.min(1, ((px - o.x) * vx + (py - o.y) * vy) / Math.max(1e-6, vx * vx + vy * vy)))
  return { x: o.x + vx * t, y: o.y + vy * t }
}

function clearOfLand(w: Vec): Vec {
  for (const o of allObstacles()) {
    const c = obstacleNearest(o, w.x, w.y)
    const dx = w.x - c.x, dy = w.y - c.y
    const d = Math.hypot(dx, dy)
    if (d < o.r) {
      // Dead centre has no direction to be pushed in, so pick one.
      if (d < 0.001) return { x: c.x + o.r, y: c.y }
      return { x: c.x + (dx / d) * o.r, y: c.y + (dy / d) * o.r }
    }
  }
  return w
}

/** WHERE THE WATERLINE ACTUALLY IS, relative to the centre of the screen.
 *
 *  Measured off the art, not guessed at, and measured at the RIGHT ROW — the
 *  first version took the hull's mid-height and put the rings through the
 *  middle of the boat, which is why they read as sitting off to one side: the
 *  hull is not symmetric about its middle, so a ring at the wrong height looks
 *  like a ring at the wrong place.
 *
 *  The numbers: the composite is 210px wide and the 900x800 character sheet
 *  renders 186.7px tall. The hull overlay sits at top 77%, width 55%, on art
 *  that is 493x146, so it renders 115.5 x 34.2 and its bottom edge lands at
 *  y=177.9 in composite space. Along that bottom row the opaque hull spans art
 *  x 80..394, centring it at composite x=120.6 — LEFT of the box centre, not
 *  right. Skipper then shifts the whole composite by (-8%, -26%).
 *
 *  Which puts the point where this boat actually touches water at 1px left of
 *  centre and 34px below it. */
const WATERLINE_X = -1
const WATERLINE_Y = 34

/** Marks in the wake. Enough to trail a couple of seconds at speed; more just
 *  costs nodes nobody can see. */
/** How close you have to be to hail someone. A trader is a person, not a
 *  region — you pull alongside them, you do not "enter" them. */
const HAIL_RANGE = 190

/**
 * THE WAKE, AS A V.
 *
 * It used to be sixteen symmetric circles laid down the centreline, each
 * growing uniformly as it faded. That reads as puffs dispersing behind the
 * boat, not as a wake — because the one thing everybody recognises about a
 * boat's wake seen from above is the V, and there was no V. Nothing about a
 * ring tells you which way the hull went.
 *
 * Marks are laid in PAIRS now, one to port and one to starboard, and each
 * drifts outward along the hull's beam as it ages. Two diverging lines, which
 * is the shape. Each mark is also turned to the heading and stretched along it,
 * so a single mark is a streak of disturbed water rather than a dot — and
 * because they live inside the world layer, the plane's own squash shears that
 * rotation exactly the way a real streak on the surface would foreshorten.
 */
/**
 * THE POOL HAS TO OUTLAST THE MARKS, and it never did.
 *
 * A mark lives WAKE_LIFE and one pair is laid every WAKE_EVERY, so
 * `WAKE_LIFE / WAKE_EVERY` pairs are on the water at any moment. The old
 * numbers needed 25 marks and allocated 16 — so the ring buffer wrapped onto
 * marks that were still visible and snuffed them, and the trail was quietly
 * chopped off a third of the way along and restarted. That is its own answer
 * to why the wake never looked like it went anywhere.
 *
 * 1900/95 is 20 pairs, and 22 are allocated: enough for the full trail with
 * headroom, and 44 composited elements is a rounding error next to the blurred
 * island layers this same loop stopped rasterising.
 */
const WAKE_EVERY = 95
const WAKE_LIFE = 1900
const WAKE_PAIRS = 22
const WAKE_MARKS = WAKE_PAIRS * 2
/** How far a mark slides off the centreline over its life, in world px. This
 *  number IS the V's angle: too little and the two lines read as one thick
 *  one, too much and the boat looks like it is dragging a net. */
const WAKE_SPREAD = 62

/**
 * WHERE THE FISHING BOAT PARTS THE WATER, as a fraction of its 210px sprite.
 *
 * SHE LOOKS LEFT, so her prow is below 0.5. The warships carry the same pair as
 * `seaBow` and four of them look the other way, which does not matter: the
 * point is read as an offset from the sprite's CENTRE and mirrored along with
 * the sprite, so each hull's ring simply sits on the prow that is drawn.
 *
 * Placed by eye on /sea/calibrate rather than derived, because a bounding box
 * does not know where a stem meets water: these are three-quarter views with
 * bowsprits of wildly different lengths, and the one formula that used to serve
 * all of them put the origin at 80% of the way to the prow on every hull, which
 * is wrong in a different direction each time.
 */
const FISHING_BOW = { x: 0.308, y: 0.599 }
/** And how far off the heading her wake leaves her. See `seaBowTilt`. */
const FISHING_BOW_TILT = 0
/** The Skipper sprite's width, which the fractions above are of. */
const SKIPPER_W = 210

/** How wide the fishing boat's hull actually draws: the boat overlay is 55% of
 *  the 210px Skipper sprite. The denominator of every hull comparison. */
const FISHING_HULL_W = 210 * 0.55
/** The box a warship is drawn in. One width for all five — see Warship. */
const WARSHIP_W = 340
/** The bow's lift under full power, in degrees, on the FISHING boat. Bigger
 *  hulls divide this down; see hullRef. */
const HEEL_MAX = 7

type Vec = { x: number; y: number }

/** '#rrggbb' → [r,g,b]. */
function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const OPEN_RGB = OPEN_SEA.map(rgb) as [number, number, number][]
/** Each band as the radius of its middle and its half-width, which is all the
 *  blend needs to know about a ring. */
/** The outer edge of the outermost band — where the chart's water stops. */
const LAST_OUTER = Math.max(...PLACES.map(p => p.outer ?? 0))

const WATER_RGB: { mid: number; half: number; c: [number, number, number][] }[] =
  PLACES.filter(p => p.kind === 'water' && p.sea)
    .map(p => ({
      mid: ((p.inner ?? 0) + (p.outer ?? 0)) / 2,
      half: Math.max(1, ((p.outer ?? 0) - (p.inner ?? 0)) / 2),
      c: (p.sea as [string, string, string]).map(rgb) as [number, number, number][],
    }))

/** Are we in this water? A band is a ring around the Mainland, south only. */
export function inBand(p: Vec, place: Place): boolean {
  if (place.kind !== 'water' || place.inner == null || place.outer == null) return false
  if (p.y <= 0) return false
  const R = Math.hypot(p.x, p.y)
  return R >= place.inner && R < place.outer
}

/**
 * THE COLOUR OF THE SEA WHERE YOU ARE.
 *
 * Regions used to be drawn as discs, which gave every zone a visible circular
 * edge you crossed like a doorway — the exact opposite of sailing out of one
 * stretch of water into another. There are no shapes now. Each water is a
 * COLOUR, and the sea is an inverse-distance blend of all of them plus the open
 * ocean, evaluated at the boat every frame.
 *
 * So the Shallows shade into open blue over a few hundred metres, and open blue
 * shades into the near-black of the Abyss, the way a real shelf does. Nothing
 * has an edge, and yet the water genuinely tells you where you are.
 *
 * The falloff is cubic on d/r: inside a water it dominates almost completely,
 * and by about twice its radius it contributes nearly nothing. Linear was far
 * too muddy — everything ended up the average of everything.
 */
/** The blend, and the two things the rest of the frame needs out of it: the CSS
 *  for the backdrop, and how DARK that water is. The wash and the sky both read
 *  the darkness so the whole frame agrees about how deep you are. */
type SeaLook = {
  css: string
  lum: number
  /** ONE SOLID COLOUR from the same blend, for anything that cannot take a
   *  gradient — the minimap paints 2,275 cells into a canvas, and
   *  `ctx.fillStyle = 'radial-gradient(…)'` is not an error, it is a silent
   *  no-op that leaves every cell the previous colour. */
  solid: string
}

/**
 * HOW FAR THE BOAT MUST MOVE before the backdrop is recomputed, in world pixels.
 *
 * The palette is a full-viewport gradient and rebuilding it is not free, so it
 * is not rebuilt sixty times a second. A band is two to three thousand pixels
 * across and its palette moves maybe twenty units over that, so 96px is well
 * under one unit of 255 — a step nobody can see.
 *
 * Applied as a DEADBAND in the loop, not by rounding the position here. Rounding
 * puts a boundary under a stationary boat and float noise flips it across that
 * boundary every frame; see the loop.
 */
/**
 * HOW CLOSE COUNTS AS SAILING TOGETHER.
 *
 * 2,600 world pixels, about two and a half screens at desktop zoom. Wide enough
 * that you start broadcasting BEFORE a friend comes over the horizon, so their
 * boat is already easing smoothly by the time you can see it rather than
 * snapping into place once and then settling.
 *
 * This is the switch that decides whether presence costs anything: outside it,
 * nothing goes on the wire at all. See lib/seaPresence.ts.
 */
const NEAR_ENOUGH = 2600

/** How often a position is written to the database, and how often the poll asks
 *  who is out there. One rate for both, and no longer adaptive — the close-up
 *  moved to Realtime and this went back to being a plain heartbeat. */
const FAR_MS = 20_000

const SEA_STEP = 96

/**
 * ── NIGHT ON EVERYTHING THAT IS NOT WATER ───────────────────────────────────
 *
 * The clock has always been real: `darkness` ramps 0 to 1 with its own dusk and
 * dawn fades, and `seaAt` pulls the whole water palette 78% toward a cold
 * blue-black when it does. What it never touched was the SOLID world — the
 * islands, the buildings, the wrecks, the traders and your own hull are painted
 * sprites and baked canvases, and they went on being lit for noon while the sea
 * around them went dark. Which is why night did not read: the water changed
 * colour and every object a captain actually looks at did not.
 *
 * A SHEET OVER THE TOP IS THE WRONG FIX, for the same reason `seaAt` gives for
 * not using one on the water: a flat dark overlay flattens what is under it
 * into one grey, and the Shallows stop being lighter than the Abyss. It would
 * also darken the water a second time, on top of the palette shift that is
 * already tuned.
 *
 * So the light is graded onto the world layers themselves and the water is left
 * to the palette. Dim, and desaturate rather harder than it dims — colour is
 * the first thing to go at low light and the last thing anybody notices going,
 * which is exactly why it sells. A touch of contrast comes back so the dimming
 * does not turn the whole chart to mud.
 *
 * CHEAP BECAUSE IT IS QUANTISED. `dark` is already rounded to 24 steps to stop
 * the backdrop strobing through dusk, and this rides the same number: a filter
 * on a promoted layer re-rasterises when its value changes, and this one
 * changes 24 times across a whole fade rather than sixty times a second.
 */
function nightGrade(dark: number, strength = 1): string {
  if (dark <= 0) return 'none'
  const k = dark * strength
  return `brightness(${(1 - k * 0.42).toFixed(3)}) `
    + `saturate(${(1 - k * 0.55).toFixed(3)}) `
    + `contrast(${(1 + k * 0.10).toFixed(3)})`
}

function seaAt(p: Vec, darkness = 0): SeaLook {
  // THE OPEN OCEAN GETS A SMALL VOTE, NOT A BIG ONE.
  //
  // It used to get 0.55, which meant that even sitting dead in the middle of
  // the Abyss more than a third of the colour was ordinary blue — the deep
  // zones never actually arrived at their own palette. And the falloff was
  // gentle enough that being inside a zone barely counted for more than being
  // near it. Now the vote is 0.18 and the falloff is a fourth power, so the
  // water reaches the colour it is supposed to be and reaches it well before
  // the middle, which is what "deep" is supposed to feel like.
  let wSum = 0.18
  const acc: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let k = 0; k < 3; k++) {
    for (let ch = 0; ch < 3; ch++) acc[k][ch] = OPEN_RGB[k][ch] * 0.18
  }
  // HOW FAR OUT ARE WE, from the Mainland. Every fishing band is a ring around
  // the origin, so one radius answers all five of them.
  //
  // CLAMPED at the outer edge of the last band. Without it the falloff runs
  // both ways and the water beyond the Ancient Deep brightens back toward
  // ordinary blue, so sailing off the end of the chart into nothing looks like
  // sailing into shallower water. Held at the edge colour, it just keeps being
  // the deepest water there is.
  const R = Math.min(Math.hypot(p.x, p.y), LAST_OUTER)
  // The bands only exist to the SOUTH. North of the Mainland this fades to
  // nothing over a few hundred pixels rather than stopping on a line, or the
  // equator would be a visible seam straight across the chart.
  const south = p.y > 0 ? 1 : Math.max(0, 1 + p.y / 700)

  for (const w of WATER_RGB) {
    // Distance from the MIDDLE of the band, as a fraction of its half-width.
    const d = Math.abs(R - w.mid) / w.half
    const d2 = d * d
    const weight = south / (1 + d2 * d2)
    wSum += weight
    for (let k = 0; k < 3; k++) {
      for (let ch = 0; ch < 3; ch++) acc[k][ch] += w.c[k][ch] * weight
    }
  }
  let out = acc.map(c => c.map(v => Math.round(v / wSum)))

  // NIGHT, applied to the blend rather than as a sheet over the top. A dark
  // overlay flattens everything underneath it into one grey; pulling the
  // palette itself down toward a cold blue-black keeps the Shallows lighter
  // than the Abyss after dark, exactly as they are before it.
  if (darkness > 0) {
    const NIGHT: [number, number, number] = [6, 11, 22]
    const k = darkness * 0.78
    out = out.map(c => c.map((v, i) => Math.round(v * (1 - k) + NIGHT[i] * k)))
  }

  // Perceived brightness of the DEEP stop, 0..1. Drives how much light the
  // painted wash is allowed to add.
  // Divided by 55, not 120. The deep stops on this chart run from about 39 down
  // to 16, so a 120 divisor squashed every zone into the bottom quarter of the
  // range and the Abyss came out barely darker than the Shallows.
  const lum = Math.min(1, (out[0][0] * 0.21 + out[0][1] * 0.72 + out[0][2] * 0.07) / 55)


  return {
    lum,
    // The middle stop, which is the colour this water reads as overall.
    solid: `rgb(${out[1].join(',')})`,
    // Painted three ways from the same blend, and weighted DOWN toward the
    // deep end: the pale stop used to own the top 38% of the screen, which is
    // a lot of light to be showing in water that is meant to be black.
    css:
      `radial-gradient(ellipse 130% 104% at 50% -10%, ` +
      `rgb(${out[2].join(',')}) 0%, ` +
      `rgb(${out[1].join(',')}) 24%, ` +
      `rgb(${out[0].join(',')}) 60%, ` +
      `rgb(${out[0].map(v => Math.max(0, Math.round(v * 0.62))).join(',')}) 100%)`,
  }
}


/**
 * THE SEA, DRAWN.
 *
 * Third attempt, and the first two are worth recording because they were both
 * the same mistake in different clothes.
 *
 *   1. CSS light sheets — striped caustics and a sun shaft. Gradients with hard
 *      stops make LINES, and a sheet of light over a flat colour is still a
 *      flat colour with a sheet over it.
 *   2. Drawn swell crests. Better physics, still wrong: a top-down ocean
 *      rendered as long wavy strokes reads as contour lines on a map, and the
 *      glints came out as little dashes of debris.
 *
 * Both were trying to draw the ocean's SHAPE. But every other pixel in this
 * game is hand-painted watercolour, and watercolour does not describe water
 * with outlines — it describes it with pigment settling unevenly. Mottling,
 * granulation, blooms of darker wash pooling against lighter.
 *
 * So that is what this is. Two seamless tiles of soft irregular blotches, one
 * darker and coarse, one lighter and finer, tiled across the chart and drifting
 * over each other at different speeds. Where they cross you get a shifting
 * depth that never resolves into a pattern, and never has an edge in it
 * anywhere. Nothing is stroked. Nothing blinks.
 *
 * It is cheap, too: the tiles are painted once into offscreen canvases and then
 * only ever blitted as repeating patterns, so a frame is two fills regardless
 * of how much ocean is on screen.
 */
/** THE TWO TILES ARE DIFFERENT SIZES ON PURPOSE.
 *
 *  A tiled texture is seamless but it still repeats, and at one size you can
 *  see the same patch of sea go by twice on a wide screen. Two coprime-ish
 *  sizes only line back up at their lowest common multiple — 640 and 576 give
 *  5760px, which is wider than the whole chart — so the combination never
 *  visibly repeats even though each layer does. */
const DEEP_TILE = 640
const PALE_TILE = 576

/** One seamless tile of soft blotches. Each blob is drawn nine times, at every
 *  wrap offset, so a blob crossing an edge continues correctly on the far side
 *  and the tiling has no seam to spot. */
function makeMottle(
  TILE: number, count: number, rgb: string, rMin: number, rMax: number, alpha: number, seed: number,
  /** Overrides the per-mark squash. Regions use it to go from round chop to
   *  long streaks with the same generator. */
  squashAt?: number,
  /** A FIXED heading for every mark, instead of each one tilting at random.
   *  This is what turns a scatter of blobs into a current: the marks stop being
   *  independent and start agreeing with each other. */
  tiltAt?: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = TILE
  const g = c.getContext('2d')
  if (!g) return c
  // A plain LCG rather than Math.random: the same sea every session means a
  // stretch of water always looks like itself, which is what stops it reading
  // as static noise.
  let st = seed >>> 0
  const rnd = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < count; i++) {
    const x = rnd() * TILE, y = rnd() * TILE
    const r = rMin + rnd() * (rMax - rMin)
    const a = alpha * (0.45 + rnd() * 0.55)
    // Squashed, so the pigment pools along the current instead of in circles.
    const squash = squashAt !== undefined ? squashAt * (0.82 + rnd() * 0.36) : 0.42 + rnd() * 0.3
    const tilt = tiltAt !== undefined ? tiltAt + (rnd() - 0.5) * 0.18 : rnd() * Math.PI
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = x + ox * TILE, cy = y + oy * TILE
        if (cx < -r || cx > TILE + r || cy < -r || cy > TILE + r) continue
        g.save()
        g.translate(cx, cy)
        g.rotate(tilt)
        g.scale(1, squash)
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, r)
        grad.addColorStop(0, `rgba(${rgb},${a})`)
        grad.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`)
        grad.addColorStop(1, `rgba(${rgb},0)`)
        g.fillStyle = grad
        g.beginPath()
        g.arc(0, 0, r, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
    }
  }
  return c
}

/**
 * THE WASH, AS TWO COMPOSITED LAYERS.
 *
 * This used to be a canvas filled twice a frame, and it was by far the most
 * expensive thing on the page. The fill had to cover the viewport PLUS a whole
 * tile in each direction (because the pattern offset can be anything up to one
 * tile), and then the vertical squash meant filling h/GROUND rather than h. On
 * a 420x800 phone that came to 4.1M pixels a frame — twelve times the screen,
 * sixty times a second, about 245M pixels a second of pure overdraw.
 *
 * None of that work was ever necessary. The pattern does not change; only where
 * it sits does. So each layer is now an ordinary div with the tile as a
 * repeating background-image, and moving the sea is one transform write that
 * the compositor handles on the GPU. Zero painting per frame.
 *
 * The tiles are rasterised once at mount and handed over as data URLs.
 */
let deepURL: string | null = null
let paleURL: string | null = null
/**
 * ONE TILE PER BAND, built on first use and kept forever.
 *
 * Five canvases at a few hundred pixels each. Built lazily because this needs a
 * DOM and the module is imported on the server too, and cached because the
 * whole point is that a stretch of water always looks like itself.
 */
const surfaceURLs: Record<string, string> = {}
function surfaceTile(v: Surface): string {
  if (!surfaceURLs[v.band]) {
    const t = v.tile
    surfaceURLs[v.band] = makeMottle(
      t.size, t.count, t.rgb, t.rMin, t.rMax, t.alpha, t.seed, t.squash, t.tilt).toDataURL()
  }
  return surfaceURLs[v.band]
}

function seaTiles(): { deep: string; pale: string } | null {
  if (typeof document === 'undefined') return null
  if (!deepURL) deepURL = makeMottle(DEEP_TILE, 48, '2,16,30', 90, 220, 0.18, 0x5eed1).toDataURL()
  if (!paleURL) paleURL = makeMottle(PALE_TILE, 52, '198,232,246', 40, 105, 0.07, 0xa17c3).toDataURL()
  return { deep: deepURL, pale: paleURL }
}

export default function SeaMap({
  fishingXP, characterColor, boatId, hatId, mods, gear, bait, baitQty, baitBag, hold, rack, hullSpeed, handlingTier, accelTier, start, log, trawlsOut, renown, exploredRaw, discovered, digs, homestead, crewTiers, dealtToday,
  auto, tideTurner, userId, tour, shipTier, raidParty, raidItems, raidSeats, itemMounts, raidRepairOwed, portal, startSide,
}: {
  fishingXP: number
  /** Your own id. The one thing presence needs that the chart did not already
   *  have: you broadcast on `sea:<userId>` and nowhere else. */
  userId: string
  /** What the captain has already been taught. Both latch on profile columns,
   *  so neither replays on another device or after a reinstall. */
  tour: { seen: boolean; hints: string[] }
  /** The player's own loadout, so the thing crossing the ocean is the captain
   *  they dressed in the boat they bought — not a marker. */
  characterColor: string
  boatId: string | null
  hatId: string | null
  /** Everything the dial needs to be the REAL dial. See FishingHere. */
  mods: FishingMods
  gear: Gear
  bait: string
  /** No baitBonus prop any more: it is derived from whichever bait is on the
   *  hook, and the bait row lets that change mid-session. */
  baitQty: number
  baitBag: { type: string; quantity: number }[]
  hold: { count: number; capacity: number }
  /** THE RACK — the only rods that can be changed to at sea. Resolved on the
   *  server from what the Shipyard loaded, so a client cannot fish with a rod
   *  it did not bring. */
  rack: {
    tier: number; name: string; slug: string | null; image: string | null
    glow: string | null; color: string | null
    catchZoneBonus: number; perfectZoneBonus: number
    retryOnMiss: number; snagImmune: boolean; perfectXpMult: number
  }[]
  /** Multiplier on sailing speed. Nothing else. */
  hullSpeed: number
  /** The expedition hull you own. Only ever drawn beyond the sortie — inside
   *  the anchorage and the fishing grounds you are on the fishing boat. */
  shipTier: number
  /** How many crew are in raid seats. The sortie's confirm says who is coming,
   *  and "nobody" is a thing it has to be able to say. */
  /** The raid party as it would actually board: names and card art, from the
   *  same loader every raid uses. The dock is where the muster is confirmed. */
  raidParty: { name: string; art: string }[]
  /** What is mounted, names and images resolved server-side. */
  raidItems: { name: string; image: string | null }[]
  /** How many seats and mounts the ship HAS, so the muster can show the empty
   *  ones. A muster that only lists who came cannot say who is missing. */
  raidSeats: number
  itemMounts: number
  /** Owed repairs. Sailing a sunk ship is refused at the raid screen; the dock
   *  is where that should be discovered, not past the sortie. */
  raidRepairOwed: number
  /** The Homestead Portal: highest tier owned, and components in hand —
   *  cache chests opened minus components already spent. */
  portal: { tier: number; components: number }
  /** Rudder and rig tiers, from the Shipyard. */
  handlingTier: number
  accelTier: number
  /** Where the boat was when you last left. Null = never sailed. */
  start: Vec | null
  /** WHICH SEA that position is in. Restored together with it, so a captain
   *  who logged off in the anchorage or out on the sortie comes back there on
   *  the right hull rather than being quietly returned to the fishing grounds. */
  startSide: 'fishing' | 'anchorage' | 'moored' | 'open'
  /** Everything the collection log reads. See SeaLog. */
  log: SeaLog
  /** ISO moments each running trawl comes due. See the Docks mark. */
  /** Every crew currently out, with the water they are working and the moment
   *  they are due back. Timestamps rather than a count, so the chart can work
   *  out how many are waiting at any instant without asking the server again —
   *  a crew that finishes while you are halfway to the Abyss lights the fleet
   *  up on its own. */
  trawlsOut: { zone: string; endsAt: string; crew: string; art: string }[]
  /** Fishing renown, for the level bar's chip. Null below the cap. */
  renown: RenownState | null
  /** Base64 fog bitfield as stored. See lib/seaExplore. */
  exploredRaw: string | null
  /** Isles this captain has already been ashore at. Ids from lib/seaIsles. */
  discovered: string[]
  /** Dig bearings held, and which of those are already up. */
  digs: DigState
  /** The captain's own island, as it currently stands. */
  homestead: Homestead
  /** Trader keys already dealt with today, read on the server so the count
   *  cannot be reset by reloading the page. */
  /** What stands on the Crew Hall's island: the tiers this captain has bought.
   *  Hall, drill yard, stores, each 1..6. */
  crewTiers: { hall: number; drill: number; stores: number }
  dealtToday: string[]
  /** The specials the CLIENT has to drive. See FishingHere for why these three
   *  are the only ones that needed carrying out here. */
  auto: { tier: 0 | 1 | 2; maxRarity: number; on: boolean }
  tideTurner: { has: boolean; left: number }
}) {
  const router = useRouter()
  const level = useMemo(() => getLevelFromXP(fishingXP), [fishingXP])

  /**
   * WHAT LEVELLING OWES YOU, COLLECTED.
   *
   * claimFishingLevelRewards is idempotent and state-based: it compares
   * claimed_fishing_levels against the level the XP implies and hands over the
   * difference. It was called from ONE place, the fishing screen's mount — and
   * that screen redirects every captain who can sail to this one. So the
   * rewards have been accruing correctly and going to nobody.
   *
   * On arrival, and again whenever a rod is stowed, which is when a level is
   * most likely to have just happened. Twice a session at worst, and because it
   * is state-based rather than an event, the first call pays out everything a
   * captain has been owed since the sea opened.
   */
  const [levelGrant, setLevelGrant] = useState<Granted | null>(null)
  const collectLevelRewards = useCallback(() => {
    void claimFishingLevelRewards().then(res => {
      if (!res.granted.length) return
      setLevelGrant(res.granted)
      // The purse in the nav reads these events; without them the doubloons
      // land in the database and the number on screen stays where it was.
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.newGems }))
    }).catch(() => { /* a missed collection is picked up next time */ })
  }, [])
  useEffect(() => { collectLevelRewards() }, [collectLevelRewards])

  /**
   * OUT ON THE SORTIE — past the anchorage rim, on the ship you own.
   *
   * The same ref-plus-state pair as the anchorage and for the same reason: the
   * frame loop reads a ref sixty times a second and the chrome reads a state
   * when it changes. What differs is that this one is not something you can
   * drift into. `sortieAsk` holds the confirm open while the boat sits in the
   * mouth, and nothing changes until it is answered.
   *
   * IT PERSISTS, and the first cut of this did not. Both northern states lived
   * only as long as the component: switching tabs and coming back reset them
   * and restored a fishing position, so a captain who had taken their ship out
   * was silently put back in the harbour on the fishing boat. That is a far
   * more common thing to do than closing the tab, and it read as being kicked
   * off your own ship. See saveSeaPosition — the position now carries the side
   * it belongs to, which is what makes storing a northern one safe.
   */
  const [onSortie, setOnSortie] = useState(startSide === 'open')
  const sortieRef = useRef(startSide === 'open')
  /**
   * WHICH HULL IS UNDER YOU, which is now a separate question from which water
   * you are in.
   *
   * The swap happens at a dock rather than at the gate, so the expedition ship
   * exists inside the anchorage: tied up, or crossing the harbour toward the
   * sortie. `onSortie` only says whether you are past the rim.
   *
   * The two rules that make the docks mean anything both hang off this:
   * a fishing boat may not pass the sortie, and a warship may not go back down
   * through the reef.
   */
  const [onShip, setOnShip] = useState(startSide === 'moored' || startSide === 'open')
  const shipRef = useRef(startSide === 'moored' || startSide === 'open')
  /** Which dock you are alongside, if any. Drives the prompt. */
  const [atDock, setAtDock] = useState<'raid' | 'voyage' | null>(null)
  const dockRef = useRef<'raid' | 'voyage' | null>(null)
  /** What the chart last refused to let you do, shown as a passing line. */
  const [refused, setRefused] = useState<string | null>(null)
  const refusedAt = useRef(0)

  /** THE WAKE. A fixed pool of marks laid in WORLD space and left behind, which
   *  is what makes it a wake rather than a tail: each stays exactly where the
   *  hull dropped it while the boat sails on. Recycled oldest-first, so there is
   *  no allocation in the loop and no garbage at 60fps. */
  const wakeRefs = useRef<(HTMLDivElement | null)[]>([])
  /**
   * WHAT THIS HULL LEAVES BEHIND. Most boats leave foam; a few leave something
   * of their own — see `wake` in lib/boats. Read once per boat rather than per
   * mark, because all of them are the same trail and the loop writes to these
   * nodes every frame.
   */
  const wakeClass = useMemo(() => {
    // PLAIN FOAM ON THE SHIP. The coloured wakes belong to the fishing hulls
    // that earned them — an Ethereal fishing boat trailing spirit-light is the
    // reward for buying an Ethereal fishing boat, and it has no business
    // following a Man-o-War around just because the same captain owns both.
    if (shipRef.current) return 'sea-wake'
    const w = BOATS.find(b => b.id === boatId)?.wake
    return w ? `sea-wake sea-wake--${w}` : 'sea-wake'
  }, [boatId, onShip])
  // Each mark remembers the hull that made it. Reading the CURRENT hull when
  // drawing would resize every mark still on the water the instant you change
  // ships, so a Sloop's wake would swell into a Man-o-War's behind you.
  const wakeAt = useRef(Array.from({ length: WAKE_MARKS }, () => ({
    x: 0, y: 0, born: -9999,
    /** Heading at birth, radians. The mark keeps it — the water does not turn
     *  just because the boat did, which is what makes a turn leave a curve. */
    ang: 0,
    /** -1 to port, +1 to starboard. The pair that makes the V. */
    side: 1,
    /** How hard she was going when this was laid, 0..1. Fast water is brighter
     *  and throws wider. */
    force: 1,
    /** The hull that made it, relative to the fishing boat. Carried on the mark
     *  rather than read at draw time, or changing ships would resize every
     *  piece of foam still on the water behind you. */
    scale: 1,
  })))
  const wakeNext = useRef(0)
  const wakeLast = useRef(0)

  /** The at-anchor ripples, dimmed as you get under way — a boat making six
   *  knots is not sitting in its own rings. */
  const rippleRef = useRef<HTMLDivElement | null>(null)

  /** The cloud bank, which parallaxes at a fraction of the camera. */
  /** The sky, recoloured every frame to match the water under it. */
  const skyRef = useRef<HTMLDivElement | null>(null)

  /** THE WATER ITSELF — two composited layers, moved not repainted. */
  const deepRef = useRef<HTMLDivElement | null>(null)
  const paleRef = useRef<HTMLDivElement | null>(null)
  /** The band's own surface. One element; its image swaps when you cross out. */
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  /** Which band's water is currently painted, and how far through the
   *  cross-fade we are. Refs: all of this is written by the frame loop. */
  const paintedBand = useRef<string>('')
  const surfaceFade = useRef(1)
  const tiles = useMemo(() => seaTiles(), [])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  /** The thin layer above the hull. Carries the world's own transform, written
   *  in the same breath, or the two would disagree by a frame and the scenery
   *  in front of her would swim. */
  const frontRef = useRef<HTMLDivElement | null>(null)
  const boatRef = useRef<HTMLDivElement | null>(null)

  // Position, velocity and target live in refs, not state: they change every
  // frame and re-rendering React sixty times a second to move one sprite is how
  // a map like this ends up dropping frames on a phone.
  // START WHERE YOU LEFT OFF, not at the dock. Read ONCE into a ref rather
  // than tracked as state: this is a starting point, and re-seeding it when the
  // prop happens to change would teleport a boat that is under way.
  //
  // CLAMPED NORTH ONLY IF THE SAVE SAYS YOU WERE SOUTH. The wall can move — a
  // position saved before the reef became a border would otherwise strand you
  // outside the world — but a captain who was legitimately in the anchorage
  // saved a northern position on purpose, and dragging them back to the wall
  // would be the stranding rather than the cure.
  const startAt: Vec = start
    ? {
      x: start.x,
      // ONTO THE SIDE THE SAVE SAYS, and clear of the line. A row written
      // before the clamp above was fixed can hold a northern side with a
      // position sitting exactly on the wall, which is the stuck state itself
      // — restoring it faithfully would restore the bug. This heals those on
      // the way in, and costs nothing for a row that was always fine.
      y: startSide === 'fishing'
        ? Math.max(NORTH_WALL + REEF_MARGIN, start.y)
        : Math.min(NORTH_WALL - REEF_MARGIN, start.y),
    }
    : { ...HOME }
  const pos = useRef<Vec>({ ...startAt })
  const vel = useRef<Vec>({ x: 0, y: 0 })
  // THE HELM STARTS WHERE THE BOAT IS, which is only worth saying because it
  // used to start at HOME. Once the boat could open the page somewhere other
  // than the dock, that made the target a course — so a refit in the Abyss came
  // back to a boat already under way, sailing itself to the Mainland, with
  // nobody touching the helm. A target you did not set is not a destination.
  const target = useRef<Vec>({ ...startAt })

  // The equipped hull's two numbers, mirrored into refs so the 60fps loop never
  // reads a prop and never needs re-creating when the boat changes.
  const speedRef = useRef(1)
  speedRef.current = boatSpeed(boatId)
  /**
   * WHERE THE BOW POINTS, in radians. Not the same as where the boat is going —
   * that is the entire point of splitting the two, and the gap between them is
   * the drift.
   */
  const headRef = useRef(0)
  // The two rates, each the bought ladder times the boat's own trim. The trim
  // still trades speed for nimbleness; the ladders are what money buys.
  const handlingRef = useRef(1)
  const accelRef = useRef(1)
  handlingRef.current = handlingRate(handlingTier) * boatAgility(boatId)
  accelRef.current = accelRate(accelTier) * boatAgility(boatId)
  const facing = useRef<1 | -1>(1)

  // ── STEERING BY THUMB ───────────────────────────────────────────────────
  // Tap-to-course is fine with a mouse and miserable on a phone: crossing the
  // chart meant tapping, watching, tapping again. Holding is the fix — press
  // and the boat heads for your thumb, keep holding and drag and it follows,
  // which is one continuous gesture instead of twenty discrete ones.
  //
  // The tap survives untouched. A press that never travels far enough is still
  // a tap and still runs onTap, so entering a port and starting a cast work
  // exactly as before; only a press that MOVES becomes a heading.
  /**
   * THE HELM.
   *
   * Steering by tapping the sea has one flaw on a phone that no tuning fixes:
   * to steer you must touch the water you are trying to look at, and the
   * further you want to go the more of the view your hand covers.
   *
   * So the bearing comes from a fixed control instead, dead centre and just
   * above the action buttons — under the thumb that is already there for Hail
   * and Fish, and never over the boat or the water ahead. Where you touch
   * inside it IS the bearing: centre neutral, top edge north, right edge east.
   * Distance from the centre sets the speed, because a direction-only control
   * makes every touch full sail and easing alongside a trader impossible.
   */
  const boxRef = useRef<HTMLDivElement | null>(null)
  /** The live touch inside the box, in client coordinates. */
  const boxHeld = useRef<Vec | null>(null)
  /**
   * THE LAST BEARING THE PLAYER ACTUALLY ASKED FOR, in world units, written by
   * whichever input is steering and cleared the moment the gesture ends.
   *
   * It exists because velocity is a slow and dishonest answer to "which way is
   * this boat being steered" - see runOutTarget. Cleared on release so a later
   * blur or stray event cannot coast along a command from minutes ago.
   */
  const cmdDir = useRef<Vec | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)

  /**
   * THE HELM IS THREE CONTROLS, told apart by what your thumb does.
   *
   *   DRAG   steer. Unchanged, and still the common case.
   *   TAP    do the nearest thing — go ashore, hail, dig, take the bottle.
   *   HOLD   put the rod in the water where you are.
   *
   * It used to be one: pointer-down set a bearing immediately, so a tap that
   * landed a few pixels off centre threw a target nine thousand pixels away and
   * the boat lurched before your thumb was off the glass. A control cannot
   * offer a tap while it also treats the beginning of every tap as a command.
   *
   * So nothing steers until the thumb has actually MOVED past HELM_DEADZONE.
   * Below that it is still deciding, and which of the other two it becomes
   * depends only on how long you stay.
   */
  const helmDown = useRef<{ x: number; y: number; at: number } | null>(null)
  /** Set once a press has been ruled a steer; it cannot become a tap after. */
  const helmSteering = useRef(false)
  /** Counts up 0..1 while a still thumb rests, and drives the ring. */
  const [helmHold, setHelmHold] = useState(0)
  const helmHoldTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  /** The hold's interval is a closure made at press time; it reaches the live
   *  starter through here rather than capturing a stale one. */
  const startFishingRef = useRef<() => boolean>(() => false)

  const [helmOn, setHelmOn] = useState(false)

  /** Client point to a world bearing, or null inside the deadzone. Normalised
   *  to the helm's half-extents, so the rim is reachable in every direction. */
  const boxVec = useCallback((p: Vec): { x: number; y: number; mag: number } | null => {
    const el = boxRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    // Normalised to the box's half-extents, so the CORNERS are reachable — the
    // box is much wider than it is tall, and using raw pixels would make east
    // several times harder to ask for than north.
    const nx = (p.x - (r.left + r.width / 2)) / (r.width / 2)
    const ny = (p.y - (r.top + r.height / 2)) / (r.height / 2)
    const d = Math.hypot(nx, ny)
    if (d < 0.12) return null
    return { x: nx / d, y: ny / d, mag: Math.min(1, d) }
  }, [])

  const dragFrom = useRef<Vec | null>(null)
  const dragging = useRef(false)
  /** True once the press has become a HEADING — either by being held still long
   *  enough, or by travelling far enough to be a drag. */
  const holding = useRef(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The thumb, in SCREEN coordinates. It has to be re-projected every frame
   *  rather than stored as a world point: the finger is still, but the world is
   *  moving under it, so the bearing changes even when nothing is dragged. */
  const holdAt = useRef<Vec | null>(null)
  /** So the loop can convert without being rebuilt when toWorld changes. */
  const toWorldRef = useRef<((x: number, y: number) => Vec | null) | null>(null)
  /** Set on release after a drag, so the click the browser fires at the end of
   *  the gesture does not also re-plot a course. */
  const swallowTap = useRef(false)

  /** SPRITE PRELOAD, and the reason the cast used to tear.
   *
   *  The captain is not one image, it is a base sprite with the boat, hat, rod,
   *  reel, hook and pet composited on top, and FOUR of those swap file when the
   *  cast pose plays: the character, the boat, the hat and a per-frame rod.
   *  React sets all four `src` attributes in the same commit, but each <img>
   *  paints when ITS OWN bitmap is ready — so on a cold first cast they landed
   *  on different frames and you saw the base in its new pose with the boat
   *  still in the old one.
   *
   *  Same fix FishingGame uses: fetch and explicitly decode() every frame up
   *  front, so by the time the src changes the bitmap is already decoded and
   *  all four swap on one paint. The Cast button waits on this, which on any
   *  warm load resolves before the button is ever on screen.
   */
  const [spritesReady, setSpritesReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    const c = getCharacterSprites(characterColor)
    urls.push(c.rest, c.wait, c.cast)
    const b = BOATS.find(x => x.id === boatId)
    if (b) urls.push(b.restImageUrl, b.castImageUrl)
    const h = HATS.find(x => x.id === hatId)
    if (h) urls.push(h.restImageUrl, h.castImageUrl)
    if (gear.rodSlug) urls.push(`/${gear.rodSlug}_rest.png`, `/${gear.rodSlug}_wait.png`, `/${gear.rodSlug}_cast.png`)
    else if (gear.rod) urls.push(gear.rod)
    if (gear.reel) urls.push(gear.reel)
    if (gear.hook) urls.push(gear.hook)
    if (gear.petArt) urls.push(gear.petArt)
    Promise.all(urls.map(src => {
      const img = new Image()
      img.src = src
      // decode() resolves when the bitmap is ready to PAINT, which is the whole
      // point — a load event only means the bytes arrived.
      if (typeof img.decode === 'function') {
        return img.decode().catch(() => new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() }))
      }
      return new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
    })).then(() => { if (!cancelled) setSpritesReady(true) })
    return () => { cancelled = true }
    // Depend on the PRIMITIVE sprite fields, never the `gear` object. It is
    // stable today because it arrives as a prop, but FishingGame has the scar
    // from the version of this that took an object rebuilt every render and
    // thrashed its ready flag into a render loop.
  }, [characterColor, boatId, hatId, gear.rodSlug, gear.rod, gear.reel, gear.hook, gear.petArt])

  // Only what the UI actually needs to re-render for.
  // A ref, not state: the loop is the only reader, and re-rendering the map on
  // a resize would buy nothing.
  /**
   * THE HELM, ON A KEYBOARD.
   *
   * WASD and the arrows, held down, steer exactly the way a held stick does —
   * the same rank in the physics, the same THROW, the same feel. A Set rather
   * than one key, so W+D is an honest diagonal and rolling from W to D through
   * both-held never stutters.
   *
   * Keys are ignored while something is focused that eats typing, which is
   * what stops "sail west" from firing while a captain types the letter A into
   * some future chat box.
   */

  const keysRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const DIRS: Record<string, string> = {
      w: 'w', arrowup: 'w', a: 'a', arrowleft: 'a',
      s: 's', arrowdown: 's', d: 'd', arrowright: 'd',
    }
    const typing = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
        || (el as HTMLElement).isContentEditable)
    }
    // SPACE AND E ARE THE ACTION BUTTON, with the button's own grammar:
    // press-and-release acts on the nearest thing, press-and-HOLD fills the
    // same ring the helm shows and brings the rod out when it matures. The
    // first cut fired everything on keydown, which made a space tap start
    // fishing instantly — a behaviour the button itself does not have.
    let keyAt: number | null = null
    let keyHold: ReturnType<typeof setInterval> | null = null
    const keyCancel = () => {
      if (keyHold) { clearInterval(keyHold); keyHold = null }
      keyAt = null
      setHelmHold(0)
      setHelmOn(false)
    }
    const down = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key.toLowerCase() === 'e') && !typing()
          && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // The rod is out: these keys belong to FishingHere while it is.
        if (fishingInRef.current) return
        e.preventDefault()
        // Auto-repeat is the OS holding the key FOR you; the ring is already
        // doing that.
        if (e.repeat || keyAt !== null) return
        keyAt = performance.now()
        setHelmOn(true)
        keyHold = setInterval(() => {
          if (keyAt === null) return
          const t = Math.min(1, (performance.now() - keyAt) / HELM_HOLD_MS)
          setHelmHold(t)
          if (t >= 1) {
            keyCancel()
            startFishingRef.current()
          }
        }, 40)
        return
      }
      const d = DIRS[e.key.toLowerCase()]
      if (!d || typing() || e.metaKey || e.ctrlKey || e.altKey) return
      // Arrows scroll the page by default, and a scrolling chart is a broken
      // chart. Letters do nothing by default and lose nothing here.
      e.preventDefault()
      keysRef.current.add(d)
      // RECORDED AT THE PRESS, not at the next frame. A tap shorter than one
      // frame is added and removed between two steps of the loop, so the loop
      // never sees it - and the release would then coast along the old
      // velocity, which is the very thing that made a quick nudge sail the
      // wrong way. Sixty times a second is not fast enough to catch a person
      // being brisk with the arrow keys.
      cmdDir.current = keysToDir(keysRef.current)
    }
    /**
     * LETTING GO HAS TO LET GO. The physics reads held keys every frame and
     * aims the target THROW (9,000px) ahead — and a target, unlike a key, has
     * no idea it was ever attached to one. Releasing the key emptied the set
     * and left the last far target standing, so one tap of W sailed the boat
     * the length of the chart. The helm's pointer-up already solves this with
     * a short run-out; a key-up is the same event with a different name.
     */
    const runOut = () => {
      target.current = runOutTarget(pos.current, vel.current, cmdDir.current, 0.5)
      cmdDir.current = null
    }
    const up = (e: KeyboardEvent) => {
      // Let go before the hold matured: a tap. The nearest thing, and if
      // nothing is in reach, nothing — the button's own honest answer.
      if (e.key === ' ' || e.key.toLowerCase() === 'e') {
        if (keyAt === null) return
        keyCancel()
        // The hold matured into fishing while the key was still down; its
        // release is part of the same gesture, not a new tap.
        if (fishingInRef.current) return
        helmActRef.current()
        return
      }
      const d = DIRS[e.key.toLowerCase()]
      if (!d) return
      keysRef.current.delete(d)
      if (keysRef.current.size === 0) runOut()
    }
    /**
     * A tab-away with a key held would leave the boat sailing forever: keyup
     * fires at the OS focus, not at this window. So a held key is released.
     *
     * BUT ONLY IF ONE WAS HELD. This used to run out unconditionally, and a
     * run-out is a small push: clicking on another window while the hull still
     * had way on it handed the boat a fresh half-hop and it set off by itself.
     * Nobody had touched the helm. Losing focus is not a course change, and
     * with no key down there is nothing here to let go of.
     */
    const clear = () => {
      const steering = keysRef.current.size > 0
      keysRef.current.clear()
      if (steering) runOut()
      keyCancel()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  const zoomRef = useRef(1)
  /** The window/wheel fit, callable from the frame loop while the push-in
   *  eases — it is the one place that composes all three zoom factors. */
  const fitRef = useRef<() => void>(() => {})
  /**
   * THE WHEEL ZOOMS THE CHART.
   *
   * A multiplier on top of the fitted zoom rather than a replacement for it:
   * `zoomFor` keeps deciding what a fresh window shows, resizing still refits,
   * and the wheel adjusts from wherever that lands. Kept between pulled-back
   * 0.55x and leaned-in 1.6x of the fit — far enough out to plan a leg, close
   * enough in to read a name plate, never so far either way that the sea stops
   * being steerable.
   *
   * The ref is read by the frame loop every frame anyway, so a wheel tick is
   * picked up on the next frame with no React involved.
   */
  const wheelZoom = useRef(1)
  /**
   * THE CINEMATIC PUSH-IN, as a third factor on the same zoom.
   *
   * Casting is a different activity at a different scale: sailing wants the
   * horizon, fishing wants the boat. Cutting between the two at the same zoom
   * makes the dial feel like a screen that opened over the sea rather than a
   * thing happening on it — you never travelled, the UI just arrived.
   *
   * A factor rather than a separate transform so it composes with the fitted
   * zoom and the wheel instead of fighting them: a captain who has pulled the
   * chart back still gets pushed in RELATIVE to where they were, and the frame
   * loop keeps reading one number.
   *
   * Eased here rather than by CSS because the world transform is written every
   * frame by the loop — a transition on it would be overwritten sixty times a
   * second and do nothing.
   */
  const fishZoom = useRef(1)
  const fishZoomTarget = useRef(1)
  useEffect(() => {
    const fit = () => {
      const z = zoomFor(wrapRef.current?.getBoundingClientRect().width ?? window.innerWidth)
      zoomRef.current = z * wheelZoom.current * fishZoom.current
    }
    fitRef.current = fit
    const onWheel = (e: WheelEvent) => {
      // Only plain wheel — pinch-zoom on trackpads arrives as ctrl+wheel and
      // should zoom too, but browser-page zoom (ctrl+wheel on a mouse) is a
      // user setting this must not eat. Taking both is the lesser evil: the
      // page has nothing of its own to scroll.
      e.preventDefault()
      wheelZoom.current = Math.max(0.55, Math.min(1.6,
        wheelZoom.current * Math.exp(-e.deltaY * 0.0012)))
      fit()
    }
    const el = wrapRef.current
    el?.addEventListener('wheel', onWheel, { passive: false })
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      el?.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [])

  /** The sea's phase, for the banner and for respawning traders when night
   *  falls. Polled slowly — the cycle is 24 minutes, so a check every few
   *  seconds is already far finer than anything on screen needs. */
  /**
   * THE FREEZE.
   *
   * While the dial is up, everything on this map stops: the world transform,
   * the painted wash, the boat's bob, the wake, the trader patrols, the clouds
   * and the four-a-second proximity tick. The rAF returns immediately.
   *
   * The dial is a reaction test with a needle running at up to 650 degrees a
   * second, and it is the only thing on screen the player is reading. Every
   * frame the map spends moving water behind it is a frame the needle might not
   * get, and a needle that skips is not a difficulty setting, it is a lie about
   * where it was when you tapped.
   *
   * Nothing is lost by stopping. You are anchored to fish — the boat is not
   * going anywhere, and the sea has no state that has to keep advancing.
   */
  const [dialUp, setDialUp] = useState(false)
  /**
   * THE HOTSPOTS, and whether the boat is in one.
   *
   * Re-derived on a slow timer rather than every frame: they only move on a
   * ten-minute boundary, and `hotspotsAt` walks every band each call. The
   * INSIDE test is cheap (three distance checks) so it rides the same 0.12s
   * proximity tick everything else on this screen uses.
   */
  /**
   * HOW MANY CREW ARE STANDING ON THE DOCK.
   *
   * Worked out from the maturity timestamps the page handed down, so no polling
   * and no server round-trip: a trawl that comes due while you are out in the
   * Abyss lights the island up by itself.
   *
   * The ticker is 5s because the only thing it can change is a count that moves
   * once an hour per crew — a second-accurate "ready" is a countdown, and this
   * is not one.
   */
  const [trawlsReady, setTrawlsReady] = useState(
    () => trawlsOut.filter(t => new Date(t.endsAt).getTime() <= Date.now()).length)
  useEffect(() => {
    const tick = () => {
      const n = trawlsOut.filter(t => new Date(t.endsAt).getTime() <= Date.now()).length
      setTrawlsReady(prev => (prev === n ? prev : n))
    }
    tick()
    const id = setInterval(tick, 5_000)
    return () => clearInterval(id)
  }, [trawlsOut])

  const [spots, setSpots] = useState<Hotspot[]>(() => hotspotsAt())
  const [inSpot, setInSpot] = useState<Hotspot | null>(null)
  /** Mirrored so the 60fps loop can read the live set without the effect below
   *  needing `spots` in its dependencies — see the stale-closure rule. */
  const spotsRef = useRef<Hotspot[]>(spots)
  spotsRef.current = spots
  useEffect(() => {
    const id = setInterval(() => setSpots(hotspotsAt()), 15_000)
    return () => clearInterval(id)
  }, [])
  const inSpotRef = useRef<Hotspot | null>(null)
  inSpotRef.current = inSpot

  /** The Mainland's landing chooser — tavern, market or tackle shop. */
  const [ashore, setAshore] = useState(false)

  /**
   * GO ASHORE AT AN ISLE.
   *
   * The server decides what is on it and whether this captain has already had
   * it; all this does is ask and show the answer. `landing` guards the double
   * tap for the LOOK of it — the real guard is the unique index behind
   * `goAshore`, which is why a second tap that gets through is harmless.
   */
  /**
   * FISH A BOTTLE OUT.
   *
   * Marked taken the moment the server answers, whatever it said: a bottle you
   * have read is not one you want bobbing beside you offering itself again, and
   * the ones that came up empty are exactly the ones you would keep re-tapping.
   */
  const take = useCallback(async (b: Bottle) => {
    if (landingRef.current) return
    landingRef.current = true
    setLanding(true)
    vibrate(14)
    try {
      try {
        await saveSeaPosition(pos.current.x, pos.current.y, [...fogPending.current])
        fogPending.current.clear()
      } catch { /* the claim answers for itself */ }
      const result = await openBottle(b.key)
      setTaken(prev => new Set(prev).add(b.key))
      if (result.ok && result.kind === 'bearing') {
        // The X goes on the minimap immediately. Waiting for a refetch to show
        // somebody where their treasure is would be a strange choice.
        setBearings(prev => {
          const next = new Set(prev)
          for (const d of DIG_SITES) if (d.name === result.name) next.add(d.id)
          return next
        })
      }
      setFind({ kind: 'bottle', result })
    } catch (e) {
      // NOT THE SAME MESSAGE THE SERVER USES. "The tide took it" is what
      // openBottle says when a key genuinely no longer resolves, which is a
      // normal thing that happens to a stale bottle. Reusing it here meant any
      // exception at all - a dropped request, a server fault - was reported as
      // that same ordinary outcome, so a real failure was indistinguishable
      // from the tide and impossible to tell apart from the deck. Reported as
      // exactly this: every bottle says the tide took it.
      console.error('[bottle] open failed', e)
      setFind({ kind: 'bottle', result: { ok: false, error: 'It slipped out of your hands. Try that one again.' } })
    } finally {
      landingRef.current = false
      setLanding(false)
    }
  }, [])

  /** DIG. Same shape: flush, claim, show. */
  const dig = useCallback(async (site: DigSite) => {
    if (landingRef.current) return
    landingRef.current = true
    setLanding(true)
    vibrate(18)
    try {
      try {
        await saveSeaPosition(pos.current.x, pos.current.y, [...fogPending.current])
        fogPending.current.clear()
      } catch { /* the claim answers for itself */ }
      const result = await digHere(site.id)
      if (result.ok) setDug(prev => new Set(prev).add(site.id))
      setFind({ kind: 'dig', result })
    } catch {
      setFind({ kind: 'dig', result: { ok: false, error: 'The spade turned nothing up. Try again.' } })
    } finally {
      landingRef.current = false
      setLanding(false)
    }
  }, [])

  const land = useCallback(async (isle: Isle) => {
    if (landingRef.current) return
    landingRef.current = true
    setLanding(true)
    vibrate(14)
    try {
      // TELL THE SERVER WHERE WE ACTUALLY ARE, FIRST.
      //
      // `goAshore` sanity-checks the landing against `profiles.sea_x/sea_y`,
      // and that row is only written every twenty seconds. At three hundred
      // pixels a second and up to five twenty five refitted, the stored
      // position can be most of a band away from the boat — so sailing
      // straight to a rock and landing on it was getting refused for not being
      // close enough, which is the opposite of what that check is for.
      //
      // Awaited, unlike every other flush on this screen. It has to be in
      // before the claim reads it.
      //
      // Its own try, so a flush that fails does not eat the landing. The claim
      // would then be judged against an older position and might be refused,
      // which is a worse outcome than a stale row but a better one than
      // swallowing a chest the captain actually sailed to.
      try {
        await saveSeaPosition(pos.current.x, pos.current.y, [...fogPending.current])
        fogPending.current.clear()
      } catch { /* fall through and let the claim answer for itself */ }
      const result = await goAshore(isle.id)
      if (result.ok) setFound(prev => new Set(prev).add(isle.id))
      setLanded({ isle, result })
    } catch {
      setLanded({ isle, result: { ok: false, error: 'The sea took that one. Try again.' } })
    } finally {
      landingRef.current = false
      setLanding(false)
    }
  }, [])
  /** Under the arch, being asked whether you mean it. The ref is what the 60fps
   *  loop reads and writes; the state is only so React can draw the prompt. */
  /** Which sea the boat is in: true north of the reef, on the expedition side.
   *  Only ever changed while inside the gate's mouth — see the crossing rule. */
  /**
   * WHICH SIDE OF THE REEF THE BOAT IS ON.
   *
   * State, not a route and not a prop. The arch is a gap you sail through on
   * the boat you are already on — the anchorage beyond it is the same water
   * with different things moored in it, and pretending otherwise made the
   * crossing a page load for a hundred metres of sailing.
   *
   * The ref is what the frame loop reads; the state is what the chrome reacts
   * to. Same value, two consumers with different appetites for re-rendering.
   */
  // Seeded from the save, not always false. Both northern states are restored
  // together with the position they belong to — see saveSeaPosition.
  const [inAnchorage, setInAnchorage] = useState(startSide !== 'fishing')
  const sideRef = useRef(startSide !== 'fishing')
  /** The raid dock's confirm. Opened when you come alongside — see the dock
   *  proximity block in the loop — and closed by answering it. */
  const [swapAsk, setSwapAsk] = useState(false)
  /**
   * THE PORTAL SHEET. Opened by sailing THROUGH the ring — that is the
   * activation gesture the portal exists for, so this is deliberately not the
   * docks' press-to-ask manners: the ring is the button, and crossing it is
   * the press. `portalIn` is the hysteresis so floating inside does not
   * reopen it the frame after it is dismissed.
   */
  const [portalOpen, setPortalOpen] = useState(false)
  const portalIn = useRef(false)
  /** The charge: the beat between being taken and being asked. While it runs
   *  the flourish plays and the helm is dead weight — the portal has her. */
  const [portalCharge, setPortalCharge] = useState(false)
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (chargeTimer.current) clearTimeout(chargeTimer.current) }, [])
  const [portalTier, setPortalTier] = useState(portal.tier)
  useEffect(() => { setPortalTier(portal.tier) }, [portal.tier])
  const [portalComponents, setPortalComponents] = useState(portal.components)
  useEffect(() => { setPortalComponents(portal.components) }, [portal.components])
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalErr, setPortalErr] = useState<string | null>(null)

  /**
   * THE MUSTER, live. Server props seed it; Crew the Deck refreshes it from
   * the action's own returned state, so filling the seats never means leaving
   * the water. Resynced when the server prop changes (a return from the Crew
   * Hall remounts the page with a fresh party) — the standard prop-to-state
   * pairing, or the first server render after an edit would win forever.
   */
  const [party, setParty] = useState(raidParty)
  useEffect(() => { setParty(raidParty) }, [raidParty])
  const [decking, setDecking] = useState(false)
  const crewDeck = useCallback(async () => {
    if (decking) return
    setDecking(true)
    vibrate(10)
    try {
      const res = await crewTheDeck()
      if (!('error' in res)) {
        setParty(res.state.roster
          .filter(c => c.raidSlot != null)
          .sort((a, b) => (a.raidSlot ?? 0) - (b.raidSlot ?? 0))
          .map(c => ({ name: c.name, art: c.filename })))
      }
    } catch { /* the muster keeps what it had */ }
    setDecking(false)
  }, [decking])

  /**
   * WHAT IS UNDER YOU, in the three numbers the frame loop needs.
   *
   * The loop draws a wake, a waterline and a heel, and every one of them was
   * written for the fishing boat. Past the sortie the thing on the water is
   * two to three times the size with its keel in a different place, so rather
   * than sprinkling `onSortie ?` through the hot path, the hull answers for
   * itself here and the loop just reads numbers.
   *
   * `scale` is a ratio of DRAWN WIDTHS, both measured. The fishing boat's
   * overlay is 55% of a 210px sprite; a warship is `seaBeam` of a 340px one.
   * So a Sloop pushes about half again the water the fishing boat does and a
   * Man-o-War close to three times, which is the ladder the art already draws.
   */
  const hull = useMemo(() => {
    if (!onShip) return {
      scale: 1, keelY: WATERLINE_Y, heel: HEEL_MAX, weight: 0,
      // The cutwater as OFFSETS from the sprite's centre, resolved once here so
      // the frame loop never does this arithmetic sixty times a second.
      bowX: (FISHING_BOW.x - 0.5) * SKIPPER_W,
      bowDown: (FISHING_BOW.y - 0.5) * SKIPPER_W,
      bowTilt: (FISHING_BOW_TILT * Math.PI) / 180,
    }
    const d = getShip(shipTier)
    const beam = d.seaBeam ?? 0.6
    const keel = d.seaKeel ?? 0.75
    return {
      scale: (WARSHIP_W * beam) / FISHING_HULL_W,
      // From the sprite's centre down to the keel. The sprite is drawn centred
      // on the boat node, so this is the distance from where the camera is
      // looking to where the water actually is.
      keelY: WARSHIP_W * (keel - 0.5),
      // ── A BIG HULL DOES NOT SNAP ───────────────────────────────────
      // The tilt reads as acceleration, and on the fishing boat 7 degrees is
      // a small craft answering the throttle. The same 7 on a ship of the line
      // is a toy being waggled: mass is exactly what a warship should look like
      // it has. Divided by the beam ratio, so the bigger she is the less she
      // moves, and the number stays one idea rather than a second table.
      heel: HEEL_MAX / ((WARSHIP_W * beam) / FISHING_HULL_W),
      // HOW HEAVY SHE READS, 0 at the Sloop and 1 at the Man-o-War. Not the
      // same thing as `scale`: the water at a standstill should not merely be
      // BIGGER on a bigger ship, it should be slower and darker, and this is
      // the number that says how far along that ladder a hull sits.
      weight: Math.min(1, Math.max(0, (beam - 0.53) / (0.97 - 0.53))),
      // seaBow and seaBowTilt are measured on the art AS DELIVERED; a hull
      // rendered mirrored (seaFlip) mirrors them here, in the one place the
      // conversion can live, so the bench keeps tuning raw images.
      bowX: (((d.seaFlip ? 1 - (d.seaBow?.x ?? 0.8) : d.seaBow?.x ?? 0.8)) - 0.5) * WARSHIP_W,
      bowDown: ((d.seaBow?.y ?? keel) - 0.5) * WARSHIP_W,
      bowTilt: (((d.seaBowTilt ?? 0) * (d.seaFlip ? -1 : 1)) * Math.PI) / 180,
    }
  }, [onShip, shipTier])
  // Mirrored into a ref for the frame loop, which must not read a prop.
  const hullRef = useRef(hull)
  hullRef.current = hull
  /**
   * WHERE THE BOAT IS, SAVED — NOW INCLUDING WHICH SEA.
   *
   * This used to refuse to write anything north of the reef, because a northern
   * coordinate restored with no idea which side it belonged to would put a
   * captain beyond a wall they can only cross at the gate.
   *
   * The refusal had a cost nobody paid until there was something up there worth
   * keeping: the anchorage and the sortie survived only as long as the
   * component did. Switching tabs and coming back reset both, so a captain who
   * had taken their Man-o-War out was silently put back in the fishing grounds
   * on the fishing boat.
   *
   * Saving the SIDE removes the reason for the refusal. Restore reads it back
   * and sets the wall, the rim and the hull together, so nothing disagrees.
   */
  /** The one derivation of which state the boat is in. The server save, the
   *  heartbeat snapshot and the unmount snapshot all read THIS, because two
   *  encodings of the same fact is how the position and the side ended up
   *  travelling by different routes and arriving disagreeing. */
  const sideNow = useCallback((): 'fishing' | 'anchorage' | 'moored' | 'open' =>
    sortieRef.current ? 'open'
      : shipRef.current ? 'moored'
        : sideRef.current ? 'anchorage' : 'fishing', [])

  const saveSeaPosition = useCallback(
    (x: number, y: number, fog: number[]) =>
      persistSeaPosition(x, y, fog, sideNow()),
    [sideNow])

  /** Step through: all stop at the far side, then the sheet. */
  const warpTo = useCallback((x: number, y: number) => {
    pos.current = { x, y }
    target.current = { x, y }
    vel.current = { x: 0, y: 0 }
    portalIn.current = false
    setPortalOpen(false)
    vibrate([16, 40, 24])
    void saveSeaPosition(x, y, [...fogPending.current])
    fogPending.current.clear()
  }, [saveSeaPosition])

  const buyTier = useCallback(async () => {
    if (portalBusy) return
    setPortalBusy(true)
    setPortalErr(null)
    try {
      const res = await buyPortalTier()
      if ('error' in res) setPortalErr(res.error)
      else {
        setPortalTier(res.tier)
        setPortalComponents(res.components)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
        vibrate([0, 30, 40, 60])
      }
    } catch { setPortalErr('That did not go through. Try again.') }
    setPortalBusy(false)
  }, [portalBusy])
  /**
   * TAKING THE SHIP OUT.
   *
   * The nudge is load-bearing. The confirm is raised while the boat is pinned
   * to the anchorage rim, so at the moment of accepting it is AT the radius the
   * return test compares against — leaving it there means the first frame after
   * the swap can read as "came home" and put the captain straight back on the
   * fishing boat. Pushed clear of the line, the crossing is unambiguous in both
   * directions.
   */
  /**
   * CHANGING SHIPS AT THE DOCK.
   *
   * All stop, both ways. You are tying up or casting off, and carrying way
   * through either would put a different hull somewhere the one you were in had
   * already got to.
   */
  const swapHull = useCallback((toShip: boolean) => {
    vel.current.x = 0; vel.current.y = 0
    target.current = { ...pos.current }
    shipRef.current = toShip
    setOnShip(toShip)
    setSwapAsk(false)
    vibrate([18, 40, 22])
  }, [])

  /**
   * THE FOG.
   *
   * Decoded ONCE into a ref, and mutated in place as the boat sails. A ref and
   * not state because the 0.12s tick writes to it constantly and re-rendering
   * the chart to record that a cell has been seen would undo the whole reason
   * that tick stopped calling setState.
   *
   * `fogVersion` is the render signal, bumped only when a cell ACTUALLY flips —
   * which is a handful of times per crossing, not eight times a second.
   */
  const fogRef = useRef<Uint8Array>(decodeFog(exploredRaw))
  const [fogVersion, setFogVersion] = useState(0)
  /** Cells uncovered since the last flush, sent with the next position save. */
  const fogPending = useRef<Set<number>>(new Set())
  const [mapOpen, setMapOpen] = useState(false)

  /** The renown panel, opened from the level bar's chip while the rod is out. */
  const [renownOpen, setRenownOpen] = useState(false)
  const [renownState, setRenownState] = useState(renown)
  // Straight off the state — `available` is computed server-side when it is
  // read and again on every commit, so recomputing it here would be a second
  // source of truth for a number the panel already owns.
  const renownPoints = renownState?.available ?? 0
  /** True when the rod is out but nothing is in flight, so a tap on the water
   *  can simply stow it. */
  const [canLeaveFishing, setCanLeaveFishing] = useState(false)
  const canLeaveRef = useRef(false)
  canLeaveRef.current = canLeaveFishing
  const dialUpRef = useRef(false)
  dialUpRef.current = dialUp

  const [phase, setPhase] = useState(() => seaClock().phase)
  /** Mirrored, because the rAF effect is built once with an empty dependency
   *  list — reading `phase` straight from the closure in there would read the
   *  value it had at mount and never change, so night would never respawn the
   *  sea. */
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  useEffect(() => {
    if (dialUp) return
    const id = setInterval(() => setPhase(seaClock().phase), 4000)
    return () => clearInterval(id)
  }, [dialUp])

  const [near, setNear] = useState<Place | null>(null)
  /** The helm's handlers are created once and cannot see this as state. */
  const nearRef = useRef<Place | null>(null)
  nearRef.current = near
  /** Who is on the water around us. Recomputed only when the boat crosses into
   *  a new cell, because the answer cannot change until it does. */
  const [traders, setTraders] = useState<Trader[]>([])
  const cellRef = useRef('')
  /** The one we have pulled alongside, and the one we are talking to. */
  const [nearTrader, setNearTrader] = useState<Trader | null>(null)
  /** The trawl panel, opened FROM the water. `variant="dock"` opens on mount
   *  and dismisses itself, which is exactly the shape wanted here — it is a
   *  sheet over the chart, not a page you sailed to. */
  const [trawlOpen, setTrawlOpen] = useState(false)

  // ── FINN ──────────────────────────────────────────────────────────────
  //
  // He is not part of the Salt Road and deliberately not built out of it: a
  // trader is somebody the water happened to put in your way, and he is the
  // story standing in one specific place waiting for you. See lib/seaFinn.ts.
  //
  // Everything about him — where he is, what he says next, whether he has a bet
  // — is server state, because all of it is progression. The client's copy is
  // for drawing him and nothing else.
  const [finn, setFinn] = useState<FinnSeaState | null>(null)
  const finnRef = useRef<FinnSeaState | null>(null)
  finnRef.current = finn
  const [nearFinn, setNearFinn] = useState(false)
  /** The conversation, while it is open. */
  /** The scene, and the lines the server last handed back for it. */
  const [finnOpen, setFinnOpen] = useState(false)
  const [finnLines, setFinnLines] = useState<{ lines: string[]; nonce: number } | null>(null)
  const [finnTalk, setFinnTalk] = useState<{
    lines: (string | FinnSceneLine)[]
    mode: 'offer' | 'result' | 'reveal'
    offer?: FinnOffer | null
    resultKind?: 'won' | 'lost'
    rewardText?: string
  } | null>(null)
  /** Stops a second tap on Hail while the first is still in flight. */
  const [finnBusy, setFinnBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void finnState().then(f => { if (alive) setFinn(f) })
    return () => { alive = false }
  }, [])

  /**
   * PULL ALONGSIDE AND TALK.
   *
   * The encounter index goes with the request and lands in the WHERE of the
   * server's update, so a double tap cannot spend two beats of the story on one
   * meeting — the second call matches no row and comes back null.
   *
   * HE NO LONGER VANISHES. This used to note that `setFinn` with the new
   * position is what made him disappear from the patch of water you were
   * standing in, because the server had already moved him. He is moored now
   * (see lib/seaFinn) and stays exactly where he is; what refreshes here is the
   * job he may have just set and how far along it is.
   */
  const hailFinn = useCallback(async () => {
    const cur = finnRef.current
    if (!cur || finnBusy) return
    setFinnBusy(true)
    try {
      const talk = await speakToFinn(cur.encounters)
      if (!talk) return
      setFinn(prev => (prev ? {
        ...prev,
        encounters: talk.encounters,
        seenBeats: talk.seenBeats,
        revealed: talk.revealed,
        at: talk.at,
      } : prev))
      setNearFinn(false)
      setFinnOpen(true)
      setFinnLines(v => ({
        lines: talk.lines.map(l => (typeof l === 'string' ? l : l.text)),
        nonce: (v?.nonce ?? 0) + 1,
      }))
      // The job he may have just set, and any progress on it.
      void finnState().then(f => { if (f) setFinn(f) })
    } finally {
      setFinnBusy(false)
    }
  }, [finnBusy])

  /**
   * HAND THE JOB BACK. Pays, records it, and he tells you the next piece of
   * the story on the spot, so this is the campaign's forward gear and the only
   * place a beat is handed out after the first meeting.
   */
  const handInFinnQuest = useCallback(async () => {
    if (finnBusy) return
    setFinnBusy(true)
    try {
      const res = await turnInFinnQuest()
      if (!res || 'error' in res) {
        if (res && 'error' in res) {
          setFinnLines(v => ({ lines: [res.error], nonce: (v?.nonce ?? 0) + 1 }))
        }
        return
      }
      setFinnLines(v => ({ lines: res.lines, nonce: (v?.nonce ?? 0) + 1 }))
      if (res.reward > 0) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: undefined }))
      }
      const f = await finnState()
      if (f) setFinn(f)
    } finally {
      setFinnBusy(false)
    }
  }, [finnBusy])

  /** Take the bet. The clock starts server-side, not here. */
  const takeFinnBet = useCallback(async () => {
    const bet = await acceptFinnChallenge()
    setFinnTalk(null)
    setBetProgress(0)
    if (bet) setFinn(prev => (prev ? { ...prev, challenge: bet } : prev))
  }, [])

  /** Walk away from it. Remembered, so he can needle you about it next time. */
  const passFinnBet = useCallback(async () => {
    setFinnTalk(null)
    await declineFinnChallenge()
  }, [])

  /**
   * HOW THE RUNNING BET IS GOING, for the chip and for knowing when to ask.
   *
   * Local and approximate ON PURPOSE. The server settles from its own counters
   * and this number never reaches it — it exists so the player can watch a bet
   * fill up, and so `settleFinnBet` is called at the moment it is worth calling
   * rather than on a poll.
   */
  const [betProgress, setBetProgress] = useState(0)

  /**
   * A REEL LANDED. Decide whether the bet is worth settling.
   *
   * A perfect-streak bet reads the server's streak directly, which is the same
   * value the settlement will read, so the two agree by construction. A speed
   * bet counts fish landed since it was taken.
   *
   * Nothing is claimed early: `claimFinnChallenge` consumes the bet whatever it
   * decides, so asking before the target is met would throw the bet away. The
   * only two moments worth asking are "the target is met" and "the clock ran
   * out", and both are below.
   */
  const onFinnReel = useCallback((r: { perfectStreak: number; caught: number }) => {
    const bet = finnRef.current?.challenge
    if (!bet) return
    if (bet.type === 'perfect_streak') {
      setBetProgress(r.perfectStreak)
      if (r.perfectStreak >= (bet.perfects ?? Infinity)) void settleFinnBet()
    } else {
      setBetProgress(prev => {
        const next = prev + r.caught
        if (next >= (bet.fish ?? Infinity)) void settleFinnBet()
        return next
      })
    }
  }, [])

  // THE CLOCK RUNNING OUT IS ALSO AN ANSWER. A speed bet nobody finishes would
  // otherwise sit on the profile forever, blocking every future offer, and the
  // player would never be told they had lost. Fires once, on the deadline.
  useEffect(() => {
    const bet = finn?.challenge
    if (!bet?.endsAt) return
    const ms = bet.endsAt - Date.now()
    if (ms <= 0) { void settleFinnBet(); return }
    const t = setTimeout(() => { void settleFinnBet() }, ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finn?.challenge?.endsAt])

  /**
   * SETTLE THE OUTSTANDING BET.
   *
   * Passes NOTHING. Whether it was won and what it pays are both worked out on
   * the server from counters the cast path maintains — see the note at the top
   * of finnActions.ts, and the doubloon faucet it replaced.
   */
  const settleFinnBet = useCallback(async () => {
    const res = await claimFinnChallenge()
    if (!res) return
    setBetProgress(0)
    setFinn(prev => (prev ? { ...prev, challenge: null, wins: res.wins, seenBeats: res.seenBeats } : prev))
    if (res.won) {
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    }
    setFinnTalk({
      lines: res.lines, mode: 'result',
      resultKind: res.won ? 'won' : 'lost',
      rewardText: res.rewardText,
    })
  }, [])

  // ── THE ISLES ─────────────────────────────────────────────────────────
  //
  // `found` starts from the server's list and is added to locally the moment a
  // landing succeeds, so the chest on the rock behind you is open before the
  // page has any reason to refetch.
  //
  // No ref shadow: nothing in the 60fps loop reads it. Whether an isle is
  // already claimed changes what the BUTTON says and which chest is painted,
  // both of which are render-time questions, and `isleNear` does not care.
  const [found, setFound] = useState<Set<string>>(() => new Set(discovered))
  const [nearIsle, setNearIsle] = useState<Isle | null>(null)
  // ── WHAT THE SEA IS HANDING YOU ───────────────────────────────────────
  //
  // Bottles are derived, not fetched: the same cell hash the server runs, so
  // the set on screen is the set it will believe. Recomputed only when the boat
  // crosses a bottle cell or the window rolls — the same trick the traders use,
  // and for the same reason, which is that this must not run at 60fps.
  const [bottles, setBottles] = useState<Bottle[]>(
    () => bottlesAround(startAt.x, startAt.y, 5200))
  const bottleCell = useRef('')
  /** One DOM node per bottle, nudged by the loop. Never re-rendered to drift. */
  const bottleRefs = useRef<Map<string, HTMLElement>>(new Map())
  const bottlesRef = useRef<Bottle[]>(bottles)
  bottlesRef.current = bottles
  const [nearBottle, setNearBottle] = useState<Bottle | null>(null)
  /** Bottles fished out this session. They do not come back before the tide. */
  const [taken, setTaken] = useState<Set<string>>(() => new Set())
  /** The proximity check runs inside a closure built at mount, so it cannot
   *  read the state directly — it would see the empty set forever and keep
   *  offering a bottle that is not there any more. */
  const takenRef = useRef(taken)
  takenRef.current = taken

  // ── WHAT IS BURIED ────────────────────────────────────────────────────
  const [bearings, setBearings] = useState<Set<string>>(() => new Set(digs.bearings))
  const [dug, setDug] = useState<Set<string>>(() => new Set(digs.dug))
  /** Standing over one. */
  const [nearDig, setNearDig] = useState<DigSite | null>(null)
  /** Close enough that the water should look wrong. */
  const [hintDig, setHintDig] = useState<DigSite | null>(null)

  /** Whatever the last find turned up: a fragment, a bearing, or a haul. */
  const [find, setFind] = useState<
    { kind: 'bottle'; result: BottleResult } | { kind: 'dig'; result: DigResult } | null>(null)

  // ── WHO ELSE IS OUT HERE ──────────────────────────────────────────────
  //
  // Polled, not pushed. Every boat already writes its position every twenty
  // seconds for its own sake, so this is one query on a timer rather than a
  // socket — and twenty seconds of sailing is about a screen, which is close
  // enough to steer by and closes every time either of you flushes.
  const [friends, setFriends] = useState<FriendAtSea[]>([])
  /** One node per friend, moved by the frame loop. React is told when somebody
   *  arrives or leaves, never that they moved. */
  const friendRefs = useRef<Map<string, HTMLElement>>(new Map())
  /**
   * WHERE EACH FRIEND'S BOAT IS BEING DRAWN, versus where they said they were.
   *
   * A poll cannot be drawn raw. Even at the close cadence a boat moves six or
   * seven hundred pixels between reports, and snapping to each one is a sprite
   * that teleports. `shown` chases `target` every frame instead, so what you
   * see is a boat under way rather than a boat blinking along a track.
   */
  const friendAt = useRef<Map<string, {
    shown: Vec; target: Vec; face: number; bob: number
    /** When this boat was last heard from over the wire, 0 for never. Guards
     *  the stale poll from stomping a live position. */
    live: number
  }>>(new Map())
  /** True while a friend is close enough to be worth drawing well. Drives the
   *  flush and the poll — see NEAR_ENOUGH. */
  const closeRef = useRef(false)
  /**
   * WHO WAS OUT HERE LAST TIME WE ASKED.
   *
   * The poll only ever says who IS at sea, so arriving and leaving have to be
   * worked out by comparing. Starts as null rather than empty, which is the
   * difference between "nobody was out" and "we have not looked yet" — without
   * it, opening the chart announces every friend already sailing as if they had
   * just cast off in front of you.
   */
  const seenCrew = useRef<Set<string> | null>(null)
  /** Names that have just come or gone, for the line that says so. */
  const [crewNews, setCrewNews] = useState<{ name: string; joined: boolean } | null>(null)

  // ── WHOSE HOMESTEAD THE ISLAND IS SHOWING ─────────────────────────────
  //
  // The island sits at one place on the chart and every captain's is at those
  // same coordinates, so visiting cannot be a matter of sailing somewhere else.
  // You sail to the island and choose whose it is; the buildings, the name and
  // the door all follow.
  const [guests, setGuests] = useState<Visitable[]>([])
  const [visiting, setVisiting] = useState<{ username: string; homestead: Homestead } | null>(null)
  const [picking, setPicking] = useState(false)

  /**
   * HOW BIG THE CORNER READOUTS ARE.
   *
   * 26px was picked on a phone, where it is a comfortable thumb target and a
   * fair share of a 390px-wide screen. On a 1400px monitor the same disc is a
   * speck in the corner — the sea's light and the way to the chart, both barely
   * legible, on the surface with the most room of anything in the game.
   *
   * Scaled off the WRAPPER rather than a media query so it tracks the space the
   * chart actually has, which is what the zoom does too (see zoomFor).
   */
  const [hudSize, setHudSize] = useState(26)
  useEffect(() => {
    const fit = () => {
      const w = wrapRef.current?.getBoundingClientRect().width ?? window.innerWidth
      setHudSize(w >= 1100 ? 40 : w >= 760 ? 34 : 26)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  /**
   * WHERE EACH DISC SITS.
   *
   * Positions used to be hard-coded indices, which was fine while every button
   * was always there and wrong the moment one was conditional: trawls only
   * appear when a crew is actually out, so with none out its slot stayed empty
   * and every button after it hung a disc-width away from the row with a hole
   * where nothing was. Reported as blank icon space.
   *
   * The row is derived instead. Each button asks for its slot BY NAME, the
   * order is fixed here, and anything not currently on screen is skipped, so
   * the run closes up on its own however the conditions fall.
   */
  /** Left offset for a named button, or off-row if it is not showing. */
  const hudAt = (id: string) => {
    const i = hudRow.indexOf(id)
    return 12 + (i < 0 ? hudRow.length : i) * (hudSize + 10)
  }
  /** The who-is-out list, open or shut. */
  const [crewOpen, setCrewOpen] = useState(false)
  /** The Salt Road: Finn's progress and everyone else worth knowing about. */
  const [folkOpen, setFolkOpen] = useState(false)
  /** Does Finn have a piece of his story waiting? Drives the dot on the
   *  button, which is the whole nudge: a beat is handed over at EVERY meeting
   *  (findNextEncounterBeat walks the unseen list, it is not milestone-gated),
   *  so this is amber right up until he has run out of things to say. */
  const finnWaiting = useMemo(
    // A finished job outranks an unheard beat: one is "there is more story out
    // there", the other is "he is holding your pay". Both light the same dot,
    // and the dot is the only nudge either of them gets.
    () => !!finn && (finn.questReady || findNextEncounterBeat(finn.seenBeats) !== null),
    [finn])

  /**
   * THE DAY'S ORDERS, READABLE FROM THE WATER.
   *
   * A challenge you cannot see is one you meet by accident. These have always
   * been ticking from every cast — progress is written server-side inside
   * reelIn — but the only place to READ them was an island, so most of a day's
   * fishing happened without knowing what the day was asking for.
   *
   * Read here, claimed at the Tally House. The split is deliberate: a reward
   * you can take from anywhere makes the island a formality, and the sail is
   * what the payout is for.
   *
   * Fetched once on arrival rather than polled. Progress only moves when YOU
   * catch something, and the panel re-reads when the rod is stowed.
   */
  const [orders, setOrders] = useState<DailyChallengeState | null>(null)
  const [ordersOpen, setOrdersOpen] = useState(false)
  /** The trawls readout. Never claims anything; the fleet does that. */
  const [trawlsPeek, setTrawlsPeek] = useState(false)
  const readOrders = useCallback(() => {
    void getDailyChallenge().then(setOrders).catch(() => { /* the icon just stays quiet */ })
  }, [])
  useEffect(() => { readOrders() }, [readOrders])

  /** Still out. Distinct from ready: one is a clock, the other is a haul. */
  const trawlsWorking = trawlsOut.length - trawlsReady

  /** Something finished and not yet collected — the dot on the icon. */
  const ordersReady = !!orders && orders.challenges.some(
    (c, i) => (orders.progress[i] ?? 0) >= c.target && orders.claimed[i] !== true)
  /**
   * CAPTAINS WAITING ON YOUR ANSWER, for the badge on the crew button.
   *
   * Without it a pact request is invisible until the addressee happens to open
   * the panel — which for most captains is never, so the asker sits unanswered
   * for days and reads the silence as the feature being broken. Fetched once on
   * load and again whenever the panel closes, not polled: a request arriving
   * mid-session is caught the next time the chart is opened, which is the same
   * cadence every other social surface in the game runs at.
   */
  const [pendingAsk, setPendingAsk] = useState(0)
  useEffect(() => { void pendingPacts().then(setPendingAsk, () => {}) }, [])
  /** The poll, callable on demand — see the crew panel's onChanged. */
  const pullNow = useRef<() => void>(() => {})

  /** Pressed up against the edge of the surveyed chart. Ref for the loop, state
   *  for the one line it puts on screen. */
  const [atEdge, setAtEdge] = useState(false)
  /** Which scenery is currently nearer the camera than the hull. Indices into
   *  OCCLUDERS; see the note there for why this is a second layer rather than
   *  a z-index. */
  const [occluding, setOccluding] = useState<number[]>([])
  const edgeRef = useRef(false)
  /** The isle whose landing panel is open, and what it gave up. `landed`, not
   *  `ashore` — that name is already the Mainland's three-card chooser. */
  const [landed, setLanded] = useState<{ isle: Isle; result: AshoreResult } | null>(null)
  const [landing, setLanding] = useState(false)
  /** Mirrors `landing` for the callback, which is built once. */
  const landingRef = useRef(false)
  const [hailing, setHailing] = useState<Trader | null>(null)

  /**
   * ESC CLOSES THE TOP-MOST PANEL, one per press, most recent first.
   *
   * The order is the stacking order a captain actually sees: results and
   * conversations over pickers, pickers over the chart. One panel per press,
   * because Esc-mashing through three layers to the water is a feature, and
   * closing all of them on one press is losing your place.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (find) { setFind(null); return }
      if (ashore) { setAshore(false); return }
      if (trawlOpen) { setTrawlOpen(false); return }
      if (ordersOpen) { setOrdersOpen(false); return }
      if (trawlsPeek) { setTrawlsPeek(false); return }
      if (finnOpen) { setFinnOpen(false); setFinnLines(null); return }
      if (finnTalk) { setFinnTalk(null); return }
      if (hailing) { setHailing(null); return }
      if (picking) { setPicking(false); return }
      if (crewOpen) { setCrewOpen(false); return }
      if (folkOpen) { setFolkOpen(false); return }
      if (mapOpen) { setMapOpen(false); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [find, ashore, trawlOpen, ordersOpen, trawlsPeek, finnTalk, finnOpen, hailing, picking, crewOpen, folkOpen, mapOpen])
  /** Keys dealt with today, so a trader you have already traded with stops
   *  offering. Seeded from the server on mount and appended to on a deal. */
  const [dealt, setDealt] = useState<string[]>(dealtToday)
  const day = useMemo(() => seaDay(), [])

  /** THE RESIDENT BUYERS. Not hashed and not daily — they live here. Built into
   *  the same shape a wandering trader has so everything downstream (the hail
   *  mark, the name plate, the panel) works on them without a second path. */
  const residents = useMemo<Trader[]>(() => RESIDENTS.map(r => {
    // A stable, deterministic look, so a zone's buyer is the same person every
    // time you sail out to them.
    const seed = r.zoneId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    return {
      key: `resident:${r.zoneId}`,
      kind: 'resident' as const,
      name: r.name,
      x: r.x, y: r.y,
      line: r.line,
      // A moored buyer swings on his anchor rather than patrolling: he is
      // waiting for trade, not looking for it.
      driftR: 34, driftRate: (Math.PI * 2) / 74, driftPhase: (seed % 100) / 16,
      look: {
        characterColor: ['default', 'gray', 'blue', 'pink'][seed % 4],
        boatId: ['oak', 'mahogany', 'taupe', 'desert', 'charcoal'][seed % 5],
        hatId: ['brown', 'olive', 'midnight', 'offwhite'][seed % 4],
        rodSlug: plainRodFor(seed),
        hook: plainHookFor(seed),
      },
      deal: 'resident' as const, zoneId: r.zoneId, rate: r.rate,
      // NO folkId. These are traders and nothing else. The people you can get
      // to know are a separate cast standing in the same water, and a hail
      // that offered a sale AND a friendship is what made the two read as one.
    }
  }), [])

  /**
   * THE THREE WHO KEEP NO SHOP.
   *
   * Built exactly like the buyers and standing in the water the same way, so
   * they draw, drift, submerge and hail through machinery that already exists.
   * The only difference is that there is no business to do: their offer is a
   * talk, and the panel finds the rapport by folkId like it does for everyone
   * else.
   */
  const socials = useMemo<Trader[]>(() => SOCIALS.map(r => {
    const seed = r.folkId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11)
    return {
      key: `folk:${r.folkId}`,
      kind: 'talker' as const,
      folkId: r.folkId as FolkId,
      name: r.name,
      x: r.x, y: r.y,
      line: r.line,
      driftR: 30, driftRate: (Math.PI * 2) / 88, driftPhase: (seed % 100) / 15,
      look: {
        characterColor: ['blue', 'pink', 'gray', 'default'][seed % 4],
        boatId: ['taupe', 'oak', 'desert', 'mahogany', 'charcoal'][seed % 5],
        hatId: ['olive', 'offwhite', 'brown', 'midnight'][seed % 4],
        // WHAT THEY SELL IS WHAT THEY ARE HOLDING. Two of these nine carry a
        // rod no shop stocks, and drawing them with a rod rolled out of the
        // plain pool made the one thing that marks them out invisible on the
        // water. Everybody else keeps the pool.
        rodSlug: folkRodSlug(r.folkId) ?? plainRodFor(seed),
        hook: plainHookFor(seed),
      },
      deal: 'talk' as const, topic: 'chat' as const,
      mood: 'One of the regulars', lines: [r.line],
    }
  }), [])
  // Mirrored for the loop, which must not be re-created every time the list
  // changes or the whole sail restarts.
  const tradersRef = useRef<Trader[]>([])
  /** One node per trader on screen, moved imperatively so a drifting boat costs
   *  a transform rather than a re-render. */
  const hullRefs = useRef(new Map<string, HTMLDivElement>())
  /** The wake node of each trader, found once rather than every frame. */
  const wakeCache = useRef(new Map<string, HTMLElement>())
  /** The inner composite of each trader, found once rather than every frame. */
  const hullCache = useRef(new Map<string, HTMLElement>())
  useEffect(() => { tradersRef.current = traders }, [traders])
  /** Wanderers AND residents, for proximity and for the patrol writes. */
  const allTradersRef = useRef<Trader[]>([])
  /** YOON. Written down rather than rolled, permanent, and the only person on
   *  this sea who sells the rod with his name on it. See chart.ts. */
  /**
   * ONE CALLBACK PER TRADER, CACHED BY KEY.
   *
   * This was an inline arrow, so every render handed each TraderBoat a brand
   * new function — which is a changed prop, which means `memo` never once
   * matched and all forty-odd boats reconciled on every render of this
   * component. A memo that always misses is worse than no memo: it pays for the
   * comparison and re-renders anyway.
   *
   * Cached by key, and keys are stable for as long as a trader exists.
   */
  const hullCbs = useRef(new Map<string, (el: HTMLDivElement | null) => void>())
  const hullRefFor = useCallback((key: string) => {
    const hit = hullCbs.current.get(key)
    if (hit) return hit
    const cb = (el: HTMLDivElement | null) => {
      if (el) { hullRefs.current.set(key, el); return }
      // Unmounted: drop every cache keyed on this trader, or a trader who
      // sails out of the cell leaves three entries behind forever.
      hullRefs.current.delete(key)
      hullCache.current.delete(key)
      wakeCache.current.delete(key)
      hullCbs.current.delete(key)
    }
    hullCbs.current.set(key, cb)
    return cb
  }, [])

  const yoon = useMemo(() => yoonTrader(), [])
  useEffect(() => { allTradersRef.current = [yoon, ...residents, ...socials, ...traders] }, [yoon, residents, socials, traders])
  /** The water we have the rod out in. Null means sailing. */
  const [fishingIn, setFishingIn] = useState<Place | null>(null)
  /** For the keyboard handler, which binds once: while the rod is out, the
   *  chart's space/E stand down and FishingHere's own handler works the rod. */
  const fishingInRef = useRef<Place | null>(null)
  fishingInRef.current = fishingIn
  const [baitLeft, setBaitLeft] = useState(baitQty)
  /** WHICH BAIT IS ON THE HOOK. Fixed for the whole session before, at whatever
   *  the page happened to pick; the bait row can change it now. */
  const [activeBait, setActiveBait] = useState(bait)
  /** WHICH ROD IS IN HAND, out of the rack. Purely a sea-side choice — it does
   *  not change what is equipped ashore, because the rack is what you brought
   *  and swapping between them is the whole point of having brought them. */
  const [activeRod, setActiveRod] = useState(rack[0]?.tier ?? 0)
  const rodNow = useMemo(
    () => rack.find(r => r.tier === activeRod) ?? rack[0] ?? null,
    [rack, activeRod],
  )
  /** WHAT IS IN THE HOLD, live. Seeded from the server on load and then kept in
   *  step here: it climbs as you catch and empties the moment you sell to a
   *  buyer. Read once and never updated, it would sit at its load-time value
   *  while you filled the boat — and the hold is the one number that decides
   *  when a session has to end. */
  const [holdCount, setHoldCount] = useState(hold.count)
  /** Which pose the captain is in. The game already draws three — rod up,
   *  line in the water, mid-cast — so the map uses the same ones rather than
   *  inventing a fourth. `wait` during the bite wait is most of the missing
   *  feedback: the line is visibly IN the water. */
  const [frame, setFrame] = useState<'rest' | 'wait' | 'cast'>('rest')
  // Mirrored so the rAF loop can read it without being re-created every time it
  // changes, which would restart the sweep.
  const fishingRef = useRef<Place | null>(null)
  useEffect(() => { fishingRef.current = fishingIn }, [fishingIn])

  // IN WHEN THE ROD COMES OUT, back when it goes away. 1.42x — enough that the
  // boat is clearly the subject and the water around it has moved, not so much
  // that the islands you were sailing past leave the frame entirely. The
  // captain should still know where they are.
  useEffect(() => { fishZoomTarget.current = fishingIn ? 1.42 : 1 }, [fishingIn])

  const locked = useCallback((p: Place) => level < p.minLevel, [level])

  /**
   * WOULD A HOLD HERE ACTUALLY PUT THE ROD IN?
   *
   * Plain derived data, not state: it is a function of `near` and the level,
   * both of which this render already has, and holding it in state would mean
   * an effect and a frame where the ring disagrees with the water the boat is
   * in. The ring reads it so the indicator never promises something the
   * release will not deliver — hold over a port or a band you have not levelled
   * into and nothing fills.
   */
  const helmFishable = !!near && near.kind === 'water' && !locked(near)

  /**
   * WHAT THE HELM WILL DO, IN WORDS.
   *
   * Six full-width pills used to live along the bottom of the chart, one per
   * kind of thing you could be next to, each its own button. The helm does all
   * of that on a tap now, so the buttons are gone and this is what is left of
   * them: one line above the wheel naming the action the thumb already has.
   *
   * DERIVED FROM THE SAME ORDER helmActRef RESOLVES IN, and that is the whole
   * discipline here — the label and the gesture read one list, so the words can
   * never describe an action other than the one about to happen.
   *
   * `hold` is the second line, and only where a hold would do something: it is
   * how anybody discovers the gesture at all.
   */
  /**
   * PUT THE ROD IN, from wherever the order came.
   *
   * Three things ask for this now — the touch hold, the desktop button, and the
   * keyboard — and the all-stop matters to every one of them: casting under way
   * sails you out of the water you just chose, and the dial comes up several
   * hundred pixels from where you asked for it.
   */
  const startFishing = useCallback(() => {
    const here = nearRef.current
    if (!here || here.kind !== 'water' || locked(here)) return false
    target.current = { ...pos.current }
    vibrate([0, 30, 40, 30])
    setFishingIn(here)
    return true
  }, [locked])
  startFishingRef.current = startFishing

  /**
   * IS THERE A MOUSE? The helm is `display: none` on a fine pointer — it is a
   * thumb control and a mouse has the whole window — so on desktop the label
   * below has to BE the button rather than describe one. Capability, not width:
   * a small laptop window still has a mouse and a big tablet still has a thumb.
   */
  /**
   * IS THERE ROOM FOR THE HUD BESIDE THE FISHING BAR?
   *
   * The fishing screen puts a centred 448px XP bar across the top, and the HUD
   * discs run from x=12 to roughly x=200. Under about 900px of viewport those
   * two want the same pixels, which is why three of the discs were hidden
   * whenever a rod was out. Above it there is room for both and no reason to
   * take anything away.
   *
   * A WIDTH question, not an input one: a fine pointer on a narrow window does
   * not create space.
   */
  const [wide, setWide] = useState(false)

  const hudRow = useMemo(() => {
    const on: string[] = ['clock']
    if (!fishingIn || wide) on.push('chart')
    if (!inAnchorage && orders && orders.challenges.length > 0 && (!fishingIn || wide)) on.push('orders')
    if (!inAnchorage && (trawlsOut.length > 0 || trawlsReady > 0) && (!fishingIn || wide)) on.push('trawls')
    if (!inAnchorage && (!fishingIn || wide)) on.push('folk')
    return on
  }, [fishingIn, wide, inAnchorage, orders, trawlsOut.length, trawlsReady])
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 900px)')
    if (!mq) return
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  const [finePointer, setFinePointer] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: fine)')
    if (!mq) return
    const sync = () => setFinePointer(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  const helmLabel: { act: string | null; hold: string | null } = (() => {
    if (fishingIn) return { act: null, hold: null }
    if (nearFinn && !finnOpen) {
      return { act: finn?.questReady ? `${FINN_NAME} is waiting on you` : `Hail ${FINN_NAME}`, hold: null }
    }
    if (nearTrader && !hailing) {
      return { act: dealt.includes(nearTrader.key) ? `Speak to ${nearTrader.name}` : `Hail ${nearTrader.name}`, hold: null }
    }
    if (nearDig && !dug.has(nearDig.id)) return { act: 'Dig here', hold: null }
    if (nearBottle) return { act: 'Take the bottle', hold: null }
    if (nearIsle) {
      return { act: found.has(nearIsle.id) ? `Look again at ${nearIsle.name}` : `Go ashore at ${nearIsle.name}`, hold: null }
    }
    // THE BERTHS. The raid dock also asks on arrival, so this is the way back
    // to a question you waved off rather than the only way to reach it — a
    // modal that can only be opened by leaving and returning is a trap.
    if (atDock === 'raid') {
      return { act: onShip ? 'Tie up and take the fishing boat' : 'Board your ship', hold: null }
    }
    if (atDock === 'voyage') return { act: 'Open the voyage board', hold: null }
    if (near && near.kind === 'port') {
      // ITS OWN VERB. Every other port is somewhere you go ashore; this one is
      // a thing you DO from the deck, and "Go ashore at The Trawl Harbour"
      // would promise a page that does not exist.
      if (near.id === 'trawl_fleet') return { act: trawlOpen ? null : 'Send a trawl out', hold: null }
      return { act: locked(near) ? null : `Go ashore at ${near.name}`, hold: null }
    }
    // Open water. Nothing to tap, so the only thing worth saying is the hold —
    // and if the band is above your level, why it will not work.
    if (near && near.kind === 'water') {
      return locked(near)
        ? { act: null, hold: `Fishing ${near.minLevel} to work this water` }
        : { act: null, hold: `Hold to fish ${near.name}` }
    }
    return { act: null, hold: null }
  })()

  /**
   * THE TAP YOU FEEL when something comes into reach.
   *
   * The pill appearing is the eye's cue; this is the thumb's. Only on the
   * transition from nothing to something — the pill CHANGING (bottle to isle
   * as you drift along a shore) stays silent, or a sail past a busy coast
   * becomes a pocket full of buzzing.
   */
  const hadAct = useRef(false)
  useEffect(() => {
    if (!!helmLabel.act && !hadAct.current) vibrate(8)
    hadAct.current = !!helmLabel.act
  }, [helmLabel.act])

  /** Screen point to world point, through the current camera translation. */
  const toWorld = useCallback((clientX: number, clientY: number): Vec | null => {
    const wrap = wrapRef.current
    if (!wrap) return null
    const r = wrap.getBoundingClientRect()
    const z = zoomRef.current
    return {
      x: (clientX - r.left - r.width / 2) / z + pos.current.x,
      // Undo the plane's squash. Without this every tap in the top or bottom of
      // the screen courses to somewhere nearer than where the thumb landed, and
      // the further from centre the worse it gets.
      y: (clientY - r.top - r.height / 2) / (GROUND * z) + pos.current.y,
    }
  }, [])

  toWorldRef.current = toWorld

  /**
   * THE MAINLAND IS THREE PLACES, NOT ONE.
   *
   * Every other port on the chart goes exactly one place, so going ashore is
   * the whole decision. The Mainland holds the tavern, the market and the
   * tackle shop, and sending you to `/tavern` and leaving you to find the other
   * two through the nav is not going ashore, it is being dropped at a door.
   *
   * So it lands on a chooser, the same shape the Gauntlets card uses: three
   * art-forward cards on the backdrop, pick where you are actually going.
   */
  /**
   * WRITE THE POSITION BACK, rarely.
   *
   * Two triggers, because neither is sufficient alone. `visibilitychange` and
   * `pagehide` catch the deliberate exits — tapping the nav, going ashore,
   * closing the tab — and are the ones that matter for the sail home. But a
   * hard reload, a crash or a killed mobile tab fire neither reliably, so a
   * slow heartbeat backstops them.
   *
   * Twenty seconds, and only when the boat has actually moved a meaningful
   * distance since the last write. At full speed that is a worst case of one
   * screen's worth of sailing lost to a crash, and an idle boat writes nothing
   * at all rather than pushing an identical row every twenty seconds forever.
   */
  useEffect(() => {
    let last = { ...pos.current }
    /**
     * `leaving` is the tab going away, which is the one time a hidden page MUST
     * still write: it is the last chance to bank the fog and remember where the
     * boat was. The heartbeat below skips hidden tabs; this does not.
     */
    const flush = (leaving = false) => {
      const p = pos.current
      const fog = [...fogPending.current]
      // THE TAB REMEMBERS TOO, and unconditionally. See `rememberPos`.
      rememberPos(p, sideNow())

      // ── IT IS A HEARTBEAT, NOT JUST A POSITION ────────────────────
      //
      // This used to skip the write unless the boat had moved 60px, on the
      // reasoning that pushing an identical row every twenty seconds forever is
      // waste. True of the position and false of the whole row: the same write
      // sets `sea_seen_at`, and everyone else's chart drops you two minutes
      // after that stops moving.
      //
      // So a captain who parked went invisible. Which is precisely what two
      // people do when they finally find each other — pull alongside and stop —
      // and it is asymmetric the moment one of them is still sailing, so it
      // reads as "he can see me and I cannot see him" rather than as a timeout.
      // Reported exactly that way.
      //
      // A hidden tab still says nothing. Not looking at the sea is a fair
      // definition of not being on it, and it is what stops a forgotten tab
      // sitting on somebody's chart all night.
      if (!leaving && document.visibilityState === 'hidden') return
      last = { ...p }
      fogPending.current.clear()
      void saveSeaPosition(p.x, p.y, fog)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true) }
    // ── FASTER WHEN SOMEBODY IS WATCHING ──────────────────────────────
    //
    // Twenty seconds is the right heartbeat for a boat nobody can see: it is
    // only there so a crash does not lose your position. It is useless for a
    // boat somebody is sailing alongside, because a friend would jump most of a
    // screen between reports.
    //
    // So the rate follows proximity. Alone, nothing changes. With a friend in
    // sight both clients independently step up to two seconds, which is short
    // enough to ease between and costs writes only in the one case where they
    // buy something.
    // ── ONE RATE. ─────────────────────────────────────────────────────
    // This used to step up to NEAR_MS whenever a friend was close, so their
    // client's poll had something fresh to read. Realtime carries the close-up
    // now, and it goes captain-to-captain without touching the database at all
    // — so the write is back to being what it always should have been: a
    // twenty-second heartbeat so a crash does not lose your position, plus the
    // fog you have uncovered. Sailing alongside somebody costs the database
    // nothing extra now, where it used to cost ten times the writes.
    // WRAPPED, not passed bare. setInterval hands its callback an argument in
    // some runtimes, and `flush` now takes `leaving` first — a stray truthy
    // value there would make every heartbeat behave like a page-close and write
    // from hidden tabs, which is the exact thing the guard exists to stop.
    const id = setInterval(() => flush(), FAR_MS)
    document.addEventListener('visibilitychange', onHide)
    const onGone = () => flush(true)
    window.addEventListener('pagehide', onGone)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onGone)
      // The unmount IS a navigation — going ashore, or the nav bar. This is the
      // one that closes the cheese, so it ignores the moved-far-enough test.
      //
      // The sessionStorage write is the one that actually matters here. The
      // server write is fire-and-forget and the trip back can beat it home;
      // this one is synchronous and cannot lose the race.
      rememberPos(pos.current, sideNow())
      void saveSeaPosition(pos.current.x, pos.current.y, [...fogPending.current])
      fogPending.current.clear()
    }
  }, [])

  /**
   * WHERE THE BOAT REALLY WAS, restored before the first frame.
   *
   * The `start` prop is the SERVER's idea of where you are, and it can be stale
   * in two ways that both showed up as "closing the Trawl Docks shoots you back
   * somewhere else entirely":
   *
   *   1. The save on unmount is fire-and-forget. Coming back from a page you
   *      were on for two seconds can easily beat that write home.
   *   2. Coming back through `router.back()` can be served from the router
   *      cache, in which case `start` is not merely stale — it is whatever the
   *      server said when this tab FIRST loaded /sea, which is usually the
   *      Mainland. That is why it teleported rather than drifting, and why it
   *      only happened sometimes: it depended on whether the cache was still
   *      warm.
   *
   * sessionStorage is written synchronously on the way out and is per tab, so
   * it cannot lose that race and cannot disagree with another device. It is
   * preferred over `start` whenever it is fresh.
   *
   * In a LAYOUT effect and first in the file, so it lands before the backdrop
   * paints and before the loop reads a position — otherwise the first frame is
   * drawn at the old spot and you see the jump you came here to prevent.
   */
  useLayoutEffect(() => {
    const p = recallPos()
    if (!p) return
    // ONTO THE SNAPSHOT'S OWN SIDE. The old line clamped y to the wall
    // unconditionally — written when nothing lived north of it — so every
    // return from the anchorage restored a captain ONTO the reef line, and
    // the face clamps then shoved them to whichever side the (racy) server
    // side said. That is both halves of "my location was not saved" and
    // "it glitches out half the time".
    const north = p.side !== 'fishing'
    pos.current = {
      x: p.x,
      y: north ? Math.min(NORTH_WALL - REEF_MARGIN, p.y) : Math.max(NORTH_WALL + REEF_MARGIN, p.y),
    }
    target.current = { ...pos.current }
    vel.current = { x: 0, y: 0 }
    // The refs and the chrome, seeded together with the position they belong
    // to. A position restored without its state is the bug this effect had.
    sideRef.current = north
    setInAnchorage(north)
    const ship = p.side === 'moored' || p.side === 'open'
    shipRef.current = ship
    setOnShip(ship)
    const out = p.side === 'open'
    sortieRef.current = out
    setOnSortie(out)
  }, [])

  /**
   * WHO IS SAILING, every twenty seconds.
   *
   * Matched to the flush cadence on purpose: asking faster cannot return
   * anything newer, because nobody's position is written more often than that.
   * Paused when the tab is hidden — a chart nobody is looking at does not need
   * to know where anyone is, and this runs for as long as the page is open.
   */
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const pull = () => {
      pullNow.current = pull
      if (document.visibilityState !== 'hidden') {
        void friendsAtSea().then(f => {
          if (!alive) return
          setFriends(f)

          // ── ARRIVALS ──────────────────────────────────────────────
          // One name at a time, and only ever the newest. Three friends
          // logging on together should not be three lines stacking up over
          // the water while you are trying to steer.
          const now = new Set(f.map(x => x.username))
          const before = seenCrew.current
          if (before) {
            const came = [...now].find(n => !before.has(n))
            const went = came ? null : [...before].find(n => !now.has(n))
            if (came) setCrewNews({ name: came, joined: true })
            else if (went) setCrewNews({ name: went, joined: false })
          }
          seenCrew.current = now
          // Whether you are sailing together is NOT decided here any more. It
          // is recomputed twice a second against the freshest position held for
          // each friend — see the broadcast interval. Deciding it off this
          // payload meant deciding it off rows up to twenty seconds old.
        }, () => {})
      }
      // ALWAYS THE SLOW RATE NOW. This used to drop to NEAR_MS whenever a friend
      // was close, because the poll was the only way to find out where they
      // were. Realtime carries that now, so asking faster would buy nothing and
      // cost a server action every two seconds.
      timer = setTimeout(pull, FAR_MS)
    }
    pull()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  /**
   * NEW ARRIVALS AND DEPARTURES.
   *
   * The eased positions live in a ref the loop owns, so this is the one place
   * React and the loop meet: somebody who has just appeared starts drawn where
   * they actually are rather than easing in from the last person's spot, and
   * somebody who has gone is dropped so their entry cannot leak.
   */
  /**
   * A BEAT OFF THE WIRE. Written straight into the easing targets the frame
   * loop already reads, so a live position and a polled one are the same kind
   * of fact and nothing downstream can tell them apart.
   */
  const onBeat = useCallback((id: string, b: { x: number; y: number; f: number }) => {
    const name = crewNames.current.get(id)
    if (!name) return
    const at = friendAt.current.get(name)
    if (!at) return
    at.target.x = b.x
    at.target.y = b.y
    at.live = Date.now()
    // FACING COMES OVER THE WIRE rather than being inferred here. The loop
    // guesses it from the easing delta, which is fine at a 20s poll where every
    // step is hundreds of pixels, and wrong at close quarters where the steps
    // are small enough that a boat sitting still flickers.
    at.face = b.f
  }, [])

  /**
   * OPENED ONLY WHEN THERE IS SOMEBODY TO HEAR.
   *
   * The socket used to go up on mount for everybody who opened the chart. That
   * is the wrong axis to be wasteful on: messages are billed by fan-out and
   * cost nothing when nobody is near, but PEAK CONNECTIONS are billed per
   * websocket and do not care whether anything ever travels over it. A captain
   * with no mutual crew online would have held one all session and used it for
   * precisely nothing — and on the live table only 10 of 81 players have a
   * mutual follow at all, so most sockets were that captain.
   *
   * So the connection follows the poll: it comes up when a mutual is out there
   * and comes down when the last one goes in. `presence.send` is a no-op while
   * it is down, so nothing else on this screen has to know.
   */
  useEffect(() => () => { presence.current?.close(); presence.current = null }, [])

  useEffect(() => {
    const live = new Set(friends.map(f => f.username))
    for (const name of [...friendAt.current.keys()]) {
      if (!live.has(name)) { friendAt.current.delete(name); friendRefs.current.delete(name) }
    }
    // WHO TO LISTEN TO. Everyone online, not just whoever is close: subscribing
    // is silent until somebody actually broadcasts, and having the channel
    // already open is what makes meeting up instant rather than a poll away.
    crewNames.current = new Map(friends.map(f => [f.id, f.username]))
    if (friends.length === 0) {
      // Nobody to hear and nobody to hear you. Drop the socket.
      presence.current?.close()
      presence.current = null
    } else {
      if (!presence.current) presence.current = openSeaPresence({ userId, onBeat })
      presence.current.setCrew(friends.map(f => f.id))
    }

    for (const f of friends) {
      const had = friendAt.current.get(f.username)
      // THE POLL DOES NOT OVERWRITE A LIVE BOAT. Its position is up to twenty
      // seconds old; a beat is half a second old. Letting the poll land on top
      // would drag a friend you are sailing beside back to where they were
      // twenty seconds ago, twice a minute, which reads as rubber-banding.
      if (had) {
        const fresher = had.live && Date.now() - had.live < 4_000
        if (!fresher) { had.target.x = f.x; had.target.y = f.y }
      }
      else friendAt.current.set(f.username, {
        shown: { x: f.x, y: f.y }, target: { x: f.x, y: f.y }, face: 1, live: 0,
        // A PHASE OFF THEIR NAME, so two friends riding the same swell are not
        // pumping in lockstep — which reads as one animation on two sprites
        // rather than two boats on water. Derived from the name so it is stable
        // across a remount: a boat that changed its rhythm every poll would
        // stutter.
        bob: [...f.username].reduce((a, c) => a + c.charCodeAt(0), 0) % 628 / 100,
      })
    }
  }, [friends, userId, onBeat])

  /**
   * THE LIVE WATER.
   *
   * Opened once for the life of the chart and closed on the way out. Everything
   * it receives goes straight into `friendAt` — the same easing targets the
   * frame loop already reads — so a beat off the wire and a position off the
   * poll are the same kind of fact and nothing downstream can tell them apart.
   *
   * React is never told a friend moved. It is told when one ARRIVES, which is
   * the poll's job, and that is the only thing worth a render.
   */
  const presence = useRef<SeaPresence | null>(null)
  /** uuid -> username. Beats are addressed by id (the channel is the identity —
   *  see seaPresence) and everything on this screen is keyed by name. */
  const crewNames = useRef<Map<string, string>>(new Map())


  /**
   * REPORT YOURSELF, but only while somebody can see you.
   *
   * `closeRef` is the whole cost control: no friend within NEAR_ENOUGH means
   * nobody is subscribed to you in any useful sense, and a beat sent into an
   * empty room still bills a message. Hidden tabs say nothing either — the boat
   * is not moving and nobody is watching this one.
   *
   * `send` gates on distance moved as well, so two captains moored side by side
   * fishing cost nothing at all.
   */
  useEffect(() => {
    const id = setInterval(() => {
      // ── ARE WE TOGETHER? ──────────────────────────────────────────
      //
      // Worked out HERE, and only here, against the freshest position held for
      // each friend — which is a beat if one is arriving and the poll's row
      // otherwise. The first cut asked the poll's payload directly and that was
      // wrong: those rows are up to twenty seconds old, which is thousands of
      // pixels at cruising speed, so it could rule you "not near" somebody
      // sitting on your screen and switch broadcasting off while you sailed
      // beside them.
      //
      // Recomputed every beat, so it is never more stale than the boats are.
      //
      // It also makes the rendezvous symmetric for free. Only one of the two
      // has to notice first: the moment they broadcast, their target moves in
      // your map, this sees it, and you start broadcasting back. Neither side
      // waits on its own poll.
      let near = false
      const me = pos.current
      for (const at of friendAt.current.values()) {
        if (Math.hypot(at.target.x - me.x, at.target.y - me.y) < NEAR_ENOUGH) { near = true; break }
      }
      closeRef.current = near

      if (!near) return
      // A tab nobody is looking at is a boat nobody is steering.
      if (document.visibilityState === 'hidden') return
      presence.current?.send({
        x: Math.round(me.x), y: Math.round(me.y), f: facing.current,
      })
    }, BEAT_MS)
    return () => clearInterval(id)
  }, [])

  /** Who you could call on. Read once; the guard is re-checked server-side on
   *  the visit itself, so a stale list cannot open a door. */
  useEffect(() => {
    void visitableHomesteads().then(setGuests, () => {})
  }, [])

  /**
   * BUILD ALL FIVE SURFACE TILES ONCE, off the critical path.
   *
   * `surfaceTile` is lazy and is called from the frame loop, so the first time
   * you cross into a band the loop would stop to rasterise a few hundred
   * canvas gradients. That is a hitch at exactly the moment you are looking at
   * the water change, which is the worst possible time for one.
   *
   * Done after mount instead, when nothing is waiting on it. Five small
   * canvases, built once for the life of the tab.
   */
  useEffect(() => {
    const id = setTimeout(() => { for (const v of SURFACES) surfaceTile(v) }, 400)
    return () => clearTimeout(id)
  }, [])

  // Paint the backdrop once before the browser's first frame. The loop takes
  // over from here; this only exists so the very first paint is the right
  // colour rather than the wrap's bare base.
  useLayoutEffect(() => {
    const sky = skyRef.current
    if (sky) sky.style.background = seaAt(pos.current, seaClock().darkness).css
  }, [])

  /**
   * WHAT A TAP ON THE HELM DOES, and it is deliberately the same order the
   * action pill uses — the pill is the label for this, so if the two disagreed
   * the button would be lying about what the thumb is about to do.
   *
   * Returns false when there is nothing in reach, which is what lets a tap in
   * open water fall through to "start fishing" instead of doing nothing at all.
   */
  const helmActRef = useRef<() => boolean>(() => false)

  const enter = useCallback((p: Place) => {
    vibrate([18, 40, 24])
    if (p.id === 'mainland') { setAshore(true); return }
    // NOT A PAGE. The trawl panel opens over the water you are floating on,
    // because the crews you are sending are going into it.
    if (p.id === 'trawl_fleet') { setTrawlOpen(true); return }
    // WHOSE DOOR. The Homestead is one island showing one of several
    // homesteads, so the route has to carry whose you are standing on.
    if (p.id === 'home' && visiting) {
      try { sessionStorage.setItem('sea:came-from-chart', '1') } catch { /* private mode */ }
      router.push(`/home?visiting=${encodeURIComponent(visiting.username)}`)
      return
    }
    // A BREADCRUMB, so the place we send them to can come BACK rather than
    // pushing a second /sea on top of this one. A pushed return remounts the
    // whole chart from cold — re-reading the boat's position, rebuilding every
    // island — which is a visible reload of a screen nobody actually left.
    try { sessionStorage.setItem('sea:came-from-chart', '1') } catch { /* private mode */ }
    router.push(p.href)
  }, [router, visiting])

  const onTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (swallowTap.current) return
    // THE SAME GUARD onDown HAS. It was on the pointer path and not this one,
    // so anything marked `data-no-steer` still put the helm over on the click
    // that followed — the level bar being the one you actually notice, because
    // it looks tappable and at max level genuinely is. A control is a control
    // on every path that can reach it.
    if ((e.target as HTMLElement).closest?.('button, [data-no-steer]')) return
    // AND THE CLICK PATH TOO. onDown returns early with the rod out, but this
    // fires from the same press and would set the course onDown just refused
    // to — the level bar taught us once already that a guard on one path is
    // not a guard.
    if (fishingRef.current) return
    const pt = 'touches' in e
      ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
    const w = toWorld(pt.x, pt.y)
    if (!w) return

    // A TAP IS A HELM ORDER. It goes exactly where your thumb went, and the
    // only thing that overrides that is land.
    //
    // It used to course to a WATER'S CENTRE whenever the tap landed inside one,
    // which was defensible when the zones were small discs you were trying to
    // get into. Now that they are enormous overlapping regions you sail around
    // INSIDE, almost every tap on screen lands in one — so every tap dragged
    // you back toward the middle of the zone regardless of where you pressed,
    // and the boat felt stuck. Navigating TO a place is what the compass and
    // the prompt are for; the sea itself is steering.
    const here = near
    if (here && !locked(here) && here.kind === 'port' && dist(w, here) < here.r) {
      // Tapping the port you are already moored at is the second half of the
      // trip: it takes you ashore.
      enter(here)
      return
    }

    // Land is the exception, because you cannot sail onto it. Tapping a port
    // courses for its edge so you pull alongside rather than into it.
    for (const p of PLACES) {
      if (p.kind === 'port' && dist(w, p) < p.r) {
        const dx = pos.current.x - p.x
        const dy = pos.current.y - p.y
        const m = Math.hypot(dx, dy) || 1
        target.current = { x: p.x + (dx / m) * p.r * 0.92, y: p.y + (dy / m) * p.r * 0.92 }
        return
      }
    }

    // Tapping a trader courses to THEM. They are a person you are pulling
    // alongside, and a heading would sail you straight past.
    for (const t of tradersRef.current) {
      if (Math.hypot(w.x - t.x, w.y - t.y) < HAIL_RANGE * 1.6) {
        target.current = clearOfLand({ x: t.x, y: t.y })
        return
      }
    }

    // ALL STOP. Tapping your own boat drops anchor, which is the only way to
    // stop once a tap is a heading rather than a destination.
    if (Math.hypot(w.x - pos.current.x, w.y - pos.current.y) < STOP_RADIUS) {
      target.current = { ...pos.current }
      return
    }

    target.current = hopToward(pos.current, w)
  }, [toWorld, near, locked, enter])

  const onDown = useCallback((e: React.PointerEvent) => {
    // Anything with a button in it is a control, not the sea. Cast, Reel In,
    // the prompt and the trader panel all live inside this element.
    if ((e.target as HTMLElement).closest('button, [data-no-steer]')) return
    // ── WITH THE ROD OUT, THE WATER IS NOT A HELM ────────────────────────
    //
    // Sailing away stows the rod: the fishing overlay is pointer-events none,
    // so a tap on the water around the result card never reaches it and is
    // handled here instead, on the first touch, which covers the move box as
    // well as open water.
    //
    // BUT IT RETURNS NOW, and that is the fix. It used to fall through into the
    // steering setup below, so the same press both stowed the rod AND set a
    // course — and worse, mid-cast, when canLeave is false and the rod does NOT
    // come in, the fall-through still ran: tapping anywhere while the line was
    // in the water sailed the boat away from the fish it was playing.
    //
    // One press, one meaning. While fishing it either stows or does nothing,
    // and never steers.
    if (fishingRef.current) {
      if (canLeaveRef.current) {
        setFishingIn(null)
        setFrame('rest')
      }
      return
    }
    dragFrom.current = { x: e.clientX, y: e.clientY }
    holdAt.current = { x: e.clientX, y: e.clientY }
    dragging.current = false
    holding.current = false
    // A press that simply STAYS becomes a heading. Without this, holding still
    // in a direction does nothing at all — only dragging would steer, which is
    // an odd thing to have to discover.
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => { holding.current = true; vibrate(8) }, HOLD_MS)
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* fine */ }
  }, [])

  const onMove = useCallback((e: React.PointerEvent) => {
    const from = dragFrom.current
    if (!from) return
    holdAt.current = { x: e.clientX, y: e.clientY }
    // Travelling far enough is a hold too, without waiting out the timer — a
    // deliberate drag should steer the moment it is recognisable as one.
    if (!holding.current && Math.hypot(e.clientX - from.x, e.clientY - from.y) >= DRAG_SLOP) {
      holding.current = true
      dragging.current = true
      vibrate(8)
    }
  }, [])

  const onUp = useCallback((e: React.PointerEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    if (holding.current) {
      // LET GO AND IT RUNS OUT. Cutting the course to the current position
      // would stop the hull dead the instant your thumb left the glass, which
      // reads as the boat hitting something. A short run-on along the bearing
      // lets it ease off the way a hull actually does.
      target.current = runOutTarget(pos.current, vel.current, cmdDir.current, 0.55)
      cmdDir.current = null
      // The browser fires a click after the gesture; it must not also be read
      // as a tap and re-aim what you have just finished steering.
      swallowTap.current = true
      setTimeout(() => { swallowTap.current = false }, 60)
    }
    dragFrom.current = null
    holdAt.current = null
    dragging.current = false
    holding.current = false
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* fine */ }
  }, [])

  // ── THE ONE LOOP ─────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let sinceState = 0
    // Last painted backdrop, so an unchanged one costs a string compare rather
    // than a repaint of the whole screen.
    let lastCss = ''
    /** Where the backdrop was last computed, and at what darkness. The deadband
     *  is measured against these, never against a rounded position. */
    const lookAt = { x: Infinity, y: Infinity }
    let lastDark = -1
    /** Tracked apart from `lastDark` because the backdrop also repaints when
     *  the boat has sailed far enough, and the grade has no reason to. */
    let lastGrade = -1
    /** How bright this water is, held between recomputes. The pale surface
     *  layer's opacity reads it every frame — that write is a composite, not a
     *  repaint, so it is free and does not want the deadband's coarseness. */
    let lum = seaAt(HOME).lum

    const step = (now: number) => {
      if (dialUpRef.current) {
        // Keep the clock honest so nothing lurches when it resumes: the delta
        // is measured from now, not from whenever the dial went up.
        last = now
        raf = requestAnimationFrame(step)
        return
      }
      // Clamped delta: a backgrounded tab returns with an enormous gap, and an
      // unclamped one would teleport the boat across the chart.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // THE STICK OUTRANKS EVERYTHING. While it is held the boat runs its
      // bearing directly rather than chasing a target point, so the course is
      // whatever direction the thumb is pushing and nothing else.
      // A HELD BOX BEARING OUTRANKS EVERYTHING, and is re-read every frame so
      // sliding your thumb around inside the box turns the boat under it.
      if (boxHeld.current) {
        const v = boxVec(boxHeld.current)
        if (v) {
          cmdDir.current = { x: v.x, y: v.y / GROUND }
          target.current = {
            x: pos.current.x + v.x * THROW,
            y: pos.current.y + (v.y / GROUND) * THROW,
          }
        }
      }

      // THE KEYBOARD RANKS WITH THE STICK. Held keys are a bearing, re-read
      // every frame like the thumb is, and composed so W+D is a true diagonal.
      // The y component is divided by GROUND for the same reason boxVec's is:
      // the key means "down the SCREEN", and the plane is squashed, so a screen
      // direction costs more world-y than world-x.
      if (keysRef.current.size > 0) {
        const kd = keysToDir(keysRef.current)
        if (kd) {
          cmdDir.current = kd
          target.current = {
            x: pos.current.x + kd.x * THROW,
            y: pos.current.y + kd.y * THROW,
          }
        }
      }

      // HELD BEARING. Re-aimed every frame from the thumb's SCREEN position,
      // because the finger is still but the sea is moving under it — a bearing
      // stored once as a world point would slowly stop pointing where the thumb
      // is pointing.
      if (holding.current && holdAt.current && toWorldRef.current) {
        const w = toWorldRef.current(holdAt.current.x, holdAt.current.y)
        if (w) {
          const t = headingFrom(pos.current, w)
          cmdDir.current = { x: t.x - pos.current.x, y: t.y - pos.current.y }
          target.current = t
        }
      }

      // ── THE PUSH-IN EASES ─────────────────────────────────────────
      // Exponential toward the target, frame-rate independent like every other
      // ease here. Stops writing once it is close enough to stop mattering, so
      // a chart nobody is casting on does no zoom work at all.
      if (Math.abs(fishZoom.current - fishZoomTarget.current) > 0.0015) {
        fishZoom.current += (fishZoomTarget.current - fishZoom.current) * (1 - Math.exp(-4.5 * dt))
        fitRef.current()
      } else if (fishZoom.current !== fishZoomTarget.current) {
        fishZoom.current = fishZoomTarget.current
        fitRef.current()
      }

      const dx = target.current.x - pos.current.x
      const dy = target.current.y - pos.current.y
      const d = Math.hypot(dx, dy)

      let want = 0
      if (d > ARRIVE) {
        const t = Math.min(1, (d - ARRIVE) / (SLOW - ARRIVE))
        want = SPEED * hullSpeed * speedRef.current * (t * t * (3 - 2 * t))
      }
      // A HALF-PUSHED STICK IS HALF SPEED. Without this the stick is a
      // direction-only control and every nudge is full sail, which makes
      // pulling alongside a trader or easing along a coast impossible.
      // HOW FAR OUT YOU PUSH IS HOW FAST YOU GO. Without it every touch is full
      // sail and easing alongside a trader is impossible.
      if (boxHeld.current) {
        const v = boxVec(boxHeld.current)
        if (v) want *= v.mag
      }
      const wx = d > 0.001 ? (dx / d) * want : 0
      const wy = d > 0.001 ? (dy / d) * want : 0
      // EXPONENTIAL, not linear. `min(1, ACCEL * dt)` makes the boat accelerate
      // at a rate that depends on the frame rate: a phone dropping to 30fps
      // reaches speed differently to one holding 60, so the same course feels
      // different on different hardware and any hitch shows up as a lurch.
      // 1 - e^(-k·dt) is the same curve sampled correctly, so the boat moves
      // identically at any frame rate and a dropped frame is invisible rather
      // than a shove.
      // THE BOAT'S OWN HANDLING. `trim` splits one budget between top speed and
      // this, so a nimble hull answers the helm faster and a long-haul one
      // takes its time — see lib/boats. Read from a ref rather than closed
      // over, because changing boats mid-session must not need a remount.
      // ── FORWARD AND SIDEWAYS ARE DIFFERENT THINGS ────────────────────
      //
      // One lerp of the whole velocity vector used to do both jobs, which is
      // why acceleration and handling were the same number and why nothing
      // could slide. Now:
      //
      //   1. the bow turns toward where you asked, at a rate the rudder sets
      //   2. forward speed chases the target speed, at a rate the rig sets
      //   3. whatever sideways velocity is left over bleeds off at GRIP
      //
      // Everything downstream still reads `vel`, so the shoreline pushback and
      // the north wall need no changes at all — they act on a velocity vector
      // and this still produces one.
      const want2 = Math.hypot(wx, wy)
      if (want2 > 0.001) {
        // 1. TURN. Shortest way round, capped at the rudder's rate — this is
        //    the whole of "handling". Atan2 difference wrapped to [-pi, pi] so
        //    a boat pointing north-west and asked for north-east turns 90
        //    degrees the short way rather than 270 the long way.
        const target = Math.atan2(wy, wx)
        let diff = target - headRef.current
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2

        // ── SHE PIVOTS WHEN SHE IS NOT MOVING ────────────────────────
        //
        // The rudder's rate is what it costs to turn a hull that is ALREADY
        // travelling: you are pushing water sideways to do it. A boat sitting
        // still has none of that to fight and comes round on the oars in a
        // fraction of the time.
        //
        // Without this, asking for west from a standstill while pointed east
        // meant one and a third seconds of turning, and the whole time the
        // helm was pointing the wrong way. Measured before the fix: 73px of
        // travel EAST, which is what "it sails the opposite way first" was.
        const speedNow = Math.hypot(vel.current.x, vel.current.y)
        const stopped = 1 - Math.min(1, speedNow / (SPEED * 0.35))
        const maxTurn = TURN * handlingRef.current * (1 + stopped * 2.5) * dt
        headRef.current += Math.max(-maxTurn, Math.min(maxTurn, diff))
      }
      const hx = Math.cos(headRef.current)
      const hy = Math.sin(headRef.current)

      // Decompose the CURRENT velocity about the NEW heading.
      let fwd = vel.current.x * hx + vel.current.y * hy
      let lat = -vel.current.x * hy + vel.current.y * hx

      // 2. Forward speed chases the order — but only as far as the bow is
      //    actually pointing at it.
      //
      // ── WHY THE ORDER IS SCALED BY ALIGNMENT ─────────────────────────
      //
      // Thrust goes along the HEADING, and the heading takes time to come
      // round. So a boat asked to reverse used to apply full power down its
      // old bearing for the whole of the turn: you pushed the stick west and
      // she gathered way east first, which is not a boat answering slowly, it
      // is a boat doing the opposite of what it was told.
      //
      // `align` is cos²(diff/2): 1 when the bow is on the order, 0.5 across
      // the beam, and exactly 0 when the order is dead astern. A normal turn
      // keeps most of its way on, and a reversal makes no way at all until she
      // has come round — which is the same thing a real hull does, and happens
      // to be the thing that feels right.
      //
      // GUARDED ON want2. Letting go of the stick makes it exactly 0, and
      // dividing by it gives NaN — which would go straight into the velocity
      // and stay there, so releasing the helm once would break the boat for the
      // rest of the session. The value is irrelevant when there is no order,
      // because the target speed is zero either way.
      const align = want2 > 0.001
        ? Math.max(0, 0.5 + 0.5 * ((hx * wx + hy * wy) / want2))
        : 1
      const kf = 1 - Math.exp(-ACCEL * accelRef.current * dt)
      fwd += (want2 * align - fwd) * kf

      // 3. THE SLIDE. Sideways speed decays toward nothing; how fast is GRIP.
      //    This is the only line that makes drifting possible, and turning it
      //    off is setting GRIP high rather than deleting anything.
      lat *= Math.exp(-GRIP * dt)

      vel.current.x = hx * fwd - hy * lat
      vel.current.y = hy * fwd + hx * lat
      pos.current.x += vel.current.x * dt
      pos.current.y += vel.current.y * dt

      // AND YOU CANNOT SAIL PAST THE HARBOUR. Everything north of it belongs
      // to expeditions, and this screen has nothing up there to find. Handled
      // exactly like a shoreline — position clamped, northward velocity killed,
      // eastings untouched — so running into it slides you along the line
      // rather than stopping you dead against an invisible pane of glass.
      // ── THE REEF, AND THE ONE HOLE IN IT ───────────────────────────
      //
      // It used to be a wall with a confirm behind it: sail into the arch, get
      // asked, and be taken to a page. There is water on the other side now, so
      // the arch is just an arch — you sail through it and keep going.
      //
      // The rule is the same from both sides, which is what makes it a reef
      // rather than a door: you may cross the line only inside the gate.
      // `sideRef` remembers which sea you were last definitely in, and is only
      // updated while you are in the mouth — so a boat that drifts against the
      // rock anywhere else is put back on the side it came from.
      const wasNorth = sideRef.current
      // ── WHICH SIDE, WITH HYSTERESIS ────────────────────────────────
      //
      // A bare `y < NORTH_WALL` is a knife edge, and there are two things on
      // this chart that will sit a hull on it. The clamp below used to place
      // one there itself. And the reef's rocks are solid now and they STRADDLE
      // the wall, so their push — which runs after this test, later in the same
      // frame — can shove a boat back across a line it was just held at.
      //
      // Either way the result was a boat whose side and whose position
      // disagreed, and a clamp that re-asserted the disagreement every frame
      // while zeroing vel.y, so it could never build the way to escape. One
      // captain was found saved in exactly that state.
      //
      // A Schmitt trigger costs nothing and cannot be got into: you keep the
      // side you had until you are properly across, so no push of a few dozen
      // pixels can flip you, and being ON the line is no longer a state that
      // means anything.
      const isNorth = wasNorth
        ? pos.current.y < NORTH_WALL + REEF_MARGIN
        : pos.current.y < NORTH_WALL - REEF_MARGIN
      // A WARSHIP DOES NOT GO DOWN THROUGH THE REEF. The fishing grounds are
      // for the fishing boat; the whole point of leaving her at the dock is
      // that you took something else out. Held at the line with a word, the
      // same way the sortie holds the fishing boat.
      if (shipRef.current && inGate(pos.current.x) && isNorth !== wasNorth && !isNorth) {
        pos.current.y = NORTH_WALL - REEF_MARGIN
        vel.current.y = 0
        if (now - refusedAt.current > 2600) {
          refusedAt.current = now
          setRefused('Your ship stays north of the reef. Take the fishing boat down.')
          vibrate(12)
        }
      } else if (inGate(pos.current.x)) {
        // THROUGH THE ARCH AND STRAIGHT ON. No page, no loading, no swap:
        // the anchorage on the far side is a short sail on the same boat, and
        // the only thing that changes is what is moored around you and what the
        // corner of the screen is for.
        if (isNorth !== wasNorth) {
          vibrate([14, 30, 18])
          setInAnchorage(isNorth)
        }
        sideRef.current = isNorth
      } else if (!inGate(pos.current.x)) {
        // ── HELD AT THE BAND'S FACE, NOT ON ITS CENTRELINE ─────────────
        //
        // Outside the gate the reef is solid ground, so the barrier belongs at
        // the edge of the paint rather than down the middle of it. Stopping at
        // NORTH_WALL put a hull among the boulders, which is what made it look
        // like you could sail onto them — and once the boulders briefly had
        // collision of their own, the two barriers fought over the same water
        // and shook the boat apart between them.
        //
        // One barrier, at the face. Nothing can reach the rock, so the rock
        // does not need to push back.
        const face = wasNorth ? NORTH_WALL - REEF_FACE : NORTH_WALL + REEF_FACE
        if (wasNorth ? pos.current.y > face : pos.current.y < face) {
          pos.current.y = face
          if (wasNorth ? vel.current.y > 0 : vel.current.y < 0) vel.current.y = 0
        }
      }
      // NOTHING FOLLOWS. The two arms above are `inGate` and `!inGate`, which
      // between them cover every position there is — an arm after them would be
      // unreachable, and an unreachable arm that looks like a rule is worse than
      // no rule. The old "put it back on the line" clamp lived here.

      // ── THE EDGE, WHICHEVER SEA YOU ARE IN ─────────────────────────
      //
      // Two semicircles sharing a reef. Each is a radius from its own centre,
      // and the reef itself is the flat side of both — already handled above,
      // so all this has to do is stop you sailing off the round part.
      const home = sideRef.current ? EXP_ORIGIN : { x: 0, y: 0 }
      // THE ANCHORAGE RIM MOVES OUT once you are on the sortie. Same centre,
      // bigger radius, so "am I past the edge" stays one subtraction and the
      // raid water is simply more of the same disc rather than a third
      // coordinate system bolted to the side of two.
      // THE HARBOUR WALL IS THE SAME SHAPE OF PROBLEM as the reef, and takes
      // the same answer: stop at the band's inner face, except in the one gap.
      // Inside the sortie's mouth the rim is the real rim, so the ship can
      // reach it and cross, and the fishing boat can reach it and be told no.
      const rim = sideRef.current
        ? (sortieRef.current ? RAID_EDGE
          : inSortie(pos.current.x, pos.current.y) ? EXP_EDGE : EXP_EDGE - REEF_FACE)
        : OUTER_EDGE

      // ── THE EDGE OF THE CHART ──────────────────────────────────────
      //
      // There was no boundary here at all. The north wall was the only clamp on
      // the whole sea, so south, east and west you could sail out of the last
      // band and keep going into blank water forever: no zone, no landmarks,
      // and past the fog grid entirely, so the chart stopped filling in.
      //
      // ONE RADIUS covers all three, because the bands are concentric. Past the
      // Ancient Deep in any direction is past the Ancient Deep.
      //
      // It SLIDES rather than stops. Only the outward component of the velocity
      // is removed, so running into the edge lets you coast along it instead of
      // pinning you — which matters because the last band is 6,600 wide and its
      // rim is somewhere you might want to follow round.
      const R = Math.hypot(pos.current.x - home.x, pos.current.y - home.y)

      // ── THE SORTIE ─────────────────────────────────────────────────
      //
      // The rim is a wall everywhere except one mouth, exactly like the reef.
      // What is different is that this crossing changes the hull under you, so
      // it ASKS. A boat nosing into the gap raises the confirm and is held at
      // the line until it is answered — it does not slide through on momentum,
      // because the one thing a swap must never be is something that happened
      // while you were looking elsewhere.
      //
      // Coming BACK needs no confirm and gets none. Returning to harbour is not
      // a decision, and a captain who has just been beaten out there should not
      // have to agree to come home.
      if (sideRef.current && !sortieRef.current && R > rim - 40 && inSortie(pos.current.x, pos.current.y)) {
        if (shipRef.current) {
          // ON THE SHIP, so the gate is yours. Straight through, no asking —
          // the decision was made at the dock, and being asked twice for one
          // crossing is how a gate becomes a chore.
          sortieRef.current = true
          setOnSortie(true)
          vibrate([14, 30, 18])
        } else if (now - refusedAt.current > 2600) {
          // ON THE FISHING BOAT. The rim clamp below is what actually stops
          // her; this only says why.
          refusedAt.current = now
          setRefused('The open sea wants your expedition ship. She is at the raid dock.')
          vibrate(12)
        }
      }

      // HOME AGAIN. Crossing back inside the anchorage rim puts you off the
      // ship and back on the fishing boat, wherever on the rim you did it —
      // the mouth is a way OUT of a wall, and there is no wall from outside.
      //
      // The margin is not decoration. Accepting the sortie leaves the boat
      // sitting exactly ON the rim, where R < EXP_EDGE is a coin-flip on the
      // next float, and losing it would put the captain back on the fishing
      // boat in the same frame they left it.
      // BACK INSIDE THE RIM. Still on the ship — she is only left at the dock,
      // and the dock is a long way from here.
      if (sortieRef.current && R < EXP_EDGE - 90) {
        sortieRef.current = false
        setOnSortie(false)
        vibrate([14, 30, 18])
      }

      // ── ALONGSIDE A DOCK ───────────────────────────────────────────
      // Proximity only. What the prompt then offers depends on which hull you
      // are in, and pressing it is the player's business.
      if (sideRef.current && !sortieRef.current) {
        const dr = Math.hypot(pos.current.x - RAID_DOCK.x, pos.current.y - RAID_DOCK.y)
        const dv = Math.hypot(pos.current.x - VOYAGE_DOCK.x, pos.current.y - VOYAGE_DOCK.y)
        const reach = DOCK_R + DOCK_MOOR
        const near = dr < reach && dr <= dv ? 'raid' : dv < reach ? 'voyage' : null
        if (near !== dockRef.current) {
          dockRef.current = near
          setAtDock(near)
          // NO MODAL ON ARRIVAL. It used to open itself the moment you came
          // alongside, and a dialog you did not ask for is an interruption
          // wherever it appears — sailing past the dock on the way to the
          // sortie meant closing a question you had not raised. The action
          // pill and the warmed helm already announce the berth; pressing
          // them is what asks. Same manners as every other place on the
          // chart: nothing opens because you drifted near it.
        }
      } else if (dockRef.current) {
        dockRef.current = null
        setAtDock(null)
      }

      // ── INTO THE PORTAL'S EYE ──────────────────────────────────────
      // The EYE activates, not the mouth: the sheet used to pop on brushing
      // the rim, which made the ring a tripwire to steer around. Now the boat
      // has to be sailed into the CENTRE — a deliberate threading, not a graze
      // — and the moment it is, the portal takes her: all stop, the flourish
      // plays, and only then the sheet. Leaving the whole mouth is what arms
      // it again, so floating inside cannot re-trigger it.
      if (!sideRef.current && !fishingIn) {
        if (!portalIn.current && inPortalEye(pos.current.x, pos.current.y)) {
          portalIn.current = true
          // THE PORTAL HAS HER. Course and way both die here, which is what
          // separates being taken by something from tapping a button on it.
          vel.current.x = 0; vel.current.y = 0
          target.current = { ...pos.current }
          setPortalCharge(true)
          vibrate([12, 50, 18, 50, 26])
          chargeTimer.current = setTimeout(() => {
            setPortalCharge(false)
            setPortalOpen(true)
          }, 1050)
        } else if (portalIn.current && !inPortal(pos.current.x, pos.current.y)) {
          portalIn.current = false
        }
      }

      if (R > rim) {
        const nx2 = (pos.current.x - home.x) / R, ny2 = (pos.current.y - home.y) / R
        pos.current.x = home.x + nx2 * rim
        pos.current.y = home.y + ny2 * rim
        const outward = vel.current.x * nx2 + vel.current.y * ny2
        if (outward > 0) {
          vel.current.x -= nx2 * outward
          vel.current.y -= ny2 * outward
        }
        if (!edgeRef.current) { edgeRef.current = true; setAtEdge(true) }
      } else if (edgeRef.current && R < rim - 400) {
        // Hysteresis, so following the rim does not strobe the line.
        edgeRef.current = false
        setAtEdge(false)
      }

      // YOU CANNOT SAIL THROUGH AN ISLAND. Clamping the target is not enough on
      // its own: a boat carrying way can cross a shoreline the course never
      // asked it to, and drag-steering hands the helm a new point every frame.
      //
      // Pushed back out along the normal, and only the INWARD part of the
      // velocity is removed — whatever was carrying you sideways survives, so
      // you scrape along the coast and round it instead of stopping dead
      // against it. A hull that halts the instant it touches land feels like a
      // wall; one that slides feels like a shore.
      for (const o of allObstacles()) {
        // Capsule-aware: the normal comes off the segment's closest point, so
        // sliding along a jetty's face is the same slide a coast gives.
        const c = obstacleNearest(o, pos.current.x, pos.current.y)
        const dx = pos.current.x - c.x
        const dy = pos.current.y - c.y
        const dd = Math.hypot(dx, dy)
        if (dd >= o.r) continue
        const nx = dd < 0.001 ? 1 : dx / dd
        const ny = dd < 0.001 ? 0 : dy / dd
        pos.current.x = c.x + nx * o.r
        pos.current.y = c.y + ny * o.r
        const vn = vel.current.x * nx + vel.current.y * ny
        if (vn < 0) { vel.current.x -= vn * nx; vel.current.y -= vn * ny }
      }

      // WHICH WAY THE CAPTAIN FACES.
      //
      // The sprite is drawn facing LEFT — that is the pose, rod out to port —
      // so sailing left is the un-mirrored image and sailing right flips it.
      // It was the other way round.
      //
      // And the test is on the X component alone with a real deadband, not on
      // total speed. Sailing nearly straight up or down leaves vx hovering
      // around zero, and reading its sign every frame had the boat flipping
      // several times a second, which is the "no pattern" of it. Below the
      // deadband it simply keeps whatever it was facing.
      if (Math.abs(vel.current.x) > 70) facing.current = vel.current.x < 0 ? 1 : -1

      // THE WAKE. Lay a mark behind the hull while making way, then age every
      // mark in the pool. Marks live in world coordinates inside the world
      // layer, so they stay put on the sea while the boat leaves them behind.
      const speed = Math.hypot(vel.current.x, vel.current.y)
      // A PAIR AT A TIME, port and starboard. The gate is lower than it was
      // (55 left a boat under way at a crawl leaving nothing at all) and the
      // force it was laid at is remembered rather than the mark simply
      // existing — a hard run should look different from a drift.
      if (speed > 26 && now - wakeLast.current > WAKE_EVERY) {
        wakeLast.current = now
        const ux = vel.current.x / speed
        const uy = vel.current.y / speed
        // The stern, in world coordinates. WATERLINE_* are SCREEN measurements
        // taken off the sprite, so inside this squashed and zoomed layer both
        // have to be divided back out.
        // SCALED TO THE HULL. The stern is further back on a bigger ship and
        // the keel is lower in the sprite, so both the offset and the waterline
        // come off hullRef rather than being the fishing boat's numbers used
        // for everything that floats.
        const hull = hullRef.current
        // ── WHY THERE IS NO ZOOM HERE ──────────────────────────────────
        //
        // There used to be, and it put the wake a long way adrift of the
        // Man-o-War. The waterline is a SCREEN measurement off a sprite that is
        // itself drawn `scale(zoom)`, so the keel sits `keelY * zoom` below the
        // boat on screen. The world layer is `scale(zoom) scaleY(GROUND)`, so a
        // world offset d lands at `d * GROUND * zoom`. Setting those equal, the
        // zoom cancels: d = keelY / GROUND, full stop.
        //
        // Dividing by zoom instead pinned the foam a CONSTANT number of screen
        // pixels down while the hull above it grew and shrank with the camera.
        // On the fishing boat that error was 34px at its worst and nobody
        // noticed; at the Man-o-War's 140 it is most of a ship.
        // ── LAID AT THE BOW, NOT THE STERN ─────────────────────────────
        //
        // It used to be the stern, which put the V's apex behind the boat and
        // made the foam look like something the hull was towing. A real wake
        // starts where the water is actually parted: the prow. The marks do not
        // travel — they are laid and then spread sideways — so with the origin
        // forward, the boat sailing on is what leaves them trailing aft, and
        // the V opens from the point of the bow.
        //
        // That is the whole difference between floating along and cutting.
        // ── THE ORIGIN FOLLOWS THE SPRITE, NOT THE HEADING ─────────────
        //
        // It used to be laid a reach along the direction of travel, which is
        // only the same thing as the prow while the art all faces one way. It
        // does not: the fishing boat and the Man-o-War look left, the four
        // middle hulls look right, and each one has its ring placed on the
        // prow that is actually drawn.
        //
        // So the offset is a SPRITE offset, multiplied by `facing` — the same
        // ±1 the hull's own scaleX uses — which carries the cutwater through
        // the mirror with the bow it belongs to. Whichever way a given piece of
        // art happens to face, the foam comes off its stem.
        //
        // The drop is divided by GROUND because it is a screen measurement off
        // the sprite and the world layer is squashed; see the note above.
        const sx = pos.current.x + facing.current * hull.bowX + WATERLINE_X
        const sy = pos.current.y + hull.bowDown / GROUND
        // THE V FOLLOWS THE HEADING, because the water does — plus the hull's
        // own lean, mirrored with it so she does not snap across when she turns.
        const ang = Math.atan2(uy, ux) + hull.bowTilt * facing.current
        const force = Math.min(1, speed / (SPEED * 0.9))
        for (const side of [-1, 1] as const) {
          const i = wakeNext.current
          wakeNext.current = (i + 1) % WAKE_MARKS
          // BARELY OFF THE CENTRELINE. At the stern the pair wanted a gap
          // between them, because that is where a hull's width is. At the bow
          // they want to nearly touch: the apex is a POINT, and two lines that
          // start apart read as a channel rather than as water being split.
          wakeAt.current[i] = {
            x: sx + -uy * side * 3 * hull.scale,
            y: sy + ux * side * 3 * hull.scale,
            born: now, ang, side, force, scale: hull.scale,
          }
        }
      }
      for (let i = 0; i < WAKE_MARKS; i++) {
        const el = wakeRefs.current[i]
        if (!el) continue
        const m = wakeAt.current[i]
        const age = (now - m.born) / WAKE_LIFE
        if (age >= 1 || age < 0) {
          // Write the zero ONCE rather than sixteen times a frame forever. At
          // anchor every mark is dead, so this was thirty-two style writes a
          // frame to keep things invisible.
          if (el.style.opacity !== '0') el.style.opacity = '0'
          continue
        }
        // ── THE V ────────────────────────────────────────────────
        // Perpendicular to the heading it was laid at, sliding outward as it
        // ages. Eased rather than linear: the water leaves the hull fast and
        // then settles, so most of the spread happens early and the far end of
        // the wake is nearly parallel — which is what stops the V reading as a
        // pair of straight rulers.
        // THE V WIDENS WITH THE HULL, but by the ROOT of it rather than by all
        // of it. WAKE_SPREAD is the angle between the two lines, and the note
        // on it warns that too much reads as the boat dragging a net — tripling
        // it for a Man-o-War is exactly that. Root damping keeps a big ship's V
        // visibly broader without turning it into a trawl.
        const out = WAKE_SPREAD * Math.sqrt(m.scale) * m.force * (1 - Math.pow(1 - age, 2.2))
        const px = -Math.sin(m.ang) * m.side * out
        const py = Math.cos(m.ang) * m.side * out

        // Brightest at the hull and gone quickly after, rather than fading in a
        // straight line — foam behaves that way and a linear fade is the main
        // reason the old wake read as sixteen identical dots.
        el.style.opacity = String(Math.pow(1 - age, 1.7) * 0.42 * (0.45 + m.force * 0.55))
        // Stretched ALONG the heading and thin across it: a streak of disturbed
        // water, not a ring. Growing mostly in the across axis as it settles.
        // The marks themselves take the full ratio: this is how much water is
        // being shoved aside, and a ship three times the beam shoves three
        // times the water.
        const along = (0.55 + age * 0.7) * m.scale
        const across = (0.3 + age * 1.5) * m.scale
        el.style.transform =
          `translate3d(${m.x + px}px, ${m.y + py}px, 0) translate(-50%, -50%) `
          + `rotate(${m.ang}rad) scale(${along}, ${across})`
      }
      const ripples = rippleRef.current
      if (ripples) {
        ripples.style.opacity = String(Math.max(0, 1 - speed / 190))
        // The waterline is a measurement off the sprite, so it moves with the
        // sprite when the sprite is scaled.
        const z = zoomRef.current
        // At the hull's own waterline and at the hull's own size, or a
        // Man-o-War sits at anchor inside a rowboat's ring of ripples.
        const hull = hullRef.current
        ripples.style.transform =
          `translate(${WATERLINE_X * z}px, ${hull.keelY * z}px) scale(${z * hull.scale})`
      }

      // ── OTHER PEOPLE'S BOATS ──────────────────────────────────────
      //
      // Eased, never snapped. A report arrives every two seconds while you are
      // together, and two seconds is six hundred pixels at cruising speed, so
      // jumping to each one would be a sprite that stutters across the water.
      //
      // The same exponential the player's own hull uses, so a friend
      // accelerates and settles the way a boat does rather than sliding
      // linearly like a cursor. Frame-rate independent for the same reason.
      if (friendRefs.current.size) {
        const kf2 = 1 - Math.exp(-3.2 * dt)
        for (const [name, at] of friendAt.current) {
          const el = friendRefs.current.get(name)
          if (!el) continue
          const dxf = at.target.x - at.shown.x
          const dyf = at.target.y - at.shown.y
          // A LONG WAY OFF IS NOT A JOURNEY. Somebody who has just come back
          // after an hour, or used the stones, is somewhere else entirely and
          // easing them across the whole chart would draw a boat crossing water
          // it never sailed. Past a screen or two, put them where they are.
          if (Math.hypot(dxf, dyf) > 3200) {
            at.shown.x = at.target.x
            at.shown.y = at.target.y
          } else {
            at.shown.x += dxf * kf2
            at.shown.y += dyf * kf2
          }
          // Face the way they are going, the same flip the player's boat uses.
          // ONLY WHILE GUESSING. A live boat sends its real facing twice a
          // second, and inferring one from a half-second easing delta would
          // fight it — at these step sizes the guess flickers, which is exactly
          // the case the wire value exists to fix.
          const guessing = !at.live || now - at.live > 4_000
          if (guessing && Math.abs(dxf) > 12) at.face = dxf < 0 ? -1 : 1
          el.style.transform = `translate3d(${at.shown.x}px, ${at.shown.y}px, 0)`
          const hull = el.firstElementChild as HTMLElement | null
          if (hull) {
            // COUNTER-SQUASHED, like the traders and like anything else out
            // here with height. This line used to be `scaleX(face)` alone and
            // friends were drawn at 58% of their proper height — a boat that
            // had been stepped on.
            //
            // The reasoning that let it through is worth writing down. The
            // PLAYER'S boat carries no counter-squash either, and that looked
            // like a precedent. It is not: the player's hull lives on the
            // SCREEN layer (the camera follows it, so it never moves relative
            // to the viewport) and never passes through the world layer's
            // scaleY(GROUND) at all. A friend's hull does. Same component, two
            // completely different coordinate spaces.
            //
            // No `scale()` term, unlike the traders' 0.78. A trader is scenery
            // and should not loom; a friend is a peer, and at scale 1 inside
            // the zoomed world layer they come out exactly the size your own
            // boat is on screen. You see them as you see yourself.
            const bobF = Math.sin(now / 1000 * 1.7 + at.bob) * 3.4
              + Math.sin(now / 1000 * 2.6 + at.bob + 1.1) * 2.1
            hull.style.transform =
              `translate(-50%, -50%) scaleY(${1 / GROUND}) scaleX(${at.face}) translateY(${bobF}px)`
          }
        }
      }

      // THE DRIFT. Every bottle nudged along its own slow wander. Transform
      // only, like the patrols: React never hears about it.
      if (bottleRefs.current.size) {
        const ts2 = now / 1000
        for (const b of bottlesRef.current) {
          const el = bottleRefs.current.get(b.key)
          if (!el) continue
          const at = bottlePos(b, ts2)
          el.style.transform = `translate3d(${at.x - b.x}px, ${at.y - b.y}px, 0)`
        }
      }

      // THE PATROLS. Every trader on screen nudged along its own slow circle,
      // and turned to face the way it is going.
      if (hullRefs.current.size) {
        const ts = now / 1000
        for (const t of allTradersRef.current) {
          const el = hullRefs.current.get(t.key)
          if (!el) continue
          const at = traderPos(t, ts)
          el.style.transform = `translate3d(${at.x - t.x}px, ${at.y - t.y}px, 0)`
          // The wake lies along the heading. One rotation write per trader; the
          // marks inside it never change.
          let wake = wakeCache.current.get(t.key)
          if (!wake) {
            wake = el.querySelector<HTMLElement>('.trader-wake') ?? undefined
            if (wake) wakeCache.current.set(t.key, wake)
          }
          if (wake) wake.style.transform = `rotate(${at.headingDeg}deg)`

          // CACHED. This was a querySelector per trader per frame — a DOM
          // search sixty times a second for a node that never changes. Looked
          // up once and kept on the element itself.
          let hull = hullCache.current.get(t.key)
          if (!hull) {
            hull = el.querySelector<HTMLElement>('.trader-hull') ?? undefined
            if (hull) hullCache.current.set(t.key, hull)
          }
          if (hull) {
            hull.style.transform =
              `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.78) scaleX(${at.facing})`
          }
        }
      }

      // Imperative writes. The whole reason this holds 60fps on a phone.
      const world = worldRef.current
      // scaleY LAST (CSS applies right to left), so the camera pan happens in
      // world units and only then meets the plane's foreshortening.
      if (world) {
        const t = `scale(${zoomRef.current}) scaleY(${GROUND}) translate3d(${-pos.current.x}px, ${-pos.current.y}px, 0)`
        world.style.transform = t
        // THE SAME STRING, THE SAME FRAME. These two layers are one world drawn
        // in two passes; a transform written to one and not the other would put
        // the near scenery a frame behind the far scenery.
        if (frontRef.current) frontRef.current.style.transform = t
      }
      // The sea recoloured under the boat. One style write per frame, and the
      // reason there are no zone edges anywhere on the chart.
      // THE BACKDROP, RECOLOURED ONLY WHEN IT CHANGES.
      //
      // Assigning a radial-gradient string to `background` makes the browser
      // re-parse the gradient and repaint the entire viewport. Doing that every
      // frame was a full-screen repaint at 60fps for a colour that drifts over
      // seconds — the blend is a smooth function of position and the boat
      // covers 470px a second at most, so a rebuild is only worth it when the
      // string actually differs. `seaAt` rounds to whole channels, so equal
      // strings mean genuinely identical pixels and this is exact, not
      // approximate.
      const wrap = wrapRef.current
      // The sea's own clock — a 24 minute day for everybody on the same tick,
      // so night comes round about three times an hour wherever you are. See
      // lib/seaClock for why the game keeps its own time rather than reading
      // the player's.
      const clk = seaClock(Date.now())
      // QUANTISED, and this is the whole fix for the screen strobing at dusk.
      //
      // The backdrop is only repainted when its gradient STRING changes, which
      // costs nothing while the light is steady. But darkness ramps continuously
      // through dusk and dawn, so every single frame produced a slightly
      // different string — a full-viewport gradient re-parse and repaint sixty
      // times a second, for the two minutes the light takes to go. That is the
      // flashing.
      //
      // Rounded to 24 steps, the whole fade rebuilds the backdrop 24 times
      // instead of about seven thousand. Each step moves the palette by two or
      // three units out of 255, which is not visible; a strobing screen very
      // much is.
      const dark = Math.round(clk.darkness * 24) / 24
      // THIS ELEMENT'S BACKGROUND IS NOT REACT'S.
      //
      // The flicker was never repaint cost. `setTick` re-renders this component
      // eight times a second to drive the proximity UI, and every one of those
      // renders re-applied the JSX inline style — which carried a `background`
      // computed at HOME. So React stamped the wrong colour on eight times a
      // second, the guard below saw its own `lastCss` unchanged and declined to
      // put the right one back, and the screen alternated between the two.
      //
      // Two rounds of tuning the repaint RATE could not fix an ownership bug,
      // and the second round made it worse by removing the accidental rewrite
      // that had been masking it. The property is gone from the style prop; the
      // loop is the only writer.
      //
      // A DEADBAND, not a grid.
      //
      // Snapping the position to a 64px grid was the wrong shape of fix: a boat
      // sitting on a cell boundary has its rounding flipped back and forth by
      // float noise, so the backdrop alternated between two colours every frame
      // — which is a far more visible flicker than the smooth drift it replaced.
      //
      // Measuring from the position the last look was TAKEN at cannot do that.
      // Once computed at P nothing changes until you are a full step from P, so
      // there is no boundary to sit on and no way back to the previous value
      // without actually sailing there.
      // ── THE LIGHT ON THE WORLD ──────────────────────────────────
      //
      // NOT ON `worldRef` OR `frontRef`, AND THAT IS THE WHOLE NOTE.
      //
      // Both of those are `position: absolute; left: 50%; top: 50%` with NO
      // WIDTH OR HEIGHT: zero-size boxes whose children are placed at world
      // coordinates that run to twenty thousand pixels in every direction. A
      // CSS filter applies to an element and its descendants AS A GROUP, so
      // filtering one of those asks the compositor to rasterise a surface the
      // size of the entire chart's ink overflow rather than the viewport. On a
      // phone that is not slow, it is fatal: the renderer is killed for memory,
      // the page comes back white, and iOS eventually gives up with "a problem
      // repeatedly occurred". It was reported exactly that way, worst around
      // deploys because that is when tabs reload and re-rasterise everything at
      // once.
      //
      // The boat keeps its grade: that subtree is one hull sprite, and it is
      // bounded. The harbour lights keep theirs too — they are small divs
      // reading a custom property, not a filter over a subtree.
      //
      // Which leaves the islands and the landmarks ungraded after dark for now.
      // The bounded way to give them the light back is to bake it into each
      // island's own canvas, which is already a fixed-size surface, rather than
      // to filter the layer they live on. That is worth doing and is not worth
      // guessing at while the page is crashing.
      if (dark !== lastGrade) {
        lastGrade = dark
        if (boatRef.current) boatRef.current.style.filter = nightGrade(dark, 0.55)
        // Published for anything that wants to light UP as the light goes down
        // rather than dim with it — see the harbour lights on the ports.
        wrapRef.current?.style.setProperty('--sea-night', dark.toFixed(3))
      }

      const movedFar = Math.hypot(pos.current.x - lookAt.x, pos.current.y - lookAt.y) >= SEA_STEP
      if (movedFar || dark !== lastDark) {
        lookAt.x = pos.current.x; lookAt.y = pos.current.y
        lastDark = dark
        const look = seaAt(pos.current, dark)
        lum = look.lum
        const sky = skyRef.current
        if (sky && look.css !== lastCss) {
          lastCss = look.css
          sky.style.background = look.css
        }
      }
      // THE SURFACE, moved rather than repainted. Each layer is wrapped to its
      // own tile so the offsets stay small however far you sail, and the two
      // tiles are different sizes so the combination never visibly repeats.
      const deep = deepRef.current
      if (deep) {
        // Times the zoom: the tile stays screen-sized (mottle has no natural
        // scale) but it has to TRAVEL at the same rate the islands do, or the
        // water visibly slides against the land as you sail.
        const zx = zoomRef.current
        // ── THE WATER ZOOMS WITH EVERYTHING ELSE ────────────────────
        //
        // The tile's SIZE is written every frame, not just its offset. It used
        // to be natural-size forever while the world layer scaled — so on a
        // zoom the islands and the boat grew and the water did not, and the eye
        // read the only thing filling the screen as a background sliding rather
        // than a camera moving in.
        //
        // Worse, the offset is `pos * zoom` taken modulo a FIXED period, so
        // changing the zoom moved the numerator without moving the wrap point:
        // the texture physically jumped sideways. Scaling the period with it is
        // what makes the whole thing continuous — both sides of the modulo move
        // together, so the water simply gets bigger.
        const dP = DEEP_TILE * zx
        deep.style.backgroundSize = `${dP}px ${dP}px`
        const ox = (((pos.current.x + now / 1000 * 5.5) * zx) % dP + dP) % dP
        const oy = (((pos.current.y + now / 1000 * 2.5) * zx * GROUND) % dP + dP) % dP
        deep.style.transform = `translate3d(${-ox}px, ${-oy}px, 0)`
      }
      // ── THE BAND'S OWN WATER ─────────────────────────────────────
      //
      // Same treatment as the two washes above: moved, never repainted, wrapped
      // to its own tile so the offset stays small however far you sail. What
      // differs is that the IMAGE changes when you cross into the next band,
      // and a hard swap would be a visible pop across the whole screen.
      //
      // So it fades. Out on the old texture, swap while nothing is showing,
      // back in on the new one. Three quarters of a second each way, slower
      // than anyone can cross a boundary and come back, so it cannot strobe on
      // one. The colour blend runs over the same crossing, and the two arriving
      // together is what makes a band feel like a place rather than a rule.
      const sfEl = surfaceRef.current
      if (sfEl) {
        const here = surfaceAt(pos.current.x, pos.current.y)
        if (here.band !== paintedBand.current) {
          if (surfaceFade.current > 0) {
            surfaceFade.current = Math.max(0, surfaceFade.current - dt / 0.75)
          } else {
            paintedBand.current = here.band
            sfEl.style.backgroundImage = `url(${surfaceTile(here)})`
          }
        } else if (surfaceFade.current < 1) {
          surfaceFade.current = Math.min(1, surfaceFade.current + dt / 0.75)
        }

        const cur = SURFACES.find(v => v.band === paintedBand.current)
        if (cur) {
          const zx = zoomRef.current
          const T = cur.tile.size
          const sP = T * zx
          sfEl.style.backgroundSize = `${sP}px ${sP}px`
          const ox = (((pos.current.x + now / 1000 * cur.drift.x) * zx) % sP + sP) % sP
          const oy = (((pos.current.y + now / 1000 * cur.drift.y) * zx * GROUND) % sP + sP) % sP
          sfEl.style.transform = `translate3d(${-ox}px, ${-oy}px, 0)`
          // THE ONE PLACE THIS MEETS THE CLOCK. Light marks dim when there is
          // no light to catch; dark marks stay. See inkStrength.
          sfEl.style.opacity = String(surfaceFade.current * inkStrength(cur, lum))
        }
      }

      const pale = paleRef.current
      if (pale) {
        const zx = zoomRef.current
        const pP = PALE_TILE * zx
        pale.style.backgroundSize = `${pP}px ${pP}px`
        const ox = (((pos.current.x - now / 1000 * 3.5) * zx) % pP + pP) % pP
        const oy = (((pos.current.y + now / 1000 * 6.5) * zx * GROUND) % pP + pP) % pP
        pale.style.transform = `translate3d(${-ox}px, ${-oy}px, 0)`
        // The pale layer is light ON water, so there has to be less of it in
        // water that is not catching any. One opacity write, no repaint.
        pale.style.opacity = String(0.25 + lum * 0.75)
      }
      const boat = boatRef.current
      if (boat) {
        // Screen-space only: the bob, the heel and which way it faces. Position
        // is not this element's business any more.
        const t = now / 1000
        const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
        // ── THE BOW LIFTS, WHICHEVER WAY SHE IS POINTING ──────────────
        //
        // This was `vel.x / SPEED`, a SIGNED number, and the rotate below sits
        // AFTER scaleX(facing) — so it is applied inside the mirrored frame.
        // Two sign flips: the velocity's, and the mirror's. They cancelled, so
        // the boat tilted the same way in SCREEN space on both headings — which
        // means the opposite way relative to her own bow. Sailing east she rode
        // up on the plane; sailing west she dug her nose into it.
        //
        // The magnitude is the whole story. How hard she is driving has nothing
        // to do with which way she is pointed, and the mirror already handles
        // the pointing. One flip instead of two, and the bow comes up on both.
        const drive = Math.hypot(vel.current.x, vel.current.y)
        const hullNow = hullRef.current
        const heel = Math.min(hullNow.heel, (drive / SPEED) * hullNow.heel)
        boat.style.transform =
          `translate(-50%, -50%) scale(${zoomRef.current}) translateY(${bob}px) scaleX(${facing.current}) rotate(${heel}deg)`
      }

      // Proximity drives React, but only a few times a second. Nothing on screen
      // needs it faster and it keeps the loop out of the reconciler.
      sinceState += dt
      if (sinceState > 0.12) {
        sinceState = 0
        let found: Place | null = null
        // Ports are discs; waters are rings. inBand answers the ring case, and
        // the bands do not overlap, so the first match is the only match.
        for (const p of PLACES) {
          if (p.kind === 'port' ? inBerth(pos.current, p) : inBand(pos.current, p)) { found = p; break }
        }
        setNear(prev => (prev?.id === found?.id ? prev : found))

        // ── WHAT IS IN FRONT OF HER RIGHT NOW ──────────────────────────
        // `m.y` is a mark's BASE — SeaMark anchors at translate(-50%,-100%) —
        // so a base further SOUTH is nearer the camera, and that is the whole
        // depth test. The epsilon keeps a mark whose foot is level with the
        // hull from flickering in and out as she rocks.
        const inFront: number[] = []
        for (let k = 0; k < OCCLUDERS.length; k++) {
          const o = OCCLUDERS[k]
          if (o.y <= pos.current.y + 8) continue
          // COULD IT ACTUALLY COVER HER? The first cut used a flat 1600 both
          // ways, which is three times as wide as any overlap can be — a rock
          // 1600 east cannot touch a 340px hull at screen centre. The cost was
          // not the extra sprites, it was the RE-RENDERS: the set changed the
          // whole time you sailed along the reef band, and every change
          // re-renders this 8,000-line component. Bounded to the mark's own
          // half-width (plus half a hull and lee-way), the set is empty except
          // in the moment a rock genuinely stands in front of the boat.
          if (Math.abs(o.x - pos.current.x) > o.size * 0.5 + 300) continue
          // And no taller than the sprite can reach: counter-squashed art is
          // about size/GROUND high, so a foot further south than that cannot
          // overlap her whatever its width.
          if (o.y - pos.current.y > o.size * 2 + 260) continue
          inFront.push(k)
        }
        setOccluding(prev =>
          (prev.length === inFront.length && prev.every((v, k) => v === inFront[k])) ? prev : inFront)

        // Standing in a hotspot. Compared by KEY, not by identity: the object
        // is rebuilt every fifteen seconds and comparing references would
        // re-render four times a minute for no reason.
        // UNCOVER THE CHART. Cheap: nine index computations and nine bit
        // tests, and it only touches React when a cell genuinely flips.
        let lit = false
        for (const ci of fogReveal(pos.current.x, pos.current.y)) {
          if (fogHas(fogRef.current, ci)) continue
          fogSet(fogRef.current, ci)
          fogPending.current.add(ci)
          lit = true
        }
        if (lit) setFogVersion(v => v + 1)

        // FROM THE LIST WE ALREADY HAVE. `hotspotAt` re-derives the whole set
        // from the clock on every call — filtering the bands, hashing, building
        // three objects — and this runs eight times a second. `spots` is the
        // same set, already computed, refreshed on its own 15s timer.
        const spotNow = spotsRef.current.find(
          h => Math.hypot(pos.current.x - h.x, pos.current.y - h.y) <= h.r) ?? null
        setInSpot(prev => (prev?.key === spotNow?.key ? prev : spotNow))

        // WHO IS OUT HERE. The cell key changes only when you cross a cell
        // boundary, and until it does the answer is identical — so this is a
        // string compare four times a second rather than a hash of two dozen
        // cells sixty times a second.
        // CELL, not a hard-coded 900. This was a copy of the constant rather
        // than the constant, so widening the grid in lib/seaTraders would have
        // left the map recomputing on the wrong boundary and traders would have
        // popped in and out as you sailed.
        const ck = `${Math.floor(pos.current.x / CELL)}:${Math.floor(pos.current.y / CELL)}`
        // The phase is in the key as well as the cell: when night falls the sea
        // gains blockade runners, and without this they would not appear until
        // you happened to cross a cell boundary.
        if (`${ck}|${phaseRef.current}` !== cellRef.current) {
          cellRef.current = `${ck}|${phaseRef.current}`
          setTraders(tradersAround(pos.current.x, pos.current.y, 2400, day))
        }
        // Alongside is close: a trader is a person, not a region, and you
        // should have to actually pull up to them.
        let hit: Trader | null = null
        for (const t of allTradersRef.current) {
          // Against the DRIFTED position, not the anchor. Testing the anchor
          // would let you hail somebody who had drifted a couple of hundred
          // pixels away, and refuse one floating right beside you.
          const at = traderPos(t, now / 1000)
          if (Math.hypot(pos.current.x - at.x, pos.current.y - at.y) < HAIL_RANGE) { hit = t; break }
        }
        setNearTrader(prev => (prev?.key === hit?.key ? prev : hit))

        // FINN. He does not drift and he does not patrol — he is waiting — so
        // this is a flat distance to a fixed point rather than a pass over a
        // list. Nothing to do at all until the server has told us where he is.
        const fn = finnRef.current
        const finnHit = !!fn && Math.hypot(pos.current.x - fn.at.x, pos.current.y - fn.at.y) < FINN_REACH
        setNearFinn(prev => (prev === finnHit ? prev : finnHit))

        // WITHIN REACH OF AN ISLE. Compared by id: `isleNear` returns the same
        // object every time, but comparing ids keeps this honest if the table
        // ever becomes derived rather than a literal.
        const isl = isleNear(pos.current.x, pos.current.y)
        setNearIsle(prev => (prev?.id === isl?.id ? prev : isl))

        // WHAT IS DRIFTING NEARBY. Against the drifted position, not the
        // anchor — same reason the traders test theirs.
        let bot: Bottle | null = null
        for (const b of bottlesRef.current) {
          if (takenRef.current.has(b.key)) continue
          const at = bottlePos(b, now / 1000)
          if (Math.hypot(pos.current.x - at.x, pos.current.y - at.y) < BOTTLE_REACH) { bot = b; break }
        }
        setNearBottle(prev => (prev?.key === bot?.key ? prev : bot))

        // A NEW SET OF BOTTLES when the boat crosses a cell or the tide turns.
        // Keyed on both, so a window rolling over while you sit still still
        // brings you different water.
        const bk = `${Math.floor(pos.current.x / BOTTLE_CELL)}:${Math.floor(pos.current.y / BOTTLE_CELL)}|${bottleWindow(now)}`
        if (bk !== bottleCell.current) {
          bottleCell.current = bk
          setBottles(bottlesAround(pos.current.x, pos.current.y, 5200, now))
        }

        // OVER SOMETHING BURIED, and the wider ring where the water looks odd.
        // Both are computed even when you hold no bearing: sailing across one by
        // accident is a discovery this deliberately allows.
        const dg = digAt(pos.current.x, pos.current.y)
        setNearDig(prev => (prev?.id === dg?.id ? prev : dg))
        const hint = dg ?? digHintAt(pos.current.x, pos.current.y)
        setHintDig(prev => (prev?.id === hint?.id ? prev : hint))
        // SAIL OUT WITH THE ROD OUT AND IT FOLLOWS YOU. This used to raise the
        // leaving-the-water prompt; the streak survives crossing water now, so
        // there is nothing to stop you for. The zone you are fishing simply
        // becomes the zone you are in.
        const fishing = fishingRef.current
        if (fishing && found && found.id !== fishing.id) setFishingIn(found)
        // NOTHING ELSE. There used to be a `setTick(v => v + 1)` here, firing
        // eight times a second, and its ONLY consumer was
        // `key={tick > -1 ? place.id : place.id}` — both branches identical, so
        // it changed nothing and re-rendered the whole map for it: every island,
        // every landmark, every trader, reconciled 480 times a minute to produce
        // the same tree.
        //
        // Everything on this screen that has to move already moves imperatively
        // in the loop above. React is here for things that CHANGE — which water
        // you are in, who you are alongside, which hotspot you are standing in —
        // and every one of those has its own setState that no-ops when the
        // answer is the same.
      }

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={wrapRef}
      onClick={onTap}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        cursor: 'pointer',
        // Without this a drag on a touchscreen is a scroll gesture and the
        // pointermove events stop coming the moment the browser claims it.
        touchAction: 'none',
        // A STATIC BASE, and nothing else. The moving gradient used to be
        // written here — on the element that contains the world, the surface
        // tiles, the boat and every overlay — so every recolour invalidated
        // that entire subtree's raster. That is the flicker. It lives on its
        // own layer now (see skyRef below); this is only here so there is never
        // a frame of white before the first paint.
        background: '#0b1a24',
      }}
      className={`sea-surface${dialUp ? ' sea-frozen' : ''}`}
    >
      {/* THE WATER'S COLOUR, on a layer of its own.
          Under everything and containing nothing, so repainting it repaints one
          full-screen gradient and not the world sitting on top of it. */}
      {/* NO `background` IN THIS STYLE PROP. It is written by the loop and by
          nothing else — see the flicker note on the frame loop. */}
      <div ref={skyRef} aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: Z.backdrop, pointerEvents: 'none',
      }} />

      {/* THE SURFACE, under everything. Two repeating-background layers that
          the loop only ever TRANSFORMS — see seaTiles for why this stopped
          being a canvas. Oversized by a tile in each direction so a wrapped
          offset never exposes an edge. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: Z.backdrop, overflow: 'hidden', pointerEvents: 'none' }}>
        {tiles && (
          <>
            <div ref={deepRef} style={{
              position: 'absolute', left: 0, top: 0,
              // OVERSIZED FOR THE BIGGEST THE TILE CAN GET. The period is now
              // TILE * zoom, and zoom runs to the window fit (0.82) times the
              // wheel (1.6) times the fishing push-in (1.42) — call it 1.9. A
              // wrapped offset can be a whole period, so the slack has to cover
              // that or the far edge of the sheet walks into view at max zoom.
              width: `calc(100% + ${Math.ceil(DEEP_TILE * 2)}px)`,
              height: `calc(100% + ${Math.ceil(DEEP_TILE * 2)}px)`,
              backgroundImage: `url(${tiles.deep})`, backgroundRepeat: 'repeat',
              transformOrigin: '0 0', willChange: 'transform',
            }} />
            {/* THE BAND'S SURFACE. Over the deep mottle and under the pale
                wash, so the water's own light still sits on top of whatever is
                floating in it. Image and opacity are the loop's to write. */}
            <div ref={surfaceRef} style={{
              position: 'absolute', left: 0, top: 0,
              width: 'calc(100% + 1320px)',
              height: 'calc(100% + 1320px)',
              backgroundRepeat: 'repeat', opacity: 0,
              transformOrigin: '0 0', willChange: 'transform, opacity',
            }} />
            <div ref={paleRef} style={{
              position: 'absolute', left: 0, top: 0,
              width: `calc(100% + ${Math.ceil(PALE_TILE * 2)}px)`,
              height: `calc(100% + ${Math.ceil(PALE_TILE * 2)}px)`,
              backgroundImage: `url(${tiles.pale})`, backgroundRepeat: 'repeat',
              transformOrigin: '0 0', willChange: 'transform, opacity',
            }} />
          </>
        )}
      </div>

      {/* THE WORLD. One transformed layer, so the camera is a single write. */}
      <div ref={worldRef} style={{ position: 'absolute', left: '50%', top: '50%', zIndex: Z.world, willChange: 'transform' }}>
        {/* The berths first, so an island always paints over its own ring. */}
        {PLACES.filter(p => p.kind === 'port').map(p => (
          <PortBerth key={`berth:${p.id}`} p={p} active={near?.id === p.id} />
        ))}
        {PLACES.map(p => (
          <PlaceIsland key={p.id} place={crewHallFor(homeFor(p, visiting?.homestead ?? homestead, visiting?.username), crewTiers)} locked={locked(p)}
            // CREW WAITING ON THE DOCK. The island says so itself rather than a
            // banner saying it for them: it is a fact about a PLACE, and the
            // chart is where facts about places belong. Nothing moves, nothing
            // interrupts — you notice it the next time you look at the chart,
            // which out here is constantly.
            // WHERE THE CREWS ACTUALLY LAND. Not the Tally House: that is the
            // day's orders now, and a "2 crew back" badge there would walk
            // somebody a thousand pixels the wrong way.
            waiting={p.id === 'trawl_fleet' ? trawlsReady : 0} />
        ))}
        {/* THE TOP OF THE CHART. Rocks, not architecture — see reefRocks. The
            same SeaMark every other landmark goes through, so they get the
            submerged base and the shoal for free and cannot drift out of
            style. */}
        <ReefLine />
        {/* The harbour's own shore, north of the reef. Always drawn: from the
            fishing grounds it is the far wall you can see beyond the arch. */}
        <AnchorageWall />

        {/* WHAT THE GAP IS FOR. There is no Harbour island any more — sailing
            through the opening is what takes you to expeditions, so the opening
            is what has to say so. */}
        <GateSign to={inAnchorage ? 'Fishing' : 'Expeditions'} />
        {/* Only from inside the harbour it belongs to. From the fishing
            grounds it would be a sign for a door behind a wall. */}
        {inAnchorage && <SortieSign />}
        {/* The Homestead Portal, wearing the deepest band it can reach. */}
        {!inAnchorage && <PortalRing tier={portalTier} />}
        {/* The charge stands on the RING, not the hull: the painted band is
            the cylinder's footprint, so the ring itself is what flares. */}
        <AnimatePresence>
          {portalCharge && !inAnchorage && <PortalBeam tier={portalTier} />}
        </AnimatePresence>
        {/* The two berths either side of the throat. Only from inside the
            harbour they belong to, like the sign. */}
        {inAnchorage && <Docks shipOut={onShip} near={atDock} shipTier={shipTier} />}

        {/* WHERE SOMETHING IS BURIED. Only ever the patch you are already
            standing near, and never on the minimap — see lib/seaDigs. */}
        {hintDig && <DigWater site={hintDig} over={nearDig?.id === hintDig.id} done={dug.has(hintDig.id)} />}

        {/* OTHER PEOPLE. Drawn with the SAME composite as your own boat, so a
            friend arrives with their actual hull, hat, rod, reel, hook and pet
            rather than a stand-in. The sea traders get a cut-down look because
            they are scenery; somebody you sailed out to meet is not. */}
        {friends.map(f => (
          <FriendBoat key={f.username} friend={f} refs={friendRefs} />
        ))}

        {/* WHAT THE TIDE BROUGHT. */}
        {bottles.filter(b => !taken.has(b.key)).map(b => (
          <SeaBottle key={b.key} bottle={b} refs={bottleRefs} />
        ))}

        {/* THE DISCOVERABLE ISLES. Drawn with the landmarks rather than with
            the ports, because that is what they are: something you come across,
            not somewhere you were routed to. */}
        {ISLES.map(i => (
          <IsleRock key={i.id} isle={i} found={found.has(i.id)} isNear={nearIsle?.id === i.id} />
        ))}

        {/* HOTSPOTS. Under the landmarks and over the water, because they ARE
            water — a patch of it that is worth being in. */}
        {spots.map(h => <HotspotRing key={h.key} h={h} />)}

        {/* WHAT BREAKS THE SURFACE. A flat list in absolute world coordinates
            now that the waters are bands — a ring has no box for an offset to
            be relative to. Rendered here rather than inside a place, which also
            means one pass over one array instead of five nested ones. */}
        <LandmarkField />

        {/* THE SALT ROAD. Other captains, out working. They are drawn from the
            same parts the player's own captain is, so they are house-style by
            construction rather than by anyone remembering to match it. */}
        {[yoon, ...residents, ...socials, ...traders].map(t => (
          <TraderBoat key={t.key} trader={t}
            // The boats stay — they are part of the sea and the sea is the
            // backdrop. Their NAME PLATES go: you cannot hail anyone with a
            // line in the water, so a label you cannot act on is furniture.
            quiet={!!fishingIn}
            done={dealt.includes(t.key)}
            isNear={nearTrader?.key === t.key}
hullRef={hullRefFor(t.key)} />
        ))}

        {/* FINN, WHEREVER HE IS TODAY. Drawn after the Salt Road so he is never
            behind a trader who happens to be moored on the same wave, and given
            his own component rather than a TraderBoat because the plate under
            him has to say what he is, and what he is is not a kind of trade. */}
        {finn && !fishingIn && (
          <FinnBoat at={finn.at} isNear={nearFinn}
            ready={finn.questReady}
            // He has something TO GIVE, which is exactly "no job outstanding":
            // with one open he hands out nothing until it comes back, so a ?
            // over him mid-job would be sending captains on a wasted sail.
            // Not OR-ed with unheard beats for the same reason - the beats are
            // behind the work, so their existence is not an invitation.
            offering={!finn.quest} />
        )}

        {/* The wake, in the world layer so each mark stays on the water where
            the hull left it. Every one of these is positioned by the loop. */}
        {Array.from({ length: WAKE_MARKS }, (_, i) => (
          <div key={i} aria-hidden className={wakeClass}
            ref={el => { wakeRefs.current[i] = el }} />
        ))}
      </div>

      {/* ── THE HELM ─────────────────────────────────────────────────────
          Touch only: a mouse has the whole window to point at and does not sit
          on top of the thing it is pointing at. Hidden while the rod is out —
          you are anchored to fish, and a steering control that does nothing is
          worse than no control. */}
      {/* ── THE HELM ─────────────────────────────────────────────────────
          Dead centre, above the action buttons — so it is under the thumb of
          whichever hand is already there for Hail and Fish, and it never covers
          the boat or the water ahead, which is what tap-and-hold steering does
          on a phone.

          Where you touch inside it IS the bearing: the centre is neutral, the
          top edge is due north, the right edge due east. How far out you press
          sets the speed. Touch only, and hidden while the rod is out, because
          you are anchored to fish and a control that does nothing is worse than
          no control. */}
      {/* WHAT THE HELM WILL DO, directly above the thumb that will do it.
          This is all that is left of six full-width pills that used to line the
          bottom of the chart, one per kind of thing you could be beside. The
          wheel does their job on a tap now, so what they were really for —
          telling you there is something here at all — is one line where the
          control actually is. Never eats a press: the helm is underneath it. */}
      {!fishingIn && (helmLabel.act || helmLabel.hold) && (() => {
        // ONE LINE, ONE STYLE. The two used to be different sizes and different
        // families — the action in Cinzel at 1.02 and the hold in Karla at 0.78
        // — which read as a heading with a footnote when they are the same kind
        // of statement about the same control. Only the colour still differs,
        // and only to say when a water is above your level.
        const text = helmLabel.act ?? helmLabel.hold
        const warn = !helmLabel.act && !helmFishable
        const type = {
          margin: 0, fontSize: '1.02rem', textAlign: 'center' as const,
          color: warn ? 'rgba(226,176,176,0.95)' : '#f2ead8',
          textShadow: '0 2px 14px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)',
        }
        const box = {
          position: 'absolute' as const, left: 0, right: 0,
          bottom: HELM_BOTTOM + HELM_D + 10, zIndex: Z.action,
          display: 'flex', justifyContent: 'center', padding: '0 1rem',
        }

        // ── ON A MOUSE, THE LABEL IS THE CONTROL ──────────────────────
        //
        // The helm is display:none on a fine pointer, and the six action pills
        // it replaced are gone — so without this a desktop captain has a line
        // naming an action and nothing anywhere to perform it. Not a smaller
        // version of the touch design: on a mouse this IS the button, and the
        // wording drops "Hold to" because clicking is not holding.
        if (finePointer) {
          return (
            <div style={box}>
              {/* Keyed by its own text: a NEW action pops even when one was
                  already showing, so drifting from the bottle to the isle is
                  an event rather than a silent word-swap. */}
              <motion.button
                key={text ?? ''}
                initial={{ opacity: 0, y: 6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                data-no-steer
                onClick={e => { e.stopPropagation(); if (!helmActRef.current()) startFishing() }}
                className="font-cinzel font-700"
                style={{
                  ...type,
                  padding: '0.62rem 1.4rem', borderRadius: 999,
                  background: 'rgba(10,20,28,0.86)',
                  border: `1px solid ${warn ? 'rgba(200,130,130,0.4)' : 'rgba(180,214,232,0.45)'}`,
                  boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
                  cursor: warn ? 'default' : 'pointer',
                }}
                disabled={warn}>
                {text?.replace(/^Hold to fish /, 'Fish ')}
              </motion.button>
            </div>
          )
        }
        return (
          <div aria-hidden style={{ ...box, pointerEvents: 'none' }}>
            <motion.p
              key={text ?? ''}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 480, damping: 26 }}
              className="font-cinzel font-700" style={type}>{text}</motion.p>
          </div>
        )
      })()}

      {!fishingIn && (
        <div
          ref={boxRef}
          className="sea-helm"
          onPointerDown={e => {
            e.stopPropagation()
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* fine */ }
            // NOT `boxHeld` YET. That ref is what the frame loop steers by, and
            // setting it here is exactly the bug: the boat left before the
            // thumb did. It is set the moment the press is ruled a steer.
            helmDown.current = { x: e.clientX, y: e.clientY, at: performance.now() }
            helmSteering.current = false
            setHelmOn(true)
            vibrate(6)
            // The hold's own clock. Ticks the ring so the captain can SEE the
            // rod coming rather than discovering it.
            helmHoldTimer.current = setInterval(() => {
              const d = helmDown.current
              if (!d || helmSteering.current) return
              const t = Math.min(1, (performance.now() - d.at) / HELM_HOLD_MS)
              setHelmHold(t)
              if (t >= 1) {
                if (helmHoldTimer.current) clearInterval(helmHoldTimer.current)
                helmHoldTimer.current = null
                helmDown.current = null
                setHelmHold(0)
                setHelmOn(false)
                startFishingRef.current()
              }
            }, 40)
          }}
          onPointerMove={e => {
            const d = helmDown.current
            if (!d && !helmSteering.current) return
            e.stopPropagation()
            // ONCE IT IS A STEER IT STAYS ONE. Coming back inside the deadzone
            // mid-drag must not turn the course back into a pending tap.
            if (!helmSteering.current && d
                && Math.hypot(e.clientX - d.x, e.clientY - d.y) > HELM_DEADZONE) {
              helmSteering.current = true
              setHelmHold(0)
              if (helmHoldTimer.current) { clearInterval(helmHoldTimer.current); helmHoldTimer.current = null }
            }
            if (!helmSteering.current) return
            boxHeld.current = { x: e.clientX, y: e.clientY }
            const v = boxVec(boxHeld.current)
            // At the MOVE, not at the next frame — a flick of the thumb can
            // begin and end between two steps of the loop. Same reason as the
            // key press above.
            if (v) cmdDir.current = { x: v.x, y: v.y / GROUND }
            if (knobRef.current) {
              knobRef.current.style.transform = v
                ? `translate3d(${v.x * v.mag * (HELM_R - 22)}px, ${v.y * v.mag * (HELM_R - 22)}px, 0)`
                : 'translate3d(0,0,0)'
            }
          }}
          onPointerUp={e => {
            e.stopPropagation()
            if (helmHoldTimer.current) { clearInterval(helmHoldTimer.current); helmHoldTimer.current = null }
            setHelmHold(0)
            const wasSteering = helmSteering.current
            const pending = helmDown.current
            helmDown.current = null
            helmSteering.current = false

            // A TAP: let go, still, before the hold matured. Do the nearest
            // thing — and if there is nothing in reach, nothing happens, which
            // is the honest answer rather than a lurch.
            if (!wasSteering && pending) {
              boxHeld.current = null
              setHelmOn(false)
              if (knobRef.current) knobRef.current.style.transform = 'translate3d(0,0,0)'
              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* fine */ }
              helmActRef.current()
              return
            }

            // Let go and it runs out rather than stopping dead, which reads as
            // the boat hitting something.
            target.current = runOutTarget(pos.current, vel.current, cmdDir.current, 0.5)
            cmdDir.current = null
            boxHeld.current = null
            setHelmOn(false)
            if (knobRef.current) knobRef.current.style.transform = 'translate3d(0,0,0)'
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* fine */ }
          }}
          onPointerCancel={() => {
            if (helmHoldTimer.current) { clearInterval(helmHoldTimer.current); helmHoldTimer.current = null }
            helmDown.current = null
            helmSteering.current = false
            setHelmHold(0)
            boxHeld.current = null
            setHelmOn(false)
            if (knobRef.current) knobRef.current.style.transform = 'translate3d(0,0,0)'
          }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', zIndex: Z.helm,
            left: '50%', bottom: HELM_BOTTOM, transform: 'translateX(-50%)',
            width: HELM_R * 2, height: HELM_R * 2, borderRadius: '50%',
            touchAction: 'none',
            background: helmOn
              ? 'radial-gradient(circle at 50% 45%, rgba(12,26,38,0.72), rgba(6,14,22,0.46))'
              : 'radial-gradient(circle at 50% 45%, rgba(10,22,32,0.48), rgba(6,14,22,0.28))',
            // ── THE RING SAYS WHEN A TAP MEANS SOMETHING ───────────────
            // The helm is both the wheel and the action button, and it looked
            // identical either way — the only tell was a line of text floating
            // above it. With something in reach the ring warms to the gold the
            // rest of the game uses for "you can act on this", so the control
            // itself is the cue and the text is the explanation.
            //
            // Gold, not the fishing teal: the hold-to-fish ring already owns
            // teal, and one colour meaning two things on the same control is
            // how a colour stops meaning anything.
            border: `1px solid ${helmLabel.act
              ? 'rgba(240,192,64,0.6)'
              : `rgba(180,214,232,${helmOn ? 0.46 : 0.22})`}`,
            boxShadow: helmLabel.act
              ? '0 0 20px rgba(240,192,64,0.22), inset 0 0 14px rgba(240,192,64,0.08)'
              : helmOn ? '0 0 22px rgba(120,180,210,0.2)' : 'none',
            transition: 'background 160ms ease-out, border-color 200ms ease-out, box-shadow 200ms ease-out',
          }}>
          {/* THE ROD COMING. A ring that fills round the helm while a still
              thumb rests, so the hold is something you WATCH arrive rather than
              something that happens to you. Only in fishable water: holding
              over a port or a locked band fills nothing, which is the control
              telling you it will not work before you have waited for it.

              conic-gradient on a mask, so the sweep costs one paint and no
              layout. Hidden at zero rather than mounted and empty. */}
          {helmHold > 0 && helmFishable && (
            <div aria-hidden style={{
              position: 'absolute', inset: -5, borderRadius: '50%',
              pointerEvents: 'none',
              background: `conic-gradient(from -90deg, rgba(150,226,200,0.95) ${helmHold * 360}deg, rgba(150,226,200,0) 0deg)`,
              WebkitMask: 'radial-gradient(circle, transparent 0 calc(100% - 4px), #000 calc(100% - 4px))',
              mask: 'radial-gradient(circle, transparent 0 calc(100% - 4px), #000 calc(100% - 4px))',
              filter: 'drop-shadow(0 0 8px rgba(120,220,190,0.6))',
            }} />
          )}
          <div ref={knobRef} aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 42, height: 42, marginLeft: -21, marginTop: -21,
            borderRadius: '50%', pointerEvents: 'none',
            // The knob follows the ring: warm while a tap acts, teal while a
            // hold fishes, plain silver otherwise. The hold wins when both are
            // live because it is the one in progress.
            background: helmHold > 0 && helmFishable
              ? 'radial-gradient(circle at 42% 36%, rgba(206,250,232,0.96), rgba(120,200,176,0.7))'
              : helmLabel.act
                ? 'radial-gradient(circle at 42% 36%, rgba(250,238,206,0.95), rgba(216,182,110,0.68))'
                : 'radial-gradient(circle at 42% 36%, rgba(214,232,240,0.92), rgba(150,186,206,0.6))',
            border: `1px solid ${helmHold > 0 && helmFishable
              ? 'rgba(180,246,222,0.85)'
              : helmLabel.act ? 'rgba(246,224,160,0.8)' : 'rgba(226,242,250,0.6)'}`,
            boxShadow: helmHold > 0 && helmFishable
              ? `0 4px 12px rgba(0,0,0,0.45), 0 0 ${8 + helmHold * 16}px rgba(120,220,190,${0.3 + helmHold * 0.5})`
              : '0 4px 12px rgba(0,0,0,0.45)',
            // Colours only. `transform` is written by the pointer handlers and
            // a transition on it would put the knob on rails behind the thumb.
            transition: 'background 200ms ease-out, border-color 200ms ease-out',
            willChange: 'transform',
          }} />
        </div>
      )}

      {/* The hull settling at anchor. Three rings out of phase so it reads as
          water moving rather than something blinking. Pushed down to the
          WATERLINE: at plain screen centre these sat around the captain's
          chest, which is where they were floating above the boat. */}
      {/* NO `transform` HERE EITHER — the loop owns it, because it scales with
          the zoom. Same reason as the sky above. */}
      <div ref={rippleRef} aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: Z.ripples, pointerEvents: 'none',
        // How heavy the hull reads, 0 at the Sloop and 1 at the Man-o-War. The
        // loop owns `transform` on this node and nothing else, so a custom
        // property set here is safe.
        ...(onShip ? { ['--heave' as string]: hull.weight } : null),
      }}>
        {onShip ? (
          // A WARSHIP STANDS IN THE WATER. See the note on .sea-heave-* — three
          // thin rings racing outward is a pebble in a pond however big you
          // draw it, and this is a ship of the line at anchor.
          <>
            <div className="sea-heave-trough" />
            <div className="sea-heave-collar" />
            <div className="sea-heave-swell" />
            <div className="sea-heave-swell" style={{ animationDelay: '3.2s' }} />
          </>
        ) : (
          <>
            <div className="sea-ripple" />
            <div className="sea-ripple" style={{ animationDelay: '1.5s' }} />
            <div className="sea-ripple" style={{ animationDelay: '3s' }} />
          </>
        )}
      </div>

      {/* THE BOAT SITS AT THE CENTRE OF THE SCREEN AND STAYS THERE.
          It used to live inside the world layer at its world position, with the
          world translated by the negative of that — which composes to dead
          centre, and is a needlessly clever way of saying "the middle". It also
          made the boat invisible for reasons I could not reproduce by reading,
          which is reason enough on its own.
          The camera follows the boat, so relative to the screen the boat never
          moves. Only the sea does. That is both simpler and what a camera-follow
          actually means. */}
      <div ref={boatRef}
        style={{
          position: 'absolute', left: '50%', top: '50%', zIndex: Z.boat,
          willChange: 'transform', pointerEvents: 'none',
        }}>
        {/* PAST THE SORTIE IT IS NOT YOUR FISHING BOAT. The whole point of
            the crossing is that the hull changes, so the captain-and-tackle
            sprite is replaced outright rather than dressed up. */}
        {onShip
          ? <Warship tier={shipTier} />
          : <Skipper characterColor={characterColor} boatId={boatId} hatId={hatId}
              gear={{
                ...gear,
                // The rod in your hands is the rod you are holding.
                rodSlug: rodNow?.slug ?? gear.rodSlug,
                rod: rodNow?.image ?? gear.rod,
                rodGlow: rodNow?.glow ?? gear.rodGlow,
                rodColor: rodNow?.color ?? gear.rodColor,
              }}
              frame={frame} />}
      </div>

      {/* ── THE NEAR PASS ───────────────────────────────────────────────
          The handful of things currently standing between the camera and the
          hull, drawn again on top of her. Everything about the world layer
          applies — same transform, same marks, same submerge — the only
          difference is which side of the boat it lands on.

          Empty almost always, which is the point: this is a few sprites when
          you are among rocks and nothing at all in open water. */}
      <div ref={frontRef} aria-hidden style={{
        position: 'absolute', left: '50%', top: '50%', zIndex: Z.front,
        willChange: 'transform', pointerEvents: 'none',
      }}>
        {occluding.map(k => <SeaMark key={k} m={OCCLUDERS[k]} i={k + 4000} />)}
      </div>

      {/* The prompt steps aside while the rod is out — the cast button is the
          only thing that should be asking for a thumb down there. */}
      {/* FINN OUTRANKS EVERYONE. A trader is one of dozens and there will be
          another; he is the next beat of the story and you sailed here for him.
          The derivation keeps him off the moored buyers, but a WANDERING trader
          can still drift onto his spot, and this is the ordering that settles
          what happens when one does. */}
      {/* HAILING SOMEONE OUTRANKS THE ZONE PROMPT. You have pulled alongside a
          person; what water you happen to be floating in can wait. */}
      {/* CALLING ON SOMEBODY. Only within reach of the Homestead, and only
          when there is anybody to call on: an empty picker is a button that
          teaches you nothing.

          A CORNER BUTTON, NOT A SECOND PILL. It used to be a full-width
          centred pill at bottom: 74 — which is inside the helm circle — so
          approaching your own island stacked three controls into one thumb
          zone: joystick, this, and the ashore pill under both. One action row
          is the rule: the big pill is the primary, and a secondary action is a
          small thing at the edge, not a second bar. Gold ring while a visit is
          active, so the state the pill's text used to carry is not lost. */}
      {!fishingIn && near?.id === 'home' && guests.length > 0 && (
        <button
          onClick={e => { e.stopPropagation(); vibrate(8); setPicking(true) }}
          data-no-steer
          aria-label={visiting ? `Visiting ${visiting.username} — change` : 'Call on a friend'}
          title={visiting ? `Visiting ${visiting.username}` : 'Call on a friend'}
          style={{
            position: 'absolute', right: 14, bottom: 96, zIndex: Z.action,
            width: 46, height: 46, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: visiting ? '#f0c464' : '#dfe8f2',
            background: 'rgba(12,20,30,0.9)',
            border: `1px solid ${visiting ? 'rgba(240,196,100,0.65)' : 'rgba(180,214,232,0.34)'}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)', cursor: 'pointer',
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
      )}

      {/* DIGGING BEATS EVERYTHING. You are inside a band and possibly beside a
          bottle when you are stood over one, and a buried haul is the rarest
          thing on this chart — it goes to the front of the queue. */}
      {/* THE BOTTLE, ahead of the zone prompt and behind a dig. */}
      {/* GOING ASHORE BEATS FISHING. You are inside a band whenever you are
          on an isle, so without this the only offer on screen would be "Fish
          The Deep" while you are standing on a rock with a chest on it. */}
      {/* AND THE WATER'S NAME IS ALREADY ON SCREEN while the rod is out — the
          stow line at the bottom of the fishing UI reads "Stow rod · Open
          Waters". Two of them, one of them enormous, is the same fact twice. */}
      <VisitPicker
        open={picking} guests={guests} visiting={visiting?.username ?? null}
        onClose={() => setPicking(false)}
        onPick={async name => {
          setPicking(false)
          if (!name) { setVisiting(null); return }
          // The server checks the friendship again here. The list this came
          // from could be minutes old, and an unfollow has to shut the door
          // now rather than at the next page load.
          const v = await homesteadOf(name)
          if (v) { vibrate(12); setVisiting({ username: v.username, homestead: v.homestead }) }
        }}
      />

      <FindPanel state={find} onClose={() => setFind(null)} />

      <EdgeOfChart at={atEdge} />

      {/* ── WHAT THE CHART JUST REFUSED ─────────────────────────────────
          The two hull rules are enforced by clamps, and a clamp on its own is
          an invisible wall. This is the sentence that turns "she will not go"
          into "she will not go, and here is why". Passing, never modal: it is
          an explanation, not a decision. */}
      <AnimatePresence>
        {refused && (
          <motion.div
            key={refused}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            onAnimationComplete={() => { window.setTimeout(() => setRefused(null), 2200) }}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 128, zIndex: Z.crossing,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 1rem',
            }}>
            <p className="font-karla font-600" style={{
              margin: 0, textAlign: 'center', maxWidth: 340,
              fontSize: '0.84rem', lineHeight: 1.45, color: 'rgba(226,238,246,0.92)',
              textShadow: '0 2px 16px rgba(0,0,0,0.98)',
            }}>{refused}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── THE RAID DOCK ───────────────────────────────────────────────
          Where the hull under you changes. It used to happen at the sortie's
          mouth, in open water, on a boat that was drifting — the most
          consequential thing you can do on this chart and you could fall into
          it. Now you moor, and the boat you came in is tied up where you left
          her until you come back.

          The gate is no longer a decision at all: it is a rule. The ship may
          pass and the fishing boat may not, and both are told so. */}
      {swapAsk && (
        <PopupShell open onClose={() => setSwapAsk(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            margin: 'auto', width: '100%', maxWidth: 400,
            borderRadius: 20, padding: '1.2rem 1.05rem 1.05rem',
            // An opaque floor: this sits over painted water.
            background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
            border: '1px solid rgba(196,169,106,0.34)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
          }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.18em', color: 'rgba(196,169,106,0.8)', margin: 0,
            }}>The Raid Dock</p>
            <h2 className="font-pirata" style={{
              fontSize: '1.6rem', color: '#f0ede8', margin: '4px 0 0', lineHeight: 1.15,
            }}>{onShip ? 'Back to the fishing boat?' : 'Take out your ship?'}</h2>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, margin: '0.9rem 0 0',
              padding: '0.7rem 0.8rem', borderRadius: 14,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getShip(shipTier).seaImageUrl} alt="" width={640} height={640}
                decoding="async" style={{ width: 88, height: 'auto', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#ecdcbd', margin: 0 }}>
                  {getShip(shipTier).name}
                </p>
                <p className="font-karla" style={{
                  fontSize: '0.76rem', color: 'rgba(214,226,236,0.7)', margin: '2px 0 0', lineHeight: 1.4,
                }}>
                  {party.length === 0
                    ? 'No crew in the raid seats. She sails empty.'
                    : `${party.length} crew aboard, in their raid seats.`}
                </p>
              </div>
            </div>

            {/* ── THE MUSTER ──────────────────────────────────────
                Seats and mounts drawn as SLOTS, empties included, because a
                muster that only lists who came cannot say who is missing —
                and who is missing is the entire question you stop at a dock
                to answer.

                Crew the Deck fills the empty seats with the best of the bench
                through the same action the Crew Hall uses, and refreshes from
                that action's own returned state — confirming the loadout
                never means leaving the water. The Change links stay for
                picking by hand; the docks tie the systems together, they do
                not replace them. */}
            {!onShip && (
              <>
                {raidRepairOwed > 0 && (
                  <button type="button" data-no-steer
                    onClick={() => { vibrate(8); router.push('/expeditions/ship') }}
                    className="tap font-karla font-700" style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      margin: '0.7rem 0 0', padding: '0.5rem 0.7rem', borderRadius: 10,
                      background: 'rgba(240,120,90,0.1)', border: '1px solid rgba(240,120,90,0.4)',
                      color: '#f0a890', fontSize: '0.76rem', lineHeight: 1.4,
                    }}>
                    She lies on the seabed — {raidRepairOwed.toLocaleString()} ⟡ to raise her. Tap to repair.
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0.75rem 0 0' }}>
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.6rem', letterSpacing: '0.14em', margin: 0,
                    color: party.length < raidSeats ? 'rgba(240,192,64,0.9)' : 'rgba(190,212,228,0.55)',
                  }}>
                    Crew · {party.length} / {raidSeats}
                  </p>
                  {party.length < raidSeats && (
                    <button type="button" data-no-steer onClick={() => void crewDeck()} disabled={decking}
                      className="tap font-karla font-700" style={{
                        padding: '0.2rem 0.55rem', borderRadius: 999, cursor: 'pointer',
                        background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.45)',
                        color: '#f6dfa0', fontSize: '0.66rem',
                      }}>
                      {decking ? 'Mustering…' : 'Crew the deck'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0.4rem 0 0', flexWrap: 'wrap' }}>
                  {party.map(c => (
                    <div key={c.name + c.art} title={c.name} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0.22rem 0.5rem 0.22rem 0.24rem', borderRadius: 999,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={crewArt(c.art)} alt="" width={22} height={22} decoding="async"
                        style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                      <span className="font-karla font-700" style={{
                        fontSize: '0.68rem', color: '#dce6ee', maxWidth: 88,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{c.name}</span>
                    </div>
                  ))}
                  {/* The seats nobody is in. Dashed and dim: absence, drawn. */}
                  {Array.from({ length: Math.max(0, raidSeats - party.length) }, (_, k) => (
                    <div key={`empty${k}`} aria-hidden style={{
                      width: 26, height: 26, borderRadius: '50%',
                      border: '1px dashed rgba(240,192,64,0.4)',
                      background: 'rgba(240,192,64,0.04)',
                    }} />
                  ))}
                  <button type="button" data-no-steer
                    onClick={() => { vibrate(8); router.push('/crew') }}
                    className="tap font-karla font-700" style={{
                      padding: '0.24rem 0.55rem', borderRadius: 999, cursor: 'pointer',
                      background: 'none', border: '1px dashed rgba(196,169,106,0.45)',
                      color: 'rgba(214,196,150,0.85)', fontSize: '0.68rem',
                    }}>
                    Change
                  </button>
                </div>

                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.6rem', letterSpacing: '0.14em', margin: '0.75rem 0 0',
                  color: raidItems.length < itemMounts ? 'rgba(240,192,64,0.9)' : 'rgba(190,212,228,0.55)',
                }}>
                  Mounted · {raidItems.length} / {itemMounts}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0.4rem 0 0', flexWrap: 'wrap' }}>
                  {raidItems.map(it => (
                    <div key={it.name} title={it.name} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0.22rem 0.5rem 0.22rem 0.28rem', borderRadius: 999,
                      background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.28)',
                    }}>
                      {it.image && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={it.image} alt="" width={20} height={20} decoding="async"
                          style={{ width: 20, height: 20, objectFit: 'contain' }} />
                      )}
                      <span className="font-karla font-700" style={{
                        fontSize: '0.68rem', color: '#d8ccf0', maxWidth: 96,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{it.name}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, itemMounts - raidItems.length) }, (_, k) => (
                    <div key={`emptym${k}`} aria-hidden style={{
                      width: 24, height: 24, borderRadius: 7,
                      border: '1px dashed rgba(167,139,250,0.35)',
                      background: 'rgba(167,139,250,0.04)',
                    }} />
                  ))}
                  <button type="button" data-no-steer
                    onClick={() => { vibrate(8); router.push('/expeditions/items') }}
                    className="tap font-karla font-700" style={{
                      padding: '0.24rem 0.55rem', borderRadius: 999, cursor: 'pointer',
                      background: 'none', border: '1px dashed rgba(167,139,250,0.4)',
                      color: 'rgba(200,184,240,0.85)', fontSize: '0.68rem',
                    }}>
                    Change
                  </button>
                </div>
              </>
            )}

            <p className="font-karla" style={{
              fontSize: '0.8rem', color: 'rgba(214,226,236,0.72)', lineHeight: 1.5, margin: '0.85rem 0 0',
            }}>
              {onShip
                ? 'Your fishing boat is tied up here. Take her back and you can sail south through the reef again, but the open sea is closed to her.'
                : 'She is the only hull that can pass the sortie into the open sea, and she does not go south of the reef. Your fishing boat waits here until you come back for her.'}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button type="button" onClick={() => setSwapAsk(false)} className="tap font-karla font-700"
                style={{
                  flex: 1, padding: '0.7rem', borderRadius: 12, fontSize: '0.86rem', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e2ea',
                }}>
                Not yet
              </button>
              <button type="button" onClick={() => swapHull(!onShip)} className="tap font-cinzel font-700"
                style={{
                  flex: 1.3, padding: '0.7rem', borderRadius: 12, fontSize: '0.9rem', cursor: 'pointer',
                  background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f6dfa0',
                }}>
                {onShip ? 'Cast off in her' : 'Board her'}
              </button>
            </div>
          </div>
        </PopupShell>
      )}

      {/* ── THE ACTIVATION ──────────────────────────────────────────────
          The beat between the eye taking the boat and the sheet asking where
          to. Centred on the SCREEN, because the boat is always at screen
          centre and, having just been centred in the eye, so is the portal —
          the two coincide for exactly this moment, which is what makes one
          overlay read as both the ring flaring and the hull being lit.

          Wears the tier's accent. A charge through a Shallows portal is a
          pale shimmer; through the Ancient Deep's it is a violet event. */}

      {/* ── THE PORTAL SHEET ────────────────────────────────────────────
          Opened by crossing the ring. One list, all five bands: where it can
          take you, tap to go; the next stage, priced, right below — so what
          the portal IS and what it could BECOME are one picture. Components
          are cache chests already opened, and the sheet says so, because a
          currency you cannot see yourself earning is a currency that reads
          as a paywall. */}
      {portalOpen && (
        <PopupShell open onClose={() => setPortalOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            margin: 'auto', width: '100%', maxWidth: 400,
            borderRadius: 20, padding: '1.2rem 1.05rem 1.05rem',
            background: 'linear-gradient(180deg, rgba(24,20,34,0.75) 0%, rgba(10,12,20,0.85) 100%), rgba(8,10,18,0.98)',
            border: '1px solid rgba(150,130,240,0.35)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
            maxHeight: '82vh', overflowY: 'auto',
          }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.18em', color: 'rgba(168,146,255,0.85)', margin: 0,
            }}>The Homestead Portal</p>
            <h2 className="font-pirata" style={{
              fontSize: '1.6rem', color: '#f0ede8', margin: '4px 0 0', lineHeight: 1.15,
            }}>Step through?</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: '0.9rem' }}>
              {PORTAL_TIERS.map(t => {
                const owned = t.tier <= portalTier
                const isNext = t.tier === portalTier + 1
                return (
                  <div key={t.tier} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.6rem 0.7rem', borderRadius: 12,
                    background: owned ? `${t.accent}14` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${owned ? `${t.accent}55` : isNext ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    opacity: owned || isNext ? 1 : 0.45,
                  }}>
                    <div aria-hidden style={{
                      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                      background: t.accent, boxShadow: owned ? `0 0 10px ${t.accent}` : 'none',
                      opacity: owned ? 1 : 0.4,
                    }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="font-cinzel font-700" style={{
                        fontSize: '0.9rem', margin: 0,
                        color: owned ? '#ecdcbd' : 'rgba(214,226,236,0.75)',
                      }}>{t.name}</p>
                      {isNext && (
                        <p className="font-karla" style={{
                          fontSize: '0.7rem', margin: '1px 0 0', color: 'rgba(214,226,236,0.65)',
                        }}>
                          {t.cost.toLocaleString()} ⟡
                          {t.components > 0 && ` + ${t.components} components (you hold ${portalComponents})`}
                        </p>
                      )}
                    </div>
                    {owned ? (
                      <button type="button" data-no-steer
                        onClick={() => { const w = warpPoint(t); warpTo(w.x, w.y) }}
                        className="tap font-cinzel font-700" style={{
                          flexShrink: 0, padding: '0.45rem 0.85rem', borderRadius: 10, cursor: 'pointer',
                          background: `${t.accent}22`, border: `1px solid ${t.accent}66`,
                          color: '#eef4f8', fontSize: '0.8rem',
                        }}>
                        Sail
                      </button>
                    ) : isNext ? (
                      <button type="button" data-no-steer onClick={() => void buyTier()} disabled={portalBusy}
                        className="tap font-karla font-700" style={{
                          flexShrink: 0, padding: '0.45rem 0.7rem', borderRadius: 10, cursor: 'pointer',
                          background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.5)',
                          color: '#f6dfa0', fontSize: '0.74rem',
                        }}>
                        {portalBusy ? 'Working…' : 'Build'}
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {portalErr && (
              <p className="font-karla font-600" style={{
                fontSize: '0.74rem', color: '#e6a0a0', margin: '0.6rem 0 0', lineHeight: 1.45,
              }}>{portalErr}</p>
            )}

            <p className="font-karla" style={{
              fontSize: '0.72rem', color: 'rgba(190,212,228,0.55)', lineHeight: 1.5, margin: '0.8rem 0 0',
            }}>
              The last stages take components as well as coin. Every cache chest you crack
              open on the sea's small isles holds one — {CACHE_ISLE_IDS.size} are out there.
            </p>
          </div>
        </PopupShell>
      )}

      <AshorePanel state={landed} onClose={() => setLanded(null)} />

      <WaterBanner
        place={!fishingIn && near && near.kind === 'water' ? near : null}
        locked={near ? locked(near) : false}
        // BELOW THE DISC ROW ON A PHONE. The banner centres itself and the
        // discs hold the left corner, and both sat on the same top: 18 — fine
        // on a monitor where the centre is nowhere near the corner, but on a
        // 390px screen a long water name (THE SHALLOWS, tracked out at 0.2em)
        // reaches the third disc and the two print over each other. hudSize is
        // already the "how much room is this screen" signal: at its phone value
        // the name takes the next row down.
        lowered={hudSize === 26} />

      {/* THE BIG CENTRE-SCREEN CROSSING SPLASH IS GONE, deliberately. The
          waters are concentric rings, so an ordinary sail crosses several in a
          minute and the splash fired on every one — a full-screen interruption
          for a fact the quiet banner above was already stating. The banner's
          own crossing flare (it brightens for a couple of seconds on a new
          water) is the arrival moment now, sized as a readout instead of an
          event. */}

      {/* THE LIGHT lives on the level bar's row while fishing — see
          FishingHere — and only sits on its own up here when the rod is stowed,
          because there is no bar to share a row with. */}
      {!inAnchorage && (!fishingIn || wide) && (
        // A SYMBOL, NOT A NAME. The words were a label on a map, and the sky
        // already says what time it is in colour — the corner only has to
        // confirm it at a glance. `title` keeps the name for anyone who wants
        // it, and the aria-label keeps it for anyone who cannot see the shape.
        <div title={PHASE_LABEL[phase]} aria-label={PHASE_LABEL[phase]} role="img" style={{
          // ON THE ZONE TITLE'S ROW.
          //
          // Same `top: 18` the WaterBanner uses, and a 26px disc against a
          // 1.35rem line that boxes at about 26px — so the two sit on one line
          // across the top of the chart rather than stacking into two bands of
          // furniture. Left edge, because the name is centred and a symbol
          // beside it would drag the name off centre every time the phase
          // changed width.
          //
          // NOT rendered inside the banner, even though it shares its row: the
          // banner only exists while you are in a named water, and what time it
          // is has to be readable in open sea and off a dock too.
          position: 'absolute', top: 18, left: hudAt('clock'), zIndex: Z.hud, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: hudSize, height: hudSize, borderRadius: '50%',
          background: 'rgba(6,12,18,0.7)',
          border: '1px solid rgba(180,214,232,0.22)',
        }}>
          <PhaseGlyph phase={phase} size={Math.round(hudSize * 0.62)} />
        </div>
      )}

      {/* FINN'S BET, WHILE YOU ARE CARRYING ONE.
          Kept up during fishing as well as on the water — the bet is WON with
          the rod out, so hiding it behind the dial would hide it for exactly
          the part that counts. */}
      <FinnBet bet={finn?.challenge ?? null} progress={betProgress} />

      {/* THE CHART BUTTON, beside the light and on the same row.
          A real button, so the map's own `closest('button')` guard exempts it
          from steering on both the pointer and the click path without needing
          data-no-steer as well. */}
      {(!fishingIn || wide) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(10); setMapOpen(true) }}
          aria-label="Open the chart"
          title="The chart"
          data-coach="chart"
          style={{
            position: 'absolute', top: 18, left: hudAt('chart'), zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: hudSize, height: hudSize, borderRadius: '50%', padding: 0,
            background: 'rgba(6,12,18,0.7)',
            border: '1px solid rgba(180,214,232,0.22)',
            color: 'rgba(214,232,240,0.85)', cursor: 'pointer',
          }}>
          {/* A folded chart. Not a compass — there is already a compass on this
              screen and it means something else. */}
          <svg width={Math.round(hudSize * 0.55)} height={Math.round(hudSize * 0.55)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
            <path d="M9 4v14M15 6v14" />
          </svg>
        </button>
      )}

      {/* THE COMPASS. Its mount was deleted in an over-broad slice edit and the
          component sat unreferenced for a dozen commits, which is why the
          arrows "disappeared" — nothing was wrong with them, nothing was
          drawing them. Frozen while the dial is up: the boat is not moving, so
          every tick would redraw identical arrows in identical places. */}
      {/* THE COMPASS IS NAVIGATION, and with the rod out you are not
          navigating — you are standing still on purpose. Four arrows with names
          and distances on them are the single largest thing on this screen that
          has nothing to do with what you are doing. Back the moment you stow. */}
      {!fishingIn && (
        <Compass pos={pos} zoom={zoomRef} wrapRef={wrapRef} locked={locked} frozen={dialUp} friends={friends}
          // The harbour IS a place now, so the compass can raise it again when
          // a crew is in — which is the whole reason the compass sorts by this.
          waitingAt={id => (id === 'trawl_fleet' ? trawlsReady : 0)} />
      )}

      <MainlandAshore open={ashore} onClose={() => setAshore(false)} />

      {/* THE CONFIRM UNDER THE ARCH IS GONE. It asked "sail through to
          Expeditions?" and answered by navigating to a page, which was the
          right shape while there was nothing on the other side of the reef.
          There is water there now, so the arch is just an arch: you sail
          through a gap in a reef the way you sail anywhere else. */}

      {/* THE SAILING-CREW BUTTON IS SHELVED — removed from the HUD for now by
          request, machinery intact: presence still runs (the compass still
          shows who is out), CrewPanel still mounts, and putting the button
          back is restoring one <button> here at the freed hudAt slot. */}
      {/* ── WHO IS OUT HERE, and how far you have got with Finn ─────────
          The story of the fishing campaign is told one meeting at a time by a
          man you have to go and find, and nothing on the chart ever said so.
          The dot is the cue: amber whenever he has a piece of it waiting,
          which is what turns "he shows up sometimes" into somewhere to sail.

          Not while the rod is out on a phone, same rule as the rest of the
          HUD: reading about people is not what you are doing mid-cast. */}
      {!inAnchorage && (!fishingIn || wide) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(8); setFolkOpen(true) }}
          aria-label="The Salt Road"
          title="The Salt Road"
          data-no-steer
          // BLINKS ONLY WHEN HE IS HOLDING YOUR PAY. Not for a beat waiting,
          // not for a regular with a word for you: those get the quiet dot.
          // The HUD is otherwise completely still, so the one thing that moves
          // up there has to mean one thing, and this is the only state worth
          // interrupting somebody mid-sail for.
          className={finn?.questReady ? 'hud-blink' : undefined}
          style={{
            position: 'absolute', top: 18, left: hudAt('folk'), zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: hudSize, height: hudSize, padding: 0,
            borderRadius: 999, cursor: 'pointer',
            background: finnWaiting ? 'rgba(26,22,8,0.86)' : 'rgba(6,12,18,0.7)',
            border: `1px solid ${finnWaiting ? 'rgba(240,192,64,0.55)' : 'rgba(180,214,232,0.22)'}`,
          }}>
          {/* Two figures in conversation: the people of the sea, not one
              person. Stroked like every other icon up here. */}
          <svg width={Math.round(hudSize * 0.5)} height={Math.round(hudSize * 0.5)}
            viewBox="0 0 24 24" fill="none"
            stroke={finnWaiting ? '#f0c040' : 'rgba(214,232,240,0.8)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="8.5" cy="8" r="2.6" /><path d="M4 19v-1.4A4.1 4.1 0 0 1 8.5 14a4.1 4.1 0 0 1 4.1 3.6V19" />
            <circle cx="16.8" cy="9.6" r="2.1" /><path d="M14 19v-1a3.4 3.4 0 0 1 6-2.2" />
          </svg>
          {finnWaiting && (
            <span aria-hidden style={{
              position: 'absolute', top: -2, right: -2,
              width: 11, height: 11, borderRadius: 999,
              background: '#f0c040', border: '1px solid rgba(20,14,4,0.8)',
              boxShadow: '0 0 10px rgba(240,192,64,0.6)',
            }} />
          )}
        </button>
      )}

      <FolkPanel open={folkOpen} onClose={() => setFolkOpen(false)} finn={finn} />

      <CrewPanel
        open={crewOpen}
        onClose={() => {
          setCrewOpen(false)
          void pendingPacts().then(setPendingAsk, () => {})
        }}
        atSea={new Set(friends.map(f => f.username))}
        // A PACT CHANGED — ask the sea again NOW rather than at the next tick.
        // Without this, Accept still means up to twenty seconds of empty water
        // before the boat you just agreed to sail with appears, and twenty
        // seconds is long enough to close the panel, see nothing, and conclude
        // it did not work. (It was reported as exactly that.)
        onChanged={() => pullNow.current()}
      />


      {/* WHAT A TAP ON THE HELM DOES. Assigned during render rather than
          declared as a callback because it closes over a dozen pieces of live
          state, and the helm's own handlers are built once and read it through
          the ref. The ORDER is the action pill's order exactly — the pill is
          the label for this gesture, and if the two disagreed the button would
          be lying about what the thumb is about to do. */}
      {(() => {
        helmActRef.current = () => {
          if (fishingIn) return false
          if (nearFinn && !finnTalk) { vibrate(14); void hailFinn(); return true }
          if (nearTrader && !hailing) { vibrate(14); setHailing(nearTrader); return true }
          if (nearDig && !dug.has(nearDig.id)) { dig(nearDig); return true }
          if (nearBottle) { take(nearBottle); return true }
          if (nearIsle) { void land(nearIsle); return true }
          if (atDock === 'raid') { setSwapAsk(true); return true }
          if (atDock === 'voyage') { vibrate([18, 40, 24]); router.push('/expeditions'); return true }
          const here = nearRef.current
          if (here && here.kind === 'port' && !locked(here)) { enter(here); return true }
          // A water is not a tap target: it is what a HOLD is for, and casting
          // on a tap would fire every time somebody meant to steer and missed.
          return false
        }
        return null
      })()}

      {/* ── THE TRAWLS ──────────────────────────────────────────────────
          Fifth in the row, and a READOUT: what is out, and how long. Sending
          and collecting both happen at the fleet, because the whole point of
          moving them onto the water was that a crew is a place you sail to.
          What this fixes is not knowing, from anywhere, whether it is worth
          the sail yet. */}
      {!inAnchorage && (trawlsOut.length > 0 || trawlsReady > 0) && (!fishingIn || wide) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(8); setTrawlsPeek(true) }}
          aria-label="Trawls"
          title="Trawls"
          data-no-steer
          style={{
            position: 'absolute', top: 18, left: hudAt('trawls'), zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: hudSize, height: hudSize, padding: 0,
            borderRadius: 999, cursor: 'pointer',
            background: trawlsReady > 0 ? 'rgba(26,22,8,0.86)' : trawlsWorking > 0 ? 'rgba(8,18,24,0.82)' : 'rgba(6,12,18,0.7)',
            border: `1px solid ${trawlsReady > 0 ? 'rgba(240,192,64,0.55)' : trawlsWorking > 0 ? 'rgba(103,212,232,0.4)' : 'rgba(180,214,232,0.22)'}`,
          }}>
          {/* A net. */}
          <svg width={Math.round(hudSize * 0.46)} height={Math.round(hudSize * 0.46)}
            viewBox="0 0 24 24" fill="none"
            stroke={trawlsReady > 0 ? '#f0c040' : trawlsWorking > 0 ? '#67d4e8' : 'rgba(214,232,240,0.8)'}
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4h16l-2 6a6 6 0 0 1-12 0z" />
            <path d="M8 4l1.5 12M16 4l-1.5 12M5 8h14" />
          </svg>

          {/* ── TWO STATES, AND THEY ARE NOT THE SAME NEWS ────────────────
              A crew still working is a thing to know; a crew standing on the
              deck with a haul is a thing to DO. One dot for both said "there
              is a trawl" and left you to sail out and find out which.

              Gold and steady means come and get it. Cool blue and breathing
              means they are still out there — the pulse is the tell that it is
              a clock rather than a prompt, and it is slow enough not to nag. */}
          {trawlsReady > 0 ? (
            <span aria-hidden style={{
              position: 'absolute', top: 2, right: 2,
              width: 9, height: 9, borderRadius: '50%',
              background: '#f0c040', border: '2px solid rgba(4,10,18,1)',
              boxShadow: '0 0 7px rgba(240,192,64,0.85)',
            }} />
          ) : trawlsWorking > 0 ? (
            <span aria-hidden className="trawl-working" style={{
              position: 'absolute', top: 3, right: 3,
              width: 7, height: 7, borderRadius: '50%',
              background: '#67d4e8', border: '2px solid rgba(4,10,18,1)',
            }} />
          ) : null}
        </button>
      )}

      {trawlsPeek && (() => {
        const now = Date.now()
        // Soonest back first, so the top of the list is the next reason to sail.
        const rows = trawlsOut
          .map(t => ({ ...t, end: new Date(t.endsAt).getTime() }))
          .sort((a, b) => a.end - b.end)
        return (
          <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
            <PopupShell open onClose={() => setTrawlsPeek(false)}>
              <div onClick={e => e.stopPropagation()} style={{
                margin: 'auto', width: '100%', maxWidth: 380,
                borderRadius: 20, padding: '1.1rem 1.05rem 1rem',
                background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
                border: '1px solid rgba(196,169,106,0.34)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.26rem', color: '#f4ecd8' }}>Trawls</p>
                  <button type="button" onClick={() => setTrawlsPeek(false)} aria-label="Close"
                    style={{
                      width: 30, height: 30, borderRadius: '50%', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                      color: '#cfcabf', cursor: 'pointer',
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>

                <div style={{ marginTop: 10 }}>
                  {rows.length === 0 ? (
                    <p className="font-karla font-600" style={{ fontSize: '0.84rem', color: 'rgba(190,212,228,0.6)', lineHeight: 1.55 }}>
                      No crews out. Sail to the fleet to send one.
                    </p>
                  ) : rows.map((r, i) => {
                    const left = r.end - now
                    const back = left <= 0
                    const mins = Math.max(0, Math.ceil(left / 60_000))
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.42rem 0', borderBottom: '1px solid rgba(255,255,255,0.07)',
                      }}>
                        {/* WHOSE CREW. You picked a specific hand for this water
                            — their savvy and fortune are what the haul is worth
                            — so a list that names the zone and not the person
                            is only half the decision you made. */}
                        <span aria-hidden style={{
                          flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
                          overflow: 'hidden', position: 'relative',
                          background: 'rgba(255,255,255,0.05)',
                          border: `1px solid ${back ? 'rgba(240,192,64,0.6)' : 'rgba(180,214,232,0.25)'}`,
                        }}>
                          {r.art && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={crewArt(r.art)} alt="" draggable={false} style={{
                              // The card art is a full portrait; the head sits
                              // in its upper middle, so it is scaled up and
                              // pushed down to land a FACE in the circle rather
                              // than a letterboxed body.
                              position: 'absolute', left: '50%', top: '6%',
                              width: '150%', transform: 'translateX(-50%)',
                              display: 'block',
                            }} />
                          )}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="font-cinzel font-700 block" style={{
                            fontSize: '0.88rem', color: back ? '#f6e6bd' : '#e6e2dc',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{r.crew}</span>
                          {/* THE WATER THEY ARE IN, under the name. */}
                          <span className="font-karla font-600 block" style={{
                            fontSize: '0.72rem', color: 'rgba(190,212,228,0.55)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{r.zone}</span>
                        </span>
                        <span className="font-karla font-700" style={{
                          fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums',
                          color: back ? '#f0c040' : 'rgba(190,212,228,0.6)',
                        }}>
                          {back ? 'Back' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* WHERE THE WORK HAPPENS, said plainly and every time. This
                    panel can do nothing but tell you things, and a readout that
                    does not say where the buttons are is a dead end. */}
                <div style={{
                  marginTop: 12, padding: '0.7rem 0.8rem', borderRadius: 12,
                  background: 'rgba(240,192,64,0.09)',
                  border: '1px solid rgba(240,192,64,0.3)',
                }}>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '0.9rem', color: '#f0c040', textAlign: 'center', lineHeight: 1.35,
                  }}>
                    {trawlsReady > 0 ? 'Sail to the trawl fleet to bring them in' : 'Sail to the trawl fleet to send a crew'}
                  </p>
                  <p className="font-karla font-600" style={{
                    fontSize: '0.75rem', color: 'rgba(190,212,228,0.6)', textAlign: 'center',
                    marginTop: 3, lineHeight: 1.45,
                  }}>
                    The boats moored south of the Tally House. Sending and
                    collecting both happen there.
                  </p>
                </div>
              </div>
            </PopupShell>
          </div>
        )
      })()}

      {/* ── THE DAY'S ORDERS ────────────────────────────────────────────
          Fourth in the HUD row. Nothing here claims anything: it is a readout,
          and the dot is the only thing it ever asks of you. */}
      {!inAnchorage && orders && orders.challenges.length > 0 && (!fishingIn || wide) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(8); setOrdersOpen(true) }}
          aria-label="Today's orders"
          title="Today's orders"
          data-no-steer
          style={{
            position: 'absolute', top: 18, left: hudAt('orders'), zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: hudSize, height: hudSize, padding: 0,
            borderRadius: 999, cursor: 'pointer',
            background: ordersReady ? 'rgba(26,22,8,0.86)' : 'rgba(6,12,18,0.7)',
            border: `1px solid ${ordersReady ? 'rgba(240,192,64,0.55)' : 'rgba(180,214,232,0.22)'}`,
          }}>
          {/* A pinned sheet of orders. */}
          <svg width={Math.round(hudSize * 0.46)} height={Math.round(hudSize * 0.46)}
            viewBox="0 0 24 24" fill="none"
            stroke={ordersReady ? '#f0c040' : 'rgba(214,232,240,0.8)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
            <path d="M9 9h6M9 13h6M9 17h3" />
          </svg>
          {ordersReady && (
            <span aria-hidden style={{
              position: 'absolute', top: 2, right: 2,
              width: 9, height: 9, borderRadius: '50%',
              background: '#f0c040', border: '2px solid rgba(4,10,18,1)',
              boxShadow: '0 0 7px rgba(240,192,64,0.85)',
            }} />
          )}
        </button>
      )}

      {/* THE ORDERS SHEET. Same stopPropagation wrapper as everything else that
          floats over the chart: the map steers on click, so a tap on the
          backdrop to dismiss would otherwise also put the helm over. */}
      {ordersOpen && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <PopupShell open onClose={() => setOrdersOpen(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              margin: 'auto', width: '100%', maxWidth: 440,
              borderRadius: 20, padding: '1.1rem 1.05rem 1rem',
              // An opaque floor: this sits over painted water.
              background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
              border: '1px solid rgba(196,169,106,0.34)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
              maxHeight: '80vh', overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button type="button" onClick={() => setOrdersOpen(false)} aria-label="Close"
                  style={{
                    width: 30, height: 30, borderRadius: '50%', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                    color: '#cfcabf', cursor: 'pointer',
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <DailyOrders initial={orders} canClaim={false} />
            </div>
          </PopupShell>
        </div>
      )}

      {/* THE TRAWL PANEL, over the water it is sending crews into.

          The wrapper is not optional. This sheet is a DOM child of the map, and
          the map STEERS on click and starts a heading on pointerdown — so
          without it, tapping the backdrop to dismiss also puts the helm over and
          you close the panel to find the boat sailing off. Exactly the trap the
          Mainland's chooser documents a few hundred lines down. The wrapper
          takes no space: everything inside it is position: fixed. */}
      {trawlOpen && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <TrawlIndicator variant="dock" canDeploy onDismiss={() => setTrawlOpen(false)} />
        </div>
      )}

      <CrewNews news={crewNews} onDone={() => setCrewNews(null)} />

      {/* THE CHART. `fogVersion` is in the key path so the canvas redraws when
          a cell flips — the bitfield itself is a ref and mutating it is
          invisible to React by design. */}
      <Minimap
        key={fogVersion}
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        fog={fogRef.current}
        at={pos}
        side={onSortie ? 'sortie' : inAnchorage ? 'expeditions' : 'fishing'}
        seaAt={p => seaAt(p, 0).solid}
        // The rival, and whether he is holding a finished job. Only on the
        // fishing half: he is moored in the Shallows and drawing him on the
        // expeditions chart would be a pin pointing through a reef.
        finn={finn && !inAnchorage && !onSortie
          ? { x: finn.at.x, y: finn.at.y, ready: finn.questReady }
          : null}
        found={found}
        bearings={bearings}
        dug={dug}
        friends={friends}
      />

      {/* THE RENOWN PANEL. Portals to <body> via PopupShell, so it clears the
          map's own stacking and the fishing UI both. */}
      {renownState && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <RenownPanel
            open={renownOpen}
            onClose={() => setRenownOpen(false)}
            skill="fishing"
            initial={renownState}
            onChange={st => setRenownState(st)}
          />
        </div>
      )}

      {/* WHAT THIS WATER IS DOING FOR YOU. Only while you are in it, and it
          says the effect in full rather than an icon you have to learn. */}
      {/* THE HOTSPOT BADGE SHRINKS while the rod is out. It is a three-line
          explanation, and an explanation is for the moment you sail INTO a
          patch — by the time the line is in the water you have read it, and
          all it has to do is keep saying "still here". Full size on the chart,
          one line while fishing, and out of the row the catch card's jackpot
          and double-catch pills use. */}
      <HotspotBadge spot={inSpot} compact={!!fishingIn} />

      {fishingIn && (
        <FishingHere
          zone={fishingIn.id}
          bait={activeBait}
          baitBonus={getBait(activeBait).catchZoneBonus}
          baitLeft={baitLeft}
          mods={{
            ...mods,
            // FROM THE ROD IN HAND, not the one equipped ashore. Swapping rods
            // at sea has to move the dial or the rack is decoration.
            rodCatchBonus: rodNow?.catchZoneBonus ?? mods.rodCatchBonus,
            rodPerfectBonus: rodNow?.perfectZoneBonus ?? mods.rodPerfectBonus,
            rodRetryOnMiss: rodNow?.retryOnMiss ?? mods.rodRetryOnMiss,
            rodSnagImmune: rodNow?.snagImmune ?? mods.rodSnagImmune,
            rodPerfectXpMult: rodNow?.perfectXpMult ?? mods.rodPerfectXpMult,
          }}
          onBaitSpent={left => { if (typeof left === 'number') setBaitLeft(left) }}
          fishingXP={fishingXP}
          auto={auto}
          tideTurner={tideTurner}
          seaPhase={phase}
          baitBag={baitBag}
          rack={rack}
          activeRod={activeRod}
          onRodChange={setActiveRod}
          hold={{ count: holdCount, capacity: hold.capacity }}
          at={pos}
          log={log}
          renownPoints={renownState ? renownPoints : undefined}
          onOpenRenown={renownState ? () => setRenownOpen(true) : undefined}
          onCaught={qty => setHoldCount(n => Math.min(hold.capacity, n + qty))}
          onReel={onFinnReel}
          onBaitChange={t => {
            // Re-reads the remaining count off the bag. The catch-zone bonus is
            // re-read too, from getBait above, so the dial is built from the
            // bait actually on the hook rather than the one the page picked at
            // load and never revisited.
            setActiveBait(t)
            setBaitLeft(baitBag.find(b => b.type === t)?.quantity ?? 0)
          }}
          onPose={setFrame}
          onBusy={setDialUp}
          onCanLeave={setCanLeaveFishing}
          spritesReady={spritesReady}
          onClose={() => { setFishingIn(null); setFrame('rest'); collectLevelRewards(); readOrders() }}
        />
      )}

      {/* WHAT LEVELLING OWED YOU. A hand-over rather than a notification: the
          coin is already in the purse and the number in the nav has moved. */}
      {levelGrant && (
        <LevelRewardsGrant granted={levelGrant} onDone={() => setLevelGrant(null)} />
      )}

      {hailing && (
        <TraderPanel
          trader={hailing}
          alreadyDealt={dealt.includes(hailing.key)}
          dealsLeft={DEALS_PER_DAY - dealt.length}
          onDealt={key => setDealt(prev => (prev.includes(key) ? prev : [...prev, key]))}
          onHoldEmptied={() => setHoldCount(0)}
          onClose={() => setHailing(null)}
        />
      )}

      {/* TALKING TO FINN. Its own mount, not folded in with the trader panel
          above it — they are two different conversations and only one of them
          moves the story. Mounts whenever there is something to say, which
          includes the settlement of a bet he is not standing next to: he gets
          the last word on a wager wherever you happened to finish it. */}
      <FinnTalk
        finn={finn}
        open={finnOpen}
        incoming={finnLines}
        busy={finnBusy}
        onSpeak={() => { void hailFinn() }}
        onTurnIn={() => { void handInFinnQuest() }}
        onClose={() => { setFinnOpen(false); setFinnLines(null) }}
      />

      {/* TEACHING. The walkthrough runs once on the first arrival; the
          landfall hints explain each port as you pull up to it, which is the
          moment the knowledge is usable. Both sit above everything and neither
          blocks the wheel. */}
      {!fishingIn && <SeaTour hasSeen={tour.seen} />}
      {!fishingIn && <SeaLandfallHint nearId={near?.id ?? null} seen={tour.hints} />}

      {/* THE LEAVING WARNING IS GONE, along with the rule it explained.
          It asked you to confirm before sailing out of water you had the rod
          out in, because a streak used to be bound to its zone. Streaks now
          survive crossing water, so there is nothing to warn about and the
          prompt was pure friction on the one action the chart most wants you
          to take. */}
    </div>
  )
}

function dist(a: Vec, p: { x: number; y: number }): number {
  return Math.hypot(a.x - p.x, a.y - p.y)
}

/**
 * THE CAPTAIN, in their boat.
 *
 * Exactly the stack the fishing screen uses: the character sprite is the BASE
 * (it already contains a plain hull), and the bought boat and hat are overlays
 * positioned on top of it as percentages of the character box. Reusing that
 * composition rather than inventing one means a new hat or hull shows up out
 * here the day it ships, with no second set of coordinates to keep in step.
 *
 * The `rest` frame throughout. `cast` is a fishing pose and has no business on
 * open water.
 */
export type Gear = {
  /** A slug rod has three per-frame sprites at `/${slug}_${frame}.png`. Every
   *  high tier is one of these. */
  rodSlug: string | null
  /** A single-image rod, reused across frames. Null on the low tiers, whose
   *  rods are painted into the character sprite and have no overlay at all —
   *  that null is correct rather than missing. */
  rod: string | null
  rodGlow: string | null
  rodColor: string | null
  reel: string | null
  hook: string | null
  pet: string | null
  petArt: string | null
}

/** Overlay coordinates, lifted verbatim from FishingGame. Every rod, reel and
 *  hook tier is uploaded on the same canvas, so one set of numbers lines up all
 *  of them — which is also why copying the table is safe rather than fragile. */
const ROD_AT = {
  rest: { top: 37, left: -12, width: 107.5, rotate: 0 },
  wait: { top: 37.5, left: -8, width: 107.5, rotate: 0 },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0 },
} as const
const REEL_AT = {
  rest: { top: 15, left: -10.3, width: 222, rotate: -18 },
  wait: { top: -5.2, left: -3.1, width: 222, rotate: -36.5 },
  cast: { top: 38.9, left: -42, width: 219.5, rotate: 46.5 },
} as const
const HOOK_AT = {
  rest: { top: 39.5, left: -10.5, width: 204.5, rotate: 0, hidden: false },
  // Hidden on the wait frame because the hook is in the water during the bite.
  wait: { top: 39.5, left: -10.5, width: 222, rotate: 0, hidden: true },
  cast: { top: 40.5, left: -73, width: 204.5, rotate: 66.5, hidden: false },
} as const

type CharFrame = 'rest' | 'wait' | 'cast'
const FRAMES: CharFrame[] = ['rest', 'wait', 'cast']

/**
 * ONE COSMETIC LAYER — drawn once per frame, switched with `visibility`.
 *
 * It must not be a single <img> whose src changes, and the reason is in the
 * base art: the character sheet has a plain wooden hull and a red bandana
 * PAINTED INTO IT. An equipped boat and hat are drawn over the top and cover
 * them exactly — but only while every layer agrees on which frame it is in.
 *
 * Swapping src cannot guarantee that. React writes all the src attributes in
 * one commit, but each <img> paints when its own bitmap is ready, so the base
 * would flip to the cast pose a frame or two before the boat did and the
 * painted-in default underneath was suddenly visible. Preloading and decoding
 * every frame up front makes that rare; it does not make it impossible, which
 * is why it did not fix it.
 *
 * So every frame of every layer is mounted at once, already loaded and already
 * rasterised, and the pose change is a `visibility` flip on all of them in a
 * single style recalculation. There is no decode in the path any more, so there
 * is nothing left to arrive late.
 */
function Layer({ frame, src, at, hiddenOn, origin, className, style }: {
  frame: CharFrame
  src: (f: CharFrame) => string
  at: (f: CharFrame) => { top: number; left: number; width: number; rotate: number } | null
  hiddenOn?: (f: CharFrame) => boolean
  origin?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <>
      {FRAMES.map(f => {
        const p = at(f)
        if (!p) return null
        const on = f === frame && !hiddenOn?.(f)
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img decoding="async" key={f} src={src(f)} alt="" draggable={false}
            // The glow animations go on the VISIBLE copy only. Three sets of
            // keyframes running behind a hidden layer is work nobody sees.
            className={on ? className : undefined}
            style={{
              position: 'absolute',
              top: `${p.top}%`, left: `${p.left}%`, width: `${p.width}%`, maxWidth: 'none',
              transform: `rotate(${p.rotate}deg)`,
              transformOrigin: origin ?? 'center center',
              visibility: on ? 'visible' : 'hidden',
              ...style,
            }} />
        )
      })}
    </>
  )
}

// THE EXPEDITION SHIP IS NOT DRAWN YET, and that is deliberate rather than
// unfinished. You cross the arch on the boat you were already sailing, because
// the anchorage is a hundred metres of the same water with the crew hall and
// the voyage board moored in it. The ship you actually own is what you take
// BEYOND the anchorage, into raid water, and that boundary does not exist yet —
// so neither does the sprite. It was written and removed rather than left
// sitting here unused: git has it when the outer sea arrives.

/**
 * THE SHIP YOU OWN, on the water.
 *
 * ONE BOX FOR ALL FIVE HULLS, and that is not a shortcut. The art is drawn on a
 * shared 1024 canvas at true relative scale — the sloop's hull fills 53% of it
 * and the Man-o-War fills 100% — so rendering every hull at the same width
 * makes a Man-o-War almost twice a Sloop for free, with no per-tier table to
 * keep in step with the ladder. Sized so the smallest reads a little larger
 * than the fishing boat's 210, because trading up to your own ship should not
 * make the thing under you smaller.
 *
 * No counter-squash. The wrapper that carries it is the screen-layer boat node,
 * which was never on the tilted ground plane in the first place.
 */
const Warship = memo(function Warship({ tier }: { tier: number }) {
  const hull = getShip(tier)
  return (
    <div style={{
      position: 'relative', width: 340,
      // NO OFFSET, and that is measured rather than assumed. The Skipper needs
      // one because its sheet reserves empty space up and left for the rod, so
      // the hull sits low-right of the bounding box. These are drawn centred:
      // horizontally 50.0% on every hull, vertically 47-53%. The node above
      // already centres the box, so correcting again would push the ship half
      // its own width off the point the camera is following.
      filter: 'drop-shadow(0 14px 22px rgba(0,0,0,0.6))',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hull.seaImageUrl} alt="" draggable={false}
        width={640} height={640} decoding="async"
        style={{
          width: '100%', display: 'block',
          // Into the chart's bow-left convention. Composes with the loop's own
          // scaleX(facing) multiplicatively, so neither needs to know about
          // the other.
          ...(hull.seaFlip ? { transform: 'scaleX(-1)' } : null),
        }} />
    </div>
  )
})

function Skipper({ characterColor, boatId, hatId, gear, frame }: {
  characterColor: string
  boatId: string | null
  hatId: string | null
  gear: Gear
  frame: CharFrame
}) {
  const char = useMemo(() => getCharacterSprites(characterColor), [characterColor])
  const boat = useMemo(() => BOATS.find(b => b.id === boatId) ?? null, [boatId])
  const hat = useMemo(() => HATS.find(h => h.id === hatId) ?? null, [hatId])

  return (
    <div style={{
      position: 'relative', width: 210,
      // The sprite sheet reserves a large empty region up and to the left for
      // the rod and line, so the hull sits low and right of the image centre.
      // This offset puts the BOAT in the middle of the screen rather than the
      // bounding box, which is what the camera is actually following.
      transform: 'translate(-8%, -26%)',
      filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.55))',
    }}>
      {/* THE BASE, all three poses. `rest` stays in the flow so it is what
          gives the container its height — visibility keeps a layout box, so it
          holds the box open whichever pose is actually showing, and all three
          sheets are the same size anyway. */}
      {FRAMES.map(f => (
        // eslint-disable-next-line @next/next/no-img-element
        <img decoding="async" key={f} src={char[f]} alt="" draggable={false} style={{
          width: '100%', display: 'block',
          ...(f === 'rest' ? {} : { position: 'absolute', top: 0, left: 0 }),
          visibility: f === frame ? 'visible' : 'hidden',
        }} />
      ))}

      {hat && (
        <Layer frame={frame}
          src={f => (f === 'cast' ? hat.castImageUrl : hat.restImageUrl)}
          at={f => hat.positions[f]} />
      )}
      {boat && (
        <Layer frame={frame}
          src={f => (f === 'cast' ? boat.castImageUrl : boat.restImageUrl)}
          at={f => boat.positions[f]}
          className={boat.glow ? 'boat-glow' : undefined} />
      )}
      {(gear.rodSlug || gear.rod) && (
        <Layer frame={frame}
          // A slug rod has three per-frame sprites; a single-image rod reuses
          // one file at three different angles.
          src={f => (gear.rodSlug ? `/${gear.rodSlug}_${f}.png` : (gear.rod as string))}
          at={f => ROD_AT[f]}
          origin="bottom right"
          className={gear.rodGlow ? rodGlowClass({ glow: true, glowType: gear.rodGlow } as never) : undefined}
          style={gear.rodColor ? ({ ['--rod-glow-color' as string]: gear.rodColor } as React.CSSProperties) : undefined} />
      )}
      {gear.reel && (
        <Layer frame={frame} src={() => gear.reel as string} at={f => REEL_AT[f]} />
      )}
      {gear.pet && gear.petArt && (
        <Layer frame={frame} src={() => gear.petArt as string}
          at={f => PET_OVERLAYS[gear.pet as PetSpecies]?.[f] ?? null} />
      )}
      {gear.hook && (
        <Layer frame={frame} src={() => gear.hook as string} at={f => HOOK_AT[f]}
          // The hook is in the water during the bite, so it is not on the rod.
          hiddenOn={f => HOOK_AT[f].hidden} />
      )}
    </div>
  )
}


/**
 * A PLACE ON THE WATER.
 *
 * Not a picture floating on a background. A port is LAND — an island silhouette
 * with the painted plate showing through it as its surface, a shoreline, and a
 * jetty running out into the water where you tie up. A water is a REGION, drawn
 * as a stretch of sea that has changed colour, with no coastline at all because
 * it does not have one.
 *
 * The island shape is generated per place from its id, so no two are the same
 * outline and a row of them never reads as a row of buttons.
 *
 * This is scaffolding for real art, not a substitute for it. Every plate here is
 * a scene painting doing duty as terrain; a purpose-painted island or dock plate
 * drops straight into `art` and this shape logic keeps working under it.
 */
/** Foam and weed sizes for the drift scatter. Hand-picked rather than random so
 *  a zone always looks the same, and varied enough that it never tiles. */
/** How far an island stands out of the water, in SCREEN pixels. Everything
 *  with height divides by GROUND to convert that into the squashed layer's own
 *  units, so the lift stays the same on screen however the plane is tilted. */
const ISLAND_LIFT = 15

/**
 * A TRADER'S BOAT — three images, not twenty-one.
 *
 * The first version rendered <Skipper>, which is the right LOOK and completely
 * the wrong cost. Skipper mounts every frame of every layer at once and
 * switches them with visibility, which is exactly correct for the player's
 * captain — it is the only way the cast pose swaps atomically — and pure waste
 * for an NPC, who never changes pose. That was up to 21 <img> per trader, so a
 * busy stretch of water put well over a hundred image elements on the page for
 * six people who just sit there.
 *
 * A trader also carries no rod, reel, hook or pet: they are working, not
 * fishing, and an NPC wearing your tackle reads as a mirror rather than a
 * stranger. So it is the rest pose only, at the same coordinates Skipper uses.
 */
/** WHERE THE BOAT ACTUALLY IS inside its 250px box, measured off the sheet.
 *  The character art reserves its upper half for the rod and the line, so the
 *  hull is nowhere near the middle and anything positioned against the BOX ends
 *  up a hundred pixels away from anything you can see. */
const HEAD_TOP = 8
const HULL_BOTTOM = 119

const TraderSkiff = memo(function TraderSkiff({ look }: { look: TraderLook }) {
  const char = getCharacterSprites(look.characterColor)
  const boat = BOATS.find(b => b.id === look.boatId) ?? null
  const hat = HATS.find(h => h.id === look.hatId) ?? null
  const bp = boat?.positions.rest
  const hp = hat?.positions.rest
  return (
    /* NO loading="lazy" anywhere in here. The rod hangs outside its own
       container by design (left: -12%) and the whole composite lives inside a
       scaled, translated world layer — which is precisely the situation where
       the intersection test that drives lazy loading gets the wrong answer and
       simply never fetches the image. There are only ever a handful of these on
       screen and they are small; eager is the right call. */
    <div style={{
      position: 'relative', width: 210,
      transform: 'translate(-8%, -26%)',
      filter: 'drop-shadow(0 10px 14px rgba(0,0,0,0.5))',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img decoding="async" src={char.rest} alt="" draggable={false}
        style={{ width: '100%', display: 'block' }} />
      {hat && hp && (
        // eslint-disable-next-line @next/next/no-img-element
        <img decoding="async" src={hat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute', top: `${hp.top}%`, left: `${hp.left}%`,
          width: `${hp.width}%`, transform: `rotate(${hp.rotate}deg)`,
        }} />
      )}
      {boat && bp && (
        // eslint-disable-next-line @next/next/no-img-element
        <img decoding="async" src={boat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
          width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
        }} />
      )}
      {look.hook && (
        /* THE HOOK, on the end of the rod. A rod with nothing tied to it is a
           stick. Same coordinates the player's hook uses, and the rest frame is
           the one where it is out of the water. */
        // eslint-disable-next-line @next/next/no-img-element
        <img decoding="async" src={look.hook} alt="" draggable={false} style={{
          position: 'absolute', top: `${HOOK_AT.rest.top}%`, left: `${HOOK_AT.rest.left}%`,
          width: `${HOOK_AT.rest.width}%`, maxWidth: 'none',
          transform: `rotate(${HOOK_AT.rest.rotate}deg)`,
        }} />
      )}
      {look.rodSlug && (
        /* A ROD, because they are captains on a fishing sea and a boat with
           nobody holding anything reads as a prop. The rest frame only, at the
           same coordinates the player's rod uses, and NEVER a glowing one —
           see TraderLook for why. */
        // eslint-disable-next-line @next/next/no-img-element
        <img decoding="async" src={`/${look.rodSlug}_rest.png`} alt="" draggable={false} style={{
          position: 'absolute', top: `${ROD_AT.rest.top}%`, left: `${ROD_AT.rest.left}%`,
          width: `${ROD_AT.rest.width}%`, maxWidth: 'none',
          transform: `rotate(${ROD_AT.rest.rotate}deg)`, transformOrigin: 'bottom right',
        }} />
      )}
    </div>
  )
})

/**
 * ANOTHER CAPTAIN, ON THE WATER.
 *
 * Built out of Skipper — the same component that draws the player — because the
 * answer to "what should an NPC look like" is "like a person who plays this
 * game". Hull, bandana and colour come off the cosmetic tables, so a stranger
 * out here is wearing things you could be wearing, and anything that ships for
 * players turns up on the Salt Road the same day.
 *
 * Counter-squashed like everything else with height. A boat stands ON the
 * plane; it is not painted onto it.
 */
const TraderBoat = memo(function TraderBoat({ trader, done, isNear, quiet = false, hullRef }: {
  trader: Trader; done: boolean; isNear: boolean
  /** Drop the name plate and the hail mark, keep the boat. Set while the rod is
   *  out — see the note at the mount. */
  quiet?: boolean
  /** Moved every frame by the loop — see traderPos. Positioned by TRANSFORM
   *  rather than left/top so it composites instead of relaying out. */
  hullRef: (el: HTMLDivElement | null) => void
}) {
  /** Somebody you can get to know, or somebody selling something. It changes
   *  the hail mark, the plate's colour and what the plate calls them, because
   *  from a boat's length away those are the only three things you can read. */
  const folk = trader.folkId ? folkById(trader.folkId) : null
  return (
    <div ref={hullRef} style={{
      position: 'absolute', left: trader.x, top: trader.y,
      pointerEvents: 'none', zIndex: 2, willChange: 'transform',
    }}>
      {/* THE BOAT ITSELF. Nothing is drawn under it: two attempts at a
          waterline lived here, a dark ellipse and then a pale one, and both
          read as the boat hovering over a surface. There is no surface. */}
      <div className="trader-hull" style={{
        // scaleX comes from the patrol rather than a coin flip, so a trader
        // always looks the way they are actually drifting. Written every frame
        // by the loop, which finds this node by THIS CLASS.
        // 0.94, up from 0.78. Everybody out here was drawn three quarters
        // the size of the hull you are steering, which made a person you can
        // talk to read as scenery in the middle distance. The player's boat is
        // still the biggest thing on the water, which is correct, but the gap
        // is now a nudge rather than two thirds.
        transform: `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.94)`,
        // Somebody you have already dealt with today is still there — they do
        // not vanish, because a person disappearing once you are done with them
        // is what makes a world feel like a vending machine. They just stop
        // calling out.
        opacity: done ? 0.62 : 1,
      }}>
        <TraderSkiff look={trader.look} />
      </div>

      {/* ── THE HAIL MARK ────────────────────────────────────────────
          Just the mark, just above the head, just when you can talk to them.
          There used to be a small dot when they were out of range, which was
          meant to say "somebody is here" — but it sat right on the captain's
          face, and it was answering a question the boat itself already answers.
          A person you can see is a person who is there. */}
      {isNear && !done && !quiet && (
        /* TWO WRAPPERS, and it needs them for the same reason the swaying
           landmarks do. The outer one carries the placement — the horizontal
           centring and the counter-squash. The inner one carries the bob.
           One element cannot do both: a CSS animation's `transform` REPLACES
           the inline one outright, so while the bob was running the mark had no
           translateX(-50%) and no counter-squash at all. It was landing at the
           wrapper's left edge, squashed flat, on the captain's face. */
        <div aria-hidden style={{
          // HEAD_TOP is +8, measured off the sheet. The mark hangs just above
          // it, anchored by its BOTTOM so the counter-squash grows it upward
          // and away from the hat rather than down into it.
          position: 'absolute', left: 0, top: HEAD_TOP - 32,
          transform: `translateX(-50%) scaleY(${1 / GROUND})`,
          transformOrigin: 'bottom center',
          pointerEvents: 'none',
        }}>
          <div className="sea-hail" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: '50%',
            background: folk ? 'rgba(14,20,28,0.92)' : 'rgba(24,18,10,0.92)',
            border: `1px solid ${folk ? folk.accent : 'rgba(255,206,138,0.85)'}`,
            boxShadow: `0 0 16px ${folk ? folk.accent + '8c' : 'rgba(255,196,110,0.55)'}`,
          }}>
            {folk ? (
              /* SOMEBODY TO TALK TO. Two figures, in their own colour, where a
                 trader gets the bare exclamation: the mark tells you what kind
                 of stop this is before you are close enough to read a name. */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={folk.accent} strokeWidth="2.2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden>
                <circle cx="9" cy="8.4" r="2.5" /><path d="M4.4 18v-1.2A4 4 0 0 1 9 13.4a4 4 0 0 1 4.6 3.4V18" />
                <circle cx="16.6" cy="9.8" r="2" /><path d="M14 18v-.9a3.3 3.3 0 0 1 5.8-2.1" />
              </svg>
            ) : (
              <span className="font-cinzel font-700" style={{
                fontSize: '1.032rem', lineHeight: 1, color: '#ffd986', marginTop: -1,
              }}>!</span>
            )}
          </div>
        </div>
      )}

      {/* THE NAME PLATE, above the boat and on a solid base.
          It used to sit at +30 — which is ON the hull — as bare text over
          painted timber, so it was unreadable against exactly the thing it was
          labelling. House rule: anything written over art gets an opaque base
          under it. */}
      {!quiet && <div style={{
        // BELOW THE HULL, and clear of it. The composite is 210x187 scaled by
        // 0.78 and then counter-squashed by 1/GROUND, which works out at 250px
        // tall — it spans -125 to +125 from this origin. A plate at -62 was
        // sitting squarely on the captain's head. Anchored by its TOP so the
        // counter-squash grows it downward, away from the boat.
        // Right under the hull. The gap that made this look adrift was the
        // pale wash that used to sit between the two.
        position: 'absolute', left: 0, top: HULL_BOTTOM + 2,
        transform: `translateX(-50%) scaleY(${1 / GROUND})`,
        transformOrigin: 'top center',
        textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
        padding: '3px 9px 4px', borderRadius: 9,
        background: 'rgba(6,12,18,0.86)',
        // LIT BY WHOSE PLATE IT IS. A regular carries their own accent, which
        // is the same colour their conversation card and their Salt Road entry
        // are lit with, so the person is recognisable as that person from
        // across the water. Traders keep the shop amber they always had.
        border: `1px solid ${done ? 'rgba(150,166,178,0.3)'
          : folk ? folk.accent + '7a' : 'rgba(255,206,138,0.34)'}`,
        boxShadow: folk ? `0 0 14px ${folk.accent}26` : 'none',
        opacity: isNear ? 1 : 0.8, transition: 'opacity 220ms ease-out',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.888rem', color: done ? 'rgba(180,192,200,0.6)' : '#e6eef4',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}>{trader.name}</p>
        <p className="font-karla font-600" style={{
          fontSize: '0.696rem', marginTop: 1,
          color: done ? 'rgba(160,176,186,0.55)'
            : folk ? folk.accent : 'rgba(255,214,150,0.85)',
          textShadow: '0 1px 9px rgba(0,0,0,0.9)',
        }}>{done ? 'Traded today' : folk ? folk.role : KIND_LABEL[trader.kind]}</p>
      </div>}
    </div>
  )
})


/** One thing standing out of the water. Absolute world position: the bands have
 *  no box for an offset to be relative to. */
/**
 * THE ROCKS ALONG THE TOP OF THE CHART.
 *
 * Fourth version. The first two built cliff GEOMETRY — panels, faces, skylines,
 * a whole material language — and both looked like something from another game
 * bolted onto the top of ours. The second at least used the islands' colours
 * and still looked wrong, because the problem was never the palette: nothing
 * else on this water is architecture. Everything else out here is an OBJECT
 * sitting in the sea, drawn as a sprite, with its base going under.
 *
 * The third was objects, but the wrong ones. It reused `monolith` and `islet`,
 * and both of those are LANDMARKS: the monolith is a carved standing stone
 * covered in spirals, the islet has a rope-wrapped post driven into it. Fine
 * once. Three hundred and eighty times along one edge, the carvings and the
 * post are all you see, and the barrier reads as one prop stamped out.
 *
 * So these are painted rock and nothing else — six plain boulders and two
 * headland stacks, no carvings, no rope, no props, every one of them lit from
 * the upper left so they can stand together in a single run. `slice-rocks.mjs`
 * cuts them off the two sheets.
 *
 * They still go through `SeaMark`, so they take the submerged base for free and
 * cannot drift out of style. The gap is left at the Harbour, and the hull clamp
 * has not changed at all — the rocks are what that clamp has always looked like
 * from the deck.
 */
const REEF_STEP = 700
/** The small rock goes in at four times the density. See "THE SHINGLE". */
const PEBBLE_STEP = 175

/**
 * WHAT SIZE EACH SHAPE WANTS TO BE.
 *
 * `SeaMark` treats `size` as WIDTH and lets the sprite set its own height, so
 * one number means something different for every shape: the slab is two and a
 * half times wider than it is tall, the spire is two thirds as wide as it is
 * tall, and the same `size` therefore comes out nearly 4x taller on one than
 * the other. Ranges are per shape so a spire and a slab can sit side by side
 * and still look like the same coast.
 */
const BOULDERS = [
  { art: '/sea/rock-crag.png', min: 420, max: 760 },   // jagged tilted slabs
  { art: '/sea/rock-split.png', min: 400, max: 700 },  // cracked in two
  { art: '/sea/rock-dome.png', min: 460, max: 820 },   // a whale's back
  { art: '/sea/rock-spire.png', min: 260, max: 470 },  // tall and leaning
] as const

const SHINGLE_ART = [
  { art: '/sea/rock-cobbles.png', min: 190, max: 340 },  // a loose handful
  { art: '/sea/rock-slab.png', min: 250, max: 440 },     // wave-cut shelf
  { art: '/sea/rock-dome.png', min: 175, max: 300 },     // the dome, small
] as const

function reefRocks() {
  const OUT = Math.max(...PLACES.map(p => p.outer ?? 0))
  /** `solid` marks the rock a hull has to go round. Shingle is left off: it is
   *  small, there are four times as many, and the wall is the real barrier. */
  const out: { art: string; x: number; y: number; size: number }[] = []
  let seed = 0x7f4a7c15
  const nx = () => {
    seed ^= seed << 13; seed >>>= 0
    seed ^= seed >>> 17
    seed ^= seed << 5; seed >>>= 0
    return seed / 0x100000000
  }

  // ── THE BOULDERS ─────────────────────────────────────────────────────
  // Two staggered rows, so the run has some depth to it rather than being a
  // line of rock. Set well clear of the gate: the widest boulder is 820
  // across and jitters 77 either way, so anything under 520 of clearance can
  // drop half a rock into the mouth.
  for (const row of [0, 1]) {
    const off = (row * REEF_STEP) / 2
    for (let x = -OUT - REEF_STEP + off; x < OUT + REEF_STEP; x += REEF_STEP) {
      if (Math.abs(x - GATE_X) < GATE_HALF + 520) continue
      const b = BOULDERS[Math.min(BOULDERS.length - 1, Math.floor(nx() * BOULDERS.length))]
      out.push({
        art: b.art,
        x: x + (nx() - 0.5) * REEF_STEP * 0.22,
        y: NORTH_WALL + (row ? 1 : -1) * 110 + (nx() - 0.5) * 150,
        size: b.min + nx() * (b.max - b.min),
      })
    }
  }

  // ── THE HEADLANDS ────────────────────────────────────────────────────
  //
  // The two big stacks, one either side of the mouth. Placed, not rolled:
  // they are the only pair on the chart and framing the gate is the entire
  // reason they exist, so they go exactly where they frame it.
  //
  // They are the biggest rock on the chart at 760 across, half again the
  // largest boulder, because they are the sign as much as the barrier: the
  // one gap in 45,000px of reef has to be findable from a long way off, and
  // two stacks that tower over everything beside them is how you find it.
  //
  // 370 puts each one's inner edge flush with the lip, lapping it by about
  // 10px. Set them back further and the last stone stops short, leaving a
  // sliver of bare water at each lip that reads as a nick in the reef — the
  // shingle cannot cover that, because the shingle has to stand off the
  // mouth too. A few pixels of overlap is the cleaner side to land on, and
  // it costs nothing: the clamp tests the boat's CENTRE.
  //
  // They are NOT mirrored. The art is lit from the upper left, and flipping
  // one to tidy up the silhouette would flip its light with it and break the
  // whole run. Two headlands that do not match is what a real channel looks
  // like anyway.
  out.push({ art: '/sea/rock-gate-w.png', x: GATE_X - (GATE_HALF + 370), y: NORTH_WALL - 40, size: 760 })
  out.push({ art: '/sea/rock-gate-e.png', x: GATE_X + (GATE_HALF + 370), y: NORTH_WALL - 40, size: 760 })
  // One boulder tucked in behind each, so the headlands grow out of the reef
  // instead of reading as two towers parked on the end of it.
  for (const side of [-1, 1]) {
    out.push({
      art: '/sea/rock-crag.png',
      x: GATE_X + side * (GATE_HALF + 640),
      y: NORTH_WALL + 140,
      size: 520,
    })
  }

  // ── THE SHINGLE ──────────────────────────────────────────────────────
  //
  // Small stuff, packed in tight along the whole run. It does two jobs.
  //
  // Coverage: the boulders are placed on a 700px stride and jittered, which
  // leaves the odd bare patch that the eye reads as a way through even
  // though the clamp says otherwise. Shingle is cheap enough to scatter at
  // four times the density and close all of it.
  //
  // Scale: a barrier of nothing but boulders has no size to it, because
  // there is nothing small to measure the big ones against. Rock from 175 to
  // 820 across reads as a reef; rock from 400 up reads as a row of props.
  //
  // Clearance is 300: the widest shingle is 440 across and jitters 70, so a
  // setback that only clears the stride still puts stone in the mouth.
  for (let x = -OUT - PEBBLE_STEP; x < OUT + PEBBLE_STEP; x += PEBBLE_STEP) {
    if (Math.abs(x - GATE_X) < GATE_HALF + 300) continue
    const p = SHINGLE_ART[Math.min(SHINGLE_ART.length - 1, Math.floor(nx() * SHINGLE_ART.length))]
    const r = nx()
    out.push({
      art: p.art,
      x: x + (nx() - 0.5) * PEBBLE_STEP * 0.8,
      // Spread wider north-to-south than the boulders. Shingle piles up
      // around rock, it does not queue behind it.
      y: NORTH_WALL + (nx() - 0.5) * 330,
      size: p.min + r * r * (p.max - p.min),
    })
  }

  // Painter's order: the ones further south are nearer, so they draw last and
  // overlap what is behind them. Without this a big rock at the back sits on
  // top of a small one in front and the whole run goes flat.
  return out.sort((p, q) => p.y - q.y)
}

/** Computed once at module load. It depends on nothing but the chart. */
const REEF = reefRocks()

/**
 * THE ANCHORAGE'S WALL.
 *
 * The harbour used to be a disc with an invisible edge. You slid along it
 * without ever being told there was anything there, and the sortie — the one
 * place the edge means something — looked exactly like the rest of it.
 *
 * So it gets a shore, in the same rock as the reef and by the same rules: two
 * staggered rows for depth, shingle at four times the density to close the
 * gaps, and one gap left where the way out is. If the reef is how you get IN,
 * this is the same idea drawn round the other side, and it should be the same
 * object rather than a second kind of barrier that happens to do the same job.
 *
 * The one real difference is that it is an ARC, so everything is placed by
 * angle and the strides are converted to angles at this radius. Stepping in
 * world pixels along a curve would bunch the rock at the ends.
 */
function anchorageRocks() {
  const out: { art: string; x: number; y: number; size: number }[] = []
  let seed = 0x1f83d9ab
  const nx = () => {
    seed ^= seed << 13; seed >>>= 0
    seed ^= seed >>> 17
    seed ^= seed << 5; seed >>>= 0
    return seed / 0x100000000
  }
  const { from, to } = anchorageArc()
  /** A point on the rim, `off` world px out from it (negative = inside). */
  const at = (th: number, off: number) => ({
    x: EXP_ORIGIN.x + Math.cos(th) * (EXP_EDGE + off),
    y: EXP_ORIGIN.y + Math.sin(th) * (EXP_EDGE + off),
  })
  /** The sortie sits at the middle of the arc, due north. */
  const mid = (from + to) / 2
  /** Arc distances as angles, so a stride means the same thing all the way
   *  round rather than only where the curve happens to be flattest. */
  const ang = (px: number) => px / EXP_EDGE

  // ── THE BOULDERS ─────────────────────────────────────────────────────
  // Same 520 of clearance the reef uses, for the same reason: the widest
  // boulder is 820 across and jitters, so anything tighter drops half a rock
  // into the mouth.
  const skip = ang(SORTIE_HALF + 520)
  for (const row of [0, 1]) {
    const step = ang(REEF_STEP)
    for (let th = from + (row * step) / 2; th < to; th += step) {
      if (Math.abs(th - mid) < skip) continue
      const b = BOULDERS[Math.min(BOULDERS.length - 1, Math.floor(nx() * BOULDERS.length))]
      const p = at(th + (nx() - 0.5) * step * 0.22,
        (row ? 1 : -1) * 110 + (nx() - 0.5) * 150)
      out.push({ art: b.art, x: p.x, y: p.y, size: b.min + nx() * (b.max - b.min) })
    }
  }

  // ── THE HEADLANDS ────────────────────────────────────────────────────
  //
  // The same pair that frames the arch, framing this. Placed rather than
  // rolled, because framing the gap is the entire reason they exist.
  //
  // NOT MIRRORED and not swapped: the art is lit from the upper left, and the
  // west stone stays west. Flipping one to tidy the silhouette would flip its
  // light and break the run it stands in.
  const gate = ang(SORTIE_HALF + 370)
  const w = at(mid - gate, 40), e = at(mid + gate, 40)
  out.push({ art: '/sea/rock-gate-w.png', x: w.x, y: w.y, size: 760 })
  out.push({ art: '/sea/rock-gate-e.png', x: e.x, y: e.y, size: 760 })
  // One boulder behind each, so they grow out of the wall rather than reading
  // as two towers parked on the end of it.
  for (const side of [-1, 1]) {
    const p = at(mid + side * ang(SORTIE_HALF + 640), -140)
    out.push({ art: '/sea/rock-crag.png', x: p.x, y: p.y, size: 520 })
  }

  // ── THE SHINGLE ──────────────────────────────────────────────────────
  // Coverage and scale, exactly as on the reef: the boulders leave bare
  // patches the eye reads as a way through, and rock with nothing small in it
  // has no size to it.
  const pebbleSkip = ang(SORTIE_HALF + 300)
  const pstep = ang(PEBBLE_STEP)
  for (let th = from; th < to; th += pstep) {
    if (Math.abs(th - mid) < pebbleSkip) continue
    const pa = SHINGLE_ART[Math.min(SHINGLE_ART.length - 1, Math.floor(nx() * SHINGLE_ART.length))]
    const r = nx()
    const p = at(th + (nx() - 0.5) * pstep * 0.8, (nx() - 0.5) * 330)
    out.push({ art: pa.art, x: p.x, y: p.y, size: pa.min + r * r * (pa.max - pa.min) })
  }

  // Painter's order: further south is nearer, so it draws last and overlaps
  // what is behind it. Without this a big rock at the back sits on top of a
  // small one in front and the whole run goes flat.
  return out.sort((p, q) => p.y - q.y)
}

const ANCHORAGE_WALL = anchorageRocks()

/**
 * EVERYTHING THAT CAN STAND IN FRONT OF THE BOAT.
 *
 * The hull is drawn on the SCREEN layer, at dead centre, above the whole world
 * — which is what makes the camera-follow trivial and what meant the boat was
 * painted over every rock on the chart whichever side of it she was on. Sail
 * north of a stack and you were still in front of it, hovering.
 *
 * The world layer carries a transform, so it is its own stacking context and
 * its children can never interleave with a sibling. Real depth sorting would
 * mean putting the boat back INSIDE it at her world position, and the note on
 * the boat node says what happened last time that was tried.
 *
 * So instead: a second, thin layer ABOVE the hull, carrying the same transform,
 * holding only the few things currently nearer the camera than she is. They are
 * drawn twice — once in the world, once here — which costs a handful of sprites
 * and is invisible, because both copies land in exactly the same place.
 *
 * Only tall scenery. A flat shelf awash at the waterline never covers anything,
 * and every extra candidate is one more distance test on the proximity tick.
 */
const OCCLUDERS: { art: string; x: number; y: number; size: number }[] =
  [...LANDMARKS, ...REEF, ...ANCHORAGE_WALL]
    .filter(m => m.size >= 300)
    .map(m => ({ art: m.art, x: m.x, y: m.y, size: m.size }))



/**
 * THE SCENERY, AS ONE ELEMENT.
 *
 * The reef is ~320 rocks and pebbles and the landmark field is another 35.
 * Every SeaMark is memo'd, so the DOM never churned — but the PARENT re-render
 * still called createElement three hundred and fifty times and re-diffed the
 * lot, on every proximity flip and every trader-cell crossing, forever. All of
 * it to conclude nothing changed, because none of it CAN change: both lists
 * are module constants.
 *
 * As memo components with no props they cost the parent exactly one element
 * each, and React never descends into them again.
 */
const ReefLine = memo(function ReefLine() {
  return <>{REEF.map((m, i) => <SeaMark key={`reef${i}`} m={m} i={i + 500} />)}</>
})

/** The harbour's shore. Same treatment as the reef and for the same reason —
 *  a module constant that can never change, so the parent pays one element. */
const AnchorageWall = memo(function AnchorageWall() {
  return <>{ANCHORAGE_WALL.map((m, i) => <SeaMark key={`anch${i}`} m={m} i={i + 1200} />)}</>
})

/** Crew card art lives in Supabase storage, same bucket the crew hall reads. */
const CREW_ART_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/`
const crewArt = (f: string) => (f ? CREW_ART_BASE + f : '')

const LandmarkField = memo(function LandmarkField() {
  return <>{LANDMARKS.map((m, i) => <SeaMark key={i} m={m} i={i} />)}</>
})

/**
 * HOW DEEP EACH THING SITS.
 *
 * `line` is where the water crosses the sprite, as a percentage of its height —
 * so a buoy at 70 is three tenths under, and a rig at 84 is standing on legs
 * with only its feet wet.
 *
 * `keep` is how much of the submerged part you can still make out through the
 * water before it fades to nothing. Never 0: an object that vanishes at the
 * waterline has been CUT, not submerged, and the eye reads the straight edge
 * immediately. A little of the hull showing under the surface is the whole
 * effect.
 */

/** Which art file this is, from its path — `/sea/wreck.png` -> `wreck`. */
function markKind(art: string): string {
  return art.slice(art.lastIndexOf('/') + 1).replace('.png', '')
}

/**
 * THE OUTSTANDING WAGER.
 *
 * A bet you cannot see is a bet you forget you took, and Finn's are won by
 * doing something specific — three in a row, five before the sand runs out —
 * which nobody can aim at from memory. So it states the target and how far
 * along it is, and for a speed bet it counts down.
 *
 * THE NUMBERS HERE ARE NOT THE ONES THAT PAY. The settlement runs on the
 * server against its own counters (finnActions.ts). This is a readout, and it
 * is allowed to be a frame behind without anything being at stake.
 *
 * The clock only ticks while there is a clock to tick — a perfect-streak bet
 * has no deadline and mounts no interval at all.
 */
const FinnBet = memo(function FinnBet({ bet, progress }: {
  bet: FinnChallenge | null
  progress: number
}) {
  const [, tick] = useState(0)
  const timed = !!bet?.endsAt
  useEffect(() => {
    if (!timed) return
    const id = setInterval(() => tick(v => v + 1), 250)
    return () => clearInterval(id)
  }, [timed])

  if (!bet) return null

  const target = bet.type === 'perfect_streak' ? (bet.perfects ?? 0) : (bet.fish ?? 0)
  const done = Math.min(progress, target)
  const left = bet.endsAt ? Math.max(0, bet.endsAt - Date.now()) : null
  // Under ten seconds it goes red, because that is the point at which the
  // decision changes from "keep fishing" to "this one has to land".
  const urgent = left != null && left < 10_000

  return (
    <div data-no-steer style={{
      position: 'absolute', top: 52, right: 12, zIndex: Z.hud,
      pointerEvents: 'none',
      padding: '0.34rem 0.62rem', borderRadius: 10,
      background: 'rgba(26,16,4,0.92)',
      border: `1px solid ${urgent ? 'rgba(255,132,96,0.75)' : 'rgba(255,190,96,0.42)'}`,
      boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
      textAlign: 'right', maxWidth: 190,
    }}>
      <p className="font-karla font-700 uppercase" style={{
        margin: 0, fontSize: '0.5rem', letterSpacing: '0.16em',
        color: 'rgba(255,206,138,0.72)',
      }}>{FINN_NAME}&rsquo;s bet</p>
      <p className="font-karla font-600" style={{
        margin: '1px 0 0', fontSize: '0.72rem', color: '#f0e2c8', lineHeight: 1.15,
      }}>{bet.targetText}</p>
      <p className="font-cinzel font-700" style={{
        margin: '2px 0 0', fontSize: '0.84rem',
        color: urgent ? '#ff9c78' : '#ffd07a',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {done}/{target}
        {left != null && ` · ${Math.floor(left / 1000)}s`}
      </p>
    </div>
  )
})

/**
 * FINN, WAITING.
 *
 * Deliberately NOT a TraderBoat with different data in it. A trader's plate
 * reads "Bait peddler" off KIND_LABEL, and there is no kind of trade that
 * describes him — putting him through that component would have meant adding a
 * sixth trader kind for a man who is not a trader, so the Salt Road's type would
 * have grown a member to describe the one person on the sea who is not on it.
 *
 * He does not drift. Everyone else out here is passing through and their hulls
 * are nudged every frame by the loop; he is somewhere on purpose, so his
 * position is plain `left`/`top` and no ref, and nothing in the 60fps loop
 * touches him at all.
 *
 * Counter-squashed like everything else with height — he stands ON the plane,
 * he is not painted onto it.
 */
const FinnBoat = memo(function FinnBoat({ at, isNear, ready, offering }: {
  at: { x: number; y: number }
  isNear: boolean
  /** A job of his is finished and waiting to be handed back. */
  ready?: boolean
  /** He has a beat or a job to hand out. Gold question mark, MMO style. */
  offering?: boolean
}) {
  return (
    <div style={{
      position: 'absolute', left: at.x, top: at.y,
      pointerEvents: 'none', zIndex: 3,
    }}>
      <div style={{ transform: `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.98)` }}>
        <TraderSkiff look={FINN_LOOK} />
      </div>

      {/* ── THE QUEST MARKER ────────────────────────────────────────
          The one piece of deliberately un-subtle UI on this chart, and it
          earns it: he is the fishing campaign's only delivery route, so a
          captain who cannot tell at a glance that he has something is a
          captain who does not get the story.

          A GOLD ? when he has a beat or a job to give, a GOLD ! when a job is
          finished and he is holding your pay. MMO shorthand, used on purpose,
          because it is shorthand everybody already reads.

          IT SITS ABOVE THE MAST AND NEVER ON HIM. Anchored well clear of
          HEAD_TOP and counter-squashed upward from its own bottom edge, so it
          grows away from the hull rather than down into it. The hail mark
          below is separate and only shows in range. */}
      {(offering || ready) && (
        <div aria-hidden style={{
          position: 'absolute', left: 0, top: HEAD_TOP - 96,
          transform: `translateX(-50%) scaleY(${1 / GROUND})`,
          transformOrigin: 'bottom center', pointerEvents: 'none',
        }}>
          <div className="finn-quest-mark" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 42, height: 42,
          }}>
            <span className="font-cinzel font-700" style={{
              fontSize: '2.3rem', lineHeight: 1,
              color: '#ffd24a',
              textShadow: [
                '0 0 3px rgba(60,36,0,1)', '0 2px 5px rgba(0,0,0,0.9)',
                '0 0 18px rgba(255,196,60,0.95)', '0 0 38px rgba(255,168,40,0.7)',
              ].join(', '),
              WebkitTextStroke: '1.5px rgba(70,42,0,0.85)',
            }}>{ready ? '!' : '?'}</span>
          </div>
        </div>
      )}

      {/* THE HAIL MARK. Same shape as a trader's and a warmer colour, which is
          the whole visual claim being made: he is a person you can talk to,
          and he is not one of the others.

          WHEN A JOB IS DONE IT SHOWS FROM ANYWHERE, not only in hail range. He
          is the campaign's forward gear and a captain who has finished the work
          has to be able to SEE that from across the water, or the reward for
          doing it is remembering to go and check. Bigger, brighter, a tick
          rather than an exclamation, and it pulses. */}
      {(isNear || ready) && (
        <div aria-hidden style={{
          position: 'absolute', left: 0, top: HEAD_TOP - (ready ? 40 : 32),
          transform: `translateX(-50%) scaleY(${1 / GROUND})`,
          transformOrigin: 'bottom center', pointerEvents: 'none',
        }}>
          <div className={ready ? 'sea-hail finn-ready' : 'sea-hail'} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: ready ? 34 : 26, height: ready ? 34 : 26, borderRadius: '50%',
            background: ready ? 'rgba(52,34,4,0.96)' : 'rgba(30,18,6,0.94)',
            border: `${ready ? 2 : 1}px solid rgba(255,206,110,0.98)`,
            boxShadow: ready
              ? '0 0 30px rgba(255,190,80,0.95), 0 0 60px rgba(255,168,60,0.5)'
              : '0 0 20px rgba(255,168,60,0.7)',
          }}>
            {ready ? (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                stroke="#ffd07a" strokeWidth="3.2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden><path d="M4.5 12.5l5 5 10-11" /></svg>
            ) : (
              <span className="font-cinzel font-700" style={{
                fontSize: '1.032rem', lineHeight: 1, color: '#ffd07a', marginTop: -1,
              }}>!</span>
            )}
          </div>
        </div>
      )}

      {/* THE PLATE. Below the hull and on a solid base, per the house rule that
          anything written over art gets an opaque base under it. */}
      <div style={{
        position: 'absolute', left: 0, top: HULL_BOTTOM + 2,
        transform: `translateX(-50%) scaleY(${1 / GROUND})`,
        transformOrigin: 'top center',
        textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
        padding: '3px 9px 4px', borderRadius: 9,
        background: 'rgba(14,8,2,0.9)',
        border: `1px solid rgba(255,190,96,${ready ? 0.95 : 0.45})`,
        boxShadow: ready ? '0 0 16px rgba(255,168,60,0.35)' : 'none',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.888rem', color: '#f4e2c0',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}>{FINN_NAME}</p>
      </div>
    </div>
  )
})

/**
 * THE POSITION THIS TAB LAST SAW, independent of the server round trip.
 *
 * sessionStorage, not localStorage: this is "where I am in this session", and
 * two tabs open on the same chart should not fight over one slot. It is also
 * wiped when the tab closes, which is correct — a cold start should ask the
 * server, since that is the copy another device would have updated.
 *
 * Stamped, and only trusted for half an hour. Not because a position rots, but
 * because a tab restored by the browser days later should defer to whatever the
 * account has been doing since.
 */
const POS_KEY = 'sea:pos2'
const POS_TTL = 30 * 60 * 1000

type SeaSide = 'fishing' | 'anchorage' | 'moored' | 'open'

/**
 * The snapshot carries THE SIDE, not just the coordinates — and the key is
 * versioned because the old shape did not.
 *
 * A position without its side is half a fact, and restoring half a fact is
 * where "coming back glitches half the time" came from: this synchronous
 * snapshot always beats the fire-and-forget server write home, so the POSITION
 * came from here while the SIDE came from whichever server write happened to
 * have landed. When the server lost the race a captain deep in the anchorage
 * came back as side 'fishing' with a northern y — which the old restore then
 * "fixed" by clamping to the wall. Whether you were put back where you were or
 * dumped on the reef was literally a race.
 */
function rememberPos(p: { x: number; y: number }, side: SeaSide) {
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify({ x: p.x, y: p.y, side, t: Date.now() }))
  } catch { /* private mode. The server copy still works, just less precisely. */ }
}

function recallPos(): { x: number; y: number; side: SeaSide } | null {
  try {
    const raw = sessionStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { x: number; y: number; side?: string; t: number }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    if (!(Date.now() - p.t < POS_TTL)) return null
    const side: SeaSide = p.side === 'anchorage' || p.side === 'moored' || p.side === 'open' ? p.side : 'fishing'
    return { x: p.x, y: p.y, side }
  } catch { return null }
}

const SeaMark = memo(function SeaMark({ m, i }: {
  m: { art: string; x: number; y: number; size: number; sway?: 'bob' | 'rock' }
  i: number
}) {
  const kind = markKind(m.art)
  const sub = SUBMERGE[kind]

  return (
    <div style={{ position: 'absolute', left: m.x, top: m.y, pointerEvents: 'none' }}>
      {/* ── WHERE IT MEETS THE WATER ──────────────────────────────────────
          NOTHING IS DRAWN UNDER IT — no ellipse, no ring, no "wash". The
          sprite's own base dissolving into the water IS the effect, and it is
          rendered by SubmergedSprite, which the /sea/waterline bench shares:
          the line is a drawn polyline per art, tuned by eye there, and the
          chart cannot render it differently than the bench showed it. */}
      {/* TWO WRAPPERS, because they carry different transforms. The outer one
          stands the landmark up off the plane; the inner one is free to sway
          without clobbering that. */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: m.size,
        transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center',
      }}>
        <SubmergedSprite art={m.art} width="100%" sub={sub}
          swayClass={m.sway ? `mark-${m.sway}` : undefined}
          delay={m.sway ? `${(i * 0.77) % 3}s` : undefined} />
      </div>
    </div>
  )
})

/**
 * ── THE ISLAND BAKERY ──────────────────────────────────────────────────────
 *
 * An island used to be ~14 stacked divs: three blurred shoal washes, a blurred
 * contact shadow, a cliff, and a top face holding five terrain bands, a crown,
 * nine canopy blobs, a rim light and an inset shadow — every one clipped by a
 * 160-point polygon, several carrying CSS blur() filters. All static, and all
 * re-RASTERISED by the browser whenever the tiles they sit in scroll back into
 * view or get evicted under memory pressure — which on a phone around the
 * Mainland (four big islands and the reef in one screen) is constantly. The
 * probe read it as raster hitches with a cheap loop: exactly the signature.
 *
 * So the static stack is painted ONCE into a canvas per island and shown as a
 * single image. The two breathing surf rings stay as DOM: they animate
 * transform/opacity under will-change, which composites from a texture
 * rasterised once, so they were never the problem.
 *
 * CSS blur() is reproduced by the downscale trick — draw the shape into a
 * small offscreen and scale it back up smoothed — rather than ctx.filter,
 * which iOS Safari only gained recently. It is not gaussian-exact; on soft
 * water washes nobody can tell.
 *
 * DPR is capped at 1.25: the art is deliberately soft, the Mainland's canvas
 * is over a thousand CSS pixels across, and full-retina raster for four big
 * islands is exactly the memory pressure this exists to relieve.
 */
const islandCache = new Map<string, HTMLCanvasElement>()

/**
 * ── THE PAINTED GROUND ──────────────────────────────────────────────────────
 *
 * The islands were smooth vector gradients sitting under hand-painted
 * buildings, and that reads as a sticker under a drawing. It gets reported as
 * "the perspective does not match", which it does: the light here already runs
 * from the upper left exactly as the buildings' does, and the ground plane's
 * GROUND squash is a 35 degree camera against their 30. What was missing was
 * not angle, it was SURFACE - a gradient has no brushwork in it, so there is
 * nothing for the eye to read as the same hand.
 *
 * So two painted textures are laid over the bands the gradients already
 * establish. OVER, never instead of: every fill below stays exactly as tuned,
 * and the texture goes on at partial strength in `overlay`, so the crown
 * highlight, the woods, the rim light and the coast shadow all still do their
 * modelling and the paint only gives them a surface to happen on.
 *
 * DRAWN TO FIT, NOT TILED. A generated texture is never truly seamless and a
 * visible repeat across an island is worse than no texture at all, so each one
 * is drawn once, scaled to cover, and rotated by the island's own seed so two
 * islands do not wear the same patch of grass.
 *
 * ASYNC INTO A SYNCHRONOUS BAKE. The bake is deliberately synchronous - it runs
 * in the ref callback so an island is painted in the frame it mounts rather
 * than a frame later. An image cannot be. So the first bake simply goes without
 * the texture, exactly as it does today, and when the files land the cache is
 * dropped and every mounted island repaints itself once.
 */
const GROUND_TEX: { turf?: HTMLImageElement; rock?: HTMLImageElement; done?: boolean } = {}
const groundWaiters = new Set<() => void>()

function requestGround(repaint: () => void) {
  if (GROUND_TEX.done) return
  groundWaiters.add(repaint)
  if (GROUND_TEX.turf) return
  if (typeof window === 'undefined') return

  let left = 2
  const settle = () => {
    if (--left > 0) return
    GROUND_TEX.done = true
    // Everything baked before the paint arrived was baked without it.
    islandCache.clear()
    for (const again of groundWaiters) again()
    groundWaiters.clear()
  }
  const load = (src: string, key: 'turf' | 'rock') => {
    const img = new Image()
    img.decoding = 'async'
    // A texture that never arrives must not leave the islands unpainted, so a
    // failure settles the same as a success and the gradients simply stand.
    img.onload = () => { GROUND_TEX[key] = img; settle() }
    img.onerror = settle
    img.src = src
  }
  GROUND_TEX.turf = new Image()   // claims the slot so this only runs once
  load('/sea/ground-turf.png', 'turf')
  load('/sea/ground-rock.png', 'rock')
}

/** The same string hash `coastline` uses, so an island's turf is turned by the
 *  same number that shaped its coast. */
function seedOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

/** Lay one texture over whatever is already on `g`, confined to the pixels
 *  that are already opaque. `seed` turns it so no two islands match. */
function paintGround(
  g: CanvasRenderingContext2D, img: HTMLImageElement | undefined,
  D: number, seed: number, alpha: number,
) {
  if (!img || !img.width) return
  g.save()
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = alpha
  g.translate(D / 2, D / 2)
  g.rotate((seed % 360) * Math.PI / 180)
  // NEAR ITS OWN SIZE, and this is the whole difference between paint and a
  // tint. It was drawn at D * 1.5, which for the Mainland blew a 768px texture
  // up to 1812 and then showed the island only the middle third of it: every
  // brush mark smeared past the point of being a mark, and the result was a
  // faint tonal wash indistinguishable from the gradient underneath.
  //
  // The land is about 0.68 of the box across, so this covers it roughly once at
  // the texture native resolution. Still generous enough that a rotation cannot
  // uncover a corner: the island sits inside a circle of radius 0.34 d and this
  // covers one of 0.39 d whichever way it is turned.
  const cover = D * 0.78
  g.drawImage(img, -cover / 2, -cover / 2, cover, cover)
  g.restore()
}

/**
 * THE SURF RINGS, pre-blurred at low resolution.
 *
 * Baked separately from the island because they MOVE: the breathing animation
 * needs its own element. But each ring was an island-sized blurred clipped div
 * promoted to its own GPU layer at device resolution — around the Mainland,
 * eight such layers, on the order of ninety megabytes of texture on an iPhone.
 * Past the compositor's budget it de-promotes and re-runs a Gaussian blur
 * through a 160-point clip per ring per frame. As a canvas the texture is the
 * backing store, and the backing store is drawn at half size — the content is
 * a blur, so the resolution is genuinely irrelevant.
 */
const surfCache = new Map<string, HTMLCanvasElement>()

function bakeSurf(id: string, d: number, scale: number, color: string, blurPx: number): HTMLCanvasElement {
  const key = `${id}:${d}:${scale}`
  const hit = surfCache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = Math.max(32, Math.round(d * 0.5))
  cv.height = cv.width
  const rs = coastline(id)
  const k = Math.max(2, Math.round(blurPx / 2))
  const small = document.createElement('canvas')
  small.width = Math.max(8, Math.round(cv.width / k))
  small.height = small.width
  const sg = small.getContext('2d')!
  const su = small.width / d
  sg.beginPath()
  for (let i = 0; i < rs.length; i++) {
    const a = (Math.PI * 2 * i) / rs.length
    const r = (rs[i] / 100) * d * scale * su
    const x = small.width / 2 + Math.cos(a) * r
    const y = small.height / 2 + Math.sin(a) * r
    if (i === 0) sg.moveTo(x, y); else sg.lineTo(x, y)
  }
  sg.closePath()
  sg.fillStyle = color
  sg.fill()
  const g = cv.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(small, 0, 0, cv.width, cv.height)
  surfCache.set(key, cv)
  return cv
}


function bakeIsland(id: string, d: number, locked: boolean, pad: number): HTMLCanvasElement {
  const key = `${id}:${d}:${locked ? 1 : 0}`
  const hit = islandCache.get(key)
  if (hit) return hit

  const dpr = Math.min(1.25, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const D = d + pad * 2
  const cv = document.createElement('canvas')
  cv.width = Math.round(D * dpr)
  cv.height = Math.round(D * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  const rs = coastline(id)
  const C = pad + d / 2

  /** Trace the coast at a scale of the island box, optionally offset. */
  const trace = (g: CanvasRenderingContext2D, scale: number, cx = C, cy = C) => {
    g.beginPath()
    for (let i = 0; i < rs.length; i++) {
      const a = (Math.PI * 2 * i) / rs.length
      const r = (rs[i] / 100) * d * scale
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.closePath()
  }

  /** A 165deg linear gradient across a band's bounding box, like the CSS. */
  const grad165 = (g: CanvasRenderingContext2D, scale: number, stops: [number, string][]) => {
    const R = d * scale * 0.63
    const lg = g.createLinearGradient(C - R * 0.26, C - R, C + R * 0.26, C + R)
    for (const [at, col] of stops) lg.addColorStop(at, col)
    return lg
  }

  /** The blur(): draw into an offscreen at 1/k scale, upscale smoothed. Two
   *  passes for the big radii so the softness has no visible steps. */
  const blurred = (draw: (g: CanvasRenderingContext2D, s: number) => void, blurPx: number) => {
    const k = Math.max(2, Math.min(10, Math.round(blurPx / 2)))
    const small = document.createElement('canvas')
    small.width = Math.max(8, Math.round((D * dpr) / k))
    small.height = small.width
    const sg = small.getContext('2d')!
    sg.scale((small.width / D), (small.width / D))
    draw(sg, 1)
    const mid = document.createElement('canvas')
    mid.width = Math.max(16, Math.round((D * dpr) / 2))
    mid.height = mid.width
    const mg = mid.getContext('2d')!
    mg.imageSmoothingQuality = 'high'
    mg.drawImage(small, 0, 0, mid.width, mid.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(mid, 0, 0, D, D)
  }

  // ── the shoal washes ─────────────────────────────────────────────
  for (const [scale, col, blur] of [
    [1.12, 'rgba(140,190,206,0.13)', 16],
    [0.98, 'rgba(168,204,216,0.22)', 8],
    [0.86, 'rgba(200,222,230,0.30)', 2],
  ] as [number, string, number][]) {
    blurred((g, _s) => { trace(g, scale); g.fillStyle = col; g.fill() }, blur)
  }

  // ── contact shadow, thrown toward the light's opposite ───────────
  blurred((g) => {
    trace(g, 0.78, C + ISLAND_LIFT * 0.34, C + ISLAND_LIFT * 0.5)
    g.fillStyle = 'rgba(2,10,18,0.42)'
    g.fill()
  }, 9)

  // ── cliff + top face, on their own layer so `locked` can grey them
  //    without touching the water ────────────────────────────────────
  const land = document.createElement('canvas')
  land.width = cv.width; land.height = cv.height
  const lg = land.getContext('2d')!
  lg.scale(dpr, dpr)
  const lift = ISLAND_LIFT / GROUND

  const traceL = (scale: number, dy = 0) => {
    lg.beginPath()
    for (let i = 0; i < rs.length; i++) {
      const a = (Math.PI * 2 * i) / rs.length
      const r = (rs[i] / 100) * d * scale
      const x = C + Math.cos(a) * r
      const y = C + dy + Math.sin(a) * r
      if (i === 0) lg.moveTo(x, y); else lg.lineTo(x, y)
    }
    lg.closePath()
  }

  // the cliff, dropped
  traceL(0.74, lift)
  lg.fillStyle = grad165(lg, 0.74, [[0, '#3b3226'], [0.55, '#2a2419'], [1, '#191509']])
  lg.fill()

  // Rock over the cliff, gently — it is in shadow and mostly edge, so the
  // texture is there to break the flat brown rather than to be read.
  paintGround(lg, GROUND_TEX.rock, D, seedOf(id) * 7, 0.3)

  // the face, lifted, everything inside clipped to it
  lg.save()
  traceL(0.74, -lift)
  lg.clip()
  const face = (scale: number, fill: string | CanvasGradient) => {
    traceL(0.74 * scale, -lift)
    lg.fillStyle = fill
    lg.fill()
  }
  face(10, grad165(lg, 0.74, [[0, '#b9a077'], [0.55, '#9c8259'], [1, '#7d6743']]))
  face(0.97, grad165(lg, 0.72, [[0, '#cbb590'], [1, '#b89c72']]))
  face(0.90, grad165(lg, 0.67, [[0, '#d8c49f'], [1, '#c2a97e']]))
  face(0.81, grad165(lg, 0.60, [[0, '#9aa269'], [1, '#7d8850']]))
  face(0.70, grad165(lg, 0.52, [[0, '#6f8a4e'], [0.62, '#55703c'], [1, '#466032']]))

  // TURF OVER ALL FIVE BANDS AT ONCE, inside the face clip that is still open,
  // so the beach reads as sand and the middle as grass without either needing
  // its own texture. The crown, the woods and the rim light are drawn after
  // this and keep sitting on top, which is the whole reason it goes on here
  // rather than last.
  paintGround(lg, GROUND_TEX.turf, D, seedOf(id), 0.42)

  // the crown — higher ground catching the light
  {
    const R = d * 0.74 * 0.48 * 0.63
    const cx = C - R * 0.2, cy = C - lift - R * 0.55
    const rg = lg.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35)
    rg.addColorStop(0, 'rgba(190,206,140,0.55)')
    rg.addColorStop(0.48, 'rgba(150,176,105,0.22)')
    rg.addColorStop(0.78, 'rgba(150,176,105,0)')
    lg.fillStyle = rg
    lg.fillRect(0, 0, D, D)
  }

  // the woods — the same nine seeded clumps the DOM drew
  {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 37 + id.charCodeAt(i)) >>> 0
    let st = h || 1
    const nx = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 0x100000000 }
    const faceD = d * 0.74
    for (let i = 0; i < 9; i++) {
      const a = nx() * Math.PI * 2
      const rad = 4 + nx() * 19
      const bx = C + ((Math.cos(a) * rad) / 100) * faceD
      const by = C - lift + ((Math.sin(a) * rad * 0.9) / 100) * faceD
      const rw = ((7 + nx() * 11) / 100) * faceD
      const o = 0.20 + nx() * 0.26
      const gx = bx - rw * 0.08, gy = by - rw * 0.13
      const rg = lg.createRadialGradient(gx, gy, 0, gx, gy, rw * 0.78)
      rg.addColorStop(0, `rgba(74,102,52,${o + 0.18})`)
      rg.addColorStop(0.55, `rgba(46,68,34,${o})`)
      rg.addColorStop(0.78, 'rgba(40,58,30,0)')
      lg.save()
      lg.translate(bx, by)
      lg.scale(1, 0.82)
      lg.translate(-bx, -by)
      lg.fillStyle = rg
      lg.beginPath()
      lg.arc(bx, by, rw, 0, Math.PI * 2)
      lg.fill()
      lg.restore()
    }
  }

  // rim light where the sky hits the top edge
  {
    const top = C - lift - d * 0.74 * 0.63
    const rim = lg.createLinearGradient(0, top, 0, top + d * 0.74 * 1.26 * 0.2)
    rim.addColorStop(0, 'rgba(240,248,250,0.34)')
    rim.addColorStop(1, 'rgba(240,248,250,0)')
    lg.fillStyle = rim
    lg.fillRect(0, 0, D, D)
  }

  // the inset shadow the DOM did with box-shadow: a fat blurred stroke on the
  // coast, of which the clip keeps only the inner half
  lg.lineWidth = 64
  lg.strokeStyle = 'rgba(0,0,0,0.34)'
  lg.filter = 'blur(0px)'
  traceL(0.74, -lift)
  lg.stroke()
  lg.lineWidth = 26
  lg.strokeStyle = 'rgba(0,0,0,0.22)'
  lg.stroke()

  // brightness(0.94)-ish
  lg.fillStyle = 'rgba(12,16,12,0.06)'
  lg.fillRect(0, 0, D, D)
  lg.restore()

  if (locked) {
    lg.globalCompositeOperation = 'saturation'
    lg.fillStyle = 'rgb(120,120,120)'
    lg.fillRect(0, 0, D, D)
    lg.globalCompositeOperation = 'source-atop'
    lg.fillStyle = 'rgba(0,0,0,0.45)'
    lg.fillRect(0, 0, D, D)
    lg.globalCompositeOperation = 'source-over'
  }

  ctx.drawImage(land, 0, 0, D, D)
  islandCache.set(key, cv)
  return cv
}

/**
 * A PIECE OF LAND, painted.
 *
 * Everything that makes an island look like an island and nothing that makes it
 * a PLACE: no buildings, no label, no dock. Sized entirely by its parent — every
 * layer in here is an absolute inset in percent, so the caller decides how big
 * the rock is and this decides what it looks like.
 *
 * Pulled out of `PlaceIsland` when the discoverable isles arrived. They are the
 * same land: same coastline generator, same terrain bands, same surf, same
 * extrusion. Copying 130 lines of tuned layers to a second component would have
 * meant two islands that drift apart on the first edit, and this stack has been
 * measured and re-measured (see THE COASTLINE) in a way that is not worth doing
 * twice.
 *
 * `id` is the seed. Two things with the same id are the same rock, and every
 * shape on this chart is therefore stable across renders and reloads.
 */
const Landmass = memo(function Landmass({ id, r, locked = false }: {
  id: string
  /** The island's radius in world px — the canvas needs real pixels where the
   *  old div stack lived on percentages. */
  r: number
  /** Greys the land out, for water a captain has not levelled into. */
  locked?: boolean
}) {
  const d = r * 2
  // Room for the widest shoal wash (inset -6%) plus the blur's own spill.
  const pad = Math.round(d * 0.08) + 24

  // Drawn via ref callback rather than an effect so the island is painted in
  // the same frame it mounts — an effect leaves one frame of open water where
  // the Mainland is about to be.
  const blit = (el: HTMLCanvasElement | null) => {
    if (!el) return
    const paint = () => {
      const baked = bakeIsland(id, d, locked, pad)
      if (el.width !== baked.width) { el.width = baked.width; el.height = baked.height }
      const g = el.getContext('2d')
      g?.clearRect(0, 0, el.width, el.height)
      g?.drawImage(baked, 0, 0)
    }
    paint()
    // AND AGAIN WHEN THE PAINT ARRIVES. The first pass is the gradients alone,
    // in this frame, because an island appearing a frame late is worse than an
    // island appearing untextured. `requestGround` is a no-op once the files
    // are in, so a later mount pays nothing and repaints nobody.
    requestGround(paint)
  }

  const blitSurf = (scale: number, color: string, blur: number) =>
    (el: HTMLCanvasElement | null) => {
      if (!el) return
      const baked = bakeSurf(id, d, scale, color, blur)
      if (el.width !== baked.width) { el.width = baked.width; el.height = baked.height }
      const g = el.getContext('2d')
      g?.clearRect(0, 0, el.width, el.height)
      g?.drawImage(baked, 0, 0)
    }

  return (
    <>
      {/* THE SURF, UNDER THE LAND — same paint order the div stack had. Only
          the rim outside the coast shows; the island covers the rest. The
          classes keep the two rings breathing out of phase, on transform and
          opacity, over a texture a fraction of the old layers' size. */}
      <canvas ref={blitSurf(0.82, 'rgba(226,244,250,0.30)', 7)} aria-hidden
        className="sea-surf" style={{
          position: 'absolute', inset: 0, width: d, height: d, pointerEvents: 'none',
        }} />
      <canvas ref={blitSurf(0.772, 'rgba(240,250,255,0.55)', 2.5)} aria-hidden
        className="sea-surf sea-surf-2" style={{
          position: 'absolute', inset: 0, width: d, height: d, pointerEvents: 'none',
        }} />

      {/* THE WHOLE STATIC ISLAND, one image, over the surf. See the bakery
          above for the fourteen layers this replaced and why. */}
      <canvas ref={blit} aria-hidden style={{
        position: 'absolute', left: -pad, top: -pad,
        width: d + pad * 2, height: d + pad * 2,
        pointerEvents: 'none',
      }} />
    </>
  )
})


/**
 * THE BERTH, PAINTED — the circle of water inBerth tests, made visible.
 *
 * A ring lying ON the plane (the world transform squashes it into the same
 * ellipse every zone edge gets) with three BEACONS standing on it — harbour
 * lights on piles, the one warm colour on the chart and the thing you steer
 * for at distance (the jetty lantern used to be that; the jetty is gone and
 * the job moved out here, onto the water the prompt actually owns). Drawn,
 * not sprited: a dark pile counter-squashed off the plane with a lamp at its
 * head and a smear of that light lying on the water at its foot, which is
 * what a light standing IN water does.
 *
 * The ring brightens and turns solid, and the lamps flare, when the boat is
 * actually inside — the same signal, at the same moment, as the action button
 * offering the dock.
 */
const Beacon = memo(function Beacon({ x, y, active }: { x: number; y: number; active: boolean }) {
  return (
    <div aria-hidden style={{ position: 'absolute', left: x, top: y }}>
      {/* the light lying on the water — squashed with the plane, under the pile */}
      <div style={{
        position: 'absolute', left: -30, top: -18, width: 60, height: 36, borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,196,110,${active ? 0.30 : 0.16}) 0%, rgba(255,196,110,0) 68%)`,
        transition: 'background 300ms ease-out',
      }} />
      {/* the pile, standing up off the plane like every jetty post */}
      <div style={{
        position: 'absolute', left: -2.5, bottom: 0,
        transform: `scaleY(${1 / GROUND})`, transformOrigin: 'bottom center',
        width: 5, height: 26, borderRadius: 1,
        background: 'linear-gradient(180deg, #4a3a24, #241b0f)',
      }} />
      {/* the lamp at its head */}
      <div style={{
        position: 'absolute', left: -4.5, top: -(26 / GROUND) - 7,
        width: 9, height: 9, borderRadius: '50%',
        background: '#ffd986',
        boxShadow: `0 0 ${active ? 20 : 11}px ${active ? 6 : 3}px rgba(255,196,110,${active ? 0.55 : 0.3})`,
        transition: 'box-shadow 300ms ease-out',
      }} />
    </div>
  )
})

const PortBerth = memo(function PortBerth({ p, active }: { p: Place; active: boolean }) {
  const b = berthOf(p)
  const bearing = Math.atan2(b.y - p.y, b.x - p.x)
  return (
    <div aria-hidden style={{ position: 'absolute', left: b.x, top: b.y, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: -b.r, top: -b.r, width: b.r * 2, height: b.r * 2,
        borderRadius: '50%',
        border: `2px ${active ? 'solid' : 'dashed'} ${active ? 'rgba(255,217,134,0.7)' : 'rgba(226,244,250,0.26)'}`,
        background: active ? 'rgba(255,206,120,0.05)' : 'none',
        boxShadow: active ? 'inset 0 0 40px rgba(255,196,110,0.16)' : 'none',
        transition: 'border-color 300ms ease-out, background 300ms ease-out, box-shadow 300ms ease-out',
      }} />
      {[-0.95, 0, 0.95].map((off, i) => {
        const a = bearing + off
        return <Beacon key={i} x={Math.cos(a) * b.r} y={Math.sin(a) * b.r} active={active} />
      })}
    </div>
  )
})

/**
 * THE END OF THE SURVEYED CHART.
 *
 * Says why you stopped, once, and gets out of the way. It has to say something:
 * a boat that simply refuses to go further with no explanation is the invisible
 * wall the north edge used to be, and that read as the edge of a LEVEL rather
 * than the edge of a world.
 *
 * No art, on purpose. The north is walled with rock because there is land up
 * there; out here there is nothing to build a wall out of that would not be
 * inventing geology. What stops you is the map, so what says so is a line.
 *
 * Never eats a tap — you are usually still holding the stick when it appears.
 */
const EdgeOfChart = memo(function EdgeOfChart({ at }: { at: boolean }) {
  return (
    <AnimatePresence>
      {at && (
        <motion.div aria-hidden
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 96,
            zIndex: Z.crossing, display: 'flex', justifyContent: 'center',
            pointerEvents: 'none', padding: '0 1rem',
          }}>
          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.72rem', letterSpacing: '0.34em', margin: 0,
            color: 'rgba(214,232,240,0.82)',
            textShadow: '0 2px 16px rgba(0,0,0,0.95)',
          }}>The chart ends here</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
})

/**
 * THE SIGN OVER THE GAP.
 *
 * The reef used to have a Harbour island parked beside it whose only job was to
 * be the thing labelled "expeditions". Nobody sailed there, because the way to
 * expeditions was never the island, it was the hole in the rock. So the island
 * is gone and the hole is labelled instead.
 *
 * Drawn in the WORLD rather than as a HUD element, so it sits over the actual
 * opening and grows and shrinks with the camera the way the gap does. Anything
 * pinned to the screen would be a caption about the gap; this is a sign on it.
 *
 * Counter-squashed and lifted clear, like every other label on this chart —
 * a label was never lying on the water.
 */
/**
 * THE SIGN OVER THE SORTIE, and the placeholder standing in for whatever
 * eventually marks it.
 *
 * Same idiom as the arch's sign: drawn in the WORLD, counter-squashed, lifted
 * clear of the plane. It grows and shrinks with the camera because it is on the
 * gap rather than being a caption about the gap.
 *
 * Two markers flank the mouth at exactly SORTIE_HALF, so the opening's width is
 * a thing you can SEE rather than a number you discover by bumping into rock.
 * The arch does not need this — it is a literal hole in a literal reef — but
 * the anchorage rim is invisible water, and an invisible wall with an invisible
 * door in it is a bad chart.
 */
/**
 * THE TWO DOCKS, and the boat left at one of them.
 *
 * Drawn in the world like every other structure, and submerged by SeaMark's own
 * rule so the piles go into the water rather than standing on it.
 *
 * THE MOORED FISHING BOAT is the point of the raid dock. Leaving her out of the
 * picture would make the swap a menu state — you would be told your boat was
 * waiting and have to take it on trust. Tied up where you left her, it is a
 * fact you can see from across the harbour.
 */
const Docks = memo(function Docks({ shipOut, near, shipTier }: {
  /** Is the expedition ship out being sailed? Her berth shows her only while
   *  she is actually in it. */
  shipOut: boolean
  near: 'raid' | 'voyage' | null
  shipTier: number
}) {
  return (
    <>
      {([['raid', RAID_DOCK, '/sea/dock-raids.png', 'Raids'],
         ['voyage', VOYAGE_DOCK, '/sea/dock-voyages.png', 'Voyages']] as const).map(([id, d, art, label]) => (
        <div key={id}>
          {/* The raid dock draws a shade larger: it is the hub that houses
              your ship, and the new art is built like one — the hierarchy
              between the two berths should be readable at a glance. */}
          <SeaMark m={{ art, x: d.x, y: d.y, size: DOCK_R * (id === 'raid' ? 3.0 : 2.6) }} i={id === 'raid' ? 1400 : 1401} />
          {/* The name, counter-squashed and lifted clear like every label on
              this chart. Brighter when you are alongside, because that is the
              one moment it is telling you something you did not know. */}
          <div aria-hidden style={{
            position: 'absolute', left: d.x, top: d.y - DOCK_R * 0.9,
            transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
            transformOrigin: 'bottom center', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            <p className="font-cinzel font-700" style={{
              fontSize: '1rem', letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0,
              textAlign: 'center', marginRight: '-0.18em',
              color: near === id ? 'rgba(255,226,170,0.95)' : 'rgba(214,226,236,0.6)',
              textShadow: '0 2px 14px rgba(0,0,0,0.98)',
            }}>{label}</p>
          </div>
        </div>
      ))}

      {/* ── HER BERTH ─────────────────────────────────────────────────
          The expedition ship, tied up in the wide berth her dock was painted
          with, whenever she is not out being sailed. She disappears from here
          the moment you board — she is your sprite now — and the berth simply
          stands empty until you bring her back.

          The fishing boat is deliberately NOT drawn here while you are out.

          FULL SAILED SIZE, not the trawl fleet's moored 0.71. She is the same
          object you will be steering ten seconds after boarding, and the two
          renders can be seen within moments of each other — a hull that grows
          a third when you step onto it reads as a swap, not a boarding. The
          smacks get away with moored-scale because you never sail one. */}
      {!shipOut && (
        <div style={{
          // AGAINST THE PIER. The dock's SeaMark anchors the art's BOTTOM (the
          // pile feet) at RAID_DOCK.y; pulling her centre a quarter-radius
          // NORTH of that lays her hull along the piles with her sails over
          // the pier's front face — moored at the loading face, which faces
          // the camera. Mocked against the real plates at 1:1 before the
          // number was chosen. She paints after the dock in this fragment, so
          // she reads in front of the planking she is tied to.
          position: 'absolute', left: RAID_DOCK.x - DOCK_R * 0.05, top: RAID_DOCK.y - DOCK_R * 0.25,
          transform: `translate(-50%, -50%) scaleY(${1 / GROUND})`,
          pointerEvents: 'none', opacity: 0.95,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={getShip(shipTier).seaImageUrl} alt="" draggable={false} decoding="async"
            width={640} height={640} style={{
              width: WARSHIP_W, height: 'auto', display: 'block',
              filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.5))',
              // The berth shows her exactly as the helm will.
              ...(getShip(shipTier).seaFlip ? { transform: 'scaleX(-1)' } : null),
            }} />
        </div>
      )}
    </>
  )
})

/**
 * THE HOMESTEAD PORTAL'S RING, on the water.
 *
 * A hotspot, not a building: it lies ON the plane (no counter-squash — it is
 * a shape the water makes, like the fishing hotspots), you can sail straight
 * through it, and doing so is what opens it.
 *
 * It wears the deepest band it can reach: each tier's accent is the
 * destination band's own palette, so an upgraded portal visibly deepens. The
 * standing stones at the rim are the only vertical part, and they carry the
 * counter-squash the flat ring must not have.
 */
const PortalRing = memo(function PortalRing({ tier }: { tier: number }) {
  const t = PORTAL_TIERS.find(p => p.tier === tier) ?? PORTAL_TIERS[0]
  /**
   * PAINTED, one plate per tier, and every plate is a HOLLOW ring.
   *
   * The art is a top-down sigil lying on the water — no arch, no standing
   * stones, nothing vertical — because the one thing this structure must
   * never look like is a wall. The centre is open in the PNG itself, so the
   * boat visibly sails INTO the ring, floats inside it while the sheet is up,
   * and out the far side. The world layer's squash turns the flat circle into
   * the right ellipse for free.
   *
   * Each tier is its own painting, escalating from a pale ring of lights to
   * the Ancient Deep's glyph-dense masterwork — the upgrade is the art now,
   * not a tint on one shape. The CSS keeps only two jobs: the slow breathe,
   * and the tier-5 core light, which reads better as living glow than as
   * paint.
   *
   * The CROSSING radius stays PORTAL.r whatever the plate looks like — a
   * hitbox that grows with cosmetics is how cosmetics stop being cosmetic.
   */
  return (
    <div aria-hidden style={{ position: 'absolute', left: PORTAL.x, top: PORTAL.y, pointerEvents: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/sea/portal-t${t.tier}.png`} alt="" draggable={false}
        width={640} height={640} decoding="async" loading="lazy"
        className="sea-portal-swirl"
        style={{
          position: 'absolute', left: -PORTAL.r * 1.15, top: -PORTAL.r * 1.15,
          width: PORTAL.r * 2.3, height: 'auto', maxWidth: 'none', display: 'block',
        }} />
      {tier >= 5 && (
        <div className="sea-portal-core" style={{
          position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: '50%',
          background: `radial-gradient(circle, ${t.accent}ee 0%, ${t.accent}55 55%, transparent 75%)`,
          boxShadow: `0 0 26px ${t.accent}aa`,
        }} />
      )}
      {/* ── THE RIM FLAMES, tiers 4 and 5 — and they burn ──────────────
          Drawn by the chart, not painted into the plates: paint cannot
          flicker, and a flame that does not move is a lamp. CSS, not a
          sprite, after the sprite route came back with the model's own
          transparency checkerboard baked through the glow — at this size a
          two-gradient flame is indistinguishable from paint, tints itself
          from the tier's accent, and cannot come back dithered.

          Each stands at the rim, counter-squashed like everything vertical,
          flickering on transform and opacity only, with a prime-ish delay
          stride so no two ever sync up — twelve flames breathing in step is
          machinery. */}
      {tier >= 4 && Array.from({ length: tier >= 5 ? 12 : 8 }, (_, k) => {
        const count = tier >= 5 ? 12 : 8
        const rad = ((k / count) * 360 - 90) * (Math.PI / 180)
        const size = tier >= 5 ? 30 : 22
        return (
          <div key={k} style={{
            position: 'absolute',
            left: Math.cos(rad) * PORTAL.r, top: Math.sin(rad) * PORTAL.r,
            transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
            transformOrigin: 'bottom center',
          }}>
            <div className="sea-flame" style={{
              width: size * 0.62, height: size,
              ['--flame' as string]: t.accent,
              animationDelay: `${(k * 0.53) % 2.1}s`,
            }} />
          </div>
        )
      })}
      <div style={{
        position: 'absolute', left: 0, top: -PORTAL.r - 30,
        transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center', whiteSpace: 'nowrap',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '1rem', letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0,
          textAlign: 'center', marginRight: '-0.18em',
          color: `${t.accent}dd`,
          textShadow: '0 2px 14px rgba(0,0,0,0.98)',
        }}>The Portal</p>
      </div>
    </div>
  )
})

/**
 * THE CHARGE — the ring become a cylinder.
 *
 * World-anchored at the portal, not screen-anchored at the boat: the eye is
 * 80px wide, so a hull activating at its edge is visibly off the ring's
 * centre, and a beam around the HULL there reads as the boat catching fire
 * rather than the portal firing. The painted band is the cylinder's
 * footprint — the column is exactly the ring's outer diameter, so the ring
 * IS the base of the tube.
 *
 * Geometry comes free twice. The flat pool is squashed into the right
 * ellipse by the world layer itself; the column counter-squashes like every
 * standing thing, so inside the squashed world it stands at true height. And
 * because it lives in the world it scales with the camera, as a structure
 * should — the screen version hovered at one size over every zoom.
 *
 * The cylinder is sold by the same two cheap facts as before: brightest at
 * its EDGES (a lit tube seen from outside), and light streaming UPWARD
 * inside it on a doubled, transform-only streak layer.
 */
const PortalBeam = memo(function PortalBeam({ tier }: { tier: number }) {
  const t = PORTAL_TIERS.find(pt => pt.tier === tier) ?? PORTAL_TIERS[0]
  const W = PORTAL.r * 2
  return (
    <motion.div aria-hidden
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      style={{ position: 'absolute', left: PORTAL.x, top: PORTAL.y, pointerEvents: 'none' }}>

      {/* The ring flaring: a flat pool matched to the painted band. */}
      <motion.div
        initial={{ scale: 0.55, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: -W / 2, top: -W / 2,
          width: W, height: W, borderRadius: '50%',
          border: `3px solid ${t.accent}dd`,
          background: `radial-gradient(circle, transparent 52%, ${t.accent}2e 68%, ${t.accent}14 82%, transparent 94%)`,
          boxShadow: `0 0 34px ${t.accent}77, inset 0 0 40px ${t.accent}44`,
        }} />

      {/* The column, standing on the band. Counter-squashed: inside the
          squashed world it rises at true height and rides the zoom. */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center',
        width: W, height: 470,
      }}>
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: [0.2, 0.9, 0.3, 1] }}
          style={{
            position: 'absolute', inset: 0,
            transformOrigin: 'bottom center',
            background: `linear-gradient(90deg, transparent 0%, ${t.accent}5c 6%, ${t.accent}1a 26%, ${t.accent}0e 50%, ${t.accent}1a 74%, ${t.accent}5c 94%, transparent 100%)`,
            maskImage: 'linear-gradient(to top, #000 0%, #000 42%, transparent 96%)',
            WebkitMaskImage: 'linear-gradient(to top, #000 0%, #000 42%, transparent 96%)',
            overflow: 'hidden',
          }}>
          <div className="sea-beam-streaks" style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: '200%',
            background: `repeating-linear-gradient(0deg, transparent 0px, transparent 22px, ${t.accent}40 22px, ${t.accent}40 30px, transparent 30px, transparent 44px, rgba(255,255,255,0.22) 44px, rgba(255,255,255,0.22) 48px)`,
          }} />
        </motion.div>
      </div>
    </motion.div>
  )
})

const SortieSign = memo(function SortieSign() {
  return (
    <div aria-hidden style={{
      position: 'absolute', left: SORTIE.x, top: SORTIE.y - 150,
      transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
      transformOrigin: 'bottom center', whiteSpace: 'nowrap', pointerEvents: 'none',
    }}>
      {/* THE LAMP POLES ARE GONE. They were standing in for a wall that did not
          exist: with the rim invisible, two markers were the only way to see
          how wide the opening was. The harbour has a rock shore now and two
          headland stacks framing this gap, so the poles were a second set of
          markers for a mouth that already had them. The arch does not have
          them either, and this should read as the same kind of place. */}
      {/* The same centring correction the arch's sign needs: letter-spacing
          adds its gap after the last letter too, so the word hangs half a
          space right of true until it is cancelled. */}
      <p className="font-cinzel font-700" style={{
        fontSize: '1.4rem', letterSpacing: '0.24em', textTransform: 'uppercase',
        color: 'rgba(255,226,170,0.9)', margin: 0,
        textAlign: 'center', marginRight: '-0.24em',
        textShadow: '0 2px 16px rgba(0,0,0,0.98), 0 0 34px rgba(0,0,0,0.8)',
      }}>The Sortie</p>
      <div style={{
        height: 1, width: SORTIE_HALF, margin: '7px auto 0',
        background: 'linear-gradient(90deg, transparent, rgba(255,214,140,0.5), transparent)',
      }} />
      <p className="font-karla font-600" style={{
        fontSize: '0.82rem', letterSpacing: '0.1em', textAlign: 'center',
        color: 'rgba(226,212,186,0.66)', margin: '5px 0 0',
        textShadow: '0 1px 12px rgba(0,0,0,0.98)',
      }}>Expedition ships only</p>
    </div>
  )
})

const GateSign = memo(function GateSign({ to }: { to: string }) {
  return (
    <div aria-hidden style={{
      position: 'absolute', left: GATE_X, top: NORTH_WALL - 210,
      transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
      transformOrigin: 'bottom center', whiteSpace: 'nowrap', pointerEvents: 'none',
    }}>
      {/* CENTRED, and it needs saying because it was not.
          Two things were pushing it left. The rule below is GATE_HALF * 1.5
          wide, which is wider than the word, so the wrapper takes ITS width and
          a `<p>` with no alignment sits flush left inside it. And letter-spacing
          adds its gap AFTER the last letter too, so even once centred the word
          hangs half a space right of true. `textAlign` fixes the first,
          `marginRight` cancels the second. */}
      <p className="font-cinzel font-700" style={{
        fontSize: '1.5rem', letterSpacing: '0.24em', textTransform: 'uppercase',
        color: 'rgba(226,240,248,0.88)', margin: 0,
        textAlign: 'center', marginRight: '-0.24em',
        textShadow: '0 2px 16px rgba(0,0,0,0.98), 0 0 34px rgba(0,0,0,0.8)',
      }}>{to}</p>
      {/* A rule under it, the width of the passage, so the word reads as
          belonging to THAT gap and not to the reef in general. */}
      <div style={{
        height: 1, width: GATE_HALF * 1.5, margin: '7px auto 0',
        background: 'linear-gradient(90deg, transparent, rgba(214,232,240,0.5), transparent)',
      }} />
      <p className="font-karla font-600" style={{
        fontSize: '0.82rem', letterSpacing: '0.1em', textAlign: 'center',
        color: 'rgba(196,216,230,0.66)', margin: '5px 0 0',
        textShadow: '0 1px 12px rgba(0,0,0,0.98)',
      }}>Sail through the gap</p>
    </div>
  )
})

/**
 * SOMEBODY ELSE'S BOAT.
 *
 * The outer node is placed at the origin and MOVED BY TRANSFORM from the frame
 * loop, exactly like the trader patrols and the drifting bottles: React is told
 * when a friend arrives or leaves and never that they moved. Their position
 * updates twice a second at most, and re-rendering a composite of eight sprites
 * on every one of those would be visible.
 *
 * `Skipper` is the player's own boat component, unchanged. That is the whole
 * point — you see what they see, so the hull they saved for and the hat they
 * picked are the hull and hat you meet on the water.
 */
const FriendBoat = memo(function FriendBoat({ friend, refs }: {
  friend: FriendAtSea
  refs: React.RefObject<Map<string, HTMLElement>>
}) {
  return (
    <div
      ref={el => {
        if (el) refs.current?.set(friend.username, el)
        else refs.current?.delete(friend.username)
      }}
      style={{
        position: 'absolute', left: 0, top: 0, zIndex: Z.boat,
        willChange: 'transform', pointerEvents: 'none',
      }}>
      {/* The hull, counter-squashed — it stands ON the plane, it is not painted
          onto it. This is only the FIRST frame's value; the loop rewrites this
          same property every frame and the two have to agree, or the boat
          changes shape the moment it is handed over. */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        transform: `translate(-50%, -50%) scaleY(${1 / GROUND})`,
      }}>
        <Skipper
          characterColor={friend.characterColor}
          boatId={friend.boatId}
          hatId={friend.hatId}
          gear={friend.gear}
          frame="rest"
        />
      </div>

      {/* THEIR NAME, over the boat and counter-squashed like every other label
          on this chart. Without it two friends in the same water are two boats
          and you have to guess. */}
      <div style={{
        position: 'absolute', left: 0, top: -96,
        transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center', whiteSpace: 'nowrap',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.98rem', color: '#dfeaf2', margin: 0,
          textShadow: '0 2px 12px rgba(0,0,0,0.95)',
        }}>{friend.username}</p>
        {/* Only once they have gone quiet. A number that is always there reads
            as a warning; one that appears after a minute reads as information. */}
        {friend.ago > 60 && (
          <p className="font-karla" style={{
            fontSize: '0.72rem', margin: 0, textAlign: 'center',
            color: 'rgba(198,216,230,0.6)', textShadow: '0 1px 9px rgba(0,0,0,0.95)',
          }}>last seen {Math.round(friend.ago / 60)}m ago</p>
        )}
      </div>
    </div>
  )
})



/**
 * SOMEBODY CAME OUT, OR WENT IN.
 *
 * A compass arrow is only useful if you are already looking at the edge of the
 * screen, and it says nothing at the moment that matters — when a friend casts
 * off while you are halfway to the Abyss. This is that moment, once, and then
 * it is gone.
 *
 * Never eats a tap: you are usually steering when it appears.
 */
const CrewNews = memo(function CrewNews({ news, onDone }: {
  news: { name: string; joined: boolean } | null
  onDone: () => void
}) {
  useEffect(() => {
    if (!news) return
    const t = setTimeout(onDone, 3600)
    return () => clearTimeout(t)
  }, [news, onDone])

  return (
    <AnimatePresence>
      {news && (
        <motion.div
          key={`${news.name}:${news.joined}`}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.4 } }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: 0, right: 0, top: 92, zIndex: Z.hud,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 1rem',
          }}>
          <p className="font-karla font-700" style={{
            margin: 0, padding: '0.42rem 0.9rem', borderRadius: 999, fontSize: '0.84rem',
            color: news.joined ? '#dff0e6' : 'rgba(206,222,214,0.85)',
            background: 'rgba(8,18,15,0.92)',
            border: `1px solid ${news.joined ? 'rgba(150,206,172,0.5)' : 'rgba(150,206,172,0.22)'}`,
            textShadow: '0 1px 10px rgba(0,0,0,0.9)',
          }}>
            {news.joined ? `${news.name} has put to sea` : `${news.name} has gone in`}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
})

/**
 * WHOSE HOMESTEAD TO LOOK AT.
 *
 * Every captain's island is at the same coordinates, so visiting cannot be a
 * matter of sailing somewhere else — you sail to the island and choose whose it
 * is. Picking one re-renders the island under you: their lighthouse, their
 * gallery, their gardens, seen from the water before you ever go ashore.
 *
 * Mutual crew only, and the list is built server-side. The pick is checked
 * again when it is made, because this list can be minutes old.
 */
const VisitPicker = memo(function VisitPicker({ open, guests, visiting, onClose, onPick }: {
  open: boolean
  guests: Visitable[]
  visiting: string | null
  onClose: () => void
  onPick: (username: string | null) => void
}) {
  if (!open) return null
  return (
    <div onClick={e => { e.stopPropagation(); onClose() }} data-no-steer
      style={{
        position: 'fixed', inset: 0, zIndex: Z.helm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', background: 'rgba(2,8,14,0.72)',
      }}>
      <div onClick={e => e.stopPropagation()} data-no-steer
        style={{
          width: '100%', maxWidth: 380, borderRadius: 18, padding: '1.15rem',
          background: 'rgba(10,16,22,0.98)',
          border: '1px solid rgba(180,214,232,0.28)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.62rem', letterSpacing: '0.16em', margin: 0,
          color: 'rgba(180,214,232,0.7)',
        }}>Call on</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.3rem', color: '#f2ead8', margin: '0.15rem 0 0.2rem',
        }}>Whose island is this?</p>
        <p className="font-karla" style={{
          fontSize: '0.8rem', color: 'rgba(196,214,228,0.62)', margin: '0 0 0.8rem',
        }}>Anyone you both follow, who has built something.</p>

        <div style={{ display: 'grid', gap: 6, maxHeight: '46vh', overflowY: 'auto' }}>
          <button type="button" onClick={() => onPick(null)}
            className="font-karla font-700"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '0.6rem 0.8rem', borderRadius: 12, textAlign: 'left',
              color: visiting === null ? '#0d1520' : 'rgba(226,238,246,0.9)',
              background: visiting === null ? '#f0c464' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${visiting === null ? '#f0c464' : 'rgba(255,255,255,0.14)'}`,
              cursor: 'pointer', fontSize: '0.9rem',
            }}>
            Yours
          </button>
          {guests.map(g => (
            <button key={g.username} type="button" onClick={() => onPick(g.username)}
              className="font-karla font-700"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, padding: '0.6rem 0.8rem', borderRadius: 12, textAlign: 'left',
                color: visiting === g.username ? '#0d1520' : 'rgba(226,238,246,0.9)',
                background: visiting === g.username ? '#f0c464' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${visiting === g.username ? '#f0c464' : 'rgba(255,255,255,0.14)'}`,
                cursor: 'pointer', fontSize: '0.9rem',
              }}>
              <span>{g.username}</span>
              <span style={{ fontWeight: 400, fontSize: '0.76rem', opacity: 0.75 }}>
                {g.house} · {g.built}/6 built
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})

/**
 * A BOTTLE, DRIFTING.
 *
 * Registers its node in the map's ref table and then never re-renders: the frame
 * loop writes a transform on it, the same way the traders are moved. Anything
 * that drifts on this chart drifts that way, because drifting through React at
 * 60fps is how you turn a calm sea into a dropped frame.
 *
 * Small. It is 96 world pixels against a 210px boat, which is about right for a
 * bottle and is also the point — you are meant to half-notice it and turn back,
 * not have it announced.
 */
const SeaBottle = memo(function SeaBottle({ bottle, refs }: {
  bottle: Bottle
  refs: React.RefObject<Map<string, HTMLElement>>
}) {
  return (
    <div
      ref={el => {
        if (el) refs.current?.set(bottle.key, el)
        else refs.current?.delete(bottle.key)
      }}
      style={{
        position: 'absolute', left: bottle.x, top: bottle.y,
        willChange: 'transform', pointerEvents: 'none',
      }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, width: 96,
        transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img decoding="async" src="/sea/sea-bottle.png" alt="" draggable={false} loading="lazy"
          className="mark-bob"
          style={{
            width: '100%', maxWidth: 'none', display: 'block',
            // Half under, like everything else that floats. A bottle rides low.
            maskImage: 'linear-gradient(to bottom, #000 64%, rgba(0,0,0,0.28) 68%, rgba(0,0,0,0.14) 82%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 64%, rgba(0,0,0,0.28) 68%, rgba(0,0,0,0.14) 82%, transparent 100%)',
            animationDelay: `${(bottle.seed % 300) / 100}s`,
          }} />
      </div>
    </div>
  )
})

/**
 * THE WATER OVER SOMETHING BURIED.
 *
 * The ONLY cue a dig site ever gets, and it exists so that sailing across one
 * by accident is possible. Without it a site you hold no bearing for is
 * genuinely invisible and might as well not have been placed.
 *
 * NOT a marker and not a ring. A discrete shape drawn on the water is the same
 * mistake as a shadow under a rock: it says "an object is here" in a language
 * the chart uses for objects. This is a patch of water that is the wrong
 * colour, with no edge anywhere, which is what a shoal over a buried thing
 * actually looks like from a deck.
 *
 * Flat on the plane, deliberately un-counter-squashed: it IS lying down.
 */
const DigWater = memo(function DigWater({ site, over, done }: {
  site: DigSite
  /** Close enough to dig. Firms up, so the last hundred metres reads. */
  over: boolean
  done: boolean
}) {
  const r = DIG_HINT_RANGE
  return (
    <div aria-hidden style={{
      position: 'absolute', left: site.x, top: site.y,
      width: r * 2, height: r * 2 * GROUND,
      marginLeft: -r, marginTop: -r * GROUND,
      pointerEvents: 'none',
      // Warmer and paler than the water round it, as though the bottom is
      // closer here. Stronger once you are over it, and nearly gone once the
      // hole has been dug — a worked site keeps a scar, not an invitation.
      background: done
        ? 'radial-gradient(ellipse, rgba(120,140,150,0.10) 0%, rgba(120,140,150,0.04) 42%, transparent 70%)'
        : over
          ? 'radial-gradient(ellipse, rgba(214,196,142,0.20) 0%, rgba(190,178,140,0.10) 40%, transparent 70%)'
          : 'radial-gradient(ellipse, rgba(196,186,150,0.10) 0%, rgba(180,176,150,0.05) 44%, transparent 72%)',
      filter: 'blur(26px)',
      transition: 'background 600ms ease-out',
    }} />
  )
})

/**
 * WHAT YOU FOUND.
 *
 * One panel for both, because from the deck they are the same moment: you
 * stopped, you looked at something, here is what it was. Three faces —
 * a fragment somebody wrote, a bearing to go and dig, and the haul itself.
 */
const FindPanel = memo(function FindPanel({ state, onClose }: {
  state: { kind: 'bottle'; result: BottleResult } | { kind: 'dig'; result: DigResult } | null
  onClose: () => void
}) {
  if (!state) return null
  // Narrowed off `state.result` at every step rather than through a local
  // alias. TypeScript does not track that `state.kind` and `state.result` move
  // together, so aliasing the result first widens it back to the union and
  // every field access below becomes an error.
  const err = !state.result.ok ? state.result.error : null
  const haul = state.kind === 'dig' && state.result.ok ? state.result : null
  const note = state.kind === 'bottle' && state.result.ok ? state.result : null
  const bearing = note && note.kind === 'bearing' ? note : null

  return (
    <div onClick={e => { e.stopPropagation(); onClose() }} data-no-steer
      style={{
        position: 'fixed', inset: 0, zIndex: Z.helm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', background: 'rgba(2,8,14,0.72)',
      }}>
      <div onClick={e => e.stopPropagation()} data-no-steer
        style={{
          position: 'relative', width: '100%', maxWidth: 420,
          borderRadius: 18, padding: '1.15rem',
          background: 'rgba(10,16,22,0.98)',
          border: '1px solid rgba(180,214,232,0.28)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
            color: '#cfcabf', cursor: 'pointer',
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        {err ? (
          <p className="font-karla" style={{ fontSize: '0.95rem', color: '#e6b9b9', margin: 0, paddingRight: 34 }}>
            {err}
          </p>
        ) : haul ? (
          <>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.16em', margin: 0,
              color: 'rgba(255,206,138,0.75)', paddingRight: 34,
            }}>Dug up</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.35rem', color: '#f2ead8', margin: '0.15rem 0 0.6rem', paddingRight: 34,
            }}>{haul.name}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img decoding="async" src="/sea/dig-box.png" alt="" draggable={false} style={{
              display: 'block', width: 168, margin: '0 auto 0.5rem',
            }} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.1rem', marginBottom: '0.9rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#c9a6ff', margin: 0 }}>
                ◆ {haul.gems.toLocaleString()}
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f0c464', margin: 0 }}>
                ⟡ {haul.doubloons.toLocaleString()}
              </p>
            </div>
            <p className="font-karla" style={{
              fontSize: '0.92rem', lineHeight: 1.55, margin: 0, textAlign: 'center',
              color: 'rgba(206,216,224,0.78)',
            }}>{haul.found}</p>
          </>
        ) : note ? (
          <>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.16em', margin: 0,
              color: 'rgba(150,206,172,0.8)', paddingRight: 34,
            }}>A bottle, out of the water</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.2rem', color: '#f2ead8', margin: '0.15rem 0 0.7rem', paddingRight: 34,
            }}>{bearing ? 'There is a chart in it' : 'There is a note in it'}</p>

            <div style={{
              borderRadius: 12, padding: '0.85rem 0.95rem',
              background: 'rgba(232,222,198,0.08)',
              border: '1px solid rgba(232,222,198,0.18)',
            }}>
              {note.text.split('\n\n').map((para, i) => (
                <p key={i} className="font-karla" style={{
                  fontSize: '0.93rem', lineHeight: 1.55, margin: i ? '0.6rem 0 0' : 0,
                  color: 'rgba(226,232,238,0.88)',
                }}>{para}</p>
              ))}
            </div>

            {bearing && (
              <div style={{
                marginTop: '0.85rem', borderRadius: 12, padding: '0.85rem 0.95rem',
                background: 'rgba(255,206,138,0.09)',
                border: '1px solid rgba(255,206,138,0.28)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img decoding="async" src="/sea/bearing-chart.png" alt="" draggable={false}
                    style={{ width: 52, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{
                      fontSize: '1.02rem', color: '#f6e6c6', margin: 0,
                    }}>{bearing.name}</p>
                    <p className="font-karla" style={{
                      fontSize: '0.88rem', lineHeight: 1.45, margin: '0.2rem 0 0',
                      color: 'rgba(238,222,190,0.86)',
                    }}>{bearing.bearing}</p>
                  </div>
                </div>
                <p className="font-karla" style={{
                  fontSize: '0.8rem', margin: '0.6rem 0 0',
                  color: 'rgba(214,196,150,0.72)',
                }}>Marked on your chart. Nothing is showing above the water out there, so go by the numbers.</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
})

/**
 * BEEN ASHORE.
 *
 * A drawn mark, not an emoji — emoji are never UI icons here, and a glyph would
 * also be at the mercy of whatever the device decides ✓ looks like.
 *
 * On its own disc, because this sits over painted land: pale sand, dark grass
 * and open water all pass underneath it as you sail, and a bare stroke would
 * disappear against one of them. The disc is dark and the tick is light, which
 * survives all three.
 *
 * Muted green rather than gold. Gold on this chart means "there is something
 * here for you" — the unclaimed chests, the trader hails, the minimap rings —
 * and a finished isle is the one thing that is explicitly NOT asking.
 */
const AshoreTick = memo(function AshoreTick() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" role="img" aria-label="Been ashore"
      style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>
      <circle cx="12" cy="12" r="11" fill="rgba(10,22,18,0.82)" stroke="rgba(150,206,172,0.75)" strokeWidth="1.6" />
      <path d="M7 12.4l3.2 3.2L17 8.8" fill="none" stroke="#9fdcb6" strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
})

/**
 * ONE DISCOVERABLE ISLE.
 *
 * The same `Landmass` the ports are painted with, at a fraction of the size,
 * with one thing standing on it. That is the whole component — an isle is not a
 * port and deliberately has none of a port's furniture: no dock, no buildings,
 * no permanent label. What tells you it is worth crossing to is the chest.
 *
 * ── WHAT IT SHOWS, AND WHEN ─────────────────────────────────────────────────
 *
 * A cache you have not found shows a CLOSED chest, and which chest depends on
 * how far out you are — the ornate barnacled one from the Deep outward. Once
 * you have been ashore it shows the OPEN one, spilled and empty, which is the
 * only marker of "done" on the chart and needs no words.
 *
 * A note isle shows the post either way. The note does not leave with you; the
 * rock still has it, and you can read it again.
 *
 * The NAME is withheld until you are close, or until you have landed. A chart
 * that labels every rock you have never visited has answered the question the
 * isles exist to ask.
 */
const IsleRock = memo(function IsleRock({ isle, found, isNear }: {
  isle: Isle
  found: boolean
  isNear: boolean
}) {
  const d = isle.r * 2
  const art = isle.kind === 'note'
    ? '/sea/isle-note.png'
    : found ? '/sea/isle-chest-open.png' : chestArt(isle)

  // The prop's width, as a share of the island. Scaling with the rock keeps
  // every isle reading at the same "distance" — a fixed size would make the
  // small ones look like they had a shipping container on them.
  //
  // SIZED AGAINST THE BOAT, which is the only object out here whose scale
  // anybody knows: 210px, and it is moored a few lengths away while you look at
  // this. The first pass used 0.62, which put the chest at 123px on a big isle
  // — more than half the length of the boat beside it, and a third of the
  // island it was sitting on. 0.30 lands it around 1/3.5 of the boat, which is
  // a box two crew could carry between them.
  //
  // The post takes a smaller share again because its art is TALL (0.55 wide as
  // it is high), so the same factor buys nearly twice the height.
  const propW = isle.r * (isle.kind === 'note' ? 0.24 : 0.30)

  return (
    <div style={{
      position: 'absolute', left: isle.x, top: isle.y,
      width: d, height: d, marginLeft: -isle.r, marginTop: -isle.r,
      pointerEvents: 'none',
    }}>
      <Landmass id={isle.id} r={isle.r} />

      {/* WHAT IS ON IT.
          Counter-squashed and anchored at its BOTTOM, like every other solid on
          this chart, then raised by the island's own lift so it stands on the
          top face rather than floating at the waterline. Set slightly back from
          centre: a thing sitting dead in the middle of a disc reads as placed,
          and these are supposed to have been left. */}
      <div style={{
        position: 'absolute', left: '50%', top: '54%', width: propW,
        transform: `translate(-50%, -100%) translateY(${-ISLAND_LIFT / GROUND}px) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img decoding="async" src={art} alt="" draggable={false} loading="lazy" style={{
          width: '100%', maxWidth: 'none', display: 'block',
          filter: found ? 'saturate(0.86) brightness(0.94)' : 'none',
        }} />
      </div>

      {/* THE NAME. Counter-squashed and lifted clear, because a label was never
          lying on the water. Only once you are near it, or have been. */}
      {(isNear || found) && (
        <div style={{
          position: 'absolute', left: '50%', top: '-6%',
          transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
          transformOrigin: 'bottom center', whiteSpace: 'nowrap',
        }}>
          {/* THE TICK sits ON the name, which is the line you actually read
              when you are deciding whether to steer over. It used to be a
              second line saying "Been ashore", which meant the answer to "have
              I done this one" was a word you had to stop and read, one rock at
              a time. A mark you can take in without reading is the whole job.

              With the tick carrying it, the line underneath goes back to the
              band name in both states, so the label reads identically whether
              or not you have landed and only the mark changes. */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {found && <AshoreTick />}
            <p className="font-cinzel font-700" style={{
              fontSize: '1.02rem', color: found ? 'rgba(226,232,224,0.82)' : '#f2ead8', margin: 0,
              textShadow: '0 2px 12px rgba(0,0,0,0.95)',
            }}>{isle.name}</p>
          </div>
          <p className="font-karla" style={{
            fontSize: '0.78rem', margin: 0, textAlign: 'center',
            color: found ? 'rgba(168,200,176,0.7)' : 'rgba(255,206,138,0.86)',
            textShadow: '0 1px 9px rgba(0,0,0,0.95)',
          }}>{bandName(isle.band)}</p>
        </div>
      )}
    </div>
  )
})

/**
 * WHAT WAS ON THE ISLAND.
 *
 * Deliberately quiet. The crate-opening moment already exists elsewhere in this
 * game and is a whole production; this is a rock with a box on it, and dressing
 * it to the same level would make twenty seven of them exhausting.
 *
 * Three things it can be showing: a haul, a note, or "you have had this one".
 * The last is not an error and is not styled as one — a captain who taps a rock
 * they cleared last week should get the note back, not a scolding.
 */
const AshorePanel = memo(function AshorePanel({ state, onClose }: {
  state: { isle: Isle; result: AshoreResult } | null
  onClose: () => void
}) {
  if (!state) return null
  const { isle, result } = state
  const won = result.ok && !result.already ? result : null
  const note = result.ok ? result.note : null

  return (
    <div
      onClick={e => { e.stopPropagation(); onClose() }}
      data-no-steer
      style={{
        position: 'fixed', inset: 0, zIndex: Z.helm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', background: 'rgba(2,8,14,0.72)',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        data-no-steer
        style={{
          position: 'relative', width: '100%', maxWidth: 420,
          borderRadius: 18, padding: '1.15rem',
          // OPAQUE. This sits over painted water, and a translucent panel on
          // art is unreadable however much you blur what is behind it.
          background: 'rgba(10,16,22,0.98)',
          border: '1px solid rgba(180,214,232,0.28)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        {/* OUT, in the same corner as every other close on this chart. */}
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
            color: '#cfcabf', cursor: 'pointer',
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.62rem', letterSpacing: '0.16em', margin: 0,
          color: 'rgba(255,206,138,0.75)', paddingRight: 34,
        }}>{bandName(isle.band)}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.35rem', color: '#f2ead8', margin: '0.15rem 0 0.7rem',
          paddingRight: 34,
        }}>{isle.name}</p>

        {!result.ok ? (
          <p className="font-karla" style={{ fontSize: '0.95rem', color: '#e6b9b9', margin: 0 }}>
            {result.error}
          </p>
        ) : (
          <>
            {won && (won.gems > 0 || won.doubloons > 0) && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img decoding="async" src="/sea/isle-chest-open.png" alt="" draggable={false} style={{
                  display: 'block', width: 132, margin: '0 auto 0.5rem',
                }} />
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: '1.1rem',
                  marginBottom: note ? '0.9rem' : '0.2rem',
                }}>
                  {won.gems > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#c9a6ff', margin: 0 }}>
                      ◆ {won.gems.toLocaleString()}
                    </p>
                  )}
                  {won.doubloons > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f0c464', margin: 0 }}>
                      ⟡ {won.doubloons.toLocaleString()}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ── AND THE THING THAT IS NOT COIN ───────────────────────
                Six isles hold the only copy of a homestead furnishing. Given
                its own line and its own colour rather than sitting beside the
                gems, because the gems are the same gems you get everywhere and
                this is the only one of these in the world. */}
            {won?.salvage && (
              <div style={{
                margin: '0 auto 0.9rem', maxWidth: 300,
                padding: '0.6rem 0.8rem', borderRadius: 12,
                background: 'rgba(18,42,32,0.9)',
                border: '1px solid rgba(150,206,172,0.45)',
              }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.54rem', letterSpacing: '0.18em', margin: '0 0 3px',
                  color: 'rgba(150,206,172,0.85)',
                }}>Salvaged</p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.05rem', color: '#dff0e6', margin: 0,
                }}>{won.salvage.name}</p>
                <p className="font-karla" style={{
                  fontSize: '0.74rem', color: 'rgba(196,222,206,0.8)', margin: '3px 0 0',
                }}>Nobody sells one. It is waiting at the Homestead.</p>
              </div>
            )}

            {result.already && !note && (
              <p className="font-karla" style={{ fontSize: '0.95rem', color: 'rgba(196,214,226,0.8)', margin: 0 }}>
                You have had this one already. The chest is where you left it.
              </p>
            )}

            {note && (
              <div style={{
                borderRadius: 12, padding: '0.85rem 0.95rem',
                background: 'rgba(232,222,198,0.08)',
                border: '1px solid rgba(232,222,198,0.18)',
              }}>
                <p className="font-cinzel font-700" style={{
                  fontSize: '0.98rem', color: '#e8dec6', margin: '0 0 0.45rem',
                }}>{note.title}</p>
                {/* The body carries its own paragraph breaks. Split rather than
                    white-space: pre-wrap, so the gap between paragraphs is a
                    real margin and not a stray blank line. */}
                {note.body.split('\n\n').map((para, i) => (
                  <p key={i} className="font-karla" style={{
                    fontSize: '0.93rem', lineHeight: 1.55, margin: i ? '0.6rem 0 0' : 0,
                    color: 'rgba(226,232,238,0.88)',
                  }}>{para}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
})

/** MEMOISED. The loop pokes React four times a second to update proximity and
 *  the compass, and without this every island rebuilt its whole subtree —
 *  coastline clip, drift blobs, cliff and all — on each of those ticks
 *  for a result that had not changed. */
/**
 * THE ONE ISLAND THAT IS DIFFERENT FOR EVERYBODY.
 *
 * Every other place on this chart is the same for every captain, so its
 * buildings are written down in chart.ts. The Homestead's are whatever that
 * captain has actually built, so the Place is rebuilt here with them dropped in.
 *
 * A shallow swap rather than a new concept: `homeBuildings` returns exactly the
 * shape `PLACES.buildings` already has, at the same percent coordinates, so
 * PlaceIsland never learns that one of its islands is special.
 */
/**
 * THE CREW HALL'S OWN BUILDINGS.
 *
 * The same shallow swap `homeFor` does, and for the same reason: the island is
 * the same island for everybody, but what stands on it is what you have paid
 * for. Hall, drill yard and stores each run 1..6 and each has its own art.
 *
 * Clamped rather than trusted. A profile carrying a tier this build has no art
 * for would otherwise put a broken image in the middle of an island.
 */
function crewHallFor(p: Place, tiers: { hall: number; drill: number; stores: number }): Place {
  if (p.id !== 'crew_hall') return p
  const t = (n: number) => Math.max(1, Math.min(6, Math.round(n || 1)))
  return {
    ...p,
    // THE SAME COORDINATES THE PLACEHOLDERS IN chart.ts CARRY, and they have
    // to be: scripts/check-islands measures what is written down there, so if
    // these drifted the checker would certify a layout the game never draws.
    // The coastline is seeded and asymmetric — the west side of this island is
    // tighter than the east, which is why the drill yard sits further in than
    // the stores rather than mirroring it.
    buildings: [
      { art: `/crew/hall_${t(tiers.hall)}.png`, x: 50, y: 50, scale: 0.28 },
      { art: `/crew/drill_${t(tiers.drill)}.png`, x: 36, y: 60, scale: 0.15 },
      { art: `/crew/stores_${t(tiers.stores)}.png`, x: 64, y: 60, scale: 0.15 },
    ],
  }
}

function homeFor(p: Place, h: Homestead, guest?: string): Place {
  if (p.id !== 'home') return p
  return {
    ...p,
    buildings: homeBuildings(h),
    // WHOSE IT IS, on the island's own label. Visiting has to be legible from
    // the water or you are standing on somebody else's lighthouse wondering
    // when you built it.
    name: guest ? `${guest}'s Homestead` : p.name,
    blurb: guest ? builtAt(h, 'house').name : p.blurb,
  }
}

const PlaceIsland = memo(function PlaceIsland({ place, locked, waiting = 0 }: {
  place: Place; locked: boolean
  /** Crew standing on this dock with a haul. Only the Trawl Docks ever pass a
   *  non-zero value; every other island ignores it. */
  waiting?: number
}) {
  const isWater = place.kind === 'water'
  const d = place.r * 2

  return (
    <div style={{
      position: 'absolute', left: place.x, top: place.y,
      width: d, height: d, marginLeft: -place.r, marginTop: -place.r,
      pointerEvents: 'none',
    }}>
      {isWater ? (
        /* NO SHAPE AT ALL, AND NO DRIFT EITHER.
           seaAt already blends the whole background toward this zone's colour
           as you approach, so the Shallows shade into open blue and open blue
           shades into the near-black of the Abyss the way a real shelf does.
           Anything with an edge drawn on top of that puts back the doorway the
           blend exists to remove.

           The DRIFT used to go here: a ring of pale foam scattered between 22%
           and 88% of the radius. It was solving "open water has nothing in it
           to read at speed", which was true when this was empty colour — but a
           pale scatter arranged in a ring around a zone centre IS an outline,
           and it was drawing the boundary the whole design is built to hide.
           There are landmarks and traders out here now, so it is not needed and
           it was never harmless. */
        <>
          {/* ── WHAT BREAKS THE SURFACE ─────────────────────────────────
              Placed in world offsets from the zone centre and standing UP off
              the plane, counter-squashed like everything else with height. Each
              one gets a soft ellipse at its foot: it is sitting IN water, and
              without something where it meets the surface it reads as pasted
              on rather than floating in. */}
          {locked && (
            /* Weather, not a wall. A locked water is one you can SEE is bad:
               squall streaks that fade out with no boundary anywhere. */
            <div aria-hidden style={{
              position: 'absolute', inset: '4%',
              background: 'repeating-linear-gradient(58deg, rgba(150,164,178,0.13) 0 8px, transparent 8px 22px)',
              maskImage: 'radial-gradient(circle, #000 20%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 20%, transparent 72%)',
            }} />
          )}
        </>
      ) : (
        <>
          <Landmass id={place.id} r={place.r} locked={locked} />

          {/* ── WHAT IS BUILT HERE ──────────────────────────────────────
              Counter-squashed and anchored at the BOTTOM, so each building
              stands up out of the plane and grows from where it meets the
              ground rather than from its middle. Ordered back to front in the
              chart, so the ones further down the island overlap the ones
              behind them the way a hillside town does. */}
          {/* ── THE TOWN LIGHTS UP ────────────────────────────────────────
              The grade takes the whole world down after dark. This is the one
              thing that comes UP, and it is what turns a dimmer into nightfall:
              a warm pool over the buildings that is nothing at noon and full by
              the middle of the night.

              Driven by `--sea-night`, which the frame loop publishes on the
              chart's wrapper whenever the light moves. So it costs one custom
              property write per step of the fade and no React render at all,
              and it sits UNDER the buildings on purpose — a glow painted over
              them would wash the art out; behind them it reads as the windows
              throwing light onto the ground they stand on.

              Not on water zones, which have no buildings to light. */}
          {!isWater && place.buildings && place.buildings.length > 0 && (
            <div aria-hidden style={{
              position: 'absolute', left: '50%', top: '52%',
              width: '78%', height: '52%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              // PITCHED TO SURVIVE THE GRADE. This glow lives inside the world
              // layer, so the same brightness() that darkens the island darkens
              // the light on it too — about 40% of it at full night. The alphas
              // are set for what is left after that, not for what they look
              // like on their own.
              background: 'radial-gradient(ellipse at center,'
                + ' rgba(255,198,116,0.66) 0%,'
                + ' rgba(255,178,92,0.32) 42%,'
                + ' rgba(255,160,70,0) 72%)',
              opacity: 'var(--sea-night, 0)',
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }} />
          )}

          {place.buildings?.map((b, i) => (
            <Fragment key={i}>
              {/* NOTHING IS DRAWN UNDER A BUILDING. SIXTH TIME.
                  There was a contact ellipse here, and the long note that used
                  to sit in its place had already been through a dark blob, a
                  pale one, and a counter-squash bug that parked it below the
                  feet. It was finally flat, foreshortened, warm and centred on
                  the base — and it still read as a smudge under a house.

                  It is the same objection the landmarks settled: a discrete
                  shape beneath an object says "this thing is ABOVE that thing",
                  whatever tint you give it. The buildings sit on painted grass
                  that is already shaded; they do not need help. If one ever
                  reads as floating, the answer is in the ART, not underneath
                  it. */}
              <div style={{
                position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
                width: d * b.scale,
                transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
                transformOrigin: 'bottom center',
                filter: locked ? 'grayscale(0.9) brightness(0.5)' : 'none',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img decoding="async" src={b.art} alt="" draggable={false}
                  style={{ width: '100%', display: 'block' }} />
              </div>
            </Fragment>
          ))}

          {/* No jetty, no lantern. Both were drawn here once — a plank run
              and a warm light at its end — and both read as a brown log with
              a dot. The berth's own beacons are the harbour lights now, and
              they stand where the prompt actually is. */}
        </>
      )}

      {/* PORTS ONLY. A port is a thing with a name board on it. A water is not:
          its name used to hang in the middle of the sea like a label on a map,
          which is exactly the map-not-place feeling the blend was undoing. The
          water tells you where you are by its colour, and the banner at the top
          says it in words when you cross. */}
      {/* SOMEBODY IS WAITING HERE.
          A warm bloom on the island itself, so it reads at the distance you
          actually see the chart from — long before the name plate is legible.
          Inside the world layer and unsquashed on purpose: it is light lying on
          a place, and it should foreshorten with the plane like the shore does. */}
      {waiting > 0 && (
        <div aria-hidden className="sea-dock-ready" style={{
          position: 'absolute', left: '50%', top: '50%',
          width: place.r * 3, height: place.r * 3,
          marginLeft: -place.r * 1.5, marginTop: -place.r * 1.5,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(240,192,64,0.30) 0%, rgba(240,192,64,0.13) 42%, rgba(240,192,64,0.04) 66%, transparent 76%)',
        }} />
      )}

      {!isWater && (
        <div style={{
          position: 'absolute', left: '50%', top: '100%',
          // COUNTER-SQUASHED. It sits inside the world layer so it travels with
          // its island, but it is a label, not a thing lying on the water —
          // left on the plane it renders 58% tall and unreadable.
          transform: `translate(-50%, 8px) scaleY(${1 / GROUND})`,
          transformOrigin: 'top center',
          textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          {/* THE COUNT, above the name. Plain words rather than a bare number
              on a pip: "2 crew back" is a thing that happened, "2" is a badge
              you have to remember the meaning of. */}
          {waiting > 0 && (
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '1rem', letterSpacing: '0.1em', marginBottom: 3,
              color: '#f0c040', textShadow: '0 1px 10px rgba(0,0,0,0.95)',
            }}>
              {waiting} crew back
            </p>
          )}
          {/* ── SIZED FOR THE ZOOM IT IS READ AT ─────────────────────────
              These live in the world layer, so the camera scales them: a
              phone sits at about 0.5x, which turned a 1.15rem name into nine
              pixels on the glass — a name plate you had to sail up to. The
              rem sizes here are chosen for what they become AFTER the zoom:
              ~14px on a phone, ~23px on a desktop, which is a sign you can
              steer by rather than a caption you squint at.

              Deliberately NOT counter-scaled to constant screen size. Every
              label on this chart grows and shrinks with the world it is
              nailed to — that is what makes it a sign on a place rather than
              UI floating over one. */}
          <p className="font-cinzel font-700" style={{
            fontSize: '1.75rem', lineHeight: 1.1,
            color: locked ? 'rgba(180,192,200,0.55)' : '#eef4f8',
            textShadow: '0 2px 14px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)',
          }}>{place.name}</p>
          <p className="font-karla font-600" style={{
            fontSize: '1.02rem', marginTop: 2,
            color: locked ? 'rgba(206,152,152,0.8)' : 'rgba(192,210,224,0.8)',
            textShadow: '0 1px 10px rgba(0,0,0,0.92)',
          }}>{locked ? `Fishing ${place.minLevel}` : place.blurb}</p>
        </div>
      )}
    </div>
  )
})


/**
 * WHERE YOU ARE, along the top.
 *
 * Replaces the zone names that used to hang in the middle of the sea like
 * labels on a map — which was the map-not-place feeling the colour blend exists
 * to undo. The water already tells you where you are; this says it in words
 * only when it changes, then gets out of the way.
 *
 * It brightens on the crossing and then settles to something you can read if
 * you go looking but never notice otherwise. Two jobs, one element: "you have
 * entered somewhere new" and "what am I in".
 */

/**
 * THE SKY, AS ONE SHAPE.
 *
 * Four glyphs, warm for light and cold for dark, so the corner reads without
 * being read. Dusk and dawn are the same half-disc on a horizon line mirrored
 * about the vertical — one sinking, one climbing — which is the only pair that
 * genuinely needs telling apart and the only pair a colour alone could not.
 */
function PhaseGlyph({ phase, size = 16 }: { phase: SeaPhase; size?: number }) {
  const g = PHASE_GLYPH[phase]
  const warm = g === 'sun' || g === 'setting' || g === 'rising'
  const c = warm ? '#ffd986' : '#9fb6ff'
  const glow = warm ? 'rgba(255,217,134,0.55)' : 'rgba(159,182,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      style={{ filter: `drop-shadow(0 0 5px ${glow})` }}>
      {g === 'sun' && (
        <>
          <circle cx="12" cy="12" r="4.4" fill={c} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
            <line key={a} x1="12" y1="3.4" x2="12" y2="5.6"
              stroke={c} strokeWidth="1.9" strokeLinecap="round"
              transform={`rotate(${a} 12 12)`} />
          ))}
        </>
      )}
      {g === 'moon' && (
        // A crescent cut from one disc by another, so it needs no mask and
        // stays a crescent at 16px where a thin arc would grey out.
        <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" fill={c} />
      )}
      {(g === 'setting' || g === 'rising') && (
        <g transform={g === 'rising' ? 'scale(-1 1) translate(-24 0)' : undefined}>
          {/* Half a disc above the waterline, with the arrow of its travel. */}
          <path d="M6.5 15a5.5 5.5 0 0 1 11 0z" fill={c} />
          <line x1="3.5" y1="18.4" x2="20.5" y2="18.4" stroke={c} strokeWidth="1.9" strokeLinecap="round" />
          <path d={g === 'setting' ? 'M12 4.2v4.2M10.1 6.6 12 8.6l1.9-2' : 'M12 8.4V4.2M10.1 6 12 4l1.9 2'}
            stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}

/**
 * A HOTSPOT ON THE WATER.
 *
 * Drawn in the world layer, so it is squashed by the ground plane like
 * everything else on the surface and reads as a patch of sea rather than a
 * circle stuck to the screen.
 *
 * Deliberately soft-edged. A hard ring would be a hitbox you line up with; a
 * bloom you can see from a distance is something you steer toward, and the
 * exact boundary does not matter because the patch is hundreds of pixels
 * across. The pulse is slow — this sits on screen for ten minutes and anything
 * quicker becomes a thing you want to look away from.
 */
const HotspotRing = memo(function HotspotRing({ h }: { h: Hotspot }) {
  const def = HOTSPOT_DEFS[h.kind]
  const g = TIER_GLOW[h.tier]
  const hex = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')
  // COLOUR SAYS WHAT, BRIGHTNESS SAYS HOW MUCH. A Black Trench and a Cold
  // Trench are the same purple; one of them is plainly worth crossing water
  // for. Both readable before any text is.
  const c = def.color
  return (
    <div aria-hidden className={`sea-hotspot ${g.pulse}`} style={{
      position: 'absolute', left: h.x, top: h.y,
      width: h.r * 2, height: h.r * 2,
      marginLeft: -h.r, marginTop: -h.r,
      borderRadius: '50%',
      background:
        `radial-gradient(circle, ${c}${hex(g.fill)} 0%, ` +
        `${c}${hex(g.fill * 0.55)} ${Math.round(30 + g.spread * 30)}%, ` +
        `${c}${hex(g.fill * 0.2)} ${Math.round(58 + g.spread * 18)}%, transparent 80%)`,
      // The rim is a hint at an edge, never the edge — the patch is hundreds of
      // pixels across and a hard line would be a hitbox to line up with.
      boxShadow: `inset 0 0 0 ${1 + h.tier}px ${c}${hex(g.rim)}`,
      pointerEvents: 'none',
    }} />
  )
})

/** The badge that says what you are standing in. */
function HotspotBadge({ spot, compact }: { spot: Hotspot | null; compact: boolean }) {
  const [left, setLeft] = useState('')
  useEffect(() => {
    if (!spot) return
    const tick = () => {
      const ms = spot.endsAt - Date.now()
      if (ms <= 0) { setLeft('moving on'); return }
      const m = Math.floor(ms / 60_000)
      setLeft(m >= 1 ? `${m}m left` : `${Math.ceil(ms / 1000)}s left`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [spot])

  return (
    <AnimatePresence>
      {spot && (
        <motion.div key={spot.key}
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          style={{
            position: 'absolute', zIndex: Z.hud, pointerEvents: 'none',
            // COMPACT sits top-LEFT under the phase glyph, out of the centre
            // column entirely — the catch card, the jackpot pill and the reroll
            // button all live down the middle and there is no room there.
            // Full size is centred under the water's name, where you meet it.
            ...(compact
              ? { top: 52, left: 12, display: 'flex' }
              : { top: 62, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 1rem' }),
          }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: compact ? 7 : 9,
            padding: compact ? '0.3rem 0.6rem' : '0.5rem 0.85rem', borderRadius: 999,
            // A SOLID base. This sits over painted water and the one moment it
            // has something to say is the moment it must be readable.
            background: 'rgba(6,14,22,0.9)',
            border: `1px solid ${HOTSPOT_DEFS[spot.kind].color}70`,
            boxShadow: `0 4px 20px rgba(0,0,0,0.55), 0 0 22px ${HOTSPOT_DEFS[spot.kind].color}22`,
            maxWidth: 460,
          }}>
            {/* PIPS, not a number. "Tier 2" is a stat; three dots with two lit
                is a strength, and it matches the brightness of the water you
                are floating in. */}
            <span aria-hidden style={{
              display: 'flex', flexDirection: compact ? 'row' : 'column',
              gap: 2.5, flexShrink: 0,
            }}>
              {[3, 2, 1].map(t => (
                <span key={t} className={t <= spot.tier ? 'sea-hotspot-dot' : undefined} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: t <= spot.tier ? HOTSPOT_DEFS[spot.kind].color : 'rgba(255,255,255,0.14)',
                  boxShadow: t <= spot.tier ? `0 0 8px ${HOTSPOT_DEFS[spot.kind].color}` : 'none',
                }} />
              ))}
            </span>
            <span style={{ minWidth: 0 }}>
              {/* The eyebrow and the full effect are the EXPLANATION, and an
                  explanation is for arriving. Compact keeps only the name — the
                  one thing that still has a job, which is saying you are still
                  in it. */}
              {!compact && (
                <span className="font-karla font-700 uppercase block" style={{
                  fontSize: '0.66rem', letterSpacing: '0.12em',
                  color: `${HOTSPOT_DEFS[spot.kind].color}99`,
                }}>{HOTSPOT_DEFS[spot.kind].family}</span>
              )}
              <span className="font-cinzel font-700 block" style={{
                fontSize: compact ? '0.8rem' : '0.9rem',
                color: HOTSPOT_DEFS[spot.kind].color, lineHeight: 1.15,
              }}>{HOTSPOT_DEFS[spot.kind].tiers[spot.tier].name}</span>
              {/* THE EFFECT, IN FULL, WITH ITS REAL NUMBER. An icon you have to
                  learn is not an explanation, and the house rule is that
                  mechanics are stated literally even where the flavour is
                  allowed its charm. */}
              {!compact && (
                <span className="font-karla font-600 block" style={{
                  fontSize: '0.74rem', color: 'rgba(222,238,246,0.82)', lineHeight: 1.35, marginTop: 1,
                }}>{HOTSPOT_DEFS[spot.kind].tiers[spot.tier].effect}</span>
              )}
            </span>
            {!compact && (
              <span className="font-karla font-700" style={{
                flexShrink: 0, fontSize: '0.66rem', color: 'rgba(190,212,228,0.55)',
                fontVariantNumeric: 'tabular-nums',
              }}>{left}</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function WaterBanner({ place, locked, lowered }: {
  place: Place | null; locked: boolean
  /** Drop below the top row. Two callers, two reasons: while the rod is out
   *  the level bar owns the top of the screen, and on a phone the HUD discs
   *  do — either way the name must not print over what is already there. */
  lowered: boolean
}) {
  const [shown, setShown] = useState<Place | null>(null)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (place?.id === shown?.id) return
    setShown(place)
    if (!place) return
    // The flare is the crossing. It decays on its own; nothing else needs to
    // know it happened.
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 2600)
    return () => clearTimeout(t)
  }, [place, shown])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div key={shown.id}
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.35 } }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 0, right: 0, top: lowered ? 56 : 18,
            zIndex: Z.hud,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
          }}>
          <motion.p className="font-cinzel font-700"
            animate={{ opacity: fresh ? 1 : 0.42 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{
              // THE NAME OF THE PLACE, and the biggest thing on the chart
              // that is made of type. It is the answer to "where am I", which
              // is the question a map exists to answer — it should not be
              // set smaller than the button underneath it.
              fontSize: '1.35rem', letterSpacing: '0.2em', textTransform: 'uppercase',
              color: locked ? 'rgba(214,176,176,0.95)' : '#dfeaf2',
              textShadow: '0 2px 14px rgba(0,0,0,0.95)',
            }}>
            {shown.name}
          </motion.p>
          <motion.div aria-hidden
            animate={{ opacity: fresh ? 0.5 : 0.12, width: fresh ? 96 : 46 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{ height: 1, marginTop: 5, background: 'rgba(214,232,240,0.9)' }} />
          {locked && fresh && (
            <motion.p className="font-karla font-600"
              initial={{ opacity: 0 }} animate={{ opacity: 0.9 }}
              style={{
                fontSize: '0.816rem', marginTop: 6, color: 'rgba(214,166,166,0.95)',
                textShadow: '0 1px 10px rgba(0,0,0,0.95)',
              }}>
              Fishing {shown.minLevel} to work this water
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Off-screen pointers. Not decoration: open water with nothing in view is the
 *  classic hub failure — you cannot tell whether there is anything out there or
 *  which way, so you stop exploring. Distance matters as much as direction. */
/**
 * THE COMPASS — markers for what you cannot see, pinned to the edge nearest it.
 *
 * The first version put every marker on the SAME CIRCLE around the boat, which
 * is what made it unreadable. Two places twenty degrees apart landed on top of
 * each other, and this chart is a line running east — so the Deep, the Abyss
 * and the Ancient Deep are all in nearly the same direction from almost
 * anywhere, and all three stacked in the same spot with their names and
 * distances overlapping into mush.
 *
 * Three changes, and each one removes a different cause of clutter:
 *
 *   ONLY WHAT IS OFF SCREEN. The old test was world distance, so a zone whose
 *   water you were sitting in still got an arrow if its centre happened to be
 *   far enough away. An arrow pointing at something you can already see is pure
 *   noise. Now a place is projected to the screen, and it only gets a marker if
 *   it is actually outside the viewport.
 *
 *   THE EDGE, NOT A RING. Markers clamp to the screen border along the line to
 *   the place, so direction maps onto the whole perimeter instead of onto one
 *   small circle. Two things in similar directions now separate by however far
 *   apart they truly are.
 *
 *   THREE AT MOST, NEAREST FIRST, AND NEVER TOUCHING. Anything still landing
 *   within a marker's width of one already placed is dropped — the nearer one
 *   wins, because it is the one you are more likely to be going to. The rest is
 *   discoverable by sailing, which is the point of a chart you sail on.
 */
const COMPASS_MAX = 4
/** The keep-clear box between two markers: a name plate is ~110 wide and two
 *  lines tall, so side-by-side needs far more room than stacked. A radius (it
 *  was 96) let two centres pass while the words lay on each other. */
const COMPASS_KEEP = { x: 120, y: 42 }

function Compass({ pos, zoom, wrapRef, locked, frozen, waitingAt, friends }: {
  frozen: boolean
  /** Crew waiting at a given port, so a dock with a haul on it can jump the
   *  queue. Zero for everywhere else. */
  waitingAt: (id: string) => number
  pos: React.RefObject<Vec>
  zoom: React.RefObject<number>
  wrapRef: React.RefObject<HTMLDivElement | null>
  locked: (p: Place) => boolean
  /** Mutual crew currently on the water. Never fogged and never hidden:
   *  the whole point is finding each other, and a mark you have to earn is a
   *  mark that does not help you meet. */
  friends: FriendAtSea[]
}) {
  const [, force] = useState(0)
  useEffect(() => {
    // 200ms. An arrow that updates five times a second is indistinguishable
    // from one that updates eight times a second and costs nearly half as much.
    // And nothing at all while the dial is up: the boat is not moving, so every
    // one of these renders would redraw the same arrows in the same places.
    if (frozen) return
    const id = setInterval(() => force(v => v + 1), 200)
    return () => clearInterval(id)
  }, [frozen])

  const here = pos.current ?? HOME
  const z = zoom.current ?? 1
  const rect = wrapRef.current?.getBoundingClientRect()
  if (!rect || rect.width < 2) return null
  const hw = rect.width / 2
  const hh = rect.height / 2
  // Inset far enough that a marker and its label sit fully on screen.
  const mx = Math.min(64, hw * 0.22)
  const my = Math.min(74, hh * 0.22)
  /** The BOTTOM inset is deeper than the other three. The bottom edge is where
   *  the action pill and the helm live, and a marker pinned at 74px was
   *  printing straight through them — the "!" with its metres sat behind the
   *  ashore pill in the report that led here. Deep enough to clear the pill
   *  row; side markers are unaffected because their x pins them first. */
  // Past the helm's upper arc, not just past the bottom edge — 170 left the
  // Abyss's label lying on the wheel.
  const myBot = Math.min(214, hh * 0.5)

  /**
   * WHAT DESERVES AN ARROW, once the zones became rings.
   *
   * Ranking every place by distance stopped working the moment the waters
   * became concentric bands. From anywhere in the Deep the nearest edge of all
   * five rings is a few thousand pixels away and the Mainland is six thousand,
   * so the three slots filled with bands every single time and the way home was
   * never on screen. That is the exact opposite of what a compass is for.
   *
   * So the slots are assigned by ROLE rather than won by distance:
   *
   *   THE NEAREST PORT, always first. Getting back is the one heading you can
   *   never afford to lose, and on a ring chart it is also the least guessable:
   *   home is inward, and inward has no landmark.
   *
   *   THE BUYER OF THE WATER YOU ARE IN. A band is thousands of pixels round
   *   and he is one moored boat on it. Without this he is not findable by
   *   sailing, only by luck.
   *
   *   THE NEXT BAND OUT, AND THE NEXT BAND IN, aimed at their nearest EDGE.
   *   Only the neighbours: the Ancient Deep is not a heading you follow from
   *   the Shallows, it is four crossings away, and an arrow saying otherwise is
   *   a lie about how far you have to go. A band you are already IN gets
   *   nothing — you are in it.
   *
   *   THEN THE OTHER PORTS, nearest first, with whatever room is left.
   */
  const project = (tx: number, ty: number) => ({
    sx: (tx - here.x) * z,
    sy: (ty - here.y) * GROUND * z,
    world: Math.hypot(tx - here.x, ty - here.y),
  })

  type Mark = {
    id: string; name: string; dim: boolean; dist: boolean
    /** Somebody, not somewhere. Drawn as a mark, never as a name — see below. */
    mystery?: boolean
    sx: number; sy: number; world: number
  }
  const marks: Mark[] = []

  const ports = PLACES.filter(p => p.kind === 'port')
    .map(p => ({ p, ...project(p.x, p.y) }))
    // CREW WAITING OUTRANKS PROXIMITY. The nearest port is the one you need to
    // find your way home by; a dock with somebody standing on it is the one you
    // need to be TOLD about, because nothing else on this screen would.
    .sort((a, b) => (waitingAt(b.p.id) - waitingAt(a.p.id)) || (a.world - b.world))
  const nearestPort = ports[0]
  if (nearestPort) {
    marks.push({
      id: nearestPort.p.id, name: nearestPort.p.name, dim: locked(nearestPort.p),
      dist: true, sx: nearestPort.sx, sy: nearestPort.sy, world: nearestPort.world,
    })
  }

  // ── WHO ELSE IS OUT HERE ─────────────────────────────────────────────
  //
  // Drawn like a person rather than a place: `mystery` is off, because the
  // whole value is knowing WHO, and a nameless mark is one you have to sail to
  // in order to identify.
  //
  // Their position is up to twenty seconds old, which the mark does not try to
  // hide — a friend who has just gone quiet keeps their arrow for a couple of
  // minutes and it simply stops moving. An arrow that vanished the instant a
  // flush was missed would blink every time somebody hit a tunnel.
  for (const f of friends) {
    const at = project(f.x, f.y)
    marks.push({
      id: `friend:${f.username}`, name: f.username, dim: false, dist: true,
      sx: at.sx, sy: at.sy, world: at.world,
    })
  }

  // ── FINN IS NOT ON THIS COMPASS ──────────────────────────────────────
  //
  // He had an arrow here, named, and it was wrong. An arrow that says "Finn,
  // 1,400m, that way" turns him into a waypoint: the finding is done the moment
  // you open the screen and all that is left is holding a direction. He is
  // supposed to be a man you come ACROSS.
  //
  // Nothing replaces it. The bands are the only lead he gets — he keeps to
  // water you have unlocked and drifts deeper as the story does — and beyond
  // that he is found by sailing, which is the whole point of a sea.

  // ── THE WAY OUT ──────────────────────────────────────────────────────
  //
  // The Harbour used to be a port on this list, and removing it took the only
  // northward pointer with it. The reef is 45,200px long with one 860px gap in
  // it, and a gap that size is not something anyone finds by sweeping — so the
  // compass points at the gap directly, which is what the Harbour pin was
  // always really pointing at.
  //
  // Never dimmed and never hidden. Expeditions is not gated on anything the
  // chart knows about, and a door you cannot find is a door that is shut.
  {
    const g = project(GATE_X, NORTH_WALL)
    marks.push({
      id: 'gate', name: 'Expeditions', dim: false, dist: true,
      sx: g.sx, sy: g.sy, world: g.world,
    })
  }

  const waters = PLACES.filter(p => p.kind === 'water' && p.inner != null && p.outer != null)
  const R = Math.hypot(here.x, here.y)
  const inIdx = waters.findIndex(w => inBand(here, w))

  const buyer = inIdx >= 0 ? RESIDENTS.find(r => r.zoneId === waters[inIdx].id) : undefined
  if (buyer) {
    // NO NAME ON THE ARROW.
    //
    // Everyone on this sea is meant to be FOUND. Printing "Meg Corrin" on the
    // horizon tells you who is out there, what they are, and that there is
    // exactly one of them, before you have laid eyes on the boat — which is
    // three quarters of the discovery spent on a label. The arrow says
    // "somebody, that way, this far"; the rest you get by sailing over.
    marks.push({
      id: `buyer:${buyer.zoneId}`, name: '', dim: false, dist: true, mystery: true,
      ...project(buyer.x, buyer.y),
    })
  }

  // The bearing out from the Mainland, which is the only direction a ring has.
  // Sitting on the origin there is none, so use due south; and never aim north,
  // because there is no fishing water up there to aim at.
  const uy = R < 1 ? 1 : Math.max(0.08, here.y / R)
  const ux = R < 1 ? 0 : here.x / R
  const un = Math.hypot(ux, uy) || 1
  const edgeAt = (radius: number) => project((ux / un) * radius, (uy / un) * radius)

  // Neighbours: the first band whose inner edge is beyond us, and the last band
  // whose outer edge is behind us. When you are inside one those are simply the
  // band above and the band below.
  const outIdx = inIdx >= 0 ? inIdx + 1 : waters.findIndex(w => R < (w.inner ?? 0))
  const backIdx = inIdx >= 0 ? inIdx - 1 : (() => {
    let last = -1
    waters.forEach((w, i) => { if (R >= (w.outer ?? 0)) last = i })
    return last
  })()
  for (const [idx, edge] of [[outIdx, 'inner'], [backIdx, 'outer']] as const) {
    const w = idx >= 0 ? waters[idx] : undefined
    if (!w) continue
    marks.push({
      id: w.id, name: w.name, dim: locked(w), dist: false,
      ...edgeAt((edge === 'inner' ? w.inner : w.outer) as number),
    })
  }

  for (const q of ports.slice(1)) {
    marks.push({ id: q.p.id, name: q.p.name, dim: locked(q.p), dist: false, sx: q.sx, sy: q.sy, world: q.world })
  }

  // On screen already? Then you can see it, and an arrow is noise. Applied
  // after the ranking so everything obeys the same rule — a port you are moored
  // at, or a band edge two hundred pixels off the bow, needs no arrow.
  const visible = marks.filter(m => Math.abs(m.sx) > hw - mx || Math.abs(m.sy) > hh - my)

  const placed: { x: number; y: number }[] = []
  const shown: { m: typeof visible[number]; x: number; y: number; a: number }[] = []
  for (const m of visible) {
    if (shown.length >= COMPASS_MAX) break
    // Ray from the centre to the place, clamped to the inset rectangle.
    const ax = Math.abs(m.sx), ay = Math.abs(m.sy)
    const t = Math.min(
      ax > 0.001 ? (hw - mx) / ax : Infinity,
      // Downward rays stop earlier — see myBot.
      ay > 0.001 ? (hh - (m.sy > 0 ? myBot : my)) / ay : Infinity,
    )
    let x = m.sx * t
    const y = m.sy * t
    // ── THE BANNER'S STRIP IS RESERVED ─────────────────────────────
    // The water's name lives top-centre, and an upward ray lands exactly
    // there. Markers SLIDE OUT of the strip rather than dropping below it:
    // sideways keeps "up-ish" honest, and it puts the two commonest top
    // marks flanking the title instead of underneath it.
    if (hh + y < 150 && Math.abs(x) < 210) {
      x = (x !== 0 ? Math.sign(x) : m.sx < 0 ? -1 : 1) * 210
    }
    // ── LABELS ARE WIDE, NOT ROUND ─────────────────────────────────
    // The spacing test was a circle at 96, and two name plates are ~110
    // wide: centres 96 apart passed the test and the words still lay on
    // each other. Side-by-side needs more room than stacked, so the test
    // is a box, not a radius.
    if (placed.some(q => Math.abs(q.x - x) < COMPASS_KEEP.x && Math.abs(q.y - y) < COMPASS_KEEP.y)) continue
    placed.push({ x, y })
    shown.push({ m, x, y, a: Math.atan2(m.sy, m.sx) })
  }

  return (
    <>
      {shown.map(({ m, x, y, a }) => {
        const dim = m.dim
        // The two headings you ACT on carry a distance — the way home and the
        // buyer. The band edges do not: "the Deep, 180m" invites you to read it
        // as a place at a distance when it is a boundary you cross.
        const lead = m.dist
        return (
          <div key={m.id} aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%', zIndex: Z.compass,
            transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            pointerEvents: 'none',
          }}>
            <span style={{
              width: 0, height: 0,
              transform: `rotate(${a + Math.PI / 2}rad)`,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderBottom: `9px solid rgba(190,214,228,${dim ? 0.28 : lead ? 0.75 : 0.5})`,
            }} />
            {/* NAME FIRST, then distance. An arrow with only a number on it
                tells you something is 340m away and leaves you to sail there to
                find out what, which is not navigation, it is a guess. */}
            {m.mystery ? (
              // A mark, not a name. Circled so it reads as a pin on the chart
              // rather than as punctuation that lost its sentence.
              <span className="font-cinzel font-800" aria-hidden style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%',
                fontSize: '0.72rem', lineHeight: 1,
                color: '#f2d99a',
                background: 'rgba(240,192,64,0.16)',
                border: '1px solid rgba(240,192,64,0.6)',
                textShadow: '0 1px 5px rgba(0,0,0,0.9)',
              }}>!</span>
            ) : (
              <span className="font-cinzel font-700" style={{
                fontSize: lead ? '0.6rem' : '0.54rem', whiteSpace: 'nowrap',
                color: `rgba(214,232,240,${dim ? 0.4 : lead ? 0.9 : 0.62})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{m.name}</span>
            )}
            {lead && (
              <span className="font-karla font-700" style={{
                fontSize: '0.66rem', marginTop: -1,
                color: `rgba(190,214,228,${dim ? 0.3 : 0.6})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{Math.round(m.world / 10)}m</span>
            )}
          </div>
        )
      })}
    </>
  )
}


/**
 * GOING ASHORE AT THE MAINLAND.
 *
 * Six cards on the backdrop, no modal container behind them — the same shape as
 * the Gauntlets chooser on the expeditions hub, because it is the same
 * question: one door on the chart, several rooms behind it.
 *
 * SIX, NOT THREE, AND THE TAVERN IS NO LONGER A LOBBY. It was one of three
 * cards and then a hub in its own right, which put the chart room, the den and
 * the parlour two doors deep: you went ashore, entered a tavern, and chose
 * again from a page of cards. That is a menu wearing a building's name. They
 * are their own buildings now and they open from the water, which is what they
 * always were on the island anyway.
 *
 * The art is the same six buildings standing in the painted town on the island,
 * so the card you tap is visibly the one you sailed past. That is the whole
 * reason this is a chooser and not a list of links.
 */
const ASHORE: { href: string; art: string; name: string; blurb: string; cta: string; accent: string }[] = [
  { href: '/tavern', art: '/sea/tavern.png', name: 'The Tavern',
    blurb: 'The day\u2019s tot, and whatever race is running', cta: 'Enter', accent: '#e0a545' },
  { href: '/tavern/casino', art: '/sea/den.png', name: 'The Den',
    blurb: 'Cards, dice and the wheel', cta: 'Play', accent: '#d9534f' },
  { href: '/tavern/chart-room', art: '/sea/charting.png', name: 'The Chart Room',
    blurb: 'The week\u2019s puzzles and the world chart', cta: 'Study', accent: '#6fc4b4' },
  { href: '/tavern/trivia', art: '/sea/parlor.png', name: 'The Parlor',
    blurb: 'Trivia, and the Pirate King ladder', cta: 'Sit in', accent: '#dd8f79' },
  { href: '/tavern/market', art: '/sea/market.png', name: 'The Market',
    blurb: 'Sell the hold at full price', cta: 'Trade', accent: '#7fd6a0' },
  { href: '/marketplace/tackle-shop', art: '/sea/tackle.png', name: 'Tackle Shop',
    blurb: 'Rods, hooks, reels and bait', cta: 'Browse', accent: '#67d4e8' },
]

function MainlandAshore({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  return (
    // PopupShell does NOT portal, so it is a DOM child of the map — and the map
    // steers on click and starts a heading on pointerdown. Without this, a tap
    // on the backdrop to dismiss the chooser also puts the helm over, and you
    // close the modal to find the boat sailing off. The wrapper takes no space:
    // everything inside it is position: fixed.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ margin: 'auto', width: '100%', maxWidth: 440 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{
              fontSize: '0.66rem', color: 'rgba(190,214,228,0.85)', textShadow: '0 1px 5px rgba(0,0,0,0.85)',
            }}>Ashore at the Mainland</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.26rem', color: '#f4ecd8', textShadow: '0 2px 8px rgba(0,0,0,0.85)',
            }}>Where to?</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: '50%', padding: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
              color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Three across, which with six doors is two rows of three. They stay
            three across on the narrowest phone: this is one choice between six
            things, and stacking it turns it into a list you scroll, which is
            what the nav already is. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {ASHORE.map((d, i) => (
            <motion.button key={d.href} type="button" className="tap"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06, type: 'spring', stiffness: 380, damping: 28 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { vibrate([0, 16]); onClose(); router.push(d.href) }}
              style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                padding: '0.8rem 0.45rem 0.75rem', borderRadius: 16, cursor: 'pointer',
                // A SOLID base under the tint. These float on the backdrop with
                // the painted chart still visible behind it, and a translucent
                // card over moving water reads as a smear.
                background: `linear-gradient(180deg, ${d.accent}24 0%, rgba(4,10,18,0.72) 48%, rgba(3,8,14,0.94) 100%), #06101a`,
                border: `1px solid ${d.accent}5c`,
                boxShadow: `0 0 22px ${d.accent}14`,
              }}>
              <div style={{
                position: 'relative', width: '100%', height: 84,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
              }}>
                <div aria-hidden style={{
                  position: 'absolute', width: 96, height: 96, borderRadius: '50%',
                  background: `radial-gradient(circle, ${d.accent}44, transparent 68%)`, filter: 'blur(3px)',
                }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.art} alt="" loading="eager" decoding="async" style={{
                  position: 'relative', maxWidth: '92%', maxHeight: 82, objectFit: 'contain',
                  filter: `drop-shadow(0 8px 18px ${d.accent}4d) drop-shadow(0 4px 10px rgba(0,0,0,0.6))`,
                }} />
              </div>
              <p className="font-cinzel font-800" style={{ fontSize: '0.936rem', color: '#f0ede8', lineHeight: 1.12 }}>
                {d.name}
              </p>
              <p className="font-karla font-600" style={{
                fontSize: '0.66rem', color: `${d.accent}dd`, marginTop: 3, lineHeight: 1.32,
              }}>{d.blurb}</p>
              <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{
                marginTop: 'auto', paddingTop: 9,
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66rem',
                color: d.accent,
              }}>
                {d.cta}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </PopupShell>
    </div>
  )
}
