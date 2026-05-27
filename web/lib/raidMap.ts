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

import { CORSAIRS_RECKONING, CAPTAIN_KRUST, GEM_GLYPH, raidCompletionBonusXp, type RaidLootItem, type BossRaidConfig } from '@/lib/bossRaids'
import { CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE } from '@/lib/raidChallenge'
import { getShipSkin } from '@/lib/shipSkins'
import { getRaidItem } from '@/lib/raidItems'

// Each type gets its own colour + glyph on the map:
//  - skirmish  : a single practice battle
//  - raid      : a full multi-encounter campaign / boss
//  - milestone : a "collect / hold X" goal (no fight)
//  - shop      : a contraband stall (future)
//  - story     : an overarching-story beat (future)
export type RaidNodeType = 'skirmish' | 'raid' | 'milestone' | 'shop' | 'story' | 'puzzle' | 'class_pick'

/** Routes into a combat screen + derives its clear from battle data. */
export function isCombatNode(t: RaidNodeType): boolean {
  return t === 'skirmish' || t === 'raid'
}

// ── Beacon-chain puzzle (Lights Out) ─────────────────────────────────────────
// The smuggler's lane is marked by signal beacons wired as a tamper failsafe:
// lighting one flips the beacons beside it. Light the WHOLE chain at once to read
// the heading. The component scrambles the all-lit board with random taps, so it
// is always solvable but has no greedy/hill-climb solve (the parity makes
// guessing useless) — that is what makes it genuinely hard. There is no hidden
// answer to leak, so the solve is checked client-side and the server just records
// completion + pays the reward (same trust level as the "mark story read" nodes).
// Difficulty knobs = grid size + scrambleTaps.
export interface RaidPuzzle {
  cols: number
  rows: number
  /** Random taps applied from the solved (all-lit) board to scramble it. */
  scrambleTaps: number
  /** Nav XP granted on solve (no doubloons — this is a navigation discovery). */
  rewardNavXp: number
  /** Story payoff shown the moment the chain is lit: where the freight runs,
   *  i.e. the next place to head. Supports \n line breaks. */
  reveal?: string
}

/** One row in a node's "possible drops" panel. */
export interface RaidNodeDrop {
  label: string
  emoji: string
  image?: string | null
  /** CSS filter applied to `image` (ship-skin previews recolour a ship sprite). */
  imageFilter?: string
  rarity?: RaidLootItem['rarity']
  /** Human-readable odds, e.g. "49%", "Guaranteed", "Every kill". */
  chance?: string
  /** Short, noob-friendly line under the label (what the thing is). */
  sublabel?: string
  /** Solid swatch colour shown instead of an icon (ship skins). */
  swatch?: string
  /** CSS filter applied to the swatch (the skin's actual effect). */
  swatchFilter?: string
  /** If this drop is a raid item, its id (so the detail modal can pull
   *  the full RaidItemDef — effects, description, source). */
  raidItemId?: string
  /** If this drop is a ship skin, its id (so the detail modal can
   *  pull the full ShipSkin — name, filter, lore). */
  shipSkinId?: string
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
  /** class_pick node: one-time chapter-end ship-class pick. The
   *  chapterId is the RAID_CHAPTERS.id this pick contributes to (so
   *  the picker writes into profiles.ship_classes[chapterId]). */
  classPick?: { chapterId: string }
  /** puzzle: the beacon-chain (Lights Out). Solving clears the node. */
  puzzle?: RaidPuzzle
  /** Marks this node as a side branch hanging off another node, NOT part of
   *  the main story chain. Used by challenge-mode raids: the challenge node
   *  sits beside its parent on the map (shared row, opposite column),
   *  draws a short connector to the parent instead of taking its own
   *  zigzag slot, and renders smaller + with the challenge glyph. The main
   *  chain skips it entirely when drawing the route line. */
  sideBranch?: { parentId: string }
  /** Rich detail surfaced in the tap-to-open sheet. */
  detail: RaidNodeDetail
}

// Ship-skin loot previews recolour this ship sprite (the tier-4 brigantine) so
// players see the skin on an actual hull rather than a flat colour chip.
const SHIP_SKIN_PREVIEW_IMG = '/models/brigantine.png'

