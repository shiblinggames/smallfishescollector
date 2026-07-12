'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import DetentSlider from '@/components/DetentSlider'
import { spinSlots } from './actions'
import type { SlotSpinResult, SlotStats, SlotsJackpotState } from './actions'
import { buyInCasino, cashOutCasino } from './casino/actions'
import DenNav from './casino/DenNav'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PAIR_PAYOUTS, SLOTS_MIN_BET, SLOTS_MAX_BET, CASINO_BUY_IN_PRESETS, CASINO_BUY_IN_MIN, CASINO_BUY_IN_MAX } from './constants'
import type { SlotSymbolId } from './constants'
import { useAnimatedNumber } from './useAnimatedNumber'
import { vibrate as haptic } from '@/lib/haptics'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ALL_IDS: SlotSymbolId[] = SLOT_SYMBOLS_LIST.map((s) => s.id)

const WIN_LABEL: Record<SlotSymbolId, string> = {
  common:    'Full School!',
  rare:      'Marlin Run!',
  legendary: 'Whale of a Win!',
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
      src="/hook_steel_thumb.png"
      alt="Hook"
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
    />
  )
}

function SlotSymbolDisplay({ id, size }: { id: SlotSymbolId; size?: number }) {
  const sym = SLOT_SYMBOLS_LIST.find((s) => s.id === id)!
  if (id === 'anchor') {
    if (size !== undefined) {
      return (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <HookImage size={Math.round(size * 0.9)} />
        </div>
      )
    }
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hook_steel_thumb.png" alt="Hook" style={{ width: '72%', height: '72%', objectFit: 'contain', display: 'block' }} />
      </div>
    )
  }
  if (size !== undefined) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${SUPABASE_URL}/storage/v1/object/public/card-arts/${sym.filename}`}
        alt={sym.label}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${SUPABASE_URL}/storage/v1/object/public/card-arts/${sym.filename}`}
      alt={sym.label}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: '8%' }}
    />
  )
}

/** Smoothly counts the displayed pot toward its target whenever the
 *  target changes. Eased cubic so the last few digits settle slowly,
 *  like a harbor tote board. Handles both directions (a jackpot claim
 *  ticks the pot DOWN to its reseeded value). */
