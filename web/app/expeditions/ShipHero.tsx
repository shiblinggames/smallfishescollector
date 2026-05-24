'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { repairShip } from '@/app/raids/actions'
import { motion, AnimatePresence } from 'framer-motion'
import type { ShipStats } from '@/lib/expeditions'
import { computeCombatRating, computeVoyageScore } from '@/lib/expeditions'
import { SHIP_SKINS } from '@/lib/shipSkins'
import { getRepairKit, repairKitRange } from '@/lib/repairKits'
import { equipShipSkin, saveEquippedRaidItems } from './actions'
import { assignCrew } from '@/app/dev/crew/actions'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { applyCrewEffects, resolveEffects, effectSummary, SCOPE_META } from '@/lib/crewEffects'
import { RARITY_COLORS as CREW_RARITY_COLORS, RARITY_NAMES } from '@/lib/crewGen'
import { RAID_ITEMS, getRaidItem } from '@/lib/raidItems'
import { renameShip } from '@/app/shipyard/actions'
import { getXPProgress, getNavigatorTitle, navLevelBonuses } from '@/lib/expeditionLevel'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

type RosterCrew = {
  id: number
  cardId: number      // catalog card; only one of a given card may be aboard
  name: string
  filename: string
  rarity: number      // 1-4 (fish group)
  power: number       // rolled base stats
  dodge: number
  fortune: number
  effects: string[]
  assignedSlot: number | null
}

const STAT_COLS = [
  { key: 'power'   as const, short: 'PWR', color: '#f87171' },
  { key: 'dodge'   as const, short: 'AGI', color: '#60a5fa' },
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
  const eff = applyCrewEffects({ power: card.power, dodge: card.dodge, fortune: card.fortune }, card.effects)
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
          <p className="font-karla" style={{ fontSize: '0.56rem', color: '#5a6472' }}>No traits</p>
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
  ownedRaidItems: string[]
  equippedRaidItems: string[]
  equippedRepairKit: string
  raidRepairOwed: number
  doubloons: number
}

function DrawerHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0.55rem 0 0.1rem', cursor: 'grab' }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
    </div>
  )
}

