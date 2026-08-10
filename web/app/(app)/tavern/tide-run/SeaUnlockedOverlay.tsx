'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TideRunSea } from '@/lib/tideRunSeas'
import { hapticReward } from '@/lib/haptics'

/**
 * NEW WATER.
 *
 * The boat overlay shows you a thing; this one has to show you a PLACE, and a
 * place is harder to sell in a still image. So the card is the sea itself: sky
 * over water in that sea's own colours, at a size big enough to read as an
 * environment rather than as a swatch. A player should recognise it the moment
 * they next launch a run.
 *
 * Same contract as the boats — dismissed by tap rather than a timer, and
 * dismissing equips, because a reward you have to go and apply is an errand.
 */
export default function SeaUnlockedOverlay({
  seas, onDismiss,
}: {
  seas: TideRunSea[]
  onDismiss: () => void
}) {
  useEffect(() => { if (seas.length) hapticReward() }, [seas.length])
  if (!seas.length) return null

  const many = seas.length > 1

  return (
    <AnimatePresence>
      <motion.div
        key="sea-unlock"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onDismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 260,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          background: 'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(10,40,58,0.74) 0%, rgba(2,8,14,0.96) 72%)',
        }}
      >
        <motion.div
          initial={{ scale: 0.86, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}
        >
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.24em', color: '#7fd0e8' }}>
            {many ? `${seas.length} new waters` : 'New water'}
          </p>

          {seas.map((sea, i) => (
            <motion.div
              key={sea.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.22, duration: 0.34 }}
              style={{ marginTop: i === 0 ? 12 : 22 }}
            >
              {/* The sea, as a horizon rather than a colour chip. A soft line
                  where sky meets water is the single cue that says "place". */}
              <span style={{
                display: 'block', height: 132, borderRadius: 14, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: `0 10px 28px ${sea.swatch[1]}88`,
                background: `linear-gradient(180deg, ${sea.swatch[0]} 0%, ${sea.swatch[0]} 46%, rgba(255,255,255,0.22) 46%, rgba(255,255,255,0.22) 47%, ${sea.swatch[1]} 47%, ${sea.swatch[1]} 100%)`,
              }} />
              <p className="font-cinzel font-800" style={{ fontSize: '1.42rem', color: '#f2f7fb', lineHeight: 1.12, marginTop: 10 }}>
                {sea.name}
              </p>
              <p className="font-karla" style={{ fontSize: '0.8rem', color: '#9db4c4', lineHeight: 1.45, marginTop: 4, fontStyle: 'italic' }}>
                {sea.blurb}
              </p>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: '#7fd0e8', marginTop: 5 }}>
                Reached at {sea.unlockAt}m
              </p>
            </motion.div>
          ))}

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.5 + seas.length * 0.22, duration: 0.3 }}
            className="font-karla font-700 uppercase"
            style={{ fontSize: '0.6rem', letterSpacing: '0.16em', color: '#dff1f8', marginTop: 22 }}
          >
            {many ? 'Tap to sail the last one' : 'Tap to sail it'}
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
