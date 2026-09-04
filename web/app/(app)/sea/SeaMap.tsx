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
import MarkProbe from './MarkProbe'
import { decodeFog, encodeFog, fogHas, fogReveal, fogSet } from '@/lib/seaExplore'
import type { RenownState } from '@/app/(app)/actions/renown'
import type { FishSpeciesBasic } from '@/app/(app)/fishing/constants'
import type { VigilState } from '@/lib/ancientVigil'
import { saveSeaPosition as persistSeaPosition } from './traderActions'
import { PLACES, LANDMARKS, RESIDENTS, SOCIALS, HAIL_RANGE, HOME, OPEN_SEA, NORTH_WALL, OUTER_EDGE, GATE_X, GATE_HALF, GATE_DEPTH, inGate, EXP_ORIGIN, EXP_EDGE, SORTIE, SORTIE_HALF, inSortie, anchorageArc, RAID_EDGE, GUNWHARF, berthOf, inBerth, type Place } from './chart'
import { getShip } from '@/lib/ships'
import { ISLES, isleNear, chestArt, bandName, ashoreRange, type Isle } from '@/lib/seaIsles'
import { goAshore, type AshoreResult } from './isleActions'
import { crewTheDeck } from '../crew/actions'
import { SUBMERGE } from './submerge'
import { ART_COLLIDERS, PORT_COLLIDERS, ISLE_COLLIDERS } from './colliders'
import SubmergedSprite from './SubmergedSprite'
import { PORTAL, PORTAL_TIERS, PORTAL_PORTS, hasPortalStone, hasStoneFor, inPortal, warpPoint } from '@/lib/seaPortal'
import { buyPortalTier, buyPortalPort } from './portalActions'
import { bottlesAround, bottlePos, bottleWindow, BOTTLE_CELL, BOTTLE_REACH, type Bottle } from '@/lib/seaBottles'
import { digAt, digHintAt, DIG_SITES, DIG_HINT_RANGE, type DigSite } from '@/lib/seaDigs'
import { SURFACES, surfaceAt, inkStrength, type Surface } from '@/lib/seaSurface'
import { homeBuildings, builtAt, homesteadName, type Homestead } from '@/lib/homestead'
import {
  BAYS, BAY_BY_ID, HUB, HUB_R, bayCentre, mouthOf, entryOf, straitLen,
  fromStrait, toStrait, fromBay, toBay, inStrait, inBay, inChapterWater, bayOpen,
  WALLS, wallEnds, wallUp, ENCOUNTERS, CACHES, RAID_ISLES, encounterAt, cacheAt, cacheIsle, isleAt, beatAt, beatIsle, beatNear, BEATS,
  encounterNear, cacheNear, hullFor, DOCK, dockAt, ENCOUNTER_REACH,
  RETURN_PORTALS, portalAt, portalNear, portalOpen as wayHomeOpen, PORTAL_HOME, PORTAL_REACH, type ReturnPortal,
  type Bay, type Encounter, type Cache, type Beat, type Wall,
} from './raidWaters'
import { RAID_MAP, RAID_CHAPTERS, type RaidNode } from '@/lib/raidMap'
import { getRaidConfigById } from '@/lib/raidRegistry'
import { friendsAtSea, visitableHomesteads, homesteadOf, type FriendAtSea, type Visitable } from '../home/visitActions'
import { openBottle, digHere, type BottleResult, type DigResult, type DigState } from './digActions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getCharacterSprites } from '@/lib/characters'
import { BOATS, boatSpeed, boatAgility } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { PET_OVERLAYS, PETS, type PetSpecies } from '@/lib/pets'
import { getBait } from '@/lib/bait'
import { handlingRate, accelRate, lanternGlow, BASE_SPEED_PX, BASE_TURN_RAD, BASE_ACCEL } from '@/lib/shipyard'
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
import { squallAt } from '@/lib/seaWeather'
import { tradersAround, traderPos, yoonTrader, seaDay, plainRodFor, plainHookFor, KIND_LABEL, DEALS_PER_DAY, CELL, type Trader, type TraderLook } from '@/lib/seaTraders'
import TraderPanel from './TraderPanel'
import CrewPanel from './CrewPanel'
import { crewHub } from './crewHubActions'
import { folkById, type FolkId } from '@/lib/seaFolk'
import { RODS } from '@/lib/rods'
import { HOOKS } from '@/lib/hooks'

/**
 * A TRADER, AS A CAPTAIN.
 *
 * The same builder the player goes through, which is the point: everyone out
 * here is assembled from the same parts, so a cosmetic that ships for players
 * turns up on the sea for free rather than by anyone remembering to match it.
 *
 * EVERY GLOW IS NULLED, deliberately and not for want of data. A trader's rod
 * and hook are drawn from the plain pools for the reason written on TraderLook
 * — the glowing ones are things players earned, and handing them to background
 * characters cheapens both — and their hulls are filtered the same way in
 * lib/seaTraders. Passing null here is the third lock on the same door: even
 * if a showy item reached one of them, they would still not light up.
 */
function captainFromTrader(l: TraderLook): CaptainLook {
  return {
    characterColor: l.characterColor,
    boatId: l.boatId,
    hatId: l.hatId,
    petArt: null,
    petSpecies: null,
    rodSlug: l.rodSlug,
    rodImage: null,
    rodGlowType: null,
    rodLockedIn: false,
    reel: null,
    hookUrl: l.hook,
    hookGlowType: null,
  }
}

/**
 * A FRIEND, AS A CAPTAIN.
 *
 * Every glow they own, kept. A trader's are nulled because they are scenery
 * dressed from a plain pool; somebody you sailed out to meet is a PLAYER, and
 * the rod they worked for is most of what you are looking at when you spot
 * them on the water. The comment on the trader converter is the argument for
 * why they are different, and this is the other side of it.
 */
function captainFromFriend(f: FriendAtSea): CaptainLook {
  return {
    characterColor: f.characterColor,
    boatId: f.boatId,
    hatId: f.hatId,
    petArt: f.gear.petArt,
    petSpecies: f.gear.pet,
    rodSlug: f.gear.rodSlug,
    rodImage: f.gear.rod,
    rodGlowType: f.gear.rodGlow,
    // Their live streak is not on the wire, so a Locked-In Rod shows its
    // dormant glow out here — the same thing yours does on the chart.
    rodLockedIn: false,
    reel: f.gear.reel,
    hookUrl: f.gear.hook,
    hookGlowType: HOOKS.find(h => h.imageUrl === f.gear.hook)?.glowType ?? null,
  }
}

/** The sprite for the rod a regular sells, when they sell one. One place, so
 *  the man on the water and the offer in his panel cannot show different
 *  tackle. */
function folkRodSlug(folkId: string): string | null {
  const tier = folkById(folkId as FolkId)?.rodTier
  if (!tier) return null
  return RODS.find(r => r.tier === tier)?.slug ?? null
}
import FolkPanel from './FolkPanel'
import SeaFirstVoyage from './SeaFirstVoyage'
import SeaLandfallHint from './SeaLandfallHint'
import { pendingPacts } from './pactActions'
import { heldGolden } from '../fishing/actions'
import { coastClip, coastline } from '@/lib/islandShape'
// The island painting itself, which used to live in this file. See islandArt
// for why it moved and why the move is a pure one.
import { GROUND, ISLAND_LIFT, bakeIsland, requestGround } from './islandArt'
import SeaIslandsGPU, { type GpuHandle, type GpuIsland, type GpuMark } from './SeaIslandsGPU'
import { type CaptainLook } from './seaCaptain'
import { type WakeKind } from './seaWake'
import { type BerthSpec } from './seaBerth'
import { type GpuTown } from './seaTown'

/**
 * ── THE CHART IS DRAWN ON A CANVAS ──────────────────────────────────────────
 *
 * Pixi draws the water, the land, the buildings, the shore, the wakes, every
 * captain out here and everything they glow with. This flag now only says
 * whether to fall BACK to the DOM chart, which is still whole and still
 * correct: `?gpu=0`.
 *
 * ── WHY THE FALLBACK IS STILL HERE ──────────────────────────────────────────
 *
 * Not sentiment, and not indecision. This port began because iOS was killing
 * the renderer for memory on the DOM chart — reported as a white screen and
 * eventually as "a problem repeatedly occurred" — and a rendering failure on a
 * device neither of us owns is exactly the class of bug that shows up after a
 * flip rather than before it. `?gpu=0` is a link that can be handed to somebody
 * whose sea will not draw, and it costs one branch per call site to keep.
 *
 * It should not stay forever: two charts is two charts, and the DOM one will
 * quietly rot the moment anybody adds something to the canvas and not to it.
 * Delete it once this has been out long enough to have been sailed on a range
 * of hardware, and take the `!GPU_ISLANDS` branches with it.
 *
 * A MODULE CONSTANT, read once. It cannot change during a session, so reading
 * it at render time in a memoised child is honest and costs nothing — whereas
 * threading it through PlaceIsland and IsleRock as a prop would re-render every
 * island on the chart to deliver a value that never moves.
 *
 * THE DEFAULT IS THE SAME ON BOTH SIDES, deliberately. The server cannot read a
 * query string, so a default that disagreed with the client's would hand React
 * a different tree to hydrate than the one it rendered — every island on the
 * chart, present on one side and absent on the other. True on both means the
 * only mismatch possible is for somebody who typed `?gpu=0`, which is a person
 * debugging rather than a person playing.
 */
let GPU_ISLANDS = true
if (typeof window !== 'undefined') {
  try {
    GPU_ISLANDS = new URLSearchParams(window.location.search).get('gpu') !== '0'
  } catch { /* an address we cannot parse is one we do not act on */ }
}
import { openSeaPresence, BEAT_MS, type SeaPresence } from '@/lib/seaPresence'
import { finnHaunt, FINN_REACH, FINN_LOOK } from '@/lib/seaFinn'
import { KIP } from '@/lib/seaSmuggler'
import { finnState, speakToFinn, acceptFinnChallenge, declineFinnChallenge, claimFinnChallenge, turnInFinnQuest, type FinnSeaState, type FinnOffer, type FinnChallenge } from './finnActions'
import { FINN_NAME, findNextEncounterBeat, type FinnSceneLine } from '@/lib/finn'

// THE SEA'S OWN. `fishing/FinnEncounter` is still mounted by the retired
// fishing screen; this is the chart's version and it follows the chart's
// conversation convention. See FinnTalk for why they are separate.
const FinnTalk = dynamic(() => import('./FinnTalk'), { ssr: false })
// THE VOYAGE BOARD, opened by mooring at the Charterhouse. Dynamic for the
// same reason: it pulls in the whole expeditions voyage panel behind it.
const VoyageBoard = dynamic(() => import('./VoyageBoard'), { ssr: false })
const CrewHub = dynamic(() => import('./CrewHub'), { ssr: false })
/** The campaign's own cutscene kit, held back until a post is actually read —
 *  see SeaStory. A captain who never leaves the fishing grounds never fetches
 *  a byte of it. */
const SeaStory = dynamic(() => import('./SeaStory'), { ssr: false })
/** The toll, the cache and the Captain's Choice — the three campaign nodes
 *  whose interaction is more than reading. Same treatment: nothing is fetched
 *  until one is actually opened. */
const SeaNodeSheet = dynamic(() => import('./SeaNodeSheet'), { ssr: false })
/**
 * THE ALMANAC, FROM THE WATER.
 *
 * It lived on the Homestead, behind a pill in that page's header — which is
 * where it ended up rather than where it belongs: a reference book about fish
 * is not a part of your house. It is about the thing you are doing when you are
 * out here, so it opens from out here.
 *
 * Dynamic, because it drags the whole collection view behind it and most
 * sessions never open it.
 */
const Almanac = dynamic(() => import('../fishing/Almanac'), { ssr: false })
/** The Shipyard, as a sheet. Dynamic for the same reason the Almanac is: it
 *  drags GearScreen and the whole forge bench behind it, and a captain who
 *  never moors there never fetches a byte of it. */
const ShipyardSheet = dynamic(() => import('./ShipyardSheet'), { ssr: false })
/** THE FIGHT, over the water it is happening on. Dynamic and enormous — the
 *  whole combat engine hangs off it — so nothing of it is fetched until a
 *  captain actually takes something on. */
const RaidSheet = dynamic(() => import('./RaidSheet'), { ssr: false })
const BossCardSheet = dynamic(() => import('./BossCardSheet'), { ssr: false })
// The two channels a fight on the water runs on: where the hulls are, and what
// is happening to them. Types only, so the fight is not pulled into this bundle.
import type { ShipAnchor, ShipFx } from '@/app/(app)/raids/RaidCombat'
import { bossCardState, type BossCardState } from './bossCardActions'
import { raidSheetState, type RaidSheetState } from './raidSheetActions'
/** The portal's chart. Only fetched once somebody actually steps into one. */
const PortalMap = dynamic(() => import('./PortalMap'), { ssr: false })
// THE KNOBS ON THE OUTSIDE OF THE GAME, top right and away from the HUD's run
// of destinations down the left. Dynamic, like everything else the chart does
// not need in order to draw a sea.
const SeaSettings = dynamic(() => import('./SeaSettings'), { ssr: false })
// The Daily Haul, which used to be a page under the Tavern. See sea/SeaBonus.
const SeaBonus = dynamic(() => import('./SeaBonus'), { ssr: false })
// The door to Tide Run, which used to be a card in the Tavern. See seaSmuggler.
const SmugglerTalk = dynamic(() => import('./SmugglerTalk'), { ssr: false })
// And the soundtrack, which the chart lost when /fishing was retired. See
// SeaAudio: it starts on the first press, not on mount.
const SeaAudio = dynamic(() => import('./SeaAudio'), { ssr: false })
// THE ONE DECISION THAT CANNOT BE DISMISSED. Owned by the chart rather than by
// the fishing overlay, because the overlay unmounts the moment the rod is
// stowed and this must not go with it. See components/GoldenChoice.
const GoldenChoice = dynamic(() => import('@/components/GoldenChoice'), { ssr: false })

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
// FROM lib/shipyard, not from here. The Shipyard multiplies tiers against these
// to print "10.0 m/s" on a tile; when they lived in this file it was doing that
// against numbers it could not see, so the yard could have advertised a speed
// the sea does not sail at and nothing would ever have disagreed out loud.
const SPEED = BASE_SPEED_PX
/** Low is heavy. A boat should take a moment to get going. */
const ACCEL = BASE_ACCEL

/**
 * HOW FAST THE BOW COMES ROUND, in radians per second, before the rudder tier
 * and the boat's own trim multiply it.
 *
 * 2.4 is about 137 degrees a second: a full reversal takes a beat and a quarter
 * turn is near enough instant. Slower than that and holding a heading with a
 * thumb feels like arguing with the boat.
 */
const TURN = BASE_TURN_RAD

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
/**
 * ── WHERE THE TWO SHIPS STAND IN A DUEL ─────────────────────────────────────
 *
 * As fractions of the chart. Taken from the arrangement the fight was drawn
 * for and has always used: your hull low and to the left and large, theirs
 * high and to the right and smaller, because it is further off.
 *
 * The vertical gap is the load-bearing half. Up-screen is further away on this
 * projection, so an enemy placed above you is an enemy standing off — the same
 * fact the whole chart runs on, borrowed for a fight.
 */
/**
 * HOW MUCH THE CAMERA LOOKS PAST THE PAIR, in world px.
 *
 * The two hulls are framed on the midpoint between them, then the whole shot is
 * lifted so they sit above centre: the deck owns the foot of the screen, and a
 * duel composed on the middle of the window puts the enemy behind the log.
 */
const FIGHT_CAM_LIFT = 200

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
  const stacks = [...REEF, ...ANCHORAGE_WALL, ...BAY_WALLS]
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
  // AND THE CAMPAIGN'S OWN ISLES. Same treatment, same reason: these are the
  // rocks a bay is scattered with so that sailing one is steering rather than
  // holding a heading, and a rock you can sail through does not make you steer.
  ...RAID_ISLES.flatMap((i): Obstacle[] => {
    const p = isleAt(i)
    return p ? [{ x: p.x, y: p.y, r: i.r + HULL }] : []
  }),
  // The Gunwharf and the Charterhouse need no entry of their own: they are
  // ports now, and the port sweep at the top of this list already gives every
  // one of them its coastline.
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
// HAIL_RANGE now lives in chart.ts, because seaFinn sizes Finn's reach and his
// keep-clear circles against it and had been describing it as 600 from memory.

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

/**
 * THE CAMPAIGN'S ROADS, AS COLOURS.
 *
 * The fishing waters are rings and answer to one radius. A channel is a
 * corridor pointing off somewhere, so its distance is measured in its own
 * space — how far outside the box, along and across — and then fed into the
 * same blend with the same falloff. Sailing up one is a colour change, and
 * turning back down it is the reverse, on exactly the same machinery that makes
 * the Shallows shade into the Abyss.
 *
 * WHICH IS THE POINT. Four identical corridors fanned off one junction is a
 * menu with a compass drawn on it. From the mouth of the hub you should be able
 * to see that the second road is colder than the first and the fourth is nearly
 * black, before you have committed to sailing any of them.
 */
const BAY_RGB = BAYS.map(b => ({
  b,
  rgb: b.sea.map(rgb) as [number, number, number][],
}))

/** How far a point is from a bay's WATER — nought inside it, and growing once
 *  you are out. Measured against the strait too, so the colour has already
 *  started to change while you are still in the door. */
function bayGap(b: Bay, x: number, y: number): number {
  const c = bayCentre(b)
  const disc = Math.max(0, Math.hypot(x - c.x, y - c.y) - b.r)
  if (disc === 0) return 0
  const q = toStrait(b, x, y)
  const oa = Math.max(0, Math.abs(q.along - straitLen(b) / 2) - straitLen(b) / 2)
  const oc = Math.max(0, Math.abs(q.across) - b.half)
  return Math.min(disc, Math.hypot(oa, oc))
}

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
  /** The three blended stops, 0..255, deep first — the same numbers the css is
   *  written from. The water shader wants colours rather than a gradient
   *  string, and this is where they already exist: blending the zones a second
   *  time anywhere else would be a second opinion about what colour the sea is,
   *  which is the exact thing this function exists to prevent. */
  stops: number[][]
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

/** Half a passage, in milliseconds: she goes over this long, the boat is moved
 *  at the seam, and she comes back over the same again. */
const WARP_MS = 480

/**
 * HOW FAR GONE SHE IS RIGHT NOW.
 *
 * A module-level clock rather than state, because the frame loop mounts once
 * with `[]` deps and reads this sixty times a second — a state value would be
 * pinned to whatever it was when the loop was built, and a ref threaded through
 * would be one more thing to remember to reset.
 *
 * Nought normally. Rises to one across the first half of a passage and falls
 * back across the second, so the same number says "dissolving" and "arriving"
 * without anything having to know which half it is in.
 */
let warpStart = 0
function warpFade(): number {
  if (!warpStart) return 0
  const t = performance.now() - warpStart
  if (t < 0 || t > WARP_MS * 2) { warpStart = 0; return 0 }
  return t < WARP_MS ? t / WARP_MS : 1 - (t - WARP_MS) / WARP_MS
}

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

/** Three channels, as a css colour wants them: whole numbers, in range. The
 *  blend itself stays continuous — see the note where `out` is built. */
