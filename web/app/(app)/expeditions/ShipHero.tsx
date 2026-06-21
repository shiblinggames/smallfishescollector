'use client'

import { useState, useTransition, useEffect, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { repairShip } from '@/app/(app)/raids/actions'
import { motion, AnimatePresence, useDragControls, type DragControls } from 'framer-motion'
import type { ShipStats } from '@/lib/expeditions'
import { computeCombatRating, computeVoyageScore, EXPEDITION_SHIP_STATS, getRankTitle, raidItemSlotsForTier } from '@/lib/expeditions'
import { getShipClass } from '@/lib/shipClasses'
import { navLevelReqForShip } from '@/lib/gearGating'
import { SHIPS } from '@/lib/ships'
import { SHIP_SKINS } from '@/lib/shipSkins'
import { getRepairKit, repairKitRange, nextRepairKit } from '@/lib/repairKits'
import { buyRepairKit } from './repairKitActions'
import { equipShipSkin, saveEquippedRaidItems, forgeRaidItem } from './actions'
import PopupShell from '@/components/PopupShell'
import { assignToVoyage, benchCrew } from '@/app/(app)/crew/actions'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { applyCrewEffects, resolveEffects, effectSummary, SCOPE_META } from '@/lib/crewEffects'
import { RARITY_COLORS as CREW_RARITY_COLORS, RARITY_NAMES } from '@/lib/crewGen'
import { RAID_ITEMS, getRaidItem, FORGE_RECIPES } from '@/lib/raidItems'
import { renameShip, buyShip } from '@/app/shipyard/actions'
import { getXPProgress, navLevelBonuses, MAX_LEVEL } from '@/lib/expeditionLevel'
import { crewLevelFromXP } from '@/lib/crewLevel'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

type RosterCrew = {
  id: number
  cardId: number      // catalog card; only one of a given card may be aboard
  name: string
  filename: string
  slug: string        // species slug, drives crew-class lookup for the raid Special chooser
  rarity: number      // 1-4 (fish group)
  power: number       // rolled base stats (level bonus applied at read time)
  dodge: number
  fortune: number
  effects: string[]
  voyageSlot: number | null  // voyage party slot, or null if benched / on raid track
  raidSlot:   number | null  // raid loadout slot, or null if benched / on voyage track
  xp: number          // drives level + per-stat level bonus
}

const STAT_COLS = [
  { key: 'power'   as const, short: 'PWR', color: '#f87171' },
  { key: 'dodge'   as const, short: 'SAV', color: '#60a5fa' },
  { key: 'fortune' as const, short: 'FTN', color: '#f0c040' },
]

const RARITY_ITEM_COLOR: Record<string, string> = {
  common:    '#9ca3af',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
}

// Crew picker row — a compact, scannable list entry: small portrait + name +
// rarity + the three effective stats on one line, with trait/ability chips on a
// second line. Dense so the player sees the whole roster at a glance. Whole row
// taps to assign.
function PickerCrewCard({ card, selected, current, onSelect }: { card: RosterCrew; selected: boolean; current: boolean; onSelect: () => void }) {
  const color = CREW_RARITY_COLORS[card.rarity as 1 | 2 | 3 | 4] ?? '#6a6764'
  const eff = applyCrewEffects({ power: card.power, dodge: card.dodge, fortune: card.fortune }, card.effects, card.xp)
  const traits = resolveEffects(card.effects)
  const rarityName = RARITY_NAMES[card.rarity as 1 | 2 | 3 | 4] ?? 'Common'
  // Tap a chip to expand its full description (mobile has no hover). Tapping the
  // rest of the row selects this crew (previews it above; commit needs confirm).
  const [openTrait, setOpenTrait] = useState<string | null>(null)
  const expanded = openTrait ? traits.find(t => t.id === openTrait) : null

  return (
    <div onClick={onSelect} style={{
      display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, cursor: 'pointer',
      padding: '0.55rem 0.6rem', borderRadius: 8,
      background: selected ? `${color}1f` : current ? 'rgba(127,208,160,0.08)' : 'rgba(255,255,255,0.035)',
      border: `1px solid ${selected ? color + '99' : current ? 'rgba(127,208,160,0.42)' : 'rgba(255,255,255,0.08)'}`,
      borderLeft: `3px solid ${color}`,
      boxShadow: selected ? `0 0 0 1px ${color}44, 0 0 16px ${color}33` : 'none',
      transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s',
    }}>
      {/* Portrait thumbnail */}
      <div style={{
        position: 'relative',
        width: 46, height: 46, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
        border: `1.5px solid ${color}`, background: `radial-gradient(ellipse at 50% 32%, ${color}26 0%, #070504 78%)`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} />
        {selected && (
          <div aria-hidden style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: color, border: '1.5px solid #0a0c11', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0a0c11" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
        )}
      </div>

      {/* Name + stats + traits */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Top line: name / rarity (left) · stats (right) */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="font-pirata truncate" style={{ fontSize: '1.02rem', color: '#ecdcbd', lineHeight: 1.1, letterSpacing: '0.02em' }}>{card.name}</span>
            <span className="font-cinzel font-700" style={{ flexShrink: 0, fontSize: '0.5rem', letterSpacing: '0.1em', textTransform: 'uppercase', color }}>{rarityName}</span>
            {current && (
              <span className="font-karla font-700 uppercase" style={{ flexShrink: 0, fontSize: '0.46rem', letterSpacing: '0.08em', color: '#0a1410', background: '#7fd0a0', padding: '0.08rem 0.34rem', borderRadius: 4 }}>On deck</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 9, flexShrink: 0 }}>
            {STAT_COLS.map(s => (
              <span key={s.key} title={s.short} className="font-cinzel font-700" style={{ fontSize: '0.92rem', lineHeight: 1, color: s.color }}>{eff[s.key]}</span>
            ))}
          </div>
        </div>

        {/* Trait / ability chips — tap to expand the full description */}
        {traits.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {traits.map(e => {
              const buff = e.kind === 'buff'
              const summary = effectSummary(e)
              const isOpen = openTrait === e.id
              return (
                <span
                  key={e.id}
                  role="button"
                  onClick={ev => { ev.stopPropagation(); setOpenTrait(isOpen ? null : e.id) }}
                  className="font-karla font-700"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.56rem', cursor: 'pointer',
                    padding: '0.08rem 0.35rem', borderRadius: 4,
                    background: buff ? 'rgba(60,180,110,0.12)' : 'rgba(200,70,70,0.12)',
                    border: `1px solid ${isOpen ? (buff ? 'rgba(80,200,130,0.7)' : 'rgba(220,90,90,0.7)') : (buff ? 'rgba(80,200,130,0.3)' : 'rgba(220,90,90,0.3)')}`,
                    color: buff ? '#bfe8cf' : '#f0bcbc',
                  }}
                >
                  <span style={{ fontStyle: 'italic' }}>{e.name}</span>
                  {summary && <span style={{ color: buff ? '#7fdfa3' : '#f08a8a' }}>{summary}</span>}
                </span>
              )
            })}
          </div>
        ) : (
          // Gray "Neutral" chip — matches the chip silhouette used on
          // crew with traits so trait-less members aren't visually
          // shorter / different. Read as: "this crew has no effects."
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <span className="font-karla font-700" style={{
              display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.56rem',
              padding: '0.08rem 0.35rem', borderRadius: 4,
              background: 'rgba(140,140,140,0.10)',
              border: '1px solid rgba(150,150,150,0.30)',
              color: '#a8aab0',
            }}>
              <span style={{ fontStyle: 'italic' }}>Neutral</span>
            </span>
          </div>
        )}

        {/* Expanded trait detail (scope + full description) */}
        {expanded && (
          <div onClick={ev => ev.stopPropagation()} style={{
            marginTop: 1, padding: '0.4rem 0.5rem', borderRadius: 6,
            background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <span className="font-cinzel font-700" style={{ fontSize: '0.62rem', fontStyle: 'italic', color: expanded.kind === 'buff' ? '#bfe8cf' : '#f0bcbc' }}>{expanded.name}</span>
              <span className="font-karla font-700" style={{ fontSize: '0.42rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: SCOPE_META[expanded.scope].color, border: `1px solid ${SCOPE_META[expanded.scope].color}66`, borderRadius: 4, padding: '0.05rem 0.28rem' }}>{SCOPE_META[expanded.scope].label}</span>
            </div>
            <p className="font-karla" style={{ fontSize: '0.62rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.62)' }}>{expanded.desc}</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  shipStats: ShipStats
  shipName: string | null
  expeditionXP: number
  equippedShipSkin: string | null
  shipSkins: string[]
  roster: RosterCrew[]
  /** Crew ids currently out on a trawl — hidden from the crew picker. */
  trawlingCrewIds?: number[]
  ownedRaidItems: string[]
  equippedRaidItems: string[]
  equippedRepairKit: string
  ownedRepairKits: string[]
  raidRepairOwed: number
  doubloons: number
  /** chapterId -> classId picks from chapter-end Captain's Choice nodes.
   *  Used to render the "Classes" section in the loadout drawer so the
   *  player can see which classes are buffing their next raid. */
  shipClasses: Record<string, string>
}

// Drag handle for the loadout drawer. Touching this strip starts a
// drag-to-dismiss gesture via the shared dragControls. The drawer
// itself runs with dragListener=false so touches ANYWHERE ELSE inside
// the drawer (scrolling content, tapping crew rows, etc.) don't get
// captured as a drag — they reach the underlying scroll container.
// Previously the whole drawer was draggable, which made scrolling
// down look like a drag-down gesture and slammed the drawer closed
// the moment offset.y crossed 80px or velocity exceeded 400.
function kitRarityColor(rarity: string): string {
  switch (rarity) {
    case 'uncommon':  return '#4ade80'
    case 'rare':      return '#60a5fa'
    case 'epic':      return '#c084fc'
    case 'legendary': return '#fbbf24'
    default:          return '#9ca3af'
  }
}

// Inline wrench mark for kits without bespoke art — avoids emoji-as-icon.
function WrenchGlyph({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.4-.6-.6-2.4 2.1-2.1z" />
    </svg>
  )
}

function DrawerHandle({ controls }: { controls: DragControls }) {
  return (
    <div
      onPointerDown={e => controls.start(e)}
      style={{
        display: 'flex', justifyContent: 'center',
        padding: '0.55rem 0 0.45rem',
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
    </div>
  )
}

function drawerDragProps(onClose: () => void, controls: DragControls) {
  return {
    drag: 'y' as const,
    // dragListener=false → motion.div won't auto-attach a pointer
    // listener; drag only starts when controls.start(e) fires from the
    // DrawerHandle.
    dragListener: false,
    dragControls: controls,
    dragConstraints: { top: 0 },
    dragElastic: { top: 0, bottom: 0.35 },
    onDragEnd: (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 80 || info.velocity.y > 400) onClose()
    },
  }
}

export default function ShipHero({
  shipStats, shipName: initialShipName, expeditionXP,
  equippedShipSkin: initialEquippedSkin, shipSkins: ownedSkins,
  roster,
  trawlingCrewIds = [],
  ownedRaidItems, equippedRaidItems: initialEquippedRaidItems,
  equippedRepairKit: initialEquippedRepairKit,
  ownedRepairKits: initialOwnedRepairKits,
  raidRepairOwed, doubloons,
  shipClasses,
}: Props) {
  const router = useRouter()
  const xpProgress = getXPProgress(expeditionXP)

  // Featured crew on the left side of the hero. Up to 3 distinct
  // members picked at random for a triangle composition: trio[0]
  // anchors front-center, trio[1] peeks from back-left, trio[2] from
  // back-right. Smaller rosters fall back gracefully (2 → front +
  // back-left, 1 → front only, 0 → silhouette placeholder). Deps pin
  // on roster identity so the lineup stays stable across unrelated
  // re-renders and only reshuffles when the player actually recruits
  // or loses crew.
  const featuredCrewTrio = useMemo(() => {
    if (roster.length === 0) return [] as RosterCrew[]
    const idxs = roster.map((_, i) => i)
    const picked: RosterCrew[] = []
    while (idxs.length > 0 && picked.length < 3) {
      const j = Math.floor(Math.random() * idxs.length)
      picked.push(roster[idxs[j]])
      idxs.splice(j, 1)
    }
    return picked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.length, roster[0]?.id, roster[roster.length - 1]?.id])

  // Gold "crew leveled up" nudge on the Manage Crew column. Reads the same
  // localStorage ledger the crew page keeps ('crewSeenLevels': crew id →
  // last level viewed in the detail modal). Any roster member whose current
  // level outruns the ledger lights the dot; ids MISSING from the ledger
  // stay calm — the crew page seeds them on first visit, so new players and
  // fresh recruits aren't nagged before they've even met the card.
  const [crewLevelUpNudge, setCrewLevelUpNudge] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('crewSeenLevels')
      if (!raw) return
      const seen = JSON.parse(raw) as Record<number, number>
      setCrewLevelUpNudge(roster.some(c => seen[c.id] !== undefined && seen[c.id] < crewLevelFromXP(c.xp)))
    } catch {}
  }, [roster])

  const [repairing, startRepair] = useTransition()
  const [repairErr, setRepairErr] = useState<string | null>(null)
  const canAffordRepair = doubloons >= raidRepairOwed
  function doRepair() {
    setRepairErr(null)
    startRepair(async () => {
      const res = await repairShip()
      if ('error' in res) { setRepairErr(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
      router.refresh()
    })
  }

  // Crew state — managed here so scores update live when loadout changes.
  // Initialised from each crew member's assigned ship slot.
  const [slots, setSlots] = useState<(RosterCrew | null)[]>(() => {
    const arr: (RosterCrew | null)[] = Array(shipStats.crewSlots).fill(null)
    for (const c of roster) {
      if (c.voyageSlot != null && c.voyageSlot >= 0 && c.voyageSlot < shipStats.crewSlots) {
        arr[c.voyageSlot] = c
      }
    }
    return arr
  })

  // Skin state
  const [equippedSkin, setEquippedSkin] = useState(initialEquippedSkin)

  // Raid item state. The slot count scales with ship tier — bigger hulls
  // hold more kit. Derive the tier from the ship name match against SHIPS
  // (same trick the upgrade panel uses lower down) so we don't need to
  // thread a separate prop in.
  const [equippedItems, setEquippedItems] = useState<string[]>(initialEquippedRaidItems)
  // Raid items are inventory-first: the whole owned collection renders in the
  // drawer and tapping toggles equip/unequip directly (no per-slot picker).

  // Resync local state when fresh server data arrives via router.refresh().
  // Without these, a mutation in the HubCards prep modal (which fires
  // router.refresh() to repaint the page) would update the server +
  // re-render the ShipHero with fresh `roster` / `initialEquippedRaidItems`
  // props, but the useState initializers above only fire once at mount —
  // so the loadout drawer would stay stuck on stale assignments / items
  // even though the data on disk had changed. Crew + items in HubCards
  // and ShipHero now read from the same source and stay in lockstep.
  useEffect(() => {
    const arr: (RosterCrew | null)[] = Array(shipStats.crewSlots).fill(null)
    for (const c of roster) {
      if (c.voyageSlot != null && c.voyageSlot >= 0 && c.voyageSlot < shipStats.crewSlots) {
        arr[c.voyageSlot] = c
      }
    }
    setSlots(arr)
  }, [roster, shipStats.crewSlots])
  useEffect(() => {
    setEquippedItems(initialEquippedRaidItems)
  }, [initialEquippedRaidItems])

  // Repair-kit ladder state. Buying auto-equips the new (strictly better) kit,
  // so there's no manual equip — it mirrors Upgrade Ship: compact current kit +
  // a modal that previews just the NEXT tier. Mirror locally for instant
  // feedback, then router.refresh() reconciles (resync effects below).
  const [kitEquipped, setKitEquipped] = useState(initialEquippedRepairKit)
  const [kitsOwned, setKitsOwned] = useState<string[]>(initialOwnedRepairKits)
  useEffect(() => { setKitEquipped(initialEquippedRepairKit) }, [initialEquippedRepairKit])
  useEffect(() => { setKitsOwned(initialOwnedRepairKits) }, [initialOwnedRepairKits])
  const [kitOpen, setKitOpen] = useState(false)
  const [kitBusy, setKitBusy] = useState(false)
  const [kitErr, setKitErr] = useState<string | null>(null)
  async function doBuyKit() {
    setKitBusy(true); setKitErr(null)
    try {
      const res = await buyRepairKit()
      if ('error' in res) { setKitErr(res.error); return }
      setKitEquipped(res.equippedRepairKit); setKitsOwned(res.ownedRepairKits)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      setKitOpen(false)
      router.refresh()
    } finally { setKitBusy(false) }
  }

  const shipTierForSlots = Math.max(0, SHIPS.findIndex(s => s.name === shipStats.name))
  const raidItemSlots = raidItemSlotsForTier(shipTierForSlots)

  // Loadout drawer section tab. Items first/default — it's the most
  // important loadout decision; cosmetics (skins) live last.
  const [loadoutTab, setLoadoutTab] = useState<'items' | 'skins'>('items')

  // Ship name state
  const [shipName, setShipName] = useState(initialShipName)

  // Modal state
  const [loadoutOpen, setLoadoutOpen] = useState(false)

  // Gold "new raid item" nudge on the Manage Ship column — mirrors the
  // crew level-up dot. An owned raid item that is neither equipped nor
  // recorded in the 'raidItemsSeen' localStorage ledger lights the dot,
  // so loot that landed in the hold (raid clears, the Quartermaster's
  // Cache) pulls the player into the loadout drawer instead of sitting
  // forgotten. Opening the drawer writes every owned id to the ledger;
  // the recompute (deliberately declared BEFORE the ledger-write effect
  // below) re-reads it on the close edge, so the dot clears after the
  // first look while the "New" chips inside the picker stay visible
  // during it. Equipped ids count as seen from the start — equipping IS
  // acknowledging the item, whatever surface did it.
  const [newRaidItems, setNewRaidItems] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem('raidItemsSeen')
      const seen = new Set<string>(raw ? JSON.parse(raw) as string[] : [])
      setNewRaidItems(new Set(ownedRaidItems.filter(id => !seen.has(id) && !initialEquippedRaidItems.includes(id))))
    } catch {}
  }, [ownedRaidItems, initialEquippedRaidItems, loadoutOpen])
  useEffect(() => {
    if (!loadoutOpen) return
    try {
      const raw = localStorage.getItem('raidItemsSeen')
      const seen = new Set<string>(raw ? JSON.parse(raw) as string[] : [])
      for (const id of ownedRaidItems) seen.add(id)
      for (const id of initialEquippedRaidItems) seen.add(id)
      localStorage.setItem('raidItemsSeen', JSON.stringify([...seen]))
    } catch {}
  }, [loadoutOpen, ownedRaidItems, initialEquippedRaidItems])
  // Drag-to-dismiss controls for the loadout drawer. Only fires from
  // the drag handle (see DrawerHandle), so scrolling inside the
  // drawer body doesn't get captured as a drag-down gesture.
  const loadoutDragControls = useDragControls()
  const [breakdownScore, setBreakdownScore] = useState<'voyage' | 'raid' | null>(null)
  // Inline ship-upgrade modal — replaces the old "go to shipyard" link with a
  // one-tap upgrade for the next available tier, with a fall-through link to
  // the full shipyard if the player wants to browse skins/lower tiers.
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  // Tappable Nav-level info modal — shows captain bonuses, XP to next level,
  // and what changes at the next tier. Opens from the small Lv pill in the
  // ship hero header.
  const [navInfoOpen, setNavInfoOpen] = useState(false)

  // Loadout inner state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Crew tapped in the picker, awaiting an explicit Assign confirm. While set,
  // the "Crew aboard" panel previews the totals as if it were placed.
  const [pendingCard, setPendingCard] = useState<RosterCrew | null>(null)
  const [sortBy, setSortBy] = useState<'power' | 'dodge' | 'fortune' | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(initialShipName ?? '')

  const [, startTransition] = useTransition()

  useEffect(() => {
    document.body.style.overflow = (loadoutOpen || sheetOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [loadoutOpen, sheetOpen])

  // The hub-card modal dispatches 'expedition:open-loadout' when the
  // player taps "Open Prep" to commit to the next launch. We open the
  // Loadout drawer here so the player can review/adjust crew, items,
  // and scores before pulling the trigger. Same component, two entry
  // points (Manage Ship button + hub modal CTA).
  //
  // The event's optional `detail.mode` flips the drawer into a launch-
  // focused shape: a header banner saying what they're prepping for
  // plus a sticky bottom commit CTA ("Begin Raid →" / "Set Sail →").
  // Without a mode (Manage Ship entry), the drawer is just the
  // free-form loadout editor it always was.
  const [loadoutMode, setLoadoutMode] = useState<'campaign' | 'voyage' | null>(null)
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ mode?: 'campaign' | 'voyage'; pickSlot?: number }>).detail
      // pickSlot path: open ONLY the slot picker — skip the loadout
      // drawer entirely so closing/confirming doesn't strand the
      // player on the drawer surface. Picker overlays whatever modal
      // triggered it (e.g. the campaign prep modal) at a higher z.
      if (typeof detail?.pickSlot === 'number') {
        const i = detail.pickSlot
        setPickerSlot(i)
        setSheetOpen(true)
        setSortBy(null)
        setPendingCard(null)
        return
      }
      setLoadoutMode(detail?.mode ?? null)
      setLoadoutOpen(true)
    }
    window.addEventListener('expedition:open-loadout', onOpen as EventListener)
    return () => window.removeEventListener('expedition:open-loadout', onOpen as EventListener)
  }, [])
  // Clear the mode when the drawer is closed any way (X, drag, backdrop)
  useEffect(() => { if (!loadoutOpen) setLoadoutMode(null) }, [loadoutOpen])

  function closeLoadout() {
    setLoadoutOpen(false)
    setSheetOpen(false)
    setPickerSlot(null)
    setPendingCard(null)
    setEditingName(false)
  }

  // Ship rename
  function submitRename() {
    const trimmed = nameInput.trim().slice(0, 32)
    if (!trimmed) { setEditingName(false); return }
    setShipName(trimmed)
    setEditingName(false)
    startTransition(async () => { await renameShip(trimmed) })
  }

  // A crew instance can only sit in one slot; ids already deployed elsewhere
  // are hidden from the picker.
  const assignedIds = new Set(slots.filter(Boolean).map(c => c!.id))

  function openPickerForSlot(i: number) { setPickerSlot(i); setSheetOpen(true); setSortBy(null); setPendingCard(null) }
  function closeSheet() { setSheetOpen(false); setPickerSlot(null); setPendingCard(null) }

  function notifyCrewChanged(next: (RosterCrew | null)[]) {
    window.dispatchEvent(new CustomEvent('crew-changed', { detail: next.filter(Boolean).map(c => c!.id) }))
  }

  // The slots array that would result from placing `card` in the active picker
  // slot — vacating any slot holding this instance OR another copy of the same
  // card (only one of a given card aboard at a time). Drives both the live
  // preview and the actual commit.
  function buildSlotsWith(card: RosterCrew): (RosterCrew | null)[] {
    if (pickerSlot === null) return slots
    const next = [...slots]
    for (let j = 0; j < next.length; j++) {
      if (next[j] && (next[j]!.id === card.id || next[j]!.cardId === card.cardId)) next[j] = null
    }
    next[pickerSlot] = card
    return next
  }

  // Commit the pending pick once the player confirms (no accidental assign on a
  // single tap). Persists, updates live scores, and closes the picker.
  function confirmAssign() {
    if (pendingCard === null || pickerSlot === null) return
    const card = pendingCard
    const slot = pickerSlot
    const next = buildSlotsWith(card)
    setSlots(next); notifyCrewChanged(next); closeSheet()
    // router.refresh() so the HubCards prep modal (which reads roster
    // assignments from the page's server-fetched props) sees the new
    // assignment too — otherwise the two surfaces would drift.
    startTransition(async () => { await assignToVoyage(card.id, slot); router.refresh() })
  }

  function removeFromSlot(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    const crew = slots[i]
    const next = [...slots]; next[i] = null
    setSlots(next); notifyCrewChanged(next)
    if (crew) startTransition(async () => { await benchCrew(crew.id); router.refresh() })
  }

  // One round "on-deck" slot (filled portrait or empty dashed circle).
  function deckSlot(i: number, size: number) {
    const card = slots[i]
    const isCaptain = i === 0
    const rc = card ? (CREW_RARITY_COLORS[card.rarity as 1 | 2 | 3 | 4] ?? '#6a6764') : '#6a6764'
    const ring = card ? (isCaptain ? '#f0c040' : rc) : (isCaptain ? '#f0c040' : 'rgba(255,255,255,0.8)')
    if (card) {
      return (
        <div onClick={() => openPickerForSlot(i)} style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: `2px solid ${ring}`, boxShadow: `0 4px 7px rgba(0,0,0,0.6), 0 0 0 2px rgba(4,6,10,0.5)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
          <button onClick={e => removeFromSlot(i, e)} aria-label="Remove crew" style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )
    }
    return (
      <button onClick={() => openPickerForSlot(i)} aria-label={isCaptain ? 'Assign captain' : 'Assign crew'} style={{ width: size, height: size, borderRadius: '50%', border: `2px dashed ${ring}`, background: 'rgba(6,9,16,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, boxShadow: '0 2px 9px rgba(0,0,0,0.75), 0 0 0 3px rgba(2,4,8,0.5)' }}>
        <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24" fill="none" stroke={isCaptain ? '#f0c040' : 'rgba(255,255,255,0.92)'} strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    )
  }

  // Skin equip
  function handleEquipSkin(skinId: string | null) {
    setEquippedSkin(skinId)
    startTransition(async () => { await equipShipSkin(skinId) })
  }

  // Raid items are an inventory-first toggle: the whole owned collection is
  // shown in the drawer and tapping an item equips/unequips it directly (no
  // per-slot picker — effects stack regardless of position, so "slots" are
  // just a capacity cap). Tap an equipped item to free it; unequipped items
  // grey out once the hull is full. Server caps + validates ownership.
  function toggleItem(itemId: string) {
    const equipped = equippedItems.includes(itemId)
    let next: string[]
    if (equipped) {
      next = equippedItems.filter(id => id !== itemId)
    } else {
      if (equippedItems.length >= raidItemSlots) return // hull full — no-op
      next = [...equippedItems, itemId]
    }
    setEquippedItems(next)
    // router.refresh() re-runs the server components so the prep modal's
    // ready-check (server-rendered from profile.equipped_raid_items)
    // reflects the new state too.
    startTransition(async () => { await saveEquippedRaidItems(next); router.refresh() })
  }

  // Generic raid-item forge (FORGE_RECIPES). `forging` / `forgeArmed` hold the
  // result id of the recipe mid-forge / armed for the two-tap destructive
  // confirm (the forge sacrifices the components).
  const [forging, setForging] = useState<string | null>(null)
  const [forgeArmed, setForgeArmed] = useState<string | null>(null)
  function onForgeTap(resultId: string) {
    if (forging) return
    if (forgeArmed !== resultId) {
      setForgeArmed(resultId)
      setTimeout(() => setForgeArmed(a => (a === resultId ? null : a)), 3000)
      return
    }
    setForgeArmed(null)
    setForging(resultId)
    startTransition(async () => {
      const res = await forgeRaidItem(resultId)
      setForging(null)
      if ('error' in res) return
      router.refresh()
    })
  }

  // Live scores via the same resolver the server uses (passive/aura/conditional
  // effects + captain/crew weighting). Voyage uses raw crew totals; Raid adds
  // the Nav-level captain bonus — see lib/expeditionLevel.navLevelBonuses.
  const navBonus     = navLevelBonuses(xpProgress.level)
  const deployedParty: DeployedCrew[] = slots
    .map((c, i) => c ? { id: c.id, slot: i, rarity: c.rarity, power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects, xp: c.xp, slug: c.slug } : null)
    .filter((c): c is DeployedCrew => c !== null)
  const resolvedParty = resolveDeployedCrew(deployedParty)
  const totalPower   = resolvedParty.totals.power
  const totalDodge   = resolvedParty.totals.dodge
  const totalFortune = resolvedParty.totals.fortune
  const ratedPower   = totalPower   + navBonus.power
  const ratedDodge   = totalDodge   + navBonus.navigation
  const ratedFortune = totalFortune + navBonus.fortune
  const ratedHP      = shipStats.durability + navBonus.hp
  const voyageScore  = Math.min(100, Math.round(computeVoyageScore(totalPower, totalDodge, totalFortune) * (1 + resolvedParty.voyage.scorePct / 100)))
  const raidRating   = computeCombatRating(ratedPower, ratedDodge, ratedFortune, ratedHP, shipStats.minDamage, resolvedParty.raid)
  const hasCrew      = slots.some(Boolean)

  // Live preview for the picker: when a crew is pending confirmation, the "Crew
  // aboard" panel reflects the totals AS IF that pick were placed, so the player
  // sees the effect (and the per-stat delta) before committing.
  const slotsToTotals = (arr: (RosterCrew | null)[]) => {
    const party: DeployedCrew[] = arr
      .map((c, i) => c ? { id: c.id, slot: i, rarity: c.rarity, power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects, xp: c.xp, slug: c.slug } : null)
      .filter((c): c is DeployedCrew => c !== null)
    return resolveDeployedCrew(party).totals
  }
  const previewSlotsArr = pendingCard ? buildSlotsWith(pendingCard) : slots
  const previewTotals   = pendingCard ? slotsToTotals(previewSlotsArr) : { power: totalPower, dodge: totalDodge, fortune: totalFortune }
  const previewCount    = previewSlotsArr.filter(Boolean).length

  // Skin: filter-based skins tint the default ship sprite via CSS;
  // imageByTier skins swap the sprite outright for the player's
  // current tier (e.g. Finndicate Hull). Falls back to ship default.
  const skinDef     = equippedSkin ? SHIP_SKINS.find(s => s.id === equippedSkin) : undefined
  const skinFilter  = skinDef?.filter ?? 'none'
  const shipImgSrc  = skinDef?.imageByTier?.[shipTierForSlots] ?? shipStats.image

  // Crew available to assign: any roster member not already in another slot
  // (the one already in this slot stays selectable). Sorted by effective stats.
  const effStats = (c: RosterCrew) => applyCrewEffects({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.effects, c.xp)
  const pickerCards: RosterCrew[] = (() => {
    if (pickerSlot === null) return []
    const inThisSlot = slots[pickerSlot]?.id
    // Cards already aboard in OTHER slots — block picking a second of the same.
    const otherCardIds = new Set(slots.filter((c, idx) => c && idx !== pickerSlot).map(c => c!.cardId))
    // Crew out on a trawl are reserved at sea — keep them out of the picker.
    const trawlingSet = new Set(trawlingCrewIds)
    const list = roster.filter(c => (!assignedIds.has(c.id) || c.id === inThisSlot) && !otherCardIds.has(c.cardId) && !trawlingSet.has(c.id))
    const score = (c: RosterCrew) => {
      const e = effStats(c)
      return sortBy ? e[sortBy] : e.power + e.dodge + e.fortune
    }
    return [...list].sort((a, b) => score(b) - score(a))
  })()

  return (
    <>
      {/* ── Ship hero card ── */}
      <div style={{
        background: 'rgba(6,8,12,0.82)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        marginBottom: '1.5rem',
        overflow: 'hidden',
      }}>
        {/* ── Sunk: repair banner ── */}
        {raidRepairOwed > 0 && (
          <div style={{
            background: 'linear-gradient(180deg, rgba(120,30,24,0.5) 0%, rgba(70,18,14,0.5) 100%)',
            borderBottom: '1px solid rgba(240,120,90,0.35)',
            padding: '0.75rem 0.9rem',
            display: 'flex', alignItems: 'center', gap: '0.7rem',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0a890', lineHeight: 1.2 }}>
                Your ship lies on the seabed
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#c89a90', marginTop: 2, lineHeight: 1.35 }}>
                {canAffordRepair
                  ? 'Patch her up before you sail into another fight.'
                  : `You need ${raidRepairOwed.toLocaleString()} ⟡ to raise her. Go earn it.`}
              </p>
              {repairErr && (
                <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#f08a8a', marginTop: 4 }}>{repairErr}</p>
              )}
            </div>
            <button
              onClick={doRepair}
              disabled={repairing || !canAffordRepair}
              className="font-cinzel font-700 uppercase tracking-[0.06em]"
              style={{
                flexShrink: 0,
                padding: '0.55rem 0.9rem',
                borderRadius: 10,
                border: 'none',
                fontSize: '0.78rem',
                background: canAffordRepair ? '#f0734a' : 'rgba(255,255,255,0.07)',
                color: canAffordRepair ? '#1a0f02' : '#7a6a64',
                cursor: repairing ? 'wait' : canAffordRepair ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {repairing ? '…' : `Repair · ${raidRepairOwed.toLocaleString()} ⟡`}
            </button>
          </div>
        )}

        {/* Ship hero — Lv pill on top, then a two-column row: a random
            crew member on the left above Manage Crew, the ship on the
            right above Manage Ship. The ship's NAME no longer sits at
            the top — it now lives only inside the Manage Ship drawer
            (which is where the player edits it). Splitting the hero
            this way also gives the crew side an actual visual presence
            (a face) instead of a button floating on its own. */}
        <div style={{ position: 'relative', padding: '1.1rem 1rem 1rem' }}>
          {/* Soft sea-glow backdrop for cohesion */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 60% at 50% 42%, rgba(60,110,180,0.16) 0%, rgba(10,16,28,0) 70%)' }} />

          {/* Nav level + XP — full-width bar across the card (mirrors the
              fishing screen's XPBarDisplay): big level number on the left,
              the progress bar stretching the card width, XP-to-next on the
              right. Whole row is the tap target for the Nav-level info
              modal (captain bonuses + next-level carrot). */}
          {(() => {
            const atMax = xpProgress.level >= MAX_LEVEL
            const fillPct = atMax ? 100 : xpProgress.progress * 100
            const toGo = Math.max(0, xpProgress.xpForLevel - xpProgress.xpInLevel)
            return (
              <button
                type="button"
                onClick={() => setNavInfoOpen(true)}
                aria-label="Show navigation level info"
                className="font-karla font-600"
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '0.3rem 0.35rem', borderRadius: 12,
                  background: 'transparent', border: '1px solid transparent',
                  color: 'inherit', cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(125,160,216,0.08)'; e.currentTarget.style.borderColor = 'rgba(125,160,216,0.22)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
              >
                <div className="shrink-0" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#7da0d8bb', letterSpacing: '0.08em' }}>LV</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: '#7da0d8', lineHeight: 1 }}>{xpProgress.level}</span>
                </div>
                <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <motion.div
                    key={xpProgress.level}
                    initial={{ width: '0%' }}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, #4a6090 0%, #7da0d8 100%)',
                      boxShadow: '0 0 10px #7da0d870',
                    }}
                  />
                </div>
                <span className="font-karla font-600 shrink-0"
                  style={{ fontSize: '0.62rem', color: atMax ? '#f0c040' : 'rgba(255,255,255,0.65)', textAlign: 'right', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {atMax ? 'MAX' : `${toGo.toLocaleString()} xp`}
                </span>
              </button>
            )
          })()}

          {/* Two-column row — left links to /crew, right opens the
              Manage Ship drawer. Each column IS the tap target now:
              clicking anywhere on the image OR the label fires the
              navigation. Wrapper height (56) is sized to the VISIBLE
              art, not the img boxes: the crew front portrait renders
              54px tall and the ship PNG bakes in ~20% transparent
              top/bottom padding, so its 85px img shows only ~51px of
              hull. The previous 85px wrappers held that bottom-anchored
              art under ~30px of invisible headroom, which read as a
              dead band between the Lv pill and the images. Both imgs
              keep their render sizes and overflow the tighter wrapper
              with transparent pixels only. Grid alignItems:end keeps
              the labels flush at the bottom. */}
          <div style={{
            position: 'relative',
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            alignItems: 'end',
            gap: 14, marginTop: '0.9rem',
          }}>
            {/* Left col — crew lineup. Up to 3 roster members posed
                in a V: front[0] anchors bottom-center, back[1] peeks
                from upper-left, back[2] from upper-right. Back members
                render smaller + dimmer + slightly blurred so they read
                as "behind" the front one without an actual 3D camera.
                Empty roster falls back to a silhouette placeholder.
                Wrapper 56 = front portrait (54) + 2px headroom; the
                back row tops out at 38 so nothing clips — grid
                alignItems:end keeps the bottom flush with the ship
                column. */}
            <Link href="/crew" className="hub-manage-tap" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              textDecoration: 'none',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
              <div style={{
                height: 56, width: '100%',
                position: 'relative',
              }}>
                {featuredCrewTrio.length === 0 ? (
                  // Empty roster — silhouette placeholder centered in
                  // the wrapper. Same shape as the old single-portrait
                  // empty state.
                  <div style={{
                    position: 'absolute', left: '50%', bottom: 0,
                    transform: 'translateX(-50%)',
                    width: 42, height: 50,
                    borderRadius: '12% 12% 30% 30%',
                    background: 'radial-gradient(ellipse at 50% 28%, rgba(110,140,180,0.18) 0%, rgba(20,28,42,0) 70%)',
                    border: '1.5px dashed rgba(125,160,216,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(125,160,216,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
                    </svg>
                  </div>
                ) : (
                  <>
                    {/* Back-left — smaller, dimmer, same baseline as
                        the front so it reads as "standing behind and
                        to the left" rather than floating in the upper
                        corner. Inset to ~20% from the left so the
                        right edge slips behind the front portrait. */}
                    {featuredCrewTrio[1] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={IMG_BASE + featuredCrewTrio[1].filename}
                        alt={featuredCrewTrio[1].name}
                        loading="lazy"
                        decoding="async"
                        style={{
                          position: 'absolute', left: '8%', bottom: 0,
                          height: 38, width: 'auto', maxWidth: '45%',
                          objectFit: 'contain',
                          opacity: 0.72,
                          filter: 'brightness(0.78) saturate(0.85) drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                          zIndex: 1,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {/* Back-right — mirror of back-left. */}
                    {featuredCrewTrio[2] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={IMG_BASE + featuredCrewTrio[2].filename}
                        alt={featuredCrewTrio[2].name}
                        loading="lazy"
                        decoding="async"
                        style={{
                          position: 'absolute', right: '8%', bottom: 0,
                          height: 38, width: 'auto', maxWidth: '45%',
                          objectFit: 'contain',
                          opacity: 0.72,
                          filter: 'brightness(0.78) saturate(0.85) drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                          zIndex: 1,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    {/* Front-center — always present when roster > 0 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={IMG_BASE + featuredCrewTrio[0].filename}
                      alt={featuredCrewTrio[0].name}
                      loading="lazy"
                      decoding="async"
                      style={{
                        position: 'absolute', left: '50%', bottom: 0,
                        transform: 'translateX(-50%)',
                        height: 54, width: 'auto', maxWidth: '60%',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                        zIndex: 2,
                      }}
                    />
                  </>
                )}
              </div>
              {/* Label pill — bordered + chevroned so it reads as a
                  BUTTON, not a caption. Brightens on hover/press via
                  .hub-manage-pill (see globals.css). */}
              <p className="font-karla font-700 uppercase tracking-[0.08em] hub-manage-pill" style={{
                fontSize: '0.7rem', color: '#9ec6ff',
                position: 'relative',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '0.3rem 0.75rem', borderRadius: 999,
                background: 'rgba(125,160,216,0.10)',
                border: '1px solid rgba(125,160,216,0.3)',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                Manage Crew
                <span aria-hidden style={{ fontSize: '0.72rem', lineHeight: 1, opacity: 0.85, marginTop: -1 }}>›</span>
                {/* Level-up nudge — gold pulsing dot, badge-style on the
                    pill's top-right corner. Mirrors the Voyages card's
                    returned-dot pattern, in the crew level-up gold. */}
                {crewLevelUpNudge && (
                  <span
                    aria-label="A crew member leveled up"
                    title="A crew member leveled up"
                    className="crew-levelup-dot"
                    style={{
                      position: 'absolute', right: -3, top: -3,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ffd96a',
                      border: '1px solid rgba(0,0,0,0.55)',
                    }}
                  />
                )}
              </p>
            </Link>

            {/* Right col — ship image + Manage Ship label. Whole
                column is a button that opens the loadout drawer.
                Ship PNG bakes in ~20% top/bottom transparent padding;
                at img height 85 that's ~17px of empty space ABOVE and
                BELOW the visible ship (~51px of hull). The img keeps
                its 85px render size but the wrapper is 56 with
                flex-end alignment: the img's bottom edge sits on the
                wrapper bottom and translateY(17px) drops it so the
                VISIBLE ship's bottom kisses the wrapper edge —
                matching how the crew column anchors its front portrait
                at bottom:0. The transparent top/bottom overflow the
                wrapper, which is invisible and harmless. */}
            <button
              onClick={() => setLoadoutOpen(true)}
              className="hub-manage-tap"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none', padding: 0,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{
                height: 56, width: '100%',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shipImgSrc}
                  alt={shipName ?? shipStats.name}
                  loading="lazy"
                  decoding="async"
                  style={{
                    height: 85, width: 'auto', maxWidth: '100%',
                    objectFit: 'contain',
                    transform: 'translateY(17px)',
                    filter: skinFilter,
                    transition: 'filter 0.3s ease',
                  }}
                />
              </div>
              {/* Label pill — matches the Manage Crew pill so both
                  columns read as buttons. */}
              <p className="font-karla font-700 uppercase tracking-[0.08em] hub-manage-pill" style={{
                fontSize: '0.7rem', color: '#9ec6ff',
                position: 'relative',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '0.3rem 0.75rem', borderRadius: 999,
                background: 'rgba(125,160,216,0.10)',
                border: '1px solid rgba(125,160,216,0.3)',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                Manage Ship
                <span aria-hidden style={{ fontSize: '0.72rem', lineHeight: 1, opacity: 0.85, marginTop: -1 }}>›</span>
                {/* New-raid-item nudge — same gold pulsing dot as the
                    crew level-up nudge, badge-style on the pill corner.
                    Lights when an owned raid item is neither equipped
                    nor seen. */}
                {newRaidItems.size > 0 && (
                  <span
                    aria-label="New raid item ready to equip"
                    title="New raid item ready to equip"
                    className="crew-levelup-dot"
                    style={{
                      position: 'absolute', right: -3, top: -3,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ffd96a',
                      border: '1px solid rgba(0,0,0,0.55)',
                    }}
                  />
                )}
              </p>
            </button>
          </div>
        </div>

        {/* Score badges moved into the Loadout drawer + the hub
            modals — Ship Hero now stays focused on ship identity +
            crew/items management. The numbers live where the player
            actually makes decisions (during prep, not at-a-glance). */}

      </div>

      {/* ── Loadout drawer ── */}
      <AnimatePresence>
        {loadoutOpen && (
          <>
            {/* Backdrop. z-index 100 to clear the page Nav (which is z:50). */}
            <motion.div
              key="loadout-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }}
              onClick={closeLoadout}
            />

            {/* Drawer. z-index 101 so the modal paints above the page Nav
                (also z:50). Using explicit top + bottom (instead of maxHeight)
                hard-anchors the drawer top — it can never extend above the
                page Nav, so the sticky LOADOUT header is always reachable.
                Nav is 44px mobile / 64px desktop; 80px from top gives a
                clean gap below it. The framer-motion animation slides the
                drawer up from below; at rest it occupies top:80 → bottom:0. */}
            <motion.div
              key="loadout-drawer"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              {...drawerDragProps(closeLoadout, loadoutDragControls)}
              style={{
                position: 'fixed',
                top: 'max(80px, env(safe-area-inset-top, 0px) + 20px)',
                bottom: 0,
                left: 'max(0px, calc(50% - 240px))',
                right: 'max(0px, calc(50% - 240px))',
                zIndex: 101,
                background: '#060c14',
                borderTop: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '18px 18px 0 0',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <DrawerHandle controls={loadoutDragControls} />
              {/* Sticky header — outside the scroll container so the close
                  button never scrolls off-screen. */}
              <div style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.25rem 1rem 0.7rem',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#a8a39c' }}>Loadout</p>
                <button
                  onClick={closeLoadout}
                  aria-label="Close loadout"
                  style={{
                    color: '#e0ddd8', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '50%',
                    width: 32, height: 32, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    touchAction: 'manipulation',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem 1rem 6rem' }}>

              {/* Launch-mode banner — only shows when the drawer was
                  opened from a hub modal with a mode. Tells the player
                  what they're prepping for so the upcoming crew/item
                  changes feel purposeful. Without a mode (Manage Ship
                  entry) the drawer is just the editor. */}
              {loadoutMode && (
                <div style={{
                  background: loadoutMode === 'campaign'
                    ? 'linear-gradient(180deg, rgba(196,169,106,0.18) 0%, rgba(196,169,106,0.04) 100%)'
                    : 'linear-gradient(180deg, rgba(125,160,216,0.18) 0%, rgba(125,160,216,0.04) 100%)',
                  border: `1px solid ${loadoutMode === 'campaign' ? 'rgba(196,169,106,0.42)' : 'rgba(125,160,216,0.42)'}`,
                  borderRadius: 12, padding: '0.7rem 0.85rem',
                  marginBottom: '1rem',
                }}>
                  <p className="font-karla font-700 uppercase tracking-[0.18em]"
                    style={{
                      fontSize: '0.5rem',
                      color: loadoutMode === 'campaign' ? '#d8c08a' : '#9ab4dc',
                      marginBottom: 2,
                    }}>
                    Prepping for
                  </p>
                  <p className="font-cinzel font-700"
                    style={{ fontSize: '0.9rem', color: '#f0ede8', lineHeight: 1.15 }}>
                    {loadoutMode === 'campaign' ? 'The next raid' : "Today's voyage"}
                  </p>
                  <p className="font-karla font-400"
                    style={{ fontSize: '0.62rem', color: 'rgba(240,237,232,0.6)', lineHeight: 1.4, marginTop: 4 }}>
                    Set your crew, equip raid items, check your scores — then commit at the bottom.
                  </p>
                </div>
              )}

              {/* Voyage Score / Raid Score tiles used to live here. Removed:
                  Manage Ship is for ship identity (name, skin, items), not
                  party readiness. The two scores still live in the prep
                  modals (Campaign / Voyages hub cards) where the decision
                  to launch actually happens — that's where they belong. */}

              {/* Hero — large centered ship image with the Upgrade action as a
                  gold pill floating ON the image; name (inline rename) and the
                  current class sit tidily beneath. */}
              {(() => {
                const shipTier = Math.max(0, SHIPS.findIndex(s => s.name === shipStats.name))
                const shipAtMax = shipTier + 1 >= SHIPS.length
                const picks = Object.values(shipClasses)
                  .map(id => getShipClass(id))
                  .filter((c): c is NonNullable<ReturnType<typeof getShipClass>> => !!c)
                return (
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ position: 'relative', display: 'inline-block', width: '78%', maxWidth: 230 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shipImgSrc}
                        alt={shipName ?? shipStats.name}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block', filter: skinFilter, transition: 'filter 0.3s ease' }}
                      />
                      {!shipAtMax && (
                        <button
                          type="button"
                          onClick={() => { setUpgradeError(null); setUpgradeOpen(true) }}
                          aria-label="Upgrade ship"
                          style={{ position: 'absolute', right: 6, bottom: 6, width: 28, height: 28, borderRadius: '50%', padding: 0, background: 'linear-gradient(180deg, #f4c84e, #d4a017)', border: '2px solid #14110d', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.5)', cursor: 'pointer' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a1206" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                        </button>
                      )}
                    </div>

                    {/* Name + inline rename (pencil implies it; no helper text). */}
                    <div style={{ marginTop: '0.65rem' }}>
                      {editingName ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                          <input
                            autoFocus
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
                            maxLength={32}
                            placeholder={shipStats.name}
                            style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(240,192,64,0.45)', borderRadius: 8, padding: '0.4rem 0.7rem', color: '#f0ede8', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', textAlign: 'center', width: 180 }}
                          />
                          <button onClick={submitRename} aria-label="Save" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: 'rgba(240,192,64,0.2)', border: '1px solid rgba(240,192,64,0.5)', color: '#f0c040', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                          </button>
                          <button onClick={() => setEditingName(false)} aria-label="Cancel" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, maxWidth: '100%' }}
                        >
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '1.35rem', color: '#f0ede8', minWidth: 0 }}>{shipName ?? shipStats.name}</p>
                          <span style={{ width: 25, height: 25, borderRadius: '50%', flexShrink: 0, background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4z" />
                            </svg>
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Current class — compact chips, centered (details live in
                        the Captain's Choice picker). */}
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                      {picks.length === 0 ? (
                        <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#6a6764' }}>No class chosen yet</span>
                      ) : picks.map(cls => (
                        <span key={cls.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${cls.color}18`, border: `1px solid ${cls.color}55`, borderRadius: 999, padding: '0.22rem 0.55rem' }}>
                          <span style={{ fontSize: '0.82rem', lineHeight: 1, color: cls.color }}>{cls.emoji}</span>
                          <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{cls.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* ── Section tabs ── Items first (the key loadout call),
                  cosmetics (Skins) last. Subtle styling, no loud fill. */}
              <div
                role="tablist"
                aria-label="Loadout sections"
                style={{
                  display: 'flex', gap: 6, padding: 4, marginBottom: '1.4rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                }}
              >
                {([
                  ['items', 'Items'],
                  ['skins', 'Skins'],
                ] as const).map(([id, label]) => {
                  const active = loadoutTab === id
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setLoadoutTab(id)}
                      className="font-cinzel font-700 uppercase tracking-[0.06em]"
                      style={{
                        flex: 1, padding: '0.55rem', borderRadius: 9,
                        border: active ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
                        cursor: 'pointer', fontSize: '0.78rem',
                        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: active ? '#f0ede8' : 'rgba(240,237,232,0.42)',
                        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {loadoutTab === 'skins' && (<>
              {/* ── Ship Skins ── grid layout (mirrors fishing GearScreen boat picker) */}
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.7rem', letterSpacing: '0.04em' }}>Ship Skins</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1.5rem' }}>
                {/* Default */}
                {(() => {
                  const isEquipped = equippedSkin === null
                  return (
                    <button
                      onClick={() => { if (!isEquipped) handleEquipSkin(null) }}
                      disabled={isEquipped}
                      className="font-karla font-700"
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '0.6rem 0.4rem 0.5rem',
                        borderRadius: 10,
                        background: isEquipped ? 'rgba(255,255,255,0.06)' : 'rgba(4,10,18,0.72)',
                        border: `1px solid ${isEquipped ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.09)'}`,
                        cursor: isEquipped ? 'default' : 'pointer',
                      }}
                    >
                      <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={shipStats.image} alt="" loading="lazy" decoding="async" style={{ width: 44, height: 44, objectFit: 'contain' }} />
                      </div>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8', lineHeight: 1.15, textAlign: 'center' }}>Default</p>
                      {isEquipped
                        ? <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#e0ddd8' }}>✓ Equipped</span>
                        : <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a7674' }}>Original</span>
                      }
                    </button>
                  )
                })()}
                {SHIP_SKINS.map(skin => {
                  const owned    = ownedSkins.includes(skin.id)
                  const isEquipped = equippedSkin === skin.id
                  return (
                    <button
                      key={skin.id}
                      onClick={owned && !isEquipped ? () => handleEquipSkin(skin.id) : undefined}
                      disabled={!owned || isEquipped}
                      className="font-karla font-700"
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        padding: '0.6rem 0.4rem 0.5rem',
                        borderRadius: 10,
                        background: isEquipped ? `${skin.color}1f` : 'rgba(4,10,18,0.72)',
                        border: `1px solid ${isEquipped ? skin.color + '90' : owned ? 'rgba(255,255,255,0.09)' : `${skin.color}22`}`,
                        boxShadow: isEquipped ? `0 0 14px ${skin.color}33` : 'none',
                        cursor: owned && !isEquipped ? 'pointer' : 'default',
                        opacity: owned ? 1 : 0.6,
                      }}
                    >
                      <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={shipStats.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{
                            width: 44, height: 44, objectFit: 'contain',
                            filter: owned ? skin.filter : 'brightness(0.25) saturate(0)',
                            transition: 'filter 0.25s',
                          }}
                        />
                      </div>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: owned ? '#f0ede8' : '#a8a3a0', lineHeight: 1.15, textAlign: 'center' }}>{skin.name}</p>
                      {isEquipped ? (
                        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: skin.color }}>✓ Equipped</span>
                      ) : owned ? (
                        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#4ade80' }}>Tap to equip</span>
                      ) : (
                        <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#7a7674', textAlign: 'center', lineHeight: 1.3 }}>{skin.source}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              </>)}

              {loadoutTab === 'items' && (<>
              {/* ── Repair Kit ── once-per-battle hull patch in the Special
                  action slot. Shows only the EQUIPPED kit; the upgrade ladder
                  (doubloon-bought, Nav-gated, next tier only) lives behind the
                  Upgrade Kit modal so it doesn't clog the loadout — same shape
                  as Upgrade Ship. */}
              {(() => {
                const kit = getRepairKit(kitEquipped) ?? getRepairKit('basic_repair_kit')!
                const range = repairKitRange(kit, ratedFortune)
                const accent = kitRarityColor(kit.rarity)
                const next = nextRepairKit(kitsOwned)
                return (
                  <>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>Repair Kit</p>
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginBottom: '0.8rem', lineHeight: 1.45 }}>
                      Fired from the Special action in combat. Once per battle, costs the turn.
                    </p>
                    {/* The whole card is the tap target; the gold badge on the kit
                        icon is the "upgrade available" affordance (mirrors the
                        ship's on-image Upgrade pill). */}
                    <div
                      onClick={next ? () => { setKitErr(null); setKitOpen(true) } : undefined}
                      style={{
                        background: `${accent}14`, border: `1px solid ${accent}55`,
                        borderRadius: 14, padding: '0.8rem 0.9rem', marginBottom: '1.5rem',
                        display: 'flex', alignItems: 'center', gap: '0.85rem',
                        cursor: next ? 'pointer' : 'default',
                      }}>
                      <div style={{ position: 'relative', flexShrink: 0, width: 48, height: 48 }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}1f`, border: `1px solid ${accent}55` }}>
                          {kit.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={kit.image} alt="" loading="lazy" decoding="async" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                            : <WrenchGlyph color={accent} />}
                        </div>
                        {next && (
                          <span aria-hidden style={{ position: 'absolute', right: -6, bottom: -6, width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(180deg, #f4c84e, #d4a017)', border: '2px solid #14110d', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.5)', zIndex: 2 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a1206" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8' }}>{kit.name}</p>
                          <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#4ade80' }}>+{range.min}-{range.max} HP</p>
                        </div>
                        <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8a8480', lineHeight: 1.4 }}>
                          {kit.description.replace(/\s*Once per battle\.\s*$/i, '').trim()} Fortune scales the max ({range.max - kit.baseMax > 0 ? `+${range.max - kit.baseMax}` : 'no'} bonus from your {ratedFortune} Fortune).
                        </p>
                      </div>
                      {next ? (
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: '#f0c040', flexShrink: 0, whiteSpace: 'nowrap' }}>Upgrade ›</span>
                      ) : (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', color: '#7a7674', flexShrink: 0 }}>Max</span>
                      )}
                    </div>
                  </>
                )
              })()}

              {/* ── Equipment ──
                  Inventory-first: the whole owned collection is laid out
                  here and tapping a row toggles equip/unequip directly.
                  Effects stack regardless of position, so there are no typed
                  slots — just a capacity cap (raidItemSlots, scales with
                  hull). Equipped rows light up with a check; once the hull
                  is full the unequipped rows grey out until one is freed. */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', letterSpacing: '0.04em' }}>Equipment</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#8a8480' }}>{equippedItems.length}/{raidItemSlots}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: raidItemSlots }, (_, i) => (
                      <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < equippedItems.length ? '#d4ba78' : 'transparent', border: `1px solid ${i < equippedItems.length ? '#d4ba78' : 'rgba(255,255,255,0.22)'}` }} />
                    ))}
                  </div>
                </div>
              </div>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginBottom: '0.85rem', lineHeight: 1.45 }}>
                Tap to equip up to {raidItemSlots} item{raidItemSlots === 1 ? '' : 's'} (bigger hulls hold more).
              </p>

              {/* Forge recipes — each is always visible (until forged) so the
                  result reads as a goal to chase. Shows a component checklist;
                  the forge button only unlocks once every component is owned.
                  Generic over FORGE_RECIPES, so new forgeable items just appear. */}
              {FORGE_RECIPES.filter(recipe => !ownedRaidItems.includes(recipe.result)).map(recipe => {
                const result = getRaidItem(recipe.result)
                if (!result) return null
                const comps = recipe.components.map(id => ({ def: getRaidItem(id), owned: ownedRaidItems.includes(id) }))
                const haveAll = comps.every(c => c.owned)
                const armed = forgeArmed === recipe.result
                const busy = forging === recipe.result
                return (
                  <div key={recipe.result} className="app-card app-card-gold" style={{ padding: '0.85rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: 9, opacity: haveAll ? 1 : 0.92 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: haveAll ? '#e8c879' : '#9a8a5a' }}>{haveAll ? 'Forge Available' : 'Forge · Locked'}</p>
                      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#9a8a5a' }}>{comps.filter(c => c.owned).length}/{comps.length}</span>
                    </div>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f5ecd6', lineHeight: 1.1 }}>{result.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.7rem', color: '#b0aaa0', lineHeight: 1.4 }}>{result.description}</p>

                    {/* Component checklist */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0.2rem 0' }}>
                      {comps.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: c.owned ? 'rgba(127,212,154,0.18)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${c.owned ? 'rgba(127,212,154,0.6)' : 'rgba(255,255,255,0.18)'}`,
                          }}>
                            {c.owned
                              ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#7fd49a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              : null}
                          </span>
                          <span className="font-karla font-700" style={{ flex: 1, fontSize: '0.72rem', color: c.owned ? '#e0dccc' : '#8a8480' }}>{c.def?.name}</span>
                          <span className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.52rem', color: c.owned ? '#7fd49a' : '#7a7470' }}>{c.owned ? 'Owned' : 'Needed'}</span>
                        </div>
                      ))}
                    </div>

                    {haveAll ? (
                      <button
                        type="button"
                        onClick={() => onForgeTap(recipe.result)}
                        disabled={busy}
                        className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
                        style={{
                          width: '100%', padding: '0.72rem', borderRadius: 11, fontSize: '0.8rem',
                          background: armed ? 'linear-gradient(180deg, rgba(248,140,90,0.34), rgba(196,90,60,0.16))' : 'linear-gradient(180deg, rgba(232,200,121,0.3), rgba(196,169,106,0.14))',
                          border: `1px solid ${armed ? 'rgba(248,140,90,0.7)' : 'rgba(232,200,121,0.6)'}`,
                          color: armed ? '#ffd0b0' : '#f0d695',
                          cursor: busy ? 'default' : 'pointer',
                        }}
                      >
                        {busy ? 'Forging…' : armed ? 'Sacrifice components — tap to confirm' : `Forge ${result.name} →`}
                      </button>
                    ) : (
                      <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8480', lineHeight: 1.4, fontStyle: 'italic' }}>
                        Collect every component, then forge them here. The forge sacrifices them.
                      </p>
                    )}
                  </div>
                )
              })}

              {ownedRaidItems.length === 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 14, padding: '1.7rem 1rem', marginBottom: '1.5rem' }}>
                  <p className="font-karla text-center" style={{ fontSize: '0.8rem', color: '#7a7470', lineHeight: 1.55 }}>No items yet.<br />Clear raids to earn them.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {ownedRaidItems.map(itemId => {
                    const def = getRaidItem(itemId)
                    if (!def) return null
                    const color = RARITY_ITEM_COLOR[def.rarity]
                    const equipped = equippedItems.includes(itemId)
                    const full = equippedItems.length >= raidItemSlots
                    const disabled = !equipped && full
                    const isNew = newRaidItems.has(itemId) && !equipped
                    return (
                      <button
                        key={itemId}
                        type="button"
                        onClick={disabled ? undefined : () => toggleItem(itemId)}
                        disabled={disabled}
                        aria-label={equipped ? `${def.name}, equipped. Tap to remove.` : disabled ? `${def.name}. Hull full, free a slot first.` : `${def.name}. Tap to equip.`}
                        style={{
                          background: equipped ? `${color}1c` : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${equipped ? color + '88' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 12,
                          padding: '0.7rem 0.8rem',
                          display: 'flex', alignItems: 'center', gap: '0.8rem',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          width: '100%', textAlign: 'left',
                          opacity: disabled ? 0.42 : 1,
                          boxShadow: equipped ? `0 0 14px ${color}1f` : 'none',
                          transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
                        }}
                      >
                        <div style={{ position: 'relative', flexShrink: 0, width: 46, height: 46 }}>
                          {/* Inner box clips the art to rounded corners; the check
                              badge lives on the OUTER box so overflow doesn't cut it. */}
                          <div style={{ width: '100%', height: '100%', borderRadius: 10, background: `${color}12`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {def.image ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={def.image} alt="" loading="lazy" decoding="async" style={{ width: 33, height: 33, objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: '1.55rem', lineHeight: 1 }}>{def.emoji}</span>
                            )}
                          </div>
                          {equipped && (
                            <div style={{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #14110d', zIndex: 2 }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#14110d" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: equipped ? color : '#f0ede8', marginBottom: 2 }}>
                            {def.name}
                            {isNew && <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: '#1a1206', background: '#ffd96a', borderRadius: 4, padding: '0.12rem 0.32rem', marginLeft: 7, verticalAlign: 'middle' }}>New</span>}
                          </p>
                          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8480', lineHeight: 1.4 }}>{def.description}</p>
                        </div>
                        <span
                          className="font-karla font-700 uppercase tracking-[0.06em]"
                          style={{
                            fontSize: '0.58rem',
                            color: equipped ? color : disabled ? '#6a6764' : '#9ae6b4',
                            padding: '0.24rem 0.55rem',
                            borderRadius: 999,
                            background: equipped ? `${color}1a` : disabled ? 'rgba(255,255,255,0.04)' : 'rgba(154,230,180,0.10)',
                            border: `1px solid ${equipped ? color + '50' : disabled ? 'rgba(255,255,255,0.1)' : 'rgba(154,230,180,0.32)'}`,
                            flexShrink: 0, whiteSpace: 'nowrap',
                          }}
                        >
                          {equipped ? 'Equipped' : disabled ? 'Full' : 'Equip'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              </>)}
              </div>{/* end scrollable */}

              {/* Sticky launch CTA — only when drawer was opened in a
                  launch mode. Sits over the scrollable area so the
                  player always sees the commit button no matter how
                  far they've scrolled through their loadout. Tapping
                  closes the drawer + scrolls into the relevant inline
                  section (chapter map / voyage panel) where the
                  actual action lives. */}
              {loadoutMode && (
                <div
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '0.75rem 1rem calc(env(safe-area-inset-bottom, 0px) + 0.85rem)',
                    background: 'linear-gradient(180deg, rgba(8,14,24,0) 0%, rgba(8,14,24,0.96) 38%, rgba(8,14,24,0.99) 100%)',
                    pointerEvents: 'none',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const id = loadoutMode === 'campaign' ? 'chapter-map' : 'voyage-panel'
                      closeLoadout()
                      setTimeout(() => {
                        const el = document.getElementById(id)
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }, 240)
                    }}
                    className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{
                      pointerEvents: 'auto',
                      width: '100%', padding: '0.85rem 0',
                      borderRadius: 14,
                      background: loadoutMode === 'campaign'
                        ? 'linear-gradient(180deg, rgba(196,169,106,0.35) 0%, rgba(196,169,106,0.18) 100%)'
                        : 'linear-gradient(180deg, rgba(125,160,216,0.32) 0%, rgba(125,160,216,0.16) 100%)',
                      border: `1px solid ${loadoutMode === 'campaign' ? 'rgba(196,169,106,0.7)' : 'rgba(125,160,216,0.65)'}`,
                      color: loadoutMode === 'campaign' ? '#f0d695' : '#bcd0ea',
                      fontSize: '0.75rem',
                      cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                    }}
                  >
                    {loadoutMode === 'campaign' ? 'Open Story Map →' : 'Set Sail →'}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Crew picker — opens from the deck slots, the loadout drawer, OR
          the campaign prep modal in HubCards. Must live at the top level
          (not inside the loadout block) to render whether or not the
          drawer is open. Fixed-positioned; z-index 130+ clears the page
          Nav, the loadout drawer, AND any sibling PopupShell modal
          (default z 111) that triggered the picker. */}
      {sheetOpen && (() => {
        const slotAccent = pickerSlot === 0 ? '#f0c040' : '#60a5fa'
        const currentInSlot = pickerSlot !== null ? slots[pickerSlot] : null
        const currentColor = currentInSlot ? (CREW_RARITY_COLORS[currentInSlot.rarity as 1 | 2 | 3 | 4] ?? '#6a6764') : '#6a6764'
        return (
              <>
                <div
                  onClick={closeSheet}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(2,4,8,0.78)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 130 }}
                />
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'fixed', zIndex: 131,
                    top: 'max(72px, env(safe-area-inset-top, 0px) + 16px)',
                    bottom: 0,
                    left: 'max(0px, calc(50% - 270px))',
                    right: 'max(0px, calc(50% - 270px))',
                    background: 'linear-gradient(180deg, #141823 0%, #0a0c11 100%)',
                    borderTop: `2px solid ${slotAccent}`,
                    borderLeft: '1px solid rgba(255,255,255,0.12)',
                    borderRight: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '20px 20px 0 0',
                    boxShadow: '0 -10px 44px rgba(0,0,0,0.6)',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: '1.1rem 1.25rem 0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: slotAccent, marginBottom: 4 }}>
                        {pickerSlot === 0 ? 'Captain' : pickerSlot !== null ? `Crew · Slot ${pickerSlot + 1}` : ''}
                      </p>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f5f2ec', lineHeight: 1.1 }}>
                        {pickerSlot === 0 ? 'Assign Captain' : 'Assign Crew'}
                      </p>
                      {/* Who's in this slot right now */}
                      {currentInSlot ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, maxWidth: '100%', padding: '0.22rem 0.55rem 0.22rem 0.28rem', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${currentColor}` }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={IMG_BASE + currentInSlot.filename} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                          </div>
                          <span className="font-karla truncate" style={{ fontSize: '0.66rem', color: '#9aa0a6', minWidth: 0 }}>
                            Currently <span className="font-700" style={{ color: '#dfe9e3' }}>{currentInSlot.name}</span>
                          </span>
                        </div>
                      ) : (
                        <p className="font-karla" style={{ marginTop: 7, fontSize: '0.66rem', color: '#6a6764' }}>This slot is empty.</p>
                      )}
                    </div>
                    <button onClick={closeSheet} aria-label="Close" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0, marginLeft: '0.75rem' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b2aca3" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>

                  {/* Current-crew totals summary — previews the pending pick */}
                  <div style={{ padding: '0.85rem 1.25rem 0.95rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: pendingCard ? `${slotAccent}12` : 'rgba(255,255,255,0.025)', flexShrink: 0, transition: 'background 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: pendingCard ? slotAccent : '#9aa0a6' }}>{pendingCard ? 'Crew aboard · preview' : 'Crew aboard'}</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: previewCount > 0 ? '#dfe9e3' : '#6a6764' }}>{previewCount} / {slots.length}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {STAT_COLS.map(s => {
                        const cur = s.key === 'power' ? totalPower : s.key === 'dodge' ? totalDodge : totalFortune
                        const prev = previewTotals[s.key]
                        const delta = prev - cur
                        const showDelta = !!pendingCard && delta !== 0
                        return (
                          <div key={s.key} style={{ flex: 1, textAlign: 'center', background: 'rgba(0,0,0,0.32)', border: `1px solid ${showDelta ? s.color + '66' : 'rgba(255,255,255,0.09)'}`, borderRadius: 10, padding: '0.5rem 0.2rem', transition: 'border-color 0.15s' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                              <span className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: s.color, lineHeight: 1 }}>{prev}</span>
                              {showDelta && (
                                <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', lineHeight: 1, color: delta > 0 ? '#6ee7a0' : '#f08a8a' }}>{delta > 0 ? '+' : ''}{delta}</span>
                              )}
                            </div>
                            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: '#857f77', marginTop: 4 }}>{s.short}</p>
                          </div>
                        )
                      })}
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.7rem', color: '#9a948c', lineHeight: 1.5, marginTop: 10 }}>
                      {pickerSlot === 0
                        ? <>Your captain uses <span style={{ color: '#e4c890', fontWeight: 600 }}>full stats</span> and always returns. Crew add <span style={{ color: '#9ec6ff', fontWeight: 600 }}>80%</span> and can be lost on risky voyages.</>
                        : <>Crew add <span style={{ color: '#9ec6ff', fontWeight: 600 }}>80%</span> of their stats and can be lost on risky voyages.</>}
                    </p>
                  </div>

                  {/* Sort bar */}
                  <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#7a766f' }}>Sort</span>
                    {STAT_COLS.map(s => {
                      const active = sortBy === s.key
                      return (
                        <button key={s.key} onClick={() => setSortBy(active ? null : s.key)} className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.66rem', padding: '0.3rem 0.72rem', borderRadius: 999, background: active ? `${s.color}26` : 'rgba(255,255,255,0.05)', border: `1px solid ${active ? s.color + '77' : 'rgba(255,255,255,0.12)'}`, color: active ? s.color : '#9a9488', cursor: 'pointer' }}>
                          {s.short}
                        </button>
                      )
                    })}
                  </div>

                  <div className={pendingCard ? 'pb-6 sm:pb-8' : 'pb-24 sm:pb-8'} style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, paddingTop: '1rem', paddingLeft: '1.25rem', paddingRight: '1.25rem', overscrollBehavior: 'contain' }}>
                    {roster.length === 0 ? (
                      <p className="font-karla text-center" style={{ fontSize: '0.85rem', color: '#8a857c', padding: '3rem 1rem', lineHeight: 1.6 }}>No crew yet.<br />Recruit some at the Crew Hall first.</p>
                    ) : pickerCards.length === 0 ? (
                      <p className="font-karla text-center" style={{ fontSize: '0.85rem', color: '#8a857c', padding: '3rem 1rem' }}>All your crew are already aboard.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {pickerCards.map(card => (
                          <PickerCrewCard
                            key={card.id}
                            card={card}
                            selected={pendingCard?.id === card.id}
                            current={currentInSlot?.id === card.id}
                            onSelect={() => setPendingCard(prev => (prev?.id === card.id ? null : card))}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Confirm bar — a tap above only selects + previews; the crew
                      is assigned only on this explicit confirm. */}
                  {pendingCard && (() => {
                    const pendColor = CREW_RARITY_COLORS[pendingCard.rarity as 1 | 2 | 3 | 4] ?? '#6a6764'
                    return (
                      <div className="pb-20 sm:pb-4" style={{
                        flexShrink: 0,
                        borderTop: `1px solid ${slotAccent}44`,
                        background: 'rgba(8,12,20,0.96)',
                        paddingTop: '0.8rem', paddingLeft: '1.25rem', paddingRight: '1.25rem',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${pendColor}`, background: `radial-gradient(ellipse at 50% 32%, ${pendColor}26 0%, #070504 78%)` }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={IMG_BASE + pendingCard.filename} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#857f77', marginBottom: 2 }}>
                            {pickerSlot === 0 ? 'Set as Captain' : `Assign to Slot ${(pickerSlot ?? 0) + 1}`}
                          </p>
                          <p className="font-pirata truncate" style={{ fontSize: '1.05rem', color: '#ecdcbd', lineHeight: 1.1 }}>{pendingCard.name}</p>
                        </div>
                        <button onClick={() => setPendingCard(null)} className="font-karla font-700" style={{ flexShrink: 0, padding: '0.6rem 0.85rem', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfcabf', fontSize: '0.74rem', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button onClick={confirmAssign} className="font-karla font-700" style={{ flexShrink: 0, padding: '0.6rem 1.1rem', borderRadius: 10, background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.6)', color: '#cfe2ff', fontSize: '0.78rem', cursor: 'pointer' }}>
                          Assign
                        </button>
                      </div>
                    )
                  })()}
                </div>
              </>
        )
      })()}


      {/* Score breakdown modal — opens when the player taps a score on the
          hero strip. Shows the actual formula with the player's numbers
          plugged in so they can see WHY their score is what it is. Uses the
          shared <PopupShell>, which handles the safe-area padding so the
          modal's top isn't hidden under the Nav header and the bottom isn't
          clipped behind the MobileTabBar. */}
      <PopupShell open={!!breakdownScore} onClose={() => setBreakdownScore(null)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          style={{
            margin: 'auto',
            width: '100%',
            maxWidth: 420,
            background: 'rgba(8,14,24,0.98)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18,
            padding: '1.1rem 1rem 1.25rem',
          }}
        >
          {breakdownScore === 'voyage' ? (
            <VoyageScoreBreakdown
              power={totalPower}
              dodge={totalDodge}
              fortune={totalFortune}
              total={voyageScore}
              onClose={() => setBreakdownScore(null)}
            />
          ) : (
            <RaidScoreBreakdown
              crewPower={totalPower}
              crewDodge={totalDodge}
              crewFortune={totalFortune}
              navLevel={xpProgress.level}
              navBonusPower={navBonus.power}
              navBonusDodge={navBonus.navigation}
              navBonusFortune={navBonus.fortune}
              navBonusHp={navBonus.hp}
              shipName={shipStats.name}
              shipDurability={shipStats.durability}
              shipMin={shipStats.minDamage}
              rating={raidRating}
              onClose={() => setBreakdownScore(null)}
            />
          )}
        </motion.div>
      </PopupShell>

      {/* Navigation-level info modal — opens from the Lv pill in the hero
          header. Shows the current captain bonuses (HP, Power, Navigation,
          Fortune), XP progress to the next level, and what the bonuses become
          one level up so the player sees the carrot. */}
      <PopupShell open={navInfoOpen} onClose={() => setNavInfoOpen(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          style={{
            margin: 'auto', width: '100%', maxWidth: 380,
            background: 'rgba(8,14,24,0.98)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18,
            padding: '1.1rem 1rem 1.25rem',
          }}
        >
          <NavLevelInfoPanel
            level={xpProgress.level}
            xpInLevel={xpProgress.xpInLevel}
            xpForLevel={xpProgress.xpForLevel}
            progress={xpProgress.progress}
            onClose={() => setNavInfoOpen(false)}
          />
        </motion.div>
      </PopupShell>

      {/* Ship upgrade modal — preview the next available tier with stats vs
          the current ship, plus a one-tap buy. The full shipyard is still
          reachable via the secondary link, for browsing skins / re-checking
          everything. */}
      <PopupShell open={upgradeOpen} onClose={() => { setUpgradeOpen(false); setUpgradeError(null) }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          style={{
            margin: 'auto', width: '100%', maxWidth: 380,
            background: 'rgba(8,14,24,0.98)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18,
            padding: '1.1rem 1rem 1.25rem',
          }}
        >
          <UpgradeShipPanel
            shipStats={shipStats}
            navLevel={xpProgress.level}
            doubloons={doubloons}
            busy={upgradeBusy}
            error={upgradeError}
            onBuy={async () => {
              setUpgradeBusy(true)
              setUpgradeError(null)
              try {
                const res = await buyShip()
                if ('error' in res) {
                  setUpgradeError(res.error)
                } else {
                  window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                  setUpgradeOpen(false)
                  router.refresh()
                }
              } finally {
                setUpgradeBusy(false)
              }
            }}
            onClose={() => { setUpgradeOpen(false); setUpgradeError(null) }}
          />
        </motion.div>
      </PopupShell>

      <PopupShell open={kitOpen} onClose={() => { setKitOpen(false); setKitErr(null) }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          style={{ margin: 'auto', width: '100%', maxWidth: 380, background: 'rgba(8,14,24,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '1.1rem 1rem 1.25rem' }}
        >
          <UpgradeRepairKitPanel
            equippedKit={kitEquipped}
            ownedKits={kitsOwned}
            ratedFortune={ratedFortune}
            doubloons={doubloons}
            navLevel={xpProgress.level}
            busy={kitBusy}
            error={kitErr}
            onBuy={doBuyKit}
            onClose={() => { setKitOpen(false); setKitErr(null) }}
          />
        </motion.div>
      </PopupShell>
    </>
  )
}

// ── Upgrade ship panel ──────────────────────────────────────────────────────
// Inner content for the upgrade modal. Pulled out so the parent stays
// readable; lives in the same file because it shares the ShipStats shape and
// is only used here. Shows the next ship's hull image, the cost (with
// affordability state), a side-by-side stat delta vs the current ship, and a
// secondary link to the full shipyard for browsing/skins/lower tiers.
function UpgradeShipPanel({
  shipStats, navLevel, doubloons, busy, error, onBuy, onClose,
}: {
  shipStats: ShipStats
  navLevel: number
  doubloons: number
  busy: boolean
  error: string | null
  onBuy: () => void
  onClose: () => void
}) {
  const currentTier = Math.max(0, SHIPS.findIndex(s => s.name === shipStats.name))
  const nextTier = currentTier + 1
  const atMax = nextTier >= SHIPS.length
  const nextShip = atMax ? null : SHIPS[nextTier]
  const nextCombat = atMax ? null : EXPEDITION_SHIP_STATS[nextTier]
  const currentShip = SHIPS[currentTier]
  const navReq = nextShip ? navLevelReqForShip(nextShip.cost) : 0
  const navMet = navLevel >= navReq
  const canAfford = !!nextShip && doubloons >= nextShip.cost
  const canBuy = canAfford && navMet

  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.85rem' }}>
        <p className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>
          Upgrade Ship
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30, height: 30, borderRadius: 8, padding: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#cbd2da', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {atMax ? (
        // Top tier — nothing left to buy. Skin browsing still useful via shipyard.
        <>
          <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: currentShip.color, marginBottom: 4 }}>
              You sail the {currentShip.name}
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#9a9690' }}>
              That is the largest hull on the water. There is no greater ship to upgrade to.
            </p>
          </div>
          <Link href="/marketplace/shipyard"
            className="font-karla font-600"
            style={{
              display: 'block', textAlign: 'center', fontSize: '0.72rem',
              color: '#8aa9c8', textDecoration: 'underline', textUnderlineOffset: 3, padding: '0.5rem 0',
            }}
          >
            Browse the shipyard →
          </Link>
        </>
      ) : nextShip && nextCombat ? (
        <>
          {/* Ship hull preview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 110, marginBottom: '0.6rem' }}>
            {nextShip.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={nextShip.imageUrl} alt={nextShip.name} loading="lazy" decoding="async" style={{ maxHeight: 110, maxWidth: '75%', objectFit: 'contain', filter: `drop-shadow(0 6px 14px ${nextShip.color}55)` }} />
            )}
          </div>

          <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: nextShip.color, textAlign: 'center', lineHeight: 1, marginBottom: 4 }}>
            {nextShip.name}
          </p>
          <p className="font-karla font-300 italic" style={{ fontSize: '0.72rem', color: '#8a8784', textAlign: 'center', marginBottom: '0.95rem' }}>
            {nextShip.description}
          </p>

          {/* Stats — current → next, with delta */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', columnGap: 8, rowGap: 4,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '0.6rem 0.7rem', marginBottom: '0.9rem',
            fontSize: '0.72rem',
          }}>
            <StatDelta label="Durability" cur={shipStats.durability}        next={nextCombat.durability}    />
            <StatDelta label="Speed"      cur={shipStats.speed}             next={nextCombat.speed}         />
            <StatDelta label="Crew Slots" cur={shipStats.crewSlots}         next={nextCombat.crewSlots}     />
            <StatDelta label="Min Damage" cur={shipStats.minDamage}         next={nextCombat.minDamage}     />
          </div>

          {error && (
            <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#f08a8a', marginBottom: '0.55rem', textAlign: 'center' }}>{error}</p>
          )}

          {/* Buy button */}
          <button
            type="button"
            onClick={onBuy}
            disabled={busy || !canBuy}
            className="font-karla font-700 uppercase tracking-[0.08em]"
            style={{
              width: '100%', padding: '0.85rem', borderRadius: 12, marginBottom: '0.55rem',
              fontSize: '0.82rem', cursor: busy ? 'wait' : canBuy ? 'pointer' : 'not-allowed',
              background: canBuy ? 'rgba(240,192,64,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canBuy ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.12)'}`,
              color: canBuy ? '#f0c040' : '#6a6764',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy
              ? 'Buying…'
              : !navMet
                ? <>Reach Nav Lv {navReq} to unlock</>
                : canAfford
                  ? <>Upgrade for {nextShip.cost.toLocaleString()} ⟡</>
                  : <>Need {(nextShip.cost - doubloons).toLocaleString()} more ⟡</>}
          </button>

          {/* Secondary: full shipyard (browsing skins, lower tiers, etc.) */}
          <Link href="/marketplace/shipyard"
            className="font-karla font-600"
            style={{
              display: 'block', textAlign: 'center', fontSize: '0.7rem',
              color: '#8aa9c8', textDecoration: 'underline', textUnderlineOffset: 3, padding: '0.35rem 0',
            }}
          >
            Browse the full shipyard →
          </Link>
        </>
      ) : null}
    </>
  )
}

function StatDelta({ label, cur, next }: { label: string; cur: number; next: number }) {
  const diff = next - cur
  const sign = diff > 0 ? '+' : ''
  return (
    <>
      <span className="font-karla font-600" style={{ color: '#9a9690' }}>{label}</span>
      <span className="font-cinzel font-700" style={{ color: '#cbd2da', textAlign: 'right' }}>{cur}</span>
      <span className="font-karla" style={{ color: '#4a4845' }}>→</span>
      <span className="font-cinzel font-700" style={{ color: '#f0ede8', textAlign: 'right' }}>{next}</span>
      <span className="font-karla font-600" style={{ color: diff > 0 ? '#4ade80' : diff < 0 ? '#f87171' : '#6a6764', textAlign: 'right', minWidth: 32 }}>
        {diff === 0 ? '—' : `${sign}${diff}`}
      </span>
    </>
  )
}

// ── Upgrade repair kit panel ────────────────────────────────────────────────
// Mirror of UpgradeShipPanel for the repair-kit ladder: previews ONLY the next
// tier (heal vs the current kit, cost, Nav gate) with a one-tap buy that
// auto-equips. Kept out of the loadout drawer so the kit section stays compact.
function UpgradeRepairKitPanel({
  equippedKit, ownedKits, ratedFortune, doubloons, navLevel, busy, error, onBuy, onClose,
}: {
  equippedKit: string
  ownedKits: string[]
  ratedFortune: number
  doubloons: number
  navLevel: number
  busy: boolean
  error: string | null
  onBuy: () => void
  onClose: () => void
}) {
  const current = getRepairKit(equippedKit) ?? getRepairKit('basic_repair_kit')!
  const next = nextRepairKit(ownedKits)
  const accent = next ? kitRarityColor(next.rarity) : '#9ca3af'
  const curRange = repairKitRange(current, ratedFortune)
  const nextRange = next ? repairKitRange(next, ratedFortune) : null
  const navOk = !!next && navLevel >= next.navLevelReq
  const canAfford = !!next && doubloons >= next.cost

  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.85rem' }}>
        <p className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>Upgrade Kit</p>
        <button type="button" onClick={onClose} className="font-karla font-700" style={{ fontSize: '1.2rem', color: '#7a7674', lineHeight: 1 }} aria-label="Close">✕</button>
      </div>

      {!next || !nextRange ? (
        <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#9a948a', textAlign: 'center', padding: '1rem 0' }}>Every repair kit is yours. The Ironclad Kit is equipped.</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <div style={{ width: 72, height: 72, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}1f`, border: `1px solid ${accent}66` }}>
              {next.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={next.image} alt={next.name} loading="lazy" decoding="async" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                : <div style={{ transform: 'scale(1.9)' }}><WrenchGlyph color={accent} /></div>}
            </div>
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: accent, textAlign: 'center', lineHeight: 1, marginBottom: 4 }}>{next.name}</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a948a', textAlign: 'center', lineHeight: 1.4, marginBottom: 12, padding: '0 0.5rem' }}>
            {next.description.replace(/\s*Once per battle\.\s*$/i, '').trim()}
          </p>

          {/* Heal delta: current kit → next kit */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr auto', gap: '6px 10px', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.7rem 0.85rem', marginBottom: 12, fontSize: '0.72rem' }}>
            <StatDelta label="Heal floor" cur={curRange.min} next={nextRange.min} />
            <StatDelta label="Heal max" cur={curRange.max} next={nextRange.max} />
          </div>

          {!navOk && (
            <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#e0a44a', textAlign: 'center', marginBottom: 10 }}>
              Reach Nav Lv {next.navLevelReq} to unlock this kit.
            </p>
          )}
          {error && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#f87171', textAlign: 'center', marginBottom: 10 }}>{error}</p>}

          <button type="button" onClick={onBuy} disabled={busy || !navOk || !canAfford}
            className="font-cinzel font-700 uppercase tracking-[0.08em]"
            style={{
              width: '100%', padding: '0.8rem', borderRadius: 12, border: 'none',
              background: navOk && canAfford ? `linear-gradient(180deg, ${accent}, ${accent}cc)` : 'rgba(255,255,255,0.06)',
              color: navOk && canAfford ? '#0a1016' : '#7a7674',
              fontSize: '0.85rem', cursor: busy || !navOk || !canAfford ? 'default' : 'pointer',
              boxShadow: navOk && canAfford ? `0 4px 14px ${accent}40` : 'none',
            }}>
            {busy ? 'Buying…'
              : !navOk ? `Locked · Nav Lv ${next.navLevelReq}`
              : canAfford ? `Upgrade for ${next.cost.toLocaleString()} ⟡`
              : `Need ${(next.cost - doubloons).toLocaleString()} more ⟡`}
          </button>
        </>
      )}
    </>
  )
}

