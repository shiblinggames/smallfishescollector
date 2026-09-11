'use client'

// ── A DOOR, MADE OF THE THING BEHIND IT ─────────────────────────────────────
//
// The crew panel and the ship panel both open onto a set of painted plates, and
// the plates were commissioned illustrations: a muster deck, a gangplank, a
// trunk of coats. Handsome, and they told you nothing. Four paintings of four
// rooms on one ship at one hour look like a set, which was the intent, and the
// cost of that is that they also look like each other -- you learn which door
// is which by the word at the foot, and the picture is decoration you stop
// seeing on the second visit.
//
// A door should be made of what is behind it. The art this game already owns
// IS the answer: the faces on your recruit board, the hands you have seated,
// your own roster, the paints on your own hull. Every one of those is a picture
// that changes as you play, says what the room is without a caption, and is
// worth a second look precisely because it is YOURS.
//
// So this is the frame -- the plate, the scrim, the title, and a line of live
// summary where the blurb used to be -- and the art is whatever the caller puts
// in it. `FaceRow` and `Rotator` are the two shapes that turned out to be
// needed; anything else can be passed as children.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'

export default function RoomCard({
  title, note, onClick, children,
  accent = GOLD, ratio = '4 / 3', waiting = false, coach, noteColor,
}: {
  title: string
  /** The live summary. What is actually in this room, right now, in numbers. */
  note: string
  onClick: () => void
  /** The art: whatever is behind this door, drawn from what the player owns. */
  children: React.ReactNode
  accent?: string
  /** 4/3 for a grid of doors, 16/6.6 for a stack of wide ones. */
  ratio?: string
  /** There is something in here that has not been dealt with. */
  waiting?: boolean
  /** data-coach hook, so a tour can light one door. */
  coach?: string
  noteColor?: string
}) {
  return (
    <button type="button" className="tap" data-coach={coach}
      onClick={() => { vibrate(10); onClick() }}
      style={{
        position: 'relative', display: 'block', padding: 0, width: '100%',
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
        background: '#070c14',
        border: `1px solid ${waiting ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: waiting ? '0 0 18px rgba(240,192,64,0.18)' : 'none',
      }}>
      <div style={{ position: 'relative', aspectRatio: ratio, overflow: 'hidden' }}>
        {/* THE GROUND. The old plates were paintings edge to edge; what stands
            on this one is a handful of cut-out art, so it needs something to
            stand ON or it reads as clip art on a black square. A low tint of
            the room's own colour, darkest at the foot where the words go. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse 120% 90% at 50% 28%, ${accent}1f 0%, rgba(7,12,20,0) 72%), linear-gradient(180deg, rgba(16,24,34,0.9) 0%, rgba(7,12,20,1) 100%)`,
        }} />

        {/* WHAT IS BEHIND THE DOOR. Lifted off the foot so the scrim and the
            title never sit on top of a face. */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: '0.35rem 0.5rem 2.1rem',
        }}>
          {children}
        </div>

        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(4,8,14,0) 42%, rgba(4,8,14,0.72) 74%, rgba(4,8,14,0.96) 100%)',
        }} />

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.4rem 0.6rem 0.5rem' }}>
          <span className="font-cinzel font-700" style={{
            display: 'block', fontSize: '0.98rem', lineHeight: 1.1, color: '#f6f1e6',
            textShadow: '0 2px 12px rgba(0,0,0,0.95)',
          }}>{title}</span>
          <span className="font-karla" style={{
            display: 'block', fontSize: '0.6rem', lineHeight: 1.3, marginTop: 2,
            color: noteColor ?? (waiting ? GOLD : 'rgba(214,232,240,0.62)'),
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{note}</span>
        </div>

        {waiting && (
          <span aria-hidden style={{
            position: 'absolute', top: 7, right: 7,
            width: 10, height: 10, borderRadius: 999,
            background: GOLD, border: '1px solid rgba(20,14,4,0.8)',
            boxShadow: '0 0 10px rgba(240,192,64,0.6)',
          }} />
        )}
      </div>
    </button>
  )
}

/**
 * A ROW OF FACES, AND THE SEATS NOBODY IS IN.
 *
 * The assignment board in miniature: who is sitting there, and how many places
 * are still open. An empty seat drawn as an empty seat is the whole reason this
 * is better than a painting of a deck -- the door itself says you have three
 * benches going to waste.
 */
