// Route-level Suspense fallback for /marketplace. Mirrors the page layout:
// centered title block, full-width Market hero card, two 2-column rows
// (Upgrades, Shop) each with a section label, then the slim Redeem card.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 26 }}>
        <SkeletonBox width={180} height={26} radius={7} style={{ marginBottom: 10 }} />
        <SkeletonBox width={240} height={11} radius={5} />
      </div>
      <SkeletonBox width={64} height={11} radius={5} style={{ marginBottom: 12 }} />
      <SkeletonBox height={150} radius={14} style={{ marginBottom: 28 }} />
      <SkeletonBox width={84} height={11} radius={5} style={{ marginBottom: 12 }} />
      <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 28 }}>
        <SkeletonBox height={132} radius={14} />
        <SkeletonBox height={132} radius={14} />
      </div>
      <SkeletonBox width={48} height={11} radius={5} style={{ marginBottom: 12 }} />
      <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 28 }}>
        <SkeletonBox height={132} radius={14} />
        <SkeletonBox height={132} radius={14} />
      </div>
      <SkeletonBox height={62} radius={14} />
    </PageSkeletonShell>
  )
}
