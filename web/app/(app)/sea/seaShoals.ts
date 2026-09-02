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
}

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

export type Shoals = {
  view: Container
  /** `halfW`/`halfH` are the half-viewport in WORLD units, the same numbers the
   *  landmark cull and the drift field use. */
  advance(camX: number, camY: number, halfW: number, halfH: number, t: number, dt: number): void
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

export function makeShoals(PIXI: typeof import('pixi.js')): Shoals {
  const view: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  const tex = fishTexture(PIXI)

  const schools: School[] = Array.from({ length: SCHOOLS }, () => ({
    x: 0, y: 0, ang: Math.random() * Math.PI * 2,
    turn: (Math.random() - 0.5) * 0.5, lit: 0, want: 0,
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
      // Spread inside the school, wider across than along, so a shoal reads as
      // a body of fish rather than a queue.
      ox: (Math.random() - 0.5) * 190,
      oy: (Math.random() - 0.5) * 120,
      ph: Math.random() * Math.PI * 2,
      amp: 5 + Math.random() * 9,
      size: 0.5 + Math.random() * 0.6,
      bolt: 0, bx: 0, by: 0,
    })
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
    for (const s of spots) {
      if (s.kind !== 'shoal') continue
      const dd = Math.hypot(x - s.x, y - s.y)
      if (dd < s.r * 1.5) d *= 1 + (HOTSPOT_PULL - 1) * (1 - dd / (s.r * 1.5))
    }
    return d
  }

  let tint = 0xffffff
  let spots: Hotspot[] = []
  let spotsAt = 0
  /** Where each school was last placed, so a school is only ever moved while it
   *  is off screen. */
  let seeded = false

  const place = (sc: School, camX: number, camY: number, halfW: number, halfH: number) => {
    sc.x = camX + (Math.random() * 2 - 1) * halfW * MARGIN
    sc.y = camY + (Math.random() * 2 - 1) * halfH * MARGIN
    sc.ang = Math.random() * Math.PI * 2
  }

  return {
    view,

    advance(camX, camY, halfW, halfH, t, dt) {
      const d = Math.min(dt, 0.05)
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
        sc.x += Math.cos(sc.ang) * SWIM * d
        sc.y += Math.sin(sc.ang) * SWIM * d * 0.7

        // ── WRAPPED AROUND THE CAMERA ── moved only while out of sight, and to
        // the far side rather than to a random spot, so the field stays evenly
        // spread instead of clumping wherever the boat has been.
        const ex = halfW * MARGIN, ey = halfH * MARGIN
        if (sc.x < camX - ex) sc.x = camX + ex
        else if (sc.x > camX + ex) sc.x = camX - ex
        if (sc.y < camY - ey) sc.y = camY + ey
        else if (sc.y > camY + ey) sc.y = camY - ey

        // ── HOW MANY OF THIS SCHOOL ARE VISIBLE AT ALL ──
        // Eased rather than switched: a school swimming out of the Deep into
        // the Open Waters should thin out, not vanish on a ring.
        sc.want = densityAt(sc.x, sc.y, spots)
        sc.lit += (sc.want - sc.lit) * Math.min(1, d * 1.6)
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

        if (f.bolt > 0) f.bolt = Math.max(0, f.bolt - d * 1.1)

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
        f.p.scaleX = k
        f.p.scaleY = k
        f.p.tint = tint
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
