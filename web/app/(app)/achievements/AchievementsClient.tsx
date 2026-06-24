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
  detail?: string
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<Filter>('all')
  const [detailGoal, setDetailGoal] = useState<JourneyGoal | null>(null)
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

  const visibleGroups = useMemo(
    () => groups
      .filter(grp => categoryFilter === 'all' || grp.title === categoryFilter)
      .map(grp => ({ ...grp, goals: grp.goals.filter(g => tierFilter === 'all' || g.difficulty === tierFilter) }))
      .filter(grp => grp.goals.length > 0),
    [groups, categoryFilter, tierFilter],
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
        borderRadius: 16, padding: '0.8rem 1rem', marginBottom: 14,
        background: ['radial-gradient(ellipse 90% 80% at 0% 0%, rgba(240,192,64,0.16) 0%, transparent 62%)', 'linear-gradient(180deg, rgba(44,34,14,0.62) 0%, rgba(20,15,8,0.78) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.34)', boxShadow: 'inset 0 0 26px rgba(0,0,0,0.35)',
      }}>
        {/* Score line — label + points + badges tally. No claim button here, so
            nothing competes for width and this never wraps awkwardly. */}
        <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: GOLD }}>Achievement Points</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          <span className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: '#f4ecd8', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 18px ${GOLD}33` }}>
            {earnedPoints}<span style={{ color: 'rgba(240,237,232,0.42)', fontSize: '1.05rem' }}> / {totalPoints}</span>
          </span>
          <span className="font-karla font-600" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.62)' }}>
            {earnedBadges} of {badgeGoals.length} badges earned
          </span>
        </div>

        {/* Thin points progress bar */}
        <div style={{ height: 6, borderRadius: 4, background: 'rgba(0,0,0,0.4)', overflow: 'hidden', marginTop: 10 }}>
          <div style={{ height: '100%', width: `${totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0}%`, background: `linear-gradient(90deg, ${GOLD}, #f7e09a)`, borderRadius: 4, transition: 'width 0.5s ease' }} />
        </div>

        {/* Claim-all banner — its own full-width row so the amount + button always
            sit on one line regardless of phone width. */}
        {claimableTotal > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 11, padding: '0.5rem 0.4rem 0.5rem 0.7rem', borderRadius: 10, background: `${GOLD}14`, border: `1px solid ${GOLD}40` }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{claimableTotal.toLocaleString()} ⟡</span>
              <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.6)' }}> · {claimable.length} ready</span>
            </span>
            <motion.button whileTap={{ scale: 0.94 }} onClick={e => claimAll(rectCenter(e.currentTarget))} disabled={busy === 'all'}
              className="font-cinzel font-700 uppercase tracking-[0.06em]"
              style={{
                flexShrink: 0, whiteSpace: 'nowrap', padding: '0.5rem 0.95rem', borderRadius: 9, cursor: busy ? 'default' : 'pointer',
                background: `${GOLD}26`, color: GOLD, border: `1px solid ${GOLD}`, fontSize: '0.74rem',
                opacity: busy === 'all' ? 0.6 : 1,
              }}>
              {busy === 'all' ? 'Claiming…' : 'Claim All'}
            </motion.button>
          </div>
        )}
      </div>

      {/* ── Filters: category + tier dropdowns ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <FilterSelect value={categoryFilter} onChange={setCategoryFilter}
          options={[{ value: 'all', label: 'All Categories' }, ...groups.map(g => ({ value: g.title, label: g.title }))]} />
        <FilterSelect value={tierFilter} onChange={v => setTierFilter(v as Filter)}
          options={[{ value: 'all', label: 'All Tiers' }, ...TIER_ORDER.map(t => ({ value: t, label: DIFFICULTY_META[t].label }))]} />
      </div>

      {/* ── Goal groups ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {visibleGroups.map(group => (
          <section key={group.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.accent, flexShrink: 0, boxShadow: `0 0 8px ${group.accent}` }} />
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.82rem', color: group.accent }}>{group.title}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.goals.map(g => (
                <GoalRow key={g.id} g={g} groupAccent={group.accent} claimed={claimedIds.has(g.id)} busy={busy === g.id}
                  onClaim={from => claimOne(g.id, from)} onOpen={() => setDetailGoal(g)} />
              ))}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 && (
          <p className="font-karla" style={{ fontSize: '0.9rem', color: 'rgba(240,237,232,0.5)', textAlign: 'center', padding: '2rem 0' }}>
            No badges match these filters.
          </p>
        )}
      </div>

      {/* Achievement detail modal — what it means + how to earn it. */}
      {mounted && createPortal(
        <AnimatePresence>
          {detailGoal && (() => {
            const g = detailGoal
            const diff = g.difficulty ? DIFFICULTY_META[g.difficulty] : null
            const accent = diff?.color ?? '#cbb98a'
            const reward = g.reward ?? 0
            const points = g.difficulty ? BADGE_POINTS[g.difficulty] : 0
            const isClaimed = claimedIds.has(g.id)
            const canClaim = g.done && reward > 0 && !isClaimed
            const pct = g.target > 0 ? Math.min(1, g.current / g.target) : (g.done ? 1 : 0)
            return (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onClick={() => setDetailGoal(null)}
                style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
                <motion.div onClick={e => e.stopPropagation()} initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                  style={{ position: 'relative', width: '100%', maxWidth: 360, textAlign: 'center', background: 'linear-gradient(180deg, #16202e 0%, #0a121c 100%)', border: `1px solid ${g.done ? accent + '88' : 'rgba(255,255,255,0.1)'}`, borderRadius: 20, padding: '1.5rem 1.25rem', boxShadow: '0 18px 60px rgba(0,0,0,0.6)' }}>
                  {/* Close */}
                  <button onClick={() => setDetailGoal(null)} aria-label="Close"
                    style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cdd3db', cursor: 'pointer', padding: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                  {/* Badge art */}
                  <div style={{ width: 88, height: 88, margin: '0 auto', borderRadius: 18, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.3)', border: `2px solid ${g.done ? accent : 'rgba(255,255,255,0.12)'}`, boxShadow: g.done ? `0 0 22px ${accent}55` : 'none' }}>
                    {g.badgeImage ? (
                      <img src={g.badgeImage} alt="" style={{ width: 62, height: 62, objectFit: 'contain', filter: g.done ? 'none' : 'grayscale(1)', opacity: g.done ? 1 : 0.3 }}
                        onError={e => { const el = e.target as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.innerHTML = `<span style="font-size:2.2rem;opacity:${g.done ? 0.9 : 0.3}">🏅</span>` }} />
                    ) : <span style={{ fontSize: '2.2rem', opacity: g.done ? 0.9 : 0.3 }}>🏅</span>}
                  </div>

                  <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f4ecd8', marginTop: 12 }}>{g.label}</p>

                  {/* Tier · points · reward */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
                    {diff && <span className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.06em', color: accent, background: `${accent}1f`, border: `1px solid ${accent}66`, borderRadius: 999, padding: '0.18rem 0.6rem' }}>{diff.label}</span>}
                    <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: 'rgba(240,237,232,0.75)' }}>{points} pt{points === 1 ? '' : 's'}</span>
                    <span style={{ color: 'rgba(240,237,232,0.3)' }}>·</span>
                    <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: GOLD }}>{reward.toLocaleString()} ⟡</span>
                  </div>

                  {/* In-depth blurb */}
                  <p className="font-karla" style={{ fontSize: '0.86rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.55, marginTop: 14 }}>{g.detail || g.desc}</p>

                  {/* Progress / state */}
                  {!g.done && !g.binary && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct * 100}%`, background: accent, borderRadius: 4 }} />
                      </div>
                      <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: 'rgba(240,237,232,0.6)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                        {g.record ? 'Best ' : ''}{g.current.toLocaleString()} / {g.target.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {g.done && (
                    <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.08em', color: isClaimed ? '#7bbf7b' : GOLD, marginTop: 14 }}>
                      {isClaimed ? 'Earned · reward claimed' : reward > 0 ? 'Earned · reward ready' : 'Earned'}
                    </p>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                    {canClaim && (
                      <motion.button whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); claimOne(g.id, rectCenter(e.currentTarget)) }} disabled={busy === g.id}
                        className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{ flex: 1, padding: '0.7rem', borderRadius: 11, background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}`, cursor: 'pointer', fontSize: '0.82rem', opacity: busy === g.id ? 0.6 : 1 }}>
                        {busy === g.id ? '…' : `Claim ${reward.toLocaleString()} ⟡`}
                      </motion.button>
                    )}
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => { const href = g.href; setDetailGoal(null); router.push(href) }}
                      className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{ flex: 1, padding: '0.7rem', borderRadius: 11, background: 'rgba(120,170,255,0.16)', color: '#bcd4ff', border: '1px solid rgba(120,170,255,0.4)', cursor: 'pointer', fontSize: '0.82rem' }}>
                      Take me there
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}

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

