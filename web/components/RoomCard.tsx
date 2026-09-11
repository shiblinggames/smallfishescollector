'use client'

// ── A DOOR, MADE OF THE THING BEHIND IT ─────────────────────────────────────
//
// The crew panel and the ship panel both open onto a set of doors, and they
// used to be commissioned paintings: a muster deck, a gangplank, a trunk of
// coats. Handsome, and they told you nothing. Painted as a set they also looked
// like each other, so you learned which door was which off the word at the foot
// and stopped seeing the picture on the second visit -- it never changed, and
// it was never about you.
//
// A door should be made of what is behind it. The art this game already owns IS
// the answer: the faces on your recruit board, the hands you have seated, your
// own roster, the paints on your own hull. Every one of those changes as you
// play, says what the room is without a caption, and is worth a second look
// precisely because it is YOURS.
//
// ── AND IT STILL HAS TO BE A PIECE OF FURNITURE ─────────────────────────────
//
// The first cut of that was correct and dull: cut-out art floating on a flat
// tint. A subject with nothing around it and nothing under it reads as clip art
// on a black square -- which is the job a painting was quietly doing before,
// badly.
//
// So the frame does that job now, out of light rather than illustration, and
// every door in the game is built from the same five layers: the LAMP above it
// (an accent glow, where this panel's light comes from), the WEAVE (a canvas
// texture, so the ground is a material rather than a hole), the SHELF (a shadow
// the subject stands on), the RULE (a hairline between the picture and the
// words) and the PLATE (the name, the count, and what the count means).
//
// They lift and brighten under the pointer and come in one after another when
// the panel opens. The hover states are CSS (`.room-card` in globals.css)
// because they are hover states and this is a button, not an animation.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'

