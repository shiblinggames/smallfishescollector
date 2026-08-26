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

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import RenownPanel from '@/components/RenownPanel'
import Minimap from './Minimap'
import { decodeFog, encodeFog, fogHas, fogReveal, fogSet } from '@/lib/seaExplore'
import type { RenownState } from '@/app/(app)/actions/renown'
import type { FishSpeciesBasic } from '@/app/(app)/fishing/constants'
import type { VigilState } from '@/lib/ancientVigil'
import { saveSeaPosition } from './traderActions'
import { PLACES, LANDMARKS, RESIDENTS, HOME, OPEN_SEA, NORTH_WALL, OUTER_EDGE, GATE_X, GATE_HALF, GATE_DEPTH, inGate, type Place } from './chart'
import { ISLES, isleNear, chestArt, bandName, ashoreRange, type Isle } from '@/lib/seaIsles'
import { goAshore, type AshoreResult } from './isleActions'
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
import { seaClock, PHASE_LABEL, PHASE_GLYPH, type SeaPhase } from '@/lib/seaClock'
import { hotspotsAt, HOTSPOT_DEFS, TIER_GLOW, type Hotspot } from '@/lib/seaHotspots'
import { tradersAround, traderPos, yoonTrader, seaDay, plainRodFor, plainHookFor, KIND_LABEL, DEALS_PER_DAY, CELL, type Trader, type TraderLook } from '@/lib/seaTraders'
import TraderPanel from './TraderPanel'

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
  /** The full-screen "Entering the Abyss" flourish. */
  crossing: 6,
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
  return Math.max(0.45, Math.min(1, width / 780))
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
/** Held bearings are thrown far enough to be a direction rather than a place.
 *  Re-set every frame while the thumb is down, so the distance only has to be
 *  further than the boat can travel in one frame. */
const THROW = 9000
/** Press-and-hold this long without moving and it becomes a heading. Below it,
 *  the gesture is still a tap. */
const HOLD_MS = 220
/** Tap within this of the hull to drop anchor. */
const STOP_RADIUS = 190
/** The helm's radius. */
const HELM_R = 56
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
 * HOW CLOSE IS CLOSE ENOUGH TO GO ASHORE.
 *
 * It used to be the island's own radius, which was very nearly unusable: the
 * hull stops at `r * SHORE + HULL` — 235 world pixels off the Mainland — and
 * the go-ashore test was `r`, 250. Fifteen pixels of water, on one heading, is
 * not a window, it is a bug you have to fight.
 *
 * Now a port is approachable from a generous ring all the way around it. Pull
 * up anywhere in the vicinity, from any bearing, and the prompt is there. The
 * fishing bands start well outside this ring so the two never argue over which
 * prompt you get — see the Shallows' inner radius in chart.ts.
 */
const MOOR = 420
function moorR(p: Place): number { return p.r + MOOR }

const OBSTACLES: { x: number; y: number; r: number }[] = [
  ...PLACES.filter(p => p.kind === 'port').map(p => ({ x: p.x, y: p.y, r: p.r * SHORE + HULL })),
  ...LANDMARKS.filter(m => m.solid).map(m => ({ x: m.x, y: m.y, r: m.size * 0.3 + HULL })),
]

/** Nudge a point out to clear water if it has been asked for inside something
 *  solid. The helm should not be able to ORDER a course into rock, which is
 *  half the fix; the other half is that momentum cannot carry you in either. */
