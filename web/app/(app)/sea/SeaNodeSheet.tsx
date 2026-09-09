'use client'

// ── EVERY NODE THAT IS NOT JUST "READ IT" ───────────────────────────────────
//
// A toll to pay, a cache to pick from, a permanent choice of ship class, a lock
// to crack, a throw of the bones, a gate to shoot through, a decision to make,
// an inspection to stand, terms to hear, and a wreck to divide. Everything on
// the campaign that is neither a scene you read nor a fight you take.
//
// ── IT WAS THREE OF THOSE, AND THE OTHER SEVEN WERE DEAD ENDS ───────────────
//
// Fifteen stops were laid on the water with nothing behind them: sail up to the
// Wax Cipher and you got its name, its flavour and a close button. The chart
// was a place you could reach every stop in the campaign and finish about half
// of them, which is worse than not having them out here at all — you learn the
// water is real and then you learn it is not. Six puzzles, two throws, two
// musters, two sets of terms, a gate, a choice and Finn's spoils.
//
// NOTHING HERE IS A SECOND IMPLEMENTATION. Every interaction is the component
// the campaign map already mounts — the five puzzle boards, DiceRollNode,
// DpsCheckNode, SpoilsBoard — given the same props and the same server actions.
// What is written here is the SHELL around them, because that is the only part
// that should differ between a page of cards and a panel over open water.
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
import dynamic from 'next/dynamic'
import PopupShell from '@/components/PopupShell'
import { getRaidItem } from '@/lib/raidItems'
import { getShipClass, offeredShipClasses } from '@/lib/shipClasses'
import {
  claimMilestoneNode, claimQuartermasterChoice, pickShipClass,
  solvePuzzleNode, pickRaidEventChoice, standForMuster, markStoryNodeRead,
} from '@/app/(app)/expeditions/raidMapActions'
import { musterReport } from '@/lib/crewMuster'
import type { RaidNode } from '@/lib/raidMap'
import { nodeSheet, type NodeSheetState } from './nodeSheetActions'

// The boards themselves, straight off the campaign map. Dynamic because a
// captain opens ONE of these at a stop and most stops are none of them —
// shipping five puzzle engines, a d20 and an aim bar inside the chart's bundle
// to draw a toll would be paying for all of it on every load.
const TumblerLockPuzzle = dynamic(() => import('@/app/(app)/expeditions/TumblerLockPuzzle'), { ssr: false })
const CargoShufflePuzzle = dynamic(() => import('@/app/(app)/expeditions/CargoShufflePuzzle'), { ssr: false })
const MirrorRunPuzzle = dynamic(() => import('@/app/(app)/expeditions/MirrorRunPuzzle'), { ssr: false })
const CipherDialsPuzzle = dynamic(() => import('@/app/(app)/expeditions/CipherDialsPuzzle'), { ssr: false })
const BeaconChainPuzzle = dynamic(() => import('@/app/(app)/expeditions/BeaconChainPuzzle'), { ssr: false })
const DiceRollNode = dynamic(() => import('@/app/(app)/expeditions/DiceRollNode'), { ssr: false })
const DpsCheckNode = dynamic(() => import('@/app/(app)/expeditions/DpsCheckNode'), { ssr: false })
const SpoilsBoard = dynamic(() => import('@/app/(app)/expeditions/SpoilsBoard'), { ssr: false })

const GOLD = '#f0c040'

/** The chart's panel, wherever one opens over water. Trawls, orders and the
 *  crew hub are all this box; a fourth shape would read as a different game. */
const PANEL: React.CSSProperties = {
  margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
  borderRadius: 20, padding: '1.1rem 1.05rem 1rem',
  background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
  border: '1px solid rgba(196,169,106,0.34)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
  maxHeight: '84vh', display: 'flex', flexDirection: 'column',
}

