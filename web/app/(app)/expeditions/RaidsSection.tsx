'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { isCombatNode, chapterForNode, RAID_CHAPTERS, type RaidChapter, type RaidNodeDrop, type RaidNodeView } from '@/lib/raidMap'
import type { RaidRecords } from './raidMapActions'
import { RARITY_COLOR, GEM_GLYPH, GEM_COLOR } from '@/lib/bossRaids'
import { getRaidItem } from '@/lib/raidItems'
import { getShipSkin } from '@/lib/shipSkins'
import { claimMilestoneNode, markStoryNodeRead, claimQuartermasterChoice, solvePuzzleNode, pickShipClass, markChapterUnlockSeen } from './raidMapActions'
import { repairShip } from '@/app/(app)/raids/actions'
import { SHIP_CLASS_LIST, getShipClass } from '@/lib/shipClasses'
import BeaconChainPuzzle from './BeaconChainPuzzle'

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
  shop:   '/raidshop.jpeg',
  puzzle: '/puzzle.png',
}

/** elapsed_ms → "M:SS" for the Boss Records block. */
function formatRaidMs(ms: number): string {
  if (!ms || ms < 0) return '—'
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Two-column gentle S-curve (% of width, cycled top→bottom). Earlier this
// was a seven-column zig-zag that swung from 27 to 73; combined with the
// per-type tokens it made the route read as sharp and uneven. Two columns
// at 36/64 (and a slight 32/68 nudge every fourth row for rhythm) give a
// calm, readable lean without losing the "sea chart" feel.
const COLS = [36, 64, 32, 68]
const ROW = 84           // vertical pitch between node centres
const TOKEN = 72         // layout/max token diameter (drives spacing + viewBox)
const PAD_TOP = 18
// Bigger than PAD_TOP because the current-node label sits BELOW its
// token (~30-40px tall for one or two lines). On every row except the
// last, that label nests into the inter-row gap (ROW = 84); on the
// LAST row of a chapter it would otherwise overshoot the parchment
// backdrop and poke past the chapter card border. Reserve enough
// bottom padding here that a wrapped label still fits inside the card.
const PAD_BOTTOM = 52

// Uniform node size for every main-chain token — the chain reads as a
// steady rhythm of beats. The boss raid still gets a subtle bump so the
// headline of the run is visually heavier, but the difference is small
// enough that it doesn't break the rhythm. Side-branch challenge nodes
// stay smaller (SIDE_BRANCH_SIZE below) because they're optional detours.
const NODE_SIZE = 56
const BOSS_NODE_SIZE = 62

function nodeSizeFor(type: string): number {
  return type === 'raid' ? BOSS_NODE_SIZE : NODE_SIZE
}

// Side-branch tokens (e.g. challenge-mode raids) are smaller than their
// parent so the parent raid stays the visual focus of its row. Red accent
// signals "harder version of the same fight" — the portrait inside is the
// SAME as the parent's, so a red ring + red pulsing glow does the work of
// telling the player "danger version" without changing the image.
const SIDE_BRANCH_SIZE = 40
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
  // shop: market stall
  if (type === 'shop') return <svg {...common}><path d="M3 9l1.5-5h15L21 9M4 9v10a1 1 0 001 1h14a1 1 0 001-1V9M4 9h16M9 13h6" /></svg>
  // story: open book
  if (type === 'story') return <svg {...common}><path d="M12 6.5C10.5 5 8 4.5 4 5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5V5c-4-.5-6.5 0-8 1.5zM12 6.5V19" /></svg>
  // puzzle: a signal beacon flame (light the chain)
  if (type === 'puzzle') return <svg {...common}><path d="M12 2c1.6 3 5 4.6 5 9a5 5 0 0 1-10 0c0-2 .8-3.2 2-4.2.2 1.2 1 1.9 1.9 2.1C11.8 6.6 11 4.1 12 2z" /></svg>
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
    default:           return type
  }
}

function LockGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function RaidMap({
  views,
  doubloons,
  onSelect,
  onRepairBlocked,
  repairOwed,
}: {
  views: RaidNodeView[]
  doubloons: number
  onSelect: (v: RaidNodeView) => void
  /** Called when the player taps a combat node that's blocked because
   *  the ship is sunk. RaidsSection opens a focused repair prompt
   *  with an inline Pay & Repair button so they don't have to scroll
   *  back to the ShipHero banner to fix it. */
  onRepairBlocked?: () => void
  repairOwed: number
}) {
  // Side-branch layout: nodes flagged sideBranch don't consume a zigzag row
  // — they share their parent's row and sit on the opposite horizontal side.
  // Pre-compute (rowIdx, colPct) per view in one pass so cx/cy lookups stay
  // O(1) in the render. nextRow counts only chain (non-side) nodes.
  const positions = (() => {
    const out: { row: number; col: number; isSide: boolean }[] = []
    const rowOf: Record<string, number> = {}
    let nextRow = 0
    for (const v of views) {
      if (v.node.sideBranch) {
        const parentRow = rowOf[v.node.sideBranch.parentId] ?? 0
        const parentCol = COLS[parentRow % COLS.length]
        // Side-branch sits on the OPPOSITE side of its parent — parent on
        // the left half (col < 50) → branch on the right, and vice versa.
        // Pulled in from the old 88/12 (which made sense with the 27-73
        // zig-zag but flung the branch all the way across the calmer
        // 2-column lean). 70/30 reads as "across the row from the
        // parent" without crossing the whole map; the bowed connector
        // stays short enough to read as a single beat, and the branch
        // sits outboard of the main chain (which runs 32-68) so the
        // route line never collides with it.
        const sideCol = parentCol < 50 ? 70 : 30
        out.push({ row: parentRow, col: sideCol, isSide: true })
      } else {
        out.push({ row: nextRow, col: COLS[nextRow % COLS.length], isSide: false })
        rowOf[v.node.id] = nextRow
        nextRow++
      }
    }
    return { entries: out, totalRows: nextRow }
  })()

  const height = PAD_TOP + TOKEN / 2 + (positions.totalRows - 1) * ROW + TOKEN / 2 + PAD_BOTTOM
  const cx = (i: number) => positions.entries[i].col
  const cy = (i: number) => PAD_TOP + TOKEN / 2 + positions.entries[i].row * ROW

  // Indices that participate in the main chain line (non-side).
  const chainIdx = positions.entries
    .map((p, i) => p.isSide ? -1 : i)
    .filter(i => i >= 0)

  // The "current" node = first non-cleared, non-locked node ON THE MAIN
  // CHAIN. Side-branch challenge raids are optional detours — pulsing one
  // of them as "current" would mislead a player about the main story path.
  const currentIdx = views.findIndex(v => v.status === 'available' && !v.node.sideBranch)

  // Progressive-reveal classification per view. Three states:
  //   revealed — drawn as today (cleared / available / lit-locked)
  //   beacon   — chapter's final main-chain node, shown as a faded
  //              destination silhouette even when still locked
  //   fogged   — locked + beyond the reveal window; the token is not
  //              rendered at all (route line still flows through its
  //              position so the path "goes somewhere uncharted")
  //
  // currentChainPos is the position of the current available node
  // within the main chain. Side branches inherit their parent's
  // chain position so a side branch hanging off a fogged parent is
  // fogged too — but cleared / available branches always reveal so
  // the player never loses sight of what they've done or can do.
  type Visibility = 'revealed' | 'fogged' | 'beacon'
  const chainPosOfView = new Map<number, number>()
  positions.entries.forEach((p, i) => {
    if (!p.isSide) {
      chainPosOfView.set(i, chainIdx.indexOf(i))
    } else {
      const parentId = views[i].node.sideBranch!.parentId
      const parentI = views.findIndex(v => v.node.id === parentId)
      chainPosOfView.set(i, parentI >= 0 ? chainIdx.indexOf(parentI) : 0)
    }
  })
  const currentChainPos = currentIdx >= 0 ? chainIdx.indexOf(currentIdx) : -1
  const lastChainPos = chainIdx.length - 1
  const visibilityFor = (i: number): Visibility => {
    const v = views[i]
    if (v.status === 'cleared' || v.status === 'available') return 'revealed'
    // Locked from here on. If the player has no current node (every
    // available one is cleared or the chapter hasn't seeded yet),
    // fall back to revealing everything — no map to "fog forward".
    if (currentChainPos < 0) return 'revealed'
    const pos = chainPosOfView.get(i) ?? 0
    if (pos <= currentChainPos + REVEAL_AHEAD) return 'revealed'
    // Beacon only applies to the chapter's last MAIN-chain node, not
    // a side branch that happens to sit on the same row.
    if (!positions.entries[i].isSide && pos === lastChainPos) return 'beacon'
    return 'fogged'
  }

  return (
    <div
      style={{
        position: 'relative', width: '100%', height,
        // Parchment / sea-chart backdrop: warm sepia base, a soft cream
        // top-down lift in the centre, and a subtle vignette at the
        // edges so the chart reads as a thing you're holding rather
        // than a panel floating on a black page. Tuned to stay dark
        // enough that the parchment-gold tokens + lit route still
        // pop against it (the dark wrapper sits around this).
        background: [
          'radial-gradient(ellipse 80% 60% at 50% 38%, rgba(196,169,106,0.10) 0%, transparent 70%)',
          'radial-gradient(ellipse 120% 90% at 50% 50%, transparent 55%, rgba(6,5,4,0.45) 100%)',
          'linear-gradient(180deg, rgba(48,36,18,0.35) 0%, rgba(28,20,10,0.55) 100%)',
        ].join(', '),
        border: '1px solid rgba(196,169,106,0.22)',
        borderRadius: 12,
        padding: '8px 0',
        // Inset shadow gives the parchment a faintly weathered depth at
        // the corners without darkening the chart's reading area.
        boxShadow: 'inset 0 0 24px rgba(0,0,0,0.45)',
      }}
    >
      {/* Route lines behind the tokens. preserveAspectRatio=none lets x map
          to the fluid width while y stays 1:1; non-scaling-stroke keeps the
          line weight constant regardless of the horizontal stretch. */}
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height, pointerEvents: 'none' }}
      >
        {/* Main chain line — connects consecutive non-side nodes in row
            order, skipping side branches so the route stays straight.
            Lit (cleared → cleared) gets a parchment-gold stroke with a
            soft drop-shadow glow so the cleared portion of the route
            feels lit up; pending uses a sparser rope-like dash so
            "path ahead" reads as un-traveled, not just under-emphasized. */}
        {chainIdx.slice(0, -1).map((idxA, j) => {
          const idxB = chainIdx[j + 1]
          const v = views[idxA]
          const x1 = cx(idxA), y1 = cy(idxA), x2 = cx(idxB), y2 = cy(idxB)
          const ym = (y1 + y2) / 2
          const lit = v.status === 'cleared'
          return (
            <path
              key={`chain-${v.node.id}`}
              d={`M ${x1} ${y1} C ${x1} ${ym}, ${x2} ${ym}, ${x2} ${y2}`}
              fill="none"
              stroke={lit ? 'rgba(196,169,106,0.9)' : 'rgba(255,255,255,0.14)'}
              strokeWidth={lit ? 3 : 2}
              strokeDasharray={lit ? undefined : '1 7'}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter={lit ? 'drop-shadow(0 0 3px rgba(196,169,106,0.55))' : undefined}
            />
          )
        })}
        {/* Side-branch connectors — short horizontal-ish lines from each
            side-branch token back to its parent on the same row. Drawn
            below the main chain so the chain stays the dominant read.
            A connector to a fogged-out branch would dangle into nothing,
            so we skip the line in that case too. */}
        {positions.entries.map((p, i) => {
          if (!p.isSide) return null
          if (visibilityFor(i) === 'fogged') return null
          const parentId = views[i].node.sideBranch!.parentId
          const parentIdx = views.findIndex(v => v.node.id === parentId)
          if (parentIdx < 0) return null
          const x1 = cx(parentIdx), y1 = cy(parentIdx)
          const x2 = cx(i), y2 = cy(i)
          // Slight vertical bow so the line reads as a branch, not a straight
          // tick. Uses violet to match the challenge theme.
          const bow = 8
          const branchClear = views[i].status === 'cleared'
          return (
            <path
              key={`branch-${views[i].node.id}`}
              d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - bow}, ${x2} ${y2}`}
              fill="none"
              // Red branch matches the challenge token treatment so the
              // connector reads as part of the same "danger version" sign.
              stroke={branchClear ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.45)'}
              strokeWidth={2}
              strokeDasharray={branchClear ? undefined : '3 4'}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>

      {views.map((v, i) => {
        const vis = visibilityFor(i)
        // Fogged: don't render the token at all. The route line still
        // passes through this position, so the chapter reads as
        // "the path goes that way — into uncharted water".
        if (vis === 'fogged') return null
        const { node, status } = v
        const isSide = !!node.sideBranch
        // Beacon: chapter-end destination silhouette. Stays non-
        // interactive (it's locked) and is rendered with a heavier
        // dim so it reads as a distant landmark, not a "next up"
        // node. A small "Chapter end" caption pins it as the goal.
        const isBeacon = vis === 'beacon'
        // Single parchment-gold accent for every main-chain node — type is
        // communicated by the glyph + portrait, not by color. Side branches
        // still use the crimson challenge accent.
        const accent = isSide ? SIDE_BRANCH_ACCENT : MAIN_ACCENT
        const img = node.image ?? TYPE_IMAGE[node.type]
        const size = isSide ? SIDE_BRANCH_SIZE : nodeSizeFor(node.type)
        const glyph = Math.round(size * 0.42)
        const badge = Math.max(15, Math.round(size * 0.34))
        const locked = status === 'locked'
        const cleared = status === 'cleared'
        // Ship sunk: no entering any combat node until it's repaired.
        const raidBlocked = repairOwed > 0 && isCombatNode(node.type)
        const interactive = !locked && !raidBlocked
        const isCurrent = i === currentIdx
        // Labels live UNDER the token now (was beside) — map-pin style.
        // Only the current available main-chain node ("you are here / next
        // up") shows its label. The glyph + portrait carries every other
        // node's identity; tapping any non-locked node opens the modal
        // for the full name + story.
        const showLabel = isCurrent && interactive
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: `${cx(i)}%`,
              top: cy(i),
              transform: 'translate(-50%, -50%)',
            }}
          >
            <motion.button
              onClick={() => {
                if (interactive) {
                  onSelect(v)
                  return
                }
                // Specifically: combat node + ship sunk. Open the repair
                // prompt instead of swallowing the tap silently — players
                // were tapping their current node, nothing happening, and
                // missing the ShipHero banner above. Locked nodes still
                // no-op (they're not actionable in any way).
                if (raidBlocked && onRepairBlocked) onRepairBlocked()
              }}
              whileTap={(interactive || raidBlocked) ? { scale: 0.9 } : undefined}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              aria-label={node.label}
              aria-disabled={!interactive && !raidBlocked || undefined}
              disabled={!interactive && !raidBlocked}
              className={isCurrent && interactive ? 'raid-node-current' : undefined}
              style={{
                width: size,
                height: size,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: interactive || raidBlocked ? 'pointer' : 'default',
                background: locked
                  ? 'radial-gradient(circle at 35% 30%, #14110d, #0a0907)'
                  : cleared
                    ? `radial-gradient(circle at 35% 30%, ${accent}22, ${accent}0a)`
                    : `radial-gradient(circle at 35% 30%, ${accent}26, #0c0a08)`,
                border: `2px solid ${locked ? 'rgba(255,255,255,0.08)' : cleared ? `${accent}66` : accent}`,
                boxShadow: locked
                  ? 'none'
                  : cleared
                    ? `0 0 0 3px ${accent}08`
                    : `0 0 14px ${accent}40, 0 0 0 4px ${accent}12`,
                // Cleared nodes fade so the available "next up" node clearly
                // owns the route. Locked / repair-blocked stay at the old
                // 0.6; cleared sits a notch above that (0.62) so it still
                // reads as history-you-can-tap, not pure dead state.
                // Beacon (chapter-end destination) pulls further back to
                // ~0.32 so it reads as "distant" against the lit current
                // node — but still legible as a landmark.
                opacity: isBeacon ? 0.32 : locked || raidBlocked ? 0.6 : cleared ? 0.62 : 1,
                // The pulse animation drives box-shadow; let it own the prop.
                ...(isCurrent && interactive ? { boxShadow: undefined } : {}),
                touchAction: 'manipulation',
              }}
            >
              {img ? (
                <span style={{
                  position: 'absolute', inset: 3, borderRadius: '50%', overflow: 'hidden',
                  // Filter stack tells the player what state the node is in:
                  //   locked   → desaturated + dimmed ("walled off")
                  //   cleared  → softly desaturated + dimmed ("history")
                  //   side branch (challenge) → noir-red wash + harder
                  //     shadows + bumped saturation + small warm hue
                  //     rotate. Same boss portrait, darker timeline. The
                  //     red ring + red drop-shadow halo on the token
                  //     already signal "danger version"; the filter
                  //     carries that into the image itself.
                  //   default → full color.
                  filter:
                    locked  ? 'grayscale(1) brightness(0.5)'
                    : cleared ? 'grayscale(0.55) brightness(0.78)'
                    : isSide  ? 'brightness(0.76) contrast(1.22) saturate(1.5) hue-rotate(-12deg)'
                    : undefined,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
              ) : locked ? <LockGlyph size={glyph} /> : <NodeGlyph type={node.type} color={accent} size={glyph} />}

              {locked && img && (
                <span
                  style={{
                    position: 'absolute', right: -3, bottom: -3,
                    width: badge, height: badge, borderRadius: '50%',
                    background: '#1a1814', border: '2px solid #0a0907',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <LockGlyph size={Math.round(badge * 0.52)} />
                </span>
              )}

              {cleared && (() => {
                // Cleared check is smaller than the lock badge — cleared
                // is the calm "done" state and shouldn't compete with
                // the available node for attention.
                const checkBadge = Math.max(13, Math.round(size * 0.26))
                return (
                  <span
                    style={{
                      position: 'absolute', right: -2, bottom: -2,
                      width: checkBadge, height: checkBadge, borderRadius: '50%',
                      background: '#1b3a24', border: '1.5px solid #0a0907',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width={Math.round(checkBadge * 0.6)} height={Math.round(checkBadge * 0.6)} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                )
              })()}
            </motion.button>

            {/* Title BELOW the token — map-pin caption. Surfaces only on
                the current available main-chain node ("you are here / next
                up"); every other node is icon-only and opens the detail
                modal on tap. The chip backing hugs the text on each line
                (box-decoration-break: clone) so wrapped labels read as
                one caption, not as loose floating boxes. */}
            {showLabel && !isSide && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: 8,
                  width: 'max-content',
                  maxWidth: 140,
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', lineHeight: 1.5, color: '#f5f2ec', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                  <span style={{ background: 'rgba(6,5,4,0.55)', borderRadius: 6, padding: '1px 7px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>
                    {node.label}
                  </span>
                </p>
              </div>
            )}

            {/* Beacon caption: "Chapter end" pinned under the destination
                silhouette so the player reads it as the goal rather than
                wondering why one locked node is showing while others nearby
                aren't. Tiny + muted; reads as a horizon marker. */}
            {isBeacon && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: '50%',
                  transform: 'translateX(-50%)', marginTop: 8,
                  width: 'max-content', textAlign: 'center', pointerEvents: 'none',
                }}
              >
                <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: 'rgba(196,169,106,0.7)', textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
                  Chapter end
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── Detail sheet ───────────────────────── */

function NodeDetailSheet({
  view,
  doubloons,
  ownedRaidItems,
  shipClasses,
  raidRecords,
  onClose,
}: {
  view: RaidNodeView
  doubloons: number
  ownedRaidItems: string[]
  shipClasses: Record<string, string>
  raidRecords: RaidRecords | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false) // puzzle solved → show the destination
  // Tap a unique-drop chip to inspect it (image, full description,
  // effect breakdown for raid items, drop chance). Cleared by tapping
  // outside the popup or its close button.
  const [selectedDrop, setSelectedDrop] = useState<RaidNodeDrop | null>(null)
  const { node, status, claimable, lockReason } = view
  // Single accent now: matches the unified map palette.
  const accent = MAIN_ACCENT
  const img = node.image ?? TYPE_IMAGE[node.type]
  const locked = status === 'locked'
  const cleared = status === 'cleared'
  const detail = node.detail

  const dropsTitle = isCombatNode(node.type)
    ? 'Possible Loot'
    : node.type === 'shop' ? 'Planned Stock'
    : node.type === 'story' ? 'What You Uncover'
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
      const res = await markStoryNodeRead(node.id)
      if ('error' in res) { setErr(res.error); return }
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
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}>{node.milestone?.spend ? 'Passage Bought ✓' : 'Backing Secured ✓'}</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
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
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Logged ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    } else {
      cta = (
        <button
          onClick={readStory}
          disabled={pending}
          className="font-cinzel font-700 uppercase tracking-[0.06em]"
          style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '1rem', background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, cursor: pending ? 'wait' : 'pointer' }}
        >
          {pending ? '…' : (detail.ctaLabel ?? 'Continue the Story →')}
        </button>
      )
    }
  } else if (node.type === 'puzzle') {
    // available → the puzzle itself is rendered in the body (auto-solves);
    // cleared/locked just show a status banner here.
    if (cleared) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: `${accent}1a`, border: `1px solid ${accent}40`, color: accent }}>Beacons Lit ✓</div>
    } else if (locked) {
      cta = <div className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ width: '100%', padding: '0.85rem', borderRadius: 12, textAlign: 'center', fontSize: '1.02rem', background: 'rgba(255,255,255,0.06)', color: '#5a5856' }}>Locked</div>
    }
  }

  const sheet = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
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
          background: 'linear-gradient(180deg, #14110d 0%, #0a0807 100%)',
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
                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: locked ? 'grayscale(1) brightness(0.6)' : undefined }} />
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
            onClick={onClose}
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

        {/* Description */}
        <p className="font-karla" style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(240,237,232,0.72)', whiteSpace: 'pre-line' }}>
          {detail.description}
        </p>

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

        {/* Puzzle: the beacon-chain (Lights Out), live when available */}
        {node.type === 'puzzle' && node.puzzle && status === 'available' && !revealed && (
          <div style={{ marginTop: '1.1rem' }}>
            <BeaconChainPuzzle puzzle={node.puzzle} onSolved={solvePuzzle} />
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
              The Network Reads True
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {node.choice.items.map(itemId => {
                const item = getRaidItem(itemId)
                if (!item) return null
                const owned = ownedRaidItems.includes(itemId)
                const rc = RARITY_COLOR[item.rarity] ?? '#9ca3af'
                const dimmed = cleared && !owned
                return (
                  <div key={itemId} style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    background: cleared && owned ? `${rc}1f` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${cleared && owned ? `${rc}80` : `${rc}26`}`,
                    borderRadius: 10, padding: '0.7rem 0.75rem',
                    opacity: dimmed ? 0.45 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${rc}1a`, fontSize: '1rem', overflow: 'hidden' }}>
                        {item.image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span>{item.emoji}</span>}
                      </div>
                      <span className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#f0ede8' }}>{item.name}</span>
                      {cleared && owned && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}40`, borderRadius: 5, padding: '0.2rem 0.45rem', flexShrink: 0 }}>Chosen ✓</span>
                      )}
                      {cleared && !owned && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#6a6764', flexShrink: 0 }}>Gone</span>
                      )}
                    </div>
                    <span className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.45 }}>{item.description}</span>
                    {!cleared && (
                      <button
                        onClick={() => chooseItem(itemId)}
                        disabled={pending || locked}
                        className="font-cinzel font-700 uppercase tracking-[0.06em]"
                        style={{
                          marginTop: 2, padding: '0.6rem', borderRadius: 9,
                          fontSize: '0.82rem',
                          background: locked ? 'rgba(255,255,255,0.06)' : `${rc}26`,
                          border: `1px solid ${locked ? 'rgba(255,255,255,0.1)' : `${rc}66`}`,
                          color: locked ? '#5a5856' : rc,
                          cursor: pending ? 'wait' : locked ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {pending ? '…' : locked ? 'Locked' : `Choose ${item.name}`}
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
        )}

        {/* Chapter-end class picker. Renders a 4-card grid of ship
            classes from SHIP_CLASS_LIST. If a class is already picked
            for this chapter, that card highlights and the others dim
            (lock is permanent). Otherwise every card is a tap target;
            the chosen class goes to the server via pickShipClass. */}
        {node.classPick && (() => {
          const chosenId = shipClasses[node.classPick.chapterId]
          const chosen = chosenId ? getShipClass(chosenId) : undefined
          return (
            <div style={{ marginTop: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.68rem', color: '#7a7875', marginBottom: '0.65rem' }}>
                {chosen ? 'You Chose' : 'Pick a Class'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SHIP_CLASS_LIST.map(cls => {
                  const isChosen = chosen?.id === cls.id
                  const dimmed = !!chosen && !isChosen
                  return (
                    <div key={cls.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.85rem',
                      background: isChosen ? `${cls.color}1f` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isChosen ? `${cls.color}80` : `${cls.color}26`}`,
                      borderRadius: 12, padding: '0.85rem 0.95rem',
                      opacity: dimmed ? 0.4 : 1,
                    }}>
                      {/* Class icon — plain unicode glyph (same style as
                          Helmsman's lozenge) inside a tinted circle. */}
                      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${cls.color}1a`, border: `1px solid ${cls.color}40`, fontSize: '1.5rem', color: cls.color, lineHeight: 1 }}>
                        {cls.emoji}
                      </div>
                      {/* Name + tagline + bullets stack. Bigger fonts so
                          the picker is easier to read at a glance. */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.15 }}>{cls.name}</p>
                        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.62)', lineHeight: 1.35, fontStyle: 'italic' }}>{cls.tagline}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                          {cls.bullets.map((b, i) => (
                            <span key={i} className="font-karla font-700 uppercase tracking-[0.05em]" style={{
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
                      {/* Right-side action: circle "Choose" button while
                          picking, or a checkmark badge on the chosen card.
                          Replaces the old full-width CTA below the card. */}
                      {isChosen ? (
                        <div style={{
                          width: 52, height: 52, flexShrink: 0, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${cls.color}1c`, border: `2px solid ${cls.color}`,
                        }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={cls.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        </div>
                      ) : !chosen ? (
                        <button
                          onClick={() => chooseClass(cls.id)}
                          disabled={pending || locked}
                          aria-label={`Pick ${cls.name}`}
                          className="font-cinzel font-700 uppercase tracking-[0.04em]"
                          style={{
                            width: 52, height: 52, flexShrink: 0, borderRadius: '50%',
                            background: locked ? 'rgba(255,255,255,0.04)' : `${cls.color}26`,
                            border: `2px solid ${locked ? 'rgba(255,255,255,0.1)' : `${cls.color}99`}`,
                            color: locked ? '#5a5856' : cls.color,
                            fontSize: '0.6rem',
                            cursor: pending ? 'wait' : locked ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0, touchAction: 'manipulation',
                          }}
                        >
                          {pending ? '…' : locked ? '🔒' : 'Choose'}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
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
        {node.type === 'raid' && raidRecords && (raidRecords.fastestMs > 0 || raidRecords.yourBestMs != null) && (
          <div style={{ marginTop: '1.1rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>Boss Records</p>
            <div style={{
              padding: '0.65rem 0.85rem', borderRadius: 10,
              background: 'rgba(200,168,64,0.05)',
              border: '1px solid rgba(200,168,64,0.2)',
              display: 'flex', flexDirection: 'column', gap: '0.4rem',
            }}>
              {raidRecords.fastestMs > 0 && (
                <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                  <div className="flex items-baseline" style={{ gap: 8, minWidth: 0 }}>
                    <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#c8a840' }}>Fastest</span>
                    <span className="font-karla font-600 truncate" style={{ fontSize: '0.78rem', color: '#e6d49a', minWidth: 0 }}>{raidRecords.fastestUsername}</span>
                  </div>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0c040', textShadow: '0 0 10px rgba(240,192,64,0.35)', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                    {formatRaidMs(raidRecords.fastestMs)}
                  </span>
                </div>
              )}
              {raidRecords.yourBestMs != null && (
                <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
                  <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#7da0d8' }}>Your best</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#cbd6e6', fontFeatureSettings: '"tnum"' }}>
                    {formatRaidMs(raidRecords.yourBestMs)}
                  </span>
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {uniques.map(d => {
                          const rc = d.rarity ? RARITY_COLOR[d.rarity] : '#9ca3af'
                          return (
                            <button
                              type="button"
                              key={d.label}
                              onClick={() => setSelectedDrop(d)}
                              aria-label={`${d.label} — details`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
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
                                    ? <img src={d.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: d.imageFilter }} />
                                    : <span>{d.emoji}</span>}
                              </span>
                              <span className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#e8e2d8', whiteSpace: 'nowrap' }}>{d.label}</span>
                              {d.chance && (
                                <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: rc, background: `${rc}1c`, border: `1px solid ${rc}40`, borderRadius: 5, padding: '0.18rem 0.4rem', flexShrink: 0 }}>
                                  {d.chance}
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
                    <div key={d.label} style={{
                      gridColumn: full ? '1 / -1' : undefined,
                      display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0,
                      background: 'rgba(255,255,255,0.03)', border: `1px solid ${rc}26`,
                      borderRadius: 9, padding: '0.4rem 0.5rem',
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
                            ? <img src={d.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: d.imageFilter }} />
                            : <span className={d.emoji === GEM_GLYPH ? 'font-cinzel' : undefined} style={d.emoji === GEM_GLYPH ? { color: GEM_COLOR } : undefined}>{d.emoji}</span>}
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
                    </div>
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

        {cta && <div style={{ marginTop: '1.3rem' }}>{cta}</div>}
      </motion.div>
    </motion.div>
  )

  // Drop detail popup — layers ABOVE the sheet (sheet is z-1000) so
  // tapping a unique-drop chip inside the sheet opens this card without
  // closing the sheet itself. Both portal to <body> so they escape any
  // ancestor stacking context.
  const dropModal = selectedDrop ? <DropDetailModal drop={selectedDrop} onClose={() => setSelectedDrop(null)} /> : null

  return typeof document !== 'undefined'
    ? createPortal(<>{sheet}{dropModal}</>, document.body)
    : null
}

/* ─────────────────────── Drop detail modal ──────────────────── */
// Tap a unique-drop chip on a node sheet → this card opens. Pulls full
// info from getRaidItem / getShipSkin so it shows effects + flavor in
// addition to whatever the drop chip already had. Sits ABOVE the node
// detail sheet (z-2000 vs sheet's z-1000); tapping the backdrop or the
// X closes it without closing the underlying sheet.
function DropDetailModal({ drop, onClose }: { drop: RaidNodeDrop; onClose: () => void }) {
  const rarityColor = drop.rarity ? RARITY_COLOR[drop.rarity] : '#9ca3af'
  const raidItem    = drop.raidItemId ? getRaidItem(drop.raidItemId)   : undefined
  const shipSkin    = drop.shipSkinId ? getShipSkin(drop.shipSkinId)   : undefined
  // What kind of drop is this — drives the "type" label + body copy.
  const dropKind = raidItem ? 'Raid Item' : shipSkin ? 'Ship Skin' : 'Drop'
  // Description: prefer the raid item's full description; fall back to
  // the drop's sublabel (already preformatted by lootDrops).
  const description = raidItem?.description
    ?? (drop.sublabel ?? '').replace(/^Raid item\.\s*|^Ship skin\.\s*/, '')

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
                ? <img src={drop.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: drop.imageFilter, padding: 4 }} />
                : <span style={{ fontSize: '2rem' }}>{drop.emoji}</span>}
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

        {/* Description */}
        {description && (
          <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.78)', lineHeight: 1.55, marginBottom: 14 }}>
            {description}
          </p>
        )}

        {/* Source line for raid items (tells you where it drops) */}
        {raidItem?.source && (
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#7a8090', marginBottom: 14 }}>
            Source: <span style={{ color: '#9aa6b8' }}>{raidItem.source}</span>
          </p>
        )}

        {/* Drop chance pill */}
        {drop.chance && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.65rem', color: rarityColor,
                background: `${rarityColor}1c`, border: `1px solid ${rarityColor}50`,
                borderRadius: 999, padding: '0.32rem 0.85rem',
              }}>
              {drop.chance} drop chance
            </span>
          </div>
        )}
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
            ✓ Chapter {previousChapter.romanNumeral} Complete
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

export default function RaidsSection({ views, doubloons, raidRecords, repairOwed, ownedRaidItems, shipClasses, seenChapterUnlocks }: { views: RaidNodeView[]; doubloons: number; raidRecords: Record<string, RaidRecords>; repairOwed: number; ownedRaidItems: string[]; shipClasses: Record<string, string>; seenChapterUnlocks: string[] }) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<RaidNodeView | null>(null)
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
      const prevMain = prevBucket.filter(v => !v.node.sideBranch)
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

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          marginBottom: open ? '0.7rem' : 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem' }}>
          <span className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4a96a', letterSpacing: '0.04em' }}>Raids</span>
          <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764' }}>{clearedCount}/{views.length} cleared</span>
        </span>
        <span style={{ color: '#6a6764', fontSize: '0.9rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.82) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16,
          padding: '0.9rem 0.75rem',
        }}>
          {/* Next-up objective — surfaces the first non-cleared node at the
              top of the card so the player sees what to do without hunting the
              map. Three states: available (tap → detail sheet), locked (dimmed
              + unlock reason), or all-cleared (a short note). Respects the same
              repair block as the map so it can't bypass a sunk ship. */}
          {(() => {
            // Surface only main-chain progress here. Side-branch (challenge)
            // raids are OPTIONAL detours, not "what to do next" — including
            // them would derail a player who's mid-story toward the boss.
            const next = views.find(v => v.status !== 'cleared' && !v.node.sideBranch)

            // Everything cleared — celebratory note so the card isn't empty.
            if (!next) {
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'linear-gradient(135deg, rgba(74,222,128,0.12) 0%, rgba(8,7,6,0.35) 72%)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: 13, padding: '0.75rem 0.85rem', margin: '0.2rem 0 0.7rem',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(74,222,128,0.14)', border: '1px solid rgba(74,222,128,0.3)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#d6f5e0', lineHeight: 1.15 }}>All raids cleared</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.55)', marginTop: 2 }}>New waters are coming. Keep your hold heavy.</p>
                  </div>
                </div>
              )
            }

            // Same unified accent used on the map below.
            const accent = MAIN_ACCENT
            const img = next.node.image ?? TYPE_IMAGE[next.node.type]
            const isLocked = next.status === 'locked'
            const blocked = !isLocked && repairOwed > 0 && isCombatNode(next.node.type)
            const interactive = !isLocked && !blocked
            return (
              <button
                onClick={() => { if (interactive) setSelected(next) }}
                disabled={!interactive}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  textAlign: 'left', width: '100%',
                  cursor: interactive ? 'pointer' : 'default',
                  background: isLocked
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(8,7,6,0.35) 72%)'
                    : `linear-gradient(135deg, ${accent}24 0%, rgba(8,7,6,0.35) 72%)`,
                  border: `1px solid ${isLocked ? 'rgba(255,255,255,0.12)' : `${accent}45`}`,
                  borderRadius: 13,
                  padding: '0.7rem 0.8rem',
                  margin: '0.2rem 0 0.7rem',
                  opacity: isLocked ? 0.85 : blocked ? 0.7 : 1,
                }}
              >
                <div style={{ width: 50, height: 50, borderRadius: 11, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isLocked ? 'rgba(255,255,255,0.05)' : `${accent}1a`, border: `1px solid ${isLocked ? 'rgba(255,255,255,0.12)' : `${accent}4a`}` }}>
                  {img
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isLocked ? 'grayscale(1) brightness(0.55)' : undefined }} />
                    : isLocked ? <LockGlyph size={22} /> : <NodeGlyph type={next.node.type} color={accent} size={24} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: isLocked ? '#8a8680' : accent }}>{isLocked ? 'Up next' : 'Next up'}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: isLocked ? 'rgba(245,242,236,0.7)' : '#f5f2ec', lineHeight: 1.15, margin: '2px 0 3px' }}>{next.node.label}</p>
                  <p className="font-karla" style={{ fontSize: '0.66rem', lineHeight: 1.35, color: blocked ? '#f0a36a' : isLocked ? '#9a9690' : 'rgba(240,237,232,0.6)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {isLocked ? (next.lockReason ?? 'Locked') : blocked ? 'Repair your ship before you can set sail.' : next.node.flavor}
                  </p>
                </div>
                {isLocked ? (
                  <div style={{ flexShrink: 0 }}><LockGlyph size={16} /></div>
                ) : !blocked ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
                ) : null}
              </button>
            )
          })()}

          {/* Chapters render as separate, titled sections instead of one
              continuous scroll. Each chapter is bound by RAID_CHAPTERS;
              the views are partitioned in declaration order so a new
              raid arc is just an RAID_MAP append + an RAID_CHAPTERS
              boundary update. Cleared status is shown next to the
              header so the player can see at a glance which chapters
              they've finished. */}
          {(() => {
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
              const main = b.views.filter(v => !v.node.sideBranch)
              mainClearedById.set(c.id, main.length > 0 && main.every(v => v.status === 'cleared'))
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
              const chapterCleared = mainViews.length > 0 && mainViews.every(v => v.status === 'cleared')
              // Side branches the player can still go do (challenge raids
              // they've unlocked but haven't run). We count `available`
              // specifically — locked ones aren't "yet to do", they're
              // "yet to unlock", which is a different signal.
              const challengesRemaining = sideViews.filter(v => v.status === 'available').length
              // Fully cleared = main + every side branch the player has
              // access to. Drives the DEFAULT collapsed state: fully
              // cleared → collapsed; main cleared but a challenge raid
              // is still hanging → expanded (so the player sees the
              // node sitting there). Either default can be flipped by
              // the player via the chevron.
              const fullyCleared = chapterCleared && challengesRemaining === 0
              const chapterStarted = bucket.views.some(v => v.status !== 'locked')
              // Collapsible the moment the main path is done. Player
              // can close a chapter even if challenges remain — the
              // header still advertises them, so they're never lost.
              const collapsible = chapterCleared
              const defaultCollapsed = fullyCleared
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
                        Chapter {c.romanNumeral}
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
                        <RaidMap views={bucket.views} doubloons={doubloons} onSelect={setSelected} onRepairBlocked={() => setRepairPromptOpen(true)} repairOwed={repairOwed} />
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
        {selected && (
          <NodeDetailSheet
            key={selected.node.id}
            view={selected}
            doubloons={doubloons}
            ownedRaidItems={ownedRaidItems}
            shipClasses={shipClasses}
            raidRecords={selected.node.type === 'raid' && selected.node.raidId ? raidRecords[selected.node.raidId] ?? null : null}
            onClose={() => setSelected(null)}
          />
        )}
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
