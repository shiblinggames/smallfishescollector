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
  TRAWL_MAX_SLOTS, expectedTrawlHaul,
  type TrawlState, type TrawlZoneKey, type ActiveTrawlView, type TrawlCrewView, type CollectTrawlResult,
} from './trawls/constants'
import { getXPProgress } from '@/lib/fishingLevel'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f?: string) => (f ? `${SUPA}/storage/v1/object/public/card-arts/${f}` : '')
const GOLD = '#f0c040'
const GREEN = '#7bf0b0'
const BLUE = '#9fc0ef'
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
    setBusy(true); haptic(18)
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
        onClick={() => { setOpen(true); haptic(8) }}
        aria-label="Trawls"
        animate={anyReady ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={anyReady ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
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
          fontSize: '0.66rem', letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
          background: 'rgba(8,12,18,0.82)', border: `1px solid ${ringColor}`,
          color: anyReady ? GOLD : indicatorTrawl ? '#e6dcc2' : '#b6a98c',
        }}>
          {anyReady ? 'Collect!' : indicatorTrawl ? fmtCountdown(indicatorMs) : 'Trawls'}
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
            <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f4ecd8' }}>Trawls</p>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#bcb29a', lineHeight: 1.45, marginTop: 2 }}>
              Send a crew to fish a zone for 1 hour — even while you&apos;re away or doing other things. Come back to collect the haul, then send them again.
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
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a9078', lineHeight: 1.45, marginTop: 8 }}>
                    Raise <span style={{ color: BLUE }}>Fishing</span> by catching fish. Raise <span style={{ color: '#c8a0e0' }}>Nav</span> by raiding &amp; voyaging. More slots = more zones at once.
                  </p>
                </>
              ) : (
                <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: GREEN, marginTop: 8 }}>All {TRAWL_MAX_SLOTS} slots unlocked — your whole fleet&apos;s at work.</p>
              )}
            </div>

            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#8a8068', margin: '16px 0 8px' }}>Fishing zones</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.zones.map(z => {
                const t = z.trawl
                const ready = t ? new Date(t.endsAt).getTime() <= now : false
                const ms = t ? new Date(t.endsAt).getTime() - now : 0
                return (
                  <div key={z.key} style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '0.6rem 0.7rem', borderRadius: 13,
                    background: ready ? `${GOLD}14` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${ready ? `${GOLD}66` : 'rgba(255,255,255,0.08)'}`,
                    opacity: z.unlocked ? 1 : 0.55,
                  }}>
                    <Portrait crew={t?.crew ?? null} size={42} glow={ready ? GOLD : undefined} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f4ecd8' }}>{z.label}</p>
                      <p className="font-karla" style={{ fontSize: '0.72rem', color: ready ? GOLD : '#a89e86', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {!z.unlocked ? `Locked — Fishing Lv ${z.minLevel} (you're ${state.fishingLevel})`
                          : t ? `${t.crew.name} · ${ready ? 'haul ready to collect' : `back in ${fmtCountdown(ms)}`}`
                          : 'Idle — no crew fishing here'}
                      </p>
                    </div>
                    {z.unlocked && (
                      t
                        ? ready
                          ? <button disabled={busy} onClick={() => doCollect(z.key)} className="font-cinzel font-700" style={btn(GOLD)}>Collect</button>
                          : <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#bcae8a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtCountdown(ms)}</span>
                        : freeSlots > 0
                          ? <button disabled={busy} onClick={() => setPicking(z.key)} className="font-karla font-700 uppercase" style={btn(BLUE, true)}>Send</button>
                          : <span className="font-karla" style={{ fontSize: '0.66rem', color: '#6a6452', whiteSpace: 'nowrap' }}>No free slot</span>
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
            <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f4ecd8' }}>Send a crew to the {pickZone?.label}</p>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#bcb29a', lineHeight: 1.45, margin: '4px 0 4px' }}>
              They&apos;re locked at sea for the full hour (can&apos;t raid or voyage). <span style={{ color: BLUE }}>Savvy</span> earns fishing XP, <span style={{ color: GOLD }}>Fortune</span> earns doubloons — the estimates show what each crew would haul here.
            </p>
            {orderedCrew.length === 0 && <p className="font-karla" style={{ fontSize: '0.84rem', color: '#a89e86', textAlign: 'center', padding: '2rem 0' }}>No free crew — they&apos;re all at sea, raiding, or voyaging. Recruit more in the Crew Hall.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
              {orderedCrew.map(c => {
                const est = picking ? expectedTrawlHaul(picking, c.savvy, c.fortune) : { xp: 0, doubloons: 0 }
                return (
                  <button key={c.id} disabled={busy} onClick={() => doDeploy(picking, c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.55rem 0.65rem', borderRadius: 13, background: c.id === lastId ? 'rgba(159,192,239,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${c.id === lastId ? 'rgba(159,192,239,0.4)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer', textAlign: 'left' }}>
                    <Portrait crew={c} size={46} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#f4ecd8' }}>
                        {c.name}{c.id === lastId && <span style={{ color: BLUE, fontSize: '0.62rem', marginLeft: 6 }}>last used</span>}
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86' }}>
                        Lv {c.level} · <span style={{ color: BLUE }}>{c.savvy} Savvy</span> · <span style={{ color: GOLD }}>{c.fortune} Fortune</span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: GREEN, lineHeight: 1.25 }}>~{est.xp.toLocaleString()} xp</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: GOLD, lineHeight: 1.25 }}>~{est.doubloons.toLocaleString()} ⟡</p>
                    </div>
                  </button>
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

            <button onClick={() => setReveal(null)} className="font-karla font-700 uppercase" style={{ marginTop: 20, padding: '0.65rem 1.8rem', borderRadius: 10, letterSpacing: '0.1em', fontSize: '0.74rem', background: 'rgba(47,111,214,0.18)', border: '1px solid rgba(120,170,255,0.4)', color: '#bcd4ff', cursor: 'pointer' }}>Nice</button>
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
      {mounted && createPortal(<>{panel}{picker}{collectReveal}{coinFx}</>, document.body)}
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
