'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Fish Slots. Deep-violet arcade scene with a
 *  shimmer sweeping across the slot art on a slow loop, like neon
 *  catching the front of the machine. */
export default function FishSlotsCard() {
  return (
    <ScenicCard
      href="/tavern/slots"
      title="Fish Slots"
      gradient={['#2c1a4a', '#170e2c', '#0a0518']}
      accent="#a78bfa"
    >
      {/* Violet halo behind the slot art — soft, steady (no pulse
          here; the shimmer below is the active element). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 160,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(167,139,250,0.32) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 0, right: 0,
          height: 104,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fishslots.png"
          alt=""
          aria-hidden
          style={{
            height: 104,
            objectFit: 'contain',
            filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
          }}
        />
      </div>

      {/* Neon shimmer — a diagonal bright band sweeps across the
          slot art on a slow loop. Reads as light catching the
          machine front, like a slot cabinet under arcade lights. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 18,
          left: 0, right: 0,
          height: 104,
          overflow: 'hidden',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }}
      >
        <motion.div
          animate={{ x: ['-30%', '130%'] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: 'linear', repeatDelay: 2.4 }}
          style={{
            position: 'absolute',
            top: 0, bottom: 0,
            width: '32%',
            background: 'linear-gradient(105deg, transparent 30%, rgba(220,200,255,0.55) 50%, transparent 70%)',
            transform: 'skewX(-18deg)',
            filter: 'blur(2px)',
          }}
        />
      </div>
    </ScenicCard>
  )
}
