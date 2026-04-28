'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { marketSellFish } from './actions'
import type { MarketFishEntry, MarketState } from './page'

const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#38bdf8',
  open_waters: '#34d399',
  deep:        '#818cf8',
  abyss:       '#f87171',
}

const RARITY_COLOR: Record<number, string> = {
  1: '#9ca3af',
  2: '#34d399',
  3: '#60a5fa',
  4: '#c084fc',
  5: '#fb923c',
}

const MOOD_CONFIG = {
  calm:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.2)', label: 'Calm Market',  desc: 'Prices stable. Low volatility.' },
  storm:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)',  label: 'Storm Warning', desc: 'Choppy prices. Higher swings expected.' },
  kraken: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',   label: 'Kraken Surge', desc: 'Extreme volatility. Anything can happen.' },
}

function Sparkline({ history, current, up }: { history: number[]; current: number; up: boolean }) {
  const data = [...history, current]
  if (data.length < 2) {
    return <div style={{ height: 36, flex: 1 }} />
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 0.001
  const W = 100
  const H = 36
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = up ? '#4ade80' : '#f87171'
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ flex: 1, display: 'block' }}
    >
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function useCountdown(targetIso: string) {
  const getSeconds = useCallback(() => {
    const diff = Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000))
    return diff
  }, [targetIso])

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

function FishCard({
  entry,
  onSell,
  selling,
}: {
  entry: MarketFishEntry
  onSell: (fishId: number, qty: number) => void
  selling: boolean
}) {
  const pctChange = entry.prev_multiplier > 0
    ? ((entry.multiplier - entry.prev_multiplier) / entry.prev_multiplier) * 100
    : 0
  const up = pctChange >= 0
  const pctStr = `${up ? '+' : ''}${pctChange.toFixed(1)}%`

  const priceEach = Math.floor(entry.sell_value * entry.multiplier * 0.97)
  const priceAll  = priceEach * entry.quantity

  const allHistory = [...entry.history, entry.multiplier]
  const histMax = allHistory.length > 0 ? Math.max(...allHistory) : entry.multiplier
  const histMin = allHistory.length > 0 ? Math.min(...allHistory) : entry.multiplier

  const hColor = HABITAT_COLOR[entry.habitat] ?? '#888'
  const rColor = RARITY_COLOR[entry.bite_rarity] ?? '#9ca3af'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
    }}>
      {/* Row 1: name + meta */}
      <div className="flex items-center gap-2">
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: rColor, flexShrink: 0 }} />
        <p className="font-cinzel font-700 flex-1 truncate" style={{ fontSize: '0.85rem', color: '#f0ede8' }}>
          {entry.name}
        </p>
        <span className="font-karla font-700"
          style={{ fontSize: '0.5rem', color: hColor, background: `${hColor}18`, border: `1px solid ${hColor}28`,
            padding: '0.1rem 0.45rem', borderRadius: '2rem', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {entry.habitat.replace('_', ' ')}
        </span>
        <span className="font-karla font-700"
          style={{ fontSize: '0.52rem', color: '#f0ede8', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            padding: '0.1rem 0.45rem', borderRadius: '2rem', flexShrink: 0 }}>
          ×{entry.quantity}
        </span>
      </div>

      {/* Row 2: price hero + sparkline */}
      <div className="flex items-end gap-3">
        <div style={{ flexShrink: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8', lineHeight: 1 }}>
            {priceEach.toLocaleString()}{' '}
            <span style={{ fontSize: '0.75rem', color: '#6a6764' }}>⟡</span>
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span style={{ fontSize: '0.7rem', color: up ? '#4ade80' : '#f87171', fontFamily: 'var(--font-karla)', fontWeight: 600 }}>
              {up ? '▲' : '▼'} {pctStr}
            </span>
            <span className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845' }}>vs prev</span>
          </div>
        </div>
        <Sparkline history={entry.history} current={entry.multiplier} up={up} />
      </div>

      {/* Row 3: stats */}
      <div className="flex items-center gap-3">
        <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: '#4a4845' }}>
          Base <span style={{ color: '#6a6764' }}>{entry.sell_value.toLocaleString()} ⟡</span>
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: '#4a4845' }}>
          24h H <span style={{ color: '#4ade80' }}>{Math.floor(entry.sell_value * histMax * 0.97).toLocaleString()}</span>
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: '#4a4845' }}>
          L <span style={{ color: '#f87171' }}>{Math.floor(entry.sell_value * histMin * 0.97).toLocaleString()}</span>
        </p>
        <p className="font-karla font-600" style={{ fontSize: '0.54rem', color: '#6a6764', marginLeft: 'auto' }}>
          {entry.multiplier.toFixed(2)}×
        </p>
      </div>

      {/* Row 4: sell buttons */}
      <div className="flex gap-2 mt-0.5">
        <button
          onClick={() => onSell(entry.fish_id, 1)}
          disabled={selling}
          className="font-karla font-700 uppercase tracking-[0.08em] flex-1"
          style={{
            fontSize: '0.56rem', padding: '0.5rem 0.75rem', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#f0ede8', opacity: selling ? 0.45 : 1, cursor: selling ? 'default' : 'pointer',
          }}>
          Sell 1
        </button>
        {entry.quantity > 1 && (
          <button
            onClick={() => onSell(entry.fish_id, entry.quantity)}
            disabled={selling}
            className="font-karla font-700 uppercase tracking-[0.08em] flex-1"
            style={{
              fontSize: '0.56rem', padding: '0.5rem 0.75rem', borderRadius: 8,
              background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.28)',
              color: '#f0c040', opacity: selling ? 0.45 : 1, cursor: selling ? 'default' : 'pointer',
            }}>
            Sell All · {priceAll.toLocaleString()} ⟡
          </button>
        )}
      </div>
    </div>
  )
}

