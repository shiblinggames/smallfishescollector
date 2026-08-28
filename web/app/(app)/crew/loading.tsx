// Route-level fallback for /crew: header, the hall hero, then the roster grid.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox width={180} height={24} radius={6} style={{ marginBottom: 6 }} />
      <SkeletonBox width={120} height={12} radius={5} style={{ marginBottom: 16 }} />
      <SkeletonBox height={150} radius={16} style={{ marginBottom: 14 }} />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonBox key={i} height={120} radius={12} />
        ))}
      </div>
    </PageSkeletonShell>
  )
}
