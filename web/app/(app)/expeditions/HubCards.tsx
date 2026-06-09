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
import { repairShip } from '@/app/(app)/raids/actions'
import type { CrewMember } from '@/app/(app)/crew/actions'
import { RARITY_COLORS as CREW_RARITY_COLORS } from '@/lib/crewGen'
import DailyVoyagePanel from './DailyVoyagePanel'

const CREW_IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'
import type { DailyVoyage } from './voyageActions'
import type { VoyageHistoryEntry } from './VoyageHistory'
import type { ShipStats } from '@/lib/expeditions'

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

// Inline portrait strip used on each hub card to surface the track's
// assigned crew (raid for Campaign, voyage for Voyages). Tapping any
// portrait — or the empty-state placeholder — navigates to Crew
// Management with the corresponding sub-filter preselected so the
// player lands directly on the party they meant to manage.
function HubCrewStrip({
  crew, accent, track, router, label,
}: {
  crew: CrewMember[]
  accent: string
  track: 'voyage' | 'raid'
  router: ReturnType<typeof useRouter>
  label: string
}) {
  const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
  const href = `/crew?tab=roster&filter=${track}`
  const open = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    router.push(href)
  }
  // Cap the visible portraits at 4 so the strip never crowds the card
  // narrow side-by-side hub-card layout. Anything past 4 collapses into a
  // '+N' chip that picks up the same track accent.
  const MAX_VISIBLE = 4
  const visible = crew.slice(0, MAX_VISIBLE)
  const hidden  = Math.max(0, crew.length - MAX_VISIBLE)
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e as unknown as React.MouseEvent) } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 6, minWidth: 0,
        cursor: 'pointer',
      }}
    >
      {crew.length === 0 ? (
        <p className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          No {label} · <span style={{ color: accent }}>Assign →</span>
        </p>
      ) : (
        <>
          {/* Overlapping avatars — −6px margin between each gives a tight
              stacked-portrait look that occupies the same vertical space
              as a single line of text. */}
          <div style={{ display: 'flex', flex: 'none', alignItems: 'center' }}>
            {visible.map((c, i) => (
              <div
                key={c.id}
                title={c.name}
                style={{
                  position: 'relative', width: 22, height: 22, borderRadius: '50%',
                  overflow: 'hidden',
                  border: `1.5px solid ${accent}cc`,
                  boxShadow: `0 1px 3px rgba(0,0,0,0.6)`,
                  background: `radial-gradient(circle at 50% 35%, ${accent}33 0%, #050403 75%)`,
                  marginLeft: i === 0 ? 0 : -6,
                  zIndex: visible.length - i,
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${SUPA}/storage/v1/object/public/card-arts/${c.filename}`}
                  alt={c.name}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 22%' }}
                />
              </div>
            ))}
            {hidden > 0 && (
              <div className="font-karla font-700" style={{
                position: 'relative', height: 22, marginLeft: -6, zIndex: 0,
                padding: '0 6px', borderRadius: 999,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.52rem', color: accent,
                background: `radial-gradient(circle at 50% 35%, ${accent}33 0%, #050403 75%)`,
                border: `1.5px solid ${accent}cc`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap',
              }}>
                +{hidden}
              </div>
            )}
          </div>
          {/* Chevron-only affordance — the row is already a tap target, and
              'MANAGE →' text was overflowing the hub card on narrow phones
              once 4-5 portraits were stacked. The arrow does the same job
              in a fraction of the width. */}
          <span aria-hidden style={{
            marginLeft: 'auto', flexShrink: 0,
            color: accent, fontSize: '0.7rem', lineHeight: 1, opacity: 0.85,
          }}>›</span>
        </>
      )}
    </div>
  )
}

