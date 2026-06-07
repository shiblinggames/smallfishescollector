'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BJ_BET_PRESETS, BJ_BUY_IN_PRESETS, BJ_BUY_IN_MAX, BJ_BUY_IN_MIN, BJ_DAILY_CAP, BJ_MAX_BET, BJ_MIN_BET } from './constants'
import {
  dealBlackjack, hit, stand, doubleDown, split,
  acceptInsurance, declineInsurance,
  type ClientState, type SettleResult, type Phase, type CardOrBack,
} from './blackjack/actions'
import { buyInChips, cashOutChips } from './blackjack/actions'
import { handValue, type Card, type Rank } from '@/lib/blackjack'
import { pickFishForRank, type FishArtPool } from '@/lib/blackjackFishArt'

interface Props {
  doubloons: number
  chips: number
  sessionBuyIns: number
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
// ── Satisfaction helpers ───────────────────────────────────────────────────

/** Animated number that eases up from 0 to `value` over `duration` ms.
 *  Cubic ease-out so it lands soft. Used for the net-delta payout — a
 *  static "+250 ⟡" is less satisfying than watching the chips count up. */
function CountUp({ value, duration = 750, prefix = '' }: { value: number; duration?: number; prefix?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf = 0
    let start: number | null = null
    const sign = value < 0 ? -1 : 1
    const absTarget = Math.abs(value)
    const tick = (t: number) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(absTarget * eased) * sign)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setDisplay(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{prefix}{display.toLocaleString()}</>
}

/** Tiny haptic on supported devices. Web Vibration API: iOS Safari
 *  silently no-ops, Android Chrome buzzes for real. Patterns chosen so
 *  blackjack feels noticeably stronger than a regular win. */
function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try { navigator.vibrate(pattern) } catch { /* ignore — some browsers refuse */ }
}

/** Sparkle particles that drift up + fade. Pure CSS via framer-motion;
 *  positioned as an absolute overlay so it never pushes anything around.
 *  `intensity` scales count + spread + duration for the Blackjack tier. */
function SparkleBurst({ accent, intensity = 1 }: { accent: string; intensity?: number }) {
  const count = Math.round(7 * intensity)
  const drift = 90 * intensity
  const duration = 1.4 + (intensity - 1) * 0.8
  const particles = Array.from({ length: count }, (_, i) => ({
    i,
    left: 8 + Math.random() * 84,
    top: 25 + Math.random() * 40,
    delay: i * 0.06,
    glyph: ['✨','⭐','✨','✦','✨','✦','⭐','✨','✦','⭐','✨','✦'][i % 12],
  }))
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map(p => (
        <motion.div
          key={p.i}
          initial={{ opacity: 0, y: 0, scale: 0.5 }}
          animate={{ opacity: [0, 1, 1, 0], y: -drift, scale: [0.5, 1.2 * intensity, 1.05 * intensity, 0.85] }}
          transition={{ duration, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: `${p.top}%`,
            left: `${p.left}%`,
            fontSize: `${1 + (intensity - 1) * 0.4}rem`,
            color: accent,
            textShadow: `0 0 10px ${accent}`,
          }}
        >
          {p.glyph}
        </motion.div>
      ))}
    </div>
  )
}

/** Big settle-screen celebration overlay. Absolutely positioned over
 *  the modal interior so the layout doesn't flex — sits above the
 *  cards, pointer-events:none so it can't block Play Again. Three
 *  tiers: Blackjack (loudest), Win, Push. Loss returns null (don't
 *  celebrate the dealer winning). */
function SettleCelebration({ tier, amount }: { tier: 'blackjack' | 'win' | 'push' | 'loss'; amount: number }) {
  if (tier === 'loss') return null
  const isBlackjack = tier === 'blackjack'
  const isWin       = tier === 'win'
  const accent = isBlackjack ? '#f0c040' : isWin ? '#7fd49a' : '#c4a96a'
  const headline = isBlackjack ? 'BLACKJACK' : isWin ? 'Winner' : 'Push'
  const headlineSize = isBlackjack ? '2.6rem' : '1.7rem'
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      {(isBlackjack || isWin) && (
        <SparkleBurst accent={accent} intensity={isBlackjack ? 1.8 : 1} />
      )}
      <motion.div
        initial={{ opacity: 0, scale: isBlackjack ? 0.4 : 0.7, y: 30 }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale: isBlackjack ? [0.4, 1.15, 1, 1.05] : [0.7, 1.08, 1, 1],
          y: [30, 0, -8, -40],
        }}
        transition={{
          duration: isBlackjack ? 2.8 : 2.2,
          times: [0, 0.18, 0.7, 1],
          ease: 'easeOut',
        }}
        style={{
          position: 'absolute',
          top: '32%',
          left: 0, right: 0,
          textAlign: 'center',
          textShadow: isBlackjack
            ? '0 0 28px rgba(240,192,64,0.7), 0 4px 14px rgba(0,0,0,0.55)'
            : '0 0 18px rgba(127,212,154,0.45), 0 3px 10px rgba(0,0,0,0.5)',
        }}
      >
        <p className="font-cinzel font-700" style={{
          fontSize: headlineSize,
          color: accent,
          lineHeight: 1,
          letterSpacing: isBlackjack ? '0.06em' : '0.02em',
          marginBottom: 8,
        }}>
          {headline}
        </p>
        {amount !== 0 && (
          <p className="font-cinzel font-700" style={{
            fontSize: isBlackjack ? '2.1rem' : '1.5rem',
            color: accent,
            lineHeight: 1,
          }}>
            <CountUp value={amount} duration={isBlackjack ? 1100 : 800} prefix={amount > 0 ? '+' : ''} /> ⟡
          </p>
        )}
      </motion.div>
    </div>
  )
}


/** Burst of doubloon glyphs that flies from the player-hand area up to
 *  the balance number in the header. Pure decorative — fires on any
 *  player win. Each coin animates from a slightly randomized start
 *  position toward the top-right with stagger + scale-down + rotation,
 *  giving a "chips collecting" feel. Self-cleans after the animation
 *  (parent unmounts via a changing `key`). */
function CoinFlight() {
  // 8 coins, randomized start offsets so they look like a handful
  // rather than a row.
  const coins = Array.from({ length: 8 }, (_, i) => ({
    i,
    startLeft: 30 + Math.random() * 40,   // % of container width
    startTop:  55 + Math.random() * 20,   // % of container height
    delay:     i * 0.06,
    rot:       (Math.random() - 0.5) * 540,
  }))
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
      {coins.map(c => (
        <motion.div
          key={c.i}
          initial={{ left: `${c.startLeft}%`, top: `${c.startTop}%`, opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{
            left: '88%',
            top: '24px',
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1.2, 1, 0.5],
            rotate: c.rot,
          }}
          transition={{ duration: 0.85, delay: c.delay, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'absolute',
            fontSize: '1.15rem',
            color: '#f0c040',
            textShadow: '0 0 12px rgba(240,192,64,0.85)',
            fontWeight: 700,
          }}
        >
          ⟡
        </motion.div>
      ))}
    </div>
  )
}

