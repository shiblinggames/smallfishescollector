'use client'

// ── THE IN-GAME CHROME, AND ONLY IN THE GAME ────────────────────────────────
//
// These used to be imported straight into the root layout, so the landing
// page and the login screen shipped all of them: the tab bar with framer-motion
// and the badge table, the live-profile socket, and three watchers that each
// fired a server action on mount (a badge reconcile, a pending-sales read and
// an activity ping) for a visitor who has no account yet (the 2026-09-23 audit).
//
// Each is a next/dynamic import, so its code is a separate chunk that is only
// fetched when this renders it. On a public page it renders nothing and the
// chunks never load. Still server-rendered on game routes, so the tab bar is
// in the first paint exactly as before. Same spot in the root layout as the
// imports it replaced, so stacking and persistence across tabs are unchanged.
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const MobileTabBar = dynamic(() => import('./MobileTabBar'))
const ProfileLive = dynamic(() => import('./ProfileLive'))
const BadgeWatcher = dynamic(() => import('./BadgeWatcher'))
const PendingSalesWatcher = dynamic(() => import('./PendingSalesWatcher'))
const FishingAudioPrimer = dynamic(() => import('./FishingAudioPrimer'))
const ActivityPing = dynamic(() => import('./ActivityPing'))

// Pages that sit outside the (app) shell and have no captain to watch.
const PUBLIC = new Set(['/', '/login', '/register', '/claim', '/demo', '/frozen'])

export default function AppChrome() {
  const pathname = usePathname() ?? '/'
  if (PUBLIC.has(pathname) || pathname.startsWith('/auth')) return null
  return (
    <>
      <MobileTabBar />
      {/* Before the badge watcher in the tree only for reading order; the
          two talk through window events, not props. See ProfileLive. */}
      <ProfileLive />
      <BadgeWatcher />
      <PendingSalesWatcher />
      <FishingAudioPrimer />
      <ActivityPing />
    </>
  )
}
