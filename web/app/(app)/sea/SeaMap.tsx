'use client'

// THE OCEAN HUB.
//
// Painted 2D, in the app, using art that already exists — not a renderer.
//
// The short history is worth keeping, because it is the reason this is shaped
// the way it is. This started as a Godot 3D scene (still in godot/sea, parked).
// The structure that came out of it was right: ports you dock at, waters you
// sail into, distance standing in for progression. The technology was wrong.
// The game's art is hand-painted, and an afternoon went into writing shaders to
// make a 3D renderer LOOK hand-painted, which is backwards when every plate in
// /public already is. Here the house style arrives for free.
//
// Everything moves in WORLD pixels; the viewport translates to follow the boat.
// One rAF loop owns the boat and the camera so they share a clock — nothing here
// animates on its own timer, because that is how a scene ends up feeling like
// several things happening near each other.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { PLACES, HOME, OPEN_SEA, type Place } from './chart'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getCharacterSprites } from '@/lib/characters'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { PET_OVERLAYS, type PetSpecies } from '@/lib/pets'
import { rodGlowClass } from '@/lib/rods'
import { vibrate } from '@/lib/haptics'
import FishingHere, { type FishingMods } from './FishingHere'

/** Metres-per-second in world pixels. Sets how big the chart may be: the longest
 *  crossing anyone tolerates is about ten seconds, and the far zone is ~3,600px
 *  out. */
const SPEED = 470
/** Low is heavy. A boat should take a moment to get going. */
const ACCEL = 2.6
/** Starts easing off here. The gap to ARRIVE is the whole feeling of coasting
 *  into a berth rather than stopping dead like a cursor. */
const SLOW = 240
const ARRIVE = 26

type Vec = { x: number; y: number }

/** '#rrggbb' → [r,g,b]. */
function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const OPEN_RGB = OPEN_SEA.map(rgb) as [number, number, number][]
const WATER_RGB: { x: number; y: number; r: number; c: [number, number, number][] }[] =
  PLACES.filter(p => p.kind === 'water' && p.sea)
    .map(p => ({ x: p.x, y: p.y, r: p.r, c: (p.sea as [string, string, string]).map(rgb) as [number, number, number][] }))

/**
 * THE COLOUR OF THE SEA WHERE YOU ARE.
 *
 * Regions used to be drawn as discs, which gave every zone a visible circular
 * edge you crossed like a doorway — the exact opposite of sailing out of one
 * stretch of water into another. There are no shapes now. Each water is a
 * COLOUR, and the sea is an inverse-distance blend of all of them plus the open
 * ocean, evaluated at the boat every frame.
 *
 * So the Shallows shade into open blue over a few hundred metres, and open blue
 * shades into the near-black of the Abyss, the way a real shelf does. Nothing
 * has an edge, and yet the water genuinely tells you where you are.
 *
 * The falloff is cubic on d/r: inside a water it dominates almost completely,
 * and by about twice its radius it contributes nearly nothing. Linear was far
 * too muddy — everything ended up the average of everything.
 */
function seaAt(p: Vec): string {
  let wSum = 0.55 // the open ocean always has a vote, so nothing goes pure
  const acc: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let k = 0; k < 3; k++) {
    for (let ch = 0; ch < 3; ch++) acc[k][ch] = OPEN_RGB[k][ch] * 0.55
  }
  for (const w of WATER_RGB) {
    const d = Math.hypot(p.x - w.x, p.y - w.y) / w.r
    const weight = 1 / (1 + d * d * d)
    wSum += weight
    for (let k = 0; k < 3; k++) {
      for (let ch = 0; ch < 3; ch++) acc[k][ch] += w.c[k][ch] * weight
    }
  }
  const out = acc.map(c => c.map(v => Math.round(v / wSum)))
  // Painted three ways from the same blend: light on the horizon, mid through
  // the body, dark toward the viewer, which is how open water actually reads
  // from above.
  return (
    `radial-gradient(ellipse 130% 100% at 50% -6%, ` +
    `rgb(${out[2].join(',')}) 0%, ` +
    `rgb(${out[1].join(',')}) 38%, ` +
    `rgb(${out[0].join(',')}) 78%, ` +
    `rgb(${out[0].map(v => Math.max(0, v - 14)).join(',')}) 100%)`
  )
}

