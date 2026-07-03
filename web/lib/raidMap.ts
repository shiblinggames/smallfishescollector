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

import { CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER, THE_COFFERS_FLEET, THE_QUARTERMASTER, GEM_GLYPH, raidCompletionBonusXp, type RaidLootItem, type BossRaidConfig } from '@/lib/bossRaids'
import { CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE, THE_CARTOGRAPHER_CHALLENGE, THE_TOLLMASTER_CHALLENGE, THE_COFFERS_FLEET_CHALLENGE, THE_QUARTERMASTER_CHALLENGE } from '@/lib/raidChallenge'
import { getShipSkin } from '@/lib/shipSkins'
import { getRaidItem } from '@/lib/raidItems'

// Each type gets its own colour + glyph on the map:
//  - skirmish  : a single practice battle
//  - raid      : a full multi-encounter campaign / boss
//  - milestone : a "collect / hold X" goal (no fight)
//  - shop      : a contraband stall (future)
//  - story     : an overarching-story beat (future)
export type RaidNodeType = 'skirmish' | 'raid' | 'milestone' | 'shop' | 'story' | 'puzzle' | 'class_pick' | 'event' | 'dice' | 'gauntlet' | 'fork' | 'dps_check'

// Branching event nodes (lib/raidMap RaidNode.event). One-time, the
// player picks ONE option which fires its outcome and clears the node;
// the other options are gone for good. Distinct from `choice` (which
// picks from raid items only) because each option here can grant a
// different KIND of reward, including "nothing." Used for in-world
// decision beats — captured scouts, faction parlays, etc.
export type RaidEventOutcome =
  | { type: 'doubloons'; amount: number }   // gain doubloons + ledger row
  | { type: 'navXp';     amount: number }   // gain Navigation XP
  | { type: 'none' }                        // no material reward; story choice only

export interface RaidEventChoice {
  /** Stable id stored in raid_node_progress.choices so we can show
   *  which option the player picked on revisit. Don't reuse across
   *  nodes (collisions would mis-render past picks). */
  id: string
  /** CTA button text. Short verb-led phrase. */
  label: string
  /** One-sentence card body. Explains what happens AND the trade. */
  description: string
  outcome: RaidEventOutcome
}

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
// ── Mirror Run (a Zelda-style light-beam puzzle) ─────────────────────────────
// A signal-lantern fires a beam across a grid; the player rotates mirror tiles
// (each toggles between '/' and '\\') to bend the beam around walls onto the
// target lens. Solved client-side (the beam trace detects the hit); reuses
// solvePuzzleNode to grant the Nav XP, like the other puzzle kinds.
export type MirrorOrient = '/' | '\\'
export type BeamDir = 'up' | 'down' | 'left' | 'right'
export interface RaidMirrorTile {
  x: number
  y: number
  /** Orientation the tile STARTS in (the player rotates it from here). For a
   *  fixed tile this is its permanent orientation. */
  init: MirrorOrient
  /** A locked maze mirror the player CANNOT rotate — pure structure the beam
   *  must be routed around/through. Omit/false = a normal rotatable mirror. */
  fixed?: boolean
}
export interface RaidMirrorPuzzle {
  cols: number
  rows: number
  /** Lantern: cell it sits in + the direction it fires into the grid. */
  source: { x: number; y: number; dir: BeamDir }
  /** Lenses the beam must pass through. The beam goes STRAIGHT through a lens
   *  (it isn't a mirror) and must cross EVERY lens in one fired path to solve.
   *  Multiple lenses force a threaded route — no single obvious trace. */
  targets: { x: number; y: number }[]
  /** Solid pillars the beam dies against (also just maze dressing). */
  walls: { x: number; y: number }[]
  /** Prism tiles — a beam that enters SPLITS into the two perpendicular
   *  directions (both branches travel on, both can light lenses). Turns the
   *  single line into a branching tree so it can't be traced at a glance. */
  prisms?: { x: number; y: number }[]
  /** Rotatable mirror tiles. */
  mirrors: RaidMirrorTile[]
  /** "Par" — how many fires the player gets to light the lens. Burning them all
   *  without a hit resets the mirrors to their start (planning beats guessing).
   *  Omit for unlimited. */
  fireBudget?: number
}

export interface RaidPuzzle {
  /** Which puzzle engine renders this node. 'beacon' = Lights Out (default,
   *  back-compat for the existing smuggler's-chart node). 'cipher' = the
   *  coupled wax dials (turn one, its neighbours turn too; line every seal
   *  to the index at once). 'mirror' = the light-beam redirection grid. */
  kind?: 'beacon' | 'cipher' | 'mirror'
  /** beacon: grid columns. */
  cols?: number
  /** beacon: grid rows. */
  rows?: number
  /** beacon: random taps applied from the solved (all-lit) board to scramble it. */
  scrambleTaps?: number
  /** cipher: number of wax dials in the row. */
  dials?: number
  /** cipher: glyph positions per dial (the index is position 0). */
  positions?: number
  /** cipher: random turns applied from the aligned board to scramble it. */
  scrambleTurns?: number
  /** mirror: the light-beam grid layout. */
  mirror?: RaidMirrorPuzzle
  /** Nav XP granted on solve (no doubloons — this is a navigation discovery). */
  rewardNavXp: number
  /** Story payoff shown the moment the puzzle resolves: where the freight runs,
   *  i.e. the next place to head. Supports \n line breaks. */
  reveal?: string
}

// ── Bones (a d20 skill-check / risk-reward node) ─────────────────────────────
// A D&D-style throw: the player picks ONE approach, the server rolls a d20 and
// adds a small Navigation bonus, and the total vs the option's DC decides win or
// miss. One-time. Risk/reward is baked per option — a safe option always pays
// something, the bold one can cost the player coin on a miss. Server-rolled
// (rollDiceNode) so the throw can't be cheated.
export interface RaidDiceGrant {
  /** Doubloons moved. NEGATIVE = a loss (clamped so the purse can't go below 0). */
  doubloons?: number
  /** Navigation XP granted (never negative). */
  navXp?: number
}
export interface RaidDiceOption {
  /** Stable id stored in raid_node_progress.choices (which approach you took). */
  id: string
  label: string
  description: string
  /** Beat this on (d20 + Nav bonus) to succeed. */
  dc: number
  /** Doubloons you must hold to even attempt this option (the at-risk amount);
   *  the card locks below it so a broke captain can't risk nothing. */
  requiresDoubloons?: number
  win: RaidDiceGrant
  miss: RaidDiceGrant
  /** Flavor shown after the roll resolves. */
  winText: string
  missText: string
}
export interface RaidDice {
  /** Nav bonus to the d20 = min(maxBonus, floor(navLevel / bonusPerLevels)). */
  bonusPerLevels: number
  maxBonus: number
  options: RaidDiceOption[]
}

// ── Branching fork ───────────────────────────────────────────────────────────
// A `fork` node splits the chapter into two chosen routes. The player commits to
// ONE route (recorded in raid_node_progress.choices like an event/dice pick),
// which clears the fork and grants Nav XP. Downstream nodes on each route gate on
// that recorded choice so only the taken path opens (the other stays fogged).
// First new map structure since Ch2 — adds agency + replay.
export interface RaidForkRoute {
  /** Stable id stored in raid_node_progress.choices[forkNodeId]. Don't reuse. */
  id: string
  /** CTA / heading for the route. Short verb-led phrase. */
  label: string
  /** One-sentence card body: what this path is + what it leads through. */
  description: string
}
export interface RaidFork {
  /** Exactly two diverging routes. */
  routes: [RaidForkRoute, RaidForkRoute]
  /** Nav XP granted for committing to a route (same either way). */
  rewardNavXp: number
}

// ── DPS check ────────────────────────────────────────────────────────────────
// A `dps_check` node is a coin-or-skill gate. The player either PAYS `payCost`
// to skip it, or RUNS the check: a single cannon shot on a fast-sweeping aim bar
// (one shot, no crew abilities, crits count). The client only reports which aim
// zone it hit; the server rolls the shot from the player's real damage profile
// (ship + power + gear) and compares it to `threshold`. Meet it and you pass
// free; fall short and you owe `failCost`. Either outcome clears the node.
export interface RaidDpsCheck {
  /** Single-shot damage you must MEET OR BEAT to pass free. */
  threshold: number
  /** Doubloons to skip the check outright (the safe option). */
  payCost: number
  /** Doubloons owed if you take the shot and fall short of the threshold. */
  failCost: number
  /** Aim-needle speed multiplier for the one shot (1 = normal; higher = harder). */
  barSpeed: number
}

// ── Choice-gated payoff ──────────────────────────────────────────────────────
// A story-type node whose reward (and which scene plays) depends on a choice the
// player made at an EARLIER node. Used for the freed-scout payoff: if you cut the
// scouts loose back at cartographer_reveal, they sail back with intel + coin;
// if you didn't, you go in blind and empty. Granted by claimScoutDebt.
export interface RaidPayoff {
  /** The earlier node + choice id that unlocks the reward. */
  requiresChoice: { nodeId: string; choiceId: string }
  /** Granted only when the prior choice matches. */
  grant: RaidDiceGrant
  /** Scene played when the prior choice was NOT made (node.scene is the met one). */
  sceneUnmet: SceneLine[]
}

