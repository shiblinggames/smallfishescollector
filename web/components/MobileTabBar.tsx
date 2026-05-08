'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const PAGE_TINTS: [string, string][] = [
  ['/tavern',      'rgba(180,120,30,0.10)'],
  ['/fishing',     'rgba(14,116,144,0.10)'],
  ['/expeditions', 'rgba(30,60,120,0.12)'],
  ['/marketplace', 'rgba(120,80,180,0.08)'],
]

const LINKS = [
  { href: '/tavern', label: 'Tavern',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14l-1 9H6L5 3z"/><path d="M18 6h2a1 1 0 011 1v3a1 1 0 01-1 1h-2"/><path d="M6 21h12M8 17v4M16 17v4"/><path d="M6 12c0 3 2 5 6 5s6-2 6-5"/></svg>,
  },
  { href: '/fishing', label: 'Fishing',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l4 4"/><path d="M8 8c2-2 5-3 8-1s4 5 2 8-5 3-8 1"/><path d="M8 8L4 20"/><circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>,
  },
  { href: '/marketplace', label: 'Market',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10"/><path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/><circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/></svg>,
  },
  { href: '/expeditions', label: 'Expeditions',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17c2 4 16 4 18 0"/><path d="M4 17L6 12l13 0 2 5"/><line x1="10" y1="12" x2="10" y2="4"/><path d="M10 4L17 9 10 12"/></svg>,
  },
  { href: '/profile', label: 'Profile',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  },
]

export default function MobileTabBar() {
  const pathname = usePathname()
  if (pathname === '/' || pathname === '/login') return null
  const tint = PAGE_TINTS.find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1]
  const bg = tint ? `linear-gradient(${tint}, ${tint}), black` : 'black'

  const [tavernBadge, setTavernBadge] = useState(0)
  const [voyageBadge, setVoyageBadge] = useState(false)

  useEffect(() => {
    setTavernBadge(parseInt(localStorage.getItem('tavernBadge') ?? '0', 10) || 0)
    function onCompleted() {
      setTavernBadge(parseInt(localStorage.getItem('tavernBadge') ?? '0', 10) || 0)
    }
    window.addEventListener('tavern-daily-completed', onCompleted)
    return () => window.removeEventListener('tavern-daily-completed', onCompleted)
  }, [])

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
      }}
    >
      {LINKS.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        const badge = href === '/tavern' && tavernBadge > 0 ? tavernBadge
          : href === '/expeditions' && voyageBadge ? true : null
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