// ── Filter dropdown (category / tier) ───────────────────────────────────────
function FilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  const active = value !== 'all'
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="font-karla font-700"
        style={{
          width: '100%', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', cursor: 'pointer',
          padding: '0.6rem 2rem 0.6rem 0.85rem', borderRadius: 11, fontSize: '0.8rem',
          background: active ? `${GOLD}1c` : 'rgba(255,255,255,0.04)',
          color: active ? GOLD : '#e8e2d6',
          border: `1px solid ${active ? `${GOLD}88` : 'rgba(196,169,106,0.34)'}`,
          textOverflow: 'ellipsis',
        }}>
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: '#16100a', color: '#e8e2d6' }}>{o.label}</option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: GOLD, fontSize: '0.55rem' }}>▼</span>
    </div>
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

  // A banked (claimed/done) badge gets a gentle green gradient fill, anchored
  // at its left status stripe and fading out — reads as "locked in" without
  // out-shouting the gold "ready to claim" rows, which stay the loudest.
  const rowBackground =
    state === 'ready'   ? 'rgba(240,192,64,0.06)'
    : state === 'claimed' || state === 'done'
        ? 'linear-gradient(90deg, rgba(123,191,123,0.16) 0%, rgba(123,191,123,0.06) 58%, rgba(123,191,123,0.035) 100%)'
    : 'rgba(255,255,255,0.022)'

  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', overflow: 'hidden',
        background: rowBackground,
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
        <p className="font-karla font-700" style={{ fontSize: '1.02rem', color: g.done ? '#f4ecd8' : 'rgba(240,237,232,0.85)' }}>{g.label}</p>
        <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.4, marginTop: 2 }}>{g.desc}</p>

        {/* Meta: tier · points · reward — always shown for badges. */}
        {isBadge && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            {diff && (
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.06em', color: accent, background: `${accent}1f`, border: `1px solid ${accent}55`, borderRadius: 999, padding: '0.15rem 0.5rem' }}>{diff.label}</span>
            )}
            <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: 'rgba(240,237,232,0.72)' }}>{points} pt{points === 1 ? '' : 's'}</span>
            <span style={{ color: 'rgba(240,237,232,0.28)', fontSize: '0.7rem' }}>·</span>
            <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: GOLD, opacity: state === 'claimed' ? 0.5 : 1 }}>{reward.toLocaleString()} ⟡</span>
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
            style={{ padding: '0.55rem 0.95rem', borderRadius: 10, cursor: busy ? 'default' : 'pointer', background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}`, fontSize: '0.8rem', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {busy ? '…' : 'Claim'}
          </motion.button>
        ) : state === 'claimed' ? (
          <span className="font-karla font-700 uppercase" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', letterSpacing: '0.05em', color: '#7bbf7b' }}>Claimed</span>
        ) : state === 'done' ? (
          <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#7bbf7b' }}>Complete</span>
        ) : g.binary ? (
          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.05em', color: 'rgba(240,237,232,0.4)' }}>Locked</span>
        ) : (
          <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.7)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {g.record ? 'Best ' : ''}{g.current.toLocaleString()}<span style={{ opacity: 0.5 }}> / {g.target.toLocaleString()}</span>
          </span>
        )}
      </div>
    </div>
  )
}
