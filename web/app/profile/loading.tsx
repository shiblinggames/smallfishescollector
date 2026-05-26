// Route-level Suspense fallback for /profile. Mirrors avatar + name header,
// stats strip, then a few panel sections.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      {/* Avatar + name */}
      <div className="flex items-center gap-4" style={{ marginBottom: 18 }}>
        <SkeletonBox width={84} height={84} radius={999} />
        <div style={{ flex: 1 }}>
          <SkeletonBox width={140} height={20} radius={5} />
          <SkeletonBox width={100} height={12} radius={5} style={{ marginTop: 8 }} />
        </div>
      </div>
      {/* Stats strip */}
      <div className="flex gap-2" style={{ marginBottom: 18 }}>
        {[0, 1, 2].map(i => (
          <SkeletonBox key={i} height={64} radius={10} />
        ))}
      </div>
      {/* Panels */}
      {[0, 1, 2].map(i => (
        <SkeletonBox key={i} height={120} radius={14} style={{ marginBottom: 12 }} />
      ))}
    </PageSkeletonShell>
  )
}