export function FaceRow({ srcs, empty = 0, size = 44, dim = false, dims, rings }: {
  srcs: string[]
  /** Seats with nobody in them, drawn after the faces. */
  empty?: number
  size?: number
  /** Greyed, all of them. */
  dim?: boolean
  /** Greyed, one by one: a recruit board with one hand already signed on has
   *  to say which one is gone. */
  dims?: boolean[]
  /** Per-face ring colours, e.g. rarity. Falls back to a neutral gold. */
  rings?: string[]
}) {
  const overlap = Math.round(size * 0.22)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: overlap }}>
      {srcs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}-${i}`} src={src} alt="" aria-hidden loading="lazy" decoding="async"
          style={{
            width: size, height: size, borderRadius: '50%', marginLeft: -overlap,
            objectFit: 'cover', objectPosition: 'top center', flexShrink: 0,
            // TOP OF THE PLATE, like every other crew circle in the game: these
            // are full card illustrations and a centred crop is somebody's
            // chest.
            border: `2px solid ${rings?.[i] ?? 'rgba(240,192,64,0.75)'}`,
            background: 'rgba(6,10,16,0.92)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            filter: (dim || dims?.[i]) ? 'grayscale(0.75) brightness(0.65)' : undefined,
          }} />
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} aria-hidden style={{
          width: size, height: size, borderRadius: '50%', marginLeft: -overlap, flexShrink: 0,
          border: '2px dashed rgba(190,212,228,0.3)',
          background: 'rgba(8,14,22,0.8)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }} />
      ))}
    </div>
  )
}

/**
 * YOUR OWN, ONE AT A TIME.
 *
 * A roster of seventeen and a trunk of eighty skins cannot be a row, and a row
 * of the first four is a worse lie than a painting. So it turns: each one held
 * long enough to be looked at, crossfading rather than cutting, and it stops
 * dead at one entry because a rotation of one is a flicker.
 */
export function Rotator({ srcs, shape = 'face', size = 78, every = 2800, filters }: {
  srcs: string[]
  /** A face is cropped to a circle; a plate is shown whole. */
  shape?: 'face' | 'plate'
  size?: number
  every?: number
  /** Per-entry CSS filter. Half the ship skins are a TINT of her own art
   *  rather than a second painting, so the picture and the paint have to
   *  travel together or every one of those turns up as the bare hull. */
  filters?: string[]
}) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (srcs.length < 2) return
    const t = setInterval(() => setI(n => (n + 1) % srcs.length), every)
    return () => clearInterval(t)
  }, [srcs.length, every])
  if (srcs.length === 0) return null
  const at = Math.min(i, srcs.length - 1)
  const src = srcs[at]
  const tint = filters?.[at] && filters[at] !== 'none' ? `${filters[at]} ` : ''
  return (
    <div style={{
      position: 'relative',
      width: shape === 'plate' ? '86%' : size,
      height: size,
    }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img key={`${src}-${at}`} src={src} alt="" aria-hidden decoding="async"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: shape === 'plate' ? 'contain' : 'cover',
            objectPosition: shape === 'plate' ? 'center' : 'top center',
            borderRadius: shape === 'plate' ? 0 : '50%',
            border: shape === 'plate' ? undefined : '2px solid rgba(240,192,64,0.7)',
            background: shape === 'plate' ? undefined : 'rgba(6,10,16,0.92)',
            filter: `${tint}drop-shadow(0 8px 18px rgba(0,0,0,0.7))`,
          }} />
      </AnimatePresence>
    </div>
  )
}

/**
 * THE THINGS BOLTED TO HER.
 *
 * Cut-out objects in a row -- a repair kit, the relics on her mounts -- at the
 * size you can tell one from another. Nothing owned draws the empty mounts, so
 * an unfitted ship says so.
 */
export function ObjectRow({ srcs, empty = 0, size = 52 }: { srcs: string[]; empty?: number; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {srcs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}-${i}`} src={src} alt="" aria-hidden loading="lazy" decoding="async"
          style={{
            width: size, height: size, objectFit: 'contain', flexShrink: 0,
            filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.7))',
          }} />
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} aria-hidden style={{
          width: size * 0.72, height: size * 0.72, borderRadius: 10, flexShrink: 0,
          border: '1px dashed rgba(190,212,228,0.28)',
          background: 'rgba(255,255,255,0.02)',
        }} />
      ))}
    </div>
  )
}
