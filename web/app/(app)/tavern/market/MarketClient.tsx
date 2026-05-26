'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { marketSellFish, liquidateAllFish } from './actions'
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

const MOOD_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; desc: string }> = {
  calm:           { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)',  label: 'Calm Market',     desc: 'Prices stable. Small swings.' },
  storm:          { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)',  label: 'Storm',           desc: 'Choppy market. Could go either way.' },
  kraken:         { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)',   label: 'Kraken',          desc: 'Extreme volatility. Anything can happen.' },
  tide_rising:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.25)',  label: 'Tide Rising',     desc: 'Prices trending up. Good time to hold.' },
  bounty_season:  { color: '#f0c040', bg: 'rgba(240,192,64,0.1)',   border: 'rgba(240,192,64,0.25)', label: 'Bounty Season',   desc: 'Strong upward pressure. Rare fish climbing.' },
  low_tide:       { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)', label: 'Low Tide',        desc: 'Prices drifting down. Consider selling.' },
  cursed_waters:  { color: '#c084fc', bg: 'rgba(192,132,252,0.1)',  border: 'rgba(192,132,252,0.25)', label: 'Cursed Waters',   desc: 'Heavy sell pressure. Prices falling fast.' },
}

function Sparkline({ history, current, up, height = 40 }: { history: number[]; current: number; up: boolean; height?: number }) {
  const data = [...history, current]
  if (data.length < 2) return <div style={{ height, flex: 1 }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 0.001
  const W = 100
  const H = height
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = up ? '#4ade80' : '#f87171'
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ flex: 1, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
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

function PortfolioCard({
  entry,
  onSell,
  selling,
  isPremium,
}: {
  entry: MarketFishEntry
  onSell: (fishId: number, qty: number) => void
  selling: boolean
  isPremium: boolean
}) {
  // Quantity is backed by a STRING so the field can be cleared and retyped
  // freely on mobile (a controlled number input with a `|| 1` fallback
  // snapped back to 1 the moment you cleared it, making custom amounts
  // impossible — it felt like "1 or max only"). `qty` is the clamped
  // numeric value derived for pricing + selling; the raw string is what
  // the input shows while editing.
  const [qtyStr, setQtyStr] = useState(String(entry.quantity))
  const qty = Math.max(1, Math.min(entry.quantity, parseInt(qtyStr, 10) || 1))
  const fee = isPremium ? 1.0 : 0.97

  const pctChange = entry.prev_multiplier > 0
    ? ((entry.multiplier - entry.prev_multiplier) / entry.prev_multiplier) * 100
    : 0
  const up = pctChange >= 0
  const pctStr = `${up ? '+' : ''}${pctChange.toFixed(1)}%`
  const priceEach = Math.floor(entry.sell_value * entry.multiplier * fee)
  const priceAll  = priceEach * Math.min(qty, entry.quantity)
  const allHistory = [...entry.history, entry.multiplier]
  const histMax = allHistory.length > 0 ? Math.max(...allHistory) : entry.multiplier
  const histMin = allHistory.length > 0 ? Math.min(...allHistory) : entry.multiplier
  const hColor = HABITAT_COLOR[entry.habitat] ?? '#888'
  const rColor = RARITY_COLOR[entry.bite_rarity] ?? '#9ca3af'

  return (
    <div style={{
      background: 'rgba(8,8,6,0.82)',
      border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: 14,
      padding: '1.1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      {/* Row 1: name + meta */}
      <div className="flex items-center gap-2">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: rColor, flexShrink: 0 }} />
        <p className="font-cinzel font-700 flex-1 truncate" style={{ fontSize: '1rem', color: '#f0ede8' }}>
          {entry.name}
        </p>
        <span className="font-karla font-700"
          style={{ fontSize: '0.62rem', color: hColor, background: `${hColor}18`, border: `1px solid ${hColor}35`,
            padding: '0.15rem 0.55rem', borderRadius: '2rem', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {entry.habitat.replace('_', ' ')}
        </span>
        <span className="font-karla font-700"
          style={{ fontSize: '0.65rem', color: '#e0ddd8', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            padding: '0.15rem 0.55rem', borderRadius: '2rem', flexShrink: 0 }}>
          ×{entry.quantity}
        </span>
      </div>

      {/* Row 2: price hero + sparkline */}
      <div className="flex items-end gap-3">
        <div style={{ flexShrink: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.75rem', color: '#ffffff', lineHeight: 1 }}>
            {priceEach.toLocaleString()}{' '}
            <span style={{ fontSize: '0.9rem', color: '#9a9488' }}>⟡</span>
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span style={{ fontSize: '0.85rem', color: up ? '#4ade80' : '#f87171', fontFamily: 'var(--font-karla)', fontWeight: 700 }}>
              {up ? '▲' : '▼'} {pctStr}
            </span>
            <span className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>vs last tick</span>
          </div>
        </div>
        <Sparkline history={entry.history} current={entry.multiplier} up={up} height={44} />
      </div>

      {/* Row 3: stats */}
      <div className="flex items-center gap-4">
        <div>
          <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a6764' }}>Base</p>
          <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{entry.sell_value.toLocaleString()} ⟡</p>
        </div>
        <div>
          <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a6764' }}>24h High</p>
          <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#4ade80' }}>{Math.floor(entry.sell_value * histMax * fee).toLocaleString()}</p>
        </div>
        <div>
          <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a6764' }}>24h Low</p>
          <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#f87171' }}>{Math.floor(entry.sell_value * histMin * fee).toLocaleString()}</p>
        </div>
        <p className="font-karla font-700 ml-auto" style={{ fontSize: '0.72rem', color: '#9a9488' }}>
          {entry.multiplier.toFixed(2)}×
        </p>
      </div>

      {/* Row 4: qty stepper + sell */}
      <div className="flex gap-2 items-center">
        <div className="flex items-center" style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQtyStr(String(Math.max(1, qty - 1)))}
            disabled={selling || qty <= 1}
            className="font-karla font-700"
            style={{
              width: 34, padding: '0.55rem 0', background: 'rgba(20,18,15,0.9)',
              color: '#f0ede8', fontSize: '1rem', lineHeight: 1,
              opacity: (selling || qty <= 1) ? 0.4 : 1, cursor: (selling || qty <= 1) ? 'default' : 'pointer',
            }}
          >−</button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={entry.quantity}
            value={qtyStr}
            onChange={e => setQtyStr(e.target.value)}
            onBlur={() => setQtyStr(String(qty))}
            onFocus={e => e.target.select()}
            disabled={selling}
            className="font-karla font-600"
            style={{
              width: 54, padding: '0.55rem 0.25rem', textAlign: 'center',
              background: 'rgba(20,18,15,0.9)', border: 'none',
              borderLeft: '1px solid rgba(255,255,255,0.15)', borderRight: '1px solid rgba(255,255,255,0.15)',
              color: '#f0ede8', fontSize: '0.75rem', outline: 'none',
            }}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQtyStr(String(Math.min(entry.quantity, qty + 1)))}
            disabled={selling || qty >= entry.quantity}
            className="font-karla font-700"
            style={{
              width: 34, padding: '0.55rem 0', background: 'rgba(20,18,15,0.9)',
              color: '#f0ede8', fontSize: '1rem', lineHeight: 1,
              opacity: (selling || qty >= entry.quantity) ? 0.4 : 1, cursor: (selling || qty >= entry.quantity) ? 'default' : 'pointer',
            }}
          >+</button>
        </div>
        <button
          type="button"
          aria-label="Set quantity to max"
          onClick={() => setQtyStr(String(entry.quantity))}
          disabled={selling || qty >= entry.quantity}
          className="font-karla font-700 uppercase tracking-[0.06em]"
          style={{
            fontSize: '0.6rem', padding: '0.6rem 0.5rem', borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
            color: '#c0bdb8', opacity: (selling || qty >= entry.quantity) ? 0.4 : 1,
            cursor: (selling || qty >= entry.quantity) ? 'default' : 'pointer',
          }}>
          Max
        </button>
        <button
          onClick={() => onSell(entry.fish_id, Math.min(qty, entry.quantity))}
          disabled={selling}
          className="font-karla font-700 uppercase tracking-[0.08em] flex-1"
          style={{
            fontSize: '0.65rem', padding: '0.6rem 0.75rem', borderRadius: 8,
            background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.35)',
            color: '#f0c040', opacity: selling ? 0.45 : 1, cursor: selling ? 'default' : 'pointer',
          }}>
          {selling ? '…' : `Sell · ${priceAll.toLocaleString()} ⟡`}
        </button>
      </div>
    </div>
  )
}

function BrowseRow({ entry }: { entry: MarketFishEntry }) {
  const pctChange = entry.prev_multiplier > 0
    ? ((entry.multiplier - entry.prev_multiplier) / entry.prev_multiplier) * 100
    : 0
  const up = pctChange >= 0
  const pctStr = `${up ? '+' : ''}${pctChange.toFixed(1)}%`
  const price = Math.floor(entry.sell_value * entry.multiplier * 0.97)
  const hColor = HABITAT_COLOR[entry.habitat] ?? '#888'
  const rColor = RARITY_COLOR[entry.bite_rarity] ?? '#9ca3af'

  return (
    <div className="flex items-center gap-3 py-3 px-1"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: rColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.85rem', color: '#d0cdc8' }}>
          {entry.name}
        </p>
        <span className="font-karla font-600"
          style={{ fontSize: '0.58rem', color: hColor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {entry.habitat.replace('_', ' ')}
        </span>
      </div>
      <div style={{ width: 60, flexShrink: 0 }}>
        <Sparkline history={entry.history} current={entry.multiplier} up={up} height={28} />
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8' }}>
          {price.toLocaleString()} ⟡
        </p>
        <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: up ? '#4ade80' : '#f87171' }}>
          {up ? '▲' : '▼'} {pctStr}
        </p>
      </div>
    </div>
  )
}

export default function MarketClient({
  portfolio: initialPortfolio,
  allMarket,
  marketState,
  doubloons: initialDoubloons,
  isPremium,
}: {
  portfolio: MarketFishEntry[]
  allMarket: MarketFishEntry[]
  marketState: MarketState
  doubloons: number
  isPremium: boolean
}) {
  const [portfolio, setPortfolio] = useState(initialPortfolio)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [selling, setSelling] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingSales, setPendingSales] = useState<{ id: string; amount: number; fishCount: number; reason: string; settlesAt: string }[]>([])
  const [pendingNow, setPendingNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()

  useEffect(() => {
    function onChange(e: Event) {
      const list = (e as CustomEvent<{ id: string; amount: number; fishCount: number; reason: string; settlesAt: string }[]>).detail ?? []
      setPendingSales(list)
    }
    window.addEventListener('pending-sales-changed', onChange)
    // Ask the watcher to refetch and re-dispatch — covers the case where the
    // watcher's initial fetch completed before this component mounted.
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
  const totalMarketValue = portfolio.reduce(
    (s, e) => s + Math.floor(e.sell_value * e.multiplier * fee) * e.quantity, 0
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
      if ('error' in res) { showToast(res.error); return }
      setDoubloons(res.doubloons)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      showToast(`+${res.earned.toLocaleString()} ⟡`)
      setPortfolio(prev =>
        prev.map(e => e.fish_id === fishId ? { ...e, quantity: e.quantity - qty } : e)
            .filter(e => e.quantity > 0)
      )
    })
  }

  const [browseExpanded, setBrowseExpanded] = useState(false)
  const [liquidateConfirm, setLiquidateConfirm] = useState(false)
  const [liquidating, setLiquidating] = useState(false)
  const liquidateValue = portfolio.reduce(
    (s, e) => s + Math.floor(e.sell_value * e.multiplier * 0.90 * fee) * e.quantity, 0
  )

  function handleLiquidate() {
    if (liquidating) return
    setLiquidating(true)
    setLiquidateConfirm(false)
    startTransition(async () => {
      const res = await liquidateAllFish()
      setLiquidating(false)
      if ('error' in res) { showToast(res.error); return }
      window.dispatchEvent(new Event('pending-sales-may-have-changed'))
      showToast(`+${res.earned.toLocaleString()} ⟡ pending · settles in 1h`)
      setPortfolio([])
    })
  }

  const ownedIds = new Set(portfolio.map(e => e.fish_id))
  const browseAll = allMarket.filter(e => !ownedIds.has(e.fish_id))
  const browseList = browseExpanded ? browseAll : browseAll.slice(0, 10)

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-5 pt-5 max-w-lg mx-auto flex flex-col gap-4 pb-10">
        {/* Mood banner — includes countdown */}
        <div style={{
          background: 'rgba(8,8,6,0.82)', border: `1px solid ${mood.border}`,
          borderRadius: 12, padding: '0.85rem 1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <MoodIcon mood={marketState.mood} color={mood.color} />
          <div style={{ flex: 1 }}>
            <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: mood.color }}>{mood.label}</p>
            <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#9a9488' }}>{mood.desc}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p className="font-karla font-500" style={{ fontSize: '0.58rem', color: '#6a6764' }}>Next update</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8' }}>{countdown}</p>
          </div>
        </div>

        {/* ── Pending Sales ── */}
        {pendingSales.length > 0 && (
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] mb-2" style={{ fontSize: '0.65rem', color: '#bda05a' }}>
              Pending Sales
            </p>
            <div style={{
              background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.28)',
              borderRadius: 12, padding: '0.6rem 0.85rem',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {pendingSales.map(p => {
                const minutes = Math.max(0, Math.ceil((new Date(p.settlesAt).getTime() - pendingNow) / 60_000))
                const timeLabel = minutes < 60
                  ? `${minutes}m`
                  : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
                return (
                  <div key={p.id} className="flex items-center justify-between" style={{ padding: '0.25rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: '0.85rem', lineHeight: 1, color: '#bda05a' }}>⏳</span>
                      <div style={{ minWidth: 0 }}>
                        <p className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#f0ede8', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.reason}
                        </p>
                        <p className="font-karla font-300" style={{ fontSize: '0.6rem', color: '#8a7a4a' }}>
                          settles in {timeLabel}
                        </p>
                      </div>
                    </div>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0c040', flexShrink: 0, marginLeft: 12 }}>
                      +{p.amount.toLocaleString()} ⟡
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Portfolio ── */}
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.14em] mb-2" style={{ fontSize: '0.65rem', color: '#a0a09a' }}>
            My Portfolio
          </p>

          {portfolio.length > 0 && (
            <div style={{
              background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '0.75rem',
            }}>
              {/* Summary row */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Holdings</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#c0bdb8' }}>
                    {totalCount} fish · {portfolio.length} species
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Market value</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0c040' }}>
                    {totalMarketValue.toLocaleString()} ⟡
                  </p>
                </div>
              </div>

              {/* Liquidate */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
                {!liquidateConfirm ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a6764' }}>Liquidate All · 90% market · 3% fee · 1h delay</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f87171' }}>
                        {liquidateValue.toLocaleString()} ⟡
                      </p>
                    </div>
                    <button
                      onClick={() => setLiquidateConfirm(true)}
                      disabled={liquidating}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{
                        fontSize: '0.58rem', padding: '0.45rem 0.85rem', borderRadius: 8,
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                        color: '#f87171', cursor: 'pointer', flexShrink: 0,
                      }}>
                      Liquidate
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="font-karla font-400 mb-2" style={{ fontSize: '0.65rem', color: '#9a9488' }}>
                      Lock in {liquidateValue.toLocaleString()} ⟡ for {totalCount} fish? Doubloons arrive in 1 hour.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLiquidateConfirm(false)}
                        className="font-karla font-600 flex-1"
                        style={{
                          fontSize: '0.62rem', padding: '0.55rem', borderRadius: 8,
                          background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)',
                          color: '#6a6764', cursor: 'pointer',
                        }}>
                        Cancel
                      </button>
                      <button
                        onClick={handleLiquidate}
                        disabled={liquidating}
                        className="font-karla font-700 uppercase tracking-[0.1em] flex-1"
                        style={{
                          fontSize: '0.62rem', padding: '0.55rem', borderRadius: 8,
                          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                          color: '#f87171', opacity: liquidating ? 0.5 : 1, cursor: liquidating ? 'default' : 'pointer',
                        }}>
                        {liquidating ? 'Selling…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {portfolio.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem',
              background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#6a6764', marginBottom: '0.5rem' }}>
                No fish in hold
              </p>
              <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#4a4845', marginBottom: '1.25rem' }}>
                Head to the docks to catch something worth selling.
              </p>
              <Link href="/fishing"
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  fontSize: '0.7rem', padding: '0.6rem 1.4rem', borderRadius: '2rem',
                  background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)',
                  color: '#38bdf8', textDecoration: 'none',
                }}>
                Go Fishing
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {portfolio.map(entry => (
                <PortfolioCard
                  key={entry.fish_id}
                  entry={entry}
                  onSell={handleSell}
                  selling={selling === entry.fish_id}
                  isPremium={isPremium}
                />
              ))}
              <p className="font-karla font-400 text-center" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
                3% market fee applied to all sales
              </p>
            </div>
          )}
        </div>

        {/* ── All Market Prices ── */}
        {browseAll.length > 0 && (
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] mb-1" style={{ fontSize: '0.65rem', color: '#a0a09a' }}>
              Market Prices
            </p>
            <p className="font-karla font-400 mb-3" style={{ fontSize: '0.7rem', color: '#7a7774' }}>
              Species you&apos;ve discovered but aren&apos;t holding
            </p>
            <div style={{
              background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 12, padding: '0 0.75rem',
            }}>
              {browseList.map(entry => (
                <BrowseRow key={entry.fish_id} entry={entry} />
              ))}
            </div>
            {browseAll.length > 10 && (
              <button
                onClick={() => setBrowseExpanded(v => !v)}
                className="font-karla font-600 w-full mt-2"
                style={{
                  fontSize: '0.7rem', padding: '0.6rem', borderRadius: 10,
                  background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#7a7774', cursor: 'pointer',
                }}>
                {browseExpanded ? '↑ Show less' : `↓ Show all ${browseAll.length} species`}
              </button>
            )}
          </div>
        )}

        {/* Wallet */}
        <div style={{ textAlign: 'center', paddingTop: 4 }}>
          <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Wallet</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f0c040' }}>
            {doubloons.toLocaleString()} ⟡
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1c2030', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '2rem', padding: '0.5rem 1.25rem',
          pointerEvents: 'none', zIndex: 50,
        }}>
          <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0ede8', whiteSpace: 'nowrap' }}>{toast}</p>
        </div>
      )}

    </main>
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
