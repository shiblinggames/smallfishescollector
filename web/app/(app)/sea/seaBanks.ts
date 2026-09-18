// ── A FOG BANK, WHICH IS A PLACE ────────────────────────────────────────────
//
// The Cartographer's water is described, in his own raid and in three nodes
// around it, as a gray wall: "the fog thickens until sea and sky blur into dull
// gray", "the galleon waiting in the fog", his crew sail the Sounding Fog for
// cover. The chart drew none of it. You sailed up to him through ordinary
// bright water and the fog existed only in the words.
//
// ── IT IS NOT THE FOG OF WAR ────────────────────────────────────────────────
//
// `seaFog` is the unexplored chart, and it BURNS OFF and never comes back: it
// is a record of where you have been. This does not move and does not clear,
// because it is weather sitting on one stretch of sea. A captain who has
// charted every inch of this bay still sails into the murk here, which is the
// whole point of the place.
//
// ── AND IT IS NOT A SQUALL ──────────────────────────────────────────────────
//
// `seaSqualls` is the other weather-as-a-place, and it MULTIPLIES the water
// down: a squall is a cloud, it subtracts light, and it rains. Fog does the
// opposite. It ADDS a pale veil between the camera and the sea, which is why
// distance disappears into it rather than darkening. Same idea, inverted, and
// it is why this could not just be a pale squall.
//
// ── TWO HEIGHTS, LIKE THE CLOUDS ────────────────────────────────────────────
//
// The LYING fog is on the plane with everything else that lies on it, squashed
// by GROUND, so it foreshortens into the distance like the water does. The
// DRIFTING fog is in the air on the stage, unsquashed and slow, so it passes
// between the camera and the hulls. One of them alone reads as a filter; the
// two together read as being inside weather.
import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { FOG_BANKS, bankAt, type FogBank } from './raidWaters'

/** Soft pale blobs per bank, lying on the water. */
const LYING = 7
/** And drifting through the air in front of it. Fewer, bigger, slower. */
const DRIFTING = 4

let bankTex: Texture | null = null

/** One soft round puff. All of it is falloff: fog has no edge anywhere. */
function bankTexture(PIXI: typeof import('pixi.js')): Texture {
  if (bankTex) return bankTex
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0.00, 'rgba(255,255,255,0.72)')
  grad.addColorStop(0.40, 'rgba(255,255,255,0.46)')
  grad.addColorStop(0.74, 'rgba(255,255,255,0.16)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  bankTex = PIXI.Texture.from(c)
  return bankTex
}

type Puff = {
  sp: Sprite
  /** Where it sits in the bank, before drift. */
  ox: number
  oy: number
  /** Its own slow clock, so no two puffs ever breathe together. */
  per: number
  phase: number
  amp: number
  base: number
}

export type Banks = {
  /** The fog lying on the water, under the hulls. */
  water: Container
  /** The fog drifting in front of them. */
  air: Container
  advance(camX: number, camY: number, halfW: number, halfH: number, dt: number): void
  night(tint: number): void
  destroy(): void
}

export function makeBanks(PIXI: typeof import('pixi.js')): Banks {
  const water: Container = new PIXI.Container()
  const air: Container = new PIXI.Container()
  // SCREEN, not multiply. Fog is light scattered back at you; it lifts the
  // blacks instead of crushing them, and a hull inside it goes pale rather
  // than dark. `screen` is the one blend that says that.
  water.blendMode = 'screen'
  air.blendMode = 'screen'

  const tex = bankTexture(PIXI)
  const puffs: { bank: FogBank; lying: Puff[]; drifting: Puff[] }[] = []

  // Deterministic layout: a bank looks the same every time you sail into it,
  // which is what makes it a place rather than an effect.
  const rnd = (n: number) => {
    const x = Math.sin(n * 127.1) * 43758.5453
    return x - Math.floor(x)
  }

  for (const bank of FOG_BANKS) {
    const lying: Puff[] = []
    const drifting: Puff[] = []
    for (let i = 0; i < LYING + DRIFTING; i++) {
      const inAir = i >= LYING
      const s = i * 7 + bank.id.length
      const a = rnd(s) * Math.PI * 2
      const rr = Math.sqrt(rnd(s + 1)) * bank.r * (inAir ? 0.8 : 1)
      const sp: Sprite = new PIXI.Sprite(tex)
      sp.anchor.set(0.5)
      const size = bank.r * (inAir ? 1.5 + rnd(s + 2) * 0.7 : 0.9 + rnd(s + 3) * 0.7)
      sp.width = size
      sp.height = size * (inAir ? 0.62 : GROUND)
      const p: Puff = {
        sp,
        ox: Math.cos(a) * rr,
        oy: Math.sin(a) * rr * GROUND,
        per: (inAir ? 26 : 17) + rnd(s + 4) * 14,
        phase: rnd(s + 5) * Math.PI * 2,
        amp: bank.r * (inAir ? 0.3 : 0.16),
        base: bank.density * (inAir ? 0.5 : 0.85) * (0.7 + rnd(s + 6) * 0.5),
      }
      ;(inAir ? air : water).addChild(sp)
      ;(inAir ? drifting : lying).push(p)
    }
    puffs.push({ bank, lying, drifting })
  }

  let clock = 0

  return {
    water,
    air,
    advance(camX, camY, halfW, halfH, dt) {
      clock += dt
      for (const { bank, lying, drifting } of puffs) {
        const at = bankAt(bank)
        if (!at) continue
        // CULLED AS ONE. A bank is a single place; there is no point testing
        // eleven puffs against the camera when they share a centre.
        const near = Math.abs(at.x - camX) < halfW + bank.r * 2.4
          && Math.abs(at.y - camY) < halfH + bank.r * 2.4
        for (const p of [...lying, ...drifting]) {
          p.sp.visible = near
          if (!near) continue
          // Drift is a slow lissajous, never a loop you can see close.
          const t = clock / p.per + p.phase
          p.sp.x = at.x + p.ox + Math.cos(t) * p.amp
          p.sp.y = at.y + p.oy + Math.sin(t * 0.73) * p.amp * GROUND
          // And it breathes, so the density is never quite the same twice.
          p.sp.alpha = p.base * (0.82 + 0.18 * Math.sin(t * 1.31))
        }
      }
    },
    night(tint) {
      // Fog at night is lit by whatever light there is, so it takes the same
      // tint the rest of the sea does rather than staying white.
      water.tint = tint
      air.tint = tint
    },
    destroy() {
      water.destroy({ children: true })
      air.destroy({ children: true })
    },
  }
}
