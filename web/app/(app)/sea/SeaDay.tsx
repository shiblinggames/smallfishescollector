'use client'

// ── THE DAY, ON ONE DISC ────────────────────────────────────────────────────
//
// Kong: the dailies are hidden. Voyages at the Charterhouse, trawls at the
// fleet, bounties at the Posting House, the puzzles and the trivia inside the
// Tavern, and every one of them only tells you its state once you have gone
// to look. The Daily Haul disc solved this for the login bonus; this is the
// same shape for everything else that resets.
//
// ── SEAMLESS, AND LOUD ONLY WHEN IT SHOULD BE ───────────────────────────────
//
// Kong, on the second pass: very seamless and easy to navigate, with very
// clear notifications. Five things answer that, and each fixed a real gap.
//
//   IT STAYS MOUNTED. The HUD hides whenever the rod is out, and this disc
//   used to be unmounted with it: every time you put the rod away it read
//   the whole day again from scratch and forgot what it had known. So the one
//   moment that matters most, an order completing while you fish, could never
//   be noticed as a CHANGE. It stays alive now and only its disc hides.
//
//   IT LEARNS WHEN THINGS COME BACK. A catch can finish an order or a bounty,
//   so a run of catches triggers one quiet re-read a few seconds after the
//   last. The voyage and the trawls finish on a clock, so the server says
//   when the next one lands and a single timer fires then. Coming back to the
//   tab and a trawl being collected elsewhere re-read too. No polling.
//
//   IT TELLS YOU. When something becomes claimable mid-session, a painted
//   toast drops in at the top: the plate, "Your voyage is back", tap to go
//   straight there. Held while the rod is out and shown when you put it away,
//   so it never lands on top of a reel. Never on the first read, because the
//   disc already says so and a greeting of four toasts is noise.
//
//   READY FIRST. The board is three sections, not one grid: what can be
//   claimed now, what is still to do today, and what is done, the last folded
//   down to a strip of small plates so the eye goes to what is left.
//
//   AND IT BRINGS YOU BACK. A card opens the real sheet; closing that sheet
//   brings the board back up, re-read, so the card you just finished is shown
//   finishing and the next one is one tap away. The map drives that, since it
//   owns the sheets; see the `sea-day-open` event.
//
// ── IT OPENS THE REAL THING ─────────────────────────────────────────────────
//
// Every row opens the sheet the sea already mounts for it, wherever the hull
// is, and the two that are pages navigate. Claiming an order still wants the
// Tally House under you, as it always did, and that row says Open, not Claim.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import ResetCountdown from '@/components/ResetCountdown'
import { dayState, type DayState } from './dayActions'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'
const DONE = '#7bbf7b'

export type DayKind = 'orders' | 'voyage' | 'trawls' | 'bounties' | 'chart' | 'parlor'

/**
 * ── THE PAINTING IS THE ROW ─────────────────────────────────────────────────
 *
 * Each daily carries the house's own painted plate of the place it happens:
 * the same building that stands on the island out there, which is what makes
 * the board read as the sea rather than a menu over it. Nothing new was drawn;
 * every plate already stands on the chart or hangs in the Tavern.
 */
const ART: Record<DayKind, string> = {
  orders: '/sea/harbour.png',
  voyage: '/sea/charterhouse.png',
  trawls: '/sea/trawl-shed.png',
  bounties: '/sea/posting-house.png',
  chart: '/sea/charting.png',
  parlor: '/sea/parlor.png',
}

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
  /** What the toast says when this row turns hot mid-session. */
  news: string | null
  /** For a row that is out of your hands rather than finished (a voyage at
   *  sea, every trawl out), the short wait shown on its done chip in place
   *  of a tick. A voyage at sea is not done; it is handled. */
  note?: string
}

