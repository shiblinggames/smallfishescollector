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
import { vibrate } from '@/lib/haptics'
import {
  HOTSPOTS, FURNITURE, PORTAL_REACH, PINNED_MAX,
  builtAt, nextBuild, openSlots, furnishingIn, homeBuildings, roomFor,
  type Homestead, type HotspotId, type FurnitureSlot,
} from '@/lib/homestead'
import { build, furnish, stepThrough, type Destination } from './actions'

type Room = 'island' | 'inside' | 'gallery' | 'stones'

const GOLD = '#f0c464'

export default function HomeClient({
  homestead: initial, destinations, doubloons: initialCoin, unlocked, stamps,
}: {
  homestead: Homestead
  destinations: Destination[]
  doubloons: number
  unlocked: string[]
  stamps: Record<string, string | null>
}) {
  const router = useRouter()
  const [home, setHome] = useState(initial)
  const [coin, setCoin] = useState(initialCoin)
  const [room, setRoom] = useState<Room>('island')
  const [almanac, setAlmanac] = useState(false)
  const [busy, startBusy] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  /** What is being confirmed. Everything here is permanent and most of it is
   *  six figures, so nothing is one tap. */
  const [confirm, setConfirm] = useState<
    { kind: 'build'; spot: HotspotId } | { kind: 'furnish'; id: string } | null>(null)

  const say = useCallback((msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(n => (n === msg ? null : n)), 3200)
  }, [])

  const doBuild = useCallback((spot: HotspotId) => {
    startBusy(async () => {
      const r = await build(spot)
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

  const go = useCallback((id: string) => {
    startBusy(async () => {
      const r = await stepThrough(id)
      if (!r.ok) { say(r.error ?? 'The stones will not reach.'); return }
      vibrate(22)
      router.push('/sea')
    })
  }, [router, say])

  const slots = openSlots(home)
  const standing = homeBuildings(home)

  return (
    <div className="min-h-full" style={{
      background: 'radial-gradient(ellipse 120% 90% at 50% 0%, #1b2436 0%, #101725 55%, #080d16 100%)',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '1rem 1rem 4rem' }}>

        {/* ── THE HEADER ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.62rem', letterSpacing: '0.16em', color: 'rgba(180,214,232,0.7)', margin: 0,
            }}>The Homestead</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.6rem', color: '#f2ead8', margin: '0.1rem 0 0',
            }}>{builtAt(home, 'house').name}</p>
            <p className="font-karla" style={{
              fontSize: '0.86rem', color: 'rgba(196,214,228,0.7)', margin: '0.15rem 0 0',
            }}>{builtAt(home, 'house').blurb}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: GOLD, margin: 0 }}>
              ⟡ {coin.toLocaleString()}
            </p>
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

        {/* ── THE ISLAND AS IT STANDS ───────────────────────────────────
            A plan view of the six spots at the positions they actually occupy
            out on the chart, so the row you tap here is the building you see
            from the water. */}
        <div style={{
          position: 'relative', marginTop: 14, height: 190, borderRadius: 16,
          background: 'radial-gradient(ellipse at 50% 62%, #6f8a4e 0%, #55703c 44%, #3d5730 62%, rgba(20,40,54,0) 74%)',
          border: '1px solid rgba(180,214,232,0.16)', overflow: 'hidden',
        }}>
          {standing.map((b, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={b.art} alt="" draggable={false} style={{
              position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
              width: `${b.scale * 150}%`, maxWidth: 'none',
              transform: 'translate(-50%, -100%)',
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
            }} />
          ))}
          {standing.length <= 1 && (
            <p className="font-karla" style={{
              position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center',
              fontSize: '0.76rem', color: 'rgba(226,238,246,0.7)', margin: 0,
            }}>Six places to build. Nothing on five of them yet.</p>
          )}
        </div>

        {/* ── THE ROOMS ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          {([['island', 'The island'], ['inside', 'Inside'], ['gallery', 'The gallery'], ['stones', 'The stones']] as const)
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
          <button type="button" onClick={() => { vibrate(6); setAlmanac(true) }}
            className="font-karla font-700"
            style={{
              padding: '0.44rem 0.9rem', borderRadius: 999, fontSize: '0.82rem', cursor: 'pointer',
              color: 'rgba(214,232,240,0.82)', background: 'rgba(167,139,250,0.14)',
              border: '1px solid rgba(167,139,250,0.4)',
            }}>The Almanac</button>
        </div>

        {/* ── THE ISLAND ROOM ───────────────────────────────────────── */}
        {room === 'island' && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {HOTSPOTS.map(spot => {
              const now = builtAt(home, spot.id)
              const next = nextBuild(home, spot.id)
              return (
                <div key={spot.id} style={{
                  borderRadius: 14, padding: '0.85rem 0.95rem',
                  background: 'rgba(255,255,255,0.035)',
                  border: '1px solid rgba(180,214,232,0.14)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <p className="font-karla font-700 uppercase" style={{
                      fontSize: '0.58rem', letterSpacing: '0.16em', color: 'rgba(180,214,232,0.62)', margin: 0,
                    }}>{spot.label}</p>
                    <p className="font-karla" style={{
                      fontSize: '0.7rem', color: 'rgba(180,214,232,0.5)', margin: 0,
                    }}>{home.spots[spot.id]} of {spot.builds.length - 1}</p>
                  </div>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '1.06rem', color: '#f2ead8', margin: '0.1rem 0 0',
                  }}>{now.name}</p>
                  <p className="font-karla" style={{
                    fontSize: '0.82rem', color: 'rgba(196,214,228,0.66)', margin: '0.12rem 0 0',
                  }}>{now.blurb}</p>

                  {next ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, marginTop: 10, flexWrap: 'wrap',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#e8dec6', margin: 0 }}>
                          Next: {next.name}
                        </p>
                        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(196,214,228,0.6)', margin: 0 }}>
                          {next.blurb}
                        </p>
                      </div>
                      <button type="button" disabled={busy || coin < next.cost}
                        onClick={() => { vibrate(8); setConfirm({ kind: 'build', spot: spot.id }) }}
                        className="font-cinzel font-700"
                        style={{
                          padding: '0.5rem 0.95rem', borderRadius: 999, fontSize: '0.92rem', flexShrink: 0,
                          color: coin < next.cost ? 'rgba(210,180,180,0.75)' : '#0d1520',
                          background: coin < next.cost ? 'rgba(255,255,255,0.06)' : GOLD,
                          border: `1px solid ${coin < next.cost ? 'rgba(255,255,255,0.14)' : GOLD}`,
                          cursor: busy || coin < next.cost ? 'default' : 'pointer',
                        }}>
                        ⟡ {next.cost.toLocaleString()}
                      </button>
                    </div>
                  ) : (
                    <p className="font-karla font-700" style={{
                      fontSize: '0.8rem', color: 'rgba(150,206,172,0.8)', margin: '0.5rem 0 0',
                    }}>Finished.</p>
                  )}
                  <p className="font-karla" style={{
                    fontSize: '0.74rem', color: 'rgba(180,200,214,0.42)', margin: '0.5rem 0 0',
                  }}>{spot.note}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* ── INSIDE ────────────────────────────────────────────────── */}
        {room === 'inside' && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <TheRoom home={home} />
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(196,214,228,0.7)', margin: 0 }}>
              {builtAt(home, 'house').name} has room for {slots.length} of {FURNITURE.length}.
              Build the house up for the rest. Nothing in here does anything.
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
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {f.options.map(o => {
                      const on = here.id === o.id
                      const paid = home.owned.includes(o.id) || o.cost === 0
                      return (
                        <button key={o.id} type="button"
                          disabled={!open || busy || on || (!paid && coin < o.cost)}
                          onClick={() => { vibrate(6); paid ? doFurnish(o.id) : setConfirm({ kind: 'furnish', id: o.id }) }}
                          className="font-karla font-700"
                          style={{
                            padding: '0.4rem 0.72rem', borderRadius: 10, fontSize: '0.78rem', textAlign: 'left',
                            color: on ? '#0d1520' : 'rgba(226,238,246,0.86)',
                            background: on ? GOLD : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${on ? GOLD : 'rgba(255,255,255,0.14)'}`,
                            cursor: !open || on ? 'default' : 'pointer',
                          }}>
                          {/* THE THING ITSELF, above its name. Choosing a rug by
                              reading the words "Kelp weave" is choosing blind,
                              and every one of these is bought for how it looks. */}
                          {o.art && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.art} alt="" draggable={false} style={{
                              display: 'block', width: 54, height: 44,
                              objectFit: 'contain', margin: '0 auto 3px',
                            }} />
                          )}
                          {o.name}
                          {!on && (
                            <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.75 }}>
                              {paid ? 'owned' : `⟡ ${o.cost.toLocaleString()}`}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── THE GALLERY ───────────────────────────────────────────── */}
        {room === 'gallery' && (
          <Gallery home={home} unlocked={unlocked} stamps={stamps} />
        )}

        {/* ── THE STONES ────────────────────────────────────────────── */}
        {room === 'stones' && (
          <div style={{ marginTop: 14 }}>
            <p className="font-karla" style={{ fontSize: '0.86rem', color: 'rgba(196,214,228,0.75)', margin: 0 }}>
              {PORTAL_REACH[home.spots.portal ?? 0]}
            </p>
            {home.spots.portal >= 1 ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <PortalRow name="The Homestead" note="Where you are standing" onGo={() => go('home')} busy={busy} here />
                {destinations.map(d => (
                  <PortalRow key={d.id} name={d.name} note={d.note} onGo={() => go(d.id)} busy={busy} />
                ))}
              </div>
            ) : (
              <p className="font-karla" style={{
                fontSize: '0.82rem', color: 'rgba(180,200,214,0.55)', margin: '0.6rem 0 0',
              }}>
                Stand the stones up on the island first.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── CONFIRM. Everything here is permanent and most of it is six
          figures, so nothing on this page is one tap. ────────────────── */}
      <AnimatePresence>
        {confirm && (
          <ConfirmBuy
            confirm={confirm} home={home} coin={coin}
            onCancel={() => setConfirm(null)}
            onYes={() => confirm.kind === 'build' ? doBuild(confirm.spot) : doFurnish(confirm.id)}
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
 * THE ROOM, AS IT ACTUALLY IS.
 *
 * The shell comes from the house tier and everything in it is a layer at a
 * position that shell carries — see ROOMS, which is why the coordinates are per
 * room rather than shared: the fire is in the left corner of a lean-to and dead
 * centre in a hall, and one set of numbers would have put it on a wall.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Inside used to be a list of buttons with prices on them. Six slots and 22
 * furnishings, six million doubloons of them, and buying the 1.1M giant changed
 * a label from "Nothing yet" to "An Ancient Deep giant". Everything in here is
 * bought for how it looks, so not drawing it was not a gap in the art, it was
 * the whole feature missing.
 *
 * Painted back to front: the rug goes under the fire, the fire in front of the
 * wall, the trophy over the fire, and the table and the corner in front of all
 * of it. That order is fixed and is the only thing here that is not data.
 */
const ROOM_ORDER: FurnitureSlot[] = ['floor', 'window', 'hearth', 'mount', 'table', 'corner']

const TheRoom = memo(function TheRoom({ home }: { home: Homestead }) {
  const shell = roomFor(home)
  const open = openSlots(home)

  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '1008 / 666',
      borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(180,214,232,0.18)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shell.art} alt="" draggable={false} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
      }} />
      {ROOM_ORDER.map(slot => {
        // A slot the house has no room for yet shows nothing, even if a
        // furnishing is recorded against it from a bigger house.
        if (!open.includes(slot)) return null
        const item = furnishingIn(home, slot)
        if (!item.art) return null
        const spot = shell.spots[slot]
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={slot} src={item.art} alt="" draggable={false} style={{
            position: 'absolute',
            left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`,
            // Anchored at its BOTTOM CENTRE, because everything in a room sits
            // on something. Anchoring the middle makes a piece float the moment
            // its art is a different height from the last one.
            transform: 'translate(-50%, -100%)',
          }} />
        )
      })}
    </div>
  )
})

function PortalRow({ name, note, onGo, busy, here }: {
  name: string; note: string; onGo: () => void; busy: boolean; here?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      borderRadius: 12, padding: '0.7rem 0.85rem',
      background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(180,214,232,0.14)',
    }}>
      <div style={{ minWidth: 0 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f2ead8', margin: 0 }}>{name}</p>
        <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(196,214,228,0.62)', margin: 0 }}>{note}</p>
      </div>
      <button type="button" onClick={onGo} disabled={busy} className="font-cinzel font-700"
        style={{
          padding: '0.44rem 0.9rem', borderRadius: 999, fontSize: '0.88rem', flexShrink: 0,
          color: '#dff0e6', background: 'rgba(10,24,20,0.9)',
          border: '1px solid rgba(150,206,172,0.5)', cursor: busy ? 'default' : 'pointer',
        }}>{here ? 'Stay' : 'Step through'}</button>
    </div>
  )
}

/**
 * THE GALLERY.
 *
 * Every badge the captain has unlocked, at a size that depends on what they
 * built. It never hides one: the bare wall shows the same badges the Captain's
 * Wing does, just smaller and without the case around them. Paying for a room
 * to look at your own things in is fine; paying to be allowed to look is not.
 */
function Gallery({ home, unlocked, stamps }: {
  home: Homestead; unlocked: string[]; stamps: Record<string, string | null>
}) {
  const tier = home.spots.gallery ?? 0
  const size = [58, 72, 88, 104][tier]
  const got = unlocked.map(id => BADGE_MAP[id]).filter(Boolean)

  return (
    <div style={{ marginTop: 14 }}>
      <p className="font-karla" style={{ fontSize: '0.84rem', color: 'rgba(196,214,228,0.72)', margin: 0 }}>
        {got.length} up. {builtAt(home, 'gallery').blurb}
      </p>
      {got.length === 0 ? (
        <p className="font-karla" style={{
          fontSize: '0.82rem', color: 'rgba(180,200,214,0.5)', margin: '0.8rem 0 0',
        }}>Nothing to hang yet.</p>
      ) : (
        <div style={{
          display: 'grid', gap: tier >= 2 ? 14 : 9, marginTop: 12,
          gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`,
        }}>
          {got.map(b => (
            <div key={b.id} title={`${b.name} — ${b.description}`} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              // The case IS the upgrade. A bare wall is a bare wall.
              padding: tier >= 1 ? 8 : 0,
              borderRadius: tier >= 1 ? 10 : 0,
              background: tier >= 1 ? 'rgba(255,255,255,0.045)' : 'transparent',
              border: tier >= 1 ? '1px solid rgba(180,214,232,0.16)' : 'none',
              boxShadow: tier >= 2 ? '0 6px 18px rgba(0,0,0,0.35), inset 0 -12px 20px -14px rgba(240,196,100,0.5)' : 'none',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.imageUrl} alt={b.name} draggable={false}
                style={{ width: '100%', maxWidth: size, display: 'block' }} />
              {tier >= 2 && (
                <p className="font-karla font-700" style={{
                  fontSize: '0.66rem', textAlign: 'center', margin: 0,
                  color: 'rgba(226,238,246,0.78)', lineHeight: 1.25,
                }}>{b.name}</p>
              )}
              {tier >= 3 && stamps[b.id] && (
                <p className="font-karla" style={{
                  fontSize: '0.6rem', margin: 0, color: 'rgba(180,200,214,0.5)',
                }}>{new Date(stamps[b.id] as string).toLocaleDateString()}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {tier >= 2 && (
        <p className="font-karla" style={{
          fontSize: '0.74rem', color: 'rgba(180,200,214,0.42)', margin: '0.9rem 0 0',
        }}>Room to hang {PINNED_MAX} of them large is coming with the wing.</p>
      )}
    </div>
  )
}

function ConfirmBuy({ confirm, home, coin, onCancel, onYes, busy }: {
  confirm: { kind: 'build'; spot: HotspotId } | { kind: 'furnish'; id: string }
  home: Homestead; coin: number; onCancel: () => void; onYes: () => void; busy: boolean
}) {
  const target = confirm.kind === 'build'
    ? nextBuild(home, confirm.spot)
    : FURNITURE.flatMap(f => f.options).find(o => o.id === confirm.id) ?? null
  if (!target) return null
  const cost = target.cost

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
          width: '100%', maxWidth: 380, borderRadius: 18, padding: '1.15rem',
          background: 'rgba(10,16,22,0.98)', border: '1px solid rgba(180,214,232,0.28)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.6rem', letterSpacing: '0.16em', color: 'rgba(255,206,138,0.72)', margin: 0,
        }}>{confirm.kind === 'build' ? 'Build this' : 'Buy this'}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.28rem', color: '#f2ead8', margin: '0.15rem 0 0.5rem',
        }}>{target.name}</p>
        <p className="font-karla" style={{
          fontSize: '0.88rem', lineHeight: 1.5, color: 'rgba(212,226,236,0.8)', margin: 0,
        }}>
          {'blurb' in target ? target.blurb : 'It goes in the room and stays there.'}
        </p>
        <p className="font-karla" style={{
          fontSize: '0.84rem', margin: '0.9rem 0 0', color: 'rgba(196,214,228,0.75)',
        }}>
          <span style={{ color: GOLD }}>⟡ {cost.toLocaleString()}</span>
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
              flex: 1, padding: '0.6rem', borderRadius: 999, fontSize: '0.95rem',
              color: '#0d1520', background: GOLD, border: `1px solid ${GOLD}`,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
            }}>{busy ? 'Working' : 'Do it'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