export default function RoomCard({
  title, note, stat, onClick, children,
  accent = GOLD, ratio = '4 / 3', layout = 'stack', waiting = false, coach, index = 0,
}: {
  title: string
  /** What the count MEANS, in words. "seated for the raid", "on the board". */
  note: string
  /** The count itself, short, for the plate's own chip. Omitted when a room
   *  has nothing countable and the note carries the whole line. */
  stat?: string
  onClick: () => void
  /** The art: whatever is behind this door, drawn from what the player owns. */
  children: React.ReactNode
  accent?: string
  /** 4/3 for a grid of doors, 16/6.6 for a stack of wide ones. */
  ratio?: string
  /** A wide door has room to set the words BESIDE the art rather than under
   *  it; a narrow one does not. Same five layers either way. */
  layout?: 'stack' | 'split'
  /** There is something in here that has not been dealt with. */
  waiting?: boolean
  /** data-coach hook, so a tour can light one door. */
  coach?: string
  /** Position in its set, for the stagger. */
  index?: number
}) {
  const split = layout === 'split'
  return (
    <motion.button type="button" className="room-card tap" data-coach={coach}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.06, duration: 0.32, ease: [0.2, 0.8, 0.3, 1] }}
      onClick={() => { vibrate(10); onClick() }}
      style={{
        ['--rc-accent' as string]: accent,
        position: 'relative', display: 'block', padding: 0, width: '100%',
        borderRadius: 15, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
        // An OPAQUE base. Every one of these sits over painted water.
        background: '#080e16',
        border: `1px solid ${waiting ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.09)'}`,
      }}>
      <div style={{ position: 'relative', aspectRatio: ratio, overflow: 'hidden' }}>

        {/* ── THE LAMP ────────────────────────────────────────────────
            Where the light in this door comes from, in the room's own colour.
            Over the art on a narrow door, behind it on a wide one, so the
            subject is lit from the side the composition wants. */}
        <div aria-hidden className="rc-glow" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: split
            ? `radial-gradient(ellipse 46% 120% at 76% 46%, ${accent}30 0%, ${accent}0d 46%, rgba(8,14,22,0) 72%)`
            : `radial-gradient(ellipse 78% 62% at 50% 24%, ${accent}33 0%, ${accent}0f 44%, rgba(8,14,22,0) 74%)`,
        }} />

        {/* ── THE WEAVE ───────────────────────────────────────────────
            Sailcloth, more or less: two hairline grids at a hundredth of an
            alpha. You do not see it and you would see its absence. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.016) 0 1px, rgba(0,0,0,0) 1px 3px),' +
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.012) 0 1px, rgba(0,0,0,0) 1px 3px)',
        }} />

        {/* A LIGHT ALONG THE TOP EDGE, the way every panel in this game is lit
            from above. One pixel, and it is what stops the card reading as a
            hole cut in the sheet. */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1, pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0) 100%)',
        }} />

        {/* ── WHAT IS BEHIND THE DOOR ─────────────────────────────────
            On its own shelf: a shadow under the subject so it stands on the
            card rather than hovering over it. */}
        <div className="rc-art" style={{
          position: 'absolute',
          left: 0, right: 0, top: 0, bottom: split ? 0 : '2.15rem',
          display: 'flex', alignItems: 'center',
          justifyContent: split ? 'flex-end' : 'center',
          padding: split ? '0.5rem 0.95rem 0.5rem 0' : '0.45rem 0.5rem 0',
        }}>
          <div style={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
            // A SPLIT DOOR HAS TO LEAVE ROOM FOR ITS OWN WORDS. On a phone the
            // plate is most of the card, and art measured in pixels would run
            // straight under it.
            maxWidth: split ? '48%' : '100%',
          }}>
            <span aria-hidden style={{
              position: 'absolute', left: '50%', bottom: -9, transform: 'translateX(-50%)',
              width: '104%', height: 16, borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 72%)',
              pointerEvents: 'none',
            }} />
            {children}
          </div>
        </div>

        {/* The scrim. Lighter than it was, because the art is lifted clear of
            the words now and its whole job is to keep the plate legible. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: split
            ? 'linear-gradient(90deg, rgba(4,8,14,0.94) 0%, rgba(4,8,14,0.74) 46%, rgba(4,8,14,0) 84%)'
            : 'linear-gradient(180deg, rgba(4,8,14,0) 46%, rgba(4,8,14,0.6) 70%, rgba(4,8,14,0.95) 100%)',
        }} />

        {/* ── THE PLATE ───────────────────────────────────────────────
            The name of the room, the count, and what the count means. The rule
            above it is the hairline every painted card in this game wears
            between its picture and its label. */}
        <div style={{
          position: 'absolute', left: 0, bottom: 0,
          right: split ? '40%' : 0,
          padding: split ? '0 0.9rem 0.7rem' : '0 0.62rem 0.5rem',
          ...(split ? { top: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' } : null),
        }}>
          {!split && (
            <div aria-hidden style={{
              height: 1, marginBottom: '0.42rem',
              background: `linear-gradient(90deg, ${accent}00 0%, ${accent}59 22%, ${accent}59 78%, ${accent}00 100%)`,
            }} />
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="font-cinzel font-700" style={{
              flex: 1, minWidth: 0, fontSize: split ? '1.06rem' : '0.98rem', lineHeight: 1.1, color: '#f6f1e6',
              textShadow: '0 2px 12px rgba(0,0,0,0.95)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{title}</span>
            {stat && (
              <span className="font-karla font-800" style={{
                flexShrink: 0, fontSize: '0.62rem', letterSpacing: '0.04em',
                padding: '0.1rem 0.42rem', borderRadius: 999,
                fontVariantNumeric: 'tabular-nums',
                color: waiting ? '#1a1206' : accent,
                // NO SOLID GOLD unless it is the one thing on the card that
                // wants answering — a board with faces on it still waiting.
                background: waiting ? GOLD : `${accent}1c`,
                border: `1px solid ${waiting ? GOLD : `${accent}59`}`,
                boxShadow: waiting ? `0 0 14px ${GOLD}55` : 'none',
              }}>{stat}</span>
            )}
          </div>
          <span className="font-karla" style={{
            display: 'block', fontSize: split ? '0.66rem' : '0.6rem', lineHeight: 1.3, marginTop: 2,
            color: 'rgba(214,232,240,0.58)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: split ? 'normal' : 'nowrap',
          }}>{note}</span>
        </div>

        {/* An inner hairline, inset. The same trick as a mounted print: the
            frame and the picture do not touch. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: 15, pointerEvents: 'none',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
        }} />

        {waiting && (
          <span aria-hidden className="rc-pip" style={{
            position: 'absolute', top: 8, right: 8,
            width: 9, height: 9, borderRadius: 999,
            background: GOLD, border: '1px solid rgba(20,14,4,0.8)',
          }} />
        )}
      </div>
    </motion.button>
  )
}

/**
 * A ROW OF FACES, AND THE SEATS NOBODY IS IN.
 *
 * The assignment board in miniature: who is sitting there, and how many places
 * are still open. An empty seat drawn as an empty seat is the whole reason this
 * is better than a painting of a deck -- the door itself says you have three
 * benches going to waste.
 *
 * SET IN A SHALLOW ARC, like a hand of cards rather than a row of stickers: a
 * few degrees of turn each way and a couple of pixels of drop at the ends. It
 * is the difference between people standing together and icons in a list.
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
  const overlap = Math.round(size * 0.2)
  const n = srcs.length + empty
  const mid = (n - 1) / 2
  /** How far from the middle of the row this one sits, -1 to 1. */
  const off = (i: number) => (mid === 0 ? 0 : (i - mid) / mid)
  const fan = (i: number) => `rotate(${(off(i) * 4).toFixed(2)}deg) translateY(${(Math.abs(off(i)) * 3).toFixed(1)}px)`
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: overlap }}>
      {srcs.map((src, i) => {
        const ring = rings?.[i] ?? 'rgba(240,192,64,0.75)'
        return (
          <span key={`${src}-${i}`} style={{ marginLeft: -overlap, transform: fan(i), flexShrink: 0, lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" aria-hidden loading="lazy" decoding="async"
              style={{
                display: 'block', width: size, height: size, borderRadius: '50%',
                // TOP OF THE PLATE, like every other crew circle in the game:
                // these are full card illustrations and a centred crop is
                // somebody's chest.
                objectFit: 'cover', objectPosition: 'top center',
                border: `2px solid ${ring}`,
                background: 'rgba(6,10,16,0.92)',
                boxShadow: `0 5px 14px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)`,
                filter: (dim || dims?.[i]) ? 'grayscale(0.8) brightness(0.6)' : undefined,
              }} />
          </span>
        )
      })}
      {Array.from({ length: empty }, (_, k) => {
        const i = srcs.length + k
        return (
          <span key={`e${k}`} aria-hidden style={{
            width: size, height: size, borderRadius: '50%', marginLeft: -overlap, flexShrink: 0,
            transform: fan(i),
            border: '2px dashed rgba(190,212,228,0.26)',
            background: 'radial-gradient(circle at 50% 34%, rgba(255,255,255,0.045) 0%, rgba(8,14,22,0.9) 70%)',
            boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.6)',
          }} />
        )
      })}
    </div>
  )
}

/**
 * YOUR OWN, ONE AT A TIME.
 *
 * A roster of seventeen and a trunk of eighty skins cannot be a row, and a row
 * of the first four is a worse lie than a painting. So it turns: each one held
 * long enough to be looked at, crossfading and drifting rather than cutting,
 * and it stops dead at one entry because a rotation of one is a flicker.
 *
 * The pips under it say how many there are and where in them you are, which is
 * what makes a rotation read as a COLLECTION rather than as a picture that will
 * not sit still.
 */
export function Rotator({ srcs, shape = 'face', size = 78, every = 2800, filters, accent = GOLD }: {
  srcs: string[]
  /** A face is cropped to a circle; a plate is shown whole. */
  shape?: 'face' | 'plate'
  size?: number
  every?: number
  /** Per-entry CSS filter. Half the ship skins are a TINT of her own art
   *  rather than a second painting, so the picture and the paint have to
   *  travel together or every one of those turns up as the bare hull. */
  filters?: string[]
  accent?: string
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
  const pips = Math.min(srcs.length, 7)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      <div style={{
        position: 'relative', height: size,
        // A plate is wider than it is tall and has to give way on a narrow
        // card; a face is a circle and never does.
        width: shape === 'plate' ? `min(100%, ${Math.round(size * 2.1)}px)` : size,
      }}>
        {/* The lamp behind the subject, tight. A face on a dark ground wants a
            halo or it is a hole with a head in it. */}
        <span aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', width: '160%', height: '160%',
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
          background: `radial-gradient(circle, ${accent}2e 0%, ${accent}00 66%)`,
        }} />
        <AnimatePresence mode="popLayout" initial={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img key={`${src}-${at}`} src={src} alt="" aria-hidden decoding="async"
            initial={{ opacity: 0, scale: 1.06, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: shape === 'plate' ? 'contain' : 'cover',
              objectPosition: shape === 'plate' ? 'center' : 'top center',
              borderRadius: shape === 'plate' ? 0 : '50%',
              border: shape === 'plate' ? undefined : `2px solid ${accent}b3`,
              background: shape === 'plate' ? undefined : 'rgba(6,10,16,0.92)',
              filter: shape === 'plate'
                ? `${tint}drop-shadow(0 10px 20px rgba(0,0,0,0.75))`
                : `${tint}drop-shadow(0 8px 16px rgba(0,0,0,0.7))`,
            }} />
        </AnimatePresence>
      </div>
      {srcs.length > 1 && (
        <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {Array.from({ length: pips }, (_, p) => {
            // With more than seven, the pips are a POSITION rather than a
            // count: the lit one walks a row that stays seven wide.
            const lit = srcs.length <= pips ? p === at : p === at % pips
            return (
              <span key={p} style={{
                width: lit ? 10 : 4, height: 4, borderRadius: 999,
                background: lit ? accent : 'rgba(214,232,240,0.24)',
                boxShadow: lit ? `0 0 8px ${accent}80` : 'none',
                transition: 'width 0.3s ease, background 0.3s ease',
              }} />
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * THE THINGS BOLTED TO HER.
 *
 * Cut-out objects in a row -- a repair kit, the relics on her mounts -- at the
 * size you can tell one from another, each in its own lit socket, so a fitted
 * mount and an empty one are the same shape with something in it or without.
 */
export function ObjectRow({ srcs, empty = 0, size = 52, accent = GOLD }: {
  srcs: string[]; empty?: number; size?: number; accent?: string
}) {
  const box = Math.round(size * 1.18)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
      {srcs.map((src, i) => (
        <span key={`${src}-${i}`} style={{
          width: box, height: box, borderRadius: 12, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: `radial-gradient(circle at 50% 30%, ${accent}1a 0%, rgba(8,14,22,0.85) 72%)`,
          border: `1px solid ${accent}3d`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 16px rgba(0,0,0,0.55)',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden loading="lazy" decoding="async"
            style={{
              width: '78%', height: '78%', objectFit: 'contain',
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.75))',
            }} />
        </span>
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} aria-hidden style={{
          width: box, height: box, borderRadius: 12, flexShrink: 0,
          border: '1px dashed rgba(190,212,228,0.24)',
          background: 'rgba(255,255,255,0.015)',
          boxShadow: 'inset 0 3px 12px rgba(0,0,0,0.5)',
        }} />
      ))}
    </div>
  )
}
