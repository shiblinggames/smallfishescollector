'use client'

// In-place reveal for a gem reroll: the recruit board's own cards flip open
// rather than a separate screen. Each new card's cell is covered by a sealed
// dossier that rattles (wax seal glowing a rarity-tinted hint) then cracks into
// a 3D flip, revealing the real CrewPanel. Epic and Legendary land with a real
// payoff: card pop, shockwave rings, particle burst, screen flash, and a banner
// (Legendary much bigger than Epic). Reveals are sequenced worst -> best so the
// rarest pull is the climax.

import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode, type CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BoardCandidate } from './actions'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'

export type Phase = 'sealed' | 'charging' | 'flipped'

// Crew rarity (1 Common · 2 Rare · 3 Epic · 4 Legendary) → reveal effects.
const GLOW: Record<number, string> = { 2: 'reveal-glow-rare', 3: 'reveal-glow-epic', 4: 'reveal-glow-legendary' }
const FLASH: Record<number, string> = { 3: 'reveal-flash-epic', 4: 'reveal-flash-legendary-grand' }
const POP: Record<number, string> = { 3: 'crew-epic-pop', 4: 'crew-hero-pop' }
const SEAL_GLOW: Record<number, string> = { 1: 'rgba(200,160,90,0.7)', 2: 'rgba(96,165,250,0.95)', 3: 'rgba(168,85,247,1)', 4: 'rgba(255,210,60,1)' }
const CHARGE: Record<number, number> = { 1: 430, 2: 540, 3: 760, 4: 1180 }
const FIRST_DELAY = 340
const GAP = 240
const CLIMAX_LEAD = 280  // a beat of calm before the finale (rarest) card charges
// Post-flip settle on the FINAL card before the board resets and the reroll
// button reactivates. Scales with the climax rarity: commons/rares only have
// a brief landing ring (~600ms), so any longer is dead air. Epic earns time
// for its shock rings + particles + banner (1.6s); Legendary needs the full
// 2.4s banner + grander effects to land as a climax.
const FINAL_SETTLE: Record<number, number> = { 1: 700, 2: 900, 3: 2200, 4: 3400 }

type Flash = { cls: string; key: number } | null
type Banner = { name: string; rarity: number; color: string; key: number } | null

// ── Reveal controller: phases per board-card id + flash/banner + sequence ────
export function useReveal() {
  const [phases, setPhases] = useState<Record<number, Phase>>({})
  const [flash, setFlash] = useState<Flash>(null)
  const [banner, setBanner] = useState<Banner>(null)
  const [climaxId, setClimaxId] = useState<number | null>(null)  // the finale (rarest) card
  const [bloodied, setBloodied] = useState(false)                // a blood-charged reroll
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const done = useRef<Set<number>>(new Set())

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), banner.rarity >= 4 ? 2400 : 1600)
    return () => clearTimeout(t)
  }, [banner])

  const flip = useCallback((c: BoardCandidate) => {
    if (done.current.has(c.id)) return
    done.current.add(c.id)
    setPhases(p => ({ ...p, [c.id]: 'flipped' }))
    const fl = FLASH[c.rarity]
    if (fl) setFlash({ cls: fl, key: Date.now() + c.id })
    if (c.rarity >= 3) setBanner({ name: c.name, rarity: c.rarity, color: RARITY_COLORS[c.rarity as CrewRarity], key: Date.now() + c.id })
  }, [])

  const tapCard = useCallback((c: BoardCandidate) => { if (!done.current.has(c.id)) flip(c) }, [flip])

  const startReveal = useCallback((board: BoardCandidate[], isBlood = false) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    done.current = new Set()
    setBloodied(isBlood)
    const init: Record<number, Phase> = {}
    board.forEach(c => { init[c.id] = 'sealed' })
    setPhases(init)

    const order = [...board].sort((a, b) => a.rarity - b.rarity) // rarest last
    const climax = order.length ? order[order.length - 1] : null
    setClimaxId(climax?.id ?? null)
    let t = FIRST_DELAY
    order.forEach((c, pos) => {
      const isLast = pos === order.length - 1
      if (isLast) t += CLIMAX_LEAD          // hold a beat so the finale lands as an event
      const charge = CHARGE[c.rarity] + (isLast ? 320 : 0)
      timers.current.push(setTimeout(() => setPhases(p => (p[c.id] === 'sealed' ? { ...p, [c.id]: 'charging' } : p)), t))
      timers.current.push(setTimeout(() => flip(c), t + charge))
      t += charge + GAP
    })
    // Return the board to plain panels once the final card has settled. The
    // settle scales with the climax rarity so a common-only board doesn't sit
    // on dead air after its tiny landing ring finishes.
    const settle = climax ? (FINAL_SETTLE[climax.rarity] ?? 1200) : 1200
    timers.current.push(setTimeout(() => { setPhases({}); setClimaxId(null) }, t + settle))
  }, [flip])

  // True from the moment a reroll reveal begins until every card has finished
  // its flip/payoff and the board resets to plain panels — gate re-rolls on it.
  const revealing = Object.keys(phases).length > 0

  // The finale spotlight: active once the rarest card leaves 'sealed' (it's
  // charging or revealed). Other cards dim while this is true.
  const climaxActive = climaxId != null && phases[climaxId] != null && phases[climaxId] !== 'sealed'

  return { phases, flash, banner, startReveal, tapCard, revealing, climaxId, climaxActive, bloodied }
}

