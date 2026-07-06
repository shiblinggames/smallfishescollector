'use client'

// Shared Renown board for both skills (Fishing / Navigation). Post-level-100
// progression: each Renown level banks ONE point you spend here on a small
// board of tiny stat boosts. Points bank freely (never forced), respec is free.
//
// Server-authoritative: allocate/respec go through actions/renown.ts, which
// re-derives the level from XP and can't be over-spent. We update optimistically
// for feel, then reconcile with the returned state.

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { vibrate } from '@/lib/haptics'
import { playRenownPointSfx, playForgeSfx } from '@/lib/fishingMusic'
import {
  renownStats, formatRenownTotal, spentPoints,
  type RenownSkill, type RenownStat, type RenownAlloc,
} from '@/lib/renown'
import { allocateRenown, respecRenown, type RenownState } from '@/app/(app)/actions/renown'

interface Props {
  open: boolean
  onClose: () => void
  skill: RenownSkill
  /** Server-read state to seed the board (level, spent, available, alloc). */
  initial: RenownState
  /** Fired after every allocate/respec so a parent can sync its own copy of
   *  the alloc (e.g. to update a "points to spend" badge on the XP bar). */
  onChange?: (state: RenownState) => void
}

const SKILL_META: Record<RenownSkill, { title: string; accent: string; sub: string }> = {
  fishing: { title: 'Fishing Renown', accent: '#5eead4', sub: 'Every point sharpens the angler.' },
  nav:     { title: 'Navigation Renown', accent: '#60a5fa', sub: 'Every point hardens the captain.' },
}

