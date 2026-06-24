'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { DIFFICULTY_META, type BadgeDifficulty } from '@/lib/badges'
import { claimBadgeReward, claimAllBadgeRewards } from './badgeActions'

export interface JourneyGoal {
  id: string
  label: string
  desc: string
  href: string
  current: number
  target: number
  done: boolean
  badgeImage?: string
  binary?: boolean
  record?: boolean
  // Badge goals carry a difficulty tier + a claimable doubloon reward.
  difficulty?: BadgeDifficulty
  reward?: number
  claimed?: boolean
}

export interface JourneyGroup {
  title: string
  accent: string
  goals: JourneyGoal[]
}

interface Props {
  groups: JourneyGroup[]
  doneCount: number
  totalCount: number
}

const GOLD = '#f0c040'

export default function AchievementsClient({ groups }: Props) {
  const router = useRouter()
  const allGoals = groups.flatMap(g => g.goals)

  // Local claimed set, seeded from the server, updated optimistically on claim.
  const [claimedIds, setClaimedIds] = useState<Set<string>>(
    () => new Set(allGoals.filter(g => g.claimed).map(g => g.id)),
  )
  const [busy, setBusy] = useState<string | null>(null) // goal id, or 'all'
  const [toast, setToast] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  const badgeGoals = allGoals.filter(g => (g.reward ?? 0) > 0)
  const earnedBadges = badgeGoals.filter(g => g.done).length
  const claimable = badgeGoals.filter(g => g.done && !claimedIds.has(g.id))
  const claimableTotal = claimable.reduce((s, g) => s + (g.reward ?? 0), 0)

  const notifyDoubloons = (n: number) => window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: n }))
  const showToast = (amt: number) => { setToast(amt); setTimeout(() => setToast(null), 1700) }

  function claimOne(id: string) {
    if (busy) return
    setBusy(id)
    startTransition(async () => {
      const r = await claimBadgeReward(id)
      setBusy(null)
      if ('error' in r) return
      setClaimedIds(prev => new Set(prev).add(id))
      if (r.amount > 0) { notifyDoubloons(r.newDoubloons); showToast(r.amount) }
    })
  }
  function claimAll() {
    if (busy || claimable.length === 0) return
    setBusy('all')
    startTransition(async () => {
      const r = await claimAllBadgeRewards()
      setBusy(null)
      if ('error' in r) return
      setClaimedIds(new Set(r.claimed))
      if (r.totalGranted > 0) { notifyDoubloons(r.newDoubloons); showToast(r.totalGranted) }
    })
  }

  return (
    <div>
      {/* ── Hero: earned tally + a treasure-chest claim banner ─────────────── */}
      <div style={{
        borderRadius: 16, padding: '0.95rem 1rem', marginBottom: 22,
        background: claimableTotal > 0
          ? ['radial-gradient(ellipse 80% 90% at 100% 0%, rgba(240,192,64,0.18) 0%, transparent 65%)', 'linear-gradient(180deg, rgba(44,34,14,0.7) 0%, rgba(22,16,8,0.8) 100%)'].join(', ')
          : 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.02) 100%)',
        border: `1px solid ${claimableTotal > 0 ? GOLD + '66' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: claimableTotal > 0 ? `0 0 26px ${GOLD}1f` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.58rem', color: '#9a948a' }}>Badges Earned</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f4ecd8', lineHeight: 1.1, marginTop: 1 }}>
              {earnedBadges} <span style={{ color: 'rgba(240,237,232,0.4)', fontSize: '1rem' }}>/ {badgeGoals.length}</span>
            </p>
          </div>

          {claimableTotal > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: GOLD }}>Ready to claim</p>
                <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: GOLD, lineHeight: 1, marginTop: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 12px ${GOLD}55` }}>
                  {claimableTotal.toLocaleString()} ⟡
                </p>
              </div>
              <motion.button whileTap={{ scale: 0.94 }} onClick={claimAll} disabled={busy === 'all'}
                className="font-cinzel font-700 uppercase tracking-[0.08em]"
                style={{
                  padding: '0.7rem 1.1rem', borderRadius: 12, flexShrink: 0, cursor: busy ? 'default' : 'pointer',
                  background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}`,
                  fontSize: '0.78rem', boxShadow: `0 0 14px ${GOLD}22`, opacity: busy === 'all' ? 0.6 : 1,
                }}>
                {busy === 'all' ? 'Claiming…' : `Claim All (${claimable.length})`}
              </motion.button>
            </div>
          ) : (
            <span className="font-karla font-600" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.4)' }}>All rewards claimed</span>
          )}
        </div>
      </div>

      {/* ── Goal groups ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {groups.map(group => (
          <section key={group.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.accent, flexShrink: 0, boxShadow: `0 0 8px ${group.accent}` }} />
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.74rem', color: group.accent }}>
                {group.title}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.goals.map(g => (
                <GoalRow
                  key={g.id}
                  g={g}
                  groupAccent={group.accent}
                  claimed={claimedIds.has(g.id)}
                  busy={busy === g.id}
                  onClaim={() => claimOne(g.id)}
                  onOpen={() => router.push(g.href)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Claim toast — gold pop, non-blocking. */}
      <AnimatePresence>
        {toast !== null && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            aria-hidden
            style={{
              position: 'fixed', left: '50%', bottom: 'calc(86px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
              zIndex: 9000, pointerEvents: 'none',
              padding: '0.6rem 1.15rem', borderRadius: 999,
              background: 'linear-gradient(180deg, rgba(44,34,14,0.97) 0%, rgba(22,16,8,0.98) 100%)', color: GOLD,
              border: `1px solid ${GOLD}`, boxShadow: `0 6px 22px ${GOLD}33`,
            }}>
            <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', textShadow: `0 0 10px ${GOLD}55` }}>+{toast.toLocaleString()} ⟡ claimed</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── One goal row ────────────────────────────────────────────────────────────
function GoalRow({ g, groupAccent, claimed, busy, onClaim, onOpen }: {
  g: JourneyGoal
  groupAccent: string
  claimed: boolean
  busy: boolean
  onClaim: () => void
  onOpen: () => void
}) {
  const diff = g.difficulty ? DIFFICULTY_META[g.difficulty] : null
  const accent = diff?.color ?? groupAccent
  const pct = g.target > 0 ? Math.min(1, g.current / g.target) : (g.done ? 1 : 0)
  const reward = g.reward ?? 0
  const canClaim = g.done && reward > 0 && !claimed

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        background: g.done ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.022)',
        border: `1px solid ${canClaim ? GOLD + '88' : g.done ? accent + '4d' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14, padding: '0.75rem 0.8rem',
        boxShadow: canClaim ? `0 0 16px ${GOLD}22` : 'none',
      }}
    >
      {/* Badge art / marker — ringed in its difficulty colour when earned. */}
      <div style={{
        width: 48, height: 48, borderRadius: 11, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.22)',
        border: g.badgeImage && g.done ? `1.5px solid ${accent}aa` : '1.5px solid transparent',
        boxShadow: g.badgeImage && g.done ? `0 0 12px ${accent}44` : 'none',
      }}>
        {g.badgeImage ? (
          <img
            src={g.badgeImage} alt="" loading="lazy" decoding="async"
            style={{ width: 34, height: 34, objectFit: 'contain', filter: g.done ? 'none' : 'grayscale(1)', opacity: g.done ? 1 : 0.3 }}
            onError={e => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              const p = el.parentElement
              if (p) p.innerHTML = `<span style="font-size:1.2rem;opacity:${g.done ? 0.9 : 0.3}">🏅</span>`
            }}
          />
        ) : (
          <span style={{ width: 15, height: 15, borderRadius: '50%', background: g.done ? groupAccent : 'transparent', border: `2px solid ${groupAccent}`, opacity: g.done ? 1 : 0.5 }} />
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: g.done ? '#f0ede8' : 'rgba(240,237,232,0.8)' }}>
            {g.label}
          </p>
          {diff && (
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: accent, background: `${accent}1f`, border: `1px solid ${accent}55`, borderRadius: 999, padding: '0.1rem 0.42rem' }}>
              {diff.label}
            </span>
          )}
        </div>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(240,237,232,0.45)', lineHeight: 1.4, marginTop: 2 }}>
          {g.desc}
        </p>
        {!g.binary && !g.done && (
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: accent, borderRadius: 3, opacity: 0.8 }} />
          </div>
        )}
      </div>

      {/* Right action zone */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {canClaim ? (
          <motion.button whileTap={{ scale: 0.92 }} onClick={e => { e.stopPropagation(); onClaim() }} disabled={busy}
            className="font-cinzel font-700"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: 2,
              padding: '0.45rem 0.7rem', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
              background: `${GOLD}1f`, color: GOLD, border: `1px solid ${GOLD}88`,
              opacity: busy ? 0.6 : 1,
            }}>
            <span style={{ fontSize: '0.54rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>{busy ? '…' : 'Claim'}</span>
            <span style={{ fontSize: '0.78rem' }}>+{reward.toLocaleString()} ⟡</span>
          </motion.button>
        ) : claimed && reward > 0 ? (
          <span className="font-karla font-700" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: '#7bbf7b' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7bbf7b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            Claimed
          </span>
        ) : g.binary ? (
          <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: g.done ? '#4ade80' : 'rgba(240,237,232,0.32)' }}>
            {g.done ? 'Earned' : 'Locked'}
          </span>
        ) : g.done ? (
          <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#4ade80' }}>Complete</span>
        ) : (
          <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.6)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {g.record ? 'Best ' : ''}{g.current.toLocaleString()}<span style={{ opacity: 0.5 }}> / {g.target.toLocaleString()}</span>
          </span>
        )}
      </div>
    </div>
  )
}
