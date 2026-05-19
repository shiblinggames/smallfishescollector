// Persistent raid progression map. A Super-Mario-style path of nodes shown
// (Slay-the-Spire-ish visually) inside the collapsible Raids section.
//
// Combat nodes route into the existing /raids screens; a node is "cleared"
// when beaten at least once (derived from existing data, no raid-engine
// changes). One-time nodes (milestone / shop) persist in
// profiles.raid_node_progress jsonb: { cleared: string[] }.
//
// Adding new raids/skirmishes/stops = appending to RAID_MAP. The chain is
// gated by `requiresNode` (+ optional Nav level); a cleared combat node
// stays farmable.

import { CORSAIRS_RECKONING, type RaidLootItem } from '@/lib/bossRaids'
import { getShipSkin } from '@/lib/shipSkins'
import { getRaidItem } from '@/lib/raidItems'

// Each type gets its own colour + glyph on the map:
//  - skirmish  : a single practice battle
//  - raid      : a full multi-encounter campaign / boss
//  - milestone : a "collect / hold X" goal (no fight)
//  - shop      : a contraband stall (future)
//  - story     : an overarching-story beat (future)
export type RaidNodeType = 'skirmish' | 'raid' | 'milestone' | 'shop' | 'story'

/** Routes into a combat screen + derives its clear from battle data. */
export function isCombatNode(t: RaidNodeType): boolean {
  return t === 'skirmish' || t === 'raid'
}

/** One row in a node's "possible drops" panel. */
export interface RaidNodeDrop {
  label: string
  emoji: string
  image?: string | null
  rarity?: RaidLootItem['rarity']
  /** Human-readable odds, e.g. "49%", "Guaranteed", "Every kill". */
  chance?: string
  /** Short, noob-friendly line under the label (what the thing is). */
  sublabel?: string
  /** Solid swatch colour shown instead of an icon (ship skins). */
  swatch?: string
  /** CSS filter applied to the swatch (the skin's actual effect). */
  swatchFilter?: string
}

/** Extra content shown when the player taps a node open. */
export interface RaidNodeDetail {
  /** Longer blurb for the detail sheet (falls back to `flavor`). */
  description: string
  /** Foes you'll face, in order (combat nodes). */
  enemies?: string[]
  /** Possible loot / rewards. */
  drops?: RaidNodeDrop[]
  /** Footnote under the drops list. */
  dropsNote?: string
  /** Override the primary button verb (story nodes). */
  ctaLabel?: string
}

export interface RaidNode {
  id: string
  type: RaidNodeType
  label: string
  /** Pirate-flavored blurb shown on the node. */
  flavor: string
  /** One-line narrative recap shown on the route AFTER this node, i.e.
   *  what beating it set in motion toward the next one. Omit on the
   *  last node. */
  bridge?: string
  /** Node id that must be cleared before this one unlocks (omit = start). */
  requiresNode?: string
  /** Optional extra gate: minimum Navigation level. */
  requiresNavLevel?: number
  /** combat: route to the existing combat screen. */
  route?: string
  /** Portrait shown in the map token + sheet header (e.g. the enemy you
   *  face). Falls back to the type glyph when unset. */
  image?: string
  /** milestone: reach (not spend) `amount` doubloons to clear; optional
   *  one-time reward on claim. */
  milestone?: { amount: number; rewardDoubloons?: number }
  /** Rich detail surfaced in the tap-to-open sheet. */
  detail: RaidNodeDetail
}

/** Derive a drop list (with rolled-once odds) from a boss raid's loot
 *  table so the node sheet and the live crate never drift apart. */
function lootDrops(loot: RaidLootItem[]): RaidNodeDrop[] {
  const total = loot.reduce((s, l) => s + l.weight, 0)
  return loot.map(l => {
    const drop: RaidNodeDrop = {
      label: l.label,
      emoji: l.emoji,
      image: l.image,
      rarity: l.rarity,
      chance: `${Math.round((l.weight / total) * 100)}%`,
    }
    // Ship skin → show its effect swatch + say it's a cosmetic.
    if (l.shipSkinId) {
      const skin = getShipSkin(l.shipSkinId)
      if (skin) {
        drop.label = skin.name
        drop.sublabel = 'Ship skin. A cosmetic new look for your ship.'
        drop.swatch = skin.color
        drop.swatchFilter = skin.filter
        drop.image = null
      }
    }
    // Raid item → surface its plain-English effect.
    const item = getRaidItem(l.id)
    if (item) drop.sublabel = `Raid item. ${item.description}`
    return drop
  })
}

