// Route-level fallback for /shipyard: the preview panel, then upgrade tiles.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox height={300} radius={22} style={{ marginTop: 48, marginBottom: 16 }} />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => (
          <SkeletonBox key={i} height={96} radius={12} />
        ))}
      </div>
    </PageSkeletonShell>
  )
}
