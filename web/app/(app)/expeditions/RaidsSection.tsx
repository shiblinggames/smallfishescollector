'use client'

import SpoilsBoard from './SpoilsBoard'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { bossIdentityRevealed, bossListedInRoster, nodeArtRevealed, formatDropChance, isCombatNode, isChallengeVariant, chapterForNode, RAID_CHAPTERS, musterSceneLines, SCENE_BACKDROPS, type RaidChapter, type RaidNodeDrop, type RaidNodeView } from '@/lib/raidMap'
import type { RaidRecords } from './raidMapActions'
import { RARITY_COLOR, GEM_GLYPH, GEM_COLOR, RAID_LOCATION_BG, RAID_BOSS_BG, type BossRaidConfig} from '@/lib/bossRaids'
import { getRaidItem } from '@/lib/raidItems'
import ItemEffectLines from '@/components/ItemEffectLines'
import { getRaidConfigById } from '@/lib/raidRegistry'
import { isUniqueLoot } from '@/lib/bossRaids'
import { crateItemChances, isChallengeRaid } from '@/lib/raidLoot'
import { fortuneLootMult } from '@/lib/expeditions'
import { getShipSkin } from '@/lib/shipSkins'
import { SPECIAL_ITEMS } from '@/lib/specialItems'
import { FINN_ITEMS, finnTierNumeral, type FinnItemId } from '@/lib/finnItems'
import { claimMilestoneNode, markStoryNodeRead, claimScoutDebt, claimQuartermasterChoice, solvePuzzleNode, pickShipClass, markChapterUnlockSeen, pickRaidEventChoice, pickForkRoute, standForMuster } from './raidMapActions'
import { LegendaryUnlockOverlay } from './LegendaryUnlockOverlay'
import type { UnlockedLegendary } from '@/lib/legendaryUnlocks'
import { musterReport, type MusterCrew } from '@/lib/crewMuster'
import { repairShip } from '@/app/(app)/raids/actions'
import { markUltimateUnlockSeen } from './actions'
import { ULTIMATE_STORY } from '@/lib/shipAugments'
import { getShipClass, offeredShipClasses } from '@/lib/shipClasses'
import BeaconChainPuzzle from './BeaconChainPuzzle'
import CipherDialsPuzzle from './CipherDialsPuzzle'
import MirrorRunPuzzle from './MirrorRunPuzzle'
import CargoShufflePuzzle from './CargoShufflePuzzle'
import TumblerLockPuzzle from './TumblerLockPuzzle'
import DiceRollNode from './DiceRollNode'
import DpsCheckNode from './DpsCheckNode'
import StoryScene from './StoryScene'
import { getGauntletLeaderboard } from '@/app/(app)/raids/gauntlet/actions'
import { IconLock, IconCrate } from '@/components/GameIcons'

// Single parchment-gold accent for every main-chain node. Earlier this
// was a six-color per-type palette (cyan/ember/gold/violet/sage/blue),
// which left the map reading as visually loud — the player's eye got
// pulled in six directions and the route never felt cohesive. With one
// accent, TYPE is communicated by the GLYPH (cutlasses vs skull vs
// market stall vs book vs beacon vs star) and the node's own portrait
// image, not by hue. Status (cleared/locked/repair-blocked) and side-
// branch challenges still get their own colors below — those are
// signal, not flavor.
const MAIN_ACCENT = '#c4a96a'

// Default art per node type, used when a node has no own `image`. Lets
// every shop (and any future shops) share one icon without per-node data.
const TYPE_IMAGE: Record<string, string | undefined> = {
  shop:   '/raidshop.png',
  puzzle: '/puzzle.png',
  reclaim: '/raidshop.png',
}

/** elapsed_ms → "M:SS" for the Boss Records block.
 *
 *  TRUNCATE, never round. This rounded, and the victory screen (fmtTime in
 *  RaidLootStage) floors, so a 65,891 ms clear finished as 1:05 and then showed
 *  up on the boss card as 1:06. The record was stored fine; it just read as a
 *  second slower than the run the player watched, which looks exactly like
 *  somebody else holding it.
 *
 *  A stopwatch does not round up. 65.891s is 1:05 until the second ticks over. */
