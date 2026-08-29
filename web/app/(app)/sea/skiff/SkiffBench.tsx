'use client'

// ── THE SAME CAPTAIN, DRAWN TWICE ───────────────────────────────────────────
//
// The DOM skiff on the left, the Pixi one on the right, same look, same size,
// same background. Nothing here ships; it exists so the port is verified by
// looking rather than by reasoning about percentages.
//
// It is here because the placement numbers in the cosmetic tables were tuned by
// eye over a long time — the pet table carries notes like "sits low and a touch
// left of the monkey" — and a systematic half-percent error in re-expressing
// them would be invisible in code review and obvious on a boat. /fishing-test
// exists for exactly this reason for the DOM composite; this is its equivalent
// for the renderer swap.
//
// Overlay mode is the one that matters. Side by side, two nearly-right skiffs
// look identical; stacked with the top one at half opacity, a two-pixel drift
// in a hat is impossible to miss.

import { useEffect, useRef, useState } from 'react'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { RODS } from '@/lib/rods'
import { HOOKS } from '@/lib/hooks'
import { makeSkiff, SKIFF_W, type Placement } from '../skiffArt'
import { makeRodFx, type GlowType } from '../rodFx'

/** Every effect the engine knows, in the order the rods unlock them. */
const GLOWS: GlowType[] = ['fire', 'sparkle', 'electric', 'moon', 'tech',
  'galaxy', 'saber', 'forge', 'prismatic', 'lockedin']

/** The rod and hook placements the chart uses for a resting captain. Copied
 *  deliberately: SeaMap owns them, and importing a component to read a constant
 *  would drag the whole chart into this bench. If they ever disagree, this
 *  bench is the thing that will show it. */
const ROD_REST: Placement = { top: 37, left: -12, width: 107.5, rotate: 0, origin: 'bottom right' }
const HOOK_REST: Placement = { top: 39.5, left: -10.5, width: 204.5, rotate: 0 }

