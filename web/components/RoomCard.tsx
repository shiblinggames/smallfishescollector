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

        {/* WHAT IS BEHIND THE DOOR.
            `zIndex: 0` IS LEAD, NOT BALLAST. It makes this box its own stacking
            context, which pins everything the art does inside it. Without one
            the box is `z-index: auto`, and a positioned child carrying its own
            z-index -- the front of the wedge, the middle card of the fan --
            climbs OUT of it into the card's stacking context and paints over
            the title, which is where the crew were standing on their own
            names. */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.35rem 0.5rem 2.1rem',
        }}>
          {children}
        </div>

        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(4,8,14,0) 42%, rgba(4,8,14,0.72) 74%, rgba(4,8,14,0.96) 100%)',
        }} />

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, padding: '0.4rem 0.6rem 0.5rem' }}>
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
            position: 'absolute', top: 7, right: 7, zIndex: 3,
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
 * ── A BUST, WHICH IS NOT A PROFILE PICTURE ──────────────────────────────────
 *
 * Every crew on these doors used to be a circle with a coloured ring, four of
 * them in a row. That is the avatar idiom off a settings screen, and a row of
 * them is a contact list: it makes a legendary painting into a 44px badge and
 * repeating it four times makes the panel look assembled rather than drawn.
 *
 * A bust instead. The art at the size it was painted for, cropped tall, and
 * faded out at the bottom rather than cut -- so it is a figure standing in the
 * card's own dark, with no frame, no ring, and no edge where the picture stops.
 * Everything on these doors is built from this one shape.
 */
function Bust({ src, w, h, dim = false, round = 10 }: {
  src: string; w: number; h: number; dim?: boolean; round?: number
}) {
  return (
    <span style={{ position: 'relative', display: 'block', width: w, height: h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden loading="lazy" decoding="async"
        style={{
          display: 'block', width: w, height: h,
          objectFit: 'cover', objectPosition: 'top center',
          borderTopLeftRadius: round, borderTopRightRadius: round,
          // DIM IS A COLOUR CHANGE, NOT A SHADOW. `grayscale` and `brightness`
          // are per-pixel and cheap; a `drop-shadow` on a masked image is an
          // offscreen buffer the size of the source art, and there are a dozen
          // of these on screen at once over a live WebGL chart. See the note on
          // the fade below.
          filter: dim ? 'grayscale(0.85) brightness(0.5)' : undefined,
        }} />
      {/* THE BOTTOM DOES NOT END, IT LEAVES -- and it leaves by having the
          card's own dark laid over it rather than by masking the image.
          `-webkit-mask-image` on a 1024px painting costs a full extra layer
          per figure, and enough of those over the chart's canvas is what takes
          an iPhone's renderer down. A gradient is free. */}
      <span aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(h * 0.42),
        background: 'linear-gradient(180deg, rgba(7,12,20,0) 0%, rgba(7,12,20,0.72) 58%, rgba(7,12,20,1) 100%)',
        pointerEvents: 'none',
      }} />
    </span>
  )
}

/**
 * ── THE ROSTER, IN A WEDGE ──────────────────────────────────────────────────
 *
 * Three of your own, in the formation a crew actually stands in: one in front
 * and two half a step back, smaller, dimmer, further into the dark. It reads as
 * a company rather than a list, and it says "there are more of these" without
 * drawing a single one of the other fourteen.
 *
 * The line moves. All three change together on the turn, so the wedge is a
 * different three every few seconds and a roster of seventeen gets seen.
 */
/* NO `mode="popLayout"` ANYWHERE IN HERE. Every crossfade below has both
 * copies absolutely positioned on top of each other, which is the plain
 * default mode's behaviour; popLayout adds a measuring wrapper and a
 * flushSync per swap to hold a place in a flow these do not use. */