// ── Nav level info panel ────────────────────────────────────────────────────
// Inner content of the modal opened from the Lv pill in the ship hero. Shows
// XP progress to next level, the captain bonuses at the current level, and a
// preview of the bonuses one level up so the player sees what they're working
// toward. Nautical titles live on Voyage/Raid Scores now, not nav level.
function NavLevelInfoPanel({
  level, xpInLevel, xpForLevel, progress, onClose,
}: {
  level: number
  xpInLevel: number
  xpForLevel: number
  progress: number
  onClose: () => void
}) {
  const atMax = level >= MAX_LEVEL
  const xpToNext = atMax ? 0 : Math.max(0, xpForLevel - xpInLevel)
  const currentBonus = navLevelBonuses(level)
  const nextBonus = atMax ? null : navLevelBonuses(level + 1)

  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.85rem' }}>
        <p className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>
          Navigation
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30, height: 30, borderRadius: 8, padding: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#cbd2da', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Level — just the number now; titles belong to Voyage/Raid Score. */}
      <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '2.4rem', color: '#7da0d8', lineHeight: 1, textShadow: '0 0 22px rgba(125,160,216,0.35)' }}>
          Lv {level}
        </p>
      </div>

      {/* XP progress */}
      <div style={{ marginBottom: '1.1rem' }}>
        <div className="flex justify-between font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.12em', color: '#7a8696', marginBottom: 6 }}>
          <span>Experience</span>
          <span>{atMax ? 'MAX' : `${xpInLevel.toLocaleString()} / ${xpForLevel.toLocaleString()}`}</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(1, progress) * 100}%`, background: 'linear-gradient(90deg, #4a6090 0%, #7da0d8 100%)', borderRadius: 4 }} />
        </div>
        <p className="font-karla font-500" style={{ fontSize: '0.7rem', color: atMax ? '#7da0d8' : '#7a8696', marginTop: 7, textAlign: 'center' }}>
          {atMax
            ? 'Top of the ladder. There is no higher rank.'
            : <>{xpToNext.toLocaleString()} XP to <span style={{ color: '#cbd2da' }}>Lv {level + 1}</span></>}
        </p>
      </div>

      {/* Captain bonuses — one grid, with a "Lv N+1" column folded in when
          there's a next level so the player sees the carrot without a second
          table. */}
      <div style={{ marginBottom: '0.6rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#7a7875', marginBottom: 6 }}>
          Captain bonuses
        </p>
        <NavBonusGrid
          currentLevel={level}
          currentBonus={currentBonus}
          nextLevel={atMax ? undefined : level + 1}
          nextBonus={nextBonus ?? undefined}
        />
      </div>

      <p className="font-karla" style={{ fontSize: '0.66rem', color: '#6a6764', lineHeight: 1.55, marginTop: '0.85rem' }}>
        Navigation XP comes from raids, voyages, and other expedition rewards. Every level adds +1 HP to your ship in raids, and every 5 levels adds +1 Power, +1 Savvy, and +1 Fortune on top of your crew totals.
      </p>
    </>
  )
}

function NavBonusGrid({ currentLevel, currentBonus, nextLevel, nextBonus }: {
  currentLevel: number
  currentBonus: ReturnType<typeof navLevelBonuses>
  nextLevel?: number
  nextBonus?: ReturnType<typeof navLevelBonuses>
}) {
  const rows: { label: string; cur: number; next: number | undefined; color: string }[] = [
    { label: 'Ship HP',    cur: currentBonus.hp,         next: nextBonus?.hp,         color: '#86efac' },
    { label: 'Power',      cur: currentBonus.power,      next: nextBonus?.power,      color: '#f87171' },
    { label: 'Savvy',      cur: currentBonus.navigation, next: nextBonus?.navigation, color: '#60a5fa' },
    { label: 'Fortune',    cur: currentBonus.fortune,    next: nextBonus?.fortune,    color: '#f0c040' },
  ]
  const hasNext = nextBonus !== undefined && nextLevel !== undefined
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: hasNext ? '1fr auto auto' : '1fr auto',
      columnGap: 16, rowGap: 6,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '0.6rem 0.75rem', fontSize: '0.74rem',
    }}>
      {/* Column headers — current is absolute, next is the delta only so the
          rows that don't change at the next level stay quiet. */}
      <span />
      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.14em', color: '#7a8696', textAlign: 'right' }}>
        Lv {currentLevel}
      </span>
      {hasNext && (
        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.14em', color: '#90c0ff', textAlign: 'right' }}>
          Lv {nextLevel}
        </span>
      )}

      {/* Rows */}
      {rows.map(({ label, cur, next, color }) => {
        const delta = next !== undefined ? next - cur : null
        return (
          <Fragment key={label}>
            <span className="font-karla font-600" style={{ color: '#9a9690' }}>{label}</span>
            <span className="font-cinzel font-700" style={{ color, textAlign: 'right' }}>+{cur}</span>
            {hasNext && (
              <span className="font-cinzel font-700" style={{
                color: delta && delta > 0 ? '#4ade80' : delta && delta < 0 ? '#f87171' : 'transparent',
                textAlign: 'right',
              }}>
                {delta && delta > 0 ? `+${delta}` : delta && delta < 0 ? String(delta) : ''}
              </span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

// ─── Score breakdown modals ──────────────────────────────────────────────────

function BreakdownHeader({ title, color, onClose }: { title: string; color: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color }}>{title}</p>
      <button
        onClick={onClose}
        aria-label="Close breakdown"
        style={{
          color: '#e0ddd8', cursor: 'pointer',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '50%',
          width: 28, height: 28, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'manipulation',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

function VoyageScoreBreakdown({ power, dodge, fortune, total, onClose }: {
  power: number; dodge: number; fortune: number; total: number; onClose: () => void
}) {
  // Each stat governs one event type and rolls 0-1; convert to a 0-100
  // sub-score so the three tiles match the Raid Score tile shape (label +
  // sub-score, bar, description, fine-print raw value).
  const powerRate   = Math.min(power   / 55, 0.80)
  const dodgeRate   = Math.min(dodge   / 28, 1)
  const fortuneRate = Math.min(fortune / 45, 1)
  const tiles = [
    {
      label: 'Power',
      sub: Math.round((powerRate / 0.80) * 100),
      bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.24)', bar: '#f87171',
      labelColor: '#f87171', subLabelColor: '#9a5454', textColor: '#cbb4ad',
      copy: <>The damage you bring to a fight. Drives <span style={{ color: '#f0ede8', fontWeight: 600 }}>encounter</span> events, where a power roll clears the threat.</>,
      fine: <>{power} raw power, caps at <span style={{ color: '#cbb4ad', fontWeight: 600 }}>55</span> (max 80%).</>,
    },
    {
      label: 'Savvy',
      sub: Math.round(dodgeRate * 100),
      bg: 'rgba(96,165,250,0.07)', border: 'rgba(96,165,250,0.24)', bar: '#60a5fa',
      labelColor: '#60a5fa', subLabelColor: '#4a6e9a', textColor: '#aebfd4',
      copy: <>Avoids trouble outright. Drives <span style={{ color: '#f0ede8', fontWeight: 600 }}>danger</span> events; a clean dodge skips the loss entirely.</>,
      fine: <>{dodge} raw savvy, caps at <span style={{ color: '#aebfd4', fontWeight: 600 }}>28</span>.</>,
    },
    {
      label: 'Fortune',
      sub: Math.round(fortuneRate * 100),
      bg: 'rgba(240,192,64,0.07)', border: 'rgba(240,192,64,0.24)', bar: '#f0c040',
      labelColor: '#f0c040', subLabelColor: '#8a6e30', textColor: '#dccaa4',
      copy: <>Finds the good stuff. Drives <span style={{ color: '#f0ede8', fontWeight: 600 }}>discovery</span> events and scales every payout you bring home.</>,
      fine: <>{fortune} raw fortune, caps at <span style={{ color: '#dccaa4', fontWeight: 600 }}>45</span>.</>,
    },
  ]

  return (
    <>
      <BreakdownHeader title="Voyage Score" color="#7090c0" onClose={onClose} />

      {/* Rank banner — same shape as the Raid Score banner. */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem',
        padding: '0.75rem 0.9rem', marginBottom: '0.85rem',
        background: 'rgba(112,144,192,0.11)', border: '1px solid rgba(112,144,192,0.36)', borderRadius: 12,
      }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#9ab4dc', fontStyle: 'italic' }}>{getRankTitle(total)}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', fontFeatureSettings: '"tnum"' }}>
          {total}<span style={{ color: '#7090c0', fontSize: '0.75rem' }}>/100</span>
        </p>
      </div>

      <p className="font-karla" style={{ fontSize: '0.88rem', color: '#c4bfb6', lineHeight: 1.55, marginBottom: '1rem' }}>
        How ready your crew is for a daily voyage. The higher each stat
        climbs, the more events go your way.
      </p>

      {/* Three stat tiles — same shape as Offense/Defense in the Raid
          breakdown: label + sub-score, progress bar, description, fine
          print with the raw stat + cap. */}
      {tiles.map(t => (
        <div key={t.label} style={{ padding: '0.85rem 0.95rem', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.8rem', color: t.labelColor }}>{t.label}</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>
              {t.sub}<span style={{ color: t.subLabelColor, fontSize: '0.78rem' }}>/100</span>
            </p>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${t.sub}%`, background: t.bar, borderRadius: 3 }} />
          </div>
          <p className="font-karla" style={{ fontSize: '0.84rem', color: t.textColor, lineHeight: 1.5 }}>{t.copy}</p>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6a60', marginTop: 6 }}>{t.fine}</p>
        </div>
      ))}

      <p className="font-karla" style={{ fontSize: '0.7rem', color: '#7a6a60', lineHeight: 1.45, textAlign: 'center', marginTop: '0.4rem' }}>
        Voyage Score is the average of all three — a strong, balanced crew clears events from every angle.
      </p>
    </>
  )
}

