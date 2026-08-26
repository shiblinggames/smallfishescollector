'use client'

// The Docks are the trawl panel and nothing else, so the panel opens on arrival
// and closing it puts you back on the water. TrawlIndicator is MOUNTED, not
// reimplemented: it already owns the zone cards, the crew picker, the collect
// reveal and the slot ladder, and a second copy of a payout is the one kind of
// duplication this codebase cannot afford.

import { useRouter } from 'next/navigation'
import TrawlIndicator from '../fishing/TrawlIndicator'

export default function TrawlDocksClient() {
  const router = useRouter()
  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0"
      style={{
        // A solid base under the sheet. The panel is a bottom sheet with a
        // translucent backdrop, and on a page with nothing behind it that
        // backdrop would be a window onto the app shell.
        background: 'radial-gradient(ellipse 120% 90% at 50% 0%, #17303f 0%, #0b1a26 55%, #071119 100%)',
      }}>
      <TrawlIndicator variant="dock" canDeploy onDismiss={() => router.push('/sea')} />
    </div>
  )
}
