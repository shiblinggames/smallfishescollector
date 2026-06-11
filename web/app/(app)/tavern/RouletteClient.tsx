'use client'

// Fish Roulette client. Buy-in screen → table screen, server-authoritative
// spins via placeBetsAndSpin (atomic settlement). Phase 2 adds the real
// SVG wheel (RouletteWheel.tsx) with momentum-based deceleration: the
// wheel winds up while the server resolves, then decelerates over ~3.2s
// to land the winning pocket under the top pointer. Chip placement
// also gets a tactile drop animation + stacked-disc visualization.

import { useMemo, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  POCKETS, colorOf,
  type Bet, type BetType,
} from '@/lib/roulette'
import {
  RL_MAX_STRAIGHT_BET, RL_MAX_OUTSIDE_BET, RL_BET_PRESETS,
  CASINO_DAILY_CAP, CASINO_BUY_IN_PRESETS,
} from './constants'
import { placeBetsAndSpin } from './roulette/actions'
import { buyInCasino, cashOutCasino } from './casino/actions'
import type { RouletteState, SpinResult } from './roulette/types'
import RouletteWheel, { type WheelPhase } from './RouletteWheel'
import CoinShower from './CoinShower'
import { CHIP_COLORS, pickChipColor as pickChipColorShared } from './ChipDisc'
import { useAnimatedNumber } from './useAnimatedNumber'

// betKey helper used to live here but the placement code inlines the
// "type:target" string directly, so the helper was unused. Keep the
// shape as a comment for anyone wiring future bet types.

const FELT      = '#0a3d2a'   // standard casino felt — slightly muted so fish portraits read
const FELT_RIM  = '#0a1a14'
const ACCENT    = '#f0c040'   // gold for win highlights
const RED_POCKET   = '#c2402e'
const BLACK_POCKET = '#1a1a1a'
const GREEN_POCKET = '#0a7a3a'

function pocketColor(n: number): string {
  if (n === 0) return GREEN_POCKET
  return colorOf(n) === 'red' ? RED_POCKET : BLACK_POCKET
}

// Chip palette + helper are now shared across the tavern via
// ./ChipDisc — same denominations + colors used by Blackjack's wager
// circle. Re-export the local pickChipColor name so existing call sites
// don't have to be touched.
const pickChipColor = pickChipColorShared

// ─── Bet-zone tap targets ────────────────────────────────────────────
// All possible bet zones the player can click. Server validates again on
// spin — these are the UI-facing definitions.

type ZoneKey = string

interface PlacedMap { [key: ZoneKey]: number }

