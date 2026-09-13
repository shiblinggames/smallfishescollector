// ── THE FISH ARE IN THE WATER NOW ───────────────────────────────────────────
//
// The two halves of this game never met. Fishing is a dial that appears over
// the sea, and the sea underneath it was empty water: nothing in it, nothing
// moving, no reason for one patch to be worth more than another except a badge
// in the corner telling you so. You sailed to a set of coordinates because the
// UI said to, not because you could see anything there.
//
// So: shoals, under the surface. Dark shapes that move in groups, thicker where
// the fishing is better, and they scatter when you drop a line among them.
//
// ── WHY THIS IS THE THING PIXI UNLOCKED ─────────────────────────────────────
//
// It is a few hundred sprites moving independently, which is one draw call here
// and was simply not affordable as DOM. The chart carried three hundred divs at
// its worst and it was the reason the port happened.
//
// ── SEEN, NOT READ ──────────────────────────────────────────────────────────
//
// Density is the whole mechanic made visible. It rises with the band — the
// Shallows hold a few, the Ancient Deep is thick with them — and it spikes hard
// inside a live hotspot. Nothing here CHANGES a catch; the maths is all
// server-side and untouched. What changes is that "the Deep is better" and
// "there is a shoal over there" stop being sentences and become something you
// can see out of the corner of your eye while steering.
//
// ── AND THEY ARE UNDER THE SURFACE ──────────────────────────────────────────
//
// Bottom of the world container: under the drift foam, under the wake, under
// every island. Dark and low-contrast rather than picked out, because a fish
// seen through water is a suggestion of a fish. The moment they read as crisp
// sprites they read as being ON the water, and everything else on this chart
// that floats is bright and everything below it is dim.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'
import { PLACES } from './chart'
import { hotspotsAt, type Hotspot } from '@/lib/seaHotspots'

/**
 * How many fish exist at once. They are recycled around the camera the way the
 * drift flecks are, so this is a per-viewport budget rather than a world
 * population: the whole sea is covered by moving the same few hundred.
 */
const COUNT = 260

/** Fish per school. A shoal is the unit the eye actually reads; a field of
 *  individually-wandering fish is plankton. */
const SCHOOL = 13
const SCHOOLS = Math.ceil(COUNT / SCHOOL)

/** World px per second. Unhurried: they are going about their business, and
 *  anything faster reads as fleeing, which is what the scatter is for. */
const SWIM = 26

/**
 * ── HOW A SCHOOL WANDERS, AND WHY IT USED TO SPIRAL ─────────────────────────
 *
 * The heading was a random walk on the TURN RATE with a clamp and nothing else:
 *
 *     turn += (random - 0.5) * 1.4 * dt
 *     turn  = clamp(turn, -0.6, 0.6)
 *
 * An undamped random walk does not hover near nought, it diffuses — and with
 * hard walls at either end it spends most of its life pinned against one of
 * them. So a school held 0.6 radians a second for long stretches, which is a
 * full circle every ten seconds. They were not drifting oddly, they were
 * orbiting, and every one of them was.
 *
 * A restoring force is the whole fix. The noise still pushes the turn rate
 * about; DAMP pulls it back toward straight, so the rate hovers near nought and
 * a school mostly holds its course and occasionally leans into a curve. Which
 * is what a fish does.
 *
 * And the ceiling comes down with it. 0.6 rad/s is a fish turning on a
 * sixpence; a cruising shoal changes heading slowly or it is fleeing, and
 * fleeing is what the scatter is for.
 */
/**
 * MEASURED, NOT PICKED. Two minutes of the old model turned a school through
 * 8.4 full revolutions and left it pinned against its own clamp 29% of the
 * time. These numbers turn it through about half a revolution in the same two
 * minutes, pinned 1% — a heading that visibly wanders and never once closes a
 * loop, which is the difference between a shoal going somewhere and a shoal
 * going round.
 */
