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
  RL_MAX_STRAIGHT_BET, RL_MAX_OUTSIDE_BET,
  RL_DAILY_CAP, RL_BUY_IN_PRESETS, RL_BET_PRESETS,
} from './constants'
import { buyInRoulette, cashOutRoulette, placeBetsAndSpin } from './roulette/actions'
import type { RouletteState, SpinResult } from './roulette/types'
import RouletteWheel, { type WheelPhase } from './RouletteWheel'
import CoinShower from './CoinShower'
import { CHIP_COLORS, pickChipColor as pickChipColorShared } from './ChipDisc'

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
  const [dailyWagered, setDailyWagered] = useState(initial.dailyWagered)

  const dailyRemaining = Math.max(0, RL_DAILY_CAP - dailyWagered)
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

  // ── Buy-in handler ──
  function handleBuyIn(amount: number) {
    setError(null)
    startTransition(async () => {
      const res = await buyInRoulette(amount)
      if ('error' in res) { setError(res.error); return }
      setChips(res.newChips)
      setDoubloons(res.newDoubloons)
      setSessionBuyIns(res.sessionBuyIns)
      setDailyWagered(res.dailyWagered)
      setPhase('bet')
      // Patch Nav currency widget.
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
    })
  }

  // ── Cash-out handler ──
  function handleCashOut() {
    setError(null)
    startTransition(async () => {
      const res = await cashOutRoulette()
      if ('error' in res) { setError(res.error); return }
      setChips(0)
      setDoubloons(res.newDoubloons)
      setSessionBuyIns(0)
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
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: ACCENT, lineHeight: 1 }}>{chips.toLocaleString()}</p>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#7a7672' }}>Doubloons</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0c040', lineHeight: 1 }}>{doubloons.toLocaleString()} ⟡</p>
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
          presets={RL_BUY_IN_PRESETS as readonly number[]}
          doubloons={doubloons}
          dailyRemaining={dailyRemaining}
          disabled={isPending}
          onBuyIn={handleBuyIn}
        />
      )}

      {(phase === 'bet' || phase === 'spinning' || phase === 'reveal') && (
        <>
          {/* Chip rack — lives ABOVE the table so the pick-a-chip →
              tap-a-bet flow reads top-down from the wheel. */}
          <ChipRack
            presets={RL_BET_PRESETS as readonly number[]}
            selectedDenom={selectedDenom}
            onSelect={setSelectedDenom}
            chipsLeft={chips - totalPlaced}
          />

          {/* Bet table */}
          <BetTable
            placed={placed}
            onPlace={placeChip}
            lastWinner={phase === 'reveal' ? (lastResult?.winningNumber ?? null) : null}
            phase={phase}
          />

          {/* Spin moved onto the wheel hub — only Clear Bets lives
              down here now. */}
          <button
            onClick={clearBets}
            disabled={Object.keys(placed).length === 0 || phase !== 'bet'}
            className="font-karla font-700 uppercase"
            style={{
              padding: '0.65rem 0', borderRadius: 10,
              fontSize: '0.7rem', letterSpacing: '0.12em',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(240,232,208,0.6)',
              cursor: Object.keys(placed).length > 0 && phase === 'bet' ? 'pointer' : 'default',
            }}
          >
            Clear Bets
          </button>
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
        European single-zero · house edge 2.703% · daily wager cap {RL_DAILY_CAP.toLocaleString()} ⟡
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
   *  parity / half rows below the grid. */
  function ZoneButton({ label, zone, max, accent, flex, isOutside }: {
    label: string
    zone: string
    max: number
    accent: string
    flex?: number
    isOutside?: boolean
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
          padding: '0.5rem 0.3rem',
          background: isOutside ? `${accent}1c` : 'transparent',
          border: `1px solid ${accent}55`,
          color: accent,
          borderRadius: 6,
          fontSize: '0.6rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: interactive ? 'pointer' : 'default',
          minHeight: 34,
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
      {/* Common bets FIRST — dozens + even-money rows sit above the
          long number grid so the casual flow (chip → common bet →
          spin) never has to scroll past 12 rows of straights. */}
      <div style={{ display: 'flex', gap: 4 }}>
        <ZoneButton label="Shallows · 1-12" zone="dozen:1"  max={RL_MAX_OUTSIDE_BET} accent="#7ad3a0" isOutside />
        <ZoneButton label="Open · 13-24"    zone="dozen:2"  max={RL_MAX_OUTSIDE_BET} accent="#5fa8c9" isOutside />
        <ZoneButton label="Deep · 25-36"    zone="dozen:3"  max={RL_MAX_OUTSIDE_BET} accent="#a78bfa" isOutside />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <ZoneButton label="1-18 · Low"   zone="half:low"     max={RL_MAX_OUTSIDE_BET} accent="#c4a96a" isOutside />
        <ZoneButton label="Even"          zone="parity:even"  max={RL_MAX_OUTSIDE_BET} accent="#c4a96a" isOutside />
        <ZoneButton label="Tide · Red"   zone="color:red"    max={RL_MAX_OUTSIDE_BET} accent="#e07c7c" isOutside />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <ZoneButton label="Trench · Black" zone="color:black"  max={RL_MAX_OUTSIDE_BET} accent="#9fa3a8" isOutside />
        <ZoneButton label="Odd"           zone="parity:odd"   max={RL_MAX_OUTSIDE_BET} accent="#c4a96a" isOutside />
        <ZoneButton label="19-36 · High" zone="half:high"    max={RL_MAX_OUTSIDE_BET} accent="#c4a96a" isOutside />
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

// Chip badge — stacked-disc visualization. Each chip placed adds a
// small offset disc behind the topmost label so a 1,000-chip bet visibly
// looks like a stack of chips, not a single token. The `key={value}`
// drives a tiny scale+bounce drop-in animation on every chip add so the
// player feels the tactile placement. `small=true` shrinks the badge
// for the cramped inside-bet zones (splits / corners / streets / lines).
function ChipBadge({ value, small }: { value: number; small?: boolean }) {
  const color = pickChipColor(value)
  // Stack depth scales with chip value: 1 disc up to 100, 2 discs to
  // 500, 3 discs above 500. Each extra disc shifts 1.5px right/down so
  // they peek out behind the top label.
  const stackCount = value >= 500 ? 3 : value >= 100 ? 2 : 1
  // Dimension constants — the small variant is sized to fit in a 10px
  // split tap zone or a 22px street pill without overflowing.
  const w = small ? 18 : 22
  const h = small ? 14 : 18
  const offsetTop = small ? -6 : -8
  const offsetRight = small ? -3 : -5
  const fontSize = small ? '0.48rem' : '0.55rem'
  return (
    <motion.span
      key={value}                                          // re-keys on every chip add → triggers drop-in
      initial={{ scale: 0, y: -8 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      style={{
        position: 'absolute', top: offsetTop, right: offsetRight,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      {/* Background discs — pure visual stack, no text. */}
      {Array.from({ length: stackCount - 1 }, (_, i) => (
        <span key={i} aria-hidden style={{
          position: 'absolute',
          top: (i + 1) * 1.5,
          left: (i + 1) * 1.5,
          width: w, height: h,
          borderRadius: 999,
          background: pickChipColor(value, i + 1),
          border: '1.5px solid #1a1a1a',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
          opacity: 0.92,
        }} />
      ))}
      {/* Label disc — the top, readable chip with the bet amount. */}
      <span style={{
        position: 'relative',
        minWidth: w, height: h, padding: '0 4px',
        borderRadius: 999,
        background: `radial-gradient(circle at 50% 30%, ${color}ee 0%, ${color} 75%)`,
        border: '1.5px solid #1a1a1a',
        color: '#fff',
        fontSize,
        fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.2)',
        textShadow: '0 1px 1px rgba(0,0,0,0.6)',
      }}>
        {value.toLocaleString()}
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
function ChipRack({ presets, selectedDenom, onSelect, chipsLeft }: {
  presets: readonly number[]
  selectedDenom: number
  onSelect: (n: number) => void
  chipsLeft: number
}) {
  return (
    <div style={{
      display: 'flex', gap: 7, justifyContent: 'space-between', alignItems: 'center',
      background: 'rgba(0,0,0,0.35)',
      border: `1px solid ${FELT_RIM}`,
      borderRadius: 10,
      padding: '0.45rem',
    }}>
      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.14em', color: '#7a7672', flexShrink: 0 }}>
        Chip
      </span>
      <div style={{ display: 'flex', gap: 5, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
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
                width: 36, height: 36, borderRadius: '50%',
                background: `radial-gradient(circle at 50% 35%, ${CHIP_COLORS[p]} 0%, ${CHIP_COLORS[p]}99 80%)`,
                border: selected ? '2.5px solid #fff' : '2px dashed rgba(255,255,255,0.55)',
                color: '#0a0a0a',
                fontSize: '0.55rem', lineHeight: 1,
                cursor: tooBig ? 'default' : 'pointer',
                opacity: tooBig ? 0.35 : 1,
                boxShadow: selected ? '0 0 10px rgba(255,255,255,0.5)' : '0 1px 3px rgba(0,0,0,0.5)',
                padding: 0,
              }}>
              {p}
            </button>
          )
        })}
      </div>
      <span className="font-karla" style={{ fontSize: '0.55rem', color: '#a89878', flexShrink: 0 }}>
        Free: {chipsLeft.toLocaleString()}
      </span>
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
