// Route-level Suspense fallback for /marketplace — the only tab that was
// missing one, so tapping Market showed a blank screen until the profile
// fetch resolved. Mirrors the page layout: full-width Market hero card,
// then two 2-column rows (Upgrades, Shop), each with a small section label.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox width={64} height={11} radius={5} style={{ marginBottom: 12 }} />
      <SkeletonBox height={150} radius={14} style={{ marginBottom: 28 }} />
      <SkeletonBox width={84} height={11} radius={5} style={{ marginBottom: 12 }} />
      <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 28 }}>
        <SkeletonBox height={132} radius={14} />
        <SkeletonBox height={132} radius={14} />
      </div>
      <SkeletonBox width={48} height={11} radius={5} style={{ marginBottom: 12 }} />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBox height={132} radius={14} />
        <SkeletonBox height={132} radius={14} />
      </div>
    </PageSkeletonShell>
  )
}
