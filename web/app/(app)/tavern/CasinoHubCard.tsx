'use client'

// Tavern hub card for the Casino — the single door into Blackjack /
// Fish Slots / Fish Roulette, which now share one chip purse via the
// /tavern/casino lobby. Velvet-red card-room scene (the warm anchor of
// the old arcade row); the live jackpot pot shows inside the lobby on
// the slots card, not out here on the hub.

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

export default function CasinoHubCard() {
  return (
    <ScenicCard
      href="/tavern/casino"
      title="The Den"
      gradient={['#4a1212', '#2a0808', '#100404']}
      accent="#c63838"
    >
      {/* Velvet sheen — felt lit from above, slow pulse. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.34, 0.5, 0.34] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 6,
          left: '50%',
          translateX: '-50%',
          width: 220,
          height: 130,
          background: 'radial-gradient(ellipse at center, rgba(198,56,56,0.42) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* Three tables posed in a V, same trick as ShipHero's crew
          lineup: the blackjack table front-and-center on the shared
          baseline, roulette peeking from behind-left, slots from
          behind-right. Backs anchor off CENTER (not the card edges) so
          they tuck partially behind the front table at every card
          width — the overlap is what sells the depth. Backs render
          smaller + dimmer + desaturated. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/roulette.png"
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-118%)',
          bottom: 46,
          height: 74,
          objectFit: 'contain',
          opacity: 0.72,
          filter: 'brightness(0.78) saturate(0.85) drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
          zIndex: 1,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fishslots.png"
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(18%)',
          bottom: 46,
          height: 74,
          objectFit: 'contain',
          opacity: 0.72,
          filter: 'brightness(0.78) saturate(0.85) drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
          zIndex: 1,
        }}
      />
      <motion.img
        src="/blackjack.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-2.4, 1.6, -2.4] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          translateX: '-50%',
          height: 102,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
          transformOrigin: '50% 100%',
          zIndex: 2,
        }}
      />
    </ScenicCard>
  )
}
