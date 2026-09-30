// THE ROOMS THAT ARE ABOUT OTHER CAPTAINS (Steam prep, 2026-09-30). The
// leaderboards, contests, the follow list and other captains' profiles are
// between players, and they stay with the online game (the leaderboards and
// contests retire on Steam). Offline the shell says so plainly and shows the
// way back, instead of a room with nobody in it.

import RoomHeader from '@/components/RoomHeader'

const SAYS: Record<string, { title: string; line: string }> = {
  leaderboard: { title: 'The Leaderboards', line: 'The leaderboards belong to the online game. Out here the only captain to beat is you.' },
  contests: { title: 'Contests', line: 'Contests are races between captains, and they stay with the online game.' },
  social: { title: 'Your Crew', line: 'Other captains sail the online game. Nobody else is on this sea.' },
  captain: { title: 'Another Captain', line: 'Other captains sail the online game. Nobody else is on this sea.' },
}

export default function OnlineOnly({ which }: { which: keyof typeof SAYS }) {
  const s = SAYS[which]
  return (
    <main className="min-h-screen">
      <div className="px-4 pt-6 pb-16" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 'var(--game-col)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <RoomHeader title={s.title} backHref="/sea" backLabel="The Sea" accent="#e0a545" />
          <p className="font-karla" style={{ fontSize: '0.9rem', color: 'rgba(214,198,166,0.75)', lineHeight: 1.6, margin: 0 }}>{s.line}</p>
        </div>
      </div>
    </main>
  )
}
