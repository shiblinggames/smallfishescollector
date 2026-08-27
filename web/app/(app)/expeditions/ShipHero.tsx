'use client'

import { useState, useTransition, useEffect, useRef, useMemo, Fragment, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import ModalSheet from '@/components/ModalSheet'
import CloseButton from '@/components/CloseButton'
import FinnChargePanel from '@/components/FinnChargePanel'
import ItemEffectLines from '@/components/ItemEffectLines'
import ShipChristening, { type ChristeningData } from '@/components/ShipChristening'
import { finnItemLevel, finnTierNumeral, FINN_ITEM_MAX_LEVEL } from '@/lib/finnItems'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { vibrate, hapticTap, hapticReward } from '@/lib/haptics'
import { RARITY_COLOR as ITEM_RARITY_COLOR } from '@/lib/uiTokens'
import { repairShip } from '@/app/(app)/raids/actions'
import { motion, AnimatePresence, useDragControls, type DragControls } from 'framer-motion'
import type { ShipStats } from '@/lib/expeditions'
import { computeCombatRating, computeVoyageScore, EXPEDITION_SHIP_STATS, getRankTitle, raidItemSlotsForTier } from '@/lib/expeditions'
import { getShipClass, SHIP_CLASS_LINES, aggregateShipClasses, shipRefitCost, type ShipClassId } from '@/lib/shipClasses'
import { navLevelReqForShip } from '@/lib/gearGating'
import { SHIPS, MAX_SHIP_TIER, getShip, nextShip as nextHull, shipTierByName } from '@/lib/ships'
import { SHIP_SKINS } from '@/lib/shipSkins'
import { getRepairKit, repairKitRange, nextRepairKit } from '@/lib/repairKits'
import { getGauntletUpgrade } from '@/lib/gauntletUpgrades'
import { buyRepairKit } from './repairKitActions'
import { equipShipSkin, saveEquippedRaidItems, forgeRaidItem, learnForgeRecipe, markForgeIntroSeen, markShipGuideSeen, startAbyssalConversion, claimAbyssalConversion } from './actions'
import UltimateBuildPanel from './UltimateBuildPanel'
import SixthBerthPanel from './SixthBerthPanel'
import ArmoryExpansionPanel from './ArmoryExpansionPanel'
import ShipRefitPanel from './ShipRefitPanel'
import { IconCrate } from '@/components/GameIcons'
import { getShipAugment, type ShipAugmentId } from '@/lib/shipAugments'
import { bonusChargeSlots, hasForge, hasAbyssalForge, hasAbyssalAccelerator } from '@/lib/gauntletUpgrades'
import { ABYSSAL_ACCEL_GEM_COST, isConversionReady, type AbyssalConversion } from '@/lib/abyssalAccelerator'
import PopupShell from '@/components/PopupShell'
import { assignToVoyage, benchCrew } from '@/app/(app)/crew/actions'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { applyCrewEffects, resolveEffects, effectSummary, SCOPE_META } from '@/lib/crewEffects'
import { RARITY_COLORS as CREW_RARITY_COLORS, RARITY_NAMES } from '@/lib/crewGen'
import { RAID_ITEMS, getRaidItem, FORGE_RECIPES, forgeComponentIds, conflictingRaidItems, isForgedRaidItem, isAbyssalForgedItem, isConvertibleEpic, legendaryForEpic } from '@/lib/raidItems'
import { PRISMATIC_TEXT, prismaticBorder, forgedBorderSoft, forgedTextSoft, ABYSSAL_EMBER_TEXT, abyssalEmberBorder, primevalBorder, PRIMEVAL_TEXT } from '@/lib/prismatic'
import { type ForgeTab } from './ForgeBoard'
// LAZY. The forge board is a heavy panel behind a tab branch, so it never
// needs to parse until a captain actually opens the forge.
const ForgeBoard = dynamic(() => import('./ForgeBoard'), {
  ssr: false,
  loading: () => (
    <div className="font-karla font-700 uppercase tracking-[0.14em]"
      style={{ minHeight: '30vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6a6764', fontSize: '0.7rem' }}>
      Lighting the forge…
    </div>
  ),
})
import LoadoutSummary from './LoadoutSummary'
import { renameShip, buyShip } from '@/app/shipyard/actions'
import { getXPProgress, navLevelBonuses, MAX_LEVEL, getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { renownLevel, renownProgress, spentPoints, type RenownAlloc } from '@/lib/renown'
import { markRenownIntroSeen, type RenownState } from '@/app/(app)/actions/renown'
import RenownPanel from '@/components/RenownPanel'
import SkillLevelHero from '@/components/SkillLevelHero'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import RenownIntroOverlay from '@/components/RenownIntroOverlay'
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
  ancient:   '#e0455a',
  cosmetic:  '#2dd4bf',
}

/** INVENTORY TIERS, best first.
 *
 *  FORGING OUTRANKS RARITY, which is why the two forge tiers sit above the
 *  rarity ladder rather than inside it. An Abyssal is a fusion of fusions, four
 *  boss drops and three forges deep; sorting it under "epic" because that is
 *  the rarity on its def would bury the rarest thing you own among the parts it
 *  was made from.
 *
 *  Below that it is just the rarity ladder, which is the order every other
 *  surface in the game already shows these in. */
const ITEM_TIERS = [
  { key: 'abyssal',   label: 'Abyssal',   color: '#ff7a5c' },
  { key: 'forged',    label: 'Forged',    color: '#c9c0e4' },
  { key: 'ancient',   label: 'Ancient',   color: RARITY_ITEM_COLOR.ancient },
  { key: 'legendary', label: 'Legendary', color: RARITY_ITEM_COLOR.legendary },
  { key: 'epic',      label: 'Epic',      color: RARITY_ITEM_COLOR.epic },
  { key: 'rare',      label: 'Rare',      color: RARITY_ITEM_COLOR.rare },
  { key: 'uncommon',  label: 'Uncommon',  color: RARITY_ITEM_COLOR.uncommon },
  { key: 'common',    label: 'Common',    color: RARITY_ITEM_COLOR.common },
] as const

/** Which shelf an item belongs on. Forge state is checked FIRST and in tier
 *  order, since a tier-3 Abyssal also passes isForgedRaidItem. */
function itemTierKey(id: string): string {
  if (isAbyssalForgedItem(id)) return 'abyssal'
  if (isForgedRaidItem(id)) return 'forged'
  return getRaidItem(id)?.rarity ?? 'common'
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
  /** Crew mid-stint in a Crew Hall bunk. Committed for the whole stint, so they
   *  are kept out of the picker exactly like a crew already at sea. */
  bunkLockedCrewIds?: number[]
  /** Hands who have finished a stint in the hall and are waiting to be
   *  collected. Badges the Crew column so it is visible from the hub. */
  readyBunks?: number
  ownedRaidItems: string[]
  /** Charge on The Primeval Maw. Read-only; the server owns it. */
  borrowedJawXp?: number
  equippedRaidItems: string[]
  equippedRepairKit: string
  ownedRepairKits: string[]
  raidRepairOwed: number
  doubloons: number
  /** chapterId -> classId picks from chapter-end Captain's Choice nodes.
   *  Used to render the "Classes" section in the loadout drawer so the
   *  player can see which classes are buffing their next raid. */
  shipClasses: Record<string, string>
  /** Claimed Davy Jones Gauntlet locker-upgrade ids (display-only here;
   *  buying happens in the Gauntlet shop). */
  gauntletUpgrades?: string[]
  /** Banked Fathoms — spent to LEARN forge recipes here. */
  gauntletFathoms?: number
  /** Gems — spent to charge the Abyssal Accelerator. */
  gems?: number
  /** The Abyssal Accelerator conversion in flight ({ epicId, legendaryId,
   *  completesAt }), or null when idle. */
  abyssalConversion?: AbyssalConversion | null
  /** Forge recipe result-ids the player has already learned. */
  forgeRecipesLearned?: string[]
  /** Whether the one-time "Forge Awakens" celebration has already played. */
  hasSeenForgeIntro?: boolean
  /** Whether the first-time Manage Ship (loadout) guide has already played. */
  hasSeenShipGuide?: boolean
  /** The active (completed) Man-o-War ultimate id, or null. */
  manowarAugment?: string | null
  /** An ultimate build in progress ({ id, completesAt }), or null. */
  manowarBuild?: { id: ShipAugmentId; completesAt: string; retool?: boolean } | null
  /** Owns the Full Schematics — free, instant switching between ultimates. */
  manowarSchematics?: boolean
  /** Cleared Chapter 3 (beat the Quartermaster) — unlocks the ultimate build. */
  chapter3Cleared?: boolean
  /** Cleared Raid 7 (the Blockade) — unlocks the Sixth Berth purchase. */
  blockadeCleared?: boolean
  /** Owns the Sixth Berth (Man-o-War 5 → 6 crew). */
  hasSixthBerth?: boolean
  /** Cleared Raid 8 (the Throne) — unlocks the Expanded Armory purchase. */
  throneCleared?: boolean
  /** The one free class refit has already been spent. Earned by clearing the
   *  throne; see refitShipClasses. */
  /** Refits already taken. The first is free, every one after costs; see
   *  shipRefitCost. */
  shipRefitsUsed?: number
  /** Owns the Expanded Armory (extra raid-item mount). */
  hasArmoryExpansion?: boolean
  /** THE SIXTH MOUNT (Finn spoil). An EXTRA mount that takes exactly one
   *  item, his jaw, so it is deliberately not folded into raidItemSlots. */
  hasSixthMount?: boolean
  /** Render ONE screen as a whole page instead of the hub: the Ship, Items or
   *  Forge routes. Undefined on the hub itself, where this is a section. */
  focus?: 'ship' | 'items' | 'forge'
  isAdmin?: boolean
  /** Persisted Navigation Renown allocations ({} when none). Renown LEVEL
   *  derives live from expeditionXP. */
  navRenownAlloc?: RenownAlloc | null
  /** Whether the one-time "reached 100, meet Renown" intro has already played. */
  seenNavRenownIntro?: boolean
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
    case 'ancient':   return '#e0455a'
    case 'cosmetic':  return '#2dd4bf'
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

// One cell of the Ship tab's 2-column management grid: icon + section label +
// current value + a CTA, tapping opens that section's detail modal.
/** SOLID base for anything sitting on the ship screen's painted backdrop.
 *
 *  The backdrop scrim opens to 28% at the top of the page so the berth art can
 *  be seen at all, which means a panel up there gets almost no help from it. A
 *  translucent panel over painted art does not read as a panel, it reads as a
 *  grey film with a boat behind it, and every surface on this screen was a
 *  4-to-30% wash.
 *
 *  So: tint OVER an opaque colour, never tint INSTEAD of one. Two background
 *  layers, the tint first and the solid second, which is the documented
 *  house pattern for panels on custom backgrounds. */
/** What each ship stat actually does, in the words a new captain would use.
 *
 *  The stats hero showed five numbers and five deltas and explained none of
 *  them, which is worse than showing nothing: a captain could see his hull had
 *  dropped 25 and had no way to find out why, or even what "Mounts" was. Tapping
 *  a stat now opens this, plus the arithmetic behind its delta.
 *
 *  Same shape as the crew card's STAT_ABOUT, deliberately: a player who has
 *  learned to tap a stat on one screen should find the same thing on the other. */
const SHIP_STAT_ABOUT: Record<string, { lead: string; rows: [string, string][] }> = {
  Hull: {
    lead: 'How much punishment your ship takes before it sinks.',
    rows: [
      ['Raids', 'Your health bar for the whole raid, mobs and boss together.'],
      ['Note', 'Some captain classes trade hull away for damage. That shows as a red number.'],
    ],
  },
  Damage: {
    lead: 'The floor on every shot you fire.',
    rows: [
      ['Raids', 'Raises the bottom of your damage range, so bad rolls hurt less.'],
      ['Note', 'Crew Power and raid items stack on top of this.'],
    ],
  },
  Speed: {
    lead: 'How often you act first.',
    rows: [
      ['Raids', 'Feeds the turn-order roll each round. Going first can end a fight before it starts.'],
      ['Note', 'Crew Savvy adds to the same roll.'],
    ],
  },
  Crew: {
    lead: 'How many hands you can take to sea.',
    rows: [
      ['Raids', 'Seats in your raid party. Every seat is another set of stats and another ability.'],
      ['Voyages', 'The same seats crew your voyages.'],
    ],
  },
  Mounts: {
    lead: 'How many raid items you can carry at once.',
    rows: [
      ['Raids', 'Each mount holds one item, and their effects all apply together.'],
      ['Note', "Finn's spoil has its own bay and does not use a mount."],
    ],
  },
}

const SHIP_PANEL = '#0b111b'
// How big each hull draws in the Ship Management hero, as a fraction of the
// box. Uniform-width art means a Rowboat and a Man-o-War would otherwise
// render identically, so the sense of scale that used to come free from
// uneven canvas margins is made explicit here, where it can be tuned.
// Drawn size by hull, so a Sloop does not fill the berth a Man-o-War needs.
// 0 and 1 are kept as aliases of the Sloop for any profile still carrying a
// legacy tier — without them a stale row would draw at full Man-o-War size.
const HERO_TIER_SCALE: Record<number, number> = {
  0: 0.85, 1: 0.85, 2: 0.85, 3: 0.90, 4: 0.94, 5: 0.97, 6: 1,
}

const shipPanelBg = (tint?: string) =>
  tint ? `linear-gradient(${tint}, ${tint}), ${SHIP_PANEL}` : SHIP_PANEL

function ShipTile({ accent, title, value, sub, cta, icon, onClick }: {
  accent: string; title: string; value: string; sub?: string; cta: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', padding: '0.75rem 0.7rem', borderRadius: 13, background: shipPanelBg(`${accent}1c`), border: `1px solid ${accent}4a`, cursor: 'pointer', minHeight: 98 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
        <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: `${accent}20`, border: `1px solid ${accent}50`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: accent, whiteSpace: 'nowrap' }}>{cta}</span>
      </div>
      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: accent }}>{title}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#f0ede8', lineHeight: 1.12 }}>{value}</p>
      {sub && <p className="font-karla" style={{ fontSize: '0.58rem', color: '#8a8480', lineHeight: 1.3 }}>{sub}</p>}
    </button>
  )
}

/** The repair kit landing. Deliberately IN the sheet rather than a full-screen
 *  moment: a kit is a refit, not a new hull, and the Berth and the Armory set
 *  that precedent already. Transform and opacity only, one pass, no loop. */
