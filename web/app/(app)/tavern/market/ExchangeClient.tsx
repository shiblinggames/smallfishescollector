'use client'

// THE EXCHANGE. Contracts on funds and on single fish.
//
// You never own the fish. You stake doubloons on a direction over a term, and
// at expiry the contract settles itself and either pays or expires worthless.
// Nothing here touches the hold, the inventory or the selling lanes: the two
// halves of this screen share a mood and nothing else.
//
// The one number that has to be legible before anyone commits is the BREAK-EVEN
// move, because it is the whole deal in one figure: below it you lose, above it
// you win, and the further past it the market runs the more you take.

import { useState, useEffect, useTransition, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import LeaderboardModal from '@/components/LeaderboardModal'
import {
  TERMS, TERM_LABEL, TERM_BLURB, type Term, type Direction,
  quoteFund, quoteSingle, liveValue, MIN_STAKE, MAX_STAKE,
  EXCHANGE_FISHING_LEVEL, EXCHANGE_UNDER_CONSTRUCTION, singleSwingPct, fundSwingPct, swingLabel, targetPrice,
} from '@/lib/fishExchange'
import {
  getExchangeBoard, openContract, closeContractEarly, markResultsSeen,
  markExchangeIntroSeen, toggleExchangeWatch, setContractOrders,
} from './exchangeActions'
import ExchangeIntro from './ExchangeIntro'
import type { ExchangeBoard, BoardFund, BoardFish, BoardPosition, ExchangeLifetime } from './exchangeActions'

const UP = '#4ade80'
const DOWN = '#f87171'
const TNUM = { fontVariantNumeric: 'tabular-nums' as const }

/** Tell the rest of the app the purse changed.
 *
 *  The Nav bar keeps its own copy of your doubloons and only updates when it
 *  hears this. Every other spend path in the game fires it; the Exchange did
 *  not, so a stake left the balance in the database and the number at the top
 *  of the screen carried on showing the old total until a reload.
 *
 *  Nav ignores a non-numeric detail on purpose (a null would crash its
 *  toLocaleString), so always pass the new total. */
function purseChanged(total: number) {
  if (typeof total === 'number' && Number.isFinite(total)) {
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: total }))
  }
}

const pct = (now: number, then: number) => (then > 0 ? ((now - then) / then) * 100 : 0)
const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`

/** Move over the whole history window, not just the last tick.
 *
 *  The board sorts on the last hour, which is noise: the biggest one-hour mover
 *  is usually a fish that did nothing all day. This is the number a captain
 *  actually means by "what is moving". */
function dayMove(f: { price: number; history: number[] }): number {
  const first = f.history.length ? f.history[0] : f.price
  return first > 0 ? ((f.price - first) / first) * 100 : 0
}

/** One filter chip. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="font-karla font-700"
      style={{
        flexShrink: 0, padding: '0.24rem 0.55rem', borderRadius: 999, fontSize: '0.62rem',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textTransform: 'capitalize',
        background: on ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${on ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.09)'}`,
        color: on ? '#bfe6ff' : '#8a94a4', whiteSpace: 'nowrap',
      }}>
      {children}
    </button>
  )
}

/** The star. Not a heart, not a bookmark: a star is what every board uses and
 *  nobody has to learn. */
function WatchStar({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={on ? 'Stop watching' : 'Watch this'}
      aria-pressed={on}
      disabled={busy}
      onClick={e => { e.stopPropagation(); onToggle() }}
      style={{
        flexShrink: 0, width: 26, height: 26, padding: 0, borderRadius: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer',
        WebkitTapHighlightColor: 'transparent', opacity: busy ? 0.5 : 1,
      }}>
      <svg width="14" height="14" viewBox="0 0 24 24"
        fill={on ? '#ffd96a' : 'none'} stroke={on ? '#ffd96a' : '#5a6472'} strokeWidth="2" strokeLinejoin="round">
        <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45L2.6 9.45l6.5-.95z" />
      </svg>
    </button>
  )
}

