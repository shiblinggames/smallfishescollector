'use client'

import { useState, useEffect, useTransition, useCallback, useId, useMemo, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ShopHeader from '@/components/ShopHeader'
import LeaderboardModal from '@/components/LeaderboardModal'
import { marketSellFish, sellEntireHold } from './actions'
import type { MarketFishEntry, MarketState } from './page'
import { MOOD_CONFIG } from '@/lib/fishMarket'
import BoardClient from './BoardClient'
import SwipeAction from '@/components/SwipeAction'
import { hapticReward } from '@/lib/haptics'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import { SEA_ACCENT, SELL_STEP } from '@/lib/seaOnboarding'
import { setSeaTourStep } from '@/app/(app)/sea/tourActions'

// ── Palette ──────────────────────────────────────────────────────────────
const UP = '#4ade80'
const DOWN = '#f87171'
const GOLD = '#f0c040'

const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#38bdf8',
  open_waters: '#34d399',
  deep:        '#818cf8',
  abyss:       '#f87171',
}
const HABITAT_LABEL: Record<string, string> = {
  shallows: 'Shallows', open_waters: 'Open Waters', deep: 'Deep', abyss: 'Abyss',
}
const RARITY_COLOR: Record<number, string> = {
  1: '#9ca3af', 2: '#34d399', 3: '#60a5fa', 4: '#c084fc', 5: '#fb923c',
}

// Tabular figures so prices line up like a ticker, not flowing serif text.
const TNUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', letterSpacing: '-0.01em' }

// Mood copy is the HARBOURMASTER talking, not a weather report (2026-07
// warmth pass) — the ticker mechanic stays fintech, the voice goes pirate.

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pctOf = (now: number, prev: number) => (prev > 0 ? ((now - prev) / prev) * 100 : 0)
const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`

// How a fish's green/red marker is decided. 'movement' = the most recent tick
// (up/down since last update); 'normal' = whether the CURRENT price is above or
// below this fish's usual price (multiplier is centred on 1.0 = normal), which is
// what a seller actually cares about. A 1% dip can still leave a fish well above
// its normal value — that's the whole reason for the toggle.
type MarketMode = 'movement' | 'normal'
const MarketModeCtx = createContext<MarketMode>('movement')
function marketSignal(e: MarketFishEntry, mode: MarketMode): { up: boolean; pct: number } {
  if (mode === 'normal') return { up: e.multiplier >= 1, pct: (e.multiplier - 1) * 100 }
  const pct = pctOf(e.multiplier, e.prev_multiplier)
  return { up: pct >= 0, pct }
}

// ── The two doors ────────────────────────────────────────────────────────
//
// These were two identical sky-blue pills reading "The Hold" and "Exchange",
// which told you nothing except which one was lit. They are two different
// PLACES that happen to share a screen: one is your own cargo, priced in coin,
// and one is a contracts board. So they get different colours (the Hold takes
// doubloon gold, the Exchange the steel blue it uses throughout), a drawn mark
// each, and a line of live state underneath, which is the part that makes a tab
// worth pressing rather than furniture.

function HoldMark({ color }: { color: string }) {
  // A crate, because the Hold is cargo. Braced corners read as a crate at 20px
  // where a barrel just reads as a circle.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="18" height="14" rx="1.5" />
      <path d="M3 10.5h18" />
      <path d="M9 6V3.5h6V6" />
      <path d="M9 14.5h6" />
    </svg>
  )
}

function ExchangeMark({ color }: { color: string }) {
  // A line finding its high. The same shape the board draws all over this
  // screen, which is the point: it says "this is the chart side".
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 17.5l5-5.5 3.5 3L20 6" />
      <path d="M15 6h5v5" />
    </svg>
  )
}

function MarketDoor({ active, accent, title, sub, subAccent, mark, onClick }: {
  active: boolean
  accent: string
  title: string
  sub: string
  subAccent?: boolean
  mark: (color: string) => React.ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="tap"
      style={{
        flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '0.6rem 0.7rem', borderRadius: 13, textAlign: 'left',
        // Opaque base either way: this sits on a painted ground.
        background: active
          ? 'linear-gradient(180deg, rgba(22,26,34,0.97) 0%, rgba(11,14,19,0.98) 100%)'
          : 'linear-gradient(180deg, rgba(13,16,21,0.92) 0%, rgba(9,11,15,0.94) 100%)',
        // THE SHUT DOOR IS STILL A DOOR. Grey borders and grey type are how
        // this game says "you cannot have this", so the closed side read as
        // barred rather than as somewhere to go. It keeps its own colour, just
        // turned down: the open one wins on glow, weight and shadow instead of
        // by being the only one with any colour at all.
        border: `1px solid ${active ? accent + '66' : accent + '33'}`,
        borderTop: `1px solid ${active ? accent + '99' : accent + '4d'}`,
        boxShadow: active ? '0 4px 16px rgba(0,0,0,0.45)' : 'none',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        transition: 'border-color 0.18s, background 0.18s',
      }}>
      {/* Lantern wash behind the mark on the open door only. */}
      {active && (
        <span aria-hidden style={{
          position: 'absolute', left: -10, top: '50%', width: 96, height: 96, marginTop: -48,
          borderRadius: '50%', pointerEvents: 'none',
          background: `radial-gradient(circle, ${accent}26 0%, transparent 68%)`,
        }} />
      )}
      <span style={{
        position: 'relative', flexShrink: 0, width: 34, height: 34, borderRadius: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? `${accent}1c` : `${accent}12`,
        border: `1px solid ${active ? accent + '4d' : accent + '2b'}`,
      }}>
        {mark(active ? accent : `${accent}b3`)}
      </span>
      <span style={{ position: 'relative', minWidth: 0, flex: 1 }}>
        <span className="font-cinzel font-700" style={{
          display: 'block', fontSize: '0.88rem', lineHeight: 1.15,
          color: active ? '#f2ede2' : '#c6cedb',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{title}</span>
        <span className="font-karla font-600" style={{
          display: 'block', fontSize: '0.6rem', marginTop: 1,
          color: active ? (subAccent ? accent : '#8e8577') : '#8b93a1',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{sub}</span>
      </span>
    </button>
  )
}

function ChangeArrow({ up }: { up: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill={up ? UP : DOWN} aria-hidden style={{ transform: up ? 'none' : 'scaleY(-1)' }}>
      <path d="M12 4l8 12H4z" />
    </svg>
  )
}

// ── Sparkline (line + optional gradient fill, RH-style) ──────────────────
function Sparkline({ data, up, height = 40, fill = false }: { data: number[]; up: boolean; height?: number; fill?: boolean }) {
  const id = useId()
  if (data.length < 2) return <div style={{ height, flex: 1 }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 0.001
  const W = 100
  const H = height
  const xy = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return [x, y] as const
  })
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = up ? UP : DOWN
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ flex: 1, display: 'block', overflow: 'visible' }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#g${id})`} />
        </>
      )}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function useCountdown(targetIso: string) {
  const getSeconds = useCallback(() =>
    Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000))
  , [targetIso])
  const [seconds, setSeconds] = useState(getSeconds)
  useEffect(() => {
    setSeconds(getSeconds())
    const id = setInterval(() => setSeconds(getSeconds()), 1000)
    return () => clearInterval(id)
  }, [getSeconds])
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Build an aggregate portfolio-value curve from each holding's multiplier
// history (tail-aligned so the newest ticks line up), in doubloons.
function portfolioCurve(portfolio: MarketFishEntry[], fee: number): number[] {
  const L = Math.max(0, ...portfolio.map(e => e.history.length))
  if (L === 0) return []
  const pts: number[] = []
  for (let i = 0; i < L; i++) {
    let sum = 0
    for (const e of portfolio) {
      const offset = L - e.history.length
      const v = i < offset ? (e.history[0] ?? e.multiplier) : e.history[i - offset]
      sum += e.sell_value * v * e.quantity
    }
    pts.push(Math.floor(sum * fee))
  }
  return pts
}

