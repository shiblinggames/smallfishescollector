// Route-level Suspense fallback for /badges (the goals and trophy shelf). The page
// is a vertical spine of journey entries + Finn/raid recap rows, so skeleton
// out a header and a long stack of entry cards.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox width={170} height={22} radius={6} style={{ marginBottom: 6 }} />
      <SkeletonBox width={240} height={12} radius={5} style={{ marginBottom: 20 }} />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonBox key={i} height={88} radius={12} />
        ))}
      </div>
    </PageSkeletonShell>
  )
}
