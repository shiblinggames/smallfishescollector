'use client'

import { motion } from 'framer-motion'

export type TickerItem = { name: string; price: number; pct: number }

const TNUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', letterSpacing: '-0.01em' }

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill={up ? '#4ade80' : '#f87171'} aria-hidden style={{ transform: up ? 'none' : 'scaleY(-1)', flexShrink: 0 }}>
      <path d="M12 4l8 12H4z" />
    </svg>
  )
}

// Continuous horizontal marquee (a news-site stock ticker). The item list is
// rendered twice back-to-back and the track is translated by exactly -50% on a
// linear loop, so the seam is invisible. Duration scales with item count so the
// scroll speed stays constant regardless of how many species are listed.
export default function PriceTickerScroll({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null
  const duration = Math.max(40, items.length * 7)
  const row = (keyPrefix: string) => items.map((it, i) => {
    const up = it.pct >= 0
    return (
      <span key={`${keyPrefix}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 26 }}>
        <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#e6e1d6' }}>{it.name}</span>
        <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: '#fff', ...TNUM }}>{it.price.toLocaleString()} ⟡</span>
        <Arrow up={up} />
        <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: up ? '#4ade80' : '#f87171', ...TNUM }}>
          {up ? '+' : ''}{it.pct.toFixed(1)}%
        </span>
      </span>
    )
  })
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)' }}>
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
