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
import DailyOrders from '../trawl-docks/DailyOrders'
import BountiesPanel from '../expeditions/BountiesPanel'
import DailyHaul from '@/components/DailyHaul'
import dynamic from 'next/dynamic'
import TrawlIndicator from '../fishing/TrawlIndicator'

const VoyageBoardBody = dynamic(() => import('./VoyageBoard'), { ssr: false })
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import { vibrate } from '@/lib/haptics'
import { seaClock, nextPhase, PHASE_LABEL, type SeaPhase } from '@/lib/seaClock'
import { api } from '@/lib/gameApi'
import type { DayState } from '@/lib/gameApi'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'
const DONE = '#7bbf7b'

export type DayKind = 'haul' | 'recruits' | 'orders' | 'voyage' | 'trawls' | 'bounties' | 'chart' | 'parlor'

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
  // Not drawn: the Recruits card shows today's three faces instead.
  recruits: '/crew/hall_1.png',
  orders: '/sea/tally-house-v2.webp',
  voyage: '/sea/charterhouse-v2.webp',
  trawls: '/sea/trawl-harbor-v3.webp',
  bounties: '/sea/posting-house-v3.webp',
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
  /**
   * OUT OF YOUR HANDS, NOT FINISHED: a voyage at sea, every trawl out. Kong: a
   * tick on those made no sense, they are still going and they run again when
   * they are back. So they are not `done` (no seal, no stamp, no tick on the
   * group) and not left to do either (they do not keep the day open). The
   * card just says when they are back.
   */
  away?: boolean
  /** The Recruits card draws today's faces where the others draw a building. */
  faces?: { rarity: number; name: string; art: string; recruited: boolean }[]
  /** How far through, for the row's bar: [done, of]. */
  prog?: [number, number]
  /** A clock running, for the crew tiles' bar: epoch ms. */
  timer?: { from: number; to: number } | null
}

/** Rarity rims for the Recruits card, the crew screen's own colours. */
const RARITY_RIM: Record<number, string> = { 1: '#9aa4ad', 2: '#60a5fa', 3: '#c084fc', 4: '#f0c040' }

function rowsOf(s: DayState, recruitsSeen = false): Row[] {
  const rows: Row[] = []
  // ── TODAY'S RECRUITS (2026-09-26) ─────────────────────────────────────────
  // Kong: players needed a better nudge to look at the recruit board. The only
  // tell was a dot on the crew disc, which lives on the expedition side only.
  // This card is on both sides, shows the three faces themselves, and is HOT
  // only when there is an Epic on the board you have not looked at yet (about
  // one day in sixteen: FREE_WEIGHTS has 2% Epic a face and no Legendary at
  // all). Rares are just a blue rim; lit for them it would be lit nearly every
  // day and mean nothing. Once you have looked, it goes quiet for the day.
  if (s.recruits && s.recruits.faces.length > 0) {
    const f = s.recruits.faces
    const left = f.filter(x => !x.recruited)
    const signed = f.length - left.length
    const epic = left.some(x => x.rarity >= 3)
    rows.push({
      kind: 'recruits', title: 'The Recruits', place: 'Your crew panel',
      status: left.length === 0 ? 'Board signed out'
        : epic && !recruitsSeen ? 'An Epic is on the board'
        : signed > 0 ? `Signed ${signed} today`
        : recruitsSeen ? 'Looked over today'
        : `${left.length} new faces today`,
      action: left.length > 0 ? 'Look' : null,
      hot: epic && !recruitsSeen && !s.list.recruitsSeen,
      // LOOKED AT IS DONE (Kong, 2026-09-27: the day board is a list you
      // tick). The server remembers the look for the day; see /api/day.
      done: left.length === 0 || recruitsSeen || s.list.recruitsSeen,
      prog: [signed, f.length],
      news: epic && !recruitsSeen ? 'An Epic is on the recruit board' : null,
      faces: f,
    })
  }
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
      prog: [3 - left.length, 3],
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
      prog: [o.done, o.total],
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
      hot: v.state === 'ready', done: false, away: v.state === 'at_sea',
      timer: v.state === 'at_sea' && v.endsAt && v.startsAt ? { from: v.startsAt, to: v.endsAt } : null,
      news: v.state === 'ready' ? 'Your voyage is back' : null,
    })
  }
  if (s.trawls) {
    const t = s.trawls
    rows.push({
      kind: 'trawls', title: 'The Trawls', place: 'The Trawl Harbor',
      // THE FIRST ONE BACK, like the voyage's "back in". Kong: the trawls
      // should say when the next crew is home, not only how many are out.
      status: t.ready > 0 ? `${t.ready} haul${t.ready === 1 ? '' : 's'} waiting`
        : t.out > 0 ? `${t.out >= t.slots ? 'All out' : `${t.out} of ${t.slots} out`}${t.nextBack ? `, first back in ${left(t.nextBack)}` : ''}`
        : `None out, ${t.slots} slot${t.slots === 1 ? '' : 's'}`,
      action: t.ready > 0 ? 'Collect' : t.out < t.slots ? 'Send' : null,
      hot: t.ready > 0, done: false, away: t.ready === 0 && t.out >= t.slots,
      prog: [t.out, t.slots],
      news: t.ready > 0 ? (t.ready === 1 ? 'A trawl haul is in' : `${t.ready} trawl hauls are in`) : null,
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
      prog: b.unlocked ? [b.claimed, b.total] : undefined,
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
      prog: [c.solved, c.total],
    })
  }
  if (s.parlor) {
    const p = s.parlor
    rows.push({
      kind: 'parlor', title: 'The Parlor', place: 'The Tavern, tonight',
      status: p.boardPlayedToday ? (p.ladderDone ? 'Board played, ladder climbed' : 'Board played. The ladder is open this week')
        : 'Tonight’s board unplayed',
      action: p.boardPlayedToday && p.ladderDone ? null : 'Open',
      // TONIGHT'S BOARD is the daily; the ladder is a weekly climb.
      hot: false, done: p.boardPlayedToday, news: null,
    })
  }
  return rows
}

