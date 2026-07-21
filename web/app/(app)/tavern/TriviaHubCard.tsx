'use client'

import ScenicCard from './ScenicCard'

/** Tavern hub card for The Parlor — the single door into the trivia
 *  games (/tavern/trivia lobby). A painted tavern quiz-board scene fills
 *  the card; ScenicCard's scrim keeps the title readable over it. */
export default function TriviaHubCard() {
  return (
    <ScenicCard
      href="/tavern/trivia"
      title="The Parlor"
      gradient={['#2a2050', '#191338', '#0c0a20']}
      accent="#a78bfa"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/parloricon.webp"
        alt=""
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 36%', pointerEvents: 'none' }}
      />
    </ScenicCard>
  )
}
