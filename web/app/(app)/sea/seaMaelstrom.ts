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
// to strike under the surface, and the hull feels the pull.
//
// ── DRAWN FLAT, THEN LAID DOWN IN PERSPECTIVE ───────────────────────────────
//
// The whole thing is composed flat — a disc, arms turning about its centre —
// into a render texture, and that texture is mapped onto a PERSPECTIVE MESH
// whose corners form a keystone: the near edge wide and low, the far edge
// narrow and high. That is the difference between a decal lying on the water
// and a bowl you are looking into from a deck. The chart's own squash (the
// world container's GROUND) then lies the keystone on the plane like every
// other flat thing, so the two foreshortenings compound the way they would
// on a real sea seen obliquely.
//
// Two textures, not one, because the parts want two blends: the dark parts
// (the storm, the funnel, the hole) composite normally and DARKEN the water;
// the light parts (arms, foam, eye, strikes) composite additively and GLOW.
// A single texture would have to pick one.
//
// ── DARK ON PURPOSE ─────────────────────────────────────────────────────────
//
// The first cut was neon: broad saturated arms filling the screen. A door to
// the endgame should read as a hole in the sea, not a light show. So the
// funnel is nearly black, the arms are deep and thin, and the brightness is
// saved for two things — the core in the eye, and the strike — so that when
// the lightning comes it comes out of the dark.
//
// Culled by camera distance: a maelstrom nobody can see renders nothing, not
// even its texture.

