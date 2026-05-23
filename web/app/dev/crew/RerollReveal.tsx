'use client'

// Full-screen reveal for a gem reroll: the three new recruits arrive sealed,
// then each builds anticipation (the notice rattles, the wax seal glows brighter
// with a rarity hint) before it cracks open. The rarest pull is sequenced LAST
// so the tension climbs to a climax — the same payoff pack-opening had.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
// Wax-seal glow during the charge — colour is the rarity "tell".
const SEAL_GLOW: Record<number, string> = {
  1: 'rgba(200,160,90,0.7)', 2: 'rgba(96,165,250,0.95)', 3: 'rgba(168,85,247,1)', 4: 'rgba(255,210,60,1)',
}
// Longer charge for rarer cards so the build-up itself hints at the payoff.
const CHARGE: Record<number, number> = { 1: 430, 2: 540, 3: 760, 4: 1080 }

const FIRST_DELAY = 500
const GAP = 240

type Phase = 'sealed' | 'charging' | 'flipped'

export default function RerollReveal({ cards, onClose }: { cards: BoardCandidate[]; onClose: () => void }) {
  const [phases, setPhases] = useState<Phase[]>(() => cards.map(() => 'sealed'))
  const [flash, setFlash] = useState<{ cls: string; key: number } | null>(null)
  const [banner, setBanner] = useState<{ label: string; color: string; key: number } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const done = useRef<Set<number>>(new Set())

  // Reveal worst → best, so the rarest crew is the climactic final flip. Ties
  // keep board order.
  const order = useMemo(
    () => cards.map((_, i) => i).sort((a, b) => cards[a].rarity - cards[b].rarity),
    [cards],
  )

  const allFlipped = phases.every(p => p === 'flipped')

  const startCharge = useCallback((i: number) => {
    setPhases(prev => (prev[i] === 'sealed' ? prev.map((p, j) => (j === i ? 'charging' : p)) : prev))
  }, [])

  const flip = useCallback((i: number) => {
    if (done.current.has(i)) return
    done.current.add(i)
    setPhases(prev => prev.map((p, j) => (j === i ? 'flipped' : p)))
    const c = cards[i]
    if (!c) return
    const fl = FLASH[c.rarity]
    if (fl) setFlash({ cls: fl, key: Date.now() + i })
    if (c.rarity >= 3) {
      setBanner({ label: `${RARITY_NAMES[c.rarity as CrewRarity]} Recruit!`, color: RARITY_COLORS[c.rarity as CrewRarity], key: Date.now() + i })
    }
  }, [cards])

  // Schedule the charge → flip sequence in rarest-last order.
  useEffect(() => {
    let t = FIRST_DELAY
    order.forEach((idx, pos) => {
      const isLast = pos === order.length - 1
      const charge = CHARGE[cards[idx].rarity] + (isLast ? 320 : 0)
      timers.current.push(setTimeout(() => startCharge(idx), t))
      timers.current.push(setTimeout(() => flip(idx), t + charge))
      t += charge + GAP
    })
    const list = timers.current
    return () => list.forEach(clearTimeout)
  }, [order, cards, startCharge, flip])

  // Fade the rarity banner out after it lands.
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 1500)
    return () => clearTimeout(t)
  }, [banner])

  // Tap a sealed/charging notice to crack it early.
  const tap = useCallback((i: number) => { if (!done.current.has(i)) flip(i) }, [flip])

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
          <RevealCard key={c.id} card={c} phase={phases[i]} onTap={() => tap(i)} />
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

// Embers/sparks that erupt from a card on an Epic/Legendary reveal. Gold for
// Legendary, violet for Epic. Pointer-events off so it never eats a tap.
function ParticleBurst({ rarity }: { rarity: number }) {
  const particles = useMemo(() => {
    const colors = rarity >= 4
      ? ['#ffe48a', '#ffd23c', '#ffb800', '#fff3c0']
      : ['#e9d5ff', '#c084fc', '#a855f7', '#d8b4fe']
    const count = rarity >= 4 ? 26 : 16
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55
      const dist = 44 + Math.random() * (rarity >= 4 ? 92 : 60)
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 10, // slight upward bias, like embers
        size: 3 + Math.random() * (rarity >= 4 ? 5 : 3.5),
        color: colors[i % colors.length],
        delay: 0.36 + Math.random() * 0.12, // fire as the face turns past 90deg
        dur: 0.7 + Math.random() * 0.5,
      }
    })
  }, [rarity])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
      {particles.map(p => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
          animate={{ x: p.x, y: p.y, scale: [0.3, 1, 0.55], opacity: [0, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2,
            borderRadius: '50%', background: p.color,
            boxShadow: `0 0 6px ${p.color}, 0 0 12px ${p.color}88`,
          }}
        />
      ))}
    </div>
  )
}

function RevealCard({ card, phase, onTap }: { card: BoardCandidate; phase: Phase; onTap: () => void }) {
  const color = RARITY_COLORS[(card.rarity as CrewRarity)] ?? '#8a857c'
  const eff = applyCrewEffects({ power: card.power, dodge: card.dodge, fortune: card.fortune }, card.effects)
  const flipped = phase === 'flipped'
  const charging = phase === 'charging'
  const glow = flipped ? (GLOW[card.rarity] ?? '') : ''
  // Legendary rattles harder during its (longer) charge.
  const shake = charging ? (card.rarity >= 4 ? 'crew-charge-strong' : 'crew-charge') : ''

  return (
    <div
      className={`flip-card ${flipped ? 'flipped' : ''} ${shake} ${glow}`}
      onClick={() => { if (!flipped) onTap() }}
      style={{ width: 132, height: 196, cursor: flipped ? 'default' : 'pointer' }}
    >
      {/* Particle burst on Epic/Legendary reveal — bursts as the face turns up */}
      {flipped && card.rarity >= 3 && <ParticleBurst rarity={card.rarity} />}

      <div className="flip-card-inner">
        {/* Sealed front (recruit dossier back) */}
        <div className="flip-card-front" style={{
          background: 'linear-gradient(157deg, #271d12 0%, #150e08 100%)',
          border: '1px solid #46341f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 0 0 1px rgba(176,141,79,0.18), 0 6px 16px rgba(0,0,0,0.55)',
        }}>
          {/* wax seal — pulses brighter while charging, tinted by rarity */}
          <div
            className={charging ? 'crew-seal-charging' : ''}
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'radial-gradient(circle at 38% 32%, #9a3b34 0%, #5e211c 70%)',
              border: '2px solid rgba(0,0,0,0.35)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ['--seal-glow' as string]: SEAL_GLOW[card.rarity] ?? SEAL_GLOW[1],
            } as React.CSSProperties}
          >
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
