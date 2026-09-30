// next/navigation, for the desktop shell (Steam prep, 2026-09-30).
//
// The game's screens were written for Next's App Router. In the shell there is
// no Next: this is the handful of it they use, over the window's own history.
// The shell serves index.html for any path (electron/main.cjs), so a real URL
// like app://game/tavern/market survives a reload, and the `window.location`
// assignments the screens make still land on a screen.
//
// refresh() is the one that matters most: on the web it re-runs the page's
// server loader and hands the SAME mounted component new props. Here it bumps a
// counter the screen host (../router) watches, which re-runs the screen's loader
// the same way, without remounting.

import { useSyncExternalStore } from 'react'

type Loc = { pathname: string; search: string }
const read = (): Loc => ({ pathname: window.location.pathname, search: window.location.search })
let loc: Loc = read()
let refreshTick = 0
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

window.addEventListener('popstate', () => { loc = read(); emit() })

function go(href: string, replace: boolean) {
  const url = new URL(href, window.location.href)
  if (url.origin !== window.location.origin) { window.open(url.toString(), '_blank'); return }
  const target = url.pathname + url.search + url.hash
  if (replace) window.history.replaceState(null, '', target)
  else window.history.pushState(null, '', target)
  loc = read()
  emit()
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }

/** The router the screens get. Stable across renders, like Next's. */
const router = {
  push: (href: string) => go(href, false),
  replace: (href: string) => go(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  prefetch: (_href?: string) => {},
  refresh: () => { refreshTick++; emit() },
}

export function useRouter() { return router }

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => loc.pathname)
}

const paramsCache = new Map<string, URLSearchParams>()
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, () => loc.search)
  let p = paramsCache.get(search)
  if (!p) { p = new URLSearchParams(search); paramsCache.set(search, p) }
  return p
}

/** For the screen host: the location, and the counter refresh() bumps. */
export function useLocationState(): { pathname: string; search: string; refresh: number } {
  const pathname = useSyncExternalStore(subscribe, () => loc.pathname)
  const search = useSyncExternalStore(subscribe, () => loc.search)
  const refresh = useSyncExternalStore(subscribe, () => refreshTick)
  return { pathname, search, refresh }
}

/** Server-side on the web; in the shell a loader may call it to move on. */
export function redirect(href: string): never {
  go(href, true)
  throw new Error(`redirect to ${href}`)
}

export function notFound(): never {
  throw new Error('not found')
}