function rowsOf(s: DayState, ashore: boolean): Row[] {
  const rows: Row[] = []
  if (s.orders) {
    const o = s.orders
    rows.push({
      kind: 'orders', title: 'Today’s Orders', place: 'The Tally House',
      status: o.ready > 0 ? `${o.ready} ready to claim` : `${o.done} of ${o.total} done`,
      action: o.ready > 0 ? (ashore ? 'Claim' : 'Open') : o.done < o.total ? 'Open' : null,
      hot: o.ready > 0, done: o.done >= o.total && o.ready === 0,
      news: o.ready > 0 ? (o.ready === 1 ? 'An order is done' : `${o.ready} orders are done`) : null,
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
      news: v.state === 'ready' ? 'Your voyage is back' : null,
      note: v.state === 'at_sea' && v.endsAt ? `back in ${left(v.endsAt)}` : undefined,
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
      news: t.ready > 0 ? (t.ready === 1 ? 'A trawl haul is in' : `${t.ready} trawl hauls are in`) : null,
      note: t.ready === 0 && t.out >= t.slots ? 'all out' : undefined,
    })
  }
  if (s.bounties) {
    const b = s.bounties
    rows.push({
      kind: 'bounties', title: 'Bounties', place: 'The Posting House',
      status: !b.unlocked ? 'Not open yet'
        : b.claimable > 0 ? `${b.claimable} ready to claim`
        : `${b.claimed} of ${b.total} claimed`,
      action: !b.unlocked ? null : b.claimable > 0 ? 'Claim' : b.claimed < b.total ? 'Open' : null,
      hot: b.unlocked && b.claimable > 0, done: b.unlocked && b.claimed >= b.total,
      news: b.unlocked && b.claimable > 0 ? (b.claimable === 1 ? 'A bounty is ready to claim' : `${b.claimable} bounties are ready to claim`) : null,
    })
  }
  if (s.chart) {
    const c = s.chart
    rows.push({
      kind: 'chart', title: 'The Chart Room', place: 'The Tavern, this week',
      status: `${c.solved} of ${c.total} puzzles solved`,
      action: c.solved < c.total ? 'Open' : null,
      hot: false, done: c.solved >= c.total, news: null,
    })
  }
  if (s.parlor) {
    const p = s.parlor
    rows.push({
      kind: 'parlor', title: 'The Parlor', place: 'The Tavern, tonight',
      status: p.boardPlayedToday ? (p.ladderDone ? 'Board played, ladder climbed' : 'Board played, ladder open')
        : 'Tonight’s board unplayed',
      action: p.boardPlayedToday && p.ladderDone ? null : 'Open',
      hot: false, done: p.boardPlayedToday && p.ladderDone, news: null,
    })
  }
  return rows
}