/** The one-step-in header, per view. */
const VIEW_TITLE: Record<string, string> = {
  haul: 'The Daily Haul', orders: 'Today’s Orders', bounties: 'Bounties', voyage: 'The Voyage', trawls: 'The Trawls',
}

/** What the next moment is called, for "Nightfall in 6m". */
const NEXT_WORD: Record<SeaPhase, string> = { dusk: 'Sunset', night: 'Nightfall', dawn: 'First light', day: 'Full day' }

/** The disc's colour by the hour, when nothing is waiting on a claim. */
const PHASE_TINT: Record<SeaPhase, string> = {
  day: '#f3d88a',
  dusk: '#f0a268',
  night: '#b9cdf2',
  dawn: '#f2b4a8',
}

/**
 * THE HOUR AS A DRAWN MARK, in the disc's own line style. Day is the whole
 * sun; dusk the sun half down behind the horizon with the light going; night
 * a crescent and a star; dawn the sun half up, rising.
 */
function PhaseGlyph({ phase, px }: { phase: SeaPhase; px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {phase === 'day' && (<>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
      </>)}
      {phase === 'dusk' && (<>
        <path d="M3 16.5h18" />
        <path d="M7 16.5a5 5 0 0 1 10 0" />
        <path d="M12 7.5v2M6.3 10.4l1.2 1.2M17.7 10.4l-1.2 1.2" />
        <path d="M9.5 20h5M12 3.2v2.2M10.6 4.2L12 5.6l1.4-1.4" />
      </>)}
      {phase === 'night' && (<>
        <path d="M19.5 14.2A7.6 7.6 0 1 1 9.8 4.5a6 6 0 0 0 9.7 9.7z" />
        <path d="M17.2 3.6v2.4M16 4.8h2.4" />
      </>)}
      {phase === 'dawn' && (<>
        <path d="M3 16.5h18" />
        <path d="M7 16.5a5 5 0 0 1 10 0" />
        <path d="M12 7.5v2M6.3 10.4l1.2 1.2M17.7 10.4l-1.2 1.2" />
        <path d="M9.5 20h5M12 5.6V3.2M10.6 4.6L12 3.2l1.4 1.4" />
      </>)}
    </svg>
  )
}

