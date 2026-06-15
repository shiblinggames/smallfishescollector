'use client'

// Trawls UI — the fishing-screen overlay. A single circular crew-captain
// portrait on the LEFT (empty when no crew's out; shows the most-actionable
// trawl's crew + a collect-glow / countdown when active). Tapping opens the
// Trawls panel where you collect a finished trawl then redeploy. Collecting
// fires the satisfying reveal (coins fly to the Nav purse, fishing XP ticks).
// Self-contained + portalled to <body> so no fixed-positioning ancestor traps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getTrawlState, deployTrawl, collectTrawl } from './trawls/actions'
import {
  type TrawlState, type TrawlZoneKey, type ActiveTrawlView, type TrawlCrewView, type CollectTrawlResult,
} from './trawls/constants'
import { getXPProgress } from '@/lib/fishingLevel'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f?: string) => (f ? `${SUPA}/storage/v1/object/public/card-arts/${f}` : '')
const GOLD = '#f0c040'
const GREEN = '#7bf0b0'
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
        : <div style={{ width: '46%', height: '46%', borderRadius: '50%', border: '2px dashed rgba(196,169,106,0.4)' }} />}
    </div>
  )
}

export default function TrawlIndicator() {
  const [state, setState] = useState<TrawlState | null>(null)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [picking, setPicking] = useState<TrawlZoneKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState<CollectTrawlResult | null>(null)
  const [coins, setCoins] = useState<{ id: number }[]>([])
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

  // Tick countdowns while any trawl is out (for the indicator glow + panel).
  useEffect(() => {
    if (activeTrawls.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeTrawls.length])

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
  const ringColor = anyReady ? GOLD : indicatorTrawl ? 'rgba(196,169,106,0.6)' : 'rgba(196,169,106,0.32)'

  async function doDeploy(zone: TrawlZoneKey, crewId: number) {
    if (busy) return
    setBusy(true)
    haptic(18)
    const r = await deployTrawl(zone, crewId)
    setBusy(false)
    if ('error' in r) { haptic([10, 40, 10]); return }
    try { localStorage.setItem(lastCrewKey(zone), String(crewId)) } catch { /* no-op */ }
    setState(r); setPicking(null); setNow(Date.now())
  }

  async function doCollect(zone: TrawlZoneKey) {
    if (busy) return
    setBusy(true)
    const r = await collectTrawl(zone)
    setBusy(false)
    if ('error' in r) return
    haptic([0, 25, 40, 30])
    // Tick the real fishing-screen bars + the Nav purse.
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    window.dispatchEvent(new CustomEvent('fishing-xp-changed', { detail: r.newFishingXP }))
    // Coins fly toward the purse (top-right).
    setCoins(Array.from({ length: 8 }, () => ({ id: pid.current++ })))
    setTimeout(() => setCoins([]), 900)
    setReveal(r)
    void refresh()
  }

  // ── Indicator ──────────────────────────────────────────────────────────────
  const indicator = (
    // Outer wrapper owns the fixed position + translate centering; the inner
    // motion.button only animates scale, so framer never clobbers the translate.
    <div style={{ position: 'fixed', left: 10, top: '46%', transform: 'translateY(-50%)', zIndex: 4000, pointerEvents: 'auto' }}>
    <motion.button
      onClick={() => { setOpen(true); haptic(8) }}
      aria-label="Trawls"
      animate={anyReady ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={anyReady ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
      }}
    >
      <div style={{ position: 'relative' }}>
        <Portrait crew={indicatorTrawl?.crew ?? null} size={52} glow={anyReady ? GOLD : undefined} />
        {activeTrawls.length > 1 && (
          <span className="font-cinzel font-700" style={{
            position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px',
            background: '#1c140a', border: `1.5px solid ${ringColor}`, color: '#f4ecd8', fontSize: '0.6rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{activeTrawls.length}</span>
        )}
      </div>
      <span className="font-karla font-700" style={{
        fontSize: '0.52rem', letterSpacing: '0.06em', padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
        background: 'rgba(8,12,18,0.78)', border: `1px solid ${ringColor}`,
        color: anyReady ? GOLD : indicatorTrawl ? '#e0d6bc' : '#9a9078',
      }}>
        {anyReady ? 'Collect' : indicatorTrawl ? fmtCountdown(indicatorMs) : 'Trawls'}
      </span>
    </motion.button>
    </div>
  )

  // ── Panel ────────────────────────────────────────────────────────────────
  const freeSlots = state.unlockedSlots - activeTrawls.length
  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => { setOpen(false); setPicking(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(4,8,14,0.78)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 460, maxHeight: '82vh', overflowY: 'auto',
              background: 'linear-gradient(180deg, #1b1813 0%, #100c07 100%)',
              borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid rgba(196,169,106,0.34)',
              padding: '1.1rem 1rem 1.4rem',
            }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f4ecd8' }}>Trawls</p>
              <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#a89878' }}>
                {activeTrawls.length}/{state.unlockedSlots} out{state.nextSlot ? ` · next slot: Fishing ${state.nextSlot.fishing}${state.nextSlot.nav ? ` + Nav ${state.nextSlot.nav}` : ''}` : ''}
              </span>
            </div>
            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#9a9078', lineHeight: 1.4, marginBottom: 12 }}>
              Send a crew to fish a zone for an hour. Savvy earns fishing XP, Fortune earns doubloons. One crew per zone.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {state.zones.map(z => {
                const t = z.trawl
                const ready = t ? new Date(t.endsAt).getTime() <= now : false
                const ms = t ? new Date(t.endsAt).getTime() - now : 0
                return (
                  <div key={z.key} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.65rem', borderRadius: 12,
                    background: ready ? `${GOLD}14` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${ready ? `${GOLD}66` : 'rgba(255,255,255,0.08)'}`,
                    opacity: z.unlocked ? 1 : 0.5,
                  }}>
                    <Portrait crew={t?.crew ?? null} size={40} glow={ready ? GOLD : undefined} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: '#f4ecd8' }}>{z.label}</p>
                      <p className="font-karla" style={{ fontSize: '0.58rem', color: '#9a9078', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {!z.unlocked ? `Reach Fishing Level ${z.minLevel}`
                          : t ? `${t.crew.name} · ${ready ? 'haul ready' : fmtCountdown(ms)}`
                          : 'Idle'}
                      </p>
                    </div>
                    {z.unlocked && (
                      t
                        ? ready
                          ? <button disabled={busy} onClick={() => doCollect(z.key)} className="font-cinzel font-700" style={btn(GOLD)}>Collect</button>
                          : <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#bcae8a', fontVariantNumeric: 'tabular-nums' }}>{fmtCountdown(ms)}</span>
                        : freeSlots > 0
                          ? <button disabled={busy} onClick={() => setPicking(z.key)} className="font-karla font-700 uppercase" style={btn('#7aa7ff', true)}>Send</button>
                          : <span className="font-karla" style={{ fontSize: '0.56rem', color: '#6a6452' }}>No slot</span>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Crew picker (sub-overlay) ────────────────────────────────────────────
  const lastId = picking ? Number(typeof localStorage !== 'undefined' ? localStorage.getItem(lastCrewKey(picking)) : '') : NaN
  const orderedCrew = picking
    ? [...state.freeCrew].sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : (b.savvy + b.fortune) - (a.savvy + a.fortune)))
    : []
  const picker = (
    <AnimatePresence>
      {picking && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPicking(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(4,8,14,0.86)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 env(safe-area-inset-bottom)' }}>
          <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }} onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto', background: 'linear-gradient(180deg, #1b1813 0%, #100c07 100%)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid rgba(196,169,106,0.34)', padding: '1.1rem 1rem 1.4rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f4ecd8', marginBottom: 2 }}>Crew the {state.zones.find(z => z.key === picking)?.label}</p>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#9a9078', marginBottom: 12 }}>They&apos;re locked at sea for the full hour. Higher Savvy = more XP, higher Fortune = more doubloons.</p>
            {orderedCrew.length === 0 && <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8068', textAlign: 'center', padding: '1.5rem 0' }}>No free crew — they&apos;re all at sea, raiding, or voyaging.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {orderedCrew.map(c => (
                <button key={c.id} disabled={busy} onClick={() => doDeploy(picking, c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.6rem', borderRadius: 12, background: c.id === lastId ? 'rgba(122,167,255,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${c.id === lastId ? 'rgba(122,167,255,0.4)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', textAlign: 'left' }}>
                  <Portrait crew={c} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#f4ecd8' }}>{c.name}{c.id === lastId && <span style={{ color: '#7aa7ff', fontSize: '0.54rem', marginLeft: 6 }}>last used</span>}</p>
                    <p className="font-karla" style={{ fontSize: '0.58rem', color: '#9a9078' }}>Lv {c.level} · <span style={{ color: '#9fc0ef' }}>{c.savvy} SAV</span> · <span style={{ color: GOLD }}>{c.fortune} FTN</span></p>
                  </div>
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#7aa7ff' }}>Send →</span>
                </button>
              ))}
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
            style={{ maxWidth: 340, width: '100%', textAlign: 'center', padding: '1.6rem 1.4rem', borderRadius: 18, background: ['radial-gradient(ellipse 80% 60% at 50% 22%, rgba(196,169,106,0.16) 0%, transparent 70%)', 'linear-gradient(180deg, rgba(40,32,16,0.97) 0%, rgba(20,14,7,0.98) 100%)'].join(', '), border: `1px solid ${GOLD}5e`, boxShadow: 'inset 0 0 28px rgba(0,0,0,0.5)' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD }}>Haul secured.</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#dccba6', marginTop: 4 }}>{reveal.crewName} trawled the {state.zones.find(z => z.key === reveal.zone)?.label}.</p>

            {reveal.fish.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', margin: '12px 0' }}>
                {reveal.fish.map((f, i) => (
                  <motion.span key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 320 }}
                    className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#cfc6b0', padding: '0.2rem 0.55rem', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>{f}</motion.span>
                ))}
              </div>
            )}

            <CountUp to={reveal.xpGained} prefix="+" className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: GREEN, display: 'block', marginTop: 6 }} />
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.18em', color: '#7fae8f' }}>fishing xp</p>
            {xpProg && (
              <div style={{ margin: '6px auto 0', maxWidth: 220, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(xpProg.progress * 100)}%` }} transition={{ delay: 0.3, duration: 0.7 }} style={{ height: '100%', background: `linear-gradient(90deg, #3fae78, ${GREEN})` }} />
              </div>
            )}

            <CountUp to={reveal.doubloonsGained} prefix="+" className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: GOLD, display: 'block', marginTop: 12 }} />
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.18em', color: '#bca27a' }}>doubloons → purse</p>

            <button onClick={() => setReveal(null)} className="font-karla font-700 uppercase" style={{ marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.66rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>Nice</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // Coins flying to the purse (top-right).
  const coinFx = (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 9500, pointerEvents: 'none' }}>
      <AnimatePresence>
        {coins.map((c, i) => (
          <motion.div key={c.id}
            initial={{ left: '50%', top: '52%', opacity: 1, scale: 1 }}
            animate={{ left: 'calc(100% - 40px)', top: 18, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.65, delay: i * 0.04, ease: 'easeIn' }}
            style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #ffe79a, ${GOLD})`, boxShadow: `0 0 8px ${GOLD}` }} />
        ))}
      </AnimatePresence>
    </div>
  )

  if (!mounted) return null
  return createPortal(<>{indicator}{panel}{picker}{collectReveal}{coinFx}</>, document.body)
}

function btn(color: string, small = false): React.CSSProperties {
  return {
    padding: small ? '0.32rem 0.7rem' : '0.34rem 0.8rem', borderRadius: 9, fontSize: small ? '0.58rem' : '0.7rem',
    letterSpacing: small ? '0.08em' : undefined,
    background: `${color}1f`, border: `1px solid ${color}77`, color: color === GOLD ? '#f4ecd8' : color, cursor: 'pointer',
  }
}