export default function SkiffBench() {
  const holder = useRef<HTMLDivElement | null>(null)
  const [colour, setColour] = useState('default')
  const [boatId, setBoatId] = useState(BOATS[0]?.id ?? '')
  const [hatId, setHatId] = useState(HATS[0]?.id ?? '')
  const [overlay, setOverlay] = useState(false)
  const [glow, setGlow] = useState<GlowType | 'none'>('lockedin')
  const [stage, setStage] = useState(3)
  const [err, setErr] = useState<string | null>(null)

  // The stage is read inside the ticker, which is set up once. Without the ref
  // the ticker closes over the stage it was born with and the slider does
  // nothing — the stale-closure trap this codebase has hit before.
  const stageRef = useRef(stage)
  stageRef.current = stage

  const boat = BOATS.find(b => b.id === boatId) ?? null
  const hat = HATS.find(h => h.id === hatId) ?? null
  const char = getCharacterSprites(colour)
  const rod = RODS.find(r => r.slug)?.slug ?? null
  const hook = HOOKS.find(h => h.imageUrl)?.imageUrl ?? null

  useEffect(() => {
    let dead = false
    let app: import('pixi.js').Application | null = null

    ;(async () => {
      try {
        const PIXI = await import('pixi.js')
        if (dead || !holder.current) return
        const el = holder.current
        const a = new PIXI.Application()
        await a.init({ backgroundAlpha: 0, resizeTo: el, antialias: true, autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2) })
        if (dead) { a.destroy(true, { children: true }); return }
        app = a
        el.appendChild(a.canvas)

        const skiff = await makeSkiff(PIXI, {
          characterColor: colour, boatId, hatId, rodSlug: rod, hook,
        }, {
          character: char.rest,
          hat: hat?.restImageUrl ? { url: hat.restImageUrl, at: hat.positions.rest } : undefined,
          boat: boat?.restImageUrl ? { url: boat.restImageUrl, at: boat.positions.rest } : undefined,
          hook: hook ? { url: hook, at: HOOK_REST } : undefined,
          rod: rod ? { url: `/${rod}_rest.png`, at: ROD_REST } : undefined,
        })
        if (dead) { a.destroy(true, { children: true }); return }

        // The DOM composite is placed at the same origin, so any difference on
        // screen is a difference in the composition and nothing else.
        skiff.view.x += 20
        skiff.view.y += 60
        a.stage.addChild(skiff.view)

        // THE EFFECT, AT THE ROD. A child of the skiff rather than of the
        // stage, so it travels with the boat for free — a captain who sails
        // away from their own sparks is worse than no sparks.
        if (skiff.rodTip && glow !== 'none') {
          const fx = makeRodFx(PIXI, glow, { stage: stageRef.current })
          fx.view.x = skiff.rodTip.x
          fx.view.y = skiff.rodTip.y
          skiff.view.addChild(fx.view)
          a.ticker.add(t => {
            fx.setStage(stageRef.current)
            fx.update(t.deltaMS / 1000)
          })
        }
      } catch (e) {
        setErr(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
      }
    })()

    return () => {
      dead = true
      app?.destroy(true, { children: true })
      app = null
    }
  }, [colour, boatId, hatId, rod, hook, char.rest, boat, hat, glow])

  const domSkiff = (
    <div style={{ position: 'relative', width: SKIFF_W, transform: 'translate(-8%, -26%)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={char.rest} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
      {hat?.restImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute', top: `${hat.positions.rest.top}%`, left: `${hat.positions.rest.left}%`,
          width: `${hat.positions.rest.width}%`, transform: `rotate(${hat.positions.rest.rotate}deg)`,
        }} />
      )}
      {boat?.restImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={boat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute', top: `${boat.positions.rest.top}%`, left: `${boat.positions.rest.left}%`,
          width: `${boat.positions.rest.width}%`, transform: `rotate(${boat.positions.rest.rotate}deg)`,
        }} />
      )}
      {hook && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hook} alt="" draggable={false} style={{
          position: 'absolute', top: `${HOOK_REST.top}%`, left: `${HOOK_REST.left}%`,
          width: `${HOOK_REST.width}%`, maxWidth: 'none',
          transform: `rotate(${HOOK_REST.rotate}deg)`,
        }} />
      )}
      {rod && (
        // The DOM rod wears the OLD css aura, so the two panes are before and
        // after rather than with-sparks and without. Locked-In has a class per
        // stage; the others have one.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/${rod}_rest.png`} alt="" draggable={false}
          className={glow === 'none' ? undefined
            : glow === 'lockedin'
              ? (stage === 0 ? 'rod-glow-lockedin' : `rod-glow-lockedin-${stage}`)
              : `rod-glow-${glow}`}
          style={{
          position: 'absolute', top: `${ROD_REST.top}%`, left: `${ROD_REST.left}%`,
          width: `${ROD_REST.width}%`, maxWidth: 'none',
          transform: `rotate(${ROD_REST.rotate}deg)`, transformOrigin: 'bottom right',
        }} />
      )}
    </div>
  )

  const pane = { position: 'relative' as const, width: 320, height: 300, overflow: 'hidden' }

  return (
    <div style={{ minHeight: '100vh', background: '#12222e', color: '#cfe0ec',
      fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 16 }}>
      <p style={{ color: '#f0c040', fontWeight: 700, marginBottom: 10 }}>
        SKIFF: DOM vs PIXI{err ? ` — ${err}` : ''}
      </p>

      <div style={{
        position: 'relative',
        display: overlay ? 'block' : 'flex',
        gap: 24, marginBottom: 18,
      }}>
        <div style={{ ...pane, ...(overlay ? { position: 'absolute', top: 0, left: 0 } : {}) }}>
          {!overlay && <span style={{ position: 'absolute', top: 4, left: 4, zIndex: 3 }}>DOM</span>}
          <div style={{ position: 'absolute', left: 20, top: 60 }}>{domSkiff}</div>
        </div>
        <div style={{
          ...pane,
          ...(overlay ? { position: 'absolute', top: 0, left: 0, opacity: 0.5 } : {}),
        }}>
          {!overlay && <span style={{ position: 'absolute', top: 4, left: 4, zIndex: 3 }}>PIXI</span>}
          <div ref={holder} style={{ position: 'absolute', inset: 0 }} />
        </div>
        {overlay && <div style={{ height: 300 }} />}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>colour&nbsp;
          <select value={colour} onChange={e => setColour(e.target.value)}>
            {CHARACTER_COLORS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>boat&nbsp;
          <select value={boatId} onChange={e => setBoatId(e.target.value)}>
            {BOATS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>hat&nbsp;
          <select value={hatId} onChange={e => setHatId(e.target.value)}>
            {HATS.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} />
          &nbsp;overlay at 50%
        </label>
        <label>effect&nbsp;
          <select value={glow} onChange={e => setGlow(e.target.value as GlowType | 'none')}>
            <option value="none">none</option>
            {GLOWS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        {glow === 'lockedin' && (
          <label style={{ color: '#f0c040' }}>
            streak stage {stage}&nbsp;
            <input type="range" min={0} max={3} step={1} value={stage}
              onChange={e => setStage(Number(e.target.value))} />
          </label>
        )}
      </div>
      <p style={{ color: 'rgba(207,224,236,0.55)', marginTop: 10, maxWidth: 620, lineHeight: 1.6 }}>
        Left is the CSS aura the rods wear today; right is the same rod on the
        canvas. Overlay mode is for the composition rather than the effect: side
        by side, two nearly-right skiffs look the same, and stacked, a two-pixel
        drift in a hat is obvious. The emitter hangs off the rod&rsquo;s far end,
        taken from the placed sprite rather than a guessed offset, so a longer
        rod throws further with no number to edit.
      </p>
      <p style={{ color: 'rgba(207,224,236,0.55)', marginTop: 8, maxWidth: 620, lineHeight: 1.6 }}>
        The Locked-In slider is the streak: 0 is dormant and meant to
        disappoint, 3 is ten perfect catches in a row and meant to be slightly
        too much.
      </p>
    </div>
  )
}
