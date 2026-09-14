// Route-level fallback for /tavern/market.
//
// `/tavern/loading.tsx` already covered this route — a parent boundary covers
// its children — and it draws the TAVERN: a header and a six-card game grid.
// That is the wrong shape for a room that is one tall hero and a long list of
// holdings, so the press answered with a layout that then threw itself away.
//
// It also matters for how fast the press answers at all. A dynamic route's
// prefetch reaches as far as its nearest loading boundary and no further, so
// the one that is closest to the page is the one the browser can have in hand
// before the tap (see the CastingOff note on what a prefetch actually buys).
//
// The market is the last room of the first voyage, which is exactly the wrong
// place for a captain to sit looking at nothing.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      {/* The hero: what the hold is worth, and the Sell All under it. */}
      <SkeletonBox width={140} height={20} radius={6} style={{ marginBottom: 8 }} />
      <SkeletonBox height={150} radius={16} style={{ marginBottom: 14 }} />
      {/* And the holdings, one row per species. */}
      <SkeletonBox width={110} height={12} radius={5} style={{ marginBottom: 10 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonBox key={i} height={64} radius={12} />
        ))}
      </div>
    </PageSkeletonShell>
  )
}