/** Derive a drop list (with rolled-once odds) from a boss raid's loot
 *  table so the node sheet and the live crate never drift apart.
 *  Doubloons entries skip the % chip — the % feels transactional for
 *  currency and only really tells the player "you'll probably get gold",
 *  which they already assume. The chip stays on items / skins / packs
 *  where the rarity actually matters to the player's chase decision. */
function lootDrops(loot: RaidLootItem[]): RaidNodeDrop[] {
  const total = loot.reduce((s, l) => s + l.weight, 0)
  const drops = loot.map(l => {
    const isDoubloons = l.id.startsWith('doubloons_')
    const drop: RaidNodeDrop = {
      label: l.label,
      emoji: l.emoji,
      image: l.image,
      rarity: l.rarity,
      ...(isDoubloons ? {} : { chance: `${Math.round((l.weight / total) * 100)}%` }),
    }
    // Ship skin → preview the skin on a ship sprite (recoloured brigantine) so
    // the player sees what it actually looks like, not just a flat colour.
    if (l.shipSkinId) {
      const skin = getShipSkin(l.shipSkinId)
      if (skin) {
        drop.label = skin.name
        drop.sublabel = 'Ship skin. A cosmetic new look for your ship.'
        drop.image = SHIP_SKIN_PREVIEW_IMG
        drop.imageFilter = skin.filter
        drop.shipSkinId = l.shipSkinId
      }
    }
    // Raid item → surface its plain-English effect.
    const item = getRaidItem(l.id)
    if (item) {
      drop.sublabel = `Raid item. ${item.description}`
      drop.raidItemId = item.id
    }
    return drop
  })
  return combineGemDrops(drops)
}

// Gem payouts come in two tiers (a rare amount + an epic amount), which reads as
// two near-identical pills on the node sheet. Fold them into one "X to Y Gems"
// pill. The live crate still rolls each tier separately from config.loot.
function combineGemDrops(drops: RaidNodeDrop[]): RaidNodeDrop[] {
  const gems = drops.map((d, i) => ({ d, i })).filter(x => x.d.emoji === GEM_GLYPH)
  if (gems.length < 2) return drops
  const amounts = gems
    .map(x => parseInt(x.d.label.replace(/[^0-9]/g, ''), 10))
    .filter(n => !Number.isNaN(n))
  const lo = Math.min(...amounts), hi = Math.max(...amounts)
  const merged: RaidNodeDrop = {
    label: `${lo.toLocaleString()} to ${hi.toLocaleString()} Gems`,
    emoji: GEM_GLYPH,
    rarity: 'epic',
  }
  const firstGem = gems[0].i
  const gemSet = new Set(gems.map(x => x.i))
  const out: RaidNodeDrop[] = []
  drops.forEach((d, i) => {
    if (i === firstGem) out.push(merged)
    else if (!gemSet.has(i)) out.push(d)
  })
  return out
}

/** Total doubloons + Nav XP for a full clear: every kill (sequence + boss) plus
 *  the 25% full-clear XP bonus granted on completion. Surfaced as the expected
 *  payout, so the headline XP matches what finishing the raid actually pays. */
function clearPayout(config: BossRaidConfig): { doubloons: number; xp: number } {
  let doubloons = 0, xp = 0
  for (const id of [...config.sequence, config.bossId]) {
    const r = config.killRewards[id]
    if (r) { doubloons += r.gold; xp += r.xp }
  }
  return { doubloons, xp: xp + raidCompletionBonusXp(config) }
}

/** A named arc of the raid map. Players read the chain as discrete
 *  chapters, not an infinite scroll: every new raid arc gets its own
 *  RAID_CHAPTERS entry + extends RAID_MAP under that chapter's
 *  boundary. The boundary is given by lastNodeId — walking RAID_MAP
 *  in order, any node up to and including that id belongs to this
 *  chapter; the next chapter begins at the next node. Order in
 *  RAID_CHAPTERS must match the linear order of RAID_MAP. */
export interface RaidChapter {
  id: string
  number: number
  romanNumeral: string
  title: string
  /** One-line evocative blurb shown under the title. */
  subtitle: string
  /** Last node id (inclusive) that belongs to this chapter. The next
   *  chapter starts at the next RAID_MAP entry after this one. */
  lastNodeId: string
}

