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
import { vibrate } from '@/lib/haptics'
import ShipHero from '@/app/(app)/expeditions/ShipHero'
import { getShipHeroProps } from '@/app/(app)/expeditions/shipHeroData'
import { shipTierByName, nextShip as nextHull, SHIPS } from '@/lib/ships'
import { SHIP_SKINS, shipSkinAt } from '@/lib/shipSkins'
import { getRaidItem } from '@/lib/raidItems'
import { getRepairKit } from '@/lib/repairKits'
import { SHIP_CLASS_LINES, getShipClass, type ShipClassId } from '@/lib/shipClasses'
import { getShipAugment } from '@/lib/shipAugments'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier } from '@/lib/expeditions'
import { buyShip } from '@/app/shipyard/actions'

type Props = Awaited<ReturnType<typeof getShipHeroProps>>

const GOLD = '#f0c040'
/** The intro's harbour with its dinghy painted out: the water she is drawn on. */
const WHARF_WATER = '/welcome-harbour-open.webp'
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
  { id: 'appearance', title: 'Look', blurb: 'The colors she flies', accent: '#7ed6c4' },
]


export default function ShipSheet({ open, focus, onClose, onOpenBoss }: {
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
  /** A drop source on the forge board names a campaign boss; this opens that
   *  boss's card on the chart. The sheet shuts itself first, since the card
   *  is a sheet too and two of them is a stack. */
  onOpenBoss?: (nodeId: string) => void
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
            position: 'relative', margin: 'auto', width: '100%', maxWidth: focus === 'ship' ? 'min(1060px, 100%)' : 'var(--modal-w)',
            maxHeight: 'min(84vh, 100%)', display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden',
            background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
            border: '1px solid rgba(196,169,106,0.34)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.65)',
          }}>

          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '1.05rem 1.05rem 0.8rem', paddingRight: 44 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.26rem', color: '#f4ecd8', margin: 0, flex: 1, minWidth: 0 }}>
              {focus === 'forge' ? 'The Forge'
                : focus === 'items' ? 'Battle Loadout'
                : 'Your Ship'}
            </p>
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
              <ShipHero {...state} focus="forge" boxed bare onBack={onClose}
                onOpenBoss={onOpenBoss ? id => { onClose(); onOpenBoss(id) } : undefined} />
            ) : (
              // ── THE WHARF, RE-LAID (Kong, 2026-09-24: the Gunwharf pages
              // felt outdated) ───────────────────────────────────────────────
              // Her large on the water on the left with her four numbers; on
              // the right four tabs, HULL (the whole ladder of hulls and the
              // armed buy) and her three rooms, instead of three plates you
              // opened and backed out of. The rooms are still ShipHero's tiles,
              // untouched: every flow behind them works as it did.
              <div className="wharf-host"><div className="wharf-grid">
                <div className="wharf-stage">
                  <div style={{
                    position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '16 / 10',
                    background: `url(${WHARF_WATER}) 40% 62% / cover no-repeat, #0d1e2b`,
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,12,18,0) 45%, rgba(8,12,18,0.55) 100%)' }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={herPaint?.imageByTier?.[tier] ?? SHIPS.find(sh => sh.tier === tier)?.seaImageUrl ?? now.image} alt="" aria-hidden decoding="async" style={{
                      position: 'absolute', left: '8%', right: '8%', bottom: '6%', width: '84%', height: '82%', objectFit: 'contain',
                      filter: `drop-shadow(0 14px 18px rgba(0,0,0,0.45))${herPaint?.filter && herPaint.filter !== 'none' ? ` ${herPaint.filter}` : ''}`,
                    }} />
                    <div style={{ position: 'absolute', left: 14, bottom: 10, right: 14 }}>
                      {state.shipName && (
                        <p className="font-pirata" style={{ margin: 0, fontSize: '1.6rem', color: '#f6ead0', lineHeight: 1, textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>{state.shipName}</p>
                      )}
                      <p className="font-karla font-800 uppercase" style={{ margin: '3px 0 0', fontSize: '0.6rem', letterSpacing: '0.18em', color: 'rgba(240,220,170,0.85)', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>{now.name}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
                    {([['Hull', now.durability], ['Guns', now.minDamage], ['Speed', now.speed], ['Crew', now.crewSlots]] as const).map(([k, v]) => (
                      <div key={k} style={{ padding: '0.5rem 0.4rem', borderRadius: 11, textAlign: 'center', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="font-cinzel font-800" style={{ margin: 0, fontSize: '1.15rem', color: '#f6dfa0', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{v}</p>
                        <p className="font-karla font-700 uppercase" style={{ margin: '4px 0 0', fontSize: '0.54rem', letterSpacing: '0.14em', color: `${SEA},0.55)` }}>{k}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5, padding: 4, borderRadius: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {([['hull', 'Hull', GOLD], ...CARDS.map(c => [c.id, c.title, c.accent] as const)] as const).map(([id, label, accent]) => {
                      const on = (room ?? 'hull') === id
                      return (
                        <button key={id} type="button" role="tab" aria-selected={on}
                          onClick={() => { vibrate(5); setRoom(id === 'hull' ? null : id as Room) }}
                          className="font-karla font-800 uppercase tap"
                          style={{
                            padding: '0.55rem 0.2rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.64rem', letterSpacing: '0.12em',
                            background: on ? `${accent}22` : 'transparent', border: `1px solid ${on ? `${accent}99` : 'transparent'}`,
                            color: on ? '#f6efe0' : `${SEA},0.6)`,
                          }}>{label}</button>
                      )
                    })}
                  </div>

                  {room ? (
                    <div style={{ marginTop: 10 }}>
                      <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: `${SEA},0.6)`, margin: '0 0 8px' }}>{roomNote(room) ?? ''}</p>
                      <ShipHero {...state} focus="ship" boxed bare shipSection={room} onBack={() => setRoom(null)} />
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
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
                                      color: canBuy ? '#fff4d6' : 'rgba(240,237,232,0.45)',
                                      // Tinted, not a solid gold slab (house rule), like the Shipyard's.
                                      background: canBuy ? 'linear-gradient(180deg, rgba(240,192,64,0.32), rgba(240,192,64,0.14))' : 'rgba(255,255,255,0.06)',
                                      boxShadow: canBuy ? '0 0 18px rgba(240,192,64,0.18), inset 0 1px 0 rgba(255,255,255,0.14)' : 'none',
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

                      {/* ── EVERY HULL, IN ORDER ── owned ticked, the next lit. */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {SHIPS.map(sh => {
                          const st = EXPEDITION_SHIP_STATS[sh.tier]
                          const owned = sh.tier <= tier
                          const isNext = sh.tier === tier + 1
                          return (
                            <div key={sh.tier} style={{
                              display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', alignItems: 'center', gap: 10,
                              padding: '0.45rem 0.6rem', borderRadius: 12,
                              background: isNext ? 'rgba(240,192,64,0.08)' : sh.tier === tier ? 'rgba(127,214,160,0.06)' : 'rgba(255,255,255,0.025)',
                              border: `1px solid ${isNext ? 'rgba(240,192,64,0.45)' : sh.tier === tier ? 'rgba(127,214,160,0.35)' : 'rgba(255,255,255,0.06)'}`,
                              opacity: owned || isNext ? 1 : 0.62,
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={sh.seaImageUrl ?? sh.imageUrl} alt="" aria-hidden loading="lazy" decoding="async" style={{ width: 64, height: 40, objectFit: 'contain' }} />
                              <div style={{ minWidth: 0 }}>
                                <p className="font-cinzel font-700" style={{ margin: 0, fontSize: '0.9rem', color: '#f2ead8', lineHeight: 1.15 }}>{sh.name}</p>
                                {st && (
                                  <p className="font-karla font-700" style={{ margin: '2px 0 0', fontSize: '0.62rem', color: `${SEA},0.6)`, fontVariantNumeric: 'tabular-nums' }}>
                                    Hull {st.durability} · Guns {st.minDamage} · Speed {st.speed} · Crew {st.crewSlots}
                                  </p>
                                )}
                              </div>
                              <span className="font-karla font-800" style={{ fontSize: '0.66rem', letterSpacing: '0.06em', color: sh.tier === tier ? '#9fe8bd' : owned ? `${SEA},0.55)` : isNext ? GOLD : 'rgba(240,192,64,0.6)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                {sh.tier === tier ? 'Sailing her' : owned ? 'Owned' : sh.cost === 0 ? 'Free' : `${sh.cost.toLocaleString()} ⟡`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <p className="font-karla" style={{ margin: '0.7rem 0 0', fontSize: '0.62rem', color: `${SEA},0.4)`, textAlign: 'center' }}>
                        The forge is on its own island.
                      </p>
                    </div>
                  )}
                </div>
              </div></div>
            )}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}
