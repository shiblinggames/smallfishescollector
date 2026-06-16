'use client'

// Trawls UI — the fishing-screen overlay. A circular crew-captain portrait on
// the LEFT (empty when no crew's out; the soonest/ready crew + countdown or a
// gold collect-glow when active). It lives in the z-15 HUD layer (passed
// `hidden` while a fishing panel is open) so it never floats over a modal; the
// Trawls panel / picker / collect reveal portal to <body> above everything.
// Collecting fires the reveal (coins fly to the Nav purse, fishing XP ticks).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getTrawlState, deployTrawl, collectTrawl } from './trawls/actions'
import {
  TRAWL_MAX_SLOTS, expectedTrawlHaul, fmtTrawlDuration, trawlDurationMs,
  type TrawlState, type TrawlZoneKey, type ActiveTrawlView, type TrawlCrewView, type CollectTrawlResult,
} from './trawls/constants'
import { getXPProgress } from '@/lib/fishingLevel'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f?: string) => (f ? `${SUPA}/storage/v1/object/public/card-arts/${f}` : '')
const GOLD = '#f0c040'
const GREEN = '#7bf0b0'
const BLUE = '#9fc0ef'
const TEAL = '#5fd0c4'  // "at sea / in progress" accent
function haptic(p: number | number[]) { try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p) } catch { /* no-op */ } }
const lastCrewKey = (z: string) => `trawl_last_crew_${z}`

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Ready'
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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

function Portrait({ crew, size = 52, glow }: { crew: TrawlCrewView | null; size?: number; glow?: string }) {
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
}

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