export default function HubCards({
  campaign, voyages, doubloons,
  ownedRaidItems, equippedRaidItems, raidItemSlots,
  roster, shipCrewSlots,
  shipStats, voyageScore, raidScore,
  shipTier, todayVoyage, readyVoyage, expeditionXP, voyageHistory,
}: Props) {
  const router = useRouter()
  // Compute each track's party once. Filtering by voyage_slot / raid_slot
  // mirrors how the rest of the system treats the split.
  const raidParty = roster
    .filter(c => c.raidSlot !== null)
    .sort((a, b) => (a.raidSlot as number) - (b.raidSlot as number))
  const voyageParty = roster
    .filter(c => c.voyageSlot !== null)
    .sort((a, b) => (a.voyageSlot as number) - (b.voyageSlot as number))
  const [modal, setModal] = useState<null | 'campaign' | 'voyages'>(null)
  const [, startTransition] = useTransition()

  // Esc closes the open prep modal. (Used to also handle a nested items
  // editor modal; that was removed when the prep modals became read-only
  // confirmation surfaces, so there's only one layer to close now.)
  useEffect(() => {
    if (!modal) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  // Begin → open the current node's detail sheet directly (no map
  // detour). RaidsSection listens for this and gates on repair-block.
  function beginNextNode() {
    if (!campaign.nextNodeId) return
    setModal(null)
    window.dispatchEvent(new CustomEvent('expedition:open-node', { detail: { nodeId: campaign.nextNodeId } }))
  }

  const campaignAccent = '#c4a96a'
  const vAcc = VOYAGE_ACCENT[voyages.status]

  // Item equip / unequip used to live here as an optimistic toggle backing
  // the nested 'Equip items' modal. Both were removed when the prep modal
  // became read-only confirmation — items are still managed via the
  // Loadout drawer (ShipHero's Manage Ship button), which keeps that
  // toggle logic in one place. saveEquippedRaidItems is no longer
  // imported by this file.

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
          <HubCrewStrip crew={raidParty} accent="#e07c7c" track="raid" router={router} label="raid crew" />
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
          <HubCrewStrip crew={voyageParty} accent="#5fa8c9" track="voyage" router={router} label="voyage crew" />
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
              {/* Crew display — read-only confirmation of who's on the
                  RAID track (raidSlot). Reads from raidSlot, not
                  voyageSlot, so the campaign modal stops mirroring the
                  voyage party (which was the original 'wrong crew shown'
                  bug). Editing happens on /crew; the 'Manage ›' link
                  inside the view is the canonical path off this modal. */}
              <PrepPartyView
                roster={roster}
                shipCrewSlots={shipCrewSlots}
                track="raid"
                accent={campaignAccent}
              />
              {/* Items display — read-only confirmation of equipped
                  raid items. The prep modal is no longer an editor;
                  items are still managed via the Loadout drawer
                  (ShipHero's Manage Ship button). 'Manage ›' closes this
                  modal first so the drawer doesn't open behind it. */}
              <PrepItemsView
                equippedRaidItems={equippedRaidItems}
                raidItemSlots={raidItemSlots}
                ownedCount={ownedRaidItems.length}
                accent={campaignAccent}
                onManage={() => {
                  setModal(null)
                  window.dispatchEvent(new CustomEvent('expedition:open-loadout'))
                }}
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

      {/* Crew + items are now both managed OUTSIDE the prep modal:
          crew on /crew (Crew Management), items via ShipHero's Loadout
          drawer (Manage Ship button). The prep modal stays as a pure
          confirmation surface, so the previously-nested items editor +
          slot picker that opened on top of this modal have both been
          removed. */}
    </>
  )
}

// ── Stats block ───────────────────────────────────────────────────────
// Compact readiness card surfaced at the top of each prep modal. Big
// score tile (Raid Score for campaign, Voyage Score for voyages) with
// rank title, plus a 3-column ship-stats strip (HP / Speed / DMG) so
// the player sees the hull they're committing alongside their score.
// Voyage Score / Raid Score banners used to live atop this block. Removed
// 2026-06-08 — both were confusing players who didn't have a clear mental
// model for the 0-100 nautical ladder. Concrete ship stats (HP / Speed /
// DMG) stay because they're literal and actionable. score / scoreLabel /
// scoreColor props stay on the type for API stability but are ignored.
function StatsBlock({ shipStats }: {
  score?: number
  scoreLabel?: string
  scoreColor?: string
  shipStats: ShipStats
}) {
  return (
    <div style={{ marginBottom: 14 }}>
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
// Read-only party display used inside the prep modals. Mirrors the
// on-deck row from the expedition home page (captain on the left with a
// crown, crew slots to the right) but is purely informational — there's
// no tap-to-pick affordance and no nested editor opens. Crew assignment
// now lives exclusively on the /crew page, and the prep modal is the
// confirmation surface that shows what's actually deployed for the
// track they're about to launch. The track prop is the critical bit:
// reading the wrong slot is what was showing voyage crew on the
// campaign modal.
function PrepPartyView({ roster, shipCrewSlots, track, accent }: {
  roster: CrewMember[]
  shipCrewSlots: number
  track: 'voyage' | 'raid'
  accent: string
}) {
  const slots: (CrewMember | null)[] = Array(shipCrewSlots).fill(null)
  for (const c of roster) {
    const slot = track === 'voyage' ? c.voyageSlot : c.raidSlot
    if (slot != null && slot >= 0 && slot < shipCrewSlots) {
      slots[slot] = c
    }
  }
  const assignedCount = slots.filter(Boolean).length
  const CAPTAIN_SIZE = 48
  const CREW_SIZE = 40
  function circle(card: CrewMember | null, i: number, size: number) {
    const isCaptain = i === 0
    const rc = card ? (CREW_RARITY_COLORS[card.rarity as 1 | 2 | 3 | 4] ?? '#6a6764') : '#6a6764'
    const ring = card ? (isCaptain ? '#f0c040' : rc) : (isCaptain ? 'rgba(240,192,64,0.35)' : 'rgba(255,255,255,0.25)')
    if (card) {
      return (
        <div title={card.name} aria-label={isCaptain ? `Captain: ${card.name}` : `Crew: ${card.name}`}
          style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${ring}`, background: 'rgba(6,9,16,0.85)', boxShadow: '0 2px 6px rgba(0,0,0,0.55)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CREW_IMG_BASE + card.filename} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        </div>
      )
    }
    // Empty slot: subdued dashed circle with no '+' CTA — this is a
    // display, not a picker. Player can see the slot exists; assigning
    // happens on /crew.
    return (
      <div aria-label={isCaptain ? 'No captain assigned' : `Empty crew slot ${i + 1}`}
        style={{ width: size, height: size, borderRadius: '50%', border: `2px dashed ${ring}`, background: 'rgba(6,9,16,0.4)' }} />
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0.55rem 0.7rem', borderRadius: 10,
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${assignedCount > 0 ? 'rgba(74,222,128,0.24)' : 'rgba(248,113,113,0.28)'}`,
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
      {/* Manage hint — navigates to /crew with the matching track filter
          pre-selected on the Roster tab. /crew reads ?tab=roster&filter=
          (CrewClient.tsx:733-744), so 'raid' from the campaign prep lands
          directly on the raid sub-filter instead of the full roster. */}
      <a href={`/crew?tab=roster&filter=${track}`} onClick={e => e.stopPropagation()}
        className="font-karla font-700 uppercase"
        style={{
          flexShrink: 0,
          fontSize: '0.5rem', letterSpacing: '0.12em',
          color: accent, opacity: 0.85,
          textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
        Manage <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>›</span>
      </a>
    </div>
  )
}

// Read-only items view used inside the campaign prep modal. Shows what's
// currently equipped as a compact icon row + slot count. Editing happens
// in the Loadout drawer (ShipHero's Manage Ship button) — there's no
// tap-to-equip here; the prep modal is confirmation, not configuration.
function PrepItemsView({ equippedRaidItems, raidItemSlots, ownedCount, accent, onManage }: {
  equippedRaidItems: string[]
  raidItemSlots: number
  ownedCount: number
  accent: string
  /** Called when the player taps 'Manage ›'. Parent should close the
   *  prep modal BEFORE the Loadout drawer opens, otherwise the drawer
   *  mounts behind the open PopupShell and the player just sees the
   *  same prep modal with no visible feedback. */
  onManage: () => void
}) {
  const equippedDefs = equippedRaidItems
    .map(id => RAID_ITEMS.find(i => i.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
  const equippedCount = equippedDefs.length
  // Build N slots = filled icons + empty placeholders, so the player can
  // see at a glance which slots are still open.
  const slots = Array.from({ length: raidItemSlots }, (_, i) => equippedDefs[i] ?? null)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0.55rem 0.7rem', borderRadius: 10,
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${equippedCount > 0
        ? 'rgba(74,222,128,0.24)'
        : ownedCount === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(248,113,113,0.28)'}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 70 }}>
        <p className="font-karla font-700 uppercase tracking-[0.16em]"
          style={{ fontSize: '0.5rem', color: 'rgba(196,169,106,0.7)' }}>
          Items
        </p>
        <p className="font-cinzel font-700"
          style={{ fontSize: '0.78rem', color: '#f0e8d0', lineHeight: 1 }}>
          {ownedCount === 0 ? 'None owned' : `${equippedCount}/${raidItemSlots}`}
        </p>
      </div>
      {/* Icon row — filled slots show the item's image/emoji on an
          accent-tinted plate; empty slots are dashed circles matching
          the empty-crew-slot look. Compact so it still fits next to the
          crew row visually. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, flexWrap: 'wrap' }}>
        {slots.map((def, i) => {
          const SIZE = 32
          if (!def) {
            return (
              <div key={i}
                aria-label={`Empty item slot ${i + 1}`}
                style={{
                  width: SIZE, height: SIZE, borderRadius: '50%',
                  border: '2px dashed rgba(255,255,255,0.18)',
                  background: 'rgba(6,9,16,0.4)',
                }} />
            )
          }
          return (
            <div key={i}
              title={def.name}
              aria-label={`Equipped: ${def.name}`}
              style={{
                width: SIZE, height: SIZE, borderRadius: '50%',
                background: 'rgba(196,169,106,0.16)',
                border: '1.5px solid rgba(196,169,106,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
              }}>
              {def.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={def.image} alt="" style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{def.emoji}</span>
              )}
            </div>
          )
        })}
      </div>
      {/* Manage hint — closes the prep modal first (via onManage) then
          fires 'expedition:open-loadout' so ShipHero's Loadout drawer
          mounts on a clear stage. Dispatching the event without closing
          this modal leaves the drawer rendering BEHIND the PopupShell
          (PopupShell uses z-index 111+; the Loadout drawer sits lower),
          which read as 'nothing happened' to the player. */}
      <button type="button"
        onClick={onManage}
        className="font-karla font-700 uppercase"
        style={{
          flexShrink: 0,
          fontSize: '0.5rem', letterSpacing: '0.12em',
          color: accent, opacity: 0.85,
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
        Manage <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>›</span>
      </button>
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
