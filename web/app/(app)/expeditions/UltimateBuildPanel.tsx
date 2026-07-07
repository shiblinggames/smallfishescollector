'use client'

// The end-of-Chapter-3 "ultimate weapon" build surface, lives in Manage Ship → Ship.
// Four states, all meant to feel like a milestone, not a shop line:
//   1. Locked   — gates unmet: a clear four-point requirements checklist + previews.
//   2. Buildable — all gates met, nothing built: pick a weapon, confirm the 750k/24h.
//   3. Building  — the 24h clock runs: a glowing forge with countdown, re-pickable.
//   4. Complete  — the weapon is live: equipped card + the option to forge another.
// The three weapons preview their real combat identity on a loop (UltimatePreview),
// so a captain knows exactly what they're committing to.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import UltimatePreview from './UltimatePreview'
import { startUltimateBuild, swapUltimateBuild } from './actions'
import {
  SHIP_AUGMENTS, getShipAugment, AUGMENT_COST, MEGA_CHARGE_COST, ULTIMATE_BUILD_MS,
  ULTIMATE_STORY, ultimateGateStatus, allUltimateGatesMet, type ShipAugmentId,
} from '@/lib/shipAugments'

interface BuildState { id: ShipAugmentId; completesAt: string }

export default function UltimateBuildPanel({
  shipTier, navLevel, hasRack, chapter3Cleared, doubloons,
  activeId, build: initialBuild,
}: {
  shipTier: number
  navLevel: number
  hasRack: boolean
  chapter3Cleared: boolean
  doubloons: number
  activeId: string | null
  build: BuildState | null
}) {
  const router = useRouter()
  const gates = ultimateGateStatus({ chapter3Cleared, shipTier, navLevel, hasRack })
  const allMet = allUltimateGatesMet(gates)

  const [active, setActive] = useState<string | null>(activeId)
  const [build, setBuild] = useState<BuildState | null>(initialBuild)
  const [confirmId, setConfirmId] = useState<ShipAugmentId | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const remaining = useRemaining(build?.completesAt ?? null)
  const complete = !!build && remaining <= 0

  async function start(id: ShipAugmentId) {
    if (busy) return
    setBusy(true); setErr(null)
    const res = await startUltimateBuild(id)
    setBusy(false)
    if (!res.ok || !res.completesAt) { setErr(res.error ?? 'Could not start the build.'); return }
    setBuild({ id, completesAt: res.completesAt })
    setConfirmId(null)
    if (typeof res.doubloons === 'number') window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
  }

  async function swap(id: ShipAugmentId) {
    if (busy || !build || build.id === id) return
    const prev = build
    setBuild({ ...build, id })         // optimistic
    const res = await swapUltimateBuild(id)
    if (!res.ok) { setBuild(prev); setErr(res.error ?? 'Could not change the build.') }
  }

  const HEADER = (
    <>
      <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#ffd56b', marginBottom: '0.3rem', letterSpacing: '0.04em', textShadow: '0 0 18px rgba(240,192,64,0.3)' }}>{ULTIMATE_STORY.buildKicker}</p>
      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginBottom: '0.85rem', lineHeight: 1.45 }}>
        {ULTIMATE_STORY.buildBlurb.replace('{charges}', String(MEGA_CHARGE_COST))}
      </p>
    </>
  )

  // ── State 3/4: a build is underway (or just finished) ──────────────────────
  if (build) {
    const a = getShipAugment(build.id)!
    if (complete) return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <BuildCompleteCard augment={a} onClaim={() => router.refresh()} />
      </div>
    )
    const progress = Math.min(1, 1 - remaining / ULTIMATE_BUILD_MS)
    return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <div style={{ position: 'relative', borderRadius: 16, padding: '1rem 0.95rem 1.05rem', overflow: 'hidden', background: `linear-gradient(180deg, ${a.color}12 0%, rgba(12,14,20,0.6) 100%)`, border: `1px solid ${a.color}55`, boxShadow: `0 0 30px ${a.color}18` }}>
          {/* forge shimmer sweeping across while it builds */}
          <motion.div aria-hidden
            initial={{ x: '-120%' }} animate={{ x: '120%' }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: `linear-gradient(90deg, transparent, ${a.color}22, transparent)`, pointerEvents: 'none' }}
          />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: a.color }}>{a.name}</p>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: a.color, background: `${a.color}1e`, border: `1px solid ${a.color}66`, borderRadius: 999, padding: '0.2rem 0.55rem' }}>Building</span>
            </div>
            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: a.color, margin: '-2px 0 8px', lineHeight: 1.3 }}>{a.identity}</p>
            <UltimatePreview id={build.id} color={a.color} />
            {/* countdown */}
            <div style={{ marginTop: 11, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.54rem', color: '#8a8480' }}>Ready in</span>
              <span className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f5f2ec', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>{fmt(remaining)}</span>
            </div>
            <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <motion.div initial={false} animate={{ width: `${progress * 100}%` }} transition={{ ease: 'linear' }}
                style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${a.color}, #fff)`, boxShadow: `0 0 10px ${a.color}` }} />
            </div>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948c', lineHeight: 1.45, marginTop: 10 }}>{ULTIMATE_STORY.buildingLine}</p>
            {/* re-pick row */}
            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              {SHIP_AUGMENTS.map(w => {
                const on = build.id === w.id
                return (
                  <button key={w.id} type="button" onClick={() => swap(w.id)} disabled={on}
                    className="font-karla font-700 uppercase tracking-[0.06em] tap"
                    style={{ flex: 1, padding: '0.5rem 0.2rem', borderRadius: 9, fontSize: '0.58rem', cursor: on ? 'default' : 'pointer', color: on ? w.color : '#9a948c', background: on ? `${w.color}20` : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? `${w.color}88` : 'rgba(255,255,255,0.1)'}` }}>
                    {w.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {err && <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#fca5a5', textAlign: 'center', marginTop: 6 }}>{err}</p>}
      </div>
    )
  }

  // ── State 4 (settled): a weapon is live. Permanent — the ultimate is a
  //    once-and-for-all choice, so there's no rebuild/swap from here. ──────────
  if (active) {
    const a = getShipAugment(active)!
    return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <div style={{ borderRadius: 16, padding: '1rem 0.95rem', background: `${a.color}14`, border: `1px solid ${a.color}66`, boxShadow: `0 0 26px ${a.color}1c` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: a.color }}>{a.name}</p>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#0c0f14', background: a.color, borderRadius: 999, padding: '0.2rem 0.6rem' }}>Live</span>
          </div>
          <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: a.color, margin: '2px 0 8px', lineHeight: 1.3 }}>{a.identity}</p>
          {/* No looping preview once it's forged and live — you already own it;
              the perks are the useful reference now. */}
          <PerkList perks={a.perks} color={a.color} />
          {!hasRack && (
            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#caa05a', lineHeight: 1.4, marginTop: 7 }}>
              It stays silent until you own the Extra Cannonball Rack (Gauntlet, depth 10) to hold {MEGA_CHARGE_COST} cannonballs and fire the Mega.
            </p>
          )}
        </div>
        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7f7a72', textAlign: 'center', marginTop: 9, letterSpacing: '0.02em' }}>
          Your ultimate is forged into the hull for good. There is no changing it.
        </p>
      </div>
    )
  }

  // ── State 1/2: locked or buildable. Show the checklist + the three weapons ──
  return (
    <div style={{ marginBottom: '1.7rem' }}>
      {HEADER}
      {!allMet && <RequirementsChecklist gates={gates} navLevel={navLevel} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {SHIP_AUGMENTS.map(a => {
          const confirming = confirmId === a.id
          const canAfford = doubloons >= AUGMENT_COST
          return (
            <div key={a.id} style={{ borderRadius: 14, padding: '0.8rem', background: confirming ? `${a.color}16` : `${a.color}0b`, border: `1px solid ${a.color}${confirming ? '77' : '3a'}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: a.color }}>{a.name}</p>
                <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: a.color }}>×{a.megaMult.toFixed(1)} damage</span>
              </div>
              <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: a.color, margin: '2px 0 7px', lineHeight: 1.3 }}>{a.identity}</p>
              <UltimatePreview id={a.id} color={a.color} />
              <PerkList perks={a.perks} color={a.color} />
              <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7f7a72', fontStyle: 'italic', lineHeight: 1.4, marginTop: 9 }}>{a.flavor}</p>
              {!allMet ? (
                <div style={{ marginTop: 9, width: '100%', padding: '0.55rem', borderRadius: 10, textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.14)' }}>
                  <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#6a6764' }}>Meet the requirements above to build</span>
                </div>
              ) : confirming ? (
                <div style={{ marginTop: 9 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#e0a955', lineHeight: 1.4, marginBottom: 7 }}>
                    {AUGMENT_COST.toLocaleString()} ⟡ and 24 hours to build. You can switch which weapon while it&rsquo;s building.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => { setConfirmId(null); setErr(null) }} disabled={busy}
                      className="font-karla font-700 uppercase tracking-[0.08em] tap"
                      style={{ flex: 1, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', color: '#cfc9bf', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="button" onClick={() => canAfford && start(a.id)} disabled={!canAfford || busy}
                      className="font-karla font-700 uppercase tracking-[0.08em] tap"
                      style={{ flex: 1.5, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', cursor: canAfford && !busy ? 'pointer' : 'default', color: canAfford ? a.color : '#6a6764', background: canAfford ? `${a.color}1c` : 'rgba(255,255,255,0.04)', border: `1px solid ${canAfford ? `${a.color}66` : 'rgba(255,255,255,0.1)'}` }}>
                      {busy ? 'Starting…' : canAfford ? `Begin build · ${AUGMENT_COST.toLocaleString()} ⟡` : `Need ${(AUGMENT_COST - doubloons).toLocaleString()} more ⟡`}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setConfirmId(a.id); setErr(null) }}
                  className="font-karla font-700 uppercase tracking-[0.08em] tap"
                  style={{ marginTop: 9, width: '100%', padding: '0.55rem', borderRadius: 10, fontSize: '0.66rem', color: a.color, background: `${a.color}14`, border: `1px solid ${a.color}55`, cursor: 'pointer' }}>
                  Build · {AUGMENT_COST.toLocaleString()} ⟡
                </button>
              )}
            </div>
          )
        })}
      </div>
      {err && <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#fca5a5', textAlign: 'center', marginTop: 6 }}>{err}</p>}
    </div>
  )
}

