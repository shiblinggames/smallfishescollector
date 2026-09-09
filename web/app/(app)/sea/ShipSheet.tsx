'use client'

// ── YOUR SHIP, OVER THE WATER ───────────────────────────────────────────────
//
// "Manage her" at the Gunwharf used to be a `router.push` — off the sea, onto a
// route, and a full rebuild of the chart on the way back — for a screen you dip
// into to buy a refit or change her colours.
//
// ── IT IS THE CHART'S OWN PANEL, NOT A PAGE IN A CARD ───────────────────────
//
// The first pass mounted `ShipHero` whole, which is a PAGE: a hero band, a
// stats hero, a hull upgrade, a strip of three tabs, and a drawer that slides
// over the lot. Opened inside a 560px card that is four headers deep before you
// reach anything, in a visual language from before the sea existed.
//
// So the panel is built here, in the language every other door on this chart
// uses: her stats, the one upgrade this screen exists for, and three painted
// plates. What is BEHIND the plates is still ShipHero's — mounted `bare`, which
// is the tiles and nothing above them — because those tiles open six purchase
// flows that work, and rewriting them to change how a card looks would be
// trading a day of risk for a border radius.
//
// ── AND ONLY THE HULL'S OWN ROOMS ARE IN HERE ───────────────────────────────
//
// The forge is on the Forge island: you sail to a building to use it, and a
// second door from the wharf would make the island scenery. Crew has its own
// painted panel on this HUD. Both were doors here once; both were two doors to
// one room, which is the thing every one of these conversions has been undoing.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { vibrate } from '@/lib/haptics'
import ShipHero from '@/app/(app)/expeditions/ShipHero'
import { getShipHeroProps } from '@/app/(app)/expeditions/shipHeroData'
import { shipTierByName, nextShip as nextHull } from '@/lib/ships'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier } from '@/lib/expeditions'
import { buyShip } from '@/app/shipyard/actions'

type Props = Awaited<ReturnType<typeof getShipHeroProps>>

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

/** The hull's three rooms. `appearance` keeps ShipHero's own id so the two
 *  cannot drift; the plate calls it Look, which is what it is. */
type Room = 'refits' | 'armament' | 'appearance'

const CARDS: { id: Room; title: string; blurb: string; art: string }[] = [
  { id: 'refits', title: 'Refits', blurb: 'Berths, armory, repair kit', art: '/ship/cards/refits.jpg' },
  { id: 'armament', title: 'Armament', blurb: "Her class, and the ultimate", art: '/ship/cards/armament.jpg' },
  { id: 'appearance', title: 'Look', blurb: 'The colours she flies', art: '/ship/cards/look.jpg' },
]

const TITLES: Record<Room, string> = { refits: 'Refits', armament: 'Armament', appearance: 'Look' }

