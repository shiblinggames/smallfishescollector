'use client'

// Expeditions hub: two cards (Story + Voyages) below the Ship Hero.
// Tapping a card opens a focused prep modal that contains the full
// launch flow inline — repair (if owed), crew assignment, items
// equip, all without leaving the modal. Nested PopupShells handle the
// item / crew detail editors.

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { vibrate } from '@/lib/haptics'
import PopupShell from '@/components/PopupShell'
import HubTile, { HUB_GRID } from '@/components/HubTile'
import CaptainsOrders, { type OrderAction } from './CaptainsOrders'
import type { CrewMember } from '@/app/(app)/crew/actions'
import DailyVoyagePanel from './DailyVoyagePanel'
import BountiesPanel from './BountiesPanel'
import BountyRungUnlock from './BountyRungUnlock'
import { BOUNTY_RUNGS } from '@/lib/bounties'
import type { CrewMember as SocialCrewMember } from '@/app/(app)/social/actions'
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
  /** A boss you have already beaten, wearing the backdrop he was beaten in.
   *  Barnacle Pete until you have beaten anyone. */
  bossName: string
  bossPortrait: string
  bossBackdrop: string | null
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
  ownedRaidItems: string[]
  equippedRaidItems: string[]
  raidItemSlots: number
  roster: CrewMember[]
  shipCrewSlots: number
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
  /** Whether the Gauntlet door is open to this player (admin, or live + cleared
   *  Chapter 2). Drives the Gauntlets card lock independently of PvP. */
  gauntletOpen: boolean
  /** Don's Gauntlet door — admin-only until DONS_GAUNTLET_LIVE. When open, the
   *  picker's Don's card becomes a live link instead of a "Coming Soon" tease. */
  donsGauntletOpen?: boolean
  /** A saved Gauntlet run is waiting (paused or crash-resumable) — the card
   *  swaps its CTA to "Resume" so the player knows to pick it back up. */
  gauntletResumable?: boolean
  /** Which gauntlet the open run belongs to — drives the correct card's Resume
   *  CTA. A single flag used to light Davy's card even for a Don run. */
  davyResumable?: boolean
  donsResumable?: boolean
  /** Claimed Gauntlet Locker Upgrade ids — drives the voyage panel's truthful
   *  Safe Passage / Swift Sails surfacing. */
  gauntletUpgrades: string[]
  /** Campaign cleared, so the bounty board is posting. */
  bountiesOpen: boolean
  /** A rung earned but never announced, or null when there is nothing to say. */
  bountyNews: { chapter: number; title: string; boss: string; orders: number; gems: number; first: boolean } | null
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

