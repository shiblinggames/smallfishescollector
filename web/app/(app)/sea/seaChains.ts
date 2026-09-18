// ── THE BOOM CHAIN ──────────────────────────────────────────────────────────
//
// A harbour gate is two posts and a chain. The posts are rocks (see
// `cof-gatepost-n` / `-s` in raidWaters) and this is the chain: a run of iron
// links strung between them, sagging into the water, with floats holding the
// middle up.
//
// The campaign already said it was there. The node after the gate closes with
// "the lens flares green and the boom-chain drops into the water", so the
// chain existed in the writing and nowhere else, and the gate you fire a
// cannon at was two rocks with open water between them.
//
// ── IT DROPS WHEN THE GATE IS DONE ──────────────────────────────────────────
//
// Cleared, it does exactly what that line says: the links go slack, the whole
// span sinks and fades, and the water is open from then on. That is the only
// state it has, and it is driven from the same cleared-node map the chart uses
// for everything else -- the renderer is told, it does not ask.
//
// ── ON THE PLANE, LIKE EVERYTHING THAT FLOATS ───────────────────────────────
//
// Squashed by GROUND, so the span foreshortens into the distance exactly as
// the water does. A chain drawn at true length would stand up out of the sea.
import type { Container, Sprite, Texture } from 'pixi.js'
import { GROUND } from './islandArt'
import { SPANS, chainSpan, type ChainSpec } from './raidWaters'

/** Links along a span. Enough to read as a chain, few enough to be nothing. */
const LINKS = 26
/** Floats holding the middle of it out of the water. */
const FLOATS = 3
/** How far the middle sags toward the camera, as a fraction of the span. */
const SAG = 0.055
/** Bars across a gate. */
const BARS = 11

let linkTex: Texture | null = null
let floatTex: Texture | null = null
let barTex: Texture | null = null

/** One iron link: a dark oval ring with a bright top edge. */
function linkTexture(PIXI: typeof import('pixi.js')): Texture {
  if (linkTex) return linkTex
  const W = 48, H = 32
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.lineWidth = 7
  g.strokeStyle = '#1b2029'
  g.beginPath(); g.ellipse(W / 2, H / 2, W / 2 - 5, H / 2 - 5, 0, 0, Math.PI * 2); g.stroke()
  // The light only ever catches the upper curve; without this it reads as a
  // flat drawn ring rather than a forged thing with a round section.
  g.lineWidth = 3
  g.strokeStyle = '#6d7b8c'
  g.beginPath(); g.ellipse(W / 2, H / 2 - 1, W / 2 - 6, H / 2 - 6, 0, Math.PI * 1.15, Math.PI * 1.95); g.stroke()
  linkTex = PIXI.Texture.from(c)
  return linkTex
}

/** A float: a tarred barrel riding the surface. */
function floatTexture(PIXI: typeof import('pixi.js')): Texture {
  if (floatTex) return floatTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S * 0.4, S * 0.35, 2, S / 2, S / 2, S / 2)
  grad.addColorStop(0, '#6b5a43')
  grad.addColorStop(0.55, '#3a2f24')
  grad.addColorStop(1, '#1a150f')
  g.fillStyle = grad
  g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 3, S / 2 - 3, 0, 0, Math.PI * 2); g.fill()
  floatTex = PIXI.Texture.from(c)
  return floatTex
}

/** One bar of the gate: banded iron, lit down one edge. */
function barTexture(PIXI: typeof import('pixi.js')): Texture {
  if (barTex) return barTex
  const W = 24, H = 96
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, W, 0)
  grad.addColorStop(0, '#12161d')
  grad.addColorStop(0.32, '#39424f')
  grad.addColorStop(0.5, '#6d7b8c')
  grad.addColorStop(0.7, '#2b323c')
  grad.addColorStop(1, '#0d1117')
  g.fillStyle = grad
  g.fillRect(3, 0, W - 6, H)
  // Two bands, because a bar with no joinery reads as a drawn rectangle.
  g.fillStyle = '#4a5462'
  g.fillRect(0, H * 0.22, W, 7)
  g.fillRect(0, H * 0.7, W, 7)
  barTex = PIXI.Texture.from(c)
  return barTex
}

type Span = {
  spec: ChainSpec
  links: Sprite[]
  floats: Sprite[]
  bars: Sprite[]
  /** 0 shut, 1 fully dropped. Eased toward the cleared flag. */
  open: number
  /**
   * HAS IT EVER BEEN TOLD. The cleared map is not known at construction (the
   * renderer is handed it per frame), so without this a span that is ALREADY
   * open starts shut and eases: a captain who broke this gate a week ago
   * would watch it break again, from the top, on every single page load.
   * The first frame snaps to the truth; every frame after it eases.
   */
  primed: boolean
}

