// ── THE TWO MAELSTROMS ──────────────────────────────────────────────────────
//
// The gauntlets' doors, on the water. Two whirlpools in the junction north of
// the Wargate: Davy Jones' to the north-west, before the mouths of chapters I
// and II, and the Don's to the north-east, before III and IV. Each is the
// gauntlet it leads to, drawn as weather: the Davy Jones Gauntlet's own art is
// a teal maelstrom with drowned ghosts spiralling into a black eye, and this is
// that picture standing in the sea. The Don's is the same object seen through
// his palette, the drowned green of Finleone's ghost with tarnished gold going
// down the drain.
//
// THESE ARE ENDGAME, AND THEY ARE BUILT TO BE APPROACHED. Everything here has
// a quiet state and a roused one, and the dial between them is how close the
// camera is. From across the junction a maelstrom is a dark turning stain on
// the water. Come within two radii and the sea around it goes dark, the arms
// brighten and quicken, the eye starts to beat, the theme's own light begins
// to strike under the surface, and the hull feels the pull. Standing at the
// rim it is the loudest thing on the chart.
//
// ── HOW IT IS DRAWN ─────────────────────────────────────────────────────────
//
//   THE STORM     a wide multiply vignette, three radii across, that deepens
//                 as you come. The sea around the door is wrong before the door
//                 itself is close.
//   THE FUNNEL    a dark multiply disc, breathing, the water visibly lower.
//   THE ARMS      three baked spiral textures at three speeds, additive and
//                 tinted: outer broad and slow, middle, inner fine and fast.
//                 Three speeds is depth; one speed is a spinning decal.
//   THE EYE       a soft glow beating over a hard black hole.
//   THE FOAM      particles riding the arms inward on a logarithmic spiral,
//                 whipping as the radius falls, respawning at the rim.
//   THE SPIRITS   the theme's own motes. Davy's rise out of the eye as ghost
//                 lights; the Don's are pulled down into it as gold, glinting.
//   THE STRIKES   the theme's light, at intervals that shorten as you near:
//                 Davy's is lightning under the water, a hard cyan flash that
//                 lights the whole funnel; the Don's is a slow gold pulse, a
//                 vault door breathing.
//
// All of it lies on the plane, so the world's squash makes it an oval like
// every flat thing on this chart. Culled by camera distance: a maelstrom
// nobody can see does no work.

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { MAELSTROMS, type Maelstrom } from './raidWaters'

type Theme = {
  arm: number; wisp: number; core: number; eye: number; foam: number; spirit: number; strike: number
  /** Arm rotation at rest, radians per second. */
  speed: number
  /** Which way the theme's motes go: up out of the eye, or down into it. */
  spirits: 'rise' | 'sink'
  /** The strike's character: a hard flash, or a slow pulse. */
  strike: 'flash' | 'pulse'
}

const THEMES: Record<Maelstrom['id'], Theme> = {
  // The art: electric teal over black, cyan-white foam, ghost light coming up.
  davy: {
    arm: 0x2fc9c0, wisp: 0x9af0ff, core: 0xd6fbff, eye: 0x27b3ab, foam: 0xd8fbff, spirit: 0xbdf7ff,
    strike: 0xa0f4ff, speed: 0.5, spirits: 'rise', strike: 'flash',
  },
  // Finleone's ghost: drowned sea-green, pale verdigris, tarnished gold sinking.
  don: {
    arm: 0x62a688, wisp: 0xd6eadf, core: 0xf0ede8, eye: 0x3a7d62, foam: 0xcfe6d8, spirit: 0xe6c66e,
    strike: 0xe9d08a, speed: 0.4, spirits: 'sink', strike: 'pulse',
  },
}

let armsTex: Texture | null = null
let midTex: Texture | null = null
let wispTex: Texture | null = null
let discTex: Texture | null = null
let holeTex: Texture | null = null
let moteTex: Texture | null = null

/** A logarithmic spiral with `arms` bands, white, thin and hot at the eye,
 *  broad and soft at the rim, fading at both ends so it composites as light
 *  on water rather than as a sticker. */
