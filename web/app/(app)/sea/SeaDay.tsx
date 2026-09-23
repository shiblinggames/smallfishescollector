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
//   IN GROUPS. Painted cards, two across on phone and monitor, in four fixed
//   groups (Kong): free today (the haul), orders of the day (fishing orders
//   and bounties), crew at sea (voyage and trawls, which run again whenever
//   they are back) and the Tavern. No overall "3 of 7": the crew group is not
//   a once-a-day chore, so one count over all of it measured nothing. Each
//   group says whether it has something ready or is done. No action pills;
//   the card is the button. Done is a full card wearing a stamped seal, and
//   a card that finished since you last looked gets it stamped on in front of
//   you. Everything done at once sparks off the headline.
//
//   AND IT BRINGS YOU BACK. A card opens the real sheet; closing that sheet
//   brings the board back up, re-read, so the card you just finished is shown
//   finishing and the next one is one tap away. The map drives that, since it
//   owns the sheets; see the `sea-day-open` event.
//
// ── IT OPENS THE REAL THING ─────────────────────────────────────────────────
//
// Every row opens the sheet the sea already mounts for it, wherever the hull
// is, and the two that are pages navigate. Orders and bounties are claimed
// right here, wherever the hull is (Kong, 2026-09-23: the Tally House rule,
// read anywhere and collect ashore, went, so the two lists side by side on
// this board behave the same). The server never checked where you were.
//
// ── EXCEPT THE ORDERS, WHICH LIVE HERE ──────────────────────────────────────
//
// Kong: Today's Orders comes out of the Fishing level sheet and exists only on
// this board. They were a folded row at the top of the level, which is where
// the level's numbers belong, and a daily is the board's business. So the
// orders row opens the orders IN the board, one step in with a way back, and
// mooring at the Tally House opens the board straight onto them (the map
// sends `sea-day-open` with `view: 'orders'`).
//
// THE DAILY HAUL, TOO (2026-09-23). Kong: fold it into the board. It was its
// own chest disc beside this one, the only other HUD disc that flashed for
// something that resets. It is the first row now (it is the one that expires
// at midnight) and opens one step in like the orders. The first voyage's
// bait beat lights this disc and that row (`data-coach="haul"`), and the
// haul is "shut" when the board is (`sea-overlay` id 'haul').
//
// AND THE VOYAGE AND THE TRAWLS (2026-09-23). Kong: land them like the other
// dailies. They were a window each, the voyage an 820px wall on a painted
// background and the trawls a sheet of their own. They open one step in now,
// in this frame and header, with their insides as they were (VoyageBoardBody,
// TrawlIndicator `embedded`). The voyage view is the one that widens: its
// routes lay out two across when there is room. Mooring at the Charterhouse
// and the Trawl Harbor opens the board on them.
//
// The Posting House's bounties followed the same week (Kong: same look, same
// way in). One step in, the same header, and mooring at the Posting House
// opens the board on them (`view: 'bounties'`). The old stand-alone bounty
// modal is gone from the sea.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import ResetCountdown from '@/components/ResetCountdown'
import { dayState, type DayState } from './dayActions'
import DailyOrders from '../trawl-docks/DailyOrders'
import BountiesPanel from '../expeditions/BountiesPanel'
import DailyHaul from '@/components/DailyHaul'
import dynamic from 'next/dynamic'
import TrawlIndicator from '../fishing/TrawlIndicator'

const VoyageBoardBody = dynamic(() => import('./VoyageBoard'), { ssr: false })
import { getDailyChallenge } from '../fishing/dailyChallengeActions'
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'
const DONE = '#7bbf7b'

export type DayKind = 'haul' | 'orders' | 'voyage' | 'trawls' | 'bounties' | 'chart' | 'parlor'

/**
 * ── THE PAINTING IS THE ROW ─────────────────────────────────────────────────
 *
 * Each daily carries the house's own painted plate of the place it happens:
 * the same building that stands on the island out there, which is what makes
 * the board read as the sea rather than a menu over it. Nothing new was drawn;
 * every plate already stands on the chart or hangs in the Tavern.
 */