// ── Light holding row ──
// Tap the info to open the trade sheet (custom quantity / detail); the inline
// "Sell" button on the right sells the WHOLE stack of that species at the
// current market price in one tap — brought back per player feedback that the
// per-fish quick-sell went missing when the market replaced the old hold.
function HoldingRow({ entry, fee, onOpen, onQuickSell, selling, simple = false }: {
  entry: MarketFishEntry
  fee: number
  onOpen: (e: MarketFishEntry) => void
  onQuickSell: (e: MarketFishEntry) => void
  selling: boolean
  /** Drop the sparkline and the percentage. Somebody selling a haul wants the
   *  name, how many, what it pays and a button; the trend line is a second,
   *  quieter story about a number that is already on the row. */
  simple?: boolean
}) {
  const { up, pct } = marketSignal(entry, useContext(MarketModeCtx))
  const priceEach = Math.floor(entry.sell_value * entry.multiplier * fee)
  const value = priceEach * entry.quantity
  const rColor = RARITY_COLOR[entry.bite_rarity] ?? '#9ca3af'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className="tap"
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '0.7rem 0.25rem', background: 'none', border: 'none', textAlign: 'left',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: rColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.92rem', color: '#f0ede8' }}>{entry.name}</p>
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a7774', ...TNUM }}>
            {simple ? `${entry.quantity} aboard` : `×${entry.quantity} · ${value.toLocaleString()} ⟡`}
          </p>
        </div>
        {!simple && (
          <div style={{ width: 50, flexShrink: 0 }}>
            <Sparkline data={[...entry.history, entry.multiplier]} up={up} height={26} />
          </div>
        )}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
          {/* SIMPLE SHOWS THE STACK, ADVANCED SHOWS THE UNIT PRICE. A seller
              asking "what do I get for these" means all of them; a trader
              reading a ticker means each. Same row, different question. */}
          <p className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#fff', ...TNUM }}>
            {(simple ? value : priceEach).toLocaleString()} ⟡
          </p>
          {simple ? (
            <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a7774', ...TNUM }}>
              {priceEach.toLocaleString()} each
            </p>
          ) : (
            <p className="font-karla font-700 flex items-center justify-end gap-1" style={{ fontSize: '0.64rem', color: up ? UP : DOWN, ...TNUM }}>
              <ChangeArrow up={up} />{fmtPct(pct)}
            </p>
          )}
        </div>
      </button>

      <button
        type="button"
        disabled={selling}
        onClick={() => onQuickSell(entry)}
        className="font-karla font-700 uppercase tracking-[0.05em] tap"
        style={{
          flexShrink: 0, padding: '0.42rem 0.6rem', borderRadius: 8,
          background: 'rgba(127,212,154,0.10)', border: '1px solid rgba(127,212,154,0.34)',
          color: selling ? '#5a6a60' : '#7fd49a', fontSize: '0.6rem',
          cursor: selling ? 'default' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Sell
      </button>
    </div>
  )
}

// ── Browse row (discovered, not held) ────────────────────────────────────
function BrowseRow({ entry }: { entry: MarketFishEntry }) {
  const { up, pct } = marketSignal(entry, useContext(MarketModeCtx))
  const price = Math.floor(entry.sell_value * entry.multiplier * 0.97)
  const hColor = HABITAT_COLOR[entry.habitat] ?? '#888'
  const rColor = RARITY_COLOR[entry.bite_rarity] ?? '#9ca3af'
  return (
    <div className="flex items-center gap-3 py-2.5 px-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: rColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.85rem', color: '#d0cdc8' }}>{entry.name}</p>
        <span className="font-karla font-600" style={{ fontSize: '0.56rem', color: hColor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {HABITAT_LABEL[entry.habitat] ?? entry.habitat}
        </span>
      </div>
      <div style={{ width: 56, flexShrink: 0 }}>
        <Sparkline data={[...entry.history, entry.multiplier]} up={up} height={26} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 78 }}>
        <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#f0ede8', ...TNUM }}>{price.toLocaleString()} ⟡</p>
        <p className="font-karla font-700 flex items-center justify-end gap-1" style={{ fontSize: '0.64rem', color: up ? UP : DOWN, ...TNUM }}>
          <ChangeArrow up={up} />{fmtPct(pct)}
        </p>
      </div>
    </div>
  )
}

// ── Top movers card ──────────────────────────────────────────────────────
function MoverCard({ entry, label, labelColor }: { entry: MarketFishEntry; label: string; labelColor: string }) {
  const pct = pctOf(entry.multiplier, entry.prev_multiplier)
  const up = pct >= 0
  const price = Math.floor(entry.sell_value * entry.multiplier * 0.97)
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'rgba(11,13,18,0.96)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12, padding: '0.65rem 0.75rem',
    }}>
      <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: labelColor, marginBottom: 4 }}>{label}</p>
      <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>{entry.name}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e0ddd8', ...TNUM }}>{price.toLocaleString()} ⟡</span>
        <span className="font-karla font-700 flex items-center gap-0.5" style={{ fontSize: '0.62rem', color: up ? UP : DOWN, ...TNUM }}>
          <ChangeArrow up={up} />{fmtPct(pct)}
        </span>
      </div>
    </div>
  )
}

