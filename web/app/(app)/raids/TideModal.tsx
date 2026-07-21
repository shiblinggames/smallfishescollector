'use client'

import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { type TideEvent, type TideChoice, type TideEffect, describeEffect, effectTone } from '@/lib/tides'

// ─── Tide event / Don's gift ────────────────────────────────────────────────
// A CAMPAIGN-ONLY between-fights event, and deliberately a DIFFERENT ANIMAL from
// the Gauntlet's boon DRAFT (a row of vertical 3D flip-cards in gold). A tide
// FLOODS the screen: rolling wave layers rise, foam drifts up, and the choices
// read as CURRENTS you pick a heading through — full-width bands riding the
// water, not cards you draw.
//
// Two skins via `theme`:
//   'tide' — cyan/foam ocean (the neutral campaign tides)
//   'don'  — crimson "blood in the water" (the Don Finleone pre-boss reprieve),
//            so his condescending little gift never reads as a normal tide.
// Fully self-contained (no globals.css); transform/opacity animation only.

interface Palette {
  sea: string; deep: string; foam: string; glow: string
  eyebrow: string; heading: string; bg: string
}
const THEMES: Record<'tide' | 'don', Palette> = {
  tide: {
    sea: '#38bdf8', deep: '#0e7490', foam: '#cffafe', glow: '#67e8f9',
    eyebrow: 'The Tide Turns', heading: 'Choose your heading',
    bg: 'radial-gradient(ellipse 130% 90% at 50% 118%, rgba(10,70,104,0.94) 0%, rgba(4,26,42,0.95) 46%, rgba(2,8,16,0.96) 100%)',
  },
  don: {
    sea: '#f04a4a', deep: '#7f1d1d', foam: '#fecaca', glow: '#f87171',
    eyebrow: 'The Don Indulges You', heading: 'The don allows you one',
    bg: 'radial-gradient(ellipse 130% 90% at 50% 118%, rgba(120,20,22,0.94) 0%, rgba(48,10,12,0.95) 46%, rgba(12,3,4,0.97) 100%)',
  },
}

const KF = `
@keyframes tideWaveA { 0% { transform: translateX(0) }      100% { transform: translateX(-50%) } }
@keyframes tideWaveB { 0% { transform: translateX(-50%) }   100% { transform: translateX(0) } }
@keyframes tideFoam  { 0% { transform: translateY(0); opacity: 0 } 16% { opacity: 0.7 } 100% { transform: translateY(-180px); opacity: 0 } }
@keyframes tideCaustic { 0%,100% { opacity: 0.10; transform: translateX(-3%) } 50% { opacity: 0.24; transform: translateX(3%) } }
@keyframes tideRule  { 0% { background-position: -160% 0 } 100% { background-position: 160% 0 } }
@keyframes tideCrest { 0%,100% { opacity: 0.45 } 50% { opacity: 0.9 } }
`

// A tiling wave path — period 720 across a 2880 viewBox, so translating one
// layer by 50% loops seamlessly. Two layers at different speeds fake depth.
const WAVE_PATH =
  'M0,60 C240,20 480,100 720,60 C960,20 1200,100 1440,60 C1680,20 1920,100 2160,60 C2400,20 2640,100 2880,60 L2880,140 L0,140 Z'

// Deterministic foam motes (no Math.random in render → no hydration drift).
const FOAM_MOTES = [
  { left: 10, size: 3, dur: 7,   delay: 0 },
  { left: 23, size: 2, dur: 9,   delay: 1.6 },
  { left: 38, size: 4, dur: 6,   delay: 0.7 },
  { left: 52, size: 2, dur: 8.5, delay: 2.4 },
  { left: 64, size: 3, dur: 6.5, delay: 1.1 },
  { left: 78, size: 2, dur: 9.5, delay: 3.1 },
  { left: 88, size: 3, dur: 7,   delay: 0.5 },
  { left: 95, size: 2, dur: 8,   delay: 2 },
]

const TONE: Record<'good' | 'bad' | 'neutral', { bg: string; bd: string; fg: string }> = {
  good:    { bg: 'rgba(94,234,212,0.14)',  bd: 'rgba(94,234,212,0.45)',  fg: '#7ff0dc' },
  bad:     { bg: 'rgba(251,113,133,0.14)', bd: 'rgba(251,113,133,0.45)', fg: '#fda4af' },
  neutral: { bg: 'rgba(103,232,249,0.11)', bd: 'rgba(103,232,249,0.32)', fg: '#a5f3fc' },
}

interface Props {
  tide: TideEvent
  /** Player picks a current — parent applies effects + advances. */
  onPicked: (choice: TideChoice) => void
  /** 'tide' (cyan, default) or 'don' (crimson pre-boss reprieve). */
  theme?: 'tide' | 'don'
}