// ── Per-card wrapper: sealed cover (front) + the real panel (back) ───────────
export function BoardReveal({ card, phase, onTap, children, bloodied }: {
  card: BoardCandidate; phase: Phase; onTap: () => void; children: ReactNode; bloodied?: boolean
}) {
  const flipped = phase === 'flipped'
  const charging = phase === 'charging'
  const glow = flipped ? (GLOW[card.rarity] ?? '') : ''
  // Epic/Legendary keep their grander pop; everything else gets a gentle settle.
  const pop = flipped ? (POP[card.rarity] ?? 'crew-settle') : ''

  return (
    <div style={{ position: 'relative', perspective: 1100 }}>
      {/* The real card — hidden edge-on until it flips up to face the player */}
      <motion.div
        className={glow}
        initial={false}
        animate={{ rotateY: flipped ? 0 : -90 }}
        transition={{ duration: 0.34, ease: 'easeOut' }}
        style={{ position: 'relative', transformOrigin: 'center', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
      >
        <div className={pop}>{children}</div>
        {/* Specular shine sweeping across the card as it lands (all rarities) */}
        {flipped && (
          <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 7, overflow: 'hidden', pointerEvents: 'none', zIndex: 7 }}>
            <span className="crew-shine" />
          </span>
        )}
      </motion.div>

      {/* Payoff effects (Epic/Legendary), emanating from the card center */}
      {flipped && card.rarity >= 3 && <ShockRings rarity={card.rarity} />}
      {flipped && card.rarity >= 3 && <ParticleBurst rarity={card.rarity} />}
      {/* Soft landing ring for Common/Rare (Epic+ already get the shock rings) */}
      {flipped && card.rarity < 3 && (
        <span aria-hidden className="crew-land-ring" style={{
          position: 'absolute', left: '50%', top: '50%', width: 46, height: 46, marginLeft: -23, marginTop: -23,
          borderRadius: '50%', border: `2px solid ${RARITY_COLORS[card.rarity as CrewRarity]}`,
          boxShadow: `0 0 8px ${RARITY_COLORS[card.rarity as CrewRarity]}66`, zIndex: 4, pointerEvents: 'none',
        }} />
      )}

      {/* Sealed dossier cover — rattles, then flips away */}
      <AnimatePresence>
        {!flipped && (
          <motion.div
            key="cover"
            initial={false}
            exit={{ rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.34, ease: 'easeIn' }}
            onClick={onTap}
            style={{ position: 'absolute', inset: 0, zIndex: 6, transformOrigin: 'center', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', cursor: 'pointer' }}
          >
            <motion.div
              animate={charging
                ? { x: [0, -2, 2, -1.5, 1.5, 0], rotate: card.rarity >= 4 ? [0, -1.6, 1.6, -1, 1, 0] : [0, -1, 1, -0.6, 0.6, 0] }
                : { x: 0, rotate: 0 }}
              transition={charging ? { duration: card.rarity >= 4 ? 0.1 : 0.17, repeat: Infinity, ease: 'linear' } : { duration: 0.12 }}
              // Blood-charged reroll = a bloodied dossier (crimson wrap + blood
              // seal) so the whole board reads as blood-summoned, not gold.
              style={{
                position: 'relative',
                width: '100%', height: '100%', borderRadius: 7, overflow: 'hidden',
                // PAINTED DOSSIER. This was a flat CSS gradient — the one surface
                // the player stares at for the whole anticipation beat, and the
                // least designed thing in the flow. The art is the WRAP only: no
                // seal is painted on it, because the seal below is DOM and has to
                // keep carrying the rarity tint and the charging rattle.
                backgroundColor: '#150e08',
                backgroundImage: 'url(/crew_dossier.webp)',
                // 100% 100%, not cover: the cord and the corner brackets live at
                // the edges, and cover would crop them off as the card stretches.
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
                border: `1px solid ${bloodied ? '#7a2129' : '#46341f'}`,
                boxShadow: bloodied ? 'inset 0 0 0 1px rgba(209,57,75,0.22), 0 6px 16px rgba(0,0,0,0.55)' : 'inset 0 0 0 1px rgba(176,141,79,0.18), 0 6px 16px rgba(0,0,0,0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* Bloodied reroll tints the same leather rather than shipping a
                  second 168KB plate. A flat overlay div, not a CSS filter: the
                  cover is mid-rattle when this is visible, and a filter on a
                  transforming element re-rasterises every frame. */}
              {bloodied && (
                <span aria-hidden style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'linear-gradient(157deg, rgba(150,24,38,0.62) 0%, rgba(60,6,14,0.72) 100%)',
                  mixBlendMode: 'multiply',
                }} />
              )}
              <div className={charging ? 'crew-seal-charging' : ''} style={{
                // Above the bloodied tint. An absolutely-positioned sibling paints
                // over non-positioned ones whatever the DOM order, so without this
                // the overlay sat on the seal and muddied its rarity glow.
                position: 'relative', zIndex: 1,
                width: 54, height: 54, borderRadius: '50%',
                background: bloodied ? 'radial-gradient(circle at 38% 32%, #d1394b 0%, #6b0f1a 70%)' : 'radial-gradient(circle at 38% 32%, #9a3b34 0%, #5e211c 70%)',
                border: '2px solid rgba(0,0,0,0.35)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ['--seal-glow']: bloodied ? 'rgba(209,57,75,0.85)' : (SEAL_GLOW[card.rarity] ?? SEAL_GLOW[1]),
              } as CSSProperties}>
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={bloodied ? 'rgba(255,220,225,0.92)' : 'rgba(255,225,190,0.85)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

// ── Rarity banner — Legendary gets a far grander treatment than Epic ─────────
export function RevealBanner({ banner }: { banner: Banner }) {
  const legendary = (banner?.rarity ?? 0) >= 4
  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.key}
          initial={{ opacity: 0, scale: legendary ? 0.6 : 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: legendary ? 0.45 : 0.3, ease: legendary ? [0.16, 1.25, 0.3, 1] : 'easeOut' }}
          style={{ position: 'fixed', inset: 0, zIndex: 120, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}
        >
          {legendary ? (
            <>
              <p className="font-pirata" style={{ fontSize: '2.5rem', letterSpacing: '0.06em', lineHeight: 1, color: banner.color, textShadow: `0 0 28px ${banner.color}, 0 0 64px ${banner.color}99` }}>Legendary!</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#ecdcbd', marginTop: 8, textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>{banner.name}</p>
            </>
          ) : (
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: banner.color, textShadow: `0 0 18px ${banner.color}aa` }}>
              {banner.name} · Epic Recruit!
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Shockwave rings — one violet ring for Epic, three gold for Legendary ─────
function ShockRings({ rarity }: { rarity: number }) {
  const big = rarity >= 4
  const color = big ? '#ffd23c' : '#c084fc'
  const base = big ? 92 : 60
  const delays = big ? [0.36, 0.5, 0.64] : [0.4]
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4, overflow: 'visible' }}>
      {delays.map((d, i) => (
        <span key={i} style={{
          position: 'absolute', left: '50%', top: '50%', width: base, height: base, marginLeft: -base / 2, marginTop: -base / 2,
          borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}88`,
          animation: `crew-shock 1.1s ${d}s ease-out both`,
        }} />
      ))}
    </div>
  )
}

// ── Embers/sparks — a modest violet pop for Epic, a gold storm for Legendary ─
function ParticleBurst({ rarity }: { rarity: number }) {
  const particles = useMemo(() => {
    const big = rarity >= 4
    const colors = big
      ? ['#ffe48a', '#ffd23c', '#ffb800', '#fff3c0']
      : ['#e9d5ff', '#c084fc', '#a855f7', '#d8b4fe']
    const count = big ? 50 : 24
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.55
      const dist = 44 + Math.random() * (big ? 150 : 72)
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - (big ? 16 : 10),
        size: 3 + Math.random() * (big ? 6 : 4),
        color: colors[i % colors.length],
        delay: Math.random() * (big ? 0.16 : 0.1),
        dur: 0.7 + Math.random() * (big ? 0.7 : 0.5),
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
