import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = [
  '/fishing',
  '/expeditions',
  '/marketplace',
  '/packs',
  '/profile',
  '/tavern',
  '/achievements',
  '/leaderboard',
  '/shipyard',
  '/social',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // ── THE FREEZE ──────────────────────────────────────────────────────────
  // An account put on ice from the admin page carries `frozen` in its auth
  // app_metadata (app/dev/stats/actions.ts), which getUser() above returns
  // fresh with no extra query. A frozen account is sent to the one page that
  // explains itself; a POST (a server action) gets a 403 instead of a redirect
  // it cannot follow. Login and the frozen page stay reachable, or there is no
  // way to sign in as somebody else.
  if (user?.app_metadata?.frozen === true
    && path !== '/frozen' && !path.startsWith('/login') && !path.startsWith('/api/') && !path.startsWith('/auth')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new NextResponse('This account is frozen.', { status: 403 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/frozen'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const isProtected = PROTECTED.some(p => path === p || path.startsWith(p + '/'))

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fish/|public/).*)',
  ],
}