const TURN_NOISE = 2.4
const TURN_DAMP = 0.9
const TURN_MAX = 0.22

/**
 * THE PLANE IS SQUASHED AND THE FISH HAVE TO KNOW.
 *
 * The shoals live in the world container, which carries the chart's
 * foreshortening — so a school swimming due south covers 0.58 of the screen
 * distance it covers in world coordinates. The sprite was pointed along the
 * WORLD heading, which is not where it appears to go: a fish heading
 * south-east looked like it was crabbing, nose one way and travel another, and
 * that mismatch is most of what reads as floating rather than swimming.
 */
const PLANE = 0.58

/** How far off screen a school is allowed to get before it is moved round to
 *  the other side. A whole half-viewport, so the move always happens well out
 *  of sight. */
const MARGIN = 1.35

/**
 * ── HOW MANY BELONG HERE ────────────────────────────────────────────────────
 *
 * By band, keyed on the same `PLACES` ids the zones use, so this cannot drift
 * from where the fishing actually gets better. Everything off the bands (the
 * harbour approaches, the anchorage) gets almost nothing: those are not
 * fishable water and a shoal in them would be a promise the game will not keep.
 */
const BAND_DENSITY: Record<string, number> = {
  shallows: 0.5,
  open_waters: 0.68,
  deep: 0.85,
  abyss: 1,
  ancient_deep: 1,
}

/** What a shoal hotspot does to the water it is in. Deliberately large: this is
 *  the signal, and it should be unmistakable from further away than the badge
 *  can be read. */
const HOTSPOT_PULL = 3.2

type Fish = {
  p: Particle
  /** Which school it belongs to. */
  s: number
  /** Offset from the school's centre, in world px. */
  ox: number
  oy: number
  /** Its own wander, so a school is not a rigid formation. */
  ph: number
  amp: number
  size: number
  /** Length against width, from its school's build and jittered a little so a
   *  school is not one fish copied thirteen times. */
  stretch: number
  /** 0 while swimming, 1 while bolting. Decays. */
  bolt: number
  bx: number
  by: number
}

type School = {
  x: number
  y: number
  /** Heading, radians. Turns slowly and at random. */
  ang: number
  turn: number
  /** How visible this school is, 0..1: density at its position, eased. */
  lit: number
  want: number
  /** Which of the four it is. Re-rolled when the school is recycled, so the
   *  water changes as you sail rather than holding one cast for ever. */
  kind: number
}

/**
 * ── ONE FISH, IN DIFFERENT SIZES AND BUILDS ─────────────────────────────────
 *
 * There was one silhouette drawn at one proportion, and two hundred and sixty
 * copies of a single shape is a texture rather than a sea. The first answer to
 * that was four different silhouettes -- a deep-bodied slab, a thin ribbon, a
 * tailless blob -- and it was the wrong answer: the shape was already right.
 * What it needed was range, not replacement.
 *
 * So it is the same fish throughout, and a school is a BUILD of it: how big,
 * how long against its own width, how fast, how far apart, how hard it wags.
 * A shoal of small quick ones and a few long slow ones are plainly different
 * things on the water and plainly the same animal, which is what a sea looks
 * like.
 *
 * PER SCHOOL, not per fish. That is how it works in the water, and it is the
 * thing that makes the difference legible: mixed within one school it would be
 * variety in the wrong place, cancelling itself out. Individual fish still vary
 * inside their school's build, so no two are identical either.
 *
 * AND IT IS ALL ONE TEXTURE, which is why this costs nothing. Size and
 * elongation are `scaleX` and `scaleY` on a particle that never changes its
 * frame -- no atlas, no second bind, and the container's texture coordinates
 * can stay static the way they were built to be.
 */
