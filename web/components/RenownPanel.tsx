'use client'

// Shared Renown board for both skills (Fishing / Navigation). Post-level-100
// progression: each Renown level banks ONE point you spend here on a small
// board of tiny stat boosts. Points bank until you spend them — but allocation
// is PERMANENT (no resets), so each point is a real, deliberate choice.
//
// Server-authoritative: allocate goes through actions/renown.ts, which
// re-derives the level from XP and can't be over-spent. We update optimistically
// for feel, then reconcile with the returned state.

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { vibrate } from '@/lib/haptics'
import { playRenownPointSfx } from '@/lib/fishingMusic'
import {
  renownStats, formatRenownTotal, spentPoints,
  type RenownSkill, type RenownStat, type RenownAlloc,
} from '@/lib/renown'
import { allocateRenown, type RenownState } from '@/app/(app)/actions/renown'

interface Props {
  open: boolean
  onClose: () => void
  skill: RenownSkill
  /** Server-read state to seed the board (level, spent, available, alloc). */
  initial: RenownState
  /** Fired after every allocate so a parent can sync its own copy of the alloc
   *  (e.g. to update a "points to spend" badge on the XP bar). */
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

  const has = available > 0

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'relative',
          margin: 'auto', width: '100%', maxWidth: 440,
          background: 'linear-gradient(180deg, rgba(10,16,28,0.99) 0%, rgba(6,10,18,0.99) 100%)',
          border: `1px solid ${meta.accent}44`,
          borderRadius: 20,
          padding: '1.25rem 1.15rem 1.35rem',
          boxShadow: `0 0 60px ${meta.accent}22, 0 24px 60px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Close — X at the top-right, matching the app's other modals. */}
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 8, right: 10, zIndex: 3, color: 'rgba(255,255,255,0.5)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.4rem' }}>✕</button>

        {/* Header — title + a single efficient status line: Renown level on the
            left, a prominent (pulsing) "points to spend" pill on the right. No
            big stat cards; the numbers live inline. */}
        <div style={{ marginBottom: '1rem' }}>
          <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
             style={{ fontSize: '0.95rem', color: '#fff', textShadow: `0 0 22px ${meta.accent}66`, textAlign: 'center' }}>
            {meta.title}
          </p>
          <p className="font-karla font-400" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.4)', marginTop: 2, textAlign: 'center' }}>
            {meta.sub}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '0.85rem' }}>
            <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: meta.accent, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ opacity: 0.85 }}>✦</span> Renown {state.level}
            </span>
            {has ? (
              <motion.span
                key={available}
                initial={{ scale: 1.18 }}
                animate={{
                  scale: 1,
                  boxShadow: [`0 0 0px ${meta.accent}00`, `0 0 20px ${meta.accent}88`, `0 0 0px ${meta.accent}00`],
                }}
                transition={{ scale: { type: 'spring', stiffness: 480, damping: 18 }, boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
                className="font-karla font-700 uppercase tracking-[0.06em]"
                style={{
                  fontSize: '0.64rem', color: '#0a0f1c', background: meta.accent,
                  borderRadius: 999, padding: '0.32rem 0.7rem', whiteSpace: 'nowrap',
                }}
              >
                {available} point{available === 1 ? '' : 's'} to spend
              </motion.span>
            ) : (
              <span className="font-karla font-700 uppercase tracking-[0.06em]"
                style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                {state.spent > 0 ? 'All points spent' : 'Earn Renown for points'}
              </span>
            )}
          </div>
        </div>

        {/* Stat board — each stat is its own card. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.map(stat => {
            const pts = state.alloc[stat.id] ?? 0
            const canBuy = available > 0 && !busy
            const active = pts > 0
            return (
              <div key={stat.id} style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.85rem 0.9rem', borderRadius: 16,
                background: active
                  ? `linear-gradient(180deg, ${stat.color}14 0%, rgba(255,255,255,0.02) 100%)`
                  : 'rgba(255,255,255,0.035)',
                border: `1px solid ${active ? stat.color + '66' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: active ? `inset 3px 0 0 ${stat.color}` : 'inset 3px 0 0 rgba(255,255,255,0.06)',
                transition: 'border-color 0.25s, background 0.25s, box-shadow 0.25s',
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
                        position: 'absolute', inset: 0, borderRadius: 16,
                        background: `radial-gradient(circle at 82% 50%, ${stat.color}55 0%, transparent 65%)`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>

                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8' }}>{stat.name}</span>
                    {active && (
                      <motion.span
                        key={pts}                       /* re-mount → spring pop on change */
                        initial={{ scale: 1.5, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                        className="font-karla font-700"
                        style={{ fontSize: '0.74rem', color: stat.color, textShadow: `0 0 12px ${stat.color}66` }}
                      >
                        {formatRenownTotal(stat, pts)}
                      </motion.span>
                    )}
                  </div>
                  <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {stat.blurb}
                  </p>
                </div>

                {/* Allocated count + the + button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: active ? stat.color : 'rgba(255,255,255,0.35)', minWidth: 18, textAlign: 'right' }}>
                    {pts}
                  </span>
                  <button
                    onClick={() => onAllocate(stat)}
                    disabled={!canBuy}
                    aria-label={`Add point to ${stat.name}`}
                    style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      fontSize: '1.3rem', lineHeight: 1, fontWeight: 700,
                      background: canBuy ? `${stat.color}26` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${canBuy ? stat.color + '88' : 'rgba(255,255,255,0.08)'}`,
                      color: canBuy ? stat.color : 'rgba(255,255,255,0.22)',
                      cursor: canBuy ? 'pointer' : 'default',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >+</button>
                </div>
              </div>
            )
          })}
        </div>

        <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', marginTop: '1rem', letterSpacing: '0.03em' }}>
          Points bank until you spend them. Allocation is permanent, so choose your build deliberately.
        </p>
      </motion.div>
    </PopupShell>
  )
}