const ART: Record<DayKind, string> = {
  haul: '/goldcrateclosed.png',
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

function rowsOf(s: DayState): Row[] {
  const rows: Row[] = []
  if (s.haul) {
    const h = s.haul
    const left = [!h.gemsClaimed && 'gems', !h.baitClaimed && 'bait', !h.crateClaimed && 'a crate'].filter(Boolean) as string[]
    rows.push({
      kind: 'haul', title: 'The Daily Haul', place: 'Free, every day',
      status: left.length === 0 ? 'All claimed'
        : left.length === 1 ? `${cap(left[0])} waiting`
        : `${cap(left.slice(0, -1).join(', '))} and ${left[left.length - 1]} waiting`,
      action: left.length > 0 ? 'Claim' : null,
      hot: left.length > 0, done: left.length === 0,
      news: left.length > 0 ? 'Your daily haul is in' : null,
    })
  }
  if (s.orders) {
    const o = s.orders
    rows.push({
      kind: 'orders', title: 'Today’s Orders', place: 'The Tally House',
      status: o.ready > 0 ? `${o.ready} ready to claim` : `${o.done} of ${o.total} done`,
      action: o.ready > 0 ? 'Claim' : o.done < o.total ? 'Open' : null,
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

/** The one-step-in header, per view. */
const VIEW_TITLE: Record<string, string> = {
  haul: 'The Daily Haul', orders: 'Today’s Orders', bounties: 'Bounties', voyage: 'The Voyage', trawls: 'The Trawls',
}

function cap(t: string): string { return t.charAt(0).toUpperCase() + t.slice(1) }

function left(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now())
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`
}

type Toast = { id: number; kinds: DayKind[]; text: string }

export default function SeaDay({ size, top, right, hidden, caughtTick, onOpen, seed, orders, onOrders, onClose }: {
  size: number
  top: number
  right: number
  /** The HUD is down (rod out, a fight, arriving). The disc hides; the board
   *  keeps its state and holds any news until it is back. */
  hidden: boolean
  /** Bumps on every catch. A catch can finish an order or a bounty. */
  caughtTick: number
  /** Open the sheet, or the page, for one row. */
  onOpen: (kind: DayKind) => void
  /** The FIRST read, from the chart's shared arrival call (see bootActions),
   *  so the board is not one more server action queued behind the rest.
   *  Null from it falls back to a read of its own. Later reads are the
   *  board's own. Read once, at mount. */
  seed?: () => Promise<DayState | null>
  /** The orders themselves, owned by the map (it reads them on arrival). */
  orders: DailyChallengeState | null
  /** A claim, or a fresh read, handed back up to the owner. */
  onOrders: (next: DailyChallengeState) => void
  /** The board shut. The map re-reads the bounty poll here. */
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  /** The whole board, or one step in on Today's Orders or the bounties. */
  const [view, setView] = useState<'board' | 'haul' | 'orders' | 'bounties' | 'voyage' | 'trawls'>('board')
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const close = useCallback(() => {
    setOpen(false)
    setView('board')
    onCloseRef.current?.()
  }, [])
  const onOrdersRef = useRef(onOrders)
  onOrdersRef.current = onOrders
  /** Step in on the orders, re-reading them so a catch a moment ago shows. */
  const showOrders = useCallback(() => {
    setView('orders')
    setOpen(true)
    void getDailyChallenge().then(s => { if (s) onOrdersRef.current(s) }).catch(() => {})
  }, [])
  /** Step in on the bounties. The panel reads its own board. */
  const showBounties = useCallback(() => {
    setView('bounties')
    setOpen(true)
  }, [])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sea-overlay', { detail: { id: 'day', open } }))
    // The first voyage's `haulShut` beat waits on this id: the haul is shut
    // when the board is, since the haul lives in it now.
    window.dispatchEvent(new CustomEvent('sea-overlay', { detail: { id: 'haul', open } }))
  }, [open])

  const [state, setState] = useState<DayState | null>(null)
  /** What was hot on the last read, to tell a change from a standing fact. */
  const hotBefore = useRef<Set<DayKind> | null>(null)
  /**
   * ── FINISHING SOMETHING IS AN EVENT ──────────────────────────────────────
   *
   * Kong: completing things on the board should feel satisfying. The board
   * re-reads on its own (catches, clocks, coming back to the tab, closing a
   * sheet), so it knows the moment a daily turns done, but the captain may
   * not be looking. `doneBefore` is what was done on the last read; anything
   * newly done joins `fresh`, and `fresh` is played as stamped seals the next
   * time the board itself is on screen, whenever that is. The first read of
   * a session stamps nothing: it is where the board starts, not news.
   */
  const doneBefore = useRef<Set<DayKind> | null>(null)
  const [fresh, setFresh] = useState<DayKind[]>([])
  /** The seals landing right now, in order. */
  const [stamping, setStamping] = useState<DayKind[]>([])
  /** Bumps when the last daily of the day is stamped in front of you. */
  const [cheer, setCheer] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  /** News that arrived while the HUD was down, shown when it comes back. */
  const held = useRef<Toast | null>(null)
  const toastId = useRef(0)
  const openRef = useRef(open)
  openRef.current = open
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden

  const load = useCallback((src?: () => Promise<DayState | null>) => {
    let alive = true
    const read = src ? src().then(s => s ?? dayState()) : dayState()
    void read.then(s => {
      if (!alive || !s) return
      setState(s)
      const rows = rowsOf(s)
      const doneNow = new Set(rows.filter(r => r.done && !r.hot).map(r => r.kind))
      const wasDone = doneBefore.current
      doneBefore.current = doneNow
      if (wasDone) {
        const newly = [...doneNow].filter(k => !wasDone.has(k))
        if (newly.length) setFresh(prev => [...prev, ...newly.filter(k => !prev.includes(k))])
      }
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
  const seedRef = useRef(seed)
  useEffect(() => load(seedRef.current), [load])
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
    const onOpenReq = (e: Event) => {
      const want = (e as CustomEvent<{ view?: string } | null>).detail?.view
      if (want === 'orders') showOrders()
      else if (want === 'bounties') showBounties()
      else if (want === 'voyage' || want === 'trawls' || want === 'haul') { setView(want); setOpen(true) }
      else setOpen(true)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('trawls-changed', onTrawls)
    window.addEventListener('sea-day-open', onOpenReq)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('trawls-changed', onTrawls)
      window.removeEventListener('sea-day-open', onOpenReq)
    }
  }, [load, showOrders, showBounties])

  // THE SEALS LAND when the board itself is on screen: a beat after it opens
  // (or after coming back from one step in), so the eye is there first.
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    if (!open || view !== 'board' || fresh.length === 0) return
    const kinds = fresh
    const t = setTimeout(() => {
      setFresh([])
      setStamping(kinds)
      vibrate([0, 22, 60, 30])
      const s = stateRef.current
      const all = !!s && rowsOf(s).every(r => r.done && !r.hot)
      if (all) {
        window.setTimeout(() => { setCheer(c => c + 1); vibrate([0, 30, 50, 40, 50, 90]) },
          (0.55 + kinds.length * STAMP_GAP) * 1000)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [open, view, fresh])
  useEffect(() => {
    if (stamping.length === 0) return
    const t = setTimeout(() => setStamping([]), 1400 + stamping.length * STAMP_GAP * 1000)
    return () => clearTimeout(t)
  }, [stamping])

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

  const rows = state ? rowsOf(state) : []
  const ready = rows.filter(r => r.hot)
  const todo = rows.filter(r => !r.hot && !r.done)
  const done = rows.filter(r => r.done && !r.hot)
  const readyN = ready.length
  const doneN = done.length
  const leftN = ready.length + todo.length

  const go = (kind: DayKind) => {
    vibrate(6)
    setToast(null)
    if (kind === 'haul' || kind === 'voyage' || kind === 'trawls') { setView(kind); setOpen(true); return }
    if (kind === 'orders') { showOrders(); return }
    if (kind === 'bounties') { showBounties(); return }
    setOpen(false)
    setView('board')
    onOpen(kind)
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  /** A phone. Rows instead of cards below this width. */
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 560px)')
    const set = () => setNarrow(mq.matches)
    set()
    mq.addEventListener('change', set)
    return () => mq.removeEventListener('change', set)
  }, [])

  return (
    <>
      {/* ── THE DISC ─────────────────────────────────────────────────────
          A number that means something either way: gold for what can be
          claimed now, quiet for what is left today, nothing once the day is
          done. The ring breathes only for the gold. */}
      <div data-no-steer onPointerDown={e => e.stopPropagation()}
        style={{ position: 'absolute', top, right, zIndex: 40, display: hidden ? 'none' : 'block' }}>
        <button type="button"
          // Named so the first voyage's bait beat can light it: the Daily
          // Haul, where the free worms are, is inside.
          data-coach="haul"
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

      <PopupShell open={open} onClose={close}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative', margin: 'auto', width: '100%', maxWidth: view === 'voyage' ? 820 : 'var(--modal-w)',
            background: 'rgba(8,12,18,0.98)', border: `1px solid ${GOLD}3a`,
            borderRadius: 18, boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
            padding: narrow ? '0.8rem 0.75rem 0.85rem' : '1.05rem 1rem 1.15rem',
          }}>
          <button type="button" onClick={close} aria-label="Close" data-coach="haul-close"
            style={{
              position: 'absolute', top: narrow ? 8 : 10, right: narrow ? 8 : 10, zIndex: 2, width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
              color: '#cdd3db', cursor: 'pointer', padding: 0,
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>

          {view !== 'board' ? (
            <>
              {/* ── ONE STEP IN: TODAY'S ORDERS, OR THE BOUNTIES ──────────────
                  Back goes to the board, not off it; the header is the same
                  single line the board wears, with the place's own plate. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 36, minHeight: 30 }}>
                <button type="button" onClick={() => { vibrate(6); setView('board'); load() }} aria-label="Back to the day"
                  style={{
                    width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                    color: '#cdd3db', cursor: 'pointer', padding: 0,
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ART[view]} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
                <p className="font-cinzel font-700" style={{ fontSize: narrow ? '1.02rem' : '1.15rem', color: '#f4ecd8', margin: 0, lineHeight: 1.25 }}>
                  {VIEW_TITLE[view]}
                </p>
              </div>
              <div style={{ marginTop: 6 }}>
                {view === 'voyage' ? <VoyageBoardBody />
                : view === 'trawls' ? <TrawlIndicator variant="embedded" canDeploy />
                : view === 'haul' ? (state?.haul
                  ? <DailyHaul embedded isPremium={state.haul.isPremium}
                      gemsClaimed={state.haul.gemsClaimed} baitClaimed={state.haul.baitClaimed}
                      crateClaimed={state.haul.crateClaimed} onClaimed={() => load()} />
                  : <p className="font-karla" style={{ fontSize: '0.8rem', color: `${SEA},0.6)`, margin: '10px 0 4px' }}>Counting the haul&hellip;</p>)
                : view === 'bounties' ? <BountiesPanel embedded onClose={close} /> : orders
                  ? <DailyOrders embedded initial={orders}
                      onChange={next => { onOrdersRef.current(next); load() }} />
                  : <p className="font-karla" style={{ fontSize: '0.8rem', color: `${SEA},0.6)`, margin: '10px 0 4px' }}>Reading the orders&hellip;</p>}
              </div>
            </>
          ) : (<>
          {/* ── THE HEADER ────────────────────────────────────────────────
              What is waiting on you, and when the day turns. No "3 of 7":
              Kong, the voyage and the trawls are not once-a-day chores (they
              run again whenever they are back), so a single count over all
              of it measured nothing. The groups below say how each part of
              the day stands instead. */}
          <div style={{ position: 'relative', paddingRight: 36 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, rowGap: 0, minHeight: 30 }}>
              <motion.p className="font-cinzel font-700"
                key={cheer}
                initial={cheer ? { scale: 0.92 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 14 }}
                style={{
                  fontSize: narrow ? '1.02rem' : '1.15rem', margin: 0, lineHeight: 1.25, transformOrigin: 'left center',
                  color: readyN > 0 ? '#f6e3a6' : state && leftN === 0 ? '#cfeccf' : '#f4ecd8',
                }}>
                {!state ? 'Reading the day'
                  : readyN > 0 ? `${readyN} ready to claim`
                  : leftN === 0 ? 'All done for today'
                  : 'The day'}
              </motion.p>
              <span className="font-karla" style={{ fontSize: '0.66rem', color: `${SEA},0.5)` }}>
                <ResetCountdown />
              </span>
            </div>
            {/* THE LAST ONE. Sparks off the headline, once, when the day
                closes out in front of you. Local to the header. */}
            <AnimatePresence>
              {cheer > 0 && (
                <motion.span key={`burst${cheer}`} aria-hidden initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 1.3 }}
                  style={{ position: 'absolute', left: 60, top: 14, width: 0, height: 0, pointerEvents: 'none' }}>
                  {Array.from({ length: 14 }).map((_, k) => {
                    const a = (k / 14) * Math.PI * 2
                    return (
                      <motion.span key={k}
                        initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                        animate={{ x: Math.cos(a) * 70, y: Math.sin(a) * 34, scale: 0.3, opacity: 0 }}
                        transition={{ duration: 0.9, ease: 'easeOut' }}
                        style={{ position: 'absolute', width: 5, height: 5, borderRadius: '50%', background: GOLD, boxShadow: `0 0 6px ${GOLD}` }} />
                    )
                  })}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* ── THE CARDS, IN THE GROUPS THEY BELONG TO ────────────────────
              Kong: logical groupings. What is free today, the day's orders
              (the fishing orders and the bounties), the crew at sea (the
              voyage and the trawls, which run again whenever they are back),
              and the Tavern's puzzles and trivia. A fixed order, so each
              thing is always where you left it; the gold says what is
              waiting and the seal says what is finished. No action pills on
              the cards: the card is the button. */}
          {!state ? (
            <div style={{ ...gridStyle, marginTop: 12 }}>
              {[0, 1, 2, 3].map(i => (
                <motion.span key={i} aria-hidden
                  animate={{ opacity: [0.35, 0.6, 0.35] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                  style={{ height: narrow ? 118 : 136, borderRadius: 14, background: 'rgba(255,255,255,0.035)', border: `1px solid ${SEA},0.12)` }} />
              ))}
            </div>
          ) : GROUPS.map(g => {
            const cards = g.kinds.map(k => rows.find(r => r.kind === k)).filter((r): r is Row => !!r)
            if (cards.length === 0) return null
            const hotN = cards.filter(r => r.hot).length
            const allDone = cards.every(r => r.done && !r.hot)
            return (
              <section key={g.id} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                  <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: `${SEA},0.55)` }}>
                    {g.label}
                  </span>
                  {hotN > 0 ? (
                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: GOLD }}>
                      {hotN} ready
                    </span>
                  ) : allDone && (
                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: DONE, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={DONE} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      {g.doneWord}
                    </span>
                  )}
                </div>
                <div style={gridStyle}>
                  {cards.map(r => (
                    <DayCard key={r.kind} r={r} compact={narrow} wide={cards.length === 1}
                      onGo={() => go(r.kind)} stampAt={stamping.indexOf(r.kind)} />
                  ))}
                </div>
              </section>
            )
          })}
          </>)}
        </motion.div>
      </PopupShell>
    </>
  )
}

/** Seconds between two seals when several land on one opening. */
const STAMP_GAP = 0.2

/** Two across, phone and monitor alike: every group but the haul is a pair. */
const gridStyle: React.CSSProperties = {
  display: 'grid', gap: 7, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}

/** The board's groups, in a fixed order so each thing is always where it was.
 *  Kong: bounties with the fishing orders, the voyage with the trawls. */
const GROUPS: { id: string; label: string; doneWord: string; kinds: DayKind[] }[] = [
  { id: 'free', label: 'Free today', doneWord: 'Claimed', kinds: ['haul'] },
  { id: 'orders', label: 'Orders of the day', doneWord: 'All done', kinds: ['orders', 'bounties'] },
  { id: 'crew', label: 'Crew at sea', doneWord: 'All out', kinds: ['voyage', 'trawls'] },
  { id: 'tavern', label: 'The Tavern', doneWord: 'All done', kinds: ['chart', 'parlor'] },
]

/**
 * ── THE SEAL ────────────────────────────────────────────────────────────────
 *
 * What a finished daily wears: a green wax seal with a tick, pressed on at a
 * tilt in the card's corner. Static on a card that was done before you
 * looked. On one that finished since, it is STAMPED: it drops in large and
 * lands with a spring, the card gives under it, a ring and a spray of sparks
 * come off the impact and the card glows once. Transform and opacity only,
 * and nothing is clipped, so it costs nothing on the water behind it.
 */
function Seal({ size, stamp, delay }: { size: number; stamp: boolean; delay: number }) {
  return (
    <span aria-hidden style={{ position: 'absolute', top: 5, right: 5, width: size, height: size, zIndex: 2 }}>
      {stamp && (
        <>
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 2.1], opacity: [0, 0.7, 0] }}
            transition={{ duration: 0.6, delay: delay + 0.14, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${DONE}` }} />
          {Array.from({ length: 10 }).map((_, k) => {
            const a = (k / 10) * Math.PI * 2 + 0.3
            return (
              <motion.span key={k}
                initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
                animate={{ x: Math.cos(a) * size * 1.25, y: Math.sin(a) * size * 1.25, opacity: [0, 1, 0], scale: 0.4 }}
                transition={{ duration: 0.65, delay: delay + 0.14, ease: 'easeOut' }}
                style={{
                  position: 'absolute', left: size / 2 - 2.5, top: size / 2 - 2.5, width: 5, height: 5, borderRadius: '50%',
                  background: k % 2 ? GOLD : '#b8f0b8', boxShadow: `0 0 6px ${k % 2 ? GOLD : DONE}`,
                }} />
            )
          })}
        </>
      )}
      <motion.span
        initial={stamp ? { scale: 2.3, opacity: 0, rotate: -34 } : false}
        animate={{ scale: 1, opacity: 1, rotate: -12 }}
        transition={stamp ? { type: 'spring', stiffness: 560, damping: 17, delay } : { duration: 0 }}
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 38% 32%, #5aa865 0%, #2f6b3a 58%, #1f4a28 100%)',
          border: '1.5px solid rgba(200,245,200,0.55)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.55), inset 0 0 0 3px rgba(20,50,26,0.55), inset 0 0 0 4px rgba(200,245,200,0.18)',
        }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#eaf8e4"
          strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5"
            initial={stamp ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.3, delay: delay + 0.2, ease: 'easeOut' }} />
        </svg>
      </motion.span>
    </span>
  )
}

