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
import { IconLock, IconCrate } from '@/components/GameIcons'
import { repairShip } from '@/app/(app)/raids/actions'
import type { CrewMember } from '@/app/(app)/crew/actions'
import { RARITY_COLORS as CREW_RARITY_COLORS } from '@/lib/crewGen'
import DailyVoyagePanel from './DailyVoyagePanel'
import ShipDuels from './ShipDuels'
import type { ShipBattleSummary } from '@/app/(app)/social/shipBattleActions'
import type { CrewMember as SocialCrewMember } from '@/app/(app)/social/actions'

const CREW_IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'
import type { DailyVoyage } from './voyageActions'
import type { VoyageHistoryEntry } from './VoyageHistory'
import { getRankTitle, type CombatRating } from '@/lib/expeditions'

export type CampaignCardData = {
  nextNodeId: string | null
  nextNodeName: string | null
  nextNodeImage: string | null
  nextNodeLocked: boolean
  nextNodeLockReason: string | null
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
  raidRating: CombatRating
  // DailyVoyagePanel-required props. The panel used to render inline
  // below the hub; now lives inside the Voyages modal so the data
  // pipes through here.
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  expeditionXP: number
  voyageHistory: VoyageHistoryEntry[]
  // Whether the PvP "coming soon" entry point is open to this viewer (admins +
  // duel testers). Everyone else sees it locked. PvP data is only fetched +
  // passed when this is true (null otherwise).
  canPvp: boolean
  /** Whether the Gauntlet door is open to this player (admin, or live + cleared
   *  Chapter 2). Drives the Gauntlets card lock independently of PvP. */
  gauntletOpen: boolean
  /** Claimed Gauntlet Locker Upgrade ids — drives the voyage panel's truthful
   *  Safe Passage / Swift Sails surfacing. */
  gauntletUpgrades: string[]
  pvp: { battles: ShipBattleSummary[]; wins: number; losses: number; friends: SocialCrewMember[] } | null
}

const VOYAGE_ACCENT: Record<VoyageStatus, { fg: string; bg: string; bd: string }> = {
  idle:     { fg: '#7090c0', bg: 'rgba(112,144,192,0.10)', bd: 'rgba(112,144,192,0.32)' },
  sailing:  { fg: '#c4a96a', bg: 'rgba(196,169,106,0.10)', bd: 'rgba(196,169,106,0.32)' },
  returned: { fg: '#4ade80', bg: 'rgba(74,222,128,0.12)',  bd: 'rgba(74,222,128,0.4)'   },
}