import type { Container, Particle, ParticleContainer, Renderer, RenderTexture, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { MAELSTROMS, type Maelstrom } from './raidWaters'

type Theme = {
  arm: number; mid: number; wisp: number; core: number; eye: number; foam: number; spirit: number; strike: number
  /** Arm rotation at rest, radians per second. */
  speed: number
  /** Which way the theme's motes go: up out of the eye, or down into it. */
  spirits: 'rise' | 'sink'
  /** The strike's character: a hard flash, or a slow pulse. */
  strikeKind: 'flash' | 'pulse'
}

const THEMES: Record<Maelstrom['id'], Theme> = {
  // The art: deep teal over black. Cold. The light is in the eye and in the
  // lightning, and nowhere else.
  davy: {
    arm: 0x156f6c, mid: 0x1f918c, wisp: 0x5fc9c6, core: 0xa6eef0, eye: 0x1a7f7a, foam: 0x8fd6d8,
    spirit: 0x9cf0ff, strike: 0x9af4ff, speed: 0.5, spirits: 'rise', strikeKind: 'flash',
  },
  // Finleone's ghost: drowned green gone nearly to black, verdigris in the
  // arms, tarnished gold sinking.
  don: {
    arm: 0x1f4a3a, mid: 0x2f6a52, wisp: 0x7fb098, core: 0xd8e6dc, eye: 0x275c46, foam: 0x93b9a5,
    spirit: 0xd6b25c, strike: 0xd9c47c, speed: 0.4, spirits: 'sink', strikeKind: 'pulse',
  },
}

/** The flat composition's own scale: the disc's radius in texture pixels, in
 *  a 512 texture. Everything flat is sized off this and mapped to the world
 *  radius by the mesh. */
const TEX = 512
const R = 200

let armsTex: Texture | null = null
let midTex: Texture | null = null
let wispTex: Texture | null = null
let discTex: Texture | null = null
let holeTex: Texture | null = null
let moteTex: Texture | null = null

/** A logarithmic spiral with `arms` bands, white, thin and hot at the eye,
 *  broad and soft at the rim, fading at both ends. */
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
        g.strokeStyle = 'rgba(255,255,255,' + (0.12 + 0.7 * fade).toFixed(3) + ')'
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

const FOAM_N = 120
const SPIRIT_N = 40

/**
 * THE KEYSTONE, in units of the world radius. The flat texture spans 2.4R
 * across, so its half-extent in the world is 1.2r; the far edge is drawn at
 * 0.72 of that width and pulled up to 0.8 of that height, the near edge at
 * full width and pushed down to 1.05. A disc seen from a deck, not from above.
 */
const FAR_W = 0.72, FAR_H = 0.80
const NEAR_W = 1.0, NEAR_H = 1.05

export function makeMaelstroms(PIXI: typeof import('pixi.js'), renderer: Renderer): Maelstroms {
  const view: Container = new PIXI.Container()
  view.eventMode = 'none'

  armsTex ??= spiralTexture(PIXI, 3, 1.25, 26)
  midTex ??= spiralTexture(PIXI, 4, 1.7, 13)
  wispTex ??= spiralTexture(PIXI, 6, 2.4, 7)
  discTex ??= radial(PIXI, [[0, 'rgba(255,255,255,0.95)'], [0.4, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']])
  holeTex ??= radial(PIXI, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,0)']])
  moteTex ??= radial(PIXI, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 32)

  type Foam = { p: Particle; ang: number; r: number; size: number }
  type Spirit = { p: Particle; ang: number; r: number; h: number; age: number; life: number; size: number }
  type One = {
    m: Maelstrom; th: Theme
    node: Container
    flatDark: Container; flatLight: Container
    rtDark: RenderTexture; rtLight: RenderTexture
    storm: Sprite; funnel: Sprite; hole: Sprite
    arms: Sprite; mid: Sprite; wisps: Sprite; eye: Sprite; core: Sprite; strike: Sprite
    foam: Foam[]; spirits: Spirit[]
    seen: boolean
    nextStrike: number; strikeLeft: number
  }

  const sprite = (tex: Texture, size: number, tint: number, alpha: number): Sprite => {
    const s: Sprite = new PIXI.Sprite(tex)
    s.anchor.set(0.5)
    s.width = size; s.height = size
    s.tint = tint
    s.alpha = alpha
    return s
  }

  const ones: One[] = MAELSTROMS.map(m => {
    const th = THEMES[m.id]
    const node: Container = new PIXI.Container()
    node.position.set(m.x, m.y)
    node.visible = false

    // ── THE FLAT COMPOSITION, in texture space, centred at 256,256 ─────
    const flatDark: Container = new PIXI.Container()
    flatDark.position.set(TEX / 2, TEX / 2)
    const storm = sprite(holeTex!, R * 2.4, 0x000000, 0)
    const funnel = sprite(holeTex!, R * 2.1, 0x000000, 0.7)
    const hole = sprite(holeTex!, R * 0.5, 0x000000, 0.96)
    flatDark.addChild(storm, funnel, hole)

    const flatLight: Container = new PIXI.Container()
    flatLight.position.set(TEX / 2, TEX / 2)
    const arms = sprite(armsTex!, R * 2.0, th.arm, 0.3)
    const mid = sprite(midTex!, R * 1.6, th.mid, 0.22)
    const wisps = sprite(wispTex!, R * 1.2, th.wisp, 0.2)
    flatLight.addChild(arms, mid, wisps)

    const foamLayer: ParticleContainer = new PIXI.ParticleContainer({
      dynamicProperties: { position: true, rotation: false, vertex: true, color: true },
    })
    flatLight.addChild(foamLayer)
    const foam: Foam[] = []
    for (let i = 0; i < FOAM_N; i++) {
      const p: Particle = new PIXI.Particle({ texture: moteTex! })
      p.anchorX = 0.5; p.anchorY = 0.5
      p.tint = th.foam
      foamLayer.addParticle(p)
      foam.push({ p, ang: Math.random() * Math.PI * 2, r: R * (0.3 + Math.random() * 0.75), size: 3 + Math.random() * 6 })
    }

    const eye = sprite(discTex!, R * 0.7, th.eye, 0.35)
    const core = sprite(discTex!, R * 0.24, th.core, 0.3)
    const strike = sprite(discTex!, R * 1.8, th.strike, 0)
    flatLight.addChild(eye, core, strike)

    const rtDark = PIXI.RenderTexture.create({ width: TEX, height: TEX })
    const rtLight = PIXI.RenderTexture.create({ width: TEX, height: TEX })

    // ── THE KEYSTONES, in the world ────────────────────────────────────
    const e = m.r * 1.2
    const corners = {
      x0: -e * FAR_W, y0: -e * FAR_H, x1: e * FAR_W, y1: -e * FAR_H,
      x2: e * NEAR_W, y2: e * NEAR_H, x3: -e * NEAR_W, y3: e * NEAR_H,
    }
    const meshDark = new PIXI.PerspectiveMesh({ texture: rtDark, verticesX: 12, verticesY: 12, ...corners })
    const meshLight = new PIXI.PerspectiveMesh({ texture: rtLight, verticesX: 12, verticesY: 12, ...corners })
    meshLight.blendMode = 'add'
    node.addChild(meshDark, meshLight)

    // ── THE SPIRITS live in the world, above the water, in perspective ──
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
      spirits.push({ p, ang: 0, r: 0, h: 0, age: Math.random() * 3, life: 2.2 + Math.random() * 2.2, size: 8 + Math.random() * 12 })
    }

    view.addChild(node)
    return {
      m, th, node, flatDark, flatLight, rtDark, rtLight,
      storm, funnel, hole, arms, mid, wisps, eye, core, strike,
      foam, spirits, seen: false,
      nextStrike: 2 + Math.random() * 3, strikeLeft: 0,
    }
  })

  /** A flat point (in world units about the eye) laid onto the keystone. */
  const keystone = (fx: number, fy: number, r: number): [number, number] => {
    const e = r * 1.2
    const v = (fy / e + 1) / 2 // 0 at the far edge, 1 at the near
    const w = FAR_W + (NEAR_W - FAR_W) * Math.max(0, Math.min(1, v))
    const y = fy < 0 ? fy * FAR_H : fy * NEAR_H
    return [fx * w, y]
  }

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
        const d = Math.hypot(m.x - camX, m.y - camY)
        const g = Math.max(0, Math.min(1, 1 - (d - m.r) / (m.r * 1.5)))
        const gg = g * g

        // THE SEA GOES DARK AROUND IT as you come.
        o.storm.alpha = 0.75 * gg
        o.storm.scale.set((R * (2.4 + 0.5 * gg) / 256))

        // THE ARMS TURN, inner faster than outer, and all of them faster the
        // nearer you are.
        const spd = th.speed * (1 + 0.9 * gg)
        o.arms.rotation += dt * spd
        o.mid.rotation -= dt * spd * 1.35
        o.wisps.rotation += dt * spd * 2.2
        const breathe = 1 + 0.035 * Math.sin(t * 0.9)
        o.funnel.scale.set((R * 2.1 / 256) * breathe)
        o.funnel.alpha = 0.7 + 0.22 * gg
        o.arms.alpha = (0.26 + 0.22 * gg) * lit
        o.mid.alpha = (0.2 + 0.18 * gg) * lit
        o.wisps.alpha = (0.18 + 0.26 * gg + 0.05 * Math.sin(t * 1.4 + 1)) * lit

        // THE EYE BEATS, faster and harder the closer you stand.
        const beat = Math.sin(t * (1.6 + 2.4 * gg))
        o.eye.alpha = (0.28 + 0.15 * beat + 0.2 * gg) * lit
        o.core.alpha = (0.25 + 0.3 * Math.max(0, beat) + 0.3 * gg) * lit
        o.core.scale.set((R * 0.24 / 256) * (1 + 0.25 * Math.max(0, beat)))

        // ── THE STRIKE ──────────────────────────────────────────────────
        o.nextStrike -= dt * (0.4 + 1.6 * gg)
        if (o.nextStrike <= 0 && g > 0.05) {
          o.strikeLeft = th.strikeKind === 'flash' ? 0.28 : 1.4
          o.nextStrike = th.strikeKind === 'flash' ? 1.6 + Math.random() * 3.4 : 2.4 + Math.random() * 2.6
        }
        if (o.strikeLeft > 0) {
          o.strikeLeft -= dt
          const total = th.strikeKind === 'flash' ? 0.28 : 1.4
          const u = 1 - o.strikeLeft / total
          const env = th.strikeKind === 'flash'
            ? (u < 0.15 ? u / 0.15 : Math.pow(1 - (u - 0.15) / 0.85, 2.2))
            : Math.sin(u * Math.PI)
          o.strike.alpha = env * (th.strikeKind === 'flash' ? 0.85 : 0.4) * (0.5 + 0.5 * g) * lit
          o.strike.scale.set((R * (th.strikeKind === 'flash' ? 1.8 : 1.4) / 256) * (1 + 0.3 * u))
        } else if (o.strike.alpha) {
          o.strike.alpha = 0
        }

        // THE FOAM, spiralling in, whipping as the radius falls.
        for (const f of o.foam) {
          const k = R / Math.max(f.r, 12)
          f.ang += dt * spd * 1.4 * k
          f.r -= dt * (6 + 22 * (1 - f.r / R)) * (1 + 0.6 * gg)
          if (f.r < R * 0.2) { f.r = R * (0.94 + Math.random() * 0.12); f.ang = Math.random() * Math.PI * 2 }
          const near = 1 - f.r / R
          f.p.x = Math.cos(f.ang) * f.r
          f.p.y = Math.sin(f.ang) * f.r
          const s = f.size * (0.55 + 0.7 * near)
          f.p.scaleX = s / 32; f.p.scaleY = s / 32
          f.p.alpha = (0.14 + 0.5 * near) * (0.7 + 0.3 * gg) * lit
        }

        // ── THE FLAT PICTURE, PAINTED ────────────────────────────────────
        renderer.render({ container: o.flatDark, target: o.rtDark, clear: true })
        renderer.render({ container: o.flatLight, target: o.rtLight, clear: true })

        // THE SPIRITS, in the world, laid on the keystone so they belong to
        // the bowl they rise from or fall into.
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
            s.h = u * u * (220 + 180 * gg)
            s.p.alpha = Math.sin(u * Math.PI) * (0.45 + 0.35 * gg) * lit
          } else {
            const k = m.r / Math.max(s.r, 50)
            s.ang += dt * spd * 1.6 * k
            s.r -= dt * m.r * 0.28
            s.h = (1 - u) * 36
            s.p.alpha = (0.25 + 0.55 * Math.max(0, Math.sin(t * 7 + s.ang * 3))) * Math.sin(u * Math.PI) * lit
          }
          const [px, py] = keystone(Math.cos(s.ang) * s.r, Math.sin(s.ang) * s.r, m.r)
          s.p.x = px
          // Height is a screen measurement inside a squashed layer.
          s.p.y = py - s.h / GROUND
          s.p.scaleX = s.size / 32; s.p.scaleY = s.size / 32
        }
      }
    },

    destroy() {
      for (const o of ones) {
        o.rtDark.destroy(true); o.rtLight.destroy(true)
        o.flatDark.destroy({ children: true }); o.flatLight.destroy({ children: true })
      }
      view.destroy({ children: true })
    },
  }
}
