// ── WHAT A CREW'S ABILITY DOES TO THE WATER ─────────────────────────────────
//
// Eleven classes fire abilities in a raid, and until this file they shared one
// picture: a pill at the foot of the screen with a portrait, two rings and a
// name, where the ONLY difference between a heal and a kraken was the colour of
// the border. The dramatic effects existed — forked lightning, a mark burning
// in, a surge — but every one of them was gated behind a legendary chase skin.
// The rarest thing in the game was expressive and the thing that happens every
// other turn was a label.
//
// This is the other half: the ability happening in the world, on the hull it
// belongs to, in the sea both ships are floating on.
//
// ── A VOCABULARY, NOT A PILE OF ONE-OFFS ────────────────────────────────────
//
// Three base motions carry every ability, and five of them have a signature
// sentence of their own on top. The base motions sort by what an ability DOES:
//
//   BUFF rises. Something comes UP out of the water and into your hull —
//   light off the surface, motes drawn in. It is help arriving.
//
//   DEBUFF settles. A mark burns into the water UNDER the other ship and stays
//   there; the motes fall rather than rise. It is something being done to them
//   that has not finished happening.
//
//   STRIKE displaces. The sea is shoved: a hard ring, water thrown, and the
//   colour of whoever threw it.
//
// The signatures — mend, brace, aim, salvo, frenzy — are built from the same
// three pools as the base motions, which is what keeps them a family. A shared
// vocabulary is a better base than eleven one-offs precisely because the family
// resemblance says "a crew did something" before the name has been read.
//
// Conventions are the sea's, as everywhere: rings and marks lie ON the plane
// and are squashed by GROUND; motes are in the AIR at a height and are lifted
// by h/GROUND. Pools are allocated once. See seaGunFx for the same discipline
// and for why a Pixi layer is allowed here at all.

import type { Container, Particle, ParticleContainer, Texture } from 'pixi.js'
import { GROUND } from './islandArt'

/** Motes alive at once. A cast throws about twenty. */
const MOTE_CAP = 72
/** Rings. Two or three per cast, and casts do not overlap in a turn. */
const RING_CAP = 12
/** Marks on the water. They linger, so a few can be down at once. */
const MARK_CAP = 4

/**
 * ── THE VOCABULARY ──────────────────────────────────────────────────────────
 *
 * Three base motions and five signatures, and every one of them is a MOTION —
 * none is the name of a crew class. That is the seam: the fight knows which
 * class fired and maps it to a motion; this file knows what a motion looks like
 * on water. Neither has to learn the other's table.
 *
 *   buff    rises into your hull      debuff  settles onto theirs
 *   strike  shoves the sea
 *
 *   mend    the water goes quiet and the light is drawn in slowly
 *   brace   a ring slams shut and the sea is pressed flat
 *   aim     a sight-line is drawn across the water to the target
 *   salvo   something comes up from under them
 *   frenzy  a walk of impacts down the line between the hulls
 *
 * A signature is a different SENTENCE in this vocabulary, not a different
 * language — every one is built from the same three pools, so they all still
 * read as crew abilities before you have read the name.
 */
export type AbilityShape =
  | 'buff' | 'debuff' | 'strike'
  | 'mend' | 'brace' | 'aim' | 'salvo' | 'frenzy'

let moteTex: Texture | null = null
let ringTex: Texture | null = null
let discTex: Texture | null = null

function moteTexture(PIXI: typeof import('pixi.js')): Texture {
  if (moteTex) return moteTex
  const S = 24
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.75)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  moteTex = PIXI.Texture.from(c)
  return moteTex
}

function ringTexture(PIXI: typeof import('pixi.js')): Texture {
  if (ringTex) return ringTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.74, 'rgba(255,255,255,0)')
  grad.addColorStop(0.90, 'rgba(255,255,255,1)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  ringTex = PIXI.Texture.from(c)
  return ringTex
}

/** The filled disc a mark burns into the water. Soft-edged, because a hard one
 *  scaled up on a plane reads as a decal lying on top of the sea. */
function discTexture(PIXI: typeof import('pixi.js')): Texture {
  if (discTex) return discTex
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.0, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1.0, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  discTex = PIXI.Texture.from(c)
  return discTex
}