export type Chains = {
  /** On the water, under the hulls. */
  water: Container
  advance(camX: number, camY: number, halfW: number, halfH: number, dt: number, cleared: (node: string) => boolean): void
  night(tint: number): void
  destroy(): void
}

export function makeChains(PIXI: typeof import('pixi.js')): Chains {
  const water: Container = new PIXI.Container()
  const lt = linkTexture(PIXI), ft = floatTexture(PIXI)
  const spans: Span[] = []

  const bt = barTexture(PIXI)
  for (const spec of SPANS) {
    const links: Sprite[] = []
    const floats: Sprite[] = []
    const bars: Sprite[] = []
    // A GATE IS BARS; A BOOM IS LINKS. Only the one it is gets built.
    if (spec.kind === 'gate') {
      for (let i = 0; i < BARS; i++) {
        const sp: Sprite = new PIXI.Sprite(bt)
        sp.anchor.set(0.5)
        bars.push(sp); water.addChild(sp)
      }
    } else for (let i = 0; i < LINKS; i++) {
      const sp: Sprite = new PIXI.Sprite(lt)
      sp.anchor.set(0.5)
      links.push(sp); water.addChild(sp)
    }
    if (spec.kind === 'chain') for (let i = 0; i < FLOATS; i++) {
      const sp: Sprite = new PIXI.Sprite(ft)
      sp.anchor.set(0.5)
      floats.push(sp); water.addChild(sp)
    }
    spans.push({ spec, links, floats, bars, open: 0, primed: false })
  }

  let clock = 0

  return {
    water,
    advance(camX, camY, halfW, halfH, dt, cleared) {
      clock += dt
      for (const span of spans) {
        const ends = chainSpan(span.spec)
        if (!ends) continue
        const { a, b } = ends
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const half = Math.hypot(b.x - a.x, b.y - a.y) / 2
        const near = Math.abs(mx - camX) < halfW + half + 400
          && Math.abs(my - camY) < halfH + half + 400

        // Ease toward its state rather than snapping: the line that describes
        // this says the chain DROPS, and a thing that drops takes a moment.
        // EXCEPT the first time, which is not a change of state, it is finding
        // out what the state has been all along. See `primed`.
        const want = cleared(span.spec.node) ? 1 : 0
        if (!span.primed) { span.primed = true; span.open = want }
        else span.open += Math.max(-dt * 0.7, Math.min(dt * 0.7, want - span.open))

        const vis = near && span.open < 0.995
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ang = Math.atan2(dy * (1 / GROUND), dx)

        // ── A GATE DOES NOT SINK, IT BREAKS ──────────────────────────
        // You put a cannon ball through it, so it comes apart: the bars
        // scatter outward along the span and go, rather than sliding under
        // the way a dropped boom does.
        for (let i = 0; i < span.bars.length; i++) {
          const sp = span.bars[i]
          sp.visible = vis
          if (!vis) continue
          const t = (i + 0.5) / span.bars.length
          // Blown outward from the middle, so the hole opens where the shot
          // went in and the ends are the last to let go.
          const push = (t - 0.5) * span.open * len * 0.5
          sp.x = a.x + dx * t + (dx / len) * push
          sp.y = a.y + dy * t + (dy / len) * push * GROUND
          sp.rotation = ang + span.open * (i % 2 ? 0.9 : -0.9)
          sp.width = 16
          sp.height = 74 * GROUND
          sp.alpha = Math.max(0, 1 - span.open * 1.6)
        }
        for (let i = 0; i < span.links.length; i++) {
          const sp = span.links[i]
          sp.visible = vis
          if (!vis) continue
          const t = i / (span.links.length - 1)
          // A catenary, near enough: the sag is a parabola and nobody has ever
          // measured one off a harbour boom.
          const droop = Math.sin(t * Math.PI) * len * SAG
          // Slack as it opens, then gone under.
          const slack = 1 + span.open * 2.2
          sp.x = a.x + dx * t
          sp.y = a.y + dy * t + (droop * slack + span.open * 90) * GROUND
          sp.rotation = ang + (i % 2 ? Math.PI / 2 : 0)
          const size = 34
          sp.width = size
          sp.height = size * GROUND
          sp.alpha = (1 - span.open) * 0.95
        }
        for (let i = 0; i < span.floats.length; i++) {
          const sp = span.floats[i]
          sp.visible = vis
          if (!vis) continue
          const t = (i + 1) / (span.floats.length + 1)
          const droop = Math.sin(t * Math.PI) * len * SAG
          // They ride the swell even while the chain holds them.
          const bob = Math.sin(clock * 1.4 + i * 2.1) * 4
          sp.x = a.x + dx * t
          sp.y = a.y + dy * t + (droop + bob + span.open * 110) * GROUND
          const size = 46
          sp.width = size
          sp.height = size * GROUND
          sp.alpha = (1 - span.open) * 0.95
        }
      }
    },
    night(tint) { water.tint = tint },
    destroy() { water.destroy({ children: true }) },
  }
}
