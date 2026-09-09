'use client'

// ── THE SHIP SCREEN, AS A PANEL OVER THE WATER ──────────────────────────────
//
// Two doors on the chart open this: "Manage her" at the Gunwharf, and mooring
// at the Forge island. Both used to be `router.push` — off the sea, onto a
// route, and a full rebuild of the chart on the way back — for a screen you dip
// into to mount a relic or fuse two.
//
// ── AND IT IS A MODAL NOW, NOT A TAKEOVER ───────────────────────────────────
//
// It was a full-bleed sheet: top of the window to the bottom, edge to edge,
// which is a page wearing a portal's clothes. Everything else this chart opens
// is a panel at `--modal-w` — the crew, the campaign, the levels, the toll —
// and one screen taking the whole window said it was a different KIND of thing
// than the others when it is exactly the same kind: a thing you look at for a
// minute while your boat sits where you left it.
//
// You can see the sea around it now, which is the point of every one of these.
//
// SAME COMPONENT, SAME READ. `ShipHero` is mounted unchanged in the same focus
// mode /expeditions/ship and /expeditions/forge use, off `getShipHeroProps` —
// the one query those routes also read — so there is one ship screen with three
// doors rather than three ship screens. `boxed` is the single concession: focus
// mode sizes the panel to fill a window, and in here it sizes to its content.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
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

  return (
    // The map STEERS on click and starts a heading on pointerdown, so every
    // panel over it needs this or dismissing also puts the helm over.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <PopupShell open={open} onClose={onClose} zIndex={118}>
        <motion.div
          role="dialog" aria-modal onClick={e => e.stopPropagation()}
          // OPACITY ONLY. ShipHero opens its own fixed sheets — the stat
          // explainers, the upgrade confirms — and a transform on an ancestor
          // makes `position: fixed` resolve against that ancestor instead of
          // the viewport, which would drop every one of them into this card.
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
            maxHeight: 'min(84vh, 100%)', display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden',
            // AN OPAQUE BASE, like every panel that floats over painted water.
            background: '#08121c',
            border: '1px solid rgba(196,169,106,0.3)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.65)',
          }}>
          <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 6 }} />
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
            {state ? (
              <ShipHero {...state} focus={focus} boxed onBack={onClose} />
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', padding: '3rem 1rem' }}>
                <p className="font-karla font-600 uppercase tracking-[0.16em]"
                  style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf' }}>
                  {err ?? (focus === 'forge' ? 'Lighting the forge…' : 'Opening the wharf…')}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}
