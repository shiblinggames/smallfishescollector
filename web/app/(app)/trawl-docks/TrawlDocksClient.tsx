'use client'

// The Docks are the trawl panel and nothing else, so the panel opens on arrival
// and closing it puts you back on the water. TrawlIndicator is MOUNTED, not
// reimplemented: it already owns the zone cards, the crew picker, the collect
// reveal and the slot ladder, and a second copy of a payout is the one kind of
// duplication this codebase cannot afford.

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TrawlIndicator from '../fishing/TrawlIndicator'
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
      <TrawlIndicator variant="dock" canDeploy onDismiss={leave}
        before={<DailyOrders initial={daily} />} />
    </div>
  )
}