function KitCelebration({ kitId, fortune, onDone }: { kitId: string; fortune: number; onDone: () => void }) {
  const kit = getRepairKit(kitId)
  const range = kit ? repairKitRange(kit, fortune) : null
  const accent = kit ? kitRarityColor(kit.rarity) : '#7fdfa3'
  useEffect(() => {
    hapticReward()
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <motion.div
data-any-key
      onClick={onDone}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'relative', textAlign: 'center', padding: '1.4rem 1rem 1.2rem', cursor: 'pointer', overflow: 'hidden' }}
    >
      {/* Sparks off the wrench. Nine one-shot elements, gone in under a second. */}
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span key={i} aria-hidden
          initial={{ opacity: 0, y: 10, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], y: -40, x: (i % 2 ? 1 : -1) * (10 + i * 5), scale: 1 }}
          transition={{ duration: 1.05, delay: 0.1 + i * 0.045, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: 54, width: 4, height: 4, borderRadius: '50%', background: accent, pointerEvents: 'none' }} />
      ))}
      <motion.div
        initial={{ scale: 0.5, rotate: -18 }} animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 15, delay: 0.05 }}
        style={{ width: 62, height: 62, margin: '0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${accent}1e`, border: `1px solid ${accent}88` }}
      >
        <WrenchGlyph color={accent} />
      </motion.div>
      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: accent, marginTop: 12 }}>Refit complete</p>
      <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', lineHeight: 1.1, color: '#f4ecd8', marginTop: 4 }}>{kit?.name ?? 'Repair Kit'}</p>
      {range && (
        <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#9fd9b1', marginTop: 8 }}>
          Repairs +{range.min} to +{range.max} HP
        </p>
      )}
      <p className="font-karla uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#7a7674', marginTop: 14 }}>Tap to continue</p>
    </motion.div>
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
  bunkLockedCrewIds = [],
  readyBunks = 0,
  ownedRaidItems, equippedRaidItems: initialEquippedRaidItems, borrowedJawXp = 0,
  equippedRepairKit: initialEquippedRepairKit,
  ownedRepairKits: initialOwnedRepairKits,
  raidRepairOwed, doubloons,
  shipClasses,
  gauntletUpgrades = [],
  gauntletFathoms = 0,
  gems: initialGems = 0,
  abyssalConversion: initialConversion = null,
  forgeRecipesLearned = [],
  hasSeenForgeIntro = true,
  hasSeenShipGuide = true,
  manowarAugment: initialManowarAugment = null,
  manowarBuild = null,
  manowarSchematics = false,
  chapter3Cleared = false,
  blockadeCleared = false,
  hasSixthBerth = false,
  throneCleared = false,
  shipRefitsUsed = 0,
  hasArmoryExpansion = false,
  hasSixthMount = false,
  focus,
  isAdmin = false,
  navRenownAlloc = null,
  seenNavRenownIntro = true,
}: Props) {
  const router = useRouter()
  const xpProgress = getXPProgress(expeditionXP)
  // Navigation Renown (post-100). Level derives from expeditionXP; the spend
  // map is stateful so the bar badge updates when the panel allocates.
  const [navRenownAllocState, setNavRenownAllocState] = useState<RenownAlloc>(navRenownAlloc ?? {})
  const [renownOpen, setRenownOpen] = useState(false)
  const navRenownLevel = renownLevel('nav', expeditionXP)
  const navRenownAvailable = Math.max(0, navRenownLevel - spentPoints('nav', navRenownAllocState))
  const navRenownState: RenownState = {
    skill: 'nav', level: navRenownLevel,
    spent: spentPoints('nav', navRenownAllocState),
    available: navRenownAvailable, alloc: navRenownAllocState,
      // The panel refetches these on open; a bar built from page-load props
    // cannot know a live gem balance.
    respecs: 0, gems: 0,
  }
  // Blink the nav bar when there's a reason to tap it — a new Nav level not yet
  // viewed (blue), or an unspent Renown point (gold). "Seen" level is remembered
  // per device, cleared on tap.
  const [navLevelSeen, setNavLevelSeen] = useState(999)
  useEffect(() => { setNavLevelSeen(Number(localStorage.getItem('sf_nav_level_seen') || 0)) }, [])
  // One-time "reached Nav 100, meet Renown" intro. The hub is always visited,
  // so showing it here on mount catches both existing maxed captains and anyone
  // who just crossed 100 out in a raid or voyage.
  const [navRenownIntro, setNavRenownIntro] = useState(false)
  const navIntroCheckedRef = useRef(false)
  useEffect(() => {
    if (navIntroCheckedRef.current) return
    navIntroCheckedRef.current = true
    if (!seenNavRenownIntro && xpProgress.level >= MAX_LEVEL) {
      const t = setTimeout(() => setNavRenownIntro(true), 700)
      return () => clearTimeout(t)
    }
  }, [seenNavRenownIntro, xpProgress.level])

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
  // Set when a Renown point is actually spent, so closing the panel untouched costs
  // nothing. See the RenownPanel onClose below.
  const renownDirtyRef = useRef(false)
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
  // The kit that was just bought, held so the modal can show it landing before
  // it closes. The Berth and the Armory both already do this (BerthCelebration,
  // ArmoryCelebration); the kit was the one refit that just shut the sheet.
  const [kitWon, setKitWon] = useState<string | null>(null)
  async function doBuyKit() {
    setKitBusy(true); setKitErr(null)
    try {
      const res = await buyRepairKit()
      if ('error' in res) { setKitErr(res.error); return }
      setKitEquipped(res.equippedRepairKit); setKitsOwned(res.ownedRepairKits)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      // Show it landing, THEN close. router.refresh() is deferred to the
      // celebration's own dismiss so the panel does not re-render underneath it.
      setKitWon(res.equippedRepairKit)
    } finally { setKitBusy(false) }
  }

  // The Christening plays once on a hull purchase. Captured BEFORE router.refresh
  // lands the new ship, because by then the old one is gone and there is nothing
  // to say goodbye to.
  const [christening, setChristening] = useState<ChristeningData | null>(null)
  /** Which ship stat's explainer is open. */
  const [shipStatDetail, setShipStatDetail] = useState<string | null>(null)

  const shipTierForSlots = shipTierByName(shipStats.name)
  // Hull cap + the Ch4 Expanded Armory refit's extra mount (purchased flag),
  // plus any legacy class-pick itemSlots (none in production).
  const raidItemSlots = raidItemSlotsForTier(shipTierForSlots) + (aggregateShipClasses(shipClasses).itemSlots) + (hasArmoryExpansion ? 1 : 0)
  // THE SIXTH MOUNT is kept OUT of raidItemSlots on purpose, mirroring the
  // server: his item is not competing for a hull slot, it has its own bay.
  // So the grid below counts and shows only ordinary gear.
  const mountIds = new Set(RAID_ITEMS.filter(i => i.finaleSlotOnly).map(i => i.id))
  const mountedFinale = equippedItems.find(id => mountIds.has(id)) ?? null
  const hullItems = equippedItems.filter(id => !mountIds.has(id))
  // The Maw carries its power on its CHARGE, which only reaches getActiveEffects
  // through the id tag the server adds. Without tagging here the summary would
  // quietly total it as zero (its def deliberately has no flat effects).
  const chargedEquippedIds = equippedItems.map(id =>
    id === 'borrowed_jaw' ? `borrowed_jaw#${finnItemLevel(borrowedJawXp)}` : id)
  const ownedFinale = ownedRaidItems.filter(id => mountIds.has(id))
  // DISPLAY ONLY. The mount is not a hull slot and must stay out of every cap
  // check (toggleItem, saveEquippedRaidItems, getRaidPlayerStats all split it
  // off), but to the player it is plainly a sixth slot sitting in the same
  // grid, so the counter says 6/6 rather than 5/5 with a stray cell beside it.
  const slotsTotal  = raidItemSlots + (hasSixthMount ? 1 : 0)
  const slotsFilled = hullItems.length + (mountedFinale ? 1 : 0)

  // Ultimate weapon (Man-o-War Mega) — the end-of-Chapter-3 build. Its four-gate
  // checklist, previews, 24h build clock, and re-pick flow all live inside
  // UltimateBuildPanel; here we just gather its inputs. The section appears once
  // Chapter 3 is cleared (admins always see it) — the panel itself explains any
  // remaining requirements.
  const navLevelNow = navLevelFromXP(expeditionXP)
  const hasRack = bonusChargeSlots(gauntletUpgrades) > 0
  const showUltimate = chapter3Cleared || isAdmin
  // The Forge is a major Gauntlet (Fathom) unlock — locked → a teaser, not the recipes.
  const forgeUnlocked = hasForge(gauntletUpgrades)
  // Tier-3 (Abyssal) recipes ride Don's separate unlock. Until it's owned the
  // board hides them entirely rather than dangling recipes nobody can learn.
  const abyssalUnlocked = hasAbyssalForge(gauntletUpgrades)
  // The Abyssal Accelerator (epic→legendary transmutation bench) rides its own
  // Don's unlock on top of the Abyssal Forge.
  const acceleratorUnlocked = hasAbyssalAccelerator(gauntletUpgrades)
  const forgeUpg = getGauntletUpgrade('forge')

  // Manage Ship section tab. Loadout (the battle decision) first; Ship
  // (upgrade / class / repair) next; cosmetic Skins last.
  // On a focused route the panel IS the page: it opens on that section and
  // never closes.
  // Ship screen sub-tabs. The seven refits used to sit in one flat 2-column
  // grid where the HULL, the upgrade the whole screen exists for, was a tile
  // like any other. Hull is now its own centred CTA above these.
  const [shipTab, setShipTab] = useState<'refits' | 'armament' | 'appearance'>('refits')
  const [loadoutTab, setLoadoutTab] = useState<'loadout' | 'ship' | 'forge'>(focus === 'items' ? 'loadout' : focus === 'forge' ? 'forge' : focus === 'ship' ? 'ship' : 'loadout')

  // Ship name state
  const [shipName, setShipName] = useState(initialShipName)

  // Modal state
  const [loadoutOpen, setLoadoutOpen] = useState(!!focus)
  // Tapped an EQUIPPED loadout slot: open a detail modal (effect + Unequip)
  // instead of removing it outright. Holds the equipped item id being viewed.
  const [itemDetail, setItemDetail] = useState<string | null>(null)
  /** The equip picker, opened by tapping an empty hull slot. */
  const [pickerOpen, setPickerOpen] = useState(false)
  // The locked mount explains itself on tap rather than wearing a label. A
  // permanent caption on a slot most players will never fill is clutter.
  const [mountNote, setMountNote] = useState(false)
  // The at-a-glance "Active Loadout" summary — every equipped item + effect.
  const [effectsOpen, setEffectsOpen] = useState(false)

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
  // Captain's-class detail popup — the owned tier ids of the tapped class line.
  const [classDetail, setClassDetail] = useState<ShipClassId[] | null>(null)
  // Ship-tab detail modals — the Ship tab is now a 2-column grid of tiles; each
  // tile opens its section here (ultimate build/preview, sixth berth, the class
  // breakdowns, the skin picker).
  const [ultimateOpen, setUltimateOpen] = useState(false)
  const [sixthBerthOpen, setSixthBerthOpen] = useState(false)
  const [armoryOpen, setArmoryOpen] = useState(false)
  const [classesOpen, setClassesOpen] = useState(false)
  const [refitOpen, setRefitOpen] = useState(false)
  const [skinsOpen, setSkinsOpen] = useState(false)
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

  // Lock the page behind a SHEET only. On a focused route loadoutOpen is
  // permanently true (the panel IS the page), so locking here would freeze the
  // document and leave the whole screen unscrollable.
  useEffect(() => {
    document.body.style.overflow = ((loadoutOpen && !focus) || sheetOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [loadoutOpen, sheetOpen, focus])

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
      const detail = (e as CustomEvent<{ mode?: 'campaign' | 'voyage'; pickSlot?: number; tab?: 'loadout' | 'ship' | 'forge' }>).detail
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
      if (detail?.tab) setLoadoutTab(detail.tab)
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
    startTransition(async () => {
      await equipShipSkin(skinId)
      // The hero sprite up here is local state and updates instantly. The STORY MAP's
      // Captain's-Choice nodes are not: page.tsx derives playerShipImage from
      // profile.equipped_ship_skin and threads it into RaidsSection, so without this
      // they keep drawing the old hull.
      router.refresh()
    })
  }

  // Raid items are an inventory-first toggle: the whole owned collection is
  // shown in the drawer and tapping an item equips/unequips it directly (no
  // per-slot picker — effects stack regardless of position, so "slots" are
  // just a capacity cap). Tap an equipped item to free it; unequipped items
  // gray out once the hull is full. Server caps + validates ownership.
  function toggleItem(itemId: string) {
    const equipped = equippedItems.includes(itemId)
    hapticTap() // equip/unequip is already optimistic — give the tap a tick too
    let next: string[]
    if (equipped) {
      next = equippedItems.filter(id => id !== itemId)
    } else {
      // Tiered drops (Corsair/Prime, Krust's/Captain's Carapace, the Primers,
      // the Astrolabes) don't stack, and a forged item can't sit beside its own
      // ingredients — equipping one supersedes the conflicting item(s), so swap
      // them out first instead of letting both sit equipped (which reads like
      // they add up).
      const conflicts = conflictingRaidItems(itemId, equippedItems)
      const base = conflicts.length ? equippedItems.filter(id => !conflicts.includes(id)) : equippedItems
      // His jaw goes to its own mount and never fills a hull slot.
      if (!mountIds.has(itemId) && base.filter(id => !mountIds.has(id)).length >= raidItemSlots) return // hull full — no-op
      next = [...base, itemId]
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
  // The cinematic forge overlay: holds the two component images + the result
  // while the merge animation plays. `forgeReady` flips once the server forge
  // lands so the reveal can settle on confirmed success.
  const [forgeFx, setForgeFx] = useState<{ compImages: (string | null)[]; result: { name: string; image: string | null }; accent: string; abyssal: boolean } | null>(null)
  const [forgeReady, setForgeReady] = useState(false)
  // ── Abyssal Accelerator (epic→legendary transmutation) ──────────────────────
  // Single-slot 24h conversion, mirrored from the server prop with an optimistic
  // resync; the claim reveal reuses the ForgeAnimation overlay.
  const [conversion, setConversion] = useState<AbyssalConversion | null>(initialConversion)
  useEffect(() => { setConversion(initialConversion) }, [initialConversion])
  const [gemsNow, setGemsNow] = useState(initialGems)
  useEffect(() => { setGemsNow(initialGems) }, [initialGems])
  const [converting, setConverting] = useState(false)
  const [claimingConv, setClaimingConv] = useState(false)
  // Recipe learning (the Fathom sink). Mirror the server props into state for
  // optimistic updates, resyncing if the server sends fresh props (admin grants,
  // a Gauntlet run banking Fathoms, etc.) — see [[feedback-usestate-prop-sync]].
  const [learnedRecipes, setLearnedRecipes] = useState<string[]>(forgeRecipesLearned)
  useEffect(() => { setLearnedRecipes(forgeRecipesLearned) }, [forgeRecipesLearned])
  const [fathomsNow, setFathomsNow] = useState(gauntletFathoms)
  useEffect(() => { setFathomsNow(gauntletFathoms) }, [gauntletFathoms])
  const [learning, setLearning] = useState<string | null>(null)
  // Two-tap confirm for learning a recipe (spends Fathoms) — first tap ARMS,
  // second within 3s confirms. Prevents an accidental tap from burning Fathoms.
  const [learnArmed, setLearnArmed] = useState<string | null>(null)
  // The prismatic "Recipe Unlocked" celebration payload (null = closed).
  const [learnReveal, setLearnReveal] = useState<{ name: string; image: string | null } | null>(null)
  function onLearnTap(resultId: string, cost: number) {
    if (learning || !forgeUnlocked || fathomsNow < cost || learnedRecipes.includes(resultId)) return
    // First tap arms the confirm; second tap (within the window) commits.
    if (learnArmed !== resultId) {
      setLearnArmed(resultId)
      vibrate(10)
      setTimeout(() => setLearnArmed(a => (a === resultId ? null : a)), 3000)
      return
    }
    setLearnArmed(null)
    setLearning(resultId)
    vibrate(12)
    startTransition(async () => {
      const res = await learnForgeRecipe(resultId)
      setLearning(null)
      if ('error' in res) return
      setLearnedRecipes(res.learned)
      setFathomsNow(res.fathoms)
      const item = getRaidItem(resultId)
      if (item) setLearnReveal({ name: item.name, image: item.image })
      vibrate([14, 46, 22])
    })
  }
  // One-time "The Forge Awakens" celebration — fires the first time the player
  // opens the Forge tab after it's unlocked. Persisted server-side (tour
  // convention: has_seen_forge_intro), mirrored to state for the optimistic hide.
  const [seenForgeIntro, setSeenForgeIntro] = useState(hasSeenForgeIntro)
  useEffect(() => { setSeenForgeIntro(hasSeenForgeIntro) }, [hasSeenForgeIntro])
  const [showForgeIntro, setShowForgeIntro] = useState(false)
  // Reopenable "How the Forge works" help modal.
  const [showForgeHelp, setShowForgeHelp] = useState(false)
  useEffect(() => {
    if (loadoutTab === 'forge' && forgeUnlocked && !seenForgeIntro) {
      setShowForgeIntro(true)
      setSeenForgeIntro(true)
      void markForgeIntroSeen().catch(() => {})
    }
  }, [loadoutTab, forgeUnlocked, seenForgeIntro])

  // First-time Manage Ship guide — steps through the loadout tabs the first time
  // the drawer opens, switching to and flashing each one. Forge step only if it's
  // unlocked. Marked seen the moment it starts.
  const shipGuideSteps = useMemo(() => {
    const steps: { tab: 'loadout' | 'ship' | 'forge'; portrait: string; speaker: string; text: string }[] = [
      { tab: 'loadout', portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "*Items* is your battle setup. Equip raid items here before a fight, and tap an empty slot to fill it." },
      { tab: 'ship',    portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "*Ship* is where you buy and upgrade your hull. A bigger ship means more crew slots and firepower." },
    ]
    if (forgeUnlocked) steps.push({ tab: 'forge', portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "The *Forge* fuses two raid items into a single stronger one." })
    return steps
  }, [forgeUnlocked])
  const [shipGuideStep, setShipGuideStep] = useState<number | null>(null)
  const shipGuideFiredRef = useRef(false)
  useEffect(() => {
    if (loadoutOpen && !hasSeenShipGuide && !shipGuideFiredRef.current) {
      shipGuideFiredRef.current = true
      setShipGuideStep(0)
      void markShipGuideSeen().catch(() => {})
    }
  }, [loadoutOpen, hasSeenShipGuide])
  useEffect(() => { if (!loadoutOpen) setShipGuideStep(null) }, [loadoutOpen])
  useEffect(() => {
    if (shipGuideStep == null) return
    const s = shipGuideSteps[shipGuideStep]
    if (s) setLoadoutTab(s.tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipGuideStep])
  const flashLoadoutTab = shipGuideStep != null ? (shipGuideSteps[shipGuideStep]?.tab ?? null) : null
  function onForgeTap(resultId: string) {
    if (forging || !forgeUnlocked) return
    if (forgeArmed !== resultId) {
      setForgeArmed(resultId)
      setTimeout(() => setForgeArmed(a => (a === resultId ? null : a)), 3000)
      return
    }
    setForgeArmed(null)
    setForging(resultId)
    const recipe = FORGE_RECIPES.find(r => r.result === resultId)
    const result = getRaidItem(resultId)
    if (recipe && result) {
      setForgeReady(false)
      setForgeFx({
        compImages: recipe.components.map(id => getRaidItem(id)?.image ?? null),
        result: { name: result.name, image: result.image ?? null },
        accent: (ITEM_RARITY_COLOR as Record<string, string>)[result.rarity] ?? '#f0c040',
        abyssal: recipe.tier === 3,
      })
      vibrate(16)   // confirm tick; the clash haptic + SFX fire in the animation
    }
    startTransition(async () => {
      const res = await forgeRaidItem(resultId)
      setForging(null)
      if ('error' in res) { setForgeFx(null); return }
      setForgeReady(true)
    })
  }

  // Charge the Accelerator with an owned epic → starts the 24h transmutation.
  function onStartConvert(epicId: string) {
    if (converting || conversion || !acceleratorUnlocked) return
    if (!legendaryForEpic(epicId) || gemsNow < ABYSSAL_ACCEL_GEM_COST) return
    setConverting(true)
    vibrate([0, 14, 40, 22])
    startTransition(async () => {
      const res = await startAbyssalConversion(epicId)
      setConverting(false)
      if ('error' in res) return
      setConversion(res.conversion)
      setGemsNow(res.gems)
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems }))
      vibrate([0, 30, 40, 60])
      router.refresh()   // resync ownedRaidItems (the epic was consumed)
    })
  }

  // Claim a finished conversion → reuse the ForgeAnimation for the reveal.
  function onClaimConvert() {
    if (claimingConv || !conversion || !isConversionReady(conversion, Date.now())) return
    setClaimingConv(true)
    const epicImg = getRaidItem(conversion.epicId)?.image ?? null
    const legendary = getRaidItem(conversion.legendaryId)
    startTransition(async () => {
      const res = await claimAbyssalConversion()
      setClaimingConv(false)
      if ('error' in res) return
      setConversion(null)
      if (legendary) {
        setForgeFx({
          compImages: [epicImg],
          result: { name: legendary.name, image: legendary.image ?? null },
          accent: (ITEM_RARITY_COLOR as Record<string, string>)[legendary.rarity] ?? '#f0c040',
          abyssal: true,
        })
        setForgeReady(true)   // claim already resolved server-side — reveal straight away
      }
      vibrate([14, 46, 22, 60])
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
  // The Ship Management hero draws from public/ship-hero/, where every hull has
  // been trimmed to its own edges and re-exported at one width (normalize-ships.mjs).
  // The originals carry huge, uneven transparent margins baked in (a rowboat
  // fills 40% of its canvas, a man-o-war 65%) and object-fit: contain fits the
  // CANVAS, so the screen looked mostly empty and each hull sat somewhere
  // different. Everything else still points at the originals, which RaidCombat
  // and the shipyard are laid out against.
  // Guarded: ShipStats.image falls back to '' for a tier with no art, and an
  // unguarded basename would ask for /ship-hero/ and 404.
  const shipHeroSrc = shipImgSrc ? `/ship-hero/${shipImgSrc.split('/').pop()}` : shipImgSrc

  // Each screen gets its own backdrop now that Items and Forge are their own
  // routes rather than tabs on the ship sheet. All three are lamplit INTERIORS
  // in the same key — the berth, the arms locker, the smithy — so they read as
  // three doors off one deck rather than two rooms and a postcard, and so one
  // scrim can suit all of them. The drawer (launch prep, which still shows
  // every section) keeps the berth.
  const SECTION_BG: Record<'loadout' | 'ship' | 'forge', string> = {
    loadout: '/items-bg.jpg',
    forge:   '/forge-bg.jpg',
    ship:    '/ship-loadout-bg.jpg',
  }
  const sectionBg = focus ? SECTION_BG[loadoutTab] : '/ship-loadout-bg.jpg'

  // Which forge bench is showing. ForgeBoard owns the tabs; the hero above
  // them lives here, so the tab reports up and the icon/title follow it.
  const [forgeTab, setForgeTab] = useState<ForgeTab>(2)
  const forgeMolten = forgeTab === 3 || forgeTab === 'accel'
  const forgeHero = forgeTab === 'accel'
    ? { icon: '/forge/accelerator.png', title: 'The Accelerator', blurb: 'Give it one epic relic and a day. It hands back the legendary.' }
    : forgeTab === 3
      ? { icon: '/forge/abyssal_forge.png', title: 'The Abyssal Forge', blurb: 'Fuse forged relics into Abyssal mounts. One slot, both sets.' }
      : { icon: '/forge/forge.png', title: 'The Forge', blurb: 'Fuse two relics into one. One slot, both sets of effects.' }

  // How much forge STOCK you hold: owned items that actually feed a recipe.
  // A count you can act on beats a state word (open) that never changes.
  const forgeStock = useMemo(() => {
    const parts = new Set(forgeComponentIds())
    return ownedRaidItems.filter(id => parts.has(id)).length
  }, [ownedRaidItems])

  // Crew and Items both cycle their thumbnail through what you own, off ONE
  // timer so the two tiles turn together instead of drifting into a flicker.
  // 2.6s read as a strobe; this is slow enough to actually look at.
  const CYCLE_MS = 5200
  const crewArt = useMemo(
    () => roster.map(c => IMG_BASE + c.filename).filter(Boolean),
    [roster],
  )
  const itemsArt = useMemo(
    () => ownedRaidItems.map(id => getRaidItem(id)?.image).filter((s): s is string => !!s),
    [ownedRaidItems],
  )
  const [cycleTick, setCycleTick] = useState(0)
  useEffect(() => {
    if (Math.max(crewArt.length, itemsArt.length) < 2) return
    const t = setInterval(() => setCycleTick(n => n + 1), CYCLE_MS)
    return () => clearInterval(t)
  }, [crewArt.length, itemsArt.length])
  const crewCycleArt  = crewArt.length  > 0 ? crewArt[cycleTick % crewArt.length]   : null
  const itemsCycleArt = itemsArt.length > 0 ? itemsArt[cycleTick % itemsArt.length] : null

  // Crew available to assign: any roster member not already in another slot
  // (the one already in this slot stays selectable). Sorted by effective stats.
  const effStats = (c: RosterCrew) => applyCrewEffects({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.effects, c.xp)
  const pickerCards: RosterCrew[] = (() => {
    if (pickerSlot === null) return []
    const inThisSlot = slots[pickerSlot]?.id
    // Cards already aboard in OTHER slots — block picking a second of the same.
    const otherCardIds = new Set(slots.filter((c, idx) => c && idx !== pickerSlot).map(c => c!.cardId))
    // Crew out on a trawl are reserved at sea — keep them out of the picker.
    // Same for a hand mid-stint in a hall bunk: the server refuses the seat
    // (assertCanReassign), so offering them was offering a guaranteed error.
    const trawlingSet = new Set(trawlingCrewIds)
    const bunkedSet = new Set(bunkLockedCrewIds)
    const list = roster.filter(c => (!assignedIds.has(c.id) || c.id === inThisSlot) && !otherCardIds.has(c.cardId) && !trawlingSet.has(c.id) && !bunkedSet.has(c.id))
    const score = (c: RosterCrew) => {
      const e = effStats(c)
      return sortBy ? e[sortBy] : e.power + e.dodge + e.fortune
    }
    return [...list].sort((a, b) => score(b) - score(a))
  })()

  return (
    <>
      {/* The hub only renders when this is a SECTION. A focused route shows
          one screen and nothing else. */}
      {!focus && (<>
      {/* ── Ship hero — NO card container. Its contents (Nav XP bar, crew
          lineup, ship sprite, and the two Manage pills) float directly on the
          page's epic seascape background. A soft dark pool behind the content
          (below) lifts legibility without a hard card edge. ── */}
      <div style={{
        marginBottom: '1.5rem',
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
        <div style={{ position: 'relative', padding: '1.1rem 0 1rem' }}>

          {/* Nav level hero — the WHOLE panel is one tap target: the Nav-level
              info modal (captain stats) below max, the Renown board at max.
              SkillLevelHero is shared with the Fishing hub, so the two page
              tops are the same object rather than two that look alike. */}
          {(() => {
            const atMax = xpProgress.level >= MAX_LEVEL
            const rn = atMax ? renownProgress('nav', expeditionXP) : null
            const fillPct = atMax ? (rn ? rn.progress * 100 : 100) : xpProgress.progress * 100
            const toGo = Math.max(0, xpProgress.xpForLevel - xpProgress.xpInLevel)
            const hasNavPoints = atMax && navRenownAvailable > 0
            const hasUnseenLevel = xpProgress.level > navLevelSeen
            const pulse = hasNavPoints || hasUnseenLevel
            const pc = hasNavPoints ? '#f0c040' : '#7da0d8'
            const markSeen = () => { setNavLevelSeen(xpProgress.level); try { localStorage.setItem('sf_nav_level_seen', String(xpProgress.level)) } catch {} }
            // XP remaining to the next Renown level (compact "45k"), shown at max
            // when there are no points already waiting to spend.
            const toNextRenown = rn ? rn.span - rn.into : 0
            const renownXpLabel = toNextRenown >= 1000 ? `${Math.round(toNextRenown / 1000)}k` : `${toNextRenown}`
            return (
              <SkillLevelHero
                label="Navigation"
                level={xpProgress.level}
                progress={fillPct / 100}
                atMax={atMax}
                pulse={pulse}
                pulseColor={pc}
                barKey={atMax ? `rn-${rn?.level ?? 0}` : xpProgress.level}
                ariaLabel={atMax ? 'Open Navigation Renown' : 'Show navigation level info'}
                onClick={() => { markSeen(); (atMax ? setRenownOpen(true) : setNavInfoOpen(true)) }}
                trailing={atMax && rn ? (
                  <span className="font-karla font-700 shrink-0" style={{ fontSize: '0.66rem', color: '#f0c040', lineHeight: 1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    ✦ R{rn.level}
                    {hasNavPoints ? (
                      <motion.span
                        animate={{ scale: [1, 1.12, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ fontSize: '0.56rem', color: '#ffdb7a', background: 'rgba(240,200,80,0.18)', border: '1px solid rgba(240,200,80,0.5)', borderRadius: 999, padding: '2px 6px', fontWeight: 800 }}>{navRenownAvailable} spend</motion.span>
                    ) : (
                      <span style={{ fontWeight: 600, color: 'rgba(240,192,64,0.68)' }}>· {renownXpLabel} xp</span>
                    )}
                  </span>
                ) : (
                  <span className="font-karla font-600 shrink-0"
                    style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.72)', textAlign: 'right', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {`${toGo.toLocaleString()} xp`}
                  </span>
                )}
                footer={(
                  <>
                {/* ── The quarterdeck ── one bar, four stations.
                    These were four separate translucent cards with their own
                    borders, blur and shadows, each holding a 42px thumbnail. On a
                    page that is now a hero panel over a painting with art-forward
                    tiles under it, that was the last of the old chrome, and five
                    bordered rectangles stacked down the screen with the tiles below
                    made the top of the page all frame and no picture.

                    One surface now, and not merely a matching one: it is INSIDE
                    the level panel, under the same hairline the Fishing hub hangs
                    its market ticker on. Sitting 0.9rem below with a duplicate of
                    the hero's border, radius and shadow, it read as two objects
                    that happened to agree rather than one header.

                    Split by hairlines into four stations. The art is the biggest
                    thing in each and it is the same size in all four, which the old
                    thumbnails never were: the ship needed a 140% hack to look level
                    with a crew portrait, and still did not.

                    Each caption says something TRUE rather than filler. "Manage
                    upgrades" told you nothing; the hull's name is right there and is
                    what you actually want to know. */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  // No chrome of its own: it lives inside the level panel now, and
                  // that panel owns the background, border, radius and lift.
                  overflow: 'hidden',
                }}>
                  {([
                    {
                      key: 'crew',
                      label: 'Crew',
                      sub: readyBunks > 0 ? `${readyBunks} trained` : crewLevelUpNudge ? 'Levelled up' : `${roster.length} aboard`,
                      nudge: crewLevelUpNudge || readyBunks > 0,
                      count: readyBunks,
                      art: crewCycleArt,
                      fit: 'cover' as const,
                      locked: false,
                    },
                    {
                      key: 'ship',
                      label: 'Ship',
                      // The HULL CLASS, not the custom name. A station is ~108px
                      // wide and "The Salty Revenge" truncates to nothing useful,
                      // while the class is always short, always changes when you
                      // upgrade, and is the thing the Ship screen is about.
                      sub: shipStats.name,
                      nudge: false, count: 0,
                      art: shipImgSrc,
                      fit: 'plate' as const,
                      locked: false,
                    },
                    {
                      key: 'items',
                      label: 'Items',
                      sub: newRaidItems.size > 0 ? 'New gear' : `${slotsFilled}/${slotsTotal} mounted`,
                      nudge: newRaidItems.size > 0, count: 0,
                      art: itemsCycleArt,
                      fit: 'contain' as const,
                      locked: false,
                    },
                    {
                      key: 'forge',
                      label: 'Forge',
                      sub: forgeUnlocked ? `${forgeStock} held` : 'Locked',
                      nudge: false, count: 0,
                      art: abyssalUnlocked ? '/forge/abyssal_forge.png' : '/forge/forge.png',
                      fit: 'contain' as const,
                      locked: !forgeUnlocked,
                    },
                  ] as const).map((row, idx) => {
                    const inner = (
                      <>
                        {/* One art box, one size, all four. objectFit differs because
                            a crew PORTRAIT is a framed face and wants cropping, while
                            a hull and an anvil are objects and want containing. */}
                        <div style={{ position: 'relative', width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 5 }}>
                          {row.art
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={row.art} alt="" aria-hidden loading="lazy" decoding="async"
                                style={
                                  row.fit === 'cover'
                                    ? { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center', border: '1px solid rgba(255,255,255,0.16)', filter: row.locked ? 'grayscale(0.9) brightness(0.7)' : undefined }
                                  : row.fit === 'plate'
                                    // The hull PLATES are 600x335 with the ship
                                    // filling only 52% to 65% of the width, so
                                    // object-fit sizes the empty canvas and a
                                    // Brigantine drew 27x22 next to a 40px crew
                                    // portrait. Size the CANVAS instead: at 92 wide
                                    // the hull lands at 48x38, a Man-o-War at 60x47.
                                    ? { width: 92, maxWidth: 'none', height: 'auto', filter: row.locked ? 'grayscale(0.9) brightness(0.7)' : 'drop-shadow(0 3px 7px rgba(0,0,0,0.6))' }
                                    : { maxWidth: 52, maxHeight: 46, objectFit: 'contain', filter: row.locked ? 'grayscale(0.9) brightness(0.7)' : 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))' }
                                } />
                            : null}
                          {row.locked && (
                            <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b97a8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            </span>
                          )}
                          {/* The nudge rides the ART, not the label: at this width a
                              badge beside the title would push the title into an
                              ellipsis. */}
                          {row.count > 0 ? (
                            <span aria-label={`${row.count} ready`} className="crew-levelup-dot font-karla font-800" style={{
                              position: 'absolute', top: -1, right: '18%',
                              minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999,
                              background: '#ffd96a', border: '1px solid rgba(0,0,0,0.55)',
                              color: '#231a06', fontSize: '0.58rem', lineHeight: '14px', textAlign: 'center',
                            }}>{row.count}</span>
                          ) : row.nudge ? (
                            <span aria-hidden className="crew-levelup-dot" style={{ position: 'absolute', top: 1, right: '20%', width: 7, height: 7, borderRadius: '50%', background: '#ffd96a', border: '1px solid rgba(0,0,0,0.55)' }} />
                          ) : null}
                        </div>

                        <p className="font-cinzel font-700" style={{ width: '100%', fontSize: '0.8rem', lineHeight: 1.1, color: row.locked ? '#79828f' : '#f0ede8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.label}
                        </p>
                        <p className="font-karla font-600" style={{ width: '100%', marginTop: 1, fontSize: '0.62rem', lineHeight: 1.25, color: row.nudge ? '#ffd96a' : '#9aa3b1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.sub}
                        </p>
                      </>
                    )
                    const style = {
                      display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
                      padding: '0.7rem 0.3rem 0.75rem', textAlign: 'center' as const,
                      // Hairlines BETWEEN, no border around each: the bar is one
                      // object, and four outlines inside one outline is the look
                      // this was trying to get away from.
                      borderLeft: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      textDecoration: 'none', cursor: row.locked ? 'default' : 'pointer',
                      opacity: row.locked ? 0.66 : 1,
                      minWidth: 0, width: '100%', font: 'inherit', background: 'none',
                      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' as const,
                    }
                    const href = row.key === 'crew' ? '/crew?tab=assign' : `/expeditions/${row.key}`
                    if (row.locked) {
                      return <div key={row.key} aria-label="Forge. Locked until you unlock it in the Gauntlet." style={style}>{inner}</div>
                    }
                    return (
                      <Link key={row.key} href={href} className="hub-manage-tap"
                        data-coach={row.key === 'crew' ? 'crew' : row.key === 'ship' ? 'ship' : undefined}
                        style={style}>
                        {inner}
                      </Link>
                    )
                  })}
                </div>
                  </>
                )}
              />
            )
          })()}

        </div>

        {/* Score badges moved into the Loadout drawer + the hub
            modals — Ship Hero now stays focused on ship identity +
            crew/items management. The numbers live where the player
            actually makes decisions (during prep, not at-a-glance). */}

      </div>
      </>)}

      {/* ── Loadout drawer ── */}
      <AnimatePresence>
        {loadoutOpen && (
          <>
            {/* Backdrop. z-index 100 to clear the page Nav (which is z:50).
                A focused route has nothing behind it to dim, and no dismiss. */}
            {!focus && (
            <motion.div
              key="loadout-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }}
              onClick={closeLoadout}
            />
            )}

            {/* Drawer. z-index 101 so the modal paints above the page Nav
                (also z:50). Using explicit top + bottom (instead of maxHeight)
                hard-anchors the drawer top — it can never extend above the
                page Nav, so the sticky LOADOUT header is always reachable.
                Nav is 44px mobile / 64px desktop; 80px from top gives a
                clean gap below it. The framer-motion animation slides the
                drawer up from below; at rest it occupies top:80 → bottom:0. */}
            <motion.div
              key="loadout-drawer"
              initial={focus ? false : { y: '100%' }} animate={{ y: 0 }} exit={focus ? undefined : { y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              {...(focus ? {} : drawerDragProps(closeLoadout, loadoutDragControls))}
              style={{
                ...(focus
                  ? { position: 'relative' as const, minHeight: 'calc(100dvh - 44px)' }
                  : { position: 'fixed' as const,
                      top: 'max(80px, env(safe-area-inset-top, 0px) + 20px)',
                      bottom: 0,
                      left: 'max(0px, calc(50% - 240px))',
                      right: 'max(0px, calc(50% - 240px))',
                      zIndex: 101 }),
                // Painted backdrop (fixed behind the drawer) under a scrim that
                // OPENS AT THE TOP and closes toward the foot.
                //
                // It used to be a flat 0.74 -> 0.95 wash, set that heavy for one
                // reason: the ship plate was a pale dawn exterior and needed
                // crushing. The same scrim then applied to the arms locker and
                // the smithy, which are already dark, so two good plates were
                // buried to solve a third plate's problem. The ship plate is now
                // a lamplit berth in the same key as the other two, so the wash
                // no longer has to fight the art.
                //
                // It stays graded rather than uniformly light because most cards
                // on this screen are still rgba(255,255,255,0.03-0.08) washes and
                // need a dark ground to read as cards at all.
                //
                // 0.28 -> 0.44 at the top. Opening it that far was too far: the
                // ship screen's content sits high on the page, so panels landed
                // where the wash was thinnest and the berth read straight
                // THROUGH them. The Ship tab's own panels are opaque now (see
                // shipPanelBg), but Loadout and Forge share this backdrop and
                // their surfaces are still translucent, so the scrim carries
                // them. 0.44 still shows the hull, the lanterns and the moonlit
                // opening — that was checked against the plate at 0.74 / 0.46 /
                // 0.28 / 0.12 before picking.
                //
                // Solid colour fallback while the image loads.
                backgroundColor: '#060c14',
                // The scrim is per-tab now, because these three screens want
                // different amounts of picture.
                //
                // Ship and Loadout are screens you READ: a hull with its stats,
                // or a grid of relics you are comparing. A painted berth behind
                // them competed with exactly the thing you came to look at, so
                // both are now nearly solid, with only enough of the plate left
                // to say where you are. Loadout goes darkest of the three: it is
                // the densest grid and its item art is small and often dark.
                //
                // Forge keeps the open wash. It is a single object on a plate
                // rather than a list, so the art is not in the way there.
                backgroundImage: `linear-gradient(180deg, ${
                  loadoutTab === 'loadout' ? 'rgba(6,9,15,0.90) 0%, rgba(4,7,12,0.95) 42%, rgba(2,4,8,0.98)'
                  : loadoutTab === 'ship'  ? 'rgba(6,10,18,0.84) 0%, rgba(5,8,14,0.92) 42%, rgba(3,5,9,0.97)'
                  : 'rgba(6,10,18,0.44) 0%, rgba(5,8,14,0.78) 42%, rgba(3,5,9,0.94)'
                } 100%), url(${sectionBg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
                backgroundRepeat: 'no-repeat',
                borderTop: focus ? 'none' : '1px solid rgba(255,255,255,0.12)',
                borderRadius: focus ? 0 : '18px 18px 0 0',
                display: 'flex', flexDirection: 'column',
                overflow: focus ? 'visible' : 'hidden',
              }}
            >
              {!focus && <DrawerHandle controls={loadoutDragControls} />}
              {/* Sticky header — outside the scroll container so the close
                  button never scrolls off-screen. */}
              <div className={focus ? 'page-col' : undefined} style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: focus ? '1.1rem 0 0.85rem' : '0.25rem 1rem 0.7rem',
                borderBottom: focus ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}>
                {/* On a ROUTE this is a page header, so it matches Crew
                    Management: a font-pirata title with a status chip beside
                    it. In the drawer it stays the small section label, which is
                    all a sheet needs. */}
                {focus ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <h1 className="font-pirata" style={{ fontSize: '1.7rem', letterSpacing: '0.03em', color: '#f0ede8', whiteSpace: 'nowrap' }}>
                      {focus === 'ship' ? 'Ship Management' : focus === 'forge' ? forgeHero.title : 'Battle Loadout'}
                    </h1>
                    {(() => {
                      const chip = focus === 'items' ? `${slotsFilled} / ${slotsTotal} mounted`
                        : focus === 'ship' ? (shipName ?? shipStats.name)
                        : forgeUnlocked ? `${forgeStock} component${forgeStock === 1 ? '' : 's'} held` : 'Locked'
                      const warn = focus === 'items' ? slotsFilled >= slotsTotal : focus === 'forge' && !forgeUnlocked
                      return (
                        <span className="font-karla font-700" style={{
                          fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: warn ? '#f2b0b0' : '#c8b890',
                        }}>{chip}</span>
                      )
                    })()}
                  </div>
                ) : (
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#a8a39c' }}>{loadoutMode !== null ? 'Loadout' : loadoutTab === 'forge' ? 'Forge' : loadoutTab === 'ship' ? 'Ship' : 'Items'}</p>
                )}
                {focus ? (
                  <Link href="/expeditions" aria-label="Back to expeditions" style={{ color: '#e0ddd8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '50%', width: 32, height: 32, textDecoration: 'none' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
                  </Link>
                ) : (
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
                )}
              </div>
              {/* overflowX MUST be stated. With only overflowY set, CSS computes
                  the other axis to 'auto' rather than 'visible', so the
                  inventory rail's edge-to-edge bleed (a negative margin, wider
                  than this box) made the whole drawer drag sideways. */}
              {/* On a ROUTE the document scrolls, so this stops being a scroll
                  box. Both axes have to go visible together: set only one and
                  CSS computes the other to auto, which re-creates the box. */}
              {/* ON A ROUTE, THE STANDARD COLUMN. Everything below was
                  proportioned inside the drawer, which is pinned to 480px wide
                  — so on a route, where nothing constrained it, the same markup
                  stretched across the whole monitor and every tuned number was
                  wrong at once. `.page-col` is the app-wide measure; see
                  globals.css. */}
              <div className={focus ? 'page-col' : undefined} style={focus
                ? { paddingBottom: '6rem' }
                : { flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: '1rem 1rem 6rem' }}>

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

              {/* Hero — ship portrait + name (inline rename). Upgrade, class,
                  and repair all moved into the Ship tab so the header is a clean
                  identity strip and each concern has its own home. */}
              {(loadoutTab === 'ship' || loadoutMode !== null) && (() => {
                return (
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    {/* The old 78% / 230px was measured against art that only
                        filled 40-65% of its own canvas, so a rowboat drew about
                        92px wide. Trimming the art meant the same numbers would
                        have drawn far bigger, and 96% / 360px on top of that
                        overshot into near full-bleed. These are set against the
                        TRIMMED art: what you see is what the number says. */}
                    <div style={{
                      position: 'relative', display: 'inline-block',
                      width: `${80 * (HERO_TIER_SCALE[shipTierForSlots] ?? 1)}%`,
                      maxWidth: 258 * (HERO_TIER_SCALE[shipTierForSlots] ?? 1),
                    }}>
                      {/* A LIGHT BEHIND THE HULL. The backdrop is a lamplit berth
                          and the ship models are dark timber, so the ship was a
                          dark shape on a dark shape. This is a lantern pool
                          behind it: it separates the hull without putting a
                          plate or a box around it, and it belongs in a boathouse.
                          Static gradient, no animation, costs nothing. */}
                      <div aria-hidden style={{
                        position: 'absolute', left: '-18%', right: '-18%', top: '-10%', bottom: '-16%',
                        background: 'radial-gradient(ellipse 62% 58% at 50% 52%, rgba(255,214,150,0.20) 0%, rgba(120,160,210,0.10) 42%, transparent 72%)',
                        pointerEvents: 'none',
                      }} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shipHeroSrc}
                        alt={shipName ?? shipStats.name}
                        loading="lazy"
                        decoding="async"
                        // Drop-shadow APPENDED to the skin's own filter, never
                        // replacing it: a skin that recolours the hull still has
                        // to recolour it. Static, so it rasterises once.
                        style={{ position: 'relative', width: '100%', height: 'auto', objectFit: 'contain', display: 'block', filter: `${skinFilter === 'none' ? '' : skinFilter + ' '}drop-shadow(0 8px 18px rgba(0,0,0,0.85)) drop-shadow(0 0 3px rgba(0,0,0,0.7))`, transition: 'filter 0.3s ease' }}
                      />
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

                  </div>
                )
              })()}

              {/* ── Section tabs ── ONLY for launch prep, where the player is
                  reviewing everything before committing and genuinely moves
                  between items and ship. Entering from a manage row is a
                  single destination, so it shows no tabs: that row IS the
                  navigation. */}
              {loadoutMode !== null && (
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
                  ['loadout', 'Loadout'],
                  ['ship', 'Ship'],
                  ['forge', 'Forge'],
                ] as const).map(([id, label]) => {
                  const active = loadoutTab === id
                  const locked = id === 'forge' && !forgeUnlocked
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setLoadoutTab(id)}
                      className={`font-cinzel font-700 uppercase tracking-[0.06em]${flashLoadoutTab === id ? ' coach-flash coach-flash-gold' : ''}`}
                      style={{
                        flex: 1, padding: '0.55rem', borderRadius: 9,
                        border: active ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
                        cursor: 'pointer', fontSize: '0.78rem',
                        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: active ? '#f0ede8' : 'rgba(240,237,232,0.42)',
                        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      {locked && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.75 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      )}
                      {label}
                    </button>
                  )
                })}
              </div>
              )}

              {/* Ship Skins moved to the BOTTOM of the Ship tab (cosmetic, least
                  important) and condensed into a single scrollable row — see the
                  Ship-tab block further down. */}

              {loadoutTab === 'loadout' && (<>
              {/* ── Battle Loadout ── the ACTIVE equipped items shown as real
                  slots, so what's equipped reads at a glance. Tap a filled slot
                  to remove it; equip from the Inventory below. Effects stack —
                  any item in any slot — so the slots are just capacity. */}
              {/* The hero: what everything mounted actually adds up to. The slots
                  below say WHAT you carry; this says what it comes to, which is
                  the question you opened the page with. */}
              <LoadoutSummary equippedIds={chargedEquippedIds} onOpenEffects={() => setEffectsOpen(true)} />
              {/* Names the SECTION, matching the Inventory divider below, so the
                  two halves of the page read as a pair. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.8rem' }}>
                <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.22em', color: '#8794a6' }}>Equipped</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: '#c4b078' }}>{slotsFilled}/{slotsTotal} slots</span>
              </div>
              {/* THREE across, so the full six read as two tidy rows instead of
                  a tall stack of wide rows. Same art-first language as the
                  inventory rail and the boss cards: the piece IS the tile, the
                  name sits under it clipped to one line. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: '1.6rem' }}>
                {Array.from({ length: raidItemSlots }, (_, i) => {
                  const itemId = hullItems[i]
                  const def = itemId ? getRaidItem(itemId) : null
                  if (def && itemId) {
                    const color = RARITY_ITEM_COLOR[def.rarity] ?? '#9ca3af'
                    const forged = isForgedRaidItem(itemId)
                    const abyssal = isAbyssalForgedItem(itemId)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setItemDetail(itemId)}
                        aria-label={`${def.name}, equipped. Tap for its effect and an unequip option.`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, padding: '0.5rem 0.35rem 0.45rem', borderRadius: 12, cursor: 'pointer', font: 'inherit', touchAction: 'manipulation', ...(forged ? { ...forgedBorderSoft('rgba(14,18,26,0.92)', abyssal), boxShadow: abyssal ? '0 0 14px rgba(255,90,60,0.26)' : '0 0 12px rgba(150,140,180,0.18)' } : { background: `${color}14`, border: `1.5px solid ${color}66` }) }}
                      >
                        <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {def.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={def.image} alt="" loading="lazy" decoding="async" className={abyssal ? 'rod-glow-abyssal' : undefined} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: `drop-shadow(0 3px 9px ${color}66)` }} />
                            : <span style={{ color, display: 'flex' }}><IconCrate size={26} /></span>}
                        </div>
                        <span className="font-karla font-600" style={{ display: 'block', width: '100%', fontSize: '0.58rem', lineHeight: 1.2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...(forged ? forgedTextSoft(abyssal) : { color: '#cfc9c0' }) }}>{def.name}</span>
                      </button>
                    )
                  }
                  // An empty slot is the obvious place to tap when you want to
                  // fill it, so it opens the picker. It used to be an inert div,
                  // which meant the ONLY way to equip was to scroll past the
                  // slots to a list further down the drawer.
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      aria-label="Empty slot. Tap to choose an item to equip."
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 84, padding: '0.5rem 0.35rem', borderRadius: 12, border: '1.5px dashed rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', font: 'inherit', touchAction: 'manipulation' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7d8894" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#7d8894' }}>Equip</span>
                    </button>
                  )
                })}
                {/* THE EXTRA MOUNT. Drawn as a real cell in the same grid so it
                    sits with its neighbours, but LOCKED until his gear is
                    aboard. It explains itself on tap instead of carrying a
                    caption, because a permanent label on a slot most players
                    never fill is just clutter. */}
                {hasSixthMount && (() => {
                  const jaw = ownedFinale[0] ?? null
                  const def = jaw ? getRaidItem(jaw) : null
                  const BRASS = '#e0a44a'         // the art's warm halo
                  const ANCIENT = '#e0455a'      // the ancient rarity, matching the slot border
                  if (def && mountedFinale) {
                    return (
                      <button type="button" onClick={() => setItemDetail(mountedFinale)}
                        aria-label={`${def.name}, mounted. Tap for its effect and an unmount option.`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, padding: '0.5rem 0.35rem 0.45rem', borderRadius: 12, cursor: 'pointer', font: 'inherit', touchAction: 'manipulation', ...primevalBorder('rgba(20,11,13,0.92)') }}>
                        {/* The tier rides the ART as a corner chip. The line
                            below belongs to the NAME, the same as every other
                            filled cell, or this one reads as an item called
                            "Tier I" sitting where its siblings say what they are. */}
                        <div style={{ position: 'relative', width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {def.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={def.image} alt="" decoding="async" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: `drop-shadow(0 3px 9px ${BRASS}66)` }} />
                            : <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{def.emoji}</span>}
                          <span className="font-cinzel font-700" style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', letterSpacing: '0.03em', color: BRASS, background: 'rgba(10,8,4,0.88)', border: `1px solid ${BRASS}77` }}>
                            {finnTierNumeral(finnItemLevel(borrowedJawXp))}
                          </span>
                        </div>
                        <span className="font-karla font-600" style={{ display: 'block', width: '100%', fontSize: '0.58rem', lineHeight: 1.2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...PRIMEVAL_TEXT }}>{def.name}</span>
                      </button>
                    )
                  }
                  if (def) {
                    return (
                      <button type="button" onClick={() => toggleItem(def.id)}
                        aria-label={`Mount ${def.name}`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, minHeight: 84, padding: '0.5rem 0.35rem', borderRadius: 12, cursor: 'pointer', font: 'inherit', touchAction: 'manipulation', ...primevalBorder('rgba(17,10,12,0.74)', true) }}>
                        <div style={{ width: '100%', height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {def.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={def.image} alt="" decoding="async" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', opacity: 0.75 }} />
                            : <span style={{ fontSize: '1.3rem', lineHeight: 1, opacity: 0.7 }}>{def.emoji}</span>}
                        </div>
                        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: ANCIENT }}>Mount</span>
                      </button>
                    )
                  }
                  return (
                    <button type="button" onClick={() => setMountNote(v => !v)}
                      aria-label="Locked mount. Tap to see what it accepts."
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 84, padding: '0.5rem 0.35rem', borderRadius: 12, cursor: 'pointer', font: 'inherit', touchAction: 'manipulation', ...primevalBorder('rgba(15,9,11,0.68)', true) }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ANCIENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      {mountNote
                        ? <span className="font-karla" style={{ fontSize: '0.48rem', lineHeight: 1.3, color: '#9a948a', textAlign: 'center' }}>Takes only The Primeval Maw</span>
                        : <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: ANCIENT }}>Locked</span>}
                    </button>
                  )
                })()}
              </div>

              {/* ── Inventory ── everything you own, art first, on ONE rail that
                  scrolls sideways. It used to be a vertical stack of wide rows
                  carrying a two-line description each, which pushed a modest
                  collection well past the fold. Tap a tile for the full detail
                  and its equip action. */}
              {(() => {
                // EVERYTHING you own, the finale mount piece included. It used
                // to be filtered out because it goes to its own cell rather than
                // a hull slot, which was fine while the list was one flat grid
                // and nothing claimed otherwise. Grouping by tier made the
                // omission load-bearing: The Primeval Maw is the ONLY ancient in
                // the game, so filtering it left an Ancient shelf that could
                // never fill and an inventory that quietly disowned the rarest
                // thing a captain can hold.
                const owned = ownedRaidItems
                const full = hullItems.length >= raidItemSlots
                if (ownedRaidItems.length === 0) {
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.6rem' }}>
                        <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.22em', color: '#8794a6' }}>Inventory</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 14, padding: '1.7rem 1rem', margin: '0.7rem 0 1.6rem' }}>
                        <p className="font-karla text-center" style={{ fontSize: '0.8rem', color: '#7a7470', lineHeight: 1.55 }}>No items yet.<br />Clear raids to earn them.</p>
                      </div>
                    </>
                  )
                }
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.6rem' }}>
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.22em', color: '#8794a6' }}>Inventory</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: '#8a8480' }}>{owned.length} owned</span>
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.7rem', color: full ? '#d8a14a' : '#8a8480', marginBottom: '0.7rem', lineHeight: 1.45 }}>
                      {full ? 'Hull full. Tap an equipped item to free its slot.' : 'Tap an item for its effect and to equip it.'}
                    </p>
                    {/* GROUPED BY TIER, best shelf first, then THREE COLUMNS
                        growing DOWN within each.

                        The columns replaced a horizontal scroller, which hid
                        most of an inventory off the right edge and put two
                        items you wanted to compare a swipe apart. The grouping
                        is the same argument one level up: a flat grid in
                        acquisition order scattered the pieces that matter among
                        the commons, so the only way to find your Abyssal was to
                        recognise its art. Now the shelf says what it is. */}
                    {(() => {
                      const tile = (itemId: string) => {
                        const def = getRaidItem(itemId)
                        if (!def) return null
                        const color = RARITY_ITEM_COLOR[def.rarity] ?? '#9ca3af'
                        const abyssal = isAbyssalForgedItem(itemId)
                        const forged = isForgedRaidItem(itemId)
                        const isNew = newRaidItems.has(itemId)
                        const on = equippedItems.includes(itemId)
                        // Same-family grades and a fusion's own ingredients do not
                        // stack, so equipping one SWAPS rather than costing a slot.
                        // That stays available on a full hull, and the tile says so.
                        // A mount piece never occupies a hull slot, so a full
                        // hull cannot block it and it has nothing to swap with.
                        // What CAN stop it is not owning the mount yet.
                        const isMount = mountIds.has(itemId)
                        const wouldSwap = !on && !isMount && conflictingRaidItems(itemId, equippedItems).length > 0
                        const blocked = !on && (isMount ? !hasSixthMount : full && !wouldSwap)
                        return (
                          <button
                            key={itemId}
                            type="button"
                            onClick={() => setItemDetail(itemId)}
                            aria-label={`${def.name}${on ? ', equipped' : blocked ? ', hull full' : ''}. Tap for details.`}
                            style={{
                              width: '100%', minWidth: 0,
                              display: 'flex', flexDirection: 'column', gap: 4,
                              padding: 0, background: 'none', border: 'none',
                              cursor: 'pointer', font: 'inherit',
                              opacity: blocked ? 0.45 : 1, transition: 'opacity 0.15s',
                              touchAction: 'manipulation',
                            }}
                          >
                            <div style={{
                              position: 'relative', width: '100%', height: 78,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {def.image
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={def.image} alt="" loading="lazy" decoding="async" className={abyssal ? 'rod-glow-abyssal' : undefined} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: `drop-shadow(0 3px 10px ${color}66)` }} />
                                : <span style={{ color, display: 'flex' }}><IconCrate size={34} /></span>}
                              {on && (
                                <span style={{ position: 'absolute', top: 2, right: 2, width: 17, height: 17, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,20,14,0.86)', border: '1px solid rgba(74,222,128,0.65)' }}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                                </span>
                              )}
                              {isNew && !on && (
                                <span className="font-karla font-700 uppercase" style={{ position: 'absolute', top: 2, left: 2, fontSize: '0.44rem', letterSpacing: '0.08em', color: '#1a1206', background: '#ffd96a', borderRadius: 4, padding: '0.1rem 0.26rem' }}>New</span>
                              )}
                            </div>
                            <span className="font-karla font-800 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', textAlign: 'center', color: on ? '#7fd49a' : wouldSwap ? '#d8a14a' : blocked ? '#6a6764' : color }}>
                              {on ? 'Equipped' : wouldSwap ? 'Swap' : blocked ? (isMount ? 'No mount' : 'Full') : isMount ? 'Mount' : 'Equip'}
                            </span>
                            <span className="font-karla font-600" style={{ display: 'block', width: '100%', fontSize: '0.6rem', lineHeight: 1.25, textAlign: 'center', color: forged ? '#c9c0e4' : '#b9b3a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {def.name}
                            </span>
                          </button>
                        )
                      }
                      // Alphabetical inside a shelf: acquisition order means
                      // nothing once the shelf has already answered "how good is
                      // it", and a stable order means an item does not move
                      // under your thumb when you equip it.
                      const groups = ITEM_TIERS
                        .map(t => ({
                          ...t,
                          items: owned
                            .filter(id => itemTierKey(id) === t.key)
                            .sort((a, b) => (getRaidItem(a)?.name ?? '').localeCompare(getRaidItem(b)?.name ?? '')),
                        }))
                        .filter(g => g.items.length > 0)
                      return (
                        <div style={{ marginBottom: '1.6rem' }}>
                          {groups.map(g => (
                            <div key={g.key} style={{ marginBottom: '1.05rem' }}>
                              {/* Quieter than the Equipped/Inventory dividers on
                                  purpose: this sits INSIDE Inventory, so it must
                                  not read as a third section of the page. */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                                <span className="font-karla font-800 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.18em', color: g.color }}>{g.label}</span>
                                <div style={{ flex: 1, height: 1, background: `${g.color}2e` }} />
                                <span className="font-karla font-700" style={{ fontSize: '0.54rem', color: '#6f6a63', fontVariantNumeric: 'tabular-nums' }}>{g.items.length}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                                {g.items.map(tile)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </>
                )
              })()}

              </>)}

              {loadoutTab === 'forge' && (<>
              {/* The Forge — its own tab, locked until the 'forge' Gauntlet upgrade
                  is bought (depth 30+). Shows ALL recipes with their state (locked
                  / learned / ready / forged) so the whole collection reads at a
                  glance, forged ones kept as prismatic trophies. */}
              <div style={{ position: 'relative', textAlign: 'center', marginBottom: '1.15rem', paddingTop: 2 }}>
                <div aria-hidden style={{ position: 'absolute', left: '50%', top: 2, width: 230, height: 150, transform: 'translateX(-50%)', background: forgeMolten ? 'radial-gradient(ellipse at center, rgba(255,60,50,0.26), rgba(180,20,50,0.12) 44%, transparent 72%)' : forgeUnlocked ? 'radial-gradient(ellipse at center, rgba(255,140,60,0.2), rgba(197,139,255,0.1) 45%, transparent 72%)' : 'radial-gradient(ellipse at center, rgba(125,176,208,0.13), transparent 70%)', filter: 'blur(2px)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', width: 116, height: 116, margin: '0 auto 10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(forgeMolten ? abyssalEmberBorder('rgba(10,6,10,0.92)') : forgeUnlocked ? prismaticBorder('rgba(12,16,24,0.9)') : { background: 'rgba(18,28,40,0.6)', border: '1px solid rgba(125,176,208,0.3)' }) }}>
                  {/* Painted icon rather than a line glyph, matching the boons.
                      The Abyssal tier gets its own molten anvil; locked reads as
                      the plain forge, drained. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={forgeHero.icon}
                    alt="" aria-hidden decoding="async"
                    style={{ width: 94, height: 94, objectFit: 'contain', filter: forgeUnlocked ? undefined : 'grayscale(0.85) brightness(0.62)' }}
                  />
                </div>
                {!focus && (<p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.05, ...(forgeMolten ? ABYSSAL_EMBER_TEXT : forgeUnlocked ? PRISMATIC_TEXT : { color: '#d4ba78' }) }}>{forgeHero.title}</p>)}
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a948a', marginTop: 3, lineHeight: 1.4, maxWidth: 320, marginInline: 'auto', minHeight: '2.05rem' }}>{forgeHero.blurb}</p>
                {forgeUnlocked && (
                  <button type="button" onClick={() => setShowForgeHelp(true)} className="font-karla font-700 uppercase tracking-[0.12em] tap"
                    style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.32rem 0.7rem', borderRadius: 999, fontSize: '0.54rem', color: abyssalUnlocked ? '#ff9a7c' : '#c9a7ff', background: abyssalUnlocked ? 'rgba(255,90,60,0.09)' : 'rgba(197,139,255,0.08)', border: `1px solid ${abyssalUnlocked ? 'rgba(255,90,60,0.32)' : 'rgba(197,139,255,0.3)'}`, cursor: 'pointer' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                    How it works
                  </button>
                )}
              </div>

              {!forgeUnlocked ? (
                <div className="app-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 9, border: '1px solid rgba(125,176,208,0.34)', background: 'rgba(18,28,40,0.55)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: '#8fb6d6' }}>Locked</p>
                    {forgeUpg && <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.54rem', color: '#7fd0ff' }}>{forgeUpg.cost} Fathoms</span>}
                  </div>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f5ecd6', lineHeight: 1.1 }}>Unlock the Forge in the Gauntlet</p>
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b0aaa0', lineHeight: 1.45 }}>
                    A major unlock earned deep in the Davy Jones Gauntlet{forgeUpg ? `: reach depth ${forgeUpg.depthRequired}, then spend ${forgeUpg.cost} Fathoms.` : '.'} Then learn recipes here and fuse your rarest relics.
                  </p>
                </div>
              ) : (
                /* The board. The forge is a CONTESTED GRAPH (17 recipes, 13
                   components, 11 of them feeding 2+ recipes), so ForgeBoard leads
                   with what you can forge NOW, then your parts and what each one
                   can become, then the whole collection as a wall of medallions. */
                <ForgeBoard
                  abyssalUnlocked={abyssalUnlocked}
                  raidItemSlots={raidItemSlots}
                  ownedRaidItems={ownedRaidItems}
                  learnedRecipes={learnedRecipes}
                  fathomsNow={fathomsNow}
                  forging={forging}
                  forgeArmed={forgeArmed}
                  learning={learning}
                  learnArmed={learnArmed}
                  onForgeTap={onForgeTap}
                  onLearnTap={onLearnTap}
                  acceleratorUnlocked={acceleratorUnlocked}
                  conversion={conversion}
                  gemsNow={gemsNow}
                  convertBusy={converting}
                  claimBusy={claimingConv}
                  onStartConvert={onStartConvert}
                  onClaimConvert={onClaimConvert}
                  onTabChange={setForgeTab}
                />
              )}

              </>)}

              {loadoutTab === 'ship' && (<>
              {(() => {
                const shipTier = shipTierByName(shipStats.name)
                const nextShip = nextHull(shipTier)
                // ONE HEIGHT FOR EVERY TAB. The three tabs hold different numbers
                // of tiles (Refits up to 3, Armament up to 2, Look 1), so the grid
                // grew and shrank and the whole page jumped under your thumb as
                // you switched. Reserve the tallest tab's height for all of them,
                // computed from what THIS captain has unlocked rather than
                // hardcoded, so an early player is not staring at reserved space
                // for refits they cannot buy yet.
                const tabTileCounts = [
                  1 + ((blockadeCleared || hasSixthBerth) ? 1 : 0) + ((throneCleared || hasArmoryExpansion) ? 1 : 0),
                  (showUltimate ? 1 : 0) + 1,
                  1,
                ]
                // Reserved height at BOTH column counts, because the grid is
                // 2-across on a phone and 3-across on a desktop and CSS cannot
                // count the tiles to work the rows out for itself.
                const maxTiles = Math.max(...tabTileCounts)
                const reserve = (cols: number) => {
                  const rows = Math.ceil(maxTiles / cols)
                  return rows * 98 + (rows - 1) * 10
                }
                return (
                  <>
                    {/* ── THE SHIP, AND WHAT YOU HAVE DONE TO IT ──────────────
                        Three things, in the order they matter:

                          1. the STATS HERO, which is the only place the player
                             can see what their refits have actually bought. Each
                             row prints the hull's own number and the amount your
                             upgrades added on top, because "Hull 60" alone tells
                             you nothing about whether the last 40,000 doubloons
                             did anything.
                          2. the HULL upgrade, centred and full width. It is the
                             upgrade this screen exists for and it used to be a
                             tile in a grid of seven, indistinguishable from a
                             skin picker.
                          3. everything else, behind tabs, grouped by what it
                             does rather than dumped in one flat grid. */}
                    {(() => {
                      const cls = aggregateShipClasses(shipClasses)
                      // BASE MEANS THE BARE HULL, so read it from the tier table
                      // rather than from the shipStats prop.
                      //
                      // ShipHeroSection hands this component a shipStats whose
                      // crewSlots ALREADY has the Sixth Berth folded in:
                      //
                      //   hasSixthBerth ? { ...baseShip, crewSlots: +1 } : baseShip
                      //
                      // so adding the berth here again read the Man-o-War as
                      // "7, +1" against a real cap of 6. Every row now starts
                      // from the hull's own number and this component adds the
                      // refits itself, which is the only way the "+N" can be
                      // trusted to mean "what your upgrades bought".
                      const hull = EXPEDITION_SHIP_STATS[shipTierForSlots] ?? shipStats
                      const baseHull  = hull.durability
                      const baseDmg   = hull.minDamage
                      const baseSpeed = hull.speed
                      const baseCrew  = hull.crewSlots
                      const baseMount = raidItemSlotsForTier(shipTierForSlots)
                      const hullTotal  = Math.round(baseHull * cls.hpMult)
                      const dmg   = Math.round(baseDmg * cls.damageMult)
                      const speed = baseSpeed + cls.speedFlat
                      const crew  = baseCrew + cls.crewSlots + (hasSixthBerth ? 1 : 0)
                      const mount = baseMount + cls.itemSlots + (hasArmoryExpansion ? 1 : 0)
                      const ROWS: { label: string; base: number; total: number; accent: string }[] = [
                        { label: 'Hull',   base: baseHull,  total: hullTotal, accent: '#7fdfa3' },
                        { label: 'Damage', base: baseDmg,   total: dmg,   accent: '#f08a8a' },
                        { label: 'Speed',  base: baseSpeed, total: speed, accent: '#60a5fa' },
                        { label: 'Crew',   base: baseCrew,  total: crew,  accent: '#e0c47a' },
                        { label: 'Mounts', base: baseMount, total: mount, accent: '#a78bfa' },
                      ]
                      return (
                        <div style={{
                          display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                          gap: 6, marginBottom: '0.9rem',
                          padding: '0.85rem 0.7rem', borderRadius: 14,
                          background: shipPanelBg('rgba(255,255,255,0.035)'), border: '1px solid rgba(255,255,255,0.11)',
                        }}>
                          {ROWS.map(r => {
                            const added = r.total - r.base
                            return (
                              <button key={r.label} type="button"
                                onClick={() => { vibrate(5); setShipStatDetail(r.label) }}
                                title={`What ${r.label} does`}
                                style={{ textAlign: 'center', minWidth: 0, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', touchAction: 'manipulation' }}>
                                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.42)' }}>{r.label}</p>
                                <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', lineHeight: 1.1, color: '#ecdcbd', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{r.total}</p>
                                {/* Shows whenever a refit MOVED it, in either
                                    direction, and stays invisible at zero so a
                                    fresh captain sees clean numbers instead of a
                                    column of +0.
                                    
                                    Negatives matter here. Ship classes are
                                    trade-offs: three Master Gunner picks buy
                                    +34% damage and cost 20% of the hull, which
                                    on a Man-o-War is 125 down to 100. Hiding
                                    that showed a captain "Hull 100" with no
                                    explanation and no way to find one. */}
                                <p className="font-karla font-700" style={{ fontSize: '0.56rem', lineHeight: 1.2, color: added > 0 ? r.accent : added < 0 ? '#e08a8a' : 'transparent', fontVariantNumeric: 'tabular-nums' }}>
                                  {added > 0 ? `+${added}` : added < 0 ? `${added}` : '+0'}
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* ── THE HULL, centred, the headline upgrade ─────────────── */}
                    <button
                      type="button"
                      onClick={() => { if (nextShip) { setUpgradeError(null); setUpgradeOpen(true) } }}
                      disabled={!nextShip}
                      style={{
                        width: '100%', marginBottom: '1.1rem', padding: '1rem 0.9rem',
                        borderRadius: 16, cursor: nextShip ? 'pointer' : 'default',
                        textAlign: 'center', font: 'inherit',
                        background: nextShip
                          ? `linear-gradient(180deg, rgba(240,192,64,0.20) 0%, rgba(240,192,64,0.07) 100%), ${SHIP_PANEL}`
                          : shipPanelBg('rgba(255,255,255,0.04)'),
                        border: `1px solid ${nextShip ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: nextShip ? '#f0c040' : '#8a8480' }}>
                        {nextShip ? 'Next Hull' : 'Hull'}
                      </p>
                      <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', lineHeight: 1.12, color: '#f4ecd8', marginTop: 3 }}>
                        {nextShip ? nextShip.name : shipStats.name}
                      </p>
                      {nextShip ? (
                        <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#c8aa6a', marginTop: 5 }}>
                          {nextShip.cost.toLocaleString()} ⟡
                        </p>
                      ) : (
                        <p className="font-karla" style={{ fontSize: '0.76rem', color: '#8a8480', marginTop: 5 }}>
                          The finest hull in the water. Nothing left to buy.
                        </p>
                      )}
                    </button>

                    {/* ── THE REST, TABBED ────────────────────────────────────── */}
                    <div style={{ display: 'flex', gap: 5, marginBottom: '0.9rem', padding: 4, background: shipPanelBg('rgba(255,255,255,0.03)'), borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)' }}>
                      {([['refits', 'Refits'], ['armament', 'Armament'], ['appearance', 'Look']] as const).map(([id, label]) => {
                        const on = shipTab === id
                        return (
                          <button key={id} type="button" onClick={() => { vibrate(5); setShipTab(id) }}
                            className="font-karla font-700 uppercase"
                            style={{
                              flex: 1, padding: '0.5rem 0', borderRadius: 9, cursor: 'pointer', font: 'inherit',
                              fontSize: '0.62rem', letterSpacing: '0.08em',
                              background: on ? 'rgba(240,192,64,0.16)' : 'transparent',
                              border: `1px solid ${on ? 'rgba(240,192,64,0.45)' : 'transparent'}`,
                              color: on ? '#f0c040' : 'rgba(255,255,255,0.5)',
                            }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="ship-tile-grid" style={{
                      marginBottom: '1.4rem',
                      '--tiles-h-narrow': `${reserve(2)}px`,
                      '--tiles-h-wide': `${reserve(3)}px`,
                    } as React.CSSProperties}>
                      {/* Ultimate Weapon */}
                      {shipTab === 'armament' && showUltimate && (() => {
                        const activeAug = initialManowarAugment ? getShipAugment(initialManowarAugment) : null
                        const buildAug  = manowarBuild ? getShipAugment(manowarBuild.id) : null
                        const accent    = buildAug?.color ?? activeAug?.color ?? '#f0c040'
                        const statusLabel = buildAug ? (manowarBuild?.retool ? 'Retooling' : 'Forging') : activeAug ? 'Armed' : 'Not built'
                        const statusText  = buildAug ? buildAug.name : activeAug ? activeAug.name : 'Capstone weapon'
                        return (
                          <ShipTile
                            accent={accent}
                            title="Ultimate Weapon"
                            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>}
                            value={statusText}
                            sub={statusLabel}
                            cta="Manage ›"
                            onClick={() => setUltimateOpen(true)}
                          />
                        )
                      })()}
                      {/* Sixth Berth — same unlock gate as the panel (Raid 7 / owned). */}
                      {shipTab === 'refits' && (blockadeCleared || hasSixthBerth) && (
                        <ShipTile
                          accent="#ffd56b"
                          title="Sixth Berth"
                          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffd56b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="3"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M19 8v6M22 11h-6"/></svg>}
                          value={hasSixthBerth ? 'Six crew slots' : 'A sixth slot'}
                          sub={hasSixthBerth ? 'Installed' : 'Add a berth'}
                          cta={hasSixthBerth ? 'View ›' : 'Add ›'}
                          onClick={() => setSixthBerthOpen(true)}
                        />
                      )}
                      {/* Expanded Armory — same unlock gate as the panel (Raid 8 / owned). */}
                      {shipTab === 'refits' && (throneCleared || hasArmoryExpansion) && (
                        <ShipTile
                          accent="#a78bfa"
                          title="Expanded Armory"
                          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/></svg>}
                          value={hasArmoryExpansion ? 'Extra mount' : 'One more mount'}
                          sub={hasArmoryExpansion ? 'Installed' : 'Add a mount'}
                          cta={hasArmoryExpansion ? 'View ›' : 'Add ›'}
                          onClick={() => setArmoryOpen(true)}
                        />
                      )}
                      {/* Captain's Class */}
                      {shipTab === 'armament' && (() => {
                        const ownedIds = new Set(Object.values(shipClasses))
                        const lines = SHIP_CLASS_LINES
                          .map(line => line.filter(id => ownedIds.has(id)) as ShipClassId[])
                          .filter(owned => owned.length > 0)
                          .map(owned => getShipClass(owned[owned.length - 1])!)
                        return (
                          <ShipTile
                            accent="#c084fc"
                            title="Captain's Class"
                            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 15 9l7 .5-5.5 4.5L18 21l-6-3.5L6 21l1.5-7L2 9.5 9 9z"/></svg>}
                            value={lines.length ? lines.map(l => l.name).join(', ') : 'None yet'}
                            sub={lines.length ? `${lines.length} line${lines.length > 1 ? 's' : ''} · stack` : 'Clear a chapter'}
                            cta={lines.length ? 'View ›' : 'Locked'}
                            onClick={() => { if (lines.length) setClassesOpen(true) }}
                          />
                        )
                      })()}
                      {/* Repair Kit */}
                      {shipTab === 'refits' && (() => {
                        const kit = getRepairKit(kitEquipped) ?? getRepairKit('basic_repair_kit')!
                        const range = repairKitRange(kit, ratedFortune)
                        const accent = kitRarityColor(kit.rarity)
                        const next = nextRepairKit(kitsOwned)
                        return (
                          <ShipTile
                            accent={accent}
                            title="Repair Kit"
                            icon={<WrenchGlyph color={accent} />}
                            value={kit.name}
                            sub={`+${range.min}-${range.max} HP · Special`}
                            cta={next ? 'Upgrade ›' : 'Max'}
                            onClick={() => { if (next) { setKitErr(null); setKitOpen(true) } }}
                          />
                        )
                      })()}
                      {/* Appearance / Ship Skins */}
                      {shipTab === 'appearance' && <ShipTile
                        accent="#9cc4ff"
                        title="Appearance"
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9cc4ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v9"/><path d="M12 5l6 6-6 1"/><path d="M4 14h16l-1.6 4.2a2 2 0 0 1-1.9 1.3H7.5a2 2 0 0 1-1.9-1.3z"/></svg>}
                        value={equippedSkin ? (SHIP_SKINS.find(s => s.id === equippedSkin)?.name ?? 'Custom skin') : 'Default'}
                        sub="Ship skins"
                        cta="Change ›"
                        onClick={() => setSkinsOpen(true)}
                      />}
                    </div>

                  </>
                )
              })()}
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
                      closeLoadout()
                      // Campaign map is a full-screen overlay now — surface it
                      // instead of scrolling to an inline section that's gone.
                      if (loadoutMode === 'campaign') {
                        setTimeout(() => window.dispatchEvent(new CustomEvent('expedition:open-campaign-map')), 240)
                      } else {
                        setTimeout(() => {
                          const el = document.getElementById('voyage-panel')
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }, 240)
                      }
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

      {/* First-time Manage Ship guide (Doby + Kat) — flashes each loadout tab.
          z above the drawer (101). */}
      {shipGuideStep != null && shipGuideSteps[shipGuideStep] && (
        <GuideCoach
          show
          portrait={shipGuideSteps[shipGuideStep].portrait}
          speaker={shipGuideSteps[shipGuideStep].speaker}
          text={shipGuideSteps[shipGuideStep].text}
          accent="#f0c040"
          placement="bottom"
          z={200}
          onNext={() => { if (shipGuideStep >= shipGuideSteps.length - 1) setShipGuideStep(null); else setShipGuideStep(s => (s ?? 0) + 1) }}
          nextLabel={shipGuideStep >= shipGuideSteps.length - 1 ? 'Got it' : 'Next →'}
          onClose={() => setShipGuideStep(null)}
        />
      )}

      {/* Navigation Renown board — opens from the Lv pill once Nav hits 100. */}
      <RenownPanel
        open={renownOpen}
        onClose={() => {
          setRenownOpen(false)
          // Nav Renown feeds the REAL fight numbers: getRaidPlayerStats folds
          // nav_renown_alloc into playerHPMax and classDamageMult, and page.tsx sends
          // those to the campaign launch modal as prepStats. Spend a point in Hull and
          // the modal kept quoting your pre-Renown hull. Refreshed once on close
          // rather than per point, so a captain spending five points does not trigger
          // five server round-trips.
          if (renownDirtyRef.current) { renownDirtyRef.current = false; router.refresh() }
        }}
        skill="nav"
        initial={navRenownState}
        onChange={s => { setNavRenownAllocState(s.alloc); renownDirtyRef.current = true }}
      />
      <RenownIntroOverlay
        open={navRenownIntro}
        skill="nav"
        onDismiss={() => {
          setNavRenownIntro(false)
          markRenownIntroSeen('nav').catch(() => {})
        }}
      />

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
                  // Snapshot the before/after while `shipStats` still holds the
                  // OLD hull. router.refresh() swaps it underneath us.
                  const oldTier = shipTierByName(shipStats.name)
                  const bought = nextHull(oldTier)
                  const a = EXPEDITION_SHIP_STATS[oldTier]
                  const b = EXPEDITION_SHIP_STATS[oldTier + 1]
                  if (bought && a && b) {
                    setChristening({
                      fromName: shipStats.name,
                      toName: bought.name,
                      toImage: bought.imageUrl ?? '',
                      stats: [
                        { label: 'Hull',   from: a.durability, to: b.durability },
                        { label: 'Damage', from: a.minDamage,  to: b.minDamage },
                        { label: 'Speed',  from: a.speed,      to: b.speed },
                        { label: 'Crew',   from: a.crewSlots,  to: b.crewSlots },
                        { label: 'Mounts', from: raidItemSlotsForTier(oldTier), to: raidItemSlotsForTier(oldTier + 1) },
                      ],
                    })
                  }
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
          {kitWon ? (
            <KitCelebration
              kitId={kitWon}
              fortune={ratedFortune}
              onDone={() => { setKitWon(null); setKitOpen(false); router.refresh() }}
            />
          ) : (
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
          )}
        </motion.div>
      </PopupShell>

      {/* Ultimate Weapon — Manage modal. Holds the full build/swap/retool/
          schematics controls AND the looping preview animation, moved off the
          Ship tab so the tab is just a status row. */}
      <ModalSheet open={ultimateOpen && showUltimate} onClose={() => setUltimateOpen(false)}
        maxWidth={440} padding="0.85rem 0.8rem 1rem"
        boxShadow="0 24px 60px rgba(0,0,0,0.62), 0 0 34px rgba(240,192,64,0.14)">
            <UltimateBuildPanel
              shipTier={shipTierForSlots}
              navLevel={navLevelNow}
              hasRack={hasRack}
              chapter3Cleared={chapter3Cleared}
              doubloons={doubloons}
              activeId={initialManowarAugment}
              build={manowarBuild}
              schematics={manowarSchematics}
            />
      </ModalSheet>

      {/* Equipped raid-item detail — tap a Battle Loadout slot to read its
          effect, then Close or Unequip (no more one-tap removal). */}
      {/* ── Equip picker ── opened from an empty hull slot. Deliberately a
          COMMIT-AND-CLOSE list rather than another detail view: you tapped a
          hole, so the fast thing is to fill it. Anything that cannot go in is
          still listed, greyed, with the reason, so the collection reads whole
          instead of hiding items that look missing. */}
      <PopupShell open={pickerOpen} onClose={() => setPickerOpen(false)}>
        {(() => {
          const choices = ownedRaidItems.filter(id => !mountIds.has(id) && !equippedItems.includes(id))
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
              style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 400, background: 'rgba(8,14,24,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: '1.3rem 1rem 1rem', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}
            >
              <CloseButton onClick={() => setPickerOpen(false)} style={{ position: 'absolute', top: 6, right: 8, zIndex: 6 }} />
              <p className="font-cinzel font-800" style={{ fontSize: '1rem', color: '#f0ede8', marginBottom: 3 }}>Equip an item</p>
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8a8480', marginBottom: 12 }}>
                {slotsFilled}/{slotsTotal} slots filled. Effects stack no matter which slot.
              </p>
              {choices.length === 0 ? (
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#7a7470', textAlign: 'center', padding: '1.6rem 0', fontStyle: 'italic' }}>
                  {ownedRaidItems.length === 0 ? 'No items yet. Clear raids to earn them.' : 'Everything you own is already equipped.'}
                </p>
              ) : (
                <div className="scrollbar-hide" style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', minHeight: 0, overscrollBehavior: 'contain' }}>
                  {choices.map(itemId => {
                    const def = getRaidItem(itemId)
                    if (!def) return null
                    const color = RARITY_ITEM_COLOR[def.rarity] ?? '#9ca3af'
                    const abyssal = isAbyssalForgedItem(itemId)
                    const swapNames = conflictingRaidItems(itemId, equippedItems)
                      .map(id => getRaidItem(id)?.name).filter(Boolean) as string[]
                    const wouldSwap = swapNames.length > 0
                    const full = hullItems.length >= raidItemSlots
                    const blocked = full && !wouldSwap
                    return (
                      <button
                        key={itemId}
                        type="button"
                        disabled={blocked}
                        onClick={blocked ? undefined : () => { toggleItem(itemId); setPickerOpen(false) }}
                        aria-label={blocked ? `${def.name}. Hull full, free a slot first.` : wouldSwap ? `${def.name}. Tap to swap for ${swapNames.join(', ')}.` : `${def.name}. Tap to equip.`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                          padding: '0.55rem 0.6rem', borderRadius: 11,
                          background: 'rgba(255,255,255,0.035)', border: `1px solid ${blocked ? 'rgba(255,255,255,0.08)' : `${color}3a`}`,
                          cursor: blocked ? 'not-allowed' : 'pointer', font: 'inherit',
                          opacity: blocked ? 0.45 : 1, touchAction: 'manipulation',
                        }}
                      >
                        <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: `${color}12`, border: `1px solid ${color}33` }}>
                          {def.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={def.image} alt="" loading="lazy" decoding="async" className={abyssal ? 'rod-glow-abyssal' : undefined} style={{ width: 34, height: 34, objectFit: 'contain' }} />
                            : <span style={{ color, display: 'flex' }}><IconCrate size={24} /></span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>{def.name}</p>
                          <p className="font-karla" style={{ fontSize: '0.64rem', color: '#8a8480', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {wouldSwap ? `Replaces ${swapNames.join(', ')}. They do not stack.` : def.description}
                          </p>
                        </div>
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.56rem', padding: '0.24rem 0.5rem', borderRadius: 999, color: blocked ? '#6a6764' : wouldSwap ? '#d8a14a' : '#9ae6b4', background: blocked ? 'rgba(255,255,255,0.04)' : wouldSwap ? 'rgba(216,161,74,0.12)' : 'rgba(154,230,180,0.1)', border: `1px solid ${blocked ? 'rgba(255,255,255,0.1)' : wouldSwap ? 'rgba(216,161,74,0.34)' : 'rgba(154,230,180,0.32)'}` }}>
                          {blocked ? 'Full' : wouldSwap ? 'Swap' : 'Equip'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )
        })()}
      </PopupShell>
      <PopupShell open={!!itemDetail} onClose={() => setItemDetail(null)}>
        {itemDetail && (() => {
          const def = getRaidItem(itemDetail)
          if (!def) return null
          const color = RARITY_ITEM_COLOR[def.rarity]
          const forged = isForgedRaidItem(itemDetail)
          const abyssal = isAbyssalForgedItem(itemDetail)
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
              style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 380, background: 'rgba(8,14,24,0.98)', borderRadius: 18, padding: '1.5rem 1.1rem 1.1rem', maxHeight: '88vh', overflowY: 'auto', boxShadow: forged ? (abyssal ? '0 0 30px rgba(255,90,60,0.22)' : '0 0 30px rgba(150,140,180,0.2)') : `0 0 30px ${color}22` }}
            >
              <CloseButton onClick={() => setItemDetail(null)} style={{ position: 'absolute', top: 6, right: 8, zIndex: 6 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
                <div style={{ width: 74, height: 74, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...(forged ? forgedBorderSoft('rgba(20,24,32,0.9)', abyssal) : { background: `${color}12`, border: `1px solid ${color}40` }) }}>
                  {def.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={def.image} alt="" decoding="async" className={abyssal ? 'rod-glow-abyssal' : undefined} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                    : <span style={{ color, display: 'flex' }}><IconCrate size={40} /></span>}
                </div>
                <span className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: forged ? (abyssal ? '#ff8a6a' : '#b7ace0') : color }}>{abyssal ? 'Abyssal Relic' : forged ? 'Forged Relic' : def.rarity}</span>
                <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', lineHeight: 1.1, ...(forged ? forgedTextSoft(abyssal) : { color: '#f0ede8' }) }}>{def.name}</p>
              </div>
              {/* Left-aligned on purpose: a centred bullet list has no edge to
                  scan down, which is the entire reason for listing them. */}
              <div style={{ textAlign: 'left', marginTop: 10 }}>
                <ItemEffectLines def={def} size={0.82} />
              </div>
              {/* Finn's spoil has no fixed effect line to print, so it shows its
                  CHARGE instead: the level it has reached and the ladder still
                  ahead of it. */}
              {def.id === 'borrowed_jaw' && (
                <div style={{ marginTop: '1.1rem', textAlign: 'left' }}>
                  <FinnChargePanel id="borrowed_jaw" xp={borrowedJawXp} equipped={equippedItems.includes('borrowed_jaw')} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: '1.3rem' }}>
                <button type="button" onClick={() => setItemDetail(null)} className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{ flex: 1, padding: '0.72rem', borderRadius: 11, fontSize: '0.8rem', color: '#c8d2e0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>Close</button>
                {/* The action reads the item's ACTUAL state. This modal is now
                    reached from the inventory rail as well as from a filled
                    slot, so a hardcoded "Unequip" would have offered to remove
                    something the player does not have on. */}
                {(() => {
                  const on = equippedItems.includes(itemDetail)
                  const swaps = on ? [] : conflictingRaidItems(itemDetail, equippedItems)
                    .map(id => getRaidItem(id)?.name).filter(Boolean) as string[]
                  const isMount = mountIds.has(itemDetail)
                  const hullFull = !isMount && hullItems.length >= raidItemSlots
                  const blocked = !on && hullFull && swaps.length === 0
                  const label = on ? (isMount ? 'Unmount' : 'Unequip') : swaps.length ? 'Swap in' : isMount ? 'Mount' : 'Equip'
                  return (
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={blocked ? undefined : () => { toggleItem(itemDetail); setItemDetail(null) }}
                      className="font-cinzel font-700 uppercase tracking-[0.06em]"
                      style={{
                        flex: 1, padding: '0.72rem', borderRadius: 11, fontSize: '0.8rem',
                        color: blocked ? '#6a6764' : '#e0c078',
                        background: blocked ? 'rgba(255,255,255,0.04)' : 'rgba(196,176,120,0.14)',
                        border: `1px solid ${blocked ? 'rgba(255,255,255,0.1)' : 'rgba(196,176,120,0.42)'}`,
                        cursor: blocked ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {blocked ? 'Hull full' : label}
                    </button>
                  )
                })()}
              </div>
            </motion.div>
          )
        })()}
      </PopupShell>

      {/* Active Loadout summary — a clean, at-a-glance list of every equipped
          item and its effect, opened from the Battle Loadout header. */}
      <PopupShell open={effectsOpen} onClose={() => setEffectsOpen(false)}>
        {effectsOpen && (() => {
          const items = equippedItems.map(id => getRaidItem(id)).filter((d): d is NonNullable<ReturnType<typeof getRaidItem>> => !!d)
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
              style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 420, background: 'rgba(8,14,24,0.98)', borderRadius: 18, padding: '1.5rem 1.15rem 1.2rem', maxHeight: '88vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', boxShadow: '0 0 30px rgba(120,140,170,0.16)' }}
            >
              <CloseButton onClick={() => setEffectsOpen(false)} style={{ position: 'absolute', top: 6, right: 8, zIndex: 6 }} />
              <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
                <p className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>Active Loadout</p>
                {/* items INCLUDES the mount, so this has to count against the
                    display total or a full loadout reads "6 of 5". */}
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: '#8794a6', marginTop: 3 }}>{items.length} of {slotsTotal} mount{slotsTotal === 1 ? '' : 's'} in use</p>
              </div>
              {items.length === 0 ? (
                <p className="font-karla text-center" style={{ fontSize: '0.8rem', color: '#7a7470', fontStyle: 'italic', padding: '1rem 0' }}>Nothing equipped yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {items.map((def, idx) => {
                    const color = RARITY_ITEM_COLOR[def.rarity]
                    const forged = isForgedRaidItem(def.id)
                    const abyssal = isAbyssalForgedItem(def.id)
                    return (
                      <div key={def.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '0.8rem 0', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                        <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...(forged ? forgedBorderSoft('rgba(20,24,32,0.9)', abyssal) : { background: `${color}12`, border: `1px solid ${color}40` }) }}>
                          {def.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={def.image} alt="" loading="lazy" decoding="async" className={abyssal ? 'rod-glow-abyssal' : undefined} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                            : <span style={{ color, display: 'flex' }}><IconCrate size={20} /></span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', lineHeight: 1.2, ...(forged ? forgedTextSoft(abyssal) : { color }) }}>{def.name}</p>
                          <div style={{ marginTop: 3 }}><ItemEffectLines def={def} size={0.74} color="#b8b2a8" /></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={() => setEffectsOpen(false)} className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{ width: '100%', marginTop: '1.2rem', padding: '0.72rem', borderRadius: 11, fontSize: '0.8rem', color: '#c8d2e0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer' }}>Close</button>
            </motion.div>
          )
        })()}
      </PopupShell>

      {/* Sixth Berth — Manage modal (the buy / installed panel). */}
      <ModalSheet open={sixthBerthOpen} onClose={() => setSixthBerthOpen(false)}
        maxWidth={400} padding="1.5rem 0.95rem 1rem"
        boxShadow="0 24px 60px rgba(0,0,0,0.62), 0 0 30px rgba(255,213,107,0.16)">
        <SixthBerthPanel
          blockadeCleared={blockadeCleared}
          hasSixthBerth={hasSixthBerth}
          baseCrewSlots={hasSixthBerth ? shipStats.crewSlots - 1 : shipStats.crewSlots}
          doubloons={doubloons}
        />
      </ModalSheet>

      {/* What a ship stat means, and where every point of its delta came from.
          The breakdown is the important half: a captain whose hull reads -25
          can see it was Master Gunner I, II and III that took it. */}
      <ModalSheet open={!!shipStatDetail} onClose={() => setShipStatDetail(null)} maxWidth={360}>
        {(() => {
          const about = shipStatDetail ? SHIP_STAT_ABOUT[shipStatDetail] : null
          if (!about || !shipStatDetail) return null
          const cls = aggregateShipClasses(shipClasses)
          const hull = EXPEDITION_SHIP_STATS[shipTierForSlots] ?? shipStats
          const baseFor: Record<string, number> = {
            Hull: hull.durability, Damage: hull.minDamage, Speed: hull.speed,
            Crew: hull.crewSlots, Mounts: raidItemSlotsForTier(shipTierForSlots),
          }
          const totalFor: Record<string, number> = {
            Hull: Math.round(hull.durability * cls.hpMult),
            Damage: Math.round(hull.minDamage * cls.damageMult),
            Speed: hull.speed + cls.speedFlat,
            Crew: hull.crewSlots + cls.crewSlots + (hasSixthBerth ? 1 : 0),
            Mounts: raidItemSlotsForTier(shipTierForSlots) + cls.itemSlots + (hasArmoryExpansion ? 1 : 0),
          }
          const picked = Object.values(shipClasses).map(id => getShipClass(id)).filter((c): c is NonNullable<typeof c> => !!c)
          const parts: [string, string][] = [[`${shipStats.name} hull`, `${baseFor[shipStatDetail]}`]]
          for (const c of picked) {
            const e = c.effects
            if (shipStatDetail === 'Hull' && e.hpMult && e.hpMult !== 1) parts.push([c.name, `${e.hpMult > 1 ? '+' : ''}${Math.round((e.hpMult - 1) * 100)}%`])
            if (shipStatDetail === 'Damage' && e.damageMult && e.damageMult !== 1) parts.push([c.name, `${e.damageMult > 1 ? '+' : ''}${Math.round((e.damageMult - 1) * 100)}%`])
            if (shipStatDetail === 'Speed' && e.speedFlat) parts.push([c.name, `${e.speedFlat > 0 ? '+' : ''}${e.speedFlat}`])
            if (shipStatDetail === 'Crew' && e.crewSlots) parts.push([c.name, `${e.crewSlots > 0 ? '+' : ''}${e.crewSlots}`])
            if (shipStatDetail === 'Mounts' && e.itemSlots) parts.push([c.name, `${e.itemSlots > 0 ? '+' : ''}${e.itemSlots}`])
          }
          if (shipStatDetail === 'Crew' && hasSixthBerth) parts.push(['Sixth Berth', '+1'])
          if (shipStatDetail === 'Mounts' && hasArmoryExpansion) parts.push(['Expanded Armory', '+1'])
          const total = totalFor[shipStatDetail]
          const delta = total - baseFor[shipStatDetail]
          return (
            <>
              <p className="font-cinzel font-800 uppercase" style={{ fontSize: '0.86rem', letterSpacing: '0.12em', color: '#f0c040' }}>{shipStatDetail}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '2.6rem', lineHeight: 1, color: '#ecdcbd', fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>{total}</p>
              {delta !== 0 && (
                <p className="font-karla font-700" style={{ fontSize: '0.76rem', color: delta > 0 ? '#7fdfa3' : '#e08a8a', marginTop: 2 }}>
                  {delta > 0 ? `+${delta}` : delta} from your upgrades
                </p>
              )}
              <p className="font-karla font-700" style={{ fontSize: '0.86rem', lineHeight: 1.45, color: '#ecdcbd', marginTop: 14 }}>{about.lead}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
                {about.rows.map(([where, what]) => (
                  <div key={where} style={{ display: 'grid', gridTemplateColumns: '4.6rem minmax(0, 1fr)', columnGap: 8, alignItems: 'baseline' }}>
                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: '#8a96a8' }}>{where}</span>
                    <span className="font-karla" style={{ fontSize: '0.8rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.78)' }}>{what}</span>
                  </div>
                ))}
              </div>
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.16em', color: '#6f7887', marginTop: 18, marginBottom: 6 }}>Where it comes from</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {parts.map(([label, val], i) => (
                  <div key={label + i} className="flex items-baseline justify-between" style={{ padding: '0.42rem 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <span className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.62)' }}>{label}</span>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#ecdcbd', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </ModalSheet>

      <ShipChristening data={christening} onDone={() => setChristening(null)} />

      {/* Expanded Armory — the raid-item mount refit. Same shell as the berth. */}
      <ModalSheet open={armoryOpen} onClose={() => setArmoryOpen(false)}
        maxWidth={400} padding="1.5rem 0.95rem 1rem"
        boxShadow="0 24px 60px rgba(0,0,0,0.62), 0 0 30px rgba(167,139,250,0.16)">
        <ArmoryExpansionPanel
          throneCleared={throneCleared}
          hasArmoryExpansion={hasArmoryExpansion}
          baseItemSlots={hasArmoryExpansion ? raidItemSlots - 1 : raidItemSlots}
          doubloons={doubloons}
        />
      </ModalSheet>

      {/* Captain's Class — overview modal: each owned line, tap for its breakdown. */}
      <PopupShell open={classesOpen} onClose={() => setClassesOpen(false)}>
        {classesOpen && (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
            style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 400, background: 'rgba(8,14,24,0.98)', border: '1px solid rgba(192,132,252,0.4)', borderRadius: 18, padding: '1.1rem 1rem 1.2rem', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(192,132,252,0.18)' }}>
            <CloseButton onClick={() => setClassesOpen(false)} style={{ position: 'absolute', top: 8, right: 10, zIndex: 6 }} />
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#c084fc', marginBottom: 4 }}>Captain&rsquo;s Class</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8480', marginBottom: 14, lineHeight: 1.45 }}>Permanent buffs you pick at the end of each chapter. They stack. Tap one for its full breakdown.</p>
            {(() => {
              const ownedIds = new Set(Object.values(shipClasses))
              const lines = SHIP_CLASS_LINES
                .map(line => line.filter(id => ownedIds.has(id)) as ShipClassId[])
                .filter(owned => owned.length > 0)
                .map(owned => ({ owned, top: getShipClass(owned[owned.length - 1])! }))
              if (lines.length === 0) return <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: '#7a7470', padding: '0.8rem 0' }}>No class yet. Clear a chapter to choose one.</p>
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lines.map(({ owned, top }) => (
                    <button key={top.id} type="button" onClick={() => { setClassesOpen(false); setClassDetail(owned) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.7rem 0.8rem', borderRadius: 12, background: `${top.color}12`, border: `1px solid ${top.color}45`, cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 9, background: `${top.color}20`, border: `1px solid ${top.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: top.color }}>{top.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0ede8', lineHeight: 1.15 }}>{top.name}</p>
                        <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: top.color }}>{top.tagline}</p>
                      </div>
                      <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: top.color, flexShrink: 0 }}>Details ›</span>
                    </button>
                  ))}
                </div>
              )
            })()}
            {/* THE REFIT. Only offered where the classes are already explained,
                because the whole point of it is that the tradeoffs cannot be
                read until you have fought with them. Earned by putting the don
                under, spendable once, and gone from the panel afterwards rather
                than sitting there greyed out as a permanent reminder. */}
            {throneCleared && Object.keys(shipClasses).length > 0 && (() => {
              // Always offered once the don is down. The first is free and the
              // rest are priced, so the line says which rather than the entry
              // point disappearing after one use.
              const cost = shipRefitCost(shipRefitsUsed)
              return (
                <button type="button" onClick={() => { setClassesOpen(false); setRefitOpen(true) }}
                  className="font-karla font-700"
                  style={{ width: '100%', marginTop: 12, padding: '0.62rem', borderRadius: 11, fontSize: '0.76rem', color: '#c084fc', background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.45)', cursor: 'pointer' }}>
                  Refit your classes &middot; {cost === 0 ? 'first one free' : `${cost.toLocaleString()} ⟡`} &rsaquo;
                </button>
              )
            })()}
          </motion.div>
        )}
      </PopupShell>

      {/* The one free class refit. Its own sheet: the overview above is a read,
          this is a decision, and stacking them in one modal made the read feel
          like a menu. */}
      <PopupShell open={refitOpen} onClose={() => setRefitOpen(false)}>
        {refitOpen && (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
            style={{ position: 'relative', width: '100%', maxWidth: 400, marginTop: 'auto', marginBottom: 'auto', flexShrink: 0, background: 'rgba(8,14,24,0.98)', border: '1px solid rgba(192,132,252,0.4)', borderRadius: 18, padding: '1.1rem 1rem 1.2rem', boxShadow: '0 0 30px rgba(192,132,252,0.18)' }}>
            <ShipRefitPanel picks={shipClasses} refitsUsed={shipRefitsUsed} doubloons={doubloons} onClose={() => setRefitOpen(false)} />
          </motion.div>
        )}
      </PopupShell>

      {/* Appearance — Ship Skins picker modal. */}
      <PopupShell open={skinsOpen} onClose={() => setSkinsOpen(false)}>
        {skinsOpen && (
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ duration: 0.18 }}
            style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 420, background: 'rgba(8,14,24,0.98)', border: '1px solid rgba(156,196,255,0.35)', borderRadius: 18, padding: '1.1rem 1rem 1.2rem', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(156,196,255,0.16)' }}>
            <CloseButton onClick={() => setSkinsOpen(false)} style={{ position: 'absolute', top: 8, right: 10, zIndex: 6 }} />
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#9cc4ff', marginBottom: 12 }}>Ship Skins</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {(() => {
                const isEquipped = equippedSkin === null
                return (
                  <button onClick={() => { if (!isEquipped) handleEquipSkin(null) }} disabled={isEquipped}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0.5rem 0.35rem', borderRadius: 10, background: isEquipped ? 'rgba(255,255,255,0.06)' : 'rgba(4,10,18,0.72)', border: `1px solid ${isEquipped ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.09)'}`, cursor: isEquipped ? 'default' : 'pointer' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shipStats.image} alt="" loading="lazy" decoding="async" style={{ width: 38, height: 38, objectFit: 'contain' }} />
                    <p className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: '#f0ede8', lineHeight: 1.1, textAlign: 'center' }}>Default</p>
                    <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: isEquipped ? '#e0ddd8' : '#7a7674' }}>{isEquipped ? '✓ Equipped' : 'Original'}</span>
                  </button>
                )
              })()}
              {SHIP_SKINS.map(skin => {
                const owned = ownedSkins.includes(skin.id)
                const tierLocked = skin.requiresShipTier != null && shipTierForSlots < skin.requiresShipTier
                const isEquipped = equippedSkin === skin.id
                const equippable = owned && !isEquipped && !tierLocked
                const skinImg = skin.imageByTier?.[shipTierForSlots] ?? (skin.requiresShipTier != null ? skin.imageByTier?.[skin.requiresShipTier] : undefined) ?? shipStats.image
                return (
                  <button key={skin.id} onClick={equippable ? () => handleEquipSkin(skin.id) : undefined} disabled={!equippable}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0.5rem 0.35rem', borderRadius: 10, background: isEquipped ? `${skin.color}1f` : 'rgba(4,10,18,0.72)', border: `1px solid ${isEquipped ? skin.color + '90' : owned && !tierLocked ? 'rgba(255,255,255,0.09)' : `${skin.color}22`}`, boxShadow: isEquipped ? `0 0 12px ${skin.color}33` : 'none', cursor: equippable ? 'pointer' : 'default', opacity: owned && !tierLocked ? 1 : 0.6 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={skinImg} alt="" loading="lazy" decoding="async" style={{ width: 38, height: 38, objectFit: 'contain', filter: owned && !tierLocked ? skin.filter : 'brightness(0.25) saturate(0)', transition: 'filter 0.25s' }} />
                    <p className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: owned && !tierLocked ? '#f0ede8' : '#a8a3a0', lineHeight: 1.1, textAlign: 'center' }}>{skin.name}</p>
                    {isEquipped ? (
                      <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: skin.color }}>✓ Equipped</span>
                    ) : !owned ? (
                      <span className="font-karla font-600" style={{ fontSize: '0.5rem', color: '#7a7674', textAlign: 'center', lineHeight: 1.25 }}>{skin.source}</span>
                    ) : tierLocked ? (
                      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: skin.color, textAlign: 'center', lineHeight: 1.25 }}>{getShip(skin.requiresShipTier!).name} only</span>
                    ) : (
                      <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.5rem', color: '#4ade80' }}>Tap to equip</span>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </PopupShell>

      {/* Captain's-class detail — the tiers you own in this line + their combined
          effect. Opened from a class card on the Ship tab. */}
      <PopupShell open={!!classDetail} onClose={() => setClassDetail(null)}>
        {classDetail && (() => {
          const tiers = classDetail.map(id => getShipClass(id)!).filter(Boolean)
          const top = tiers[tiers.length - 1]
          const agg = aggregateShipClasses(Object.fromEntries(classDetail.map((id, i) => [i, id])))
          const pct = (m: number) => `${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`
          const combined: string[] = []
          if (agg.damageMult !== 1)   combined.push(`${pct(agg.damageMult)} damage`)
          if (agg.hpMult !== 1)       combined.push(`${pct(agg.hpMult)} HP`)
          if (agg.doubloonMult !== 1) combined.push(`${pct(agg.doubloonMult)} doubloons`)
          if (agg.speedFlat !== 0)    combined.push(`${agg.speedFlat > 0 ? '+' : ''}${agg.speedFlat} speed`)
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4 }}
              transition={{ duration: 0.18 }}
              style={{ position: 'relative', margin: 'auto', width: '100%', maxWidth: 380, background: 'rgba(8,14,24,0.98)', border: `1px solid ${top.color}55`, borderRadius: 18, padding: '1.1rem 1rem 1.2rem', boxShadow: `0 0 30px ${top.color}22` }}
            >
              <CloseButton onClick={() => setClassDetail(null)} style={{ position: 'absolute', top: 8, right: 10, zIndex: 3 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
                <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: `${top.color}20`, border: `1px solid ${top.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: top.color }}>{top.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.1 }}>{top.name}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.66rem', color: top.color, lineHeight: 1.3, marginTop: 1 }}>{top.tagline}</p>
                </div>
              </div>
              {combined.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 12px' }}>
                  <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#8a8480', alignSelf: 'center' }}>Combined</span>
                  {combined.map((c, i) => (
                    <span key={i} className="font-karla font-700" style={{ fontSize: '0.66rem', color: top.color, background: `${top.color}18`, border: `1px solid ${top.color}44`, borderRadius: 999, padding: '0.15rem 0.55rem' }}>{c}</span>
                  ))}
                </div>
              )}
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: '#8a8480', marginBottom: 7 }}>{tiers.length === 1 ? 'Your tier' : `Your ${tiers.length} tiers, stacked`}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tiers.map(t => (
                  <div key={t.id} style={{ padding: '0.6rem 0.7rem', borderRadius: 11, background: `${t.color}0e`, border: `1px solid ${t.color}33` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>{t.name}</p>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {t.bullets.map((b, i) => (
                          <span key={i} className="font-karla font-700" style={{ fontSize: '0.56rem', color: b.positive ? '#8fd39a' : '#d99', whiteSpace: 'nowrap' }}>{b.label}</span>
                        ))}
                      </span>
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#9a948c', lineHeight: 1.4, marginTop: 3 }}>{t.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )
        })()}
      </PopupShell>

      {/* Cinematic forge — the two components slam together and the forged item
          erupts out. Portaled to body so the loadout drawer's transforms can't
          anchor it. */}
      {forgeFx && createPortal(
        <ForgeAnimation
          compImages={forgeFx.compImages}
          result={forgeFx.result}
          accent={forgeFx.accent}
          abyssal={forgeFx.abyssal}
          ready={forgeReady}
          onDone={() => { setForgeFx(null); router.refresh() }}
        />,
        document.body,
      )}

      {/* "The Forge Awakens" — one-time unlock celebration + how-to. */}
      {showForgeIntro && createPortal(
        <ForgeIntroOverlay onDone={() => setShowForgeIntro(false)} />,
        document.body,
      )}

      {/* Reopenable "How the Forge works" help. */}
      {showForgeHelp && createPortal(
        <ForgeHelpModal onClose={() => setShowForgeHelp(false)} />,
        document.body,
      )}

      {/* "Recipe Unlocked" — prismatic reveal each time a recipe is learned. */}
      {learnReveal && createPortal(
        <RecipeUnlockedOverlay name={learnReveal.name} image={learnReveal.image} onDone={() => setLearnReveal(null)} />,
        document.body,
      )}
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
  const currentTier = shipTierByName(shipStats.name)
  const nextTier = currentTier + 1
  // AGAINST THE TOP TIER, not the array's length. Those were the same number
  // until the bottom two rungs came off; `nextTier >= SHIPS.length` would now
  // call a Brigantine captain maxed out and hide the two hulls above them.
  const atMax = currentTier >= MAX_SHIP_TIER
  const nextShip = atMax ? null : nextHull(currentTier)
  const nextCombat = atMax ? null : EXPEDITION_SHIP_STATS[nextTier]
  const currentShip = getShip(currentTier)
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

// The rules of the Forge — shown on first unlock (ForgeIntroOverlay) and any
// time from the "How it works" link (ForgeHelpModal). One source of truth.
const FORGE_RULES: { title: string; body: string }[] = [
  { title: 'Fuse two into one', body: 'A recipe melds two relics into a single forged item that carries BOTH their effects in one loadout slot.' },
  { title: 'Learn, then forge', body: 'Spend Fathoms once to learn a recipe. When you own both components, forge it — forging sacrifices the two components for good.' },
  { title: 'Refarming components', body: "You only ever hold one of each relic — a boss won't drop one you already own. To get another copy of a component, forge (spend) the one you have first; then it can drop again." },
  { title: 'No doubling up', body: "A forged item can't be equipped beside its own ingredients (or another grade of them). Equipping the fusion swaps the conflicting relic out, so the same effect never stacks twice." },
  { title: 'Mix different fusions', body: 'Two DIFFERENT forged items CAN ride together — that pairing is a real build, not blocked. Only a fusion + its own parts conflict.' },
  { title: 'Chase the legendary', body: "Boss-drop recipes call for the legendary grade (a Prime or master-craft relic), so every fusion is a real chase." },
]

function ForgeRules() {
  return (
    <div style={{ width: '100%', maxWidth: 380, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9, textAlign: 'left' }}>
      {FORGE_RULES.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.7rem 0.8rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <span className="font-cinzel font-800" style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#0c0f16', background: 'linear-gradient(135deg, #e7c8a0, #c9a7ff)' }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0e6d0', lineHeight: 1.12 }}>{r.title}</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a8a298', lineHeight: 1.45, marginTop: 2 }}>{r.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// One-time "The Forge Awakens" celebration + how-to — fires the first time the
// player opens the Forge after unlocking it. Big, prismatic, then the rules.
function ForgeIntroOverlay({ onDone }: { onDone: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(3,5,10,0.94)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflowY: 'auto', padding: '2.2rem 1.4rem calc(env(safe-area-inset-bottom, 0px) + 2rem)', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 116, height: 116, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <motion.div aria-hidden initial={{ opacity: 0, scale: 0.6, rotate: 0 }} animate={{ opacity: 0.45, scale: 1, rotate: 360 }} transition={{ opacity: { duration: 0.6 }, scale: { duration: 0.7 }, rotate: { duration: 26, repeat: Infinity, ease: 'linear' } }}
          style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: 'conic-gradient(from 0deg, rgba(255,107,139,0), rgba(255,211,107,0.5), rgba(123,224,163,0), rgba(95,179,255,0.5), rgba(197,139,255,0), rgba(255,107,139,0.5), rgba(255,107,139,0))' }} />
        <motion.div initial={{ scale: 0.4, opacity: 0, y: 10 }} animate={{ scale: [0.4, 1.15, 1], opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1.3, 0.4, 1] }}
          style={{ position: 'relative', width: 104, height: 104, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(255,150,70,0.22), rgba(6,10,16,0.72) 72%)', ...prismaticBorder('rgba(8,10,16,0.85)') }}>
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#ffce8a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h9l3-3 4 1-2 4h-5" /><path d="M7 10v3a3 3 0 0 0 3 3h1" /><path d="M8 21h6" /><path d="M11 16v5" /></svg>
        </motion.div>
      </div>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: '#c9a7ff', marginTop: 18 }}>Unlocked</motion.p>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }} className="font-cinzel font-800" style={{ fontSize: '1.85rem', lineHeight: 1.05, marginTop: 6, ...PRISMATIC_TEXT }}>The Forge Awakens</motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="font-karla" style={{ fontSize: '0.82rem', color: '#b9b2a6', lineHeight: 1.5, marginTop: 10, maxWidth: 340 }}>
        Bring your rarest relics and fuse them — two powers into a single slot. Here is how it works:
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ForgeRules />
      </motion.div>
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }} onClick={onDone} className="font-cinzel font-700 uppercase tracking-[0.1em] tap"
        style={{ marginTop: 22, padding: '0.8rem 2.2rem', borderRadius: 12, fontSize: '0.82rem', color: '#f0d695', flexShrink: 0, ...prismaticBorder('rgba(20,16,10,0.92)') }}>
        Enter the Forge
      </motion.button>
    </motion.div>
  )
}

// Reopenable "How the Forge works" — same rules, no celebration. Opened from the
// "How it works" link in the Forge tab.
function ForgeHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(3,5,10,0.92)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflowY: 'auto', padding: '2.2rem 1.4rem calc(env(safe-area-inset-bottom, 0px) + 2rem)', textAlign: 'center' }}>
      <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.05, marginTop: 6, flexShrink: 0, ...PRISMATIC_TEXT }}>How the Forge Works</p>
      <ForgeRules />
      <button onClick={onClose} className="font-cinzel font-700 uppercase tracking-[0.1em] tap"
        style={{ marginTop: 22, padding: '0.75rem 2.2rem', borderRadius: 12, fontSize: '0.8rem', color: '#f0d695', flexShrink: 0, ...prismaticBorder('rgba(20,16,10,0.92)') }}>
        Got it
      </button>
    </motion.div>
  )
}

// "Recipe Unlocked" — a prismatic reveal each time a recipe is learned. Tap
// anywhere to dismiss. The result art may be pending (emoji/anvil fallback).
function RecipeUnlockedOverlay({ name, image, onDone }: { name: string; image: string | null; onDone: () => void }) {
  return (
    <motion.div data-any-key initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDone}
      style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(3,5,10,0.9)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: 130, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div aria-hidden initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ position: 'absolute', width: 210, height: 210, borderRadius: '50%', background: 'radial-gradient(circle, rgba(197,139,255,0.5), rgba(127,208,255,0.14) 45%, transparent 72%)' }} />
        <motion.div initial={{ scale: 0.4, opacity: 0, y: 10 }} animate={{ scale: [0.4, 1.15, 1], opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1.3, 0.4, 1] }}
          style={{ position: 'relative', width: 108, height: 108, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(197,139,255,0.16), rgba(6,10,16,0.72) 72%)', ...prismaticBorder('rgba(8,10,16,0.85)') }}>
          {image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={image} alt={name} style={{ width: 62, height: 62, objectFit: 'contain' }} />
            : <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#e6d4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h9l3-3 4 1-2 4h-5" /><path d="M7 10v3a3 3 0 0 0 3 3h1" /><path d="M8 21h6" /><path d="M11 16v5" /></svg>}
        </motion.div>
      </div>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: '#c9a7ff', marginTop: 22 }}>Recipe Unlocked</motion.p>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="font-cinzel font-800" style={{ fontSize: '1.6rem', lineHeight: 1.08, marginTop: 6, ...PRISMATIC_TEXT }}>{name}</motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.44 }} className="font-karla" style={{ fontSize: '0.8rem', color: '#b9b2a6', lineHeight: 1.5, marginTop: 10, maxWidth: 300 }}>
        You can forge this now. Gather its components and bring them to the anvil.
      </motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: '#7a7470', marginTop: 22 }}>Tap to continue</motion.p>
    </motion.div>
  )
}

