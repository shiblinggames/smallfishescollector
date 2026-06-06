'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BJ_BET_PRESETS, BJ_DAILY_CAP, BJ_MAX_BET, BJ_MIN_BET } from './constants'
import {
  dealBlackjack, hit, stand, doubleDown, split,
  acceptInsurance, declineInsurance,
  type ClientState, type SettleResult,
} from './blackjack/actions'
import type { Card, Rank } from '@/lib/blackjack'
import { pickFishForRank, type FishArtPool } from '@/lib/blackjackFishArt'

interface Props {
  doubloons: number
  dailyWagered: number
  resumed: ClientState | null
  fishArtPool: FishArtPool
}

const RANK_DISPLAY: Record<string, string> = {
  A: 'A', T: '10', J: 'J', Q: 'Q', K: 'K',
  '2': '2','3': '3','4': '4','5': '5','6': '6','7': '7','8': '8','9': '9',
}
const SUIT_SYMBOL: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' }
function suitColor(suit: string): string {
  return (suit === 'H' || suit === 'D') ? '#c63838' : '#1a1410'
}

// ── Single card visual ─────────────────────────────────────────────────────
// Cardback = the new pack-back art. Face = parchment-cream stock with rank
// + suit in the corners and a random fish from the rank's pool drifting
// over the middle. Fish art is locked per-card-instance via a parent ref
// cache so it doesn't jitter between re-renders.
//
// Single locked size across every screen — the play / settle phase
// transition was visibly resizing cards before and the jitter was
// annoying. Picked 64×92 so five cards fit per row on a 360-wide phone
// without wrapping.
const CARD_DIMS = { w: 64, h: 92, rankFont: '0.88rem', suitFont: '0.88rem', cornerPad: 5 }

// 3D flip wrapper — used for the dealer's hole card. Renders the
// cardback on the front face and the real card on the back face; a
// 180° rotateY transition flips between them. backfaceVisibility:
// hidden hides whichever face is rotated away. Pure CSS, no library.
function FlipCard({ flipped, card, fishArt }: { flipped: boolean; card: Card; fishArt: string | null }) {
  return (
    <div style={{ perspective: 900, width: CARD_DIMS.w, height: CARD_DIMS.h, flexShrink: 0 }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transformStyle: 'preserve-3d',
        transition: 'transform 580ms cubic-bezier(0.4, 0, 0.2, 1)',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden',
        }}>
          <BlackjackCard card="X" fishArt={null} />
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
        }}>
          <BlackjackCard card={card} fishArt={fishArt} />
        </div>
      </div>
    </div>
  )
}