export default function TideModal({ tide, onPicked, theme = 'tide' }: Props) {
  const p = THEMES[theme]
  // Portal to <body>: the modal is position:fixed, but an animated/transformed
  // ancestor in the raid tree would otherwise re-anchor it (top clipped, taps
  // land wrong). Rendering at the body root keeps it truly viewport-fixed.
  if (typeof document === 'undefined') return null
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: p.bg,
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '1.15rem',
        overflow: 'hidden',
      }}
    >
      <style>{KF}</style>

      {/* ── The sea itself ─────────────────────────────────────────────────
          Two rolling wave layers rising off the bottom, drifting foam carried
          up off the crests, and a slow caustic light band. Purely atmospheric,
          never blocks taps. This is the signature that reads "TIDE," not draft. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', left: '-6%', right: '-6%', bottom: 0, height: '55%',
          background: `radial-gradient(ellipse 70% 100% at 50% 100%, ${p.glow}22 0%, transparent 70%)`,
          animation: 'tideCaustic 9s ease-in-out infinite',
        }} />
        {/* Back wave — slower, deeper, dimmer */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 190, overflow: 'hidden' }}>
          <svg viewBox="0 0 2880 140" preserveAspectRatio="none" style={{ width: '200%', height: '100%', animation: 'tideWaveB 13s linear infinite' }}>
            <path d={WAVE_PATH} fill={`${p.deep}55`} />
          </svg>
        </div>
        {/* Front wave — faster, brighter, foam-lit crest */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, overflow: 'hidden' }}>
          <svg viewBox="0 0 2880 140" preserveAspectRatio="none" style={{ width: '200%', height: '100%', animation: 'tideWaveA 8.5s linear infinite' }}>
            <path d={WAVE_PATH} fill={`${p.sea}3a`} />
          </svg>
        </div>
        {FOAM_MOTES.map((f, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: '3%', left: `${f.left}%`,
            width: f.size, height: f.size, borderRadius: '50%',
            background: p.foam, boxShadow: `0 0 6px ${p.glow}`,
            animation: `tideFoam ${f.dur}s linear ${f.delay}s infinite`,
          }} />
        ))}
      </div>

      {/* ── The event, docked low so it rides the rising water ──────────── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 210, damping: 24 }}
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: 520, margin: '0 auto',
          maxHeight: '90vh', overflowY: 'auto',
          WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
          paddingBottom: '0.4rem',
        }}
      >
        {/* Header — a notice, not a card. Sits straight on the flooded scene. */}
        <div style={{ textAlign: 'center', marginBottom: '0.9rem', padding: '0 0.3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: '0.5rem' }}>
            <WaveGlyph color={p.sea} />
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.3em', color: p.glow }}>
              {p.eyebrow}
            </p>
            <WaveGlyph color={p.sea} flip />
          </div>
          {tide.tier > 1 && (
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.44)', marginBottom: '0.55rem' }}>
              A Spring Tide · Tier {tide.tier}
            </p>
          )}
          <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#fbfdff', lineHeight: 1.14, marginBottom: '0.6rem', textShadow: `0 0 26px ${p.sea}55` }}>
            {tide.title}
          </p>
          <p className="font-karla" style={{ fontSize: '0.86rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic' }}>
            {tide.flavor}
          </p>
          {/* A shimmering wave-rule instead of a card border */}
          <div aria-hidden style={{
            height: 2, margin: '0.95rem auto 0', maxWidth: 260,
            background: `linear-gradient(90deg, transparent, ${p.sea}, ${p.foam}, ${p.sea}, transparent)`,
            backgroundSize: '200% 100%', animation: 'tideRule 3.4s linear infinite',
          }} />
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.24em', color: 'rgba(255,255,255,0.44)', marginTop: '0.7rem' }}>
            {p.heading}
          </p>
        </div>

        {/* Currents — full-width bands riding the water. Each is a heading you
            can take, boons (green) and costs (red) called out on the crest. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {tide.choices.map((c, idx) => (
            <CurrentBand key={c.id} choice={c} index={idx} palette={p} onPick={() => onPicked(c)} />
          ))}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

function CurrentBand({ choice, index, palette: p, onPick }: { choice: TideChoice; index: number; palette: Palette; onPick: () => void }) {
  const chips = choice.effects
    .map((e: TideEffect) => ({ label: describeEffect(e), tone: effectTone(e) }))
    .filter(c => c.label.length > 0)

  return (
    <motion.button
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.14 + index * 0.08, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.985 }}
      onClick={onPick}
      className="tap"
      style={{
        position: 'relative',
        textAlign: 'left',
        padding: '0.9rem 1rem 0.95rem 1.15rem',
        borderRadius: 14,
        background: `linear-gradient(100deg, ${p.deep}2e 0%, ${p.sea}18 42%, rgba(8,16,24,0.55) 100%)`,
        border: `1px solid ${p.sea}3a`,
        boxShadow: `inset 0 1px 0 ${p.foam}22, 0 6px 22px rgba(2,10,18,0.4)`,
        color: '#f2f7fb',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Foam crest riding the top edge of the current */}
      <span aria-hidden style={{
        position: 'absolute', top: 0, left: 8, right: 8, height: 2, borderRadius: 2,
        background: `linear-gradient(90deg, transparent, ${p.foam}bb 20%, ${p.glow}aa 50%, ${p.foam}bb 80%, transparent)`,
        animation: 'tideCrest 3.6s ease-in-out infinite',
      }} />
      {/* Left current-rail */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 3, background: `linear-gradient(180deg, ${p.glow}, ${p.deep}55)` }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <p className="font-cinzel font-700" style={{ flex: 1, fontSize: '1rem', color: '#eef8ff', lineHeight: 1.2 }}>
          {choice.label}
        </p>
        {/* Heading arrow — "steer this way" */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.glow} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.9 }}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>

      <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(242,247,251,0.76)', lineHeight: 1.45, marginBottom: chips.length > 0 ? 8 : 0 }}>
        {choice.description}
      </p>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {chips.map((chip, i) => {
            const t = TONE[chip.tone]
            return (
              <span key={i} className="font-karla font-700" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: 999,
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

function WaveGlyph({ color, flip }: { color: string; flip?: boolean }) {
  return (
    <svg width="22" height="10" viewBox="0 0 28 10" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round"
      style={{ opacity: 0.8, transform: flip ? 'scaleX(-1)' : 'none' }} aria-hidden>
      <path d="M1 6c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4 2.5-4 5-4" />
    </svg>
  )
}