// Cinematic raid-item forge. The component artworks fly in from the sides and
// collide; a flash + ember burst fires; then the forged item springs out with
// rays and a name reveal. Auto-reveals once `ready` (the server forge landed).
function ForgeAnimation({ compImages, result, accent, abyssal = false, ready, onDone }: {
  compImages: (string | null)[]
  result: { name: string; image: string | null }
  accent: string
  /** Tier-3 Abyssal fusion — plays the elevated, longer, molten variant. */
  abyssal?: boolean
  ready: boolean
  onDone: () => void
}) {
  // merge (components fly in) → clash (collision flash/sparks) → reveal (forged
  // item out). Reveal waits for the slam to finish AND the server to confirm,
  // so a fast server never skips the clash beat. The Abyssal path adds a CHARGE
  // beat before the clash (energy drawn inward) and dresses every stage in the
  // molten ember palette so a tier-3 forge reads as a clear step above.
  const EMBER = '#ff5a3c'
  const GREEN = '#3fbf82'
  const GOLD = '#ffd98a'
  const chrome = abyssal ? EMBER : accent
  // The Abyssal combine is deliberately slow — a long draw-in and hang before a
  // weighty slam, so it reads as ceremony rather than a snap.
  const CLASH_AT = abyssal ? 1750 : 900
  const SLAM_AT = abyssal ? 2200 : 1180

  const [charging, setCharging] = useState(false)
  const [clashed, setClashed] = useState(false)
  const [slamDone, setSlamDone] = useState(false)
  const revealed = slamDone && ready
  useEffect(() => {
    const tc = abyssal ? setTimeout(() => setCharging(true), 320) : null
    const t1 = setTimeout(() => {
      setClashed(true)
      vibrate(abyssal ? [0, 60, 40, 95, 30, 70] : [0, 40, 35, 70])
      import('@/lib/fishingMusic').then(m => (abyssal ? m.playAbyssalForgeSfx() : m.playForgeSfx(false))).catch(() => {})
    }, CLASH_AT)
    const t2 = setTimeout(() => setSlamDone(true), SLAM_AT)
    return () => { if (tc) clearTimeout(tc); clearTimeout(t1); clearTimeout(t2) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Punctuate the moment the Abyssal item lands with a payoff haptic.
  useEffect(() => {
    if (revealed && abyssal) vibrate([0, 26, 22, 46])
  }, [revealed, abyssal])

  const sparkCount = abyssal ? 24 : 18
  const sparks = useMemo(() => Array.from({ length: sparkCount }, (_, n) => {
    const ang = (Math.PI * 2 * n) / sparkCount + (n % 2) * 0.3
    const dist = (abyssal ? 92 : 70) + (n % 4) * 24
    // Abyssal sparks cycle ember → gold → abyssal-green; the standard forge is warm only.
    const tone = abyssal ? (n % 3) : (n % 3 === 0 ? 0 : 1)
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, size: 3 + (n % 3), dur: 0.5 + (n % 4) * 0.13, tone }
  }), [sparkCount, abyssal])
  const sparkColor = (tone: number) => (tone === 0 ? EMBER : tone === 1 ? GOLD : GREEN)

  // Inward-streaming motes while the Abyssal forge draws its charge. Transform +
  // opacity only, so the loop stays on the compositor and never janks.
  const gatherMotes = useMemo(() => (abyssal ? Array.from({ length: 10 }, (_, n) => {
    const ang = (Math.PI * 2 * n) / 10 + (n % 3) * 0.5
    const dist = 118 + (n % 4) * 18
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, size: 3 + (n % 2), dur: 0.62 + (n % 4) * 0.12, delay: (n % 5) * 0.1, green: n % 2 === 0 }
  }) : []), [abyssal])

  // One-shot impact shake for the Abyssal strike — a decaying jolt, transform only.
  const shake = abyssal && clashed
    ? { x: [0, -9, 7, -6, 4, -2, 0], y: [0, 5, -4, 3, -2, 1, 0] }
    : { x: 0, y: 0 }
  const stageW = abyssal ? 280 : 240
  const stageH = abyssal ? 236 : 200

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1500, background: abyssal ? 'radial-gradient(ellipse at center, rgba(26,5,11,0.94), rgba(2,4,8,0.97))' : 'rgba(3,6,11,0.9)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
    >
      {/* Abyssal full-bleed flash on the strike — a hard white pop bleeding to ember. */}
      {abyssal && clashed && (
        <motion.div aria-hidden initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, ${EMBER}55 32%, transparent 64%)`, pointerEvents: 'none', willChange: 'opacity' }} />
      )}

      <p className="font-karla font-800 uppercase" style={{ fontSize: abyssal ? '0.64rem' : '0.6rem', letterSpacing: '0.3em', color: `${chrome}dd`, marginBottom: 24, textShadow: abyssal ? `0 0 18px ${EMBER}88` : 'none' }}>
        {abyssal ? (revealed ? 'Forged in the Abyss' : 'The Abyssal Forge') : (revealed ? 'Forged' : 'The Forge')}
      </p>

      <motion.div
        animate={shake}
        transition={abyssal && clashed ? { duration: 0.5, ease: 'easeOut' } : { duration: 0 }}
        style={{ position: 'relative', width: stageW, height: stageH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Abyssal charge — a pulsing core + motes drawn inward before the strike. */}
        {abyssal && charging && !clashed && (
          <>
            <motion.div aria-hidden initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0.15, 0.55, 0.15], scale: [0.75, 1.18, 0.75] }} transition={{ duration: 0.75, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', background: `radial-gradient(circle, ${EMBER}40, ${GREEN}14 45%, transparent 70%)`, willChange: 'transform, opacity' }} />
            {gatherMotes.map((m, n) => (
              <motion.div key={`g${n}`} aria-hidden
                initial={{ x: m.x, y: m.y, opacity: 0, scale: 0.6 }}
                animate={{ x: 0, y: 0, opacity: [0, 0.95, 0], scale: 0.2 }}
                transition={{ duration: m.dur, repeat: Infinity, delay: m.delay, ease: 'easeIn' }}
                style={{ position: 'absolute', width: m.size, height: m.size, borderRadius: '50%', background: m.green ? GREEN : EMBER, boxShadow: `0 0 6px ${m.green ? GREEN : EMBER}`, willChange: 'transform, opacity' }} />
            ))}
          </>
        )}

        {/* Clash flash */}
        {clashed && (
          <motion.div aria-hidden initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: abyssal ? 3.4 : 2.6, opacity: 0 }} transition={{ duration: abyssal ? 0.55 : 0.5, ease: 'easeOut' }}
            style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${chrome}cc 36%, transparent 72%)`, willChange: 'transform, opacity' }} />
        )}
        {/* Abyssal triple shockwave — white core, ember ring, abyss-green ring. */}
        {abyssal && clashed && ['#ffffff', EMBER, GREEN].map((c, i) => (
          <motion.div key={`sw${i}`} aria-hidden initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
            style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', border: `${i === 0 ? 3 : 2}px solid ${c}`, boxShadow: `0 0 18px ${c}77`, willChange: 'transform, opacity' }} />
        ))}
        {/* Ember burst */}
        {clashed && sparks.map((s, n) => (
          <motion.div key={n} aria-hidden initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.3 }} transition={{ duration: s.dur, ease: 'easeOut' }}
            style={{ position: 'absolute', width: s.size, height: s.size, borderRadius: '50%', background: sparkColor(s.tone), boxShadow: `0 0 6px ${sparkColor(s.tone)}`, willChange: 'transform, opacity' }} />
        ))}

        {/* Components fly in, hang at the ready, then slam together and vanish.
            Abyssal ones carry an ember rim as the charge builds. */}
        {!revealed && compImages.map((img, i) => (
          <motion.img
            key={i} src={img ?? undefined} alt="" aria-hidden
            initial={{ x: i === 0 ? -150 : 150, opacity: 0, rotate: i === 0 ? -18 : 18 }}
            animate={clashed ? { x: 0, opacity: 0, scale: 0.55 } : { x: i === 0 ? (abyssal ? -58 : -52) : (abyssal ? 58 : 52), opacity: 1, rotate: 0, scale: 1 }}
            transition={clashed ? { duration: abyssal ? 0.28 : 0.2, ease: 'easeIn' } : { duration: abyssal ? 1.35 : 0.85, ease: [0.4, 0, 0.7, 1] }}
            style={{ position: 'absolute', width: 92, height: 92, objectFit: 'contain', filter: abyssal ? `drop-shadow(0 0 12px ${EMBER}99) drop-shadow(0 4px 12px rgba(0,0,0,0.6))` : 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))', willChange: 'transform, opacity' }}
          />
        ))}

        {/* The forged item erupts out */}
        {revealed && (
          <>
            {/* Abyssal reveal: a rising column of light, an iridescent aura, and an
                ember halo. Standard forge keeps its single-accent conic ring. */}
            {abyssal && (
              <motion.div aria-hidden initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: [0, 0.85, 0] }} transition={{ duration: 0.95, ease: 'easeOut' }}
                style={{ position: 'absolute', width: 84, height: 300, transformOrigin: 'center 62%', background: `linear-gradient(to top, transparent, ${EMBER}66 30%, ${GREEN}44 60%, transparent)`, filter: 'blur(3px)', willChange: 'transform, opacity' }} />
            )}
            <motion.div aria-hidden initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: abyssal ? 0.6 : 0.5, rotate: 360 }}
              transition={{ opacity: { duration: 0.5 }, rotate: { duration: abyssal ? 15 : 22, repeat: Infinity, ease: 'linear' } }}
              style={{ position: 'absolute', width: abyssal ? 320 : 300, height: abyssal ? 320 : 300, borderRadius: '50%', willChange: 'transform',
                background: abyssal
                  ? `conic-gradient(from 0deg, ${GREEN}00, ${GREEN}55, ${GOLD}00, ${GOLD}55, ${EMBER}00, ${EMBER}55, ${GREEN}00, ${GOLD}55, ${GREEN}00)`
                  : `conic-gradient(from 0deg, ${accent}00, ${accent}44, ${accent}00, ${accent}44, ${accent}00, ${accent}44, ${accent}00)` }} />
            {abyssal && (
              <motion.div aria-hidden initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0.35, 0.68, 0.35], scale: [1, 1.12, 1] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle, ${EMBER}30, transparent 68%)`, willChange: 'transform, opacity' }} />
            )}
            {result.image ? (
              <motion.img
                src={result.image} alt={result.name}
                initial={{ scale: 0.3, opacity: 0, y: 10 }} animate={{ scale: abyssal ? [0.3, 1.26, 1] : [0.3, 1.18, 1], opacity: 1, y: 0 }}
                transition={{ duration: abyssal ? 0.6 : 0.55, ease: [0.22, 1.3, 0.4, 1] }}
                style={{ position: 'relative', width: abyssal ? 142 : 132, height: abyssal ? 142 : 132, objectFit: 'contain', filter: abyssal ? `drop-shadow(0 0 30px ${EMBER}bb) drop-shadow(0 0 52px ${GREEN}66) drop-shadow(0 6px 16px rgba(0,0,0,0.7))` : `drop-shadow(0 0 28px ${accent}aa) drop-shadow(0 6px 14px rgba(0,0,0,0.6))`, willChange: 'transform' }}
              />
            ) : (
              // Art pending — a forged-medallion placeholder (accent ring + anvil)
              // so the reveal reads clean until the fused-item sprite lands.
              <motion.div
                initial={{ scale: 0.3, opacity: 0, y: 10 }} animate={{ scale: abyssal ? [0.3, 1.26, 1] : [0.3, 1.18, 1], opacity: 1, y: 0 }}
                transition={{ duration: abyssal ? 0.6 : 0.55, ease: [0.22, 1.3, 0.4, 1] }}
                style={{ position: 'relative', width: 132, height: 132, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle, ${chrome}2e, rgba(6,10,16,0.65) 72%)`, border: `2px solid ${chrome}88`, filter: `drop-shadow(0 0 28px ${chrome}aa)` }}
              >
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={chrome} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 10h9l3-3 4 1-2 4h-5" /><path d="M7 10v3a3 3 0 0 0 3 3h1" /><path d="M8 21h6" /><path d="M11 16v5" />
                </svg>
              </motion.div>
            )}
          </>
        )}
      </motion.div>

      {revealed ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ textAlign: 'center', marginTop: 18 }}>
          {abyssal && (
            <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.5rem', color: `${EMBER}dd`, marginBottom: 5 }}>Tier III · Abyssal</p>
          )}
          <p className="font-cinzel font-800" style={{ fontSize: abyssal ? '1.5rem' : '1.35rem', color: chrome, lineHeight: 1.1, textShadow: abyssal ? `0 0 24px ${EMBER}88, 0 0 40px ${GREEN}44` : `0 0 22px ${accent}66` }}>{result.name}</p>
          <button onClick={onDone} className="font-cinzel font-700 uppercase tracking-[0.1em] tap"
            style={{ marginTop: 20, padding: '0.7rem 1.7rem', borderRadius: 12, background: `${chrome}26`, border: `1px solid ${chrome}66`, color: chrome, fontSize: '0.8rem', cursor: 'pointer', boxShadow: abyssal ? `0 0 20px ${EMBER}33` : 'none' }}>
            Claim it
          </button>
        </motion.div>
      ) : (
        <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a8480', marginTop: 18 }}>{abyssal ? 'The abyss takes them both…' : 'Hammering it into one…'}</p>
      )}
    </motion.div>
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
        <CloseButton onClick={onClose} size={28} />
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

        {/* Fortune's own line. This panel is where a captain comes to learn what
            their raid stats DO, and it mentioned Fortune only as a footnote on
            repair kits, because for a long time that was all it did in a raid.
            It now moves drop odds and crate doubloons too, and a stat's biggest
            effect should not be missing from the page that explains the stats.
            Deliberately no live multiplier here: this panel takes no crew totals,
            and a number that could not update would be worse than none. The
            pre-fight sheet prints the live figure. */}
        <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(240,192,64,0.18)' }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.74rem', color: '#f0c040', marginBottom: '0.4rem' }}>Fortune</p>
          <p className="font-karla" style={{ fontSize: '0.84rem', color: '#dccaa4', lineHeight: 1.5 }}>
            Your crew&apos;s luck, and it pays three ways in a raid. It raises the odds on every{' '}
            <span style={{ color: '#f0ede8', fontWeight: 600 }}>item drop</span>, up to double at high crew Fortune,
            scales the <span style={{ color: '#f0ede8', fontWeight: 600 }}>doubloons</span> in the crate, and lifts
            what your <span style={{ color: '#f0ede8', fontWeight: 600 }}>repair kits</span> heal.
          </p>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6a60', marginTop: 6 }}>
            The exact drop odds for a raid are listed on its stats sheet before the fight.
          </p>
        </div>
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
