'use client'

// Trawls UI — the fishing-screen overlay. A circular crew-captain portrait on
// the LEFT (empty when no crew's out; the soonest/ready crew + countdown or a
// gold collect-glow when active). It lives in the z-15 HUD layer (passed
// `hidden` while a fishing panel is open) so it never floats over a modal; the
// Trawls panel / picker / collect reveal portal to <body> above everything.
// Collecting fires the reveal (coins fly to the Nav purse, fishing XP ticks).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ctaPill, CTA_TEXT } from '@/lib/uiTokens'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useMotionValue, useDragControls } from 'framer-motion'
import { getTrawlState, deployTrawl, collectTrawl } from './trawls/actions'
import {
  TRAWL_MAX_SLOTS, expectedTrawlHaul, fmtTrawlDuration, trawlDurationMs, TRAWL_BUMPERS, pickTrawlEvent,
  type TrawlState, type TrawlZoneKey, type ActiveTrawlView, type TrawlCrewView, type CollectTrawlResult,
} from './trawls/constants'
import { getXPProgress, MAX_LEVEL } from '@/lib/fishingLevel'
import { getProfileBackground } from '@/lib/profileBackgrounds'
import { vibrate as haptic } from '@/lib/haptics'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f?: string) => (f ? `${SUPA}/storage/v1/object/public/card-arts/${f}` : '')
const GOLD = '#f0c040'
const GREEN = '#7bf0b0'
const BLUE = '#9fc0ef'
const lastCrewKey = (z: string) => `trawl_last_crew_${z}`
/** How many crew the picker shows before you ask for the rest. Two rows of the
 *  3-across grid — enough to choose from without the wall of every hand you own,
 *  which is what made the picker feel like homework once rosters got deep. */
const CREW_PREVIEW = 6
/** Press-and-hold before the trawl indicator comes loose. Long enough that a
 *  swipe starting on it never moves it, short enough to feel intentional. */
const HOLD_TO_DRAG_MS = 320
/** Per-zone most-recently-sent list, newest first. */
const RECENT_MAX = 8

function readRecentCrew(zone: string): number[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(lastCrewKey(zone))
    if (!raw) return []
    // Legacy value was a single bare id. Read it as a one-entry history rather
    // than throwing away everyone's last-sent memory on upgrade.
    if (!raw.startsWith('[')) {
      const n = Number(raw)
      return Number.isFinite(n) ? [n] : []
    }
    const arr: unknown = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === 'number') : []
  } catch { return [] }
}

function pushRecentCrew(zone: string, crewId: number) {
  if (typeof localStorage === 'undefined') return
  try {
    const next = [crewId, ...readRecentCrew(zone).filter(id => id !== crewId)].slice(0, RECENT_MAX)
    localStorage.setItem(lastCrewKey(zone), JSON.stringify(next))
  } catch { /* no-op */ }
}

// Per-zone DEPTH palette so the zones read as distinct waters at a glance —
// bright aqua shallows sinking to a violet abyss and a phosphorescent ancient
// deep — instead of five identical blue tiles. `accent` drives the running /
// sendable state color for that zone; top→mid→deep paints the card's water.
const DEPTH_THEMES: Record<TrawlZoneKey, { accent: string; top: string; mid: string; deep: string }> = {
  shallows:     { accent: '#46e0c0', top: 'rgba(70,224,192,0.32)',  mid: 'rgba(13,62,64,0.72)', deep: 'rgba(6,28,32,0.93)' },
  open_waters:  { accent: '#43a8f4', top: 'rgba(67,168,244,0.30)',  mid: 'rgba(10,40,74,0.74)', deep: 'rgba(5,18,42,0.94)' },
  deep:         { accent: '#6274ee', top: 'rgba(98,116,238,0.28)',  mid: 'rgba(15,22,62,0.78)', deep: 'rgba(6,10,36,0.95)' },
  abyss:        { accent: '#a06ff2', top: 'rgba(160,111,242,0.28)', mid: 'rgba(30,15,55,0.80)', deep: 'rgba(11,6,30,0.96)' },
  ancient_deep: { accent: '#caa05a', top: 'rgba(150,112,52,0.30)',  mid: 'rgba(48,33,15,0.83)', deep: 'rgba(19,12,5,0.96)' }, // dark ancient sepia
}

// Rising bubbles over a running trawl card — the crew's down there working.
// CSS keyframes, not framer: with five cards open these were 20 elements
// animating y AND opacity in JavaScript every frame (see the trawl block in
// globals.css). They are ambient decoration that never reacts to state, so the
// compositor can own them and the main thread — which the fishing dial needs —
// does nothing per frame. Still memo'd so the divs don't reconcile on the tick.
const Bubbles = memo(function Bubbles({ color }: { color: string }) {
  const seeds = [
    { l: 19, d: 0.0, s: 5,   dur: 3.6 },
    { l: 43, d: 1.3, s: 3.5, dur: 4.3 },
    { l: 63, d: 0.6, s: 4,   dur: 3.1 },
    { l: 82, d: 2.0, s: 3,   dur: 3.9 },
  ]
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 14 }}>
      {seeds.map((b, i) => (
        <div key={i} className="trawl-bubble"
          style={{
            position: 'absolute', left: `${b.l}%`, bottom: 0, width: b.s, height: b.s,
            borderRadius: '50%', opacity: 0,
            background: `radial-gradient(circle at 35% 30%, #ffffffcc, ${color}55)`,
            boxShadow: `0 0 5px ${color}55`,
            ['--dur' as string]: `${b.dur}s`,
            ['--delay' as string]: `${b.d}s`,
          }} />
      ))}
    </div>
  )
})

// Expanding ripple rings — the splash when a crew is sent to the water.
const SplashRings = memo(function SplashRings({ color }: { color: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
      {[0, 0.16].map((d, i) => (
        <motion.div key={i}
          initial={{ width: 14, height: 14, opacity: 0.7 }}
          animate={{ width: 180, height: 180, opacity: 0 }}
          transition={{ duration: 0.85, delay: d, ease: 'easeOut' }}
          style={{ position: 'absolute', borderRadius: '50%', border: `2px solid ${color}` }} />
      ))}
    </div>
  )
})

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Ready'
  const totalSec = Math.ceil(ms / 1000)
  // Only the final minute ticks by the second ("the final countdown"); above
  // that it sits on calm whole minutes / hours so the readout isn't churning
  // every second through a 45m–2h cycle.
  if (totalSec < 60) return `0:${String(totalSec).padStart(2, '0')}`
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function CountUp({ to, prefix = '', className, style }: { to: number; prefix?: string; className?: string; style?: React.CSSProperties }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0; const start = performance.now(); const dur = 700
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <span className={className} style={style}>{prefix}{v.toLocaleString()}</span>
}

// memo'd: crew/size/glow are stable across `now` ticks (state identity is
// unchanged), so the portrait <img>s don't reconcile every second.
const Portrait = memo(function Portrait({ crew, size = 52, glow }: { crew: TrawlCrewView | null; size?: number; glow?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: 'radial-gradient(circle at 50% 30%, #243044, #0e141e)',
      border: `2px solid ${glow ?? 'rgba(196,169,106,0.5)'}`,
      boxShadow: glow ? `0 0 14px ${glow}` : 'inset 0 0 10px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {crew?.filename
        ? <img src={artSrc(crew.filename)} alt="" draggable={false} style={{ width: '108%', height: '108%', objectFit: 'contain' }} />
        : <div style={{ width: '44%', height: '44%', borderRadius: '50%', border: '2px dashed rgba(196,169,106,0.45)' }} />}
    </div>
  )
})

function CloseBtn({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <motion.button onClick={onClick} aria-label={label} whileTap={{ scale: 0.85 }} whileHover={{ background: 'rgba(255,255,255,0.12)' }} style={{
      width: 36, height: 36, borderRadius: 11, flexShrink: 0, padding: 0,
      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)',
      color: '#cdd3db', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </motion.button>
  )
}

// One requirement chip in the "unlock next slot" explainer.
function Req({ label, need, have }: { label: string; need: number; have: number }) {
  const met = have >= need
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 6, padding: '0.3rem 0.6rem', borderRadius: 8,
      background: met ? 'rgba(123,240,176,0.12)' : 'rgba(240,160,80,0.12)',
      border: `1px solid ${met ? 'rgba(123,240,176,0.4)' : 'rgba(240,160,80,0.4)'}`,
    }}>
      <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#f4ecd8' }}>{label} {need}</span>
      <span className="font-karla" style={{ fontSize: '0.7rem', color: met ? GREEN : '#f0b070' }}>
        {met ? 'done' : `you're ${have}`}
      </span>
    </div>
  )
}