function formatRaidMs(ms: number): string {
  if (!ms || ms < 0) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Side branches (the Quartermaster's Ghost today, and challenge raids before
// the spine stopped drawing them) wear red: "off the main line". The journey
// spine reads this for the indent accent.
const SIDE_BRANCH_ACCENT = '#ef4444'

function NodeGlyph({ type, color, size = 22 }: { type: string; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  // skirmish: crossed cutlasses (a single duel)
  if (type === 'skirmish') return <svg {...common}><path d="M3 17l6-6M14.5 6.5L21 13M6 21l-3-3M9 3l12 12-3 3L6 6z" /></svg>
  // raid: skull (the boss campaign)
  if (type === 'raid') return (
    <svg {...common}>
      <path d="M12 3c-4.4 0-8 3.2-8 7.4 0 2.4 1.2 4.5 3 5.9V19a1 1 0 0 0 1 1h1.6v-2h2.8v2H17a1 1 0 0 0 1-1v-2.7c1.8-1.4 3-3.5 3-5.9C21 6.2 17.4 3 13 3z" />
      <circle cx="9.4" cy="11" r="1.5" fill={color} stroke="none" />
      <circle cx="14.6" cy="11" r="1.5" fill={color} stroke="none" />
      <path d="M11 14.5h2" />
    </svg>
  )
  // gauntlet: a maelstrom (the hole in the seabed you climb back out of)
  if (type === 'gauntlet') return <svg {...common}><path d="M12 12a2.5 2.5 0 1 0 2.5 2.5M14.5 14.5A4.7 4.7 0 0 1 7 14a6.8 6.8 0 0 1 9.4-6.2A9 9 0 0 1 4.5 18.5" /></svg>
  // shop: market stall
  if (type === 'shop') return <svg {...common}><path d="M3 9l1.5-5h15L21 9M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 13h6" /></svg>
  // muster: the clerk's ledger, and a tick against your name
  if (type === 'muster') return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3h6v3H9z" /><path d="m9 13 2 2 4-4" /></svg>
  // berth: stacked bunks (the crew refit)
  if (type === 'berth') return <svg {...common}><path d="M5 4v16M19 4v16M5 10h14M5 16h14" /><circle cx="8.6" cy="7.6" r="1.3" fill={color} stroke="none" /><circle cx="8.6" cy="13.6" r="1.3" fill={color} stroke="none" /></svg>
  // story: open book
  if (type === 'story') return <svg {...common}><path d="M12 6.5C10.5 5 8 4.5 4 5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5V5c-4-.5-6.5 0-8 1.5zM12 6.5V19" /></svg>
  // puzzle: a signal beacon flame (light the chain)
  if (type === 'puzzle') return <svg {...common}><path d="M12 2c1.6 3 5 4.6 5 9a5 5 0 0 1-10 0c0-2 .8-3.2 2-4.2.2 1.2 1 1.9 1.9 2.1C11.8 6.6 11 4.1 12 2z" /></svg>
  // event: forked path (a decision beat)
  if (type === 'event') return <svg {...common}><path d="M12 3v6M12 9l-5 6M12 9l5 6M5 17l2 4M19 17l-2 4M5 17h4M15 17h4" /></svg>
  // fork: a road splitting two ways (a chosen route)
  if (type === 'fork') return <svg {...common}><path d="M12 21v-7M12 14l-5-7M12 14l5-7M5 5l2 2 2-2M15 5l2 2 2-2" /></svg>
  // class_pick: ship wheel (Captain's Choice)
  if (type === 'class_pick') return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
      <path d="M12 2v4 M12 18v4 M2 12h4 M18 12h4 M5 5l2.8 2.8 M16.2 16.2L19 19 M19 5l-2.8 2.8 M7.8 16.2L5 19" />
    </svg>
  )
  // milestone (default): treasure star
  return <svg {...common}><path d="M12 2l2.4 6.9H22l-6 4.5 2.3 7L12 16.9 5.7 20.4 8 13.4 2 8.9h7.6z" /></svg>
}

// Map raw RaidNodeType keys to player-facing labels. The raw enum values
// (e.g. 'class_pick') get surfaced in the detail sheet's eyebrow chip;
// without this they'd render as the literal "class_pick" with underscore.
function nodeTypeLabel(type: string): string {
  switch (type) {
    case 'skirmish':   return 'Skirmish'
    case 'raid':       return 'Raid'
    case 'milestone':  return 'Milestone'
    case 'shop':       return 'Shop'
    case 'story':      return 'Story'
    case 'puzzle':     return 'Puzzle'
    case 'class_pick': return 'Class'
    case 'event':      return 'Event'
    case 'gauntlet':   return 'Gauntlet'
    case 'fork':       return 'Crossroads'
    case 'reclaim':    return 'Vault'
    case 'berth':      return 'Refit'
    case 'dps_check':  return 'Gate'
    case 'muster':     return 'Muster'
    case 'dice':       return 'Gamble'
    default:           return type
  }
}

// flexShrink 0 because it sits in a flex row beside a lock reason, and a reason
// long enough to wrap onto a second line was squashing the padlock out of shape.
function LockGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/* ─────────────────────────── The map ─────────────────────────── */

// ─── Progressive reveal ─────────────────────────────────────────────────
// How many locked main-chain nodes past the current "available" one stay
// visible at a glance. Anything further is fogged out (no token, just the
// route line still passes through the position). The chapter's LAST
// main-chain node is always shown as a faded beacon — destination known,
// path uncharted. This trades the Slay-the-Spire planning view for an
// exploration feel that suits a linear chapter map better.
const REVEAL_AHEAD = 2

/* ───────────────────────── Detail sheet ───────────────────────── */

// Intro cutscenes (milestone/event nodes with a scene) gate the sheet's
// interactive bits behind a first watch, but watching isn't persisted
// server-side — only the claim/choice is. Remember watched node ids for
// the lifetime of the page load so reopening the sheet (e.g. coming
// back with enough ⟡ for a toll) doesn't force a rewatch; a fresh page
// load re-gates, and Skip is one tap.
const seenIntroScenes = new Set<string>()

// A simple atmospheric backdrop for a non-boss node pop-up: the chapter's
// location art (borrowed from that chapter's boss), so a chapter's node sheets
// share a consistent scene, echoing the boss cards' custom backdrops.
function sheetChapterBg(nodeId: string, views: RaidNodeView[]): string | undefined {
  const cid = chapterForNode(nodeId).id
  const boss = views.find(v => v.node.type === 'raid' && !v.node.sideBranch && chapterForNode(v.node.id).id === cid)
  return boss?.node.raidId ? (RAID_LOCATION_BG[boss.node.raidId] ?? RAID_BOSS_BG[boss.node.raidId]) : undefined
}


/**
 * The live drop chance for one row of a boss's crate, as a display string.
 *
 * ONE definition, used by the node sheet, the Bosses tab and the drop-detail
 * modal. It existed as two hand-written copies inside render callbacks, which
 * is how the modal ended up quoting RaidNodeDrop.chance (baked at map-build
 * time from `weight / total`, i.e. the pre-rarity-rule, pre-Fortune model)
 * while the chip that opened it showed the real number.
 *
 * Reads crateItemChances, the same function rollCrate uses, so a rate on screen
 * is a rate the boss rolls against.
 */
function makeLiveChance(
  cfg: BossRaidConfig | undefined,
  ownedRaidItems: string[],
  ownedShipSkins: string[],
  totalFortune: number,
  ownedSpecialItems: string[] = [],
) {
  // THREE places an owned unique can live, and the boss cards have to know all
  // of them. Finn's table drops one FISHING SPECIAL (The Primeval Eye), which
  // is a boolean column rather than a raid_items entry -- so checking only
  // raid_items meant a player carrying the Eye still saw it listed as
  // unclaimed on his card, with a live drop rate, forever.
  const dropOwned = (d: RaidNodeDrop): boolean =>
    (!!d.id && (ownedRaidItems.includes(d.id) || ownedSpecialItems.includes(d.id)))
    || (!!d.shipSkinId && ownedShipSkins.includes(d.shipSkinId))
  const lootOwned = (l: { id: string; shipSkinId?: string }): boolean =>
    ownedRaidItems.includes(l.id) || ownedSpecialItems.includes(l.id)
    || (!!l.shipSkinId && ownedShipSkins.includes(l.shipSkinId))
  const liveChance = (d: RaidNodeDrop): string | undefined => {
    if (!cfg || !d.id) return undefined
    const row = cfg.loot.find(l => l.id === d.id)
    if (!row || !isUniqueLoot(row)) return undefined
    if (dropOwned(d)) return 'Owned'
    const owned = new Set(cfg.loot.filter(lootOwned).map(l => l.id))
    const hit = crateItemChances(cfg.loot, owned, cfg.uniqueShare, 1, fortuneLootMult(totalFortune), isChallengeRaid(cfg.raidId))
      .find(c => c.id === d.id)
    return hit ? formatDropChance(hit.chance) : undefined
  }
  return { liveChance, dropOwned, lootOwned }
}

function NodeDetailSheet({
  view,
  backdrop,
  doubloons,
  spoilFree,
  spoilPaid,
  navLevel,
  ownedRaidItems,
  ownedShipSkins, ownedSpecialItems = [], totalFortune = 0,
  equippedRaidItems,
  shipClasses,
  raidRecords,
  pickedEventChoiceId,
  allNodeChoices,
  clearedNodeIds,
  hasSixthBerth,
  hasArmoryExpansion,
  musterParty,
  onClose,
}: {
  view: RaidNodeView
  /** A simple atmospheric backdrop for the sheet (the node's scene backdrop, or
   *  its chapter's location). Layered under a dark scrim so content stays legible. */
  backdrop?: string
  doubloons: number
  spoilFree: string | null
  spoilPaid: string | null
  navLevel: number
  ownedRaidItems: string[]
  ownedShipSkins: string[]
  ownedSpecialItems?: string[]
  /** Crew Fortune, so the drop chances on this sheet match the roll. */
  totalFortune?: number
  equippedRaidItems: string[]
  shipClasses: Record<string, string>
  raidRecords: RaidRecords | null
  /** Ids of every cleared node on the map — lets one node's content gate on
   *  another's clear (the Reclamation vault needs the Quartermaster's
   *  challenge run beaten before it deals). */
  clearedNodeIds: Set<string>
  /** If this is an event node the player has already cleared, which
   *  of its choices did they pick? Drives the "Chosen ✓" badge + the
   *  dimmed-other-options visual state on revisit. */
  pickedEventChoiceId?: string
  /** Every node's recorded choice (raid_node_progress.choices). Lets a
   *  payoff node read a choice made at an EARLIER node (the freed scout). */
  allNodeChoices: Record<string, string>
  /** Owns the Sixth Berth already (the refit node shows "cut" instead of a buy). */
  hasSixthBerth: boolean
  /** Owns the Expanded Armory already (the armory refit node reflects it). */
  hasArmoryExpansion: boolean
  /** The RAID crew, as the don's clerk sees them. Drives the muster checklist. */
  musterParty: MusterCrew[]
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false) // puzzle solved → show the destination
  const [locallyCleared, setLocallyCleared] = useState(false) // berth read this session — the open sheet holds a stale view, so reflect the clear locally
  // Some in-sheet actions clear the node server-side without going through a
  // handler that also refreshes (e.g. the DPS check resolves on FIRE, and the
  // player may dismiss the result via the backdrop). Mark that so ANY close
  // path refreshes the map, or the node stays stale + re-openable.
  const actedRef = useRef(false)
  const closeSheet = () => { if (actedRef.current) router.refresh(); onClose() }
  // Tap a unique-drop chip to inspect it (image, full description,
  // effect breakdown for raid items, drop chance). Cleared by tapping
  // outside the popup or its close button.
  const [selectedDrop, setSelectedDrop] = useState<RaidNodeDrop | null>(null)
  // Component level, because the drop-detail modal below is rendered here and
  // needs the same number the chips inside the drops block show.
  const nodeCfg = view.node.raidId ? getRaidConfigById(view.node.raidId) : undefined
  const { liveChance } = makeLiveChance(nodeCfg, ownedRaidItems, ownedShipSkins, totalFortune, ownedSpecialItems)
  // Dialogue scene overlay (any node with node.scene). Story nodes:
  // first read plays the scene and its final CTA marks the node read.
  // Milestone/event nodes: the scene is an intro cutscene — finishing
  // (or skipping) it just reveals the interactive bits in the sheet,
  // no server write; the claim/choice action stays the clear. Cleared
  // nodes of any type can replay (replay's CTA just closes).
  const [sceneOpen, setSceneOpen] = useState(false)
  // Gauntlet node: deepest-run board (global #1 + this player's best).
  const [gauntletBoard, setGauntletBoard] = useState<{ top: { name: string; depth: number } | null; mine: number } | null>(null)
  /**
   * ARMED, NOT TAKEN. The Cache pick and the Captain's Choice are both permanent
   * and both used the whole card as the button, so one tap anywhere on it spent
   * the choice. A player reported losing his Cache to a tap meant to expand a
   * description clamped at three lines: the gesture for "let me read the rest"
   * and the gesture for "I'll take it forever" were the same gesture.
   *
   * Arming instead is the pattern the Spoils board already uses, and the confirm
   * shows the FULL text, so the tap that used to spend the choice now does the
   * thing he was actually reaching for.
   */
  const [armedChoice, setArmedChoice] = useState<{ kind: 'item' | 'class'; id: string } | null>(null)
  const { node, status, claimable, lockReason } = view
  useEffect(() => {
    if (node.type !== 'gauntlet') return
    let alive = true
    getGauntletLeaderboard().then(b => { if (alive) setGauntletBoard(b) }).catch(() => {})
    return () => { alive = false }
  }, [node.type])
  // Single accent now: matches the unified map palette.
  const accent = MAIN_ACCENT
  const img = (nodeArtRevealed(node, clearedNodeIds) ? node.image : undefined) ?? TYPE_IMAGE[node.type]
  const locked = status === 'locked'
  const cleared = status === 'cleared' || locallyCleared
  const detail = node.detail
  // Payoff node (freed-scout debt): does the player's earlier choice match?
  // Picks which scene plays (met = node.scene, unmet = node.payoff.sceneUnmet).
  const payoffMet = node.payoff ? allNodeChoices[node.payoff.requiresChoice.nodeId] === node.payoff.requiresChoice.choiceId : false
  // Muster nodes play their inspection as a cutscene: the crew read the manifest
  // back and tick it off (musterSceneLines), built live from the report so the
  // lines name the actual hands. Passed → the closing CTA stands the muster;
  // failed → it turns you back to fix your crew.
  const musterRep = node.type === 'muster' && node.muster ? musterReport(node.muster, musterParty) : null
  const sceneLines = node.type === 'muster'
    ? (musterRep ? musterSceneLines(node.id, musterRep) : null)
    : (node.payoff && !payoffMet ? node.payoff.sceneUnmet : node.scene)
  // Non-story node with an unwatched intro cutscene → hide the
  // interactive bits (pay bar / choice cards) and offer the scene CTA
  // instead. Recomputed on every render: finishing the scene adds the
  // id to seenIntroScenes and the setSceneOpen(false) rerender flips
  // this to false, revealing the interaction.
  const introGated = !!node.scene && node.type !== 'story' && !cleared && !locked && !seenIntroScenes.has(node.id)

  const dropsTitle = isCombatNode(node.type)
    ? 'Possible Loot'
    : node.type === 'shop' ? 'Planned Stock'
    : node.type === 'story' ? 'What You Uncover'
    : node.type === 'berth' ? 'The Refit'
    : node.type === 'muster' ? 'The Inspection'
    : 'Reward'

  function claim() {
    setErr(null)
    startTransition(async () => {
      const res = await claimMilestoneNode(node.id)
      if ('error' in res) { setErr(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
      router.refresh()
      onClose()
    })
  }

  function readStory() {
    setErr(null)
    startTransition(async () => {
      // Payoff nodes (the freed-scout debt) grant a conditional reward based on
      // an earlier choice — route them through claimScoutDebt instead of the
      // plain mark-read so the coin/Nav XP actually land.
      const res = node.payoff ? await claimScoutDebt(node.id) : await markStoryNodeRead(node.id)
      if ('error' in res) { setErr(res.error); setSceneOpen(false); return }
      if ('newDoubloons' in res && res.doubloonsDelta !== 0) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
      }
      // Gate node just unlocked a legendary → celebrate. Dispatched as an event
      // because onClose() unmounts this sheet; the RaidsSection root catches it
      // and renders the overlay (which outlives the closing scene).
      if ('unlockedLegendary' in res && res.unlockedLegendary) {
        window.dispatchEvent(new CustomEvent('legendary-unlocked', { detail: res.unlockedLegendary }))
      }
      router.refresh()
      onClose()
    })
  }

  function chooseEvent(choiceId: string) {
    setErr(null)
    startTransition(async () => {
      const res = await pickRaidEventChoice(node.id, choiceId)
      if ('error' in res) { setErr(res.error); return }
      // If the outcome moved doubloons (loot path), the action returned
      // the new total — bump the Nav counter so the +N flies in lieu of
      // a full reload moment. Nav XP outcomes are reflected next refresh.
      if (res.newDoubloons != null) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
      }
      router.refresh()
      onClose()
    })
  }

  function chooseFork(routeId: string) {
    setErr(null)
    startTransition(async () => {
      const res = await pickForkRoute(node.id, routeId)
      if ('error' in res) { setErr(res.error); return }
      // Nav XP from the route reflects on the next refresh (no coin fly).
      router.refresh()
      onClose()
    })
  }

  function chooseItem(itemId: string) {
    setErr(null)
    startTransition(async () => {
      const res = await claimQuartermasterChoice(node.id, itemId)
      if ('error' in res) { setErr(res.error); return }
      router.refresh()
      onClose()
    })
  }

  // Stand for the muster. The server re-runs the SAME musterReport the checklist
  // below renders, so the button can never promise a pass the server then refuses.
  function standMuster() {
    setErr(null)
    startTransition(async () => {
      const res = await standForMuster(node.id)
      if ('error' in res) { setErr(res.error); return }
      actedRef.current = true
      onClose()
      router.refresh()
    })
  }

  // The berth node's clear — same read-persistence as the vault, sheet stays
  // open so the refit offer is right there. Buying is a separate, optional act.
  function openBerth() {
    setErr(null)
    startTransition(async () => {
      const res = await markStoryNodeRead(node.id)
      if ('error' in res) { setErr(res.error); return }
      // Reflect the clear in THIS open sheet (its node view is stale until a
      // reopen): flip the CTA to "Terms Heard" and reveal the refit offer body.
      actedRef.current = true
      setLocallyCleared(true)
      router.refresh()
    })
  }
  function chooseClass(classId: string) {
    setErr(null)
    startTransition(async () => {
      const res = await pickShipClass(node.id, classId)
      if ('error' in res) { setErr(res.error); return }
      router.refresh()
      onClose()
    })
  }

  function solvePuzzle() {
    setErr(null)
    startTransition(async () => {
      const res = await solvePuzzleNode(node.id)
      if ('error' in res) { setErr(res.error); return }
      // The node is CLEARED server-side now, so every exit from this sheet has to
      // refresh the map. actedRef is exactly that contract (see closeSheet), and this
      // path was the one that never signed it: solve the puzzle, then dismiss via the
      // backdrop or the X instead of the reveal CTA, and the node stayed drawn as
      // uncleared with the next node still locked until you navigated away and back.
      // finishReveal() refreshes, but it is only ONE of three ways out.
      actedRef.current = true
      // Stay open and reveal the destination — the Nav XP is already granted.
      setRevealed(true)
    })
  }

  function finishReveal() {
    router.refresh()
    onClose()
  }

  function enter() {
    if (node.route) router.push(node.route)
  }

  // Bottom CTA: varies by node type / state.
  let cta: React.ReactNode = null
  if (isCombatNode(node.type)) {
    cta = (
      <button
        onClick={enter}
        disabled={locked}
        className="font-cinzel font-700 uppercase tracking-[0.06em]"
        style={{
          width: '100%', padding: '0.85rem', borderRadius: 12,
          fontSize: '1rem',
          background: locked ? 'rgba(255,255,255,0.06)' : `${accent}26`,
          border: `1px solid ${locked ? 'rgba(255,255,255,0.1)' : `${accent}66`}`,
          color: locked ? '#5a5856' : accent,
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        {locked ? 'Locked' : node.type === 'skirmish' ? 'Pick One Off →' : cleared ? 'Raid Again →' : 'Enter Raid →'}
      </button>
    )
  } else if (node.type === 'milestone') {
    if (cleared) {
      const doneLabel = node.milestone?.spend ? 'Passage Bought ✓' : 'Backing Secured ✓'
      cta = node.scene ? (
        <button
          onClick={() => setSceneOpen(true)}
          className="font-cinzel font-800 uppercase tracking-[0.04em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', cursor: 'pointer' }}
        >
          {doneLabel} · Watch Again
        </button>
      ) : (
        <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>{doneLabel}</div>
      )
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else if (introGated) {
      // The encounter plays before the toll talk — scene first, pay
      // bar after.
      cta = (
        <button
          onClick={() => setSceneOpen(true)}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: 'pointer' }}
        >
          {detail.ctaLabel ?? 'Continue →'}
        </button>
      )
    } else if (claimable) {
      cta = (
        <button
          onClick={claim}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : node.milestone?.spend ? `Pay · ${node.milestone.amount.toLocaleString()} ⟡` : `Claim${node.milestone?.rewardDoubloons ? ` · +${node.milestone.rewardDoubloons} ⟡` : ''}`}
        </button>
      )
    } else if (node.milestone) {
      const pct = Math.min(1, doubloons / node.milestone.amount)
      cta = (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: '#8a8880' }}>Coffers</span>
            <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: accent }}>
              {Math.min(doubloons, node.milestone.amount).toLocaleString()} / {node.milestone.amount.toLocaleString()} ⟡
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, background: accent, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: 8, textAlign: 'center' }}>
            {node.milestone.spend
              ? `Pay ${node.milestone.amount.toLocaleString()} ⟡ to bribe them into letting you pass.`
              : <>Hold {node.milestone.amount.toLocaleString()} ⟡ at once to claim. You won&apos;t spend it.</>}
          </p>
        </div>
      )
    }
  } else if (node.type === 'shop' && !node.choice) {
    cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Coming Soon</div>
  } else if (node.type === 'story') {
    if (cleared) {
      // With a scene attached, "Logged ✓" doubles as a replay button so
      // players can re-watch any beat they have already read.
      cta = node.scene ? (
        <button
          onClick={() => setSceneOpen(true)}
          className="font-cinzel font-800 uppercase tracking-[0.04em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent, cursor: 'pointer' }}
        >
          Logged ✓ · Read Again
        </button>
      ) : (
        <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Logged ✓</div>
      )
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else {
      cta = (
        <button
          onClick={() => node.scene ? setSceneOpen(true) : readStory()}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : (detail.ctaLabel ?? 'Continue the Story →')}
        </button>
      )
    }
  } else if (node.type === 'muster') {
    // A roster gate: no cost, no fight. Tapping plays the crew read the manifest
    // back as a cutscene (musterSceneLines); it ends by standing the muster if
    // the deck answers, or turning you back if it doesn't.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Passed ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else {
      cta = (
        <button
          onClick={() => setSceneOpen(true)}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : (detail.ctaLabel ?? 'Stand For Inspection →')}
        </button>
      )
    }
  } else if (node.type === 'berth') {
    // The refit offer lives in the body (and stays buyable on every revisit);
    // the CTA only handles the one-time "read" that clears the node.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>{node.armory ? (hasArmoryExpansion ? 'Mount Bolted ✓' : 'Terms Heard ✓') : (hasSixthBerth ? 'Berth Cut ✓' : 'Terms Heard ✓')}</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else {
      cta = (
        <button
          onClick={openBerth}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : (detail.ctaLabel ?? 'Talk to the Yard →')}
        </button>
      )
    }
  } else if (node.type === 'puzzle') {
    // available → the puzzle itself is rendered in the body (auto-solves);
    // cleared/locked just show a status banner here.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>{node.puzzle?.kind === 'cipher' ? 'Manifest Read ✓' : node.puzzle?.kind === 'cargo' ? 'Hold Stowed ✓' : node.puzzle?.kind === 'tumbler' ? 'Gates Thrown ✓' : 'Beacons Lit ✓'}</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    }
  } else if (node.type === 'dice') {
    // available + watched → DiceRollNode in the body owns the interaction (no
    // bottom CTA); intro scene gates it first; cleared/locked show a banner.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>The Bones Fell ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else if (introGated) {
      cta = (
        <button
          onClick={() => setSceneOpen(true)}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: 'pointer' }}
        >
          {detail.ctaLabel ?? 'Throw the Bones →'}
        </button>
      )
    }
  } else if (node.type === 'event') {
    // available → choice cards in the body render their own CTAs, so
    // no bottom button here (unless the intro scene hasn't been watched
    // yet — then the scene CTA gates them). cleared/locked show a
    // status banner; cleared doubles as a scene replay when one exists.
    if (cleared) {
      cta = node.scene ? (
        <button
          onClick={() => setSceneOpen(true)}
          className="font-cinzel font-800 uppercase tracking-[0.04em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent, cursor: 'pointer' }}
        >
          Choice Made ✓ · Watch Again
        </button>
      ) : (
        <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Choice Made ✓</div>
      )
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else if (introGated) {
      cta = (
        <button
          onClick={() => setSceneOpen(true)}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: 'pointer' }}
        >
          {detail.ctaLabel ?? 'Continue →'}
        </button>
      )
    }
  } else if (node.type === 'dps_check') {
    // available → DpsCheckNode in the body owns the interaction (pay or the
    // one-shot aim bar); cleared/locked just show a status banner here.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Through the Wall ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    }
  } else if (node.type === 'gauntlet') {
    // Repeatable daily detour — never "cleared". Locked shows a banner;
    // available routes into the gauntlet page (which owns the daily gate).
    cta = locked ? (
      <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    ) : (
      <button
        onClick={enter}
        className="font-cinzel font-700 uppercase tracking-[0.06em]"
        style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: 'pointer' }}
      >
        {detail.ctaLabel ?? 'Enter the Gauntlet'} →
      </button>
    )
  }

  const sheet = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={closeSheet}
      style={{
        // zIndex sits above Nav + MobileTabBar (both z-50). This is
        // portaled to <body> so it escapes the expeditions page's
        // position:relative;z-index:1 wrapper, otherwise the tab bar
        // (a body-root sibling) paints over the sheet's bottom.
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.66)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        // Keep the sheet clear of the fixed header on tall content
        // (mobile nav ~44px, desktop ~64px).
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          maxHeight: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          background: backdrop
            ? `linear-gradient(180deg, rgba(10,9,7,0.7) 0%, rgba(10,9,7,0.9) 42%, rgba(9,8,6,0.98) 100%), url(${backdrop}) top center / cover no-repeat`
            : 'linear-gradient(180deg, #14110d 0%, #0a0807 100%)',
          border: `1px solid ${accent}33`,
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '0.85rem 1.15rem calc(1.4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.7rem' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', minWidth: 0 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${accent}1a`, border: `1px solid ${accent}3a`,
            }}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: locked ? 'grayscale(1) brightness(0.6)' : undefined }} />
              ) : locked ? <LockGlyph size={20} /> : <NodeGlyph type={node.type} color={accent} size={22} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.15 }}>{node.label}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: accent, background: `${accent}1f`, border: `1px solid ${accent}40`, borderRadius: 5, padding: '0.18rem 0.42rem' }}>
                  {nodeTypeLabel(node.type)}
                </span>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
                  fontSize: '0.5rem', borderRadius: 5, padding: '0.18rem 0.42rem',
                  color: cleared ? '#4ade80' : locked ? '#7a7875' : accent,
                  background: cleared ? 'rgba(74,222,128,0.14)' : locked ? 'rgba(255,255,255,0.05)' : `${accent}1f`,
                  border: `1px solid ${cleared ? 'rgba(74,222,128,0.3)' : locked ? 'rgba(255,255,255,0.12)' : `${accent}40`}`,
                }}>
                  {cleared ? (isCombatNode(node.type) ? 'Cleared' : 'Done') : locked ? 'Locked' : 'Available'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={closeSheet}
            aria-label="Close"
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9a9690', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Description. Nodes with a dialogue scene never show the full
            prose transcript here — the scene IS the delivery (and
            replayable via Watch/Read Again). Pre-watch the sheet teases
            with the flavor line; once cleared it shows the short
            summary recap instead, so the sheet stays a map surface and
            the reading happens in the scene. */}
        <p className="font-karla" style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(240,237,232,0.72)', whiteSpace: 'pre-line' }}>
          {node.scene
            ? (cleared ? (detail.summary ?? node.flavor) : node.flavor)
            : detail.description}
        </p>

        {/* Gauntlet: deepest-run board (global record holder + your best) */}
        {node.type === 'gauntlet' && (
          <div style={{ marginTop: '0.9rem', display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.32)', border: `1px solid ${accent}30`, borderRadius: 10, padding: '0.55rem 0.65rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#8a8880', marginBottom: 4 }}>Deepest Run</p>
              {gauntletBoard?.top ? (
                <>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: accent, lineHeight: 1.1 }}>Depth {gauntletBoard.top.depth}</p>
                  <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.6)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gauntletBoard.top.name}</p>
                </>
              ) : (
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#7a7875' }}>{gauntletBoard ? 'Unclaimed' : '…'}</p>
              )}
            </div>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0.55rem 0.65rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#8a8880', marginBottom: 4 }}>Your Best</p>
              <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: '#e8dfc8', lineHeight: 1.1 }}>
                {gauntletBoard ? (gauntletBoard.mine > 0 ? `Depth ${gauntletBoard.mine}` : '—') : '…'}
              </p>
              {gauntletBoard && gauntletBoard.mine === 0 && (
                <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a7875', marginTop: 2 }}>No run yet</p>
              )}
            </div>
          </div>
        )}

        {/* Where beating this leads: the story beat */}
        {node.bridge && (
          <p className="font-karla" style={{
            marginTop: '0.85rem',
            paddingLeft: '0.7rem',
            borderLeft: `2px solid ${accent}66`,
            fontSize: '0.8rem',
            lineHeight: 1.55,
            fontStyle: 'italic',
            color: cleared ? 'rgba(240,237,232,0.66)' : 'rgba(240,237,232,0.5)',
          }}>
            {node.bridge}
          </p>
        )}

        {/* Locked reason */}
        {locked && lockReason && (
          <div style={{ marginTop: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <LockGlyph size={15} />
            <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a9690' }}>{lockReason}</span>
          </div>
        )}

        {/* Puzzle: beacon-chain (Lights Out) or cipher dials, live when available */}
        {node.type === 'puzzle' && node.puzzle && status === 'available' && !revealed && (
          <div style={{ marginTop: '1.1rem' }}>
            {node.puzzle.kind === 'tumbler' && node.puzzle.tumbler
              ? <TumblerLockPuzzle puzzle={node.puzzle.tumbler} onSolved={solvePuzzle} />
              : node.puzzle.kind === 'cargo' && node.puzzle.cargo
              ? <CargoShufflePuzzle puzzle={node.puzzle.cargo} onSolved={solvePuzzle} />
              : node.puzzle.kind === 'mirror'
              ? <MirrorRunPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />
              : node.puzzle.kind === 'cipher'
              ? <CipherDialsPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />
              : <BeaconChainPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />}
          </div>
        )}

        {/* Dice: A Throw of the Bones — the d20 skill-check, live when available
            and the intro scene has been watched. */}
        {node.type === 'dice' && node.dice && status === 'available' && !introGated && (
          <div style={{ marginTop: '1.1rem' }}>
            <DiceRollNode
              nodeId={node.id}
              dice={node.dice}
              doubloons={doubloons}
              navLevel={navLevel}
              onResolved={() => { router.refresh(); onClose() }}
            />
          </div>
        )}

        {/* DPS check: pay to skip, or run the blockade (one aim-bar shot). */}
        {node.type === 'dps_check' && node.dpsCheck && status === 'available' && (
          <div style={{ marginTop: '1.1rem' }}>
            <DpsCheckNode
              nodeId={node.id}
              dpsCheck={node.dpsCheck}
              doubloons={doubloons}
              onActed={() => { actedRef.current = true }}
              onResolved={closeSheet}
            />
          </div>
        )}

        {/* Puzzle solved → reveal the destination (where the freight all runs) */}
        {node.type === 'puzzle' && node.puzzle && revealed && (
          <div style={{
            marginTop: '1.1rem', borderRadius: 14,
            border: `1px solid ${accent}55`,
            background: `linear-gradient(160deg, ${accent}14, rgba(12,18,28,0.4))`,
            boxShadow: `0 0 20px ${accent}22`, padding: '1.1rem 1rem',
          }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: accent, marginBottom: '0.6rem', textAlign: 'center' }}>
              {node.puzzle.kind === 'cipher' ? 'The Cipher Reads True' : node.puzzle.kind === 'mirror' ? 'The Beam Strikes True' : node.puzzle.kind === 'cargo' ? 'The Hold Is Stowed' : node.puzzle.kind === 'tumbler' ? 'The Bolt Runs Free' : 'The Network Reads True'}
            </p>
            <p className="font-karla" style={{ fontSize: '0.84rem', lineHeight: 1.6, color: 'rgba(240,237,232,0.8)', whiteSpace: 'pre-line', textAlign: 'center' }}>
              {node.puzzle.reveal}
            </p>
            {node.puzzle.rewardNavXp > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.85rem' }}>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                  fontSize: '0.66rem', color: accent,
                  background: `${accent}1f`, border: `1px solid ${accent}44`,
                  borderRadius: 999, padding: '0.32rem 0.72rem',
                }}>
                  +{node.puzzle.rewardNavXp} Nav XP
                </span>
              </div>
            )}
            <button
              onClick={finishReveal}
              disabled={pending}
              className="font-cinzel font-700 uppercase tracking-[0.06em]"
              style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', borderRadius: 12, fontSize: '0.98rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
            >
              Set the Heading →
            </button>
          </div>
        )}

        {/* Quartermaster's Cache: pick one, permanent */}
        {node.choice && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
              {cleared ? 'You Chose' : 'Choose One'}
            </p>
            {/* Two loot cards side by side — the item art is the centerpiece,
                rarity-tinted, with the pick as a themed CTA below. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {node.choice.items.map((itemId, i) => {
                const item = getRaidItem(itemId)
                if (!item) return null
                const owned = ownedRaidItems.includes(itemId)
                const rc = RARITY_COLOR[item.rarity] ?? '#9ca3af'
                const chosenHere = cleared && owned
                const goneHere = cleared && !owned
                const canChoose = !cleared && !locked && !pending
                const cardStyle = {
                  position: 'relative' as const, overflow: 'hidden' as const, display: 'flex', flexDirection: 'column' as const,
                  alignItems: 'center', textAlign: 'center' as const, padding: '0.9rem 0.7rem 0.85rem', borderRadius: 15,
                  background: chosenHere ? `${rc}24` : `linear-gradient(180deg, ${rc}16, rgba(0,0,0,0.3))`,
                  border: `1px solid ${chosenHere ? `${rc}88` : `${rc}44`}`,
                  boxShadow: chosenHere ? `0 0 22px ${rc}1f` : 'none',
                  cursor: !cleared ? (locked ? 'not-allowed' : 'pointer') : 'default',
                }
                const inner = (
                  <>
                    <div style={{ position: 'relative', width: '100%', height: 98, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                      <div aria-hidden style={{ position: 'absolute', width: 108, height: 108, borderRadius: '50%', background: `radial-gradient(circle, ${rc}42, transparent 68%)`, filter: 'blur(2px)' }} />
                      {item.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={item.image} alt="" loading="lazy" decoding="async" style={{ position: 'relative', maxWidth: '84%', maxHeight: 96, objectFit: 'contain', filter: `drop-shadow(0 6px 15px ${rc}4d) drop-shadow(0 3px 8px rgba(0,0,0,0.55))` }} />
                        : <span style={{ position: 'relative', color: rc, display: 'flex' }}><IconCrate size={46} /></span>}
                    </div>
                    <p className="font-cinzel font-800" style={{ fontSize: '0.9rem', color: '#f0ede8', lineHeight: 1.1 }}>{item.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.6)', lineHeight: 1.4, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</p>
                    {chosenHere ? (
                      <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ marginTop: 10, fontSize: '0.55rem', color: rc, background: `${rc}22`, border: `1px solid ${rc}66`, borderRadius: 999, padding: '0.28rem 0.7rem' }}>Chosen ✓</span>
                    ) : goneHere ? (
                      <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ marginTop: 10, fontSize: '0.55rem', color: '#6a6764', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '0.28rem 0.7rem' }}>Gone</span>
                    ) : (
                      <span className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', color: locked ? '#5a5856' : rc, background: locked ? 'rgba(255,255,255,0.05)' : armedChoice?.id === itemId ? `${rc}3a` : `${rc}22`, border: `1px solid ${locked ? 'rgba(255,255,255,0.12)' : armedChoice?.id === itemId ? rc : `${rc}66`}`, borderRadius: 999, padding: '0.32rem 0.85rem' }}>
                        {pending ? '…' : locked ? <><IconLock size={11} /> Locked</> : armedChoice?.kind === 'item' && armedChoice.id === itemId ? 'Selected' : 'Choose'}
                      </span>
                    )}
                  </>
                )
                const entrance = { initial: { opacity: 0, y: 12 }, animate: { opacity: goneHere ? 0.5 : 1, y: 0 }, transition: { delay: 0.05 + i * 0.07, type: 'spring' as const, stiffness: 380, damping: 28 } }
                return cleared ? (
                  <motion.div key={itemId} {...entrance} style={cardStyle}>{inner}</motion.div>
                ) : (
                  <motion.button key={itemId} type="button" {...entrance}
                    onClick={() => { if (canChoose) { vibrate([0, 16]); setArmedChoice({ kind: 'item', id: itemId }) } }}
                    disabled={pending || locked}
                    whileTap={canChoose ? { scale: 0.97 } : undefined}
                    className="tap" style={cardStyle}>{inner}</motion.button>
                )
              })}
            </div>
            {/* THE CONFIRM. Sits under the pair rather than over them, so the
                item you armed stays on screen next to what you are agreeing to.
                The description is UNCLAMPED here: reading the rest of it is what
                the tap was for. */}
            {armedChoice?.kind === 'item' && (() => {
              const it = getRaidItem(armedChoice.id)
              if (!it) return null
              const other = node.choice?.items.find(id => id !== armedChoice.id)
              const otherName = other ? getRaidItem(other)?.name : null
              const rc = RARITY_COLOR[it.rarity] ?? '#9ca3af'
              return (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                  style={{ marginTop: '0.8rem', padding: '0.85rem 0.9rem', borderRadius: 14, background: `${rc}12`, border: `1px solid ${rc}55` }}>
                  <p className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>{it.name}</p>
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.5, marginTop: 5 }}>{it.description}</p>
                  {otherName && (
                    <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e0b0a0', lineHeight: 1.45, marginTop: 8 }}>
                      Take this and the {otherName} is gone for good.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={pending}
                      onClick={() => { vibrate([0, 18]); chooseItem(armedChoice.id) }}
                      className="font-cinzel font-700 uppercase tracking-[0.08em]"
                      style={{ flex: 1, padding: '0.62rem', borderRadius: 11, fontSize: '0.72rem', background: `${rc}2a`, border: `1px solid ${rc}88`, color: '#f4efe4', cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.6 : 1 }}>
                      {pending ? 'Taking…' : `Take the ${it.name}`}
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={pending}
                      onClick={() => setArmedChoice(null)}
                      className="font-karla font-600"
                      style={{ padding: '0.62rem 1rem', borderRadius: 11, fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.66)', cursor: 'pointer' }}>
                      Back
                    </motion.button>
                  </div>
                </motion.div>
              )
            })()}
            {detail.dropsNote && (
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: '0.55rem', lineHeight: 1.5 }}>
                {detail.dropsNote}
              </p>
            )}
            {/* Equip reminder — fires when the player has claimed an item
                from this cache but hasn't slotted it into their raid
                loadout yet. Easy to miss otherwise: the item lands in
                inventory but does nothing until equipped, and the
                node screen is the last surface the player saw before
                walking away. Tap routes straight to the loadout
                drawer so it's one step, not a hunt. */}
            {cleared && (() => {
              const ownedChoice = node.choice?.items.find(id => ownedRaidItems.includes(id))
              if (!ownedChoice || equippedRaidItems.includes(ownedChoice)) return null
              return (
                <div style={{
                  marginTop: '0.85rem',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 10,
                  background: 'rgba(240,192,64,0.10)',
                  border: '1px solid rgba(240,192,64,0.42)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f0d695', lineHeight: 1.45 }}>
                    <span className="font-700">Don&apos;t forget to equip it.</span> Items stay benched until you slot them into your raid loadout.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      window.dispatchEvent(new CustomEvent('expedition:open-loadout'))
                    }}
                    className="font-karla font-700 uppercase tracking-[0.08em]"
                    style={{
                      padding: '0.5rem 0.7rem', borderRadius: 8,
                      fontSize: '0.66rem',
                      background: 'rgba(240,192,64,0.18)',
                      border: '1px solid rgba(240,192,64,0.55)',
                      color: '#f0d695',
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Open Loadout →
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        {/* THE MUSTER LEDGER — a RECORD of the passed inspection, shown only once
            you've cleared it. Before that, the read-off IS the cutscene (the crew
            reading the manifest back), so no static checklist competes with it. */}
        {node.type === 'muster' && node.muster && cleared && (() => {
          const report = musterReport(node.muster, musterParty)
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
                The Ledger &middot; Passed
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {report.rows.map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '0.65rem 0.75rem', borderRadius: 11,
                    background: 'rgba(127,212,154,0.07)', border: '1px solid rgba(127,212,154,0.35)' }}>
                    <span aria-hidden style={{ flexShrink: 0, marginTop: 1, display: 'flex', color: '#7fd49a' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#e6e1d6' }}>{r.label}</p>
                      {r.met.length > 0 && (
                        <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.55)', lineHeight: 1.4, marginTop: 2 }}>
                          {r.met.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* The Sixth Berth: the crew refit. Shown once the yard has been
            spoken to (cleared) and stays buyable on every revisit until bought.
            Server (buySixthBerth) re-checks Sal Brackwater clear + the price. */}
        {/* THE SPOILS OF THE SUNKEN HAND. Its own bench rather than a price
            row: this is a permanent CHOICE first and a purchase second, so it
            gets the Accelerator treatment (living cores, arm-then-confirm). */}
        {/* GATED ON THE NODE BEING UNLOCKED. The berth block below always checked
            its status and this one never did, so on a node carrying
            previewWhenLocked (which opens the sheet long before the fight, on
            purpose, to tease what is down there) the live board rendered to
            players who had not put Finn down. chooseSpoil refuses server-side,
            so nothing could actually be taken, but the game was offering a
            post-game choice to someone with no way to make it.

            Not gated on `cleared`: nothing ever marks a spoils node cleared, so
            that would hide the board forever, including from the players it is
            for. */}
        {node.spoils && (status === 'locked' ? (
          <p className="font-karla" style={{ marginTop: '1.1rem', fontSize: '0.76rem', color: '#8a8880', lineHeight: 1.5, fontStyle: 'italic' }}>
            Nothing to divide yet. Put him down, let it go quiet, and the wreck will give up what it is holding.
          </p>
        ) : (
          <SpoilsBoard
            freeSide={spoilFree === 'fishing' || spoilFree === 'nav' ? spoilFree : null}
            paidSide={spoilPaid === 'fishing' || spoilPaid === 'nav' ? spoilPaid : null}
            doubloons={doubloons}
            onDone={() => router.refresh()}
          />
        ))}

        {node.berth && cleared && (() => {
          const price = node.berth.price
          const BERTH = '#e0a44a'
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
                The Refit
              </p>
              <div style={{ borderRadius: 12, padding: '0.85rem', background: `${BERTH}0e`, border: `1px solid ${BERTH}${hasSixthBerth ? '66' : '3a'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                  {/* six berths, the last one lit as the new one */}
                  <div aria-hidden style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 8px)', gap: 4, padding: 8, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: `1px solid ${BERTH}33` }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <span key={i} style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: i < 5 ? '#cfc9bf' : (hasSixthBerth ? BERTH : 'rgba(255,255,255,0.12)'),
                        boxShadow: i === 5 && hasSixthBerth ? `0 0 7px ${BERTH}` : 'none',
                        border: i === 5 && !hasSixthBerth ? `1px dashed ${BERTH}88` : 'none',
                      }} />
                    ))}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#f0ede8' }}>
                      <span style={{ color: '#9a948c' }}>5 crew slots</span> → <span style={{ color: BERTH }}>6 crew slots</span>
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.6)', lineHeight: 1.4, marginTop: 2 }}>
                      One more crew aboard, permanently. Raids and voyages both.
                    </p>
                  </div>
                </div>
                {hasSixthBerth ? (
                  <div className="font-karla font-700 uppercase tracking-[0.08em]" style={{ padding: '0.6rem', borderRadius: 9, textAlign: 'center', fontSize: '0.66rem', background: `${BERTH}1e`, border: `1px solid ${BERTH}66`, color: BERTH }}>
                    Installed ✓ · you sail with six
                  </div>
                ) : (
                  // The purchase does NOT happen here. A permanent change to your hull
                  // belongs beside the hull, not on a story sheet in the raid map. This
                  // sends you to the shipwrights with the plans.
                  <button
                    onClick={() => {
                      onClose()
                      window.dispatchEvent(new CustomEvent('expedition:open-loadout', { detail: { tab: 'ship' } }))
                    }}
                    className="font-cinzel font-700 uppercase tracking-[0.06em]"
                    style={{
                      width: '100%', padding: '0.65rem', borderRadius: 9, fontSize: '0.82rem',
                      background: `${BERTH}26`, border: `1px solid ${BERTH}66`, color: BERTH, cursor: 'pointer',
                    }}
                  >
                    Open Manage Ship →
                  </button>
                )}
                <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.55)', lineHeight: 1.45, marginTop: 8 }}>
                  {hasSixthBerth
                    ? 'Assign the sixth crew from Manage Ship.'
                    : `Your shipwrights will cut it for ${price.toLocaleString()} ⟡. Buy it in Manage Ship.`}
                </p>
              </div>
            </div>
          )
        })()}

        {/* The Expanded Armory: the raid-item mount refit. Same shape as the
            berth — shown once the shipwright's been heard (cleared), stays
            buyable until owned, and routes the actual purchase to Manage Ship
            (buyArmoryExpansion re-checks the Throne clear + the price there). */}
        {node.armory && cleared && (() => {
          const price = node.armory.price
          const ARMORY = '#a78bfa'
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
                The Refit
              </p>
              <div style={{ borderRadius: 12, padding: '0.85rem', background: `${ARMORY}0e`, border: `1px solid ${ARMORY}${hasArmoryExpansion ? '66' : '3a'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                  {/* five mounts, the last one lit as the new one */}
                  <div aria-hidden style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 8px)', gap: 4, padding: 8, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: `1px solid ${ARMORY}33` }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} style={{
                        width: 8, height: 8, borderRadius: 2,
                        background: i < 4 ? '#cfc9bf' : (hasArmoryExpansion ? ARMORY : 'rgba(255,255,255,0.12)'),
                        boxShadow: i === 4 && hasArmoryExpansion ? `0 0 7px ${ARMORY}` : 'none',
                        border: i === 4 && !hasArmoryExpansion ? `1px dashed ${ARMORY}88` : 'none',
                      }} />
                    ))}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#f0ede8' }}>
                      <span style={{ color: '#9a948c' }}>4 mounts</span> → <span style={{ color: ARMORY }}>5 mounts</span>
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.6)', lineHeight: 1.4, marginTop: 2 }}>
                      One more raid item bolted to your deck, working every fight.
                    </p>
                  </div>
                </div>
                {hasArmoryExpansion ? (
                  <div className="font-karla font-700 uppercase tracking-[0.08em]" style={{ padding: '0.6rem', borderRadius: 9, textAlign: 'center', fontSize: '0.66rem', background: `${ARMORY}1e`, border: `1px solid ${ARMORY}66`, color: ARMORY }}>
                    Installed ✓ · an extra mount
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      onClose()
                      window.dispatchEvent(new CustomEvent('expedition:open-loadout', { detail: { tab: 'ship' } }))
                    }}
                    className="font-cinzel font-700 uppercase tracking-[0.06em]"
                    style={{
                      width: '100%', padding: '0.65rem', borderRadius: 9, fontSize: '0.82rem',
                      background: `${ARMORY}26`, border: `1px solid ${ARMORY}66`, color: ARMORY, cursor: 'pointer',
                    }}
                  >
                    Open Manage Ship →
                  </button>
                )}
                <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.55)', lineHeight: 1.45, marginTop: 8 }}>
                  {hasArmoryExpansion
                    ? 'Fit the extra raid item from Manage Ship.'
                    : `The don's shipwright will cut it for ${price.toLocaleString()} ⟡. Buy it in Manage Ship.`}
                </p>
              </div>
            </div>
          )
        })()}

        {/* Event nodes: branching one-time decision. Renders one card
            per choice with its outcome chip ("+1,200 ⟡" / "+750 Nav
            XP" / "No spoils"); after the player picks, that card
            lights up with a "Chosen ✓" badge and the others go dim +
            "Gone." Same persistence pattern as the shop-choice block
            above — picks are permanent. Hidden while the intro scene
            hasn't been watched: the encounter plays before the choice. */}
        {node.event && !introGated && (() => {
          const choiceAccent = '#c084fc' // violet — matches the event glyph color
          const outcomeChip = (outcome: typeof node.event.choices[number]['outcome']) => {
            if (outcome.type === 'doubloons') return `+${outcome.amount.toLocaleString()} ⟡`
            if (outcome.type === 'navXp')     return `+${outcome.amount.toLocaleString()} Nav XP`
            return 'No spoils'
          }
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
                {pickedEventChoiceId ? 'You Chose' : 'Choose One'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {node.event.choices.map(c => {
                  const isChosen = pickedEventChoiceId === c.id
                  const dimmed = cleared && !isChosen
                  return (
                    <div key={c.id} style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      background: isChosen ? `${choiceAccent}1f` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isChosen ? `${choiceAccent}80` : `${choiceAccent}26`}`,
                      borderRadius: 10, padding: '0.7rem 0.75rem',
                      opacity: dimmed ? 0.45 : 1,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.86rem', color: '#f0ede8' }}>
                          {c.label}
                        </span>
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.58rem', color: choiceAccent, background: `${choiceAccent}14`, border: `1px solid ${choiceAccent}40`, borderRadius: 5, padding: '0.18rem 0.45rem', flexShrink: 0 }}>
                          {outcomeChip(c.outcome)}
                        </span>
                        {isChosen && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: choiceAccent, flexShrink: 0 }}>Chosen ✓</span>
                        )}
                        {cleared && !isChosen && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', flexShrink: 0 }}>Gone</span>
                        )}
                      </div>
                      <span className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.45 }}>
                        {c.description}
                      </span>
                      {!cleared && (
                        <button
                          onClick={() => chooseEvent(c.id)}
                          disabled={pending || locked}
                          className="font-cinzel font-700 uppercase tracking-[0.06em]"
                          style={{
                            marginTop: 2, padding: '0.6rem', borderRadius: 9,
                            fontSize: '0.82rem',
                            background: locked ? 'rgba(255,255,255,0.06)' : `${choiceAccent}26`,
                            border: `1px solid ${locked ? 'rgba(255,255,255,0.1)' : `${choiceAccent}66`}`,
                            color: locked ? '#5a5856' : choiceAccent,
                            cursor: pending ? 'wait' : locked ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {pending ? '…' : locked ? 'Locked' : c.label}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {detail.dropsNote && (
                <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: '0.55rem', lineHeight: 1.5 }}>
                  {detail.dropsNote}
                </p>
              )}
            </div>
          )
        })()}

        {/* Branching fork: pick ONE of two routes. Both shown until picked;
            after, the taken route lights and the other dims to "Gone." Same
            persistence as the event picker (choices[node.id] = route id). */}
        {node.fork && !introGated && (() => {
          const forkAccent = '#f59e0b' // amber — distinct from the violet event picker
          const picked = pickedEventChoiceId // raidNodeChoices[node.id] = chosen route id
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
                {picked ? 'Your Route' : 'Choose Your Route'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {node.fork.routes.map(r => {
                  const isChosen = picked === r.id
                  const dimmed = cleared && !isChosen
                  return (
                    <div key={r.id} style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      background: isChosen ? `${forkAccent}1f` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isChosen ? `${forkAccent}80` : `${forkAccent}26`}`,
                      borderRadius: 10, padding: '0.7rem 0.75rem',
                      opacity: dimmed ? 0.45 : 1,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.86rem', color: '#f0ede8' }}>
                          {r.label}
                        </span>
                        {isChosen && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: forkAccent, flexShrink: 0 }}>Chosen ✓</span>
                        )}
                        {cleared && !isChosen && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', flexShrink: 0 }}>Gone</span>
                        )}
                      </div>
                      <span className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.45 }}>
                        {r.description}
                      </span>
                      {!cleared && (
                        <button
                          onClick={() => chooseFork(r.id)}
                          disabled={pending || locked}
                          className="font-cinzel font-700 uppercase tracking-[0.06em]"
                          style={{
                            marginTop: 2, padding: '0.6rem', borderRadius: 9,
                            fontSize: '0.82rem',
                            background: locked ? 'rgba(255,255,255,0.06)' : `${forkAccent}26`,
                            border: `1px solid ${locked ? 'rgba(255,255,255,0.1)' : `${forkAccent}66`}`,
                            color: locked ? '#5a5856' : forkAccent,
                            cursor: pending ? 'wait' : locked ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {pending ? '…' : locked ? 'Locked' : `Take ${r.label}`}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Chapter-end class picker. Renders a 4-card grid of ship
            classes from SHIP_CLASS_LIST. If a class is already picked
            for this chapter, that card highlights and the others dim
            (lock is permanent). Otherwise every card is a tap target;
            the chosen class goes to the server via pickShipClass. */}
        {node.classPick && (() => {
          const chapterId = node.classPick.chapterId
          const chosenId = shipClasses[chapterId]
          const chosen = chosenId ? getShipClass(chosenId) : undefined
          // Offered classes are computed from the player's OTHER picks (exclude
          // this chapter's own, so a cleared node still shows what was on the
          // menu). Owned Mark I → its Mark II ("deepen"); untouched → Mark I.
          // A node with a PINNED menu (classPick.options — the Ch4 augment)
          // offers exactly those instead of the ladder.
          const priorPicks = Object.fromEntries(Object.entries(shipClasses).filter(([k]) => k !== chapterId))
          const offered = node.classPick.options
            ? node.classPick.options.map(id => getShipClass(id)).filter((c): c is NonNullable<typeof c> => !!c)
            : offeredShipClasses(priorPicks)
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.68rem', color: '#7a7875', marginBottom: '0.65rem' }}>
                {chosen ? 'You Chose' : 'Pick a Class'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {offered.map((cls, i) => {
                  const isChosen = chosen?.id === cls.id
                  const dimmed = !!chosen && !isChosen
                  const c = cls.color
                  const canChoose = !chosen && !locked && !pending
                  const cardStyle = {
                    position: 'relative' as const, overflow: 'hidden' as const, display: 'flex', alignItems: 'center', gap: '0.85rem',
                    padding: '0.85rem 0.95rem', borderRadius: 14, textAlign: 'left' as const, width: '100%',
                    background: isChosen ? `${c}22` : `linear-gradient(120deg, ${c}18, rgba(0,0,0,0.24))`,
                    border: `1px solid ${isChosen ? `${c}88` : `${c}3a`}`,
                    boxShadow: isChosen ? `0 0 20px ${c}1c` : 'none',
                    opacity: dimmed ? 0.42 : 1,
                    cursor: !chosen ? (locked ? 'not-allowed' : 'pointer') : 'default',
                  }
                  const inner = (
                    <>
                      {/* Class glyph in a glowing themed medallion. */}
                      <span style={{ position: 'relative', flexShrink: 0, width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span aria-hidden style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: `radial-gradient(circle, ${c}55, transparent 70%)` }} />
                        <span style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${c}1a`, border: `1.5px solid ${c}70`, fontSize: '1.7rem', color: c, lineHeight: 1 }}>{cls.emoji}</span>
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.15 }}>{cls.name}</p>
                        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.35, fontStyle: 'italic' }}>{cls.tagline}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                          {cls.bullets.map((b, bi) => (
                            <span key={bi} className="font-karla font-700 uppercase tracking-[0.05em]" style={{
                              fontSize: '0.66rem',
                              color: b.positive ? '#7adf9a' : '#f08a8a',
                              background: b.positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                              border: `1px solid ${b.positive ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                              borderRadius: 5, padding: '0.22rem 0.5rem',
                            }}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Right cue: check medallion once chosen, else a RADIO.
                          It used to be a nudging chevron, which reads as "there
                          is more to see through here" on a row where tapping
                          used to commit you for the rest of the game. A radio
                          says the true thing: these are the options, pick one.
                          It fills when armed, so the card you are confirming is
                          obvious while the confirm sits below. */}
                      {isChosen ? (
                        <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${c}1c`, border: `2px solid ${c}` }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        </div>
                      ) : !chosen ? (
                        locked ? (
                          <span style={{ flexShrink: 0, display: 'flex', color: '#5a5856' }}><IconLock size={16} /></span>
                        ) : (
                          <span aria-hidden style={{
                            flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                            border: `2px solid ${armedChoice?.kind === 'class' && armedChoice.id === cls.id ? c : `${c}66`}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: armedChoice?.kind === 'class' && armedChoice.id === cls.id ? `${c}1c` : 'transparent',
                            transition: 'border-color 0.15s, background 0.15s',
                          }}>
                            {armedChoice?.kind === 'class' && armedChoice.id === cls.id && (
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                                style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                            )}
                          </span>
                        )
                      ) : null}
                    </>
                  )
                  const entrance = { initial: { opacity: 0, y: 10 }, animate: { opacity: dimmed ? 0.42 : 1, y: 0 }, transition: { delay: 0.05 + i * 0.07, type: 'spring' as const, stiffness: 380, damping: 28 } }
                  return chosen ? (
                    <motion.div key={cls.id} {...entrance} style={cardStyle}>{inner}</motion.div>
                  ) : (
                    <motion.button key={cls.id} type="button" {...entrance}
                      onClick={() => { if (canChoose) { vibrate([0, 16]); setArmedChoice({ kind: 'class', id: cls.id }) } }}
                      disabled={pending || locked}
                      whileTap={canChoose ? { scale: 0.985 } : undefined}
                      aria-label={`Pick ${cls.name}`}
                      className="tap" style={cardStyle}>{inner}</motion.button>
                  )
                })}
              </div>
              {/* Same arm-then-confirm as the Cache. This one is a whole-card
                  tap target too, and it is just as permanent. */}
              {armedChoice?.kind === 'class' && (() => {
                const cl = offered.find(c => c.id === armedChoice.id)
                if (!cl) return null
                return (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                    style={{ marginTop: '0.8rem', padding: '0.85rem 0.9rem', borderRadius: 14, background: `${cl.color}12`, border: `1px solid ${cl.color}55` }}>
                    <p className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>{cl.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.5, marginTop: 5, fontStyle: 'italic' }}>{cl.tagline}</p>
                    <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e0b0a0', lineHeight: 1.45, marginTop: 8 }}>
                      This is the captain you become. There is no changing it later.
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={pending}
                        onClick={() => { vibrate([0, 18]); chooseClass(cl.id) }}
                        className="font-cinzel font-700 uppercase tracking-[0.08em]"
                        style={{ flex: 1, padding: '0.62rem', borderRadius: 11, fontSize: '0.72rem', background: `${cl.color}2a`, border: `1px solid ${cl.color}88`, color: '#f4efe4', cursor: pending ? 'wait' : 'pointer', opacity: pending ? 0.6 : 1 }}>
                        {pending ? 'Signing on…' : `Sail as the ${cl.name}`}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={pending}
                        onClick={() => setArmedChoice(null)}
                        className="font-karla font-600"
                        style={{ padding: '0.62rem 1rem', borderRadius: 11, fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.66)', cursor: 'pointer' }}>
                        Back
                      </motion.button>
                    </div>
                  </motion.div>
                )
              })()}
              <p className="font-karla" style={{ fontSize: '0.7rem', color: '#6a6764', marginTop: '0.7rem', lineHeight: 1.5 }}>
                Permanent. Class effects apply to every raid from here on and stack with raid items.
              </p>
            </div>
          )
        })()}

        {/* Boss records — fastest non-admin clear + the player's own best.
            Lives above Drops so the player sees the target time + their own
            best right before they decide whether to run it again. Only
            renders on raid-type nodes with at least one populated record.
            Admins are excluded from "Fastest" so dev runs don't claim the
            top slot; "Your best" still shows for admins on their own sheet. */}
        {/* Always shown on a raid node, even with nothing set yet. Hiding the
            whole block on an unbeaten boss made its card a different HEIGHT to
            every other one and quietly implied the fight had no records at all. */}
        {node.type === 'raid' && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>Boss Records</p>
            <div style={{
              padding: '0.65rem 0.85rem', borderRadius: 10,
              background: 'rgba(200,168,64,0.05)',
              border: '1px solid rgba(200,168,64,0.2)',
              display: 'flex', flexDirection: 'column', gap: '0.4rem',
            }}>
              {raidRecords && raidRecords.fastestMs > 0 ? (
                <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                  <div className="flex items-baseline" style={{ gap: 8, minWidth: 0 }}>
                    <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#c8a840' }}>Fastest</span>
                    <span className="font-karla font-600 truncate" style={{ fontSize: '0.78rem', color: '#e6d49a', minWidth: 0 }}>{raidRecords.fastestUsername}</span>
                  </div>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0c040', textShadow: '0 0 10px rgba(240,192,64,0.35)', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                    {formatRaidMs(raidRecords.fastestMs)}
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                  <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#c8a840' }}>Fastest</span>
                  <span className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#6d6a66' }}>No clears yet</span>
                </div>
              )}
              {raidRecords && raidRecords.yourBestMs != null ? (
                <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                  <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#7da0d8' }}>Your best</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#cbd6e6', fontFeatureSettings: '"tnum"' }}>
                    {formatRaidMs(raidRecords.yourBestMs)}
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                  <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#7da0d8' }}>Your best</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#5f6772', fontFeatureSettings: '"tnum"' }}>{'\u2014'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Drops / rewards. Raids/skirmishes show compact chips (icon + name)
            to stay scannable — no descriptions, odds, or notes. Story/milestone
            nodes keep the detailed rows so their fragment quotes / notes read. */}
        {((detail.drops && detail.drops.length > 0) || detail.clearReward) && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>{dropsTitle}</p>
            {isCombatNode(node.type) ? (() => {
              // Row 1 = the headline payout a clear pays out, always in the order
              // Nav XP, doubloons, gems. Row 2 = the unique crate drops (ship
              // skins, raid items) with their roll odds, rendered a touch bigger
              // so they read as the chase. Plain doubloon tiers stay folded into
              // the payout figure.
              const drops = detail.drops ?? []

              // ── LIVE ODDS on a uniqueShare crate ───────────────────────────
              // Those raids reserve a FIXED slice of the crate for the uniques you
              // are still missing and split it between them. So the odds printed by
              // lootDrops (static weights) are only ever right in the one case where
              // you own none of them. The Ghost's Cache items read a flat 8%, but 8%
              // is the six-missing case: with one left it is 50%.
              //
              // The sheet knows what the player owns, so it can just tell the truth.
              const cfg = node.raidId ? getRaidConfigById(node.raidId) : undefined
              // Ownership spans BOTH raid_items AND ship_skins — a hull drop is
              // "owned" via profiles.ship_skins (its shipSkinId), never raid_items,
              // so an items-only check silently missed every ship-skin drop.
              const dropOwned = (d: RaidNodeDrop): boolean =>
                (!!d.id && ownedRaidItems.includes(d.id)) || (!!d.shipSkinId && ownedShipSkins.includes(d.shipSkinId))
              const lootOwned = (l: { id: string; shipSkinId?: string }): boolean =>
                ownedRaidItems.includes(l.id) || (!!l.shipSkinId && ownedShipSkins.includes(l.shipSkinId))

              const gemDrop = drops.find(d => d.emoji === GEM_GLYPH)
              const gemAmount = gemDrop?.label.replace(/\s*Gems$/i, '')
              const uniques = drops.filter(d => d.emoji !== GEM_GLYPH && !d.label.includes('⟡'))
              return (
                <>
                  {/* Headline payout pills — all in the same muted
                      neutral so they read as "context" (here's the gold
                      and XP you'll earn), not as "look at me." The
                      colorful chase chips below (rarity-tinted unique
                      drops) are what should grab attention. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: uniques.length ? 11 : 0 }}>
                    {detail.clearReward && (
                      <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#b8b3ac', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                        {detail.clearReward.xp.toLocaleString()} Nav XP
                      </span>
                    )}
                    {detail.clearReward && (
                      <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#b8b3ac', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                        {detail.clearReward.doubloons.toLocaleString()} ⟡
                      </span>
                    )}
                    {gemAmount && (
                      <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#b8b3ac', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.3rem 0.6rem' }}>
                        {gemAmount} <span className="font-cinzel">◆</span>
                      </span>
                    )}
                  </div>
                  {uniques.length > 0 && (
                    <>
                      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#7a7875', margin: '0 0 0.5rem' }}>
                        Unique Drops
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
                        {uniques.map(d => {
                          const rc = d.rarity ? RARITY_COLOR[d.rarity] : '#9ca3af'
                          // The odds baked in by lootDrops are the STATIC weights, which
                          // are wrong on a uniqueShare raid: those crates reserve a fixed
                          // slice for the items you're still missing and split it between
                          // them, so a Ghost item printed as a flat 8% is really 8% when
                          // you need all six and 50% when you need one. Recompute against
                          // what this player actually holds, and say "Owned" for the rest
                          // rather than quoting odds on something that cannot drop.
                          const owned = dropOwned(d)
                          // Say "Owned" on ANY raid you already hold the item on — not
                          // just the uniqueShare crates liveChance covers — so every
                          // boss + challenge node tells you what's already in your hold.
                          const chance = owned ? 'Owned' : (liveChance(d) ?? d.chance)
                          return (
                            <button
                              type="button"
                              key={d.label}
                              onClick={() => setSelectedDrop(d)}
                              aria-label={`${d.label} — details`}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.45rem',
                                minWidth: 0, textAlign: 'left',
                                background: `${rc}16`, border: `1px solid ${rc}40`,
                                borderRadius: 9, padding: '0.4rem 0.55rem 0.4rem 0.45rem',
                                cursor: 'pointer', font: 'inherit', color: 'inherit',
                                touchAction: 'manipulation',
                              }}
                            >
                              <span style={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem', overflow: 'hidden' }}>
                                {d.swatch
                                  ? <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 4, background: d.swatch, filter: d.swatchFilter }} />
                                  : d.image
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={d.image} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: d.imageFilter }} />
                                    : <span style={{ color: rc, display: 'flex' }}><IconCrate size={17} /></span>}
                              </span>
                              <span className="font-karla font-600 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#e8e2d8' }}>{d.label}</span>
                              {chance && (
                                <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: owned ? '#7fd49a' : rc, background: owned ? 'rgba(127,212,154,0.14)' : `${rc}1c`, border: `1px solid ${owned ? 'rgba(127,212,154,0.45)' : `${rc}40`}`, borderRadius: 5, padding: '0.18rem 0.4rem', flexShrink: 0 }}>
                                  {chance}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              )
            })() : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {(detail.drops ?? []).map(d => {
                  const rc = d.rarity ? RARITY_COLOR[d.rarity] : '#9ca3af'
                  // Plain loot packs two-up; anything with a description
                  // (or a lone reward) spans the row so its text stays
                  // readable.
                  const full = !!d.sublabel || detail.drops!.length === 1
                  return (
                    <button key={d.label} type="button" onClick={() => setSelectedDrop(d)} aria-label={`${d.label}, details`} style={{
                      gridColumn: full ? '1 / -1' : undefined,
                      display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0,
                      background: 'rgba(255,255,255,0.03)', border: `1px solid ${rc}26`,
                      borderRadius: 9, padding: '0.4rem 0.5rem',
                      textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                      touchAction: 'manipulation',
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${rc}1a`, fontSize: '0.9rem', overflow: 'hidden',
                      }}>
                        {d.swatch
                          ? <div style={{ width: '100%', height: '100%', background: d.swatch, filter: d.swatchFilter }} />
                          : d.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={d.image} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: d.imageFilter }} />
                            : d.emoji === GEM_GLYPH
                              ? <span className="font-cinzel" style={{ color: GEM_COLOR }}>{d.emoji}</span>
                              : <span style={{ color: rc, display: 'flex' }}><IconCrate size={14} /></span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.74rem', color: '#e8e2d8', whiteSpace: full ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                        {d.sublabel && (
                          <span className="font-karla" style={{ display: 'block', fontSize: '0.62rem', color: '#8a8880', lineHeight: 1.35, marginTop: 1 }}>{d.sublabel}</span>
                        )}
                      </div>
                      {d.chance && (
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.54rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}40`, borderRadius: 5, padding: '0.2rem 0.4rem', flexShrink: 0 }}>
                          {d.chance}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {!isCombatNode(node.type) && detail.dropsNote && (
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764', marginTop: '0.55rem', lineHeight: 1.5 }}>
                {detail.dropsNote}
              </p>
            )}
          </div>
        )}

        {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#f08a8a', marginTop: '0.9rem' }}>{err}</p>}

        {/* Sticky CTA — pins to the bottom of the sheet's viewport so
            long descriptions / drop lists / boss-records don't shove
            the action button off-screen and force the player to scroll
            to find "Enter Raid →". Negative margins extend the gradient
            fade across the full sheet width; the calc'd bottom matches
            the motion.div's bottom padding so the bar lands flush with
            the safe area instead of floating above it. */}
        {cta && (
          <div style={{
            position: 'sticky',
            bottom: 'calc(-1.4rem - env(safe-area-inset-bottom, 0px))',
            marginTop: '1.3rem',
            marginLeft: '-1.15rem',
            marginRight: '-1.15rem',
            padding: '1.1rem 1.15rem calc(1.4rem + env(safe-area-inset-bottom, 0px))',
            background: 'linear-gradient(180deg, rgba(10,8,7,0) 0%, rgba(10,8,7,0.88) 40%, #0a0807 100%)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}>
            {cta}
          </div>
        )}
      </motion.div>
    </motion.div>
  )

  // Drop detail popup — layers ABOVE the sheet (sheet is z-1000) so
  // tapping a unique-drop chip inside the sheet opens this card without
  // closing the sheet itself. Both portal to <body> so they escape any
  // ancestor stacking context.
  const dropModal = selectedDrop ? <DropDetailModal drop={selectedDrop} chance={liveChance(selectedDrop)} owned={(!!selectedDrop.id && ownedRaidItems.includes(selectedDrop.id)) || (!!selectedDrop.shipSkinId && ownedShipSkins.includes(selectedDrop.shipSkinId))} onClose={() => setSelectedDrop(null)} /> : null

  // Dialogue scene — StoryScene portals itself to <body> (z-1100, above
  // the sheet). Story nodes, first read: the final CTA fires the mark-read
  // action, and there is NO Skip (see allowSkip below) — the first watch is
  // the one that has to be watched. On a replay Skip is back and it ALSO
  // marks read, so a re-read never gates harder than the old one-button flow.
  // Milestone/event intro scenes: finishing OR skipping just records
  // the watch locally and returns to the sheet, where the pay bar /
  // choice cards are now revealed — no server write here.
  // Replay (already cleared): both buttons just close the scene.
  const finishScene = () => {
    if (cleared) { setSceneOpen(false); return }
    if (node.type === 'muster') {
      // The read-off is done: pass the inspection, or turn back to fix the crew.
      if (musterRep?.passed) { standMuster(); return }
      setSceneOpen(false); return
    }
    if (node.type === 'story') { readStory(); return }
    seenIntroScenes.add(node.id)
    setSceneOpen(false)
  }
  const sceneCta = cleared
    ? 'Close'
    : node.type === 'muster' ? (musterRep?.passed ? (detail.ctaLabel ?? 'Stand For Inspection →') : 'Turn Back and Fix It →')
    : node.type === 'story' ? (detail.ctaLabel ?? 'Log it →')
    : node.type === 'event' ? 'Make the Call →'
    : node.type === 'dice' ? (detail.ctaLabel ?? 'Throw the Bones →')
    : 'Talk Terms →'
  const storyScene = sceneOpen && sceneLines ? (
    <StoryScene
      title={node.label}
      lines={sceneLines}
      ctaLabel={sceneCta}
      pending={pending}
      accent={node.sceneAccent}
      background={SCENE_BACKDROPS[node.id]}
      onComplete={finishScene}
      onSkip={finishScene}
      // No Skip on a FIRST watch. Cleared nodes (a replay from the map) and
      // intro scenes already seen this session keep it, so re-reading is
      // still one tap; it is only the first time through that has to be
      // watched. Skip still marks read when it IS shown, unchanged.
      allowSkip={cleared || seenIntroScenes.has(node.id)}
    />
  ) : null

  return typeof document !== 'undefined'
    ? createPortal(<>{sheet}{dropModal}{storyScene}</>, document.body)
    : null
}

/* ─────────────────────── Drop detail modal ──────────────────── */
// Tap a unique-drop chip on a node sheet → this card opens. Pulls full
// info from getRaidItem / getShipSkin so it shows effects + flavor in
// addition to whatever the drop chip already had. Sits ABOVE the node
// detail sheet (z-2000 vs sheet's z-1000); tapping the backdrop or the
// X closes it without closing the underlying sheet.
function DropDetailModal({ drop, owned, chance, onClose }: {
  drop: RaidNodeDrop
  owned: boolean
  /**
   * The LIVE chance, from crateItemChances. RaidNodeDrop.chance is baked at
   * map-build time from `weight / total`, which was the old model and knows
   * nothing about the rarity rule or crew Fortune. The chip that opens this
   * modal has shown the live figure since the boss-card fix, so the modal was
   * quoting a different number for the same item.
   */
  chance?: string
  onClose: () => void
}) {
  const rarityColor = drop.rarity ? RARITY_COLOR[drop.rarity] : '#9ca3af'
  const raidItem    = drop.raidItemId ? getRaidItem(drop.raidItemId)   : undefined
  const shipSkin    = drop.shipSkinId ? getShipSkin(drop.shipSkinId)   : undefined
  const special     = drop.specialItemId ? SPECIAL_ITEMS.find(x => x.id === drop.specialItemId) : undefined
  // Finn's two spoils have no fixed effect line to print: what they DO is the
  // charge ladder. Show the whole ladder here so the drop sells itself before
  // you have ever held it.
  const finn = (drop.id === 'anglers_patience' || drop.id === 'borrowed_jaw')
    ? FINN_ITEMS[drop.id as FinnItemId]
    : undefined
  // What kind of drop is this — drives the "type" label + body copy.
  const dropKind = raidItem ? 'Raid Item' : shipSkin ? 'Ship Skin' : special ? 'Fishing Special' : 'Drop'
  // Description: prefer the raid item's full description; fall back to
  // the drop's sublabel (already preformatted by lootDrops).
  const description = raidItem?.description ?? special?.description
    ?? (drop.sublabel ?? '').replace(/^Raid item\.\s*|^Ship skin\.\s*|^Fishing special\.\s*/, '')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%', maxWidth: 340,
          background: 'linear-gradient(180deg, #0e1726 0%, #07101c 100%)',
          border: `1px solid ${rarityColor}55`,
          borderTop: `3px solid ${rarityColor}`,
          borderRadius: 16,
          padding: '1.1rem 1.05rem 1.1rem',
          boxShadow: `0 16px 48px rgba(0,0,0,0.55), 0 0 24px ${rarityColor}22`,
          position: 'relative',
        }}
      >
        {/* Close (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#9aa0a6', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, font: 'inherit',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        {/* Header: big icon + name + type + rarity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, paddingRight: 24 }}>
          {/* One box for every kind of drop. A hull used to need a wider one
              because its sprite was a 16:9 canvas; trimmed to the ship it is
              only a little wider than tall, and it fills a square box like
              everything else. */}
          <div style={{
            width: 64, height: 64, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${rarityColor}14`, border: `1px solid ${rarityColor}45`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            {drop.swatch
              ? <span style={{ display: 'block', width: '100%', height: '100%', background: drop.swatch, filter: drop.swatchFilter }} />
              : drop.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={drop.image} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: drop.imageFilter, padding: 4 }} />
                : <span style={{ fontSize: '2rem', color: rarityColor, display: 'flex' }}><IconCrate size={32} /></span>}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: rarityColor, marginBottom: 4 }}>
              {dropKind}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f5f2ec', lineHeight: 1.15 }}>
              {drop.label}
            </p>
            {drop.rarity && (
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: rarityColor, marginTop: 3 }}>
                {drop.rarity}
              </p>
            )}
          </div>
        </div>

        {/* Description. A raid item lists its mechanics one per line — these
            cards carry the forged and Abyssal drops, which are the longest in
            the game. Anything else (a skin, a fishing special) is one sentence
            and stays prose. */}
        {raidItem ? (
          <div style={{ marginBottom: 14 }}>
            <ItemEffectLines def={raidItem} size={0.78} color="rgba(240,237,232,0.78)" />
          </div>
        ) : description ? (
          <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.78)', lineHeight: 1.55, marginBottom: 14 }}>
            {description}
          </p>
        ) : null}

        {/* Finn's charge ladder. Every tier listed, none of them marked as
            unlocked, because this is a preview of what the thing becomes. */}
        {finn && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: finn.color, marginBottom: 6 }}>
              Tiers up on {finn.chargedBy === 'navigation' ? 'Navigation' : 'Fishing'} XP
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {finn.milestones.map(m => (
                <div key={m.level} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '4px 7px', borderRadius: 7,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${finn.color}22`,
                }}>
                  <span className="font-cinzel font-700" style={{ flexShrink: 0, width: 22, textAlign: 'right', fontSize: '0.57rem', color: finn.color, letterSpacing: '0.04em' }}>{finnTierNumeral(m.level)}</span>
                  <span className="font-karla" style={{ fontSize: '0.6rem', lineHeight: 1.4, color: 'rgba(240,237,232,0.72)' }}>{m.unlock}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source line for raid items (tells you where it drops) */}
        {raidItem?.source && (
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a8090', marginBottom: 14 }}>
            Source: <span style={{ color: '#9aa6b8' }}>{raidItem.source}</span>
          </p>
        )}

        {/* Owned banner, else the drop-chance pill. */}
        {owned ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: '0.65rem', color: '#7fd49a',
                background: 'rgba(127,212,154,0.14)', border: '1px solid rgba(127,212,154,0.5)',
                borderRadius: 999, padding: '0.32rem 0.85rem',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Owned · in your hold
            </span>
          </div>
        ) : (chance ?? drop.chance) ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.65rem', color: rarityColor,
                background: `${rarityColor}1c`, border: `1px solid ${rarityColor}50`,
                borderRadius: 999, padding: '0.32rem 0.85rem',
              }}>
              {chance ?? drop.chance} drop chance
            </span>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────── Chapter-unlock overlay ───────────────── */

// First-time celebration when a chapter unlocks. Fires once per
// chapter per player (persisted via profiles.seen_chapter_unlocks;
// dismissed by markChapterUnlockSeen). Designed to FEEL like a real
// milestone — full-screen takeover, parchment scroll, gold particles,
// stamping roman numeral — not a quiet toast in the corner.
function ChapterUnlockOverlay({
  chapter, previousChapter, onDismiss,
}: {
  chapter: RaidChapter
  previousChapter: RaidChapter | null
  onDismiss: () => void
}) {
  // Random-but-deterministic sparkle positions so they're stable across
  // re-renders. 14 sparkles drift up across the backdrop, each with its
  // own delay + duration + horizontal jitter — reads as ambient gold
  // dust, not a regimented confetti burst.
  const sparkles = (() => {
    const arr: { left: number; size: number; delay: number; duration: number; sway: number }[] = []
    for (let i = 0; i < 14; i++) {
      arr.push({
        left:     (i * 73) % 100,                   // spread across the width
        size:     3 + ((i * 17) % 5),               // 3–7px
        delay:    (i * 0.23) % 2.6,                 // staggered starts
        duration: 4 + ((i * 11) % 4),               // 4–7s
        sway:     (i % 2 === 0 ? 1 : -1) * (8 + (i * 3) % 10),
      })
    }
    return arr
  })()

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        position: 'fixed', inset: 0,
        zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        // Deep-ocean radial so the sparkles glow against it. The very
        // center is darker so the parchment card pops cleanly.
        background: 'radial-gradient(ellipse at center, rgba(4,12,24,0.92) 0%, rgba(2,4,10,0.97) 70%, rgba(0,0,0,0.99) 100%)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
data-any-key
      onClick={onDismiss}
    >
      {/* Sparkle particles — float up + sway. pointer-events:none so
          they don't intercept the tap-anywhere dismiss. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {sparkles.map((s, i) => (
          <motion.div
            key={i}
            initial={{ y: '110%', opacity: 0, x: 0 }}
            animate={{ y: '-15%', opacity: [0, 0.85, 0.85, 0], x: [0, s.sway, 0, -s.sway, 0] }}
            transition={{
              y:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'linear' },
              opacity: { duration: s.duration, delay: s.delay, repeat: Infinity, times: [0, 0.15, 0.8, 1], ease: 'easeInOut' },
              x:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute',
              left: `${s.left}%`,
              bottom: 0,
              width: s.size, height: s.size,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,225,150,0.95) 0%, rgba(240,192,64,0.6) 50%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255,210,120,0.55)',
            }}
          />
        ))}
      </div>

      {/* Card — stops tap propagation so taps inside don't trigger
          the backdrop dismiss accidentally. */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 440,
          padding: '1.6rem 1.4rem 1.5rem',
          borderRadius: 18,
          background: [
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,225,150,0.18) 0%, transparent 70%)',
            'linear-gradient(180deg, rgba(36,24,10,0.96) 0%, rgba(20,14,8,0.98) 100%)',
          ].join(', '),
          border: '1.5px solid rgba(240,192,64,0.55)',
          borderTop: '2.5px solid rgba(255,215,120,0.85)',
          boxShadow: '0 0 60px rgba(240,192,64,0.22), 0 0 140px rgba(240,192,64,0.08), inset 0 0 40px rgba(40,28,12,0.5)',
          textAlign: 'center',
        }}
      >
        {/* "Chapter N complete" — anchors the celebration to what the
            player just DID, not just what they're getting. */}
        {previousChapter && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="font-karla font-700 uppercase tracking-[0.22em]"
            style={{ fontSize: '0.56rem', color: '#4ade80', marginBottom: '0.65rem' }}
          >
            ✓ {previousChapter.coda ? previousChapter.title : `Chapter ${previousChapter.romanNumeral}`} Complete
          </motion.p>
        )}

        {/* Anchor divider — small pirate-flavored chrome that pins the
            card as a moment, not just a banner. */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.6, duration: 0.45, ease: 'easeOut' }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            margin: '0 auto 1rem', maxWidth: 220,
            transformOrigin: 'center',
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(240,192,64,0.6) 100%)' }} />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px rgba(240,192,64,0.55))' }}>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10"/>
            <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3"/>
          </svg>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,192,64,0.6) 0%, transparent 100%)' }} />
        </motion.div>

        {/* "NEW CHAPTER UNLOCKED" tag */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.4 }}
          className="font-karla font-700 uppercase tracking-[0.32em]"
          style={{ fontSize: '0.56rem', color: 'rgba(240,192,64,0.75)', marginBottom: '0.5rem' }}
        >
          New Chapter Unlocked
        </motion.p>

        {/* Roman numeral — stamps in with overshoot for a real "ka-thunk"
            arrival. Cinzel weight + drop-shadow give it the feel of an
            embossed plate. */}
        <motion.p
          initial={{ opacity: 0, scale: 1.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.05, duration: 0.55, type: 'spring', stiffness: 220, damping: 14 }}
          className="font-cinzel font-700"
          style={{
            fontSize: '4.2rem', lineHeight: 1,
            color: '#ffd56b', letterSpacing: '0.04em',
            margin: '0 0 0.3rem',
            textShadow: '0 0 24px rgba(240,192,64,0.7), 0 4px 18px rgba(0,0,0,0.6)',
          }}
        >
          {chapter.romanNumeral}
        </motion.p>

        {/* Chapter title */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.45, duration: 0.45 }}
          className="font-cinzel font-700"
          style={{
            fontSize: '1.45rem', lineHeight: 1.15,
            color: '#f5f2ec', letterSpacing: '0.02em',
            marginBottom: '0.65rem',
            textShadow: '0 2px 12px rgba(0,0,0,0.7)',
          }}
        >
          {chapter.title}
        </motion.p>

        {/* Subtitle — flavor blurb. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.75, duration: 0.5 }}
          className="font-karla"
          style={{
            fontSize: '0.82rem', lineHeight: 1.5,
            color: 'rgba(245,242,236,0.78)',
            fontStyle: 'italic',
            marginBottom: '1.5rem',
            padding: '0 0.5rem',
          }}
        >
          {chapter.subtitle}
        </motion.p>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.05, duration: 0.4 }}
          whileTap={{ scale: 0.97 }}
          onClick={onDismiss}
          className="font-cinzel font-700 uppercase tracking-[0.18em]"
          style={{
            width: '100%', padding: '12px 0',
            borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(240,192,64,0.32) 0%, rgba(240,192,64,0.12) 100%)',
            border: '1px solid rgba(240,192,64,0.65)',
            borderTop: '1.5px solid rgba(255,215,120,0.9)',
            color: '#ffd56b',
            fontSize: '0.78rem',
            cursor: 'pointer',
            boxShadow: '0 0 24px rgba(240,192,64,0.22)',
          }}
        >
          Set Sail →
        </motion.button>

        {/* Subtle hint: tap backdrop also dismisses, but only after the
            CTA has appeared so the player doesn't dismiss-by-accident
            while the card is still animating in. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.4, duration: 0.4 }}
          className="font-karla"
          style={{ fontSize: '0.6rem', color: 'rgba(240,192,64,0.4)', marginTop: '0.7rem' }}
        >
          Tap anywhere to dismiss
        </motion.p>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/* ─────────────────── Ultimate-weapon unlock overlay ───────────── */

// The Chapter-3 payoff. Beating the Quartermaster reveals his stolen weapon
// schematics; this full-screen forge-lit takeover announces it and sends the
// player to the build screen. Themed molten gold-red (a foundry, not the sea)
// so it reads as distinct from the chapter-unlock parchment. Fires once
// (persisted via profiles.seen_ultimate_unlock).
function UltimateUnlockOverlay({ onBuild, onLater }: { onBuild: () => void; onLater: () => void }) {
  // Embers rising off the forge — deterministic positions, stable across renders.
  const embers = (() => {
    const arr: { left: number; size: number; delay: number; duration: number; sway: number }[] = []
    for (let i = 0; i < 16; i++) {
      arr.push({
        left:     (i * 61) % 100,
        size:     3 + ((i * 13) % 5),
        delay:    (i * 0.19) % 2.4,
        duration: 3.5 + ((i * 7) % 4),
        sway:     (i % 2 === 0 ? 1 : -1) * (7 + (i * 3) % 12),
      })
    }
    return arr
  })()

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        background: 'radial-gradient(ellipse at center, rgba(28,10,4,0.93) 0%, rgba(10,4,2,0.97) 68%, rgba(0,0,0,0.99) 100%)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={onLater}
    >
      {/* rising embers */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {embers.map((s, i) => (
          <motion.div
            key={i}
            initial={{ y: '110%', opacity: 0, x: 0 }}
            animate={{ y: '-15%', opacity: [0, 0.9, 0.9, 0], x: [0, s.sway, 0, -s.sway, 0] }}
            transition={{
              y:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'linear' },
              opacity: { duration: s.duration, delay: s.delay, repeat: Infinity, times: [0, 0.15, 0.8, 1], ease: 'easeInOut' },
              x:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute', left: `${s.left}%`, bottom: 0,
              width: s.size, height: s.size, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,200,120,0.95) 0%, rgba(240,110,50,0.6) 50%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255,140,70,0.6)',
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 450,
          padding: '1.6rem 1.4rem 1.5rem', borderRadius: 18,
          background: [
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,150,70,0.2) 0%, transparent 70%)',
            'linear-gradient(180deg, rgba(38,16,8,0.96) 0%, rgba(18,8,5,0.98) 100%)',
          ].join(', '),
          border: '1.5px solid rgba(240,140,70,0.5)',
          borderTop: '2.5px solid rgba(255,180,110,0.85)',
          boxShadow: '0 0 60px rgba(240,120,60,0.24), 0 0 140px rgba(240,120,60,0.08), inset 0 0 40px rgba(50,20,10,0.5)',
          textAlign: 'center',
        }}
      >
        {/* "Quartermaster defeated" anchor */}
        <motion.p
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }}
          className="font-karla font-700 uppercase tracking-[0.22em]"
          style={{ fontSize: '0.56rem', color: '#4ade80', marginBottom: '0.65rem' }}
        >
          ✓ The Quartermaster Falls
        </motion.p>

        {/* kicker */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.4 }}
          className="font-karla font-700 uppercase tracking-[0.3em]"
          style={{ fontSize: '0.56rem', color: 'rgba(255,180,110,0.8)', marginBottom: '0.7rem' }}
        >
          {ULTIMATE_STORY.unlockKicker}
        </motion.p>

        {/* weapon glyph — a cannon/blast mark stamping in */}
        <motion.div
          initial={{ opacity: 0, scale: 1.7 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, duration: 0.55, type: 'spring', stiffness: 210, damping: 14 }}
          style={{ margin: '0 auto 0.7rem', width: 62, height: 62, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(255,170,90,0.28) 0%, transparent 70%)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffb46e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 10px rgba(255,150,70,0.7))' }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
          </svg>
        </motion.div>

        {/* title */}
        <motion.p
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15, duration: 0.45 }}
          className="font-cinzel font-700"
          style={{ fontSize: '1.55rem', lineHeight: 1.12, color: '#fff2e2', letterSpacing: '0.02em', marginBottom: '0.7rem', textShadow: '0 0 22px rgba(255,150,70,0.4), 0 2px 12px rgba(0,0,0,0.7)' }}
        >
          {ULTIMATE_STORY.unlockTitle}
        </motion.p>

        {/* blurb */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.5 }}
          className="font-karla"
          style={{ fontSize: '0.8rem', lineHeight: 1.55, color: 'rgba(245,236,228,0.8)', marginBottom: '1rem', padding: '0 0.3rem' }}
        >
          {ULTIMATE_STORY.unlockBlurb}
        </motion.p>

        {/* the three weapons on offer */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.65, duration: 0.45 }}
          style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '1.4rem' }}
        >
          {[['Railgun', '#5fd0ff'], ['Barrage', '#ffb454'], ['Nuke', '#ff5b5b']].map(([name, col]) => (
            <span key={name} className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{ fontSize: '0.58rem', color: col, background: `${col}18`, border: `1px solid ${col}55`, borderRadius: 999, padding: '0.3rem 0.7rem' }}>
              {name}
            </span>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.85, duration: 0.4 }}
          whileTap={{ scale: 0.97 }} onClick={onBuild}
          className="font-cinzel font-700 uppercase tracking-[0.16em]"
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(255,160,80,0.4) 0%, rgba(240,120,60,0.16) 100%)',
            border: '1px solid rgba(255,160,90,0.7)', borderTop: '1.5px solid rgba(255,200,140,0.9)',
            color: '#ffe0c0', fontSize: '0.8rem', cursor: 'pointer',
            boxShadow: '0 0 26px rgba(240,120,60,0.28)',
          }}
        >
          Study the Plans →
        </motion.button>
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.15, duration: 0.4 }}
          onClick={onLater}
          className="font-karla font-600"
          style={{ marginTop: '0.7rem', background: 'transparent', border: 'none', color: 'rgba(255,180,110,0.5)', fontSize: '0.66rem', cursor: 'pointer' }}
        >
          Later
        </motion.button>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/* ─────────────────────── Repair-blocked prompt ────────────────── */

