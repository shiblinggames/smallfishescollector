'use client'

// ── EVERY ROOM ON THE MAINLAND WEARS THE SAME HEAD ──────────────────────────
//
// Six doors open off the Mainland and each had built its own header. The Den,
// the Parlor, the Chart Room and the Den's card tables each hand-rolled the
// identical three-part row, four separate copies of it; the Market, the Tackle
// Shop and the Shipyard used a fifth with the title absolutely centred at a
// different size; and the way out was labelled "The Sea" in one room, "Tavern"
// in another and just "Back" in a third. Nothing was badly made. It simply did
// not agree with itself, and a captain crossing four of these in a minute
// feels that as six different games.
//
// One row now: the way out on the left, the room's name in the middle, and a
// slot on the right for the one number that room is about (chips in the Den,
// points in the Parlor and the Chart Room, fishing level in the Tackle Shop).
//
// EQUAL FLEX ON THE RAILS, so the title sits at the row's true centre whatever
// the widths of the two things flanking it. That was the one detail the old
// copies got right and the shop header got wrong by absolutely positioning the
// title instead.

import type React from 'react'
import BackPill from './BackPill'

export default function RoomHeader({
  title, backLabel, backHref, onBack, right, coach, accent = '#f0c040', style,
}: {
  title: string
  /** Where the way out goes, said plainly: "The Sea", "The Den". */
  backLabel: string
  backHref?: string
  /** For a view that is local state rather than a route. See BackPill. */
  onBack?: () => void
  /** The one number this room is about. */
  right?: React.ReactNode
  coach?: string
  accent?: string
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <BackPill label={backLabel} href={backHref} onBack={onBack} coach={coach} />
      </div>
      <p className="font-cinzel font-700" style={{
        fontSize: '1.05rem', color: '#f4ecd8', textAlign: 'center', whiteSpace: 'nowrap',
        letterSpacing: '0.02em', textShadow: `0 1px 3px rgba(0,0,0,0.7), 0 0 14px ${accent}33`,
      }}>
        {title}
      </p>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
        {right}
      </div>
    </div>
  )
}