export default function HubCards({
  campaign, voyages,
  ownedRaidItems, equippedRaidItems, raidItemSlots,
  roster, shipCrewSlots,
  shipTier, todayVoyage, readyVoyage, expeditionXP, voyageHistory,
  bountiesOpen, bountyNews, gauntletOpen, donsGauntletOpen, gauntletResumable, davyResumable, donsResumable, gauntletUpgrades,
  raidsCleared, captainsOrdersDone,
  gems, freeRecruitAvailable, canAffordNewSkin, challengeName,
}: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'campaign' | 'voyages' | 'bounties' | 'gauntlets'>(null)

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

  const campaignAccent = '#c4a96a'
  const vAcc = VOYAGE_ACCENT[voyages.status]
  const bountyAccent = '#c084fc'
  const gauntletAccent = '#7a8fc9'
  // Each gauntlet wears its own identity inside the chooser: Davy's teal,
  // Don's kraken-green (matches the gauntlet screens + switcher).
  const DAVY_AC = '#5eead4'
  const DON_AC = '#3fbf82'

  // Campaign now surfaces the story map as a full-screen overlay
  // (CampaignMapOverlay listens for this) instead of the old ready-check modal.
  const openCampaignMap = () => window.dispatchEvent(new CustomEvent('expedition:open-campaign-map'))

  const onOrder = (a: OrderAction) => {
    if (a === 'campaign') openCampaignMap()
    else if (a === 'voyages') setModal('voyages')
    else if (a === 'loadout') window.dispatchEvent(new CustomEvent('expedition:open-loadout'))
  }

  return (
    <>
      {/* First-time onboarding checklist only. The persistent "Opportunity"
          strip that used to sit here once onboarding latched was removed — it
          wasn't pulling its weight. Orders still latches off for good once every
          task is done, so past that the top-of-page slot is simply empty. */}
      {!captainsOrdersDone && (
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
      <div style={HUB_GRID}>
        {/* The Campaign tile wears a boss you have PUT DOWN, on the backdrop
            you fought him on, composed the way his node card composes him.
            The generic seascape said nothing about your campaign; this says
            how far down the coast you have got, and changes as you go. */}
        <HubTile
          coachId="campaign"
          bgImage={campaign.bossBackdrop ?? '/exp-campaign.jpg'}
          accent={campaignAccent} title="Campaign"
          status={campaign.nextNodeName ? `Next: ${campaign.nextNodeName}` : 'All cleared'}
          statusColor="#f0e0b0"
          sub={campaign.nextNodeLocked ? campaign.nextNodeLockReason : null}
          subLock={campaign.nextNodeLocked}
          onClick={openCampaignMap}
          overlay={
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={campaign.bossPortrait} alt="" loading="lazy" decoding="async"
                style={{
                  position: 'absolute', right: -6, bottom: 26, height: '78%', width: 'auto',
                  maxWidth: '72%', objectFit: 'contain',
                  filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.75))',
                }} />
            </div>
          }
        />
        <HubTile
          coachId="voyages"
          bgImage="/exp-voyages.jpg" accent={vAcc.fg} title="Voyages"
          status={voyages.statusLabel} statusColor={vAcc.fg}
          sub={voyages.routeName}
          glow={voyages.status === 'sailing' || voyages.status === 'returned'}
          dot={voyages.status === 'returned' ? 'returned' : voyages.status === 'sailing' ? 'sailing' : null}
          progress={voyages.status === 'sailing' ? voyages.progress : null}
          onClick={() => setModal('voyages')}
        />
        {/* BOUNTIES took this slot from PvP, which was parked indefinitely and
            drawn locked for everyone. A tile that has said "Coming Later" for
            months is worse than no tile: it teaches players to stop reading
            that corner of the hub.

            The lock names the ONE boss that opens it, read off BOUNTY_RUNGS so
            it cannot drift from the gate. It said "Clear the campaign", which
            was true of the first design and became a lie the moment the board
            started opening at the end of Chapter I: it told a captain four
            chapters of work stood in front of a door they were one raid from. */}
        <HubTile
          bgImage="/exp-bounties.jpg" accent={bountyAccent} title="Bounties"
          status={bountiesOpen ? 'Open ›' : 'Locked'} statusColor={bountyAccent}
          sub={bountiesOpen
            ? 'Daily orders, paid in gems'
            : `Sink ${BOUNTY_RUNGS[0].boss} and the board opens`}
          locked={!bountiesOpen} lockLabel={`Beat ${BOUNTY_RUNGS[0].boss}`}
          onClick={bountiesOpen ? () => setModal('bounties') : undefined}
        />
        <HubTile
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
            // Custom voyage backdrop — a ship crossing the dusk sea. `cover`
            // stretches the plate over the WHOLE modal however tall it grows,
            // so the art reaches the header and the past-voyages footer too.
            // The tint used to ramp to 0.9 down there, which buried it under
            // flat navy; it is near-even now, and light, so the sea reads the
            // whole way down. Almost nothing inside the modal is opaque (the
            // route card and the "?" explainer are the two exceptions), so the
            // content still sits on the art rather than hiding it.
            background: `linear-gradient(180deg, rgba(6,12,22,0.34) 0%, rgba(6,11,20,0.48) 45%, rgba(5,9,16,0.44) 100%), url(/voyages-modal-bg.jpg) center / cover no-repeat`,
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

      {/* Every rung announces itself once. Dismissing straight into the board
          is the point: the news and the thing it is about are one tap apart. */}
      {bountyNews && (
        <BountyRungUnlock
          chapter={bountyNews.chapter}
          title={bountyNews.title}
          boss={bountyNews.boss}
          orders={bountyNews.orders}
          gems={bountyNews.gems}
          first={bountyNews.first}
          onOpen={() => setModal('bounties')}
        />
      )}

      {/* ── Bounties ── the daily orders board. ─────────────────────────── */}
      <PopupShell open={modal === 'bounties'} onClose={() => setModal(null)}>
        <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            margin: 'auto', width: '100%', maxWidth: 440,
            // THE ACTUAL BOARD. A painted plate in the same gouache idiom as
            // the voyage routes: salt-stained oak, an empty frame lit by one
            // lantern, old nails and the torn corners of notices long gone.
            // The middle is deliberately bare, because that is where ours go.
            //
            // A scrim over it, weighted to the FOOT. The lamp is at the top of
            // the plate and the wood falls to near-black at the bottom, so the
            // header reads against the lit half and the footnote against the
            // dark, without flattening the painting in between.
            //
            // Solid colour under it so the panel is never translucent while the
            // plate loads.
            backgroundColor: '#150e09',
            backgroundImage: 'linear-gradient(180deg, rgba(12,8,5,0.30) 0%, rgba(12,8,5,0.16) 34%, rgba(10,7,4,0.62) 100%), url(/bounty-board.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            border: '1px solid rgba(120,88,52,0.55)',
            borderTop: '1px solid rgba(190,146,92,0.55)',
            borderRadius: 20, padding: '0.4rem 0.4rem 0.6rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.75)',
          }}
        >
          {/* BountiesPanel owns its own title row, so the gem count can sit
              beside the title instead of taking a bar of its own. */}
          {modal === 'bounties' && <BountiesPanel onClose={() => setModal(null)} />}
        </motion.div>
      </PopupShell>

      {/* ── Gauntlets modal — entry hub for the push-your-luck gauntlets.
          Davy Jones is the first; more slot in later. Admin-only for now. ── */}
      <PopupShell open={modal === 'gauntlets'} onClose={() => setModal(null)}>
        <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            // No modal container — the two gauntlet cards (each with its own
            // abyss art) float directly on the PopupShell backdrop.
            margin: 'auto', width: '100%', maxWidth: 420,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: `${gauntletAccent}dd`, textShadow: '0 1px 5px rgba(0,0,0,0.85)' }}>Push your luck</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f4ecd8', textShadow: '0 2px 8px rgba(0,0,0,0.85)' }}>Choose your gauntlet</p>
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
                background: `linear-gradient(180deg, ${DAVY_AC}26 0%, rgba(2,6,12,0.5) 45%, rgba(2,6,12,0.82) 100%), url(/davy-gauntlet-bg.jpg) center / cover`,
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
              <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', color: davyResumable ? '#04120f' : DAVY_AC, background: davyResumable ? DAVY_AC : `${DAVY_AC}1e`, border: `1px solid ${DAVY_AC}66`, borderRadius: 999, padding: '0.34rem 0.8rem' }}>
                {davyResumable ? 'Resume' : 'Descend'}
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
                  background: `linear-gradient(180deg, ${DON_AC}28 0%, rgba(2,6,12,0.5) 45%, rgba(2,6,12,0.82) 100%), url(/dons-gauntlet-bg.jpg) center / cover`,
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
                <span className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', color: donsResumable ? '#04120f' : DON_AC, background: donsResumable ? DON_AC : `${DON_AC}1e`, border: `1px solid ${DON_AC}66`, borderRadius: 999, padding: '0.34rem 0.8rem' }}>
                  {donsResumable ? 'Resume' : 'Descend'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                </span>
              </motion.button>
            ) : (
              <motion.div aria-disabled
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 0.78, y: 0 }} transition={{ delay: 0.14, type: 'spring', stiffness: 380, damping: 28 }}
                style={{
                  position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  padding: '0.95rem 0.7rem 0.85rem', borderRadius: 16, cursor: 'default',
                  background: `linear-gradient(180deg, rgba(2,6,12,0.62) 0%, rgba(2,6,12,0.72) 55%, rgba(2,6,12,0.9) 100%), url(/dons-gauntlet-bg.jpg) center / cover`,
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

