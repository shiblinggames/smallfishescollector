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
  () => import('@/app/(app)/expeditions/RaidsSection').then(m => m.BossFightModal),
  { ssr: false },
)

export default function BossCardSheet({ nodeId, onEnter, onClose }: {
  /** The campaign node whose hull you are alongside. */
  nodeId: string | null
  /**
   * TAKE IT ON. The route is the card's answer to which run you picked — the
   * challenge branch is its own node with its own route — and the chart turns
   * that back into a raid to fight on the water.
   */
  onEnter: (route: string) => void
  onClose: () => void
}) {
  const [state, setState] = useState<BossCardState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // READ ON EVERY OPEN. Records, owned items and the repair debt all move
  // between fights, and a stale card would offer a challenge you have since
  // cleared or hide a drop you have since earned.
  useEffect(() => {
    if (!nodeId) { setState(null); return }
    let live = true
    setErr(null)
    setState(null)
    bossCardState().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setState(r)
    }, () => { if (live) setErr('The charts would not open. Try again.') })
    return () => { live = false }
  }, [nodeId])

  if (!nodeId || typeof document === 'undefined') return null

  const boss: RaidNodeView | null = state?.views.find(v => v.node.id === nodeId) ?? null
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
          repairOwed={state.repairOwed}
          onEnter={onEnter}
          // SHE IS HOLED AND THE CARD SAYS SO. On the page this routes you to
          // the repair; out here there is nowhere to route to, so the card
          // shuts and the captain is left where they were floating.
          onRepairBlocked={onClose}
          onClose={onClose}
          clearedNodeIds={new Set(state.clearedNodeIds)}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <p className="font-karla font-600 uppercase tracking-[0.16em]"
            style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf' }}>
            {err ?? 'Reading the charts…'}
          </p>
        </div>
      )}
    </div>,
    document.body,
  )
}