function clearOfLand(w: Vec): Vec {
  for (const o of OBSTACLES) {
    const dx = w.x - o.x, dy = w.y - o.y
    const d = Math.hypot(dx, dy)
    if (d < o.r) {
      // Dead centre has no direction to be pushed in, so pick one.
      if (d < 0.001) return { x: o.x + o.r, y: o.y }
      return { x: o.x + (dx / d) * o.r, y: o.y + (dy / d) * o.r }
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

const WAKE_MARKS = 16
/** Milliseconds between marks. Shorter reads as a solid smear, longer as a
 *  dotted line. */
const WAKE_EVERY = 85
/** How long a mark takes to dissolve. */
const WAKE_LIFE = 2100

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
const SEA_STEP = 96

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
    const squash = 0.42 + rnd() * 0.3
    const tilt = rnd() * Math.PI
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

function seaTiles(): { deep: string; pale: string } | null {
  if (typeof document === 'undefined') return null
  if (!deepURL) deepURL = makeMottle(DEEP_TILE, 48, '2,16,30', 90, 220, 0.18, 0x5eed1).toDataURL()
  if (!paleURL) paleURL = makeMottle(PALE_TILE, 52, '198,232,246', 40, 105, 0.07, 0xa17c3).toDataURL()
  return { deep: deepURL, pale: paleURL }
}

export default function SeaMap({
  fishingXP, characterColor, boatId, hatId, mods, gear, bait, baitQty, baitBag, hold, rack, hullSpeed, handlingTier, accelTier, start, log, trawlEndsAt, renown, exploredRaw, discovered, dealtToday,
  auto, tideTurner,
}: {
  fishingXP: number
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
  /** Rudder and rig tiers, from the Shipyard. */
  handlingTier: number
  accelTier: number
  /** Where the boat was when you last left. Null = never sailed. */
  start: Vec | null
  /** Everything the collection log reads. See SeaLog. */
  log: SeaLog
  /** ISO moments each running trawl comes due. See the Docks mark. */
  trawlEndsAt: string[]
  /** Fishing renown, for the level bar's chip. Null below the cap. */
  renown: RenownState | null
  /** Base64 fog bitfield as stored. See lib/seaExplore. */
  exploredRaw: string | null
  /** Isles this captain has already been ashore at. Ids from lib/seaIsles. */
  discovered: string[]
  /** Trader keys already dealt with today, read on the server so the count
   *  cannot be reset by reloading the page. */
  dealtToday: string[]
  /** The specials the CLIENT has to drive. See FishingHere for why these three
   *  are the only ones that needed carrying out here. */
  auto: { tier: 0 | 1 | 2; maxRarity: number }
  tideTurner: { has: boolean; left: number }
}) {
  const router = useRouter()
  const level = useMemo(() => getLevelFromXP(fishingXP), [fishingXP])

  /** THE WAKE. A fixed pool of marks laid in WORLD space and left behind, which
   *  is what makes it a wake rather than a tail: each stays exactly where the
   *  hull dropped it while the boat sails on. Recycled oldest-first, so there is
   *  no allocation in the loop and no garbage at 60fps. */
  const wakeRefs = useRef<(HTMLDivElement | null)[]>([])
  const wakeAt = useRef(Array.from({ length: WAKE_MARKS }, () => ({ x: 0, y: 0, born: -9999 })))
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
  const tiles = useMemo(() => seaTiles(), [])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const boatRef = useRef<HTMLDivElement | null>(null)

  // Position, velocity and target live in refs, not state: they change every
  // frame and re-rendering React sixty times a second to move one sprite is how
  // a map like this ends up dropping frames on a phone.
  // START WHERE YOU LEFT OFF, not at the dock. Read ONCE into a ref rather
  // than tracked as state: this is a starting point, and re-seeding it when the
  // prop happens to change would teleport a boat that is under way.
  //
  // Clamped north, because the wall can move: a position saved before the
  // Harbour became a border could otherwise strand you outside the world.
  const startAt: Vec = start
    ? { x: start.x, y: Math.max(NORTH_WALL, start.y) }
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
  const knobRef = useRef<HTMLDivElement | null>(null)
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
  const zoomRef = useRef(1)
  useEffect(() => {
    const fit = () => {
      const z = zoomFor(wrapRef.current?.getBoundingClientRect().width ?? window.innerWidth)
      zoomRef.current = z
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
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
    () => trawlEndsAt.filter(t => new Date(t).getTime() <= Date.now()).length)
  useEffect(() => {
    const tick = () => {
      const n = trawlEndsAt.filter(t => new Date(t).getTime() <= Date.now()).length
      setTrawlsReady(prev => (prev === n ? prev : n))
    }
    tick()
    const id = setInterval(tick, 5_000)
    return () => clearInterval(id)
  }, [trawlEndsAt])

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
  const [atGate, setAtGate] = useState(false)
  const gateRef = useRef(false)
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
  /** Who is on the water around us. Recomputed only when the boat crosses into
   *  a new cell, because the answer cannot change until it does. */
  const [traders, setTraders] = useState<Trader[]>([])
  const cellRef = useRef('')
  /** The one we have pulled alongside, and the one we are talking to. */
  const [nearTrader, setNearTrader] = useState<Trader | null>(null)

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
  /** Pressed up against the edge of the surveyed chart. Ref for the loop, state
   *  for the one line it puts on screen. */
  const [atEdge, setAtEdge] = useState(false)
  const edgeRef = useRef(false)
  /** The isle whose landing panel is open, and what it gave up. `landed`, not
   *  `ashore` — that name is already the Mainland's three-card chooser. */
  const [landed, setLanded] = useState<{ isle: Isle; result: AshoreResult } | null>(null)
  const [landing, setLanding] = useState(false)
  /** Mirrors `landing` for the callback, which is built once. */
  const landingRef = useRef(false)
  const [hailing, setHailing] = useState<Trader | null>(null)
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
  useEffect(() => { allTradersRef.current = [yoon, ...residents, ...traders] }, [yoon, residents, traders])
  /** The water we have the rod out in. Null means sailing. */
  const [fishingIn, setFishingIn] = useState<Place | null>(null)
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

  const locked = useCallback((p: Place) => level < p.minLevel, [level])

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
    const flush = () => {
      const p = pos.current
      const fog = [...fogPending.current]
      // THE TAB REMEMBERS TOO, and unconditionally. See `rememberPos`.
      rememberPos(p)
      // Moved far enough, OR there is fog to bank. A boat sitting still in a
      // patch it has just uncovered still has something worth saving.
      if (fog.length === 0 && Math.hypot(p.x - last.x, p.y - last.y) < 60) return
      last = { ...p }
      fogPending.current.clear()
      void saveSeaPosition(p.x, p.y, fog)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    const id = setInterval(flush, 20_000)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      // The unmount IS a navigation — going ashore, or the nav bar. This is the
      // one that closes the cheese, so it ignores the moved-far-enough test.
      //
      // The sessionStorage write is the one that actually matters here. The
      // server write is fire-and-forget and the trip back can beat it home;
      // this one is synchronous and cannot lose the race.
      rememberPos(pos.current)
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
    pos.current = { x: p.x, y: Math.max(NORTH_WALL, p.y) }
    target.current = { ...pos.current }
    vel.current = { x: 0, y: 0 }
  }, [])

  // Paint the backdrop once before the browser's first frame. The loop takes
  // over from here; this only exists so the very first paint is the right
  // colour rather than the wrap's bare base.
  useLayoutEffect(() => {
    const sky = skyRef.current
    if (sky) sky.style.background = seaAt(pos.current, seaClock().darkness).css
  }, [])

  const enter = useCallback((p: Place) => {
    vibrate([18, 40, 24])
    if (p.id === 'mainland') { setAshore(true); return }
    // A BREADCRUMB, so the place we send them to can come BACK rather than
    // pushing a second /sea on top of this one. A pushed return remounts the
    // whole chart from cold — re-reading the boat's position, rebuilding every
    // island — which is a visible reload of a screen nobody actually left.
    try { sessionStorage.setItem('sea:came-from-chart', '1') } catch { /* private mode */ }
    router.push(p.href)
  }, [router])

  const onTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (swallowTap.current) return
    // THE SAME GUARD onDown HAS. It was on the pointer path and not this one,
    // so anything marked `data-no-steer` still put the helm over on the click
    // that followed — the level bar being the one you actually notice, because
    // it looks tappable and at max level genuinely is. A control is a control
    // on every path that can reach it.
    if ((e.target as HTMLElement).closest?.('button, [data-no-steer]')) return
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
    // SAILING AWAY IS STOWING THE ROD. The fishing overlay is pointer-events
    // none, so a tap on the water around the result card never reaches it —
    // which is why clicking away appeared to do nothing at all. Handled here
    // instead, on the first touch, so it works for the move box as well as for
    // open water.
    if (fishingRef.current && canLeaveRef.current) {
      setFishingIn(null)
      setFrame('rest')
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
      const v = vel.current
      const sp = Math.hypot(v.x, v.y)
      target.current = sp > 1
        ? { x: pos.current.x + (v.x / sp) * TAP_HOP * 0.55, y: pos.current.y + (v.y / sp) * TAP_HOP * 0.55 }
        : { ...pos.current }
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
          target.current = {
            x: pos.current.x + v.x * THROW,
            y: pos.current.y + (v.y / GROUND) * THROW,
          }
        }
      }

      // HELD BEARING. Re-aimed every frame from the thumb's SCREEN position,
      // because the finger is still but the sea is moving under it — a bearing
      // stored once as a world point would slowly stop pointing where the thumb
      // is pointing.
      if (holding.current && holdAt.current && toWorldRef.current) {
        const w = toWorldRef.current(holdAt.current.x, holdAt.current.y)
        if (w) target.current = headingFrom(pos.current, w)
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
        const maxTurn = TURN * handlingRef.current * dt
        headRef.current += Math.max(-maxTurn, Math.min(maxTurn, diff))
      }
      const hx = Math.cos(headRef.current)
      const hy = Math.sin(headRef.current)

      // Decompose the CURRENT velocity about the NEW heading.
      let fwd = vel.current.x * hx + vel.current.y * hy
      let lat = -vel.current.x * hy + vel.current.y * hx

      // 2. Forward speed chases the order. Exponential, so the boat behaves the
      //    same at 30fps as at 60 — see the note this replaced.
      const kf = 1 - Math.exp(-ACCEL * accelRef.current * dt)
      fwd += (want2 - fwd) * kf

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
      if (pos.current.y < NORTH_WALL) {
        // THE ARCH IS THE ONE WAY THROUGH. Everywhere else along the wall is
        // cliff and behaves as it always did. In the gate's mouth you carry on
        // north into the throat, and the confirm meets you inside it — which is
        // the whole point of a gate you sail into rather than a button you
        // press: you are committed enough to be under the arch, and not so
        // committed that you cannot back out.
        if (inGate(pos.current.x)) {
          if (pos.current.y < NORTH_WALL - GATE_DEPTH) {
            pos.current.y = NORTH_WALL - GATE_DEPTH
            if (vel.current.y < 0) vel.current.y = 0
          }
          if (!gateRef.current) { gateRef.current = true; setAtGate(true) }
        } else {
          pos.current.y = NORTH_WALL
          if (vel.current.y < 0) vel.current.y = 0
        }
      } else if (gateRef.current && pos.current.y > NORTH_WALL + 90) {
        // Backed out and cleared the mouth. The 90px of hysteresis stops the
        // prompt flickering for anyone sitting exactly on the line.
        gateRef.current = false
        setAtGate(false)
      }

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
      const R = Math.hypot(pos.current.x, pos.current.y)
      if (R > OUTER_EDGE) {
        const nx2 = pos.current.x / R, ny2 = pos.current.y / R
        pos.current.x = nx2 * OUTER_EDGE
        pos.current.y = ny2 * OUTER_EDGE
        const outward = vel.current.x * nx2 + vel.current.y * ny2
        if (outward > 0) {
          vel.current.x -= nx2 * outward
          vel.current.y -= ny2 * outward
        }
        if (!edgeRef.current) { edgeRef.current = true; setAtEdge(true) }
      } else if (edgeRef.current && R < OUTER_EDGE - 400) {
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
      for (const o of OBSTACLES) {
        const dx = pos.current.x - o.x
        const dy = pos.current.y - o.y
        const dd = Math.hypot(dx, dy)
        if (dd >= o.r) continue
        const nx = dd < 0.001 ? 1 : dx / dd
        const ny = dd < 0.001 ? 0 : dy / dd
        pos.current.x = o.x + nx * o.r
        pos.current.y = o.y + ny * o.r
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
      if (speed > 55 && now - wakeLast.current > WAKE_EVERY) {
        wakeLast.current = now
        const i = wakeNext.current
        wakeNext.current = (i + 1) % WAKE_MARKS
        wakeAt.current[i] = {
          x: pos.current.x - (vel.current.x / speed) * 46 + WATERLINE_X / zoomRef.current,
          // WATERLINE_Y is a SCREEN measurement and this is a world coordinate
          // inside the squashed layer, so it has to be divided back out.
          // WATERLINE_Y is a SCREEN measurement and this is a world coordinate
          // inside the squashed, zoomed layer, so both have to be divided out.
          y: pos.current.y - (vel.current.y / speed) * 46 + WATERLINE_Y / (GROUND * zoomRef.current),
          born: now,
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
        // Spreads as it fades, the way disturbed water settles.
        el.style.opacity = String((1 - age) * 0.32)
        el.style.transform =
          `translate3d(${m.x}px, ${m.y}px, 0) translate(-50%, -50%) scale(${0.5 + age * 2.0})`
      }
      const ripples = rippleRef.current
      if (ripples) {
        ripples.style.opacity = String(Math.max(0, 1 - speed / 190))
        // The waterline is a measurement off the sprite, so it moves with the
        // sprite when the sprite is scaled.
        const z = zoomRef.current
        ripples.style.transform =
          `translate(${WATERLINE_X * z}px, ${WATERLINE_Y * z}px) scale(${z})`
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
        world.style.transform =
          `scale(${zoomRef.current}) scaleY(${GROUND}) translate3d(${-pos.current.x}px, ${-pos.current.y}px, 0)`
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
        const ox = (((pos.current.x + now / 1000 * 5.5) * zx) % DEEP_TILE + DEEP_TILE) % DEEP_TILE
        const oy = (((pos.current.y + now / 1000 * 2.5) * zx * GROUND) % DEEP_TILE + DEEP_TILE) % DEEP_TILE
        deep.style.transform = `translate3d(${-ox}px, ${-oy}px, 0)`
      }
      const pale = paleRef.current
      if (pale) {
        const zx = zoomRef.current
        const ox = (((pos.current.x - now / 1000 * 3.5) * zx) % PALE_TILE + PALE_TILE) % PALE_TILE
        const oy = (((pos.current.y + now / 1000 * 6.5) * zx * GROUND) % PALE_TILE + PALE_TILE) % PALE_TILE
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
        const heel = Math.max(-7, Math.min(7, (vel.current.x / SPEED) * 7))
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
          if (p.kind === 'port' ? dist(pos.current, p) < moorR(p) : inBand(pos.current, p)) { found = p; break }
        }
        setNear(prev => (prev?.id === found?.id ? prev : found))

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

        // WITHIN REACH OF AN ISLE. Compared by id: `isleNear` returns the same
        // object every time, but comparing ids keeps this honest if the table
        // ever becomes derived rather than a literal.
        const isl = isleNear(pos.current.x, pos.current.y)
        setNearIsle(prev => (prev?.id === isl?.id ? prev : isl))
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
              width: `calc(100% + ${DEEP_TILE}px)`,
              height: `calc(100% + ${DEEP_TILE}px)`,
              backgroundImage: `url(${tiles.deep})`, backgroundRepeat: 'repeat',
              transformOrigin: '0 0', willChange: 'transform',
            }} />
            <div ref={paleRef} style={{
              position: 'absolute', left: 0, top: 0,
              width: `calc(100% + ${PALE_TILE}px)`,
              height: `calc(100% + ${PALE_TILE}px)`,
              backgroundImage: `url(${tiles.pale})`, backgroundRepeat: 'repeat',
              transformOrigin: '0 0', willChange: 'transform, opacity',
            }} />
          </>
        )}
      </div>

      {/* THE WORLD. One transformed layer, so the camera is a single write. */}
      <div ref={worldRef} style={{ position: 'absolute', left: '50%', top: '50%', zIndex: Z.world, willChange: 'transform' }}>
        {PLACES.map(p => (
          <PlaceIsland key={p.id} place={p} locked={locked(p)} isNear={near?.id === p.id}
            // CREW WAITING ON THE DOCK. The island says so itself rather than a
            // banner saying it for them: it is a fact about a PLACE, and the
            // chart is where facts about places belong. Nothing moves, nothing
            // interrupts — you notice it the next time you look at the chart,
            // which out here is constantly.
            waiting={p.id === 'trawl_docks' ? trawlsReady : 0} />
        ))}
        {/* THE TOP OF THE CHART. Rocks, not architecture — see reefRocks. The
            same SeaMark every other landmark goes through, so they get the
            submerged base and the shoal for free and cannot drift out of
            style. */}
        {REEF.map((m, i) => <SeaMark key={`reef${i}`} m={m} i={i + 500} />)}

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
        {LANDMARKS.map((m, i) => (
          <SeaMark key={i} m={m} i={i} />
        ))}

        {/* THE SALT ROAD. Other captains, out working. They are drawn from the
            same parts the player's own captain is, so they are house-style by
            construction rather than by anyone remembering to match it. */}
        {[yoon, ...residents, ...traders].map(t => (
          <TraderBoat key={t.key} trader={t}
            // The boats stay — they are part of the sea and the sea is the
            // backdrop. Their NAME PLATES go: you cannot hail anyone with a
            // line in the water, so a label you cannot act on is furniture.
            quiet={!!fishingIn}
            done={dealt.includes(t.key)}
            isNear={nearTrader?.key === t.key}
hullRef={hullRefFor(t.key)} />
        ))}

        {/* The wake, in the world layer so each mark stays on the water where
            the hull left it. Every one of these is positioned by the loop. */}
        {Array.from({ length: WAKE_MARKS }, (_, i) => (
          <div key={i} aria-hidden className="sea-wake"
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
      {!fishingIn && (
        <div
          ref={boxRef}
          className="sea-helm"
          onPointerDown={e => {
            e.stopPropagation()
            try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* fine */ }
            boxHeld.current = { x: e.clientX, y: e.clientY }
            setHelmOn(true)
            vibrate(6)
          }}
          onPointerMove={e => {
            if (!boxHeld.current) return
            e.stopPropagation()
            boxHeld.current = { x: e.clientX, y: e.clientY }
            const v = boxVec(boxHeld.current)
            if (knobRef.current) {
              knobRef.current.style.transform = v
                ? `translate3d(${v.x * v.mag * (HELM_R - 22)}px, ${v.y * v.mag * (HELM_R - 22)}px, 0)`
                : 'translate3d(0,0,0)'
            }
          }}
          onPointerUp={e => {
            e.stopPropagation()
            // Let go and it runs out rather than stopping dead, which reads as
            // the boat hitting something.
            const v = vel.current
            const sp = Math.hypot(v.x, v.y)
            target.current = sp > 1
              ? { x: pos.current.x + (v.x / sp) * TAP_HOP * 0.5, y: pos.current.y + (v.y / sp) * TAP_HOP * 0.5 }
              : { ...pos.current }
            boxHeld.current = null
            setHelmOn(false)
            if (knobRef.current) knobRef.current.style.transform = 'translate3d(0,0,0)'
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* fine */ }
          }}
          onPointerCancel={() => {
            boxHeld.current = null
            setHelmOn(false)
            if (knobRef.current) knobRef.current.style.transform = 'translate3d(0,0,0)'
          }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', zIndex: Z.helm,
            left: '50%', bottom: 92, transform: 'translateX(-50%)',
            width: HELM_R * 2, height: HELM_R * 2, borderRadius: '50%',
            touchAction: 'none',
            background: helmOn
              ? 'radial-gradient(circle at 50% 45%, rgba(12,26,38,0.72), rgba(6,14,22,0.46))'
              : 'radial-gradient(circle at 50% 45%, rgba(10,22,32,0.48), rgba(6,14,22,0.28))',
            border: `1px solid rgba(180,214,232,${helmOn ? 0.46 : 0.22})`,
            boxShadow: helmOn ? '0 0 22px rgba(120,180,210,0.2)' : 'none',
            transition: 'background 160ms ease-out, border-color 160ms ease-out, box-shadow 160ms ease-out',
          }}>
          <div ref={knobRef} aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 42, height: 42, marginLeft: -21, marginTop: -21,
            borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle at 42% 36%, rgba(214,232,240,0.92), rgba(150,186,206,0.6))',
            border: '1px solid rgba(226,242,250,0.6)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
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
      }}>
        <div className="sea-ripple" />
        <div className="sea-ripple" style={{ animationDelay: '1.5s' }} />
        <div className="sea-ripple" style={{ animationDelay: '3s' }} />
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
        <Skipper characterColor={characterColor} boatId={boatId} hatId={hatId}
          gear={{
            ...gear,
            // The rod in your hands is the rod you are holding.
            rodSlug: rodNow?.slug ?? gear.rodSlug,
            rod: rodNow?.image ?? gear.rod,
            rodGlow: rodNow?.glow ?? gear.rodGlow,
            rodColor: rodNow?.color ?? gear.rodColor,
          }}
          frame={frame} />
      </div>

      {/* The prompt steps aside while the rod is out — the cast button is the
          only thing that should be asking for a thumb down there. */}
      {/* HAILING SOMEONE OUTRANKS THE ZONE PROMPT. You have pulled alongside a
          person; what water you happen to be floating in can wait. */}
      {!fishingIn && nearTrader && !hailing && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 22, zIndex: Z.action,
          display: 'flex', justifyContent: 'center', padding: '0 1rem',
        }}>
          <button
            onClick={e => { e.stopPropagation(); vibrate(14); setHailing(nearTrader) }}
            className="font-cinzel font-700"
            style={{
              padding: '0.72rem 1.5rem', borderRadius: 999, fontSize: '1.128rem',
              color: '#f6e6c6', background: 'rgba(24,18,10,0.9)',
              border: '1px solid rgba(255,206,138,0.5)',
              boxShadow: '0 6px 22px rgba(0,0,0,0.5)', cursor: 'pointer',
            }}>
            {dealt.includes(nearTrader.key)
              ? `Speak to ${nearTrader.name}`
              : `Hail ${nearTrader.name}`}
          </button>
        </div>
      )}

      {/* GOING ASHORE BEATS FISHING. You are inside a band whenever you are
          on an isle, so without this the only offer on screen would be "Fish
          The Deep" while you are standing on a rock with a chest on it. */}
      {!fishingIn && !nearTrader && nearIsle && (
        <div style={{
          // THE SAME ROW AS "FISH THE DEEP" — bottom 22, which is what `Prompt`
          // and the trader hail both use. This was lifted to 5.4rem off the
          // bottom, which on a phone is exactly where the joystick lives, so
          // the one button that opens a chest sat on top of the control you
          // steer with. Every offer on this chart belongs on one line.
          position: 'absolute', left: 0, right: 0, bottom: 22,
          zIndex: Z.action, display: 'flex', justifyContent: 'center', padding: '0 1rem',
        }}>
          <button
            onClick={e => { e.stopPropagation(); land(nearIsle) }}
            disabled={landing}
            className="font-cinzel font-700"
            style={{
              padding: '0.72rem 1.5rem', borderRadius: 999, fontSize: '1.128rem',
              color: '#f6e6c6', background: 'rgba(24,18,10,0.9)',
              border: '1px solid rgba(255,206,138,0.5)',
              boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
              cursor: landing ? 'default' : 'pointer', opacity: landing ? 0.6 : 1,
            }}>
            {found.has(nearIsle.id) ? `Look again at ${nearIsle.name}` : `Go ashore at ${nearIsle.name}`}
          </button>
        </div>
      )}

      {!fishingIn && !nearTrader && !nearIsle && (
        <Prompt
          place={near}
          locked={near ? locked(near) : false}
          level={level}
          // A water does not navigate. Pressing "Fish The Shallows" puts the rod
          // in your hands where you are floating; only a port is a door.
          onEnter={p => {
            if (p.kind === 'water') {
              // ALL STOP. A tap is a heading now, so without this you would cast
              // at a full six knots and sail out of the zone you had just chosen
              // to fish, and be several hundred pixels away by the time the
              // dial came up.
              target.current = { ...pos.current }
              setFishingIn(p)
              vibrate(14)
            } else enter(p)
          }}
        />
      )}
      {/* AND THE WATER'S NAME IS ALREADY ON SCREEN while the rod is out — the
          stow line at the bottom of the fishing UI reads "Stow rod · Open
          Waters". Two of them, one of them enormous, is the same fact twice. */}
      <EdgeOfChart at={atEdge} />

      <AshorePanel state={landed} onClose={() => setLanded(null)} />

      <WaterBanner
        place={!fishingIn && near && near.kind === 'water' ? near : null}
        locked={near ? locked(near) : false}
        lowered={false} />

      {/* THE CROSSING ITSELF. The small banner up top is a readout — it says
          where you are, quietly, for as long as you are there. This is the
          moment you arrive, and it is gone before you have finished reading it. */}
      <ZoneCrossing place={near && near.kind === 'water' ? near : null} locked={near ? locked(near) : false} />

      {/* THE LIGHT lives on the level bar's row while fishing — see
          FishingHere — and only sits on its own up here when the rod is stowed,
          because there is no bar to share a row with. */}
      {!fishingIn && (
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
          position: 'absolute', top: 18, left: 12, zIndex: Z.hud, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: '50%',
          background: 'rgba(6,12,18,0.7)',
          border: '1px solid rgba(180,214,232,0.22)',
        }}>
          <PhaseGlyph phase={phase} />
        </div>
      )}

      {/* THE CHART BUTTON, beside the light and on the same row.
          A real button, so the map's own `closest('button')` guard exempts it
          from steering on both the pointer and the click path without needing
          data-no-steer as well. */}
      {!fishingIn && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); vibrate(10); setMapOpen(true) }}
          aria-label="Open the chart"
          title="The chart"
          style={{
            position: 'absolute', top: 18, left: 48, zIndex: Z.hud,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: '50%', padding: 0,
            background: 'rgba(6,12,18,0.7)',
            border: '1px solid rgba(180,214,232,0.22)',
            color: 'rgba(214,232,240,0.85)', cursor: 'pointer',
          }}>
          {/* A folded chart. Not a compass — there is already a compass on this
              screen and it means something else. */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
        <Compass pos={pos} zoom={zoomRef} wrapRef={wrapRef} locked={locked} frozen={dialUp}
          waitingAt={id => (id === 'trawl_docks' ? trawlsReady : 0)} />
      )}

      <MainlandAshore open={ashore} onClose={() => setAshore(false)} />

      {/* ── THE GATE ──────────────────────────────────────────────────────
          It meets you UNDER the arch rather than at a button on a menu, which
          is the whole reason the wall became cliffs: leaving the fishing
          grounds should be somewhere you sail to and a thing you feel yourself
          doing. Backing out puts you back on the water facing south — no
          penalty, nothing spent, and the arch is still there. */}
      <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <PopupShell open={atGate} onClose={() => { gateRef.current = false; setAtGate(false) }}>
          <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              margin: 'auto', width: '100%', maxWidth: 420,
              // A SOLID base. This sits over painted water and the one moment it
              // has something to ask, it has to be readable.
              background: 'linear-gradient(180deg, #16202b 0%, #0b1119 100%)',
              border: '1px solid rgba(150,196,222,0.34)',
              borderRadius: 20, padding: '1.25rem 1.15rem 1.2rem',
              boxShadow: '0 22px 64px rgba(0,0,0,0.65)',
            }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.18em', color: 'rgba(150,196,222,0.75)',
            }}>Under the arch</p>
            <h2 className="font-cinzel font-700" style={{
              fontSize: '1.45rem', color: '#f2ead8', marginTop: 3, lineHeight: 1.12,
            }}>Sail through to Expeditions?</h2>
            <p className="font-karla" style={{
              fontSize: '0.88rem', color: 'rgba(198,218,232,0.72)', marginTop: 8, lineHeight: 1.55,
            }}>
              Past the cliffs the water belongs to the voyages and the raids, and
              you do not fish it. Your boat and everything in the hold stay
              exactly where you left them; the arch is open whenever you want to
              come back.
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button"
                onClick={() => {
                  // Back out: nudge the bow south so the prompt does not open
                  // again on the very next frame while you are still drifting
                  // north under the arch.
                  gateRef.current = false
                  setAtGate(false)
                  pos.current.y = NORTH_WALL + 120
                  vel.current.y = Math.abs(vel.current.y) * 0.4
                  target.current = { x: pos.current.x, y: NORTH_WALL + 900 }
                }}
                className="font-karla font-700"
                style={{
                  flex: 1, padding: '0.8rem', borderRadius: 12, fontSize: '0.94rem',
                  color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
                }}>
                Come about
              </button>
              <button type="button"
                onClick={() => { vibrate([18, 40, 24]); enter(PLACES.find(p => p.id === 'expeditions')!) }}
                className="font-cinzel font-700"
                style={{
                  flex: 1.3, padding: '0.8rem', borderRadius: 12, fontSize: '0.94rem',
                  color: '#f2ead8', background: 'rgba(150,196,222,0.18)',
                  border: '1px solid rgba(150,196,222,0.5)', cursor: 'pointer',
                }}>
                Sail through
              </button>
            </div>
          </motion.div>
        </PopupShell>
      </div>

      {/* THE CHART. `fogVersion` is in the key path so the canvas redraws when
          a cell flips — the bitfield itself is a ref and mutating it is
          invisible to React by design. */}
      <Minimap
        key={fogVersion}
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        fog={fogRef.current}
        at={pos}
        seaAt={p => seaAt(p, 0).solid}
        found={found}
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
          zoneName={fishingIn.name}
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
          onClose={() => { setFishingIn(null); setFrame('rest') }}
        />
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
          <img key={f} src={src(f)} alt="" draggable={false}
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
        <img key={f} src={char[f]} alt="" draggable={false} style={{
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
      <img src={char.rest} alt="" draggable={false}
        style={{ width: '100%', display: 'block' }} />
      {hat && hp && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute', top: `${hp.top}%`, left: `${hp.left}%`,
          width: `${hp.width}%`, transform: `rotate(${hp.rotate}deg)`,
        }} />
      )}
      {boat && bp && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={boat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
          width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
        }} />
      )}
      {look.hook && (
        /* THE HOOK, on the end of the rod. A rod with nothing tied to it is a
           stick. Same coordinates the player's hook uses, and the rest frame is
           the one where it is out of the water. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={look.hook} alt="" draggable={false} style={{
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
        <img src={`/${look.rodSlug}_rest.png`} alt="" draggable={false} style={{
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
        transform: `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.78)`,
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
            background: 'rgba(24,18,10,0.92)',
            border: '1px solid rgba(255,206,138,0.85)',
            boxShadow: '0 0 16px rgba(255,196,110,0.55)',
          }}>
            <span className="font-cinzel font-700" style={{
              fontSize: '1.032rem', lineHeight: 1, color: '#ffd986', marginTop: -1,
            }}>!</span>
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
        border: `1px solid ${done ? 'rgba(150,166,178,0.3)' : 'rgba(255,206,138,0.34)'}`,
        opacity: isNear ? 1 : 0.8, transition: 'opacity 220ms ease-out',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.888rem', color: done ? 'rgba(180,192,200,0.6)' : '#e6eef4',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}>{trader.name}</p>
        <p className="font-karla font-600" style={{
          fontSize: '0.696rem', marginTop: 1,
          color: done ? 'rgba(160,176,186,0.55)' : 'rgba(255,214,150,0.85)',
          textShadow: '0 1px 9px rgba(0,0,0,0.9)',
        }}>{done ? 'Traded today' : KIND_LABEL[trader.kind]}</p>
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
const SUBMERGE: Record<string, { line: number; keep: number }> = {
  // A float on a chain, riding low.
  buoy:     { line: 66, keep: 0.30 },
  // Aground and going nowhere. Half of it is under.
  wreck:    { line: 62, keep: 0.26 },
  // On legs, in deep water — you see the legs go down and lose them.
  rig:      { line: 80, keep: 0.22 },
  // A rib cage in the shallows, part buried.
  bones:    { line: 74, keep: 0.24 },
  // Carved stone, standing in it.
  monolith: { line: 78, keep: 0.20 },
  // A rock cluster breaking the surface. It used to be the one thing out here
  // that did not submerge, on the grounds that it was land with a beach — and
  // the pale shoal that came with that is what made it look like it was hovering.
  islet:    { line: 76, keep: 0.24 },

  // ── THE REEF ALONG THE TOP ───────────────────────────────────────────
  //
  // `line` is where the water crosses the SPRITE, as a percentage of its own
  // height — so it cannot be one shared number. Each of these is painted with
  // a dark wet band at its foot, and the waterline is set just above where
  // that band starts, which is what makes the paint and the mask agree.
  //
  // How much sits under is a property of the SHAPE, not the size. A flat
  // wave-cut shelf is mostly awash whatever scale it is drawn at; a headland
  // is a headland. Anything that goes deeper also keeps a little more of
  // itself visible under the surface, or it just vanishes.
  'rock-spire': { line: 82, keep: 0.20 },    // stands tall, barely in
  'rock-dome': { line: 78, keep: 0.22 },     // rounded, settled low
  'rock-split': { line: 80, keep: 0.20 },
  'rock-slab': { line: 68, keep: 0.28 },     // a shelf. mostly awash
  'rock-crag': { line: 80, keep: 0.21 },
  'rock-cobbles': { line: 74, keep: 0.24 },  // small and low in the water
  // The two headlands. Least submerged on the chart: they are the biggest
  // rock out there and they should read as founded on the bottom, not
  // floating at the mouth of the gate.
  'rock-gate-w': { line: 86, keep: 0.18 },
  'rock-gate-e': { line: 86, keep: 0.18 },
}

/** Which art file this is, from its path — `/sea/wreck.png` -> `wreck`. */
function markKind(art: string): string {
  return art.slice(art.lastIndexOf('/') + 1).replace('.png', '')
}

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
const POS_KEY = 'sea:pos'
const POS_TTL = 30 * 60 * 1000

function rememberPos(p: { x: number; y: number }) {
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify({ x: p.x, y: p.y, t: Date.now() }))
  } catch { /* private mode. The server copy still works, just less precisely. */ }
}