type Mote = {
  p: Particle
  /** Where it is going: the hull's own point. Buffs converge on it, debuffs
   *  fall onto it, strikes leave it. */
  cx: number; cy: number
  /** Polar around that point, because every one of these motions is radial and
   *  polar is the only frame where "inward" is one number going down. */
  ang: number
  r0: number; r1: number
  h0: number; h1: number
  age: number; life: number
  size: number
  spin: number
}

type Ring = {
  p: Particle
  x: number; y: number
  age: number; life: number
  from: number; to: number
  alpha: number
}

type Mark = {
  p: Particle
  x: number; y: number
  age: number; life: number
  size: number
  alpha: number
  spin: number
}

export type AbilityFx = {
  view: Container
  /**
   * AN ABILITY LANDS ON A HULL AT `x,y`, in its class's colour.
   *
   * `shape` is what it does rather than which ability it is — see the note at
   * the top. The fight sends the class's own colour, so this never has to know
   * anything about crew classes.
   */
  cast(
    x: number, y: number,
    /** The OTHER hull. Some motions are about the space BETWEEN two ships — a
     *  sight-line, a walk of impacts — and cannot be drawn from one point. */
    tx: number, ty: number,
    color: number, shape: AbilityShape,
    /** 1 normally. A legendary chase skin sends more and everything scales with
     *  it, so the rare version of an ability is visibly the rare version rather
     *  than the same effect in a different tint. */
    power: number,
  ): void
  advance(dt: number): void
  night(dark: number): void
  destroy(): void
}

