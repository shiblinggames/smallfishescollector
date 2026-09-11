'use client'

// THE LEVEL-UP. ONE OF THEM, FOR BOTH SKILLS.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// There were two. Nav levelled you up with this — a dark wash, rings going
// out, sparkles, the number enormous in the middle of the screen — and fishing
// levelled you up with a card: a plate of the water across the top, the number
// set into it, the payout listed underneath in the dark. Both were fine on
// their own and the game only has one kind of level, so meeting the other one
// read as a different game.
//
// This is the Nav moment, kept, and the two skills now pour into it. What
// fishing brought with it is the only thing that changed: the things a level
// UNLOCKS are the art on this screen, big, rather than a strip of scenery
// behind a number. A rod you can finally buy is a picture of that rod.
//
// ── WHAT IT IS MADE OF ──────────────────────────────────────────────────────
//
// A moment, not a receipt. In order: the flash, the rings, a slow turn of gold
// behind the number, the number itself CLIMBING from the level you were to the
// one you are (with a shine passing over it as it lands), then what it gave
// you, then what it opened. Everything is localised to the middle of the
// screen — nothing here shakes the page. See [[feedback-juice-subtlety]].

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const BLUE = '#60a5fa'

/** A thing this level opened: a picture and its name. `wide` art (a water, a
 *  place) is given the full width of the column; everything else is a tile. */
export type UnlockItem = { name: string; image: string; tint?: string }
export type UnlockGroup = { caption: string; items: UnlockItem[]; wide?: boolean }
/** One line of "what you now have": a gold figure and what it is. */
export type LevelStat = { label: string; value: string }

