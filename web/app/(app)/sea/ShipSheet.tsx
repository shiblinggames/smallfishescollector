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
//
// ── THREE LANDINGS, ONE SHELL ───────────────────────────────────────────────
//
// `focus` says which door asked, and all three arrive here because all three
// are ONE server read (`getShipHeroProps`) and one card. The Battle Loadout is
// the newest: it was a page at /expeditions/items and a drawer on the hub, and
// out on the water it is a disc in the HUD row — because what you mount on the
// hull is a between-fights decision, and between fights you are on the sea.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import RoomCard, { HullTurn, ObjectRow } from '@/components/RoomCard'
import { vibrate } from '@/lib/haptics'
import ShipHero from '@/app/(app)/expeditions/ShipHero'
import { getShipHeroProps } from '@/app/(app)/expeditions/shipHeroData'
import { shipTierByName, nextShip as nextHull } from '@/lib/ships'
import { SHIP_SKINS, shipSkinAt } from '@/lib/shipSkins'
import { getRaidItem } from '@/lib/raidItems'
import { getRepairKit } from '@/lib/repairKits'
import { SHIP_CLASS_LINES, getShipClass, type ShipClassId } from '@/lib/shipClasses'
import { getShipAugment } from '@/lib/shipAugments'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier } from '@/lib/expeditions'
import { buyShip } from '@/app/shipyard/actions'

type Props = Awaited<ReturnType<typeof getShipHeroProps>>

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

/** The hull's three rooms. `appearance` keeps ShipHero's own id so the two
 *  cannot drift; the plate calls it Look, which is what it is. */
type Room = 'refits' | 'armament' | 'appearance'

/**
 * HER THREE ROOMS, DRAWN FROM WHAT IS IN THEM.
 *
 * They were three commissioned paintings of a hold, a gun deck and a paint
 * locker. The gun deck of a Sloop and the gun deck of a Man-o-War were the same
 * picture, which is the trouble with a painting: it cannot know what you own.
 *
 * What is in these rooms has art already -- the kit on her deck, the relics on
 * her mounts, the paints in her locker -- so that art is the door. `blurb` is
 * the line for a room with nothing in it yet.
 */