// ── Dialogue scenes ──────────────────────────────────────────────────────────
// Story beats play as tap-through dialogue scenes (visual-novel style)
// instead of prose walls — players read ten-word speech lines, they skip
// 150-word paragraphs. Each line is one tap. Narrator lines omit both
// speaker and portrait and render as italic log-style text; character
// lines show a portrait + name plate. `portrait` can also ride a
// narrator line for a reveal moment (e.g. Krust's face appearing the
// first time the fence says his name).
export interface SceneLine {
  /** Display name on the plate. Omit for narrator lines. */
  speaker?: string
  /** Portrait image path. Falls back to none (text-only line). */
  portrait?: string
  text: string
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
  /** Story nodes with a dialogue scene: 1-2 sentence recap shown in the
   *  sheet once the node is read, instead of the full prose transcript
   *  (the scene is the delivery and is replayable via Read Again, so
   *  the sheet only needs the takeaway). */
  summary?: string
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
  /** Event nodes: branching decision beats with N outcomes (loot /
   *  release / take logs etc). The chosen choice id is persisted in
   *  raid_node_progress.choices so the sheet can mark it on revisit. */
  event?: { choices: RaidEventChoice[] }
  /** Soft-disable a node while its content is still being designed.
   *  Treated as permanently locked in computeRaidMap (reason: "Coming
   *  soon"), AND the chapter's main-path-cleared check skips coming-
   *  soon nodes so a still-cooking node at the chapter's tail doesn't
   *  pretend to gate progression that doesn't exist yet. Server-side
   *  every action that mutates the node refuses with "Coming soon" so
   *  a hand-crafted client request can't sneak through. */
  comingSoon?: boolean
  /** class_pick node: one-time chapter-end ship-class pick. The
   *  chapterId is the RAID_CHAPTERS.id this pick contributes to (so
   *  the picker writes into profiles.ship_classes[chapterId]). */
  classPick?: { chapterId: string }
  /** puzzle: the beacon-chain (Lights Out) or cipher dials. Solving clears it. */
  puzzle?: RaidPuzzle
  /** dice: a d20 skill-check / risk-reward throw. Picking + rolling clears it. */
  dice?: RaidDice
  /** fork: a two-route branch. Picking a route records the choice + clears it. */
  fork?: RaidFork
  /** dps_check: a coin-or-skill gate (pay to skip, or one aim-bar shot). */
  dpsCheck?: RaidDpsCheck
  /** story-type payoff gated on an earlier choice (the freed-scout debt). */
  payoff?: RaidPayoff
  /** In-review gate: hide + hard-block this node for non-admins. Filtered out
   *  of the map view for non-admins (so the chain just ends before it) and
   *  refused by every server action. Drop the flag to launch the node. */
  adminOnly?: boolean
  /** Marks this node as a side branch hanging off another node, NOT part of
   *  the main story chain. Used by challenge-mode raids: the challenge node
   *  sits beside its parent on the map (shared row, opposite column),
   *  draws a short connector to the parent instead of taking its own
   *  zigzag slot, and renders smaller + with the challenge glyph. The main
   *  chain skips it entirely when drawing the route line. */
  sideBranch?: { parentId: string }
  /** Tap-through dialogue scene. On story nodes the Continue CTA plays
   *  it and the final tap marks the node read. On milestone/event nodes
   *  it's an INTRO cutscene: the sheet gates the interactive bits (pay
   *  bar / choice cards) behind a first watch, and the node's own
   *  claim/choice action stays the clear — the scene itself never
   *  writes to the server. When present, the sheet shows flavor as the
   *  pre-watch teaser and detail.summary once cleared; the prose
   *  description becomes archive/fallback text. Cleared nodes offer a
   *  replay. */
  scene?: SceneLine[]
  /** Rich detail surfaced in the tap-to-open sheet. */
  detail: RaidNodeDetail
}