export default function LevelUpCelebration({
  skill, from, to, statsCaption, stats = [], chips = [], unlocks = [], note, onDone, zIndex = 90, show = true,
}: {
  /** The word under the number. Names which ladder moved. */
  skill: string
  from: number
  to: number
  /** Heading over the stat lines ("Captain's Bonus"). Omitted with no lines. */
  statsCaption?: string
  stats?: LevelStat[]
  /** What the level PAID, one pill per level that paid. Fishing only. */
  chips?: string[]
  unlocks?: UnlockGroup[]
  /** The footnote under everything — e.g. why several arrived at once. */
  note?: string
  onDone: () => void
  zIndex?: number
  /** Mount it always and toggle this to get the fade OUT. A caller that
   *  unmounts the whole component instead takes its AnimatePresence with it,
   *  and an exit that is not there to run does not run. */
  show?: boolean
}) {
  const many = to - from > 1

  // A KNOCK ON THE HAND as it opens, on the phones that can. Two beats rising,
  // the shape every other good thing on the chart uses. No-op on a desktop.
  useEffect(() => { if (show) vibrate([0, 22, 50, 30]) }, [show])

  // ── THE NUMBER CLIMBS ─────────────────────────────────────────────────
  // It could just be the new level, and was. A number that ARRIVES says a
  // number changed; a number that climbs says YOU changed it, and when three
  // levels landed at once it is the only thing on screen that shows all three.
  // Starts after the pop, so the moment lands before it begins to move.
  const [shown, setShown] = useState(from)
  useEffect(() => {
    if (to <= from) { setShown(to); return }
    setShown(from)
    const steps = to - from
    const per = Math.max(130, Math.min(420, 900 / steps))
    let i = 0
    let tick = 0
    const start = window.setTimeout(() => {
      tick = window.setInterval(() => {
        i += 1
        setShown(from + i)
        if (from + i >= to) window.clearInterval(tick)
      }, per)
    }, 340)
    return () => { window.clearTimeout(start); window.clearInterval(tick) }
  }, [from, to])

  return (
    <AnimatePresence>
      {show && (
      <motion.div
        key="levelup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 0.25 }}
        data-any-key
        // The chart under this steers on pointerdown and CAPTURES the pointer
        // for the rest of the gesture, so an overlay without this both sails
        // the boat and never receives its own click. See PopupShell.
        data-no-steer
        onClick={onDone}
        style={{
          position: 'fixed', inset: 0, zIndex,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // Near-opaque, because a painted chart or a raid deck underneath
          // would otherwise read straight through the number.
          background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(20,40,80,0.94) 0%, rgba(0,0,0,0.98) 100%)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          cursor: 'pointer',
          padding: '1.5rem',
          overflowY: 'auto',
        }}
      >
        {/* THE FLASH. One frame of white at the centre, gone almost before it
            is seen. It is what makes the rings read as something bursting
            rather than three circles growing. */}
        <motion.div aria-hidden
          initial={{ opacity: 0.5, scale: 0.4 }} animate={{ opacity: 0, scale: 2.2 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: 260, height: 260, marginLeft: -130, marginTop: -130,
            borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 68%)',
          }} />

        {/* Ring bursts */}
        {[0, 0.12, 0.24].map((delay, i) => (
          <motion.div key={`ring-${i}`}
            initial={{ scale: 0.1, opacity: 0.85 - i * 0.2 }}
            animate={{ scale: 4.5 - i * 0.6, opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut', delay }}
            style={{
              position: 'absolute',
              width: 110, height: 110, borderRadius: '50%',
              border: `${2 - i}px solid ${i % 2 === 0 ? 'rgba(96,165,250,0.75)' : 'rgba(240,192,64,0.6)'}`,
              left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* THE SLOW TURN OF GOLD behind the number — the one thing kept from
            the card fishing used to wear, because it was the part that made a
            level look like an occasion. Masked to a soft disc so it has no
            edge, and slow enough that it never competes with the number. */}
        <motion.div aria-hidden
          initial={{ opacity: 0 }} animate={{ opacity: 0.85, rotate: 360 }}
          transition={{ opacity: { duration: 1.1 }, rotate: { duration: 22, repeat: Infinity, ease: 'linear' } }}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: 460, height: 460, marginLeft: -230, marginTop: -230,
            background: `conic-gradient(from 0deg, ${GOLD}00 0deg, ${GOLD}44 28deg, ${GOLD}00 58deg, ${GOLD}00 120deg, ${GOLD}33 150deg, ${GOLD}00 180deg, ${GOLD}00 240deg, ${GOLD}3d 268deg, ${GOLD}00 300deg, ${GOLD}00 360deg)`,
            filter: 'blur(4px)',
            maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 18%, rgba(0,0,0,0) 60%)',
            WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 18%, rgba(0,0,0,0) 60%)',
            pointerEvents: 'none',
          }} />

        {/* Sparkles, thrown wider and in more sizes than the five this had.
            Gold and blue alternating, the same two colours as the rings. */}
        {([
          { x: -60, s: 1.0, d: 0.08 }, { x: 60, s: 0.8, d: 0.14 },
          { x: -30, s: 1.3, d: 0.22 }, { x: 35, s: 0.9, d: 0.06 },
          { x: 0, s: 1.1, d: 0.18 }, { x: -105, s: 0.7, d: 0.30 },
          { x: 100, s: 1.2, d: 0.26 }, { x: -140, s: 0.9, d: 0.40 },
          { x: 138, s: 0.8, d: 0.36 },
        ] as { x: number; s: number; d: number }[]).map((s, i) => (
          <motion.span key={`sp-${i}`}
            initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
            animate={{ opacity: [0, 1, 0], y: -80 - i * 13, x: s.x * 1.4, scale: [0, 1.4 * s.s, 0.4] }}
            transition={{ duration: 1.2 + s.s * 0.3, delay: s.d, ease: 'easeOut' }}
            style={{ position: 'absolute', color: i % 2 === 0 ? BLUE : GOLD, fontSize: `${0.9 * s.s}rem`, pointerEvents: 'none' }}
          >✦</motion.span>
        ))}

        <motion.div
          initial={{ scale: 0.55, y: 18, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut', delay: 0.06 }}
          style={{ textAlign: 'center', position: 'relative', maxWidth: 380, margin: 'auto 0' }}
        >
          <p className="font-cinzel font-700 uppercase tracking-[0.25em]"
            style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.35rem', textShadow: '0 0 18px rgba(255,255,255,0.95), 0 0 48px rgba(96,165,250,0.6)' }}>
            Level Up!
          </p>

          {/* THE NUMBER, and a shine passing over it as it settles. The sweep
              is clipped to this box, so it reads as light crossing the figure
              rather than a bar drawn on the screen. */}
          <div style={{ position: 'relative', overflow: 'hidden', padding: '0 0.4rem' }}>
            <motion.p key={shown} className="font-cinzel font-700"
              initial={{ scale: 1.18 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 17 }}
              style={{
                fontSize: '5rem', lineHeight: 1, color: GOLD,
                textShadow: `0 0 40px ${GOLD}, 0 0 90px ${GOLD}80`,
                fontVariantNumeric: 'tabular-nums',
              }}>
              {shown}
            </motion.p>
            <motion.div aria-hidden
              initial={{ x: '-140%' }} animate={{ x: '260%' }}
              transition={{ delay: 0.34 + (to - from) * 0.16, duration: 0.8, ease: 'easeInOut' }}
              style={{
                position: 'absolute', top: 0, bottom: 0, width: '38%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%)',
                transform: 'skewX(-18deg)', mixBlendMode: 'screen', pointerEvents: 'none',
              }} />
          </div>

          <p className="font-karla font-700 uppercase"
            style={{ fontSize: '0.62rem', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.62)', marginTop: 6, textShadow: '0 0 12px rgba(96,165,250,0.45)' }}>
            {skill}
          </p>

          {/* Several at once looks like a bug unless somebody says otherwise. */}
          {many && (
            <p className="font-karla font-700 uppercase"
              style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: `${GOLD}c0`, marginTop: 7 }}>
              {to - from} levels earned
            </p>
          )}

          {/* ── WHAT YOU NOW HAVE ───────────────────────────────────── */}
          {stats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.3, ease: 'easeOut' }}
              style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              {statsCaption && (
                <p className="font-karla font-700 uppercase tracking-[0.22em]"
                   style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.4rem', textShadow: '0 0 12px rgba(96,165,250,0.4)' }}>
                  {statsCaption}
                </p>
              )}
              {stats.map(s => (
                <p key={s.label} className="font-cinzel font-700"
                  style={{
                    display: 'inline-flex', alignItems: 'baseline', gap: 10,
                    fontSize: '1.05rem', lineHeight: 1.25, color: '#f0ede8',
                    textShadow: `0 0 16px ${GOLD}73, 0 0 30px ${BLUE}38`,
                  }}>
                  <span style={{ color: GOLD }}>{s.value}</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem', letterSpacing: '0.08em' }}>{s.label}</span>
                </p>
              ))}
            </motion.div>
          )}

          {/* ── WHAT IT PAID ────────────────────────────────────────── */}
          {chips.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, duration: 0.3, ease: 'easeOut' }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: stats.length ? 14 : '1.25rem' }}>
              {chips.map((c, i) => (
                <span key={i} className="font-karla font-700" style={{
                  fontSize: '0.78rem', color: '#f4ecd8',
                  background: `${GOLD}1f`, border: `1px solid ${GOLD}5c`, borderRadius: 999,
                  padding: '0.3rem 0.75rem', boxShadow: `0 0 18px ${GOLD}1f`,
                }}>{c}</span>
              ))}
            </motion.div>
          )}

          {/* ── AND WHAT IT OPENED ──────────────────────────────────── */}
          {unlocks.map((g, gi) => (
            <UnlockBlock key={g.caption} group={g} delay={0.5 + gi * 0.14} />
          ))}

          {note && (
            <motion.p className="font-karla font-600"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.62 }}
              style={{ fontSize: '0.74rem', color: 'rgba(190,212,228,0.5)', marginTop: 14, lineHeight: 1.55 }}>
              {note}
            </motion.p>
          )}

          <motion.p className="font-karla font-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
            style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.32)', marginTop: '1rem', letterSpacing: '0.08em' }}>
            tap to continue
          </motion.p>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * WHAT A LEVEL OPENED, AT A SIZE YOU CAN SEE.
 *
 * This was a row of 50px thumbnails with the name in 0.46rem underneath, which
 * is a legend on a map, not a reward. A rod you can finally buy is a picture of
 * that rod; a water that just opened is a picture of the water. They come in
 * one at a time with a lift, so the eye is walked across them.
 */
