'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { hapticTap } from '@/lib/haptics'
import { BADGE_MAP } from '@/lib/badges'

const PAGE_TINTS: [string, string][] = [
  ['/tavern',      'rgba(180,120,30,0.10)'],
  ['/sea',         'rgba(14,116,144,0.10)'],
  ['/expeditions', 'rgba(30,60,120,0.12)'],
]

// Order: tavern, fishing, expeditions, badges, profile. "Badges" (the
// goals / trophy shelf at /badges) sits before Profile. The Captain's Log
// (story recap, /achievements) is reachable from the Badges page header +
// the desktop nav. Leaderboard moved off the bar; market + social live in
// the mobile hamburger menu (in Nav.tsx).
const LINKS = [
  { href: '/tavern', label: 'Tavern',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14l-1 9H6L5 3z"/><path d="M18 6h2a1 1 0 011 1v3a1 1 0 01-1 1h-2"/><path d="M6 21h12M8 17v4M16 17v4"/><path d="M6 12c0 3 2 5 6 5s6-2 6-5"/></svg>,
  },
  { href: '/sea', label: 'Fishing',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l4 4"/><path d="M8 8c2-2 5-3 8-1s4 5 2 8-5 3-8 1"/><path d="M8 8L4 20"/><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>,
  },
  { href: '/expeditions', label: 'Expeditions',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17c2 4 16 4 18 0"/><path d="M4 17L6 12l13 0 2 5"/><line x1="10" y1="12" x2="10" y2="4"/><path d="M10 4L17 9 10 12"/></svg>,
  },
  { href: '/badges', label: 'Badges',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><path d="M9 14.5L7.5 22l4.5-2.5L16.5 22 15 14.5"/></svg>,
  },
  { href: '/profile', label: 'Profile',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  },
]


