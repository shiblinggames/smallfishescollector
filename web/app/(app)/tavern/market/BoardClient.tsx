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
  TERMS, TERM_NAME, TERM_PITCH, type Term, type Direction,
  offeredBets, driftOver, chanceInWords, payoutInWords, payoutFor,
  MIN_STAKE, MAX_STAKE,
} from '@/lib/exchangeBoard'
import { getBoard, openBet, markBetsSeen } from './boardActions'
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
      {open.length > 0 && <RunningStrip bets={open} />}

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
          <Group
            title="Waters"
            note="Whole stretches of sea. They move slowly, and they move together."
            list={zones} onPick={setTicket} />
          <Group
            title="Creatures"
            note="One kind of thing. Far jumpier, and some of them ignore the weather entirely."
            list={species} onPick={setTicket} />
        </>
      ) : (
        <BetList bets={board.bets} />
      )}

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

/** What you have riding right now, above everything else, because it is the
 *  first thing you came to look at. */
function RunningStrip({ bets }: { bets: BoardBet[] }) {
  const staked = bets.reduce((n, b) => n + b.stake, 0)
  const couldWin = bets.reduce((n, b) => n + payoutFor(b.stake, b.multiplier), 0)
  const winning = bets.filter(b => b.movedPct >= b.distancePct).length
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
      <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.15, color: '#f0f4fa', marginTop: 2, ...TNUM }}>
        {staked.toLocaleString()} ⟡
      </p>
      <p className="font-karla font-500" style={{ fontSize: '0.7rem', color: '#8a94a4', ...TNUM }}>
        {couldWin.toLocaleString()} ⟡ if every one of them lands
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

function Row({ i, onPick }: { i: BoardIndex; onPick: (i: BoardIndex) => void }) {
  const day = pct(i.price, i.prevPrice)
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
        {/* The one fact that tells you what kind of thing you are looking at. */}
        <span className="font-karla font-500" style={{ display: 'block', fontSize: '0.6rem', color: '#6a7482' }}>
          moves about {i.typicalDayPct < 10 ? i.typicalDayPct.toFixed(1) : Math.round(i.typicalDayPct)}% on a normal day
        </span>
      </span>
      <Line points={i.history.length > 1 ? i.history : [i.prevPrice, i.price]} color={day >= 0 ? UP : DOWN} />
      <span style={{ textAlign: 'right', flexShrink: 0, minWidth: 56 }}>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.8rem', color: '#f0f4fa', ...TNUM }}>
          {i.price < 1 ? i.price.toFixed(3) : i.price.toFixed(2)}
        </span>
        <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.62rem', color: day >= 0 ? UP : DOWN, ...TNUM }}>
          {fmtPct(day)}
        </span>
      </span>
    </button>
  )
}