/** Decorative card-stack silhouette — represents the 8-deck shoe the
 *  cards come from. Pure cosmetic: gives the wager screen a focal
 *  point and silently communicates that the game uses a multi-deck
 *  shoe. Each layer uses the cardback art with a small offset stack
 *  effect. */
function DeckStack({ width = 64 }: { width?: number }) {
  const height = Math.round(width * (CARD_DIMS.h / CARD_DIMS.w))
  // Four stacked layers — top layer has full opacity, ones below
  // slightly dimmer to fake the depth. Each layer is offset diagonally
  // by 2px to suggest a chunky deck rather than a single card.
  const layers = [3, 2, 1, 0]   // render order: bottom first
  return (
    <div style={{ position: 'relative', width: width + 8, height: height + 8, flexShrink: 0 }}>
      {layers.map(i => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: i * 2,
            left: i * 2,
            width,
            height,
            borderRadius: 6,
            backgroundImage: 'url(/cardbacknew.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
            border: '1px solid rgba(255,255,255,0.16)',
            opacity: 1 - i * 0.08,
          }}
        />
      ))}
    </div>
  )
}

/** Daily-cap progress bar — a thin colored fill that grades from
 *  green → amber → red as the player approaches the daily wager cap.
 *  More glanceable than the old "X ⟡ daily cap remaining" text. The
 *  numeric remainder is kept underneath for precision. */
function DailyCapBar({ wagered, cap }: { wagered: number; cap: number }) {
  const pct = Math.min(1, wagered / cap)
  const remaining = Math.max(0, cap - wagered)
  // Color band:
  //   0-60%  green (4ade80)
  //   60-90% amber (f0c040)
  //   90%+   red   (f08a8a)
  const color = pct < 0.6 ? '#4ade80' : pct < 0.9 ? '#f0c040' : '#f08a8a'
  return (
    <div>
      <div style={{
        height: 4, borderRadius: 999,
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
      }}>
        <motion.div
          animate={{ width: `${pct * 100}%`, backgroundColor: color }}
          transition={{ width: { duration: 0.6, ease: 'easeOut' }, backgroundColor: { duration: 0.4 } }}
          style={{ height: '100%', borderRadius: 999, background: color }}
        />
      </div>
      <p className="font-karla" style={{ fontSize: '0.64rem', color: '#7a7470', marginTop: 5, letterSpacing: '0.04em' }}>
        {remaining > 0
          ? `${remaining.toLocaleString()} ⟡ daily cap remaining`
          : 'Daily cap reached'}
      </p>
    </div>
  )
}

// Single locked size across every screen — the play / settle phase
// transition was visibly resizing cards before and the jitter was
// annoying. Picked 64×92 so five cards fit per row on a 360-wide phone
// without wrapping.
// Bumped 64×92 → 78×112 — corners read at arm's length, deck silhouette
// is more imposing. Four cards per row still fit on a 360-wide phone
// (4 × 78 + gaps ≈ 330px); five-card hands wrap to a second row.
const CARD_DIMS = { w: 78, h: 112, rankFont: '1.25rem', suitFont: '1.2rem', cornerPad: 6 }

