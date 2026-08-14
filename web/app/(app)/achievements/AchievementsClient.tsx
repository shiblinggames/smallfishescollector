'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ctaPill } from '@/lib/uiTokens'
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
  /** Global rarity — % of active players who've unlocked this badge. Undefined
   *  means no one has earned it yet. */
  rarityPct?: number
}

export interface JourneyGroup {
  title: string
  accent: string
  /** One line of ship's-voice flavor under the section title — the character
   *  layer. Optional so non-badge journey surfaces can skip it. */
  flavor?: string
  goals: JourneyGoal[]
}

interface Props {
  groups: JourneyGroup[]
  doneCount: number
  totalCount: number
}

const GOLD = '#f0c040'
const TIER_ORDER: BadgeDifficulty[] = ['rookie', 'seasoned', 'veteran', 'master', 'grandmaster']
type Filter = 'all' | BadgeDifficulty
type StatusFilter = 'all' | 'unclaimed' | 'claimed'

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detailGoal, setDetailGoal] = useState<JourneyGoal | null>(null)
  // Category sections start COLLAPSED so the board mounts as a scannable index
  // (each header still shows its N/total progress) instead of rendering all ~170
  // goal rows at once. Players tap a section, or use "Expand all", to open them.
  // An active filter force-expands matching goals (see `expanded` below).
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const [, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Coins that fly from the claim button up into the Nav doubloon pill.
  const [coins, setCoins] = useState<{ id: number; fromX: number; fromY: number; toX: number; toY: number; delay: number }[]>([])
  const coinId = useRef(0)

  const badgeGoals = allGoals.filter(g => (g.reward ?? 0) > 0)
  const earnedBadges = badgeGoals.filter(g => g.done).length
  // The proudest color: the hardest-tier badge earned (ties broken by reward
  // size) — the medallion that anchors the honor-board plaque.
  const proudest = useMemo(() => {
    const earned = badgeGoals.filter(g => g.done && g.badgeImage && g.difficulty)
    if (earned.length === 0) return null
    return [...earned].sort((a, b) =>
      TIER_ORDER.indexOf(b.difficulty!) - TIER_ORDER.indexOf(a.difficulty!) || (b.reward ?? 0) - (a.reward ?? 0),
    )[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGoals])
  const pointsOf = (g: JourneyGoal) => (g.difficulty ? BADGE_POINTS[g.difficulty] : 0)
  const earnedPoints = badgeGoals.filter(g => g.done).reduce((s, g) => s + pointsOf(g), 0)
  const totalPoints = badgeGoals.reduce((s, g) => s + pointsOf(g), 0)
  const claimable = badgeGoals.filter(g => g.done && !claimedIds.has(g.id))
  const claimableTotal = claimable.reduce((s, g) => s + (g.reward ?? 0), 0)
  // Surfaced at the very top (filter-independent) so players see exactly what
  // they earned without hunting down the category list. Richest reward first.
  const claimableSorted = [...claimable].sort((a, b) => (b.reward ?? 0) - (a.reward ?? 0))

  // The 10 scarcest colors any captain flies — sorted by global rarity (only
  // badges at least one player holds; ties broken toward the harder tier).
  const rarest = useMemo(
    () => allGoals
      .filter(g => g.rarityPct != null)
      .sort((a, b) => (a.rarityPct! - b.rarityPct!)
        || (TIER_ORDER.indexOf((b.difficulty ?? 'rookie') as BadgeDifficulty) - TIER_ORDER.indexOf((a.difficulty ?? 'rookie') as BadgeDifficulty)))
      .slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allGoals],
  )
  const rarityColor = (r?: number) => (r == null ? '#8a8480' : r < 1 ? '#c9a7ff' : r < 5 ? GOLD : '#6fb2d8')

  // Claim-status filter — only meaningful for reward-bearing badges. "Unclaimed"
  // is every badge whose reward is still owed (earned-but-unclaimed AND still in
  // progress); "claimed" is the banked shelf. Non-badge journey goals fall out
  // of both, since they have nothing to claim.
  const matchesStatus = (g: JourneyGoal) => {
    if (statusFilter === 'all') return true
    if ((g.reward ?? 0) <= 0) return false
    return statusFilter === 'claimed' ? claimedIds.has(g.id) : !claimedIds.has(g.id)
  }
  const claimedCount = badgeGoals.filter(g => claimedIds.has(g.id)).length
  const unclaimedCount = badgeGoals.length - claimedCount

  const visibleGroups = useMemo(
    () => groups
      .filter(grp => categoryFilter === 'all' || grp.title === categoryFilter)
      .map(grp => ({ ...grp, goals: grp.goals.filter(g => (tierFilter === 'all' || g.difficulty === tierFilter) && matchesStatus(g)) }))
      .filter(grp => grp.goals.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, categoryFilter, tierFilter, statusFilter, claimedIds],
  )

  // Any active filter means the player is hunting — force every visible section
  // open so results aren't hidden behind a collapsed header.
  const filtersActive = categoryFilter !== 'all' || tierFilter !== 'all' || statusFilter !== 'all'
  const allOpen = visibleGroups.length > 0 && visibleGroups.every(g => openGroups.has(g.title))
  function toggleGroup(title: string) {
    setOpenGroups(prev => { const n = new Set(prev); if (n.has(title)) n.delete(title); else n.add(title); return n })
  }
  function toggleAll() {
    setOpenGroups(allOpen ? new Set() : new Set(visibleGroups.map(g => g.title)))
  }

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
      window.dispatchEvent(new Event('badges-changed'))
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
      window.dispatchEvent(new Event('badges-changed'))
      if (r.totalGranted > 0) flyCoins(from, r.totalGranted, r.newDoubloons)
    })
  }

  return (
    <div>
      {/* ── Hero: the honor board plaque — score + proudest color ───────── */}
      <div style={{
        borderRadius: 16, padding: '0.85rem 1rem', marginBottom: 14,
        background: ['radial-gradient(ellipse 90% 80% at 0% 0%, rgba(240,192,64,0.16) 0%, transparent 62%)', 'linear-gradient(180deg, rgba(44,34,14,0.62) 0%, rgba(20,15,8,0.78) 100%)'].join(', '),
        border: '1px solid rgba(196,169,106,0.34)', boxShadow: 'inset 0 0 26px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Proudest color — the hardest-won medallion anchors the plaque so
              the board opens on YOUR badge, not a number. */}
          {proudest?.badgeImage && (
            <img src={proudest.badgeImage} alt="" title={proudest.label}
              style={{ width: 56, height: 56, flexShrink: 0, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.55))' }} />
          )}
          <div style={{ minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: GOLD }}>Achievement Points</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
              <span className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: '#f4ecd8', lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 18px ${GOLD}33` }}>
                {earnedPoints}<span style={{ color: 'rgba(240,237,232,0.42)', fontSize: '1.05rem' }}> / {totalPoints}</span>
              </span>
              <span className="font-karla font-600" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.62)' }}>
                {earnedBadges} of {badgeGoals.length} colors flown
              </span>
            </div>
          </div>
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
                // Same gold-on-gold-on-gold as the per-badge Claim it sits above.
                // The banner behind it keeps its tint: it is the frame, not the
                // thing to press.
                ...ctaPill(), fontSize: '0.74rem',
                opacity: busy === 'all' ? 0.6 : 1,
              }}>
              {busy === 'all' ? 'Claiming…' : 'Claim All'}
            </motion.button>
          </div>
        )}
      </div>

      {/* ── Ready to Claim: every earned-but-unclaimed badge, surfaced up top so
            players see what they got without scrolling the category list. Always
            shows all of them (ignores the filters below). Rows drop off as they
            get claimed. ─────────────────────────────────────────────────────── */}
      {claimableSorted.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <SectionHeader accent={GOLD} title={`Ready to Claim · ${claimableSorted.length}`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {claimableSorted.map(g => (
              <GoalRow key={`ready-${g.id}`} g={g} groupAccent={GOLD} claimed={false} busy={busy === g.id}
                onClaim={from => claimOne(g.id, from)} onOpen={() => setDetailGoal(g)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Rarest in the Fleet: the scarcest badges across all captains, by
            global unlock %. Filter-independent; tap one to open its detail
            card. ─────────────────────────────────────────────────────────── */}
      {rarest.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <SectionHeader accent="#c9a7ff" title="Rarest in the Fleet" />
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
            {rarest.map(g => {
              const rc = rarityColor(g.rarityPct)
              const pctLabel = g.rarityPct == null ? '—' : `${g.rarityPct < 0.1 ? '<0.1' : g.rarityPct.toFixed(1)}%`
              return (
                <button key={`rare-${g.id}`} type="button" onClick={() => setDetailGoal(g)} className="tap"
                  style={{ flexShrink: 0, width: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0.7rem 0.5rem 0.6rem', borderRadius: 14, cursor: 'pointer', background: `${rc}12`, border: `1px solid ${rc}44` }}>
                  <div style={{ width: 56, height: 56, display: 'grid', placeItems: 'center' }}>
                    {g.badgeImage
                      ? <img src={g.badgeImage} alt="" style={{ width: 54, height: 54, objectFit: 'contain', filter: g.done ? 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' : 'grayscale(1)', opacity: g.done ? 1 : 0.4 }}
                          onError={e => { const el = e.target as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.innerHTML = `<span style="display:block;width:44px;height:44px;border-radius:50%;border:3px solid ${rc}"></span>` }} />
                      : <span style={{ display: 'block', width: 44, height: 44, borderRadius: '50%', border: `3px solid ${rc}` }} />}
                  </div>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.64rem', color: '#f0ede8', lineHeight: 1.15, textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.label}</span>
                  <span className="font-karla font-800" style={{ fontSize: '0.6rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}55`, borderRadius: 999, padding: '0.14rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>{pctLabel}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Filters: category + tier dropdowns ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <FilterSelect value={categoryFilter} onChange={setCategoryFilter}
          options={[{ value: 'all', label: 'All Categories' }, ...groups.map(g => ({ value: g.title, label: g.title }))]} />
        <FilterSelect value={tierFilter} onChange={v => setTierFilter(v as Filter)}
          options={[{ value: 'all', label: 'All Tiers' }, ...TIER_ORDER.map(t => ({ value: t, label: DIFFICULTY_META[t].label }))]} />
      </div>

      {/* Claim status — a segmented toggle so it reads as one control, not a
          third dropdown crowding the row. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([
          ['all', 'All', badgeGoals.length],
          ['unclaimed', 'Unclaimed', unclaimedCount],
          ['claimed', 'Claimed', claimedCount],
        ] as const).map(([val, label, n]) => {
          const active = statusFilter === val
          return (
            <button key={val} type="button" onClick={() => setStatusFilter(val)}
              className="font-karla font-700"
              style={{
                flex: 1, padding: '0.5rem 0.4rem', borderRadius: 11, fontSize: '0.76rem', cursor: 'pointer',
                background: active ? `${GOLD}1c` : 'rgba(255,255,255,0.04)',
                color: active ? GOLD : '#e8e2d6',
                border: `1px solid ${active ? `${GOLD}88` : 'rgba(196,169,106,0.34)'}`,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {label} <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
            </button>
          )
        })}
      </div>

      {/* Open the whole board or tuck it away — hidden while filtering (every
          section is already forced open then). */}
      {!filtersActive && visibleGroups.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button type="button" onClick={toggleAll} className="font-karla font-700 uppercase tracking-[0.1em]"
            style={{ background: 'none', border: 'none', color: '#b6a98c', fontSize: '0.6rem', cursor: 'pointer', padding: '2px 4px' }}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      {/* ── Goal groups — collapsible category sections ────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleGroups.map(group => {
          const expanded = filtersActive || openGroups.has(group.title)
          const doneN = group.goals.filter(g => g.done).length
          return (
            <section key={group.title}>
              {/* Tap-to-toggle header — accent title, chart rule, earned tally,
                  and a chevron. Non-interactive while a filter is on. */}
              <button type="button" onClick={() => { if (!filtersActive) toggleGroup(group.title) }} aria-expanded={expanded}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '0.3rem 0', cursor: filtersActive ? 'default' : 'pointer', textAlign: 'left' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: group.accent, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{group.title}</p>
                <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${group.accent}66, transparent)` }} />
                <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.5)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{doneN} / {group.goals.length}</span>
                {!filtersActive && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={group.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                    style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.85 }}><path d="M6 9l6 6 6-6" /></svg>
                )}
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }} style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
                      {group.goals.map(g => (
                        <GoalRow key={g.id} g={g} groupAccent={group.accent} claimed={claimedIds.has(g.id)} busy={busy === g.id}
                          onClaim={from => claimOne(g.id, from)} onOpen={() => setDetailGoal(g)} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )
        })}
        {visibleGroups.length === 0 && (
          <p className="font-karla" style={{ fontSize: '0.9rem', color: 'rgba(240,237,232,0.5)', textAlign: 'center', padding: '2rem 0', fontStyle: 'italic' }}>
            No colors match that tack. Ease off the filters and look again.
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
                  style={{ position: 'relative', width: '100%', maxWidth: 360, textAlign: 'center', background: 'linear-gradient(180deg, #241a10 0%, #140d07 100%)', border: `1px solid ${g.done ? accent + '88' : 'rgba(196,169,106,0.3)'}`, borderRadius: 20, padding: '1.5rem 1.25rem', boxShadow: '0 18px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(240,192,64,0.08)' }}>
                  {/* Close */}
                  <button onClick={() => setDetailGoal(null)} aria-label="Close"
                    style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cdd3db', cursor: 'pointer', padding: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                  {/* Badge art — no box; the medallion is the focal element. */}
                  <div style={{ width: 96, height: 96, margin: '0 auto', display: 'grid', placeItems: 'center' }}>
                    {g.badgeImage ? (
                      <img src={g.badgeImage} alt="" style={{ width: 92, height: 92, objectFit: 'contain', filter: g.done ? 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' : 'grayscale(1)', opacity: g.done ? 1 : 0.3 }}
                        onError={e => { const el = e.target as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.innerHTML = `<span style="display:block;width:76px;height:76px;border-radius:50%;border:3px solid rgba(196,169,106,${g.done ? 0.8 : 0.3});box-shadow:inset 0 0 18px rgba(196,169,106,0.2)"></span>` }} />
                    ) : <span style={{ display: 'block', width: 76, height: 76, borderRadius: '50%', border: `3px solid rgba(196,169,106,${g.done ? 0.8 : 0.3})`, boxShadow: 'inset 0 0 18px rgba(196,169,106,0.2)' }} />}
                  </div>

                  <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f4ecd8', marginTop: 12 }}>{g.label}</p>

                  {/* Tier · points · reward */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
                    {diff && (g.difficulty === 'grandmaster'
                      ? <span className="font-karla font-800 uppercase tier-grandmaster-text" style={{ fontSize: '0.64rem', letterSpacing: '0.12em' }}>{diff.label}</span>
                      : <span className="font-karla font-800 uppercase" style={{ fontSize: '0.64rem', letterSpacing: '0.12em', color: accent }}>{diff.label}</span>)}
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

                  {/* Global rarity — how many captains across the fleet hold this
                      color (Steam-style). A themed bar + a "Rare find" flair for
                      the scarce ones. */}
                  {(() => {
                    const r = g.rarityPct
                    const rare = r != null && r < 5
                    const veryRare = r != null && r < 1
                    const barPct = r == null ? 0 : Math.max(2, Math.min(100, r))
                    const fill = veryRare ? '#c9a7ff' : rare ? GOLD : '#6fb2d8'
                    const label = r == null
                      ? 'No captain has claimed this yet'
                      : `${r < 0.1 ? '<0.1' : r.toFixed(1)}% of captains have earned this`
                    return (
                      <div style={{ marginTop: 16, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', color: 'rgba(240,237,232,0.5)' }}>Global rarity</span>
                          {(rare || r == null) && (
                            <span className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: veryRare || r == null ? '#c9a7ff' : GOLD, background: `${veryRare || r == null ? '#c9a7ff' : GOLD}1c`, border: `1px solid ${veryRare || r == null ? '#c9a7ff' : GOLD}55`, borderRadius: 999, padding: '0.14rem 0.42rem' }}>
                              {r == null ? 'Unclaimed' : veryRare ? 'One in a hundred' : 'Rare find'}
                            </span>
                          )}
                        </div>
                        <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${barPct}%` }} transition={{ type: 'spring', stiffness: 160, damping: 26, delay: 0.1 }}
                            style={{ height: '100%', background: fill, borderRadius: 4 }} />
                        </div>
                        <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.6)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{label}</p>
                      </div>
                    )
                  })()}

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