/** "6m", "1h 12m": the time until the next moment of the day. */
function fmtShort(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

function cap(t: string): string { return t.charAt(0).toUpperCase() + t.slice(1) }

function left(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now())
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`
}

/**
 * A notice. The day board's own carry `kinds` (tap opens that row); one raised
 * from elsewhere on the chart (`sea-toast`, 2026-09-27) carries a `target`
 * the map opens instead (see SeaMap's `sea-toast-open`), and its own picture.
 */
type Toast = {
  id: number; kinds: DayKind[]; text: string
  target?: string; art?: string | null; glyph?: 'friends' | 'folk'
}
/** What `sea-toast` carries. */
export type SeaToast = { text: string; target: string; art?: string | null; glyph?: 'friends' | 'folk' }

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
  /**
   * ── THE HOUR ON THE DISC ────────────────────────────────────────────────
   *
   * Kong: the disc should show the day cycle, sun, setting sun, moon and so
   * on, and the board's heading should say the moment rather than "The day".
   * The same clock the sea's light runs on (lib/seaClock), read every fifteen
   * seconds, which is plenty for a phase that lasts minutes.
   */
  const [phase, setPhase] = useState<SeaPhase>(() => seaClock().phase)
  const [phaseNext, setPhaseNext] = useState(() => nextPhase())
  useEffect(() => {
    const tick = () => { setPhase(seaClock().phase); setPhaseNext(nextPhase()) }
    tick()
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [])
  // THE "BACK IN" TIMERS MOVE while the board is open. They are worked out at
  // render, so without this a voyage said "back in 2h 5m" for as long as you
  // looked at it. Once every twenty seconds is plenty for minutes.
  const [, setClock] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setClock(c => c + 1), 20_000)
    return () => window.clearInterval(id)
  }, [open])
  /** The whole board, or one step in on Today's Orders or the bounties. */
  const [view, setView] = useState<'board' | 'haul' | 'orders' | 'bounties' | 'voyage' | 'trawls'>('board')
  /** The recruit board has been looked at this session (the crew panel opened
   *  on Recruit). Session-only, like the crew disc's dot: tomorrow's board
   *  should be told again. */
  const [recruitsSeen, setRecruitsSeen] = useState(false)
  const recruitsSeenRef = useRef(false)
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ section?: string | null }>).detail?.section === 'recruits') {
        if (!recruitsSeenRef.current) void fetch('/api/day', { method: 'POST' }).catch(() => {})
        recruitsSeenRef.current = true
        setRecruitsSeen(true)
      }
    }
    window.addEventListener('crew-hub-section', on)
    return () => window.removeEventListener('crew-hub-section', on)
  }, [])
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
    void api.dailies.getDailyChallenge().then(s => { if (s) onOrdersRef.current(s) }).catch(() => {})
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
  // And whether the haul itself is showing, one step in: the first voyage's
  // `haulView` beat waits on it.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sea-overlay', { detail: { id: 'haulView', open: open && view === 'haul' } }))
  }, [open, view])

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
    const read = src ? src().then(s => s ?? api.sea.dayState()) : api.sea.dayState()
    void read.then(s => {
      if (!alive || !s) return
      setState(s)
      const rows = rowsOf(s, recruitsSeenRef.current)
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
    // The chart's island marks are due at the same moment (see SeaMap).
    const id = setTimeout(() => { load(); window.dispatchEvent(new CustomEvent('sea-due')) }, wait)
    return () => clearTimeout(id)
  }, [state?.nextAt, load])

  // Coming back to the tab after a while, and a trawl collected elsewhere.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    const onTrawls = () => load()
    const onFight = () => load()
    const onOpenReq = (e: Event) => {
      const want = (e as CustomEvent<{ view?: string } | null>).detail?.view
      if (want === 'orders') showOrders()
      else if (want === 'bounties') showBounties()
      else if (want === 'voyage' || want === 'trawls' || want === 'haul') { setView(want); setOpen(true) }
      else setOpen(true)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('trawls-changed', onTrawls)
    window.addEventListener('sea-fight-ended', onFight)
    window.addEventListener('sea-day-open', onOpenReq)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('trawls-changed', onTrawls)
      window.removeEventListener('sea-fight-ended', onFight)
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
      // A ting per tick, a beat apart, as each seal lands.
      kinds.forEach((_, i) => window.setTimeout(() => { void import('@/lib/fishingMusic').then(m => m.playRenownPointSfx()).catch(() => {}) }, (0.14 + i * STAMP_GAP) * 1000))
      const all = !!s && rowsOf(s, recruitsSeenRef.current)
        .filter(r => LIST.includes(r.kind) && (r.kind !== 'bounties' || !!r.prog))
        .every(r => r.done && !r.hot)
      if (all) {
        window.setTimeout(() => {
          setCheer(c => c + 1)
          vibrate([0, 30, 50, 40, 50, 90])
          void import('@/lib/fishingMusic').then(m => m.playRenownUpSfx()).catch(() => {})
        }, (0.55 + kinds.length * STAMP_GAP) * 1000)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [open, view, fresh])
  useEffect(() => {
    if (stamping.length === 0) return
    const t = setTimeout(() => setStamping([]), 1400 + stamping.length * STAMP_GAP * 1000)
    return () => clearTimeout(t)
  }, [stamping])

  // ── NOTICES FROM ELSEWHERE ON THE CHART (2026-09-27) ──────────────────
  // Kong: this notice is the most useful thing on the sea, so other finishes
  // use it too (a Crew Hall stint, the Accelerator, the Ultimate build, an ask
  // to sail, a regular's fish in the hold). Same rules as the board's own:
  // held while the HUD is down, one at a time, five seconds.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<SeaToast>).detail
      if (!d?.text || !d.target) return
      const t: Toast = { id: ++toastId.current, kinds: [], text: d.text, target: d.target, art: d.art ?? null, glyph: d.glyph }
      if (hiddenRef.current) held.current = t
      else { setToast(t); vibrate([0, 14, 40, 18]) }
    }
    window.addEventListener('sea-toast', on)
    return () => window.removeEventListener('sea-toast', on)
  }, [])

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

  const rows = state ? rowsOf(state, recruitsSeen) : []
  const ready = rows.filter(r => r.hot)
  // THE LIST is what "left today" counts; the crew and the week are not on it.
  const listRows = rows.filter(r => LIST.includes(r.kind) && (r.kind !== 'bounties' || !!r.prog))
  const listDoneN = listRows.filter(r => r.done && !r.hot).length
  const readyN = ready.length
  const leftN = listRows.length - listDoneN

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
          aria-label={`${PHASE_LABEL[phase]}. ${readyN > 0 ? `${readyN} ready to claim` : leftN > 0 ? `${leftN} left today` : 'All done for today'}`}
          title={PHASE_LABEL[phase]}
          onClick={() => { vibrate(8); setOpen(true) }}
          style={{
            position: 'relative',
            width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: readyN > 0 ? 'rgba(40,30,8,0.82)' : 'rgba(8,16,24,0.72)',
            border: `1px solid ${readyN > 0 ? `${GOLD}88` : `${SEA},0.22)`}`,
            color: readyN > 0 ? GOLD : PHASE_TINT[phase],
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
          {/* TODAY'S LIST, AS A RING round the disc: it fills as the
              dailies are ticked (a static arc, no animation). */}
          {listRows.length > 0 && readyN === 0 && (
            <span aria-hidden style={{
              position: 'absolute', inset: -3, borderRadius: '50%', pointerEvents: 'none',
              background: `conic-gradient(${leftN === 0 ? DONE : '#9fe0a0'} ${(listDoneN / listRows.length) * 360}deg, rgba(255,255,255,0.08) 0deg)`,
              WebkitMask: 'radial-gradient(circle closest-side, transparent 0 calc(100% - 2.5px), #000 calc(100% - 2.5px))',
              mask: 'radial-gradient(circle closest-side, transparent 0 calc(100% - 2.5px), #000 calc(100% - 2.5px))',
            }} />
          )}
          <PhaseGlyph phase={phase} px={Math.round(size * 0.56)} />
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
                  if (toast.target) {
                    vibrate(6); setToast(null)
                    window.dispatchEvent(new CustomEvent('sea-toast-open', { detail: toast.target }))
                  } else if (toast.kinds.length === 1) go(toast.kinds[0])
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
                  {toast.glyph ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={GOLD}
                      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {toast.glyph === 'friends' ? (<>
                        <path d="M2 17c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
                        <path d="M6 13V5l5 3-5 3" />
                        <path d="M15 13V7l4 2.5-4 2.5" />
                      </>) : (<>
                        <path d="M3 12c3-4 7-5 11-3l4-3v12l-4-3c-4 2-8 1-11-3z" />
                        <circle cx="8" cy="11" r="0.8" fill={GOLD} />
                      </>)}
                    </svg>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={toast.art ?? ART[toast.kinds[0]]} alt="" style={{
                      maxWidth: 40, maxHeight: 40, objectFit: 'contain',
                      filter: `drop-shadow(0 0 7px ${GOLD}77)`,
                    }} />
                  )}
                </span>
                <span style={{ textAlign: 'left', minWidth: 0 }}>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.9rem', color: '#f6e6c0', lineHeight: 1.15 }}>
                    {toast.text}
                  </span>
                  <span className="font-karla font-700 uppercase" style={{ display: 'block', fontSize: '0.54rem', letterSpacing: '0.14em', color: GOLD, marginTop: 2 }}>
                    {toast.target || toast.kinds.length === 1 ? 'Tap to go there' : 'Tap to see the day'}
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
          style={view === 'voyage'
            // THE VOYAGE BRINGS ITS OWN CHROME (VoyageBoardBody): no box while
            // a route is chosen, a framed card for the status screens.
            ? { position: 'relative', margin: 'auto', width: '100%', maxWidth: 1240 }
            : {
            position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
            background: 'rgba(8,12,18,0.98)', border: `1px solid ${GOLD}3a`,
            borderRadius: 18, boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
            padding: narrow ? '0.8rem 0.75rem 0.85rem' : '1.05rem 1rem 1.15rem',
          }}>
          {view === 'voyage' ? (
            <VoyageBoardBody title={VIEW_TITLE.voyage} icon={ART.voyage} narrow={narrow}
              onBack={() => { vibrate(6); setView('board'); load() }} onClose={close} />
          ) : (<>
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
                {view === 'trawls' ? <TrawlIndicator variant="embedded" canDeploy />
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#f4ecd8' }}>
                  <span style={{ color: PHASE_TINT[phase], display: 'inline-flex' }}><PhaseGlyph phase={phase} px={narrow ? 18 : 20} /></span>
                  {PHASE_LABEL[phase]}
                </span>
              </motion.p>
              <span className="font-karla" style={{ fontSize: '0.66rem', color: `${SEA},0.5)` }}>
                {NEXT_WORD[phaseNext.phase]} in {fmtShort(phaseNext.ms)}
              </span>
            </div>
            <div className="font-karla" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, marginTop: 1 }}>
              <span style={{
                fontSize: narrow ? '0.8rem' : '0.84rem', fontWeight: 700,
                color: readyN > 0 ? '#f6e3a6' : state && leftN === 0 ? '#cfeccf' : `${SEA},0.75)`,
              }}>
                {!state ? 'Reading the day'
                  : readyN > 0 ? `${readyN} ready to claim`
                  : leftN === 0 ? 'All done for today'
                  : `${leftN} left today`}
              </span>
              <span style={{ fontSize: '0.64rem', color: `${SEA},0.45)` }}><ResetCountdown /></span>
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

          {/* ── TODAY'S LIST, THE CREW AT WORK, THE WEEK (Kong, 2026-09-27) ──
              The day board reads as a list you want to clear. The true
              dailies are check-off rows with a meter over them: ready sits
              on top in gold, in progress under it with its bar, done sinks
              to the bottom ticked. The voyage and the trawls are not dailies
              (they run again whenever they are back), so they are tiles with
              their own clocks, and the Chart Room is this week's. */}
          {!state ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[0, 1, 2, 3].map(i => (
                <motion.span key={i} aria-hidden
                  animate={{ opacity: [0.35, 0.6, 0.35] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
                  style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: `1px solid ${SEA},0.12)` }} />
              ))}
            </div>
          ) : (<>
            <DayMeter rows={listRows} cheer={cheer} fullDays={state.list.fullDays} countedToday={state.list.countedToday} />
            <section style={{ marginTop: 10 }}>
              <SectionHead label="Today’s list" right={listRows.length ? `${listDoneN} of ${listRows.length}` : null} done={leftN === 0} />
              <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...listRows].sort((x, y) => rank(x) - rank(y)).map(r => (
                  <TaskRow key={r.kind} r={r} compact={narrow} onGo={() => go(r.kind)} stampAt={stamping.indexOf(r.kind)} />
                ))}
              </motion.div>
            </section>
            {rows.some(r => r.kind === 'voyage' || r.kind === 'trawls') && (
              <section style={{ marginTop: 14 }}>
                <SectionHead label="Crew at work" right={null} done={false} />
                <div style={gridStyle}>
                  {rows.filter(r => r.kind === 'voyage' || r.kind === 'trawls').map(r => (
                    <WorkTile key={r.kind} r={r} compact={narrow} onGo={() => go(r.kind)} />
                  ))}
                </div>
              </section>
            )}
            {rows.some(r => r.kind === 'chart') && (
              <section style={{ marginTop: 14 }}>
                <SectionHead label="This week" right={null} done={false} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rows.filter(r => r.kind === 'chart').map(r => (
                    <TaskRow key={r.kind} r={r} compact={narrow} onGo={() => go(r.kind)} stampAt={stamping.indexOf(r.kind)} />
                  ))}
                </div>
              </section>
            )}
          </>)}
          </>)}
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

/** The dailies on today's list, in their resting order (ready and done
 *  reorder around it). Mirrors lib/dayList. */
const LIST: DayKind[] = ['haul', 'orders', 'bounties', 'parlor', 'recruits']

/** Ready first, then what is left, then what is done. */
function rank(r: Row): number {
  return r.hot ? 0 : r.done ? 2 : 1
}

function SectionHead({ label, right, done }: { label: string; right: string | null; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6, padding: '0 2px' }}>
      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: `${SEA},0.55)` }}>{label}</span>
      {right && (
        <span className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: done ? DONE : `${SEA},0.6)`, fontVariantNumeric: 'tabular-nums' }}>{right}</span>
      )}
    </div>
  )
}

/**
 * ── THE METER ───────────────────────────────────────────────────────────────
 *
 * One segment per item on today's list: green when done, gold when it is
 * waiting to be claimed, dark while it is still to do. Filling it is the
 * point. Cleared, it says so and shows the lifetime tally of full days, which
 * only ever goes up (Kong: no streaks).
 */
function DayMeter({ rows, cheer, fullDays, countedToday }: { rows: Row[]; cheer: number; fullDays: number; countedToday: boolean }) {
  if (rows.length === 0) return null
  const order = [...rows].sort((x, y) => (x.done && !x.hot ? 0 : x.hot ? 1 : 2) - (y.done && !y.hot ? 0 : y.hot ? 1 : 2))
  const all = rows.every(r => r.done && !r.hot)
  return (
    <div style={{ marginTop: 10, padding: '0.55rem 0.65rem 0.6rem', borderRadius: 12,
      background: all ? 'linear-gradient(180deg, rgba(40,70,44,0.45), rgba(18,30,20,0.55))' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${all ? 'rgba(123,191,123,0.45)' : `${SEA},0.14)`}` }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {order.map(r => {
          const done = r.done && !r.hot
          return (
            <motion.span key={r.kind} layout
              style={{ position: 'relative', flex: 1, height: 9, borderRadius: 5, overflow: 'hidden',
                background: 'rgba(255,255,255,0.07)' }}>
              <motion.span
                initial={false}
                animate={{ scaleX: done || r.hot ? 1 : 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', borderRadius: 5,
                  background: done ? 'linear-gradient(90deg, #5aa865, #9fe0a0)' : `linear-gradient(90deg, ${GOLD}88, ${GOLD})` }} />
            </motion.span>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <motion.span key={`m${cheer}`} className="font-cinzel font-700"
          initial={cheer ? { scale: 0.9, opacity: 0.4 } : false} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16 }}
          style={{ fontSize: '0.86rem', color: all ? '#cfeccf' : '#f2ead8', transformOrigin: 'left center' }}>
          {all ? 'The day’s work is done' : `${rows.filter(r => r.done && !r.hot).length} of ${rows.length} done today`}
        </motion.span>
        <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: all ? 'rgba(196,232,196,0.8)' : `${SEA},0.5)`, whiteSpace: 'nowrap' }}>
          {fullDays > 0 || countedToday ? `Full days: ${fullDays}` : 'Clear it for your first full day'}
        </span>
      </div>
    </div>
  )
}

