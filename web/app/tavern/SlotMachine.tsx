'use client'

import { useState, useEffect, useRef } from 'react'
import { spinSlots } from './actions'
import type { SlotSpinResult } from './actions'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOTS_DAILY_CAP, SLOTS_MIN_BET, SLOTS_MAX_BET } from './constants'
import type { SlotSymbolId } from './constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ALL_IDS: SlotSymbolId[] = SLOT_SYMBOLS_LIST.map((s) => s.id)

function AnchorSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function SlotSymbolDisplay({ id, size = 56 }: { id: SlotSymbolId; size?: number }) {
  const sym = SLOT_SYMBOLS_LIST.find((s) => s.id === id)!
  if (id === 'anchor') {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sym.color }}>
        <AnchorSVG size={Math.round(size * 0.72)} />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${SUPABASE_URL}/storage/v1/object/public/card-arts/${sym.filename}`}
      alt={sym.label}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  )
}

function Reel({ symbol, rolling, delay }: { symbol: SlotSymbolId; rolling: boolean; delay: number }) {
  const [display, setDisplay] = useState<SlotSymbolId>(symbol)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (rolling) {
      let idx = 0
      intervalRef.current = setInterval(() => {
        idx = (idx + 1) % ALL_IDS.length
        setDisplay(ALL_IDS[idx])
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

  const sym = SLOT_SYMBOLS_LIST.find((s) => s.id === display)!

  return (
    <div
      style={{
        width: 96, height: 96,
        background: rolling ? 'rgba(255,255,255,0.07)' : `${sym.color}18`,
        border: `2px solid ${rolling ? 'rgba(255,255,255,0.10)' : sym.color}`,
        borderRadius: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: rolling ? 'none' : `0 0 20px ${sym.color}38`,
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
      }}
    >
      <SlotSymbolDisplay id={display} size={68} />
    </div>
  )
}

const BET_PRESETS = [10, 25, 50, 100, 250, 500]

interface Props {
  doubloons: number
  dailyWagered: number
}

export default function SlotMachine({ doubloons: initialDoubloons, dailyWagered: initialWagered }: Props) {
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [dailyWagered, setDailyWagered] = useState(initialWagered)
  const [wager, setWager] = useState(25)
  const [spinning, setSpinning] = useState(false)
  const [mainRolling, setMainRolling] = useState(false)
  const [reels, setReels] = useState<SlotSymbolId[]>(['common', 'rare', 'legendary'])
  const [bonusRolling, setBonusRolling] = useState(false)
  const [bonusReels, setBonusReels] = useState<SlotSymbolId[]>(['common', 'rare', 'legendary'])
  const [showBonus, setShowBonus] = useState(false)
  const [lastResult, setLastResult] = useState<SlotSpinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  const dailyRemaining = SLOTS_DAILY_CAP - dailyWagered
  const canSpin = !spinning && wager >= SLOTS_MIN_BET && wager <= Math.min(SLOTS_MAX_BET, doubloons, dailyRemaining) && dailyRemaining > 0

  async function handleSpin() {
    if (!canSpin) return
    setError(null)
    setLastResult(null)
    setShowResult(false)
    setShowBonus(false)
    setSpinning(true)
    setMainRolling(true)

    const result = await spinSlots(wager)

    if ('error' in result) {
      setSpinning(false)
      setMainRolling(false)
      setError(result.error)
      return
    }

    setReels(result.reels)

    setTimeout(() => setMainRolling(false), 1200)

    if (result.bonus) {
      setTimeout(() => {
        setShowBonus(true)
        setBonusReels(result.bonus!.reels)
        setTimeout(() => {
          setBonusRolling(true)
          setTimeout(() => {
            setBonusRolling(false)
            setTimeout(() => {
              setDoubloons(result.newDoubloons)
              setDailyWagered(result.dailyWagered)
              setLastResult(result)
              setShowResult(true)
              setSpinning(false)
              window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
            }, 1400)
          }, 1200)
        }, 700)
      }, 1600)
    } else {
      setTimeout(() => {
        setDoubloons(result.newDoubloons)
        setDailyWagered(result.dailyWagered)
        setLastResult(result)
        setShowResult(true)
        setSpinning(false)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
      }, 1400)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* Balance */}
      <div className="text-center">
        <p className="font-cinzel font-700 text-[#f0c040] text-2xl">{doubloons.toLocaleString()} ⟡</p>
        <p className="font-karla font-300 text-[#a0a09a] text-xs tracking-wide mt-1">
          {dailyRemaining > 0
            ? `${dailyRemaining.toLocaleString()} ⟡ wager limit remaining today`
            : 'Daily limit reached — come back tomorrow'}
        </p>
      </div>

      {/* Main reels */}
      <div className="flex gap-3">
        {reels.map((sym, i) => (
          <Reel key={i} symbol={sym} rolling={mainRolling} delay={i * 220} />
        ))}
      </div>

      {/* Bonus spin section */}
      {showBonus && (
        <div className="flex flex-col items-center gap-3 w-full">
          <div style={{
            background: 'rgba(52,211,153,0.12)',
            border: '1px solid rgba(52,211,153,0.35)',
            borderRadius: 10,
            padding: '5px 18px',
          }}>
            <p className="font-cinzel font-700 tracking-wide" style={{ color: '#34d399', fontSize: '0.85rem' }}>
              ⚓ Bonus Spin!
            </p>
          </div>
          <div className="flex gap-3">
            {bonusReels.map((sym, i) => (
              <Reel key={i} symbol={sym} rolling={bonusRolling} delay={i * 220} />
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {showResult && lastResult && (
        <div className="text-center min-h-[28px]">
          {lastResult.net > 0 ? (
            <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.1rem' }}>
              +{lastResult.net.toLocaleString()} ⟡
            </p>
          ) : lastResult.net === 0 ? (
            <p className="font-karla font-400 text-sm" style={{ color: '#34d399' }}>Bonus spin — no win this time</p>
          ) : (
            <p className="font-karla font-400 text-[#a0a09a] text-sm">{lastResult.net.toLocaleString()} ⟡</p>
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
                disabled={disabled}
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

      {/* Spin button */}
      <button
        onClick={handleSpin}
        disabled={!canSpin}
        className="btn-ghost w-full disabled:opacity-30"
      >
        {spinning
          ? (showBonus ? 'Bonus Spin…' : 'Spinning…')
          : `Spin · ${wager} ⟡`}
      </button>

      {/* Payout table */}
      <div className="w-full rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] px-4 pt-3 pb-2" style={{ fontSize: '0.6rem' }}>
          Payouts — match all three
        </p>
        {SLOT_SYMBOLS_LIST.filter((s) => s.id !== 'anchor').map((sym) => (
          <div key={sym.id} className="flex items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 30, height: 30, flexShrink: 0 }}>
              <SlotSymbolDisplay id={sym.id} size={30} />
            </div>
            <span className="font-karla text-sm flex-1" style={{ color: sym.color }}>{sym.label}</span>
            <span className="font-cinzel font-700 text-[#f0ede8] text-sm">{SLOT_PAYOUTS[sym.id]}×</span>
          </div>
        ))}
        <div className="flex items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
            <AnchorSVG size={22} />
          </div>
          <span className="font-karla text-sm flex-1" style={{ color: '#34d399' }}>Anchor</span>
          <span className="font-cinzel font-700 text-sm" style={{ color: '#34d399' }}>Free Spin</span>
        </div>
      </div>
    </div>
  )
}
