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

/**
 * ── THE POOLS ARE SIZED ON THE WORST CAST, NOT THE AVERAGE ─────────────────
 *
 * A ring buffer that runs out does not drop the NEW particle, it recycles the
 * oldest — so an undersized pool silently eats the beginning of the very effect
 * it is too small for. The worst case is a legendary Tempest: `storm` at power
 * 2 is fourteen strikes of five motes, and the overture adds sixty-odd on top.
 * Sized for that, with room for a second cast while the first is still in the
 * air.
 */
const MOTE_CAP = 200
/** Rings. A legendary storm alone throws fourteen, plus its overture. */
const RING_CAP = 34
/** Marks on the water. They linger, so a few can be down at once. */
const MARK_CAP = 6

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
 *   storm   the sea is struck again and again from above
 *   sweep   a ring goes out, and one comes back
 *
 * A signature is a different SENTENCE in this vocabulary, not a different
 * language — every one is built from the same three pools, so they all still
 * read as crew abilities before you have read the name.
 */
export type AbilityShape =
  | 'buff' | 'debuff' | 'strike'
  | 'mend' | 'brace' | 'aim' | 'salvo' | 'frenzy'
  // The two a legendary needs that nothing else says:
  | 'storm' | 'sweep'

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
   * ── A SHIELD IS A STATE, WHICH IS WHY IT IS NOT A `cast` ─────────────────
   *
   * Everything else in this file is an EVENT: it fires, it plays, it is over.
   * A ward is the opposite — it is a condition that holds for turns and then
   * stops, and drawing it as a one-shot ring slamming shut said only that it
   * had been PUT UP. Nothing on the water said it was still there, and nothing
   * said when it broke, which is the half that actually matters: a shield you
   * cannot see the end of is a shield you cannot play around.
   *
   * So it is set, held and cleared. Called every frame with where the hull is,
   * because the hull moves and a shell that lags behind it is a decal.
   * Clearing it after it was up SHATTERS it — see the note in `advance`.
   */
  /**
   * ── A CONDITION ON A HULL, HELD ─────────────────────────────────────────
   *
   * Same argument as the ward and the same shape of answer. Burning, frozen and
   * snared are states that last for turns, and the only place they existed was
   * as a word in a chip on a nameplate — so a ship that was on fire looked
   * exactly like a ship that was not, on water that had no opinion either way.
   *
   * ONE AT A TIME, deliberately. Three conditions drawn at once on one hull is
   * soup, and the fight already knows which of them is the one that matters —
   * it is the one deciding what happens next turn. Priority belongs there,
   * where the rules are, not here.
   *
   * `kind` is a small code rather than a string so it can ride the pose
   * channel's numeric change-detection with everything else. See COND for the
   * table; the nine tracked statuses collapse onto it, because several of them
   * are the same PICTURE — a ship that is weakened, feeble, corroded, slowed or
   * silenced is a ship that is diminished, and drawing five different sags
   * would be five things nobody can tell apart.
   */
  status(side: 'player' | 'enemy', x: number, y: number, beam: number, kind: number): void
  ward(
    side: 'player' | 'enemy', x: number, y: number,
    /**
     * HOW MUCH SHIP THERE IS, in world px. A ward drawn as a circle squashed by
     * GROUND is the same anonymous oval on a rowboat and a man-o-war; a ship is
     * long and low and its shell should be too. This is what makes the shape
     * belong to the hull inside it.
     */
    beam: number,
    color: number, up: boolean,
  ): void
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
  /**
   * ── THE CONJURING ─────────────────────────────────────────────────────────
   *
   * The summon splash takes the whole screen; this is the water's half of the
   * same beat, at the hull the crew was called to. Deliberately NOT the cast
   * and NOT the overture: a cast is radial and instant, an overture is a
   * pillar — a summoning is a PROCESS, so its signature is a sigil turning on
   * the water with the sea being gathered inward and a helix climbing out of
   * it for as long as the splash holds. P is the usual weight: 1 for a crew,
   * 2 for a chase skin, which adds the white snap, a counter-helix, and an
   * ember afterglow that outlasts the banner.
   */
  summon(x: number, y: number, color: number, P: number): void
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

  // ── THE WARDS ────────────────────────────────────────────────────────────
  //
  // Their own particles, NOT taken from the pools above. A ward can be up for
  // half a minute, and a ring buffer would recycle it out from under itself the
  // moment anything else fired — the shell would silently vanish mid-fight,
  // which is the worst possible failure for a thing whose whole job is to say
  // "this is still holding".
  const wards = (['player', 'enemy'] as const).map(() => {
    const shellA: Particle = new PIXI.Particle({ texture: rt })
    const shellB: Particle = new PIXI.Particle({ texture: rt })
    for (const sh of [shellA, shellB]) {
      sh.anchorX = 0.5; sh.anchorY = 0.5; sh.alpha = 0
      ringLayer.addParticle(sh)
    }
    const orbit: Particle[] = []
    for (let i = 0; i < 8; i++) {
      const o: Particle = new PIXI.Particle({ texture: mt })
      o.anchorX = 0.5; o.anchorY = 0.5; o.alpha = 0
      moteLayer.addParticle(o)
      orbit.push(o)
    }
    return { shellA, shellB, orbit, up: false, x: 0, y: 0, beam: 200, color: 0xffffff, t: 0, fade: 0 }
  })

  // ── THE CONDITIONS ───────────────────────────────────────────────────────
  //
  // Dedicated particles for the same reason the wards have them: a status holds
  // for turns, and a ring buffer would recycle it away the moment anything else
  // fired.
  const conds = (['player', 'enemy'] as const).map(() => {
    const halo: Particle = new PIXI.Particle({ texture: dt2 })
    halo.anchorX = 0.5; halo.anchorY = 0.5; halo.alpha = 0
    markLayer.addParticle(halo)
    const bits: Particle[] = []
    for (let i = 0; i < 12; i++) {
      const b: Particle = new PIXI.Particle({ texture: mt })
      b.anchorX = 0.5; b.anchorY = 0.5; b.alpha = 0
      moteLayer.addParticle(b)
      bits.push(b)
    }
    return { halo, bits, kind: 0, x: 0, y: 0, beam: 200, t: 0, fade: 0, seed: bits.map(() => Math.random()) }
  })

  /** What each condition looks like. Colour, and the MANNER — which is the part
   *  that carries the meaning: fire rises, ice hangs, a snare drags down. */
  const COND = [
    null,
    { color: 0xff8a3c, rise: 1 },      // 1 burn     — embers going up
    { color: 0xa8e8ff, rise: 0 },      // 2 freeze   — crystals hanging still
    { color: 0xd9b066, rise: -1 },     // 3 snare    — dragged down to the water
    { color: 0xff4d7d, rise: 0 },      // 4 marked   — a sigil turning under them
    { color: 0x4ade80, rise: 1 },      // 5 regen    — green coming up into her
    { color: 0x9eb0cd, rise: 0 },      // 6 fortify  — steel holding, unmoving
    { color: 0xef4444, rise: 1 },      // 7 enrage   — heat coming off them
    { color: 0xa78bfa, rise: -1 },     // 8 weakened — sagging to the waterline
  ] as const

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
        r.life = 0.85; r.from = 30; r.to = 330 * P; r.alpha = 0.55
      } else if (shape === 'debuff') {
        // IN AND CLOSING. Something taking hold of them — a ring that shrinks
        // is the only one of the three that reads as being DONE TO a ship
        // rather than coming FROM one.
        r.life = 0.7; r.from = 420 * P; r.to = 70; r.alpha = 0.6
      } else {
        r.life = 0.5; r.from = 40; r.to = 520 * P; r.alpha = 0.7
      }

      const n = Math.round((shape === 'strike' ? 26 : 20) * P)
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
        k.size = 210 * P
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
        r2.from = 60; r2.to = 700 * P
        r2.alpha = 0.3
        r2.p.tint = color
      }
  }

  /**
   * ── WHAT EVERY LEGENDARY DOES, WHATEVER IT IS ────────────────────────────
   *
   * A chase skin was reaching the water as "the same motion, bigger", and
   * bigger is not the same as rarer — a salvo at 2.4 is still a salvo. This is
   * the part that is only ever seen when a legendary fires, so that the FIRST
   * frame says so, before the motion underneath has declared itself.
   *
   * Three passes, and each is doing a different job:
   *
   *   THE FLASH is white, not the skin's colour. Everything else on this water
   *   is tinted; a hot core that is NOT the tint is the cheapest way to say
   *   "more than the usual amount of this" without inventing a new colour that
   *   fights the class's own.
   *
   *   THE COLUMN goes straight up. Every other motion in this file is radial
   *   and flat, on a plane; a vertical throw is the one axis the vocabulary
   *   never uses, which is exactly why it reads as an event rather than as a
   *   louder version of one.
   *
   *   THE EMBERS stay. They rise and drift for two and a half seconds after
   *   everything else has finished, so a legendary has an AFTERMATH — and an
   *   aftermath is most of what separates a big moment from a fast one.
   */
  function overture(x: number, y: number, color: number, P: number) {
    const r = takeRing()
    r.x = x; r.y = y
    r.age = 0
    r.life = 0.3
    r.from = 20; r.to = 420 * P
    r.alpha = 0.85
    r.p.tint = 0xffffff

    for (let i = 0; i < Math.round(18 * P); i++) {
      const m = takeMote()
      m.cx = x; m.cy = y
      m.ang = Math.random() * Math.PI * 2
      // Tight on the plane and enormous in height: a pillar, not a dome.
      m.r0 = Math.random() * 60
      m.r1 = 30 + Math.random() * 90
      m.h0 = 0
      m.h1 = (260 + Math.random() * 280) * P
      m.age = -Math.random() * 0.16
      m.life = 0.85 + Math.random() * 0.5
      m.size = 13 + Math.random() * 12
      m.spin = (Math.random() - 0.5) * 1.4
      m.p.tint = i % 4 === 0 ? 0xffffff : color
    }

    for (let i = 0; i < Math.round(14 * P); i++) {
      const m = takeMote()
      m.cx = x; m.cy = y
      m.ang = Math.random() * Math.PI * 2
      m.r0 = 40 + Math.random() * 120
      m.r1 = 150 + Math.random() * 260
      m.h0 = 30 + Math.random() * 90
      m.h1 = 190 + Math.random() * 220
      // LATE AND LONG. They start as the motion is finishing and outlive it,
      // which is what makes the water look like something happened rather than
      // like something is happening.
      m.age = -(0.5 + Math.random() * 0.5)
      m.life = 2.0 + Math.random() * 1.0
      m.size = 7 + Math.random() * 8
      m.spin = (Math.random() - 0.5) * 2.4
      m.p.tint = color
    }
  }

  return {
    view,
    night(d) { dark = d },

    status(side, x, y, beam, kind) {
      const c = conds[side === 'player' ? 0 : 1]
      c.x = x; c.y = y
      if (beam > 0) c.beam = beam
      c.kind = kind
    },

    ward(side, x, y, beam, color, up) {
      const w = wards[side === 'player' ? 0 : 1]
      w.x = x; w.y = y; w.color = color
      if (beam > 0) w.beam = beam
      if (up === w.up) return
      w.up = up
      if (up) {
        // IT COMES UP. A hard ring closing onto the hull, so raising a ward is
        // an event even though holding one is not.
        const r = takeRing()
        r.x = x; r.y = y
        r.age = 0; r.life = 0.36
        r.from = w.beam * 1.7; r.to = w.beam * 0.45
        r.alpha = 0.75
        r.p.tint = color
      } else {
        // AND IT BREAKS. Shards thrown outward and a hard flash — the moment
        // the shell is gone is the one a player has to see, because it is the
        // moment the next hit starts landing on the hull instead.
        const r = takeRing()
        r.x = x; r.y = y
        r.age = 0; r.life = 0.34
        r.from = w.beam * 0.5; r.to = w.beam * 2.4
        r.alpha = 0.8
        r.p.tint = 0xffffff
        for (let i = 0; i < 20; i++) {
          const m = takeMote()
          m.cx = x; m.cy = y
          m.ang = (i / 20) * Math.PI * 2 + Math.random() * 0.3
          m.r0 = w.beam * 0.55
          m.r1 = w.beam * (1.1 + Math.random())
          // Thrown UP and out, like something rigid failing rather than
          // something soft dispersing.
          m.h0 = 40
          m.h1 = 90 + Math.random() * 140
          m.age = 0
          m.life = 0.5 + Math.random() * 0.35
          m.size = 12 + Math.random() * 10
          m.spin = (Math.random() - 0.5) * 0.9
          m.p.tint = i % 3 === 0 ? 0xffffff : color
        }
      }
    },

    cast(x, y, tx, ty, color, shape, power) {
      const P = Math.max(1, power)
      const dx = tx - x, dy = ty - y

      // 1.5 IS THE LINE, and it is not arbitrary: an ordinary crew ability
      // sends 1 and a chase skin sends 1.6 at the least. Anything above this
      // came from a legendary.
      if (P >= 1.5) overture(x, y, color, P)

      if (shape === 'storm') {
        // THE SEA IS STRUCK, AGAIN AND AGAIN. Tempest's bolts already fall on
        // the hull; this is the water underneath answering each one. Scattered
        // around them rather than on them, because a storm is weather over a
        // PLACE and hitting the same point repeatedly would read as one gun
        // firing fast.
        const n = Math.round(7 * P)
        for (let i = 0; i < n; i++) {
          const a2 = Math.random() * Math.PI * 2
          const rad = Math.random() * 210 * P
          const sx = x + Math.cos(a2) * rad
          const sy = y + Math.sin(a2) * rad * GROUND
          const r = takeRing()
          r.x = sx; r.y = sy
          // Staggered, and unevenly: a rhythm reads as a machine, and this is
          // supposed to be weather.
          r.age = -(i * 0.11 + Math.random() * 0.07)
          r.life = 0.4
          r.from = 15; r.to = 190
          r.alpha = 0.62
          r.p.tint = color
          for (let k = 0; k < 5; k++) {
            const m = takeMote()
            m.cx = sx; m.cy = sy
            m.ang = Math.random() * Math.PI * 2
            m.r0 = 6; m.r1 = 60 + Math.random() * 90
            // UP, hard. Each strike lifts the water it hits.
            m.h0 = 0; m.h1 = 110 + Math.random() * 130
            m.age = -(i * 0.11 + Math.random() * 0.07)
            m.life = 0.4 + Math.random() * 0.3
            m.size = 10 + Math.random() * 9
            m.spin = 0
            m.p.tint = color
          }
        }
        return
      }

      if (shape === 'sweep') {
        // OUT, AND BACK. A ring leaves you, reaches them, and a second returns
        // — which is what READING a ship looks like, and the only motion here
        // that ends where it started. Oracle learns something and brings it
        // home; nothing is done to the sea at all.
        const r = takeRing()
        r.x = x; r.y = y
        r.age = 0; r.life = 0.75
        r.from = 40; r.to = 620 * P
        r.alpha = 0.5
        r.p.tint = color

        const back = takeRing()
        back.x = x; back.y = y
        back.age = -0.7; back.life = 0.7
        back.from = 620 * P; back.to = 50
        back.alpha = 0.6
        back.p.tint = color

        // And what it brings back: motes travelling the line from THEM to you,
        // which is the direction that says who learned something.
        const n = 14
        for (let i = 0; i < n; i++) {
          const m = takeMote()
          const f = (i + 0.5) / n
          m.cx = x + dx * (1 - f)
          m.cy = y + dy * (1 - f)
          m.ang = 0; m.r0 = 0; m.r1 = 0
          m.h0 = 30; m.h1 = 46
          m.age = -0.75 - f * 0.35
          m.life = 0.5
          m.size = 9 + Math.random() * 6
          m.spin = 0
          m.p.tint = color
        }
        return
      }

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

    summon(x, y, color, P) {
      // THE SIGIL. One circle on the water, turning for the whole banner —
      // the mark pool's discs are exactly this shape, borrowed for a moment
      // that is conjuring rather than condition.
      const k = takeMark()
      k.x = x; k.y = y
      k.age = 0
      k.life = 2.0
      k.size = 320 * P
      k.alpha = 0.34
      k.spin = 1.1
      k.p.tint = color

      // THE GATHERING. Two rings drawn INWARD, staggered — the sea being
      // collected into the circle. Shrinking is the debuff's grammar, but a
      // debuff closes on a victim once; twice in rhythm reads as breathing in.
      for (let i = 0; i < 2; i++) {
        const r = takeRing()
        r.x = x; r.y = y
        r.age = -i * 0.28
        r.life = 0.7
        // 300, not 460: at chase weight the old figure put the outer ring
        // wider than the viewport, which is a screen effect rather than a
        // thing happening to a ship. Seen and pulled in.
        r.from = (300 + i * 90) * P
        r.to = 60
        r.alpha = 0.42
        r.p.tint = color
      }

      // THE HELIX. An ordered climb, not a burst: angles laid in sequence
      // round a double turn, ages staggered by INDEX, all spinning the same
      // way — so the eye reads one spiral winding up out of the circle for
      // the length of the splash.
      const n = Math.round(20 * P)
      for (let i = 0; i < n; i++) {
        const m = takeMote()
        m.cx = x; m.cy = y
        m.ang = (i / n) * Math.PI * 4
        m.r0 = 150
        m.r1 = 40
        m.h0 = 0
        m.h1 = (240 + Math.random() * 160) * P
        m.age = -(i / n) * 0.9
        m.life = 0.9 + Math.random() * 0.4
        m.size = 13 + Math.random() * 10
        m.spin = 2.2
        m.p.tint = color
      }

      if (P >= 1.5) {
        // THE SNAP. White, once, when the circle takes — the same "rarer, not
        // merely bigger" argument the overture makes.
        const r = takeRing()
        r.x = x; r.y = y
        r.age = -0.35
        r.life = 0.32
        r.from = 30; r.to = 380 * P
        r.alpha = 0.8
        r.p.tint = 0xffffff

        // A COUNTER-HELIX, winding the other way. Two spirals crossing is the
        // one thing a plain summon never draws.
        for (let i = 0; i < n; i++) {
          const m = takeMote()
          m.cx = x; m.cy = y
          m.ang = -(i / n) * Math.PI * 4
          m.r0 = 110
          m.r1 = 30
          m.h0 = 0
          m.h1 = (200 + Math.random() * 140) * P
          m.age = -0.2 - (i / n) * 0.9
          m.life = 0.8 + Math.random() * 0.4
          m.size = 11 + Math.random() * 9
          m.spin = -2.2
          m.p.tint = 0xffffff
        }

        // AND THE AFTERGLOW. Embers drifting up around the hull after the
        // banner has gone — the aftermath that makes it a legendary's moment
        // rather than a loud one.
        for (let i = 0; i < 12; i++) {
          const m = takeMote()
          m.cx = x; m.cy = y
          m.ang = Math.random() * Math.PI * 2
          m.r0 = 60 + Math.random() * 120
          m.r1 = 80 + Math.random() * 140
          m.h0 = 10
          m.h1 = 160 + Math.random() * 180
          m.age = -1.2 - Math.random() * 0.8
          m.life = 1.6 + Math.random() * 0.9
          m.size = 9 + Math.random() * 8
          m.spin = (Math.random() - 0.5) * 1.2
          m.p.tint = color
        }
      }
    },

    advance(dt) {
      // Dimmed after dark like everything else, but far less: an ability is a
      // light source in its own right, and the one time the sea should not be
      // deciding how bright a thing is.
      const lit = 1 - dark * 0.25

      // ── THE CONDITIONS THAT ARE HOLDING ─────────────────────────────────
      for (const c of conds) {
        const spec = COND[c.kind] ?? null
        // Faded rather than switched, so a status ENDING is a thing you can
        // watch happen. A condition that blinks off has not told you it lapsed;
        // it has just stopped being there, which is a different sentence.
        c.fade += ((spec ? 1 : 0) - c.fade) * Math.min(1, dt * 6)
        if (c.fade < 0.01) {
          if (c.halo.alpha) c.halo.alpha = 0
          for (const b of c.bits) if (b.alpha) b.alpha = 0
          continue
        }
        c.t += dt
        // Held on the LAST spec while fading out, or a lapsing burn would go
        // out as whatever colour came next.
        const sp = spec ?? COND[1]!
        const rx = c.beam * 0.55
        const ry = c.beam * 0.26

        // The wash on the water under her. Marked turns; everything else
        // breathes in place.
        c.halo.x = c.x
        c.halo.y = c.y
        c.halo.tint = sp.color
        c.halo.rotation += (c.kind === 4 ? 0.5 : 0.06) * dt
        c.halo.scaleX = (rx * 2.1) / 128
        c.halo.scaleY = ((ry * 2.1) / 128) * GROUND
        c.halo.alpha = 0.20 * c.fade * lit * (0.8 + 0.2 * Math.sin(c.t * 1.9))

        for (let i = 0; i < c.bits.length; i++) {
          const b = c.bits[i]
          const sd = c.seed[i]
          const a2 = (i / c.bits.length) * Math.PI * 2 + c.t * (c.kind === 4 ? 0.5 : 0.12)
          // ── THE MANNER IS THE MEANING ─────────────────────────────────
          //
          // Fire RISES and flickers out; ice HANGS, barely moving, which is the
          // only way stillness reads as a state rather than as a bug; a snare
          // drags DOWN to the waterline and stays low. Same twelve particles,
          // three completely different readings.
          const cycle = (c.t * (sp.rise > 0 ? 0.5 : 0.22) + sd) % 1
          const h = sp.rise > 0
            ? cycle * 150                      // up and out
            : sp.rise < 0
            ? 8 + Math.sin(c.t * 1.4 + sd * 6) * 6   // dragged low
            : 46 + Math.sin(c.t * 0.8 + sd * 6) * 12 // hanging
          b.x = c.x + Math.cos(a2) * rx * (0.75 + sd * 0.4)
          b.y = c.y + Math.sin(a2) * ry * (0.75 + sd * 0.4) * GROUND - h / GROUND
          b.tint = sp.color
          const sz = (c.kind === 2 ? 10 : 12) + sd * 7
          b.scaleX = sz / 24
          b.scaleY = sz / 24
          b.alpha = c.fade * lit
            * (sp.rise > 0 ? (1 - cycle) * 0.85 : 0.5 + 0.3 * Math.sin(c.t * 1.6 + sd * 6))
        }
      }

      // ── THE WARDS THAT ARE HOLDING ──────────────────────────────────────
      for (const w of wards) {
        // Faded rather than switched, so a shell that drops still has a frame
        // of being there while its shatter is going off.
        w.fade += ((w.up ? 1 : 0) - w.fade) * Math.min(1, dt * 9)
        if (w.fade < 0.01) {
          if (w.shellA.alpha) { w.shellA.alpha = 0; w.shellB.alpha = 0 }
          for (const o of w.orbit) if (o.alpha) o.alpha = 0
          continue
        }
        w.t += dt

        // ── THE SHIELD IS ON THE SHIP, NOT ON THE SEA ───────────────────
        //
        // The last cut of this was a flat ellipse lying on the water at the
        // hull's waterline — a pool of light beside a ship, reported exactly
        // that way: "the shield is nowhere near the ship". A shield is a
        // thing a hull WEARS, like her glow: so the main shell is a DOME
        // standing up out of the water, centred on the ship's visual middle
        // and sized off her beam, with a faint flat ellipse left at the
        // waterline as its footprint — the wrap and the place it stands.
        //
        // The lift divides by GROUND because this layer lives in the squashed
        // world container: to climb N screen pixels a thing moves N/GROUND in
        // world y — the same arithmetic the orbit lights always used.
        const rx = w.beam * 0.58
        const ryDome = w.beam * 0.46
        const lift = (w.beam * 0.30) / GROUND
        const breathe = 1 + 0.04 * Math.sin(w.t * 1.7)
        const breathe2 = 1 + 0.04 * Math.sin(w.t * 1.7 + 2.1)

        // THE DOME — standing, unsquashed, wrapped round the art.
        w.shellA.x = w.x
        w.shellA.y = w.y - lift
        w.shellA.tint = w.color
        w.shellA.scaleX = (rx * breathe * 2) / 128
        w.shellA.scaleY = (ryDome * breathe * 2) / 128
        w.shellA.alpha = 0.40 * w.fade * lit

        // THE FOOTPRINT — the old flat ellipse, kept faint, so the dome is
        // planted on the water rather than floating in front of it.
        w.shellB.x = w.x
        w.shellB.y = w.y
        w.shellB.tint = w.color
        w.shellB.scaleX = (rx * breathe2 * 2) / 128
        w.shellB.scaleY = ((w.beam * 0.26 * breathe2 * 2) / 128) * GROUND
        w.shellB.alpha = 0.20 * w.fade * lit

        // The lights ride the DOME's rim now — the moving part that stops the
        // whole thing reading as a painted shape.
        for (let i = 0; i < w.orbit.length; i++) {
          const o = w.orbit[i]
          const a2 = (i / w.orbit.length) * Math.PI * 2 + w.t * 0.9
          o.x = w.x + Math.cos(a2) * rx
          o.y = w.y - lift + Math.sin(a2) * ryDome
          o.tint = w.color
          o.scaleX = 13 / 24
          o.scaleY = 13 / 24
          o.alpha = 0.55 * w.fade * lit * (0.6 + 0.4 * Math.sin(w.t * 2.2 + i))
        }
      }

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
