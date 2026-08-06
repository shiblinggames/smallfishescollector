'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

// The market strip: a news-site stock ticker for the fish board, tapping
// through to the market itself.
//
// It lived on the Tavern, which was the wrong hub for it. Prices are a FISHING
// concern (they decide what a haul is worth and when to sell it), and the
// Tavern is where you go to gamble and socialise. It now sits under the fishing
// level hero, one tap from the Market tile it reports on.
//
// It renders INSIDE the level hero's panel, so it carries no chrome of its own
// at all: no border, no radius, no shadow. It used to wear a copy of the hero's
// styling 0.9rem below it, which read as two panels that happened to match
// rather than one header. Only the rise/fall colours are its own, and those are
// semantic.
//
// Two kinds of quote ride the same strip. A fish quotes a PRICE in doubloons,
// what one sells for right now. An Exchange index quotes a LEVEL, a bare
// multiple around 1.000 that means nothing in coin, so it gets no glyph and a
// different colour. Mixing them without that distinction read as though the Sea
// Index were a fish worth one doubloon.

export type TickerItem = {
  name: string
  /** Doubloons for a fish, a level for an index. */
  price: number
  pct: number
  kind?: 'fish' | 'index'
}

const TNUM: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
  letterSpacing: '-0.01em',
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill={up ? '#4ade80' : '#f87171'} aria-hidden
      style={{ transform: up ? 'none' : 'scaleY(-1)', flexShrink: 0 }}>
      <path d="M12 4l8 12H4z" />
    </svg>
  )
}

/** Continuous horizontal marquee. The list is rendered twice back to back and
 *  the track translated by exactly -50% on a linear loop, so the seam is
 *  invisible. Duration scales with the item count so the speed stays constant
 *  however many are listed. */
function Marquee({ items }: { items: TickerItem[] }) {
  const duration = Math.max(40, items.length * 7)
  const row = (keyPrefix: string) => items.map((it, i) => {
    const up = it.pct >= 0
    const index = it.kind === 'index'
    return (
      <span key={`${keyPrefix}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 26 }}>
        <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: index ? '#7da0d8' : '#e6e1d6' }}>{it.name}</span>
        <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: '#fff', ...TNUM }}>
          {index ? it.price.toFixed(3) : `${it.price.toLocaleString()} ⟡`}
        </span>
        <Arrow up={up} />
        <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: up ? '#4ade80' : '#f87171', ...TNUM }}>
          {up ? '+' : ''}{it.pct.toFixed(1)}%
        </span>
      </span>
    )
  })
  return (
    <div style={{
      flex: 1, minWidth: 0, overflow: 'hidden',
      maskImage: 'linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)',
      WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)',
    }}>
      <motion.div
        style={{ display: 'inline-flex', whiteSpace: 'nowrap', willChange: 'transform' }}
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      >
        {row('a')}
        {row('b')}
      </motion.div>
    </div>
  )
}

export default function MarketTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null
  return (
    <Link
      href="/tavern/market"
      style={{
        display: 'flex', alignItems: 'center',
        position: 'relative', overflow: 'hidden',
        // No chrome: the hero panel around it supplies all of that.
        height: 42,
        padding: '0 0.7rem 0 0.95rem',
        cursor: 'pointer', userSelect: 'none', textDecoration: 'none', color: 'inherit',
      }}
    >
      <span className="font-karla font-700 uppercase tracking-[0.12em]"
        style={{ fontSize: '0.52rem', color: '#7da0d8', flexShrink: 0, marginRight: 10 }}>
        Market
      </span>
      <Marquee items={items} />
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(125,160,216,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginLeft: 8 }}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