// Focused modal that fires when the player taps a combat node while
// their ship is sunk. Two failure modes were happening before this
// shipped: the tap was silently ignored, or the player did spot the
// repair banner in ShipHero but had to scroll back up to act on it.
// Now they tap the node, the prompt explains, and Pay & Repair lives
// right there. Closes + refreshes on success so the node unblocks
// inline.
function RepairBlockedModal({
  repairOwed, doubloons, onClose,
}: {
  repairOwed: number
  doubloons: number
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const canAfford = doubloons >= repairOwed

  function doRepair() {
    setErr(null)
    startTransition(async () => {
      const res = await repairShip()
      if ('error' in res) { setErr(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
      onClose()
      router.refresh()
    })
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(2,4,10,0.78)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          padding: '1.3rem 1.2rem 1.15rem',
          borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(28,14,8,0.97) 0%, rgba(18,10,8,0.98) 100%)',
          border: '1px solid rgba(239,68,68,0.45)',
          borderTop: '2px solid rgba(239,68,68,0.75)',
          boxShadow: '0 0 48px rgba(239,68,68,0.18), 0 0 120px rgba(239,68,68,0.06)',
          textAlign: 'center',
        }}
      >
        <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.56rem', color: '#ef4444', marginBottom: '0.4rem' }}>
          Ship Sunk
        </p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f5f2ec', lineHeight: 1.2, marginBottom: '0.55rem' }}>
          Repair your hull
        </p>
        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(245,242,236,0.7)', lineHeight: 1.5, marginBottom: '1.1rem', fontStyle: 'italic' }}>
          Your ship can&apos;t sail back into a fight until the hull is patched up at port.
        </p>

        <div style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '0.7rem 0.9rem',
          marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: '#a8a5a0' }}>Repair cost</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: canAfford ? '#fbbf24' : '#ef4444' }}>
            {repairOwed.toLocaleString()} ⟡
          </p>
        </div>

        {err && (
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f08a8a', marginBottom: '0.7rem' }}>
            {err}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            className="font-karla font-700 uppercase tracking-[0.12em]"
            style={{
              flex: 1, padding: '0.7rem 0',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#a8a5a0',
              fontSize: '0.72rem',
              cursor: 'pointer',
            }}
          >
            Not yet
          </button>
          <button
            onClick={doRepair}
            disabled={!canAfford || pending}
            className="font-karla font-700 uppercase tracking-[0.12em]"
            style={{
              flex: 1.4, padding: '0.7rem 0',
              borderRadius: 10,
              background: canAfford
                ? 'linear-gradient(180deg, rgba(74,222,128,0.32) 0%, rgba(74,222,128,0.12) 100%)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canAfford ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.12)'}`,
              borderTop: canAfford ? '1.5px solid rgba(120,232,160,0.8)' : '1px solid rgba(255,255,255,0.12)',
              color: canAfford ? '#86efac' : '#7a7775',
              fontSize: '0.72rem',
              cursor: canAfford && !pending ? 'pointer' : 'default',
              opacity: pending ? 0.65 : 1,
              boxShadow: canAfford ? '0 0 18px rgba(74,222,128,0.2)' : 'none',
            }}
          >
            {pending
              ? 'Repairing…'
              : canAfford
                ? <>Pay & Repair · {repairOwed.toLocaleString()} ⟡</>
                : <>Need {(repairOwed - doubloons).toLocaleString()} more ⟡</>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/* ─────────────────────── Collapsible section ─────────────────── */

// ── Bosses (farm) view ──────────────────────────────────────────────────────
// The other half of the campaign screen: a deck of boss cards grouped by
// chapter, each with Fight + Challenge one tap away, its signature drops, and
// your best clear time. Built for finished players farming specific fights.
function ViewToggle({ view, onChange }: { view: 'journey' | 'bosses'; onChange: (v: 'journey' | 'bosses') => void }) {
  const opts = [
    { id: 'journey' as const, label: 'Campaign' },
    { id: 'bosses' as const, label: 'Bosses' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {opts.map(o => {
        const on = view === o.id
        return (
          <button key={o.id} type="button" onClick={() => { if (!on) { vibrate([0, 12]); onChange(o.id) } }} className="tap"
            style={{ flex: 1, borderRadius: 11, padding: '0.5rem 0', cursor: 'pointer', textAlign: 'center',
              border: `1px solid ${on ? 'rgba(196,169,106,0.42)' : 'transparent'}`,
              background: on ? 'rgba(196,169,106,0.14)' : 'transparent',
              boxShadow: on ? '0 0 16px rgba(196,169,106,0.12)' : 'none' }}>
            <span className="font-cinzel font-700 uppercase" style={{ display: 'block', fontSize: '0.95rem', letterSpacing: '0.1em', color: on ? '#f0ede8' : '#8a857c' }}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function BossesView({ views, raidRecords, ownedRaidItems, ownedShipSkins, ownedSpecialItems = [], totalFortune = 0, repairOwed, onRepairBlocked }: {
  views: RaidNodeView[]
  raidRecords: Record<string, RaidRecords>
  ownedRaidItems: string[]
  ownedShipSkins: string[]
  ownedSpecialItems?: string[]
  totalFortune?: number
  repairOwed: number
  onRepairBlocked: () => void
}) {
  const router = useRouter()
  const [modalBoss, setModalBoss] = useState<RaidNodeView | null>(null)
  // Boss raids grouped by chapter so each grid ROW pairs a chapter's two bosses.
  // Story-gated boss identities (Finn) read from this, so the tab cannot
  // unmask - or even list - someone the player has not met.
  const clearedNodeIds = useMemo(() => new Set(views.filter(v => v.status === 'cleared').map(v => v.node.id)), [views])
  // Challenge variants stay out, because the boss's own card carries them behind
  // its Normal/Challenge toggle. Every OTHER side branch is a fight in its own
  // right with no second door, which today means the Quartermaster's Ghost.
  const bosses = views.filter(v => v.node.type === 'raid' && !isChallengeVariant(v.node.id) && bossListedInRoster(v.node, clearedNodeIds))
  const byChapter = new Map<string, RaidNodeView[]>()
  const chapterOrder: string[] = []
  for (const v of bosses) {
    const cid = chapterForNode(v.node.id).id
    if (!byChapter.has(cid)) { byChapter.set(cid, []); chapterOrder.push(cid) }
    byChapter.get(cid)!.push(v)
  }
  const nextUpId = bosses.find(v => v.status === 'available')?.node.id ?? null
  const challengeOf = (v: RaidNodeView) => views.find(c => c.node.sideBranch?.parentId === v.node.id) ?? null

  if (bosses.length === 0) {
    return <p className="font-karla" style={{ fontSize: '0.8rem', color: '#8a857c', textAlign: 'center', padding: '1.5rem 0' }}>No boss raids charted yet.</p>
  }
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {chapterOrder.map(cid => {
        const all = byChapter.get(cid)!
        // A chapter's MAIN pair keeps the two-up grid. A side branch is a mini
        // boss: a one-bar detour off the chapter, not one of its pillars, so it
        // drops to its own centred row at well under half the width. Sizing is
        // the whole signal, which is why it needs no badge saying "optional".
        const main = all.filter(v => !v.node.sideBranch)
        const mini = all.filter(v => !!v.node.sideBranch)
        // A chapter with a single MAIN boss is the CODA: Finn, alone, at the end.
        // Half a row makes the last fight in the game look like a side branch,
        // so he takes the row on his own and sits centred.
        const solo = main.length === 1
        const tile = (v: RaidNodeView) => (
          <BossTile key={v.node.id} view={v} isNext={v.node.id === nextUpId} challengeCleared={challengeOf(v)?.status === 'cleared'} clearedNodeIds={clearedNodeIds} onOpen={() => { vibrate([0, 12]); setModalBoss(v) }} />
        )
        // The two rows sit in MAP ORDER, not main-then-mini. The Ghost unlocks
        // off the Muster and is fought before Sal Brackwater and Don Finleone,
        // so parking him beneath them would have this tab telling a different
        // story from the campaign. `all` is already in RAID_MAP order, so the
        // question is only which kind comes first in it.
        const miniFirst = mini.length > 0 && main.length > 0 && all.indexOf(mini[0]) < all.indexOf(main[0])
        const mainRow = main.length > 0 ? (
          <div key="main" style={solo
            ? { display: 'grid', gridTemplateColumns: 'minmax(0, 72%)', justifyContent: 'center', gap: 10 }
            : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {main.map(tile)}
          </div>
        ) : null
        const miniRow = mini.length > 0 ? (
          <div key="mini" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 38%))', justifyContent: 'center', gap: 10 }}>
            {mini.map(tile)}
          </div>
        ) : null
        return (
        <div key={cid} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {miniFirst ? <>{miniRow}{mainRow}</> : <>{mainRow}{miniRow}</>}
        </div>
        )
      })}
      {modalBoss && (
        <BossFightModal
          key={modalBoss.node.id}
          clearedNodeIds={clearedNodeIds}
          boss={modalBoss}
          challenge={challengeOf(modalBoss)}
          rec={modalBoss.node.raidId ? raidRecords[modalBoss.node.raidId] ?? null : null}
          challengeRec={challengeOf(modalBoss)?.node.raidId ? raidRecords[challengeOf(modalBoss)!.node.raidId!] ?? null : null}
          ownedRaidItems={ownedRaidItems}
          ownedShipSkins={ownedShipSkins}
          ownedSpecialItems={ownedSpecialItems}
            totalFortune={totalFortune}
          isNext={modalBoss.node.id === nextUpId}
          repairOwed={repairOwed}
          onEnter={r => router.push(r)}
          onRepairBlocked={onRepairBlocked}
          onClose={() => setModalBoss(null)}
        />
      )}
    </div>
  )
}

// The boss's actual NAME (e.g. "Barnacle Pete"), not the raid/encounter label —
// pulled from the raid config's boss enemy. Falls back to the node label.
function bossNameOf(node: { raidId?: string; label: string }): string {
  const cfg = node.raidId ? getRaidConfigById(node.raidId) : undefined
  return cfg?.enemies[cfg.bossId]?.name ?? node.label
}

// A single art-forward boss tile — a large portrait with the name over a bottom
// scrim + a status marker. Tapping opens the BossFightModal.
function BossTile({ view, isNext, challengeCleared, clearedNodeIds, onOpen }: { view: RaidNodeView; isNext: boolean; challengeCleared: boolean; clearedNodeIds: Set<string>; onOpen: () => void }) {
  const node = view.node
  const bossName = bossNameOf(node)
  const cleared = view.status === 'cleared'
  // See the note in the boss panel below: revealed-by-story bosses are not masked.
  const shown = cleared || bossIdentityRevealed(node, clearedNodeIds)
  const locked = view.status === 'locked'
  const accent = locked ? '#4f4a42' : isNext ? '#5eead4' : '#c4a96a'
  return (
    <button type="button" onClick={onOpen} className="tap"
      // 4:5 -> 4:4.4. A chapter can now stack a mini-boss row under its pair,
      // so every card gives back a little height to pay for it.
      style={{ position: 'relative', aspectRatio: '4 / 4.4', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', padding: 0,
        border: `1px solid ${accent}${locked ? '3a' : '99'}`,
        background: cleared ? '#0c1119' : 'radial-gradient(circle at 50% 34%, #1a2636 0%, #0a0f16 72%)',
        boxShadow: isNext ? `0 0 0 1px ${accent}40, 0 0 22px ${accent}22` : '0 6px 18px rgba(0,0,0,0.42)' }}>
      {node.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={node.image} alt={shown ? bossName : 'Undiscovered boss'} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 16%',
            filter: shown ? 'grayscale(0.28) brightness(0.82)' : 'brightness(0)' }} />
      )}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,10,16,0) 42%, rgba(6,10,16,0.9) 100%)' }} />
      {cleared && (
        <span style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
          {/* Normal cleared (teal) + Challenge cleared (crimson) — a boss can carry both. */}
          <span title="Normal cleared" aria-label="Normal cleared" style={{ width: 20, height: 20, borderRadius: '50%', background: '#2dd4aa', display: 'grid', placeItems: 'center', boxShadow: '0 0 9px rgba(45,212,170,0.55)', border: '1.5px solid rgba(6,17,12,0.5)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06110c" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
          </span>
          {challengeCleared && (
            <span title="Challenge cleared" aria-label="Challenge cleared" style={{ width: 20, height: 20, borderRadius: '50%', background: '#ff6a48', display: 'grid', placeItems: 'center', boxShadow: '0 0 9px rgba(255,106,72,0.55)', border: '1.5px solid rgba(22,6,4,0.5)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1a0705" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
            </span>
          )}
        </span>
      )}
      {isNext && (
        <span className="font-karla font-700 uppercase" style={{ position: 'absolute', top: 8, left: 8, fontSize: '0.5rem', letterSpacing: '0.1em', color: '#08120f', background: 'rgba(94,234,212,0.92)', padding: '2px 7px', borderRadius: 999, boxShadow: '0 0 12px rgba(94,234,212,0.45)' }}>Next</span>
      )}
      {locked && <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><IconLock size={26} /></span>}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.45rem 0.55rem 0.55rem' }}>
        <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.98rem', lineHeight: 1.06, color: shown ? '#fff' : '#8f887c', letterSpacing: shown ? undefined : '0.15em', textShadow: '0 2px 7px rgba(0,0,0,0.95)' }}>{shown ? bossName : '???'}</span>
      </span>
    </button>
  )
}

// The boss fight modal — opens on a tile tap. Shows the big portrait, the drops,
// and the choice of Fight (normal) vs Challenge. Portaled + backdrop-dismissable.
function BossFightModal({ boss, challenge, rec, challengeRec, ownedRaidItems, ownedShipSkins, ownedSpecialItems = [], totalFortune = 0, isNext, repairOwed, onEnter, onRepairBlocked, onClose, clearedNodeIds }: {
  boss: RaidNodeView
  challenge: RaidNodeView | null
  rec: RaidRecords | null
  challengeRec: RaidRecords | null
  ownedRaidItems: string[]
  ownedShipSkins: string[]
  ownedSpecialItems?: string[]
  totalFortune?: number
  isNext: boolean
  repairOwed: number
  onEnter: (route: string) => void
  onRepairBlocked: () => void
  onClose: () => void
  /** Cleared node ids — decides whether a story-gated boss is unmasked. */
  clearedNodeIds: Set<string>
}) {
  // Tapping a drop opens the same DropDetailModal the map nodes use, so an item
  // reads identically wherever you meet it. Local state: this modal is portaled
  // and rendered from two call sites, and neither should have to own this.
  const [dropDetail, setDropDetail] = useState<RaidNodeDrop | null>(null)
  const onDropTap = (d: RaidNodeDrop) => setDropDetail(d)
  const node = boss.node
  const bossName = bossNameOf(node)
  const cleared = boss.status === 'cleared'   // beat the boss NORMALLY → art revealed
  // Identity masking is separate from CLEARED: a boss the story has already
  // introduced should not be a silhouette just because you have not beaten them.
  // But "already introduced" has to MEAN it — see bossIdentityRevealed.
  const shown = cleared || bossIdentityRevealed(boss.node, clearedNodeIds)
  const locked = boss.status === 'locked'
  const blocked = repairOwed > 0
  const chAvailable = !!challenge && (challenge.status === 'available' || challenge.status === 'cleared')
  const chCleared = challenge?.status === 'cleared'

  // Normal ⇄ Challenge toggle drives which mode's info the sheet shows. Only
  // offered when a challenge branch exists and the boss itself isn't locked.
  const showToggle = !locked && !!challenge
  const [mode, setMode] = useState<'normal' | 'challenge'>('normal')
  const isChallenge = mode === 'challenge' && !!challenge
  const activeNode = (isChallenge && challenge ? challenge : boss).node
  const activeRec = isChallenge ? challengeRec : rec
  const accent = locked ? '#6a6764' : isChallenge ? '#e08a7a' : isNext ? '#5eead4' : '#c4a96a'
  const backdrop = node.raidId ? (RAID_BOSS_BG[node.raidId] ?? RAID_LOCATION_BG[node.raidId]) : undefined

  // Drops for the ACTIVE mode, with LIVE odds. uniqueShare raids reserve a fixed
  // slice of the crate split across the uniques you still need, so a static "8%"
  // is really 50% when only one is left — recompute against what you own.
  const cfg = activeNode.raidId ? getRaidConfigById(activeNode.raidId) : undefined
  // These used to be a hand-copied second pair, which is exactly how the Eye
  // could be taught to makeLiveChance and STILL show unclaimed here. Taken off
  // the one helper now so there is a single answer to "do I own this".
  const { liveChance, dropOwned, lootOwned } = makeLiveChance(cfg, ownedRaidItems, ownedShipSkins, totalFortune, ownedSpecialItems)
  // specialItemId is in here because Finn's Eye is a FISHING special: without it
  // the headline drop off the final boss never rendered on his own card. The cap
  // is 6 rather than 4 for the same reason, since he alone drops five.
  // No slice. It used to cap at 6, which was invisible on every boss in the game
  // except the Quartermaster's Ghost: he carries EIGHT Cache items and the card
  // silently hid two of them, so the one boss whose entire purpose is showing you
  // what he still holds was the one boss lying about it.
  const drops = (activeNode.detail?.drops ?? []).filter(d => (d.rarity === 'epic' || d.rarity === 'legendary' || d.rarity === 'ancient' || d.rarity === 'cosmetic') && (d.raidItemId || d.shipSkinId || d.specialItemId))
  // Gear and hull skins are different KINDS of prize: one changes how you fight,
  // the other changes how you look, and they were sharing a rail with the skin
  // usually sitting first. Split, so each row answers one question.
  const dropItems = drops.filter(d => !d.shipSkinId)
  const dropSkins = drops.filter(d => !!d.shipSkinId)

  // Header status pill reflects the active mode.
  const pillCleared = isChallenge ? chCleared : cleared
  const pillNext = !isChallenge && isNext && !cleared
  const pillLocked = isChallenge ? !chAvailable : locked
  const pillLabel = pillCleared ? 'Cleared' : pillNext ? 'Next up' : pillLocked ? 'Locked' : 'Ready'

  const enterRoute = activeNode.route
  const enterBlocked = locked || (isChallenge && !chAvailable)

  function doEnter() {
    if (enterBlocked || !enterRoute) return
    if (blocked) { onRepairBlocked(); return }
    vibrate([0, 16, 30, 24])
    onEnter(enterRoute)
  }

  return createPortal(
    <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,7,12,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div onClick={e => e.stopPropagation()} initial={{ y: 60 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ width: '100%', maxWidth: 440, background: '#0a1119', borderRadius: '22px 22px 0 0', overflow: 'hidden', border: `1px solid ${accent}55`, borderBottom: 'none', boxShadow: '0 -12px 50px rgba(0,0,0,0.6)' }}>
        {/* Mode toggle — sits ABOVE the art. Switching it re-skins the whole
            sheet (drops, odds, records) to that mode; the bottom stays one
            Enter Raid button that launches whichever mode is selected. */}
        {showToggle && (
          <div style={{ display: 'flex', gap: 6, padding: '0.7rem 0.8rem 0.55rem' }}>
            {([['normal', 'Normal', 'standard loot', '#5eead4'], ['challenge', chCleared ? 'Challenge ✓' : 'Challenge', chAvailable ? 'bonus loot' : 'clear the raid first', '#e08a7a']] as const).map(([m, label, sub, acc]) => {
              const on = mode === m
              return (
                <button key={m} type="button" onClick={() => setMode(m)} className="tap"
                  style={{ flex: 1, borderRadius: 12, padding: '0.5rem 0', textAlign: 'center', lineHeight: 1.1, cursor: 'pointer',
                    border: `1px solid ${on ? `${acc}b0` : 'rgba(255,255,255,0.1)'}`,
                    background: on ? `${acc}22` : 'rgba(255,255,255,0.03)', color: on ? '#f4efe4' : '#8a857c' }}>
                  <span className="font-cinzel font-800 uppercase" style={{ display: 'block', fontSize: '0.82rem', letterSpacing: '0.06em' }}>{label}</span>
                  <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.5rem', letterSpacing: '0.04em', opacity: 0.8, marginTop: 1 }}>{sub}</span>
                </button>
              )
            })}
          </div>
        )}
        <div style={{ position: 'relative', height: 230 }}>
          {backdrop && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backdrop} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: shown ? 0.5 : 0.3, filter: shown ? undefined : 'grayscale(1) brightness(0.55)' }} />
          )}
          {node.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.image} alt={shown ? bossName : 'Undiscovered boss'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 28%', filter: shown ? 'drop-shadow(0 8px 22px rgba(0,0,0,0.6))' : 'brightness(0) drop-shadow(0 8px 22px rgba(0,0,0,0.6))' }} />
          )}
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,10,16,0.2) 0%, rgba(6,10,16,0.12) 52%, rgba(10,17,25,0.98) 100%)' }} />
          <button type="button" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.18)', color: '#e6e0d4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 1.1rem 0.6rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.55rem', lineHeight: 1.05, color: shown ? '#fff' : '#c8c1b3', letterSpacing: shown ? undefined : '0.14em', textShadow: `0 2px 10px rgba(0,0,0,0.9), 0 0 20px ${accent}30` }}>{shown ? bossName : '???'}</p>
            <span className="font-karla font-700 uppercase" style={{ flexShrink: 0, fontSize: '0.5rem', letterSpacing: '0.12em', padding: '0.26rem 0.6rem', borderRadius: 999, marginBottom: 5,
              ...(pillCleared ? { color: '#8ff0c0', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.45)' }
                : pillNext ? { color: '#08120f', background: 'rgba(94,234,212,0.92)' }
                : pillLocked ? { color: '#8a857c', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }
                : { color: accent, background: `${accent}22`, border: `1px solid ${accent}66` }) }}>
              {pillLabel}
            </span>
          </div>
        </div>
        <div style={{ padding: '0.55rem 1.1rem 1.4rem' }}>
          {drops.length > 0 && (
            <>
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.18em', color: '#8a857c', marginBottom: 8 }}>Drops</p>
              {/* WRAPPING GRIDS, not a sideways rail. The rail kept every boss to
                  one line, but it also meant most of a long table lived off the
                  right edge where you had to know to swipe for it. These sheets
                  scroll vertically anyway, so the grid just uses that: the
                  Ghost's eight items land as two rows of four, all visible.
                  Skins share the items' cell width: hullDropImage trims their
                  sprites to the ship, so there is no 16:9 canvas to make room
                  for any more. */}
              {(() => {
                const tile = (d: RaidNodeDrop) => {
                  const rc = (d.rarity && RARITY_COLOR[d.rarity]) || '#c4a96a'
                  const owned = dropOwned(d)
                  const chance = owned ? undefined : (liveChance(d) ?? d.chance)
                  return (
                    <button
                      key={d.id ?? d.label}
                      type="button"
                      onClick={() => onDropTap(d)}
                      aria-label={`${d.label}${chance ? `, ${chance}` : ', owned'}, details`}
                      style={{
                        width: '100%', minWidth: 0,
                        display: 'flex', flexDirection: 'column', gap: 3,
                        padding: 0, background: 'none', border: 'none',
                        cursor: 'pointer', font: 'inherit', touchAction: 'manipulation',
                      }}
                    >
                      {/* No plate behind the art: the piece sits on the sheet
                          itself. A drop shadow tinted to its rarity does the
                          work the border used to, without boxing it in. */}
                      {/* 84 -> 60. Two stacked rows cost the sheet a whole extra
                          band of height, and the art was sized for a single rail
                          where vertical space was free. */}
                      {/* LEFT, not centre, so art and name sit over each other.
                          Art of different widths centred in a cell puts every
                          piece on its own left edge; anchoring both to the cell
                          gives the whole grid one margin. */}
                      <div style={{
                        position: 'relative', width: '100%', height: 60,
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                      }}>
                        {d.swatch
                          ? <div style={{ width: '100%', height: '100%', borderRadius: 10, background: d.swatch, filter: d.swatchFilter }} />
                          : d.image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img
                                src={d.image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                style={{
                                  // Every drop draws to the same height and starts
                                  // at the same left edge. The hull used to stretch
                                  // to the cell's full WIDTH, which only made sense
                                  // while its sprite was a wide canvas with a small
                                  // ship adrift in it.
                                  width: 'auto', height: '100%',
                                  maxWidth: '100%', maxHeight: '100%',
                                  objectFit: 'contain',
                                  filter: [d.imageFilter, `drop-shadow(0 3px 10px ${rc}66)`].filter(Boolean).join(' '),
                                  opacity: owned ? 0.9 : 1,
                                }}
                              />
                            : <span style={{ color: rc, display: 'flex' }}><IconCrate size={30} /></span>}
                        {owned && (
                          <span style={{
                            position: 'absolute', top: 5, left: 5,
                            width: 17, height: 17, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(10,20,14,0.86)', border: '1px solid rgba(74,222,128,0.65)',
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                          </span>
                        )}
                      </div>
                      <span className="font-karla font-800 uppercase tracking-[0.08em]" style={{
                        fontSize: '0.6rem', textAlign: 'left',
                        color: owned ? '#7fd49a' : rc,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {owned ? 'Owned' : (chance ?? 'Drop')}
                      </span>
                      {/* Name never wraps: a two-line name would make one tile
                          taller than its neighbours and break the rail's line.
                          It clips, and the full name is in the detail modal. */}
                      <span className="font-karla font-600" style={{
                        display: 'block', width: '100%',
                        fontSize: '0.62rem', lineHeight: 1.25, textAlign: 'left',
                        color: '#b9b3a8',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {d.label}
                      </span>
                    </button>
                  )
                }
                // Sub-labels only when there is something to tell apart. On a
                // boss with no skin, "Items" under "Drops" is a heading for the
                // sake of having one.
                const split = dropItems.length > 0 && dropSkins.length > 0
                const sub = (t: string) => (
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#6f6a63', marginBottom: 6 }}>{t}</p>
                )
                return (
                  <div style={{ marginBottom: 16 }}>
                    {/* FIXED tracks, not minmax(_, 1fr). With 1fr the cells
                        stretch to fill the row, so two items and one hull skin
                        ended up at completely different widths and the two rows
                        no longer started from the same edge. Fixed widths keep
                        every cell the size its art wants and let both rows pack
                        from the left, wrapping when they run out of room.
                        Both rows are 80px now: the hull sprites are trimmed to
                        the ship, so a skin is about as wide as an item instead
                        of a 16:9 canvas. */}
                    {dropItems.length > 0 && (
                      <div style={{ marginBottom: dropSkins.length > 0 ? 12 : 0 }}>
                        {split && sub('Items')}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', justifyContent: 'start', gap: 8 }}>
                          {dropItems.map(tile)}
                        </div>
                      </div>
                    )}
                    {dropSkins.length > 0 && (
                      <div>
                        {split && sub('Ship Skins')}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 80px)', justifyContent: 'start', gap: 8 }}>
                          {dropSkins.map(tile)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
          {activeRec && (
            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
              <div>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#8a857c', marginBottom: 2 }}>Your best</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: activeRec.yourBestMs != null ? '#e6dcc4' : '#6a6764', fontVariantNumeric: 'tabular-nums' }}>{activeRec.yourBestMs != null ? formatRaidMs(activeRec.yourBestMs) : '—'}</p>
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#8a857c', marginBottom: 2 }}>Fastest clear</p>
                {activeRec.fastestMs > 0 ? (
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#e6dcc4', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatRaidMs(activeRec.fastestMs)} <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8a857c' }}>· {activeRec.fastestUsername}</span></p>
                ) : (
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#6a6764' }}>—</p>
                )}
              </div>
            </div>
          )}
          {locked ? (
            <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#8a857c', display: 'flex', alignItems: 'center', gap: 7, padding: '0.4rem 0' }}>
              <IconLock size={15} /> {boss.lockReason ?? 'Locked'}
            </p>
          ) : (
            <button type="button" className="tap" disabled={enterBlocked} onClick={doEnter}
              style={{ width: '100%', borderRadius: 13, padding: '0.9rem 0', textAlign: 'center', lineHeight: 1.15, cursor: enterBlocked ? 'default' : 'pointer',
                border: `1px solid ${enterBlocked ? 'rgba(255,255,255,0.1)' : `${accent}b0`}`,
                background: enterBlocked ? 'rgba(255,255,255,0.04)' : `${accent}2a`, color: enterBlocked ? '#6a6764' : '#f4efe4' }}>
              <span className="font-cinzel font-800 uppercase" style={{ display: 'block', fontSize: '1.05rem', letterSpacing: '0.08em' }}>
                {isChallenge && !chAvailable ? 'Clear the Raid First' : 'Enter Raid →'}
              </span>
              <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.52rem', letterSpacing: '0.05em', opacity: 0.75, marginTop: 2 }}>
                {isChallenge ? 'Challenge · bonus loot' : 'Normal · standard loot'}
              </span>
            </button>
          )}
        </div>
      </motion.div>
      {/* Sits INSIDE the boss modal's portal so it stacks above it. Its own
          click-stop keeps a tap inside the detail from closing the sheet
          underneath it. */}
      {dropDetail && (
        <div onClick={e => e.stopPropagation()}>
          <DropDetailModal
            drop={dropDetail}
            chance={liveChance(dropDetail)}
            owned={(!!dropDetail.id && ownedRaidItems.includes(dropDetail.id)) || (!!dropDetail.shipSkinId && ownedShipSkins.includes(dropDetail.shipSkinId))}
            onClose={() => setDropDetail(null)}
          />
        </div>
      )}
    </motion.div>,
    document.body,
  )
}

// A chapter's nodes as a clean vertical spine (replaces the serpentine map).
// Combat nodes are mini boss cards; story/muster/puzzle beats are dots on the
// spine; challenge side-branches indent as crimson detours. Preserves the old
// progressive reveal (fog nodes far past the current one; the chapter's last
// node shows as a faded beacon). Every tap opens the shared NodeDetailSheet.
function JourneyChapter({ views, onSelect }: { views: RaidNodeView[]; onSelect: (v: RaidNodeView) => void }) {
  const chainIdx = views.map((v, i) => (v.node.sideBranch ? -1 : i)).filter(i => i >= 0)
  const currentIdx = views.findIndex(v => v.status === 'available' && !v.node.sideBranch)
  const currentChainPos = currentIdx >= 0 ? chainIdx.indexOf(currentIdx) : -1
  const lastChainPos = chainIdx.length - 1
  const chainPosOf = (i: number): number => {
    const v = views[i]
    if (!v.node.sideBranch) return chainIdx.indexOf(i)
    const p = views.findIndex(x => x.node.id === v.node.sideBranch!.parentId)
    return p >= 0 ? chainIdx.indexOf(p) : 0
  }
  const visOf = (i: number): 'revealed' | 'fogged' | 'beacon' => {
    const v = views[i]
    if (v.status === 'cleared' || v.status === 'available') return 'revealed'
    // previewWhenLocked marks a node whose whole job is to be a GOAL. Fogging
    // one hides the reason to go and earn it, which is the entire point of the
    // flag. The old serpentine map read it; this spine never did.
    if (v.node.previewWhenLocked) return 'revealed'
    if (currentChainPos < 0) return 'revealed'
    const pos = chainPosOf(i)
    if (pos <= currentChainPos + REVEAL_AHEAD) return 'revealed'
    if (!v.node.sideBranch && pos === lastChainPos) return 'beacon'
    return 'fogged'
  }
  // Drop CHALLENGE variants only: they are the ones the boss banner's own
  // Normal/Challenge modal already covers, so a banner here would be a second
  // door to the same fight. Every other side branch keeps its place on the
  // spine, because nothing else on the page is drawing it.
  const rows = views.map((v, i) => ({ v, vis: visOf(i) }))
    .filter(r => r.vis !== 'fogged')
    .filter(r => !isChallengeVariant(r.v.node.id))
  const anyFogged = views.some((_, i) => visOf(i) === 'fogged')

  return (
    <div style={{ position: 'relative', padding: '2px 2px 4px' }}>
      <div aria-hidden style={{ position: 'absolute', left: 22, top: 16, bottom: 18, width: 2, background: 'linear-gradient(180deg, rgba(196,169,106,0.5), rgba(196,169,106,0.1))' }} />
      {rows.map(({ v, vis }) => {
        const node = v.node
        const cleared = v.status === 'cleared'
        const beacon = vis === 'beacon'
        const locked = v.status === 'locked' || beacon
        const isCurrent = v.status === 'available' && !node.sideBranch
        const isSide = !!node.sideBranch
        const combat = isCombatNode(node.type)
        const accent = beacon ? '#6a6764' : isSide ? SIDE_BRANCH_ACCENT : isCurrent ? '#5eead4' : '#c4a96a'
        return (
          <button key={node.id} type="button" onClick={() => { vibrate([0, 10]); onSelect(v) }} className="tap"
            style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: combat ? '5px 0' : '3px 0', cursor: 'pointer', position: 'relative', paddingLeft: isSide ? 30 : 0, opacity: locked ? 0.64 : 1 }}>
            <span style={{ flex: '0 0 44px', display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
              {combat ? (
                // Combat nodes carry their art in the banner to the right, so the
                // spine gets a small diamond waypoint instead of a duplicate thumb.
                <span aria-hidden style={{ width: 18, height: 18, transform: 'rotate(45deg)', borderRadius: 4, background: cleared ? '#2dd4aa' : isCurrent ? '#5eead4' : '#0c1119', border: `2px solid ${accent}`, boxShadow: isCurrent ? `0 0 12px ${accent}` : '0 2px 6px rgba(0,0,0,0.5)' }} />
              ) : (
                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: cleared ? 'radial-gradient(circle,#2dd4aa,#0c3a30)' : '#0c1119', border: `2px solid ${cleared ? '#2dd4aa' : accent}` }}>
                  {cleared
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#06110c" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                    : <NodeGlyph type={node.type} color={accent} size={11} />}
                </span>
              )}
            </span>
            {combat ? (
              // Art-forward banner: the boss portrait fills the card, name +
              // flavor ride a left-to-right scrim so the art stays the hero.
              // Full height for every combat banner. The 66px variant was built
              // for challenge detours, which no longer reach the spine, so the
              // only thing it shrank was a real boss: the caption block is
              // bottom-anchored and grows UP, so a long name that wrapped ran
              // straight out of the top of the box and got clipped.
              <span style={{ flex: 1, minWidth: 0, position: 'relative', display: 'block', borderRadius: 14, overflow: 'hidden', height: 84, background: '#0c141d', border: `1px solid ${accent}${locked ? '2a' : '55'}`, boxShadow: isCurrent ? `0 0 20px ${accent}22` : '0 5px 16px rgba(0,0,0,0.45)' }}>
                {node.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={node.image} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 26%', filter: locked ? 'grayscale(1) brightness(0.5)' : cleared ? 'grayscale(0.4) brightness(0.66)' : 'brightness(0.82)' }} />
                )}
                <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,16,0.94) 0%, rgba(6,10,16,0.6) 52%, rgba(6,10,16,0.2) 100%)' }} />
                {isCurrent && <span className="font-karla font-700 uppercase" style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.5rem', letterSpacing: '0.12em', color: '#08120f', background: 'rgba(94,234,212,0.92)', padding: '2px 7px', borderRadius: 999, boxShadow: '0 0 12px rgba(94,234,212,0.4)', zIndex: 2 }}>You are here</span>}
                {cleared && !isCurrent && (
                  <span aria-hidden style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: isSide ? '#ff6a48' : '#2dd4aa', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 2 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06110c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                  </span>
                )}
                <span style={{ position: 'absolute', left: 13, right: 12, bottom: 9, zIndex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '1.16rem', color: locked ? '#b8b1a5' : '#fff', lineHeight: 1.05, textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>{node.label}</span>
                    {/* No branch tag. It said "Challenge" back when challenges
                        were the only side branches drawn here, and they are now
                        the only ones that are NOT. Relabelling it just put a
                        word on the card that the indent and the crimson accent
                        already say, beside a name that needs the room. */}
                  </span>
                  <span className="font-karla" style={{ display: 'block', fontSize: '0.76rem', color: 'rgba(233,226,214,0.82)', marginTop: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{node.flavor}</span>
                </span>
              </span>
            ) : (
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="font-karla font-700" style={{ fontSize: '0.86rem', color: locked ? '#8a857c' : cleared ? '#b0a99b' : '#d8d0c0' }}>{node.label}</span>
                <span className="font-karla font-600 uppercase" style={{ display: 'block', fontSize: '0.54rem', letterSpacing: '0.1em', color: '#6a6764', marginTop: 2 }}>{beacon ? "Chapter's end" : nodeTypeLabel(node.type)}</span>
              </span>
            )}
          </button>
        )
      })}
      {anyFogged && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 2 }}>
          <span aria-hidden style={{ flex: '0 0 44px', textAlign: 'center', color: '#4f4a42', fontSize: '1rem' }}>⋯</span>
          <span className="font-karla" style={{ fontSize: '0.72rem', color: '#5b5449', fontStyle: 'italic' }}>uncharted waters ahead</span>
        </div>
      )}
    </div>
  )
}

export default function RaidsSection({ views, doubloons, totalFortune = 0, spoilFree = null, spoilPaid = null, navLevel, playerShipImage, raidRecords, repairOwed, ownedRaidItems, ownedShipSkins = [], ownedSpecialItems = [], equippedRaidItems, shipClasses, seenChapterUnlocks, seenUltimateUnlock, raidNodeChoices, topRaidProgress, hasSixthBerth = false, hasArmoryExpansion = false, musterParty = [] }: { views: RaidNodeView[]; doubloons: number; /** Crew Fortune, so a boss card quotes the odds that boss actually rolls. */ totalFortune?: number; spoilFree?: string | null; spoilPaid?: string | null; navLevel: number; playerShipImage?: string; raidRecords: Record<string, RaidRecords>; repairOwed: number; ownedRaidItems: string[]; ownedShipSkins?: string[]; /** Fishing specials owned (boolean columns, not raid_items) — Finn drops one. */ ownedSpecialItems?: string[]; equippedRaidItems: string[]; shipClasses: Record<string, string>; seenChapterUnlocks: string[]; seenUltimateUnlock: boolean; raidNodeChoices: Record<string, string>; topRaidProgress: { username: string; score: number } | null; hasSixthBerth?: boolean; hasArmoryExpansion?: boolean; musterParty?: MusterCrew[] }) {
  const [open, setOpen] = useState(true)
  const router = useRouter()
  // Journey (the story map) vs Bosses (a farm deck — every boss with Fight +
  // Challenge one tap away). Journey stays the default for the narrative.
  const [view, setView] = useState<'journey' | 'bosses'>('journey')
  const [selected, setSelected] = useState<RaidNodeView | null>(null)

  // ?boss=<nodeId> opens that boss's card on arrival. The forge's build planner
  // uses it: a drop in a recipe tree names where it falls, and tapping it lands
  // you here on the fight that drops it. A query param rather than shared state
  // because the forge is a SEPARATE ROUTE (/expeditions/forge), so the two never
  // exist at once and there is nothing to hand off between them.
  //
  // The param is stripped once consumed, so a refresh or a back-navigation does
  // not keep reopening a sheet the player already dismissed.
  //
  // Read straight off the URL rather than through useSearchParams: that hook
  // forces a Suspense boundary on any route Next statically analyses, and
  // /expeditions is not force-dynamic the way /crew is. This runs once on mount
  // and strips the param immediately, so the reactive hook bought nothing and
  // cost a build constraint.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bossParam = new URLSearchParams(window.location.search).get('boss')
    if (!bossParam) return
    const target = views.find(v => v.node.id === bossParam)
    if (target) setSelected(target)
    router.replace('/expeditions', { scroll: false })
    // Mount only: the param is consumed and cleared, so re-running on `views`
    // would just re-read an empty query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Per-chapter manual toggle overrides. Membership means the player
  // has flipped the default open/closed state for that chapter — works
  // in both directions: open a fully-cleared chapter back up, OR close
  // a main-cleared chapter that still has open challenges. Ephemeral
  // (resets on page navigation) — chapters are not something you
  // revisit often enough to bother persisting.
  const [chaptersToggled, setChaptersToggled] = useState<Set<string>>(new Set())
  // Fires when the player taps a combat node while the ship is sunk.
  // Opens a focused repair prompt (RepairBlockedModal) — they can pay
  // and patch the hull right there instead of scrolling back to the
  // ShipHero banner up the page.
  const [repairPromptOpen, setRepairPromptOpen] = useState(false)
  // First-time chapter-unlock celebration. Set on mount if the player
  // has just cleared chapter N-1 but never dismissed the chapter N
  // overlay. Cleared by tapping the CTA, which fires the server
  // action to persist seen-state across devices.
  const [celebratingChapter, setCelebratingChapter] = useState<RaidChapter | null>(null)
  // Legendary-recruitable celebration. A gate story node's read fires a
  // 'legendary-unlocked' window event (the node sheet unmounts on read, so it
  // can't render the overlay itself); the root catches it here and shows the
  // reveal that outlives the closing scene.
  const [unlockedLegendary, setUnlockedLegendary] = useState<UnlockedLegendary | null>(null)
  useEffect(() => {
    const onUnlock = (e: Event) => {
      const detail = (e as CustomEvent<UnlockedLegendary>).detail
      if (detail) setUnlockedLegendary(detail)
    }
    window.addEventListener('legendary-unlocked', onUnlock)
    return () => window.removeEventListener('legendary-unlocked', onUnlock)
  }, [])
  const clearedCount = views.filter(v => v.status === 'cleared').length

  // Detect "just unlocked, never seen" celebrations. The bucket math
  // here mirrors the chapter-rendering pass below — done once on mount
  // (and whenever views/seen change, e.g. after dismiss) so the
  // overlay can fire without waiting on player interaction.
  useEffect(() => {
    const groups = new Map<string, RaidNodeView[]>()
    for (const v of views) {
      const cid = chapterForNode(v.node.id).id
      const arr = groups.get(cid) ?? []
      arr.push(v)
      groups.set(cid, arr)
    }
    const seen = new Set(seenChapterUnlocks)
    // Chapter 0 has no "unlocked" moment (it's the player's starting
    // point) — start from index 1 and celebrate the first chapter
    // where the previous chapter's MAIN path is cleared AND the
    // player hasn't dismissed the overlay yet.
    for (let i = 1; i < RAID_CHAPTERS.length; i++) {
      const prev = RAID_CHAPTERS[i - 1]
      const curr = RAID_CHAPTERS[i]
      if (seen.has(curr.id)) continue
      const prevBucket = groups.get(prev.id) ?? []
      // Filter out coming-soon nodes too — they're stubs the player can't
      // complete yet, so they shouldn't perpetually block the chapter's
      // "cleared" signal for content that's already shipped.
      const prevMain = prevBucket.filter(v => !v.node.sideBranch && !v.node.comingSoon)
      const prevMainCleared = prevMain.length > 0 && prevMain.every(v => v.status === 'cleared')
      if (prevMainCleared) {
        setCelebratingChapter(curr)
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, seenChapterUnlocks])

  function dismissCelebration() {
    if (!celebratingChapter) return
    const id = celebratingChapter.id
    setCelebratingChapter(null)
    // Fire-and-forget — even if the request fails, the in-memory
    // dismiss closes the overlay for this session. Next visit will
    // re-trigger it; the player rarely notices a single retry.
    markChapterUnlockSeen(id).catch(() => {})
  }

  // ── Ultimate-weapon unlock celebration ──────────────────────────────────
  // Fires once when the player has beaten the Quartermaster (the final
  // Chapter 3 raid, node id 'the_quartermaster') and never dismissed the
  // "plans discovered" overlay. Separate from the chapter-unlock flow —
  // Chapter 3 is currently the last chapter, so there's no "next chapter"
  // moment; THIS is the payoff. Persisted via profiles.seen_ultimate_unlock.
  const chapter3Cleared = views.some(v => v.node.id === 'the_quartermaster' && v.status === 'cleared')
  const [celebratingUltimate, setCelebratingUltimate] = useState(false)
  useEffect(() => {
    if (chapter3Cleared && !seenUltimateUnlock) setCelebratingUltimate(true)
  }, [chapter3Cleared, seenUltimateUnlock])

  function dismissUltimate(goBuild: boolean) {
    setCelebratingUltimate(false)
    markUltimateUnlockSeen().catch(() => {})
    if (goBuild) {
      // Deep-link straight to Manage Ship → Ship tab, where the build lives.
      window.dispatchEvent(new CustomEvent('expedition:open-loadout', { detail: { tab: 'ship' } }))
    }
  }

  // The Story Campaign hub modal fires 'expedition:open-node' with a
  // nodeId so the player can jump from the prep modal straight into
  // the current node's detail sheet — no map detour. Mirrors the
  // map's own tap gating: combat node + ship sunk routes to the
  // repair prompt instead of opening the sheet.
  useEffect(() => {
    function onOpen(e: Event) {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId
      if (!nodeId) return
      const view = views.find(v => v.node.id === nodeId)
      if (!view || view.status === 'locked') return
      if (repairOwed > 0 && isCombatNode(view.node.type)) {
        setRepairPromptOpen(true)
        return
      }
      setSelected(view)
    }
    window.addEventListener('expedition:open-node', onOpen)
    return () => window.removeEventListener('expedition:open-node', onOpen)
  }, [views, repairOwed])

  return (
    <div id="chapter-map" style={{ marginBottom: '1.5rem', scrollMarginTop: 90 }}>
      {(
        <div>
          {/* Journey ↔ Bosses. Journey = the story map (the chapters below).
              Bosses = a farm deck: every boss card with Fight + Challenge one
              tap away, its drops, and your best clear time. */}
          <ViewToggle view={view} onChange={setView} />
          {view === 'bosses' ? (
            <BossesView views={views} raidRecords={raidRecords} ownedRaidItems={ownedRaidItems} ownedShipSkins={ownedShipSkins} ownedSpecialItems={ownedSpecialItems}
            totalFortune={totalFortune} repairOwed={repairOwed} onRepairBlocked={() => setRepairPromptOpen(true)} />
          ) : (() => {
            const groups = new Map<string, { chapter: RaidChapter; views: RaidNodeView[] }>()
            for (const v of views) {
              const c = chapterForNode(v.node.id)
              const bucket = groups.get(c.id) ?? { chapter: c, views: [] }
              bucket.views.push(v)
              groups.set(c.id, bucket)
            }
            // Pre-compute main-cleared status for every chapter so the
            // gate below (chapter N requires chapter N-1's main path)
            // can look it up without rebuilding the bucket math.
            const mainClearedById = new Map<string, boolean>()
            for (const c of RAID_CHAPTERS) {
              const b = groups.get(c.id)
              if (!b) { mainClearedById.set(c.id, false); continue }
              // Skip coming-soon stubs — same rationale as the
              // per-chapter cleared check below.
              const main = b.views.filter(v => !v.node.sideBranch && !v.node.comingSoon)
              mainClearedById.set(c.id, main.length > 0 && main.every(v => v.status === 'cleared'))
            }
            // The "current" chapter is the highest-index VISIBLE one (future
            // chapters are hidden until the prior main path clears, so the last
            // visible chapter is always the frontier the player is in). Mirrors
            // the visibility gate in the map below. Everything before it
            // collapses by default; the current chapter stays open.
            let currentChapterId: string | null = null
            for (let i = 0; i < RAID_CHAPTERS.length; i++) {
              if (i > 0 && !mainClearedById.get(RAID_CHAPTERS[i - 1].id)) break
              const cb = groups.get(RAID_CHAPTERS[i].id)
              if (!cb || cb.views.length === 0) break
              currentChapterId = RAID_CHAPTERS[i].id
            }
            // Iterate in the canonical RAID_CHAPTERS order, not the Map
            // insertion order — guards against a partial dataset showing
            // chapter II before chapter I.
            return RAID_CHAPTERS.map((c, chapterIdx) => {
              // Hard gate: chapter N (N > 0) is completely hidden until
              // chapter N-1's MAIN path is cleared. No header, no map,
              // no fogged-out tease — the player shouldn't see the
              // chapter exists yet. Side branches in the previous
              // chapter don't gate progression (they're optional).
              if (chapterIdx > 0) {
                const prev = RAID_CHAPTERS[chapterIdx - 1]
                if (!mainClearedById.get(prev.id)) return null
              }
              const bucket = groups.get(c.id)
              if (!bucket || bucket.views.length === 0) return null
              const mainViews = bucket.views.filter(v => !v.node.sideBranch)
              const sideViews = bucket.views.filter(v =>  v.node.sideBranch)
              // Main-path beaten? (Chapter "cleared" by story standard.)
              // Coming-soon nodes don't count toward the "did the player
              // do everything" check — they're not done because they
              // can't be done yet.
              const completable = mainViews.filter(v => !v.node.comingSoon)
              const chapterCleared = completable.length > 0 && completable.every(v => v.status === 'cleared')
              // Side branches the player can still go do (challenge raids
              // they've unlocked but haven't run). We count `available`
              // specifically — locked ones aren't "yet to do", they're
              // "yet to unlock", which is a different signal.
              const challengesRemaining = sideViews.filter(v => v.status === 'available').length
              const chapterStarted = bucket.views.some(v => v.status !== 'locked')
              // Collapsible the moment the main path is done. Player
              // can close a chapter even if challenges remain — the
              // header still advertises them, so they're never lost.
              const collapsible = chapterCleared
              // Default: collapse every chapter EXCEPT the current (frontier)
              // one, so the player lands focused on where they are. Earlier
              // cleared chapters fold away (chevron re-opens them).
              const defaultCollapsed = c.id !== currentChapterId
              const toggled = chaptersToggled.has(c.id)
              const collapsed = collapsible && (defaultCollapsed !== toggled) // XOR
              const toggle = () => {
                if (!collapsible) return
                setChaptersToggled(prev => {
                  const next = new Set(prev)
                  if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                  return next
                })
              }
              return (
                <div key={c.id} style={{ marginBottom: '1.1rem' }}>
                  {/* Header. Tap-target the moment the main path is
                      cleared — player can collapse even with optional
                      challenges still open. Otherwise it's just
                      static title chrome. */}
                  <button
                    type="button"
                    onClick={toggle}
                    disabled={!collapsible}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'transparent', border: 0, padding: 0,
                      marginBottom: collapsed ? '0' : '0.65rem',
                      paddingBottom: '0.55rem',
                      borderBottom: '1px solid rgba(196,169,106,0.18)',
                      cursor: collapsible ? 'pointer' : 'default',
                    }}
                    aria-expanded={!collapsed}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.58rem', color: chapterStarted ? MAIN_ACCENT : '#6a6764' }}>
                        {c.coda ? c.title : `Chapter ${c.romanNumeral}`}
                      </span>
                      {chapterCleared && (
                        <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#4ade80' }}>
                          ✓ Cleared
                        </span>
                      )}
                      {/* Surface remaining challenges so the player
                          knows the chapter isn't truly "done done"
                          even though the main path is beaten. */}
                      {chapterCleared && challengesRemaining > 0 && (
                        <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#fbbf24' }}>
                          · {challengesRemaining} challenge{challengesRemaining === 1 ? '' : 's'} available
                        </span>
                      )}
                      {/* Chevron whenever the chapter is collapsible
                          (main path cleared) — works in both directions. */}
                      {collapsible && (
                        <span style={{ marginLeft: 'auto', color: 'rgba(196,169,106,0.65)', fontSize: '0.8rem', lineHeight: 1, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }} aria-hidden>
                          ▾
                        </span>
                      )}
                    </div>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: chapterStarted ? '#f5f2ec' : 'rgba(245,242,236,0.55)', lineHeight: 1.2, marginTop: 2 }}>
                      {c.title}
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.55)', marginTop: 3, lineHeight: 1.4, fontStyle: 'italic' }}>
                      {c.subtitle}
                    </p>
                  </button>
                  <AnimatePresence initial={false}>
                    {!collapsed && (
                      <motion.div
                        key="map"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <JourneyChapter views={bucket.views} onSelect={setSelected} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })
          })()}
        </div>
      )}

      <AnimatePresence>
        {selected && (selected.node.type === 'raid' ? (() => {
          // Boss raid node → the same art-forward fight modal as the Bosses tab
          // (portrait + backdrop + drops + Normal/Challenge). A CHALLENGE opens
          // its parent boss's modal, which carries both modes.
          //
          // Only a challenge, though. This used to hop to the parent for any
          // side branch, which sent the Quartermaster's Ghost to the MUSTER he
          // hangs off: a boss card whose Normal mode was an inspection with no
          // art, no drops and no fight, and whose Challenge mode was the actual
          // raid. He is nobody's harder version, so he opens as himself, and
          // with no toggle at all since nothing branches off him.
          const mainBoss = isChallengeVariant(selected.node.id)
            ? (views.find(v => v.node.id === selected.node.sideBranch!.parentId) ?? selected)
            : selected
          const challenge = views.find(c => c.node.sideBranch?.parentId === mainBoss.node.id) ?? null
          const nextBossId = views.find(v => v.node.type === 'raid' && !v.node.sideBranch && v.status === 'available')?.node.id ?? null
          return (
            <BossFightModal
              key={mainBoss.node.id}
              boss={mainBoss}
              challenge={challenge}
              rec={mainBoss.node.raidId ? raidRecords[mainBoss.node.raidId] ?? null : null}
              challengeRec={challenge?.node.raidId ? raidRecords[challenge.node.raidId] ?? null : null}
              ownedRaidItems={ownedRaidItems}
              ownedShipSkins={ownedShipSkins}
          ownedSpecialItems={ownedSpecialItems}
            totalFortune={totalFortune}
              isNext={mainBoss.node.id === nextBossId}
              repairOwed={repairOwed}
              onEnter={r => router.push(r)}
              onRepairBlocked={() => setRepairPromptOpen(true)}
              onClose={() => setSelected(null)}
              clearedNodeIds={new Set(views.filter(v => v.status === 'cleared').map(v => v.node.id))}
            />
          )
        })() : (
          <NodeDetailSheet
            key={selected.node.id}
            view={selected}
            backdrop={SCENE_BACKDROPS[selected.node.id] ?? sheetChapterBg(selected.node.id, views)}
            doubloons={doubloons}
            spoilFree={spoilFree}
            spoilPaid={spoilPaid}
            navLevel={navLevel}
            ownedRaidItems={ownedRaidItems}
            ownedShipSkins={ownedShipSkins}
          ownedSpecialItems={ownedSpecialItems}
            totalFortune={totalFortune}
            equippedRaidItems={equippedRaidItems}
            shipClasses={shipClasses}
            raidRecords={null}
            pickedEventChoiceId={raidNodeChoices[selected.node.id]}
            allNodeChoices={raidNodeChoices}
            clearedNodeIds={new Set(views.filter(v => v.status === 'cleared').map(v => v.node.id))}
            hasSixthBerth={hasSixthBerth}
            hasArmoryExpansion={hasArmoryExpansion}
            musterParty={musterParty}
            onClose={() => setSelected(null)}
          />
        ))}
      </AnimatePresence>

      {/* Chapter-unlock celebration. Fires once per chapter per
          player; the dismiss handler persists seen-state to the DB
          so the overlay doesn't fire again on future visits / other
          devices. */}
      <AnimatePresence>
        {celebratingChapter && (
          <ChapterUnlockOverlay
            key={celebratingChapter.id}
            chapter={celebratingChapter}
            previousChapter={(() => {
              const idx = RAID_CHAPTERS.findIndex(c => c.id === celebratingChapter.id)
              return idx > 0 ? RAID_CHAPTERS[idx - 1] : null
            })()}
            onDismiss={dismissCelebration}
          />
        )}
      </AnimatePresence>

      {/* Legendary-recruitable reveal — a gate story node just added its
          legendary to the recruit pool. */}
      <AnimatePresence>
        {unlockedLegendary && (
          <LegendaryUnlockOverlay
            key={unlockedLegendary.slug}
            crew={unlockedLegendary}
            onClose={() => setUnlockedLegendary(null)}
          />
        )}
      </AnimatePresence>

      {/* Ultimate-weapon unlock — the Quartermaster's plans are yours. Fires
          once after beating him; CTA deep-links to the build screen. */}
      <AnimatePresence>
        {celebratingUltimate && (
          <UltimateUnlockOverlay onBuild={() => dismissUltimate(true)} onLater={() => dismissUltimate(false)} />
        )}
      </AnimatePresence>

      {/* Repair-blocked prompt. Tapping any combat node while the
          ship is sunk opens this — direct Pay & Repair action lives
          here so players don't have to scroll back to ShipHero. */}
      <AnimatePresence>
        {repairPromptOpen && (
          <RepairBlockedModal
            repairOwed={repairOwed}
            doubloons={doubloons}
            onClose={() => setRepairPromptOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
