'use client'

// ── A REFRESH THAT REACHES A SHEET'S OWN READ ──────────────────────────────
//
// Components written for a page (ShipHero, the Ultimate build) reconcile by
// calling router.refresh(), which re-runs the page's server components and
// hands them fresh props. Mounted inside a sea sheet, their props come from
// the SHEET's own server-action read instead, and router.refresh() never
// reaches it: a forged item did not appear, consumed parts stayed listed, a
// started build looked unstarted. A sheet that reads for itself provides its
// re-read here, and useRefreshAll() does both.

import { createContext, useCallback, useContext } from 'react'
import { useRouter } from 'next/navigation'

export const SheetRefresh = createContext<(() => void) | null>(null)

export function useRefreshAll(): () => void {
  const router = useRouter()
  const sheet = useContext(SheetRefresh)
  return useCallback(() => { router.refresh(); sheet?.() }, [router, sheet])
}