export default function SeaMap({
  fishingXP, characterColor, boatId, hatId, mods, gear, bait, baitBonus, baitQty,
}: {
  fishingXP: number
  /** The player's own loadout, so the thing crossing the ocean is the captain
   *  they dressed in the boat they bought — not a marker. */
  characterColor: string
  boatId: string | null
  hatId: string | null
  /** Everything the dial needs to be the REAL dial. See FishingHere. */
  mods: FishingMods
  gear: Gear
  bait: string
  baitBonus: number
  baitQty: number
}) {
  const router = useRouter()
  const level = useMemo(() => getLevelFromXP(fishingXP), [fishingXP])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const boatRef = useRef<HTMLDivElement | null>(null)

  // Position, velocity and target live in refs, not state: they change every
  // frame and re-rendering React sixty times a second to move one sprite is how
  // a map like this ends up dropping frames on a phone.
  const pos = useRef<Vec>({ ...HOME })
  const vel = useRef<Vec>({ x: 0, y: 0 })
  const target = useRef<Vec>({ ...HOME })
  const facing = useRef<1 | -1>(1)

  // Only what the UI actually needs to re-render for.
  const [near, setNear] = useState<Place | null>(null)
  const [tick, setTick] = useState(0)
  /** The water we have the rod out in. Null means sailing. */
  const [fishingIn, setFishingIn] = useState<Place | null>(null)
  /** A zone we have drifted out of with the rod still out, held for a warning
   *  rather than acted on silently. */
  const [leaving, setLeaving] = useState<Place | null>(null)
  const [baitLeft, setBaitLeft] = useState(baitQty)
  /** Which pose the captain is in. The game already draws three — rod up,
   *  line in the water, mid-cast — so the map uses the same ones rather than
   *  inventing a fourth. `wait` during the bite wait is most of the missing
   *  feedback: the line is visibly IN the water. */
  const [frame, setFrame] = useState<'rest' | 'wait' | 'cast'>('rest')
  // Mirrored so the rAF loop can read it without being re-created every time it
  // changes, which would restart the sweep.
  const fishingRef = useRef<Place | null>(null)
  useEffect(() => { fishingRef.current = fishingIn }, [fishingIn])

  const locked = useCallback((p: Place) => level < p.minLevel, [level])

  /** Screen point to world point, through the current camera translation. */
  const toWorld = useCallback((clientX: number, clientY: number): Vec | null => {
    const wrap = wrapRef.current
    if (!wrap) return null
    const r = wrap.getBoundingClientRect()
    return {
      x: clientX - r.left - r.width / 2 + pos.current.x,
      y: clientY - r.top - r.height / 2 + pos.current.y,
    }
  }, [])

  const enter = useCallback((p: Place) => {
    vibrate([18, 40, 24])
    router.push(p.href)
  }, [router])

  const onTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const pt = 'touches' in e
      ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
    const w = toWorld(pt.x, pt.y)
    if (!w) return

    // Tapping the place you are already at is the second half of the trip.
    // Checked first, or the tap would just re-issue a course to where you are.
    const here = near
    if (here && !locked(here) && dist(w, here) < here.r) {
      // Ports only. A water is fished from the prompt, in one press — tapping
      // the water a second time to confirm was a gate on a decision already
      // made, and it meant every tap inside a zone you were sitting in did
      // something you did not ask for.
      if (here.kind === 'port') { enter(here); return }
    }

    // Tapping ON a place courses for its edge, so you pull alongside a port
    // rather than trying to sail into it. A water you go into properly.
    for (const p of PLACES) {
      if (dist(w, p) < p.r) {
        if (p.kind === 'water') { target.current = { x: p.x, y: p.y }; return }
        const dx = pos.current.x - p.x
        const dy = pos.current.y - p.y
        const m = Math.hypot(dx, dy) || 1
        target.current = { x: p.x + (dx / m) * p.r * 0.92, y: p.y + (dy / m) * p.r * 0.92 }
        return
      }
    }
    target.current = w
  }, [toWorld, near, locked, enter])

  // ── THE ONE LOOP ─────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let sinceState = 0

    const step = (now: number) => {
      // Clamped delta: a backgrounded tab returns with an enormous gap, and an
      // unclamped one would teleport the boat across the chart.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const dx = target.current.x - pos.current.x
      const dy = target.current.y - pos.current.y
      const d = Math.hypot(dx, dy)

      let want = 0
      if (d > ARRIVE) {
        const t = Math.min(1, (d - ARRIVE) / (SLOW - ARRIVE))
        want = SPEED * (t * t * (3 - 2 * t))
      }
      const wx = d > 0.001 ? (dx / d) * want : 0
      const wy = d > 0.001 ? (dy / d) * want : 0
      const k = Math.min(1, ACCEL * dt)
      vel.current.x += (wx - vel.current.x) * k
      vel.current.y += (wy - vel.current.y) * k
      pos.current.x += vel.current.x * dt
      pos.current.y += vel.current.y * dt

      // WHICH WAY THE CAPTAIN FACES.
      //
      // The sprite is drawn facing LEFT — that is the pose, rod out to port —
      // so sailing left is the un-mirrored image and sailing right flips it.
      // It was the other way round.
      //
      // And the test is on the X component alone with a real deadband, not on
      // total speed. Sailing nearly straight up or down leaves vx hovering
      // around zero, and reading its sign every frame had the boat flipping
      // several times a second, which is the "no pattern" of it. Below the
      // deadband it simply keeps whatever it was facing.
      if (Math.abs(vel.current.x) > 70) facing.current = vel.current.x < 0 ? 1 : -1

      // Imperative writes. The whole reason this holds 60fps on a phone.
      const world = worldRef.current
      if (world) world.style.transform = `translate3d(${-pos.current.x}px, ${-pos.current.y}px, 0)`
      // The sea recoloured under the boat. One style write per frame, and the
      // reason there are no zone edges anywhere on the chart.
      const wrap = wrapRef.current
      if (wrap) wrap.style.background = seaAt(pos.current)
      const boat = boatRef.current
      if (boat) {
        // Screen-space only: the bob, the heel and which way it faces. Position
        // is not this element's business any more.
        const t = now / 1000
        const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
        const heel = Math.max(-7, Math.min(7, (vel.current.x / SPEED) * 7))
        boat.style.transform =
          `translate(-50%, -50%) translateY(${bob}px) scaleX(${facing.current}) rotate(${heel}deg)`
      }

      // Proximity drives React, but only a few times a second. Nothing on screen
      // needs it faster and it keeps the loop out of the reconciler.
      sinceState += dt
      if (sinceState > 0.12) {
        sinceState = 0
        let found: Place | null = null
        for (const p of PLACES) if (dist(pos.current, p) < p.r) found = p
        setNear(prev => (prev?.id === found?.id ? prev : found))
        // LEAVING WITH THE ROD OUT. Caught here rather than in the tap handler
        // because you can sail out of a zone by tapping open water far away,
        // and the moment that matters is crossing the boundary, not the tap.
        const fishing = fishingRef.current
        if (fishing && (!found || found.id !== fishing.id)) {
          setLeaving(prev => prev ?? fishing)
        }
        setTick(v => (v + 1) % 1000)
      }

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={wrapRef}
      onClick={onTap}
      style={{
        cursor: 'pointer',
        // Background is written every frame by the loop — see seaAt. This is
        // only the colour before the first frame lands.
        background: seaAt(HOME),
      }}
      className="sea-surface"
    >
      {/* THE WORLD. One transformed layer, so the camera is a single write. */}
      <div ref={worldRef} style={{ position: 'absolute', left: '50%', top: '50%', willChange: 'transform' }}>
        {PLACES.map(p => (
          <PlaceIsland key={p.id} place={p} locked={locked(p)} isNear={near?.id === p.id} />
        ))}
      </div>

      {/* THE BOAT SITS AT THE CENTRE OF THE SCREEN AND STAYS THERE.
          It used to live inside the world layer at its world position, with the
          world translated by the negative of that — which composes to dead
          centre, and is a needlessly clever way of saying "the middle". It also
          made the boat invisible for reasons I could not reproduce by reading,
          which is reason enough on its own.
          The camera follows the boat, so relative to the screen the boat never
          moves. Only the sea does. That is both simpler and what a camera-follow
          actually means. */}
      <div ref={boatRef}
        style={{
          position: 'absolute', left: '50%', top: '50%', zIndex: 5,
          willChange: 'transform', pointerEvents: 'none',
        }}>
        <Skipper characterColor={characterColor} boatId={boatId} hatId={hatId} gear={gear} frame={frame} />
      </div>

      {/* The prompt steps aside while the rod is out — the cast button is the
          only thing that should be asking for a thumb down there. */}
      {!fishingIn && (
        <Prompt
          place={near}
          locked={near ? locked(near) : false}
          level={level}
          // A water does not navigate. Pressing "Fish The Shallows" puts the rod
          // in your hands where you are floating; only a port is a door.
          onEnter={p => { if (p.kind === 'water') { setFishingIn(p); vibrate(14) } else enter(p) }}
          tick={tick}
        />
      )}
      <WaterBanner place={near && near.kind === 'water' ? near : null} locked={near ? locked(near) : false} />
      <Compass pos={pos} locked={locked} />

      {fishingIn && (
        <FishingHere
          zone={fishingIn.id}
          zoneName={fishingIn.name}
          bait={bait}
          baitBonus={baitBonus}
          baitLeft={baitLeft}
          mods={mods}
          onBaitSpent={left => { if (typeof left === 'number') setBaitLeft(left) }}
          onPose={setFrame}
          onClose={() => { setFishingIn(null); setFrame('rest') }}
        />
      )}

      {/* LEAVING THE WATER. Sailing out with the rod out is a decision, so it
          is asked rather than done. The wording is exact on purpose: sailing
          away does NOT break a perfect streak in this game — only casting in a
          different zone does, and returning to the same water keeps it. Saying
          "you will lose your streak" here would be a lie that costs people
          casts they did not need to spend. */}
      {leaving && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'absolute', inset: 0, zIndex: 40, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          background: 'rgba(2,8,14,0.72)', backdropFilter: 'blur(3px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 340, borderRadius: 16, padding: '1.2rem',
            textAlign: 'center', background: 'rgba(8,16,24,0.98)',
            border: '1px solid rgba(180,214,232,0.35)',
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#e8f0f6' }}>
              Leaving {leaving.name}
            </p>
            <p className="font-karla" style={{ fontSize: '0.84rem', color: '#9fb4c2', marginTop: 8, lineHeight: 1.5 }}>
              Your line comes in. The streak you have built here holds while you sail
              and only breaks if you cast in different water.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setLeaving(null); setFishingIn(null) }}
                className="font-cinzel font-700"
                style={{
                  flex: 1, padding: '0.7rem', borderRadius: 11, fontSize: '0.86rem',
                  color: '#f2ead8', background: 'rgba(180,214,232,0.16)',
                  border: '1px solid rgba(180,214,232,0.45)', cursor: 'pointer',
                }}>
                Sail on
              </button>
              <button onClick={() => {
                // Back to where the rod is. Cancelling has to actually return
                // you, or the boat keeps drifting and asks again immediately.
                const back = leaving
                target.current = { x: back.x, y: back.y }
                setLeaving(null)
              }}
                className="font-karla font-700"
                style={{
                  flex: 1, padding: '0.7rem', borderRadius: 11, fontSize: '0.86rem',
                  color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
                }}>
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function dist(a: Vec, p: { x: number; y: number }): number {
  return Math.hypot(a.x - p.x, a.y - p.y)
}