// Ship-skin loot previews recolour this ship sprite (the tier-4 brigantine) so
// players see the skin on an actual hull rather than a flat colour chip.
const SHIP_SKIN_PREVIEW_IMG = '/models/brigantine_v2.png'

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
        // Most skins recolour via a bespoke sprite (imageByTier), not a CSS
        // filter — preview that sprite (the recoloured brigantine) so the drop
        // shows the skin's real look, not the base hull. Filter-only skins fall
        // back to the base preview image + their filter.
        drop.image = skin.imageByTier?.[4] ?? SHIP_SKIN_PREVIEW_IMG
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
    subtitle:   'A coast full of pirates, and a thread that runs to somewhere bigger.',
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
    subtitle:   "The shadow you've been pulling at finally has a name.",
    // finndicate_notice → smugglers_chart → last_cache → cartographer_reveal →
    // cartographer → (the Gullet run) gullet_heading → gullet_cipher →
    // gullet_bones → gullet_cache → scout_debt → gullet_raid → chapter_2_class.
    // gullet_raid (Tollmaster Spet) is LIVE; chapter_2_class is the real tail
    // gate, so the chapter reads "cleared" once Spet is down and the player
    // picks a class. Chapter III starts with a new entry.
    lastNodeId: 'chapter_2_class',
  },
  {
    id:         'the_coffers',
    number:     3,
    romanNumeral: 'III',
    title:      'The Coffers',
    subtitle:   'Follow the coin to its vault, and learn who you have been buying from.',
    // coffers_heading → coffers_fork → coffers_fleet (Raid 5, comingSoon) →
    // quartermaster_turn (the Cache betrayal) → the_quartermaster (Raid 6,
    // comingSoon) → finleone_named (names Don Finleone) → chapter_3_class.
    // ADMIN-ONLY until tested (every node carries adminOnly: true); the two
    // raids are comingSoon stubs until their configs land in step 3.
    lastNodeId: 'chapter_3_class',
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
    flavor: "Barnacle Pete plays the broke old fool. Truth is he's robbed the small and the slow for years, and none of it ever sticks to him.",
    bridge: "Pull any thread and it runs back to one reef, where Pete's little fish do his collecting for him.",
    image: '/raidlog.png',
    scene: [
      { text: "Barnacle Pete robs the small and the slow. Has done for years, all up and down this coast." },
      { text: "Little crews. Fishing folk. The odd unlucky angler. Anyone too small to swing back." },
      { speaker: 'A Passing Sailor', text: "Pete don't spend his haul. He delivers it." },
      { text: "Said once, by a sailor who knew better than to say it twice." },
      { text: "Here's the funny part. Pete steals a fortune and keeps about a copper. The rest sails off to someone he'd rather you never asked about." },
      { text: "So nobody asks." },
      { text: "You, though, you've got a boat, a free afternoon, and no manners worth mentioning." },
      { speaker: 'Barnacle Pete', portrait: CORSAIRS_RECKONING.enemies.pete.portrait, text: "Broke, me? Couldn't rob a rockpool. Now mind yer business, guppy." },
      { text: "Go shake the loudest pirate on the water and see what falls out of his coat." },
    ],
    detail: {
      description:
        "Pete's no broke old chancer. He's good at exactly one thing: picking on anyone too small to swing back. Little crews, fishing folk, the odd unlucky angler. Years of it up and down this coast, and somehow he's not a coin richer for it.\n\nThat's the funny part. Pete steals a fortune and keeps about a copper. The rest sails off to someone he'd rather you never asked about, so nobody asks. You've got a boat, a free afternoon, and no manners worth mentioning. Go shake the loudest pirate on the water and see what falls out of his coat.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment I",
          sublabel: "\"Pete don't spend his haul. He delivers it.\" Said once, by a sailor who knew better than to say it twice.",
          rarity: 'common',
        },
      ],
      dropsNote: 'Pages like this pile up the more you go poking around. Sooner or later they spell out a name.',
      ctaLabel: 'Pull the Thread →',
      summary: "Pete robs the small and keeps none of it. Every haul gets handed off somewhere else, and you mean to shake him till the where falls out.",
    },
  },
  {
    id: 'skirmish',
    type: 'skirmish',
    label: 'Reef Skirmish',
    flavor: "Pete keeps his own hands clean and his Reef Raiders busy. Time to start putting them on the seabed.",
    bridge: "Thin out his Raiders and you thin out his nerve. Sink enough and the old corsair rows out himself to see who's been counting.",
    requiresNode: 'intro',
    route: '/raids/practice',
    image: CORSAIRS_RECKONING.enemies.brute.portrait,
    detail: {
      description:
        "Pete's not the type to do his own swinging. That's what the Reef Raiders are for, and the reef's crawling with them. Sink one and another bobs up grinning to take the empty seat.\n\nNo grand plan out here. Pick them off, one soggy thug at a time, and wait to see who comes asking once too many of them stop rowing home.",
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
    flavor: "Barnacle Pete and his fleet have surfaced off the coast. Go collect what's owed, dead or alive.",
    bridge: "Pete goes down hard and his strongbox spills more than coin. Ledgers. A sealed letter. Turns out the loudest pirate on the water is just somebody else's errand boy.",
    requiresNode: 'skirmish',
    route: '/raids',
    raidId: CORSAIRS_RECKONING.raidId,
    image: CORSAIRS_RECKONING.enemies.pete.portrait,
    detail: {
      description:
        "Pete's whole campaign in one sitting: four ship battles back to back, each one nastier than the last, no time to bail the bilge between them, and the old corsair waiting at the end. Win the run and his loot crate finally cracks open. It's the only place his contraband ever sees the sun.",
      enemies: ['Reef Raider ×2', "Crow's Nest Marksman", 'Saltwater Corsair', 'Barnacle Pete'],
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
    flavor: "Pete sails out again, meaner this time, with the kind of crew that doesn't lose twice.",
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
        "Same six ship battles, same old corsair at the end, but every hull he's put back on the water is a step harder than the last. The Raiders hit cleaner, the Marksman aims truer, and Pete fights like a captain who's finally noticed you're still here. Crack his crate this time and the contraband runs richer for it.",
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
    flavor: "Pete's books all point the same way and name the Finndicate. One sealed letter points further still, at somebody else.",
    bridge: "The letter's heading runs straight through the Bilge Strait. Want C.K.'s cargo? First you slip past the thugs who own that water.",
    requiresNode: 'pete',
    image: '/raidlog.png',
    scene: [
      { text: "Pete's strongbox cracks open at last. No fortune inside. Only paperwork." },
      { text: "Cut sheets. Courier routes. Years of neat little sums." },
      { text: "And one word stamped on every page: the Finndicate." },
      { speaker: 'Barnacle Pete', portrait: CORSAIRS_RECKONING.enemies.pete.portrait, text: "You think I keep the coin? Not a copper of it stays with me. Never has." },
      { text: "So much for the kingpin. Pete was a cash cow like all the rest, squeezed dry and tossed back same as everyone he ever robbed." },
      { text: "And the coin never sits still. Page after page, every haul buys the same thing over and over, and not one line says what." },
      { text: "Under the ledgers there's a sealed letter. No name on it. Just two letters pressed into the wax: C.K." },
      { text: "The route's mostly burned away, but the heading held. Out past the Bilge Strait, into the cold." },
      { text: "Whoever C.K. is, the Finndicate trusts them with cargo by the holdful. And now you know which way it sails." },
    ],
    detail: {
      description:
        "Pete's strongbox wasn't empty, just full of the wrong captain's paperwork. Cut sheets, courier routes, years of neat little sums, and one word stamped on every page: the Finndicate. So much for the kingpin. Pete was a cash cow like all the rest, squeezed dry and tossed back same as everyone he ever robbed. And the coin never sits still. Page after page, every haul buys the same thing over and over, and not one line says what.\n\nUnder the ledgers there's a sealed letter. No name on it, just two letters pressed into the wax: C.K. The manifest's heavy and the route's mostly burned away, but the heading held. It runs out past the Bilge Strait, into the cold. Whoever C.K. is, the Finndicate trusts them with cargo by the holdful, and now you know which way it sails.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment II",
          sublabel: "\"The Finndicate doesn't lose captains. It loses ledgers.\" Scratched into the underside of the strongbox lid.",
          rarity: 'uncommon',
        },
        {
          emoji: '✉️',
          label: 'Sealed Shipment Letter',
          sublabel: "Addressed to \"C.K.\" and nobody else. A heavy manifest, bound past the Bilge Strait.",
          rarity: 'rare',
        },
      ],
      dropsNote: 'A name to chase (the Finndicate) and a lead to follow (C.K., and the way the cargo runs). Both run straight through the Bilge Strait.',
      ctaLabel: 'Follow the Trail →',
      summary: "Pete's strongbox held no fortune, just ledgers naming the Finndicate and a sealed letter marked C.K., with a heading out past the Bilge Strait into the cold.",
    },
  },
  {
    id: 'bilge_milestone',
    type: 'milestone',
    label: 'The Bilge Eels',
    flavor: "Neutral thugs who own the Bilge Strait. No flag, no loyalty, just a toll, and C.K.'s cargo sails right through their water.",
    bridge: "Past the strait the water turns Finndicate. C.K.'s moving cargo somewhere ahead, and a fence up there already knows your name.",
    requiresNode: 'syndicate',
    requiresNavLevel: 10,
    milestone: { amount: 1000, spend: true },
    image: '/bilge_eel.png',
    scene: [
      { text: "The letter left no address. Just a heading: out past the Bilge Strait, into the cold." },
      { text: "And the strait, lucky you, belongs to the Bilge Eels." },
      { speaker: 'A Bilge Eel', portrait: '/bilge_eel.png', text: "Far enough, captain. This water runs chain to chain, and the chain is ours." },
      { speaker: 'A Bilge Eel', portrait: '/bilge_eel.png', text: "No flag means a thing to us. Not the Finndicate, not the navy, and definitely not you." },
      { text: "They bow to nobody. They just squat on the only water that points where C.K.'s cargo went." },
      { speaker: 'A Bilge Eel', portrait: '/bilge_eel.png', text: "Heavy freight crossed here, aye. Cold heading, sealed manifest. We watched it go." },
      { speaker: 'A Bilge Eel', portrait: '/bilge_eel.png', text: "A thousand doubloons buys the crossing. And we forget your sail was ever here." },
      { text: "No bulling through at your size, and they only deal with captains who've logged real sea." },
      { text: "Pay up and the way opens onto C.K.'s trail. Keep your purse shut and the trail goes cold as the water." },
    ],
    detail: {
      description:
        "The letter left no address, just a heading: out past the Bilge Strait, into the cold. That's enough to follow, and lucky you, the whole stretch belongs to the Bilge Eels.\n\nThey bow to nobody. Not the Finndicate, not you, just a knot of thugs squatting on the only water that points where C.K.'s cargo went, charging good coin to cross it. No bulling through at your size. They'll only deal with a captain who's logged enough sea to be worth the breath (Navigation 10), and even then they want paying. Slip them 1,000 ⟡ and the way opens onto C.K.'s trail. Keep your purse shut and the trail goes cold as the water.",
      drops: [
        { emoji: '🗺️', label: "The trail toward C.K.", sublabel: "Passage through the strait, hard on C.K.'s heading.", rarity: 'uncommon' },
      ],
      dropsNote: 'A one-time bribe. The 1,000 ⟡ is spent for good, not held or refunded.',
      ctaLabel: 'Hail the Strait →',
      summary: "The Bilge Eels own the only crossing on C.K.'s heading and answer to no flag. A thousand doubloons bought passage, and the trail through the cold water stayed warm.",
    },
  },
  {
    id: 'quartermaster',
    type: 'shop',
    label: "Quartermaster's Cache",
    flavor: 'Past the strait, a fence lays out two bits of contraband and lets you walk off with exactly one.',
    bridge: "The fence sells a lot less than he lets on. The cold water ahead answers to one captain, and the wax on Pete's letter finally has a name behind it.",
    requiresNode: 'bilge_milestone',
    choice: { items: ['quartermasters_anchor', 'navigators_compass'] },
    detail: {
      description:
        "The fence on the far shore of the Bilge Strait doesn't haggle and doesn't repeat himself. He sets two bits of contraband on the barrel between you, the sort that doesn't wash up twice, and tells you to pick. One. The other slides back into the cache and out of your life for good.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout with the rest of your kit.",
      dropsNote: 'Pick one. Permanent, equippable, and you can\'t come back for the other.',
    },
  },
  {
    id: 'krust_reveal',
    type: 'story',
    label: 'The Name on the Wax',
    flavor: 'Two letters in a blot of wax. The fence on the cold side of the strait can read you the rest.',
    bridge: "Captain Krust. He runs the Finndicate's freight, and every hold he fills is a hold you can empty. His consignment's out on the water right now.",
    requiresNode: 'quartermaster',
    image: '/raidlog.png',
    scene: [
      { text: "Pete's wax only ever coughed up two letters: C.K." },
      { text: "The fence on the cold side of the strait can fill in the rest. Long as you act like he did you no favour by it." },
      { speaker: 'The Fence', text: "Captain Krust. And you never heard it here." },
      { speaker: 'The Fence', portrait: CAPTAIN_KRUST.enemies.krust.portrait, text: "Old, leathery, and the Finndicate sets its clock by him. He moves their freight. All of it." },
      { speaker: 'The Fence', portrait: CAPTAIN_KRUST.enemies.krust.portrait, text: "Never once asked whose name's on a manifest. Stayed afloat a whole lifetime for exactly that reason." },
      { text: "Nothing like Pete, this one. He doesn't rob the small. He moves cargo, on time, in bulk." },
      { speaker: 'The Fence', text: "No kingpin, mind. Krust answers upward, same as every other fish in this sea." },
      { speaker: 'The Fence', text: "But C.K. don't lose cargo. Lose his cargo, and you find out why." },
      { text: "A name at last. The Finndicate's freight has a face, and the face keeps a schedule." },
      { text: "His consignment's on the cold water right now." },
    ],
    detail: {
      description:
        "Pete's wax only ever coughed up two letters: C.K. The fence past the strait fills in the rest, long as you act like he did you no favour by it.\n\nCaptain Krust. An old, leathery hand the Finndicate trusts with its freight, the kind who's never once asked whose name's on a manifest and has stayed afloat a whole lifetime for exactly that reason. He's nothing like Pete. He doesn't rob the small. He moves cargo, on time, in bulk, and the Finndicate sets its clock by him. Still no kingpin, mind. He answers upward like every other fish in this sea. But he sits a long way above a barnacled chancer, and his consignment's on the cold water right now.",
      drops: [
        {
          emoji: '📜',
          label: "Captain's Logbook, Fragment III",
          sublabel: "\"C.K. don't lose cargo. Lose his cargo and you find out why.\" Said by the fence, who wouldn't give his name either.",
          rarity: 'rare',
        },
      ],
      dropsNote: 'A name at last. The Finndicate\'s freight has a face, and the face keeps a schedule.',
      ctaLabel: 'Name the Devil →',
      summary: "The fence put a name to the wax: Captain Krust, the old hand the Finndicate trusts with all its freight. No kingpin, but his consignment's on the cold water right now.",
    },
  },
  {
    id: 'krust',
    type: 'raid',
    label: "Krust's Consignment",
    flavor: "Captain Krust's freight runs the cold water past the Bilge Strait. Sink the consignment and the Finndicate feels every lost crate.",
    bridge: "Krust goes down and his manifest goes over the side with him. No kingpin either, this one. Right to the end he kept muttering that someone above him would want it all back.",
    requiresNode: 'krust_reveal',
    requiresNavLevel: 20,
    route: '/raids/krust',
    raidId: CAPTAIN_KRUST.raidId,
    image: CAPTAIN_KRUST.enemies.krust.portrait,
    detail: {
      description:
        "Krust's full run in one go: six ship battles through his consignment crew, each heavier than the last, no breather anywhere in it, and the old captain waiting at the end on his iron-sided carrack. Every hull in this crew is crustacean, all shell and spite, so a slice of your fire just glances off them, and Krust shrugs off more still. Sink the lot and his loot crate splits open, the only place his contraband ever drops. Nothing Pete's reef threw at you sailed half this hard.",
      enemies: ['Bilge Runner ×2', 'Brine Deckhand ×2', 'Hull Breaker', 'Krust Overseer', 'Captain Krust'],
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
    flavor: "Krust patched the iron hull, drilled the crew, and put the consignment back on the cold water. He doesn't lose cargo twice.",
    requiresNode: 'krust',
    route: '/raids/krust/challenge',
    raidId: CAPTAIN_KRUST_CHALLENGE.raidId,
    sideBranch: { parentId: 'krust' },
    // Same boss portrait as the parent raid. See pete_challenge for design.
    image: CAPTAIN_KRUST.enemies.krust.portrait,
    detail: {
      description:
        "Krust's full consignment again, harder for the loss. The Carapace runs thicker, the volleys land cleaner, and every hand on his deck has had a long, cold look at the captain who already sank them once. Crack the crate this run and the contraband rolls deeper than any of his first manifests ever paid.",
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
    flavor: "Two captains on the seabed and your name on every wanted board from here to the danger lines. Time to decide what kind of captain you want to be.",
    requiresNode: 'krust',
    classPick: { chapterId: 'thread' },
    detail: {
      description:
        "You sank Pete. You sank Krust. The coast knows your sails now, and the next stretch of water won't be kind. Stand on your deck and pick a class. Once it's chosen it stays with you for every raid from here on.",
      ctaLabel: 'Pick a class',
    },
  },
  {
    id: 'finndicate_notice',
    type: 'story',
    label: 'The Finndicate Takes Notice',
    flavor: "Krust's on the seabed, and for the first time the Finndicate feels the hole you've torn in its side.",
    bridge: "They run a special class of freight through water they'll only call the danger zones. Whatever it is, it's worth more to them than the ships it keeps eating.",
    requiresNode: 'krust',
    image: '/raidlog.png',
    scene: [
      { text: "Krust was no small cog, and the gap he leaves shows plain in the books." },
      { text: "Somewhere well above the freight desk, somebody sets down the ledgers." },
      { text: "And takes a long, cold look at the captain who keeps sinking their cargo." },
      { text: "You've got the Finndicate's full attention now. Which is the one prize you can't hand back." },
      { text: "A single scrap rode out the wreck of Krust's run." },
      { speaker: 'A Finndicate Order', text: "Danger-zone consignment. Priority freight. It will not open for him. Find the hands that it will." },
      { text: "Stamped with a mark no clerk would explain." },
      { text: "Priority freight, steered through water their own manifests will only call the danger zones. Most captains sail in there exactly once." },
      { text: "Whatever they're hauling through it is worth every hull it swallows." },
      { text: "They'd love nothing more than for you to drop the thread and walk away. You won't." },
    ],
    detail: {
      description:
        "Krust was no small cog, and the gap he leaves shows plain in the books. For the first time someone well above the freight desk has set down the ledgers and taken a long, cold look at the captain who keeps sinking their cargo. You've got the Finndicate's full attention now, which is the one prize you can't hand back.\n\nA single scrap rode out the wreck of Krust's run. The Finndicate moves a special class of cargo, priority freight steered through water its own manifests will only call the danger zones. Most captains sail in there exactly once. Whatever they're hauling through it is worth every hull it swallows, and they'd love nothing more than for you to drop the thread and walk away.",
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
      summary: "Krust's fall bought you the Finndicate's full attention. They run priority freight through water they only call the danger zones, and the trail leads straight in.",
    },
  },
  {
    id: 'smugglers_chart',
    type: 'puzzle',
    label: "The Smuggler's Chart",
    flavor: "Krust's cabin gave up the freight network map: every drop along the coast strung onto a single chain of signal beacons. Light the whole chain and it shows where it all ships to.",
    bridge: "The beacons catch all at once, and every lane on the map bends to a single point far past the danger line. That's where the freight ends up, and that's where you're headed.",
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
        "The beacons hold, the whole chain steady at last, and the map gives up its secret. Every freight lane bends to one place, far past the danger line where the charts just stop.\n\nYou've got the heading now. That's where the Finndicate funnels all of it, and that's where you sail next.",
    },
    detail: {
      description:
        "Krust was no kingpin, just a captain who ran cargo, and the Finndicate keeps its captains roped to each other. His cabin gave up the network map: a chain of signal beacons, each drop wired to the next, lit only on the nights the freight runs.\n\nThe chain's rigged against prying eyes. Light one beacon and the lanterns either side of it flare or gutter, so no single light ever gives the shape away. Get them all burning at once and the network shows itself, headings and all, the kind nobody was ever meant to read.",
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
    flavor: 'A driftwood outfit clinging to a rock just inside the danger line. Two bits of kit on the counter, take one, leave the other for good.',
    requiresNode: 'smugglers_chart',
    choice: { items: ['gunners_sight', 'reinforced_hull'] },
    detail: {
      description:
        "Past the beacon chain the chart shows another drop point, a driftwood shack hammered to a rock just inside the danger line. The keeper's worked this water longer than most and runs the same trick every fence past the strait pulls: two bits of kit on the counter, take one, leave the other for good. The freight runs deeper than any honest captain has charts for, and there'll be more outfits like this one along the way.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout with the rest of your kit.",
      dropsNote: 'Pick one. Permanent, equippable, and you can\'t come back for the other.',
    },
  },
  {
    // Chapter II's scout-encounter event beat. One-time, branching
    // choice with three outcomes (loot doubloons / cut them loose /
    // take their navigator's logs for Nav XP). The scouts refuse to
    // name their captain; the player only SUSPECTS Finndicate from
    // the cargo + the cut of the ship — keeps the one-noun-per-story-
    // node cadence (no new name revealed here; that lands later in
    // Raid 3's pre-fight). Gated at Nav 25 to match the "past the
    // danger line" framing. Node id stays `cartographer_reveal` so
    // anyone who'd already cleared the prior story version keeps
    // their persisted state; only the player-facing copy + type +
    // mechanics change.
    id: 'cartographer_reveal',
    type: 'event',
    label: "The Charts That Don't Exist",
    flavor: "Two scout cutters running the water ahead of you. No flag, and neither one's anything like a freight ship. You catch them clean.",
    bridge: "The scouts sail off, one way or another, and word of your name runs through the cold water faster than any chart of yours could chase it.",
    requiresNode: 'last_cache',
    requiresNavLevel: 25,
    // Mercy path ("release") currently pays no immediate outcome; its
    // delayed payoff is wired in later content. The choice copy hints
    // at it ("the cold water remembers") so players sense the cost is
    // not zero, but no mechanic backs it yet — wire when ready.
    image: '/krust_soldier.png',
    scene: [
      { text: "Two cutters running tight together. No flag flying, and neither one built to carry freight." },
      { text: "They were sounding the water ahead of you. The same water the smuggler's chart points past." },
      { text: "You catch them clean." },
      { speaker: 'A Caught Scout', portrait: '/krust_soldier.png', text: "Take what you came for, captain. You'll get no name off this deck." },
      { text: "They won't even lie about who they sail for. They just go quiet and watch the deck, like sailors who know what telling earns them." },
      { text: "You don't need them to say it. The cargo in the hold says it. The cut of the ships says it." },
      { text: "The Finndicate has scouts on this water. And scouts carry headings worth more than coin." },
      { speaker: 'A Caught Scout', portrait: '/krust_soldier.png', text: "Whatever you do, do it quick. This water doesn't stay empty long." },
      { text: "The choice is yours, captain. Pick once, and only once." },
    ],
    event: {
      choices: [
        {
          id: 'loot',
          label: 'Sack the hold',
          description: "Take the coin in their strongbox and send the empty hulls home. Word goes round the docks that you run poor on principle and rich on plunder.",
          outcome: { type: 'doubloons', amount: 1200 },
        },
        {
          id: 'release',
          label: 'Cut them loose',
          description: "Send them back untouched, no message. A captain who keeps to the high water looks after his own, and sometimes that earns him a sail in his lee when he needs one. The cold water has a long memory.",
          outcome: { type: 'none' },
        },
        {
          id: 'logs',
          label: "Take the navigator's logs",
          description: "Leave the coin, take the charts. The marks on them sharpen every heading you sail from here on, even the ones you can't read yet.",
          outcome: { type: 'navXp', amount: 750 },
        },
      ],
    },
    detail: {
      description:
        "Two cutters running tight together, no flag flying and neither one a freight ship. They were sounding the water ahead of you, no question, the same water the smuggler's chart pointed past. You catch them clean.\n\nThe scouts won't tell you who they sail for. They won't even lie about it. They just go quiet and watch the deck like sailors who've run cargo long enough to know what telling earns them. You don't need them to. The cargo in the hold and the cut of the ships makes it plain enough. The Finndicate has scouts on this water, and the scouts have a heading you'd dearly love to read.\n\nThe choice is yours, captain. Pick once, and only once.",
      dropsNote: 'One-time event. Pick your option and you sail on. The water past this point answers to a captain you haven\'t met yet.',
      ctaLabel: 'Board the Cutters →',
      summary: "Two Finndicate scout cutters, caught clean past the danger line. They never gave a name, but the cargo and the cut of the ships said plenty. You made your call and sailed on.",
    },
  },
  {
    // Chapter II's boss raid. The Cartographer's full data + engine
    // (Mist Veil crew, Riposte signature, Tides, Astrolabe drops,
    // challenge variant) are wired and tested. Live as of 2026-06-06
    // once portrait art landed in the enemy-arts bucket.
    id: 'cartographer',
    type: 'raid',
    label: "The Cartographer's Survey",
    flavor: "Past the Finndicate scouts the water turns to grey wall. The galleon waiting in the fog drew every chart Krust ever followed. Sink him and the Finndicate loses its eyes.",
    bridge: "His ship goes down with no flag and no name on the hull. The seas he drew belong to nobody now, and the charts in his cabin name half the danger lines you haven't sailed yet.",
    requiresNode: 'cartographer_reveal',
    requiresNavLevel: 28,
    route: '/raids/cartographer',
    raidId: THE_CARTOGRAPHER.raidId,
    image: THE_CARTOGRAPHER.enemies.cartographer.portrait,
    detail: {
      description:
        "The Finndicate's chartmaker rides a slow-built galleon under the fog past the danger line, and every freight lane Krust ever ran, he drew first. His crew sails the Sounding Fog for cover, so every aim through it lands a half-read short. And he counters a dodge with a brass-bound parry few captains see coming twice. Cut his hull and the chart line goes down with him.",
      enemies: ['Drift Scout ×2', 'Sounding Hand ×2', 'Wakebreaker ×2', 'The Surveyor ×2', 'The Cartographer'],
      drops: lootDrops(THE_CARTOGRAPHER.loot),
      clearReward: clearPayout(THE_CARTOGRAPHER),
      dropsNote: 'One crate per Cartographer clear, rolled once and scaled by your Fortune. Every kill along the way pays gold + Nav XP, and the run carries two Tide events between fights — read them and choose.',
    },
  },
  {
    // Challenge variant of The Cartographer. Same scaling rules as
    // Pete + Krust challenge nodes. No phase 2 — Riposte is already
    // a second mechanic layer on top of crew-wide Mist Veil; stacking
    // a third would over-pack the fight.
    id: 'cartographer_challenge',
    type: 'raid',
    label: "Challenge: The Cartographer's Survey",
    flavor: "The chartmaker put a fresh hull under the fog and a tighter watch on the line. He doesn't lose seas twice.",
    requiresNode: 'cartographer',
    route: '/raids/cartographer/challenge',
    raidId: THE_CARTOGRAPHER_CHALLENGE.raidId,
    sideBranch: { parentId: 'cartographer' },
    image: THE_CARTOGRAPHER.enemies.cartographer.portrait,
    detail: {
      description:
        "The same chart line again, sharper for the loss. The fog runs heavier, the Surveyor reads the water cleaner, and the Cartographer counters every dodge like a captain who's already seen this fight once. Crack his cabin this run and his own astrolabe rolls at twice the rate.",
      enemies: ['Drift Scout ×2', 'Sounding Hand ×2', 'Wakebreaker ×2', 'The Surveyor ×2', 'The Cartographer'],
      drops: lootDrops(THE_CARTOGRAPHER_CHALLENGE.loot),
      clearReward: clearPayout(THE_CARTOGRAPHER_CHALLENGE),
      dropsNote: 'Every kill pays more, the clear bonus is steeper, and the legendary Captain\'s Astrolabe rolls at double the normal rate.',
    },
  },
  // ── Chapter II continues: the run on the Gullet (LIVE 2026-06-16) ────────
  {
    id: 'gullet_heading',    type: 'story',
    label: 'The Throat of the Sea',
    flavor: "The Cartographer's charts and Krust's beacon map finally agree on one point of water, and the crews out here have a name for it they don't say twice.",
    bridge: "You've got the name now: the Gullet, where the sea swallows everything down. The only way in runs through a channel sealed behind a Finndicate cipher.",
    requiresNode: 'cartographer',
    image: '/raidlog.png',
    scene: [
      { text: "The Cartographer's charts and Krust's beacon map finally point the same way." },
      { text: "Every freight lane you've chased bends to one spot, far past the danger line." },
      { text: "The old charts leave it blank. No depth, no name. Only a warning." },
      { text: "The crews out here have a name for it, though. They don't say it twice." },
      { text: "The Gullet. Where the sea swallows everything down." },
      { text: "Whatever the Finndicate takes off the weak, it all ends up down there. And so do you." },
    ],
    detail: {
      description:
        "The Cartographer's charts and Krust's beacon map finally agree: every freight lane bends to one drowned anchorage far past the danger line, the place the old charts leave blank with only a warning. The crews call it the Gullet, and they don't say it twice. Whatever the Finndicate takes off the weak gets swallowed down there, and that's exactly where you're bound.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment VI", sublabel: "\"Nothing the Finndicate takes ever gets spent. It just gets swallowed.\"", rarity: 'uncommon' },
      ],
      dropsNote: 'A place with a name at last, and a heading right down its throat.',
      ctaLabel: 'Read the Charts →',
      summary: "The charts agree at last: every freight lane ends at the Gullet, a drowned anchorage past the danger line where the Finndicate swallows all it takes. You set a heading down its throat.",
    },
  },
  {
    id: 'gullet_cipher',    type: 'puzzle',
    label: 'The Wax Cipher',
    flavor: "The mouth of the Gullet drowns any ship that reads the channel wrong. The only safe way in is sealed inside a Finndicate manifest, locked behind a row of wax cipher dials.",
    bridge: "The seals line up, the manifest cracks, and the safe channel through the Gullet's teeth opens off your bow.",
    requiresNode: 'gullet_heading',
    puzzle: {
      kind: 'cipher',
      dials: 5,
      positions: 3,
      scrambleTurns: 9,
      rewardNavXp: 600,
      reveal:
        "The seals line up and the manifest cracks open. There's a thin lane of deep water through a throat of reef that'd gut any ship that guessed.\n\nYou've got the safe way into the Gullet now. Sail it.",
    },
    detail: {
      description:
        "The Finndicate seals its headings behind wax cipher dials, rigged so no single turn ever gives the code away: turn one dial and the dials beside it turn with it. Line every seal to the brass index at once and the manifest reads true, the safe channel and all.",
      drops: [
        { emoji: '🧭', label: '600 Nav XP', sublabel: 'Cracking the manifest sharpens your navigation. No coin in it, just the safe heading.', rarity: 'rare' },
      ],
      dropsNote: 'Turn the dials to line every seal to the index at once. Each turn also nudges the dials beside it. One-time, no cost, no fight.',
    },
  },
  {
    id: 'gullet_bones',    type: 'dice',
    label: 'A Throw of the Bones',
    flavor: "A Finndicate freighter, half-swallowed and snagged on the reef, hold split open and bleeding cargo into the dark. How you plunder her is down to the bones.",
    bridge: "The wreck slides off the reef behind you, picked over for whatever your throw was worth, and the deep harbor opens up ahead.",
    requiresNode: 'gullet_cipher',
    image: '/raidlog.png',
    scene: [
      { text: "Deep in the Gullet's throat, a Finndicate freighter hangs snagged on the reef, half-swallowed already." },
      { text: "Her hold's split wide, cargo bleeding out into the dark, and the whole wreck's one bad lurch from sliding off for good." },
      { text: "No time to be careful. Pick your play and roll the bones." },
    ],
    dice: {
      bonusPerLevels: 10,
      maxBonus: 4,
      options: [
        {
          id: 'skim',
          label: 'Skim the spill',
          description: "Grab the cargo already loose in the water. Easy pickings, nothing fancy.",
          dc: 8,
          win: { doubloons: 800 },
          miss: { doubloons: 250 },
          winText: "Clean grab. Your hold's heavier and the wreck never even shifts.",
          missText: "The current fights you the whole way, but you come up with a fistful anyway.",
        },
        {
          id: 'manifests',
          label: 'Pull the manifests',
          description: "Leave the coin, dive for the freight charts. They're worth more than what's in the hold.",
          dc: 12,
          win: { navXp: 600, doubloons: 200 },
          miss: { navXp: 150 },
          winText: "You surface with the captain's charts dry and readable. Out here that's worth more than coin.",
          missText: "Half the charts are pulp by the time you reach air. A few marks survive.",
        },
        {
          id: 'strongroom',
          label: 'Crack the strongroom',
          description: "Force the captain's strongroom before the wreck slides. All of it, or none of it.",
          dc: 16,
          requiresDoubloons: 400,
          win: { doubloons: 2500, navXp: 400 },
          miss: { doubloons: -400 },
          winText: "The strongroom gives all at once. You haul up more than the rest of the wreck put together.",
          missText: "The wreck lurches off the reef and drags your grapples down with it. You cut loose with nothing but a lighter purse.",
        },
      ],
    },
    detail: {
      description:
        "A Finndicate freighter, snagged on the reef and half-swallowed, hold cracked wide and spilling cargo into the dark. She's one bad lurch from sliding off for good, so there's no being careful about it. Pick how you plunder her and throw the bones: a d20 plus a little of your Navigation, beat the mark to pull it off. Skim what's loose for easy coin, dive for the charts, or force the strongroom for everything she's got, knowing a bad throw on that one costs you.",
      dropsNote: 'Pick one approach and roll once. The safe play always pays something; forcing the strongroom can cost you doubloons on a miss, and only opens to a captain who can cover the loss.',
      ctaLabel: 'Throw the Bones →',
      summary: "A half-sunk Finndicate freighter, plundered on a single throw of the bones. You made your play, the dice fell, and the wreck slid off the reef behind you.",
    },
  },
  {
    id: 'gullet_cache',    type: 'shop',
    label: 'The Sunken Cache',
    flavor: "A fence working a shelf of gear deep inside the Gullet, way too well-stocked for water this far out. Two pieces on the counter, take one, leave the other.",
    bridge: "The keeper knew your name before you gave it. You take your pick and try not to wonder too hard who told him you were coming.",
    requiresNode: 'gullet_bones',
    choice: { items: ['incendiary_cannonball', 'frozen_cannonball'] },
    detail: {
      description:
        "Deep in the Gullet, where no honest captain has charts, there's a fence working a shelf of gear that's far too well-stocked for water this far out. He knows your name before you give it, and he runs the same trick every fence past the strait pulls: two pieces of kit on the counter, take one, leave the other for good. You grab what you came for and try not to think too hard about who tipped him off.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout with the rest of your kit.",
      dropsNote: 'Pick one. Permanent, equippable, and you can\'t come back for the other.',
    },
  },
  {
    id: 'scout_debt',    type: 'story',
    label: 'A Sail in Your Lee',
    flavor: "You hold at the mouth of the Gullet and watch the fog. Whether a friendly sail comes out of it is down to the mercy you showed back past the danger line.",
    bridge: "Whatever answered your lee, the Gullet's throat is dead ahead now, and the captain who runs it is waiting at the bottom of it.",
    requiresNode: 'gullet_cache',
    image: '/krust_soldier.png',
    payoff: {
      requiresChoice: { nodeId: 'cartographer_reveal', choiceId: 'release' },
      grant: { doubloons: 1200, navXp: 750 },
      sceneUnmet: [
        { text: "You hold at the Gullet's mouth and watch the fog for a friendly sail." },
        { text: "None comes." },
        { text: "Out here you get back exactly what you gave, and you gave the cold water nothing." },
        { text: "Whatever's waiting down the throat, you'll meet it the way you came. Blind, and on your own keel." },
      ],
    },
    scene: [
      { text: "A cutter slides out of the fog and pulls in alongside you. No flag, but you know that hull." },
      { text: "The scouts you let go, way back past the danger line. Turns out the cold water remembers." },
      { speaker: 'A Freed Scout', portrait: '/krust_soldier.png', text: "We owe you a deck, captain. We pay what we owe." },
      { speaker: 'A Freed Scout', portrait: '/krust_soldier.png', text: "Every crew in the Gullet sails loaded. They've all got a shot in the pipe before the fight even starts." },
      { speaker: 'A Freed Scout', portrait: '/krust_soldier.png', text: "They'll hit you on the first bell, before a slow captain's even found his range. Go in ready to take one." },
      { text: "They hand across a strongbox and a folded chart, and slip back into the grey." },
      { text: "Richer, wiser, and not sailing in blind anymore. The mercy paid." },
    ],
    detail: {
      description:
        "You hold at the mouth of the Gullet and watch the fog. Out here a captain gets back exactly what he gave, no more. If you cut those scouts loose back past the danger line, the cold water remembers, and a sail comes out of the grey to settle the debt with coin, charts, and a warning worth more than both. If you didn't, the fog stays empty and you go in the way you came.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment VII", sublabel: "\"Out past the danger line, the only sail that comes back for you is one you let go.\"", rarity: 'uncommon' },
      ],
      dropsNote: 'A payoff for an old mercy: the scouts you spared sail back with coin, charts, and the only pre-fight intel in the game.',
      ctaLabel: 'Watch the Fog →',
      summary: "You held at the Gullet's mouth. What sailed out of the fog came down to the mercy you showed past the danger line, and the throat of the Gullet is dead ahead.",
    },
  },
  {
    // Chapter II's boss raid. Coming-soon stub: the freight-collector who runs
    // the Gullet (name TBD) and his crews, whose shared trait is opening LOADED
    // (one cannonball pre-chambered, so they can fire on the opening bell). Full
    // BossRaidConfig + art + balance land in a follow-up; the node ships now so
    // the bridge chain has a terminus. requiresNavLevel is the only gate in the
    // whole Gullet stretch.
    id: 'gullet_raid',    type: 'raid',
    label: "The Tollmaster's Cut",
    flavor: "Down in the throat waits Tollmaster Spet, the barracuda who weighs and stacks everything the sea swallows. His quickest hulls sail loaded, a shot in the pipe before you've found your range.",
    bridge: "Spet goes down and the Gullet drains dry. Three Finndicate captains on the seabed now, and the cold water past here answers to a don even Spet would not name.",
    requiresNode: 'scout_debt',
    requiresNavLevel: 35,
    route: '/raids/gullet',
    raidId: THE_TOLLMASTER.raidId,
    image: THE_TOLLMASTER.enemies.spet.portrait,
    detail: {
      description:
        "Tollmaster Spet, the freight-collector who runs the Gullet, and the barracuda crew that taxes the sea for him. His quickest hulls take the First Cut: they open loaded and fire on the bell before a slow captain finds his range, and Spet himself opens with two. The whole toll line runs a harder cadence than anything you've fought, all volleys and double-taps. Equip his own drop and you can take the first cut right back.",
      enemies: ['Silverdart ×2', 'Snapjaw ×2', 'Gulletmaw ×2', 'The Exactor ×2', 'Tollmaster Spet'],
      drops: lootDrops(THE_TOLLMASTER.loot),
      clearReward: clearPayout(THE_TOLLMASTER),
      dropsNote: 'One crate per Spet clear, rolled once and scaled by your Fortune. Every kill pays gold + Nav XP, and the run carries two Tide events between fights.',
    },
  },
  {
    id: 'gullet_raid_challenge',    type: 'raid',
    label: "Challenge: The Tollmaster's Cut",
    flavor: "The same loaded barracudas, drilled harder and angrier for the loss. Spet does not lose his cut twice.",
    requiresNode: 'gullet_raid',
    route: '/raids/gullet/challenge',
    raidId: THE_TOLLMASTER_CHALLENGE.raidId,
    sideBranch: { parentId: 'gullet_raid' },
    image: THE_TOLLMASTER.enemies.spet.portrait,
    detail: {
      description:
        "The Tollmaster's whole toll line again, harder for the loss. The barracudas hit cleaner, Spet's doubled opener bites deeper, and every hull still fires first. Crack his crate this run and his own Primer rolls at twice the rate.",
      enemies: ['Silverdart ×2', 'Snapjaw ×2', 'Gulletmaw ×2', 'The Exactor ×2', 'Tollmaster Spet'],
      drops: lootDrops(THE_TOLLMASTER_CHALLENGE.loot),
      clearReward: clearPayout(THE_TOLLMASTER_CHALLENGE),
      dropsNote: "Every kill pays more, the clear bonus is steeper, and the legendary Tollmaster's Primer rolls at double the normal rate.",
    },
  },
  {
    // Chapter II's closing class pick — mirrors chapter_1_class. Gated on the
    // boss (gullet_raid, Tollmaster Spet — live). Writes
    // profiles.ship_classes['sunken_hand'], stacking with the chapter I pick.
    id: 'chapter_2_class',    type: 'class_pick',
    label: "Captain's Choice",
    flavor: "Three Finndicate captains on the seabed and the Gullet drained dry. Time to decide what your name stands for on the deep water.",
    requiresNode: 'gullet_raid',
    classPick: { chapterId: 'sunken_hand' },
    detail: {
      description:
        "You read the Cartographer's seas, cracked the Gullet's cipher, and put its collector under. Pick a class for the deep water ahead. Once it's chosen it stays with you for every raid from here on, stacking with the captain you already are.",
      dropsNote: 'Deepen the class you already sail (a Mark II that stacks on top of it) or branch into a fresh one. Permanent, and the other options are gone for good.',
      ctaLabel: 'Pick a class',
    },
  },

  // ── CHAPTER III — The Coffers (raids 5 & 6) ──────────────────────────────
  // ADMIN-ONLY until tested: every node carries adminOnly: true. The two raids
  // ship as comingSoon stubs until their BossRaidConfigs land (step 3), so the
  // chain reads end-to-end but stays gated behind the unbuilt bosses. Story
  // spine: the Quartermaster's Cache (the shop you've bought from since Ch I) is
  // revealed a Finndicate front, and names Don Finleone — the Ch IV hook.
  {
    id: 'coffers_heading',    type: 'story',
    label: 'Where the Coin Sleeps',
    flavor: "Spet weighed everything the Gullet swallowed, but he never kept it. His manifests all point the same way, to a harbor with no name on any honest chart.",
    bridge: "You have the name now: the Coffers, where every coin the sea swallowed surfaces again in the wrong hands. The only ways in are a blockade or a bribe.",
    requiresNode: 'chapter_2_class',
    adminOnly: true,
    image: '/raidlog.png',
    scene: [
      { text: "Tollmaster Spet weighed every crate the Gullet swallowed. He never kept a coin of it." },
      { text: "His manifests all point past the throat, to a harbor no honest chart will name." },
      { text: "A drowned market, they say, where the whole sea's plunder gets counted and sold twice over." },
      { text: "The crews who've seen it call it the Coffers." },
      { text: "Everything the Finndicate ever took off the weak is stacked down there, behind a wall of guns." },
      { text: "And somewhere in that market is the hand that's been counting it all." },
    ],
    detail: {
      description:
        "Every manifest off Spet's deck points the same way: past the Gullet to a harbor the honest charts leave blank, a drowned black market where the whole sea's plunder gets counted and sold again. The crews call it the Coffers. Whatever the Finndicate has taken off the weak for years is stacked down there behind a wall of guns, and the hand that's been counting it is somewhere in the stalls.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment VIII", sublabel: "\"They don't spend the plunder. They shelve it, and sell it back to the next captain coming up.\"", rarity: 'uncommon' },
      ],
      dropsNote: 'A market with a name at last, and two ways through its door.',
      ctaLabel: 'Read the Manifests →',
      summary: "Spet's manifests led you to the Coffers, the Finndicate's drowned market where the whole sea's plunder is counted and sold twice. The way in is a blockade or a bribe.",
    },
  },
  {
    // Was a branching `fork`. Reworked into a coin-or-skill `dps_check`: bribe
    // your way in (pay 10k), or run the blockade — one cannon shot at the boom
    // chain. Land a big enough hit and you punch through free; fall short and
    // you limp in under fire, owing 20k in repairs. Node id kept so the
    // downstream chain (coffers_lens.requiresNode) is untouched.
    id: 'coffers_fork',    type: 'dps_check',
    label: 'Run the Blockade',
    flavor: "The harbor mouth is barred by a boom chain and a gun-line. Bribe the dockmaster to raise it quiet, or blow the chain yourself with a single well-placed broadside.",
    bridge: "The chain gives way and the boom drops into the water. You're inside the Coffers now, and the market's war-fleet is already turning to meet you.",
    requiresNode: 'coffers_heading',
    adminOnly: true,
    image: '/raidlog.png',
    dpsCheck: {
      threshold: 60,
      payCost: 10000,
      failCost: 20000,
      barSpeed: 1.7,
    },
    detail: {
      description:
        "The Coffers sit behind a boom chain and a wall of guns. Grease the dockmaster and he raises the chain quiet, no fight, for a price. Or run the blockade: one broadside at the chain's anchor-ring, and if your guns hit hard enough you punch straight through free. Miss the mark and you limp in under the gun-line, owing the market a small fortune in repairs. One shot, no crew tricks. Make it count.",
      dropsNote: 'Pay 10,000 to slip in quiet, or take one shot at the chain. Land a hard enough hit and you pass free; fall short and it costs you 20,000 in repairs.',
      ctaLabel: 'Run the Blockade',
    },
  },
  {
    id: 'coffers_lens',    type: 'puzzle',
    label: 'The Signal Maze',
    flavor: "The way past the harbor wall is to light the smugglers' own signal-lens, and the lantern that feeds it fires its beam through a maze of mirrors the market keeps deliberately crooked.",
    bridge: "The lens flares green and the boom-chain drops into the water. The harbor fleet is dead ahead now.",
    requiresNode: 'coffers_fork',
    adminOnly: true,
    puzzle: {
      kind: 'mirror',
      rewardNavXp: 650,
      mirror: {
        // 9x9, a PRISM splits the trunk into two arms; 3 lenses (trunk + one per
        // arm) must ALL light. Solution: (0,0)r -> (3,0)\\ down [lens 3,2] ->
        //   (3,5) PRISM. RIGHT arm: right -> (6,5)/ up -> (6,1)\\ left [lens 4,1].
        //   LEFT arm: left -> (1,5)/ down -> (1,7)\\ right [lens 3,7].
        //   FIVE required mirrors (unique solve); (5,7)/(7,3) are decoys.
        //   Branching tree = can't trace at a glance. Verified via verify-mirror.mjs.
        cols: 9, rows: 9,
        source: { x: 0, y: 0, dir: 'right' },
        targets: [{ x: 3, y: 2 }, { x: 4, y: 1 }, { x: 3, y: 7 }],
        prisms: [{ x: 3, y: 5 }],
        walls: [{ x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 0 }],
        fireBudget: 6,
        mirrors: [
          { x: 3, y: 0, init: '/' },
          { x: 6, y: 5, init: '\\' },
          { x: 6, y: 1, init: '/' },
          { x: 1, y: 5, init: '\\' },
          { x: 1, y: 7, init: '/' },
          { x: 5, y: 7, init: '/' },
          { x: 7, y: 3, init: '/' },
        ],
      },
      reveal:
        "The beam lands true on the lens and the whole signal flares green. Out past the wall, the harbor boom-chain groans down into the water.\n\nThe way in is open. The fleet is waiting.",
    },
    detail: {
      description:
        "The market keeps its harbor-lantern fed through a maze of mirror-tiles set deliberately crooked, so no stranger can light the signal that drops the boom-chain. Turn the mirrors to bend the lantern's beam around the pillars and through every signal-lens at once.",
      drops: [
        { emoji: '🧭', label: '650 Nav XP', sublabel: 'Lighting the signal sharpens your navigation. No coin in it, just the way through.', rarity: 'rare' },
      ],
      dropsNote: 'Plan one beam path through all three lenses, then fire. You get a limited number of fires before the mirrors reset. One-time, no cost, no fight.',
    },
  },
  {
    // The LAST Quartermaster's Cache — a rig choice (masts vs sails) right before
    // the fleet fight, and the final "friendly" stop before the betrayal at
    // quartermaster_turn. The keeper's a touch too glad to see you, seeding it.
    // Reuses the generic `choice` node + claimQuartermasterChoice action.
    id: 'coffers_cache',
    type: 'shop',
    label: 'The Last Cache',
    flavor: "The Quartermaster's Cache keeps a stall even here, deep in the Coffers. The keeper waves you over, all smiles, and lays out two cuts of rigging. Take one.",
    bridge: "New rig lashed on, and the market's war-fleet dead ahead. Whatever the keeper's grinning about, it'll keep till the guns are quiet.",
    requiresNode: 'coffers_lens',
    adminOnly: true,
    choice: { items: ['crows_nest_rigging', 'trade_wind_sails'] },
    detail: {
      description:
        "Even here, in the drowned heart of the market, the Quartermaster's Cache keeps a stall — the same shady supplier that's kitted you out since the coast. The keeper's all smiles today, a shade too glad to see you. He lays two cuts of ship's rigging on the counter: a crow's-nest set that sharpens your eye, or trade-wind canvas that keeps your guns fed. Pick one. The other rolls back under the counter.\n\nWhatever you take is yours to keep, ready to equip in your raid loadout.",
      dropsNote: 'Pick one rig. Permanent, equippable, and you can\'t come back for the other.',
    },
  },
  {
    // Quartermaster foreshadow — a short character beat between the last Cache
    // and the fleet fight. The keeper is too glad, too knowing, and lets slip
    // that flying his goods "counts for something" without saying to whom. Plants
    // the betrayal that lands for real at quartermaster_turn (after Raid 5).
    id: 'coffers_keeper',
    type: 'story',
    label: "The Keeper's Smile",
    flavor: "The keeper's a shade too glad to see you, and a shade too sure of your picks. He talks like he already knows how your run ends.",
    bridge: "The war-fleet turns to meet you. Whatever the keeper meant by it, you'll puzzle it out on the far side of the guns.",
    requiresNode: 'coffers_cache',
    adminOnly: true,
    image: '/raidlog.png',
    scene: [
      { text: "You lash the new rig on while the keeper watches from behind the counter, in no hurry at all." },
      { speaker: 'The Keeper', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "Good pick. I'd have steered you to it myself. I usually do." },
      { speaker: 'The Keeper', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "Every captain who washes up in the Coffers, I get them kitted just so. Then I watch how they sail." },
      { text: "He says it easy, like he's already read the last page of a log you're only halfway through writing." },
      { speaker: 'The Keeper', portrait: THE_QUARTERMASTER.enemies.quartermaster.portrait, text: "That admiral out past the wall has never lost his boom chain. But you're flying my goods now. That counts for something." },
      { text: "You almost ask him which side that counts for. Then the war-fleet comes about, and the guns don't wait on questions." },
      { text: "You fold the unease away for later. There'll be time to name it once the fleet's on the harbor floor." },
    ],
    detail: {
      description:
        "You re-arm at the Cache one last time, and the keeper is friendlier than any fair trade explains. He talks like he's outfitted every captain in these waters and watched them all sail into the same net, and he lets slip that flying his goods counts for something without ever saying to whom. It sits wrong. But the market's war-fleet is already turning to meet you, and the unease will keep.",
      drops: [
        { emoji: '📜', label: 'Overheard at the Counter', sublabel: "\"You're flying my goods now, captain. That counts for something.\"", rarity: 'uncommon' },
      ],
      dropsNote: 'A last word from the keeper before the fleet. Whatever he meant, it waits till the guns are quiet.',
      ctaLabel: 'Meet the Fleet →',
      summary: "At the last Cache the keeper was too glad to see you and too sure of your picks, letting slip that flying his goods counts for something. You filed the unease away and turned to face the market's war-fleet.",
    },
  },
  {
    // Raid 5. The escort-fleet admiral guarding the Coffers — the player's first
    // capital-ship fight (Galleon-tier). Signature: Decoys (false crit bands) +
    // the admiral's phase 2 + tier-2 tides. LIVE config (THE_COFFERS_FLEET), but
    // adminOnly until tested AND the route page guards is_admin. Names/art are
    // placeholders pending step 4.
    id: 'coffers_fleet',    type: 'raid',
    label: 'The Harbor Fleet',
    flavor: "The market keeps a war-fleet, and an admiral who's never lost a hull. His gunners run false colours on every shot, so you never know which gun is the one that's loaded.",
    bridge: "The admiral's fleet is wreckage on the harbor floor, and the way to the market's heart is open. The last push is on the keeper himself now.",
    requiresNode: 'coffers_keeper',
    requiresNavLevel: 40,
    adminOnly: true,
    route: '/raids/coffers-fleet',
    raidId: THE_COFFERS_FLEET.raidId,
    image: THE_COFFERS_FLEET.enemies.admiral.portrait,
    detail: {
      description:
        "The Coffers' war-fleet, and the admiral who has never lost a ship. His crews fight under false colours: decoy gun-bands strewn across your aim so you can't tell the live shot from the feint. The biggest hulls you've faced yet, and the admiral rises again when you think you've sunk him.",
      enemies: ['Feint ×2', 'Sham ×2', 'Bulwark ×2', 'Mirage ×2', 'Admiral Ruse'],
      drops: lootDrops(THE_COFFERS_FLEET.loot),
      clearReward: clearPayout(THE_COFFERS_FLEET),
      dropsNote: 'One crate per clear, rolled once and scaled by your Fortune. Every kill pays gold + Nav XP, and the run carries two stronger Tide events between fights.',
    },
  },
  {
    id: 'coffers_fleet_challenge',    type: 'raid',
    label: 'Challenge: The Harbor Fleet',
    flavor: "The same fleet, drilled harder and flying meaner colours. The admiral does not lose his wall twice.",
    requiresNode: 'coffers_fleet',
    adminOnly: true,
    route: '/raids/coffers-fleet/challenge',
    raidId: THE_COFFERS_FLEET_CHALLENGE.raidId,
    sideBranch: { parentId: 'coffers_fleet' },
    image: THE_COFFERS_FLEET.enemies.admiral.portrait,
    detail: {
      description:
        "The harbor fleet again, harder for the loss. More HP, sharper guns, the same wall of false colours, and the admiral's phase 2 bites deeper. The chase rewards roll richer for the trouble.",
      enemies: ['Feint ×2', 'Sham ×2', 'Bulwark ×2', 'Mirage ×2', 'Admiral Ruse'],
      drops: lootDrops(THE_COFFERS_FLEET_CHALLENGE.loot),
      clearReward: clearPayout(THE_COFFERS_FLEET_CHALLENGE),
      dropsNote: 'Every kill pays more and the clear bonus is steeper than the normal run.',
    },
  },
  {
    id: 'quartermaster_turn',    type: 'story',
    label: 'The Cache Turns',
    flavor: "You put in at the Quartermaster's Cache to re-arm, the same shady stall that's kitted you out since the coast. This time the keeper's smiling, and the guns behind the counter are pointed your way.",
    bridge: "The Cache was theirs the whole time. Every blade they sold you was a leash, and the keeper answers to a name you've not heard yet: Don Finleone.",
    requiresNode: 'coffers_fleet',
    adminOnly: true,
    image: '/raidlog.png',
    scene: [
      { text: "You put in at the Quartermaster's Cache to re-arm. Same stall that's kitted you out since the coast." },
      { speaker: 'The Quartermaster', text: "Captain. Knew you'd wash up here eventually. They all do." },
      { speaker: 'The Quartermaster', text: "Every hook, every cannon, every clever little trick. You bought it all off me." },
      { speaker: 'The Quartermaster', text: "The Cache was never neutral, captain. There's no such thing out here." },
      { text: "The guns behind the counter swing your way. The shelves you've trusted since the coast were Finndicate all along." },
      { speaker: 'The Quartermaster', text: "I armed you because they let me. And whatever I sold you, I can take back." },
    ],
    detail: {
      description:
        "The Quartermaster's Cache, the shady stall that's armed you since the coast, sits in the heart of the Coffers, and the keeper's been expecting you. It was a Finndicate front the whole time. Every piece of kit you bought was a leash, and the merchant who sold it can yank it back. He answers to the don who runs the market, the first time you hear the name: Don Finleone.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment IX", sublabel: "\"The man who arms you and the man who hunts you were always the same man.\"", rarity: 'rare' },
      ],
      dropsNote: 'The betrayal at the heart of the Coffers: the shop was theirs, and it names the don above it.',
      ctaLabel: 'Face the Keeper →',
      summary: "The Quartermaster's Cache, the stall that armed you since the coast, was a Finndicate front all along. The keeper turned his guns on you, and named the don he answers to: Don Finleone.",
    },
  },
  {
    id: 'coffers_vault_lens',    type: 'puzzle',
    label: 'The Vault Beam',
    flavor: "The Quartermaster's strongroom answers to a lock of light: a sunbeam channelled down through the market's roof, off a row of mirrors he can crook from behind his counter. Straighten them and the vault opens.",
    bridge: "The beam strikes the vault-eye and the strongroom bars grind back. The keeper is cornered behind them now.",
    requiresNode: 'quartermaster_turn',
    adminOnly: true,
    puzzle: {
      kind: 'mirror',
      rewardNavXp: 750,
      mirror: {
        // 10x10, the chapter's hardest — a PRISM splits the trunk into two arms;
        // 3 lenses (trunk + one per arm) must ALL light. Solution: (0,0)r ->
        //   (4,0)\\ down [lens 4,2] -> (4,6) PRISM. RIGHT arm: right -> (7,6)/ up
        //   -> (7,2)\\ left [lens 5,2]. LEFT arm: left -> (1,6)/ down -> (1,8)\\
        //   right [lens 4,8]. FIVE required mirrors (unique solve); (6,8)/(8,4)
        //   are decoys. Branching tree = can't trace at a glance. Verified.
        cols: 10, rows: 10,
        source: { x: 0, y: 0, dir: 'right' },
        targets: [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 8 }],
        prisms: [{ x: 4, y: 6 }],
        walls: [{ x: 9, y: 0 }, { x: 0, y: 9 }, { x: 9, y: 9 }, { x: 8, y: 0 }],
        fireBudget: 7,
        mirrors: [
          { x: 4, y: 0, init: '/' },
          { x: 7, y: 6, init: '\\' },
          { x: 7, y: 2, init: '/' },
          { x: 1, y: 6, init: '\\' },
          { x: 1, y: 8, init: '/' },
          { x: 6, y: 8, init: '/' },
          { x: 8, y: 4, init: '/' },
        ],
      },
      reveal:
        "The beam threads the last mirror and strikes the vault-eye dead centre. Deep in the iron, the strongroom bars grind back.\n\nThe Quartermaster's behind them, cornered, with nowhere left to run.",
    },
    detail: {
      description:
        "The Quartermaster bars his strongroom behind a lock of light, a sunbeam bent down through a row of mirrors he keeps crooked from behind his counter. Turn the mirrors to thread the beam through all three vault-eyes at once and the bars slide back.",
      drops: [
        { emoji: '🧭', label: '750 Nav XP', sublabel: "Picking the keeper's light-lock sharpens your navigation. No coin, just the way in.", rarity: 'rare' },
      ],
      dropsNote: 'Plan one beam path through all three lenses, then fire. You get a limited number of fires before the mirrors reset. One-time, no cost, no fight.',
    },
  },
  {
    // Raid 6 — the chapter finale. The Quartermaster (Galleon-tier). Signature:
    // Repossession (reclaims one equipped raid item at fight start) + a phase 2 +
    // tier-2 tides. LIVE config (THE_QUARTERMASTER), adminOnly until tested AND
    // the route page guards is_admin. Names/art placeholders pending step 4.
    id: 'the_quartermaster',    type: 'raid',
    label: 'The Quartermaster',
    flavor: "The keeper of the Cache fights the way he sells: he opens by taking back a piece of your own kit, then makes you buy your life off him one shot at a time.",
    bridge: "The Quartermaster goes down under his own counter and the Cache's hold falls open, ledgers and all. Every debt in them runs up to one name.",
    requiresNode: 'coffers_vault_lens',
    requiresNavLevel: 48,
    adminOnly: true,
    route: '/raids/quartermaster',
    raidId: THE_QUARTERMASTER.raidId,
    image: THE_QUARTERMASTER.enemies.quartermaster.portrait,
    detail: {
      description:
        "The Quartermaster himself, behind the guns of the market he runs. He fights the way he trades, all misdirection: he floods the bay with false flares to foul your aim, and slips live shells in among them that you'll regret swatting. Read the real targets, intercept the rest, then put him under, through his reserve deck and all, to spill the Cache's hold.",
      enemies: ['Tally ×2', 'Ledger ×2', 'Strongbox ×2', 'Collector ×2', 'The Quartermaster'],
      drops: lootDrops(THE_QUARTERMASTER.loot),
      clearReward: clearPayout(THE_QUARTERMASTER),
      dropsNote: 'One crate per clear, rolled once and scaled by your Fortune. He opens by reclaiming one of your equipped raid items for the whole fight. Two stronger Tide events between fights.',
    },
  },
  {
    id: 'the_quartermaster_challenge',    type: 'raid',
    label: 'Challenge: The Quartermaster',
    flavor: "The keeper again, angrier for the loss, and he reclaims more than you can spare. He does not get robbed twice.",
    requiresNode: 'the_quartermaster',
    adminOnly: true,
    route: '/raids/quartermaster/challenge',
    raidId: THE_QUARTERMASTER_CHALLENGE.raidId,
    sideBranch: { parentId: 'the_quartermaster' },
    image: THE_QUARTERMASTER.enemies.quartermaster.portrait,
    detail: {
      description:
        "The Quartermaster's finale again, harder for the loss. More HP, sharper guns, the same opening theft and the same reserve-deck phase 2, all of it meaner. The chase rewards roll richer.",
      enemies: ['Tally ×2', 'Ledger ×2', 'Strongbox ×2', 'Collector ×2', 'The Quartermaster'],
      drops: lootDrops(THE_QUARTERMASTER_CHALLENGE.loot),
      clearReward: clearPayout(THE_QUARTERMASTER_CHALLENGE),
      dropsNote: 'Every kill pays more and the clear bonus is steeper than the normal run.',
    },
  },
  {
    id: 'finleone_named',    type: 'story',
    label: 'The Name Above the Counter',
    flavor: "The Quartermaster's strongbox spills its ledgers, and every page settles a debt up to one signature. A hammerhead don who runs the Coffers and everything that feeds them: Don Finleone.",
    bridge: "You have the don's name now. Finleone runs the Coffers, the Caches, the whole drowned market. Chapter's end, and the deepest water is the last that's left.",
    requiresNode: 'the_quartermaster',
    adminOnly: true,
    image: '/raidlog.png',
    scene: [
      { text: "The Quartermaster's strongbox cracks, and the ledgers spill across the deck." },
      { text: "Every page settles the same way, every debt running up to one signature." },
      { text: "A hammerhead don who runs the Coffers and every Cache that feeds them." },
      { text: "Don Finleone. The head of the Finndicate, as far as any ledger knows." },
      { text: "Three captains under the water, a market in ruins, and now a name at the top of it." },
      { text: "Whatever waits past the Coffers answers to him. And so, soon, will you." },
    ],
    detail: {
      description:
        "The Quartermaster's strongbox spills its ledgers, and every page runs up to one signature: Don Finleone, a hammerhead crime-don who runs the Coffers and every Cache that feeds them. As far as any ledger in the market knows, he is the head of the Finndicate. You have the name at the top now, and the only water left to chase him into is the deepest there is.",
      drops: [
        { emoji: '📜', label: "Captain's Logbook, Fragment X", sublabel: "\"Every debt in the market runs up to one name. Finleone. The head of the whole Hand.\"", rarity: 'rare' },
      ],
      dropsNote: 'The don at the top of the Coffers, named at last. The chapter closes on his shadow.',
      ctaLabel: 'Read the Ledgers →',
      summary: "The Quartermaster's ledgers all ran up to one name: Don Finleone, the hammerhead don who runs the Coffers and the whole Finndicate. The chapter closes with the don named and the deep water ahead.",
    },
  },
  {
    // Chapter III's closing class pick. Gated on the Quartermaster (the boss).
    // Writes profiles.ship_classes['the_coffers'], stacking with chapters I + II.
    id: 'chapter_3_class',    type: 'class_pick',
    label: "Captain's Choice",
    flavor: "The Coffers in ruins, the Quartermaster under, and a don's name at the top of every ledger. Time to set what your colours mean before the deepest water.",
    requiresNode: 'the_quartermaster',
    adminOnly: true,
    classPick: { chapterId: 'the_coffers' },
    detail: {
      description:
        "You ran the harbor wall, faced the market's fleet, and put the Quartermaster under his own counter. Pick a class for the deep water where Finleone waits. It stays with you for every raid from here on, stacking with the captain you already are.",
      dropsNote: 'Deepen the class you already sail or branch into a fresh one. Permanent, and the other options are gone for good.',
      ctaLabel: 'Pick a class',
    },
  },
  // The Davy Jones Gauntlet used to sit here as a chapter-2 side branch.
  // It's now a permanent top-level entry point — the "Gauntlets" hub card
  // on the Expeditions page (HubCards.tsx) — so it no longer lives in the
  // story map. The /raids/gauntlet route + its server actions are unchanged.
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
  isAdmin = false,
): RaidNodeView[] {
  // adminOnly nodes are hidden entirely for non-admins (the chain just ends
  // before them) while content is in review.
  return RAID_MAP.filter(node => isAdmin || !node.adminOnly).map(node => {
    if (cleared.has(node.id)) {
      return { node, status: 'cleared' as const, claimable: false }
    }
    // Coming-soon takes precedence over normal lock-reason resolution
    // — the node is intentionally inaccessible while content lands,
    // not blocked by player progression. Stays locked even when the
    // player has met every prereq + Nav requirement.
    if (node.comingSoon) {
      return { node, status: 'locked' as const, claimable: false, lockReason: 'Coming soon' }
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
