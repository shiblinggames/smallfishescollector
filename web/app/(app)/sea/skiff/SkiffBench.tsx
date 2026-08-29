'use client'

// ── THE SAME CAPTAIN, DRAWN TWICE ───────────────────────────────────────────
//
// The DOM skiff on the left, the Pixi one on the right, same gear, same size,
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
// Overlay mode is the one that matters for the COMPOSITION. Side by side, two
// nearly-right skiffs look identical; stacked with the top one at half opacity,
// a two-pixel drift in a hat is impossible to miss.
//
// For the EFFECTS it is the other way round: the left pane wears the CSS auras
// the game ships today and the right pane wears the canvas ones, so the two
// panes are before and after. Every rod, hull and hook is selectable, because
// "is this the same item, turned up" is a question you answer by looking at the
// item rather than at a list of effect names.
//
// AND IT RUNS ALL THREE POSES, because a skiff is not a picture, it is a
// fishing animation. Rest, wait, cast — every layer moves between them, and the
// cast is where the placements are strangest: the rod swings and shortens, the
// hook rotates 66 degrees, and the hook vanishes entirely on the wait because
// it is in the water. Anything that only looks right at rest is not ported.

import { useEffect, useRef, useState } from 'react'
import { BOATS, boatGlowClass } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { RODS, rodGlowClass } from '@/lib/rods'
import { HOOKS, hookGlowClass } from '@/lib/hooks'
import { REELS } from '@/lib/reels'
import { PETS, PET_OVERLAYS } from '@/lib/pets'
import { makeSkiff, SKIFF_W, FRAMES, type Frame, type Placement } from '../skiffArt'
import { makeAura, rodEffect, hookEffect, hullEffect, type Aura, type EffectName } from '../aura'

/** The rods worth looking at: every one that carries an aura. Read off the rod
 *  table rather than off a list of effect names, so a rod that gains a glow
 *  appears here without anybody editing the bench. */
const GLOWING_RODS = RODS.filter(r => r.glow && r.slug)

/** The rod, reel and hook placements, per pose. Copied deliberately from
 *  SeaMap: it owns them, and importing a component to read a constant would
 *  drag the whole chart into this bench. If they ever disagree, this bench is
 *  the thing that will show it. */
const ROD_AT: Record<Frame, Placement> = {
  rest: { top: 37, left: -12, width: 107.5, rotate: 0, origin: 'bottom right' },
  wait: { top: 37.5, left: -8, width: 107.5, rotate: 0, origin: 'bottom right' },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0, origin: 'bottom right' },
}
const REEL_AT: Record<Frame, Placement> = {
  rest: { top: 15, left: -10.3, width: 222, rotate: -18 },
  wait: { top: -5.2, left: -3.1, width: 222, rotate: -36.5 },
  cast: { top: 38.9, left: -42, width: 219.5, rotate: 46.5 },
}
const HOOK_AT: Record<Frame, Placement> = {
  rest: { top: 39.5, left: -10.5, width: 204.5, rotate: 0 },
  // Hidden on the wait frame because the hook is in the water during the bite.
  wait: { top: 39.5, left: -10.5, width: 222, rotate: 0, hidden: true },
  cast: { top: 40.5, left: -73, width: 204.5, rotate: 66.5 },
}

