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
//  2. Does WebGL survive on the phones that have been running out of memory?
//     The readout prints the renderer type — a fall back here would mean the
//     GPU path is unavailable and the whole plan needs rethinking.
//  3. Does the SHARED GEOMETRY port? The coastlines come from lib/islandShape,
//     the same module the chart and the build check already read. If the
//     islands draw from it here, the renderer swap never touches the shape of
//     the world.
//  4. Does the ground plane survive — squash and counter-squash both?
//  5. What does it cost, so the DOM chart has something to be measured against.
//
// ── NOTHING OPTIONAL BLOCKS ANYTHING ESSENTIAL ──────────────────────────────
//
// The first cut of this awaited a texture in the middle of setup, and the
// camera, the drag handlers and the ticker were all written after that await.
// The load hung, so none of them ever ran: the islands were on screen, the
// readout sat at its initial zeroes, and dragging did nothing — with no error
// anywhere, because a promise that never settles throws nothing to catch. It
// looked like a renderer that had half worked. It was a renderer that had
// finished and a setup that had stopped.
//
// So the order here is deliberate. Everything the bench needs to BE a bench is
// wired synchronously and is running before any asset is asked for. The town
// arrives late if it arrives at all, and says which in the readout.

import { useEffect, useRef, useState } from 'react'
import { PLACES } from '../chart'
import { coastline } from '@/lib/islandShape'

/** The chart's own squash. */
const GROUND = 0.58

type Stats = { renderer: string; objects: number; ms: number; town: string }

export default function PixiBench() {
  const holder = useRef<HTMLDivElement | null>(null)
  const [stats, setStats] = useState<Stats>({
    renderer: 'starting…', objects: 0, ms: 0, town: 'waiting',
  })
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    let app: import('pixi.js').Application | null = null
    let onResize: (() => void) | null = null

    ;(async () => {
      try {
        // Imported here so Pixi never reaches the server bundle.
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
        const world = new PIXI.Container()
        world.scale.set(1, GROUND)
        a.stage.addChild(world)

        // ── THE ISLANDS, from the shared coastline ─────────────────────
        let objects = 0
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
            objects++
          }
        }

        // ── CAMERA, INPUT AND TICKER. All synchronous, all before any
        //    asset is requested. See the note at the top of this file. ──
        const main = PLACES.find(p => p.id === 'mainland')
        const look = () => {
          world.x = a.screen.width / 2 - (main ? main.x : 0)
          world.y = a.screen.height / 2 - (main ? main.y * GROUND : 0)
        }
        look()
        onResize = look
        window.addEventListener('resize', onResize)

        // Drag to sail, so the plane can be judged in motion rather than still.
        let dragging = false
        let last = { x: 0, y: 0 }
        const cv = a.canvas
        cv.style.touchAction = 'none'
        cv.addEventListener('pointerdown', e => {
          dragging = true
          last = { x: e.clientX, y: e.clientY }
          cv.setPointerCapture?.(e.pointerId)
        })
        cv.addEventListener('pointermove', e => {
          if (!dragging) return
          world.x += e.clientX - last.x
          world.y += e.clientY - last.y
          last = { x: e.clientX, y: e.clientY }
        })
        const stop = () => { dragging = false }
        cv.addEventListener('pointerup', stop)
        cv.addEventListener('pointercancel', stop)
        cv.addEventListener('pointerleave', stop)

        const rendererName = a.renderer.type === 1 ? 'WebGL' : `other (${a.renderer.type})`
        // Painted once immediately, so the readout is honest about what has
        // happened even if nothing else ever completes.
        setStats(s => ({ ...s, renderer: rendererName, objects }))

        let acc = 0, frames = 0
        a.ticker.add(() => {
          acc += a.ticker.deltaMS
          frames++
          if (frames >= 30) {
            const ms = acc / frames
            setStats(s => ({ ...s, renderer: rendererName, ms }))
            acc = 0; frames = 0
          }
        })

        // ── AND THE TOWN, LAST AND UNAWAITED ──────────────────────────
        //
        // Loaded through a plain Image and `decode()` rather than through
        // Pixi's Assets: one less subsystem between here and an answer, and
        // the same way every other image in this codebase is warmed. Its
        // failure is reported, never thrown, and never blocks the bench.
        const img = new Image()
        img.decoding = 'async'
        img.src = '/sea/mainland-town.png'
        img.decode().then(() => {
          if (dead || !main) return
          const s = new PIXI.Sprite(PIXI.Texture.from(img))
          const d = main.r * 2
          s.width = d * 0.62
          s.scale.y = s.scale.x / GROUND        // stand up out of the plane
          s.anchor.set(0.5, 1)                  // bottom-centre, as the chart anchors
          s.x = main.x + (47 - 50) / 100 * d
          s.y = main.y + (51 - 50) / 100 * d
          world.addChild(s)
          setStats(st => ({ ...st, objects: objects + 1, town: 'drawn' }))
        }).catch((e: unknown) => {
          if (dead) return
          setStats(st => ({ ...st, town: `failed (${e instanceof Error ? e.name : 'unknown'})` }))
        })
      } catch (e) {
        setErr(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
      }
    })()

    return () => {
      dead = true
      if (onResize) window.removeEventListener('resize', onResize)
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
              <div>objects   {stats.objects}</div>
              <div>frame     {stats.ms.toFixed(1)} ms</div>
              <div>town      {stats.town}</div>
              <div style={{ color: 'rgba(207,224,236,0.5)', marginTop: 4 }}>drag to sail</div>
            </>
          )}
      </div>
    </div>
  )
}