// Second-row hub card (PvP / Gauntlets). Smaller than the Campaign /
// Voyages cards — art + title + one line + a status footer. When `locked`
// it dims, drops its tap handler, and shows a "Coming Soon" lock instead of
// the open affordance.
function SideHubCard({ accent, image, title, desc, locked, onClick, tag, lockLabel = 'Coming Soon' }: {
  accent: string
  image: string
  title: string
  desc: string
  locked: boolean
  onClick?: () => void
  /** Optional corner ribbon (e.g. 'NEW') — shown when the card is available. */
  tag?: string
  /** Footer text when locked. Defaults to 'Coming Soon'; a released-but-gated
   *  card (e.g. the Gauntlet) overrides it with the unlock requirement. */
  lockLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'rgba(6,12,20,0.92)',
        border: `1px solid ${accent}${locked ? '22' : '30'}`,
        borderTop: `1px solid ${accent}${locked ? '38' : '55'}`,
        borderRadius: 18, padding: '0.85rem 0.85rem 0.9rem',
        cursor: locked ? 'default' : 'pointer', textAlign: 'left',
        display: 'flex', flexDirection: 'column',
        opacity: locked ? 0.92 : 1,
      }}
    >
      {tag && !locked && (
        <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{
          position: 'absolute', top: 9, right: 9, zIndex: 2,
          padding: '2px 7px', borderRadius: 999, fontSize: '0.44rem',
          color: accent, background: `${accent}1c`, border: `1px solid ${accent}55`,
        }}>{tag}</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 56, marginBottom: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" decoding="async"
          style={{ width: '100%', height: 54, objectFit: 'contain', filter: `drop-shadow(0 4px 14px ${accent}40)${locked ? ' grayscale(0.55)' : ''}`, opacity: locked ? 0.7 : 1 }} />
      </div>
      <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.1, marginBottom: 6 }}>{title}</p>
      <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: '#b8b0a0', lineHeight: 1.4, marginBottom: 10 }}>
        {desc}
      </p>
      <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${accent}1c` }}>
        {locked ? (
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', color: '#8a8680' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {lockLabel}
          </p>
        ) : (
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: accent }}>
            Open ›
          </p>
        )}
      </div>
    </button>
  )
}

export default function HubCards({
  campaign, voyages, doubloons,
  ownedRaidItems, equippedRaidItems, raidItemSlots,
  roster, shipCrewSlots,
  raidRating,
  shipTier, todayVoyage, readyVoyage, expeditionXP, voyageHistory,
  canPvp, gauntletOpen, gauntletUpgrades, pvp,
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'campaign' | 'voyages' | 'pvp' | 'gauntlets'>(null)
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
  const pvpAccent = '#d0716a'
  const gauntletAccent = '#7a8fc9'

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
              loading="lazy" decoding="async"
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
                <IconLock size={10} /> {campaign.nextNodeLockReason}
              </p>
            )}
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
              loading="lazy" decoding="async"
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

        {/* ── Row 2: PvP (under Campaign) + Gauntlets (under Voyages).
            PvP opens for admins + duel testers (canPvp); Gauntlets for
            gauntletOpen. Everyone else sees a "Coming Soon" lock. ───────── */}
        <SideHubCard
          accent={pvpAccent}
          image="/reefraider.png"
          title="PvP"
          desc="Trade broadsides with other captains. Climb the duelist ladder."
          locked={!canPvp}
          onClick={canPvp ? () => setModal('pvp') : undefined}
        />
        <SideHubCard
          accent={gauntletAccent}
          image="/davyjones.png"
          title="Gauntlets"
          desc="Push your luck down a gauntlet for one swelling pot. Bank it or sink."
          locked={!gauntletOpen}
          onClick={gauntletOpen ? () => router.push('/raids/gauntlet') : undefined}
          tag="NEW"
          lockLabel="Clear Chapter 2"
        />
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

          <PrepReadiness rating={raidRating} accent={campaignAccent} />

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
            <DailyVoyagePanel
              roster={roster}
              shipTier={shipTier}
              todayVoyage={todayVoyage}
              readyVoyage={readyVoyage}
              expeditionXP={expeditionXP}
              voyages={voyageHistory}
              gauntletUpgrades={gauntletUpgrades}
            />
          </div>
        </div>
      </PopupShell>

      {/* ── PvP modal — the old "Broadsides" section, now opened from the
          PvP hub card. Admin-only; pvp data is only passed when admin. ──── */}
      <PopupShell open={modal === 'pvp'} onClose={() => setModal(null)}>
        <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 440,
            background: 'linear-gradient(180deg, #1a0e0c 0%, #0a0807 100%)',
            border: `1px solid ${pvpAccent}55`,
            borderRadius: 20, padding: '0.4rem 0.4rem 0.5rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.7rem 0.3rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>PvP</p>
            <button type="button" onClick={() => setModal(null)} aria-label="Close"
              style={{ width: 30, height: 30, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          {pvp && (
            <ShipDuels battles={pvp.battles} wins={pvp.wins} losses={pvp.losses} friends={pvp.friends} />
          )}
        </div>
      </PopupShell>

      {/* ── Gauntlets modal — entry hub for the push-your-luck gauntlets.
          Davy Jones is the first; more slot in later. Admin-only for now. ── */}
      <PopupShell open={modal === 'gauntlets'} onClose={() => setModal(null)}>
        <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 420,
            background: 'linear-gradient(180deg, #0c1222 0%, #06080f 100%)',
            border: `1px solid ${gauntletAccent}55`,
            borderRadius: 20, padding: '1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: `${gauntletAccent}aa` }}>Push your luck</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>Gauntlets</p>
            </div>
            <button type="button" onClick={() => setModal(null)} aria-label="Close"
              style={{ width: 30, height: 30, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <button type="button"
            onClick={() => { setModal(null); router.push('/raids/gauntlet') }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.75rem', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
              background: `linear-gradient(180deg, ${gauntletAccent}1c, rgba(0,0,0,0.2))`,
              border: `1px solid ${gauntletAccent}55`,
            }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/davyjones.png" alt="" loading="lazy" decoding="async"
              style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 3px 10px ${gauntletAccent}55)` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.1 }}>The Davy Jones Gauntlet</p>
              <p className="font-karla font-500" style={{ fontSize: '0.66rem', color: '#a8b0c4', lineHeight: 1.35, marginTop: 2 }}>
                Fight down the deep. Every win fattens one pot; cash out or sink with it.
              </p>
            </div>
            <span aria-hidden className="font-karla font-700" style={{ flexShrink: 0, color: gauntletAccent, fontSize: '1rem' }}>›</span>
          </button>
          <p className="font-karla font-500" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', marginTop: 10 }}>
            More gauntlets are on the way.
          </p>
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
// ── READINESS ────────────────────────────────────────────────────────────────
// What this modal is FOR: am I strong enough to walk through that door?
//
// It used to answer with three tiles reading HP / Speed / DMG straight off the
// bare hull — numbers that ignore your crew, your raid items, your ship classes
// and your Renown, and so are not the numbers you actually fight with. Worse,
// the Raid Score WAS being computed, passed into the block, and then silently
// dropped: StatsBlock declared score/scoreLabel/scoreColor and destructured only
// shipStats. The one number that answers the question was thrown on the floor.
//
// So: the Raid Score, its rank, and the two axes it is made of. Offense and
// Defense are shown separately because a raid punishes being lopsided, and a
// player staring at a single 62 cannot tell WHICH half is dragging.
function PrepReadiness({ rating, accent }: { rating: CombatRating; accent: string }) {
  const rank = getRankTitle(rating.score)
  const OFF = '#e8896a'
  const DEF = '#6aa9e8'
  return (
    <div style={{
      marginBottom: 14, borderRadius: 14, padding: '0.85rem 0.9rem',
      background: `radial-gradient(ellipse at 50% 0%, ${accent}14 0%, rgba(0,0,0,0.3) 70%)`,
      border: `1px solid ${accent}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: '#8a8680' }}>
            Raid Score
          </p>
          <p className="font-cinzel font-800 truncate" style={{ fontSize: '0.92rem', color: accent, marginTop: 3 }}>
            {rank}
          </p>
        </div>
        <p className="font-cinzel font-800" style={{ flexShrink: 0, fontSize: '2rem', lineHeight: 1, color: '#f3ede0', textShadow: `0 0 16px ${accent}55` }}>
          {Math.round(rating.score)}
          <span style={{ fontSize: '0.8rem', color: '#7a7672' }}> / 100</span>
        </p>
      </div>

      {/* The overall bar. */}
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 9 }}>
        <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, rating.score))}%`, borderRadius: 999, background: `linear-gradient(90deg, ${OFF}, ${accent})` }} />
      </div>

      {/* The two axes. A raid punishes a lopsided build, so the split is the
          useful part: it says WHICH half needs work, which one number cannot. */}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {([['Offense', rating.offenseScore, OFF], ['Defense', rating.defenseScore, DEF]] as [string, number, string][]).map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#8a8680' }}>{label}</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.76rem', color }}>{Math.round(val)}</span>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginTop: 3 }}>
              <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, val))}%`, borderRadius: 999, background: color }} />
            </div>
          </div>
        ))}
      </div>
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
          <img src={CREW_IMG_BASE + card.filename} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
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
                <img src={def.image} alt="" loading="lazy" decoding="async" style={{ width: '88%', height: '88%', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontSize: '0.95rem', lineHeight: 1, color: '#c4a96a', display: 'flex' }}><IconCrate size={15} /></span>
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