function BetList({ bets }: { bets: BoardBet[] }) {
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
          <div key={b.id} style={{
            padding: '0.6rem 0.7rem', borderRadius: 11,
            background: 'rgba(13,17,24,0.9)',
            border: `1px solid ${done ? (won ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.1)'}`,
            opacity: done && !won ? 0.72 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <span className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#e8eef6' }}>{b.indexName}</span>
              <span className="font-karla font-800" style={{ fontSize: '0.72rem', color: done ? (won ? UP : '#7d7466') : '#8a94a4' }}>
                {done ? (won ? `won ${(b.payout ?? 0).toLocaleString()} ⟡` : 'lost') : ahead ? 'ahead' : 'behind'}
              </span>
            </div>
            {/* The bet, as one sentence. */}
            <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: '#8a94a4', marginTop: 2, lineHeight: 1.45 }}>
              {b.stake.toLocaleString()} ⟡ on {b.direction === 'up' ? 'up' : 'down'} at least {b.distancePct}% within {TERM_NAME[b.term].toLowerCase()}
            </p>
            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: ahead ? UP : '#7c8696', marginTop: 3, ...TNUM }}>
              {done ? 'ended' : 'now'} {fmtPct(b.movedPct)} {b.direction === 'up' ? 'up' : 'down'} {done ? '' : `· needs ${b.distancePct}%`}
            </p>
          </div>
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
  const [stake, setStake] = useState(5000)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Priced with the drift the engine is already applying, exactly as the server
  // will price it. Quote it any other way and the ticket promises odds the
  // settlement will not honour.
  const drift = driftOver(index.vol, index.beta, index.trend, moodBias, term, dir)
  const bets = offeredBets(index.dailyMovePct, term, drift)
  // Keep a valid distance selected as the term changes: the rungs on offer
  // shrink hard on the short terms, and a stale pick would silently price a bet
  // nobody chose.
  const chosen = bets.find(b => b.distancePct === distance) ?? bets[0]
  useEffect(() => {
    if (!bets.some(b => b.distancePct === distance)) setDistance(bets[0]?.distancePct ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  const capped = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.min(stake, doubloons)))
  const returns = chosen ? payoutFor(capped, chosen.multiplier) : 0

  function submit() {
    if (!chosen) return
    setErr(''); setBusy(true)
    openBet(index.id, dir, term, chosen.distancePct, capped).then(res => {
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
            {index.price < 1 ? index.price.toFixed(3) : index.price.toFixed(2)} now
            {' · '}moves about {index.typicalDayPct < 10 ? index.typicalDayPct.toFixed(1) : Math.round(index.typicalDayPct)}% on a normal day
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.85rem 1rem 1rem' }}>
          <Step n={1} label="Which way is it going?" />
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

          <Step n={2} label="How long has it got?" />
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, marginBottom: 4, scrollbarWidth: 'none' }}>
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
          <p className="font-karla font-400 italic" style={{ fontSize: '0.66rem', color: '#6a7482', marginBottom: 13, lineHeight: 1.45 }}>
            {TERM_PITCH[term]}
          </p>

          <Step n={3} label="How far does it have to go?" />
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
                <span className="font-cinzel font-800" style={{ fontSize: '1.55rem', lineHeight: 1, color: dir === 'up' ? UP : DOWN, ...TNUM }}>
                  {dir === 'up' ? '+' : '-'}{chosen.distancePct}%
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
                aria-valuetext={`${chosen.distancePct} percent, ${chanceInWords(chosen.chance)}, pays ${payoutInWords(chosen.multiplier)}`}
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

              {/* The two ends, named, so the direction of the trade-off is stated
                  and not merely implied by a handle. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: -2 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7c8696' }}>
                  Likely, pays little
                </span>
                <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8a7c4a' }}>
                  Long shot, pays big
                </span>
              </div>
            </div>
          ) : (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.72rem', color: '#7c8696', lineHeight: 1.5, marginBottom: 13 }}>
              Nothing on offer this quickly. Give it longer.
            </p>
          )}

          <Step n={4} label="How much are you putting on it?" />
          <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
            {[1000, 5000, 25000, 100000].map(v => (
              <button key={v} type="button" onClick={() => setStake(v)} className="font-karla font-700"
                style={{
                  flex: 1, padding: '0.42rem 0.2rem', borderRadius: 9, fontSize: '0.68rem', cursor: 'pointer',
                  background: capped === Math.min(v, doubloons) ? 'rgba(240,220,174,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${capped === Math.min(v, doubloons) ? 'rgba(240,220,174,0.5)' : 'rgba(255,255,255,0.10)'}`,
                  color: v > doubloons ? '#5a6472' : '#e0d8c4', ...TNUM,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>

          {/* THE WHOLE BET, in one sentence, so nobody has to assemble it from
              four controls in their head before spending anything. */}
          {chosen && (
            <div style={{ padding: '0.75rem 0.85rem', borderRadius: 12, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.22)' }}>
              <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#dbe3ee', lineHeight: 1.55 }}>
                {capped.toLocaleString()} ⟡ that <strong style={{ color: '#f0f4fa' }}>{index.name}</strong> is
                {' '}{dir === 'up' ? 'up' : 'down'} at least <strong style={{ color: '#f0f4fa' }}>{chosen.distancePct}%</strong>
                {' '}in <strong style={{ color: '#f0f4fa' }}>{TERM_NAME[term].toLowerCase()}</strong>.
              </p>
              <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#ffd96a', marginTop: 6, ...TNUM }}>
                {chanceInWords(chosen.chance)}. Comes back as {returns.toLocaleString()} ⟡.
              </p>
              <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#7c8696', marginTop: 5, lineHeight: 1.45 }}>
                If it does not get there, the stake is gone. Nothing in between.
              </p>
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, padding: '0.7rem 1rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.09)', background: 'rgba(6,9,14,0.97)' }}>
          {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: DOWN, marginBottom: 7, textAlign: 'center' }}>{err}</p>}
          <button type="button" onClick={submit} disabled={busy || !chosen || capped > doubloons}
            className="font-karla font-800"
            style={{
              width: '100%', padding: '0.72rem', borderRadius: 11, fontSize: '0.84rem',
              cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(56,189,248,0.16)', border: '1px solid rgba(56,189,248,0.6)', color: '#e6f4ff',
              opacity: !chosen || capped > doubloons ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? 'Placing…' : !chosen ? 'Nothing on offer' : `Put ${capped.toLocaleString()} ⟡ on it`}
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

/** Numbered, because four controls in a row is a form and a form needs an
 *  order. */
function Step({ n, label }: { n: number; label: string }) {
  return (
    <p className="font-karla font-700" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.74rem', color: '#c8d2e0', marginBottom: 6 }}>
      <span aria-hidden style={{
        width: 17, height: 17, borderRadius: 999, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(56,189,248,0.16)', border: '1px solid rgba(56,189,248,0.4)',
        fontSize: '0.58rem', color: '#bfe6ff',
      }}>{n}</span>
      {label}
    </p>
  )
}
