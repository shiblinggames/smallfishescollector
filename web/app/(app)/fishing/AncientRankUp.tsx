'use client'

// THE MOUNTING — a giant comes back up, and the wall claims it at a new rank.
//
// This is the RELEASE run backwards, deliberately, because the two are one
// gesture in two directions and should rhyme:
//
//   release   the water RISES over the mount, colour drains, it sinks away
//   mounting  the giant RISES out of the dark, colour floods back, and the
//             frame closes around it in the material it just earned
//
// So the beats invert. Where the release ends on an empty berth, this ends on
// a filled one, wearing metal the wall has never worn before.
//
// EVERY RANK IS ITS OWN EVENT. The rise takes longer, the motes multiply, the
// rings stack, and the strike hits harder the further up the ladder you are —
// so Rank II is a moment and Rank V is an event. Rank V also turns the giant
// itself to gold (the game's own golden-catch filter), which is the single
// biggest visual step in the whole system and the reason gold appears nowhere
// else on the ladder.
//
// Follows ShipChristening's rules, as every ceremony here does: portalled to
// document.body (a transformed ancestor would break position:fixed), transform
// and opacity only so the compositor owns every frame, and reduced-motion
// drops straight to the result — the INFORMATION (what rank you just took)
// must never be locked behind an animation.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Letterbox, FlashOut, prefersReducedMotion } from '@/components/cutscene'
import { VIGIL_FRAME, VIGIL_MAX_RANK, vigilNumeral } from '@/lib/ancientVigil'
import { fishArt } from '@/lib/almanac'
import { hapticReward, vibrate } from '@/lib/haptics'

type Beat = 'rising' | 'struck'

/** The rise lengthens up the ladder: a Rank V mounting should feel like it
 *  took something to haul up. */
const RISE_MS: Record<number, number> = { 2: 900, 3: 1050, 4: 1200, 5: 1500 }

