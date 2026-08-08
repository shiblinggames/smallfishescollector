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
import LeaderboardModal from '@/components/LeaderboardModal'
import { vibrate } from '@/lib/haptics'
import {
  TERMS, TERM_NAME, type Term, type Direction,
  offeredBets, driftOver, stakeCapFor, unitPresets, costOf, premiumOf, worthNow, scheduledIn, chanceInWords, payoutInWords, payoutFor, fmtPrice,
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
function Line({ points, color, w = 64, h = 22 }: { points: number[]; color: string; w?: number; h?: number }) {
  if (points.length < 2) return <div style={{ width: w, height: h, flexShrink: 0 }} />
  const lo = Math.min(...points), hi = Math.max(...points)
  const span = hi - lo || 1
  const d = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - lo) / span) * h}`).join(' ')
  return (
    <svg width={w} height={h} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
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
      {open.length > 0 && <RunningStrip bets={open} indexes={board.indexes} />}

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

      {/* Who is beating you at it. Week first: it is the board most captains can
          actually get onto, and the all-time one is a step behind rather than
          the front door. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: 9 }}>
        <LeaderboardModal
          boards={['exchangeWeek', 'exchangeNet']}
          title="Top Traders"
          label="Ranks"
          triggerStyle={{
            background: 'rgba(56,189,248,0.10)',
            border: '1px solid rgba(56,189,248,0.42)',
            color: '#7dd3fc', boxShadow: 'none',
            fontSize: '0.56rem', height: 24, padding: '0 0.62rem', borderRadius: 20,
          }}
        />
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
      total += worthNow(
        b.stake, b.multiplier, b.distancePct,
        b.direction === 'up' ? raw : -raw,
        b.hoursLeft + k, idx.dailyMovePct,
      )
    }
    out.push(total)
  }
  const first = out.findIndex(v => v > 0)
  return first <= 0 ? out : out.slice(first)
}

/** What you have riding right now, above everything else, because it is the
 *  first thing you came to look at. */
function RunningStrip({ bets, indexes }: { bets: BoardBet[]; indexes: BoardIndex[] }) {
  const staked = bets.reduce((n, b) => n + b.stake, 0)
  const couldWin = bets.reduce((n, b) => n + payoutFor(b.stake, b.multiplier), 0)
  const winning = bets.filter(b => b.movedPct >= b.distancePct).length
  const worth = bets.reduce((n, b) => n + (b.worth ?? 0), 0)
  const series = bookSeries(bets, indexes)
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

      {series.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <Line points={series} color={worth >= staked ? UP : DOWN} w={380} h={38} />
        </div>
      )}

      <p className="font-karla font-500" style={{ fontSize: '0.7rem', color: '#8a94a4', marginTop: 4, ...TNUM }}>
        {staked.toLocaleString()} ⟡ in · {couldWin.toLocaleString()} ⟡ if every one of them lands
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
      <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e8eef6' }}>{title}</p>
      <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#7c8696', lineHeight: 1.45, marginBottom: 7 }}>{note}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {list.map(i => <Row key={i.id} i={i} onPick={onPick} />)}
      </div>
    </div>
  )
}

/** "in 3 days", "due now", or null when it is too far off to matter yet. */
function reportIn(at: string | null): string | null {
  if (!at) return null
  const h = (new Date(at).getTime() - Date.now()) / 3_600_000
  if (!Number.isFinite(h) || h > 96) return null
  if (h <= 1) return 'due now'
  if (h < 24) return `in ${Math.round(h)}h`
  return `in ${Math.round(h / 24)}d`
}

/** The gap it just took, while that is still the reason the chart looks so odd. */
function freshEvent(i: BoardIndex): string | null {
  if (!i.lastEvent || !i.lastEventAt || i.lastEventPct == null) return null
  const h = (Date.now() - new Date(i.lastEventAt).getTime()) / 3_600_000
  if (!(h >= 0) || h > 36) return null
  return `${i.lastEvent}, ${i.lastEventPct > 0 ? '+' : ''}${i.lastEventPct}%`
}

function Row({ i, onPick }: { i: BoardIndex; onPick: (i: BoardIndex) => void }) {
  const day = pct(i.price, i.prevPrice)
  const news = freshEvent(i)
  const due = reportIn(i.nextEventAt)
  return (
    <button type="button" onClick={() => { vibrate([0, 12]); onPick(i) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '0.5rem 0.6rem', borderRadius: 10, cursor: 'pointer',
        background: 'rgba(13,17,24,0.9)', border: '1px solid rgba(255,255,255,0.08)',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <span aria-hidden style={{ width: 3, height: 26, borderRadius: 2, background: i.accent, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.8rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {i.name}
        </span>
        {/* WHY IT MOVED, or what is coming. A 30% cliff with no caption reads as
            a bug; the same cliff captioned "the beds came up empty" reads as
            news, which is the whole difference between a market and a jitter. */}
        <span className="font-karla font-500" style={{ display: 'block', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: news ? ((i.lastEventPct ?? 0) > 0 ? UP : DOWN) : '#6a7482' }}>
          {news ?? (due ? `${i.nextEventLabel ?? 'Report'} ${due}` : '')}
        </span>
      </span>
      <Line points={i.history.length > 1 ? i.history : [i.prevPrice, i.price]} color={day >= 0 ? UP : DOWN} />
      <span style={{ textAlign: 'right', flexShrink: 0, minWidth: 56 }}>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.8rem', color: '#f0f4fa', ...TNUM }}>
          {fmtPrice(i.price)}
        </span>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.62rem', color: day >= 0 ? UP : DOWN, ...TNUM }}>
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {bets.map(b => {
        const ahead = b.movedPct >= b.distancePct
        const done = b.status !== 'open'
        const won = b.status === 'won'
        return (
          <button key={b.id} type="button" onClick={() => onOpen(b)} style={{
            width: '100%', textAlign: 'left', cursor: 'pointer',
            padding: '0.6rem 0.7rem', borderRadius: 11,
            background: 'rgba(13,17,24,0.9)',
            border: `1px solid ${done ? (won ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.1)'}`,
            opacity: done && !won ? 0.72 : 1, WebkitTapHighlightColor: 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#e8eef6' }}>{b.indexName}</span>
              <span className="font-karla font-800" style={{ fontSize: '0.72rem', color: done ? (won ? UP : '#7d7466') : '#8a94a4' }}>
                {b.status === 'won' ? `won ${(b.payout ?? 0).toLocaleString()} ⟡`
                  : b.status === 'sold' ? `sold for ${(b.payout ?? 0).toLocaleString()} ⟡`
                  : b.status === 'lost' ? 'lost'
                  : ahead ? 'ahead' : 'behind'}
              </span>
            </div>
            {/* The bet, as one sentence. */}
            <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: '#8a94a4', marginTop: 2, lineHeight: 1.45 }}>
              {b.stake.toLocaleString()} ⟡ on {b.direction === 'up' ? 'up' : 'down'} at least {b.distancePct}% within {TERM_NAME[b.term].toLowerCase()}
            </p>
            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: ahead ? UP : '#7c8696', marginTop: 3, ...TNUM }}>
              {done ? 'ended' : 'now'} {fmtPct(b.movedPct)} {b.direction === 'up' ? 'up' : 'down'} {done ? '' : `· needs ${b.distancePct}%`}
              {!done && b.worth != null && `  ·  worth ${b.worth.toLocaleString()} ⟡`}
            </p>
          </button>
        )
      })}
    </div>
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
  const bets = offeredBets(index.dailyMovePct, term, drift, sched)
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
  const capNow = Math.min(MAX_STAKE, chosen ? stakeCapFor(chosen.multiplier) : MAX_STAKE)
  // The same four everywhere means the sensible DEFAULT is not the same
  // everywhere: ten units is a fair ticket on most of the board and more than a
  // captain owns on the dearest index. Open on the biggest one they can afford.
  // Every contract costs the premium, which depends on the rung you picked, so
  // affordability moves as you drag the slider. That is the point: the long
  // shots are the cheap ones.
  const prem = chosen ? premiumOf(index.price, chosen.chance) : index.price
  const fits = (n: number) => {
    const c = costOf(n, index.price, chosen?.chance ?? 1)
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
  const capped = costOf(chosenUnits, index.price, chosen?.chance ?? 1)
  const affordable = capped <= doubloons && capped >= MIN_STAKE && capped <= betCap
  const returns = chosen ? payoutFor(capped, chosen.multiplier) : 0

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
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f0f4fa' }}>{index.name}</p>
          <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#8a94a4', lineHeight: 1.45, marginTop: 1 }}>
            {index.blurb}
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#7c8696', marginTop: 4, ...TNUM }}>
            {fmtPrice(index.price)} now
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
          <Step label="Which way" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 13 }}>
            {(['up', 'down'] as const).map(d => (
              <button key={d} type="button" onClick={() => setDir(d)} className="font-karla font-700"
                style={{
                  padding: '0.55rem', borderRadius: 10, fontSize: '0.82rem', cursor: 'pointer',
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
                  flexShrink: 0, padding: '0.34rem 0.7rem', borderRadius: 999, fontSize: '0.7rem', cursor: 'pointer',
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
                  <span className="font-cinzel font-800" style={{ fontSize: '1.55rem', lineHeight: 1, color: dir === 'up' ? UP : DOWN, ...TNUM }}>
                    {fmtPrice(targetPrice)}
                  </span>
                  <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.66rem', color: '#7c8696', marginTop: 3, ...TNUM }}>
                    from {fmtPrice(index.price)} · {dir === 'up' ? '+' : '-'}{chosen.distancePct}%
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a94a4' }}>
                    {chanceInWords(chosen.chance)}
                  </span>
                  <span className="font-karla font-800" style={{ fontSize: '1.05rem', color: '#ffd96a', ...TNUM }}>
                    {payoutInWords(chosen.multiplier)}
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
                aria-valuetext={`reaches ${fmtPrice(targetPrice)} from ${fmtPrice(index.price)}, ${chanceInWords(chosen.chance)}, pays ${payoutInWords(chosen.multiplier)}`}
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
              const cost = costOf(v, index.price, chosen?.chance ?? 1)
              // Too dear at the top, and on a fallen index too CHEAP at the
              // bottom: one unit of something trading at 0.09 rounds to nothing,
              // and a bet that costs nothing cannot pay anything.
              const tooDear = cost > doubloons || cost > betCap || cost < MIN_STAKE
              return (
                <button key={v} type="button" onClick={() => setUnits(v)} disabled={tooDear} className="font-karla font-700"
                  style={{
                    flex: 1, padding: '0.4rem 0.2rem', borderRadius: 9, fontSize: '0.66rem',
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
          {/* The sum written out. A quantity times a price is the one piece of
              arithmetic this screen cannot avoid asking for, so it does it. */}
          <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#8a94a4', marginBottom: 11, ...TNUM }}>
            {chosenUnits.toLocaleString()} × {fmtPrice(prem)} a contract ={' '}
            <span style={{ color: capped > doubloons ? DOWN : '#e0d8c4' }}>{capped.toLocaleString()} ⟡</span>
          </p>

        </div>

        <div style={{ flexShrink: 0, padding: '0.7rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.09)', background: 'rgba(6,9,14,0.97)' }}>
          {/* The only thing the four controls do not already say, said once and
              next to the button rather than in a paragraph restating them. */}
          {chosen && !err && (
            <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a94a4', textAlign: 'center', marginBottom: 7, ...TNUM }}>
              Pays <strong style={{ color: '#ffd96a' }}>{returns.toLocaleString()} ⟡</strong> if it lands, nothing if it does not
            </p>
          )}
          {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: DOWN, marginBottom: 7, textAlign: 'center' }}>{err}</p>}
          <button type="button" onClick={submit} disabled={busy || !chosen || !affordable}
            className="font-karla font-800"
            style={{
              width: '100%', padding: '0.72rem', borderRadius: 11, fontSize: '0.84rem',
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
          {/* WHAT IT IS WORTH, first, because it is the only reason to open this. */}
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#7c8696' }}>
            {live ? 'Worth now' : bet.status === 'won' ? 'Paid' : bet.status === 'sold' ? 'Sold for' : 'Ended at'}
          </p>
          <p className="font-cinzel font-800" style={{ fontSize: '1.9rem', lineHeight: 1.1, color: '#f0f4fa', ...TNUM }}>
            {(live ? worth : (bet.payout ?? 0)).toLocaleString()} ⟡
          </p>
          {live && (
            <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: worth >= bet.stake ? UP : DOWN, marginBottom: 10, ...TNUM }}>
              {worth >= bet.stake ? '+' : ''}{(worth - bet.stake).toLocaleString()} against the {bet.stake.toLocaleString()} ⟡ you put in
            </p>
          )}

          <div style={{ margin: '4px 0 10px', padding: '0.55rem 0.6rem', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Line points={line} color={bet.movedPct >= 0 ? UP : DOWN} w={380} h={54} />
            <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#7c8696', marginTop: 4, ...TNUM }}>
              in at {fmtPrice(bet.entryPrice)} · now {fmtPrice(bet.livePrice)}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 4 }}>
            <Fact label="Moved" value={fmtPct(bet.movedPct)} color={ahead ? UP : '#e8eef6'} />
            <Fact label="Needs" value={`${bet.distancePct}%`} />
            <Fact label="Pays if it lands" value={`${payoutFor(bet.stake, bet.multiplier).toLocaleString()} ⟡`} />
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
                Take what it is worth and walk away. Leave it and it pays everything or nothing.
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
      style={{ fontSize: '0.58rem', color: '#7c8696', marginBottom: 6 }}>
      {label}
    </p>
  )
}
