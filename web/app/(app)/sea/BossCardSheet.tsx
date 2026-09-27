'use client'

// ── THE CARD YOU GET BEFORE THE GUNS ────────────────────────────────────────
//
// Sailing up to a hull and pressing the action used to drop you straight into a
// broadside. That is a beat too fast, and it also quietly removed a decision:
// the challenge run is chosen on this card and nowhere else, so a fight entered
// from the water could only ever be the normal one.
//
// So the card comes first, exactly as it does on /expeditions — the boss, what
// it drops, your records against it, and the choice of which run you are taking
// on. Then the guns.
//
// ── THE SAME CARD, NOT A SECOND ONE ─────────────────────────────────────────
//
// `BossFightModal` is imported from the node map rather than reimplemented.
// Every drop chance, every mask on a boss the story has not introduced, every
// rule about when the challenge is offered lives in it already, and a copy out
// here would be wrong within a month. It is loaded on demand: it is a large
// component belonging to another page, and nobody sailing past a boss should
// pay for it.
//
// The data behind it comes from `getRaidMapView` — the node map's own read —
// for the same reason. See bossCardActions.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import { bossCardState, type BossCardState } from './bossCardActions'
import type { RaidNodeView } from '@/lib/raidMap'

const BossFightModal = dynamic(
  () => import('@/app/(app)/expeditions/BossFightModal').then(m => m.BossFightModal),
  { ssr: false },
)

export default function BossCardSheet({ nodeId, preloaded, onEnter, onClose }: {
  /** The campaign node whose hull you are alongside. */
  nodeId: string | null
  /**
   * ALREADY READ, USUALLY. The chart fetches this the moment you come within
   * reach of a hull, so by the time you press there is nothing to wait for and
   * the card is simply up. The fetch below is the fallback for the case where
   * you got here faster than the network did.
   */
  preloaded?: BossCardState | null
  /**
   * TAKE IT ON. The route is the card's answer to which run you picked — the
   * challenge branch is its own node with its own route — and the chart turns
   * that back into a raid to fight on the water.
   */
  onEnter: (route: string) => void
  onClose: () => void
}) {
  const [fetched, setFetched] = useState<BossCardState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  /** Set when the chart's pre-read did not have this boss in it: read fresh. */
  const [stale, setStale] = useState(false)
  /** The read is taking long enough to say so (and offer a way out). */
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const state = (stale ? null : preloaded) ?? fetched

  // ONLY IF THE CHART DID NOT ALREADY HAVE IT. Records, owned items and the
  // repair debt all move between fights, so this is read fresh — but it is read
  // on APPROACH, up in the chart, not on the press. Waiting until the press put
  // a loading line where the card should have been.
  useEffect(() => {
    if (!nodeId || (preloaded && !stale)) return
    let live = true
    setErr(null)
    setSlow(false)
    const t = setTimeout(() => { if (live) setSlow(true) }, 6000)
    bossCardState().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setFetched(r)
    }, () => { if (live) setErr('The charts would not open. Try again.') })
      .finally(() => clearTimeout(t))
    return () => { live = false; clearTimeout(t) }
  }, [nodeId, preloaded, stale, attempt])

  if (!nodeId || typeof document === 'undefined') return null

  const boss: RaidNodeView | null = state?.views.find(v => v.node.id === nodeId) ?? null
  // ── NEVER AN INVISIBLE WALL (Kong, 2026-09-27: pressing to enter Barnacle
  // Pete's raid froze until a refresh) ─────────────────────────────────────
  // While this waited it drew NOTHING over a full-screen layer that swallows
  // every press, with the chart already stood down for the fight behind it.
  // And when the chart's pre-read existed but did not contain this boss, it
  // never read again: an invisible, unclosable wall until a refresh. Now a
  // pre-read without the boss is read fresh once, the wait shows a card with a
  // way out, and a failure says so with a Close.
  const missing = !!state && !boss
  useEffect(() => { if (missing && preloaded && !stale) setStale(true) }, [missing, preloaded, stale])
  // The challenge run is a SIDE BRANCH hanging off the boss, which is how the
  // node map models it and therefore how the card expects to be handed it.
  const challenge: RaidNodeView | null =
    state?.views.find(v => v.node.sideBranch?.parentId === nodeId) ?? null

  return createPortal(
    <div
      // The chart steers on pointer events, and this is a React portal — which
      // bubbles along the React tree, not the DOM one. Without this the card's
      // own backdrop would put the helm over.
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 114 }}>
      {state && boss ? (
        <BossFightModal
          boss={boss}
          challenge={challenge}
          rec={boss.node.raidId ? state.raidRecords[boss.node.raidId] ?? null : null}
          challengeRec={challenge?.node.raidId ? state.raidRecords[challenge.node.raidId] ?? null : null}
          ownedRaidItems={state.ownedRaidItems}
          ownedShipSkins={state.ownedShipSkins}
          ownedSpecialItems={state.ownedSpecialItems}
          totalFortune={state.totalFortune}
          isNext={boss.status === 'available'}
          onEnter={onEnter}
          onClose={onClose}
          clearedNodeIds={new Set(state.clearedNodeIds)}
        />
      ) : (
        // WAITING, FAILED, OR THE BOSS IS NOT ON THE CHARTS. The quick case is
        // still silent for a beat (the chart reads this on approach, so the
        // wait is usually nothing); past it, a card that says so and can be
        // closed, because the layer under it swallows every press.
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: err || slow || (missing && stale) ? 'rgba(3,5,9,0.6)' : 'transparent' }}
          onClick={() => { if (err || slow || (missing && stale)) onClose() }}>
          {(err || slow || (missing && stale)) && (
            <div onClick={e => e.stopPropagation()} style={{
              width: 'min(340px, 90vw)', padding: '1rem 1.1rem', borderRadius: 16, textAlign: 'center',
              background: 'rgba(10,12,18,0.97)', border: '1px solid rgba(196,169,106,0.35)', boxShadow: '0 16px 44px rgba(0,0,0,0.6)',
            }}>
              <p className="font-karla font-700" style={{ margin: '0 0 12px', fontSize: '0.86rem', color: err || (missing && stale) ? '#f3a3a3' : '#e6dccb', lineHeight: 1.45 }}>
                {err ?? (missing && stale ? 'That fight is not on your charts yet.' : 'Reading the charts is taking a while.')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {!(missing && stale) && (
                  <button type="button" onClick={() => { setFetched(null); setErr(null); setStale(true); setAttempt(a => a + 1) }}
                    className="font-cinzel font-700" style={{ flex: 1, padding: '0.6rem', borderRadius: 10, cursor: 'pointer', fontSize: '0.84rem', color: '#f6d77a', background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.5)' }}>
                    Try again
                  </button>
                )}
                <button type="button" onClick={onClose}
                  className="font-cinzel font-700" style={{ flex: 1, padding: '0.6rem', borderRadius: 10, cursor: 'pointer', fontSize: '0.84rem', color: '#d8dee6', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.18)' }}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