function PotTicker({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    const start = performance.now()
    const dur = Math.min(1400, 500 + Math.abs(value - from) * 1.5)
    let raf: number
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      const next = Math.round(from + (value - from) * eased)
      setDisplay(next)
      if (p < 1) raf = requestAnimationFrame(step)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{display.toLocaleString()}</>
}

// Each reel stops independently — no delay prop needed
function Reel({ symbol, rolling, won, winColor, winDelayMs = 0, nearMiss, nearMissOdd, matchColor, onLand }: {
  symbol: SlotSymbolId
  rolling: boolean
  won: boolean
  winColor?: string
  /** Stagger the win-pop animation per reel so the row reads left-to-right
   *  instead of all three landing simultaneously. Casino feel: line traces. */
  winDelayMs?: number
  nearMiss?: boolean    // part of a near-miss (orange)
  nearMissOdd?: boolean // the reel that broke the near-miss
  matchColor?: string   // pair win — matching pair, tinted in fish color
  /** Fires once when the rolling state flips false — used to thump a tiny
   *  haptic on each reel landing. Android only; iOS no-ops. */
  onLand?: () => void
}) {
  // A real spinning reel: a vertical strip of symbols (3 copies of the set for
  // runway) scrolls upward with motion blur while rolling, then eases to a stop
  // with the target symbol centered — instead of flipping symbols in place.
  const winRef = useRef<HTMLDivElement | null>(null)   // the window (clips the strip)
  const stripRef = useRef<HTMLDivElement | null>(null) // the moving column
  const posRef = useRef(0)                             // current scroll distance (px)
  const rafRef = useRef<number | null>(null)
  const tileHRef = useRef(96)
  const startedRef = useRef(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [landedSym, setLandedSym] = useState<SlotSymbolId>(symbol)

  const LEN = ALL_IDS.length
  const strip = useMemo(() => [...ALL_IDS, ...ALL_IDS, ...ALL_IDS], [])
  const setY = (px: number) => { if (stripRef.current) stripRef.current.style.transform = `translateY(${-px}px)` }

  // Keep tile height in sync with the (responsive) reel window.
  useEffect(() => {
    const measure = () => {
      if (!winRef.current) return
      tileHRef.current = winRef.current.clientHeight
      if (!isSpinning) { posRef.current = ALL_IDS.indexOf(landedSym) * tileHRef.current; setY(posRef.current) }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (winRef.current) ro.observe(winRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tileH = tileHRef.current
    if (rolling) {
      startedRef.current = true
      setIsSpinning(true)
      if (stripRef.current) { stripRef.current.style.transition = 'none'; stripRef.current.style.filter = 'blur(2.4px)' }
      const speed = tileH * 24 // ~24 tiles/sec
      let last = performance.now()
      const loop = (t: number) => {
        const dt = Math.min(0.05, (t - last) / 1000); last = t
        posRef.current = (posRef.current + speed * dt) % (LEN * tileH)
        setY(posRef.current)
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }

    // Not rolling:
    if (!startedRef.current) {
      // Never spun — just place the target instantly (no settle animation).
      posRef.current = ALL_IDS.indexOf(symbol) * tileH
      if (stripRef.current) stripRef.current.style.transition = 'none'
      setY(posRef.current)
      setLandedSym(symbol)
      return
    }
    // Land: normalize the current (looping) position, then ease one rotation
    // ahead onto the target — strong ease-out so it snaps fast then settles.
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const p0 = posRef.current % (LEN * tileH)
    if (stripRef.current) { stripRef.current.style.transition = 'none' }
    setY(p0)
    const ti = ALL_IDS.indexOf(symbol)
    const finalPos = (LEN + ti) * tileH
    posRef.current = finalPos
    const raf = requestAnimationFrame(() => {
      if (!stripRef.current) return
      stripRef.current.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
      stripRef.current.style.filter = 'blur(0px)'
      setY(finalPos)
    })
    const to = setTimeout(() => { setIsSpinning(false); setLandedSym(symbol); onLand?.() }, 360)
    return () => { cancelAnimationFrame(raf); clearTimeout(to) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, symbol])

  const sym = SLOT_SYMBOLS_LIST.find((s) => s.id === (isSpinning ? symbol : landedSym))!
  const color = won && winColor ? winColor : sym.color
  const rollingNow = isSpinning

  const borderColor = won ? (winColor ?? color)
    : matchColor ? matchColor
    : nearMiss ? '#f97316'
    : nearMissOdd ? 'rgba(255,255,255,0.06)'
    : (rollingNow ? 'rgba(255,255,255,0.10)' : `${color}90`)
  const bg = won ? `${winColor ?? color}40`
    : matchColor ? `${matchColor}25`
    : nearMiss ? 'rgba(249,115,22,0.22)'
    : 'rgba(6,5,4,0.92)'
  const shadow = won
    ? `0 0 28px ${winColor ?? color}70, 0 0 56px ${winColor ?? color}30`
    : matchColor ? `0 0 18px ${matchColor}60`
    : nearMiss ? '0 0 18px #f9731660'
    : (rollingNow ? 'inset 0 6px 14px rgba(0,0,0,0.55)' : `inset 0 6px 14px rgba(0,0,0,0.45), 0 0 14px ${color}28`)
  const anim = won
    ? `reel-pop 0.55s cubic-bezier(0.36,0.07,0.19,0.97) ${winDelayMs}ms forwards`
    : nearMissOdd ? 'near-miss-wobble 0.55s ease-out'
    : (nearMiss || matchColor) ? 'match-glow 1.6s ease-in-out infinite'
    : 'none'

  return (
    <div
      ref={winRef}
      className="w-24 h-24 sm:w-[130px] sm:h-[130px]"
      style={{
        position: 'relative',
        background: bg,
        border: `2px solid ${borderColor}`,
        borderRadius: 14,
        boxShadow: shadow,
        overflow: 'hidden',
        animation: anim,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* The scrolling strip — 3 copies of the symbol set stacked vertically,
          each tile sized to the (square) reel window. */}
      <div ref={stripRef} style={{ willChange: 'transform' }}>
        {strip.map((s, k) => (
          <div key={k} style={{ width: '100%', aspectRatio: '1 / 1' }}>
            <SlotSymbolDisplay id={s} />
          </div>
        ))}
      </div>
      {/* Soft top/bottom shade so symbols fade into the cabinet edges. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12, background: 'linear-gradient(180deg, rgba(6,5,4,0.55) 0%, transparent 24%, transparent 76%, rgba(6,5,4,0.55) 100%)' }} />
      {/* Glass highlight across the top of the reel window */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 22%, transparent 45%)',
        }}
      />
    </div>
  )
}

// Stop reels left-to-right with a gap between each. `thirdReelHoldMs`
// lets the caller stretch the wait before the third reel snaps — used
// when reels[0] and reels[1] are about to land matching, so the third
// reel keeps spinning and the player gets the classic casino "is it
// going to land?" tension. Both outcomes (win OR near-miss) trigger
// the same hold because the suspense is identical until the symbol
// resolves.
function stopReels(
  setter: (v: boolean[]) => void,
  baseDelay: number,
  gap = 300,
  thirdReelHoldMs = 0,
): number {
  setTimeout(() => setter([false, true,  true]),  baseDelay)
  setTimeout(() => setter([false, false, true]),  baseDelay + gap)
  setTimeout(() => setter([false, false, false]), baseDelay + gap * 2 + thirdReelHoldMs)
  return baseDelay + gap * 2 + thirdReelHoldMs
}

const BET_PRESETS = [10, 25, 50, 100, 250, 500]

// Brass / wood palette for the cabinet
const BRASS       = '#c9a24a'
const BRASS_DIM   = 'rgba(201,162,74,0.45)'
const WOOD_DARK   = '#15100a'
const WOOD_MID    = '#241a10'

interface Props {
  chips: number          // shared casino purse
  doubloons: number
  sessionBuyIns: number  // shared session buy-in total (gates the tally display)
  sessionNet: number     // slots' own session win/loss
  dailyRemaining: number // shared daily buy-in headroom
  initialStats: SlotStats
  initialJackpot: SlotsJackpotState
}

export default function SlotMachine({ chips: initialChips, doubloons: initialDoubloons, sessionBuyIns: initialSessionBuyIns, sessionNet: initialSessionNet, dailyRemaining: initialDailyRemaining, initialStats, initialJackpot }: Props) {
  const [chips, setChips] = useState(initialChips)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [sessionBuyIns, setSessionBuyIns] = useState(initialSessionBuyIns)
  const [sessionNet, setSessionNet] = useState(initialSessionNet)
  const [dailyRemaining, setDailyRemaining] = useState(initialDailyRemaining)
  const [buyInAmount, setBuyInAmount] = useState(500)
  const [walletBusy, setWalletBusy] = useState(false)
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

  // Jackpot state
  const [pot, setPot] = useState(initialJackpot.pot)
  const [lastWinner, setLastWinner] = useState<{ name: string | null; amount: number | null }>({
    name: initialJackpot.lastWinnerName,
    amount: initialJackpot.lastWinAmount,
  })
  const [potTease, setPotTease] = useState(false)
  const [potWon, setPotWon] = useState(false)

  // Win-celebration juice
  const [coins, setCoins] = useState<{ id: number; dx: number; delay: number }[]>([])
  const [edgeGlow, setEdgeGlow] = useState<{ key: number; big: boolean } | null>(null)
  const fxId = useRef(0)
  // Coin spill + screen-edge glow, scaled by win tier.
  function celebrateWin(sym: SlotSymbolId) {
    const big = sym === 'catfish' || sym === 'legendary'
    const n = sym === 'catfish' ? 20 : sym === 'legendary' ? 13 : sym === 'rare' ? 8 : 5
    setCoins(Array.from({ length: n }, () => ({ id: fxId.current++, dx: (Math.random() * 2 - 1) * 72, delay: Math.random() * 0.18 })))
    setTimeout(() => setCoins([]), 1300)
    setEdgeGlow({ key: fxId.current++, big })
    setTimeout(() => setEdgeGlow(null), big ? 1500 : 950)
  }

  // Celebration state
  const [wonMainReels, setWonMainReels] = useState(false)
  const [wonBonusReels, setWonBonusReels] = useState(false)
  const [winSym, setWinSym] = useState<SlotSymbolId | null>(null)
  const [stats, setStats] = useState<SlotStats>(initialStats)
  const [flashKey, setFlashKey] = useState(0)
  const [flashColor, setFlashColor] = useState('#f0c040')
  const [jackpotShake, setJackpotShake] = useState(false)

  // Spins draw from the shared chip purse now — the daily cap is
  // enforced at buy-in (shared across all casino tables), not per spin.
  const canSpin = !spinning && !walletBusy && wager >= SLOTS_MIN_BET && wager <= Math.min(SLOTS_MAX_BET, chips)
  // No chips to cover even the minimum bet → control deck swaps to the
  // buy-in panel so the player is never stuck at a dead Spin button.
  const needsBuyIn = chips < SLOTS_MIN_BET && !spinning
  const canBuyIn = !walletBusy && buyInAmount >= CASINO_BUY_IN_MIN
    && buyInAmount <= Math.min(CASINO_BUY_IN_MAX, doubloons, dailyRemaining)

  // Animated header counters, blackjack-style: chips tick through the
  // net delta; the tally is slots' OWN session net (chips are shared
  // across casino games, so chips - sessionBuyIns would mix tables).
  const animatedChips = useAnimatedNumber(chips)
  const animatedTally = useAnimatedNumber(sessionNet)

  async function handleBuyIn() {
    if (!canBuyIn) return
    setError(null)
    setWalletBusy(true)
    const r = await buyInCasino(buyInAmount)
    setWalletBusy(false)
    if ('error' in r) { setError(r.error); return }
    setChips(r.newChips)
    setDoubloons(r.newDoubloons)
    setSessionBuyIns(r.sessionBuyIns)
    setDailyRemaining(r.dailyRemaining)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
  }

  async function handleCashOut() {
    if (walletBusy || spinning || chips <= 0) return
    setError(null)
    setWalletBusy(true)
    const r = await cashOutCasino()
    setWalletBusy(false)
    if ('error' in r) { setError(r.error); return }
    setChips(0)
    setDoubloons(r.newDoubloons)
    setSessionBuyIns(0)
    setSessionNet(0)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
  }

  function applyStats(net: number) {
    setStats((prev) => ({
      spins: prev.spins + 1,
      net: prev.net + net,
      biggestWin: net > prev.biggestWin ? net : prev.biggestWin,
    }))
  }

  /** Common bookkeeping once a spin's outcome is revealed. Chips move,
   *  doubloons don't — chip movement is internal to the casino session,
   *  so no Nav currency patch here (that happens at buy-in/cash-out).
   *  On a bust-to-zero the server ends the casino session: sessionBuyIns
   *  and sessionNet come back reset and the tally display clears. */
  function settle(result: SlotSpinResult) {
    applyStats(result.net)
    setChips(result.newChips)
    setSessionNet(result.sessionNet)
    setSessionBuyIns(result.sessionBuyIns)
    setPot(result.pot)
    setLastResult(result)
    setShowResult(true)
    setSpinning(false)
    setPotTease(false)
  }

  function triggerWin(sym: SlotSymbolId, isBonus: boolean) {
    const color = symColor(sym)
    if (isBonus) setWonBonusReels(true)
    else setWonMainReels(true)
    setWinSym(sym)
    setFlashColor(color)
    setFlashKey((k) => k + 1)
    celebrateWin(sym)
    // Win haptic — escalates with payout tier. Catfish gets the
    // longest, most punchy pattern; common is just a confirming pulse.
    if (sym === 'catfish') {
      setJackpotShake(true)
      setTimeout(() => setJackpotShake(false), 700)
      haptic([60, 40, 60, 40, 140])
    } else if (sym === 'legendary') {
      haptic([50, 40, 90])
    } else if (sym === 'rare') {
      haptic([40, 30, 60])
    } else {
      haptic(80)
    }
  }

  function triggerJackpot(isBonus: boolean, winnerName: string | null, amount: number) {
    triggerWin('catfish', isBonus)
    setPotWon(true)
    setLastWinner({ name: winnerName, amount })
    setTimeout(() => setPotWon(false), 3000)
    haptic([80, 50, 80, 50, 80, 50, 200])
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

    // Casino-style third-reel tension: whenever the first two reels are
    // about to land matching, hold the third so the player gets that
    // "is it gonna land?" beat. The hold scales with the stakes — a
    // pair of catfish on deck means the POT is live, so the third reel
    // spins agonizingly long while the jackpot marquee pulses.
    const pairUp = result.reels[0] === result.reels[1]
    const holdMs = !pairUp ? 0
      : result.reels[0] === 'catfish' ? 1600
      : result.reels[0] === 'legendary' ? 1100
      : 750
    if (pairUp && result.reels[0] === 'catfish') {
      setTimeout(() => setPotTease(true), 1200 + 300)
    }
    const lastMainStop = stopReels(setMainRolling, 1200, 300, holdMs)

    if (result.bonus) {
      // Flash teal when all hooks have landed
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
          const b = result.bonus!
          if (b.outcome === 'jackpot') triggerJackpot(true, 'You', b.payout)
          else if (b.outcome === 'win') triggerWin(b.reels[0], true)
          else if (b.outcome === 'pair' && b.matchedSymbol) {
            setFlashColor(symColor(b.matchedSymbol))
            setFlashKey((k) => k + 1)
          }
          settle(result)
        }, lastBonusStop + 200)

      }, lastMainStop + 500)

    } else if (result.outcome === 'jackpot') {
      setTimeout(() => {
        triggerJackpot(false, 'You', result.jackpotWin ?? result.payout)
        settle(result)
      }, lastMainStop + 150)
    } else if (result.outcome === 'win') {
      setTimeout(() => {
        triggerWin(result.reels[0], false)
        settle(result)
      }, lastMainStop + 150)
    } else if (result.outcome === 'refund') {
      setTimeout(() => {
        setFlashColor('#34d399')
        setFlashKey((k) => k + 1)
        settle(result)
      }, lastMainStop + 150)
    } else if (result.outcome === 'pair_win') {
      setTimeout(() => {
        if (result.matchedSymbol) {
          setFlashColor(symColor(result.matchedSymbol))
          setFlashKey((k) => k + 1)
          haptic([30, 30, 50])
        }
        settle(result)
      }, lastMainStop + 150)
    } else {
      // near_miss or lose
      setTimeout(() => {
        settle(result)
      }, lastMainStop + 150)
    }
  }

  const winColor = winSym ? symColor(winSym) : '#f0c040'
  const isJackpot = lastResult?.outcome === 'jackpot' || lastResult?.bonus?.outcome === 'jackpot'

  // Near-miss: which 2 reels match, and which is the odd one out
  const isNearMiss = showResult && lastResult?.outcome === 'near_miss'
  const nearMissSymbol = isNearMiss
    ? (reels[0] === reels[1] ? reels[0] : reels[0] === reels[2] ? reels[0] : reels[1])
    : null
  // Refund: 2 hooks lit up teal
  const isRefund = showResult && lastResult?.outcome === 'refund'
  // Pair win: matched fish pair glows in fish color
  const isPairWin = showResult && lastResult?.outcome === 'pair_win'
  const pairMatchedSym = isPairWin ? lastResult?.matchedSymbol : undefined
  const pairMatchColor = pairMatchedSym ? symColor(pairMatchedSym) : undefined

  // What this wager would claim from the pot right now
  const potShare = Math.floor(pot * Math.min(wager, SLOTS_MAX_BET) / SLOTS_MAX_BET)

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
        @keyframes pot-tease {
          0%, 100% { box-shadow: 0 0 14px rgba(240,192,64,0.25), inset 0 0 18px rgba(240,192,64,0.08); }
          50%      { box-shadow: 0 0 34px rgba(240,192,64,0.65), inset 0 0 26px rgba(240,192,64,0.20); }
        }
        @keyframes pot-won-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
        @keyframes slot-edge-glow {
          0%   { opacity: 0; }
          16%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes slot-coin {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          12%  { transform: translateY(-14px) scale(1.1); opacity: 1; }
          78%  { opacity: 1; }
          100% { transform: translateY(-62vh) scale(0.5); opacity: 0; }
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

      {/* Win celebration — screen-edge gold glow (brighter for big wins). */}
      {edgeGlow && (
        <div key={edgeGlow.key} aria-hidden style={{
          position: 'fixed', inset: 0, zIndex: 190, pointerEvents: 'none', opacity: 0,
          boxShadow: `inset 0 0 ${edgeGlow.big ? 130 : 75}px ${edgeGlow.big ? 60 : 34}px rgba(240,192,64,${edgeGlow.big ? 0.5 : 0.32})`,
          animation: `slot-edge-glow ${edgeGlow.big ? 1.5 : 0.95}s ease-out forwards`,
        }} />
      )}

      {/* Coin spill — erupts from the machine, flies up toward the chip purse. */}
      {coins.length > 0 && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 196, pointerEvents: 'none' }}>
          {coins.map((c) => (
            <div key={c.id} style={{
              position: 'absolute', left: `calc(50% + ${c.dx}px)`, top: '56%',
              width: 15, height: 15, borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #ffe79a 0%, #f0c040 70%)',
              boxShadow: '0 0 9px #f0c040, inset 0 -2px 3px rgba(120,80,10,0.5)',
              animation: `slot-coin 1.05s cubic-bezier(0.2,0.6,0.3,1) ${c.delay}s forwards`,
            }} />
          ))}
        </div>
      )}

      {/* Shared Den back-nav (uniform across the three games). */}
      <div style={{ marginBottom: '0.8rem' }}>
        <DenNav title="Fish Slots" />
      </div>

      {/* Two-column layout on desktop */}
      <div className="w-full sm:flex sm:gap-8 sm:items-start">

        {/* ── Left: the machine ── */}
        <div
          className="flex flex-col items-center gap-5 flex-1 min-w-0"
          style={{ animation: jackpotShake ? 'jackpot-shake 0.65s ease-out' : 'none' }}
        >

          {/* ── Cabinet ── */}
          <div
            className="w-full"
            style={{
              background: `linear-gradient(180deg, ${WOOD_MID} 0%, ${WOOD_DARK} 55%, #0c0906 100%)`,
              border: `2px solid ${BRASS_DIM}`,
              borderRadius: 22,
              boxShadow: '0 14px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}
          >

            {/* Jackpot marquee */}
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(180deg, rgba(240,192,64,0.13) 0%, rgba(240,192,64,0.04) 100%)',
                borderBottom: `1.5px solid ${BRASS_DIM}`,
                padding: '0.85rem 1rem 0.8rem',
                textAlign: 'center',
                overflow: 'hidden',
                animation: potTease ? 'pot-tease 0.9s ease-in-out infinite' : potWon ? 'pot-won-pulse 0.7s ease-in-out infinite' : 'none',
              }}
            >
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.22em', color: '#e0c684' }}>
                Catfish Jackpot
              </p>
              <p
                className="font-cinzel font-700"
                style={{
                  fontSize: '1.9rem',
                  lineHeight: 1.15,
                  color: potWon ? '#ffe9a8' : '#f0c040',
                  textShadow: potTease || potWon ? '0 0 26px rgba(240,192,64,0.85)' : '0 0 14px rgba(240,192,64,0.4)',
                  transition: 'text-shadow 0.3s, color 0.3s',
                }}
              >
                <PotTicker value={pot} /> ⟡
              </p>
              <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#c4b690', marginTop: 2 }}>
                {lastWinner.name && lastWinner.amount
                  ? `Last hooked by ${lastWinner.name} for ${lastWinner.amount.toLocaleString()} ⟡`
                  : 'Every spin feeds the pot. Three catfish takes it.'}
              </p>
            </div>

            {/* Reel window */}
            <div
              style={{
                padding: '1.15rem 0.9rem',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(240,192,64,0.05) 0%, transparent 55%)',
              }}
            >
              <div className="flex gap-2.5 sm:gap-4 justify-center">
                {reels.map((sym, i) => (
                  <Reel
                    key={i}
                    symbol={sym}
                    rolling={mainRolling[i]}
                    won={wonMainReels || (isRefund && sym === 'anchor')}
                    winColor={wonMainReels ? winColor : isRefund ? '#34d399' : undefined}
                    // Stagger the win pops 130ms apart so the row reads left
                    // to right — eye traces "match … match … match!" instead
                    // of three simultaneous bounces.
                    winDelayMs={i * 130}
                    nearMiss={!!(isNearMiss && nearMissSymbol && sym === nearMissSymbol)}
                    nearMissOdd={!!(isNearMiss && nearMissSymbol && sym !== nearMissSymbol)}
                    matchColor={isPairWin && pairMatchedSym && sym === pairMatchedSym ? pairMatchColor : undefined}
                    // Tiny click on every reel landing. Android players get a
                    // real taptic pulse; iOS no-ops. Crisper than waiting for
                    // the win/lose resolve to fire one big buzz.
                    onLand={() => haptic(15)}
                  />
                ))}
              </div>

              {/* Bonus spin reels, inside the cabinet */}
              {showBonus && (
                <div className="flex flex-col items-center gap-3 w-full" style={{ marginTop: '1rem' }}>
                  <div style={{
                    background: 'rgba(52,211,153,0.12)',
                    border: '1px solid rgba(52,211,153,0.35)',
                    borderRadius: 10,
                    padding: '4px 16px',
                  }}>
                    <p className="font-cinzel font-700 tracking-wide" style={{ color: '#34d399', fontSize: '0.85rem' }}>
                      ⚓ Bonus Spin!
                    </p>
                  </div>
                  <div className="flex gap-2.5 sm:gap-4 justify-center">
                    {bonusReels.map((sym, i) => (
                      <Reel
                        key={i}
                        symbol={sym}
                        rolling={bonusRolling[i]}
                        won={wonBonusReels}
                        winColor={wonBonusReels ? winColor : undefined}
                        winDelayMs={i * 130}
                        matchColor={
                          showResult && lastResult?.bonus?.outcome === 'pair' && lastResult.bonus.matchedSymbol === sym
                            ? symColor(sym)
                            : undefined
                        }
                        onLand={() => haptic(15)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Result line */}
              <div style={{ minHeight: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '0.4rem' }}>
                {showResult && lastResult && isJackpot ? (
                  <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
                    <p
                      className="font-cinzel font-700 tracking-wide"
                      style={{
                        fontSize: '1.7rem',
                        color: '#f0c040',
                        textShadow: '0 0 28px rgba(240,192,64,0.8)',
                        animation: 'glow-pulse 1.4s ease-in-out infinite',
                        letterSpacing: '0.08em',
                        lineHeight: 1.1,
                      }}
                    >
                      THE POT IS YOURS!
                    </p>
                    <p className="font-cinzel font-700 mt-1" style={{ fontSize: '1.5rem', color: '#ffe9a8' }}>
                      +{(lastResult.jackpotWin ?? 0).toLocaleString()} ⟡
                    </p>
                    <p className="font-karla font-400 text-xs mt-1" style={{ color: '#c4b690' }}>
                      Claimed from the Catfish Jackpot
                    </p>
                  </div>
                ) : showResult && lastResult && winSym ? (
                  <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
                    <p
                      className="font-cinzel font-700 tracking-wide"
                      style={{
                        fontSize: winSym === 'legendary' ? '1.35rem' : '1.1rem',
                        color: winColor,
                        textShadow: `0 0 24px ${winColor}70`,
                        animation: 'glow-pulse 1.4s ease-in-out infinite',
                        letterSpacing: '0.04em',
                        lineHeight: 1.1,
                      }}
                    >
                      {WIN_LABEL[winSym]}
                    </p>
                    <p className="font-cinzel font-700 mt-1" style={{ fontSize: '1.25rem', color: '#f0ede8' }}>
                      +{lastResult.net.toLocaleString()} ⟡
                    </p>
                    {/* catfish's multiplier is 0 (its triple normally pays the
                        pot); only shown for the admin big-win fallback, so hide
                        the misleading "0× your bet" line. */}
                    {SLOT_PAYOUTS[winSym] > 0 && (
                      <p className="font-karla font-400 text-[#b3ada2] text-xs mt-1">
                        {SLOT_PAYOUTS[winSym]}× your bet
                      </p>
                    )}
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
                ) : showResult && (lastResult?.outcome === 'pair_win' || (lastResult?.outcome === 'bonus' && lastResult.bonus?.outcome === 'pair')) ? (() => {
                  const sym = lastResult!.outcome === 'pair_win' ? lastResult!.matchedSymbol : lastResult!.bonus?.matchedSymbol
                  const label = sym ? SLOT_SYMBOLS_LIST.find(s => s.id === sym)?.label : ''
                  const color = sym ? symColor(sym) : '#f0c040'
                  const mult = sym ? SLOT_PAIR_PAYOUTS[sym] : 1
                  return (
                    <div style={{ animation: 'result-rise 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards', textAlign: 'center' }}>
                      <p className="font-cinzel font-700 tracking-wide" style={{ fontSize: '1.15rem', color, textShadow: `0 0 24px ${color}60`, letterSpacing: '0.04em', lineHeight: 1.1 }}>
                        {label} Pair!
                      </p>
                      <p className="font-cinzel font-700 mt-1" style={{ fontSize: '1.25rem', color: '#f0ede8' }}>
                        +{lastResult!.net.toLocaleString()} ⟡
                      </p>
                      <p className="font-karla font-400 text-[#b3ada2] text-xs mt-1">{mult}× your bet</p>
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
                ) : showResult && lastResult?.outcome === 'bonus' && lastResult.net === 0 ? (
                  <p className="font-karla font-400 text-sm" style={{ color: '#34d399' }}>Bonus spin, no extra catch this time</p>
                ) : showResult && lastResult ? (
                  <p className="font-karla font-400 text-[#8d8880] text-sm">{lastResult.net.toLocaleString()} ⟡</p>
                ) : (
                  <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#a89e8c' }}>
                    Your bet of {wager} ⟡ would claim {potShare.toLocaleString()} ⟡ of the pot
                  </p>
                )}
              </div>
            </div>

            {/* Control deck */}
            <div
              style={{
                borderTop: `1.5px solid ${BRASS_DIM}`,
                background: 'rgba(0,0,0,0.35)',
                padding: '0.9rem 0.9rem 1rem',
              }}
            >
              {/* Balance row — shared chip purse + slots' session tally
                  + cash out. Doubloons only matter at buy-in. */}
              <div className="flex items-center justify-between" style={{ marginBottom: '0.7rem', gap: 8 }}>
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.52rem', color: '#a68a4a' }}>Chips</p>
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.05rem', lineHeight: 1.1 }}>{animatedChips.toLocaleString()} ⟡</p>
                </div>
                {sessionBuyIns > 0 && (() => {
                  // Sign + color track the ANIMATED value so a swing
                  // through zero counts through red→gray→green.
                  const up = animatedTally > 0
                  const flat = animatedTally === 0
                  const color = flat ? '#8a8478' : up ? '#7fd49a' : '#e07070'
                  return (
                    <div style={{ textAlign: 'center' }}>
                      <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.52rem', color: '#a68a4a' }}>Session</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color, lineHeight: 1.1 }}>
                        {up ? '+' : ''}{animatedTally.toLocaleString()} ⟡
                      </p>
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {chips > 0 && !spinning && (
                    <button
                      type="button"
                      disabled={walletBusy}
                      onClick={handleCashOut}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{
                        padding: '0.45rem 0.75rem', borderRadius: 999,
                        background: 'rgba(196,169,106,0.1)',
                        border: '1px solid rgba(196,169,106,0.45)',
                        color: '#c4a96a',
                        fontSize: '0.58rem',
                        cursor: walletBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Cash Out
                    </button>
                  )}
                </div>
              </div>

              {needsBuyIn ? (
                <>
                  {/* Buy-in panel — shared casino purse is empty, so the
                      deck swaps Spin for the chip counter. */}
                  <p className="font-karla font-400 text-[#a89e8c] text-center" style={{ fontSize: '0.72rem', marginBottom: '0.7rem', lineHeight: 1.5 }}>
                    {dailyRemaining > 0
                      ? <>Trade up to <span style={{ color: '#f0c040' }}>{Math.min(CASINO_BUY_IN_MAX, doubloons, dailyRemaining).toLocaleString()} ⟡</span> for chips. Chips are good at every table in the Den.</>
                      : 'Daily buy-in cap reached, back tomorrow'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '0.8rem' }}>
                    {CASINO_BUY_IN_PRESETS.map(amt => {
                      const disabled = amt > Math.min(CASINO_BUY_IN_MAX, doubloons, dailyRemaining)
                      const selected = buyInAmount === amt
                      return (
                        <button
                          key={amt}
                          type="button"
                          disabled={disabled || walletBusy}
                          onClick={() => setBuyInAmount(amt)}
                          className="font-karla font-700"
                          style={{
                            padding: '0.6rem 0', borderRadius: 10,
                            background: selected ? 'rgba(240,192,64,0.12)' : 'rgba(8,8,6,0.72)',
                            border: `1.5px solid ${selected ? '#f0c040' : 'rgba(255,255,255,0.14)'}`,
                            color: disabled ? '#3a3835' : selected ? '#f0c040' : '#a0a09a',
                            fontSize: '0.78rem',
                            cursor: disabled || walletBusy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {amt} ⟡
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleBuyIn}
                    disabled={!canBuyIn}
                    className="w-full font-cinzel font-700 uppercase active:scale-[0.98]"
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: 14,
                      fontSize: '0.95rem',
                      letterSpacing: '0.1em',
                      background: canBuyIn
                        ? 'linear-gradient(180deg, rgba(240,192,64,0.26) 0%, rgba(240,192,64,0.10) 100%)'
                        : 'rgba(255,255,255,0.04)',
                      border: `2px solid ${canBuyIn ? BRASS : 'rgba(255,255,255,0.10)'}`,
                      color: canBuyIn ? '#f0d696' : '#4a463f',
                      cursor: canBuyIn ? 'pointer' : 'default',
                    }}
                  >
                    {walletBusy ? 'Buying…' : `Buy ${buyInAmount.toLocaleString()} ⟡ in chips`}
                  </button>
                </>
              ) : (
                <>
                  {/* Bet picker — a detent slider (one thumb-flick to any preset,
                      haptic tick per detent) instead of the old row of six tap
                      chips. Unaffordable presets dim + the snap skips them. */}
                  <div style={{ marginBottom: '0.8rem' }}>
                    <DetentSlider
                      values={BET_PRESETS}
                      value={wager}
                      onChange={setWager}
                      disabledFrom={chips}
                    />
                  </div>

                  {/* Spin button — real press-down squish + a tap tick the instant
                      the finger lands (the old active:scale-[0.98] read as limp). */}
                  <motion.button
                    whileTap={canSpin ? { scale: 0.94 } : undefined}
                    transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                    onPointerDown={canSpin ? () => haptic(6) : undefined}
                    onClick={handleSpin}
                    disabled={!canSpin}
                    className="w-full font-cinzel font-700 uppercase"
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: 14,
                      fontSize: '1rem',
                      letterSpacing: '0.12em',
                      background: canSpin
                        ? 'linear-gradient(180deg, rgba(240,192,64,0.26) 0%, rgba(240,192,64,0.10) 100%)'
                        : 'rgba(255,255,255,0.04)',
                      border: `2px solid ${canSpin ? BRASS : 'rgba(255,255,255,0.10)'}`,
                      color: canSpin ? '#f0d696' : '#4a463f',
                      boxShadow: canSpin ? '0 0 22px rgba(240,192,64,0.18), inset 0 1px 0 rgba(255,255,255,0.10)' : 'none',
                      cursor: canSpin ? 'pointer' : 'default',
                    }}
                  >
                    {spinning
                      ? (showBonus ? 'Bonus Spin…' : 'Spinning…')
                      : `Spin · ${wager} ⟡`}
                  </motion.button>
                </>
              )}

              {error && <p className="font-karla font-400 text-[#f87171] text-sm text-center" style={{ marginTop: '0.6rem' }}>{error}</p>}
            </div>
          </div>

          {/* Stats */}
          {stats.spins > 0 && (
            <div className="w-full rounded-xl overflow-hidden" style={{ background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)' }}>
              <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#8d8880] px-4 pt-3 pb-2" style={{ fontSize: '0.6rem' }}>
                Your Stats
              </p>
              <div className="grid grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <div className="flex flex-col items-center py-3 px-2" style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                  <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{stats.spins.toLocaleString()}</p>
                  <p className="font-karla text-[#8d8880] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Spins</p>
                </div>
                <div className="flex flex-col items-center py-3 px-2" style={{ borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: stats.net >= 0 ? '#4ade80' : '#f87171' }}>
                    {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
                  </p>
                  <p className="font-karla text-[#8d8880] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Net ⟡</p>
                </div>
                <div className="flex flex-col items-center py-3 px-2">
                  <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1rem' }}>
                    {stats.biggestWin > 0 ? `+${stats.biggestWin.toLocaleString()}` : '—'}
                  </p>
                  <p className="font-karla text-[#8d8880] mt-0.5" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Best Win</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: payout table ── */}
        <div className="w-full mt-6 sm:mt-0 sm:w-64 flex-shrink-0">
          <div className="w-full rounded-xl overflow-hidden" style={{ background: 'rgba(8,8,6,0.82)', border: '1px solid rgba(255,255,255,0.16)' }}>
            {/* 3-of-a-kind */}
            <p className="font-karla font-700 uppercase tracking-[0.12em] px-4 pt-3 pb-2" style={{ fontSize: '0.68rem', color: '#b0ada8' }}>
              3 of a Kind
            </p>
            {SLOT_SYMBOLS_LIST.filter((s) => s.id !== 'anchor').map((sym) => (
              <div key={sym.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ width: 30, height: 30, flexShrink: 0 }}>
                  <SlotSymbolDisplay id={sym.id} />
                </div>
                <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>{sym.label}</span>
                {sym.id === 'catfish' ? (
                  <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0c040', textShadow: '0 0 12px rgba(240,192,64,0.5)' }}>THE POT</span>
                ) : (
                  <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: sym.color }}>{SLOT_PAYOUTS[sym.id]}×</span>
                )}
              </div>
            ))}
            {/* Pairs */}
            <p className="font-karla font-700 uppercase tracking-[0.12em] px-4 pt-3 pb-2" style={{ fontSize: '0.68rem', color: '#b0ada8', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              Any Pair
            </p>
            {SLOT_SYMBOLS_LIST.filter((s) => s.id !== 'anchor').map((sym) => {
              const mult = SLOT_PAIR_PAYOUTS[sym.id]
              if (!mult) return null
              return (
                <div key={sym.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                  <div style={{ width: 30, height: 30, flexShrink: 0 }}>
                    <SlotSymbolDisplay id={sym.id} />
                  </div>
                  <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>{sym.label}</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: sym.color }}>{mult}×</span>
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
              <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>2 Hooks</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#34d399' }}>Refund</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ width: 30, height: 30, flexShrink: 0 }}>
                <HookImage size={30} />
              </div>
              <span className="font-karla font-500 flex-1" style={{ fontSize: '0.88rem', color: '#d0cdc8' }}>3 Hooks</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#34d399' }}>Free Spin</span>
            </div>
            {/* Jackpot rules */}
            <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', background: 'rgba(240,192,64,0.05)' }}>
              <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#bfb392', lineHeight: 1.5 }}>
                Every spin feeds the Catfish Jackpot. Land three catfish to claim a share matching your bet: a full {SLOTS_MAX_BET} ⟡ bet takes the whole pot.
              </p>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
