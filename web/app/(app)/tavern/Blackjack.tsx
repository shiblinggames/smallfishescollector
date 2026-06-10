'use client'

import { forwardRef, useEffect, useRef, useState, useTransition } from 'react'
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
import WagerCircle from './WagerCircle'

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

/** Animates a number from its PREVIOUS rendered value to its new
 *  value over `duration` ms. Unlike CountUp (which always starts from
 *  0 on mount), this is meant for live counters — chips, session
 *  tally — where the start point is whatever was on screen before
 *  the change. Cubic ease-out so big swings feel weighty. Returns the
 *  raw number so the consumer can format / colorize / sign it. */
function useAnimatedNumber(value: number, duration = 900): number {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  useEffect(() => {
    const start = prevRef.current
    if (start === value) { setDisplay(value); return }
    const delta = value - start
    let raf = 0
    let startTime: number | null = null
    const tick = (t: number) => {
      if (startTime === null) startTime = t
      const p = Math.min(1, (t - startTime) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(start + delta * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else { prevRef.current = value; setDisplay(value) }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); prevRef.current = value }
  }, [value, duration])
  return display
}

/** Hand-total ticker. Animates smoothly from the previously-displayed
 *  value to the new value (not from zero). Used for the player + dealer
 *  hand totals — CountUp's reset-to-zero behavior reads as the old digit
 *  ghosting back into view on the way up (e.g., 12 → flash to 0 → tick
 *  through 12 again on the climb to 18), which players perceive as the
 *  old total "overlapping" with the new one when they hit on a split
 *  hand. useAnimatedNumber handles the previous-to-new interpolation
 *  cleanly, so the digit just morphs from one value to the next. */
function TickingTotal({ value, duration = 350 }: { value: number; duration?: number }) {
  const animated = useAnimatedNumber(value, duration)
  return <>{animated}</>
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
      {/* Flex wrap centers the plaque horizontally; positioning the
          plaque against the top third of the modal so it sits above
          the cards but not over the chips header. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '24%',
      }}>
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
            maxWidth: '86%',
            padding: isBlackjack ? '18px 26px 20px' : '14px 22px 16px',
            borderRadius: 16,
            // Glassy dark plaque: high-contrast backdrop for the gold/
            // green text so it pops against the busy card layout
            // underneath. backdrop-filter blurs the cards behind it
            // for extra separation on supporting browsers.
            background: isBlackjack
              ? 'linear-gradient(180deg, rgba(28,18,4,0.92) 0%, rgba(10,6,2,0.92) 100%)'
              : 'linear-gradient(180deg, rgba(6,14,9,0.88) 0%, rgba(4,8,5,0.88) 100%)',
            border: isBlackjack
              ? '1.5px solid rgba(240,192,64,0.65)'
              : '1.5px solid rgba(127,212,154,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: isBlackjack
              ? '0 18px 50px rgba(0,0,0,0.7), 0 0 60px rgba(240,192,64,0.35)'
              : '0 14px 36px rgba(0,0,0,0.65), 0 0 40px rgba(127,212,154,0.22)',
            textAlign: 'center',
            textShadow: isBlackjack
              ? '0 0 18px rgba(240,192,64,0.55), 0 3px 10px rgba(0,0,0,0.55)'
              : '0 0 12px rgba(127,212,154,0.4), 0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <p className="font-cinzel font-700" style={{
            fontSize: headlineSize,
            color: accent,
            lineHeight: 1,
            letterSpacing: isBlackjack ? '0.06em' : '0.02em',
            marginBottom: amount !== 0 ? 8 : 0,
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
function FlipCard({ flipped, card, fishArt, duration = 820 }: { flipped: boolean; card: Card | null; fishArt: string | null; duration?: number }) {
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
          {card !== null && <BlackjackCard card={card} fishArt={fishArt} />}
        </div>
      </div>
    </div>
  )
}

/** Card that slides in face-down and flips to face-up shortly after
 *  it mounts — the "card dealt to the player" animation used during
 *  the initial deal and on hit/double draws. Pass card='X' to render
 *  a card that lands face-down and stays there (the dealer hole).
 *
 *  mode='dealing' (default): slide in + flip after 180ms.
 *  mode='revealed': render face-up statically, no slide / no flip —
 *    used when a card was already shown on a prior screen (settle
 *    screen rendering cards the player saw during play) so the DOM
 *    structure stays identical across phase changes and the browser
 *    doesn't tear down + rebuild the 3D context.
 *
 *  Always wraps motion.div + FlipCard so the 3D layer is identical
 *  whether the card is hidden, dealing, or already revealed —
 *  prevents the stutter that happens when the play→settle transition
 *  swaps a plain BlackjackCard for a 3D FlipCard at the same slot.
 *
 *  onFlipComplete fires once when the flip animation finishes (or
 *  immediately for revealed/hidden cards) so the parent can defer
 *  the hand total update until the card has visually settled face-up.
 */
function DealtCard({ card, fishArt, onFlipComplete, mode = 'dealing' }: { card: Card | 'X'; fishArt: string | null; onFlipComplete?: () => void; mode?: 'dealing' | 'revealed' }) {
  const isHidden = card === 'X'
  const [flipped, setFlipped] = useState(mode === 'revealed' && !isHidden)
  // Ref-mirror the callback so re-rendering the parent with a fresh
  // arrow function doesn't re-trigger the mount effect and replay the
  // flip from scratch.
  const onFlipCompleteRef = useRef(onFlipComplete)
  useEffect(() => { onFlipCompleteRef.current = onFlipComplete })
  useEffect(() => {
    if (mode === 'revealed' || isHidden) {
      // Already-revealed cards (settle screen rendering cards the
      // player saw during play) and hidden cards both call back on
      // the next tick — no flip animation to wait for.
      const id = window.setTimeout(() => onFlipCompleteRef.current?.(), 0)
      return () => clearTimeout(id)
    }
    // Tiny delay so the slide-in motion (0.36s) reads first; the flip
    // starts while the card is still settling, total deal-in feels
    // like one fluid motion. onFlipComplete fires once the 480ms CSS
    // flip transition wraps (plus a 30ms buffer so the face has fully
    // committed visually before the total ticks).
    const startId = window.setTimeout(() => setFlipped(true), 180)
    const doneId  = window.setTimeout(() => onFlipCompleteRef.current?.(), 180 + 480 + 30)
    return () => { clearTimeout(startId); clearTimeout(doneId) }
  }, [isHidden, mode])
  return (
    <motion.div
      initial={mode === 'revealed' ? false : { opacity: 0, y: -22, scale: 0.85 }}
      animate={mode === 'revealed' ? false : { opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.55)' }}
      whileTap={{ scale: 0.96 }}
      transition={mode === 'revealed' ? { duration: 0 } : { duration: 0.36, ease: 'easeOut' }}
      style={{ flexShrink: 0, cursor: 'pointer' }}
    >
      {/* Always FlipCard (even for hidden) so the 3D context stays
          consistent across phase transitions. Hidden case passes
          card=null which makes FlipCard's front face render nothing
          — only the cardback (back face) is visible. */}
      <FlipCard
        flipped={!isHidden && flipped}
        card={isHidden ? null : (card as Card)}
        fishArt={isHidden ? null : fishArt}
        duration={480}
      />
    </motion.div>
  )
}

/** "Felt etching" — uppercase low-opacity gold text anchored to the
 *  right edge of the card row. Pass a string for a single line or an
 *  array for stacked lines (e.g., the player-side rules where
 *  Blackjack 3:2 sits above Insurance 2:1). Cards flex from the left
 *  and cover this when the hand grows past two cards. Stays out of
 *  normal flow (position: absolute) so adding rule lines never shifts
 *  the play surface vertically — sits behind the cards as decoration,
 *  not a new row. */
function FeltRule({ text }: { text: string | readonly string[] }) {
  const lines = Array.isArray(text) ? text : [text as string]
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        right: 4,
        top: '50%',
        transform: 'translateY(-50%)',
        textAlign: 'right',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {lines.map((line, i) => (
        <p
          key={i}
          className="font-karla font-700 uppercase"
          style={{
            color: '#a68a4a',
            opacity: 0.32,
            fontSize: '0.5rem',
            letterSpacing: '0.22em',
            whiteSpace: 'nowrap',
            lineHeight: 1.55,
            textShadow: '0 1px 0 rgba(0,0,0,0.5)',
            margin: 0,
          }}
        >
          {line}
        </p>
      ))}
    </div>
  )
}

/** Visual pot indicator. Single source of truth for the player's stake
 *  — used between the dealer + player rows during play AND on the wager
 *  / Deal-Next-Hand screens as the flight target for chip taps. forwarded
 *  ref lets WagerCircle compute the screen-space position to fly chips
 *  into. The number comes from useAnimatedNumber upstream so doubles,
 *  splits, and insurance tick up smoothly during play. */
const PotPill = forwardRef<HTMLDivElement, { value: number; label?: string }>(function PotPill(
  { value, label = 'Pot' }, ref
) {
  const empty = value <= 0
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 42 }}>
      <motion.div
        ref={ref}
        animate={{
          scale: empty ? 0.86 : 1,
          opacity: empty ? 0.32 : 1,
        }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '0.42rem 1.05rem',
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(60,42,16,0.62) 0%, rgba(28,18,4,0.62) 100%)',
          border: `1px solid ${empty ? 'rgba(196,169,106,0.22)' : 'rgba(196,169,106,0.6)'}`,
          boxShadow: empty ? 'none' : '0 0 22px rgba(240,192,64,0.20), 0 4px 14px rgba(0,0,0,0.45)',
        }}
      >
        <span className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.55rem', color: '#a68a4a' }}>{label}</span>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0c040', lineHeight: 1 }}>
          {value.toLocaleString()} ⟡
        </p>
      </motion.div>
    </div>
  )
})

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
  // Wager now ACCUMULATES — each chip tap adds to it, clear resets it,
  // and Deal commits whatever's on the table. Default 0 so the wager
  // circle reads as 'empty' on the wager screen.
  const [wager, setWager] = useState<number>(0)
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

  // Header counters animate from prev value → new value on every change
  // (instead of jumping), so the player visually sees their chips +/-
  // the hand's net delta. Tally is chips - sessionBuyIns and can swing
  // negative; the sign + color shift with the displayed value so a
  // tally counting from -100 to +200 reads naturally as the digits
  // tick through zero.
  const tally = chips - sessionBuyIns
  const animatedChips = useAnimatedNumber(chips, 950)
  const animatedTally = useAnimatedNumber(tally, 950)

  // Pot indicator. Lives between dealer and player rows on play +
  // settle, showing the total committed to the table for this hand
  // (initial wager + any doubles + splits + insurance). Animates from
  // chips → pot when bets land, drains pot → 0 on outcome (chips
  // animation handles the matching upward count). Source of truth is
  // active.totalWagered during play; on settle we hold the last value
  // until outcomeShown fires, then drain.
  const [potAmount, setPotAmount] = useState(0)
  const animatedPot = useAnimatedNumber(potAmount, 850)
  // One ref shared between the wager screen's PotPill and the post-
  // settle 'Deal Next Hand' PotPill — both renders use this ref as the
  // chip-flight target. Wager phase and post-settle phase never render
  // at the same time, so a single ref serves both.
  const wagerPotRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (phase === 'play' && active) setPotAmount(active.totalWagered)
    else if (phase === 'wager' || phase === 'buyIn') setPotAmount(0)
  }, [phase, active?.totalWagered, active])
  useEffect(() => {
    if (phase === 'settled' && outcomeShown) setPotAmount(0)
  }, [phase, outcomeShown])

  // Flip-gated counts. Card values only count toward the displayed
  // hand totals AFTER the card has finished its flip animation, so
  // the digits don't tick up while the face is still hidden mid-spin.
  // Each DealtCard fires onFlipComplete (~690ms after mount) which
  // bumps the relevant counter; total = handValue of cards[0..count].
  //  • handFlipCounts[hi] → flipped card count per player hand
  //  • dealerTotalCardCount → flipped dealer card count (settle screen)
  //    advances to 2 when the hole-card FlipCard completes (820ms after
  //    holeFlipped goes true), and to 3+ as extra DealtCards complete.
  const [handFlipCounts, setHandFlipCounts] = useState<Record<number, number>>({})
  const [dealerTotalCardCount, setDealerTotalCardCount] = useState(0)
  useEffect(() => {
    // Hole card flip uses FlipCard (820ms) not DealtCard, so we time
    // the dealer-total advance from holeFlipped explicitly. Resets
    // when holeFlipped goes back to false (a fresh settle reveal).
    if (!holeFlipped) {
      setDealerTotalCardCount(0)
      return
    }
    const id = window.setTimeout(() => {
      setDealerTotalCardCount(prev => Math.max(prev, 2))
    }, 820)
    return () => clearTimeout(id)
  }, [holeFlipped])

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
   *  path can run the deal animation first, then call this.
   *  `skipInitialHold` is set when the player just watched their bust
   *  / 21 card flip in on a held play screen — no need to give them
   *  another long pause before the hole flip; settle mounts and the
   *  dealer turn begins almost immediately. */
  function startSettleReveal(result: SettleResult, opts: { skipInitialHold?: boolean } = {}) {
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
    // Skipped when the player already saw the card flip in on a held
    // play screen (the digestion happened there, not here).
    const anyPlayerBust    = result.hands.some(h => h.total > 21)
    const anyPlayerStood21 = result.hands.some(h => h.total === 21 && h.outcome !== 'blackjack')
    const initialHold = opts.skipInitialHold
      ? 250
      : anyPlayerBust ? 1900 : anyPlayerStood21 ? 1500 : 650

    let elapsed = initialHold
    revealTimersRef.current.push(window.setTimeout(() => setHoleFlipped(true), elapsed))
    elapsed += 820                    // flip duration

    const extraDealer = Math.max(0, result.dealerCards.length - 2)
    for (let i = 0; i < extraDealer; i++) {
      elapsed += 850
      const target = 3 + i           // revealedDealerCount after this fires
      revealTimersRef.current.push(window.setTimeout(() => setRevealedDealerCount(target), elapsed))
    }

    // Wait for the last drawn dealer card's flip to complete (~690ms
    // mount → flip-done), so the displayed total reflects the final
    // hand before the outcome resolves. If dealer didn't draw extras,
    // the hole flip's 820ms is already baked into `elapsed`.
    if (extraDealer > 0) elapsed += 690
    // Dwell before outcomeShown so the BUST chip / final total has
    // time to register. Longer on dealer bust so the moment lands.
    elapsed += result.dealerBust ? 1200 : 700
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

    // Mid-hand settle (hit/stand/double/split resolved). If the result
    // includes a new card the player just drew (hit-to-bust,
    // hit-to-21, double-bust, double-stand), hold the play screen for
    // a beat so the new card flips in via DealtCard's mount animation
    // before we transition to the dealer reveal. Without this the
    // card jumps straight to settle layout face-up with no flip — it
    // reads as a calculator output, not a card being dealt.
    const newCardLanded = !!active && (
      r.result.hands.length > active.hands.length
      || r.result.hands.some((h, i) => h.cards.length > (active.hands[i]?.cards.length ?? 0))
    )
    if (newCardLanded) {
      setActive(synthActiveFromResult(r.result))
      setPhase('play')
      const anyBust = r.result.hands.some(h => h.total > 21)
      // ~660ms for DealtCard's slide (360ms) + flip (180ms delay +
      // 480ms transition) plus dwell. Bust gets extra to really land.
      const hold = anyBust ? 1700 : 1300
      revealTimersRef.current.push(window.setTimeout(() => {
        startSettleReveal(r.result, { skipInitialHold: true })
      }, hold))
      return
    }

    // Player stood (no new card) — straight to dealer reveal.
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
    setActive(null)                       // clear last hand's table state — no-op on the wager screen, mandatory on post-settle re-deal
    setHoleFlipped(false)
    setRevealedDealerCount(0)
    setOutcomeShown(false)
    setDealRevealCount(0)
    setHandFlipCounts({})
    setDealerTotalCardCount(0)
    // Pre-seed the pot to the current wager so the PotPill doesn't
    // visually drop to 0 in the moment between the wager screen
    // unmounting (value=wager) and the play screen taking over
    // (value=animatedPot). With this set, animatedPot is already at
    // the wager amount when phase flips to 'play' and the
    // active.totalWagered effect runs.
    setPotAmount(wager)
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
    setHandFlipCounts({})
    setDealerTotalCardCount(0)
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

        <motion.button
          type="button"
          disabled={!canBuyIn}
          onClick={doBuyIn}
          whileTap={canBuyIn ? { y: 3, scale: 0.94, borderColor: 'rgba(240,214,149,1)' } : undefined}
          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
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
        </motion.button>

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center' }}>{error}</p>
        )}
      </div>
    )
  }

  function renderWagerScreen() {
    // Wager screen mirrors the play screen's vertical structure so the
    // PotPill sits at the SAME on-screen position throughout — chips
    // fly into the pot here, Deal commits, the dealer/player blocks
    // fill in around the unchanged pot. No layout jump, no second pot.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {/* Dealer slot — dim placeholder. Same vertical real estate as
            the real dealer block so the pot below lands in the same
            spot on play. */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#5a5550' }}>Dealer</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: '#5a5550', lineHeight: 1 }}>—</p>
          </div>
          <div style={{ minHeight: CARD_DIMS.h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845', letterSpacing: '0.08em' }}>
              Place your bet to deal
            </p>
          </div>
        </div>

        {/* THE pot — same component, same position, same ref attached
            below for chip flights. Reads `wager` directly so the value
            ticks up the moment a chip lands in it. */}
        <PotPill value={wager} ref={wagerPotRef} />

        {/* Player slot — dim placeholder mirroring the dealer slot. */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#5a5550' }}>You</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: '#5a5550', lineHeight: 1 }}>—</p>
          </div>
          <div style={{ minHeight: CARD_DIMS.h - 14 }} />
        </div>

        {/* Chip rack + Deal — replaces the action buttons row from the
            play screen. Same horizontal slot at the bottom of the
            modal so the eye lands in the right place. */}
        <WagerCircle
          wager={wager}
          presets={BJ_BET_PRESETS}
          chipsLeft={chips - wager}
          maxBet={Math.min(BJ_MAX_BET, chips)}
          minBet={BJ_MIN_BET}
          onAdd={(d) => setWager(w => w + d)}
          onClear={() => setWager(0)}
          onDeal={startDeal}
          dealLabel={isPending ? 'Dealing…' : undefined}
          dealDisabled={!canDeal || isPending}
          flyToRef={wagerPotRef}
        />
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
        {/* Dealer — wrapper element type intentionally matches
            renderSettleScreen's <motion.div> wrapper at the same
            sibling index, so when phase flips play→settled React
            reconciles the dealer block instead of unmount+remount
            (which was the cause of the hole-card flicker on
            stand/bust). The animate={{ x: 0 }} is a no-op, just here
            for type alignment. */}
        <motion.div animate={{ x: 0 }} transition={{ duration: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#a68a4a' }}>Dealer</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: '#f0e8d0', lineHeight: 1 }}>{dealerTotalDisplay}</p>
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: CARD_DIMS.h }}>
            <FeltRule text="Dealer hits soft 17" />
            {visibleDealerCards.map((c, i) => {
              if (i === 1) {
                // Hole card uses the SAME motion.div + FlipCard wrapper
                // as renderSettleScreen so React reconciles the inner
                // 3D context across the phase transition (instead of
                // unmounting the DealtCard tree and mounting a fresh
                // FlipCard tree, which flashes a 1-frame cardback gap).
                // During play card=null + flipped=false → renders
                // cardback; once we cross to settle the real card is
                // passed and holeFlipped controls the reveal flip.
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: -22, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.55)' }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: 0.36, ease: 'easeOut' }}
                    style={{ flexShrink: 0, cursor: 'pointer' }}
                  >
                    <FlipCard flipped={false} card={null} fishArt={null} duration={820} />
                  </motion.div>
                )
              }
              return <DealtCard key={i} card={c} fishArt={getFish(-1, i, c)} />
            })}
          </div>
        </motion.div>

        {/* Pot — fixed slot between dealer and player. Counts up from
            chips as bets land, drains to chips on settle outcome. Same
            ref as the wager screen's pot so a future return to wager
            phase would fly chips into the same on-screen position. */}
        <PotPill value={animatedPot} ref={wagerPotRef} />

        {/* Player hands — same visual structure as the dealer block
            above (label + total on right, cards below). No
            background card, no wager chip, no ACTIVE label — the pot
            indicator carries the wager, the colored total carries the
            bust/21/blackjack state, and on splits the label color +
            content carry whose turn it is. Keeps the play surface
            visually consistent top-to-bottom. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {state.hands.map((h, hi) => {
          // During the initial deal, only the first hand exists; we
          // render up to playerVisibleCount cards.
          const visibleHandCards = dealing && hi === 0 ? h.cards.slice(0, playerVisibleCount) : h.cards
          // Total uses ONLY cards that have completed their flip — so
          // the digits don't tick up while the face is still spinning.
          // handFlipCounts[hi] increments via each DealtCard's
          // onFlipComplete (~690ms after mount).
          const flippedForTotal = Math.min(visibleHandCards.length, handFlipCounts[hi] ?? 0)
          const cardsForTotal = visibleHandCards.slice(0, flippedForTotal)
          const computedTotal = cardsForTotal.length > 0 ? handValue(cardsForTotal).total : 0
          const fullyRevealed = flippedForTotal === visibleHandCards.length
          const isActive = !dealing && hi === state.activeHandIdx && !h.busted && !h.stood
          // Bust / natural state only resolves once the final card has
          // flipped and we know the full hand value.
          const isBust = fullyRevealed && computedTotal > 21
          const showNatural = fullyRevealed && h.isNatural && !dealing
          // Total color signals state without needing a bust/21 chip:
          // red for bust, gold for naturals once fully revealed,
          // cream otherwise.
          const totalColor = isBust ? '#f08a8a' : showNatural ? '#f0c040' : '#f0e8d0'
          // Label: "You" for single-hand, "Hand N" for splits. On splits
          // the active hand also lights up green AND gets an "Active"
          // pill so the player can't miss which hand the next Hit /
          // Stand applies to; non-active split hands dim to opacity 0.4
          // so the active one really stands out visually.
          const isSplit = state.hands.length > 1
          const label = isSplit ? `Hand ${hi + 1}` : 'You'
          const labelColor = isActive && isSplit ? '#7ad3a0' : '#a68a4a'
          const inactiveSplit = isSplit && !isActive
          return (
            <div key={hi} style={{ opacity: inactiveSplit ? 0.42 : 1, transition: 'opacity 0.3s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: labelColor }}>
                    {label}
                  </p>
                  {isActive && isSplit && (
                    <motion.span
                      key="active-pill"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                      className="font-karla font-700 uppercase tracking-[0.14em]"
                      style={{
                        fontSize: '0.55rem',
                        color: '#7ad3a0',
                        background: 'rgba(122,211,160,0.14)',
                        border: '1px solid rgba(122,211,160,0.55)',
                        padding: '0.18rem 0.5rem',
                        borderRadius: 999,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7ad3a0' }} />
                      Active
                    </motion.span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AnimatePresence>
                    {isBust && (
                      <motion.span
                        key="bust"
                        initial={{ opacity: 0, scale: 0.55, x: 14 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 15 }}
                        className="font-karla font-700 uppercase tracking-[0.14em]"
                        style={{
                          fontSize: '0.6rem',
                          color: '#f08a8a',
                          background: 'rgba(240,138,138,0.14)',
                          border: '1px solid rgba(240,138,138,0.5)',
                          padding: '0.2rem 0.55rem',
                          borderRadius: 6,
                        }}
                      >
                        Bust
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: totalColor, lineHeight: 1 }}>
                    {cardsForTotal.length === 0
                      ? '?'
                      : <><TickingTotal value={computedTotal} />{(fullyRevealed && !dealing && h.soft && h.total !== 21) ? <span style={{ fontSize: '0.7rem', marginLeft: 4 }}>(soft)</span> : ''}{showNatural ? <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>· BJ</span> : ''}</>}
                  </p>
                </div>
              </div>
              <div style={{ position: 'relative', display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: CARD_DIMS.h }}>
                {hi === 0 && <FeltRule text={['Blackjack pays 3 to 2', 'Insurance pays 2 to 1']} />}
                {visibleHandCards.map((c, ci) => (
                  <DealtCard
                    key={ci}
                    card={c}
                    fishArt={getFish(hi, ci, c)}
                    onFlipComplete={() => setHandFlipCounts(prev => ({ ...prev, [hi]: Math.max(prev[hi] ?? 0, ci + 1) }))}
                  />
                ))}
              </div>
            </div>
          )
        })}
        </div>

        {/* Action bar — gated on the deal animation finishing AND on
            at least one hand still being playable. Mid-hand settle
            holds (when the player just busted or stood-21) synth all
            hands as stood/busted, so the buttons hide cleanly while
            the new card flips in. Empty slot holds the vertical space
            so the modal doesn't jump when buttons mount/unmount. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 60 }}>
          {!dealing && state.hands.some(h => !h.busted && !h.stood) && (
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
    // Dealer total reflects only cards that have COMPLETED their flip
    // animation — '?' while the hole is still face-down, '?' while
    // the hole is mid-spin (820ms hole flip), then jumps to up+hole
    // once the flip settles. Extra draws each advance the count via
    // DealtCard's onFlipComplete (~690ms after each card mounts).
    // dealerTotalCardCount is the shared state; it starts at 0 on
    // settle mount and counts up as cards finish revealing.
    const dealerTotalVisible: number | null = dealerTotalCardCount === 0
      ? null
      : handValue(r.dealerCards.slice(0, dealerTotalCardCount)).total
    // Bust state flips ON the moment the last bust card's flip
    // completes (not at outcomeShown) so the BUST chip + red total
    // get a beat to register before the outcome panel resolves.
    const dealerBustVisible = dealerTotalVisible !== null && dealerTotalVisible > 21
    const dealerTotalColor = dealerBustVisible ? '#f08a8a'
      : outcomeShown && r.dealerNatural ? '#f0c040'
      : '#f0e8d0'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {/* Dealer — same shape as the play screen + player block so
            the surface doesn't shift when settle mounts. Label on
            left, colored total on right ('?' until hole flips, then
            the running sum). Row gets a bust shake on dealer bust
            instead of a red panel — matches the player row. */}
        <motion.div
          animate={dealerBustVisible ? { x: [0, -5, 5, -4, 4, -2, 2, 0] } : { x: 0 }}
          transition={dealerBustVisible ? { duration: 0.55, ease: 'easeInOut' } : { duration: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#a68a4a' }}>
              Dealer
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AnimatePresence>
                {dealerBustVisible && (
                  <motion.span
                    key="dealer-bust"
                    initial={{ opacity: 0, scale: 0.55, x: 14 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 15 }}
                    className="font-karla font-700 uppercase tracking-[0.14em]"
                    style={{
                      fontSize: '0.6rem',
                      color: '#f08a8a',
                      background: 'rgba(240,138,138,0.14)',
                      border: '1px solid rgba(240,138,138,0.5)',
                      padding: '0.2rem 0.55rem',
                      borderRadius: 6,
                    }}
                  >
                    Bust
                  </motion.span>
                )}
              </AnimatePresence>
              <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: dealerTotalColor, lineHeight: 1 }}>
                {dealerTotalVisible === null
                  ? '?'
                  : <TickingTotal value={dealerTotalVisible} />}
                {outcomeShown && r.dealerNatural ? <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>· BJ</span> : ''}
              </p>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: CARD_DIMS.h }}>
            <FeltRule text="Dealer hits soft 17" />
            {r.dealerCards.map((c, i) => {
              if (i >= revealedDealerCount) return null
              const fish = getFish(-1, i, c)
              if (i === 1) {
                // Hole card — wrapped in the same motion.div as
                // DealtCard so the cross-phase DOM stays identical
                // (play used DealtCard with card='X', settle uses
                // FlipCard with the real card; same outer wrap means
                // no 3D-layer teardown/rebuild on transition). The
                // 820ms duration here is the dramatic dealer reveal.
                return (
                  <motion.div
                    key={i}
                    whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.55)' }}
                    whileTap={{ scale: 0.96 }}
                    style={{ flexShrink: 0, cursor: 'pointer' }}
                  >
                    <FlipCard flipped={holeFlipped} card={c} fishArt={fish} duration={820} />
                  </motion.div>
                )
              }
              if (i === 0) {
                // Up card — already face-up from play. Use DealtCard
                // in 'revealed' mode so the wrapping motion.div +
                // FlipCard structure matches what the play screen
                // renders, eliminating the brief stutter from a
                // structural swap at phase transition.
                return <DealtCard key={i} card={c} fishArt={fish} mode="revealed" />
              }
              // Extra dealer draws (i >= 2). Use DealtCard so they slide
              // in face-down and flip to face-up, matching how every
              // other card in the game gets dealt. onFlipComplete bumps
              // dealerTotalCardCount so the dealer total tick waits for
              // the face to commit before counting this card.
              return (
                <DealtCard
                  key={i}
                  card={c}
                  fishArt={fish}
                  onFlipComplete={() => setDealerTotalCardCount(prev => Math.max(prev, i + 1))}
                />
              )
            })}
          </div>
        </motion.div>

        {/* Pot — holds the wager visible through the dealer reveal,
            drains to 0 when outcomeShown fires (mirrored by the chips
            animation in the header ticking up on win / staying flat
            on loss). After outcomeShown, the SAME pot becomes the
            wager-target for the next hand: chip taps from the Deal
            Next Hand panel below fly into THIS pill, and its value
            switches to reflect the new wager being built. No second
            pot appears anywhere on the settle screen. */}
        <PotPill value={outcomeShown ? wager : animatedPot} ref={wagerPotRef} />

        {/* Player hands — same visual structure as the dealer block
            (label + colored total + cards). No background card, no
            wager chip, no outcome chip. The total color carries the
            state (red bust, green win, gold blackjack/push), the
            celebration overlay and the chips header animation carry
            the amount won/lost. Keeps the surface visually consistent
            top-to-bottom with the dealer block. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {r.hands.map((h, hi) => {
            const isWin = h.outcome === 'win' || h.outcome === 'blackjack'
            const isLose = h.outcome === 'lose'
            const isBust = h.total > 21
            const isNatural21 = h.outcome === 'blackjack'
            // Total color:
            //  • Pre-reveal — bust=red, natural blackjack=gold, else cream
            //  • Post-reveal — win=green, lose=red, push/natural=gold
            const totalColor = outcomeShown
              ? (isWin ? '#7ad3a0' : isLose ? '#f08a8a' : '#f0c040')
              : (isBust ? '#f08a8a' : isNatural21 ? '#f0c040' : '#f0e8d0')
            // Label color matches: green on win, red on lose, muted gold
            // otherwise.
            const labelColor = outcomeShown
              ? (isWin ? '#7ad3a0' : isLose ? '#f08a8a' : '#a68a4a')
              : '#a68a4a'
            const label = r.hands.length === 1 ? 'You' : `Hand ${hi + 1}`
            return (
              <motion.div
                key={hi}
                // Bust shake fires as soon as the row mounts — player-side
                // fact, no reason to gate on outcomeShown.
                animate={isBust ? { x: [0, -5, 5, -4, 4, -2, 2, 0] } : { x: 0 }}
                transition={isBust ? { duration: 0.55, ease: 'easeInOut' } : { duration: 0 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: labelColor }}>
                    {label}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AnimatePresence>
                      {isBust && (
                        <motion.span
                          key="bust"
                          initial={{ opacity: 0, scale: 0.55, x: 14 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 340, damping: 15 }}
                          className="font-karla font-700 uppercase tracking-[0.14em]"
                          style={{
                            fontSize: '0.6rem',
                            color: '#f08a8a',
                            background: 'rgba(240,138,138,0.14)',
                            border: '1px solid rgba(240,138,138,0.5)',
                            padding: '0.2rem 0.55rem',
                            borderRadius: 6,
                          }}
                        >
                          Bust
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: totalColor, lineHeight: 1 }}>
                      {h.total}{isNatural21 ? <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>· BJ</span> : ''}
                    </p>
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {hi === 0 && <FeltRule text={['Blackjack pays 3 to 2', 'Insurance pays 2 to 1']} />}
                  {h.cards.map((card, ci) => (
                    // mode='revealed' so the structure matches what the
                    // play screen rendered for these same cards (DealtCard
                    // motion.div + FlipCard), eliminating the brief 3D
                    // layer teardown/rebuild stutter at phase transition.
                    <DealtCard key={ci} card={card} fishArt={getFish(hi, ci, card)} mode="revealed" />
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
                // No PotPill rendered here — the canonical one is
                // already on the settle screen above (between dealer
                // and player), with wagerPotRef attached. Chip taps
                // from this panel fly UP into it; once outcomeShown
                // is true, its value reflects `wager` so the new bet
                // visibly accumulates in the same pill. Just the chip
                // rack + Deal button live in this slot.
                <>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a', textAlign: 'center', marginBottom: 8 }}>
                    Deal Next Hand
                  </p>
                  <WagerCircle
                    wager={wager}
                    presets={BJ_BET_PRESETS}
                    chipsLeft={chips - wager}
                    maxBet={Math.min(BJ_MAX_BET, chips)}
                    minBet={BJ_MIN_BET}
                    onAdd={(d) => setWager(w => w + d)}
                    onClear={() => setWager(0)}
                    onDeal={startDeal}
                    dealLabel={isPending ? 'Dealing…' : undefined}
                    dealDisabled={!canDeal || isPending}
                    flyToRef={wagerPotRef}
                  />
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

  // Re-sync wager state if it no longer fits the player's chip stack
  // (lost a hand and dropped below the previously-set wager) or exceeds
  // the per-hand cap. Compares against CHIPS, not doubloons — the chip
  // table is the player's spendable pool. With accumulation semantics
  // we just clamp the wager down to whatever fits instead of reverting
  // to a preset; the player can keep tapping chips if they want more.
  useEffect(() => {
    const cap = Math.min(BJ_MAX_BET, chips)
    if (wager > cap) setWager(Math.max(0, cap))
  }, [chips, wager])

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
                // Scale punch + count-up combine: the pulse draws the
                // eye, the digits tick through the delta. Key bound to
                // handId so each settle re-fires; transformOrigin left
                // so the digits don't drift when they pulse.
                key={`chips-${result?.handId ?? 'idle'}`}
                animate={{ scale: phase === 'settled' && outcomeShown ? [1, 1.18, 1] : 1 }}
                transition={{ duration: 0.95, times: [0, 0.32, 1], ease: 'easeOut' }}
                className="font-cinzel font-700"
                style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1, transformOrigin: 'left center' }}
              >
                {animatedChips.toLocaleString()} ⟡
              </motion.p>
            </div>
            <div style={{ textAlign: 'center', minWidth: 88 }}>
              {sessionBuyIns > 0 ? (() => {
                // Sign + color track the ANIMATED value, not the target
                // — so a tally swinging from -100 → +200 visually
                // counts through zero with the red→grey→green color
                // shift mid-animation. Feels honest.
                const displayUp = animatedTally > 0
                const displayFlat = animatedTally === 0
                const color = displayFlat ? '#8a8478' : displayUp ? '#7fd49a' : '#e07070'
                const sign = displayUp ? '+' : ''
                return (
                  <>
                    <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a' }}>Session</p>
                    <motion.p
                      key={`tally-${result?.handId ?? 'idle'}`}
                      animate={{ scale: phase === 'settled' && outcomeShown ? [1, 1.16, 1] : 1 }}
                      transition={{ duration: 0.95, times: [0, 0.32, 1], ease: 'easeOut', delay: 0.05 }}
                      className="font-cinzel font-700"
                      style={{ fontSize: '1.05rem', color, lineHeight: 1 }}
                    >
                      {sign}{animatedTally.toLocaleString()} ⟡
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
      {/* Collapse play+settle into ONE JSX position. React reconciles
          based on what's at each position; the previous code put play
          and settle at SIBLING positions under separate conditionals,
          so the entire tree (including the dealer's hole card) was torn
          down and rebuilt on every phase transition — that was the
          source of the hole-card flicker the moment it became the
          dealer's turn. With a single ternary, the outer <div> from
          each render function reconciles, and inner children reconcile
          by index + type (provided the structures match, which the two
          renderers now do for the dealer block + hole card). */}
      {phase === 'play' && active
        ? renderGameScreen(active)
        : phase === 'settled' && result
          ? renderSettleScreen(result)
          : null}

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
                // Warm tavern palette — was a cool blue card that read as
                // if it belonged on a different table. Gold tones match
                // the doubloon glyph + the FeltRule "Insurance pays 2 to
                // 1" line + the rest of the Blackjack modal.
                background: 'linear-gradient(180deg, #241a0c 0%, #0f0a04 100%)',
                border: '1.5px solid rgba(200,170,100,0.5)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.75)',
                pointerEvents: 'auto',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#c8a060', marginBottom: 5 }}>
                Side Bet
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0d695', lineHeight: 1, marginBottom: 10 }}>
                Insurance?
              </p>
              <p className="font-karla" style={{ fontSize: '0.8rem', color: '#a89878', marginBottom: 14, lineHeight: 1.5 }}>
                The dealer&apos;s Ace could be hiding a Blackjack. For <span style={{ color: '#f0d695', fontWeight: 700 }}>{Math.floor(active.hands[0].wager / 2)} ⟡</span>, bet on it: <span style={{ color: '#86efac', fontWeight: 700 }}>win 2×</span> if they have it, <span style={{ color: '#f08a8a', fontWeight: 700 }}>lose it</span> if they don&apos;t.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  type="button"
                  disabled={isPending || doubloons < Math.floor(active.hands[0].wager / 2)}
                  onClick={() => fireAction(acceptInsurance)}
                  whileTap={!isPending ? { y: 3, scale: 0.94, borderColor: 'rgba(240,214,149,1)' } : undefined}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  className="font-cinzel font-700 uppercase tracking-[0.06em]"
                  style={{
                    flex: 1, padding: '0.85rem 0', borderRadius: 11,
                    background: 'linear-gradient(180deg, rgba(240,192,64,0.42) 0%, rgba(240,192,64,0.16) 100%)',
                    border: '1.5px solid rgba(240,192,64,0.8)',
                    color: '#fff4d6',
                    fontSize: '0.85rem',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    boxShadow: 'inset 0 1px 0 rgba(240,214,149,0.55), inset 0 -2px 0 rgba(0,0,0,0.28), 0 3px 8px rgba(0,0,0,0.45)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.5)',
                  }}
                >
                  Take · {Math.floor(active.hands[0].wager / 2)} ⟡
                </motion.button>
                <motion.button
                  type="button"
                  disabled={isPending}
                  onClick={() => fireAction(declineInsurance)}
                  whileTap={!isPending ? { y: 3, scale: 0.94, borderColor: 'rgba(255,255,255,0.5)' } : undefined}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
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
                </motion.button>
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
      whileTap={!disabled ? { y: 3, scale: 0.94, borderColor: 'rgba(240,214,149,1)' } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
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
