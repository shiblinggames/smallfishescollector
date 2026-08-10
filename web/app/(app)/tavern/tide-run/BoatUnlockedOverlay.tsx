'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TideRunBoat } from '@/lib/tideRunBoats'
import { hapticReward } from '@/lib/haptics'

/**
 * THE UNLOCK MOMENT.
 *
 * Fires on the wreck screen the instant a run earns a boat, before the score
 * and the rank get their turn — a new boat is the best thing that happened in
 * that run and it should not have to queue behind a number.
 *
 * It is DISMISSED BY TAP, not by a timer. The whole point of the moment is that
 * you look at the thing you won; a three-second auto-hide takes it away exactly
 * when a player leans in. It also equips on dismiss rather than making you go
 * and find it, because a reward you have to go and apply is an errand.
 *
 * Several boats can land in one run (a first-ever run past several thresholds),
 * so this takes a LIST and shows them in ladder order rather than dropping all
 * but one.
 */
export default function BoatUnlockedOverlay({
  boats, onDismiss,
}: {
  boats: TideRunBoat[]
  onDismiss: () => void
}) {
  useEffect(() => { if (boats.length) hapticReward() }, [boats.length])
  if (!boats.length) return null

  const many = boats.length > 1

  return (
    <AnimatePresence>
      <motion.div
        key="boat-unlock"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onDismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 260,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          background: 'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(18,72,96,0.72) 0%, rgba(3,10,18,0.95) 72%)',
        }}
      >
        <motion.div
          initial={{ scale: 0.86, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}
        >
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.24em', color: '#7fd0e8' }}>
            {many ? `${boats.length} new boats` : 'New boat'}
          </p>

          {boats.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              // Staggered, so two boats read as two events rather than a pile.
              transition={{ delay: 0.12 + i * 0.22, duration: 0.34 }}
              style={{ marginTop: i === 0 ? 10 : 22 }}
            >
              <motion.span
                style={{ display: 'block' }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.image ?? '/boatrun.png'} alt="" decoding="async"
                  style={{ width: '100%', maxWidth: 240, margin: '0 auto', display: 'block', filter: 'drop-shadow(0 8px 22px rgba(127,208,232,0.45))' }}
                />
              </motion.span>
              <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f2f7fb', lineHeight: 1.1, marginTop: 6 }}>
                {b.name}
              </p>
              <p className="font-karla" style={{ fontSize: '0.8rem', color: '#9db4c4', lineHeight: 1.45, marginTop: 4, fontStyle: 'italic' }}>
                {b.blurb}
              </p>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: '#7fd0e8', marginTop: 5 }}>
                Earned at {b.unlockAt}m
              </p>
            </motion.div>
          ))}

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.5 + boats.length * 0.22, duration: 0.3 }}
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