/**
 * ── A DAILY, AS A LINE ON THE LIST ──────────────────────────────────────────
 *
 * A box to tick, the place's picture, the name and where it stands, and a bar
 * for anything counted. Ready glows gold with "Claim"; done is ticked in green
 * and struck through, and sinks to the foot of the list (layout animation).
 * When one ticks in front of you the box stamps and the row lights once.
 */
function TaskRow({ r, onGo, compact, stampAt }: { r: Row; onGo: () => void; compact: boolean; stampAt: number }) {
  const done = r.done && !r.hot
  const stamp = stampAt >= 0
  const delay = 0.12 + Math.max(0, stampAt) * STAMP_GAP
  const box = compact ? 24 : 26
  const pct = r.prog && r.prog[1] > 0 ? Math.min(1, r.prog[0] / r.prog[1]) : null
  return (
    <motion.button type="button" onClick={onGo} layout
      data-coach={r.kind === 'haul' ? 'haul' : undefined}
      title={`${r.status} · ${r.place}`}
      animate={stamp ? { scale: [1, 1, 0.97, 1.015, 1] } : { scale: 1 }}
      transition={stamp
        ? { scale: { duration: 0.5, delay, times: [0, 0.2, 0.45, 0.75, 1] }, layout: { type: 'spring', stiffness: 380, damping: 32 } }
        : { layout: { type: 'spring', stiffness: 380, damping: 32 } }}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: compact ? 9 : 11,
        width: '100%', padding: compact ? '0.45rem 0.6rem' : '0.5rem 0.7rem',
        borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        background: r.hot
          ? `radial-gradient(ellipse 70% 120% at 0% 50%, ${GOLD}1f 0%, transparent 70%), rgba(40,30,8,0.42)`
          : done ? 'rgba(18,30,20,0.4)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${r.hot ? `${GOLD}88` : done ? 'rgba(123,191,123,0.28)' : `${SEA},0.16)`}`,
        boxShadow: r.hot ? `0 0 16px ${GOLD}1f` : 'none',
      }}>
      {stamp && (
        <motion.span aria-hidden
          initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.7, delay: delay + 0.12 }}
          style={{ position: 'absolute', inset: -1, borderRadius: 13, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 10% 50%, rgba(168,230,168,0.45), transparent 70%)', border: `1px solid ${DONE}` }} />
      )}
      {/* THE BOX. Empty to do, gold with a mark when it is waiting on you,
          a green tick when it is done (stamped on when it just happened). */}
      <span aria-hidden style={{ position: 'relative', width: box, height: box, flexShrink: 0 }}>
        {done ? (
          <motion.span
            initial={stamp ? { scale: 2, opacity: 0, rotate: -30 } : false}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={stamp ? { type: 'spring', stiffness: 560, damping: 17, delay } : { duration: 0 }}
            style={{ position: 'absolute', inset: 0, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: 'radial-gradient(circle at 38% 32%, #5aa865 0%, #2f6b3a 70%)', border: '1.5px solid rgba(200,245,200,0.55)' }}>
            <svg width={box * 0.62} height={box * 0.62} viewBox="0 0 24 24" fill="none" stroke="#eaf8e4" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={stamp ? { pathLength: 0 } : false} animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, delay: delay + 0.18, ease: 'easeOut' }} />
            </svg>
          </motion.span>
        ) : (
          <span style={{ position: 'absolute', inset: 0, borderRadius: 8, display: 'grid', placeItems: 'center',
            border: `2px solid ${r.hot ? GOLD : `${SEA},0.4)`}`, background: r.hot ? `${GOLD}22` : 'transparent' }}>
            {r.hot && <span className="font-karla font-800" style={{ fontSize: '0.8rem', color: GOLD, lineHeight: 1 }}>!</span>}
          </span>
        )}
      </span>
      {r.faces ? (
        // Today's three faces, rims in their rarity: the faces are the reason to look.
        <span style={{ display: 'flex', flexShrink: 0, opacity: done ? 0.6 : 1 }}>
          {r.faces.map((f, i) => {
            const rim = RARITY_RIM[f.rarity] ?? RARITY_RIM[1]
            const d = compact ? 26 : 30
            return (
              <span key={i} title={f.name} style={{
                width: d, height: d, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                marginLeft: i === 0 ? 0 : -Math.round(d * 0.3), border: `2px solid ${rim}`, background: '#0c1119',
                boxShadow: f.rarity >= 3 && !f.recruited ? `0 0 8px ${rim}99` : 'none',
                opacity: f.recruited ? 0.45 : 1, zIndex: 3 - i,
              }}>
                {f.art && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.art} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                )}
              </span>
            )
          })}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ART[r.kind]} alt="" loading="lazy" decoding="async" style={{
          width: compact ? 34 : 40, height: compact ? 34 : 40, objectFit: 'contain', flexShrink: 0,
          opacity: done ? 0.55 : 1, filter: done ? 'grayscale(0.4)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }} />
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span className="font-cinzel font-700" style={{
          fontSize: compact ? '0.8rem' : '0.86rem', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: done ? 'rgba(196,232,196,0.7)' : '#f2ead8',
          textDecoration: done ? 'line-through' : 'none', textDecorationColor: 'rgba(123,191,123,0.7)', textDecorationThickness: 1.5,
        }}>{r.title}</span>
        <span className="font-karla" style={{
          fontSize: compact ? '0.64rem' : '0.68rem', lineHeight: 1.3, marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: r.hot ? '#f6dfa0' : done ? 'rgba(196,232,196,0.55)' : `${SEA},0.62)`,
        }}>{r.status}</span>
        {pct != null && !done && (
          <span aria-hidden style={{ display: 'flex', gap: 3, marginTop: 5, maxWidth: 220 }}>
            {r.prog![1] <= 8
              ? Array.from({ length: r.prog![1] }).map((_, i) => (
                <span key={i} style={{ flex: 1, height: 5, borderRadius: 3,
                  background: i < r.prog![0] ? (r.hot ? GOLD : 'linear-gradient(90deg, #5aa865, #9fe0a0)') : 'rgba(255,255,255,0.08)' }} />
              ))
              : <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: 'linear-gradient(90deg, #5aa865, #9fe0a0)' }} />
                </span>}
          </span>
        )}
      </span>
      {r.hot ? (
        <span className="font-karla font-800 uppercase" style={{
          flexShrink: 0, padding: '0.32rem 0.6rem', borderRadius: 999, fontSize: '0.58rem', letterSpacing: '0.12em',
          color: '#1a1206', background: `linear-gradient(180deg, ${GOLD}ee, ${GOLD}bb)`,
        }}>{r.action ?? 'Go'}</span>
      ) : !done && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`${SEA},0.45)`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </motion.button>
  )
}