function left(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now())
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`
}

type Toast = { id: number; kinds: DayKind[]; text: string }

export default function SeaDay({ size, top, right, hidden, ashore, caughtTick, onOpen }: {
  size: number
  top: number
  right: number
  /** The HUD is down (rod out, a fight, arriving). The disc hides; the board
   *  keeps its state and holds any news until it is back. */
  hidden: boolean
  /** Standing at the Tally House, where orders can be claimed. */
  ashore: boolean
  /** Bumps on every catch. A catch can finish an order or a bounty. */
  caughtTick: number
  /** Open the sheet, or the page, for one row. */
  onOpen: (kind: DayKind) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sea-overlay', { detail: { id: 'day', open } }))
  }, [open])

  const [state, setState] = useState<DayState | null>(null)
  /** What was hot on the last read, to tell a change from a standing fact. */
  const hotBefore = useRef<Set<DayKind> | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  /** News that arrived while the HUD was down, shown when it comes back. */
  const held = useRef<Toast | null>(null)
  const toastId = useRef(0)
  const openRef = useRef(open)
  openRef.current = open
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const ashoreRef = useRef(ashore)
  ashoreRef.current = ashore

  const load = useCallback(() => {
    let alive = true
    void dayState().then(s => {
      if (!alive || !s) return
      setState(s)
      const rows = rowsOf(s, ashoreRef.current)
      const hotNow = new Set(rows.filter(r => r.hot).map(r => r.kind))
      const before = hotBefore.current
      hotBefore.current = hotNow
      // First read, or the board is open and you are looking at it: no toast.
      if (!before || openRef.current) return
      const fresh = rows.filter(r => r.hot && !before.has(r.kind) && r.news)
      if (fresh.length === 0) return
      const t: Toast = {
        id: ++toastId.current,
        kinds: fresh.map(r => r.kind),
        text: fresh.length === 1 ? fresh[0].news! : `${fresh.length} things are ready`,
      }
      if (hiddenRef.current) held.current = t
      else { setToast(t); vibrate([0, 14, 40, 18]) }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // ── WHEN TO READ ────────────────────────────────────────────────────────
  // On mount, and every time the board opens.
  useEffect(() => load(), [load])
  useEffect(() => { if (open) return load() }, [open, load])

  // After a run of catches, once, a few seconds after the last one.
  const firstTick = useRef(caughtTick)
  useEffect(() => {
    if (caughtTick === firstTick.current) return
    const id = setTimeout(() => load(), 3500)
    return () => clearTimeout(id)
  }, [caughtTick, load])

  // At the moment the next voyage or trawl is due back, and not before.
  useEffect(() => {
    const at = state?.nextAt
    if (!at) return
    const wait = Math.min(2_147_000_000, Math.max(1_000, at - Date.now() + 1_500))
    const id = setTimeout(() => load(), wait)
    return () => clearTimeout(id)
  }, [state?.nextAt, load])

  // Coming back to the tab after a while, and a trawl collected elsewhere.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    const onTrawls = () => load()
    const onOpenReq = () => setOpen(true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('trawls-changed', onTrawls)
    window.addEventListener('sea-day-open', onOpenReq)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('trawls-changed', onTrawls)
      window.removeEventListener('sea-day-open', onOpenReq)
    }
  }, [load])

  // Held news lands the moment the HUD is back.
  useEffect(() => {
    if (hidden || !held.current) return
    const t = held.current
    held.current = null
    setToast(t)
    vibrate([0, 14, 40, 18])
  }, [hidden])

  // A toast stays five seconds.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5_000)
    return () => clearTimeout(id)
  }, [toast])

  const rows = state ? rowsOf(state, ashore) : []
  const ready = rows.filter(r => r.hot)
  const todo = rows.filter(r => !r.hot && !r.done)
  const done = rows.filter(r => r.done && !r.hot)
  const readyN = ready.length
  const leftN = ready.length + todo.length

  const go = (kind: DayKind) => {
    vibrate(6)
    setOpen(false)
    setToast(null)
    onOpen(kind)
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      {/* ── THE DISC ─────────────────────────────────────────────────────
          A number that means something either way: gold for what can be
          claimed now, quiet for what is left today, nothing once the day is
          done. The ring breathes only for the gold. */}
      <div data-no-steer onPointerDown={e => e.stopPropagation()}
        style={{ position: 'absolute', top, right, zIndex: 40, display: hidden ? 'none' : 'block' }}>
        <button type="button"
          aria-label={readyN > 0 ? `The day, ${readyN} ready to claim` : leftN > 0 ? `The day, ${leftN} left` : 'The day, all done'}
          title="The day"
          onClick={() => { vibrate(8); setOpen(true) }}
          style={{
            position: 'relative',
            width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: readyN > 0 ? 'rgba(40,30,8,0.82)' : 'rgba(8,16,24,0.72)',
            border: `1px solid ${readyN > 0 ? `${GOLD}88` : `${SEA},0.22)`}`,
            color: readyN > 0 ? GOLD : `${SEA},0.72)`,
            backdropFilter: 'blur(2px)',
          }}>
          <AnimatePresence>
            {readyN > 0 && (
              <motion.span aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.5, 1] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `1px solid ${GOLD}` }} />
            )}
          </AnimatePresence>
          <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 17h18" />
            <path d="M6 17a6 6 0 0 1 12 0" />
            <path d="M12 5v2M5.6 8.6l1.4 1.4M18.4 8.6L17 10M2.5 14h2M19.5 14h2" />
          </svg>
          {(readyN > 0 || leftN > 0) && (
            <motion.span aria-hidden key={readyN > 0 ? `r${readyN}` : `l${leftN}`}
              initial={{ scale: 0.6 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 22 }}
              className="font-karla font-800" style={{
                position: 'absolute', right: -4, top: -4, minWidth: 17, height: 17, padding: '0 4px',
                borderRadius: 999, fontSize: '0.62rem', lineHeight: '15px', textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                background: readyN > 0 ? 'rgba(52,38,8,0.98)' : 'rgba(8,16,24,0.95)',
                border: `1px solid ${readyN > 0 ? GOLD : `${SEA},0.4)`}`,
                color: readyN > 0 ? GOLD : `${SEA},0.85)`,
                boxShadow: readyN > 0 ? `0 0 8px ${GOLD}66` : 'none',
              }}>{readyN > 0 ? readyN : leftN}</motion.span>
          )}
        </button>
      </div>

      {/* ── THE TOAST ────────────────────────────────────────────────────
          Portalled to the body: the chart carries transforms, and a fixed
          box inside a transformed ancestor is fixed to the ancestor. The
          strip lets touches through everywhere except the pill itself. */}
      {mounted && createPortal(
        <div aria-live="polite" style={{
          position: 'fixed', left: 0, right: 0,
          top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          display: 'flex', justifyContent: 'center', zIndex: 9300, pointerEvents: 'none',
          padding: '0 16px',
        }}>
          <AnimatePresence>
            {toast && (
              <motion.button key={toast.id} type="button"
                initial={{ opacity: 0, y: -18, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                onClick={() => {
                  if (toast.kinds.length === 1) go(toast.kinds[0])
                  else { setToast(null); vibrate(6); setOpen(true) }
                }}
                style={{
                  pointerEvents: 'auto', cursor: 'pointer', maxWidth: 420,
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.45rem 0.9rem 0.45rem 0.5rem',
                  background: 'linear-gradient(180deg, rgba(34,25,8,0.97) 0%, rgba(16,11,4,0.98) 100%)',
                  border: `1px solid ${GOLD}77`, borderRadius: 999,
                  boxShadow: `0 6px 28px rgba(0,0,0,0.5), 0 0 26px ${GOLD}26`,
                }}>
                <span style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ART[toast.kinds[0]]} alt="" style={{
                    maxWidth: 40, maxHeight: 40, objectFit: 'contain',
                    filter: `drop-shadow(0 0 7px ${GOLD}77)`,
                  }} />
                </span>
                <span style={{ textAlign: 'left', minWidth: 0 }}>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.9rem', color: '#f6e6c0', lineHeight: 1.15 }}>
                    {toast.text}
                  </span>
                  <span className="font-karla font-700 uppercase" style={{ display: 'block', fontSize: '0.54rem', letterSpacing: '0.14em', color: GOLD, marginTop: 2 }}>
                    {toast.kinds.length === 1 ? 'Tap to go there' : 'Tap to see the day'}
                  </span>
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>,
        document.body,
      )}

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

          {/* ── THE HEADLINE: what matters, in words, before any card ────── */}
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: GOLD, margin: 0 }}>
            The day
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8', margin: '2px 0 0', paddingRight: 36 }}>
            {!state ? 'Reading the day'
              : leftN === 0 ? 'All done for today'
              : readyN > 0 ? `${readyN} ready to claim`
              : `${leftN} thing${leftN === 1 ? '' : 's'} left`}
          </p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: `${SEA},0.55)`, margin: '3px 0 0' }}>
            {state && readyN > 0 && todo.length > 0 ? `${todo.length} more to do today · ` : ''}
            <ResetCountdown />
          </p>

          {!state && (
            <div style={gridStyle}>
              {[0, 1, 2, 3].map(i => (
                <motion.span key={i} aria-hidden
                  animate={{ opacity: [0.35, 0.6, 0.35] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                  style={{ height: 152, borderRadius: 14, background: 'rgba(255,255,255,0.035)', border: `1px solid ${SEA},0.12)` }} />
              ))}
            </div>
          )}

          {ready.length > 0 && (
            <>
              <SectionLabel color={GOLD}>Ready to claim</SectionLabel>
              <div style={gridStyle}>
                {ready.map(r => <DayCard key={r.kind} r={r} onGo={() => go(r.kind)} />)}
              </div>
            </>
          )}

          {todo.length > 0 && (
            <>
              <SectionLabel color={`${SEA},0.7)`}>To do today</SectionLabel>
              <div style={gridStyle}>
                {todo.map(r => <DayCard key={r.kind} r={r} onGo={() => go(r.kind)} />)}
              </div>
            </>
          )}

          {/* DONE, FOLDED DOWN. Still tappable, because "done" is sometimes
              "done, and I want to look", but a strip of small plates rather
              than full cards, so the eye goes to what is left. */}
          {done.length > 0 && (
            <>
              <SectionLabel color={DONE}>Done today</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {done.map(r => (
                  <button key={r.kind} type="button" onClick={() => go(r.kind)}
                    title={`${r.status} · ${r.place}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '0.3rem 0.65rem 0.3rem 0.35rem', borderRadius: 999, cursor: 'pointer',
                      background: 'rgba(123,191,123,0.07)', border: '1px solid rgba(123,191,123,0.26)',
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ART[r.kind]} alt="" style={{ width: 26, height: 26, objectFit: 'contain', opacity: 0.72 }} />
                    <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(226,238,226,0.8)' }}>{r.title}</span>
                    {r.note
                      ? <span className="font-karla" style={{ fontSize: '0.64rem', color: `${SEA},0.6)` }}>{r.note}</span>
                      : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={DONE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </button>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </PopupShell>
    </>
  )
}

