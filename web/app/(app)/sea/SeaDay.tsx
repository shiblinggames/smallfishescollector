'use client'

// ── THE DAY, ON ONE DISC ────────────────────────────────────────────────────
//
// Kong: the dailies are hidden. Voyages at the Charterhouse, trawls at the
// fleet, bounties at the Posting House, the puzzles and the trivia inside the
// Tavern, and every one of them only tells you its state once you have gone
// to look; remembering to check the Mainland each day is the whole cost of
// playing them. The Daily Haul disc solved this for the login bonus and this
// is the same shape for everything else that resets: a disc beside the haul,
// a board with one row per daily, each carrying today's state and the one
// action that matters, and a breath on the ring only while something can be
// claimed or is waiting on you.
//
// ── IT OPENS THE REAL THING ─────────────────────────────────────────────────
//
// Kong chose "open it right there" over "set a course". The chart already
// mounts a sheet for each of the sea's dailies (the voyage board, the trawl
// dock, the orders and bounties on the level page, the Salt Road), so a row
// simply opens that sheet wherever the hull is. The two that are pages, the
// Chart Room and the Parlor, navigate; a page is a tap, not a sail. Claiming
// an order still wants the Tally House under you, as it always did, and the
// row says so rather than pretending otherwise.
//
// ── IT ASKS FOR ITS OWN STATE ───────────────────────────────────────────────
//
// One read on open (dayActions.dayState), not on mount: the chart already
// warms enough on arrival, and the counts here are for a board you opened.
// The disc's breath needs the state before that, so there is one read on
// mount too, cheap and once, and a re-read each time the board closes since
// the thing you did in the sheet is the thing that changes the row.
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import ResetCountdown from '@/components/ResetCountdown'
import { dayState, type DayState } from './dayActions'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

export type DayKind = 'orders' | 'voyage' | 'trawls' | 'bounties' | 'chart' | 'parlor' | 'finn'

type Row = {
  kind: DayKind
  title: string
  /** Where it happens, for the eye. */
  place: string
  status: string
  /** The one action; null when there is nothing to do today. */
  action: string | null
  /** Something is claimable or waiting on you right now. */
  hot: boolean
  /** Finished for today. */
  done: boolean
}

function rowsOf(s: DayState, ashore: boolean): Row[] {
  const rows: Row[] = []
  if (s.orders) {
    const o = s.orders
    rows.push({
      kind: 'orders', title: 'Today’s Orders', place: 'The Tally House',
      status: o.ready > 0 ? `${o.ready} to claim` : `${o.done} of ${o.total} done`,
      action: o.ready > 0 ? (ashore ? 'Claim' : 'Open') : o.done < o.total ? 'Open' : null,
      hot: o.ready > 0, done: o.done >= o.total && o.ready === 0,
    })
  }
  if (s.voyage) {
    const v = s.voyage
    rows.push({
      kind: 'voyage', title: 'The Voyage', place: 'The Charterhouse',
      status: v.state === 'ready' ? 'Back, and unclaimed'
        : v.state === 'at_sea' ? (v.endsAt ? `At sea, back in ${left(v.endsAt)}` : 'At sea')
        : 'Not sent today',
      action: v.state === 'ready' ? 'Reveal' : v.state === 'none' ? 'Send' : null,
      hot: v.state === 'ready', done: v.state === 'at_sea',
    })
  }
  if (s.trawls) {
    const t = s.trawls
    rows.push({
      kind: 'trawls', title: 'The Trawls', place: 'The Trawl Harbor',
      status: t.ready > 0 ? `${t.ready} haul${t.ready === 1 ? '' : 's'} waiting`
        : t.out > 0 ? `${t.out} of ${t.slots} out` : `None out, ${t.slots} slot${t.slots === 1 ? '' : 's'}`,
      action: t.ready > 0 ? 'Collect' : t.out < t.slots ? 'Send' : null,
      hot: t.ready > 0, done: t.ready === 0 && t.out >= t.slots,
    })
  }
  if (s.bounties) {
    const b = s.bounties
    rows.push({
      kind: 'bounties', title: 'Bounties', place: 'The Posting House',
      status: !b.unlocked ? 'Not open yet'
        : b.claimable > 0 ? `${b.claimable} to claim`
        : `${b.claimed} of ${b.total} claimed`,
      action: !b.unlocked ? null : b.claimable > 0 ? 'Claim' : b.claimed < b.total ? 'Open' : null,
      hot: b.unlocked && b.claimable > 0, done: b.unlocked && b.claimed >= b.total,
    })
  }
  if (s.chart) {
    const c = s.chart
    rows.push({
      kind: 'chart', title: 'The Chart Room', place: 'The Tavern, this week',
      status: `${c.solved} of ${c.total} puzzles solved`,
      action: c.solved < c.total ? 'Open' : null,
      hot: false, done: c.solved >= c.total,
    })
  }
  if (s.parlor) {
    const p = s.parlor
    rows.push({
      kind: 'parlor', title: 'The Parlor', place: 'The Tavern, tonight',
      status: p.boardPlayedToday ? (p.ladderDone ? 'Board played, ladder climbed' : 'Board played, ladder open')
        : 'Tonight’s board unplayed',
      action: p.boardPlayedToday && p.ladderDone ? null : 'Open',
      hot: false, done: p.boardPlayedToday && p.ladderDone,
    })
  }
  if (s.finn) {
    const f = s.finn
    rows.push({
      kind: 'finn', title: 'Finn’s Job', place: 'The Salt Road',
      status: f.ready ? 'Done. Hand it over.' : f.hasJob ? (f.label ?? 'A job open') : 'Nothing set',
      action: f.ready ? 'Open' : f.hasJob ? 'Open' : null,
      hot: f.ready, done: !f.hasJob,
    })
  }
  return rows
}