export default function RouletteClient({ initial }: { initial: RouletteState }) {
  const router = useRouter()
  const [chips, setChips] = useState(initial.chips)
  const [doubloons, setDoubloons] = useState(initial.doubloons)
  const [sessionBuyIns, setSessionBuyIns] = useState(initial.sessionBuyIns)
  // Roulette's own session net — chips are the shared casino purse now,
  // so chips - sessionBuyIns would mix in other tables' results.
  const [sessionNet, setSessionNet] = useState(initial.sessionNet)
  const [dailyBoughtIn, setDailyBoughtIn] = useState(initial.dailyBoughtIn)

  const dailyRemaining = Math.max(0, CASINO_DAILY_CAP - dailyBoughtIn)
  const [selectedDenom, setSelectedDenom] = useState<number>(50)
  const [placed, setPlaced] = useState<PlacedMap>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<SpinResult | null>(null)
  const [phase, setPhase] = useState<'buyIn' | 'bet' | 'spinning' | 'reveal'>(
    initial.chips > 0 ? 'bet' : 'buyIn'
  )
  // Winning pocket — null during wind-up, set the moment the server
  // returns so the wheel can start decelerating to land. Stays set
  // through 'reveal' so the wheel keeps the landed pocket highlighted
  // until the next spin starts.
  const [winningNumber, setWinningNumber] = useState<number | null>(null)

  // Total currently placed across all bets (what 'Spin' would commit).
  const totalPlaced = useMemo(
    () => Object.values(placed).reduce((sum, n) => sum + n, 0),
    [placed]
  )

  // Animated header counters — tick from the previous value to the new
  // one on every win/loss (blackjack-style) instead of snapping. Sign +
  // color of the session tally track the ANIMATED value so a swing
  // through zero visibly counts through the red→grey→green shift.
  const animatedChips = useAnimatedNumber(chips)
  const animatedTally = useAnimatedNumber(sessionNet)

  // ── Buy-in handler ──
  function handleBuyIn(amount: number) {
    setError(null)
    startTransition(async () => {
      const res = await buyInCasino(amount)
      if ('error' in res) { setError(res.error); return }
      setChips(res.newChips)
      setDoubloons(res.newDoubloons)
      setSessionBuyIns(res.sessionBuyIns)
      setDailyBoughtIn(res.dailyBoughtIn)
      setPhase('bet')
      // Patch Nav currency widget.
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
    })
  }

  // ── Cash-out handler ──
  function handleCashOut() {
    setError(null)
    startTransition(async () => {
      const res = await cashOutCasino()
      if ('error' in res) { setError(res.error); return }
      setChips(0)
      setDoubloons(res.newDoubloons)
      setSessionBuyIns(0)
      setSessionNet(0)
      setPlaced({})
      setLastResult(null)
      setPhase('buyIn')
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
    })
  }

  // ── Bet placement ──
  function placeChip(zone: ZoneKey, max: number) {
    if (phase !== 'bet') return
    if (totalPlaced + selectedDenom > chips) {
      setError('Not enough chips on the table')
      return
    }
    const current = placed[zone] ?? 0
    if (current + selectedDenom > max) {
      setError(`That bet maxes out at ${max.toLocaleString()} chips`)
      return
    }
    setError(null)
    setPlaced({ ...placed, [zone]: current + selectedDenom })
  }

  function clearBets() {
    setPlaced({})
    setError(null)
  }

  // ── Spin ──
  // Two-phase animation: wind-up (wheel turns fast linear while server
  // resolves) → decel (wheel eases out to the winning pocket once the
  // server returns). Timeline:
  //   t=0      Tap Spin → phase='spinning', winningNumber=null
  //            Wheel does 3 quick turns (1.4s, linear) while server thinks
  //   t≈500ms  Server returns → winningNumber=N
  //            Wheel decelerates to land on N (3.2s, ease-out-quint)
  //   t≈3700ms phase='reveal' → result panel slides in
  //   t≈7700ms placed bets clear, phase='bet' (or 'buyIn' if busted)
  // Total: ~7.7s per spin from tap to ready-for-next-bet.
  function handleSpin() {
    if (phase !== 'bet') return
    if (Object.keys(placed).length === 0) { setError('Place at least one bet'); return }
    setError(null)

    // Build Bet[] from placed map. Key shape is "type:target":
    //   - straight / dozen / column / street / line → numeric target
    //   - split / corner                            → "a-b" / "a-b-c-d"
    //   - color / parity / half                     → string literal
    const bets: Bet[] = Object.entries(placed).map(([key, amount]) => {
      const [type, rawTarget] = key.split(':') as [BetType, string]
      let target: Bet['target']
      if (type === 'straight' || type === 'dozen' || type === 'column' || type === 'street' || type === 'line') {
        target = Number(rawTarget)
      } else if (type === 'split' || type === 'corner') {
        target = rawTarget.split('-').map(Number)
      } else {
        target = rawTarget as Bet['target']
      }
      return { type, target, amount }
    })

    setPhase('spinning')
    setWinningNumber(null)
    setLastResult(null)
    startTransition(async () => {
      const res = await placeBetsAndSpin(bets)
      if ('error' in res) { setError(res.error); setPhase('bet'); return }

      // Server done — start the decel by setting winningNumber. The
      // wheel reacts via its own useEffect and runs the ease-out anim.
      setWinningNumber(res.winningNumber)

      // Wait for decel to finish (3.2s) before showing the result panel.
      setTimeout(() => {
        setLastResult(res)
        setChips(res.chipsAfter)
        setSessionNet(res.sessionNet)
        setSessionBuyIns(res.sessionBuyIns)
        setPhase('reveal')

        // Auto-return to bet after 4s on reveal so the player can spin
        // again without an extra click. Placed bets clear; the wheel
        // keeps its landed position until next spin.
        setTimeout(() => {
          setPlaced({})
          setLastResult(null)
          setPhase(res.chipsAfter > 0 ? 'bet' : 'buyIn')
          router.refresh()
        }, 4000)
      }, 3200)
    })
  }

  // Map client phase → wheel phase. The wheel doesn't care about
  // buyIn/bet, only whether it's spinning vs landed vs idle.
  const wheelPhase: WheelPhase =
    phase === 'spinning' ? 'spinning'
    : phase === 'reveal' ? 'landed'
    : 'idle'

  // Big-win trigger: any straight bet that hit. Straights are the rarest
  // outcome (35:1 / 1-in-37) so this fires for the celebration moment
  // without burning out the screen on every routine red/black win. The
  // shower auto-removes when its longest coin completes (~3s).
  const hasStraightWin = phase === 'reveal' && lastResult
    ? lastResult.perBet.some(r => r.won && r.bet.type === 'straight')
    : false

  // ── Render ──

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Link href="/tavern" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none' }}>
          ← Tavern
        </Link>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', flex: 1 }}>
          Fish Roulette
        </p>
        <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672' }}>
          {dailyRemaining.toLocaleString()} ⟡ / day
        </span>
      </div>

      {/* Chip + doubloon header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.45)',
        border: `1px solid ${FELT_RIM}`,
        borderRadius: 12, padding: '0.55rem 0.8rem',
      }}>
        <div>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#7a7672' }}>Chips</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: ACCENT, lineHeight: 1 }}>{animatedChips.toLocaleString()}</p>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          {sessionBuyIns > 0 ? (() => {
            // Session tally, blackjack-style: chips - buy-ins this
            // session. Green when up, red when down, grey flat —
            // tracking the animated value so the color flips mid-tick.
            const color = animatedTally === 0 ? '#8a8478' : animatedTally > 0 ? '#7fd49a' : '#e07070'
            return (
              <>
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#7a7672' }}>Session</p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color, lineHeight: 1 }}>
                  {animatedTally > 0 ? '+' : ''}{animatedTally.toLocaleString()} ⟡
                </p>
              </>
            )
          })() : (
            <>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#7a7672' }}>Doubloons</p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0c040', lineHeight: 1 }}>{doubloons.toLocaleString()} ⟡</p>
            </>
          )}
        </div>
        <button
          onClick={handleCashOut}
          disabled={chips === 0 || isPending || phase === 'spinning'}
          className="font-karla font-700 uppercase"
          style={{
            fontSize: '0.55rem', letterSpacing: '0.12em',
            padding: '0.4rem 0.6rem', borderRadius: 8,
            background: chips > 0 ? `${ACCENT}22` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${chips > 0 ? `${ACCENT}66` : 'rgba(255,255,255,0.1)'}`,
            color: chips > 0 ? ACCENT : 'rgba(255,255,255,0.3)',
            cursor: chips > 0 && !isPending ? 'pointer' : 'default',
          }}
        >
          Cash Out
        </button>
      </div>

      {/* Wheel — real SVG with momentum spin + decel-to-pocket. Spin
          lives ON the wheel: a circular button sized to the static hub
          so the tap target sits where the eye already is. */}
      <div style={{
        position: 'relative',
        background: `radial-gradient(circle at 50% 35%, ${FELT} 0%, ${FELT_RIM} 80%)`,
        border: `1px solid ${FELT_RIM}`,
        borderRadius: 14,
        padding: '0.9rem 0.8rem 0.7rem',
      }}>
        <div style={{ position: 'relative', maxWidth: 340, margin: '0 auto' }}>
          <RouletteWheel phase={wheelPhase} winner={winningNumber} size={340} />
          {phase === 'bet' && (
            <button
              onClick={handleSpin}
              disabled={totalPlaced === 0 || isPending}
              className="font-cinzel font-700 uppercase"
              style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '29%', aspectRatio: '1', borderRadius: '50%',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 1,
                background: totalPlaced > 0
                  ? `radial-gradient(circle at 50% 35%, ${ACCENT}30 0%, rgba(26,10,4,0.94) 78%)`
                  : 'rgba(26,10,4,0.88)',
                border: `2px solid ${totalPlaced > 0 ? ACCENT : 'rgba(240,192,64,0.25)'}`,
                color: totalPlaced > 0 ? ACCENT : 'rgba(240,232,208,0.35)',
                fontSize: '0.82rem', letterSpacing: '0.1em',
                boxShadow: totalPlaced > 0
                  ? `0 0 16px ${ACCENT}55, inset 0 1px 0 rgba(255,255,255,0.12)`
                  : 'none',
                cursor: totalPlaced > 0 && !isPending ? 'pointer' : 'default',
                WebkitTapHighlightColor: 'transparent',
              }}>
              Spin
              {totalPlaced > 0 && (
                <span className="font-karla font-700" style={{ fontSize: '0.55rem', letterSpacing: '0.06em' }}>
                  {totalPlaced.toLocaleString()}
                </span>
              )}
            </button>
          )}

          {/* Result overlay — floats centered OVER the wheel on reveal
              instead of inserting into the document flow (which used to
              shift the whole table down). pointer-events: none so taps
              pass through; auto-dismisses with the reveal phase. Flex
              centering (not translate(-50%,-50%)) because framer's
              scale animation would clobber a static transform. */}
          <AnimatePresence>
            {phase === 'reveal' && lastResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.22 }}
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none', zIndex: 10,
                }}>
                <div style={{
                  minWidth: '62%', maxWidth: '86%',
                  backgroundColor: 'rgba(12,9,6,0.94)',
                  backgroundImage: lastResult.net > 0
                    ? 'linear-gradient(180deg, rgba(122,211,160,0.22) 0%, rgba(0,0,0,0) 60%)'
                    : lastResult.net < 0
                      ? 'linear-gradient(180deg, rgba(240,138,138,0.16) 0%, rgba(0,0,0,0) 60%)'
                      : 'none',
                  border: `1px solid ${
                    lastResult.net > 0 ? 'rgba(122,211,160,0.55)'
                    : lastResult.net < 0 ? 'rgba(240,138,138,0.45)'
                    : 'rgba(255,255,255,0.18)'}`,
                  borderRadius: 14,
                  padding: '0.75rem 1rem 0.7rem',
                  textAlign: 'center',
                  boxShadow: '0 10px 32px rgba(0,0,0,0.65)',
                }}>
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.5rem', letterSpacing: '0.16em',
                    color: lastResult.net > 0 ? '#7ad3a0' : lastResult.net < 0 ? '#f08a8a' : '#7a7672',
                  }}>
                    {lastResult.net > 0 ? 'You win' : lastResult.net < 0 ? 'House' : 'Push'}
                  </p>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '1.5rem',
                    color: lastResult.net > 0 ? '#7ad3a0' : lastResult.net < 0 ? '#f08a8a' : '#f0e8d0',
                    lineHeight: 1.1,
                  }}>
                    {lastResult.net > 0 ? '+' : ''}{lastResult.net.toLocaleString()}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.58rem', color: '#a89878', marginTop: 4 }}>
                    Wagered {lastResult.totalWagered.toLocaleString()} · Paid {lastResult.totalPayout.toLocaleString()}
                  </p>
                  <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: ACCENT, marginTop: 1 }}>
                    Chips: {lastResult.chipsAfter.toLocaleString()}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Caption line — ALWAYS rendered so the wheel panel height
            never changes between phases (no layout shift). */}
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.55rem', letterSpacing: '0.18em',
          color: phase === 'spinning' ? '#a89878' : '#5a7868',
          textAlign: 'center', marginTop: 4, minHeight: '0.8rem',
        }}>
          {phase === 'bet'
            ? (totalPlaced > 0 ? 'Tap the wheel to spin' : 'Place your bets')
            : phase === 'spinning' && winningNumber === null
              ? 'No more bets…'
              : ' '}
        </p>
      </div>

      {error && (
        <p className="font-karla" style={{ fontSize: '0.7rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
      )}

      {phase === 'buyIn' && (
        <BuyInPanel
          presets={CASINO_BUY_IN_PRESETS as readonly number[]}
          doubloons={doubloons}
          dailyRemaining={dailyRemaining}
          disabled={isPending}
          onBuyIn={handleBuyIn}
        />
      )}

      {(phase === 'bet' || phase === 'spinning' || phase === 'reveal') && (
        <>
          {/* Chip rack — lives ABOVE the table so the pick-a-chip →
              tap-a-bet flow reads top-down from the wheel. Clear Bets
              lives here too so the whole bet-management loop is in one
              place at the top. */}
          <ChipRack
            presets={RL_BET_PRESETS as readonly number[]}
            selectedDenom={selectedDenom}
            onSelect={setSelectedDenom}
            chipsLeft={chips - totalPlaced}
            onClear={clearBets}
            canClear={Object.keys(placed).length > 0 && phase === 'bet'}
          />

          {/* Bet table */}
          <BetTable
            placed={placed}
            onPlace={placeChip}
            lastWinner={phase === 'reveal' ? (lastResult?.winningNumber ?? null) : null}
            phase={phase}
          />

          {/* Spin lives on the wheel hub, Clear Bets in the chip rack —
              nothing left down here. */}
        </>
      )}

      {/* Coin shower — fires once on a straight-bet hit. AnimatePresence
          could wrap this for a smoother unmount, but the coin fall is
          already a one-shot animation; once 'reveal' clears the
          component unmounts naturally. */}
      {hasStraightWin && <CoinShower count={40} />}

      {/* Recent spins strip */}
      <RecentSpinsStrip spins={initial.recentSpins} />

      <p className="font-karla" style={{ fontSize: '0.58rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        European single-zero · house edge 2.703% · daily buy-in cap {CASINO_DAILY_CAP.toLocaleString()} ⟡ across all casino tables
      </p>
    </div>
  )
}

// (WheelDisplay v1 ticker component was removed when RouletteWheel.tsx
// shipped — the real SVG wheel owns the spin visualization now.)

// ─── Buy-in panel ────────────────────────────────────────────────────
function BuyInPanel({ presets, doubloons, dailyRemaining, disabled, onBuyIn }: {
  presets: readonly number[]
  doubloons: number
  dailyRemaining: number
  disabled: boolean
  onBuyIn: (amount: number) => void
}) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.45)',
      border: `1px solid ${FELT_RIM}`,
      borderRadius: 12,
      padding: '0.85rem',
    }}>
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.14em', color: '#7a7672', marginBottom: 6, textAlign: 'center' }}>
        Buy In
      </p>
      <p className="font-karla" style={{ fontSize: '0.65rem', color: '#a89878', textAlign: 'center', marginBottom: 10, lineHeight: 1.4 }}>
        Convert doubloons to chips. {dailyRemaining.toLocaleString()} ⟡ remaining today.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {presets.map(p => {
          const canAfford = doubloons >= p && dailyRemaining >= p
          return (
            <button
              key={p}
              onClick={() => canAfford && onBuyIn(p)}
              disabled={!canAfford || disabled}
              className="font-cinzel font-700"
              style={{
                padding: '0.55rem 0', borderRadius: 9,
                fontSize: '0.78rem',
                background: canAfford ? `${ACCENT}1c` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${canAfford ? `${ACCENT}55` : 'rgba(255,255,255,0.1)'}`,
                color: canAfford ? ACCENT : 'rgba(255,255,255,0.3)',
                cursor: canAfford ? 'pointer' : 'default',
              }}>
              {p.toLocaleString()} ⟡
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Bet table ───────────────────────────────────────────────────────
// Portrait-first, noob-first layout: 0 banner on top, then the number
// grid rotated VERTICAL — 12 rows of 3 numbers reading 1-2-3 / 4-5-6
// / … down the screen — then dozens and the 1-18/Even/Red/Black/Odd/
// 19-36 rows. Only the bets a casual player actually reaches for:
// straight numbers + the outside bets. Splits / corners / streets /
// lines / columns were cut from the UI (the server still validates and
// settles them, so they can return behind an "advanced" toggle if ever
// wanted). The whole table fits a phone width with zero sideways
// scroll.
function BetTable({ placed, onPlace, lastWinner, phase }: {
  placed: PlacedMap
  onPlace: (zone: string, max: number) => void
  lastWinner: number | null
  phase: 'buyIn' | 'bet' | 'spinning' | 'reveal'
}) {
  const interactive = phase === 'bet'

  // ── Small helper components used inside the grid ──

  function NumberPocket({ n, gridRow, gridCol }: { n: number; gridRow: number; gridCol: number }) {
    const key = `straight:${n}`
    const chips = placed[key] ?? 0
    const isWinner = lastWinner === n
    const pocket = POCKETS[n]
    const fishFile = pocket.fishId
      ? '/fish/' + pocket.name.toLowerCase().replace(/\s+/g, '-') + '.png'
      : null
    return (
      <button
        type="button"
        onClick={() => interactive && onPlace(key, RL_MAX_STRAIGHT_BET)}
        disabled={!interactive}
        title={pocket.name}
        style={{
          gridRow, gridColumn: gridCol,
          position: 'relative',
          background: pocketColor(n),
          border: isWinner ? `2px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.1)',
          boxShadow: isWinner ? `0 0 10px ${ACCENT}aa` : 'none',
          color: '#fff',
          borderRadius: 5,
          padding: 0,
          cursor: interactive ? 'pointer' : 'default',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {fishFile && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fishFile} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain', opacity: 0.35,
          }} />
        )}
        <span className="font-cinzel font-700" style={{
          position: 'relative',
          fontSize: '0.95rem',
          textShadow: '0 1px 2px rgba(0,0,0,0.7)',
        }}>
          {n}
        </span>
        {chips > 0 && <ChipBadge value={chips} small />}
      </button>
    )
  }

  /** Standard outside-bet pill — used for dozens / color /
   *  parity / half rows. `fill` renders a SOLID background (the
   *  red/black buttons use their actual pocket colors with white
   *  text so there's zero ambiguity which is which). */
  function ZoneButton({ label, zone, max, accent, flex, isOutside, fill }: {
    label: string
    zone: string
    max: number
    accent: string
    flex?: number
    isOutside?: boolean
    fill?: string
  }) {
    const chips = placed[zone] ?? 0
    return (
      <button
        type="button"
        onClick={() => interactive && onPlace(zone, max)}
        disabled={!interactive}
        style={{
          position: 'relative',
          flex: flex ?? 1,
          padding: '0.55rem 0.3rem',
          background: fill ?? (isOutside ? `${accent}26` : 'transparent'),
          border: fill ? '1px solid rgba(255,255,255,0.25)' : `1px solid ${accent}77`,
          color: fill ? '#fff' : accent,
          borderRadius: 8,
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          textShadow: fill ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
          cursor: interactive ? 'pointer' : 'default',
          minHeight: 44,
        }}
        className="font-karla">
        {label}
        {chips > 0 && <ChipBadge value={chips} />}
      </button>
    )
  }

  // (rowIdx, colIdx) → canonical roulette number 1-36. rowIdx 0-11
  // (top row = 1-2-3), colIdx 0-2.
  const numAt = (row: number, col: number) => row * 3 + col + 1

  return (
    <div style={{
      background: FELT,
      border: `2px solid ${FELT_RIM}`,
      borderRadius: 12,
      padding: '0.6rem',
      maxWidth: 440,
      width: '100%',
      margin: '0 auto',
    }}>
      {/* Common bets FIRST — paired by what they are: Red/Black
          together (solid pocket colors, white text — unmistakable),
          then Even/Odd, then Low/High, then the dozens. All above the
          long number grid so the casual flow (chip → common bet →
          spin) never has to scroll past 12 rows of straights. */}
      <div style={{ display: 'flex', gap: 5 }}>
        <ZoneButton label="Red"   zone="color:red"   max={RL_MAX_OUTSIDE_BET} accent="#e07c7c" fill={RED_POCKET} />
        <ZoneButton label="Black" zone="color:black" max={RL_MAX_OUTSIDE_BET} accent="#9fa3a8" fill={BLACK_POCKET} />
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        <ZoneButton label="Even" zone="parity:even" max={RL_MAX_OUTSIDE_BET} accent="#e8d9ae" isOutside />
        <ZoneButton label="Odd"  zone="parity:odd"  max={RL_MAX_OUTSIDE_BET} accent="#e8d9ae" isOutside />
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        <ZoneButton label="Low · 1-18"   zone="half:low"  max={RL_MAX_OUTSIDE_BET} accent="#e8d9ae" isOutside />
        <ZoneButton label="High · 19-36" zone="half:high" max={RL_MAX_OUTSIDE_BET} accent="#e8d9ae" isOutside />
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        <ZoneButton label="1-12"  zone="dozen:1" max={RL_MAX_OUTSIDE_BET} accent="#7ad3a0" isOutside />
        <ZoneButton label="13-24" zone="dozen:2" max={RL_MAX_OUTSIDE_BET} accent="#5fa8c9" isOutside />
        <ZoneButton label="25-36" zone="dozen:3" max={RL_MAX_OUTSIDE_BET} accent="#a78bfa" isOutside />
      </div>

      {/* Zero banner + 12×3 number grid, one vertical CSS grid. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: '44px repeat(12, 40px)',
        gap: 4,
        marginTop: 6,
      }}>
        {/* Zero — full-width banner across the top. */}
        <button
          type="button"
          onClick={() => interactive && onPlace('straight:0', RL_MAX_STRAIGHT_BET)}
          disabled={!interactive}
          title="The Abyss"
          style={{
            gridRow: 1, gridColumn: '1 / 4',
            position: 'relative',
            background: GREEN_POCKET,
            border: lastWinner === 0 ? `2px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.1)',
            boxShadow: lastWinner === 0 ? `0 0 10px ${ACCENT}aa` : 'none',
            color: '#fff', borderRadius: 5, padding: 0,
            cursor: interactive ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>0</span>
          {(placed['straight:0'] ?? 0) > 0 && <ChipBadge value={placed['straight:0']} small />}
        </button>

        {/* Numbers (36 cells) — 12 rows × 3 cols, 1-2-3 / 4-5-6 / … */}
        {Array.from({ length: 12 }, (_, row) =>
          [0, 1, 2].map(col => {
            const n = numAt(row, col)
            return (
              <NumberPocket
                key={`num-${n}`}
                n={n}
                gridRow={row + 2}
                gridCol={col + 1}
              />
            )
          })
        ).flat()}
      </div>
    </div>
  )
}

// Chip badge — a proper casino chip dropped CENTERED on the bet zone
// (the old corner dot was tiny and got clipped by overflow:hidden on
// the number pockets). Sized like the rack chips so it reads as "your
// chip is on this spot", with the staked amount in bold white. The
// `key={value}` re-fires a drop-in spring on every chip add so the
// player feels each placement. small=true shrinks it a touch for the
// 40px number pockets.
function ChipBadge({ value, small }: { value: number; small?: boolean }) {
  const color = pickChipColor(value)
  const d = small ? 32 : 38
  // Compact big stakes so they fit the disc: 2500 → 2.5k.
  const label = value >= 1000
    ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
    : String(value)
  return (
    <motion.span
      key={value}                                          // re-keys on every chip add → triggers drop-in
      initial={{ scale: 0.3, y: -14, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 20 }}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center',
        // Wide zone buttons keep their label readable: chip sits to
        // the right. Number pockets center it (covering the number is
        // the point — your chip is ON that pocket).
        justifyContent: small ? 'center' : 'flex-end',
        paddingRight: small ? 0 : 8,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <span className="font-karla" style={{
        width: d, height: d,
        borderRadius: '50%',
        background: `radial-gradient(circle at 50% 32%, ${color} 0%, ${color}aa 85%)`,
        border: '2px dashed rgba(255,255,255,0.85)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.25)',
        color: '#fff',
        fontSize: small ? '0.62rem' : '0.72rem',
        fontWeight: 700,
        lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textShadow: '0 1px 2px rgba(0,0,0,0.85)',
      }}>
        {label}
      </span>
    </motion.span>
  )
}

/** Pick a representative chip color. `tier` controls which preset
 *  bucket to choose: 0 = highest applicable preset (label disc),
 *  1/2 = one/two tiers below (stack discs). Lets the stack discs
 *  show a mix of chip colors instead of monochrome blob. */
// pickChipColor is now imported from ./ChipDisc via the
// pickChipColorShared alias near the top of this file. Removed the
// duplicated local definition that used to live here.

// ─── Chip rack ───────────────────────────────────────────────────────
// Bigger chips with bolder numbers (the 36px / 0.55rem originals were
// unreadable on phones), plus the Free-chips count and Clear Bets in a
// footer row so all bet management lives at the top of the table.
function ChipRack({ presets, selectedDenom, onSelect, chipsLeft, onClear, canClear }: {
  presets: readonly number[]
  selectedDenom: number
  onSelect: (n: number) => void
  chipsLeft: number
  onClear: () => void
  canClear: boolean
}) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.35)',
      border: `1px solid ${FELT_RIM}`,
      borderRadius: 10,
      padding: '0.5rem 0.55rem 0.45rem',
    }}>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {presets.map(p => {
          const selected = p === selectedDenom
          const tooBig = p > chipsLeft
          return (
            <button
              key={p}
              onClick={() => onSelect(p)}
              disabled={tooBig}
              className="font-karla font-700"
              style={{
                width: 46, height: 46, borderRadius: '50%',
                background: `radial-gradient(circle at 50% 35%, ${CHIP_COLORS[p]} 0%, ${CHIP_COLORS[p]}99 80%)`,
                border: selected ? '3px solid #fff' : '2px dashed rgba(255,255,255,0.55)',
                color: '#fff',
                fontSize: '0.78rem', lineHeight: 1,
                textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                cursor: tooBig ? 'default' : 'pointer',
                opacity: tooBig ? 0.35 : 1,
                boxShadow: selected ? '0 0 12px rgba(255,255,255,0.55)' : '0 1px 3px rgba(0,0,0,0.5)',
                padding: 0,
              }}>
              {p}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="font-karla" style={{ fontSize: '0.62rem', color: '#a89878' }}>
          Free: {chipsLeft.toLocaleString()}
        </span>
        <button
          onClick={onClear}
          disabled={!canClear}
          className="font-karla font-700 uppercase"
          style={{
            padding: '0.35rem 0.7rem', borderRadius: 8,
            fontSize: '0.6rem', letterSpacing: '0.1em',
            background: canClear ? 'rgba(240,138,138,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${canClear ? 'rgba(240,138,138,0.45)' : 'rgba(255,255,255,0.12)'}`,
            color: canClear ? '#f08a8a' : 'rgba(240,232,208,0.3)',
            cursor: canClear ? 'pointer' : 'default',
          }}
        >
          Clear Bets
        </button>
      </div>
    </div>
  )
}

// ─── Recent spins strip ──────────────────────────────────────────────
function RecentSpinsStrip({ spins }: { spins: RouletteState['recentSpins'] }) {
  if (spins.length === 0) return null
  return (
    <div style={{
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${FELT_RIM}`,
      borderRadius: 10,
      padding: '0.5rem 0.6rem',
    }}>
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#7a7672', marginBottom: 4 }}>
        Recent spins
      </p>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {spins.slice(0, 12).map(s => {
          const color = pocketColor(s.winningNumber)
          return (
            <div key={s.id} style={{
              flexShrink: 0,
              width: 28, height: 28, borderRadius: '50%',
              background: color,
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                {s.winningNumber}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
