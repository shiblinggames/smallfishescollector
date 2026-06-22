'use client'

import { motion } from 'framer-motion'
import { type TideEvent, type TideChoice, type TideEffect, describeEffect, effectTone } from '@/lib/tides'

// ─── Tide modal ────────────────────────────────────────────────────────────
// Between-fight roguelike event interrupt. Fires after the kill of a
// configured slot (see BossRaidConfig.tides.slots) and gates the next
// encounter mount until the player picks a choice. Effects are added to
// the run's activeTideEffects array (managed by the host).
//
// This is a fork-in-the-road moment, so it's meant to LAND: the sea surges
// in behind a dark scrim, the card rides up on it, and each choice reads as
// a distinct path with its boons (green) and costs (red) called out so the
// trade is obvious at a glance.

const SEA = '#38bdf8'

// Self-contained keyframes (no globals.css touch). Transform/opacity only so
// it's cheap on mobile / iOS PWA.
const TIDE_KEYFRAMES = `
@keyframes tideSwell { 0%, 100% { transform: translateY(10px); opacity: 0.65 } 50% { transform: translateY(-8px); opacity: 1 } }
@keyframes tideFoam { 0% { transform: translateY(0); opacity: 0 } 18% { opacity: 0.6 } 100% { transform: translateY(-150px); opacity: 0 } }
@keyframes tideShimmer { 0% { background-position: -180% 0 } 100% { background-position: 180% 0 } }
@keyframes tideGlow { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.75 } }
`

// Deterministic foam motes (no Math.random in render → no hydration drift).
const FOAM = [
  { left: 14, size: 3, dur: 6.5, delay: 0 },
  { left: 28, size: 2, dur: 8, delay: 1.4 },
  { left: 41, size: 4, dur: 5.5, delay: 0.6 },
  { left: 57, size: 2, dur: 7.5, delay: 2.2 },
  { left: 69, size: 3, dur: 6, delay: 1 },
  { left: 83, size: 2, dur: 8.5, delay: 3 },
  { left: 91, size: 3, dur: 6.5, delay: 0.4 },
]

const TONE: Record<'good' | 'bad' | 'neutral', { bg: string; bd: string; fg: string }> = {
  good:    { bg: 'rgba(74,222,128,0.13)',  bd: 'rgba(74,222,128,0.42)',  fg: '#86efac' },
  bad:     { bg: 'rgba(248,113,113,0.13)', bd: 'rgba(248,113,113,0.42)', fg: '#fca5a5' },
  neutral: { bg: 'rgba(125,211,252,0.11)', bd: 'rgba(125,211,252,0.30)', fg: '#bae6fd' },
}

interface Props {
  tide: TideEvent
  /** Player picks a choice card — parent applies effects + advances. */
  onPicked: (choice: TideChoice) => void
}

