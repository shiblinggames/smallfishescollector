'use client'

import { useState, useEffect, useRef } from 'react'
import { spinSlots } from './actions'
import type { SlotSpinResult, SlotStats } from './actions'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PARTIAL_PAYOUTS, SLOTS_DAILY_CAP, SLOTS_MIN_BET, SLOTS_MAX_BET } from './constants'
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
      src="/models/hooks/steel-hook.png"
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
function Reel({ symbol, rolling, won, winColor, nearMiss, nearMissOdd, matchColor, matchWild }: {
  symbol: SlotSymbolId
  rolling: boolean
  won: boolean
  winColor?: string
  nearMiss?: boolean    // part of a near-miss (orange)
  nearMissOdd?: boolean // the reel that broke the near-miss
  matchColor?: string   // partial/wild win — matching pair, tinted in fish color
  matchWild?: boolean   // hook acting as wild (teal)
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

  const borderColor = won ? (winColor ?? color)
    : matchWild ? '#34d399'
    : matchColor ? matchColor
    : nearMiss ? '#f97316'
    : nearMissOdd ? 'rgba(255,255,255,0.06)'
    : (rolling ? 'rgba(255,255,255,0.10)' : color)
  const bg = won ? `${winColor ?? color}22`
    : matchWild ? '#34d39918'
    : matchColor ? `${matchColor}18`
    : nearMiss ? '#f9731618'
    : (rolling ? 'rgba(255,255,255,0.07)' : `${color}18`)
  const shadow = won
    ? `0 0 28px ${winColor ?? color}70, 0 0 56px ${winColor ?? color}30`
    : matchWild ? '0 0 18px #34d39960'
    : matchColor ? `0 0 18px ${matchColor}60`
    : nearMiss ? '0 0 18px #f9731660'
    : (rolling ? 'none' : `0 0 20px ${color}38`)
  const anim = won
    ? 'reel-pop 0.55s cubic-bezier(0.36,0.07,0.19,0.97) forwards'
    : nearMissOdd ? 'near-miss-wobble 0.55s ease-out'
    : (nearMiss || matchColor || matchWild) ? 'match-glow 1.6s ease-in-out infinite'
    : 'none'

  return (
    <div
      style={{
        width: 96, height: 96,
        background: bg,
        border: `2.5px solid ${borderColor}`,
        borderRadius: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: shadow,
        overflow: 'hidden',
        animation: anim,
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
    } else if (result.outcome === 'refund') {
      setTimeout(() => {
        setFlashColor('#34d399')
        setFlashKey((k) => k + 1)
        applyStats(result.net)
        setDoubloons(result.newDoubloons)
        setDailyWagered(result.dailyWagered)
        setLastResult(result)
        setShowResult(true)
        setSpinning(false)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
      }, lastMainStop + 150)
    } else if (result.outcome === 'partial_win' || result.outcome === 'wild_win') {
      setTimeout(() => {
        if (result.net > 0 && result.matchedSymbol) {
          setFlashColor(result.outcome === 'wild_win' ? '#34d399' : symColor(result.matchedSymbol))
          setFlashKey((k) => k + 1)
        }
        applyStats(result.net)
        setDoubloons(result.newDoubloons)
        setDailyWagered(result.dailyWagered)
        setLastResult(result)
        setShowResult(true)
        setSpinning(false)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloons }))
      }, lastMainStop + 150)
    } else {
      // near_miss or lose
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

  // Near-miss: which 2 reels match, and which is the odd one out
  const isNearMiss = showResult && lastResult?.outcome === 'near_miss'
  const nearMissSymbol = isNearMiss
    ? (reels[0] === reels[1] ? reels[0] : reels[0] === reels[2] ? reels[0] : reels[1])
    : null
  // Refund: 2 hooks lit up teal
  const isRefund = showResult && lastResult?.outcome === 'refund'
  // Partial / wild win: matched fish pair glows in fish color; hook glows teal for wild
  const isPartialWin = showResult && (lastResult?.outcome === 'partial_win' || lastResult?.outcome === 'wild_win')
  const partialMatchedSym = isPartialWin ? lastResult?.matchedSymbol : undefined
  const partialMatchColor = partialMatchedSym ? symColor(partialMatchedSym) : undefined

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
        @keyframes match-glow {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.72; }
        }
        @keyframes near-miss-wobble {
          0%, 100%  { transform: translateX(0); }
          18%       { transform: translateX(-6px); }
          36%       { transform: translateX(6px); }
          54%       { transform: translateX(-4px); }
          72%       { transform: translateX(4px); }
          88%       { transform: translateX(-2px); }
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
              won={wonMainReels || (isRefund && sym === 'anchor')}
              winColor={wonMainReels ? winColor : isRefund ? '#34d399' : undefined}
              nearMiss={!!(isNearMiss && nearMissSymbol && sym === nearMissSymbol)}
              nearMissOdd={!!(isNearMiss && nearMissSymbol && sym !== nearMissSymbol)}
              matchColor={isPartialWin && partialMatchedSym && sym === partialMatchedSym ? partialMatchColor : undefined}
              matchWild={!!(isPartialWin && lastResult?.outcome === 'wild_win' && sym === 'anchor')}
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
              <p className="font-karla font-400 text-[#9a9488] text-xs mt-1">
                {SLOT_PAYOUTS[winSym]}× your bet
              </p>
            </div>
          ) : showResult && lastResult?.outcome === 'refund' ? (
            <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
              <p className="font-cinzel font-700 tracking-wide" style={{ fontSize: '1.1rem', color: '#34d399', textShadow: '0 0 24px #34d39960', letterSpacing: '0.04em', lineHeight: 1.1 }}>
                2 Hooks · Refund!
              </p>
              <p className="font-karla font-400 mt-1" style={{ fontSize: '0.85rem', color: '#34d399' }}>
                Wager returned
              </p>
            </div>
          ) : showResult && (lastResult?.outcome === 'partial_win' || lastResult?.outcome === 'wild_win') ? (() => {
            const sym = lastResult!.matchedSymbol
            const label = sym ? SLOT_SYMBOLS_LIST.find(s => s.id === sym)?.label : ''
            const color = sym ? symColor(sym) : '#f0c040'
            const mult = sym ? SLOT_PARTIAL_PAYOUTS[sym] : 1
            const isWild = lastResult!.outcome === 'wild_win'
            return (
              <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
                {isWild && (
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.65rem', color: '#34d399', marginBottom: 3 }}>
                    Hook Wild!
                  </p>
                )}
                <p className="font-cinzel font-700 tracking-wide" style={{ fontSize: '1.15rem', color, textShadow: `0 0 24px ${color}60`, letterSpacing: '0.04em', lineHeight: 1.1 }}>
                  2× {label}
                </p>
                <p className="font-cinzel font-700 mt-1" style={{ fontSize: '1.25rem', color: lastResult!.net >= 0 ? '#f0ede8' : '#f87171' }}>
                  {lastResult!.net === 0 ? 'Break even' : lastResult!.net > 0 ? `+${lastResult!.net.toLocaleString()} ⟡` : `${lastResult!.net.toLocaleString()} ⟡`}
                </p>
                <p className="font-karla font-400 text-[#9a9488] text-xs mt-1">{mult}× your bet</p>
              </div>
            )
          })() : showResult && lastResult?.outcome === 'near_miss' ? (
            <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
              <p className="font-cinzel font-700 tracking-wide" style={{ fontSize: '1.1rem', color: '#f97316', textShadow: '0 0 24px #f9731660', letterSpacing: '0.04em', lineHeight: 1.1 }}>
                So Close!
              </p>
              <p className="font-cinzel font-700 mt-1" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>
                {lastResult.net.toLocaleString()} ⟡
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
                    background: wager === amt ? 'rgba(240,192,64,0.18)' : 'rgba(8,8,6,0.72)',
                    border: `1px solid ${wager === amt ? '#f0c040' : 'rgba(255,255,255,0.18)'}`,
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
          <div className="w-full rounded-xl overflow-hidden" style={{ background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)' }}>
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] px-4 pt-3 pb-2" style={{ fontSize: '0.6rem' }}>
              Your Stats
            </p>
            <div className="grid grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="flex flex-col items-center py-3 px-2" style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{stats.spins.toLocaleString()}</p>
                <p className="font-karla text-[#6a6764] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Spins</p>
              </div>
              <div className="flex flex-col items-center py-3 px-2" style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}>
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
        <div className="w-full rounded-xl overflow-hidden" style={{ background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)' }}>
          {/* 3-of-a-kind */}
          <p className="font-karla font-700 uppercase tracking-[0.12em] px-4 pt-3 pb-2" style={{ fontSize: '0.68rem', color: '#b0ada8' }}>
            3 of a Kind
          </p>
          {SLOT_SYMBOLS_LIST.filter((s) => s.id !== 'anchor').map((sym) => (
            <div key={sym.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ width: 30, height: 30, flexShrink: 0 }}>
                <SlotSymbolDisplay id={sym.id} size={30} />
              </div>
              <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>{sym.label}</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: sym.color }}>{SLOT_PAYOUTS[sym.id]}×</span>
            </div>
          ))}
          {/* 2-of-a-kind */}
          <p className="font-karla font-700 uppercase tracking-[0.12em] px-4 pt-3 pb-2" style={{ fontSize: '0.68rem', color: '#b0ada8', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            2 of a Kind · Hook counts as Wild
          </p>
          {SLOT_SYMBOLS_LIST.filter((s) => s.id !== 'anchor').map((sym) => {
            const mult = SLOT_PARTIAL_PAYOUTS[sym.id]
            if (!mult) return null
            return (
              <div key={sym.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ width: 30, height: 30, flexShrink: 0 }}>
                  <SlotSymbolDisplay id={sym.id} size={30} />
                </div>
                <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>{sym.label}</span>
                <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: mult >= 1 ? sym.color : '#9a9488' }}>
                  {mult === 1 ? 'Even' : `${mult}×`}
                </span>
              </div>
            )
          })}
          {/* Hooks */}
          <p className="font-karla font-700 uppercase tracking-[0.12em] px-4 pt-3 pb-2" style={{ fontSize: '0.68rem', color: '#b0ada8', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            Hooks
          </p>
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <HookImage size={14} /><HookImage size={14} />
            </div>
            <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>2 Hooks (anywhere)</span>
            <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#34d399' }}>Refund</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ width: 30, height: 30, flexShrink: 0 }}>
              <HookImage size={30} />
            </div>
            <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>3 Hooks</span>
            <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#34d399' }}>Free Spin</span>
          </div>
        </div>
      </div>
    </>
  )
}
