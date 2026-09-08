'use client'

// ── THE SHIP SCREEN, OVER THE WATER ─────────────────────────────────────────
//
// Two doors on the chart open this: "Manage her" at the Gunwharf, and mooring
// at the Forge island. Both used to be `router.push` — off the sea, onto a
// route, and a full rebuild of the chart on the way back — for a screen you
// dip into to mount a relic or fuse two. Same trade the Shipyard already
// refused (see ShipyardSheet, whose shape this follows).
//
// SAME COMPONENT, SAME READ. `ShipHero` is mounted unchanged in the same focus
// mode /expeditions/ship and /expeditions/forge use, off `getShipHeroProps` —
// the one query those routes also read — so there is one ship screen with
// three doors rather than three ship screens.
//
// The only thing the sheet changes is the back arrow: on a route it links to
// /expeditions, and here it would sail you off the sea to get out of a sheet,
// so `onBack` closes instead.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ShipHero from '@/app/(app)/expeditions/ShipHero'
import { getShipHeroProps } from '@/app/(app)/expeditions/shipHeroData'

type Props = Awaited<ReturnType<typeof getShipHeroProps>>

export default function ShipSheet({ open, focus, onClose }: {
  open: boolean
  /** Which screen the door asked for. The Gunwharf wants the hull, the Forge
   *  island wants the bench. */
  focus: 'ship' | 'forge'
  onClose: () => void
}) {
  const [state, setState] = useState<Props | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // READ ON EVERY OPEN, not once. Doubloons, fathoms, repairs owed and half the
  // rack change while you sail; a payload kept from the first visit would offer
  // to spend a purse you emptied an hour ago.
  useEffect(() => {
    if (!open) return
    let live = true
    setErr(null)
    getShipHeroProps().then(r => { if (live) setState(r) },
      () => { if (live) setErr('The wharf did not answer. Try again.') })
    return () => { live = false }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    // The map STEERS on click and starts a heading on pointerdown, so every
    // sheet over it needs this or dismissing also puts the helm over.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="fixed left-0 right-0 top-[var(--nav-h)] bottom-[60px] sm:bottom-0"
        style={{ background: '#08121c', zIndex: 112, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {state ? (
          <ShipHero {...state} focus={focus} onBack={onClose} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <p className="font-karla font-600 uppercase tracking-[0.16em]"
              style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf' }}>
              {err ?? (focus === 'forge' ? 'Lighting the forge…' : 'Opening the wharf…')}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
