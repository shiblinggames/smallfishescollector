'use client'

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
          loading="lazy"
          decoding="async"
          style={{
            height: 104,
            objectFit: 'contain',
            filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
          }}
        />
      </div>
    </ScenicCard>
  )
}