export default function ShipSheet({ open, focus, onClose }: {
  open: boolean
  /**
   * WHICH DOOR ASKED.
   *
   * The Gunwharf opens the ship: her stats, her upgrade, her three rooms. The
   * Forge ISLAND opens the forge and nothing else — you sailed to a specific
   * building, and being handed a panel about your hull with the forge listed on
   * it is answering a question you settled by mooring.
   *
   * One component because it is one query and one shell; two landings because
   * they are two places.
   */
  focus: 'ship' | 'forge'
  onClose: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<Props | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  /** The upgrade is a purchase, so it is armed and then taken — never one tap. */
  const [armed, setArmed] = useState(false)
  const [buying, startBuy] = useTransition()
  const [buyErr, setBuyErr] = useState<string | null>(null)

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

  // Back to the plates every time it shuts.
  useEffect(() => { if (!open) { setRoom(null); setArmed(false); setBuyErr(null) } }, [open])

  const tier = state ? shipTierByName(state.shipStats.name) : 0
  const next = state ? nextHull(tier) : null
  const now = state?.shipStats
  const then = next ? EXPEDITION_SHIP_STATS[tier + 1] : null
  const canBuy = !!next && !!state && state.doubloons >= next.cost
  const forgeOnly = focus === 'forge'

  return (
    // The map STEERS on click and starts a heading on pointerdown, so every
    // panel over it needs this or dismissing also puts the helm over.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <PopupShell open={open} onClose={onClose} zIndex={118}>
        <motion.div
          role="dialog" aria-modal onClick={e => e.stopPropagation()}
          // OPACITY ONLY. The tiles open their own fixed sheets, and a transform
          // on an ancestor makes `position: fixed` resolve against it instead of
          // the viewport — which would drop every one of them into this card.
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
            maxHeight: 'min(84vh, 100%)', display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden',
            background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
            border: '1px solid rgba(196,169,106,0.34)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.65)',
          }}>

          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '1.05rem 1.05rem 0.8rem', paddingRight: 44 }}>
            {room && !forgeOnly && (
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
              {forgeOnly ? 'The Forge' : room ? TITLES[room] : 'Your Ship'}
            </p>
            {!room && !forgeOnly && now && (
              <p className="font-karla font-600" style={{
                fontSize: '0.78rem', color: 'rgba(196,169,106,0.85)', margin: 0, flexShrink: 0,
              }}>{now.name}</p>
            )}
          </div>
          <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 6 }} />

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: '0 1.05rem 1rem' }}>
            {!state || !now ? (
              <p className="font-karla font-600 uppercase tracking-[0.16em]"
                style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf', padding: '2.5rem 0', textAlign: 'center' }}>
                {err ?? 'Opening the wharf…'}
              </p>
            ) : forgeOnly ? (
              // THE ISLAND'S OWN ROOM. No plates above it and no way back to
              // them: this door is the forge, and the way out is the way in.
              //
              // ── AND IT BRINGS NOTHING OF ITS OWN ────────────────────
              // `bare` for the same two reasons the ship's rooms take it. The
              // painted berth plate and the navy ground under it belong to a
              // full-screen route; laid inside this card they are a second,
              // bluer rectangle sitting in the card's warm base, which is the
              // "why is the forge navy" you can see from across the room. And
              // its own focus header prints the forge's name a second time,
              // directly under the header three lines up that already says it.
              <ShipHero {...state} focus="forge" boxed bare onBack={onClose} />
            ) : room ? (
              // THE ROOM ITSELF, tiles only. Everything they open still works
              // because it is still ShipHero doing the opening.
              <ShipHero {...state} focus="ship" boxed bare shipSection={room} onBack={() => setRoom(null)} />
            ) : (<>
              {/* ── HER, AND WHAT SHE IS ─────────────────────────────────
                  The hull's own plate over her numbers. Not a hero band: one
                  strip, the art doing the work a heading would otherwise do. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem',
                padding: '0.6rem 0.7rem', borderRadius: 14,
                background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={now.image} alt="" aria-hidden decoding="async" style={{
                  width: 96, height: 68, flexShrink: 0, objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))',
                }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  {state.shipName && (
                    <p className="font-cinzel font-700" style={{
                      margin: 0, fontSize: '0.95rem', color: '#f4efe4', lineHeight: 1.15,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{state.shipName}</p>
                  )}
                  <p className="font-karla font-700 uppercase" style={{
                    margin: state.shipName ? '2px 0 0' : 0, fontSize: '0.54rem',
                    letterSpacing: '0.16em', color: `${SEA},0.55)`,
                  }}>{now.name}</p>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6,
                marginBottom: '0.9rem',
              }}>
                {([
                  ['Hull', now.durability],
                  ['Guns', now.minDamage],
                  ['Speed', now.speed],
                  ['Crew', now.crewSlots],
                ] as const).map(([k, v]) => (
                  <div key={k} style={{
                    padding: '0.45rem 0.3rem', borderRadius: 11, textAlign: 'center',
                    background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <p className="font-cinzel font-800" style={{ margin: 0, fontSize: '1.05rem', color: '#f6dfa0', fontVariantNumeric: 'tabular-nums' }}>{v}</p>
                    <p className="font-karla font-700 uppercase" style={{ margin: '1px 0 0', fontSize: '0.48rem', letterSpacing: '0.14em', color: `${SEA},0.5)` }}>{k}</p>
                  </div>
                ))}
              </div>

              {/* ── THE UPGRADE, WHICH IS WHY THIS PANEL EXISTS ──────────
                  Armed, then taken. It is the largest purchase in the game and
                  a one-tap buy on the front page of a panel you opened to
                  change a colour is how a captain spends 200,000 by accident. */}
              {next && then ? (
                <div style={{
                  marginBottom: '0.95rem', borderRadius: 14, overflow: 'hidden',
                  background: armed ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${armed ? 'rgba(240,192,64,0.5)' : 'rgba(240,192,64,0.26)'}`,
                }}>
                  <button type="button" className="tap"
                    onClick={() => { vibrate(8); setBuyErr(null); setArmed(a => !a) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '0.65rem 0.75rem', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="font-karla font-800 uppercase" style={{ display: 'block', fontSize: '0.48rem', letterSpacing: '0.18em', color: `${GOLD}cc` }}>
                        Next hull
                      </span>
                      <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '1.02rem', color: '#f4efe4', lineHeight: 1.15, marginTop: 1 }}>
                        {next.name}
                      </span>
                    </span>
                    <span className="font-cinzel font-700" style={{
                      flexShrink: 0, fontSize: '0.92rem', color: canBuy ? GOLD : '#e6a0a0', fontVariantNumeric: 'tabular-nums',
                    }}>{next.cost.toLocaleString()} ⟡</span>
                  </button>

                  <AnimatePresence initial={false}>
                    {armed && (
                      <motion.div key="buy"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '0 0.75rem 0.7rem' }}>
                          {/* AND WHAT SHE LOOKS LIKE. The four numbers say what
                              she is worth and none of them says what you are
                              buying: this is the largest purchase in the game
                              and it was being made off a name and a price. Her
                              own plate, the same art the front page draws the
                              current hull with, so the two can be held against
                              each other. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={then.image} alt="" aria-hidden decoding="async" style={{
                            display: 'block', width: '100%', maxWidth: 260, margin: '0 auto 0.5rem',
                            height: 108, objectFit: 'contain',
                            filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.65))',
                          }} />
                          {/* WHAT THE MONEY BUYS, in the same four numbers she
                              is already described by. A price with no answer to
                              "and then what" is a number to be afraid of. */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: '0.6rem' }}>
                            {([
                              ['Hull', now.durability, then.durability],
                              ['Guns', now.minDamage, then.minDamage],
                              ['Speed', now.speed, then.speed],
                              ['Crew', now.crewSlots, then.crewSlots],
                            ] as const).map(([k, a, b]) => (
                              <div key={k} style={{ textAlign: 'center' }}>
                                <p className="font-karla font-700" style={{ margin: 0, fontSize: '0.68rem', color: b > a ? '#8fdc9a' : `${SEA},0.55)`, fontVariantNumeric: 'tabular-nums' }}>
                                  {a} → {b}
                                </p>
                                <p className="font-karla font-700 uppercase" style={{ margin: '1px 0 0', fontSize: '0.45rem', letterSpacing: '0.14em', color: `${SEA},0.4)` }}>{k}</p>
                              </div>
                            ))}
                          </div>
                          <button type="button" disabled={!canBuy || buying}
                            onClick={() => {
                              if (!canBuy || buying) return
                              vibrate(12)
                              startBuy(async () => {
                                const res = await buyShip()
                                if ('error' in res) { setBuyErr(res.error); return }
                                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                                setArmed(false)
                                const fresh = await getShipHeroProps()
                                setState(fresh)
                                router.refresh()
                              })
                            }}
                            className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                            style={{
                              width: '100%', padding: '0.68rem', borderRadius: 11, fontSize: '0.9rem',
                              color: canBuy ? '#1a1206' : 'rgba(240,237,232,0.45)',
                              background: canBuy ? `linear-gradient(180deg, ${GOLD}, ${GOLD}cc)` : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${canBuy ? GOLD : 'rgba(255,255,255,0.14)'}`,
                              cursor: canBuy && !buying ? 'pointer' : 'default',
                            }}>
                            {buying ? 'Signing her over…'
                              : canBuy ? `Buy the ${next.name}`
                                : `${(next.cost - state.doubloons).toLocaleString()} ⟡ short`}
                          </button>
                          {buyErr && (
                            <p role="alert" className="font-karla font-600" style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#e6a0a0', textAlign: 'center' }}>{buyErr}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <p className="font-karla" style={{
                  margin: '0 0 0.95rem', padding: '0.6rem 0.75rem', borderRadius: 12, fontSize: '0.72rem',
                  color: `${SEA},0.55)`, fontStyle: 'italic',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                }}>The finest hull in the water. Nothing left to buy.</p>
              )}

              {/* ── HER THREE ROOMS ──────────────────────────────────────
                  Stacked, wide: three does not divide into a grid, and a wide
                  plate at this width shows the whole room rather than a crop. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {CARDS.map(card => (
                  <button key={card.id} type="button" className="tap"
                    onClick={() => { vibrate(10); setRoom(card.id) }}
                    style={{
                      position: 'relative', display: 'block', padding: 0, width: '100%',
                      borderRadius: 14, overflow: 'hidden', textAlign: 'left', cursor: 'pointer',
                      background: '#070c14', border: '1px solid rgba(255,255,255,0.1)',
                    }}>
                    <div style={{ position: 'relative', aspectRatio: '16 / 6.6' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.art} alt="" aria-hidden loading="lazy" decoding="async"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%' }} />
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
                          color: 'rgba(214,232,240,0.62)',
                        }}>{card.blurb}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <p className="font-karla" style={{
                margin: '0.85rem 0 0', fontSize: '0.62rem', color: `${SEA},0.4)`, textAlign: 'center', lineHeight: 1.45,
              }}>
                {raidItemSlotsForTier(tier)} relic {raidItemSlotsForTier(tier) === 1 ? 'mount' : 'mounts'} on this hull.
                The forge is on its own island.
              </p>
            </>)}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}
