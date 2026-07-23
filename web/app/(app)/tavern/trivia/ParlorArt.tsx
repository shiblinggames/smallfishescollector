'use client'

// Shared Parlor art: the HOST and a real crown icon (kills the 👑 emoji that
// broke the no-emoji-icons rule). The host reuses an existing crew asset — the
// Lionfish "Crimson Cavalier" skin, a dashing non-legendary emcee. Recast the
// Parlor in ONE line by pointing HOST_ART at any other card-arts/<file>.png.

import { motion } from 'framer-motion'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const HOST_ART = `${SUPABASE_URL}/storage/v1/object/public/card-arts/Lionfish_crimsoncavalier.png`
export const HOST_GLOW = '#c9a24a'

// Candlelit wood + brass — the same cabinet language as the Den next door, so
// the Parlor reads as a real tavern room, not a flat panel. Shared by all screens.
export const PARLOR = {
  wood: '#241a10',
  woodDark: '#15100a',
  woodDeep: '#0c0906',
  brass: '#c9a24a',
  brassDim: 'rgba(201,162,74,0.42)',
  candle: '#f0c86a',
}

/** A warm candlelight vignette to lay over a surface (pointer-events none). Give
 *  the parent position:relative + overflow:hidden. */
export function CandleGlow({ from = '50% 0%', color = 'rgba(240,200,106,0.10)' }: { from?: string; color?: string }) {
  return <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 80% 60% at ${from}, ${color} 0%, transparent 62%)` }} />
}

/** A drawn crown — replaces the 👑 emoji (iOS emoji presentation + the
 *  no-emoji-icons rule). Fill + rim in the accent colour. */
export function CrownIcon({ size = 24, color = '#f0c040' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}>
      <path d="M2.5 7.5 L6.5 11 L12 4.5 L17.5 11 L21.5 7.5 L20 19 H4 L2.5 7.5 Z"
        fill={color} stroke={color} strokeWidth="1.1" strokeLinejoin="round" opacity="0.94" />
      <circle cx="2.5" cy="7.5" r="1.5" fill={color} />
      <circle cx="12" cy="4.5" r="1.6" fill={color} />
      <circle cx="21.5" cy="7.5" r="1.5" fill={color} />
      <rect x="4" y="19" width="16" height="2.2" rx="1" fill={color} />
    </svg>
  )
}

/** The Parlor's host presiding over a game. Optional in-character line in a
 *  candlelit speech card. `size` scales the portrait. */
export function ParlorHost({ line, size = 72, align = 'left' }: { line?: string; size?: number; align?: 'left' | 'center' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: 11 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      >
        <div style={{ position: 'absolute', inset: '-14%', borderRadius: '50%', background: `radial-gradient(circle, ${HOST_GLOW}3a, transparent 68%)` }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HOST_ART} alt="The Parlor's host" style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.55))' }} />
      </motion.div>
      {line && (
        <motion.div
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          style={{ position: 'relative', maxWidth: 260, background: 'linear-gradient(180deg, rgba(28,20,10,0.82), rgba(16,11,6,0.82))', border: `1px solid ${HOST_GLOW}44`, borderRadius: 12, padding: '0.5rem 0.72rem', boxShadow: '0 6px 18px rgba(0,0,0,0.4)' }}
        >
          {/* speech tail */}
          <span aria-hidden style={{ position: 'absolute', left: -6, top: '50%', marginTop: -5, width: 10, height: 10, transform: 'rotate(45deg)', background: 'rgba(24,17,9,0.82)', borderLeft: `1px solid ${HOST_GLOW}44`, borderBottom: `1px solid ${HOST_GLOW}44` }} />
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#e7dcc4', lineHeight: 1.45, fontStyle: 'italic' }}>{line}</p>
        </motion.div>
      )}
    </div>
  )
}
