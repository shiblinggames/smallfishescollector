'use client'

// Expeditions hub: two cards (Story + Voyages) below the Ship Hero.
// Tapping a card opens a focused prep modal that contains the full
// launch flow inline — repair (if owed), crew assignment, items
// equip, all without leaving the modal. Nested PopupShells handle the
// item / crew detail editors.

import { useState, useEffect, useTransition } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { vibrate } from '@/lib/haptics'
import PopupShell from '@/components/PopupShell'
import { RAID_ITEMS } from '@/lib/raidItems'
import { IconLock, IconCrate } from '@/components/GameIcons'
import { RARITY_COLOR } from '@/lib/variants'
import { repairShip } from '@/app/(app)/raids/actions'
import Link from 'next/link'
import CaptainsOrders, { type OrderAction } from './CaptainsOrders'
import OpportunityStrip from './OpportunityStrip'
import { type OpportunityAction } from '@/lib/expeditionOpportunities'
import type { CrewMember } from '@/app/(app)/crew/actions'
import { crewTheDeck } from '@/app/(app)/crew/actions'
import { RARITY_COLORS as CREW_RARITY_COLORS } from '@/lib/crewGen'
import DailyVoyagePanel from './DailyVoyagePanel'
import ShipDuels from './ShipDuels'
import type { ShipBattleSummary } from '@/app/(app)/social/shipBattleActions'
import type { CrewMember as SocialCrewMember } from '@/app/(app)/social/actions'

const CREW_IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'
import type { DailyVoyage } from './voyageActions'
import type { VoyageHistoryEntry } from './VoyageHistory'


