'use client'

// THE RELEASE — giving a mounted giant back to the dark.
//
// The gesture and the fiction are the same action, which is the whole idea:
// you HOLD, and as you hold the water rises up the frame until it closes over
// the mount. You are drowning your own trophy back into the sea. Let go early
// and the water drains out; nothing happens. No confirm dialog can feel like
// that, and this is the one moment the Vigil hangs on.
//
// Structure follows ShipChristening, the other ceremony in the game: portalled
// to document.body (a transformed ancestor would make position:fixed anchor to
// it instead of the viewport), transform and opacity only so the compositor
// owns every frame, and prefers-reduced-motion drops to a plain confirm --
// the INFORMATION here (what you are giving up, what you get) must never be
// locked behind an animation.
//
// The art is the hero at every rank; the FRAME is what changes (VIGIL_FRAME),
// which is how five distinct looks cost no new art.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Letterbox, FlashOut, prefersReducedMotion } from '@/components/cutscene'
import { vigilNumeral, VIGIL_FRAME, VIGIL_FIGHT_TELL, VIGIL_MAX_RANK } from '@/lib/ancientVigil'
import { fishArt } from '@/lib/almanac'
import { vibrate, hapticReward } from '@/lib/haptics'

/** How long the hold must be held. Long enough to be a decision, short enough
 *  not to be a chore -- and long enough for the water to read as rising. */
const HOLD_MS = 1600

type Phase = 'held' | 'waking' | 'gone'

