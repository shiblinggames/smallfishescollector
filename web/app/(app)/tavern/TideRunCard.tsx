'use client'

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

/** Tavern hub card for Tide Run. Sea-blue scene with a larger
 *  bobbing-and-rocking boat as the focal point + a subtle wake under
 *  the keel. Pivots near 80% on the boat so the rock looks like it's
 *  hinging at the water line, not the keel. */
export default function TideRunCard() {
  return (
    <ScenicCard
      href="/tavern/tide-run"
      title="Tide Run"
      gradient={['#1e3a52', '#0e2236', '#060f1c']}
      accent="#5da7d4"
      bgImage="/tiderun-bg.jpg"
    >
      {/* Distant horizon glow — soft warm-blue band suggesting the
          line where sky meets sea. Pure decoration behind the boat. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 38,
          left: '-10%',
          right: '-10%',
          height: 28,
          background: 'radial-gradient(ellipse at center, rgba(160,200,230,0.22) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <motion.img
        src="/boatrun.png"
        alt=""
        aria-hidden
        animate={{
          y:      [0,    -4,   0,    3,   0],
          rotate: [-1.4, 0.9, -0.6, 1.2, -1.4],
        }}
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.28, 0.55, 0.78, 1],
        }}
        style={{
          position: 'absolute',
          top: 22,
          left: '50%',
          translateX: '-50%',
          height: 108,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))',
          transformOrigin: '50% 80%',
        }}
      />

      {/* Wake — thin SVG curves under the boat suggesting the water
          it just cut through. More felt than read. */}
      <svg
        aria-hidden
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 56,
          width: '70%',
          height: 14,
          transform: 'translateX(-50%)',
          opacity: 0.42,
          pointerEvents: 'none',
        }}
      >
        <path d="M 5 12 Q 50 4 95 12" stroke="rgba(180,210,235,0.7)" strokeWidth="0.6" fill="none" />
        <path d="M 18 18 Q 50 12 82 18" stroke="rgba(180,210,235,0.5)" strokeWidth="0.5" fill="none" />
      </svg>
    </ScenicCard>
  )
}