export default function RenownPanel({ open, onClose, skill, initial, onChange }: Props) {
  const meta = SKILL_META[skill]
  const stats = renownStats(skill)

  const [state, setState] = useState<RenownState>(initial)
  const [busy, setBusy] = useState(false)
  const [confirmRespec, setConfirmRespec] = useState(false)
  // Drives the per-stat "pop" — bump a stat's key so its value re-mounts and
  // springs. Also a short color-burst flag per stat id.
  const [burst, setBurst] = useState<string | null>(null)

  // Re-seed from the server-read state each time the panel opens — the derived
  // Renown level can have grown (more banked points) while it was closed.
  useEffect(() => { if (open) setState(initial) }, [open, initial])

  const available = state.available

  const onAllocate = useCallback(async (stat: RenownStat) => {
    if (busy || available <= 0) return
    // Optimistic — the point lands instantly; feel first, reconcile after.
    setBusy(true)
    setState(s => {
      const alloc: RenownAlloc = { ...s.alloc, [stat.id]: (s.alloc[stat.id] ?? 0) + 1 }
      return { ...s, alloc, spent: spentPoints(skill, alloc), available: s.available - 1 }
    })
    setBurst(stat.id)
    vibrate(12)
    playRenownPointSfx()
    // Clear the burst after the animation so it can re-fire on the next click.
    setTimeout(() => setBurst(b => (b === stat.id ? null : b)), 320)
    try {
      const res = await allocateRenown(skill, stat.id)
      if (res && !('error' in res)) { setState(res); onChange?.(res) }   // reconcile with server truth
    } finally {
      setBusy(false)
    }
  }, [busy, available, skill, onChange])

  const onRespec = useCallback(async () => {
    if (busy) return
    setBusy(true)
    vibrate([8, 30, 8])
    playForgeSfx(true)
    try {
      const res = await respecRenown(skill)
      if (res && !('error' in res)) { setState(res); onChange?.(res) }
    } finally {
      setBusy(false)
      setConfirmRespec(false)
    }
  }, [busy, skill, onChange])

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.2 }}
        style={{
          margin: 'auto', width: '100%', maxWidth: 440,
          background: 'linear-gradient(180deg, rgba(10,16,28,0.99) 0%, rgba(6,10,18,0.99) 100%)',
          border: `1px solid ${meta.accent}44`,
          borderRadius: 20,
          padding: '1.25rem 1.15rem 1.35rem',
          boxShadow: `0 0 60px ${meta.accent}22, 0 24px 60px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '0.9rem' }}>
          <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
             style={{ fontSize: '0.95rem', color: '#fff', textShadow: `0 0 22px ${meta.accent}66` }}>
            {meta.title}
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {meta.sub}
          </p>
        </div>

        {/* Renown level + banked points */}
        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
          <div style={{
            flex: 1, textAlign: 'center', padding: '0.7rem 0.5rem', borderRadius: 14,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)' }}>Renown</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.8rem', lineHeight: 1.1, color: meta.accent, textShadow: `0 0 20px ${meta.accent}55` }}>
              {state.level}
            </p>
          </div>
          <PointsBadge available={available} accent={meta.accent} />
        </div>

        {/* Stat board */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.map(stat => {
            const pts = state.alloc[stat.id] ?? 0
            const canBuy = available > 0 && !busy
            return (
              <div key={stat.id} style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.65rem 0.7rem', borderRadius: 14,
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${pts > 0 ? stat.color + '55' : 'rgba(255,255,255,0.07)'}`,
                transition: 'border-color 0.25s',
              }}>
                {/* Color-burst flash on allocate */}
                <AnimatePresence>
                  {burst === stat.id && (
                    <motion.div
                      key="burst"
                      initial={{ opacity: 0.55, scale: 0.6 }}
                      animate={{ opacity: 0, scale: 1.6 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.32, ease: 'easeOut' }}
                      style={{
                        position: 'absolute', inset: 0, borderRadius: 14,
                        background: `radial-gradient(circle at 82% 50%, ${stat.color}55 0%, transparent 65%)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>

                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>{stat.name}</span>
                    {pts > 0 && (
                      <motion.span
                        key={pts}                       /* re-mount → spring pop on change */
                        initial={{ scale: 1.5, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                        className="font-karla font-700"
                        style={{ fontSize: '0.72rem', color: stat.color, textShadow: `0 0 12px ${stat.color}66` }}
                      >
                        {formatRenownTotal(stat, pts)}
                      </motion.span>
                    )}
                  </div>
                  <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.42)', marginTop: 1 }}>
                    {stat.blurb}
                  </p>
                </div>

                {/* Allocated pips + the + button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', minWidth: 16, textAlign: 'right' }}>
                    {pts}
                  </span>
                  <button
                    onClick={() => onAllocate(stat)}
                    disabled={!canBuy}
                    aria-label={`Add point to ${stat.name}`}
                    style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      fontSize: '1.2rem', lineHeight: 1, fontWeight: 700,
                      background: canBuy ? `${stat.color}22` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${canBuy ? stat.color + '77' : 'rgba(255,255,255,0.08)'}`,
                      color: canBuy ? stat.color : 'rgba(255,255,255,0.25)',
                      cursor: canBuy ? 'pointer' : 'default',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >+</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Respec */}
        <div style={{ marginTop: '1rem' }}>
          {!confirmRespec ? (
            <button
              onClick={() => setConfirmRespec(true)}
              disabled={busy || state.spent === 0}
              className="font-karla font-700 uppercase tracking-[0.1em] w-full"
              style={{
                padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                color: state.spent === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)',
                cursor: state.spent === 0 ? 'default' : 'pointer',
              }}
            >
              Reset points {state.spent > 0 ? `(${state.spent})` : ''} · free
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmRespec(false)} disabled={busy}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{ flex: 1, padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={onRespec} disabled={busy}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{ flex: 1, padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem', background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.55)', color: '#cfe2ff', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
                Reset all
              </button>
            </div>
          )}
          <p className="font-karla font-400" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8, letterSpacing: '0.04em' }}>
            Points bank freely. Spend whenever, reset anytime.
          </p>
        </div>
      </motion.div>
    </PopupShell>
  )
}

/** Banked "points to spend" — pulses gently when you have points waiting so the
 *  player is nudged (never forced) to go spend them. */
function PointsBadge({ available, accent }: { available: number; accent: string }) {
  const has = available > 0
  return (
    <motion.div
      animate={has ? { boxShadow: [`0 0 0px ${accent}00`, `0 0 22px ${accent}66`, `0 0 0px ${accent}00`] } : {}}
      transition={has ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
      style={{
        flex: 1, textAlign: 'center', padding: '0.7rem 0.5rem', borderRadius: 14,
        background: has ? `${accent}12` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${has ? accent + '66' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: has ? accent : 'rgba(255,255,255,0.4)' }}>To spend</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1.8rem', lineHeight: 1.1, color: has ? '#fff' : 'rgba(255,255,255,0.35)', textShadow: has ? `0 0 20px ${accent}88` : 'none' }}>
        {available}
      </p>
    </motion.div>
  )
}
