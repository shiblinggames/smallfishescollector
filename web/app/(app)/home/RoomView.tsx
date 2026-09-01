'use client'

// ── THE INSIDE, ONE ROOM AT A TIME ──────────────────────────────────────────
//
// The house used to be a single room that swapped shell as it grew. It is a set
// of rooms now, stepped through with arrows, and the house tier decides how many
// doors there are — which is what makes a bigger house feel bigger from INSIDE
// rather than only better decorated.
//
// ── THREE OF THEM ARE NOT FURNISHED, AND THAT IS THE POINT ──────────────────
//
// The main room is filled with what you BOUGHT. The other three are filled with
// what you DID: every badge and every species in the gallery, every pet you ever
// took in standing about the menagerie, every giant you ever landed on the
// trophy room wall. That is the whole difference between them, and it is why
// they are worth walking to rather than being three more shopping tabs.
//
// ── AND THE SHELLS ARE EMPTY ────────────────────────────────────────────────
//
// Every room was regenerated bare. The old art had its fixtures painted in — a
// stone fireplace in the cottage, a carved mantel in the estate — so the hearth
// ladder was drawn on top of a fireplace that was already part of the wall. All
// eight share one vanishing point and one horizon, so a piece placed at 34% of
// the way across sits on the same spot of back wall in every one of them.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import {
  openRooms, roomArt, roomSpots, openSlots, furnishingIn, houseTier,
  type Homestead, type RoomDef, type FurnitureSlot,
} from '@/lib/homestead'
import { PETS } from '@/lib/pets'
import { BADGE_MAP } from '@/lib/badges'

const SEA = 'rgba(180,214,232'
const GOLD = '#f0c040'

/** Back to front. The rug is underneath everything, the hearth stands against
 *  the back wall with its mount hanging above it, and the two corner pieces are
 *  level with the fire on either side of it. */
const ROOM_ORDER: FurnitureSlot[] = ['floor', 'hearth', 'mount', 'cornerL', 'cornerR']

export default function RoomView({ home, unlocked, pets, species, giants, guest }: {
  home: Homestead
  /** Badge ids earned, for the gallery wall. */
  unlocked: string[]
  /** Pet ids owned, for the menagerie. Every one, not the equipped one — a room
   *  that shows the pet already following your boat is a room with nothing in it
   *  you could not see from the water. */
  pets: string[]
  /** Species logged and the total, for the gallery's other half. */
  species: { logged: number; total: number }
  /** Ancient giants landed, for the trophy room. */
  giants: { name: string; art: string }[]
  guest?: string | null
}) {
  const rooms = useMemo(() => openRooms(home), [home])
  const [i, setI] = useState(0)
  const room = rooms[Math.min(i, rooms.length - 1)]
  const tier = houseTier(home)

  const go = (d: number) => {
    vibrate(6)
    setI(prev => (prev + d + rooms.length) % rooms.length)
  }

  return (
    <div>
      {/* ── THE DOOR YOU ARE STANDING IN ──────────────────────────────
          Name, what it is for, and the arrows. The count is on the arrows
          rather than as dots: at four rooms dots are a decoration, and "2 of 4"
          answers the question dots are pretending to. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-800" style={{ fontSize: '1.12rem', color: '#f2ede2', lineHeight: 1.1 }}>
            {room.name}
          </p>
          <p className="font-karla" style={{ fontSize: '0.76rem', color: `${SEA},0.6)`, marginTop: 2 }}>
            {room.blurb}
          </p>
        </div>
        {rooms.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Arrow dir="left" onClick={() => go(-1)} />
            <span className="font-karla font-700" style={{
              fontSize: '0.7rem', color: `${SEA},0.55)`, fontVariantNumeric: 'tabular-nums',
              minWidth: 34, textAlign: 'center',
            }}>{i + 1} / {rooms.length}</span>
            <Arrow dir="right" onClick={() => go(1)} />
          </div>
        )}
      </div>

      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1008 / 666',
        borderRadius: 14, overflow: 'hidden',
        border: '1px solid rgba(180,214,232,0.18)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
      }}>
        <AnimatePresence mode="wait">
          <motion.div key={room.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'absolute', inset: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={roomArt(room, tier)} alt="" draggable={false} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            }} />
            {room.id === 'main' && <Furnished home={home} room={room} houseTier={tier} />}
            {/* THE THREE CONTENT ROOMS all flow their things inside a box that
                was placed on the bench, so a badge wall is never on the
                skirting board and pets are never floating up the glass. */}
            {room.id === 'gallery' && <Box at={room.content}><GalleryWall unlocked={unlocked} species={species} /></Box>}
            {room.id === 'menagerie' && <Menagerie pets={pets} at={room.content} />}
            {room.id === 'trophy' && <Box at={room.content}><TrophyWall giants={giants} /></Box>}
          </motion.div>
        </AnimatePresence>
      </div>

      {guest && (
        <p className="font-karla" style={{ fontSize: '0.74rem', color: `${SEA},0.5)`, marginTop: 8 }}>
          You are looking at {guest}&rsquo;s rooms.
        </p>
      )}
    </div>
  )
}

