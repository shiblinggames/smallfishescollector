// Route-level Suspense fallback for /expeditions. Mirrors the page's
// ShipHero → DailyVoyagePanel → Raids section scaffold.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      {/* Ship hero card */}
      <SkeletonBox height={210} radius={16} style={{ marginBottom: 14 }} />
      {/* Daily voyage panel */}
      <SkeletonBox height={140} radius={14} style={{ marginBottom: 14 }} />
      {/* Raids section header + collapsed strip */}
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <SkeletonBox width={90} height={16} radius={5} />
        <SkeletonBox width={56} height={12} radius={5} />
      </div>
      <SkeletonBox height={86} radius={12} />
    </PageSkeletonShell>
  )
}
