'use client'

// Tavern hub card for the Casino — the single door into Blackjack /
// Fish Slots / Fish Roulette, which now share one chip purse via the
// /tavern/casino lobby. Velvet-red card-room scene (the warm anchor of
// the old arcade row) with the live Catfish Jackpot pot riding on top
// as the pull — the number does the selling.

import { motion } from 'framer-motion'
import ScenicCard from './ScenicCard'

export default function CasinoHubCard({ jackpotPot }: { jackpotPot?: number }) {
  return (
    <ScenicCard
      href="/tavern/casino"
      title="Casino"
      gradient={['#4a1212', '#2a0808', '#100404']}
      accent="#c63838"
    >
      {jackpotPot !== undefined && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            background: 'rgba(10,8,4,0.78)',
            border: '1px solid rgba(240,192,64,0.5)',
            borderRadius: 999,
            padding: '3px 10px',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 14px rgba(240,192,64,0.25)',
          }}
        >
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.12em', color: '#c9a24a', marginRight: 5 }}>
            Jackpot
          </span>
          <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f0c040' }}>
            {jackpotPot.toLocaleString()} ⟡
          </span>
        </div>
      )}

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

      {/* Card art center, slot art tucked right — the full-width card
          has room to show the room holds more than one table. */}
      <motion.img
        src="/crownandanchor.png"
        alt=""
        aria-hidden
        animate={{ rotate: [-2.4, 1.6, -2.4] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          top: 22,
          left: '50%',
          translateX: '-62%',
          height: 100,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.6))',
          transformOrigin: '50% 100%',
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
          top: 34,
          left: '50%',
          transform: 'translateX(10%) rotate(4deg)',
          height: 86,
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6)) brightness(0.92)',
        }}
      />
    </ScenicCard>
  )
}