type Kind = {
  /** Multiplies the fish's own random size. */
  scale: number
  /** Length against width. Over 1 is a longer, leaner fish; under 1 is a
   *  stubbier one. The silhouette is the same either way. */
  stretch: number
  /** World px per second. A small fish hurries; a big one does not. */
  swim: number
  /** How far its members spread from the school's centre, across and along. */
  spread: [number, number]
  /** How hard it wags. A big fish rolls; a small one flickers. */
  amp: [number, number]
  /** Under water everything is blue-green. These are small departures from it,
   *  and at this alpha they are all the colour there is. */
  tint: number
}

const KINDS: readonly Kind[] = [
  // The ordinary fish of this sea, and most of what you should see.
  { scale: 0.95, stretch: 1.0, swim: 30, spread: [190, 120], amp: [5, 14], tint: 0xdfeef6 },
  // Big and unhurried. A handful to a school, and the one that reads as
  // something worth catching going past underneath you.
  { scale: 1.85, stretch: 1.12, swim: 17, spread: [250, 155], amp: [3, 8], tint: 0xc9dfe8 },
  // Long and lean. Same fish, drawn out, travelling in a looser line.
  { scale: 1.3, stretch: 1.6, swim: 23, spread: [320, 90], amp: [6, 15], tint: 0xd2e8dc },
  // Small fry, tight and quick: a cloud rather than a formation.
  { scale: 0.55, stretch: 0.92, swim: 26, spread: [130, 85], amp: [7, 18], tint: 0xeef6fa },
]

let fishTex: Texture | null = null

/**
 * ONE FISH, SEEN FROM ABOVE THROUGH WATER. A soft tapered blob, not a fish
 * drawing: at the size these are on screen a detailed sprite is mud, and the
 * shape that reads is a fat head narrowing to a tail.
 */
function fishTexture(PIXI: typeof import('pixi.js')): Texture {
  if (fishTex) return fishTex
  const W = 64, H = 32
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  // The body: an ellipse fading out at both ends so it has no hard edge.
  const grad = g.createRadialGradient(W * 0.4, H / 2, 0, W * 0.4, H / 2, W * 0.42)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.save()
  g.translate(W * 0.4, H / 2)
  g.scale(1, 0.44)
  g.beginPath(); g.arc(0, 0, W * 0.42, 0, Math.PI * 2); g.fill()
  g.restore()
  // The tail: a soft wedge off the back, which is the only part that says
  // which way it is pointing.
  g.beginPath()
  g.moveTo(W * 0.72, H / 2)
  g.lineTo(W * 0.98, H * 0.24)
  g.lineTo(W * 0.98, H * 0.76)
  g.closePath()
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.fill()
  fishTex = PIXI.Texture.from(c)
  return fishTex
}

/**
 * ── AND THE SEA IS NOT EVENLY FULL ──────────────────────────────────────────
 *
 * Every band had one density, so every patch of the Deep held exactly as many
 * fish as every other patch of the Deep. Sail in any direction and the water
 * was identically populated for ever, which is the same failure as one
 * silhouette: no information, because nothing differs from anything.
 *
 * This is a coarse value noise over the whole chart -- one number per 2,600px
 * cell, smoothed between them -- so the sea has grounds and it has barrens, and
 * they are PLACES: hashed off the cell coordinates, so the empty stretch you
 * crossed last week is empty this week too, and the water that was thick with
 * fish is worth going back to.
 *
 * The floor is what makes empty ocean exist at all. Below it there is nothing
 * at all rather than a thin scattering, because a few fish everywhere is what
 * we are trying to stop being.
 */
const CELL = 2600
/**
 * MEASURED RATHER THAN PICKED, over 8,000 samples of the real chart.
 *
 * At 0.45 with a straight ramp, 48% of the sea was empty AND the median of what
 * was left came out at 0.37 -- half the ocean barren and most of the rest thin,
 * which trades one uniform sea for another uniform sea with less in it.
 *
 * 0.38 with the ramp on a square root gives 37% genuinely empty water and a
 * median of 0.61 where there is anything at all. Barren stretches run to about
 * three screens across, which is a real crossing: long enough to notice, short
 * enough that it is a passage rather than a desert.
 */