export default function SeaNodeSheet({ node, cleared, onClose, onCleared }: {
  node: RaidNode
  cleared: boolean
  onClose: () => void
  /**
   * THIS NODE IS DONE, SAID THE INSTANT IT IS DONE.
   *
   * `router.refresh()` below is the truth and stays, but it is a round trip
   * against a page that fetches half the ocean, and the chart hides every node
   * that is not yet reachable — so between the tap and the answer there is a
   * stretch where the thing you just unlocked is still not on the water. The
   * chart takes this and opens the next stop optimistically, on the same
   * frame; the refresh lands underneath it and agrees.
   */
  onCleared?: (id: string) => void
}) {
  const router = useRouter()
  const [state, setState] = useState<NodeSheetState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  /**
   * SOLVED IN THIS SITTING.
   *
   * A puzzle clears server-side the moment the last beacon lights, and the
   * sheet's own `cleared` prop is the chart's view from before it opened. So
   * the reveal is shown off this rather than off a refetch: you finished it,
   * you should be reading what it told you, not waiting on a round trip to be
   * allowed to.
   */
  const [solved, setSolved] = useState(false)
  /** Terms heard this sitting — same staleness, same fix. The berth and the
   *  armory clear on a read and then show what the refit costs. */
  const [heard, setHeard] = useState(false)

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
    onCleared?.(node.id)
    router.refresh()
    onClose()
  }

  /**
   * THE BOARD CAME OUT.
   *
   * `solvePuzzleNode` is what grants the Nav XP and marks the stop done; the
   * board itself only says it was beaten. The sheet STAYS OPEN on success and
   * turns into the reveal, because the reveal is what the puzzle was for.
   */
  function solvePuzzle() {
    setErr(null)
    startTransition(async () => {
      const res = await solvePuzzleNode(node.id)
      if (res && 'error' in res) { setErr(res.error); return }
      setSolved(true)
      onCleared?.(node.id)
      router.refresh()
    })
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

              {/* ── A LOCK, A CHART, A BEAM ─────────────────────────────
                  The board is the whole interaction: it clears the node itself
                  the moment it comes out, so there is no button under it. What
                  follows the solve is the REVEAL — where the freight runs, what
                  the cipher said — which is the thing you did it for.

                  `onCleared` fires on the solve rather than on the close,
                  because the server has already written it: leaving via the
                  backdrop would otherwise leave the next stop dark until a
                  reload. That exact hole was found on the map once. */}
              {node.puzzle && !cleared && !solved && (
                <div style={{ marginTop: '0.4rem' }}>
                  {node.puzzle.kind === 'tumbler' && node.puzzle.tumbler
                    ? <TumblerLockPuzzle puzzle={node.puzzle.tumbler} onSolved={solvePuzzle} />
                    : node.puzzle.kind === 'cargo' && node.puzzle.cargo
                      ? <CargoShufflePuzzle puzzle={node.puzzle.cargo} onSolved={solvePuzzle} />
                      : node.puzzle.kind === 'mirror'
                        ? <MirrorRunPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />
                        : node.puzzle.kind === 'cipher'
                          ? <CipherDialsPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />
                          : <BeaconChainPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />}
                </div>
              )}
              {node.puzzle?.reveal && (cleared || solved) && (
                <Reveal
                  title={node.puzzle.kind === 'cipher' ? 'The Cipher Reads True'
                    : node.puzzle.kind === 'mirror' ? 'The Beam Strikes True'
                    : node.puzzle.kind === 'cargo' ? 'The Hold Is Stowed'
                    : node.puzzle.kind === 'tumbler' ? 'The Bolt Runs Free'
                    : 'The Network Reads True'}
                  body={node.puzzle.reveal}
                  navXp={node.puzzle.rewardNavXp}
                  cta={solved ? 'Log it' : null}
                  onCta={done} />
              )}

              {/* ── A THROW, AND A GATE ─────────────────────────────────
                  Both own their whole interaction and both clear server-side
                  inside it, so the sheet hands them the numbers and gets out of
                  the way. Their intro scenes have already played: the chart
                  opens a scene before the sheet for any node carrying one. */}
              {state && node.dice && !cleared && (
                <div style={{ marginTop: '0.4rem' }}>
                  <DiceRollNode nodeId={node.id} dice={node.dice}
                    doubloons={state.doubloons} navLevel={state.navLevel}
                    onResolved={done} />
                </div>
              )}
              {state && node.dpsCheck && !cleared && (
                <div style={{ marginTop: '0.4rem' }}>
                  <DpsCheckNode nodeId={node.id} dpsCheck={node.dpsCheck}
                    doubloons={state.doubloons}
                    onActed={() => onCleared?.(node.id)}
                    onResolved={done} />
                </div>
              )}

              {/* ── A CALL TO MAKE ──────────────────────────────────────
                  Each card carries what it pays, because that is the whole of
                  the decision. On a revisit the one you took is lit and the
                  rest say Gone: a choice you cannot unmake should still be
                  legible afterwards, or the beat becomes a thing that happened
                  to you rather than a thing you did. */}
              {state && node.event && (
                <EventPicker node={node} picked={state.choices[node.id] ?? null}
                  cleared={cleared} pending={pending}
                  onPick={id => run(() => pickRaidEventChoice(node.id, id))} />
              )}

              {/* ── AN INSPECTION TO STAND ──────────────────────────────
                  A ROSTER GATE, not a fight: the clerk counts who would sail
                  and decides whether you get near the line. The checklist is
                  `musterReport`, which is PURE and is the same function the
                  server re-runs on the press — so this can never promise a pass
                  the server then refuses.

                  The map plays the read-off as a cutscene, with the crew
                  ticking the manifest off aloud. That stays a map flourish: out
                  here the muster is a panel over the water like every other
                  door on this chart, and what a captain standing off Muster
                  Bank needs is the list and the verb. */}
              {state && node.muster && (
                <Muster node={node} state={state} cleared={cleared} pending={pending}
                  onStand={() => run(() => standForMuster(node.id))} />
              )}

              {/* ── TERMS, AND WHERE THE REFIT IS BOUGHT ────────────────
                  The berth and the armory clear on a READ — hearing the yard
                  out is what opens the chain, and the purchase is separate and
                  optional so a captain who cannot afford it yet still sails on.
                  The sale itself lives in Manage Ship, which is a disc away on
                  this chart, and putting a till here as well would be the same
                  two-doors-to-one-room the sea has spent every one of these
                  conversions closing. */}
              {state && (node.berth || node.armory) && (
                <Terms node={node} state={state} cleared={cleared || heard} pending={pending}
                  onHear={() => {
                    setErr(null)
                    startTransition(async () => {
                      const res = await markStoryNodeRead(node.id)
                      if (res && 'error' in res) { setErr(res.error); return }
                      setHeard(true)
                      onCleared?.(node.id)
                      router.refresh()
                    })
                  }} />
              )}

              {/* ── WHAT CAME OFF HIS WRECK ─────────────────────────────
                  Two things and one fits aboard. Its own bench rather than a
                  price row, and mounted whole: it is a permanent CHOICE first
                  and a purchase second, and it is built to be armed and then
                  taken rather than tapped once.

                  NOT GATED ON `cleared`, because nothing ever marks a spoils
                  node cleared — that would hide the board forever, from exactly
                  the players it is for. It does not need a lock check either:
                  the chart refuses a locked rock with "not yet" and never opens
                  this sheet over one. */}
              {state && node.spoils && (
                <div style={{ marginTop: '0.4rem' }}>
                  <SpoilsBoard
                    freeSide={state.spoilFree === 'fishing' || state.spoilFree === 'nav' ? state.spoilFree : null}
                    paidSide={state.spoilPaid === 'fishing' || state.spoilPaid === 'nav' ? state.spoilPaid : null}
                    doubloons={state.doubloons}
                    onDone={() => router.refresh()} />
                </div>
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

/* ── WHAT THE BOARD TOLD YOU ───────────────────────────────────────────────
   The reveal after a puzzle, and the record of one you cracked long ago. Same
   panel either way; only the button differs, because a captain reading this
   for the first time has a stop to log and a captain re-reading it does not. */
function Reveal({ title, body, navXp, cta, onCta }: {
  title: string
  body: string
  navXp: number
  /** null on a revisit: there is nothing left to write. */
  cta: string | null
  onCta: () => void
}) {
  return (
    <div style={{
      marginTop: '0.4rem', borderRadius: 14, padding: '1rem 0.9rem',
      background: `linear-gradient(160deg, ${GOLD}12, rgba(10,14,20,0.5))`,
      border: `1px solid ${GOLD}44`,
    }}>
      <p className="font-cinzel font-700 uppercase tracking-[0.1em]" style={{
        fontSize: '0.62rem', color: GOLD, marginBottom: '0.55rem', textAlign: 'center',
      }}>{title}</p>
      <p className="font-karla" style={{
        fontSize: '0.84rem', lineHeight: 1.6, color: 'rgba(236,240,244,0.82)',
        whiteSpace: 'pre-line', textAlign: 'center', margin: 0,
      }}>{body}</p>
      {navXp > 0 && (
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{
          margin: '0.7rem 0 0', fontSize: '0.6rem', color: `${GOLD}bb`, textAlign: 'center',
        }}>+{navXp.toLocaleString()} Nav XP</p>
      )}
      {cta && (
        <button type="button" onClick={onCta}
          className="font-cinzel font-700 uppercase tracking-[0.08em]"
          style={{
            width: '100%', marginTop: '0.85rem', padding: '0.7rem', borderRadius: 11,
            fontSize: '0.82rem', cursor: 'pointer',
            background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, color: GOLD,
          }}>{cta}</button>
      )}
    </div>
  )
}

/* ── A CALL TO MAKE ────────────────────────────────────────────────────────
   Cards with what each one pays on them, because that IS the decision. The
   press is the commit — no arm-then-take here, unlike the Cache and the
   Captain's Choice: those two are permanent and exclusive, this one only
   settles what the next hour looks like. */
const EVENT_ACCENT = '#c084fc'

function EventPicker({ node, picked, cleared, pending, onPick }: {
  node: RaidNode
  picked: string | null
  cleared: boolean
  pending: boolean
  onPick: (id: string) => void
}) {
  const choices = node.event?.choices ?? []
  const pay = (o: { type: string; amount?: number }) =>
    o.type === 'doubloons' ? `+${(o.amount ?? 0).toLocaleString()} ⟡`
      : o.type === 'navXp' ? `+${(o.amount ?? 0).toLocaleString()} Nav XP`
        : 'No spoils'
  return (
    <div style={{ marginTop: '0.4rem' }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{
        fontSize: '0.6rem', color: 'rgba(190,212,228,0.5)', marginBottom: '0.5rem',
      }}>{picked ? 'You chose' : 'Choose one'}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {choices.map(c => {
          const mine = picked === c.id
          return (
            <div key={c.id} style={{
              display: 'flex', flexDirection: 'column', gap: 7,
              borderRadius: 12, padding: '0.7rem 0.75rem',
              background: mine ? `${EVENT_ACCENT}1c` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${mine ? `${EVENT_ACCENT}77` : 'rgba(255,255,255,0.09)'}`,
              opacity: cleared && !mine ? 0.42 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span className="font-cinzel font-700" style={{
                  flex: 1, minWidth: 0, fontSize: '0.88rem', color: '#f0ede8',
                }}>{c.label}</span>
                <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{
                  flexShrink: 0, fontSize: '0.57rem', color: EVENT_ACCENT,
                  background: `${EVENT_ACCENT}14`, border: `1px solid ${EVENT_ACCENT}3a`,
                  borderRadius: 5, padding: '0.18rem 0.45rem',
                }}>{pay(c.outcome)}</span>
                {cleared && (
                  <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                    flexShrink: 0, fontSize: '0.55rem', color: mine ? EVENT_ACCENT : 'rgba(190,212,228,0.4)',
                  }}>{mine ? 'Taken' : 'Gone'}</span>
                )}
              </div>
              <span className="font-karla" style={{
                fontSize: '0.74rem', lineHeight: 1.45, color: 'rgba(226,232,236,0.66)',
              }}>{c.description}</span>
              {!cleared && (
                <button type="button" disabled={pending} onClick={() => onPick(c.id)}
                  className="font-cinzel font-700 uppercase tracking-[0.06em]"
                  style={{
                    marginTop: 1, padding: '0.58rem', borderRadius: 9, fontSize: '0.8rem',
                    background: `${EVENT_ACCENT}22`, border: `1px solid ${EVENT_ACCENT}5c`,
                    color: EVENT_ACCENT, cursor: pending ? 'wait' : 'pointer',
                    opacity: pending ? 0.6 : 1,
                  }}>{pending ? '…' : c.label}</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── AN INSPECTION TO STAND ────────────────────────────────────────────────
   `musterReport` is PURE and is the same function `standForMuster` re-runs on
   the server, so a row that reads green here is a row the server will agree
   about. The rows that fail name what is missing rather than saying no: being
   turned back is only useful if it comes with the fix. */
function Muster({ node, state, cleared, pending, onStand }: {
  node: RaidNode
  state: NodeSheetState
  cleared: boolean
  pending: boolean
  onStand: () => void
}) {
  const report = musterReport(node.muster!, state.musterParty)
  const passed = report.passed
  return (
    <div style={{ marginTop: '0.4rem' }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{
        fontSize: '0.6rem', color: 'rgba(190,212,228,0.5)', marginBottom: '0.5rem',
      }}>{cleared ? 'The ledger · passed' : 'The manifest'}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {report.rows.map(r => (
          <div key={r.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 9,
            borderRadius: 11, padding: '0.62rem 0.72rem',
            background: r.ok ? 'rgba(127,212,154,0.07)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${r.ok ? 'rgba(127,212,154,0.32)' : 'rgba(230,160,160,0.3)'}`,
          }}>
            <span aria-hidden style={{
              flexShrink: 0, marginTop: 1, display: 'flex',
              color: r.ok ? '#7fd49a' : '#e6a0a0',
            }}>
              {r.ok
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-karla font-700" style={{ margin: 0, fontSize: '0.82rem', color: '#e6e1d6' }}>{r.label}</p>
              <p className="font-karla" style={{
                margin: '2px 0 0', fontSize: '0.7rem', lineHeight: 1.4,
                color: r.ok ? 'rgba(236,240,244,0.55)' : 'rgba(230,160,160,0.75)',
              }}>{r.met.length > 0 ? r.met.join(', ') : 'Nobody aboard answers this'}</p>
            </div>
          </div>
        ))}
      </div>
      {cleared ? null : passed ? (
        <button type="button" disabled={pending} onClick={onStand}
          className="font-cinzel font-700 uppercase tracking-[0.08em]"
          style={{
            width: '100%', marginTop: '0.85rem', padding: '0.7rem', borderRadius: 11,
            fontSize: '0.82rem', cursor: pending ? 'wait' : 'pointer',
            background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, color: GOLD,
            opacity: pending ? 0.6 : 1,
          }}>{pending ? 'Standing…' : 'Stand for inspection'}</button>
      ) : (
        // NOT A DISABLED BUTTON. A greyed CTA says "the game is broken"; this
        // says what to go and do, and the crew panel is a disc away.
        <p className="font-karla font-600" style={{
          margin: '0.85rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(230,160,160,0.85)',
        }}>
          The clerk turns you back. Fix the party in your crew and come alongside again.
        </p>
      )}
    </div>
  )
}

/* ── TERMS, AND WHERE THE REFIT IS BOUGHT ──────────────────────────────────
   Hearing the yard out is what clears the stop and opens the chain; buying is
   separate, optional, and lives in Manage Ship. Both are true on the map too —
   its own note says the purchase lives there — so this is the same rule with
   the till left where it already is. */
function Terms({ node, state, cleared, pending, onHear }: {
  node: RaidNode
  state: NodeSheetState
  cleared: boolean
  pending: boolean
  onHear: () => void
}) {
  const berth = !!node.berth
  const price = (node.berth ?? node.armory)!.price
  const owned = berth ? state.hasSixthBerth : state.hasArmoryExpansion
  const what = berth ? 'a sixth crew berth' : 'a sixth item mount'
  return (
    <div style={{
      marginTop: '0.4rem', borderRadius: 13, padding: '0.85rem 0.85rem 0.9rem',
      background: 'rgba(224,164,74,0.07)', border: '1px solid rgba(224,164,74,0.32)',
    }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{
        margin: 0, fontSize: '0.58rem', color: 'rgba(224,164,74,0.85)',
      }}>The refit</p>
      <p className="font-karla" style={{
        margin: '0.4rem 0 0', fontSize: '0.84rem', lineHeight: 1.55, color: 'rgba(236,240,244,0.82)',
      }}>
        {owned
          ? `Cut and fitted. She carries ${what}.`
          : `${price.toLocaleString()} ⟡ buys ${what}, for good.`}
      </p>
      {!owned && (
        <p className="font-karla" style={{
          margin: '0.45rem 0 0', fontSize: '0.72rem', lineHeight: 1.5, color: 'rgba(190,212,228,0.55)',
        }}>
          The yard does the cutting at the Gunwharf. Open Your Ship and it is under Refits.
        </p>
      )}
      {!cleared && (
        <button type="button" disabled={pending} onClick={onHear}
          className="font-cinzel font-700 uppercase tracking-[0.08em]"
          style={{
            width: '100%', marginTop: '0.8rem', padding: '0.7rem', borderRadius: 11,
            fontSize: '0.82rem', cursor: pending ? 'wait' : 'pointer',
            background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, color: GOLD,
            opacity: pending ? 0.6 : 1,
          }}>{pending ? '…' : 'Terms heard'}</button>
      )}
    </div>
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