export const RAID_MAP: RaidNode[] = [
  {
    id: 'intro',
    type: 'story',
    label: 'A Loose Thread',
    flavor: "Barnacle Pete robs everyone blind and somehow stays dead broke. Funny, that.",
    bridge: "Every answer points at one reef, where Pete's little fish do his fetching.",
    detail: {
      description:
        "Pete has been raiding these reefs for thirty years and he's still flat broke. For a man who steals everything that isn't nailed down, that's a neat trick. The loot goes somewhere. It just never seems to end up in Pete's pockets.\n\nNobody can be bothered to ask why. You, clearly, have nothing better to do. Go give the loudest pirate on the water a good shake and see what rattles loose.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment I",
          sublabel: '"He never keeps what he nicks." Three sailors said it. None of them had met.',
          rarity: 'common',
        },
      ],
      dropsNote: 'Pages pile up here as you go poking. Sooner or later they spell a name.',
      ctaLabel: 'Pull the Thread →',
    },
  },
  {
    id: 'skirmish',
    type: 'skirmish',
    label: 'Reef Skirmish',
    flavor: "Pete doesn't sail alone. The reef crawls with his Reef Raiders. Start thinning them out.",
    bridge: "Thin his Raiders and you thin his nerve. Sink enough and the old corsair sails out himself.",
    requiresNode: 'intro',
    route: '/raids/practice',
    image: CORSAIRS_RECKONING.enemies.brute.portrait,
    detail: {
      description:
        "Pete doesn't do his own dirty work. That's what the Reef Raiders are for. Sink one and there's usually another bobbing up to take its place.\n\nNo grand plan here. Pick them off one at a time and see who comes asking once enough of them stop coming home.",
      enemies: ['Reef Raider'],
      drops: [
        { label: 'Navigation XP', emoji: '✨', rarity: 'common', chance: 'Every kill' },
        { label: 'Doubloons', emoji: '🪙', rarity: 'common', chance: 'Every kill' },
      ],
      dropsNote: "Pete never runs short of Raiders. Drop by and thin the numbers whenever it suits you.",
    },
  },
  {
    id: 'pete',
    type: 'raid',
    label: "The Corsair's Reckoning",
    flavor: 'Barnacle Pete and his fleet have been spotted off the coast. Bring him to justice, dead or alive.',
    bridge: "Pete sinks loud and broke. Thirty years of plunder, not a coin in his hold. Where did it go?",
    requiresNode: 'skirmish',
    route: '/raids',
    image: CORSAIRS_RECKONING.enemies.pete.portrait,
    detail: {
      description:
        "Pete's full campaign: six escalating ship battles with no breather, ending in the old corsair himself. Win the gauntlet to crack open his loot crate, the only place his contraband drops.",
      enemies: ['Reef Raider ×2', "Crow's Nest Marksman ×2", 'Saltwater Corsair ×2', 'Barnacle Pete'],
      drops: lootDrops(CORSAIRS_RECKONING.loot),
      dropsNote: 'One crate per Pete clear, rolled once and scaled by your Fortune. Every kill along the way also pays gold + Nav XP.',
    },
  },
  {
    id: 'bilge_milestone',
    type: 'milestone',
    label: 'The Bilge Rats',
    flavor: 'Word of Pete’s fall spreads the docks over. Prove your coffers run deep enough to bankroll the next campaign.',
    bridge: "Coin opens doors a cutlass only dents. A careful fence starts asking after you by name.",
    requiresNode: 'pete',
    milestone: { amount: 2000, rewardDoubloons: 500 },
    detail: {
      description:
        "This is not a fight. It is a show of wealth. Hold 2,000 ⟡ in your coffers at once and the dock bosses will back your next campaign. You don't spend a coin; the milestone only checks you can carry the weight.",
      drops: [
        { label: '+500 ⟡ backing', emoji: '💰', rarity: 'uncommon', chance: 'Guaranteed' },
      ],
      dropsNote: 'You keep every doubloon you hold; the reward is paid on top when you claim.',
    },
  },
  {
    id: 'quartermaster',
    type: 'shop',
    label: "Quartermaster's Cache",
    flavor: 'A fence who deals in raid contraband: upgrades, oddities, contraband cannon. Opening soon.',
    requiresNode: 'bilge_milestone',
    detail: {
      description:
        "A black-market fence who deals in raid contraband: stat upgrades, oddball trinkets, and contraband cannon, all paid for in hard-won doubloons. The stall isn't open for business yet.",
      drops: [
        { label: 'Raid items', emoji: '💣', rarity: 'rare' },
        { label: 'Stat upgrades', emoji: '⚙️', rarity: 'uncommon' },
        { label: 'Rare oddities', emoji: '🎲', rarity: 'epic' },
      ],
      dropsNote: 'Opening in a future update.',
    },
  },
]

export type RaidNodeStatus = 'locked' | 'available' | 'cleared'

export interface RaidNodeView {
  node: RaidNode
  status: RaidNodeStatus
  /** milestone only: available + threshold met + not yet cleared. */
  claimable: boolean
  /** locked reason for the UI hint. */
  lockReason?: string
}

/** Pure status resolver. `cleared` is the set of node ids already done
 *  (combat beaten ≥1 / milestone claimed). Combat clears are derived by the
 *  caller from existing data; one-time clears come from raid_node_progress. */
export function computeRaidMap(
  cleared: Set<string>,
  doubloons: number,
  navLevel: number,
): RaidNodeView[] {
  return RAID_MAP.map(node => {
    if (cleared.has(node.id)) {
      return { node, status: 'cleared' as const, claimable: false }
    }
    const prereqOk = !node.requiresNode || cleared.has(node.requiresNode)
    const navOk = !node.requiresNavLevel || navLevel >= node.requiresNavLevel
    if (!prereqOk || !navOk) {
      const req = RAID_MAP.find(n => n.id === node.requiresNode)
      const verb = req?.type === 'story' ? 'Read' : 'Clear'
      const reason = !prereqOk
        ? `${verb} ${req?.label ?? 'the previous stop'} first`
        : `Reach Navigation Level ${node.requiresNavLevel}`
      return { node, status: 'locked' as const, claimable: false, lockReason: reason }
    }
    const claimable = node.type === 'milestone' && !!node.milestone && doubloons >= node.milestone.amount
    return { node, status: 'available' as const, claimable }
  })
}