export default function TideModal({ tide, onPicked }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'radial-gradient(ellipse 120% 70% at 50% 120%, rgba(8,40,64,0.9) 0%, rgba(2,8,16,0.9) 55%), rgba(2,6,12,0.86)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        overflow: 'hidden',
      }}
    >
      <style>{TIDE_KEYFRAMES}</style>

      {/* The tide itself — a swell rising up the bottom of the screen + foam
          carried up off it. Purely atmospheric, never blocks taps. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%',
        background: `linear-gradient(to top, ${SEA}33 0%, ${SEA}12 45%, transparent 100%)`,
        animation: 'tideSwell 5.5s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      {FOAM.map((f, i) => (
        <div key={i} aria-hidden style={{
          position: 'absolute', bottom: '6%', left: `${f.left}%`,
          width: f.size, height: f.size, borderRadius: '50%',
          background: `${SEA}cc`, boxShadow: `0 0 6px ${SEA}aa`,
          animation: `tideFoam ${f.dur}s linear ${f.delay}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 46, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 450,
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(16,30,48,0.98) 0%, rgba(7,15,26,0.99) 100%)',
          border: `1px solid ${SEA}3a`,
          boxShadow: `0 0 54px ${SEA}26, 0 24px 70px rgba(0,0,0,0.6)`,
          maxHeight: '88vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Crest band — a shimmering tide line across the top of the card */}
        <div aria-hidden style={{
          height: 3,
          background: `linear-gradient(90deg, transparent, ${SEA}, ${SEA}66, ${SEA}, transparent)`,
          backgroundSize: '200% 100%',
          animation: 'tideShimmer 3.2s linear infinite',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
        }} />
        {/* Soft glow pulse behind the header */}
        <div aria-hidden style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
          width: 220, height: 90, borderRadius: '50%',
          background: `radial-gradient(ellipse, ${SEA}2e 0%, transparent 70%)`,
          filter: 'blur(8px)', animation: 'tideGlow 4s ease-in-out infinite', pointerEvents: 'none',
        }} />

        <div style={{ padding: '1.3rem 1.3rem 1.2rem', position: 'relative' }}>
          {/* Eyebrow + tier */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: '0.55rem' }}>
            <WaveGlyph />
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.56rem', color: `${SEA}cc` }}>
              A Tide Rolls In
            </p>
            <WaveGlyph flip />
          </div>
          {tide.tier > 1 && (
            <p className="font-karla font-700 uppercase tracking-[0.18em] text-center" style={{ fontSize: '0.5rem', color: 'rgba(245,242,236,0.4)', marginBottom: '0.5rem' }}>
              Tier {tide.tier} Tide
            </p>
          )}

          {/* Title */}
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.45rem', color: '#f5f2ec', lineHeight: 1.18, marginBottom: '0.7rem', textShadow: `0 0 22px ${SEA}33` }}>
            {tide.title}
          </p>

          {/* Flavor */}
          <p className="font-karla text-center" style={{
            fontSize: '0.85rem', lineHeight: 1.55,
            color: 'rgba(245,242,236,0.74)', fontStyle: 'italic',
            marginBottom: '1.15rem', padding: '0 0.3rem',
          }}>
            {tide.flavor}
          </p>

          {/* Choices — each a path, with boons (green) and costs (red) called
              out so the trade reads instantly. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tide.choices.map((c, idx) => (
              <ChoiceCard key={c.id} choice={c} index={idx} onPick={() => onPicked(c)} />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ChoiceCard({ choice, index, onPick }: { choice: TideChoice; index: number; onPick: () => void }) {
  // Build the chip list with tone so each effect shows as a boon or a cost.
  const chips = choice.effects
    .map((e: TideEffect) => ({ label: describeEffect(e), tone: effectTone(e) }))
    .filter(c => c.label.length > 0)

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.12 + index * 0.07, duration: 0.3 }}
      whileTap={{ scale: 0.975 }}
      onClick={onPick}
      className="tap"
      style={{
        position: 'relative',
        textAlign: 'left',
        padding: '0.85rem 0.95rem 0.85rem 1.05rem',
        borderRadius: 13,
        background: `linear-gradient(180deg, ${SEA}10, rgba(255,255,255,0.012))`,
        border: `1px solid ${SEA}30`,
        color: '#e7eef6',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Left accent rail */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${SEA}, ${SEA}33)` }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <p className="font-cinzel font-700" style={{ flex: 1, fontSize: '0.98rem', color: '#bae6fd', lineHeight: 1.2 }}>
          {choice.label}
        </p>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={`${SEA}aa`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(231,238,246,0.72)', lineHeight: 1.45, marginBottom: chips.length > 0 ? 8 : 0 }}>
        {choice.description}
      </p>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {chips.map((chip, i) => {
            const t = TONE[chip.tone]
            return (
              <span key={i} className="font-karla font-700" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.6rem', padding: '0.18rem 0.5rem', borderRadius: 999,
                background: t.bg, border: `1px solid ${t.bd}`, color: t.fg, whiteSpace: 'nowrap',
              }}>
                {chip.tone !== 'neutral' && (
                  <span aria-hidden style={{ fontSize: '0.7rem', lineHeight: 1 }}>{chip.tone === 'good' ? '▲' : '▼'}</span>
                )}
                {chip.label}
              </span>
            )
          })}
        </div>
      )}
    </motion.button>
  )
}

function WaveGlyph({ flip }: { flip?: boolean }) {
  return (
    <svg width="20" height="9" viewBox="0 0 28 10" fill="none" stroke={SEA} strokeWidth="1.6" strokeLinecap="round"
      style={{ opacity: 0.7, transform: flip ? 'scaleX(-1)' : 'none' }} aria-hidden>
      <path d="M1 6c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4 2.5-4 5-4" />
    </svg>
  )
}
