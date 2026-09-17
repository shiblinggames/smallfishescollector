'use client'

// The Charting rooms' header: the Chart Room lobby, the four puzzles and the
// World Chart. A thin wrapper over RoomHeader, which every room on the
// Mainland shares, carrying the one number this room is about: charting points.

import RoomHeader from '@/components/RoomHeader'

const GOLD = '#f0c040'

export default function ChartingNav({ title, backHref, backLabel, points }: {
  title: string
  backHref: string
  backLabel: string
  points: number
}) {
  return (
    <RoomHeader
      title={title}
      backHref={backHref}
      backLabel={backLabel}
      right={
        <span className="font-karla font-700 flex items-center" style={{ gap: 4, fontSize: '0.72rem', color: GOLD, whiteSpace: 'nowrap' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={GOLD} aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          {points.toLocaleString()} pts
        </span>
      }
    />
  )
}
