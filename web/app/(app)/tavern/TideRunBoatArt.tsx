'use client'

import { motion } from 'framer-motion'

/** Gently-bobbing boat for the Tide Run tavern card — slight rock + a
 *  small vertical bob on a slow loop so the boat reads as floating on
 *  water, echoing how it moves during the actual Tide Run minigame.
 *  Deliberately subtle (~3px translate, ~1.5° rotate) per the project's
 *  juice-subtlety rule; on a 96px-tall card slot anything bigger would
 *  read as distracting motion rather than gentle ambience. */
export default function TideRunBoatArt() {
  return (
    <motion.img
      src="/boatrun.png"
      alt=""
      aria-hidden
      animate={{
        y:      [0,    -3,   0,    2,   0],
        rotate: [-1.4, 0.9, -0.6, 1.2, -1.4],
      }}
      transition={{
        duration: 4.2,
        repeat: Infinity,
        ease: 'easeInOut',
        // Slight times skew so the bob feels organic (not metronomic).
        times: [0, 0.28, 0.55, 0.78, 1],
      }}
      style={{
        width: '100%',
        height: 68,
        objectFit: 'contain',
        opacity: 0.95,
        transformOrigin: '50% 80%',
      }}
    />
  )
}