export default function TrawlIndicator({ hidden = false }: { hidden?: boolean }) {
  const [state, setState] = useState<TrawlState | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [picking, setPicking] = useState<TrawlZoneKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState<CollectTrawlResult | null>(null)
  const [coins, setCoins] = useState<{ id: number }[]>([])
  const [flashZone, setFlashZone] = useState<TrawlZoneKey | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [slotUnlock, setSlotUnlock] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const pid = useRef(0)

  useEffect(() => { setMounted(true) }, [])

  const refresh = useCallback(async () => {
    const r = await getTrawlState()
    if (!('error' in r)) setState(r)
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const activeTrawls: ActiveTrawlView[] = useMemo(
    () => (state ? state.zones.map(z => z.trawl).filter((t): t is ActiveTrawlView => t !== null) : []),
    [state],
  )

  useEffect(() => {
    if (activeTrawls.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeTrawls.length])

  // A fishing OR nav level-up can unlock a new trawl slot. Re-check on a
  // fishing level-up (event) — nav unlocks are caught on next refresh/mount.
  useEffect(() => {
    const onLeveled = () => { void refresh() }
    window.addEventListener('fishing-leveled', onLeveled)
    return () => window.removeEventListener('fishing-leveled', onLeveled)
  }, [refresh])

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
      setSlotUnlock(state.unlockedSlots)
      haptic([0, 30, 60, 30, 60, 40])
      try { localStorage.setItem('trawl_seen_slots', String(state.unlockedSlots)) } catch { /* no-op */ }
    }
  }, [state])

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
    setBusy(true); setSendingId(crewId); haptic([0, 12, 30, 18]) // immediate "thunk" on tap
    const r = await deployTrawl(zone, crewId)
    setBusy(false); setSendingId(null)
    if ('error' in r) { haptic([10, 40, 10]); return }
    try { localStorage.setItem(lastCrewKey(zone), String(crewId)) } catch { /* no-op */ }
    setState(r); setPicking(null); setNow(Date.now())
    // Pop-flash the zone that just got a crew so the change reads.
    setFlashZone(zone); setTimeout(() => setFlashZone(null), 850)
  }

  async function doCollect(zone: TrawlZoneKey) {
    if (busy) return
    setBusy(true)
    const r = await collectTrawl(zone)
    setBusy(false)
    if ('error' in r) return
    haptic([0, 25, 40, 30])
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    window.dispatchEvent(new CustomEvent('fishing-xp-changed', { detail: r.newFishingXP }))
    setCoins(Array.from({ length: 8 }, () => ({ id: pid.current++ })))
    setTimeout(() => setCoins([]), 900)
    setReveal(r)
    void refresh()
  }

  // ── Indicator (inline, z-15 HUD layer) ───────────────────────────────────
  const indicatorButton = !hidden && (
    <div style={{ position: 'absolute', left: 10, top: '44%', transform: 'translateY(-50%)', zIndex: 15 }}>
      <motion.button
        onClick={() => { setOpen(true); haptic(12) }}
        aria-label="Trawls"
        animate={anyReady ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        whileTap={{ scale: 0.88 }}
        transition={anyReady ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 500, damping: 22 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <div style={{ position: 'relative' }}>
          <Portrait crew={indicatorTrawl?.crew ?? null} size={54} glow={anyReady ? GOLD : undefined} />
          {activeTrawls.length > 1 && (
            <span className="font-cinzel font-700" style={{
              position: 'absolute', top: -4, right: -4, minWidth: 19, height: 19, borderRadius: 10, padding: '0 4px',
              background: '#1c140a', border: `1.5px solid ${ringColor}`, color: '#f4ecd8', fontSize: '0.66rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{activeTrawls.length}</span>
          )}
        </div>
        <span className="font-karla font-700" style={{
          fontSize: '0.62rem', letterSpacing: anyReady ? '0.14em' : '0.04em', padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
          background: anyReady ? `${GOLD}1c` : 'rgba(8,12,18,0.82)',
          border: `1px solid ${anyReady ? `${GOLD}55` : ringColor}`,
          color: anyReady ? GOLD : indicatorTrawl ? '#e6dcc2' : '#b6a98c',
        }}>
          {anyReady ? 'Ready' : indicatorTrawl ? fmtCountdown(indicatorMs) : 'Trawls'}
        </span>
      </motion.button>
    </div>
  )

  // ── Panel ────────────────────────────────────────────────────────────────
  const ns = state.nextSlot
  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => { setOpen(false); setPicking(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(4,8,14,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 470, maxHeight: '86vh', overflowY: 'auto',
              background: 'linear-gradient(180deg, #1b1813 0%, #100c07 100%)',
              borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(196,169,106,0.34)',
              padding: '1.2rem 1.1rem calc(1.5rem + env(safe-area-inset-bottom))',
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f4ecd8' }}>Trawls</p>
              <CloseBtn onClick={() => { setOpen(false); setPicking(null) }} />
            </div>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#bcb29a', lineHeight: 1.45, marginTop: 2 }}>
              Send a crew to passively fish a zone — collect their XP + doubloon haul when they return.
            </p>

            {/* Slots explainer */}
            <div style={{ marginTop: 14, padding: '0.85rem 0.9rem', borderRadius: 14, background: 'rgba(196,169,106,0.08)', border: '1px solid rgba(196,169,106,0.22)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f4ecd8' }}>
                  {state.unlockedSlots} of {TRAWL_MAX_SLOTS} trawl slots
                </span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {Array.from({ length: TRAWL_MAX_SLOTS }).map((_, i) => (
                    <div key={i} style={{ width: 13, height: 13, borderRadius: '50%', background: i < state.unlockedSlots ? GOLD : 'rgba(255,255,255,0.08)', border: `1.5px solid ${i < state.unlockedSlots ? GOLD : 'rgba(255,255,255,0.18)'}`, boxShadow: i < state.unlockedSlots ? `0 0 7px ${GOLD}88` : 'none' }} />
                  ))}
                </div>
              </div>
              {ns ? (
                <>
                  <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#dccba6', margin: '10px 0 6px' }}>Unlock slot {ns.slot} — reach BOTH:</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Req label="Fishing Lv" need={ns.fishing} have={state.fishingLevel} />
                    {ns.nav > 0 && <Req label="Nav Lv" need={ns.nav} have={state.navLevel} />}
                  </div>
                </>
              ) : (
                <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: GREEN, marginTop: 8 }}>All {TRAWL_MAX_SLOTS} slots unlocked — your whole fleet&apos;s at work.</p>
              )}
            </div>

            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#8a8068', margin: '16px 0 8px' }}>Fishing zones</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.zones.map((z, i) => {
                const t = z.trawl
                const ready = t ? new Date(t.endsAt).getTime() <= now : false
                const running = !!t && !ready
                const ms = t ? new Date(t.endsAt).getTime() - now : 0
                const progress = running ? Math.max(0, Math.min(1, 1 - ms / trawlDurationMs(z.key))) : 0
                const flashing = flashZone === z.key
                return (
                  <motion.div key={z.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={flashing ? { opacity: 1, y: 0, scale: [1, 1.04, 1] } : { opacity: 1, y: 0, scale: 1 }}
                    transition={flashing ? { duration: 0.5, ease: 'easeOut' } : { delay: 0.04 * i, type: 'spring', stiffness: 420, damping: 30 }}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 8, padding: '0.6rem 0.7rem', borderRadius: 13,
                      background: flashing ? `${GREEN}22` : ready ? `${GOLD}14` : running ? `${TEAL}12` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${flashing ? `${GREEN}88` : ready ? `${GOLD}66` : running ? `${TEAL}44` : 'rgba(255,255,255,0.08)'}`,
                      boxShadow: flashing ? `0 0 16px ${GREEN}55` : 'none',
                      opacity: z.unlocked ? 1 : 0.55,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <Portrait crew={t?.crew ?? null} size={42} glow={ready ? GOLD : running ? TEAL : flashing ? GREEN : undefined} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f4ecd8', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {z.label}
                          {running && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ width: 7, height: 7, borderRadius: '50%', background: TEAL, boxShadow: `0 0 6px ${TEAL}` }} />}
                        </p>
                        <p className="font-karla" style={{ fontSize: '0.72rem', color: ready ? GOLD : running ? TEAL : '#a89e86', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {!z.unlocked ? `Locked — Fishing Lv ${z.minLevel} (you're ${state.fishingLevel})`
                            : t ? (ready ? `${t.crew.name} · haul ready to collect` : `At sea · ${t.crew.name} · back in ${fmtCountdown(ms)}`)
                            : `Idle · ${fmtTrawlDuration(z.key)} cycle`}
                        </p>
                      </div>
                      {z.unlocked && (
                        t
                          ? ready
                            ? <motion.button whileTap={{ scale: 0.9 }} disabled={busy} onClick={() => doCollect(z.key)} className="font-cinzel font-700" style={btn(GOLD)}>Collect</motion.button>
                            : <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: TEAL, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtCountdown(ms)}</span>
                          : freeSlots > 0
                            ? <motion.button whileTap={{ scale: 0.9 }} disabled={busy} onClick={() => { haptic(10); setPicking(z.key) }} className="font-karla font-700 uppercase" style={btn(BLUE, true)}>Send</motion.button>
                            : <span className="font-karla" style={{ fontSize: '0.66rem', color: '#6a6452', whiteSpace: 'nowrap' }}>No free slot</span>
                      )}
                    </div>
                    {running && (
                      <div style={{ height: 5, borderRadius: 3, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${TEAL}, ${BLUE})`, transition: 'width 1s linear' }} />
                      </div>
                    )}
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
  const lastId = picking ? Number((typeof localStorage !== 'undefined' && localStorage.getItem(lastCrewKey(picking))) || NaN) : NaN
  const pickZone = picking ? state.zones.find(z => z.key === picking) : null
  const orderedCrew = picking
    ? [...state.freeCrew].sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : (b.savvy + b.fortune) - (a.savvy + a.fortune)))
    : []
  const picker = (
    <AnimatePresence>
      {picking && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPicking(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(4,8,14,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 470, maxHeight: '84vh', overflowY: 'auto', background: 'linear-gradient(180deg, #1b1813 0%, #100c07 100%)', borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(196,169,106,0.34)', padding: '1.2rem 1.1rem calc(1.5rem + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8' }}>Send a crew to the {pickZone?.label}</p>
              <CloseBtn onClick={() => setPicking(null)} label="Back" />
            </div>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#bcb29a', lineHeight: 1.45, margin: '4px 0 4px' }}>
              Locked at sea for the full <span style={{ color: '#e6dcc2' }}>{picking ? fmtTrawlDuration(picking) : ''}</span> cycle (can&apos;t raid or voyage). <span style={{ color: BLUE }}>Savvy</span> earns fishing XP, <span style={{ color: GOLD }}>Fortune</span> earns doubloons — the estimates show what each crew hauls per run here.
            </p>
            {orderedCrew.length === 0 && <p className="font-karla" style={{ fontSize: '0.84rem', color: '#a89e86', textAlign: 'center', padding: '2rem 0' }}>No free crew — they&apos;re all at sea, raiding, or voyaging. Recruit more in the Crew Hall.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
              {orderedCrew.map((c, i) => {
                const est = picking ? expectedTrawlHaul(picking, c.savvy, c.fortune) : { xp: 0, doubloons: 0 }
                const sending = sendingId === c.id
                return (
                  <motion.button key={c.id} disabled={busy} onClick={() => picking && doDeploy(picking, c.id)}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(0.3, 0.035 * i), type: 'spring', stiffness: 460, damping: 32 }}
                    whileTap={{ scale: 0.97 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.55rem 0.65rem', borderRadius: 13, background: sending ? `${GREEN}22` : c.id === lastId ? 'rgba(159,192,239,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${sending ? `${GREEN}88` : c.id === lastId ? 'rgba(159,192,239,0.4)' : 'rgba(255,255,255,0.08)'}`, boxShadow: sending ? `0 0 14px ${GREEN}55` : 'none', cursor: 'pointer', textAlign: 'left', opacity: busy && !sending ? 0.5 : 1 }}>
                    <Portrait crew={c} size={46} glow={sending ? GREEN : undefined} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#f4ecd8' }}>
                        {c.name}{c.id === lastId && <span style={{ color: BLUE, fontSize: '0.62rem', marginLeft: 6 }}>last used</span>}
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86' }}>
                        {sending ? 'Sending to sea…' : <>Lv {c.level} · <span style={{ color: BLUE }}>{c.savvy} Savvy</span> · <span style={{ color: GOLD }}>{c.fortune} Fortune</span></>}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: GREEN, lineHeight: 1.25 }}>~{est.xp.toLocaleString()} xp</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: GOLD, lineHeight: 1.25 }}>~{est.doubloons.toLocaleString()} ⟡</p>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Collect reveal ───────────────────────────────────────────────────────
  const xpProg = reveal ? getXPProgress(reveal.newFishingXP) : null
  const collectReveal = (
    <AnimatePresence>
      {reveal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setReveal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(4,8,14,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <motion.div initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 24 }} onClick={e => e.stopPropagation()}
            style={{ maxWidth: 350, width: '100%', textAlign: 'center', padding: '1.7rem 1.5rem', borderRadius: 18, background: ['radial-gradient(ellipse 80% 60% at 50% 22%, rgba(196,169,106,0.16) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.97) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: GOLD }}>Haul secured.</p>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#dccba6', marginTop: 4 }}>{reveal.crewName} trawled the {state.zones.find(z => z.key === reveal.zone)?.label}.</p>

            {reveal.fish.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', margin: '14px 0' }}>
                {reveal.fish.map((f, i) => (
                  <motion.span key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 320 }}
                    className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#cfc6b0', padding: '0.25rem 0.6rem', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>{f}</motion.span>
                ))}
              </div>
            )}

            <CountUp to={reveal.xpGained} prefix="+" className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: GREEN, display: 'block', marginTop: 6 }} />
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.18em', color: '#7fae8f' }}>fishing xp</p>
            {xpProg && (
              <div style={{ margin: '7px auto 0', maxWidth: 230, height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(xpProg.progress * 100)}%` }} transition={{ delay: 0.3, duration: 0.7 }} style={{ height: '100%', background: `linear-gradient(90deg, #3fae78, ${GREEN})` }} />
              </div>
            )}

            <CountUp to={reveal.doubloonsGained} prefix="+" className="font-cinzel font-700" style={{ fontSize: '1.45rem', color: GOLD, display: 'block', marginTop: 14 }} />
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.18em', color: '#bca27a' }}>doubloons → purse</p>

            <motion.button onClick={() => setReveal(null)} whileTap={{ scale: 0.92 }} className="font-karla font-700 uppercase" style={{ marginTop: 20, padding: '0.65rem 1.8rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.74rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>Nice</motion.button>
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
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => { setSlotUnlock(null); setOpen(true) }} className="font-cinzel font-700" style={{ flex: 1, padding: '0.65rem', borderRadius: 11, fontSize: '0.84rem', background: `${GOLD}22`, border: `1px solid ${GOLD}88`, color: '#f4ecd8', cursor: 'pointer' }}>Open Trawls</motion.button>
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => setSlotUnlock(null)} className="font-karla font-700 uppercase" style={{ padding: '0.65rem 1.2rem', borderRadius: 11, letterSpacing: '0.08em', fontSize: '0.68rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: '#cdd3db', cursor: 'pointer' }}>Later</motion.button>
            </div>
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
      {indicatorButton}
      {mounted && createPortal(<>{panel}{picker}{collectReveal}{slotUnlockOverlay}{coinFx}</>, document.body)}
    </>
  )
}

function btn(color: string, small = false): React.CSSProperties {
  return {
    padding: small ? '0.4rem 0.9rem' : '0.42rem 1rem', borderRadius: 10, fontSize: small ? '0.7rem' : '0.82rem',
    letterSpacing: small ? '0.06em' : undefined, whiteSpace: 'nowrap',
    background: `${color}22`, border: `1px solid ${color}88`, color: color === GOLD ? '#f4ecd8' : color, cursor: 'pointer',
  }
}