const BARREN = 0.38

function cellNoise(ix: number, iy: number): number {
  // Integer hash. Cheap, stable, and no seeded generator to thread about.
  let h = ix * 374761393 + iy * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

function patchAt(x: number, y: number): number {
  const fx = x / CELL, fy = y / CELL
  const ix = Math.floor(fx), iy = Math.floor(fy)
  const tx = fx - ix, ty = fy - iy
  // Smoothstep on both axes, or the grid shows up as diamonds.
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
  const a = cellNoise(ix, iy), b = cellNoise(ix + 1, iy)
  const c2 = cellNoise(ix, iy + 1), d2 = cellNoise(ix + 1, iy + 1)
  const top = a + (b - a) * sx
  const bot = c2 + (d2 - c2) * sx
  const v = top + (bot - top) * sy
  // Below the floor is empty water. Above it the ramp is a square root rather
  // than a straight line, so grounds feel like grounds: a linear ramp spends
  // most of its range on thin water nobody would call fishing.
  return v < BARREN ? 0 : Math.sqrt((v - BARREN) / (1 - BARREN))
}

export type Shoals = {
  view: Container
  /**
   * `halfW`/`halfH` are the half-viewport in WORLD units, the same numbers the
   * landmark cull and the drift field use.
   *
   * `boat` is where the hull actually is, which is NOT the camera: the camera
   * leaves her to look at an island during a tour and frames the engagement in
   * a fight. Fish part for a ship, not for a point of view.
   */
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number, dt: number,
    boat?: { x: number; y: number }): void
  /**
   * SOMETHING HIT THE WATER HERE. Every fish within reach bolts.
   *
   * Called when a line goes in, and it is the one moment the shoals stop being
   * scenery: dropping a hook into a patch you sailed across the chart to find
   * and watching it empty is the whole reason to have drawn them.
   */
  scatter(x: number, y: number): void
  night(tint: number): void
  destroy(): void
}

/**
 * ── WHAT A PASSING HULL DOES TO A SCHOOL ────────────────────────────────────
 *
 * REACH is generous and PUSH is not. Fish should open a lane around the boat
 * and close it behind her; they should not be fired across the chart like a
 * hook landing, which is what `scatter` is for and which is twice this.
 *
 * SPEED is the knots at which the effect is full. Below it the lane narrows,
 * and at anchor there is none: the school swims back over her.
 */
const BOW_REACH = 330
const BOW_PUSH = 120
const BOW_SPEED = 260
/**
 * HOW FAST THEY GET OUT OF THE WAY, as a share of the full push per second.
 *
 * This was missing entirely and it was the whole problem. The displacement was
 * set the instant a fish came inside the reach, so a fish did not SWIM aside --
 * it was somewhere else on the next frame. A teleport reads as a glitch even
 * when the distance is small, and it reads as a glitch at any push value, which
 * is why making the push gentler did not help.
 *
 * At 1.1 a fish takes about a second to reach full displacement, which is a
 * fish deciding to move rather than a fish being deleted and redrawn. It is
 * still faster than the school's own swimming, because it is meant to be a
 * bolt.
 *
 * THE HOOK IS NOT EASED. `scatter` still sets its bolt outright: a splash
 * landing among them IS sudden, and that difference is the point of having
 * both.
 */
const BOW_EASE = 1.1
/** How quickly a fish re-aims as the hull moves past. Slow enough that the
 *  direction turns rather than snapping from one side to the other. */
const BOW_TURN = 2.4

