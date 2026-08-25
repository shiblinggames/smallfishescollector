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
import { PLACES, HOME, type Place } from './chart'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { vibrate } from '@/lib/haptics'

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

export default function SeaMap({
  fishingXP, boatArt, characterName,
}: {
  fishingXP: number
  /** The player's EQUIPPED boat. Their cosmetic is the thing on the chart, which
   *  is most of why this reads as your ocean rather than a map screen. */
  boatArt: string
  characterName: string
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
      enter(here)
      return
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

      const speed = Math.hypot(vel.current.x, vel.current.y)
      if (speed > 40) facing.current = vel.current.x >= 0 ? 1 : -1

      // Imperative writes. The whole reason this holds 60fps on a phone.
      const world = worldRef.current
      if (world) world.style.transform = `translate3d(${-pos.current.x}px, ${-pos.current.y}px, 0)`
      const boat = boatRef.current
      if (boat) {
        // Two out-of-phase waves so the bob never reads as a metronome, and a
        // list into the direction of travel.
        const t = now / 1000
        const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
        const heel = Math.max(-7, Math.min(7, (vel.current.x / SPEED) * 7))
        boat.style.transform =
          `translate3d(${pos.current.x}px, ${pos.current.y + bob}px, 0) ` +
          `translate(-50%, -50%) scaleX(${facing.current}) rotate(${heel}deg)`
      }

      // Proximity drives React, but only a few times a second. Nothing on screen
      // needs it faster and it keeps the loop out of the reconciler.
      sinceState += dt
      if (sinceState > 0.12) {
        sinceState = 0
        let found: Place | null = null
        for (const p of PLACES) if (dist(pos.current, p) < p.r) found = p
        setNear(prev => (prev?.id === found?.id ? prev : found))
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
        position: 'fixed', top: 44, bottom: 60, left: 0, right: 0,
        overflow: 'hidden', cursor: 'pointer',
        // The open sea, in the game's own palette: desaturated blue-greys with
        // depth carried by value. Replaced by a painted plate the moment one
        // exists — this is the only invented art on the screen.
        background:
          'radial-gradient(ellipse 120% 90% at 50% 8%, #4a5f68 0%, #2b3f49 34%, #16242c 72%, #0b141a 100%)',
      }}
      className="sea-surface"
    >
      {/* THE WORLD. One transformed layer, so the camera is a single write. */}
      <div ref={worldRef} style={{ position: 'absolute', left: '50%', top: '50%', willChange: 'transform' }}>
        {PLACES.map(p => (
          <PlaceMedallion key={p.id} place={p} locked={locked(p)} isNear={near?.id === p.id} />
        ))}

        {/* The boat rides in the world layer so it sits between places rather
            than over them, and so one transform moves everything together. */}
        <div ref={boatRef} style={{ position: 'absolute', left: 0, top: 0, willChange: 'transform', zIndex: 5 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={boatArt} alt="" draggable={false}
            style={{ display: 'block', width: 132, filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.5))' }} />
        </div>
      </div>

      <Prompt place={near} locked={near ? locked(near) : false} level={level} onEnter={enter} tick={tick} />
      <Compass pos={pos} locked={locked} />
    </div>
  )
}

function dist(a: Vec, p: { x: number; y: number }): number {
  return Math.hypot(a.x - p.x, a.y - p.y)
}

/** A place on the chart: the painted plate, soft-edged so it sits IN the water
 *  rather than on top of it. Ports get land colour and a hard rim; waters get a
 *  wide feathered edge, because a region has no coastline. */
function PlaceMedallion({ place, locked, isNear }: { place: Place; locked: boolean; isNear: boolean }) {
  const isWater = place.kind === 'water'
  const d = place.r * 2
  return (
    <div style={{
      position: 'absolute', left: place.x, top: place.y,
      width: d, height: d, marginLeft: -place.r, marginTop: -place.r,
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
        // Feathered into the sea. A hard circle is the single thing that would
        // make these read as buttons pasted on a background.
        maskImage: isWater
          ? 'radial-gradient(circle, #000 34%, rgba(0,0,0,0.55) 62%, transparent 82%)'
          : 'radial-gradient(circle, #000 62%, rgba(0,0,0,0.75) 78%, transparent 92%)',
        WebkitMaskImage: isWater
          ? 'radial-gradient(circle, #000 34%, rgba(0,0,0,0.55) 62%, transparent 82%)'
          : 'radial-gradient(circle, #000 62%, rgba(0,0,0,0.75) 78%, transparent 92%)',
        opacity: locked ? 0.4 : isWater ? 0.72 : 0.95,
        filter: locked ? 'grayscale(0.85) brightness(0.6)' : 'none',
        transition: 'opacity 260ms ease-out',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={place.art} alt="" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>

      {/* A quiet ring, brighter when you are in it. Enough to say "this is a
          place" without drawing a button around a painting. */}
      <div aria-hidden style={{
        position: 'absolute', inset: isWater ? '18%' : '6%', borderRadius: '50%',
        border: `1px solid rgba(190,214,228,${isNear ? 0.5 : 0.18})`,
        boxShadow: isNear ? '0 0 26px rgba(160,200,225,0.22)' : 'none',
        transition: 'border-color 260ms ease-out, box-shadow 260ms ease-out',
      }} />

      <div style={{
        position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 6px)',
        textAlign: 'center', whiteSpace: 'nowrap',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.92rem', color: locked ? 'rgba(180,192,200,0.55)' : '#dfe9f0',
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
        }}>{place.name}</p>
        <p className="font-karla font-600" style={{
          fontSize: '0.68rem', marginTop: 1,
          color: locked ? 'rgba(200,150,150,0.75)' : 'rgba(180,200,214,0.7)',
          textShadow: '0 1px 8px rgba(0,0,0,0.85)',
        }}>{locked ? `Fishing ${place.minLevel}` : place.blurb}</p>
      </div>
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
              <span className="font-karla font-700" style={{
                fontSize: '0.56rem', color: `rgba(190,214,228,${locked(p) ? 0.35 : 0.7})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.8)',
              }}>{Math.round(d / 10)}m</span>
            </div>
          </div>
        )
      })}
    </>
  )
}
