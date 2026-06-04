'use client'

// Expeditions hub: two cards (Story + Voyages) below the Ship Hero,
// each opens a focused ready-check modal. The modal is intentionally
// short — it surfaces what's next, runs a small prereq check, and
// hands off to the existing inline section below (via scroll-into-
// view) for the heavy UI.
//
// Why hub + modal instead of inline-only:
//   - The page used to bury the Story map (Raids) at the bottom; the
//     hub promotes it to the top alongside Voyages with equal weight.
//   - The modal is a "make sure you're ready" beat — players were
//     entering raids without their items equipped or ship repaired.
//   - Modals are short. The actual chapter map / voyage panel keeps
//     all its room as inline sections below.

import { useState, useEffect } from 'react'
import PopupShell from '@/components/PopupShell'

export type CampaignCardData = {
  /** Display name of the next non-cleared main-chain node. Null if the
   *  player has finished every available node. */
  nextNodeName: string | null
  /** Node image to show in the modal. Falls back to a generic icon. */
  nextNodeImage: string | null
  nextNodeLocked: boolean
  /** Nodes the player has cleared / total nodes on the map (story +
   *  raids + skirmish + everything else). Drives the card progress. */
  clearedCount: number
  totalNodes: number
  /** Repair-debt blocking combat nodes. Non-zero → ready check warns. */
  repairOwed: number
  /** Number of raid items equipped (0, 1, or 2 depending on capacity). */
  equippedItemsCount: number
}

export type VoyageStatus = 'idle' | 'sailing' | 'returned'

export type VoyageCardData = {
  status: VoyageStatus
  /** Display text for the card's status line ("Ready to sail" /
   *  "Sailing · 1h 24m" / "Claim reward"). */
  statusLabel: string
  /** Route name when a voyage is active/returned, else null. */
  routeName: string | null
}

interface Props {
  campaign: CampaignCardData
  voyages: VoyageCardData
}

function scrollToSection(id: string) {
  // Tiny delay lets the modal-close animation finish so the scroll
  // doesn't race the modal-tab-bar layout shift.
  setTimeout(() => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 220)
}

// ShipHero listens for this event and opens its Loadout drawer — the
// full prep screen with crew slots, item slots, Voyage / Raid Score
// tiles, and the breakdown sheets. Hub modals dispatch this when the
// player taps "Open Prep" so the prep flow gates the next launch.
function openPrepDrawer() {
  window.dispatchEvent(new Event('expedition:open-loadout'))
}

// Status pill colours per voyage state — kept here so the card +
// modal stay in sync.
const VOYAGE_ACCENT: Record<VoyageStatus, { fg: string; bg: string; bd: string }> = {
  idle:     { fg: '#7090c0', bg: 'rgba(112,144,192,0.10)', bd: 'rgba(112,144,192,0.32)' },
  sailing:  { fg: '#c4a96a', bg: 'rgba(196,169,106,0.10)', bd: 'rgba(196,169,106,0.32)' },
  returned: { fg: '#4ade80', bg: 'rgba(74,222,128,0.12)',  bd: 'rgba(74,222,128,0.4)'   },
}