function drawerDragProps(onClose: () => void) {
  return {
    drag: 'y' as const,
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
  ownedRaidItems, equippedRaidItems: initialEquippedRaidItems,
  equippedRepairKit,
  raidRepairOwed, doubloons,
}: Props) {
  const router = useRouter()
  const xpProgress = getXPProgress(expeditionXP)

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
      if (c.assignedSlot != null && c.assignedSlot >= 0 && c.assignedSlot < shipStats.crewSlots) {
        arr[c.assignedSlot] = c
      }
    }
    return arr
  })

  // Skin state
  const [equippedSkin, setEquippedSkin] = useState(initialEquippedSkin)

  // Raid item state
  const [equippedItems, setEquippedItems] = useState<string[]>(initialEquippedRaidItems)

  // Loadout drawer section tab. Items first/default — it's the most
  // important loadout decision; cosmetics (skins) live last.
  const [loadoutTab, setLoadoutTab] = useState<'items' | 'skins'>('items')

  // Ship name state
  const [shipName, setShipName] = useState(initialShipName)

  // Modal state
  const [loadoutOpen, setLoadoutOpen] = useState(false)
  const [breakdownScore, setBreakdownScore] = useState<'voyage' | 'raid' | null>(null)

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
    startTransition(async () => { await assignCrew(card.id, slot) })
  }

  function removeFromSlot(i: number, e: React.MouseEvent) {
    e.stopPropagation()
    const crew = slots[i]
    const next = [...slots]; next[i] = null
    setSlots(next); notifyCrewChanged(next)
    if (crew) startTransition(async () => { await assignCrew(crew.id, null) })
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

  // Raid item equip/unequip
  function handleEquipRaidItem(itemId: string) {
    if (equippedItems.includes(itemId)) return
    if (equippedItems.length >= 3) return
    const next = [...equippedItems, itemId]
    setEquippedItems(next)
    startTransition(async () => { await saveEquippedRaidItems(next) })
  }

  function handleUnequipRaidItem(itemId: string) {
    const next = equippedItems.filter(i => i !== itemId)
    setEquippedItems(next)
    startTransition(async () => { await saveEquippedRaidItems(next) })
  }

  // Live scores via the same resolver the server uses (passive/aura/conditional
  // effects + captain/crew weighting). Voyage uses raw crew totals; Raid adds
  // the Nav-level captain bonus — see lib/expeditionLevel.navLevelBonuses.
  const navBonus     = navLevelBonuses(xpProgress.level)
  const deployedParty: DeployedCrew[] = slots
    .map((c, i) => c ? { id: c.id, slot: i, rarity: c.rarity, power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects } : null)
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
      .map((c, i) => c ? { id: c.id, slot: i, rarity: c.rarity, power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects } : null)
      .filter((c): c is DeployedCrew => c !== null)
    return resolveDeployedCrew(party).totals
  }
  const previewSlotsArr = pendingCard ? buildSlotsWith(pendingCard) : slots
  const previewTotals   = pendingCard ? slotsToTotals(previewSlotsArr) : { power: totalPower, dodge: totalDodge, fortune: totalFortune }
  const previewCount    = previewSlotsArr.filter(Boolean).length

  // Skin filter
  const skinDef     = equippedSkin ? SHIP_SKINS.find(s => s.id === equippedSkin) : undefined
  const skinFilter  = skinDef?.filter ?? 'none'

  // Crew available to assign: any roster member not already in another slot
  // (the one already in this slot stays selectable). Sorted by effective stats.
  const effStats = (c: RosterCrew) => applyCrewEffects({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.effects)
  const pickerCards: RosterCrew[] = (() => {
    if (pickerSlot === null) return []
    const inThisSlot = slots[pickerSlot]?.id
    // Cards already aboard in OTHER slots — block picking a second of the same.
    const otherCardIds = new Set(slots.filter((c, idx) => c && idx !== pickerSlot).map(c => c!.cardId))
    const list = roster.filter(c => (!assignedIds.has(c.id) || c.id === inThisSlot) && !otherCardIds.has(c.cardId))
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

        {/* Ship hero — big centered ship with the crew standing on deck */}
        <div style={{ position: 'relative', padding: '1.1rem 1rem 1rem' }}>
          {/* Soft sea-glow backdrop for cohesion */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 60% at 50% 42%, rgba(60,110,180,0.16) 0%, rgba(10,16,28,0) 70%)' }} />

          {/* Name + level */}
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <p className="font-cinzel font-700 truncate" style={{ fontSize: '1.5rem', color: '#f0ede8', lineHeight: 1.1 }}>
              {shipName ?? shipStats.name}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5 }}>
              <span className="font-karla font-600" style={{ fontSize: '0.95rem', color: '#7da0d8', whiteSpace: 'nowrap' }}>
                <span className="font-cinzel font-700">Lv {xpProgress.level}</span>
                <span style={{ color: '#4a5e7a' }}> · </span>
                <span style={{ fontStyle: 'italic', color: '#6a8ab8' }}>{getNavigatorTitle(xpProgress.level)}</span>
              </span>
              <div style={{ width: 84, flexShrink: 0, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${xpProgress.progress * 100}%`, background: 'linear-gradient(90deg, #4a6090 0%, #7da0d8 100%)', borderRadius: 3 }} />
              </div>
            </div>
          </div>

          {/* Ship + crew-on-deck overlay */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 300, margin: '1.1rem auto 0' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shipStats.image}
              alt={shipName ?? shipStats.name}
              style={{ width: '100%', display: 'block', objectFit: 'contain', filter: skinFilter, transition: 'filter 0.3s ease' }}
            />

            {/* Crew on the deck: captain at the helm (own row) with the rest of
                the crew below. `bottom` positions the block over the deck — tune
                this one value if it sits high/low on a given ship hull. */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '13%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              {/* Captain — own row, crowned + labelled */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ position: 'relative' }}>
                  <div aria-hidden style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="#f0c040" stroke="#1a1206" strokeWidth="1.2" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }}>
                      <path d="M5 17h14l1-9-5 3.5L12 5 9 11.5 4 8z" />
                    </svg>
                  </div>
                  {deckSlot(0, 54)}
                </div>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.16em', color: '#f0c040', background: 'rgba(6,9,16,0.82)', padding: '0.1rem 0.45rem', borderRadius: 999, boxShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>Captain</span>
              </div>

              {/* Crew — row(s) below the captain */}
              {slots.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, maxWidth: '94%' }}>
                  {slots.slice(1).map((_, idx) => (
                    <div key={idx + 1}>{deckSlot(idx + 1, 44)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions — recruit crew + manage ship (matched pills, no wrap) */}
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: '0.85rem' }}>
            <Link href="/packs" className="font-karla font-700 uppercase tracking-[0.06em]" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.42rem 0.9rem', fontSize: '0.66rem',
              color: '#9ec6ff', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.38)', borderRadius: 999, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Recruit
            </Link>
            <button onClick={() => setLoadoutOpen(true)} className="font-karla font-700 uppercase tracking-[0.06em]" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.42rem 0.9rem', fontSize: '0.66rem',
              color: '#9ec6ff', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.38)', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2"/><line x1="4" y1="13" x2="20" y2="13"/><circle cx="15" cy="13" r="2"/><line x1="4" y1="19" x2="20" y2="19"/><circle cx="9" cy="19" r="2"/></svg>
              Manage Ship
            </button>
          </div>
          {!hasCrew && (
            <p className="font-karla" style={{ position: 'relative', textAlign: 'center', fontSize: '0.68rem', color: '#5a5248', marginTop: '0.5rem' }}>Tap a slot on deck to add your crew.</p>
          )}
        </div>

        {/* Scores — big, tap a tile for the breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setBreakdownScore('voyage')}
            aria-label="Voyage Score breakdown"
            style={{ background: 'none', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0.9rem 1rem', cursor: 'pointer', textAlign: 'left' }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#7da0d8', marginBottom: 4 }}>Voyage Score</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="font-cinzel font-700" style={{ fontSize: '2.25rem', color: '#f0ede8', lineHeight: 1 }}>{voyageScore}</span>
              <span style={{ fontSize: '0.62rem', color: '#5a5856' }}>ⓘ</span>
            </div>
          </button>
          <button
            onClick={() => setBreakdownScore('raid')}
            aria-label="Raid Score breakdown"
            style={{ background: 'none', border: 'none', padding: '0.9rem 1rem', cursor: 'pointer', textAlign: 'left' }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#d88a6a', marginBottom: 4 }}>Raid Score</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span className="font-cinzel font-700" style={{ fontSize: '2.25rem', color: '#f0ede8', lineHeight: 1 }}>{raidRating.total}</span>
              <span style={{ fontSize: '0.62rem', color: '#5a5856' }}>ⓘ</span>
            </div>
          </button>
        </div>

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
              {...drawerDragProps(closeLoadout)}
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
              <DrawerHandle />
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
              <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '1rem 1rem 5rem' }}>

              {/* Ship preview with skin + rename — large hero image fills
                  the upper area of the drawer. */}
              <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shipStats.image}
                  alt={shipName ?? shipStats.name}
                  style={{
                    width: '100%', maxWidth: 220, height: 'auto',
                    objectFit: 'contain', display: 'block', margin: '0 auto 0.85rem',
                    filter: skinFilter,
                    transition: 'filter 0.3s ease',
                  }}
                />
                {editingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditingName(false) }}
                      maxLength={32}
                      placeholder={shipStats.name}
                      style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(240,192,64,0.45)', borderRadius: 8, padding: '0.4rem 0.7rem', color: '#f0ede8', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', textAlign: 'center', width: 190 }}
                    />
                    <button onClick={submitRename} style={{ background: 'rgba(240,192,64,0.2)', border: '1px solid rgba(240,192,64,0.5)', borderRadius: 8, padding: '0.45rem 0.85rem', color: '#f0c040', cursor: 'pointer', fontSize: '0.78rem' }} className="font-karla font-700">Save</button>
                    <button
                      onClick={() => setEditingName(false)}
                      aria-label="Cancel"
                      style={{
                        flexShrink: 0, width: 30, height: 30, borderRadius: '50%', padding: 0,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
                        color: '#cfcabf', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameInput(shipName ?? ''); setEditingName(true) }}
                    style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0ede8' }}>{shipName ?? shipStats.name}</p>
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4z" />
                        </svg>
                      </span>
                    </span>
                    <span className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'rgba(240,192,64,0.72)' }}>
                      Tap to rename your ship
                    </span>
                  </button>
                )}
              </div>

              {/* Upgrade ship — moved off the hero; lives with the other
                  ship-level actions here. */}
              <Link
                href="/marketplace/shipyard"
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '0.7rem', borderRadius: 10, marginBottom: '1.4rem',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
                  color: '#dfe3e8', fontSize: '0.74rem', textDecoration: 'none',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
                Upgrade Ship
              </Link>

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
                        <img src={shipStats.image} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
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
              {/* ── Repair Kits ── once-per-battle hull patch in the Special
                  action slot. Heal floor stays at the kit's baseMin; max
                  scales with Fortune (FORTUNE_HEAL_SCALE in lib/repairKits).
                  Only one kit exists for now; the section is structured for
                  swap-UI when more arrive. */}
              {(() => {
                const kit = getRepairKit(equippedRepairKit) ?? getRepairKit('basic_repair_kit')!
                const range = repairKitRange(kit, ratedFortune)
                return (
                  <>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>Repair Kit</p>
                    <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginBottom: '0.8rem', lineHeight: 1.45 }}>
                      Used from the Special action in combat. Once per battle, costs the turn.
                    </p>
                    <div style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 14, padding: '0.85rem 0.95rem', marginBottom: '1.5rem',
                      display: 'flex', alignItems: 'center', gap: '0.85rem',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.35)',
                        fontSize: '1.4rem', lineHeight: 1,
                      }}>
                        {kit.image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={kit.image} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                          : <span>{kit.emoji}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8' }}>{kit.name}</p>
                          <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#4ade80' }}>
                            +{range.min}-{range.max} HP
                          </p>
                        </div>
                        <p className="font-karla" style={{ fontSize: '0.7rem', color: '#8a8480', lineHeight: 1.4 }}>
                          {kit.description.replace(/\s*Once per battle\.\s*$/i, '').trim()} Fortune scales the max ({range.max - kit.baseMax > 0 ? `+${range.max - kit.baseMax}` : 'no'} bonus from your {ratedFortune} Fortune).
                        </p>
                      </div>
                    </div>
                  </>
                )
              })()}

              {/* ── Raid Items ── */}
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#d4ba78', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>Raid Items</p>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', marginBottom: '0.8rem', lineHeight: 1.45 }}>
                Equip up to 3. Their effects only apply in raids, not voyages.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', marginBottom: '1.5rem' }}>
                {/* Equip slots */}
                <div style={{ padding: '1rem', borderBottom: ownedRaidItems.length > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.62rem', color: '#8a8480', marginBottom: '0.7rem' }}>Equipped · {equippedItems.length}/3</p>
                  <div style={{ display: 'flex', gap: '0.7rem' }}>
                    {[0, 1, 2].map(i => {
                      const itemId  = equippedItems[i]
                      const itemDef = itemId ? getRaidItem(itemId) : null
                      const color   = itemDef ? RARITY_ITEM_COLOR[itemDef.rarity] : null
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                          {itemDef ? (
                            <>
                              <button
                                onClick={() => handleUnequipRaidItem(itemId!)}
                                style={{ position: 'relative', width: 64, height: 64, borderRadius: 12, background: `${color}11`, border: `1.5px solid ${color}55`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                              >
                                {itemDef.image ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={itemDef.image} alt={itemDef.name} style={{ width: 38, height: 38, objectFit: 'contain' }} />
                                ) : (
                                  <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{itemDef.emoji}</span>
                                )}
                                <div style={{ position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </div>
                              </button>
                              <p className="font-karla font-600 truncate text-center" style={{ fontSize: '0.62rem', color: color ?? '#b8b3ac', maxWidth: 64, lineHeight: 1.2 }}>{itemDef.name}</p>
                            </>
                          ) : (
                            <>
                              <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1.5px dashed rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                              </div>
                              <p className="font-karla font-600 text-center" style={{ fontSize: '0.62rem', color: '#5a5550', maxWidth: 64, lineHeight: 1.2 }}>Empty</p>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Owned items */}
                {ownedRaidItems.length > 0 ? (
                  <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ownedRaidItems.map(itemId => {
                      const def      = getRaidItem(itemId)
                      if (!def) return null
                      const color    = RARITY_ITEM_COLOR[def.rarity]
                      const equipped = equippedItems.includes(itemId)
                      const full     = equippedItems.length >= 3 && !equipped
                      return (
                        <button
                          key={itemId}
                          onClick={equipped ? () => handleUnequipRaidItem(itemId) : full ? undefined : () => handleEquipRaidItem(itemId)}
                          disabled={full}
                          style={{ background: equipped ? `${color}14` : 'rgba(255,255,255,0.04)', border: `1.5px solid ${equipped ? color + '60' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, padding: '0.7rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: full ? 'default' : 'pointer', opacity: full ? 0.45 : 1, width: '100%', textAlign: 'left' }}
                        >
                          {def.image ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={def.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
                          ) : (
                            <span style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0 }}>{def.emoji}</span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: equipped ? color : '#f0ede8', marginBottom: 3 }}>{def.name}</p>
                            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8480', lineHeight: 1.4 }}>{def.description}</p>
                          </div>
                          <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.62rem', color: equipped ? color : '#7a7674', flexShrink: 0 }}>
                            {equipped ? 'Equipped' : full ? 'Full' : 'Equip'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '0.85rem 1rem' }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#6a6460' }}>No items yet. Items drop from raid bosses.</p>
                  </div>
                )}
              </div>
              </>)}
              </div>{/* end scrollable */}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Crew picker — opens from the deck slots OR the loadout drawer, so it
          must live at the top level (not inside the loadout block) to render
          whether or not the drawer is open. Fixed-positioned; z-index 110+
          clears the page Nav and the drawer. */}
      {sheetOpen && (() => {
        const slotAccent = pickerSlot === 0 ? '#f0c040' : '#60a5fa'
        const currentInSlot = pickerSlot !== null ? slots[pickerSlot] : null
        const currentColor = currentInSlot ? (CREW_RARITY_COLORS[currentInSlot.rarity as 1 | 2 | 3 | 4] ?? '#6a6764') : '#6a6764'
        return (
              <>
                <div
                  onClick={closeSheet}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(2,4,8,0.78)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 110 }}
                />
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'fixed', zIndex: 111,
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
                            <img src={IMG_BASE + currentInSlot.filename} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
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
                            <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: s.color, lineHeight: 1 }}>{prev}</p>
                            {showDelta && (
                              <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', lineHeight: 1, marginTop: 3, color: delta > 0 ? '#6ee7a0' : '#f08a8a' }}>{delta > 0 ? '+' : ''}{delta}</p>
                            )}
                            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: '#857f77', marginTop: showDelta ? 3 : 4 }}>{s.short}</p>
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
                          <img src={IMG_BASE + pendingCard.filename} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} />
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
          plugged in so they can see WHY their score is what it is. */}
      <AnimatePresence>
        {breakdownScore && (
          <>
            <motion.div
              key="breakdown-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 110, pointerEvents: 'none' }}
            />
            {/* Full-screen scroll wrapper. The modal can be taller than the
                viewport, so the *wrapper* scrolls (not a nested box) — that
                keeps the top reachable. `margin: auto` on the modal centers
                it when it's short and top-anchors it (still fully
                scrollable) when it's tall. Tapping the empty area closes. */}
            <div
              onClick={e => { if (e.target === e.currentTarget) setBreakdownScore(null) }}
              style={{
                position: 'fixed', inset: 0, zIndex: 111,
                display: 'flex',
                padding: '1rem',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
              }}
            >
              <motion.div
                key="breakdown-modal"
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
            </div>
          </>
        )}
      </AnimatePresence>
    </>
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
  const powerRate   = Math.min(power   / 55, 0.80)
  const fortuneRate = Math.min(fortune / 45, 1)
  const dodgeRate   = Math.min(dodge   / 28, 1)
  const rows = [
    { label: 'Power',   value: power,   rate: powerRate,   cap: 55, color: '#f87171', max: 0.80 },
    { label: 'Agility', value: dodge,   rate: dodgeRate,   cap: 28, color: '#60a5fa', max: 1.00 },
    { label: 'Fortune', value: fortune, rate: fortuneRate, cap: 45, color: '#f0c040', max: 1.00 },
  ]
  return (
    <>
      <BreakdownHeader title="Voyage Score" color="#7090c0" onClose={onClose} />
      <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: '#9a9488', lineHeight: 1.5, marginBottom: '0.85rem' }}>
        Predicts your crew&apos;s odds of clearing hard daily-voyage events.
      </p>

      {/* What contributes */}
      <div style={{
        padding: '0.55rem 0.75rem', marginBottom: '1rem',
        background: 'rgba(112,144,192,0.06)', border: '1px solid rgba(112,144,192,0.18)', borderRadius: 8,
      }}>
        <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#7090c0', marginBottom: 4 }}>What counts</p>
        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#a8b8cc', lineHeight: 1.45 }}>
          <span style={{ color: '#f0ede8' }}>Crew stats only.</span> Nav level and ship don&apos;t affect daily-voyage event rolls.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.95rem' }}>
        {rows.map(r => (
          <div key={r.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: r.color, width: 58, flexShrink: 0 }}>{r.label}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e0ddd8', width: 36, flexShrink: 0 }}>{r.value}</p>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.rate / r.max) * 100}%`, background: r.color, borderRadius: 3 }} />
              </div>
              <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#e0ddd8', width: 44, flexShrink: 0, textAlign: 'right' }}>{Math.round(r.rate * 100)}%</p>
            </div>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#5a5856', marginLeft: 62, marginTop: 1 }}>
              caps at {r.cap}{r.max < 1 ? ` (max ${Math.round(r.max * 100)}%)` : ''}
            </p>
          </div>
        ))}
      </div>

      <div style={{ padding: '0.7rem 0.85rem', background: 'rgba(112,144,192,0.08)', border: '1px solid rgba(112,144,192,0.22)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#9aaecc' }}>Average × 100</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{total}<span style={{ color: '#7090c0', fontSize: '0.7rem' }}> / 100</span></p>
        </div>
      </div>
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
  rating: { offense: number; defense: number; total: number }
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

      <p className="font-karla" style={{ fontSize: '0.88rem', color: '#c4bfb6', lineHeight: 1.55, marginBottom: '1rem' }}>
        How tough your crew is in a raid. The higher it climbs, the
        harder you hit and the longer you survive in a fight.
      </p>

      {/* Offense */}
      <div style={{ padding: '0.85rem 0.95rem', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.24)', borderRadius: 12, marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.8rem', color: '#f87171' }}>Offense</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>{rating.offense}</p>
        </div>
        <p className="font-karla" style={{ fontSize: '0.84rem', color: '#cbb4ad', lineHeight: 1.5 }}>
          The damage you deal. Grows with your crew&apos;s{' '}
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>Power</span>, plus crit
          from raid traits like Keen Cutlass.
        </p>
      </div>

      {/* Defense */}
      <div style={{ padding: '0.85rem 0.95rem', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.24)', borderRadius: 12, marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.8rem', color: '#60a5fa' }}>Defense</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>{rating.defense}</p>
        </div>
        <p className="font-karla" style={{ fontSize: '0.84rem', color: '#aebfd4', lineHeight: 1.5 }}>
          How much of a beating you can take. Grows with your ship&apos;s{' '}
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>HP</span> and{' '}
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>Agility</span> (dodge incoming hits),
          with a little sustain from <span style={{ color: '#f0ede8', fontWeight: 600 }}>Fortune</span> (repair kits).
        </p>
      </div>

      {/* Total */}
      <div style={{ padding: '0.9rem 0.95rem', background: 'rgba(200,112,74,0.11)', border: '1px solid rgba(200,112,74,0.36)', borderRadius: 12, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.8rem', color: '#e8a37a' }}>Raid Score</p>
            <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b88a6e', marginTop: 3 }}>Offense + half your Defense</p>
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '1.75rem', color: '#f0ede8' }}>{rating.total}</p>
        </div>
      </div>

      {/* How to raise it */}
      <div style={{ padding: '0.85rem 0.95rem', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, marginBottom: '1rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.74rem', color: '#c8704a', marginBottom: '0.6rem' }}>Raise it by</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {[
            'Recruiting stronger crewmates — more Power, Fortune & Agility',
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