/** 24 points of history as a line. No library: it is a polyline. */
function Spark({ points, color, w = 62, h = 20 }: { points: number[]; color: string; w?: number; h?: number }) {
  if (points.length < 2) return <div style={{ width: w, height: h }} />
  const lo = Math.min(...points), hi = Math.max(...points)
  const span = hi - lo || 1
  const d = points.map((v, i) =>
    `${(i / (points.length - 1)) * w},${h - ((v - lo) / span) * h}`).join(' ')
  return (
    <svg width={w} height={h} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

/** What the book was worth each of the last 24 hours.
 *
 *  Nothing stores this. Every position already carries its instrument's price
 *  history, and a contract's value is a pure function of (price, hours left),
 *  so the line can be rebuilt from what is already on screen: walk back hour by
 *  hour, price each contract as it stood then, and add them up.
 *
 *  A position only counts from the hour it was opened, so the line steps up
 *  when you back something rather than pretending the money was always at
 *  risk. */
function portfolioSeries(open: BoardPosition[], cycle: number): number[] {
  if (open.length === 0) return []
  const depth = Math.min(24, Math.max(...open.map(p => p.history.length)) + 1)
  const out: number[] = []
  for (let k = depth - 1; k >= 0; k--) {
    const cycleThen = cycle - k
    let total = 0
    for (const p of open) {
      if (cycleThen < p.openCycle) continue
      // history holds the prices BEFORE the current one, oldest first, so k
      // hours back is that many from the end. k === 0 is the live price.
      const priceThen = k === 0
        ? p.livePrice
        : p.history[p.history.length - k] ?? p.entryPrice
      const move = ((priceThen - p.entryPrice) / p.entryPrice) * 100
      const yourWay = p.direction === 'rise' ? move : -move
      total += liveValue(p.stake, p.leverage, yourWay, Math.max(0, p.expiryCycle - cycleThen), p.term)
    }
    out.push(total)
  }
  // Drop the hours before the first contract was opened. They are honestly
  // zero, but a line that starts at nothing and jumps is a chart of when you
  // pressed the button, not of how the book has done since.
  const first = out.findIndex(v => v > 0)
  return first <= 0 ? out : out.slice(first)
}

/** The Exchange's answer to the Hold's market ticker: what you are holding,
 *  what it is worth, and which way it has been going. */
/** The lifetime ledger.
 *
 *  The Exchange stakes straight from the main purse rather than from a
 *  brokerage balance you top up, because contracts settle on a cron hours after
 *  you close the app: a second purse would mean every settlement lands
 *  somewhere you have to remember to go and collect. The cost of one purse is
 *  that the balance can no longer tell you how you are DOING, since doubloons
 *  arrive from fishing, raids and gauntlets all day. This is that answer, kept
 *  without the wallet.
 *
 *  It will read negative for most captains over time, because every contract is
 *  priced at a house edge. That is the honest number and it is the one worth
 *  showing. */
function LifetimeLedger({ life }: { life: ExchangeLifetime }) {
  if (life.contracts === 0) return null
  const net = life.returned - life.staked
  const pct = life.staked > 0 ? (net / life.staked) * 100 : 0
  const good = net >= 0

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#6a7482' }}>All time</p>
        <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#6a7482', ...TNUM }}>
          {life.paid} of {life.contracts} paid
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <HeroBit label="Staked" value={`${life.staked.toLocaleString()} ⟡`} />
        <HeroBit label="Returned" value={`${life.returned.toLocaleString()} ⟡`} />
        <div style={{ minWidth: 0, textAlign: 'right' }}>
          <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.58rem', color: '#6a7482' }}>Net</p>
          <p className="font-karla font-800" style={{ fontSize: '0.8rem', color: good ? UP : DOWN, ...TNUM }}>
            {good ? '+' : ''}{net.toLocaleString()} ({fmtPct(pct)})
          </p>
        </div>
      </div>
    </div>
  )
}

function PortfolioHero({ open, cycle, life }: { open: BoardPosition[]; cycle: number; life: ExchangeLifetime }) {
  const staked = open.reduce((n, p) => n + p.stake, 0)
  const series = portfolioSeries(open, cycle)
  const value = series.length ? series[series.length - 1] : 0
  const pl = value - staked
  const plPct = staked > 0 ? (pl / staked) * 100 : 0
  const soonest = open.length ? Math.min(...open.map(p => Math.max(0, p.expiryCycle - cycle))) : 0
  // Biggest single instrument as a share of everything staked. Grouped by
  // label, because two contracts on the same fish in opposite directions are
  // still the same fish deciding your day.
  const byLabel = new Map<string, number>()
  for (const p of open) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + p.stake)
  const biggest = staked > 0 && byLabel.size
    ? [...byLabel.entries()].map(([label, n]) => ({ label, share: n / staked })).sort((a, b) => b.share - a.share)[0]
    : null

  // Nothing open is not the same as nothing to show: a captain between
  // contracts still has a record, and it is the reason to open another.
  if (open.length === 0) {
    return (
      <div style={{ padding: '0.9rem 1rem', borderRadius: 13, background: 'rgba(13,17,24,0.92)', border: '1px solid rgba(255,255,255,0.09)', marginBottom: '1rem' }}>
        <p className="font-karla font-700" style={{ fontSize: '0.84rem', color: '#c8d2e0' }}>Nothing open</p>
        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#7c8696', marginTop: 2, lineHeight: 1.45 }}>
          Back a fund or a fish one way or the other, and it settles itself whether you are here or not.
        </p>
        <LifetimeLedger life={life} />
      </div>
    )
  }

  return (
    <div style={{ padding: '0.9rem 1rem 0.8rem', borderRadius: 13, background: 'linear-gradient(180deg, rgba(14,19,29,0.96) 0%, rgba(9,12,18,0.97) 100%)', border: `1px solid ${pl >= 0 ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.26)'}`, marginBottom: '1rem' }}>
      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#7c8696' }}>Book value</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span className="font-cinzel font-800" style={{ fontSize: '1.95rem', lineHeight: 1.1, color: '#f0f4fa', ...TNUM }}>{value.toLocaleString()} ⟡</span>
        <span className="font-karla font-700" style={{ fontSize: '0.88rem', color: pl >= 0 ? UP : DOWN, ...TNUM }}>
          {pl >= 0 ? '+' : ''}{pl.toLocaleString()} ({fmtPct(plPct)})
        </span>
      </div>

      {series.length > 1 && (
        <div style={{ marginTop: 8 }}>
          {/* SAY THE WINDOW. This is the last 24 hours, or however long ago the
              oldest contract still open was bought, whichever is shorter. With
              no label it read as all-time to some and as one tick to others,
              and the two answers are worth very different amounts. */}
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#6a7482', marginBottom: 3 }}>
            Book value {'·'} last {series.length}h
          </p>
          <BigSpark points={series} entry={staked} color={pl >= 0 ? UP : DOWN} />
          <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#6a7482', marginTop: 3 }}>
            What your open contracts have been worth, hour by hour. The dashed line is the {staked.toLocaleString()} ⟡ you staked.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <HeroBit label="Staked" value={`${staked.toLocaleString()} ⟡`} />
        <HeroBit label="Contracts" value={`${open.length}`} />
        <HeroBit label="Next settles" value={soonest <= 0 ? 'moments' : `${soonest}h`} />
      </div>

      {/* WHERE THE RISK ACTUALLY IS. Staked, contracts and the next settlement
          all describe the book as if it were spread. Four contracts on the same
          fish is one bet with four receipts, and on a bad day that single line
          is the whole explanation. Only shown when it is worth saying. */}
      {biggest && biggest.share >= 0.5 && open.length > 1 && (
        <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: biggest.share >= 0.8 ? '#e6c07a' : '#7c8696', marginTop: 6, lineHeight: 1.45 }}>
          {Math.round(biggest.share * 100)}% of your stake is riding on {biggest.label}.
        </p>
      )}

      <LifetimeLedger life={life} />
    </div>
  )
}

function HeroBit({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.58rem', color: '#6a7482' }}>{label}</p>
      <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#dbe3ee', ...TNUM }}>{value}</p>
    </div>
  )
}

