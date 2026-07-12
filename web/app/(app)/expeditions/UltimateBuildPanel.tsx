'use client'

// The end-of-Chapter-3 "ultimate weapon" build surface, lives in Manage Ship → Ship.
// Four states, all meant to feel like a milestone, not a shop line:
//   1. Locked   — gates unmet: a clear four-point requirements checklist + previews.
//   2. Buildable — all gates met, nothing built: pick a weapon, confirm the 750k/24h.
//   3. Building  — the 24h clock runs: a glowing forge with countdown, re-pickable.
//   4. Complete  — the weapon is live. From here the armory opens up: retool to
//      a different weapon (250k + the same 24h clock, the mounted weapon stays
//      armed while the work runs) or buy the FULL SCHEMATICS (1.25M, one time)
//      and swap freely between all three — instantly, at no cost, forever.
// The three weapons preview their real combat identity on a loop (UltimatePreview),
// so a captain knows exactly what they're committing to.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import UltimatePreview from './UltimatePreview'
import { startUltimateBuild, swapUltimateBuild, startUltimateRetool, buyUltimateSchematics, switchUltimate } from './actions'
import {
  SHIP_AUGMENTS, getShipAugment, AUGMENT_COST, RETOOL_COST, SCHEMATICS_COST, MEGA_CHARGE_COST, ULTIMATE_BUILD_MS,
  ULTIMATE_STORY, ultimateGateStatus, allUltimateGatesMet, type ShipAugmentId,
} from '@/lib/shipAugments'
import { vibrate } from '@/lib/haptics'

interface BuildState { id: ShipAugmentId; completesAt: string; retool?: boolean }

