'use client'

// ── THE ISLANDS, ON THE GPU ─────────────────────────────────────────────────
//
// Stage two of the Pixi port, and it is deliberately the smallest useful slice:
// the LAND only. Every other thing on the chart — the buildings standing on the
// islands, the labels, the berths, the boat, the traders — stays exactly where
// it is, in the DOM, drawn over the top of this canvas.
//
// ── WHY THE LAND FIRST ──────────────────────────────────────────────────────
//
// It is where the memory is. `islandCache` and `surfCache` hold a canvas per
// island and per surf ring and never evict, which around thirty-odd islands is
// the bulk of what iOS was killing the renderer over. As one Pixi canvas they
// become GPU textures with a single backing surface, and the ones off screen
// cost nothing to have.
//
// It is also the slice with the least that can go wrong, because the ART DOES
// NOT CHANGE. `bakeIsland` already returns a finished HTMLCanvasElement and a
// canvas is a texture source, so these are the same paintings the DOM was
// showing, re-hosted. There is no new island art to get subtly wrong.
//
// ── THE ONE THING THAT MUST NOT DRIFT ───────────────────────────────────────
//
// The buildings are still DOM, positioned inside a container the frame loop
// transforms. This canvas has to land its islands in exactly the same place, in
// the same frame, or a tavern slides off the island it stands on. So the camera
// is not computed here: `camera()` is called by the same loop, from the same
// numbers, immediately after it writes the DOM transform. The mapping is that
// transform read back out:
//
//     scale(zoom) scaleY(GROUND) translate3d(-x, -y)   from a 50%/50% origin
//
// CSS applies right to left, so a world point lands at
// `centre + zoom * (wx - x, GROUND * (wy - y))`, which is a container scaled by
// (zoom, zoom * GROUND) and positioned at (w/2 - zoom*x, h/2 - zoom*GROUND*y).

import { useEffect, useRef } from 'react'
import { GROUND, bakeIsland, requestGround } from './islandArt'
import { bakeMark } from './markArt'
import { nightTint } from './seaWater'
import { SUBMERGE } from './submerge'

export type GpuIsland = { id: string; r: number; x: number; y: number; locked: boolean }
export type GpuMark = {
  art: string; x: number; y: number; size: number
  sway?: 'bob' | 'rock'
  /** Its index on the chart, which is all the sway phase is derived from — so
   *  two identical wrecks side by side are never in step. */
  i: number
}

export type GpuHandle = {
  /** Called by the frame loop, right after it writes the DOM world transform. */
  camera(x: number, y: number, zoom: number): void
  /** The clock's two axes: how dark, and how low the sun is. Tints every
   *  sprite on this canvas — see nightTint for why this is a tint and
   *  emphatically not a filter. */
  night(dark: number, warm: number): void
}

