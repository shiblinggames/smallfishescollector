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
import {
  TERMS, TERM_LABEL, TERM_BLURB, type Term, type Direction,
  quoteFund, quoteSingle, EARLY_CLOSE_RETURN, MIN_STAKE, MAX_STAKE,
} from '@/lib/fishExchange'
import {
  getExchangeBoard, openContract, closeContractEarly, markResultsSeen,
} from './exchangeActions'
import type { ExchangeBoard, BoardFund, BoardFish, BoardPosition } from './exchangeActions'

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

export default function ExchangeClient({ onDoubloons }: { onDoubloons?: (n: number) => void }) {
  const [board, setBoard] = useState<ExchangeBoard | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'funds' | 'fish' | 'positions'>('funds')
  const [ticket, setTicket] = useState<{ kind: 'fund'; f: BoardFund } | { kind: 'fish'; f: BoardFish } | null>(null)
  const [, startTransition] = useTransition()

  const load = useCallback(() => {
    getExchangeBoard().then(res => {
      if ('error' in res) setErr(res.error)
      else {
        setBoard(res)
        onDoubloons?.(res.doubloons)
        // Contracts settle while you are away, so the purse can have moved
        // since the page rendered.
        purseChanged(res.doubloons)
      }
    })
  }, [onDoubloons])

  useEffect(() => { load() }, [load])

  // Looking at the Results list is what clears the markers. Fire and forget:
  // a failed clear just means the badge is still there next time.
  useEffect(() => {
    if (tab !== 'positions' || !board?.unseen) return
    startTransition(() => { void markResultsSeen() })
    setBoard(b => b ? { ...b, unseen: 0, positions: b.positions.map(p => ({ ...p, seen: true })) } : b)
  }, [tab, board?.unseen])

  if (err) return <p className="font-karla" style={{ fontSize: '0.78rem', color: DOWN, padding: '2rem 0' }}>{err}</p>
  if (!board) return <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.66rem', color: '#5a6472', padding: '2rem 0', textAlign: 'center' }}>Opening the board…</p>

  if (!board.open) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c8d2e0', marginBottom: 8 }}>The Exchange is closed to you</p>
        <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#8a94a4', lineHeight: 1.55 }}>
          {board.gateReason}. Contracts are for captains who have worked both halves of the sea.
        </p>
      </div>
    )
  }

  const openPos = board.positions.filter(p => p.status === 'open')
  const donePos = board.positions.filter(p => p.status !== 'open')

  return (
    <>
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

      {tab === 'funds' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#7c8696', marginBottom: 2, lineHeight: 1.45 }}>
            A fund is the average of every fish in it, so it moves a fraction as far as any one of them. Steadier, and easier to be roughly right about.
          </p>
          {board.funds.map(f => {
            const p = pct(f.price, f.prevPrice)
            return (
              <button key={f.id} type="button" onClick={() => setTicket({ kind: 'fund', f })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '0.6rem 0.7rem', borderRadius: 11, background: 'rgba(13,17,24,0.92)', border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <span aria-hidden style={{ width: 3, height: 30, borderRadius: 2, background: f.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                  <p className="font-karla font-500" style={{ fontSize: '0.62rem', color: '#7c8696' }}>{f.members} fish</p>
                </div>
                <Spark points={f.history.length > 1 ? f.history : [f.prevPrice, f.price]} color={p >= 0 ? UP : DOWN} />
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 62 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#f0f4fa', ...TNUM }}>{f.price.toFixed(3)}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: p >= 0 ? UP : DOWN, ...TNUM }}>{fmtPct(p)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'fish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#7c8696', marginBottom: 2, lineHeight: 1.45 }}>
            One species, on its own. They swing far harder than any fund, and a legendary hardest of all.
          </p>
          {[...board.fish].sort((a, b) => Math.abs(pct(b.price, b.prevPrice)) - Math.abs(pct(a.price, a.prevPrice))).map(f => {
            const p = pct(f.price, f.prevPrice)
            return (
              <button key={f.fishId} type="button" onClick={() => setTicket({ kind: 'fish', f })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '0.45rem 0.6rem', borderRadius: 9, background: 'rgba(13,17,24,0.78)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#e8eef6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                </div>
                <Spark points={f.history.length > 1 ? f.history : [f.prevPrice, f.price]} color={p >= 0 ? UP : DOWN} w={46} h={16} />
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 58 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f0f4fa', ...TNUM }}>{f.price.toFixed(3)}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: p >= 0 ? UP : DOWN, ...TNUM }}>{fmtPct(p)}</p>
                </div>
              </button>
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
          {openPos.map(p => <PositionRow key={p.id} p={p} cycle={board.cycle} onChanged={load} />)}
          {donePos.length > 0 && (
            <>
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: '#6a7482', marginTop: 8 }}>Results</p>
              {donePos.map(p => <PositionRow key={p.id} p={p} cycle={board.cycle} onChanged={load} />)}
            </>
          )}
        </div>
      )}

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

function PositionRow({ p, cycle, onChanged }: { p: BoardPosition; cycle: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const live = pct(p.livePrice, p.entryPrice)
  const yourWay = p.direction === 'rise' ? live : -live
  const breakEven = 1 / p.leverage
  const settled = p.status !== 'open'
  const value = settled ? (p.payout ?? 0) : Math.max(0, Math.round(p.stake * p.leverage * Math.max(0, yourWay)))
  // What closing RIGHT NOW actually hands over, which is the only number that
  // answers "should I?".
  const earlyValue = Math.max(0, Math.round(value * EARLY_CLOSE_RETURN))
  const good = settled ? (p.payout ?? 0) > p.stake : yourWay > breakEven
  const left = p.expiryCycle - cycle

  return (
    <div style={{ padding: '0.6rem 0.7rem', borderRadius: 11, background: 'rgba(13,17,24,0.92)', border: `1px solid ${settled ? 'rgba(255,255,255,0.08)' : good ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.12)'}`, opacity: settled ? 0.86 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#e8eef6', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {p.label}
        </p>
        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: p.direction === 'rise' ? UP : DOWN, flexShrink: 0 }}>
          {p.direction === 'rise' ? 'Rise' : 'Fall'} · {TERM_LABEL[p.term]}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
        <Cell label="Staked" value={`${p.stake.toLocaleString()} ⟡`} />
        <Cell label={settled ? 'Moved' : 'Moving'} value={fmtPct(yourWay)} color={yourWay >= 0 ? UP : DOWN} />
        <Cell label={settled ? 'Paid' : 'Worth now'} value={`${value.toLocaleString()} ⟡`} color={value > p.stake ? UP : value === 0 ? DOWN : '#c8d2e0'} />
      </div>

      {!settled ? (
        <>
          <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#7c8696', marginTop: 7 }}>
            Break-even {fmtPct(breakEven)} · settles on its own in {left <= 0 ? 'moments' : `${left}h`}
          </p>

          {/* A REAL BUTTON, saying the actual number. It was 10px of grey in
              the corner reading "Close for 80%", which does not say 80% of
              what, and read as no button at all.

              Two taps, because one tap liquidating a position is a mistake
              nobody can undo, and the haircut makes an accident cost real
              money. Trading apps do not confirm; they also do not have a
              thumb-sized tap target next to a scrolling list. */}
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
              width: '100%', marginTop: 8, padding: '0.5rem', borderRadius: 9, fontSize: '0.72rem',
              background: armed ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${armed ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.18)'}`,
              color: armed ? '#f0d89a' : '#d4dce8', cursor: busy ? 'wait' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? 'Closing…'
              : armed ? `Take ${earlyValue.toLocaleString()} ⟡ and close. Tap again`
              : `Close early for ${earlyValue.toLocaleString()} ⟡`}
          </button>
          {armed && !busy && (
            <button type="button" onClick={() => setArmed(false)} className="font-karla font-600"
              style={{ width: '100%', marginTop: 4, padding: '0.3rem', background: 'none', border: 'none', color: '#6a7482', fontSize: '0.64rem', cursor: 'pointer' }}>
              Keep it open
            </button>
          )}
          {armed && (
            <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: '#6a7482', marginTop: 3, lineHeight: 1.4, textAlign: 'center' }}>
              Worth {value.toLocaleString()} ⟡ at expiry. Closing now keeps {Math.round(EARLY_CLOSE_RETURN * 100)}% of it.
            </p>
          )}
        </>
      ) : (
        <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7c8696', marginTop: 6 }}>
          {p.status === 'closed_early' ? 'Closed early' : 'Settled'} at {p.exitPrice?.toFixed(3)} · entry {p.entryPrice.toFixed(3)}
          {(p.payout ?? 0) === 0 ? ' · expired worthless' : ''}
        </p>
      )}
    </div>
  )
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.54rem', color: '#6a7482' }}>{label}</p>
      <p className="font-karla font-700" style={{ fontSize: '0.76rem', color: color ?? '#e8eef6', ...TNUM }}>{value}</p>
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

  const isFund = instrument.kind === 'fund'
  const name = isFund ? instrument.f.name : instrument.f.name
  const accent = isFund ? instrument.f.accent : '#7dd3fc'
  const price = instrument.f.price
  const q = isFund
    ? quoteFund(instrument.f.members, term)
    : quoteSingle(instrument.f.rarity, term)

  const capped = Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.min(stake, doubloons)))
  const example = (movePct: number) => Math.round(capped * q.leverage * movePct)

  function submit() {
    setErr(''); setBusy(true)
    openContract(
      isFund ? { kind: 'fund', fundId: instrument.f.id } : { kind: 'fish', fishId: instrument.f.fishId },
      dir, term, capped,
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
        style={{ margin: 'auto', width: '100%', maxWidth: 440, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(180deg, #0e131b 0%, #080b11 100%)', border: `1px solid ${accent}55` }}>

        <div style={{ padding: '0.95rem 1rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0f4fa' }}>{name}</p>
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#7c8696', ...TNUM }}>
            {price.toFixed(3)} now{isFund ? ` · ${instrument.f.members} fish` : ''}
          </p>
        </div>

        <div style={{ padding: '0.85rem 1rem 1.1rem' }}>
          <Label>Which way</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {(['rise', 'fall'] as const).map(d => (
              <button key={d} type="button" onClick={() => setDir(d)} className="font-karla font-700"
                style={{ padding: '0.5rem', borderRadius: 10, fontSize: '0.78rem', cursor: 'pointer',
                  background: dir === d ? (d === 'rise' ? 'rgba(74,222,128,0.16)' : 'rgba(248,113,113,0.16)') : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${dir === d ? (d === 'rise' ? UP : DOWN) : 'rgba(255,255,255,0.10)'}`,
                  color: dir === d ? (d === 'rise' ? UP : DOWN) : '#8a94a4' }}>
                {d === 'rise' ? 'Rise' : 'Fall'}
              </button>
            ))}
          </div>

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

          {/* THE DEAL, in one line. Everything above is a choice; this is what
              those choices bought. */}
          <div style={{ marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 11, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#8a94a4' }}>Break-even move</span>
              <span className="font-karla font-800" style={{ fontSize: '0.9rem', color: '#e6f4ff', ...TNUM }}>{fmtPct(q.breakEvenPct)}</span>
            </div>
            {[1, 3, 6].map(m => (
              <div key={m} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="font-karla font-500" style={{ fontSize: '0.64rem', color: '#6a7482', ...TNUM }}>at {fmtPct(m)}</span>
                <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: example(m) > capped ? UP : '#8a94a4', ...TNUM }}>
                  {example(m).toLocaleString()} ⟡
                </span>
              </div>
            ))}
            <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#6a7482', marginTop: 6, lineHeight: 1.4 }}>
              {TERM_BLURB[term]}, whether you are here or not. If it does not move your way, the contract expires worthless.
            </p>
          </div>

          {err && <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: DOWN, marginTop: 8 }}>{err}</p>}

          <button type="button" onClick={submit} disabled={busy || capped > doubloons}
            className="font-karla font-800"
            style={{ width: '100%', marginTop: 12, padding: '0.7rem', borderRadius: 11, fontSize: '0.82rem', cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(56,189,248,0.16)', border: '1px solid rgba(56,189,248,0.6)', color: '#e6f4ff',
              opacity: capped > doubloons ? 0.5 : 1 }}>
            {busy ? 'Opening…' : `Stake ${capped.toLocaleString()} ⟡ on ${dir === 'rise' ? 'Rise' : 'Fall'}`}
          </button>
          <button type="button" onClick={onClose} className="font-karla font-600"
            style={{ width: '100%', marginTop: 6, padding: '0.5rem', background: 'none', border: 'none', color: '#6a7482', fontSize: '0.7rem', cursor: 'pointer' }}>
            Never mind
          </button>
        </div>
      </motion.div>
    </PopupShell>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#6a7482', marginBottom: 5 }}>{children}</p>
  )
}
