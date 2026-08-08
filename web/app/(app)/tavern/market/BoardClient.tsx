'use client'

// THE EXCHANGE BOARD. Built beside the old ExchangeClient rather than on top of
// it, so swapping the page over is one import and the old engine deletes in one
// pass afterwards.
//
// Written for captains, not traders. Every number on screen answers a question
// somebody would actually ask out loud, and none of them needs a glossary:
//
//   "Reef Dwellers. 0.86, down 2% today. Moves about 4% on a normal day."
//   "Up at least 6%, within a day. About 1 in 5. Pays 5.1x."
//
// The three picks are laid out in the order you would think them: which way,
// how far, how long. Stake last, because it is the only one you cannot get
// wrong.

import { useState, useEffect, useCallback, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { vibrate } from '@/lib/haptics'
import {
  TERMS, TERM_NAME, type Term, type Direction,
  chainFor, driftOver, unitPresets, contractValue, breakEvenFor, profitChance, scheduledIn, fmtPrice, MAX_NOTIONAL,
  MIN_STAKE, MAX_STAKE,
} from '@/lib/exchangeBoard'
import { getBoard, openBet, sellBet, markBetsSeen } from './boardActions'
import type { Board, BoardIndex, BoardBet } from './boardActions'

const UP = '#4ade80'
const DOWN = '#f87171'
const TNUM = { fontVariantNumeric: 'tabular-nums' as const }

const pct = (now: number, then: number) => (then > 0 ? ((now - then) / then) * 100 : 0)
const fmtPct = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`

function purseChanged(total: number) {
  if (Number.isFinite(total)) {
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: total }))
  }
}

/** A price line. No axes, no grid: it is here to show a shape, and a shape is
 *  all anybody reads off something this size. */
function Line({ points, color, w = 64, h = 22, mark, fluid }: {
  points: number[]; color: string; w?: number; h?: number
  /** A price to rule across the chart, dashed. Folded into the scale so it is
   *  always on screen: a target you cannot see is worse than no target. */
  mark?: number
  /** Stretch to the container instead of sitting at a fixed pixel width. The
   *  stroke is told not to scale with it, or a wide box thins the line. */
  fluid?: boolean
}) {
  if (points.length < 2) return <div style={{ width: fluid ? '100%' : w, height: h, flexShrink: 0 }} />
  const marked = mark != null && Number.isFinite(mark)
  const all = marked ? [...points, mark] : points
  const lo = Math.min(...all), hi = Math.max(...all)
  const span = hi - lo || 1
  const y = (v: number) => h - ((v - lo) / span) * h
  const d = points.map((v, i) => `${(i / (points.length - 1)) * w},${y(v)}`).join(' ')
  return (
    <svg
      {...(fluid
        ? { width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' as const }
        : { width: w, height: h })}
      aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      {marked && (
        <line x1="0" x2={w} y1={y(mark)} y2={y(mark)} stroke="#ffd96a" strokeWidth="1"
          strokeDasharray="3 3" opacity="0.8" vectorEffect="non-scaling-stroke" />
      )}
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function BoardClient({ onDoubloons }: { onDoubloons?: (n: number) => void }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [ticket, setTicket] = useState<BoardIndex | null>(null)
  const [tab, setTab] = useState<'board' | 'bets'>('board')
  const [openSlip, setOpenSlip] = useState<BoardBet | null>(null)
  const [, startTransition] = useTransition()

  const load = useCallback(() => {
    getBoard().then(b => {
      setBoard(b)
      if (b.open) { onDoubloons?.(b.doubloons); purseChanged(b.doubloons) }
    })
  }, [onDoubloons])
  useEffect(() => { load() }, [load])

  // Looking at your results is what clears the markers.
  useEffect(() => {
    if (tab !== 'bets' || !board?.unseen) return
    startTransition(() => { void markBetsSeen() })
    setBoard(b => b ? { ...b, unseen: 0, bets: b.bets.map(x => ({ ...x, seen: true })) } : b)
  }, [tab, board?.unseen])

  if (!board) {
    return (
      <p className="font-karla font-600 uppercase tracking-[0.16em]"
        style={{ fontSize: '0.66rem', color: '#5a6472', padding: '2rem 0', textAlign: 'center' }}>
        Opening the board…
      </p>
    )
  }

  if (!board.open) {
    return (
      <p className="font-karla font-400" style={{ fontSize: '0.82rem', color: '#8a94a4', padding: '2.5rem 1.5rem', textAlign: 'center', lineHeight: 1.6 }}>
        {board.closedReason}
      </p>
    )
  }

  const open = board.bets.filter(b => b.status === 'open')
  const zones = board.indexes.filter(i => i.family === 'zone')
  const species = board.indexes.filter(i => i.family === 'species')

  return (
    <>
      {open.length > 0 && <RunningStrip bets={open} indexes={board.indexes} allBets={board.bets} />}

      <div style={{ display: 'flex', gap: 6, marginBottom: '0.9rem' }}>
        {([['board', 'The board'], ['bets', `Your bets${open.length ? ` (${open.length})` : ''}`]] as const).map(([k, label]) => {
          const on = tab === k
          return (
            <button key={k} type="button" onClick={() => setTab(k)} className="font-karla font-700"
              style={{
                position: 'relative', flex: 1, padding: '0.45rem 0.3rem', borderRadius: 9, fontSize: '0.74rem',
                background: on ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${on ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.09)'}`,
                color: on ? '#e6f4ff' : '#8a94a4', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>
              {label}
              {k === 'bets' && board.unseen > 0 && (
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

      {tab === 'board' ? (
        <>
          {/* WHOLE and SINGLE, because that pairing is the whole difference and
              "Waters" beside "Creatures" only named the flavour. One is every
              creature in a stretch of sea averaged together, which is an index
              fund without using the words; the other is one kind on its own,
              which is a stock. The adjectives carry it and the lines underneath
              say what that means for the price. */}
          <Group
            title="Whole Waters"
            note="Every creature in a stretch of sea, averaged together. They drift slowly and mostly move as one."
            list={zones} onPick={setTicket} />
          <Group
            title="Single Species"
            note="One kind of creature on its own. Far jumpier, and some of them ignore the weather entirely."
            list={species} onPick={setTicket} />
        </>
      ) : (
        <BetList bets={board.bets} onOpen={setOpenSlip} />
      )}

      <AnimatePresence>
        {openSlip && (
          <BetSheet
            bet={openSlip}
            index={board.indexes.find(i => i.id === openSlip.indexId) ?? null}
            onClose={() => setOpenSlip(null)}
            onSold={() => { setOpenSlip(null); load() }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ticket && (
          <Ticket
            index={ticket}
            moodBias={board.moodBias}
            doubloons={board.doubloons}
            onClose={() => setTicket(null)}
            onDone={() => { setTicket(null); setTab('bets'); load() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/** WHAT THE BOOK HAS BEEN WORTH, hour by hour.
 *
 *  Nothing stores this. Every bet already knows its index, and an index carries
 *  its last 48 hours, so the line can be rebuilt from what is already on screen:
 *  walk back hour by hour, reprice each bet as it stood then, and add them up.
 *
 *  A bet only counts from the hour it was placed, so the line steps up when you
 *  back something rather than pretending the money was always at risk. It is
 *  livelier than the old board's was, because a bet that pays everything or
 *  nothing swings hard as its deadline closes.
 *
 *  APPROXIMATE IN ONE PLACE, and worth knowing: the drift an index was riding an
 *  hour ago is not recorded, so the repricing leaves it out. The line is
 *  therefore a touch flatter than the truth on a strongly trending index. The
 *  live figure above it is exact; this is the shape of how it got there. */
function bookSeries(bets: BoardBet[], indexes: BoardIndex[]): number[] {
  if (!bets.length) return []
  const byId = new Map(indexes.map(i => [i.id, i]))
  const out: number[] = []
  for (let k = 23; k >= 0; k--) {
    let total = 0
    for (const b of bets) {
      // Placed yet? term minus what is left is how long it has been running.
      if (k > b.term - b.hoursLeft) continue
      const idx = byId.get(b.indexId)
      if (!idx) continue
      const h = idx.history
      const priceThen = k === 0 ? idx.price : (h[h.length - k] ?? b.entryPrice)
      const raw = b.entryPrice > 0 ? ((priceThen - b.entryPrice) / b.entryPrice) * 100 : 0
      total += Math.round(b.units * contractValue(
        priceThen, b.strike, b.direction, b.hoursLeft + k, idx.dailyMovePct))
    }
    out.push(total)
  }
  const first = out.findIndex(v => v > 0)
  return first <= 0 ? out : out.slice(first)
}

/** What you have riding right now, above everything else, because it is the
 *  first thing you came to look at. */
type BookRange = 'day' | 'week' | 'all'

/** PROFIT BANKED OVER TIME, for the views the index history cannot reach.
 *
 *  An index keeps 48 hours, so the hour-by-hour worth of a book can be rebuilt
 *  for a day and no further. A week and all time therefore plot a DIFFERENT
 *  quantity: the running total of what closed contracts actually paid, which
 *  comes from the bets themselves and needs no price history at all.
 *
 *  Two quantities under one toggle is a thing to state, not to hide, so the
 *  caption changes with the range. The alternative is a line that silently
 *  switches meaning halfway along the toggle. */
function bankedSeries(all: BoardBet[], sinceMs: number | null, openWorth: number, openStake: number): number[] {
  const done = all
    .filter(b => b.status !== 'open' && b.settledAt)
    .filter(b => sinceMs == null || new Date(b.settledAt!).getTime() >= sinceMs)
    .sort((a, b) => new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime())
  const out = [0]
  let run = 0
  for (const b of done) { run += (b.payout ?? 0) - b.stake; out.push(run) }
  // Where it stands right now, open positions included, so the line ends on the
  // same figure printed above it.
  out.push(run + (openWorth - openStake))
  return out
}

function RunningStrip({ bets, indexes, allBets }: { bets: BoardBet[]; indexes: BoardIndex[]; allBets: BoardBet[] }) {
  const [range, setRange] = useState<BookRange>('day')
  const staked = bets.reduce((n, b) => n + b.stake, 0)
  const winning = bets.filter(b => b.movedPct >= b.distancePct).length
  const worth = bets.reduce((n, b) => n + (b.worth ?? 0), 0)
  const daySeries = bookSeries(bets, indexes)
  const weekAgo = Date.now() - 7 * 24 * 3_600_000
  const series = range === 'day'
    ? daySeries
    : bankedSeries(allBets, range === 'week' ? weekAgo : null, worth, staked)
  const rising = range === 'day'
    ? worth >= staked
    : series[series.length - 1] >= series[0]
  return (
    <div style={{
      padding: '0.7rem 0.85rem', borderRadius: 12, marginBottom: '0.9rem',
      background: 'linear-gradient(180deg, rgba(14,19,29,0.96) 0%, rgba(9,12,18,0.97) 100%)',
      border: '1px solid rgba(255,255,255,0.09)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#7c8696' }}>
          Riding on it
        </span>
        <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: winning ? UP : '#7c8696', ...TNUM }}>
          {winning} of {bets.length} ahead
        </span>
      </div>
      {/* WORTH leads, not staked. What the book could fetch this second is the
          number you came to look at; what you put in is the thing it is measured
          against. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginTop: 2 }}>
        <span className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.15, color: '#f0f4fa', ...TNUM }}>
          {worth.toLocaleString()} ⟡
        </span>
        <span className="font-karla font-700" style={{ fontSize: '0.8rem', color: worth >= staked ? UP : DOWN, ...TNUM }}>
          {worth >= staked ? '+' : ''}{(worth - staked).toLocaleString()}
        </span>
      </div>

      {/* Day first, because the day is the question a captain actually has. */}
      <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
        {([['day', 'Day'], ['week', '7 days'], ['all', 'All time']] as [BookRange, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setRange(k)} className="font-karla font-700"
            style={{
              padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.6rem', cursor: 'pointer',
              background: range === k ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${range === k ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.09)'}`,
              color: range === k ? '#bfe6ff' : '#7c8696', WebkitTapHighlightColor: 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {series.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <Line fluid points={series} color={rising ? UP : DOWN} w={380} h={38} />
        </div>
      )}
      <p className="font-karla font-500" style={{ fontSize: '0.6rem', color: '#6a7482', marginTop: 3 }}>
        {range === 'day'
          ? 'What your open contracts have been worth, hour by hour'
          : `Profit banked from closed contracts${range === 'week' ? ' this week' : ''}, ending where you stand now`}
      </p>

      <p className="font-karla font-500" style={{ fontSize: '0.7rem', color: '#8a94a4', marginTop: 4, ...TNUM }}>
        {staked.toLocaleString()} ⟡ in
      </p>
    </div>
  )
}

function Group({ title, note, list, onPick }: {
  title: string; note: string; list: BoardIndex[]; onPick: (i: BoardIndex) => void
}) {
  if (!list.length) return null
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#e8eef6' }}>{title}</p>
      <p className="font-karla font-400 italic" style={{ fontSize: '0.76rem', color: '#7c8696', lineHeight: 1.45, marginBottom: 8 }}>{note}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {list.map(i => <Row key={i.id} i={i} onPick={onPick} />)}
      </div>
    </div>
  )
}

/** WHEN THE NEXT REPORT LANDS, to the hour.
 *
 *  Days alone were no use for planning. Contracts run one, three or seven days,
 *  so "in 2d" leaves you guessing whether a three-day contract bought now
 *  carries the report or stops the morning before it. It also went quiet
 *  entirely past four days, which hid most of the three-to-nine-day cycle
 *  exactly when a week-long contract needed to know. */
function reportIn(at: string | null): string | null {
  if (!at) return null
  const h = (new Date(at).getTime() - Date.now()) / 3_600_000
  if (!Number.isFinite(h)) return null
  if (h <= 1) return 'due now'
  if (h < 24) return `in ${Math.round(h)}h`
  const d = Math.floor(h / 24)
  const rem = Math.round(h - d * 24)
  return rem > 0 ? `in ${d}d ${rem}h` : `in ${d}d`
}

/** The gap it took, and WHEN, which is the whole difference between a caption
 *  and a contradiction.
 *
 *  The row prints the move from the last tick. A gap from six hours ago sitting
 *  beside it, unlabelled, reads as the card disagreeing with itself: "the beds
 *  came up empty, -14.3%" next to +0.1%. Both were true and neither was of the
 *  same moment. So a gap that happened on THIS tick is the explanation of the
 *  number beside it and says nothing more; an older one carries its age. */
function freshEvent(i: BoardIndex): string | null {
  if (!i.lastEvent || !i.lastEventAt || i.lastEventPct == null) return null
  const at = new Date(i.lastEventAt).getTime()
  const h = (Date.now() - at) / 3_600_000
  if (!(h >= 0) || h > 24) return null
  const move = `${i.lastEvent}, ${i.lastEventPct > 0 ? '+' : ''}${i.lastEventPct}%`
  // Same tick as the price it is standing next to?
  const tick = i.updatedAt ? new Date(i.updatedAt).getTime() : null
  if (tick != null && Math.abs(at - tick) < 60_000) return move
  return `${move} · ${h < 1 ? 'just now' : `${Math.round(h)}h ago`}`
}

function Row({ i, onPick }: { i: BoardIndex; onPick: (i: BoardIndex) => void }) {
  const day = pct(i.price, i.prevPrice)
  const news = freshEvent(i)
  const due = reportIn(i.nextEventAt)
  return (
    <button type="button" onClick={() => { vibrate([0, 12]); onPick(i) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '0.72rem 0.8rem', borderRadius: 11, cursor: 'pointer',
        background: 'rgba(13,17,24,0.9)', border: '1px solid rgba(255,255,255,0.08)',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <span aria-hidden style={{ width: 3, height: 34, borderRadius: 2, background: i.accent, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.95rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {i.name}
        </span>
        {/* WHY IT MOVED, or what is coming. A 30% cliff with no caption reads as
            a bug; the same cliff captioned "the beds came up empty" reads as
            news, which is the whole difference between a market and a jitter. */}
        <span className="font-karla font-500" style={{ display: 'block', fontSize: '0.72rem', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: news ? ((i.lastEventPct ?? 0) > 0 ? UP : DOWN) : '#6a7482' }}>
          {news ?? (due ? `${i.nextEventLabel ?? 'Report'} ${due}` : '')}
        </span>
      </span>
      <Line points={i.history.length > 1 ? i.history : [i.prevPrice, i.price]} color={day >= 0 ? UP : DOWN} w={76} h={30} />
      <span style={{ textAlign: 'right', flexShrink: 0, minWidth: 66 }}>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.95rem', color: '#f0f4fa', ...TNUM }}>
          {fmtPrice(i.price)}
        </span>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.74rem', color: day >= 0 ? UP : DOWN, ...TNUM }}>
          {fmtPct(day)}
        </span>
      </span>
    </button>
  )
}

function BetList({ bets, onOpen }: { bets: BoardBet[]; onOpen: (b: BoardBet) => void }) {
  if (!bets.length) {
    return (
      <p className="font-karla font-400 italic" style={{ fontSize: '0.78rem', color: '#7c8696', padding: '2rem 0', textAlign: 'center', lineHeight: 1.5 }}>
        Nothing riding yet. Pick something off the board and say which way it goes.
      </p>
    )
  }
  // SPLIT, because they answer different questions. A running contract is a
  // decision you can still make; a finished one is a record. Mixed into one
  // list, the live ones get lost among results as soon as you have any.
  const running = bets.filter(b => b.status === 'open')
  const finished = bets.filter(b => b.status !== 'open')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {running.length > 0 && (
        <div>
          <BetHeading>Running</BetHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {running.map(b => <BetRow key={b.id} b={b} onOpen={onOpen} />)}
          </div>
        </div>
      )}
      {finished.length > 0 && (
        <div>
          <BetHeading>Finished</BetHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {finished.map(b => <BetRow key={b.id} b={b} onOpen={onOpen} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function BetHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.1em]"
      style={{ fontSize: '0.68rem', color: '#7c8696', marginBottom: 7 }}>
      {children}
    </p>
  )
}

/** TWO LINES, no sentence. The card used to spell the whole contract out in
 *  prose and then restate half of it underneath, which is three lines of
 *  reading for what is really a name, a direction and where it stands. Anyone
 *  who wants the terms can open it. */
function BetRow({ b, onOpen }: { b: BoardBet; onOpen: (b: BoardBet) => void }) {
  const ahead = b.movedPct >= b.distancePct
  const done = b.status !== 'open'
  const won = b.status === 'won'
  const target = b.entryPrice * (1 + (b.direction === 'up' ? 1 : -1) * b.distancePct / 100)
  const pnl = b.worth == null ? null : b.worth - b.stake
  return (
    <button type="button" onClick={() => onOpen(b)} style={{
      width: '100%', textAlign: 'left', cursor: 'pointer',
      padding: '0.72rem 0.8rem', borderRadius: 11,
      background: 'rgba(13,17,24,0.9)',
      border: `1px solid ${done ? (won ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.1)'}`,
      opacity: done && !won ? 0.72 : 1, WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#e8eef6', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {/* NEUTRAL ON PURPOSE. The caret says which way you BET, and colouring
              it green for up put a green mark on losing contracts and a red one
              on winning shorts. Green and red on this row mean one thing only,
              and it is the figure to the right. */}
          {b.indexName} <span style={{ color: '#6a7482' }}>{b.direction === 'up' ? '▲' : '▼'}</span>
        </span>
        <span className="font-karla font-800" style={{ fontSize: '0.9rem', flexShrink: 0, ...TNUM,
          color: done ? (won ? UP : '#7d7466') : pnl == null ? '#8a94a4' : pnl >= 0 ? UP : DOWN }}>
          {b.status === 'won' ? `+${((b.payout ?? 0) - b.stake).toLocaleString()} ⟡`
            : b.status === 'sold' ? `${(b.payout ?? 0) - b.stake >= 0 ? '+' : ''}${((b.payout ?? 0) - b.stake).toLocaleString()} ⟡`
            : b.status === 'lost' ? `-${b.stake.toLocaleString()} ⟡`
            : pnl == null ? (ahead ? 'ahead' : 'behind')
            : `${pnl >= 0 ? '+' : ''}${pnl.toLocaleString()} ⟡`}
        </span>
      </div>
      <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#7c8696', marginTop: 3, ...TNUM }}>
        {done
          ? `${b.stake.toLocaleString()} ⟡ in · ${TERM_NAME[b.term].toLowerCase()}`
          : `${fmtPrice(b.livePrice)} → ${fmtPrice(target)} · ${b.hoursLeft >= 1 ? `${Math.round(b.hoursLeft)}h left` : 'under an hour'}`}
      </p>
    </button>
  )
}

function Ticket({ index, moodBias, doubloons, onClose, onDone }: {
  index: BoardIndex; moodBias: number; doubloons: number; onClose: () => void; onDone: () => void
}) {
  const [dir, setDir] = useState<Direction>('up')
  const [term, setTerm] = useState<Term>(24)
  const [distance, setDistance] = useState<number | null>(null)
  // UNITS, not doubloons. Cost is units times the price, which is what makes a
  // 1,420 index cost more to hold than a 0.09 one, exactly as a real ticket does.
  const [units, setUnits] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Priced with the drift the engine is already applying, exactly as the server
  // will price it. Quote it any other way and the ticket promises odds the
  // settlement will not honour.
  const drift = driftOver(index.vol, index.beta, index.trend, index.trendTicks, moodBias, term, dir)
  // Priced with the report too, exactly as the server will price it.
  const sched = scheduledIn(index.nextEventAt, term, Date.now())
  // THE CHAIN. Every strike this index offers at this term, each with what one
  // contract of it costs. No multiplier and no chance: the premium IS the
  // quote, and it falls as the strike gets further out, which is the shape a
  // real chain has and the binary's fixed payout could never show.
  const bets = chainFor(index.price, dir, term, index.dailyMovePct, drift, sched)
  // Keep a valid distance selected as the term changes: the rungs on offer
  // shrink hard on the short terms, and a stale pick would silently price a bet
  // nobody chose.
  const chosen = bets.find(b => b.distancePct === distance) ?? bets[0]
  useEffect(() => {
    if (!bets.some(b => b.distancePct === distance)) setDistance(bets[0]?.distancePct ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  // The longer the odds, the less you may put on: a bet is capped by what it
  // pays out, not by its price.
  const presets = unitPresets(index.price)
  // Bounded by the SIZE of the position now, not by what it might pay.
  const capNow = MAX_STAKE
  // The same four everywhere means the sensible DEFAULT is not the same
  // everywhere: ten units is a fair ticket on most of the board and more than a
  // captain owns on the dearest index. Open on the biggest one they can afford.
  // Every contract costs the premium, which depends on the rung you picked, so
  // affordability moves as you drag the slider. That is the point: the long
  // shots are the cheap ones.
  const prem = chosen ? chosen.each : 0
  const fits = (n: number) => {
    const c = Math.round(n * prem)
    return c >= MIN_STAKE && c <= doubloons && c <= capNow
  }
  const chosenUnits = units ?? [...presets].reverse().find(fits) ?? presets[0]
  const betCap = capNow
  // THE PRICE IT HAS TO REACH. A percentage is a thing you have to do arithmetic
  // on before it means anything; a price is the same number you are already
  // watching on the chart.
  const targetPrice = chosen
    ? index.price * (1 + (dir === 'up' ? 1 : -1) * chosen.distancePct / 100)
    : index.price
  const capped = Math.round(chosenUnits * prem)
  const overSize = chosenUnits * index.price > MAX_NOTIONAL
  const affordable = capped <= doubloons && capped >= MIN_STAKE && capped <= betCap
  // Where the contract has paid for itself: one premium past the strike.
  const breakEven = chosen ? breakEvenFor(chosen.strike, prem, dir) : 0

  function submit() {
    if (!chosen) return
    setErr(''); setBusy(true)
    openBet(index.id, dir, term, chosen.distancePct, chosenUnits).then(res => {
      setBusy(false)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 14, 30, 22])
      purseChanged(res.doubloons)
      onDone()
    })
  }

  return (
    <PopupShell open onClose={onClose} zIndex={120}>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          margin: 'auto', width: '100%', maxWidth: 440, maxHeight: '100%',
          display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden',
          background: 'linear-gradient(180deg, #0e131b 0%, #080b11 100%)',
          border: `1px solid ${index.accent}55`,
        }}>

        <div style={{ flexShrink: 0, padding: '0.95rem 1rem 0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {/* THE PRICE, set as large as the target below it, because the whole
              question this screen asks is how far apart those two numbers are.
              It used to be a 0.7rem footnote under the name while the target it
              is measured against was more than twice its size. */}
          <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#c8d2e0' }}>{index.name}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 1 }}>
            <span className="font-cinzel font-800" style={{ fontSize: '1.75rem', lineHeight: 1.1, color: '#f0f4fa', ...TNUM }}>
              {fmtPrice(index.price)}
            </span>
            <span className="font-karla font-700" style={{ fontSize: '0.74rem', ...TNUM,
              color: pct(index.price, index.prevPrice) >= 0 ? UP : DOWN }}>
              {fmtPct(pct(index.price, index.prevPrice))} this hour
            </span>
          </div>
          <p className="font-karla font-400" style={{ fontSize: '0.68rem', color: '#8a94a4', lineHeight: 1.45, marginTop: 3 }}>
            {index.blurb}
          </p>
          {(() => {
            const news = freshEvent(index)
            const due = reportIn(index.nextEventAt)
            if (!news && !due) return null
            return (
              <p className="font-karla font-600" style={{ fontSize: '0.66rem', marginTop: 3,
                color: news ? ((index.lastEventPct ?? 0) > 0 ? UP : DOWN) : '#bfe6ff' }}>
                {news ?? `${index.nextEventLabel ?? 'Report'} ${due}`}
              </p>
            )
          })()}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.85rem 1rem 1rem' }}>
          {/* WHERE IT HAS BEEN, before anything is asked of you. The dashed rule
              is the target, so dragging the slider moves a line across the same
              chart you just read, and how far you are asking it to travel stops
              being a percentage and becomes a distance you can see. */}
          {index.history.length > 1 && (() => {
            // THE SCALE, because a line with no numbers on it is a picture, not a
            // chart. The same span the chart is drawn from, so the labels cannot
            // disagree with the shape, and the target is named ON its own rule
            // rather than in a caption underneath saying a dashed line exists.
            const vals = chosen ? [...index.history, targetPrice] : index.history
            const lo = Math.min(...vals), hi = Math.max(...vals)
            const span = hi - lo || 1
            const yPct = (v: number) => (1 - (v - lo) / span) * 100
            const H = 64
            return (
              <div style={{ marginBottom: 13, padding: '0.5rem 0.55rem 0.4rem', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ position: 'relative', height: H }}>
                  <Line fluid points={index.history} w={380} h={H}
                    color={pct(index.price, index.history[0]) >= 0 ? UP : DOWN}
                    mark={chosen ? targetPrice : undefined} />
                  <span className="font-karla font-600" style={{ position: 'absolute', top: -2, right: 0, fontSize: '0.56rem', color: '#6a7482', ...TNUM }}>
                    {fmtPrice(hi)}
                  </span>
                  <span className="font-karla font-600" style={{ position: 'absolute', bottom: -2, right: 0, fontSize: '0.56rem', color: '#6a7482', ...TNUM }}>
                    {fmtPrice(lo)}
                  </span>
                  {chosen && (
                    <span className="font-karla font-700" style={{
                      position: 'absolute', left: 0, top: `${yPct(targetPrice)}%`,
                      transform: 'translateY(-50%)', fontSize: '0.58rem', color: '#ffd96a',
                      background: 'rgba(10,14,20,0.82)', padding: '0 3px', borderRadius: 3, ...TNUM,
                    }}>
                      {fmtPrice(targetPrice)}
                    </span>
                  )}
                </div>
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#6a7482', marginTop: 4, ...TNUM }}>
                  Last 48 hours
                </p>
              </div>
            )
          })()}

          <Step label="Which way" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 13 }}>
            {(['up', 'down'] as const).map(d => (
              <button key={d} type="button" onClick={() => setDir(d)} className="font-karla font-700"
                style={{
                  padding: '0.66rem', borderRadius: 10, fontSize: '0.95rem', cursor: 'pointer',
                  background: dir === d ? (d === 'up' ? 'rgba(74,222,128,0.16)' : 'rgba(248,113,113,0.16)') : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${dir === d ? (d === 'up' ? UP : DOWN) : 'rgba(255,255,255,0.10)'}`,
                  color: dir === d ? (d === 'up' ? UP : DOWN) : '#8a94a4',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {d === 'up' ? 'Up' : 'Down'}
              </button>
            ))}
          </div>

          <Step label="How long" />
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 13, scrollbarWidth: 'none' }}>
            {TERMS.map(t => (
              <button key={t} type="button" onClick={() => setTerm(t)} className="font-karla font-700"
                style={{
                  flexShrink: 0, padding: '0.44rem 0.85rem', borderRadius: 999, fontSize: '0.82rem', cursor: 'pointer',
                  background: term === t ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${term === t ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.09)'}`,
                  color: term === t ? '#bfe6ff' : '#8a94a4', whiteSpace: 'nowrap',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {TERM_NAME[t]}
              </button>
            ))}
          </div>

          <Step label="Target price" />
          {/* A SLIDER, not nine rows. Nine stacked options is a wall, and it hides
              the one thing that matters: that this is a single trade-off with two
              ends. Dragging right is further, harder and worth more, and your
              thumb feels that in a way a list never says. */}
          {bets.length > 0 && chosen ? (
            <div style={{ marginBottom: 13 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 10, marginBottom: 4,
              }}>
                <span style={{ minWidth: 0 }}>
                  <span className="font-cinzel font-800" style={{ fontSize: '1.75rem', lineHeight: 1, color: dir === 'up' ? UP : DOWN, ...TNUM }}>
                    {fmtPrice(targetPrice)}
                  </span>
                  <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.76rem', color: '#7c8696', marginTop: 3, ...TNUM }}>
                    from {fmtPrice(index.price)} · {dir === 'up' ? '+' : '-'}{chosen.distancePct}%
                  </span>
                </span>
                {/* THE PREMIUM IS THE QUOTE. There is no multiplier to headline
                    any more, and the honest replacement is what one contract
                    costs beside where it starts paying. */}
                <span style={{ textAlign: 'right' }}>
                  <span className="font-karla font-800" style={{ display: 'block', fontSize: '1.2rem', color: '#ffd96a', ...TNUM }}>
                    {fmtPrice(chosen.each)}
                  </span>
                  <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.72rem', color: '#7c8696', marginTop: 2 }}>
                    a contract
                  </span>
                </span>
              </div>

              <input
                type="range"
                className="rung-slider"
                min={0}
                max={bets.length - 1}
                step={1}
                value={Math.max(0, bets.findIndex(b => b.distancePct === chosen.distancePct))}
                onChange={e => {
                  const b = bets[Number(e.target.value)]
                  if (b) { setDistance(b.distancePct); vibrate([0, 6]) }
                }}
                aria-label="How far it has to move"
                aria-valuetext={`strike ${fmtPrice(targetPrice)} from ${fmtPrice(index.price)}, ${fmtPrice(chosen.each)} a contract, breaks even at ${fmtPrice(breakEven)}`}
                style={{
                  // The track fills up to the thumb, so how far along the ladder
                  // you are is readable without looking at the numbers. Both the
                  // fill's end and the grey's start sit at the SAME percentage,
                  // or the grey covers the whole track and the fill never shows.
                  ['--rung-track' as string]: (() => {
                    const at = bets.length > 1
                      ? (bets.findIndex(b => b.distancePct === chosen.distancePct) / (bets.length - 1)) * 100
                      : 100
                    return `linear-gradient(90deg, ${dir === 'up' ? UP : DOWN} 0%, #ffd96a ${at}%, rgba(255,255,255,0.1) ${at}%)`
                  })(),
                }}
              />

            </div>
          ) : (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.72rem', color: '#7c8696', lineHeight: 1.5, marginBottom: 13 }}>
              Nothing on offer this quickly. Give it longer.
            </p>
          )}

          <Step label="Contracts" />
          {/* QUANTITIES, sized per index so the four buttons always land on costs
              a captain recognises, roughly 1k / 5k / 25k / 100k, whether a unit
              costs 0.09 or 1,420. Nobody has to multiply anything to find a
              sensible ticket. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
            {presets.map(v => {
              const cost = Math.round(v * prem)
              // Too dear at the top, and on a fallen index too CHEAP at the
              // bottom: one unit of something trading at 0.09 rounds to nothing,
              // and a bet that costs nothing cannot pay anything.
              const tooDear = cost > doubloons || cost > betCap || cost < MIN_STAKE
              return (
                <button key={v} type="button" onClick={() => setUnits(v)} disabled={tooDear} className="font-karla font-700"
                  style={{
                    flex: 1, padding: '0.5rem 0.2rem', borderRadius: 9, fontSize: '0.78rem',
                    cursor: tooDear ? 'not-allowed' : 'pointer',
                    background: chosenUnits === v ? 'rgba(240,220,174,0.16)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${chosenUnits === v ? 'rgba(240,220,174,0.5)' : 'rgba(255,255,255,0.10)'}`,
                    color: tooDear ? '#5a6472' : '#e0d8c4', opacity: tooDear ? 0.55 : 1, ...TNUM,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {v.toLocaleString()}
                </button>
              )
            })}
          </div>
          {/* THE PREMIUM, named. It was written as a bare multiplication with
              no word for what the middle number was, so the one figure the whole
              purchase turns on went by unlabelled. */}
          <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#8a94a4', marginBottom: 12, ...TNUM }}>
            Premium <strong style={{ color: '#e0d8c4' }}>{fmtPrice(prem)}</strong> a contract ·{' '}
            <span style={{ color: capped > doubloons ? DOWN : '#e0d8c4' }}>{capped.toLocaleString()} ⟡</span> for {chosenUnits.toLocaleString()}
          </p>

        </div>

        <div style={{ flexShrink: 0, padding: '0.7rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.09)', background: 'rgba(6,9,14,0.97)' }}>
          {/* WHAT IT PAYS, AND THAT YOU ARE NOT STUCK WITH IT. "Nothing if it
              does not" was true only of the ending, and read as though the money
              were locked away until then. It is not: a contract can be sold back
              at any hour for what it is worth by then, which rises as the index
              moves your way and falls as the clock runs down. */}
          {chosen && !err && (
            <>
              {/* TWO NUMBERS, NAMED. Prose was doing a label's job. The chance
                  is measured against BREAKEVEN and not the strike, because a
                  contract can finish past its strike and still be down, the
                  whole way up to one premium beyond it. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
                <div style={{ padding: '0.5rem 0.6rem', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#7c8696', marginBottom: 2 }}>Breakeven</p>
                  <p className="font-karla font-800" style={{ fontSize: '0.98rem', color: '#ffd96a', ...TNUM }}>{fmtPrice(breakEven)}</p>
                </div>
                <div style={{ padding: '0.5rem 0.6rem', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#7c8696', marginBottom: 2 }}>Chance of profit</p>
                  <p className="font-karla font-800" style={{ fontSize: '0.98rem', color: '#e8eef6', ...TNUM }}>
                    {(() => {
                      const c = profitChance(index.price, breakEven, dir, term, index.dailyMovePct, drift, sched) * 100
                      return c >= 10 ? `${Math.round(c)}%` : `${c.toFixed(1)}%`
                    })()}
                  </p>
                </div>
              </div>
            </>
          )}
          {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: DOWN, marginBottom: 7, textAlign: 'center' }}>{err}</p>}
          <button type="button" onClick={submit} disabled={busy || !chosen || !affordable}
            className="font-karla font-800"
            style={{
              width: '100%', padding: '0.85rem', borderRadius: 11, fontSize: '0.96rem',
              cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(56,189,248,0.16)', border: '1px solid rgba(56,189,248,0.6)', color: '#e6f4ff',
              opacity: !chosen || !affordable ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? 'Placing…'
              : !chosen ? 'Nothing on offer'
              : capped > doubloons ? 'Not enough doubloons'
              : capped < MIN_STAKE ? `Buy at least ${MIN_STAKE.toLocaleString()} ⟡ worth`
              : capped > betCap ? `Too many for this one, ${betCap.toLocaleString()} ⟡ max`
              : `Buy ${chosenUnits.toLocaleString()} for ${capped.toLocaleString()} ⟡`}
          </button>
          <button type="button" onClick={onClose} className="font-karla font-600"
            style={{ width: '100%', marginTop: 6, padding: '0.45rem', background: 'none', border: 'none', color: '#6a7482', fontSize: '0.74rem', cursor: 'pointer' }}>
            Never mind
          </button>
        </div>
      </motion.div>
    </PopupShell>
  )
}

/** A RUNNING BET, opened up: where its index has been, what the bet is, what it
 *  is worth this second, and the way out.
 *
 *  Worth is the honest price rather than a courtesy: the payout times the chance
 *  it still gets there from where it stands. Sold the moment it is placed it
 *  returns the stake, so leaving early costs nothing but the chance itself. */
function BetSheet({ bet, index, onClose, onSold }: {
  bet: BoardBet; index: BoardIndex | null; onClose: () => void; onSold: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const live = bet.status === 'open'
  const ahead = bet.movedPct >= bet.distancePct
  const worth = bet.worth ?? 0
  const line = index && index.history.length > 1 ? index.history : [bet.entryPrice, bet.livePrice]

  function sell() {
    setErr(''); setBusy(true)
    sellBet(bet.id).then(res => {
      setBusy(false)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 14, 30, 22])
      purseChanged(res.doubloons)
      onSold()
    })
  }

  return (
    <PopupShell open onClose={onClose} zIndex={120}>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          margin: 'auto', width: '100%', maxWidth: 440, maxHeight: '100%',
          display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden',
          background: 'linear-gradient(180deg, #0e131b 0%, #080b11 100%)',
          border: `1px solid ${bet.accent}55`,
        }}>
        <div style={{ flexShrink: 0, padding: '0.95rem 1rem 0.8rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f0f4fa' }}>{bet.indexName}</p>
          <p className="font-karla font-500" style={{ fontSize: '0.74rem', color: '#8a94a4', marginTop: 2, lineHeight: 1.45 }}>
            {bet.units.toLocaleString()} units, {bet.stake.toLocaleString()} ⟡, on {bet.direction} at least {bet.distancePct}% within {TERM_NAME[bet.term].toLowerCase()}
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.9rem 1rem 1rem' }}>
          {/* THE PRICE, big, because it is the number the other two are measured
              against. Breakeven and the strike sit in the grid below in the same
              units, so how far off you are is a comparison rather than a sum.
              A settled contract has no live price worth staring at, so it goes
              back to showing what it actually paid. */}
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#7c8696' }}>
            {live ? 'Price now' : bet.status === 'won' ? 'Paid' : bet.status === 'sold' ? 'Sold for' : 'Ended at'}
          </p>
          <p className="font-cinzel font-800" style={{ fontSize: '1.9rem', lineHeight: 1.1, color: '#f0f4fa', ...TNUM }}>
            {live ? fmtPrice(bet.livePrice) : `${(bet.payout ?? 0).toLocaleString()} ⟡`}
          </p>
          {live && (
            <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: worth >= bet.stake ? UP : DOWN, marginBottom: 10, ...TNUM }}>
              {worth >= bet.stake ? '+' : ''}{(worth - bet.stake).toLocaleString()} ⟡ if you sold this second
            </p>
          )}

          {(() => {
            const target = bet.entryPrice * (1 + (bet.direction === 'up' ? 1 : -1) * bet.distancePct / 100)
            const vals = [...line, target]
            const lo = Math.min(...vals), hi = Math.max(...vals)
            const span = hi - lo || 1
            const H = 54
            return (
              <div style={{ margin: '4px 0 10px', padding: '0.55rem 0.6rem', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ position: 'relative', height: H }}>
                  <Line fluid points={line} color={bet.movedPct >= 0 ? UP : DOWN} w={380} h={H} mark={target} />
                  <span className="font-karla font-600" style={{ position: 'absolute', top: -2, right: 0, fontSize: '0.56rem', color: '#6a7482', ...TNUM }}>
                    {fmtPrice(hi)}
                  </span>
                  <span className="font-karla font-600" style={{ position: 'absolute', bottom: -2, right: 0, fontSize: '0.56rem', color: '#6a7482', ...TNUM }}>
                    {fmtPrice(lo)}
                  </span>
                  <span className="font-karla font-700" style={{
                    position: 'absolute', left: 0, top: `${(1 - (target - lo) / span) * 100}%`,
                    transform: 'translateY(-50%)', fontSize: '0.58rem', color: '#ffd96a',
                    background: 'rgba(10,14,20,0.82)', padding: '0 3px', borderRadius: 3, ...TNUM,
                  }}>
                    {fmtPrice(target)}
                  </span>
                </div>
                <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#7c8696', marginTop: 4, ...TNUM }}>
                  in at {fmtPrice(bet.entryPrice)}
                </p>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 4 }}>
            <Fact label="Moved" value={fmtPct(bet.movedPct)} color={ahead ? UP : '#e8eef6'} />
            {/* BREAKEVEN, not the strike, because the strike is only the number
                that matters if you hold to the end. Sell above this and you are
                up. It creeps toward the target every hour the clock runs, which
                is time decay in the only unit a captain can act on. */}
            <Fact label="Breaks even at"
              value={bet.breakEvenPrice != null ? fmtPrice(bet.breakEvenPrice) : `${bet.distancePct}%`}
              color={bet.breakEvenPrice != null && bet.livePrice >= bet.breakEvenPrice === (bet.direction === 'up') ? UP : '#e8eef6'} />
            {/* THE STRIKE, as a price, so it can be read straight off against
                the big number above and the breakeven beside it. What it pays if
                it lands was a number for the moment you BOUGHT it; the question
                once you hold it is where the price stands against these two. */}
            <Fact label="Target"
              value={fmtPrice(bet.entryPrice * (1 + (bet.direction === 'up' ? 1 : -1) * bet.distancePct / 100))}
              color={ahead ? UP : '#e8eef6'} />
            <Fact label={live ? 'Time left' : 'Result'}
              value={live
                ? (bet.hoursLeft >= 1 ? `${Math.round(bet.hoursLeft)}h` : 'under an hour')
                : bet.status === 'won' ? 'landed' : bet.status === 'sold' ? 'sold early' : 'missed'} />
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: '0.7rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.09)', background: 'rgba(6,9,14,0.97)' }}>
          {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: DOWN, marginBottom: 7, textAlign: 'center' }}>{err}</p>}
          {live && (
            <>
              <button type="button" onClick={sell} disabled={busy} className="font-karla font-800"
                style={{
                  width: '100%', padding: '0.68rem', borderRadius: 11, fontSize: '0.82rem',
                  cursor: busy ? 'wait' : 'pointer',
                  background: 'rgba(240,220,174,0.14)', border: '1px solid rgba(240,220,174,0.5)', color: '#f4ecd8',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {busy ? 'Selling…' : `Sell now for ${worth.toLocaleString()} ⟡`}
              </button>
              <p className="font-karla font-400" style={{ fontSize: '0.64rem', color: '#6a7482', marginTop: 6, textAlign: 'center', lineHeight: 1.45 }}>
                Worth more as it moves your way, less as the clock runs down. Hold it to the end and it is all or nothing.
              </p>
            </>
          )}
          <button type="button" onClick={onClose} className="font-karla font-600"
            style={{ width: '100%', marginTop: live ? 4 : 0, padding: '0.45rem', background: 'none', border: 'none', color: '#6a7482', fontSize: '0.74rem', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </motion.div>
    </PopupShell>
  )
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '0.45rem 0.55rem', borderRadius: 9, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', minWidth: 0 }}>
      <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: '#7c8696', marginBottom: 2 }}>{label}</p>
      <p className="font-karla font-700" style={{ fontSize: '0.88rem', color: color ?? '#eef3f9', ...TNUM }}>{value}</p>
    </div>
  )
}

/** Numbered, because four controls in a row is a form and a form needs an
 *  order. */
/** A quiet label, not a numbered step. The numbers implied an order that was
 *  never real -- every control can be changed in any sequence, and four blue
 *  badges shouting 1 2 3 4 made a four-field form look like a procedure. */
function Step({ label }: { label: string }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.09em]"
      style={{ fontSize: '0.68rem', color: '#7c8696', marginBottom: 7 }}>
      {label}
    </p>
  )
}
