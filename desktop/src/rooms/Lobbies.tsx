// THE THREE LOBBIES, IN THE SHELL (Steam prep, 2026-09-30). Each web lobby page
// is a column around one client component; the props come from lib/core/lobbies
// on both builds, so this only draws the column.

import ChartRoomLobby from '@/app/(app)/tavern/chart-room/ChartRoomLobby'
import CasinoLobby from '@/app/(app)/tavern/casino/CasinoLobby'
import TriviaLobby from '@/app/(app)/tavern/trivia/TriviaLobby'
import type { ComponentProps } from 'react'

type Props =
  | { room: 'chart-room'; props: ComponentProps<typeof ChartRoomLobby> }
  | { room: 'casino'; props: ComponentProps<typeof CasinoLobby> }
  | { room: 'parlor'; props: ComponentProps<typeof TriviaLobby> }

export default function Lobby(p: Props) {
  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        {p.room === 'chart-room' ? <ChartRoomLobby {...p.props} />
          : p.room === 'casino' ? <CasinoLobby {...p.props} />
            : <TriviaLobby {...p.props} />}
      </div>
    </main>
  )
}