// Small "best" chip in the crew picker — flags the strongest free crew for a
// goal in this zone (Savvy → XP, Fortune → doubloons).
function BestTag({ color }: { color: string }) {
  return (
    <span className="font-karla font-800 uppercase" style={{
      fontSize: '0.46rem', letterSpacing: '0.08em', color,
      background: `${color}1f`, border: `1px solid ${color}55`, borderRadius: 4,
      padding: '0.06rem 0.26rem', marginRight: 5, verticalAlign: 'middle',
    }}>best</span>
  )
}

export default function TrawlIndicator({
  hidden = false, variant = 'float', canDeploy = true, canCollect = true, onDismiss, before,
}: {
  hidden?: boolean
  /**
   * WHERE THIS IS BEING SHOWN.
   *
   * 'float' is the fishing screen: a draggable portrait badge that opens the
   * sheet. 'dock' is the Trawl Docks island, where the sheet IS the page — no
   * badge, open on arrival, and closing it puts you back on the water.
   */
  variant?: 'float' | 'dock'
  /**
   * MAY A CREW BE SENT FROM HERE.
   *
   * False everywhere except the Docks. Sending used to be available from any
   * screen that showed this panel, which made the trawl a menu you opened
   * rather than somewhere you went — and left an island on the chart with
   * nothing that had to happen on it. Collecting is deliberately NOT gated:
   * making a player sail back to claim a haul they have already earned is a
   * toll, not a decision.
   *
   * This is a design gate, not a security one. The server has no trustworthy
   * notion of where the boat is (the position in `profiles` is written by the
   * client and documented as unvalidated), and a forged deploy buys nothing a
   * player could not have had by sailing.
   */
  canDeploy?: boolean
  /**
   * MAY A HAUL BE TAKEN FROM HERE.
   *
   * Also the Docks only. Sending and collecting are both crew business and
   * splitting them across two screens would need explaining; one rule — the
   * island is where the crew are — needs none. The chart lights the Docks up
   * when somebody is waiting, so nothing is missed by it being over there.
   */
  canCollect?: boolean
  /** Dock variant only: what "close" means when there is no badge to shrink
   *  back into. */
  onDismiss?: () => void
  /**
   * SOMETHING ELSE THE ISLAND DOES, rendered above the trawls.
   *
   * The dock sheet IS the page, so anything else that belongs at the Docks has
   * to live inside it. Taken as a NODE rather than built in here: this file
   * owns trawls, and a second feature growing inside it is how a component ends
   * up owning two things badly. The Docks passes the day's orders.
   */
  before?: React.ReactNode
}) {
  const dock = variant === 'dock'
  const [state, setState] = useState<TrawlState | null>(null)
  const [open, setOpen] = useState(dock)
  const [now, setNow] = useState(() => Date.now())
  const [picking, setPicking] = useState<TrawlZoneKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState<CollectTrawlResult | null>(null)
  const [revealEvent, setRevealEvent] = useState<string>('')
  // The crew that ran the trawl — captured from the active trawl at collect time
  // (the row is deleted server-side after collect) so the reveal can show their
  // portrait as the hero of the haul.
  const [revealCrew, setRevealCrew] = useState<TrawlCrewView | null>(null)
  const [coins, setCoins] = useState<{ id: number }[]>([])
  const [flashZone, setFlashZone] = useState<TrawlZoneKey | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  // Zone whose haul is in flight. Drives the "Collecting…" label so the tap
  // reads as registered while the server action is still out.
  const [collectingZone, setCollectingZone] = useState<TrawlZoneKey | null>(null)
  // Picker controls. XP leads because a trawl's headline reward is fishing XP.
  const [trawlSort, setTrawlSort] = useState<'xp' | 'doubloons' | 'recent'>('xp')
  // The picker opens SHORT. Deep rosters turned choosing a hand into scanning
  // a wall of near-identical cards; the rest are one tap away.
  const [showAllCrew, setShowAllCrew] = useState(false)
  // GHOST-CLICK GUARD. The indicator opens the panel from framer's onTap,
  // which fires on POINTERUP — then the browser synthesizes a click ~100-300ms
  // later at the same coordinates. By then this bottom sheet has mounted under
  // the finger, so that phantom click landed on whatever zone card happened to
  // be there: usually the Shallows (first card), which shot straight into its
  // send-a-crew picker. Worse on a READY card, where it silently collected the
  // haul. Zone cards ignore taps for a beat after the panel opens.
  // HOLD TO MOVE. The indicator sits over the fishing screen, so a plain
  // `drag` meant any downward swipe that started on it dragged it somewhere new
  // — it moved when players were only trying to tap it. Dragging is now armed
  // by a deliberate press-and-hold: dragListener is off, and only the hold
  // timer below hands the gesture to framer.
  const dragControls = useDragControls()
  const holdRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number }>({ timer: null, x: 0, y: 0 })
  const openedAtRef = useRef(0)
  const openPanel = () => { openedAtRef.current = Date.now(); setOpen(true) }
  const settled = () => Date.now() - openedAtRef.current > 350
  // Defaults to FREE: a hand sent trawling is locked out of raids for the whole
  // cycle, so raid-party crew are the one group you usually do NOT want offered.
  // Switch to All / In raid to pull them in deliberately.
  const [trawlWho, setTrawlWho] = useState<'all' | 'free' | 'raid'>('free')
  const [slotUnlock, setSlotUnlock] = useState<number | null>(null)
  const [slotInfo, setSlotInfo] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pid = useRef(0)
  // Draggable indicator: players can reposition it so it doesn't cover other
  // UI. Offset (from the default spot) persists in localStorage; constrained
  // to the play area; a tap (no drag) still opens the panel.
  const dragBoundsRef = useRef<HTMLDivElement | null>(null)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const draggingRef = useRef(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('trawl_indicator_pos')
      if (raw) { const p = JSON.parse(raw); if (typeof p.x === 'number') dragX.set(p.x); if (typeof p.y === 'number') dragY.set(p.y) }
    } catch { /* no-op */ }
  }, [dragX, dragY])

  const refresh = useCallback(async () => {
    const r = await getTrawlState()
    if (!('error' in r)) setState(r)
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const activeTrawls: ActiveTrawlView[] = useMemo(
    () => (state ? state.zones.map(z => z.trawl).filter((t): t is ActiveTrawlView => t !== null) : []),
    [state],
  )

  // Clock for countdowns/progress. The readout only changes per-MINUTE except
  // inside a trawl's final minute (see fmtCountdown), so a flat 1s tick spent
  // the whole 45m–2h cycle re-rendering the fishing screen every second for no
  // visible change. Adaptive cadence: tick by the second only when the panel is
  // open (progress bars on screen) or a trawl is in its last minute; otherwise
  // every 10s — enough to keep minute readouts fresh and flip to "ready"
  // promptly, without competing with the fishing dial's frame loop.
  useEffect(() => {
    if (activeTrawls.length === 0) return
    let id: ReturnType<typeof setTimeout>
    const tick = () => {
      const n = Date.now()
      setNow(n)
      const soonest = Math.min(...activeTrawls.map(t => new Date(t.endsAt).getTime() - n))
      // Nothing left to count down: every trawl is ready and its card is
      // static. Stop ticking rather than re-rendering the whole panel once a
      // second for no change — which is exactly the state the panel is in
      // when you open it to collect.
      if (soonest <= 0) return
      const fine = open || soonest < 60_000
      id = setTimeout(tick, fine ? 1000 : 10_000)
    }
    // Stamp fresh on open so a just-opened panel's countdowns/bars aren't stale
    // from the idle 10s cadence; otherwise let the first scheduled tick handle it.
    if (open) setNow(Date.now())
    id = setTimeout(tick, 1000)
    return () => clearTimeout(id)
  }, [activeTrawls, open])

  // A fishing OR nav level-up can unlock a new trawl slot. Re-check on a
  // fishing level-up (event) — nav unlocks are caught on next refresh/mount.
  useEffect(() => {
    const onLeveled = () => { void refresh() }
    window.addEventListener('fishing-leveled', onLeveled)
    return () => window.removeEventListener('fishing-leveled', onLeveled)
  }, [refresh])

  // The "Crew Trawls unlocked" celebration is held while a fishing level-up
  // overlay is showing, so the two popups don't stack — it fires once the
  // level-up is dismissed (the level-up overlay itself announces the unlock).
  const levelUpOpenRef = useRef(false)
  const pendingUnlockRef = useRef<number | null>(null)
  const fireSlotUnlock = useCallback((n: number) => {
    setSlotUnlock(n)
    haptic([0, 30, 60, 30, 60, 40])
  }, [])
  useEffect(() => {
    const onOpen = () => { levelUpOpenRef.current = true }
    const onClosed = () => {
      levelUpOpenRef.current = false
      if (pendingUnlockRef.current !== null) {
        fireSlotUnlock(pendingUnlockRef.current)
        pendingUnlockRef.current = null
      }
    }
    window.addEventListener('fishing-levelup-open', onOpen)
    window.addEventListener('fishing-levelup-closed', onClosed)
    return () => {
      window.removeEventListener('fishing-levelup-open', onOpen)
      window.removeEventListener('fishing-levelup-closed', onClosed)
    }
  }, [fireSlotUnlock])

  // Detect a NEWLY unlocked slot vs the last count we saw (localStorage), and
  // celebrate it. First-ever load records silently so existing slots don't pop.
  useEffect(() => {
    if (!state) return
    let seen: number | null = null
    try { const v = localStorage.getItem('trawl_seen_slots'); seen = v === null ? null : Number(v) } catch { /* no-op */ }
    if (seen === null || !Number.isFinite(seen)) {
      try { localStorage.setItem('trawl_seen_slots', String(state.unlockedSlots)) } catch { /* no-op */ }
      return
    }
    if (state.unlockedSlots > seen) {
      try { localStorage.setItem('trawl_seen_slots', String(state.unlockedSlots)) } catch { /* no-op */ }
      // Defer the celebration if a level-up overlay is mid-show; it fires on
      // 'fishing-levelup-closed'. Otherwise (nav unlock, admin grant) show now.
      if (levelUpOpenRef.current) pendingUnlockRef.current = state.unlockedSlots
      else fireSlotUnlock(state.unlockedSlots)
    }
  }, [state, fireSlotUnlock])

  if (!state) return null
  const hasSlots = state.unlockedSlots > 0
  if (!hasSlots && activeTrawls.length === 0) return null // hidden until Fishing 25

  const readyTrawls = activeTrawls.filter(t => new Date(t.endsAt).getTime() <= now)
  const anyReady = readyTrawls.length > 0
  const indicatorTrawl =
    readyTrawls[0] ??
    [...activeTrawls].sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())[0] ??
    null
  const indicatorMs = indicatorTrawl ? new Date(indicatorTrawl.endsAt).getTime() - now : 0
  const ringColor = anyReady ? GOLD : indicatorTrawl ? 'rgba(196,169,106,0.6)' : 'rgba(196,169,106,0.34)'
  const freeSlots = state.unlockedSlots - activeTrawls.length

  async function doDeploy(zone: TrawlZoneKey, crewId: number) {
    if (busy) return
    haptic([0, 12, 30, 18]) // immediate "thunk" on tap

    // OPTIMISTIC. A deploy costs an auth check, a five-query guard, two writes
    // and a full state rebuild, so the honest round trip is well over half a
    // second — and the panel used to sit there, picker open, for all of it.
    // Everything the UI needs to show the crew at sea is already on the client,
    // so show it now and let the server confirm.
    //
    // The server is still the authority: its response replaces this wholesale a
    // moment later, and a refusal rolls the snapshot straight back.
    // `state` is non-null wherever this can be called (the picker only renders
    // inside a loaded panel), but narrow it so the snapshot below is a real
    // TrawlState rather than a partial.
    const before = state
    const crew = before?.freeCrew.find(c => c.id === crewId)
    if (before && crew) {
      const est = expectedTrawlHaul(zone, crew.savvy, crew.fortune)
      setState({
        ...before,
        freeCrew: before.freeCrew.filter(c => c.id !== crewId),
        zones: before.zones.map(z => z.key !== zone ? z : {
          ...z,
          trawl: {
            zone, crew, endsAt: new Date(Date.now() + trawlDurationMs(zone)).toISOString(),
            ready: false, expectedXp: est.xp, expectedDoubloons: est.doubloons,
          },
        }),
      })
      setPicking(null); setNow(Date.now())
      setFlashZone(zone); setTimeout(() => setFlashZone(null), 850)
    }

    setBusy(true); setSendingId(crewId)
    const r = await deployTrawl(zone, crewId)
    setBusy(false); setSendingId(null)
    if ('error' in r) {
      // Put it back exactly as it was. Nothing was persisted, so the snapshot
      // is still correct.
      setState(before); haptic([10, 40, 10]); return
    }
    pushRecentCrew(zone, crewId)
    setState(r); setPicking(null); setNow(Date.now())
    // The tab bar keeps its own copy of the trawl rows and only refetched on a
    // route change, so the fishing tab's ready-dot could not go out while you
    // stood on the fishing screen. Tell it directly.
    window.dispatchEvent(new CustomEvent('trawls-changed'))
    if (!crew) { setFlashZone(zone); setTimeout(() => setFlashZone(null), 850) }
  }

  async function doCollect(zone: TrawlZoneKey) {
    if (busy) return
    // Answer the tap NOW. The haul haptic below only fires once the server
    // comes back, which left the press feeling dead for the whole round-trip —
    // the same "immediate thunk" doDeploy already does on send.
    setBusy(true); setCollectingZone(zone); haptic(10)
    const r = await collectTrawl(zone)
    setBusy(false); setCollectingZone(null)
    if ('error' in r) return
    // Bigger hauls land with a heavier haptic + more coins flung to the purse.
    const tier = r.bumper
    haptic(tier === 'jackpot' ? [0, 40, 30, 70, 30, 95] : tier === 'bumper' ? [0, 35, 30, 60, 30, 70] : tier === 'good' ? [0, 30, 35, 45] : tier === 'slim' ? [0, 18, 30, 20] : [0, 25, 40, 30])
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    window.dispatchEvent(new CustomEvent('fishing-xp-changed', { detail: r.newFishingXP }))
    window.dispatchEvent(new CustomEvent('trawls-changed'))
    const coinCount = tier === 'jackpot' ? 18 : tier === 'bumper' ? 14 : tier === 'good' ? 11 : tier === 'slim' ? 6 : 8
    setCoins(Array.from({ length: coinCount }, () => ({ id: pid.current++ })))
    setTimeout(() => setCoins([]), 900)
    setRevealEvent(pickTrawlEvent(r.bumper))
    setRevealCrew(state?.zones.find(z => z.key === zone)?.trawl?.crew ?? null)
    setReveal(r)
    // If this haul leveled the player up, the full level-up overlay (owned by
    // FishingGame) fires when the haul card is dismissed (see dismissReveal).
    // Signal it now, BEFORE refresh(), so any slot unlocked by the same haul
    // holds its own celebration until the level-up overlay closes — same
    // anti-stacking deferral the catch flow uses.
    if (r.newFishingLevel > r.oldFishingLevel) {
      window.dispatchEvent(new CustomEvent('fishing-levelup-open'))
    }
    // Refresh is DEFERRED to dismissReveal. Firing it here put a second server
    // round-trip in flight just as the coins and the haul card started
    // animating, and its setState re-rendered the whole panel mid-animation.
    // The reveal covers the cards anyway, so nothing is stale on screen.
  }

  // Dismiss the haul card; if it was a level-up, hand off to FishingGame's
  // main level-up overlay so trawl level-ups get the same celebration (perks,
  // zone/gear/trawl unlocks) as a level-up earned by catching a fish.
  function dismissReveal() {
    const r = reveal
    setReveal(null)
    // Now that the animation is done, pull the collected trawl out of state.
    void refresh()
    if (r && r.newFishingLevel > r.oldFishingLevel) {
      window.dispatchEvent(new CustomEvent('fishing-levelup', { detail: { from: r.oldFishingLevel, to: r.newFishingLevel } }))
    }
  }

  // ── Indicator (inline, z-15 HUD layer; drag to reposition) ────────────────
  const indicatorButton = !hidden && (
    // Full-area boundary (pointer-events:none so it never blocks the game) just
    // gives the draggable icon its bounds. The icon itself is pointer-events:auto.
    <div ref={dragBoundsRef} style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none' }}>
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={dragBoundsRef}
        dragMomentum={false}
        dragElastic={0.1}
        onPointerDown={e => {
          holdRef.current.x = e.clientX; holdRef.current.y = e.clientY
          // Hand the gesture to framer only once the hold lands. Passing the
          // original event keeps the drag origin under the finger, so it does
          // not jump when it arms.
          holdRef.current.timer = setTimeout(() => {
            holdRef.current.timer = null
            haptic(18)           // "it's loose now"; whileDrag supplies the lift
            dragControls.start(e)
          }, HOLD_TO_DRAG_MS)
        }}
        onPointerMove={e => {
          // Moved before the hold landed? That was a swipe across the screen,
          // not an intent to reposition. Cancel the arm and leave it put.
          const h = holdRef.current
          if (h.timer && (Math.abs(e.clientX - h.x) > 8 || Math.abs(e.clientY - h.y) > 8)) {
            clearTimeout(h.timer); h.timer = null
          }
        }}
        onPointerUp={() => { if (holdRef.current.timer) { clearTimeout(holdRef.current.timer); holdRef.current.timer = null } }}
        onPointerCancel={() => { if (holdRef.current.timer) { clearTimeout(holdRef.current.timer); holdRef.current.timer = null } }}
        onDragStart={() => { draggingRef.current = true }}
        onDragEnd={() => {
          // Keep the guard up briefly — framer fires onDragEnd BEFORE the
          // trailing onTap on the same pointer-up, so resetting here
          // immediately would let that tap open the panel after a drag.
          try { localStorage.setItem('trawl_indicator_pos', JSON.stringify({ x: dragX.get(), y: dragY.get() })) } catch { /* no-op */ }
          setTimeout(() => { draggingRef.current = false }, 150)
        }}
        onTap={() => { if (!draggingRef.current) { openPanel(); haptic(12) } }}
        whileTap={{ scale: 0.9 }}
        whileDrag={{ scale: 1.08 }}
        aria-label="Trawls — tap to open, press and hold to move"
        style={{
          // Default spot: left edge, just above the music/SFX chips (which sit
          // at bottom:110, ~34px tall each). Players can drag it elsewhere; the
          // offset persists in localStorage relative to this base.
          position: 'absolute', left: 10, bottom: 200, x: dragX, y: dragY,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          pointerEvents: 'auto', touchAction: 'none', cursor: 'grab',
        }}
      >
        <motion.div
          animate={anyReady ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={anyReady ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          style={{ position: 'relative' }}
        >
          <Portrait crew={indicatorTrawl?.crew ?? null} size={54} glow={anyReady ? GOLD : undefined} />
          {activeTrawls.length > 1 && (
            <span className="font-cinzel font-700" style={{
              position: 'absolute', top: -4, right: -4, minWidth: 19, height: 19, borderRadius: 10, padding: '0 4px',
              background: '#1c140a', border: `1.5px solid ${ringColor}`, color: '#f4ecd8', fontSize: '0.66rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{activeTrawls.length}</span>
          )}
        </motion.div>
        {/* READY IS A SOLID PILL, and it has to be. It used to be gold text on
            an 11%-opacity gold wash with a 33% border, which floats over the
            water and is fainter than the plain dark countdown it replaces. The
            one state that wants your attention was the least visible one on the
            widget.
            Gold ground with dark type, matching every other "there is something
            here for you" count in the app. */}
        <span className={`font-karla font-${anyReady ? '800' : '700'}${anyReady ? ' uppercase' : ''}`} style={{
          fontSize: '0.62rem', letterSpacing: anyReady ? '0.14em' : '0.04em', padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
          ...(anyReady ? ctaPill() : {
            background: 'rgba(8,12,18,0.82)',
            border: `1px solid ${ringColor}`,
            color: indicatorTrawl ? '#e6dcc2' : '#b6a98c',
            boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
          }),
        }}>
          {anyReady ? (readyTrawls.length > 1 ? `${readyTrawls.length} Ready` : 'Ready') : indicatorTrawl ? fmtCountdown(indicatorMs) : 'Trawls'}
        </span>
      </motion.div>
    </div>
  )

  // ── Panel ────────────────────────────────────────────────────────────────
  const ns = state.nextSlot
  /**
   * CLOSING THE DOCK PLAYS THE EXIT FIRST.
   *
   * It used to call `onDismiss()` on the tap and leave `open` true, so the
   * sheet never animated out at all: it sat fully open on a dark backdrop while
   * Next tore the route down, and then vanished mid-navigation. The dismiss is
   * a NAVIGATION, and a navigation takes longer than a fade — so the fade has
   * to happen first, not race it.
   *
   * `onExitComplete` is the seam. Setting open false starts the slide-down and
   * the backdrop fade; AnimatePresence tells us when the element is genuinely
   * gone, and only then do we leave.
   */
  const [leaving, setLeaving] = useState(false)
  const closeDock = useCallback(() => {
    if (leaving) return
    setLeaving(true)
    setPicking(null)
    setOpen(false)
  }, [leaving])

  const panel = (
    <AnimatePresence onExitComplete={() => { if (dock && leaving) onDismiss?.() }}>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => { if (dock) { closeDock(); return } setOpen(false); setPicking(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(4,8,14,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 470, maxHeight: '86vh', overflowY: 'auto',
              background: 'linear-gradient(180deg, #1b1813 0%, #100c07 100%)',
              borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(196,169,106,0.34)',
              padding: '1.2rem 1.1rem calc(1.5rem + env(safe-area-inset-bottom))',
            }}>
            {before}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f4ecd8' }}>Trawls</p>
                {/* Slot count is now a compact tappable chip — opens the slot-info modal. */}
                <motion.button onClick={() => { haptic(8); setSlotInfo(true) }} whileTap={{ scale: 0.9 }} aria-label="Trawl slots — how to get more"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.26rem 0.55rem', borderRadius: 999, background: 'rgba(196,169,106,0.1)', border: '1px solid rgba(196,169,106,0.32)', cursor: 'pointer' }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: GOLD }}>{state.unlockedSlots}/{TRAWL_MAX_SLOTS}</span>
                  <div style={{ display: 'flex', gap: 3.5 }}>
                    {Array.from({ length: TRAWL_MAX_SLOTS }).map((_, i) => (
                      <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < state.unlockedSlots ? GOLD : 'rgba(255,255,255,0.1)', border: `1px solid ${i < state.unlockedSlots ? GOLD : 'rgba(255,255,255,0.2)'}`, boxShadow: i < state.unlockedSlots ? `0 0 5px ${GOLD}88` : 'none' }} />
                    ))}
                  </div>
                </motion.button>
              </div>
              <CloseBtn onClick={() => { if (dock) { closeDock(); return } setOpen(false); setPicking(null) }} />
            </div>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#bcb29a', lineHeight: 1.45, marginTop: 2 }}>
              Crew fish a zone on their own — collect their XP and doubloon haul
              when they come back. {canDeploy
                ? 'Pick a zone to send someone.'
                : 'Sending is done at the Trawl Docks; you can collect from anywhere.'}
            </p>

            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#8a8068', margin: '16px 0 8px' }}>Fishing zones</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {state.zones.map((z, i) => {
                const t = z.trawl
                const ready = t ? new Date(t.endsAt).getTime() <= now : false
                const running = !!t && !ready
                const ms = t ? new Date(t.endsAt).getTime() - now : 0
                const progress = running ? Math.max(0, Math.min(1, 1 - ms / trawlDurationMs(z.key))) : 0
                const flashing = flashZone === z.key
                // Odd one out (5 zones / 2 cols) → the last (Ancient Deep) spans
                // full width as a feature card.
                const wide = i === state.zones.length - 1 && state.zones.length % 2 === 1
                // A zone you COULD send to, if you were standing in the right
                // place. Split from `sendable` so the card can say which of the
                // two reasons it is not offering you a crew — "no slots free"
                // and "not here" are different problems with different fixes.
                const couldSend = z.unlocked && !t && freeSlots > 0
                const sendable = couldSend && canDeploy
                const actionable = (ready && canCollect) || sendable
                const onTapCard = ready
                  ? () => { if (settled() && canCollect) doCollect(z.key) }
                  : sendable
                    ? () => { if (!settled()) return; haptic(10); setShowAllCrew(false); setPicking(z.key) }
                    : undefined
                const theme = DEPTH_THEMES[z.key]
                const glow = ready ? GOLD : running ? theme.accent : flashing ? theme.accent : undefined
                const cardState: 'locked' | 'ready' | 'running' | 'sendable' | 'noslot' | 'ashore' =
                  !z.unlocked ? 'locked' : ready ? 'ready' : running ? 'running'
                    : sendable ? 'sendable' : couldSend ? 'ashore' : 'noslot'
                // State reads from a small status PILL in the card body (dark
                // plate for legibility; filled gold for the standout Ready), not
                // a full-width bordered header bar.
                const status = {
                  // FILLED. The comment above has always said "filled gold for
                  // the standout Ready" and the flag said otherwise, so the one
                  // state meant to stand out was drawn like the four that are
                  // not: pale text on the same black plate.
                  ready:    { c: '#ffd96a',     label: collectingZone === z.key ? 'Hauling In…' : canCollect ? 'Tap to Collect' : 'Waiting at the Docks', filled: true,  dot: false },
                  running:  { c: theme.accent, label: `Fishing · ${fmtCountdown(ms)}`, filled: false, dot: true  },
                  sendable: { c: theme.accent, label: 'Tap to send crew',              filled: false, dot: false },
                  ashore:   { c: 'rgba(255,255,255,0.55)', label: 'Send from the Docks',   filled: false, dot: false },
                  noslot:   { c: '#9a958c',    label: 'No free slot',                  filled: false, dot: false },
                  locked:   { c: '#8f877a',    label: z.key === 'ancient_deep' && state.fishingLevel >= z.minLevel ? 'Locked · Clear Chapter 3' : `Locked · Lv ${z.minLevel}`, filled: false, dot: false },
                }[cardState]
                const zoneArt = getProfileBackground(z.key)?.src
                // Per-zone DEPTH gradient over the art, so each zone reads as a
                // different water. State (flash / ready / running) brightens the
                // top band; the body always sinks to that zone's deep color.
                // Locked / no-slot cards are dead ends right now — render them as
                // obviously inert: a flat neutral gradient, no zone color.
                const inert = cardState === 'locked' || cardState === 'noslot'
                const topBand = flashing ? `${theme.accent}54` : running ? `${theme.accent}3c` : theme.top
                // Ready ditches the zone color entirely for a warm GOLD wash so
                // "come collect me" stands apart from every other card at a glance.
                const scrim = inert
                  ? 'linear-gradient(180deg, rgba(40,42,46,0.62) 0%, rgba(20,22,26,0.86) 55%, rgba(11,12,15,0.96) 100%)'
                  : ready
                    // Ready DROPS the zone art (see background below) and stands
                    // on its own warm base instead. Gold laid over the water was
                    // fighting the art for contrast and losing — the busier the
                    // zone, the less "collect me" read. With nothing behind it
                    // the same restrained gold carries the whole card.
                    ? 'linear-gradient(180deg, rgba(246,201,84,0.30) 0%, rgba(170,120,30,0.20) 52%, rgba(22,16,6,0.42) 100%)'
                    : `linear-gradient(180deg, ${topBand} 0%, ${theme.mid} 54%, ${theme.deep} 100%)`
                const cardStyle: React.CSSProperties = {
                  position: 'relative',
                  borderRadius: 14, overflow: 'hidden', cursor: actionable ? 'pointer' : 'default',
                  // Opaque base under the tint, never the tint as the surface.
                  // Ready gets a warm one so the gold has somewhere to sit.
                  backgroundColor: ready ? '#150e04' : '#0c1018',
                  background: ready || !zoneArt ? scrim : `${scrim}, url(${zoneArt}) center / cover`,
                  border: `1.5px solid ${flashing ? `${theme.accent}cc` : ready ? `${GOLD}d8` : running ? `${theme.accent}88` : sendable ? `${theme.accent}99` : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: ready ? `0 0 18px ${GOLD}4a` : flashing ? `0 0 18px ${theme.accent}66` : sendable ? `0 0 10px ${theme.accent}33` : running ? `0 0 12px ${theme.accent}22` : 'none',
                  // …and desaturate the whole card (art + gradient) to gray + dim,
                  // so they read as plainly unavailable, not just a dark zone.
                  filter: inert ? 'grayscale(1) brightness(0.82)' : undefined,
                  opacity: cardState === 'locked' ? 0.48 : cardState === 'noslot' ? 0.55 : 1,
                  display: 'flex', flexDirection: 'column',
                }
                const motionProps = {
                  initial: { opacity: 0, y: 8 },
                  animate: flashing
                    ? { opacity: 1, y: 0, scale: [1, 1.04, 1] }
                    : ready
                      // Breathing is a TRANSFORM now. The old version animated
                      // boxShadow every frame, which repaints the whole card.
                      ? { opacity: 1, y: 0, scale: [1, 1.014, 1] }
                      : { opacity: 1, y: 0, scale: 1 },
                  transition: flashing
                    ? { duration: 0.5, ease: 'easeOut' as const }
                    : ready
                      ? { scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const } }
                      : { delay: 0.04 * i, type: 'spring' as const, stiffness: 420, damping: 30 },
                  ...(actionable ? { whileTap: { scale: 0.96 } } : {}),
                  onClick: onTapCard,
                }
                const body = (portraitSize: number, barMaxW?: number) => (
                  <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '0.85rem 0.55rem 0.9rem', width: '100%' }}>
                    {/* Crew bobs on the water while at sea / ready to collect.
                        CSS loop, so it costs the main thread nothing per frame. */}
                    <div className={(running || ready) ? 'trawl-bob' : undefined}>
                      <Portrait crew={t?.crew ?? null} size={portraitSize} glow={glow} />
                    </div>
                    <div style={{ width: '100%', minWidth: 0, textAlign: 'center' }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#fbf4e2', textShadow: '0 1px 5px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)', lineHeight: 1.15 }}>{z.label}</p>
                      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#ded5c0', textShadow: '0 1px 4px rgba(0,0,0,0.95)', lineHeight: 1.35, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t ? t.crew.name : `${fmtTrawlDuration(z.key)} cycle`}
                      </p>
                    </div>
                    {/* Status pill — dark plate keeps it readable over any water. */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2,
                      padding: '0.24rem 0.62rem', borderRadius: 999,
                      // Filled means SOLID, not a wash. A 2a tint over a card
                      // that is itself already gold read as barely a pill at all.
                      ...(status.filled ? ctaPill() : {
                        background: 'rgba(0,0,0,0.5)',
                        border: `1px solid ${status.c}55`,
                        boxShadow: 'none',
                      }),
                    }}>
                      {status.dot && <span className="trawl-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: status.c, boxShadow: `0 0 6px ${status.c}`, flexShrink: 0 }} />}
                      <span className="font-cinzel font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.07em', color: status.filled ? CTA_TEXT : status.c, textShadow: status.filled ? 'none' : '0 1px 2px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>{status.label}</span>
                    </div>
                    {running && (
                      <div style={{ width: '100%', maxWidth: barMaxW, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 2 }}>
                        <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent}aa)`, boxShadow: `0 0 8px ${theme.accent}99`, transition: 'width 1s linear' }} />
                      </div>
                    )}
                  </div>
                )
                const fx = (<>{running && <Bubbles color={theme.accent} />}{flashing && <SplashRings color={theme.accent} />}</>)

                if (wide) {
                  return (
                    <motion.div key={z.key} {...motionProps} style={{ ...cardStyle, gridColumn: '1 / -1' }}>
                      {fx}
                      {body(50, 260)}
                    </motion.div>
                  )
                }
                return (
                  <motion.div key={z.key} {...motionProps} style={{ ...cardStyle, minHeight: 134 }}>
                    {fx}
                    {body(46)}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Crew picker — shows each crew's estimated yield FOR THIS ZONE ─────────
  const recentIds = picking ? readRecentCrew(picking) : []
  const lastId = recentIds.length > 0 ? recentIds[0] : NaN
  const pickZone = picking ? state.zones.find(z => z.key === picking) : null
  // ONE rule for who is offerable, so Quick Send can never surface a hand the
  // grid is currently filtering out — otherwise the default "free" filter would
  // hide raid crew from the list while still pushing one at the top of the sheet.
  const matchesWho = (c: TrawlCrewView) =>
    trawlWho === 'all' || (trawlWho === 'raid' ? c.inRaidParty === true : c.inRaidParty !== true)
  // QUICK SEND — the last hand you sent to THIS zone, if they're free again.
  // Most trawl sends are the same crew to the same water, and that round trip
  // was costing a scroll through the whole roster every cycle.
  const quickCrew = picking ? state.freeCrew.find(c => c.id === lastId && matchesWho(c)) ?? null : null
  const quickEst = quickCrew && picking ? expectedTrawlHaul(picking, quickCrew.savvy, quickCrew.fortune) : null
  // Sorted by what the run actually PAYS, not by raw stats. Savvy and Fortune
  // convert at different rates per zone, so a stat sum never matched the
  // estimate printed on the tile and the top card was often not the best one.
  const rankedCrew = picking
    ? state.freeCrew
        .filter(matchesWho)
        .map(c => ({ c, est: expectedTrawlHaul(picking, c.savvy, c.fortune) }))
        .sort((a, b) => {
          if (trawlSort === 'recent') {
            // Sent-before first, newest first. Anyone never sent to this water
            // sorts after them, and falls back to best XP among themselves.
            const ai = recentIds.indexOf(a.c.id)
            const bi = recentIds.indexOf(b.c.id)
            if (ai !== bi) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi)
            return b.est.xp - a.est.xp
          }
          return trawlSort === 'doubloons' ? b.est.doubloons - a.est.doubloons : b.est.xp - a.est.xp
        })
    : []
  const allOrderedCrew = rankedCrew.map(r => r.c)
  // Quick Send already offers the last hand above, so keep them out of the
  // preview rather than showing the same crew twice in the first six.
  const previewPool = quickCrew ? allOrderedCrew.filter(c => c.id !== quickCrew.id) : allOrderedCrew
  const orderedCrew = showAllCrew ? previewPool : previewPool.slice(0, CREW_PREVIEW)
  const hiddenCrewCount = previewPool.length - orderedCrew.length
  // Tag the strongest crew for each goal (Savvy → XP, Fortune → doubloons) so a
  // min-maxer can pick at a glance. Only when there's an actual choice to make.
  // Best-of tags rank the whole free crew, so filtering the list does not
  // move the crown onto a weaker hand.
  const ests = picking ? state.freeCrew.map(c => ({ id: c.id, ...expectedTrawlHaul(picking, c.savvy, c.fortune) })) : []
  const bestXpId = state.freeCrew.length > 1 && ests.length ? ests.reduce((a, b) => (b.xp > a.xp ? b : a)).id : -1
  const bestDblId = state.freeCrew.length > 1 && ests.length ? ests.reduce((a, b) => (b.doubloons > a.doubloons ? b : a)).id : -1
  const picker = (
    <AnimatePresence>
      {picking && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPicking(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(4,8,14,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 470, maxHeight: '84vh', overflowY: 'auto', background: 'linear-gradient(180deg, #16130f 0%, #0c0906 100%)', borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(196,169,106,0.34)', padding: '1.2rem 1.1rem calc(1.5rem + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8' }}>Send a crew to the {pickZone?.label}</p>
              <CloseBtn onClick={() => setPicking(null)} label="Back" />
            </div>
            <p className="font-karla" style={{ fontSize: '0.76rem', color: '#bcb29a', lineHeight: 1.45, margin: '4px 0 10px' }}>
              Locked at sea for the full <span style={{ color: '#e6dcc2' }}>{picking ? fmtTrawlDuration(picking) : ''}</span> cycle. <span style={{ color: BLUE }}>Savvy</span> earns fishing XP, <span style={{ color: GOLD }}>Fortune</span> earns doubloons.
            </p>
            {/* QUICK SEND. The same hand goes back to the same water most
                cycles, so that choice gets made once and repeated in a tap
                instead of scrolling the roster again. Only shown when the crew
                you last sent here is actually free again. */}
            {quickCrew && quickEst && (
              <motion.button
                disabled={busy}
                onClick={() => picking && doDeploy(picking, quickCrew.id)}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.55rem 0.7rem', marginBottom: 10, borderRadius: 13, textAlign: 'left',
                  background: sendingId === quickCrew.id ? `${GREEN}22` : 'rgba(159,192,239,0.10)',
                  border: `1px solid ${sendingId === quickCrew.id ? `${GREEN}88` : 'rgba(159,192,239,0.45)'}`,
                  cursor: 'pointer', opacity: busy && sendingId !== quickCrew.id ? 0.5 : 1,
                }}>
                <Portrait crew={quickCrew} size={42} glow={sendingId === quickCrew.id ? GREEN : undefined} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-karla font-800 uppercase" style={{ display: 'block', fontSize: '0.52rem', letterSpacing: '0.1em', color: BLUE }}>
                    {quickCrew.inRaidParty ? 'Send again · in raid party' : 'Send again'}
                  </span>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.92rem', color: '#f4ecd8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sendingId === quickCrew.id ? 'Sending…' : quickCrew.name}
                  </span>
                  <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.62rem', color: '#a89e86', whiteSpace: 'nowrap' }}>
                    ~<span style={{ color: GREEN }}>{quickEst.xp.toLocaleString()} xp</span> · ~<span style={{ color: GOLD }}>{quickEst.doubloons.toLocaleString()} ⟡</span>
                  </span>
                </span>
              </motion.button>
            )}
            {/* Controls. Sort by what you actually want out of the run, and
                filter on the one thing that costs you something elsewhere. */}
            {/* Also shown with a SINGLE free hand when that hand is in the raid
                party: the who-filter is the only thing standing between the
                player and the empty list, so hiding it there hid the fix. */}
            {(state.freeCrew.length > 1 || state.freeCrew.some(c => c.inRaidParty)) && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {([
                  { key: 'sort' as const, value: trawlSort, set: setTrawlSort as (v: string) => void, opts: [
                    { k: 'xp', label: 'Best XP', color: GREEN },
                    { k: 'doubloons', label: 'Best ⟡', color: GOLD },
                    { k: 'recent', label: 'Recent', color: BLUE },
                  ] },
                  { key: 'who' as const, value: trawlWho, set: setTrawlWho as (v: string) => void, opts: [
                    { k: 'all', label: 'All', color: '#bcb29a' },
                    { k: 'free', label: 'Free', color: '#bcb29a' },
                    { k: 'raid', label: 'In raid', color: '#e07c7c' },
                  ] },
                ]).map(group => (
                  <div key={group.key} style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    {group.opts.map(o => {
                      const on = group.value === o.k
                      return (
                        <button key={o.k} type="button" onClick={() => group.set(o.k)}
                          className="font-karla font-700 uppercase tracking-[0.06em]"
                          aria-pressed={on}
                          style={{
                            padding: '0.28rem 0.6rem', borderRadius: 999, fontSize: '0.56rem',
                            background: on ? `${o.color}26` : 'transparent',
                            border: `1px solid ${on ? `${o.color}88` : 'transparent'}`,
                            color: on ? o.color : 'rgba(255,255,255,0.5)',
                            cursor: 'pointer', whiteSpace: 'nowrap', touchAction: 'manipulation',
                          }}>
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
            {allOrderedCrew.length === 0 && !quickCrew && (state.freeCrew.length === 0
              ? <p className="font-karla" style={{ fontSize: '0.84rem', color: '#a89e86', textAlign: 'center', padding: '2rem 0' }}>No free crew — they&apos;re all at sea, raiding, or voyaging. Recruit more in the Crew Hall.</p>
              : trawlWho === 'free' && state.freeCrew.some(c => c.inRaidParty)
                // The default filter hides raid hands, so say WHY the list is
                // empty rather than blaming an invisible filter.
                // THE INSTRUCTION IS THE BUTTON. This used to read "tap In raid
                // above", naming a filter chip that is itself hidden while you
                // have only one free hand, which is exactly the state that
                // produces this message. So the one player who most needed the
                // way out was told to press something that was not on screen.
                // A button here cannot go missing and cannot be misread.
                ? <div style={{ textAlign: 'center', padding: '1.4rem 0' }}>
                    <p className="font-karla" style={{ fontSize: '0.84rem', color: '#a89e86', lineHeight: 1.5 }}>
                      Every hand you have left is in your raid party. You can still send one, but they will be locked out of the raid for the whole cycle.
                    </p>
                    <button type="button" onClick={() => setTrawlWho('raid')}
                      className="font-karla font-700 uppercase tracking-[0.08em] tap"
                      style={{ marginTop: '0.85rem', padding: '0.5rem 1rem', borderRadius: 999, fontSize: '0.62rem', background: 'rgba(224,124,124,0.14)', border: '1px solid rgba(224,124,124,0.55)', color: '#e07c7c', cursor: 'pointer' }}>
                      Show my raid party
                    </button>
                  </div>
                : <p className="font-karla" style={{ fontSize: '0.84rem', color: '#a89e86', textAlign: 'center', padding: '1.6rem 0' }}>No crew match that filter.</p>)}
            {/* Three across, art first — same language as the raid and voyage
                assign pickers, so choosing a hand feels the same everywhere. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {orderedCrew.map((c, i) => {
                const est = picking ? expectedTrawlHaul(picking, c.savvy, c.fortune) : { xp: 0, doubloons: 0 }
                const sending = sendingId === c.id
                const raid = c.inRaidParty === true
                return (
                  <motion.button key={c.id} disabled={busy} onClick={() => picking && doDeploy(picking, c.id)}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.3, 0.03 * i), type: 'spring', stiffness: 460, damping: 32 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '0.5rem 0.35rem 0.5rem', borderRadius: 13, textAlign: 'center',
                      background: sending ? `${GREEN}22` : 'rgba(28,24,19,0.96)',
                      border: `1px solid ${sending ? `${GREEN}88` : raid ? 'rgba(224,124,124,0.55)' : c.id === lastId ? 'rgba(159,192,239,0.45)' : 'rgba(255,255,255,0.1)'}`,
                      boxShadow: sending ? `0 0 14px ${GREEN}55` : 'none',
                      cursor: 'pointer', opacity: busy && !sending ? 0.5 : 1,
                    }}>
                    <Portrait crew={c} size={54} glow={sending ? GREEN : undefined} />
                    <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.72rem', lineHeight: 1.15, color: '#f4ecd8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sending ? 'Sending…' : c.name}
                    </span>
                    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#a89e86', whiteSpace: 'nowrap' }}>
                      Lv {c.level} · <span style={{ color: BLUE }}>{c.savvy}</span> · <span style={{ color: GOLD }}>{c.fortune}</span>
                    </span>
                    {/* The haul, which is the whole reason you are choosing. */}
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 2, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.07)', width: '86%' }}>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: GREEN, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                        {c.id === bestXpId && <BestTag color={GREEN} />}~{est.xp.toLocaleString()} xp
                      </span>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: GOLD, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                        {c.id === bestDblId && <BestTag color={GOLD} />}~{est.doubloons.toLocaleString()} ⟡
                      </span>
                    </span>
                    {/* A raid hand sent trawling is locked out of the raid for the
                        whole cycle. The list used to include them with no sign. */}
                    {raid && !sending && (
                      <span className="font-karla font-800 uppercase" style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.44rem', letterSpacing: '0.08em', color: '#1a0c0c', background: '#e07c7c', borderRadius: 4, padding: '0.08rem 0.24rem' }}>Raid</span>
                    )}
                    {c.id === lastId && !raid && !sending && (
                      <span className="font-karla font-700 uppercase" style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.44rem', letterSpacing: '0.06em', color: BLUE }}>Last</span>
                    )}
                  </motion.button>
                )
              })}
            </div>
            {hiddenCrewCount > 0 && (
              <button type="button" onClick={() => setShowAllCrew(true)}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  width: '100%', marginTop: 8, padding: '0.5rem', borderRadius: 11,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
                  color: '#bcb29a', fontSize: '0.6rem', cursor: 'pointer', touchAction: 'manipulation',
                }}>
                Show {hiddenCrewCount} more {hiddenCrewCount === 1 ? 'hand' : 'hands'}
              </button>
            )}
            {allOrderedCrew.some(c => c.inRaidParty) && (
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#e0a0a0', lineHeight: 1.45, marginTop: 12, textAlign: 'center' }}>
                A hand marked <span style={{ color: '#e07c7c' }}>Raid</span> is in your raid party. Trawling locks them at sea for the whole cycle, so they will not be aboard for a raid until they are back.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Collect reveal ───────────────────────────────────────────────────────
  const xpProg = reveal ? getXPProgress(reveal.newFishingXP) : null
  // Where the bar STARTS its fill: the player's progress before this haul's XP
  // was added, so the gain visibly pushes the bar forward. On a level-up it
  // starts empty (you genuinely entered a fresh level). Without this it always
  // animated from 0, reading as if every collect reset your level progress.
  const xpFromProgress = reveal
    ? (reveal.newFishingLevel > reveal.oldFishingLevel ? 0 : getXPProgress(reveal.newFishingXP - reveal.xpGained).progress)
    : 0
  const bump = reveal ? TRAWL_BUMPERS[reveal.bumper] : null
  const isUp = !!reveal && (reveal.bumper === 'good' || reveal.bumper === 'bumper' || reveal.bumper === 'jackpot')
  const revAccent = isUp && bump ? bump.accent : GOLD
  // Plain-language outcome: a vibe headline + the exact "X% more/less than usual"
  // so the haul reads in one glance instead of decoding a "×0.90" multiplier.
  // "Usual" = the ×1.0 expected haul; the spread runs ~-20%..+20%.
  const haulPct = reveal ? Math.round((reveal.mult - 1) * 100) : 0
  const haulHeadline = !reveal ? '' : (
    reveal.bumper === 'jackpot' ? 'A huge haul today!' :
    reveal.bumper === 'bumper' ? 'A big haul today!' :
    reveal.bumper === 'good' ? 'Caught more than usual today' :
    reveal.bumper === 'slim' ? 'Caught less than usual today' :
    'About a usual haul today'
  )
  const haulPhrase = haulPct > 0 ? `${haulPct}% more haul than usual`
    : haulPct < 0 ? `${-haulPct}% less haul than usual`
    : 'right on a usual haul'
  const collectReveal = (
    <AnimatePresence>
      {reveal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismissReveal}
          style={{ position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(4,8,14,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }} onClick={e => e.stopPropagation()}
            style={{ maxWidth: 350, width: '100%', textAlign: 'center', padding: '1.7rem 1.5rem', borderRadius: 18, background: [`radial-gradient(ellipse 85% 62% at 50% 18%, ${revAccent}26 0%, transparent 70%)`, 'linear-gradient(180deg, rgba(40,32,16,0.97) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${revAccent}${isUp ? '9a' : '5e'}`, boxShadow: isUp ? `0 0 40px ${revAccent}33, inset 0 0 28px rgba(0,0,0,0.5)` : 'inset 0 0 28px rgba(0,0,0,0.5)' }}>
            {/* Hero — the crew that ran the haul, framed in the band accent so
                the tier reads at a glance and the screen has a face, not just
                numbers. */}
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 17 }}
              style={{ width: 82, height: 82, margin: '0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', overflow: 'hidden', background: `radial-gradient(circle at 50% 32%, ${revAccent}3a, rgba(0,0,0,0.4))`, border: `2px solid ${revAccent}${isUp ? 'cc' : '88'}`, boxShadow: isUp ? `0 0 26px ${revAccent}66, inset 0 0 14px rgba(0,0,0,0.4)` : `0 0 12px ${revAccent}33, inset 0 0 14px rgba(0,0,0,0.4)` }}>
              <Portrait crew={revealCrew} size={74} />
            </motion.div>

            {/* Plain-language outcome — a vibe headline, then the exact
                "X% more/less than usual" so the haul reads instantly instead
                of decoding a multiplier. */}
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}
              className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: revAccent, marginTop: 12, textShadow: isUp ? `0 0 12px ${revAccent}44` : 'none' }}>
              {haulHeadline}
            </motion.p>
            <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 320, damping: 17 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '0.3rem 0.9rem', borderRadius: 999, background: `${revAccent}${isUp ? '22' : '14'}`, border: `1px solid ${revAccent}${isUp ? 'cc' : '5e'}`, boxShadow: isUp ? `0 0 16px ${revAccent}55` : 'none' }}>
              {haulPct !== 0 && <span style={{ fontSize: '0.7rem', color: revAccent }}>{haulPct > 0 ? '▲' : '▼'}</span>}
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.08em', color: revAccent }}>{haulPhrase}</span>
            </motion.div>

            {/* Who + where — secondary context now that the outcome leads */}
            <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9c917a', marginTop: 8 }}>
              {reveal.crewName} · {state.zones.find(z => z.key === reveal.zone)?.label}
            </p>

            {/* Flavour event — a fresh little story for why the haul came in like it did */}
            {revealEvent && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
                className="font-karla" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#b6a988', marginTop: 7, lineHeight: 1.5 }}>
                &ldquo;{revealEvent}&rdquo;
              </motion.p>
            )}

            {/* Reward panel — the two payouts in one contained block, each on its
                own labelled row so it's obvious what landed where. */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.4 }}
              style={{ marginTop: 16, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,169,106,0.2)', padding: '0.9rem 1rem', textAlign: 'left' }}>
              {/* Fishing XP */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#7fae8f' }}>Fishing XP</span>
                <CountUp to={reveal.xpGained} prefix="+" className="font-cinzel font-800" style={{ fontSize: '1.55rem', color: GREEN, lineHeight: 1 }} />
              </div>
              {xpProg && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#e6dcc2' }}>Lv {reveal.newFishingLevel}</span>
                    <span className="font-karla" style={{ fontSize: '0.6rem', color: '#8a8068' }}>
                      {reveal.newFishingLevel >= MAX_LEVEL ? 'Max level' : `${Math.round(xpProg.progress * 100)}% to ${reveal.newFishingLevel + 1}`}
                    </span>
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                    <motion.div initial={{ width: `${Math.round(xpFromProgress * 100)}%` }} animate={{ width: `${Math.round(xpProg.progress * 100)}%` }} transition={{ delay: 0.35, duration: 0.7 }} style={{ height: '100%', background: `linear-gradient(90deg, #3fae78, ${GREEN})` }} />
                  </div>
                </div>
              )}

              <div style={{ height: 1, background: 'rgba(196,169,106,0.16)', margin: '11px 0' }} />

              {/* Doubloons → purse */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#bca27a' }}>Doubloons</span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                  <CountUp to={reveal.doubloonsGained} prefix="+" className="font-cinzel font-800" style={{ fontSize: '1.55rem', color: GOLD, lineHeight: 1 }} />
                  <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: GOLD }}>⟡</span>
                </span>
              </div>
            </motion.div>

            <motion.button onClick={dismissReveal} whileTap={{ scale: 0.92 }} className="font-cinzel font-700 uppercase" style={{ marginTop: 18, padding: '0.7rem 2rem', borderRadius: 12, letterSpacing: '0.1em', fontSize: '0.78rem', background: `${GOLD}22`, border: `1px solid ${GOLD}7a`, color: '#f4ecd8', boxShadow: `0 0 14px ${GOLD}22`, cursor: 'pointer' }}>Stow it</motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── New-slot-unlocked celebration ────────────────────────────────────────
  const slotUnlockOverlay = (
    <AnimatePresence>
      {slotUnlock !== null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSlotUnlock(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9450, background: 'rgba(4,8,14,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <motion.div initial={{ scale: 0.8, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 330, damping: 22 }} onClick={e => e.stopPropagation()}
            style={{ maxWidth: 350, width: '100%', textAlign: 'center', padding: '1.8rem 1.5rem', borderRadius: 20, background: ['radial-gradient(ellipse 90% 65% at 50% 18%, rgba(240,192,64,0.22) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(44,34,14,0.98) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}7a`, boxShadow: `0 0 40px ${GOLD}33, inset 0 0 30px rgba(0,0,0,0.5)` }}>
            <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
              className="font-karla font-700 uppercase" style={{ fontSize: '0.64rem', letterSpacing: '0.22em', color: GOLD }}>
              {slotUnlock === 1 ? 'Crew Trawls unlocked' : 'Trawl slot unlocked'}
            </motion.p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f4ecd8', lineHeight: 1.15, marginTop: 8 }}>
              {slotUnlock === 1 ? 'Send crew to fish for you' : `Run ${slotUnlock} trawls at once`}
            </p>
            {/* Slot pips */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '16px 0 4px' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + i * 0.08, type: 'spring', stiffness: 400 }}
                  style={{ width: 18, height: 18, borderRadius: '50%', background: i < slotUnlock ? GOLD : 'rgba(255,255,255,0.08)', border: `2px solid ${i < slotUnlock ? GOLD : 'rgba(255,255,255,0.18)'}`, boxShadow: i < slotUnlock ? `0 0 9px ${GOLD}` : 'none' }} />
              ))}
            </div>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#cfc6b0', lineHeight: 1.5, marginTop: 10 }}>
              {slotUnlock === 1
                ? 'Tap the crew icon on the left to send a crew fishing — they bring back XP and doubloons while you do other things.'
                : 'More slots means more zones fishing for you at the same time. Pick another zone to crew.'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => { setSlotUnlock(null); openPanel() }} className="font-cinzel font-700" style={{ flex: 1, padding: '0.65rem', borderRadius: 11, fontSize: '0.84rem', background: `${GOLD}22`, border: `1px solid ${GOLD}88`, color: '#f4ecd8', cursor: 'pointer' }}>Open Trawls</motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setSlotUnlock(null)} className="font-karla font-700 uppercase" style={{ padding: '0.65rem 1.2rem', borderRadius: 11, letterSpacing: '0.08em', fontSize: '0.68rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: '#cdd3db', cursor: 'pointer' }}>Later</motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Slot info (opened from the header chip) ──────────────────────────────
  const slotInfoOverlay = (
    <AnimatePresence>
      {slotInfo && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSlotInfo(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9300, background: 'rgba(4,8,14,0.86)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 470, background: 'linear-gradient(180deg, #1b1813 0%, #100c07 100%)', borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(196,169,106,0.34)', padding: '1.2rem 1.1rem calc(1.5rem + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8' }}>Trawl slots</p>
              <CloseBtn onClick={() => setSlotInfo(false)} />
            </div>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#bcb29a', lineHeight: 1.45, marginTop: 2 }}>
              Each slot lets one more zone fish for you at the same time. You have <span style={{ color: GOLD }}>{state.unlockedSlots} of {TRAWL_MAX_SLOTS}</span>.
            </p>

            <div style={{ display: 'flex', gap: 9, justifyContent: 'center', margin: '16px 0 6px' }}>
              {Array.from({ length: TRAWL_MAX_SLOTS }).map((_, i) => (
                <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < state.unlockedSlots ? GOLD : 'rgba(255,255,255,0.08)', border: `2px solid ${i < state.unlockedSlots ? GOLD : 'rgba(255,255,255,0.18)'}`, boxShadow: i < state.unlockedSlots ? `0 0 8px ${GOLD}88` : 'none' }} />
              ))}
            </div>

            {ns ? (
              <div style={{ marginTop: 12, padding: '0.85rem 0.9rem', borderRadius: 14, background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)' }}>
                <p className="font-karla font-700" style={{ fontSize: '0.84rem', color: '#dccba6', marginBottom: 8 }}>Unlock slot {ns.slot} — reach BOTH:</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Req label="Fishing Lv" need={ns.fishing} have={state.fishingLevel} />
                  {ns.nav > 0 && <Req label="Nav Lv" need={ns.nav} have={state.navLevel} />}
                </div>
                <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a89e86', lineHeight: 1.5, marginTop: 10 }}>
                  Raise <span style={{ color: '#e6dcc2' }}>Fishing</span> by catching fish. Raise <span style={{ color: '#e6dcc2' }}>Navigation</span> on raids and voyages.
                </p>
              </div>
            ) : (
              <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: GREEN, textAlign: 'center', marginTop: 10 }}>All {TRAWL_MAX_SLOTS} slots unlocked — your whole fleet&apos;s at work.</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  const coinFx = (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 9500, pointerEvents: 'none' }}>
      <AnimatePresence>
        {coins.map((c, i) => (
          <motion.div key={c.id}
            initial={{ left: '50%', top: '52%', opacity: 1, scale: 1 }}
            animate={{ left: 'calc(100% - 40px)', top: 18, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.65, delay: i * 0.04, ease: 'easeIn' }}
            style={{ position: 'absolute', width: 13, height: 13, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #ffe79a, ${GOLD})`, boxShadow: `0 0 8px ${GOLD}` }} />
        ))}
      </AnimatePresence>
    </div>
  )

  return (
    <>
      {!dock && indicatorButton}
      {mounted && createPortal(<>{panel}{picker}{slotInfoOverlay}{collectReveal}{slotUnlockOverlay}{coinFx}</>, document.body)}
    </>
  )
}
