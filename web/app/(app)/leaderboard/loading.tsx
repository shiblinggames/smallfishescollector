// Route-level Suspense fallback for /leaderboard. It had none, so pressing
// the tab showed the page you were leaving until every board had loaded.
// Mirrors the title, the board picker, the podium, then the rows.

import { SkeletonBox, PageSkeletonShell } from '@/components/Skeleton'

export default function Loading() {
  return (
    <PageSkeletonShell>
      <SkeletonBox width={170} height={24} radius={6} style={{ marginBottom: 18 }} />
      {/* Board picker */}
      <SkeletonBox height={44} radius={12} style={{ marginBottom: 16 }} />
      {/* Podium */}
      <div className="flex gap-2" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <SkeletonBox height={110} radius={12} />
        <SkeletonBox height={140} radius={12} />
        <SkeletonBox height={96} radius={12} />
      </div>
      {/* Rows */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <SkeletonBox key={i} height={46} radius={10} style={{ marginBottom: 8 }} />
      ))}
    </PageSkeletonShell>
  )
}
