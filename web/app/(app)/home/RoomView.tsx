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

import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import {
  ROOMS, openRooms, roomArt, roomSpots, openSlots, furnishingIn, houseTier,
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

  /** Where a drag on the picture started, or null. */
  const swipe = useRef<number | null>(null)

  const go = (d: number) => {
    vibrate(6)
    setI(prev => (prev + d + rooms.length) % rooms.length)
  }

  return (
    <div>
      {/* ── THE DOORS ────────────────────────────────────────────────
          It was a name, a blurb, and two 30px arrow discs at 6% opacity tucked
          beside the heading — quiet UI next to a loud picture — and people did
          not find out the house had four rooms.

          A rail of doors instead, and it shows the ones you CANNOT open yet as
          well, greyed with the rung they need. That does two jobs at once: the
          set is visible at rest, which is the whole of the discoverability
          problem, and the locked entries are the only place in the game that
          says out loud what a bigger house is FOR. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {ROOMS.map(r => {
          const at = rooms.indexOf(r)
          const open = at >= 0
          const here = open && at === i
          return (
            <button key={r.id} type="button" disabled={!open}
              onClick={() => { vibrate(6); setI(at) }}
              className="font-karla font-700"
              style={{
                padding: '0.4rem 0.72rem', borderRadius: 999, fontSize: '0.76rem',
                cursor: open ? 'pointer' : 'default',
                color: here ? '#0d1520' : open ? 'rgba(214,232,240,0.82)' : `${SEA},0.36)`,
                background: here ? '#8fd0e8' : open ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                border: '1px solid ' + (here ? '#8fd0e8' : open ? `${SEA},0.24)` : `${SEA},0.12)`),
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {!open && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.6" aria-hidden style={{ flexShrink: 0 }}>
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              )}
              {r.name.replace(/^The /, '')}
              {!open && (
                <span className="font-karla" style={{ fontSize: '0.68rem', opacity: 0.8 }}>
                  house {r.needsHouse}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ marginBottom: 8 }}>
        <p className="font-cinzel font-800" style={{ fontSize: '1.12rem', color: '#f2ede2', lineHeight: 1.1 }}>
          {room.name}
        </p>
        <p className="font-karla" style={{ fontSize: '0.76rem', color: `${SEA},0.6)`, marginTop: 2 }}>
          {room.blurb}
        </p>
      </div>

      <div
        // AND THE PICTURE ITSELF ANSWERS. A room you can swipe is a room you
        // find by accident on a phone, which is exactly where a rail of chips
        // is least likely to be read. `touch-action: pan-y` keeps the page
        // scrolling vertically while this claims the horizontal.
        onPointerDown={e => { swipe.current = e.clientX }}
        onPointerUp={e => {
          const from = swipe.current
          swipe.current = null
          if (from === null || rooms.length < 2) return
          const dx = e.clientX - from
          if (Math.abs(dx) > 46) go(dx < 0 ? 1 : -1)
        }}
        onPointerCancel={() => { swipe.current = null }}
        style={{
          position: 'relative', width: '100%', aspectRatio: '1008 / 666',
          borderRadius: 14, overflow: 'hidden',
          border: '1px solid rgba(180,214,232,0.18)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          touchAction: 'pan-y',
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

        {/* ON the picture, not beside it. An arrow at the edge of an image is
            the one control everybody already knows, and putting them here also
            says that the image is the thing which changes. */}
        {rooms.length > 1 && (
          <>
            <Arrow dir="left" onClick={() => go(-1)} />
            <Arrow dir="right" onClick={() => go(1)} />
            <span className="font-karla font-700" style={{
              position: 'absolute', right: 10, bottom: 8,
              fontSize: '0.68rem', color: 'rgba(236,244,248,0.75)',
              fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
              padding: '0.14rem 0.44rem', borderRadius: 999,
              background: 'rgba(8,14,20,0.55)',
            }}>{i + 1} / {rooms.length}</span>
          </>
        )}
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

/** An edge control ON the room. It was a 30px disc at 6% opacity beside the
 *  heading, which is a control you find only if you already knew it was there. */
function Arrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.88 }}
      aria-label={dir === 'left' ? 'Previous room' : 'Next room'}
      style={{
        position: 'absolute', top: '50%', [dir]: 8,
        transform: 'translateY(-50%)',
        width: 38, height: 38, borderRadius: '50%', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // A SOLID BASE. These sit over painted rooms running from chalk-white
        // plaster to near-black oak, and a translucent control is invisible on
        // one of those. House rule, and this is the case it exists for.
        background: 'rgba(8,14,20,0.62)',
        border: `1px solid ${SEA},0.34)`,
        color: 'rgba(236,244,248,0.92)',
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
 * ── THEY STAND STILL. ALL OF THEM. ─────────────────────────────────────────
 *
 * Two passes got this wrong before it got it right, and both failures were the
 * same failure: motion the art cannot back up.
 *
 * First they WANDERED, which is wrong because these sprites have no walk cycle.
 * An animal crossing a floor at a constant speed with its feet not moving is a
 * chess piece being pushed, and the smoother the glide the more obviously wrong
 * it is. Then they stood still and TURNED on a timer, which is wrong because an
 * animal turning to face nothing, on no cue, is a thing twitching. A mirrored
 * sprite is an honest pose; a mirrored sprite for no reason is a glitch.
 *
 * So the room is completely still, and it is better for it. What makes it read
 * as a place is that twenty animals are standing in twenty chosen spots facing
 * chosen directions, which is a composition — the thing a wall of thumbnails
 * could never be, and the thing neither of the moving versions actually was.
 *
 * Every pet is drawn facing right, so `flip` mirrors the ones that should be
 * looking the other way. Set once by eye, on /home/calibrate. See
 * MENAGERIE_SPOTS.
 */

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
        .sort((a, b) => spotFor(a.id).y - spotFor(b.id).y)
        .map(p => {
          const spot = spotFor(p.id)
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.restImageUrl} alt={p.name} title={p.name} draggable={false}
              style={{
                position: 'absolute',
                left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`,
                // ANCHORED AT THE FEET, like every other thing placed in a room,
                // and mirrored about that same point so a flipped pet stands
                // exactly where an unflipped one would.
                transform: `translate(-50%, -100%) scaleX(${spot.flip ? -1 : 1})`,
                transformOrigin: 'center bottom',
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
              }} />
          )
        })}
    </>
  )
}

const spotFor = (id: string) => MENAGERIE_SPOTS[id] ?? MENAGERIE_FALLBACK

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