/**
 * ── THE CREW AT WORK ────────────────────────────────────────────────────────
 *
 * The voyage and the trawls: never ticked, because they run again whenever
 * they are back. Gold and "Collect" when something is in, a clock and a bar
 * while they are out, and a plain "Send" when nobody is.
 */
function WorkTile({ r, onGo, compact }: { r: Row; onGo: () => void; compact: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!r.timer) return
    const id = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(id)
  }, [r.timer])
  const frac = r.timer ? Math.max(0, Math.min(1, (now - r.timer.from) / Math.max(1, r.timer.to - r.timer.from))) : null
  const idle = !r.hot && !r.away && !(r.prog && r.prog[0] > 0)
  return (
    <button type="button" onClick={onGo}
      title={`${r.status} · ${r.place}`}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 9, minWidth: 0,
        padding: compact ? '0.5rem 0.55rem' : '0.55rem 0.65rem', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        background: r.hot ? `radial-gradient(ellipse 80% 100% at 0% 50%, ${GOLD}1f 0%, transparent 70%), rgba(40,30,8,0.42)` : 'rgba(255,255,255,0.035)',
        border: `1px solid ${r.hot ? `${GOLD}88` : `${SEA},0.16)`}`,
      }}>
      {r.hot && (
        <motion.span aria-hidden animate={{ opacity: [0.5, 0, 0.5] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -1, borderRadius: 13, border: `1px solid ${GOLD}` }} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ART[r.kind]} alt="" loading="lazy" decoding="async" style={{
        width: compact ? 38 : 44, height: compact ? 38 : 44, objectFit: 'contain', flexShrink: 0,
        filter: r.hot ? `drop-shadow(0 0 8px ${GOLD}66)` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
      }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span className="font-cinzel font-700" style={{ fontSize: compact ? '0.78rem' : '0.84rem', color: '#f2ead8', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
        <span className="font-karla" style={{
          fontSize: compact ? '0.62rem' : '0.66rem', lineHeight: 1.3, marginTop: 1,
          color: r.hot ? '#f6dfa0' : `${SEA},0.62)`,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{r.status}</span>
        {frac != null ? (
          <span aria-hidden style={{ marginTop: 5, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', inset: 0, width: `${frac * 100}%`, background: 'linear-gradient(90deg, #4a86b8, #8fc8ee)' }} />
          </span>
        ) : r.prog && r.prog[1] > 0 && !r.hot ? (
          <span aria-hidden style={{ display: 'flex', gap: 3, marginTop: 5 }}>
            {Array.from({ length: r.prog[1] }).map((_, i) => (
              <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < r.prog![0] ? 'linear-gradient(90deg, #4a86b8, #8fc8ee)' : 'rgba(255,255,255,0.08)' }} />
            ))}
          </span>
        ) : null}
      </span>
      {(r.hot || idle) && r.action && (
        <span className="font-karla font-800 uppercase" style={{
          flexShrink: 0, padding: '0.3rem 0.55rem', borderRadius: 999, fontSize: '0.56rem', letterSpacing: '0.12em',
          color: r.hot ? '#1a1206' : `${SEA},0.9)`,
          background: r.hot ? `linear-gradient(180deg, ${GOLD}ee, ${GOLD}bb)` : 'rgba(150,214,255,0.1)',
          border: r.hot ? 'none' : `1px solid ${SEA},0.3)`,
        }}>{r.hot ? (r.kind === 'voyage' ? 'Reveal' : 'Collect') : r.action}</span>
      )}
    </button>
  )
}