function UnlockBlock({ group, delay }: { group: UnlockGroup; delay: number }) {
  if (group.items.length === 0) return null
  const shown = group.items.slice(0, 4)
  const extra = group.items.length - shown.length
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      style={{ marginTop: '1.1rem' }}
    >
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.55rem', color: GOLD, letterSpacing: '0.2em', marginBottom: 9,
        textShadow: `0 0 12px ${GOLD}66`,
      }}>{group.caption}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {shown.map((it, i) => {
          const tint = it.tint ?? GOLD
          return (
            <motion.div key={it.name}
              initial={{ opacity: 0, scale: 0.82, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: delay + 0.1 + i * 0.11, type: 'spring', stiffness: 300, damping: 20 }}
              style={{
                position: 'relative', overflow: 'hidden',
                width: group.wide ? '100%' : 'clamp(92px, 27vw, 122px)',
                borderRadius: 16,
                border: `1px solid ${tint}66`,
                background: `linear-gradient(180deg, ${tint}14 0%, rgba(8,14,22,0.92) 100%)`,
                boxShadow: `0 10px 30px rgba(0,0,0,0.55), 0 0 26px ${tint}1f`,
              }}>
              {/* The art. A wide plate is a place and fills its frame; a tile is
                  an object and floats in one. */}
              <div style={{
                height: group.wide ? 108 : 'clamp(92px, 27vw, 122px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {it.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={it.image} alt="" loading="eager" decoding="async" style={{
                      width: '100%', height: '100%',
                      objectFit: group.wide ? 'cover' : 'contain',
                      padding: group.wide ? 0 : '0.55rem',
                      filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.65))',
                    }} />
                  : <span style={{ fontSize: '2rem', color: tint }}>✦</span>}
              </div>
              {/* The name sits ON a wide plate (there is a picture under it) and
                  UNDER a tile (there is not). */}
              {group.wide && (
                <div aria-hidden style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(180deg, rgba(4,8,12,0.1) 30%, rgba(4,8,12,0.85) 100%)',
                }} />
              )}
              <p className="font-karla font-700" style={{
                position: group.wide ? 'absolute' : 'static',
                left: 0, right: 0, bottom: group.wide ? 10 : undefined,
                fontSize: group.wide ? '0.95rem' : '0.72rem',
                color: group.wide ? '#f4ecd8' : 'rgba(244,236,216,0.92)',
                padding: group.wide ? 0 : '0 0.4rem 0.55rem',
                lineHeight: 1.25,
                textShadow: group.wide ? '0 2px 10px rgba(0,0,0,0.9)' : undefined,
              }}>{it.name}</p>
            </motion.div>
          )
        })}
        {extra > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 'clamp(92px, 27vw, 122px)', borderRadius: 16,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
          }}>
            <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)' }}>+{extra}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