function spiralTexture(PIXI: typeof import('pixi.js'), arms: number, turns: number, width: number): Texture {
  const S = 512
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2, cy = S / 2
  g.lineCap = 'round'
  for (let a = 0; a < arms; a++) {
    const off = (a / arms) * Math.PI * 2
    let px = 0, py = 0
    for (let i = 0; i <= 160; i++) {
      const t = i / 160
      const th = off + t * Math.PI * 2 * turns
      const r = 6 + Math.pow(t, 0.85) * (S / 2 - 10)
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r
      if (i > 0) {
        const fade = Math.sin(t * Math.PI)
        g.strokeStyle = 'rgba(255,255,255,' + (0.14 + 0.72 * fade).toFixed(3) + ')'
        g.lineWidth = width * (0.3 + t * 1.2)
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke()
      }
      px = x; py = y
    }
  }
  const out = document.createElement('canvas')
  out.width = S; out.height = S
  const og = out.getContext('2d')!
  og.filter = 'blur(3px)'
  og.drawImage(c, 0, 0)
  return PIXI.Texture.from(out)
}

function radial(PIXI: typeof import('pixi.js'), stops: [number, string][], size = 256): Texture {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [p, col] of stops) grad.addColorStop(p, col)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return PIXI.Texture.from(c)
}

export type Maelstroms = {
  view: Container
  advance(t: number, dt: number, camX: number, camY: number, halfW: number, halfH: number): void
  night(dark: number): void
  destroy(): void
}

const FOAM_N = 130
const SPIRIT_N = 44

