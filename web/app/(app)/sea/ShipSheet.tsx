'use client'

// ── YOUR SHIP, OVER THE WATER ───────────────────────────────────────────────
//
// Two doors on the chart open this: "Manage her" at the Gunwharf, and mooring
// at the Forge island. Both used to be `router.push` — off the sea, onto a
// route, and a full rebuild of the chart on the way back — for a screen you dip
// into to mount a relic or fuse two.
//
// ── THREE PAINTED DOORS, LIKE THE CREW'S ────────────────────────────────────
//
// This landed on `ShipHero`'s own screen, which is a PAGE: a hero band with the
// hull in it, a row of four stations, and a drawer that slides up over the lot.
// That is the right shape for /expeditions/ship and the wrong one inside a
// panel — you opened a 560px card and got a page's worth of chrome, none of
// which was the thing you came for.
//
// So it opens the way the crew panel opens: three plates of three places aboard
// one ship, painted in the same idiom by the same lamp, and pressing one draws
// that room in the same card with a way back in the header. The rooms are
// `ShipHero`'s own — mounted in the focus mode the two expedition routes
// already use, so there is still ONE ship screen with three doors rather than
// three ship screens.
//
// ── AND CREW IS NOT ONE OF THEM ─────────────────────────────────────────────
//
// The stations row has a fourth, and it is a link to the crew hall. The crew
// has its own painted panel on this HUD with its own four doors; a second way
// in from here would be two doors to one room, which is the thing every one of
// these conversions has been undoing.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { vibrate } from '@/lib/haptics'
import ShipHero from '@/app/(app)/expeditions/ShipHero'
import { getShipHeroProps } from '@/app/(app)/expeditions/shipHeroData'
import { hasForge } from '@/lib/gauntletUpgrades'

type Props = Awaited<ReturnType<typeof getShipHeroProps>>

/** The three rooms, and the plate each one is. */
type Room = 'ship' | 'items' | 'forge'

const CARDS: { id: Room; title: string; blurb: string; art: string }[] = [
  { id: 'ship', title: 'The Hull', blurb: 'Her class, her name, her upgrades', art: '/ship/cards/hull.jpg' },
  { id: 'items', title: 'The Rack', blurb: 'Relics, mounts and the repair kit', art: '/ship/cards/rack.jpg' },
  { id: 'forge', title: 'The Forge', blurb: 'Two relics in, one out', art: '/ship/cards/forge.jpg' },
]

const TITLES: Record<Room, string> = {
  ship: 'The Hull', items: 'The Rack', forge: 'The Forge',
}