export function makeAbilityFx(PIXI: typeof import('pixi.js')): AbilityFx {
  const view: Container = new PIXI.Container()
  view.eventMode = 'none'

  const markLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  const ringLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  const moteLayer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
  })
  // All three ADD. Every one of these is light — an ability is the one thing in
  // a fight that is unambiguously magic, and the sea's own effects (smoke,
  // slicks, wreckage) are the things that are not.
  markLayer.blendMode = 'add'
  ringLayer.blendMode = 'add'
  moteLayer.blendMode = 'add'
  view.addChild(markLayer)
  view.addChild(ringLayer)
  view.addChild(moteLayer)

  const mt = moteTexture(PIXI), rt = ringTexture(PIXI), dt2 = discTexture(PIXI)

  const motes: Mote[] = []
  for (let i = 0; i < MOTE_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: mt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    moteLayer.addParticle(p)
    motes.push({ p, cx: 0, cy: 0, ang: 0, r0: 0, r1: 0, h0: 0, h1: 0, age: 1, life: 1, size: 0, spin: 0 })
  }
  let nm = 0
  const takeMote = () => { const m = motes[nm]; nm = (nm + 1) % MOTE_CAP; return m }

  const rings: Ring[] = []
  for (let i = 0; i < RING_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: rt })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    ringLayer.addParticle(p)
    rings.push({ p, x: 0, y: 0, age: 1, life: 1, from: 0, to: 0, alpha: 0 })
  }
  let nr = 0
  const takeRing = () => { const r = rings[nr]; nr = (nr + 1) % RING_CAP; return r }

  const marks: Mark[] = []
  for (let i = 0; i < MARK_CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: dt2 })
    p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
    markLayer.addParticle(p)
    marks.push({ p, x: 0, y: 0, age: 1, life: 1, size: 0, alpha: 0, spin: 0 })
  }
  let nk = 0
  const takeMark = () => { const m = marks[nk]; nk = (nk + 1) % MARK_CAP; return m }

  let dark = 0

  /**
   * THE THREE BASE MOTIONS. Named and separate so a signature can fall through
   * to one whole rather than inheriting half of another.
   */
  function base(x: number, y: number, color: number, shape: 'buff' | 'debuff' | 'strike', P: number) {
      // A CAST IS ALWAYS A RING FIRST, whatever it is, and that is the family
      // resemblance: before you have read the name you know a crew did
      // something. Which WAY it travels is the sentence.
      const r = takeRing()
      r.x = x; r.y = y
      r.age = 0
      r.p.tint = color
      if (shape === 'buff') {
        // OUT AND OPENING. Help arriving, spreading from under her.
        r.life = 0.85; r.from = 30; r.to = 330; r.alpha = 0.55
      } else if (shape === 'debuff') {
        // IN AND CLOSING. Something taking hold of them — a ring that shrinks
        // is the only one of the three that reads as being DONE TO a ship
        // rather than coming FROM one.
        r.life = 0.7; r.from = 420; r.to = 70; r.alpha = 0.6
      } else {
        r.life = 0.5; r.from = 40; r.to = 520; r.alpha = 0.7
      }

      const n = shape === 'strike' ? 26 : 20
      for (let i = 0; i < n; i++) {
        const m = takeMote()
        m.cx = x; m.cy = y
        m.ang = (i / n) * Math.PI * 2 + Math.random() * 0.5
        m.age = -Math.random() * 0.22
        m.life = 0.7 + Math.random() * 0.5
        m.size = 12 + Math.random() * 13
        m.p.tint = color
        if (shape === 'buff') {
          // UP AND IN. Off the water, spiralling to the hull.
          m.r0 = 180 + Math.random() * 200
          m.r1 = 20 + Math.random() * 30
          m.h0 = 0
          m.h1 = 90 + Math.random() * 70
          m.spin = 1.6 + Math.random() * 1.2
        } else if (shape === 'debuff') {
          // DOWN AND IN. Falling onto them and settling on the water, which is
          // where the mark it leaves will be.
          m.r0 = 120 + Math.random() * 160
          m.r1 = 30 + Math.random() * 50
          m.h0 = 150 + Math.random() * 120
          m.h1 = 0
          m.spin = -(0.8 + Math.random() * 0.9)
        } else {
          // OUT AND LOW. Thrown, and staying near the surface, because this is
          // the sea being shoved rather than anything rising out of it.
          m.r0 = 20
          m.r1 = 260 + Math.random() * 260
          m.h0 = 20
          m.h1 = 40 + Math.random() * 60
          m.spin = (Math.random() - 0.5) * 0.8
        }
      }

      // AND WHAT IS LEFT AFTERWARDS. Only a debuff leaves anything: it is a
      // condition on that ship, so it stays under them and turns slowly until
      // it lapses. A buff has gone INTO the hull and a strike is over.
      if (shape === 'debuff') {
        const k = takeMark()
        k.x = x; k.y = y
        k.age = -0.2
        k.life = 3.6
        k.size = 210
        k.alpha = 0.3
        k.spin = 0.35
        k.p.tint = color
      }

      // A strike gets its second, wider ring — same argument as the crit's:
      // two rings read as a bigger event than one drawn twice as large.
      if (shape === 'strike') {
        const r2 = takeRing()
        r2.x = x; r2.y = y
        r2.age = -0.1
        r2.life = 0.7
        r2.from = 60; r2.to = 700
        r2.alpha = 0.3
        r2.p.tint = color
      }
  }

  return {
    view,
    night(d) { dark = d },

    cast(x, y, tx, ty, color, shape, power) {
      const P = Math.max(1, power)
      const dx = tx - x, dy = ty - y

      if (shape === 'aim') {
        // A SIGHT-LINE DRAWN ACROSS THE WATER, lit from your bow outward one
        // mote at a time and arriving at the hull it is measuring. A glow
        // around your own ship cannot say WHICH ship is being aimed at; a line
        // that ends on them says nothing else.
        const n = 16
        for (let i = 0; i < n; i++) {
          const m = takeMote()
          const f = (i + 0.5) / n
          m.cx = x + dx * f
          m.cy = y + dy * f
          m.ang = 0; m.r0 = 0; m.r1 = 0
          m.h0 = 26; m.h1 = 34
          // STAGGERED ALONG THE LINE, and that is the whole read: lit all at
          // once it is a rope, lit end to end it is a shot being lined up.
          m.age = -f * 0.3
          m.life = 0.55 + Math.random() * 0.25
          m.size = (9 + Math.random() * 6) * P
          m.spin = 0
          m.p.tint = color
        }
        const r = takeRing()
        r.x = tx; r.y = ty
        r.age = -0.3; r.life = 0.6
        r.from = 300 * P; r.to = 90
        r.alpha = 0.5
        r.p.tint = color
        return
      }

      if (shape === 'frenzy') {
        // A WALK OF IMPACTS down the line. The ability is VOLUME, not one blow,
        // and a row of small rings arriving in sequence is what volume looks
        // like on water.
        const n = Math.round(5 * P)
        for (let i = 0; i < n; i++) {
          const f = 0.35 + (i / Math.max(1, n - 1)) * 0.6
          const rx = x + dx * f + (Math.random() - 0.5) * 70
          const ry = y + dy * f + (Math.random() - 0.5) * 70 * GROUND
          const r = takeRing()
          r.x = rx; r.y = ry
          r.age = -i * 0.1
          r.life = 0.42
          r.from = 20; r.to = 190
          r.alpha = 0.5
          r.p.tint = color
          for (let k = 0; k < 4; k++) {
            const m = takeMote()
            m.cx = rx; m.cy = ry
            m.ang = Math.random() * Math.PI * 2
            m.r0 = 10; m.r1 = 90 + Math.random() * 80
            m.h0 = 14; m.h1 = 40 + Math.random() * 40
            m.age = -i * 0.1
            m.life = 0.4 + Math.random() * 0.25
            m.size = 9 + Math.random() * 7
            m.spin = 0
            m.p.tint = color
          }
        }
        return
      }

      if (shape === 'salvo') {
        // SOMETHING COMES UP FROM UNDER THEM. The dark swell gathers FIRST and
        // the burst follows half a second later — the gather is what makes it
        // read as risen rather than dropped, and it is the only thing here that
        // begins below the surface.
        const k = takeMark()
        k.x = x; k.y = y
        k.age = 0
        k.life = 1.1
        k.size = 150 * P
        k.alpha = 0.42
        k.spin = 0.9
        k.p.tint = color

        for (let i = 0; i < 3; i++) {
          const r = takeRing()
          r.x = x; r.y = y
          r.age = -0.5 - i * 0.08
          r.life = 0.65 + i * 0.15
          r.from = 50
          r.to = (260 + i * 200) * P
          r.alpha = 0.55 - i * 0.12
          r.p.tint = color
        }
        for (let i = 0; i < Math.round(24 * P); i++) {
          const m = takeMote()
          m.cx = x; m.cy = y
          m.ang = Math.random() * Math.PI * 2
          m.r0 = Math.random() * 70
          m.r1 = 120 + Math.random() * 260
          // Thrown HIGH: whatever it was came out of the water.
          m.h0 = 0
          m.h1 = (170 + Math.random() * 200) * P
          m.age = -0.5 - Math.random() * 0.2
          m.life = 0.7 + Math.random() * 0.5
          m.size = 12 + Math.random() * 12
          m.spin = (Math.random() - 0.5) * 0.6
          m.p.tint = color
        }
        return
      }

      if (shape === 'brace') {
        // A RING SLAMS SHUT AND THE SEA IS PRESSED FLAT. Fast, hard and already
        // finished — bracing is not a thing that unfolds, it is a thing that has
        // happened by the time you notice it.
        const r = takeRing()
        r.x = x; r.y = y
        r.age = 0; r.life = 0.34
        r.from = 380 * P; r.to = 60
        r.alpha = 0.8
        r.p.tint = color
        const r2 = takeRing()
        r2.x = x; r2.y = y
        r2.age = -0.3; r2.life = 0.5
        r2.from = 60; r2.to = 300 * P
        r2.alpha = 0.4
        r2.p.tint = color
        for (let i = 0; i < 14; i++) {
          const m = takeMote()
          m.cx = x; m.cy = y
          m.ang = (i / 14) * Math.PI * 2
          m.r0 = 300 * P; m.r1 = 40
          m.h0 = 70; m.h1 = 0
          m.age = 0
          m.life = 0.34
          m.size = 12 + Math.random() * 8
          m.spin = 0
          m.p.tint = color
        }
        return
      }

      if (shape === 'mend') {
        // THE WATER GOES QUIET. Everything here is SLOW where the others are
        // quick: a long soft disc under her and light drawn in over a second
        // and a half rather than thrown. Mending is the one ability that should
        // not look like an impact.
        const k = takeMark()
        k.x = x; k.y = y
        k.age = 0
        k.life = 2.4
        k.size = 240 * P
        k.alpha = 0.24
        k.spin = 0.12
        k.p.tint = color

        const r = takeRing()
        r.x = x; r.y = y
        r.age = 0; r.life = 1.3
        r.from = 30; r.to = 300 * P
        r.alpha = 0.4
        r.p.tint = color

        for (let i = 0; i < Math.round(22 * P); i++) {
          const m = takeMote()
          m.cx = x; m.cy = y
          m.ang = Math.random() * Math.PI * 2
          m.r0 = 150 + Math.random() * 190
          m.r1 = 15 + Math.random() * 25
          m.h0 = 0
          m.h1 = 70 + Math.random() * 60
          m.age = -Math.random() * 0.7
          m.life = 1.1 + Math.random() * 0.6
          m.size = 10 + Math.random() * 10
          m.spin = 0.7 + Math.random() * 0.6
          m.p.tint = color
        }
        return
      }

      base(x, y, color, shape, P)
    },

    advance(dt) {
      // Dimmed after dark like everything else, but far less: an ability is a
      // light source in its own right, and the one time the sea should not be
      // deciding how bright a thing is.
      const lit = 1 - dark * 0.25

      for (const m of motes) {
        if (m.age >= m.life) { if (m.p.alpha) m.p.alpha = 0; continue }
        m.age += dt
        if (m.age < 0) { if (m.p.alpha) m.p.alpha = 0; continue }
        const t = m.age / m.life
        // Eased, not linear. A mote that arrives at a constant speed reads as a
        // dot being moved; one that slows into place reads as being drawn.
        const e = 1 - (1 - t) * (1 - t) * (1 - t)
        const r = m.r0 + (m.r1 - m.r0) * e
        const h = m.h0 + (m.h1 - m.h0) * e
        const a = m.ang + m.spin * e
        m.p.x = m.cx + Math.cos(a) * r
        // The RADIUS is on the plane, so the vertical half of it is squashed —
        // and then the height is lifted back out of that squash. Both, in that
        // order, or a mote circles in an ellipse but hovers at the wrong place.
        m.p.y = m.cy + Math.sin(a) * r * GROUND - h / GROUND
        m.p.scaleX = m.size / 24
        m.p.scaleY = m.size / 24
        // In fast, out over the last third.
        m.p.alpha = lit * Math.min(1, t * 6) * Math.min(1, (1 - t) * 3)
      }

      for (const r of rings) {
        if (r.age >= r.life) { if (r.p.alpha) r.p.alpha = 0; continue }
        r.age += dt
        if (r.age < 0) continue
        const t = r.age / r.life
        const e = 1 - (1 - t) * (1 - t)
        const rad = r.from + (r.to - r.from) * e
        r.p.x = r.x
        r.p.y = r.y
        r.p.scaleX = (rad * 2) / 128
        r.p.scaleY = ((rad * 2) / 128) * GROUND
        // A CLOSING ring brightens as it arrives; an opening one fades as it
        // goes. Both are the same fact: the interesting end is the ship.
        r.p.alpha = r.alpha * lit * (r.to < r.from ? Math.min(1, t * 2) * (1 - t * t) : (1 - t))
      }

      for (const k of marks) {
        if (k.age >= k.life) { if (k.p.alpha) k.p.alpha = 0; continue }
        k.age += dt
        if (k.age < 0) { if (k.p.alpha) k.p.alpha = 0; continue }
        const t = k.age / k.life
        k.p.x = k.x
        k.p.y = k.y
        k.p.rotation += k.spin * dt
        k.p.scaleX = k.size / 128
        k.p.scaleY = (k.size / 128) * GROUND
        // Burns in over a quarter second, holds, and lapses over the last
        // fifth — so the mark ENDING is visible, which is the half of a
        // condition that a player actually needs to see.
        k.p.alpha = k.alpha * lit
          * Math.min(1, t * 8)
          * Math.min(1, (1 - t) * 5)
          // A slow breath while it holds, or it reads as a decal.
          * (0.82 + 0.18 * Math.sin(k.age * 3.4))
      }
    },

    destroy() {
      view.destroy({ children: true })
    },
  }
}
