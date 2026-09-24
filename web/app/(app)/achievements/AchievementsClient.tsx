'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ctaPill } from '@/lib/uiTokens'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { DIFFICULTY_META, BADGE_POINTS, type BadgeDifficulty } from '@/lib/badges'
import { vibrate } from '@/lib/haptics'
import { flyGemsToPurse } from '@/lib/coinFly'
import { claimBadgeReward, claimAllBadgeRewards } from './badgeActions'
import BadgeTimeline from './BadgeTimeline'

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
  /** WHEN this was earned. An ISO string dates it; NULL means it predates the
   *  stamping and is shown as such rather than guessed at; undefined means the
   *  badge is not earned yet. */
  earnedAt?: string | null
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
  // ── ONE FILTER, NOT TWO ROWS OF CHIPS (Kong: too many filters and
  // selectors at the top). The tier row went: the tier is on every medallion.
  // The claim-status row went: "Ready to Claim" above already lists every
  // unclaimed reward. What is left is the question people actually ask of a
  // wall of badges: all of them, the ones I have, or the ones I do not.
  const [show, setShow] = useState<'all' | 'earned' | 'todo'>('all')
  const [detailGoal, setDetailGoal] = useState<JourneyGoal | null>(null)
  // The board reads two ways: a CHECKLIST of what is left, or the VOYAGE --
  // the same badges in the order you earned them.
  const [view, setView] = useState<'board' | 'timeline'>('board')
  // ── A TROPHY WALL, NOT AN INDEX ────────────────────────────────────────
  //
  // The sections used to mount COLLAPSED, so the page opened as fourteen
  // headers and four rows of filter chrome before a single badge showed, and
  // the medallion art only ever appeared at 50px inside a text row. The art
  // is the point of a badge. Tiles are a fraction of a row's height, so every
  // section can stand open and ~170 medallions read as a wall you scan with
  // your eyes rather than a list you dig through.
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

  const visibleGroups = useMemo(
    () => groups
      .filter(grp => categoryFilter === 'all' || grp.title === categoryFilter)
      .map(grp => ({ ...grp, goals: grp.goals.filter(g => show === 'all' || (show === 'earned' ? g.done : !g.done)) }))
      .filter(grp => grp.goals.length > 0),
    [groups, categoryFilter, show],
  )

  // Per-category tallies for the rail, off the UNFILTERED groups so a chip
  // always says what the category holds, not what the other filters left.
  const groupTally = useMemo(() => new Map(groups.map(g => [g.title, { done: g.goals.filter(x => x.done).length, total: g.goals.length }])), [groups])

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
      // Master and Grandmaster pay gems as well, and the whole point of paying
      // them is that a hard badge should feel like it paid something you cannot
      // grind. Swallowing them here would make the coin nerf look like a
      // straight nerf.
      if (r.gems > 0) {
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.newGems }))
        setTimeout(() => flyGemsToPurse(from, r.gems), r.amount > 0 ? 180 : 0)
      }
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
      if (r.totalGems > 0) {
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.newGems }))
        setTimeout(() => flyGemsToPurse(from, r.totalGems), r.totalGranted > 0 ? 180 : 0)
      }
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
              style={{ width: 72, height: 72, flexShrink: 0, objectFit: 'contain', filter: `drop-shadow(0 2px 8px rgba(0,0,0,0.6)) drop-shadow(0 0 10px ${GOLD}44)` }} />
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

      {/* ── ONE ROW OF CONTROLS ───────────────────────────────────────────
          Show (All / Earned / To earn) on the left, the Board and the Voyage
          on the right, small. That is the whole of the chrome above the wall;
          the categories are a sidebar beside it on a desktop and one
          swipeable row on a phone. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {view === 'board' && (
          <div role="tablist" aria-label="Show" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,169,106,0.22)' }}>
            {([['all', 'All'], ['earned', 'Earned'], ['todo', 'To earn']] as const).map(([val, label]) => {
              const active = show === val
              return (
                <button key={val} type="button" role="tab" aria-selected={active} onClick={() => setShow(val)}
                  className="font-karla font-800 uppercase tap"
                  style={{
                    padding: '0.36rem 0.75rem', borderRadius: 7, fontSize: '0.62rem', letterSpacing: '0.1em', cursor: 'pointer',
                    background: active ? `${GOLD}24` : 'transparent', color: active ? GOLD : 'rgba(232,226,214,0.7)',
                    border: `1px solid ${active ? `${GOLD}88` : 'transparent'}`,
                  }}>{label}</button>
              )
            })}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,169,106,0.22)' }}>
          {([['board', 'The Board'], ['timeline', 'The Voyage']] as const).map(([val, label]) => {
            const active = view === val
            return (
              <button key={val} type="button" onClick={() => setView(val)}
                className="font-cinzel font-700 tap"
                style={{
                  padding: '0.34rem 0.75rem', borderRadius: 7, fontSize: '0.72rem', cursor: 'pointer',
                  background: active ? `${GOLD}24` : 'transparent', color: active ? GOLD : '#d8d2c6',
                  border: `1px solid ${active ? `${GOLD}88` : 'transparent'}`,
                }}>{label}</button>
            )
          })}
        </div>
      </div>

      {view === 'timeline' ? (
        <BadgeTimeline goals={badgeGoals} onOpen={setDetailGoal} />
      ) : (
      <div className="badges-layout">
      {/* ── THE CATEGORIES. A sidebar on a desktop (sticky, each with its tally
            and a thin bar), one swipeable row of the same buttons on a phone. */}
      <nav className="badges-cats" aria-label="Categories">
        {[{ title: 'all', label: 'All badges', accent: GOLD }, ...groups.map(g => ({ title: g.title, label: g.title, accent: g.accent }))].map(c => {
          const active = categoryFilter === c.title
          const t = c.title === 'all' ? { done: earnedBadges, total: badgeGoals.length } : groupTally.get(c.title)
          const pct = t && t.total > 0 ? t.done / t.total : 0
          return (
            <button key={c.title} type="button" onClick={() => setCategoryFilter(c.title)}
              className="font-cinzel font-700 tap badges-cat"
              style={{
                display: 'flex', flexDirection: 'column', gap: 5, cursor: 'pointer', textAlign: 'left',
                padding: '0.48rem 0.7rem', borderRadius: 10, fontSize: '0.76rem',
                background: active ? `${c.accent}1f` : 'rgba(255,255,255,0.03)',
                color: active ? '#f4ecd8' : '#d8d2c6',
                border: `1px solid ${active ? `${c.accent}99` : 'rgba(196,169,106,0.18)'}`,
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: c.accent, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                {t && <span className="font-karla font-700" style={{ fontSize: '0.64rem', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{t.done}/{t.total}</span>}
              </span>
              <span aria-hidden className="badges-cat-bar" style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct * 100}%`, background: c.accent, opacity: 0.8 }} />
              </span>
            </button>
          )
        })}
      </nav>

      <div style={{ minWidth: 0 }}>
      {/* ── The wall: every category open, medallions in a grid ──────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {visibleGroups.map(group => {
          const doneN = group.goals.filter(g => g.done).length
          return (
            <section key={group.title}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: group.accent, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{group.title}</p>
                  <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${group.accent}66, transparent)` }} />
                  <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.5)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{doneN} / {group.goals.length}</span>
                </div>
                {group.flavor && (
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.5)', fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>{group.flavor}</p>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8 }}>
                {group.goals.map(g => (
                  <BadgeTile key={g.id} g={g} groupAccent={group.accent} claimed={claimedIds.has(g.id)} busy={busy === g.id}
                    onClaim={from => claimOne(g.id, from)} onOpen={() => setDetailGoal(g)} />
                ))}
              </div>
            </section>
          )
        })}
        {visibleGroups.length === 0 && (
          <p className="font-karla" style={{ fontSize: '0.9rem', color: 'rgba(240,237,232,0.5)', textAlign: 'center', padding: '2rem 0', fontStyle: 'italic' }}>
            {show === 'earned' ? 'None flown here yet.' : show === 'todo' ? 'Every one of these is flown.' : 'Nothing here yet.'}
          </p>
        )}
      </div>
      </div>
      </div>
      )}

      {/* Achievement detail modal — what it means + how to earn it. Shared by
          both views, so tapping a badge on the rope opens the same sheet. */}
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
                  style={{ position: 'relative', width: '100%', maxWidth: 'var(--modal-w)', textAlign: 'center', background: 'linear-gradient(180deg, #241a10 0%, #140d07 100%)', border: `1px solid ${g.done ? accent + '88' : 'rgba(196,169,106,0.3)'}`, borderRadius: 20, padding: '1.5rem 1.25rem', boxShadow: '0 18px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(240,192,64,0.08)' }}>
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
                  {/* WHEN. A null stamp is a badge older than the stamping, and
                      says so rather than inventing a day for it. */}
                  {g.done && 'earnedAt' in g && (
                    <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: g.earnedAt ? 'rgba(196,169,106,0.85)' : 'rgba(150,140,120,0.7)', marginTop: 12 }}>
                      {g.earnedAt
                        ? `Earned ${new Date(g.earnedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : 'Earned before the log was kept'}
                    </p>
                  )}

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

// ── One medallion on the wall ───────────────────────────────────────────────
//
// The art carries the tile. Earned is full colour with a shadow; ready to
// claim glows gold and carries the one live button; unearned is greyed and
// dim, with a thin gauge underneath when there is progress to show. Tier,
// points and reward live in the detail sheet, one tap away, so the wall stays
// medallions and names.
function BadgeTile({ g, groupAccent, claimed, busy, onClaim, onOpen }: {
  g: JourneyGoal; groupAccent: string; claimed: boolean; busy: boolean; onClaim: (from: { x: number; y: number }) => void; onOpen: () => void
}) {
  const diff = g.difficulty ? DIFFICULTY_META[g.difficulty] : null
  const accent = diff?.color ?? groupAccent
  const pct = g.target > 0 ? Math.min(1, g.current / g.target) : (g.done ? 1 : 0)
  const isBadge = (g.reward ?? 0) > 0
  const state: 'ready' | 'claimed' | 'progress' | 'done' =
    isBadge ? (g.done ? (claimed ? 'claimed' : 'ready') : 'progress') : (g.done ? 'done' : 'progress')
  const earned = g.done

  const ring = state === 'ready' ? `${GOLD}aa` : earned ? `${accent}55` : 'rgba(196,169,106,0.14)'
  const ground = state === 'ready'
    ? `radial-gradient(ellipse 80% 70% at 50% 30%, ${GOLD}1e 0%, transparent 70%), rgba(240,192,64,0.05)`
    : earned
      ? `radial-gradient(ellipse 80% 70% at 50% 30%, ${accent}14 0%, transparent 70%), rgba(210,180,120,0.04)`
      : 'rgba(210,180,120,0.025)'

  return (
    <button type="button" onClick={onOpen} title={g.desc}
      className="tap"
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '0.7rem 0.4rem 0.55rem', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
        background: ground, border: `1px solid ${ring}`,
        boxShadow: state === 'ready' ? `0 0 18px ${GOLD}33, inset 0 1px 0 rgba(240,220,180,0.06)` : 'inset 0 1px 0 rgba(240,220,180,0.05)',
        animation: state === 'ready' ? 'badgeReadyPulse 2.1s ease-in-out infinite' : undefined,
        minWidth: 0,
      }}>
      <div style={{ width: 84, height: 84, display: 'grid', placeItems: 'center' }}>
        {g.badgeImage ? (
          <img src={g.badgeImage} alt="" loading="lazy" decoding="async"
            style={{
              width: 80, height: 80, objectFit: 'contain',
              filter: state === 'ready' ? `drop-shadow(0 0 9px ${GOLD}bb)` : earned ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' : 'grayscale(1) brightness(0.8)',
              opacity: earned ? 1 : 0.32,
            }}
            onError={e => {
              // No-emoji rule: a plain brass ring stands in for missing art.
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              const p = el.parentElement
              if (p) p.innerHTML = `<span style="display:block;width:64px;height:64px;border-radius:50%;border:3px solid rgba(196,169,106,${earned ? 0.8 : 0.3});box-shadow:inset 0 0 14px rgba(196,169,106,0.2)"></span>`
            }} />
        ) : (
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: earned ? groupAccent : 'transparent', border: `2px solid ${groupAccent}`, opacity: earned ? 1 : 0.5 }} />
        )}
      </div>

      <p className="font-cinzel font-700" style={{
        fontSize: '0.66rem', lineHeight: 1.2, color: earned ? '#f4ecd8' : 'rgba(240,237,232,0.6)', width: '100%',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '1.6em',
      }}>{g.label}</p>

      {/* The foot of the tile: a claim button, a claimed mark, or the gauge. */}
      <div style={{ width: '100%', minHeight: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {state === 'ready' ? (
          <motion.span role="button" whileTap={{ scale: 0.92 }}
            onClick={e => { e.stopPropagation(); if (!busy) onClaim(rectCenter(e.currentTarget)) }}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ padding: '0.28rem 0.7rem', borderRadius: 8, ...ctaPill(), fontSize: '0.62rem', opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap', cursor: busy ? 'default' : 'pointer' }}>
            {busy ? '…' : 'Claim'}
          </motion.span>
        ) : state === 'claimed' || state === 'done' ? (
          <span className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.12em', color: '#7bbf7b', opacity: 0.85 }}>
            {state === 'claimed' ? 'Claimed' : 'Done'}
          </span>
        ) : g.binary ? (
          <span aria-hidden style={{ width: '70%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
        ) : (
          <div title={`${g.current.toLocaleString()} / ${g.target.toLocaleString()}`}
            style={{ position: 'relative', width: '86%', height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.4)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: `linear-gradient(90deg, ${accent}88, ${accent})`, borderRadius: 2 }} />
          </div>
        )}
      </div>
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