export const RAID_CHAPTERS: RaidChapter[] = [
  {
    id:         'thread',
    number:     1,
    romanNumeral: 'I',
    title:      'The Loose Thread',
    subtitle:   'A coastline of pirates, and a thread that runs to somewhere bigger.',
    // Pete's arc + Krust's arc, both challenge variants, AND the
    // class-pick that closes the chapter. Captain's Choice is the
    // final beat — a permanent ship-identity decision for clearing
    // the chapter.
    lastNodeId: 'chapter_1_class',
  },
  {
    id:         'sunken_hand',
    number:     2,
    romanNumeral: 'II',
    title:      'The Sunken Hand',
    subtitle:   'The shadow you have been pulling at finally has a name.',
    // Current chapter II content is the post-Krust setup arc. New raids
    // for chapter II append before this boundary; chapter III starts
    // after a new RAID_CHAPTERS entry is added.
    lastNodeId: 'last_cache',
  },
]

/** Which chapter does this node belong to? Walks RAID_CHAPTERS in
 *  order and returns the first one whose lastNodeId comes at or after
 *  this node in RAID_MAP. Falls back to the last chapter if the node
 *  somehow sits past every boundary (defensive — should never happen
 *  if RAID_CHAPTERS is kept in sync with RAID_MAP). */
export function chapterForNode(nodeId: string): RaidChapter {
  const nodeIdx = RAID_MAP.findIndex(n => n.id === nodeId)
  for (const c of RAID_CHAPTERS) {
    const lastIdx = RAID_MAP.findIndex(n => n.id === c.lastNodeId)
    if (nodeIdx >= 0 && nodeIdx <= lastIdx) return c
  }
  return RAID_CHAPTERS[RAID_CHAPTERS.length - 1]
}