export default function UltimateBuildPanel({
  shipTier, navLevel, hasRack, chapter3Cleared, doubloons,
  activeId, build: initialBuild, schematics = false,
}: {
  shipTier: number
  navLevel: number
  hasRack: boolean
  chapter3Cleared: boolean
  doubloons: number
  activeId: string | null
  build: BuildState | null
  /** Owns the Full Schematics — free, instant switching between ultimates. */
  schematics?: boolean
}) {
  const router = useRouter()
  const gates = ultimateGateStatus({ chapter3Cleared, shipTier, navLevel, hasRack })
  const allMet = allUltimateGatesMet(gates)

  const [active, setActive] = useState<string | null>(activeId)
  const [build, setBuild] = useState<BuildState | null>(initialBuild)
  const [confirmId, setConfirmId] = useState<ShipAugmentId | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Post-forge armory state: retool confirm, schematics confirm, ownership,
  // the one-shot unlock celebration, and a key that re-fires the ARMED stamp
  // + glow sweep on every free switch.
  const [confirmRetool, setConfirmRetool] = useState<ShipAugmentId | null>(null)
  const [confirmSchem, setConfirmSchem] = useState(false)
  const [schemOwned, setSchemOwned] = useState(schematics)
  const [celebrate, setCelebrate] = useState(false)
  const [armKey, setArmKey] = useState(0)
  // Weapon Bay slot selection (null = follow the armed / incoming weapon).
  const [sel, setSel] = useState<ShipAugmentId | null>(null)

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

  async function startRetool(id: ShipAugmentId) {
    if (busy) return
    setBusy(true); setErr(null)
    const res = await startUltimateRetool(id)
    setBusy(false)
    if (!res.ok || !res.completesAt) { setErr(res.error ?? 'Could not start the retool.'); return }
    setBuild({ id, completesAt: res.completesAt, retool: true })
    setConfirmRetool(null)
    if (typeof res.doubloons === 'number') window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
  }

  async function buySchem() {
    if (busy) return
    setBusy(true); setErr(null)
    const res = await buyUltimateSchematics()
    setBusy(false)
    if (!res.ok) { setErr(res.error ?? 'Could not buy the schematics.'); return }
    setSchemOwned(true); setCelebrate(true); setConfirmSchem(false)
    if (res.active) setActive(res.active)
    setBuild(null)   // any retool mid-clock completed with the purchase
    if (typeof res.doubloons === 'number') window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
  }

  // Free switch (schematics owners) — optimistic, with the tactile beat:
  // haptic tick, ARMED stamp pop, and a color sweep across the new card.
  async function armWeapon(id: ShipAugmentId) {
    if (id === active) return
    const prev = active
    setActive(id); setArmKey(k => k + 1); setSel(null); setErr(null)
    vibrate([0, 20])
    const res = await switchUltimate(id)
    if (!res.ok) { setActive(prev); setErr(res.error ?? 'Could not switch weapons.') }
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
  if (build && (complete || !build.retool)) {
    const a = getShipAugment(build.id)!
    const isRetool = !!build.retool
    if (complete) return (
      <div style={{ marginBottom: '1.7rem' }}>
        {HEADER}
        <BuildCompleteCard augment={a} kicker={isRetool ? 'Mounts Retooled' : 'Weapon Forged'} onClaim={() => router.refresh()} />
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
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: a.color, background: `${a.color}1e`, border: `1px solid ${a.color}66`, borderRadius: 999, padding: '0.2rem 0.55rem' }}>{isRetool ? 'Retooling' : 'Building'}</span>
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
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948c', lineHeight: 1.45, marginTop: 10 }}>
              {isRetool
                ? ULTIMATE_STORY.retoolingLine.replace('{current}', (active && getShipAugment(active)?.name) || 'Your weapon')
                : ULTIMATE_STORY.buildingLine}
            </p>
            {/* re-pick row — a retool can't target the weapon already mounted */}
            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              {SHIP_AUGMENTS.filter(w => !isRetool || w.id !== active).map(w => {
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

  // ── State 4 (settled): the WEAPON BAY — the one post-forge interface.
  //    Three slots across the top, the selected weapon below, ONE action:
  //    "Armed" chip, instant "Arm" (schematics), a paid "Switch" (retool),
  //    or the retool countdown. Replaces the old stack of option cards. ───────
  if (active) {
    if (celebrate) return (
      <div style={{ marginBottom: '1.7rem' }}>
        <SchematicsCelebration onDone={() => setCelebrate(false)} />
      </div>
    )

    const retooling = !!build?.retool && !complete
    const retoolTarget = retooling ? build!.id : null
    const selectedId = sel ?? (retoolTarget ?? (active as ShipAugmentId))
    const w = getShipAugment(selectedId)!
    const armedSel = selectedId === active
    const confirming = confirmRetool === selectedId
    const canAfford = doubloons >= RETOOL_COST
    const pickSlot = (id: ShipAugmentId) => { setSel(id); setConfirmRetool(null); setConfirmSchem(false); setErr(null) }
    const progress = retooling ? Math.min(1, 1 - remaining / ULTIMATE_BUILD_MS) : 0

    return (
      <div style={{ marginBottom: '1.7rem' }}>
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', padding: '0.85rem 0.85rem 0.9rem', background: 'linear-gradient(180deg, rgba(22,25,36,0.88), rgba(10,12,18,0.94))', border: `1px solid ${w.color}44`, boxShadow: `0 0 26px ${w.color}14` }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#ffd56b', letterSpacing: '0.04em' }}>Weapon Bay</p>
            {schemOwned && (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.45)', borderRadius: 999, padding: '0.16rem 0.5rem' }}>Full Schematics</span>
            )}
          </div>

          {/* the three slots */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {SHIP_AUGMENTS.map(t => {
              const on = t.id === selectedId
              const tag = t.id === active ? 'Armed' : t.id === retoolTarget ? 'Incoming' : null
              return (
                <button key={t.id} type="button" onClick={() => pickSlot(t.id)}
                  className="font-karla font-700 tap"
                  style={{ flex: 1, padding: '0.5rem 0.2rem 0.4rem', borderRadius: 10, fontSize: '0.66rem', cursor: 'pointer', textAlign: 'center', color: on ? t.color : '#8d8880', background: on ? `${t.color}1c` : 'rgba(255,255,255,0.035)', border: `1px solid ${on ? `${t.color}88` : 'rgba(255,255,255,0.09)'}` }}>
                  {t.name}
                  <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ display: 'block', marginTop: 2, fontSize: '0.44rem', color: tag === 'Armed' ? t.color : tag === 'Incoming' ? '#e0a955' : 'transparent' }}>
                    {tag ?? ' '}
                  </span>
                </button>
              )
            })}
          </div>

          {/* selected weapon */}
          <div style={{ position: 'relative' }}>
            {/* one-shot color sweep when a weapon is armed */}
            {armedSel && armKey > 0 && (
              <motion.div key={`sweep-${armKey}`} aria-hidden initial={{ x: '-130%' }} animate={{ x: '130%' }} transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: 0, width: '45%', background: `linear-gradient(90deg, transparent, ${w.color}33, transparent)`, pointerEvents: 'none', zIndex: 1 }} />
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: w.color, lineHeight: 1.3 }}>{w.identity}</p>
              <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.58rem', color: w.color }}>×{w.megaMult.toFixed(1)} damage</span>
            </div>
            <UltimatePreview id={selectedId} color={w.color} />
          </div>

          {/* ONE action */}
          <div style={{ marginTop: 10 }}>
            {armedSel ? (
              <>
                <motion.div key={`stamp-${armKey}`} initial={armKey > 0 ? { scale: 1.12 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                  className="font-karla font-700 uppercase tracking-[0.14em]"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', textAlign: 'center', color: '#0c0f14', background: w.color, boxShadow: `0 0 16px ${w.color}66` }}>
                  {retooling ? `Armed until ${getShipAugment(retoolTarget!)!.name} arrives` : 'Armed'}
                </motion.div>
                {!hasRack && (
                  <p className="font-karla" style={{ fontSize: '0.62rem', color: '#caa05a', textAlign: 'center', lineHeight: 1.4, marginTop: 6 }}>
                    Needs the Extra Cannonball Rack (Gauntlet depth 10) to fire.
                  </p>
                )}
              </>
            ) : selectedId === retoolTarget ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.54rem', color: '#8a8480' }}>Arming in</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f5f2ec', fontVariantNumeric: 'tabular-nums' }}>{fmt(remaining)}</span>
                </div>
                <div style={{ marginTop: 5, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <motion.div initial={false} animate={{ width: `${progress * 100}%` }} transition={{ ease: 'linear' }}
                    style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${w.color}, #fff)`, boxShadow: `0 0 10px ${w.color}` }} />
                </div>
              </div>
            ) : retooling ? (
              <button type="button" onClick={() => swap(selectedId)} disabled={busy}
                className="font-karla font-700 uppercase tracking-[0.08em] tap"
                style={{ width: '100%', padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', color: w.color, background: `${w.color}14`, border: `1px solid ${w.color}55`, cursor: 'pointer' }}>
                Switch the work to {w.name} · free
              </button>
            ) : schemOwned ? (
              <button type="button" onClick={() => armWeapon(selectedId)}
                className="font-cinzel font-700 uppercase tracking-[0.14em] tap"
                style={{ width: '100%', padding: '0.65rem', borderRadius: 10, fontSize: '0.72rem', color: '#0c0f14', background: `linear-gradient(180deg, ${w.color}, ${w.color}cc)`, border: 'none', cursor: 'pointer', boxShadow: `0 0 18px ${w.color}55` }}>
                Arm {w.name}
              </button>
            ) : confirming ? (
              <div>
                <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#e0a955', textAlign: 'center', lineHeight: 1.4, marginBottom: 7 }}>
                  Costs {RETOOL_COST.toLocaleString()} ⟡ and takes 24 hours. {getShipAugment(active)!.name} stays armed until then.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setConfirmRetool(null); setErr(null) }} disabled={busy}
                    className="font-karla font-700 uppercase tracking-[0.08em] tap"
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', color: '#cfc9bf', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => canAfford && startRetool(selectedId)} disabled={!canAfford || busy}
                    className="font-karla font-700 uppercase tracking-[0.08em] tap"
                    style={{ flex: 1.5, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', cursor: canAfford && !busy ? 'pointer' : 'default', color: canAfford ? w.color : '#6a6764', background: canAfford ? `${w.color}1c` : 'rgba(255,255,255,0.04)', border: `1px solid ${canAfford ? `${w.color}66` : 'rgba(255,255,255,0.1)'}` }}>
                    {busy ? 'Starting…' : canAfford ? 'Start the switch' : `Need ${(RETOOL_COST - doubloons).toLocaleString()} more ⟡`}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setConfirmRetool(selectedId); setConfirmSchem(false); setErr(null) }}
                className="font-karla font-700 uppercase tracking-[0.08em] tap"
                style={{ width: '100%', padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', color: w.color, background: `${w.color}14`, border: `1px solid ${w.color}55`, cursor: 'pointer' }}>
                Switch to {w.name} · {RETOOL_COST.toLocaleString()} ⟡ · 24 hrs
              </button>
            )}
          </div>
        </div>

        {/* Full Schematics — one compact line under the bay (until owned). */}
        {!schemOwned && (
          <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(240,192,64,0.45)', background: 'linear-gradient(165deg, rgba(16,26,48,0.94), rgba(9,13,24,0.96))' }}>
            {confirmSchem ? (
              <div style={{ padding: '0.7rem 0.75rem' }}>
                <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#e0a955', textAlign: 'center', lineHeight: 1.4, marginBottom: 7 }}>
                  {SCHEMATICS_COST.toLocaleString()} ⟡ once. Switch weapons free and instantly, forever.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setConfirmSchem(false); setErr(null) }} disabled={busy}
                    className="font-karla font-700 uppercase tracking-[0.08em] tap"
                    style={{ flex: 1, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', color: '#cfc9bf', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => doubloons >= SCHEMATICS_COST && buySchem()} disabled={doubloons < SCHEMATICS_COST || busy}
                    className="font-karla font-700 uppercase tracking-[0.08em] tap"
                    style={{ flex: 1.5, padding: '0.6rem', borderRadius: 10, fontSize: '0.66rem', cursor: doubloons >= SCHEMATICS_COST && !busy ? 'pointer' : 'default', color: doubloons >= SCHEMATICS_COST ? '#0c0f14' : '#6a6764', background: doubloons >= SCHEMATICS_COST ? 'linear-gradient(180deg, #f0c040, #d4a02c)' : 'rgba(255,255,255,0.04)', border: 'none' }}>
                    {busy ? 'Buying…' : doubloons >= SCHEMATICS_COST ? 'Buy' : `Need ${(SCHEMATICS_COST - doubloons).toLocaleString()} more ⟡`}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setConfirmSchem(true); setConfirmRetool(null); setErr(null) }}
                className="tap"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: '0.65rem 0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ minWidth: 0 }}>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.8rem', color: '#f0c040' }}>{ULTIMATE_STORY.schematicsTitle}</span>
                  <span className="font-karla" style={{ display: 'block', fontSize: '0.6rem', color: '#aeb6c6', marginTop: 1 }}>Switch any time. Free, instant, forever.</span>
                </span>
                <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.62rem', color: '#f0c040' }}>{SCHEMATICS_COST.toLocaleString()} ⟡ ›</span>
              </button>
            )}
          </div>
        )}
        {err && <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#fca5a5', textAlign: 'center', marginTop: 6 }}>{err}</p>}
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
function BuildCompleteCard({ augment, kicker = 'Weapon Forged', onClaim }: { augment: NonNullable<ReturnType<typeof getShipAugment>>; kicker?: string; onClaim: () => void }) {
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
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: augment.color, marginBottom: 6 }}>{kicker}</p>
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

/* ── Schematics unlock celebration — the "whole book" beat. Gold rising
      sparks over a drafting-blue field, the three weapon names lit in their
      own colors (you own all of them now), one big open-the-armory button. ── */
function SchematicsCelebration({ onDone }: { onDone: () => void }) {
  useEffect(() => { vibrate([0, 40, 60, 40, 90]) }, [])
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'relative', borderRadius: 16, padding: '1.25rem 0.95rem 1.1rem', overflow: 'hidden', textAlign: 'center', background: 'radial-gradient(ellipse 100% 70% at 50% 0%, rgba(240,192,64,0.2) 0%, transparent 70%), linear-gradient(165deg, rgba(16,26,48,0.95), rgba(9,13,24,0.97))', border: '1.5px solid #f0c040', boxShadow: '0 0 44px rgba(240,192,64,0.3)' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.45, background: 'repeating-linear-gradient(0deg, transparent, transparent 17px, rgba(120,160,220,0.08) 17px, rgba(120,160,220,0.08) 18px), repeating-linear-gradient(90deg, transparent, transparent 17px, rgba(120,160,220,0.08) 17px, rgba(120,160,220,0.08) 18px)', pointerEvents: 'none' }} />
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div key={i} aria-hidden
          initial={{ opacity: 0, y: 24, x: 0 }}
          animate={{ opacity: [0, 1, 0], y: -64, x: (i % 2 ? 1 : -1) * (8 + i * 4) }}
          transition={{ duration: 2 + (i % 3) * 0.5, delay: (i * 0.16) % 1.5, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${(i * 31) % 100}%`, bottom: 0, width: 4, height: 4, borderRadius: '50%', background: '#f0c040', boxShadow: '0 0 8px #f0c040' }} />
      ))}
      <div style={{ position: 'relative' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: '#f0c040', marginBottom: 6 }}>{ULTIMATE_STORY.schematicsUnlockKicker}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f5f2ec', textShadow: '0 0 20px rgba(240,192,64,0.5)', marginBottom: 8 }}>{ULTIMATE_STORY.schematicsTitle}</p>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#c8cede', lineHeight: 1.5, marginBottom: 12 }}>{ULTIMATE_STORY.schematicsUnlockLine}</p>
        {/* all three, lit — the whole book is yours */}
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 14 }}>
          {SHIP_AUGMENTS.map((w, i) => (
            <motion.span key={w.id}
              initial={{ opacity: 0, y: 8, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.35 + i * 0.18, type: 'spring', stiffness: 380, damping: 22 }}
              className="font-cinzel font-700"
              style={{ fontSize: '0.68rem', color: w.color, background: `${w.color}14`, border: `1px solid ${w.color}66`, borderRadius: 999, padding: '0.32rem 0.7rem', textShadow: `0 0 10px ${w.color}55` }}>
              {w.name}
            </motion.span>
          ))}
        </div>
        <button type="button" onClick={onDone}
          className="font-cinzel font-700 uppercase tracking-[0.16em] tap"
          style={{ width: '100%', padding: '12px 0', borderRadius: 12, fontSize: '0.76rem', color: '#0c0f14', background: 'linear-gradient(180deg, #f0c040, #d4a02c)', border: 'none', cursor: 'pointer', boxShadow: '0 0 24px rgba(240,192,64,0.45)' }}>
          Open the armory →
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
