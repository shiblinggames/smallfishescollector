'use client'

// Trivia Night lobby — the one front door for the trivia games, same
// skeleton as the Den lobby. The Captain's Board is live; the Pirate
// King ladder and Spin the Capstan are chalked up as coming soon.

import Link from 'next/link'
import { motion } from 'framer-motion'
import ScenicCard from '../ScenicCard'
import { TRIVIA_CATEGORIES } from './constants'

const GEM_COLOR = '#c084fc'

export default function TriviaLobby({ gems, answeredToday, gemsToday }: {
  gems: number
  answeredToday: number
  gemsToday: number
}) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Link href="/tavern" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none' }}>
          ← Tavern
        </Link>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', flex: 1 }}>
          Trivia Night
        </p>
        <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672' }}>
          {gems.toLocaleString()} ◆
        </span>
      </div>

      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center' }}>
        Sharp wits earn gems here. New questions every night.
      </p>

      {/* The Captain's Board — live */}
      <ScenicCard
        href="/tavern/trivia/board"
        title="The Captain's Board"
        gradient={['#241f48', '#161230', '#0a0818']}
        accent="#a78bfa"
      >
        {/* Mini board scene: a 4x3 grid of glowing category tiles. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 16, left: '50%', transform: 'translateX(-50%)',
            display: 'grid', gridTemplateColumns: 'repeat(4, 44px)', gap: 6,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const cat = TRIVIA_CATEGORIES[i % 4]
            return (
              <motion.div
                key={i}
                animate={{ opacity: [0.45, 0.85, 0.45] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.45 }}
                className="font-cinzel font-700"
                style={{
                  height: 24, borderRadius: 6,
                  background: `${cat.color}14`,
                  border: `1px solid ${cat.color}50`,
                  color: cat.color,
                  fontSize: '0.6rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ◆
              </motion.div>
            )
          })}
        </div>
        {/* Today's progress chip */}
        {answeredToday > 0 && (
          <span
            className="font-karla font-700"
            style={{
              position: 'absolute', top: 8, right: 10,
              fontSize: '0.58rem', letterSpacing: '0.04em',
              color: gemsToday > 0 ? GEM_COLOR : '#9a9488',
              background: 'rgba(10,8,24,0.7)',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 999, padding: '0.2rem 0.55rem',
            }}
          >
            {answeredToday >= 12 ? `Swept · +${gemsToday} ◆` : `${answeredToday}/12 today`}
          </span>
        )}
      </ScenicCard>

      {/* Coming soon shelf */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { title: 'Pirate King', blurb: 'Climb the question ladder. Walk away rich or lose the lot.', accent: '#f0c040' },
          { title: 'Spin the Capstan', blurb: 'Spin for stakes, call your letters, solve the phrase.', accent: '#34d399' },
        ].map(g => (
          <div
            key={g.title}
            style={{
              position: 'relative', height: 132, borderRadius: 18, overflow: 'hidden',
              background: 'linear-gradient(180deg, #15131f 0%, #0b0a12 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '0.9rem 0.85rem',
              opacity: 0.82,
            }}
          >
            <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#b8b2a4' }}>{g.title}</p>
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#6f6b66', lineHeight: 1.45, marginTop: 4 }}>{g.blurb}</p>
            <span
              className="font-karla font-700 uppercase"
              style={{
                position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                fontSize: '0.54rem', letterSpacing: '0.12em', whiteSpace: 'nowrap',
                color: `${g.accent}cc`,
                border: `1px solid ${g.accent}55`,
                borderRadius: 999, padding: '0.22rem 0.6rem',
              }}
            >
              Coming Soon
            </span>
          </div>
        ))}
      </div>

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        Fresh questions are chalked at midnight. Gems land instantly.
      </p>
    </div>
  )
}
