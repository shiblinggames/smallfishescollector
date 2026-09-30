// THE BLACKJACK PAGE, DRAWN (split out 2026-09-30). The page reads the wallet
// columns, the day's wagers, any hand left open and the fish art; the desktop
// build reads the same from the save.

import Blackjack from '../Blackjack'
import { denCapFromXp } from '../constants'
import { isPremiumActive } from '@/lib/premium'
import type { FishArtPool } from '@/lib/blackjackFishArtPool'
import type { resumeHand } from './actions'

export default function BlackjackView({ profile, dailyWagered, resumed, fishArtPool }: {
  profile: Record<string, unknown> | null
  dailyWagered: number
  resumed: Awaited<ReturnType<typeof resumeHand>>
  fishArtPool: FishArtPool
}) {
  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-6 pt-6 pb-12">
        <Blackjack
          doubloons={Number(profile?.doubloons ?? 0)}
          chips={Number(profile?.casino_chips ?? 0)}
          sessionBuyIns={Number(profile?.casino_session_buy_ins ?? 0)}
          sessionNet={Number(profile?.blackjack_session_net ?? 0)}
          dailyWagered={dailyWagered}
          dailyCap={denCapFromXp(Number(profile?.fishing_xp ?? 0), Number(profile?.expedition_xp ?? 0), isPremiumActive(profile))}
          resumed={resumed}
          fishArtPool={fishArtPool}
        />
      </div>
    </main>
  )
}
