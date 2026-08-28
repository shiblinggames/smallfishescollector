// Route-level fallback for /home: header, then the homestead's building rows.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox width={200} height={24} radius={6} style={{ marginBottom: 6 }} />
      <SkeletonBox width={150} height={12} radius={5} style={{ marginBottom: 18 }} />
      {[0, 1, 2].map(i => (
        <SkeletonBox key={i} height={140} radius={16} style={{ marginBottom: 12 }} />
      ))}
    </PageSkeletonShell>
  )
}
