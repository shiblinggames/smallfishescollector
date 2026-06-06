'use client'

// Expeditions hub: two cards (Story + Voyages) below the Ship Hero.
// Tapping a card opens a focused prep modal that contains the full
// launch flow inline — repair (if owed), crew assignment, items
// equip, all without leaving the modal. Nested PopupShells handle the
// item / crew detail editors.

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import PopupShell from '@/components/PopupShell'
import { RAID_ITEMS } from '@/lib/raidItems'
import { saveEquippedRaidItems } from './actions'
import { repairShip } from '@/app/(app)/raids/actions'
import type { CrewMember } from '@/app/dev/crew/actions'
import { RARITY_COLORS as CREW_RARITY_COLORS } from '@/lib/crewGen'
import DailyVoyagePanel from './DailyVoyagePanel'

const CREW_IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'
import type { DailyVoyage } from './voyageActions'
import type { VoyageHistoryEntry } from './VoyageHistory'
import { getRankTitle, type ShipStats } from '@/lib/expeditions'

export type CampaignCardData = {
  nextNodeId: string | null
  nextNodeName: string | null
  nextNodeImage: string | null
  nextNodeLocked: boolean
  nextNodeLockReason: string | null
  clearedCount: number
  totalNodes: number
  repairOwed: number
  equippedItemsCount: number
}

export type VoyageStatus = 'idle' | 'sailing' | 'returned'

export type VoyageCardData = {
  status: VoyageStatus
  statusLabel: string
  routeName: string | null
  /** 0..1 voyage completion when status is 'sailing', otherwise null. Drives
   *  the progress bar at the bottom of the hub card. */
  progress: number | null
}

interface Props {
  campaign: CampaignCardData
  voyages: VoyageCardData
  doubloons: number
  ownedRaidItems: string[]
  equippedRaidItems: string[]
  raidItemSlots: number
  roster: CrewMember[]
  shipCrewSlots: number
  // Live readiness numbers (mirrors ShipHero's loadout math). Surfaced
  // inside the prep modals so the player sees what they're committing
  // with before tapping Begin / Set Sail.
  shipStats: ShipStats
  voyageScore: number
  raidScore: number
  // DailyVoyagePanel-required props. The panel used to render inline
  // below the hub; now lives inside the Voyages modal so the data
  // pipes through here.
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  expeditionXP: number
  voyageHistory: VoyageHistoryEntry[]
}

const VOYAGE_ACCENT: Record<VoyageStatus, { fg: string; bg: string; bd: string }> = {
  idle:     { fg: '#7090c0', bg: 'rgba(112,144,192,0.10)', bd: 'rgba(112,144,192,0.32)' },
  sailing:  { fg: '#c4a96a', bg: 'rgba(196,169,106,0.10)', bd: 'rgba(196,169,106,0.32)' },
  returned: { fg: '#4ade80', bg: 'rgba(74,222,128,0.12)',  bd: 'rgba(74,222,128,0.4)'   },
}

const RARITY_RING: Record<number, string> = {
  1: 'rgba(180,176,168,0.55)',
  2: 'rgba(74,222,128,0.55)',
  3: 'rgba(96,165,250,0.55)',
  4: 'rgba(192,132,252,0.55)',
  5: 'rgba(251,146,60,0.65)',
}

