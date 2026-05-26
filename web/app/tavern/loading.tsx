// Route-level Suspense fallback for /tavern. The tavern is a grid of game cards
// (Crown & Anchor, Slots, Daily Bonus, Bounties, etc.), so skeleton out a header
// + a 2-column card grid.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox width={160} height={22} radius={6} style={{ marginBottom: 6 }} />
      <SkeletonBox width={220} height={12} radius={5} style={{ marginBottom: 18 }} />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonBox key={i} height={132} radius={14} />
        ))}
      </div>
    </PageSkeletonShell>
  )
}
