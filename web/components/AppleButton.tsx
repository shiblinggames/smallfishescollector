'use client'

// ── SIGN IN WITH APPLE ──────────────────────────────────────────────────────
//
// The same shape as GoogleButton, and it must stay that way: two sign-in doors
// that build their redirect differently is how the Google one ended up asking
// for the tavern by name for months while the login form politely passed it
// somewhere else.
//
// ── IT IS OFF UNTIL APPLE IS ACTUALLY CONFIGURED ────────────────────────────
//
// `signInWithOAuth` against a provider that is not enabled does not throw
// anything a player would understand — it comes back with "Unsupported provider"
// and, in the Google button's original form, was not even read. A dead button on
// the login screen is worse than no button, because the person pressing it
// concludes the game is broken rather than that they should use email.
//
// So it renders only when NEXT_PUBLIC_APPLE_SSO is set. The code can ship ahead
// of the Apple Developer setup and be switched on the moment that is done,
// rather than sitting on a branch going stale.
//
// ── WHAT THAT SETUP IS, BECAUSE IT IS NOT A DASHBOARD TOGGLE ────────────────
//
// Unlike Google, Apple charges: the Developer Program is $99/year and nothing
// below works without it.
//
//   1. An App ID, and a SERVICES ID — the Services ID is the client id for web
//      sign-in, and it is a different thing from the App ID.
//   2. On that Services ID, the return URL is SUPABASE'S callback, not ours:
//      https://<project-ref>.supabase.co/auth/v1/callback
//      Ours is where Supabase sends you afterwards; Apple never sees it.
//   3. A Sign in with Apple KEY (.p8), downloadable exactly once, plus its Key
//      ID and your Team ID. Supabase mints the client secret from those.
//   4. Apple provider enabled in the Supabase dashboard with all four.
//
// ── AND TWO THINGS APPLE DOES THAT GOOGLE DOES NOT ──────────────────────────
//
// THE NAME COMES ONCE. Apple returns the user's name on the FIRST authorisation
// and never again. Not on re-login, not on any later call. Anything that wants
// it has to take it on that first pass or it is gone for that account forever.
//
// THE EMAIL MAY BE A RELAY. "Hide My Email" gives you an
// @privaterelay.appleid.com address that forwards. It is a real address and a
// real account, but mail to it is dropped unless the sending domain is
// registered with Apple. In-game mail is database rows so it does not care;
// anything that leaves by SMTP would.

import { createClient } from '@/lib/supabase/client'

/** Set NEXT_PUBLIC_APPLE_SSO=1 once the four Apple pieces above are in place. */
export const APPLE_SSO_ON = process.env.NEXT_PUBLIC_APPLE_SSO === '1'

export default function AppleButton({ next = '/sea' }: { next?: string }) {
  if (!APPLE_SSO_ON) return null

  async function signInWithApple() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        // window.location.origin, for the reason spelled out in GoogleButton:
        // the site serves on www and an apex fallback sends a PKCE round trip
        // across hosts, leaving its code verifier behind.
        redirectTo: `${window.location.origin}/auth/callback`
          + `?next=${encodeURIComponent(next)}`,
      },
    })
  }

  return (
    <button
      onClick={signInWithApple}
      className="btn-ghost w-full relative"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span className="absolute" style={{ left: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
        {/* Apple's mark, in one path and in currentColor. Their guidelines want
            it monochrome against the button's own colour, which is what the
            ghost button already is. */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.83-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM14.9 5.6c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.59-2.56 1.31-.56.65-1.06 1.7-.93 2.69.97.08 1.97-.5 2.59-1.23z" />
        </svg>
      </span>
      Continue with Apple
    </button>
  )
}