/* ── Perk list — concrete pros/cons per weapon (a con is prefixed "—") ── */
function PerkList({ perks, color }: { perks: string[]; color: string }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '9px 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {perks.map((p, i) => {
        const con = p.startsWith('—')
        const text = con ? p.replace(/^—\s*/, '') : p
        return (
          <li key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ flexShrink: 0, marginTop: 6, width: 5, height: 5, borderRadius: con ? 0 : '50%', background: con ? 'transparent' : color, boxShadow: con ? 'none' : `0 0 5px ${color}`, borderTop: con ? '1.5px solid rgba(255,255,255,0.3)' : undefined }} />
            <span className="font-karla" style={{ fontSize: '0.68rem', lineHeight: 1.4, color: con ? '#8a8480' : '#c8c2b8' }}>{text}</span>
          </li>
        )
      })}
    </ul>
  )
}

/* ── Requirements checklist — every gate spelled out, met or not ── */
function RequirementsChecklist({ gates, navLevel }: { gates: ReturnType<typeof ultimateGateStatus>; navLevel: number }) {
  const rows: { ok: boolean; label: string; hint: string }[] = [
    { ok: gates.chapter3, label: 'Clear Chapter III', hint: 'Beat the Quartermaster for the plans' },
    { ok: gates.manowar, label: 'Command the Man-o-War', hint: 'Reach the top ship tier' },
    { ok: gates.navLevel, label: 'Navigation 70', hint: `You are Navigation ${navLevel}` },
    { ok: gates.rack, label: 'Extra Cannonball Rack', hint: 'From the Davy Jones Gauntlet (depth 10)' },
  ]
  return (
    <div style={{ borderRadius: 14, padding: '0.85rem 0.9rem', marginBottom: '0.95rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: '#8a8480', marginBottom: 9 }}>Requirements</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{ flexShrink: 0, width: 17, height: 17, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, background: r.ok ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${r.ok ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.18)'}` }}>
              {r.ok
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: r.ok ? '#d7f5df' : '#cfc9bf', lineHeight: 1.3 }}>{r.label}</p>
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7f7a72', lineHeight: 1.35 }}>{r.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Completion beat — the weapon is forged ── */
function BuildCompleteCard({ augment, onClaim }: { augment: NonNullable<ReturnType<typeof getShipAugment>>; onClaim: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'relative', borderRadius: 16, padding: '1.1rem 0.95rem', overflow: 'hidden', textAlign: 'center', background: `radial-gradient(ellipse 100% 70% at 50% 0%, ${augment.color}22 0%, transparent 70%), linear-gradient(180deg, rgba(20,14,8,0.9), rgba(12,10,8,0.95))`, border: `1.5px solid ${augment.color}`, boxShadow: `0 0 44px ${augment.color}33` }}>
      <AnimatePresence>
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.div key={i} aria-hidden
            initial={{ opacity: 0, y: 20, x: 0 }}
            animate={{ opacity: [0, 1, 0], y: -50, x: (i % 2 ? 1 : -1) * (10 + i * 4) }}
            transition={{ duration: 2 + (i % 3) * 0.5, delay: (i * 0.18) % 1.6, repeat: Infinity, ease: 'easeOut' }}
            style={{ position: 'absolute', left: `${(i * 37) % 100}%`, bottom: 0, width: 4, height: 4, borderRadius: '50%', background: augment.color, boxShadow: `0 0 8px ${augment.color}` }} />
        ))}
      </AnimatePresence>
      <div style={{ position: 'relative' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: augment.color, marginBottom: 6 }}>Weapon Forged</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f5f2ec', textShadow: `0 0 20px ${augment.color}66`, marginBottom: 10 }}>{augment.name}</p>
        <UltimatePreview id={augment.id as ShipAugmentId} color={augment.color} />
        <button type="button" onClick={onClaim}
          className="font-cinzel font-700 uppercase tracking-[0.16em] tap"
          style={{ marginTop: 12, width: '100%', padding: '12px 0', borderRadius: 12, fontSize: '0.76rem', color: '#0c0f14', background: `linear-gradient(180deg, ${augment.color}, ${augment.color}cc)`, border: 'none', cursor: 'pointer', boxShadow: `0 0 24px ${augment.color}55` }}>
          Bring it aboard →
        </button>
      </div>
    </motion.div>
  )
}

/* ── helpers ── */
function useRemaining(completesAt: string | null): number {
  const [ms, setMs] = useState(() => completesAt ? Math.max(0, new Date(completesAt).getTime() - Date.now()) : 0)
  useEffect(() => {
    if (!completesAt) { setMs(0); return }
    const tick = () => setMs(Math.max(0, new Date(completesAt).getTime() - Date.now()))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [completesAt])
  return ms
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}