export default function HubCards({ campaign, voyages }: Props) {
  const [modal, setModal] = useState<null | 'campaign' | 'voyages'>(null)

  // Esc closes either modal
  useEffect(() => {
    if (!modal) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setModal(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  const campaignAccent = '#c4a96a'
  const vAcc = VOYAGE_ACCENT[voyages.status]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.2rem' }}>
        {/* ── Story card ─────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setModal('campaign')}
          style={{
            background: 'rgba(6,12,20,0.92)',
            border: `1px solid ${campaignAccent}30`,
            borderTop: `1px solid ${campaignAccent}55`,
            borderRadius: 18,
            padding: '0.9rem 0.9rem 1rem',
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72, marginBottom: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={campaign.nextNodeImage ?? '/raidlog.png'}
              alt=""
              style={{ width: '100%', height: 68, objectFit: 'contain', filter: `drop-shadow(0 4px 14px ${campaignAccent}40)` }}
            />
          </div>
          <p className="font-karla font-700 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.5rem', color: `${campaignAccent}cc`, marginBottom: 3 }}>
            Story
          </p>
          <p className="font-cinzel font-700"
            style={{ fontSize: '0.95rem', color: '#ffffff', lineHeight: 1.15, marginBottom: 4 }}>
            Campaign
          </p>
          <p className="font-karla font-600"
            style={{ fontSize: '0.62rem', color: '#9a9488', lineHeight: 1.35 }}>
            {campaign.nextNodeName
              ? <>Next: <span style={{ color: '#e8d8a8' }}>{campaign.nextNodeName}</span></>
              : 'All cleared'}
            <br />
            <span style={{ color: '#6a6764' }}>{campaign.clearedCount}/{campaign.totalNodes} done</span>
          </p>
        </button>

        {/* ── Voyages card ───────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setModal('voyages')}
          style={{
            background: 'rgba(6,12,20,0.92)',
            border: `1px solid ${vAcc.bd}`,
            borderTop: `1px solid ${vAcc.fg}55`,
            borderRadius: 18,
            padding: '0.9rem 0.9rem 1rem',
            cursor: 'pointer', textAlign: 'left',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
          }}
        >
          {voyages.status === 'returned' && (
            <span aria-hidden style={{
              position: 'absolute', top: 8, right: 8,
              width: 9, height: 9, borderRadius: 9,
              background: '#4ade80',
              boxShadow: '0 0 8px rgba(74,222,128,0.7)',
              animation: 'shop-pulse 1.6s ease-in-out infinite',
            }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72, marginBottom: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/voyagemap.png"
              alt=""
              style={{ width: '100%', height: 68, objectFit: 'contain', filter: `drop-shadow(0 4px 14px ${vAcc.fg}50)` }}
            />
          </div>
          <p className="font-karla font-700 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.5rem', color: `${vAcc.fg}cc`, marginBottom: 3 }}>
            Daily
          </p>
          <p className="font-cinzel font-700"
            style={{ fontSize: '0.95rem', color: '#ffffff', lineHeight: 1.15, marginBottom: 4 }}>
            Voyages
          </p>
          <p className="font-karla font-600"
            style={{ fontSize: '0.62rem', color: vAcc.fg, lineHeight: 1.35 }}>
            {voyages.statusLabel}
            {voyages.routeName && (
              <>
                <br />
                <span style={{ color: '#6a6764' }}>{voyages.routeName}</span>
              </>
            )}
          </p>
        </button>
      </div>

      {/* ── Campaign ready-check modal ─────────────────────────── */}
      <PopupShell open={modal === 'campaign'} onClose={() => setModal(null)}>
        <div
          role="dialog"
          aria-modal
          onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 380,
            background: 'linear-gradient(180deg, #1a1408 0%, #0a0807 100%)',
            border: `1px solid ${campaignAccent}55`,
            borderRadius: 20,
            padding: '1.1rem 1rem 1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.18em] text-center"
            style={{ fontSize: '0.55rem', color: `${campaignAccent}aa`, marginBottom: 4 }}>
            Campaign · The Sunken Hand
          </p>
          <p className="font-cinzel font-700 text-center"
            style={{ fontSize: '1.1rem', color: '#f0e8d0', marginBottom: 14 }}>
            {campaign.nextNodeName ?? 'Story complete'}
          </p>

          {campaign.nextNodeName && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
              <ReadyRow
                label="Ship repaired"
                ok={campaign.repairOwed === 0}
                detail={campaign.repairOwed > 0 ? `${campaign.repairOwed.toLocaleString()} ⟡ to repair` : 'Ready'}
              />
              <ReadyRow
                label="Equip items"
                ok={campaign.equippedItemsCount > 0}
                detail={campaign.equippedItemsCount > 0 ? `${campaign.equippedItemsCount} equipped` : 'None equipped'}
              />
              {campaign.nextNodeLocked && (
                <ReadyRow
                  label="Node unlocked"
                  ok={false}
                  detail="Clear the previous node first"
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
                borderRadius: 12, fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setModal(null); openPrepDrawer() }}
              className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{
                flex: 2, padding: '0.7rem 0',
                background: `${campaignAccent}1c`,
                border: `1px solid ${campaignAccent}66`,
                color: campaignAccent,
                borderRadius: 12, fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              Open Prep →
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setModal(null); scrollToSection('chapter-map') }}
            className="font-karla font-700 uppercase"
            style={{
              width: '100%', padding: '0.55rem 0', marginTop: 8,
              background: 'transparent', border: 'none',
              color: 'rgba(240,237,232,0.5)',
              fontSize: '0.6rem', letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            Or view the story map ↓
          </button>
        </div>
      </PopupShell>

      {/* ── Voyages ready-check modal ──────────────────────────── */}
      <PopupShell open={modal === 'voyages'} onClose={() => setModal(null)}>
        <div
          role="dialog"
          aria-modal
          onClick={e => e.stopPropagation()}
          style={{
            margin: 'auto', width: '100%', maxWidth: 380,
            background: 'linear-gradient(180deg, #0c1828 0%, #050a14 100%)',
            border: `1px solid ${vAcc.bd}`,
            borderRadius: 20,
            padding: '1.1rem 1rem 1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.18em] text-center"
            style={{ fontSize: '0.55rem', color: `${vAcc.fg}aa`, marginBottom: 4 }}>
            Daily Voyage
          </p>
          <p className="font-cinzel font-700 text-center"
            style={{ fontSize: '1.1rem', color: '#f0e8d0', marginBottom: 4 }}>
            {voyages.status === 'returned' ? 'Your crew is back'
              : voyages.status === 'sailing' ? 'Crew is at sea'
              : 'Plan today’s voyage'}
          </p>
          <p className="font-karla font-600 text-center"
            style={{ fontSize: '0.72rem', color: vAcc.fg, marginBottom: 14 }}>
            {voyages.statusLabel}{voyages.routeName ? ` · ${voyages.routeName}` : ''}
          </p>

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
                borderRadius: 12, fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setModal(null); openPrepDrawer() }}
              className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{
                flex: 2, padding: '0.7rem 0',
                background: vAcc.bg,
                border: `1px solid ${vAcc.fg}66`,
                color: vAcc.fg,
                borderRadius: 12, fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              Open Prep →
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setModal(null); scrollToSection('voyage-panel') }}
            className="font-karla font-700 uppercase"
            style={{
              width: '100%', padding: '0.55rem 0', marginTop: 8,
              background: 'transparent', border: 'none',
              color: 'rgba(240,237,232,0.5)',
              fontSize: '0.6rem', letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            Or view the voyage panel ↓
          </button>
        </div>
      </PopupShell>
    </>
  )
}

function ReadyRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10,
      padding: '0.55rem 0.8rem', borderRadius: 10,
      background: 'rgba(0,0,0,0.32)',
      border: `1px solid ${ok ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.28)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span aria-hidden style={{
          width: 16, height: 16, borderRadius: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ok ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)',
          color: ok ? '#4ade80' : '#f87171',
          fontSize: '0.7rem', fontWeight: 700, lineHeight: 1,
        }}>{ok ? '✓' : '!'}</span>
        <p className="font-karla font-700"
          style={{ fontSize: '0.7rem', color: '#d0cdc8' }}>{label}</p>
      </div>
      <p className="font-karla"
        style={{ fontSize: '0.66rem', color: ok ? '#86efac' : '#fca5a5' }}>
        {detail}
      </p>
    </div>
  )
}
