'use client'

// ── THE THREE NODES THAT ARE NOT JUST "READ IT" ─────────────────────────────
//
// A toll to pay, a cache to pick from, and a permanent choice of ship class.
// Every other campaign node out here is a scene you read or a fight you take,
// and those already work from the deck; these three had sheets only the
// campaign map knew how to draw, so pressing one on the water sent you to a
// different screen and out of the place you were sailing.
//
// ── IT IS THE CHART'S OWN PANEL, NOT THE MAP'S SHEET ────────────────────────
//
// Same shell as the trawls readout, the day's orders and every hail on this
// water: an opaque base over painted sea, a warm border, a Cinzel title with a
// round close beside it. The campaign map's sheet is a full-height card built
// for a page of cards; carrying it out here would have made the sea feel like a
// menu had opened on top of it, which is the whole thing this port is undoing.
//
// ── AND THE PERMANENT ONES ARE ARMED, NOT TAKEN ─────────────────────────────
//
// The Cache and the Captain's Choice are forever, and on the map both once used
// the whole card as the button — a player lost his Cache to a tap meant to
// expand a description. The gesture for "let me read the rest" and the gesture
// for "I'll take this forever" must not be the same gesture, so a first press
// selects and a second, separate, named button commits.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { getRaidItem } from '@/lib/raidItems'
import { getShipClass, offeredShipClasses } from '@/lib/shipClasses'
import {
  claimMilestoneNode, claimQuartermasterChoice, pickShipClass,
} from '@/app/(app)/expeditions/raidMapActions'
import type { RaidNode } from '@/lib/raidMap'
import { nodeSheet, type NodeSheetState } from './nodeSheetActions'

const GOLD = '#f0c040'

/** The chart's panel, wherever one opens over water. Trawls, orders and the
 *  crew hub are all this box; a fourth shape would read as a different game. */
const PANEL: React.CSSProperties = {
  margin: 'auto', width: '100%', maxWidth: 400,
  borderRadius: 20, padding: '1.1rem 1.05rem 1rem',
  background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
  border: '1px solid rgba(196,169,106,0.34)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
  maxHeight: '84vh', display: 'flex', flexDirection: 'column',
}

export default function SeaNodeSheet({ node, cleared, onClose }: {
  node: RaidNode
  cleared: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<NodeSheetState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let live = true
    nodeSheet().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setState(r)
    }, () => { if (live) setErr('Could not reach the hold.') })
    return () => { live = false }
  }, [])

  /** Every action here ends the same way: tell the chart, and get out of the
   *  way. `router.refresh()` is what re-reads nodeStatus, so without it the post
   *  stays lit and whatever this just unlocked stays locked until a reload. */
  function done() {
    router.refresh()
    onClose()
  }

  function run(fn: () => Promise<{ error: string } | unknown>) {
    setErr(null)
    startTransition(async () => {
      const res = await fn()
      if (res && typeof res === 'object' && 'error' in res) {
        setErr(String((res as { error: string }).error))
        return
      }
      // The purse changed under the header on other surfaces too.
      window.dispatchEvent(new CustomEvent('doubloons-changed'))
      done()
    })
  }

  return (
    <AnimatePresence>
      <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <PopupShell open onClose={onClose}>
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={e => e.stopPropagation()}
            style={PANEL}>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem' }}>
              <div style={{ minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.26rem', color: '#f4ecd8', margin: 0, lineHeight: 1.2 }}>
                  {node.label}
                </p>
                {node.flavor && (
                  <p className="font-karla" style={{
                    margin: '0.35rem 0 0', fontSize: '0.8rem', lineHeight: 1.55,
                    color: 'rgba(190,212,228,0.72)', fontStyle: 'italic',
                  }}>{node.flavor}</p>
                )}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" style={{
                width: 30, height: 30, borderRadius: '50%', padding: 0, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(230,240,246,0.8)', cursor: 'pointer', lineHeight: 1,
              }}>×</button>
            </div>

            <div style={{ overflowY: 'auto', minHeight: 0, marginTop: '0.85rem', flex: 1 }}>
              {node.detail?.description && (
                <p className="font-karla" style={{
                  margin: '0 0 1rem', fontSize: '0.86rem', lineHeight: 1.6,
                  color: 'rgba(226,232,236,0.82)', whiteSpace: 'pre-line',
                }}>{node.detail.description}</p>
              )}

              {!state && !err && (
                <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(190,212,228,0.6)' }}>
                  Counting it out…
                </p>
              )}

              {state && node.type === 'milestone' && node.milestone && (
                <Toll node={node} state={state} cleared={cleared} pending={pending}
                  onPay={() => run(() => claimMilestoneNode(node.id))} />
              )}

              {state && node.choice && (
                <Cache node={node} state={state} cleared={cleared} pending={pending}
                  armed={armed} onArm={setArmed}
                  onTake={id => run(() => claimQuartermasterChoice(node.id, id))} />
              )}

              {state && node.classPick && (
                <Choice node={node} state={state} pending={pending}
                  armed={armed} onArm={setArmed}
                  onPick={id => run(() => pickShipClass(node.id, id))} />
              )}

              {err && (
                <p role="alert" className="font-karla font-600" style={{
                  margin: '0.85rem 0 0', fontSize: '0.8rem', color: '#e6a0a0', lineHeight: 1.5,
                }}>{err}</p>
              )}
            </div>
          </motion.div>
        </PopupShell>
      </div>
    </AnimatePresence>
  )
}