// 3D flip wrapper — used for the dealer's hole card. Renders the
// cardback on the front face and the real card on the back face; a
// 180° rotateY transition flips between them. backfaceVisibility:
// hidden hides whichever face is rotated away. Pure CSS, no library.
function FlipCard({ flipped, card, fishArt, duration = 820 }: { flipped: boolean; card: Card; fishArt: string | null; duration?: number }) {
  return (
    <div style={{ perspective: 900, width: CARD_DIMS.w, height: CARD_DIMS.h, flexShrink: 0 }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        transformStyle: 'preserve-3d',
        transition: `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
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

/** Card that slides in face-down and flips to face-up shortly after
 *  it mounts — the "card dealt to the player" animation used during
 *  the initial deal and on hit/double draws. Pass card='X' to render
 *  a card that lands face-down and stays there (the dealer hole).
 *  Uses the same FlipCard structure as the settle-time hole reveal,
 *  just with a snappier ~480ms flip (the settle hole gets 820ms for
 *  drama; in-deal flips need to clear before the next card lands). */
function DealtCard({ card, fishArt }: { card: Card | 'X'; fishArt: string | null }) {
  const isHidden = card === 'X'
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    if (isHidden) return
    // Tiny delay so the slide-in motion (0.36s) reads first; the flip
    // starts while the card is still settling, total deal-in feels
    // like one fluid motion.
    const id = window.setTimeout(() => setFlipped(true), 180)
    return () => clearTimeout(id)
  }, [isHidden])
  return (
    <motion.div
      initial={{ opacity: 0, y: -22, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.55)' }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.36, ease: 'easeOut' }}
      style={{ flexShrink: 0, cursor: 'pointer' }}
    >
      {isHidden
        ? <BlackjackCard card="X" fishArt={null} />
        : <FlipCard flipped={flipped} card={card as Card} fishArt={fishArt} duration={480} />}
    </motion.div>
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
            position: 'absolute', top: '26%', left: '4%',
            width: '92%', height: '50%', objectFit: 'contain',
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

export default function Blackjack({ doubloons: initialDoubloons, chips: initialChips, sessionBuyIns: initialSessionBuyIns, dailyWagered: initialDailyWagered, resumed, fishArtPool }: Props) {
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [chips, setChips] = useState(initialChips)
  // Cumulative doubloons bought in this session (resets on cash-out or
  // when chips fall to 0). The header session tally is `chips - sessionBuyIns`
  // — green when up, red when down. Replaces the per-hand net-delta panel.
  const [sessionBuyIns, setSessionBuyIns] = useState(initialSessionBuyIns)
  const [dailyWagered, setDailyWagered] = useState(initialDailyWagered)
  // Phases:
  //   buyIn   — no chips at the table; player picks how much to convert
  //   wager   — chips on the table; player picks bet for next hand
  //   play    — hand in progress
  //   settled — reveal sequence + Play Again
  const [phase, setPhase] = useState<'buyIn' | 'wager' | 'play' | 'settled'>(
    resumed ? 'play' : (initialChips > 0 ? 'wager' : 'buyIn')
  )
  const [wager, setWager] = useState<number>(BJ_BET_PRESETS[0])
  const [buyInAmount, setBuyInAmount] = useState<number>(500)
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
  // Deal-reveal animation. The initial 4-card deal (player[0],
  // dealer[0], player[1], dealer[1]-face-down) gets staged one card
  // at a time so the moment the second player card lands feels like
  // a reveal — especially for naturals, where the Ace-next-to-Ten
  // moment is the celebration. dealRevealCount stays at 4 outside of
  // a fresh deal (resumed hands, hits, etc.) so cards render as-is.
  const [dealRevealCount, setDealRevealCount] = useState(4)
  // When a fresh deal resolves immediately to settled (natural
  // blackjack — player and/or dealer), we hold the SettleResult here
  // and let the deal animation finish first; an effect transitions us
  // into the settle reveal once dealRevealCount hits 4.
  const [pendingSettle, setPendingSettle] = useState<SettleResult | null>(null)
  // Ref-backed flag mirroring "is the next action result the response
  // to a fresh deal?" — set true in startDeal, cleared in
  // applyActionResult. Refs avoid the stale-closure trap where the
  // applyActionResult captured by fireAction's startTransition
  // callback would otherwise read the pre-setDealRevealCount value
  // and skip kickOffDealReveal.
  const pendingFreshDealRef = useRef(false)
  // Track pending timeouts so a fast Play-Again tap doesn't leave
  // stale fires racing the next hand.
  const revealTimersRef = useRef<number[]>([])
  // Coin-flight overlay: bumps a counter each time we want to fire
  // a fresh burst; the CoinFlight component remounts via key and
  // self-removes after its animation completes.
  const [coinFlightKey, setCoinFlightKey] = useState(0)
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
  // Wager is bounded by chip stack, not doubloons — chips are what's on
  // the table. Daily cap is enforced at buy-in only.
  const canDeal = wager >= BJ_MIN_BET
    && wager <= Math.min(BJ_MAX_BET, chips)
    && !isPending
  const canBuyIn = buyInAmount >= BJ_BUY_IN_MIN
    && buyInAmount <= Math.min(BJ_BUY_IN_MAX, doubloons, dailyRemaining)
    && !isPending

  /** Stage the deal animation. Four cards in true casino order:
   *  player[0] @ 240ms · dealer[0] @ 880ms · player[1] @ 1520ms ·
   *  dealer[1] (face-down) @ 2160ms. Each card slides in face-down
   *  and flips to its face (DealtCard handles the flip; the hole at
   *  count=4 is rendered as 'X' and stays face-down). 640ms between
   *  cards leaves room for the ~500ms flip to read clearly before the
   *  next card lands.
   *  Called from applyActionResult when a fresh deal lands (kind=
   *  'active' OR kind='settled' on a natural). */
  function kickOffDealReveal() {
    const stops = [240, 880, 1520, 2160]
    stops.forEach((t, i) => {
      revealTimersRef.current.push(window.setTimeout(() => setDealRevealCount(i + 1), t))
    })
  }

  /** Stage the post-hand reveal: hole flip → extra dealer draws →
   *  outcome panel + celebration. Factored out so the natural-blackjack
   *  path can run the deal animation first, then call this. */
  function startSettleReveal(result: SettleResult) {
    clearRevealTimers()
    setResult(result)
    setActive(null)
    setPhase('settled')

    setHoleFlipped(false)
    setRevealedDealerCount(2)
    setOutcomeShown(false)

    // initialHold scales with the player's end state. Bust / 21 need
    // a beat to register before the dealer reveal pulls their eye to
    // the top of the screen — the BUST / 21 stamp surfaces immediately
    // on settle mount, so this hold is the pause that lets them read it.
    const anyPlayerBust    = result.hands.some(h => h.total > 21)
    const anyPlayerStood21 = result.hands.some(h => h.total === 21 && h.outcome !== 'blackjack')
    const initialHold = anyPlayerBust ? 1900 : anyPlayerStood21 ? 1500 : 650

    let elapsed = initialHold
    revealTimersRef.current.push(window.setTimeout(() => setHoleFlipped(true), elapsed))
    elapsed += 820                    // flip duration

    const extraDealer = Math.max(0, result.dealerCards.length - 2)
    for (let i = 0; i < extraDealer; i++) {
      elapsed += 850
      const target = 3 + i           // revealedDealerCount after this fires
      revealTimersRef.current.push(window.setTimeout(() => setRevealedDealerCount(target), elapsed))
    }

    elapsed += 800
    revealTimersRef.current.push(window.setTimeout(() => {
      setOutcomeShown(true)
      setChips(result.newChips)
      setDoubloons(result.doubloons)
      setSessionBuyIns(result.sessionBuyIns)
      setDailyWagered(result.dailyWagered)
      // Outcome-tiered haptic. Blackjack = long satisfying buzz;
      // dealer-bust win = quick double-tap; regular win = short;
      // push = barely a tick; loss = soft thud.
      const hasNaturalWin = result.hands.some(h => h.outcome === 'blackjack')
      const hasAnyWin     = result.hands.some(h => h.outcome === 'win' || h.outcome === 'blackjack')
      const allPush       = result.hands.every(h => h.outcome === 'push')
      if (hasNaturalWin)     { vibrate([60, 40, 60, 40, 120]); setCoinFlightKey(k => k + 1) }
      else if (hasAnyWin)    { vibrate([50, 30, 50]);          setCoinFlightKey(k => k + 1) }
      else if (allPush)      { vibrate(20) }
      else                   { vibrate(40) }
    }, elapsed))
  }

  /** Synthesize a ClientState from a SettleResult so the play screen
   *  can render the deal animation for a natural blackjack (server
   *  resolves naturals immediately, so we never receive an "active"
   *  intermediate state for those). The dealer's hole stays masked
   *  until the settle reveal flips it. */
  function synthActiveFromResult(rr: SettleResult): ClientState {
    const playerHand = rr.hands[0]
    return {
      handId: rr.handId,
      phase: 'playerTurn' as Phase,
      hands: rr.hands.map(h => ({
        cards: h.cards,
        wager: h.wager,
        doubled: h.doubled,
        stood: true,
        busted: h.total > 21,
        isNatural: h.outcome === 'blackjack',
        isSplit: false,
        total: h.total,
        soft: false,
      })),
      activeHandIdx: 0,
      dealerCards: [rr.dealerCards[0], 'X' as CardOrBack],
      dealerUpCard: rr.dealerCards[0],
      dealerTotal: null,
      insuranceOffered: false,
      insuranceTaken: rr.insurance.taken,
      insuranceAmount: rr.insurance.amount,
      totalWagered: (playerHand?.wager ?? 0),
      canHit: false, canStand: false, canDouble: false, canSplit: false,
      dailyRemaining: 0,
      chips: 0, doubloons: 0, sessionBuyIns: 0,
    }
  }

  function applyActionResult(r: { kind: 'active'; state: ClientState } | { kind: 'settled'; result: SettleResult } | { error: string }) {
    if ('error' in r) { setError(r.error); return }
    setError(null)

    // Read the fresh-deal flag from the ref (state read here would be
    // stale — applyActionResult was captured by fireAction's
    // startTransition before the setDealRevealCount(0) in startDeal
    // had a chance to apply). Clear the flag immediately so a
    // mid-hand action right after can't be mis-classified.
    const isFreshDeal = pendingFreshDealRef.current
    pendingFreshDealRef.current = false

    if (r.kind === 'active') {
      setActive(r.state)
      setChips(r.state.chips)
      setDoubloons(r.state.doubloons)
      setSessionBuyIns(r.state.sessionBuyIns)
      setDailyWagered(BJ_DAILY_CAP - r.state.dailyRemaining)
      setPhase('play')
      if (isFreshDeal) kickOffDealReveal()
      return
    }

    // Settled. If this is a fresh-deal settle (natural blackjack —
    // player and/or dealer), run the deal animation FIRST so the
    // player sees the natural reveal itself, then transition to the
    // post-hand reveal via the dealRevealCount === 4 effect below.
    if (isFreshDeal) {
      setActive(synthActiveFromResult(r.result))
      setPendingSettle(r.result)
      setPhase('play')
      kickOffDealReveal()
      return
    }

    // Mid-hand settle (hit/stand/double/split resolved): straight to
    // the dealer reveal.
    startSettleReveal(r.result)
  }

  // After the deal animation completes on a natural-blackjack hand,
  // hold the moment briefly so the player reads "BLACKJACK · 21" on
  // their hand row, then kick off the dealer reveal.
  useEffect(() => {
    if (dealRevealCount !== 4 || !pendingSettle) return
    const r = pendingSettle
    const hasPlayerNatural = r.hands.some(h => h.outcome === 'blackjack')
    // True casino order: player[1] lands at count=3, flips ~500ms
    // later — so the BLACKJACK chip pops shortly before count=4 (the
    // dealer hole slide). 1100ms hold after count=4 lets the natural
    // moment really land before the dealer reveal pulls focus.
    const holdMs = hasPlayerNatural ? 1100 : 500
    const id = window.setTimeout(() => {
      setPendingSettle(null)
      startSettleReveal(r)
    }, holdMs)
    revealTimersRef.current.push(id)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealRevealCount, pendingSettle])

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
    setPendingSettle(null)
    setHoleFlipped(false)
    setRevealedDealerCount(0)
    setOutcomeShown(false)
    setDealRevealCount(0)
    pendingFreshDealRef.current = true   // read by applyActionResult on response
    fireAction(() => dealBlackjack(wager))
  }

  function nextHand() {
    clearRevealTimers()
    setResult(null)
    setActive(null)
    setPendingSettle(null)
    setHoleFlipped(false)
    setRevealedDealerCount(0)
    setOutcomeShown(false)
    setDealRevealCount(4)            // idle — deal animation not running
    pendingFreshDealRef.current = false
    // If the player's been busted out completely, push them to buy-in
    // instead of a useless wager screen they can't act on.
    setPhase(chips > 0 ? 'wager' : 'buyIn')
  }

  function doBuyIn() {
    if (!canBuyIn) return
    setError(null)
    startTransition(async () => {
      const r = await buyInChips(buyInAmount)
      if ('error' in r) { setError(r.error); return }
      setChips(r.newChips)
      setDoubloons(r.newDoubloons)
      setSessionBuyIns(r.sessionBuyIns)
      setDailyWagered(r.dailyWagered)
      setPhase('wager')
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    })
  }

  function doCashOut() {
    if (chips <= 0 || isPending) return
    setError(null)
    startTransition(async () => {
      const r = await cashOutChips()
      if ('error' in r) { setError(r.error); return }
      setChips(0)
      setDoubloons(r.newDoubloons)
      setSessionBuyIns(r.sessionBuyIns)
      setPhase('buyIn')
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    })
  }

  // Clear pending reveal timers on unmount so a navigated-away player
  // doesn't get a stray setState after the component is gone.
  useEffect(() => () => clearRevealTimers(), [])

  // ── Renderers ──────────────────────────────────────────────────────────

  function renderBuyInScreen() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
          <motion.div
            animate={{ rotate: [-1.2, 1.2, -1.2] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <DeckStack width={68} />
          </motion.div>
          <div style={{ textAlign: 'center' }}>
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.55rem', color: '#a68a4a', marginBottom: 4 }}>
              Sit Down
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.45rem', color: '#f0e8d0', lineHeight: 1.1 }}>Buy chips</p>
            <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09988', marginTop: 6, lineHeight: 1.5 }}>
              Trade {dailyRemaining > 0 ? <>up to <span style={{ color: '#f0c040' }}>{Math.min(BJ_BUY_IN_MAX, doubloons, dailyRemaining).toLocaleString()} ⟡</span></> : '⟡'} for chips to play with. Cash out any time.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {BJ_BUY_IN_PRESETS.map(amt => {
            const disabled = amt > Math.min(BJ_BUY_IN_MAX, doubloons, dailyRemaining)
            const selected = buyInAmount === amt
            return (
              <button
                key={amt}
                type="button"
                disabled={disabled || isPending}
                onClick={() => setBuyInAmount(amt)}
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
          disabled={!canBuyIn}
          onClick={doBuyIn}
          className="font-cinzel font-700 uppercase tracking-[0.1em]"
          style={{
            padding: '0.95rem 0', borderRadius: 14,
            background: canBuyIn ? 'linear-gradient(180deg, rgba(240,192,64,0.35) 0%, rgba(196,169,106,0.18) 100%)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canBuyIn ? '#f0c040' : 'rgba(255,255,255,0.1)'}`,
            color: canBuyIn ? '#f0d695' : '#5a5550',
            fontSize: '0.95rem', letterSpacing: '0.08em',
            cursor: canBuyIn ? 'pointer' : 'not-allowed',
          }}
        >
          {isPending ? 'Buying…' : `Buy ${buyInAmount.toLocaleString()} ⟡ in chips`}
        </button>

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
        )}
      </div>
    )
  }

  function renderWagerScreen() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.55rem', color: '#a68a4a', textAlign: 'center', marginBottom: 10 }}>
            Wager
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {BJ_BET_PRESETS.map(amt => {
              const disabled = amt > Math.min(BJ_MAX_BET, chips)
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
    // Initial-deal reveal slicing. True casino order alternating
    // around the table: count 1 = player[0], count 2 = dealer[0],
    // count 3 = player[1], count 4 = dealer[1] face-down.
    // Player visible = ceil(count/2), dealer visible = floor(count/2).
    // On a split or mid-hand hit, dealRevealCount sits at 4 and these
    // slices return the full hands unchanged — splits don't replay
    // the animation; the new card per split-hand slides in via its
    // own motion mount.
    const dealing = dealRevealCount < 4
    const playerVisibleCount = dealing ? Math.ceil(dealRevealCount / 2) : Number.POSITIVE_INFINITY
    const dealerVisibleCount = dealing ? Math.floor(dealRevealCount / 2) : Number.POSITIVE_INFINITY
    const visibleDealerCards = dealing
      ? state.dealerCards.slice(0, dealerVisibleCount)
      : state.dealerCards
    const dealerTotalDisplay = dealing
      ? (dealerVisibleCount === 0
          ? '?'
          : handValue(state.dealerCards.slice(0, dealerVisibleCount).filter((c): c is Card => c !== 'X')).total)
      : (state.dealerTotal !== null ? state.dealerTotal : '?')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {/* Dealer */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#a68a4a' }}>Dealer</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: '#f0e8d0', lineHeight: 1 }}>{dealerTotalDisplay}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: CARD_DIMS.h }}>
            {visibleDealerCards.map((c, i) => (
              <DealtCard key={i} card={c} fishArt={getFish(-1, i, c)} />
            ))}
          </div>
        </div>

        {/* Player hands — section label only; each row owns its own
            big total so we don't print the number twice in the
            single-hand case. */}
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#7ad3a0', marginBottom: 8 }}>
            {state.hands.length === 1 ? 'Your Hand' : `Hand ${state.activeHandIdx + 1} of ${state.hands.length}`}
          </p>
          {state.hands.map((h, hi) => {
            // During the initial deal, only the first hand exists and
            // we render up to playerVisibleCount cards. Stood/active
            // signals are silenced while the deal is mid-flight — the
            // breathe + green ACTIVE chip would lie about state (the
            // hand isn't yours yet to act on).
            const visibleHandCards = dealing && hi === 0 ? h.cards.slice(0, playerVisibleCount) : h.cards
            const visibleTotal = dealing && hi === 0
              ? handValue(visibleHandCards).total
              : h.total
            const handIsNaturalReveal = dealing && hi === 0 && playerVisibleCount === 2 && h.isNatural
            const isActive = !dealing && hi === state.activeHandIdx && !h.busted && !h.stood
            return (
            <motion.div
              key={hi}
              // Active hand breathes — a tiny scale pulse that immediately
              // reads "your move," especially helpful when split puts
              // two hands side-by-side. Off for stood/busted hands and
              // off during the deal-reveal animation.
              animate={isActive ? { scale: [1, 1.012, 1] } : { scale: 1 }}
              transition={isActive ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
              style={{
                marginBottom: hi === state.hands.length - 1 ? 0 : 10,
                padding: '0.65rem 0.75rem',
                background: handIsNaturalReveal
                  ? 'rgba(240,192,64,0.10)'
                  : isActive ? 'rgba(122,211,160,0.08)'
                  : h.busted ? 'rgba(240,138,138,0.06)'
                  : 'rgba(255,255,255,0.025)',
                border: `1px solid ${
                  handIsNaturalReveal ? 'rgba(240,192,64,0.5)'
                  : isActive ? 'rgba(122,211,160,0.35)'
                  : h.busted ? 'rgba(240,138,138,0.3)'
                  : 'rgba(255,255,255,0.08)'
                }`,
                borderRadius: 12,
                boxShadow: handIsNaturalReveal ? '0 0 26px rgba(240,192,64,0.32)' : isActive ? '0 0 18px rgba(122,211,160,0.18)' : 'none',
                transformOrigin: 'center',
                transition: 'background 0.3s, border-color 0.3s, box-shadow 0.45s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, minHeight: '1.4rem' }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.64rem',
                  color: handIsNaturalReveal ? '#f0c040' : '#7a948a',
                  letterSpacing: '0.1em',
                }}>
                  {dealing && hi === 0
                    ? (playerVisibleCount === 0 ? '…' : handIsNaturalReveal ? 'BLACKJACK' : 'DEAL')
                    : h.busted ? 'BUST' : h.stood ? 'STOOD' : isActive ? 'ACTIVE' : 'WAITING'} · {h.wager} ⟡{h.doubled ? ' · DD' : ''}{h.isSplit ? ' · SPLIT' : ''}
                </p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.4rem',
                  color: handIsNaturalReveal ? '#f0c040' : h.busted ? '#f08a8a' : h.isNatural && !dealing ? '#f0c040' : '#f0e8d0',
                  lineHeight: 1,
                }}>
                  {visibleHandCards.length === 0
                    ? '–'
                    : <><CountUp value={visibleTotal} duration={350} />{(!dealing && h.soft && h.total !== 21) ? <span style={{ fontSize: '0.65rem', marginLeft: 4 }}>(soft)</span> : ''}{h.isNatural && !dealing ? <span style={{ fontSize: '0.7rem', marginLeft: 4 }}>· BJ</span> : ''}</>}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: CARD_DIMS.h }}>
                {visibleHandCards.map((c, ci) => (
                  <DealtCard key={ci} card={c} fishArt={getFish(hi, ci, c)} />
                ))}
              </div>
            </motion.div>
          )})}
        </div>

        {/* Action bar — gated on the deal animation finishing. Until
            then, an empty slot holds the vertical space so the modal
            doesn't jump when buttons mount. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 60 }}>
          {!dealing && (
            <>
              <ActionButton label="Hit"   onClick={() => fireAction(hit)}        disabled={!state.canHit || isPending} />
              <ActionButton label="Stand" onClick={() => fireAction(stand)}      disabled={!state.canStand || isPending} />
              {state.canDouble && (
                <ActionButton label="Double" chip={`${activeHand?.wager} ⟡`} onClick={() => fireAction(doubleDown)} disabled={isPending} />
              )}
              {state.canSplit && (
                <ActionButton label="Split"  chip={`${state.hands[0].wager} ⟡`} onClick={() => fireAction(split)} disabled={isPending} />
              )}
            </>
          )}
        </div>

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
        )}
      </div>
    )
  }

  function renderSettleScreen(r: SettleResult) {
    // Dealer total reflects ONLY the cards that have actually been
    // revealed on screen — not the final hand. Pre-hole-flip that's
    // just the up card; once flipped, both first two; then it ticks up
    // as each extra dealer draw slides in. Using r.dealerTotal here
    // (the final value) would spoil the result before the cards land.
    const visibleDealerCount = holeFlipped ? revealedDealerCount : 1
    const visibleDealerCards = r.dealerCards.slice(0, Math.max(1, visibleDealerCount))
    const dealerTotalVisible = handValue(visibleDealerCards).total

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {/* Net-delta panel removed — the cumulative session tally lives
            in the header instead so this surface doesn't flex between
            hands. Hand-level outcome chips below still reveal in step
            with the dealer flip. */}

        {/* Dealer — cards reveal in sequence; index 1 is the FlipCard hole.
            When dealer busts, the whole row gets a red glow + "Bust"
            stamp post-reveal, mirroring how player-bust hands look. */}
        <motion.div
          animate={outcomeShown && r.dealerBust
            ? { boxShadow: ['0 0 0 rgba(240,138,138,0)', '0 0 24px rgba(240,138,138,0.45)', '0 0 16px rgba(240,138,138,0.28)'] }
            : { boxShadow: '0 0 0 rgba(0,0,0,0)' }}
          transition={{ duration: 0.6 }}
          style={{
            padding: outcomeShown && r.dealerBust ? '0.5rem 0.55rem' : 0,
            margin: outcomeShown && r.dealerBust ? '-0.5rem -0.55rem' : 0,
            borderRadius: 12,
            background: outcomeShown && r.dealerBust ? 'rgba(240,138,138,0.06)' : 'transparent',
            border: outcomeShown && r.dealerBust ? '1px solid rgba(240,138,138,0.28)' : '1px solid transparent',
            transition: 'background 0.3s, border-color 0.3s, padding 0.3s, margin 0.3s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#a68a4a' }}>
              Dealer · {dealerTotalVisible}{outcomeShown && r.dealerNatural ? ' · Blackjack' : ''}
            </p>
            <AnimatePresence>
              {outcomeShown && r.dealerBust && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: -4 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                  className="font-karla font-700 uppercase tracking-[0.14em]"
                  style={{
                    fontSize: '0.62rem',
                    color: '#f08a8a',
                    background: 'rgba(240,138,138,0.14)',
                    border: '1px solid rgba(240,138,138,0.5)',
                    padding: '0.18rem 0.5rem',
                    borderRadius: 5,
                  }}
                >
                  Bust
                </motion.span>
              )}
            </AnimatePresence>
          </div>
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
                  whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.55)' }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.32 }}
                  style={{ flexShrink: 0, cursor: 'pointer' }}
                >
                  <BlackjackCard card={c} fishArt={fish} />
                </motion.div>
              )
            })}
          </div>
        </motion.div>

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
            const isBust = h.total > 21
            const isNatural21 = h.outcome === 'blackjack'
            const isStood21 = !isBust && h.total === 21 && !isNatural21
            // Pre-reveal state: player-side facts only (bust / 21 / total
            // — things the player could compute themselves from the cards
            // already on the table). Reveal-time color shifts to the full
            // outcome palette once the dealer plays out.
            const preColor = isBust ? '#f08a8a' : (isStood21 || isNatural21) ? '#f0c040' : '#c4a96a'
            const c = isWin ? '#7ad3a0' : isLose ? '#f08a8a' : '#c4a96a'
            const label = h.outcome === 'blackjack' ? 'Blackjack 3:2' : h.outcome === 'win' ? 'Win' : h.outcome === 'push' ? 'Push' : isBust ? 'Bust' : h.outcome === 'lose' ? 'Lose' : h.outcome
            // Bust shake + winning glow fire as soon as the row mounts
            // for the bust case (it's a player-side fact — they already
            // know they busted, no reason to hide it) and on outcomeShown
            // for the winning glow (don't spoil dealer comparison wins
            // until the dealer plays out).
            const glowShadow = outcomeShown && isWin ? `0 0 24px ${c}55` : 'none'
            return (
              <motion.div
                key={hi}
                animate={isBust
                  ? { x: [0, -5, 5, -4, 4, -2, 2, 0] }
                  : { x: 0 }}
                transition={isBust ? { duration: 0.55, ease: 'easeInOut' } : { duration: 0 }}
                style={{
                  marginBottom: hi === r.hands.length - 1 ? 0 : 10,
                  padding: '0.6rem 0.7rem',
                  // Pre-reveal: bust hands tint red immediately; stood-21
                  // hands tint gold; everything else stays neutral until
                  // the dealer plays out and the win/lose color lands.
                  background: outcomeShown
                    ? `${c}14`
                    : isBust ? 'rgba(240,138,138,0.10)'
                    : (isStood21 || isNatural21) ? 'rgba(240,192,64,0.08)'
                    : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${
                    outcomeShown ? c + '5a'
                    : isBust ? 'rgba(240,138,138,0.45)'
                    : (isStood21 || isNatural21) ? 'rgba(240,192,64,0.4)'
                    : 'rgba(255,255,255,0.08)'
                  }`,
                  borderRadius: 10,
                  boxShadow: glowShadow,
                  transition: 'background 0.3s, border-color 0.3s, box-shadow 0.45s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, minHeight: '0.95rem' }}>
                  {/* Pre-reveal label always shows the player's total +
                      a BUST / 21 stamp if applicable, so they get
                      immediate confirmation of what their hit did.
                      Crossfades into the full outcome label when the
                      dealer reveal finishes. */}
                  <AnimatePresence mode="wait">
                    {outcomeShown ? (
                      <motion.p
                        key="outcome-label"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="font-karla font-700 uppercase"
                        style={{ fontSize: '0.64rem', color: c, letterSpacing: '0.1em' }}
                      >
                        {label} · {h.total}{h.doubled ? ' · DD' : ''}
                      </motion.p>
                    ) : (
                      <motion.p
                        key="pre-label"
                        initial={{ opacity: 0, scale: isBust ? 0.7 : 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: isBust ? 380 : 340, damping: isBust ? 14 : 20 }}
                        className="font-karla font-700 uppercase"
                        style={{ fontSize: '0.64rem', color: preColor, letterSpacing: '0.1em' }}
                      >
                        {isBust ? `Bust · ${h.total}` : isNatural21 ? `Blackjack · 21` : isStood21 ? `21` : `Hand · ${h.total}`}{h.doubled ? ' · DD' : ''}
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
                    <motion.div
                      key={ci}
                      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.55)' }}
                      whileTap={{ scale: 0.96 }}
                      style={{ flexShrink: 0, cursor: 'pointer' }}
                    >
                      <BlackjackCard card={card} fishArt={getFish(hi, ci, card)} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
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

        {/* One-tap re-deal: instead of a Play Again button → wager
            screen, the bet-preset row appears right here once the
            outcome lands. Tapping a preset deals immediately at that
            amount. Falls back to a Buy-In CTA if the player busted
            out completely (chips below the smallest preset). */}
        <AnimatePresence>
          {outcomeShown && (
            <motion.div
              key="post-settle-actions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {chips >= BJ_MIN_BET ? (
                <>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a', textAlign: 'center', marginBottom: 8 }}>
                    Deal Next Hand
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {BJ_BET_PRESETS.map(amt => {
                      const disabled = amt > Math.min(BJ_MAX_BET, chips) || isPending
                      return (
                        <button
                          key={amt}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setWager(amt)
                            // Bypass the wager screen — go straight to dealing.
                            // nextHand() resets reveal state then setPhase('wager');
                            // we want to skip that and call startDeal-equivalent
                            // logic directly.
                            clearRevealTimers()
                            setResult(null)
                            setActive(null)
                            setHoleFlipped(false)
                            setRevealedDealerCount(0)
                            setOutcomeShown(false)
                            fishCacheRef.current.clear()
                            fireAction(() => dealBlackjack(amt))
                          }}
                          className="font-cinzel font-700 uppercase tracking-[0.1em]"
                          style={{
                            padding: '0.85rem 0', borderRadius: 10,
                            background: disabled
                              ? 'rgba(255,255,255,0.04)'
                              : 'linear-gradient(180deg, rgba(240,192,64,0.35) 0%, rgba(196,169,106,0.16) 100%)',
                            border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : '#f0c040'}`,
                            color: disabled ? '#5a5550' : '#f0d695',
                            fontSize: '0.88rem',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            boxShadow: disabled ? 'none' : 'inset 0 1px 0 rgba(240,214,149,0.25), 0 2px 6px rgba(0,0,0,0.4)',
                            textShadow: disabled ? 'none' : '0 1px 0 rgba(0,0,0,0.45)',
                          }}
                        >
                          {amt} ⟡
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => { setResult(null); setActive(null); setHoleFlipped(false); setRevealedDealerCount(0); setOutcomeShown(false); setPhase('buyIn') }}
                  className="font-cinzel font-700 uppercase tracking-[0.08em]"
                  style={{
                    width: '100%',
                    padding: '0.85rem 0', borderRadius: 12,
                    background: 'rgba(240,192,64,0.18)',
                    border: '1px solid rgba(240,192,64,0.55)',
                    color: '#f0d695',
                    fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  Buy More Chips →
                </button>
              )}
            </motion.div>
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
      position: 'relative',   // anchor for coin-flight overlay
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
      overflow: 'hidden',     // clip coin trails that escape the modal
    }}>
      {/* Header: chip stack + cash-out shortcut. The Nav already shows
          the player's doubloon balance — no need to duplicate it.
          Daily-cap bar ONLY shows on the buy-in screen — once you're at
          the table with chips, the cap is irrelevant info (chips can
          churn freely without re-hitting the buy-in cap). */}
      <div style={{
        marginBottom: '1.1rem',
        paddingBottom: '0.85rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {phase !== 'buyIn' ? (
          // Three-up header: chips (left), session tally (center), Cash
          // Out (right). The session tally is `chips - sessionBuyIns` —
          // green when net-up, red when net-down. Sits in a fixed-height
          // center slot so the row never reflows between hands, replacing
          // the per-hand net-delta animation that used to shift the UI.
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a' }}>Chips</p>
              <motion.p
                // Brief scale punch on the chips number every time a
                // hand settles — drawing the player's eye to where the
                // value just moved. Key bound to handId so each settle
                // re-fires; transformOrigin left so the digits don't
                // drift around when they pulse.
                key={`chips-${result?.handId ?? 'idle'}`}
                animate={{ scale: phase === 'settled' && outcomeShown ? [1, 1.24, 1] : 1 }}
                transition={{ duration: 0.85, times: [0, 0.32, 1], ease: 'easeOut' }}
                className="font-cinzel font-700"
                style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1, transformOrigin: 'left center' }}
              >
                {chips.toLocaleString()} ⟡
              </motion.p>
            </div>
            <div style={{ textAlign: 'center', minWidth: 88 }}>
              {sessionBuyIns > 0 ? (() => {
                const tally = chips - sessionBuyIns
                const up = tally > 0
                const flat = tally === 0
                const color = flat ? '#8a8478' : up ? '#7fd49a' : '#e07070'
                const sign = up ? '+' : ''
                return (
                  <>
                    <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a' }}>Session</p>
                    <motion.p
                      key={`tally-${result?.handId ?? 'idle'}`}
                      animate={{ scale: phase === 'settled' && outcomeShown ? [1, 1.2, 1] : 1 }}
                      transition={{ duration: 0.85, times: [0, 0.32, 1], ease: 'easeOut', delay: 0.05 }}
                      className="font-cinzel font-700"
                      style={{ fontSize: '1.05rem', color, lineHeight: 1 }}
                    >
                      {sign}{tally.toLocaleString()} ⟡
                    </motion.p>
                  </>
                )
              })() : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {(phase === 'wager' || phase === 'settled') && chips > 0 && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={doCashOut}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                  style={{
                    padding: '0.5rem 0.85rem', borderRadius: 999,
                    background: 'rgba(196,169,106,0.1)',
                    border: '1px solid rgba(196,169,106,0.45)',
                    color: '#c4a96a',
                    fontSize: '0.62rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cash Out
                </button>
              )}
            </div>
          </div>
        ) : (
          <DailyCapBar wagered={dailyWagered} cap={BJ_DAILY_CAP} />
        )}
      </div>

      {phase === 'buyIn' && renderBuyInScreen()}
      {phase === 'wager' && renderWagerScreen()}
      {phase === 'play' && active && renderGameScreen(active)}
      {phase === 'settled' && result && renderSettleScreen(result)}

      {/* Settle celebration — absolute overlay over the modal interior.
          Mounts when outcomeShown flips true (after the reveal beats
          finish), keyed by handId so each new settle re-plays from
          scratch. Pointer-events:none so Play Again stays tappable
          through it. Position: absolute (relative to the modal root,
          which is already position-implicit via its layout context).
          Loss tier returns null inside the component — we don't
          celebrate losses. */}
      {phase === 'settled' && result && outcomeShown && (() => {
        const hasBlackjack = result.hands.some(h => h.outcome === 'blackjack')
        const hasWin       = result.hands.some(h => h.outcome === 'win' || h.outcome === 'blackjack')
        const allPush      = result.hands.every(h => h.outcome === 'push')
        const tier: 'blackjack' | 'win' | 'push' | 'loss' =
          hasBlackjack ? 'blackjack' : hasWin ? 'win' : allPush ? 'push' : 'loss'
        return <SettleCelebration key={`celeb-${result.handId}`} tier={tier} amount={result.netDelta} />
      })()}

      {/* Coin-flight overlay. Bumping coinFlightKey unmounts/remounts
          the burst, which is how each new win re-triggers the animation.
          key === 0 = never won yet → don't render. */}
      {coinFlightKey > 0 && <CoinFlight key={coinFlightKey} />}

      {/* Insurance pop-up. Pure overlay over the play area; dismisses
          itself the moment the player picks an option. Backdrop blur +
          centered card; matches the dealer-card area's visual weight. */}
      <AnimatePresence>
        {phase === 'play' && active?.insuranceOffered && dealRevealCount === 4 && (
          <>
            <motion.div
              key="ins-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              // position: fixed so the overlay anchors to the viewport,
              // not the Blackjack modal. On phones where the modal is
              // taller than the viewport, an absolute "top: 50%" lands
              // the card below the fold — switching to fixed centers
              // it in the visible area regardless of scroll position.
              style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(2,4,8,0.7)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
            />
            {/* Fixed flex container does the centering — framer-motion's
                animate={{ y, scale }} on the inner card composes into
                `transform`, which would otherwise clobber any
                `transform: translate(-50%, -50%)` we set inline and
                push the card off-screen on phones. Outer wrap is
                pointer-events: none so taps outside the card fall
                through to the backdrop. */}
            <div
              key="ins-card-wrap"
              style={{
                position: 'fixed', inset: 0, zIndex: 201,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1.1rem',
                pointerEvents: 'none',
              }}
            >
            <motion.div
              key="ins-card"
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              style={{
                width: '100%', maxWidth: 340,
                padding: '1.25rem 1.1rem 1.1rem',
                borderRadius: 14,
                background: 'linear-gradient(180deg, #1c2538 0%, #0d1320 100%)',
                border: '1.5px solid rgba(125,160,216,0.55)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.7)',
                pointerEvents: 'auto',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#7aa7e8', marginBottom: 5 }}>
                Side Bet
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#dde8f6', lineHeight: 1, marginBottom: 10 }}>
                Insurance?
              </p>
              <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9aa4b5', marginBottom: 14, lineHeight: 1.5 }}>
                Dealer shows an Ace. For {Math.floor(active.hands[0].wager / 2)} ⟡ you can side-bet that the hole card is a 10-value. Pays 2:1 if dealer has natural Blackjack.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={isPending || doubloons < Math.floor(active.hands[0].wager / 2)}
                  onClick={() => fireAction(acceptInsurance)}
                  className="font-cinzel font-700 uppercase tracking-[0.06em]"
                  style={{
                    flex: 1, padding: '0.85rem 0', borderRadius: 11,
                    background: 'linear-gradient(180deg, rgba(125,160,216,0.5) 0%, rgba(125,160,216,0.2) 100%)',
                    border: '1.5px solid rgba(125,160,216,0.8)',
                    color: '#eef4ff',
                    fontSize: '0.85rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    boxShadow: 'inset 0 1px 0 rgba(125,160,216,0.5), inset 0 -2px 0 rgba(0,0,0,0.25), 0 3px 8px rgba(0,0,0,0.45)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.45)',
                  }}
                >
                  Take · {Math.floor(active.hands[0].wager / 2)} ⟡
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => fireAction(declineInsurance)}
                  className="font-cinzel font-700 uppercase tracking-[0.06em]"
                  style={{
                    flex: 1, padding: '0.85rem 0', borderRadius: 11,
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                    border: '1.5px solid rgba(255,255,255,0.18)',
                    color: '#c5beb4',
                    fontSize: '0.85rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.2), 0 3px 8px rgba(0,0,0,0.45)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.45)',
                  }}
                >
                  Decline
                </button>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Action button — restrained tavern-style stamp. Dark glass body
 *  (rgba(8,5,2,0.7)) with a thin parchment-gold border + bold Cinzel
 *  uppercase label. No colored gradients per button (was reading as
 *  cheesy + chaotic with four different accent hues competing in one
 *  row). Differentiation comes from typography hierarchy and an
 *  optional gold chip-amount slipped after the label for bet-cost
 *  actions (Double / Split). Hover brightens the border + adds a
 *  subtle text glow; press dents the button via translateY.
 *
 *  `accent` is no longer used to tint the body — kept on the signature
 *  for caller compatibility but unused. Hit/Stand/Double/Split all
 *  share the same visual treatment now. */
function ActionButton({ label, chip, onClick, disabled }: {
  label: string
  chip?: string             // optional cost suffix, e.g. "50 ⟡"
  onClick: () => void
  disabled: boolean
  accent?: string           // retained for caller compatibility, unused
  icon?: never              // icons retired — pure typography now
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={!disabled ? { y: -1.5 } : undefined}
      whileTap={!disabled ? { y: 1, scale: 0.985 } : undefined}
      transition={{ type: 'spring', stiffness: 480, damping: 28 }}
      className="font-cinzel font-700 uppercase"
      style={{
        flex: 1, minWidth: 72,
        padding: '0.7rem 0.55rem',
        borderRadius: 4,
        background: disabled
          ? 'rgba(8,5,2,0.45)'
          : 'rgba(8,5,2,0.72)',
        border: `1px solid ${disabled ? 'rgba(196,169,106,0.16)' : 'rgba(196,169,106,0.5)'}`,
        color: disabled ? '#5a5550' : '#d4ba78',
        fontSize: '0.95rem',
        letterSpacing: '0.16em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        // Stack label + chip vertically inside the button. Locked min
        // height so Hit/Stand (label only) line up with Double/Split
        // (label + chip). Without this, the bet buttons would be
        // taller and the row would look uneven.
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 3,
        minHeight: 60,
        boxShadow: disabled
          ? 'none'
          : 'inset 0 1px 0 rgba(240,214,149,0.18), inset 0 -1px 0 rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.45)',
        textShadow: disabled ? 'none' : '0 1px 0 rgba(0,0,0,0.6)',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = 'rgba(240,214,149,0.85)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.borderColor = 'rgba(196,169,106,0.5)' }}
    >
      <span style={{ lineHeight: 1 }}>{label}</span>
      {chip && (
        <span style={{
          color: disabled ? '#4a4540' : '#f0c040',
          fontFamily: 'inherit',
          letterSpacing: '0.06em',
          fontSize: '0.7rem',
          lineHeight: 1,
        }}>
          {chip}
        </span>
      )}
    </motion.button>
  )
}
