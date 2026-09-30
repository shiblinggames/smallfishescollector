// THE ROOMS THAT ARE ABOUT OTHER CAPTAINS (Steam prep, 2026-09-30). The
// follow list and other captains' profiles are between players and stay with
// the online game until sailing together moves onto Steam friends. Offline the
// shell says so plainly and shows the way back, instead of a room with nobody
// in it. (The leaderboards and contests do not exist on Steam at all; their
// paths redirect to the chart, see ../screens.)

import RoomHeader from '@/components/RoomHeader'

const SAYS: Record<string, { title: string; line: string }> = {
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
