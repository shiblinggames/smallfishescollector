'use client'

// ── THE LOADOUT, FROM THE CHART ─────────────────────────────────────────────
//
// What you are fishing with and what you are wearing, openable from the water
// rather than only from inside the fishing overlay.
//
// ── WHY IT DID NOT EXIST ────────────────────────────────────────────────────
//
// It half did. `LoadoutBody` is the Shipyard's own preview and pickers, and it
// has equipped rods, hats, boats, pets and skins for a while — but the only
// door to it was a sheet inside `FishingHere`, which means you could only
// change what you were carrying while you were already carrying it. Wanting to
// swap a hat on the way somewhere meant putting the rod out first.
//
// The expedition half of the chart has had a Loadout disc in its HUD since the
// battle relics shipped, with a note saying the fishing side did not need one
// because "raid relics do not touch a rod". True, and beside the point: the
// fishing side has its own loadout and it is the one a captain changes most.
//
// ── SWAPPING, NOT SHOPPING, AND IT SAYS WHERE THE SHOPS ARE ─────────────────
//
// Nothing here buys anything. That is `LoadoutBody`'s own line and it stands
// (see the note in it): the shops are buildings on islands, and reaching one is
// a sail with a decision in it. A till in the middle of the ocean would undo
// the whole reason the chart is sailed.
//
// What was missing is the other half of that bargain. A locker that only ever
// equips what you own, in a game where most captains own three of six slots,
// is a screen full of empty racks and no sentence about it. So it ends on two
// signposts: where the hull, the rack and the lantern are upgraded, and where
// new rods, reels, lines, hooks and bait are bought. Both point: press one and
// the sheet shuts and the chart lights the way there, the same road the
// campaign draws to its next stop.

import { createPortal } from 'react-dom'
import PopupShell from '@/components/PopupShell'
import SheetBoundary from '@/components/SheetBoundary'
import LoadoutBody from './LoadoutBody'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'

export type GearLook = {
  characterColor: string
  hatId: string | null
  boatId: string | null
  petId: string | null
  petBow: string | null
}

export default function GearSheet({
  open, onClose, rack, activeRod, onRodChange, look, onLookChange,
  reelTier, hookTier, reelName, lineName, hookName, onShowWay,
}: {
  open: boolean
  onClose: () => void
  rack: { tier: number; name: string; slug: string | null; image: string | null; catchZoneBonus: number }[]
  activeRod: number
  onRodChange: (tier: number) => void
  look: GearLook
  onLookChange: (patch: Partial<{ characterColor: string; hatId: string | null; boatId: string | null; petId: string | null }>) => void
  reelTier: number
  hookTier: number
  reelName: string
  lineName: string
  hookName: string
  /** Light the road to a place on the chart and shut the sheet. */
  onShowWay: (placeId: 'shipyard' | 'mainland') => void
}) {
  if (!open || typeof document === 'undefined') return null

  const signpost = (
    place: 'shipyard' | 'mainland',
    title: string,
    what: string,
  ) => (
    <button
      type="button"
      onClick={() => { vibrate(10); onShowWay(place) }}
      className="tap"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0.7rem 0.8rem', borderRadius: 12,
        background: 'rgba(240,192,64,0.07)',
        border: '1px solid rgba(240,192,64,0.26)',
      }}>
      <span aria-hidden style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.34)',
        color: GOLD,
      }}>
        {/* A bearing, not a shop: what the press does is point. */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M15.5 8.5l-2 5.2-5.2 2 2-5.2z" />
        </svg>
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="font-karla font-700" style={{
          display: 'block', fontSize: '0.8rem', color: '#f3e6c2', lineHeight: 1.25,
        }}>{title}</span>
        <span className="font-karla" style={{
          display: 'block', fontSize: '0.72rem', color: 'rgba(240,237,232,0.6)',
          lineHeight: 1.45, marginTop: 1,
        }}>{what}</span>
      </span>
      <span className="font-karla font-700 uppercase" style={{
        flexShrink: 0, fontSize: '0.56rem', letterSpacing: '0.14em', color: `${GOLD}cc`,
      }}>Show me</span>
    </button>
  )

  return createPortal(
    // PopupShell does NOT portal, and the chart steers on click and starts a
    // heading on pointerdown, so a tap meant for this sheet would also put the
    // helm over. Same guard every other sheet on the water uses.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <PopupShell open onClose={onClose}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            // WIDE, like the intro's card (Kong): the picture on the left and
            // the locker on the right from 820px; stacked below that.
            margin: 'auto', width: '100%', maxWidth: 'min(1060px, 100%)',
            // Opaque: it floats over painted, moving water, and a translucent
            // panel over the sea reads as a smear. House rule.
            background: 'linear-gradient(180deg, rgba(14,20,28,0.97) 0%, rgba(8,12,18,0.98) 100%)',
            border: '1px solid rgba(196,169,106,0.3)',
            borderRadius: 20, padding: '1.2rem 1.2rem 1.25rem',
            boxShadow: '0 22px 60px rgba(0,0,0,0.65)',
            maxHeight: 'min(86vh, 100%)', overflowY: 'auto',
            position: 'relative',
          }}>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              position: 'absolute', top: 10, right: 10, zIndex: 2,
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '50%', color: 'rgba(240,237,232,0.7)', cursor: 'pointer',
            }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>

          <p className="font-cinzel font-700" style={{
            fontSize: '1.3rem', color: '#f0ede8', margin: '0 0 0.9rem', paddingRight: 30,
          }}>Your Loadout</p>

          {/* ── AND IT CANNOT TAKE THE CHART WITH IT ────────────────────
              The sea is one client component with a live renderer and an hour
              of session state in it, and anything that throws while it is
              mounted unmounts the lot. A wardrobe is not worth that: see
              components/SheetBoundary. */}
          <SheetBoundary name="Loadout" onClose={onClose}>
            <LoadoutBody
              rack={rack}
              activeRod={activeRod}
              locked={false}
              onPick={onRodChange}
              look={look}
              onLookChange={onLookChange}
              reelTier={reelTier}
              hookTier={hookTier}
              reelName={reelName}
              lineName={lineName}
              hookName={hookName}
              wide
              footer={(
                <>
                  {/* ── AND WHERE THE REST OF IT COMES FROM ─────────────── */}
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.56rem', letterSpacing: '0.16em', color: 'rgba(196,169,106,0.8)',
                    margin: '1.1rem 0 0.5rem',
                  }}>Where to get more</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {signpost('shipyard', 'The Shipyard',
                      'Upgrade the hull, the rod rack, the hold and the lantern.')}
                    {signpost('mainland', 'The Tackle Shop, on the Mainland',
                      'New rods, reels, lines, hooks and bait.')}
                  </div>
                </>
              )}
            />
          </SheetBoundary>
        </div>
      </PopupShell>
    </div>,
    document.body,
  )
}
