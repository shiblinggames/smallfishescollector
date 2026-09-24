// ── WIND RUSHING PAST THE HULL ──────────────────────────────────────────────
//
// Kong: when you catch a current, show the speed on the boat, like wind
// rushing behind you. A small pool of thin white streaks that spawn just ahead
// of and beside the hull and stream back past it, opposite the way she is
// going, fading as they go. How many there are and how bright is one number
// the chart sets every frame: strong riding a current, lighter at full sail,
// none otherwise.
//
// A fixed pool, one shared texture, additive: a single batch however many are
// alive, and nothing allocated after the first frame. Lives in the air layer,
// which copies the world's camera, so the streaks are in world units.

import type { Container, Sprite, Texture } from 'pixi.js'

const POOL = 24

export type Rush = {
  view: Container
  /** Where the hull is, which way and how fast (world px/s), and how strong
   *  the rush is, 0 to 1. Every frame. */
  set(x: number, y: number, vx: number, vy: number, k: number): void
  advance(dt: number): void
  night(tint: number): void
}

function streak(PIXI: typeof import('pixi.js')): Texture {
  const w = 96, h = 8
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.beginPath()
  g.ellipse(w / 2, h / 2, w / 2, h / 2 - 1.5, 0, 0, Math.PI * 2)
  g.fill()
  return PIXI.Texture.from(cv)
}

export function makeRush(PIXI: typeof import('pixi.js')): Rush {
  const view: Container = new PIXI.Container()
  const tex = streak(PIXI)
  const parts: { sp: Sprite; life: number; max: number; x: number; y: number; vx: number; vy: number; len: number }[] = []
  for (let i = 0; i < POOL; i++) {
    const sp: Sprite = new PIXI.Sprite(tex)
    sp.anchor.set(0.5)
    sp.blendMode = 'add'
    sp.alpha = 0
    view.addChild(sp)
    parts.push({ sp, life: 0, max: 0, x: 0, y: 0, vx: 0, vy: 0, len: 1 })
  }
  let hx = 0, hy = 0, hvx = 0, hvy = 0, k = 0, owed = 0, rr = 1

  return {
    view,
    set(x, y, vx, vy, strength) { hx = x; hy = y; hvx = vx; hvy = vy; k = Math.max(0, Math.min(1, strength)) },
    advance(dt) {
      const sp = Math.hypot(hvx, hvy)
      const ux = sp > 1 ? hvx / sp : 1, uy = sp > 1 ? hvy / sp : 0
      // Spawn, at a rate that follows the strength: up to ~45 a second.
      if (k > 0.02 && sp > 40) {
        owed += k * 45 * dt
        while (owed >= 1) {
          owed -= 1
          const p = parts.find(q => q.life <= 0)
          if (!p) break
          // Ahead and to either side of the hull, so they sweep past it.
          rr = (rr * 1103515245 + 12345) >>> 0
          const r1 = (rr % 1000) / 1000
          rr = (rr * 1103515245 + 12345) >>> 0
          const r2 = (rr % 1000) / 1000
          const along = 30 + r1 * 150
          const side = (r2 - 0.5) * 200
          p.x = hx + ux * along - uy * side
          p.y = hy + uy * along + ux * side
          // Streaming back past her, faster than she goes.
          const rush = sp * 1.1 + 260
          p.vx = -ux * rush + hvx
          p.vy = -uy * rush + hvy
          p.max = 0.32 + r1 * 0.25
          p.life = p.max
          p.len = 0.6 + r2 * 0.8
        }
      } else owed = 0
      for (const p of parts) {
        if (p.life <= 0) { if (p.sp.alpha !== 0) p.sp.alpha = 0; continue }
        p.life -= dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        const f = 1 - Math.max(0, p.life) / p.max
        p.sp.position.set(p.x, p.y)
        p.sp.rotation = Math.atan2(uy, ux)
        p.sp.scale.set(p.len, 1)
        p.sp.alpha = Math.sin(Math.PI * f) * 0.55 * Math.max(0.35, k)
      }
    },
    night(tint) { view.tint = tint },
  }
}