export const RAID_MAP: RaidNode[] = [
  {
    id: 'intro',
    type: 'story',
    label: 'A Loose Thread',
    flavor: "Barnacle Pete plays the broke old fool, but he has robbed the small and the slow for years, and not a coin of it ever stays in his pocket.",
    bridge: "Every thread you tug runs back to one reef, where Pete's little fish do his collecting.",
    image: '/raidlog.png',
    detail: {
      description:
        "Pete is no broke old chancer. He is very good at one thing, and that thing is picking on anyone too small to swing back. Little crews, fishing folk, the odd unlucky angler. Years of it, all up and down this coast, and somehow he is no richer for any of it.\n\nThat is the funny part. Pete steals a fortune and keeps about a copper. The rest sails off to someone he would rather you never asked about, so of course nobody asks. You, on the other hand, have a boat, a free afternoon, and no manners worth mentioning. Go give the loudest pirate on the water a good shake and see what tumbles out of his coat.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment I",
          sublabel: "\"Pete don't spend his haul. He delivers it.\" Said once, by a man who knew better than to say it twice.",
          rarity: 'common',
        },
      ],
      dropsNote: 'Pages like this pile up the more you go poking. Sooner or later they spell out a name.',
      ctaLabel: 'Pull the Thread →',
    },
  },
  {
    id: 'skirmish',
    type: 'skirmish',
    label: 'Reef Skirmish',
    flavor: "Pete keeps his own hands clean and his Reef Raiders busy. Start putting them on the seabed.",
    bridge: "Thin his Raiders and you thin his nerve. Sink enough of them and the old corsair rows out himself to see who has been counting.",
    requiresNode: 'intro',
    route: '/raids/practice',
    image: CORSAIRS_RECKONING.enemies.brute.portrait,
    detail: {
      description:
        "Pete is not the sort to do his own swinging. That is what the Reef Raiders are for, and the reef fairly crawls with them. Sink one and another bobs up grinning to take the empty seat.\n\nNo grand plan out here. Pick them off, one soggy thug at a time, and wait to see who comes asking once too many of them stop rowing home.",
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
      dropsNote: "Pete never runs short of Raiders. Swing by and trim the numbers whenever the mood takes you.",
    },
  },
  {
    id: 'pete',
    type: 'raid',
    label: "The Corsair's Reckoning",
    flavor: 'Barnacle Pete and his fleet have surfaced off the coast. Go collect what is owed, dead or alive.',
    bridge: "Pete goes down hard, and his strongbox spills more than coin. Ledgers. A sealed letter. The loudest pirate on the water turns out to be somebody else's errand boy.",
    requiresNode: 'skirmish',
    route: '/raids',
    raidId: CORSAIRS_RECKONING.raidId,
    image: CORSAIRS_RECKONING.enemies.pete.portrait,
    detail: {
      description:
        "Pete's whole campaign in one sitting: six ship battles back to back, each one nastier than the last, not a moment to bail the bilge between them, and the old corsair himself waiting at the end. Win the gauntlet and his loot crate finally cracks. It is the only place his contraband ever sees the sun.",
      enemies: ['Reef Raider ×2', "Crow's Nest Marksman ×2", 'Saltwater Corsair ×2', 'Barnacle Pete'],
      drops: lootDrops(CORSAIRS_RECKONING.loot),
      clearReward: clearPayout(CORSAIRS_RECKONING),
      dropsNote: 'One crate per Pete clear, rolled once and scaled by your Fortune. Every kill along the way also pays gold + Nav XP.',
    },
  },
  {
    // Challenge variant — unlocks once normal Pete is cleared. Same gauntlet,
    // scaled-up stats (+30% mob HP, +15% mob dmg, +50% boss HP, +20% boss
    // dmg) and scaled payouts (+50% gold/XP per kill, +50% gem weight in
    // the crate, DOUBLE the unique drop rate). Completions track under the
    // suffixed raid_id so the Boss Records leaderboard is its own bucket.
    // The "syndicate" story chain still gates on the normal pete clear,
    // not this one — challenge stays optional / parallel to the main line.
    id: 'pete_challenge',
    type: 'raid',
    label: "Challenge: The Corsair's Reckoning",
    flavor: 'Pete sails out again, meaner this time, with the kind of crew that does not lose twice.',
    requiresNode: 'pete',
    route: '/raids/challenge',
    raidId: CORSAIRS_RECKONING_CHALLENGE.raidId,
    sideBranch: { parentId: 'pete' },
    // Same boss portrait as the parent raid — the side-branch token paints
    // it with a red border + red glow to signal "harder version of the
    // same fight" rather than a different enemy. See SIDE_BRANCH_ACCENT
    // in RaidsSection.tsx.
    image: CORSAIRS_RECKONING.enemies.pete.portrait,
    detail: {
      description:
        "The same six ship battles, the same old corsair at the end, but every hull he has put back on the water is a step harder than the one before it. The Raiders hit cleaner, the Marksman aims truer, and Pete himself fights like a man who has finally noticed you are still here. Crack his crate this time and the contraband runs richer for it.",
      enemies: ['Reef Raider ×2', "Crow's Nest Marksman ×2", 'Saltwater Corsair ×2', 'Barnacle Pete'],
      drops: lootDrops(CORSAIRS_RECKONING_CHALLENGE.loot),
      clearReward: clearPayout(CORSAIRS_RECKONING_CHALLENGE),
      dropsNote: 'Every kill pays more, the clear bonus is steeper, and his unique contraband rolls at double the normal rate.',
    },
  },
  {
    id: 'syndicate',
    type: 'story',
    label: 'A Bigger Fish',
    flavor: "Pete's books all point one way and name the Finndicate. One sealed letter points further still, at somebody else.",
    bridge: "The letter's heading runs dead through the Bilge Strait. Chase C.K.'s cargo and you first have to slip past the thugs who own that water.",
    requiresNode: 'pete',
    image: '/raidlog.png',
    detail: {
      description:
        "Pete's strongbox was not empty, only full of the wrong man's paperwork. Cut sheets, courier routes, years of neat little sums, and one word stamped on every page: the Finndicate. So much for the kingpin. Pete was a cash cow like all the rest, milked dry and bled the same as everyone he ever robbed. And the coin never sits still. Page after page, every haul buys the same thing over again, and not one line will say what.\n\nUnder the ledgers waits a sealed letter. No name on it, just two letters bitten into the wax: C.K. The manifest is heavy and the route mostly burned away, but the heading held. It runs out past the Bilge Strait, into the cold beyond. Whoever C.K. is, the Finndicate trusts them with cargo by the holdful, and now you know which way it sails.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment II",
          sublabel: "\"The Finndicate does not lose men. It loses ledgers.\" Scratched into the underside of the strongbox lid.",
          rarity: 'uncommon',
        },
        {
          emoji: '✉️',
          label: 'Sealed Shipment Letter',
          sublabel: "Addressed to \"C.K.\" and to no one else. A heavy manifest, bound past the Bilge Strait.",
          rarity: 'rare',
        },
      ],
      dropsNote: 'A name to chase (the Finndicate) and a lead to follow (C.K., and the way the cargo runs). Both go straight through the Bilge Strait.',
      ctaLabel: 'Follow the Trail →',
    },
  },
  {
    id: 'bilge_milestone',
    type: 'milestone',
    label: 'The Bilge Eels',
    flavor: "Neutral thugs who own the Bilge Strait. No flag, no loyalty, only a toll, and C.K.'s cargo sails right through their water.",
    bridge: "Past the strait the water turns Finndicate. C.K. is shifting cargo somewhere ahead, and a fence up there already knows your name.",
    requiresNode: 'syndicate',
    requiresNavLevel: 10,
    milestone: { amount: 1000, spend: true },
    image: '/bilge_eel.jpeg',
    detail: {
      description:
        "The letter left no address, only a heading: out past the Bilge Strait, into the cold. That is enough to follow, and as luck would have it the whole stretch belongs to the Bilge Eels.\n\nThey bow to nobody. Not the Finndicate, not you, just a knot of thugs squatting on the only water that points where C.K.'s cargo went, charging good coin to cross it. There is no bulling through at your size. They will only deal with a captain who has logged enough sea to be worth the breath (Navigation 10), and even then they expect paying. Slip them 1,000 ⟡ and the way opens onto C.K.'s trail. Keep your purse shut and the trail goes cold as the water.",
      drops: [
        { emoji: '🗺️', label: "The trail toward C.K.", sublabel: "Passage through the strait, hard on C.K.'s heading.", rarity: 'uncommon' },
      ],
      dropsNote: 'A one-time bribe. The 1,000 ⟡ is spent for good, not held or refunded.',
    },
  },
  {
    id: 'quartermaster',
    type: 'shop',
    label: "Quartermaster's Cache",
    flavor: 'Past the strait, a fence lays out two pieces of contraband and lets you leave with exactly one.',
    bridge: "The fence sells far less than he says. The cold water ahead answers to one captain, and the wax on Pete's letter finally has a name behind it.",
    requiresNode: 'bilge_milestone',
    choice: { items: ['quartermasters_anchor', 'navigators_compass'] },
    detail: {
      description:
        "The fence on the far shore of the Bilge Strait does not haggle and does not repeat himself. He sets two pieces of contraband on the barrel between you, the sort that does not wash up twice, and tells you to choose. One. The other slides back into the cache and out of your life for good.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout alongside the rest of your kit.",
      dropsNote: 'Pick one. Permanent, equippable, and you cannot come back for the other.',
    },
  },
  {
    id: 'krust_reveal',
    type: 'story',
    label: 'The Name on the Wax',
    flavor: 'Two letters in a blot of wax. The fence on the cold side of the strait can read you the rest.',
    bridge: "Captain Krust. He runs the Finndicate's freight, and every hold he fills is a hold you can empty. His consignment is out on the water as you read this.",
    requiresNode: 'quartermaster',
    image: '/raidlog.png',
    detail: {
      description:
        "Pete's wax only ever coughed up two letters: C.K. The fence past the strait fills in the rest, on the strict condition you act like he did you no favour by it.\n\nCaptain Krust. An old, leathery hand the Finndicate trusts with its freight, the kind who has never once asked whose name rides a manifest and has stayed afloat a lifetime for exactly that reason. He is nothing like Pete. He does not rob the small. He moves cargo, on time, in bulk, and the Finndicate sets its clock by him. Still no kingpin, mind you. He answers upward like every other fish in this sea. But he sits a long way above a barnacled chancer, and his consignment is on the cold water right now.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment III",
          sublabel: "\"C.K. don't lose cargo. Lose his cargo and you find out why.\" Said by the fence, who would not be named either.",
          rarity: 'rare',
        },
      ],
      dropsNote: 'A name at last. The Finndicate\'s freight has a face, and the face keeps a schedule.',
      ctaLabel: 'Name the Devil →',
    },
  },
  {
    id: 'krust',
    type: 'raid',
    label: "Krust's Consignment",
    flavor: "Captain Krust's freight runs the cold water past the Bilge Strait. Sink the consignment and the Finndicate feels every crate of it.",
    bridge: "Krust goes down and his manifest goes over the side with him. No kingpin either, this one. Right to the end he kept muttering that someone above him would want it all back.",
    requiresNode: 'krust_reveal',
    requiresNavLevel: 20,
    route: '/raids/krust',
    raidId: CAPTAIN_KRUST.raidId,
    image: CAPTAIN_KRUST.enemies.krust.portrait,
    detail: {
      description:
        "Krust's full run in one go: eight ship battles through his consignment crew, each heavier than the last, no breather to be found anywhere in it, and the old captain waiting at the end aboard his iron-sided carrack. Every hull in this crew is crustacean, all shell and spite, so a slice of your fire glances clean off them, and Krust himself shrugs off more still. Sink the lot and his loot crate splits open, the only place his contraband ever drops. Nothing Pete's reef ever threw at you sailed half this hard.",
      enemies: ['Bilge Runner ×2', 'Brine Deckhand ×2', 'Hull Breaker ×2', 'Krust Overseer ×2', 'Captain Krust'],
      drops: lootDrops(CAPTAIN_KRUST.loot),
      clearReward: clearPayout(CAPTAIN_KRUST),
      dropsNote: 'One crate per Krust clear, rolled once and scaled by your Fortune. Every kill along the way also pays gold + Nav XP.',
    },
  },
  {
    // Challenge variant of Krust. Same scaling rules as Pete's challenge
    // node — see pete_challenge for the design notes. Gates on the normal
    // krust clear only; the finndicate_notice story chain keeps gating on
    // normal krust so the main plot is unaffected.
    id: 'krust_challenge',
    type: 'raid',
    label: "Challenge: Krust's Consignment",
    flavor: "Krust patched the iron hull, drilled the crew, and put the consignment back on the cold water. He does not lose cargo twice.",
    requiresNode: 'krust',
    route: '/raids/krust/challenge',
    raidId: CAPTAIN_KRUST_CHALLENGE.raidId,
    sideBranch: { parentId: 'krust' },
    // Same boss portrait as the parent raid. See pete_challenge for design.
    image: CAPTAIN_KRUST.enemies.krust.portrait,
    detail: {
      description:
        "Krust's full consignment again, harder for the loss. The Carapace runs thicker, the volleys land cleaner, and every hand on his deck has had a long, cold look at the captain who sank them once already. Crack the crate this run and the contraband rolls deeper than any of his first manifests ever paid.",
      enemies: ['Bilge Runner ×2', 'Brine Deckhand ×2', 'Hull Breaker ×2', 'Krust Overseer ×2', 'Captain Krust'],
      drops: lootDrops(CAPTAIN_KRUST_CHALLENGE.loot),
      clearReward: clearPayout(CAPTAIN_KRUST_CHALLENGE),
      dropsNote: 'Every kill pays more, the clear bonus is steeper, and his unique contraband rolls at double the normal rate.',
    },
  },
  {
    // Chapter-end ship-class pick. Unlocks the moment the player beats
    // the main Krust raid (challenge optional). Picks a permanent ship
    // identity from the 4-class roster in lib/shipClasses.ts; locked in
    // once chosen. New class nodes for future chapters follow the same
    // pattern (one per chapter, gated on the chapter's final boss).
    id: 'chapter_1_class',
    type: 'class_pick',
    label: "Captain's Choice",
    flavor: "Two captains on the seabed and your name on every wanted board between here and the danger lines. Time to decide what kind of captain your name belongs to.",
    requiresNode: 'krust',
    classPick: { chapterId: 'thread' },
    detail: {
      description:
        "You sank Pete. You sank Krust. The coast knows your sails now and the next stretch of water is not going to be kind. Stand on the deck of your ship and pick a class. Once chosen it stays with you for every raid you sail from here on.",
      ctaLabel: 'Pick a class',
    },
  },
  {
    id: 'finndicate_notice',
    type: 'story',
    label: 'The Finndicate Takes Notice',
    flavor: "Krust is on the seabed, and for the first time the Finndicate feels the hole you have torn in its side.",
    bridge: "They run a special class of freight through water they will only call the danger zones. Whatever it is, it is worth more to them than the ships it keeps eating.",
    requiresNode: 'krust',
    image: '/raidlog.png',
    detail: {
      description:
        "Krust was no small cog, and the gap he leaves shows plain in the books. For the first time someone well above the freight desk has set down the ledgers and taken a long, cold look at the captain who keeps sinking their cargo. You have the Finndicate's full attention now, which is the one prize you cannot hand back.\n\nA single scrap rode out the wreck of Krust's run. The Finndicate moves a special class of cargo, priority freight steered through water its own manifests will only call the danger zones. Most captains sail in there exactly once. Whatever they are hauling through it is worth every hull it swallows, and they would dearly love you to set the thread down and walk away.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment IV",
          sublabel: "\"Danger-zone consignment. Priority freight. It will not open for him. Find the hands that it will.\" Stamped with a mark no clerk would explain.",
          rarity: 'common',
        },
      ],
      dropsNote: 'A cargo worth losing ships over, and a heading into water that eats them. The trail runs colder and deeper from here.',
      ctaLabel: 'Follow the Freight →',
    },
  },
  {
    id: 'smugglers_chart',
    type: 'puzzle',
    label: "The Smuggler's Chart",
    flavor: "Krust's cabin gave up the freight network map: every drop along the coast strung on a single chain of signal beacons. Light the whole chain and it shows where it all ships to.",
    bridge: "The beacons catch as one, and every lane on the map bends to a single point far past the danger line. That is where the freight ends up, and where you are bound.",
    requiresNode: 'finndicate_notice',
    // No per-node image — every puzzle node defaults to /puzzle.png via
    // TYPE_IMAGE in RaidsSection. Override here only for a one-off art.
    puzzle: {
      // 4×4 Lights Out. Light every beacon at once; each tap flips the beacon and
      // its neighbours, so there is no greedy solve. 4×4 is fully solvable with a
      // unique solution (no quiet patterns) — a real puzzle that isn't a wall.
      // Scrambled from the solved board, so always solvable. Difficulty = grid
      // size + scrambleTaps.
      cols: 4,
      rows: 4,
      scrambleTaps: 12,
      rewardNavXp: 500,
      reveal:
        "The beacons hold, the whole chain steady at last, and the map gives up its secret. Every freight lane bends to one place, far past the danger line where the charts simply stop.\n\nYou have the heading now. That is where the Finndicate funnels all of it, and that is where you sail next.",
    },
    detail: {
      description:
        "Krust was no kingpin, only a captain who ran cargo, and the Finndicate keeps its captains roped to one another. His cabin gave up the network map: a chain of signal beacons, each drop wired to the next, lit only on the nights the freight runs.\n\nThe chain is rigged against prying eyes. Light one beacon and the lanterns either side of it flare or gutter, so no single light ever gives the shape away. Get them all burning at once and the network shows itself, headings and all, the kind no one was ever meant to read.",
      drops: [
        {
          emoji: '🧭',
          label: '500 Nav XP',
          sublabel: 'Reading the whole network sharpens your navigation. No coin in it, just the heading.',
          rarity: 'rare',
        },
      ],
      dropsNote: 'Tap beacons to light the chain. Each tap flips the one you touch and its neighbours. Light them all at once to read the network. One-time, no cost, no fight.',
    },
  },
  {
    // Node id stays 'last_cache' so anyone who's already chosen a kit
    // keeps their cleared state in raid_node_progress.cleared[]. Only
    // the player-facing label / copy changes.
    id: 'last_cache',
    type: 'shop',
    label: 'Driftwood Cache',
    flavor: 'A driftwood outfit clinging to a rock just inside the danger line. Two pieces of kit on the counter, take one, leave the other for good.',
    requiresNode: 'smugglers_chart',
    choice: { items: ['gunners_sight', 'reinforced_hull'] },
    detail: {
      description:
        "Past the beacon chain the chart shows another drop point, a driftwood shack hammered to a rock just inside the danger line. The keeper has worked this water longer than most and runs the same trick every fence past the strait pulls: two pieces of kit on the counter, take one, leave the other for good. The freight runs deeper than any honest captain has charts for, and there will be more outfits like this one along the way.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout alongside the rest of your kit.",
      dropsNote: 'Pick one. Permanent, equippable, and you cannot come back for the other.',
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
