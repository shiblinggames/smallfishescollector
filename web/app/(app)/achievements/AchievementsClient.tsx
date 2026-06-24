'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { DIFFICULTY_META, BADGE_POINTS, type BadgeDifficulty } from '@/lib/badges'
import { vibrate } from '@/lib/haptics'
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
const TIER_ORDER: BadgeDifficulty[] = ['rookie', 'seasoned', 'veteran', 'master']
type Filter = 'all' | BadgeDifficulty

const rectCenter = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export default function AchievementsClient({ groups }: Props) {
  const router = useRouter()
  const allGoals = useMemo(() => groups.flatMap(g => g.goals), [groups])

  const [claimedIds, setClaimedIds] = useState<Set<string>>(
    () => new Set(allGoals.filter(g => g.claimed).map(g => g.id)),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Coins that fly from the claim button up into the Nav doubloon pill.
  const [coins, setCoins] = useState<{ id: number; fromX: number; fromY: number; toX: number; toY: number; delay: number }[]>([])
  const coinId = useRef(0)

  const badgeGoals = allGoals.filter(g => (g.reward ?? 0) > 0)
  const earnedBadges = badgeGoals.filter(g => g.done).length
  const pointsOf = (g: JourneyGoal) => (g.difficulty ? BADGE_POINTS[g.difficulty] : 0)
  const earnedPoints = badgeGoals.filter(g => g.done).reduce((s, g) => s + pointsOf(g), 0)
  const totalPoints = badgeGoals.reduce((s, g) => s + pointsOf(g), 0)
  const claimable = badgeGoals.filter(g => g.done && !claimedIds.has(g.id))
  const claimableTotal = claimable.reduce((s, g) => s + (g.reward ?? 0), 0)
  const tierCount = (t: BadgeDifficulty) => badgeGoals.filter(g => g.difficulty === t).length
  const tierEarned = (t: BadgeDifficulty) => badgeGoals.filter(g => g.difficulty === t && g.done).length

  const visibleGroups = useMemo(
    () => groups
      .map(grp => ({ ...grp, goals: grp.goals.filter(g => filter === 'all' || g.difficulty === filter) }))
      .filter(grp => grp.goals.length > 0),
    [groups, filter],
  )

  const notifyDoubloons = (n: number) => window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: n }))

  // Center of the (visible) Nav doubloon pill — the flight destination.
  function navPillTarget(): { x: number; y: number } | null {
    const pills = Array.from(document.querySelectorAll('[data-doubloon-pill]')) as HTMLElement[]
    const vis = pills.find(p => { const r = p.getBoundingClientRect(); return r.width > 0 && r.top >= -10 && r.top < window.innerHeight })
    if (!vis) return null
    const r = vis.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  function popNavPill() {
    (Array.from(document.querySelectorAll('[data-doubloon-pill]')) as HTMLElement[])
      .forEach(p => p.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' }))
  }

  // Spawn a coin burst flying from `from` → the nav pill; tick the count up +
  // pop the pill as they land. Falls back to an instant update if no pill.
  function flyCoins(from: { x: number; y: number }, amount: number, newDoubloons: number) {
    const to = navPillTarget()
    if (!to) { notifyDoubloons(newDoubloons); return }
    const n = Math.min(16, Math.max(6, Math.round(amount / 1200) + 5))
    const batch = Array.from({ length: n }, (_, i) => ({
      id: coinId.current++, fromX: from.x, fromY: from.y,
      toX: to.x + (Math.random() * 18 - 9), toY: to.y + (Math.random() * 8 - 4), delay: i * 0.045,
    }))
    setCoins(prev => [...prev, ...batch])
    vibrate([0, 18, 40, 22])
    const flightMs = 560 + n * 45
    setTimeout(() => { notifyDoubloons(newDoubloons); popNavPill() }, Math.max(280, flightMs - 220))
    setTimeout(() => setCoins(prev => prev.filter(c => !batch.some(b => b.id === c.id))), flightMs + 500)
  }

  function claimOne(id: string, from: { x: number; y: number }) {
    if (busy) return
    setBusy(id)
    startTransition(async () => {
      const r = await claimBadgeReward(id)
      setBusy(null)
      if ('error' in r) return
      setClaimedIds(prev => new Set(prev).add(id))
      if (r.amount > 0) flyCoins(from, r.amount, r.newDoubloons)
    })
  }
  function claimAll(from: { x: number; y: number }) {
    if (busy || claimable.length === 0) return
    setBusy('all')
    startTransition(async () => {
      const r = await claimAllBadgeRewards()
      setBusy(null)
      if ('error' in r) return
      setClaimedIds(new Set(r.claimed))
      if (r.totalGranted > 0) flyCoins(from, r.totalGranted, r.newDoubloons)
    })
  }

  return (
    <div>
      {/* ── Hero: achievement-point score + claim banner ─────────────────── */}
      <div style={{
        borderRadius: 18, padding: '1.05rem 1.1rem', marginBottom: 16,
        background: ['radial-gradient(ellipse 90% 80% at 0% 0%, rgba(240,192,64,0.16) 0%, transparent 62%)', 'linear-gradient(180deg, rgba(44,34,14,0.62) 0%, rgba(20,15,8,0.78) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.34)', boxShadow: 'inset 0 0 26px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: GOLD }}>Achievement Points</p>
            <p className="font-cinzel font-800" style={{ fontSize: '2.4rem', color: '#f4ecd8', lineHeight: 0.95, marginTop: 3, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 18px ${GOLD}33` }}>
              {earnedPoints}<span style={{ color: 'rgba(240,237,232,0.38)', fontSize: '1.1rem' }}> / {totalPoints}</span>
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.55)', marginTop: 4 }}>
              {earnedBadges} of {badgeGoals.length} badges earned
            </p>
          </div>

          {claimableTotal > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
              <p className="font-cinzel font-800" style={{ fontSize: '1.2rem', color: GOLD, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 12px ${GOLD}55` }}>
                {claimableTotal.toLocaleString()} ⟡
              </p>
              <motion.button whileTap={{ scale: 0.94 }} onClick={e => claimAll(rectCenter(e.currentTarget))} disabled={busy === 'all'}
                className="font-cinzel font-700 uppercase tracking-[0.08em]"
                style={{
                  padding: '0.62rem 1.05rem', borderRadius: 11, cursor: busy ? 'default' : 'pointer',
                  background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}`, fontSize: '0.74rem',
                  boxShadow: `0 0 16px ${GOLD}26`, opacity: busy === 'all' ? 0.6 : 1,
                }}>
                {busy === 'all' ? 'Claiming…' : `Claim All (${claimable.length})`}
              </motion.button>
            </div>
          )}
        </div>

        {/* Thin points progress bar */}
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.4)', overflow: 'hidden', marginTop: 12 }}>
          <div style={{ height: '100%', width: `${totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0}%`, background: `linear-gradient(90deg, ${GOLD}, #f7e09a)`, borderRadius: 4, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* ── Mastery filter chips ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 18, WebkitOverflowScrolling: 'touch' }}>
        <FilterChip active={filter === 'all'} label="All" color="#cbb98a" onClick={() => setFilter('all')} count={badgeGoals.length} earned={earnedBadges} />
        {TIER_ORDER.map(t => (
          <FilterChip key={t} active={filter === t} label={DIFFICULTY_META[t].label} color={DIFFICULTY_META[t].color}
            onClick={() => setFilter(t)} count={tierCount(t)} earned={tierEarned(t)} />
        ))}
      </div>

      {/* ── Goal groups ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {visibleGroups.map(group => (
          <section key={group.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.accent, flexShrink: 0, boxShadow: `0 0 8px ${group.accent}` }} />
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.74rem', color: group.accent }}>{group.title}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.goals.map(g => (
                <GoalRow key={g.id} g={g} groupAccent={group.accent} claimed={claimedIds.has(g.id)} busy={busy === g.id}
                  onClaim={from => claimOne(g.id, from)} onOpen={() => router.push(g.href)} />
              ))}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 && (
          <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.4)', textAlign: 'center', padding: '2rem 0' }}>
            No {filter !== 'all' ? DIFFICULTY_META[filter].label : ''} badges here.
          </p>
        )}
      </div>

      {/* Coins flying from the claim button up into the Nav doubloon pill. */}
      {mounted && createPortal(
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 9500, pointerEvents: 'none' }}>
          <AnimatePresence>
            {coins.map(c => (
              <motion.div key={c.id}
                initial={{ left: c.fromX, top: c.fromY, opacity: 0, scale: 0.4 }}
                animate={{
                  left: [c.fromX, (c.fromX + c.toX) / 2, c.toX],
                  top: [c.fromY, Math.min(c.fromY, c.toY) - 46, c.toY],
                  opacity: [0, 1, 0], scale: [0.4, 1, 0.5],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.62, delay: c.delay, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', width: 15, height: 15, marginLeft: -7.5, marginTop: -7.5, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #ffe79a, #e6b948 65%, #c4922f)',
                  border: '1px solid #b9892e', boxShadow: '0 0 8px rgba(240,192,64,0.6)',
                }} />
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Mastery filter chip ─────────────────────────────────────────────────────
function FilterChip({ active, label, color, count, earned, onClick }: {
  active: boolean; label: string; color: string; count: number; earned: number; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="font-karla font-700 uppercase tracking-[0.06em]"
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
        padding: '0.42rem 0.75rem', borderRadius: 999, fontSize: '0.62rem',
        background: active ? `${color}26` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
        color: active ? color : 'rgba(240,237,232,0.55)',
      }}>
      {label}
      <span style={{ fontSize: '0.56rem', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>{earned}/{count}</span>
    </button>
  )
}

// ── One goal row ────────────────────────────────────────────────────────────
function GoalRow({ g, groupAccent, claimed, busy, onClaim, onOpen }: {
  g: JourneyGoal; groupAccent: string; claimed: boolean; busy: boolean; onClaim: (from: { x: number; y: number }) => void; onOpen: () => void
}) {
  const diff = g.difficulty ? DIFFICULTY_META[g.difficulty] : null
  const accent = diff?.color ?? groupAccent
  const pct = g.target > 0 ? Math.min(1, g.current / g.target) : (g.done ? 1 : 0)
  const reward = g.reward ?? 0
  const points = g.difficulty ? BADGE_POINTS[g.difficulty] : 0
  const isBadge = reward > 0

  // Three clear states for a badge: ready (earned, unclaimed) / claimed / progress.
  const state: 'ready' | 'claimed' | 'progress' | 'done' =
    isBadge ? (g.done ? (claimed ? 'claimed' : 'ready') : 'progress') : (g.done ? 'done' : 'progress')

  const statusColor = state === 'ready' ? GOLD : state === 'claimed' || state === 'done' ? '#7bbf7b' : 'rgba(255,255,255,0.12)'

  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', overflow: 'hidden',
        background: state === 'ready' ? 'rgba(240,192,64,0.06)' : state === 'claimed' || state === 'done' ? 'rgba(123,191,123,0.05)' : 'rgba(255,255,255,0.022)',
        border: `1px solid ${state === 'ready' ? 'transparent' : state === 'claimed' || state === 'done' ? 'rgba(123,191,123,0.25)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14, padding: '0.75rem 0.85rem 0.75rem 0.95rem',
        animation: state === 'ready' ? 'badgeReadyPulse 2.1s ease-in-out infinite' : undefined,
      }}
    >
      {/* Left status stripe — scannable state colour. */}
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: statusColor }} />

      {/* Badge art / marker */}
      <div style={{
        position: 'relative', width: 50, height: 50, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.24)',
        border: g.badgeImage && g.done ? `1.5px solid ${accent}` : '1.5px solid transparent',
        boxShadow: g.badgeImage && g.done ? `0 0 14px ${accent}55` : 'none',
      }}>
        {g.badgeImage ? (
          <img src={g.badgeImage} alt="" loading="lazy" decoding="async"
            style={{ width: 36, height: 36, objectFit: 'contain', filter: g.done ? 'none' : 'grayscale(1)', opacity: g.done ? 1 : 0.28 }}
            onError={e => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              const p = el.parentElement
              if (p) p.innerHTML = `<span style="font-size:1.3rem;opacity:${g.done ? 0.9 : 0.28}">🏅</span>`
            }} />
        ) : (
          <span style={{ width: 15, height: 15, borderRadius: '50%', background: g.done ? groupAccent : 'transparent', border: `2px solid ${groupAccent}`, opacity: g.done ? 1 : 0.5 }} />
        )}
        {/* Claimed check overlay */}
        {state === 'claimed' && (
          <span style={{ position: 'absolute', bottom: -3, right: -3, width: 18, height: 18, borderRadius: '50%', background: '#1c2a1c', border: '1.5px solid #7bbf7b', display: 'grid', placeItems: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7bbf7b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: g.done ? '#f0ede8' : 'rgba(240,237,232,0.8)' }}>{g.label}</p>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.45)', lineHeight: 1.4, marginTop: 1 }}>{g.desc}</p>

        {/* Meta: tier · points · reward — always shown for badges. */}
        {isBadge && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {diff && (
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: accent, background: `${accent}1f`, border: `1px solid ${accent}55`, borderRadius: 999, padding: '0.12rem 0.45rem' }}>{diff.label}</span>
            )}
            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: 'rgba(240,237,232,0.6)' }}>{points} pt{points === 1 ? '' : 's'}</span>
            <span style={{ color: 'rgba(240,237,232,0.22)', fontSize: '0.55rem' }}>·</span>
            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: GOLD, opacity: state === 'claimed' ? 0.5 : 1 }}>{reward.toLocaleString()} ⟡</span>
          </div>
        )}

        {!g.binary && !g.done && (
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: accent, borderRadius: 3, opacity: 0.8 }} />
          </div>
        )}
      </div>

      {/* Right action zone */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {state === 'ready' ? (
          <motion.button whileTap={{ scale: 0.92 }} onClick={e => { e.stopPropagation(); onClaim(rectCenter(e.currentTarget)) }} disabled={busy}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ padding: '0.5rem 0.85rem', borderRadius: 10, cursor: busy ? 'default' : 'pointer', background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}`, fontSize: '0.7rem', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {busy ? '…' : 'Claim'}
          </motion.button>
        ) : state === 'claimed' ? (
          <span className="font-karla font-700 uppercase" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', letterSpacing: '0.06em', color: '#7bbf7b' }}>Claimed</span>
        ) : state === 'done' ? (
          <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#7bbf7b' }}>Complete</span>
        ) : g.binary ? (
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.06em', color: 'rgba(240,237,232,0.32)' }}>Locked</span>
        ) : (
          <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.6)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {g.record ? 'Best ' : ''}{g.current.toLocaleString()}<span style={{ opacity: 0.5 }}> / {g.target.toLocaleString()}</span>
          </span>
        )}
      </div>
    </div>
  )
}