export function CrewWedge({ srcs, tints, h = 104, every = 3200 }: {
  srcs: string[]
  /** Rarity, as LIGHT rather than as a ring: the one in front throws a little
   *  of their own colour onto the card behind them. A legendary should be
   *  legible as a legendary without wearing a badge for it. */
  tints?: string[]
  h?: number; every?: number
}) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (srcs.length < 2) return
    const t = setInterval(() => setI(n => (n + 1) % srcs.length), every)
    return () => clearInterval(t)
  }, [srcs.length, every])
  if (srcs.length === 0) return null

  const w = Math.round(h * 0.74)
  const idx = (k: number) => ((i + k) % srcs.length + srcs.length) % srcs.length
  const at = (k: number) => srcs[idx(k)]
  const frontTint = tints?.[idx(0)]
  // WHO IS EVEN THERE. Two hands make a pair, not a wedge, and one makes a
  // portrait -- so the flanks only appear when there is somebody to put in
  // them, rather than the same face being drawn three times.
  const wings = srcs.length >= 3 ? [-1, 1] : srcs.length === 2 ? [1] : []

  return (
    <div style={{ position: 'relative', width: w * 2.1, height: h + 10 }}>
      {frontTint && (
        <motion.span aria-hidden key={frontTint + idx(0)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          style={{
            position: 'absolute', left: '50%', bottom: -6, width: w * 1.9, height: h * 0.95,
            transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0,
            // A radial gradient is already soft; a blur on top of one is a
            // whole compositing layer spent on nothing anybody can see.
            background: `radial-gradient(ellipse at 50% 70%, ${frontTint} 0%, rgba(0,0,0,0) 66%)`,
            opacity: 0.45,
          }} />
      )}
      {wings.map(side => (
        <div key={side} style={{
          position: 'absolute', left: '50%', bottom: 10, zIndex: 1,
          transform: `translateX(calc(-50% + ${side * w * 0.58}px)) scale(0.78)`,
          transformOrigin: 'bottom center',
        }}>
          <AnimatePresence initial={false}>
            <motion.div key={at(side)}
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
              // SET BACK BY OPACITY AND SIZE, which is how distance reads
              // anyway. The half-pixel of blur that used to say "further away"
              // cost a layer per wing.
              style={{ position: 'absolute', bottom: 0, left: -w / 2 }}>
              <Bust src={at(side)} w={w} h={h} />
            </motion.div>
          </AnimatePresence>
        </div>
      ))}
      <div style={{ position: 'absolute', left: '50%', bottom: 0, zIndex: 2, transform: 'translateX(-50%)' }}>
        <AnimatePresence initial={false}>
          <motion.div key={at(0)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            style={{ position: 'absolute', bottom: 0, left: -w / 2 }}>
            <Bust src={at(0)} w={w} h={h} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * ── THE ASSIGNMENT, HAPPENING ───────────────────────────────────────────────
 *
 * Not a picture of a crew: a picture of the VERB. Benches along the bottom, the
 * ones you have filled with the hand that is in them, and above the first empty
 * one a hand coming down into it -- over and over, a different hand each time,
 * out of the ones you have sitting idle.
 *
 * It is the only door of the four that is about doing something rather than
 * having something, and a loop is the shortest way to say so. When every bench
 * is full the loop stops of its own accord and the wedge of seated crew just
 * stands there, which is exactly the difference the card is there to show.
 */
export function AssignLoop({ seated, idle, seats, h = 100 }: {
  /** Art for the hands already on the bench, in slot order. */
  seated: string[]
  /** Art for hands with nowhere to be. The ones the loop drops in. */
  idle: string[]
  /** How many benches this hull has. */
  seats: number
  h?: number
}) {
  const shown = Math.max(1, Math.min(seats, 5))
  const open = Math.max(0, shown - seated.length)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (open === 0 || idle.length === 0) return
    const t = setInterval(() => setTick(n => n + 1), 2600)
    return () => clearInterval(t)
  }, [open, idle.length])

  const bw = Math.round(h * 0.42)
  const bh = Math.round(h * 0.56)
  const dropping = open > 0 && idle.length > 0 ? idle[tick % idle.length] : null

  return (
    <div style={{ position: 'relative', height: h, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
      {Array.from({ length: shown }, (_, k) => {
        const who = seated[k]
        const isTarget = !who && k === seated.length
        return (
          <div key={k} style={{
            position: 'relative', width: bw, height: bh, borderRadius: 9,
            // A BENCH, not a slot in a form. Lit from above, sunk into the
            // card, and dashed only while nobody is on it.
            background: who
              ? 'linear-gradient(180deg, rgba(126,214,196,0.14) 0%, rgba(8,14,22,0.9) 100%)'
              : 'rgba(8,14,22,0.75)',
            border: `1px ${who ? 'solid rgba(126,214,196,0.45)' : 'dashed rgba(190,212,228,0.26)'}`,
            boxShadow: who ? '0 4px 14px rgba(0,0,0,0.5)' : 'inset 0 3px 10px rgba(0,0,0,0.55)',
            overflow: 'visible',
          }}>
            {who && (
              <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)' }}>
                <Bust src={who} w={bw} h={Math.round(bh * 1.5)} round={8} />
              </div>
            )}
            {/* THE ONE COMING DOWN. Keyed on the tick so each pass is a new
                face falling in, and it lands with a settle rather than a stop
                -- somebody sitting down, not a tile snapping to a grid. */}
            {isTarget && dropping && (
              <AnimatePresence mode="wait">
                <motion.div key={tick}
                  initial={{ opacity: 0, y: -Math.round(h * 0.5) }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ type: 'spring', stiffness: 210, damping: 17, opacity: { duration: 0.3 } }}
                  style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)' }}>
                  <Bust src={dropping} w={bw} h={Math.round(bh * 1.5)} round={8} />
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * ── THE BOARD, AS A HAND DEALT ──────────────────────────────────────────────
 *
 * Today's faces fanned like cards on a table, because that is what a recruit
 * board is: three of them, pick one. The middle one stands proud and the
 * outside two lean away, and a hand already signed on goes grey and drops back
 * into the fan -- taken, still on the board, no longer a choice.
 */
export function CrewFan({ srcs, dims, tints, h = 96 }: {
  srcs: string[]; dims?: boolean[]
  /** Rarity as light, the same as the wedge. What is on the board tonight is
   *  most of why you would open the room, and colour says it at a glance. */
  tints?: string[]
  h?: number
}) {
  if (srcs.length === 0) return null
  const w = Math.round(h * 0.7)
  const mid = (srcs.length - 1) / 2
  return (
    <div style={{ position: 'relative', width: w * 2.2, height: h + 8 }}>
      {srcs.map((src, i) => {
        const off = i - mid
        const taken = dims?.[i] === true
        return (
          <motion.div key={`${src}-${i}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.3, ease: 'easeOut' }}
            // THE FAN IS SET IN MOTION VALUES, NOT IN A STYLE TRANSFORM.
            // framer-motion writes `transform` itself, so a transform in
            // `style` is overwritten the moment `y` animates -- and all three
            // cards would slide into one stack. See [[feedback-framer-motion-gotchas]].
            style={{
              position: 'absolute', left: '50%', bottom: taken ? 4 : 0,
              zIndex: taken ? 1 : 3 - Math.abs(off),
              x: -w / 2 + off * w * 0.52,
              rotate: off * 7,
              scale: taken ? 0.9 : 1 - Math.abs(off) * 0.06,
              transformOrigin: 'bottom center',
            }}>
            {tints?.[i] && !taken && (
              <span aria-hidden style={{
                position: 'absolute', left: '50%', bottom: -4, width: w * 1.5, height: h * 0.8,
                transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: -1,
                background: `radial-gradient(ellipse at 50% 72%, ${tints[i]} 0%, rgba(0,0,0,0) 68%)`,
                opacity: 0.4,
              }} />
            )}
            <Bust src={src} w={w} h={h} dim={taken} />
          </motion.div>
        )
      })}
    </div>
  )
}

/**
 * ── ONE COAT, ON A TURNTABLE ────────────────────────────────────────────────
 *
 * A wardrobe is not a crowd. One at a time, big, with a slow pass of light
 * across it -- the same sheen the chase skins wear in the hall, at a tenth of
 * the strength, because this is a door and not the reveal.
 */
export function Showcase({ srcs, h = 108, every = 3000 }: { srcs: string[]; h?: number; every?: number }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (srcs.length < 2) return
    const t = setInterval(() => setI(n => (n + 1) % srcs.length), every)
    return () => clearInterval(t)
  }, [srcs.length, every])
  if (srcs.length === 0) return null
  const w = Math.round(h * 0.76)
  const src = srcs[Math.min(i, srcs.length - 1)]
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden' }}>
      <AnimatePresence initial={false}>
        <motion.div key={src}
          initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: 0 }}>
          <Bust src={src} w={w} h={h} />
        </motion.div>
      </AnimatePresence>
      {/* A STANDING HIGHLIGHT, not a sweep. The sweep was a blend-mode layer
          animating for ever over a page that is already running a WebGL chart,
          and `mix-blend-mode` forces its own compositing group on top of that.
          The light on the coat is a gradient that sits still; the turn is
          already the movement on this card. */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(112deg, rgba(255,255,255,0) 34%, rgba(255,255,255,0.12) 48%, rgba(255,255,255,0) 62%)',
      }} />
    </div>
  )
}

/**
 * ── THE HULL, TURNING ───────────────────────────────────────────────────────
 *
 * The ship's own doors, in the language the crew's use: her art standing in the
 * card's dark, the foot of her faded into it rather than cut, a light lying
 * across her, and her paints turning over one at a time. Wide where a bust is
 * tall, because that is the shape of a ship.
 */
export function HullTurn({ srcs, filters, w = 168, h = 86, every = 2800 }: {
  srcs: string[]
  /** Per-entry CSS tint. Half the ship skins are a TINT of her own art rather
   *  than a second painting, so the picture and the paint travel together or
   *  every one of those turns up as the bare hull. */
  filters?: string[]
  w?: number; h?: number; every?: number
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
  const tint = filters?.[at] && filters[at] !== 'none' ? filters[at] : undefined

  return (
    <div style={{ position: 'relative', width: 'min(100%, ' + w + 'px)', height: h }}>
      {/* The water she sits in: one soft ellipse, so she is not a cut-out
          hanging in the air. */}
      <span aria-hidden style={{
        position: 'absolute', left: '50%', bottom: -2, width: '92%', height: 14,
        transform: 'translateX(-50%)', borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 72%)',
      }} />
      <AnimatePresence initial={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img key={`${src}-${at}`} src={src} alt="" aria-hidden decoding="async"
          initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain', filter: tint,
          }} />
      </AnimatePresence>
      {/* A light lying across her, and the same standing highlight the wardrobe
          card wears. No blend mode, no sweep: see the note in Showcase. */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(106deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0) 60%)',
      }} />
      {srcs.length > 1 && (
        <div aria-hidden style={{
          position: 'absolute', left: '50%', bottom: -9, transform: 'translateX(-50%)',
          display: 'flex', gap: 4,
        }}>
          {Array.from({ length: Math.min(srcs.length, 7) }, (_, p) => {
            const lit = srcs.length <= 7 ? p === at : p === at % 7
            return (
              <span key={p} style={{
                width: lit ? 9 : 4, height: 3, borderRadius: 999,
                background: lit ? 'rgba(240,192,64,0.9)' : 'rgba(214,232,240,0.22)',
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
 * size you can tell one from another. Nothing owned draws the empty mounts, so
 * an unfitted ship says so.
 */
export function ObjectRow({ srcs, empty = 0, size = 46, accent = GOLD }: {
  srcs: string[]; empty?: number; size?: number; accent?: string
}) {
  const box = Math.round(size * 1.2)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
      {srcs.map((src, i) => (
        <motion.span key={`${src}-${i}`}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.28, ease: 'easeOut' }}
          style={{
            width: box, height: box, borderRadius: 12, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            // A MOUNT, lit from above and sunk into the card, so a fitted one
            // and an empty one are the same fitting with something in it or
            // without. Gradients and a box-shadow only: no filters on a door
            // that opens over the chart. See the note on Bust.
            background: `radial-gradient(circle at 50% 28%, ${accent}1f 0%, rgba(8,14,22,0.9) 72%)`,
            border: `1px solid ${accent}40`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 6px 16px rgba(0,0,0,0.55)',
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden loading="lazy" decoding="async"
            style={{ width: '76%', height: '76%', objectFit: 'contain' }} />
        </motion.span>
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
