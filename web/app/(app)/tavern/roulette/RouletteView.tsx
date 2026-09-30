// THE ROULETTE PAGE, DRAWN (split out 2026-09-30), so the desktop build draws
// the same page around the same table.

import RouletteClient from '../RouletteClient'
import type { getRouletteState } from './actions'

export default function RouletteView({ initial }: { initial: Awaited<ReturnType<typeof getRouletteState>> }) {
  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <RouletteClient initial={initial} />
      </div>
    </main>
  )
}
