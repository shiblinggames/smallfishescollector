'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const PAGE_TINTS: [string, string][] = [
  ['/tavern',      'rgba(180,120,30,0.10)'],
  ['/fishing',     'rgba(14,116,144,0.10)'],
  ['/expeditions', 'rgba(30,60,120,0.12)'],
  ['/marketplace', 'rgba(120,80,180,0.08)'],
]

// Order matches the canonical nav ordering: tavern, fishing, expeditions,
// profile, leaderboards. Market + achievements + social moved into the
// mobile hamburger menu (in Nav.tsx).
const LINKS = [
  { href: '/tavern', label: 'Tavern',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14l-1 9H6L5 3z"/><path d="M18 6h2a1 1 0 011 1v3a1 1 0 01-1 1h-2"/><path d="M6 21h12M8 17v4M16 17v4"/><path d="M6 12c0 3 2 5 6 5s6-2 6-5"/></svg>,
  },
  { href: '/fishing', label: 'Fishing',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l4 4"/><path d="M8 8c2-2 5-3 8-1s4 5 2 8-5 3-8 1"/><path d="M8 8L4 20"/><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>,
  },
  { href: '/expeditions', label: 'Expeditions',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17c2 4 16 4 18 0"/><path d="M4 17L6 12l13 0 2 5"/><line x1="10" y1="12" x2="10" y2="4"/><path d="M10 4L17 9 10 12"/></svg>,
  },
  { href: '/profile', label: 'Profile',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  },
  { href: '/leaderboard', label: 'Ranks',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="14" width="5" height="7" rx="1"/><rect x="9.5" y="9" width="5" height="12" rx="1"/><rect x="17" y="4" width="5" height="17" rx="1"/></svg>,
  },
]

export default function MobileTabBar() {
  const pathname = usePathname()
  // Hooks must run unconditionally — the early-return below used to sit
  // ABOVE these, which meant the hook count changed between routes
  // (a Rules-of-Hooks violation). All hooks first, conditional return last.
  const [voyageBadge, setVoyageBadge] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const { createClient } = require('@/lib/supabase/client')
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: { id: string } | null } }) => {
      if (!user) return
      supabase
        .from('daily_voyages')
        .select('created_at, duration_ms')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .then(({ data }: { data: { created_at: string; duration_ms: number | null }[] | null }) => {
          const now = Date.now()
          const hasReady = (data ?? []).some(
            r => new Date(r.created_at).getTime() + (r.duration_ms ?? 7200000) <= now
          )
          setVoyageBadge(hasReady)
        })
    })
  }, [pathname])

  // Mobile-browser fix: `position: fixed; bottom: 0` is measured against
  // the LAYOUT viewport, but a mobile browser's collapsing toolbar makes
  // the VISUAL viewport shorter, so the bar slides under / past the
  // browser chrome while scrolling. PWA (standalone) has no such chrome,
  // which is why it's already correct there. We pin the bar to the
  // bottom of the visual viewport via a translateY, only in browser mode
  // so the working PWA path is untouched.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    if (isStandalone) return

    const el = barRef.current
    if (!el) return

    const update = () => {
      // How far the visible-area bottom sits above the layout-viewport
      // bottom that `bottom: 0` is glued to. Lift the bar by that much.
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      el.style.transform = `translateZ(0) translateY(${-overlap}px)`
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('scroll', update)
    }
  }, [pathname])

  if (pathname === '/' || pathname === '/login') return null
  const tint = PAGE_TINTS.find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1]
  const bg = tint ? `linear-gradient(${tint}, ${tint}), black` : 'black'

  return (
    <div
      ref={barRef}
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
        const badge = href === '/expeditions' && voyageBadge ? true : null
        return (
          <Link
            key={href}
            href={href}
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
          </Link>
        )
      })}
    </div>
  )
}