export type CampaignCardData = {
  nextNodeId: string | null
  nextNodeName: string | null
  nextNodeImage: string | null
  nextNodeLocked: boolean
  nextNodeLockReason: string | null
  /** The node's type. A FIGHT needs a crew; a story node does not, and being barred
   *  from reading would be nonsense. */
  nextNodeKind: string | null
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
  /** The numbers the RAID actually fights with. Not a score. */
  prepStats: {
    hull: number
    hitMin: number
    hitMax: number
    crit: number
    dodge: number
    fortune: number
    speed: number
  }
  // DailyVoyagePanel-required props. The panel used to render inline
  // below the hub; now lives inside the Voyages modal so the data
  // pipes through here.
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  expeditionXP: number
  voyageHistory: VoyageHistoryEntry[]
  /** How many raids the captain has actually finished. Drives Captain's Orders. */
  raidsCleared: number
  /** profiles.captains_orders_done — once every order has been completed once, the
   *  checklist is gone for good and never comes back. */
  captainsOrdersDone: boolean
  /** Live state the Opportunity strip needs that the hub does not already hold. */
  gems: number
  freeRecruitAvailable: boolean
  canAffordNewSkin: boolean
  challengeName: string | null
  // Whether the PvP "coming soon" entry point is open to this viewer (admins +
  // duel testers). Everyone else sees it locked. PvP data is only fetched +
  // passed when this is true (null otherwise).
  canPvp: boolean
  /** Whether the Gauntlet door is open to this player (admin, or live + cleared
   *  Chapter 2). Drives the Gauntlets card lock independently of PvP. */
  gauntletOpen: boolean
  /** Don's Gauntlet door — admin-only until DONS_GAUNTLET_LIVE. When open, the
   *  picker's Don's card becomes a live link instead of a "Coming Soon" tease. */
  donsGauntletOpen?: boolean
  /** A saved Gauntlet run is waiting (paused or crash-resumable) — the card
   *  swaps its CTA to "Resume" so the player knows to pick it back up. */
  gauntletResumable?: boolean
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

// Art-forward scenic tile — the redesigned hub card. A painterly scene fills the
// whole tile, with the title + one live status line over a bottom scrim. Locked
// tiles dim + grayscale and show a lock label instead of the status. Optional:
// a corner tag ('Resume'), a pulsing status dot (voyage sailing/returned), and a
// bottom progress bar (voyage in flight). All four hub cards share this now, so
// the row reads as one set of places rather than mixed flat panels.
function ExpeditionTile({
  bgImage, accent, title, status, statusColor, sub, subLock,
  locked = false, lockLabel = 'Coming Soon', tag, onClick, progress, dot, glow,
}: {
  bgImage: string
  accent: string
  title: string
  status: string
  statusColor?: string
  sub?: string | null
  subLock?: boolean
  locked?: boolean
  lockLabel?: string
  tag?: string
  onClick?: () => void
  progress?: number | null
  dot?: 'returned' | 'sailing' | null
  glow?: boolean
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      style={{
        position: 'relative', overflow: 'hidden', width: '100%',
        height: 152, borderRadius: 18, padding: 0,
        border: `1px solid ${accent}${locked ? '30' : '80'}`,
        borderTop: `1px solid ${accent}${locked ? '4a' : 'e0'}`,
        boxShadow: glow ? `0 0 18px ${accent}30` : undefined,
        cursor: locked ? 'default' : 'pointer', textAlign: 'left',
        opacity: locked ? 0.94 : 1,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bgImage} alt="" aria-hidden loading="lazy" decoding="async"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: locked ? 'grayscale(0.5) brightness(0.68)' : undefined }} />
      {/* Bottom scrim so the title + status read over the art. */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, background: 'linear-gradient(180deg, transparent 0%, rgba(6,12,20,0.72) 45%, rgba(6,12,20,0.96) 100%)' }} />
      {tag && !locked && (
        <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ position: 'absolute', top: 9, right: 9, zIndex: 2, padding: '2px 7px', borderRadius: 999, fontSize: '0.44rem', color: '#04120f', background: accent, border: `1px solid ${accent}` }}>{tag}</span>
      )}
      {dot && !tag && (
        <span aria-hidden style={{ position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 9, background: dot === 'returned' ? '#4ade80' : accent, boxShadow: dot === 'returned' ? '0 0 8px rgba(74,222,128,0.75)' : `0 0 8px ${accent}b0`, animation: 'shop-pulse 1.6s ease-in-out infinite' }} />
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 0.85rem 0.8rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#ffffff', lineHeight: 1.1, textShadow: `0 2px 6px rgba(0,0,0,0.8), 0 0 14px ${accent}44` }}>{title}</p>
        {locked ? (
          <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', color: '#cfcac2', marginTop: 4, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
            <IconLock size={10} /> {lockLabel}
          </p>
        ) : (
          <>
            <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: statusColor ?? accent, lineHeight: 1.3, marginTop: 3, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>{status}</p>
            {sub && (
              <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#c2beb6', lineHeight: 1.3, marginTop: 1, textShadow: '0 1px 3px rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {subLock && <IconLock size={9} />}{sub}
              </p>
            )}
          </>
        )}
      </div>
      {progress != null && (
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${accent}cc)`, boxShadow: `0 0 6px ${accent}`, transition: 'width 0.5s' }} />
        </div>
      )}
    </button>
  )
}

export default function HubCards({
  campaign, voyages, doubloons,
  ownedRaidItems, equippedRaidItems, raidItemSlots,
  roster, shipCrewSlots,
  prepStats,
  shipTier, todayVoyage, readyVoyage, expeditionXP, voyageHistory,
  canPvp, gauntletOpen, donsGauntletOpen, gauntletResumable, gauntletUpgrades, pvp,
  raidsCleared, captainsOrdersDone,
  gems, freeRecruitAvailable, canAffordNewSkin, challengeName,
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'campaign' | 'voyages' | 'pvp' | 'gauntlets'>(null)
  const [crewing, setCrewing] = useState(false)
  const [crewMsg, setCrewMsg] = useState<string | null>(null)
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
  // Each gauntlet wears its own identity inside the chooser: Davy's teal,
  // Don's kraken-green (matches the gauntlet screens + switcher).
  const DAVY_AC = '#5eead4'
  const DON_AC = '#3fbf82'

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

  // Campaign now surfaces the story map as a full-screen overlay
  // (CampaignMapOverlay listens for this) instead of the old ready-check modal.
  const openCampaignMap = () => window.dispatchEvent(new CustomEvent('expedition:open-campaign-map'))

  const onOrder = (a: OrderAction) => {
    if (a === 'campaign') openCampaignMap()
    else if (a === 'voyages') setModal('voyages')
    else if (a === 'loadout') window.dispatchEvent(new CustomEvent('expedition:open-loadout'))
  }
  // The Opportunity strip's actions are a superset — modals, routes (Link handles
  // those itself), and loadout via event.
  const onOpportunity = (a: OpportunityAction) => {
    if (a.kind === 'modal') { if (a.modal === 'campaign') openCampaignMap(); else setModal(a.modal) }
    else if (a.kind === 'event') window.dispatchEvent(new CustomEvent(a.event))
  }

  return (
    <>
      {/* Onboarding TEACHES then latches. The Opportunity strip REMINDS, forever.
          They never both show: Orders returns null once every task is done, and the
          strip is gated on that same latch, so the top-of-page slot transitions cleanly
          from "learn the game" to "here's what's worth your time today." */}
      {captainsOrdersDone ? (
        <OpportunityStrip
          onAction={onOpportunity}
          state={{
            repairOwed: campaign.repairOwed,
            voyageStatus: voyages.status,
            voyageRewardDoubloons: readyVoyage?.total_doubloons ?? 0,
            voyageRewardGems: readyVoyage?.total_gems ?? 0,
            canVoyage: roster.some(c => c.voyageSlot != null) || roster.some(c => c.raidSlot == null && c.voyageSlot == null),
            freeRecruitAvailable,
            nextNodeName: campaign.nextNodeName,
            nextNodeIsFight: campaign.nextNodeKind === 'raid' || campaign.nextNodeKind === 'challenge',
            nextNodeLocked: campaign.nextNodeLocked,
            raidCrewAboard: roster.filter(c => c.raidSlot != null).length,
            crewOwned: roster.length,
            challengeName,
            unequippedItems: Math.max(0, ownedRaidItems.length - equippedRaidItems.length),
            itemSlotsFree: Math.max(0, raidItemSlots - equippedRaidItems.length),
            gems,
            canAffordNewSkin,
          }}
        />
      ) : (
        <CaptainsOrders
          onAction={onOrder}
          alreadyDone={captainsOrdersDone}
          state={{
            crewOwned: roster.length,
            raidCrew: roster.filter(c => c.raidSlot != null).length,
            voyageCrew: roster.filter(c => c.voyageSlot != null).length,
            crewSlots: shipCrewSlots,
            equippedItems: equippedRaidItems.length,
            ownedItems: ownedRaidItems.length,
            raidsCleared,
            voyagesRun: voyageHistory.length,
          }}
        />
      )}

      {/* ── Hub cards — art-forward scenic tiles, uniform 2×2 ──────────
          Each tile is a painterly scene + title + live status over a
          bottom scrim. Campaign / Voyages are the core loops; PvP +
          Gauntlets sit below at the same size. All open their prep modal. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.2rem' }}>
        <ExpeditionTile
          bgImage="/exp-campaign.jpg" accent={campaignAccent} title="Campaign"
          status={campaign.nextNodeName ? `Next: ${campaign.nextNodeName}` : 'All cleared'}
          statusColor="#f0e0b0"
          sub={campaign.nextNodeLocked ? campaign.nextNodeLockReason : null}
          subLock={campaign.nextNodeLocked}
          onClick={openCampaignMap}
        />
        <ExpeditionTile
          bgImage="/exp-voyages.jpg" accent={vAcc.fg} title="Voyages"
          status={voyages.statusLabel} statusColor={vAcc.fg}
          sub={voyages.routeName}
          glow={voyages.status === 'sailing' || voyages.status === 'returned'}
          dot={voyages.status === 'returned' ? 'returned' : voyages.status === 'sailing' ? 'sailing' : null}
          progress={voyages.status === 'sailing' ? voyages.progress : null}
          onClick={() => setModal('voyages')}
        />
        {/* PvP opens for admins + duel testers (canPvp); Gauntlets for
            gauntletOpen. Everyone else sees a locked tile. */}
        <ExpeditionTile
          bgImage="/exp-pvp.jpg" accent={pvpAccent} title="PvP"
          status="Open ›" statusColor={pvpAccent}
          locked={!canPvp} lockLabel="Coming Soon"
          onClick={canPvp ? () => setModal('pvp') : undefined}
        />
        <ExpeditionTile
          bgImage="/exp-gauntlets.jpg" accent={gauntletAccent} title="Gauntlets"
          status={gauntletResumable ? 'Resume ›' : 'Choose ›'} statusColor={gauntletAccent}
          locked={!gauntletOpen} lockLabel="Clear Chapter 2"
          tag={gauntletResumable ? 'Resume' : undefined}
          onClick={gauntletOpen ? () => setModal('gauntlets') : undefined}
        />
      </div>

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
        <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            margin: 'auto', width: '100%', maxWidth: 420,
            background: 'linear-gradient(180deg, #0c1222 0%, #06080f 100%)',
            border: `1px solid ${gauntletAccent}55`,
            borderRadius: 20, padding: '1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: `${gauntletAccent}aa` }}>Push your luck</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8' }}>Choose your gauntlet</p>
            </div>
            <button type="button" onClick={() => setModal(null)} aria-label="Close"
              style={{ width: 30, height: 30, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Two art-forward cards, side by side — the boss portrait is the
              centerpiece, name + tagline + CTA below. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* ── Davy Jones — the original descent ── */}
            <motion.button type="button"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, type: 'spring', stiffness: 380, damping: 28 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { vibrate([0, 16]); setModal(null); router.push('/raids/gauntlet') }}
              className="tap"
              style={{
                position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                padding: '0.95rem 0.7rem 0.85rem', borderRadius: 16, cursor: 'pointer',
                background: `linear-gradient(180deg, ${DAVY_AC}20, rgba(0,0,0,0.32))`,
                border: `1px solid ${DAVY_AC}66`, boxShadow: `0 0 22px ${DAVY_AC}14`,
              }}>
              <div style={{ position: 'relative', width: '100%', height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                <div aria-hidden style={{ position: 'absolute', width: 138, height: 138, borderRadius: '50%', background: `radial-gradient(circle, ${DAVY_AC}4a, transparent 68%)`, filter: 'blur(3px)' }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/davyjones.png" alt="" loading="eager" decoding="async"
                  style={{ position: 'relative', maxWidth: '94%', maxHeight: 126, objectFit: 'contain', filter: `drop-shadow(0 8px 20px ${DAVY_AC}4d) drop-shadow(0 4px 10px rgba(0,0,0,0.6))` }} />
              </div>
              <p className="font-cinzel font-800" style={{ fontSize: '0.98rem', color: '#f0ede8', lineHeight: 1.08 }}>Davy Jones</p>
              <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${DAVY_AC}dd`, marginTop: 3, lineHeight: 1.3 }}>The original descent</p>
              <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', color: gauntletResumable ? '#04120f' : DAVY_AC, background: gauntletResumable ? DAVY_AC : `${DAVY_AC}1e`, border: `1px solid ${DAVY_AC}66`, borderRadius: 999, padding: '0.34rem 0.8rem' }}>
                {gauntletResumable ? 'Resume' : 'Descend'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
              </span>
            </motion.button>

            {/* ── Don's Gauntlet — Gauntlet II. Live descent once the Don's
                beaten; until then a locked card that points the way (the raid
                IS shipped, so it says "Defeat the Don", not "Coming Soon"). ── */}
            {donsGauntletOpen ? (
              <motion.button type="button"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, type: 'spring', stiffness: 380, damping: 28 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { vibrate([0, 16]); setModal(null); router.push('/raids/dons-gauntlet') }}
                className="tap"
                style={{
                  position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  padding: '0.95rem 0.7rem 0.85rem', borderRadius: 16, cursor: 'pointer',
                  background: `linear-gradient(180deg, ${DON_AC}24, rgba(0,0,0,0.34))`,
                  border: `1px solid ${DON_AC}66`, boxShadow: `0 0 22px ${DON_AC}16`,
                }}>
                <div style={{ position: 'relative', width: '100%', height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                  <div aria-hidden style={{ position: 'absolute', width: 138, height: 138, borderRadius: '50%', background: `radial-gradient(circle, ${DON_AC}4a, transparent 68%)`, filter: 'blur(3px)' }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/donsgauntlet.png" alt="" loading="eager" decoding="async"
                    style={{ position: 'relative', maxWidth: '94%', maxHeight: 126, objectFit: 'contain', filter: `drop-shadow(0 8px 20px ${DON_AC}4d) drop-shadow(0 4px 10px rgba(0,0,0,0.6))` }} />
                </div>
                <p className="font-cinzel font-800" style={{ fontSize: '0.98rem', color: '#f0ede8', lineHeight: 1.08 }}>Don&apos;s Gauntlet</p>
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${DON_AC}dd`, marginTop: 3, lineHeight: 1.3 }}>The endgame descent</p>
                <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', color: DON_AC, background: `${DON_AC}1e`, border: `1px solid ${DON_AC}66`, borderRadius: 999, padding: '0.34rem 0.8rem' }}>
                  Descend
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                </span>
              </motion.button>
            ) : (
              <motion.div aria-disabled
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 0.78, y: 0 }} transition={{ delay: 0.14, type: 'spring', stiffness: 380, damping: 28 }}
                style={{
                  position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  padding: '0.95rem 0.7rem 0.85rem', borderRadius: 16, cursor: 'default',
                  background: `linear-gradient(180deg, ${DON_AC}12, rgba(0,0,0,0.34))`,
                  border: `1px solid ${DON_AC}3a`,
                }}>
                <div style={{ position: 'relative', width: '100%', height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                  <div aria-hidden style={{ position: 'absolute', width: 138, height: 138, borderRadius: '50%', background: `radial-gradient(circle, ${DON_AC}2a, transparent 68%)`, filter: 'blur(3px)' }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/donsgauntlet.png" alt="" loading="lazy" decoding="async"
                    style={{ position: 'relative', maxWidth: '94%', maxHeight: 126, objectFit: 'contain', filter: 'grayscale(0.45) drop-shadow(0 4px 10px rgba(0,0,0,0.55))' }} />
                </div>
                <p className="font-cinzel font-800" style={{ fontSize: '0.98rem', color: '#dcece4', lineHeight: 1.08 }}>Don&apos;s Gauntlet</p>
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#9db9ab', marginTop: 3, lineHeight: 1.3 }}>Beat Don Finleone at the Throne to descend</p>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.52rem', color: `${DON_AC}cc`, background: `${DON_AC}1e`, border: `1px solid ${DON_AC}55`, borderRadius: 999, padding: '0.32rem 0.75rem' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Defeat the Don
                </span>
              </motion.div>
            )}
          </div>
        </motion.div>
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
// ── THE NUMBERS YOU ACTUALLY FIGHT WITH ──────────────────────────────────────
// This block has now been wrong twice. First it showed HP / Speed / DMG straight
// off the BARE HULL, which ignores crew, items, classes and Renown — a captain
// with five level-100 legendaries read the same as one with an empty deck. Then it
// showed a Raid Score / Offense / Defense, which are 0-100 inventions benchmarked
// against a constant, and mean nothing to anyone.
//
// These are the real values. They come out of getRaidPlayerStats — the very
// function the raid screen calls — so what you read here is exactly what walks into
// the fight. Hull is post-items, post-classes, post-Renown. The damage range is the
// real roll, with the crit you can actually land on it.
function PrepStats({ s, accent }: {
  s: { hull: number; hitMin: number; hitMax: number; crit: number; dodge: number; fortune: number; speed: number }
  accent: string
}) {
  const tile = (label: string, value: string, sub?: string, color?: string) => (
    <div key={label} style={{
      flex: 1, minWidth: 0, padding: '0.5rem 0.4rem', borderRadius: 10,
      background: 'rgba(0,0,0,0.34)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center',
    }}>
      <p className="font-karla font-700 uppercase tracking-[0.13em]" style={{ fontSize: '0.46rem', color: '#8a8680' }}>{label}</p>
      <p className="font-cinzel font-800 truncate" style={{ fontSize: '0.92rem', color: color ?? '#f3ede0', marginTop: 2 }}>{value}</p>
      {sub && <p className="font-karla font-600" style={{ fontSize: '0.5rem', color: '#7a7672', marginTop: 1 }}>{sub}</p>}
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {tile('Hull', String(s.hull), 'max HP', '#7fd49a')}
        {tile('Damage', `${s.hitMin}–${s.hitMax}`, `crit ${s.crit}`, accent)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {tile('Dodge', String(s.dodge))}
        {tile('Fortune', String(s.fortune))}
        {tile('Speed', String(s.speed))}
      </div>
    </div>
  )
}

// ── LOADOUT ROW ──────────────────────────────────────────────────────────────
// Crew and items were two separate tall blocks, each with its own border, its own
// padding and its own "Manage ›" link. On a 400px modal that is most of the height
// spent saying very little.
//
// One primitive now does both: a label with the count that matters (5/6, 3/4), a
// tight strip of the actual faces or icons, and one Manage link. Empty slots are
// dashed circles, so "I forgot someone" is visible without reading a word. Same
// shape twice reads faster than two bespoke layouts.
function PrepLoadoutRow({ label, filled, total, children, accent, onManage, href }: {
  label: string
  filled: number
  total: number
  children: React.ReactNode
  accent: string
  onManage?: () => void
  href?: string
}) {
  const short = filled < total
  const empty = filled === 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '0.5rem 0.6rem', borderRadius: 10,
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${empty ? 'rgba(248,113,113,0.32)' : short ? 'rgba(232,200,121,0.26)' : 'rgba(74,222,128,0.24)'}`,
    }}>
      <div style={{ flexShrink: 0, minWidth: 52 }}>
        <p className="font-karla font-700 uppercase tracking-[0.13em]" style={{ fontSize: '0.46rem', color: '#8a8680' }}>{label}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', marginTop: 1, color: empty ? '#f87171' : short ? '#e8c879' : '#7fd49a' }}>
          {filled}<span style={{ color: '#6a6764' }}>/{total}</span>
        </p>
      </div>

      {/* The strip. Portraits OVERLAP rather than sit side by side, so the row's width
          is bounded no matter how many slots a ship carries — six crew, eight items, it
          makes no difference. Nothing to overflow, nothing to scroll, and it reads as a
          stack of people rather than a queue of them. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>

      {href ? (
        <a href={href} onClick={e => e.stopPropagation()} className="font-karla font-700 uppercase tracking-[0.08em]"
          style={{ flexShrink: 0, fontSize: '0.55rem', color: accent, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          Manage <span style={{ fontSize: '0.72rem', lineHeight: 1 }}>›</span>
        </a>
      ) : (
        <button type="button" onClick={onManage} className="font-karla font-700 uppercase tracking-[0.08em]"
          style={{ flexShrink: 0, fontSize: '0.55rem', color: accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          Manage <span style={{ fontSize: '0.72rem', lineHeight: 1 }}>›</span>
        </button>
      )}
    </div>
  )
}

const DOT = 27
/** Overlap so the strip's width can never run away from the row. Earlier slots sit ON
 *  TOP, which keeps the captain (slot 0) unobscured — he is the one you look for. */
function stackStyle(i: number, total: number): React.CSSProperties {
  return { flexShrink: 0, marginLeft: i === 0 ? 0 : -9, zIndex: total - i, position: 'relative' }
}

/** A crew face, or a dashed hole where one should be. The captain wears a gold ring. */
function PrepCrewDot({ card, captain, i, total }: { card: CrewMember | null; captain: boolean; i: number; total: number }) {
  const rc = card ? (CREW_RARITY_COLORS[card.rarity as 1 | 2 | 3 | 4] ?? '#6a6764') : '#6a6764'
  const ring = card ? (captain ? '#f0c040' : rc) : (captain ? 'rgba(240,192,64,0.35)' : 'rgba(255,255,255,0.22)')
  const base: React.CSSProperties = {
    ...stackStyle(i, total),
    width: DOT, height: DOT, borderRadius: '50%',
    // A ring the same color as the row's backdrop, so overlapping portraits read as
    // separate discs instead of one smeared blob.
    boxShadow: '0 0 0 2px rgba(10,8,7,0.95)',
  }
  if (!card) {
    return <div aria-label="Empty crew slot" style={{ ...base, border: `1.5px dashed ${ring}`, background: 'rgba(6,9,16,0.55)' }} />
  }
  return (
    <div title={captain ? `Captain: ${card.name}` : card.name}
      style={{ ...base, overflow: 'hidden', border: `1.5px solid ${ring}`, background: 'rgba(6,9,16,0.85)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={CREW_IMG_BASE + card.filename} alt="" loading="lazy" decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
    </div>
  )
}

/** An equipped item, or a dashed hole. */
function PrepItemDot({ def, i, total }: { def: (typeof RAID_ITEMS)[number] | null; i: number; total: number }) {
  const rc = def ? (RARITY_COLOR[def.rarity] ?? '#9ca3af') : '#9ca3af'
  const base: React.CSSProperties = {
    ...stackStyle(i, total),
    width: DOT, height: DOT, borderRadius: 8,
    boxShadow: '0 0 0 2px rgba(10,8,7,0.95)',
  }
  if (!def) {
    return <div aria-label="Empty item slot" style={{ ...base, border: '1.5px dashed rgba(255,255,255,0.22)', background: 'rgba(6,9,16,0.55)' }} />
  }
  return (
    <div title={def.name} style={{
      ...base, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1.5px solid ${rc}77`, background: `${rc}22`,
    }}>
      {def.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={def.image} alt="" loading="lazy" decoding="async" style={{ width: '86%', height: '86%', objectFit: 'contain' }} />
        : <span style={{ color: rc, display: 'flex' }}><IconCrate size={14} /></span>}
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