/**
 * THE CAPTAIN, in their boat.
 *
 * Exactly the stack the fishing screen uses: the character sprite is the BASE
 * (it already contains a plain hull), and the bought boat and hat are overlays
 * positioned on top of it as percentages of the character box. Reusing that
 * composition rather than inventing one means a new hat or hull shows up out
 * here the day it ships, with no second set of coordinates to keep in step.
 *
 * The `rest` frame throughout. `cast` is a fishing pose and has no business on
 * open water.
 */
export type Gear = {
  /** A slug rod has three per-frame sprites at `/${slug}_${frame}.png`. Every
   *  high tier is one of these. */
  rodSlug: string | null
  /** A single-image rod, reused across frames. Null on the low tiers, whose
   *  rods are painted into the character sprite and have no overlay at all —
   *  that null is correct rather than missing. */
  rod: string | null
  rodGlow: string | null
  rodColor: string | null
  reel: string | null
  hook: string | null
  pet: string | null
  petArt: string | null
}

/** Overlay coordinates, lifted verbatim from FishingGame. Every rod, reel and
 *  hook tier is uploaded on the same canvas, so one set of numbers lines up all
 *  of them — which is also why copying the table is safe rather than fragile. */
const ROD_AT = {
  rest: { top: 37, left: -12, width: 107.5, rotate: 0 },
  wait: { top: 37.5, left: -8, width: 107.5, rotate: 0 },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0 },
} as const
const REEL_AT = {
  rest: { top: 15, left: -10.3, width: 222, rotate: -18 },
  wait: { top: -5.2, left: -3.1, width: 222, rotate: -36.5 },
  cast: { top: 38.9, left: -42, width: 219.5, rotate: 46.5 },
} as const
const HOOK_AT = {
  rest: { top: 39.5, left: -10.5, width: 204.5, rotate: 0, hidden: false },
  // Hidden on the wait frame because the hook is in the water during the bite.
  wait: { top: 39.5, left: -10.5, width: 222, rotate: 0, hidden: true },
  cast: { top: 40.5, left: -73, width: 204.5, rotate: 66.5, hidden: false },
} as const

