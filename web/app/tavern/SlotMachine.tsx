'use client'

import { useState, useEffect, useRef } from 'react'
import { spinSlots } from './actions'
import type { SlotSpinResult, SlotStats } from './actions'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOTS_DAILY_CAP, SLOTS_MIN_BET, SLOTS_MAX_BET } from './constants'
import type { SlotSymbolId } from './constants'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ALL_IDS: SlotSymbolId[] = SLOT_SYMBOLS_LIST.map((s) => s.id)

const WIN_LABEL: Record<SlotSymbolId, string> = {
  common:    '2× Match',
  rare:      'Rare Catch!',
  legendary: 'Legendary!',
  catfish:   'JACKPOT!!',
  anchor:    'Bonus Spin!',
}

function symColor(id: SlotSymbolId) {
  return SLOT_SYMBOLS_LIST.find((s) => s.id === id)?.color ?? '#f0c040'
}

function HookImage({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/models/hooks/legendary-hook.png"
      alt="Hook"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  )
}

function SlotSymbolDisplay({ id, size = 56 }: { id: SlotSymbolId; size?: number }) {
  const sym = SLOT_SYMBOLS_LIST.find((s) => s.id === id)!
  if (id === 'anchor') {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <HookImage size={Math.round(size * 0.9)} />
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

// Each reel stops independently — no delay prop needed
function Reel({ symbol, rolling, won, winColor }: {
  symbol: SlotSymbolId
  rolling: boolean
  won: boolean
  winColor?: string
}) {
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
      // Small snap delay so the last cycling frame has time to render
      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setDisplay(symbol)
      }, 60)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [rolling, symbol])

  const sym = SLOT_SYMBOLS_LIST.find((s) => s.id === display)!
  const color = won && winColor ? winColor : sym.color

  return (
    <div
      style={{
        width: 96, height: 96,
        background: won ? `${color}22` : (rolling ? 'rgba(255,255,255,0.07)' : `${color}18`),
        border: `2.5px solid ${won ? color : (rolling ? 'rgba(255,255,255,0.10)' : color)}`,
        borderRadius: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: won
          ? `0 0 28px ${color}70, 0 0 56px ${color}30`
          : (rolling ? 'none' : `0 0 20px ${color}38`),
        overflow: 'hidden',
        animation: won ? 'reel-pop 0.55s cubic-bezier(0.36,0.07,0.19,0.97) forwards' : 'none',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <SlotSymbolDisplay id={display} size={68} />
    </div>
  )
}

// Stop reels left-to-right with a gap between each
function stopReels(
  setter: (v: boolean[]) => void,
  baseDelay: number,
  gap = 300,
): number {
  setTimeout(() => setter([false, true,  true]),  baseDelay)
  setTimeout(() => setter([false, false, true]),  baseDelay + gap)
  setTimeout(() => setter([false, false, false]), baseDelay + gap * 2)
  return baseDelay + gap * 2  // ms when last reel stops
}

const BET_PRESETS = [10, 25, 50, 100, 250, 500]

interface Props {
  doubloons: number
  dailyWagered: number
  initialStats: SlotStats
}

export default function SlotMachine({ doubloons: initialDoubloons, dailyWagered: initialWagered, initialStats }: Props) {
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [dailyWagered, setDailyWagered] = useState(initialWagered)
  const [wager, setWager] = useState(25)
  const [spinning, setSpinning] = useState(false)
  const [mainRolling, setMainRolling] = useState([false, false, false])
  const [reels, setReels] = useState<SlotSymbolId[]>(['common', 'rare', 'legendary'])
  const [bonusRolling, setBonusRolling] = useState([false, false, false])
  const [bonusReels, setBonusReels] = useState<SlotSymbolId[]>(['common', 'rare', 'legendary'])
  const [showBonus, setShowBonus] = useState(false)
  const [lastResult, setLastResult] = useState<SlotSpinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  // Celebration state
  const [wonMainReels, setWonMainReels] = useState(false)
  const [wonBonusReels, setWonBonusReels] = useState(false)
  const [winSym, setWinSym] = useState<SlotSymbolId | null>(null)
  const [stats, setStats] = useState<SlotStats>(initialStats)
  const [flashKey, setFlashKey] = useState(0)
  const [flashColor, setFlashColor] = useState('#f0c040')
  const [jackpotShake, setJackpotShake] = useState(false)

  const dailyRemaining = SLOTS_DAILY_CAP - dailyWagered
  const canSpin = !spinning && wager >= SLOTS_MIN_BET && wager <= Math.min(SLOTS_MAX_BET, doubloons, dailyRemaining) && dailyRemaining > 0

  function applyStats(net: number) {
    setStats((prev) => ({
      spins: prev.spins + 1,
      net: prev.net + net,
      biggestWin: net > prev.biggestWin ? net : prev.biggestWin,
    }))
  }

  function triggerWin(sym: SlotSymbolId, isBonus: boolean) {
    const color = symColor(sym)
    if (isBonus) setWonBonusReels(true)
    else setWonMainReels(true)
    setWinSym(sym)
    setFlashColor(color)
    setFlashKey((k) => k + 1)
    if (sym === 'catfish') {
      setJackpotShake(true)
      setTimeout(() => setJackpotShake(false), 700)
    }
  }

  async function handleSpin() {
    if (!canSpin) return
    setError(null)
    setLastResult(null)
    setShowResult(false)
    setShowBonus(false)
    setWonMainReels(false)
    setWonBonusReels(false)
    setWinSym(null)
    setJackpotShake(false)
    setSpinning(true)
    setMainRolling([true, true, true])

    const result = await spinSlots(wager)

    if ('error' in result) {
      setSpinning(false)
      setMainRolling([false, false, false])
      setError(result.error)
      return
    }

    setReels(result.reels)

    // Stop main reels left → right, 300ms apart, starting at 1200ms
    const lastMainStop = stopReels(setMainRolling, 1200, 300)
    // lastMainStop = 1800ms, last reel snaps at ~1860ms

    if (result.bonus) {
      // Flash teal when all anchors have landed
      setTimeout(() => {
        setFlashColor('#34d399')
        setFlashKey((k) => k + 1)
      }, lastMainStop + 150)

      // Show bonus section shortly after
      setTimeout(() => {
        setShowBonus(true)
        setBonusReels(result.bonus!.reels)
        setBonusRolling([true, true, true])

        // Stop bonus reels left → right
        const lastBonusStop = stopReels(setBonusRolling, 1000, 300)

        setTimeout(() => {
          const bonusWin = result.bonus!.outcome === 'win'
          if (bonusWin) triggerWin(result.bonus!.reels[0], true)
          applyStats(result.net)
          setDoubloons(result.newDoubloons)
          setDailyWagered(result.dailyWagered)
          setLastResult(result)
          setShowResult(true)
          setSpinning(false)
          window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
        }, lastBonusStop + 200)

      }, lastMainStop + 500)

    } else if (result.outcome === 'win') {
      setTimeout(() => {
        triggerWin(result.reels[0], false)
        applyStats(result.net)
        setDoubloons(result.newDoubloons)
        setDailyWagered(result.dailyWagered)
        setLastResult(result)
        setShowResult(true)
        setSpinning(false)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
      }, lastMainStop + 150)
    } else {
      setTimeout(() => {
        applyStats(result.net)
        setDoubloons(result.newDoubloons)
        setDailyWagered(result.dailyWagered)
        setLastResult(result)
        setShowResult(true)
        setSpinning(false)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
      }, lastMainStop + 150)
    }
  }

  const winColor = winSym ? symColor(winSym) : '#f0c040'
  const isJackpot = winSym === 'catfish'

  return (
    <>
      <style>{`
        @keyframes reel-pop {
          0%   { transform: scale(1); }
          28%  { transform: scale(1.16); }
          52%  { transform: scale(0.94); }
          72%  { transform: scale(1.08); }
          88%  { transform: scale(0.98); }
          100% { transform: scale(1); }
        }
        @keyframes flash-fade {
          0%   { opacity: 0.40; }
          100% { opacity: 0; }
        }
        @keyframes result-rise {
          0%   { opacity: 0; transform: translateY(18px) scale(0.88); }
          55%  { transform: translateY(-4px) scale(1.04); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes jackpot-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          15%  { transform: translateX(-6px) rotate(-1.5deg); }
          30%  { transform: translateX(6px) rotate(1.5deg); }
          45%  { transform: translateX(-5px) rotate(-1deg); }
          60%  { transform: translateX(5px) rotate(1deg); }
          75%  { transform: translateX(-3px); }
          90%  { transform: translateX(3px); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.65; }
        }
      `}</style>

      {/* Full-screen flash */}
      <div
        key={flashKey}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none',
          background: flashColor,
          animation: flashKey > 0 ? 'flash-fade 0.75s ease-out forwards' : 'none',
          opacity: 0,
        }}
      />

      <div
        className="flex flex-col items-center gap-6 w-full"
        style={{ animation: jackpotShake ? 'jackpot-shake 0.65s ease-out' : 'none' }}
      >
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
            <Reel
              key={i}
              symbol={sym}
              rolling={mainRolling[i]}
              won={wonMainReels}
              winColor={wonMainReels ? winColor : undefined}
            />
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
                <Reel
                  key={i}
                  symbol={sym}
                  rolling={bonusRolling[i]}
                  won={wonBonusReels}
                  winColor={wonBonusReels ? winColor : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        <div style={{ minHeight: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {showResult && lastResult && winSym ? (
            <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
              <p
                className="font-cinzel font-700 tracking-wide"
                style={{
                  fontSize: isJackpot ? '1.7rem' : winSym === 'legendary' ? '1.35rem' : '1.1rem',
                  color: winColor,
                  textShadow: `0 0 24px ${winColor}70`,
                  animation: 'glow-pulse 1.4s ease-in-out infinite',
                  letterSpacing: isJackpot ? '0.08em' : '0.04em',
                  lineHeight: 1.1,
                }}
              >
                {WIN_LABEL[winSym]}
              </p>
              <p className="font-cinzel font-700 mt-1" style={{ fontSize: isJackpot ? '1.5rem' : '1.25rem', color: '#f0ede8' }}>
                +{lastResult.net.toLocaleString()} ⟡
              </p>
              <p className="font-karla font-400 text-[#6a6764] text-xs mt-1">
                {SLOT_PAYOUTS[winSym]}× your bet
              </p>
            </div>
          ) : showResult && lastResult && lastResult.net === 0 ? (
            <p className="font-karla font-400 text-sm" style={{ color: '#34d399' }}>Bonus spin — no win this time</p>
          ) : showResult && lastResult ? (
            <p className="font-karla font-400 text-[#6a6764] text-sm">{lastResult.net.toLocaleString()} ⟡</p>
          ) : null}
        </div>

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

        {/* Stats */}
        {stats.spins > 0 && (
          <div className="w-full rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] px-4 pt-3 pb-2" style={{ fontSize: '0.6rem' }}>
              Your Stats
            </p>
            <div className="grid grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex flex-col items-center py-3 px-2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{stats.spins.toLocaleString()}</p>
                <p className="font-karla text-[#6a6764] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Spins</p>
              </div>
              <div className="flex flex-col items-center py-3 px-2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: stats.net >= 0 ? '#4ade80' : '#f87171' }}>
                  {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
                </p>
                <p className="font-karla text-[#6a6764] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Net ⟡</p>
              </div>
              <div className="flex flex-col items-center py-3 px-2">
                <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1rem' }}>
                  {stats.biggestWin > 0 ? `+${stats.biggestWin.toLocaleString()}` : '—'}
                </p>
                <p className="font-karla text-[#6a6764] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Best Win</p>
              </div>
            </div>
          </div>
        )}

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
            <div style={{ width: 30, height: 30, flexShrink: 0 }}>
              <HookImage size={30} />
            </div>
            <span className="font-karla text-sm flex-1" style={{ color: '#34d399' }}>Hook</span>
            <span className="font-cinzel font-700 text-sm" style={{ color: '#34d399' }}>Free Spin</span>
          </div>
        </div>
      </div>
    </>
  )
}
