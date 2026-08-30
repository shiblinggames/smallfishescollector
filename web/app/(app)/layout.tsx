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
import SetupModal from '@/components/SetupModal'
import WelcomeModal from '@/components/WelcomeModal'
import { getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { isPremiumActive } from '@/lib/premium'
import { CHARACTER_COLORS } from '@/lib/characters'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  const freeColorIds = CHARACTER_COLORS.filter(c => c.free).map(c => c.id)
  const unlockedColors = [...freeColorIds, ...((profile?.unlocked_character_colors as string[] | null) ?? [])]
  return (
    <>
      {/* ── PICK A NAME AND A FACE, WHEREVER YOU LAND ────────────────────
          This lived on /tavern, and it was reachable because /tavern was the
          page you were dropped on. It is NOT any more: the sea took the
          startup slot, so a brand new captain went straight to the water, got
          the first voyage, and was never once asked what to call themselves —
          they sailed off carrying an auto-assigned username they had not
          chosen and could not tell was temporary.

          It belongs to the account, not to a room, so it hangs off the shell
          and fires on whichever page the session opens on.

          `has_seen_setup` and `has_seen_welcome` are profile columns, which is
          the house rule for anything one-time (never localStorage — a captain
          who opens the game on their phone should not be set up twice). */}
      {!profile?.has_seen_setup
        ? <SetupModal
            currentColor={profile?.character_color ?? 'default'}
            unlockedColors={unlockedColors}
            showWelcomeAfter={!profile?.has_seen_welcome}
            // New accounts get an auto-assigned default username, so `username`
            // is always set — gate the setup step on whether they have actually
            // CHOSEN one (username_changed), matching updateUsername's one-time
            // lock.
            hasUsername={!!profile?.username_changed}
            isPremium={isPremiumActive(profile)}
          />
        : !profile?.has_seen_welcome
          ? <WelcomeModal />
          : null
      }
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
