'use client'

// The level hero at the top of Expeditions and Fishing.
//
// Both pages open with the same idea: the skill's name, your level, a bar, and
// something on the right about what is next. Both were also drawing it as bare
// text and a bare bar sitting straight on a full-bleed painting, which is the
// one place in the app where the background is busiest, so the two most
// important numbers on each page were the hardest to read on it.
//
// It is a panel now, with an opaque base, a lit top edge and a shadow under
// it, so it sits ON the art rather than in it. One component, both pages: the
// bars were already duplicated markup and would have drifted the first time
// either was touched.
//
// The right-hand slot is a prop because that is the only part that genuinely
// differs. Fishing shows XP to the next level; Navigation shows the same until
// max, then a Renown rank with a "spend" chip when points are waiting.
//
// The FOOTER slot is what each page hangs under its level: the market ticker on
// Fishing, the four stations of the quarterdeck on Expeditions. Both used to be
// separate panels sitting 0.9rem below with their own identical border, radius
// and shadow, which read as two objects that happened to match rather than one
// header. They are now inside this panel, flush to its edges, divided from the
// level by a single hairline.
//
// That forces the shape below: the panel can no longer BE a button, because a
// footer holds links and an anchor inside a button is invalid. The panel is a
// div that carries the chrome, and the level area is a button within it.

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { LevelSectionHeader } from '@/components/LevelSectionHeader'

export default function SkillLevelHero({
  label, level, progress, atMax = false,
  pulse = false, pulseColor = '#7da0d8',
  onClick, ariaLabel, barKey, trailing, footer,
}: {
  label: string
  level: number
  /** 0..1 along the current level, or along the current Renown rank at max. */
  progress: number
  /** Past 100 the bar goes gold and tracks Renown instead. */
  atMax?: boolean
  /** Blink the panel when there is a reason to tap it. */
  pulse?: boolean
  pulseColor?: string
  onClick?: () => void
  ariaLabel?: string
  /** Changing this re-runs the fill animation (level up, new Renown rank). */
  barKey?: string | number
  trailing?: ReactNode
  /** Rendered flush inside the panel, under a hairline. */
  footer?: ReactNode
}) {
  const BLUE = '#7da0d8'
  return (
    <motion.div
      // The pulse rides ON TOP of the panel's own drop shadow, so a panel with
      // nothing to say still sits above the art instead of going flat.
      animate={pulse
        ? { boxShadow: [
            `0 6px 22px rgba(0,0,0,0.45), 0 0 0px ${pulseColor}00`,
            `0 6px 22px rgba(0,0,0,0.45), 0 0 18px ${pulseColor}99`,
            `0 6px 22px rgba(0,0,0,0.45), 0 0 0px ${pulseColor}00`,
          ] }
        : { boxShadow: '0 6px 22px rgba(0,0,0,0.45)' }}
      transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden',
        // OPAQUE base. The whole point: this panel lives over a painting.
        background: 'linear-gradient(180deg, rgba(14,19,29,0.94) 0%, rgba(8,11,18,0.97) 100%)',
        border: `1px solid ${pulse ? pulseColor + '55' : 'rgba(255,255,255,0.10)'}`,
        // A lit top edge reads as a raised surface rather than a flat rectangle.
        borderTop: `1px solid ${pulse ? pulseColor + '77' : 'rgba(255,255,255,0.17)'}`,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = `${atMax ? '#f0c040' : BLUE}66` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = pulse ? pulseColor + '55' : 'rgba(255,255,255,0.10)' }}
    >
      {/* A wash of the skill's colour behind the title, so the panel belongs to
          this page rather than being generic chrome. */}
      <span aria-hidden style={{
        position: 'absolute', left: '50%', top: -34, transform: 'translateX(-50%)',
        width: 240, height: 84, borderRadius: '50%', pointerEvents: 'none',
        background: `radial-gradient(ellipse, ${atMax ? 'rgba(240,192,64,0.20)' : 'rgba(125,160,216,0.20)'} 0%, transparent 70%)`,
      }} />

      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="font-karla font-600"
        style={{
          position: 'relative', display: 'block', width: '100%', textAlign: 'left',
          padding: '0.85rem 0.95rem 0.9rem',
          background: 'none', border: 'none',
          cursor: onClick ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <LevelSectionHeader label={label} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <div className="shrink-0" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${BLUE}bb`, letterSpacing: '0.08em' }}>LV</span>
            <span className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: atMax ? '#f0c040' : BLUE, lineHeight: 1 }}>{level}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, height: 9, borderRadius: 999, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
            <motion.div
              key={barKey}
              initial={{ width: '0%' }}
              animate={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={{
                height: '100%', borderRadius: 999,
                background: atMax ? 'linear-gradient(90deg, #a07a2a 0%, #f0c040 100%)' : 'linear-gradient(90deg, #4a6090 0%, #7da0d8 100%)',
                boxShadow: atMax ? '0 0 10px #f0c04070' : '0 0 10px #7da0d870',
              }}
            />
          </div>
          {trailing}
        </div>
      </button>

      {footer && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)' }}>{footer}</div>
      )}
    </motion.div>
  )
}