export default function AncientRelease({ name, fishId, rank, onConfirm, onClose }: {
  name: string
  fishId: number
  rank: number
  /** Fires once the hold completes. Should perform the server release. */
  onConfirm: () => Promise<void> | void
  onClose: () => void
}) {
  const reduced = prefersReducedMotion()
  const frame = VIGIL_FRAME[rank] ?? VIGIL_FRAME[1]
  const nextFrame = VIGIL_FRAME[Math.min(VIGIL_MAX_RANK, rank + 1)] ?? frame

  const [phase, setPhase] = useState<Phase>('held')
  const [progress, setProgress] = useState(0)      // 0..1, the tide
  const [flash, setFlash] = useState(0)
  const holding = useRef(false)
  const raf = useRef<number | null>(null)
  const startedAt = useRef(0)
  const lastTick = useRef(0)

  // The tide. Rises while held, drains when let go — one rAF either way so the
  // bar never jumps between the two.
  useEffect(() => {
    const tick = () => {
      raf.current = requestAnimationFrame(tick)
      setProgress(prev => {
        if (phase !== 'held') return prev
        const next = holding.current
          ? Math.min(1, prev + (16.7 / HOLD_MS))
          : Math.max(0, prev - (16.7 / (HOLD_MS * 0.5)))   // drains twice as fast
        // Haptic ladder on the way up, so the hold has a felt floor.
        if (holding.current && next > lastTick.current + 0.2) {
          lastTick.current = next
          vibrate(6)
        }
        if (!holding.current) lastTick.current = 0
        if (next >= 1 && prev < 1) {
          // Committed. Fire the wake beat and the server call together.
          setPhase('waking')
          setFlash(f => f + 1)
          hapticReward()
          void Promise.resolve(onConfirm()).catch(() => {})
          setTimeout(() => setPhase('gone'), 1500)
        }
        return next
      })
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [phase, onConfirm])

  const press = () => { if (phase === 'held') { holding.current = true; startedAt.current = Date.now() } }
  const release = () => { holding.current = false }

  const body = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(8,10,22,0.94) 0%, rgba(2,3,8,0.99) 70%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', textAlign: 'center',
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      {!reduced && <Letterbox height={40} z={6} />}
      <FlashOut k={flash} />

      <AnimatePresence mode="wait">
        {phase !== 'gone' ? (
          <motion.div key="mount" exit={{ opacity: 0, y: 26, transition: { duration: 0.7, ease: [0.4, 0, 1, 1] } }}
            style={{ position: 'relative', width: '100%', maxWidth: 340 }}>

            <p className="font-karla font-800 uppercase tracking-[0.28em]" style={{ fontSize: '0.54rem', color: frame.accent, marginBottom: 10 }}>
              {phase === 'waking' ? 'It wakes' : 'Give it back'}
            </p>

            {/* THE MOUNT. Framed and lit hard from above like a museum piece,
                until the water takes it and the colour comes back. */}
            <div style={{
              position: 'relative', borderRadius: 16, overflow: 'hidden',
              border: frame.border,
              boxShadow: `0 0 34px ${frame.glow}, 0 18px 50px rgba(0,0,0,0.7)`,
              // The rank you are giving UP, in its own material.
              background: frame.plate,
            }}>
              {/* The tide. A plain scaleY on a gradient -- compositor-owned, no
                  per-frame layout, and it reads as water because it rises from
                  the bottom edge of the frame the mount sits in. */}
              <div aria-hidden style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%',
                transformOrigin: 'bottom center',
                transform: `scaleY(${progress})`,
                background: `linear-gradient(180deg, ${frame.accent}22 0%, rgba(20,60,90,0.5) 30%, rgba(6,20,38,0.85) 100%)`,
                pointerEvents: 'none',
              }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fishArt(name)} alt="" aria-hidden decoding="async"
                style={{
                  position: 'relative', display: 'block', width: '100%', height: 190,
                  objectFit: 'contain', padding: '0.8rem',
                  // Dry and dead on the wall; colour returns as the water covers it.
                  filter: `grayscale(${1 - progress * 0.92}) brightness(${0.62 + progress * 0.5})`,
                  transition: 'none',
                }} />
              {phase === 'held' && (
                <span className="font-cinzel font-800" aria-hidden style={{
                  position: 'absolute', right: 12, top: 10, fontSize: '0.95rem',
                  color: frame.accent, textShadow: `0 0 12px ${frame.glow}`,
                }}>{vigilNumeral(rank)}</span>
              )}
            </div>

            <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f2ecff', marginTop: 14, lineHeight: 1.1 }}>{name}</p>

            {phase === 'waking' ? (
              <p className="font-karla font-400 italic" style={{ fontSize: '0.8rem', color: frame.accent, marginTop: 8, lineHeight: 1.5 }}>
                The eye opens. It turns for the dark, and it remembers you.
              </p>
            ) : (
              <>
                <p className="font-karla" style={{ fontSize: '0.74rem', color: '#b8b1d0', marginTop: 8, lineHeight: 1.5, maxWidth: 300, marginInline: 'auto' }}>
                  {VIGIL_FIGHT_TELL[fishId]}
                </p>
                <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a83ad', marginTop: 10, lineHeight: 1.45 }}>
                  Your wall is one short until you land it again. Come back with it on a perfect and it mounts at Rank {vigilNumeral(rank + 1)}.
                </p>

                {/* The control. HOLD, not tap -- see the file header. */}
                <button
                  type="button"
                  onPointerDown={e => { e.preventDefault(); press() }}
                  onPointerUp={release}
                  className="font-karla font-800 uppercase tracking-[0.16em] tap"
                  style={{
                    marginTop: 16, width: '100%', padding: '0.95rem', borderRadius: 12,
                    position: 'relative', overflow: 'hidden',
                    background: 'transparent', border: `1px solid ${nextFrame.accent}77`,
                    color: nextFrame.accent, fontSize: '0.68rem', cursor: 'pointer',
                    touchAction: 'none', userSelect: 'none',
                  }}>
                  {/* Fill mirrors the tide so the button and the frame agree. */}
                  <span aria-hidden style={{
                    position: 'absolute', inset: 0, transformOrigin: 'left center',
                    transform: `scaleX(${progress})`, background: `${nextFrame.accent}2e`,
                  }} />
                  <span style={{ position: 'relative' }}>
                    {progress > 0 ? 'Keep holding…' : 'Hold to release'}
                  </span>
                </button>

                <button type="button" onClick={onClose}
                  className="font-karla font-600 tap"
                  style={{ marginTop: 10, background: 'none', border: 'none', color: '#6f6890', fontSize: '0.68rem', cursor: 'pointer' }}>
                  Leave it on the wall
                </button>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key="gone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
            style={{ maxWidth: 320 }}>
            <p className="font-karla font-800 uppercase tracking-[0.28em]" style={{ fontSize: '0.54rem', color: '#94a3b8' }}>At large</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#e8e3f5', marginTop: 10, lineHeight: 1.15 }}>
              {name} is back in the deep
            </p>
            <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a93b8', marginTop: 10, lineHeight: 1.5 }}>
              Its berth is empty until you bring it home. It will only rise for a Golden or Luminous Lure.
            </p>
            <button type="button" onClick={onClose}
              className="font-cinzel font-700 uppercase tracking-[0.12em] tap"
              style={{ marginTop: 18, width: '100%', padding: '0.8rem', borderRadius: 12, background: 'transparent', border: '1px solid rgba(148,163,184,0.45)', color: '#c8c4dc', fontSize: '0.72rem', cursor: 'pointer' }}>
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(body, document.body)
}
