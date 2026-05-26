// Route-level Suspense fallback for /fishing. Mimics the Zone Landing scaffold
// (level header → cumulative stats strip → list of zone cards) so the tap
// paints instantly while the real page resolves.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      {/* Level header row */}
      <div className="flex items-start justify-between mb-5">
        <div style={{ flex: 1 }}>
          <SkeletonBox width={120} height={18} radius={6} />
          <SkeletonBox width={150} height={12} radius={6} style={{ marginTop: 8 }} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SkeletonBox width={30} height={30} radius={999} />
          <SkeletonBox width={30} height={30} radius={999} />
        </div>
      </div>
      {/* Cumulative stats strip */}
      <div className="flex gap-2 mb-4">
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, background: 'rgba(2,6,12,0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <SkeletonBox width={48} height={18} radius={4} />
            <SkeletonBox width={70} height={10} radius={4} style={{ marginTop: 6 }} />
          </div>
        ))}
      </div>
      {/* Zone cards */}
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map(i => (
          <SkeletonBox key={i} height={142} radius={16} />
        ))}
      </div>
    </PageSkeletonShell>
  )
}
