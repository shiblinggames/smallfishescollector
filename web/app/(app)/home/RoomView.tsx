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

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import {
  openRooms, roomArt, roomSpots, openSlots, furnishingIn, houseTier,
  MENAGERIE_SPOTS, MENAGERIE_FALLBACK,
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
 * ── THEY STAND. THEY DO NOT WALK. ───────────────────────────────────────────
 *
 * A first pass had them wandering the floor, and it was wrong for a reason worth
 * writing down: these sprites have no walk cycle. An animal sliding across a
 * floor at a constant speed with its feet not moving is a chess piece being
 * pushed, and the smoother the slide the more obviously wrong it is. Motion has
 * to be motion the ART can back up.
 *
 * What a still sprite CAN do honestly is turn round, because a mirrored still
 * sprite is a real pose rather than an interpolation between two poses it does
 * not have. So each animal has its own patch of floor and its own slow, unshared
 * rhythm of looking one way and then the other, and the room reads as alive
 * because nothing in it is synchronised, not because anything is travelling.
 *
 * Placed by hand on /home/calibrate. See MENAGERIE_SPOTS.
 */

/** Seconds between one turn and the next. Wide and randomised per pet, so no
 *  two ever fall into step: a room where every animal turns on the same beat is
 *  a room of clockwork, which is worse than a room of statues. */
const TURN_MIN = 3.5
const TURN_MAX = 11

function Menagerie({ pets, at }: {
  pets: string[]
  /** Only used for the empty state, which is a line of text and not a floor. */
  at?: { x: number; y: number; w: number }
}) {
  const owned = useMemo(() => PETS.filter(p => pets.includes(p.id)), [pets])

  if (owned.length === 0) {
    return (
      <Box at={at ?? { x: 50, y: 80, w: 80 }}>
        <p className="font-karla" style={{
          textAlign: 'center', fontSize: '0.82rem', color: '#7c8a80',
        }}>Nobody has moved in yet.</p>
      </Box>
    )
  }

  return (
    <>
      {/* PAINTED BACK TO FRONT, by how far down the room each one stands. The
          same y that placed a pet decides who overlaps whom, which is the only
          thing stopping a crab at the front being hidden behind a seal behind
          it. Sorting here rather than storing a z-order keeps the bench honest:
          drag something forward and it comes forward. */}
      {[...owned]
        .sort((a, b) => (spotFor(a.id).y - spotFor(b.id).y))
        .map(p => <Pet key={p.id} id={p.id} name={p.name} art={p.restImageUrl} />)}
    </>
  )
}

const spotFor = (id: string) => MENAGERIE_SPOTS[id] ?? MENAGERIE_FALLBACK

/** One animal, standing on its spot, turning round on its own clock. */
function Pet({ id, name, art }: { id: string; name: string; art: string }) {
  const spot = spotFor(id)
  const [face, setFace] = useState(1)

  useEffect(() => {
    if (typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // A CHAIN OF TIMEOUTS, not an interval. Each wait is a different length, so
    // there is no shared beat for a pet to be on or off — and a timeout that
    // reschedules itself cannot pile up in a backgrounded tab the way a repeating
    // interval can.
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      t = setTimeout(() => {
        setFace(f => -f)
        tick()
      }, (TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN)) * 1000)
    }
    tick()
    return () => clearTimeout(t)
  }, [])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={art} alt={name} title={name} draggable={false}
      style={{
        position: 'absolute',
        left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`,
        // ANCHORED AT THE FEET, like every other thing placed in a room, and
        // mirrored about that same point so a pet turning round does not also
        // shuffle sideways. The art all faces right, so face 1 is as drawn.
        transform: `translate(-50%, -100%) scaleX(${face})`,
        transformOrigin: 'center bottom',
        filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
      }} />
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