export default function HubCards({
  campaign, voyages, doubloons,
  ownedRaidItems, equippedRaidItems, raidItemSlots,
  roster, shipCrewSlots,
  shipStats, voyageScore, raidScore,
  shipTier, todayVoyage, readyVoyage, expeditionXP, voyageHistory,
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'campaign' | 'voyages'>(null)
  const [innerModal, setInnerModal] = useState<null | 'items'>(null)
  const [, startTransition] = useTransition()

  // Esc closes the topmost modal layer
  useEffect(() => {
    if (!modal) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (innerModal) setInnerModal(null)
      else setModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal, innerModal])

  // Begin → open the current node's detail sheet directly (no map
  // detour). RaidsSection listens for this and gates on repair-block.
  function beginNextNode() {
    if (!campaign.nextNodeId) return
    setModal(null)
    window.dispatchEvent(new CustomEvent('expedition:open-node', { detail: { nodeId: campaign.nextNodeId } }))
  }

  const campaignAccent = '#c4a96a'
  const vAcc = VOYAGE_ACCENT[voyages.status]
  const equippedCount = equippedRaidItems.length

  // ── Item equip / unequip — local optimistic mirror, server save, then
  //    router.refresh() so the page re-derives ready-check state.
  function toggleItem(itemId: string) {
    const isEquipped = equippedRaidItems.includes(itemId)
    let next: string[]
    if (isEquipped) {
      next = equippedRaidItems.filter(x => x !== itemId)
    } else {
      if (equippedRaidItems.length >= raidItemSlots) return  // full; ignore tap
      next = [...equippedRaidItems, itemId]
    }
    startTransition(async () => {
      await saveEquippedRaidItems(next)
      router.refresh()
    })
  }

  // ── Repair — guarded by canAfford; after success the parent
  //    re-derives campaign.repairOwed (going to 0) on refresh.
  const [repairing, setRepairing] = useState(false)
  const [repairErr, setRepairErr] = useState<string | null>(null)
  function doRepair() {
    if (repairing) return
    setRepairErr(null)
    setRepairing(true)
    startTransition(async () => {
      try {
        const res = await repairShip()
        if ('error' in res) { setRepairErr(res.error); return }
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
        router.refresh()
      } finally { setRepairing(false) }
    })
  }

  return (
    <>
      {/* ── Hub cards (2-col) ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.2rem' }}>
        <button
          type="button"
          onClick={() => setModal('campaign')}
          style={{
            background: 'rgba(6,12,20,0.92)',
            border: `1px solid ${campaignAccent}30`,
            borderTop: `1px solid ${campaignAccent}55`,
            borderRadius: 18, padding: '0.85rem 0.85rem 0.95rem',
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, marginBottom: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.nextNodeImage ?? '/raidlog.png'} alt=""
              style={{ width: '100%', height: 58, objectFit: 'contain', filter: `drop-shadow(0 4px 14px ${campaignAccent}40)` }} />
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.1, marginBottom: 6 }}>Campaign</p>
          <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: '#b8b0a0', lineHeight: 1.4, marginBottom: 10 }}>
            Story chapters, boss raids, and the hunt for the Finndicate.
          </p>
          <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${campaignAccent}1c` }}>
            <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#e8d8a8', lineHeight: 1.3 }}>
              {campaign.nextNodeName ? `Next: ${campaign.nextNodeName}` : 'All cleared'}
            </p>
            {campaign.nextNodeLocked && campaign.nextNodeLockReason && (
              <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#a8896a', lineHeight: 1.3, marginTop: 2 }}>
                🔒 {campaign.nextNodeLockReason}
              </p>
            )}
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#7a7672', lineHeight: 1.3, marginTop: 2 }}>
              {campaign.clearedCount}/{campaign.totalNodes} cleared
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setModal('voyages')}
          style={{
            background: voyages.status === 'sailing'
              ? `linear-gradient(180deg, ${vAcc.fg}1c 0%, rgba(6,12,20,0.92) 60%)`
              : 'rgba(6,12,20,0.92)',
            border: `1px solid ${voyages.status === 'sailing' ? `${vAcc.fg}80` : vAcc.bd}`,
            borderTop: `1px solid ${voyages.status === 'sailing' ? vAcc.fg : `${vAcc.fg}55`}`,
            boxShadow: voyages.status === 'sailing' ? `0 0 18px ${vAcc.fg}30` : undefined,
            borderRadius: 18, padding: '0.85rem 0.85rem 0.95rem',
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', flexDirection: 'column', position: 'relative',
            overflow: 'hidden',
          }}
        >
          {(voyages.status === 'returned' || voyages.status === 'sailing') && (
            <span aria-hidden style={{
              position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 9,
              background: voyages.status === 'returned' ? '#4ade80' : vAcc.fg,
              boxShadow: voyages.status === 'returned'
                ? '0 0 8px rgba(74,222,128,0.7)'
                : `0 0 8px ${vAcc.fg}b0`,
              animation: 'shop-pulse 1.6s ease-in-out infinite',
            }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, marginBottom: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/voyagemap.png" alt=""
              className={voyages.status === 'sailing' ? 'voyage-card-bob' : undefined}
              style={{ width: '100%', height: 58, objectFit: 'contain', filter: `drop-shadow(0 4px 14px ${vAcc.fg}${voyages.status === 'sailing' ? '90' : '50'})` }} />
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.1, marginBottom: 6 }}>Voyages</p>
          <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: '#b8b0a0', lineHeight: 1.4, marginBottom: 10 }}>
            Send your crew off to earn doubloons, gems, and rare drops.
          </p>
          <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${vAcc.fg}1c` }}>
            <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: vAcc.fg, lineHeight: 1.3 }}>
              {voyages.statusLabel}
            </p>
            {voyages.routeName && (
              <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#7a7672', lineHeight: 1.3, marginTop: 2 }}>
                {voyages.routeName}
              </p>
            )}
          </div>
          {/* Voyage-in-progress bar — anchored to the bottom edge of the
              card so the player can see how close the crew is to returning
              at a glance, no modal open required. */}
          {voyages.status === 'sailing' && voyages.progress != null && (
            <div aria-hidden style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: 3, background: 'rgba(0,0,0,0.5)',
            }}>
              <div style={{
                width: `${Math.round(voyages.progress * 100)}%`, height: '100%',
                background: `linear-gradient(90deg, ${vAcc.fg}, ${vAcc.fg}cc)`,
                boxShadow: `0 0 6px ${vAcc.fg}`,
                transition: 'width 0.5s',
              }} />
            </div>
          )}
        </button>
      </div>

      {/* ── Campaign prep modal ────────────────────────────────────── */}
      <PopupShell open={modal === 'campaign'} onClose={() => setModal(null)}>
        <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 400,
            background: 'linear-gradient(180deg, #1a1408 0%, #0a0807 100%)',
            border: `1px solid ${campaignAccent}55`,
            borderRadius: 20, padding: '1.1rem 1rem 1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.18em] text-center"
            style={{ fontSize: '0.55rem', color: `${campaignAccent}aa`, marginBottom: 4 }}>
            Campaign · The Sunken Hand
          </p>
          <p className="font-cinzel font-700 text-center"
            style={{ fontSize: '1.1rem', color: '#f0e8d0', marginBottom: 10 }}>
            {campaign.nextNodeName ?? 'Story complete'}
          </p>

          <StatsBlock
            score={raidScore}
            scoreLabel="Raid Score"
            scoreColor="#dca494"
            shipStats={shipStats}
          />

          {campaign.nextNodeName && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
              {/* Repair row — only renders when the ship owes repair.
                  Inline Pay & Repair button pays from doubloons; on
                  success the parent re-renders with repairOwed = 0
                  and this row disappears. */}
              {campaign.repairOwed > 0 && (
                <RepairRow
                  owed={campaign.repairOwed}
                  doubloons={doubloons}
                  busy={repairing}
                  error={repairErr}
                  onRepair={doRepair}
                />
              )}
              {/* Crew row — shows the actual slot circles (captain on
                  the left, crew beside it), mirroring the on-deck row
                  on the expedition home page. Tapping any slot opens
                  the Assign Crew picker for that specific slot
                  OVERLAID on this modal (picker uses a higher z than
                  PopupShell). The prep modal stays open underneath so
                  closing/confirming the picker lands the player back
                  here — never on the loadout drawer. */}
              <CrewSlotRow
                roster={roster}
                shipCrewSlots={shipCrewSlots}
                onPick={(pickSlot) => {
                  window.dispatchEvent(new CustomEvent('expedition:open-loadout', { detail: { pickSlot } }))
                }}
              />
              {/* Items row — tap opens a nested modal to toggle items. */}
              <PrepRow
                label="Equip items"
                detail={ownedRaidItems.length === 0 ? 'None owned yet'
                  : `${equippedCount}/${raidItemSlots} equipped`}
                ok={equippedCount > 0}
                disabled={ownedRaidItems.length === 0}
                onClick={() => setInnerModal('items')}
              />
              {campaign.nextNodeLocked && (
                <PrepRow
                  label="Node locked"
                  detail={campaign.nextNodeLockReason ?? 'Locked'}
                  ok={false}
                  disabled
                />
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{
                flex: 1, padding: '0.7rem 0',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(240,237,232,0.6)',
                borderRadius: 12, fontSize: '0.7rem', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {(() => {
              const beginBlocked =
                !campaign.nextNodeId ||
                campaign.nextNodeLocked ||
                campaign.repairOwed > 0
              const beginLabel =
                !campaign.nextNodeId   ? 'Story Complete'
                : campaign.nextNodeLocked ? (campaign.nextNodeLockReason ?? 'Node Locked')
                : campaign.repairOwed > 0 ? 'Repair Ship First'
                : 'Begin →'
              return (
                <button
                  type="button"
                  onClick={beginNextNode}
                  disabled={beginBlocked}
                  className="font-karla font-700 uppercase tracking-[0.08em]"
                  style={{
                    flex: 2, padding: '0.7rem 0',
                    background: beginBlocked ? 'rgba(255,255,255,0.04)' : `${campaignAccent}1c`,
                    border: `1px solid ${beginBlocked ? 'rgba(255,255,255,0.12)' : `${campaignAccent}66`}`,
                    color: beginBlocked ? '#5a5856' : campaignAccent,
                    borderRadius: 12, fontSize: '0.7rem',
                    cursor: beginBlocked ? 'default' : 'pointer',
                  }}
                >
                  {beginLabel}
                </button>
              )
            })()}
          </div>
        </div>
      </PopupShell>

      {/* ── Voyages prep modal ─────────────────────────────────────── */}
      {/* The old standalone DailyVoyagePanel section under the hub
          cards is gone; its full content now lives inside this modal.
          Wider maxWidth + maxHeight + scroll so the whole panel
          (route pick → crew slots → ship-out → claim → results) fits
          without leaving the hub. Close button at the top right; no
          secondary CTA since the panel owns the launch flow now. */}
      <PopupShell open={modal === 'voyages'} onClose={() => setModal(null)}>
        <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          style={{
            // No maxHeight / flex column / overflow:hidden — let the
            // modal grow to its content and PopupShell own the scroll.
            // Avoids the double-scroll trap (see note on the inner div
            // below). Bottom safe-area + tab-bar clearance is already
            // baked into PopupShell's paddingBottom, so the bottom of
            // the modal always lands above the tab bar.
            margin: 'auto', width: '100%', maxWidth: 480,
            background: 'linear-gradient(180deg, #0c1828 0%, #050a14 100%)',
            border: `1px solid ${vAcc.bd}`,
            borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.85rem 1rem 0.6rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]"
                style={{ fontSize: '0.5rem', color: `${vAcc.fg}aa`, marginBottom: 1 }}>
                Daily
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0e8d0' }}>
                Voyages
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close"
              style={{
                width: 30, height: 30, borderRadius: '50%', padding: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#cfcabf', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* No more inner scroll container — the whole modal scrolls
              inside PopupShell. Previously had `flex: 1 + minHeight: 0
              + overflowY: auto + overscroll-behavior: contain` which
              created a double-scroll trap: modal child's maxHeight:88vh
              often exceeded PopupShell's available area (PopupShell
              eats ~156px+safe-area for header+tabbar clearance), so
              PopupShell needed to scroll to reveal the modal's bottom
              — but `overscroll-behavior: contain` on the inner div
              swallowed every swipe before it could bubble up. Bottom
              events of an expanded voyage log were unreachable. Drop
              the inner scroll layer entirely; modal expands to content,
              PopupShell scrolls to reveal everything. Header is no
              longer sticky (it scrolls with the body) — acceptable
              tradeoff for actually-reachable content. */}
          <div style={{ padding: '0.9rem 1rem 1.2rem' }}>
            <StatsBlock
              score={voyageScore}
              scoreLabel="Voyage Score"
              scoreColor="#9ab4dc"
              shipStats={shipStats}
            />
            <DailyVoyagePanel
              roster={roster}
              shipTier={shipTier}
              todayVoyage={todayVoyage}
              readyVoyage={readyVoyage}
              expeditionXP={expeditionXP}
              voyages={voyageHistory}
            />
          </div>
        </div>
      </PopupShell>

      {/* ── Nested: Items editor ───────────────────────────────────── */}
      <PopupShell open={innerModal === 'items'} onClose={() => setInnerModal(null)}>
        <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 420,
            background: 'linear-gradient(180deg, #14110a 0%, #0a0807 100%)',
            border: '1px solid rgba(196,169,106,0.45)',
            borderRadius: 20, padding: '1.1rem 1rem 1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            maxHeight: '88vh', overflowY: 'auto', overscrollBehavior: 'contain',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]"
                style={{ fontSize: '0.55rem', color: 'rgba(196,169,106,0.7)' }}>
                Raid Items
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0' }}>
                {equippedCount}/{raidItemSlots} equipped
              </p>
            </div>
            <button
              type="button" onClick={() => setInnerModal(null)}
              aria-label="Close"
              style={{
                width: 30, height: 30, borderRadius: '50%', padding: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#cfcabf', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {ownedRaidItems.length === 0 ? (
            <p className="font-karla font-400 text-center py-5" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.5)' }}>
              You haven't claimed any raid items yet.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {ownedRaidItems.map(itemId => {
                const def = RAID_ITEMS.find(i => i.id === itemId)
                if (!def) return null
                const isEquipped = equippedRaidItems.includes(itemId)
                const isFull = equippedRaidItems.length >= raidItemSlots && !isEquipped
                const ring = RARITY_RING[(['common','uncommon','rare','epic','legendary'] as const).indexOf(def.rarity) + 1] ?? 'rgba(255,255,255,0.18)'
                return (
                  <button
                    key={itemId}
                    type="button"
                    onClick={() => { if (!isFull) toggleItem(itemId) }}
                    disabled={isFull}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      padding: '0.65rem 0.55rem 0.7rem',
                      borderRadius: 12,
                      background: isEquipped ? 'rgba(196,169,106,0.16)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isEquipped ? 'rgba(196,169,106,0.65)' : ring}`,
                      cursor: isFull ? 'default' : 'pointer',
                      opacity: isFull ? 0.5 : 1,
                      textAlign: 'center', position: 'relative',
                    }}
                  >
                    {isEquipped && (
                      <span aria-hidden style={{
                        position: 'absolute', top: 4, right: 5,
                        fontSize: '0.6rem', color: '#f0d695',
                      }}>✓</span>
                    )}
                    {def.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={def.image} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '2rem', lineHeight: 1 }}>{def.emoji}</span>
                    )}
                    <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: '#f0ede8', lineHeight: 1.15 }}>{def.name}</p>
                    <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(240,237,232,0.5)', lineHeight: 1.3 }}>
                      {isEquipped ? 'Tap to unequip' : isFull ? 'Slots full' : 'Tap to equip'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopupShell>

      {/* Crew is now handled by the ShipHero Loadout drawer — the
          Crew prep row dispatches 'expedition:open-loadout' with
          mode:'campaign' and the loadout drawer hosts the canonical
          slot picker. One UI, two entry points (Manage Ship button +
          this prep row). */}
    </>
  )
}

