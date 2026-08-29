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

export type GpuIsland = { id: string; r: number; x: number; y: number; locked: boolean }

export type GpuHandle = {
  /** Called by the frame loop, right after it writes the DOM world transform. */
  camera(x: number, y: number, zoom: number): void
}

export default function SeaIslandsGPU({ islands, handle }: {
  islands: GpuIsland[]
  /** Filled in on mount so the loop can steer this without a re-render. */
  handle: { current: GpuHandle | null }
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  // Read once. The list is derived from static chart data, so re-baking on a
  // parent render would be pure waste.
  const listRef = useRef(islands)

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

      handle.current = {
        camera(x, y, zoom) {
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
