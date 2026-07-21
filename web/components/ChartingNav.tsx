'use client'

// Shared top nav for every Charting page (Chart Room lobby, the four puzzles,
// the World Chart). Consistent layout: a back pill on the left, the page title
// centered, and the player's CHARTING POINTS on the right. Side rails get equal
// flex so the title stays optically centered.

import BackButton from '@/components/BackButton'

const GOLD = '#f0c040'

export default function ChartingNav({ title, backHref, backLabel, points }: {
  title: string
  backHref: string
  backLabel: string
  points: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <BackButton href={backHref} label={backLabel} />
      </div>
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
        {title}
      </p>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <span className="font-karla font-700 flex items-center" style={{ gap: 4, fontSize: '0.72rem', color: GOLD, whiteSpace: 'nowrap' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={GOLD} aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          {points.toLocaleString()} pts
        </span>
      </div>
    </div>
  )
}