export default function MarketClient({
  portfolio: initialPortfolio,
  marketState,
  doubloons: initialDoubloons,
}: {
  portfolio: MarketFishEntry[]
  marketState: MarketState
  doubloons: number
}) {
  const [portfolio, setPortfolio] = useState(initialPortfolio)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [selling, setSelling] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const countdown = useCountdown(marketState.next_update_at)
  const mood = MOOD_CONFIG[marketState.mood]

  const totalMarketValue = portfolio.reduce(
    (s, e) => s + Math.floor(e.sell_value * e.multiplier * 0.97) * e.quantity, 0
  )
  const totalCount = portfolio.reduce((s, e) => s + e.quantity, 0)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function handleSell(fishId: number, qty: number) {
    if (selling !== null) return
    setSelling(fishId)
    startTransition(async () => {
      const res = await marketSellFish(fishId, qty)
      setSelling(null)
      if ('error' in res) {
        showToast(res.error)
        return
      }
      setDoubloons(res.doubloons)
      showToast(`+${res.earned.toLocaleString()} ⟡`)
      setPortfolio(prev =>
        prev
          .map(e => e.fish_id === fishId ? { ...e, quantity: e.quantity - qty } : e)
          .filter(e => e.quantity > 0)
      )
    })
  }

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 max-w-lg mx-auto flex items-center justify-between">
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#6a6764' }}>
            <Link href="/tavern" style={{ color: '#4a4845', textDecoration: 'none' }}>Tavern</Link>
            {' / '}Fish Market
          </p>
          <p className="font-cinzel font-700 mt-0.5" style={{ fontSize: '1.35rem', color: '#f0ede8' }}>Fish Market</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="font-karla font-400" style={{ fontSize: '0.52rem', color: '#4a4845' }}>Next update</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8' }}>{countdown}</p>
        </div>
      </div>

      <div className="px-5 max-w-lg mx-auto flex flex-col gap-3 pb-10">
        {/* Mood banner */}
        <div style={{
          background: mood.bg, border: `1px solid ${mood.border}`,
          borderRadius: 12, padding: '0.7rem 0.9rem',
          display: 'flex', alignItems: 'center', gap: '0.65rem',
        }}>
          <MoodIcon mood={marketState.mood} color={mood.color} />
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: mood.color }}>{mood.label}</p>
            <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a6764' }}>{mood.desc}</p>
          </div>
        </div>

        {/* Portfolio summary */}
        {portfolio.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, padding: '0.75rem 0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: '#4a4845' }}>Portfolio</p>
              <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#a0a09a' }}>
                {totalCount} fish · {portfolio.length} species
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: '#4a4845' }}>Market value</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040' }}>
                {totalMarketValue.toLocaleString()} ⟡
              </p>
            </div>
          </div>
        )}

        {/* Fish cards */}
        {portfolio.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#4a4845', marginBottom: '0.5rem' }}>No fish in hold</p>
            <p className="font-karla font-400" style={{ fontSize: '0.75rem', color: '#3a3835', marginBottom: '1.25rem' }}>
              Head to the docks to catch something worth selling.
            </p>
            <Link href="/tavern/fishing"
              className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.65rem', padding: '0.55rem 1.25rem', borderRadius: '2rem',
                background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)',
                color: '#38bdf8', textDecoration: 'none',
              }}>
              Go Fishing
            </Link>
          </div>
        ) : (
          portfolio.map(entry => (
            <FishCard
              key={entry.fish_id}
              entry={entry}
              onSell={handleSell}
              selling={selling === entry.fish_id}
            />
          ))
        )}

        {/* Fee notice */}
        {portfolio.length > 0 && (
          <p className="font-karla font-400 text-center" style={{ fontSize: '0.54rem', color: '#3a3835' }}>
            3% market fee applied to all sales
          </p>
        )}

        {/* Wallet */}
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: '#4a4845' }}>Wallet</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040' }}>
            {doubloons.toLocaleString()} ⟡
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1c2030', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '2rem', padding: '0.45rem 1.1rem',
          pointerEvents: 'none', zIndex: 50,
        }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0ede8', whiteSpace: 'nowrap' }}>{toast}</p>
        </div>
      )}
    </main>
  )
}

function MoodIcon({ mood, color }: { mood: string; color: string }) {
  if (mood === 'kraken') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8 2 4 5 4 9c0 2 1 4 3 5l-1 4h12l-1-4c2-1 3-3 3-5 0-4-4-7-8-7z"/>
        <path d="M8 14c-1 2-2 3-2 5M16 14c1 2 2 3 2 5M10 19v3M14 19v3"/>
      </svg>
    )
  }
  if (mood === 'storm') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 16.9A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
        <polyline points="13 11 9 17 15 17 11 23"/>
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-6 10-6s8 2 10 6c-2 4-6 6-10 6S4 16 2 12z"/>
      <circle cx="12" cy="12" r="2.5"/>
    </svg>
  )
}