/* ── THE TOLL ──────────────────────────────────────────────────────────────
   A flat price, paid once. The only thing that can go wrong is not having it,
   and the button says so rather than failing on the press. */
function Toll({ node, state, cleared, pending, onPay }: {
  node: RaidNode
  state: NodeSheetState
  cleared: boolean
  pending: boolean
  onPay: () => void
}) {
  const cost = node.milestone!.amount
  const short = state.doubloons < cost

  if (cleared) {
    return <p className="font-karla font-600" style={{ margin: 0, fontSize: '0.86rem', color: '#8fdc9a' }}>
      Paid. The way is clear.
    </p>
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '0.6rem 0.75rem', borderRadius: 12, marginBottom: '0.85rem',
        background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.24)',
      }}>
        <span className="font-karla font-700 uppercase" style={{
          fontSize: '0.56rem', letterSpacing: '0.16em', color: 'rgba(196,169,106,0.8)',
        }}>Their price</span>
        <span className="font-cinzel font-700" style={{
          fontSize: '1.05rem', color: GOLD, fontVariantNumeric: 'tabular-nums',
        }}>{cost.toLocaleString()} ⟡</span>
      </div>

      <p className="font-karla" style={{
        margin: '0 0 0.85rem', fontSize: '0.76rem',
        color: short ? '#e6a0a0' : 'rgba(190,212,228,0.6)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {short
          ? `You are carrying ${state.doubloons.toLocaleString()} ⟡. You need ${(cost - state.doubloons).toLocaleString()} ⟡ more.`
          : `You are carrying ${state.doubloons.toLocaleString()} ⟡.`}
      </p>

      <button type="button" disabled={short || pending} onClick={onPay}
        className="font-cinzel font-700" style={{
          width: '100%', padding: '0.7rem', borderRadius: 12,
          background: short ? 'rgba(255,255,255,0.05)' : 'rgba(240,192,64,0.16)',
          border: `1px solid ${short ? 'rgba(255,255,255,0.1)' : 'rgba(240,192,64,0.5)'}`,
          color: short ? 'rgba(190,212,228,0.45)' : '#f6dfa0',
          fontSize: '0.92rem', cursor: short || pending ? 'default' : 'pointer',
        }}>
        {pending ? 'Counting it out…' : short ? 'Not enough aboard' : `Pay ${cost.toLocaleString()} ⟡`}
      </button>
    </>
  )
}

/* ── THE CACHE ─────────────────────────────────────────────────────────────
   One of the two, forever. Armed then taken; see the note at the top. */