const px = (c: number[]) => c.map(v => Math.max(0, Math.min(255, Math.round(v)))).join(',')

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
  // AND THE CAMPAIGN'S BAYS. Distance from the bay's WATER rather than from its
  // centre: a bay is three thousand across and every part of it should be the
  // colour it is, not just the middle. Outside, it falls off over about a
  // thousand pixels — so the junction is open blue with four different waters
  // showing at its edges, which is what tells you they are four different
  // places before you have committed to sailing into one.
  for (const { b, rgb: cc } of BAY_RGB) {
    const d = bayGap(b, p.x, p.y) / 1000
    const d2 = d * d
    const weight = 1 / (1 + d2 * d2)
    if (weight < 0.004) continue
    wSum += weight
    for (let k = 0; k < 3; k++) {
      for (let ch = 0; ch < 3; ch++) acc[k][ch] += cc[k][ch] * weight
    }
  }

  // UNROUNDED. The css string rounds when it writes the colours, because that
  // is what a css colour is; the numbers themselves do not have to be integers
  // and the canvas is happier if they are not. Rounding here quantises the
  // whole palette to 255 steps per channel, and a deep stop that travels from
  // 39 down to 6 across a fade has 33 of them to do it in — which is a band you
  // can see, on a gradient that fills the screen.
  let out = acc.map(c => c.map(v => v / wSum))

  // NIGHT, applied to the blend rather than as a sheet over the top. A dark
  // overlay flattens everything underneath it into one grey; pulling the
  // palette itself down toward a cold blue-black keeps the Shallows lighter
  // than the Abyss after dark, exactly as they are before it.
  if (darkness > 0) {
    const NIGHT: [number, number, number] = [6, 11, 22]
    const k = darkness * 0.78
    out = out.map(c => c.map((v, i) => v * (1 - k) + NIGHT[i] * k))
  }

  // Perceived brightness of the DEEP stop, 0..1. Drives how much light the
  // painted wash is allowed to add.
  // Divided by 55, not 120. The deep stops on this chart run from about 39 down
  // to 16, so a 120 divisor squashed every zone into the bottom quarter of the
  // range and the Abyss came out barely darker than the Shallows.
  const lum = Math.min(1, (out[0][0] * 0.21 + out[0][1] * 0.72 + out[0][2] * 0.07) / 55)


  return {
    lum,
    stops: out,
    // The middle stop, which is the colour this water reads as overall.
    solid: `rgb(${px(out[1])})`,
    // Painted three ways from the same blend, and weighted DOWN toward the
    // deep end: the pale stop used to own the top 38% of the screen, which is
    // a lot of light to be showing in water that is meant to be black.
    css:
      `radial-gradient(ellipse 130% 104% at 50% -10%, ` +
      `rgb(${px(out[2])}) 0%, ` +
      `rgb(${px(out[1])}) 24%, ` +
      `rgb(${px(out[0])}) 60%, ` +
      `rgb(${px(out[0].map(v => v * 0.62))}) 100%)`,
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
  fishingXP, characterColor: characterColor0, boatId: boatId0, hatId: hatId0, mods, gear, bait, baitQty, baitBag, hold, rack, hullSpeed, handlingTier, accelTier, lanternTier, start, log, trawlsOut, renown, exploredRaw, discovered, digs, homestead, crewTiers, clearedNodes, nodeStatus, dealtToday,
  auto, tideTurner, userId, tour, shipTier, raidParty, raidItems, raidSeats, itemMounts, raidRepairOwed, portal, startSide,
}: {
  fishingXP: number
  /** Your own id. The one thing presence needs that the chart did not already
   *  have: you broadcast on `sea:<userId>` and nowhere else. */
  userId: string
  /** What the captain has already been taught. Both latch on profile columns,
   *  so neither replays on another device or after a reinstall. */
  tour: { seen: boolean; step: number; hints: string[] }
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
  hold: { count: number; capacity: number; tier: number }
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
  /** The portal, as this captain has built it: how far the band ladder
   *  reaches, and which island berths it has been taught. */
  portal: { tier: number; ports: string[] }
  /** Rudder and rig tiers, from the Shipyard. */
  handlingTier: number
  accelTier: number
  /** Which rung of the lantern ladder is fitted. Drives the pool of light under
   *  the hull at night — see lib/shipyard and sea/seaLights. */
  lanternTier: number
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
  /** Campaign nodes already cleared, from the same `buildClearedSet` the node
   *  map reads. Drives which straits out in the raid water are open. */
  clearedNodes: string[]
  /** nodeId -> 'locked' | 'available' | 'cleared', from `computeRaidMap` on the
   *  server. The water never decides this for itself. */
  nodeStatus: Record<string, string>
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
  /**
   * WHAT THE CAPTAIN IS WEARING, and it can change without leaving the water.
   *
   * The three used to be server props read straight through. The loadout sheet
   * equips hats, boats, skins and pets now (see sea/LoadoutBody), and the boat
   * standing on the chart behind that sheet has to change with them — swapping
   * a hull and watching the old one sail away would read as the equip having
   * failed, which is exactly how the boat-equip cache bug was reported before.
   *
   * Seeded from the props and resynced when they change, because a server prop
   * into useState without a resync keeps whatever it first mounted with.
   */
  const [characterColor, setCharacterColor] = useState(characterColor0)
  const [boatId, setBoatId] = useState(boatId0)
  const [hatId, setHatId] = useState(hatId0)
  const [petId, setPetId] = useState<string | null>(gear.petId ?? null)
  /** The equipped pet's definition, or null. Read off the live id so a swap in
   *  the loadout changes what is swimming beside the hull. */
  const petNow = useMemo(() => PETS.find(p => p.id === petId) ?? null, [petId])
  useEffect(() => { setCharacterColor(characterColor0) }, [characterColor0])
  useEffect(() => { setBoatId(boatId0) }, [boatId0])
  useEffect(() => { setHatId(hatId0) }, [hatId0])

  const [onSortie, setOnSortie] = useState(startSide === 'open')
  const sortieRef = useRef(startSide === 'open')
  /** Which side of each bay's coast she was on last frame, and whether that has
   *  been established yet. Both refs: the frame loop owns them and nothing on
   *  screen reads them. */
  const basinIn = useRef<boolean[]>(BAYS.map(() => false))
  const basinKnown = useRef(false)
  /** Which gate is holding her, if any. A ref beside the state so the loop can
   *  tell a change from a repeat without reading state it does not own. */
  const gateRef = useRef<string | null>(null)
  /** WHERE SHE WAS LAST FRAME. The wall test is a crossing test — see the note
   *  in the loop — so it needs the segment she travelled, not just where she
   *  ended up. */
  /**
   * WHERE SHE WAS LAST FRAME, and whether that is yet a real answer.
   *
   * The wall test is a CROSSING test — it asks whether the segment she
   * travelled this frame cut across a wall — so on the very first frame it has
   * no honest previous position to use. It started at 0,0, which is the
   * Mainland, so a captain resuming inside a bay was tested as having travelled
   * in a straight line from the middle of the fishing sea to wherever they
   * were: a line that crosses half the route's rock, and the rule then put them
   * back at whichever wall it hit first.
   *
   * That is the whole of "it always spawns me in a new place". The position was
   * saved correctly, restored correctly, and then shoved by a rule reading a
   * journey the boat never made — and WHICH wall it hit depended on where you
   * were, which is why it was somewhere new every time.
   *
   * `known` is the same guard `basinKnown` uses for the bay coasts, for exactly
   * the same reason, and it is cleared on a warp too: a teleport is not travel
   * and must never be tested as though it were.
   */
  const lastPos = useRef({ x: 0, y: 0 })
  const lastKnown = useRef(false)
  /**
   * ── ONLY THE ROCK THAT COULD ACTUALLY TOUCH HER ─────────────────────────
   *
   * The frame loop used to test the hull against EVERY solid thing on the
   * chart, every frame: about two hundred obstacle shapes and seventy-five
   * wall segments, each a closest-point and a hypot — twelve thousand
   * distance tests a second spent proving that rock ten thousand pixels away
   * is still ten thousand pixels away. On the fishing side not one bay wall
   * can ever matter and every one was tested anyway.
   *
   * So the loop works from a NEAR LIST: everything within NEAR_R of the hull,
   * rebuilt whenever she has moved NEAR_STEP from where the list was made.
   * Distance-triggered rather than clock-triggered on purpose — a teleport
   * (the warp home, a portal) invalidates the list by the same rule ordinary
   * sailing does, with no special case and no window where the old list is
   * trusted at the new position.
   *
   * The margin arithmetic: an obstacle can reach the hull only within its own
   * radius (the biggest on the chart is well under 700), and a wall only at
   * zero. Built at NEAR_R = 1600 and rebuilt after 400, the list is always
   * complete out to 1200 from wherever she now is — which clears the largest
   * influence radius with room to spare. A rebuild is one full scan, a few
   * times a second while under way, none at all at anchor.
   */
  const nearObs = useRef<Obstacle[]>([])
  const nearWalls = useRef<{ w: Wall; ax: number; ay: number; bx: number; by: number }[]>([])
  const nearAt = useRef({ x: Infinity, y: Infinity })
  /** Mirrored for the frame loop, which mounts once and would otherwise hold
   *  whatever was cleared when the page loaded — so a chapter finished in this
   *  session would leave its strait shut until a reload. */
  const clearedRef = useRef<string[]>(clearedNodes)
  useEffect(() => { clearedRef.current = clearedNodes }, [clearedNodes])
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
  /** THE SAME DECISION, for the canvas. Same reasoning as the class above and
   *  deliberately derived from the same two facts, so the two renderers cannot
   *  disagree about which wake a hull leaves. */
  const wakeKind = useMemo<WakeKind>(() => {
    if (shipRef.current) return 'plain'
    return (BOATS.find(b => b.id === boatId)?.wake as WakeKind | undefined) ?? 'plain'
  }, [boatId, onShip])
  const wakeKindRef = useRef(wakeKind)
  wakeKindRef.current = wakeKind
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
  /** Where the camera is actually pointed. The boat, unless the first voyage
   *  has taken it somewhere to show the captain an island. */
  const camAt = useRef({ x: 0, y: 0 })
  /** Set by the first-voyage tour to fly the camera; null gives it back. */
  const tourCam = useRef<{ x: number; y: number } | null>(null)
  /** And where it is telling her to sail, for the guiding path. */
  const tourGoal = useRef<{ x: number; y: number; r: number } | null>(null)
  /** Raised by the tour while the rod should stay stowed. */
  const tourHoldCast = useRef(false)
  /**
   * THE ONLY THING ON OFFER IS THE WATER.
   *
   * Raised while the first voyage is asking for a cast. The helm's precedence
   * puts a person ahead of a place and a place ahead of the sea, which is right
   * every other minute of the game and wrong in this one: Finn or a trader
   * drifting past while a captain is being taught to fish turns the one button
   * they have been told to use into a conversation, and the tutorial stops with
   * no way forward that it has explained.
   *
   * They are still THERE. The boats, the plates and the hail marks are all
   * untouched; it is the helm that stops offering them for the minute it takes
   * to land one fish.
   */
  const tourFishOnly = useRef(false)

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
    /**
     * ── IS THE POINTER OVER SOMETHING THAT IS NOT THE SEA? ─────────────────
     *
     * Most of this chart's panels are rendered INSIDE the wrapper — fixed to
     * the viewport, but still DOM children of it — so a wheel over an open
     * sheet reached this listener, which called preventDefault and zoomed the
     * water. On a desktop that meant a modal with a long list in it could not
     * be scrolled at all: the wheel went to the sea behind it every time.
     *
     * Walk up from whatever the pointer is over and stop at the wrapper. A
     * FIXED ancestor means an overlay of some kind, and a SCROLLABLE one means
     * a thing whose whole job is to answer this gesture. Either way the sea is
     * not what the wheel is for.
     *
     * No markers, no allow-list: a panel added tomorrow gets this for free,
     * which is the only version of this rule that stays true.
     */
    const overPanel = (start: EventTarget | null) => {
      let n = start instanceof Element ? start : null
      while (n && n !== el && n !== document.body) {
        const st = getComputedStyle(n)
        if (st.position === 'fixed') return true
        if ((st.overflowY === 'auto' || st.overflowY === 'scroll')
          && n.scrollHeight > n.clientHeight + 1) return true
        n = n.parentElement
      }
      return false
    }

    const onWheel = (e: WheelEvent) => {
      if (overPanel(e.target)) return
      // Only plain wheel — pinch-zoom on trackpads arrives as ctrl+wheel and
      // should zoom too, but browser-page zoom (ctrl+wheel on a mouse) is a
      // user setting this must not eat. Taking both is the lesser evil: the
      // chart itself has nothing of its own to scroll.
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
  /** The Gunwharf's chooser. Its own flag rather than a second use of
   *  `ashore`, which is the Mainland's. */
  const [wharf, setWharf] = useState(false)
  /**
   * A GOLDEN FISH WAITING ON AN ANSWER.
   *
   * Raised two ways, and the second is the fix. A catch pushes it up through
   * FishingHere's `onGolden`; and the chart ASKS on load, because the sell and
   * mount buttons used to live inside the catch card and dismissing that card
   * left the row unreachable. The fish stayed on the Almanac wall, but the
   * doubloons for it could never be taken again.
   */
  const [golden, setGolden] = useState<{ id: number; name: string; alreadyMounted: boolean } | null>(null)
  useEffect(() => {
    let alive = true
    void heldGolden().then(h => { if (alive && h) setGolden(h) }).catch(() => {})
    return () => { alive = false }
  }, [])
  /** The Charterhouse's voyage board, over the water. */
  const [voyageOpen, setVoyageOpen] = useState(false)

  /** The GPU island layer's camera, filled in when it mounts. Null whenever the
   *  flag is off, which is why every call below is optional. */
  const gpuRef = useRef<GpuHandle | null>(null)
  /** Every piece of land on the chart, ports and isles alike, in one list.
   *  Static: the ids, radii and positions are all chart data. */
  /**
   * ── WHICH BAY'S CONTENT IS ON SCREEN ────────────────────────────────────
   *
   * Everything the campaign puts in the water is expensive per item. A story
   * rock, a cache, a hull and an isle are each a handful of DOM nodes carrying
   * a CSS `filter`, and a filter gets its own backing surface — an isle is
   * 340px, an iPhone rasterises at three times that, and that is four megabytes
   * a rock. An island is worse: it is a baked canvas kept for the session, and
   * the renderer's own note puts thirty of those at the edge of what a phone
   * will hold.
   *
   * One chapter is fine. Five is a hundred and seven filtered elements and
   * seventy-odd bakes, and it is why the sea kept dying: not the coastline,
   * which was reduced twice and made no difference, but the CONTENT.
   *
   * Nothing is lost by drawing one bay's worth. They are ten thousand pixels
   * apart, a viewport is three, and a captain is in one bay or in none. This is
   * the same cull the canvas already does for its own sprites, applied to the
   * things that were never culled at all.
   */
  const [liveBay, setLiveBay] = useState<string | null>(null)
  const liveBayRef = useRef<string | null>(null)
  /**
   * AND WHETHER YOU ARE ACTUALLY IN IT.
   *
   * Separate from `liveBay` on purpose, because the two answer different
   * questions. `liveBay` is "whose rocks should be baked", and it reaches out
   * past a rim so a bay is built before you arrive rather than popping in at
   * the door. This is "am I in that chapter's water", which is a THRESHOLD —
   * and a threshold that fired three thousand pixels early would announce a
   * chapter you had not entered.
   */
  const [insideBay, setInsideBay] = useState<string | null>(null)
  const insideBayRef = useRef<string | null>(null)

  const gpuIslands = useMemo<GpuIsland[]>(() => {
    if (!GPU_ISLANDS) return []
    const out: GpuIsland[] = []
    for (const p of PLACES) {
      if (p.kind === 'water') continue
      out.push({ id: p.id, r: p.r, x: p.x, y: p.y, locked: false })
    }
    for (const i of ISLES) out.push({ id: i.id, r: i.r, x: i.x, y: i.y, locked: false })
    // THE CAMPAIGN'S ISLES, on the same generator as the fishing sea's. A bay
    // scattered with rocks you have to steer round is the whole difference
    // between water you sail and a heading you hold, and the machinery for
    // "land, procedurally, at this radius" already exists and is already what
    // every captain has learned to read.
    // ONLY THE BAY YOU ARE IN. Each of these is a baked canvas kept for as
    // long as it is in the list; all five chapters at once is seventy-odd of
    // them, which is where the memory went. See liveBay.
    for (const i of RAID_ISLES) {
      if (i.bay !== liveBay) continue
      const p = isleAt(i)
      if (p) out.push({ id: i.id, r: i.r, x: p.x, y: p.y, locked: false })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBay])
  /** Every wreck, rig, buoy, bone pile and moored smack, in chart order —
   *  the index is what gives each its own sway phase. */
  /** The tall scenery, for the near pass. The SAME list the depth test walks,
   *  handed over so the two agree about which rock is index seven. */
  const gpuOccluders = useMemo<GpuMark[]>(() => GPU_ISLANDS
    ? OCCLUDERS.map((o, i) => ({ art: o.art, x: o.x, y: o.y, size: o.size, i }))
    : [], [])

  /**
   * EVERY PAINTING THAT STANDS IN WATER, for the canvas.
   *
   * THE REEF AND THE HARBOUR WALL WERE LEFT BEHIND. When the marks moved to
   * the canvas only `LandmarkField` was gated, so the other two kept rendering
   * as DOM — and they are not the small half. The landmarks are 39; the reef is
   * three hundred and twenty rocks and pebbles and the wall is more again, each
   * one TWO masked <img> permanently mounted inside the world layer. It was the
   * largest remaining cost on the chart by a wide margin and it was invisible,
   * because it looked identical either way.
   *
   * The `i` offsets are the DOM's own (reef +500, wall +1200). They seed the
   * sway phase, so keeping them means the reef breathes in exactly the pattern
   * it always did rather than being reshuffled by the move.
   */
  /**
   * THE ROCK ACROSS EVERY ROAD THIS CAPTAIN HAS NOT EARNED.
   *
   * Sorted with the coast rather than appended to it, or a plug in a channel
   * behind would draw over the wall of the one in front where the fan closes at
   * the hub — the same painter's problem the walls themselves solve, and it does
   * not stop being a problem because the rocks arrived from somewhere else.
   */
  const shutPlugs = useMemo(() => [
    ...BAYS.filter(b => !bayOpen(b, clearedNodes)).flatMap(b => MOUTH_PLUGS[b.id] ?? []),
    // AND EVERY GATE STILL STANDING. Same list and the same reason: this is the
    // rock that differs from captain to captain, so it is sorted in with the
    // coast rather than appended to it — a gate drawn after the coast would sit
    // on top of whatever coast is south of it.
  ].sort((p, q) => p.y - q.y), [clearedNodes])

  /**
   * THE ROUTE BOUNDARIES, as broken water.
   *
   * Every standing wall in a bay, handed to the canvas as a line to draw a
   * shoal along. Gates are in the list only while they are shut, so beating the
   * boss that opens one takes its water away — the same fact the rock used to
   * carry, said by the same list.
   *
   * Each takes its own bay's PALE STOP, so a shoal belongs to the water it is
   * in: bone-grey in A Bigger Fish, and almost black out in the Last Fathom.
   */
  const surfLines = useMemo(() => {
    const paleOf = (b: Bay) => parseInt(b.sea[2].replace('#', ''), 16)
    const out: { ax: number; ay: number; bx: number; by: number; tint: number }[] = []

    // ── THE ROUTE WALLS INSIDE EACH BAY ──
    for (const w of WALLS) {
      if (!wallUp(w, clearedNodes)) continue
      const e = wallEnds(w)
      const bay = BAY_BY_ID[w.bay]
      if (!e || !bay) continue
      out.push({ ax: e.ax, ay: e.ay, bx: e.bx, by: e.by, tint: paleOf(bay) })
    }

    // ── AND THE TWO SIDES OF EVERY STRAIT ──
    //
    // Built from the same strait space the rock was, so the shoal edges the
    // passage exactly where the passage has always been. One line a side rather
    // than two rows of boulders plus shingle: a strait is two thousand pixels
    // long, which is more than enough to see four rocks repeat down it.
    for (const b of BAYS) {
      const L = straitLen(b)
      for (const side of [-1, 1]) {
        const a = fromStrait(b, 0, side * b.half)
        const z = fromStrait(b, L, side * b.half)
        out.push({ ax: a.x, ay: a.y, bx: z.x, by: z.y, tint: paleOf(b) })
      }
    }
    return out
  }, [clearedNodes])

  /**
   * PUSHED WHEN IT CHANGES, AND WHENEVER THE CANVAS IS READY FOR IT.
   *
   * An effect alone would fire once, and on a first load it fires before the
   * renderer exists — `gpuRef.current` is null and the shoals never arrive. The
   * portal has the same shape of problem and solves it by re-pushing from the
   * loop; this does the same, on the proximity tick rather than every frame,
   * because a reference compare a few times a second is enough to notice both
   * a gate coming down and a canvas turning up.
   */
  /** The canvas bakes islands from a list it is given; when the bay changes it
   *  is handed a new one and reconciles — see its `islands` handle. Pushed here
   *  rather than from the loop because it happens a few times a session. */
  useEffect(() => { gpuRef.current?.islands(gpuIslands) }, [gpuIslands])

  const surfRef = useRef(surfLines)
  surfRef.current = surfLines
  const surfPushed = useRef<typeof surfLines | null>(null)

  const gpuMarks = useMemo<GpuMark[]>(() => GPU_ISLANDS
    ? [
      ...LANDMARKS.map((m, i) => ({ art: m.art, x: m.x, y: m.y, size: m.size, sway: m.sway, i })),
      ...REEF.map((m, i) => ({ art: m.art, x: m.x, y: m.y, size: m.size, i: i + 500 })),
      ...ANCHORAGE_WALL.map((m, i) => ({ art: m.art, x: m.x, y: m.y, size: m.size, i: i + 1200 })),
      ...BAY_WALLS.map((m, i) => ({ art: m.art, x: m.x, y: m.y, size: m.size, i: i + 4000 })),
      // The straits this captain has not opened, filled in. Keyed off the
      // cleared list so a chapter finished this session drops its plug on the
      // next render rather than on the next reload.
      ...shutPlugs.map((m, i) => ({ art: m.art, x: m.x, y: m.y, size: m.size, i: i + 9000 })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
    : [], [shutPlugs])

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
  /** HOW ROUGH IT IS WHERE SHE IS, 0 to 1, eased. A ref because the frame loop
   *  owns it and re-rendering the chart sixty times a second to record that the
   *  sea is slightly heavier would undo the whole reason that loop exists. */
  const rough = useRef(0)
  const [inAnchorage, setInAnchorage] = useState(startSide !== 'fishing')
  const sideRef = useRef(startSide !== 'fishing')
  /** THE BERTH SHEET, and the second half of the Gunwharf's chooser: the
   *  muster, the mounts, and the confirm that actually changes the hull. */
  const [swapAsk, setSwapAsk] = useState(false)
  /**
   * THE PORTAL SHEET. Opened by sailing THROUGH the ring — that is the
   * activation gesture the portal exists for, so this is deliberately not the
   * docks' press-to-ask manners: the ring is the button, and crossing it is
   * the press. `portalIn` is the hysteresis so floating inside does not
   * reopen it the frame after it is dismissed.
   */
  const [portalOpen, setPortalOpen] = useState(false)
  /**
   * THE PASSAGE ITSELF.
   *
   * A warp used to be a cut: the boat was there, and then it was somewhere
   * else, with nothing in between. That reads as a bug the first time and as
   * cheap every time after — the portal is the most expensive thing a captain
   * builds and it was the least eventful thing in the game.
   *
   * So a jump is three beats. The water closes over you in the colour of where
   * you are going, the boat is moved while the screen is white, and it opens
   * again on the other side. `warpTo` fires at the seam, so the move itself is
   * never visible and there is nothing to get wrong about timing beyond making
   * the two halves the same length.
   *
   * DOM and CSS, deliberately: this is one element and two keyframes, and the
   * one thing it must never do is take a WebGL context away from the chart it
   * is drawn over. See the note in DialFx.
   */
  const [warping, setWarping] = useState<{ x: number; y: number; accent: string } | null>(null)
  const portalIn = useRef(false)
  /** The same fact, where the helm can read it. */
  const [inPortalNow, setInPortalNow] = useState(false)
  /** Seconds held inside the eye. Reset by leaving it, and by being taken. */
  /** The charge: the beat between being taken and being asked. While it runs
   *  the flourish plays and the helm is dead weight — the portal has her. */
  const [portalCharge, setPortalCharge] = useState(false)
  /** The island berths this captain has taught the portal. Local, so a purchase
   *  lands in the sheet without a reload — same shape as the tier. */
  const [portalPorts, setPortalPorts] = useState<string[]>(portal.ports)
  const chargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (chargeTimer.current) clearTimeout(chargeTimer.current) }, [])
  const [portalTier, setPortalTier] = useState(portal.tier)

  const [found, setFound] = useState<Set<string>>(() => new Set(discovered))

  /**
   * THE STONE, derived from the chests already opened rather than stored.
   *
   * `found` is the live set — goAshore adds to it the moment a chest opens — so
   * the portal wakes on the same beat the stone is pulled out of the sand, with
   * no refetch and nothing to keep in step.
   */
  const portalStone = useMemo(() =>
    // A BUILT PORTAL IS NEVER DEAD WATER. The first stone is what wakes it, but
    // anybody who already owns a rung above the first built it under older
    // rules, and showing them a dormant well beside a ladder they can still
    // sail from would be the chart contradicting itself. Nobody live is in that
    // state; it costs one condition to make sure nobody ever is.
    hasPortalStone([...found]) || portalTier > 1, [found, portalTier])
  /** Does this captain hold the stone for a given rung? Off the same live set,
   *  so buying one and opening the next chest both land without a refetch. */
  const stoneFor = useCallback(
    (tier: number) => hasStoneFor(tier, [...found]), [found])
  /** Mirrored, because the frame loop mounts with [] deps and would otherwise
   *  hold whichever answer was true when the page loaded. */
  const portalStoneRef = useRef(portalStone)
  useEffect(() => { portalStoneRef.current = portalStone }, [portalStone])

  /**
   * WHAT THE WELL IS DRAWN FROM. Memoised on the tier, because the layer keeps
   * whatever object it is handed and a fresh one every render would be a new
   * spec sixty times a second for a fact that changes when you buy something.
   *
   * The accent is the destination band's own colour, parsed out of the hex the
   * tier table already carries: Pixi tints are numbers, and keeping one source
   * of that colour beats a second table that can disagree with the first.
   */
  const gpuPortal = useMemo(() => {
    const t = PORTAL_TIERS.find(p => p.tier === portalTier) ?? PORTAL_TIERS[0]
    return {
      x: PORTAL.x, y: PORTAL.y, r: PORTAL.r,
      accent: parseInt(t.accent.slice(1), 16),
      tier: t.tier,
      // DEAD WATER only when the portal can reach NOTHING. A stone is no longer
      // the whole story: a captain with a berth and no stone has somewhere to
      // go, and water that reads as dead while it works is worse than no cue.
      locked: !portalStone && portalPorts.length === 0,
    }
  }, [portalTier, portalStone, portalPorts])

  /**
   * MIRRORED, because the frame loop below is mounted with `[]` deps and never
   * re-runs. Reading `gpuPortal` from its closure would pin the well to
   * whatever tier you logged in on: buy the Abyss and the water would not
   * deepen until you reloaded. The house trap, and the house answer.
   */
  const gpuPortalRef = useRef(gpuPortal)
  useEffect(() => {
    gpuPortalRef.current = gpuPortal
    // Pushed straight away rather than waiting for the next frame, so the well
    // deepens on the beat the purchase lands. The frame loop owns it after that.
    gpuRef.current?.portal(gpuPortal, inPortal(pos.current.x, pos.current.y), 0)
  }, [gpuPortal])
  useEffect(() => { setPortalTier(portal.tier) }, [portal.tier])
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
      // Never actually read: a fight happens past the sortie, where the thing
      // on the water is a warship. Here so both hulls answer the same
      // questions and the loop never has to ask which one it is holding.
      beamW: FISHING_HULL_W,
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
      // HOW MUCH SHIP THERE ACTUALLY IS, in world px. WARSHIP_W is the box the
      // art is drawn in; this is the hull inside it, which is what a fight
      // needs to know to hang its effects on her at the right size.
      beamW: WARSHIP_W * beam,
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
    // ── AND SHE FORGETS WHICH SIDE OF EVERY COAST SHE WAS ON ──────────
    //
    // The bay walls work off which side of the shape she was on LAST FRAME, so
    // a boat lifted out of a bay reads as having crossed its coast without
    // passing the mouth — and the wall would do exactly what it is for and shove
    // her straight back in. Clearing this makes the next frame ADOPT wherever
    // she now is, which is the same thing it does when the chart first loads.
    basinKnown.current = false
    // AND THE WALLS FORGET THE JOURNEY. A teleport is not travel: tested as a
    // crossing it is a line from the old place to the new one, straight through
    // everything in between, and the route's own rock would refuse the arrival.
    lastKnown.current = false
    portalIn.current = false
    setPortalOpen(false)
    vibrate([16, 40, 24])
    void saveSeaPosition(x, y, [...fogPending.current])
    fogPending.current.clear()
  }, [saveSeaPosition])

  /** Teaching the portal a berth. Same shape as buyTier, and deliberately not
   *  folded into it: one is a rung on a ladder and the other is one of a set,
   *  and a single function taking a discriminator would have to re-explain that
   *  difference at every call site. */
  const buyPort = useCallback(async (id: string) => {
    if (portalBusy) return
    setPortalBusy(true)
    setPortalErr(null)
    try {
      const res = await buyPortalPort(id)
      if ('error' in res) setPortalErr(res.error)
      else {
        setPortalPorts(res.ports)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
        vibrate([0, 30, 40, 60])
      }
    } catch { setPortalErr('That did not go through. Try again.') }
    setPortalBusy(false)
  }, [portalBusy])

  /**
   * TAKE THE PASSAGE. Shuts the sheet, drops the curtain, moves her behind it.
   *
   * The move happens at the SEAM, not on the press, which is the whole trick:
   * `warpTo` snaps the camera, and a snap under a white screen is not a snap.
   */
  const jumpTo = useCallback((x: number, y: number, accent: string) => {
    setPortalOpen(false)
    vibrate([14, 60, 22, 60, 30])
    warpStart = performance.now()
    setWarping({ x, y, accent })
  }, [])

  useEffect(() => {
    if (!warping) return
    // Half a second under, half a second out. Long enough to be a passage,
    // short enough that a captain hopping between two waters is not waiting on
    // a cutscene every time.
    const go = setTimeout(() => warpTo(warping.x, warping.y), WARP_MS)
    const done = setTimeout(() => setWarping(null), WARP_MS * 2)
    return () => { clearTimeout(go); clearTimeout(done) }
  }, [warping, warpTo])

  const buyTier = useCallback(async () => {
    if (portalBusy) return
    setPortalBusy(true)
    setPortalErr(null)
    try {
      const res = await buyPortalTier()
      if ('error' in res) setPortalErr(res.error)
      else {
        setPortalTier(res.tier)
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
  /**
   * THE BOAT'S POSITION, AT THE PROXIMITY TICK'S PACE.
   *
   * `pos` is a ref written every frame, which is right for the loop and useless
   * to React. The compass needs a bearing, and a bearing that only moved when
   * something else happened to re-render would lag the boat visibly.
   *
   * So it rides the proximity tick — a few times a second, which is already the
   * cadence everything else on the HUD updates at — and is QUANTISED to 40px
   * before it is stored. A bearing does not change usefully inside a boat
   * length, and rounding here means a slow drift does not re-render the chart
   * dozens of times a second for a needle that would not visibly turn.
   */
  // boatAt is GONE, and it is worth a line saying why. It was "the compass's
  // only source", quantised to 40px so the chart would not re-render for a
  // needle that had not moved — and then the compass was handed the `pos` ref
  // and stopped reading it, which left a state with no consumer re-rendering
  // this entire component about twelve times a second the whole time she was
  // under way. The single most expensive React work on the chart, spent on
  // nothing at all.
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
  /**
   * ── THE MARK HAS TO TURN ON THE CATCH THAT EARNS IT ───────────────────────
   *
   * Every one of his jobs counts CATCHES — a zone, a rarity, a run of perfects,
   * an ancient — and all of it is counted on the server, so the chart cannot
   * know a job just finished by watching its own state. It was only re-read on
   * mount and on hailing him, which meant the gold mark and the gold bearing
   * appeared on the NEXT PAGE LOAD: you landed the fish that finished the job
   * and the sea said nothing until you reloaded.
   *
   * So a reel asks again — but only when the answer can have changed. No job
   * open, or one already finished, and there is nothing on this screen that
   * could move: those cases cost a comparison rather than a query.
   *
   * DEBOUNCED, because `finnState` counts catches across several tables and a
   * good run lands a fish every few seconds. One read a second and a bit,
   * however many fish arrive in it, and the last catch of a burst is always
   * inside the window that follows it.
   */
  const finnPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshFinnSoon = useCallback(() => {
    const cur = finnRef.current
    if (!cur?.quest || cur.questReady) return
    if (finnPollRef.current) return
    finnPollRef.current = setTimeout(() => {
      finnPollRef.current = null
      void finnState().then(f => { if (f) setFinn(f) })
    }, 1200)
  }, [])
  useEffect(() => () => { if (finnPollRef.current) clearTimeout(finnPollRef.current) }, [])

  const onFinnReel = useCallback((r: { perfectStreak: number; caught: number }) => {
    // FIRST, and outside the bet guard below: a job and a wager are different
    // things, and a captain with no wager running is exactly the captain most
    // likely to have a job on.
    refreshFinnSoon()
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
  }, [refreshFinnSoon])

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
  const [nearIsle, setNearIsle] = useState<Isle | null>(null)
  /** The campaign encounter alongside, if any. */
  const [nearEnc, setNearEnc] = useState<Encounter | null>(null)
  /** The chest within arm's reach, and the gate refusing her, if any. Both set
   *  from the frame loop and read by the helm. */
  const [nearCache, setNearCache] = useState<Cache | null>(null)
  const [heldBy, setHeldBy] = useState<Wall | null>(null)
  /** The story post within arm's reach, and the scene currently playing over
   *  the water. */
  const [nearBeat, setNearBeat] = useState<Beat | null>(null)
  /** The way home, if you are floating on one that has opened. */
  const [nearWayHome, setNearWayHome] = useState<ReturnPortal | null>(null)
  /** The book, open or shut. */
  const [almanacOpen, setAlmanacOpen] = useState(false)
  /** The locker, open or shut. */
  const [yardOpen, setYardOpen] = useState(false)
  /** The raid being fought over the chart, by raidId. */
  const [fightId, setFightId] = useState<string | null>(null)
  /** The boss card standing open in front of it, by node id. */
  const [bossCard, setBossCard] = useState<string | null>(null)
  /**
   * ── THE CARD IS READ BEFORE IT IS ASKED FOR ─────────────────────────────
   *
   * Fetching on the press meant a beat of "Reading the charts…" standing where
   * the card should be, and a sea zooming in behind a loading line. Coming
   * within reach of a hull is the signal: you are almost certainly about to
   * press it, the read is idempotent, and it costs one query nobody waits for.
   *
   * The CHUNK is warmed at the same time and matters as much. The card belongs
   * to /expeditions and is large; on a cold session the download was the slower
   * half of that wait.
   */
  const [bossData, setBossData] = useState<BossCardState | null>(null)
  /** The fight's own loadout, read on the same approach for the same reason. */
  const [raidData, setRaidData] = useState<RaidSheetState | null>(null)
  const bossReadRef = useRef(false)
  /** The same fact, for the render: the HUD stands down in a fight. */
  const fightOn = fightId !== null || bossCard !== null
  // ── THE FIGHT IS THESE TWO HULLS ─────────────────────────────────────────
  //
  // Not a scene of them. The chart is already drawing your man-o-war and the
  // enemy's flagship, in the water, at an honest scale against each other, and
  // the fight borrows them rather than painting its own pair on a horizon.
  //
  // Two channels, both refs, because both change every frame and neither may
  // touch React: `anchors` goes OUT (where the hulls are on screen, so the
  // fight can hang its effects on them) and `shipFx` comes BACK (what the fight
  // is doing to them, so the loop below can draw it).
  const fightEncRef = useRef<Encounter | null>(null)
  /** Whether the guns are out, for the frame loop (which must not read state). */
  const fightOnRef = useRef(false)
  /** The viewport the fight last measured itself against, so `fightFrame` can
   *  tell a real resize from sixty identical reads a second. */
  const fightViewRef = useRef({ w: 0, h: 0 })
  /** And whether she has ARRIVED. Until she has, the loop runs in full so she
   *  can be sailed onto her station; after, it stands down to `fightFrame`. */
  const fightFastRef = useRef(false)

  /**
   * THE ONLY THING STILL MOVING ON THIS CHART.
   *
   * Everything a frame normally does — proximity, marks, the fleet, traders,
   * weather, walls, the near pass — is about a boat that is going somewhere,
   * and in a duel she is not. What is left is the pose of two hulls and what
   * the fight is doing to them, which is a couple of dozen lines of arithmetic
   * and three style writes.
   *
   * Her bob stays. It is one sine and it is the difference between a ship
   * holding station and a sprite pasted on the water.
   */
  const fightFrame = useCallback((now: number) => {
    const t = now / 1000
    const z = zoomRef.current

    // ── THE WORLD IS STILL A WORLD WHILE THE GUNS ARE OUT ────────────────────
    //
    // THIS IS WHY THE ENEMY SHIP WAS NOT THERE, and it is the rule the main
    // loop writes down four hundred lines below: "the same string, the same
    // frame. These two layers are one world drawn in two passes; a transform
    // written to one and not the other would put the near scenery a frame
    // behind the far scenery."
    //
    // This frame is what the chart stands down to once she is on station, and
    // it wrote everything EXCEPT that. The boat, the skipper, the anchors and
    // the wards all came off a live `camAt` and `zoom`; the DOM world was left
    // holding whatever transform the main loop had put on it at the moment of
    // arrival. Every mark on the chart is in that layer — the enemy hull most
    // of all, because over the sea the fight hides its OWN ship and expects
    // this one to be the enemy. So the ward drew in exactly the right place
    // and the ship it was wrapped around was somewhere off the side of the
    // screen, which reads as "you never gave these enemies a boat".
    //
    // The two passes and the canvas are written here from the same three
    // numbers, in the same frame, exactly as the main loop does it. Cheap: it
    // is three style writes on a frame that was already touching the boat.
    const world = worldRef.current
    if (world) {
      const tr = `scale(${z}) scaleY(${GROUND})`
        + ` translate3d(${-camAt.current.x}px, ${-camAt.current.y}px, 0)`
      world.style.transform = tr
      if (frontRef.current) frontRef.current.style.transform = tr
    }
    gpuRef.current?.camera(camAt.current.x, camAt.current.y, z)

    // AND THE BOX THE ANCHORS ARE MEASURED FROM. The main loop refreshes this
    // on its proximity tick, which is one of the things that stops running
    // here — so a phone that turns, or an address bar that slides away, would
    // hang every hitsplat off a stale rectangle for the rest of the fight.
    // Re-measured only when the window has actually changed size, because the
    // read forces layout and the answer almost never moves.
    if (fightViewRef.current.w !== window.innerWidth
      || fightViewRef.current.h !== window.innerHeight) {
      fightViewRef.current = { w: window.innerWidth, h: window.innerHeight }
      fitRef.current?.()
      wrapBoxRef.current = wrapRef.current?.getBoundingClientRect() ?? null
    }

    const pfx = shipFxRef.current?.player
    const fxX = pfx ? pfx.x : 0
    const fxY = pfx ? pfx.y : 0
    const fxRot = pfx ? pfx.rot : 0
    const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
    const offX = (pos.current.x - camAt.current.x) * z
    const offY = (pos.current.y - camAt.current.y) * z * GROUND

    const boat = boatRef.current
    if (boat) {
      boat.style.transform =
        `translate(-50%, -50%) translate(${fxX}px, ${fxY}px) scale(${z})`
        + ` translateY(${bob}px) scaleX(${facing.current}) rotate(${fxRot}deg)`
      boat.style.marginLeft = `${offX}px`
      boat.style.marginTop = `${offY}px`
    }
    gpuRef.current?.skipper({
      bob, heel: fxRot, facing: facing.current, zoom: z,
      frame: frameRef.current, stage: 0,
      offX: offX + fxX, offY: offY + fxY,
    })

    // The enemy's hull, and the anchors both sides hang their effects on. Pure
    // arithmetic off a fixed world point, so it is cheap enough to keep honest
    // rather than freezing a last-known value and hoping the camera never
    // shifts under it.
    const hull = fightHullRef.current
    const box = wrapBoxRef.current
    if (hull && box) {
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      // WRITTEN IN PLACE. Three fresh objects a frame is three objects a frame
      // for the collector to sweep up, on a phone, for numbers that mostly do
      // not change — and the reader on the other side only ever looks at the
      // fields.
      const A = anchorsRef.current ?? (anchorsRef.current = {
        player: { x: 0, y: 0, w: 0 }, enemy: { x: 0, y: 0, w: 0 },
      })
      A.player.x = cx + offX
      A.player.y = cy + offY
      A.player.w = hullRef.current.beamW * z
      A.enemy.x = cx + (hull.at.x - camAt.current.x) * z
      A.enemy.y = cy + (hull.at.y - camAt.current.y) * z * GROUND
      A.enemy.w = hull.encW * z
      // ── THE WARDS, EVERY FRAME ────────────────────────────────────────
      //
      // A shield is a state rather than an event (see seaAbilityFx), so it is
      // told where its hull is on every frame it is holding. Cyan for yours,
      // violet for theirs — the same two colours their shield segments already
      // wear on the HP bars, so the shell on the water and the number in the
      // deck are plainly the same fact.
      // Each shell is cut to its OWN hull: your beam is what the loop already
      // measures her at, theirs is the width the encounter is drawn at. A
      // skiff's ward and a flagship's should not be the same shape.
      const pfx2 = shipFxRef.current?.player
      gpuRef.current?.ward('player', pos.current.x, pos.current.y,
        hullRef.current.beamW, 0x5eead4, !!pfx2?.guard)
      gpuRef.current?.ward('enemy', hull.at.x, hull.at.y,
        hull.encW, 0xc084fc, !!shipFxRef.current?.enemy?.guard)
      // Conditions ride the same frame and the same measurements. Burning,
      // frozen and snared are states of a SHIP, so they belong on the hull and
      // follow it, not in a chip on a nameplate.
      gpuRef.current?.status('player', pos.current.x, pos.current.y,
        hullRef.current.beamW, pfx2?.status ?? 0)
      gpuRef.current?.status('enemy', hull.at.x, hull.at.y,
        hull.encW, shipFxRef.current?.enemy?.status ?? 0)

      const efx = shipFxRef.current?.enemy
      const el = enemyHullRef.current
      if (el && efx) {
        el.style.transition = efx.sink
          ? 'opacity 1.3s ease-in, transform 1.3s ease-in'
          : 'none'
        el.style.opacity = efx.sink ? '0' : '1'
        el.style.transform = efx.sink
          ? `translate(${efx.x}px, ${efx.y + 42}px) rotate(${efx.rot - 13}deg)`
          : `translate(${efx.x}px, ${efx.y}px) rotate(${efx.rot}deg)`
      }
    }
  }, [])
  /** Where the camera holds while the guns are out. See FIGHT_FRAME. */
  const fightCam = useRef<{ x: number; y: number } | null>(null)
  /** The world point she takes up in a duel. Chosen once, when the guns come
   *  out, against the rocks that are actually there. */
  const fightStation = useRef<{ x: number; y: number } | null>(null)
  /** The enemy's place and drawn width, resolved once. Both are fixed for the
   *  length of a fight, and the frame loop should not be re-deriving them. */
  const fightHullRef = useRef<{ at: { x: number; y: number }; encW: number } | null>(null)

  /**
   * ── FINDING SOMEWHERE TO STAND ──────────────────────────────────────────
   *
   * The duel's shape says where she ought to be: a fixed screen offset down
   * and to the left of the hull she is taking on. The sea does not care about
   * the composition — a bay is scattered with rock precisely so that sailing
   * it is steering — so that point is sometimes inside a boulder, and easing
   * her into it parked a ship of the line in a rock.
   *
   * WHY NOT JUST PUSH HER OUT. Because a push is the last resort, not the
   * plan: it moves her the shortest distance to open water, which is off the
   * mark by exactly as much as the rock is deep, and it can leave her behind
   * the very thing she is meant to be shooting at. Far better to first ask
   * whether a slightly different engagement is clear, since almost always one
   * is — stand off a little further, close a little nearer, come at it from a
   * shade higher or lower. All of those are the same fight; none of them are
   * a ship inside a rock.
   *
   * So: walk a handful of honest variations of the same formation, take the
   * first that is clear, and only if every one is fouled fall back to pushing
   * the ideal out of whatever it landed in. Ordered nearest-to-ideal first, so
   * a clear sea always yields exactly the intended shot.
   */
  const pickStation = useCallback((ex: number, ey: number) => {
    /** Is this point inside anything solid? */
    const fouled = (x: number, y: number) => {
      for (const o of allObstacles()) {
        const ax = o.x, ay = o.y
        const bx = o.x2 ?? o.x, by = o.y2 ?? o.y
        const sx = bx - ax, sy = by - ay
        const len2 = sx * sx + sy * sy
        const t = len2 > 0
          ? Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / len2))
          : 0
        const cx = ax + sx * t, cy = ay + sy * t
        if (Math.hypot(x - cx, y - cy) < o.r) return true
      }
      return false
    }

    // Nearest to the intended mooring first. `s` is how far off she stands,
    // `lift` slides the engagement along the bay without changing its shape.
    // The chart is authored so the first of these is clear at every boss (see
    // the dock check in check-islands); the rest are what stops a fight ever
    // being impossible if a rock is moved and the check is skipped.
    const tries: [number, number][] = [
      [1, 0], [0.86, 0], [1.16, 0],
      [1, -0.22], [1, 0.22],
      [0.86, -0.28], [1.16, 0.28],
      [0.72, 0], [1.34, 0],
      [0.86, 0.34], [1.16, -0.34],
    ]
    for (const [sc, lift] of tries) {
      const x = ex + DOCK.x * sc
      const y = ey + DOCK.y * sc + Math.abs(DOCK.y) * lift
      if (!fouled(x, y)) return { x, y }
    }

    // EVERY SHAPE IS FOULED, which means she is fighting in a pocket. Push the
    // ideal out of whatever it is sitting in and take that: off the mark, but
    // on water.
    let x = ex + DOCK.x, y = ey + DOCK.y
    for (let pass = 0; pass < 6; pass++) {
      let moved = false
      for (const o of allObstacles()) {
        const ax = o.x, ay = o.y
        const bx = o.x2 ?? o.x, by = o.y2 ?? o.y
        const sx = bx - ax, sy = by - ay
        const len2 = sx * sx + sy * sy
        const t = len2 > 0
          ? Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / len2))
          : 0
        const cx = ax + sx * t, cy = ay + sy * t
        let nx = x - cx, ny = y - cy
        let d = Math.hypot(nx, ny)
        if (d >= o.r) continue
        // Dead centre of a circle has no direction to leave by. Any is as good
        // as any other; picking one is what stops a NaN.
        if (d < 0.001) { nx = 1; ny = 0; d = 1 }
        x = cx + (nx / d) * o.r
        y = cy + (ny / d) * o.r
        moved = true
      }
      if (!moved) break
    }
    return { x, y }
  }, [])
  const anchorsRef = useRef<{ player: ShipAnchor; enemy: ShipAnchor } | null>(null)
  const shipFxRef = useRef<{ player: ShipFx; enemy: ShipFx } | null>(null)
  /** The enemy's hull on the chart, so the fight's blows can land on it. */
  const enemyHullRef = useRef<HTMLDivElement | null>(null)
  /** The chart's own box. Refreshed on the proximity tick rather than per
   *  frame: it moves when the window does and not otherwise. */
  const wrapBoxRef = useRef<DOMRect | null>(null)
  /** Which half of the portal is showing, on a phone. Both are up on a desktop
   *  and this is not read. */
  const [portalTab, setPortalTab] = useState<'waters' | 'berths'>('waters')
  const [reading, setReading] = useState<string | null>(null)
  /**
   * A NODE'S OWN SHEET, AND THE INTRO THAT RUNS BEFORE IT.
   *
   * On a milestone or an event the scene is an INTRO: it explains what you have
   * sailed into, and the claim or the choice AFTER it is what actually clears
   * the node. So the scene plays with no write, and finishing it opens the
   * sheet — which is exactly what the campaign map does with the same nodes.
   *
   * `seenIntros` is per session, like the map's own: having watched it once,
   * coming back to the rock goes straight to the sheet.
   */
  const [sheetNode, setSheetNode] = useState<string | null>(null)
  const [introNode, setIntroNode] = useState<string | null>(null)
  const seenIntros = useRef<Set<string>>(new Set())

  /** Open a campaign node that is not a fight: the scene first if it has one and
   *  this captain has not seen it, then whatever the node actually asks. */
  const openNode = useCallback((n: RaidNode, cleared: boolean) => {
    if (readableAtSea(n)) { setReading(n.id); return }
    if (n.scene && !cleared && !seenIntros.current.has(n.id)) { setIntroNode(n.id); return }
    setSheetNode(n.id)
  }, [])
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
  /**
   * THE CREW HUB: where everybody is, and what to do about it.
   *
   *  is the dot. It is read when you first cross into the
   * expeditions and again whenever the hub closes — both moments the answer can
   * have changed, and neither of them a poll. A dot that costs a round trip
   * every few seconds is a dot that is not worth having.
   */
  const [crewHubOpen, setCrewHubOpen] = useState(false)
  const [crewWaiting, setCrewWaiting] = useState(false)
  const crewPolled = useRef(false)
  const pollCrew = useCallback(() => {
    void crewHub().then(
      r => { if (!('error' in r)) setCrewWaiting(r.recruitsWaiting > 0 || r.voyage?.ready === true) },
      () => {})
  }, [])
  useEffect(() => {
    if (!inAnchorage || crewPolled.current) return
    crewPolled.current = true
    pollCrew()
  }, [inAnchorage, pollCrew])
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
  /** Opened by mooring at the Tally House rather than from the HUD disc, which
   *  is the whole difference between reading the day's orders and being paid
   *  for them. See DailyOrders' note on canClaim. */
  const [ordersAshore, setOrdersAshore] = useState(false)
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
  /** The same list, where the frame loop can see it. The canvas redraws the
   *  near pass every frame; React only hears about it when the SET changes. */
  const occludingRef = useRef<number[]>([])
  const edgeRef = useRef(false)
  /** The isle whose landing panel is open, and what it gave up. `landed`, not
   *  `ashore` — that name is already the Mainland's three-card chooser. */
  const [landed, setLanded] = useState<{ isle: Isle; result: AshoreResult } | null>(null)
  const [landing, setLanding] = useState(false)
  /** Mirrors `landing` for the callback, which is built once. */
  const landingRef = useRef(false)
  const [hailing, setHailing] = useState<Trader | null>(null)
  /** Kip's own conversation. He is hailed like a talker and then handled here
   *  instead, because what he offers is a game mode rather than a deal. */
  const [kipOpen, setKipOpen] = useState(false)

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
      if (wharf) { setWharf(false); return }
      if (voyageOpen) { setVoyageOpen(false); return }
      if (trawlOpen) { setTrawlOpen(false); return }
      if (ordersOpen) { setOrdersOpen(false); setOrdersAshore(false); return }
      if (trawlsPeek) { setTrawlsPeek(false); return }
      if (finnOpen) { setFinnOpen(false); setFinnLines(null); return }
      if (finnTalk) { setFinnTalk(null); return }
      if (kipOpen) { setKipOpen(false); return }
      if (hailing) { setHailing(null); return }
      if (picking) { setPicking(false); return }
      if (crewOpen) { setCrewOpen(false); return }
      if (crewHubOpen) { setCrewHubOpen(false); return }
      if (almanacOpen) { setAlmanacOpen(false); return }
      if (yardOpen) { setYardOpen(false); return }
      if (reading) { setReading(null); return }
      if (sheetNode) { setSheetNode(null); return }
      if (introNode) { setIntroNode(null); return }
      if (folkOpen) { setFolkOpen(false); return }
      if (mapOpen) { setMapOpen(false); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [find, ashore, wharf, voyageOpen, trawlOpen, ordersOpen, trawlsPeek, finnTalk, finnOpen, hailing, kipOpen, picking, crewOpen, crewHubOpen, reading, sheetNode, introNode, almanacOpen, yardOpen, folkOpen, mapOpen])
  /** Keys dealt with today, so a trader you have already traded with stops
   *  offering. Seeded from the server on mount and appended to on a deal. */
  const [dealt, setDealt] = useState<string[]>(dealtToday)
  /** Somebody you have already dealt with today, where the frame loop can see
   *  it. They do not vanish — a person disappearing once you are done with them
   *  is what makes a world feel like a vending machine — they just dim. */
  const dealtRef = useRef(dealt)
  dealtRef.current = dealt
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

  /**
   * KIP, ON THE WATER.
   *
   * Built as a talker so he is drawn, named, drifted and hailed by exactly the
   * machinery everybody else out here uses — a bespoke sprite and a bespoke
   * proximity test would be a second implementation of a solved problem, and
   * the one that drifts. What is bespoke is only what happens when you hail
   * him: his key is caught below and opens his own scene instead of the trader
   * panel, the same way Finn's hail does.
   */
  const smuggler = useMemo<Trader>(() => ({
    key: KIP.key,
    kind: 'talker' as const,
    name: KIP.name,
    x: KIP.x, y: KIP.y,
    line: KIP.line,
    // Barely moving. Everyone else out here bobs on an 88 second orbit; a man
    // trying not to be noticed sits still, and on a chart where every other
    // hull is swinging, stillness is the thing that catches the eye.
    driftR: 12, driftRate: (Math.PI * 2) / 150, driftPhase: 1.7,
    look: {
      characterColor: KIP.look.characterColor,
      boatId: KIP.look.boatId,
      hatId: KIP.look.hatId,
      // A ROD IN HIS HANDS. Every other hull on this water carries one, and a
      // man with empty hands reads as an unfinished sprite rather than as a
      // character. Plain and unglowing on purpose: a glow is something a player
      // earned, and he is meant to look like somebody who sails rather than
      // somebody with a quest marker over him.
      rodSlug: KIP.look.rodSlug,
      hook: null,
    },
    deal: 'talk' as const, topic: 'chat' as const,
    // NOT "An old hand", which is what KIND_LABEL calls every talker. He is the
    // only door into a game mode and the plate should say so.
    roleLabel: 'Tide Run',
    mood: 'Tide Run', lines: [KIP.line],
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
  /** Reused every frame. Forty small objects a frame is forty small objects a
   *  frame; the canvas reads this and is done with it before the next one. */
  const fleetAt = useRef<{
    key: string; x: number; y: number; facing: number; scale: number; dim: number; ang: number
    /** Where the HULL sits, as opposed to where the sprite is centred. The
     *  sheet reserves a large empty region up and to the left for the rod, so
     *  the boat is well below the middle of it — rings drawn at the centre
     *  float above the captain's head. */
    cx: number; cy: number
  }[]>([])
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
  useEffect(() => { allTradersRef.current = [yoon, smuggler, ...residents, ...socials, ...traders] }, [yoon, smuggler, residents, socials, traders])

  /**
   * EVERYONE ELSE, FOR THE CANVAS.
   *
   * Finn rides in the same list. He is his own component in the DOM because the
   * plate under him has to say what he is, and what he is is not a kind of
   * trade — but the BOAT is the same boat, and giving him a second pipeline to
   * be drawn through would be two places for a captain to stop matching.
   */
  /** Every berth on the chart, for the canvas. Static: the ports do not move,
   *  so this is read once and the only thing that ever changes is which one has
   *  you in it. */
  const gpuBerths = useMemo<BerthSpec[]>(() => {
    if (!GPU_ISLANDS) return []
    return PLACES.filter(p => p.kind === 'port').map(p => {
      const b = berthOf(p)
      return {
        id: p.id, x: b.x, y: b.y, r: b.r,
        // Which way the dock is from the berth — the approach lights run toward
        // it, which is the one thing a symmetric circle cannot tell you.
        bearing: Math.atan2(p.y - b.y, p.x - b.x),
      }
    })
  }, [])

  const gpuFleet = useMemo(() => {
    if (!GPU_ISLANDS) return []
    const out = [yoon, smuggler, ...residents, ...socials, ...traders]
      .map(t => ({ key: t.key, look: captainFromTrader(t.look) }))
    if (finn) out.push({ key: 'finn', look: captainFromTrader(FINN_LOOK) })
    // AND THE PEOPLE YOU ACTUALLY KNOW. Same builder, same slot: a friend's
    // boat is not a different kind of thing from a trader's, it is the same
    // thing with better tackle on it.
    for (const f of friends) out.push({ key: `friend:${f.username}`, look: captainFromFriend(f) })
    return out
  }, [yoon, residents, socials, traders, finn, friends])
  /** The water we have the rod out in. Null means sailing. */
  const [fishingIn, setFishingIn] = useState<Place | null>(null)
  /**
   * THE CHART'S FURNITURE IS PUT AWAY, and a fight is the second reason to do
   * it. Casting already cleared the helm, the compass, the banner, the settings
   * and the hints — with the rod out the sea is a scene rather than somewhere
   * you are steering, and every one of those controls is about steering. A
   * broadside is the same thing: the guns are out, the helm is dropped, and the
   * only things that should be on screen are the fight's own.
   */
  const hudOff = !!fishingIn || fightOn
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
  /**
   * THE PLAYER, FOR THE CANVAS.
   *
   * Null when the canvas is not drawing her: with the flag off, or past the
   * sortie, where the hull changes outright and the Warship is still a DOM
   * sprite of its own. A null look tears the captain down, and `skipper()`
   * quietly stops doing anything, so there is never a moment where two of her
   * are on the water.
   *
   * The streak stage is pinned at 0, which is what the DOM does too: the chart
   * has no live perfect streak to read, so the Locked-In Rod shows its dormant
   * glow out here and comes alive in the fishing game. Worth wiring properly
   * once the streak is on the chart, and deliberately not guessed at now.
   */
  /** The expedition hull, for the canvas. The other half of the same slot the
   *  captain fills: exactly one of the two is ever non-null. */
  const gpuShip = useMemo(() => {
    if (!GPU_ISLANDS || !onShip) return null
    const h = getShip(shipTier)
    // A hull with no sea sprite is a hull that cannot be drawn out here, and
    // that is a data problem rather than something to paper over with a
    // placeholder — the DOM would render a broken image in the same case.
    return h.seaImageUrl ? { url: h.seaImageUrl, flip: !!h.seaFlip } : null
  }, [onShip, shipTier])

  const gpuCaptain = useMemo<CaptainLook | null>(() => {
    if (!GPU_ISLANDS || onShip) return null
    const tier = rodNow?.tier
    return {
      characterColor,
      boatId: boatId ?? null,
      hatId: hatId ?? null,
      // FROM THE LIVE PET, not the server prop. Equipping one from the loadout
      // has to change what is swimming beside the hull, not only the picture in
      // the sheet.
      petArt: petNow?.restImageUrl ?? null,
      petSpecies: (petNow?.species ?? null) as PetSpecies | null,
      // The rod in your hands is the rod you are holding, out of the rack.
      rodSlug: rodNow?.slug ?? gear.rodSlug,
      rodImage: rodNow?.image ?? gear.rod,
      rodGlowType: rodNow?.glow ?? gear.rodGlow,
      rodLockedIn: tier != null && (RODS.find(r => r.tier === tier)?.lockedIn ?? false),
      reel: gear.reel,
      hookUrl: gear.hook,
      // The hook arrives as a url, so its glow is looked up rather than passed.
      hookGlowType: HOOKS.find(h => h.imageUrl === gear.hook)?.glowType ?? null,
    }
  }, [onShip, characterColor, boatId, hatId, petNow, gear, rodNow])

  /** WHAT IS IN THE HOLD, live. Seeded from the server on load and then kept in
   *  step here: it climbs as you catch and empties the moment you sell to a
   *  buyer. Read once and never updated, it would sit at its load-time value
   *  while you filled the boat — and the hold is the one number that decides
   *  when a session has to end. */
  const [holdCount, setHoldCount] = useState(hold.count)
  /**
   * HOW MANY FISH HAVE BEEN LANDED THIS SESSION.
   *
   * Not the hold count, which is the wrong signal for "did you catch
   * something" in two separate ways: it is CLAMPED to the hold's capacity, so a
   * full hold lands a fish and the number does not move, and it FALLS when you
   * sell. A counter that only ever goes up says the thing that actually
   * happened. The first voyage waits on this.
   */
  const [caughtTick, setCaughtTick] = useState(0)
  /** Which pose the captain is in. The game already draws three — rod up,
   *  line in the water, mid-cast — so the map uses the same ones rather than
   *  inventing a fourth. `wait` during the bite wait is most of the missing
   *  feedback: the line is visibly IN the water. */
  const [frame, setFrame] = useState<'rest' | 'wait' | 'cast'>('rest')
  /** The pose, where the frame loop can see it. The loop is set up once and
   *  would otherwise close over the pose she was in when it started — the
   *  stale-closure trap. The DOM path does not need this because React re-renders
   *  the sprite; the canvas is steered rather than re-rendered. */
  const frameRef = useRef(frame)
  frameRef.current = frame
  // Mirrored so the rAF loop can read it without being re-created every time it
  // changes, which would restart the sweep.
  const fishingRef = useRef<Place | null>(null)
  useEffect(() => { fishingRef.current = fishingIn }, [fishingIn])

  // IN WHEN THE ROD COMES OUT, back when it goes away. 1.42x — enough that the
  // boat is clearly the subject and the water around it has moved, not so much
  // that the islands you were sailing past leave the frame entirely. The
  // captain should still know where they are.
  // THE SAME PUSH-IN THE ROD GETS. A fight is the other thing that stops being
  // a voyage and starts being a scene, so it arrives the way casting does:
  // the camera leans in, the sea stays exactly where it was, and you never
  // travelled. One channel for both, so they can never ease differently.
  /**
   * WITHIN REACH OF A HULL: read the card and warm its chunk, once. `nearEnc`
   * is the same proximity the action button reads, so this fires exactly when
   * the prompt appears — which is the moment a captain has decided.
   */
  useEffect(() => {
    if (!nearEnc || bossReadRef.current) return
    const n = RAID_MAP.find(x => x.id === nearEnc.node)
    if (!n?.raidId || !getRaidConfigById(n.raidId)) return
    bossReadRef.current = true
    // Both halves of the wait, started together: the code and the answer.
    void import('./BossCardSheet')
    void import('@/app/(app)/expeditions/RaidsSection')
    bossCardState().then(
      r => { if (!('error' in r)) setBossData(r) },
      // A FAILURE IS NOT WORTH SAYING HERE. Nothing has been asked for yet; the
      // sheet does its own read when it opens and reports properly then.
      () => { bossReadRef.current = false },
    )
    // ── AND THE FIGHT ITSELF, WHILE WE ARE HERE ─────────────────────────
    //
    // This is why pressing Enter looked janky. She is easing onto her station
    // at that moment — the one second of movement the whole transition is built
    // around — and that was exactly when the fight went off to fetch a loadout
    // and mount twelve thousand lines. The slide was competing with its own
    // arrival. Read on approach with the card, so Enter has nothing left to do
    // but show.
    void import('./RaidSheet')
    raidSheetState().then(
      r => { if (!('error' in r)) setRaidData(r) },
      () => {},
    )
  }, [nearEnc])

  const engaging = fightId ?? bossCard
  useEffect(() => {
    fishZoomTarget.current = fishingIn ? 1.42 : engaging ? 1.5 : 1
  }, [fishingIn, engaging])

  /**
   * WHERE THE ENGAGEMENT HAPPENS, settled the moment the guns come out.
   *
   * Solved against the zoom the fight is HEADING for rather than the one it
   * starts at, so the framing is the settled one and the camera ease is what
   * carries you into it. Recomputing per frame would have the target chasing
   * its own transition, and would put the rock search in the hot path.
   */
  useEffect(() => {
    if (!engaging) {
      fightStation.current = null
      fightCam.current = null
      fightHullRef.current = null
      return
    }
    const enc = fightEncRef.current
    const at = enc ? encounterAt(enc) : null
    const box = wrapRef.current?.getBoundingClientRect()
    if (!at || !box) return
    const node = RAID_MAP.find(x => x.id === enc!.node)
    // The same widths EncounterMark draws at, so an effect hung on the enemy is
    // the size of the ship it is happening to.
    fightHullRef.current = { at, encW: node?.type === 'raid' ? 260 : 185 }
    const station = pickStation(at.x, at.y)
    fightStation.current = station
    // THE CAMERA FRAMES THE PAIR, not the captain. Held on the midpoint between
    // the two hulls and lifted so they sit above the deck, it is a shot of an
    // ENGAGEMENT — and because it is anchored on where she is GOING rather than
    // where she is, the enemy is composed from the first frame and she is the
    // only thing that moves into place.
    fightCam.current = {
      x: (station.x + at.x) / 2,
      y: (station.y + at.y) / 2 + FIGHT_CAM_LIFT,
    }
  }, [engaging, pickStation])

  const locked = useCallback((p: Place) => level < p.minLevel, [level])

  /**
   * WHAT IS BUILT, for the canvas.
   *
   * The same list `PlaceIsland` walks, handed over whole rather than
   * reassembled: where a building stands is chart data, and there should be one
   * copy of it however many renderers are drawing it.
   *
   * `locked` is in here because a locked island's buildings are drawn dark, and
   * that changes when a place unlocks — which is a page-level event, so the
   * layer is rebuilt rather than patched.
   */
  const gpuTowns = useMemo<GpuTown[]>(() => {
    if (!GPU_ISLANDS) return []
    return PLACES
      // ── THE HOMESTEAD IS BUILT AT RENDER TIME, NOT IN THE TABLE ──────
      //
      // Its PLACES entry carries `buildings: []` on purpose: what stands on
      // your island is a function of what you have paid for, so `homeFor`
      // projects it from the homestead row. That projection was only ever
      // applied on the DOM path (PlaceIsland), and this list — the one the
      // canvas actually draws — read PLACES raw.
      //
      // So under the GPU renderer, which is the live default, NOTHING was ever
      // drawn on the homestead. Not "nothing yet": a fresh homestead already
      // has a lean-to and a fallen ring of stones, and neither had appeared for
      // anybody since the port. Reported as the island looking empty, which is
      // exactly what it was.
      //
      // Same projection, same function, both paths.
      //
      // ── AND THE CREW HALL IS THE SAME STORY ─────────────────────────
      //
      // Missed the first time this was fixed. `crewHallFor` swaps the hall, the
      // drill yard and the stores for the tier actually built, and it was on
      // the DOM path only — so the canvas drew the tier-1 placeholders that
      // chart.ts carries for the land checker, and a captain who had paid all
      // the way up saw the same three huts they started with.
      //
      // Both projections, both paths, one chain. Anything that projects a place
      // from a profile belongs in THIS map and PlaceIsland's, and the two lists
      // are the thing to keep in step.
      .map(p => homeFor(p, visiting?.homestead ?? homestead, visiting?.username))
      .map(p => crewHallFor(p, crewTiers))
      .filter(p => p.kind !== 'water' && p.buildings && p.buildings.length > 0)
      .map(p => ({
        id: p.id, x: p.x, y: p.y, r: p.r, locked: locked(p),
        buildings: (p.buildings ?? []).map(b => ({
          x: b.x, y: b.y, scale: b.scale, art: b.art,
        })),
      }))
    // crewTiers included, or the canvas would keep whichever hall you logged in
    // with — the same staleness the projection itself was suffering from, moved
    // one level out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, homestead, visiting, crewTiers])


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
  /** Bring the rod in and put her back on the water. The tour calls this the
   *  moment the first fish lands, so the captain is looking at the sea and the
   *  card that says where to go next rather than at a fishing overlay. */
  const stowRod = useCallback(() => {
    setFishingIn(null)
    setFrame('rest')
  }, [])

  const startFishing = useCallback(() => {
    // THE FIRST VOYAGE CAN HOLD THE ROD DOWN. Once that first fish is landed
    // the tour has somewhere to be, and a captain who casts again is a captain
    // who fishes until the hold is full and never finds out what it was for.
    // The refusal is silent HERE and explained by the card that caused it —
    // see the holdCast beats in lib/seaOnboarding.
    if (tourHoldCast.current) return false
    const here = nearRef.current
    if (!here || here.kind !== 'water' || locked(here)) return false
    target.current = { ...pos.current }
    vibrate([0, 30, 40, 30])
    // THE WATER EMPTIES WHERE THE HOOK GOES IN. The shoals are drawn under the
    // surface all the way out here, and this is the moment they stop being
    // scenery: sailing across the chart to a patch and watching it bolt is most
    // of the reason to have drawn them. Purely visual, and it does not touch
    // what the cast is worth: that is server-side and it stays there.
    gpuRef.current?.scatter(pos.current.x, pos.current.y)
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

  /**
   * IS THERE A BEARING TO SHOW, and what would it mean.
   *
   * Derived once here rather than at the mount, because the HUD run has to know
   * whether the slot exists before it can lay the row out — and a disc that
   * appears a frame after the row is measured shunts everything left of it.
   *
   * `questReady` is the server's own derivation (see FinnSeaState, where it is
   * commented as driving "every indicator that points a captain at him"), so
   * this reads it rather than re-deciding what finished means.
   */
  const finnBearing = useMemo(() => {
    // Not in the anchorage — he is moored out in the Shallows — and not past
    // the sortie, where an arrow to him would point across a reef at a chart he
    // is not on. It does NOT drop out as you close on him: the compass already
    // hides a mark once its place is on screen, and an arrow that vanishes the
    // moment you get near is the one thing that would make it untrustworthy.
    if (!finn || inAnchorage || onSortie) return null
    return {
      x: finn.at.x, y: finn.at.y,
      state: finn.questReady ? 'ready' as const
        : finn.quest ? 'working' as const
        : 'offering' as const,
    }
  }, [finn, inAnchorage, onSortie])

  const hudRow = useMemo(() => {
    const on: string[] = []
    // ── NOT WHILE THE GUNS ARE OUT ────────────────────────────────────────
    //
    // A fight owns the corners: the enemy's card takes the top left and the
    // level bar runs across the same line. None of these doors is any use
    // mid-broadside — the crew hall, the almanac and the trawl docks are all
    // places you go BETWEEN fights — so they stand down rather than being
    // stacked under a card you cannot move.
    if (fightOn) return on
    // THE LIGHT HOLDS THE LEFT ON THE FISHING SIDE and the RIGHT out in the
    // expeditions, where the left corner belongs to the crew. It was pushed
    // here unconditionally before and drawn only on the fishing side, so the
    // expedition row started at slot one with a disc-width hole in front of it.
    if (!inAnchorage) on.push('clock')
    if (inAnchorage && (!fishingIn || wide)) on.push('crew')
    if (!fishingIn || wide) on.push('chart')
    // THE BOOK, on the fishing side only. It is a reference about FISH, and out
    // past the reef there are none — a door to it standing in the campaign's
    // water would be the busiest thing in that corner and about the other half
    // of the game.
    if (!inAnchorage && (!fishingIn || wide)) on.push('almanac')
    if (!inAnchorage && orders && orders.challenges.length > 0 && (!fishingIn || wide)) on.push('orders')
    if (!inAnchorage && (trawlsOut.length > 0 || trawlsReady > 0) && (!fishingIn || wide)) on.push('trawls')
    if (!inAnchorage && (!fishingIn || wide)) on.push('folk')
    return on
  }, [fishingIn, wide, inAnchorage, orders, trawlsOut.length, trawlsReady, fightOn])
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
    // THE TUTORIAL'S ONE INSTRUCTION WINS. See tourFishOnly: everything below
    // this outranks the water, and for this one beat none of it may.
    if (tourFishOnly.current && near?.kind === 'water' && !locked(near)) {
      return { act: null, hold: `Hold to fish ${near.name}` }
    }
    if (nearFinn && !finnOpen) {
      return { act: finn?.questReady ? `${FINN_NAME} is waiting on you` : `Hail ${FINN_NAME}`, hold: null }
    }
    if (nearTrader && !hailing) {
      return { act: dealt.includes(nearTrader.key) ? `Speak to ${nearTrader.name}` : `Hail ${nearTrader.name}`, hold: null }
    }
    // A GATE OUTRANKS EVERYTHING. She is stopped against it; nothing else she
    // could be offered matters while the water is refusing to let her past.
    if (heldBy) return { act: null, hold: heldBy.shut ?? 'The way is shut' }

    // THE PORTAL, when you are floating in it. Above the campaign for the same
    // reason the way home is: nothing else is inside that ring, and a captain
    // sitting in the middle of one has already decided.
    // NO STONE GATE ON THE DOOR ANY MORE. It used to refuse to open at all
    // without one, which was right while the only thing inside was the band
    // ladder. The berths need no stone — see PORTAL_PORTS — so a stoneless
    // captain standing in their own portal was being locked out of the half of
    // it that was for sale.
    if (inPortalNow && !inAnchorage) {
      return { act: 'Step through the portal', hold: null }
    }

    // THE WAY HOME, when you are floating in one. Above the campaign: nothing
    // else in this water is within three hundred pixels of it, and a captain
    // sitting in the mouth of a portal has already decided.
    if (nearWayHome && wayHomeOpen(nearWayHome, clearedNodes)) {
      return { act: 'Take the way home', hold: null }
    }

    // THE CAMPAIGN OUTRANKS THE SCENERY. An encounter is what you came out here
    // for; a dig site is something you happened to sail over.
    if (nearEnc) {
      const n = RAID_MAP.find(x => x.id === nearEnc.node)
      if (n) {
        const st = nodeStatus[n.id] ?? 'locked'
        // A LOCKED ONE STILL SAYS ITS NAME. The alternative is a boss you can
        // see, sail up to, and get nothing from — which reads as broken rather
        // than as not yet. Naming it and refusing is the honest half of that.
        if (st === 'locked') return { act: null, hold: `${n.label} — not yet` }
        // NO ROUTE, NO VERB. The story beats have `scene` rather than a screen
        // to send you to, and their sheets are not wired out here yet — so they
        // are named and not offered. A button captioned with a boss's name that
        // does nothing when pressed is worse than no button: it reads as the
        // game being broken rather than as the feature being unfinished.
        if (!n.route) return { act: null, hold: n.label }
        const fight = n.type === 'raid' || n.type === 'skirmish'
        return {
          act: fight
            ? (st === 'cleared' ? `Take on ${n.label} again` : `Take on ${n.label}`)
            : (st === 'cleared' ? `Read ${n.label} again` : n.label),
          hold: null,
        }
      }
    }
    // AND WHAT THE CAMPAIGN LEFT LYING ABOUT. Under the ships, over the
    // scenery: a chest with a chapter's story in it is worth more than a dig
    // site and less than the man you came to sink.
    // A STORY POST. Above a chest for the same reason a ship is: the chain is
    // what you are actually here to advance, and the cache is a thing you
    // happen to be beside.
    if (nearBeat) {
      const n = RAID_MAP.find(x => x.id === nearBeat.node)
      if (n) {
        const st = nodeStatus[n.id] ?? 'locked'
        // LOCKED STILL SAYS ITS NAME. The campaign's order is the point — you
        // cannot read the wax that names Krust before you have been up the line
        // to learn there is a name — and naming the thing you cannot do yet is
        // the honest half of refusing it. Silence would read as broken.
        if (st === 'locked') return { act: null, hold: `${n.label} — not yet` }
        // A BEAT IS READ, A TOLL IS SETTLED, A CHOICE IS MADE. See verbFor: the
        // helm is the last thing read before the thumb moves, and only one of
        // those three can be undone.
        return { act: `${verbFor(n, st)} ${n.label}`, hold: null }
      }
    }
    if (nearCache) {
      const n = RAID_MAP.find(x => x.id === nearCache.node)
      if (n) {
        const st = nodeStatus[n.id] ?? 'locked'
        if (st === 'locked') return { act: null, hold: 'A cache, sealed' }
        return { act: `${verbFor(n, st)} ${n.label}`, hold: null }
      }
    }
    if (nearDig && !dug.has(nearDig.id)) return { act: 'Dig here', hold: null }
    if (nearBottle) return { act: 'Take the bottle', hold: null }
    if (nearIsle) {
      return { act: found.has(nearIsle.id) ? `Look again at ${nearIsle.name}` : `Go ashore at ${nearIsle.name}`, hold: null }
    }
    if (near && near.kind === 'port') {
      // THE GUNWHARF SAYS WHAT IT DOES. "Go ashore at the Gunwharf" is true and
      // useless; what you actually want to know standing off it is which hull
      // you will be sailing when you leave.
      if (near.id === 'gunwharf') {
        return { act: onShip ? 'Tie her up at the Gunwharf' : 'Take out your ship', hold: null }
      }
      if (near.id === 'charterhouse') {
        return { act: voyageOpen ? null : 'Read the voyage board', hold: null }
      }
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
    // AND THE WALLS START FROM HERE, not from wherever the ref was born. This
    // is a restore, not a voyage.
    lastPos.current = { ...pos.current }
    lastKnown.current = false
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
    // THE GUNWHARF ASKS RATHER THAN GOING ANYWHERE. One of its two doors is
    // not a page at all — it is changing the hull under you — so it cannot be
    // an href, and the other one is. See GunwharfAshore.
    if (p.id === 'gunwharf') { setWharf(true); return }
    // AND THE CHARTERHOUSE OPENS THE BOARD ITSELF. It used to route to
    // /expeditions, which is a hub of six cards one of which opens this — so
    // mooring at the island whose whole purpose is voyages left you two taps
    // and a page load away from a voyage, on a screen mostly about other
    // things. The board is posted here; open it here.
    if (p.id === 'charterhouse') { setVoyageOpen(true); return }
    // NOT A PAGE. The trawl panel opens over the water you are floating on,
    // because the crews you are sending are going into it.
    if (p.id === 'trawl_fleet') { setTrawlOpen(true); return }
    // AND THE SHIPYARD OPENS OVER THE WATER TOO. It was a route, and it never
    // needed to be one: the screen it renders is ALREADY a full-bleed overlay
    // with a close in the corner, so the only thing being a page bought it was
    // a navigation out of the chart and a remount of the whole sea on the way
    // back. Same component, same read — see shipyardState — opened where you
    // are moored.
    if (p.id === 'shipyard') { setYardOpen(true); return }
    // AND THE TALLY HOUSE SETTLES UP IN PLACE. It was a whole route for one
    // panel — the same panel the chart already shows from the HUD — whose only
    // difference ashore was that the Claim buttons worked. A page load, a
    // remount of the chart on the way back, and a scroll container, to turn a
    // button on.
    //
    // The rule it exists to protect is untouched: read anywhere, settle up
    // ashore. You still have to sail here. What changed is that arriving hands
    // you the panel instead of a URL.
    if (p.id === 'trawl_docks') { setOrdersAshore(true); setOrdersOpen(true); return }
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
    // ── AND WITH THE GUNS OUT IT IS NOT A HELM EITHER ────────────────────
    //
    // Same law as the rod above, and it needs saying here rather than being
    // left to the overlay, because a React PORTAL bubbles along the React
    // tree, not the DOM one. The fight is portalled to <body> and is nowhere
    // near this element on screen, yet every press inside it still arrives
    // here — which is why tapping a cutscene sailed the ship around behind it.
    if (fightOnRef.current) return
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
    /** The canvas's own last hour, unrounded. Separate from `lastDark` because
     *  the two are deliberately at different resolutions. */
    let lastRaw = -1
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

      /**
       * ── AND THE SAME THING ONCE THE GUNS ARE OUT ──────────────────────────
       *
       * The dial above is why fishing is smooth: with the rod out this loop
       * stops entirely, and `.sea-frozen` pauses every CSS animation under the
       * chart. The canvas keeps running, so the water is still alive, but the
       * MAIN THREAD is free — which is the thread the minigame is drawn on.
       *
       * A fight wants exactly that and I argued against it: the fight hangs its
       * effects on where the two hulls are, so I kept the whole loop running to
       * keep those positions live. That was wrong in a way worth writing down.
       * Once she is on station NOTHING MOVES — she holds, the camera is pinned
       * to the engagement, and the enemy is a fixed point in the world. There
       * are no live positions to keep; there is one pose, and it is already
       * written.
       *
       * So this is the dial's freeze with a hole in it exactly the size of the
       * fight: the two hulls still answer their own blows, because a recoil and
       * a shudder are the fight happening rather than the chart running, and
       * everything else on this chart stands down until she sails again.
       */
      if (fightFastRef.current) {
        fightFrame(now)
        last = now
        raf = requestAnimationFrame(step)
        return
      }
      // Clamped delta: a backgrounded tab returns with an enormous gap, and an
      // unclamped one would teleport the boat across the chart.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // ── IN A FIGHT SHE HOLDS STATION ──────────────────────────────────────
      //
      // The helm is dropped and her way comes off, so the two hulls stay
      // alongside for as long as the guns are out. NOT the dial's freeze above,
      // which stops the whole loop: the sea has to keep running here, because
      // the fight is hanging its shot and its hitsplats on where these ships
      // are, and a frozen chart would nail them to a dead frame.
      if (fightOnRef.current) {
        cmdDir.current = null
        vel.current.x = 0
        vel.current.y = 0
        // ── AND SHE TAKES HER STATION ─────────────────────────────────────
        //
        // THE DUEL HAS A SHAPE, and it is the one the fight was drawn for: your
        // hull low and to the left, theirs high and to the right. Sailing up on
        // any heading you like puts the two ships in an arbitrary arrangement,
        // and half the time the enemy is behind you or on top of you — which is
        // what "both cards stacked in the middle" actually was.
        //
        // Placed by SOLVING for it rather than by nudging: the camera is chosen
        // so the enemy lands exactly on its mark, and her station is whatever
        // world point puts her on hers. Both fall out of the projection, so the
        // framing is right at any zoom and on any window.
        //
        // She glides in rather than cutting, because a cut is a different scene
        // and this is the same sea from a better angle.
        // Chosen once, when the guns come out — see the effect that sets it.
        // Not recomputed here: it is a fixed place in the world, the camera
        // ease carries the transition, and solving it against every rock on
        // the chart is not something to do sixty times a second.
        const station = fightStation.current
        if (station) {
          const k = 1 - Math.exp(-2.6 * dt)
          pos.current.x += (station.x - pos.current.x) * k
          pos.current.y += (station.y - pos.current.y) * k
          // ARRIVED. From here the chart stands down to `fightFrame` — see the
          // freeze at the top of the loop. Measured against the camera as well
          // as the hull, because a camera still gliding into the shot is a
          // camera whose anchors are still moving.
          if (Math.hypot(station.x - pos.current.x, station.y - pos.current.y) < 8
            && fightCam.current
            && Math.hypot(fightCam.current.x - camAt.current.x,
              fightCam.current.y - camAt.current.y) < 8) {
            fightFastRef.current = true
          }
          // GUNS TO STARBOARD. The art faces right unmirrored (the enemy's is
          // flipped to face back at you), and the enemy is up and to the right.
          facing.current = 1
        }
      }

      // ── TWO CLOCKS, AND ONLY ONE OF THEM IS SHARED WITH THE SERVER ──
      //
      // `now` is a DOMHighResTimeStamp: milliseconds since the PAGE LOADED. It
      // is the right clock for everything cosmetic — waves, bob, drift phase,
      // the trader patrol — because all of those only ever need to be
      // self-consistent within this tab.
      //
      // It is the WRONG clock for anything the server will re-derive, and the
      // bottles were using it. Their key carries a window number computed as
      // `floor(t / 11 minutes)`, so a whole session minted keys for window 0
      // while the server checked against 2,709,000-odd from Date.now(). Not one
      // of them ever matched, so every bottle in the game answered "The tide
      // took it". lib/seaBottles now throws in dev if it is handed the wrong
      // one.
      const epoch = Date.now()

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
          setRefused('The open sea wants your expedition ship. She is berthed at the Gunwharf.')
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

      // THE TWO BERTHS USED TO BE MEASURED HERE, by hand, against their own
      // reach. They are islands now and the chart's own `near` does it — the
      // same test that moors you at the Mainland, with the same drawn berth
      // and the same prompt. Nothing opens because you drifted near one.

      // ── ARE YOU STANDING IN THE PORTAL? ────────────────────────────
      //
      // That is the whole of it now, and both halves of what it used to be
      // were wrong.
      //
      // IT TOOK YOU BY ITSELF. Hold station in the middle for a second and the
      // sea simply grabbed you and opened a sheet. A thing that acts on you
      // without being asked has to be either unmissable or avoidable, and this
      // was neither: sailing across your own portal on the way somewhere else
      // took you somewhere else again.
      //
      // AND THE PART THAT COUNTED WAS TINY. An 80px eye inside a 230px ring, on
      // a boat 210 long — most of the painted ring did nothing, so the thing
      // you could see and the thing that worked were different sizes and only
      // one of them was drawn.
      //
      // So: the whole mouth counts, and it offers. See the helm.
      const inMouth = inPortal(pos.current.x, pos.current.y)
      if (inMouth !== portalIn.current) {
        portalIn.current = inMouth
        setInPortalNow(inMouth)
      }

      // THE WATER STILL ANSWERS, it just does not take you. Standing in the
      // ring gathers it; that is the cue that the thing is live and that the
      // helm has something for you.
      gpuRef.current?.portal(gpuPortalRef.current, inMouth, inMouth ? 1 : 0)

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

      // ── AND YOU CANNOT SAIL THROUGH A BAY'S COAST ──────────────────
      //
      // The rocks are SCENERY. Every wall on this chart is really a piece of
      // arithmetic — the reef is the north wall, the harbour and the raid water
      // are radius clamps — and the boulders are what make the maths legible.
      // Drawing walls buys walls you can see and sail straight through.
      //
      // A chapter's water is a DISC AND A BOX taken together: the bay, and the
      // strait that leads to it. Together they have exactly one opening — the
      // strait's mouth, back at the junction — so the whole rule is: you may
      // only change which side of this shape you are on while you are in that
      // mouth, and only if the chapter behind it has fallen.
      //
      // Taking them together is also what makes the join free. A boat running
      // out of the strait into the bay never leaves the region, so no rule fires
      // there at all and there is no seam to catch on — which a strait and a bay
      // kept as two separate walls would have had, exactly where every captain
      // crosses.
      //
      // Which side she was on LAST FRAME, not the sign of her speed: a boat
      // drifting at half a pixel a frame has a component that flips with the
      // swell, and a wall reading that would let her wobble through.
      const nowOut = sortieRef.current

      /** Move her to a point and take away only the speed that was carrying her
       *  INTO it, so what was carrying her sideways survives and she scrapes
       *  along and finds the way through — the same courtesy the island
       *  shorelines and the chart's own edge both extend. */
      const shove = (tx: number, ty: number) => {
        const ux = tx - pos.current.x, uy = ty - pos.current.y
        const ul = Math.hypot(ux, uy) || 1
        pos.current.x = tx
        pos.current.y = ty
        const into = vel.current.x * (ux / ul) + vel.current.y * (uy / ul)
        if (into < 0) {
          vel.current.x -= (ux / ul) * into
          vel.current.y -= (uy / ul) * into
        }
      }

      let held: Wall | null = null
      for (let i = 0; i < BAYS.length; i++) {
        const b = BAYS[i]
        const px = pos.current.x, py = pos.current.y
        const inside = inChapterWater(b, px, py)

        // FIRST FRAME OUT HERE: adopt where she actually is. Sea position
        // persists, so a captain who quit inside a bay comes back inside it, and
        // a wall that assumed otherwise would shove her out through her own
        // coast before she had touched the helm.
        if (!basinKnown.current || !nowOut) { basinIn.current[i] = inside; continue }

        if (inside !== basinIn.current[i]) {
          const q = toStrait(b, px, py)
          // THROUGH THE MOUTH, which is the only opening: at the junction end of
          // the strait, and BETWEEN the two gate stones rather than round the
          // outside of one.
          const atMouth = q.along < 200 && Math.abs(q.across) < b.half
          if (atMouth && bayOpen(b, clearedRef.current)) {
            basinIn.current[i] = inside
            continue
          }
          const back = basinIn.current[i] ? intoWater(b, px, py) : outOfWater(b, px, py)
          shove(back.x, back.y)
          continue
        }

      }

      // ── AND YOU CANNOT CROSS A WALL ────────────────────────────────
      //
      // The rock inside a bay is a ROUTE — two chains carving a lane out and a
      // lane back — so this is the rule that makes the route a route rather
      // than a drawing of one.
      //
      // TESTED AS A CROSSING, not as a distance. A boat under way covers
      // eighty pixels in a frame and a wall is a line with no thickness: ask
      // "how close am I" and she tunnels straight through anything she is
      // moving fast enough to clear in one step, which is exactly the speed
      // she is doing when it matters. Ask instead whether the segment she
      // travelled this frame crossed the segment the wall is, and there is no
      // speed that beats it.
      // NOTHING TO TEST UNTIL SHE HAS ACTUALLY MOVED. See lastKnown: with no
      // previous position, "the segment she travelled" is a line from wherever
      // this ref happened to start, and a route full of rock will always find
      // something to refuse.
      // THE NEAR LIST, refreshed by distance travelled — see nearObs. Ahead of
      // the wall test because the walls read from it too. Squared distances
      // throughout: this is the scan the near list exists to make rare, so it
      // should not pay a sqrt per candidate either.
      {
        const mx = pos.current.x - nearAt.current.x
        const my = pos.current.y - nearAt.current.y
        if (mx * mx + my * my > 400 * 400) {
          nearAt.current.x = pos.current.x
          nearAt.current.y = pos.current.y
          const R = 1600
          const obs = nearObs.current
          obs.length = 0
          for (const o of allObstacles()) {
            const c = obstacleNearest(o, pos.current.x, pos.current.y)
            const dx = pos.current.x - c.x, dy = pos.current.y - c.y
            const reach = o.r + R
            if (dx * dx + dy * dy < reach * reach) obs.push(o)
          }
          const ws = nearWalls.current
          ws.length = 0
          for (const w of WALLS) {
            const e = wallSeg(w)
            if (!e) continue
            // Closest point of the wall's segment to the hull — the same shape
            // as obstacleNearest, on the cached ends.
            const vx = e.bx - e.ax, vy = e.by - e.ay
            const t2 = Math.max(0, Math.min(1,
              ((pos.current.x - e.ax) * vx + (pos.current.y - e.ay) * vy)
              / Math.max(1e-6, vx * vx + vy * vy)))
            const dx = pos.current.x - (e.ax + vx * t2)
            const dy = pos.current.y - (e.ay + vy * t2)
            if (dx * dx + dy * dy < R * R) ws.push({ w, ax: e.ax, ay: e.ay, bx: e.bx, by: e.by })
          }
        }
      }

      const from = lastPos.current
      for (const nw of nearWalls.current) {
        if (!lastKnown.current) break
        // NOT WHILE THE GUNS ARE OUT. In a fight she is not sailing: the loop
        // is easing her onto her station in the duel, and a crossing test reads
        // that as a captain trying to run a gate. She holds a few hundred
        // pixels off a hull that is itself in open water, so there is nothing
        // out there for her to end up inside.
        if (fightOnRef.current) break
        const w = nw.w
        if (!wallUp(w, clearedRef.current)) continue
        const e = nw
        const hit = segHit(from.x, from.y, pos.current.x, pos.current.y, e.ax, e.ay, e.bx, e.by)
        if (hit == null) continue

        // Put her back a hair on the side she came from, and take away only the
        // speed that was carrying her INTO the wall — so she slides along it and
        // follows the lane rather than stopping dead against it, which is what
        // makes a walled route feel like a road instead of a maze.
        const wx = e.bx - e.ax, wy = e.by - e.ay
        const wl = Math.hypot(wx, wy) || 1
        let nx3 = -wy / wl, ny3 = wx / wl
        // The normal that points back the way she came.
        if ((from.x - pos.current.x) * nx3 + (from.y - pos.current.y) * ny3 < 0) { nx3 = -nx3; ny3 = -ny3 }
        pos.current.x = hit.x + nx3 * WALL_SKIN
        pos.current.y = hit.y + ny3 * WALL_SKIN
        const into = vel.current.x * nx3 + vel.current.y * ny3
        if (into < 0) {
          vel.current.x -= nx3 * into
          vel.current.y -= ny3 * into
        }
        target.current = { ...pos.current }
        if (w.node) held = w
      }
      basinKnown.current = nowOut
      // Mutated, not replaced: this runs every frame, and a fresh object per
      // frame is nothing but work for the collector.
      lastPos.current.x = pos.current.x
      lastPos.current.y = pos.current.y
      lastKnown.current = true

      // Only when it CHANGES. This runs every frame and setState does not.
      if ((held?.node ?? null) !== gateRef.current) {
        gateRef.current = held?.node ?? null
        setHeldBy(held)
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
      for (const o of nearObs.current) {
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

      // ── THE CUTWATER, FOR THE CANVAS ──────────────────────────────
      //
      // EVERY FRAME, and not inside the throttle below. The DOM pool has a
      // fixed 44 marks and so has to ration them; the canvas lays its own on
      // its own cadence and only needs to be told where the bow is and how hard
      // she is driving — including, crucially, when she has stopped, which a
      // call that only fires while she is moving can never say.
      //
      // The geometry is the throttle's, deliberately: the bow offset is a
      // SPRITE offset carried through the mirror by `facing`, so the foam comes
      // off whichever stem the art actually draws, and the drop is divided by
      // GROUND because it is a screen measurement inside a squashed layer.
      if (gpuRef.current) {
        const h = hullRef.current
        // ALWAYS SENT, never null. It used to go quiet below the gate, which
        // was right when the only thing on the other end was a trail — but a
        // hull at rest is not doing nothing, it is standing in water it pushed
        // out of the way, and the canvas cannot draw that for a boat it has
        // been told is not there. The force is what says which of the two she
        // is doing, and zero is a perfectly good force.
        gpuRef.current.wake({
          x: pos.current.x + facing.current * h.bowX + WATERLINE_X,
          y: pos.current.y + h.bowDown / GROUND,
          // Where she SITS, for the rings: under the middle of her, at her own
          // waterline, rather than off the bow where she cuts.
          cx: pos.current.x + WATERLINE_X,
          cy: pos.current.y + h.keelY / GROUND,
          ang: Math.atan2(vel.current.y, vel.current.x) + h.bowTilt * facing.current,
          force: speed > 26 ? Math.min(1, speed / (SPEED * 0.9)) : 0,
          scale: h.scale,
          // HOW HEAVILY SHE SITS. 0 for the fishing boat, up to 1 at the
          // Man-o-War. It was never passed, so every expedition hull has been
          // ringing like a rowing boat: the trough and the collar that make a
          // ship of the line read as a ship of the line are gated on this and
          // were therefore switched off for the whole ladder.
          heave: h.weight,
          kind: wakeKindRef.current,
        })
      }

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
        // ── THE WATER SHE STANDS IN GOES WHERE SHE GOES ─────────────────
        //
        // This layer sits at the middle of the screen because that is where the
        // hull is — while the camera is following her. A fight frames the
        // ENGAGEMENT instead, and she takes a station low and to the left of
        // it, so without this the heave stayed behind: a ring of standing water
        // in the middle of the screen with nothing in it.
        //
        // The same offset the boat itself is given a few hundred lines down,
        // for the same reason and out of the same two numbers.
        const rOffX = (pos.current.x - camAt.current.x) * z
        const rOffY = (pos.current.y - camAt.current.y) * z * GROUND
        ripples.style.transform =
          `translate(${rOffX + WATERLINE_X * z}px, ${rOffY + hull.keelY * z}px) scale(${z * hull.scale})`
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
        // EPOCH, because the server positions the same bottle from Date.now()
        // when it checks you were actually alongside it. Drawing it from a
        // different clock put the two drifts out of phase; the reach check
        // survived that only because it is three times generous.
        const ts2 = epoch / 1000
        for (const b of bottlesRef.current) {
          const el = bottleRefs.current.get(b.key)
          if (!el) continue
          const at = bottlePos(b, ts2)
          el.style.transform = `translate3d(${at.x - b.x}px, ${at.y - b.y}px, 0)`
        }
      }

      // ── THE SALT ROAD, ON THE CANVAS ──────────────────────────────
      //
      // The same patrol positions the DOM block below writes, handed over
      // whole. Not recomputed: where a trader is at a given second is one
      // decision and `traderPos` is where it is made.
      //
      // Iterated off the trader list rather than off the DOM refs, because
      // under the flag there is no hull node to find — only the wrapper that
      // carries their name plate.
      if (gpuRef.current) {
        const ts = now / 1000
        const list = fleetAt.current
        list.length = 0
        for (const t of allTradersRef.current) {
          const at = traderPos(t, ts)
          list.push({
            key: t.key, x: at.x, y: at.y, facing: at.facing, scale: 0.94,
            dim: dealtRef.current.includes(t.key) ? 0.62 : 1,
            // Which way they are actually GOING, as opposed to which way their
            // sprite is mirrored. A wake needs the heading.
            ang: (at.headingDeg * Math.PI) / 180,
            // Everybody out here is in the same fishing boat, so it is the
            // fishing boat's own waterline, taken at their size and divided
            // back out of the plane's squash — the same arithmetic the player's
            // rings use, which is why hers were already sitting right.
            cx: at.x + WATERLINE_X * 0.94,
            cy: at.y + (WATERLINE_Y * 0.94) / GROUND,
          })
        }
        // Finn barely moves and never turns: he is not passing through.
        const f = finnRef.current
        if (f) list.push({
          key: 'finn', x: f.at.x, y: f.at.y, facing: 1, scale: 0.98, dim: 1, ang: 0,
          cx: f.at.x + WATERLINE_X * 0.98,
          cy: f.at.y + (WATERLINE_Y * 0.98) / GROUND,
        })
        // THE PEOPLE YOU KNOW, from the eased positions the block above just
        // settled. Read from `friendAt` rather than recomputed: where a friend
        // is on screen is a smoothing decision, made once, up there.
        for (const [name, at] of friendAt.current) {
          list.push({
            key: `friend:${name}`, x: at.shown.x, y: at.shown.y,
            facing: at.face, scale: 1, dim: 1,
            // Their heading is the direction they are easing in. A boat that
            // has arrived leaves no wake, which is correct.
            ang: Math.atan2(at.target.y - at.shown.y, at.target.x - at.shown.x),
            cx: at.shown.x + WATERLINE_X,
            cy: at.shown.y + WATERLINE_Y / GROUND,
          })
        }
        gpuRef.current.fleet(list)
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
          // THE `.trader-wake` LOOKUP THAT USED TO BE HERE FOUND NOTHING.
          // There is no such node in the markup and there is no sign there ever
          // was: traders have never left a wake in the DOM, so this was a
          // querySelector per trader on first sight, a cache miss every time,
          // and a rotation written to undefined. Traders leave a real one on
          // the canvas now — see the contact list above.

          // CACHED. This was a querySelector per trader per frame — a DOM
          // search sixty times a second for a node that never changes. Looked
          // up once and kept on the element itself.
          let hull = hullCache.current.get(t.key)
          if (!hull) {
            hull = el.querySelector<HTMLElement>('.trader-hull') ?? undefined
            if (hull) hullCache.current.set(t.key, hull)
          }
          if (hull) {
            // 0.94, NOT 0.78. The JSX below this has said 0.94 for a while,
            // under a note explaining that three quarters of the player's size
            // made a person you can talk to read as scenery in the middle
            // distance — but the loop rewrites this transform every frame and
            // was still writing the old number, so the change never once took
            // effect. A style the loop owns cannot also be set in the markup.
            hull.style.transform =
              `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.94) scaleX(${at.facing})`
          }
        }
      }

      // ── WHERE THE CAMERA IS LOOKING ───────────────────────────────
      //
      // The boat, almost always. The exception is the first voyage, where Doby
      // and Kat fly it out to name each island — sailing to all six would be a
      // genuinely long trip and the Crew Hall alone is four thousand pixels
      // north, and arriving somewhere is not what makes a place stick.
      //
      // Eased rather than cut, because a cut is a different scene and a glide
      // is the same sea seen from somewhere else, which is the whole point of
      // showing it rather than listing it. It returns to the hull the moment
      // the tour lets go, by the same ease, so nothing snaps.
      // The fight's camera outranks the tour's: you cannot be on the first
      // voyage and in a duel, and if you somehow were, the guns win.
      const look = fightCam.current ?? tourCam.current
      if (look) {
        const k = 1 - Math.exp(-2.1 * dt)
        camAt.current.x += (look.x - camAt.current.x) * k
        camAt.current.y += (look.y - camAt.current.y) * k
      } else {
        // Not eased back: while she is under way the camera IS the boat, and
        // easing here would put the hull on a leash a frame behind itself.
        camAt.current.x = pos.current.x
        camAt.current.y = pos.current.y
      }

      // Imperative writes. The whole reason this holds 60fps on a phone.
      const world = worldRef.current
      // scaleY LAST (CSS applies right to left), so the camera pan happens in
      // world units and only then meets the plane's foreshortening.
      if (world) {
        const t = `scale(${zoomRef.current}) scaleY(${GROUND}) translate3d(${-camAt.current.x}px, ${-camAt.current.y}px, 0)`
        world.style.transform = t
        // THE SAME STRING, THE SAME FRAME. These two layers are one world drawn
        // in two passes; a transform written to one and not the other would put
        // the near scenery a frame behind the far scenery.
        if (frontRef.current) frontRef.current.style.transform = t
        // AND THE THIRD PASS, WHICH IS NOT A STRING. Same numbers, same frame,
        // for the same reason: the islands are on a canvas and the buildings
        // standing on them are not, so a camera written a frame late slides a
        // tavern off its own island. Null only on the ?gpu=0 fallback.
        gpuRef.current?.camera(camAt.current.x, camAt.current.y, zoomRef.current)
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
        // The hour's second axis, for the buildings. See seaClock.warmth.
        wrapRef.current?.style.setProperty('--sea-warm', clk.warmth.toFixed(3))
        // And the canvas, which cannot read a custom property. A tint, not a
        // filter: see nightTint for why that distinction is the whole reason
        // the islands can be lit at all after what the filter did.
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

      // ── AND THE CANVAS GETS THE HOUR WHOLE ────────────────────────
      //
      // THE DEADBAND ABOVE IS A CSS DEADBAND. Rounding the light to 24 steps is
      // the right answer for a full-viewport gradient STRING, which has to be
      // re-parsed and repainted every time one character of it changes — the
      // note there is about a screen that strobed sixty times a second.
      //
      // None of that is true of a canvas. Three colours and a float are four
      // uniform writes, and they cost the same whether they changed or not. So
      // the shader gets the raw continuous darkness, and the twenty-four steps
      // it was watching the light climb in become one smooth ramp.
      //
      // The stops are recomputed here rather than reused from the block above
      // because that one is holding a DIFFERENT darkness: theirs is rounded and
      // this one is not, and handing the canvas a palette from the wrong hour
      // is how you get a sea that is a step behind its own sky.
      if (gpuRef.current) {
        const raw = clk.darkness
        if (movedFar || Math.abs(raw - lastRaw) > 0.002) {
          lastRaw = raw
          gpuRef.current.palette(seaAt(pos.current, raw).stops)
        }
        // A tint, not a filter: see nightTint for why that distinction is the
        // whole reason the islands can be lit at all after what the filter did.
        gpuRef.current.night(raw, clk.warmth)
        // ── AND HOW MUCH LANTERN WAS PAID FOR ─────────────────────────
        //
        // Here rather than in an effect on the tier, and the reason is the
        // handshake: the renderer is built asynchronously, so `gpuRef.current`
        // is null for the first frames and an effect that fired on mount would
        // push the tier into nothing and never try again. The layer's default
        // is a FULL lantern, so that failure looks like everybody owning the
        // top rung — the most expensive possible way to be wrong.
        //
        // The setter is one assignment. Doing it every frame costs nothing and
        // cannot miss.
        gpuRef.current.lantern(lanternGlow(lanternTier))
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
        // ── THE SEA GETS HEAVIER IN A SQUALL ──────────────────────────
        //
        // The rain and the cloud shadow are what you SEE; this is the half you
        // feel, and it is the reason a squall is a place rather than a filter.
        // She rides higher and lower and leans harder inside one, and it eases
        // in and out over a couple of seconds so sailing into weather is the
        // sea building rather than a switch being thrown.
        //
        // EPOCH, not the loop's `now`. That is a requestAnimationFrame stamp,
        // and handing it to a window function is exactly how every bottle in
        // the game broke; seaWeather throws in dev if it is given one.
        const wx = squallAt(pos.current.x, pos.current.y, epoch)
        rough.current += ((wx?.deep ?? 0) - rough.current) * Math.min(1, dt * 0.55)
        const gust = rough.current
        const bob = (Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1) * (1 + gust * 1.35)
          // A second, slower heave that only exists in weather: a swell has a
          // longer period than a chop and it is what makes a sea look big.
          + Math.sin(t * 0.72) * 7.5 * gust
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
        // ── THE SIGN IS THE FACING, AND THIS IS SETTLED BY LOOKING ────
        //
        // Three versions of this line have been wrong, so here is the whole of
        // it. It began as `vel.x / SPEED`, signed, which tilted her the same
        // way in SCREEN space on both headings and therefore the opposite way
        // relative to her own bow. The fix took the MAGNITUDE, which is right
        // about the amount and silent about the direction: a constant sign is
        // correct on exactly one heading. Positive dug the bow in going right;
        // negative dug it in going left. Both were half a fix.
        //
        // The direction is the facing. `mag * facing` is +mag unmirrored and
        // -mag mirrored, which is the one combination that lifts the bow on
        // both headings — and it is not what the geometry naively predicts,
        // because reflecting a rotation about a vertical axis preserves which
        // way is up. That argument assumes a symmetric hull seen flat. These
        // are three-quarter views, and mirroring one changes which end of it
        // reads as rising. The art decides this, not the matrix, which is why
        // it is settled by sailing east and then west and looking at her.
        const mag = Math.min(hullNow.heel, (drive / SPEED) * hullNow.heel)
        // AND SHE LEANS INTO IT. A slow roll on top of the drive's heel, so a
        // hull sitting still in a squall is still working, which a heel that
        // only came from speed could never say.
        const heel = mag * facing.current + Math.sin(t * 0.9) * 3.4 * gust
        // ── AND WHAT THE FIGHT IS DOING TO HER ────────────────────────────
        //
        // Recoil when she fires, a shake when she is hit, a list as she goes
        // down. Added to how she is riding rather than replacing it, because
        // both are true at once: a ship taking a broadside is still a ship in
        // a swell. Zero whenever there is no fight, so this costs a read.
        const pfx = shipFxRef.current?.player
        const fxX = pfx ? pfx.x : 0
        const fxY = pfx ? pfx.y : 0
        const fxRot = pfx ? pfx.rot : 0
        boat.style.transform =
          // The nudge sits OUTSIDE the zoom, not inside it: it arrives in
          // screen px at the size the hull actually reads, and scaling it
          // again would make a recoil grow every time the camera pushed in.
          `translate(-50%, -50%) translate(${fxX}px, ${fxY}px) scale(${zoomRef.current}) translateY(${bob}px) scaleX(${facing.current}) rotate(${heel + fxRot}deg)`
        // THE SAME NUMBERS, HANDED TO THE CANVAS. Not recomputed: how she is
        // riding is one decision and it is made here. Null unless the flag is
        // on and she is the one being drawn, in which case the DOM sprite above
        // is not mounted and this transform is written to an empty div.
        // OFFSET BY WHATEVER THE CAMERA IS NOT LOOKING AT. She sits at screen
        // centre because the camera follows her; the moment it flies off to
        // show an island she has to travel with the world like everything else,
        // or the tour drags the boat along behind it.
        const offX = (pos.current.x - camAt.current.x) * zoomRef.current
        const offY = (pos.current.y - camAt.current.y) * zoomRef.current * GROUND
        boat.style.marginLeft = `${offX}px`
        boat.style.marginTop = `${offY}px`
        // THE WAY THERE, from wherever she actually is. Recomputed every frame
        // rather than set once, because the near end of it is the hull.
        gpuRef.current?.guide(
          tourGoal.current ? pos.current : null, tourGoal.current, tourGoal.current?.r)
        gpuRef.current?.skipper({
          // THE SAME BLOWS, ON THE CANVAS HULL. `heel` and the offset are
          // already this call's language, so a fight's list and recoil are
          // said in it rather than bolted on: whichever renderer is drawing
          // her, she takes the hit the same way.
          bob, heel: heel + fxRot, facing: facing.current, zoom: zoomRef.current,
          frame: frameRef.current, stage: 0,
          offX: offX + fxX, offY: offY + fxY,
          fade: warpFade(),
        })

        // ── WHERE THE TWO HULLS ARE, FOR THE FIGHT TO AIM AT ──────────────
        //
        // The projection this whole chart runs on, applied to the two ships
        // that matter: centre + zoom × (world − camera), squashed by GROUND
        // going up-screen. Written to a ref the fight reads on its own frame,
        // so neither side re-renders to keep a hitsplat over a hull.
        if (fightHullRef.current) {
          const box = wrapBoxRef.current
          // WHERE THE ENEMY IS AND HOW BIG SHE IS, resolved when the guns came
          // out rather than here. Neither changes during a fight, and this was
          // scanning all of RAID_MAP and re-projecting the encounter on every
          // frame to arrive at the same two numbers it had last frame.
          const { at, encW } = fightHullRef.current
          if (box) {
            const z = zoomRef.current
            const cx = box.left + box.width / 2
            const cy = box.top + box.height / 2
            anchorsRef.current = {
              player: { x: cx + offX, y: cy + offY, w: hullNow.beamW * z },
              enemy: {
                x: cx + (at.x - camAt.current.x) * z,
                y: cy + (at.y - camAt.current.y) * z * GROUND,
                w: encW * z,
              },
            }
            // AND THE BLOWS THE ENEMY TAKES. Its hull is a DOM mark in both
            // mounts (the canvas layer draws islands and boats, never the
            // campaign), so there is one place to write this.
            const efx = shipFxRef.current?.enemy
            const el = enemyHullRef.current
            if (el && efx) {
              el.style.transform = `translate(${efx.x}px, ${efx.y}px) rotate(${efx.rot}deg)`
              // GOING DOWN. The fight says when; how it looks is the chart's,
              // because it is the chart's ship: she settles, rolls off the
              // wind and is gone, rather than blinking out.
              el.style.opacity = efx.sink ? '0' : '1'
              el.style.transition = efx.sink
                ? 'opacity 1.3s ease-in, transform 1.3s ease-in'
                : 'none'
              if (efx.sink) {
                el.style.transform = `translate(${efx.x}px, ${efx.y + 42}px) rotate(${efx.rot - 13}deg)`
              }
            }
          }
        }
        // AND THE NEAR PASS, every frame. Which rocks are in front changes on
        // the proximity tick, but WHERE they are on the screen changes as fast
        // as the camera does, and they are drawn in screen space because the
        // hull they cover is.
        if (occludingRef.current.length) gpuRef.current?.front(occludingRef.current)
      }

      // Proximity drives React, but only a few times a second. Nothing on screen
      // needs it faster and it keeps the loop out of the reconciler.
      sinceState += dt
      if (sinceState > 0.12) {
        sinceState = 0
        // The chart's box, for the fight's anchors. Here rather than in the
        // frame body: it changes when the window does, and measuring it sixty
        // times a second forces a layout for a number that almost never moves.
        if (fightEncRef.current) wrapBoxRef.current = wrapRef.current?.getBoundingClientRect() ?? null
        // The bays' shoals, when the list has moved or the canvas has arrived.
        if (surfPushed.current !== surfRef.current && gpuRef.current) {
          gpuRef.current.surf(surfRef.current)
          surfPushed.current = surfRef.current
        }
        // AND WHICH BAY IS WORTH DRAWING. Generous: a bay claims you well
        // before its coast does, so its rocks are already there when its water
        // is. Null out in the junction and on the fishing side, where the
        // campaign has nothing to say.
        {
          // ── WHICH BAY, ANSWERED PROPERLY ──────────────────────────────
          //
          // This was "the first bay within its radius plus four thousand", and
          // that is two mistakes at once. The slop is wide enough that
          // neighbouring bays overlap, and FIRST match means the earliest in
          // the array wins the overlap — so standing on the Cartographer, in A
          // Bigger Fish, picked The Loose Thread, and his whole bay was culled
          // away underneath him. One Last Ride never won at all.
          //
          // The authoritative question is the one the water already answers:
          // inChapterWater is a bay AND its strait, and it is what the boundary
          // rule itself uses. Ask that first and there is no overlap to resolve.
          let inBay: string | null = null
          for (const b of BAYS) {
            if (inChapterWater(b, pos.current.x, pos.current.y)) { inBay = b.id; break }
          }
          // THE CROSSING ITSELF, before the margin below widens it.
          if (inBay !== insideBayRef.current) {
            insideBayRef.current = inBay
            setInsideBay(inBay)
          }
          if (!inBay) {
            // Outside all of them — in the junction, or crossing between. Take
            // the NEAREST, so a bay's rocks are baked before you reach its door
            // rather than appearing once you are through it. Nearest by the gap
            // to its rim, not to its middle, or the biggest bay always wins.
            let best = 3000
            for (const b of BAYS) {
              const c = bayCentre(b)
              const gap = Math.hypot(pos.current.x - c.x, pos.current.y - c.y) - b.r
              if (gap < best) { best = gap; inBay = b.id }
            }
          }
          if (inBay !== liveBayRef.current) {
            liveBayRef.current = inBay
            setLiveBay(inBay)
          }
        }
        let found: Place | null = null
        // Ports are discs; waters are rings. inBand answers the ring case, and
        // the bands do not overlap, so the first match is the only match.
        for (const p of PLACES) {
          if (p.kind === 'port' ? inBerth(pos.current, p) : inBand(pos.current, p)) { found = p; break }
        }
        setNear(prev => (prev?.id === found?.id ? prev : found))
        // The berth lights up around whoever is standing in it. Sent on the
        // proximity tick rather than every frame: this changes when you arrive
        // somewhere, which is not sixty times a second.
        gpuRef.current?.berth(found?.kind === 'port' ? found.id : null)

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
        // THE SAME ANSWER, TO WHICHEVER RENDERER IS DRAWING HER. The canvas is
        // told every proximity tick and does not need the deadband — a set that
        // has not changed costs it a loop over a list that is almost always
        // empty. React does need it, because this state change re-renders an
        // eight-thousand-line component.
        occludingRef.current = inFront
        gpuRef.current?.front(inFront)
        if (!GPU_ISLANDS) {
          setOccluding(prev =>
            (prev.length === inFront.length && prev.every((v, k) => v === inFront[k])) ? prev : inFront)
        }

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
        // Where she is used to be mirrored into state here for the compass;
        // the compass reads the `pos` ref now, and the mirror was re-rendering
        // the whole chart for nobody. See the note where boatAt was declared.

        // WITHIN REACH OF AN ISLE. Compared by id: `isleNear` returns the same
        // object every time, but comparing ids keeps this honest if the table
        // ever becomes derived rather than a literal.
        const isl = isleNear(pos.current.x, pos.current.y)
        setNearIsle(prev => (prev?.id === isl?.id ? prev : isl))

        // AND WHAT THE CAMPAIGN HAS STANDING OUT HERE. Same tick and the same
        // shape as the isles: this changes when you come alongside something,
        // which is not sixty times a second.
        const enc = encounterNear(pos.current.x, pos.current.y)
        setNearEnc(prev => (prev?.node === enc?.node ? prev : enc))

        // AND THE CAMPAIGN'S CHESTS, which sit on the rocks. Tighter reach than
        // a ship and measured off the rock's edge: you pull up beside a chest,
        // you do not hail it.
        const cch = cacheNear(pos.current.x, pos.current.y)
        setNearCache(prev => (prev?.node === cch?.node ? prev : cch))

        // AND THE STORY POSTS, which are read the same way a chest is opened:
        // you pull alongside and press. See BEATS for why they are not triggers
        // that fire as you sail into them.
        const bt = beatNear(pos.current.x, pos.current.y)
        setNearBeat(prev => (prev?.node === bt?.node ? prev : bt))

        // AND THE WAY HOME, which only exists in a bay whose boss is down.
        const wh = portalNear(pos.current.x, pos.current.y)
        setNearWayHome(prev => (prev?.bay === wh?.bay ? prev : wh))

        // WHAT IS DRIFTING NEARBY. Against the drifted position, not the
        // anchor — same reason the traders test theirs.
        let bot: Bottle | null = null
        for (const b of bottlesRef.current) {
          if (takenRef.current.has(b.key)) continue
          const at = bottlePos(b, epoch / 1000)
          if (Math.hypot(pos.current.x - at.x, pos.current.y - at.y) < BOTTLE_REACH) { bot = b; break }
        }
        setNearBottle(prev => (prev?.key === bot?.key ? prev : bot))

        // A NEW SET OF BOTTLES when the boat crosses a cell or the tide turns.
        // Keyed on both, so a window rolling over while you sit still still
        // brings you different water.
        const bk = `${Math.floor(pos.current.x / BOTTLE_CELL)}:${Math.floor(pos.current.y / BOTTLE_CELL)}|${bottleWindow(epoch)}`
        if (bk !== bottleCell.current) {
          bottleCell.current = bk
          setBottles(bottlesAround(pos.current.x, pos.current.y, 5200, epoch))
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
      // FROZEN FOR A FIGHT TOO. `.sea-frozen` pauses every CSS animation under
      // the chart — the heave rings, the hull bobs, the mark wobbles. With the
      // rod out that is most of why fishing is smooth, and a broadside has the
      // same claim on the main thread.
      className={`sea-surface${dialUp || fightOn ? ' sea-frozen' : ''}`}
    >
      {/* THE WATER'S COLOUR, on a layer of its own.
          Under everything and containing nothing, so repainting it repaints one
          full-screen gradient and not the world sitting on top of it. */}
      {/* NO `background` IN THIS STYLE PROP. It is written by the loop and by
          nothing else — see the flicker note on the frame loop. */}
      <div ref={skyRef} aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: Z.backdrop, pointerEvents: 'none',
      }} />

      {/* THE LAND, ON THE GPU. Between the water and the world on purpose: the
          same z as the backdrop but later in the DOM, so it draws over the sea
          and under every building that stands on it. Its camera is written by
          the frame loop from the same numbers as the DOM transform — see the
          note in SeaIslandsGPU about why that has to be the same frame. */}
      {GPU_ISLANDS && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: Z.backdrop, pointerEvents: 'none',
        }}>
          <SeaIslandsGPU islands={gpuIslands} marks={gpuMarks} captain={gpuCaptain}
            ship={gpuShip} fleet={gpuFleet} berths={gpuBerths} portal={gpuPortal} towns={gpuTowns}
            occluders={gpuOccluders} handle={gpuRef} />
        </div>
      )}

      {/* THE SURFACE, under everything. Two repeating-background layers that
          the loop only ever TRANSFORMS — see seaTiles for why this stopped
          being a canvas. Oversized by a tile in each direction so a wrapped
          offset never exposes an edge. */}
      {/* AND NOT AT ALL WHEN THE CANVAS IS DRAWING THE SEA. These sit at the
          same z-index as the canvas and come after it in the DOM, so all three
          were painting straight over the shader — three repeating tiles muting
          the water and supplying the one motion cue that does not work. The
          canvas answers both: real world-space swell in the shader, and a field
          of flecks you actually sail past. See seaDrift. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: Z.backdrop, overflow: 'hidden', pointerEvents: 'none' }}>
        {tiles && !GPU_ISLANDS && (
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
        <BayWalls />
        <MouthPlugs rocks={shutPlugs} />

        {/* WHAT THE GAP IS FOR. There is no Harbour island any more — sailing
            through the opening is what takes you to expeditions, so the opening
            is what has to say so. */}
        <GateSign to={inAnchorage ? 'Fishing' : 'Expeditions'} />
        {/* Only from inside the harbour it belongs to. From the fishing
            grounds it would be a sign for a door behind a wall. */}
        {inAnchorage && <SortieSign />}
        {/* The Homestead Portal, wearing the deepest band it can reach. */}
        {/* PortalRing LIVED HERE. The portal is a place on the water now,
            drawn with the berths in seaPortalWell — see its header for why a
            painted neon sigil was the wrong object on this chart. The BEAM
            below stays: that is the warp firing, which is an event and not a
            place, and it was never the part that looked wrong.

            ITS NAME DID NOT GO WITH IT. A hole in the water is legible as
            SOMETHING from a distance and as nothing in particular; every other
            place out here carries a name board and this one has to as well, or
            it is scenery you learn by bumping into. Sized and shadowed like the
            ports' name plates, one step quieter, because it is a feature of the
            water rather than somewhere you go ashore. */}
        {!inAnchorage && <PortalName tier={portalTier} stone={portalStone} />}
        {/* The charge stands on the RING, not the hull: the painted band is
            the cylinder's footprint, so the ring itself is what flares. */}
        <AnimatePresence>
          {portalCharge && !inAnchorage && <PortalBeam tier={portalTier} />}
        </AnimatePresence>
        {/* Your ship, lying in the Gunwharf's berth until you come for her.
            Only from inside the harbour she is in, like the sign. */}
        {inAnchorage && !onShip && <ShipAtBerth shipTier={shipTier} />}

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

        {/* THE CAMPAIGN'S OWN ISLES. On the DOM path only, because on the GPU
            path their land is already in `gpuIslands` above — the same split
            IsleRock makes, and the same split that has twice been got wrong by
            applying something to one path and not the other. */}
        {!GPU_ISLANDS && RAID_ISLES.map(i => {
          const p = isleAt(i)
          return p ? (
            <div key={i.id} aria-hidden style={{
              position: 'absolute', left: p.x, top: p.y,
              width: i.r * 2, height: i.r * 2,
              marginLeft: -i.r, marginTop: -i.r, pointerEvents: 'none',
            }}>
              <Landmass id={i.id} r={i.r} />
            </div>
          ) : null
        })}

        {/* WHY IS THERE NO SHIP THERE. ?probe=1 only — see MarkProbe. */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <MarkProbe bay={liveBay} pos={pos as any} />

        {/* The campaign, standing in its own water. */}
        <EncounterField bay={liveBay} status={nodeStatus} nearId={nearEnc?.node ?? null}
          nearCacheId={nearCache?.node ?? null} nearBeatId={nearBeat?.node ?? null}
          cleared={clearedNodes} nearHomeId={nearWayHome?.bay ?? null}
          // `engaging` rather than `fightId`: the boss card is already the
          // engagement, and the mooring should go the moment it opens rather
          // than a beat later when the guns do.
          fightNode={engaging ? fightEncRef.current?.node ?? null : null}
          hullRef={enemyHullRef} />

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
        {[yoon, smuggler, ...residents, ...socials, ...traders].map(t => (
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
            the hull left it. Every one of these is positioned by the loop —
            and none of them are mounted when the canvas is laying it instead,
            which it does three times as often and with turbulence the fixed
            44-mark pool could never afford. */}
        {!GPU_ISLANDS && Array.from({ length: WAKE_MARKS }, (_, i) => (
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
      {!hudOff && (helmLabel.act || helmLabel.hold) && (() => {
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

      {!hudOff && (
        <div
          ref={boxRef}
          className="sea-helm"
          // POINTABLE. The tour tells a new captain to hold this to start
          // fishing, and an instruction naming a control the tour cannot then
          // flash is an instruction they have to go and find.
          data-coach="helm"
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
      <div ref={rippleRef} aria-hidden
        // HER OWN WATER KEEPS WORKING. The chart is frozen in a fight, and a
        // ship of the line sitting in a dead flat ring is the one place that
        // reads as the game having stopped rather than the camera having
        // settled. See .sea-alive.
        className={fightOn ? 'sea-alive' : undefined}
        style={{
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
        ) : GPU_ISLANDS ? null : (
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
        {/* SHE IS ON THE CANVAS UNDER THE FLAG. The wrapper stays either way —
            the loop writes her bob and heel to it, and past the sortie it is
            still carrying the Warship, which has not moved yet. */}
        {GPU_ISLANDS ? null
          : onShip
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
        {!GPU_ISLANDS && occluding.map(k => <SeaMark key={k} m={OCCLUDERS[k]} i={k + 4000} />)}
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

      {/* ── THE BERTH SHEET, at the Gunwharf ────────────────────────────
          Where the hull under you changes. It used to happen at the sortie's
          mouth, in open water, on a boat that was drifting — the most
          consequential thing you can do on this chart and you could fall into
          it. Now you go ashore and are asked, and the hull you are not sailing
          is visibly at her berth until you come back.

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
            }}>The Gunwharf</p>
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
                ? 'Your fishing boat is moored at the Gunwharf. Take her back and you can sail south through the reef again, but the open sea is closed to her.'
                : 'She is the only hull that can pass the sortie into the open sea, and she does not go south of the reef. Your fishing boat waits at the Gunwharf until you come back for her.'}
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
            margin: 'auto', width: '100%', maxWidth: wide ? 720 : 460,
            borderRadius: 20, padding: '1.2rem 1.05rem 1.05rem',
            background: 'linear-gradient(180deg, rgba(24,20,34,0.75) 0%, rgba(10,12,20,0.85) 100%), rgba(8,10,18,0.98)',
            border: '1px solid rgba(150,130,240,0.35)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
            maxHeight: '88vh', overflowY: 'auto',
          }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.18em', color: 'rgba(168,146,255,0.85)', margin: 0,
            }}>The Homestead Portal</p>
            <h2 className="font-pirata" style={{
              fontSize: '1.6rem', color: '#f0ede8', margin: '4px 0 0.8rem', lineHeight: 1.15,
            }}>Where to?</h2>

            {/* NODES, not a list of names and not a map. See PortalMap: the
                sea is not laid out for a picker, and a true-scale plan of it
                collapsed the near waters to a thread and stacked six berths in
                a pile too small to hit. */}
            <PortalMap
              tier={portalTier} ports={portalPorts} stoneFor={stoneFor} busy={portalBusy}
              onSail={(x, y, accent) => jumpTo(x, y, accent)}
              onBuyTier={() => void buyTier()}
              onBuyPort={id => void buyPort(id)} />

            {portalErr && (
              <p className="font-karla font-600" style={{
                fontSize: '0.74rem', color: '#e6a0a0', margin: '0.7rem 0 0', lineHeight: 1.45,
              }}>{portalErr}</p>
            )}

          </div>
        </PopupShell>
      )}

      <AshorePanel state={landed} onClose={() => setLanded(null)} />

      {/* THE CHAPTER YOU HAVE JUST SAILED INTO. Its own banner rather than the
          water one's: a bay is not a fishing zone you drift across, it is the
          door to a chapter, and it should land like one. Suppressed with the
          rest of the furniture while the rod or the guns are out. */}
      <BayBanner bay={hudOff ? null : insideBay} />

      <WaterBanner
        place={!hudOff && near && near.kind === 'water' ? near : null}
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
      {/* `|| wide` is why this survived a fight: on a desktop there is room for
          it beside a cast, so the guard let it through. A broadside is not a
          question of room — see hudOff. */}
      {(!fishingIn || wide) && !fightOn && (
        // A SYMBOL, NOT A NAME. The words were a label on a map, and the sky
        // already says what time it is in colour — the corner only has to
        // confirm it at a glance. `title` keeps the name for anyone who wants
        // it, and the aria-label keeps it for anyone who cannot see the shape.
        //
        // IT SHOWS ON THE EXPEDITION SIDE TOO. It never used to, and the water
        // up there goes just as dark: the sky changed colour and the one thing
        // that says what time it is was on the other side of the reef. Out
        // there it takes the RIGHT corner, because the left is the crew's.
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
          position: 'absolute', top: 18, zIndex: Z.hud, pointerEvents: 'none',
          ...(inAnchorage ? { right: 12 } : { left: hudAt('clock') }),
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

      {/* THE CREW, holding the left corner out in the expeditions.
          A real button, for the same reason the chart is one: the map's
          `closest('button')` guard then exempts it from steering on both the
          pointer and the click path with no data-no-steer needed.

          EXPEDITIONS ONLY, on purpose. This is where a crew is the thing you
          are thinking about — who is aboard, who is still out, who you could
          still sign. The fishing side already carries a trawls disc, which is
          the one crew question that side ever asks, and a second crew button
          beside it would be two answers to one question on the row with the
          least room. */}
      {inAnchorage && (!fishingIn || wide) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(10); setCrewHubOpen(true) }}
          aria-label="Your crew"
          title="Your crew"
          style={{
            position: 'absolute', top: 18, left: hudAt('crew'), zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: hudSize, height: hudSize, borderRadius: '50%', padding: 0,
            background: 'rgba(6,12,18,0.7)',
            border: '1px solid rgba(180,214,232,0.22)',
            color: 'rgba(214,232,240,0.85)', cursor: 'pointer',
          }}>
          {/* TWO HEADS AND A SHOULDER LINE. Not one figure: one is a person and
              this is a crew, and the difference has to survive at 26px. */}
          <svg width={Math.round(hudSize * 0.58)} height={Math.round(hudSize * 0.58)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="9" cy="8" r="3.2" />
            <path d="M3.2 19a5.8 5.8 0 0 1 11.6 0" />
            <path d="M16.2 5.6a3.2 3.2 0 0 1 0 6.1" />
            <path d="M17.4 14.2A5.8 5.8 0 0 1 20.8 19" />
          </svg>
          {/* SOMEBODY IS WAITING ON YOU: a trawl or a voyage has come in, or
              there are faces on the board nobody has signed. The same amber dot
              Finn's button uses, and it means the same thing there. */}
          {(trawlsReady > 0 || crewWaiting) && (
            <span aria-hidden style={{
              position: 'absolute', top: -2, right: -2,
              width: 11, height: 11, borderRadius: 999,
              background: '#f0c040', border: '1px solid rgba(20,14,4,0.8)',
              boxShadow: '0 0 10px rgba(240,192,64,0.6)',
            }} />
          )}
        </button>
      )}

      {/* THE CHART BUTTON, beside the light and on the same row.
          A real button, so the map's own `closest('button')` guard exempts it
          from steering on both the pointer and the click path without needing
          data-no-steer as well. */}
      {/* Same `|| wide` leak as the clock above, same reason it is closed. */}
      {(!fishingIn || wide) && !fightOn && (
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

      {/* THE ALMANAC, next to the chart, because they are the same kind of
          thing: a reference you open, read, and shut again. */}
      {!inAnchorage && (!fishingIn || wide) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(10); setAlmanacOpen(true) }}
          aria-label="Open the almanac"
          title="The almanac"
          style={{
            position: 'absolute', top: 18, left: hudAt('almanac'), zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: hudSize, height: hudSize, borderRadius: '50%', padding: 0,
            background: 'rgba(6,12,18,0.7)',
            border: '1px solid rgba(180,214,232,0.22)',
            color: 'rgba(214,232,240,0.85)', cursor: 'pointer',
          }}>
          {/* An open book. Not a fish: there is a fish on half the things in
              this game and none of them mean "the record of them". */}
          <svg width={Math.round(hudSize * 0.55)} height={Math.round(hudSize * 0.55)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z" />
            <path d="M12 6.5v13" />
          </svg>
        </button>
      )}

      {/* ── THE PASSAGE ──────────────────────────────────────────────
          IT HAPPENS TO HER, NOT TO THE SCREEN.
          
          The first pass at this was a full-screen veil that went white and came
          back. That is not a teleport, it is a scene transition — it says the
          GAME cut away, when what actually happened is that a boat was taken
          out of the water and put back somewhere else.
          
          So it is anchored on the hull, which is always at the middle of the
          shot because the camera follows her. Motes fall inward and are
          swallowed, a core swells just enough to cover the boat at the seam,
          and on the far side the same motes are thrown back out. The sea around
          it stays visible the whole way through, which is what makes it read as
          something happening IN the world.
          
          The hull itself dissolves with it — see `fade` on the GPU skipper —
          so the thing being taken is the thing you are steering, not a shape
          behind a light.
          
          DOM and CSS: one element, three keyframes, transform and opacity only.
          This is drawn over a chart that owns a WebGL context and must never
          ask for a second one. See the note in DialFx. */}
      {warping && (
        <div aria-hidden style={{
          position: 'fixed', left: '50%', top: '50%', zIndex: 2000,
          width: 0, height: 0, pointerEvents: 'none',
        }}>
          {/* THE CORE. Small: it only has to cover a hull, and a glow the size
              of the screen is the flash this replaced. */}
          <span style={{
            position: 'absolute', left: -170, top: -170, width: 340, height: 340,
            borderRadius: '50%',
            background: `radial-gradient(circle, #ffffff 0%, ${warping.accent} 34%, ${warping.accent}00 70%)`,
            animation: `warpCore ${WARP_MS * 2}ms ease-in-out forwards`,
          }} />
          {/* THE MOTES. Sixteen, each on its own bearing, falling in and thrown
              back out — the same path run backwards, so whatever swallowed her
              is visibly what puts her down. */}
          {Array.from({ length: 16 }, (_, i) => {
            const th = (i / 16) * Math.PI * 2
            const far = 210 + (i % 4) * 34
            return (
              <span key={i} style={{
                position: 'absolute', left: -4, top: -4, width: 8, height: 8,
                borderRadius: '50%', background: warping.accent,
                boxShadow: `0 0 10px ${warping.accent}`,
                // The bearing rides on a custom property so one keyframe serves
                // all sixteen: only the direction differs.
                ['--wx' as string]: `${Math.cos(th) * far}px`,
                ['--wy' as string]: `${Math.sin(th) * far}px`,
                animation: `warpMote ${WARP_MS * 2}ms cubic-bezier(0.4, 0, 0.4, 1) ${(i % 4) * 40}ms forwards`,
              }} />
            )
          })}
          {/* AND ONE RING, to give the swallow an edge. */}
          <span style={{
            position: 'absolute', left: -190, top: -190, width: 380, height: 380,
            borderRadius: '50%', border: `2px solid ${warping.accent}`,
            animation: `warpHoop ${WARP_MS * 2}ms ease-in-out forwards`,
          }} />
        </div>
      )}

      <Almanac open={almanacOpen} onClose={() => setAlmanacOpen(false)} />

      {/* THE LOCKER, over the water you are moored in. */}
      <ShipyardSheet open={yardOpen} onClose={() => setYardOpen(false)} />

      {/* AND THE FIGHT, over the water it is happening on. `router.refresh()`
          on the way out is what re-reads nodeStatus, so a boss you just sank
          comes back cleared and whatever he was gating opens. */}
      {/* THE CARD, AND THEN THE GUNS. `onEnter` hands back the route of the
          run you chose — the challenge branch is its own node with its own
          raidId — so this is where a challenge run entered from the water
          becomes possible at all. */}
      <BossCardSheet
        nodeId={bossCard}
        preloaded={bossData}
        // WALKING AWAY GIVES THE HELM BACK. She was already easing onto her
        // station behind this card with the chart stood down; closing it
        // without taking the fight has to undo all of that, or a captain who
        // changed their mind is left frozen alongside a boss they declined.
        onClose={() => {
          setBossCard(null)
          fightEncRef.current = null
          fightOnRef.current = false
          fightFastRef.current = false
        }}
        onEnter={route => {
          const picked = RAID_MAP.find(n => n.route === route)
          const raidId = picked?.raidId
          setBossCard(null)
          if (!raidId || !getRaidConfigById(raidId)) {
            // Nothing on this chart to fight it with — the practice skirmish is
            // the live example. Fall back to the page it has always had.
            router.push(route)
            return
          }
          fightOnRef.current = true
          fightFastRef.current = false
          wrapBoxRef.current = wrapRef.current?.getBoundingClientRect() ?? null
          setFightId(raidId)
        }} />

      <RaidSheet
        raidId={fightId}
        preloaded={raidData}
        anchors={anchorsRef}
        // Straight into the ref the loop reads. No setState: this arrives on
        // a frame, and re-rendering the chart to move a hull three pixels is
        // the one thing that would make a fight on the water cost more than a
        // fight on a page.
        onShipFx={fx => { shipFxRef.current = fx }}
        /**
         * AND THE WATER ANSWERS. The fight sends what happened; this is where
         * it becomes a place — the chart is the only side that knows where
         * either hull actually is, which is why the events carry no
         * coordinates.
         *
         * Everything here is a no-op when the canvas is not the one drawing
         * (the DOM chart, `?gpu=0`): `gpuRef` is simply null and the fight
         * plays exactly as it did before, with no branch anywhere in it.
         */
        onFightFx={e => {
          const hull = fightHullRef.current
          const gpu = gpuRef.current
          if (!hull || !gpu) return
          const me = pos.current
          const them = hull.at
          if (e.kind === 'fire') {
            if (e.side === 'player') gpu.gunfire(me.x, me.y, them.x, them.y)
            else gpu.gunfire(them.x, them.y, me.x, me.y)
            return
          }
          const at = e.side === 'enemy' ? them : me
          if (e.kind === 'ability') {
            // The colour arrives as the class's own CSS hex, because that is
            // what the fight has; Pixi wants a number. Parsed here rather than
            // in the fight, which should not have to know what the renderer
            // eats.
            const hex = (e.color ?? '#ffffff').replace('#', '')
            const n = parseInt(hex.length === 3
              ? hex.split('').map(c => c + c).join('')
              : hex, 16)
            // BOTH HULLS. A sight-line and a walk of impacts are drawn in the
            // space between the ships, so the other one is not optional.
            const other = e.side === 'enemy' ? me : them
            gpu.ability(
              at.x, at.y, other.x, other.y,
              Number.isFinite(n) ? n : 0xffffff,
              e.shape ?? 'buff', e.power ?? 1,
            )
            return
          }
          if (e.kind === 'sink') { gpu.gunsink(at.x, at.y); return }
          if (e.kind === 'dodge') {
            // AWAY FROM WHAT SHE SLIPPED. A dodge is a direction, and the only
            // direction that means anything here is "not toward the other
            // ship" — so the water goes off the quarter she heeled onto.
            const other = e.side === 'enemy' ? me : them
            gpu.gunwake(at.x, at.y, at.x - other.x, at.y - other.y)
            return
          }
          if (e.kind === 'miss') {
            // A MISS GOES IN THE WATER SOMEWHERE, and where matters: short of
            // the hull and off to one side, so it reads as a shot that went
            // wide rather than one that struck and did nothing.
            const dx = at.x - (e.side === 'enemy' ? me.x : them.x)
            const dy = at.y - (e.side === 'enemy' ? me.y : them.y)
            const len = Math.hypot(dx, dy) || 1
            const wide = (Math.random() - 0.5) * 320
            gpu.gunimpact(
              at.x - (dx / len) * 260 - (dy / len) * wide,
              at.y - (dy / len) * 260 + (dx / len) * wide,
              'miss')
            return
          }
          gpu.gunimpact(at.x, at.y, e.kind === 'crit' ? 'crit' : 'hit')
          // A CRIT GETS THE SHOCKWAVE ON TOP of its impact, rather than instead
          // of it: the spray and rings are what a shot landing looks like, and
          // this is the extra thing a hard one does to the bay.
          if (e.kind === 'crit') gpu.gunshock(at.x, at.y)
        }}
        onClose={() => {
          setFightId(null)
          fightEncRef.current = null
          fightOnRef.current = false
          fightFastRef.current = false
          // THE CARD IS STALE NOW. A clear, a drop and a new record all just
          // happened; the next one has to be read again rather than served from
          // before the fight.
          // THE SHELLS COME DOWN WITH THE FIGHT. A ward is a state the canvas
          // holds until it is told otherwise, and the canvas outlives the
          // fight — left set, it would go on breathing over open water long
          // after the ship it belonged to had gone.
          gpuRef.current?.ward('player', 0, 0, 0, 0x5eead4, false)
          gpuRef.current?.ward('enemy', 0, 0, 0, 0xc084fc, false)
          gpuRef.current?.status('player', 0, 0, 0, 0)
          gpuRef.current?.status('enemy', 0, 0, 0, 0)
          bossReadRef.current = false
          setBossData(null)
          setRaidData(null)
          shipFxRef.current = null
          anchorsRef.current = null
          // THE HULL GOES BACK TO BEING A HULL. The fight wrote a transform
          // straight onto the mark; leaving it there would strand a listing,
          // half-sunk ship on the chart for anyone who sails past next.
          const el = enemyHullRef.current
          if (el) { el.style.transform = ''; el.style.opacity = ''; el.style.transition = '' }
          router.refresh()
        }} />

      {/* THE COMPASS. Its mount was deleted in an over-broad slice edit and the
          component sat unreferenced for a dozen commits, which is why the
          arrows "disappeared" — nothing was wrong with them, nothing was
          drawing them. Frozen while the dial is up: the boat is not moving, so
          every tick would redraw identical arrows in identical places. */}
      {/* THE COMPASS IS NAVIGATION, and with the rod out you are not
          navigating — you are standing still on purpose. Four arrows with names
          and distances on them are the single largest thing on this screen that
          has nothing to do with what you are doing. Back the moment you stow. */}
      {!hudOff && (
        <Compass pos={pos} zoom={zoomRef} wrapRef={wrapRef} locked={locked} frozen={dialUp} friends={friends}
          finn={finnBearing}
          // The harbour IS a place now, so the compass can raise it again when
          // a crew is in — which is the whole reason the compass sorts by this.
          waitingAt={id => (id === 'trawl_fleet' ? trawlsReady : 0)} />
      )}

      <MainlandAshore open={ashore} onClose={() => setAshore(false)} />
      <GunwharfAshore open={wharf} onClose={() => setWharf(false)} onShip={onShip}
        shipTier={shipTier} onSail={() => { setWharf(false); setSwapAsk(true) }} />
      <VoyageBoard open={voyageOpen} onClose={() => setVoyageOpen(false)} />

      {/* ── THE GOLDEN CHOICE ──────────────────────────────────────────
          Above everything, dismissable by nothing, and asked again on the next
          load if it is still unanswered. Answering may free the NEXT one:
          heldGolden serves a backlog oldest first, so somebody with several
          waiting works through them one at a time. */}
      <GoldenChoice held={golden} onDone={() => {
        setGolden(null)
        void heldGolden().then(h => { if (h) setGolden(h) }).catch(() => {})
      }} />

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

      {/* A BEAT, PLAYING OVER THE CHART. StoryScene portals itself to the body,
          so the map does not have to know anything about where it lands. */}
      {(() => {
        const n = reading ? RAID_MAP.find(x => x.id === reading) : null
        return n ? (
          <SeaStory node={n} cleared={(nodeStatus[n.id] ?? 'locked') === 'cleared'}
            onDone={() => setReading(null)} />
        ) : null
      })()}

      {/* AN INTRO, which writes nothing and hands you on to the sheet. */}
      {(() => {
        const n = introNode ? RAID_MAP.find(x => x.id === introNode) : null
        return n ? (
          <SeaStory node={n} cleared intro
            onDone={() => {
              seenIntros.current.add(n.id)
              setIntroNode(null)
              setSheetNode(n.id)
            }} />
        ) : null
      })()}

      {/* AND THE SHEET: the toll, the cache, the Captain's Choice. */}
      {(() => {
        const n = sheetNode ? RAID_MAP.find(x => x.id === sheetNode) : null
        return n ? (
          <SeaNodeSheet node={n} cleared={(nodeStatus[n.id] ?? 'locked') === 'cleared'}
            onClose={() => setSheetNode(null)} />
        ) : null
      })()}

      <CrewHub
        open={crewHubOpen}
        onClose={() => { setCrewHubOpen(false); pollCrew() }}
        // BOTH ROWS OPEN WHAT IS ALREADY ON THIS CHART rather than sailing you
        // to an island first. The trawl row is null when nobody is out, and the
        // hub then says so instead of opening an empty list.
        onTrawls={trawlsOut.length > 0 ? () => setTrawlsPeek(true) : null}
        onVoyage={() => setVoyageOpen(true)} />

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
          // The same skip the pill makes, and it has to be the same or the
          // button would be lying about what the thumb is about to do.
          if (tourFishOnly.current) return false
          if (nearFinn && !finnTalk) { vibrate(14); void hailFinn(); return true }
          // KIP FIRST, and by key. He rides the talker plumbing so he is drawn
          // and hailed like everybody else, but the trader panel has nothing to
          // say for a man offering a run rather than a price.
          if (nearTrader?.key === KIP.key && !kipOpen) { vibrate(14); setKipOpen(true); return true }
          if (nearTrader && !hailing) { vibrate(14); setHailing(nearTrader); return true }
          // INTO THE CAMPAIGN. Same order as the prompt above, or the button
          // and the thumb would disagree about what happens next.
          if (nearEnc) {
            const n = RAID_MAP.find(x => x.id === nearEnc.node)
            if (n && (nodeStatus[n.id] ?? 'locked') !== 'locked' && n.route) {
              vibrate(14)
              // ── THE FIGHT HAPPENS HERE ─────────────────────────────
              //
              // A raid with a config opens as a SHEET over the chart: you sailed
              // up to that hull and the guns open where you are, the same shape
              // fishing has always had. See RaidSheet.
              //
              // The note that used to live here said a raid must stay its own
              // route because the FX layer would take the sea's WebGL context
              // down. That is still true OF A PIXI FX LAYER, and it has never
              // been built — RaidCombat is DOM and framer-motion end to end, so
              // this mount costs no context at all. The rule moved to RaidSheet,
              // where anybody adding that layer will actually be standing.
              //
              // Anything WITHOUT a config — the practice skirmish — keeps its
              // route, because there is no config for the sheet to fight.
              if (n.raidId && getRaidConfigById(n.raidId)) {
                // WHICH HULL YOU ARE FIGHTING. The fight hangs everything it
                // draws on this ship's place on the chart, so it is recorded
                // before anything opens rather than looked up from inside it.
                fightEncRef.current = nearEnc
                // AND SHE STARTS PULLING ALONGSIDE NOW, behind the card. The
                // approach and the camera lean take about a second; a card
                // takes longer than that to read. Doing them at the same time
                // means dismissing it lands on a fight already composed
                // instead of starting one more piece of movement.
                fightOnRef.current = true
                fightFastRef.current = false
                wrapBoxRef.current = wrapRef.current?.getBoundingClientRect() ?? null
                // THE CARD FIRST, and the guns after it. Pressing straight into
                // a broadside was a beat too fast, and it also removed a
                // decision: which run you are taking on is chosen on that card
                // and nowhere else, so a fight entered from the water could
                // only ever have been the normal one.
                setBossCard(n.id)
                return true
              }
              router.push(n.route)
              return true
            }
            // Locked, or a node with nowhere to go. The prompt already said so;
            // swallowing the tap keeps it from falling through to whatever else
            // happens to be in reach.
            return false
          }
          if (inPortalNow && !inAnchorage) {
            vibrate([12, 50, 18])
            // Course and way both die here, which is what separates stepping
            // into something from tapping a button beside it.
            vel.current.x = 0; vel.current.y = 0
            target.current = { ...pos.current }
            setPortalOpen(true)
            return true
          }
          if (nearWayHome && wayHomeOpen(nearWayHome, clearedNodes)) {
            vibrate([12, 50, 18, 50, 26])
            warpTo(PORTAL_HOME.x, PORTAL_HOME.y)
            return true
          }
          if (nearBeat) {
            const n = RAID_MAP.find(x => x.id === nearBeat.node)
            if (n && (nodeStatus[n.id] ?? 'locked') !== 'locked') {
              vibrate(14)
              // THE SCENE, THE TOLL OR THE CHOICE, whichever this node is, over
              // the water — see openNode. Nothing on a rock out here sends you to
              // another screen any more.
              openNode(n, (nodeStatus[n.id] ?? 'locked') === 'cleared')
              return true
            }
            return false
          }
          if (nearCache) {
            const n = RAID_MAP.find(x => x.id === nearCache.node)
            if (n && (nodeStatus[n.id] ?? 'locked') !== 'locked') {
              vibrate(14)
              openNode(n, (nodeStatus[n.id] ?? 'locked') === 'cleared')
              return true
            }
            return false
          }
          if (nearDig && !dug.has(nearDig.id)) { dig(nearDig); return true }
          if (nearBottle) { take(nearBottle); return true }
          if (nearIsle) { void land(nearIsle); return true }
          const here = nearRef.current
          if (here && here.kind === 'port' && !locked(here)) { enter(here); return true }
          // A water is not a tap target: it is what a HOLD is for, and casting
          // on a tap would fire every time somebody meant to steer and missed.
          return false
        }
        return null
      })()}

      {/* ── SETTINGS ────────────────────────────────────────────────────
          Top RIGHT, alone, and deliberately not on the end of the HUD's run
          down the left. Everything in that run is a place you are going or a
          thing waiting for you; this is the knobs on the outside of the game,
          and sitting it at the end of that row would say it was another
          destination. Same disc size and same vertical, so it reads as part of
          the same furniture without joining the queue.

          AND IT GOES AWAY WITH THE ROD OUT. The HUD's own run already clears
          itself while you are fishing — the chart, the orders, the trawls and
          the Salt Road all stand down — because the dial, the bar and the
          catch card want the screen and none of those are things you do
          mid-cast. This is the same argument only more so: nothing about
          sound, or a bite timer, is a decision anybody makes with a fish on
          the line, and a gear icon sitting over the water during the one
          moment the water is worth looking at is furniture in the way.

          NO `|| wide` HERE, unlike the left-hand run. Those earn their
          exception because they are places you might want to go and a wide
          window has room for both; this one is a menu, and a menu has nothing
          to say while you are fishing however much room there is. */}
      {/* ── THE RIGHT-HAND PAIR ────────────────────────────────────────
          The haul first, then the settings gear in the corner. Both hide
          while the rod is out: zoomed into a cast, the chart's furniture is
          in the way of the one thing on screen that matters, and a disc
          quietly asking to be tapped mid-cast is worse than in the way.

          Laid out from the corner inwards, and the gear keeps the corner
          because it is the one that was already there — a control that moves
          when a badge appears next to it is a control people mis-tap. */}
      {!hudOff && <SeaBonus size={hudSize} top={18} right={12 + hudSize + 8} />}
      {!hudOff && <SeaSettings size={hudSize} top={18} />}

      {/* THE SOUNDTRACK. Starts on the first press rather than on mount, both
          because no browser will play it before one and because it is a 1.6MB
          fetch nobody should pay for opening the chart to look at it. The track
          follows the water the boat is in. */}
      <SeaAudio />

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
          <PopupShell open onClose={() => { setOrdersOpen(false); setOrdersAshore(false) }}>
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
                <button type="button" onClick={() => { setOrdersOpen(false); setOrdersAshore(false) }} aria-label="Close"
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
              {/* onChange, because this sheet UNMOUNTS on close. Without it the
                  chart kept the snapshot it fetched on load, so reopening the
                  Tally House showed every finished order as Ready again and the
                  gold dot stayed lit on the HUD after everything was paid. */}
              <DailyOrders initial={orders} canClaim={ordersAshore} onChange={setOrders} />
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
        // WHICH DOORS ARE OPEN TO THIS CAPTAIN. The same list the water itself
        // reads, so the chart cannot draw a strait open that the coast has
        // rocked shut.
        cleared={clearedNodes}
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
      {/* HANDED THE ROW GEOMETRY RATHER THAN GUESSING AT IT. Both of this
          badge's offsets used to be constants, and constants cannot know that
          a HUD disc is 26px on a phone and 40px on a monitor. See its note. */}
      <HotspotBadge spot={inSpot} compact={!!fishingIn}
        hudSize={hudSize} lowered={hudSize === 26} />

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
          look={{
            characterColor,
            hatId,
            boatId,
            petId,
            petBow: gear.petBow ?? null,
          }}
          onLookChange={patch => {
            if (patch.characterColor !== undefined) setCharacterColor(patch.characterColor)
            if (patch.boatId !== undefined) setBoatId(patch.boatId)
            if (patch.hatId !== undefined) setHatId(patch.hatId)
            if (patch.petId !== undefined) setPetId(patch.petId)
          }}
          activeRod={activeRod}
          onRodChange={setActiveRod}
          hold={{ count: holdCount, capacity: hold.capacity, tier: hold.tier }}
          at={pos}
          log={log}
          renownPoints={renownState ? renownPoints : undefined}
          onOpenRenown={renownState ? () => setRenownOpen(true) : undefined}
          onCaught={qty => {
            setHoldCount(n => Math.min(hold.capacity, n + qty))
            setCaughtTick(n => n + 1)
          }}
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
          // OUT IN FRONT OF THE BOW, not under the hull: the line went out
          // that way and a fish surfacing inside your own boat is a strange
          // thing to draw. Far enough ahead to clear the sprite, near enough
          // to plainly be on your line.
          onGolden={setGolden}
          goldenPending={golden !== null}
          onLanded={perfect => gpuRef.current?.splash(
            pos.current.x + facing.current * 150, pos.current.y + 70,
            facing.current, perfect)}
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

      <SmugglerTalk open={kipOpen} onClose={() => setKipOpen(false)} />

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
      {/* THE FIRST VOYAGE. Not hidden while fishing, unlike the old tour: two
          of its beats are ABOUT fishing and one of them explains the dial while
          the dial is on screen, which was the whole reason the retired fishing
          hub had an intro scene of its own. */}
      <SeaFirstVoyage hasSeen={tour.seen} startAt={tour.step} fishing={!!fishingIn}
        caught={caughtTick} nearId={near?.id ?? null} ashore={ashore}
        // The same two gates FishingHere puts on the Cast button. If it will
        // not let them cast, the tour has to stop asking them to.
        blocked={baitLeft <= 0 ? 'bait' : holdCount >= hold.capacity ? 'hold' : null}
        cam={tourCam} goal={tourGoal} holdCast={tourHoldCast}
        fishOnly={tourFishOnly} stowRod={stowRod} at={pos} />
      {!hudOff && <SeaLandfallHint nearId={near?.id ?? null} seen={tour.hints} />}

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
  /** The equipped pet's ID and its bow-side twin. Only the loadout preview
   *  reads these; the boat sprite above uses the species and its art. */
  petId?: string | null
  petBow?: string | null
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
      <div className="trader-hull sea-lit" style={{
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
        {/* ON THE CANVAS UNDER THE FLAG. The wrapper stays: it carries their
            name plate and their wake, and the loop still writes the patrol to
            it. Only the captain moves. */}
        {!GPU_ISLANDS && <TraderSkiff look={trader.look} />}
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
        }}>{done ? 'Traded today' : trader.roleLabel ?? (folk ? folk.role : KIND_LABEL[trader.kind])}</p>
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
 * ── WHAT EACH CHAPTER'S COAST IS MADE OF ────────────────────────────────────
 *
 * Four bays built from the same grey boulder is one place with four doors on
 * it. So each has its own rock, painted for the water it belongs to: a warm
 * barnacled pirate shelf on the Loose Thread, whale bone and kelp in the Sunken
 * Hand, drowned masonry and money in the Coffers, black glass in the Last
 * Fathom. You should be able to tell which bay you are in from any one rock.
 *
 * ── SIZED AGAINST THE SHIP, NOT AGAINST THE OLD ROCKS ───────────────────────
 *
 * These were first sized by copying the numbers the chart's own boulders use,
 * which was wrong in the one way that matters: those numbers describe a
 * BOULDER, and half of this art is not boulders. A rowboat wreck at 430 wide is
 * a rowboat as long as a man-o-war, and a set of mooring bollards at 690 is a
 * bollard you could moor the man-o-war TO. Everything read as comically large
 * because the sizes had been copied from a shape rather than measured against
 * anything.
 *
 * The unit is the hull. WARSHIP_W * beam is about 205px of ship, so:
 * a rowboat is half a hull, a rock is one, a shelf is one and a half, and only
 * a whale's ribcage — which really is bigger than a sloop — goes past two.
 *
 * `SeaMark` treats `size` as WIDTH and lets the sprite set its own height, so
 * these are all widths, and the art is low: between 1.2 and 2.6 times wider
 * than it is high. The chart's original boulders are as tall as they are broad,
 * which is right for a reef you are meant to feel walled in by and wrong for a
 * coast you are meant to sail along.
 */
type RockArt = { art: string; min: number; max: number }

/** The coast, and the loose things floating about in the bay. Split because
 *  they are not the same job: a wall is built of the first and the second is
 *  scenery you come across. A wall made of rowboats is not a wall. */
type RockSet = { wall: readonly RockArt[]; props: readonly RockArt[] }

const CHAPTER_ROCKS: Record<Bay['rocks'], RockSet> = {
  // The Loose Thread. A working pirate coast: wave-cut stone, rotting mooring
  // posts, a jetty somebody stopped maintaining, and the boats that lost.
  reef: {
    wall: [
      { art: '/sea/rock-reef-1.png', min: 240, max: 330 },   // layered shelf
      { art: '/sea/rock-reef-3.png', min: 175, max: 245 },   // mossy rocks, posts
      { art: '/sea/rock-reef-5.png', min: 175, max: 245 },   // rocks and rope
      { art: '/sea/rock-reef-6.png', min: 195, max: 275 },   // pilings and chain
    ],
    props: [
      { art: '/sea/rock-reef-2.png', min: 88, max: 118 },    // a swamped rowboat
      { art: '/sea/rock-reef-4.png', min: 88, max: 118 },    // and another
    ],
  },
  // A Bigger Fish. Everything out here has been eaten by something.
  bones: {
    wall: [
      { art: '/sea/rock-bones-1.png', min: 360, max: 470 },  // the ribcage
      { art: '/sea/rock-bones-2.png', min: 250, max: 340 },  // a jaw in the sand
      { art: '/sea/rock-bones-3.png', min: 165, max: 235 },  // kelp over black rock
      { art: '/sea/rock-bones-4.png', min: 200, max: 285 },  // a run of vertebrae
    ],
    props: [{ art: '/sea/rock-bones-3.png', min: 95, max: 130 }],
  },
  // The Coffers. A counting house at the bottom of the sea.
  coffers: {
    wall: [
      { art: '/sea/rock-coffers-1.png', min: 230, max: 320 }, // vault wall
      { art: '/sea/rock-coffers-2.png', min: 230, max: 320 }, // toppled columns
      { art: '/sea/rock-coffers-3.png', min: 195, max: 270 }, // reef over a strongbox
      { art: '/sea/rock-coffers-4.png', min: 150, max: 205 }, // bollards and chain
    ],
    props: [{ art: '/sea/rock-coffers-4.png', min: 90, max: 120 }],
  },
  // The Last Fathom. No warmth in any of it.
  fathom: {
    wall: [
      { art: '/sea/rock-fathom-1.png', min: 230, max: 320 },  // basalt columns
      { art: '/sea/rock-fathom-2.png', min: 250, max: 340 },  // a drowned arch
      { art: '/sea/rock-fathom-3.png', min: 175, max: 250 },  // obsidian shards
      { art: '/sea/rock-fathom-4.png', min: 250, max: 340 },  // a lava shelf
    ],
    props: [{ art: '/sea/rock-fathom-3.png', min: 90, max: 125 }],
  },
}

/**
 * HOW CLOSE TOGETHER A SET'S ROCKS HAVE TO STAND.
 *
 * DERIVED FROM THE ART, not a constant. The reef's own REEF_STEP of 700 was set
 * against boulders 400-800 wide; drop the same step onto rock half that size and
 * the coast becomes a dotted line with a boat-width of open water between every
 * piece — which is not a coast, it is a hint of one, and the arithmetic wall
 * behind it then reads as invisible.
 *
 * A shade over the mean width, so with the jitter each piece just meets its
 * neighbour. Halve the art and the step halves itself.
 */
function rockStep(set: RockSet): number {
  const mean = set.wall.reduce((a, k) => a + (k.min + k.max) / 2, 0) / set.wall.length
  return Math.round(mean * 1.05)
}

/**
 * ── A BAY'S COAST, AND THE STRAIT INTO IT ───────────────────────────────────
 *
 * A ring of that chapter's rock all the way round the bay with ONE gap in it,
 * and two runs down the sides of the strait that leads to the gap. Exactly the
 * shape the anchorage already is — chart.ts on its rim: "that is what makes it a
 * harbour rather than a disc: the boundary was an invisible line you slid along,
 * and now it is a shore with one gap in it."
 *
 * The rock is SCENERY. Every wall on this chart is really a piece of arithmetic
 * and the boulders are what make it legible; see the boundary rule in the frame
 * loop, which is where a bay actually stops you.
 *
 * Built in bay and strait space and converted at the end, so a bay can be
 * re-aimed, resized or moved and its whole coast follows without a number in
 * here changing.
 *
 * The mouth is left open. Whether you may pass it is a question about the
 * chapter behind it, answered per captain in `shutMouths`.
 */
function bayRocks(b: Bay): { art: string; x: number; y: number; size: number }[] {
  const out: { art: string; x: number; y: number; size: number }[] = []
  const KIND = CHAPTER_ROCKS[b.rocks]
  const STEP = rockStep(KIND)
  let seed = 0x9e3779b9
  for (let i = 0; i < b.id.length; i++) seed = (Math.imul(seed ^ b.id.charCodeAt(i), 0x85ebca6b) >>> 0)
  const nx = () => {
    seed ^= seed << 13; seed >>>= 0
    seed ^= seed >>> 17
    seed ^= seed << 5; seed >>>= 0
    return seed / 0x100000000
  }
  const pick = () => KIND.wall[Math.min(KIND.wall.length - 1, Math.floor(nx() * KIND.wall.length))]

  // ── THE RIM ──
  // Two rows round the whole circle, minus the doorway. The angle a given
  // distance subtends shrinks as the bay grows, so everything is stepped in
  // arc length and converted — a big bay gets more rocks, not bigger gaps.
  const c = bayCentre(b)
  const ang = (px: number) => px / b.r
  // Which way the door lies, seen from the middle of the bay.
  const door = b.bearing + Math.PI
  // Wide enough for the strait plus the stones that frame it.
  const doorHalf = ang(b.half + 420)

  for (const row of [0, 1]) {
    const R = b.r + (row ? STEP * 0.5 : 20)
    for (let t = row * ang(STEP) * 0.5; t < Math.PI * 2; t += ang(STEP)) {
      const off = ((t - door + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      if (Math.abs(off) < doorHalf) continue
      const k = pick()
      const th = t + (nx() - 0.5) * ang(STEP) * 0.35
      const rr = R + (nx() - 0.5) * STEP * 0.4
      out.push({
        art: k.art, x: c.x + Math.cos(th) * rr, y: c.y + Math.sin(th) * rr,
        size: k.min + nx() * (k.max - k.min),
      })
    }
  }

  // ── THE SHINGLE ON THE RIM ──
  // Small rock at four times the density, exactly as on the reef: boulders on
  // their own leave bare patches the eye reads as a way through, and rock with
  // nothing small in it has no size to it.
  for (let t = 0; t < Math.PI * 2; t += ang(PEBBLE_STEP * 2)) {
    const off = ((t - door + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    if (Math.abs(off) < doorHalf) continue
    const pa = SHINGLE_ART[Math.min(SHINGLE_ART.length - 1, Math.floor(nx() * SHINGLE_ART.length))]
    const r = nx()
    const th = t + (nx() - 0.5) * ang(PEBBLE_STEP * 2) * 0.8
    const rr = b.r + 20 + (nx() - 0.5) * 220
    out.push({
      art: pa.art, x: c.x + Math.cos(th) * rr, y: c.y + Math.sin(th) * rr,
      size: pa.min * 0.7 + r * r * (pa.max - pa.min) * 0.7,
    })
  }

  // ── THE STRAIT'S TWO SIDES ARE WATER NOW ──
  //
  // They were two runs of the same four rocks down a two-thousand-pixel
  // passage, twice over, and at that length the repeat is the only thing you
  // see. They are shoals like the route walls inside the bay — see seaSurfLine
  // and the `surfLines` that feeds it, which builds the strait's two edges from
  // the same geometry this used.
  //
  // `put` stays: the gate stones below still use it, and they are the one thing
  // out here that should be an object. Two stones either side of a gap is a
  // DOOR, and a door is a specific thing rather than a length of coast.
  const put = (along: number, across: number, art: string, size: number) => {
    const p = fromStrait(b, along, across)
    out.push({ art, x: p.x, y: p.y, size })
  }

  // ── THE GATE STONES ──
  // Either side of the mouth, framing it. A gap in a run of rock is a gap you
  // might have imagined; two stones standing either side of it is a door — and
  // out here it is the door to a whole chapter.
  put(-40, -(b.half + 200), '/sea/rock-gate-w.png', 420)
  put(-40, b.half + 200, '/sea/rock-gate-e.png', 420)

  // ── THE FLOTSAM ──
  // The loose things: a wrecked boat, a fallen bollard, a knot of kelp, out in
  // the water rather than on the coast. They are what makes a bay feel like a
  // place somebody has been rather than a walled pond, and they are small — a
  // wreck is half a hull, which is what a wreck is.
  //
  // SCATTERED IN BAY SPACE and kept off the axis, so nothing lands in the
  // doorway or in the middle of the run to the boss.
  for (let i = 0; i < 14 && KIND.props.length > 0; i++) {
    const k = KIND.props[Math.min(KIND.props.length - 1, Math.floor(nx() * KIND.props.length))]
    // A ring between a third and nine-tenths of the way out, so the middle of
    // the bay stays open water and the edge stays sailable.
    const rr = b.r * (0.34 + nx() * 0.56)
    const th = nx() * Math.PI * 2
    out.push({
      art: k.art, x: c.x + Math.cos(th) * rr, y: c.y + Math.sin(th) * rr,
      size: k.min + nx() * (k.max - k.min),
    })
  }

  // Painter's order: further south is nearer, so it draws last and overlaps
  // what is behind it. Without this a big rock at the back sits on top of a
  // small one in front and the whole coast goes flat.
  return out.sort((p, q) => p.y - q.y)
}

/* `wallRocks` lived here and is gone with the rock it made. A bay's route
   boundary is broken water now — see seaSurfLine — and the only thing that
   still reads a wall's geometry is the crossing test, which always did. */

/**
 * THE PERMANENT ROCK: every bay's COAST, and nothing else.
 *
 * The route walls used to be here too, as rock laid end to end every couple of
 * hundred pixels — four pieces of art repeating down thirty-seven thousand
 * pixels of boundary, which reads as exactly that. They are shoals now, drawn
 * by the water rather than built out of objects: see seaSurfLine, and note that
 * the wall itself is untouched, because collision has always read the SEGMENT
 * and never the stone beside it.
 *
 * The bay's own rim stays rock. That is a coast — the edge of the water, with
 * land behind it — and a coast is a thing rather than a condition of the sea.
 */
const BAY_WALLS = [...BAYS.flatMap(bayRocks)].sort((p, q) => p.y - q.y)

/** How far off a wall a refused hull is set down. A shade under a boat's beam,
 *  so she rides against it rather than bouncing off it. */
const WALL_SKIN = 26

/**
 * EVERY WALL'S TWO ENDS, IN WORLD SPACE, WORKED OUT ONCE.
 *
 * The walls are written in bay space and never move, so converting them on
 * every frame for every wall would be a few hundred trig calls a frame to
 * arrive at the same numbers as last time.
 */
const WALL_SEGS = new Map(WALLS.map(w => [w, wallEnds(w)]))
const wallSeg = (w: Wall) => WALL_SEGS.get(w) ?? null

/**
 * DID THIS FRAME'S TRAVEL CROSS THIS WALL, AND WHERE?
 *
 * Two segments, the standard cross-product test, returning the point of
 * intersection or null. Nothing clever, and that is the point: a boat under way
 * covers eighty pixels in a frame, and any test that asks "how near the wall am
 * I" lets her tunnel through anything she can clear in one step — which is
 * exactly the speed she is doing when it matters most.
 */
function segHit(
  px: number, py: number, qx: number, qy: number,
  ax: number, ay: number, bx: number, by: number,
): { x: number; y: number } | null {
  const rx = qx - px, ry = qy - py
  const sx = bx - ax, sy = by - ay
  const d = rx * sy - ry * sx
  if (Math.abs(d) < 1e-9) return null          // parallel, or she did not move
  const t = ((ax - px) * sy - (ay - py) * sx) / d
  const u = ((ax - px) * ry - (ay - py) * rx) / d
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: px + rx * t, y: py + ry * t }
}

/** How far short of a gate the water gives out. Enough that the boat is plainly
 *  stopped by something rather than nosing into an invisible line. */
const GATE_SKIN = 70

/** How far off a coast a refused hull is put back. */
const SKIN = 14

/**
 * THE NEAREST POINT INSIDE A CHAPTER'S WATER — and the nearest OUTSIDE it.
 *
 * The shape is a disc and a box that overlap, so each answer is worked out for
 * both pieces and the nearer one wins. Which is the whole reason to keep the
 * region as a union rather than as one clever formula: two easy clamps and a
 * comparison cannot be wrong at the join, and the join is the one place on this
 * coast every captain passes through.
 */
function intoWater(b: Bay, x: number, y: number): { x: number; y: number } {
  const c = bayCentre(b)
  const dx = x - c.x, dy = y - c.y
  const d = Math.hypot(dx, dy) || 1
  const k = Math.min(d, b.r - SKIN)
  const disc = { x: c.x + (dx / d) * k, y: c.y + (dy / d) * k }

  const L = straitLen(b)
  const q = toStrait(b, x, y)
  const box = fromStrait(b,
    Math.min(Math.max(q.along, SKIN), L - SKIN),
    Math.max(-b.half + SKIN, Math.min(b.half - SKIN, q.across)))

  return Math.hypot(disc.x - x, disc.y - y) <= Math.hypot(box.x - x, box.y - y) ? disc : box
}

function outOfWater(b: Bay, x: number, y: number): { x: number; y: number } {
  if (inBay(b, x, y)) {
    const c = bayCentre(b)
    const dx = x - c.x, dy = y - c.y
    const d = Math.hypot(dx, dy) || 1
    return { x: c.x + (dx / d) * (b.r + SKIN), y: c.y + (dy / d) * (b.r + SKIN) }
  }
  // In the strait, then. Out the nearer side, unless she is at the junction end,
  // where out means back into the junction.
  const q = toStrait(b, x, y)
  if (q.along < b.half - Math.abs(q.across)) return fromStrait(b, -SKIN, q.across)
  return fromStrait(b, q.along, q.across >= 0 ? b.half + SKIN : -b.half - SKIN)
}

/**
 * THE ROCK ACROSS A MOUTH NOBODY HAS EARNED YET.
 *
 * Built per bay and kept apart from the coast, because this is the one part of
 * it that differs from captain to captain. Same rock as the rest of that bay's
 * shore, so a shut door reads as the coast having simply closed over rather than
 * as a barrier somebody dropped in.
 */
const MOUTH_PLUGS: Record<string, { art: string; x: number; y: number; size: number }[]> =
  Object.fromEntries(BAYS.map(b => {
    const out: { art: string; x: number; y: number; size: number }[] = []
    const KIND = CHAPTER_ROCKS[b.rocks].wall
    const STEP = rockStep(CHAPTER_ROCKS[b.rocks])
    let seed = 0x2545f491
    for (let i = 0; i < b.id.length; i++) seed = (Math.imul(seed ^ b.id.charCodeAt(i), 0xc2b2ae35) >>> 0)
    const nx = () => {
      seed ^= seed << 13; seed >>>= 0
      seed ^= seed >>> 17
      seed ^= seed << 5; seed >>>= 0
      return seed / 0x100000000
    }
    const put = (along: number, across: number, art: string, size: number) => {
      const p = fromStrait(b, along, across)
      out.push({ art, x: p.x, y: p.y, size })
    }
    for (const row of [0, 1]) {
      for (let x = -b.half; x <= b.half; x += STEP) {
        const k = KIND[Math.min(KIND.length - 1, Math.floor(nx() * KIND.length))]
        put(60 - (row ? STEP * 0.5 : 0) + (nx() - 0.5) * 120,
          x + (nx() - 0.5) * STEP * 0.3,
          k.art, k.min + nx() * (k.max - k.min))
      }
    }
    for (let x = -b.half; x <= b.half; x += PEBBLE_STEP) {
      const pa = SHINGLE_ART[Math.min(SHINGLE_ART.length - 1, Math.floor(nx() * SHINGLE_ART.length))]
      const r = nx()
      put(40 + (nx() - 0.5) * 260, x + (nx() - 0.5) * PEBBLE_STEP * 0.8,
        pa.art, pa.min + r * r * (pa.max - pa.min))
    }
    return [b.id, out.sort((p, q) => p.y - q.y)] as const
  }))

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
// ── THE BAY COASTS ARE NOT IN HERE, AND THAT IS DELIBERATE ──────────────────
//
// This layer is drawn ABOVE the whole world, which is fine when the only thing
// under it is the hull — that is what it is for. It is not fine when there is
// anything else standing in the water, because a rock that qualifies jumps over
// ALL of it, not just the boat: sail up on a boss and the coast behind her
// suddenly draws in front of her, then drops back the moment you pass. Reported
// as exactly that, and it is only possible in the bays, because the bays are
// the only water with big painted objects standing in it.
//
// The fishing sea keeps the near pass unchanged. Out here the trade is the
// other way round: the hull occasionally drawing over a rim rock she is south
// of costs a glance, and a boulder teleporting over a man-o-war costs the whole
// illusion that these things are IN a place.
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
  // On the canvas now, with the landmarks — see gpuMarks. Three hundred rocks
  // as six hundred masked images was the biggest thing the port had left.
  if (GPU_ISLANDS) return null
  return <>{REEF.map((m, i) => <SeaMark key={`reef${i}`} m={m} i={i + 500} />)}</>
})

/** The harbour's shore. Same treatment as the reef and for the same reason —
 *  a module constant that can never change, so the parent pays one element. */
const AnchorageWall = memo(function AnchorageWall() {
  if (GPU_ISLANDS) return null
  return <>{ANCHORAGE_WALL.map((m, i) => <SeaMark key={`anch${i}`} m={m} i={i + 1200} />)}</>
})

/** The campaign's roads. Same treatment as the reef and the harbour wall, for
 *  the same reason: four more module constants that can never change. */
const BayWalls = memo(function BayWalls() {
  if (GPU_ISLANDS) return null
  return <>{BAY_WALLS.map((m, i) => <SeaMark key={`bay${i}`} m={m} i={i + 4000} />)}</>
})

/** The shut mouths, on the DOM path. Takes its rocks as a prop because this is
 *  the one part of the coast that differs per captain. */
const MouthPlugs = memo(function MouthPlugs({ rocks }: {
  rocks: { art: string; x: number; y: number; size: number }[]
}) {
  if (GPU_ISLANDS) return null
  return <>{rocks.map((m, i) => <SeaMark key={`plug${i}`} m={m} i={i + 9000} />)}</>
})

/** Crew card art lives in Supabase storage, same bucket the crew hall reads. */
const CREW_ART_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/`
const crewArt = (f: string) => (f ? CREW_ART_BASE + f : '')

const LandmarkField = memo(function LandmarkField() {
  // These are drawn on the canvas now — two sprites sharing a
  // texture baked once per painting, and culled to the viewport. See
  // SeaIslandsGPU. The DOCK marks below are not part of this: they belong to
  // the berth UI rather than to the scenery pass.
  if (GPU_ISLANDS) return null
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
      <div className="sea-lit" style={{ transform: `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.98)` }}>
        {!GPU_ISLANDS && <TraderSkiff look={FINN_LOOK} />}
      </div>

      {/* ── THE QUEST MARKER ────────────────────────────────────────
          The one piece of deliberately un-subtle UI on this chart, and it
          earns it: he is the fishing campaign's only delivery route, so a
          captain who cannot tell at a glance that he has something is a
          captain who does not get the story.

          A GOLD ! when he has a beat or a job to give, a GOLD ? when one is
          finished and he is waiting to take it back. MMO shorthand, used on
          purpose, because it is shorthand everybody already reads — and it was
          the wrong way round here, which is worse than having no shorthand at
          all: a captain who reads these anywhere else was being told "nothing
          to hand in" by the exact glyph that means it is time to.

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
          {/* READY IS THE LOUDER OF THE TWO. An offer is an invitation and can
              wait; a finished job is YOUR pay sitting in his boat, so it is
              bigger, brighter and moves faster. Same glyph family, so it is
              still one thing with two states rather than two things. */}
          <div className={ready ? 'finn-quest-mark finn-quest-ready' : 'finn-quest-mark'} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 42, height: 42,
          }}>
            <span className="font-cinzel font-700" style={{
              fontSize: ready ? '2.8rem' : '2.3rem', lineHeight: 1,
              color: '#ffd24a',
              textShadow: ready
                ? [
                  '0 0 3px rgba(60,36,0,1)', '0 2px 6px rgba(0,0,0,0.95)',
                  '0 0 22px rgba(255,206,80,1)', '0 0 48px rgba(255,178,50,0.85)',
                  '0 0 84px rgba(255,168,40,0.5)',
                ].join(', ')
                : [
                  '0 0 3px rgba(60,36,0,1)', '0 2px 5px rgba(0,0,0,0.9)',
                  '0 0 18px rgba(255,196,60,0.95)', '0 0 38px rgba(255,168,40,0.7)',
                ].join(', '),
              WebkitTextStroke: '1.5px rgba(70,42,0,0.85)',
            }}>{ready ? '?' : '!'}</span>
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


  return (
    <>
      {/* THE SURF RINGS ARE GONE. Two blurred canvases scaled 0.82 and 0.772 of
          the island box, pulsing opacity out of phase — which is exactly what
          it read as: two rings pulsing. Nothing about it ever moved OUTWARD,
          and a surf that does not run at the beach is a halo, not water.

          The shore is the water's business now. seaWater draws it as distance
          to the nearest coast, banded, with the bands travelling shorewards and
          the edge chewed by the same noise that makes the swell — so the foam
          wanders along a coastline instead of ringing it. That needs the GPU
          renderer, so it is not on the ?gpu=0 fallback. */}
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
      {/* THE RING IS ON THE CANVAS UNDER THE FLAG, along with a lit pool and
          a run of approach lights — see seaBerth for what a berth is actually
          trying to say. The BEACONS stay either way: they are lamps standing on
          the water with art of their own, not an annotation drawn over it. */}
      {!GPU_ISLANDS && <div style={{
        position: 'absolute', left: -b.r, top: -b.r, width: b.r * 2, height: b.r * 2,
        borderRadius: '50%',
        border: `2px ${active ? 'solid' : 'dashed'} ${active ? 'rgba(255,217,134,0.7)' : 'rgba(226,244,250,0.26)'}`,
        background: active ? 'rgba(255,206,120,0.05)' : 'none',
        boxShadow: active ? 'inset 0 0 40px rgba(255,196,110,0.16)' : 'none',
        transition: 'border-color 300ms ease-out, background 300ms ease-out, box-shadow 300ms ease-out',
      }} />}
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
 * YOUR SHIP AT HER BERTH.
 *
 * Whenever she is not out being sailed she is lying in the Gunwharf's berth —
 * the same drawn circle off its shore that every island on this chart moors you
 * in, so she is tied up somewhere that already exists rather than against a
 * plank of art painted for her.
 *
 * SHE HAS TO BE VISIBLE OR THE SWAP IS A MENU STATE. Without her you would be
 * told your ship was waiting and have to take it on trust; lying at her berth,
 * it is a fact you can see from across the harbour. She disappears the moment
 * you board — she is your sprite then — and the berth simply stands empty.
 *
 * FULL SAILED SIZE, not the trawl fleet's moored 0.71. She is the same object
 * you will be steering ten seconds after boarding, and the two renders can be
 * seen within moments of each other: a hull that grows a third when you step
 * onto it reads as a swap, not a boarding. The smacks get away with
 * moored-scale because you never sail one.
 */
/**
 * ── AND SHE LIES OFF THE BERTH, NOT IN IT ───────────────────────────────────
 *
 * She used to be drawn AT `berthOf(GUNWHARF)`, which is the circle you have to
 * sail into to go ashore — so the one thing you came to the Gunwharf to do was
 * behind three hundred and forty pixels of your own warship. Visible, and in
 * the way, which is the worst combination: it looked deliberate.
 *
 * Moored off the island's top-right shoulder instead. Her hull clears the berth
 * circle by ninety-four pixels — measured against WARSHIP_W rather than eyed,
 * because "next to it" is exactly the reasoning that put her on top of it — and
 * she sits 439 from the island's centre against its 340 radius, so she is
 * floating just off the shore rather than parked on the grass.
 */
const SHIP_BERTH_OFF = { dx: 300, dy: -320 }

const ShipAtBerth = memo(function ShipAtBerth({ shipTier }: { shipTier: number }) {
  const b = { x: GUNWHARF.x + SHIP_BERTH_OFF.dx, y: GUNWHARF.y + SHIP_BERTH_OFF.dy }
  return (
    <div style={{
      position: 'absolute', left: b.x, top: b.y,
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
  )
})

/** THE PORTAL'S NAME BOARD. DOM rather than canvas, like every other label on
 *  this chart, and counter-squashed for the same reason theirs are: it sits in
 *  the world layer so it travels with the water, but it is a sign and not a
 *  thing lying on the surface. */
const PortalName = memo(function PortalName({ tier, stone }: { tier: number; stone: boolean }) {
  const t = PORTAL_TIERS.find(p => p.tier === tier) ?? PORTAL_TIERS[0]
  return (
    <div aria-hidden style={{
      position: 'absolute', left: PORTAL.x, top: PORTAL.y + PORTAL.r * GROUND,
      pointerEvents: 'none',
      transform: `translate(-50%, 10px) scaleY(${1 / GROUND})`,
      transformOrigin: 'top center',
      textAlign: 'center', whiteSpace: 'nowrap',
    }}>
      <p className="font-cinzel font-700" style={{
        fontSize: '1.5rem', lineHeight: 1.1, margin: 0,
        color: stone ? '#eef4f8' : 'rgba(202,214,222,0.7)',
        textShadow: '0 2px 14px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)',
      }}>Home Portal</p>
      {/* WHAT IT WANTS, or how far it reaches. The board is the only thing out
          here that can explain dead water, and it has to do it in one line
          without a quest log: what is missing, and where to look for it. A
          player who sails up to a hole that does nothing and is told nothing
          concludes the game is broken, not that there is something to find. */}
      <p className="font-karla font-600" style={{
        fontSize: '0.95rem', marginTop: 2,
        color: stone ? `${t.accent}cc` : 'rgba(230,196,140,0.92)',
        textShadow: '0 1px 10px rgba(0,0,0,0.92)',
      }}>
        {stone ? `Reaches ${t.name}` : 'Dead water. It wants a portal stone.'}
      </p>
      {!stone && (
        <p className="font-karla" style={{
          fontSize: '0.82rem', marginTop: 1,
          color: 'rgba(196,214,228,0.66)',
          textShadow: '0 1px 10px rgba(0,0,0,0.92)',
        }}>There is one in the cache chest out in the Shallows.</p>
      )}
    </div>
  )
})

// PortalRing LIVED HERE, and it was five painted neon sigils: a glowing runic
// circle per tier, cyan through magenta, escalating to a glyph-dense
// masterwork. On a chart drawn in soft gouache with warm brown ink, over a
// sea whose whole palette is muted blue-green, it read as an arcane monument
// from a different game. It is a place on the water now, built out of the
// berth's own vocabulary and inverting every part of it: see seaPortalWell.

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
        {/* ON THE CANVAS UNDER THE FLAG. The wrapper stays: it carries their
            name, and the loop still eases the position into it. */}
        {!GPU_ISLANDS && (
          <Skipper
            characterColor={friend.characterColor}
            boatId={friend.boatId}
            hatId={friend.hatId}
            gear={friend.gear}
            frame="rest"
          />
        )}
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
/**
 * ── A CAMPAIGN ENCOUNTER, ON THE WATER ──────────────────────────────────────
 *
 * IT IS A SHIP. You sail up to a hull floating in the bay and take it on from
 * alongside — not to a portrait plate standing on the sea, which is a card with
 * the card taken away and is exactly what this surface exists to stop being.
 * `hullFor` picks the boss's own flagship out of the raid it belongs to, so the
 * ship you close on is the ship whose guns open ten seconds later.
 *
 * LIT BY WHETHER YOU CAN TAKE IT. Available is full colour; locked is drained
 * and dim, and STILL DRAWN — a ship you can see and cannot yet reach is the
 * reason to come back, and hiding it would leave the water empty until the
 * moment it is not.
 *
 * DRAINED, NOT ERASED, and the numbers had drifted past that. Locked was
 * greyscale 0.9 at half brightness, which is legible over the Shallows and is
 * NOTHING over the Last Fathom — that bay's deep stop is #08131e, and a
 * half-brightness grey hull on near-black water is an empty sea. A whole
 * chapter of content read as missing, on the one chart where every mark in it
 * is locked until three chapters are done.
 *
 * So: less grey, most of the brightness back, and a cool rim so the silhouette
 * has an edge whatever it is standing on. Still plainly not-yet — it is grey
 * and everything available beside it is not — but it is THERE. Cleared keeps its colour and loses its urgency: still there,
 * still fightable, no longer the thing you are here for.
 *
 * Counter-squashed like everything with height, because a hull stands ON the
 * plane rather than being painted onto it.
 */
/**
 * ── WHERE YOU HAVE TO BE TO FIGHT HER ───────────────────────────────────────
 *
 * A hull out in the bay said "there is a fight here" and nothing said WHERE.
 * The reach is measured off the mooring rather than off the ship (see DOCK), so
 * sailing at the boss is the one approach that does not arm it — you can be a
 * hundred pixels from her bowsprit and still be told nothing is in range, which
 * reads as broken and is really just an unmarked spot on the water.
 *
 * So the spot is drawn: a patch of water off her port quarter, exactly the size
 * of the reach that opens the card. Sail into the ring, press.
 *
 * LIT WHEN YOU ARE IN IT, which is the whole of the feedback. Outside, it is a
 * faint mark on the sea you can steer for; inside, it takes the gold every
 * actionable thing on this chart wears, and the prompt appears in the same
 * frame. Nothing for a hull you cannot take on yet — a ring inviting you into a
 * fight the chain will refuse is worse than no ring.
 */
const DockMark = memo(function DockMark({ enc, isNear }: {
  enc: Encounter
  isNear: boolean
}) {
  const at = dockAt(enc)
  if (!at) return null
  const r = ENCOUNTER_REACH
  return (
    <div aria-hidden style={{
      position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none',
      width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r,
      // ON THE PLANE, like everything else lying on this water. A circle that
      // is not squashed is a hoop standing up out of the sea.
      transform: `scaleY(${GROUND})`,
      borderRadius: '50%',
      background: isNear
        ? 'radial-gradient(circle, rgba(240,192,64,0.20) 0%, rgba(240,192,64,0.10) 58%, transparent 76%)'
        : 'radial-gradient(circle, rgba(190,214,232,0.09) 0%, rgba(190,214,232,0.05) 58%, transparent 76%)',
      boxShadow: isNear
        ? 'inset 0 0 0 2px rgba(240,192,64,0.55)'
        : 'inset 0 0 0 2px rgba(190,214,232,0.20)',
      transition: 'background 180ms ease, box-shadow 180ms ease',
    }} />
  )
})

const EncounterMark = memo(function EncounterMark({ enc, status, isNear, hullRef }: {
  enc: Encounter
  status: string
  isNear: boolean
  /** Handed in only for the hull currently being fought, so the fight over the
   *  chart can shake, list and sink the ship you actually sailed up to. */
  hullRef?: React.Ref<HTMLDivElement>
}) {
  const node = RAID_MAP.find(n => n.id === enc.node)
  const at = encounterAt(enc)
  const hull = hullFor(enc)
  if (!node || !at || !hull) return null

  const locked = status === 'locked'
  const cleared = status === 'cleared'

  // A FLAGSHIP IS BIGGER THAN A ROWBOAT, and neither of them is bigger than the
  // chart. Measured against the hull you are ACTUALLY sailing, which is
  // WARSHIP_W * beam — about 205px of ship at the Man-o-War, not the 340px box
  // it is drawn in. These were 340 and 230 against that box, so a boss came out
  // half again the length of the biggest ship in the game and a mob matched it.
  //
  // The enemy art fills about nine tenths of its own frame, so a boss at 260
  // puts roughly 235px of hull beside your 205: bigger than you, and plausibly
  // so. A skirmisher at 185 is smaller than you, which is what a mob is.
  const w = node.type === 'raid' ? 260 : 185

  // The bob, phased off its own position so a bay full of hulls is never in
  // step. Ships rising and falling together read as one object.
  const phase = ((Math.abs(at.x) + Math.abs(at.y)) % 1000) / 1000

  return (
    <div aria-hidden style={{
      position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none',
      transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
      transformOrigin: 'bottom center',
    }}>
      {/* THE WATER UNDER IT, so the hull sits IN the sea rather than on top of
          it. Foreshortened with the plane, like the berth pools and the
          portal. */}
      {/* A CONTACT SHADOW, and nothing else. This was a red wash under every
          available hull — a colour on the water that meant "you can fight this"
          and looked like the ship was standing in something. What you can fight
          is said by the dock ring out in front of her now; a hull only needs
          the dark patch that stops her floating a foot above the sea. */}
      <div aria-hidden style={{
        position: 'absolute', left: '50%', bottom: w * 0.06,
        width: w * 0.92, height: w * 0.22,
        transform: `translate(-50%, 0) scaleY(${GROUND})`,
        borderRadius: '50%',
        background: locked
          ? 'radial-gradient(ellipse, rgba(6,12,18,0.55) 0%, transparent 70%)'
          : 'radial-gradient(ellipse, rgba(6,12,18,0.44) 0%, transparent 72%)',
      }} />

      {/* THE FIGHT'S OWN LAYER, and the reason it is separate from the bob
          below: a CSS animation beats an inline transform, so a shake written
          onto the bobbing node would simply be ignored. This one carries what
          the fight does to her — the shudder of a hit, the list, the long roll
          as she goes down — while the bob underneath goes on being the sea. */}
      <div ref={hullRef}
        // The one hull in a fight is the other thing that must not go still —
        // see .sea-alive. `hullRef` is handed in for the fought ship and
        // nothing else, so this marks exactly that one.
        className={hullRef ? 'sea-alive' : undefined}
        style={{ transformOrigin: 'bottom center' }}>
      <div style={{
        animation: `encBob 5.5s ease-in-out ${(-phase * 5.5).toFixed(2)}s infinite`,
        transformOrigin: 'bottom center',
      }}>
      {/* ── SHE IS UNDER WAY, BARELY ─────────────────────────────────────
          A hull that only bobs is moored. A few pixels of drift and the
          occasional turn is a ship holding station — which is what every one of
          these is doing while it waits for you.

          TWO WRAPPERS, because both write `transform` and one element cannot
          carry two animations that do. The drift slides; the flip turns her,
          and it turns her ON A STEP: eased, a ship reads as a piece of paper
          being rotated, which is exactly the note the menagerie's pets got. */}
      <div className="enc-drift" style={{ animationDelay: `${(-phase * 17).toFixed(2)}s` }}>
      <div className="enc-turn" style={{ animationDelay: `${(-phase * 29).toFixed(2)}s` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hull} alt="" draggable={false} decoding="async" style={{
          // ── maxWidth: 'none' IS THE SHIP BEING VISIBLE AT ALL ───────────
          //
          // The global stylesheet gives every <img> `max-width: 100%`, and this
          // one stands inside an absolutely positioned wrapper with no width —
          // a shrink-to-fit box whose width comes from its content. That is a
          // circle: the img's cap needs the wrapper's width, the wrapper's
          // width needs the img's. Which way the browser breaks the circle is
          // not ours to rely on, and in practice it broke BOTH ways on this
          // very chart — chapter one's hulls resolved at their inline 260px
          // while chapter four's resolved at zero, an <img> fully mounted,
          // decoded, positioned on screen and 0x0. Proven in a live browser:
          // setting maxWidth none snapped the flagship from 0x0 to full size.
          //
          // IsleRock already carries this override for exactly this reason.
          // Every mark img in a width-less wrapper must.
          maxWidth: 'none',
          width: w, height: 'auto', display: 'block',
          // ── A FILTER ONLY WHEN IT IS SAYING SOMETHING ───────────────────
          //
          // THE DEFAULT STATE CARRIES NO FILTER, and that is the fix for a
          // whole bay of hulls that would not paint. Every mark used to carry
          // a `drop-shadow` in EVERY state, so a filter — and the compositor
          // backing surface that comes with it — was the baseline rather than
          // the exception. The Last Fathom is fourteen marks over twelve baked
          // islands; that is the worst bay on the chart, it is exactly the bay
          // the ships went missing from, and the surfaces are the one thing
          // that scales with it.
          //
          // The shadow was never load-bearing anyway: there is a real contact
          // shadow drawn on the water above, which is what actually stops her
          // floating. What is left needs a filter and earns it — the drained
          // look of a locked hull, and the gold on the ONE you are near.
          filter: locked
            ? 'grayscale(0.72) brightness(0.82) drop-shadow(0 0 10px rgba(150,186,210,0.35))'
            : isNear && !cleared
              ? 'drop-shadow(0 8px 18px rgba(0,0,0,0.6)) drop-shadow(0 0 20px rgba(240,192,64,0.55))'
              : undefined,
          opacity: cleared ? 0.85 : 1,
        }} />
      </div>
      </div>
      </div>
      </div>
    </div>
  )
})

/**
 * ── A CACHE, STANDING ON ITS ROCK ───────────────────────────────────────────
 *
 * The campaign's own caches — the Quartermaster's, the Driftwood, the Sunken —
 * as a chest on an isle. On, not beside: these were floating in open water,
 * which reads as a bug because it is one. A cache is somewhere somebody LEFT
 * something, and that means land.
 *
 * SIZED OFF ITS ISLE, exactly as the fishing sea's chests are — see IsleRock,
 * which takes 0.30 of the rock's radius and explains why: a fixed size makes a
 * chest on a small rock look like a shipping container, and the boat moored a
 * few lengths off is the only scale anybody has.
 *
 * The chest art is the chart's own, because a captain has already learned what
 * one of those means and a second visual language for "there is something in
 * this" would be two lessons for one idea.
 */
const CacheMark = memo(function CacheMark({ cache, status, isNear }: {
  cache: Cache
  status: string
  isNear: boolean
}) {
  const at = cacheAt(cache)
  const isle = cacheIsle(cache)
  if (!at || !isle) return null

  const locked = status === 'locked'
  const cleared = status === 'cleared'
  const w = isle.r * 0.34

  return (
    <div aria-hidden style={{
      position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none',
      transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
      transformOrigin: 'bottom center',
    }}>
      {/* A SHADOW ON THE ROCK, not a pool in the water. The chest is standing on
          something now, so what belongs under it is the shade it casts. */}
      <div aria-hidden style={{
        position: 'absolute', left: '50%', bottom: -w * 0.06,
        width: w * 1.25, height: w * 0.4,
        transform: `translate(-50%, 0) scaleY(${GROUND})`,
        borderRadius: '50%',
        background: locked || cleared
          ? 'radial-gradient(ellipse, rgba(6,12,18,0.45) 0%, transparent 70%)'
          : 'radial-gradient(ellipse, rgba(240,192,64,0.22) 0%, transparent 72%)',
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cleared ? '/sea/isle-chest-open.png' : '/sea/isle-chest.png'}
        alt="" draggable={false} decoding="async" style={{
          // maxWidth none, or the shrink-wrapped wrapper can zero it — see the
          // note on EncounterMark's hull.
          maxWidth: 'none',
          width: w, height: 'auto', display: 'block', position: 'relative',
          // No filter in the resting state — see EncounterMark. The shade on
          // the rock above is the real shadow.
          filter: locked
            ? 'grayscale(0.75) brightness(0.85) drop-shadow(0 0 9px rgba(150,186,210,0.32))'
            : isNear && !cleared
              ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 14px rgba(240,192,64,0.7))'
              : undefined,
          opacity: cleared ? 0.75 : 1,
        }} />
    </div>
  )
})

/**
 * ── A STORY POST, ON ITS ROCK ───────────────────────────────────────────────
 *
 * The chart's own note post, which the fishing sea already uses for exactly
 * this: something on a rock with writing on it. A captain has learned that
 * shape, and reusing it means a story beat and a cache read apart at a glance
 * without a word between them — a post is something to read, a chest is
 * something to take.
 *
 * ── AND THE UNREAD ONE IS MARKED ────────────────────────────────────────────
 *
 * A lit halo behind the post, pulsing, while there is a scene here you have not
 * seen. That is the whole quest marker: not a floating glyph, which would be a
 * second language and a HUD element standing in the water, but the light of the
 * thing itself. It stops the moment it is read, and the post stays.
 *
 * READ, IT STAYS AND DIMS. The story is not consumable. A beat that vanished
 * when it was done would leave the bay a little emptier every time you sailed
 * it, and re-reading is the only way back into a scene you have already had.
 *
 * LOCKED, IT IS DRAWN COLD. The chain is the campaign — you cannot read the wax
 * that names Krust before you have been up the line to learn there is a name —
 * and a post you can SEE and cannot yet read is the reason to come back. The
 * helm names it and refuses; silence would read as broken.
 */
const BeatMark = memo(function BeatMark({ beat, status, isNear }: {
  beat: Beat
  status: string
  isNear: boolean
}) {
  const at = beatAt(beat)
  const isle = beatIsle(beat)
  if (!at || !isle) return null

  const locked = status === 'locked'
  const cleared = status === 'cleared'
  // The post art is TALL — a little over half as wide as it is high — so it
  // takes a smaller share of the rock than a chest does for the same apparent
  // size. IsleRock makes the same split, for the same reason.
  const w = isle.r * 0.26

  return (
    <div aria-hidden style={{
      position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none',
      transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
      transformOrigin: 'bottom center',
    }}>
      {/* THE MARKER. Behind the post and foreshortened with the plane, so it
          reads as light lying on the rock rather than as a ring painted on the
          screen. Only while there is something unread here. */}
      {!locked && !cleared && (
        <div aria-hidden style={{
          position: 'absolute', left: '50%', bottom: -w * 0.1,
          width: w * 4.2, height: w * 2.4,
          transform: `translate(-50%, 0) scaleY(${GROUND})`,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(240,192,64,0.42) 0%, rgba(240,192,64,0.14) 45%, transparent 72%)',
          animation: 'beatCall 2.6s ease-in-out infinite',
        }} />
      )}
      <div aria-hidden style={{
        position: 'absolute', left: '50%', bottom: -w * 0.04,
        width: w * 1.5, height: w * 0.5,
        transform: `translate(-50%, 0) scaleY(${GROUND})`,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(6,12,18,0.45) 0%, transparent 70%)',
      }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/sea/isle-note.png" alt="" draggable={false} decoding="async" style={{
        // maxWidth none, or the shrink-wrapped wrapper can zero it — see the
        // note on EncounterMark's hull.
        maxWidth: 'none',
        width: w, height: 'auto', display: 'block', position: 'relative',
        // No filter in the resting state — see EncounterMark. A read post is
        // dimmed with opacity rather than brightness, and an UNREAD one is
        // already called out by the pulsing marker on the rock above, so the
        // glow it used to carry as well was a backing surface for a light that
        // was being drawn twice.
        filter: locked
          ? 'grayscale(0.75) brightness(0.82) drop-shadow(0 0 9px rgba(150,186,210,0.32))'
          : isNear && !cleared
            ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 16px rgba(240,192,64,0.8))'
            : undefined,
        opacity: cleared ? 0.66 : 1,
      }} />
    </div>
  )
})

/**
 * Everything the campaign has standing in the water, drawn back to front so a
 * hull further south overlaps one behind it — the chart's rule everywhere.
 *
 * Ships and caches are sorted TOGETHER rather than in two passes, or a chest in
 * front of a brigantine would draw behind it and the bay would go flat at
 * exactly the moment two things overlap.
 */
/**
 * ── THE WAY HOME, ON THE WATER ──────────────────────────────────────────────
 *
 * A hole in the sea with light coming up out of it. Painted rather than lit: a
 * dark well with a bright rim, foreshortened with the plane like the berth pools
 * and the homestead's portal, so it lies IN the water instead of floating on it.
 *
 * It is only ever drawn open. A bay whose boss is still standing has nothing
 * here at all — not a locked ring, nothing — because this is not a thing you
 * work toward, it is what the fight leaves behind, and a greyed-out one would
 * turn a reward into a chore you can see from the start.
 */
const WayHomeMark = memo(function WayHomeMark({ pt, isNear }: {
  pt: ReturnPortal
  isNear: boolean
}) {
  const at = portalAt(pt)
  if (!at) return null
  const d = PORTAL_REACH * 1.5

  return (
    <div aria-hidden style={{
      position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none',
      width: d, height: d * GROUND, marginLeft: -d / 2, marginTop: -(d * GROUND) / 2,
    }}>
      {/* THE WELL. Multiply-dark in the middle so it reads as depth rather than
          as a disc lying on the surface. */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(4,8,14,0.85) 0%, rgba(6,14,24,0.5) 46%, transparent 70%)',
      }} />
      {/* THE LIGHT COMING UP. */}
      <div style={{
        position: 'absolute', inset: '14%', borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(150,214,255,0.55) 0%, rgba(110,180,240,0.22) 40%, transparent 72%)',
        animation: 'wayHome 3.4s ease-in-out infinite',
      }} />
      {/* THE RIM, which is what makes it a mouth rather than a stain. */}
      <div style={{
        position: 'absolute', inset: '6%', borderRadius: '50%',
        border: `2px solid ${isNear ? 'rgba(190,232,255,0.9)' : 'rgba(150,208,244,0.55)'}`,
        boxShadow: isNear
          ? '0 0 26px rgba(150,208,244,0.7), inset 0 0 22px rgba(150,208,244,0.45)'
          : '0 0 16px rgba(150,208,244,0.4), inset 0 0 14px rgba(150,208,244,0.28)',
      }} />
    </div>
  )
})

/**
 * CAN THIS NODE BE FINISHED FROM THE WATER?
 *
 * `markStoryNodeRead` — the campaign's own write, and the only one this surface
 * calls — takes a story or a berth and refuses everything else, because on a
 * milestone or an event the scene is an intro and the claim after it is the real
 * clear. So this is the exact set whose whole interaction is "read it".
 *
 * Everything else on a rock out here is named and sent to the sheet that can
 * finish it. Teaching this surface those sheets is the next piece of work; until
 * then, offering a verb that runs a cutscene and then cannot record it would be
 * worse than the trip to the map.
 */
function readableAtSea(n: { type: string; scene?: unknown }): boolean {
  return !!n.scene && (n.type === 'story' || n.type === 'berth')
}

/**
 * WHAT PRESSING THIS ACTUALLY DOES, in one word.
 *
 * "Open" would cover a scene, a price and a permanent decision alike, and only
 * one of those three can be undone. The helm is the last thing read before the
 * thumb moves, so it has to say which of them is about to happen.
 */
function verbFor(n: RaidNode, status: string): string {
  if (status === 'cleared') return readableAtSea(n) ? 'Read again:' : 'Look again at'
  if (n.type === 'milestone') return 'Settle with'
  if (n.choice) return 'Open the'
  if (n.classPick) return 'Make'
  return 'Read'
}

const EncounterField = memo(function EncounterField({ bay, status, nearId, nearCacheId, nearBeatId, cleared, nearHomeId, fightNode, hullRef }: {
  /**
   * WHICH BAY'S CONTENT TO DRAW, or null for none of it.
   *
   * Every mark below is a few DOM nodes carrying a CSS filter, and a filter
   * gets its own backing surface — about four megabytes a rock at an iPhone's
   * pixel ratio. One chapter is seventeen of them and fine; five chapters is a
   * hundred and seven and is not, which is what kept killing the sea. Bays are
   * ten thousand pixels apart and a viewport is three, so nothing that could be
   * on screen is lost by drawing one bay's worth.
   */
  bay: string | null
  status: Record<string, string>
  nearId: string | null
  nearCacheId: string | null
  nearBeatId: string | null
  /** Which ways home have been earned. */
  cleared: string[]
  nearHomeId: string | null
  /** The node whose hull is currently in a fight, if any. Only that one gets
   *  the ref: the rest are scenery and must stay untouched by it. */
  fightNode: string | null
  hullRef: React.Ref<HTMLDivElement>
}) {
  const all = useMemo(() => [
    ...ENCOUNTERS.filter(x => x.bay === bay).map(e => ({ kind: 'ship' as const, e, y: encounterAt(e)?.y ?? 0 })),
    ...CACHES.filter(x => x.bay === bay).map(c => ({ kind: 'cache' as const, c, y: cacheAt(c)?.y ?? 0 })),
    ...BEATS.filter(x => x.bay === bay).map(bt => ({ kind: 'beat' as const, b: bt, y: beatAt(bt)?.y ?? 0 })),
  ].sort((p, q) => p.y - q.y), [bay])

  return <>
    {/* THE MOORINGS FIRST, all of them, under every hull and rock on the water.
        They are patches of SEA: a ship or an isle drawn over one is right, and
        one drawn over a hull would be a light lying on top of a ship. Only for
        fights you can actually take on — see DockMark. */}
    {/* AND NOT ONCE YOU ARE THERE. A mooring says "stand here to take this on";
        with the card up or the guns out you have taken it on, and a ring
        telling you where to start a fight you are already in is the sea talking
        over itself. `fightNode` is set for both, so this covers the card as
        well as the broadside. */}
    {fightNode ? null : ENCOUNTERS.filter(e => e.bay === bay).map(e => (status[e.node] ?? 'locked') === 'locked' ? null : (
      <DockMark key={`dock-${e.node}`} enc={e} isNear={nearId === e.node} />
    ))}
    {all.map(it => it.kind === 'ship'
    ? <EncounterMark key={it.e.node} enc={it.e}
        status={status[it.e.node] ?? 'locked'} isNear={nearId === it.e.node}
        hullRef={fightNode === it.e.node ? hullRef : undefined} />
    : it.kind === 'cache'
      ? <CacheMark key={it.c.node} cache={it.c}
          status={status[it.c.node] ?? 'locked'} isNear={nearCacheId === it.c.node} />
      : <BeatMark key={it.b.node} beat={it.b}
          status={status[it.b.node] ?? 'locked'} isNear={nearBeatId === it.b.node} />
  )}
  {/* UNDER EVERYTHING, because it is a hole in the water rather than a thing
      standing in it, and nothing should ever be hidden behind one. */}
  {RETURN_PORTALS.filter(pt => pt.bay === bay && wayHomeOpen(pt, cleared)).map(pt => (
    <WayHomeMark key={pt.bay} pt={pt} isNear={nearHomeId === pt.bay} />
  ))}</>
})

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
      {/* The land is on the GPU — see GPU_ISLANDS. Everything
          else about an isle, chest and all, is unchanged. */}
      {!GPU_ISLANDS && <Landmass id={isle.id} r={isle.r} />}

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
        {/* `sea-lit` carries the hour; the dug-over look is folded into the
            same declaration because a filter property cannot be written twice
            and the class would win. */}
        <img decoding="async" src={art} alt="" draggable={false} loading="lazy"
          className={found ? undefined : 'sea-lit'}
          style={{
            width: '100%', maxWidth: 'none', display: 'block',
            ...(found ? {
              filter: 'saturate(calc(0.86 - var(--sea-night, 0) * 0.5))'
                + ' brightness(calc(0.94 - var(--sea-night, 0) * 0.42))'
                + ' sepia(calc(var(--sea-warm, 0) * 0.34))',
            } : {}),
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

            {/* ── AND THE ONE THAT CHANGES THE MAP ─────────────────────
                Gold rather than the salvage green, above it rather than beside
                it, and it says what it DOES rather than what it is. A stone in
                a list of loot is a stone; a stone that tells you the water off
                your own island just woke up is the reason you sailed out. */}
            {won?.stone && (
              <div style={{
                margin: '0 auto 0.9rem', maxWidth: 320,
                padding: '0.7rem 0.85rem', borderRadius: 12,
                background: 'rgba(44,34,10,0.92)',
                border: '1px solid rgba(240,192,64,0.55)',
              }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.54rem', letterSpacing: '0.18em', margin: '0 0 3px',
                  color: 'rgba(240,192,64,0.9)',
                }}>A portal stone</p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.05rem', color: '#f6e6c6', margin: 0,
                }}>
                  {won.stone.tier === 1
                    ? 'The Home Portal is awake'
                    : `The portal can reach ${won.stone.name}`}
                </p>
                <p className="font-karla" style={{
                  fontSize: '0.78rem', color: 'rgba(226,214,186,0.86)', margin: '4px 0 0', lineHeight: 1.4,
                }}>
                  {won.stone.tier === 1
                    ? 'That dead water off your homestead is not dead any more. Sail into the middle of it and hold there.'
                    : 'Take it to the portal and build the next stage. It only ever remembers roads you have already sailed.'}
                </p>
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
      { art: `/crew/hall_${t(tiers.hall)}.png`, x: 54, y: 67, scale: 0.28 },
      { art: `/crew/drill_${t(tiers.drill)}.png`, x: 36, y: 60, scale: 0.12 },
      { art: `/crew/stores_${t(tiers.stores)}.png`, x: 73, y: 60, scale: 0.11 },
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
    // when you built it — and a captain who has NAMED the place gets their name
    // on the chart, which is most of the reason to let them name it. One helper
    // so the page and the water cannot end up calling it different things.
    name: homesteadName(h, guest),
    blurb: guest ? builtAt(h).name : p.blurb,
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
          {!GPU_ISLANDS && <Landmass id={place.id} r={place.r} locked={locked} />}

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
          {!GPU_ISLANDS && !isWater && place.buildings && place.buildings.length > 0 && (
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

          {/* ON THE CANVAS UNDER THE FLAG, together with the town glow above.
              They are parented to their island's display list there, which is
              the thing this could never be while the island was a texture and
              the tavern standing on it was a div: two renderers handed the same
              camera and asked to agree every frame. */}
          {!GPU_ISLANDS && place.buildings?.map((b, i) => (
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
                // NIGHT, ON A BOUNDED BOX. A building is a small element and
                // filtering it costs a small buffer; the crash came from
                // filtering the world CONTAINER, which is zero-size with
                // children spread across twenty thousand pixels, so the
                // compositor had to rasterise the whole chart's ink overflow.
                // Reading `--sea-night` means no per-frame write and no
                // re-render — the loop publishes the number once per step of
                // the fade. If a browser will not take calc() inside
                // brightness(), the declaration is simply dropped and the
                // building stays lit, which is the old behaviour.
                filter: locked
                  ? 'grayscale(0.75) brightness(0.82)'
                  // Golden hour warms as night dims, and sepia is the only
                  // filter primitive that shifts hue toward amber without a
                  // colour matrix. Small: it is a whole town going evening, not
                  // a photograph being toned.
                  : 'brightness(calc(1 - var(--sea-night, 0) * 0.42))'
                    + ' saturate(calc(1 - var(--sea-night, 0) * 0.5 + var(--sea-warm, 0) * 0.18))'
                    + ' sepia(calc(var(--sea-warm, 0) * 0.34))',
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
/**
 * ── IT SAT ON TOP OF THINGS, ON BOTH ENDS OF THE RANGE ──────────────────────
 *
 * Two hard-coded offsets, 52 and 62, and neither could be right everywhere:
 *
 *   COMPACT was `top: 52` and described as sitting under the phase glyph. The
 *   disc row starts at 18 and a disc is `hudSize` tall, which is 26 on a phone
 *   but 40 on a monitor — so the row runs to 58 on the surface with the most
 *   room, and the badge printed six pixels INTO it. It only ever cleared on the
 *   screen it was measured on.
 *
 *   FULL was `top: 62`, under a water name at `top: 18`. But the name drops to
 *   56 on a phone (WaterBanner's `lowered`, which exists because the name and
 *   the discs collide down there), and the badge did not drop with it, so on a
 *   phone the pill printed over the name of the water it was describing.
 *
 * Both are derived now, from the same two numbers the things above them are
 * built out of. A layout constant that encodes the size of something else is a
 * collision waiting for a breakpoint.
 */
function HotspotBadge({ spot, compact, hudSize, lowered }: {
  spot: Hotspot | null; compact: boolean
  /** A HUD disc's diameter, which is what sets how far down the row reaches. */
  hudSize: number
  /** Whether the water's name has been pushed to the second row. */
  lowered: boolean
}) {
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

  /** The underside of the HUD disc row, which both placements have to clear. */
  const hudBottom = 18 + hudSize
  /** And of the water's name, which only the centred one sits under. The name
   *  is 1.35rem of Cinzel over a 1px rule at +5, so a shade under 34px. */
  const bannerBottom = (lowered ? 56 : 18) + 34
  const below = compact
    ? hudBottom + 8
    // The centred one is under BOTH: it shares the middle with the name and the
    // left corner is only a disc-row away on a narrow screen.
    : Math.max(bannerBottom + 10, hudBottom + 8)

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
            ...(compact ? { top: below, left: 12, display: 'flex' } : {
              top: below, left: 0, right: 0,
              display: 'flex', justifyContent: 'center', padding: '0 1rem',
            }),
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

/**
 * ── YOU HAVE CROSSED INTO A CHAPTER ─────────────────────────────────────────
 *
 * A bay is an instance in everything but name: cross its threshold and the
 * chart drops every other chapter's rocks and bakes this one's, so what is in
 * the water with you is exactly one chapter's worth. The banner is that fact
 * said out loud, at the moment it becomes true.
 *
 * IT ARRIVES BIG AND THEN GETS OUT OF THE WAY. The crossing is an event and
 * wants the announcement; ten seconds later you are fishing a boss out of the
 * far corner and it is only a label answering "which chapter is this". Same
 * shape as the water banner below, which settles to a dim line for the same
 * reason — but bigger on arrival, and with the numeral, because a chapter is a
 * larger thing to have entered than a patch of water.
 */
const BayBanner = memo(function BayBanner({ bay }: { bay: string | null }) {
  const b = bay ? BAY_BY_ID[bay] : null
  const ch = b ? RAID_CHAPTERS.find(c => c.id === b.id) : null
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    if (!bay) return
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 3200)
    return () => clearTimeout(t)
  }, [bay])
  return (
    <AnimatePresence>
      {b && (
        <motion.div key={b.id}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12, transition: { duration: 0.35 } }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 0, right: 0, top: 18, zIndex: Z.hud,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
          }}>
          {ch && (
            <motion.p className="font-karla font-700 uppercase"
              animate={{ opacity: fresh ? 0.85 : 0.3 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
              style={{
                fontSize: '0.6rem', letterSpacing: '0.34em',
                color: 'rgba(240,192,64,0.95)', margin: 0,
                textShadow: '0 2px 12px rgba(0,0,0,0.95)',
              }}>
              Chapter {ch.romanNumeral}
            </motion.p>
          )}
          <motion.p className="font-cinzel font-700"
            animate={{ opacity: fresh ? 1 : 0.4, letterSpacing: fresh ? '0.26em' : '0.2em' }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            style={{
              fontSize: '1.5rem', textTransform: 'uppercase',
              color: '#e8f0f6', margin: '3px 0 0',
              textShadow: '0 2px 16px rgba(0,0,0,0.95)',
            }}>
            {b.name}
          </motion.p>
          <motion.div aria-hidden
            animate={{ opacity: fresh ? 0.55 : 0.12, width: fresh ? 132 : 52 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            style={{ height: 1, marginTop: 6, background: 'rgba(240,192,64,0.9)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
})

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

function Compass({ pos, zoom, wrapRef, locked, frozen, waitingAt, friends, finn }: {
  frozen: boolean
  /**
   * THE RIVAL, AND WHAT HE IS HOLDING.
   *
   * He is the fishing campaign's only delivery route and one boat on a
   * forty-five thousand pixel sea, so "which way is Finn" is a heading in
   * exactly the sense the nearest port and the zone's buyer are — the compass
   * is already the answer to that question and he belongs in it rather than in
   * a disc of his own at the top of the screen.
   *
   * `state` is what makes him worth a slot over a fourth port: an arrow that
   * only says which way is a map feature, and one that says a job is finished
   * is a reason to turn the boat round.
   */
  finn: { x: number; y: number; state: 'ready' | 'working' | 'offering' } | null
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
    /** Overrides the plate's colour. Only Finn uses it, and only to say whether
     *  he is holding a finished job. */
    accent?: string
    /** Breathes. Reserved for the one state that is asking for something. */
    urgent?: boolean
    sx: number; sy: number; world: number
  }
  const marks: Mark[] = []

  // ── THE RIVAL, AHEAD OF EVERYTHING WHEN HE IS HOLDING SOMETHING ──────
  //
  // Slots on this compass are assigned by ROLE rather than won by distance (see
  // the note above), and a finished job is the strongest role there is: it is
  // the only heading on the chart with a reward already earned sitting at the
  // end of it. Working or offering, he queues after the ports like anybody
  // else — the way home still outranks a man with a suggestion.
  if (finn) {
    const f = project(finn.x, finn.y)
    marks.push({
      id: 'finn',
      name: finn.state === 'ready' ? `${FINN_NAME} · ready` : FINN_NAME,
      dim: false,
      // A DISTANCE ON ALL THREE. The other marks earn one by being somewhere
      // you act on; he is a single boat rather than a coastline, so how far is
      // the difference between "go now" and "on the way back".
      dist: true,
      accent: finn.state === 'ready' ? '#f0c040'
        : finn.state === 'working' ? 'rgba(190,214,228,0.75)'
        : '#e8564a',
      urgent: finn.state === 'ready',
      sx: f.sx, sy: f.sy, world: f.world,
    })
  }

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
              borderBottom: `9px solid ${m.accent ?? `rgba(190,214,228,${dim ? 0.28 : lead ? 0.75 : 0.5})`}`,
              // ONLY THE FINISHED JOB BREATHES. Same limit every pulse on this
              // chart is held to: it may ask for attention because there is an
              // answer waiting, and it stops the moment there is not.
              animation: m.urgent ? 'seaMarkPulse 2.4s ease-in-out infinite' : undefined,
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
                color: m.accent ?? `rgba(214,232,240,${dim ? 0.4 : lead ? 0.9 : 0.62})`,
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
 * ASHORE AT THE GUNWHARF.
 *
 * TWO DOORS, and they are genuinely different kinds of thing, which is the
 * whole reason this is a chooser rather than a link.
 *
 * SAIL HER changes the hull under you. It is not a page and cannot be one, so
 * it opens the berth sheet — the muster, the mounts, and the confirm. That
 * sheet is the decision; this card is only the door to it.
 *
 * MANAGE HER is the refit yard, and it IS a page. From out here it used to be
 * reachable only through a small repair link buried in the berth sheet, and
 * only when the ship was actually sunk — so the one place on the chart that is
 * about your ship could not take you to the screen that is about your ship.
 *
 * The first card swaps its meaning with the hull you are in, because the
 * question genuinely reverses: standing here in the fishing boat you are asking
 * to take the ship out, and standing here in the ship you are asking to leave
 * her and go back to fishing.
 */
function GunwharfAshore({ open, onClose, onSail, onShip, shipTier }: {
  open: boolean; onClose: () => void; onSail: () => void
  onShip: boolean; shipTier: number
}) {
  const router = useRouter()
  const ship = getShip(shipTier)
  const doors = [
    {
      key: 'sail',
      art: ship.seaImageUrl,
      flip: !!ship.seaFlip,
      name: onShip ? 'Tie her up' : 'Sail her',
      blurb: onShip ? 'Leave her here and take the fishing boat' : 'Muster the crew and take her out',
      cta: onShip ? 'Moor' : 'Cast off',
      accent: '#f0c040',
      go: onSail,
    },
    {
      key: 'manage',
      art: '/sea/gunwharf.png',
      flip: false,
      name: 'Manage her',
      blurb: 'Hull, refits, armament and repairs',
      cta: 'Open',
      accent: '#8fb4d8',
      go: () => { onClose(); router.push('/expeditions/ship') },
    },
  ]
  return (
    // PopupShell does NOT portal, so it is a DOM child of the map — and the map
    // steers on click. Without this, dismissing the chooser also puts the helm
    // over. The same guard the Mainland's chooser carries.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ margin: 'auto', width: '100%', maxWidth: 400 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{
              fontSize: '0.66rem', color: 'rgba(190,214,228,0.85)', textShadow: '0 1px 5px rgba(0,0,0,0.85)',
            }}>Ashore at the Gunwharf</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.26rem', color: '#f4ecd8', textShadow: '0 2px 8px rgba(0,0,0,0.85)',
            }}>{ship.name}</p>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {doors.map((d, i) => (
            <motion.button key={d.key} type="button" className="tap"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.07, type: 'spring', stiffness: 380, damping: 28 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { vibrate([0, 16]); d.go() }}
              style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                padding: '0.85rem 0.55rem 0.8rem', borderRadius: 16, cursor: 'pointer',
                // A SOLID base under the tint, like every card that floats over
                // the painted chart.
                background: `linear-gradient(180deg, ${d.accent}24 0%, rgba(4,10,18,0.72) 48%, rgba(3,8,14,0.94) 100%), #06101a`,
                border: `1px solid ${d.accent}5c`,
                boxShadow: `0 0 22px ${d.accent}14`,
              }}>
              <div style={{
                position: 'relative', width: '100%', height: 92,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
              }}>
                <div aria-hidden style={{
                  position: 'absolute', width: 104, height: 104, borderRadius: '50%',
                  background: `radial-gradient(circle, ${d.accent}44, transparent 68%)`, filter: 'blur(3px)',
                }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.art} alt="" loading="eager" decoding="async" style={{
                  position: 'relative', maxWidth: '94%', maxHeight: 90, objectFit: 'contain',
                  transform: d.flip ? 'scaleX(-1)' : undefined,
                  filter: `drop-shadow(0 8px 18px ${d.accent}4d) drop-shadow(0 4px 10px rgba(0,0,0,0.6))`,
                }} />
              </div>
              <p className="font-cinzel font-800" style={{ fontSize: '1rem', color: '#f0ede8', lineHeight: 1.12 }}>
                {d.name}
              </p>
              <p className="font-karla font-600" style={{
                fontSize: '0.68rem', color: `${d.accent}dd`, marginTop: 3, lineHeight: 1.32,
              }}>{d.blurb}</p>
              <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{
                marginTop: 'auto', paddingTop: 9,
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem',
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
const ASHORE: {
  href: string; art: string; name: string; blurb: string; cta: string; accent: string
  /** `data-coach` handle, for a tour that needs to point at this door. */
  coach?: string
}[] = [
  { href: '/tavern', art: '/sea/tavern.png', name: 'The Tavern',
    blurb: 'The day\u2019s tot, and whatever race is running', cta: 'Enter', accent: '#e0a545' },
  { href: '/tavern/casino', art: '/sea/den.png', name: 'The Den',
    blurb: 'Cards, dice and the wheel', cta: 'Play', accent: '#d9534f' },
  { href: '/tavern/chart-room', art: '/sea/charting.png', name: 'The Chart Room',
    blurb: 'The week\u2019s puzzles and the world chart', cta: 'Study', accent: '#6fc4b4' },
  { href: '/tavern/trivia', art: '/sea/parlor.png', name: 'The Parlor',
    blurb: 'Trivia, and the Pirate King ladder', cta: 'Sit in', accent: '#dd8f79' },
  { href: '/tavern/market', art: '/sea/market.png', name: 'The Market',
    blurb: 'Sell the hold at full price', cta: 'Trade', accent: '#7fd6a0',
    // The first voyage lights this one up when it sends a captain in to sell
    // their first fish. See SeaFirstVoyage.
    coach: 'market' },
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
              data-coach={d.coach}
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