function Skipper({ characterColor, boatId, hatId, gear, frame }: {
  characterColor: string
  boatId: string | null
  hatId: string | null
  gear: Gear
  frame: 'rest' | 'wait' | 'cast'
}) {
  const char = useMemo(() => getCharacterSprites(characterColor), [characterColor])
  const boat = useMemo(() => BOATS.find(b => b.id === boatId) ?? null, [boatId])
  const hat = useMemo(() => HATS.find(h => h.id === hatId) ?? null, [hatId])
  const rc = ROD_AT[frame]
  const rec = REEL_AT[frame]
  const hc = HOOK_AT[frame]

  return (
    <div style={{
      position: 'relative', width: 210,
      // The sprite sheet reserves a large empty region up and to the left for
      // the rod and line, so the hull sits low and right of the image centre.
      // This offset puts the BOAT in the middle of the screen rather than the
      // bounding box, which is what the camera is actually following.
      transform: 'translate(-8%, -26%)',
      filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.55))',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={char[frame]} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
      {hat && (
        /* PER FRAME, like everything else on the character. It was pinned to
           `rest`, so the moment the cast pose played the bandana stayed where
           the head had been and floated off the captain. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={frame === 'cast' ? hat.castImageUrl : hat.restImageUrl} alt="" draggable={false} style={{
          position: 'absolute',
          top: `${hat.positions[frame].top}%`,
          left: `${hat.positions[frame].left}%`,
          width: `${hat.positions[frame].width}%`,
          transform: `rotate(${hat.positions[frame].rotate}deg)`,
          transformOrigin: 'center center',
        }} />
      )}
      {boat && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={frame === 'cast' ? boat.castImageUrl : boat.restImageUrl} alt="" draggable={false}
          className={boat.glow ? 'boat-glow' : undefined}
          style={{
            position: 'absolute',
            top: `${boat.positions[frame].top}%`,
            left: `${boat.positions[frame].left}%`,
            width: `${boat.positions[frame].width}%`,
            transform: `rotate(${boat.positions[frame].rotate}deg)`,
            transformOrigin: 'center center',
          }} />
      )}
      {(gear.rodSlug || gear.rod) && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={gear.rodSlug ? `/${gear.rodSlug}_${frame}.png` : (gear.rod as string)} alt="" draggable={false}
          className={gear.rodGlow ? rodGlowClass({ glow: true, glowType: gear.rodGlow } as never) : undefined}
          style={{
            position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
            width: `${rc.width}%`, maxWidth: 'none',
            transform: `rotate(${rc.rotate}deg)`, transformOrigin: 'bottom right',
            ...(gear.rodColor ? { ['--rod-glow-color' as string]: gear.rodColor } : {}),
          } as React.CSSProperties} />
      )}
      {gear.reel && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={gear.reel} alt="" draggable={false} style={{
          position: 'absolute', top: `${rec.top}%`, left: `${rec.left}%`,
          width: `${rec.width}%`, maxWidth: 'none',
          transform: `rotate(${rec.rotate}deg)`, transformOrigin: 'center center',
        }} />
      )}
      {gear.pet && gear.petArt && (() => {
        const pc = PET_OVERLAYS[gear.pet as PetSpecies]?.[frame]
        if (!pc) return null
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={gear.petArt} alt="" draggable={false} style={{
            position: 'absolute', top: `${pc.top}%`, left: `${pc.left}%`,
            width: `${pc.width}%`, maxWidth: 'none',
            transform: `rotate(${pc.rotate}deg)`, transformOrigin: 'center center',
          }} />
        )
      })()}
      {gear.hook && !hc.hidden && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={gear.hook} alt="" draggable={false} style={{
          position: 'absolute', top: `${hc.top}%`, left: `${hc.left}%`,
          width: `${hc.width}%`, maxWidth: 'none',
          transform: `rotate(${hc.rotate}deg)`, transformOrigin: 'center center',
        }} />
      )}
    </div>
  )
}

/**
 * A PLACE ON THE WATER.
 *
 * Not a picture floating on a background. A port is LAND — an island silhouette
 * with the painted plate showing through it as its surface, a shoreline, and a
 * jetty running out into the water where you tie up. A water is a REGION, drawn
 * as a stretch of sea that has changed colour, with no coastline at all because
 * it does not have one.
 *
 * The island shape is generated per place from its id, so no two are the same
 * outline and a row of them never reads as a row of buttons.
 *
 * This is scaffolding for real art, not a substitute for it. Every plate here is
 * a scene painting doing duty as terrain; a purpose-painted island or dock plate
 * drops straight into `art` and this shape logic keeps working under it.
 */
/** Foam and weed sizes for the drift scatter. Hand-picked rather than random so
 *  a zone always looks the same, and varied enough that it never tiles. */
const DRIFT = [
  { w: 46, h: 9, a: 0.16, blur: 5 }, { w: 28, h: 6, a: 0.13, blur: 4 },
  { w: 62, h: 11, a: 0.10, blur: 7 }, { w: 34, h: 7, a: 0.18, blur: 3 },
  { w: 52, h: 8, a: 0.12, blur: 6 }, { w: 24, h: 5, a: 0.20, blur: 2 },
  { w: 70, h: 12, a: 0.09, blur: 8 }, { w: 38, h: 7, a: 0.15, blur: 4 },
  { w: 30, h: 6, a: 0.14, blur: 3 }, { w: 56, h: 10, a: 0.11, blur: 6 },
]

function PlaceIsland({ place, locked, isNear }: { place: Place; locked: boolean; isNear: boolean }) {
  const isWater = place.kind === 'water'
  const d = place.r * 2

  // An irregular coastline, seeded off the id so it is stable across renders and
  // different for every island.
  const clip = useMemo(() => {
    let h = 0
    for (let i = 0; i < place.id.length; i++) h = (h * 31 + place.id.charCodeAt(i)) >>> 0
    const pts: string[] = []
    const N = 26
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N
      const wobble =
        0.085 * Math.sin(a * 3 + (h % 100) / 12) +
        0.05 * Math.cos(a * 5 - (h % 70) / 9) +
        0.028 * Math.sin(a * 8 + (h % 40) / 5)
      const r = 46 + wobble * 100
      pts.push(`${(50 + Math.cos(a) * r).toFixed(2)}% ${(50 + Math.sin(a) * r).toFixed(2)}%`)
    }
    return `polygon(${pts.join(', ')})`
  }, [place.id])

  return (
    <div style={{
      position: 'absolute', left: place.x, top: place.y,
      width: d, height: d, marginLeft: -place.r, marginTop: -place.r,
      pointerEvents: 'none',
    }}>
      {isWater ? (
        /* NO SHAPE AT ALL. The water itself is already telling you where you
           are — seaAt blends the whole background toward this zone's colour as
           you approach, so the Shallows shade into open blue and open blue
           shades into the near-black of the Abyss the way a real shelf does.
           Drawing anything with an edge on top of that would put back the
           doorway the blend exists to remove.

           What is left is DRIFT: a scatter of foam and weed, thicker toward the
           middle, so open water still has something in it to read at speed.
           Positions come off the id, so a zone's drift is its own and never
           moves between renders. */
        <>
          {DRIFT.map((f, i) => {
            const seed = (place.id.charCodeAt(i % place.id.length) * (i + 7)) % 97
            const ang = (seed / 97) * Math.PI * 2
            const rad = (0.22 + ((seed % 11) / 11) * 0.66) * place.r
            return (
              <div key={i} aria-hidden style={{
                position: 'absolute',
                left: place.r + Math.cos(ang) * rad,
                top: place.r + Math.sin(ang) * rad,
                width: f.w, height: f.h,
                marginLeft: -f.w / 2, marginTop: -f.h / 2,
                borderRadius: '50%',
                background: locked ? 'rgba(150,164,178,0.10)' : `rgba(214,232,238,${f.a})`,
                filter: `blur(${f.blur}px)`,
                transform: `rotate(${seed * 3.7}deg) scaleX(${1.4 + (seed % 5) * 0.5})`,
              }} />
            )
          })}
          {locked && (
            /* Weather, not a wall. A locked water is one you can SEE is bad:
               squall streaks that fade out with no boundary anywhere. */
            <div aria-hidden style={{
              position: 'absolute', inset: '4%',
              background: 'repeating-linear-gradient(58deg, rgba(150,164,178,0.13) 0 8px, transparent 8px 22px)',
              maskImage: 'radial-gradient(circle, #000 20%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 20%, transparent 72%)',
            }} />
          )}
        </>
      ) : (
        <>
          {/* SHOALS, then SHORE, then LAND. Three rings so the island meets the
              sea through shallow water rather than on a cut line. */}
          <div aria-hidden style={{
            position: 'absolute', inset: '2%', clipPath: clip,
            background: 'rgba(150,190,205,0.16)', filter: 'blur(6px)',
          }} />
          <div aria-hidden style={{
            position: 'absolute', inset: '10%', clipPath: clip,
            background: 'rgba(196,214,222,0.34)',
          }} />
          <div style={{
            position: 'absolute', inset: '13%', clipPath: clip, overflow: 'hidden',
            filter: locked ? 'grayscale(0.9) brightness(0.55)' : 'brightness(0.94) saturate(0.92)',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.55)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={place.art} alt="" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>

          {/* THE JETTY. What makes it a port rather than a rock: somewhere to
              tie up, running out from the shore into open water. */}
          <div aria-hidden style={{
            position: 'absolute', left: '50%', top: '78%', width: place.r * 0.62, height: 11,
            transform: 'translateX(-6%) rotate(9deg)',
            background: 'linear-gradient(180deg, #6d5636, #3d2f1d)',
            borderRadius: 2,
            boxShadow: '0 3px 10px rgba(0,0,0,0.55)',
            opacity: locked ? 0.4 : 1,
          }} />
          {[0.34, 0.58, 0.82].map(f => (
            <div key={f} aria-hidden style={{
              position: 'absolute', left: `calc(50% + ${place.r * 0.62 * f - 6}px)`, top: '80%',
              width: 5, height: 15, background: '#2e2416', borderRadius: 1,
              transform: 'rotate(9deg)', opacity: locked ? 0.4 : 0.9,
            }} />
          ))}

          {/* A lantern on the end of the jetty. The thing you steer toward at
              distance, and the only warm colour on the whole chart. */}
          <div aria-hidden style={{
            position: 'absolute', left: `calc(50% + ${place.r * 0.56}px)`, top: '72%',
            width: 13, height: 13, borderRadius: '50%',
            background: locked ? 'rgba(150,160,170,0.5)' : '#ffd986',
            boxShadow: locked ? 'none' : `0 0 ${isNear ? 26 : 15}px 6px rgba(255,196,110,${isNear ? 0.5 : 0.3})`,
            transition: 'box-shadow 300ms ease-out',
          }} />
        </>
      )}

      {/* PORTS ONLY. A port is a thing with a name board on it. A water is not:
          its name used to hang in the middle of the sea like a label on a map,
          which is exactly the map-not-place feeling the blend was undoing. The
          water tells you where you are by its colour, and the banner at the top
          says it in words when you cross. */}
      {!isWater && (
        <div style={{
          position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 8px)',
          textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          <p className="font-cinzel font-700" style={{
            fontSize: '0.96rem', color: locked ? 'rgba(180,192,200,0.55)' : '#e6eef4',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}>{place.name}</p>
          <p className="font-karla font-600" style={{
            fontSize: '0.7rem', marginTop: 1,
            color: locked ? 'rgba(206,152,152,0.8)' : 'rgba(184,204,218,0.72)',
            textShadow: '0 1px 9px rgba(0,0,0,0.9)',
          }}>{locked ? `Fishing ${place.minLevel}` : place.blurb}</p>
        </div>
      )}
    </div>
  )
}

/** The dock prompt. Says what to do, or why you cannot. */
function Prompt({ place, locked, level, onEnter, tick }: {
  place: Place | null; locked: boolean; level: number
  onEnter: (p: Place) => void; tick: number
}) {
  if (!place) return null
  const verb = place.kind === 'port' ? 'Go ashore at' : 'Fish'
  return (
    <div key={tick > -1 ? place.id : place.id}
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 22,
        display: 'flex', justifyContent: 'center', padding: '0 1rem',
      }}>
      <button
        onClick={e => { e.stopPropagation(); if (!locked) onEnter(place) }}
        disabled={locked}
        className="font-cinzel font-700"
        style={{
          padding: '0.72rem 1.5rem', borderRadius: 999, fontSize: '0.94rem',
          color: locked ? 'rgba(210,170,170,0.9)' : '#f2ead8',
          background: locked ? 'rgba(12,10,14,0.82)' : 'rgba(10,20,28,0.86)',
          border: `1px solid ${locked ? 'rgba(200,130,130,0.4)' : 'rgba(180,214,232,0.45)'}`,
          boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
          cursor: locked ? 'default' : 'pointer',
        }}>
        {locked
          ? `${place.name} needs Fishing ${place.minLevel} — you are ${level}`
          : `${verb} ${place.name}`}
      </button>
    </div>
  )
}

/**
 * WHERE YOU ARE, along the top.
 *
 * Replaces the zone names that used to hang in the middle of the sea like
 * labels on a map — which was the map-not-place feeling the colour blend exists
 * to undo. The water already tells you where you are; this says it in words
 * only when it changes, then gets out of the way.
 *
 * It brightens on the crossing and then settles to something you can read if
 * you go looking but never notice otherwise. Two jobs, one element: "you have
 * entered somewhere new" and "what am I in".
 */
function WaterBanner({ place, locked }: { place: Place | null; locked: boolean }) {
  const [shown, setShown] = useState<Place | null>(null)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (place?.id === shown?.id) return
    setShown(place)
    if (!place) return
    // The flare is the crossing. It decays on its own; nothing else needs to
    // know it happened.
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 2600)
    return () => clearTimeout(t)
  }, [place, shown])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div key={shown.id}
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.35 } }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 0, right: 0, top: 18,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
          }}>
          <motion.p className="font-cinzel font-700"
            animate={{ opacity: fresh ? 1 : 0.42 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{
              fontSize: '0.92rem', letterSpacing: '0.22em', textTransform: 'uppercase',
              color: locked ? 'rgba(214,176,176,0.95)' : '#dfeaf2',
              textShadow: '0 2px 14px rgba(0,0,0,0.95)',
            }}>
            {shown.name}
          </motion.p>
          <motion.div aria-hidden
            animate={{ opacity: fresh ? 0.5 : 0.12, width: fresh ? 96 : 46 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{ height: 1, marginTop: 5, background: 'rgba(214,232,240,0.9)' }} />
          {locked && fresh && (
            <motion.p className="font-karla font-600"
              initial={{ opacity: 0 }} animate={{ opacity: 0.9 }}
              style={{
                fontSize: '0.68rem', marginTop: 6, color: 'rgba(214,166,166,0.95)',
                textShadow: '0 1px 10px rgba(0,0,0,0.95)',
              }}>
              Fishing {shown.minLevel} to work this water
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Off-screen pointers. Not decoration: open water with nothing in view is the
 *  classic hub failure — you cannot tell whether there is anything out there or
 *  which way, so you stop exploring. Distance matters as much as direction. */
function Compass({ pos, locked }: { pos: React.RefObject<Vec>; locked: (p: Place) => boolean }) {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(v => v + 1), 120)
    return () => clearInterval(id)
  }, [])
  const here = pos.current ?? HOME
  return (
    <>
      {PLACES.map(p => {
        const dx = p.x - here.x
        const dy = p.y - here.y
        const d = Math.hypot(dx, dy)
        if (d < 620) return null
        const a = Math.atan2(dy, dx)
        return (
          <div key={p.id} aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: `rotate(${a}rad) translateX(min(38vw, 190px))`,
            pointerEvents: 'none',
          }}>
            <div style={{
              transform: `rotate(${-a}rad) translate(-50%, -50%)`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span style={{
                width: 0, height: 0, transform: `rotate(${a + Math.PI / 2}rad)`,
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderBottom: `9px solid rgba(190,214,228,${locked(p) ? 0.3 : 0.62})`,
              }} />
              {/* NAME FIRST, then distance. An arrow with only a number on it
                  tells you something is 340m away and leaves you to sail there
                  to find out what — which is not navigation, it is a guess. */}
              <span className="font-cinzel font-700" style={{
                fontSize: '0.6rem', whiteSpace: 'nowrap',
                color: `rgba(214,232,240,${locked(p) ? 0.42 : 0.88})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{p.name}</span>
              <span className="font-karla font-700" style={{
                fontSize: '0.54rem', marginTop: -1,
                color: `rgba(190,214,228,${locked(p) ? 0.3 : 0.6})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{Math.round(d / 10)}m</span>
            </div>
          </div>
        )
      })}
    </>
  )
}