function left(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now())
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function SeaDay({ size, top, right, ashore, onOpen }: {
  size: number
  top: number
  right: number
  /** Standing at the Tally House, where orders can be claimed. */
  ashore: boolean
  /** Open the sheet, or the page, for one row. */
  onOpen: (kind: DayKind) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sea-overlay', { detail: { id: 'day', open } }))
  }, [open])
  const [state, setState] = useState<DayState | null>(null)
  const load = useCallback(() => {
    let alive = true
    void dayState().then(s => { if (alive && s) setState(s) }).catch(() => {})
    return () => { alive = false }
  }, [])
  useEffect(() => load(), [load])
  useEffect(() => { if (open) return load() }, [open, load])

  const rows = state ? rowsOf(state, ashore) : []
  const hot = rows.some(r => r.hot)
  const leftToday = rows.filter(r => !r.done).length

  return (
    <>
      <div data-no-steer onPointerDown={e => e.stopPropagation()}
        style={{ position: 'absolute', top, right, zIndex: 40 }}>
        <button type="button"
          aria-label={hot ? 'The day, something waiting' : 'The day'}
          title="The day"
          onClick={() => { vibrate(8); setOpen(true) }}
          style={{
            position: 'relative',
            width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: hot ? 'rgba(40,30,8,0.82)' : 'rgba(8,16,24,0.72)',
            border: `1px solid ${hot ? `${GOLD}88` : `${SEA},0.22)`}`,
            color: hot ? GOLD : `${SEA},0.72)`,
            backdropFilter: 'blur(2px)',
          }}>
          <AnimatePresence>
            {hot && (
              <motion.span aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.5, 1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `1px solid ${GOLD}` }} />
            )}
          </AnimatePresence>
          {/* A SUN OVER A HORIZON, drawn: the day. Same language as the discs
              beside it. */}
          <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 17h18" />
            <path d="M6 17a6 6 0 0 1 12 0" />
            <path d="M12 5v2M5.6 8.6l1.4 1.4M18.4 8.6L17 10M2.5 14h2M19.5 14h2" />
          </svg>
          {leftToday > 0 && !hot && (
            <span aria-hidden className="font-karla font-800" style={{
              position: 'absolute', right: -3, top: -3, minWidth: 15, height: 15, padding: '0 4px',
              borderRadius: 999, fontSize: '0.56rem', lineHeight: '15px', textAlign: 'center',
              background: 'rgba(8,16,24,0.95)', border: `1px solid ${SEA},0.4)`, color: `${SEA},0.85)`,
            }}>{leftToday}</span>
          )}
        </button>
      </div>

      <PopupShell open={open} onClose={() => setOpen(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
            background: 'rgba(8,12,18,0.98)', border: `1px solid ${GOLD}3a`,
            borderRadius: 18, padding: '1.1rem 1rem 1.2rem', boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
          }}>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close"
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 2, width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
              color: '#cdd3db', cursor: 'pointer', padding: 0,
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: GOLD, margin: 0 }}>
            The day
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8', margin: 0 }}>
              {leftToday === 0 && rows.length > 0 ? 'All done for today' : `${leftToday} thing${leftToday === 1 ? '' : 's'} left`}
            </p>
            <span className="font-karla" style={{ fontSize: '0.7rem', color: `${SEA},0.55)` }}>
              <ResetCountdown />
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {rows.length === 0 && (
              <p className="font-karla" style={{ fontSize: '0.82rem', color: `${SEA},0.55)`, margin: '0.4rem 0' }}>Reading the day…</p>
            )}
            {rows.map(r => (
              <button key={r.kind} type="button"
                onClick={() => { vibrate(6); setOpen(false); onOpen(r.kind) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '0.62rem 0.75rem', borderRadius: 12, cursor: 'pointer',
                  background: r.hot ? `${GOLD}12` : r.done ? 'rgba(123,191,123,0.07)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${r.hot ? `${GOLD}66` : r.done ? 'rgba(123,191,123,0.28)' : `${SEA},0.16)`}`,
                  opacity: r.done && !r.hot ? 0.78 : 1,
                }}>
                <span aria-hidden style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: r.hot ? GOLD : r.done ? '#7bbf7b' : 'transparent',
                  border: `1.5px solid ${r.hot ? GOLD : r.done ? '#7bbf7b' : `${SEA},0.45)`}`,
                  boxShadow: r.hot ? `0 0 8px ${GOLD}` : 'none',
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.92rem', color: '#f2ead8', lineHeight: 1.15 }}>{r.title}</span>
                  <span className="font-karla" style={{ display: 'block', fontSize: '0.74rem', color: r.hot ? '#f6dfa0' : `${SEA},0.7)`, marginTop: 2 }}>
                    {r.status}<span style={{ opacity: 0.5 }}> · {r.place}</span>
                  </span>
                </span>
                {r.action && (
                  <span className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{
                    flexShrink: 0, fontSize: '0.66rem', padding: '0.36rem 0.7rem', borderRadius: 9,
                    background: r.hot ? `${GOLD}22` : 'rgba(120,170,255,0.12)',
                    color: r.hot ? GOLD : '#bcd4ff',
                    border: `1px solid ${r.hot ? `${GOLD}88` : 'rgba(120,170,255,0.35)'}`,
                  }}>{r.action}</span>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      </PopupShell>
    </>
  )
}
