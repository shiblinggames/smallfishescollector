// THE SLOTS PAGE, DRAWN (split out 2026-09-30). The page reads the shared
// casino wallet, the machine's stats and the pot, and hands them here; the
// desktop build reads the same from the save.

import SlotMachine from './SlotMachine'
import type { getCasinoState } from './casino/actions'
import type { getSlotStats, getSlotsJackpot } from './actions'

export default function SlotsView({ wallet, stats, jackpot }: {
  wallet: Awaited<ReturnType<typeof getCasinoState>>
  stats: Awaited<ReturnType<typeof getSlotStats>>
  jackpot: Awaited<ReturnType<typeof getSlotsJackpot>>
}) {
  return (
    <main className="min-h-screen px-4 sm:px-8 py-8">
      <div className="max-w-sm sm:max-w-3xl mx-auto">
        <SlotMachine
          chips={wallet.chips}
          doubloons={wallet.doubloons}
          sessionBuyIns={wallet.sessionBuyIns}
          sessionNet={wallet.sessionNets.slots}
          dailyRemaining={wallet.dailyRemaining}
          initialStats={stats}
          initialJackpot={jackpot}
        />
      </div>
    </main>
  )
}
