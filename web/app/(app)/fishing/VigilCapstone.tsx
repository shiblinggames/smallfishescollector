'use client'

// THE VIGIL KEPT — the capstone, and the only time this animation ever plays.
//
// Six giants at Rank V is the hardest thing in fishing, and until now it was
// announced by three lines of text tucked inside the rank-up card: the same
// ceremony that plays for a Rank II, with a paragraph added. The one pet in the
// game locked behind skill rather than a crate got less of a moment than a
// wooden crate does.
//
// So completion hands off to its own sequence, in three beats:
//
//   1. THE WALL   all six giants, dark, lighting one at a time in gold. This is
//                 the receipt. Every one of them cost a release and a perfect,
//                 and they are counted back to you in the order you mounted
//                 them before anything else happens.
//   2. THE BREAK  the wall blows out and the light goes from gold to the pet's
//                 own crimson -- the hue turn IS the handoff, the Vigil ending
//                 and the thing it paid for arriving.
//   3. THE PET    it surfaces. First time the art has ever been on screen: it
//                 is hidden in the pet picker until earned, deliberately, so
//                 this is the reveal and it has to carry it.
//
// Follows the house ceremony rules (AncientRelease, AncientRankUp,
// ShipChristening): portalled to document.body because a transformed ancestor
// breaks position:fixed, transform and opacity only so the compositor owns
// every frame, and reduced-motion drops straight to beat 3 -- the INFORMATION
// (you finished it, here is your pet) is never locked behind an animation.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Letterbox, FlashOut, prefersReducedMotion } from '@/components/cutscene'
import { VIGIL_FRAME } from '@/lib/ancientVigil'
import { fishArt } from '@/lib/almanac'
import { hapticReward, vibrate } from '@/lib/haptics'

type Beat = 'wall' | 'break' | 'pet'

/** Pet accent — matches PET_DEFS['plesiosaur_baby'].accentColor. */
const CRIMSON = '#e0455a'
/** Gap between marks lighting. Six of these is the whole first beat. */
const MARK_MS = 300
/** Beat 1 holds a moment after the last mark lands before the break. */
const WALL_HOLD_MS = 700
const BREAK_MS = 620

