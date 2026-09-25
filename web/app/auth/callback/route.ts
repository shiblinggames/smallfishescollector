import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Where a fresh sign-in lands when nothing asked for somewhere specific.
  // Callers usually DO ask: see GoogleButton, which spent a long time asking
  // for the tavern by hand while the login form was passing it /sea.
  // A PATH ON THIS SITE, NOTHING ELSE. `${origin}${next}` with next = '@evil.com'
  // or '.evil.com' became another host, a phishing page straight after a real
  // login (2026-09-25 audit). One leading slash, then not a second slash or a
  // backslash.
  const rawNext = searchParams.get('next') ?? '/sea'
  const safe = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
  const next = safe ? rawNext : '/sea'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // ── ONE DEVICE AT A TIME ────────────────────────────────────────────
      //
      // Signing in here ends every OTHER session on the account. `others`
      // keeps the one just created and revokes the rest, so the phone signs
      // the desktop out and the desktop signs the phone out, whichever went
      // second. Both doors arrive here: the magic link and Google alike.
      //
      // The revocation is immediate on the server. The other device finds out
      // when its library next exchanges its refresh token, which it does on
      // its own ticker and whenever its tab becomes visible, so picking that
      // device back up is the thing that signs it out. Its access token stays
      // valid until it expires, which is the documented shape of this and the
      // reason not to also pay a session lookup on every request: see
      // components/SessionWatch, which meets it at the door.
      //
      // Never allowed to fail a sign-in. A captain who got here has proved who
      // they are, and a failed cleanup is not a reason to refuse them.
      try { await supabase.auth.signOut({ scope: 'others' }) } catch { /* in they come anyway */ }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
