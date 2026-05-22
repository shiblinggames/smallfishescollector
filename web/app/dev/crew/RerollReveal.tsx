'use client'

// Full-screen reveal for a gem reroll: the three new recruits arrive sealed,
// then flip one by one with rarity glow + a screen flash for the good ones, so
// rerolling carries the same anticipation pack-opening used to.

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BoardCandidate } from './actions'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { applyCrewEffects } from '@/lib/crewEffects'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f: string) => `${SUPA}/storage/v1/object/public/card-arts/${f}`

const STAT = [
  { k: 'power' as const, l: 'PWR', c: '#f87171' },
  { k: 'dodge' as const, l: 'DGE', c: '#60a5fa' },
  { k: 'fortune' as const, l: 'FTN', c: '#f0c040' },
]

// Crew rarity (1 Common · 2 Rare · 3 Epic · 4 Legendary) → reveal effects.
const GLOW: Record<number, string> = { 2: 'reveal-glow-rare', 3: 'reveal-glow-epic', 4: 'reveal-glow-legendary' }
const FLASH: Record<number, string> = { 3: 'reveal-flash-epic', 4: 'reveal-flash-legendary' }

const FIRST_DELAY = 550
const STAGGER = 850

export default function RerollReveal({ cards, onClose }: { cards: BoardCandidate[]; onClose: () => void }) {
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => false))
  const [flash, setFlash] = useState<{ cls: string; key: number } | null>(null)
  const [banner, setBanner] = useState<{ label: string; color: string; key: number } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const allFlipped = flipped.every(Boolean)

  const reveal = useCallback((i: number) => {
    setFlipped(prev => {
      if (prev[i]) return prev
      const n = [...prev]; n[i] = true; return n
    })
    const c = cards[i]
    if (!c) return
    const fl = FLASH[c.rarity]
    if (fl) setFlash({ cls: fl, key: Date.now() + i })
    if (c.rarity >= 3) {
      const color = RARITY_COLORS[c.rarity as CrewRarity]
      setBanner({ label: `${RARITY_NAMES[c.rarity as CrewRarity]} Recruit!`, color, key: Date.now() + i })
    }
  }, [cards])

  // Auto-reveal in sequence; tapping a sealed card flips it early.
  useEffect(() => {
    cards.forEach((_, i) => {
      timers.current.push(setTimeout(() => reveal(i), FIRST_DELAY + i * STAGGER))
    })
    const t = timers.current
    return () => t.forEach(clearTimeout)
  }, [cards, reveal])

  // Fade the rarity banner out after it lands.
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 1500)
    return () => clearTimeout(t)
  }, [banner])

  return (
    <motion.div
      key="reroll-reveal"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'radial-gradient(ellipse at 50% 35%, #161019 0%, #050308 75%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}
    >
      {/* Screen flash — sits above the backdrop, behind the cards. */}
      <AnimatePresence>
        {flash && (
          <div key={flash.key} className={`reveal-flash ${flash.cls}`} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
        )}
      </AnimatePresence>

      <p className="font-pirata" style={{ position: 'relative', zIndex: 2, fontSize: '1.5rem', color: '#ecdcbd', letterSpacing: '0.04em', marginBottom: '0.2rem', textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>
        New Recruits Arrive
      </p>
      <p className="font-karla" style={{ position: 'relative', zIndex: 2, fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem', minHeight: '1.1em', textAlign: 'center' }}>
        {allFlipped ? 'They await your orders at the board.' : 'Tap a sealed notice to break the wax.'}
      </p>

      {/* Rarity banner for Epic+ pulls */}
      <div style={{ position: 'relative', zIndex: 3, height: 26, marginBottom: '0.4rem' }}>
        <AnimatePresence>
          {banner && (
            <motion.p
              key={banner.key}
              initial={{ opacity: 0, scale: 0.8, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="font-cinzel font-700"
              style={{ fontSize: '0.92rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: banner.color, textShadow: `0 0 16px ${banner.color}aa` }}
            >
              {banner.label}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* The three sealed → revealed notices */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: '0.7rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {cards.map((c, i) => (
          <RevealCard key={c.id} card={c} flipped={flipped[i]} onTap={() => reveal(i)} />
        ))}
      </div>

      <motion.button
        onClick={onClose}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: allFlipped ? 1 : 0.35, y: 0 }}
        transition={{ duration: 0.25 }}
        disabled={!allFlipped}
        className="font-karla font-700"
        style={{
          position: 'relative', zIndex: 3, marginTop: '1.75rem',
          padding: '0.65rem 2.2rem', borderRadius: 999, fontSize: '0.82rem', letterSpacing: '0.06em', textTransform: 'uppercase',
          background: 'linear-gradient(180deg, #2c3a58 0%, #1a2336 100%)',
          border: '1px solid rgba(126,164,232,0.5)', color: '#dbe7ff',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
          cursor: allFlipped ? 'pointer' : 'default',
        }}
      >
        To the Board
      </motion.button>
    </motion.div>
  )
}

function RevealCard({ card, flipped, onTap }: { card: BoardCandidate; flipped: boolean; onTap: () => void }) {
  const color = RARITY_COLORS[(card.rarity as CrewRarity)] ?? '#8a857c'
  const eff = applyCrewEffects({ power: card.power, dodge: card.dodge, fortune: card.fortune }, card.effects)
  const glow = flipped ? (GLOW[card.rarity] ?? '') : ''

  return (
    <div
      className={`flip-card ${flipped ? 'flipped' : ''} ${glow}`}
      onClick={() => { if (!flipped) onTap() }}
      style={{ width: 132, height: 196, cursor: flipped ? 'default' : 'pointer' }}
    >
      <div className="flip-card-inner">
        {/* Sealed front (recruit dossier back) */}
        <div className="flip-card-front" style={{
          background: 'linear-gradient(157deg, #271d12 0%, #150e08 100%)',
          border: '1px solid #46341f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 0 0 1px rgba(176,141,79,0.18), 0 6px 16px rgba(0,0,0,0.55)',
        }}>
          {/* wax seal */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 32%, #9a3b34 0%, #5e211c 70%)',
            border: '2px solid rgba(0,0,0,0.35)', boxShadow: '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,225,190,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="2.5" /><line x1="12" y1="22" x2="12" y2="7.5" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
            </svg>
          </div>
        </div>

        {/* Revealed crew */}
        <div className="flip-card-back" style={{
          background: 'linear-gradient(160deg, #1b1622 0%, #0d0b12 100%)',
          border: `1.5px solid ${color}`,
          boxShadow: `0 4px 14px rgba(0,0,0,0.5), 0 0 14px ${color}44`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ position: 'relative', width: '100%', height: 120, background: `radial-gradient(ellipse at 50% 32%, ${color}2e 0%, #070504 76%)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artSrc(card.filename)} alt={card.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 5 }} />
          </div>
          <div style={{ padding: '0.3rem 0.4rem 0.45rem' }}>
            <p className="font-pirata" style={{ fontSize: '0.96rem', color: '#ecdcbd', lineHeight: 1, textAlign: 'center' }}>{card.name}</p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', textTransform: 'uppercase', color, textAlign: 'center', marginTop: 3 }}>
              {RARITY_NAMES[(card.rarity as CrewRarity)] ?? 'Common'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, padding: '0 0.15rem' }}>
              {STAT.map(s => (
                <div key={s.k} style={{ textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: s.c, lineHeight: 1 }}>{eff[s.k]}</p>
                  <p style={{ fontSize: '0.38rem', color: '#5a5858', lineHeight: 1, marginTop: 2 }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