/** The placed area a room's contents flow inside. Centre-anchored, because what
 *  is being positioned is a region rather than a thing that stands on a floor. */
function Box({ at, children }: {
  at?: { x: number; y: number; w: number }; children: React.ReactNode
}) {
  const a = at ?? { x: 50, y: 50, w: 76 }
  return (
    <div style={{
      position: 'absolute', left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`,
      transform: 'translate(-50%, -50%)',
    }}>{children}</div>
  )
}

function Arrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.9 }}
      aria-label={dir === 'left' ? 'Previous room' : 'Next room'}
      style={{
        width: 30, height: 30, borderRadius: '50%', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)', border: `1px solid ${SEA},0.24)`,
        color: `${SEA},0.85)`,
      }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
      </svg>
    </motion.button>
  )
}

/** The main room: what you bought, standing where the shell says it stands. */
function Furnished({ home, room, houseTier }: { home: Homestead; room: RoomDef; houseTier: number }) {
  const spots = roomSpots(room, houseTier)
  const open = openSlots(home)
  if (!spots) return null
  return (
    <>
      {ROOM_ORDER.map(slot => {
        // A slot the house has no room for yet shows nothing, even if a
        // furnishing is recorded against it from a bigger house.
        if (!open.includes(slot)) return null
        const item = furnishingIn(home, slot)
        if (!item.art) return null
        const spot = spots[slot]
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={slot} src={item.art} alt="" draggable={false} style={{
            position: 'absolute',
            left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`,
            // Anchored at its BOTTOM CENTRE, because everything in a room sits
            // on something. Anchoring the middle makes a piece float the moment
            // its art is a different height from the last one.
            transform: 'translate(-50%, -100%)',
          }} />
        )
      })}
    </>
  )
}

/**
 * THE GALLERY: badges on the rail, and the Almanac's count under them.
 *
 * Hung on the picture rail the shell was painted with, which is why the room
 * needed its own art rather than a redressed cottage — badges pinned to a
 * plastered wall look like stickers.
 */
function GalleryWall({ unlocked, species }: {
  unlocked: string[]; species: { logged: number; total: number }
}) {
  // Newest first: a wall that grows from the left is a wall where the thing you
  // just earned is buried at the end of a queue.
  const badges = unlocked.slice(-18).reverse()
  return (
    <>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '2%', justifyContent: 'center',
      }}>
        {badges.map(id => {
          const b = BADGE_MAP[id]
          if (!b) return null
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={id} src={b.imageUrl} alt={b.name} title={b.name} draggable={false}
              style={{ width: '10%', filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.4))' }} />
          )
        })}
      </div>
      <p className="font-karla font-700" style={{
        textAlign: 'center', marginTop: '4%', fontSize: '0.8rem', color: '#6a5f4c',
      }}>
        {unlocked.length} badges · {species.logged} of {species.total} species logged
      </p>
    </>
  )
}

