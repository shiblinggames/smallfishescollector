'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'

/** Proof-of-concept "scenic" tavern card for Tide Run. Same outer
 *  dimensions as the existing compact GameCard (168px tall, fills its
 *  grid cell width-wise) so the hub layout stays uniform, but the
 *  interior is rebuilt around an atmospheric sea background, a bigger
 *  bobbing boat that dominates the canvas, and the title overlaid at
 *  the bottom with a gradient scrim. Goal is to make the card feel
 *  like a "place" rather than a flat button — if this lands well,
 *  pattern can roll into a new GameCard variant ('scenic'?) and other
 *  cards (Blackjack, Daily Bonus, etc.) can adopt their own scene
 *  tints. */
export default function TideRunCard() {
  const router = useRouter()
  return (
    <motion.div
      role="link"
      tabIndex={0}
      onClick={() => router.push('/tavern/tide-run')}
      onKeyDown={(e) => e.key === 'Enter' && router.push('/tavern/tide-run')}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{
        position: 'relative',
        height: 168,
        borderRadius: 18,
        overflow: 'hidden',
        // Sea-blue gradient — top is hazy horizon, bottom deepens into
        // open water. Same blue family as Tide Run's accent (#5da7d4)
        // but darker so the boat reads as the focal point.
        background: 'linear-gradient(180deg, #1e3a52 0%, #0e2236 55%, #060f1c 100%)',
        border: '1px solid rgba(93,167,212,0.5)',
        borderTop: '1px solid rgba(93,167,212,0.9)',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4), 0 0 18px rgba(93,167,212,0.10)',
      }}
    >
      {/* Distant horizon glow — a soft warm-blue band suggesting the
          line where sky meets sea. Pure decoration, sits behind the
          boat to give the scene depth. */}
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

      {/* Boat — larger than the previous 68px card art (~108px tall now)
          so it actually dominates the scene. Bobbing + rocking carried
          over from TideRunBoatArt's pattern. Pivot at 80% so the rock
          looks like it's hinging near the water line, not the keel. */}
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

      {/* Wake — a pair of thin curved highlights under the boat
          suggesting the water it's just cut through. Subtle, more felt
          than read. */}
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

      {/* Bottom scrim + title. Gradient mask gives the title a clean
          dark background to sit against without a hard edge. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: 70,
          background: 'linear-gradient(180deg, transparent 0%, rgba(6,15,28,0.85) 55%, rgba(6,15,28,0.98) 100%)',
          pointerEvents: 'none',
        }}
      />
      <p
        className="font-cinzel font-700"
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 14,
          textAlign: 'center',
          fontSize: '1.2rem',
          color: '#ffffff',
          letterSpacing: '0.02em',
          textShadow: '0 2px 6px rgba(0,0,0,0.7), 0 0 14px rgba(93,167,212,0.35)',
        }}
      >
        Tide Run
      </p>
    </motion.div>
  )
}
