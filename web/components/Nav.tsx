'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import AnnouncementBanner from './AnnouncementBanner'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion } from 'framer-motion'

const PAGE_TINTS: [string, string][] = [
  ['/tavern',      'rgba(180,120,30,0.10)'],
  ['/fishing',     'rgba(14,116,144,0.10)'],
  ['/expeditions', 'rgba(30,60,120,0.12)'],
  ['/marketplace', 'rgba(120,80,180,0.08)'],
]

function navBg(tint: string | undefined) {
  return tint ? `linear-gradient(${tint}, ${tint}), black` : 'black'
}

export default function Nav({ packsAvailable, doubloons, gems }: { packsAvailable?: number; doubloons?: number; gems?: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const tint = PAGE_TINTS.find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1]
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [tavernBadge, setTavernBadge] = useState(() => {
    if (typeof window === 'undefined') return 0
    return parseInt(localStorage.getItem('tavernBadge') ?? '0', 10) || 0
  })
  const [achievementsBadge, setAchievementsBadge] = useState(false)
  const [displayDoubloons, setDisplayDoubloons] = useState(doubloons)
  const [displayGems, setDisplayGems] = useState(gems)
  const [displayPacks, setDisplayPacks] = useState(packsAvailable)

  const fetchBadge = useCallback(() => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      Promise.all([
        supabase.from('profiles').select('last_daily_claim, last_viewed_achievements_at').eq('id', user.id).single(),
        supabase.from('quiz_answers').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('daily_fish_attempts').select('solved, guesses, date').order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('user_achievements').select('unlocked_at').eq('user_id', user.id).order('unlocked_at', { ascending: false }).limit(1).maybeSingle(),
      ]).then(([{ data: profile }, { data: quiz }, { data: fotd }, { data: latestAchievement }]) => {
        const bonusDone = profile?.last_daily_claim === today
        const quizDone = quiz?.date === today
        const fotdDone = fotd?.date === today && (fotd.solved || (fotd.guesses?.length ?? 0) >= 4)
        const badge = [!bonusDone, !quizDone, !fotdDone].filter(Boolean).length
        setTavernBadge(badge)
        localStorage.setItem('tavernBadge', String(badge))
        const lastViewed = profile?.last_viewed_achievements_at
        const latestUnlocked = latestAchievement?.unlocked_at
        setAchievementsBadge(!!latestUnlocked && (!lastViewed || latestUnlocked > lastViewed))
      }).catch(() => {})
    })
  }, [])

  useEffect(() => { fetchBadge() }, [fetchBadge])

  useEffect(() => {
    window.addEventListener('tavern-daily-completed', fetchBadge)
    return () => window.removeEventListener('tavern-daily-completed', fetchBadge)
  }, [fetchBadge])

  useEffect(() => {
    function handleDoubloonsChanged(e: Event) {
      setDisplayDoubloons((e as CustomEvent<number>).detail)
    }
    window.addEventListener('doubloons-changed', handleDoubloonsChanged)
    return () => window.removeEventListener('doubloons-changed', handleDoubloonsChanged)
  }, [])

  useEffect(() => {
    function handleGemsChanged(e: Event) {
      setDisplayGems((e as CustomEvent<number>).detail)
    }
    window.addEventListener('gems-changed', handleGemsChanged)
    return () => window.removeEventListener('gems-changed', handleGemsChanged)
  }, [])

  useEffect(() => {
    function handlePacksChanged(e: Event) {
      setDisplayPacks((e as CustomEvent<number>).detail)
    }
    window.addEventListener('packs-changed', handlePacksChanged)
    return () => window.removeEventListener('packs-changed', handlePacksChanged)
  }, [])

  // Close on outside tap
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close on navigation
  useEffect(() => { setMenuOpen(false) }, [pathname])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const mobileLinks = [
    { href: '/tavern', label: 'Tavern', badge: tavernBadge > 0 ? tavernBadge : null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3h14l-1 9H6L5 3z"/>
          <path d="M18 6h2a1 1 0 011 1v3a1 1 0 01-1 1h-2"/>
          <path d="M6 21h12M8 17v4M16 17v4"/>
          <path d="M6 12c0 3 2 5 6 5s6-2 6-5"/>
        </svg>
      )
    },
    { href: '/fishing', label: 'Fishing', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4l4 4"/>
          <path d="M8 8c2-2 5-3 8-1s4 5 2 8-5 3-8 1"/>
          <path d="M8 8L4 20"/>
          <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
    { href: '/marketplace', label: 'Market', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v10"/>
          <path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/>
          <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
    { href: '/expeditions', label: 'Expeditions', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17c2 4 16 4 18 0"/><path d="M4 17L6 12l13 0 2 5"/>
          <line x1="10" y1="12" x2="10" y2="4"/>
          <path d="M10 4L17 9 10 12"/>
        </svg>
      )
    },
    { href: '/leaderboard', label: 'Ranks', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="14" width="5" height="7" rx="1"/>
          <rect x="9.5" y="9" width="5" height="12" rx="1"/>
          <rect x="17" y="4" width="5" height="17" rx="1"/>
        </svg>
      )
    },
  ]

  const mobileMenuLinks = [
    { href: '/profile', label: 'Profile', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      )
    },
    { href: '/social', label: 'Social', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>
        </svg>
      )
    },
    { href: '/guide', label: 'How to Play', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      )
    },
    { href: '/achievements', label: 'Achievements', badge: achievementsBadge,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4V4h16v5h-2"/>
          <path d="M6 4v5a6 6 0 0 0 12 0V4"/>
          <line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
        </svg>
      )
    },
    { href: '/leaderboard', label: 'Leaderboard', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="14" width="5" height="7" rx="1"/>
          <rect x="9.5" y="9" width="5" height="12" rx="1"/>
          <rect x="17" y="4" width="5" height="17" rx="1"/>
        </svg>
      )
    },
    { href: '/contact', label: 'Contact', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      )
    },
  ]

  const desktopOnlyLinks = [
    { href: '/achievements', label: 'Achievements', badge: achievementsBadge ? true : null },
    { href: '/social',       label: 'Social',        badge: null },
    { href: '/guide',        label: 'Guide',         badge: null },
    { href: '/contact',      label: 'Contact',       badge: null },
  ]

  const links = [
    { href: '/tavern', label: 'Tavern', badge: tavernBadge > 0 ? tavernBadge : null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3h14l-1 9H6L5 3z"/>
          <path d="M18 6h2a1 1 0 011 1v3a1 1 0 01-1 1h-2"/>
          <path d="M6 21h12M8 17v4M16 17v4"/>
          <path d="M6 12c0 3 2 5 6 5s6-2 6-5"/>
        </svg>
      )
    },
    { href: '/fishing', label: 'Fishing', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4l4 4"/>
          <path d="M8 8c2-2 5-3 8-1s4 5 2 8-5 3-8 1"/>
          <path d="M8 8L4 20"/>
          <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
    { href: '/marketplace', label: 'Market', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v10"/>
          <path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/>
          <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
    { href: '/expeditions', label: 'Expeditions', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17c2 4 16 4 18 0"/><path d="M4 17L6 12l13 0 2 5"/>
          <line x1="10" y1="12" x2="10" y2="4"/>
          <path d="M10 4L17 9 10 12"/>
        </svg>
      )
    },
    { href: '/leaderboard', label: 'Leaderboard', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="14" width="5" height="7" rx="1"/>
          <rect x="9.5" y="9" width="5" height="12" rx="1"/>
          <rect x="17" y="4" width="5" height="17" rx="1"/>
        </svg>
      )
    },
  ]

  return (
    <>
      {/* Desktop top bar */}
      <nav className="hidden sm:flex border-b border-[rgba(255,255,255,0.15)] px-6 py-4 items-center justify-between" style={{ background: navBg(tint) }}>
        <Link href="/" className="flex items-center gap-2 font-cinzel font-700 text-[#f0ede8] tracking-wide text-sm uppercase">
          Small Fishes
          <span style={{ fontSize: '0.48rem', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)', color: '#f0c040', borderRadius: 4, padding: '0.15rem 0.4rem', letterSpacing: '0.12em', lineHeight: 1.4, fontFamily: 'inherit' }}>
            ALPHA
          </span>
        </Link>

        <div className="hidden sm:flex flex-1 ml-8 gap-2 text-xs font-karla font-600 uppercase tracking-[0.12em]">
          {[...links, ...desktopOnlyLinks].map(({ href, label, badge }) => (
            <Link key={href} href={href} className={`py-2 px-2 transition-colors duration-200 ${pathname === href || pathname.startsWith(href + '/') ? 'text-[#f0ede8]' : 'text-[#a0a09a] hover:text-[#f0ede8]'}`}>
              {label}
              {typeof badge === 'number' && badge > 0 && <span className="ml-1.5 text-[#f0c040]">· {badge}</span>}
              {badge === true && <span className="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-[#f0c040] translate-y-[-1px]" />}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {displayPacks !== undefined && (
            <Link href="/packs" className="flex items-center gap-1 font-cinzel font-700" style={{ fontSize: '0.875rem', color: '#c8a870', textDecoration: 'none' }}>
              {displayPacks.toLocaleString()}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v2a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/><path d="M4 8h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
              </svg>
            </Link>
          )}
          {displayGems !== undefined && (
            <span className="font-cinzel font-700" style={{ fontSize: '0.875rem', color: '#a78bfa' }}>
              {displayGems.toLocaleString()} ◆
            </span>
          )}
          {displayDoubloons !== undefined && (
            <span className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.875rem' }}>
              {displayDoubloons.toLocaleString()} ⟡
            </span>
          )}
          <Link
            href="/profile"
            className="flex items-center justify-center rounded-full transition-all duration-200"
            style={{
              width: 34, height: 34,
              border: pathname === '/profile' ? '1px solid rgba(240,192,64,0.45)' : '1px solid rgba(255,255,255,0.15)',
              background: pathname === '/profile' ? 'rgba(240,192,64,0.08)' : 'transparent',
            }}
            onMouseOver={undefined}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              stroke={pathname === '/profile' ? '#f0c040' : '#a0a09a'}>
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </Link>
        </div>
      </nav>

      {/* Mobile top strip */}
      <div className="sm:hidden border-b border-[rgba(255,255,255,0.15)] px-4 py-2 flex justify-between items-center relative z-50" style={{ background: navBg(tint) }} ref={menuRef}>
        <Link href="/" className="flex items-center gap-1.5 font-cinzel font-700 text-[#f0ede8] tracking-wide text-xs uppercase">
          Small Fishes
          <span style={{ fontSize: '0.44rem', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)', color: '#f0c040', borderRadius: 4, padding: '0.15rem 0.35rem', letterSpacing: '0.12em', lineHeight: 1.4, fontFamily: 'inherit' }}>
            ALPHA
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {displayPacks !== undefined && (
            <Link href="/packs" className="flex items-center gap-0.5 font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#c8a870', textDecoration: 'none' }}>
              {displayPacks.toLocaleString()}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v2a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"/><path d="M4 8h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
              </svg>
            </Link>
          )}
          {displayGems !== undefined && (
            <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
              {displayGems.toLocaleString()} ◆
            </span>
          )}
          {displayDoubloons !== undefined && (
            <span className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.8rem' }}>
              {displayDoubloons.toLocaleString()} ⟡
            </span>
          )}
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="relative flex flex-col items-center justify-center gap-[4px] w-7 h-7 rounded-md transition-colors"
            style={{ background: menuOpen ? 'rgba(255,255,255,0.15)' : 'transparent', border: 'none' }}
            aria-label="Menu"
          >
            <span style={{ display: 'block', width: 14, height: 1.5, background: menuOpen ? '#f0ede8' : '#a0a09a', borderRadius: 1, transition: 'background 0.15s' }} />
            <span style={{ display: 'block', width: 14, height: 1.5, background: menuOpen ? '#f0ede8' : '#a0a09a', borderRadius: 1, transition: 'background 0.15s' }} />
            <span style={{ display: 'block', width: 14, height: 1.5, background: menuOpen ? '#f0ede8' : '#a0a09a', borderRadius: 1, transition: 'background 0.15s' }} />
            {achievementsBadge && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: '#f0c040' }} />
            )}
          </button>
        </div>

        {/* Dropdown */}
        {menuOpen && (
          <div
            className="absolute top-full left-0 right-0"
            style={{
              background: tint ? `linear-gradient(${tint}, ${tint}), #0a0a0a` : '#0a0a0a',
              borderBottom: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            {mobileMenuLinks.map(({ href, label, icon, badge }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-5 py-3.5"
                  style={{
                    color: active ? '#f0ede8' : '#a0a09a',
                    borderBottom: '1px solid rgba(255,255,255,0.09)',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ color: active ? '#f0c040' : '#4a4845' }}>{icon}</span>
                  <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem' }}>{label}</span>
                  {badge && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f0c040', flexShrink: 0 }} />}
                </Link>
              )
            })}
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-5 py-3.5"
              style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem' }}>Sign Out</span>
            </button>
          </div>
        )}
      </div>

      <AnnouncementBanner />

      {/* Mobile bottom tab bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[rgba(255,255,255,0.15)] flex" style={{ background: navBg(tint) }}>
        {mobileLinks.map(({ href, label, badge, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 relative select-none ${active ? 'text-[#f0ede8]' : 'text-[#a0a09a]'}`}
              style={{ transition: 'color 0.2s' }}
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
                <span className="absolute top-2 right-[calc(50%-18px)] bg-[#f0c040] text-black text-[0.5rem] font-karla font-700 rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </>
  )
}