// ── Trade sheet (bottom sheet) ───────────────────────────────────────────
function TradeSheet({ entry, fee, selling, onSell, onClose }: {
  entry: MarketFishEntry
  fee: number
  selling: boolean
  onSell: (fishId: number, qty: number) => void
  onClose: () => void
}) {
  const [qtyStr, setQtyStr] = useState(String(entry.quantity))
  const qty = Math.max(1, Math.min(entry.quantity, parseInt(qtyStr, 10) || 1))
  const mode = useContext(MarketModeCtx)
  const { up, pct } = marketSignal(entry, mode)
  const priceEach = Math.floor(entry.sell_value * entry.multiplier * fee)
  const proceeds = priceEach * qty
  const allHistory = [...entry.history, entry.multiplier]
  const histMax = Math.max(...allHistory)
  const histMin = Math.min(...allHistory)
  const hColor = HABITAT_COLOR[entry.habitat] ?? '#888'

  const chip = (label: string, target: number) => {
    const active = qty === target
    return (
      <button key={label} type="button" onClick={() => setQtyStr(String(target))} disabled={selling}
        className="font-karla font-700 flex-1"
        style={{
          fontSize: '0.72rem', padding: '0.5rem 0', borderRadius: 9,
          background: active ? `${hColor}26` : 'rgba(255,255,255,0.05)',
          border: `1px solid ${active ? `${hColor}70` : 'rgba(255,255,255,0.12)'}`,
          color: active ? '#fff' : '#b0ada8', cursor: selling ? 'default' : 'pointer',
        }}>
        {label}
      </button>
    )
  }

  const stat = (label: string, value: string, color: string) => (
    <div style={{ flex: 1 }}>
      <p className="font-karla font-400" style={{ fontSize: '0.56rem', color: '#6a6764' }}>{label}</p>
      <p className="font-karla font-700" style={{ fontSize: '0.78rem', color, ...TNUM }}>{value}</p>
    </div>
  )

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61,
          maxWidth: 512, margin: '0 auto',
          background: 'linear-gradient(180deg, #14161d 0%, #0b0c11 100%)',
          borderTop: `1px solid ${hColor}55`,
          borderRadius: '20px 20px 0 0',
          padding: '0.75rem 1.15rem calc(1.5rem + env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.55)',
        }}
      >
        {/* grab handle */}
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto 14px' }} />

        {/* header: name + price */}
        <div className="flex items-end justify-between gap-3 mb-3">
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: RARITY_COLOR[entry.bite_rarity] ?? '#9ca3af', flexShrink: 0 }} />
              <p className="font-cinzel font-700 truncate" style={{ fontSize: '1.1rem', color: '#f4ecd8' }}>{entry.name}</p>
            </div>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', color: hColor, letterSpacing: '0.08em' }}>
              {HABITAT_LABEL[entry.habitat] ?? entry.habitat} · holding ×{entry.quantity}
            </span>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p className="font-karla font-700" style={{ fontSize: '1.5rem', color: '#fff', lineHeight: 1, ...TNUM }}>{priceEach.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#9a9488' }}>⟡</span></p>
            <p className="font-karla font-700 flex items-center justify-end gap-1 mt-1" style={{ fontSize: '0.72rem', color: up ? UP : DOWN, ...TNUM }}>
              <ChangeArrow up={up} />{fmtPct(pct)} <span className="font-karla font-400" style={{ color: '#6a6764' }}>{mode === 'normal' ? 'vs normal' : 'vs last tick'}</span>
            </p>
          </div>
        </div>

        {/* chart */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '0.6rem 0.5rem', marginBottom: 12 }}>
          <Sparkline data={allHistory} up={up} height={70} fill />
        </div>

        {/* stats */}
        <div className="flex items-center gap-3 mb-3" style={{ padding: '0 0.15rem' }}>
          {stat('Base', `${entry.sell_value.toLocaleString()} ⟡`, '#a0a09a')}
          {stat('24h High', Math.floor(entry.sell_value * histMax * fee).toLocaleString(), UP)}
          {stat('24h Low', Math.floor(entry.sell_value * histMin * fee).toLocaleString(), DOWN)}
          {stat('Mult', `${entry.multiplier.toFixed(2)}×`, '#9a9488')}
        </div>

        {/* qty controls */}
        <div className="flex items-center gap-2 mb-2">
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#7a7774' }}>Sell quantity</p>
          <input
            type="number" inputMode="numeric" min={1} max={entry.quantity}
            value={qtyStr}
            onChange={e => setQtyStr(e.target.value)}
            onBlur={() => setQtyStr(String(qty))}
            onFocus={e => e.target.select()}
            disabled={selling}
            className="font-karla font-700 ml-auto"
            style={{ width: 70, padding: '0.4rem 0.5rem', textAlign: 'center', background: 'rgba(4,7,12,0.7)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#f0ede8', fontSize: '0.85rem', outline: 'none', ...TNUM }}
          />
        </div>
        <div className="flex gap-2 mb-4">
          {chip('25%', Math.max(1, Math.floor(entry.quantity * 0.25)))}
          {chip('50%', Math.max(1, Math.floor(entry.quantity * 0.5)))}
          {chip('All', entry.quantity)}
        </div>

        {/* confirm */}
        <motion.button
          onClick={() => onSell(entry.fish_id, qty)}
          disabled={selling}
          whileTap={selling ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
          className="font-karla font-700 uppercase tracking-[0.08em] w-full"
          style={{
            padding: '0.85rem', borderRadius: 12,
            background: `linear-gradient(180deg, ${GOLD}33 0%, ${GOLD}1a 100%)`,
            border: `1px solid ${GOLD}80`, color: GOLD, fontSize: '0.85rem',
            opacity: selling ? 0.55 : 1, cursor: selling ? 'default' : 'pointer',
            boxShadow: `0 2px 14px ${GOLD}1f, inset 0 1px 0 rgba(255,255,255,0.08)`, ...TNUM,
          }}>
          {selling ? 'Selling…' : `Sell ${qty} · ${proceeds.toLocaleString()} ⟡`}
        </motion.button>
        <p className="font-karla font-400 text-center mt-2" style={{ fontSize: '0.6rem', color: '#5a5654' }}>
          {fee < 1 ? '3% market fee applied · instant payout' : 'No fee (Captain) · instant payout'}
        </p>
      </motion.div>
    </>
  )
}