function Cache({ node, state, cleared, pending, armed, onArm, onTake }: {
  node: RaidNode
  state: NodeSheetState
  cleared: boolean
  pending: boolean
  armed: string | null
  onArm: (id: string | null) => void
  onTake: (id: string) => void
}) {
  const items = node.choice!.items

  return (
    <>
      <p className="font-karla font-700 uppercase" style={{
        margin: '0 0 0.55rem', fontSize: '0.56rem', letterSpacing: '0.18em',
        color: 'rgba(196,169,106,0.75)',
      }}>{cleared ? 'You took' : 'One of the two'}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map(id => {
          const it = getRaidItem(id)
          if (!it) return null
          const owned = state.ownedItems.includes(id)
          const isArmed = armed === id
          // An item with no plate falls back to nothing rather than to a broken
          // image: the name and the line under it are what the choice is made on.
          const src = !it.image ? null
            : it.image.startsWith('/storage')
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}${it.image}`
              : it.image
          return (
            <button key={id} type="button"
              disabled={cleared || pending}
              onClick={() => onArm(isArmed ? null : id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%',
                textAlign: 'left', padding: '0.6rem 0.7rem', borderRadius: 12,
                background: isArmed ? 'rgba(240,192,64,0.14)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isArmed ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.08)'}`,
                cursor: cleared ? 'default' : 'pointer',
                opacity: cleared && !owned ? 0.45 : 1,
              }}>
              {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" aria-hidden decoding="async" style={{
                  width: 44, height: 44, objectFit: 'contain', flexShrink: 0,
                }} />
              )}
              <span style={{ minWidth: 0 }}>
                <span className="font-cinzel font-700" style={{
                  display: 'block', fontSize: '0.92rem', color: '#f4ecd8',
                }}>{it.name}</span>
                <span className="font-karla" style={{
                  display: 'block', fontSize: '0.74rem', lineHeight: 1.45,
                  color: 'rgba(190,212,228,0.66)',
                }}>{it.description}</span>
                {owned && (
                  <span className="font-karla font-700" style={{
                    display: 'block', fontSize: '0.68rem', color: '#8fdc9a', marginTop: 2,
                  }}>Already in the hold</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {!cleared && (
        <>
          <p className="font-karla" style={{
            margin: '0.75rem 0 0.6rem', fontSize: '0.72rem', lineHeight: 1.5,
            color: 'rgba(190,212,228,0.55)',
          }}>
            {node.detail?.dropsNote ?? 'You take one. The other stays in the cache and does not come back.'}
          </p>
          <button type="button" disabled={!armed || pending}
            onClick={() => armed && onTake(armed)}
            className="font-cinzel font-700" style={{
              width: '100%', padding: '0.7rem', borderRadius: 12,
              background: armed ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${armed ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: armed ? '#f6dfa0' : 'rgba(190,212,228,0.45)',
              fontSize: '0.92rem', cursor: armed && !pending ? 'pointer' : 'default',
            }}>
            {pending ? 'Stowing it…'
              : armed ? `Take the ${getRaidItem(armed)?.name ?? 'item'}` : 'Pick one'}
          </button>
        </>
      )}
    </>
  )
}

/* ── THE CAPTAIN'S CHOICE ──────────────────────────────────────────────────
   A permanent ship identity. Same arm-then-commit, and the same ladder the
   campaign map offers: your OTHER chapters' picks decide what is on the menu. */
function Choice({ node, state, pending, armed, onArm, onPick }: {
  node: RaidNode
  state: NodeSheetState
  pending: boolean
  armed: string | null
  onArm: (id: string | null) => void
  onPick: (id: string) => void
}) {
  const chapterId = node.classPick!.chapterId
  const chosenId = state.shipClasses[chapterId]
  const chosen = getShipClass(chosenId)
  // Computed from the player's OTHER picks, so a cleared node still shows what
  // was on the menu at the time. A pinned menu (the Chapter IV augment) offers
  // exactly its own list instead of the ladder.
  const prior = Object.fromEntries(Object.entries(state.shipClasses).filter(([k]) => k !== chapterId))
  const offered = node.classPick!.options
    ? node.classPick!.options.map(id => getShipClass(id)).filter((c): c is NonNullable<typeof c> => !!c)
    : offeredShipClasses(prior)

  return (
    <>
      <p className="font-karla font-700 uppercase" style={{
        margin: '0 0 0.55rem', fontSize: '0.56rem', letterSpacing: '0.18em',
        color: 'rgba(196,169,106,0.75)',
      }}>{chosen ? 'You chose' : 'Pick a class'}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {offered.map(cls => {
          const isChosen = chosen?.id === cls.id
          const isArmed = armed === cls.id
          const dim = !!chosen && !isChosen
          const c = cls.color
          return (
            <button key={cls.id} type="button"
              disabled={!!chosen || pending}
              onClick={() => onArm(isArmed ? null : cls.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%',
                textAlign: 'left', padding: '0.65rem 0.7rem', borderRadius: 12,
                background: isChosen || isArmed ? `${c}26` : `linear-gradient(120deg, ${c}16, rgba(0,0,0,0.24))`,
                border: `1px solid ${isChosen || isArmed ? `${c}99` : `${c}3a`}`,
                opacity: dim ? 0.42 : 1,
                cursor: chosen ? 'default' : 'pointer',
              }}>
              <span aria-hidden style={{
                position: 'relative', flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `radial-gradient(circle, ${c}44, transparent 70%)`,
                fontSize: '1.2rem',
              }}>{cls.emoji}</span>
              <span style={{ minWidth: 0 }}>
                <span className="font-cinzel font-700" style={{
                  display: 'block', fontSize: '0.92rem', color: '#f4ecd8',
                }}>{cls.name}</span>
                <span className="font-karla" style={{
                  display: 'block', fontSize: '0.7rem', color: c, marginBottom: 2,
                }}>{cls.tagline}</span>
                <span className="font-karla" style={{
                  display: 'block', fontSize: '0.74rem', lineHeight: 1.45,
                  color: 'rgba(190,212,228,0.66)',
                }}>{cls.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      {!chosen && (
        <>
          <p className="font-karla" style={{
            margin: '0.75rem 0 0.6rem', fontSize: '0.72rem', lineHeight: 1.5,
            color: 'rgba(190,212,228,0.55)',
          }}>
            This is permanent. She sails as what you pick here for the rest of the campaign.
          </p>
          <button type="button" disabled={!armed || pending}
            onClick={() => armed && onPick(armed)}
            className="font-cinzel font-700" style={{
              width: '100%', padding: '0.7rem', borderRadius: 12,
              background: armed ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${armed ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: armed ? '#f6dfa0' : 'rgba(190,212,228,0.45)',
              fontSize: '0.92rem', cursor: armed && !pending ? 'pointer' : 'default',
            }}>
            {pending ? 'Making it so…'
              : armed ? `Sail as the ${getShipClass(armed)?.name ?? 'class'}` : 'Pick a class'}
          </button>
        </>
      )}
    </>
  )
}