export default function SeaIslandsGPU({ islands, marks, handle }: {
  islands: GpuIsland[]
  marks: GpuMark[]
  /** Filled in on mount so the loop can steer this without a re-render. */
  handle: { current: GpuHandle | null }
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  // Read once. Both lists are derived from static chart data, so re-baking on a
  // parent render would be pure waste.
  const listRef = useRef(islands)
  const marksRef = useRef(marks)

  useEffect(() => {
    let dead = false
    let app: import('pixi.js').Application | null = null

    ;(async () => {
      const PIXI = await import('pixi.js')
      if (dead || !holder.current) return

      const el = holder.current
      const a = new PIXI.Application()
      await a.init({
        // TRANSPARENT. The water is a CSS gradient under this canvas and it is
        // staying there: it is one full-screen gradient that costs nothing and
        // carries its own tuning, and asking the GPU to repaint it every frame
        // would be work for no gain.
        backgroundAlpha: 0,
        resizeTo: el,
        antialias: true,
        // The same cap bakeIsland uses. Full retina across this many islands is
        // the memory pressure the port exists to relieve.
        resolution: Math.min(window.devicePixelRatio || 1, 1.25),
        autoDensity: true,
      })
      if (dead) { a.destroy(true, { children: true }); return }
      app = a
      el.appendChild(a.canvas)
      // Input belongs to the DOM chart underneath. This canvas is scenery.
      a.canvas.style.pointerEvents = 'none'

      const world = new PIXI.Container()
      a.stage.addChild(world)

      const baked: { isle: GpuIsland; sprite: import('pixi.js').Sprite; pad: number }[] = []
      const place = (isle: GpuIsland) => {
        const d = isle.r * 2
        // The chart's own padding: the widest shoal wash plus the blur's spill.
        const pad = Math.round(d * 0.08) + 24
        const s = new PIXI.Sprite(PIXI.Texture.from(bakeIsland(isle.id, d, isle.locked, pad)))
        // Placed by CSS size, not by pixel size: the canvas is baked at DPR.
        s.width = d + pad * 2
        s.height = d + pad * 2
        s.anchor.set(0.5, 0.5)
        s.x = isle.x
        s.y = isle.y
        world.addChild(s)
        baked.push({ isle, sprite: s, pad })
      }
      for (const isle of listRef.current) place(isle)

      // The turf and rock land after the first bake. When they do, the chart
      // drops its cache and repaints; here the textures are swapped.
      requestGround(() => {
        if (dead) return
        for (const b of baked) {
          const d = b.isle.r * 2
          b.sprite.texture = PIXI.Texture.from(bakeIsland(b.isle.id, d, b.isle.locked, b.pad))
        }
      })

      // ── THE LANDMARKS ─────────────────────────────────────────────
      //
      // Wrecks, rigs, buoys, bones and the moored smacks. In the DOM these are
      // TWO masked <img> each and all 42 stay mounted whatever is on screen;
      // here they are two sprites sharing a texture baked once per painting,
      // and the ones off screen are simply not drawn.
      //
      // Two sprites and not a shader, deliberately: the waterline was placed by
      // eye on /sea/waterline and this reproduces the same two layers with the
      // same stops rather than approximating them. See markArt.
      type Swayer = {
        node: import('pixi.js').Container
        holder: import('pixi.js').Container
        sway: 'bob' | 'rock' | undefined
        phase: number
        x: number
        y: number
        half: number
      }
      const swayers: Swayer[] = []

      for (const m of marksRef.current) {
        const sub = SUBMERGE[m.art.split('/').pop()!.replace('.png', '')]
        bakeMark(m.art, sub).then(({ wet, dry }) => {
          if (dead) return

          // Anchored bottom-centre and stood up out of the plane, which is the
          // outer wrapper SeaMark uses; the inner one is free to sway without
          // clobbering it.
          const node = new PIXI.Container()
          node.x = m.x
          node.y = m.y

          const inner = new PIXI.Container()
          node.addChild(inner)

          const add = (cv: HTMLCanvasElement) => {
            const sp = new PIXI.Sprite(PIXI.Texture.from(cv))
            const k = m.size / cv.width
            sp.scale.set(k, k)
            sp.anchor.set(0.5, 1)
            inner.addChild(sp)
            return sp
          }
          add(wet)
          if (dry) add(dry)

          // The counter-squash, about the base, so it stands rather than lies.
          node.scale.set(1, 1 / GROUND)

          // Sway pivots at 50%/92% of the sprite, as the CSS does. The sprites
          // are anchored at their base, so that is a little way ABOVE zero.
          const h = (dry ?? wet).height * (m.size / (dry ?? wet).width)
          inner.pivot.set(0, -h * 0.08)
          inner.position.set(0, -h * 0.08)

          world.addChild(node)
          swayers.push({
            node, holder: inner, sway: m.sway,
            phase: (m.i * 0.77) % 3,
            x: m.x, y: m.y, half: m.size,
          })
        }).catch(() => {
          // One painting that will not decode must not cost the other forty.
        })
      }

      // ── SWAY AND CULL, once a frame ───────────────────────────────
      //
      // The DOM ran these as CSS animations on 84 promoted elements. Here it is
      // arithmetic on whatever is actually visible, and the cull is the thing
      // this stage exists for: a landmark off screen costs nothing at all,
      // where a mounted <img> costs a compositing layer whether you can see it
      // or not.
      let camX = 0, camY = 0, camZoom = 1
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      a.ticker.add(() => {
        const t = performance.now() / 1000
        const halfW = a.screen.width / 2 / camZoom
        const halfH = a.screen.height / 2 / camZoom / GROUND
        for (const sw of swayers) {
          // Generous margins: a landmark is anchored at its base and stands
          // well above it, so culling on the anchor alone pops the tall ones.
          const on = Math.abs(sw.x - camX) < halfW + sw.half * 2
            && Math.abs(sw.y - camY) < halfH + sw.half * 3
          sw.node.visible = on
          if (!on || !sw.sway || reduce) continue
          if (sw.sway === 'bob') {
            // markBob: 3.6s, translateY 0 to -5, rotate -3.2 to 3.2.
            const u = Math.sin(((t + sw.phase) / 3.6) * Math.PI * 2)
            sw.holder.rotation = (3.2 * Math.PI / 180) * u
            sw.holder.y = -sw.half * 0.08 - 2.5 * (u + 1)
          } else {
            // A wreck is thousands of tons of waterlogged timber: slower, less.
            const u = Math.sin(((t + sw.phase) / 9) * Math.PI * 2)
            sw.holder.rotation = (1.1 * Math.PI / 180) * u
          }
        }
      })

      let lastTint = -1
      handle.current = {
        night(dark, warm) {
          const tint = nightTint(dark, warm)
          if (tint === lastTint) return
          lastTint = tint
          for (const b of baked) b.sprite.tint = tint
          for (const sw of swayers) {
            for (const child of sw.holder.children) {
              (child as import('pixi.js').Sprite).tint = tint
            }
          }
        },
        camera(x, y, zoom) {
          camX = x; camY = y; camZoom = zoom
          world.scale.set(zoom, zoom * GROUND)
          world.position.set(
            a.screen.width / 2 - zoom * x,
            a.screen.height / 2 - zoom * GROUND * y,
          )
        },
      }
    })().catch(() => {
      // A renderer that will not start must not take the chart with it. The
      // DOM islands are still mounted behind the flag that turned this on, so
      // the worst case here is the chart the game has always had.
    })

    return () => {
      dead = true
      handle.current = null
      app?.destroy(true, { children: true })
      app = null
    }
  }, [handle])

  return <div ref={holder} aria-hidden style={{ position: 'absolute', inset: 0 }} />
}