function BlackjackCard({
  card,
  fishArt,
}: {
  card: Card | 'X'
  fishArt: string | null
}) {
  const dims = CARD_DIMS

  if (card === 'X') {
    return (
      <div
        aria-label="Hidden card"
        style={{
          width: dims.w, height: dims.h, borderRadius: 8,
          backgroundImage: 'url(/cardbacknew.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.16)',
        }}
      />
    )
  }
  const rank = card.charAt(0)
  const suit = card.charAt(1)
  const rankText = RANK_DISPLAY[rank] ?? rank
  const sym = SUIT_SYMBOL[suit] ?? '?'
  const color = suitColor(suit)
  return (
    <div
      aria-label={`${rankText} of ${suit}`}
      style={{
        position: 'relative',
        width: dims.w, height: dims.h, borderRadius: 8,
        background: 'linear-gradient(180deg, #f6ecd5 0%, #ead7ad 100%)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
        border: '1px solid rgba(0,0,0,0.18)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {fishArt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fishArt}
          alt=""
          aria-hidden
          style={{
            position: 'absolute', top: '20%', left: '4%',
            width: '92%', height: '60%', objectFit: 'contain',
            opacity: 0.58,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{
        position: 'absolute', top: dims.cornerPad, left: dims.cornerPad,
        color, lineHeight: 1, fontFamily: 'serif',
      }}>
        <div style={{ fontSize: dims.rankFont, fontWeight: 700 }}>{rankText}</div>
        <div style={{ fontSize: dims.suitFont, lineHeight: 1 }}>{sym}</div>
      </div>
      <div style={{
        position: 'absolute', bottom: dims.cornerPad, right: dims.cornerPad,
        color, lineHeight: 1, fontFamily: 'serif',
        transform: 'rotate(180deg)',
      }}>
        <div style={{ fontSize: dims.rankFont, fontWeight: 700 }}>{rankText}</div>
        <div style={{ fontSize: dims.suitFont, lineHeight: 1 }}>{sym}</div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Blackjack({ doubloons: initialDoubloons, dailyWagered: initialDailyWagered, resumed, fishArtPool }: Props) {
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [dailyWagered, setDailyWagered] = useState(initialDailyWagered)
  const [phase, setPhase] = useState<'wager' | 'play' | 'settled'>(resumed ? 'play' : 'wager')
  const [wager, setWager] = useState<number>(BJ_BET_PRESETS[0])
  const [active, setActive] = useState<ClientState | null>(resumed)
  const [result, setResult] = useState<SettleResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fish cache: lock a random fish per (handIdx, cardIdx, cardString) so
  // a 4♠ that landed three turns ago doesn't swap fish every re-render.
  // Reset whenever a new hand deals.
  const fishCacheRef = useRef<Map<string, string>>(new Map())

  // Reveal sequence on settle. The server returns the full result
  // instantly, but UX-wise we want the player to watch the dealer's
  // hole card flip, then any extra dealer draws come in one at a time,
  // before the outcome panel slides up. These flags drive that
  // staging — see the timeouts in applyActionResult below.
  const [holeFlipped, setHoleFlipped] = useState(false)
  const [revealedDealerCount, setRevealedDealerCount] = useState(0)
  const [outcomeShown, setOutcomeShown] = useState(false)
  // Track pending timeouts so a fast Play-Again tap doesn't leave
  // stale fires racing the next hand.
  const revealTimersRef = useRef<number[]>([])
  function clearRevealTimers() {
    for (const id of revealTimersRef.current) clearTimeout(id)
    revealTimersRef.current = []
  }

  function getFish(handIdx: number, cardIdx: number, card: Card | 'X'): string | null {
    if (card === 'X') return null
    const key = `${handIdx}-${cardIdx}-${card}`
    let f = fishCacheRef.current.get(key)
    if (!f) {
      const picked = pickFishForRank(fishArtPool, card.charAt(0) as Rank)
      if (picked) {
        f = picked
        fishCacheRef.current.set(key, f)
      }
    }
    return f ?? null
  }

  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - dailyWagered)
  const canDeal = wager >= BJ_MIN_BET
    && wager <= Math.min(BJ_MAX_BET, doubloons, dailyRemaining)
    && !isPending

  function applyActionResult(r: { kind: 'active'; state: ClientState } | { kind: 'settled'; result: SettleResult } | { error: string }) {
    if ('error' in r) { setError(r.error); return }
    setError(null)
    if (r.kind === 'active') {
      setActive(r.state)
      setDoubloons(r.state.doubloons)
      setDailyWagered(BJ_DAILY_CAP - r.state.dailyRemaining)
      setPhase('play')
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.state.doubloons }))
      return
    }
    // Settled. Two reveal modes:
    //
    //   PLAYER-BUST PATH (every hand busted):
    //     Player already knows they lost the moment they busted; the
    //     dealer never had to play. Show "BUST" + outcome immediately,
    //     no staged dealer-card reveal — matches real blackjack where
    //     the dealer just collects and moves on.
    //
    //   NORMAL PATH (any hand survived to compare against the dealer):
    //     Stage the reveal so the player gets the satisfaction of
    //     watching the hole flip and the dealer play out:
    //       1. Settle screen renders with dealer's hole still face-down.
    //       2. t=350ms: flip the hole (580ms 3D rotation).
    //       3. t=930ms+: each extra dealer draw slides in at 500ms intervals.
    //       4. t=last+400ms: outcome panel + doubloons update.
    clearRevealTimers()
    setResult(r.result)
    setActive(null)
    setPhase('settled')

    const allBusted = r.result.hands.every(h => h.outcome === 'lose' && h.total > 21)

    if (allBusted) {
      setHoleFlipped(true)
      setRevealedDealerCount(r.result.dealerCards.length)
      setOutcomeShown(true)
      setDoubloons(r.result.newDoubloons)
      setDailyWagered(r.result.dailyWagered)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.result.newDoubloons }))
      return
    }

    // Normal staged reveal.
    setHoleFlipped(false)
    setRevealedDealerCount(2)
    setOutcomeShown(false)

    let elapsed = 350
    revealTimersRef.current.push(window.setTimeout(() => setHoleFlipped(true), elapsed))
    elapsed += 580                    // flip duration

    const extraDealer = Math.max(0, r.result.dealerCards.length - 2)
    for (let i = 0; i < extraDealer; i++) {
      elapsed += 500
      const target = 3 + i           // revealedDealerCount after this fires
      revealTimersRef.current.push(window.setTimeout(() => setRevealedDealerCount(target), elapsed))
    }

    elapsed += 400
    revealTimersRef.current.push(window.setTimeout(() => {
      setOutcomeShown(true)
      setDoubloons(r.result.newDoubloons)
      setDailyWagered(r.result.dailyWagered)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.result.newDoubloons }))
    }, elapsed))
  }

  function fireAction(fn: () => Promise<{ kind: 'active'; state: ClientState } | { kind: 'settled'; result: SettleResult } | { error: string }>) {
    startTransition(async () => {
      const r = await fn()
      applyActionResult(r)
    })
  }

  function startDeal() {
    clearRevealTimers()
    fishCacheRef.current.clear()
    setResult(null)
    setHoleFlipped(false)
    setRevealedDealerCount(0)
    setOutcomeShown(false)
    fireAction(() => dealBlackjack(wager))
  }

  function nextHand() {
    clearRevealTimers()
    setResult(null)
    setActive(null)
    setHoleFlipped(false)
    setRevealedDealerCount(0)
    setOutcomeShown(false)
    setPhase('wager')
  }

  // Clear pending reveal timers on unmount so a navigated-away player
  // doesn't get a stray setState after the component is gone.
  useEffect(() => () => clearRevealTimers(), [])

  // ── Renderers ──────────────────────────────────────────────────────────

  function renderWagerScreen() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ textAlign: 'center' }}>
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.55rem', color: '#a68a4a', marginBottom: 4 }}>
            New Hand
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.45rem', color: '#f0e8d0' }}>Place your wager</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a09988', marginTop: 6 }}>
            {dailyRemaining > 0
              ? <>Up to {Math.min(BJ_MAX_BET, doubloons, dailyRemaining).toLocaleString()} ⟡ this hand · {dailyRemaining.toLocaleString()} ⟡ daily cap remaining</>
              : 'Daily limit reached — come back tomorrow'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {BJ_BET_PRESETS.map(amt => {
            const disabled = amt > Math.min(BJ_MAX_BET, doubloons, dailyRemaining)
            const selected = wager === amt
            return (
              <button
                key={amt}
                type="button"
                disabled={disabled || isPending}
                onClick={() => setWager(amt)}
                className="font-karla font-700"
                style={{
                  padding: '0.7rem 0', borderRadius: 10,
                  background: selected ? 'rgba(240,192,64,0.12)' : 'rgba(4,10,20,0.5)',
                  border: `1px solid ${selected ? '#f0c040' : 'rgba(255,255,255,0.12)'}`,
                  color: disabled ? '#3a3835' : selected ? '#f0c040' : '#9a9488',
                  fontSize: '0.85rem',
                  cursor: disabled || isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {amt} ⟡
              </button>
            )
          })}
        </div>

        <button
          type="button"
          disabled={!canDeal}
          onClick={startDeal}
          className="font-cinzel font-700 uppercase tracking-[0.1em]"
          style={{
            padding: '0.95rem 0', borderRadius: 14,
            background: canDeal ? 'linear-gradient(180deg, rgba(240,192,64,0.35) 0%, rgba(196,169,106,0.18) 100%)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canDeal ? '#f0c040' : 'rgba(255,255,255,0.1)'}`,
            color: canDeal ? '#f0d695' : '#5a5550',
            fontSize: '0.95rem', letterSpacing: '0.08em',
            cursor: canDeal ? 'pointer' : 'not-allowed',
          }}
        >
          {isPending ? 'Dealing…' : `Deal · ${wager.toLocaleString()} ⟡`}
        </button>

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
        )}
      </div>
    )
  }

  function renderGameScreen(state: ClientState) {
    const activeHand = state.hands[state.activeHandIdx]
    const dealerTotalDisplay = state.dealerTotal !== null ? state.dealerTotal : '?'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {/* Dealer */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#a68a4a' }}>Dealer</p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0e8d0' }}>{dealerTotalDisplay}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {state.dealerCards.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: -18, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28, delay: i * 0.08 }}
                style={{ flexShrink: 0 }}
              >
                <BlackjackCard card={c} fishArt={getFish(-1, i, c)} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Player hands */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#7ad3a0' }}>
              {state.hands.length === 1 ? 'Your Hand' : `Hand ${state.activeHandIdx + 1} of ${state.hands.length}`}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0e8d0' }}>
              {activeHand ? activeHand.total : ''}
            </p>
          </div>
          {state.hands.map((h, hi) => (
            <div
              key={hi}
              style={{
                marginBottom: hi === state.hands.length - 1 ? 0 : 10,
                padding: '0.65rem 0.75rem',
                background: hi === state.activeHandIdx ? 'rgba(122,211,160,0.08)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${hi === state.activeHandIdx ? 'rgba(122,211,160,0.35)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#7a948a', letterSpacing: '0.1em' }}>
                  {h.busted ? 'BUST' : h.stood ? 'STOOD' : hi === state.activeHandIdx ? 'ACTIVE' : 'WAITING'} · {h.wager} ⟡{h.doubled ? ' · DD' : ''}{h.isSplit ? ' · SPLIT' : ''}
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: h.busted ? '#f08a8a' : h.isNatural ? '#f0c040' : '#f0e8d0' }}>
                  {h.total}{h.soft && h.total !== 21 ? ' (soft)' : ''}{h.isNatural ? ' · BJ' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {h.cards.map((c, ci) => (
                  <motion.div
                    key={ci}
                    initial={{ opacity: 0, y: -18, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, delay: ci * 0.08 }}
                    style={{ flexShrink: 0 }}
                  >
                    <BlackjackCard card={c} fishArt={getFish(hi, ci, c)} />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Insurance prompt OR action bar */}
        {state.insuranceOffered ? (
          <div style={{
            padding: '0.85rem 0.85rem 0.95rem',
            borderRadius: 12,
            background: 'rgba(125,160,216,0.10)',
            border: '1px solid rgba(125,160,216,0.45)',
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#bcd0ea', marginBottom: 4 }}>
              Insurance?
            </p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9aa4b5', marginBottom: 10, lineHeight: 1.45 }}>
              Dealer shows an Ace. For {Math.floor(state.hands[0].wager / 2)} ⟡ you can side-bet that the hole card is a 10-value. Pays 2:1 if dealer has natural Blackjack.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={isPending || doubloons < Math.floor(state.hands[0].wager / 2)}
                onClick={() => fireAction(acceptInsurance)}
                className="font-karla font-700 uppercase tracking-[0.06em]"
                style={{
                  flex: 1, padding: '0.65rem 0', borderRadius: 10,
                  background: 'rgba(125,160,216,0.32)',
                  border: '1px solid rgba(125,160,216,0.7)',
                  color: '#dde8f6',
                  fontSize: '0.74rem',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                Take · {Math.floor(state.hands[0].wager / 2)} ⟡
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => fireAction(declineInsurance)}
                className="font-karla font-700 uppercase tracking-[0.06em]"
                style={{
                  flex: 1, padding: '0.65rem 0', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#a8a39c',
                  fontSize: '0.74rem',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton label="Hit" onClick={() => fireAction(hit)} disabled={!state.canHit || isPending} accent="#7ad3a0" />
            <ActionButton label="Stand" onClick={() => fireAction(stand)} disabled={!state.canStand || isPending} accent="#c4a96a" />
            {state.canDouble && (
              <ActionButton label={`Double · ${activeHand?.wager} ⟡`} onClick={() => fireAction(doubleDown)} disabled={isPending} accent="#7aa7e8" />
            )}
            {state.canSplit && (
              <ActionButton label={`Split · ${state.hands[0].wager} ⟡`} onClick={() => fireAction(split)} disabled={isPending} accent="#d0a0e8" />
            )}
          </div>
        )}

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
        )}
      </div>
    )
  }

  function renderSettleScreen(r: SettleResult) {
    const net = r.netDelta
    const netColor = net > 0 ? '#7ad3a0' : net < 0 ? '#f08a8a' : '#c4a96a'
    const headlineWord = net > 0 ? 'Winner' : net < 0 ? 'Down' : 'Push'
    const dealerTotalVisible = holeFlipped
      ? r.dealerTotal
      : (() => {
          // Pre-flip: only the up card counts in the visible total —
          // hides the implied total that would otherwise spoil the
          // hole reveal.
          const up = r.dealerCards[0]
          const rank = up.charAt(0)
          if (rank === 'A') return 11
          if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10
          return Number(rank)
        })()

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {/* Net delta — fades in only after the reveal finishes. */}
        <motion.div
          initial={false}
          animate={{ opacity: outcomeShown ? 1 : 0, y: outcomeShown ? 0 : -8 }}
          transition={{ duration: 0.35 }}
          style={{ textAlign: 'center', pointerEvents: outcomeShown ? 'auto' : 'none' }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.55rem', color: netColor, marginBottom: 4 }}>{headlineWord}</p>
          <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: netColor, lineHeight: 1 }}>
            {net > 0 ? '+' : ''}{net.toLocaleString()} ⟡
          </p>
        </motion.div>

        {/* Dealer — cards reveal in sequence; index 1 is the FlipCard hole. */}
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#a68a4a', marginBottom: 6 }}>
            Dealer · {dealerTotalVisible}{outcomeShown && r.dealerBust ? ' · Bust' : outcomeShown && r.dealerNatural ? ' · Blackjack' : ''}
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: CARD_DIMS.h }}>
            {r.dealerCards.map((c, i) => {
              if (i >= revealedDealerCount) return null
              const fish = getFish(-1, i, c)
              if (i === 1) {
                // Hole card — always rendered, flips when holeFlipped.
                return <FlipCard key={i} flipped={holeFlipped} card={c} fishArt={fish} />
              }
              // First card was already visible during play; later cards
              // slide in as they're drawn.
              return (
                <motion.div
                  key={i}
                  initial={i >= 2 ? { opacity: 0, y: -18, scale: 0.85 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.32 }}
                  style={{ flexShrink: 0 }}
                >
                  <BlackjackCard card={c} fishArt={fish} />
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Player hands — cards visible immediately. Outcome chip only
            shows up post-reveal so the player doesn't see the verdict
            spoiled before the dealer plays out. */}
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#7ad3a0', marginBottom: 6 }}>
            Your Hand{r.hands.length > 1 ? 's' : ''}
          </p>
          {r.hands.map((h, hi) => {
            const isWin = h.outcome === 'win' || h.outcome === 'blackjack'
            const isLose = h.outcome === 'lose'
            const c = isWin ? '#7ad3a0' : isLose ? '#f08a8a' : '#c4a96a'
            const label = h.outcome === 'blackjack' ? 'Blackjack 3:2' : h.outcome === 'win' ? 'Win' : h.outcome === 'push' ? 'Push' : h.outcome === 'lose' ? 'Lose' : h.outcome
            return (
              <div key={hi} style={{
                marginBottom: hi === r.hands.length - 1 ? 0 : 10,
                padding: '0.6rem 0.7rem',
                background: outcomeShown ? `${c}12` : 'rgba(255,255,255,0.025)',
                border: `1px solid ${outcomeShown ? c + '55' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 10,
                transition: 'background 0.3s, border-color 0.3s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, minHeight: '0.95rem' }}>
                  <AnimatePresence>
                    {outcomeShown && (
                      <motion.p
                        key="outcome-label"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="font-karla font-700 uppercase"
                        style={{ fontSize: '0.58rem', color: c, letterSpacing: '0.1em' }}
                      >
                        {label} · {h.total}{h.doubled ? ' · DD' : ''}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {outcomeShown && (
                      <motion.p
                        key="outcome-net"
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="font-cinzel font-700"
                        style={{ fontSize: '0.8rem', color: c }}
                      >
                        {h.net > 0 ? '+' : ''}{h.net.toLocaleString()} ⟡
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {h.cards.map((card, ci) => (
                    <BlackjackCard key={ci} card={card} fishArt={getFish(hi, ci, card)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <AnimatePresence>
          {outcomeShown && r.insurance.taken && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                padding: '0.55rem 0.7rem',
                borderRadius: 8,
                background: 'rgba(125,160,216,0.08)',
                border: '1px solid rgba(125,160,216,0.35)',
                fontSize: '0.7rem',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ color: '#bcd0ea' }}>
                Insurance · {r.insurance.win ? 'Hit' : 'Miss'}
              </p>
              <p className="font-karla" style={{ color: '#9aa4b5', marginTop: 2 }}>
                {r.insurance.amount} ⟡ side-bet · {r.insurance.net > 0 ? '+' : ''}{r.insurance.net.toLocaleString()} ⟡
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {outcomeShown && (
            <motion.button
              key="play-again"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              type="button"
              onClick={nextHand}
              className="font-cinzel font-700 uppercase tracking-[0.08em]"
              style={{
                padding: '0.85rem 0', borderRadius: 12,
                background: 'rgba(240,192,64,0.18)',
                border: '1px solid rgba(240,192,64,0.55)',
                color: '#f0d695',
                fontSize: '0.82rem', cursor: 'pointer',
              }}
            >
              Play Again →
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // Re-sync wager state if doubloons drop below it
  useEffect(() => {
    if (wager > doubloons) setWager(BJ_BET_PRESETS[0])
  }, [doubloons, wager])

  return (
    <div style={{
      width: '100%', maxWidth: 420, margin: '0 auto',
      // minHeight floor so the wager → play → settle phase swap
      // doesn't yank the parent down by 200+ pixels each transition.
      // Sized to comfortably hold the play screen with a single hand
      // (~520px); larger content (splits, multi-card hands) grows
      // past the floor as needed.
      minHeight: 560,
      background: 'linear-gradient(180deg, #1a1410 0%, #0b0908 100%)',
      border: '1px solid rgba(196,169,106,0.25)',
      borderRadius: 18,
      padding: '1.25rem 1.1rem 1.4rem',
      boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1.25rem',
        paddingBottom: '0.85rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#a68a4a' }}>Tavern</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0e8d0' }}>Blackjack</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040', lineHeight: 1 }}>{doubloons.toLocaleString()} ⟡</p>
          <p className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7470', marginTop: 4 }}>{dailyRemaining.toLocaleString()} ⟡ daily cap</p>
        </div>
      </div>

      {phase === 'wager' && renderWagerScreen()}
      {phase === 'play' && active && renderGameScreen(active)}
      {phase === 'settled' && result && renderSettleScreen(result)}
    </div>
  )
}

function ActionButton({ label, onClick, disabled, accent }: { label: string; onClick: () => void; disabled: boolean; accent: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="font-karla font-700 uppercase tracking-[0.06em]"
      style={{
        flex: 1, minWidth: 100,
        padding: '0.75rem 0', borderRadius: 10,
        background: disabled ? 'rgba(255,255,255,0.04)' : `${accent}1f`,
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : accent + '88'}`,
        color: disabled ? '#5a5550' : accent,
        fontSize: '0.78rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