export function makeMaelstroms(PIXI: typeof import('pixi.js')): Maelstroms {
  const view: Container = new PIXI.Container()
  view.eventMode = 'none'

  armsTex ??= spiralTexture(PIXI, 3, 1.25, 30)
  midTex ??= spiralTexture(PIXI, 4, 1.7, 16)
  wispTex ??= spiralTexture(PIXI, 6, 2.4, 8)
  discTex ??= radial(PIXI, [[0, 'rgba(255,255,255,0.95)'], [0.4, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']])
  holeTex ??= radial(PIXI, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,0)']])
  moteTex ??= radial(PIXI, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 32)

  type Foam = { p: Particle; ang: number; r: number; size: number }
  type Spirit = { p: Particle; ang: number; r: number; h: number; age: number; life: number; size: number }
  type One = {
    m: Maelstrom; th: Theme
    node: Container
    storm: Sprite; funnel: Sprite; arms: Sprite; mid: Sprite; wisps: Sprite; eye: Sprite; core: Sprite; hole: Sprite
    strike: Sprite
    foam: Foam[]; spirits: Spirit[]
    seen: boolean
    /** When the next strike lands, and how much of the current one is left. */
    nextStrike: number; strikeLeft: number
  }

  const sprite = (tex: Texture, size: number, tint: number, alpha: number, blend: 'add' | 'multiply' | 'normal'): Sprite => {
    const s: Sprite = new PIXI.Sprite(tex)
    s.anchor.set(0.5)
    s.width = size; s.height = size
    s.tint = tint
    s.alpha = alpha
    s.blendMode = blend
    return s
  }

  const ones: One[] = MAELSTROMS.map(m => {
    const th = THEMES[m.id]
    const node: Container = new PIXI.Container()
    node.position.set(m.x, m.y)
    node.visible = false

    // Bottom to top: the storm on the sea, the funnel in it, the arms over
    // that, foam riding the arms, the hole, the light in the hole, the strike
    // over everything, and the spirits above the water.
    const storm = sprite(holeTex!, m.r * 3.2, 0x000000, 0, 'multiply')
    const funnel = sprite(holeTex!, m.r * 2.3, 0x000000, 0.6, 'multiply')
    const arms = sprite(armsTex!, m.r * 2.1, th.arm, 0.45, 'add')
    const mid = sprite(midTex!, m.r * 1.7, th.wisp, 0.3, 'add')
    const wisps = sprite(wispTex!, m.r * 1.3, th.core, 0.28, 'add')
    node.addChild(storm, funnel, arms, mid, wisps)

    const foamLayer: ParticleContainer = new PIXI.ParticleContainer({
      dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
    })
    foamLayer.blendMode = 'add'
    node.addChild(foamLayer)
    const foam: Foam[] = []
    for (let i = 0; i < FOAM_N; i++) {
      const p: Particle = new PIXI.Particle({ texture: moteTex! })
      p.anchorX = 0.5; p.anchorY = 0.5
      p.tint = th.foam
      foamLayer.addParticle(p)
      foam.push({ p, ang: Math.random() * Math.PI * 2, r: m.r * (0.3 + Math.random() * 0.78), size: 8 + Math.random() * 14 })
    }

    const hole = sprite(holeTex!, m.r * 0.52, 0xffffff, 0.96, 'normal')
    const eye = sprite(discTex!, m.r * 0.72, th.eye, 0.5, 'add')
    const core = sprite(discTex!, m.r * 0.26, th.core, 0.35, 'add')
    const strike = sprite(discTex!, m.r * 1.9, th.strike, 0, 'add')
    node.addChild(hole, eye, core, strike)

    const spiritLayer: ParticleContainer = new PIXI.ParticleContainer({
      dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
    })
    spiritLayer.blendMode = 'add'
    node.addChild(spiritLayer)
    const spirits: Spirit[] = []
    for (let i = 0; i < SPIRIT_N; i++) {
      const p: Particle = new PIXI.Particle({ texture: moteTex! })
      p.anchorX = 0.5; p.anchorY = 0.5; p.alpha = 0
      p.tint = th.spirit
      spiritLayer.addParticle(p)
      spirits.push({ p, ang: 0, r: 0, h: 0, age: Math.random() * 3, life: 2.2 + Math.random() * 2.2, size: 9 + Math.random() * 15 })
    }

    view.addChild(node)
    return {
      m, th, node, storm, funnel, arms, mid, wisps, eye, core, hole, strike, foam, spirits, seen: false,
      nextStrike: 2 + Math.random() * 3, strikeLeft: 0,
    }
  })

  let dark = 0

  return {
    view,
    night(d) { dark = d },

    advance(t, dt, camX, camY, halfW, halfH) {
      const lit = 1 - dark * 0.3
      for (const o of ones) {
        const { m, th } = o
        const on = Math.abs(m.x - camX) < halfW + m.r * 1.8
          && Math.abs(m.y - camY) < halfH + m.r * 1.8
        if (on !== o.seen) { o.node.visible = on; o.seen = on }
        if (!on) continue

        // ── HOW ROUSED IT IS ────────────────────────────────────────────
        // The camera follows the boat, so its distance is hers. Zero out
        // beyond two and a half radii, one at the rim, and everything below
        // reads this dial: the door is quiet from across the junction and
        // is the loudest thing on the chart when you are standing at it.
        const d = Math.hypot(m.x - camX, m.y - camY)
        const g = Math.max(0, Math.min(1, 1 - (d - m.r) / (m.r * 1.5)))
        const gg = g * g

        // THE SEA GOES DARK AROUND IT as you come.
        o.storm.alpha = 0.55 * gg
        o.storm.scale.set((m.r * (3.2 + 0.8 * gg) / 256))

        // THE ARMS TURN, inner faster than outer, and all of them faster the
        // nearer you are: that ratio is the sense of water being pulled down
        // rather than round, and the quickening is the door noticing you.
        const spd = th.speed * (1 + 0.9 * gg)
        o.arms.rotation += dt * spd
        o.mid.rotation -= dt * spd * 1.35
        o.wisps.rotation += dt * spd * 2.2
        const breathe = 1 + 0.035 * Math.sin(t * 0.9)
        o.funnel.scale.set((m.r * 2.3 / 256) * breathe)
        o.funnel.alpha = (0.6 + 0.25 * gg) * lit
        o.arms.alpha = (0.42 + 0.3 * gg) * lit
        o.mid.alpha = (0.28 + 0.22 * gg) * lit
        o.wisps.alpha = (0.26 + 0.3 * gg + 0.06 * Math.sin(t * 1.4 + 1)) * lit

        // THE EYE BEATS, faster and harder the closer you stand.
        const beat = Math.sin(t * (1.6 + 2.4 * gg))
        o.eye.alpha = (0.4 + 0.2 * beat + 0.25 * gg) * lit
        o.core.alpha = (0.3 + 0.3 * Math.max(0, beat) + 0.3 * gg) * lit
        o.core.scale.set((m.r * 0.26 / 256) * (1 + 0.25 * Math.max(0, beat)))

        // ── THE STRIKE ──────────────────────────────────────────────────
        // Davy's is lightning under the water: a hard flash that lights the
        // whole funnel cyan for a quarter second. The Don's is a vault door
        // breathing: a slow gold pulse. Both come oftener the nearer you are,
        // and not at all from far away, so the approach is the thing that
        // wakes them.
        o.nextStrike -= dt * (0.4 + 1.6 * gg)
        if (o.nextStrike <= 0 && g > 0.05) {
          o.strikeLeft = th.strike === 'flash' ? 0.28 : 1.4
          o.nextStrike = th.strike === 'flash' ? 1.6 + Math.random() * 3.4 : 2.4 + Math.random() * 2.6
        }
        if (o.strikeLeft > 0) {
          o.strikeLeft -= dt
          const total = th.strike === 'flash' ? 0.28 : 1.4
          const u = 1 - o.strikeLeft / total
          const env = th.strike === 'flash'
            ? (u < 0.15 ? u / 0.15 : Math.pow(1 - (u - 0.15) / 0.85, 2.2))
            : Math.sin(u * Math.PI)
          o.strike.alpha = env * (th.strike === 'flash' ? 0.8 : 0.42) * (0.5 + 0.5 * g) * lit
          o.strike.scale.set((m.r * (th.strike === 'flash' ? 1.9 : 1.5) / 256) * (1 + 0.3 * u))
        } else if (o.strike.alpha) {
          o.strike.alpha = 0
        }

        // THE FOAM, spiralling in. Angular speed rises as the radius falls,
        // which is what a real vortex does and what makes the inner ring
        // whip while the rim drifts.
        for (const f of o.foam) {
          const k = m.r / Math.max(f.r, 40)
          f.ang += dt * spd * 1.4 * k
          f.r -= dt * (24 + 90 * (1 - f.r / m.r)) * (1 + 0.6 * gg)
          if (f.r < m.r * 0.2) { f.r = m.r * (0.94 + Math.random() * 0.14); f.ang = Math.random() * Math.PI * 2 }
          const near = 1 - f.r / m.r
          f.p.x = Math.cos(f.ang) * f.r
          f.p.y = Math.sin(f.ang) * f.r
          const s = f.size * (0.55 + 0.7 * near)
          f.p.scaleX = s / 32; f.p.scaleY = s / 32
          f.p.alpha = (0.22 + 0.6 * near) * (0.7 + 0.3 * gg) * lit
        }

        // THE SPIRITS. Davy's come UP out of the eye and drift off along the
        // arms; the Don's are pulled DOWN into it off the rim, glinting like
        // coins as they go.
        for (const s of o.spirits) {
          s.age += dt * (1 + 0.5 * gg)
          if (s.age >= s.life) {
            s.age = 0
            s.life = 2.2 + Math.random() * 2.2
            s.ang = Math.random() * Math.PI * 2
            s.r = th.spirits === 'rise' ? m.r * (0.08 + Math.random() * 0.2) : m.r * (0.95 + Math.random() * 0.2)
            s.h = 0
          }
          const u = s.age / s.life
          if (th.spirits === 'rise') {
            s.ang += dt * 0.9
            s.r += dt * m.r * 0.2
            s.h = u * u * (260 + 200 * gg)
            s.p.alpha = Math.sin(u * Math.PI) * (0.55 + 0.35 * gg) * lit
          } else {
            const k = m.r / Math.max(s.r, 50)
            s.ang += dt * spd * 1.6 * k
            s.r -= dt * m.r * 0.28
            s.h = (1 - u) * 40
            s.p.alpha = (0.3 + 0.6 * Math.max(0, Math.sin(t * 7 + s.ang * 3))) * Math.sin(u * Math.PI) * lit
          }
          s.p.x = Math.cos(s.ang) * s.r
          // Height is a screen measurement inside a squashed layer.
          s.p.y = Math.sin(s.ang) * s.r - s.h / GROUND
          s.p.scaleX = s.size / 32; s.p.scaleY = s.size / 32
        }
      }
    },

    destroy() { view.destroy({ children: true }) },
  }
}