export default function ShipSheet({ open, focus, onClose }: {
  open: boolean
  /**
   * WHICH DOOR ASKED.
   *
   * The Forge island opens straight into the forge — you sailed to a specific
   * building and being shown a menu with it on would be asking a question you
   * answered by mooring. The Gunwharf opens on the three plates, because "manage
   * her" is not a room, it is all of them.
   */
  focus: 'ship' | 'forge'
  onClose: () => void
}) {
  const [state, setState] = useState<Props | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)

  // READ ON EVERY OPEN, not once. Doubloons, fathoms and half the rack change
  // while you sail; a payload kept from the first visit would offer to spend a
  // purse you emptied an hour ago.
  useEffect(() => {
    if (!open) return
    let live = true
    setErr(null)
    getShipHeroProps().then(r => { if (live) setState(r) },
      () => { if (live) setErr('The wharf did not answer. Try again.') })
    return () => { live = false }
  }, [open])

  // The forge island lands in the forge; the wharf lands on the plates. Reset on
  // close so re-opening is never a room you have forgotten you were in.
  useEffect(() => { setRoom(open && focus === 'forge' ? 'forge' : null) }, [open, focus])

  const hull = state?.shipStats?.name ?? ''

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
            // The crew panel's base, because this is the crew panel's shape.
            background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
            border: '1px solid rgba(196,169,106,0.34)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.65)',
          }}>

          {/* ── THE HEADER, WHICH KNOWS WHERE YOU ARE ──────────────────
              On the plates it names the ship. Inside a room it names the room
              and carries the way out, so a room is never somewhere you have to
              guess your way back from. */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '1.05rem 1.05rem 0.8rem', paddingRight: 44 }}>
            {room && (
              <button type="button" onClick={() => { vibrate(8); setRoom(null) }} aria-label="Back to the ship"
                className="tap" style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%', padding: 0, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(230,240,246,0.8)',
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            <p className="font-cinzel font-700" style={{ fontSize: '1.26rem', color: '#f4ecd8', margin: 0, flex: 1, minWidth: 0 }}>
              {room ? TITLES[room] : 'Your Ship'}
            </p>
            {!room && hull && (
              <p className="font-karla font-600" style={{
                fontSize: '0.78rem', color: 'rgba(196,169,106,0.85)', margin: 0, flexShrink: 0,
              }}>{hull}</p>
            )}
          </div>
          <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 6 }} />

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
            {!state ? (
              <div style={{ display: 'grid', placeItems: 'center', padding: '3rem 1rem' }}>
                <p className="font-karla font-600 uppercase tracking-[0.16em]"
                  style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf' }}>
                  {err ?? (focus === 'forge' ? 'Lighting the forge…' : 'Opening the wharf…')}
                </p>
              </div>
            ) : room ? (
              <ShipHero {...state} focus={room} boxed onBack={() => setRoom(null)} />
            ) : (
              <div style={{ padding: '0 1.05rem 1rem' }}>
                {/* ── THE DOORS ─────────────────────────────────────────
                    Stacked rather than two abreast: three does not divide into
                    a grid, and a wide plate at this width shows the whole room
                    rather than a crop of one. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {CARDS.map(card => {
                    // THE FORGE CAN BE SHUT, and it says so on the plate rather
                    // than opening a room with a locked sign in it.
                    // The same test ShipHero runs on the same list, so the
                    // plate and the room can never disagree about whether it is
                    // lit.
                    const shut = card.id === 'forge' && !hasForge(state.gauntletUpgrades)
                    return (
                      <button key={card.id} type="button" className="tap"
                        disabled={shut}
                        onClick={() => { if (shut) return; vibrate(10); setRoom(card.id) }}
                        style={{
                          position: 'relative', display: 'block', padding: 0, width: '100%',
                          borderRadius: 14, overflow: 'hidden', textAlign: 'left',
                          cursor: shut ? 'default' : 'pointer',
                          background: '#070c14',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                        <div style={{ position: 'relative', aspectRatio: '16 / 7' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={card.art} alt="" aria-hidden loading="lazy" decoding="async"
                            style={{
                              position: 'absolute', inset: 0, width: '100%', height: '100%',
                              objectFit: 'cover', objectPosition: 'center 38%',
                              filter: shut ? 'grayscale(0.85) brightness(0.45)' : undefined,
                            }} />
                          <div aria-hidden style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(180deg, rgba(4,8,14,0.05) 0%, rgba(4,8,14,0.5) 55%, rgba(4,8,14,0.94) 100%)',
                          }} />
                          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.45rem 0.7rem 0.55rem' }}>
                            <span className="font-cinzel font-700" style={{
                              display: 'block', fontSize: '1.02rem', lineHeight: 1.1, color: '#f6f1e6',
                              textShadow: '0 2px 12px rgba(0,0,0,0.95)',
                            }}>{card.title}</span>
                            <span className="font-karla" style={{
                              display: 'block', fontSize: '0.64rem', lineHeight: 1.3, marginTop: 2,
                              color: shut ? 'rgba(214,232,240,0.45)' : 'rgba(214,232,240,0.62)',
                            }}>{shut ? 'Locked — beat the Quartermaster' : card.blurb}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}

export { AnimatePresence }
