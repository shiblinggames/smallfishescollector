'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import Link from 'next/link'
import { marketSellFish } from './actions'
import type { MarketFishEntry, MarketState } from './page'

const TOUR_STEPS = [
  {
    title: 'Fish Market',
    body: 'This is where you sell your catch at live market prices — better than the quick-sell at the dock, but prices shift hourly.',
    color: '#38bdf8',
  },
  {
    title: 'Market Mood',
    body: 'The mood banner at the top tells you the current volatility. Calm means small swings. Storm means bigger moves. Kraken means anything goes.',
    color: '#f59e0b',
  },
  {
    title: 'Your Portfolio',
    body: 'Fish you\'re holding show up here with the live market price. Each card shows the price trend, 24h high/low, and sparkline history.',
    color: '#4ade80',
  },
  {
    title: 'Market Prices',
    body: 'Below your portfolio, you can browse prices for every fish — even ones you don\'t own yet. Useful for knowing what to target next.',
    color: '#c084fc',
  },
  {
    title: 'Timing your sell',
    body: 'Prices mean-revert toward 1× over time, but rare fish swing harder. Selling during a Kraken surge on an abyss fish can earn 2× base value.',
    color: '#fb923c',
  },
]

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
  calm:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)',  border: 'rgba(56,189,248,0.25)', label: 'Calm Market',   desc: 'Prices stable. Low volatility.' },
  storm:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'Storm Warning', desc: 'Choppy prices. Higher swings expected.' },
  kraken: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)',  label: 'Kraken Surge',  desc: 'Extreme volatility. Anything can happen.' },
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
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
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
          <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#4ade80' }}>{Math.floor(entry.sell_value * histMax * 0.97).toLocaleString()}</p>
        </div>
        <div>
          <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a6764' }}>24h Low</p>
          <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#f87171' }}>{Math.floor(entry.sell_value * histMin * 0.97).toLocaleString()}</p>
        </div>
        <p className="font-karla font-700 ml-auto" style={{ fontSize: '0.72rem', color: '#9a9488' }}>
          {entry.multiplier.toFixed(2)}×
        </p>
      </div>

      {/* Row 4: sell buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onSell(entry.fish_id, 1)}
          disabled={selling}
          className="font-karla font-700 uppercase tracking-[0.08em] flex-1"
          style={{
            fontSize: '0.65rem', padding: '0.6rem 0.75rem', borderRadius: 8,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#e0ddd8', opacity: selling ? 0.45 : 1, cursor: selling ? 'default' : 'pointer',
          }}>
          Sell 1
        </button>
        {entry.quantity > 1 && (
          <button
            onClick={() => onSell(entry.fish_id, entry.quantity)}
            disabled={selling}
            className="font-karla font-700 uppercase tracking-[0.08em] flex-1"
            style={{
              fontSize: '0.65rem', padding: '0.6rem 0.75rem', borderRadius: 8,
              background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.35)',
              color: '#f0c040', opacity: selling ? 0.45 : 1, cursor: selling ? 'default' : 'pointer',
            }}>
            Sell All · {priceAll.toLocaleString()} ⟡
          </button>
        )}
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
}: {
  portfolio: MarketFishEntry[]
  allMarket: MarketFishEntry[]
  marketState: MarketState
  doubloons: number
}) {
  const [portfolio, setPortfolio] = useState(initialPortfolio)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [selling, setSelling] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('market_tour_seen')) {
      setTourStep(0)
    }
  }, [])

  function advanceTour() {
    if (tourStep === null) return
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep(tourStep + 1)
    } else {
      localStorage.setItem('market_tour_seen', '1')
      setTourStep(null)
    }
  }

  function dismissTour() {
    localStorage.setItem('market_tour_seen', '1')
    setTourStep(null)
  }

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
      if ('error' in res) { showToast(res.error); return }
      setDoubloons(res.doubloons)
      showToast(`+${res.earned.toLocaleString()} ⟡`)
      setPortfolio(prev =>
        prev.map(e => e.fish_id === fishId ? { ...e, quantity: e.quantity - qty } : e)
            .filter(e => e.quantity > 0)
      )
    })
  }

  const ownedIds = new Set(portfolio.map(e => e.fish_id))
  const browseList = allMarket.filter(e => !ownedIds.has(e.fish_id))

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 max-w-lg mx-auto flex items-center justify-between">
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#7a7774' }}>
            <Link href="/tavern" style={{ color: '#6a6764', textDecoration: 'none' }}>Tavern</Link>
            {' / '}Fish Market
          </p>
          <p className="font-cinzel font-700 mt-0.5" style={{ fontSize: '1.5rem', color: '#ffffff' }}>Fish Market</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="font-karla font-500" style={{ fontSize: '0.65rem', color: '#7a7774' }}>Next update</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{countdown}</p>
        </div>
      </div>

      <div className="px-5 max-w-lg mx-auto flex flex-col gap-4 pb-10">
        {/* Mood banner */}
        <div style={{
          background: mood.bg, border: `1px solid ${mood.border}`,
          borderRadius: 12, padding: '0.8rem 1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <MoodIcon mood={marketState.mood} color={mood.color} />
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: mood.color }}>{mood.label}</p>
            <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#9a9488' }}>{mood.desc}</p>
          </div>
        </div>

        {/* ── Portfolio ── */}
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.14em] mb-2" style={{ fontSize: '0.65rem', color: '#7a7774' }}>
            My Portfolio
          </p>

          {portfolio.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '0.75rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
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
          )}

          {portfolio.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#6a6764', marginBottom: '0.5rem' }}>
                No fish in hold
              </p>
              <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#4a4845', marginBottom: '1.25rem' }}>
                Head to the docks to catch something worth selling.
              </p>
              <Link href="/tavern/fishing"
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
                />
              ))}
              <p className="font-karla font-400 text-center" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
                3% market fee applied to all sales
              </p>
            </div>
          )}
        </div>

        {/* ── All Market Prices ── */}
        {browseList.length > 0 && (
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] mb-1" style={{ fontSize: '0.65rem', color: '#7a7774' }}>
              Market Prices
            </p>
            <p className="font-karla font-400 mb-3" style={{ fontSize: '0.7rem', color: '#5a5754' }}>
              Fish you don&apos;t currently own
            </p>
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '0 0.75rem',
            }}>
              {browseList.map((entry, i) => (
                <BrowseRow key={entry.fish_id} entry={entry} />
              ))}
            </div>
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

      {/* Tour */}
      {tourStep !== null && (
        <>
          <div
            onClick={advanceTour}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 60, cursor: 'pointer' }}
          />
          <div
            style={{
              position: 'fixed', bottom: 100, left: 16, right: 16, zIndex: 61,
              background: '#0d1520',
              border: `1px solid rgba(255,255,255,0.1)`,
              borderLeft: `3px solid ${TOUR_STEPS[tourStep].color}`,
              borderRadius: 14,
              padding: '1.1rem 1.1rem 1rem',
              maxWidth: 460,
              margin: '0 auto',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>
                {TOUR_STEPS[tourStep].title}
              </p>
              <button onClick={dismissTour} style={{ color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>
                ✕
              </button>
            </div>
            <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#9a9488', lineHeight: 1.55, marginBottom: '1rem' }}>
              {TOUR_STEPS[tourStep].body}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {TOUR_STEPS.map((_, i) => (
                  <span key={i} style={{
                    width: i === tourStep ? 16 : 5, height: 5, borderRadius: 3,
                    background: i === tourStep ? TOUR_STEPS[tourStep].color : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.2s',
                  }} />
                ))}
              </div>
              <button
                onClick={advanceTour}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  fontSize: '0.62rem', padding: '0.4rem 1rem', borderRadius: '2rem',
                  background: `${TOUR_STEPS[tourStep].color}18`,
                  border: `1px solid ${TOUR_STEPS[tourStep].color}40`,
                  color: TOUR_STEPS[tourStep].color,
                  cursor: 'pointer',
                }}>
                {tourStep < TOUR_STEPS.length - 1 ? 'Next →' : 'Got it'}
              </button>
            </div>
          </div>
        </>
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
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-6 10-6s8 2 10 6c-2 4-6 6-10 6S4 16 2 12z"/>
      <circle cx="12" cy="12" r="2.5"/>
    </svg>
  )
}