export default function MobileTabBar() {
  const pathname = usePathname()
  // Hooks must run unconditionally — the early-return below used to sit
  // ABOVE these, which meant the hook count changed between routes
  // (a Rules-of-Hooks violation). All hooks first, conditional return last.
  // Pending-voyage rows, cached. This used to refetch from Supabase on
  // EVERY pathname change — a network roundtrip per tab tap just to
  // re-run time math. Voyages only change on the /expeditions surfaces,
  // so: network on first mount and around /expeditions visits, pure
  // local recompute (created_at + duration_ms vs now) everywhere else.
  // A voyage that ripens mid-session still lights up on the next tab
  // tap because readiness is derived at render time from cached rows.
  const [pendingVoyages, setPendingVoyages] = useState<{ created_at: string; duration_ms: number | null }[]>([])
  const fetchedOnceRef   = useRef(false)
  const wasExpeditionsRef = useRef(false)
  // Active trawls (crew passive fishing) — same cached-rows + derive-readiness
  // pattern as voyages: network on first mount + around /fishing, pure local
  // time math everywhere else. Lets the Fishing tab pulse when a haul is ready.
  const [trawls, setTrawls] = useState<{ ends_at: string }[]>([])
  const trawlsFetchedRef = useRef(false)
  const wasFishingRef    = useRef(false)
  // Unclaimed badge rewards → pulse the Badges tab. Same cached-fetch pattern:
  // network on first mount + around /badges visits (where you earn/claim),
  // local derive everywhere else.
  const [badgeIds, setBadgeIds] = useState<{ unlocked: string[]; claimed: string[] }>({ unlocked: [], claimed: [] })
  const badgesFetchedRef = useRef(false)
  const wasBadgesRef     = useRef(false)

  useEffect(() => {
    const inExpeditions = pathname.startsWith('/expeditions')
    const needFetch = !fetchedOnceRef.current || wasExpeditionsRef.current || inExpeditions
    wasExpeditionsRef.current = inExpeditions
    if (!needFetch) return
    fetchedOnceRef.current = true
    const { createClient } = require('@/lib/supabase/client')
    const supabase = createClient()
    // getSession() = local cache read, no auth-server roundtrip (the id
    // only scopes an RLS-guarded SELECT) — getUser() was adding ~100ms
    // before the voyage badge could even start its query.
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: { id: string } } | null } }) => {
      const user = session?.user
      if (!user) return
      supabase
        .from('daily_voyages')
        .select('created_at, duration_ms')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .then(({ data }: { data: { created_at: string; duration_ms: number | null }[] | null }) => {
          setPendingVoyages(data ?? [])
        })
    })
  }, [pathname])

  const fetchTrawls = useCallback(() => {
    const { createClient } = require('@/lib/supabase/client')
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: { id: string } } | null } }) => {
      const user = session?.user
      if (!user) return
      supabase
        .from('trawls')
        .select('ends_at')
        .eq('user_id', user.id)
        .then(({ data }: { data: { ends_at: string }[] | null }) => setTrawls(data ?? []))
    })
  }, [])

  useEffect(() => {
    const inFishing = pathname.startsWith('/sea')
    const needFetch = !trawlsFetchedRef.current || wasFishingRef.current || inFishing
    wasFishingRef.current = inFishing
    if (!needFetch) return
    trawlsFetchedRef.current = true
    fetchTrawls()
  }, [pathname, fetchTrawls])

  // Collecting or deploying a trawl fires `trawls-changed` → refetch, so the dot
  // clears the moment the last ready haul is taken in. This effect used to key
  // on pathname alone, which meant nothing refetched while you STAYED on the
  // fishing screen: the very place trawls are collected from was the one place
  // the dot could not go out, and it only cleared once you navigated away and
  // back. Mirrors what `badges-changed` already does for the Badges pill.
  useEffect(() => {
    const h = () => fetchTrawls()
    window.addEventListener('trawls-changed', h)
    return () => window.removeEventListener('trawls-changed', h)
  }, [fetchTrawls])

  const fetchBadgeState = useCallback(() => {
    const { createClient } = require('@/lib/supabase/client')
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: { id: string } } | null } }) => {
      const user = session?.user
      if (!user) return
      supabase
        .from('profiles')
        .select('unlocked_badges, claimed_badge_rewards')
        .eq('id', user.id)
        .single()
        .then(({ data }: { data: { unlocked_badges: string[] | null; claimed_badge_rewards: string[] | null } | null }) =>
          setBadgeIds({ unlocked: data?.unlocked_badges ?? [], claimed: data?.claimed_badge_rewards ?? [] }))
    })
  }, [])

  useEffect(() => {
    const inBadges = pathname.startsWith('/badges')
    const needFetch = !badgesFetchedRef.current || wasBadgesRef.current || inBadges
    wasBadgesRef.current = inBadges
    if (!needFetch) return
    badgesFetchedRef.current = true
    fetchBadgeState()
  }, [pathname, fetchBadgeState])

  // A badge unlocked (BadgeWatcher) or a reward was claimed (AchievementsClient)
  // fires `badges-changed` → refresh the pill so it pulses the moment the badge
  // is earned (not only after a /badges visit), and stops once claimed.
  useEffect(() => {
    const h = () => fetchBadgeState()
    window.addEventListener('badges-changed', h)
    return () => window.removeEventListener('badges-changed', h)
  }, [fetchBadgeState])

  // Readiness is derived from cached rows at render. Re-render on a slow tick
  // while anything is pending so a trawl/voyage that ripens lights the badge
  // WITHOUT needing a navigation (otherwise it'd only update on the next tap).
  const [, setTick] = useState(0)
  useEffect(() => {
    if (trawls.length === 0 && pendingVoyages.length === 0) return
    const id = setInterval(() => setTick(t => t + 1), 20000)
    return () => clearInterval(id)
  }, [trawls.length, pendingVoyages.length])

  const voyageNow = Date.now()
  const voyageBadge = pendingVoyages.some(
    r => new Date(r.created_at).getTime() + (r.duration_ms ?? 7200000) <= voyageNow
  )
  // Any trawl whose cycle has finished → pulse the Fishing tab.
  const trawlReady = trawls.some(t => new Date(t.ends_at).getTime() <= voyageNow)
  // Earned-but-unclaimed badge rewards → a count on the Badges tab. Filter to
  // KNOWN badge ids so a stale/removed id can't inflate the number.
  const claimedSet = new Set(badgeIds.claimed)
  const unclaimedBadges = badgeIds.unlocked.filter(b => BADGE_MAP[b] && !claimedSet.has(b)).length

  if (pathname === '/' || pathname === '/login') return null
  const tint = PAGE_TINTS.find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1]
  const bg = tint ? `linear-gradient(${tint}, ${tint}), black` : 'black'

  return (
    <div
      className="sm:hidden flex"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderTop: '1px solid rgba(255,255,255,0.15)',
        background: bg,
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
      }}
    >
      {LINKS.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        const badge = href === '/badges' && unclaimedBadges > 0 ? unclaimedBadges
                    : href === '/expeditions' && voyageBadge ? true
                    : null
        const pulse = href === '/sea' && trawlReady
        return (
          <Link
            key={href}
            href={href}
            // Tap tick on the pointer landing — nav should feel tactile, and the
            // tick masks the route-transition beat.
            onPointerDown={() => hapticTap()}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 relative select-none"
            style={{ color: active ? '#f0ede8' : '#a0a09a', transition: 'color 0.2s' }}
          >
            <motion.div
              animate={active ? { scale: 1.18, y: -2 } : { scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
              whileTap={{ scale: 0.82, opacity: 0.7 }}
            >
              {icon}
            </motion.div>
            <span className="text-[0.58rem] font-karla font-600 uppercase tracking-[0.10em]">{label}</span>
            {badge && (
              typeof badge === 'number'
                ? <span className="absolute top-2 right-[calc(50%-18px)] bg-[#f0c040] text-black text-[0.5rem] font-karla font-700 rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                : <span className="absolute top-2 right-[calc(50%-10px)] bg-[#f0c040] rounded-full w-2 h-2" />
            )}
            {pulse && (
              <span className="absolute top-2 right-[calc(50%-10px)] w-2 h-2">
                <motion.span
                  animate={{ scale: [1, 2.4, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                  className="absolute inset-0 bg-[#f0c040] rounded-full"
                />
                <span className="absolute inset-0 bg-[#f0c040] rounded-full" />
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
