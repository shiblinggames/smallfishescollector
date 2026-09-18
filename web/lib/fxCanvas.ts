// ── THE 2D-CANVAS PARTICLE KIT ──────────────────────────────────────────────
//
// What DialFx does for the dial and AimBarFx does for the aim bar, lifted out
// so the fight's status effects can do it too: soft additive sprites, baked
// once, drawn a few hundred times a frame, faded before they can meet an edge.
//
// DialFx keeps its own copy of the dot baker on purpose. It is the one that
// has been tuned on the live dial for months, and a shared helper changing
// under it would be the quiet kind of regression. This kit is that code with
// a ring added; the two should be kept in step if either is touched.
//
// ── WHY CANVAS 2D AND NOT PIXI, EVERY TIME ──────────────────────────────────
//
// A browser allows a handful of live WebGL contexts and EVICTS THE OLDEST when
// it runs out. The oldest is the sea chart, up since the session started. A
// second GL context for a bit of fire silently killed the renderer drawing the
// boat (see DialFx's note). A 2D canvas is not a GL context and cannot do that.

export const SPRITE = 64

/** One soft radial dot in a colour. Full strength in the core, gone at the
 *  rim. The falloff is a separate mask pass because one gradient cannot carry
 *  a solid hue AND an alpha ramp across every browser, and this always can. */
export function bakeDot(colour: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const g = c.getContext('2d')!
  const S = SPRITE
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, colour); grad.addColorStop(0.35, colour); grad.addColorStop(1, colour)
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'destination-in'
  const mask = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(0.35, 'rgba(0,0,0,0.5)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = mask
  g.fillRect(0, 0, S, S)
  return c
}

/** A soft ring: a thin stroke with a glow either side. Drawn by scaling the
 *  whole sprite, so `thick` is a fraction of the radius rather than pixels. */
export function bakeRing(colour: string, thick = 0.16): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE
  const g = c.getContext('2d')!
  const S = SPRITE, r = S / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  const inner = Math.max(0, 1 - thick * 2)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(inner, 'rgba(0,0,0,0)')
  grad.addColorStop(1 - thick, colour)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return c
}

export type Bit = {
  x: number; y: number
  vx: number; vy: number
  /** 0..1, and it is the whole animation: size, alpha and colour all read it. */
  age: number
  life: number
  size: number
  heat: number
  spin: number
}
export const blankBit = (): Bit => ({ x: 0, y: 0, vx: 0, vy: 0, age: 1, life: 1, size: 0, heat: 0, spin: 0 })

/** A ring buffer of particles. Running out recycles the OLDEST, so size it on
 *  the worst case rather than the average. */
export function pool(n: number) {
  const items = Array.from({ length: n }, blankBit)
  let i = 0
  return { items, take: () => { const b = items[i]; i = (i + 1) % n; return b } }
}

/** Heat by age: white at the base, gold through the middle, ember red as it
 *  dies. A ramp rather than an RGB lerp, because white to red goes via pink. */
export const HOT = ['#fff3d0', '#ffd479', '#ff9d3c', '#ef4b28', '#8f2410']

/**
 * A drawer that fades anything approaching the bitmap's edge, so nothing can
 * ever be cut off square. Sizing a canvas so every particle fits is a losing
 * game; a soft boundary makes clipping impossible by construction.
 */
export function makeBlob(ctx: CanvasRenderingContext2D, dims: () => { w: number; h: number; fade: number }) {
  return (img: HTMLCanvasElement, x: number, y: number, dw: number, dh: number, alpha: number) => {
    if (alpha <= 0.004 || dw <= 0.5 || dh <= 0.5) return
    const { w, h, fade } = dims()
    const edge = Math.min(x, y, w - x, h - y)
    if (edge <= 0) return
    const a = alpha * (edge < fade ? edge / fade : 1)
    if (a <= 0.004) return
    ctx.globalAlpha = a
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh)
  }
}
