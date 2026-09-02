'use client'

// ── THE SHIPYARD, OVER THE WATER ────────────────────────────────────────────
//
// You moor at its island and the locker opens where you are, like the trawl
// dock, the voyage board and the day's orders already do.
//
// It was a route, and it never needed to be one. What /shipyard renders is
// ALREADY a full-bleed overlay with a close in its corner — the page was a
// backdrop for a thing that covers the backdrop. All being a route bought it
// was a navigation out of the chart and a remount of the entire sea on the way
// back, which for a screen you dip into to swap a hook is the whole cost of
// swapping a hook.
//
// SAME COMPONENT, SAME READ. `ShipyardClient` is mounted unchanged and
// `shipyardState` is the same function the page calls, so there is one
// Shipyard with two doors rather than two Shipyards.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { shipyardState, type ShipyardState } from '@/app/(app)/shipyard/shipyardState'
import ShipyardClient from '@/app/(app)/shipyard/ShipyardClient'

export default function ShipyardSheet({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const [state, setState] = useState<ShipyardState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // READ ON EVERY OPEN, not once. Doubloons, gems and half the locker change
  // while you sail — a payload kept from the first visit would show you a purse
  // you spent an hour ago and offer to spend it again.
  useEffect(() => {
    if (!open) return
    let live = true
    setErr(null)
    shipyardState().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setState(r)
    }, () => { if (live) setErr('The yard did not answer. Try again.') })
    return () => { live = false }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      {state ? (
        <ShipyardClient {...state} onClose={onClose} />
      ) : (
        <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0"
          style={{ background: '#08121c', display: 'grid', placeItems: 'center' }}>
          <p className="font-karla font-600 uppercase tracking-[0.16em]"
            style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf' }}>
            {err ?? 'Opening the locker…'}
          </p>
        </div>
      )}
    </div>,
    document.body,
  )
}
