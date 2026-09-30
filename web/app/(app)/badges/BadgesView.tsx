// THE BADGES PAGE, DRAWN (split out 2026-09-30). lib/core/badgesPage works out
// the groups on both builds; this is the page around them.

import AchievementsClient, { type JourneyGroup } from '@/app/(app)/achievements/AchievementsClient'

export default function BadgesView({ groups, doneCount, totalCount }: { groups: JourneyGroup[]; doneCount: number; totalCount: number }) {
  return (
    <>
      <main className="min-h-screen pt-8" style={{ position: 'relative', zIndex: 1 }}>
        {/* The same AchievementsClient that /achievements draws at 980. Phones keep
            the modal width; a monitor gets the game column. */}
        <div className="page-col page-col-modal pb-16 sm:pb-8" style={{ maxWidth: 'max(var(--modal-w), var(--game-col))' }}>
          <div className="mb-4">
            {/* The Captain's Log link lived here. It is not offered anywhere in
                the app now — the page still renders for anyone who has the URL. */}
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>Badges</h1>
          </div>

          <AchievementsClient groups={groups} doneCount={doneCount} totalCount={totalCount} />
        </div>
      </main>
    </>
  )
}