/**
 * THE MENAGERIE: every pet you ever took in, not the one that is out.
 *
 * The equipped pet already swims beside the hull, so a room that showed only
 * that one would be a room with nothing in it you could not see from the water.
 * The whole collection is the reason to open the door.
 *
 * ── AND THEY ARE NOT A LIST ─────────────────────────────────────────────────
 *
 * They were: a centred flex-wrap that shrank every animal as you collected more,
 * so the reward for taking in a twentieth pet was that the other nineteen got
 * smaller. That reads as an inventory grid, and an inventory grid of animals is
 * a spreadsheet with faces on it.
 *
 * They wander now. Each one is its own creature with its own speed, its own idea
 * of when to stop, and its own patch of floor, and it turns to face the way it
 * is going. Nothing about it is interactive and nothing about it should be: the
 * whole feeling is walking into a room where things were already happening
 * without you, which is exactly what a menagerie is and exactly what a list of
 * thumbnails can never be.
 *
 * ── THE PEN IS THE BENCH'S BOX ──────────────────────────────────────────────
 *
 * The same rectangle /home/calibrate draws, at the same 3:1 aspect, so what you
 * place on the bench is literally the floor they walk on. `v` runs 0 at the far
 * side to 1 at the near, which drives THREE things at once: where they stand,
 * how big they are, and who walks in front of whom. One number, because in a
 * room those three facts are the same fact.
 */
const PEN_ASPECT = 3

/** How big a pet is at the front of the pen, as a share of the pen's height.
 *  At the back they are BACK_SCALE of that. */
const PET_HEIGHT = 0.62
const BACK_SCALE = 0.66

/** Pen widths per second. A stroll crosses the floor in something like twenty
 *  seconds: fast enough to notice on a second glance, slow enough that it is
 *  never the thing your eye is dragged to while you are reading the room. */
const SPEED_MIN = 0.035
const SPEED_MAX = 0.062

type Wanderer = {
  id: string; name: string; art: string
  u: number; v: number
  /** Pen widths per second, signed. Zero while standing. */
  du: number; dv: number
  /** -1 or 1. Follows `du` only while moving, so a pet that stops does not
   *  spin round on the spot as its velocity crosses zero. */
  face: number
  /** Seconds left in whatever it is currently doing. */
  timer: number
  moving: boolean
}

/** Stable per-pet randomness. A menagerie that reshuffles every time you step
 *  through the door is a screensaver; this is meant to be YOUR room, so the
 *  gold seal is always the one that hangs about near the left wall. */