function recallPos(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { x: number; y: number; t: number }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    if (!(Date.now() - p.t < POS_TTL)) return null
    return { x: p.x, y: p.y }
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
          NOTHING IS DRAWN UNDER IT. FIFTH TIME OF ASKING.

          A dark ellipse, then a pale one, then a pale one again dressed up as
          foam and called a "wash". Every version reads the same way, because
          the objection was never the colour: a discrete shape sitting beneath
          another object says "this thing is ABOVE that thing", and it says it
          whatever tint you give it. Foam that you have to argue is foam is a
          shadow.

          The fade IS the effect. The sprite's own base dissolves into the water
          (see SUBMERGE below) and that is the whole of it — no ellipse, no ring,
          no disturbance. If a landmark ever reads as floating again, the answer
          is to take MORE of it under, not to put something back beneath it.

          The fifth time was an EXCEPTION I wrote myself. Islets kept a pale
          ellipse under them, and the comment right here argued it was fine
          because an islet is land and what land gets is a shoal, which is a
          real thing that is genuinely there. All true, and all beside the
          point: on screen it was a pale ellipse under an object, which is the
          exact shape that says "this is floating above that", and it read that
          way whatever it was called. Islets submerge like everything else now.

          There is no version of this that works. Not a darker one, not a paler
          one, not one with a good reason. If a landmark ever reads as floating
          again the answer is to take MORE of it under, never to put something
          back beneath it. */}
      {/* TWO WRAPPERS, because they carry different transforms. The outer one
          stands the landmark up off the plane; the inner one is free to sway
          without clobbering that. One element trying to do both means the
          animation overwrites the counter-squash and it lies flat the moment it
          starts moving. */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: m.size,
        transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
        transformOrigin: 'bottom center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.art} alt="" draggable={false} loading="lazy"
          className={m.sway ? `mark-${m.sway}` : undefined}
          style={{
            width: '100%', maxWidth: 'none', display: 'block',
            // THE SUBMERGED PART. A mask on the sprite itself, so the thing goes
            // INTO the water rather than sitting on it: solid down to the
            // waterline, then a step down to a fraction of its opacity — what
            // you can still make out through the surface — and out to nothing.
            //
            // The step is what sells it. A smooth fade from 1 to 0 reads as the
            // object dissolving; a step to a low plateau reads as a change of
            // MEDIUM, which is what a waterline is.
            ...(sub ? {
              maskImage:
                `linear-gradient(to bottom, #000 ${sub.line}%, ` +
                `rgba(0,0,0,${sub.keep}) ${sub.line + 3}%, ` +
                `rgba(0,0,0,${sub.keep * 0.55}) ${(sub.line + 100) / 2}%, transparent 100%)`,
              WebkitMaskImage:
                `linear-gradient(to bottom, #000 ${sub.line}%, ` +
                `rgba(0,0,0,${sub.keep}) ${sub.line + 3}%, ` +
                `rgba(0,0,0,${sub.keep * 0.55}) ${(sub.line + 100) / 2}%, transparent 100%)`,
            } : {}),
            // Offset so neighbours never move in step, which is what makes a
            // row of buoys read as machinery.
            animationDelay: m.sway ? `${(i * 0.77) % 3}s` : undefined,
          }} />
      </div>
    </div>
  )
})

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
const Landmass = memo(function Landmass({ id, locked = false }: {
  id: string
  /** Greys the land out, for water a captain has not levelled into. */
  locked?: boolean
}) {
  /**
   * THE COASTLINE.
   *
   * Seeded off the id, so it is stable across renders and different for every
   * island. It used to be 26 points and three gentle sine terms, which makes a
   * potato: every island the same smooth oval with the same small dents, at the
   * same scale, all the way round. Real coasts are not one scale of detail —
   * they have headlands, and bays cut into those, and rocks on the edge of
   * those, and the amplitude is not the same the whole way round either.
   *
   * So: five octaves, each half the amplitude and roughly double the frequency
   * of the last, plus a slow LOBE term that pulls one or two whole sides of the
   * island out into headlands. The per-island amplitude varies too, so one is
   * craggy and another is round rather than all of them being equally lumpy.
   *
   * TUNED AGAINST MEASUREMENTS, not by eye. The first pass at five octaves ran
   * to a 7.5% radial jump between adjacent points and pinched one island down
   * to a 17% waist — a saw tooth and a near-severed spit. Searched instead for
   * a set where, across all four islands: the radius stays between 30% and 63%
   * (no pinch, no bulge past the box), the biggest step between neighbours is
   * 2.4% (a rocky notch over a 12px arc, not noise), and all four outlines are
   * still distinct.
   *
   * 160 points, because at 26 the straight segments between them were visible
   * on the big islands and read as a polygon — which is precisely the thing
   * that makes a shape look drawn rather than surveyed.
   */
  const clip = useMemo(() => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    const rnd = (n: number) => (((h >>> (n * 3)) % 1000) / 1000)
    // How rugged THIS island is. 0.72 is a soft round one, 1.35 is all teeth.
    const rug = 0.70 + rnd(1) * 0.35
    const pts: string[] = []
    const N = 160
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N
      const wobble =
        // The lobes: one or two big pulls, which is what gives an island a
        // shape you could describe rather than a diameter.
        0.095 * Math.sin(a * (1 + Math.floor(rnd(2) * 2)) + rnd(3) * 6.28) +
        0.055 * Math.sin(a * 3 + rnd(4) * 6.28) +
        0.028 * Math.cos(a * 5 - rnd(5) * 6.28) +
        0.012 * Math.sin(a * 9 + rnd(6) * 6.28) +
        0.004 * Math.cos(a * 17 + rnd(7) * 6.28)
      const r = 46 + wobble * rug * 100
      pts.push(`${(50 + Math.cos(a) * r).toFixed(2)}% ${(50 + Math.sin(a) * r).toFixed(2)}%`)
    }
    return `polygon(${pts.join(', ')})`
  }, [id])

  /**
   * TREE CLUMPS. Placed once per island off the same seed.
   *
   * Kept well inside the coast (radius under 24% of the box) so a clump never
   * sits half in the water, and varied in size and darkness so the canopy reads
   * as a wood rather than as a row of dots.
   */
  const canopy = useMemo(() => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 37 + id.charCodeAt(i)) >>> 0
    const out: { x: number; y: number; r: number; o: number }[] = []
    let st = h || 1
    const nx = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 0x100000000 }
    for (let i = 0; i < 9; i++) {
      const a = nx() * Math.PI * 2
      const rad = 4 + nx() * 19
      out.push({
        x: 50 + Math.cos(a) * rad,
        y: 50 + Math.sin(a) * rad * 0.9,
        r: 7 + nx() * 11,
        o: 0.20 + nx() * 0.26,
      })
    }
    return out
  }, [id])

  return (
    <>
      {/* ── THE FOOTPRINT, flat on the water ──────────────────────
          Shoals and a wet shore ring, which live INSIDE the squashed world
          layer and so come out as ellipses. This is the island's shadow on
          the sea and the only part of it that is genuinely lying down. */}
      {/* THE SHOAL — shallow water standing off the coast, and the reason
          an island reads as sitting IN the sea rather than on top of it.
          Widened and softened: at inset 2% with a 6px blur it was a thin
          halo, which is a glow. Shallow water around a real island is a
          broad pale shelf that fades out with no edge anywhere. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '-6%', clipPath: clip,
        background: 'rgba(140,190,206,0.13)', filter: 'blur(16px)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: '1%', clipPath: clip,
        background: 'rgba(168,204,216,0.22)', filter: 'blur(8px)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: '7%', clipPath: clip,
        background: 'rgba(200,222,230,0.30)', filter: 'blur(2px)',
      }} />
      {/* ── SURF ────────────────────────────────────────────────────
          A soft white collar hugging the coast, just outside the land and
          just inside the shoal. Water hitting a shore is the single most
          recognisable thing about a shore — without it the land meets the
          sea on a hard vector edge, which is most of why these read as
          shapes rather than places.

          Two rings so it has depth: a wide diffuse one for spray and a
          tight bright one for the break itself. Both breathe, slowly and
          out of phase, so the coast is never quite still. */}
      <div aria-hidden className="sea-surf" style={{
        position: 'absolute', inset: '9%', clipPath: clip,
        background: 'rgba(226,244,250,0.30)', filter: 'blur(7px)',
      }} />
      <div aria-hidden className="sea-surf sea-surf-2" style={{
        position: 'absolute', inset: '11.4%', clipPath: clip,
        background: 'rgba(240,250,255,0.55)', filter: 'blur(2.5px)',
      }} />

      {/* Contact shadow, thrown away from the light. Nothing says "this
          object is ABOVE the water" faster than a shadow that is not
          directly under it. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '11%', clipPath: clip,
        transform: `translate(${ISLAND_LIFT * 0.34}px, ${ISLAND_LIFT * 0.5}px)`,
        background: 'rgba(2,10,18,0.42)', filter: 'blur(9px)',
      }} />

      {/* ── THE CLIFF, the extrusion ────────────────────────────────
          The same coastline again, dropped by the island's height and
          filled with wet rock. Drawn UNDER the top face, so all you ever
          see of it is the band along the near edge — which is exactly what
          you see of a real island's side from a low angle, and is the whole
          trick of an extrusion. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '13%', clipPath: clip,
        transform: `translateY(${ISLAND_LIFT / GROUND}px)`,
        background: 'linear-gradient(180deg, #3b3226 0%, #2a2419 55%, #191509 100%)',
        filter: locked ? 'grayscale(0.9) brightness(0.5)' : 'none',
      }} />

      {/* ── THE TOP FACE, lifted clear of the water ─────────────────
          Counter-squashed so the land itself is NOT foreshortened — an
          island is a solid standing on the plane, not a decal printed on
          it — then raised by the same lift the cliff was dropped by. */}
      <div style={{
        position: 'absolute', inset: '13%', clipPath: clip, overflow: 'hidden',
        transform: `translateY(${-ISLAND_LIFT / GROUND}px)`,
        filter: locked ? 'grayscale(0.9) brightness(0.55)' : 'brightness(0.94) saturate(0.92)',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.55)',
      }}>
        {/* ── TERRAIN, IN BANDS THAT FOLLOW THE COAST ───────────────
            This was one flat radial gradient of brown. A single colour with
            a soft vignette is a shape, not a place: no beach, nothing
            growing, nothing to say where the water stops.

            Each band is the SAME coastline polygon on a smaller box, so its
            clip scales with it and every ring parallels the shore instead of
            being a circle sitting inside an irregular outline. Outside in,
            the way you would actually walk it: wet sand, dry sand, scrub,
            grass, and a lighter crown where the ground rises.

            Cheap, too — five absolutely-positioned divs per island, static
            after mount, no filters on the bands themselves. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(165deg, #b9a077 0%, #9c8259 55%, #7d6743 100%)',
        }} />
        {/* WET SAND — darker where the tide has just been. A beach with one
            tone is a carpet; the damp strip at the edge is what makes it
            read as sand at all. */}
        <div aria-hidden style={{
          position: 'absolute', inset: '1.5%', clipPath: clip,
          background: 'linear-gradient(165deg, #cbb590 0%, #b89c72 100%)',
        }} />
        <div aria-hidden style={{
          position: 'absolute', inset: '5%', clipPath: clip,
          background: 'linear-gradient(165deg, #d8c49f 0%, #c2a97e 100%)',
        }} />
        {/* SCRUB — the dry stuff that grows above the tideline. */}
        <div aria-hidden style={{
          position: 'absolute', inset: '9.5%', clipPath: clip,
          background: 'linear-gradient(165deg, #9aa269 0%, #7d8850 100%)',
        }} />
        {/* GRASS. */}
        <div aria-hidden style={{
          position: 'absolute', inset: '15%', clipPath: clip,
          background: 'linear-gradient(165deg, #6f8a4e 0%, #55703c 62%, #466032 100%)',
        }} />
        {/* THE CROWN — higher ground, catching more light. Offset toward the
            same corner every other highlight on this chart comes from, so
            the whole scene agrees about where the sun is. */}
        <div aria-hidden style={{
          position: 'absolute', inset: '26%', clipPath: clip,
          transform: 'translate(-3%, -4%)',
          background: 'radial-gradient(ellipse 120% 120% at 40% 26%, rgba(190,206,140,0.55) 0%, rgba(150,176,105,0.22) 48%, transparent 78%)',
        }} />

        {/* ── WOODS ──────────────────────────────────────────────────
            Soft dark clumps, seeded per island. Not trees — at this size a
            tree is two pixels — but the massed shadow a stand of them
            throws, which is what you actually see of a wood from off shore. */}
        {canopy.map((c, i) => (
          <div key={i} aria-hidden style={{
            position: 'absolute',
            left: `${c.x}%`, top: `${c.y}%`,
            width: `${c.r}%`, height: `${c.r * 0.82}%`,
            marginLeft: `${-c.r / 2}%`, marginTop: `${-c.r * 0.41}%`,
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 42% 34%, rgba(74,102,52,${c.o + 0.18}) 0%, rgba(46,68,34,${c.o}) 55%, rgba(40,58,30,0) 78%)`,
          }} />
        ))}

        {/* A rim of light along the top edge, where the sky hits the land
            and the cliff below it does not. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(240,248,250,0.34) 0%, rgba(240,248,250,0) 20%)',
        }} />
      </div>
    </>
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
      <Landmass id={isle.id} />

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
        <img src={art} alt="" draggable={false} loading="lazy" style={{
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
                <img src="/sea/isle-chest-open.png" alt="" draggable={false} style={{
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
 *  coastline clip, drift blobs, cliff, jetty and all — on each of those ticks
 *  for a result that had not changed. */
const PlaceIsland = memo(function PlaceIsland({ place, locked, isNear, waiting = 0 }: {
  place: Place; locked: boolean; isNear: boolean
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
          <Landmass id={place.id} locked={locked} />

          {/* ── WHAT IS BUILT HERE ──────────────────────────────────────
              Counter-squashed and anchored at the BOTTOM, so each building
              stands up out of the plane and grows from where it meets the
              ground rather than from its middle. Ordered back to front in the
              chart, so the ones further down the island overlap the ones
              behind them the way a hillside town does. */}
          {place.buildings?.map((b, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
              width: d * b.scale,
              transform: `translate(-50%, -100%) scaleY(${1 / GROUND})`,
              transformOrigin: 'bottom center',
              filter: locked
                ? 'grayscale(0.9) brightness(0.5)'
                : 'drop-shadow(0 6px 10px rgba(0,0,0,0.55))',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.art} alt="" draggable={false}
                style={{ width: '100%', display: 'block' }} />
            </div>
          ))}

          {/* ── THE JETTY, standing on the plane ────────────────────────
              Counter-squashed like everything else that has height, and
              anchored at its landward end so it runs OUT from the shore
              rather than floating beside it. */}
          <div aria-hidden style={{
            position: 'absolute', left: '50%', top: '78%',
            transform: `translateY(${-ISLAND_LIFT / GROUND}px) scaleY(${1 / GROUND})`,
            transformOrigin: 'left center',
            width: place.r * 0.62, height: 11,
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              transform: 'translateX(-6%) rotate(9deg)',
              background: 'linear-gradient(180deg, #6d5636, #3d2f1d)',
              borderRadius: 2,
              boxShadow: '0 3px 10px rgba(0,0,0,0.55)',
              opacity: locked ? 0.4 : 1,
            }} />
            {[0.34, 0.58, 0.82].map(f => (
              <div key={f} style={{
                position: 'absolute', left: `${f * 100}%`, top: 6,
                width: 5, height: 15, background: '#2e2416', borderRadius: 1,
                transform: 'rotate(9deg)', opacity: locked ? 0.4 : 0.9,
              }} />
            ))}
          </div>

          {/* A lantern on the end of the jetty. The thing you steer toward at
              distance, and the only warm colour on the whole chart. It sits
              highest of anything here, so it gets the most lift. */}
          <div aria-hidden style={{
            position: 'absolute', left: `calc(50% + ${place.r * 0.56}px)`, top: '72%',
            transform: `translateY(${-(ISLAND_LIFT + 10) / GROUND}px)`,
            width: 13, height: 13, borderRadius: '50%',
            background: locked ? 'rgba(150,160,170,0.5)' : '#ffd986',
            boxShadow: locked ? 'none' : `0 0 ${isNear ? 26 : 15}px 6px rgba(255,196,110,${isNear ? 0.5 : 0.3})`,
            transition: 'box-shadow 300ms ease-out',
          }} />
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
              fontSize: '0.84rem', letterSpacing: '0.1em', marginBottom: 3,
              color: '#f0c040', textShadow: '0 1px 10px rgba(0,0,0,0.95)',
            }}>
              {waiting} crew back
            </p>
          )}
          <p className="font-cinzel font-700" style={{
            fontSize: '1.152rem', color: locked ? 'rgba(180,192,200,0.55)' : '#e6eef4',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}>{place.name}</p>
          <p className="font-karla font-600" style={{
            fontSize: '0.84rem', marginTop: 1,
            color: locked ? 'rgba(206,152,152,0.8)' : 'rgba(184,204,218,0.72)',
            textShadow: '0 1px 9px rgba(0,0,0,0.9)',
          }}>{locked ? `Fishing ${place.minLevel}` : place.blurb}</p>
        </div>
      )}
    </div>
  )
})

/** The dock prompt. Says what to do, or why you cannot. */
function Prompt({ place, locked, level, onEnter }: {
  place: Place | null; locked: boolean; level: number
  onEnter: (p: Place) => void
}) {
  if (!place) return null
  const verb = place.kind === 'port' ? 'Go ashore at' : 'Fish'
  return (
    <div key={place.id}
      style={{
        // NOTHING COVERS THIS. It had no z-index, which is `auto`, which
        // paints below the world layer — so the one button that gets you into
        // a zone was hidden behind any island or landmark that happened to be
        // in the bottom of the screen.
        position: 'absolute', left: 0, right: 0, bottom: 22, zIndex: Z.action,
        display: 'flex', justifyContent: 'center', padding: '0 1rem',
      }}>
      <button
        onClick={e => { e.stopPropagation(); if (!locked) onEnter(place) }}
        disabled={locked}
        className="font-cinzel font-700"
        style={{
          padding: '0.72rem 1.5rem', borderRadius: 999, fontSize: '1.128rem',
          color: locked ? 'rgba(210,170,170,0.9)' : '#f2ead8',
          background: locked ? 'rgba(12,10,14,0.82)' : 'rgba(10,20,28,0.86)',
          border: `1px solid ${locked ? 'rgba(200,130,130,0.4)' : 'rgba(180,214,232,0.45)'}`,
          boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
          cursor: locked ? 'default' : 'pointer',
        }}>
        {locked
          ? `${place.name} needs Fishing ${place.minLevel} — you are ${level}`
          : `${verb} ${place.name}`}
      </button>
    </div>
  )
}

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
 * ENTERING THE ABYSS.
 *
 * Crossing from one band into the next used to be a small word changing at the
 * top of the screen, which is the right amount of noise for "where am I" and
 * completely the wrong amount for "you have arrived somewhere new". The bands
 * are the game's whole progression — deeper water is better fish and worse
 * odds — and the moment you enter one should land.
 *
 * Deliberately NOT a modal, a pause or a card. It is one line of type across
 * the middle of the chart that swells, holds for a beat and dissolves, over a
 * boat that never stops sailing. You can steer straight through it and it costs
 * you nothing; that is the difference between a flourish and an interruption.
 *
 * `pointer-events: none` on the root, because it sits over the water and the
 * helm has to keep working underneath it — the house rule for anything
 * non-blocking that covers the screen.
 */
function ZoneCrossing({ place, locked }: { place: Place | null; locked: boolean }) {
  const [crossing, setCrossing] = useState<Place | null>(null)
  // OPENING THE PAGE SOMEWHERE IS NOT ARRIVING THERE. The boat starts where you
  // left it, so a returning player would otherwise be greeted with a banner for
  // water they have been fishing all afternoon.
  //
  // Guarded on a TIME WINDOW rather than on "is this the first change". The
  // first change is not reliably the one that means "you started here":
  // proximity resolves on a 120ms tick, so the effect first runs with no place
  // at all and the real answer lands a tick later — and if you happen to start
  // in open water, the genuine first crossing IS the first change and must not
  // be swallowed. Anything past the window is somewhere you sailed to.
  const seen = useRef<string | null>(null)
  const mounted = useRef(0)
  useEffect(() => { mounted.current = performance.now() }, [])

  useEffect(() => {
    const id = place?.id ?? null
    if (id === seen.current) return
    seen.current = id
    if (!place) return
    if (performance.now() - mounted.current < 900) return
    setCrossing(place)
    const t = setTimeout(() => setCrossing(null), 2200)
    return () => clearTimeout(t)
  }, [place])

  return (
    <AnimatePresence>
      {crossing && (
        <motion.div key={crossing.id} aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.75, ease: 'easeOut' } }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: 0, zIndex: Z.crossing,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            // NEVER eats a tap. The boat sails on underneath this.
            pointerEvents: 'none',
          }}>
          <motion.p className="font-karla font-700 uppercase"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.72, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontSize: '0.744rem', letterSpacing: '0.42em', marginBottom: 10,
              color: locked ? 'rgba(226,180,180,0.9)' : 'rgba(214,232,240,0.85)',
              textShadow: '0 2px 16px rgba(0,0,0,0.95)',
            }}>
            Entering
          </motion.p>

          {/* The name swells rather than sliding: you are moving into it, not
              past it. Letter-spacing opens with the scale so it reads as the
              water widening rather than as type being zoomed. */}
          <motion.p className="font-cinzel font-700"
            initial={{ opacity: 0, scale: 0.86, letterSpacing: '0.02em' }}
            animate={{ opacity: 1, scale: 1, letterSpacing: '0.1em' }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontSize: 'clamp(2rem, 9.5vw, 3.4rem)', textAlign: 'center',
              lineHeight: 1.05, padding: '0 1.5rem',
              color: locked ? '#e8b4b4' : '#f2ead8',
              textShadow: '0 3px 26px rgba(0,0,0,0.98), 0 0 44px rgba(0,0,0,0.75)',
            }}>
            {crossing.name}
          </motion.p>

          {/* A rule that draws itself open under the name, the way a horizon
              does when you come over a swell. */}
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 190, opacity: 0.55 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: 1, marginTop: 13, maxWidth: '60%',
              background: locked
                ? 'linear-gradient(90deg, transparent, rgba(226,180,180,0.95), transparent)'
                : 'linear-gradient(90deg, transparent, rgba(226,240,248,0.95), transparent)',
            }} />

          <motion.p className="font-karla font-600"
            initial={{ opacity: 0 }} animate={{ opacity: 0.62 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{
              fontSize: '0.888rem', marginTop: 11, textAlign: 'center', padding: '0 2rem',
              color: locked ? 'rgba(226,180,180,0.9)' : 'rgba(200,222,236,0.9)',
              textShadow: '0 2px 14px rgba(0,0,0,0.95)',
            }}>
            {locked ? `Fishing ${crossing.minLevel} to work this water` : crossing.blurb}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * THE SKY, AS ONE SHAPE.
 *
 * Four glyphs, warm for light and cold for dark, so the corner reads without
 * being read. Dusk and dawn are the same half-disc on a horizon line mirrored
 * about the vertical — one sinking, one climbing — which is the only pair that
 * genuinely needs telling apart and the only pair a colour alone could not.
 */
function PhaseGlyph({ phase }: { phase: SeaPhase }) {
  const g = PHASE_GLYPH[phase]
  const warm = g === 'sun' || g === 'setting' || g === 'rising'
  const c = warm ? '#ffd986' : '#9fb6ff'
  const glow = warm ? 'rgba(255,217,134,0.55)' : 'rgba(159,182,255,0.55)'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
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
  /** Drop below the level bar while the rod is out. The bar owns the top of the
   *  screen then, and the banner was landing straight on top of it. */
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
            position: 'absolute', left: 0, right: 0, top: lowered ? 76 : 18,
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
/** How far apart two markers must sit on the perimeter before both are shown. */
const COMPASS_SPACING = 96

function Compass({ pos, zoom, wrapRef, locked, frozen, waitingAt }: {
  frozen: boolean
  /** Crew waiting at a given port, so a dock with a haul on it can jump the
   *  queue. Zero for everywhere else. */
  waitingAt: (id: string) => number
  pos: React.RefObject<Vec>
  zoom: React.RefObject<number>
  wrapRef: React.RefObject<HTMLDivElement | null>
  locked: (p: Place) => boolean
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
    const t = Math.min(ax > 0.001 ? (hw - mx) / ax : Infinity, ay > 0.001 ? (hh - my) / ay : Infinity)
    const x = m.sx * t
    const y = m.sy * t
    if (placed.some(q => Math.hypot(q.x - x, q.y - y) < COMPASS_SPACING)) continue
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
 * Three cards on the backdrop, no modal container behind them — the same shape
 * as the Gauntlets chooser on the expeditions hub, because it is the same
 * question: one door on the chart, three rooms behind it.
 *
 * The art is the building plates already standing on the island, so the card
 * you tap is visibly the building you sailed past. That is the whole reason
 * this is a chooser rather than a list of links.
 */
const ASHORE: { href: string; art: string; name: string; blurb: string; cta: string; accent: string }[] = [
  { href: '/tavern', art: '/sea/tavern.png', name: 'The Tavern',
    blurb: 'Cards, dice and the day\u2019s takings', cta: 'Enter', accent: '#e0a545' },
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

        {/* Three across. They stay three across on the narrowest phone: this is
            one choice between three things and stacking it turns it into a
            list you scroll, which is what the nav already is. */}
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