export default function ExchangeClient({ onDoubloons }: { onDoubloons?: (n: number) => void }) {
  const [board, setBoard] = useState<ExchangeBoard | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'funds' | 'fish' | 'positions'>('funds')
  const [ticket, setTicket] = useState<{ kind: 'fund'; f: BoardFund } | { kind: 'fish'; f: BoardFish } | null>(null)
  const [detail, setDetail] = useState<BoardPosition | null>(null)
  // null = closed. Opens by itself the first time the board is ever open to
  // them, and by request from the board's own "How it works" link after that.
  const [intro, setIntro] = useState<{ celebrate: boolean } | null>(null)
  const [watchBusy, setWatchBusy] = useState<string | null>(null)
  // Board filters. Client-side and unpersisted on purpose: they are how you
  // look right now, not a setting, and a remembered filter that hides most of
  // the board on your next visit is a bug report waiting to happen.
  const [query, setQuery] = useState('')
  const [habitat, setHabitat] = useState<string>('all')
  const [rarity, setRarity] = useState<number>(0)
  const [watchOnly, setWatchOnly] = useState(false)
  const [, startTransition] = useTransition()

  const load = useCallback(() => {
    getExchangeBoard().then(res => {
      if ('error' in res) setErr(res.error)
      else {
        setBoard(res)
        if (res.firstTime) setIntro({ celebrate: true })
        onDoubloons?.(res.doubloons)
        // Contracts settle while you are away, so the purse can have moved
        // since the page rendered.
        purseChanged(res.doubloons)
      }
    })
  }, [onDoubloons])

  useEffect(() => { load() }, [load])

  // Fire and forget, and clear the flag locally too: a reload before the write
  // lands would otherwise re-announce an Exchange the captain has already seen.
  const closeIntro = useCallback(() => {
    setIntro(null)
    setBoard(b => (b?.firstTime ? { ...b, firstTime: false } : b))
    startTransition(() => { void markExchangeIntroSeen() })
  }, [])

  // Looking at the Results list is what clears the markers. Fire and forget:
  // a failed clear just means the badge is still there next time.
  useEffect(() => {
    if (tab !== 'positions' || !board?.unseen) return
    startTransition(() => { void markResultsSeen() })
    setBoard(b => b ? { ...b, unseen: 0, positions: b.positions.map(p => ({ ...p, seen: true })) } : b)
  }, [tab, board?.unseen])

  if (err) return <p className="font-karla" style={{ fontSize: '0.78rem', color: DOWN, padding: '2rem 0' }}>{err}</p>
  if (!board) return <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.66rem', color: '#5a6472', padding: '2rem 0', textAlign: 'center' }}>Opening the board…</p>

  // SHUT, and saying why. The level gate below shows a climb, which is exactly
  // the wrong thing to show a captain who has already made Fishing 100 and is
  // being turned away for a reason that has nothing to do with them.
  if (EXCHANGE_UNDER_CONSTRUCTION) {
    return (
      <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.6rem', color: '#8a6f3a', marginBottom: 9 }}>
          Closed for works
        </p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#e6d49a', marginBottom: 10 }}>
          The Exchange is being rebuilt
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.8rem', color: '#9aa3b2', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
          The board is getting its own markets, free to run their own way instead
          of tracking the fish you sell. New indexes, new charts, and bets that
          run from steady to reckless.
        </p>
        <p className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#7c8696', lineHeight: 1.6, maxWidth: 340, margin: '0.9rem auto 0' }}>
          Every contract that was open has been paid back in full. Nothing of
          yours is tied up in here.
        </p>
        <p className="font-karla font-400 italic" style={{ fontSize: '0.72rem', color: '#6a7482', marginTop: 14 }}>
          Back shortly. The Hold is still trading.
        </p>
      </div>
    )
  }

  if (!board.open) {
    // Fishing 100 is the cap, so this is not a gate you clear on the way to
    // somewhere else. Show the climb rather than only naming the number: "you
    // are 84 of 100" is a distance, "Fishing 100 required" is a wall.
    const climb = Math.min(1, board.fishingLevel / EXCHANGE_FISHING_LEVEL)
    return (
      <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c8d2e0', marginBottom: 8 }}>The Exchange is closed to you</p>
        <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#8a94a4', lineHeight: 1.55, maxWidth: 320, margin: '0 auto' }}>
          It opens at Fishing {EXCHANGE_FISHING_LEVEL}, the last rung on the ladder. Take
          every fish the sea has to teach and the board will let you trade it.
        </p>
        <div style={{ maxWidth: 240, margin: '1.25rem auto 0' }}>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${climb * 100}%`, borderRadius: 3, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)' }} />
          </div>
          <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#7c8696', marginTop: 7, ...TNUM }}>
            Fishing {board.fishingLevel} of {EXCHANGE_FISHING_LEVEL}
          </p>
        </div>
      </div>
    )
  }

  const openPos = board.positions.filter(p => p.status === 'open')
  const donePos = board.positions.filter(p => p.status !== 'open')

  const watched = new Set(board.watchlist)
  const isWatched = (key: string) => watched.has(key)
  // Optimistic: the star flips at once and the server catches up. A failed
  // write leaves the list as the server has it on the next load, which is the
  // right way round for something this small.
  const toggleWatch = (key: string) => {
    setWatchBusy(key)
    setBoard(b => b ? {
      ...b,
      watchlist: b.watchlist.includes(key) ? b.watchlist.filter(k => k !== key) : [...b.watchlist, key],
    } : b)
    toggleExchangeWatch(key).then(res => {
      setWatchBusy(null)
      if ('watchlist' in res) setBoard(b => b ? { ...b, watchlist: res.watchlist } : b)
    })
  }

  // The fish board, filtered. 146 rows is past the point a flat list is a list.
  const q = query.trim().toLowerCase()
  const fishList = board.fish
    .filter(f => (!watchOnly || isWatched(`fish:${f.fishId}`)))
    .filter(f => (habitat === 'all' || f.habitat === habitat))
    .filter(f => (rarity === 0 || f.rarity === rarity))
    .filter(f => (!q || f.name.toLowerCase().includes(q)))
    .sort((a, b) => Math.abs(pct(b.price, b.prevPrice)) - Math.abs(pct(a.price, a.prevPrice)))
  const habitats = [...new Set(board.fish.map(f => f.habitat))].sort()

  return (
    <>
      {intro && <ExchangeIntro celebrate={intro.celebrate} onDone={closeIntro} />}

      {/* The Hold side opens with the market's mood; this side opens with
          yours. Same job: say where things stand before asking what to do. */}
      <PortfolioHero open={openPos} cycle={board.cycle} life={board.lifetime} />

      {/* MOVERS. With 146 instruments and a board sorted on the last hour,
          there was no way to notice that something had run 20% on the day. It
          reads the whole history window instead of the last tick, so it says
          what moved rather than what twitched. Tapping one opens its ticket,
          which is the only reason a strip like this earns its space. */}
      {(() => {
        const all = [
          ...board.funds.map(f => ({ key: `fund:${f.id}`, name: f.name, move: dayMove(f), open: () => setTicket({ kind: 'fund' as const, f }) })),
          ...board.fish.map(f => ({ key: `fish:${f.fishId}`, name: f.name, move: dayMove(f), open: () => setTicket({ kind: 'fish' as const, f }) })),
        ].filter(m => Math.abs(m.move) >= 1)
        if (all.length < 2) return null
        const up = [...all].sort((a, b) => b.move - a.move).slice(0, 3)
        const down = [...all].sort((a, b) => a.move - b.move).slice(0, 3).filter(m => m.move < 0)
        const strip = [...up, ...down]
        if (!strip.length) return null
        return (
          <div style={{ marginBottom: '0.85rem' }}>
            <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#6a7482', marginBottom: 5 }}>
              On the move {'·'} last 24h
            </p>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
              {strip.map(m => (
                <button key={m.key} type="button" onClick={m.open}
                  style={{
                    flexShrink: 0, textAlign: 'left', padding: '0.4rem 0.55rem', borderRadius: 9, cursor: 'pointer',
                    background: 'rgba(13,17,24,0.92)',
                    border: `1px solid ${m.move >= 0 ? 'rgba(74,222,128,0.32)' : 'rgba(248,113,113,0.3)'}`,
                    WebkitTapHighlightColor: 'transparent', maxWidth: 150,
                  }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#dbe3ee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</p>
                  <p className="font-karla font-800" style={{ fontSize: '0.7rem', color: m.move >= 0 ? UP : DOWN, ...TNUM }}>{fmtPct(m.move)}</p>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Sub-tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {([
          ['funds', `Funds`],
          ['fish', `Fish`],
          ['positions', `Positions${openPos.length ? ` (${openPos.length})` : ''}`],
        ] as const).map(([k, label]) => {
          const on = tab === k
          return (
            <button key={k} type="button" onClick={() => setTab(k)} className="font-karla font-700"
              style={{
                position: 'relative', flex: 1, padding: '0.42rem 0.3rem', borderRadius: 9, fontSize: '0.7rem',
                background: on ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${on ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.09)'}`,
                color: on ? '#e6f4ff' : '#8a94a4', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>
              {label}
              {k === 'positions' && board.unseen > 0 && (
                <span aria-label={`${board.unseen} new results`} style={{
                  position: 'absolute', top: -5, right: -4, minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 999, background: '#ffd96a', border: '1px solid rgba(0,0,0,0.5)',
                  color: '#231a06', fontSize: '0.58rem', lineHeight: '14px', fontWeight: 800,
                }}>{board.unseen}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* The two things that sit above the board itself: the rules, and who is
          beating you at them. Both are one line, sharing a row rather than
          taking one each. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: -4, marginBottom: 10 }}>
        <button type="button" onClick={() => setIntro({ celebrate: false })}
          className="font-karla font-600"
          style={{
            padding: 0, background: 'none', border: 'none', fontSize: '0.68rem', color: '#7c8696',
            textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}>
          How the Exchange works
        </button>
        {/* Lifetime net across settled contracts, the same shape the Den boards
            use. Styled down to a HUD pill so it sits with the line beside it
            instead of shouting over the portfolio hero above. */}
        <LeaderboardModal
          // Week first: it is the board most captains can actually get onto,
          // and the all-time one is a step behind it rather than the front door.
          boards={['exchangeWeek', 'exchangeNet']}
          title="Top Traders"
          label="Ranks"
          triggerStyle={{
            background: 'rgba(56,189,248,0.10)',
            border: '1px solid rgba(56,189,248,0.42)',
            color: '#7dd3fc',
            boxShadow: 'none',
            fontSize: '0.56rem',
            height: 24,
            padding: '0 0.62rem',
            borderRadius: 20,
          }}
        />
      </div>

      {tab === 'funds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#7c8696', marginBottom: 2, lineHeight: 1.45 }}>
            A fund is the average of every fish in it, so it moves a fraction as far as any one of them. Steadier, and easier to be roughly right about.
          </p>
          {board.funds.map(f => {
            const p = pct(f.price, f.prevPrice)
            const key = `fund:${f.id}`
            return (
              <div key={f.id} onClick={() => setTicket({ kind: 'fund', f })} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setTicket({ kind: 'fund', f }) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '0.6rem 0.55rem 0.6rem 0.7rem', borderRadius: 11, background: 'rgba(13,17,24,0.92)', border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <span aria-hidden style={{ width: 3, height: 30, borderRadius: 2, background: f.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                  {/* How far it travels in a day, beside how many fish it is.
                      Same sentence: what am I taking a position on. */}
                  <p className="font-karla font-500" style={{ fontSize: '0.62rem', color: '#7c8696' }}>
                    {f.members} fish {'·'} {swingLabel(fundSwingPct(f.id))}, ±{fundSwingPct(f.id).toFixed(1)}% a day
                  </p>
                </div>
                <Spark points={f.history.length > 1 ? f.history : [f.prevPrice, f.price]} color={p >= 0 ? UP : DOWN} />
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 62 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#f0f4fa', ...TNUM }}>{f.price.toFixed(3)}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: p >= 0 ? UP : DOWN, ...TNUM }}>{fmtPct(p)}</p>
                </div>
                <WatchStar on={isWatched(key)} busy={watchBusy === key} onToggle={() => toggleWatch(key)} />
              </div>
            )
          })}
        </div>
      )}

      {tab === 'fish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#7c8696', marginBottom: 2, lineHeight: 1.45 }}>
            One species, on its own. They swing far harder than any fund, and a legendary hardest of all.
          </p>

          {/* 146 FISH. A flat list sorted on the last hour meant the order was
              different every time you looked and there was no way to come back
              to one you had your eye on. Search, two filters and a star fix
              that; none of it is persisted except the stars, because how you
              are looking right now is not a setting. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search the board"
              aria-label="Search fish"
              className="font-karla font-600"
              style={{
                flex: 1, minWidth: 0, padding: '0.42rem 0.6rem', borderRadius: 9, fontSize: '0.72rem',
                background: 'rgba(8,11,17,0.9)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#e8eef6', outline: 'none',
              }} />
            <button type="button" onClick={() => setWatchOnly(v => !v)}
              aria-pressed={watchOnly}
              className="font-karla font-700"
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '0 0.6rem', borderRadius: 9,
                fontSize: '0.68rem', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                background: watchOnly ? 'rgba(255,217,106,0.16)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${watchOnly ? 'rgba(255,217,106,0.6)' : 'rgba(255,255,255,0.1)'}`,
                color: watchOnly ? '#ffd96a' : '#8a94a4',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill={watchOnly ? '#ffd96a' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
                <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45L2.6 9.45l6.5-.95z" />
              </svg>
              {board.watchlist.length || 'Watched'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 2, scrollbarWidth: 'none' }}>
            {([['all', 'All waters'], ...habitats.map(h => [h, h.replace(/_/g, ' ')] as [string, string])] as [string, string][]).map(([h, label]) => (
              <Chip key={h} on={habitat === h} onClick={() => setHabitat(h)}>{label}</Chip>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 4, scrollbarWidth: 'none' }}>
            {([[0, 'Any rarity'], [1, 'Calm'], [2, 'Steady'], [3, 'Choppy'], [4, 'Rough'], [5, 'Wild']] as [number, string][]).map(([r, label]) => (
              <Chip key={r} on={rarity === r} onClick={() => setRarity(r)}>
                {r === 0 ? label : `${swingLabel(singleSwingPct(r))} ±${singleSwingPct(r).toFixed(0)}%`}
              </Chip>
            ))}
          </div>

          {fishList.length === 0 && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.74rem', color: '#7c8696', padding: '1.6rem 0', textAlign: 'center' }}>
              {watchOnly && !board.watchlist.length
                ? 'Nothing starred yet. Tap a star to keep a fish where you can find it.'
                : 'No fish on the board match that.'}
            </p>
          )}

          {fishList.map(f => {
            const p = pct(f.price, f.prevPrice)
            const key = `fish:${f.fishId}`
            const swing = singleSwingPct(f.rarity)
            return (
              <div key={f.fishId} onClick={() => setTicket({ kind: 'fish', f })} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setTicket({ kind: 'fish', f }) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '0.45rem 0.4rem 0.45rem 0.6rem', borderRadius: 9, background: 'rgba(13,17,24,0.78)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                  <p className="font-karla font-500" style={{ fontSize: '0.58rem', color: '#6a7482', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {swingLabel(swing)} {'·'} ±{swing.toFixed(0)}% a day
                  </p>
                </div>
                <Spark points={f.history.length > 1 ? f.history : [f.prevPrice, f.price]} color={p >= 0 ? UP : DOWN} w={46} h={16} />
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 58 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0f4fa', ...TNUM }}>{f.price.toFixed(3)}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: p >= 0 ? UP : DOWN, ...TNUM }}>{fmtPct(p)}</p>
                </div>
                <WatchStar on={isWatched(key)} busy={watchBusy === key} onToggle={() => toggleWatch(key)} />
              </div>
            )
          })}
        </div>
      )}

      {tab === 'positions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {openPos.length === 0 && donePos.length === 0 && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.76rem', color: '#7c8696', padding: '2rem 0', textAlign: 'center', lineHeight: 1.5 }}>
              Nothing open. Pick a fund or a fish and back it one way or the other.
            </p>
          )}
          {openPos.map(p => <PositionRow key={p.id} p={p} cycle={board.cycle} onOpen={() => setDetail(p)} />)}
          {donePos.length > 0 && (
            <>
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: '#6a7482', marginTop: 8 }}>Results</p>
              {donePos.map(p => <PositionRow key={p.id} p={p} cycle={board.cycle} onOpen={() => setDetail(p)} />)}
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {detail && (
          <PositionSheet p={detail} cycle={board.cycle}
            onClose={() => setDetail(null)}
            onChanged={() => { setDetail(null); load() }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ticket && (
          <Ticket
            instrument={ticket}
            doubloons={board.doubloons}
            onClose={() => setTicket(null)}
            onDone={() => { setTicket(null); load(); setTab('positions') }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function PositionRow({ p, cycle, onOpen }: { p: BoardPosition; cycle: number; onOpen: () => void }) {
  const live = pct(p.livePrice, p.entryPrice)
  const yourWay = p.direction === 'rise' ? live : -live
  const settled = p.status !== 'open'
  const remaining = Math.max(0, p.expiryCycle - cycle)
  const value = settled ? (p.payout ?? 0) : liveValue(p.stake, p.leverage, yourWay, remaining, p.term)
  const pl = value - p.stake

  // The ROW is a summary you scan; the detail moved into a sheet. It used to be
  // three stat cells and a button, which is a lot of furniture per contract
  // when you are holding six of them.
  return (
    <button type="button" onClick={onOpen}
      style={{
        width: '100%', textAlign: 'left', padding: '0.6rem 0.7rem', borderRadius: 11, cursor: 'pointer',
        background: 'rgba(13,17,24,0.92)',
        border: `1px solid ${settled ? 'rgba(255,255,255,0.08)' : pl >= 0 ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.24)'}`,
        opacity: settled ? 0.86 : 1, WebkitTapHighlightColor: 'transparent',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{ width: 3, height: 32, borderRadius: 2, background: p.accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</p>
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7c8696' }}>
            <span style={{ color: p.direction === 'rise' ? UP : DOWN }}>{p.direction === 'rise' ? 'Rise' : 'Fall'}</span>
            {' · '}{TERM_LABEL[p.term]}
            {settled ? ` · ${p.status === 'closed_early' ? 'sold' : 'settled'}` : ` · ${remaining <= 0 ? 'settling' : `${remaining}h left`}`}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#f0f4fa', ...TNUM }}>{value.toLocaleString()} ⟡</p>
          <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: pl >= 0 ? UP : DOWN, ...TNUM }}>
            {pl >= 0 ? '+' : ''}{pl.toLocaleString()}
          </p>
        </div>
      </div>
    </button>
  )
}

/** The contract in full: what it is, what it cost, where it stands, what it
 *  still needs, and how long it has to get there. */
function PositionSheet({ p, cycle, onClose, onChanged }: {
  p: BoardPosition; cycle: number; onClose: () => void; onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  // Local copies so the pickers respond at once; the write is fire-and-forget
  // and the next board load is the source of truth.
  const [takeProfit, setTakeProfit] = useState<number | null>(p.takeProfitPct)
  const [stopLoss, setStopLoss] = useState<number | null>(p.stopLossPct)
  const [savedLevels, setSavedLevels] = useState(false)

  const live = pct(p.livePrice, p.entryPrice)
  const yourWay = p.direction === 'rise' ? live : -live
  const settled = p.status !== 'open'
  const remaining = Math.max(0, p.expiryCycle - cycle)
  const breakEven = 1 / p.leverage
  const value = settled ? (p.payout ?? 0) : liveValue(p.stake, p.leverage, yourWay, remaining, p.term)
  const pl = value - p.stake
  const plPct = p.stake > 0 ? (pl / p.stake) * 100 : 0
  const toBreakEven = breakEven - yourWay
  const ifItSettledNow = Math.max(0, Math.round(p.stake * p.leverage * Math.max(0, yourWay)))
  // Everything the player reads about MOVEMENT is a price move, signed the way
  // the price actually has to go. A Fall contract needs the price DOWN, so its
  // break-even is -1.69%, not +1.69%. The maths underneath still works in
  // "your way" terms, where both directions are positive; that is an
  // implementation detail and it was leaking onto the screen.
  const sign = p.direction === 'rise' ? 1 : -1
  // How far this contract's instrument typically travels OVER THIS CONTRACT'S
  // TERM, recovered from the leverage it was written at. The position row
  // carries no rarity, and it does not need one: sigma = (1 - edge) / (phi0 * L)
  // is the same identity the pricing uses.
  //
  // Deliberately the term's own spread rather than a daily figure rescaled by
  // root-time. The tables are not pure root-time (mean reversion flattens the
  // long end), so rescaling a 72h leverage to a day lands 24% light. It is also
  // the more useful number: a take-profit on a three day contract should be
  // sized against three days.
  const swing = 2.3064 / p.leverage

  function saveLevels(tp: number | null, sl: number | null) {
    setSavedLevels(false)
    setContractOrders(p.id, tp, sl).then(res => {
      if ('ok' in res) { setSavedLevels(true); onChanged() }
    })
  }

  // THE LINE IS YOUR HOLDING PERIOD, not the instrument's whole history.
  //
  // It used to plot p.history, which is the fish's or fund's last 24 hours and
  // has nothing to do with when you bought. Back something an hour ago and 23
  // of those 24 hours were before you were in it, with a dashed "your entry"
  // ruled across the lot: the chart looked like you had ridden a move you never
  // owned. It also ended at LAST hour's price while the number above it read
  // the live one, so the line and the headline disagreed.
  //
  // Now it starts ON your entry and ends on the price right now, so the whole
  // line is the part you are paid for and every point above the dash is money.
  const heldHours = Math.max(0, Math.min(cycle, p.expiryCycle) - p.openCycle)
  const exitPrice = settled ? (p.exitPrice ?? p.livePrice) : p.livePrice
  // history is oldest-first and holds the prices BEFORE the current one, so the
  // last `heldHours` of it are the hours you have been in. Its first entry is
  // the hour you opened, which is the entry price again, so it is dropped.
  //
  // The heldHours > 0 guard is not defensive noise: slice(-0) is slice(0), so a
  // contract opened this hour would quietly hand back the whole 24 again and
  // land straight back in the bug this is fixing.
  const pricePoints = [
    p.entryPrice,
    ...(heldHours > 0 ? p.history.slice(-heldHours).slice(1) : []),
    exitPrice,
  ]

  return (
    <PopupShell open onClose={onClose} zIndex={120}>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        // Bounded, not free-growing. PopupShell scrolls the whole wrapper, so
        // a tall sheet used to push its own buttons past the bottom of the
        // screen and behind the tab bar. maxHeight 100% resolves against the
        // shell's content box, which already excludes the header, the tab bar
        // and both safe-area insets, so the card can never exceed what is
        // actually visible. Everything inside then divides that fixed height:
        // title and actions pinned, the middle scrolls.
        style={{ margin: 'auto', width: '100%', maxWidth: 440, maxHeight: '100%', display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg, #0e131b 0%, #080b11 100%)', border: `1px solid ${p.accent}55` }}>

        <div style={{ flexShrink: 0, padding: '0.95rem 1rem 0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.24rem', color: '#f0f4fa', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</p>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ flexShrink: 0, fontSize: '0.6rem', padding: '0.16rem 0.48rem', borderRadius: 999, color: p.direction === 'rise' ? UP : DOWN, background: p.direction === 'rise' ? 'rgba(74,222,128,0.14)' : 'rgba(248,113,113,0.14)', border: `1px solid ${p.direction === 'rise' ? UP : DOWN}66` }}>
              {p.direction === 'rise' ? 'Rise' : 'Fall'}
            </span>
          </div>
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a94a4' }}>
            {TERM_LABEL[p.term]} {'·'} {p.term}h contract{p.habitat ? ` · ${p.habitat.replace(/_/g, ' ')}` : ''}
          </p>
        </div>

        {/* minHeight 0 is load-bearing: a flex child defaults to min-height
            auto, which refuses to shrink below its content, so flex:1 alone
            would grow the card instead of scrolling this. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.9rem 1rem 1rem' }}>
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.64rem', color: '#7c8696' }}>
            {settled ? 'Paid out' : 'Worth now'}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
            <span className="font-cinzel font-800" style={{ fontSize: '2.1rem', lineHeight: 1, color: '#f0f4fa', ...TNUM }}>{value.toLocaleString()} {'⟡'}</span>
            <span className="font-karla font-700" style={{ fontSize: '0.92rem', color: pl >= 0 ? UP : DOWN, ...TNUM }}>
              {pl >= 0 ? '+' : ''}{pl.toLocaleString()} ({fmtPct(plPct)})
            </span>
          </div>

          {pricePoints.length > 1 && (
            <div style={{ marginBottom: 12, padding: '0.55rem 0.6rem', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {/* Name the units. This sheet has two charts' worth of numbers on
                  it, one in price and one in doubloons, and an unlabelled line
                  could be either. */}
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#6a7482', marginBottom: 3 }}>
                Price {'·'} {heldHours < 1 ? 'since you opened' : `your last ${heldHours}h`}
              </p>
              <BigSpark points={pricePoints} entry={p.entryPrice} color={yourWay >= 0 ? UP : DOWN}
                target={targetPrice(p.entryPrice, p.direction, breakEven)}
                targetColor={p.direction === 'rise' ? UP : DOWN} />
              <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#7c8696', marginTop: 4 }}>
                Starts at your entry, {p.entryPrice.toFixed(3)}, which is the dashed line. {settled ? 'Ends where it settled.' : 'Ends at the price right now.'}
              </p>
            </div>
          )}

          {/* A GRID, not nine stacked rows. The sheet is 440px wide and the
              old list used a third of it for a label, a third for a number and
              a third for nothing, nine times over. Two columns halves the
              height and doubles the type. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginBottom: 10 }}>
            <Stat label="Staked" value={`${p.stake.toLocaleString()} ⟡`} />
            <Stat label={settled ? 'Settled' : 'Settles in'}
              value={settled
                ? p.closedBy === 'take_profit' ? 'take profit'
                  : p.closedBy === 'stop_loss' ? 'stop loss'
                  : p.status === 'closed_early' ? 'sold early'
                  : 'at expiry'
                : remaining <= 0 ? 'moments' : `${remaining}h`} />

            {/* Entry and now in ONE block. They are the same fact twice
                otherwise, and the arrow says more than two labels would. */}
            <Stat label="Price" value={`${p.entryPrice.toFixed(3)} → ${(settled ? (p.exitPrice ?? p.livePrice) : p.livePrice).toFixed(3)}`} />
            <Stat label="Price moved" value={fmtPct(live)} color={yourWay >= 0 ? UP : DOWN} />

            <Stat label="Break-even" value={fmtPct(sign * breakEven)} />
            {settled
              ? <Stat label="Result" value={(p.payout ?? 0) === 0 ? 'worthless' : (p.payout ?? 0) > p.stake ? 'won' : 'lost'}
                  color={(p.payout ?? 0) > p.stake ? UP : DOWN} />
              : <Stat label={toBreakEven > 0 ? 'Still needs' : 'Clear by'}
                  value={fmtPct(sign * Math.abs(toBreakEven))}
                  color={toBreakEven > 0 ? '#c8d2e0' : UP} />}
          </div>

          {/* ARM IT, or change what is already armed. Only while it is open:
              a level on a settled contract is a number nothing will ever read. */}
          {!settled && (
            <div style={{ marginBottom: 11, padding: '0.6rem 0.65rem 0.5rem', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#8a94a4' }}>Close it early at</p>
                {savedLevels && <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: UP }}>Armed</p>}
              </div>
              <LevelPicker
                label="Take profit"
                hint={takeProfit == null ? 'runs to expiry' : `at ${targetPrice(p.entryPrice, p.direction, takeProfit).toFixed(3)}`}
                value={takeProfit}
                presets={levelPresets(swing, [0.5, 1, 1.5])}
                tone={UP}
                onPick={v => { setTakeProfit(v); saveLevels(v, stopLoss) }} />
              <LevelPicker
                label="Stop loss"
                hint={stopLoss == null ? 'rides it out' : `at ${targetPrice(p.entryPrice, p.direction === 'rise' ? 'fall' : 'rise', stopLoss).toFixed(3)}`}
                value={stopLoss}
                presets={levelPresets(swing, [0.5, 1])}
                tone={DOWN}
                onPick={v => { setStopLoss(v); saveLevels(takeProfit, v) }} />
              <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a7482', lineHeight: 1.45, marginTop: 2 }}>
                Checked every hour when the price moves, and paid what the contract is worth right then. The same figure closing it yourself would pay.
              </p>
            </div>
          )}

          {/* NOT a comparison. Showing "if it settled this second" beside a
              larger "sell now" read as a contradiction, and worse, the smaller
              number described something you cannot actually do: you have no
              button that settles a contract early at intrinsic.

              They are a sum. The move has earned one part, the hours still to
              run are the rest, and together they are what selling pays. */}
          {!settled && (
            <div style={{ padding: '0.6rem 0.75rem', borderRadius: 11, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a94a4' }}>The move has earned</span>
                <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#dbe3ee', ...TNUM }}>{ifItSettledNow.toLocaleString()} ⟡</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 3 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a94a4' }}>
                  {remaining}h still to run
                </span>
                <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#dbe3ee', ...TNUM }}>
                  {value - ifItSettledNow >= 0 ? '+' : ''}{(value - ifItSettledNow).toLocaleString()} ⟡
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 5, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#c8d2e0' }}>Worth now</span>
                <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: value > p.stake ? UP : '#c8d2e0', ...TNUM }}>{value.toLocaleString()} ⟡</span>
              </div>
            </div>
          )}

        </div>

        {/* Pinned. The body is a chart, six stats and a value breakdown, which
            on a short phone ran long enough to push Sell and Close off the
            bottom of the screen and behind the tab bar. Actions do not belong
            in a scroll area: you should never have to go looking for the way
            out of a sheet. */}
        <div style={{
          flexShrink: 0, padding: '0.7rem 1rem 0.75rem',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          background: 'rgba(6,9,14,0.97)',
        }}>
          {!settled ? (
            <>
              <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#7c8696', marginBottom: 6, lineHeight: 1.4, textAlign: 'center' }}>
                {armed
                  ? 'Or leave it, and it settles itself on whatever the market does.'
                  : 'Selling hands over exactly that. Leave it and it settles itself.'}
              </p>
              <button type="button" disabled={busy}
                onClick={() => {
                  if (!armed) { setArmed(true); return }
                  setBusy(true)
                  closeContractEarly(p.id).then(res => {
                    setBusy(false); setArmed(false)
                    if ('ok' in res) purseChanged(res.doubloons)
                    onChanged()
                  })
                }}
                className="font-karla font-700"
                style={{
                  width: '100%', padding: '0.72rem', borderRadius: 11, fontSize: '0.86rem',
                  background: armed ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${armed ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.18)'}`,
                  color: armed ? '#f0d89a' : '#d4dce8', cursor: busy ? 'wait' : 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {busy ? 'Selling…' : armed ? `Sell for ${value.toLocaleString()} ⟡. Tap again` : `Sell now for ${value.toLocaleString()} ⟡`}
              </button>
            </>
          ) : (
            <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#8a94a4', marginBottom: 4, lineHeight: 1.45, textAlign: 'center' }}>
              {p.status === 'closed_early' ? 'You sold this one early.'
                : (p.payout ?? 0) === 0 ? 'It expired worthless.' : 'It settled at expiry.'}
            </p>
          )}

          {/* Arming the sell swaps this for the way OUT of the armed state,
              which is the more urgent of the two while a confirm is pending.
              The backdrop still closes the sheet either way. */}
          <button type="button" onClick={() => (armed ? setArmed(false) : onClose())} className="font-karla font-600"
            style={{ width: '100%', marginTop: 6, padding: '0.45rem', background: 'none', border: 'none', color: '#8a94a4', fontSize: '0.78rem', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            {armed ? 'Keep it open' : 'Close'}
          </button>
        </div>
      </motion.div>
    </PopupShell>
  )
}

/** A line with a reference ruled across it: your entry price on a position
 *  sheet, or what you staked on the portfolio hero. Either way the dashed line
 *  is break-even, so being above it is the whole story at a glance. */
function BigSpark({ points, entry, color, target, targetColor }: {
  points: number[]; entry: number; color: string
  /** THE PRICE IT HAS TO REACH, ruled solid across the same axis.
   *  Break-even was only ever given as a percentage while the chart beside it
   *  was drawn in price, so the player had to convert before committing. Drawn
   *  in the scale too, so the gap between the two lines IS the bet. */
  target?: number
  targetColor?: string
}) {
  const W = 100, H = 58
  const all = [...points, entry, ...(target != null ? [target] : [])]
  const lo = Math.min(...all), hi = Math.max(...all)
  const span = hi - lo || 1
  const y = (v: number) => H - ((v - lo) / span) * H
  const d = points.map((v, i) => `${(i / (points.length - 1)) * W},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden style={{ display: 'block' }}>
      <line x1="0" y1={y(entry)} x2={W} y2={y(entry)} stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      {target != null && (
        <line x1="0" y1={y(target)} x2={W} y2={y(target)} stroke={targetColor ?? UP} strokeWidth="1.2" strokeDasharray="1 2" opacity="0.85" vectorEffect="non-scaling-stroke" />
      )}
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '0.45rem 0.55rem', borderRadius: 9, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', minWidth: 0 }}>
      <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#7c8696', marginBottom: 2 }}>{label}</p>
      <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: color ?? '#eef3f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...TNUM }}>{value}</p>
    </div>
  )
}


function Ticket({ instrument, doubloons, onClose, onDone }: {
  instrument: { kind: 'fund'; f: BoardFund } | { kind: 'fish'; f: BoardFish }
  doubloons: number
  onClose: () => void
  onDone: () => void
}) {
  const [dir, setDir] = useState<Direction>('rise')
  const [term, setTerm] = useState<Term>(24)
  const [stake, setStake] = useState(5000)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [takeProfit, setTakeProfit] = useState<number | null>(null)
  const [stopLoss, setStopLoss] = useState<number | null>(null)

  const isFund = instrument.kind === 'fund'
  const name = isFund ? instrument.f.name : instrument.f.name
  const accent = isFund ? instrument.f.accent : '#7dd3fc'
  const price = instrument.f.price
  // TWO different spreads, doing two different jobs.
  //
  // The header quotes a DAY, because that describes the instrument and has to
  // read the same whichever term is selected. The armed-level presets use the
  // SELECTED TERM, because a take-profit on a three day contract should be
  // sized against three days, not against one.
  const daySwing  = isFund ? fundSwingPct(instrument.f.id) : singleSwingPct(instrument.f.rarity)
  const termSwing = isFund ? fundSwingPct(instrument.f.id, term) : singleSwingPct(instrument.f.rarity, term)
  // Quoted for the direction you picked: Rise and Fall are different prices on
  // the same instrument, because a fall of a given size is the rarer event.
  const q = isFund
    ? quoteFund(instrument.f.id, term, dir, price)
    : quoteSingle(instrument.f.rarity, term, dir, price)

  const capped = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.min(stake, doubloons)))
  const example = (movePct: number) => Math.round(capped * q.leverage * movePct)
  // Signed the way the PRICE has to move. Backing a Fall and being told you
  // break even at +1.69% is the wrong instruction twice over.
  const sign = dir === 'rise' ? 1 : -1

  function submit() {
    setErr(''); setBusy(true)
    openContract(
      isFund ? { kind: 'fund', fundId: instrument.f.id } : { kind: 'fish', fishId: instrument.f.fishId },
      dir, term, capped, takeProfit, stopLoss,
    ).then(res => {
      setBusy(false)
      if ('error' in res) setErr(res.error)
      else { purseChanged(res.doubloons); onDone() }
    })
  }

  return (
    <PopupShell open onClose={onClose} zIndex={120}>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        // Same bounded column as the position sheet. This one matters more:
        // the ticket is where doubloons actually leave, and its body is four
        // pickers deep, so on a short phone the Stake button was the part that
        // fell off the bottom.
        style={{ margin: 'auto', width: '100%', maxWidth: 440, maxHeight: '100%', display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg, #0e131b 0%, #080b11 100%)', border: `1px solid ${accent}55` }}>

        <div style={{ flexShrink: 0, padding: '0.95rem 1rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0f4fa' }}>{name}</p>
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#7c8696', ...TNUM }}>
            {price.toFixed(3)} now {'·'} {swingLabel(daySwing)}, ±{daySwing.toFixed(1)}% a day{isFund ? ` · ${instrument.f.members} fish` : ''}
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.85rem 1rem 1rem' }}>
          {/* WHERE IT HAS BEEN, before you pick a side.
              The ticket asked you to call a direction while showing a single
              number, "1.124 now", which tells you nothing about whether that is
              high or low for this fish. The board row behind it has a 62px
              sparkline with no scale and no axis, so the only real chart in the
              Exchange was one you could not see until after you had already
              spent the doubloons.
              Same component as the position sheet, so a contract you are
              considering and one you hold read the same way. */}
          {(() => {
            const hist = instrument.f.history ?? []
            // history holds the prices BEFORE the current one, so the live price
            // completes the line.
            const pts = hist.length ? [...hist, price] : []
            if (pts.length < 2) return null
            const lo = Math.min(...pts), hi = Math.max(...pts)
            const windowMove = pts[0] > 0 ? ((price - pts[0]) / pts[0]) * 100 : 0
            const up = windowMove >= 0
            return (
              <div style={{ marginBottom: 13, padding: '0.55rem 0.6rem', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#6a7482' }}>
                    Price {'·'} last {pts.length - 1}h
                  </p>
                  <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: up ? UP : DOWN, ...TNUM }}>{fmtPct(windowMove)}</p>
                </div>
                <BigSpark points={pts} entry={price} color={up ? UP : DOWN}
                  target={targetPrice(price, dir, q.breakEvenPct)} targetColor={dir === 'rise' ? UP : DOWN} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7c8696', ...TNUM }}>
                    low {lo.toFixed(3)} {'·'} high {hi.toFixed(3)}
                  </span>
                  <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7c8696' }}>you come in here</span>
                </div>
                {/* THE TARGET, as a price. Break-even was only ever a
                    percentage, on a screen whose chart is drawn in price, which
                    left the player doing the conversion in their head before
                    spending anything. */}
                <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: dir === 'rise' ? UP : DOWN, marginTop: 3, ...TNUM }}>
                  {dir === 'rise' ? 'Above' : 'Below'} {targetPrice(price, dir, q.breakEvenPct).toFixed(3)} and you are in profit
                </p>
                {/* THE DRIFT, said out loud. The board pulls every price back
                    toward 1.000, so an instrument down here is expected to climb
                    on its own and one up there to fall. That is priced into the
                    target above, and saying so is the difference between a hard
                    bet and an ambush. */}
                {Math.abs(q.driftPct) >= 0.5 && (
                  <p className="font-karla font-500" style={{ fontSize: '0.62rem', color: '#7c8696', marginTop: 2, lineHeight: 1.4, ...TNUM }}>
                    The board pulls toward 1.000, so this is expected to move {fmtPct(q.driftPct)} your way on its own over {term}h. Your target already counts it.
                  </p>
                )}
              </div>
            )
          })()}

          {/* A DIRECTION CAN BE SHUT. The board pulls every price toward 1.000,
              and far enough from par that pull beats what the contract could
              pay: you would have to reverse the tide and then clear the bar.
              Shut rather than merely expensive, because a contract returning a
              fifth of its stake is not a hard bet, it is a donation somebody
              takes by accident. */}
          <Label>Which way</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {(['rise', 'fall'] as const).map(d => {
              const shut = (isFund
                ? quoteFund(instrument.f.id, term, d, price)
                : quoteSingle(instrument.f.rarity, term, d, price)).blocked
              return (
                <button key={d} type="button" onClick={() => { if (!shut) setDir(d) }} disabled={shut}
                  aria-label={shut ? `${d === 'rise' ? 'Rise' : 'Fall'}, not offered` : undefined}
                  className="font-karla font-700"
                  style={{ padding: '0.5rem', borderRadius: 10, fontSize: '0.78rem',
                    cursor: shut ? 'not-allowed' : 'pointer', opacity: shut ? 0.42 : 1,
                    background: shut ? 'rgba(255,255,255,0.03)' : dir === d ? (d === 'rise' ? 'rgba(74,222,128,0.16)' : 'rgba(248,113,113,0.16)') : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${shut ? 'rgba(255,255,255,0.08)' : dir === d ? (d === 'rise' ? UP : DOWN) : 'rgba(255,255,255,0.10)'}`,
                    color: shut ? '#5a6472' : dir === d ? (d === 'rise' ? UP : DOWN) : '#8a94a4' }}>
                  {d === 'rise' ? 'Rise' : 'Fall'}{shut ? ' · shut' : ''}
                </button>
              )
            })}
          </div>
          {q.blocked && (
            <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#e6c07a', marginTop: -6, marginBottom: 11, lineHeight: 1.45 }}>
              Not offered at this price. The board is pulling toward 1.000 harder than this contract could pay, so it would take a reversal just to reach break-even.
            </p>
          )}

          <Label>How long</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
            {TERMS.map(t => (
              <button key={t} type="button" onClick={() => setTerm(t)} className="font-karla font-700"
                style={{ padding: '0.45rem 0.2rem', borderRadius: 10, fontSize: '0.72rem', cursor: 'pointer',
                  background: term === t ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${term === t ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.10)'}`,
                  color: term === t ? '#e6f4ff' : '#8a94a4' }}>
                {TERM_LABEL[t]}
                <span style={{ display: 'block', fontSize: '0.56rem', fontWeight: 600, color: term === t ? '#7fb8d8' : '#6a7482' }}>{t}h</span>
              </button>
            ))}
          </div>

          <Label>Stake</Label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {[1000, 5000, 25000, 100000].map(v => (
              <button key={v} type="button" onClick={() => setStake(v)} className="font-karla font-700"
                style={{ flex: 1, padding: '0.4rem 0.2rem', borderRadius: 9, fontSize: '0.66rem', cursor: 'pointer',
                  background: capped === Math.min(v, doubloons) ? 'rgba(240,192,64,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${capped === Math.min(v, doubloons) ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.10)'}`,
                  color: v > doubloons ? '#5a6472' : '#e0d8c4', ...TNUM }}>
                {v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>

          {/* CLOSE IT WITHOUT ME. A 72 hour contract cannot be watched, and the
              board says nobody tried: every contract closed so far was closed
              by hand before expiry. Arming a level once is that decision made
              in advance, paid at the same value a manual close pays. */}
          <Label>Close it early at</Label>
          <LevelPicker
            label="Take profit"
            hint={takeProfit == null ? 'runs to expiry' : `at ${targetPrice(price, dir, takeProfit).toFixed(3)}`}
            value={takeProfit}
            presets={levelPresets(termSwing, [0.5, 1, 1.5])}
            tone={UP}
            onPick={setTakeProfit} />
          <LevelPicker
            label="Stop loss"
            hint={stopLoss == null ? 'rides it out' : `at ${targetPrice(price, dir === 'rise' ? 'fall' : 'rise', stopLoss).toFixed(3)}`}
            value={stopLoss}
            presets={levelPresets(termSwing, [0.5, 1])}
            tone={DOWN}
            onPick={setStopLoss} />

          {/* THE DEAL, in one line. Everything above is a choice; this is what
              those choices bought. */}
          <div style={{ marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 11, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#8a94a4' }}>Break-even move</span>
              <span className="font-karla font-800" style={{ fontSize: '0.9rem', color: '#e6f4ff', ...TNUM }}>{fmtPct(sign * q.breakEvenPct)}</span>
            </div>
            {[1, 3, 6].map(m => (
              <div key={m} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="font-karla font-500" style={{ fontSize: '0.64rem', color: '#6a7482', ...TNUM }}>at {fmtPct(sign * m)}</span>
                <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: example(m) > capped ? UP : '#8a94a4', ...TNUM }}>
                  {example(m).toLocaleString()} ⟡
                </span>
              </div>
            ))}
            <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#6a7482', marginTop: 6, lineHeight: 1.4 }}>
              {TERM_BLURB[term]}, whether you are here or not. If it does not move your way, the contract expires worthless.
            </p>
          </div>

        </div>

        {/* Pinned, and the error with it: a validation message that scrolls
            out of sight explains nothing. */}
        <div style={{
          flexShrink: 0, padding: '0.7rem 1rem 0.75rem',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          background: 'rgba(6,9,14,0.97)',
        }}>
          {err && <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: DOWN, marginBottom: 7, textAlign: 'center' }}>{err}</p>}

          <button type="button" onClick={submit} disabled={busy || capped > doubloons || q.blocked}
            className="font-karla font-800"
            style={{ width: '100%', padding: '0.7rem', borderRadius: 11, fontSize: '0.82rem', cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(56,189,248,0.16)', border: '1px solid rgba(56,189,248,0.6)', color: '#e6f4ff',
              opacity: capped > doubloons || q.blocked ? 0.5 : 1, WebkitTapHighlightColor: 'transparent' }}>
            {busy ? 'Opening…' : q.blocked ? 'Not offered' : `Stake ${capped.toLocaleString()} ⟡ on ${dir === 'rise' ? 'Rise' : 'Fall'}`}
          </button>
          <button type="button" onClick={onClose} className="font-karla font-600"
            style={{ width: '100%', marginTop: 6, padding: '0.45rem', background: 'none', border: 'none', color: '#6a7482', fontSize: '0.72rem', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            Never mind
          </button>
        </div>
      </motion.div>
    </PopupShell>
  )
}

/** ARMED LEVELS, as a price move your way.
 *
 *  Expressed as a move and not as a price, so one control reads the same for a
 *  Rise and a Fall: 20 always means "twenty percent my way". The presets scale
 *  off how far that instrument actually travels, because +10% is an ambitious
 *  week on the Sea Index and half a quiet afternoon on a legendary fish, and a
 *  fixed ladder would be wrong for one of them whichever numbers it used. */
function levelPresets(swingPct: number, mults: number[]): number[] {
  return [...new Set(mults.map(m => Math.max(1, Math.round(swingPct * m))))]
}

function LevelPicker({ label, hint, value, presets, tone, onPick }: {
  label: string
  hint: string
  value: number | null
  presets: number[]
  tone: string
  onPick: (v: number | null) => void
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.58rem', color: '#7c8696' }}>{label}</span>
        <span className="font-karla font-500" style={{ fontSize: '0.58rem', color: '#6a7482', ...TNUM }}>{hint}</span>
      </div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button type="button" onClick={() => onPick(null)} className="font-karla font-700"
          style={{
            flex: 1, padding: '0.34rem 0.2rem', borderRadius: 8, fontSize: '0.64rem', cursor: 'pointer',
            background: value == null ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${value == null ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.09)'}`,
            color: value == null ? '#dbe3ee' : '#6a7482', WebkitTapHighlightColor: 'transparent',
          }}>Off</button>
        {presets.map(v => (
          <button key={v} type="button" onClick={() => onPick(v)} className="font-karla font-700"
            style={{
              flex: 1, padding: '0.34rem 0.2rem', borderRadius: 8, fontSize: '0.64rem', cursor: 'pointer',
              background: value === v ? `${tone}22` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${value === v ? tone : 'rgba(255,255,255,0.09)'}`,
              color: value === v ? tone : '#8a94a4', WebkitTapHighlightColor: 'transparent', ...TNUM,
            }}>{v}%</button>
        ))}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#6a7482', marginBottom: 5 }}>{children}</p>
  )
}
