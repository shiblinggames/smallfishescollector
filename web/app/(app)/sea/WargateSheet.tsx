'use client'

// ── THE WARGATE'S LEDGER ────────────────────────────────────────────────────
//
// What the standing portal north of the sortie shows when you step in: every
// boss on the water, in campaign order, as the same cards the expedition map
// deals — the drops, the records, all of it — with one difference of verb.
// Pressing the card does not enter the raid; it SAILS you there. The gate
// opens on that boss's own water and you arrive at their mooring.
//
// THE GATE KEEPS TROPHIES, IT DOES NOT TELL FORTUNES. A boss you have bested
// gets a card and a crossing. A boss you have MET but not beaten is named and
// shown — you have stood off their hull, there is nothing left to spoil — but
// the gate will not carry you to a fight you have not won: the voyage out is
// still yours to sail. And a boss the campaign has not reached is not here at
// all, not even as a silhouette.
//
// The data is bossCardState — the node map's own read, the same one the boss
// card over the water uses — so the gate cannot disagree with the map about
// what is cleared, what is next, and what a card shows.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import { bossCardState, type BossCardState } from './bossCardActions'
import { ENCOUNTERS, BAY_BY_ID, type Encounter } from './raidWaters'
import { RAID_MAP, type RaidNodeView } from '@/lib/raidMap'

const BossFightModal = dynamic(
  () => import('@/app/(app)/expeditions/RaidsSection').then(m => m.BossFightModal),
  { ssr: false },
)

/** The sea's fights, in campaign order — the gate lists exactly what stands on
 *  the water, which is the set you can actually be carried to. */
function seaBosses(): Encounter[] {
  return [...ENCOUNTERS]
    .filter(e => RAID_MAP.find(n => n.id === e.node)?.type === 'raid')
    .sort((a, b) => RAID_MAP.findIndex(n => n.id === a.node) - RAID_MAP.findIndex(n => n.id === b.node))
}

export default function WargateSheet({ preloaded, onSail, onClose }: {
  /** Read on approach by the chart, like the boss card's — see the prefetch
   *  where nearGate is set. The fetch below is only the fallback. */
  preloaded?: BossCardState | null
  /** THE CROSSING. Hands back the encounter whose mooring the gate opens on. */
  onSail: (enc: Encounter) => void
  onClose: () => void
}) {
  const [fetched, setFetched] = useState<BossCardState | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const state = preloaded ?? fetched

  useEffect(() => {
    if (preloaded) return
    let live = true
    bossCardState().then(r => { if (live && !('error' in r)) setFetched(r) }, () => {})
    return () => { live = false }
  }, [preloaded])

  if (typeof document === 'undefined') return null

  const bosses = seaBosses()
  const viewOf = (id: string): RaidNodeView | null =>
    state?.views.find(v => v.node.id === id) ?? null

  const selEnc = sel ? bosses.find(e => e.node === sel) ?? null : null
  const selView = sel ? viewOf(sel) : null

  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 118 }}>
      {/* The scrim is the close: the gate is a place you step out of. */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 30%, rgba(20,32,50,0.88) 0%, rgba(2,5,10,0.96) 70%)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 'calc(env(safe-area-inset-top, 0px) + 72px) 14px 40px',
        pointerEvents: 'none',
      }}>
        <div style={{ width: 'min(560px, 100%)', pointerEvents: 'auto' }}>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.22em', color: '#8fa8bf', textAlign: 'center' }}>The standing portal</p>
          <h2 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f4efe4', textAlign: 'center', marginTop: 2 }}>The Wargate</h2>
          <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a8b4c4', textAlign: 'center', marginTop: 6, marginBottom: 18 }}>
            Old foes, kept close. Step through to any you have bested and the gate opens on their water.
          </p>

          {bosses.map(e => {
            const v = viewOf(e.node)
            // NOT REACHED, NOT SHOWN. The list simply ends where the campaign
            // does, which is the whole of the no-spoilers rule.
            if (!v || v.status === 'locked') return null
            const cleared = v.status === 'cleared'
            const bay = BAY_BY_ID[e.bay]
            const art = v.node.image ?? null
            return (
              <button key={e.node} type="button" className="tap"
                onClick={() => { if (cleared) setSel(e.node) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  textAlign: 'left', marginBottom: 10, padding: '0.65rem 0.75rem',
                  borderRadius: 14, cursor: cleared ? 'pointer' : 'default',
                  // Opaque base under the tint — panels on art need one.
                  background: cleared
                    ? 'linear-gradient(180deg, rgba(16,26,40,0.97) 0%, rgba(9,15,26,0.97) 100%)'
                    : 'rgba(10,15,24,0.92)',
                  border: `1px solid ${cleared ? 'rgba(196,169,106,0.55)' : 'rgba(140,156,176,0.22)'}`,
                  boxShadow: cleared ? '0 4px 18px rgba(0,0,0,0.5)' : 'none',
                  opacity: cleared ? 1 : 0.78,
                }}>
                {/* The art in a reserved box, contained, never stretched. */}
                <div style={{
                  width: 74, height: 52, flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art} alt="" decoding="async" style={{
                      maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                      filter: cleared ? 'none' : 'grayscale(0.7) brightness(0.75)',
                    }} />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#8a94a4' }}>
                    {bay ? `Chapter ${['I', 'II', 'III', 'IV', 'V'][bay.chapter - 1] ?? bay.chapter} · ${bay.name}` : ''}
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: cleared ? '#f4efe4' : '#b8bec8', lineHeight: 1.2, marginTop: 1 }}>
                    {v.node.label}
                  </p>
                  <p className="font-karla font-600" style={{ fontSize: '0.62rem', marginTop: 2, color: cleared ? 'rgba(196,169,106,0.9)' : '#7d8794' }}>
                    {cleared ? 'Bested · the gate reaches them' : 'Not yet bested · sail out and take them'}
                  </p>
                </div>
                {cleared && (
                  <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: 'rgba(196,169,106,0.9)', flexShrink: 0 }}>→</span>
                )}
              </button>
            )
          })}

          {!state && (
            /* Nothing while it reads — the same rule as the boss card: a line
               announcing a wait turns a 100ms gap into an event. */
            <div style={{ height: 120 }} />
          )}
        </div>
      </div>

      {/* THE CARD, the map's own, with the gate's verb. challenge is withheld
          on purpose: the gate carries you to the WATER, and which run you take
          is chosen at the mooring like always. repairOwed 0 likewise — a holed
          ship can still sail, and the mooring will collect the debt before the
          guns do. */}
      {selEnc && selView && state && (
        <BossFightModal
          boss={selView}
          challenge={null}
          rec={selView.node.raidId ? state.raidRecords[selView.node.raidId] ?? null : null}
          challengeRec={null}
          ownedRaidItems={state.ownedRaidItems}
          ownedShipSkins={state.ownedShipSkins}
          ownedSpecialItems={state.ownedSpecialItems}
          totalFortune={state.totalFortune}
          isNext={false}
          repairOwed={0}
          enterLabel="Sail There →"
          enterSub="The gate opens on their water"
          onEnter={() => onSail(selEnc)}
          onRepairBlocked={() => setSel(null)}
          onClose={() => setSel(null)}
          clearedNodeIds={new Set(state.clearedNodeIds)}
        />
      )}
    </div>,
    document.body,
  )
}