export default function SkiffBench() {
  const holder = useRef<HTMLDivElement | null>(null)
  const [colour, setColour] = useState('default')
  const [boatId, setBoatId] = useState('ethereal')
  const [hatId, setHatId] = useState(HATS[0]?.id ?? '')
  const [petId, setPetId] = useState('none')
  const [rodTier, setRodTier] = useState(20)
  const [hookTier, setHookTier] = useState(8)
  const [overlay, setOverlay] = useState(false)
  const [stage, setStage] = useState(3)
  const [frame, setFrame] = useState<Frame>('rest')
  const [cycle, setCycle] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Read inside the ticker, which is set up once. Without the refs the ticker
  // closes over the values it was born with and the controls do nothing — the
  // stale-closure trap this codebase has hit before.
  const stageRef = useRef(stage); stageRef.current = stage
  const frameRef = useRef(frame); frameRef.current = frame

  const boat = BOATS.find(b => b.id === boatId) ?? null
  const hat = HATS.find(h => h.id === hatId) ?? null
  const char = getCharacterSprites(colour)
  // A pet is a VARIANT with its own art, but the placement is per SPECIES —
  // every parrot sits where a parrot sits. Getting that backwards is the trap
  // the pet docs warn about: never copy another species' overlay coords.
  const pet = PETS.find(p => p.id === petId) ?? null
  const rodDef = RODS.find(r => r.tier === rodTier) ?? null
  const rod = rodDef?.slug ?? null
  const hookDef = HOOKS.find(h => h.tier === hookTier) ?? null
  const hook = hookDef?.imageUrl ?? null
  const reel = REELS.find(r => r.imageUrl)?.imageUrl ?? null

  // ── THE FISHING LOOP, so the poses are seen in motion ──────────────────────
  // The real timings are the player's own; this is only long enough on each
  // pose to see whether the layers hold together through the change.
  useEffect(() => {
    if (!cycle) return
    let i = 0
    const t = setInterval(() => { i = (i + 1) % FRAMES.length; setFrame(FRAMES[i]) }, 900)
    return () => clearInterval(t)
  }, [cycle])

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

        // Resolved INSIDE the effect, off the primitive selections. Doing it
        // outside and depending on the results is what tore the renderer down
        // on every pose change: getCharacterSprites returns a fresh object
        // literal every render, so the dependency never compared equal.
        const boatNow = BOATS.find(b => b.id === boatId) ?? null
        const hatNow = HATS.find(h => h.id === hatId) ?? null
        const petNow = PETS.find(p => p.id === petId) ?? null
        const rodNow = RODS.find(r => r.tier === rodTier) ?? null
        const hookNow = HOOKS.find(h => h.tier === hookTier) ?? null
        const charNow = getCharacterSprites(colour)
        const rodSlug = rodNow?.slug ?? null
        const hookUrl = hookNow?.imageUrl ?? null

        const skiff = await makeSkiff(PIXI, {
          character: f => charNow[f],
          hat: hatNow ? {
            url: f => (f === 'cast' ? hatNow.castImageUrl : hatNow.restImageUrl),
            at: f => hatNow.positions[f],
          } : undefined,
          boat: boatNow ? {
            url: f => (f === 'cast' ? boatNow.castImageUrl : boatNow.restImageUrl),
            at: f => boatNow.positions[f],
          } : undefined,
          rod: rodSlug ? { url: f => `/${rodSlug}_${f}.png`, at: f => ROD_AT[f] } : undefined,
          reel: reel ? { url: () => reel, at: f => REEL_AT[f] } : undefined,
          pet: petNow ? {
            url: () => petNow.restImageUrl,
            at: f => PET_OVERLAYS[petNow.species][f],
          } : undefined,
          hook: hookUrl ? { url: () => hookUrl, at: f => HOOK_AT[f] } : undefined,
        }, { frame: frameRef.current })
        if (dead) { a.destroy(true, { children: true }); return }

        // The DOM composite is placed at the same origin, so any difference on
        // screen is a difference in the composition and nothing else.
        skiff.view.x += 20
        skiff.view.y += 60
        a.stage.addChild(skiff.view)

        // ── THE AURAS ─────────────────────────────────────────────────────
        //
        // One per glowing part, each built on that part's own image. The glow
        // goes UNDER its part, so the part sits on top of its own light the way
        // the CSS shadow does, and the sparks go OVER it, so the part sits
        // inside its effect rather than in front of it. All of them are
        // children of the skiff, so they travel with the boat for free — a
        // captain who sails away from their own sparks is worse than no sparks.
        const worn: { key: 'rod' | 'boat' | 'hook'; aura: Aura }[] = []
        const hang = (key: 'rod' | 'boat' | 'hook', name: EffectName | null, staged = false) => {
          const part = skiff.parts[key]
          const pose = skiff.poseOf(key)
          if (!part || !pose || !name) return
          const aura = makeAura(PIXI, {
            part, image: pose.image, name, key: pose.key, staged, stage: stageRef.current,
          })
          skiff.view.addChildAt(aura.under, skiff.view.getChildIndex(part))
          skiff.view.addChild(aura.over)
          worn.push({ key, aura })
        }

        hang('rod', rodEffect(rodNow), !!rodNow?.lockedIn)
        hang('boat', hullEffect(boatNow))
        hang('hook', hookEffect(hookNow))

        // Every part is a different picture at a different angle in each pose,
        // so every aura is re-pointed when the skiff changes. Cheap on a pose
        // it has seen: the bakes and the outline are cached per image.
        skiff.onFrame = () => {
          for (const w of worn) {
            // The hook is hidden on the wait pose — it is in the water — and an
            // aura that is not told keeps burning where the hook used to be.
            const part = skiff.parts[w.key]
            const on = !!part?.visible
            w.aura.setHidden(!on)
            if (!on) continue
            const p = skiff.poseOf(w.key)
            if (p) w.aura.setPose(p.image, p.key)
          }
        }

        a.ticker.add(t => {
          const dt = t.deltaMS / 1000
          for (const w of worn) { w.aura.setStage(stageRef.current); w.aura.update(dt) }
          if (skiff.frame() !== frameRef.current) skiff.setFrame(frameRef.current)
        })
      } catch (e) {
        setErr(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
      }
    })()

    return () => {
      dead = true
      app?.destroy(true, { children: true })
      app = null
    }
    // PRIMITIVES ONLY, and no `frame`. Each of these really does mean a
    // different scene; the pose does not — it is a texture swap the ticker
    // applies to the skiff that is already standing there. An object in this
    // list rebuilds the whole renderer on every render, which is what the
    // flicker between poses was.
  }, [colour, boatId, hatId, petId, rodTier, hookTier, reel])

  const img = (src: string, p: Placement, className?: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img decoding="async" src={src} alt="" draggable={false} className={className} style={{
      position: 'absolute', top: `${p.top}%`, left: `${p.left}%`,
      width: `${p.width}%`, maxWidth: 'none',
      transform: `rotate(${p.rotate}deg)`,
      transformOrigin: p.origin ?? 'center center',
      visibility: p.hidden ? 'hidden' : 'visible',
    }} />
  )

  // The DOM side wears the CSS auras the game ships today, so the two panes are
  // before and after rather than with-sparks and without.
  const domSkiff = (
    <div style={{ position: 'relative', width: SKIFF_W, transform: 'translate(-8%, -26%)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={char[frame]} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
      {hat && img(frame === 'cast' ? hat.castImageUrl : hat.restImageUrl, hat.positions[frame])}
      {boat && img(frame === 'cast' ? boat.castImageUrl : boat.restImageUrl, boat.positions[frame],
        boatGlowClass(boat))}
      {rod && rodDef && img(`/${rod}_${frame}.png`, ROD_AT[frame],
        // Locked-In has a class per streak stage; every other rod has one.
        rodDef.lockedIn
          ? (stage === 0 ? 'rod-glow-lockedin' : `rod-glow-lockedin-${stage}`)
          : rodGlowClass(rodDef))}
      {reel && img(reel, REEL_AT[frame])}
      {pet && img(pet.restImageUrl, PET_OVERLAYS[pet.species][frame])}
      {hook && hookDef && img(hook, HOOK_AT[frame], hookGlowClass(hookDef))}
    </div>
  )

  const pane = { position: 'relative' as const, width: 320, height: 300, overflow: 'hidden' }
  const sel = { background: '#0d1a24', color: '#cfe0ec', border: '1px solid #2a4358' }

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
        <label>pose&nbsp;
          <select style={sel} value={frame} onChange={e => setFrame(e.target.value as Frame)}>
            {FRAMES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={cycle} onChange={e => setCycle(e.target.checked)} />
          &nbsp;run the cast
        </label>
        <label>rod&nbsp;
          <select style={sel} value={rodTier} onChange={e => setRodTier(Number(e.target.value))}>
            {GLOWING_RODS.map(r => <option key={r.tier} value={r.tier}>{r.name}</option>)}
          </select>
        </label>
        <label>hull&nbsp;
          <select style={sel} value={boatId} onChange={e => setBoatId(e.target.value)}>
            {BOATS.map(b => (
              <option key={b.id} value={b.id}>{hullEffect(b) ? `${b.name} +` : b.name}</option>
            ))}
          </select>
        </label>
        <label>hook&nbsp;
          <select style={sel} value={hookTier} onChange={e => setHookTier(Number(e.target.value))}>
            {HOOKS.map(h => (
              <option key={h.tier} value={h.tier}>{h.glow ? `${h.name} +` : h.name}</option>
            ))}
          </select>
        </label>
        <label>hat&nbsp;
          <select style={sel} value={hatId} onChange={e => setHatId(e.target.value)}>
            {HATS.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label>pet&nbsp;
          <select style={sel} value={petId} onChange={e => setPetId(e.target.value)}>
            <option value="none">none</option>
            {PETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>colour&nbsp;
          <select style={sel} value={colour} onChange={e => setColour(e.target.value)}>
            {CHARACTER_COLORS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} />
          &nbsp;overlay at 50%
        </label>
        {rodDef?.lockedIn && (
          <label style={{ color: '#f0c040' }}>
            streak stage {stage}&nbsp;
            <input type="range" min={0} max={3} step={1} value={stage}
              onChange={e => setStage(Number(e.target.value))} />
          </label>
        )}
      </div>

      <p style={{ color: 'rgba(207,224,236,0.55)', marginTop: 10, maxWidth: 640, lineHeight: 1.6 }}>
        A + marks gear that carries an aura. Overlay mode is for the composition
        rather than the effect: side by side, two nearly-right skiffs look the
        same, and stacked, a two-pixel drift in a hat is obvious.
      </p>
      <p style={{ color: 'rgba(207,224,236,0.55)', marginTop: 8, maxWidth: 640, lineHeight: 1.6 }}>
        Run the cast to check the poses in motion. The cast is where the numbers
        are strangest — the rod swings and shortens, the hook rotates 66 degrees,
        and on the wait the hook disappears because it is in the water. Every
        aura is re-pointed on each pose change, since its part is a different
        picture at a different angle in each one.
      </p>
      <p style={{ color: 'rgba(207,224,236,0.55)', marginTop: 8, maxWidth: 640, lineHeight: 1.6 }}>
        The Locked-In slider is the streak: 0 is dormant and meant to
        disappoint, 3 is ten perfect catches in a row and meant to be slightly
        too much.
      </p>
    </div>
  )
}
