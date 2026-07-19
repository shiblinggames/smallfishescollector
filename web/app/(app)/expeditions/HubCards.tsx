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

// Second-row hub card (PvP / Gauntlets). Smaller than the Campaign /
// Voyages cards — art + title + one line + a status footer. When `locked`
// it dims, drops its tap handler, and shows a "Coming Soon" lock instead of
// the open affordance.
function SideHubCard({ accent, image, title, desc, locked, onClick, tag, lockLabel = 'Coming Soon', cta = 'Open ›' }: {
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
  /** Footer call-to-action when available. Defaults to 'Open ›'; the Gauntlet
   *  swaps to 'Resume ›' when a run is waiting to be picked back up. */
  cta?: string
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
            {cta}
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

  const onOrder = (a: OrderAction) => {
    if (a === 'campaign') setModal('campaign')
    else if (a === 'voyages') setModal('voyages')
    else if (a === 'loadout') window.dispatchEvent(new CustomEvent('expedition:open-loadout'))
  }
  // The Opportunity strip's actions are a superset — modals, routes (Link handles
  // those itself), and loadout via event.
  const onOpportunity = (a: OpportunityAction) => {
    if (a.kind === 'modal') setModal(a.modal)
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
            The story mode. You fight every battle yourself, raid by raid, for items and chapters.
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
            Passive income. Your crew sail without you and bring back doubloons, gems and Nav XP.
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
          onClick={gauntletOpen ? () => setModal('gauntlets') : undefined}
          lockLabel="Clear Chapter 2"
          tag={gauntletResumable ? 'Resume' : undefined}
          cta={gauntletResumable ? 'Resume ›' : 'Choose ›'}
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
            // The modal must never run off the screen. Cap it to the viewport and let the
            // BODY scroll, so the header and the Begin button stay put and reachable no
            // matter how much sits between them.
            display: 'flex', flexDirection: 'column',
            maxHeight: 'calc(100dvh - 2rem)',
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

          {/* Everything between the title and the buttons scrolls. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', margin: '0 -0.25rem', padding: '0 0.25rem' }}>
          <PrepStats s={prepStats} accent={campaignAccent} />

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
              {(() => {
                // Read the RAID slot, never the voyage one. Reading the wrong slot is
                // what used to show the voyage party on the campaign modal.
                const crewSlots: (CrewMember | null)[] = Array(shipCrewSlots).fill(null)
                for (const c of roster) {
                  if (c.raidSlot != null && c.raidSlot >= 0 && c.raidSlot < shipCrewSlots) crewSlots[c.raidSlot] = c
                }
                const itemDefs = equippedRaidItems
                  .map(id => RAID_ITEMS.find(i => i.id === id) ?? null)
                  .filter((d): d is (typeof RAID_ITEMS)[number] => !!d)
                const itemSlots: ((typeof RAID_ITEMS)[number] | null)[] = Array(raidItemSlots).fill(null)
                itemDefs.slice(0, raidItemSlots).forEach((d, i) => { itemSlots[i] = d })
                const aboardNow  = crewSlots.filter(Boolean).length
                const onVoyageNow = roster.filter(c => c.voyageSlot != null).length
                const ashoreNow   = roster.filter(c => c.raidSlot == null && c.voyageSlot == null).length
                return (
                  <>
                    {/* ── SAILING ALONE ─────────────────────────────────────
                        The empty deck used to be a quiet "Crew 0/5" that a new captain
                        had no reason to read as fatal. It is the loudest thing on the
                        screen now, it says WHY (their crew is on the voyage track, and
                        the two tracks are exclusive), and it offers the one tap that
                        fixes it. */}
                    {aboardNow === 0 && (
                      <div style={{
                        marginBottom: 10, padding: '0.8rem 0.85rem', borderRadius: 12, textAlign: 'left',
                        background: 'linear-gradient(180deg, rgba(220,38,38,0.18), rgba(140,20,20,0.06))',
                        border: '1px solid rgba(239,68,68,0.55)',
                      }}>
                        <p className="font-cinzel font-800 uppercase tracking-[0.06em]" style={{ fontSize: '0.86rem', color: '#fca5a5' }}>
                          You are sailing alone
                        </p>
                        <p className="font-karla" style={{ fontSize: '0.76rem', color: '#f0cfcf', lineHeight: 1.45, marginTop: 4 }}>
                          {ashoreNow > 0
                            ? `All ${shipCrewSlots} crew slots are empty and you have ${ashoreNow} crew ashore. A raid without a crew is a losing fight.`
                            : onVoyageNow > 0
                              ? `All ${shipCrewSlots} crew slots are empty. Your ${onVoyageNow} crew are on the VOYAGE track, and a crew can only sail one track at a time.`
                              : 'You have no crew. Recruit at the Crew Hall before you sail into a fight.'}
                        </p>
                        {(ashoreNow > 0 || onVoyageNow > 0) && (
                          <button
                            type="button"
                            disabled={crewing}
                            onClick={async () => {
                              setCrewing(true); setCrewMsg(null)
                              const res = await crewTheDeck(ashoreNow === 0)
                              setCrewing(false)
                              if ('error' in res) { setCrewMsg(res.error); return }
                              setCrewMsg(res.assigned > 0
                                ? `${res.assigned} crew aboard. Weigh anchor.`
                                : 'No crew free to bring aboard.')
                              router.refresh()
                            }}
                            className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                            style={{
                              width: '100%', marginTop: 9, padding: '0.7rem', borderRadius: 10, fontSize: '0.86rem',
                              color: '#1a0f0f', background: 'linear-gradient(180deg, #fca5a5, #ef4444)',
                              border: '1px solid #ef4444', cursor: crewing ? 'wait' : 'pointer',
                            }}>
                            {crewing ? 'Mustering…'
                              : ashoreNow > 0 ? 'Crew the Deck'
                              : 'Recall Crew from Voyages'}
                          </button>
                        )}
                        {ashoreNow === 0 && onVoyageNow === 0 && (
                          <Link href="/crew" className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                            style={{
                              display: 'block', width: '100%', marginTop: 9, padding: '0.7rem', borderRadius: 10,
                              fontSize: '0.86rem', textAlign: 'center',
                              color: '#1a0f0f', background: 'linear-gradient(180deg, #fca5a5, #ef4444)',
                              border: '1px solid #ef4444',
                            }}>
                            Go to the Crew Hall
                          </Link>
                        )}
                        {crewMsg && (
                          <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#fde68a', marginTop: 7 }}>{crewMsg}</p>
                        )}
                      </div>
                    )}

                    <PrepLoadoutRow
                      label="Raid Crew" filled={aboardNow} total={shipCrewSlots}
                      accent={campaignAccent} href="/crew?tab=roster&filter=raid"
                    >
                      {crewSlots.map((c, i) => <PrepCrewDot key={i} card={c} captain={i === 0} i={i} total={crewSlots.length} />)}
                    </PrepLoadoutRow>

                    {/* The OTHER roster. A captain who has assigned their crew to voyages
                        believes their crew is assigned, and they are right — just not to
                        this. Showing both makes the trade visible instead of a trap. */}
                    {onVoyageNow > 0 && (
                      <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8680', lineHeight: 1.4, margin: '-2px 0 8px' }}>
                        {onVoyageNow} more crew are out on the <strong style={{ color: '#a8a29a' }}>voyage</strong> track. A crew sails one track or the other, never both.
                      </p>
                    )}
                    <PrepLoadoutRow
                      label="Items" filled={itemDefs.length} total={raidItemSlots}
                      accent={campaignAccent}
                      onManage={() => {
                        // Close first, or the Loadout drawer mounts BEHIND this modal and
                        // the player sees nothing happen.
                        setModal(null)
                        window.dispatchEvent(new CustomEvent('expedition:open-loadout'))
                      }}
                    >
                      {itemSlots.map((d, i) => <PrepItemDot key={i} def={d} i={i} total={itemSlots.length} />)}
                    </PrepLoadoutRow>
                  </>
                )
              })()}
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

          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 10 }}>
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
              // ── SAILING ALONE ────────────────────────────────────────────
              // The steepest leak in the game. voyage_slot and raid_slot are MUTUALLY
              // EXCLUSIVE, so a captain who put their crew on voyages (which everyone
              // finds first, because voyages are passive and forgiving) has an EMPTY
              // raid deck and no idea. The modal showed them "Crew 0/5" and cheerfully
              // let them sail. Every player who beat Raid 1 had 4-6 raid crew; every
              // player who stalled had 0-2. One had run 23 voyages and never once put a
              // soul in a raid slot.
              //
              // A story node is not a fight, so it is still allowed through — being
              // blocked from READING is nonsense. A FIGHT is barred.
              const aboard = roster.filter(c => c.raidSlot != null).length
              const isFight = campaign.nextNodeKind === 'raid' || campaign.nextNodeKind === 'challenge'
              const sailingAlone = aboard === 0 && isFight

              const beginBlocked =
                !campaign.nextNodeId ||
                campaign.nextNodeLocked ||
                campaign.repairOwed > 0 ||
                sailingAlone
              const beginLabel =
                !campaign.nextNodeId   ? 'Story Complete'
                : campaign.nextNodeLocked ? (campaign.nextNodeLockReason ?? 'Node Locked')
                : campaign.repairOwed > 0 ? 'Repair Ship First'
                : sailingAlone ? 'Crew Your Ship First'
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
            {gauntletResumable
              ? <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flexShrink: 0, fontSize: '0.5rem', color: '#0c0f14', background: gauntletAccent, borderRadius: 999, padding: '0.25rem 0.55rem', whiteSpace: 'nowrap' }}>Resume ›</span>
              : <span aria-hidden className="font-karla font-700" style={{ flexShrink: 0, color: gauntletAccent, fontSize: '1rem' }}>›</span>}
          </button>

          {/* Don's Gauntlet — Gauntlet II, led by the ghost of Don Finleone.
              A "Coming Soon" tease until it goes live; once the door is open
              (admins now, everyone post-launch) it becomes a live link. */}
          {donsGauntletOpen ? (
            <button type="button"
              onClick={() => { setModal(null); router.push('/raids/dons-gauntlet') }}
              style={{
                marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.75rem', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                background: 'linear-gradient(180deg, rgba(36,116,78,0.22), rgba(0,0,0,0.25))',
                border: '1px solid rgba(36,116,78,0.6)',
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/donsgauntlet.png" alt="" loading="lazy" decoding="async"
                style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 3px 10px rgba(36,116,78,0.5))' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.1 }}>Don&apos;s Gauntlet</p>
                <p className="font-karla font-500" style={{ fontSize: '0.66rem', color: '#a9c6b6', lineHeight: 1.35, marginTop: 2 }}>
                  The don went down with the deep, and his ghost is still collecting. Descend into the darker gauntlet.
                </p>
              </div>
              <span aria-hidden className="font-karla font-700" style={{ flexShrink: 0, color: '#7fd9a8', fontSize: '1rem' }}>›</span>
            </button>
          ) : (
            <div aria-disabled
              style={{
                marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.75rem', borderRadius: 14, textAlign: 'left', cursor: 'default', opacity: 0.72,
                background: 'linear-gradient(180deg, rgba(36,116,78,0.14), rgba(0,0,0,0.25))',
                border: '1px solid rgba(36,116,78,0.4)',
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/donsgauntlet.png" alt="" loading="lazy" decoding="async"
                style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, filter: 'grayscale(0.35) drop-shadow(0 3px 10px rgba(36,116,78,0.45))' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#dcece4', lineHeight: 1.1 }}>Don&apos;s Gauntlet</p>
                <p className="font-karla font-500" style={{ fontSize: '0.66rem', color: '#9db9ab', lineHeight: 1.35, marginTop: 2 }}>
                  The don went down with the deep, and his ghost is still collecting. A darker gauntlet stirs below.
                </p>
              </div>
              <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flexShrink: 0, fontSize: '0.5rem', color: '#7fd9a8', background: 'rgba(36,116,78,0.24)', border: '1px solid rgba(36,116,78,0.55)', borderRadius: 999, padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}>Coming Soon</span>
            </div>
          )}
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