const gridStyle: React.CSSProperties = {
  display: 'grid', gap: 8, marginTop: 6,
  gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
}

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color, margin: 0, whiteSpace: 'nowrap' }}>
        {children}
      </p>
      <span aria-hidden style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(180,214,232,0.18), transparent)' }} />
    </div>
  )
}

/** One daily, as a painted card. */
function DayCard({ r, onGo }: { r: Row; onGo: () => void }) {
  return (
    <button type="button" onClick={onGo}
      title={`${r.status} · ${r.place}`}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 2, padding: '0.6rem 0.5rem 0.55rem', borderRadius: 14, cursor: 'pointer',
        textAlign: 'center', minWidth: 0,
        background: r.hot
          ? `radial-gradient(ellipse 80% 70% at 50% 28%, ${GOLD}1c 0%, transparent 70%), rgba(40,30,8,0.42)`
          : 'rgba(255,255,255,0.035)',
        border: `1px solid ${r.hot ? `${GOLD}88` : `${SEA},0.16)`}`,
        boxShadow: r.hot ? `0 0 18px ${GOLD}22` : 'none',
      }}>
      {r.hot && (
        <motion.span aria-hidden
          animate={{ opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -1, borderRadius: 15, border: `1px solid ${GOLD}` }} />
      )}
      <span style={{ height: 74, display: 'grid', placeItems: 'center', width: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART[r.kind]} alt="" loading="lazy" decoding="async"
          style={{
            maxWidth: '100%', maxHeight: 74, objectFit: 'contain',
            filter: r.hot ? `drop-shadow(0 0 10px ${GOLD}66)` : 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
          }} />
      </span>
      <span className="font-cinzel font-700" style={{
        fontSize: '0.82rem', color: '#f2ead8', lineHeight: 1.15, marginTop: 4,
        width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{r.title}</span>
      <span className="font-karla" style={{
        fontSize: '0.68rem', lineHeight: 1.3, minHeight: '1.7em', width: '100%',
        color: r.hot ? '#f6dfa0' : `${SEA},0.62)`,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{r.status}</span>
      <span style={{ minHeight: 22, display: 'flex', alignItems: 'center', marginTop: 3 }}>
        {r.action && (
          <span className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{
            fontSize: '0.62rem', padding: '0.3rem 0.66rem', borderRadius: 999,
            background: r.hot ? `${GOLD}22` : 'rgba(120,170,255,0.12)',
            color: r.hot ? GOLD : '#bcd4ff',
            border: `1px solid ${r.hot ? `${GOLD}88` : 'rgba(120,170,255,0.32)'}`,
          }}>{r.action}</span>
        )}
      </span>
    </button>
  )
}
