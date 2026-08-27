'use client'

// THE TALLY HOUSE. The day's orders, counted and paid.
//
// It was the Trawl Docks, and it was where you went to SEND a crew out. Sending
// happens at the fleet moored off the Mainland now — a place on the water you
// steer to, with the boats you are sending in front of you — so this island
// kept the half that is genuinely paperwork.
//
// The page scrolls; nothing here opens as a sheet. A modal on a page you have
// already navigated to is two arrivals for one destination.

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DailyOrders from './DailyOrders'
import type { DailyChallengeState } from '@/lib/dailyChallenges'

/** Written by the chart when it sends you here, so leaving can go BACK rather
 *  than pushing a second copy of /sea on top of the one you came from. */
const FROM_SEA = 'sea:came-from-chart'

export default function TrawlDocksClient({ daily }: { daily: DailyChallengeState | null }) {
  const router = useRouter()

  // WARM THE ROUTE WHILE YOU READ THE PANEL.
  //
  // `router.push` does not prefetch the way a <Link> does, so the first thing
  // that happened on close was a cold fetch of /sea — after the sheet had
  // already gone, which is exactly the wrong order and reads as a hang. Asked
  // for on mount instead, so by the time anyone taps close it is sitting ready.
  useEffect(() => { router.prefetch('/sea') }, [router])

  const leave = useCallback(() => {
    // BACK, when we came from the chart. A push mounts a SECOND /sea on top of
    // the one still in history — the map remounts from cold, re-reads the boat's
    // position from the server and rebuilds every island, which is a visible
    // reload of a screen the player never actually left. Going back restores the
    // one that is already there.
    //
    // Guarded on a breadcrumb rather than `history.length`, which counts entries
    // from other origins and would happily walk somebody out of the site on a
    // deep link.
    let cameFromChart = false
    try {
      cameFromChart = sessionStorage.getItem(FROM_SEA) === '1'
      sessionStorage.removeItem(FROM_SEA)
    } catch { /* private mode — fall through to the push */ }

    if (cameFromChart) router.back()
    else router.push('/sea')
  }, [router])

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0"
      style={{
        // THE PAGE SCROLLS NOW. The panel used to be a sheet with its own
        // maxHeight and overflow; laid onto the island as a page, the scrolling
        // has to happen out here or a long day's orders simply runs off the
        // bottom with no way to reach it.
        overflowY: 'auto', overscrollBehavior: 'contain',
        // A solid base under the sheet. The panel is a bottom sheet with a
        // translucent backdrop, and on a page with nothing behind it that
        // backdrop would be a window onto the app shell.
        background: 'radial-gradient(ellipse 120% 90% at 50% 0%, #17303f 0%, #0b1a26 55%, #071119 100%)',
      }}>
      {/* THE DAY'S ORDERS, and nothing else. The trawl panel used to open on
          arrival with the orders stacked above it; sending a crew out happens
          at the fleet on the water now, so what is left here is the work you
          came to read. It is laid onto the page rather than opened as a sheet,
          which is also why this stopped feeling slower than the Shipyard. */}
      <div className="page-col" style={{ padding: '1rem 1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button type="button" onClick={leave} aria-label="Back to the water" title="Back to the water"
            style={{
              width: 30, height: 30, borderRadius: '50%', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
              color: '#cfcabf', cursor: 'pointer',
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <DailyOrders initial={daily} />
      </div>
    </div>
  )
}
