'use client'

// THE ERRORS AN ERROR BOUNDARY NEVER SEES.
//
// app/error.tsx catches what throws during RENDER. A chunk that fails while the
// router is fetching the next page does not throw during render — it rejects a
// promise inside the router, and depending on where it fails it can leave the
// app sitting there doing nothing at all, or blank, with no boundary having
// been given anything to catch.
//
// So the same test is applied to the two events that hear about everything:
// `error` for a script tag that would not load, `unhandledrejection` for a
// dynamic import that would not resolve.
//
// Same one-reload-a-minute guard as the boundaries, and the same narrow set of
// phrases — see lib/staleBuild for why matching loosely here would be much
// worse than the problem.

import { useEffect, useState } from 'react'
import { isStaleBuild, reloadOntoCurrentBuild, justReloadedForBuild, clearBuildBust } from '@/lib/staleBuild'

export default function StaleBuildGuard() {
  /**
   * SAY WHAT THE FLASH WAS.
   *
   * The reload this guard performs looks, from the outside, exactly like a
   * crash: a freeze, a white screen, and the game back a second later. Left
   * unlabelled, every deploy reads as instability — and the game deploys many
   * times a day, so it reads as instability that is getting worse.
   *
   * A quiet line for a few seconds after the reload turns the mystery into an
   * event with a name. It also splits diagnosis in half for free: a white
   * flash FOLLOWED by this line is a deploy doing what deploys do, and a white
   * flash without it is a real problem worth chasing.
   */
  const [updated, setUpdated] = useState(false)
  useEffect(() => {
    // The recovery navigation carries a throwaway parameter so it cannot be
    // answered from a cache. Take it back out before it ends up in a bookmark.
    clearBuildBust()
    if (!justReloadedForBuild()) return
    setUpdated(true)
    const t = setTimeout(() => setUpdated(false), 3200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isStaleBuild(e.error ?? { message: e.message })) reloadOntoCurrentBuild()
    }
    const onReject = (e: PromiseRejectionEvent) => {
      if (isStaleBuild(e.reason)) reloadOntoCurrentBuild()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onReject)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onReject)
    }
  }, [])

  if (!updated) return null
  return (
    <div aria-live="polite" style={{
      // Non-blocking by house rule: a notice never eats a tap.
      position: 'fixed', left: 0, right: 0, top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      zIndex: 200, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <p className="font-karla font-700" style={{
        margin: 0, padding: '0.4rem 0.9rem', borderRadius: 999, fontSize: '0.78rem',
        background: 'rgba(10,20,28,0.92)', border: '1px solid rgba(180,214,232,0.3)',
        color: 'rgba(214,232,240,0.9)',
      }}>
        Updated to the latest version
      </p>
    </div>
  )
}
