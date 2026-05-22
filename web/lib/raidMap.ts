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

import { CORSAIRS_RECKONING, CAPTAIN_KRUST, type RaidLootItem, type BossRaidConfig } from '@/lib/bossRaids'
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
  /** combat: total guaranteed doubloons + Nav XP for clearing every kill. */
  clearReward?: { doubloons: number; xp: number }
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
  /** raid only: the BossRaidConfig.raidId this node maps to, so its
   *  clear can be derived from raid_completions.raid_id. */
  raidId?: string
  /** Portrait shown in the map token + sheet header (e.g. the enemy you
   *  face). Falls back to the type glyph when unset. */
  image?: string
  /** milestone: needs `amount` doubloons. Default = hold (not spent) +
   *  optional `rewardDoubloons`. With `spend: true` it's a bribe/toll:
   *  `amount` is deducted and there is no reward. */
  milestone?: { amount: number; rewardDoubloons?: number; spend?: boolean }
  /** A one-time pick-one grant (Quartermaster's Cache). `items` are
   *  raid-item ids (lib/raidItems). Choosing one adds it to the
   *  player's raid_items permanently and clears the node. */
  choice?: { items: string[] }
  /** Rich detail surfaced in the tap-to-open sheet. */
  detail: RaidNodeDetail
}

/** Derive a drop list (with rolled-once odds) from a boss raid's loot
 *  table so the node sheet and the live crate never drift apart.
 *  Doubloons entries skip the % chip — the % feels transactional for
 *  currency and only really tells the player "you'll probably get gold",
 *  which they already assume. The chip stays on items / skins / packs
 *  where the rarity actually matters to the player's chase decision. */