export default function MarketClient({
  portfolio: initialPortfolio,
  allMarket,
  marketState,
  doubloons: initialDoubloons,
  isPremium,
  exchangeUnveil = false,
  exchangeOpen = false,
  openContracts: initialOpenContracts = 0,
  tourStep = null,
}: {
  /** Where the first voyage has got to, or null if it is not running. Doby
   *  sends a new captain here with their first fish; this is the only surface
   *  that knows whether they sold it. */
  tourStep?: number | null
  portfolio: MarketFishEntry[]
  allMarket: MarketFishEntry[]
  marketState: MarketState
  doubloons: number
  isPremium: boolean
  /** Fishing 100 is done and the Exchange has never been announced. Opens the
   *  page on that side once so the news is not left behind a tab. */
  exchangeUnveil?: boolean
  /** Fishing is at the cap, so the contracts board is reachable. */
  exchangeOpen?: boolean
  /** Contracts still running, for the Exchange door's sub-line. */
  openContracts?: number
}) {
  const [portfolio, setPortfolio] = useState(initialPortfolio)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  // The Exchange door's "N running" was read straight off the server prop, so
  // closing a position refreshed the board and left the door lying until the
  // page was reloaded. BoardClient reports the count off every load now, and
  // the prop only seeds it.
  const [openContracts, setOpenContracts] = useState(initialOpenContracts)
  // A server prop into useState needs a resync, or navigating back with a fresh
  // count would keep showing whatever this component was first mounted with.
  useEffect(() => { setOpenContracts(initialOpenContracts) }, [initialOpenContracts])
  const [selling, setSelling] = useState<number | null>(null)
  /**
   * WHERE THE FIRST VOYAGE IS, in this room.
   *
   *   'sell' — they were sent in to sell and have not yet.
   *   'out'  — they have. The only thing left to say is how to get back.
   *   null   — no voyage in progress, or it is done with this room.
   *
   * Held in state rather than read off the prop, so it moves the instant they
   * act rather than when the page next hears about it.
   */
  const [tourAt, setTourAt] = useState<'sell' | 'out' | null>(
    tourStep === SELL_STEP ? 'sell' : null)

  /**
   * THE SALE HAPPENED, BY WHATEVER ROUTE.
   *
   * One function, called from every path that can empty a hold, because the
   * first version hooked only the per-species Sell button — and a captain who
   * used SELL ALL, which is the obvious thing to do with a hold full of fish
   * and the one this page is built around, sold everything and advanced
   * nothing. They then sailed back to a tour still asking them to sell, with
   * an empty hold, which can only be answered by going and catching another
   * fish. That is the loop, and it was mine.
   */
  /**
   * ALREADY SOLD, BY SOME ROUTE NOBODY HOOKED.
   *
   * If the voyage is on the sell beat and the hold is empty, the sale has
   * happened — the beat is asking for something that cannot be done and the
   * captain would be sent back out to catch another fish to satisfy it. This
   * is the net under every future path into this room that forgets to say so,
   * and it also unsticks anybody standing in that loop right now.
   */
  useEffect(() => {
    if (tourAt === 'sell' && portfolio.length === 0) {
      setTourAt('out')
      void setSeaTourStep(SELL_STEP + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourAt, portfolio.length])

  // The control being talked about, lit up. Same handle-and-flash the sea tour
  // uses; retried briefly because a panel can mount after the card does.
  useEffect(() => {
    const want = tourAt === 'sell' ? 'sell-all' : tourAt === 'out' ? 'market-back' : null
    const clear = () => document.querySelectorAll('.coach-flash')
      .forEach(el => el.classList.remove('coach-flash', 'coach-flash-gold'))
    clear()
    if (!want) return
    let tries = 0
    const find = () => {
      const el = document.querySelector(`[data-coach="${want}"]`)
      if (el) { el.classList.add('coach-flash', 'coach-flash-gold'); return }
      if (++tries < 20) window.setTimeout(find, 120)
    }
    find()
    return clear
  }, [tourAt])

  const sellBeatDone = useCallback(() => {
    setTourAt(now => {
      if (now !== 'sell') return now
      void setSeaTourStep(SELL_STEP + 1)
      return 'out'
    })
  }, [])
  /**
   * ── SIMPLE OR ADVANCED ──────────────────────────────────────────────────
   *
   * The Hold side grew into a trading terminal: a mood ticker, a colour-mode
   * toggle explaining what red and green mean, sparklines per row, a movers
   * board and a sortable price table of every fish in the game. Every piece
   * earns its place for somebody reading the market. None of it is what the
   * other ninety percent came here to do, which is turn a full hold into coin
   * and get back on the water.
   *
   * So the terminal is still all there, behind a switch, and the default is the
   * short version: what you are carrying, what it pays, and one button that
   * takes the lot.
   *
   * DEFAULTS TO SIMPLE, INCLUDING FOR PEOPLE WHO ALREADY USE THE FULL VIEW.
   * The alternative is remembering who had seen the old one and grandfathering
   * them in, which means a flag, a migration, and two behaviours to reason
   * about forever — to save one tap, once, for the players most able to find a
   * toggle. The switch is at the top of the page and it is remembered.
   *
   * ON THE DEVICE, not the profile. Same call as the sea's sound switches: this
   * is how somebody wants to read a screen on the thing they are holding, and a
   * phone on a bus and a desk at home are allowed different answers.
   */
  const [advancedPref, setAdvanced] = useState(false)
  useEffect(() => {
    try { setAdvanced(window.localStorage.getItem('marketAdvanced') === 'true') } catch { /* private mode */ }
  }, [])
  /**
   * THE TUTORIAL GETS THE BARE ROOM, whatever the preference says.
   *
   * Kat walks a brand new captain in here holding one fish and says "Sell all
   * takes the lot in one go". Putting a mood ticker, a red/green legend and a
   * price table of every fish in the game between that sentence and the button
   * is how a guided tour loses somebody — and the switch itself is worse,
   * because it is a control offering to make the room MORE complicated at the
   * exact moment the room is trying to teach one thing.
   *
   * So during the first voyage the market is simple and the switch is not
   * there. It is a suppression rather than a write: nothing touches the stored
   * preference, so somebody who had turned Advanced on and later reset their
   * tour gets their terminal back the moment the tour is done.
   */
  const inTour = tourAt !== null
  const advanced = advancedPref && !inTour
  const flipAdvanced = useCallback(() => {
    setAdvanced(v => {
      const next = !v
      try { window.localStorage.setItem('marketAdvanced', String(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  const [toast, setToast] = useState<string | null>(null)
  const [tradeFish, setTradeFish] = useState<MarketFishEntry | null>(null)
  const [mounted, setMounted] = useState(false)
  const [pendingSales, setPendingSales] = useState<{ id: string; amount: number; fishCount: number; reason: string; settlesAt: string }[]>([])
  const [pendingNow, setPendingNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    function onChange(e: Event) {
      const list = (e as CustomEvent<{ id: string; amount: number; fishCount: number; reason: string; settlesAt: string }[]>).detail ?? []
      setPendingSales(list)
    }
    window.addEventListener('pending-sales-changed', onChange)
    window.dispatchEvent(new Event('pending-sales-may-have-changed'))
    return () => window.removeEventListener('pending-sales-changed', onChange)
  }, [])

  useEffect(() => {
    if (pendingSales.length === 0) return
    const t = setInterval(() => setPendingNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [pendingSales.length])

  const countdown = useCountdown(marketState.next_update_at)
  const mood = MOOD_CONFIG[marketState.mood] ?? MOOD_CONFIG.calm
  const fee = isPremium ? 1.0 : 0.97

  // How the red/green markers are decided (persisted per device). Defaults to
  // 'normal' — most sellers care whether a price beats the fish's usual value,
  // not the last tick's wiggle.
  const [colorMode, setColorMode] = useState<MarketMode>('normal')
  useEffect(() => {
    const s = localStorage.getItem('market_color_mode')
    if (s === 'normal' || s === 'movement') setColorMode(s)
  }, [])
  const pickColorMode = (m: MarketMode) => {
    setColorMode(m)
    try { localStorage.setItem('market_color_mode', m) } catch { /* private mode */ }
  }

  // Hero totals — colored by the same toggle. 'movement' = vs last tick; 'normal'
  // = vs what the whole hold is worth at NORMAL prices (every multiplier at 1.0).
  const totalMarketValue = portfolio.reduce((s, e) => s + Math.floor(e.sell_value * e.multiplier * fee) * e.quantity, 0)
  const prevValue = portfolio.reduce((s, e) => s + Math.floor(e.sell_value * e.prev_multiplier * fee) * e.quantity, 0)
  const normalValue = portfolio.reduce((s, e) => s + Math.floor(e.sell_value * fee) * e.quantity, 0)
  const heroBase = colorMode === 'normal' ? normalValue : prevValue
  const heroDelta = totalMarketValue - heroBase
  const heroPct = pctOf(totalMarketValue, heroBase)
  const heroUp = heroDelta >= 0
  const totalCount = portfolio.reduce((s, e) => s + e.quantity, 0)
  const heroCurve = useMemo(() => [...portfolioCurve(portfolio, fee), totalMarketValue], [portfolio, fee, totalMarketValue])

  // Sea Index — average multiplier across all discovered species.
  const seaIndex = mean(allMarket.map(e => e.multiplier))
  const seaPrev = mean(allMarket.map(e => e.prev_multiplier))
  const seaPct = pctOf(seaIndex, seaPrev)
  const seaUp = seaPct >= 0

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function handleSell(fishId: number, qty: number) {
    if (selling !== null) return
    setSelling(fishId)
    // Optimistic: the stack shrinks/leaves the instant you commit (snapshot
    // restored on error); the payout toast + purse tick wait for the server's
    // real number (market price is authoritative there).
    const snapshot = portfolio
    setTradeFish(null)
    setPortfolio(prev =>
      prev.map(e => e.fish_id === fishId ? { ...e, quantity: e.quantity - qty } : e)
          .filter(e => e.quantity > 0)
    )
    startTransition(async () => {
      const res = await marketSellFish(fishId, qty)
      setSelling(null)
      if ('error' in res) { showToast(res.error); setPortfolio(snapshot); return }
      setDoubloons(res.doubloons)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      hapticReward()
      showToast(`+${res.earned.toLocaleString()} ⟡`)
      sellBeatDone()
    })
  }

  const [browseExpanded, setBrowseExpanded] = useState(false)
  const [liquidateConfirm, setLiquidateConfirm] = useState(false)
  const [liquidating, setLiquidating] = useState(false)
  // FULL MARKET PRICE. No 90% haircut and no hour: getting to this building is
  // the cost now — see sellEntireHold. Same rate the per-species rows pay, so
  // selling one at a time can never beat selling the lot.
  const liquidateValue = portfolio.reduce((s, e) => s + Math.floor(e.sell_value * e.multiplier * fee) * e.quantity, 0)

  function handleLiquidate() {
    if (liquidating) return
    setLiquidating(true)
    setLiquidateConfirm(false)
    startTransition(async () => {
      const res = await sellEntireHold()
      setLiquidating(false)
      if ('error' in res) { showToast(res.error); return }
      setDoubloons(res.doubloons)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      window.dispatchEvent(new Event('pending-sales-may-have-changed'))
      hapticReward()
      showToast(`+${res.earned.toLocaleString()} ⟡`)
      setPortfolio([])
      sellBeatDone()
    })
  }

  // ── Browse: sort + filter ──
  const [sortKey, setSortKey] = useState<'value' | 'change' | 'name'>('value')
  const [habitatFilter, setHabitatFilter] = useState<string | null>(null)
  const router = useRouter()
  // The Hold is your own fish; the Exchange is contracts on the board. They
  // share a mood and nothing else, so they are two screens rather than one
  // long one.
  const [side, setSide] = useState<'hold' | 'exchange'>(exchangeUnveil ? 'exchange' : 'hold')
  const ownedIds = new Set(portfolio.map(e => e.fish_id))
  const browseAll = useMemo(() => {
    let list = allMarket.filter(e => !ownedIds.has(e.fish_id))
    if (habitatFilter) list = list.filter(e => e.habitat === habitatFilter)
    const sorted = [...list]
    if (sortKey === 'value') sorted.sort((a, b) => b.sell_value * b.multiplier - a.sell_value * a.multiplier)
    else if (sortKey === 'change') sorted.sort((a, b) => marketSignal(b, colorMode).pct - marketSignal(a, colorMode).pct)
    else sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [allMarket, ownedIds, habitatFilter, sortKey, colorMode])
  const browseList = browseExpanded ? browseAll : browseAll.slice(0, 10)
  const habitatsPresent = useMemo(() => [...new Set(allMarket.map(e => e.habitat))], [allMarket])

  // Top movers across all discovered species.
  const movers = useMemo(() => {
    const withPct = allMarket.map(e => ({ e, p: pctOf(e.multiplier, e.prev_multiplier) }))
    const riser = withPct.reduce<{ e: MarketFishEntry; p: number } | null>((best, c) => (!best || c.p > best.p ? c : best), null)
    const faller = withPct.reduce<{ e: MarketFishEntry; p: number } | null>((worst, c) => (!worst || c.p < worst.p ? c : worst), null)
    return { riser: riser && riser.p > 0.05 ? riser.e : null, faller: faller && faller.p < -0.05 ? faller.e : null }
  }, [allMarket])

  return (
    <MarketModeCtx.Provider value={colorMode}>
    {/* KAT FOLLOWED THEM THROUGH THE DOOR.
        Two lines, and the second one matters as much as the first: a captain
        who has sold their catch is standing in a shop with no idea that the
        way back to the sea is a Back button at the top of it. Arriving to no
        instruction is where a guided tour loses somebody; so is finishing to
        none. */}
    <GuideCoach
      show={tourAt === 'sell'}
      portrait={GUIDES.kat.portrait}
      speaker={GUIDES.kat.speaker}
      text="Everything you caught is here. *Sell all* takes the lot in one go."
      accent={SEA_ACCENT}
      placement="bottom"
    />
    <GuideCoach
      show={tourAt === 'out'}
      portrait={GUIDES.doby.portrait}
      speaker={GUIDES.doby.speaker}
      text="That is coin in your pocket. *Back* at the top takes you to the water."
      accent={SEA_ACCENT}
      placement="bottom"
      onClose={() => setTourAt(null)}
    />
    <main className="min-h-screen pb-24 sm:pb-0">
      {/* THE HARBOURMASTER'S BOARD.
          A lantern over the top of the page, faint ledger ruling down it, and a
          warm ink ground instead of the cold slate the panels were floating on.

          All three are CSS gradients: no image to load, nothing animated, and
          it composites once. The ruling sits at ~1.5% white every 30px, which
          is under the threshold you would call a stripe and over the one where
          a surface reads as flat nothing. That gap is the whole difference
          between "a place" and "a settings screen". */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `
          radial-gradient(120% 55% at 50% -8%, rgba(196,169,106,0.11) 0%, transparent 62%),
          repeating-linear-gradient(180deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 30px),
          linear-gradient(180deg, #0c0e13 0%, #090a0e 100%)
        `,
      }} />
      <div className="page-col pt-5 flex flex-col gap-4 pb-10" style={{ position: 'relative', zIndex: 1 }}>

        {/* The market had no header and so no way out but the tab bar, which
            got worse once the Fishing hub started sending players here. Same
            ShopHeader the Tackle Shop uses, and back the same way: the market
            is reached from the fishing hub, the tavern ticker AND mid-cast
            from the fishing screen, so it returns you where you came from
            rather than picking one of the three. */}
        <ShopHeader title="Fish Market" backLabel="Back" coach="market-back" onBack={() => router.back()}
          /* RANKS OPPOSITE BACK, in the slot the header already keeps for it.
             It sat above the board before, taking a row of its own and pushing
             the market down. Only on the Exchange side: the Hold sells fish and
             has no ladder to be on. */
          badge={side === 'exchange' ? (
            <LeaderboardModal
              boards={['exchangeWeek', 'exchangeNet']}
              title="Top Traders"
              label="Ranks"
              triggerStyle={{
                background: 'rgba(56,189,248,0.10)',
                border: '1px solid rgba(56,189,248,0.42)',
                color: '#7dd3fc', boxShadow: 'none',
                fontSize: '0.56rem', height: 24, padding: '0 0.62rem', borderRadius: 20,
              }}
            />
          ) : undefined} />

        {/* ── The two doors ── */}
        <div style={{ display: 'flex', gap: 7, position: 'relative' }}>
          <MarketDoor
            active={side === 'hold'}
            accent={GOLD}
            title="The Hold"
            mark={c => <HoldMark color={c} />}
            sub={portfolio.length === 0
              ? 'Nothing aboard'
              : `${totalMarketValue.toLocaleString()} ⟡ aboard`}
            subAccent={portfolio.length > 0}
            onClick={() => setSide('hold')}
          />
          <MarketDoor
            active={side === 'exchange'}
            accent="#38bdf8"
            title="Exchange"
            mark={c => <ExchangeMark color={c} />}
            sub={!exchangeOpen
              ? 'Opens at Fishing 100'
              : exchangeUnveil ? 'Open to you now'
              : openContracts > 0 ? `${openContracts} running`
              : 'Take a position'}
            subAccent={exchangeUnveil || openContracts > 0}
            onClick={() => setSide('exchange')}
          />
          {exchangeUnveil && (
            <span aria-label="newly opened" style={{
              position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: 999,
              background: '#38bdf8', boxShadow: '0 0 8px rgba(56,189,248,0.9)', pointerEvents: 'none',
            }} />
          )}
        </div>

        {side === 'exchange' && <BoardClient onDoubloons={setDoubloons} onOpenContracts={setOpenContracts} />}

        {side === 'hold' && <>

        {/* ── THE SWITCH ──────────────────────────────────────────────
            Top of the room, before anything it changes, so the answer to "why
            can I not see the prices" is the first thing on screen rather than
            something to hunt for. One control with the state written on it, not
            a pair of tabs: there is a plain version and a full version, and
            "Advanced" is the word for the second one. */}
        {!inTour && (
        <button type="button" onClick={flipAdvanced}
          className="tap"
          style={{
            alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 8,
            padding: '0.34rem 0.6rem', borderRadius: 999,
            background: advanced ? 'rgba(240,192,64,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${advanced ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.13)'}`,
            cursor: 'pointer',
          }}>
          <span className="font-karla font-700 uppercase" style={{
            fontSize: '0.56rem', letterSpacing: '0.14em',
            color: advanced ? GOLD : 'rgba(190,212,228,0.6)',
          }}>Advanced</span>
          <span aria-hidden style={{
            position: 'relative', width: 30, height: 17, borderRadius: 999,
            background: advanced ? 'rgba(240,192,64,0.3)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${advanced ? 'rgba(240,192,64,0.65)' : 'rgba(255,255,255,0.18)'}`,
            transition: 'background 0.16s, border-color 0.16s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: advanced ? 14 : 2,
              width: 11, height: 11, borderRadius: '50%',
              background: advanced ? GOLD : 'rgba(200,214,224,0.55)',
              transition: 'left 0.16s ease, background 0.16s',
            }} />
          </span>
        </button>
        )}

        {/* ── THE TERMINAL, BEHIND THE SWITCH ─────────────────────────
            The mood ticker and the red/green legend are for reading the
            market. Somebody emptying a hold is not reading the market,
            and these were the first two things they met. */}
        {advanced && (<>
        {/* ── Market status ticker ── */}
        <div style={{
          background: 'rgba(11,13,18,0.96)', border: `1px solid ${mood.border}`,
          borderRadius: 12, padding: '0.7rem 0.9rem',
          display: 'flex', alignItems: 'center', gap: '0.7rem',
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: mood.bg, border: `1px solid ${mood.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MoodIcon mood={marketState.mood} color={mood.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700 truncate" style={{ fontSize: '0.82rem', color: mood.color }}>{mood.label}</p>
            <div className="flex items-center gap-1.5">
              <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#7a7774' }}>Sea Index</span>
              <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#c0bdb8', ...TNUM }}>{seaIndex.toFixed(2)}×</span>
              <span className="font-karla font-700 flex items-center gap-0.5" style={{ fontSize: '0.6rem', color: seaUp ? UP : DOWN, ...TNUM }}>
                <ChangeArrow up={seaUp} />{fmtPct(seaPct)}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p className="font-karla font-500" style={{ fontSize: '0.54rem', color: '#6a6764' }}>Next update</p>
            <p className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', ...TNUM }}>{countdown}</p>
          </div>
        </div>

        {/* ── Ticker color mode ── prominent so sellers know what red/green means. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -4 }}>
          <div className="flex items-center justify-between">
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: '#9a9488' }}>Ticker Colors</span>
            <span className="font-karla font-600 flex items-center gap-1" style={{ fontSize: '0.58rem', color: '#8a857c' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: UP, flexShrink: 0 }} />
              {colorMode === 'normal' ? 'above normal price' : 'up since last tick'}
            </span>
          </div>
          <div className="flex w-full" style={{ borderRadius: 11, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)' }}>
            {([['normal', 'vs Normal'], ['movement', 'Recent']] as const).map(([m, lbl], i) => {
              const active = colorMode === m
              return (
                <button key={m} onClick={() => pickColorMode(m)} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
                  style={{ flex: 1, fontSize: '0.74rem', padding: '0.62rem 0.5rem', borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.14)',
                    background: active ? 'rgba(240,192,64,0.2)' : 'rgba(28,32,40,0.92)', color: active ? GOLD : '#9a958c',
                    cursor: 'pointer', boxShadow: active ? 'inset 0 0 0 1px rgba(240,192,64,0.45)' : 'none', transition: 'background 0.12s, color 0.12s' }}>
                  {lbl}
                </button>
              )
            })}
          </div>
        </div>

        </>)}
        {/* ── Portfolio hero ── */}
        {portfolio.length > 0 && (
          <div style={{
            background: 'linear-gradient(165deg, rgba(60,48,16,0.92) 0%, rgba(11,13,18,0.97) 55%)',
            border: '1px solid rgba(240,192,64,0.22)', borderTop: '1px solid rgba(240,192,64,0.45)',
            borderRadius: 16, padding: '1.1rem 1.15rem 0.95rem', overflow: 'hidden',
          }}>
            <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: '#b8a06a' }}>Hold Value</p>
            <p className="font-karla font-700" style={{ fontSize: '2.4rem', color: '#fff', lineHeight: 1.05, ...TNUM }}>
              {totalMarketValue.toLocaleString()} <span style={{ fontSize: '1.1rem', color: '#9a9488' }}>⟡</span>
            </p>
            {/* THE DELTA AND THE CURVE ARE THE MARKET TALKING. In simple the
                hero is one number and what it is made of — a captain who has
                just filled a hold wants "this is worth 4,200", not a comparison
                against a baseline nobody explained. */}
            {advanced && (<>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-karla font-700 flex items-center gap-1" style={{ fontSize: '0.82rem', color: heroUp ? UP : DOWN, ...TNUM }}>
                <ChangeArrow up={heroUp} />{heroUp ? '+' : ''}{heroDelta.toLocaleString()} ⟡ ({fmtPct(heroPct)})
              </span>
              <span className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#6a6764' }}>{colorMode === 'normal' ? 'vs normal value' : 'vs last tick'}</span>
            </div>
            <div style={{ margin: '0.6rem -0.3rem 0.3rem' }}>
              <Sparkline data={heroCurve} up={heroUp} height={56} fill />
            </div>
            </>)}
            <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#9a9488', paddingTop: '0.35rem', ...TNUM }}>
              {totalCount} fish · {portfolio.length} species
            </p>

            {/* ── SELL ALL ────────────────────────────────────────────────
                THE THING ALMOST EVERYONE CAME HERE TO DO, and it was a pill in
                the bottom corner set in 0.56rem — nine pixels, the smallest
                type on the page — sharing a line with the species count. The
                per-species rows below are the SPECIALIST lane, for when you are
                working the multipliers, and they were louder than the button
                that empties the hold.

                It matters more than it did. The market pays the full price and
                the buyers out at sea pay 74 to 86 percent, so sailing home IS
                the reward, and this button is the thing that collects it.

                Still two steps, because it sells everything at once. What
                changed is that the first step is now the largest thing in the
                panel and the second names the number twice. */}
            <div style={{ marginTop: '0.75rem' }}>
              {!liquidateConfirm ? (
                <>
                  <button onClick={() => setLiquidateConfirm(true)} disabled={liquidating}
                    data-coach="sell-all"
                    className="font-cinzel font-700 tap"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'baseline', justifyContent: 'center',
                      gap: 10, flexWrap: 'wrap',
                      padding: '0.85rem 1rem', borderRadius: 13,
                      fontSize: '1.05rem', lineHeight: 1.2, color: '#1a1508',
                      // The one SOLID control on the page. Every other gold here
                      // is a translucent wash on dark, which is right for a row
                      // in a list and wrong for the action the page exists to
                      // offer. House rule says no solid gold FILLS on panels;
                      // this is a button, and a primary button that looks like
                      // every secondary one is not a primary button.
                      background: 'linear-gradient(180deg, #f5cf6a 0%, #e0a82e 100%)',
                      border: '1px solid rgba(255,232,170,0.65)',
                      boxShadow: '0 6px 18px rgba(224,168,46,0.28)',
                      cursor: 'pointer',
                    }}>
                    <span>Sell all {totalCount} fish</span>
                    <span className="font-700" style={{ ...TNUM }}>{liquidateValue.toLocaleString()} ⟡</span>
                  </button>
                  <p className="font-karla font-600" style={{
                    fontSize: '0.68rem', color: '#9a9488', textAlign: 'center', marginTop: 6,
                  }}>
                    {isPremium
                      ? 'Full market price, paid straight away.'
                      : 'Paid straight away, less a 3% fee. Captains pay none.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-karla font-600 mb-2" style={{ fontSize: '0.78rem', color: '#cfc9bd', textAlign: 'center' }}>
                    Sell all {totalCount} fish for <span className="font-700" style={{ color: '#f0c040', ...TNUM }}>{liquidateValue.toLocaleString()} ⟡</span>? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setLiquidateConfirm(false)} disabled={liquidating}
                      className="font-karla font-600 flex-1 tap"
                      style={{ fontSize: '0.8rem', padding: '0.8rem', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: '#9a9488', cursor: 'pointer' }}>
                      Keep fishing
                    </button>
                    <button onClick={handleLiquidate} disabled={liquidating}
                      className="font-cinzel font-700 tap"
                      style={{
                        flex: 1.6, fontSize: '0.95rem', padding: '0.8rem', borderRadius: 12,
                        color: '#1a1508',
                        background: 'linear-gradient(180deg, #f5cf6a 0%, #e0a82e 100%)',
                        border: '1px solid rgba(255,232,170,0.65)',
                        opacity: liquidating ? 0.6 : 1, cursor: liquidating ? 'default' : 'pointer', ...TNUM,
                      }}>
                      {liquidating ? 'Selling…' : `Sell · ${liquidateValue.toLocaleString()} ⟡`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Pending Sales ── */}
        {pendingSales.length > 0 && (
          <div>
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1rem', letterSpacing: '0.02em', color: '#bda05a' }}>Pending Sales</p>
            <div style={{ background: 'rgba(34,27,10,0.95)', border: '1px solid rgba(240,192,64,0.38)', borderRadius: 12, padding: '0.6rem 0.85rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingSales.map(p => {
                const minutes = Math.max(0, Math.ceil((new Date(p.settlesAt).getTime() - pendingNow) / 60_000))
                const timeLabel = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
                return (
                  <div key={p.id} className="flex items-center justify-between" style={{ padding: '0.25rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bda05a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                        <path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" />
                      </svg>
                      <div style={{ minWidth: 0 }}>
                        <p className="font-karla font-600 truncate" style={{ fontSize: '0.74rem', color: '#f0ede8', lineHeight: 1.2 }}>{p.reason}</p>
                        <p className="font-karla font-300" style={{ fontSize: '0.6rem', color: '#8a7a4a' }}>settles in {timeLabel}</p>
                      </div>
                    </div>
                    <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: GOLD, flexShrink: 0, marginLeft: 12, ...TNUM }}>+{p.amount.toLocaleString()} ⟡</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Holdings ── */}
        <div>
          <p className="font-cinzel font-700 mb-1" style={{ fontSize: '1rem', letterSpacing: '0.02em', color: '#f0e6d2' }}>Holdings</p>
          {portfolio.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'rgba(11,13,18,0.96)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#6a6764', marginBottom: '0.5rem' }}>No fish in hold</p>
              <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#4a4845', marginBottom: '1.25rem' }}>Head to the docks to catch something worth selling.</p>
              <Link href="/sea" className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{ fontSize: '0.7rem', padding: '0.6rem 1.4rem', borderRadius: '2rem', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', textDecoration: 'none' }}>
                Go Fishing
              </Link>
            </div>
          ) : (
            <div style={{ background: 'rgba(11,13,18,0.96)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '0 0.85rem' }}>
              {portfolio.map(entry => (
                // Swipe-left to sell the whole stack at market price — the shared
                // crew-card gesture. Coexists with the inline Sell button and the
                // trade sheet (tap the row) for custom quantities. The sliding row
                // gets an opaque bg so the gold circle never bleeds through at rest.
                <SwipeAction key={entry.fish_id} enabled={selling === null} side="left" label={`Sell all ${entry.name}`}
                  icon={<span className="font-cinzel font-800" style={{ fontSize: '1.15rem', lineHeight: 1 }}>⟡</span>}
                  gradient="linear-gradient(180deg, #f0c95c 0%, #cf9a2c 100%)" textColor="#2a1d04" glow="rgba(240,192,64,0.9)"
                  onAction={() => handleSell(entry.fish_id, entry.quantity)}>
                  <div style={{ background: '#0b0d12' }}>
                    <HoldingRow
                      entry={entry}
                      fee={fee}
                      onOpen={setTradeFish}
                      onQuickSell={(e) => handleSell(e.fish_id, e.quantity)}
                      selling={selling !== null}
                    simple={!advanced}
                    />
                  </div>
                </SwipeAction>
              ))}
            </div>
          )}
        </div>

        {/* ── THE REST OF THE TERMINAL ───────────────────────────────
            Today's movers and the price table for every fish in the game.
            Genuinely useful if you are deciding what to go and catch;
            pure noise between a full hold and a Sell all button. */}
        {advanced && (<>
        {/* ── Today's Movers ── */}
        {(movers.riser || movers.faller) && (
          <div>
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1rem', letterSpacing: '0.02em', color: '#f0e6d2' }}>Today&apos;s Movers</p>
            <div className="flex gap-2.5">
              {movers.riser && <MoverCard entry={movers.riser} label="Top Riser" labelColor={UP} />}
              {movers.faller && <MoverCard entry={movers.faller} label="Top Faller" labelColor={DOWN} />}
            </div>
          </div>
        )}

        {/* ── Market Prices (browse) ── */}
        {allMarket.filter(e => !ownedIds.has(e.fish_id)).length > 0 && (
          <div>
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1rem', letterSpacing: '0.02em', color: '#f0e6d2' }}>Market Prices</p>

            {/* ONE ROW, TWO CONTROLS. This was a segmented sort sitting alone
                in a wrapping flex row, then a second row of up to six habitat
                chips under it: nine controls in two visual languages, above a
                list of ten. The zone is a menu now, which is what a
                one-of-many choice wants to be and which cannot wrap to a
                second line however many zones open up. */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex" style={{ flex: 1, minWidth: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                {([['value', 'Value'], ['change', 'Change'], ['name', 'A–Z']] as const).map(([k, lbl], i) => (
                  <button key={k} onClick={() => setSortKey(k)} className="font-karla font-700 uppercase tracking-[0.06em]"
                    style={{ flex: 1, fontSize: '0.58rem', padding: '0.4rem 0.3rem', borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.18)', background: sortKey === k ? 'rgba(240,192,64,0.22)' : 'rgba(28,32,40,0.95)', color: sortKey === k ? GOLD : '#c4bfb6', cursor: 'pointer' }}>
                    {lbl}
                  </button>
                ))}
              </div>
              {habitatsPresent.length > 1 && (
                <select
                  value={habitatFilter ?? ''}
                  onChange={e => setHabitatFilter(e.target.value || null)}
                  aria-label="Filter by zone"
                  className="font-karla font-700 uppercase tracking-[0.06em]"
                  style={{
                    flexShrink: 0, maxWidth: '46%',
                    fontSize: '0.58rem', padding: '0.4rem 1.5rem 0.4rem 0.6rem',
                    borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
                    background: `rgba(28,32,40,0.95) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c4bfb6' stroke-width='3' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>") no-repeat right 0.45rem center/9px 9px`,
                    color: habitatFilter ? (HABITAT_COLOR[habitatFilter] ?? '#c4bfb6') : '#c4bfb6',
                    appearance: 'none', WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">All zones</option>
                  {habitatsPresent.map(h => (
                    <option key={h} value={h}>{HABITAT_LABEL[h] ?? h}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ background: 'rgba(11,13,18,0.96)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '0 0.75rem' }}>
              {browseList.length === 0
                ? <p className="font-karla font-400 text-center" style={{ fontSize: '0.72rem', color: '#6a6764', padding: '1.25rem 0' }}>No species match.</p>
                : browseList.map(entry => <BrowseRow key={entry.fish_id} entry={entry} />)}
            </div>
            {browseAll.length > 10 && (
              <button onClick={() => setBrowseExpanded(v => !v)} className="font-karla font-600 w-full mt-2"
                style={{ fontSize: '0.7rem', padding: '0.6rem', borderRadius: 10, background: 'rgba(11,13,18,0.96)', border: '1px solid rgba(255,255,255,0.14)', color: '#7a7774', cursor: 'pointer' }}>
                {browseExpanded ? 'Show less' : `Show all ${browseAll.length} species`}
              </button>
            )}
          </div>
        )}

        </>)}
        </>}

        {/* Wallet — outside the Hold fragment on purpose: your purse is your
            purse on both sides of the market. */}
        <div style={{ textAlign: 'center', paddingTop: 4 }}>
          <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Wallet</p>
          <p className="font-karla font-700" style={{ fontSize: '1.2rem', color: GOLD, ...TNUM }}>{doubloons.toLocaleString()} ⟡</p>
        </div>
      </div>

      {/* Trade sheet */}
      {mounted && createPortal(
        <AnimatePresence>
          {tradeFish && (
            <TradeSheet
              key={tradeFish.fish_id}
              entry={tradeFish}
              fee={fee}
              selling={selling === tradeFish.fish_id}
              onSell={handleSell}
              onClose={() => setTradeFish(null)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#1c2030', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '2rem', padding: '0.5rem 1.25rem', pointerEvents: 'none', zIndex: 70 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0ede8', whiteSpace: 'nowrap', ...TNUM }}>{toast}</p>
        </div>
      )}
    </main>
    </MarketModeCtx.Provider>
  )
}


function MoodIcon({ mood, color }: { mood: string; color: string }) {
  if (mood === 'kraken') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8 2 4 5 4 9c0 2 1 4 3 5l-1 4h12l-1-4c2-1 3-3 3-5 0-4-4-7-8-7z"/>
        <path d="M8 14c-1 2-2 3-2 5M16 14c1 2 2 3 2 5M10 19v3M14 19v3"/>
      </svg>
    )
  }
  if (mood === 'storm') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
        <polyline points="13 11 9 17 15 17 11 23"/>
      </svg>
    )
  }
  if (mood === 'tide_rising') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 11 12 6 7 11"/>
        <polyline points="17 18 12 13 7 18"/>
      </svg>
    )
  }
  if (mood === 'bounty_season') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 7v1.5M12 15.5V17M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.6 2.5 1.8c0 2.4-5 2-5 4.4C9.5 15.4 10.6 16 12 16s2.5-.5 2.5-1.7"/>
      </svg>
    )
  }
  if (mood === 'low_tide') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 6 12 11 7 6"/>
        <polyline points="17 13 12 18 7 13"/>
      </svg>
    )
  }
  if (mood === 'cursed_waters') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="5"/>
        <path d="M9 8h.01M15 8h.01"/>
        <path d="M9 11s1 2 3 2 3-2 3-2"/>
        <path d="M12 13v8M8 17l4 4 4-4"/>
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-6 10-6s8 2 10 6c-2 4-6 6-10 6S4 16 2 12z"/>
      <circle cx="12" cy="12" r="2.5"/>
    </svg>
  )
}
