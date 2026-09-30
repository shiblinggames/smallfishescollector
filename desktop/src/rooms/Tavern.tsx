// THE TAVERN, IN THE SHELL (Steam prep, 2026-09-30).
//
// The web's /tavern is a server page stitched from server parts, so the shell
// composes the same parts itself. What it keeps: the header and intro, the room
// talking (Gossip) and the Salt Road (from the save's rapport). What it leaves
// out, by the 2026-09-30 decisions: the leaderboard ticker and the contests card
// (both retire on Steam), the support card (no store), and the crew digest,
// which comes back when sailing together moves onto Steam friends.

import RoomHeader from '@/components/RoomHeader'
import RoomIntro from '@/components/RoomIntro'
import Gossip from '@/app/(app)/tavern/Gossip'
import SaltRoadDigestView from '@/app/(app)/tavern/SaltRoadDigestView'
import type { Rapport } from '@/lib/gameApi'

export default function Tavern({ seed, rap }: { seed: string; rap: Rapport[] }) {
  return (
    <main className="min-h-screen">
      <div className="px-4 pt-6 pb-16 sm:pb-8" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 'var(--game-col)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <RoomHeader title="The Tavern" backHref="/sea" backLabel="The Sea" accent="#e0a545" />
          <RoomIntro>The room with other captains in it. Who you sail with, where you stand with the regulars, and the day&apos;s races.</RoomIntro>
          <Gossip seed={seed} />
          <SaltRoadDigestView rap={rap} />
        </div>
      </div>
    </main>
  )
}