/** One daily, as a painted card. The same card on a phone and a monitor, a
 *  size smaller on the phone. `wide` is a group of one (the Daily Haul): the
 *  plate sits beside the words instead of above them, across the full row.
 *  `stampAt` is this card's place in the run of seals landing now, or -1.
 *
 *  No action pill. Kong: "Open" and "Send" were not needed and cost a line on
 *  every card; the card is the button, gold says it is waiting, and the seal
 *  says it is finished. */
function DayCard({ r, onGo, compact, wide, stampAt }: { r: Row; onGo: () => void; compact: boolean; wide: boolean; stampAt: number }) {
  const finished = r.done && !r.hot
  const stamp = stampAt >= 0
  const delay = 0.12 + Math.max(0, stampAt) * STAMP_GAP
  const plate = wide ? (compact ? 52 : 60) : compact ? 56 : 70
  return (
    <motion.button type="button" onClick={onGo} layout
      data-coach={r.kind === 'haul' ? 'haul' : undefined}
      title={`${r.status} · ${r.place}`}
      animate={stamp ? { scale: [1, 1, 0.955, 1.02, 1] } : { scale: 1 }}
      transition={stamp
        ? { scale: { duration: 0.5, delay, times: [0, 0.2, 0.45, 0.75, 1] }, layout: { type: 'spring', stiffness: 380, damping: 32 } }
        : { layout: { type: 'spring', stiffness: 380, damping: 32 } }}
      style={{
        position: 'relative', display: 'flex',
        flexDirection: wide ? 'row' : 'column', alignItems: 'center',
        gap: wide ? 12 : 2,
        gridColumn: wide ? '1 / -1' : undefined,
        padding: wide ? '0.5rem 3rem 0.5rem 0.6rem' : compact ? '0.5rem 0.45rem 0.55rem' : '0.6rem 0.5rem 0.6rem',
        borderRadius: 14, cursor: 'pointer',
        textAlign: wide ? 'left' : 'center', minWidth: 0,
        background: r.hot
          ? `radial-gradient(ellipse 80% 70% at ${wide ? '15% 50%' : '50% 28%'}, ${GOLD}1c 0%, transparent 70%), rgba(40,30,8,0.42)`
          : finished
            ? `radial-gradient(ellipse 80% 70% at ${wide ? '15% 50%' : '50% 28%'}, rgba(123,191,123,0.13) 0%, transparent 70%), rgba(18,30,20,0.55)`
            : 'rgba(255,255,255,0.035)',
        border: `1px solid ${r.hot ? `${GOLD}88` : finished ? 'rgba(123,191,123,0.4)' : `${SEA},0.16)`}`,
        boxShadow: r.hot ? `0 0 18px ${GOLD}22` : 'none',
      }}>
      {r.hot && (
        <motion.span aria-hidden
          animate={{ opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -1, borderRadius: 15, border: `1px solid ${GOLD}` }} />
      )}
      {/* The card lights once as the seal lands. */}
      {stamp && (
        <motion.span aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{ duration: 0.7, delay: delay + 0.12 }}
          style={{
            position: 'absolute', inset: -1, borderRadius: 15, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 70% 20%, rgba(168,230,168,0.45), transparent 70%)',
            border: `1px solid ${DONE}`,
          }} />
      )}
      {finished && <Seal size={compact ? 28 : 32} stamp={stamp} delay={delay} />}
      <span style={{ height: plate, width: wide ? plate * 1.25 : '100%', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART[r.kind]} alt="" loading="lazy" decoding="async"
          style={{
            maxWidth: '100%', maxHeight: plate, objectFit: 'contain',
            filter: r.hot ? `drop-shadow(0 0 10px ${GOLD}66)` : 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
          }} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: wide ? undefined : '100%', flex: wide ? 1 : undefined }}>
        <span className="font-cinzel font-700" style={{
          fontSize: compact ? '0.76rem' : '0.82rem', color: '#f2ead8', lineHeight: 1.15, marginTop: wide ? 0 : 4,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{r.title}</span>
        <span className="font-karla" style={{
          fontSize: compact ? '0.64rem' : '0.68rem', lineHeight: 1.3, marginTop: 2,
          minHeight: wide ? undefined : '2.6em',
          color: r.hot ? '#f6dfa0' : finished ? 'rgba(196,232,196,0.72)' : `${SEA},0.62)`,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{finished && r.note ? `Out, ${r.note}` : r.status}</span>
      </span>
    </motion.button>
  )
}