// ── Stats block ───────────────────────────────────────────────────────
// Compact readiness card surfaced at the top of each prep modal. Big
// score tile (Raid Score for campaign, Voyage Score for voyages) with
// rank title, plus a 3-column ship-stats strip (HP / Speed / DMG) so
// the player sees the hull they're committing alongside their score.
function StatsBlock({ score, scoreLabel, scoreColor, shipStats }: {
  score: number
  scoreLabel: string
  scoreColor: string
  shipStats: ShipStats
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '0.7rem 0.85rem', borderRadius: 12,
        background: `linear-gradient(135deg, ${scoreColor}1a 0%, rgba(8,7,6,0.35) 72%)`,
        border: `1px solid ${scoreColor}40`,
        marginBottom: 7,
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.16em]"
            style={{ fontSize: '0.5rem', color: `${scoreColor}cc` }}>
            {scoreLabel}
          </p>
          <p className="font-cinzel font-700"
            style={{ fontSize: '0.74rem', color: scoreColor, fontStyle: 'italic', marginTop: 2 }}>
            {getRankTitle(score)}
          </p>
        </div>
        <p className="font-cinzel font-700"
          style={{ fontSize: '1.95rem', lineHeight: 1, color: scoreColor }}>
          {score}<span style={{ fontSize: '0.78rem', color: `${scoreColor}99` }}>/100</span>
        </p>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
      }}>
        <StatTile label="HP" value={shipStats.durability} />
        <StatTile label="Speed" value={shipStats.speed} />
        <StatTile label="DMG" value={`${shipStats.minDamage}+`} />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      padding: '0.45rem 0.5rem', borderRadius: 9,
      background: 'rgba(0,0,0,0.32)',
      border: '1px solid rgba(255,255,255,0.08)',
      textAlign: 'center',
    }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]"
        style={{ fontSize: '0.48rem', color: '#8a8680' }}>
        {label}
      </p>
      <p className="font-cinzel font-700"
        style={{ fontSize: '0.88rem', color: '#f0ede8', marginTop: 1 }}>
        {value}
      </p>
    </div>
  )
}

