'use client'

import type React from 'react'

// The shops' header: the Market, the Tackle Shop, the Shipyard, and the Tackle
// Shop's own section views. A thin wrapper over RoomHeader, which every room on
// the Mainland shares. It used to be its own layout, with the title absolutely
// positioned and a size of its own, so a captain crossing from the Den to the
// Market saw the furniture move.
//
// Two back modes, both still needed: `href` to leave for somewhere, or `onBack`
// for a view that is local state rather than a route (the Tackle Shop's
// sections are not pages, so there is nothing to navigate to).

import RoomHeader from './RoomHeader'

export default function ShopHeader({
  title, backLabel, href, onBack, accent = '#f0c040', badge, coach,
}: {
  /** `data-coach` handle on the BACK control, for a walkthrough that needs to
   *  point at the way out. A shop is a room somebody can get stuck in. */
  coach?: string
  title: string
  backLabel: string
  href?: string
  onBack?: () => void
  accent?: string
  /** The one number this shop is about. The Tackle Shop carries the player's
   *  fishing level here, since every gate in it is a fishing-level gate. */
  badge?: React.ReactNode
}) {
  return (
    <RoomHeader
      title={title}
      backLabel={backLabel}
      backHref={href}
      onBack={onBack}
      coach={coach}
      accent={accent}
      right={badge}
      style={{ marginBottom: 18 }}
    />
  )
}