const CARDS: { id: Room; title: string; blurb: string; accent: string }[] = [
  { id: 'refits', title: 'Refits', blurb: 'Berths, armory, repair kit', accent: '#ffd56b' },
  { id: 'armament', title: 'Armament', blurb: "Her class, and the ultimate", accent: '#c084fc' },
  { id: 'appearance', title: 'Look', blurb: 'The colours she flies', accent: '#7ed6c4' },
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
   * it is answering a question you settled by mooring. The LOADOUT disc opens
   * what is mounted on the hull, and nothing about the hull itself.
   *
   * One component because it is one query and one shell; three landings because
   * they are three places.
   */
  focus: 'ship' | 'forge' | 'items'
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
  /** A door that lands IN a room. No plates above it, and no way back to them:
   *  you came through a specific door and the way out is the way in. */
  const roomOnly = focus !== 'ship'

  // ── WHAT IS IN EACH ROOM ────────────────────────────────────────────
  //
  // Read off the same payload the rooms themselves are drawn from, so a door
  // cannot disagree with what is behind it.
  const mounts = raidItemSlotsForTier(tier)
  const mounted = (state?.equippedRaidItems ?? []).filter(id => getRaidItem(id)?.image)
  const kit = getRepairKit(state?.equippedRepairKit ?? 'basic_repair_kit')
  /** The top of each class line she has picked up. Same walk the Armament tile
   *  makes, so the door and the tile name the same classes. */
  const classNames = (() => {
    const owned = new Set(Object.values(state?.shipClasses ?? {}))
    return SHIP_CLASS_LINES
      .map(line => line.filter(id => owned.has(id)) as ShipClassId[])
      .filter(l => l.length > 0)
      .map(l => getShipClass(l[l.length - 1])?.name ?? '')
      .filter(Boolean)
  })()
  const augment = state?.manowarAugment ? getShipAugment(state.manowarAugment) : null
  /** What she looks like RIGHT NOW: the skin she is actually wearing, if it
   *  fits this hull. Null means her own colours. */
  const herPaint = state ? shipSkinAt(state.equippedShipSkin, tier) : null
  /** Her paints: the ones she owns that FIT this hull, as a picture each. A
   *  skin is either its own painting for this tier or a tint of her own. */
  const paints = (() => {
    if (!state) return [] as { src: string; filter: string }[]
    const hull = EXPEDITION_SHIP_STATS[tier]?.image ?? ''
    const own = [{ src: hull, filter: 'none' }]
    for (const id of state.shipSkins) {
      const def = shipSkinAt(id, tier)
      if (!def) continue
      own.push({ src: def.imageByTier?.[tier] ?? hull, filter: def.filter })
    }
    return own
  })()

  function roomNote(id: Room): string | null {
    if (!state || !now) return null
    switch (id) {
      case 'refits':
        return `${now.crewSlots} berths · ${mounted.length} of ${mounts} mounted · ${kit?.name ?? 'no kit'}`
      case 'armament':
        return classNames.length
          ? `${classNames.join(', ')}${augment ? ` · ${augment.name}` : ''}`
          : 'No class yet. Clear a chapter.'
      case 'appearance':
        return `${state.shipSkins.length} of ${SHIP_SKINS.length} paints`
    }
  }

  function roomArt(id: Room) {
    if (!state || !now) return null
    if (id === 'refits') {
      // WHAT IS ACTUALLY BOLTED TO HER: the kit on her deck and the relics on
      // her mounts, with the empty mounts drawn empty. An unfitted ship says so
      // without being told.
      const srcs = [kit?.image, ...mounted.map(i => getRaidItem(i)?.image)].filter(Boolean) as string[]
      return <ObjectRow size={32} accent="#ffd56b" srcs={srcs} empty={Math.max(0, mounts - mounted.length)} />
    }
    if (id === 'armament') {
      // TWO FITTINGS, NOT A THIRD PICTURE OF THE SAME SHIP. Her hull is already
      // the top of this panel and the whole of the Look card; a third one here
      // would make the rack read as one boat drawn three times.
      //
      // What is actually in this room is a class and an ultimate, and neither
      // has art in this game -- they are a star and a bolt on their own tiles.
      // So they get the same mount the relics next door sit in: lit when you
      // have it, an empty socket when you do not, which is the one thing the
      // door has to say.
      const star = (
        <svg key="class" width="54%" height="54%" viewBox="0 0 24 24" fill="none" stroke="#e6ccff"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 2 15 9l7 .5-5.5 4.5L18 21l-6-3.5L6 21l1.5-7L2 9.5 9 9z" />
        </svg>
      )
      const bolt = (
        <svg key="ult" width="54%" height="54%" viewBox="0 0 24 24" fill="none" stroke="#f6dfa0"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      )
      const held = [classNames.length ? star : null, augment ? bolt : null].filter(Boolean)
      return <ObjectRow size={40} accent="#c084fc" glyphs={held} empty={2 - held.length} />
    }
    // The paints, turning over. Her own first, so a captain with none still
    // sees a ship rather than an empty frame.
    return <HullTurn w={136} h={64} every={2600}
      srcs={paints.map(p => p.src)} filters={paints.map(p => p.filter)} />
  }

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
            {room && !roomOnly && (
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
              {focus === 'forge' ? 'The Forge'
                : focus === 'items' ? 'Battle Loadout'
                : room ? TITLES[room] : 'Your Ship'}
            </p>
            {!room && !roomOnly && now && (
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
            ) : focus === 'items' ? (
              // ── WHAT SHE CARRIES INTO A FIGHT ────────────────────────
              //
              // `bare` for the same reasons the other two rooms take it: the
              // painted plate and the navy ground under it belong to a
              // full-screen route, and inside this card they are a second,
              // bluer rectangle in the card's warm base. Its own focus header
              // ("Battle Loadout", with a mounted count) would print directly
              // under the header three lines up that already says it.
              //
              // NOTHING ELSE IS TOUCHED. The slots, the picker, the item
              // sheets, the effects breakdown and the forged rims are
              // ShipHero's and they work; this is a different shell around
              // them, not a second implementation of them.
              <ShipHero {...state} focus="items" boxed bare onBack={onClose} />
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
              {/* ── HER, AND HER NUMBERS, IN ONE BLOCK ───────────────────
                  Two full-width bars before: a strip with her portrait and two
                  thirds of it empty, then a rank of four numbers under it. A
                  ship is a WIDE shape and a stat is a SMALL one, so the four
                  numbers go beside her in a square and the row that was empty
                  is the row that holds them.

                  IN HER OWN PAINT. The plate up here is what she looks like
                  right now, skin and all, so the wardrobe below is a choice
                  against something rather than a catalogue on its own. */}
              <div style={{ display: 'flex', gap: 10, marginBottom: '0.8rem' }}>
                <div style={{
                  flex: '0 0 42%', minWidth: 0, borderRadius: 14, padding: '0.5rem',
                  display: 'grid', placeItems: 'center',
                  background: 'radial-gradient(ellipse 110% 80% at 50% 34%, rgba(240,192,64,0.09) 0%, rgba(7,12,20,0) 70%), rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={herPaint?.imageByTier?.[tier] ?? now.image} alt="" aria-hidden decoding="async" style={{
                    width: '100%', height: 82, objectFit: 'contain',
                    filter: herPaint?.filter && herPaint.filter !== 'none' ? herPaint.filter : undefined,
                  }} />
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ minWidth: 0 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {([
                      ['Hull', now.durability],
                      ['Guns', now.minDamage],
                      ['Speed', now.speed],
                      ['Crew', now.crewSlots],
                    ] as const).map(([k, v]) => (
                      <div key={k} style={{
                        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4,
                        padding: '0.28rem 0.45rem', borderRadius: 9,
                        background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)',
                      }}>
                        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.14em', color: `${SEA},0.5)` }}>{k}</span>
                        <span className="font-cinzel font-800" style={{ fontSize: '0.92rem', color: '#f6dfa0', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
                      padding: '0.5rem 0.7rem', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    {/* WHAT YOU WOULD BE BUYING, in the empty half of the row.
                        This bar was a label, a name and a price with a hand's
                        width of nothing between them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={then.image} alt="" aria-hidden decoding="async" style={{
                      width: 54, height: 34, flexShrink: 0, objectFit: 'contain',
                    }} />
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
                            display: 'block', width: '100%', maxWidth: 210, margin: '0 auto 0.45rem',
                            height: 78, objectFit: 'contain',
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

              {/* ── HER THREE ROOMS, ACROSS ──────────────────────────────
                  They were three wide bars stacked: six hundred pixels of card
                  to say three words, and most of each one empty ground either
                  side of a small picture. Side by side they are a rack of
                  three -- the whole set is one look, and the panel ends on the
                  screen it started on.

                  `auto-fit` rather than a fixed three, because this same card is
                  560px on a desktop and the width of a phone: three across
                  where there is room for three, two and a wrap where there is
                  not, and never a 90px door with a boat in it. */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))',
                gap: '0.55rem',
              }}>
                {CARDS.map((card, i) => (
                  <RoomCard key={card.id}
                    title={card.title}
                    note={roomNote(card.id) ?? card.blurb}
                    accent={card.accent}
                    index={i}
                    onClick={() => setRoom(card.id)}>
                    {roomArt(card.id)}
                  </RoomCard>
                ))}
              </div>

              {/* THE FORGE IS NOT IN HERE, and the relic count belongs to the
                  Refits door, which now says it. What is left is the one thing
                  a captain looking for the forge in this panel needs told. */}
              <p className="font-karla" style={{
                margin: '0.7rem 0 0', fontSize: '0.6rem', color: `${SEA},0.38)`, textAlign: 'center',
              }}>
                The forge is on its own island.
              </p>
            </>)}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}
