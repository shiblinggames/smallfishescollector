'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Fish of the Day. Deep teal-blue scene, with
 *  the fish silhouette + red question mark composite floating in
 *  place like a fish suspended in water. Slow gentle y-bob preserves
 *  the meditative "what could it be?" feel — no hard motion. */
export default function FishOfTheDayCard() {
  return (
    <ScenicCard
      href="/tavern/fish-of-the-day"
      title="Fish of the Day"
      gradient={['#0e2c40', '#071a2c', '#040d18']}
      accent="#60a5fa"
    >
      {/* Suspended-in-water glow — diffuse blue halo behind the
          silhouette so the eye reads the fish as floating in deep
          water, not stamped flat on the card. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 140,
          height: 110,
          background: 'radial-gradient(ellipse at center, rgba(96,165,250,0.22) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        animate={{ y: [0, -4, 0, 3, 0] }}
        transition={{
          duration: 5.4,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.28, 0.55, 0.78, 1],
        }}
        style={{
          position: 'absolute',
          top: 18,
          left: 0, right: 0,
          height: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fish/largemouth-bass.png"
          alt=""
          aria-hidden
          style={{
            maxWidth: '70%',
            maxHeight: 88,
            objectFit: 'contain',
            filter: 'brightness(0) opacity(0.78)',
          }}
        />
        <span
          aria-hidden
          className="font-cinzel font-700"
          style={{
            position: 'absolute',
            fontSize: '3.6rem',
            lineHeight: 1,
            color: '#ef4444',
            textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 0 22px rgba(239,68,68,0.55)',
            pointerEvents: 'none',
            marginTop: 4,
          }}
        >?</span>
      </motion.div>
    </ScenicCard>
  )
}
