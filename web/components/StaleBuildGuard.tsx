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

import { useEffect } from 'react'
import { isStaleBuild, reloadOntoCurrentBuild } from '@/lib/staleBuild'

export default function StaleBuildGuard() {
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
  return null
}