export function makeShoals(PIXI: typeof import('pixi.js')): Shoals {
  const view: ParticleContainer = new PIXI.ParticleContainer({
    // `uvs` STAYS STATIC, and that is a deliberate saving rather than an
    // oversight: every fish in the sea is one frame of one texture, so the
    // coordinates are uploaded once and never touched again. A moment of this
    // file had four silhouettes in an atlas and needed them dynamic; the builds
    // replaced that, and this is one of the things it bought back.
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  const tex = fishTexture(PIXI)

  const schools: School[] = Array.from({ length: SCHOOLS }, () => ({
    x: 0, y: 0, ang: Math.random() * Math.PI * 2,
    turn: (Math.random() - 0.5) * 0.5, lit: 0, want: 0, kind: 0,
  }))

  const fish: Fish[] = []
  for (let i = 0; i < COUNT; i++) {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    view.addParticle(p)
    fish.push({
      p, s: i % SCHOOLS,
      ox: 0, oy: 0,
      ph: Math.random() * Math.PI * 2,
      amp: 8, size: 0.8, stretch: 1,
      bolt: 0, bx: 0, by: 0,
    })
  }

  /**
   * DRESS A SCHOOL IN ITS KIND. Called when one is recycled, so every member
   * takes the new shape, the new spread, the new wag and the new colour at the
   * same moment -- a school is one kind of fish, and half of them changing
   * species would be worse than none.
   */
  const dress = (si: number) => {
    const k = KINDS[schools[si].kind]
    for (const f of fish) {
      if (f.s !== si) continue
      // NO TEXTURE SWAP. Same fish, different build -- see the note on Kind.
      f.p.tint = k.tint
      // A tenth either way on top of the school's own build, so the biggest in
      // a shoal is visibly the biggest and none of them are twins.
      f.stretch = k.stretch * (0.92 + Math.random() * 0.16)
      // Spread across the heading more than along it, so a shoal reads as a
      // body of fish rather than a queue -- except the ribbons, whose table
      // says the opposite and means it.
      f.ox = (Math.random() - 0.5) * k.spread[0]
      f.oy = (Math.random() - 0.5) * k.spread[1]
      f.amp = k.amp[0] + Math.random() * (k.amp[1] - k.amp[0])
      f.size = (0.5 + Math.random() * 0.6) * k.scale
    }
  }

  /** Which band a point is in, by the same rings the zones are drawn from. */
  const bands = PLACES.filter(p => p.inner !== undefined)
  const densityAt = (x: number, y: number, spots: Hotspot[]): number => {
    // North of the coast is harbour water. Nothing lives there worth drawing.
    if (y < 300) return 0
    const r = Math.hypot(x, y)
    let d = 0
    for (const b of bands) {
      if (r >= (b.inner ?? 0) && r <= (b.outer ?? 0)) { d = BAND_DENSITY[b.id] ?? 0.4; break }
    }
    if (d === 0) return 0
    // AND THE PATCH. Only a shoal hotspot pulls fish: a trench and a flotsam
    // patch do other things, and drawing fish over them would say the wrong
    // thing about what they are.
    let hs = 0
    for (const s of spots) {
      if (s.kind !== 'shoal') continue
      const dd = Math.hypot(x - s.x, y - s.y)
      if (dd < s.r * 1.5) hs = Math.max(hs, 1 - dd / (s.r * 1.5))
    }
    // ── AND WHETHER THIS PARTICULAR WATER HOLDS ANYTHING ──────────
    //
    // See patchAt. A band says what the water is capable of; the noise says
    // whether THIS stretch of it is grounds or barrens, and a good share of the
    // sea is barrens. That is the point: empty ocean is a thing you should be
    // able to sail through, and it is what makes a shoal worth finding.
    //
    // A HOTSPOT IS ALWAYS GOOD WATER, whatever the noise says underneath it.
    // The gulls are circling over it and the badge names it; water that was
    // advertised and then delivered nothing would be the game lying.
    d *= Math.max(patchAt(x, y), hs)
    d *= 1 + (HOTSPOT_PULL - 1) * hs
    return d
  }

  /** Two tints, multiplied channel by channel. */
  const mix = (a: number, b: number) =>
    ((((a >> 16) & 255) * ((b >> 16) & 255) / 255) << 16)
    | ((((a >> 8) & 255) * ((b >> 8) & 255) / 255) << 8)
    | (((a & 255) * (b & 255) / 255) | 0)

  let tint = 0xffffff
  let spots: Hotspot[] = []
  let spotsAt = 0
  /** Where the hull was last frame, and how fast she is going. See advance. */
  const lastBoat = { x: 0, y: 0 }
  let speed = 0
  /** Where each school was last placed, so a school is only ever moved while it
   *  is off screen. */
  let seeded = false

  const place = (sc: School, camX: number, camY: number, halfW: number, halfH: number) => {
    sc.x = camX + (Math.random() * 2 - 1) * halfW * MARGIN
    sc.y = camY + (Math.random() * 2 - 1) * halfH * MARGIN
    sc.ang = Math.random() * Math.PI * 2
    // WEIGHTED, NOT EVEN. Darts are the ordinary fish of this sea and should be
    // most of what you see; a slab going past is worth something precisely
    // because the last three schools were not slabs.
    const r = Math.random()
    sc.kind = r < 0.52 ? 0 : r < 0.68 ? 1 : r < 0.84 ? 2 : 3
    dress(schools.indexOf(sc))
  }

  return {
    view,

    advance(camX, camY, halfW, halfH, t, dt, boat) {
      const d = Math.min(dt, 0.05)

      // ── HOW FAST SHE IS GOING, AND WHY IT IS MEASURED HERE ──────────
      //
      // A hull under way pushes water ahead of it and the fish feel that long
      // before they see anything. A hull sitting at anchor does not, and a
      // school should close over a moored boat rather than treating her as a
      // rock for ever.
      //
      // Derived from her own movement rather than asked for, because the only
      // thing this needs to know is whether she is travelling and the chart
      // already tells us where she is. Smoothed hard: `boat` carries her bob,
      // which is a few pixels of screen-space wobble that would otherwise read
      // as a boat permanently doing two knots.
      if (boat) {
        const bx = boat.x - lastBoat.x, by = boat.y - lastBoat.y
        lastBoat.x = boat.x; lastBoat.y = boat.y
        const inst = Math.hypot(bx, by) / Math.max(d, 0.001)
        speed += (inst - speed) * Math.min(1, d * 2.2)
      }
      // The hotspot set moves every ten minutes and asking for it is a hash, not
      // a fetch, but there is no reason to run it sixty times a second.
      const now = Date.now()
      if (now - spotsAt > 4000) { spotsAt = now; spots = hotspotsAt(now) }

      if (!seeded) {
        seeded = true
        for (const sc of schools) place(sc, camX, camY, halfW, halfH)
      }

      for (const sc of schools) {
        // ── WANDER ── a heading that leans and comes back. See TURN_DAMP: an
        // undamped walk pins itself against its own clamp and the school orbits.
        sc.turn += (Math.random() - 0.5) * TURN_NOISE * d
        sc.turn -= sc.turn * TURN_DAMP * d
        sc.turn = Math.max(-TURN_MAX, Math.min(TURN_MAX, sc.turn))
        sc.ang += sc.turn * d
        // Its own pace. A dart hurries and a slab does not, and that difference
        // is as much of the telling-apart as the silhouette is.
        const swim = KINDS[sc.kind].swim
        sc.x += Math.cos(sc.ang) * swim * d
        sc.y += Math.sin(sc.ang) * swim * d * 0.7

        // ── WRAPPED AROUND THE CAMERA ── moved only while out of sight, and to
        // the far side rather than to a random spot, so the field stays evenly
        // spread instead of clumping wherever the boat has been.
        const ex = halfW * MARGIN, ey = halfH * MARGIN
        let wrapped = false
        if (sc.x < camX - ex) { sc.x = camX + ex; wrapped = true }
        else if (sc.x > camX + ex) { sc.x = camX - ex; wrapped = true }
        if (sc.y < camY - ey) { sc.y = camY + ey; wrapped = true }
        else if (sc.y > camY + ey) { sc.y = camY - ey; wrapped = true }
        // A school carried round to the far side is a new school as far as
        // anyone on the boat is concerned, so it gets a new kind. This is what
        // stops a session being the four schools you happened to start with.
        if (wrapped) {
          const r = Math.random()
          sc.kind = r < 0.52 ? 0 : r < 0.68 ? 1 : r < 0.84 ? 2 : 3
          dress(schools.indexOf(sc))
        }

        // ── HOW MANY OF THIS SCHOOL ARE VISIBLE AT ALL ──
        // Eased rather than switched: a school swimming out of the Deep into
        // the Open Waters should thin out, not vanish on a ring.
        sc.want = densityAt(sc.x, sc.y, spots)
        sc.lit += (sc.want - sc.lit) * Math.min(1, d * 1.6)
      }

      // ── AND THEY GET OUT OF THE WAY ─────────────────────────────────
      //
      // The one thing this whole layer was missing. Every school on the chart
      // wrapped politely around the camera and none of them had ever heard of
      // the boat: you could put a bowsprit through the middle of a shoal and
      // they would carry on swimming through the hull.
      //
      // Not a second mechanism. `scatter` already throws a fish outward and
      // eases it back, for a hook landing among them; this is the same push,
      // held for as long as she is alongside rather than fired once. A fish
      // inside the reach has its bolt topped up and its direction re-aimed
      // every frame, so the school PARTS around a moving hull and closes again
      // behind her -- and the moment she stops, the top-up stops with her and
      // they drift back in.
      const wash = boat ? Math.min(1, speed / BOW_SPEED) : 0
      if (boat && wash > 0.05) {
        const reach = BOW_REACH * (0.55 + wash * 0.45)
        for (const f of fish) {
          if (f.p.alpha <= 0) continue
          const dx = f.p.x - boat.x, dy = (f.p.y - boat.y) / PLANE
          const dd = Math.hypot(dx, dy)
          if (dd > reach) continue
          const near = 1 - dd / reach
          const n = dd < 1 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx)
          const push = near * wash * BOW_PUSH
          // THE AIM TURNS, IT DOES NOT JUMP. Re-pointed every frame as she goes
          // past, so a fish that has been shouldered aside keeps being pushed
          // away from wherever she is now -- but eased, or the vector snaps
          // across the fish as the hull draws level with it.
          const k = Math.min(1, d * BOW_TURN)
          f.bx += (Math.cos(n) * push - f.bx) * k
          f.by += (Math.sin(n) * push * 0.7 - f.by) * k
          // AND THE MOVE ITSELF EASES IN. See BOW_EASE: this used to be an
          // assignment, so the fish was simply somewhere else on the next
          // frame. Topped up rather than set, and never cut -- a fish already
          // bolting from a cast is not calmed down by a boat arriving.
          const want = Math.min(1, near * 1.15)
          if (want > f.bolt) f.bolt = Math.min(want, f.bolt + d * BOW_EASE)
        }
      }

      for (const f of fish) {
        const sc = schools[f.s]
        // ── HOW MANY OF THE SCHOOL ARE DRAWN ──
        //
        // Density is spent on COUNT before brightness: a thin patch is a few
        // fish clearly seen, not a whole shoal of ghosts. Each fish has a fixed
        // slot in its school and only shows once the density reaches it.
        //
        // THE SLOT SPAN IS 1.6, NOT 1, and that number is the whole gradient.
        // At 1 the count saturated by the Deep, so the Abyss, the Ancient Deep
        // and a hotspot were all thirteen fish and differed only in alpha —
        // which is exactly the thing this is supposed to make visible. Measured
        // rather than guessed: 1.6 gives 4 fish in the Shallows, 5 in the Open
        // Waters, 7 in the Deep, 8 in the dark bands, and the full school only
        // inside a shoal patch.
        const slot = (f.ph / (Math.PI * 2))
        const on = sc.lit > slot * 1.6

        // Coming back is slower than going, which is how a fish behaves and
        // also what keeps the lane open behind a hull for a beat instead of
        // slamming shut on her stern.
        if (f.bolt > 0) f.bolt = Math.max(0, f.bolt - d * 0.75)

        const wob = Math.sin(t * 2.2 + f.ph * 5) * f.amp
        const ax = Math.cos(sc.ang), ay = Math.sin(sc.ang)
        // Offsets are rotated into the school's heading, so a shoal turns as a
        // body instead of sliding sideways.
        //
        // AND THE WOBBLE IS ACROSS THE HEADING, not down the screen. It was a
        // flat addition to y, so a fish swimming north-south wagged along its
        // own length — a fish concertinaing rather than a tail beating. Across
        // the line of travel it is the same number doing the thing it was
        // named for.
        let x = sc.x + f.ox * ax - f.oy * ay + wob * -ay * 0.4
        let y = sc.y + f.ox * ay + f.oy * ax + wob * ax * 0.4
        if (f.bolt > 0) {
          // Thrown outward from wherever the hook went in, easing back.
          const k = f.bolt * f.bolt
          x += f.bx * k
          y += f.by * k
        }
        f.p.x = x
        f.p.y = y
        // POINTED WHERE IT APPEARS TO GO, not where it goes in world
        // coordinates. See PLANE: the container is foreshortened, so the two
        // are different angles and using the wrong one is a fish crabbing.
        f.p.rotation = Math.atan2(ay * PLANE, ax) + Math.sin(t * 3 + f.ph) * 0.12
        // SIZE READS THE BAND, NOT THE PATCH. Clamped, because a hotspot's
        // multiplier is allowed to summon more fish and is emphatically not
        // allowed to grow them: a bigger fish means a bigger fish.
        const vis = Math.min(1, sc.lit)
        const k = f.size * (0.5 + vis * 0.22) * (1 + f.bolt * 0.15)
        // LENGTH AND WIDTH SEPARATELY, which is the whole of the variety: the
        // sprite is one fish and `stretch` decides whether it is a short thick
        // one or a long lean one. Split either side of the ratio so a stretched
        // fish gains length and loses girth rather than simply getting bigger.
        const long = Math.sqrt(f.stretch)
        f.p.scaleX = k * long
        f.p.scaleY = k / long
        // ITS OWN COLOUR, THROUGH THE HOUR'S. `tint` is the night multiply
        // every sprite on the chart takes; the kind's own colour is multiplied
        // into it rather than overwriting it, or a fish would be the only
        // thing on the water that does not get dark.
        f.p.tint = mix(KINDS[sc.kind].tint, tint)
        // DIM. A fish under water is a suggestion of a fish, and anything
        // crisper reads as floating ON it. It also brightens a little when
        // bolting, which is the flash of a turning flank.
        f.p.alpha = on ? Math.min(0.5, 0.16 + vis * 0.2 + f.bolt * 0.28) : 0
      }
    },

    scatter(x, y) {
      // Generous: the splash is what they hear, not what they see, and a hook
      // landing among them empties more water than it touches.
      const REACH = 520
      for (const f of fish) {
        const dx = f.p.x - x, dy = f.p.y - y
        const dd = Math.hypot(dx, dy)
        if (dd > REACH) continue
        const n = dd < 1 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx)
        const push = (1 - dd / REACH) * (150 + Math.random() * 190)
        f.bx = Math.cos(n) * push
        f.by = Math.sin(n) * push * 0.7
        f.bolt = 1
      }
    },

    night(next) { tint = next },

    destroy() { view.destroy({ children: true }) },
  }
}