// ── Section header — a nautical rule instead of a dot-and-label. The accent
//    title sits on a line that fades out to the right (a drawn chart rule),
//    with the group's earned tally at the far end and one line of ship's-voice
//    flavor beneath. This is most of the page's "warmth" — copy + craft, not
//    chrome. ──────────────────────────────────────────────────────────────────
function SectionHeader({ accent, title, count }: { accent: string; title: string; count?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: accent, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{title}</p>
        <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}66, transparent)` }} />
        {count && (
          <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.5)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{count}</span>
        )}
      </div>
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

  // A banked (claimed/done) badge gets a gentle green gradient fill, anchored
  // at its left status stripe and fading out — reads as "locked in" without
  // out-shouting the gold "ready to claim" rows, which stay the loudest.
  const rowBackground =
    state === 'ready'   ? 'rgba(240,192,64,0.06)'
    : state === 'claimed' || state === 'done'
        ? 'linear-gradient(90deg, rgba(123,191,123,0.16) 0%, rgba(123,191,123,0.06) 58%, rgba(123,191,123,0.035) 100%)'
    : 'rgba(210,180,120,0.035)'   // warm timber, not app-gray — in-progress rows

  // Rubber-stamp state marks — inked, slightly askew, like a purser working
  // through the ledger. The gold Claim button stays a button (the one live
  // action on the row).
  const stamp = (text: string, ink: string, faint = false) => (
    <span className="font-cinzel font-800 uppercase" style={{
      display: 'inline-block', transform: 'rotate(-7deg)',
      padding: '0.2rem 0.5rem', borderRadius: 4,
      border: `2px solid ${ink}`, color: ink, opacity: faint ? 0.55 : 0.9,
      fontSize: '0.6rem', letterSpacing: '0.12em', whiteSpace: 'nowrap',
      boxShadow: `inset 0 0 6px ${ink}22`,
    }}>{text}</span>
  )

  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', overflow: 'hidden',
        background: rowBackground,
        border: `1px solid ${state === 'ready' ? 'transparent' : state === 'claimed' || state === 'done' ? 'rgba(123,191,123,0.25)' : 'rgba(196,169,106,0.16)'}`,
        borderRadius: 14, padding: '0.75rem 0.85rem',
        boxShadow: 'inset 0 1px 0 rgba(240,220,180,0.05)',
        animation: state === 'ready' ? 'badgeReadyPulse 2.1s ease-in-out infinite' : undefined,
      }}
    >
      {/* Badge art — the medallion has its own metal rim, so it stands free
          with no box chrome. A ready-to-claim medallion glows gold. */}
      <div style={{
        position: 'relative', width: 54, height: 54, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {g.badgeImage ? (
          <img src={g.badgeImage} alt="" loading="lazy" decoding="async"
            style={{ width: 50, height: 50, objectFit: 'contain', filter: state === 'ready' ? `drop-shadow(0 0 7px ${GOLD}aa)` : g.done ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' : 'grayscale(1) brightness(0.85)', opacity: g.done ? 1 : 0.32 }}
            onError={e => {
              // No-emoji rule: a plain brass ring stands in for missing art.
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              const p = el.parentElement
              if (p) p.innerHTML = `<span style="display:block;width:42px;height:42px;border-radius:50%;border:2.5px solid rgba(196,169,106,${g.done ? 0.8 : 0.3});box-shadow:inset 0 0 10px rgba(196,169,106,0.2)"></span>`
            }} />
        ) : (
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: g.done ? groupAccent : 'transparent', border: `2px solid ${groupAccent}`, opacity: g.done ? 1 : 0.5 }} />
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: g.done ? '#f4ecd8' : 'rgba(240,237,232,0.85)', letterSpacing: '0.01em' }}>{g.label}</p>
        <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.4, marginTop: 2 }}>{g.desc}</p>

        {/* Meta — plain inked text, not chip soup: TIER · pts · ⟡. Grandmaster
            keeps its shimmer chip (the one tier that has earned the noise). */}
        {isBadge && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
            {diff && (
              g.difficulty === 'grandmaster'
              ? <span className="font-karla font-800 uppercase tier-grandmaster-text" style={{ fontSize: '0.62rem', letterSpacing: '0.12em' }}>{diff.label}</span>
              : <span className="font-karla font-800 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: accent }}>{diff.label}</span>
            )}
            <span style={{ color: 'rgba(240,237,232,0.25)', fontSize: '0.66rem' }}>·</span>
            <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.62)' }}>{points} pt{points === 1 ? '' : 's'}</span>
            <span style={{ color: 'rgba(240,237,232,0.25)', fontSize: '0.66rem' }}>·</span>
            <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: GOLD, opacity: state === 'claimed' ? 0.5 : 1 }}>{reward.toLocaleString()} ⟡</span>
          </div>
        )}

        {/* Progress — a ship's gauge, not an app bar: recessed channel with
            quarter ticks the accent fill sweeps past. */}
        {!g.binary && !g.done && (
          <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})`, borderRadius: 3 }} />
            {[25, 50, 75].map(t => (
              <span key={t} aria-hidden style={{ position: 'absolute', left: `${t}%`, top: 0, bottom: 0, width: 1, background: 'rgba(10,8,4,0.55)' }} />
            ))}
          </div>
        )}
      </div>

      {/* Right zone: the Claim button, an ink stamp, or the running tally. */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {state === 'ready' ? (
          <motion.button whileTap={{ scale: 0.92 }} onClick={e => { e.stopPropagation(); onClaim(rectCenter(e.currentTarget)) }} disabled={busy}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            // A reward waiting to be taken, sitting on a row that is itself
            // faintly gold. Gold type on a 13% gold ground on a gold row is
            // three quiet things stacked; this is the one loud one.
            style={{ padding: '0.55rem 0.95rem', borderRadius: 10, cursor: busy ? 'default' : 'pointer', ...ctaPill(), fontSize: '0.8rem', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {busy ? '…' : 'Claim'}
          </motion.button>
        ) : state === 'claimed' ? (
          stamp('Claimed', '#7bbf7b')
        ) : state === 'done' ? (
          stamp('Done', '#7bbf7b')
        ) : g.binary ? (
          stamp('Unearned', 'rgba(240,237,232,0.5)', true)
        ) : (
          <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.7)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {g.record ? 'Best ' : ''}{g.current.toLocaleString()}<span style={{ opacity: 0.5 }}> / {g.target.toLocaleString()}</span>
          </span>
        )}
      </div>
    </div>
  )
}
