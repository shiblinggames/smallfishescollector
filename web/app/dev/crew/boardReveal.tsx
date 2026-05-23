'use client'

// In-place reveal for a gem reroll: the recruit board's own cards flip open
// rather than a separate screen. Each new card's cell is covered by a sealed
// dossier that rattles (wax seal glowing a rarity-tinted hint) then cracks into
// a 3D flip, revealing the real CrewPanel with glow + flash + banner + particle
// burst. Reveals are sequenced worst -> best so the rarest pull is the climax.

import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BoardCandidate } from './actions'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'

export type Phase = 'sealed' | 'charging' | 'flipped'

// Crew rarity (1 Common · 2 Rare · 3 Epic · 4 Legendary) → reveal effects.
const GLOW: Record<number, string> = { 2: 'reveal-glow-rare', 3: 'reveal-glow-epic', 4: 'reveal-glow-legendary' }
const FLASH: Record<number, string> = { 3: 'reveal-flash-epic', 4: 'reveal-flash-legendary' }
const SEAL_GLOW: Record<number, string> = { 1: 'rgba(200,160,90,0.7)', 2: 'rgba(96,165,250,0.95)', 3: 'rgba(168,85,247,1)', 4: 'rgba(255,210,60,1)' }
const CHARGE: Record<number, number> = { 1: 430, 2: 540, 3: 760, 4: 1080 }
const FIRST_DELAY = 340
const GAP = 240

type Flash = { cls: string; key: number } | null
type Banner = { label: string; color: string; key: number } | null

// ── Reveal controller: phases per board-card id + flash/banner + sequence ────
export function useReveal() {
  const [phases, setPhases] = useState<Record<number, Phase>>({})
  const [flash, setFlash] = useState<Flash>(null)
  const [banner, setBanner] = useState<Banner>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const done = useRef<Set<number>>(new Set())

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 1500)
    return () => clearTimeout(t)
  }, [banner])

  const flip = useCallback((c: BoardCandidate) => {
    if (done.current.has(c.id)) return
    done.current.add(c.id)
    setPhases(p => ({ ...p, [c.id]: 'flipped' }))
    const fl = FLASH[c.rarity]
    if (fl) setFlash({ cls: fl, key: Date.now() + c.id })
    if (c.rarity >= 3) setBanner({ label: `${RARITY_NAMES[c.rarity as CrewRarity]} Recruit!`, color: RARITY_COLORS[c.rarity as CrewRarity], key: Date.now() + c.id })
  }, [])

  const tapCard = useCallback((c: BoardCandidate) => { if (!done.current.has(c.id)) flip(c) }, [flip])

  const startReveal = useCallback((board: BoardCandidate[]) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    done.current = new Set()
    const init: Record<number, Phase> = {}
    board.forEach(c => { init[c.id] = 'sealed' })
    setPhases(init)

    const order = [...board].sort((a, b) => a.rarity - b.rarity) // rarest last
    let t = FIRST_DELAY
    order.forEach((c, pos) => {
      const isLast = pos === order.length - 1
      const charge = CHARGE[c.rarity] + (isLast ? 320 : 0)
      timers.current.push(setTimeout(() => setPhases(p => (p[c.id] === 'sealed' ? { ...p, [c.id]: 'charging' } : p)), t))
      timers.current.push(setTimeout(() => flip(c), t + charge))
      t += charge + GAP
    })
    // Return the board to plain panels once every effect has finished.
    timers.current.push(setTimeout(() => setPhases({}), t + 3200))
  }, [flip])

  return { phases, flash, banner, startReveal, tapCard }
}

// ── Per-card wrapper: sealed cover (front) + the real panel (back) ───────────
export function BoardReveal({ card, phase, onTap, children }: {
  card: BoardCandidate; phase: Phase; onTap: () => void; children: ReactNode
}) {
  const flipped = phase === 'flipped'
  const charging = phase === 'charging'
  const glow = flipped ? (GLOW[card.rarity] ?? '') : ''

  return (
    <div style={{ position: 'relative', perspective: 1100 }}>
      {/* The real card — hidden edge-on until it flips up to face the player */}
      <motion.div
        className={glow}
        initial={false}
        animate={{ rotateY: flipped ? 0 : -90 }}
        transition={{ duration: 0.34, ease: 'easeOut' }}
        style={{ transformOrigin: 'center', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
      >
        {children}
        {flipped && card.rarity >= 3 && <ParticleBurst rarity={card.rarity} />}
      </motion.div>

      {/* Sealed dossier cover — rattles, then flips away */}
      <AnimatePresence>
        {!flipped && (
          <motion.div
            key="cover"
            initial={false}
            exit={{ rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.34, ease: 'easeIn' }}
            onClick={onTap}
            style={{ position: 'absolute', inset: 0, zIndex: 2, transformOrigin: 'center', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', cursor: 'pointer' }}
          >
            <motion.div
              animate={charging
                ? { x: [0, -2, 2, -1.5, 1.5, 0], rotate: card.rarity >= 4 ? [0, -1.6, 1.6, -1, 1, 0] : [0, -1, 1, -0.6, 0.6, 0] }
                : { x: 0, rotate: 0 }}
              transition={charging ? { duration: card.rarity >= 4 ? 0.1 : 0.17, repeat: Infinity, ease: 'linear' } : { duration: 0.12 }}
              style={{
                width: '100%', height: '100%', borderRadius: 7,
                background: 'linear-gradient(157deg, #271d12 0%, #150e08 100%)',
                border: '1px solid #46341f',
                boxShadow: 'inset 0 0 0 1px rgba(176,141,79,0.18), 0 6px 16px rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div className={charging ? 'crew-seal-charging' : ''} style={{
                width: 54, height: 54, borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 32%, #9a3b34 0%, #5e211c 70%)',
                border: '2px solid rgba(0,0,0,0.35)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ['--seal-glow']: SEAL_GLOW[card.rarity] ?? SEAL_GLOW[1],
              } as CSSProperties}>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,225,190,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="2.5" /><line x1="12" y1="22" x2="12" y2="7.5" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                </svg>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Full-screen flash for Epic/Legendary ─────────────────────────────────────
export function RevealFlash({ flash }: { flash: Flash }) {
  return (
    <AnimatePresence>
      {flash && <div key={flash.key} className={`reveal-flash ${flash.cls}`} />}
    </AnimatePresence>
  )
}

// ── Centered rarity banner ───────────────────────────────────────────────────
export function RevealBanner({ banner }: { banner: Banner }) {
  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.key}
          initial={{ opacity: 0, scale: 0.8, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{ position: 'fixed', top: '20%', left: 0, right: 0, textAlign: 'center', zIndex: 120, pointerEvents: 'none' }}
        >
          <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: banner.color, textShadow: `0 0 18px ${banner.color}aa` }}>
            {banner.label}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Embers/sparks for Epic (violet) / Legendary (gold) ───────────────────────
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
        y: Math.sin(angle) * dist - 10,
        size: 3 + Math.random() * (rarity >= 4 ? 5 : 3.5),
        color: colors[i % colors.length],
        delay: Math.random() * 0.1,
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
