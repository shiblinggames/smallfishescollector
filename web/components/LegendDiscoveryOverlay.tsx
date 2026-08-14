'use client'

// The 5th-legendary discovery moment — fired deep in a Hardcore Gauntlet run
// when the rare roll surfaces Laz the Coelacanth. The grandest reveal in the
// game: it's a once-ever find. Communicates the stake too — in Hardcore you
// only KEEP what you discovered if you make it back to the surface alive.
//
// Art tolerant: the card PNG lives in the card-arts bucket. If it 404s (real
// art not uploaded yet) we fall back to a themed abyssal sigil so the moment
// never shows a broken image.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

interface Props {
  open: boolean
  onDismiss: () => void
  /** Crew display name. Defaults to Laz. */
  name?: string
  /** Species subtitle. */
  species?: string
  /** Card art filename in the card-arts bucket. */
  artFilename?: string
}

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const GOLD = '#f0c040'
const CRIMSON = '#d1495b'

export default function LegendDiscoveryOverlay({
  open, onDismiss,
  name = 'Laz', species = 'The Coelacanth', artFilename = 'Coelacanth.png',
}: Props) {
  const [artFailed, setArtFailed] = useState(false)
  const art = `${SUPA}/storage/v1/object/public/card-arts/${artFilename}`

  useEffect(() => {
    if (!open) return
    vibrate([0, 40, 70, 45, 100, 60])
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="legend-discovery"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          transition={{ duration: 0.35 }}
          data-any-key
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 120,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse 90% 75% at 50% 45%, rgba(30,10,18,0.97) 0%, rgba(2,4,10,0.995) 100%)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            cursor: 'pointer', padding: '1.5rem',
          }}
        >
          {/* Rising light shafts from the deep */}
          {[-90, -30, 30, 90].map((x, i) => (
            <motion.div key={`shaft-${i}`}
              initial={{ opacity: 0, scaleY: 0.2 }}
              animate={{ opacity: [0, 0.5, 0.2], scaleY: 1 }}
              transition={{ duration: 2.2, delay: 0.1 + i * 0.08, ease: 'easeOut' }}
              style={{
                position: 'absolute', bottom: 0, left: `calc(50% + ${x}px)`,
                width: 60, height: '70%', transformOrigin: 'bottom',
                background: `linear-gradient(to top, ${GOLD}22, transparent)`,
                filter: 'blur(8px)', pointerEvents: 'none',
              }}
            />
          ))}

          {/* Ring bursts */}
          {[0, 0.12, 0.24, 0.36].map((delay, i) => (
            <motion.div key={`ring-${i}`}
              initial={{ scale: 0.1, opacity: 0.85 - i * 0.16 }}
              animate={{ scale: 5.6 - i * 0.6, opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeOut', delay }}
              style={{
                position: 'absolute', width: 120, height: 120, borderRadius: '50%',
                border: `${2 - Math.min(1, i)}px solid ${i % 2 === 0 ? GOLD + 'd0' : CRIMSON + 'aa'}`,
                left: '50%', top: '42%', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
              }}
            />
          ))}

          <motion.div
            initial={{ scale: 0.55, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
            style={{ textAlign: 'center', position: 'relative', maxWidth: 340 }}
          >
            <motion.p
              className="font-karla font-700 uppercase tracking-[0.34em]"
              initial={{ opacity: 0, letterSpacing: '0.6em' }}
              animate={{ opacity: 1, letterSpacing: '0.34em' }}
              transition={{ delay: 0.2, duration: 0.6 }}
              style={{ fontSize: '0.62rem', color: GOLD, marginBottom: '1rem', textShadow: `0 0 22px ${GOLD}99` }}
            >
              A Legend Rises From the Deep
            </motion.p>

            {/* Card art (or abyssal sigil fallback) in a glowing frame */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 220, damping: 18 }}
              style={{
                width: 150, height: 190, margin: '0 auto',
                borderRadius: 16, overflow: 'hidden', position: 'relative',
                border: `2px solid ${GOLD}`,
                boxShadow: `0 0 40px ${GOLD}66, inset 0 0 24px rgba(0,0,0,0.5)`,
                background: 'linear-gradient(180deg, rgba(30,40,60,0.9), rgba(6,10,20,0.95))',
              }}
            >
              {!artFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={art} alt={name}
                  onError={() => setArtFailed(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: '3.2rem' }}>
                  <span aria-hidden style={{ filter: `drop-shadow(0 0 14px ${CRIMSON})` }}>🐟</span>
                </div>
              )}
              {/* Legendary shimmer sweep */}
              <motion.div
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ delay: 0.7, duration: 0.9, ease: 'easeInOut' }}
                style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent 40%, ${GOLD}55 50%, transparent 60%)`, pointerEvents: 'none' }}
              />
            </motion.div>

            <motion.p
              className="font-cinzel font-700"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              style={{ fontSize: '2.6rem', lineHeight: 1.05, color: '#f7e6b0', marginTop: '1rem', textShadow: `0 0 34px ${GOLD}, 0 0 80px ${GOLD}66` }}
            >
              {name}
            </motion.p>
            <p className="font-karla font-700 uppercase tracking-[0.2em]" style={{ fontSize: '0.66rem', color: CRIMSON, marginTop: 2, textShadow: `0 0 14px ${CRIMSON}88` }}>
              {species} · Legendary
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.72)', marginTop: '0.9rem', lineHeight: 1.5 }}>
              Believed lost to the ages. Dragged back into the light from the deepest dark, the fish that will not stay dead.
            </p>

            {/* The stake — survive-to-keep */}
            <motion.p
              className="font-karla font-700"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.4 }}
              style={{ fontSize: '0.66rem', color: GOLD, marginTop: '1rem', lineHeight: 1.5, textShadow: `0 0 12px ${GOLD}66` }}
            >
              Sail home alive and Laz joins your crew. Fall here, and the deep keeps him.
            </motion.p>

            <motion.p
              className="font-karla font-400"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
              style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.34)', marginTop: '1.3rem', letterSpacing: '0.08em' }}>
              tap to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
