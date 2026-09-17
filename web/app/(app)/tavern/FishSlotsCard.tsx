'use client'

import ScenicCard from './ScenicCard'

/** The Den's door into Fish Slots. The live Catfish Jackpot rides on the
 *  chip when provided: the number IS the pull. */
export default function FishSlotsCard({ jackpotPot }: { jackpotPot?: number }) {
  return (
    <ScenicCard
      href="/tavern/slots"
      title="Fish Slots"
      blurb="Spin three reels and line up a catch. Three catfish take the whole jackpot."
      accent="#a78bfa"
      chip={jackpotPot !== undefined ? { text: `Jackpot ${jackpotPot.toLocaleString()} ⟡`, lit: true } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/fishslots.png"
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', height: 80, objectFit: 'contain' }}
      />
    </ScenicCard>
  )
}