// ── Prep row primitive ────────────────────────────────────────────────
// Single tappable row with a check icon, label, and a side detail. Used
// for Crew / Equip Items inside the campaign + voyages modals.
// Crew row showing the actual slot circles (captain on the left, crew
// to the right) — mirrors the on-deck row from the expedition home
// page. Each circle is tappable: filled circles show the assigned
// crew portrait with a rarity ring, empty circles show a dashed +.
// Tap → fires onPick(slotIndex), parent dispatches the loadout event.
function CrewSlotRow({ roster, shipCrewSlots, onPick }: {
  roster: CrewMember[]
  shipCrewSlots: number
  onPick: (slot: number) => void
}) {
  const slots: (CrewMember | null)[] = Array(shipCrewSlots).fill(null)
  for (const c of roster) {
    if (c.assignedSlot != null && c.assignedSlot >= 0 && c.assignedSlot < shipCrewSlots) {
      slots[c.assignedSlot] = c
    }
  }
  const CAPTAIN_SIZE = 48
  const CREW_SIZE = 40
  function circle(card: CrewMember | null, i: number, size: number) {
    const isCaptain = i === 0
    const rc = card ? (CREW_RARITY_COLORS[card.rarity as 1 | 2 | 3 | 4] ?? '#6a6764') : '#6a6764'
    const ring = card ? (isCaptain ? '#f0c040' : rc) : (isCaptain ? '#f0c040' : 'rgba(255,255,255,0.55)')
    if (card) {
      return (
        <button type="button" onClick={() => onPick(i)} aria-label={isCaptain ? 'Change captain' : `Change crew slot ${i + 1}`}
          style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: `2px solid ${ring}`, padding: 0, background: 'rgba(6,9,16,0.85)', boxShadow: '0 2px 6px rgba(0,0,0,0.55)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CREW_IMG_BASE + card.filename} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        </button>
      )
    }
    return (
      <button type="button" onClick={() => onPick(i)} aria-label={isCaptain ? 'Assign captain' : `Assign crew slot ${i + 1}`}
        style={{ width: size, height: size, borderRadius: '50%', border: `2px dashed ${ring}`, background: 'rgba(6,9,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
        <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" fill="none" stroke={isCaptain ? '#f0c040' : 'rgba(255,255,255,0.7)'} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0.55rem 0.7rem', borderRadius: 10,
      background: 'rgba(0,0,0,0.32)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Captain — own little cluster on the left with a crown */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <div style={{ position: 'relative' }}>
          <div aria-hidden style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#f0c040" stroke="#1a1206" strokeWidth="1.2" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }}>
              <path d="M5 17h14l1-9-5 3.5L12 5 9 11.5 4 8z" />
            </svg>
          </div>
          {circle(slots[0], 0, CAPTAIN_SIZE)}
        </div>
      </div>
      {/* Divider */}
      <div aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.08)', margin: '0.15rem 0' }} />
      {/* Crew slots row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, flex: 1 }}>
        {slots.slice(1).map((c, idx) => (
          <div key={idx + 1}>{circle(c, idx + 1, CREW_SIZE)}</div>
        ))}
      </div>
    </div>
  )
}

function PrepRow({ label, detail, ok, onClick, disabled }: {
  label: string
  detail: string
  ok: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const interactive = !!onClick && !disabled
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10,
        padding: '0.6rem 0.85rem', borderRadius: 10,
        background: 'rgba(0,0,0,0.32)',
        border: `1px solid ${ok ? 'rgba(74,222,128,0.24)' : 'rgba(248,113,113,0.28)'}`,
        cursor: interactive ? 'pointer' : 'default',
        opacity: disabled ? 0.6 : 1,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span aria-hidden style={{
          width: 16, height: 16, borderRadius: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ok ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)',
          color: ok ? '#4ade80' : '#f87171',
          fontSize: '0.7rem', fontWeight: 700, lineHeight: 1,
        }}>{ok ? '✓' : '!'}</span>
        <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#d0cdc8' }}>{label}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <p className="font-karla" style={{ fontSize: '0.66rem', color: ok ? '#86efac' : '#fca5a5' }}>{detail}</p>
        {interactive && (
          <span aria-hidden style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem' }}>›</span>
        )}
      </div>
    </button>
  )
}

// ── Repair row ────────────────────────────────────────────────────────
// Dedicated row for ship-repair because the action button is inline.
// Hides itself entirely when there's no debt (parent gates the render).
function RepairRow({ owed, doubloons, busy, error, onRepair }: {
  owed: number
  doubloons: number
  busy: boolean
  error: string | null
  onRepair: () => void
}) {
  const canAfford = doubloons >= owed
  return (
    <div style={{
      padding: '0.7rem 0.85rem', borderRadius: 10,
      background: 'rgba(248,113,113,0.06)',
      border: '1px solid rgba(248,113,113,0.28)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span aria-hidden style={{
            width: 16, height: 16, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(248,113,113,0.18)', color: '#f87171',
            fontSize: '0.7rem', fontWeight: 700, lineHeight: 1,
          }}>!</span>
          <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#fca5a5' }}>Ship damaged</p>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
          {owed.toLocaleString()} ⟡
        </p>
      </div>
      <button
        type="button"
        onClick={onRepair}
        disabled={!canAfford || busy}
        className="font-karla font-700 uppercase tracking-[0.1em]"
        style={{
          width: '100%', padding: '0.55rem 0',
          borderRadius: 9,
          background: canAfford ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${canAfford ? 'rgba(74,222,128,0.55)' : 'rgba(255,255,255,0.12)'}`,
          color: canAfford ? '#4ade80' : '#5a5856',
          fontSize: '0.62rem',
          cursor: canAfford && !busy ? 'pointer' : 'default',
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy ? 'Repairing…' : canAfford ? `Pay & Repair · ${owed.toLocaleString()} ⟡` : "Can't afford"}
      </button>
      {error && (
        <p className="font-karla font-600 mt-2"
          style={{ fontSize: '0.6rem', color: '#f87171', textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  )
}
