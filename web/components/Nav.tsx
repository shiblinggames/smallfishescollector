'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import AnnouncementBanner from './AnnouncementBanner'
import CharacterAvatar from './CharacterAvatar'
import MailInbox from './MailInbox'
import { getMailUnreadCount } from '@/app/actions/mail'
import { BADGE_MAP } from '@/lib/badges'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import TickingNumber from './TickingNumber'

const PAGE_TINTS: [string, string][] = [
  ['/tavern',      'rgba(180,120,30,0.10)'],
  ['/sea',         'rgba(14,116,144,0.10)'],
  ['/expeditions', 'rgba(30,60,120,0.12)'],
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
// Min gap between Nav badge refreshes. fetchBadge fires on every route change
// AND every tab-foreground; without this a burst of navigations = 3 DB reads
// each, per user. The data (avatar/currency/mail/voyage/badge pips) isn't
// time-critical and currency also self-heals via the *-changed events, so
// coalescing to at most one refresh per this window is invisible. Real badge
// changes pass { force: true } to bypass it.
const NAV_REFRESH_MIN_MS = 10_000

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

// packsAvailable is accepted (callers still pass it) but no longer shown —
// packs were replaced by the Crew Hall.

export default function Nav({ doubloons, gems, canSail = false }: {
  packsAvailable?: number; doubloons?: number; gems?: number
  /** Whether this captain can reach the ocean hub. Decided on the server by
   *  lib/seaAccess and passed down, so the tab and the route it points at can
   *  never disagree about who is allowed through. */
  canSail?: boolean
}) {
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
  // Resync displayDoubloons/displayGems when fresh server props arrive
  // (router.refresh, navigation, etc.). The useState initializers above
  // only fire once at mount; without these effects, a server-side
  // currency change (admin grant, server-action revalidate from another
  // surface, etc.) would never reach the Nav until the player happened
  // to perform an in-app action that dispatched a `*-changed` event.
  useEffect(() => { setDisplayDoubloons(doubloons) }, [doubloons])
  useEffect(() => { setDisplayGems(gems) }, [gems])
  // Profile-button avatar (desktop nav). Pulled on mount and cached in
  // localStorage so the avatar doesn't flash to "default" on a hard
  // reload — these would otherwise reset to null until the supabase
  // fetcher resolves.
  const [characterColor, setCharacterColor] = useState<string | null>(() => readNavCache('character_color'))
  const [equippedHat, setEquippedHat]       = useState<string | null>(() => readNavCache('equipped_hat'))
  const [avatarBg, setAvatarBg]             = useState<string | null>(() => readNavCache('avatar_bg'))
  const [avatarBorder, setAvatarBorder]     = useState<string | null>(() => readNavCache('avatar_border'))
  const [isAdmin, setIsAdmin]               = useState<boolean>(() => readNavCache('is_admin') === 'true')
  const [mailUnread, setMailUnread]         = useState<number>(() => Number(readNavCache('mail_unread')) || 0)
  // Badges whose doubloon reward is earned but not yet claimed — the "N ready
  // to claim" count on the Badges nav item.
  const [claimableBadges, setClaimableBadges] = useState<number>(() => Number(readNavCache('badge_claims')) || 0)
  // Only render the mail icon once we know the user is signed in (same
  // gate the currency widgets use). isSignedIn flips true the first time
  // fetchBadge resolves a user.
  const [isSignedIn, setIsSignedIn]         = useState<boolean>(false)
  // Timestamp of the last badge refresh — throttles the route-change/focus storm.
  const lastBadgeFetchRef = useRef(0)

  const fetchBadge = useCallback((opts?: { force?: boolean }) => {
    const now = Date.now()
    if (!opts?.force && now - lastBadgeFetchRef.current < NAV_REFRESH_MIN_MS) return
    lastBadgeFetchRef.current = now
    const supabase = createClient()
    // getSession() reads the locally-cached session — no auth-server
    // roundtrip like getUser(). The id here only scopes SELECTs that RLS
    // enforces anyway, so the unverified read is safe and shaves
    // ~100-150ms off how long the avatar/badges sit ghosted on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      setIsSignedIn(true)
      Promise.all([
        supabase.from('profiles').select('character_color, equipped_hat, avatar_bg_color, avatar_border_color, is_admin, doubloons, gems, unlocked_badges, claimed_badge_rewards').eq('id', user.id).single(),
        supabase.from('daily_voyages').select('created_at, duration_ms').eq('user_id', user.id).eq('status', 'pending'),
        // Unread mail via the SERVER helper so the pip respects the SAME
        // visibility as the inbox (targeting + join-date + evergreen). The old
        // inline client query counted EVERY active row — including mail targeted
        // to other users and broadcasts sent before this player joined — so the
        // pip showed mail the inbox correctly hides ("badge but nothing there").
        getMailUnreadCount(),
      ]).then(([{ data: profile }, { data: voyages }, mailUnreadCount]) => {
        const cc = (profile?.character_color as string | null) ?? null
        const hat = (profile?.equipped_hat as string | null) ?? null
        const bg = (profile?.avatar_bg_color as string | null) ?? null
        const border = (profile?.avatar_border_color as string | null) ?? null
        const admin = (profile?.is_admin as boolean | null) ?? false
        setCharacterColor(cc)
        setEquippedHat(hat)
        setAvatarBg(bg)
        setAvatarBorder(border)
        setIsAdmin(admin)
        // Currency refresh — the layout server component that supplies the
        // doubloons/gems props is NOT re-run on client-side tab switches
        // (App Router preserves shared layouts), so the props stay frozen
        // and the `*-changed` events only fire for in-app spends. Without
        // this, an out-of-session balance change (admin grant, mail claim
        // settled elsewhere, webhook) wouldn't show until a full reload.
        // Re-reading here on every route change + foreground makes the
        // balance self-heal the same way the badges already do. Only set
        // when the widget is shown (prop was provided) so anonymous shells
        // stay chip-free.
        const freshDoubloons = profile?.doubloons as number | null | undefined
        const freshGems = profile?.gems as number | null | undefined
        if (typeof freshDoubloons === 'number') setDisplayDoubloons(freshDoubloons)
        if (typeof freshGems === 'number') setDisplayGems(freshGems)
        // Cache so next tab-switch hydrates immediately (no flash).
        writeNavCache('character_color', cc)
        writeNavCache('equipped_hat', hat)
        writeNavCache('avatar_bg', bg)
        writeNavCache('avatar_border', border)
        writeNavCache('is_admin', admin ? 'true' : null)
        const now = Date.now()
        const hasReadyVoyage = (voyages ?? []).some(
          (r: { created_at: string; duration_ms: number | null }) =>
            new Date(r.created_at).getTime() + (r.duration_ms ?? 7200000) <= now
        )
        setVoyageBadge(hasReadyVoyage)
        setMailUnread(mailUnreadCount)
        writeNavCache('mail_unread', mailUnreadCount > 0 ? String(mailUnreadCount) : null)
        // Ready-to-claim badge rewards: unlocked (and known) minus already-claimed.
        // Reads STORED unlocked_badges — a level/count badge only counts once it's
        // been reconciled in, which is the honest "waiting for you" set.
        const unlockedB = (profile?.unlocked_badges as string[] | null) ?? []
        const claimedB = new Set((profile?.claimed_badge_rewards as string[] | null) ?? [])
        const claimable = unlockedB.filter(id => BADGE_MAP[id] && !claimedB.has(id)).length
        setClaimableBadges(claimable)
        writeNavCache('badge_claims', claimable > 0 ? String(claimable) : null)
      }).catch(() => {})
    })
  }, [])

  // Nav persists across client-side navigations (PageTransition has no
  // key={pathname} — it broke iOS PWA fixed positioning), so a mount-only
  // fetch would mean the mail/voyage badges only ever update on a hard
  // reload. Re-check on every route change, and when the PWA comes back
  // to the foreground (visibilitychange) so backgrounded sessions pick up
  // new mail without a reload.
  useEffect(() => { fetchBadge() }, [fetchBadge, pathname])

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') fetchBadge()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchBadge])

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

  // A badge earned (BadgeWatcher) or a reward claimed (AchievementsClient) fires
  // `badges-changed` → re-read so the Badges nav count updates the moment it
  // changes, not only on the next route switch.
  useEffect(() => {
    const h = () => fetchBadge({ force: true })
    window.addEventListener('badges-changed', h)
    return () => window.removeEventListener('badges-changed', h)
  }, [fetchBadge])

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
    // THE TAVERN IS NOT A TAB. It is a building on the Mainland, and the only
    // way in is to sail there and go ashore — see the Mainland's `href` in
    // sea/chart. A link here would be a second door into a place whose whole
    // point is that reaching it is a trip, which is the same argument that
    // retired quick-sell and moved the Daily Haul onto the water.
    { href: '/sea', label: 'Fishing', badge: null,
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
  // the 5-slot bottom tab bar. Order: leaderboard, market, social.
  //
  // Crew is deliberately NOT here. It belongs to the expedition loop and is
  // reached from the hub's Crew/Ship/Items/Forge bar, next to the ship it
  // crews and the raids it fights. A second door in a global menu made it
  // look like a top-level destination of its own.
  // The Captain's Log is not here, and is not anywhere now: it has no link in
  // the shell at all. The page is still there to be reached directly.
  const mobileMenuLinks = [
    { href: '/leaderboard', label: 'Leaderboard', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="14" width="5" height="7" rx="1"/>
          <rect x="9.5" y="9" width="5" height="12" rx="1"/>
          <rect x="17" y="4" width="5" height="17" rx="1"/>
        </svg>
      )
    },
    // SOCIAL WAS HERE, AND IT WAS THE PROBLEM IT WAS SOLVING. A follow list on
    // its own page, behind a menu, one link away from a Tavern that was a
    // cupboard — two doors to two halves of the same thing. The tavern IS the
    // social room now and the list is inside it, so a second entry pointing at
    // the same place would only ask people to choose between them.
    // Admin-only — gated on profiles.is_admin (kingkong, mikel).
    // The Sea is the painted ocean hub, still being felt out. It lives here
    // rather than on the tab bar because five tabs is already the width of a
    // phone, and a sixth would shrink every label to test one prototype.
    // THE ONLY DOOR ON A PHONE. The bottom bar has five slots and every one
    // is spoken for, so this menu is how a phone reaches the sea at all —
    // which is why it stopped being admin-only the moment the beta opened.
    ...(isAdmin ? [{ href: '/dev/stats', label: 'Admin Stats', badge: false,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      )
    }] : []),
  ]

  // THE CAPTAIN'S LOG IS NOT A DOOR ANY MORE. It was the last link to
  // /achievements anywhere in the shell; the page still exists and still
  // renders, it simply is not something the nav offers. One entry fewer on a
  // row that already had to learn to scroll sideways.
  const desktopOnlyLinks = [
    { href: '/badges', label: 'Badges', badge: claimableBadges || null },
  ]

  // Desktop top-bar inline links. Canonical order: fishing, expeditions,
  // leaderboard, market — then badges from
  // desktopOnlyLinks. Profile is the avatar button on the far right,
  // so it doesn't appear here.
  const links = [
    { href: '/sea', label: 'Fishing', badge: null,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4l4 4"/>
          <path d="M8 8c2-2 5-3 8-1s4 5 2 8-5 3-8 1"/>
          <path d="M8 8L4 20"/>
          <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none"/>
        </svg>
      )
    },
    // THE OCEAN HUB, for captains who have it. Sits directly after Fishing
    // because that is what it is going to replace, which is also where anyone
    // looking for it will look. Filtered out below rather than rendered
    // disabled: a tab you cannot use is worse than no tab.
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
  ].filter(l => !('seaOnly' in l) || canSail)

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

        {/* min-w-0 + overflow-x-auto, because this row has no other way to
            lose. Seven tabs plus the logo and the currency chips need about
            1,140px, the row neither wraps nor scrolls, and flex refuses to
            shrink children below their content size — so at 1024-1200px (a
            small laptop, half of a big monitor) the chips got pushed off the
            right edge of the screen. Now the tabs scroll sideways under a
            hidden scrollbar, and the chips — the thing a captain checks most —
            always stay on screen. whitespace-nowrap keeps any two-word tab
            from folding into two lines mid-scroll. */}
        <div className="hidden sm:flex flex-1 min-w-0 overflow-x-auto scrollbar-hide whitespace-nowrap ml-8 gap-2 text-xs font-karla font-600 uppercase tracking-[0.12em]">
          {[...links, ...desktopOnlyLinks, ...(isAdmin ? [{ href: '/dev/stats', label: 'Admin', badge: null }] : [])].map(({ href, label, badge }) => (
            <Link key={href} href={href}
              className={`py-2 px-2 transition-colors duration-200 ${pathname === href || pathname.startsWith(href + '/') ? 'text-[#f0ede8]' : 'text-[#a0a09a] hover:text-[#f0ede8]'}`}>
              {label}
              {typeof badge === 'number' && badge > 0 && <span className="ml-1.5 text-[#f0c040]">· {badge}</span>}
              {badge === true && <span className="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-[#f0c040] translate-y-[-1px]" />}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {displayGems !== undefined && (
            <span className="font-cinzel font-700" style={{ fontSize: '0.875rem', color: '#a78bfa' }}>
              <TickingNumber value={displayGems} /> ◆
            </span>
          )}
          {displayDoubloons !== undefined && (
            <span
              data-doubloon-pill
              className="font-cinzel font-700 text-[#f0c040]"
              style={{ fontSize: '0.875rem' }}
            >
              <TickingNumber value={displayDoubloons} /> ⟡
            </span>
          )}
          {isSignedIn && <MailInbox initialUnreadCount={mailUnread} />}
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
          {displayGems !== undefined && (
            <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
              <TickingNumber value={displayGems} /> ◆
            </span>
          )}
          {displayDoubloons !== undefined && (
            <span
              data-doubloon-pill
              className="font-cinzel font-700 text-[#f0c040]"
              style={{ fontSize: '0.8rem' }}
            >
              <TickingNumber value={displayDoubloons} /> ⟡
            </span>
          )}
          {isSignedIn && <MailInbox initialUnreadCount={mailUnread} />}
          {/* Hamburger — animates into an X when open. */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="relative flex flex-col items-center justify-center w-8 h-8 rounded-md transition-colors"
            style={{ background: menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent', border: 'none', gap: 0 }}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span style={{
              position: 'absolute', display: 'block', width: 16, height: 1.6,
              background: menuOpen ? '#f0ede8' : '#a0a09a', borderRadius: 1,
              transformOrigin: 'center',
              transform: menuOpen ? 'translateY(0) rotate(45deg)' : 'translateY(-5px) rotate(0)',
              transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), background 0.15s',
            }} />
            <span style={{
              position: 'absolute', display: 'block', width: 16, height: 1.6,
              background: menuOpen ? '#f0ede8' : '#a0a09a', borderRadius: 1,
              opacity: menuOpen ? 0 : 1,
              transform: menuOpen ? 'scaleX(0.4)' : 'scaleX(1)',
              transition: 'opacity 0.15s, transform 0.22s cubic-bezier(0.4,0,0.2,1), background 0.15s',
            }} />
            <span style={{
              position: 'absolute', display: 'block', width: 16, height: 1.6,
              background: menuOpen ? '#f0ede8' : '#a0a09a', borderRadius: 1,
              transformOrigin: 'center',
              transform: menuOpen ? 'translateY(0) rotate(-45deg)' : 'translateY(5px) rotate(0)',
              transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1), background 0.15s',
            }} />
          </button>
        </div>

        {/* Dropdown — modernised 2026-05-19: bigger tap rows with icon
            tiles, identity strip at top, Sign Out separated and muted,
            smooth slide-fade open/close. */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="nav-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="absolute top-full left-0 right-0"
              style={{
                background: tint
                  ? `linear-gradient(${tint}, ${tint}), linear-gradient(180deg, #0c1320 0%, #060912 100%)`
                  : 'linear-gradient(180deg, #0c1320 0%, #060912 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 14px 38px rgba(0,0,0,0.65)',
                padding: '0.4rem 0',
                willChange: 'transform, opacity',
              }}
            >
              {/* Identity strip — tap to jump to /profile. Pulls the
                  same avatar the rest of the app uses. */}
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3"
                style={{
                  textDecoration: 'none',
                  padding: '0.7rem 1rem',
                  margin: '0 0.5rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <CharacterAvatar
                  characterColor={characterColor}
                  equippedHat={equippedHat}
                  size={40}
                  bgColor={avatarBg ?? undefined}
                  ringColor={avatarBorder ?? undefined}
                  borderStyle="none"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#7a7674' }}>
                    Account
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8', marginTop: 1 }}>
                    My Profile
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </Link>

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
                  className="w-full flex items-center gap-3"
                  style={{
                    margin: '0.45rem 0.5rem 0.25rem',
                    padding: '0.7rem 1rem',
                    width: 'calc(100% - 1rem)',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(14,116,144,0.32), rgba(14,116,144,0.10))',
                    border: '1px solid rgba(90,180,200,0.42)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(14,116,144,0.34)',
                    border: '1px solid rgba(90,180,200,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8fd6e6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v13M8 11l4 4 4-4"/>
                      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#d6eef3' }}>Install the App</p>
                      <span className="font-karla font-700 uppercase" style={{
                        fontSize: '0.5rem', letterSpacing: '0.1em', color: '#04161a',
                        background: '#5ab4c8', borderRadius: 999, padding: '0.12rem 0.42rem',
                      }}>Free</span>
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.7rem', color: '#9fc8d2', marginTop: 2, lineHeight: 1.35 }}>
                      Full-screen, no browser chrome.
                    </p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5ab4c8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              )}

              {/* Section label */}
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{
                fontSize: '0.52rem', color: '#5a5550',
                padding: '0.6rem 1.1rem 0.25rem',
              }}>
                Navigate
              </p>

              <div style={{ padding: '0 0.5rem' }}>
                {mobileMenuLinks.map(({ href, label, icon, badge }) => {
                  const active = pathname === href || pathname.startsWith(href + '/')
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3"
                      style={{
                        textDecoration: 'none',
                        padding: '0.55rem 0.7rem',
                        borderRadius: 10,
                        background: active ? 'rgba(240,192,64,0.08)' : 'transparent',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: active ? 'rgba(240,192,64,0.14)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${active ? 'rgba(240,192,64,0.42)' : 'rgba(255,255,255,0.08)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: active ? '#f0c040' : '#8a8580',
                        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      }}>
                        {icon}
                      </div>
                      <span className="font-cinzel font-700" style={{
                        flex: 1, fontSize: '0.86rem',
                        color: active ? '#f0ede8' : '#cfcabf',
                        letterSpacing: '0.02em',
                      }}>
                        {label}
                      </span>
                      {badge && (
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: '#f0c040', boxShadow: '0 0 6px rgba(240,192,64,0.7)',
                          flexShrink: 0,
                        }} />
                      )}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke={active ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.18)'}
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0 }}>
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </Link>
                  )
                })}
              </div>

              {/* Sign Out — visually separated and muted-red so it
                  doesn't compete with the navigation rows. */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.4rem', padding: '0.4rem 0.5rem 0.5rem' }}>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3"
                  style={{
                    padding: '0.55rem 0.7rem',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(239,68,68,0.72)',
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                  </div>
                  <span className="font-cinzel font-700" style={{
                    flex: 1, fontSize: '0.82rem',
                    color: 'rgba(239,68,68,0.72)',
                    letterSpacing: '0.02em',
                  }}>
                    Sign Out
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