function lootDrops(loot: RaidLootItem[]): RaidNodeDrop[] {
  const total = loot.reduce((s, l) => s + l.weight, 0)
  return loot.map(l => {
    const isDoubloons = l.id.startsWith('doubloons_')
    const drop: RaidNodeDrop = {
      label: l.label,
      emoji: l.emoji,
      image: l.image,
      rarity: l.rarity,
      ...(isDoubloons ? {} : { chance: `${Math.round((l.weight / total) * 100)}%` }),
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

/** Total guaranteed doubloons + Nav XP for clearing every kill in a raid
 *  (the sequence enemies + the boss). Surfaced as the expected payout. */
function clearPayout(config: BossRaidConfig): { doubloons: number; xp: number } {
  let doubloons = 0, xp = 0
  for (const id of [...config.sequence, config.bossId]) {
    const r = config.killRewards[id]
    if (r) { doubloons += r.gold; xp += r.xp }
  }
  return { doubloons, xp }
}

export const RAID_MAP: RaidNode[] = [
  {
    id: 'intro',
    type: 'story',
    label: 'A Loose Thread',
    flavor: "Barnacle Pete has bled the weak for years, and every coin of it sails off to someone bigger.",
    bridge: "Every trail runs back to one reef, where Pete's little fish do his collecting.",
    image: '/raidlog.png',
    detail: {
      description:
        "Pete is not some broke old chancer. He is good at what he does, and what he does is prey on the weak. Small crews, fishing folk, anyone too slight to fight back. Years of it, up and down this coast.\n\nThe strange part is the coin. Pete robs plenty and keeps almost none. He is a cash cow, milked by someone he answers to. Nobody can be bothered to ask who. You, clearly, have nothing better to do. Go give the loudest pirate on the water a good shake and see what falls out.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment I",
          sublabel: '"Pete don\'t spend his haul. He delivers it." Said once, by a man who would not say it twice.',
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
        // Single combined-reward line — skirmish is "kill a raider, get
        // XP + gold." Two separate rows with "Every kill" chips was
        // redundant; one line spells out the actual amounts up-front.
        {
          label: `Every kill: +${CORSAIRS_RECKONING.killRewards.brute.xp} Nav XP · +${CORSAIRS_RECKONING.killRewards.brute.gold} ⟡`,
          emoji: '⚔️',
          rarity: 'common',
        },
      ],
      clearReward: { doubloons: CORSAIRS_RECKONING.killRewards.brute.gold, xp: CORSAIRS_RECKONING.killRewards.brute.xp },
      dropsNote: "Pete never runs short of Raiders. Drop by and thin the numbers whenever it suits you.",
    },
  },
  {
    id: 'pete',
    type: 'raid',
    label: "The Corsair's Reckoning",
    flavor: 'Barnacle Pete and his fleet have been spotted off the coast. Bring him to justice, dead or alive.',
    bridge: "Pete goes down hard, and his strongbox spills more than coin. Ledgers. A sealed letter. He was never the top of this. He was feeding someone bigger.",
    requiresNode: 'skirmish',
    route: '/raids',
    raidId: CORSAIRS_RECKONING.raidId,
    image: CORSAIRS_RECKONING.enemies.pete.portrait,
    detail: {
      description:
        "Pete's full campaign: six escalating ship battles with no breather, ending in the old corsair himself. Win the gauntlet to crack open his loot crate, the only place his contraband drops.",
      enemies: ['Reef Raider ×2', "Crow's Nest Marksman ×2", 'Saltwater Corsair ×2', 'Barnacle Pete'],
      drops: lootDrops(CORSAIRS_RECKONING.loot),
      clearReward: clearPayout(CORSAIRS_RECKONING),
      dropsNote: 'One crate per Pete clear, rolled once and scaled by your Fortune. Every kill along the way also pays gold + Nav XP.',
    },
  },
  {
    id: 'syndicate',
    type: 'story',
    label: 'A Bigger Fish',
    flavor: "Pete's books name the Finndicate. One sealed letter names someone else, and points the way.",
    bridge: "The letter's heading runs straight through the Bilge Strait. To follow C.K.'s cargo you have to get past the thugs who own that water.",
    requiresNode: 'pete',
    image: '/raidlog.png',
    detail: {
      description:
        "Pete's strongbox was not empty. It was full of someone else's bookkeeping: cut sheets, courier routes, a tally of years, and one word stamped on every page. The Finndicate. Pete was no kingpin. He was a cash cow, milked dry and bled like everyone he ever robbed.\n\nUnder the ledgers sits a sealed shipment letter. No name on it, just two initials pressed into the wax: C.K. The manifest is heavy and the route is half burned away, but the heading survives. It runs out past the Bilge Strait, into the cold water beyond. Whoever C.K. is, the Finndicate trusts them with a great deal of cargo, and now you know which way it sails.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment II",
          sublabel: '"The Finndicate does not lose men. It loses ledgers." Scratched inside the strongbox lid.',
          rarity: 'uncommon',
        },
        {
          emoji: '✉️',
          label: 'Sealed Shipment Letter',
          sublabel: 'Addressed only to "C.K." A heavy manifest bound past the Bilge Strait.',
          rarity: 'rare',
        },
      ],
      dropsNote: 'A name (the Finndicate) and a lead (C.K., and the way the cargo sails). Both run through the Bilge Strait.',
      ctaLabel: 'Follow the Trail →',
    },
  },
  {
    id: 'bilge_milestone',
    type: 'milestone',
    label: 'The Bilge Eels',
    flavor: "Neutral thugs who own the Bilge Strait. No flag, no loyalty, just a toll. C.K.'s cargo sails right through their water.",
    bridge: "Past the strait the water turns Finndicate. C.K. is moving cargo somewhere ahead, and a fence here already knows your name.",
    requiresNode: 'syndicate',
    requiresNavLevel: 10,
    milestone: { amount: 1000, spend: true },
    image: '/bilge_eel.jpeg',
    detail: {
      description:
        "The letter never gave an address, only a heading: out past the Bilge Strait into the cold water. That is enough to follow, and it is exactly the stretch the Bilge Eels own.\n\nThey answer to no one. Not Finndicate, not you, just a knot of thugs charging toll on the only water that points where C.K.'s cargo went. There is no fighting through at your size. They treat only with captains who have sailed enough to be worth the breath (Navigation 10), and even then it costs. Slide them 1,000 ⟡ and they wave you through, onto C.K.'s trail. Refuse, and the trail goes cold.",
      drops: [
        { emoji: '🗺️', label: "The trail toward C.K.", sublabel: 'Passage through the Bilge Strait, following the shipment heading', rarity: 'uncommon' },
      ],
      dropsNote: 'A one-time bribe. The 1,000 ⟡ is spent for good, not held or refunded.',
    },
  },
  {
    id: 'quartermaster',
    type: 'shop',
    label: "Quartermaster's Cache",
    flavor: 'Past the strait, a fence lays out two pieces of contraband. You may walk away with one.',
    bridge: "The fence talks more than he sells. The cold water ahead belongs to one captain, and the wax on Pete's letter finally has a name to it.",
    requiresNode: 'bilge_milestone',
    choice: { items: ['quartermasters_anchor', 'navigators_compass'] },
    detail: {
      description:
        "The fence on the far side of the Bilge Strait does not haggle. He sets two pieces of contraband on the barrel between you, the kind that does not come up twice, and tells you to choose. One, not both. The other goes back in the cache and you never see it again.\n\nWhatever you pick is yours for good, ready to equip in your raid loadout alongside the rest.",
      dropsNote: 'Pick one. Permanent, equippable, and you cannot come back for the other.',
    },
  },
  {
    id: 'krust_reveal',
    type: 'story',
    label: 'The Name on the Wax',
    flavor: 'Two initials on a sealed letter. The fence on the cold side of the strait can read the rest.',
    bridge: "Captain Krust. He runs the Finndicate's freight, and every hold he fills is a hold you can empty. His consignment is out there now.",
    requiresNode: 'quartermaster',
    image: '/raidlog.png',
    detail: {
      description:
        "The wax on Pete's letter only ever gave you two letters: C.K. The fence past the strait gives you the rest, for the price of looking like he did you no favour.\n\nCaptain Krust. An old, hard hand the Finndicate trusts with its freight, the kind of captain who never asks whose name is on a manifest and has lasted a lifetime for exactly that. He does not raid the weak the way Pete did. He moves cargo, on schedule, in bulk, and the Finndicate counts on every crate of it. He is no kingpin either. He answers upward like all of them. But he is a long way above a barnacled chancer, and his consignment is sailing the cold water right now.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment III",
          sublabel: '"C.K. don\'t lose cargo. Lose his cargo and you find out why." Said by the fence, who would not be named either.',
          rarity: 'rare',
        },
      ],
      dropsNote: 'A name at last. The Finndicate has a face for its freight, and the freight has a heading.',
      ctaLabel: 'Name the Devil →',
    },
  },
  {
    id: 'krust',
    type: 'raid',
    label: "Krust's Consignment",
    flavor: "Captain Krust's freight runs the cold water past the Bilge Strait. Sink the consignment and the Finndicate feels it.",
    bridge: "Krust goes down and his manifest goes overboard with him. He was no kingpin either. He kept saying someone above him would want this back.",
    requiresNode: 'krust_reveal',
    requiresNavLevel: 20,
    route: '/raids/krust',
    raidId: CAPTAIN_KRUST.raidId,
    image: CAPTAIN_KRUST.enemies.krust.portrait,
    detail: {
      description:
        "Krust's full run: eight escalating ship battles through his consignment crew with no breather, ending in the old captain and his iron-sided carrack. Sink the gauntlet to crack his loot crate, the only place his contraband drops. Stiffer than anything Pete's reef ever threw at you.",
      enemies: ['Bilge Runner ×2', 'Brine Deckhand ×2', 'Hull Breaker ×2', 'Krust Overseer ×2', 'Captain Krust'],
      drops: lootDrops(CAPTAIN_KRUST.loot),
      clearReward: clearPayout(CAPTAIN_KRUST),
      dropsNote: 'One crate per Krust clear, rolled once and scaled by your Fortune. Every kill along the way also pays gold + Nav XP.',
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
