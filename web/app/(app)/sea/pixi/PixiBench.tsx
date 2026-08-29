'use client'

// ── THE PIXI SPIKE ──────────────────────────────────────────────────────────
//
// Not the chart. A bench, in the same spirit as /sea/boundary and
// /sea/waterline: it exists to answer questions with a running thing rather
// than with an opinion, and nothing on /sea imports it.
//
// WHAT IT IS PROVING, in order of how badly a "no" would hurt:
//
//  1. Does Pixi 8 initialise at all under this Next, this React and turbopack?
//     `Application.init()` is async in v8, which is exactly the kind of thing a
//     framework's strict-mode double-mount turns into two half-built renderers.
//  2. Does WebGL survive on the phones that have been running out of memory?
//     The readout prints the renderer type — a fall back to canvas here would
//     mean the GPU path is unavailable and the whole plan needs rethinking.
//  3. Does the SHARED GEOMETRY port? The coastlines come from lib/islandShape,
//     the same module the chart and the build check already read. If the
//     islands can be drawn from it here, the renderer swap does not touch the
//     shape of the world at all.
//  4. Does the ground plane survive? Everything is squashed by GROUND and
//     standing objects are counter-squashed. If that does not reproduce, the
//     look changes, and the look is not up for negotiation.
//  5. What does it cost? Sprite count and frame time, so the DOM chart has
//     something to be measured against rather than argued with.

import { useEffect, useRef, useState } from 'react'
import { PLACES } from '../chart'
import { coastline } from '@/lib/islandShape'

/** The chart's own squash. Same number, deliberately duplicated nowhere: it is
 *  imported by value here so the bench cannot drift from the real thing. */
const GROUND = 0.58

type Stats = { renderer: string; sprites: number; ms: number }

export default function PixiBench() {
  const holder = useRef<HTMLDivElement | null>(null)
  const [stats, setStats] = useState<Stats>({ renderer: '…', sprites: 0, ms: 0 })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    // Captured for the cleanup: `app` is assigned inside an async body, so the
    // effect can be torn down before it exists. React 19's strict double-mount
    // makes that the normal case in development, not the rare one.
    let app: import('pixi.js').Application | null = null
    let onResize: (() => void) | null = null

    ;(async () => {
      try {
        // Imported here rather than at module scope so Pixi never reaches the
        // server bundle and never runs during prerender.
        const PIXI = await import('pixi.js')
        if (dead || !holder.current) return

        const el = holder.current
        const a = new PIXI.Application()
        await a.init({
          background: '#0b1a24',
          resizeTo: el,
          antialias: true,
          // Matches the cap bakeIsland already uses. Full retina on a chart
          // this size is the memory pressure we are here to get away from.
          resolution: Math.min(window.devicePixelRatio || 1, 1.25),
          autoDensity: true,
        })
        if (dead) { a.destroy(true, { children: true }); return }
        app = a
        el.appendChild(a.canvas)

        // ── THE WORLD, one container, exactly as the DOM chart has it ──
        // The camera is this container's position; the squash is its scale.
        // Nothing else in the scene knows the plane is tilted.
        const world = new PIXI.Container()
        world.scale.set(1, GROUND)
        a.stage.addChild(world)

        // ── THE ISLANDS, drawn from the shared coastline ───────────────
        let sprites = 0
        for (const p of PLACES) {
          if (p.inner !== undefined) continue          // waters have no land
          const rs = coastline(p.id)
          const d = p.r * 2

          const bands: [number, number][] = [
            [1.00, 0x2a2419], [0.74, 0xb9a077], [0.666, 0xd8c49f],
            [0.599, 0x9aa269], [0.518, 0x5c7a44],
          ]
          for (const [k, colour] of bands) {
            const g = new PIXI.Graphics()
            rs.forEach((r, i) => {
              const ang = (Math.PI * 2 * i) / rs.length
              const x = p.x + Math.cos(ang) * (r / 100) * d * k
              const y = p.y + Math.sin(ang) * (r / 100) * d * k
              if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
            })
            g.closePath()
            g.fill(colour)
            world.addChild(g)
            sprites++
          }
        }

        // ── AND ONE REAL SPRITE, counter-squashed so it stands up ──────
        // The town is the heaviest painting on the chart and the one whose
        // placement was just tuned by hand, so it is the honest test of
        // whether a texture lands where the DOM puts it.
        const main = PLACES.find(p => p.id === 'mainland')
        if (main) {
          const tex = await PIXI.Assets.load('/sea/mainland-town.png')
          if (!dead) {
            const s = new PIXI.Sprite(tex)
            const d = main.r * 2
            s.width = d * 0.62
            s.scale.y = s.scale.x / GROUND        // stand up out of the plane
            s.anchor.set(0.5, 1)                  // bottom-centre, as the chart anchors
            s.x = main.x + (47 - 50) / 100 * d
            s.y = main.y + (51 - 50) / 100 * d
            world.addChild(s)
            sprites++
          }
        }

        // ── CAMERA ────────────────────────────────────────────────────
        const centre = () => {
          world.x = a.screen.width / 2
          world.y = a.screen.height / 2
        }
        centre()
        onResize = centre
        window.addEventListener('resize', onResize)

        // Drag to sail, so the plane can be judged in motion rather than still.
        let dragging = false
        let last = { x: 0, y: 0 }
        a.canvas.style.touchAction = 'none'
        a.canvas.addEventListener('pointerdown', e => {
          dragging = true; last = { x: e.clientX, y: e.clientY }
        })
        a.canvas.addEventListener('pointermove', e => {
          if (!dragging) return
          world.x += e.clientX - last.x
          world.y += e.clientY - last.y
          last = { x: e.clientX, y: e.clientY }
        })
        const stop = () => { dragging = false }
        a.canvas.addEventListener('pointerup', stop)
        a.canvas.addEventListener('pointercancel', stop)

        // Start looking at the Mainland rather than at empty water.
        if (main) { world.x -= main.x; world.y -= main.y * GROUND }

        let acc = 0, frames = 0
        a.ticker.add(() => {
          acc += a.ticker.deltaMS; frames++
          if (frames >= 30) {
            setStats({
              renderer: a.renderer.type === 1 ? 'WebGL' : 'Canvas/other',
              sprites,
              ms: acc / frames,
            })
            acc = 0; frames = 0
          }
        })
      } catch (e) {
        setErr(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
      }
    })()

    return () => {
      dead = true
      if (onResize) window.removeEventListener('resize', onResize)
      // `true` also removes the canvas from the DOM, which matters here because
      // the element it was appended to outlives the renderer.
      app?.destroy(true, { children: true })
      app = null
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1a24' }}>
      <div ref={holder} style={{ position: 'absolute', inset: 0 }} />

      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 2,
        padding: '0.6rem 0.8rem', borderRadius: 10,
        background: 'rgba(4,10,18,0.86)', border: '1px solid rgba(255,255,255,0.14)',
        fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.7,
        color: '#cfe0ec', pointerEvents: 'none',
      }}>
        <div style={{ color: '#f0c040', fontWeight: 700 }}>PIXI SPIKE</div>
        {err
          ? <div style={{ color: '#f0a0a0', maxWidth: 320 }}>{err}</div>
          : (
            <>
              <div>renderer  {stats.renderer}</div>
              <div>objects   {stats.sprites}</div>
              <div>frame     {stats.ms.toFixed(1)} ms</div>
              <div style={{ color: 'rgba(207,224,236,0.5)', marginTop: 4 }}>drag to sail</div>
            </>
          )}
      </div>
    </div>
  )
}
