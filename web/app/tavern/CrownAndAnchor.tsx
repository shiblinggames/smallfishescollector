'use client'

import { useState, useEffect, useRef } from 'react'
import { rollDice } from './actions'
import type { RollResult } from './actions'
import { SYMBOLS, DAILY_CAP, MAX_BET, MIN_BET } from './constants'
import type { Symbol } from './constants'
import AchievementToast from '@/components/AchievementToast'

const SYMBOL_LABEL: Record<Symbol, string> = {
  anchor:  'Anchor',
  crown:   'Crown',
  heart:   'Heart',
  diamond: 'Diamond',
  spade:   'Spade',
  club:    'Club',
}

function SymbolIcon({ name, size = 28 }: { name: Symbol; size?: number }) {
  const s = size
  if (name === 'anchor') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </svg>
  )
  if (name === 'crown') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17l2-8 4 4 3-6 3 6 4-4 2 8H3z"/>
    </svg>
  )
  if (name === 'heart') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21C12 21 3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 13-9 13z"/>
    </svg>
  )
  if (name === 'diamond') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3L3 12l9 9 9-9-9-9z"/>
    </svg>
  )
  if (name === 'spade') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3L4 11c0 3 2 5 5 4-1 2-2 3-4 4h10c-2-1-3-2-4-4 3 1 5-1 5-4L12 3z"/>
    </svg>
  )
  // club
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="8" r="3"/>
      <circle cx="7.5" cy="13" r="3"/>
      <circle cx="16.5" cy="13" r="3"/>
      <path d="M10 16c0 2-1 3-2 4h8c-1-1-2-2-2-4H10z"/>
    </svg>
  )
}

const SYMBOL_COLOR: Record<Symbol, string> = {
  anchor:  '#f0c040',
  crown:   '#a78bfa',
  heart:   '#f87171',
  diamond: '#60a5fa',
  spade:   '#f0ede8',
  club:    '#4ade80',
}

function Die({ symbol, rolling, delay }: { symbol: Symbol; rolling: boolean; delay: number }) {
  const [display, setDisplay] = useState<Symbol>(symbol)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (rolling) {
      let idx = 0
      intervalRef.current = setInterval(() => {
        idx = (idx + 1) % SYMBOLS.length
        setDisplay(SYMBOLS[idx])
      }, 80)
    } else {
      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setDisplay(symbol)
      }, delay)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [rolling, symbol, delay])

  return (
    <div
      className="flex items-center justify-center rounded-2xl transition-transform duration-150"
      style={{
        width: 80, height: 80,
        background: rolling ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.15)',
        border: `2px solid ${rolling ? 'rgba(255,255,255,0.12)' : SYMBOL_COLOR[display]}`,
        color: SYMBOL_COLOR[display],
        boxShadow: rolling ? 'none' : `0 0 16px ${SYMBOL_COLOR[display]}40`,
      }}
    >
      <SymbolIcon name={display} size={36} />
    </div>
  )
}

const BET_PRESETS = [10, 25, 50, 100, 200]

interface Props {
  doubloons: number
  dailyWagered: number
}

