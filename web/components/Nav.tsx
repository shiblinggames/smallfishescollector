'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import AnnouncementBanner from './AnnouncementBanner'
import CharacterAvatar from './CharacterAvatar'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Glyphs for the "add to home screen" step badges — drawn with
// currentColor so they inherit the badge's dark-on-teal styling.
const ICON_DOTS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
  </svg>
)
const ICON_SHARE = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V3" /><path d="M8 7l4-4 4 4" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)
const ICON_CARET = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
)
const ICON_ADD_HOME = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8.5v7M8.5 12h7" />
  </svg>
)

// Cache for the desktop nav avatar fields so the avatar renders correctly
// on the first paint after a tab switch (instead of flashing the default
// while supabase round-trips). Keys are namespaced under `nav:` so they
// don't collide with anything else stored client-side.
function readNavCache(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(`nav:${key}`)
    return v && v.length ? v : null
  } catch { return null }
}
function writeNavCache(key: string, value: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(`nav:${key}`, value)
    else       window.localStorage.removeItem(`nav:${key}`)
  } catch { /* private mode etc. — ignore */ }
}

export default function Nav({ packsAvailable, doubloons, gems }: { packsAvailable?: number; doubloons?: number; gems?: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const tint = PAGE_TINTS.find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1]
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [voyageBadge, setVoyageBadge] = useState(false)
  const [showInstallEntry, setShowInstallEntry] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isChromeIOS, setIsChromeIOS] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [displayDoubloons, setDisplayDoubloons] = useState(doubloons)
  const [displayGems, setDisplayGems] = useState(gems)
  const [displayPacks, setDisplayPacks] = useState(packsAvailable)
  // Profile-button avatar (desktop nav). Pulled on mount and cached in
  // localStorage so the avatar doesn't flash to "default" between tab
  // switches — Nav lives inside PageTransition which remounts on every
  // navigation (key={pathname}), and otherwise these would reset to null
  // until the supabase fetcher resolves.
  const [characterColor, setCharacterColor] = useState<string | null>(() => readNavCache('character_color'))
  const [equippedHat, setEquippedHat]       = useState<string | null>(() => readNavCache('equipped_hat'))
  const [avatarBg, setAvatarBg]             = useState<string | null>(() => readNavCache('avatar_bg'))
  const [avatarBorder, setAvatarBorder]     = useState<string | null>(() => readNavCache('avatar_border'))

  const fetchBadge = useCallback(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      Promise.all([
        supabase.from('profiles').select('character_color, equipped_hat, avatar_bg_color, avatar_border_color').eq('id', user.id).single(),
        supabase.from('daily_voyages').select('created_at, duration_ms').eq('user_id', user.id).eq('status', 'pending'),
      ]).then(([{ data: profile }, { data: voyages }]) => {
        const cc = (profile?.character_color as string | null) ?? null
        const hat = (profile?.equipped_hat as string | null) ?? null
        const bg = (profile?.avatar_bg_color as string | null) ?? null
        const border = (profile?.avatar_border_color as string | null) ?? null
        setCharacterColor(cc)
        setEquippedHat(hat)
        setAvatarBg(bg)
        setAvatarBorder(border)
        // Cache so next tab-switch hydrates immediately (no flash).
        writeNavCache('character_color', cc)
        writeNavCache('equipped_hat', hat)
        writeNavCache('avatar_bg', bg)
        writeNavCache('avatar_border', border)
        const now = Date.now()
        const hasReadyVoyage = (voyages ?? []).some(
          (r: { created_at: string; duration_ms: number | null }) =>
            new Date(r.created_at).getTime() + (r.duration_ms ?? 7200000) <= now
        )
        setVoyageBadge(hasReadyVoyage)
      }).catch(() => {})
    })
  }, [])

  useEffect(() => { fetchBadge() }, [fetchBadge])

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    if (standalone) return
    setShowInstallEntry(true)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    const chromeIOS = ios && /CriOS/.test(navigator.userAgent)
    setIsIOS(ios)
    setIsChromeIOS(chromeIOS)
    function handlePrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  useEffect(() => {
    function handleDoubloonsChanged(e: Event) {
      // Only accept a numeric detail. A caller that dispatches the event
      // with no detail (CustomEvent .detail === null) would otherwise set
      // displayDoubloons to null, and the render does
      // displayDoubloons.toLocaleString() — null.toLocaleString() throws
      // and, with no error.tsx, takes the whole page to Next's error
      // screen. Callers should pass the new total; if one doesn't, just
      // ignore it rather than crash.
      const d = (e as CustomEvent<unknown>).detail
      if (typeof d === 'number') setDisplayDoubloons(d)
    }
    window.addEventListener('doubloons-changed', handleDoubloonsChanged)
    return () => window.removeEventListener('doubloons-changed', handleDoubloonsChanged)
  }, [])

  useEffect(() => {
    function handleGemsChanged(e: Event) {
      // Same null-detail guard as doubloons — displayGems.toLocaleString()
      // has no undefined guard in the render at all, so a detail-less
      // dispatch here would crash even harder.
      const d = (e as CustomEvent<unknown>).detail
      if (typeof d === 'number') setDisplayGems(d)
    }
    window.addEventListener('gems-changed', handleGemsChanged)
    return () => window.removeEventListener('gems-changed', handleGemsChanged)
  }, [])

  useEffect(() => {
    function handlePacksChanged(e: Event) {
      const d = (e as CustomEvent<unknown>).detail
      if (typeof d === 'number') setDisplayPacks(d)
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
    { href: '/tavern', label: 'Tavern', badge: null,
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
    { href: '/expeditions', label: 'Expeditions', badge: voyageBadge || null,
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

  // Mobile hamburger menu — the secondary destinations that don't fit in
  // the 5-slot bottom tab bar. Order: market, achievements, social
  // (matches the canonical nav order: tavern/fishing/expeditions/profile/
  // leaderboards in the bottom bar, then the rest live here).
  const mobileMenuLinks = [
    { href: '/marketplace', label: 'Market', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v10"/>
          <path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/>
          <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
    { href: '/achievements', label: 'Achievements', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4V4h16v5h-2"/>
          <path d="M6 4v5a6 6 0 0 0 12 0V4"/>
          <line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
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
  ]

  const desktopOnlyLinks = [
    { href: '/achievements', label: 'Achievements', badge: null },
    { href: '/social',       label: 'Social',        badge: null },
  ]

  // Desktop top-bar inline links. Canonical order: tavern, fishing,
  // expeditions, leaderboard, market — then achievements + social from
  // desktopOnlyLinks. Profile is the avatar button on the far right,
  // so it doesn't appear here.
  const links = [
    { href: '/tavern', label: 'Tavern', badge: null,
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
    { href: '/expeditions', label: 'Expeditions', badge: voyageBadge || null,
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
    { href: '/marketplace', label: 'Market', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v10"/>
          <path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/>
          <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
  ]

  return (
    <>
      {/* Desktop top bar */}
      <div className="hidden sm:block" style={{ height: 64 }} />
      <nav className="hidden sm:flex border-b border-[rgba(255,255,255,0.15)] px-6 py-4 items-center justify-between" style={{ background: navBg(tint), position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
        <Link href="/" className="flex items-center gap-2 font-cinzel font-700 text-[#f0ede8] tracking-wide text-sm uppercase">
          Small Fishes
          <span style={{ fontSize: '0.48rem', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)', color: '#f0c040', borderRadius: 4, padding: '0.15rem 0.4rem', letterSpacing: '0.12em', lineHeight: 1.4, fontFamily: 'inherit' }}>
            BETA
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
              width: 36, height: 36,
              padding: 0,
              borderRadius: '50%',
              border: pathname === '/profile' ? '1.5px solid rgba(240,192,64,0.65)' : '1.5px solid rgba(255,255,255,0.18)',
              boxShadow: pathname === '/profile' ? '0 0 12px rgba(240,192,64,0.3)' : 'none',
              overflow: 'hidden',
            }}
          >
            <CharacterAvatar
              characterColor={characterColor}
              equippedHat={equippedHat}
              size={32}
              bgColor={avatarBg ?? undefined}
              ringColor={avatarBorder ?? undefined}
              borderStyle="none"
            />
          </Link>
        </div>
      </nav>

      {/* Mobile top strip */}
      <div className="sm:hidden" style={{ height: 44 }} />
      <div className="sm:hidden border-b border-[rgba(255,255,255,0.15)] px-4 py-2 flex justify-between items-center" style={{ background: navBg(tint), position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }} ref={menuRef}>
        <Link href="/" className="flex items-center gap-1.5 font-cinzel font-700 text-[#f0ede8] tracking-wide text-xs uppercase">
          Small Fishes
          <span style={{ fontSize: '0.44rem', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)', color: '#f0c040', borderRadius: 4, padding: '0.15rem 0.35rem', letterSpacing: '0.12em', lineHeight: 1.4, fontFamily: 'inherit' }}>
            BETA
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
            {showInstallEntry && (
              <button
                onClick={() => {
                  setMenuOpen(false)
                  if (deferredPrompt) {
                    deferredPrompt.prompt()
                    deferredPrompt.userChoice.then(() => setDeferredPrompt(null))
                  } else if (isIOS) {
                    setShowIOSHint(true)
                  }
                }}
                className="w-full flex items-center gap-3.5"
                style={{
                  padding: '1.05rem 1.25rem',
                  background: 'linear-gradient(90deg, rgba(14,116,144,0.26), rgba(14,116,144,0.10))',
                  border: 'none',
                  borderBottom: '1px solid rgba(14,116,144,0.32)',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                  background: 'rgba(14,116,144,0.30)',
                  border: '1px solid rgba(90,180,200,0.50)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#8fd6e6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v13M8 11l4 4 4-4"/>
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
                  </svg>
                </div>
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.98rem', color: '#d6eef3', letterSpacing: '0.01em' }}>Install the App</p>
                    <span className="font-karla font-700 uppercase" style={{
                      fontSize: '0.5rem', letterSpacing: '0.1em', color: '#04161a',
                      background: '#5ab4c8', borderRadius: 999, padding: '0.12rem 0.42rem',
                    }}>Free</span>
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.76rem', color: '#9fc8d2', marginTop: 4, lineHeight: 1.4 }}>
                    Full-screen &amp; faster — plays like a real game, no browser bar in the way.
                  </p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5ab4c8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            )}
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

      {/* iOS install hint */}
      {showIOSHint && (
        <div
          style={{
            position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 70,
            maxWidth: 440, margin: '0 auto',
            background: '#0e1414',
            border: '1px solid rgba(14,116,144,0.45)',
            borderRadius: 18, padding: '1.2rem 1.25rem 1.3rem',
            boxShadow: '0 4px 44px rgba(0,0,0,0.85)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1.2 }}>Get the App</p>
              <p className="font-karla" style={{ fontSize: '0.82rem', color: '#92c0ca', marginTop: 5, lineHeight: 1.45 }}>
                Full-screen &amp; faster — it really feels like a real game. Takes about 5 seconds:
              </p>
            </div>
            <button
              onClick={() => setShowIOSHint(false)}
              aria-label="Close"
              style={{
                flexShrink: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: '50%', width: 32, height: 32, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#e0ddd8', cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '1rem' }}>
            {((isChromeIOS ? [
              { label: 'Share', desc: 'Tap the Share icon — top right', icon: ICON_SHARE },
              { label: 'View More', desc: 'Tap View More', icon: ICON_CARET },
              { label: 'Add to Home Screen', desc: 'Tap Add to Home Screen', icon: ICON_ADD_HOME },
            ] : [
              { label: '···', desc: 'Tap the three dots — bottom right corner', icon: ICON_DOTS },
              { label: 'Share', desc: 'Tap Share', icon: ICON_SHARE },
              { label: 'View More', desc: 'Tap View More', icon: ICON_CARET },
              { label: 'Add to Home Screen', desc: 'Tap Add to Home Screen', icon: ICON_ADD_HOME },
            ]) as { label: string; desc: string; icon?: ReactNode }[]).map(({ label, desc, icon }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="font-karla font-700" style={{
                  fontSize: '0.82rem', color: '#04161a',
                  background: '#6bc2d4', borderRadius: 8,
                  flexShrink: 0, width: 28, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{icon ?? i + 1}</span>
                <p className="font-karla" style={{ fontSize: '0.84rem', lineHeight: 1.35 }}>
                  <span className="font-700" style={{ color: '#f0ede8' }}>{label}</span>
                  <span style={{ color: '#8fb4be' }}> — {desc}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </>
  )
}