export default function VigilCapstone({ names, onClose }: {
  /** The six giants, in mount order. Drives both the marks and their art. */
  names: string[]
  onClose: () => void
}) {
  const reduced = prefersReducedMotion()
  const gold = VIGIL_FRAME[5]

  const [beat, setBeat] = useState<Beat>(reduced ? 'pet' : 'wall')
  const [lit, setLit] = useState(reduced ? names.length : 0)
  const [flash, setFlash] = useState(0)

  // Beat 1 — light the marks one at a time, then hold, then break.
  useEffect(() => {
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    names.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setLit(n => Math.max(n, i + 1))
        // Each mark lands a little harder than the last.
        vibrate(10 + i * 4)
      }, 420 + i * MARK_MS))
    })
    const toBreak = setTimeout(() => {
      setBeat('break')
      setFlash(f => f + 1)
      hapticReward()
    }, 420 + names.length * MARK_MS + WALL_HOLD_MS)
    timers.push(toBreak)
    return () => timers.forEach(clearTimeout)
  }, [reduced, names])

  // Beat 2 -> 3. Short: the break is a transition, not a destination.
  useEffect(() => {
    if (beat !== 'break') return
    const t = setTimeout(() => setBeat('pet'), BREAK_MS)
    return () => clearTimeout(t)
  }, [beat])

  const onPet = beat === 'pet'
  const accent = onPet ? CRIMSON : gold.accent

  const body = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      // Only dismissable once the pet is on screen: tapping through the wall
      // would skip the one thing the sequence exists to show.
      onClick={onPet ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 430, cursor: onPet ? 'pointer' : 'default',
        background: onPet
          ? `radial-gradient(ellipse at 50% 58%, rgba(224,69,90,0.20) 0%, rgba(4,3,8,0.97) 55%, rgba(1,1,4,0.99) 100%)`
          : `radial-gradient(ellipse at 50% 50%, ${gold.glow} 0%, rgba(3,4,10,0.97) 58%, rgba(1,2,6,0.99) 100%)`,
        transition: 'background 700ms ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', textAlign: 'center', overflow: 'hidden',
      }}
    >
      {!reduced && <Letterbox height={44} z={6} />}
      <FlashOut k={flash} />

      <AnimatePresence mode="wait">
        {/* ── BEAT 1 + 2: THE WALL ──────────────────────────────────────── */}
        {!onPet && (
          <motion.div key="wall"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.15 }} transition={{ duration: 0.4 }}
            style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <motion.p className="font-karla font-800 uppercase tracking-[0.3em]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              style={{ fontSize: '0.54rem', color: gold.accent, marginBottom: 16 }}>
              The Long Vigil
            </motion.p>

            {/* The six marks. Dark until their turn, then struck in gold. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {names.map((n, i) => {
                const on = i < lit
                return (
                  <motion.div key={n}
                    animate={on ? { scale: [1, 1.12, 1] } : {}}
                    transition={{ duration: 0.42, ease: 'easeOut' }}
                    style={{
                      position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
                      border: on ? gold.border : '1px solid rgba(120,110,90,0.22)',
                      background: on ? gold.plate : 'rgba(255,255,255,0.02)',
                      boxShadow: on ? `0 0 22px ${gold.glow}` : 'none',
                      transition: 'border 300ms ease, background 300ms ease, box-shadow 300ms ease',
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fishArt(n)} alt="" aria-hidden decoding="async"
                      style={{
                        width: '100%', height: '100%', objectFit: 'contain', padding: 5,
                        filter: on ? (gold.fishFilter ?? `drop-shadow(0 3px 8px ${gold.glow})`) : 'brightness(0.22) saturate(0)',
                        transition: 'filter 380ms ease',
                      }} />
                  </motion.div>
                )
              })}
            </div>

            <motion.p className="font-cinzel font-800"
              animate={{ opacity: lit >= names.length ? 1 : 0.45 }} transition={{ duration: 0.4 }}
              style={{ fontSize: '1.1rem', color: '#f4eee2', marginTop: 16 }}>
              {lit >= names.length ? 'All six, mastered' : `${lit} of ${names.length}`}
            </motion.p>
          </motion.div>
        )}

        {/* ── BEAT 3: THE PET ───────────────────────────────────────────── */}
        {onPet && (
          <motion.div key="pet"
            initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.45 }}
            style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
            <motion.p className="font-karla font-800 uppercase tracking-[0.3em]"
              initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              style={{ fontSize: '0.54rem', color: CRIMSON, marginBottom: 10 }}>
              The Vigil is kept
            </motion.p>

            {/* IT SURFACES. Rises out of the dark the way a released giant sinks
                into it, so the whole system opens and closes on the same move. */}
            <motion.div
              initial={reduced ? false : { y: 120, opacity: 0, scale: 0.86 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: 'relative' }}>
              {/* Water it comes up through — a ring that widens and fades once. */}
              {!reduced && (
                <motion.span aria-hidden
                  initial={{ scale: 0.35, opacity: 0.6 }} animate={{ scale: 2.3, opacity: 0 }}
                  transition={{ duration: 1.5, delay: 0.35, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', left: '50%', top: '58%', width: 190, height: 190,
                    marginLeft: -95, marginTop: -95, borderRadius: '50%',
                    border: `2px solid ${CRIMSON}`, pointerEvents: 'none',
                  }} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/plesiosaur_baby.png" alt="Baby Plesiosaurus" decoding="async"
                style={{
                  position: 'relative', display: 'block', width: '100%', height: 210,
                  objectFit: 'contain', filter: `drop-shadow(0 10px 26px rgba(224,69,90,0.55))`,
                }} />
            </motion.div>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.85, duration: 0.5 }}>
              <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f4eee2', marginTop: 10, lineHeight: 1.1 }}>
                Baby Plesiosaurus
              </p>
              <p className="font-karla font-600 uppercase tracking-[0.2em]" style={{ fontSize: '0.54rem', color: CRIMSON, marginTop: 7 }}>
                Earned, never found
              </p>
              <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b9b2a6', marginTop: 12, lineHeight: 1.55, maxWidth: 290, marginInline: 'auto' }}>
                It rides the bow, so it sails alongside whatever pet you already keep. No crate will ever hand out another.
              </p>
              <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.54rem', color: '#6f6890', marginTop: 20 }}>
                Tap to continue
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(body, document.body)
}