export default function AncientRankUp({ name, from, to, petGranted, onClose }: {
  name: string
  from: number
  to: number
  /** The Vigil completed and paid its capstone — the one pet no crate drops. */
  petGranted?: boolean
  onClose: () => void
}) {
  const reduced = prefersReducedMotion()
  const frame = VIGIL_FRAME[to] ?? VIGIL_FRAME[1]
  const prev = VIGIL_FRAME[from] ?? VIGIL_FRAME[1]
  const isMax = to >= VIGIL_MAX_RANK
  const riseMs = RISE_MS[to] ?? 1000

  const [beat, setBeat] = useState<Beat>(reduced ? 'struck' : 'rising')
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    if (reduced) return
    const t = setTimeout(() => {
      setBeat('struck')
      setFlash(f => f + 1)
      // The strike lands harder the higher the rank.
      if (isMax) hapticReward()
      else vibrate(to >= 4 ? [30, 40, 60] : [20, 40])
    }, riseMs)
    return () => clearTimeout(t)
  }, [reduced, riseMs, isMax, to])

  // Motes rising off the water. More, and faster, the higher the rank — the
  // cheapest way to make five ceremonies feel like five different sizes.
  const moteCount = reduced ? 0 : 8 + to * 4
  const motes = Array.from({ length: moteCount }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 7) * 0.11,
    dur: 1.5 + (i % 4) * 0.35,
    size: 2 + (i % 3),
  }))

  const body = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 420, cursor: 'pointer',
        background: `radial-gradient(ellipse at 50% 62%, ${frame.glow} 0%, rgba(3,5,12,0.96) 55%, rgba(1,2,6,0.99) 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', textAlign: 'center', overflow: 'hidden',
      }}
    >
      {!reduced && <Letterbox height={40} z={6} />}
      <FlashOut k={flash} />

      {/* Motes off the water, rising past the mount. pointer-events none so the
          tap-anywhere dismiss still works through them. */}
      {motes.map((m, i) => (
        <motion.span key={i} aria-hidden
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.8, 0], y: -220 }}
          transition={{ duration: m.dur, delay: m.delay, repeat: Infinity, ease: 'easeOut' }}
          style={{
            position: 'absolute', bottom: '18%', left: `${m.left}%`,
            width: m.size, height: m.size, borderRadius: '50%',
            background: frame.accent, pointerEvents: 'none',
          }} />
      ))}

      {/* Rings on the strike — one per rank, so the top of the ladder throws
          the widest bloom. */}
      <AnimatePresence>
        {beat === 'struck' && !reduced && Array.from({ length: to }, (_, i) => (
          <motion.span key={`ring-${i}`} aria-hidden
            initial={{ scale: 0.3, opacity: 0.55 }}
            animate={{ scale: 2.4 + i * 0.35, opacity: 0 }}
            transition={{ duration: 0.9 + i * 0.12, delay: i * 0.09, ease: 'easeOut' }}
            style={{
              position: 'absolute', width: 240, height: 240, borderRadius: '50%',
              border: `2px solid ${frame.accent}`, pointerEvents: 'none',
            }} />
        ))}
      </AnimatePresence>

      <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
        <motion.p className="font-karla font-800 uppercase tracking-[0.3em]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          style={{ fontSize: '0.54rem', color: frame.accent, marginBottom: 12 }}>
          {beat === 'rising' ? 'It comes up' : isMax ? 'Mastered' : 'Mounted'}
        </motion.p>

        {/* THE MOUNT. Rises into frame, then the material closes around it. */}
        <motion.div
          initial={reduced ? false : { y: 90, opacity: 0 }}
          animate={beat === 'rising' ? { y: 0, opacity: 1 } : { y: 0, opacity: 1 }}
          transition={{ duration: riseMs / 1000, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'relative', borderRadius: 16, overflow: 'hidden',
            // The frame is the PREVIOUS rank until the strike, then it becomes
            // the new one — the material changing IS the reward.
            border: beat === 'struck' ? frame.border : prev.border,
            background: beat === 'struck' ? frame.plate : prev.plate,
            boxShadow: beat === 'struck'
              ? `0 0 ${isMax ? 60 : 36}px ${frame.glow}, 0 18px 50px rgba(0,0,0,0.7)`
              : `0 12px 40px rgba(0,0,0,0.7)`,
            transition: 'border 320ms ease, background 320ms ease, box-shadow 320ms ease',
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fishArt(name)} alt="" aria-hidden decoding="async"
            style={{
              position: 'relative', display: 'block', width: '100%', height: 190,
              objectFit: 'contain', padding: '0.8rem',
              // Comes up wet and dark, then the new rank claims it. At V it is
              // struck in gold, the same treatment a golden catch wears.
              filter: beat === 'struck'
                ? (frame.fishFilter ?? `drop-shadow(0 6px 16px ${frame.glow})`)
                : 'brightness(0.35) saturate(0.5)',
              transition: 'filter 420ms ease',
            }} />
          <AnimatePresence>
            {beat === 'struck' && (
              <motion.span key="numeral" className="font-cinzel font-800" aria-hidden
                initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                style={{
                  position: 'absolute', right: 12, top: 10, fontSize: isMax ? '1.5rem' : '1.15rem',
                  color: frame.accent, textShadow: `0 0 16px ${frame.glow}`,
                }}>{isMax ? '★' : vigilNumeral(to)}</motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f4eee2', marginTop: 14, lineHeight: 1.1 }}>{name}</p>

        <AnimatePresence>
          {beat === 'struck' && (
            <motion.div key="verdict"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <p className="font-cinzel font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.95rem', color: frame.accent, marginTop: 8 }}>
                {isMax ? `Rank ${vigilNumeral(to)} · ${frame.label}` : `Rank ${vigilNumeral(from)} → ${vigilNumeral(to)}`}
              </p>
              <p className="font-karla font-600 uppercase tracking-[0.2em]" style={{ fontSize: '0.54rem', color: '#8a8578', marginTop: 6 }}>
                {frame.label}
              </p>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: '#b9b2a6', marginTop: 10, lineHeight: 1.5, maxWidth: 300, marginInline: 'auto' }}>
                {isMax
                  ? 'It has nothing left to teach you. The wall keeps it in gold.'
                  : 'Back on the wall, and heavier than it was. Let it go again when you want the next rung.'}
              </p>

              {petGranted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 18 }}
                  style={{
                    marginTop: 14, padding: '0.8rem 0.9rem', borderRadius: 12,
                    background: 'rgba(224,69,90,0.10)', border: '1px solid rgba(224,69,90,0.45)',
                  }}>
                  <p className="font-karla font-800 uppercase tracking-[0.24em]" style={{ fontSize: '0.5rem', color: '#e0455a' }}>The Vigil is kept</p>
                  <p className="font-cinzel font-800" style={{ fontSize: '1rem', color: '#f4eee2', marginTop: 5 }}>A Baby Plesiosaurus follows you home</p>
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: '#b9b2a6', marginTop: 5, lineHeight: 1.45 }}>
                    All six mastered. It rides the bow, so it sails alongside whatever pet you already keep. No crate will ever hand out another.
                  </p>
                </motion.div>
              )}

              <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.54rem', color: '#6f6890', marginTop: 18 }}>
                Tap to continue
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(body, document.body)
}