function RaidScoreBreakdown({
  crewPower, crewDodge, crewFortune,
  navBonusPower, navBonusDodge, navBonusFortune, navBonusHp,
  shipDurability,
  rating, onClose,
}: {
  crewPower: number; crewDodge: number; crewFortune: number
  navLevel: number; navBonusPower: number; navBonusDodge: number; navBonusFortune: number; navBonusHp: number
  shipName: string; shipDurability: number; shipMin: number
  rating: { offense: number; defense: number; offenseScore: number; defenseScore: number; score: number }
  onClose: () => void
}) {
  const stats = [
    { label: 'Power',   value: crewPower   + navBonusPower,   color: '#f87171' },
    { label: 'Nav',     value: crewDodge   + navBonusDodge,   color: '#60a5fa' },
    { label: 'Fortune', value: crewFortune + navBonusFortune, color: '#f0c040' },
    { label: 'HP',      value: shipDurability + navBonusHp,   color: '#4ade80' },
  ]

  return (
    <>
      <BreakdownHeader title="Raid Score" color="#c8704a" onClose={onClose} />

      {/* Rank banner — same 0-100 nautical ladder as Voyage Score. */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem',
        padding: '0.75rem 0.9rem', marginBottom: '0.85rem',
        background: 'rgba(200,112,74,0.11)', border: '1px solid rgba(200,112,74,0.36)', borderRadius: 12,
      }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#dca494', fontStyle: 'italic' }}>{getRankTitle(rating.score)}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', fontFeatureSettings: '"tnum"' }}>
          {rating.score}<span style={{ color: '#c8704a', fontSize: '0.75rem' }}>/100</span>
        </p>
      </div>

      <p className="font-karla" style={{ fontSize: '0.88rem', color: '#c4bfb6', lineHeight: 1.55, marginBottom: '1rem' }}>
        How tough your crew is in a raid. The higher it climbs, the
        harder you hit and the longer you survive in a fight.
      </p>

      {/* Offense — 0-100 sub-score against an endgame benchmark, with the
          raw damage-per-shot shown as fine print so the headline is
          directly comparable to Defense. */}
      <div style={{ padding: '0.85rem 0.95rem', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.24)', borderRadius: 12, marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.8rem', color: '#f87171' }}>Offense</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>
            {rating.offenseScore}<span style={{ color: '#9a5454', fontSize: '0.78rem' }}>/100</span>
          </p>
        </div>
        <div style={{ height: 5, background: 'rgba(248,113,113,0.12)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${rating.offenseScore}%`, background: '#f87171', borderRadius: 3 }} />
        </div>
        <p className="font-karla" style={{ fontSize: '0.84rem', color: '#cbb4ad', lineHeight: 1.5 }}>
          The damage you deal. Grows with your crew&apos;s{' '}
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>Power</span>, plus crit
          from raid traits like Keen Cutlass.
        </p>
        <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6a60', marginTop: 6 }}>
          Avg <span style={{ color: '#cbb4ad', fontWeight: 600 }}>{rating.offense}</span> damage per shot.
        </p>
      </div>

      {/* Defense — same shape, same scale. */}
      <div style={{ padding: '0.85rem 0.95rem', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.24)', borderRadius: 12, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.8rem', color: '#60a5fa' }}>Defense</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>
            {rating.defenseScore}<span style={{ color: '#4a6e9a', fontSize: '0.78rem' }}>/100</span>
          </p>
        </div>
        <div style={{ height: 5, background: 'rgba(96,165,250,0.12)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${rating.defenseScore}%`, background: '#60a5fa', borderRadius: 3 }} />
        </div>
        <p className="font-karla" style={{ fontSize: '0.84rem', color: '#aebfd4', lineHeight: 1.5 }}>
          How much of a beating you can take. Grows with your ship&apos;s{' '}
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>HP</span> and{' '}
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>Savvy</span> (dodge incoming hits),
          with a little sustain from <span style={{ color: '#f0ede8', fontWeight: 600 }}>Fortune</span> (repair kits).
        </p>
        <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6a60', marginTop: 6 }}>
          <span style={{ color: '#aebfd4', fontWeight: 600 }}>{rating.defense}</span> effective HP buffer.
        </p>
      </div>

      <p className="font-karla" style={{ fontSize: '0.7rem', color: '#7a6a60', lineHeight: 1.45, textAlign: 'center', marginBottom: '1rem' }}>
        Raid Score is the average of Offense and Defense — both matter equally.
      </p>

      {/* How to raise it */}
      <div style={{ padding: '0.85rem 0.95rem', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginBottom: '1rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.74rem', color: '#c8704a', marginBottom: '0.6rem' }}>Raise it by</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {[
            'Recruiting stronger crewmates — more Power, Fortune & Savvy',
            'Leveling up your Nav rank — it boosts every stat',
            'Upgrading your ship — more HP to survive longer',
          ].map(t => (
            <div key={t} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
              <span style={{ color: '#c8704a', fontSize: '0.84rem', lineHeight: 1.45, flexShrink: 0 }}>→</span>
              <p className="font-karla" style={{ fontSize: '0.84rem', color: '#c4bfb6', lineHeight: 1.45 }}>{t}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Your current stats */}
      <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.74rem', color: '#8a8784', marginBottom: '0.5rem' }}>Your stats right now</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {stats.map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.6rem 0.8rem',
            background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
          }}>
            <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.74rem', color: s.color }}>{s.label}</span>
            <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', fontFeatureSettings: '"tnum"' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#6a6764', lineHeight: 1.45, marginTop: '0.7rem' }}>
        Each stat already includes the bonus from your Nav rank.
      </p>
    </>
  )
}
