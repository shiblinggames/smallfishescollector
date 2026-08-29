// Logged-in app shell. Lives in a route group so it wraps every "in-app" route
// (fishing, expeditions, tavern, profile, raids, marketplace, etc.) without
// changing any URLs. Public pages (login, register) sit OUTSIDE this group and
// don't get this shell.
//
// The shell renders <Nav> ONCE per session instead of per-page. Concretely:
//
// 1) Nav appears as soon as the profile fetch resolves, in parallel with the
//    page's own queries — so the user sees the shell at the speed of one fast
//    query, not the page's slowest query.
// 2) Nav stops re-mounting between tab clicks (it lives outside the page
//    subtree now), so its localStorage cache stays warm and the TickingNumber
//    counters no longer reset on every nav.
// 3) Every page sheds the boilerplate of importing Nav and threading
//    packs_available / doubloons / gems through its own data fetch.
//
// The layout deliberately does NOT enforce auth — each page handles its own
// `if (!user) redirect('/login')`. Pages that don't need auth (privacy,
// terms, contact, public profile) still get the same shell; Nav handles a
// missing profile by hiding its currency chips, so anonymous viewers see a
// clean header rather than zeros.
//
// `getCurrentProfile()` is cached per request (lib/userData.ts), so this
// layout-level fetch is deduped with any same-request call inside a page —
// the dedup that React.cache was set up for actually fires now.

/**
 * NOTHING IN HERE RUNS FOR FIVE MINUTES.
 *
 * The platform default let a stuck render sit for 300 seconds before it was
 * killed, and on 2026-08-28 it did exactly that on /sea and /leaderboard. The
 * captain watching it did not see an error, they saw a page spin for five
 * minutes and then a browser telling them the connection was lost - which is
 * indistinguishable from the whole site being down, and was reported as such.
 *
 * Twenty seconds is far above anything this app legitimately does (the slow
 * pages are a handful of indexed reads) and far below the point where somebody
 * has already decided the game is broken. It is also the OUTER of two limits:
 * lib/supabase/timeout caps a single database call at ten, so a stuck query
 * trips that first and renders a real error instead of dying out here with no
 * application code left to explain itself.
 *
 * Route segment config, so it covers every page under the shell and the server
 * actions they call. The crons are route handlers outside this group and keep
 * their own, longer, maxDuration.
 */
export const maxDuration = 20

import Nav from '@/components/Nav'
import MembershipModal from '@/components/MembershipModal'
import { getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available}
        doubloons={profile?.doubloons}
        gems={profile?.gems}
        canSail={canSail(profile)}
      />
      {children}
      {/* Global membership purchase popup — opens on the `open-membership`
          event fired by every "Become a member" CTA across the app. */}
      <MembershipModal />
    </>
  )
}
