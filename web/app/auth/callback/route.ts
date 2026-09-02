import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Where a fresh sign-in lands when nothing asked for somewhere specific.
  const next = searchParams.get('next') ?? '/sea'

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
    // ── TEMPORARY: WHERE DOES A SIGN-IN ACTUALLY GO? ──────────────────────
    // Reported as "I always land on seasthebooty.com/tavern", and nothing in
    // this app can produce that URL: the site serves on www, `origin` here is
    // whatever host ran this handler, and /sea has not issued a redirect in
    // days. Three guesses at the cause have now been wrong, so this stops
    // guessing and records the decision.
    //
    // Deliberately no `code` and no token in the output — only whether one
    // arrived, where the request landed, and what the exchange said.
    console.log('[auth/callback]', JSON.stringify({
      origin, next, host: request.headers.get('host'),
      hasCode: true, ok: !error, err: error?.message ?? null,
      to: `${origin}${next}`,
    }))
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  if (!code) {
    console.log('[auth/callback]', JSON.stringify({
      origin, next, host: request.headers.get('host'), hasCode: false,
    }))
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
