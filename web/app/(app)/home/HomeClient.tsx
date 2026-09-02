'use client'

// THE HOMESTEAD, from the inside.
//
// Four rooms behind one header, the same shape the Almanac already uses,
// because they are the same kind of thing: a set of places that read too
// differently to be sections of one long page.
//
//   The island   the six build spots, and what stands on each
//   Inside       the furniture slots the house has room for
//   The gallery  every badge, hung
//   The stones   where the portal will put you, if it is up
//
// The ALMANAC is not a fifth room. It is the fishing screen's own component,
// mounted here unchanged — the plan is for /fishing to retire, and the bestiary
// needs somewhere to live that is not a screen that is going away.

import { memo, useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Almanac from '../fishing/Almanac'
import { BADGE_MAP } from '@/lib/badges'
import { ISLES } from '@/lib/seaIsles'
import { vibrate } from '@/lib/haptics'
import {
  HOUSE, FURNITURE, PINNED_MAX,
  builtAt, nextBuild, openSlots, furnishingIn, homeBuildings, houseTier, offers,
  type Homestead, type FurnitureSlot,
} from '@/lib/homestead'
import { build, furnish } from './actions'
import RoomView from './RoomView'

// TWO TABS, DOWN FROM FOUR. "The stones" went with the duplicate portal and the
// gallery moved indoors — it is a room where things hang on walls, which is a
// room and not a building. What is left is the island and the inside of it, and
// the island tab is now one card: see HOUSE in lib/homestead.
type Room = 'island' | 'inside'

const GOLD = '#f0c464'

export default function HomeClient({
  homestead: initial, doubloons: initialCoin, unlocked, stamps, pets, species, giants, guest = null,
}: {
  homestead: Homestead
  /**
   * WHOSE HOMESTEAD THIS IS, when it is not yours.
   *
   * Set means READ ONLY, and read only means the controls are ABSENT rather
   * than disabled. A row of greyed-out Build buttons on somebody else's island
   * is a page inviting you to do something it will refuse, and every one of
   * those buttons would need its own server-side no anyway.
   */
  guest?: string | null
  doubloons: number
  unlocked: string[]
  stamps: Record<string, string | null>
  /** Every pet owned, for the menagerie. */
  pets: string[]
  /** Species logged and the total, for the gallery. */
  species: { logged: number; total: number }
  /** Ancient giants landed, for the trophy room. */
  giants: { name: string; art: string }[]
}) {
  const router = useRouter()
  const [home, setHome] = useState(initial)
  const [coin, setCoin] = useState(initialCoin)
  const [room, setRoom] = useState<Room>('island')
  /** Drag mode for the island plan. Off by default: the common visit is to
   *  look at the place, not to redecorate it. */
  const [almanac, setAlmanac] = useState(false)
  const [busy, startBusy] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  /** What is being confirmed. Everything here is permanent and most of it is
   *  six figures, so nothing is one tap. */
  const [confirm, setConfirm] = useState<
    { kind: 'build' } | { kind: 'furnish'; id: string } | null>(null)

  const say = useCallback((msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(n => (n === msg ? null : n)), 3200)
  }, [])

  const doBuild = useCallback(() => {
    startBusy(async () => {
      const r = await build()
      setConfirm(null)
      if (!r.ok) { say(r.error); return }
      setHome(r.homestead)
      setCoin(c => c - r.spent)
      vibrate(18)
      say(`${r.built} is up.`)
      // The island out on the chart is different now. Nothing else on this page
      // reads from the server, so this is the only refresh needed.
      router.refresh()
    })
  }, [router, say])

  const doFurnish = useCallback((id: string) => {
    startBusy(async () => {
      const r = await furnish(id)
      setConfirm(null)
      if (!r.ok) { say(r.error); return }
      setHome(r.homestead)
      setCoin(c => c - r.spent)
      vibrate(12)
      say(r.spent > 0 ? `${r.built}, bought and placed.` : `${r.built}, back out.`)
    })
  }, [say])

  const slots = openSlots(home)
  const standing = homeBuildings(home)

  return (
    <div style={{ position: 'relative' }}>
      {/* ── THE GROUND THIS PAGE STANDS ON ─────────────────────────────
          It was `min-h-full` with the gradient on the content, and `min-height:
          100%` resolves against a parent that has no height of its own — so on
          a short page the blue stopped where the words did and the app's black
          showed under it.

          A FIXED layer instead. It is exactly the viewport, always, whatever the
          content does, and it cannot introduce a scrollbar the way a 100dvh
          block under a nav bar would. `zIndex: -1` puts it behind the page and
          behind the nav, and above the body's own background, which is the one
          slot it needs to be in. */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: -1,
        background: 'radial-gradient(ellipse 120% 90% at 50% 0%, #1b2436 0%, #101725 55%, #080d16 100%)',
      }} />
      {/* ── THE SHORTHAND WAS EATING THE MARGINS ──────────────────────
          `.page-col` carries `padding-inline: 1rem`, stepping to 1.5rem on a
          wider screen — that is the whole reason to use it. This set `padding:
          '1rem 0 4rem'`, and a SHORTHAND writes all four sides, so an inline
          style beat the class and set the horizontal padding to zero. Every
          card and every line of text on the homestead ran to the glass.
          Long-hand top and bottom only, so the column keeps its own sides. */}
      <div className="page-col" style={{ paddingTop: '1rem', paddingBottom: '4rem' }}>

        {/* ── THE HEADER ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.16em', color: 'rgba(180,214,232,0.7)', margin: 0,
            }}>{guest ? `${guest}'s Homestead` : 'The Homestead'}</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.6rem', color: '#f2ead8', margin: '0.1rem 0 0',
            }}>{builtAt(home).name}</p>
            <p className="font-karla" style={{
              fontSize: '0.86rem', color: 'rgba(196,214,228,0.7)', margin: '0.15rem 0 0',
            }}>{builtAt(home).blurb}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {!guest && (
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: GOLD, margin: 0 }}>
                ⟡ {coin.toLocaleString()}
              </p>
            )}
            {guest && (
              <button type="button" onClick={() => router.push('/home')}
                className="font-karla font-700"
                style={{
                  padding: '0.38rem 0.8rem', borderRadius: 999, fontSize: '0.8rem',
                  color: 'rgba(226,238,246,0.9)', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', flexShrink: 0,
                }}>Yours</button>
            )}
            {/* OUT, in the same corner every surface reached from the sea puts it. */}
            <button type="button" onClick={() => router.push('/sea')} aria-label="Back to the water" title="Back to the water"
              style={{
                width: 32, height: 32, borderRadius: '50%', padding: 0, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* ── THE ROOMS ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {/* THE GALLERY IS NOT A TAB. It is a room, reached with the arrows
              inside — see RoomView. */}
          {([['island', 'The island'], ['inside', 'Inside']] as const)
            .map(([id, label]) => (
              <button key={id} type="button" onClick={() => { vibrate(6); setRoom(id) }}
                className="font-karla font-700"
                style={{
                  padding: '0.44rem 0.9rem', borderRadius: 999, fontSize: '0.82rem', cursor: 'pointer',
                  color: room === id ? '#0d1520' : 'rgba(214,232,240,0.82)',
                  background: room === id ? GOLD : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${room === id ? GOLD : 'rgba(255,255,255,0.14)'}`,
                }}>{label}</button>
            ))}
          {!guest && <button type="button" onClick={() => { vibrate(6); setAlmanac(true) }}
            className="font-karla font-700"
            style={{
              padding: '0.44rem 0.9rem', borderRadius: 999, fontSize: '0.82rem', cursor: 'pointer',
              color: 'rgba(214,232,240,0.82)', background: 'rgba(167,139,250,0.14)',
              border: '1px solid rgba(167,139,250,0.4)',
            }}>The Almanac</button>}
        </div>

        {/* ── THE ISLAND ROOM ───────────────────────────────────────── */}
        {room === 'island' && (
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {/* ONE CARD, BECAUSE THERE IS ONE THING TO BUY.
                There were three: the house, then a "rest of the island" heading
                over a plot and a lighthouse. Two of those bought nothing but a
                sprite in a fixed position, and the three of them together never
                looked like one place. What upgrading buys now is the whole
                island, so there is one offer and it is the page. */}
            <HouseCard home={home} coin={coin} busy={busy} guest={guest}
              onBuy={() => setConfirm({ kind: 'build' })} />
          </div>
        )}

        {/* ── INSIDE ────────────────────────────────────────────────── */}
        {room === 'inside' && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <RoomView home={home} unlocked={unlocked} pets={pets}
              species={species} giants={giants} guest={guest} />
            {!guest && (
              <p className="font-karla" style={{
                fontSize: '0.8rem', color: 'rgba(196,214,228,0.66)', margin: 0,
              }}>
                Everything below goes in that room. Nothing in here does anything
                except look like something.
              </p>
            )}
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(196,214,228,0.7)', margin: 0 }}>
              {guest
                ? `${builtAt(home).name}, with ${slots.length} of ${FURNITURE.length} slots in use.`
                : `${builtAt(home).name} has room for ${slots.length} of ${FURNITURE.length}. Build the house up for the rest. Nothing in here does anything.`}
            </p>
            {FURNITURE.map(f => {
              const open = slots.includes(f.slot)
              const here = furnishingIn(home, f.slot)
              return (
                <div key={f.slot} style={{
                  borderRadius: 14, padding: '0.85rem 0.95rem',
                  background: open ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)',
                  border: '1px solid rgba(180,214,232,0.14)',
                  opacity: open ? 1 : 0.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <p className="font-karla font-700 uppercase" style={{
                      fontSize: '0.58rem', letterSpacing: '0.16em', color: 'rgba(180,214,232,0.62)', margin: 0,
                    }}>{f.label}</p>
                    {!open && <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(214,176,176,0.7)', margin: 0 }}>
                      No room yet
                    </p>}
                  </div>
                  {guest ? (
                    // What is actually in the slot, and nothing to press.
                    <p className="font-karla" style={{
                      fontSize: '0.86rem', color: 'rgba(226,238,246,0.86)', margin: '0.3rem 0 0',
                    }}>{here.name}</p>
                  ) : (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {f.options.map(o => {
                      const on = here.id === o.id
                      // SALVAGE IS NOT "FREE". It costs 0 because it has no
                      // price at all, so the plain `cost === 0` test would have
                      // read the six best pieces in the game as gifts.
                      const held = home.owned.includes(o.id)
                      const locked = !!o.found && !held
                      const paid = held || (o.cost === 0 && !o.found)
                      const fromIsle = o.found
                        ? ISLES.find(i => i.id === o.found!.isle)?.name ?? 'somewhere far out'
                        : null
                      return (
                        <button key={o.id} type="button"
                          disabled={!open || busy || on || locked || (!paid && coin < o.cost)}
                          onClick={() => { vibrate(6); paid ? doFurnish(o.id) : setConfirm({ kind: 'furnish', id: o.id }) }}
                          className="font-karla font-700"
                          style={{
                            width: 104, padding: '0.45rem 0.4rem', borderRadius: 10,
                            fontSize: '0.76rem', textAlign: 'center',
                            color: on ? '#0d1520' : 'rgba(226,238,246,0.86)',
                            background: on ? GOLD : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${on ? GOLD : locked ? 'rgba(150,206,172,0.32)' : 'rgba(255,255,255,0.14)'}`,
                            cursor: !open || on || locked ? 'default' : 'pointer',
                            opacity: locked ? 0.72 : 1,
                          }}>
                          {/* THE THING ITSELF, and big enough to judge. Choosing
                              a rug by reading the words "Kelp weave" is choosing
                              blind, and every one of these is bought for how it
                              looks. */}
                          <span style={{
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            height: 62, marginBottom: 4,
                            background: on
                              ? 'radial-gradient(ellipse at 50% 92%, rgba(13,21,32,0.22) 0%, transparent 72%)'
                              : 'radial-gradient(ellipse at 50% 92%, rgba(255,255,255,0.06) 0%, transparent 72%)',
                            borderRadius: 8,
                          }}>
                            {o.art ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={o.art} alt="" draggable={false} style={{
                                maxHeight: 58, maxWidth: '100%', objectFit: 'contain',
                                // SHOWN, not hidden behind a question mark. You
                                // are meant to want it — a silhouette says
                                // "locked", the thing itself says "go and get
                                // it", and only one of those is a reason to
                                // sail to the Ancient Deep.
                                filter: locked
                                  ? 'drop-shadow(0 3px 6px rgba(0,0,0,0.4)) grayscale(0.55) brightness(0.86)'
                                  : 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
                              }} />
                            ) : (
                              <span style={{ fontSize: '0.7rem', opacity: 0.5, alignSelf: 'center' }}>nothing</span>
                            )}
                          </span>
                          {o.name}
                          <span style={{
                            display: 'block', fontSize: '0.7rem', opacity: 0.85,
                            color: locked ? 'rgba(150,206,172,0.95)' : undefined,
                          }}>
                            {on ? 'in the room'
                              : locked ? `found on ${fromIsle}`
                              : held && o.found ? 'salvaged · place it'
                              : paid ? 'owned · place it'
                              : `⟡ ${o.cost.toLocaleString()}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* THE GALLERY AND THE STONES BOTH LEFT THIS LEVEL. The gallery is a
            room you walk to with the arrows inside; the stones were a second
            portal and are deleted outright. See RoomView and lib/seaPortal. */}
      </div>

      {/* ── CONFIRM. Everything here is permanent and most of it is six
          figures, so nothing on this page is one tap. ────────────────── */}
      <AnimatePresence>
        {confirm && (
          <ConfirmBuy
            confirm={confirm} home={home} coin={coin}
            onCancel={() => setConfirm(null)}
            onYes={() => confirm.kind === 'build' ? doBuild() : doFurnish(confirm.id)}
            busy={busy}
          />
        )}
      </AnimatePresence>

      {/* A line that says what happened. Never blocks a tap. */}
      <AnimatePresence>
        {note && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 86, zIndex: 60,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 1rem',
            }}>
            <p className="font-karla font-700" style={{
              margin: 0, padding: '0.5rem 0.95rem', borderRadius: 999, fontSize: '0.84rem',
              color: '#e8f0f6', background: 'rgba(10,18,26,0.94)',
              border: '1px solid rgba(180,214,232,0.28)',
            }}>{note}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <Almanac open={almanac} onClose={() => setAlmanac(false)} />
    </div>
  )
}

/**
 * ONE BUILD SPOT, AS A PICTURE.
 *
 * ── WHY THIS IS NOT A ROW OF TEXT ───────────────────────────────────────────
 *
 * It was: a name, a blurb, a name again, a price, a note. Five lines of prose
 * for something whose entire value is what it LOOKS like, and no way to tell
 * before paying whether "A gallery hall" was a shed or a colonnade. Everything
 * on this island is bought for its appearance, so the appearance is the offer
 * and the words are the caption.
 *
 * So: what stands there now, an arrow, and what would stand there instead —
 * both drawn, at a size where you can see the difference. The price sits under
 * the thing you are buying rather than at the end of a sentence.
 *
 * `lead` is the house. It gets a bigger frame and says out loud what upgrading
 * actually does, because it is the only spot on the island that changes
 * anything other than the view.
 */
const HouseCard = memo(function HouseCard({ home, coin, busy, guest, onBuy }: {
  home: Homestead
  coin: number
  busy: boolean
  guest: string | null
  onBuy: () => void
}) {
  const now = builtAt(home)
  const next = nextBuild(home)
  const afford = !!next && coin >= next.cost
  const has = offers(houseTier(home))

  return (
    <div style={{
      borderRadius: 16, padding: '1rem',
      background: 'rgba(240,196,100,0.06)',
      border: '1px solid rgba(240,196,100,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.58rem', letterSpacing: '0.16em', margin: 0,
          color: 'rgba(240,196,100,0.85)',
        }}>The homestead</p>
        <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(180,214,232,0.5)', margin: 0 }}>
          {houseTier(home)} of {HOUSE.length - 1}
        </p>
      </div>

      {/* ── WHAT YOU HAVE, BIG ──────────────────────────────────────
          It used to be two thumbnails side by side with an arrow, at 132px
          tall, each capped to 92% of half a card. The paintings are 900 wide
          and 578 tall and they had nowhere to go, so the homestead you own
          appeared as a stamp with its ground clipped off the bottom.

          One picture, at the plate's own aspect, contained. What you would get
          instead belongs in the confirm step, where you are actually deciding —
          not shrunk to a chip beside the thing you already have. */}
      <Plate art={now.art} />

      <p className="font-cinzel font-700" style={{
        fontSize: '1.05rem', color: '#f2ead8', margin: '0.6rem 0 0',
      }}>{now.name}</p>
      <p className="font-karla" style={{
        fontSize: '0.85rem', lineHeight: 1.45,
        color: 'rgba(206,222,234,0.72)', margin: '0.15rem 0 0',
      }}>{now.blurb}</p>

      {/* ── WHAT THIS HOME OFFERS ───────────────────────────────────
          The ladder used to sell itself on a name and a picture, which is fine
          for a cottage and useless for a 2.4M one: "The Estate" does not tell
          anybody that it opens the trophy room. Every rung buys three separate
          things and none of them were written anywhere before you paid. */}
      <div style={{
        display: 'grid', gap: 6, marginTop: '0.8rem', paddingTop: '0.7rem',
        borderTop: '1px solid rgba(240,196,100,0.18)',
      }}>
        <Offer label="Rooms" value={has.rooms.map(r => r.name.replace(/^The /, '')).join(', ')} />
        <Offer label="Furniture" value={`${has.slots} of ${FURNITURE.length} slots`} />
        <Offer label="On the island"
          value={has.island.length ? has.island.join(' ') : 'A fire ring and whatever washed up.'} />
      </div>

      {guest ? null : next ? (
        <button type="button" disabled={busy || !afford} onClick={() => { vibrate(8); onBuy() }}
          className="font-cinzel font-700"
          style={{
            width: '100%', marginTop: '0.9rem',
            padding: '0.66rem', borderRadius: 12,
            fontSize: '1rem',
            color: afford ? '#0d1520' : 'rgba(210,180,180,0.8)',
            background: afford ? GOLD : 'rgba(255,255,255,0.06)',
            border: `1px solid ${afford ? GOLD : 'rgba(255,255,255,0.14)'}`,
            cursor: busy || !afford ? 'default' : 'pointer',
          }}>
          {afford
            ? `Build ${next.name} · ⟡ ${next.cost.toLocaleString()}`
            : `Need ⟡ ${next.cost.toLocaleString()}`}
        </button>
      ) : (
        <p className="font-karla font-700" style={{
          fontSize: '0.8rem', color: 'rgba(150,206,172,0.8)', margin: '0.7rem 0 0',
        }}>Finished. There is nothing left to build out here.</p>
      )}
    </div>
  )
})

/**
 * THE HOMESTEAD, AT THE SIZE IT WAS PAINTED.
 *
 * A fixed aspect box with the plate CONTAINED in it, so a painting whose ground
 * runs to the bottom edge keeps its ground. `cover` would fill the box more
 * pleasingly and crop exactly the part that matters, which is what the old
 * fixed-height thumbnails were effectively doing.
 */
function Plate({ art, dim }: { art: string; dim?: boolean }) {
  return (
    <div style={{
      marginTop: 10, borderRadius: 12, overflow: 'hidden',
      aspectRatio: '900 / 578',
      // A HINT OF SEA AND LAND BEHIND IT, because these are cut-outs with no
      // background of their own and a painting of an island floating on a card
      // reads as an asset rather than a place.
      background: 'radial-gradient(ellipse 70% 60% at 50% 78%,'
        + ' rgba(122,152,96,0.22) 0%, rgba(52,96,120,0.18) 55%, rgba(20,40,58,0.1) 100%)',
      border: '1px solid rgba(180,214,232,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" draggable={false} style={{
        width: '100%', height: '100%', objectFit: 'contain', display: 'block',
        filter: dim
          ? 'drop-shadow(0 6px 14px rgba(0,0,0,0.5)) grayscale(0.5) brightness(0.7)'
          : 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))',
      }} />
    </div>
  )
}

/** One line of what a house gives you: a quiet label and the thing itself. */
function Offer({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <span className="font-karla font-700 uppercase" style={{
        fontSize: '0.56rem', letterSpacing: '0.14em', color: 'rgba(180,214,232,0.5)',
        minWidth: 82, flexShrink: 0,
      }}>{label}</span>
      <span className="font-karla" style={{
        fontSize: '0.82rem', lineHeight: 1.4, color: 'rgba(214,228,238,0.86)',
      }}>{value}</span>
    </div>
  )
}

// Stand LIVED HERE: a fixed-height thumbnail with a name under it, from when
// the card showed now and next side by side. Replaced by Plate, which keeps
// the painting's own aspect instead of squeezing it into 132 pixels.

// TheRoom LIVED HERE. Replaced by RoomView, which draws four rooms instead of
// one and steps between them.

// PortalRow AND Gallery LIVED HERE. The portal was a duplicate of the one on
// the water; the gallery is a room inside now. See RoomView.

/**
 * THE SECOND LOOK.
 *
 * Every purchase on this island is permanent and the top of the ladder is 2.4M,
 * so nothing here is one tap. This is the step where you find out what you are
 * actually buying, which is why it carries the PICTURE of the next homestead and
 * a plain list of what changes — not a name, a price and a shrug.
 *
 * The furnishing case is deliberately lighter. A rug is a rug and the room
 * behind it already showed you the difference.
 */
function ConfirmBuy({ confirm, home, coin, onCancel, onYes, busy }: {
  confirm: { kind: 'build' } | { kind: 'furnish'; id: string }
  home: Homestead; coin: number; onCancel: () => void; onYes: () => void; busy: boolean
}) {
  const build = confirm.kind === 'build' ? nextBuild(home) : null
  const target = confirm.kind === 'build'
    ? build
    : FURNITURE.flatMap(f => f.options).find(o => o.id === confirm.id) ?? null
  if (!target) return null
  const cost = target.cost

  // WHAT ACTUALLY CHANGES, as the difference between the two rungs rather than
  // a sentence somebody remembered to write. A room that opens, a slot that
  // opens, and whatever gets built on the island.
  const tier = houseTier(home)
  const gains = build ? (() => {
    const before = offers(tier), after = offers(tier + 1)
    const room = after.rooms.find(r => !before.rooms.includes(r))
    const out: string[] = []
    if (room) out.push(`${room.name} opens. ${room.blurb}`)
    if (after.slots > before.slots) {
      out.push(`Furniture slot ${after.slots} of ${FURNITURE.length}: ${FURNITURE[after.slots - 1].label.toLowerCase()}.`)
    }
    if (build.adds) out.push(build.adds)
    return out
  })() : []

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(3,8,14,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}>
      <motion.div
        initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, borderRadius: 18, padding: '1.15rem',
          // SCROLLS IF IT HAS TO. The build case carries a picture and three
          // lines of gains, which on a short phone in landscape is taller than
          // the viewport, and a confirm button you cannot reach is a trap.
          maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto',
          background: 'rgba(10,16,22,0.98)', border: '1px solid rgba(180,214,232,0.28)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.6rem', letterSpacing: '0.16em', color: 'rgba(255,206,138,0.72)', margin: 0,
        }}>{build ? 'Build this' : 'Buy this'}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.28rem', color: '#f2ead8', margin: '0.15rem 0 0.5rem',
        }}>{target.name}</p>

        {/* THE THING ITSELF. You are about to spend six or seven figures on how
            somewhere looks, so you get to look at it first. */}
        {build && <Plate art={build.art} />}

        <p className="font-karla" style={{
          fontSize: '0.88rem', lineHeight: 1.5, color: 'rgba(212,226,236,0.8)',
          margin: build ? '0.7rem 0 0' : 0,
        }}>
          {'blurb' in target ? target.blurb : 'It goes in the room and stays there.'}
        </p>

        {gains.length > 0 && (
          <div style={{
            marginTop: '0.85rem', padding: '0.7rem 0.8rem', borderRadius: 12,
            background: 'rgba(240,196,100,0.07)', border: '1px solid rgba(240,196,100,0.22)',
            display: 'grid', gap: 6,
          }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.56rem', letterSpacing: '0.14em', color: 'rgba(240,196,100,0.85)', margin: 0,
            }}>What you get</p>
            {gains.map(g => (
              <p key={g} className="font-karla" style={{
                fontSize: '0.82rem', lineHeight: 1.45, color: 'rgba(214,228,238,0.88)', margin: 0,
                display: 'flex', gap: 8,
              }}>
                <span aria-hidden style={{ color: GOLD, flexShrink: 0 }}>&bull;</span>
                <span>{g}</span>
              </p>
            ))}
          </div>
        )}

        <p className="font-karla" style={{
          fontSize: '0.84rem', margin: '0.9rem 0 0', color: 'rgba(196,214,228,0.75)',
        }}>
          <span style={{ color: GOLD }}>&#10209; {cost.toLocaleString()}</span>
          {' · '}leaves you {(coin - cost).toLocaleString()}
        </p>
        <p className="font-karla" style={{
          fontSize: '0.78rem', margin: '0.35rem 0 0', color: 'rgba(180,200,214,0.5)',
        }}>Permanent, and there are no refunds out here.</p>

        <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
          <button type="button" onClick={onCancel} className="font-karla font-700"
            style={{
              flex: 1, padding: '0.6rem', borderRadius: 999, fontSize: '0.9rem',
              color: 'rgba(214,226,236,0.8)', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
            }}>Not yet</button>
          <button type="button" onClick={onYes} disabled={busy} className="font-cinzel font-700"
            style={{
              flex: 1.4, padding: '0.6rem', borderRadius: 999, fontSize: '0.92rem',
              color: '#0d1520', background: GOLD, border: `1px solid ${GOLD}`,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
            }}>
            {/* SAYS WHAT IT DOES. "Do it" is the same button for a 9,000 rug and
                a 2.4M estate, and the second one deserves to be read. */}
            {busy ? 'Working' : build ? `Build ${target.name}` : 'Put it in'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