export default function CrownAndAnchor({ doubloons: initialDoubloons, dailyWagered: initialWagered }: Props) {
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [dailyWagered, setDailyWagered] = useState(initialWagered)
  const [selected, setSelected] = useState<Symbol | null>(null)
  const [wager, setWager] = useState(25)
  const [rolling, setRolling] = useState(false)
  const [diceResult, setDiceResult] = useState<Symbol[]>(['anchor', 'crown', 'heart'])
  const [lastResult, setLastResult] = useState<RollResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])

  const dailyRemaining = DAILY_CAP - dailyWagered
  const canRoll = selected !== null && wager >= MIN_BET && wager <= Math.min(MAX_BET, doubloons, dailyRemaining) && !rolling && dailyRemaining > 0

  async function handleRoll() {
    if (!selected || !canRoll) return
    setError(null)
    setLastResult(null)
    setRolling(true)

    const result = await rollDice(selected, wager)

    if ('error' in result) {
      setRolling(false)
      setError(result.error)
      return
    }

    setDiceResult(result.result)
    if (result.newAchievements?.length) setAchievementKeys(result.newAchievements)
    // Stagger die landing
    setTimeout(() => setRolling(false), 1200)
    setTimeout(() => {
      setDoubloons(result.newDoubloons)
      setDailyWagered(result.dailyWagered)
      setLastResult(result)
    }, 1400)
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-sm mx-auto">
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />
      {/* Balance + daily cap */}
      <div className="text-center">
        <p className="font-cinzel font-700 text-[#f0c040] text-2xl">{doubloons.toLocaleString()} ⟡</p>
        <p className="font-karla font-300 text-[#a0a09a] text-xs tracking-wide mt-1">
          {dailyRemaining > 0 ? `${dailyRemaining} ⟡ wager limit remaining today` : 'Daily limit reached — come back tomorrow'}
        </p>
      </div>

      {/* Symbol picker */}
      <div className="flex flex-col items-center gap-3 w-full">
        <p className="sg-eyebrow" style={{ color: '#9a9488' }}>Pick a Symbol</p>
        <div className="grid grid-cols-3 gap-3 w-full">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSelected(s)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all duration-150"
              style={{
                background: selected === s ? `${SYMBOL_COLOR[s]}18` : 'rgba(255,255,255,0.08)',
                border: `1px solid ${selected === s ? SYMBOL_COLOR[s] : 'rgba(255,255,255,0.15)'}`,
                color: selected === s ? SYMBOL_COLOR[s] : '#a0a09a',
                boxShadow: selected === s ? `0 0 12px ${SYMBOL_COLOR[s]}30` : 'none',
              }}
            >
              <SymbolIcon name={s} size={24} />
              <span className="font-karla font-600 text-[0.6rem] uppercase tracking-[0.12em]">{SYMBOL_LABEL[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dice */}
      <div className="flex gap-4">
        {diceResult.map((sym, i) => (
          <Die key={i} symbol={sym} rolling={rolling} delay={i * 200} />
        ))}
      </div>

      {/* Result */}
      {lastResult && !rolling && (
        <div className="text-center">
          {lastResult.matches > 0 ? (
            <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.1rem' }}>
              {lastResult.matches === 3 ? '🎰 ' : ''}{lastResult.matches}× match — +{lastResult.payout} ⟡
            </p>
          ) : (
            <p className="font-karla font-400 text-[#a0a09a] text-sm">No match — {lastResult.net} ⟡</p>
          )}
        </div>
      )}

      {error && <p className="font-karla font-400 text-[#f87171] text-sm text-center">{error}</p>}

      {/* Bet selector */}
      <div className="flex flex-col items-center gap-3 w-full">
        <p className="sg-eyebrow" style={{ color: '#9a9488' }}>Your Bet</p>
        <div className="flex gap-2 flex-wrap justify-center">
          {BET_PRESETS.map((amt) => {
            const disabled = amt > Math.min(doubloons, dailyRemaining)
            return (
              <button
                key={amt}
                onClick={() => !disabled && setWager(amt)}
                className="font-karla font-600 text-xs uppercase tracking-[0.10em] px-3 py-2 rounded-lg transition-all"
                style={{
                  background: wager === amt ? 'rgba(240,192,64,0.15)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${wager === amt ? '#f0c040' : 'rgba(255,255,255,0.15)'}`,
                  color: disabled ? '#3a3835' : wager === amt ? '#f0c040' : '#a0a09a',
                  cursor: disabled ? 'default' : 'pointer',
                }}
              >
                {amt} ⟡
              </button>
            )
          })}
        </div>
      </div>

      {/* Roll button */}
      <button
        onClick={handleRoll}
        disabled={!canRoll}
        className="btn-ghost w-full disabled:opacity-30"
      >
        {rolling ? 'Rolling…' : `Roll · ${wager} ⟡`}
      </button>

      <p className="font-karla font-300 text-[#a0a09a] text-xs text-center tracking-wide">
        Match 1 die → win 1× · 2 dice → 2× · 3 dice → 3×
      </p>
    </div>
  )
}