function seeded(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Menagerie({ pets, at }: {
  pets: string[]
  at?: { x: number; y: number; w: number }
}) {
  const roster = pets.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const owned = useMemo(() => PETS.filter(p => pets.includes(p.id)), [roster])
  const pen = useRef<HTMLDivElement | null>(null)
  const nodes = useRef<Record<string, HTMLImageElement | null>>({})

  /** The live herd. A ref and not state: these change sixty times a second and
   *  React must not hear about a single one of them. */
  const herd = useRef<Wanderer[]>([])
  herd.current = useMemo(() => owned.map((p, i) => {
    const rnd = seeded(p.id)
    const prev = herd.current.find(w => w.id === p.id)
    // KEEP ANYONE ALREADY WALKING. Switching rooms and coming back re-runs this,
    // and re-seeding would teleport the whole herd back to their start marks.
    if (prev) return prev
    return {
      id: p.id, name: p.name, art: p.restImageUrl,
      u: 0.08 + rnd() * 0.84,
      v: rnd(),
      du: 0, dv: 0,
      face: rnd() < 0.5 ? -1 : 1,
      // Staggered, so they do not all set off on the same frame like a chorus.
      timer: 0.2 + rnd() * 3 + i * 0.35,
      moving: false,
    }
  }), [owned])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (owned.length === 0) return
    const el = pen.current
    if (!el) return

    const still = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = el.clientWidth, h = el.clientHeight

    /** One transform per pet. Position, anchor and size in a single string, so
     *  a frame costs no layout at all: `transform-origin` is the pet's feet, so
     *  the scale grows it upward out of the floor rather than about its middle,
     *  and the mirror happens about the same point it stands on. */
    const paint = () => {
      for (const p of herd.current) {
        const node = nodes.current[p.id]
        if (!node) continue
        const s = BACK_SCALE + (1 - BACK_SCALE) * p.v
        node.style.transform =
          `translate3d(${(p.u * w).toFixed(1)}px, ${(p.v * h).toFixed(1)}px, 0)`
          + ` translate(-50%, -100%) scale(${(p.face * s).toFixed(3)}, ${s.toFixed(3)})`
        // NEARER MEANS IN FRONT. The same v that placed it decides who overlaps
        // whom, which is the only thing keeping a crab from walking through a seal.
        node.style.zIndex = String(100 + Math.round(p.v * 100))
      }
    }

    // DEFINED BEFORE IT IS OBSERVED. A ResizeObserver callback fires on a later
    // task so the old order happened to work, but a closure reaching backwards
    // past its own declaration is one refactor away from a TDZ crash.
    const ro = new ResizeObserver(() => {
      w = el.clientWidth; h = el.clientHeight
      // The moving path repaints itself next frame; the still one never would.
      if (still) paint()
    })
    ro.observe(el)

    paint()
    if (still) return () => ro.disconnect()

    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      // CLAMPED. A backgrounded tab hands back a dt of several seconds on
      // return, and un-clamped that is every pet teleporting into a wall.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      for (const p of herd.current) {
        p.timer -= dt
        if (p.timer <= 0) {
          const rnd = seeded(p.id + Math.round(now))
          if (p.moving) {
            // A PAUSE. Animals stop for no reason all the time, and a room where
            // everything is permanently in motion reads as a carousel.
            p.moving = false; p.du = 0; p.dv = 0
            p.timer = 1.4 + rnd() * 4.5
          } else {
            p.moving = true
            const dir = rnd() < 0.5 ? -1 : 1
            p.du = dir * (SPEED_MIN + rnd() * (SPEED_MAX - SPEED_MIN))
            // A DRIFT UP OR DOWN THE ROOM, much slower than the walk. Without it
            // they wear tracks along fixed lines and the floor reads as lanes.
            p.dv = (rnd() - 0.5) * 0.02
            p.timer = 2.5 + rnd() * 6
          }
        }
        if (!p.moving) continue

        p.u += p.du * dt
        p.v += p.dv * dt
        // TURN AT THE WALLS rather than stopping dead at them: a pet that walks
        // into the edge and waits there looks broken, one that turns around
        // looks like it changed its mind.
        if (p.u < 0.05) { p.u = 0.05; p.du = Math.abs(p.du) }
        if (p.u > 0.95) { p.u = 0.95; p.du = -Math.abs(p.du) }
        if (p.v < 0) { p.v = 0; p.dv = Math.abs(p.dv) }
        if (p.v > 1) { p.v = 1; p.dv = -Math.abs(p.dv) }
        p.face = p.du < 0 ? -1 : 1
      }

      paint()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [roster])

  const a = at ?? { x: 50, y: 80, w: 80 }

  if (owned.length === 0) {
    return (
      <Box at={a}>
        <p className="font-karla" style={{
          textAlign: 'center', fontSize: '0.82rem', color: '#7c8a80',
        }}>Nobody has moved in yet.</p>
      </Box>
    )
  }

  return (
    <div ref={pen} style={{
      position: 'absolute', left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`,
      aspectRatio: `${PEN_ASPECT} / 1`,
      transform: 'translate(-50%, -50%)',
    }}>
      {owned.map(p => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={p.id} ref={n => { nodes.current[p.id] = n }}
          src={p.restImageUrl} alt={p.name} title={p.name} draggable={false}
          style={{
            position: 'absolute', left: 0, top: 0,
            // SIZED IN PEN HEIGHTS, so the herd scales with the room rather
            // than with the viewport and a phone shows the same scene.
            height: `${PET_HEIGHT * 100}%`, width: 'auto',
            transformOrigin: 'center bottom',
            willChange: 'transform',
            filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
          }} />
      ))}
    </div>
  )
}

/** THE TROPHY ROOM: the six giants, and only the ones actually landed. */
function TrophyWall({ giants }: { giants: { name: string; art: string }[] }) {
  if (giants.length === 0) {
    return (
      <p className="font-karla" style={{
        textAlign: 'center',
        fontSize: '0.82rem', color: '#9a8875',
      }}>Nothing on these walls yet. They are down there.</p>
    )
  }
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2%',
    }}>
      {giants.map(g => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={g.name} src={g.art} alt={g.name} title={g.name} draggable={false}
          style={{ width: '26%', filter: `drop-shadow(0 3px 8px rgba(0,0,0,0.5)) drop-shadow(0 0 10px ${GOLD}33)` }} />
      ))}
    </div>
  )
}
